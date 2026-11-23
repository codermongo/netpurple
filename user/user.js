const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const LOGIN_PATH = "/login";
const AUTH_STORAGE_KEY = "appwrite_auth";
const MIN_PASSWORD_LENGTH = 8;

const $ = (selector) => document.querySelector(selector);

const elements = {
  card: $("#account-card"),
  logoutBtn: $("#logout-btn"),
  accountLogoutBtn: $("#account-logout-btn"),
  userHandle: $("#user-handle"),
  avatar: $("#account-avatar"),
  title: $("#account-title"),
  mail: $("#account-mail"),
  pill: $("#account-pill"),
  status: $("#account-status"),
  verifyPanel: $("#verify-panel"),
  verifyFeedback: $("#verify-feedback"),
  resendBtn: $("#resend-verification-btn"),
  nameValue: $("#row-name-value"),
  emailValue: $("#row-email-value"),
  passwordValue: $("#row-password-value"),
  passwordAction: $("#row-password-action"),
  nameForm: $("#name-form"),
  nameInput: $("#name-input"),
  nameSaveBtn: $("#name-save-btn"),
  nameFeedback: $("#name-feedback"),
  emailForm: $("#email-form"),
  emailInput: $("#email-input"),
  emailPasswordInput: $("#email-password-input"),
  emailSaveBtn: $("#email-save-btn"),
  emailFeedback: $("#email-feedback"),
  emailNeedsPassword: $("#email-needs-password"),
  emailSetPasswordLink: $("#email-set-password-link"),
  passwordForm: $("#password-form"),
  passwordCurrentField: $("#password-current-field"),
  passwordCurrentInput: $("#password-current-input"),
  passwordNewInput: $("#password-new-input"),
  passwordConfirmInput: $("#password-confirm-input"),
  passwordSaveBtn: $("#password-save-btn"),
  passwordFeedback: $("#password-feedback"),
  passwordHint: $("#password-hint")
};

const ROWS = ["name", "email", "password"];

let account = null;
let currentUser = null;
let openRowKey = null;

/* ---------- Helpers ---------- */

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

// Konten, die nur per Google angelegt wurden, haben nie ein Passwort gesetzt.
function hasPassword(user) {
  return Boolean(user?.passwordUpdate);
}

function isVerified(user) {
  return user?.emailVerification === true || user?.emailVerification === "true";
}

function setAuth(user) {
  document.body.dataset.auth = user ? "in" : "out";
  if (elements.userHandle) {
    elements.userHandle.textContent = user ? getUserHandle(user) : "User";
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
    setFeedback(elements.status, "Appwrite SDK is not loaded.", "error");
    return false;
  }
  const { Client, Account } = Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  account = new Account(client);
  return true;
}

/* ---------- Darstellung ---------- */

function renderAccount(user) {
  const handle = getUserHandle(user);
  const name = user?.name?.trim() || "";
  const passwordSet = hasPassword(user);

  if (elements.avatar) {
    elements.avatar.textContent = handle.charAt(0).toUpperCase() || "?";
  }
  if (elements.title) {
    elements.title.textContent = handle;
  }
  if (elements.mail) {
    elements.mail.textContent = user?.email || "";
  }
  if (elements.nameValue) {
    elements.nameValue.textContent = name || "Not set";
  }
  if (elements.emailValue) {
    elements.emailValue.textContent = user?.email || "";
  }
  if (elements.passwordValue) {
    elements.passwordValue.textContent = passwordSet ? "•".repeat(8) : "Not set (Google sign-in)";
  }
  if (elements.passwordAction) {
    elements.passwordAction.textContent = passwordSet ? "Edit" : "Set";
  }
  if (elements.passwordCurrentField) {
    elements.passwordCurrentField.hidden = !passwordSet;
  }
  if (elements.passwordSaveBtn) {
    elements.passwordSaveBtn.textContent = passwordSet ? "Save password" : "Set password";
    elements.passwordSaveBtn.dataset.label = elements.passwordSaveBtn.textContent;
  }
  if (elements.emailForm) {
    elements.emailForm.hidden = !passwordSet;
  }
  if (elements.emailNeedsPassword) {
    elements.emailNeedsPassword.hidden = passwordSet;
  }

  const verified = isVerified(user);
  if (elements.pill) {
    elements.pill.hidden = false;
    elements.pill.dataset.state = verified ? "verified" : "unverified";
    elements.pill.innerHTML = verified
      ? '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Verified'
      : '<i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i> Not verified';
  }
  if (elements.verifyPanel) {
    elements.verifyPanel.hidden = verified;
  }
}

/* ---------- Aufklapp-Zeilen ---------- */

function rowParts(key) {
  return {
    head: document.getElementById(`row-${key}-head`),
    body: document.getElementById(`row-${key}-body`)
  };
}

function resetForm(key) {
  if (key === "name") {
    if (elements.nameInput) {
      elements.nameInput.value = currentUser?.name || "";
    }
    setFeedback(elements.nameFeedback, "", "");
  } else if (key === "email") {
    if (elements.emailInput) {
      elements.emailInput.value = "";
    }
    if (elements.emailPasswordInput) {
      elements.emailPasswordInput.value = "";
    }
    setFeedback(elements.emailFeedback, "", "");
  } else if (key === "password") {
    [elements.passwordCurrentInput, elements.passwordNewInput, elements.passwordConfirmInput].forEach((input) => {
      if (input) {
        input.value = "";
      }
    });
    setFeedback(elements.passwordFeedback, "", "");
  }
  document.querySelectorAll(`#row-${key}-body .pw-wrap input`).forEach((input) => setPasswordVisible(input, false));
  updateFormState();
}

function openRow(key, { focus = true } = {}) {
  openRowKey = key;
  ROWS.forEach((rowKey) => {
    const { head, body } = rowParts(rowKey);
    const isOpen = rowKey === key;
    if (head) {
      head.setAttribute("aria-expanded", String(isOpen));
      const action = head.querySelector(".row-action");
      if (action && rowKey !== "password") {
        action.textContent = isOpen ? "Close" : "Edit";
      }
    }
    if (body) {
      if (!isOpen && !body.hidden) {
        resetForm(rowKey);
      }
      body.hidden = !isOpen;
    }
  });
  if (key === "password" && elements.passwordAction) {
    elements.passwordAction.textContent = "Close";
  } else if (elements.passwordAction) {
    elements.passwordAction.textContent = hasPassword(currentUser) ? "Edit" : "Set";
  }
  if (key) {
    setFeedback(elements.status, "", "");
    resetForm(key);
    if (focus) {
      const { body } = rowParts(key);
      // Erstes sichtbares Feld (bei Google-Konten ist z. B. "Current password" ausgeblendet).
      const target = [...(body?.querySelectorAll("input") || [])].find((input) => input.offsetParent !== null);
      target?.focus();
    }
  }
}

function toggleRow(key) {
  openRow(openRowKey === key ? null : key);
}

function closeRowWithSuccess(key, message) {
  openRow(null, { focus: false });
  setFeedback(elements.status, message, "success");
  rowParts(key).head?.focus();
}

/* ---------- Formular-Zustand (Save erst aktiv, wenn sinnvoll) ---------- */

function updateFormState() {
  if (elements.nameSaveBtn && elements.nameInput) {
    const value = elements.nameInput.value.trim();
    elements.nameSaveBtn.disabled = !value || value === (currentUser?.name || "").trim();
  }

  if (elements.emailSaveBtn && elements.emailInput && elements.emailPasswordInput) {
    const value = elements.emailInput.value.trim();
    elements.emailSaveBtn.disabled =
      !value || !value.includes("@") || value === currentUser?.email || !elements.emailPasswordInput.value;
  }

  if (elements.passwordSaveBtn && elements.passwordNewInput && elements.passwordConfirmInput) {
    const needsCurrent = hasPassword(currentUser);
    const current = elements.passwordCurrentInput?.value || "";
    const next = elements.passwordNewInput.value;
    const confirm = elements.passwordConfirmInput.value;

    let hint = "";
    let tone = "";
    if (next && next.length < MIN_PASSWORD_LENGTH) {
      hint = `At least ${MIN_PASSWORD_LENGTH} characters (${next.length}/${MIN_PASSWORD_LENGTH}).`;
      tone = "error";
    } else if (confirm && next !== confirm) {
      hint = "Passwords don't match.";
      tone = "error";
    } else if (next && confirm && next === confirm) {
      hint = "Passwords match.";
      tone = "success";
    }
    setFeedback(elements.passwordHint, hint, tone);

    elements.passwordSaveBtn.disabled =
      (needsCurrent && !current) || next.length < MIN_PASSWORD_LENGTH || next !== confirm;
  }
}

function setPasswordVisible(input, visible) {
  const toggle = input?.parentElement?.querySelector(".pw-toggle");
  if (!input || !toggle) {
    return;
  }
  input.type = visible ? "text" : "password";
  toggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
  const icon = toggle.querySelector("i");
  if (icon) {
    icon.className = visible ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
  }
}

/* ---------- Appwrite-Aktionen ---------- */

async function refreshUser() {
  if (!account) {
    return null;
  }
  try {
    currentUser = await account.get();
    setAuth(currentUser);
    renderAccount(currentUser);
    updateFormState();
    if (elements.card) {
      delete elements.card.dataset.loading;
    }
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
    setFeedback(elements.verifyFeedback, "Verification email sent. Check your inbox.", "success");
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
    renderAccount(updated);
    setLoading(elements.nameSaveBtn, false, "Saving...");
    closeRowWithSuccess("name", "Name updated.");
  } catch (error) {
    setLoading(elements.nameSaveBtn, false, "Saving...");
    setFeedback(elements.nameFeedback, error?.message || "Could not update name.", "error");
    updateFormState();
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
    setFeedback(elements.emailFeedback, "Enter the new email and your current password.", "error");
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
    setLoading(elements.emailSaveBtn, false, "Saving...");
    if (verificationSent) {
      closeRowWithSuccess("email", "Email updated. We sent a verification link to the new address.");
    } else {
      openRow(null, { focus: false });
      setFeedback(elements.status, "Email updated, but the verification email could not be sent. Use the button above to resend it.", "error");
    }
  } catch (error) {
    setLoading(elements.emailSaveBtn, false, "Saving...");
    setFeedback(elements.emailFeedback, error?.message || "Could not update email.", "error");
    updateFormState();
  }
}

async function submitPasswordUpdate(event) {
  event.preventDefault();
  if (!account || !elements.passwordNewInput || !elements.passwordConfirmInput) {
    setFeedback(elements.passwordFeedback, "Appwrite SDK is not loaded.", "error");
    return;
  }

  const needsCurrent = hasPassword(currentUser);
  const currentPassword = elements.passwordCurrentInput?.value || "";
  const newPassword = elements.passwordNewInput.value;
  const confirmPassword = elements.passwordConfirmInput.value;

  if ((needsCurrent && !currentPassword) || !newPassword || !confirmPassword) {
    setFeedback(elements.passwordFeedback, "Please complete all password fields.", "error");
    return;
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    setFeedback(elements.passwordFeedback, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`, "error");
    return;
  }
  if (newPassword !== confirmPassword) {
    setFeedback(elements.passwordFeedback, "New passwords do not match.", "error");
    return;
  }

  setLoading(elements.passwordSaveBtn, true, "Saving...");
  setFeedback(elements.passwordFeedback, "", "");

  try {
    if (needsCurrent) {
      await account.updatePassword(newPassword, currentPassword);
    } else {
      await account.updatePassword(newPassword);
    }
    await refreshUser();
    setLoading(elements.passwordSaveBtn, false, "Saving...");
    closeRowWithSuccess("password", needsCurrent ? "Password updated." : "Password set. You can now also sign in with email and password.");
  } catch (error) {
    setLoading(elements.passwordSaveBtn, false, "Saving...");
    setFeedback(elements.passwordFeedback, error?.message || "Could not update password.", "error");
    updateFormState();
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

/* ---------- Events ---------- */

function initEventHandlers() {
  ROWS.forEach((key) => {
    rowParts(key).head?.addEventListener("click", () => toggleRow(key));
  });

  document.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = openRowKey;
      openRow(null, { focus: false });
      if (key) {
        rowParts(key).head?.focus();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && openRowKey) {
      const key = openRowKey;
      openRow(null, { focus: false });
      rowParts(key).head?.focus();
    }
  });

  document.querySelectorAll(".pw-toggle").forEach((toggle) => {
    toggle.addEventListener("click", () => {
      const input = toggle.parentElement?.querySelector("input");
      setPasswordVisible(input, input?.type === "password");
    });
  });

  [
    elements.nameInput,
    elements.emailInput,
    elements.emailPasswordInput,
    elements.passwordCurrentInput,
    elements.passwordNewInput,
    elements.passwordConfirmInput
  ].forEach((input) => input?.addEventListener("input", updateFormState));

  elements.emailSetPasswordLink?.addEventListener("click", () => openRow("password"));
  elements.resendBtn?.addEventListener("click", () => void resendVerificationEmail());
  elements.nameForm?.addEventListener("submit", (event) => void submitNameUpdate(event));
  elements.emailForm?.addEventListener("submit", (event) => void submitEmailUpdate(event));
  elements.passwordForm?.addEventListener("submit", (event) => void submitPasswordUpdate(event));
  elements.logoutBtn?.addEventListener("click", () => void logout());
  elements.accountLogoutBtn?.addEventListener("click", () => void logout());
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
