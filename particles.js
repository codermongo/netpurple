// particles.js
(() => {
  const canvas = document.getElementById('bg-particles');
  if (!canvas) return;

  // Contexts where we never run the animation, independent of the manual
  // Performance toggle (config.js owns body.low-power-mode).
  function heavyContextBlocked() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || window.matchMedia('(prefers-reduced-data: reduce)').matches
      || Boolean(navigator.connection && navigator.connection.saveData);
  }
  function particlesEnabled() {
    return !document.body.classList.contains('low-power-mode') && !heavyContextBlocked();
  }

  const ctx = canvas.getContext('2d', { alpha: true });
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, particles = [];
  let lastTs = 0;
  let rafId = 0;
  let running = false;

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

    // Density: approx. 1 dot per 9.5k px², capped
    const targetCount = Math.min(260, Math.floor((w * h) / 9500));
    if (particles.length < targetCount) {
      for (let i = particles.length; i < targetCount; i++) particles.push(makeParticle(true));
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
  }

  function makeParticle(randomY = false) {
    const size = rand(0.6, 1.8);            // slightly varying sizes
    const speed = rand(12, 38);             // px per second (vertical)
    const drift = rand(-8, 8);              // horizontal drift
    const phase = rand(0, Math.PI * 2);     // starting phase for twinkling
    const twinkle = rand(1.0, 2.2);         // twinkle speed
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
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0; // sec.
    lastTs = ts;

    ctx.clearRect(0, 0, w, h);

    for (let p of particles) {
      // Update position
      p.y += p.vy * dt;
      p.x += p.vx * dt;

      // Edge handling
      if (p.y - p.r > h) {
        // Respawn at the top for a steady stream
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

      // Twinkling
      const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase + ts / 1000 * p.twinkle));

      // Draw (soft dots)
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();

      // Subtle glow
      ctx.globalAlpha = a * 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;
    canvas.style.display = '';
    lastTs = 0;
    resize();
    rafId = requestAnimationFrame(step);
  }

  function stop() {
    if (!running && canvas.style.display === 'none') return;
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    particles.length = 0;
    ctx && ctx.clearRect(0, 0, w, h);
    canvas.style.display = 'none';
  }

  function refresh() {
    if (particlesEnabled()) start();
    else stop();
  }

  window.addEventListener('resize', () => { if (running) resize(); });
  // React live to the Performance toggle (config.js).
  document.addEventListener('np:configchange', refresh);

  refresh();
})();
