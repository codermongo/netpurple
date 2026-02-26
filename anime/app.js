const APPWRITE_ENDPOINT = "https://api.netpurple.net/";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";
const ANIME_COLLECTION_ID = "anime_ranking";
const PAGE_SIZE = 100;
const THEME_KEY = "darkMode";

const TIER_VALUES = new Set(["Tier_1", "Tier_2", "Tier_3"]);

const state = {
  records: [],
  query: ""
};

const elements = {
  list: document.querySelector("#animeList"),
  status: document.querySelector("#statusText"),
  search: document.querySelector("#searchInput"),
  refresh: document.querySelector("#refreshBtn"),
  add: document.querySelector("#addBtn"),
  themeToggle: document.querySelector("#themeToggleItem"),
  editOverlay: document.querySelector("#editOverlay")
};

let databases = null;
let Query = null;

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

function getTierClass(tier) {
  if (tier === "Tier_1") {
    return "tier-1";
  }
  if (tier === "Tier_2") {
    return "tier-2";
  }
  if (tier === "Tier_3") {
    return "tier-3";
  }
  return "";
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

function normalizeAnimeDocument(document) {
  const errors = [];

  const id = document?.$id || "";
  const title = typeof document?.title === "string" ? document.title.trim() : "";
  if (!title) {
    errors.push("title is required and must be a non-empty string.");
  } else if (title.length > 255) {
    errors.push("title exceeds max length 255.");
  }

  const score = Number(document?.score);
  if (!Number.isFinite(score)) {
    errors.push("score is required and must be a number.");
  } else if (score < 0 || score > 15) {
    errors.push("score must be between 0 and 15.");
  }

  let tier = null;
  if (document?.tier !== null && document?.tier !== undefined && String(document.tier).trim() !== "") {
    tier = String(document.tier).trim();
    if (!TIER_VALUES.has(tier)) {
      errors.push("tier must be one of Tier_1, Tier_2, Tier_3.");
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
      score,
      tier,
      notes,
      rank
    }
  };
}

function sortAnime(records) {
  return records
    .slice()
    .sort((left, right) => {
      const leftRank = left.rank;
      const rightRank = right.rank;
      const hasLeftRank = leftRank !== null;
      const hasRightRank = rightRank !== null;

      if (hasLeftRank && hasRightRank && leftRank !== rightRank) {
        return leftRank - rightRank;
      }
      if (hasLeftRank && !hasRightRank) {
        return -1;
      }
      if (!hasLeftRank && hasRightRank) {
        return 1;
      }
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return left.title.localeCompare(right.title);
    });
}

async function fetchAnimeRanking() {
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
    records: sortAnime(records),
    invalid
  };
}

function getFilteredRecords() {
  const term = state.query.trim().toLowerCase();
  if (!term) {
    return state.records;
  }

  return state.records.filter((record) => {
    const haystack = [
      record.title,
      record.tier || "",
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

  const cards = filtered.map((record, index) => {
    const fallbackRank = index + 1;
    const rankText = record.rank !== null ? `#${record.rank}` : `#${fallbackRank}`;
    const tierText = record.tier || "No tier";
    const tierClass = getTierClass(record.tier);
    const notes = record.notes ? `<p class="card-notes">${escapeHtml(record.notes)}</p>` : "";

    return `
      <article class="anime-card ${tierClass}">
        <div class="card-body">
          <div class="card-head">
            <div class="card-head-left">
              <h2 class="card-title">${escapeHtml(rankText)} ${escapeHtml(record.title)}</h2>
              <p class="card-meta ${tierClass}">Tier: ${escapeHtml(tierText)}</p>
            </div>
            <div class="head-right">
              <span class="score-pill">Score: ${escapeHtml(formatScore(record.score))}/15</span>
            </div>
          </div>
          ${notes}
        </div>
      </article>
    `;
  });

  if (elements.list) {
    elements.list.innerHTML = cards.join("");
  }

  if (state.query) {
    setStatus(`Showing ${filtered.length} of ${state.records.length} anime.`);
  } else {
    setStatus(`${state.records.length} anime loaded.`);
  }
}

async function loadAnimeList() {
  if (elements.refresh) {
    elements.refresh.disabled = true;
  }
  setStatus("Loading anime list from Appwrite...");

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
}

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    throw new Error("Appwrite SDK is not loaded. Check the CDN <script> tag.");
  }

  const { Client, Databases, Query: AppwriteQuery } = Appwrite;
  Query = AppwriteQuery;

  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  databases = new Databases(client);
}

function init() {
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
    renderEmpty(error.message || "Appwrite initialization failed.");
    setStatus("Failed to initialize Appwrite.");
    return;
  }

  void loadAnimeList();
}

init();
