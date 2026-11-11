// Hand-pixeled 2D background life + in-world ad billboards.
//
//   * SPRITES: tiny ascii-art pixel sprites (flowers, bushes, mushrooms, butterflies, birds, bats, bunnies,
//     background people, penguins, crabs, cacti, signs, clouds) packed into one NearestFilter atlas with
//     the UI icons' 1px dark outline (src/ui/icons.js INK_LO, corners left open). Drawn as camera-facing
//     instanced quads (one draw per layer, alpha-cut, fogged), animated with 2-frame flaps / hops / waves.
//   * Ad boards: a voxel billboard frame with a 64x32 hand-pixeled poster canvas that rolls between
//     2-3 parody ads (text is always level with the board: the roll is a plain vertical UV scroll).
//
//   const L = addSpriteLife(K, preset, { x, frontZ, backZ, ... })    battle arenas (see atmos.js DECO)
//   addAdBoard(K, { x, z, ry, ads: ['feast', 'news', 'lab'] })
//   makeSpriteLayer(n, o) / spriteRect(name) / adTexture(list)       low level (Beast Island)
import * as THREE from 'three';
import { VoxGrid } from '../../core/voxel.js';
import { mulberry32 } from '../../core/util.js';
import { pixelGlyph } from '../props/common.js';
import { Billboards } from '../island/sky.js';

export const INK = 0x1b1530;

// ------------------------------------------------------------------ sprite art
// '.' empty; palette letters below (per-sprite overrides via pal). Outline is added automatically.
const BASE_PAL = {
  k: INK, w: 0xffffff, W: 0xd8dcec, e: 0x8a92b0, E: 0x4e5878, y: 0xffd23f, Y: 0xe08a1a, p: 0xff6fb8, P: 0xc02a78,
  r: 0xf23a4a, R: 0xa01a2a, g: 0x3cb43a, G: 0x23803a, l: 0x8ee05a, b: 0xa0602e, B: 0x653818, s: 0xf2c4a2, S: 0xc88a6a,
  c: 0x8fd4ff, C: 0x2b8cf2, o: 0xff8a1f, v: 0x6a4a9a, V: 0x3a2a5a, m: 0x7af0c8, h: 0x6a3a1e, t: 0xf23a4a, j: 0x3a5ab8,
};
const ART = {
  daisy: ['.w.w.', 'wwyww', '.www.', '..g..', '.lg..', '..gl.', '..g..'],
  tulip: ['y.y.y', 'yyyyy', 'YyyyY', '.YyY.', '..g..', 'lg...', '..gl.', '..g..'],
  rose: ['.pPp.', 'ppPpp', 'Ppppp', '.pPp.', '..g..', '.lg..', '..g..', '..gl.', '..g..'],
  bush: ['....llll....', '..lllgll.l..', '.llgglllllll', 'lllgggrgglll', 'llggggggglgl', 'lgggGggrgggl', 'gggGGgggGggg', '.gGGGGGGGGg.'],
  mushroom: ['..rrr..', '.rwrrr.', 'rrrrrwr', 'RRRRRRR', '..wWw..', '..wWw..', '..WWW..'],
  flyA: ['pp...pp', 'pppkppp', '.pPkPp.', 'pp.k.pp', 'p..k..p'],
  flyB: ['...k...', '.ppkpp.', '.pPkPp.', '..pkp..', '...k...'],
  birdA: ['WW.....WW', '.WW...WW.', '..WWwWW..', '....wy...'],
  birdB: ['.........', '..WWwWW..', '.WW.wyWW.', 'WW.....WW'],
  batA: ['v.......v', 'vv.VkV.vv', '.vvvvvvv.', '..v...v..'],
  batB: ['...VkV...', '.vvvvvvv.', 'vv.....vv', 'v.......v'],
  bunA: ['......w.w.', '......wpwp', '.....wwww.', '.wwwwwwkw.', 'wwwwwwwwwp', 'wwwwwwwww.', '.WWwwwWW..', '.WW...WW..'],
  bunB: ['.......w.w', '.......wpw', '......wwww', 'wwwwwwwwkw', '.wwwwwwwww', '..WWWWWW..', '.W......W.', 'W........W'],
  manA: ['..hhh..', '.hhhhh.', '.hsss..', '..sks..', '..sss..', '..ttt..', '.ttttt.', 't.ttt.t', 's.ttt.s', '..ttt..', '..jjj..', '..j.j..', '..j.j..', '..k.k..'],
  manB: ['..hhh.s', '.hhhhhs', '.hsss.t', '..sks.t', '..ssst.', '..ttt..', '.tttt..', 't.ttt..', 's.ttt..', '..ttt..', '..jjj..', '..j.j..', '..j.j..', '..k.k..'],
  penguin: ['..kkk..', '.kkwkk.', '.kwwwko', 'kkwwwkk', 'kkwwwkk', '.kwwwk.', '.kwwwk.', '..www..', '.oo.oo.'],
  crabA: ['r.......r', 'rr.k.k.rr', '.rrrrrrr.', 'rrRRRRRrr', '.r.r.r.r.'],
  crabB: ['.r.....r.', 'rr.k.k.rr', '.rrrrrrr.', 'rrRRRRRrr', 'r.r.r.r.r'],
  cactus: ['...gg...', '..gglg..', '..gglg.g', 'g.gglg.g', 'g.gglggg', 'gggglg..', '..gglg..', '..gglg..', '..GGGG..'],
  cloud: [
    '........wwww............', '......wwwwwwww....ww.....', '..wwwwwwwwwwwwwwwwwwww...', '.wwwwwwwwwwwwwwwwwwwwwww.',
    'wwwwwwwwwwwwwwwwwwwwwwwww', 'wwwwwwwwwwwwwwwwwwwwwwwww', '.cWWwwwWcWwwwwwWWcwwwWWc.', '..cccccccccccccccccccccc..',
  ],
};
// per-sprite palette tweaks + outline colour (clouds get a soft blue outline, like the icons' tinted lit-side rim)
const VARIANTS = {
  manRedA: ['manA', { t: 0xf23a4a }], manRedB: ['manB', { t: 0xf23a4a }],
  manBlueA: ['manA', { t: 0x29b6f6, h: 0xffd23f }], manBlueB: ['manB', { t: 0x29b6f6, h: 0xffd23f }],
  manLabA: ['manA', { t: 0xf4f8ff, h: 0x2a2a3a, j: 0x4e5878 }], manLabB: ['manB', { t: 0xf4f8ff, h: 0x2a2a3a, j: 0x4e5878 }],
  manPinkA: ['manA', { t: 0xff4fa3, h: 0xa0602e, s: 0xc88a6a }], manPinkB: ['manB', { t: 0xff4fa3, h: 0xa0602e, s: 0xc88a6a }],
  flyBlueA: ['flyA', { p: 0x7ae8ff, P: 0x2b8cf2 }], flyBlueB: ['flyB', { p: 0x7ae8ff, P: 0x2b8cf2 }],
  flyYellowA: ['flyA', { p: 0xffe46a, P: 0xff8a1f }], flyYellowB: ['flyB', { p: 0xffe46a, P: 0xff8a1f }],
  bunBrownA: ['bunA', { w: 0xc89060, W: 0x8a5a30 }], bunBrownB: ['bunB', { w: 0xc89060, W: 0x8a5a30 }],
  birdDarkA: ['birdA', { W: 0x4e5878, w: 0x8a92b0 }], birdDarkB: ['birdB', { W: 0x4e5878, w: 0x8a92b0 }],
  parrotA: ['birdA', { W: 0xf23a4a, w: 0xffd23f, y: 0xffe46a }], parrotB: ['birdB', { W: 0xf23a4a, w: 0xffd23f, y: 0xffe46a }],
  daisyPink: ['daisy', { w: 0xff8ac4 }], tulipRed: ['tulip', { y: 0xf23a4a, Y: 0xa01a2a }], tulipBlue: ['tulip', { y: 0x8fd4ff, Y: 0x2b8cf2 }],
  shroomBlue: ['mushroom', { r: 0x7a5aff, R: 0x3a2a8a }], bushDark: ['bush', { l: 0x6a8a5a, g: 0x3e5a3a, G: 0x26382a, r: 0x9a7aff }],
  candyBush: ['bush', { l: 0xffc8e8, g: 0xff8ac4, G: 0xc0407a, r: 0x7af0c8 }],
};
const OUTLINE = { cloud: 0x7a8ab8 };

// signs: a post + a plank with a short word (3x5 font), generated as art rows
function signArt(word) {
  const gw = [...word].reduce((a, ch) => a + pixelGlyph(ch)[0].length + 1, -1);
  const W = gw + 4, rows = [];
  rows.push('.' + 'b'.repeat(W - 2) + '.');
  const line = Array.from({ length: 5 }, () => ['b', 'w'].concat(Array(gw).fill('w')).concat(['w', 'b']));
  let cx = 2;
  for (const ch of word) {
    const g = pixelGlyph(ch);
    g.forEach((r, y) => { if (y < 5) [...r].forEach((c, x) => { if (c === '#') line[y][cx + x] = 'k'; }); });
    cx += g[0].length + 1;
  }
  for (const l of line) rows.push(l.join(''));
  rows.push('B' + 'b'.repeat(W - 2) + 'B');
  const mid = Math.floor(W / 2);
  for (let i = 0; i < 4; i++) rows.push('.'.repeat(mid - 1) + 'bB' + '.'.repeat(W - mid - 1));
  return rows;
}

// ------------------------------------------------------------------ atlas
const AW = 256, AH = 128;
let atlas = null;
const RECTS = {};
function rasterise(rows, pal, outline) {
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const W = w + 2, H = h + 2, px = new Array(W * H).fill(-1);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.' && ch !== ' ' && pal[ch] !== undefined) px[(y + 1) * W + x + 1] = pal[ch]; }));
  // 1px outline, 4-connected only (diagonal corners stay open, like hand-placed outlines)
  const out = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (px[y * W + x] >= 0) continue;
    const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && px[yy * W + xx] >= 0;
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) out[y * W + x] = outline;
  }
  return { w: W, h: H, px: out };
}
function buildAtlas(extraSigns = []) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.canvas.width = AW; ctx.canvas.height = AH;
  const img = ctx.createImageData(AW, AH);
  let cx = 0, cy = 0, rowH = 0;
  const put = (name, rows, pal, outline) => {
    const S = rasterise(rows, pal, outline);
    if (cx + S.w > AW) { cx = 0; cy += rowH + 1; rowH = 0; }
    if (cy + S.h > AH) return; // atlas full (never at the current art size)
    for (let y = 0; y < S.h; y++) for (let x = 0; x < S.w; x++) {
      const c = S.px[y * S.w + x];
      if (c < 0) continue;
      const i = ((cy + y) * AW + cx + x) * 4;
      img.data[i] = (c >> 16) & 255; img.data[i + 1] = (c >> 8) & 255; img.data[i + 2] = c & 255; img.data[i + 3] = 255;
    }
    RECTS[name] = { u0: cx / AW, v0: 1 - (cy + S.h) / AH, du: S.w / AW, dv: S.h / AH, w: S.w, h: S.h };
    cx += S.w + 1; rowH = Math.max(rowH, S.h);
  };
  for (const [k, rows] of Object.entries(ART)) put(k, rows, BASE_PAL, OUTLINE[k] ?? INK);
  for (const [k, [src, over]] of Object.entries(VARIANTS)) put(k, ART[src], { ...BASE_PAL, ...over }, INK);
  for (const word of ['LAB', 'FANS', 'SWEET', 'GO', 'BOO', 'KEEP OUT', 'COLD', 'BEACH', 'SALE', 'DIG', 'HOT', ...extraSigns]) put('sign:' + word, signArt(word), BASE_PAL, INK);
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(ctx.canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
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
    const r = spriteRect(name);
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

// ------------------------------------------------------------------ ad posters (64 x 32 each)
const AD_W = 64, AD_H = 32;
function poster(ctx, oy) {
  const rect = (x, y, w, h, c) => { ctx.fillStyle = '#' + c.toString(16).padStart(6, '0'); ctx.fillRect(x, oy + y, w, h); };
  const dot = (x, y, c) => rect(x, y, 1, 1, c);
  const word = (s, x, y, c, sc = 1, shadow = INK) => {
    const draw = (ox, oy2, col) => {
      let cx = x;
      for (const ch of s) {
        const g = pixelGlyph(ch);
        g.forEach((r, gy) => [...r].forEach((b, gx) => { if (b === '#') rect(cx + gx * sc + ox, y + gy * sc + oy2, sc, sc, col); }));
        cx += (g[0].length + 1) * sc;
      }
    };
    if (shadow !== null) draw(1, 1, shadow);
    draw(0, 0, c);
  };
  const wordW = (s, sc = 1) => [...s].reduce((a, ch) => a + (pixelGlyph(ch)[0].length + 1) * sc, -sc);
  const center = (s, y, c, sc = 1, shadow) => word(s, Math.round((AD_W - wordW(s, sc)) / 2), y, c, sc, shadow);
  const art = (rows, x, y, pal) => rows.forEach((r, yy) => [...r].forEach((ch, xx) => { if (pal[ch] !== undefined) dot(x + xx, y + yy, pal[ch]); }));
  return { rect, dot, word, wordW, center, art };
}
const ADS = {
  // Feastables-style chocolate bar
  feast(D) {
    D.rect(0, 0, 64, 32, 0x2b8cf2);
    for (let y = 0; y < 32; y += 4) D.rect(0, y, 64, 1, 0x3a9cff);
    D.word('FEASTIES', 3, 3, 0xffffff, 1);
    D.word('NEW!', 4, 11, 0xffd23f, 1);
    D.word('YUM', 4, 23, 0xff6fb8, 1);
    // the bar: wrapper + chocolate grid poking out
    const bar = [
      '..kkkkkkkkkkkkkkkkkkkkkkkkk',
      '.kccccccccccccchhhhhhhhhhhk',
      'kcpppppppppppcchHhHhHhHhHhk',
      'kcpwwwwwpwwwpcchhhhhhhhhhhk',
      'kcpwkkwwpwkwpcchHhHhHhHhHhk',
      'kcpwwwwwpwwwpcchhhhhhhhhhhk',
      'kcpppppppppppcchHhHhHhHhHhk',
      '.kccccccccccccchhhhhhhhhhhk',
      '..kkkkkkkkkkkkkkkkkkkkkkkkk',
    ];
    D.art(bar, 22, 13, { k: INK, c: 0xff2e88, p: 0xffd23f, w: 0xffffff, h: 0x6a3a1e, H: 0x8a4a26 });
  },
  news(D) {
    D.rect(0, 0, 64, 32, 0x15121f);
    D.rect(0, 0, 64, 9, 0xf23a4a);
    D.word('BEAST NEWS', 3, 2, 0xffffff, 1, 0x7a0a1a);
    // tiny TV with a swarm blob on screen
    D.art([
      '.k...k...',
      '..k.k....',
      'kkkkkkkkk',
      'kcccccccsk',
      'kcgcggccsk',
      'kcgggggcsk',
      'kccgcgccsk',
      'kcccccccsk',
      'kkkkkkkkkk',
    ], 4, 13, { k: 0x8a92b0, c: 0x2a4a8a, g: 0x7cff3a, s: 0x4e5878 });
    D.word('SWARM', 18, 13, 0xffd23f, 1);
    D.word('SPOTTED', 18, 21, 0xffffff, 1);
    D.rect(52, 11, 10, 7, 0xf23a4a);
    D.word('LIVE', 53, 12, 0xffffff, 1, null);
  },
  lab(D) {
    D.rect(0, 0, 64, 32, 0xf4f8ff);
    D.rect(0, 27, 64, 5, 0x29b6f6);
    D.word('LAB', 4, 3, 0x29b6f6, 2);
    D.word('NEEDS YOU', 4, 16, 0x15121f, 1, null);
    // flask with bubbling slime
    D.art([
      '...kkkk...',
      '....kk....',
      '....kk....',
      '...k..k...',
      '..k.gg.k..',
      '.kggggggk.',
      'kgglggggk.',
      'kggggglggk',
      '.kkkkkkkk.',
    ], 48, 4, { k: INK, g: 0x7cff3a, l: 0xd8ffb0 });
    D.dot(52, 2, 0x7cff3a); D.dot(54, 0, 0x7cff3a);
    D.word('JOIN', 22, 28, 0xffffff, 1, null);
  },
  alert(D) {
    D.rect(0, 0, 64, 32, 0xffd23f);
    for (let x = -32; x < 64; x += 8) for (let y = 0; y < 4; y++) { D.rect(x + y, y, 4, 1, INK); D.rect(x + y, 28 + y, 4, 1, INK); }
    D.center('SWARM', 6, INK, 2, null);
    D.center('ALERT!', 19, 0xf23a4a, 1, INK);
  },
  burger(D) {
    D.rect(0, 0, 64, 32, 0xff8a1f);
    D.rect(0, 0, 64, 2, 0xffc06a);
    D.word('BEAST', 3, 4, 0xffffff, 1);
    D.word('BURGER', 3, 11, 0xffffff, 1);
    D.word('$1', 3, 21, 0xffd23f, 2);
    D.art([
      '....kkkkkkkk....',
      '..kkyyywyyyykk..',
      '.kyyyyyyyywyyyk.',
      'kyywyyyyyyyyyyyk',
      'kkkkkkkkkkkkkkkk',
      'kllllgllllllgllk',
      'krrrrrrrrrrrrrrk',
      'kbbbbbbbbbbbbbbk',
      'kBBBBBBBBBBBBBBk',
      '.kyyyyyyyyyyyyk.',
      '..kkkkkkkkkkkk..',
    ], 42, 10, { k: INK, y: 0xe8a040, w: 0xfff2d0, l: 0x8ee05a, g: 0x3cb43a, r: 0xffd23f, b: 0x8a4a26, B: 0x6a3a1e });
  },
  cash(D) {
    D.rect(0, 0, 64, 32, 0x23803a);
    D.rect(1, 1, 62, 30, 0x2e9a36);
    D.center('WIN $1M', 4, 0xffd23f, 1);
    D.center('LAST ONE', 13, 0xffffff, 1);
    D.center('IN WINS', 21, 0xffffff, 1);
  },
  sale(D) {
    D.rect(0, 0, 64, 32, 0xffffff);
    D.rect(0, 0, 64, 10, 0xff2e88);
    D.center('BEAST MART', 2, 0xffffff, 1, 0x8a0a4a);
    D.word('50%', 4, 14, 0xff2e88, 2);
    D.word('OFF', 34, 16, 0x15121f, 1, null);
    D.word('ALL', 34, 23, 0x15121f, 1, null);
    D.art(['k......', '.kkkkkk', '.kwkwkk', '.kkkkk.', '..k..k.'], 52, 22, { k: INK, w: 0xffd23f });
  },
};
export const AD_NAMES = Object.keys(ADS);

const adCache = new Map();
/** Stacked poster texture (ads top to bottom) + a roll animator. */
export function adTexture(list) {
  const key = list.join(',');
  let tex = adCache.get(key);
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = AD_W; c.height = AD_H * list.length;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    list.forEach((n, i) => {
      const D = poster(ctx, i * AD_H);
      (ADS[n] ?? ADS.news)(D);
      // 1px ink frame inside the poster so seams read as panel edges
      D.rect(0, 0, 64, 1, INK); D.rect(0, 31, 64, 1, INK); D.rect(0, 0, 1, 32, INK); D.rect(63, 0, 1, 32, INK);
    });
    tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
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
