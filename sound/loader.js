const audioElements = {};
const spinnerElement = document.getElementById("spinner");
const gridElement = document.getElementById("soundGrid");
const emptyElement = document.getElementById("soundEmpty");
const countElement = document.getElementById("soundCount");
const searchInput = document.getElementById("soundSearch");
const clearButton = document.getElementById("clearSearch");
const playAllButton = document.getElementById("playAll");
const stopAllButton = document.getElementById("stopAll");

let sounds = [];
let filteredSounds = [];
let hasLoaded = false;
let playQueue = [];
let queueIndex = 0;
let queueActive = false;

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
  card.className = "sound-card";

  const accent = sound.color || sound.colr || "#8b5cf6";
  card.style.setProperty("--accent", accent);
  card.style.setProperty("--delay", `${Math.min(index * 0.03, 0.6)}s`);
  card.setAttribute("aria-label", `Play ${sound.name}`);
  card.setAttribute("title", sound.name);

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
  card.append(chip, title, caption);

  card.addEventListener("click", () => playSound(sound.name));
  return card;
}

function renderSounds(list) {
  gridElement.innerHTML = "";
  const fragment = document.createDocumentFragment();

  list.forEach((sound, index) => {
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

function loadSounds() {
  const cacheBust = Date.now();
  fetch(`sounds.json?t=${cacheBust}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error("Soundboard request failed");
      }
      return response.json();
    })
    .then((data) => {
      sounds = Array.isArray(data.sounds) ? data.sounds : [];
      sounds.forEach((sound) => {
        const audio = document.createElement("audio");
        audio.src = sound.mp3;
        audio.preload = "auto";
        audioElements[sound.name] = audio;
        document.body.appendChild(audio);
      });
      filteredSounds = sounds.slice();
      renderSounds(filteredSounds);
      updateCount(sounds.length, filteredSounds.length);
      spinnerElement.setAttribute("hidden", "hidden");
      hasLoaded = true;
      clearButton.disabled = true;
    })
    .catch((error) => {
      handleError(`Error loading soundboard: ${error.message}`);
    });
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

loadSounds();

setTimeout(() => {
  if (!hasLoaded) {
    handleError("Soundboard is taking too long to load.");
  }
}, 7000);
