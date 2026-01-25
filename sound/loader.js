const API_BASE = "https://api.netpurple.net";
const FAVORITES_COLLECTION = "favorites";
const FAVORITE_TYPE = "sound";
const AUTH_STORAGE_KEY = "pb_auth";

const audioElements = {};
const spinnerElement = document.getElementById("spinner");
const gridElement = document.getElementById("soundGrid");
const emptyElement = document.getElementById("soundEmpty");
const countElement = document.getElementById("soundCount");
const searchInput = document.getElementById("soundSearch");
const clearButton = document.getElementById("clearSearch");
const playAllButton = document.getElementById("playAll");
const stopAllButton = document.getElementById("stopAll");
const logoutButton = document.getElementById("logout-btn");

let sounds = [];
let filteredSounds = [];
let hasLoaded = false;
let playQueue = [];
let queueIndex = 0;
let queueActive = false;

const favoriteRecords = new Map();
const pendingFavorites = new Set();

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

function getUserId() {
  return readAuth()?.record?.id || null;
}

function redirectToLogin() {
  const target = encodeURIComponent(
    `${window.location.pathname}${window.location.search}${window.location.hash}`
  );
  window.location.href = `/login?return=${target}`;
}

async function apiFetch(path, options = {}) {
  const headers = { "Content-Type": "application/json" };
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
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data?.message || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

function getSoundKey(sound) {
  return sound.name;
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
    const aKey = getSoundKey(a.item);
    const bKey = getSoundKey(b.item);
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

function buildFavoriteToggle(soundKey) {
  const button = document.createElement("span");
  button.className = "favorite-toggle";
  button.setAttribute("role", "button");
  button.setAttribute("tabindex", "0");
  button.innerHTML = '<i class="fa-regular fa-heart" aria-hidden="true"></i>';
  setFavoriteVisual(button, favoriteRecords.has(soundKey));

  const handleToggle = (event) => {
    event.preventDefault();
    event.stopPropagation();
    toggleFavorite(soundKey);
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
  const userId = getUserId();
  const token = getAuthToken();
  if (!userId || !token) {
    return;
  }

  const filter = encodeURIComponent(`user="${userId}" && item_type="${FAVORITE_TYPE}"`);
  try {
    const data = await apiFetch(
      `/api/collections/${FAVORITES_COLLECTION}/records?page=1&perPage=200&filter=${filter}`
    );
    const items = Array.isArray(data?.items) ? data.items : [];
    items.forEach((record) => {
      if (record?.item_key) {
        favoriteRecords.set(record.item_key, record);
      }
    });
  } catch (error) {
    console.warn("Failed to load favorites", error);
  }
}

async function toggleFavorite(soundKey) {
  const userId = getUserId();
  const token = getAuthToken();
  if (!userId || !token) {
    redirectToLogin();
    return;
  }

  if (pendingFavorites.has(soundKey)) {
    return;
  }
  pendingFavorites.add(soundKey);

  const existing = favoriteRecords.get(soundKey);
  if (existing) {
    favoriteRecords.delete(soundKey);
    applyFilter();
    try {
      await apiFetch(`/api/collections/${FAVORITES_COLLECTION}/records/${existing.id}`,
        { method: "DELETE" }
      );
    } catch (error) {
      console.warn("Failed to remove favorite", error);
      favoriteRecords.set(soundKey, existing);
      applyFilter();
    } finally {
      pendingFavorites.delete(soundKey);
    }
    return;
  }

  const payload = {
    user: userId,
    item_type: FAVORITE_TYPE,
    item_key: soundKey,
    pinned: true,
    pin_order: Date.now()
  };

  const optimistic = {
    id: `tmp_${soundKey}`,
    item_key: soundKey,
    pin_order: payload.pin_order
  };

  favoriteRecords.set(soundKey, optimistic);
  applyFilter();

  try {
    const created = await apiFetch(`/api/collections/${FAVORITES_COLLECTION}/records`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );
    if (created?.id) {
      favoriteRecords.set(soundKey, created);
    }
  } catch (error) {
    console.warn("Failed to add favorite", error);
    favoriteRecords.delete(soundKey);
    applyFilter();
  } finally {
    pendingFavorites.delete(soundKey);
  }
}

function updateCount(total, showing) {
  if (total === 0) {
    countElement.textContent = "0 sounds";
    return;
  }

  countElement.textContent =
    showing === total ? `${total} sounds` : `${showing} of ${total} sounds`;
}

function stopAll(resetQueue = true) {
  Object.values(audioElements).forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
    audio.onended = null;
  });

  if (resetQueue) {
    queueActive = false;
    queueIndex = 0;
    playQueue = [];
  }
}

function playSound(name, fromQueue = false) {
  stopAll(!fromQueue);

  const audio = audioElements[name];
  if (!audio) return;

  audio.currentTime = 0;
  audio.play();

  if (fromQueue) {
    audio.onended = () => {
      if (!queueActive) return;
      queueIndex += 1;
      if (queueIndex < playQueue.length) {
        playSound(playQueue[queueIndex], true);
      } else {
        queueActive = false;
      }
    };
  }
}

function buildCard(sound, index) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "sound-card favorite-card";

  const accent = sound.color || sound.colr || "#8b5cf6";
  card.style.setProperty("--accent", accent);
  card.style.setProperty("--delay", `${Math.min(index * 0.03, 0.6)}s`);
  card.setAttribute("aria-label", `Play ${sound.name}`);
  card.setAttribute("title", sound.name);

  const favoriteToggle = buildFavoriteToggle(getSoundKey(sound));

  const chip = document.createElement("span");
  chip.className = "sound-chip";

  const icon = document.createElement("span");
  icon.className = "sound-icon";
  icon.innerHTML = '<i class="fa-solid fa-play" aria-hidden="true"></i>';

  const title = document.createElement("span");
  title.className = "sound-title";
  title.textContent = sound.name;

  const caption = document.createElement("span");
  caption.className = "sound-caption";
  caption.textContent = "Tap to play";

  chip.appendChild(icon);
  card.append(favoriteToggle, chip, title, caption);

  card.addEventListener("click", () => playSound(sound.name));
  return card;
}

function renderSounds(list) {
  gridElement.innerHTML = "";
  const fragment = document.createDocumentFragment();
  const ordered = sortWithFavorites(list);

  ordered.forEach((sound, index) => {
    fragment.appendChild(buildCard(sound, index));
  });

  gridElement.appendChild(fragment);
}

function applyFilter() {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) {
    filteredSounds = sounds.slice();
  } else {
    filteredSounds = sounds.filter((sound) =>
      sound.name.toLowerCase().includes(query)
    );
  }

  renderSounds(filteredSounds);
  updateCount(sounds.length, filteredSounds.length);
  emptyElement.hidden = filteredSounds.length > 0;
  clearButton.disabled = query.length === 0;
}

function handleError(message) {
  spinnerElement.setAttribute("hidden", "hidden");
  emptyElement.textContent = message;
  emptyElement.hidden = false;
  countElement.textContent = "Sounds unavailable";
}

async function loadSounds() {
  const cacheBust = Date.now();
  try {
    const response = await fetch(`sounds.json?t=${cacheBust}`);
    if (!response.ok) {
      throw new Error("Soundboard request failed");
    }
    const data = await response.json();
    sounds = Array.isArray(data.sounds) ? data.sounds : [];
    sounds.forEach((sound) => {
      const audio = document.createElement("audio");
      audio.src = sound.mp3;
      audio.preload = "auto";
      audioElements[sound.name] = audio;
      document.body.appendChild(audio);
    });

    await loadFavorites();

    filteredSounds = sounds.slice();
    renderSounds(filteredSounds);
    updateCount(sounds.length, filteredSounds.length);
    spinnerElement.setAttribute("hidden", "hidden");
    hasLoaded = true;
    clearButton.disabled = true;
  } catch (error) {
    handleError(`Error loading soundboard: ${error.message}`);
  }
}

clearButton.disabled = true;

searchInput.addEventListener("input", applyFilter);
clearButton.addEventListener("click", () => {
  searchInput.value = "";
  applyFilter();
  searchInput.focus();
});

playAllButton.addEventListener("click", () => {
  if (filteredSounds.length === 0) return;
  queueActive = true;
  playQueue = filteredSounds.map((sound) => sound.name);
  queueIndex = 0;
  playSound(playQueue[queueIndex], true);
});

stopAllButton.addEventListener("click", () => {
  stopAll(true);
});

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    favoriteRecords.clear();
    applyFilter();
  });
}

loadSounds();

setTimeout(() => {
  if (!hasLoaded) {
    handleError("Soundboard is taking too long to load.");
  }
}, 7000);
