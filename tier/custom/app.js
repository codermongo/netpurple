// ── User-Tierlist variant of tier/app.js ────────────────────────────
// Config is NOT set by a per-page file. It is derived at runtime from the
// `user_tierlists` document identified by ?id=<listId> (see init()).
// tier/app.js (the three curated lists) is intentionally left untouched.
const COLLECTION_ID = "user_tierlist_items";
const LISTS_COLLECTION_ID = "user_tierlists";
const COVER_CACHE_KEY = "tier_cover_cache_v1";
const MAX_ITEMS = 50;

// Set once the list document is loaded.
let LIST_ID = "";
let LIST_OWNER = "";
let LIST_VISIBILITY = "private";
let LIST_TIERS = ["S", "A", "B", "C", "D", "E", "F"];
let ITEM_LABEL = "Entry";
let ITEM_LABEL_LC = "entry";
let EXPORT_FILENAME = "tier-ranking";
let COVER_API_TYPE = "anime";
const SQUARE_COVERS = false;

const CATEGORY_META = {
  anime: { label: "Anime", coverApi: "anime", file: "anime-ranking" },
  games: { label: "Game", coverApi: "games", file: "games-ranking" },
  series: { label: "Series", coverApi: "series", file: "series-ranking" }
};

const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";
const SHARE_COLLECTION_ID = "shared_tierlists";
const PAGE_SIZE = 100;
const THEME_KEY = "darkMode";
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
  readOnly: false,
  currentUserId: "",
  editMode: false,
  shareMode: false,
  activeEditId: null,
  activeQuickEditId: null,
  coverCache: loadCoverCache(),
  pendingCovers: new Set(),
  pendingCoverUrl: ""
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
  editPlayTime: document.querySelector("#editPlayTime"),
  editStoryLength: document.querySelector("#editStoryLength"),
  editPrice: document.querySelector("#editPrice"),
  editNotes: document.querySelector("#editNotes"),
  editError: document.querySelector("#editError"),
  editCancelBtn: document.querySelector("#editCancelBtn"),
  editSaveBtn: document.querySelector("#editSaveBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  exportOverlay: document.querySelector("#exportOverlay"),
  exportCancelBtn: document.querySelector("#exportCancelBtn"),
  exportConfirmBtn: document.querySelector("#exportConfirmBtn"),
  shareBtn: document.querySelector("#shareBtn"),
  shareBanner: document.querySelector("#shareBanner"),
  shareBannerLiveLink: document.querySelector("#shareBannerLiveLink"),
  shareOverlay: document.querySelector("#shareOverlay"),
  shareResultField: document.querySelector("#shareResultField"),
  shareLinkInput: document.querySelector("#shareLinkInput"),
  shareError: document.querySelector("#shareError"),
  shareCancelBtn: document.querySelector("#shareCancelBtn"),
  shareCopyBtn: document.querySelector("#shareCopyBtn"),
  shareConfirmBtn: document.querySelector("#shareConfirmBtn"),
  editModeBtn: document.querySelector("#editModeBtn"),
  tooltip: document.querySelector("#animeTooltip"),
  quickEditOverlay: document.querySelector("#quickEditOverlay"),
  quickEditTitleText: document.querySelector("#quickEditTitleText"),
  quickEditNotes: document.querySelector("#quickEditNotes"),
  quickEditError: document.querySelector("#quickEditError"),
  quickCancelBtn: document.querySelector("#quickCancelBtn"),
  quickSaveBtn: document.querySelector("#quickSaveBtn"),
  quickDeleteBtn: document.querySelector("#quickDeleteBtn"),
  playTimeInfo: document.querySelector("#playTimeInfo"),
  gameInfo: document.querySelector("#gameInfo")
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

// Row-level permissions for a new item — mirror the parent list's visibility.
function itemPermissions() {
  const owner = `user:${LIST_OWNER}`;
  return [
    `update("${owner}")`,
    `delete("${owner}")`,
    LIST_VISIBILITY === "public" ? 'read("any")' : `read("${owner}")`
  ];
}

function updateAuthUi() {
  if (elements.add) {
    elements.add.hidden = !state.canManage;
  }
  if (elements.editModeBtn) {
    elements.editModeBtn.hidden = !state.canManage;
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

// Dark Mode + Performance werden global von /config.js verwaltet.

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

function defaultTitleVariants(item) {
  return [item?.title, item?.title_english, item?.title_japanese].filter(Boolean);
}

function pickBestMatch(items, title, getVariants) {
  if (!Array.isArray(items) || !items.length) {
    return null;
  }

  const variantsOf = typeof getVariants === "function" ? getVariants : defaultTitleVariants;
  const needle = normalizeForMatch(title);
  if (!needle) {
    return items[0];
  }

  let best = null;
  let bestScore = -1;

  for (const item of items) {
    const variants = variantsOf(item);
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

// Per-category search providers. Each page sets COVER_API_TYPE via TIER_PAGE_CONFIG
// so anime/series/games route to the source that actually knows that content type.
const PROVIDERS = {
  anime: {
    throttled: true,
    async search(query, signal) {
      const response = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=8&sfw=true`,
        { signal }
      );
      if (response.status === 429) {
        setCoverRateLimit(COVER_FETCH_COOLDOWN_MS);
        return [];
      }
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return Array.isArray(data?.data) ? data.data : [];
    },
    titleVariants: defaultTitleVariants,
    displayTitle: getEnglishSuggestionTitle,
    cover: getCoverUrlFromItem
  },
  series: {
    throttled: false,
    async search(query, signal) {
      const response = await fetch(
        `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(query)}`,
        { signal }
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      const list = Array.isArray(data) ? data : [];
      return list.map((entry) => entry?.show).filter(Boolean);
    },
    titleVariants: (item) => [item?.name].filter(Boolean),
    displayTitle: (item) => String(item?.name || "").trim(),
    cover: (item) => item?.image?.original || item?.image?.medium || ""
  },
  games: {
    throttled: false,
    async search(query, signal) {
      const response = await fetch(
        `https://www.cheapshark.com/api/1.0/games?title=${encodeURIComponent(query)}&limit=10`,
        { signal }
      );
      if (!response.ok) {
        return [];
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    titleVariants: (item) => [item?.external].filter(Boolean),
    displayTitle: (item) => String(item?.external || "").trim(),
    // CheapShark thumbnails are small Steam capsules — good enough for a suggestion
    // preview, not for the stored cover_url (see fetchCover()).
    cover: (item) => item?.thumb || ""
  }
};

// Definitive cover lookup (used on save + background backfill), tries the raw title
// first, then a sanitized variant, and returns on the first usable hit.
async function fetchCoverForType(type, title) {
  const provider = PROVIDERS[type];
  if (!provider) {
    return "";
  }

  const cleanTitle = sanitizeTitle(title);
  const queries = [...new Set([title, cleanTitle].filter(Boolean))];

  for (const query of queries) {
    try {
      if (provider.throttled) {
        await waitForCoverRequestSlot();
      }
      if (isCoverRateLimited()) {
        return "";
      }

      const items = await provider.search(query);
      const best = pickBestMatch(items, title, provider.titleVariants);
      const coverUrl = best ? provider.cover(best) || "" : "";
      if (coverUrl) {
        return coverUrl;
      }
    } catch {
      continue;
    }
  }

  return "";
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

async function fetchCoverFromItunes(title, artist) {
  const term = [title, artist].filter(Boolean).join(" ");
  const cleanTerm = sanitizeTitle(term);
  const queries = [...new Set([term, cleanTerm, title].filter(Boolean))];

  for (const query of queries) {
    try {
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=song&limit=5`
      );
      if (!response.ok) continue;
      const data = await response.json();
      const results = Array.isArray(data?.results) ? data.results : [];
      if (!results.length) continue;
      const raw = results[0]?.artworkUrl100 || "";
      if (raw) {
        return raw.replace("100x100bb", "600x600bb");
      }
    } catch {
      continue;
    }
  }

  return "";
}

async function fetchCover(title, artist) {
  if (COVER_API_TYPE === "music") {
    return fetchCoverFromItunes(title, artist || "");
  }
  if (COVER_API_TYPE === "anime" || COVER_API_TYPE === "series") {
    return fetchCoverForType(COVER_API_TYPE, title);
  }
  // "games" intentionally has no live cover fetch here — CheapShark thumbnails are
  // too small to store as cover_url. High-quality Steam grid covers are backfilled
  // separately (see the SteamGridDB maintenance script) so cover_url stays empty
  // until that script fills it in.
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
    const safeImage = escapeHtml(item.image || "");
    const image = item.image
      ? `<img class="title-suggestion-cover" src="${safeImage}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" />`
      : `<span class="title-suggestion-cover" aria-hidden="true"></span>`;
    return `
      <button class="title-suggestion-btn" type="button" data-suggestion-title="${safeTitle}" data-suggestion-image="${safeImage}">
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

function isLikelySearchQuery(query) {
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
  if (!isLikelySearchQuery(query)) {
    clearTitleSuggestions();
    return;
  }

  const provider = PROVIDERS[COVER_API_TYPE];
  if (!provider) {
    clearTitleSuggestions();
    return;
  }

  abortPendingTitleSuggestionRequest();
  const controller = new AbortController();
  titleSuggestionAbortController = controller;
  const requestId = ++titleSuggestionRequestId;

  try {
    if (provider.throttled) {
      await waitForCoverRequestSlot();
    }
    if (isCoverRateLimited()) {
      clearTitleSuggestions();
      return;
    }

    const items = await provider.search(query, controller.signal);
    if (requestId !== titleSuggestionRequestId) {
      return;
    }

    const seen = new Set();
    const candidates = [];

    for (const item of items) {
      const title = provider.displayTitle(item);
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
        image: provider.cover(item) || "",
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

  state.pendingCoverUrl = "";

  const value = elements.editTitle ? elements.editTitle.value : "";
  const query = String(value || "").trim();

  if (!isLikelySearchQuery(query)) {
    abortPendingTitleSuggestionRequest();
    clearTitleSuggestions();
    return;
  }

  titleSuggestionTimer = window.setTimeout(() => {
    titleSuggestionTimer = null;
    void loadTitleSuggestions(query);
  }, TITLE_SUGGESTION_DEBOUNCE_MS);
}

function applySuggestedTitle(title, image) {
  if (!elements.editTitle) {
    return;
  }
  elements.editTitle.value = String(title || "").trim();
  // "games" never persists a cover_url from the live suggestion source (CheapShark
  // thumbnails are too small) — see fetchCover() for why.
  state.pendingCoverUrl = COVER_API_TYPE !== "games" ? String(image || "").trim() : "";
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
  const url = record.cover_url || state.coverCache[getCoverKey(record.title)] || "";
  const safeTitle = escapeHtml(record.title || ITEM_LABEL);

  if (url) {
    return `<img class="card-cover" src="${escapeHtml(url)}" alt="${safeTitle} cover" loading="lazy" referrerpolicy="no-referrer" />`;
  }

  return createPlaceholder(record.title);
}

async function enrichVisibleCovers(records, jobId) {
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 1100;

  const pending = records.filter((record) => {
    if (record.cover_url) return false;
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
      const cover = await fetchCover(record.title || "", record.artist || "");
      state.pendingCovers.delete(key);

      state.coverCache[key] = cover || "";
      saveCoverCache();

      if (jobId !== coverRenderJob || !cover) return;

      const slot = elements.list.querySelector(`[data-cover-slot="${record.id}"]`);
      if (slot) {
        slot.innerHTML = `<img class="card-cover" src="${escapeHtml(cover)}" alt="${escapeHtml(record.title || ITEM_LABEL)} cover" loading="lazy" referrerpolicy="no-referrer" />`;
      }
    }));

    if (i + BATCH_SIZE < pending.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }
}

function normalizeDocument(document) {
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

  let tier_position = null;
  if (document?.tier_position !== null && document?.tier_position !== undefined && String(document.tier_position).trim() !== "") {
    tier_position = parseFloat(document.tier_position);
    if (!Number.isFinite(tier_position)) {
      errors.push("tier_position must be a number when provided.");
    }
  }

  let play_time = null;
  if (document?.play_time !== null && document?.play_time !== undefined && String(document.play_time).trim() !== "") {
    play_time = parseFloat(document.play_time);
    if (!Number.isFinite(play_time) || play_time < 0) {
      errors.push("play_time must be a non-negative number when provided.");
    }
  }

  let story_length = null;
  if (document?.story_length !== null && document?.story_length !== undefined && String(document.story_length).trim() !== "") {
    story_length = parseFloat(document.story_length);
    if (!Number.isFinite(story_length) || story_length < 0) {
      errors.push("story_length must be a non-negative number when provided.");
    }
  }

  let price = null;
  if (document?.price !== null && document?.price !== undefined && String(document.price).trim() !== "") {
    price = parseFloat(document.price);
    if (!Number.isFinite(price) || price < 0) {
      errors.push("price must be a non-negative number when provided.");
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      error: `Invalid document ${id || "(no id)"}: ${errors.join(" ")}`
    };
  }

  const coverUrl = typeof document?.cover_url === "string" ? document.cover_url.trim() : "";
  const artist = typeof document?.artist === "string" ? document.artist.trim() : "";
  const ytUrl = typeof document?.youtube_url === "string" ? document.youtube_url.trim() : "";

  return {
    ok: true,
    value: {
      id,
      title,
      tier,
      notes,
      tier_position,
      cover_url: coverUrl,
      artist,
      yt_url: ytUrl,
      play_time,
      story_length,
      price
    }
  };
}


async function fetchRankingDirect() {
  const records = [];
  let cursorAfter = null;
  let safetyCounter = 0;
  const invalid = [];

  while (true) {
    const queries = [Query.equal("list_id", LIST_ID), Query.limit(PAGE_SIZE)];

    if (cursorAfter) {
      queries.push(Query.cursorAfter(cursorAfter));
    }

    const result = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      COLLECTION_ID,
      queries
    );

    const documents = Array.isArray(result?.documents) ? result.documents : [];
    for (const document of documents) {
      const normalized = normalizeDocument(document);
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
      throw new Error("Pagination safety limit reached.");
    }
  }

  return {
    records,
    invalid
  };
}

async function fetchRanking() {
  return fetchRankingDirect();
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
      record.notes || ""
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(term);
  });
}

function formatPlayTime(totalMinutes) {
  const safeMinutes = Number.isFinite(totalMinutes) ? Math.max(0, totalMinutes) : 0;
  const days = Math.floor(safeMinutes / 1440);
  const hours = Math.floor((safeMinutes % 1440) / 60);
  const totalHours = Math.round(safeMinutes / 60);
  return `${days} days ${hours} hrs. (${totalHours.toLocaleString()} hrs. total)`;
}

function updatePlayTimeSummary() {
  if (!elements.playTimeInfo) {
    return;
  }

  const totalMinutes = state.records.reduce((sum, record) => {
    const isRanked = !!normalizeTierForDisplay(record.tier);
    return isRanked && Number.isFinite(record.play_time) ? sum + record.play_time : sum;
  }, 0);

  elements.playTimeInfo.textContent = totalMinutes > 0
    ? `Total Play Time: ${formatPlayTime(totalMinutes)}`
    : "Total Play Time: —";
}

function updateGameInfoSummary() {
  if (!elements.gameInfo) {
    return;
  }

  const ranked = state.records.filter((record) => !!normalizeTierForDisplay(record.tier));
  const storyValues = ranked.map((record) => record.story_length).filter((value) => Number.isFinite(value));
  const priceValues = ranked.map((record) => record.price).filter((value) => Number.isFinite(value));

  const avgStory = storyValues.length
    ? storyValues.reduce((sum, value) => sum + value, 0) / storyValues.length
    : null;
  const totalPrice = priceValues.length
    ? priceValues.reduce((sum, value) => sum + value, 0)
    : null;

  const storyText = avgStory !== null ? `Ø ${avgStory.toFixed(1)} hrs. story` : "Ø story: —";
  const priceText = totalPrice !== null
    ? `${totalPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € total`
    : "Total price: —";

  elements.gameInfo.textContent = `${storyText} · ${priceText}`;
}

function renderList() {
  const filtered = getFilteredRecords();
  updatePlayTimeSummary();
  updateGameInfoSummary();

  // Only bail out for an active search with no hits. With no search we still
  // draw the (possibly empty) tier chart so a brand-new list shows its rows.
  if (!filtered.length && state.query) {
    renderEmpty(`No ${ITEM_LABEL_LC} found for the current search.`);
    setStatus(`Showing 0 of ${state.records.length} ${ITEM_LABEL_LC}.`);
    return;
  }

  // Group records by display tier. Only tiers this list actually has get a row;
  // an item whose tier is not among LIST_TIERS drops into the unranked pool.
  const groups = {};
  for (const name of LIST_TIERS) {
    groups[name] = [];
  }
  const unranked = [];

  for (const record of filtered) {
    const tier = normalizeTierForDisplay(record.tier);
    if (tier && groups[tier]) {
      groups[tier].push(record);
    } else {
      unranked.push(record);
    }
  }

  for (const tier of LIST_TIERS) {
    groups[tier].sort((a, b) => {
      if (a.tier_position === null && b.tier_position === null) return 0;
      if (a.tier_position === null) return 1;
      if (b.tier_position === null) return -1;
      return a.tier_position - b.tier_position;
    });
  }

  // Main tier chart
  let html = '<div class="tier-chart">';
  for (const tier of LIST_TIERS) {
    const items = groups[tier];
    const slug = TIER_SLUG[tier];
    const thumbnails = items.map((record) => `
      <div class="tier-thumb" title="${escapeHtml(record.title)}" data-id="${escapeHtml(record.id)}" data-position="${record.tier_position ?? ""}"${record.notes ? ` data-notes="${escapeHtml(record.notes)}"` : ""}${record.yt_url ? ` data-yt-url="${escapeHtml(record.yt_url)}"` : ""}>
        <div class="tier-thumb-media" data-cover-slot="${escapeHtml(record.id)}">
          ${renderCardCover(record)}
        </div>
        ${state.canManage ? `<div class="card-edit-overlay"><button class="card-edit-overlay-btn" type="button" data-action="quick-edit" data-id="${escapeHtml(record.id)}">Edit</button><button class="card-edit-overlay-btn delete" type="button" data-action="quick-delete" data-id="${escapeHtml(record.id)}">Delete</button></div>` : ""}
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
  html += '<h3 class="unranked-heading">Unranked / To Finish</h3>';
  if (unranked.length > 0) {
    html += '<div class="unranked-items">';
    for (const record of unranked) {
      html += `
        <div class="unranked-card" data-id="${escapeHtml(record.id)}" data-position="${record.tier_position ?? ""}" title="${escapeHtml(record.title)}"${record.notes ? ` data-notes="${escapeHtml(record.notes)}"` : ""}${record.yt_url ? ` data-yt-url="${escapeHtml(record.yt_url)}"` : ""}>
          <div class="unranked-cover" data-cover-slot="${escapeHtml(record.id)}">
            ${renderCardCover(record)}
          </div>
          <p class="unranked-title">${escapeHtml(record.title)}</p>
          ${state.canManage ? `<div class="card-edit-overlay"><button class="card-edit-overlay-btn" type="button" data-action="quick-edit" data-id="${escapeHtml(record.id)}">Edit</button><button class="card-edit-overlay-btn delete" type="button" data-action="quick-delete" data-id="${escapeHtml(record.id)}">Delete</button></div>` : ""}
        </div>
      `;
    }
    html += '</div>';
  } else {
    html += `<div class="unranked-items unranked-empty"><p class="unranked-empty-text">No unranked ${ITEM_LABEL_LC}.</p></div>`;
  }
  html += '</div>';

  if (elements.list) {
    elements.list.innerHTML = html;
    elements.list.classList.toggle("edit-mode", state.editMode);
  }

  if (state.query) {
    setStatus(`Showing ${filtered.length} of ${state.records.length} ${ITEM_LABEL_LC}.`);
  } else if (!state.records.length) {
    setStatus(state.canManage ? "Empty list — hit “Add” to place your first entry." : "This list is empty.");
  } else {
    setStatus(`${state.records.length} ${ITEM_LABEL_LC} loaded.`);
  }

  coverRenderJob += 1;
  void enrichVisibleCovers(filtered, coverRenderJob);

  if (!state.editMode) {
    attachTooltipListeners();
    if (!state.shareMode && !state.readOnly && state.canManage) {
      addDragAndDrop();
    }
  }
}

function showTooltip(el, text) {
  if (!elements.tooltip || !text) return;
  elements.tooltip.textContent = text;
  elements.tooltip.hidden = false;
  const rect = el.getBoundingClientRect();
  const showBelow = rect.top < 90;
  elements.tooltip.style.left = `${rect.left + rect.width / 2}px`;
  if (showBelow) {
    elements.tooltip.style.top = `${rect.bottom + 8}px`;
    elements.tooltip.style.transform = "translateX(-50%)";
  } else {
    elements.tooltip.style.top = `${rect.top - 8}px`;
    elements.tooltip.style.transform = "translateX(-50%) translateY(-100%)";
  }
}

function hideTooltip() {
  if (elements.tooltip) elements.tooltip.hidden = true;
}

function attachTooltipListeners() {
  if (!elements.list) return;
  elements.list.querySelectorAll("[data-notes]").forEach((el) => {
    el.addEventListener("mouseenter", () => showTooltip(el, el.dataset.notes));
    el.addEventListener("mouseleave", hideTooltip);
  });
}

function setQuickEditError(message) {
  if (elements.quickEditError) {
    elements.quickEditError.textContent = message || "";
  }
}

function setQuickEditLoading(isLoading) {
  if (!elements.quickSaveBtn) return;
  if (!elements.quickSaveBtn.dataset.label) {
    elements.quickSaveBtn.dataset.label = elements.quickSaveBtn.textContent;
  }
  elements.quickSaveBtn.disabled = isLoading;
  elements.quickSaveBtn.textContent = isLoading ? "Saving..." : elements.quickSaveBtn.dataset.label;
  if (elements.quickCancelBtn) elements.quickCancelBtn.disabled = isLoading;
  if (elements.quickDeleteBtn) elements.quickDeleteBtn.disabled = isLoading;
}

function openQuickEditor(record) {
  if (!state.canManage || !elements.quickEditOverlay) return;
  state.activeQuickEditId = record.id;
  if (elements.quickEditTitleText) elements.quickEditTitleText.textContent = record.title;
  if (elements.quickEditNotes) elements.quickEditNotes.value = record.notes || "";
  setQuickEditError("");
  setQuickEditLoading(false);
  elements.quickEditOverlay.hidden = false;
  elements.quickEditOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  if (elements.quickEditNotes) elements.quickEditNotes.focus();
}

function closeQuickEditor() {
  if (!elements.quickEditOverlay) return;
  state.activeQuickEditId = null;
  setQuickEditError("");
  setQuickEditLoading(false);
  elements.quickEditOverlay.hidden = true;
  elements.quickEditOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function saveQuickEditor(event) {
  event.preventDefault();
  if (!state.canManage || !databases || !state.activeQuickEditId) return;
  const notes = elements.quickEditNotes ? elements.quickEditNotes.value.trim() : "";
  setQuickEditError("");
  setQuickEditLoading(true);
  try {
    await databases.updateDocument(APPWRITE_DATABASE_ID, COLLECTION_ID, state.activeQuickEditId, { notes });
    const record = state.records.find((r) => r.id === state.activeQuickEditId);
    if (record) record.notes = notes;
    closeQuickEditor();
    renderList();
    setStatus("Notes updated.");
  } catch (error) {
    const msg = error?.message || "";
    const isPermissionError = msg.includes("Missing") && msg.includes("permission");
    setQuickEditError(isPermissionError ? "You don't have permission to edit this entry." : (msg || "Could not save notes."));
    setQuickEditLoading(false);
  }
}

async function deleteRecord(id) {
  if (!state.canManage || !databases || !id) return;
  try {
    await databases.deleteDocument(APPWRITE_DATABASE_ID, COLLECTION_ID, id);
    state.records = state.records.filter((r) => r.id !== id);
    renderList();
    setStatus(`${ITEM_LABEL} entry deleted.`);
  } catch (error) {
    const msg = error?.message || "";
    const isPermissionError = msg.includes("Missing") && msg.includes("permission");
    setStatus(isPermissionError ? "You don't have permission to delete this entry." : (msg || "Could not delete entry."));
  }
}

async function deleteQuickRecord() {
  if (!state.canManage || !databases || !state.activeQuickEditId) return;
  const id = state.activeQuickEditId;
  closeQuickEditor();
  await deleteRecord(id);
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  if (elements.editModeBtn) {
    elements.editModeBtn.textContent = state.editMode ? "Done" : "Edit";
    elements.editModeBtn.classList.toggle("active", state.editMode);
  }
  if (elements.list) {
    elements.list.classList.toggle("edit-mode", state.editMode);
  }
  if (state.editMode) {
    hideTooltip();
    elements.list && elements.list.querySelectorAll("[draggable]").forEach((el) => el.removeAttribute("draggable"));
  } else {
    attachTooltipListeners();
    addDragAndDrop();
  }
}

function addDragAndDrop() {
  if (!elements.list) return;

  function clearInsertIndicators() {
    elements.list.querySelectorAll(".drag-insert-before, .drag-insert-after").forEach((el) => {
      el.classList.remove("drag-insert-before", "drag-insert-after");
    });
  }

  function handleAutoScroll(e) {
    const ZONE = 80;
    const SPEED = 18;
    const y = e.clientY;
    const h = window.innerHeight;
    if (y < ZONE) window.scrollBy(0, -SPEED * (1 - y / ZONE));
    else if (y > h - ZONE) window.scrollBy(0, SPEED * (1 - (h - y) / ZONE));
  }

  function makeDraggable(el) {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (e) => {
      currentDragId = el.dataset.id;
      e.dataTransfer.setData("text/plain", currentDragId);
      e.dataTransfer.effectAllowed = "move";
      el.classList.add("dragging");
      document.addEventListener("dragover", handleAutoScroll);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      elements.list.querySelectorAll(".drag-over").forEach((t) => t.classList.remove("drag-over"));
      clearInsertIndicators();
      currentDragId = null;
      document.removeEventListener("dragover", handleAutoScroll);
    });
  }

  elements.list.querySelectorAll(".tier-thumb[data-id], .unranked-card[data-id]").forEach(makeDraggable);

  function neighborPos(el, dir, draggedId) {
    let cursor = dir === "prev" ? el.previousElementSibling : el.nextElementSibling;
    while (cursor) {
      if (cursor.dataset.id !== draggedId) {
        const pos = parseFloat(cursor.dataset.position);
        return Number.isFinite(pos) ? pos : null;
      }
      cursor = dir === "prev" ? cursor.previousElementSibling : cursor.nextElementSibling;
    }
    return null;
  }

  function calcPosition(prevPos, nextPos) {
    if (prevPos === null && nextPos === null) return 1000;
    if (prevPos === null) return nextPos / 2;
    if (nextPos === null) return prevPos + 1000;
    return (prevPos + nextPos) / 2;
  }

  async function handleDrop(draggedId, targetThumbEl, insertBefore) {
    if (!draggedId || draggedId === targetThumbEl.dataset.id || !databases) return;
    const dragged = state.records.find((r) => r.id === draggedId);
    if (!dragged) return;
    const target = state.records.find((r) => r.id === targetThumbEl.dataset.id);
    if (!target) return;

    const newTier = normalizeTierForDisplay(target.tier) || target.tier;

    let prevPos, nextPos;
    if (insertBefore) {
      prevPos = neighborPos(targetThumbEl, "prev", draggedId);
      const p = parseFloat(targetThumbEl.dataset.position);
      nextPos = Number.isFinite(p) ? p : null;
    } else {
      const p = parseFloat(targetThumbEl.dataset.position);
      prevPos = Number.isFinite(p) ? p : null;
      nextPos = neighborPos(targetThumbEl, "next", draggedId);
    }

    const newPosition = calcPosition(prevPos, nextPos);
    dragged.tier = newTier;
    dragged.tier_position = newPosition;
    renderList();

    try {
      await databases.updateDocument(APPWRITE_DATABASE_ID, COLLECTION_ID, draggedId, {
        tier: newTier,
        tier_position: newPosition
      });
      setStatus(`Moved "${dragged.title}" to ${newTier}.`);
    } catch (error) {
      setStatus(`Failed to update: ${error?.message || "Unknown error"}`);
    }
  }

  async function handleTierDrop(e, newTier, itemsContainerEl) {
    e.preventDefault();
    const recordId = currentDragId || e.dataTransfer.getData("text/plain");
    if (!recordId || !databases) return;
    const record = state.records.find((r) => r.id === recordId);
    if (!record) return;
    if (normalizeTierForDisplay(record.tier) === newTier) return;

    let newPosition = 1000;
    if (itemsContainerEl) {
      const lastChild = itemsContainerEl.lastElementChild;
      if (lastChild && lastChild.dataset.id !== recordId) {
        const lastPos = parseFloat(lastChild.dataset.position);
        if (Number.isFinite(lastPos)) newPosition = lastPos + 1000;
      }
    }

    record.tier = newTier;
    record.tier_position = newPosition;
    renderList();

    try {
      await databases.updateDocument(APPWRITE_DATABASE_ID, COLLECTION_ID, recordId, {
        tier: newTier,
        tier_position: newPosition
      });
      setStatus(`Moved "${record.title}" to ${newTier !== null ? newTier : "Unranked / To Finish"}.`);
    } catch (error) {
      setStatus(`Failed to update tier: ${error?.message || "Unknown error"}`);
    }
  }

  // Per-thumb drop — handles both same-tier reorder and cross-tier insert
  elements.list.querySelectorAll(".tier-thumb[data-id]").forEach((thumb) => {
    thumb.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = thumb.getBoundingClientRect();
      clearInsertIndicators();
      thumb.classList.add(e.clientX < rect.left + rect.width / 2 ? "drag-insert-before" : "drag-insert-after");
    });
    thumb.addEventListener("dragleave", () => clearInsertIndicators());
    thumb.addEventListener("drop", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearInsertIndicators();
      const draggedId = currentDragId || e.dataTransfer.getData("text/plain");
      if (!draggedId || !databases) return;
      const rect = thumb.getBoundingClientRect();
      await handleDrop(draggedId, thumb, e.clientX < rect.left + rect.width / 2);
    });
  });

  // Tier row drop zone (empty space → append to end of tier)
  elements.list.querySelectorAll(".tier-row[data-tier]").forEach((row) => {
    row.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    row.addEventListener("dragenter", (e) => { e.preventDefault(); row.classList.add("drag-over"); });
    row.addEventListener("dragleave", (e) => { if (!row.contains(e.relatedTarget)) row.classList.remove("drag-over"); });
    row.addEventListener("drop", async (e) => {
      row.classList.remove("drag-over");
      const slug = row.dataset.tier;
      const newTier = TIER_NAMES.find((t) => TIER_SLUG[t] === slug);
      if (newTier) await handleTierDrop(e, newTier, row.querySelector(".tier-row-items"));
    });
  });

  // Unranked pool drop zone
  const unrankedPool = elements.list.querySelector(".unranked-pool");
  if (unrankedPool) {
    unrankedPool.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; });
    unrankedPool.addEventListener("dragenter", (e) => { e.preventDefault(); unrankedPool.classList.add("drag-over"); });
    unrankedPool.addEventListener("dragleave", (e) => { if (!unrankedPool.contains(e.relatedTarget)) unrankedPool.classList.remove("drag-over"); });
    unrankedPool.addEventListener("drop", async (e) => {
      unrankedPool.classList.remove("drag-over");
      await handleTierDrop(e, null, unrankedPool.querySelector(".unranked-items"));
    });
  }
}

async function loadList() {
  if (elements.refresh) {
    elements.refresh.disabled = true;
  }
  setStatus(`Loading ${ITEM_LABEL_LC} list...`);

  try {
    const result = await fetchRanking();
    state.records = result.records;
    renderList();

    if (result.invalid.length > 0) {
      console.warn(`Skipped invalid ${ITEM_LABEL_LC} documents:`, result.invalid);
    }
  } catch (error) {
    state.records = [];
    renderEmpty(error?.message || `Unable to load ${ITEM_LABEL_LC} list.`);
    setStatus(`Failed to load ${ITEM_LABEL_LC} list.`);
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
  state.pendingCoverUrl = "";

  if (elements.editTitleText) {
    elements.editTitleText.textContent = state.activeEditId ? `Edit ${ITEM_LABEL}` : `Add ${ITEM_LABEL}`;
  }

  if (elements.editTitle) {
    elements.editTitle.value = record?.title || "";
  }
  if (elements.editTier) {
    elements.editTier.value = record?.tier ? formatTierLabel(record.tier) : "";
  }
  if (elements.editPlayTime) {
    elements.editPlayTime.value = Number.isFinite(record?.play_time) ? record.play_time : "";
  }
  if (elements.editStoryLength) {
    elements.editStoryLength.value = Number.isFinite(record?.story_length) ? record.story_length : "";
  }
  if (elements.editPrice) {
    elements.editPrice.value = Number.isFinite(record?.price) ? record.price : "";
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
  state.pendingCoverUrl = "";
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

  const payload = {
    title,
    tier: tierRaw || null,
    notes
  };

  if (elements.editPlayTime) {
    const rawPlayTime = elements.editPlayTime.value.trim();
    if (rawPlayTime !== "") {
      const playTime = parseScoreInput(rawPlayTime);
      if (!Number.isFinite(playTime) || playTime < 0) {
        return { ok: false, error: "Play Time must be a non-negative number." };
      }
      payload.play_time = playTime;
    } else {
      payload.play_time = null;
    }
  }

  if (elements.editStoryLength) {
    const rawStoryLength = elements.editStoryLength.value.trim();
    if (rawStoryLength !== "") {
      const storyLength = parseScoreInput(rawStoryLength);
      if (!Number.isFinite(storyLength) || storyLength < 0) {
        return { ok: false, error: "Story Length must be a non-negative number." };
      }
      payload.story_length = storyLength;
    } else {
      payload.story_length = null;
    }
  }

  if (elements.editPrice) {
    const rawPrice = elements.editPrice.value.trim();
    if (rawPrice !== "") {
      const price = parseScoreInput(rawPrice);
      if (!Number.isFinite(price) || price < 0) {
        return { ok: false, error: "Price must be a non-negative number." };
      }
      payload.price = price;
    } else {
      payload.price = null;
    }
  }

  return {
    ok: true,
    payload
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
  const successText = editId ? `${ITEM_LABEL} entry updated.` : `${ITEM_LABEL} entry created.`;

  if (!editId && state.records.length >= MAX_ITEMS) {
    setEditError(`This list is full (max ${MAX_ITEMS} entries).`);
    setEditLoading(false);
    return;
  }

  if (!editId) {
    let coverUrl = state.pendingCoverUrl || "";
    if (!coverUrl && (COVER_API_TYPE === "anime" || COVER_API_TYPE === "series")) {
      coverUrl = await fetchCoverForType(COVER_API_TYPE, parsed.payload.title);
    }
    if (coverUrl) {
      parsed.payload.cover_url = coverUrl;
    }
  }

  try {
    if (editId) {
      await databases.updateDocument(
        APPWRITE_DATABASE_ID,
        COLLECTION_ID,
        editId,
        parsed.payload
      );
    } else {
      parsed.payload.list_id = LIST_ID;
      parsed.payload.owner = LIST_OWNER;
      await databases.createDocument(
        APPWRITE_DATABASE_ID,
        COLLECTION_ID,
        AppwriteID.unique(),
        parsed.payload,
        itemPermissions()
      );
    }

    closeEditor();
    await loadList();
    setStatus(successText);
  } catch (error) {
    const msg = error?.message || "";
    const isPermissionError = msg.includes("Missing") && msg.includes("permission");
    setEditError(isPermissionError ? `You don't have permission to add ${ITEM_LABEL_LC} entries.` : (msg || `Could not save ${ITEM_LABEL_LC} entry.`));
    setEditLoading(false);
  }
}

function handleListClick(event) {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const coverEl = target.closest(".tier-thumb-media, .unranked-cover");
  if (coverEl && !state.editMode) {
    const card = coverEl.closest("[data-yt-url]");
    if (card?.dataset.ytUrl) {
      window.open(card.dataset.ytUrl, "_blank", "noopener,noreferrer");
    }
    return;
  }

  const quickEditButton = target.closest('[data-action="quick-edit"]');
  if (quickEditButton) {
    if (!state.canManage) return;
    const recordId = quickEditButton.getAttribute("data-id") || "";
    if (!recordId) return;
    const record = state.records.find((entry) => entry.id === recordId);
    if (!record) { setStatus(`Could not find that ${ITEM_LABEL_LC} entry. Refresh and try again.`); return; }
    openQuickEditor(record);
    return;
  }

  const deleteButton = target.closest('[data-action="quick-delete"]');
  if (deleteButton) {
    if (!state.canManage) return;
    const recordId = deleteButton.getAttribute("data-id") || "";
    if (!recordId) return;
    void deleteRecord(recordId);
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (elements.exportOverlay && !elements.exportOverlay.hidden) {
    closeExportModal();
    return;
  }

  if (elements.shareOverlay && !elements.shareOverlay.hidden) {
    closeShareModal();
    return;
  }

  if (elements.titleSuggestions && !elements.titleSuggestions.hidden) {
    clearTitleSuggestions();
    return;
  }

  if (elements.quickEditOverlay && !elements.quickEditOverlay.hidden) {
    closeQuickEditor();
    return;
  }

  if (!elements.editOverlay || elements.editOverlay.hidden) {
    return;
  }

  closeEditor();
}

function openExportModal() {
  if (elements.exportOverlay) {
    elements.exportOverlay.hidden = false;
    elements.exportOverlay.setAttribute("aria-hidden", "false");
  }
}

function closeExportModal() {
  if (elements.exportOverlay) {
    elements.exportOverlay.hidden = true;
    elements.exportOverlay.setAttribute("aria-hidden", "true");
  }
}

function performExport() {
  const contentVal = document.querySelector('input[name="exportContent"]:checked')?.value || "names";
  const formatVal = document.querySelector('input[name="exportFormat"]:checked')?.value || "json";

  const includeRanking = contentVal === "names-ranking" || contentVal === "names-ranking-notes";
  const includeNotes = contentVal === "names-notes" || contentVal === "names-ranking-notes";

  const data = state.records.map((record) => {
    const entry = { name: record.title };
    if (includeRanking) entry.tier = normalizeTierForDisplay(record.tier) || record.tier || null;
    if (includeNotes) entry.notes = record.notes || "";
    return entry;
  });

  let content, mimeType, extension;

  if (formatVal === "json") {
    content = JSON.stringify(data, null, 2);
    mimeType = "application/json";
    extension = "json";
  } else if (formatVal === "csv") {
    const headers = ["name"];
    if (includeRanking) headers.push("tier");
    if (includeNotes) headers.push("notes");
    const rows = data.map((entry) =>
      headers.map((h) => `"${String(entry[h] ?? "").replace(/"/g, '""')}"`).join(",")
    );
    content = [headers.join(","), ...rows].join("\n");
    mimeType = "text/csv";
    extension = "csv";
  } else {
    const lines = data.map((entry) => {
      const parts = [entry.name];
      if (includeRanking) parts.push(`[${entry.tier || "Unranked / To Finish"}]`);
      if (includeNotes && entry.notes) parts.push(`- ${entry.notes}`);
      return parts.join(" ");
    });
    content = lines.join("\n");
    mimeType = "text/plain";
    extension = "txt";
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${EXPORT_FILENAME}.${extension}`;
  a.click();
  URL.revokeObjectURL(url);
  closeExportModal();
}

function getShareIdFromUrl() {
  return new URLSearchParams(window.location.search).get("share") || "";
}

function setShareError(message) {
  if (elements.shareError) {
    elements.shareError.textContent = message || "";
  }
}

function resetShareModal() {
  setShareError("");
  if (elements.shareResultField) elements.shareResultField.hidden = true;
  if (elements.shareLinkInput) elements.shareLinkInput.value = "";
  if (elements.shareCopyBtn) elements.shareCopyBtn.hidden = true;
  if (elements.shareConfirmBtn) {
    elements.shareConfirmBtn.hidden = false;
    elements.shareConfirmBtn.disabled = false;
    elements.shareConfirmBtn.textContent = "Create link";
  }
}

function openShareModal() {
  if (!elements.shareOverlay) return;
  resetShareModal();
  elements.shareOverlay.hidden = false;
  elements.shareOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
}

function closeShareModal() {
  if (!elements.shareOverlay) return;
  elements.shareOverlay.hidden = true;
  elements.shareOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

async function createShare() {
  if (!databases || !AppwriteID) return;
  if (!state.records.length) {
    setShareError(`No ${ITEM_LABEL_LC} to share yet.`);
    return;
  }

  setShareError("");
  if (elements.shareConfirmBtn) {
    elements.shareConfirmBtn.disabled = true;
    elements.shareConfirmBtn.textContent = "Creating...";
  }

  try {
    const payloadItems = state.records.map((r) => ({
      id: r.id,
      title: r.title,
      tier: r.tier,
      tier_position: r.tier_position,
      notes: r.notes,
      cover_url: r.cover_url,
      play_time: r.play_time,
      story_length: r.story_length,
      price: r.price,
      yt_url: r.yt_url
    }));

    const doc = await databases.createDocument(
      APPWRITE_DATABASE_ID,
      SHARE_COLLECTION_ID,
      AppwriteID.unique(),
      {
        category: COVER_API_TYPE,
        title: `${ITEM_LABEL} Tierlist`,
        payload: JSON.stringify(payloadItems)
      }
    );

    const url = new URL(window.location.href);
    url.search = "";
    url.searchParams.set("share", doc.$id);

    if (elements.shareLinkInput) elements.shareLinkInput.value = url.toString();
    if (elements.shareResultField) elements.shareResultField.hidden = false;
    if (elements.shareConfirmBtn) elements.shareConfirmBtn.hidden = true;
    if (elements.shareCopyBtn) elements.shareCopyBtn.hidden = false;
  } catch (error) {
    setShareError(error?.message || "Could not create share link.");
    if (elements.shareConfirmBtn) {
      elements.shareConfirmBtn.disabled = false;
      elements.shareConfirmBtn.textContent = "Create link";
    }
  }
}

async function copyShareLink() {
  if (!elements.shareLinkInput || !elements.shareLinkInput.value) return;
  try {
    await navigator.clipboard.writeText(elements.shareLinkInput.value);
    if (elements.shareCopyBtn) {
      const original = elements.shareCopyBtn.dataset.label || elements.shareCopyBtn.textContent;
      elements.shareCopyBtn.dataset.label = original;
      elements.shareCopyBtn.textContent = "Copied!";
      window.setTimeout(() => {
        if (elements.shareCopyBtn) elements.shareCopyBtn.textContent = elements.shareCopyBtn.dataset.label;
      }, 1500);
    }
  } catch {
    elements.shareLinkInput.select();
  }
}

function normalizeSharedItem(raw) {
  return {
    id: String(raw?.id || ""),
    title: String(raw?.title || ""),
    tier: raw?.tier ?? null,
    notes: String(raw?.notes || ""),
    tier_position: Number.isFinite(raw?.tier_position) ? raw.tier_position : null,
    cover_url: String(raw?.cover_url || ""),
    artist: "",
    yt_url: String(raw?.yt_url || ""),
    play_time: Number.isFinite(raw?.play_time) ? raw.play_time : null,
    story_length: Number.isFinite(raw?.story_length) ? raw.story_length : null,
    price: Number.isFinite(raw?.price) ? raw.price : null
  };
}

function applyShareModeUi() {
  if (elements.add) elements.add.hidden = true;
  if (elements.editModeBtn) elements.editModeBtn.hidden = true;
  if (elements.shareBtn) elements.shareBtn.hidden = true;
  if (elements.refresh) elements.refresh.hidden = true;

  if (elements.shareBanner) {
    elements.shareBanner.hidden = false;
    if (elements.shareBannerLiveLink) {
      elements.shareBannerLiveLink.href = window.location.pathname;
    }
  }
}

async function loadSharedList(shareId) {
  setStatus(`Loading shared ${ITEM_LABEL_LC} list...`);
  try {
    const doc = await databases.getDocument(APPWRITE_DATABASE_ID, SHARE_COLLECTION_ID, shareId);

    if (doc.category && doc.category !== COVER_API_TYPE) {
      renderEmpty("This share link belongs to a different tierlist category.");
      setStatus("Wrong category for this share link.");
      return;
    }

    let items = [];
    try {
      const parsed = JSON.parse(doc.payload || "[]");
      items = Array.isArray(parsed) ? parsed.map(normalizeSharedItem) : [];
    } catch {
      items = [];
    }

    state.records = items;
    renderList();
    setStatus(`Viewing a shared, read-only ${ITEM_LABEL_LC} snapshot.`);
  } catch (error) {
    renderEmpty("This share link is invalid or no longer available.");
    setStatus("Failed to load the shared list.");
  }
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
      void loadList();
    });
  }

  if (elements.add) {
    elements.add.addEventListener("click", () => {
      openEditor(null);
    });
  }

  if (elements.exportBtn) {
    elements.exportBtn.addEventListener("click", () => {
      openExportModal();
    });
  }

  if (elements.exportCancelBtn) {
    elements.exportCancelBtn.addEventListener("click", closeExportModal);
  }

  if (elements.exportConfirmBtn) {
    elements.exportConfirmBtn.addEventListener("click", performExport);
  }

  if (elements.shareBtn) {
    elements.shareBtn.addEventListener("click", () => {
      openShareModal();
    });
  }

  if (elements.shareCancelBtn) {
    elements.shareCancelBtn.addEventListener("click", closeShareModal);
  }

  if (elements.shareConfirmBtn) {
    elements.shareConfirmBtn.addEventListener("click", () => {
      void createShare();
    });
  }

  if (elements.shareCopyBtn) {
    elements.shareCopyBtn.addEventListener("click", () => {
      void copyShareLink();
    });
  }

  if (elements.shareOverlay) {
    elements.shareOverlay.addEventListener("click", (event) => {
      if (event.target === elements.shareOverlay) {
        closeShareModal();
      }
    });
  }

  if (elements.editModeBtn) {
    elements.editModeBtn.addEventListener("click", () => {
      toggleEditMode();
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
      const image = button.getAttribute("data-suggestion-image") || "";
      applySuggestedTitle(title, image);
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

  if (elements.quickEditForm) {
    elements.quickEditForm.addEventListener("submit", (event) => {
      void saveQuickEditor(event);
    });
  }

  if (elements.quickCancelBtn) {
    elements.quickCancelBtn.addEventListener("click", () => closeQuickEditor());
  }

  if (elements.quickDeleteBtn) {
    elements.quickDeleteBtn.addEventListener("click", () => { void deleteQuickRecord(); });
  }

  if (elements.quickEditOverlay) {
    elements.quickEditOverlay.addEventListener("click", (event) => {
      if (event.target === elements.quickEditOverlay) closeQuickEditor();
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
  state.currentUserId = "";
  if (account) {
    try {
      const user = await account.get();
      state.currentUserId = user && user.$id ? user.$id : "";
    } catch {
      state.currentUserId = "";
    }
  }
  state.canManage = !!state.currentUserId && state.currentUserId === LIST_OWNER;
  state.readOnly = !state.canManage;
  updateAuthUi();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function applyListConfig(doc) {
  LIST_ID = doc.$id;
  LIST_OWNER = String(doc.owner || "");
  LIST_VISIBILITY = doc.visibility === "public" ? "public" : "private";

  const meta = CATEGORY_META[doc.category] || CATEGORY_META.anime;
  COVER_API_TYPE = meta.coverApi;
  ITEM_LABEL = meta.label;
  ITEM_LABEL_LC = ITEM_LABEL.toLowerCase();
  EXPORT_FILENAME = slugify(doc.name) || meta.file;

  let tiers = [];
  try {
    const parsed = JSON.parse(doc.tiers || "[]");
    if (Array.isArray(parsed)) {
      tiers = TIER_NAMES.filter((t) => parsed.indexOf(t) !== -1);
    }
  } catch {
    tiers = [];
  }
  LIST_TIERS = tiers.length ? tiers : ["S", "A", "B", "C", "D", "E", "F"];

  const nameEl = document.querySelector("#listName");
  if (nameEl) nameEl.textContent = doc.name || "Untitled list";
  const catEl = document.querySelector("#listCategory");
  if (catEl) catEl.textContent = meta.label;
  document.title = `${doc.name || "Tierlist"} | NetPurple`;

  // Show only the numeric fields that make sense for this category.
  const isGames = doc.category === "games";
  const isWatchable = doc.category === "anime" || doc.category === "series";
  toggleField("fieldPlayTime", isWatchable);
  toggleField("fieldStoryLength", isGames);
  toggleField("fieldPrice", isGames);
  const playInfo = document.querySelector("#playTimeInfo");
  if (playInfo) playInfo.hidden = !isWatchable;
}

function toggleField(id, show) {
  const node = document.getElementById(id);
  if (node) node.hidden = !show;
}

function applyViewMode() {
  const banner = document.querySelector("#roBanner");
  if (banner) banner.hidden = !state.readOnly;
  const renameBtn = document.querySelector("#renameBtn");
  if (renameBtn) renameBtn.hidden = !state.canManage;
}

function initRename() {
  const btn = document.querySelector("#renameBtn");
  const nameEl = document.querySelector("#listName");
  if (!btn || !nameEl) return;

  btn.addEventListener("click", async () => {
    if (!state.canManage) return;
    const current = nameEl.textContent || "";
    const next = window.prompt("Rename this tierlist:", current);
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === current) return;
    if (trimmed.length > 120) {
      setStatus("Name must be 120 characters or fewer.");
      return;
    }
    try {
      await databases.updateDocument(APPWRITE_DATABASE_ID, LISTS_COLLECTION_ID, LIST_ID, { name: trimmed });
      nameEl.textContent = trimmed;
      document.title = `${trimmed} | NetPurple`;
      setStatus("List renamed.");
    } catch (error) {
      setStatus(error?.message || "Could not rename list.");
    }
  });
}

async function init() {
  if (elements.add) {
    elements.add.hidden = true;
  }
  if (elements.editOverlay) {
    elements.editOverlay.hidden = true;
    elements.editOverlay.setAttribute("aria-hidden", "true");
  }
  if (elements.quickEditOverlay) {
    elements.quickEditOverlay.hidden = true;
    elements.quickEditOverlay.setAttribute("aria-hidden", "true");
  }

  initEvents();
  initRename();

  try {
    initAppwrite();
  } catch (error) {
    renderEmpty(error?.message || "Appwrite initialization failed.");
    setStatus("Failed to initialize Appwrite.");
    return;
  }

  const listId = new URLSearchParams(window.location.search).get("id") || "";
  if (!listId) {
    renderEmpty("No tierlist selected — open one from “My Lists”.");
    setStatus("No list id.");
    return;
  }

  let listDoc;
  try {
    listDoc = await databases.getDocument(APPWRITE_DATABASE_ID, LISTS_COLLECTION_ID, listId);
  } catch (error) {
    renderEmpty("This tierlist does not exist, or it is private.");
    setStatus("List not found.");
    return;
  }

  applyListConfig(listDoc);
  await refreshAuthState();
  applyViewMode();
  await loadList();
}

void init();
