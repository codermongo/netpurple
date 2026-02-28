const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const LOGIN_PATH = "/login";
const AUTH_STORAGE_KEY = "appwrite_auth";

const elements = {
  logoutBtn: document.querySelector("#logout-btn"),
  userHandle: document.querySelector("#user-handle"),
  userEmail: document.querySelector("#settings-user-email"),
  emailState: document.querySelector("#email-verify-state"),
  verifyFeedback: document.querySelector("#verify-feedback"),
  resendBtn: document.querySelector("#resend-verification-btn"),
  nameForm: document.querySelector("#name-form"),
  nameInput: document.querySelector("#name-input"),
  nameSaveBtn: document.querySelector("#name-save-btn"),
  nameFeedback: document.querySelector("#name-feedback"),
  emailForm: document.querySelector("#email-form"),
  emailInput: document.querySelector("#email-input"),
  emailPasswordInput: document.querySelector("#email-password-input"),
  emailSaveBtn: document.querySelector("#email-save-btn"),
  emailFeedback: document.querySelector("#email-feedback"),
  passwordForm: document.querySelector("#password-form"),
  passwordCurrentInput: document.querySelector("#password-current-input"),
  passwordNewInput: document.querySelector("#password-new-input"),
  passwordConfirmInput: document.querySelector("#password-confirm-input"),
  passwordSaveBtn: document.querySelector("#password-save-btn"),
  passwordFeedback: document.querySelector("#password-feedback")
};

let account = null;
let currentUser = null;

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
  if (user) {
    document.body.dataset.auth = "in";
    if (elements.userHandle) {
      elements.userHandle.textContent = getUserHandle(user);
    }
  } else {
    document.body.dataset.auth = "out";
    if (elements.userHandle) {
      elements.userHandle.textContent = "User";
    }
  }
}

function setFeedback(element, message, tone) {
  if (!element) {
    return;
  }
  element.textContent = message || "";
  if (tone) {
    element.dataset.tone = tone;
  } else {
    delete element.dataset.tone;
  }
}

function setLoading(button, isLoading, loadingLabel) {
  if (!button) {
    return;
  }
  if (!button.dataset.label) {
    button.dataset.label = button.textContent;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingLabel : button.dataset.label;
}

function getLoginRedirectUrl() {
  const target = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const url = new URL(LOGIN_PATH, window.location.origin);
  url.searchParams.set("return", target);
  return url.toString();
}

function getVerificationTarget() {
  return new URL("/verify", window.location.origin).toString();
}

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    setFeedback(elements.verifyFeedback, "Appwrite SDK is not loaded.", "error");
    return false;
  }
  const { Client, Account } = Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  account = new Account(client);
  return true;
}

function populateAccountFields(user) {
  if (elements.userEmail) {
    elements.userEmail.textContent = user?.email || "";
  }
  if (elements.nameInput) {
    elements.nameInput.value = user?.name || "";
  }
  if (elements.emailInput) {
    elements.emailInput.value = user?.email || "";
  }
}

function updateVerificationState(user) {
  const verified = Boolean(user?.emailVerification);
  if (elements.emailState) {
    elements.emailState.textContent = verified ? "Verified" : "Not verified";
    elements.emailState.dataset.state = verified ? "verified" : "unverified";
  }
  if (elements.resendBtn) {
    elements.resendBtn.hidden = verified;
  }
}

async function refreshUser() {
  if (!account) {
    return null;
  }
  try {
    currentUser = await account.get();
    setAuth(currentUser);
    populateAccountFields(currentUser);
    updateVerificationState(currentUser);
    return currentUser;
  } catch {
    currentUser = null;
    setAuth(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.href = getLoginRedirectUrl();
    return null;
  }
}

async function resendVerificationEmail() {
  if (!account) {
    setFeedback(elements.verifyFeedback, "Appwrite SDK is not loaded.", "error");
    return;
  }

  setLoading(elements.resendBtn, true, "Sending...");
  setFeedback(elements.verifyFeedback, "", "");

  try {
    await account.createVerification(getVerificationTarget());
    setFeedback(elements.verifyFeedback, "Verification email sent.", "success");
  } catch (error) {
    setFeedback(elements.verifyFeedback, error?.message || "Could not send verification email.", "error");
  } finally {
    setLoading(elements.resendBtn, false, "Sending...");
  }
}

async function submitNameUpdate(event) {
  event.preventDefault();
  if (!account || !elements.nameInput) {
    setFeedback(elements.nameFeedback, "Appwrite SDK is not loaded.", "error");
    return;
  }

  const name = elements.nameInput.value.trim();
  if (!name) {
    setFeedback(elements.nameFeedback, "Please enter your name.", "error");
    return;
  }

  setLoading(elements.nameSaveBtn, true, "Saving...");
  setFeedback(elements.nameFeedback, "", "");

  try {
    const updated = await account.updateName(name);
    currentUser = updated;
    setAuth(updated);
    populateAccountFields(updated);
    setFeedback(elements.nameFeedback, "Name updated.", "success");
  } catch (error) {
    setFeedback(elements.nameFeedback, error?.message || "Could not update name.", "error");
  } finally {
    setLoading(elements.nameSaveBtn, false, "Saving...");
  }
}

async function submitEmailUpdate(event) {
  event.preventDefault();
  if (!account || !elements.emailInput || !elements.emailPasswordInput) {
    setFeedback(elements.emailFeedback, "Appwrite SDK is not loaded.", "error");
    return;
  }

  const newEmail = elements.emailInput.value.trim();
  const password = elements.emailPasswordInput.value;

  if (!newEmail || !password) {
    setFeedback(elements.emailFeedback, "Enter your email and current password.", "error");
    return;
  }
  if (currentUser?.email && newEmail === currentUser.email) {
    setFeedback(elements.emailFeedback, "This is already your current email.", "error");
    return;
  }

  setLoading(elements.emailSaveBtn, true, "Saving...");
  setFeedback(elements.emailFeedback, "", "");

  try {
    await account.updateEmail(newEmail, password);
    let verificationSent = false;
    try {
      await account.createVerification(getVerificationTarget());
      verificationSent = true;
    } catch {
      verificationSent = false;
    }
    await refreshUser();
    elements.emailPasswordInput.value = "";
    if (verificationSent) {
      setFeedback(elements.emailFeedback, "Email updated. Verification email sent.", "success");
    } else {
      setFeedback(elements.emailFeedback, "Email updated. Please resend verification email.", "error");
    }
  } catch (error) {
    setFeedback(elements.emailFeedback, error?.message || "Could not update email.", "error");
  } finally {
    setLoading(elements.emailSaveBtn, false, "Saving...");
  }
}

async function submitPasswordUpdate(event) {
  event.preventDefault();
  if (!account || !elements.passwordCurrentInput || !elements.passwordNewInput || !elements.passwordConfirmInput) {
    setFeedback(elements.passwordFeedback, "Appwrite SDK is not loaded.", "error");
    return;
  }

  const currentPassword = elements.passwordCurrentInput.value;
  const newPassword = elements.passwordNewInput.value;
  const confirmPassword = elements.passwordConfirmInput.value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    setFeedback(elements.passwordFeedback, "Please complete all password fields.", "error");
    return;
  }
  if (newPassword.length < 8) {
    setFeedback(elements.passwordFeedback, "New password must be at least 8 characters.", "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    setFeedback(elements.passwordFeedback, "New passwords do not match.", "error");
    return;
  }

  setLoading(elements.passwordSaveBtn, true, "Saving...");
  setFeedback(elements.passwordFeedback, "", "");

  try {
    await account.updatePassword(newPassword, currentPassword);
    elements.passwordCurrentInput.value = "";
    elements.passwordNewInput.value = "";
    elements.passwordConfirmInput.value = "";
    setFeedback(elements.passwordFeedback, "Password updated.", "success");
  } catch (error) {
    setFeedback(elements.passwordFeedback, error?.message || "Could not update password.", "error");
  } finally {
    setLoading(elements.passwordSaveBtn, false, "Saving...");
  }
}

async function logout() {
  if (account) {
    try {
      await account.deleteSession("current");
    } catch {
      // Ignore logout errors; redirect still happens.
    }
  }
  localStorage.removeItem(AUTH_STORAGE_KEY);
  setAuth(null);
  window.location.href = getLoginRedirectUrl();
}

function initEventHandlers() {
  if (elements.resendBtn) {
    elements.resendBtn.addEventListener("click", () => {
      void resendVerificationEmail();
    });
  }
  if (elements.nameForm) {
    elements.nameForm.addEventListener("submit", (event) => {
      void submitNameUpdate(event);
    });
  }
  if (elements.emailForm) {
    elements.emailForm.addEventListener("submit", (event) => {
      void submitEmailUpdate(event);
    });
  }
  if (elements.passwordForm) {
    elements.passwordForm.addEventListener("submit", (event) => {
      void submitPasswordUpdate(event);
    });
  }
  if (elements.logoutBtn) {
    elements.logoutBtn.addEventListener("click", () => {
      void logout();
    });
  }
}

async function initUserSettings() {
  setAuth(null);
  if (!initAppwrite()) {
    return;
  }
  initEventHandlers();
  await refreshUser();
}

void initUserSettings();
