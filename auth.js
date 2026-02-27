const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const AUTH_STORAGE_KEY = "appwrite_auth";
const LEGACY_AUTH_STORAGE_KEY = "pb_auth";
const GOOGLE_OAUTH_URL = "https://fra.cloud.appwrite.io/v1/account/sessions/oauth2/callback/google/699f23920000d9667d3e";

const state = {
  user: null
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
  logoutBtn: document.querySelector("#logout-btn"),
  userHandle: document.querySelector("#user-handle")
};

let account = null;
let AppwriteID = null;

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
}

function saveAuthSnapshot(user) {
  if (!user) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }

  const snapshot = {
    $id: user.$id || "",
    name: user.name || "",
    email: user.email || ""
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

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    console.warn("Appwrite SDK is not loaded.");
    return false;
  }

  const { Client, Account, ID } = Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  account = new Account(client);
  AppwriteID = ID;
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
    const user = await account.get();
    setAuth(user);
    saveAuthSnapshot(user);
    redirectAfterLoginIfNeeded();
  } catch (error) {
    setError(elements.registerError, error?.message || "Registration failed.");
  } finally {
    setLoading(elements.registerBtn, false, "Creating account...");
  }
}

function startGoogleLogin() {
  sessionStorage.setItem("login_return", getReturnTarget());
  window.location.href = GOOGLE_OAUTH_URL;
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

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", () => {
      void logout();
    });
  }
}

async function initAuth() {
  localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
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

  await refreshAuthState();
  redirectAfterLoginIfNeeded();
}

void initAuth();
