// Hand-pixeled 2D background life + in-world ad billboards.
//
//   * Sprites (flowers, bushes, mushrooms, butterflies, birds, bats, bunnies, background people, penguins,
//     crabs, cacti, signs, clouds) are painted on a fine grid and shaded in pixart.js (hue-shifted ramps,
//     rim light, selective outline), packed into one NearestFilter atlas and drawn as camera-facing
//     instanced quads (one draw per layer, alpha-cut, fogged), animated with 2-frame flaps / hops / waves.
//   * Ad boards: a voxel billboard frame with 128x64 hand-pixeled posters that roll between 2-3 parody
//     ads (text is always level with the board: the roll is a plain vertical UV scroll).
//
//   addSpriteLife(K, preset, { x, frontZ, backZ, ... })    battle arenas (see atmos.js DECO)
//   addAdBoard(K, { x, z, ry, ads: ['feast', 'news', 'lab'] })
//   SpriteLayer / spriteRect(name) / adTexture(list)      low level (Beast Island, island/decor2d.js)
import * as THREE from 'three';
import { VoxGrid } from '../../core/voxel.js';
import { mulberry32 } from '../../core/util.js';
import { pixelGlyph } from '../props/common.js';
import { buildSprites, posterArt, ramp, textW, INK } from './pixart.js';
import { Billboards } from '../island/sky.js';

export { INK };

// ------------------------------------------------------------------ atlas (hi-res shaded sprites, see pixart.js)
const AW = 512, AH = 512, DENS = 4; // atlas px per caller "pixel" (callers pass sizes on the coarse 1/4 grid)
let atlas = null;
const RECTS = {};
function blit(data, DW, s, ox, oy) {
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const c = s.px[y * s.w + x];
    if (c < 0) continue;
    const i = ((oy + y) * DW + ox + x) * 4;
    data[i] = (c >> 16) & 255; data[i + 1] = (c >> 8) & 255; data[i + 2] = c & 255; data[i + 3] = 255;
  }
}
const nearestTex = (canvas) => {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
function buildAtlas() {
  const S = buildSprites();
  const c = document.createElement('canvas');
  c.width = AW; c.height = AH;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(AW, AH);
  let cx = 0, cy = 0, rowH = 0;
  for (const n of Object.keys(S).sort((p, q) => S[q].h - S[p].h)) { // shelf packing, tallest first
    const s = S[n];
    if (cx + s.w > AW) { cx = 0; cy += rowH + 1; rowH = 0; }
    if (cy + s.h > AH) { console.warn('sprite atlas full', n); continue; }
    blit(img.data, AW, s, cx, cy);
    RECTS[n] = { u0: cx / AW, v0: 1 - (cy + s.h) / AH, du: s.w / AW, dv: s.h / AH, w: s.w / DENS, h: s.h / DENS };
    cx += s.w + 1; rowH = Math.max(rowH, s.h);
  }
  ctx.putImageData(img, 0, 0);
  return nearestTex(c);
}
export function spriteAtlas() { return (atlas ||= buildAtlas()); }
export function spriteRect(name) { spriteAtlas(); return RECTS[name] ?? RECTS.daisy; }

/** Instanced camera-facing pixel sprites sharing the atlas (bottom-anchored). */
export class SpriteLayer extends Billboards {
  constructor(count, o = {}) {
    super(count, { map: spriteAtlas(), anchorBottom: true, name: o.name ?? 'sprites2d', color: o.tint ?? 0xffffff, fog: o.fog ?? true });
    this.px = o.px ?? 0.05;
  }
  /** Place sprite `name` (pixel size p world units) with its feet at (x, y, z). */
  put(i, name, x, y, z, p = this.px, flip = false, fade = 1) {
    const r = spriteRect(name); // r.w / r.h on the coarse grid: world size = r.w * p
    this._p.set(x, y, z);
    this._s.set(r.w * p, r.h * p, 1);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    if (flip) this.frame.setXYZW(i, r.u0 + r.du, r.v0, -r.du, r.dv);
    else this.frame.setXYZW(i, r.u0, r.v0, r.du, r.dv);
    this.fade.setX(i, fade);
  }
}

// ------------------------------------------------------------------ battle-arena life presets
// static: [sprite names...] scattered; movers: flyers (butterflies / bats), birds (sky), hoppers, wavers (people)
export const LIFE = {
  meadow: { flowers: ['daisy', 'tulip', 'rose', 'daisyPink', 'tulipRed'], bushes: ['bush'], flyers: ['fly', 'flyBlue', 'flyYellow'], birds: 'bird', hoppers: ['bun', 'bunBrown'], people: ['manRed', 'manBlue', 'manLab', 'manPink'] },
  lab: { flowers: ['daisy', 'tulip', 'rose', 'tulipBlue'], bushes: ['bush'], flyers: ['fly', 'flyBlue'], birds: 'bird', hoppers: ['bun'], people: ['manLab', 'manLab', 'manBlue'] },
  candy: { flowers: ['rose', 'daisyPink', 'tulip'], bushes: ['candyBush'], flyers: ['fly', 'flyYellow'], birds: 'bird', hoppers: ['bun'], people: ['manPink', 'manRed'] },
  jungle: { flowers: ['tulipRed', 'rose', 'tulip'], bushes: ['bush'], extras: ['mushroom'], flyers: ['flyBlue', 'flyYellow'], birds: 'parrot', hoppers: [], people: [] },
  spooky: { flowers: [], bushes: ['bushDark'], extras: ['mushroom', 'shroomBlue'], flyers: [], birds: 'bat', hoppers: [], people: [] },
  sand: { flowers: ['tulipRed', 'daisy'], bushes: [], extras: ['cactus'], flyers: ['flyYellow'], birds: 'birdDark', hoppers: [], people: ['manRed', 'manBlue'] },
  snow: { flowers: [], bushes: [], extras: ['penguin'], flyers: [], birds: 'bird', hoppers: [], people: [] },
  beach: { flowers: ['tulipRed'], bushes: ['bush'], extras: [], flyers: [], birds: 'bird', hoppers: [], crabs: true, people: ['manRed', 'manBlue'] },
  sky: { flowers: [], bushes: [], flyers: [], birds: 'bird', hoppers: [], people: [] },
};

/**
 * Scatter + animate 2D life around a battle lane. o: { seed, x: [x0, x1], frontZ, backZ, n: { flowers, bushes, flyers, birds,
 * hoppers, people, clouds }, sign: word, signs: [[x, z]], tint, clouds (bool), groundY }
 * One draw call. Keeps everything in the front strip below ~0.4 tall.
 */
export function addSpriteLife(K, preset, o = {}) {
  const P = LIFE[preset] ?? LIFE.meadow;
  const R = mulberry32((o.seed ?? 7) * 4099 + 11);
  const [xa, xb] = o.x ?? [-30, 30];
  const fz = o.frontZ ?? [3.0, 11], bz = o.backZ ?? [-10, -3.6];
  const N = { flowers: 46, bushes: 10, flyers: 7, birds: 5, hoppers: 3, people: 7, clouds: 3, ...(o.n ?? {}) };
  const y0 = o.groundY ?? 0;
  const pads = (x, z) => Math.abs(Math.abs(x) - 12) < 3.4 && z > -3.6 && z < 2.8;
  const rx = () => xa + R() * (xb - xa);
  const zIn = ([a, b]) => a + R() * (b - a);
  const stat = [], movers = [];
  // static ground sprites: flowers (front + back), bushes / extras (back), signs, people (far back)
  if (P.flowers.length) for (let i = 0; i < N.flowers; i++) {
    const front = i < N.flowers * 0.6, x = rx(), z = zIn(front ? fz : bz);
    if (pads(x, z) || (o.ok && !o.ok(x, z))) continue;
    stat.push([P.flowers[Math.floor(R() * P.flowers.length)], x, y0, z, front ? 0.042 : 0.05, R() < 0.5]);
  }
  const backs = [...P.bushes, ...(P.extras ?? [])];
  if (backs.length) for (let i = 0; i < N.bushes; i++) {
    const x = rx(), z = zIn([bz[0], bz[1] - 0.6]);
    if (pads(x, z) || (o.ok && !o.ok(x, z))) continue;
    const nm = backs[Math.floor(R() * backs.length)];
    stat.push([nm, x, y0, z, nm === 'penguin' || nm === 'cactus' ? 0.07 : 0.055, R() < 0.5]);
  }
  for (const [x, z] of o.signs ?? []) if (o.sign) stat.push(['sign:' + o.sign, x, y0, z, 0.06, false]);
  // movers
  for (let i = 0; i < (P.people?.length ? N.people : 0); i++) {
    const x = rx(), z = zIn(o.peopleZ ?? [-14, -10.5]);
    if (o.ok && !o.ok(x, z)) continue;
    movers.push({ kind: 'wave', name: P.people[i % P.people.length], x, z, y: y0, p: 0.055, ph: R() * 6, rate: 0.6 + R() * 0.8, flip: R() < 0.5 });
  }
  for (let i = 0; i < (P.flyers.length ? N.flyers : 0); i++) {
    const front = i % 2 === 0;
    movers.push({ kind: 'fly', name: P.flyers[i % P.flyers.length], x: rx(), z: zIn(front ? [fz[0] + 0.6, fz[1]] : bz), y: 0.3 + R() * 0.6, p: front ? 0.04 : 0.05, ph: R() * 20, sp: 0.4 + R() * 0.4, r: 1.2 + R() * 1.8 });
  }
  if (P.birds) for (let i = 0; i < N.birds; i++) {
    movers.push({ kind: 'bird', name: P.birds, x: rx(), z: -16 - R() * 14, y: 6 + R() * 5, p: 0.09 + R() * 0.04, ph: R() * 6, sp: (R() < 0.5 ? -1 : 1) * (1.6 + R() * 1.4), span: xb - xa + 30 });
  }
  for (let i = 0; i < (P.hoppers?.length ? N.hoppers : 0); i++) {
    movers.push({ kind: 'hop', name: P.hoppers[i % P.hoppers.length], x: rx(), z: zIn([bz[0] + 1, bz[1]]), y: y0, p: 0.045, ph: R() * 10, sp: (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.5), span: xb - xa });
  }
  if (P.crabs) for (let i = 0; i < 4; i++) movers.push({ kind: 'crab', name: 'crab', x: rx(), z: zIn(bz), y: y0, p: 0.045, ph: R() * 10, sp: 0.5 + R() * 0.4 });
  if (o.clouds) for (let i = 0; i < N.clouds; i++) movers.push({ kind: 'cloud', name: 'cloud', x: rx() * 2, z: -40 - R() * 15, y: 13 + R() * 6, p: 0.3 + R() * 0.12, sp: 0.25 + R() * 0.2, span: (xb - xa) * 3 });
  const L = new SpriteLayer(stat.length + movers.length, { tint: o.tint });
  stat.forEach((s, i) => L.put(i, s[0], s[1], s[2], s[3], s[4], s[5]));
  const off = stat.length;
  const wrap = (v, span) => ((v % span) + span * 1.5) % span - span / 2;
  const step = (t, dt = 0) => {
    movers.forEach((m, k) => {
      const i = off + k;
      if (m.kind === 'wave') {
        const up = Math.sin(t * m.rate * 3 + m.ph) > 0.2 && Math.sin(t * 0.35 + m.ph) > -0.2;
        L.put(i, m.name + (up ? 'B' : 'A'), m.x, m.y, m.z, m.p, m.flip);
      } else if (m.kind === 'fly') {
        const a = t * m.sp + m.ph;
        const x = m.x + Math.sin(a) * m.r, z = m.z + Math.sin(a * 1.7) * 0.5, y = m.y + Math.abs(Math.sin(a * 2.3)) * 0.35;
        L.put(i, m.name + (Math.sin(t * 22 + m.ph) > 0 ? 'A' : 'B'), x, y, z, m.p, Math.cos(a) < 0);
      } else if (m.kind === 'bird') {
        const x = wrap(m.x + t * m.sp, m.span), y = m.y + Math.sin(t * 0.8 + m.ph) * 0.4;
        L.put(i, m.name + (Math.sin(t * 9 + m.ph) > 0 ? 'A' : 'B'), x, y, m.z, m.p, m.sp < 0);
      } else if (m.kind === 'hop') {
        // hop a few times, then sit and look around
        const cyc = (t * 0.5 + m.ph) % 4, moving = cyc < 2.2;
        const hop = moving ? Math.abs(Math.sin(cyc * Math.PI * 2.5)) : 0;
        m.x2 = (m.x2 ?? m.x) + (moving ? m.sp * Math.min(dt, 0.1) : 0);
        if (Math.abs(m.x2) > m.span / 2) m.sp = -m.sp, m.x2 = Math.sign(m.x2) * m.span / 2;
        L.put(i, m.name + (hop > 0.25 ? 'B' : 'A'), m.x2, m.y + hop * 0.22, m.z, m.p, m.sp < 0);
      } else if (m.kind === 'crab') {
        const x = m.x + Math.sin(t * m.sp + m.ph) * 1.5;
        L.put(i, 'crab' + (Math.sin(t * 8 + m.ph) > 0 ? 'A' : 'B'), x, m.y, m.z, m.p);
      } else if (m.kind === 'cloud') {
        L.put(i, 'cloud', wrap(m.x + t * m.sp, m.span), m.y, m.z, m.p);
      }
    });
    L.commit();
  };
  step(0);
  if (movers.length) K.onUpdate((dt, t) => step(t, dt));
  else L.commit();
  K.add(L.mesh);
  return L;
}

// ------------------------------------------------------------------ ad posters (128 x 64 each, hand-pixeled)
const AD_W = 128, AD_H = 64;
const BAY4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function poster(data, oy) {
  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= AD_W || y >= AD_H) return;
    const i = ((oy + y) * AD_W + x) * 4;
    data[i] = (c >> 16) & 255; data[i + 1] = (c >> 8) & 255; data[i + 2] = c & 255; data[i + 3] = 255;
  };
  const rect = (x, y, w, h, c) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) put(xx, yy, c); };
  const D = {
    rect, put,
    /** vertical colour bands, seams broken with an ordered-dither row pair (no smooth gradient) */
    bands(cols) {
      const n = cols.length;
      for (let y = 0; y < AD_H; y++) for (let x = 0; x < AD_W; x++) {
        const f = (y / AD_H) * n, k = Math.min(n - 1, Math.floor(f)), fr = f - k;
        const up = k < n - 1 && fr > 0.8 && BAY4[(y & 3) * 4 + (x & 3)] / 16 < (fr - 0.8) * 5;
        put(x, y, cols[up ? k + 1 : k]);
      }
    },
    /** sunburst rays around (cx, cy) */
    rays(cx, cy, a, b, n = 14) { for (let y = 0; y < AD_H; y++) for (let x = 0; x < AD_W; x++) { const t = (Math.atan2(y - cy, x - cx) / (Math.PI * 2) + 1) * n; put(x, y, Math.floor(t) % 2 ? a : b); } },
    dots(c, step = 6) { for (let y = 2; y < AD_H; y += step) for (let x = ((y / step) & 1) * (step >> 1) + 2; x < AD_W; x += step) { put(x, y, c); put(x + 1, y, c); put(x, y + 1, c); put(x + 1, y + 1, c); } },
    hazard(y, h) { for (let yy = y; yy < y + h; yy++) for (let x = 0; x < AD_W; x++) put(x, yy, ((x + yy) >> 3) & 1 ? INK : 0xffd23f); },
    /** shaded lettering: drop shadow + ink outline, lit top row, shaded bottom row per font pixel */
    text(str, x, y, sc, col, o = {}) {
      const tw = textW(str, sc), th = 7 * sc, m = new Uint8Array((tw + 2) * (th + 2));
      let cx = 0;
      for (const ch of str) {
        const g = pixelGlyph(ch), off = g.length > 5 ? -sc : 0;
        g.forEach((row, gy) => [...row].forEach((b, gx) => { if (b === '#') for (let a = 0; a < sc; a++) for (let q = 0; q < sc; q++) { const yy = gy * sc + q + off + sc; if (yy >= 0 && yy < th) m[yy * (tw + 2) + cx + gx * sc + a] = 1 + (q === 0 ? 1 : 0) + (q === sc - 1 && sc > 2 ? 2 : 0); } }));
        cx += (g[0].length + 1) * sc;
      }
      const at = (xx, yy) => (xx >= 0 && yy >= 0 && xx < tw + 2 && yy < th + 2 ? m[yy * (tw + 2) + xx] : 0);
      const R = ramp(col), y0 = y - sc;
      // small lettering stays clean: sc 1 plain, sc 2 drop shadow only, sc 3+ shadow + full outline
      const sh = sc >= 3 ? 2 : 1;
      if (o.shadow !== false && sc > 1) for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++) if (at(xx, yy)) { put(x + xx + sh - 1, y0 + yy + sh, o.ink ?? INK); put(x + xx + sh, y0 + yy + sh, o.ink ?? INK); }
      if (sc >= 3) for (let yy = -1; yy <= th; yy++) for (let xx = -1; xx <= tw; xx++) {
        if (at(xx, yy)) continue;
        if (at(xx - 1, yy) || at(xx + 1, yy) || at(xx, yy - 1) || at(xx, yy + 1)) put(x + xx, y0 + yy, o.ink ?? INK);
      }
      for (let yy = 0; yy < th; yy++) for (let xx = 0; xx < tw; xx++) { const v = at(xx, yy); if (v) put(x + xx, y0 + yy, v === 2 ? R[3] : v === 3 ? R[1] : col); }
    },
    center(str, y, sc, col, o) { D.text(str, Math.round((AD_W - textW(str, sc)) / 2), y, sc, col, o); },
    art(name, x, y, w, h) { const s = posterArt(name, w, h); for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) { const c = s.px[yy * s.w + xx]; if (c >= 0) put(x + xx, y + yy, c); } },
  };
  return D;
}
const ADS = {
  // Feastables-style chocolate bar
  feast(D) {
    D.rays(98, 40, 0x2b8cf2, 0x4aa4ff);
    D.text('FEASTIES', 7, 7, 2, 0xffffff);
    D.text('NEW!', 7, 28, 2, 0xffd23f);
    D.text('NOM NOM', 7, 47, 1, 0xff8ac4);
    D.art('bar', 66, 26, 52, 32);
  },
  news(D) {
    D.rect(0, 0, AD_W, AD_H, 0x15121f); D.dots(0x221c3a, 6);
    D.rect(0, 0, AD_W, 17, 0xd8243a); D.rect(0, 0, AD_W, 2, 0xff5a6a); D.rect(0, 16, AD_W, 1, 0x8a0a1e);
    D.center('BEAST NEWS', 4, 2, 0xffffff, { ink: 0x5a0614 });
    D.art('tv', 6, 25, 36, 32);
    D.text('SWARM', 50, 25, 2, 0xffd23f);
    D.text('SPOTTED', 50, 43, 2, 0xffffff);
    D.rect(101, 22, 22, 11, 0xf23a4a); D.rect(101, 22, 22, 1, 0xff8a90);
    D.text('LIVE', 104, 25, 1, 0xffffff, { shadow: false });
  },
  lab(D) {
    D.bands([0xffffff, 0xf0f6ff, 0xdcecff]);
    D.rect(0, 52, AD_W, 12, 0x29b6f6); D.rect(0, 52, AD_W, 1, 0x8fd4ff);
    D.text('LAB', 8, 7, 4, 0x29b6f6);
    D.text('NEEDS YOU', 8, 35, 2, 0x2a2440, { shadow: false });
    D.text('JOIN NOW', 8, 55, 1, 0xffffff);
    D.art('flask', 84, 14, 32, 32);
  },
  alert(D) {
    D.rect(0, 0, AD_W, AD_H, 0xffd23f); D.dots(0xf0c030, 5);
    D.hazard(0, 6); D.hazard(58, 6);
    D.art('bug', 8, 16, 34, 30);
    D.text('SWARM', 48, 14, 3, 0xffffff);
    D.text('ALERT!', 48, 37, 2, 0xf23a4a);
    D.text('STAY IN', 48, 50, 1, 0x2a2440, { shadow: false });
  },
  burger(D) {
    D.rays(98, 36, 0xff8a1f, 0xffa040);
    D.text('BEAST', 7, 8, 2, 0xffffff);
    D.text('BURGER', 7, 25, 2, 0xffffff);
    D.text('$1', 7, 44, 3, 0xffd23f);
    D.art('burger', 80, 20, 34, 30);
  },
  cash(D) {
    D.bands([0x2e9a36, 0x23803a, 0x1a6a2e]); D.dots(0x3aa840, 8);
    D.center('WIN $1M', 7, 3, 0xffd23f);
    D.center('LAST ONE IN', 31, 2, 0xffffff);
    D.center('WINS', 47, 2, 0xffffff);
  },
  sale(D) {
    D.rect(0, 0, AD_W, AD_H, 0xffffff); D.dots(0xffe0ee, 6);
    D.rect(0, 0, AD_W, 17, 0xff2e88); D.rect(0, 0, AD_W, 2, 0xff8ac4); D.rect(0, 16, AD_W, 1, 0xa0125e);
    D.center('BEAST MART', 4, 2, 0xffffff, { ink: 0x6a0a3a });
    D.text('50%', 7, 24, 4, 0xff2e88);
    D.text('OFF', 60, 26, 2, 0x2a2440);
    D.text('ALL', 60, 44, 2, 0x2a2440);
    D.art('cart', 90, 30, 34, 26);
  },
};
export const AD_NAMES = Object.keys(ADS);

const adCache = new Map();
/** Stacked poster texture (ads top to bottom); addAdBoard rolls through it. */
export function adTexture(list) {
  const key = list.join(',');
  let tex = adCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = AD_W; c.height = AD_H * list.length;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(AD_W, AD_H * list.length);
    list.forEach((n, i) => {
      const D = poster(img.data, i * AD_H);
      (ADS[n] ?? ADS.news)(D);
      // panel edge: ink line + a 1px lit bevel inside
      D.rect(0, 0, AD_W, 1, INK); D.rect(0, AD_H - 1, AD_W, 1, INK); D.rect(0, 0, 1, AD_H, INK); D.rect(AD_W - 1, 0, 1, AD_H, INK);
      D.rect(1, 1, AD_W - 2, 1, 0xffffff); D.rect(1, 1, 1, AD_H - 2, 0xffffff);
    });
    ctx.putImageData(img, 0, 0);
    tex = nearestTex(c);
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1 / list.length);
    adCache.set(key, tex);
  }
  return tex;
}


/** Board frame: dark steel posts, a catwalk and two lamps, board face on +z at y in [legH, legH + h]. Voxel size v. */
function adFrameGrid(wv, hv, legH) {
  const g = new VoxGrid();
  const x0 = -Math.floor(wv / 2) - 1, x1 = x0 + wv + 1;
  g.box(x0, legH - 1, -1, x1, legH + hv, 0, 0x2a2440); // backing + frame
  g.box(x0, legH + hv, -1, x1, legH + hv, 0, 0x3a3458);
  for (const lx of [x0 + 3, x1 - 4]) g.box(lx, 0, -2, lx + 1, legH - 2, -1, 0x4e5878);
  g.box(x0 + 1, legH - 2, 0, x1 - 1, legH - 2, 2, 0x5d6476); // catwalk
  for (const lx of [x0 + 6, x1 - 7]) { g.box(lx, legH - 1, 2, lx, legH - 1, 3, 0x5d6476); g.set(lx, legH, 3, 0xfff2c0, true); }
  return g;
}

/**
 * In-world ad billboard that rolls between `ads` (2-3 names from AD_NAMES). o: { x, y, z, ry, w (world), legH (world),
 * ads, hold (s), roll (s), ph, parent, scale (frame voxel), dim }
 */
export function addAdBoard(K, o = {}) {
  const ads = o.ads ?? ['feast', 'news', 'lab'];
  const w = o.w ?? 5.2, h = w / 2, legH = o.legH ?? 2.2, v = o.scale ?? 0.1;
  const g = new THREE.Group();
  g.name = 'adBoard';
  g.position.set(o.x ?? 0, o.y ?? 0, o.z ?? -15);
  g.rotation.y = o.ry ?? 0;
  const wv = Math.round(w / v), hv = Math.round(h / v), lv = Math.round(legH / v);
  K.mesh('adFrame' + wv + '_' + lv, () => adFrameGrid(wv, hv, lv), { scale: v, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { parent: g, shadow: !!o.shadow });
  const tex = adTexture(ads).clone(); // own offset per board
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true });
  mat.color.setScalar(o.dim ?? 0.94);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(wv * v, hv * v), mat);
  face.position.set(0, (lv + hv / 2) * v, v + 0.012);
  face.name = 'adFace';
  g.add(face);
  (o.parent ?? K.root).add(g);
  const n = ads.length, hold = o.hold ?? 4.5, roll = o.roll ?? 0.55, ph = o.ph ?? 0;
  const ease = (x) => x * x * (3 - 2 * x);
  const upd = (t) => {
    const T = (t + ph) / (hold + roll), k = Math.floor(T), f = (T - k) * (hold + roll);
    const pos = k + (f > hold ? ease((f - hold) / roll) : 0);
    tex.offset.y = 1 - ((pos % n) + 1) / n; // RepeatWrapping makes the last -> first roll seamless
  };
  upd(0);
  if (o.updaters) o.updaters.push((dt, t) => upd(t)); else K.onUpdate?.((dt, t) => upd(t));
  return g;
}
