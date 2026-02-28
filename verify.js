const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const REDIRECT_DELAY_MS = 2500;
const REDIRECT_TARGET = "https://netpurple.net/";

const elements = {
  title: document.querySelector("#verify-page-title"),
  description: document.querySelector("#verify-page-description"),
  resendBtn: document.querySelector("#verify-resend-btn"),
  message: document.querySelector("#verify-page-message"),
  autoRedirect: document.querySelector("#verify-auto-redirect")
};

let account = null;

function setText(element, text) {
  if (!element) {
    return;
  }
  element.textContent = text;
}

function setMessage(message, tone) {
  if (!elements.message) {
    return;
  }
  elements.message.textContent = message || "";
  if (tone) {
    elements.message.dataset.tone = tone;
  } else {
    delete elements.message.dataset.tone;
  }
}

function setLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }
  if (!button.dataset.label) {
    button.dataset.label = button.textContent;
  }
  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.label;
}

function getVerificationTarget() {
  return new URL("/verify", window.location.origin).toString();
}

function scrubSensitiveParams() {
  const url = new URL(window.location.href);
  const sensitiveParams = ["userId", "secret", "expire", "expires", "token"];
  const hadSensitiveParams = sensitiveParams.some((key) => url.searchParams.has(key));
  if (!hadSensitiveParams) {
    return;
  }
  for (const key of sensitiveParams) {
    url.searchParams.delete(key);
  }
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    setMessage("Appwrite SDK is not loaded.", "error");
    return false;
  }

  const { Client, Account } = Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  account = new Account(client);
  return true;
}

async function resendVerificationEmail() {
  if (!account) {
    setMessage("Appwrite SDK is not loaded.", "error");
    return;
  }

  setLoading(elements.resendBtn, true, "Sending...");
  setMessage("", "");

  try {
    await account.createVerification(getVerificationTarget());
    setMessage("Verification email sent.", "success");
  } catch (error) {
    setMessage(error?.message || "Could not send verification email.", "error");
  } finally {
    setLoading(elements.resendBtn, false, "Sending...");
  }
}

function showPendingState(sentAutomatically) {
  setText(elements.title, "Please verify your email");
  if (sentAutomatically) {
    setText(elements.description, "To do this, the verification email has already been sent to your inbox.");
    setMessage("Open your email and click the verification link.", "success");
  } else {
    setText(elements.description, "Your account was created, but the verification email was not sent automatically.");
    setMessage("Use the button below to resend the verification email.", "error");
  }
  if (elements.autoRedirect) {
    elements.autoRedirect.hidden = true;
  }
  if (elements.resendBtn) {
    elements.resendBtn.hidden = false;
  }
}

function showVerifiedState() {
  setText(elements.title, "Email verified");
  setText(elements.description, "Your email has been verified successfully.");
  setMessage("Redirecting to netpurple.net...", "success");
  if (elements.resendBtn) {
    elements.resendBtn.hidden = true;
  }
  if (elements.autoRedirect) {
    elements.autoRedirect.hidden = false;
  }
}

async function handleVerificationFromUrl(params) {
  const userId = params.get("userId");
  const secret = params.get("secret");
  if (!userId || !secret) {
    return false;
  }

  scrubSensitiveParams();

  if (!account) {
    setMessage("Appwrite SDK is not loaded.", "error");
    return true;
  }

  try {
    await account.updateVerification(userId, secret);
    showVerifiedState();
    window.setTimeout(() => {
      window.location.href = REDIRECT_TARGET;
    }, REDIRECT_DELAY_MS);
  } catch (error) {
    setText(elements.title, "Verification failed");
    setText(elements.description, "The verification link is invalid or expired.");
    setMessage(error?.message || "Email verification failed.", "error");
    if (elements.resendBtn) {
      elements.resendBtn.hidden = false;
    }
    if (elements.autoRedirect) {
      elements.autoRedirect.hidden = true;
    }
  }

  return true;
}

async function initVerificationPage() {
  const params = new URLSearchParams(window.location.search);
  const sentAutomatically = params.get("sent") !== "0";

  initAppwrite();

  if (elements.resendBtn) {
    elements.resendBtn.addEventListener("click", () => {
      void resendVerificationEmail();
    });
  }

  const handled = await handleVerificationFromUrl(params);
  if (handled) {
    return;
  }

  showPendingState(sentAutomatically);
}

void initVerificationPage();
