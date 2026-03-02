(() => {
const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";
const FAVORITES_COLLECTION_ID = "favorites";
const FAVORITE_TYPE = "game";

const gamesUrl = "config/games.json";

const gameGrid = document.getElementById("gameGrid");
const gameCount = document.getElementById("gameCount");
const gamesLoader = document.getElementById("gamesLoader");
const gamesEmpty = document.getElementById("gamesEmpty");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const randomGame = document.getElementById("randomGame");
const backToTop = document.getElementById("backToTop");
const logoutButton = document.getElementById("logout-btn");

let games = [];
let visibleGames = [];

const favoriteRecords = new Map();
const pendingFavorites = new Set();
let account = null;
let databases = null;
let AppwriteID = null;
let AppwriteQuery = null;
let currentUserId = null;

function redirectToLogin() {
  const target = encodeURIComponent(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.href = `/login?return=${target}`;
}

function initAppwrite() {
  if (typeof Appwrite === "undefined") {
    console.warn("Appwrite SDK not available for favorites.");
    return false;
  }

  const { Client, Account, Databases, ID, Query } = Appwrite;
  const client = new Client()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);

  account = new Account(client);
  databases = new Databases(client);
  AppwriteID = ID;
  AppwriteQuery = Query;
  return true;
}

async function getCurrentUserId() {
  if (currentUserId) {
    return currentUserId;
  }
  if (!account) {
    return null;
  }
  try {
    const user = await account.get();
    currentUserId = user?.$id || null;
    return currentUserId;
  } catch {
    currentUserId = null;
    return null;
  }
}

function getGameKey(game) {
  return game.title;
}

function normalizeFavoriteRecord(record) {
  if (!record) {
    return null;
  }
  const pinOrder = Number(record.pin_order);
  return {
    id: record.$id || record.id || "",
    item_key: record.item_key || "",
    pin_order: Number.isFinite(pinOrder) ? pinOrder : 0,
    updated: record.$updatedAt || record.updated || "",
    created: record.$createdAt || record.created || ""
  };
}

function getFavoriteRank(record) {
  if (!record) {
    return 0;
  }
  if (Number.isFinite(record.pin_order)) {
    return record.pin_order;
  }
  const date = Date.parse(record.updated || record.created || "");
  return Number.isNaN(date) ? 0 : date;
}

function sortWithFavorites(list) {
  const entries = list.map((item, index) => ({ item, index }));
  entries.sort((a, b) => {
    const aKey = getGameKey(a.item);
    const bKey = getGameKey(b.item);
    const aRecord = favoriteRecords.get(aKey);
    const bRecord = favoriteRecords.get(bKey);
    const aFav = aRecord ? 1 : 0;
    const bFav = bRecord ? 1 : 0;
    if (aFav !== bFav) {
      return bFav - aFav;
    }
    if (aFav && bFav) {
      const rankDiff = getFavoriteRank(bRecord) - getFavoriteRank(aRecord);
      if (rankDiff !== 0) {
        return rankDiff;
      }
    }
    return a.index - b.index;
  });
  return entries.map((entry) => entry.item);
}

function setFavoriteVisual(button, isFavorite) {
  button.classList.toggle("is-favorite", isFavorite);
  button.setAttribute("aria-pressed", isFavorite ? "true" : "false");
  button.setAttribute("title", isFavorite ? "Remove favorite" : "Add to favorites");
  const icon = button.querySelector("i");
  if (icon) {
    icon.className = isFavorite ? "fa-solid fa-heart" : "fa-regular fa-heart";
  }
}

function buildFavoriteToggle(gameKey) {
  const button = document.createElement("span");
  button.className = "favorite-toggle";
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.innerHTML = '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
  setFavoriteVisual(button, favoriteRecords.has(gameKey));

  const handleToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(gameKey);
  };

  button.addEventListener("click", handleToggle);
  button.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      handleToggle(event);
    }
  });

  return button;
}

async function loadFavorites() {
  favoriteRecords.clear();
  const userId = await getCurrentUserId();
  if (!userId || !databases || !AppwriteQuery) {
    return;
  }

  try {
    const data = await databases.listDocuments(
      APPWRITE_DATABASE_ID,
      FAVORITES_COLLECTION_ID,
      [
        AppwriteQuery.equal("user", userId),
        AppwriteQuery.equal("item_type", FAVORITE_TYPE),
        AppwriteQuery.limit(200)
      ]
    );
    const items = Array.isArray(data?.documents) ? data.documents : [];
    items.forEach((record) => {
      const normalized = normalizeFavoriteRecord(record);
      if (normalized?.item_key) {
        favoriteRecords.set(normalized.item_key, normalized);
      }
    });
  } catch (error) {
    console.warn("Failed to load favorites", error);
  }
}

async function toggleFavorite(gameKey) {
  const userId = await getCurrentUserId();
  if (!userId || !databases || !AppwriteID) {
    redirectToLogin();
    return;
  }

  if (pendingFavorites.has(gameKey)) {
    return;
  }
  pendingFavorites.add(gameKey);

  const existing = favoriteRecords.get(gameKey);
  if (existing) {
    favoriteRecords.delete(gameKey);
    applyFilter();
    try {
      await databases.deleteDocument(
        APPWRITE_DATABASE_ID,
        FAVORITES_COLLECTION_ID,
        existing.id
      );
    } catch (error) {
      console.warn("Failed to remove favorite", error);
      favoriteRecords.set(gameKey, existing);
      applyFilter();
    } finally {
      pendingFavorites.delete(gameKey);
    }
    return;
  }

  const payload = {
    user: userId,
    item_type: FAVORITE_TYPE,
    item_key: gameKey,
    pinned: true,
    pin_order: Date.now()
  };

  const optimistic = {
    id: `tmp_${gameKey}`,
    item_key: gameKey,
    pin_order: payload.pin_order
  };

  favoriteRecords.set(gameKey, optimistic);
  applyFilter();

  try {
    const created = await databases.createDocument(
      APPWRITE_DATABASE_ID,
      FAVORITES_COLLECTION_ID,
      AppwriteID.unique(),
      payload
    );
    const normalized = normalizeFavoriteRecord(created);
    if (normalized?.id) {
      favoriteRecords.set(gameKey, normalized);
    }
  } catch (error) {
    console.warn("Failed to add favorite", error);
    favoriteRecords.delete(gameKey);
    applyFilter();
  } finally {
    pendingFavorites.delete(gameKey);
  }
}

function updateCount(total, showing) {
  if (total === 0) {
    gameCount.textContent = "0 games";
    return;
  }

  const label = showing === total ? `${total} games` : `${showing} of ${total} games`;
  gameCount.textContent = label;
}

function buildCard(game) {
  const link = document.createElement("a");
  link.className = "game-card favorite-card";
  link.href = game.link;
  link.setAttribute("title", game.title);
  link.setAttribute("aria-label", `Play ${game.title}`);

  const favoriteToggle = buildFavoriteToggle(getGameKey(game));

  const thumb = document.createElement("img");
  thumb.className = "game-thumb";
  thumb.src = game.imgSrc;
  thumb.alt = `${game.title} cover`;
  thumb.loading = "lazy";

  const body = document.createElement("div");
  body.className = "game-body";

  const title = document.createElement("div");
  title.className = "game-title";
  title.textContent = game.title;

  const meta = document.createElement("div");
  meta.className = "game-meta-row";
  meta.textContent = "Play now";

  body.append(title, meta);
  link.append(favoriteToggle, thumb, body);

  return link;
}

function renderGames(list) {
  gameGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const ordered = sortWithFavorites(list);

  ordered.forEach((game) => {
    fragment.appendChild(buildCard(game));
  });

  gameGrid.appendChild(fragment);
}

function applyFilter() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    visibleGames = games.slice();
  } else {
    visibleGames = games.filter((game) => game.title.toLowerCase().includes(query));
  }

  renderGames(visibleGames);
  updateCount(games.length, visibleGames.length);
  gamesEmpty.hidden = visibleGames.length > 0;
  clearSearch.disabled = query.length === 0;
}

function initBackToTop() {
  if (!backToTop) return;

  const toggleBackToTop = () => {
    const shouldShow = window.scrollY > 300;
    backToTop.classList.toggle("show", shouldShow);
  };

  window.addEventListener("scroll", toggleBackToTop);
  toggleBackToTop();

  backToTop.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

async function loadGames() {
  try {
    const response = await fetch(gamesUrl);
    if (!response.ok) {
      throw new Error("Failed to load games");
    }
    const data = await response.json();
    games = Array.isArray(data) ? data : [];
    visibleGames = games.slice();

    await loadFavorites();

    renderGames(visibleGames);
    updateCount(games.length, visibleGames.length);
    gamesLoader.hidden = true;
    randomGame.disabled = games.length === 0;
  } catch (error) {
    gamesLoader.hidden = true;
    gamesEmpty.hidden = false;
    gameCount.textContent = "Games unavailable";
  }
}

clearSearch.disabled = true;
randomGame.disabled = true;

searchInput.addEventListener("input", applyFilter);
clearSearch.addEventListener("click", () => {
  searchInput.value = "";
  applyFilter();
  searchInput.focus();
});

randomGame.addEventListener("click", () => {
  if (visibleGames.length === 0) return;
  const pick = visibleGames[Math.floor(Math.random() * visibleGames.length)];
  window.location.href = pick.link;
});

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    currentUserId = null;
    favoriteRecords.clear();
    applyFilter();
  });
}

initAppwrite();
initBackToTop();
loadGames();
})();

