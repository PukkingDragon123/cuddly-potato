// Forest-floor grass + ground cover: a port of MOLEFORGE's title-screen forest grass
// (curly-enigma src/bookends/forest/grass.js + the placement mixes in src/bookends/forest.js).
//   * an atlas of 32x32 pixel-art cells: grass blades drawn root-to-tip down a dark -> light ramp (short /
//     mid / tall with golden seed heads, dry grass, deep-shade grass), flowers on thin stems (daisy,
//     buttercup, anemone, campion, clover, bluebell, forget-me-not, violet, primrose, wild garlic,
//     dandelion clocks, foxglove), ground cover (wild strawberry, wood sorrel, moss with sporophytes,
//     leaf litter, ferns, bracken, woodrush) and reeds / cattails
//   * every clump is two crossed quads with one cell on them (alpha-cut), instanced: pos + rotation,
//     size, cell, tint per instance, one draw call per field
//   * the MoleForge wind: ph = dot(pos.xz, wind) * 0.42 - t * 1.7, a slow travelling gust, sway =
//     (sin(ph) * 0.65 + sin(ph * 2.3 + x * 3) * 0.25 + 0.35) * gust, bending by h^2 (tips move, roots stay)
//   * MoleForge lighting: sky / ground ambient by height, warm key light, a backlit glow when looking
//     toward the sun, patchy yellower / bluer clumps; plus the scene fog
// The instance order is shuffled, so low / medium quality just draw fewer instances (evenly thinned).
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { mulberry32 } from '../../core/util.js';

const CELL = 32;
export const FG = {
  short: 0, mid: 1, tall: 2, daisy: 3, buttercup: 4, bluebell: 5, anemone: 6, campion: 7, forgetme: 8,
  strawberry: 9, foxglove: 10, clover: 11, moss: 12, dry: 13, fern: 14, bracken: 15, reed: 16, cattail: 17, sorrel: 18, seed: 19,
  garlic: 20, violet: 21, primrose: 22, shade: 23, litter: 24, woodrush: 25,
};
const NCELL = 26;
const QDENS = { low: 0.45, medium: 0.75, high: 1 };

const makeRng = (seed) => {
  const r = mulberry32(seed);
  const f = () => r();
  f.range = (a, b) => a + r() * (b - a);
  f.chance = (p) => r() < p;
  f.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  return f;
};
function pixCanvas(w, h) {
  const d = new Int32Array(w * h).fill(-1);
  const pc = {
    w, h, d,
    set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < w && y < h) d[y * w + x] = c; },
    rect(x, y, rw, rh, c) { for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) pc.set(x + xx, y + yy, c); },
    line(x0, y0, x1, y1, c) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let i = 0; i <= n; i++) pc.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c); },
  };
  return pc;
}
const blob = (pc, cx, cy, rx, ry, c) => {
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
    if (dx * dx + dy * dy <= 1) pc.set(x, y, c);
  }
};
const fshadeHex = (c, f) => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f)), g = Math.min(255, Math.round(((c >> 8) & 255) * f)), b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

// ------------------------------------------------------------------ the atlas (MoleForge cell recipes)
function atlas() {
  const pc = pixCanvas(CELL * NCELL, CELL);
  const rng = makeRng(177);
  const RAMP = [0x2a4a22, 0x386228, 0x4a7c30, 0x62943a, 0x84ac48, 0xb0c060];
  const DRY = [0x6a5a30, 0x8a7438, 0xa88e44, 0xc4a858, 0xdcc478];
  const blade = (ox, x0, hgt, lean, ramp = RAMP, w = 1) => {
    for (let y = 0; y < hgt; y++) {
      const t = y / Math.max(1, hgt - 1);
      const x = Math.round(x0 + lean * t * t * hgt);
      const ci = Math.min(ramp.length - 1, Math.floor(t * (ramp.length - 0.01)));
      pc.set(ox + x, CELL - 1 - y, ramp[ci]);
      if (w > 1 && t < 0.4) pc.set(ox + x + 1, CELL - 1 - y, ramp[Math.max(0, ci - 1)]);
    }
    return Math.round(x0 + lean * hgt);
  };
  const field = (c, n, hMin, hMax, ramp = RAMP) => {
    for (let i = 0; i < n; i++) blade(c * CELL, rng.range(2, CELL - 3), Math.round(rng.range(hMin, hMax)), rng.range(-0.35, 0.35), ramp, rng.chance(0.3) ? 2 : 1);
  };
  const stem = (c, x, h, lean = 0) => blade(c * CELL, x, h, lean, [0x2e5a26, 0x3e7a30, 0x4e8a34]);
  field(FG.short, 22, 5, 11);
  field(FG.mid, 20, 9, 18);
  field(FG.tall, 14, 14, 25);
  for (let i = 0; i < 6; i++) { // golden seed heads catching the light
    const ox = FG.tall * CELL, x = Math.round(rng.range(4, CELL - 5)), h = Math.round(rng.range(22, 29));
    blade(ox, x, h, rng.range(-0.2, 0.2), [0x3a6a2c, 0x6a9a3e, 0xa8b858]);
    for (let k = 0; k < 4; k++) pc.set(ox + x + (k % 2), CELL - 1 - h + k, k < 2 ? 0xf0dc90 : 0xd8c070);
  }
  const flower = (c, x, h, petal, heart, lean = 0) => {
    const tx = stem(c, x, h, lean), ty = CELL - 1 - h, ox = c * CELL;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pc.set(ox + tx + dx, ty + dy, petal);
    pc.set(ox + tx, ty, heart);
  };
  for (const [c, petal, heart, n] of [[FG.daisy, 0xfff8f0, 0xffd040, 4], [FG.buttercup, 0xffe040, 0xfff6a0, 5], [FG.anemone, 0xf8f4ff, 0xf0e070, 5], [FG.campion, 0xf070a0, 0xc04070, 4], [FG.clover, 0xf0b0d8, 0xc070b0, 4]]) {
    field(c, 10, 4, 10);
    for (let i = 0; i < n; i++) flower(c, Math.round(rng.range(4, CELL - 5)), Math.round(rng.range(8, 16)), petal, heart, rng.range(-0.15, 0.15));
  }
  { // bluebells: arching stems with nodding bells down one side
    const c = FG.bluebell, ox = c * CELL;
    field(c, 8, 6, 12, [0x2e5a2a, 0x3e7230, 0x4e8a3a]);
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(5, CELL - 8)), h = Math.round(rng.range(13, 19));
      const tx = stem(c, x, h, 0.15);
      for (let b = 0; b < 4; b++) { const by = CELL - h + b * 2 + 1; pc.set(ox + tx + 1, by, 0x6a6ae8); pc.set(ox + tx + 1, by + 1, 0x4a4ac0); pc.set(ox + tx + 2, by + 1, 0x8a8af0); }
    }
  }
  { // forget-me-nots
    const c = FG.forgetme, ox = c * CELL;
    field(c, 12, 3, 8);
    for (let i = 0; i < 9; i++) { const x = Math.round(rng.range(3, CELL - 4)), y = CELL - Math.round(rng.range(6, 12)); pc.set(ox + x, y, 0x78b8f8); pc.set(ox + x + 1, y, 0x98c8ff); pc.set(ox + x, y + 1, 0x5898e0); pc.set(ox + x + 1, y + 1, 0xf8e070); }
  }
  { // wild strawberries
    const c = FG.strawberry, ox = c * CELL;
    for (let i = 0; i < 6; i++) { const x = Math.round(rng.range(3, CELL - 5)), h = Math.round(rng.range(4, 8)); const tx = stem(c, x, h); pc.rect(ox + tx - 1, CELL - 1 - h - 1, 3, 2, 0x4a8a34); pc.set(ox + tx, CELL - h - 3, 0x5a9a3a); }
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(4, CELL - 5)), y = CELL - Math.round(rng.range(3, 7)); pc.set(ox + x, y, 0xe02a2a); pc.set(ox + x, y + 1, 0xb81e1e); pc.set(ox + x + 1, y, 0xff6a5a); }
    for (let i = 0; i < 3; i++) { const x = Math.round(rng.range(4, CELL - 5)), y = CELL - Math.round(rng.range(8, 10)); pc.set(ox + x, y, 0xfffaf0); pc.set(ox + x + 1, y, 0xfffaf0); pc.set(ox + x, y - 1, 0xfffaf0); }
  }
  { // foxglove spikes
    const c = FG.foxglove, ox = c * CELL;
    for (let i = 0; i < 2; i++) {
      const x = 10 + i * 11, h = 26 - i * 5;
      stem(c, x, h);
      for (let y = 6; y < h - 2; y += 2) { const yy = CELL - 1 - y; pc.set(ox + x + (y % 4 ? 1 : -1), yy, 0xd060b0); pc.set(ox + x + (y % 4 ? 1 : -1), yy + 1, 0xa04090); pc.set(ox + x + (y % 4 ? 2 : -2), yy + 1, 0xf0a0d8); }
      for (let l = 0; l < 4; l++) blade(ox, x - 3 + l * 2, 5, (l - 1.5) * 0.4, [0x3e6a30, 0x5a8a40]);
    }
  }
  { // moss tufts with sporophytes
    const c = FG.moss, ox = c * CELL;
    for (let x = 2; x < CELL - 2; x++) { const h = 2 + Math.round(Math.sin(x * 0.7) * 1.5 + rng.range(0, 2)); for (let y = 0; y < h; y++) pc.set(ox + x, CELL - 1 - y, y === h - 1 ? 0x8aac48 : 0x5a8030); }
    for (let i = 0; i < 6; i++) { const x = Math.round(rng.range(3, CELL - 4)), h = Math.round(rng.range(6, 10)); for (let y = 3; y < h; y++) pc.set(ox + x, CELL - 1 - y, 0xa0903a); pc.set(ox + x, CELL - 1 - h, 0xd0a050); }
  }
  field(FG.dry, 18, 8, 20, DRY);
  for (const [c, ramp] of [[FG.fern, [0x2e6a2a, 0x4a9a3a, 0x7ac04e, 0x5aa840]], [FG.bracken, [0x6a6a2a, 0x8a8a34, 0xb0a040, 0x9a9038]]]) { // fronds
    const ox = c * CELL;
    for (let f = 0; f < 7; f++) {
      const a = -1.2 + (f / 6) * 2.4, len = rng.range(10, 15);
      for (let s = 0; s < len; s++) {
        const t = s / len;
        const x = 16 + Math.sin(a) * s * 1.05, y = CELL - 1 - (Math.cos(a) * s * 1.1 - t * t * 5);
        pc.set(ox + Math.round(x), Math.round(y), t < 0.3 ? ramp[0] : t < 0.7 ? ramp[1] : ramp[2]);
        if (s % 2 === 0 && s > 1) { pc.set(ox + Math.round(x - Math.cos(a)), Math.round(y - Math.sin(a) * 0.5) + 1, ramp[3]); pc.set(ox + Math.round(x + Math.cos(a)), Math.round(y + Math.sin(a) * 0.5) + 1, ramp[3]); }
      }
    }
  }
  { // reeds
    const ox = FG.reed * CELL, R = [0x3a6a3a, 0x4e8a44, 0x6aa850, 0x9ac868, 0xc8e090];
    for (let i = 0; i < 14; i++) blade(ox, rng.range(3, CELL - 4), Math.round(rng.range(16, 31)), rng.range(-0.45, 0.45), R);
  }
  { // cattails
    const c = FG.cattail, ox = c * CELL;
    field(c, 8, 10, 22);
    for (let i = 0; i < 4; i++) {
      const x = Math.round(rng.range(5, CELL - 6)), h = Math.round(rng.range(24, 30));
      const tx = blade(ox, x, h, rng.range(-0.1, 0.1), [0x3a6a2a, 0x5a8a3a, 0x7a9a4a]);
      for (let k = 0; k < 5; k++) { pc.set(ox + tx, CELL - h + k, 0x7a5030); pc.set(ox + tx + 1, CELL - h + k, 0x5e3e24); }
    }
  }
  { // wood sorrel
    const c = FG.sorrel, ox = c * CELL;
    for (let i = 0; i < 9; i++) { const x = Math.round(rng.range(3, CELL - 5)), h = Math.round(rng.range(3, 7)); const tx = stem(c, x, h); pc.rect(ox + tx - 1, CELL - 2 - h, 3, 1, 0x6ab048); pc.set(ox + tx, CELL - 3 - h, 0x7ac058); }
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(4, CELL - 5)); pc.set(ox + x, CELL - 9, 0xfff0f4); pc.set(ox + x + 1, CELL - 9, 0xf0c8d8); }
  }
  { // dandelion clocks
    const c = FG.seed, ox = c * CELL;
    field(c, 8, 3, 8);
    for (let i = 0; i < 4; i++) { const x = Math.round(rng.range(5, CELL - 6)), h = Math.round(rng.range(12, 18)); const tx = stem(c, x, h); blob(pc, ox + tx, CELL - 1 - h - 1, 2.2, 2.2, 0xf8f8f0); pc.set(ox + tx, CELL - 2 - h, 0xd8d8c8); }
  }
  { // wild garlic
    const c = FG.garlic, ox = c * CELL, LV = [0x2e6a2e, 0x3e8236, 0x58a044, 0x7cbc58];
    for (let i = 0; i < 7; i++) {
      const x0 = rng.range(6, CELL - 7), h = Math.round(rng.range(7, 13)), lean = rng.range(-0.25, 0.25);
      for (let y = 0; y < h; y++) {
        const t = y / h, w = Math.round(Math.sin(t * Math.PI) * 2.2), x = Math.round(x0 + lean * t * t * h);
        for (let k = -w; k <= w; k++) pc.set(ox + x + k, CELL - 1 - y, LV[Math.max(0, Math.min(3, (k === -w ? 3 : k === w ? 1 : 2) - (t < 0.3 ? 1 : 0)))]);
      }
    }
    for (let i = 0; i < 3; i++) {
      const x = Math.round(rng.range(6, CELL - 7)), h = Math.round(rng.range(15, 20));
      const tx = stem(c, x, h, rng.range(-0.1, 0.1)), ty = CELL - 1 - h;
      for (const [dx, dy] of [[0, 0], [-2, 1], [2, 1], [-1, -1], [1, -1], [0, 2], [-3, -1], [3, 0]]) pc.set(ox + tx + dx, ty + dy, (dx + dy) % 2 ? 0xfffff4 : 0xe8f0e0);
    }
  }
  { // violets
    const c = FG.violet, ox = c * CELL;
    for (let i = 0; i < 8; i++) { const x = Math.round(rng.range(3, CELL - 5)), h = Math.round(rng.range(3, 6)); const tx = stem(c, x, h); pc.rect(ox + tx - 1, CELL - 2 - h, 3, 2, 0x3e7a34); pc.set(ox + tx, CELL - 3 - h, 0x4e8a3a); }
    for (let i = 0; i < 6; i++) {
      const x = Math.round(rng.range(4, CELL - 6)), h = Math.round(rng.range(7, 10)), tx = stem(c, x, h, 0.2), ty = CELL - 1 - h;
      pc.set(ox + tx, ty, 0x7a4ac8); pc.set(ox + tx + 1, ty, 0x9a6ae0); pc.set(ox + tx, ty - 1, 0x6a3ab0); pc.set(ox + tx + 1, ty + 1, 0x5a2aa0); pc.set(ox + tx - 1, ty, 0xb08af0);
    }
  }
  { // primroses
    const c = FG.primrose, ox = c * CELL;
    for (let i = 0; i < 9; i++) { const a = -1.3 + i * 0.32, len = rng.range(5, 8); for (let s = 0; s < len; s++) { const x = 16 + Math.sin(a) * s * 1.4, y = CELL - 1 - Math.cos(a) * s * 0.7; pc.set(ox + Math.round(x), Math.round(y), s < 2 ? 0x3e7232 : s % 2 ? 0x6aa448 : 0x5a9440); } }
    for (let i = 0; i < 6; i++) {
      const x = Math.round(rng.range(8, CELL - 9)), y = CELL - Math.round(rng.range(6, 9));
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) pc.set(ox + x + dx, y + dy, 0xfff0a0);
      pc.set(ox + x, y, 0xf0b030);
    }
  }
  field(FG.shade, 18, 6, 14, [0x1e3a24, 0x284a2a, 0x345c30, 0x426c36, 0x58804a]); // deep-shade grass
  { // leaf litter
    const c = FG.litter, ox = c * CELL, L = [0x8a5a2a, 0xa86a30, 0xc88a3a, 0x6e4a26, 0xb89a48, 0x7a6a34];
    for (let i = 0; i < 16; i++) { const x = Math.round(rng.range(2, CELL - 4)), y = CELL - 1 - Math.round(rng.range(0, 3)), col = L[rng.int(0, 5)]; pc.rect(ox + x, y, 2 + (i % 2), 1, col); pc.set(ox + x + 1, y - 1, fshadeHex(col, 1.15)); }
    for (let i = 0; i < 3; i++) { const x = Math.round(rng.range(3, CELL - 9)); pc.line(ox + x, CELL - 2, ox + x + 6, CELL - 3 - (i % 2), 0x5a4228); }
    for (let i = 0; i < 3; i++) blade(ox, rng.range(4, CELL - 5), Math.round(rng.range(4, 8)), rng.range(-0.3, 0.3));
  }
  { // woodrush
    const c = FG.woodrush, ox = c * CELL;
    for (let i = 0; i < 12; i++) blade(ox, 16 + rng.range(-3, 3), Math.round(rng.range(9, 16)), (i % 2 ? 1 : -1) * rng.range(0.5, 1.1), [0x2e5226, 0x3e6a2e, 0x5a8a3a, 0x7aa446], 2);
    for (let i = 0; i < 3; i++) { const x = Math.round(rng.range(10, 22)), h = Math.round(rng.range(16, 22)); const tx = stem(c, x, h, rng.range(-0.3, 0.3)); for (let k = 0; k < 4; k++) pc.set(ox + tx + rng.int(-2, 2), CELL - 1 - h + rng.int(0, 2), k % 2 ? 0x8a6a3a : 0x6a4a2a); }
  }
  const cv = document.createElement('canvas');
  cv.width = pc.w; cv.height = pc.h;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(pc.w, pc.h);
  pc.d.forEach((c, i) => { if (c < 0) return; img.data[i * 4] = (c >> 16) & 255; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255; });
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let tex = null;
export const grassAtlas = () => (tex ||= atlas());

// ------------------------------------------------------------------ the instanced field (MoleForge shaders)
const VERT = /* glsl */`
attribute vec4 iPos;    // xyz, rotation
attribute vec3 iData;   // size, cell, tint
uniform float uTime;
uniform vec2 uWind;
uniform float uCells;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
varying float vH;
#include <fog_pars_vertex>
void main() {
  vec3 p = position * iData.x;
  float c = cos(iPos.w), s = sin(iPos.w);
  p.xz = mat2(c, -s, s, c) * p.xz;
  vec3 w = (modelMatrix * vec4(iPos.xyz + p, 1.0)).xyz;
  float h = position.y;
  float ph = dot(iPos.xz, uWind) * 0.42 - uTime * 1.7;
  float gust = 0.55 + 0.45 * sin(dot(iPos.xz, vec2(0.07, 0.11)) - uTime * 0.6);
  float sway = (sin(ph) * 0.65 + sin(ph * 2.3 + iPos.x * 3.0) * 0.25 + 0.35) * gust;
  w.xz += uWind * sway * h * h * iData.x * 0.3;
  w.y -= abs(sway) * h * h * iData.x * 0.06;
  vUv = vec2((iData.y + uv.x) / uCells, uv.y);
  vW = w;
  vTint = iData.z;
  vH = h;
  vec4 mvPosition = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uKey; uniform vec3 uSky; uniform vec3 uGround; uniform vec3 uSun; uniform vec3 uHue;
uniform float uBright; uniform float uBack;
varying vec2 vUv;
varying vec3 vW;
varying float vTint;
varying float vH;
#include <fog_pars_fragment>
float mfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float mfNoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mfHash(i), mfHash(i + vec2(1, 0)), f.x), mix(mfHash(i + vec2(0, 1)), mfHash(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec4 t = texture2D(uMap, vUv);
  if (t.a < 0.5) discard;
  vec3 V = normalize(vW - cameraPosition);
  float back = pow(max(dot(V, uSun), 0.0), 5.0);
  vec3 amb = mix(uGround, uSky, 0.3 + vH * 0.6) * 0.7;
  vec3 lit = amb + uKey * 0.68;
  // patchy hue: some clumps yellower, some bluer
  float pt = mfNoise(vW.xz * 0.45) - 0.5;
  vec3 col = t.rgb * uHue * vTint * lit * uBright * (1.0 + vec3(0.1, 0.04, -0.08) * pt * 2.0);
  col += t.rgb * uKey * back * (0.35 + vH) * 1.1 * uBack;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

let crossGeo = null;
function crossQuads() {
  if (crossGeo) return crossGeo;
  const P = [], U = [], I = [];
  for (let q = 0; q < 2; q++) {
    const a = (q * Math.PI) / 2 + 0.3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, o = P.length / 3;
    P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 1, -cz);
    U.push(0, 0, 1, 0, 1, 1, 0, 1);
    I.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  crossGeo = { P, U, I };
  return crossGeo;
}

const SHARED = { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.82, 0.57) } };
/** Grass material; o.light: { key, sky, ground, sun: [x, y, z], hue, bright } (MoleForge defaults: warm key, blue sky). */
export function forestGrassMaterial(o = {}) {
  const L = o.light ?? {};
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uMap: { value: grassAtlas() }, uCells: { value: NCELL }, uBright: { value: L.bright ?? 1 },
      uTime: SHARED.uTime, uWind: SHARED.uWind,
      // MoleForge's golden-hour forest light (key 0xffcf90, sky 0x8ab0e0) cooled to our midday arenas
      uKey: { value: new THREE.Color(L.key ?? 0xfff4e4) }, uSky: { value: new THREE.Color(L.sky ?? 0xa8ccff) }, uGround: { value: new THREE.Color(L.ground ?? 0x4a6a2a) },
      uSun: { value: new THREE.Vector3(...(L.sun ?? [-0.2, 0.7, -0.68])).normalize() }, uHue: { value: new THREE.Color(L.hue ?? 0xd8ffc8) },
      uBack: { value: L.back ?? 0.5 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    fog: true,
  });
  return mat;
}

/** An instanced field of crossed-quad clumps. items: [{x, y, z, rot, size, cell, tint}]. Returns { mesh, update(t) }. */
export function makeForestGrass(items, o = {}) {
  const R = mulberry32((o.seed ?? 1) * 7121 + 3);
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  const { P, U, I } = crossQuads();
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  const n = items.length, pos = new Float32Array(n * 4), dat = new Float32Array(n * 3), box = new THREE.Box3(), v = new THREE.Vector3();
  items.forEach((it, i) => {
    pos[i * 4] = it.x; pos[i * 4 + 1] = it.y; pos[i * 4 + 2] = it.z; pos[i * 4 + 3] = it.rot || 0;
    dat[i * 3] = it.size; dat[i * 3 + 1] = it.cell; dat[i * 3 + 2] = it.tint ?? 1;
    box.expandByPoint(v.set(it.x, it.y, it.z));
  });
  g.setAttribute('iPos', new THREE.InstancedBufferAttribute(pos, 4));
  g.setAttribute('iData', new THREE.InstancedBufferAttribute(dat, 3));
  g.instanceCount = n;
  box.expandByScalar(1.5);
  g.boundingBox = box;
  g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const m = new THREE.Mesh(g, o.mat ?? forestGrassMaterial(o));
  m.name = o.name ?? 'forestGrass';
  m.userData.noBatch = true;
  let lastQ = null;
  return {
    mesh: m,
    update(t) {
      SHARED.uTime.value = t;
      const q = engine.quality;
      if (q !== lastQ) { lastQ = q; g.instanceCount = Math.max(1, Math.floor(n * (QDENS[q] ?? 1))); }
    },
  };
}

// ------------------------------------------------------------------ MoleForge placement mixes -> [cell, size]
export const MIX = {
  // the clearing: a tall summer meadow
  meadow: (r, rng) => { const fl = r < 0.05 ? FG.daisy : r < 0.09 ? FG.buttercup : r < 0.12 ? FG.campion : r < 0.14 ? FG.seed : r < 0.17 ? FG.clover : r < 0.19 ? FG.forgetme : r < 0.55 ? FG.tall : r < 0.85 ? FG.mid : FG.short; return [fl, fl === FG.tall ? rng.range(0.42, 0.62) : fl === FG.mid ? rng.range(0.3, 0.45) : rng.range(0.22, 0.34)]; },
  // grazed turf round the chest: short, daisies and clover
  turf: (r, rng) => [r < 0.08 ? FG.daisy : r < 0.14 ? FG.clover : r < 0.18 ? FG.buttercup : r < 0.6 ? FG.short : FG.mid, rng.range(0.16, 0.26)],
  // trail verges
  verge: (r, rng) => { const fl = r < 0.06 ? FG.buttercup : r < 0.1 ? FG.campion : r < 0.14 ? FG.strawberry : r < 0.2 ? FG.fern : r < 0.6 ? FG.mid : r < 0.8 ? FG.tall : FG.dry; return [fl, fl === FG.fern ? rng.range(0.4, 0.6) : rng.range(0.25, 0.45)]; },
  // the forest floor under the trees
  floor: (r, rng) => { const fl = r < 0.25 ? FG.sorrel : r < 0.45 ? FG.moss : r < 0.6 ? FG.fern : r < 0.7 ? FG.bracken : r < 0.8 ? FG.strawberry : FG.short; return [fl, fl === FG.fern || fl === FG.bracken ? rng.range(0.4, 0.7) : rng.range(0.14, 0.26)]; },
  bluebell: (r, rng) => [r < 0.7 ? FG.bluebell : FG.short, rng.range(0.22, 0.32)],
  anemone: (r, rng) => [r < 0.6 ? FG.anemone : FG.sorrel, rng.range(0.16, 0.24)],
  dry: (r, rng) => [r < 0.55 ? FG.dry : r < 0.7 ? FG.seed : r < 0.85 ? FG.short : FG.litter, rng.range(0.22, 0.4)],
  shade: (r, rng) => { const fl = r < 0.4 ? FG.shade : r < 0.55 ? FG.woodrush : r < 0.7 ? FG.fern : r < 0.82 ? FG.violet : r < 0.92 ? FG.moss : FG.garlic; return [fl, fl === FG.fern ? rng.range(0.4, 0.65) : rng.range(0.2, 0.4)]; },
  reeds: (r, rng) => [r < 0.45 ? FG.reed : r < 0.6 ? FG.cattail : r < 0.8 ? FG.tall : FG.forgetme, r < 0.8 ? rng.range(0.5, 0.85) : 0.3],
};
const n2 = (x, z) => Math.sin(x * 0.11 + 3) * Math.cos(z * 0.13) + Math.sin(x * 0.037 - z * 0.05) * 0.6; // drift patches

const LH = 2.4;
/**
 * Battle-arena forest grass (one draw call). Front strip: the meadow mix (turf right by the lane); behind the
 * lane: verges, bluebell / anemone drifts and forest-floor cover. o: { n: [front, back], front, back, x, ok(x, z),
 * front mix / back mix names, scale (size multiplier), light, seed }
 */
export function addGrassField(K, o = {}) {
  const rng = makeRng((o.seed ?? 5) * 313 + 1);
  const [xa, xb] = o.x ?? [-30, 30];
  const items = [], s = o.scale ?? 1;
  const put = (x, z, [cell, size], tint) => items.push({ x, y: (o.y ?? 0) - 0.02, z, rot: rng.range(0, 6.28), size: size * s, cell, tint });
  const pads = (x, z) => Math.abs(Math.abs(x) - 12) < 3.2 && z > -3.6 && z < 2.8;
  const [nf, nb] = o.n ?? [3200, 900];
  const [f0, f1] = o.front ?? [LH + 0.35, 18], [b0, b1] = o.back ?? [-11, -LH - 0.35];
  for (let i = 0; i < nf; i++) {
    const x = rng.range(xa, xb), z = f0 + Math.pow(rng(), 0.7) * (f1 - f0); // denser toward the camera
    if (pads(x, z) || (o.ok && !o.ok(x, z))) continue;
    const tint = 0.85 + rng() * 0.3, roll = rng();
    put(x, z, (z < f0 + 1.1 ? MIX.turf : MIX[o.frontMix ?? 'meadow'])(roll, rng), tint);
  }
  for (let i = 0; i < nb; i++) {
    const x = rng.range(xa, xb), z = rng.range(b0, b1);
    if (pads(x, z) || (o.ok && !o.ok(x, z))) continue;
    const tint = 0.85 + rng() * 0.3, roll = rng(), d = n2(x, z);
    const mix = o.backMix ? MIX[o.backMix] : d > 0.7 ? MIX.bluebell : d < -0.8 ? MIX.anemone : z > b1 - 1.5 ? MIX.verge : MIX.floor;
    put(x, z, mix(roll, rng), tint * (z < b1 - 1.5 ? 0.92 : 1));
  }
  if (!items.length) return null;
  const G = makeForestGrass(items, { ...o, name: 'forestGrass' });
  K.add(G.mesh);
  K.onUpdate((dt, t) => G.update(t));
  return G;
}
