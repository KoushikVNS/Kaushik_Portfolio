/* ==========================================================================
   Kaushik Chakraborty · KC-OS interactions
   GSAP + ScrollTrigger (motion) and Lenis (smooth scroll) are optional:
   if a CDN fails, the page still renders and every section stays readable.
   ========================================================================== */
(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const html = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T0 = performance.now();

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.scrollTo(0, 0);
  if (hasGSAP) gsap.registerPlugin(ScrollTrigger);
  else html.classList.add('no-gsap');

  /* ------------------------------------------------------------ decode / scramble */
  const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*+=<>/\\[]{}';
  const rand = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

  // Decrypts every text node inside `el` from noise into its final text.
  // The final text of each node is remembered the first time it is seen.
  const ORIGINAL = new WeakMap();
  function decode(el, { speed = 1 } = {}) {
    if (reduce) return Promise.resolve();
    const nodes = [];
    const walk = (n) => n.childNodes.forEach((c) => {
      if (c.nodeType !== 3) return walk(c);
      if (!ORIGINAL.has(c)) ORIGINAL.set(c, c.nodeValue);
      nodes.push({ n: c, text: ORIGINAL.get(c) });
    });
    walk(el);
    cancelAnimationFrame(el._raf);
    const jobs = nodes.map(({ n, text }) => ({
      n, text,
      q: [...text].map((ch) => ({ ch, at: /\s/.test(ch) ? 0 : Math.floor((4 + Math.random() * 22) / speed) })),
    }));
    let frame = 0;
    return new Promise((res) => {
      const tick = () => {
        let done = true;
        for (const j of jobs) {
          j.n.nodeValue = j.q.map((c) => (frame >= c.at ? c.ch : (done = false, rand()))).join('');
        }
        frame++;
        if (done) res(); else el._raf = requestAnimationFrame(tick);
      };
      tick();
    });
  }
  function scrambleOnce(el) {
    if (reduce || el._busy) return;
    el._busy = true;
    decode(el, { speed: 2 }).then(() => { el._busy = false; });
  }

  /* ------------------------------------------------------------ smooth scroll */
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    if (hasGSAP) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    lenis.stop();
  }
  const scrollToTarget = (target) => {
    if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
    else if (typeof target === 'number') window.scrollTo({ top: target, behavior: reduce ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  };

  /* ------------------------------------------------------------ toast */
  const toastEl = $('.toast');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('is-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-show'), 2600);
  }

  /* ------------------------------------------------------------ nav, menu, links */
  const nav = $('.nav');
  const menu = $('.menu');
  const burger = $('.nav__burger');
  function setMenu(open) {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    nav.classList.remove('is-hidden');
    if (lenis) open ? lenis.stop() : lenis.start();
  }
  burger.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false); });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.classList.contains('skip')) return;
    e.preventDefault();
    const id = a.getAttribute('href');
    if (id === '#') {
      toast(a.closest('.mission') ? 'Mission file classified. Declassifying soon.' : 'Link coming soon.');
      return;
    }
    if (menu.classList.contains('is-open')) setMenu(false);
    const target = id === '#top' ? 0 : $(id);
    if (target !== null) scrollToTarget(target);
  });
  $('.footer__top').addEventListener('click', () => scrollToTarget(0));
  $$('[data-copy]').forEach((a) => a.addEventListener('click', (e) => {
    if (!navigator.clipboard) return;
    e.preventDefault();
    navigator.clipboard.writeText(a.dataset.copy).then(() => toast('Email copied. Uplink established.')).catch(() => { location.href = a.href; });
  }));
  $$('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  /* ------------------------------------------------------------ cursor + target lock */
  const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
  const cursor = $('.cursor');
  const lock = $('.lock');
  const lockLabel = $('.lock__label');
  let lockEl = null;
  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  if (fine && !reduce) {
    html.classList.add('has-cursor');
    const coords = $('.cursor__coords');
    cursor.classList.add('is-hidden');
    addEventListener('pointermove', () => {
      cursor.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      coords.textContent = `${pad(pointer.x, 4)} · ${pad(pointer.y, 4)}`;
      cursor.classList.remove('is-hidden');
    }, { passive: true });
    document.addEventListener('mouseleave', () => cursor.classList.add('is-hidden'));
    addEventListener('pointerdown', () => cursor.classList.add('is-down'));
    addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    const labelFor = (t) => t.dataset.lock || (t.matches('.nn-node') ? t.dataset.label : t.tagName === 'A' ? 'Link' : t.tagName === 'INPUT' ? 'Input' : 'Execute');
    document.addEventListener('pointerover', (e) => {
      const target = e.target.closest('a, button, input, .nn-node, [data-lock]');
      if (target === lockEl) return;
      lockEl = target;
      if (lockEl) {
        lockLabel.textContent = `Target: ${labelFor(lockEl)}`;
        lock.classList.add('is-on');
        cursor.classList.add('is-locked');
      } else {
        lock.classList.remove('is-on');
        cursor.classList.remove('is-locked');
      }
    });
    (function lockLoop() {
      if (lockEl) {
        const b = lockEl.getBoundingClientRect();
        const p = 6;
        lock.style.left = `${b.left - p}px`;
        lock.style.top = `${b.top - p}px`;
        lock.style.width = `${b.width + p * 2}px`;
        lock.style.height = `${b.height + p * 2}px`;
      } else {
        lock.style.left = `${pointer.x - 10}px`;
        lock.style.top = `${pointer.y - 10}px`;
        lock.style.width = lock.style.height = '20px';
      }
      requestAnimationFrame(lockLoop);
    })();
  }

  /* ------------------------------------------------------------ magnetic + hover scramble */
  if (fine && !reduce && hasGSAP) {
    $$('[data-magnetic]').forEach((el) => {
      const inner = $('.btn__label', el);
      el.addEventListener('pointermove', (e) => {
        const b = el.getBoundingClientRect();
        const x = e.clientX - (b.left + b.width / 2), y = e.clientY - (b.top + b.height / 2);
        gsap.to(el, { x: x * 0.25, y: y * 0.3, duration: 0.5, ease: 'power3.out' });
        if (inner) gsap.to(inner, { x: x * 0.1, duration: 0.5, ease: 'power3.out' });
      });
      el.addEventListener('pointerleave', () => gsap.to(inner ? [el, inner] : el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, .35)' }));
    });
  }
  $$('[data-scramble], .btn__label, .pod__modes button, .term__chips button').forEach((el) => {
    el.addEventListener('pointerenter', () => scrambleOnce(el));
  });

  /* ------------------------------------------------------------ HUD telemetry */
  const hud = {
    x: $('[data-hud="x"]'), y: $('[data-hud="y"]'), fps: $('[data-hud="fps"]'), up: $('[data-hud="uptime"]'),
    sec: $('.hud__sec'), name: $('.hud__secname'), alt: $('.hud__alt i'), altNum: $('.hud__alt-num'),
  };
  const progressBar = $('.progress span');
  let fps = 60, frames = 0, fpsT = performance.now();
  (function hudLoop(now) {
    frames++;
    if (now - fpsT > 500) { fps = lerp(fps, (frames * 1000) / (now - fpsT), 0.6); frames = 0; fpsT = now; hud.fps.textContent = Math.round(fps); }
    hud.x.textContent = pad(pointer.x, 4);
    hud.y.textContent = pad(pointer.y, 4);
    const s = (now - T0) / 1000;
    hud.up.textContent = `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;
    requestAnimationFrame(hudLoop);
  })(performance.now());

  let velocity = 0, lastY = 0, scrollDir = 1;
  function onScroll(y, v) {
    const max = document.documentElement.scrollHeight - innerHeight;
    const p = max > 0 ? clamp(y / max, 0, 1) : 0;
    progressBar.style.transform = `scaleX(${p})`;
    hud.alt.style.height = `${p * 100}%`;
    hud.altNum.textContent = pad(p * 100, 3);
    nav.classList.toggle('is-scrolled', y > 40);
    const dy = y - lastY;
    if (Math.abs(dy) > 4) {
      scrollDir = dy > 0 ? 1 : -1;
      nav.classList.toggle('is-hidden', scrollDir > 0 && y > 500 && !menu.classList.contains('is-open'));
    }
    lastY = y;
    velocity = v;
  }
  if (lenis) lenis.on('scroll', (l) => onScroll(l.scroll, l.velocity));
  else {
    let prev = scrollY;
    addEventListener('scroll', () => { const y = scrollY; onScroll(y, y - prev); prev = y; }, { passive: true });
  }

  /* ------------------------------------------------------------ hero: role typer + glitch bursts */
  const typer = $('.typer');
  if (typer) {
    const lines = JSON.parse(typer.dataset.lines);
    let li = 0;
    const run = async () => {
      await sleep(3500);
      while (!reduce) {
        const text = typer.textContent;
        for (let i = text.length; i >= 0; i--) { typer.textContent = text.slice(0, i); await sleep(22); }
        li = (li + 1) % lines.length;
        const next = lines[li];
        for (let i = 1; i <= next.length; i++) { typer.textContent = next.slice(0, i); await sleep(45 + Math.random() * 40); }
        await sleep(2400);
      }
    };
    run();
  }
  const glitchEl = $('.glitch');
  function burst() {
    if (reduce) return;
    glitchEl.classList.remove('is-burst');
    void glitchEl.offsetWidth;
    glitchEl.classList.add('is-burst');
  }
  glitchEl.addEventListener('pointerenter', burst);

  /* ------------------------------------------------------------ hero: vision pod */
  const pod = $('.pod');
  const modes = ['optical', 'thermal', 'night', 'lidar'];
  const feed = $('.pod__feed');
  const readMode = $('[data-read="mode"]');
  let mode = 'optical', autoMode = true, modeTimer;
  let meshTimer;
  function flashMesh(ms) {
    pod.classList.add('is-meshing');
    clearTimeout(meshTimer);
    meshTimer = setTimeout(() => pod.classList.remove('is-meshing'), ms);
  }
  function setMode(next, user) {
    if (next === mode) return;
    if (user) { autoMode = false; flashMesh(1300); }
    const cur = $(`.layer--${mode}`, pod);
    const nl = $(`.layer--${next}`, pod);
    if (nl.dataset.src) { nl.src = nl.dataset.src; delete nl.dataset.src; }
    cur.classList.remove('is-on');
    cur.classList.add('is-leaving');
    nl.classList.add('is-on');
    pod.classList.remove('is-scanning');
    void pod.offsetWidth;
    pod.classList.add('is-scanning');
    pod.dataset.mode = next;
    mode = next;
    feed.innerHTML = `${next.toUpperCase()} FEED <i>//</i> CAM-01`;
    readMode.textContent = next.toUpperCase();
    $$('.pod__modes button', pod).forEach((b) => {
      const on = b.dataset.mode === next;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    setTimeout(() => { cur.classList.remove('is-leaving'); pod.classList.remove('is-scanning'); }, 950);
  }
  $$('.pod__modes button', pod).forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode, true)));
  function startAutoModes() {
    clearInterval(modeTimer);
    modeTimer = setInterval(() => {
      if (!autoMode || !heroVisible) return;
      setMode(modes[(modes.indexOf(mode) + 1) % modes.length]);
    }, 3800);
  }
  const preloadModes = () => $$('.layer[data-src]', pod).forEach((img) => { const i = new Image(); i.src = img.dataset.src; });

  // timecode + live readouts
  const tc = $('[data-timecode]');
  const readLoad = $('[data-read="load"]'), readSig = $('[data-read="sig"]');
  let load = 87, sig = -42;
  setInterval(() => {
    const s = (performance.now() - T0) / 1000;
    tc.textContent = `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}:${pad((s * 24) % 24)}`;
  }, 1000 / 24);
  setInterval(() => {
    load = clamp(load + (Math.random() - 0.5) * 6, 72, 99);
    sig = clamp(sig + (Math.random() - 0.5) * 3, -50, -36);
    readLoad.textContent = `${Math.round(load)}%`;
    readSig.textContent = `${Math.round(sig)}dB`;
  }, 700);

  // pod tilt
  let heroVisible = true;
  new IntersectionObserver(([e]) => { heroVisible = e.isIntersecting; }).observe($('.hero'));
  if (fine && !reduce) {
    const t = { x: 0, y: 0 };
    (function tiltLoop() {
      if (heroVisible) {
        t.x = lerp(t.x, (pointer.y / innerHeight - 0.5) * -8, 0.06);
        t.y = lerp(t.y, (pointer.x / innerWidth - 0.5) * 10, 0.06);
        pod.style.transform = `perspective(1200px) rotateX(${t.x.toFixed(2)}deg) rotateY(${t.y.toFixed(2)}deg)`;
      }
      requestAnimationFrame(tiltLoop);
    })();
  }

  // face mesh from Vision landmarks (js/face-data.js)
  const mesh = $('.facemesh');
  const FACE = window.FACE;
  if (FACE && mesh) {
    const [IW, IH] = FACE.size;
    const P = ([x, y]) => [x * IW, y * IH];
    const R = FACE.regions;
    const closed = new Set(['leftEye', 'rightEye', 'outerLips', 'innerLips']);
    const centre = (pts) => pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length], [0, 0]);
    let svg = '<g class="fm-mesh">';
    Object.entries(R).forEach(([name, pts]) => {
      if (pts.length < 2) return;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'}${P(p).map((v) => v.toFixed(1)).join(' ')}`).join(' ') + (closed.has(name) ? ' Z' : '');
      svg += `<path class="fm-line" d="${d}"/>`;
    });
    // tracking triangle: eyes, nose tip, mouth
    if (R.leftEye && R.rightEye && R.nose && R.outerLips) {
      const le = P(centre(R.leftEye)), re = P(centre(R.rightEye)), mo = P(centre(R.outerLips));
      const nt = P(R.nose[Math.floor(R.nose.length / 2)]);
      svg += `<path class="fm-line" style="opacity:.4" d="M${le} L${re} L${nt} Z M${nt} L${mo} M${le} L${mo} M${re} L${mo}"/>`;
    }
    Object.values(R).flat().forEach((p) => {
      const [x, y] = P(p);
      svg += `<circle class="fm-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6"/>`;
    });
    svg += '</g>';
    const [bx, by, bw, bh] = FACE.box;
    const x0 = bx * IW - 26, y0 = by * IH - 40, x1 = (bx + bw) * IW + 26, y1 = (by + bh) * IH + 26, c = 34;
    svg += `<g class="fm-boxg"><path class="fm-box" d="M${x0} ${y0 + c}V${y0}H${x0 + c} M${x1 - c} ${y0}H${x1}V${y0 + c} M${x0} ${y1 - c}V${y1}H${x0 + c} M${x1 - c} ${y1}H${x1}V${y1 - c}"/></g>`;
    svg += `<g class="fm-tag"><rect class="fm-label-bg" x="${x0}" y="${y1 + 10}" width="214" height="30"/><text class="fm-label" x="${x0 + 9}" y="${y1 + 32}">FACE LOCK ✓</text></g>`;
    mesh.innerHTML = svg;
  }

  /* ------------------------------------------------------------ hazard tapes */
  const tapes = $$('.tape').map((tape) => ({ tape, track: $('.tape__track', tape), dir: +tape.dataset.dir, x: 0, w: 0 }));
  function buildTapes() {
    tapes.forEach((t) => {
      $$('.tape__track', t.tape).slice(1).forEach((n) => n.remove());
      t.w = t.track.offsetWidth;
      const copies = Math.ceil((innerWidth * 1.3) / Math.max(1, t.w)) + 1;
      for (let i = 0; i < copies; i++) t.tape.appendChild(t.track.cloneNode(true));
      t.tracks = $$('.tape__track', t.tape);
    });
  }
  buildTapes();
  document.fonts && document.fonts.ready.then(buildTapes);
  let tapesVisible = false;
  new IntersectionObserver(([e]) => { tapesVisible = e.isIntersecting; }).observe($('.tapes'));
  let tLast = performance.now();
  (function tapeLoop(now) {
    const dt = Math.min((now - tLast) / 1000, 0.05);
    tLast = now;
    if (!lenis) velocity *= 0.9;
    if (tapesVisible && !reduce) {
      const speed = 60 * (1 + Math.min(Math.abs(velocity) * 0.4, 9)) * scrollDir;
      tapes.forEach((t) => {
        t.x -= speed * t.dir * dt;
        if (t.x <= -t.w) t.x += t.w;
        if (t.x > 0) t.x -= t.w;
        t.tracks.forEach((tr) => { tr.style.transform = `translate3d(${t.x}px,0,0)`; });
      });
    }
    requestAnimationFrame(tapeLoop);
  })(tLast);

  /* ------------------------------------------------------------ tilt + spotlight */
  function addTilt(el, max) {
    let rx = 0, ry = 0, trx = 0, try_ = 0, raf = 0;
    const step = () => {
      rx = lerp(rx, trx, 0.14); ry = lerp(ry, try_, 0.14);
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      raf = Math.abs(rx - trx) + Math.abs(ry - try_) > 0.02 ? requestAnimationFrame(step) : 0;
    };
    el.addEventListener('pointermove', (e) => {
      const b = el.getBoundingClientRect();
      const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
      el.style.setProperty('--mx', `${px * 100}%`);
      el.style.setProperty('--my', `${py * 100}%`);
      if (!fine || reduce) return;
      trx = (0.5 - py) * max; try_ = (px - 0.5) * max;
      if (!raf) raf = requestAnimationFrame(step);
    });
    el.addEventListener('pointerleave', () => { trx = 0; try_ = 0; if (!raf) raf = requestAnimationFrame(step); });
  }
  $$('.module').forEach((el) => addTilt(el, 10));
  $$('.mission__link').forEach((el) => addTilt(el, 6));

  // mission titles re-encrypt on hover
  $$('.mission__link').forEach((a) => a.addEventListener('pointerenter', () => scrambleOnce($('.mission__title', a))));

  /* ------------------------------------------------------------ radar blips sync with the sweep */
  $$('.radar__blip').forEach((b) => {
    const x = parseFloat(b.style.getPropertyValue('--x')) - 50;
    const y = parseFloat(b.style.getPropertyValue('--y')) - 50;
    const deg = (Math.atan2(x, -y) * 180) / Math.PI;
    b.style.setProperty('--d', `${(((deg + 360) % 360) / 360) * 4}s`);
  });

  /* ------------------------------------------------------------ neural network diagram */
  const NN = {
    nodes: [
      { id: 'cur', l: 0, label: 'Curiosity', short: 'Curiosity', d: 'The input that starts everything: asking how things work, and why.' },
      { id: 'cre', l: 0, label: 'Creativity', short: 'Creativity', d: 'Finding new angles on familiar problems.' },
      { id: 'dat', l: 0, label: 'Data', short: 'Data', d: 'Raw signal from the real world, waiting to be understood.' },
      { id: 'py', l: 1, label: 'Python', short: 'Python', d: 'The workhorse for experiments, analysis and models.' },
      { id: 'sql', l: 1, label: 'SQL', short: 'SQL', d: 'Getting the right data, in the right shape.' },
      { id: 'ml', l: 1, label: 'Machine learning', short: 'ML', d: 'Learning patterns from data to make predictions.' },
      { id: 'an', l: 1, label: 'Analytics', short: 'Analytics', d: 'Turning numbers into decisions people can act on.' },
      { id: 'out', l: 2, label: 'Meaningful tech', short: 'Impact', d: 'The output: practical, impactful solutions to real-world problems.' },
    ],
    pos: {
      d: { cur: [150, 130], cre: [150, 260], dat: [150, 390], py: [500, 80], sql: [500, 205], ml: [500, 330], an: [500, 455], out: [850, 268] },
      m: { cur: [70, 90], cre: [200, 90], dat: [330, 90], py: [50, 380], sql: [150, 380], ml: [250, 380], an: [350, 380], out: [200, 650] },
    },
  };
  NN.edges = [];
  NN.nodes.filter((n) => n.l === 0).forEach((a) => NN.nodes.filter((n) => n.l === 1).forEach((b) => NN.edges.push([a.id, b.id])));
  NN.nodes.filter((n) => n.l === 1).forEach((a) => NN.edges.push([a.id, 'out']));
  const nnSvg = $('.nn__svg');
  const nnInfo = { t: $('.nn__t'), d: $('.nn__d'), k: $('.nn__k') };
  let nnMode = '';
  function renderNN() {
    const m = innerWidth <= 640 ? 'm' : 'd';
    if (m === nnMode) return;
    nnMode = m;
    const pos = NN.pos[m];
    nnSvg.setAttribute('viewBox', m === 'm' ? '0 0 400 740' : '0 0 1000 520');
    const edges = NN.edges.map(([a, b]) => `<line class="nn-edge" data-a="${a}" data-b="${b}" x1="${pos[a][0]}" y1="${pos[a][1]}" x2="${pos[b][0]}" y2="${pos[b][1]}"/>`).join('');
    const nodes = NN.nodes.map((n) => {
      const [x, y] = pos[n.id];
      const label = m === 'm' ? n.short : n.label;
      const r = n.l === 2 ? 30 : 20;
      const ly = m === 'm' ? (n.l === 0 ? -36 : n.l === 1 ? 46 : 64) : (n.l === 1 ? -34 : n.l === 2 ? 66 : 6);
      const lx = m === 'd' && n.l === 0 ? -36 : 0;
      const anchor = m === 'd' && n.l === 0 ? 'end' : 'middle';
      const w = label.length * 11 + 18;
      const rx = anchor === 'end' ? lx - w + 9 : lx - w / 2;
      return `<g class="nn-node${n.l === 2 ? ' out' : ''}" data-id="${n.id}" data-label="${label}" transform="translate(${x} ${y})" tabindex="0" role="button" aria-label="${n.label}">
        <circle class="glow" r="${r + 18}"/><circle class="body" r="${r}"/>
        <rect x="${rx}" y="${ly - 17}" width="${w}" height="24" fill="rgba(7,9,12,.85)"/>
        <text x="${lx}" y="${ly}" text-anchor="${anchor}">${label}</text></g>`;
    }).join('');
    nnSvg.innerHTML = `${edges}<g class="nn-pulses"></g>${nodes}`;
    $$('.nn-node', nnSvg).forEach((g) => {
      const go = () => inspect(g.dataset.id);
      g.addEventListener('pointerenter', go);
      g.addEventListener('focus', go);
      g.addEventListener('click', go);
    });
  }
  function inspect(id) {
    const n = NN.nodes.find((x) => x.id === id);
    nnInfo.k.textContent = ['Input neuron', 'Hidden neuron', 'Output neuron'][n.l];
    nnInfo.t.textContent = n.label;
    nnInfo.d.textContent = n.d;
    $$('.nn-edge', nnSvg).forEach((e) => e.classList.toggle('is-hot', e.dataset.a === id || e.dataset.b === id));
  }
  renderNN();
  addEventListener('resize', renderNN);
  let passRunning = false;
  async function forwardPass() {
    if (passRunning || !hasGSAP || reduce) return;
    passRunning = true;
    const pos = NN.pos[nnMode];
    const layer = $('.nn-pulses', nnSvg);
    const fire = (ids) => ids.forEach((id) => $(`.nn-node[data-id="${id}"]`, nnSvg).classList.add('is-fire'));
    const pulse = (edges, dur) => Promise.all(edges.map(([a, b], i) => new Promise((res) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'nn-pulse'); c.setAttribute('r', '6');
      c.setAttribute('cx', pos[a][0]); c.setAttribute('cy', pos[a][1]);
      layer.appendChild(c);
      $(`.nn-edge[data-a="${a}"][data-b="${b}"]`, nnSvg).classList.add('is-hot');
      gsap.to(c, { attr: { cx: pos[b][0], cy: pos[b][1] }, duration: dur, delay: i * 0.04, ease: 'power2.inOut', onComplete: () => { c.remove(); res(); } });
    })));
    $$('.nn-node', nnSvg).forEach((n) => n.classList.remove('is-fire'));
    $$('.nn-edge', nnSvg).forEach((e) => e.classList.remove('is-hot'));
    fire(['cur', 'cre', 'dat']);
    await sleep(300);
    await pulse(NN.edges.filter(([, b]) => b !== 'out'), 0.8);
    fire(['py', 'sql', 'ml', 'an']);
    await sleep(250);
    await pulse(NN.edges.filter(([, b]) => b === 'out'), 0.7);
    fire(['out']);
    inspect('out');
    const out = $('.nn-node[data-id="out"]', nnSvg);
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('r', '30'); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#ff6a1a'); ring.setAttribute('stroke-width', '3');
    out.prepend(ring);
    gsap.to(ring, { attr: { r: 110 }, opacity: 0, duration: 1.2, ease: 'power2.out', onComplete: () => ring.remove() });
    await sleep(1600);
    $$('.nn-node', nnSvg).forEach((n) => n.classList.remove('is-fire'));
    $$('.nn-edge', nnSvg).forEach((e) => e.classList.remove('is-hot'));
    passRunning = false;
  }
  $('.network__run').addEventListener('click', forwardPass);

  /* ------------------------------------------------------------ terminal */
  const term = { out: $('.term__out'), form: $('.term__form'), input: $('.term__input'), history: [], hi: 0, touched: false };
  const FILES = { 'about.txt': 'about', 'skills.json': 'skills', 'contact.cfg': 'contact', 'resume.pdf': 'resume' };
  const openLink = (url) => setTimeout(() => window.open(url, '_blank', 'noopener'), 400);
  const CMDS = {
    help: () => [
      '<span class="hi">available commands</span>',
      '  whoami        who is running this machine',
      '  about         the long version',
      '  skills        installed modules',
      '  interests     what I like working on',
      '  education     where I study',
      '  projects      open the mission files',
      '  contact       open an uplink',
      '  resume        open my résumé (pdf)',
      '  github        github.com/KoushikVNS',
      '  linkedin      linkedin.com/in/kaushik-chakraborty-vns',
      '  neofetch      system summary',
      '  ls · cat      browse files',
      '  date · clear  the usual',
      '  overdrive     you probably shouldn\'t',
    ],
    whoami: () => ['<span class="or">kaushik chakraborty</span>', 'data science & artificial intelligence student @ iit guwahati'],
    about: () => [
      'I\'m a Data Science and Artificial Intelligence student at IIT Guwahati, passionate about',
      'building intelligent solutions and exploring how technology can solve real-world problems.',
      '',
      'I\'m driven by curiosity, creativity, and a desire to build meaningful technology.',
    ],
    skills: () => ['<span class="ok">[installed]</span> python  sql  machine-learning  data-analytics  software-dev  emerging-tech'],
    interests: () => ['machine learning · data analytics · software development · emerging technologies'],
    education: () => ['<span class="hi">IIT Guwahati</span> · Data Science & Artificial Intelligence'],
    projects: () => { setTimeout(() => scrollToTarget($('#missions')), 500); return ['opening mission files… <span class="ok">ok</span>']; },
    contact: () => {
      setTimeout(() => scrollToTarget($('#uplink')), 500);
      return [
        'email     <a class="hi" href="mailto:koushik.vns@gmail.com">koushik.vns@gmail.com</a>',
        'github    <a class="hi" href="https://github.com/KoushikVNS" target="_blank" rel="noopener">github.com/KoushikVNS</a>',
        'linkedin  <a class="hi" href="https://www.linkedin.com/in/kaushik-chakraborty-vns" target="_blank" rel="noopener">linkedin.com/in/kaushik-chakraborty-vns</a>',
        'routing to uplink… <span class="ok">ok</span>',
      ];
    },
    resume: () => { openLink('assets/resume.pdf'); return ['opening resume.pdf… <span class="ok">ok</span>']; },
    github: () => { openLink('https://github.com/KoushikVNS'); return ['opening github.com/KoushikVNS… <span class="ok">ok</span>']; },
    linkedin: () => { openLink('https://www.linkedin.com/in/kaushik-chakraborty-vns'); return ['opening linkedin… <span class="ok">ok</span>']; },
    ls: () => ['about.txt  skills.json  contact.cfg  resume.pdf  <span class="hi">missions/</span>'],
    cat: (arg) => (FILES[arg] ? CMDS[FILES[arg]]() : arg === 'missions/' || arg === 'missions' ? ['cat: missions/: is a directory'] : [`<span class="err">cat: ${esc(arg || '')}: no such file</span>`]),
    date: () => [new Date().toString()],
    clear: () => { term.out.innerHTML = ''; return []; },
    neofetch: () => {
      const s = Math.floor((performance.now() - T0) / 1000);
      return [
        '<span class="or">   ▄▀▀▀▀▄   </span>  <span class="or">kaushik</span>@<span class="or">kc-os</span>',
        '<span class="or">  █ ▄  ▄ █  </span>  ─────────────────',
        '<span class="or">  █  ▀▀  █  </span>  <span class="hi">OS</span>       KC-OS 2.6 (neural)',
        '<span class="or">   ▀▄▄▄▄▀   </span>  <span class="hi">Host</span>     IIT Guwahati',
        '<span class="or">   ▄█▀▀█▄   </span>  <span class="hi">Major</span>    Data Science & AI',
        '<span class="or">  █ ████ █  </span>  <span class="hi">Shell</span>    curiosity',
        '              <span class="hi">Langs</span>    python, sql',
        '              <span class="hi">Modules</span>  ml, analytics, software, emerging-tech',
        `              <span class="hi">Uptime</span>   ${Math.floor(s / 60)}m ${s % 60}s`,
        '              <span class="hi">Memory</span>   always learning',
      ];
    },
    overdrive: () => { toggleOverdrive(); return [html.classList.contains('overdrive') ? '<span class="err">⚠ OVERDRIVE ENGAGED</span>' : '<span class="ok">overdrive disengaged. nominal.</span>']; },
    exit: () => ['nice try. there is no escape from curiosity.'],
    sudo: (arg) => {
      if (/^hire/.test(arg)) {
        setTimeout(() => scrollToTarget($('#uplink')), 1400);
        return ['[sudo] password for recruiter: ********', '<span class="ok">access granted.</span> excellent decision.', 'opening uplink…'];
      }
      return ['<span class="err">recruiter is not in the sudoers file.</span> try: sudo hire-kaushik'];
    },
    hello: () => ['hi there 👋 type <span class="hi">help</span> to look around.'],
  };
  CMDS.hi = CMDS.hello;
  function print(lines, cls) {
    lines.forEach((l) => {
      const div = document.createElement('div');
      if (cls) div.className = cls;
      div.innerHTML = l === '' ? '&nbsp;' : l;
      term.out.appendChild(div);
    });
    term.out.scrollTop = term.out.scrollHeight;
  }
  function run(raw) {
    const line = raw.trim();
    print([esc(line)], 'cmd');
    if (!line) return;
    term.history.push(line);
    term.hi = term.history.length;
    const [name, ...rest] = line.split(/\s+/);
    const fn = CMDS[name.toLowerCase()];
    print(fn ? fn(rest.join(' ')) : [`<span class="err">command not found: ${esc(name)}</span> · type <span class="hi">help</span>`]);
  }
  async function typeCommand(cmd) {
    term.input.value = '';
    for (const ch of cmd) { term.input.value += ch; await sleep(55 + Math.random() * 50); }
    await sleep(250);
    run(term.input.value);
    term.input.value = '';
  }
  term.form.addEventListener('submit', (e) => { e.preventDefault(); term.touched = true; run(term.input.value); term.input.value = ''; });
  term.input.addEventListener('keydown', (e) => {
    term.touched = true;
    if (e.key === 'ArrowUp' && term.history.length) { e.preventDefault(); term.hi = Math.max(0, term.hi - 1); term.input.value = term.history[term.hi]; }
    else if (e.key === 'ArrowDown' && term.history.length) { e.preventDefault(); term.hi = Math.min(term.history.length, term.hi + 1); term.input.value = term.history[term.hi] || ''; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const v = term.input.value.trim();
      const m = Object.keys(CMDS).filter((k) => k.startsWith(v));
      if (m.length === 1) term.input.value = m[0];
    }
  });
  $('.term').addEventListener('click', (e) => { if (!e.target.closest('button')) term.input.focus({ preventScroll: true }); });
  $$('.term__chips button').forEach((b) => b.addEventListener('click', () => { term.touched = true; run(b.dataset.cmd); }));
  print([
    '<span class="or">KC-OS 2.6</span> · neural shell · type <span class="hi">help</span> to list commands',
    '',
  ]);
  let termBooted = false;
  new IntersectionObserver(async ([e]) => {
    if (!e.isIntersecting || termBooted) return;
    termBooted = true;
    await sleep(500);
    if (!term.touched) await typeCommand('neofetch');
  }, { threshold: 0.4 }).observe($('.term'));

  /* ------------------------------------------------------------ robot mascot */
  const bot = $('.bot');
  const botSvg = $('.bot__svg');
  const bubble = $('.bot__bubble');
  const eyes = $$('.bot__eye', bot).map((g) => ({ cx: +g.dataset.cx, cy: +g.dataset.cy, pupil: $('.bot__pupil', g) }));
  const LINES = [
    'Beep boop. Uplink ready.',
    'Running on Python and pure curiosity.',
    'Fun fact: my creator speaks fluent SQL.',
    'Kaushik is open to opportunities. Hint, hint.',
    'I would smile, but my mouth is a progress bar.',
    '01001000 01101001. That means hi.',
    'Training data: coffee and curiosity.',
    'Please do not unplug me. I am learning.',
  ];
  let botVisible = false, li2 = 0, talking = false;
  new IntersectionObserver(([e]) => { botVisible = e.isIntersecting; }).observe(bot);
  (function eyeLoop() {
    if (botVisible) {
      const m = botSvg.getScreenCTM();
      if (m) {
        const inv = m.inverse();
        const pt = botSvg.createSVGPoint();
        pt.x = pointer.x; pt.y = pointer.y;
        const p = pt.matrixTransform(inv);
        eyes.forEach((e) => {
          const dx = p.x - e.cx, dy = p.y - e.cy, d = Math.hypot(dx, dy) || 1;
          const k = Math.min(8, d / 18);
          e.pupil.setAttribute('cx', (e.cx + (dx / d) * k).toFixed(2));
          e.pupil.setAttribute('cy', (e.cy + (dy / d) * k).toFixed(2));
        });
      }
    }
    requestAnimationFrame(eyeLoop);
  })();
  (function blinkLoop() {
    setTimeout(() => { bot.classList.add('is-blink'); setTimeout(() => bot.classList.remove('is-blink'), 260); blinkLoop(); }, 2200 + Math.random() * 3500);
  })();
  async function say(text) {
    if (talking) return;
    talking = true;
    bot.classList.add('is-talking');
    bubble.textContent = '';
    for (const ch of text) { bubble.textContent += ch; await sleep(reduce ? 0 : 28); }
    bot.classList.remove('is-talking');
    talking = false;
  }
  bot.addEventListener('click', () => {
    li2 = (li2 + 1) % LINES.length;
    say(LINES[li2]);
    if (hasGSAP && !reduce) gsap.fromTo(botSvg, { y: 0 }, { y: -26, duration: 0.25, yoyo: true, repeat: 1, ease: 'power2.out' });
  });

  /* ------------------------------------------------------------ fx canvas: click pings + trail */
  const fx = $('#fx');
  const fctx = fx.getContext('2d');
  const parts = [], rings = [];
  let fxRunning = false;
  function sizeFx() {
    const d = Math.min(devicePixelRatio || 1, 2);
    fx.width = innerWidth * d; fx.height = innerHeight * d;
    fctx.setTransform(d, 0, 0, d, 0, 0);
  }
  sizeFx();
  addEventListener('resize', sizeFx);
  function kickFx() { if (!fxRunning) { fxRunning = true; requestAnimationFrame(drawFx); } }
  function hexPath(x, y, r) {
    fctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      fctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    fctx.closePath();
  }
  function drawFx() {
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.t += 0.035;
      if (r.t >= 1) { rings.splice(i, 1); continue; }
      fctx.strokeStyle = `rgba(255,106,26,${1 - r.t})`;
      fctx.lineWidth = 2;
      hexPath(r.x, r.y, 8 + r.t * 46);
      fctx.stroke();
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy = p.vy * 0.94 + 0.04; p.life -= p.decay;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      fctx.fillStyle = p.c.replace('A', p.life.toFixed(2));
      fctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    if (rings.length || parts.length) requestAnimationFrame(drawFx);
    else { fxRunning = false; fctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  if (!reduce) {
    addEventListener('click', (e) => {
      if (!e.detail) return;
      rings.push({ x: e.clientX, y: e.clientY, t: 0 });
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2, s = 1.5 + Math.random() * 4;
        parts.push({ x: e.clientX, y: e.clientY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, decay: 0.02 + Math.random() * 0.02, s: 2 + Math.random() * 3, c: Math.random() < 0.5 ? 'rgba(255,106,26,A)' : 'rgba(61,220,255,A)' });
      }
      kickFx();
    });
    if (fine) {
      let lx = 0, ly = 0;
      addEventListener('pointermove', (e) => {
        if (Math.hypot(e.clientX - lx, e.clientY - ly) < 22) return;
        lx = e.clientX; ly = e.clientY;
        parts.push({ x: lx, y: ly, vx: 0, vy: 0, life: 0.7, decay: 0.03, s: 2, c: 'rgba(61,220,255,A)' });
        kickFx();
      }, { passive: true });
    }
  }

  /* ------------------------------------------------------------ easter eggs */
  function toggleOverdrive() {
    html.classList.toggle('overdrive');
    const on = html.classList.contains('overdrive');
    toast(on ? '⚠ OVERDRIVE ENGAGED' : 'Systems nominal');
    if (window.Neural) window.Neural.intensity = on ? 1.8 : 1;
  }
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let kI = 0;
  addEventListener('keydown', (e) => {
    if (e.target === term.input) return;
    const k = e.key.toLowerCase();
    kI = k === KONAMI[kI] ? kI + 1 : (k === KONAMI[0] ? 1 : 0);
    if (kI === KONAMI.length) { kI = 0; toggleOverdrive(); }
  });
  const docTitle = document.title;
  document.addEventListener('visibilitychange', () => { document.title = document.hidden ? '⚠ Signal lost… come back' : docTitle; });

  /* ------------------------------------------------------------ scroll-driven motion */
  function splitStatement() {
    const st = $('.statement');
    const words = [];
    const walk = (node) => [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const s = document.createElement('span');
          s.className = 'sw';
          s.textContent = part;
          frag.appendChild(s);
          words.push(s);
        });
        n.replaceWith(frag);
      } else walk(n);
    });
    walk(st);
    return words;
  }
  const statementWords = splitStatement();

  async function typeRows(card) {
    for (const dd of $$('dd[data-type]', card)) {
      const text = dd.dataset.full || (dd.dataset.full = dd.textContent);
      dd.textContent = '';
      dd.classList.add('is-typing');
      for (let i = 1; i <= text.length; i++) { dd.textContent = text.slice(0, i); await sleep(14); }
      dd.classList.remove('is-typing');
    }
  }

  function setupScroll() {
    const installAll = () => $$('.module').forEach((m) => m.classList.add('is-installed'));
    const gaugesAll = () => $$('.gauge').forEach((g) => { $('.gauge__val', g).style.strokeDashoffset = 314.16 * (1 - +g.dataset.gauge); });
    if (!hasGSAP || reduce) {
      statementWords.forEach((w) => { w.style.opacity = 1; });
      $$('.identity__text p').forEach((p) => p.classList.add('is-in'));
      installAll(); gaugesAll();
      return;
    }

    $$('[data-reveal]').forEach((el) => {
      gsap.from(el, {
        y: 50, opacity: 0, duration: 1.1, ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true, onEnter: () => el.classList.add('is-in') },
      });
    });
    // panels open like shutters
    $$('.frame, .module, .mission__link').forEach((el) => {
      gsap.fromTo(el, { clipPath: 'inset(0 0 100% 0)' }, {
        clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'expo.inOut',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        onComplete: () => { el.style.clipPath = ''; },
      });
    });
    $$('[data-decode]').forEach((el) => {
      if (el.closest('.hero')) return;
      ScrollTrigger.create({ trigger: el, start: 'top 85%', once: true, onEnter: () => decode(el) });
    });
    gsap.to(statementWords, {
      opacity: 1, stagger: 0.1, ease: 'none',
      scrollTrigger: { trigger: '.statement', start: 'top 82%', end: 'bottom 50%', scrub: true },
    });
    ScrollTrigger.create({ trigger: '.idcard', start: 'top 80%', once: true, onEnter: () => typeRows($('.idcard')) });
    ScrollTrigger.create({ trigger: '.gauges', start: 'top 85%', once: true, onEnter: gaugesAll });
    $$('.gauge [data-count]').forEach((el) => {
      gsap.fromTo(el, { textContent: 0 }, { textContent: +el.dataset.count, duration: 1.6, snap: { textContent: 1 }, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
    });
    ScrollTrigger.batch('.module', { start: 'top 85%', once: true, onEnter: (els) => els.forEach((m, i) => setTimeout(() => m.classList.add('is-installed'), i * 140)) });

    // directives: earlier cards sink back as the next one stacks on top
    const cards = $$('.directive');
    cards.forEach((card, i) => {
      const next = cards[i + 1];
      if (!next) return;
      gsap.to(card, {
        scale: 0.92, filter: 'brightness(.45)', ease: 'none',
        scrollTrigger: { trigger: next, start: 'top bottom', end: 'top 30%', scrub: true },
      });
    });

    // hero parallax out + tapes tilt in
    gsap.to('.hero__copy', { yPercent: -16, opacity: 0.25, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__floor', { opacity: 0, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'center top', end: 'bottom top', scrub: true } });
    gsap.fromTo('.tape--orange', { rotate: -8 }, { rotate: -3, ease: 'none', scrollTrigger: { trigger: '.tapes', start: 'top bottom', end: 'bottom top', scrub: true } });
    gsap.fromTo('.tape--cyan', { rotate: 7 }, { rotate: 2.5, ease: 'none', scrollTrigger: { trigger: '.tapes', start: 'top bottom', end: 'bottom top', scrub: true } });

    // neural net: first forward pass when it comes into view
    ScrollTrigger.create({ trigger: '.nn', start: 'top 65%', once: true, onEnter: () => setTimeout(forwardPass, 400) });

    // HUD section readout + nav active link
    const navLinks = $$('.nav__links a');
    $$('main > section[data-sec]').forEach((sec) => {
      ScrollTrigger.create({
        trigger: sec, start: 'top 50%', end: 'bottom 50%',
        onToggle: (self) => {
          if (!self.isActive) return;
          hud.sec.textContent = `SEC-${sec.dataset.sec}`;
          hud.name.textContent = sec.dataset.secname;
          decode(hud.name, { speed: 2 });
          navLinks.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${sec.id}`));
        },
      });
    });
    document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  }

  /* ------------------------------------------------------------ intro (after boot) */
  function intro() {
    if (lenis) lenis.start();
    flashMesh(3400);
    preloadModes();
    startAutoModes();
    setInterval(() => { if (heroVisible) burst(); }, 6500);
    decode($('.hero__first'));
    decode($('.hero__last'), { speed: 0.8 });
    if (!hasGSAP || reduce) return;
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from('.nav > *', { y: -30, opacity: 0, duration: 1, stagger: 0.07 }, 0.1)
      .from('.hud__corner', { scale: 2.5, opacity: 0, duration: 1, stagger: 0.06 }, 0)
      .from('.hud__rail, .hud__bar', { opacity: 0, duration: 1 }, 0.4)
      .from('.hero__name', { opacity: 0, duration: 0.3 }, 0)
      .from('[data-hero]', { y: 30, opacity: 0, duration: 1.1, stagger: 0.08 }, 0.25)
      .fromTo('.pod', { clipPath: 'inset(50% 0% 50% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'expo.inOut', clearProps: 'clipPath' }, 0.15)
      .from('.hero__floor', { opacity: 0, duration: 1.5 }, 0.3)
      .from('.fm-boxg', { scale: 1.8, transformOrigin: '50% 50%', opacity: 0, duration: 0.9, ease: 'back.out(1.6)' }, 1)
      .from('.fm-line', { opacity: 0, duration: 0.6, stagger: 0.05 }, 1.2)
      .from('.fm-dot', { scale: 0, transformOrigin: '50% 50%', duration: 0.4, stagger: 0.008, ease: 'back.out(3)' }, 1.2)
      .from('.fm-tag', { opacity: 0, x: -20, duration: 0.6 }, 1.6);
  }

  /* ------------------------------------------------------------ boot sequence */
  const boot = $('.boot');
  const bootLog = $('.boot__log');
  const bootFill = $('.boot__fill');
  const bootPct = $('.boot__pct');
  const BOOT = [
    'Mounting /dev/curiosity',
    'Loading python3 runtime',
    'Connecting SQL datastore',
    'Calibrating ML inference engine',
    'Syncing IIT_GUWAHATI.dsai module',
    'Spinning up neural mesh',
    'Booting personality matrix',
  ];
  let skip = false;
  const doSkip = () => { skip = true; };
  addEventListener('keydown', doSkip, { once: true });
  boot.addEventListener('click', doSkip, { once: true });

  const portraitReady = new Promise((res) => {
    const img = $('.layer--optical');
    if (img.complete) res(); else { img.addEventListener('load', res, { once: true }); img.addEventListener('error', res, { once: true }); }
  });
  const ready = Promise.race([
    Promise.all([portraitReady, document.fonts ? document.fonts.ready : Promise.resolve()]),
    sleep(4500),
  ]);

  async function runBoot() {
    const setPct = (p) => { bootFill.style.width = `${p}%`; bootPct.textContent = `${pad(p, 3)}%`; };
    for (let i = 0; i < BOOT.length && !skip && !reduce; i++) {
      bootLog.innerHTML += `<span class="wait">[ .. ]</span> ${BOOT[i]}\n`;
      setPct(Math.round(((i + 0.5) / BOOT.length) * 90));
      await sleep(150 + Math.random() * 120);
      bootLog.innerHTML = bootLog.innerHTML.replace(/<span class="wait">\[ \.\. \]<\/span>(?![\s\S]*wait)/, '<span class="ok">[ OK ]</span>');
    }
    await ready;
    setPct(100);
    setupScroll();
    if (!hasGSAP || reduce) {
      boot.remove();
      html.classList.remove('is-booting');
      intro();
      return;
    }
    gsap.timeline({ onComplete: () => boot.remove() })
      .to('.boot__console', { opacity: 0, y: -20, duration: 0.35, ease: 'power2.in' }, skip ? 0 : 0.2)
      .fromTo('.boot__online', { opacity: 0, scale: 1.2 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'power2.out' }, '<0.2')
      .to('.boot__online', { opacity: 0, duration: 0.25, delay: 0.35 })
      .to('.boot__door--top', { yPercent: -101, duration: 1, ease: 'expo.inOut' }, '<')
      .to('.boot__door--bottom', { yPercent: 101, duration: 1, ease: 'expo.inOut' }, '<')
      .add(() => { html.classList.remove('is-booting'); intro(); ScrollTrigger.refresh(); }, '<0.25');
  }
  runBoot();
})();
