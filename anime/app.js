const API_BASE = "https://api.netpurple.net";
const COLLECTION = "anime_ranking";
const THEME_KEY = "darkMode";
const COVER_CACHE_KEY = "anime_cover_cache_v1";
const JIKAN_BASE = "https://api.jikan.moe/v4/anime";

const state = {
  records: [],
  query: "",
  rankById: new Map(),
  coverCache: loadCoverCache(),
  pendingCovers: new Set()
};

const elements = {
  list: document.querySelector("#animeList"),
  status: document.querySelector("#statusText"),
  search: document.querySelector("#searchInput"),
  refresh: document.querySelector("#refreshBtn"),
  themeToggle: document.querySelector("#themeToggleItem")
};

let coverRenderJob = 0;

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
        return left.index - right.index;
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
      return left.index - right.index;
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

function renderEmpty(message) {
  elements.list.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderList() {
  const filtered = getFilteredRecords();

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

    return `
      <article class="anime-card ${tierClass}">
        <div class="card-media" data-cover-slot="${escapeHtml(record.id)}">
          ${renderCardCover(record)}
        </div>
        <div class="card-body">
          <div class="card-head">
            <h2 class="card-title">#${rank} ${title}</h2>
            <span class="score-pill">Score: ${escapeHtml(scoreText)}</span>
          </div>
          <p class="card-meta ${tierClass}">Tier: ${tier}</p>
          ${notes}
        </div>
      </article>
    `;
  });

  elements.list.innerHTML = cards.join("");

  if (state.query) {
    setStatus(`Showing ${filtered.length} of ${state.records.length} anime.`);
  } else {
    setStatus(`${state.records.length} anime loaded.`);
  }

  coverRenderJob += 1;
  void enrichVisibleCovers(filtered, coverRenderJob);
}

async function loadAnimeList() {
  elements.refresh.disabled = true;
  setStatus("Loading anime list...");

  try {
    const response = await fetch(
      `${API_BASE}/api/collections/${COLLECTION}/records?page=1&perPage=500&sort=-score`
    );

    if (!response.ok) {
      let message = "Unable to load anime list.";
      try {
        const data = await response.json();
        message = data?.message || message;
      } catch (error) {
        message = response.statusText || message;
      }
      throw new Error(message);
    }

    const data = await response.json();
    state.records = stableSortByScore(data.items || []);
    updateRanks();
    renderList();
  } catch (error) {
    state.records = [];
    updateRanks();
    renderEmpty(error.message || "Unable to load anime list.");
    setStatus("Failed to load anime list.");
  } finally {
    elements.refresh.disabled = false;
  }
}

function initEvents() {
  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value || "";
    renderList();
  });

  elements.refresh.addEventListener("click", () => {
    loadAnimeList();
  });
}

function init() {
  initThemeToggle();
  initEvents();
  loadAnimeList();
}

init();
