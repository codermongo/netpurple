(() => {
  const canvas = document.getElementById("bg-particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let width = 0;
  let height = 0;
  let particles = [];
  let lastTs = 0;

  const COLORS = ["#8B5CF6", "#3B82F6", "#8B5CF6"];

  function rand(min, max) {
    return Math.random() * (max - min) + min;
  }

  function pick(arr) {
    return arr[(Math.random() * arr.length) | 0];
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const targetCount = Math.min(260, Math.floor((width * height) / 9500));
    if (particles.length < targetCount) {
      for (let i = particles.length; i < targetCount; i += 1) {
        particles.push(makeParticle(true));
      }
    } else if (particles.length > targetCount) {
      particles.length = targetCount;
    }
  }

  function makeParticle(randomY = false) {
    const size = rand(0.6, 1.8);
    const speed = rand(12, 38);
    const drift = rand(-8, 8);
    const phase = rand(0, Math.PI * 2);
    const twinkle = rand(1.0, 2.2);
    return {
      x: rand(0, width),
      y: randomY ? rand(0, height) : rand(-height * 0.1, -10),
      r: size,
      vy: speed,
      vx: drift,
      c: pick(COLORS),
      phase,
      twinkle
    };
  }

  function step(ts) {
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;

    ctx.clearRect(0, 0, width, height);

    for (const particle of particles) {
      particle.y += particle.vy * dt;
      particle.x += particle.vx * dt;

      if (particle.y - particle.r > height) {
        const next = makeParticle(false);
        particle.x = next.x;
        particle.y = next.y;
        particle.vy = next.vy;
        particle.vx = next.vx;
        particle.r = next.r;
        particle.c = next.c;
        particle.phase = next.phase;
        particle.twinkle = next.twinkle;
      }

      if (particle.x < -10) particle.x = width + 10;
      if (particle.x > width + 10) particle.x = -10;

      const alpha = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(particle.phase + (ts / 1000) * particle.twinkle));

      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.c;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = alpha * 0.25;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    requestAnimationFrame(step);
  }

  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(step);
})();
