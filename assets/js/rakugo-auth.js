/* AI Rakugo — shared Firebase Auth widget + paywall gate.
   Requires firebase-app-compat.js, firebase-auth-compat.js, firebase-firestore-compat.js
   to be loaded on the page before this file. */
(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyB2btEpWUquKWz7CFXUWcBYFUtSf0IFR6M",
    authDomain: "airakugo-f054f.firebaseapp.com",
    projectId: "airakugo-f054f",
    storageBucket: "airakugo-f054f.firebasestorage.app",
    messagingSenderId: "381484224266",
    appId: "1:381484224266:web:9292a662fdb591690c34f3",
  };

  if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const auth = firebase.auth();
  const db = firebase.firestore();
  const ACTIVE_STATUSES = ["active", "trialing"];

  function injectStyles() {
    if (document.getElementById("ra-styles")) return;
    const style = document.createElement("style");
    style.id = "ra-styles";
    style.textContent = `
      .ra-widget-li { list-style:none; display:flex; align-items:center; gap:8px; }
      .ra-btn-login { background:#c0392b; color:#fff; border:none; padding:8px 16px; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; font-family:inherit; }
      .ra-btn-login:hover { background:#922b21; }
      .ra-chip { display:flex; align-items:center; gap:8px; font-size:13px; }
      .ra-chip-email { color:inherit; opacity:0.75; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .ra-chip-logout { background:transparent; border:1px solid currentColor; opacity:0.7; color:inherit; padding:5px 10px; border-radius:6px; font-size:12px; cursor:pointer; font-family:inherit; }
      .ra-chip-logout:hover { opacity:1; }
      .ra-backdrop { position:fixed; inset:0; background:rgba(20,15,12,0.55); display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px; }
      .ra-backdrop.ra-hidden { display:none; }
      .ra-modal { background:#fff; border-radius:16px; padding:32px; width:100%; max-width:380px; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.3); font-family:'Hiragino Sans','Yu Gothic',sans-serif; color:#2b2320; }
      .ra-close { position:absolute; top:14px; right:16px; background:none; border:none; font-size:22px; line-height:1; cursor:pointer; color:#999; }
      .ra-tabs { display:flex; gap:8px; margin-bottom:20px; border-bottom:1px solid #eee; }
      .ra-tab { flex:1; background:none; border:none; padding:10px; font-size:14px; font-weight:700; color:#aaa; cursor:pointer; border-bottom:2px solid transparent; font-family:inherit; }
      .ra-tab.active { color:#c0392b; border-bottom-color:#c0392b; }
      .ra-error { background:#fdecea; color:#c0392b; font-size:12.5px; padding:10px 12px; border-radius:8px; margin-bottom:14px; line-height:1.5; }
      .ra-error.ra-info { background:#eaf3fc; color:#1a5490; }
      .ra-label { display:block; font-size:12px; font-weight:700; color:#777; margin:14px 0 5px; }
      .ra-input { width:100%; padding:10px 12px; border:1px solid #ddd; border-radius:8px; font-size:14px; box-sizing:border-box; font-family:inherit; }
      .ra-input:focus { outline:none; border-color:#c0392b; }
      .ra-submit { width:100%; background:#c0392b; color:#fff; border:none; padding:12px; border-radius:8px; font-size:14px; font-weight:700; cursor:pointer; margin-top:18px; font-family:inherit; }
      .ra-submit:hover { background:#922b21; }
      .ra-submit:disabled { opacity:0.6; cursor:default; }
      .ra-forgot { display:block; margin:12px auto 0; background:none; border:none; color:#999; font-size:12px; text-decoration:underline; cursor:pointer; font-family:inherit; }
      .ra-divider { display:flex; align-items:center; gap:10px; margin:20px 0; color:#bbb; font-size:12px; }
      .ra-divider::before, .ra-divider::after { content:""; flex:1; height:1px; background:#eee; }
      .ra-google { width:100%; display:flex; align-items:center; justify-content:center; gap:10px; background:#fff; border:1px solid #ddd; padding:11px; border-radius:8px; font-size:13.5px; font-weight:600; cursor:pointer; color:#333; font-family:inherit; }
      .ra-google:hover { background:#f7f7f7; }
      .ra-google-g { width:18px; height:18px; border-radius:50%; background:conic-gradient(#4285F4 0 25%, #34A853 25% 50%, #FBBC05 50% 75%, #EA4335 75% 100%); flex-shrink:0; }
      .ra-en-hint { font-size:11px; color:#bbb; text-align:center; margin-top:18px; line-height:1.5; }
      .ra-gate { position:fixed; inset:0; background:rgba(250,248,246,0.97); backdrop-filter:blur(3px); display:flex; align-items:center; justify-content:center; z-index:500; padding:20px; }
      .ra-gate-card { max-width:420px; text-align:center; background:#fff; border-radius:18px; padding:40px 32px; box-shadow:0 10px 40px rgba(0,0,0,0.12); font-family:'Hiragino Sans','Yu Gothic',sans-serif; }
      .ra-gate-icon { font-size:34px; margin-bottom:14px; }
      .ra-gate-msg { font-size:15px; color:#3a322d; line-height:1.7; margin-bottom:22px; }
      .ra-gate-en { font-size:12px; color:#aaa; }
      .ra-gate-actions { display:flex; flex-direction:column; gap:10px; }
      .ra-gate-actions .ra-submit { margin-top:0; }
      .ra-gate-link { color:#c0392b; font-size:13px; font-weight:600; text-decoration:none; background:none; border:none; cursor:pointer; font-family:inherit; padding:6px; }
      .ra-gate-link:hover { text-decoration:underline; }
    `;
    document.head.appendChild(style);
  }

  function friendlyError(err) {
    const map = {
      "auth/email-already-in-use": "このメールアドレスは既に登録されています。",
      "auth/invalid-email": "メールアドレスの形式が正しくありません。",
      "auth/weak-password": "パスワードは6文字以上にしてください。",
      "auth/user-not-found": "メールアドレスまたはパスワードが違います。",
      "auth/wrong-password": "メールアドレスまたはパスワードが違います。",
      "auth/invalid-credential": "メールアドレスまたはパスワードが違います。",
      "auth/too-many-requests": "試行回数が多すぎます。しばらくしてからお試しください。",
      "auth/popup-closed-by-user": "ログインがキャンセルされました。",
      "auth/missing-email": "メールアドレスを入力してください。",
    };
    return map[err.code] || "エラーが発生しました：" + err.message;
  }

  let modalEl = null;
  let mode = "signin";

  function buildModal() {
    if (modalEl) return modalEl;
    modalEl = document.createElement("div");
    modalEl.id = "ra-backdrop";
    modalEl.className = "ra-backdrop ra-hidden";
    modalEl.innerHTML =
      '<div class="ra-modal">' +
      '<button class="ra-close" id="ra-close-btn">×</button>' +
      '<div class="ra-tabs">' +
      '<button class="ra-tab active" id="ra-tab-signin">ログイン</button>' +
      '<button class="ra-tab" id="ra-tab-signup">新規登録</button>' +
      "</div>" +
      '<div id="ra-error" class="ra-error" style="display:none;"></div>' +
      '<form id="ra-form">' +
      '<label class="ra-label">メールアドレス</label>' +
      '<input type="email" id="ra-email" class="ra-input" required autocomplete="email">' +
      '<label class="ra-label">パスワード</label>' +
      '<input type="password" id="ra-password" class="ra-input" required autocomplete="current-password" minlength="6">' +
      '<button type="submit" class="ra-submit" id="ra-submit-btn">ログイン</button>' +
      "</form>" +
      '<button class="ra-forgot" id="ra-forgot-btn">パスワードをお忘れですか？</button>' +
      '<div class="ra-divider"><span>または</span></div>' +
      '<button class="ra-google" id="ra-google-btn"><span class="ra-google-g"></span>Googleで続ける</button>' +
      '<p class="ra-en-hint">EN: Sign in or create an account to access member-only pieces.</p>' +
      "</div>";
    document.body.appendChild(modalEl);

    document.getElementById("ra-close-btn").onclick = closeModal;
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) closeModal();
    });
    document.getElementById("ra-tab-signin").onclick = () => setMode("signin");
    document.getElementById("ra-tab-signup").onclick = () => setMode("signup");
    document.getElementById("ra-form").onsubmit = handleSubmit;
    document.getElementById("ra-google-btn").onclick = handleGoogle;
    document.getElementById("ra-forgot-btn").onclick = handleForgot;

    return modalEl;
  }

  function setMode(m) {
    mode = m;
    document.getElementById("ra-tab-signin").classList.toggle("active", m === "signin");
    document.getElementById("ra-tab-signup").classList.toggle("active", m === "signup");
    document.getElementById("ra-submit-btn").textContent = m === "signin" ? "ログイン" : "登録する";
    showError(null);
  }

  function showError(msg, isInfo) {
    const el = document.getElementById("ra-error");
    if (!msg) {
      el.style.display = "none";
      el.textContent = "";
      el.classList.remove("ra-info");
    } else {
      el.style.display = "block";
      el.textContent = msg;
      el.classList.toggle("ra-info", !!isInfo);
    }
  }

  function openModal(opts) {
    opts = opts && opts.message !== undefined ? opts : {};
    buildModal();
    setMode("signin");
    modalEl.classList.remove("ra-hidden");
    if (opts.message) showError(opts.message, true);
  }

  function closeModal() {
    if (modalEl) modalEl.classList.add("ra-hidden");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    showError(null);
    const email = document.getElementById("ra-email").value.trim();
    const password = document.getElementById("ra-password").value;
    const btn = document.getElementById("ra-submit-btn");
    btn.disabled = true;
    try {
      if (mode === "signin") {
        await auth.signInWithEmailAndPassword(email, password);
      } else {
        await auth.createUserWithEmailAndPassword(email, password);
      }
      closeModal();
    } catch (err) {
      showError(friendlyError(err));
    } finally {
      btn.disabled = false;
    }
  }

  async function handleGoogle() {
    showError(null);
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      await auth.signInWithPopup(provider);
      closeModal();
    } catch (err) {
      showError(friendlyError(err));
    }
  }

  async function handleForgot() {
    const email = document.getElementById("ra-email").value.trim();
    if (!email) {
      showError("パスワード再設定にはメールアドレスの入力が必要です。");
      return;
    }
    try {
      await auth.sendPasswordResetEmail(email);
      showError("再設定用のメールを送信しました。受信箱をご確認ください。");
    } catch (err) {
      showError(friendlyError(err));
    }
  }

  function mountWidget(container) {
    if (!container) return;
    injectStyles();
    const li = document.createElement("li");
    li.className = "ra-widget-li";
    container.appendChild(li);

    auth.onAuthStateChanged((user) => {
      if (user) {
        li.innerHTML =
          '<span class="ra-chip"><span class="ra-chip-email">' +
          escapeHtml(user.email || "") +
          '</span><button class="ra-chip-logout" id="ra-logout-btn">ログアウト</button></span>';
        document.getElementById("ra-logout-btn").onclick = () => auth.signOut();
      } else {
        li.innerHTML = '<button class="ra-btn-login" id="ra-login-btn">ログイン</button>';
        document.getElementById("ra-login-btn").onclick = openModal;
      }
    });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function requireSubscription(opts) {
    opts = opts || {};
    const mainEl = document.querySelector(opts.mainSelector || "main");
    const pricingHref = opts.pricingHref || "../../index.html#pricing";
    if (!mainEl) return;
    injectStyles();
    mainEl.style.visibility = "hidden";

    const overlay = document.createElement("div");
    overlay.className = "ra-gate";
    overlay.innerHTML =
      '<div class="ra-gate-card">' +
      '<div class="ra-gate-icon">🔒</div>' +
      '<div id="ra-gate-msg" class="ra-gate-msg">確認中...</div>' +
      '<div id="ra-gate-actions" class="ra-gate-actions"></div>' +
      "</div>";
    document.body.appendChild(overlay);

    const msgEl = document.getElementById("ra-gate-msg");
    const actionsEl = document.getElementById("ra-gate-actions");

    function showLoggedOut() {
      msgEl.innerHTML =
        "この演目は有料会員限定です。<br><span class=\"ra-gate-en\">This piece is for paid members only.</span>";
      actionsEl.innerHTML =
        '<button class="ra-submit" id="ra-gate-login">ログイン / 新規登録</button>' +
        '<a class="ra-gate-link" href="' + pricingHref + '">料金プランを見る →</a>';
      document.getElementById("ra-gate-login").onclick = openModal;
    }

    function showNotSubscribed(email) {
      msgEl.innerHTML =
        escapeHtml(email) +
        " でログイン中ですが、有効なご契約が見つかりません。<br><span class=\"ra-gate-en\">No active subscription found for this account.</span>";
      actionsEl.innerHTML =
        '<a class="ra-submit" style="text-decoration:none;display:block;box-sizing:border-box;" href="' +
        pricingHref +
        '">料金プランを見る →</a>' +
        '<button class="ra-gate-link" id="ra-gate-logout">ログアウト</button>';
      document.getElementById("ra-gate-logout").onclick = () => auth.signOut();
    }

    function grantAccess() {
      overlay.remove();
      mainEl.style.visibility = "visible";
    }

    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        showLoggedOut();
        return;
      }
      msgEl.textContent = "会員確認中...";
      actionsEl.innerHTML = "";
      try {
        const doc = await db.collection("subscribers").doc(user.email.toLowerCase()).get();
        const data = doc.exists ? doc.data() : null;
        if (data && ACTIVE_STATUSES.includes(data.status)) {
          grantAccess();
        } else {
          showNotSubscribed(user.email);
        }
      } catch (e) {
        msgEl.textContent = "確認中にエラーが発生しました。時間をおいて再度お試しください。";
      }
    });
  }

  window.RakugoAuth = {
    mountWidget,
    requireSubscription,
    openModal,
  };
})();
