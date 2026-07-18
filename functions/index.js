const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Stripe = require("stripe");

admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

function planFromSubscription(subscription) {
  const price = subscription.items.data[0] && subscription.items.data[0].price;
  const intervalCount = price && price.recurring && price.recurring.interval_count;
  return intervalCount === 12 ? "annual" : "standard";
}

async function upsertSubscriber(email, data) {
  if (!email) {
    logger.warn("No email on Stripe object, skipping Firestore write");
    return;
  }
  const docId = email.trim().toLowerCase();
  await db.collection("subscribers").doc(docId).set(
    {
      email: docId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      ...data,
    },
    { merge: true }
  );
  logger.info(`Updated subscriber ${docId}`, data);
}

exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], region: "asia-northeast1" },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      logger.error("Webhook signature verification failed", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          if (session.mode !== "subscription") break;
          const email = session.customer_details && session.customer_details.email;
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await upsertSubscriber(email, {
            status: subscription.status,
            plan: planFromSubscription(subscription),
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: subscription.current_period_end,
          });
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object;
          const customer = await stripe.customers.retrieve(subscription.customer);
          await upsertSubscriber(customer.email, {
            status: subscription.status,
            plan: planFromSubscription(subscription),
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            currentPeriodEnd: subscription.current_period_end,
          });
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          const customer = await stripe.customers.retrieve(subscription.customer);
          await upsertSubscriber(customer.email, {
            status: "canceled",
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
          });
          break;
        }

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }
      res.status(200).send("ok");
    } catch (err) {
      logger.error("Error handling webhook event", err);
      res.status(500).send("Internal error");
    }
  }
);
