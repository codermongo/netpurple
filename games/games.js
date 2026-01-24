const gamesUrl = "config/games.json";

const gameGrid = document.getElementById("gameGrid");
const gameCount = document.getElementById("gameCount");
const gamesLoader = document.getElementById("gamesLoader");
const gamesEmpty = document.getElementById("gamesEmpty");
const searchInput = document.getElementById("searchInput");
const clearSearch = document.getElementById("clearSearch");
const randomGame = document.getElementById("randomGame");
const backToTop = document.getElementById("backToTop");

let games = [];
let visibleGames = [];

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
  link.className = "game-card";
  link.href = game.link;
  link.setAttribute("title", game.title);
  link.setAttribute("aria-label", `Play ${game.title}`);

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
  link.append(thumb, body);

  return link;
}

function renderGames(list) {
  gameGrid.innerHTML = "";
  const fragment = document.createDocumentFragment();

  list.forEach((game) => {
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

clearSearch.disabled = true;
randomGame.disabled = true;

fetch(gamesUrl)
  .then((response) => {
    if (!response.ok) {
      throw new Error("Failed to load games");
    }
    return response.json();
  })
  .then((data) => {
    games = Array.isArray(data) ? data : [];
    visibleGames = games.slice();
    renderGames(visibleGames);
    updateCount(games.length, visibleGames.length);
    gamesLoader.hidden = true;
    randomGame.disabled = games.length === 0;
  })
  .catch(() => {
    gamesLoader.hidden = true;
    gamesEmpty.hidden = false;
    gameCount.textContent = "Games unavailable";
  });

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

initBackToTop();
