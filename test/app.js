const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";
const ANIME_COLLECTION_ID = "anime_ranking_1";
const PAGE_SIZE = 100;
const THEME_KEY = "darkMode";
const COVER_CACHE_KEY = "anime_cover_cache_v1";
const ANIME_WORKER_BASE = "https://anime.kampfflugzeuge.workers.dev";
const JIKAN_PROXY_BASE = `${ANIME_WORKER_BASE}/jikan`;
const APPWRITE_PROXY_URL = `${ANIME_WORKER_BASE}/appwrite/anime`;
const TITLE_SUGGESTION_LIMIT = 5;
const TITLE_SUGGESTION_MIN_LENGTH = 3;
const TITLE_SUGGESTION_DEBOUNCE_MS = 220;
const COVER_FETCH_MIN_INTERVAL_MS = 300;
const COVER_FETCH_COOLDOWN_MS = 3000;
const COVER_FETCH_RESUME_BUFFER_MS = 450;

const TIER_NAMES = ["Best of All Time", "S", "A", "B", "C", "D", "E", "F", "-F"];
const TIER_SLUG = {
  "Best of All Time": "best",
  "S": "s",
  "A": "a",
  "B": "b",
  "C": "c",
  "D": "d",
  "E": "e",
  "F": "f",
  "-F": "neg-f"
};
const TIER_VALUES = new Set([
  ...TIER_NAMES,
  "Tier_1", "Tier_2", "Tier_3", "Tier 1", "Tier 2", "Tier 3"
]);

const state = {
  records: [],
  query: "",
  canManage: false,
  activeEditId: null,
  coverCache: loadCoverCache(),
  pendingCovers: new Set()
};

const elements = {
  list: document.querySelector("#animeList"),
  status: document.querySelector("#statusText"),
  search: document.querySelector("#searchInput"),
  refresh: document.querySelector("#refreshBtn"),
  add: document.querySelector("#addBtn"),
  loginLink: document.querySelector(".login-link"),
  themeToggle: document.querySelector("#themeToggleItem"),
  editOverlay: document.querySelector("#editOverlay"),
  editTitleText: document.querySelector("#editTitleText"),
  editForm: document.querySelector("#editForm"),
  editTitle: document.querySelector("#editTitle"),
  titleSuggestions: document.querySelector("#titleSuggestions"),
  editTier: document.querySelector("#editTier"),
  editScore: document.querySelector("#editScore"),
  editNotes: document.querySelector("#editNotes"),
  editError: document.querySelector("#editError"),
  editCancelBtn: document.querySelector("#editCancelBtn"),
  editSaveBtn: document.querySelector("#editSaveBtn")
};

let databases = null;
let account = null;
let Query = null;
let AppwriteID = null;
let coverRenderJob = 0;
let titleSuggestionTimer = null;
let titleSuggestionAbortController = null;
let titleSuggestionRequestId = 0;
let nextCoverFetchAt = 0;
let coverRateLimitedUntil = 0;
let currentDragId = null;
let coverRetryTimer = null;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message) {
  if (elements.status) {
    elements.status.textContent = message;
  }
}

function renderEmpty(message) {
  if (elements.list) {
    elements.list.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }
}

function formatScore(score) {
  return Number.isInteger(score) ? `${score}` : score.toFixed(1);
}

function normalizeTierForDisplay(tier) {
  if (!tier) return null;
  if (TIER_NAMES.includes(tier)) return tier;
  if (tier === "Tier_1" || tier === "Tier 1") return "S";
  if (tier === "Tier_2" || tier === "Tier 2") return "A";
  if (tier === "Tier_3" || tier === "Tier 3") return "B";
  return null;
}

function getTierClass(tier) {
  const normalized = normalizeTierForDisplay(tier);
  if (!normalized) return "";
  return `tier-row-${TIER_SLUG[normalized]}`;
}

function formatTierLabel(tier) {
  if (!tier) {
    return "No tier";
  }
  const normalized = normalizeTierForDisplay(tier);
  return normalized || String(tier);
}

function normalizeTierValue(tier) {
  const value = String(tier || "").trim();
  if (!value) {
    return "";
  }
  if (TIER_NAMES.includes(value)) {
    return value;
  }
  if (value === "Tier 1" || value === "Tier_1") {
    return "S";
  }
  if (value === "Tier 2" || value === "Tier_2") {
    return "A";
  }
  if (value === "Tier 3" || value === "Tier_3") {
    return "B";
  }
  return value;
}

function parseScoreInput(value) {
  const normalized = String(value || "")
    .trim()
    .replace(",", ".");
  return Number(normalized);
}

function getLoginHref() {
  const returnPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const url = new URL("/login", window.location.origin);
  url.searchParams.set("return", returnPath);
  return `${url.pathname}${url.search}`;
}

function updateAuthUi() {
  if (elements.add) {
    elements.add.hidden = !state.canManage;
  }

  if (!elements.loginLink) {
    return;
  }

  if (state.canManage) {
    elements.loginLink.href = "/user";
    elements.loginLink.setAttribute("aria-label", "Account settings");
    elements.loginLink.title = "Account settings";
  } else {
    elements.loginLink.href = getLoginHref();
    elements.loginLink.setAttribute("aria-label", "Login");
    elements.loginLink.removeAttribute("title");
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

function loadCoverCache() {
  const raw = localStorage.getItem(COVER_CACHE_KEY);
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
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

function isCoverRateLimited() {
  return Date.now() < coverRateLimitedUntil;
}

function setCoverRateLimit(durationMs) {
  const next = Date.now() + durationMs;
  if (next > coverRateLimitedUntil) {
    coverRateLimitedUntil = next;
  }
}

async function waitForCoverRequestSlot() {
  const now = Date.now();
  const waitMs = Math.max(0, nextCoverFetchAt - now, coverRateLimitedUntil - now);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  nextCoverFetchAt = Date.now() + COVER_FETCH_MIN_INTERVAL_MS;
}

async function fetchCover(title) {
  const cleanTitle = sanitizeTitle(title);
  const queries = [...new Set([title, cleanTitle].filter(Boolean))];

  for (const query of queries) {
    try {
      const response = await fetch(
        `${JIKAN_PROXY_BASE}?q=${encodeURIComponent(query)}`
      );

      if (!response.ok) {
        if (response.status === 429) {
          return "";
        }
        continue;
      }

      const data = await response.json();
      const best = pickBestMatch(data?.data || [], title);
      const imageUrl = getCoverUrlFromItem(best);
      if (imageUrl) {
        return imageUrl;
      }
    } catch {
      continue;
    }
  }

  return "";
}

function clearTitleSuggestions() {
  if (!elements.titleSuggestions) {
    return;
  }
  elements.titleSuggestions.innerHTML = "";
  elements.titleSuggestions.hidden = true;
}

function getEnglishSuggestionTitle(item) {
  if (!item || typeof item !== "object") {
    return "";
  }
  const raw = typeof item.title_english === "string" ? item.title_english : "";
  return raw.trim();
}

function renderTitleSuggestions(items) {
  if (!elements.titleSuggestions) {
    return;
  }

  if (!Array.isArray(items) || !items.length) {
    clearTitleSuggestions();
    return;
  }

  const markup = items.map((item) => {
    const safeTitle = escapeHtml(item.title);
    const image = item.image
      ? `<img class="title-suggestion-cover" src="${escapeHtml(item.image)}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="title-suggestion-cover" aria-hidden="true"></span>`;
    return `
      <button class="title-suggestion-btn" type="button" data-suggestion-title="${safeTitle}">
        ${image}
        <span class="title-suggestion-name">${safeTitle}</span>
      </button>
    `;
  }).join("");

  elements.titleSuggestions.innerHTML = markup;
  elements.titleSuggestions.hidden = false;
}

function normalizeSuggestionKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function tokenizeForMatch(value) {
  return normalizeForMatch(value)
    .split(" ")
    .filter(Boolean);
}

function isLikelyAnimeSearchQuery(query) {
  const normalized = normalizeForMatch(query);
  if (normalized.length < TITLE_SUGGESTION_MIN_LENGTH) {
    return false;
  }

  const hasLetter = /[a-z]/.test(normalized);
  if (!hasLetter) {
    return false;
  }

  if (normalized.length < 4) {
    return false;
  }

  return true;
}

function getSuggestionRelevance(query, title) {
  const queryNormalized = normalizeForMatch(query);
  const titleNormalized = normalizeForMatch(title);
  if (!queryNormalized || !titleNormalized) {
    return 0;
  }

  if (titleNormalized === queryNormalized) {
    return 100;
  }

  if (titleNormalized.startsWith(queryNormalized)) {
    return 80;
  }

  if (titleNormalized.includes(queryNormalized)) {
    return 65;
  }

  const queryTokens = tokenizeForMatch(queryNormalized);
  const titleTokens = tokenizeForMatch(titleNormalized);
  if (!queryTokens.length || !titleTokens.length) {
    return 0;
  }

  let overlap = 0;
  for (const token of queryTokens) {
    if (titleTokens.some((candidate) => candidate.startsWith(token) || token.startsWith(candidate))) {
      overlap += 1;
    }
  }

  const coverage = overlap / queryTokens.length;
  if (coverage >= 1) {
    return 60;
  }
  if (coverage >= 0.66) {
    return 45;
  }
  if (coverage >= 0.5) {
    return 30;
  }

  return 0;
}

function abortPendingTitleSuggestionRequest() {
  if (titleSuggestionAbortController) {
    titleSuggestionAbortController.abort();
    titleSuggestionAbortController = null;
  }
}

async function loadTitleSuggestions(rawQuery) {
  const query = String(rawQuery || "").trim();
  if (!isLikelyAnimeSearchQuery(query)) {
    clearTitleSuggestions();
    return;
  }

  abortPendingTitleSuggestionRequest();
  const controller = new AbortController();
  titleSuggestionAbortController = controller;
  const requestId = ++titleSuggestionRequestId;

  try {
    const response = await fetch(
      `${JIKAN_PROXY_BASE}?q=${encodeURIComponent(query)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      clearTitleSuggestions();
      return;
    }

    const payload = await response.json();
    if (requestId !== titleSuggestionRequestId) {
      return;
    }

    const seen = new Set();
    const candidates = [];
    const data = Array.isArray(payload?.data) ? payload.data : [];

    for (const entry of data) {
      const title = getEnglishSuggestionTitle(entry);
      if (!title) {
        continue;
      }
      const key = normalizeSuggestionKey(title);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      const relevance = getSuggestionRelevance(query, title);
      if (relevance < 45) {
        continue;
      }
      candidates.push({
        title,
        image: getCoverUrlFromItem(entry),
        relevance
      });
    }

    candidates.sort((left, right) => right.relevance - left.relevance || left.title.localeCompare(right.title));
    renderTitleSuggestions(candidates.slice(0, TITLE_SUGGESTION_LIMIT));
  } catch (error) {
    if (error?.name !== "AbortError") {
      clearTitleSuggestions();
    }
  } finally {
    if (titleSuggestionAbortController === controller) {
      titleSuggestionAbortController = null;
    }
  }
}

function queueTitleSuggestions() {
  if (titleSuggestionTimer) {
    window.clearTimeout(titleSuggestionTimer);
  }

  const value = elements.editTitle ? elements.editTitle.value : "";
  const query = String(value || "").trim();

  if (!isLikelyAnimeSearchQuery(query)) {
    abortPendingTitleSuggestionRequest();
    clearTitleSuggestions();
    return;
  }

  titleSuggestionTimer = window.setTimeout(() => {
    titleSuggestionTimer = null;
    void loadTitleSuggestions(query);
  }, TITLE_SUGGESTION_DEBOUNCE_MS);
}

function applySuggestedTitle(title) {
  if (!elements.editTitle) {
    return;
  }
  elements.editTitle.value = String(title || "").trim();
  clearTitleSuggestions();
  elements.editTitle.focus();
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
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 1100;

  const pending = records.filter((record) => {
    const key = getCoverKey(record.title);
    return key && !Object.prototype.hasOwnProperty.call(state.coverCache, key) && !state.pendingCovers.has(key);
  });

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    if (jobId !== coverRenderJob) return;

    const batch = pending.slice(i, i + BATCH_SIZE);

    await Promise.all(batch.map(async (record) => {
      const key = getCoverKey(record.title);
      if (!key || Object.prototype.hasOwnProperty.call(state.coverCache, key) || state.pendingCovers.has(key)) return;

      state.pendingCovers.add(key);
      const cover = await fetchCover(record.title || "");
      state.pendingCovers.delete(key);

      state.coverCache[key] = cover || "";
      saveCoverCache();

      if (jobId !== coverRenderJob || !cover) return;

      const slot = elements.list.querySelector(`[data-cover-slot="${record.id}"]`);
      if (slot) {
        slot.innerHTML = `<img class="card-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(record.title || "Anime")} cover" loading="lazy" referrerpolicy="no-referrer" />`;
      }
    }));

    if (i + BATCH_SIZE < pending.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}

function normalizeAnimeDocument(document) {
  const errors = [];

  const id = document?.$id || "";
  const title = typeof document?.title === "string" ? document.title.trim() : "";
  if (!title) {
    errors.push("title is required and must be a non-empty string.");
  } else if (title.length > 255) {
    errors.push("title exceeds max length 255.");
  }

  let tier = null;
  if (document?.tier !== null && document?.tier !== undefined && String(document.tier).trim() !== "") {
    tier = normalizeTierValue(document.tier);
    if (!TIER_VALUES.has(tier)) {
      errors.push("tier must be one of: Best of All Time, S, A, B, C, D, E, F, -F.");
    }
  }

  let notes = "";
  if (document?.notes !== null && document?.notes !== undefined) {
    if (typeof document.notes !== "string") {
      errors.push("notes must be a string when provided.");
    } else if (document.notes.length > 1000) {
      errors.push("notes exceeds max length 1000.");
    } else {
      notes = document.notes.trim();
    }
  }

  let rank = null;
  if (document?.rank !== null && document?.rank !== undefined && String(document.rank).trim() !== "") {
    rank = Number(document.rank);
    if (!Number.isFinite(rank)) {
      errors.push("rank must be a number when provided.");
    } else if (rank < 0 || rank > 2000) {
      errors.push("rank must be between 0 and 2000.");
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: `Invalid document ${id || "(no id)"}: ${errors.join(" ")}`
    };
  }

  return {
    ok: true,
    value: {
      id,
      title,
      tier,
      notes,
      rank
    }
  };
}


async function fetchAnimeRankingDirect() {
  const records = [];
  let cursorAfter = null;
  let safetyCounter = 0;
  const invalid = [];

  while (true) {
    const queries = [Query.limit(PAGE_SIZE)];

    if (cursorAfter) {
      queries.push(Query.cursorAfter(cursorAfter));
    }

    const result = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      ANIME_COLLECTION_ID,
      queries
    );

    const documents = Array.isArray(result?.documents) ? result.documents : [];
    for (const document of documents) {
      const normalized = normalizeAnimeDocument(document);
      if (normalized.ok) {
        records.push(normalized.value);
      } else {
        invalid.push(normalized.error);
      }
    }

    if (documents.length < PAGE_SIZE) {
      break;
    }

    cursorAfter = documents[documents.length - 1]?.$id || null;
    safetyCounter += 1;
    if (safetyCounter > 1000) {
      throw new Error("Pagination safety limit reached while reading anime_ranking.");
    }
  }

  return {
    records,
    invalid
  };
}

async function fetchAnimeRanking() {
  const invalid = [];

  try {
    const response = await fetch(APPWRITE_PROXY_URL);
    if (!response.ok) {
      throw new Error(`Anime worker responded with status ${response.status}.`);
    }

    const payload = await response.json();
    const documents = Array.isArray(payload?.documents) ? payload.documents : [];
    const records = [];

    for (const document of documents) {
      const normalized = normalizeAnimeDocument(document);
      if (normalized.ok) {
        records.push(normalized.value);
      } else {
        invalid.push(normalized.error);
      }
    }

    const total = Number(payload?.total);
    if (Number.isFinite(total) && total > documents.length) {
      return await fetchAnimeRankingDirect();
    }

    return {
      records,
      invalid
    };
  } catch {
    return await fetchAnimeRankingDirect();
  }
}

function getFilteredRecords() {
  const term = state.query.trim().toLowerCase();
  if (!term) {
    return state.records;
  }

  return state.records.filter((record) => {
    const haystack = [
      record.title,
      normalizeTierForDisplay(record.tier) || record.tier || "",
      record.notes || "",
      record.score,
      record.rank
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });
}

function renderList() {
  const filtered = getFilteredRecords();

  if (!filtered.length) {
    renderEmpty("No anime found for the current search.");
    if (state.query) {
      setStatus(`Showing 0 of ${state.records.length} anime.`);
    } else {
      setStatus("No anime found.");
    }
    return;
  }

  // Group records by display tier
  const groups = {};
  for (const name of TIER_NAMES) {
    groups[name] = [];
  }
  const unranked = [];

  for (const record of filtered) {
    const tier = normalizeTierForDisplay(record.tier);
    if (tier) {
      groups[tier].push(record);
    } else {
      unranked.push(record);
    }
  }

  // Main tier chart
  let html = '<div class="tier-chart">';
  for (const tier of TIER_NAMES) {
    const items = groups[tier];
    const slug = TIER_SLUG[tier];
    const thumbnails = items.map((record) => `
      <div class="tier-thumb" title="${escapeHtml(record.title)}" data-record-id="${escapeHtml(record.id)}">
        <div class="tier-thumb-media" data-cover-slot="${escapeHtml(record.id)}">
          ${renderCardCover(record)}
        </div>
      </div>
    `).join("");
    html += `
      <div class="tier-row tier-row-${slug}" data-tier="${slug}">
        <div class="tier-row-label"><span>${escapeHtml(tier)}</span></div>
        <div class="tier-row-items">${thumbnails}</div>
      </div>
    `;
  }
  html += "</div>";

  // Unranked pool below the chart
  html += '<div class="unranked-pool">';
  html += '<h3 class="unranked-heading">Unranked</h3>';
  if (unranked.length > 0) {
    html += '<div class="unranked-items">';
    for (const record of unranked) {
      const editBtn = state.canManage
        ? `<button class="card-action-btn" type="button" data-action="edit" data-id="${escapeHtml(record.id)}">Edit</button>`
        : "";
      html += `
        <div class="unranked-card" data-record-id="${escapeHtml(record.id)}" title="${escapeHtml(record.title)}">
          <div class="unranked-cover" data-cover-slot="${escapeHtml(record.id)}">
            ${renderCardCover(record)}
          </div>
          <p class="unranked-title">${escapeHtml(record.title)}</p>
          ${editBtn}
        </div>
      `;
    }
    html += '</div>';
  } else {
    html += '<div class="unranked-items unranked-empty"><p class="unranked-empty-text">No unranked anime.</p></div>';
  }
  html += '</div>';

  if (elements.list) {
    elements.list.innerHTML = html;
  }

  if (state.query) {
    setStatus(`Showing ${filtered.length} of ${state.records.length} anime.`);
  } else {
    setStatus(`${state.records.length} anime loaded.`);
  }

  coverRenderJob += 1;
  void enrichVisibleCovers(filtered, coverRenderJob);

  if (state.canManage) {
    addDragAndDrop();
  }
}

function addDragAndDrop() {
  if (!state.canManage || !elements.list) {
    return;
  }

  function makeDraggable(el) {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (e) => {
      currentDragId = el.dataset.recordId;
      e.dataTransfer.setData("text/plain", currentDragId);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      elements.list.querySelectorAll(".tier-row.drag-over, .unranked-pool.drag-over").forEach((t) => t.classList.remove("drag-over"));
      currentDragId = null;
    });
  }

  elements.list.querySelectorAll(".tier-thumb[data-record-id], .unranked-card[data-record-id]").forEach(makeDraggable);

  async function handleTierDrop(e, newTier) {
    e.preventDefault();
    const recordId = currentDragId || e.dataTransfer.getData("text/plain");
    if (!recordId || !databases) return;
    const record = state.records.find((r) => r.id === recordId);
    if (!record) return;
    if (normalizeTierForDisplay(record.tier) === newTier) return;
    try {
      await databases.updateDocument(APPWRITE_DATABASE_ID, ANIME_COLLECTION_ID, recordId, { tier: newTier });
      record.tier = newTier;
      renderList();
      setStatus(`Moved "${record.title}" to ${newTier !== null ? newTier : "Unranked"}.`);
    } catch (error) {
      setStatus(`Failed to update tier: ${error?.message || "Unknown error"}`);
    }
  }

  elements.list.querySelectorAll(".tier-row[data-tier]").forEach((row) => {
    row.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    row.addEventListener("dragenter", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
    row.addEventListener("dragleave", (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove("drag-over"); });
    row.addEventListener("drop", async (e) => {
      row.classList.remove("drag-over");
      const slug = row.dataset.tier;
      const newTier = TIER_NAMES.find((t) => TIER_SLUG[t] === slug);
      if (newTier) await handleTierDrop(e, newTier);
    });
  });

  const unrankedPool = elements.list.querySelector(".unranked-pool");
  if (unrankedPool) {
    unrankedPool.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    unrankedPool.addEventListener("dragenter", (e) => { e.preventDefault(); unrankedPool.classList.add("drag-over"); });
    unrankedPool.addEventListener("dragleave", (e) => { if (!unrankedPool.contains(e.relatedTarget)) unrankedPool.classList.remove("drag-over"); });
    unrankedPool.addEventListener("drop", async (e) => {
      unrankedPool.classList.remove("drag-over");
      const recordId = currentDragId || e.dataTransfer.getData("text/plain");
      if (!recordId || !databases) return;
      const record = state.records.find((r) => r.id === recordId);
      if (!record || !record.tier) return;
      await handleTierDrop(e, null);
    });
  }
}

async function loadAnimeList() {
  if (elements.refresh) {
    elements.refresh.disabled = true;
  }
  setStatus("Loading anime list...");

  try {
    const result = await fetchAnimeRanking();
    state.records = result.records;
    renderList();

    if (result.invalid.length > 0) {
      console.warn("Skipped invalid anime_ranking documents:", result.invalid);
    }
  } catch (error) {
    state.records = [];
    renderEmpty(error?.message || "Unable to load anime list.");
    setStatus("Failed to load anime list.");
  } finally {
    if (elements.refresh) {
      elements.refresh.disabled = false;
    }
  }
}

function setEditError(message) {
  if (elements.editError) {
    elements.editError.textContent = message || "";
  }
}

function setEditLoading(isLoading) {
  if (!elements.editSaveBtn) {
    return;
  }

  if (!elements.editSaveBtn.dataset.label) {
    elements.editSaveBtn.dataset.label = elements.editSaveBtn.textContent;
  }

  elements.editSaveBtn.disabled = isLoading;
  elements.editSaveBtn.textContent = isLoading ? "Saving..." : elements.editSaveBtn.dataset.label;

  if (elements.editCancelBtn) {
    elements.editCancelBtn.disabled = isLoading;
  }
}

function openEditor(record) {
  if (!state.canManage || !elements.editOverlay) {
    return;
  }

  state.activeEditId = record?.id || null;

  if (elements.editTitleText) {
    elements.editTitleText.textContent = state.activeEditId ? "Edit Anime" : "Add Anime";
  }

  if (elements.editTitle) {
    elements.editTitle.value = record?.title || "";
  }
  if (elements.editTier) {
    elements.editTier.value = record?.tier ? formatTierLabel(record.tier) : "";
  }
  if (elements.editNotes) {
    elements.editNotes.value = record?.notes || "";
  }

  abortPendingTitleSuggestionRequest();
  clearTitleSuggestions();
  setEditError("");
  elements.editOverlay.hidden = false;
  elements.editOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");

  if (elements.editTitle) {
    elements.editTitle.focus();
    elements.editTitle.select();
  }
}

function closeEditor() {
  if (!elements.editOverlay) {
    return;
  }

  state.activeEditId = null;
  if (titleSuggestionTimer) {
    window.clearTimeout(titleSuggestionTimer);
    titleSuggestionTimer = null;
  }
  abortPendingTitleSuggestionRequest();
  clearTitleSuggestions();
  setEditError("");
  setEditLoading(false);
  elements.editOverlay.hidden = true;
  elements.editOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function getEditorPayload() {
  const title = elements.editTitle ? elements.editTitle.value.trim() : "";
  const tierRaw = elements.editTier ? normalizeTierValue(elements.editTier.value) : "";
  const notes = elements.editNotes ? elements.editNotes.value.trim() : "";

  if (!title) {
    return { ok: false, error: "Title is required." };
  }
  if (title.length > 255) {
    return { ok: false, error: "Title must be 255 characters or fewer." };
  }

  if (tierRaw && !TIER_VALUES.has(tierRaw)) {
    return { ok: false, error: "Tier must be one of: Best of All Time, S, A, B, C, D, E, F, -F." };
  }

  if (notes.length > 1000) {
    return { ok: false, error: "Notes must be 1000 characters or fewer." };
  }

  return {
    ok: true,
    payload: {
      title,
      tier: tierRaw || null,
      notes
    }
  };
}

async function saveEditor(event) {
  event.preventDefault();

  if (!state.canManage) {
    setEditError("You need to sign in to modify entries.");
    return;
  }

  if (!databases || !AppwriteID) {
    setEditError("Appwrite SDK is not initialized.");
    return;
  }

  const parsed = getEditorPayload();
  if (!parsed.ok) {
    setEditError(parsed.error);
    return;
  }

  setEditError("");
  setEditLoading(true);

  const editId = state.activeEditId;
  const successText = editId ? "Anime entry updated." : "Anime entry created.";

  try {
    if (editId) {
      await databases.updateDocument(
        APPWRITE_DATABASE_ID,
        ANIME_COLLECTION_ID,
        editId,
        parsed.payload
      );
    } else {
      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        ANIME_COLLECTION_ID,
        AppwriteID.unique(),
        parsed.payload
      );
    }

    closeEditor();
    await loadAnimeList();
    setStatus(successText);
  } catch (error) {
    setEditError(error?.message || "Could not save anime entry.");
    setEditLoading(false);
  }
}

function handleListClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const editButton = target.closest('[data-action="edit"]');
  if (!editButton) {
    return;
  }

  if (!state.canManage) {
    return;
  }

  const recordId = editButton.getAttribute("data-id") || "";
  if (!recordId) {
    return;
  }

  const record = state.records.find((entry) => entry.id === recordId);
  if (!record) {
    setStatus("Could not find that anime entry. Refresh and try again.");
    return;
  }

  openEditor(record);
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (elements.titleSuggestions && !elements.titleSuggestions.hidden) {
    clearTitleSuggestions();
    return;
  }

  if (!elements.editOverlay || elements.editOverlay.hidden) {
    return;
  }

  closeEditor();
}

function initEvents() {
  if (elements.search) {
    elements.search.addEventListener("input", (event) => {
      state.query = event.target.value || "";
      renderList();
    });
  }

  if (elements.refresh) {
    elements.refresh.addEventListener("click", () => {
      void loadAnimeList();
    });
  }

  if (elements.add) {
    elements.add.addEventListener("click", () => {
      openEditor(null);
    });
  }

  if (elements.list) {
    elements.list.addEventListener("click", handleListClick);
  }

  if (elements.editForm) {
    elements.editForm.addEventListener("submit", (event) => {
      void saveEditor(event);
    });
  }

  if (elements.editTitle) {
    elements.editTitle.addEventListener("input", () => {
      queueTitleSuggestions();
    });

    elements.editTitle.addEventListener("blur", () => {
      window.setTimeout(() => {
        clearTitleSuggestions();
      }, 130);
    });
  }

  if (elements.titleSuggestions) {
    elements.titleSuggestions.addEventListener("mousedown", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      const button = target.closest("[data-suggestion-title]");
      if (!button) {
        return;
      }
      event.preventDefault();
      const title = button.getAttribute("data-suggestion-title") || "";
      applySuggestedTitle(title);
    });
  }

  if (elements.editCancelBtn) {
    elements.editCancelBtn.addEventListener("click", () => {
      closeEditor();
    });
  }

  if (elements.editOverlay) {
    elements.editOverlay.addEventListener("click", (event) => {
      if (event.target === elements.editOverlay) {
        closeEditor();
      }
    });
  }

  document.addEventListener("keydown", handleGlobalKeydown);
}

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    throw new Error("Appwrite SDK is not loaded. Check the CDN <script> tag.");
  }

  const { Client, Databases, Query: AppwriteQuery, Account, ID } = Appwrite;
  Query = AppwriteQuery;
  AppwriteID = ID;

  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  databases = new Databases(client);
  account = new Account(client);
}

async function refreshAuthState() {
  if (!account) {
    state.canManage = false;
    updateAuthUi();
    return;
  }

  try {
    await account.get();
    state.canManage = true;
  } catch {
    state.canManage = false;
  }

  updateAuthUi();
}

async function init() {
  if (elements.add) {
    elements.add.hidden = true;
  }
  if (elements.editOverlay) {
    elements.editOverlay.hidden = true;
    elements.editOverlay.setAttribute("aria-hidden", "true");
  }

  initThemeToggle();
  initEvents();

  try {
    initAppwrite();
  } catch (error) {
    renderEmpty(error?.message || "Appwrite initialization failed.");
    setStatus("Failed to initialize Appwrite.");
    return;
  }

  await refreshAuthState();
  await loadAnimeList();
}

void init();
