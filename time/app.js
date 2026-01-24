const API_BASE = "https://api.netpurple.net";
const AUTH_COLLECTION = "users";
const TIMELINE_COLLECTION = "timeline_entries";
const THEME_KEY = "darkMode";
const DRAFT_KEY = "timeline_entry_draft";

const categoryOptions = [
  "Games",
  "gaming",
  "Life",
  "Personal_Beziehungen",
  "Tiere",
  "Auto",
  "Freunde",
  "Familie",
  "Ausbildung",
  "Schule",
  "Motorrad",
  "Hobbys",
  "Serien/Filme",
  "Animes",
  "Health",
  "Personal",
  "F\u00fchrerschein"
];

const state = {
  token: null,
  user: null,
  entries: [],
  filters: {
    rangeDays: null,
    query: ""
  }
};

const elements = {
  loginForm: document.querySelector("#login-form"),
  loginBtn: document.querySelector("#login-btn"),
  loginError: document.querySelector("#login-error"),
  identity: document.querySelector("#login-identity"),
  password: document.querySelector("#login-password"),
  logoutBtn: document.querySelector("#logout-btn"),
  openEntryBtn: document.querySelector("#open-entry-btn"),
  closeEntryBtn: document.querySelector("#close-entry-btn"),
  entryOverlay: document.querySelector("#entry-overlay"),
  entryForm: document.querySelector("#entry-form"),
  entryError: document.querySelector("#entry-error"),
  entryTitle: document.querySelector("#entry-title"),
  entryDate: document.querySelector("#entry-date"),
  entryCategory: document.querySelector("#entry-category"),
  entryDescription: document.querySelector("#entry-description"),
  entrySubmit: document.querySelector("#entry-submit"),
  timelineTrack: document.querySelector("#timeline-track"),
  timelineScroll: document.querySelector("#timeline-scroll"),
  statusText: document.querySelector("#status-text"),
  refreshBtn: document.querySelector("#refresh-btn"),
  userChip: document.querySelector("#user-chip"),
  userHandle: document.querySelector("#user-handle"),
  searchInput: document.querySelector("#timeline-search"),
  themeToggle: document.querySelector("#themeToggleItem")
};

let draftTimer = null;

function getDraftKey() {
  const userId = state.user?.id || "guest";
  return `${DRAFT_KEY}_${userId}`;
}

function readDraft() {
  const raw = localStorage.getItem(getDraftKey());
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem(getDraftKey());
    return null;
  }
}

function applyDraft(draft) {
  if (!draft) {
    return;
  }
  const hasValues = Boolean(
    elements.entryTitle.value ||
    elements.entryDate.value ||
    elements.entryDescription.value ||
    elements.entryCategory.value
  );
  if (hasValues) {
    return;
  }
  elements.entryTitle.value = draft.title || "";
  elements.entryDate.value = draft.Date || "";
  elements.entryDescription.value = draft.description || "";
  elements.entryCategory.value = draft.category || "";
}

function saveDraft() {
  if (!state.token) {
    return;
  }
  const draft = {
    title: elements.entryTitle.value.trim(),
    Date: elements.entryDate.value,
    description: elements.entryDescription.value.trim(),
    category: elements.entryCategory.value
  };
  const hasContent = Boolean(draft.title || draft.Date || draft.description || draft.category);
  if (!hasContent) {
    localStorage.removeItem(getDraftKey());
    return;
  }
  localStorage.setItem(getDraftKey(), JSON.stringify(draft));
}

function scheduleDraftSave() {
  if (draftTimer) {
    clearTimeout(draftTimer);
  }
  draftTimer = setTimeout(saveDraft, 350);
}

function clearDraft() {
  localStorage.removeItem(getDraftKey());
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
    elements.userChip.textContent = state.user?.email || state.user?.username || "Signed in";
    if (elements.userHandle) {
      elements.userHandle.textContent = getUserHandle(state.user);
    }
  } else {
    document.body.dataset.auth = "out";
    elements.userChip.textContent = "Signed out";
    if (elements.userHandle) {
      elements.userHandle.textContent = "User";
    }
    setEntryPanel(false);
  }
}

function setEntryPanel(isOpen) {
  if (!state.token) {
    document.body.dataset.entry = "closed";
    elements.entryOverlay.setAttribute("aria-hidden", "true");
    return;
  }

  document.body.dataset.entry = isOpen ? "open" : "closed";
  elements.entryOverlay.setAttribute("aria-hidden", isOpen ? "false" : "true");

  if (isOpen) {
    applyDraft(readDraft());
    setDefaultDate();
    elements.entryTitle.focus();
  }
}

function setDefaultDate() {
  if (elements.entryDate.value) {
    return;
  }
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  elements.entryDate.value = local;
}

function saveAuth(auth) {
  if (auth) {
    localStorage.setItem("pb_auth", JSON.stringify(auth));
  } else {
    localStorage.removeItem("pb_auth");
  }
  setAuth(auth);
}

function loadAuth() {
  const raw = localStorage.getItem("pb_auth");
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    localStorage.removeItem("pb_auth");
    return null;
  }
}

function initThemeToggle() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "true") {
    document.body.classList.add("dark-mode");
  }

  if (!elements.themeToggle) {
    return;
  }

  elements.themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem(THEME_KEY, document.body.classList.contains("dark-mode"));
  });
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function setError(element, message) {
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

function parseEntryDate(value) {
  if (!value) {
    return null;
  }
  let normalized = value;
  if (normalized.includes(" ") && !normalized.includes("T")) {
    normalized = normalized.replace(" ", "T");
  }
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatEntryLabel(date) {
  const dateLabel = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
  const timeLabel = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${dateLabel} ${timeLabel}`;
}

function formatPayloadDate(value) {
  if (!value) {
    return "";
  }
  if (value.includes("T")) {
    return `${value.replace("T", " ")}:00`;
  }
  return value;
}

function applyFilters(entries) {
  let filtered = entries.slice();
  if (state.filters.rangeDays) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - state.filters.rangeDays);
    filtered = filtered.filter((entry) => {
      const date = parseEntryDate(entry.Date);
      return date && date >= cutoff;
    });
  }
  if (state.filters.query) {
    const term = state.filters.query;
    filtered = filtered.filter((entry) => {
      const haystack = [entry.title, entry.description, entry.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }
  return filtered;
}

function updateFilterButtons() {
  const buttons = document.querySelectorAll(".filter-pill");
  buttons.forEach((button) => {
    const value = button.dataset.range || "all";
    const isActive = state.filters.rangeDays === null
      ? value === "all"
      : Number(value) === state.filters.rangeDays;
    button.classList.toggle("is-active", isActive);
  });
}

function updateTimelineView() {
  if (!state.token) {
    setStatus("Sign in to load entries.");
    renderTimelineEmpty("Sign in to load entries.");
    return;
  }

  const filtered = applyFilters(state.entries);
  if (!filtered.length) {
    if (state.entries.length) {
      setStatus("No entries match filters.");
      renderTimelineEmpty("No entries match filters.");
    } else {
      setStatus("No entries yet.");
      renderTimelineEmpty("No entries yet. Create the first one.");
    }
    return;
  }
  renderTimeline(filtered, state.entries.length);
}

function renderTimelineEmpty(message) {
  elements.timelineTrack.innerHTML = `<div class="timeline-empty">${escapeHtml(message)}</div>`;
}

function renderTimeline(entries, totalCount = null) {
  if (!entries.length) {
    setStatus("No entries yet.");
    renderTimelineEmpty("No entries yet. Create the first one.");
    return;
  }

  const normalized = entries
    .map((entry) => {
      const date = parseEntryDate(entry.Date);
      if (!date) {
        return null;
      }
      return {
        ...entry,
        _date: date,
        _year: date.getFullYear(),
        _quarter: Math.floor(date.getMonth() / 3) + 1,
        _label: formatEntryLabel(date)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a._date - b._date);

  if (!normalized.length) {
    setStatus("No valid dates found.");
    renderTimelineEmpty("No valid dates found.");
    return;
  }

  const yearMap = new Map();
  for (const entry of normalized) {
    if (!yearMap.has(entry._year)) {
      yearMap.set(entry._year, []);
    }
    yearMap.get(entry._year).push(entry);
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
  const markers = [];

  for (const year of years) {
    markers.push({ type: "year-start", label: `Start ${year}` });

    for (const entry of yearMap.get(year)) {
      markers.push({ type: "entry", entry });
    }

    markers.push({ type: "year-end", label: `End ${year}` });
  }

  elements.timelineTrack.innerHTML = markers.map(renderMarker).join("");
  const shownLabel = totalCount && totalCount !== normalized.length
    ? `${normalized.length}/${totalCount} entries`
    : `${normalized.length} entries`;
  setStatus(`${shownLabel} from ${years[0]} to ${years[years.length - 1]}.`);
}

function renderMarker(marker) {
  if (marker.type === "entry") {
    return renderEntryMarker(marker.entry);
  }
  const label = escapeHtml(marker.label);
  return `
    <div class="marker tick ${marker.type}">
      <span class="tick-label">${label}</span>
      <span class="tick-line"></span>
    </div>
  `;
}

function renderEntryMarker(entry) {
  const title = escapeHtml(entry.title || "Untitled");
  const description = entry.description
    ? `<p class="entry-desc">${escapeHtml(entry.description).replace(/\n/g, "<br>")}</p>`
    : "";
  const category = entry.category
    ? `<div class="entry-tags"><span class="badge">${escapeHtml(entry.category)}</span></div>`
    : "";
  const label = escapeHtml(entry._label || "");

  return `
    <div class="marker entry-marker">
      <span class="entry-label">${label}</span>
      <span class="entry-dot" aria-hidden="true"></span>
      <div class="entry-card">
        <h3>${title}</h3>
        ${category}
        ${description}
      </div>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function login(identity, password) {
  setError(elements.loginError, "");
  elements.loginBtn.dataset.label = elements.loginBtn.textContent;
  setLoading(elements.loginBtn, true);

  try {
    const result = await apiFetch(`/api/collections/${AUTH_COLLECTION}/auth-with-password`, {
      method: "POST",
      body: JSON.stringify({ identity, password })
    });
    saveAuth(result);
    await loadEntries();
  } catch (error) {
    setError(elements.loginError, error.message || "Login failed.");
  } finally {
    setLoading(elements.loginBtn, false);
  }
}

async function loadEntries() {
  setStatus("Loading timeline...");
  try {
    const data = await apiFetch(
      `/api/collections/${TIMELINE_COLLECTION}/records?page=1&perPage=200&sort=Date`
    );
    state.entries = data.items || [];
    updateTimelineView();
  } catch (error) {
    setStatus("Unable to load entries.");
    renderTimelineEmpty(error.message || "Unable to load entries.");
  }
}

async function createEntry(payload) {
  setError(elements.entryError, "");
  elements.entrySubmit.dataset.label = elements.entrySubmit.textContent;
  setLoading(elements.entrySubmit, true);

  try {
    await apiFetch(`/api/collections/${TIMELINE_COLLECTION}/records`, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    elements.entryForm.reset();
    clearDraft();
    setEntryPanel(false);
    await loadEntries();
  } catch (error) {
    setError(elements.entryError, error.message || "Unable to save entry.");
  } finally {
    setLoading(elements.entrySubmit, false);
  }
}

function hydrateCategories() {
  const options = categoryOptions
    .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
    .join("");
  elements.entryCategory.insertAdjacentHTML("beforeend", options);
}

function init() {
  hydrateCategories();
  initThemeToggle();

  const existingAuth = loadAuth();
  if (existingAuth?.token) {
    setAuth(existingAuth);
    loadEntries();
  } else {
    setStatus("Sign in to load entries.");
    renderTimelineEmpty("Sign in to load entries.");
  }

  const filterButtons = document.querySelectorAll(".filter-pill");
  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const range = button.dataset.range || "all";
      state.filters.rangeDays = range === "all" ? null : Number(range);
      updateFilterButtons();
      updateTimelineView();
    });
  });
  updateFilterButtons();

  if (elements.searchInput) {
    elements.searchInput.addEventListener("input", (event) => {
      state.filters.query = event.target.value.trim().toLowerCase();
      updateTimelineView();
    });
  }

  [elements.entryTitle, elements.entryDate, elements.entryDescription, elements.entryCategory]
    .filter(Boolean)
    .forEach((field) => {
      field.addEventListener("input", scheduleDraftSave);
    });

  elements.loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    login(elements.identity.value.trim(), elements.password.value);
  });

  elements.logoutBtn.addEventListener("click", () => {
    saveAuth(null);
    setStatus("Sign in to load entries.");
    renderTimelineEmpty("Sign in to load entries.");
  });

  elements.openEntryBtn.addEventListener("click", () => {
    setEntryPanel(true);
  });

  elements.closeEntryBtn.addEventListener("click", () => {
    setEntryPanel(false);
  });

  elements.entryOverlay.addEventListener("click", (event) => {
    if (event.target === elements.entryOverlay) {
      setEntryPanel(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setEntryPanel(false);
    }
  });

  elements.entryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!state.token) {
      setError(elements.entryError, "Please sign in first.");
      return;
    }

    const payload = {
      title: elements.entryTitle.value.trim(),
      Date: formatPayloadDate(elements.entryDate.value),
      description: elements.entryDescription.value.trim(),
      category: elements.entryCategory.value
    };

    if (!payload.description) {
      delete payload.description;
    }
    if (!payload.category) {
      delete payload.category;
    }

    createEntry(payload);
  });

  elements.refreshBtn.addEventListener("click", () => {
    if (!state.token) {
      setStatus("Sign in to load entries.");
      renderTimelineEmpty("Sign in to load entries.");
      return;
    }
    loadEntries();
  });
}

init();
