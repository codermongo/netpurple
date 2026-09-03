/* =====================================================================
   NetPurple — globale Einstellungen (Dark Mode + Performance)
   Ersetzt die alten Einzel-Buttons und menu.js.

   - anon  → localStorage
   - eingeloggt → Appwrite-Tabelle user_config (Server gewinnt beim Login)

   Panel: Zahnrad-Button oben rechts unter dem User-/Login-Button.
   Feuert document-Event "np:configchange" für particles.js & Co.

   Einbinden auf JEDER Seite, nach dem Appwrite-Web-SDK:
     <script src="https://cdn.jsdelivr.net/npm/appwrite@14.0.1"></script>
     <script src="/config.js"></script>
   Ausserdem als ERSTES Kind von <body> das Anti-Flash-Snippet (siehe unten).
   ===================================================================== */
(function () {
  "use strict";

  var ENDPOINT = "https://api.netpurple.net/v1";
  var PROJECT = "699f23920000d9667d3e";
  var DB = "699f251000346ad6c5e7";
  var TABLE = "user_config";

  var LS = { dark: "darkMode", lp: "lowPowerMode", lpMobile: "lowPowerMobileOnly" };
  var MOBILE_MQ = window.matchMedia("(max-width: 768px)");

  function readLS(k) {
    try { return localStorage.getItem(k) === "true"; } catch (e) { return false; }
  }
  function writeLS(k, v) {
    try { localStorage.setItem(k, v ? "true" : "false"); } catch (e) { /* private mode */ }
  }

  var cfg = { dark: readLS(LS.dark), lp: readLS(LS.lp), lpMobile: readLS(LS.lpMobile) };

  /* ---------- styles (injected so every page gets them) ---------- */
  var CSS = [
    ".np-cfg-gear{position:fixed;top:calc(1.5rem + 56px + 12px);right:1.5rem;z-index:1001}",
    ".np-cfg-panel{position:fixed;top:calc(1.5rem + 134px);right:1.5rem;z-index:1002;width:264px;max-width:calc(100vw - 3rem);padding:16px 18px;border-radius:16px;",
    "background:var(--card-glass-bg,rgba(12,12,20,0.85));backdrop-filter:blur(14px) saturate(120%);-webkit-backdrop-filter:blur(14px) saturate(120%);",
    "border:1px solid var(--card-glass-stroke,rgba(139,92,246,0.25));box-shadow:0 16px 40px rgba(99,102,241,0.25);color:var(--text-primary,#fff);font-size:.9rem}",
    ".np-cfg-panel[hidden]{display:none}",
    ".np-cfg-title{font-weight:700;margin-bottom:6px}",
    ".np-cfg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 0}",
    ".np-cfg-row.sub{padding-left:16px;color:var(--text-secondary,#9aa0b4)}",
    ".np-cfg-row.sub.dim{opacity:.4;pointer-events:none}",
    ".np-cfg-status{margin-top:10px;padding-top:10px;border-top:1px solid var(--card-glass-stroke,rgba(139,92,246,0.25));color:var(--text-secondary,#9aa0b4);font-size:.9rem;line-height:1.9}",
    ".np-switch{--sw-w:40px;--sw-h:22px;position:relative;width:var(--sw-w);height:var(--sw-h);flex-shrink:0}",
    ".np-switch input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer}",
    ".np-switch>span{position:absolute;inset:0;border-radius:999px;background:rgba(120,120,140,.4);transition:background .25s ease}",
    ".np-switch>span::before{content:'';position:absolute;top:2px;left:2px;width:calc(var(--sw-h) - 4px);height:calc(var(--sw-h) - 4px);border-radius:50%;background:#fff;transition:transform .25s ease}",
    ".np-switch input:checked + span{background:var(--button-purple,#6366f1)}",
    ".np-switch input:checked + span::before{transform:translateX(calc(var(--sw-w) - var(--sw-h)))}",
    ".np-switch input:focus-visible + span{outline:2px solid var(--button-purple,#6366f1);outline-offset:2px}"
  ].join("");

  (function injectCSS() {
    if (document.getElementById("np-cfg-css")) return;
    var s = document.createElement("style");
    s.id = "np-cfg-css";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  })();

  var userId = null;
  var databases = null;
  var account = null;
  var saveTimer = null;

  function isMobile() { return MOBILE_MQ.matches; }
  function effectiveLp() { return cfg.lp && (!cfg.lpMobile || isMobile()); }

  /* ---------- apply to the page ---------- */
  function apply() {
    document.body.classList.toggle("dark-mode", cfg.dark);
    document.body.classList.toggle("low-power-mode", effectiveLp());
    syncControls();
    document.dispatchEvent(new CustomEvent("np:configchange", {
      detail: {
        dark: cfg.dark,
        lowPower: cfg.lp,
        mobileOnly: cfg.lpMobile,
        effectiveLowPower: effectiveLp()
      }
    }));
  }

  /* ---------- persistence ---------- */
  function persist() {
    writeLS(LS.dark, cfg.dark);
    writeLS(LS.lp, cfg.lp);
    writeLS(LS.lpMobile, cfg.lpMobile);
    if (userId && databases) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(pushRow, 400);
    }
  }

  function pushRow() {
    if (!userId || !databases) return;
    var data = {
      dark_mode: cfg.dark,
      low_power: cfg.lp,
      low_power_mobile_only: cfg.lpMobile
    };
    databases.updateDocument(DB, TABLE, userId, data).catch(function () {
      // row does not exist yet → create it with per-user permissions
      databases.createDocument(DB, TABLE, userId, data, [
        'read("user:' + userId + '")',
        'update("user:' + userId + '")',
        'delete("user:' + userId + '")'
      ]).catch(function () { /* offline / race — localStorage still holds it */ });
    });
  }

  function setKey(key, val) {
    cfg[key] = !!val;
    apply();
    persist();
  }

  /* ---------- server sync on load ---------- */
  function syncFromServer() {
    if (typeof Appwrite === "undefined") {
      // SDK tag may sit after this file; retry once the page is fully loaded.
      if (document.readyState !== "complete") {
        window.addEventListener("load", syncFromServer, { once: true });
      }
      return; // otherwise: localStorage-only fallback
    }
    try {
      var client = new Appwrite.Client().setEndpoint(ENDPOINT).setProject(PROJECT);
      account = new Appwrite.Account(client);
      databases = new Appwrite.Databases(client);
    } catch (e) { return; }

    account.get().then(function (u) {
      userId = u && u.$id;
      if (!userId) return;
      databases.getDocument(DB, TABLE, userId).then(function (row) {
        // server wins
        cfg.dark = !!row.dark_mode;
        cfg.lp = !!row.low_power;
        cfg.lpMobile = !!row.low_power_mobile_only;
        writeLS(LS.dark, cfg.dark);
        writeLS(LS.lp, cfg.lp);
        writeLS(LS.lpMobile, cfg.lpMobile);
        apply();
      }, function () {
        // no row yet → migrate current local values up once
        pushRow();
      });
    }, function () { /* anonymous — nothing to do */ });
  }

  /* ---------- UI ---------- */
  var els = {};

  function gearIcon() {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="12" cy="12" r="3"/>'
      + '<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.13.31.2.65.2 1s-.07.69-.2 1z"/></svg>';
  }

  function row(id, label, sub) {
    return '<div class="np-cfg-row' + (sub ? " sub" : "") + '" data-row="' + id + '">'
      + '<span>' + label + '</span>'
      + '<label class="np-switch"><input type="checkbox" id="np-cfg-' + id + '"><span></span></label>'
      + '</div>';
  }

  function buildUI() {
    var gear = document.createElement("button");
    gear.type = "button";
    gear.className = "menu-item-circle np-cfg-gear";
    gear.id = "np-cfg-gear";
    gear.setAttribute("aria-label", "Einstellungen");
    gear.setAttribute("aria-expanded", "false");
    gear.innerHTML = gearIcon();

    var panel = document.createElement("div");
    panel.className = "np-cfg-panel";
    panel.id = "np-cfg-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Einstellungen");
    panel.hidden = true;
    panel.innerHTML =
      '<div class="np-cfg-title">Einstellungen</div>'
      + row("dark", "Dark Mode", false)
      + row("lp", "Performance Mode", false)
      + row("lpmobile", "nur auf Mobilgeräten", true)
      + '<div class="np-cfg-status" id="np-cfg-status"></div>';

    document.body.appendChild(gear);
    document.body.appendChild(panel);

    els.gear = gear;
    els.panel = panel;
    els.dark = panel.querySelector("#np-cfg-dark");
    els.lp = panel.querySelector("#np-cfg-lp");
    els.lpmobile = panel.querySelector("#np-cfg-lpmobile");
    els.mobileRow = panel.querySelector('[data-row="lpmobile"]');
    els.status = panel.querySelector("#np-cfg-status");

    gear.addEventListener("click", function (e) {
      e.stopPropagation();
      togglePanel();
    });
    panel.addEventListener("click", function (e) { e.stopPropagation(); });
    document.addEventListener("click", function () { if (isOpen()) togglePanel(false); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) togglePanel(false);
    });

    els.dark.addEventListener("change", function () { setKey("dark", els.dark.checked); });
    els.lp.addEventListener("change", function () { setKey("lp", els.lp.checked); });
    els.lpmobile.addEventListener("change", function () { setKey("lpMobile", els.lpmobile.checked); });
  }

  function isOpen() { return els.panel && !els.panel.hidden; }
  function togglePanel(force) {
    var next = typeof force === "boolean" ? force : !isOpen();
    els.panel.hidden = !next;
    els.gear.setAttribute("aria-expanded", String(next));
  }

  function syncControls() {
    if (!els.panel) return;
    els.dark.checked = cfg.dark;
    els.lp.checked = cfg.lp;
    els.lpmobile.checked = cfg.lpMobile;
    els.mobileRow.classList.toggle("dim", !cfg.lp);

    var perf;
    if (!cfg.lp) {
      perf = "aus";
    } else if (cfg.lpMobile) {
      perf = isMobile() ? "an (aktiv – mobile Ansicht)" : "an (inaktiv – Desktop)";
    } else {
      perf = "an";
    }
    els.status.innerHTML =
      "Dark Mode: " + (cfg.dark ? "an" : "aus") + "<br>"
      + "Performance: " + perf + "<br>"
      + "Nur auf Mobil: " + (cfg.lpMobile ? "an" : "aus");
  }

  /* ---------- init ---------- */
  function init() {
    buildUI();
    apply();
    if (MOBILE_MQ.addEventListener) MOBILE_MQ.addEventListener("change", apply);
    else if (MOBILE_MQ.addListener) MOBILE_MQ.addListener(apply); // older Safari
    syncFromServer();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
