(() => {
const API_BASE = "https://api.netpurple.net";
const COLLECTION = "videos";
const AUTH_STORAGE_KEY = "pb_auth";
const PER_PAGE = 200;
const SORT = "-score_d,-score_star,-created";

const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const catigorieFilter = document.getElementById("catigorieFilter");
const videoGrid = document.getElementById("videoGrid");
const statusText = document.getElementById("statusText");
const hubLoader = document.getElementById("hubLoader");
const hubEmpty = document.getElementById("hubEmpty");
const editOverlay = document.getElementById("editOverlay");
const editForm = document.getElementById("editForm");
const addEntryBtn = document.getElementById("addEntryBtn");
const editModalTitle = document.getElementById("editModalTitle");
const editTitle = document.getElementById("editTitle");
const editType = document.getElementById("editType");
const editCatigorie = document.getElementById("editCatigorie");
const editTrigger = document.getElementById("editTrigger");
const editScoreD = document.getElementById("editScoreD");
const editScoreStar = document.getElementById("editScoreStar");
const editLink = document.getElementById("editLink");
const editNotes = document.getElementById("editNotes");
const editError = document.getElementById("editError");
const editCancelBtn = document.getElementById("editCancelBtn");
const editSaveBtn = document.getElementById("editSaveBtn");

let allVideos = [];
let visibleVideos = [];
let activeEditId = null;
let modalMode = "edit";
const pendingActions = new Set();

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

async function apiFetch(path, options = {}) {
  const headers = { Accept: "application/json" };
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

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return null;
}

function getTypeValue(record) {
  return record?.Type || record?.type || record?.category || "";
}

function getCatigorieValue(record) {
  return record?.Catigorie || record?.catigorie || "";
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

function withRank(records) {
  return sortVideos(records).map((record, index) => ({
    ...record,
    rank: index + 1
  }));
}

function setTypeOptions(records) {
  const previous = typeFilter.value || "all";
  const types = new Set();
  records.forEach((record) => {
    const value = getTypeValue(record);
    if (value) {
      types.add(value);
    }
  });

  typeFilter.innerHTML = '<option value="all">All types</option>';
  Array.from(types).sort().forEach((type) => {
    const option = document.createElement("option");
    option.value = type;
    option.textContent = type;
    typeFilter.appendChild(option);
  });

  const hasPrevious = Array.from(typeFilter.options).some((option) => option.value === previous);
  typeFilter.value = hasPrevious ? previous : "all";
}

function setCatigorieOptions(records) {
  const previous = catigorieFilter.value || "all";
  const catigories = new Set();
  records.forEach((record) => {
    const value = getCatigorieValue(record);
    if (value) {
      catigories.add(value);
    }
  });

  catigorieFilter.innerHTML = '<option value="all">All catigories</option>';
  Array.from(catigories).sort().forEach((catigorie) => {
    const option = document.createElement("option");
    option.value = catigorie;
    option.textContent = catigorie;
    catigorieFilter.appendChild(option);
  });

  const hasPrevious = Array.from(catigorieFilter.options).some((option) => option.value === previous);
  catigorieFilter.value = hasPrevious ? previous : "all";
}

function setStatus(total, showing) {
  if (total === 0) {
    statusText.textContent = "Showing 0 of 0 entries.";
    return;
  }
  statusText.textContent = `Showing ${showing} of ${total} entries.`;
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

function normalizeWarning(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

function getWarningClass(value) {
  const normalized = normalizeWarning(value);
  if (normalized === "futunari" || normalized === "futanri") {
    return "warning-futunari";
  }
  if (normalized === "zensiert") {
    return "warning-zensiert";
  }
  if (normalized === "enk") {
    return "warning-enk";
  }
  if (normalized === "old style hentai" || normalized === "old style henati") {
    return "warning-old-style";
  }
  return "";
}

function parseOptionalNumber(value) {
  const input = String(value ?? "").trim();
  if (!input) {
    return null;
  }
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : null;
}

function setEditError(message) {
  editError.textContent = message || "";
}

function setEditLoading(isLoading) {
  editSaveBtn.disabled = isLoading;
  editCancelBtn.disabled = isLoading;
  if (isLoading) {
    editSaveBtn.textContent = modalMode === "create" ? "Creating..." : "Saving...";
    return;
  }
  editSaveBtn.textContent = modalMode === "create" ? "Create" : "Save";
}

function setSelectValue(selectElement, value) {
  const nextValue = value || "";
  selectElement.value = nextValue;
  if (selectElement.value !== nextValue) {
    selectElement.value = "";
  }
}

function closeEditModal() {
  activeEditId = null;
  modalMode = "edit";
  setEditError("");
  setEditLoading(false);
  editOverlay.hidden = true;
  editOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
}

function openEditModal(recordId) {
  const record = allVideos.find((video) => video.id === recordId);
  if (!record) {
    return;
  }
  modalMode = "edit";
  activeEditId = record.id;
  setEditError("");
  setEditLoading(false);
  editModalTitle.textContent = "Edit Video Entry";
  editTitle.value = record.title || "";
  setSelectValue(editType, getTypeValue(record));
  setSelectValue(editCatigorie, getCatigorieValue(record));
  setSelectValue(editTrigger, record.trigger_warning || "");
  editScoreD.value = record.score_d ?? "";
  editScoreStar.value = record.score_star ?? "";
  editLink.value = record.link || "";
  editNotes.value = record.notes || "";
  editOverlay.hidden = false;
  editOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  editTitle.focus();
}

function openCreateModal() {
  modalMode = "create";
  activeEditId = null;
  setEditError("");
  setEditLoading(false);
  editModalTitle.textContent = "Add Video Entry";
  editTitle.value = "";
  editType.value = "";
  editCatigorie.value = "";
  editTrigger.value = "";
  editScoreD.value = "";
  editScoreStar.value = "";
  editLink.value = "";
  editNotes.value = "";
  editOverlay.hidden = false;
  editOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  editTitle.focus();
}

function refreshRecords(records) {
  allVideos = withRank(records);
  setTypeOptions(allVideos);
  setCatigorieOptions(allVideos);
  applyFilter();
}

function getPlainRecords() {
  return allVideos.map((video) => {
    const { rank, ...rest } = video;
    return rest;
  });
}

function buildActionButtons(video) {
  const actions = document.createElement("div");
  actions.className = "row-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "action-btn edit";
  editButton.setAttribute("aria-label", `Edit ${video.title || "entry"}`);
  editButton.innerHTML = '<i class="fa-solid fa-pen" aria-hidden="true"></i>';
  editButton.addEventListener("click", () => {
    openEditModal(video.id);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "action-btn delete";
  deleteButton.setAttribute("aria-label", `Delete ${video.title || "entry"}`);
  deleteButton.innerHTML = '<i class="fa-solid fa-trash" aria-hidden="true"></i>';
  deleteButton.addEventListener("click", () => {
    deleteEntry(video.id);
  });

  const disabled = pendingActions.has(video.id);
  editButton.disabled = disabled;
  deleteButton.disabled = disabled;

  actions.append(editButton, deleteButton);
  return actions;
}

async function deleteEntry(recordId) {
  const record = allVideos.find((video) => video.id === recordId);
  if (!record || pendingActions.has(recordId)) {
    return;
  }

  const confirmDelete = window.confirm(`Delete "${record.title || "this entry"}"?`);
  if (!confirmDelete) {
    return;
  }

  pendingActions.add(recordId);
  applyFilter();

  try {
    await apiFetch(`/api/collections/${COLLECTION}/records/${recordId}`,
      { method: "DELETE" }
    );
    const remaining = getPlainRecords().filter((video) => video.id !== recordId);
    refreshRecords(remaining);
  } catch (error) {
    if (error?.status === 401 || error?.status === 403) {
      redirectToLogin();
      return;
    }
    window.alert(error.message || "Delete failed.");
  } finally {
    pendingActions.delete(recordId);
    applyFilter();
  }
}

function buildCard(video) {
  const card = document.createElement("article");
  card.className = "video-card";
  const warningClass = getWarningClass(video.trigger_warning);
  if (warningClass) {
    card.classList.add(warningClass);
  }

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

  const type = document.createElement("div");
  type.className = "db-value";
  type.textContent = getTypeValue(video) || "None";

  const catigorie = document.createElement("div");
  catigorie.className = "db-value";
  catigorie.textContent = getCatigorieValue(video) || "None";

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
  const actionCell = buildActionButtons(video);

  topRow.append(title, type, catigorie, description, scoreD, scoreStar, linkCell, warning, actionCell);
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
  const selectedType = typeFilter.value;
  const selectedCatigorie = catigorieFilter.value;

  visibleVideos = allVideos.filter((video) => {
    const title = (video.title || "").toLowerCase();
    const notes = (video.notes || "").toLowerCase();
    const link = (video.link || "").toLowerCase();
    const type = getTypeValue(video).toLowerCase();
    const catigorie = getCatigorieValue(video).toLowerCase();
    const warning = (video.trigger_warning || "").toLowerCase();

    const matchesSearch = !query
      || title.includes(query)
      || notes.includes(query)
      || link.includes(query)
      || type.includes(query)
      || catigorie.includes(query)
      || warning.includes(query);

    const matchesType = selectedType === "all" || getTypeValue(video) === selectedType;
    const matchesCatigorie = selectedCatigorie === "all" || getCatigorieValue(video) === selectedCatigorie;

    return matchesSearch && matchesType && matchesCatigorie;
  });

  renderVideos(visibleVideos);
  setStatus(allVideos.length, visibleVideos.length);
  hubEmpty.hidden = visibleVideos.length > 0;
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
    refreshRecords(records);
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

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (modalMode === "edit" && (!activeEditId || pendingActions.has(activeEditId))) {
    return;
  }
  const recordId = activeEditId;

  const payload = {
    title: editTitle.value.trim(),
    Type: editType.value || "",
    Catigorie: editCatigorie.value || "",
    trigger_warning: editTrigger.value || "",
    score_d: parseOptionalNumber(editScoreD.value),
    score_star: parseOptionalNumber(editScoreStar.value),
    notes: editNotes.value.trim(),
    link: editLink.value.trim()
  };

  if (!payload.title) {
    setEditError("Title is required.");
    return;
  }
  if (!payload.link) {
    setEditError("URL is required.");
    return;
  }

  setEditError("");
  setEditLoading(true);
  if (recordId) {
    pendingActions.add(recordId);
  }
  applyFilter();

  try {
    if (modalMode === "create") {
      const created = await apiFetch(`/api/collections/${COLLECTION}/records`,
        {
          method: "POST",
          body: JSON.stringify(payload)
        }
      );
      const nextRecords = getPlainRecords();
      if (created && created.id) {
        nextRecords.push(created);
      } else {
        nextRecords.push({ ...payload, id: `local_${Date.now()}` });
      }
      refreshRecords(nextRecords);
    } else {
      const updated = await apiFetch(`/api/collections/${COLLECTION}/records/${recordId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload)
        }
      );

      const records = getPlainRecords().map((video) => {
        if (video.id !== recordId) {
          return video;
        }
        return updated && updated.id ? updated : { ...video, ...payload };
      });

      refreshRecords(records);
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
    if (recordId) {
      pendingActions.delete(recordId);
    }
    applyFilter();
  }
});

editCancelBtn.addEventListener("click", () => {
  closeEditModal();
});

editOverlay.addEventListener("click", (event) => {
  if (event.target === editOverlay) {
    closeEditModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !editOverlay.hidden) {
    closeEditModal();
  }
});

closeEditModal();

if (!ensureAuthenticated()) {
  hubLoader.hidden = true;
} else {
  addEntryBtn.addEventListener("click", () => {
    openCreateModal();
  });
  searchInput.addEventListener("input", applyFilter);
  typeFilter.addEventListener("change", applyFilter);
  catigorieFilter.addEventListener("change", applyFilter);

  loadVideos();
}
})();
