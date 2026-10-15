// Atmosphere kit: per-arena colour grade + light rig extras (cool fill light),
// voxel god-ray light shafts, drifting motes (dust, pollen, snow, embers,
// spores, star dust), pixel-art mist banks and voxel spotlight beams.
//
// applyBattleAtmos(K, id, params) runs after every arena's buildBattle (see
// index.js) and layers the ATMOS[id] preset on top of the hand-built scenery.
// The grade is published on K.root.userData.grade, which the engine picks up
// when the scene starts (engine.setScene -> setGrade).
//
// Everything is instanced / greedy-meshed and animated through K.onUpdate
// without per-frame allocations. Battle-lane rules: shafts + mist stay behind
// the lane (z < -3.5); foreground motes stay tiny and low.
import { THREE, VoxGrid, greedyGeometry, mulberry32, hash3, clamp, canvasTex, bayer, liveInstances, setInstance, swayInst, FIELD } from './kit.js';

/** Multiply a hex colour's channels by k (0..1+). */
export const scaleHex = (hex, k) => {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k)), g = Math.min(255, Math.round(((hex >> 8) & 255) * k)), b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
};

const addMats = new Map();
/** Additive vertex-colour material for light volumes (no fog, no depth write). */
export function lightMat(opacity = 1, side = THREE.FrontSide) {
  const k = opacity + '|' + side;
  let m = addMats.get(k);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side });
    addMats.set(k, m);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Voxel light shafts (god rays)

/** One shaft: W voxels wide, L tall, 1 deep; banded fade-in from the top, fade-out at the bottom, staircase edges. Pivot at the top centre. */
export function shaftGrid(W, L, color, seed = 1, o = {}) {
  const g = new VoxGrid();
  const fadeTop = o.fadeTop ?? 0.18, fadeBot = o.fadeBot ?? 0.5, bands = o.bands ?? 5;
  for (let y = 0; y < L; y++) {
    const t = y / Math.max(1, L - 1); // 0 = bottom, 1 = top
    let k = Math.min(1, t / fadeBot) * Math.min(1, (1 - t) / fadeTop + 0.25);
    k = Math.floor(k * bands + bayer(y, seed) * 0.99) / bands;
    if (k <= 0) continue;
    const row = y >> 1;
    const a = hash3(row, seed, 3) < 0.35 ? 1 : 0, b = hash3(row, seed, 7) < 0.35 ? 1 : 0;
    for (let x = a; x < W - b; x++) {
      const edge = x === a || x === W - 1 - b;
      g.set(x, y, 0, scaleHex(color, (edge ? k * 0.5 : k) * (o.gain ?? 2.4)));
    }
  }
  return g;
}

/**
 * God-ray shafts slanting down from above, behind the lane.
 * o: { id, n, x0, x1, z0, z1, top, len, w (voxels), vox, tilt (rad, + leans right), color, opacity, seed, breathe }
 */
export function addShafts(K, o = {}) {
  const n = o.n ?? 6, vox = o.vox ?? 0.5, W = o.w ?? 5, L = Math.round((o.len ?? 16) / vox);
  const kinds = o.kinds ?? 2;
  const R = mulberry32(o.seed ?? 3);
  const all = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0.5 : (i + 0.15 + R() * 0.7) / n;
    all.push({ k: i % kinds, x: (o.x0 ?? -40) + u * ((o.x1 ?? 40) - (o.x0 ?? -40)), z: (o.z0 ?? -12) + R() * ((o.z1 ?? -30) - (o.z0 ?? -12)), s: 0.7 + R() * 0.6, ph: R() * 6.28, sp: 0.15 + R() * 0.2 });
  }
  const mat = lightMat(o.opacity ?? 1);
  const sets = [];
  for (let k = 0; k < kinds; k++) {
    const list = all.filter((s) => s.k === k);
    if (!list.length) continue;
    const geo = greedyGeometry('atm_shaft_' + K.id + '_' + (o.id ?? 's') + k, () => shaftGrid(W + k, L - k * 3, o.color ?? 0xfff0c8, (o.seed ?? 3) * 11 + k, o), { scale: vox, pivot: [(W + k) / 2, L - k * 3, 0.5], jitter: 0, shadeSides: false });
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    im.name = 'shafts';
    im.renderOrder = 3;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    K.add(im);
    sets.push([im, list]);
  }
  const tilt = o.tilt ?? 0.32, top = o.top ?? 18, br = o.breathe ?? 0.3;
  const place = (t) => {
    for (const [im, list] of sets) {
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const b = 1 - br + br * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
        setInstance(im, i, s.x, top, s.z, 0, 0, tilt, s.s * b, s.s, 1);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  };
  place(0);
  if (br > 0) K.onUpdate((dt, t) => place(t));
  return sets.map((s) => s[0]);
}

// ---------------------------------------------------------------------------
// Voxel spotlight beam (replaces plain cone primitives): stepped voxel cone with
// a banded additive glow, apex at the origin, pointing down -y.

export function beamGrid(len, r0, r1, color, o = {}) {
  const g = new VoxGrid();
  const bands = o.bands ?? 4;
  for (let y = 0; y < len; y++) {
    const t = y / Math.max(1, len - 1); // 0 apex .. 1 far end
    const r = r0 + (r1 - r0) * t;
    let k = (1 - t * 0.85) * Math.min(1, t / 0.08 + 0.4);
    k = Math.max(0.12, Math.round(k * bands) / bands);
    const ri = Math.ceil(r);
    for (let x = -ri; x <= ri; x++) for (let z = -ri; z <= ri; z++) {
      const d = Math.hypot(x, z);
      if (d > r) continue;
      // hollow-ish core: the rim is brighter than the middle (looks volumetric from any side)
      const rim = d > r - 1.2 ? 1 : 0.55;
      g.set(x, -y, z, scaleHex(color, k * rim));
    }
  }
  return g;
}
/** Voxel beam mesh (cached geometry). o: { id, len (world), r0, r1 (world), vox, color, opacity } */
export function beamMesh(K, o) {
  const vox = o.vox ?? 0.25;
  const geo = greedyGeometry('atm_beam_' + (o.id ?? 'b') + '_' + K.id, () => beamGrid(Math.round(o.len / vox), (o.r0 ?? 0.3) / vox, (o.r1 ?? 1.5) / vox, o.color ?? 0xfff0c0, o), { scale: vox, pivot: [0.5, 0, 0.5], jitter: 0, shadeSides: false });
  const m = new THREE.Mesh(geo, lightMat(o.opacity ?? 0.35));
  m.name = 'beam';
  m.renderOrder = 3;
  return m;
}

// ---------------------------------------------------------------------------
// Drifting motes

/**
 * o: { id, n, box: [x0, x1, y0, y1, z0, z1], color, glow, vel: [vx, vy, vz], wob, vox, seed, shape: 'dot' | 'flake' | 'plus' | 'leaf',
 *      twinkle (0..1), spin }
 */
export function addMotes(K, o) {
  const n = o.n ?? 30, [x0, x1, y0, y1, z0, z1] = o.box;
  const col = o.color ?? 0xffffff, glow = !!o.glow, shape = o.shape ?? 'dot';
  const im = liveInstances(K, 'mote_' + (o.id ?? 'm'), () => {
    const g = new VoxGrid();
    g.set(0, 0, 0, col, glow);
    if (shape === 'plus' || shape === 'flake') for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(a, b, 0, o.color2 ?? col, glow);
    if (shape === 'flake') for (const [a, b] of [[1, 1], [-1, -1], [1, -1], [-1, 1]]) if (hash3(a, b, 3) < 0.5) g.set(a * 2, b * 2, 0, o.color2 ?? col, glow);
    if (shape === 'leaf') g.set(1, 0, 0, o.color2 ?? col, glow).set(0, 0, 1, col, glow);
    return g;
  }, { scale: o.vox ?? 0.06, pivot: 'center', jitter: 0 }, n, { receive: false });
  if (o.mats) im.material = o.mats;
  const R = mulberry32(o.seed ?? 9);
  const P = Array.from({ length: n }, () => ({ x: R(), y: R(), z: R(), ph: R() * 6.28, sp: 0.6 + R() * 0.8, s: 0.6 + R() * 0.8 }));
  const [vx, vy, vz] = o.vel ?? [0.3, 0.1, 0], wob = o.wob ?? 0.4, tw = o.twinkle ?? 0, spin = o.spin ?? 1;
  const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
  const wrap = (v) => v - Math.floor(v);
  K.onUpdate((dt, t) => {
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const fx = wrap(p.x + (vx * p.sp * t) / sx), fy = wrap(p.y + (vy * p.sp * t) / sy), fz = wrap(p.z + (vz * p.sp * t) / sz);
      // fade in/out at the wrap edges so motes never pop
      const edge = Math.min(1, fx * 8, (1 - fx) * 8, fy * 6, (1 - fy) * 6);
      const s = p.s * edge * (tw ? 1 - tw + tw * Math.max(0, Math.sin(t * 2.2 * p.sp + p.ph)) : 1);
      setInstance(im, i, x0 + fx * sx + Math.sin(t * 0.9 * p.sp + p.ph) * wob, y0 + fy * sy + Math.sin(t * 1.3 * p.sp + p.ph * 2) * wob * 0.4, z0 + fz * sz, t * spin * p.sp + p.ph, t * 0.7 * spin, 0, Math.max(0.0001, s));
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

// ---------------------------------------------------------------------------
// Pixel mist banks: long scrolling pixel-art strips with a bumpy top and banded alpha

function mistTex(seed, o = {}) {
  return canvasTex('atm_mist_' + seed + '_' + (o.solid ?? 0), 192, 24, (ctx, w, h) => {
    const img = ctx.createImageData(w, h), d = img.data;
    for (let x = 0; x < w; x++) {
      const u = (x / w) * Math.PI * 2;
      const top = h * (0.18 + 0.22 * (0.5 + 0.5 * Math.sin(u * 3 + seed)) + 0.16 * (0.5 + 0.5 * Math.sin(u * 7 + seed * 2.3)));
      for (let y = 0; y < h; y++) {
        if (y < top) continue;
        const t = (y - top) / Math.max(1, h - top);
        let a = Math.min(1, t * 3.2) * (1 - Math.max(0, (t - 0.7) / 0.3) * (o.solid ? 0 : 0.85));
        a = Math.floor(a * 4 + bayer(x, y) * 0.99) / 4;
        const i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { repeatX: true, mip: false });
}
/**
 * o: { id, layers: [{ z, y, h, w, x, alpha, speed, seed, color, rep }], color }
 */
export function addMist(K, o) {
  const meshes = [];
  o.layers.forEach((L, i) => {
    const tex = mistTex(L.seed ?? i + 1, L).clone();
    tex.needsUpdate = true;
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(L.rep ?? Math.max(1, Math.round((L.w ?? 200) / 60)), 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: L.color ?? o.color ?? 0xffffff, transparent: true, opacity: L.alpha ?? 0.5, depthWrite: false, fog: L.fog ?? true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(L.w ?? 200, L.h ?? 4), mat);
    m.position.set(L.x ?? 0, (L.y ?? 0) + (L.h ?? 4) / 2, L.z);
    m.renderOrder = 2;
    m.name = 'mist';
    K.add(m);
    meshes.push([tex, L.speed ?? 0.004]);
  });
  K.onUpdate((dt, t) => { for (const [tex, sp] of meshes) tex.offset.x = (t * sp) % 1; });
  return meshes;
}

// ---------------------------------------------------------------------------
// Light rig extras

/** Cool fill light from the camera side (no shadows). */
export function addFill(K, color = 0x9cc8ff, intensity = 0.45, dir = [9, 4, 12]) {
  const l = new THREE.DirectionalLight(color, intensity);
  l.position.set(...dir);
  l.name = 'fillLight';
  K.add(l);
  return l;
}

// ---------------------------------------------------------------------------
// Per-arena presets
//   grade: { exposure, sat, contrast, tint: [r, g, b] (multipliers - 1), lift: [r, g, b] (shadow tint), vignette }
//   fill: [color, intensity, dir?]
//   shafts: addShafts options | null; motes: [addMotes options]; mist: addMist options

const LH = FIELD.LANE_HALF;
// foreground box helper: motes in front of the lane stay low and small
const FRONT = (y1 = 1.6) => [-26, 26, 0.15, y1, LH + 0.6, 9];
const BACK = (y0 = 0.4, y1 = 9) => [-34, 34, y0, y1, -4, -22];

export const ATMOS = {
  lab: {
    ground: { seed: 12, tuft: 0x4cb83a, pebble: 0xb8c0cc, front: [0, 0, 0], back: [26, 10, 12], flowers: [0xff6fb8, 0xffd23f] },
    grade: { exposure: 0.02, sat: 0.08, contrast: 0.08, tint: [0.015, 0.005, -0.02], lift: [0.0, 0.01, 0.03], vignette: 0.2 },
    fill: [0xa8d0ff, 0.4],
    shafts: { n: 6, x0: -46, x1: 46, z0: -16, z1: -34, top: 20, len: 22, w: 6, vox: 0.55, tilt: -0.36, color: 0x3a3424, seed: 2 },
    motes: [{ id: 'pollen', n: 26, box: BACK(0.6, 7), color: 0xfff4c0, vel: [0.25, 0.06, 0], vox: 0.07, twinkle: 0.4 }],
    mist: { layers: [{ z: -58, y: -0.5, h: 5, w: 260, alpha: 0.45, speed: 0.003, color: 0xe8f6ff, seed: 1 }] },
  },
  circle: {
    ground: { seed: 13, tuft: 0x5ab83a, pebble: 0xc8b890, front: [0, 0, 0], back: [24, 10, 10], flowers: [0xffffff, 0xffd23f] },
    grade: { exposure: 0.03, sat: 0.1, contrast: 0.1, tint: [0.04, 0.012, -0.04], lift: [0.03, 0.01, 0.0], vignette: 0.24 },
    fill: [0x9cc0ff, 0.38],
    shafts: { n: 6, x0: -44, x1: 44, z0: -14, z1: -30, top: 19, len: 21, w: 6, vox: 0.55, tilt: -0.42, color: 0x3c2c18, seed: 5 },
    motes: [{ id: 'dust', n: 28, box: BACK(0.3, 6), color: 0xffe6b0, vel: [0.45, 0.04, 0], vox: 0.06, twinkle: 0.3 }],
    mist: { layers: [{ z: -60, y: -0.5, h: 4.5, w: 260, alpha: 0.4, speed: 0.004, color: 0xffe8c8, seed: 2 }] },
  },
  factory: {
    grade: { exposure: 0.02, sat: 0.12, contrast: 0.06, tint: [0.03, -0.005, 0.02], lift: [0.03, 0.0, 0.03], vignette: 0.2 },
    fill: [0xc8b0ff, 0.38],
    shafts: { n: 5, x0: -40, x1: 40, z0: -14, z1: -28, top: 18, len: 20, w: 6, vox: 0.55, tilt: 0.34, color: 0x3a2430, seed: 7 },
    motes: [{ id: 'sugar', n: 30, box: BACK(0.4, 7), color: 0xffffff, color2: 0xffc8e8, shape: 'plus', vel: [0.15, -0.12, 0], vox: 0.045, twinkle: 0.7 }],
    mist: { layers: [{ z: -56, y: -0.5, h: 4, w: 260, alpha: 0.4, speed: 0.003, color: 0xffe0f0, seed: 3 }] },
  },
  mart: {
    grade: { exposure: 0.0, sat: 0.06, contrast: 0.07, tint: [-0.005, 0.01, 0.02], lift: [0.0, 0.01, 0.025], vignette: 0.22 },
    fill: [0xd0e4ff, 0.32],
    // skylight shafts falling from the store ceiling
    shafts: { n: 5, x0: -36, x1: 36, z0: -12, z1: -24, top: 14.5, len: 15, w: 5, vox: 0.5, tilt: -0.12, color: 0x2a3036, seed: 9, breathe: 0.15 },
    motes: [{ id: 'dust', n: 24, box: BACK(0.6, 8), color: 0xf4f6ff, vel: [0.12, -0.05, 0], vox: 0.05, twinkle: 0.5 }],
  },
  redlight: {
    ground: { seed: 5, tuft: 0x8ab84a, pebble: 0xd8c8a8, front: [24, 16, 0], back: [14, 12, 0], flowers: [0xff8ab4, 0xffffff], puddles: 0 },
    grade: { exposure: 0.02, sat: 0.08, contrast: 0.08, tint: [0.02, -0.005, 0.0], lift: [0.02, 0.0, 0.03], vignette: 0.22 },
    fill: [0xb8d0ff, 0.38],
    shafts: { n: 5, x0: -42, x1: 42, z0: -12, z1: -26, top: 18, len: 20, w: 6, vox: 0.55, tilt: -0.38, color: 0x382c2c, seed: 11 },
    motes: [{ id: 'petal', n: 22, box: BACK(0.4, 7), color: 0xffb8d0, color2: 0xff8ab4, shape: 'leaf', vel: [0.35, -0.15, 0], vox: 0.06, wob: 0.6, spin: 2 }],
    mist: { layers: [{ z: -60, y: -0.5, h: 4.5, w: 260, alpha: 0.35, speed: 0.003, color: 0xf0f6ff, seed: 4 }] },
  },
  antarctica: {
    ground: { seed: 6, tuft: 0xd8ecff, tuftL: 0xffffff, pebble: 0x9ab8d8, front: [16, 22, 0], back: [10, 16, 0] },
    grade: { exposure: 0.04, sat: 0.06, contrast: 0.1, tint: [-0.03, 0.0, 0.04], lift: [0.0, 0.02, 0.05], vignette: 0.3 },
    fill: [0x8ab8ff, 0.45],
    shafts: null,
    motes: [
      { id: 'snowF', n: 44, box: [-26, 26, 0.1, 10, LH + 0.6, 10], color: 0xffffff, color2: 0xdcecff, shape: 'flake', vel: [0.35, -0.55, 0], vox: 0.035, wob: 0.5, spin: 1.5 },
      { id: 'snowB', n: 50, box: [-40, 40, 0.2, 14, -4, -26], color: 0xf4faff, vel: [0.45, -0.7, 0], vox: 0.09, wob: 0.6 },
    ],
    mist: { layers: [{ z: -12, y: -0.3, h: 2.2, w: 220, alpha: 0.35, speed: 0.008, color: 0xdcecff, seed: 5 }, { z: -44, y: -0.3, h: 4, w: 260, alpha: 0.4, speed: -0.004, color: 0xb8d4f4, seed: 6 }] },
  },
  reactor: {
    ground: { seed: 7, tuft: 0x8a9a4a, pebble: 0x8a8678, front: [26, 18, 0], back: [16, 12, 0], puddles: 4, puddle: { deep: 0x3a8a1a, mid: 0x6ad02a, rim: 0x9aff5a, glint: 0xeaffb0 } },
    grade: { exposure: 0.0, sat: 0.04, contrast: 0.1, tint: [0.02, 0.025, -0.04], lift: [0.0, 0.03, 0.0], vignette: 0.28 },
    fill: [0xa8e0c0, 0.35],
    shafts: { n: 5, x0: -42, x1: 42, z0: -14, z1: -28, top: 18, len: 20, w: 6, vox: 0.55, tilt: -0.48, color: 0x34321c, seed: 13 },
    motes: [{ id: 'spore', n: 26, box: BACK(0.3, 6), color: 0xb8ff7a, glow: true, vel: [0.12, 0.18, 0], vox: 0.035, twinkle: 0.8 }],
    mist: { layers: [{ z: -10, y: -0.4, h: 1.8, w: 220, alpha: 0.32, speed: 0.006, color: 0xc8f0a0, seed: 7 }, { z: -50, y: -0.5, h: 5, w: 260, alpha: 0.42, speed: -0.003, color: 0xd8d0a0, seed: 8 }] },
  },
  pyramid: {
    ground: { seed: 8, tuft: 0xb8a04a, tuftL: 0xe0c870, pebble: 0xc8945a, front: [20, 26, 0], back: [12, 16, 0] },
    grade: { exposure: 0.03, sat: 0.1, contrast: 0.12, tint: [0.04, 0.015, -0.05], lift: [0.03, 0.012, 0.0], vignette: 0.24 },
    fill: [0x9cc4ff, 0.4],
    shafts: { n: 5, x0: -40, x1: 40, z0: -16, z1: -30, top: 19, len: 20, w: 7, vox: 0.55, tilt: -0.36, color: 0x3c3020, seed: 15 },
    motes: [{ id: 'sand', n: 36, box: [-30, 30, 0.1, 3.5, -3.6, -16], color: 0xf8dca0, vel: [1.4, 0.05, 0], vox: 0.045, wob: 0.15 }],
    mist: { layers: [{ z: -14, y: -0.4, h: 1.6, w: 220, alpha: 0.3, speed: 0.012, color: 0xffe0b0, seed: 9 }, { z: -62, y: -0.5, h: 5, w: 260, alpha: 0.4, speed: 0.004, color: 0xffd8a8, seed: 10 }] },
  },
  island: {
    ground: { seed: 9, tuft: 0x6ab84a, pebble: 0xfff2e0, front: [14, 26, 0], back: [8, 12, 0] },
    grade: { exposure: 0.03, sat: 0.12, contrast: 0.08, tint: [0.045, 0.0, -0.02], lift: [0.03, 0.0, 0.04], vignette: 0.26 },
    fill: [0xa8a8ff, 0.42],
    shafts: { n: 6, x0: -44, x1: 44, z0: -14, z1: -30, top: 18, len: 20, w: 6, vox: 0.55, tilt: -0.5, color: 0x40281c, seed: 17 },
    motes: [{ id: 'spray', n: 22, box: BACK(0.3, 5), color: 0xfff0d8, vel: [0.3, 0.1, 0], vox: 0.05, twinkle: 0.6 }],
  },
  jungle: {
    grade: { exposure: 0.02, sat: 0.1, contrast: 0.1, tint: [0.0, 0.02, -0.02], lift: [0.0, 0.025, 0.02], vignette: 0.28 },
    fill: [0xa8e8c8, 0.35],
    shafts: { n: 8, x0: -44, x1: 44, z0: -8, z1: -26, top: 17, len: 19, w: 4, vox: 0.5, tilt: 0.32, color: 0x343a1c, seed: 19 },
    motes: [
      { id: 'pollen', n: 26, box: BACK(0.4, 8), color: 0xf8ffb0, vel: [0.12, 0.05, 0], vox: 0.05, twinkle: 0.6 },
      { id: 'firefly', n: 14, box: [-26, 26, 0.3, 1.8, LH + 0.8, 8], color: 0xd8ff6a, glow: true, vel: [0.1, 0.04, 0.05], vox: 0.035, wob: 0.6, twinkle: 0.9 },
    ],
    mist: { layers: [{ z: -9, y: -0.4, h: 1.8, w: 220, alpha: 0.32, speed: 0.005, color: 0xd8f0d0, seed: 11 }, { z: -40, y: -0.5, h: 4.5, w: 260, alpha: 0.4, speed: -0.003, color: 0xc8e8d0, seed: 12 }] },
  },
  laser: {
    grade: { exposure: 0.02, sat: 0.06, contrast: 0.12, tint: [0.0, -0.01, 0.03], lift: [0.02, 0.0, 0.05], vignette: 0.34 },
    fill: [0x8a9cff, 0.4],
    shafts: { n: 4, x0: -34, x1: 34, z0: -10, z1: -22, top: 15, len: 16, w: 4, vox: 0.5, tilt: 0.0, color: 0x241c3a, seed: 21, breathe: 0.4 },
    motes: [{ id: 'dust', n: 26, box: BACK(0.5, 8), color: 0xc8d0ff, vel: [0.08, -0.04, 0], vox: 0.04, twinkle: 0.7 }],
  },
  haunted: {
    ground: { seed: 10, tuft: 0x5a4a6a, tuftL: 0x7a6a8a, pebble: 0x6a6070, front: [28, 16, 0], back: [16, 10, 0], puddles: 5, puddle: { deep: 0x2a2448, mid: 0x3e3868, rim: 0x5a5288, glint: 0xd8ccff } },
    grade: { exposure: 0.04, sat: -0.02, contrast: 0.1, tint: [0.0, -0.01, 0.04], lift: [0.03, 0.0, 0.06], vignette: 0.36 },
    fill: [0x9a88ff, 0.42],
    shafts: { n: 4, x0: -40, x1: 40, z0: -14, z1: -28, top: 18, len: 20, w: 5, vox: 0.55, tilt: 0.3, color: 0x221c38, seed: 23 },
    motes: [{ id: 'wisp', n: 16, box: [-28, 28, 0.3, 2.2, LH + 0.8, 8], color: 0xc8a8ff, glow: true, vel: [0.08, 0.06, 0.03], vox: 0.035, wob: 0.7, twinkle: 0.9 }],
    mist: { layers: [{ z: -6, y: -0.4, h: 1.5, w: 220, alpha: 0.4, speed: 0.006, color: 0xb8a8e0, seed: 13 }, { z: -20, y: -0.4, h: 3, w: 240, alpha: 0.42, speed: -0.004, color: 0x9a88c8, seed: 14 }, { z: -48, y: -0.5, h: 6, w: 260, alpha: 0.45, speed: 0.003, color: 0x7a6aa8, seed: 15 }] },
  },
  reef: {
    grade: { exposure: 0.02, sat: 0.12, contrast: 0.08, tint: [-0.01, 0.01, 0.02], lift: [0.0, 0.015, 0.03], vignette: 0.2 },
    fill: [0xa8e0ff, 0.4],
    shafts: { n: 5, x0: -44, x1: 44, z0: -16, z1: -30, top: 19, len: 21, w: 6, vox: 0.55, tilt: -0.4, color: 0x2c3430, seed: 25 },
    motes: [{ id: 'spray', n: 26, box: BACK(0.3, 5), color: 0xffffff, vel: [0.35, 0.12, 0], vox: 0.045, twinkle: 0.7 }],
    mist: { layers: [{ z: -64, y: -0.5, h: 4, w: 260, alpha: 0.4, speed: 0.004, color: 0xe8fbff, seed: 16 }] },
  },
  volcano: {
    ground: { seed: 11, tuft: 0x4a3a3a, tuftL: 0x6a4a3a, pebble: 0x2e2830, front: [10, 30, 0], back: [6, 20, 0] },
    grade: { exposure: 0.02, sat: 0.08, contrast: 0.14, tint: [0.05, -0.01, -0.04], lift: [0.04, 0.0, 0.02], vignette: 0.34 },
    fill: [0x8a7aff, 0.35],
    shafts: null,
    motes: [
      { id: 'ember', n: 34, box: [-30, 30, 0.1, 9, -3.6, -20], color: 0xffa040, color2: 0xff6a1f, glow: true, vel: [0.25, 0.9, 0], vox: 0.035, wob: 0.5, twinkle: 0.5 },
      { id: 'emberF', n: 12, box: [-24, 24, 0.1, 2.2, LH + 0.7, 8], color: 0xffb050, glow: true, vel: [0.2, 0.5, 0], vox: 0.03, wob: 0.4, twinkle: 0.6 },
      { id: 'ash', n: 30, box: BACK(0.5, 12), color: 0x5a4a50, vel: [0.3, -0.35, 0], vox: 0.06, wob: 0.5, spin: 1.2 },
    ],
    mist: { layers: [{ z: -12, y: -0.4, h: 2, w: 220, alpha: 0.32, speed: 0.006, color: 0xff8a5a, seed: 17 }, { z: -46, y: -0.5, h: 6, w: 260, alpha: 0.42, speed: -0.004, color: 0x8a3a2a, seed: 18 }] },
  },
  space: {
    grade: { exposure: 0.03, sat: 0.08, contrast: 0.12, tint: [-0.01, 0.0, 0.03], lift: [0.01, 0.0, 0.05], vignette: 0.34 },
    fill: [0x8f9bff, 0.45],
    shafts: null,
    motes: [{ id: 'stardust', n: 30, box: BACK(0.5, 10), color: 0xc8d4ff, color2: 0xffffff, shape: 'plus', vel: [0.1, 0.02, 0], vox: 0.03, twinkle: 0.85 }],
  },
};

/** Layer the arena's atmosphere preset on top of its hand-built scenery (battle arenas). */
export function applyBattleAtmos(K, id, params = {}) {
  const A = ATMOS[id];
  if (!A) return params;
  if (A.fill) addFill(K, A.fill[0], A.fill[1], A.fill[2]);
  if (A.shafts) addShafts(K, { id: 'g', ...A.shafts });
  for (const m of A.motes ?? []) addMotes(K, m);
  if (A.mist) addMist(K, A.mist);
  if (A.ground) addGroundDetail(K, A.ground);
  K.root.userData.grade = { ...A.grade, ...(params.grade ?? {}) };
  return { ...params, grade: K.root.userData.grade };
}

export { clamp };

// ---------------------------------------------------------------------------
// Pixel-edged disc / ring surfaces (water pools, lagoons): drop-in replacement for
// Circle/RingGeometry (XY plane, +z normal, same uv layout) with stepped voxel edges.
const discCache = new Map();
export function pixelDiscGeo(r1, r0 = 0, cell = 0.25) {
  const key = r1 + '|' + r0 + '|' + cell;
  let geo = discCache.get(key);
  if (geo) return geo;
  const pos = [], uv = [], idx = [];
  const n = Math.ceil(r1 / cell);
  const inside = (i, j) => { const d = Math.hypot((i + 0.5) * cell, (j + 0.5) * cell); return d <= r1 && d >= r0; };
  for (let j = -n; j < n; j++) {
    for (let i = -n; i < n; ) {
      if (!inside(i, j)) { i++; continue; }
      let e = i;
      while (e + 1 < n && inside(e + 1, j)) e++;
      const x0 = i * cell, x1 = (e + 1) * cell, y0 = j * cell, y1 = (j + 1) * cell;
      const b = pos.length / 3;
      pos.push(x0, y0, 0, x1, y0, 0, x1, y1, 0, x0, y1, 0);
      for (const [x, y] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) uv.push(x / (2 * r1) + 0.5, y / (2 * r1) + 0.5);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      i = e + 1;
    }
  }
  geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, k) => (k % 3 === 2 ? 1 : 0)), 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  discCache.set(key, geo);
  return geo;
}

// ---------------------------------------------------------------------------
// Ground detail scatter (front strip + the strip behind the lane): grass tufts that sway,
// pebbles, puddles with glints, flowers. Keeps the base pads clear and everything low (< 0.5).

/** Flat puddle blob (voxel ~0.1): deep centre, lighter rim, a couple of sky glints. */
export function puddleGrid(seed = 1, o = {}) {
  const g = new VoxGrid();
  const R = mulberry32(seed * 131 + 5);
  const rx = o.rx ?? 7, rz = o.rz ?? 4;
  const deep = o.deep ?? 0x5a7a9a, mid = o.mid ?? 0x7a9ab8, rim = o.rim ?? 0x9ab8d0, glint = o.glint ?? 0xe8f6ff;
  const ph = R() * 6;
  for (let x = -rx - 1; x <= rx + 1; x++) for (let z = -rz - 1; z <= rz + 1; z++) {
    const a = Math.atan2(z, x);
    const rr = 1 + Math.sin(a * 3 + ph) * 0.18 + Math.sin(a * 5 + ph * 2) * 0.1;
    const d = Math.hypot(x / rx, z / rz) / rr;
    if (d > 1) continue;
    g.set(x, 0, z, d > 0.82 ? rim : d > 0.5 ? mid : deep);
  }
  for (let i = 0; i < 3; i++) { const x = Math.round((R() - 0.5) * rx), z = Math.round((R() - 0.5) * rz * 0.6); if (g.has(x, 0, z)) g.set(x, 0, z, glint).set(x + 1, 0, z, glint); }
  return g;
}

const clearOfBases = (x, z) => !(Math.abs(Math.abs(x) - 12) < 3.4 && z > -3.4 && z < 2.6);
/**
 * o: { seed, front: [n tufts, n pebbles, n flowers], back: [...same], tuft, tuftL, pebble, flowers: [hex], puddles: n, puddle: puddleGrid opts,
 *      x: [x0, x1], frontZ: [z0, z1], backZ: [z0, z1] }
 */
export function addGroundDetail(K, o = {}) {
  const R = mulberry32((o.seed ?? 3) * 977);
  const [xa, xb] = o.x ?? [-30, 30];
  const fz = o.frontZ ?? [LH + 0.8, 11], bz = o.backZ ?? [-LH - 0.9, -7];
  const pick = (n, [z0, z1]) => {
    const out = [];
    for (let i = 0; i < n * 3 && out.length < n; i++) {
      const x = xa + R() * (xb - xa), z = z0 + R() * (z1 - z0);
      if (!clearOfBases(x, z)) continue;
      out.push([x, 0, z, R() * 6.28, 0.6 + R() * 0.5]);
    }
    return out;
  };
  const [ft, fp, ff] = o.front ?? [60, 18, 24], [bt, bp, bf] = o.back ?? [30, 10, 10];
  const tuftCol = o.tuft ?? 0x4cb83a;
  const tufts = [...pick(ft, fz), ...pick(bt, bz)].map((t) => [t[0], o.y ?? 0, t[2], t[3], t[4] * 0.075]);
  if (tufts.length) swayInst(K, 'gdTuft', () => tuftGridLocal(tuftCol, o.tuftL), { scale: 1 }, tufts, { amp: o.sway ?? 0.14, speed: 2.1 });
  const pebbles = [...pick(fp, fz), ...pick(bp, bz)].map((t) => [t[0], (o.y ?? 0) - 0.02, t[2], t[3], t[4] * 0.9]);
  if (pebbles.length) K.inst('gdPebble', () => pebbleGrid(o.pebble ?? 0xa8a6a0), { scale: 0.05, jitter: 0.06 }, pebbles);
  const fl = o.flowers ?? [];
  if (fl.length) {
    const all = [...pick(ff, fz), ...pick(bf, bz)];
    fl.forEach((c, k) => {
      const items = all.filter((_, i) => i % fl.length === k).map((t) => [t[0], o.y ?? 0, t[2], t[3], t[4] * 0.07]);
      if (items.length) swayInst(K, 'gdFlower' + k, () => smallFlowerGrid(c), { scale: 1 }, items, { amp: 0.1, speed: 1.7 });
    });
  }
  if (o.puddles) {
    const pud = pick(o.puddles, [LH + 1.2, 7]).concat(pick(Math.ceil(o.puddles / 2), bz));
    for (let k = 0; k < 2; k++) {
      const items = pud.filter((_, i) => i % 2 === k).map((t) => [t[0], (o.y ?? 0) - 0.075, t[2], t[3], 0.8 + t[4] * 0.6]);
      if (items.length) K.inst('gdPuddle' + k, () => puddleGrid(k + 1, o.puddle), { scale: 0.1, pivot: [0, 0, 0], jitter: 0 }, items, { receive: true });
    }
  }
}
function tuftGridLocal(col, light) {
  const g = new VoxGrid();
  const L = light ?? scaleHex(col, 1.25), D = scaleHex(col, 0.72);
  for (const [x, z, h] of [[0, 0, 4], [1, 0, 3], [-1, 1, 3], [2, 1, 2], [-2, 0, 2], [0, -1, 3], [1, -1, 2]]) for (let y = 0; y < h; y++) g.set(x + (y === h - 1 && x > 0 ? 1 : 0), y, z, y === h - 1 ? L : y === 0 ? D : col);
  return g;
}
function pebbleGrid(c) {
  const g = new VoxGrid();
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) for (let y = 0; y <= 1; y++) {
    if ((x + 0.5) ** 2 + (z + 0.5) ** 2 + (y * 1.6) ** 2 > 4.2) continue;
    g.set(x, y, z, y ? scaleHex(c, 1.12) : hash3(x, y, z) < 0.4 ? scaleHex(c, 0.85) : c);
  }
  return g;
}
function smallFlowerGrid(petal) {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 3, 0, 0x3f9e3a).set(1, 1, 0, 0x5ab84a);
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(a, 4, b, petal);
  g.set(0, 4, 0, 0xffe066);
  return g;
}
