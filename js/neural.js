/* ==========================================================================
   Background: a drifting neural mesh. Nodes link when close, signal pulses
   hop along the links, the cursor acts as an extra (orange) node, and
   scrolling shears the field for a sense of depth. Plain 2D canvas.
   ========================================================================== */
(() => {
  const canvas = document.getElementById('neural');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = { intensity: 1 };
  window.Neural = state;

  const LINK = 150, LINK2 = LINK * LINK, MOUSE_LINK = 190;
  const CYAN = '61,220,255', ORANGE = '255,106,26';
  let W = 0, H = 0, nodes = [], pulses = [];
  const mouse = { x: -9999, y: -9999 };

  const make = () => ({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.28, vy: (Math.random() - 0.5) * 0.28,
    s: 1.5 + Math.random() * 1.8, hot: Math.random() < 0.14,
  });
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(105, Math.max(34, (W * H) / 15000)));
    while (nodes.length < n) nodes.push(make());
    nodes.length = n;
  }
  resize();
  addEventListener('resize', resize);
  addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });

  function neighbours(i) {
    const a = nodes[i], out = [];
    for (let j = 0; j < nodes.length; j++) {
      if (j === i) continue;
      const dx = nodes[j].x - a.x, dy = nodes[j].y - a.y;
      if (dx * dx + dy * dy < LINK2) out.push(j);
    }
    return out;
  }
  function spawnPulse() {
    const a = (Math.random() * nodes.length) | 0;
    const nb = neighbours(a);
    if (!nb.length) return;
    pulses.push({ a, b: nb[(Math.random() * nb.length) | 0], t: 0, speed: 0.014 + Math.random() * 0.02, hops: 2 + ((Math.random() * 4) | 0), hot: Math.random() < 0.5 });
  }

  let lastY = scrollY, spawnClock = 0;
  const buckets = [[], [], [], []];

  function frame() {
    ctx.clearRect(0, 0, W, H);
    const k = state.intensity;

    // scroll shear: the field drifts against the scroll direction
    const dyScroll = scrollY - lastY;
    lastY = scrollY;
    const shift = Math.max(-40, Math.min(40, dyScroll)) * 0.25;

    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy - shift;
      const mdx = n.x - mouse.x, mdy = n.y - mouse.y, md2 = mdx * mdx + mdy * mdy;
      if (md2 < 120 * 120 && md2 > 1) { const f = (1 - Math.sqrt(md2) / 120) * 0.6; n.x += (mdx / Math.sqrt(md2)) * f; n.y += (mdy / Math.sqrt(md2)) * f; }
      if (n.x < -20) n.x = W + 20; else if (n.x > W + 20) n.x = -20;
      if (n.y < -20) n.y = H + 20; else if (n.y > H + 20) n.y = -20;
    }

    // links, batched into 4 alpha buckets
    buckets.forEach((b) => (b.length = 0));
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 < LINK2) {
          const q = 1 - Math.sqrt(d2) / LINK;
          buckets[Math.min(3, (q * 4) | 0)].push(a.x, a.y, b.x, b.y);
        }
      }
    }
    ctx.lineWidth = 1;
    buckets.forEach((b, bi) => {
      if (!b.length) return;
      ctx.strokeStyle = `rgba(${CYAN},${(0.05 + bi * 0.06) * k})`;
      ctx.beginPath();
      for (let p = 0; p < b.length; p += 4) { ctx.moveTo(b[p], b[p + 1]); ctx.lineTo(b[p + 2], b[p + 3]); }
      ctx.stroke();
    });

    // cursor links
    if (mouse.x > -999) {
      ctx.beginPath();
      for (const n of nodes) {
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        if (dx * dx + dy * dy < MOUSE_LINK * MOUSE_LINK) { ctx.moveTo(mouse.x, mouse.y); ctx.lineTo(n.x, n.y); }
      }
      ctx.strokeStyle = `rgba(${ORANGE},${0.22 * k})`;
      ctx.stroke();
    }

    // nodes (square, robotic)
    for (const n of nodes) {
      ctx.fillStyle = n.hot ? `rgba(${ORANGE},${0.85 * k})` : `rgba(${CYAN},${0.6 * k})`;
      ctx.fillRect(n.x - n.s / 2, n.y - n.s / 2, n.s, n.s);
      if (n.hot) { ctx.strokeStyle = `rgba(${ORANGE},${0.25 * k})`; ctx.strokeRect(n.x - 4, n.y - 4, 8, 8); }
    }

    // signal pulses hopping along links
    if (!reduce && ++spawnClock % 14 === 0 && pulses.length < 16) spawnPulse();
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      const a = nodes[p.a], b = nodes[p.b];
      if (!a || !b) { pulses.splice(i, 1); continue; }
      p.t += p.speed;
      const x = a.x + (b.x - a.x) * p.t, y = a.y + (b.y - a.y) * p.t;
      const tx = a.x + (b.x - a.x) * Math.max(0, p.t - 0.25), ty = a.y + (b.y - a.y) * Math.max(0, p.t - 0.25);
      const col = p.hot ? ORANGE : CYAN;
      const g = ctx.createLinearGradient(tx, ty, x, y);
      g.addColorStop(0, `rgba(${col},0)`); g.addColorStop(1, `rgba(${col},${0.9 * k})`);
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = `rgba(${col},${k})`;
      ctx.fillRect(x - 2, y - 2, 4, 4);
      if (p.t >= 1) {
        const dx = a.x - b.x, dy = a.y - b.y;
        p.hops--;
        const nb = neighbours(p.b).filter((j) => j !== p.a);
        if (p.hops <= 0 || !nb.length || dx * dx + dy * dy > LINK2 * 1.4) { pulses.splice(i, 1); continue; }
        p.a = p.b; p.b = nb[(Math.random() * nb.length) | 0]; p.t = 0;
      }
    }
    ctx.lineWidth = 1;
    if (!reduce) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
