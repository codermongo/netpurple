const API_BASE = "https://api.netpurple.net";
const AUTH_COLLECTION = "users";
const AUTH_STORAGE_KEY = "pb_auth";

const state = {
  token: null,
  user: null
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  loginBtn: document.querySelector("#login-btn"),
  loginError: document.querySelector("#login-error"),
  identity: document.querySelector("#login-identity"),
  password: document.querySelector("#login-password"),
  logoutBtn: document.querySelector("#logout-btn"),
  userHandle: document.querySelector("#user-handle")
};

function normalizePath(path) {
  return path.replace(/\/+$/, "");
}

function isLoginPage() {
  const path = normalizePath(window.location.pathname);
  return path == "/login" || path == "/login/index.html";
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
    if (url.origin != window.location.origin) {
      return;
    }
    const refPath = normalizePath(url.pathname);
    if (!refPath || refPath == "/login" || refPath == "/login/index.html") {
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
  const email = user?.email || "";
  if (email.includes("@")) {
    return email.split("@")[0];
  }
  return user?.username || email || "User";
}

function setAuth(auth) {
  state.token = auth?.token ?? null;
  state.user = auth?.record ?? null;

  if (state.token) {
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

function saveAuth(auth) {
  if (auth) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  setAuth(auth);
}

function loadAuth() {
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

function setLoading(button, isLoading) {
  if (!button) {
    return;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? "Working..." : button.dataset.label || button.textContent;
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(`${API_BASE}${path}`,
    {
      ...options,
      headers: {
        ...headers,
        ...(options.headers || {})
      }
    }
  );

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

async function login(identity, password) {
  setError(elements.loginError, "");
  if (elements.loginBtn) {
    elements.loginBtn.dataset.label = elements.loginBtn.textContent;
  }
  setLoading(elements.loginBtn, true);

  try {
    const result = await apiFetch(`/api/collections/${AUTH_COLLECTION}/auth-with-password`, {
      method: "POST",
      body: JSON.stringify({ identity, password })
    });
    saveAuth(result);
    if (isLoginPage()) {
      const target = getReturnTarget();
      sessionStorage.removeItem("login_return");
      window.location.href = target;
      return;
    }
    if (elements.password) {
      elements.password.value = "";
    }
  } catch (error) {
    setError(elements.loginError, error.message || "Login failed.");
  } finally {
    setLoading(elements.loginBtn, false);
  }
}

function initAuth() {
  setReturnTargetFromReferrer();
  const existingAuth = loadAuth();
  if (existingAuth?.token) {
    setAuth(existingAuth);
  } else {
    setAuth(null);
  }

  if (elements.loginForm) {
    elements.loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const identity = elements.identity ? elements.identity.value.trim() : "";
      const password = elements.password ? elements.password.value : "";
      if (!identity || !password) {
        setError(elements.loginError, "Please enter your credentials.");
        return;
      }
      login(identity, password);
    });
  }

  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", () => {
      saveAuth(null);
    });
  }
}

initAuth();



