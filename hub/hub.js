(() => {
const API_BASE = "https://api.netpurple.net";
const COLLECTION = "videos";
const AUTH_STORAGE_KEY = "pb_auth";
const PER_PAGE = 200;
const SORT = "-score_d,-score_star,-created";

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const videoGrid = document.getElementById("videoGrid");
const statusText = document.getElementById("statusText");
const hubLoader = document.getElementById("hubLoader");
const hubEmpty = document.getElementById("hubEmpty");

let allVideos = [];
let visibleVideos = [];

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

function ensureAuthenticated() {
  if (getAuthToken()) {
    return true;
  }
  redirectToLogin();
  return false;
}

async function apiFetch(path) {
  const headers = { Accept: "application/json" };
  const token = getAuthToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
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

  return response.json();
}

function parseScore(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : Number.NEGATIVE_INFINITY;
}

function sortVideos(records) {
  return records.slice().sort((a, b) => {
    const scoreDiff = parseScore(b.score_d) - parseScore(a.score_d);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    const starDiff = parseScore(b.score_star) - parseScore(a.score_star);
    if (starDiff !== 0) {
      return starDiff;
    }

    const aTitle = (a.title || "").toLowerCase();
    const bTitle = (b.title || "").toLowerCase();
    return aTitle.localeCompare(bTitle);
  });
}

function setStatus(total, showing) {
  if (total === 0) {
    statusText.textContent = "Showing 0 of 0 videos.";
    return;
  }
  statusText.textContent = `Showing ${showing} of ${total} videos.`;
}

function getUrlLabel(url) {
  if (!url) {
    return "No URL available";
  }
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname}`;
  } catch (error) {
    return url;
  }
}

function getShortUrlLabel(url) {
  const full = getUrlLabel(url).replace(/^www\./i, "");
  const compact = full.replace(/^https?:\/\//i, "");
  if (compact.length <= 10) {
    return compact;
  }
  return `${compact.slice(0, 10)}......`;
}

function getSafeLink(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
    return null;
  } catch (error) {
    return null;
  }
}

function formatScore(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "-";
  }
  return `${numeric}/10`;
}

function buildCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";

  const topRow = document.createElement("div");
  topRow.className = "video-main-row";

  const title = document.createElement("h3");
  title.className = "video-title";
  const rankDot = document.createElement("span");
  rankDot.className = "rank-dot";
  rankDot.textContent = `#${video.rank ?? "-"}`;
  const titleText = document.createElement("span");
  titleText.textContent = video.title || "Untitled";
  title.append(rankDot, titleText);

  const category = document.createElement("div");
  category.className = "db-value";
  category.textContent = video.category || "Uncategorized";

  const description = document.createElement("div");
  description.className = "db-value description";
  description.textContent = video.notes || "-";

  const scoreD = document.createElement("div");
  scoreD.className = "db-value score";
  scoreD.textContent = formatScore(video.score_d);

  const scoreStar = document.createElement("div");
  scoreStar.className = "db-value score";
  scoreStar.textContent = formatScore(video.score_star);

  const warning = document.createElement("div");
  warning.className = video.trigger_warning ? "db-value warning" : "db-value";
  warning.textContent = video.trigger_warning || "None";

  const linkCell = document.createElement("div");
  linkCell.className = "db-value";

  const openLink = document.createElement("a");
  openLink.className = "db-link";
  const safeLink = getSafeLink(video.link);
  openLink.href = safeLink || "#";
  openLink.target = "_blank";
  openLink.rel = "noreferrer";
  openLink.title = getUrlLabel(video.link);

  const linkIcon = document.createElement("i");
  linkIcon.className = "fa-solid fa-link";
  linkIcon.setAttribute("aria-hidden", "true");

  const linkText = document.createElement("span");
  linkText.textContent = getShortUrlLabel(video.link);

  openLink.append(linkIcon, linkText);

  if (!safeLink) {
    openLink.setAttribute("aria-disabled", "true");
    openLink.style.pointerEvents = "none";
    openLink.style.opacity = "0.6";
  }
  linkCell.appendChild(openLink);

  topRow.append(title, category, description, scoreD, scoreStar, linkCell, warning);
  card.append(topRow);
  return card;
}

function renderVideos(list) {
  videoGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  list.forEach((video) => {
    fragment.appendChild(buildCard(video));
  });
  videoGrid.appendChild(fragment);
}

function applyFilter() {
  const query = searchInput.value.trim().toLowerCase();
  const selectedCategory = categoryFilter.value;

  visibleVideos = allVideos.filter((video) => {
    const title = (video.title || "").toLowerCase();
    const notes = (video.notes || "").toLowerCase();
    const link = (video.link || "").toLowerCase();
    const matchesSearch = !query || title.includes(query) || notes.includes(query) || link.includes(query);
    const matchesCategory = selectedCategory === "all" || (video.category || "") === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  renderVideos(visibleVideos);
  setStatus(allVideos.length, visibleVideos.length);
  hubEmpty.hidden = visibleVideos.length > 0;
}

function buildCategoryFilter(records) {
  const categories = new Set();
  records.forEach((record) => {
    if (record.category) {
      categories.add(record.category);
    }
  });

  Array.from(categories).sort().forEach((category) => {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    categoryFilter.appendChild(option);
  });
}

async function fetchAllRecords() {
  const output = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await apiFetch(
      `/api/collections/${COLLECTION}/records?page=${page}&perPage=${PER_PAGE}&sort=${encodeURIComponent(SORT)}`
    );
    totalPages = Number(data?.totalPages) || 1;
    if (Array.isArray(data?.items)) {
      output.push(...data.items);
    }
    page += 1;
  }

  return output;
}

async function loadVideos() {
  try {
    const records = await fetchAllRecords();
    allVideos = sortVideos(records).map((record, index) => ({
      ...record,
      rank: index + 1
    }));
    buildCategoryFilter(allVideos);
    applyFilter();
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      redirectToLogin();
      return;
    }
    statusText.textContent = "Video collection unavailable.";
    hubEmpty.hidden = false;
    hubEmpty.textContent = `Failed to load videos: ${error.message}`;
  } finally {
    hubLoader.hidden = true;
  }
}

if (!ensureAuthenticated()) {
  hubLoader.hidden = true;
} else {
searchInput.addEventListener("input", applyFilter);
categoryFilter.addEventListener("change", applyFilter);

loadVideos();
}
})();
