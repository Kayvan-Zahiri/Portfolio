/* The table: objects you can pick up. They settle into place when they
   first appear, lift while held, and spring home when dropped. Touch
   devices get plain taps; dragging is for mouse and pen. */
(() => {
  'use strict';

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const all = [];
  let z = 10;
  let raf = 0;
  let last = 0;

  const tiltOf = el => parseFloat(getComputedStyle(el).getPropertyValue('--r')) || 0;
  const scaleTarget = o => (o.held ? 1.04 : o.hover && !reduce ? 1.015 : 1);

  function register(el) {
    const r = tiltOf(el);
    const o = {
      el, r, a: r, x: 0, y: 0, vx: 0, vy: 0, va: 0, s: 1, vs: 0, op: 1,
      start: 0, placed: false, held: false, hover: false, dragged: false, moved: 0,
    };
    all.push(o);

    el.addEventListener('pointerdown', e => {
      o.dragged = false;
      if (e.pointerType === 'touch' || e.button !== 0) return;
      e.preventDefault();
      o.held = true;
      o.moved = 0;
      o.px = e.clientX;
      o.py = e.clientY;
      o.ox = e.clientX - o.x;
      o.oy = e.clientY - o.y;
      o.vx = o.vy = 0;
      o.lt = performance.now();
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* older browsers */ }
      el.style.zIndex = String(++z);
      el.classList.add('held');
      wake();
    });

    el.addEventListener('pointermove', e => {
      if (!o.held) return;
      const now = performance.now();
      const dt = Math.max(8, now - o.lt) / 1000;
      const nx = e.clientX - o.ox;
      const ny = e.clientY - o.oy;
      o.vx = (nx - o.x) / dt;
      o.vy = (ny - o.y) / dt;
      o.x = nx;
      o.y = ny;
      o.lt = now;
      o.moved = Math.max(o.moved, Math.hypot(e.clientX - o.px, e.clientY - o.py));
      wake();
    });

    const release = e => {
      if (!o.held) return;
      o.held = false;
      el.classList.remove('held');
      if (performance.now() - o.lt > 60) o.vx = o.vy = 0;
      const lim = v => Math.max(-1600, Math.min(1600, v));
      o.vx = lim(o.vx);
      o.vy = lim(o.vy);
      // Only a drag that ends in pointerup is followed by a click to swallow.
      o.dragged = e.type === 'pointerup' && o.moved >= 4;
      if (o.moved >= 4) o.hover = false;
      wake();
    };
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);

    // A drag is not a click: swallow the click that follows a drop.
    el.addEventListener('click', e => {
      if (!o.dragged || e.detail === 0) { o.dragged = false; return; }
      e.preventDefault();
      e.stopPropagation();
      o.dragged = false;
    }, true);

    el.addEventListener('pointerenter', e => {
      if (e.pointerType === 'touch') return;
      o.hover = true;
      wake();
    });
    el.addEventListener('pointerleave', () => {
      o.hover = false;
      wake();
    });
    el.addEventListener('dragstart', e => e.preventDefault());
    return o;
  }

  function write(o) {
    const tf = `translate3d(${o.x.toFixed(1)}px,${o.y.toFixed(1)}px,0) rotate(${o.a.toFixed(2)}deg) scale(${o.s.toFixed(4)})`;
    if (tf !== o.tf) { o.el.style.transform = tf; o.tf = tf; }
    const op = o.op.toFixed(3);
    if (op !== o.opS) { o.el.style.opacity = op; o.opS = op; }
    const lift = Math.max(0, Math.min(1.4, (o.s - 1) / 0.04)).toFixed(2);
    if (lift !== o.liftS) { o.el.style.setProperty('--lift', lift); o.liftS = lift; }
  }

  function place(list, lead = 90, rise = 1.06) {
    const now = performance.now();
    const gap = Math.min(70, 640 / Math.max(1, list.length));
    list.forEach((o, i) => {
      if (o.placed) return;
      o.placed = true;
      o.r = tiltOf(o.el);
      if (reduce) {
        o.a = o.r;
        o.op = 1;
        o.start = now;
      } else {
        o.start = now + lead + i * gap;
        o.y = -16;
        o.s = rise;
        o.a = o.r + (o.r < 0 ? -5 : 5);
        o.op = 0;
      }
      write(o);
      o.el.classList.remove('pending');
    });
    wake();
  }

  function step(o, h) {
    if (!o.held) {
      o.vx += (-170 * o.x - 18 * o.vx) * h; o.x += o.vx * h;
      o.vy += (-170 * o.y - 18 * o.vy) * h; o.y += o.vy * h;
    }
    o.vs += (260 * (scaleTarget(o) - o.s) - 22 * o.vs) * h; o.s += o.vs * h;
    const at = o.held ? 0 : o.r;
    o.va += (200 * (at - o.a) - 20 * o.va) * h; o.a += o.va * h;
  }

  function settled(o) {
    return !o.held && o.op >= 1 &&
      Math.abs(o.x) < 0.05 && Math.abs(o.y) < 0.05 &&
      Math.abs(o.vx) < 0.5 && Math.abs(o.vy) < 0.5 &&
      Math.abs(o.a - o.r) < 0.005 && Math.abs(o.va) < 0.05 &&
      Math.abs(o.s - scaleTarget(o)) < 0.0003 && Math.abs(o.vs) < 0.003;
  }

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let busy = false;
    for (const o of all) {
      if (!o.placed) continue;
      if (now < o.start) { busy = true; continue; }
      if (reduce) {
        if (!o.held) { o.x = o.y = o.vx = o.vy = 0; }
        o.s = scaleTarget(o);
        o.a = o.held ? 0 : o.r;
        o.op = 1;
      } else {
        const n = Math.ceil(dt / 0.008) || 1;
        for (let i = 0; i < n; i++) step(o, dt / n);
        o.op = Math.min(1, (now - o.start) / 180);
      }
      if (settled(o)) {
        o.x = o.y = o.vx = o.vy = o.va = o.vs = 0;
        o.a = o.r;
        o.s = scaleTarget(o);
      } else {
        busy = true;
      }
      write(o);
    }
    raf = busy ? requestAnimationFrame(tick) : 0;
  }

  function wake() {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }

  // The first screen settles right away.
  const table = document.querySelector('.table');
  const tableObjs = table ? [...table.querySelectorAll('.obj')].map(register) : [];
  const onTable = list => list.filter(o => getComputedStyle(o.el).display !== 'none');
  requestAnimationFrame(() => place(onTable(tableObjs), 160, 1.08));

  // Everything further down settles when it comes into view.
  const scenes = [...document.querySelectorAll('[data-scene]')];
  const byScene = new Map();
  for (const scene of scenes) {
    byScene.set(scene, [...scene.querySelectorAll('.obj')].map(el => {
      el.classList.add('pending');
      return register(el);
    }));
  }
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        place(byScene.get(en.target));
        io.unobserve(en.target);
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.12 });
    scenes.forEach(scene => io.observe(scene));
  } else {
    scenes.forEach(scene => place(byScene.get(scene)));
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      for (const o of all) o.r = tiltOf(o.el);
      const hidden = onTable(tableObjs.filter(o => !o.placed));
      if (hidden.length) place(hidden, 160, 1.08);
      wake();
    }, 120);
  });

  // ParkCast demo loops play only while they are on screen.
  const videos = [...document.querySelectorAll('video[data-autoplay]')];
  if (videos.length && 'IntersectionObserver' in window && !reduce) {
    const vio = new IntersectionObserver(entries => {
      for (const en of entries) {
        const v = en.target;
        if (en.isIntersecting) {
          v.preload = 'auto';
          const p = v.play();
          if (p && p.catch) p.catch(() => {});
        } else {
          v.pause();
        }
      }
    }, { threshold: 0 });
    videos.forEach(v => vio.observe(v));
  }

  // Top bar: a surface once you scroll.
  const bar = document.getElementById('bar');
  if (bar) {
    const onScroll = () => bar.classList.toggle('scrolled', window.scrollY > 8);
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Phone menu.
  const menu = document.getElementById('menu');
  const menuBtn = document.querySelector('.menu-btn');
  if (menu && menuBtn && typeof menu.showModal === 'function') {
    menuBtn.addEventListener('click', () => {
      menu.showModal();
      menuBtn.setAttribute('aria-expanded', 'true');
    });
    menu.addEventListener('close', () => menuBtn.setAttribute('aria-expanded', 'false'));
    menu.querySelector('.menu-close').addEventListener('click', () => menu.close());
    menu.querySelectorAll('nav a').forEach(a => a.addEventListener('click', () => menu.close()));
    // A click on the dialog element itself lands on the backdrop or on the panel's padding.
    menu.addEventListener('click', e => {
      if (e.target !== menu) return;
      const r = menu.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) menu.close();
    });
  } else if (menuBtn) {
    menuBtn.hidden = true;
    document.documentElement.classList.remove('js');
  }
})();
