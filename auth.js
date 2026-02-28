const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const AUTH_STORAGE_KEY = "appwrite_auth";
const LEGACY_AUTH_STORAGE_KEY = "pb_auth";

const state = {
  user: null,
  justVerifiedEmail: false
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  loginBtn: document.querySelector("#login-btn"),
  loginError: document.querySelector("#login-error"),
  loginEmail: document.querySelector("#login-email") || document.querySelector("#login-identity"),
  loginPassword: document.querySelector("#login-password"),
  registerForm: document.querySelector("#register-form"),
  registerBtn: document.querySelector("#register-btn"),
  registerError: document.querySelector("#register-error"),
  registerName: document.querySelector("#register-name"),
  registerEmail: document.querySelector("#register-email"),
  registerPassword: document.querySelector("#register-password"),
  registerPasswordConfirm: document.querySelector("#register-password-confirm"),
  googleLoginBtn: document.querySelector("#google-login-btn"),
  verifyPanel: document.querySelector("#verify-panel"),
  verifyTitle: document.querySelector("#verify-title"),
  sendVerificationBtn: document.querySelector("#send-verification-btn"),
  verificationMessage: document.querySelector("#verification-message"),
  showRegisterLink: document.querySelector("#show-register-link"),
  showLoginLink: document.querySelector("#show-login-link"),
  loginView: document.querySelector("#login-view"),
  registerView: document.querySelector("#register-view"),
  logoutBtn: document.querySelector("#logout-btn"),
  userHandle: document.querySelector("#user-handle")
};

let account = null;
let AppwriteID = null;
let AppwriteOAuthProvider = null;

function normalizePath(path) {
  return path.replace(/\/+$/, "");
}

function isLoginPage() {
  const path = normalizePath(window.location.pathname);
  return path === "/login" || path === "/login/index.html" || path.endsWith("/login");
}

function setReturnTargetFromReferrer() {
  if (!isLoginPage()) {
    return;
  }
  const referrer = document.referrer;
  if (!referrer) {
    return;
  }
  try {
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) {
      return;
    }
    const refPath = normalizePath(url.pathname);
    if (!refPath || refPath === "/login" || refPath === "/login/index.html") {
      return;
    }
    const target = `${url.pathname}${url.search}${url.hash}`;
    sessionStorage.setItem("login_return", target);
  } catch (error) {
    return;
  }
}

function getReturnTarget() {
  const params = new URLSearchParams(window.location.search);
  const paramTarget = params.get("return");
  if (paramTarget && paramTarget.startsWith("/")) {
    return paramTarget;
  }
  const stored = sessionStorage.getItem("login_return");
  if (stored && stored.startsWith("/")) {
    return stored;
  }
  return "/";
}

function getEmailVerificationTarget() {
  const url = new URL("/login", window.location.origin);
  const target = getReturnTarget();
  if (target.startsWith("/")) {
    url.searchParams.set("return", target);
  }
  return url.toString();
}

function getRequestedAuthView() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  return view === "register" ? "register" : "login";
}

function updateAuthViewInUrl(view) {
  const url = new URL(window.location.href);
  if (view === "register") {
    url.searchParams.set("view", "register");
  } else {
    url.searchParams.delete("view");
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function setAuthView(view) {
  const showRegister = view === "register";

  if (elements.loginView) {
    elements.loginView.hidden = showRegister;
  }
  if (elements.registerView) {
    elements.registerView.hidden = !showRegister;
  }

  setError(elements.loginError, "");
  setError(elements.registerError, "");
}

function setVerificationMessage(message, tone) {
  if (!elements.verificationMessage) {
    return;
  }

  if (elements.verifyTitle) {
    elements.verifyTitle.textContent = tone === "success"
      ? "Email verified"
      : "Email verification required";
  }

  elements.verificationMessage.textContent = message || "";
  if (tone) {
    elements.verificationMessage.dataset.tone = tone;
  } else {
    delete elements.verificationMessage.dataset.tone;
  }
}

function updateVerificationUi(user) {
  if (!elements.verifyPanel) {
    return;
  }

  const needsVerification = Boolean(user && user.emailVerification === false);
  const hasMessage = Boolean(elements.verificationMessage?.textContent);
  elements.verifyPanel.hidden = !needsVerification && !hasMessage;

  if (needsVerification && !hasMessage) {
    setVerificationMessage("Email not verified yet.", "error");
  }
}

function clearVerificationParamsFromUrl() {
  const url = new URL(window.location.href);
  const sensitiveParams = ["userId", "secret", "expire", "expires", "token"];
  const hasVerificationParams = sensitiveParams.some((key) => url.searchParams.has(key));
  if (!hasVerificationParams) {
    return;
  }

  for (const key of sensitiveParams) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function getUserHandle(user) {
  const name = user?.name || "";
  if (name.trim()) {
    return name.trim();
  }
  const email = user?.email || "";
  if (email.includes("@")) {
    return email.split("@")[0];
  }
  return "User";
}

function setAuth(user) {
  state.user = user || null;

  if (state.user) {
    document.body.dataset.auth = "in";
    if (elements.userHandle) {
      elements.userHandle.textContent = getUserHandle(state.user);
    }
  } else {
    document.body.dataset.auth = "out";
    if (elements.userHandle) {
      elements.userHandle.textContent = "User";
    }
  }

  updateVerificationUi(state.user);
}

function saveAuthSnapshot(user) {
  if (!user) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  const snapshot = {
    $id: user.$id || "",
    name: user.name || "",
    email: user.email || "",
    emailVerification: Boolean(user.emailVerification)
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(snapshot));
}

function loadAuthSnapshot() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function setError(element, message) {
  if (!element) {
    return;
  }
  element.textContent = message || "";
}

function setLoading(button, isLoading, workingLabel) {
  if (!button) {
    return;
  }
  if (!button.dataset.label) {
    button.dataset.label = button.textContent;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? workingLabel : button.dataset.label;
}

function clearRegisterForm() {
  if (elements.registerName) {
    elements.registerName.value = "";
  }
  if (elements.registerEmail) {
    elements.registerEmail.value = "";
  }
  if (elements.registerPassword) {
    elements.registerPassword.value = "";
  }
  if (elements.registerPasswordConfirm) {
    elements.registerPasswordConfirm.value = "";
  }
}

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    console.warn("Appwrite SDK is not loaded.");
    return false;
  }

  const { Client, Account, ID, OAuthProvider } = Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  account = new Account(client);
  AppwriteID = ID;
  AppwriteOAuthProvider = OAuthProvider;
  return true;
}

async function refreshAuthState() {
  if (!account) {
    return false;
  }

  try {
    const user = await account.get();
    setAuth(user);
    saveAuthSnapshot(user);
    return true;
  } catch (error) {
    setAuth(null);
    saveAuthSnapshot(null);
    return false;
  }
}

function redirectAfterLoginIfNeeded() {
  if (!isLoginPage()) {
    return;
  }
  if (!state.user) {
    return;
  }
  if (state.justVerifiedEmail) {
    state.justVerifiedEmail = false;
    return;
  }
  if (state.user.emailVerification === false) {
    setVerificationMessage("Please verify your email before continuing.", "error");
    return;
  }

  const target = getReturnTarget();
  sessionStorage.removeItem("login_return");
  window.location.href = target;
}

async function login(email, password) {
  if (!account) {
    setError(elements.loginError, "Appwrite SDK not loaded.");
    return;
  }

  setError(elements.loginError, "");
  setLoading(elements.loginBtn, true, "Signing in...");

  try {
    await account.createEmailPasswordSession(email, password);
    const user = await account.get();
    setAuth(user);
    saveAuthSnapshot(user);

    if (elements.loginPassword) {
      elements.loginPassword.value = "";
    }
    redirectAfterLoginIfNeeded();
  } catch (error) {
    setError(elements.loginError, error?.message || "Login failed.");
  } finally {
    setLoading(elements.loginBtn, false, "Signing in...");
  }
}

async function register(name, email, password) {
  if (!account || !AppwriteID) {
    setError(elements.registerError, "Appwrite SDK not loaded.");
    return;
  }

  setError(elements.registerError, "");
  setLoading(elements.registerBtn, true, "Creating account...");

  try {
    await account.create(AppwriteID.unique(), email, password, name || undefined);
    await account.createEmailPasswordSession(email, password);
    let verificationSent = false;
    try {
      await account.createVerification(getEmailVerificationTarget());
      verificationSent = true;
    } catch {
      verificationSent = false;
    }
    const user = await account.get();
    setAuth(user);
    saveAuthSnapshot(user);
    clearRegisterForm();
    setAuthView("login");
    updateAuthViewInUrl("login");
    if (verificationSent) {
      setVerificationMessage("Account created. Check your email for the verification link.", "success");
    } else {
      setVerificationMessage("Account created, but verification email could not be sent. Try again.", "error");
    }
    redirectAfterLoginIfNeeded();
  } catch (error) {
    setError(elements.registerError, error?.message || "Registration failed.");
  } finally {
    setLoading(elements.registerBtn, false, "Creating account...");
  }
}

async function sendVerificationEmail() {
  if (!account) {
    setVerificationMessage("Appwrite SDK not loaded.", "error");
    return;
  }

  setVerificationMessage("");
  setLoading(elements.sendVerificationBtn, true, "Sending...");

  try {
    await account.createVerification(getEmailVerificationTarget());
    setVerificationMessage("Verification email sent.", "success");
  } catch (error) {
    setVerificationMessage(error?.message || "Failed to send verification email.", "error");
  } finally {
    setLoading(elements.sendVerificationBtn, false, "Sending...");
  }
}

function startGoogleLogin() {
  if (!account || !AppwriteOAuthProvider) {
    setError(elements.loginError, "Appwrite SDK not loaded.");
    return;
  }

  const target = getReturnTarget();
  sessionStorage.setItem("login_return", target);

  const successUrl = new URL(target, window.location.origin).toString();
  const failureUrl = new URL("/login", window.location.origin);
  failureUrl.searchParams.set("return", target);
  failureUrl.searchParams.set("error", "google_oauth");

  account.createOAuth2Session(
    AppwriteOAuthProvider.Google,
    successUrl,
    failureUrl.toString()
  );
}

async function logout() {
  if (account) {
    try {
      await account.deleteSession("current");
    } catch (error) {
      // Ignore logout errors; local UI state is still reset.
    }
  }

  setAuth(null);
  saveAuthSnapshot(null);
  setVerificationMessage("");
}

async function handleEmailVerificationCallback() {
  if (!isLoginPage() || !account) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const userId = params.get("userId");
  const secret = params.get("secret");
  if (!userId || !secret) {
    return;
  }

  setAuthView("login");
  updateAuthViewInUrl("login");

  try {
    await account.updateVerification(userId, secret);
    state.justVerifiedEmail = true;
    setVerificationMessage("Email verified successfully.", "success");
  } catch (error) {
    state.justVerifiedEmail = false;
    setVerificationMessage(error?.message || "Email verification failed.", "error");
  } finally {
    clearVerificationParamsFromUrl();
  }
}

function initEventHandlers() {
  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = elements.loginEmail ? elements.loginEmail.value.trim() : "";
      const password = elements.loginPassword ? elements.loginPassword.value : "";

      if (!email || !password) {
        setError(elements.loginError, "Please enter your email and password.");
        return;
      }

      void login(email, password);
    });
  }

  if (elements.registerForm) {
    elements.registerForm.addEventListener("submit", (event) => {
      event.preventDefault();

      const name = elements.registerName ? elements.registerName.value.trim() : "";
      const email = elements.registerEmail ? elements.registerEmail.value.trim() : "";
      const password = elements.registerPassword ? elements.registerPassword.value : "";
      const confirm = elements.registerPasswordConfirm ? elements.registerPasswordConfirm.value : "";

      if (!name || !email || !password) {
        setError(elements.registerError, "Please complete all required fields.");
        return;
      }
      if (password.length < 8) {
        setError(elements.registerError, "Password must be at least 8 characters.");
        return;
      }
      if (confirm && confirm !== password) {
        setError(elements.registerError, "Passwords do not match.");
        return;
      }

      void register(name, email, password);
    });
  }

  if (elements.googleLoginBtn) {
    elements.googleLoginBtn.addEventListener("click", (event) => {
      event.preventDefault();
      startGoogleLogin();
    });
  }

  if (elements.sendVerificationBtn) {
    elements.sendVerificationBtn.addEventListener("click", () => {
      void sendVerificationEmail();
    });
  }

  if (elements.showRegisterLink) {
    elements.showRegisterLink.addEventListener("click", (event) => {
      event.preventDefault();
      setAuthView("register");
      updateAuthViewInUrl("register");
    });
  }

  if (elements.showLoginLink) {
    elements.showLoginLink.addEventListener("click", (event) => {
      event.preventDefault();
      setAuthView("login");
      updateAuthViewInUrl("login");
    });
  }

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", () => {
      void logout();
    });
  }
}

async function initAuth() {
  localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
  setAuthView(getRequestedAuthView());
  setReturnTargetFromReferrer();
  initEventHandlers();

  const snapshot = loadAuthSnapshot();
  if (snapshot) {
    setAuth(snapshot);
  } else {
    setAuth(null);
  }

  if (!initAppwrite()) {
    return;
  }

  await handleEmailVerificationCallback();
  await refreshAuthState();
  redirectAfterLoginIfNeeded();
}

void initAuth();
