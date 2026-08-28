/* =====================================================================
   User-Tierlist — Erstell-Dialog
   Injiziert ein Modal, führt durch Kategorie → Name/Tiers/Sichtbarkeit
   und legt eine Zeile in `user_tierlists` an. Danach Redirect in den
   leeren Editor (/tier/custom?id=<id>).

   Einbinden nach dem Appwrite-Web-SDK:
     <script src="https://cdn.jsdelivr.net/npm/appwrite@14.0.1"></script>
     <script src="create.js"></script>

   Auslöser: jedes Element mit [data-tierlist-create].
   Deep-Link:  /tier/?new   oder   #new
   ===================================================================== */
(function () {
  "use strict";

  const APPWRITE_ENDPOINT = "https://api.netpurple.net/v1";
  const APPWRITE_PROJECT_ID = "699f23920000d9667d3e";
  const APPWRITE_DATABASE_ID = "699f251000346ad6c5e7";
  const LISTS_COLLECTION_ID = "user_tierlists";
  const MAX_LISTS = 3;
  const LOGIN_RETURN = "/tier/me";

  const ALL_TIERS = ["Best of All Time", "S", "A", "B", "C", "D", "E", "F", "-F"];
  const DEFAULT_TIERS = ["S", "A", "B", "C", "D", "E", "F"];
  const TIER_SLUG = {
    "Best of All Time": "best", "S": "s", "A": "a", "B": "b", "C": "c",
    "D": "d", "E": "e", "F": "f", "-F": "neg-f"
  };
  const TIER_SHORT = { "Best of All Time": "BoAT" };

  const CATEGORIES = [
    { id: "anime", label: "Anime", icon: "fa-tv" },
    { id: "games", label: "Games", icon: "fa-gamepad" },
    { id: "series", label: "Serien", icon: "fa-film" }
  ];

  let Sdk = null;
  let account = null;
  let databases = null;
  let overlayEl = null;

  let state = freshState();

  function freshState() {
    return {
      step: 1,
      category: "",
      name: "",
      tiers: DEFAULT_TIERS.slice(),
      visibility: "private",
      busy: false
    };
  }

  function initSdk() {
    if (databases) return true;
    if (typeof Appwrite === "undefined") return false;
    Sdk = Appwrite;
    const client = new Sdk.Client()
      .setEndpoint(APPWRITE_ENDPOINT)
      .setProject(APPWRITE_PROJECT_ID);
    account = new Sdk.Account(client);
    databases = new Sdk.Databases(client);
    return true;
  }

  function el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function ensureOverlay() {
    if (overlayEl) return overlayEl;
    overlayEl = el(
      '<div class="edit-overlay create-overlay" id="tlCreateOverlay" hidden aria-hidden="true"' +
      ' role="dialog" aria-modal="true" aria-labelledby="tlCreateTitle">' +
      '  <div class="edit-modal create-modal">' +
      '    <button type="button" class="create-close" id="tlCreateClose" aria-label="Dialog schließen">&times;</button>' +
      '    <h2 class="edit-title" id="tlCreateTitle">Neue Tierlist</h2>' +
      '    <div class="create-body" id="tlCreateBody"></div>' +
      '    <p class="edit-error" id="tlCreateError" role="alert"></p>' +
      '    <div class="edit-actions" id="tlCreateActions"></div>' +
      '  </div>' +
      '</div>'
    );
    overlayEl.querySelector("#tlCreateClose").addEventListener("click", close);
    overlayEl.addEventListener("click", function (e) {
      if (e.target === overlayEl) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlayEl && !overlayEl.hidden) close();
    });
    document.body.appendChild(overlayEl);
    return overlayEl;
  }

  function setError(msg) {
    overlayEl.querySelector("#tlCreateError").textContent = msg || "";
  }

  function render() {
    const title = overlayEl.querySelector("#tlCreateTitle");
    const body = overlayEl.querySelector("#tlCreateBody");
    const actions = overlayEl.querySelector("#tlCreateActions");
    setError("");

    if (state.step === 1) {
      title.textContent = "Wofür ist die Tierlist?";
      body.innerHTML =
        '<p class="create-hint">Schritt 1 von 2 — Kategorie wählen.</p>' +
        '<div class="create-cat-grid">' +
        CATEGORIES.map(function (c) {
          return (
            '<button type="button" class="create-cat' +
            (state.category === c.id ? " is-selected" : "") +
            '" data-cat="' + c.id + '">' +
            '<i class="fa-solid ' + c.icon + '" aria-hidden="true"></i>' +
            '<span>' + c.label + "</span>" +
            "</button>"
          );
        }).join("") +
        "</div>";

      body.querySelectorAll(".create-cat").forEach(function (btn) {
        btn.addEventListener("click", function () {
          state.category = btn.dataset.cat;
          state.step = 2;
          render();
        });
      });

      actions.innerHTML =
        '<button type="button" class="tool-button secondary" data-act="cancel">Abbrechen</button>';
    } else {
      const cat = CATEGORIES.filter(function (c) { return c.id === state.category; })[0] || {};
      title.textContent = "Details";
      body.innerHTML =
        '<p class="create-hint">Schritt 2 von 2 — Kategorie: <strong>' +
        escapeHtml(cat.label || "") + "</strong></p>" +
        '<div class="edit-field">' +
        "  <span>Name</span>" +
        '  <input type="text" id="tlName" maxlength="120" autocomplete="off"' +
        '    placeholder="z. B. Meine ' + escapeHtml(cat.label || "Liste") + ' 2026"' +
        '    value="' + escapeHtml(state.name) + '" />' +
        "</div>" +
        '<div class="edit-field">' +
        '  <span>Tiers <small style="opacity:.65">(mind. 1, Reihenfolge fest)</small></span>' +
        '  <div class="tier-chip-row" id="tlTiers">' +
        ALL_TIERS.map(function (t) {
          return (
            '<button type="button" class="tier-chip' +
            (state.tiers.indexOf(t) !== -1 ? " is-on" : "") +
            '" data-tier="' + escapeHtml(t) + '">' + escapeHtml(t) + "</button>"
          );
        }).join("") +
        "  </div>" +
        '  <div class="tl-preview" id="tlPreview" aria-hidden="true"></div>' +
        "</div>" +
        '<div class="edit-field">' +
        "  <span>Sichtbarkeit</span>" +
        '  <div class="seg-toggle" id="tlVis">' +
        '    <button type="button" data-vis="private"' +
        (state.visibility === "private" ? ' class="is-on"' : "") + ">Privat</button>" +
        '    <button type="button" data-vis="public"' +
        (state.visibility === "public" ? ' class="is-on"' : "") + ">Öffentlich</button>" +
        "  </div>" +
        '  <small class="create-hint" id="tlVisHint"></small>' +
        "</div>";

      const nameInput = body.querySelector("#tlName");
      nameInput.addEventListener("input", function () {
        state.name = nameInput.value;
      });

      const previewEl = body.querySelector("#tlPreview");
      function renderPreview() {
        const active = ALL_TIERS.filter(function (x) {
          return state.tiers.indexOf(x) !== -1;
        });
        previewEl.innerHTML = active
          .map(function (t) {
            return (
              '<div class="tl-preview-row tl-pr-' + TIER_SLUG[t] + '">' +
              "<span>" + escapeHtml(TIER_SHORT[t] || t) + "</span><i></i></div>"
            );
          })
          .join("");
        previewEl.classList.toggle("is-empty", active.length === 0);
      }
      renderPreview();

      body.querySelectorAll(".tier-chip").forEach(function (chip) {
        chip.addEventListener("click", function () {
          const t = chip.dataset.tier;
          if (state.tiers.indexOf(t) !== -1) {
            state.tiers = state.tiers.filter(function (x) { return x !== t; });
          } else {
            state.tiers = ALL_TIERS.filter(function (x) {
              return state.tiers.indexOf(x) !== -1 || x === t;
            });
          }
          chip.classList.toggle("is-on");
          renderPreview();
        });
      });

      const visHint = body.querySelector("#tlVisHint");
      function updateVisHint() {
        visHint.textContent =
          state.visibility === "public"
            ? "Jeder mit dem Link kann die Liste ansehen (nicht bearbeiten)."
            : "Nur du siehst diese Liste.";
      }
      updateVisHint();
      body.querySelectorAll("#tlVis button").forEach(function (b) {
        b.addEventListener("click", function () {
          state.visibility = b.dataset.vis;
          body.querySelectorAll("#tlVis button").forEach(function (x) {
            x.classList.toggle("is-on", x === b);
          });
          updateVisHint();
        });
      });

      actions.innerHTML =
        '<button type="button" class="tool-button secondary" data-act="back">Zurück</button>' +
        '<button type="button" class="tool-button" data-act="create">Tierlist erstellen</button>';
    }

    actions.querySelectorAll("[data-act]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const act = btn.dataset.act;
        if (act === "cancel") close();
        else if (act === "back") { state.step = 1; render(); }
        else if (act === "create") submit();
      });
    });
  }

  function setCreateBusy(busy) {
    state.busy = busy;
    const b = overlayEl.querySelector('[data-act="create"]');
    if (b) {
      b.disabled = busy;
      b.textContent = busy ? "Erstelle…" : "Tierlist erstellen";
    }
  }

  async function submit() {
    if (state.busy) return;

    const name = (state.name || "").trim();
    if (!name) { setError("Bitte einen Namen eingeben."); return; }
    if (state.tiers.length < 1) { setError("Mindestens ein Tier auswählen."); return; }
    if (!initSdk()) { setError("Appwrite SDK nicht geladen."); return; }

    setCreateBusy(true);
    setError("");

    let user;
    try {
      user = await account.get();
    } catch (err) {
      // nicht eingeloggt → zum Login
      window.location.href = "/login?return=" + encodeURIComponent(LOGIN_RETURN);
      return;
    }

    try {
      const existing = await databases.listDocuments(APPWRITE_DATABASE_ID, LISTS_COLLECTION_ID, [
        Sdk.Query.equal("owner", user.$id),
        Sdk.Query.limit(1)
      ]);
      if (existing.total >= MAX_LISTS) {
        setError("Maximal " + MAX_LISTS + " eigene Tierlists. Lösche zuerst eine unter „Meine Listen“.");
        setCreateBusy(false);
        return;
      }

      const uid = user.$id;
      const perms = [
        'update("user:' + uid + '")',
        'delete("user:' + uid + '")',
        state.visibility === "public" ? 'read("any")' : 'read("user:' + uid + '")'
      ];

      const orderedTiers = ALL_TIERS.filter(function (t) {
        return state.tiers.indexOf(t) !== -1;
      });

      const doc = await databases.createDocument(
        APPWRITE_DATABASE_ID,
        LISTS_COLLECTION_ID,
        Sdk.ID.unique(),
        {
          owner: uid,
          name: name,
          category: state.category,
          tiers: JSON.stringify(orderedTiers),
          visibility: state.visibility
        },
        perms
      );

      window.location.href = "/tier/custom/?id=" + encodeURIComponent(doc.$id);
    } catch (err) {
      setError((err && err.message) || "Erstellen fehlgeschlagen.");
      setCreateBusy(false);
    }
  }

  function open() {
    ensureOverlay();
    state = freshState();
    render();
    overlayEl.hidden = false;
    overlayEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    const firstCat = overlayEl.querySelector(".create-cat");
    if (firstCat) firstCat.focus();
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.hidden = true;
    overlayEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
  }

  window.TierlistCreate = { open: open, close: close };

  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-tierlist-create]").forEach(function (node) {
      node.addEventListener("click", function (e) {
        e.preventDefault();
        open();
      });
    });
    const params = new URLSearchParams(window.location.search);
    if (params.has("new") || window.location.hash === "#new") {
      open();
    }
  });
})();
