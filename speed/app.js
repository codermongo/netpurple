(function () {
  "use strict";

  /* ── Theme + Low-Power (gleiches Verhalten wie der Rest der Seite) ── */
  var THEME_KEY = "darkMode";
  if (localStorage.getItem(THEME_KEY) === "true") document.body.classList.add("dark-mode");
  var tt = document.getElementById("themeToggleItem");
  if (tt) {
    tt.addEventListener("click", function () {
      document.body.classList.toggle("dark-mode");
      localStorage.setItem(THEME_KEY, document.body.classList.contains("dark-mode"));
    });
  }
  if (localStorage.getItem("lowPowerMode") === "true") document.body.classList.add("low-power-mode");

  /* ── Auth-Gate: nur eingeloggte NetPurple-Nutzer ── */
  var ENDPOINT = "https://api.netpurple.net/v1";
  var PROJECT = "699f23920000d9667d3e";
  var gate = document.getElementById("authGate");
  var gateText = document.getElementById("authGateText");
  var app = document.getElementById("app");

  if (typeof Appwrite === "undefined") {
    gateText.textContent = "Appwrite-SDK konnte nicht geladen werden.";
    return;
  }
  var client = new Appwrite.Client().setEndpoint(ENDPOINT).setProject(PROJECT);
  var account = new Appwrite.Account(client);

  account.get().then(
    function () {
      gate.hidden = true;
      app.hidden = false;
      initSpeed();
    },
    function () {
      gateText.textContent = "Nicht angemeldet – Weiterleitung zum Login …";
      location.href = "/login?return=" + encodeURIComponent("/speed");
    }
  );

  /* ── Speedtest ── */
  function initSpeed() {
    var ARC = 471.24; // 270° von 2·π·100
    var MAX_MBIT = 1000;

    var gaugeEl = document.getElementById("gauge");
    var fillEl = document.getElementById("gaugeFill");
    var phaseEl = document.getElementById("gaugePhase");
    var valueEl = document.getElementById("gaugeValue");
    var unitEl = document.getElementById("gaugeUnit");
    var startBtn = document.getElementById("startBtn");
    var metaEl = document.getElementById("speedMeta");
    var rDl = document.getElementById("rDl");
    var rUl = document.getElementById("rUl");
    var rPing = document.getElementById("rPing");
    var rJit = document.getElementById("rJit");
    var cards = {
      dl: document.querySelector('.result-card[data-k="dl"]'),
      ul: document.querySelector('.result-card[data-k="ul"]'),
      ping: document.querySelector('.result-card[data-k="ping"]'),
      jit: document.querySelector('.result-card[data-k="jit"]')
    };

    var test = null;
    var running = false;

    function setArc(frac) {
      frac = Math.max(0, Math.min(1, frac));
      fillEl.style.strokeDashoffset = String(ARC * (1 - frac));
    }
    function speedFrac(mbit) {
      return Math.pow(Math.min(mbit, MAX_MBIT) / MAX_MBIT, 0.55);
    }
    function fmtSpeed(v) {
      v = parseFloat(v) || 0;
      return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
    }
    function fmtMs(v) {
      v = parseFloat(v) || 0;
      return v >= 100 ? String(Math.round(v)) : v.toFixed(1);
    }
    function activeCard(key) {
      Object.keys(cards).forEach(function (k) {
        cards[k].classList.toggle("is-active", k === key);
      });
    }
    function resetUI() {
      setArc(0);
      gaugeEl.className = "gauge";
      phaseEl.textContent = "Bereit";
      valueEl.textContent = "–";
      unitEl.textContent = "Mbit/s";
      rDl.textContent = rUl.textContent = rPing.textContent = rJit.textContent = "–";
      activeCard(null);
      metaEl.innerHTML = "&nbsp;";
    }

    function onUpdate(d) {
      if (d.clientIp) {
        metaEl.textContent = "Erkannte IP: " + String(d.clientIp).trim();
      }
      switch (d.testState) {
        case 1: // Download
          gaugeEl.className = "gauge is-dl";
          phaseEl.textContent = "Download";
          unitEl.textContent = "Mbit/s";
          valueEl.textContent = fmtSpeed(d.dlStatus);
          setArc(speedFrac(parseFloat(d.dlStatus)));
          rDl.textContent = fmtSpeed(d.dlStatus);
          activeCard("dl");
          break;
        case 2: // Ping + Jitter
          gaugeEl.className = "gauge is-ping";
          phaseEl.textContent = "Ping";
          unitEl.textContent = "ms";
          valueEl.textContent = fmtMs(d.pingStatus);
          setArc(parseFloat(d.pingProgress) || 0);
          rPing.textContent = fmtMs(d.pingStatus);
          rJit.textContent = fmtMs(d.jitterStatus);
          activeCard("ping");
          break;
        case 3: // Upload
          gaugeEl.className = "gauge is-ul";
          phaseEl.textContent = "Upload";
          unitEl.textContent = "Mbit/s";
          valueEl.textContent = fmtSpeed(d.ulStatus);
          setArc(speedFrac(parseFloat(d.ulStatus)));
          rUl.textContent = fmtSpeed(d.ulStatus);
          activeCard("ul");
          break;
      }
      if (d.dlStatus && d.dlStatus !== "0") rDl.textContent = fmtSpeed(d.dlStatus);
      if (d.ulStatus && d.ulStatus !== "0") rUl.textContent = fmtSpeed(d.ulStatus);
      if (d.pingStatus && d.pingStatus !== "0") rPing.textContent = fmtMs(d.pingStatus);
      if (d.jitterStatus && d.jitterStatus !== "0") rJit.textContent = fmtMs(d.jitterStatus);
    }

    function onEnd(aborted) {
      running = false;
      startBtn.textContent = "Test erneut starten";
      startBtn.classList.remove("is-running");
      startBtn.disabled = false;
      activeCard(null);
      phaseEl.textContent = aborted ? "Abgebrochen" : "Fertig";
      if (!aborted) {
        gaugeEl.className = "gauge is-dl";
        valueEl.textContent = rDl.textContent;
        unitEl.textContent = "Mbit/s";
        setArc(speedFrac(parseFloat(rDl.textContent) || 0));
      }
    }

    function startTest() {
      running = true;
      startBtn.textContent = "Abbrechen";
      startBtn.classList.add("is-running");
      rDl.textContent = rUl.textContent = rPing.textContent = rJit.textContent = "–";
      setArc(0);
      phaseEl.textContent = "Start …";
      valueEl.textContent = "0";

      test = new Speedtest();
      test.setParameter("test_order", "I_P_D_U");
      test.setParameter("url_dl", "backend/garbage.php");
      test.setParameter("url_ul", "backend/empty.php");
      test.setParameter("url_ping", "backend/empty.php");
      test.setParameter("url_getIp", "backend/getIP.php");
      test.setParameter("xhr_dlMultistream", 6);
      test.setParameter("xhr_ulMultistream", 3);
      test.setParameter("garbagePhp_chunkSize", 20);
      test.setParameter("xhr_ul_blob_megabytes", 20);
      test.setParameter("time_dl_max", 15);
      test.setParameter("time_ul_max", 15);
      test.setParameter("count_ping", 12);
      test.onupdate = onUpdate;
      test.onend = onEnd;
      test.start();
    }

    startBtn.addEventListener("click", function () {
      if (running && test) {
        test.abort();
        return;
      }
      startTest();
    });

    resetUI();
  }
})();
