// Shared helpers for props / buildings / backdrops: palette, voxel pixel font,
// cached voxel meshes, translucent materials, instancing and small brushes.
import * as THREE from 'three';
import { VoxGrid, VOX, Mats, makeMesh, cachedGeometry } from '../../core/voxel.js';
import { shade, mixHex, hash3, mulberry32, clamp } from '../../core/util.js';

export { THREE, VoxGrid, VOX, Mats, makeMesh, cachedGeometry, shade, mixHex, hash3, mulberry32, clamp };

export const PAL = {
  white: 0xf4f6fa, white2: 0xe2e8f0, seam: 0xb4bfd0, cream: 0xfff1d6, creamD: 0xe8d2a8,
  blue: 0x29b6f6, blueD: 0x1477c9, blueDD: 0x0d4f8a, blueL: 0x8fe3ff, cyan: 0x5ce1e6, sky: 0x9fd8ff,
  pink: 0xff2e88, pinkD: 0xc2185b, pinkL: 0xff8ac0, magenta: 0xff4fa3,
  yellow: 0xffd23f, gold: 0xffc21a, goldD: 0xc8901a, goldL: 0xffe680, goldDD: 0x8a5c10,
  red: 0xe8343c, redD: 0xa8202a, green: 0x5fdc4a, greenD: 0x2f9a3a, slime: 0x7cff3a, toxic: 0x9dff3a,
  orange: 0xff8a2a, purple: 0xb05cff, purpleD: 0x5a2a8a, purpleDD: 0x2e1748,
  ink: 0x15121f, metal: 0xb8c0cc, metalL: 0xd7dde6, metalD: 0x6b7386, metalDD: 0x3d4352, steel: 0x8f98aa,
  wood: 0xa0673a, woodD: 0x6e4224, woodL: 0xc98c55, choco: 0x5a3220, chocoL: 0x7d4a2d, chocoD: 0x3a1d10, chocoM: 0x6a3c24,
  cash: 0x6fcf5f, cashD: 0x3f8f45, cashL: 0xb8f0a0, grass: 0x5fbf4a, grassD: 0x3e9a3a, grassL: 0x8ee05a,
  dirt: 0x8a6a4a, stone: 0x9aa2b4, stoneD: 0x6f7788, asphalt: 0x3a3d48, brick: 0xb8553a, brickD: 0x8a3a28,
  glass: 0xbfe9ff, tooth: 0xffffff,
};

// ---------------------------------------------------------------------------
// Value noise (smooth 3D) for organic colour variation.
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = fade(x - xi), yf = fade(y - yi), zf = fade(z - zi);
  const h = (a, b, c) => hash3(xi + a, yi + b, zi + c);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), xf), l(h(0, 1, 0), h(1, 1, 0), xf), yf),
    l(l(h(0, 0, 1), h(1, 0, 1), xf), l(h(0, 1, 1), h(1, 1, 1), xf), yf),
    zf,
  );
}
export const rnd = (x, y, z) => hash3(x | 0, y | 0, z | 0);

/** Colour picker: random choice from a list, stable per voxel. */
export const vary = (cols, s = 1) => (x, y, z) => cols[Math.floor(hash3(Math.floor(x / s), Math.floor(y / s), Math.floor(z / s)) * cols.length) % cols.length];

// ---------------------------------------------------------------------------
// Pixel font (3x5 mostly). Rows top -> bottom.
const F = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'], H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'],
  9: ['###', '#.#', '###', '..#', '##.'],
  $: ['.#.', '###', '#..', '###', '..#', '###', '.#.'], '!': ['#', '#', '#', '.', '#'], '.': ['.', '.', '.', '.', '#'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'], '+': ['...', '.#.', '###', '.#.', '...'], '-': ['...', '...', '###', '...', '...'],
  '?': ['##.', '..#', '.#.', '...', '.#.'], ' ': ['..', '..', '..', '..', '..'], "'": ['#', '#', '.', '.', '.'],
  ':': ['.', '#', '.', '#', '.'], '/': ['..#', '..#', '.#.', '#..', '#..'], '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'], '*': ['#.#', '.#.', '###', '.#.', '#.#'], '#': ['.#.#.', '#####', '.#.#.', '#####', '.#.#.'],
  '^': ['.#.', '#.#', '...', '...', '...'], '=': ['...', '###', '...', '###', '...'],
  '♥': ['.#.#.', '#####', '#####', '.###.', '..#..'],
};
const glyph = (ch) => F[ch] ?? F[ch.toUpperCase()] ?? F['?'];

/** Width (in voxels) of a string at a scale. */
export function textW(str, scale = 1, gap = 1) {
  let w = 0;
  for (const ch of str) w += (glyph(ch)[0].length + gap) * scale;
  return Math.max(0, w - gap * scale);
}

/**
 * Draw pixel text into a grid.
 * face: '+z' (reads +x), '-z' (reads -x), '+x' (reads -z), '-x' (reads +z), '+y' (top, reads +x, rows toward -z)
 * (x,y,z) anchor = bottom-left of the text (from the reader's view) unless o.center (then u is centred on anchor).
 * o.mirror draws the mirror image (use before a mirrorGrid so the result reads correctly).
 */
export function text(g, str, x, y, z, face, color, o = {}) {
  const s = o.scale ?? 1, sy = o.sy ?? s;
  const gap = o.gap ?? 1;
  const W = textW(str, s, gap);
  const H = Math.max(...[...str].map((ch) => glyph(ch).length)) * sy;
  let u0 = o.center ? -Math.floor(W / 2) : 0;
  let v0 = o.middle ? -Math.floor(H / 2) : 0;
  let cu = 0;
  const glow = !!o.glow;
  const put = (u, v) => {
    if (o.mirror) u = W - 1 - u;
    u += u0; v += v0;
    const col = typeof color === 'function' ? color(u, v) : color;
    for (let d = 0; d < (o.depth ?? 1); d++) {
      if (face === '+z') g.set(x + u, y + v, z + d, col, glow);
      else if (face === '-z') g.set(x - u, y + v, z - d, col, glow);
      else if (face === '+x') g.set(x + d, y + v, z - u, col, glow);
      else if (face === '-x') g.set(x - d, y + v, z + u, col, glow);
      else if (face === '+y') g.set(x + u, y + d, z - v, col, glow);
    }
  };
  for (const ch of str) {
    const gl = glyph(ch);
    const gh = gl.length;
    for (let r = 0; r < gh; r++)
      for (let c = 0; c < gl[r].length; c++) {
        if (gl[r][c] !== '#') continue;
        // glyphs taller than 5 extend below the baseline evenly
        const base = (gh - 1 - r) - Math.floor((gh - 5) / 2);
        for (let a = 0; a < s; a++) for (let b = 0; b < sy; b++) put(cu + c * s + a, base * sy + b);
      }
    cu += (gl[0].length + gap) * s;
  }
  return W;
}

// ---------------------------------------------------------------------------
// Brushes

/** Diagonal hazard stripes. */
export const hazardC = (a = PAL.yellow, b = PAL.ink, w = 2) => (x, y, z) => ((Math.floor((x + y + z) / w) & 1) ? a : b);
/** Horizontal stripes along y. */
export const stripesY = (cols, w = 1, y0 = 0) => (x, y) => cols[(((Math.floor((y - y0) / w)) % cols.length) + cols.length) % cols.length];
/** Checker */
export const checker = (a, b, s = 1) => (x, y, z) => (((Math.floor(x / s) + Math.floor(y / s) + Math.floor(z / s)) & 1) ? a : b);

/** Mirror a grid across x=0 plane (voxel x -> -1-x). */
export function mirrorGrid(g) {
  const o = new VoxGrid();
  g.forEach((x, y, z, c, gl) => o.set(-1 - x, y, z, c, gl));
  return o;
}

/** Ring (hollow cylinder) of voxels along y. */
export function ring(g, cx, cz, y0, y1, r, c, glow, thick = 1) {
  const ro = (r + 0.45) ** 2, ri = (r - thick + 0.45) ** 2;
  for (let y = y0; y <= y1; y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
      for (let z = Math.floor(cz - r - 1); z <= Math.ceil(cz + r + 1); z++) {
        const d = (x - cx) ** 2 + (z - cz) ** 2;
        if (d <= ro && d > ri) g.set(x, y, z, c, glow);
      }
  return g;
}

/** Stack of cash bills (green brick with white band). */
export function cashStack(g, x, y, z, w = 4, h = 2, d = 2) {
  g.box(x, y, z, x + w - 1, y + h - 1, z + d - 1, (xx, yy) => ((yy - y) % 2 ? PAL.cash : PAL.cashD));
  const mx = x + Math.floor(w / 2);
  g.box(mx, y, z, mx, y + h - 1, z + d - 1, PAL.white);
  return g;
}

// ---------------------------------------------------------------------------
// Meshes / materials

/** Cached voxel mesh: grid built once per id. */
export function vmesh(id, makeGrid, opts = {}, mats = Mats.pair) {
  const geo = cachedGeometry('pr:' + id, makeGrid, opts);
  const m = makeMesh(geo, mats);
  if (opts.noShadow) m.castShadow = false;
  if (opts.receive) m.receiveShadow = true;
  return m;
}
export const vgeo = (id, makeGrid, opts) => cachedGeometry('pr:' + id, makeGrid, opts);

const matCache = new Map();
/** Translucent material (glass / liquid). Cached by params. */
export function glassMat(color = PAL.glass, opacity = 0.3, opts = {}) {
  const k = `g|${color}|${opacity}|${opts.emissive ?? 0}|${opts.side ?? 0}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshPhongMaterial({
      color, transparent: true, opacity, depthWrite: false, shininess: 100, specular: 0xffffff,
      emissive: opts.emissive ?? 0x000000, side: opts.side ?? THREE.FrontSide,
    });
    matCache.set(k, m);
  }
  return m;
}
/** Basic unlit (glowing) material, optionally translucent. Cached. */
export function glowMat(color, opacity = 1) {
  const k = `b|${color}|${opacity}`;
  let m = matCache.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, toneMapped: false });
    matCache.set(k, m);
  }
  return m;
}
/** Fresh tintable glow material (vertex colours multiplied by .color) - per instance. */
export function tintMat(color = 0xffffff) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color });
}
export function lambert(color) {
  const k = `l|${color}`;
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); matCache.set(k, m); }
  return m;
}

/** Translucent cylinder (glass tube / liquid). */
export function glassCyl(r, h, color, opacity, opts = {}) {
  const geo = new THREE.CylinderGeometry(r, r, h, opts.seg ?? 16, 1, !!opts.open);
  const m = new THREE.Mesh(geo, opts.mat ?? glassMat(color, opacity, opts));
  m.position.y = h / 2;
  m.renderOrder = opts.renderOrder ?? 2;
  return m;
}
export function glassBox(w, h, d, color, opacity, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), opts.mat ?? glassMat(color, opacity, opts));
  m.renderOrder = opts.renderOrder ?? 2;
  return m;
}

/** Wrap meshes into a group positioned at (x,y,z). */
export function group(...children) {
  const g = new THREE.Group();
  for (const c of children) if (c) g.add(c);
  return g;
}
export function at(obj, x = 0, y = 0, z = 0, ry = 0, s = 1) {
  obj.position.set(x, y, z);
  obj.rotation.y = ry;
  if (s !== 1) obj.scale.setScalar(s);
  return obj;
}

/**
 * Instanced voxel mesh for repeated scenery.
 * items: [[x,y,z,ry?,s?], ...]
 */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
export function instanced(geo, items, opts = {}) {
  const im = new THREE.InstancedMesh(geo, opts.mats ?? Mats.pair, items.length);
  items.forEach((it, i) => {
    const [x, y, z, ry = 0, s = 1] = it;
    _e.set(0, ry, 0);
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    if (Array.isArray(s)) _s.set(s[0], s[1], s[2]);
    else _s.set(s, s, s);
    _m4.compose(_p, _q, _s);
    im.setMatrixAt(i, _m4);
  });
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = opts.shadow ?? false;
  im.receiveShadow = !!opts.receive;
  im.computeBoundingSphere();
  return im;
}

/** Pixel-art canvas texture (nearest filtering). draw(ctx, w, h). Cached by id. */
const texCache = new Map();
export function pixelTex(id, w, h, draw, repeat = [1, 1]) {
  let t = texCache.get(id);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    draw(ctx, w, h);
    t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapNearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    texCache.set(id, t);
  }
  const tt = t.clone();
  tt.needsUpdate = true;
  tt.repeat.set(repeat[0], repeat[1]);
  return tt;
}
export const css = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');

/** Ground plane (top at y) with pixel texture. Spans x0..x1, z0..z1. */
export function texPlane(tex, x0, x1, z0, z1, y = 0, opts = {}) {
  const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  const mat = new THREE.MeshLambertMaterial({ map: tex, color: opts.tint ?? 0xffffff });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  m.receiveShadow = opts.receive !== false;
  return m;
}
/** Vertical textured wall plane facing +z. */
export function texWall(tex, x0, x1, y0, y1, z, opts = {}) {
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0);
  const mat = opts.basic ? new THREE.MeshBasicMaterial({ map: tex, color: opts.tint ?? 0xffffff }) : new THREE.MeshLambertMaterial({ map: tex, color: opts.tint ?? 0xffffff });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
  return m;
}

/** Collect voxel meshes (have voxel samples) under an object. */
export function voxelMeshes(obj) {
  const out = [];
  obj.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry?.userData?.voxels) out.push(o); });
  return out;
}

/** Simple seeded rng helper. */
export const rng = (seed) => mulberry32(seed);
