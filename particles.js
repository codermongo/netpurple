// particles.js
(() => {
  const canvas = document.getElementById('bg-particles');
  if (!canvas) return;

  function isLowPowerMode() {
    const narrowViewport = window.matchMedia('(max-width: 768px)').matches;
    const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const reducedData = window.matchMedia('(prefers-reduced-data: reduce)').matches;
    const saveData = Boolean(navigator.connection && navigator.connection.saveData);
    return reducedMotion || reducedData || saveData || (narrowViewport && coarsePointer);
  }

  if (isLowPowerMode()) {
    document.body.classList.add('low-power-mode');
    canvas.style.display = 'none';
    return;
  }

  const ctx = canvas.getContext('2d', { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, particles = [];
  let lastTs = 0;

  const ORANGE = ['#8B5CF6', '#3B82F6', '#8B5CF6'];

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(w * DPR));
    canvas.height = Math.max(1, Math.floor(h * DPR));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    // Dichte: ca. 1 Punkt pro 9.5k px², gedeckelt
    const targetCount = Math.min(260, Math.floor((w * h) / 9500));
    if (particles.length < targetCount) {
      for (let i = particles.length; i < targetCount; i++) particles.push(makeParticle(true));
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
  }

  function makeParticle(randomY = false) {
    const size = rand(0.6, 1.8);            // leicht unterschiedliche Größen
    const speed = rand(12, 38);             // px pro Sekunde (vertikal)
    const drift = rand(-8, 8);              // horizontale Drift
    const phase = rand(0, Math.PI * 2);     // Startphase fürs Flimmern
    const twinkle = rand(1.0, 2.2);         // Flimmergeschwindigkeit
    return {
      x: rand(0, w),
      y: randomY ? rand(0, h) : rand(-h * 0.1, -10),
      r: size,
      vy: speed,
      vx: drift,
      c: pick(ORANGE),
      phase,
      twinkle
    };
  }

  function step(ts) {
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0; // Sek.
    lastTs = ts;

    ctx.clearRect(0, 0, w, h);

    for (let p of particles) {
      // Position updaten
      p.y += p.vy * dt;
      p.x += p.vx * dt;

      // Kantenbehandlung
      if (p.y - p.r > h) {
        // oben neu spawnen für gleichmäßigen Strom
        const np = makeParticle(false);
        p.x = np.x;
        p.y = np.y;
        p.vy = np.vy;
        p.vx = np.vx;
        p.r = np.r;
        p.c = np.c;
        p.phase = np.phase;
        p.twinkle = np.twinkle;
      }
      if (p.x < -10) p.x = w + 10;
      if (p.x > w + 10) p.x = -10;

      // Flimmern
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase + ts / 1000 * p.twinkle));

      // Zeichnen (weiche Punkte)
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      // leichter Glow
      ctx.globalAlpha = a * 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(step);
  }

  // Init
  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(step);
})();
