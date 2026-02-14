const API_BASE = "https://api.netpurple.net";
const COLLECTION = "anime_ranking";
const THEME_KEY = "darkMode";
const AUTH_STORAGE_KEY = "pb_auth";
const COVER_CACHE_KEY = "anime_cover_cache_v1";
const JIKAN_BASE = "https://api.jikan.moe/v4/anime";

const state = {
  records: [],
  query: "",
  rankById: new Map(),
  coverCache: loadCoverCache(),
  pendingCovers: new Set(),
  pendingActions: new Set()
};

const elements = {
  list: document.querySelector("#animeList"),
  status: document.querySelector("#statusText"),
  search: document.querySelector("#searchInput"),
  refresh: document.querySelector("#refreshBtn"),
  add: document.querySelector("#addBtn"),
  themeToggle: document.querySelector("#themeToggleItem"),
  editOverlay: document.querySelector("#editOverlay"),
  editForm: document.querySelector("#editForm"),
  editTitleText: document.querySelector("#editTitleText"),
  editTitle: document.querySelector("#editTitle"),
  editTier: document.querySelector("#editTier"),
  editScore: document.querySelector("#editScore"),
  editNotes: document.querySelector("#editNotes"),
  editError: document.querySelector("#editError"),
  editCancelBtn: document.querySelector("#editCancelBtn"),
  editSaveBtn: document.querySelector("#editSaveBtn")
};

let coverRenderJob = 0;
let editMode = "edit";
let activeRecordId = null;

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
  elements.status.textContent = message;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readAuth() {
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

function getAuthToken() {
  return readAuth()?.token || null;
}

function redirectToLogin() {
  const target = encodeURIComponent(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.href = `/login?return=${target}`;
}

function ensureMutationAuth() {
  if (getAuthToken()) {
    return true;
  }
  redirectToLogin();
  return false;
}

function isAuthenticated() {
  return Boolean(getAuthToken());
}

function toScore(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatScore(value) {
  const score = toScore(value);
  if (score === null) {
    return "No score";
  }
  return `${score}/10`;
}

function getTierClass(tier) {
  const normalized = String(tier || "").trim().toLowerCase();
  if (normalized === "tier 1") {
    return "tier-1";
  }
  if (normalized === "tier 2") {
    return "tier-2";
  }
  if (normalized === "tier 3") {
    return "tier-3";
  }
  return "";
}

function stableSortByScore(records) {
  return records
    .map((record, index) => ({
      record,
      index,
      score: toScore(record.score)
    }))
    .sort((left, right) => {
      if (left.score === null && right.score === null) {
        const leftTitle = (left.record.title || "").toLowerCase();
        const rightTitle = (right.record.title || "").toLowerCase();
        const titleCompare = leftTitle.localeCompare(rightTitle);
        return titleCompare !== 0 ? titleCompare : left.index - right.index;
      }
      if (left.score === null) {
        return 1;
      }
      if (right.score === null) {
        return -1;
      }
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      const leftTitle = (left.record.title || "").toLowerCase();
      const rightTitle = (right.record.title || "").toLowerCase();
      const titleCompare = leftTitle.localeCompare(rightTitle);
      return titleCompare !== 0 ? titleCompare : left.index - right.index;
    })
    .map((item) => item.record);
}

function updateRanks() {
  state.rankById = new Map();
  state.records.forEach((record, index) => {
    state.rankById.set(record.id, index + 1);
  });
}

function getFilteredRecords() {
  const term = state.query.trim().toLowerCase();
  if (!term) {
    return state.records;
  }

  return state.records.filter((record) => {
    const haystack = [record.title, record.tier, record.notes, record.score]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase();
    return haystack.includes(term);
  });
}

function loadCoverCache() {
  const raw = localStorage.getItem(COVER_CACHE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    localStorage.removeItem(COVER_CACHE_KEY);
    return {};
  }
}

function saveCoverCache() {
  localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(state.coverCache));
}

function getCoverKey(title) {
  return String(title || "")
    .trim()
    .toLowerCase();
}

function sanitizeTitle(title) {
  return String(title || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/[^a-zA-Z0-9\s:'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickBestMatch(items, title) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }

  const needle = normalizeForMatch(title);
  if (!needle) {
    return items[0];
  }

  let best = null;
  let bestScore = -1;

  for (const item of items) {
    const variants = [item?.title, item?.title_english, item?.title_japanese].filter(Boolean);
    let localScore = 0;

    for (const variant of variants) {
      const candidate = normalizeForMatch(variant);
      if (!candidate) {
        continue;
      }
      if (candidate === needle) {
        localScore = Math.max(localScore, 100);
      } else if (candidate.includes(needle) || needle.includes(candidate)) {
        localScore = Math.max(localScore, 80);
      } else {
        const needleTokens = new Set(needle.split(" "));
        const candidateTokens = candidate.split(" ");
        let overlap = 0;
        for (const token of candidateTokens) {
          if (needleTokens.has(token)) {
            overlap += 1;
          }
        }
        localScore = Math.max(localScore, overlap * 10);
      }
    }

    if (localScore > bestScore) {
      bestScore = localScore;
      best = item;
    }
  }

  return best || items[0];
}

function getCoverUrlFromItem(item) {
  return item?.images?.webp?.large_image_url
    || item?.images?.jpg?.large_image_url
    || item?.images?.webp?.image_url
    || item?.images?.jpg?.image_url
    || "";
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchCover(title) {
  const cleanTitle = sanitizeTitle(title);
  const queries = [title, cleanTitle].filter(Boolean);

  for (const query of queries) {
    try {
      const response = await fetch(
        `${JIKAN_BASE}?q=${encodeURIComponent(query)}&limit=8&sfw=true`
      );

      if (!response.ok) {
        if (response.status === 429) {
          await sleep(750);
          continue;
        }
        continue;
      }

      const data = await response.json();
      const best = pickBestMatch(data?.data || [], title);
      const imageUrl = getCoverUrlFromItem(best);
      if (imageUrl) {
        return imageUrl;
      }
    } catch (error) {
      continue;
    }

    await sleep(220);
  }

  return "";
}

function createPlaceholder(title) {
  const safeTitle = escapeHtml(title || "?");
  const initial = escapeHtml((title || "?").trim().charAt(0).toUpperCase() || "?");
  return `
    <div class="card-cover-placeholder" aria-label="No cover image for ${safeTitle}">
      <span>${initial}</span>
    </div>
  `;
}

function renderCardCover(record) {
  const key = getCoverKey(record.title);
  const cached = state.coverCache[key] || "";
  const safeTitle = escapeHtml(record.title || "Anime");

  if (cached) {
    return `<img class="card-cover" src="${escapeHtml(cached)}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" />`;
  }

  return createPlaceholder(record.title);
}

async function enrichVisibleCovers(records, jobId) {
  for (const record of records) {
    if (jobId !== coverRenderJob) {
      return;
    }

    const key = getCoverKey(record.title);
    if (!key || Object.prototype.hasOwnProperty.call(state.coverCache, key) || state.pendingCovers.has(key)) {
      continue;
    }

    state.pendingCovers.add(key);
    const cover = await fetchCover(record.title || "");
    state.pendingCovers.delete(key);

    state.coverCache[key] = cover || "";
    saveCoverCache();

    if (jobId !== coverRenderJob || !cover) {
      continue;
    }

    const slot = elements.list.querySelector(`[data-cover-slot="${record.id}"]`);
    if (!slot) {
      continue;
    }

    slot.innerHTML = `<img class="card-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(record.title || "Anime")} cover" loading="lazy" referrerpolicy="no-referrer" />`;
    await sleep(180);
  }
}

async function apiRequest(path, options = {}) {
  const headers = {
    Accept: "application/json"
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
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
    let message = "Request failed.";
    try {
      const body = await response.json();
      message = body?.message || message;
    } catch (error) {
      message = response.statusText || message;
    }
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    return null;
  }
  return response.json();
}

async function fetchAllRecords() {
  const records = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await apiRequest(
      `/api/collections/${COLLECTION}/records?page=${page}&perPage=200`
    );
    totalPages = Number(data?.totalPages) || 1;
    if (Array.isArray(data?.items)) {
      records.push(...data.items);
    }
    page += 1;
  }

  return records;
}

function renderEmpty(message) {
  elements.list.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function setListStatus(filteredCount) {
  if (state.query) {
    setStatus(`Showing ${filteredCount} of ${state.records.length} anime.`);
    return;
  }
  setStatus(`${state.records.length} anime loaded.`);
}

function renderList() {
  const filtered = getFilteredRecords();
  const canManage = isAuthenticated();

  if (!filtered.length) {
    renderEmpty("No anime found for the current search.");
    setStatus(`Showing 0 of ${state.records.length} anime.`);
    return;
  }

  const cards = filtered.map((record) => {
    const title = escapeHtml(record.title || "Untitled");
    const tier = escapeHtml(record.tier || "No tier");
    const tierClass = getTierClass(record.tier);
    const notes = record.notes ? `<p class="card-notes">${escapeHtml(record.notes)}</p>` : "";
    const scoreText = formatScore(record.score);
    const rank = state.rankById.get(record.id) || "-";
    const disabled = state.pendingActions.has(record.id) ? " disabled" : "";
    const actionButtons = canManage
      ? `
              <div class="card-actions">
                <button class="card-action-btn" type="button" data-action="edit" data-id="${escapeHtml(record.id)}"${disabled}>Edit</button>
                <button class="card-action-btn delete" type="button" data-action="delete" data-id="${escapeHtml(record.id)}"${disabled}>Delete</button>
              </div>
        `
      : "";

    return `
      <article class="anime-card ${tierClass}">
        <div class="card-media" data-cover-slot="${escapeHtml(record.id)}">
          ${renderCardCover(record)}
        </div>
        <div class="card-body">
          <div class="card-head">
            <div class="card-head-left">
              <h2 class="card-title">#${rank} ${title}</h2>
              <p class="card-meta ${tierClass}">Tier: ${tier}</p>
            </div>
            <div class="head-right">
              <span class="score-pill">Score: ${escapeHtml(scoreText)}</span>
              ${actionButtons}
            </div>
          </div>
          ${notes}
        </div>
      </article>
    `;
  });

  elements.list.innerHTML = cards.join("");
  setListStatus(filtered.length);

  coverRenderJob += 1;
  void enrichVisibleCovers(filtered, coverRenderJob);
}

function syncAuthUi() {
  elements.add.hidden = !isAuthenticated();
}

function setEditError(message) {
  elements.editError.textContent = message || "";
}

function setEditLoading(isLoading) {
  elements.editSaveBtn.disabled = isLoading;
  elements.editCancelBtn.disabled = isLoading;
  elements.editSaveBtn.textContent = isLoading
    ? editMode === "create" ? "Creating..." : "Saving..."
    : editMode === "create" ? "Create" : "Save";
}

function closeEditModal() {
  activeRecordId = null;
  editMode = "edit";
  setEditError("");
  setEditLoading(false);
  elements.editOverlay.hidden = true;
  elements.editOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openCreateModal() {
  if (!ensureMutationAuth()) {
    return;
  }

  editMode = "create";
  activeRecordId = null;
  elements.editTitleText.textContent = "Add Anime";
  elements.editTitle.value = "";
  elements.editTier.value = "";
  elements.editScore.value = "";
  elements.editNotes.value = "";
  setEditError("");
  setEditLoading(false);
  elements.editOverlay.hidden = false;
  elements.editOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  elements.editTitle.focus();
}

function openEditModal(recordId) {
  if (!ensureMutationAuth()) {
    return;
  }

  const record = state.records.find((item) => item.id === recordId);
  if (!record) {
    return;
  }

  editMode = "edit";
  activeRecordId = record.id;
  elements.editTitleText.textContent = "Edit Anime";
  elements.editTitle.value = record.title || "";
  elements.editTier.value = record.tier || "";
  elements.editScore.value = record.score ?? "";
  elements.editNotes.value = record.notes || "";
  setEditError("");
  setEditLoading(false);
  elements.editOverlay.hidden = false;
  elements.editOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  elements.editTitle.focus();
}

function parseScoreInput(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { ok: true, value: null };
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return { ok: false, error: "Score must be a number." };
  }
  if (parsed < 0 || parsed > 10) {
    return { ok: false, error: "Score must be between 0 and 10." };
  }
  return { ok: true, value: parsed };
}

function buildPayloadFromForm() {
  const title = elements.editTitle.value.trim();
  if (!title) {
    return { ok: false, error: "Title is required." };
  }

  const scoreResult = parseScoreInput(elements.editScore.value);
  if (!scoreResult.ok) {
    return scoreResult;
  }

  return {
    ok: true,
    value: {
      title,
      tier: elements.editTier.value || "",
      score: scoreResult.value,
      notes: elements.editNotes.value.trim()
    }
  };
}

function updateStateRecords(records) {
  state.records = stableSortByScore(records);
  updateRanks();
  renderList();
}

async function createRecord(payload) {
  const created = await apiRequest(`/api/collections/${COLLECTION}/records`,
    {
      method: "POST",
      body: JSON.stringify(payload)
    }
  );

  if (!created || !created.id) {
    await loadAnimeList();
    return;
  }

  const next = state.records.slice();
  next.push(created);
  updateStateRecords(next);
}

async function updateRecord(recordId, payload) {
  const updated = await apiRequest(`/api/collections/${COLLECTION}/records/${recordId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload)
    }
  );

  if (!updated || !updated.id) {
    await loadAnimeList();
    return;
  }

  const next = state.records.map((record) => {
    if (record.id !== recordId) {
      return record;
    }
    return updated;
  });
  updateStateRecords(next);
}

async function deleteRecord(recordId) {
  if (!ensureMutationAuth()) {
    return;
  }

  const record = state.records.find((item) => item.id === recordId);
  if (!record || state.pendingActions.has(recordId)) {
    return;
  }

  const confirmed = window.confirm(`Delete "${record.title || "this anime"}"?`);
  if (!confirmed) {
    return;
  }

  state.pendingActions.add(recordId);
  renderList();

  try {
    await apiRequest(`/api/collections/${COLLECTION}/records/${recordId}`,
      {
        method: "DELETE"
      }
    );
    const next = state.records.filter((item) => item.id !== recordId);
    updateStateRecords(next);
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      redirectToLogin();
      return;
    }
    window.alert(error.message || "Delete failed.");
  } finally {
    state.pendingActions.delete(recordId);
    renderList();
  }
}

async function loadAnimeList() {
  elements.refresh.disabled = true;
  setStatus("Loading anime list...");

  try {
    const records = await fetchAllRecords();
    updateStateRecords(records);
  } catch (error) {
    state.records = [];
    updateRanks();
    renderEmpty(error.message || "Unable to load anime list.");
    setStatus("Failed to load anime list.");
  } finally {
    elements.refresh.disabled = false;
  }
}

function handleListClick(event) {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }

  const action = button.getAttribute("data-action");
  const recordId = button.getAttribute("data-id") || "";
  if (!recordId) {
    return;
  }

  if (action === "edit") {
    openEditModal(recordId);
    return;
  }
  if (action === "delete") {
    void deleteRecord(recordId);
  }
}

function initEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value || "";
    renderList();
  });

  elements.refresh.addEventListener("click", () => {
    void loadAnimeList();
  });

  elements.add.addEventListener("click", () => {
    openCreateModal();
  });

  elements.list.addEventListener("click", handleListClick);

  elements.editForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureMutationAuth()) {
      return;
    }

    const payloadResult = buildPayloadFromForm();
    if (!payloadResult.ok) {
      setEditError(payloadResult.error || "Invalid input.");
      return;
    }

    const payload = payloadResult.value;
    const currentId = activeRecordId;

    setEditError("");
    setEditLoading(true);
    if (currentId) {
      state.pendingActions.add(currentId);
      renderList();
    }

    try {
      if (editMode === "create") {
        await createRecord(payload);
      } else {
        if (!currentId) {
          throw new Error("No record selected for edit.");
        }
        await updateRecord(currentId, payload);
      }
      closeEditModal();
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        redirectToLogin();
        return;
      }
      setEditError(error.message || "Save failed.");
    } finally {
      setEditLoading(false);
      if (currentId) {
        state.pendingActions.delete(currentId);
      }
      renderList();
    }
  });

  elements.editCancelBtn.addEventListener("click", () => {
    closeEditModal();
  });

  elements.editOverlay.addEventListener("click", (event) => {
    if (event.target === elements.editOverlay) {
      closeEditModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.editOverlay.hidden) {
      closeEditModal();
    }
  });
}

function init() {
  closeEditModal();
  initThemeToggle();
  syncAuthUi();
  initEvents();
  void loadAnimeList();
}

init();
