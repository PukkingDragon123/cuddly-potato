// Screen transition: the "bubble lab". Blue lab liquid rises from the bottom of
// the screen between two glass tube walls with measurement ticks, full of
// hand-pixelled bubbles that wobble and pop into droplets at a foamy, wavy
// surface; once the next screen is ready the liquid drains away, still bubbling.
//
// Drawn at "art pixel" resolution (2-4 CSS px per pixel, scaled up with hard
// edges). It redraws only on a fixed 20 fps step clock, so the motion moves in
// chunky steps like sprite animation. There are two phases:
//   cover  (phase 'in')  - fills until the screen is hidden, then holds
//   reveal (phase 'out') - drains to show the new screen, then removes itself
//
//   tx.cover()  -> resolves once covered (the overlay stays up)
//   tx.reveal() -> drains; resolves when gone
//   tabSwap(host, rect, tab, dir) -> a short version over a tab panel; resolves
//                when the panel is covered, and the drain then plays by itself
// Options: { speed } scales the duration, { freeze: t } holds the frame at t (for tools).
// prefers-reduced-motion swaps it for a quick stepped fade.
import { audio } from '../core/audio.js';

const FPS = 20;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (t) => t * t * (3 - 2 * t);
const easeIn = (t) => t * t;
const hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(x & 3) + ((y & 3) << 2)];

// lab-blue ramp: deep navy -> cobalt -> blue -> cyan -> white foam
const L = {
  ink: '#030a26', deep: '#0a1a5c', cobalt: '#1640b8', blue: '#1f6fe0', cyan: '#3ab4ff', ice: '#8ae6ff', foam: '#f0fbff',
  rimLit: '#e0f8ff', rimDark: '#5ab8f0', bOut: '#06205e', tint: 'rgba(191,239,255,0.22)',
  glass: 'rgba(170,225,255,0.38)', glassHi: '#e6f8ff', glassDk: '#0b2a6e', tick: '#cdeeff',
  navy: '#0b1230',
};

function canvas(w, hh) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, hh);
  return c;
}

// ---------------------------------------------------------------------------
// bubble sprites: 5 sizes x 4 frames (round, squashed, stretched, popping ring), 16px cells

const CELL = 16;
const SIZES = [4, 5, 7, 9, 12];
let _sheet = null;
function bubbleSheet() {
  if (_sheet) return _sheet;
  const cv = canvas(CELL * 4, CELL * SIZES.length), g = cv.getContext('2d');
  const px = (x, y, col) => { g.fillStyle = col; g.fillRect(x, y, 1, 1); };
  SIZES.forEach((D, si) => {
    const r = D / 2;
    const shapes = [[r, r], [r + 0.5, r - 0.5], [r - 0.5, r + 0.5]];
    for (let f = 0; f < 4; f++) {
      const ox = f * CELL, oy = si * CELL, c = CELL / 2;
      if (f === 3) {
        // popping: a broken, slightly bigger ring of foam pixels
        const rr = r + 1;
        for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
          const dx = x + 0.5 - c, dy = y + 0.5 - c, d = Math.hypot(dx, dy);
          if (Math.abs(d - rr) > 0.55) continue;
          const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 8);
          if (seg & 1) continue;
          px(ox + x, oy + y, seg % 4 ? L.ice : L.foam);
        }
        continue;
      }
      const [rx, ry] = shapes[f];
      const inside = (x, y) => { const dx = (x + 0.5 - c) / rx, dy = (y + 0.5 - c) / ry; return dx * dx + dy * dy <= 1; };
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const dx = (x + 0.5 - c) / rx, dy = (y + 0.5 - c) / ry, d = Math.hypot(dx, dy);
        if (!inside(x, y)) {
          // dark outline hugging the rim
          if (inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1)) px(ox + x, oy + y, L.bOut);
          continue;
        }
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        if (edge) px(ox + x, oy + y, dx + dy < 0.2 ? L.rimLit : L.rimDark);
        else if (dx + dy > 0.55 && d > 0.45) px(ox + x, oy + y, 'rgba(90,184,240,0.55)'); // shadowed lower crescent
        else px(ox + x, oy + y, L.tint);
      }
      // highlight: one pixel on tiny bubbles, an L-shaped glint on bigger ones; a back glint on the biggest
      const hx = Math.round(c - rx * 0.45 - 0.5), hy = Math.round(c - ry * 0.45 - 0.5);
      px(ox + hx, oy + hy, '#ffffff');
      if (D >= 7) { px(ox + hx + 1, oy + hy, '#ffffff'); px(ox + hx, oy + hy + 1, L.rimLit); }
      if (D >= 9) px(ox + Math.round(c + rx * 0.4), oy + Math.round(c + ry * 0.42), L.rimLit);
    }
  });
  _sheet = cv;
  return cv;
}

// ---------------------------------------------------------------------------
// droplet particles: a fixed pool stepped on the transition clock

function makeParts(n = 240) {
  const a = [];
  for (let i = 0; i < n; i++) a.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, g: 0, age: 0, life: 0, s: 1, cols: null });
  return a;
}
function spawn(c, x, y, vx, vy, life, cols, s = 1, grav = 0) {
  for (const p of c.parts) {
    if (p.on) continue;
    p.on = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.age = 0; p.cols = cols; p.s = s; p.g = grav;
    return p;
  }
  return null;
}
function stepParts(c) {
  for (const p of c.parts) {
    if (!p.on) continue;
    p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.9; p.age++;
    if (p.age >= p.life) p.on = false;
  }
}
function drawParts(c) {
  const g = c.g;
  for (const p of c.parts) {
    if (!p.on) continue;
    g.fillStyle = p.cols[Math.min(p.cols.length - 1, ((p.age / p.life) * p.cols.length) | 0)];
    g.fillRect(Math.round(p.x), Math.round(p.y), p.s, p.s);
  }
}
const clearParts = (c) => { for (const p of c.parts) p.on = false; };

// ---------------------------------------------------------------------------
// the bubble lab

const BUBBLE = {
  din: 0.66, dout: 0.6,
  cues: {
    in: [[0, 'pour', { pitch: 1.2, vol: 0.45 }], [0.12, 'bubble', { vol: 0.55 }], [0.55, 'slosh', { vol: 0.4 }]],
    out: [[0, 'slosh', { pitch: 1.1, vol: 0.4 }], [0.25, 'bubble', { pitch: 1.2, vol: 0.45 }]],
  },
  init(c) {
    const { W, H, rnd } = c;
    // depth: dithered cobalt then deep navy toward the bottom, plus faint caustic light streaks
    const depth = canvas(W, H), g = depth.getContext('2d');
    for (let y = 0; y < H; y++) {
      const a = clamp01((y - H * 0.35) / (H * 0.3)), b = clamp01((y - H * 0.68) / (H * 0.3));
      for (let x = 0; x < W; x++) {
        const k = bayer(x, y);
        if (b > k) { g.fillStyle = L.deep; g.fillRect(x, y, 1, 1); }
        else if (a > k) { g.fillStyle = L.cobalt; g.fillRect(x, y, 1, 1); }
      }
    }
    g.fillStyle = L.cyan;
    for (let i = 0; i < Math.max(3, W / 28); i++) {
      const x0 = rnd() * W, ph = rnd() * 6;
      for (let y = 4; y < H * 0.6; y++) {
        const x = Math.round(x0 + Math.sin(y * 0.09 + ph) * 3);
        if ((1 - y / (H * 0.6)) * 0.45 > bayer(x, y)) g.fillRect(x, y, 1, 1);
      }
    }
    const bubbles = [];
    for (let i = 0; i < 110; i++) bubbles.push({ on: false, x: 0, y: 0, vy: 0, sz: 0, ph: 0, amp: 0, pop: 0 });
    c.st = { depth, bubbles, ph1: rnd() * 6, ph2: rnd() * 6 };
  },
  draw(c, t, ph, step, o) {
    const { g, W, H, st, rnd } = c;
    const sheet = bubbleSheet();
    const lite = !!o.lite;
    // the liquid level (top of the surface), rising to cover or falling to drain
    const base = ph === 'in' ? Math.round(H + 8 - smooth(t) * (H + 26)) : Math.round(-18 + easeIn(t) * (H + 28));
    const surf = (x) => base + Math.round(1.6 * Math.sin(x * 0.13 + step * 0.9 + st.ph1) + 1.2 * Math.sin(x * 0.047 - step * 0.6 + st.ph2));

    // body, then depth shading only where there is liquid, then the bright surface bands on top
    g.fillStyle = L.blue;
    for (let x = 0; x < W; x++) { const s = surf(x) + 3; if (s < H) g.fillRect(x, Math.max(0, s), 1, H - Math.max(0, s)); }
    g.globalCompositeOperation = 'source-atop';
    g.drawImage(st.depth, 0, 0);
    g.globalCompositeOperation = 'source-over';
    for (let x = 0; x < W; x++) {
      const s = surf(x);
      if (s >= H + 2) continue;
      g.fillStyle = L.ink; g.fillRect(x, s - 1, 1, 1);
      g.fillStyle = L.foam; g.fillRect(x, s, 1, 1);
      g.fillStyle = L.ice; g.fillRect(x, s + 1, 1, 1);
      g.fillStyle = L.cyan; g.fillRect(x, s + 2, 1, 2);
      if (bayer(x, s + 4) < 0.5) { g.fillStyle = L.cyan; g.fillRect(x, s + 4, 1, 1); }
    }

    // bubbles: spawn under the surface, rise with a wobble, pop at the surface
    const B = st.bubbles;
    const want = lite ? 3 : Math.max(3, Math.round((W * H) / 7000));
    for (let n = 0; n < want; n++) {
      const b = B.find((q) => !q.on);
      if (!b) break;
      const lo = Math.max(base + 8, 0);
      if (lo >= H + 6) break;
      b.on = true; b.pop = 0;
      b.sz = Math.min(4, Math.floor(rnd() * rnd() * (lite ? 4 : 5.5)));
      b.x = 6 + rnd() * (W - 12); b.y = lo + rnd() * (H + 6 - lo);
      b.vy = 1.4 + b.sz * 0.5 + rnd() * 1.2;
      b.ph = rnd() * 6; b.amp = 0.6 + rnd() * 1.4;
    }
    let pops = 0;
    for (const b of B) {
      if (!b.on) continue;
      const D = SIZES[b.sz];
      const x = Math.round(b.x + Math.sin(step * 0.8 + b.ph) * b.amp);
      if (b.pop) {
        g.drawImage(sheet, 3 * CELL, b.sz * CELL, CELL, CELL, x - CELL / 2, Math.round(b.y) - CELL / 2, CELL, CELL);
        if (++b.pop > 2) b.on = false;
        continue;
      }
      b.y -= b.vy;
      const s = surf(x);
      if (b.y - D / 2 <= s + 1) {
        // burst into droplets at the surface
        b.pop = 1; b.y = s;
        const nd = 2 + b.sz;
        for (let i = 0; i < nd; i++) spawn(c, x, s - 1, (rnd() - 0.5) * (1.5 + b.sz), -1 - rnd() * (1 + b.sz * 0.5), 5 + ((rnd() * 4) | 0), [L.foam, L.ice, L.cyan], 1 + (b.sz > 2 && i === 0), 0.35);
        g.drawImage(sheet, 3 * CELL, b.sz * CELL, CELL, CELL, x - CELL / 2, s - CELL / 2, CELL, CELL);
        pops++;
        continue;
      }
      if (b.y > H + 8) continue;
      const f = [0, 1, 0, 2][(step + (b.ph * 3 | 0)) & 3];
      g.drawImage(sheet, f * CELL, b.sz * CELL, CELL, CELL, x - CELL / 2, Math.round(b.y) - CELL / 2, CELL, CELL);
    }
    if (pops && !o.silent) { try { audio.play('bubblePop', { gap: 0.07, vol: lite ? 0.15 : 0.25, pitch: 0.8 + rnd() * 0.6 }); } catch (e) { /* audio optional */ } }

    // foam: tiny bubbles riding the surface line, jittering every other step
    for (let x = 2; x < W - 2; x += 4) {
      const hsh = hash(x * 7 + (step >> 1));
      if (hsh & 1) continue;
      const s = surf(x);
      if (s > H + 2 || s < -6) continue;
      const sz = hsh & 6 ? 0 : 1;
      g.drawImage(sheet, ((hsh >> 3) & 1) * CELL, sz * CELL, CELL, CELL, x + ((hsh >> 4) & 1) - CELL / 2, s - 1 - CELL / 2, CELL, CELL);
    }
    // draining: foam left clinging to the glass slides down behind the level
    if (ph === 'out' && base > 4 && base < H && (step & 1)) {
      for (let i = 0; i < (lite ? 1 : 3); i++) spawn(c, rnd() * W, base - 3 - rnd() * 12, 0, 0.5, 8, [L.foam, L.ice, L.cyan], 1 + (rnd() < 0.3), 0.05);
    }

    // glass tube walls with measurement ticks, sliding in at the start and out at the end
    const k = ph === 'in' ? clamp01(t / 0.15) : clamp01((1 - t) / 0.15);
    const wall = lite ? 3 : 5;
    const off = Math.round((1 - k) * (wall + 2));
    if (k > 0) {
      for (const side of [0, 1]) {
        const x0 = side ? W - wall + off : -off;
        g.fillStyle = L.glass; g.fillRect(x0, 0, wall, H);
        g.fillStyle = L.glassHi; g.fillRect(x0 + (side ? wall - 2 : 1), 0, 1, H);
        g.fillStyle = L.glassDk; g.fillRect(side ? x0 - 1 : x0 + wall, 0, 1, H);
        // ticks on the inner face: short every 6px, long every 24px
        for (let y = 3; y < H; y += 6) {
          const long = ((y - 3) / 6) % 4 === 0, len = long ? (lite ? 3 : 5) : 2;
          const tx = side ? x0 - 1 - len : x0 + wall + 1;
          g.fillStyle = L.glassDk; g.fillRect(tx, y + 1, len, 1);
          g.fillStyle = L.tick; g.fillRect(tx, y, len, 1);
        }
      }
    }
  },
};

const FADE = {
  din: 0.16, dout: 0.18,
  draw(c, t, ph) {
    const a = ph === 'in' ? t : 1 - t;
    c.g.globalAlpha = Math.round(a * 4) / 4;
    c.g.fillStyle = L.navy; c.g.fillRect(0, 0, c.W, c.H);
    c.g.globalAlpha = 1;
  },
};

// ---------------------------------------------------------------------------
// the stage: one low-res canvas, the step clock and the particle pool

function artPx() {
  const m = Math.min(window.innerWidth, window.innerHeight);
  return Math.max(2, Math.min(4, Math.round(m / 180)));
}

class Stage {
  constructor(z, block) {
    this.z = z; this.block = block;
    this.cv = null; this.c = null; this.id = 0; this.fin = null;
  }
  mount(host, rect, before = null) {
    const P = artPx();
    const w = rect ? rect.w : host.clientWidth, hh = rect ? rect.h : host.clientHeight;
    const W = Math.max(8, Math.ceil(w / P)), H = Math.max(8, Math.ceil(hh / P));
    if (!this.cv) {
      this.cv = document.createElement('canvas');
      Object.assign(this.cv.style, { position: 'absolute', imageRendering: 'pixelated', zIndex: String(this.z) });
    }
    const cv = this.cv;
    const sized = cv.width === W && cv.height === H;
    if (!sized) { cv.width = W; cv.height = H; }
    Object.assign(cv.style, { left: (rect ? rect.x : 0) + 'px', top: (rect ? rect.y : 0) + 'px', width: W * P + 'px', height: H * P + 'px' });
    if (cv.parentNode !== host) { if (before && before.parentNode === host) host.insertBefore(cv, before); else host.appendChild(cv); }
    if (!this.c || !sized) {
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      this.c = { g, W, H, parts: this.c?.parts ?? makeParts(), st: {}, rnd: Math.random, kind: null };
    }
    return this.c;
  }
  /** Run one phase. Resolves at its end (a newer run resolves the older one at once). */
  run(host, ph, o = {}) {
    if (this.fin) this.fin();
    const name = reduced() ? 'fade' : 'bubble';
    const K = name === 'fade' ? FADE : BUBBLE;
    const wasUp = this.cv?.parentNode === host;
    const c = this.mount(host, o.rect, o.before);
    // the drain carries on from the fill (same bubbles, same depth art)
    if (!(ph === 'out' && wasUp && c.kind === name)) {
      c.rnd = rng((Math.random() * 1e9) | 0);
      c.st = {};
      clearParts(c);
      K.init?.(c, ph);
    }
    c.kind = name;
    const cv = this.cv;
    cv.style.pointerEvents = this.block && ph === 'in' ? 'auto' : 'none';
    const dur = (ph === 'in' ? K.din : K.dout) * (o.speed ?? 1);
    const nSteps = Math.max(1, Math.round(dur * FPS));
    const cues = (o.silent ? [] : K.cues?.[ph] ?? []).slice();
    const vk = o.vol ?? 1;
    const id = ++this.id;
    return new Promise((res) => {
      let last = -1, done = false;
      const t0 = performance.now();
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(safety);
        if (this.fin === finish) this.fin = null;
        if (ph !== 'in' && this.id === id) { cv.remove(); clearParts(c); c.kind = null; }
        res();
      };
      this.fin = finish;
      const frame = (s) => {
        const t = Math.min(1, s / nSteps);
        const n = Math.min(3, s - last);
        for (let i = 0; i < n; i++) stepParts(c);
        last = s;
        const g = c.g;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, c.W, c.H);
        try { K.draw(c, t, ph, s, o); } catch (e) { console.error('transition', e); }
        drawParts(c);
        while (cues.length && cues[0][0] <= t) {
          const [, snd, so] = cues.shift();
          try { audio.play(snd, { ...so, vol: (so.vol ?? 1) * vk }); } catch (e) { /* audio optional */ }
        }
        return t;
      };
      const safety = setTimeout(() => { if (this.id === id && !done) { frame(nSteps); finish(); } }, dur * 1000 + 1200);
      if (o.freeze != null) {
        const to = Math.round(clamp01(o.freeze) * nSteps);
        for (let s = 0; s <= to; s++) frame(s);
        done = true; clearTimeout(safety); this.fin = null; res();
        return;
      }
      const tick = (now) => {
        if (done || this.id !== id) { finish(); return; }
        const s = Math.floor(((now - t0) / 1000) * FPS);
        if (s !== last && frame(Math.min(s, nSteps)) >= 1) { finish(); return; }
        requestAnimationFrame(tick);
      };
      frame(0);
      requestAnimationFrame(tick);
    });
  }
  clear() {
    this.id++;
    if (this.fin) this.fin();
    this.cv?.remove();
    if (this.c) { clearParts(this.c); this.c.kind = null; }
  }
}

const screen = new Stage(70, true);
const tabStage = new Stage(5, false);
const app = () => document.getElementById('app');

export const tx = {
  /** Fill the screen with bubbling lab liquid; resolves once covered (the overlay stays up). */
  cover(o = {}) { return screen.run(app(), 'in', o); },
  /** Drain it away; resolves when gone. */
  reveal(o = {}) { return screen.run(app(), 'out', o); },
  /** Drop the overlay at once. */
  clear() { screen.clear(); },
  get covering() { return !!screen.cv?.parentNode; },
};

// the short, lighter tab version (~0.4s in all)
const TAB = { speed: 0.32, lite: true, vol: 0.6 };

/**
 * Tab switch over the panel area of `host` (rect in host px). Resolves when the
 * panel is covered (swap the content then); the drain then plays by itself.
 */
export function tabSwap(host, rect, tab, dir = 1, before = null) {
  const p = tabStage.run(host, 'in', { ...TAB, rect, before });
  const my = tabStage.id;
  return p.then(() => {
    // a newer switch took over the stage: it plays its own drain
    if (tabStage.id === my) tabStage.run(host, 'out', { ...TAB, rect, before });
  });
}
export function clearTabSwap() { tabStage.clear(); }
