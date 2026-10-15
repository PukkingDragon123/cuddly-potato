// Arena 9 (legendary): BEAST ISLAND PARADISE — "I Gave My 100,000,000th
// Subscriber An Island". A boardwalk lane over white sand between a turquoise
// lagoon (lapping foam, flamingo floats, scuttling crabs) and the island: palms,
// tiki torches, a luxury villa with an infinity pool, a giant golden panther
// statue, a superyacht bobbing offshore, gulls, and a blazing sunset over pixel
// islands, sailboats and a glittering sea horizon.
import { pixelDiscGeo } from './atmos.js';
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, glowMat, mulberry32, bayer,
  paintGradient, paintClouds, paintStars, px, disc, skyTexture, parallaxWidth, canvasTex, rockGrid,
  pixbuf, skyGlow, paintCumulus, paintCloudBank, paintStreaks, paintStarfield, paintBirdsPx,
  setInstance, liveInstances, blinkInst, addPuffs, addSparkles, addBirds, addFall, addFlag, voxTerrain, leafyTreeGrid, addClouds,
} from './kit.js';
import { pantherStatueGrid, ENV_GRIDS } from '../props/environment.js';

const C = {
  sand: 0xfbe6b4, sandL: 0xfff2d0, sandD: 0xecd09a, sandW: 0xd8b880, wet: 0xc8a874,
  plank: 0xc08a52, plankL: 0xd8a066, plankD: 0x8a5a30, rope: 0xd8c08a,
  sea: 0x22c4d0, seaL: 0x6ae8e8, seaD: 0x1688b0, deep: 0x1a5a96, foam: 0xf4ffff,
  white: 0xf6f4ee, white2: 0xe6e2d8, stone: 0xe8dcc6, stoneD: 0xc8b89c, glass: 0x8fd0e0, glassD: 0x4a8aa8, warm: 0xffd890,
  gold: 0xffc21a, goldL: 0xffe680, goldD: 0xc8901a, wood: 0xa0673a, woodD: 0x6e4224, navy: 0x1e2a5a, ink: 0x1a1a24,
  pink: 0xff6fb0, pinkD: 0xd84a8a, red: 0xe8343c, redD: 0xa8202a, cyan: 0x29b6f6, palm: 0x4cba3a, palmD: 0x2f8a2a,
  bamboo: 0xd8b060, bambooD: 0x9a7a3a,
};
const LH = FIELD.LANE_HALF;
const SHORE = (x) => 4.7 + Math.sin(x * 0.21) * 0.45 + Math.sin(x * 0.07 + 1) * 0.5; // front shoreline z
const BACKSHORE = (x) => -27 - vnoise(x * 0.05, 3, 1) * 6 + (Math.abs(x) > 44 ? 10 : 0); // island's far shore z

// --------------------------------------------------------------------------- helpers

function pixels(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  return {
    set(x, y, hex, a = 1) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = (y * w + x) * 4;
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      if (a >= 1 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * Math.min(1, a)); return; }
      d[i] = d[i] * (1 - a) + r * a; d[i + 1] = d[i + 1] * (1 - a) + g * a; d[i + 2] = d[i + 2] * (1 - a) + b * a;
    },
    flush() { ctx.putImageData(img, 0, 0); },
  };
}
const _D = new THREE.Object3D();
_D.rotation.order = 'YXZ';
function setInst(im, i, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) {
  _D.position.set(x, y, z);
  _D.rotation.set(rx, ry, rz);
  if (Array.isArray(s)) _D.scale.set(s[0], s[1], s[2]); else _D.scale.setScalar(s);
  _D.updateMatrix();
  im.setMatrixAt(i, _D.matrix);
}
function liveInst(K, id, gridFn, opts, n, o = {}) {
  const im = K.inst(id, gridFn, opts, Array.from({ length: n }, () => [0, -50, 0]), o);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  return im;
}
function fitSky(K, tex, texAspect = 16 / 9) {
  let last = 0;
  K.onUpdate(() => {
    const a = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : texAspect;
    if (Math.abs(a - last) < 1e-3) return;
    last = a;
    if (a < texAspect) { tex.repeat.set(a / texAspect, 1); tex.offset.set((1 - a / texAspect) / 2, 0); }
    else { tex.repeat.set(1, texAspect / a); tex.offset.set(0, 1 - texAspect / a); }
  });
}
const front = (g, x, y, zmax = 40) => { for (let z = zmax; z > -40; z--) if (g.has(x, y, z)) return z; return null; };

// --------------------------------------------------------------------------- water

/** Pixel water tile: ripples + sparkles. */
function waterTex(id, base, ripple, deep, spark) {
  return canvasTex(id, 32, 32, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, base);
    const R = mulberry32(id.length * 7);
    for (let i = 0; i < 34; i++) { const x = R() * w | 0, y = R() * h | 0, l = 2 + (R() * 5 | 0); px(ctx, x, y, l, 1, R() < 0.55 ? ripple : deep); }
    for (let i = 0; i < 7; i++) { const x = R() * w | 0, y = R() * h | 0; px(ctx, x, y, 2, 1, spark); }
  }, { repeatX: true });
}
/** Flat water plane with a scrolling pixel texture and a vertex-colour depth gradient along z. */
function waterPlane(K, o) {
  const tex = o.tex.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(o.w / o.tile, o.d / o.tile);
  const geo = new THREE.PlaneGeometry(o.w, o.d, 1, o.segs ?? 12);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getZ(i) + o.d / 2) / o.d, 0, 1); // 0 = far edge, 1 = near edge
    c.setHex(o.grad(t));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, vertexColors: true }));
  m.position.set(o.x ?? 0, o.y, o.z);
  m.name = o.name ?? 'water';
  K.add(m);
  K.onUpdate((dt, t) => { tex.offset.x = (t * (o.sx ?? 0.01)) % 1; tex.offset.y = (t * (o.sy ?? 0.004) + Math.sin(t * 0.6) * 0.02) % 1; });
  return m;
}
/** Shoreline foam strip that laps in and out. */
function addFoam(K, zFn, x0, x1, phase, o = {}) {
  const tex = canvasTex('is_foam' + phase, 64, 12, (ctx, w, h) => {
    const P = pixels(ctx, w, h);
    for (let x = 0; x < w; x++) {
      const e = 1 + Math.round(vnoise(x * 0.3, phase, 1) * 3);
      for (let y = 0; y < h; y++) {
        if (y < e) continue;
        if (y <= e + 2) P.set(x, y, y === e ? 0xffffff : 0xf0ffff);
        else if (bayer(x, y) < 0.8 - (y - e - 3) * 0.13) P.set(x, y, 0xd8fbff);
      }
    }
    P.flush();
  }, { repeatX: true });
  const geo = new THREE.PlaneGeometry(1, 1, 120, 1);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const base = Float32Array.from(pos.array);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, depthWrite: false });
  tex.repeat.set((x1 - x0) / 4, 1);
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 1;
  m.frustumCulled = false;
  K.add(m);
  const depth = o.depth ?? 0.9;
  if (o.travel) { mat.transparent = true; mat.alphaTest = 0.05; }
  K.onUpdate((dt, t) => {
    let lap = Math.sin(t * 0.9 + phase * 2.1) * 0.35;
    if (o.travel) { const q = (t * 0.22 + phase * 0.3) % 1; lap = -q * 3.2; mat.opacity = Math.sin(q * Math.PI) * 0.9; }
    for (let i = 0; i < pos.count; i++) {
      const u = base[i * 3] + 0.5, v = base[i * 3 + 2] + 0.5; // 0..1
      const x = x0 + u * (x1 - x0);
      pos.array[i * 3] = x;
      pos.array[i * 3 + 1] = o.y ?? -0.04;
      pos.array[i * 3 + 2] = zFn(x) + lap + (1 - v) * -0.0 + v * depth - 0.15;
    }
    pos.needsUpdate = true;
    tex.offset.x = (t * 0.02 * (phase % 2 ? 1 : -1)) % 1;
  });
  return m;
}

// --------------------------------------------------------------------------- voxel props

/** Luxury villa on a travertine platform with an infinity pool (pool water added separately). */
const villaGrid = () => {
  const g = new VoxGrid();
  // platform + front steps
  g.box(-34, 0, -16, 33, 3, 13, (x, y, z) => (y === 3 ? (((x >> 2) + (z >> 2)) & 1 ? C.stone : 0xf0e6d2) : C.stoneD));
  for (let i = 0; i < 3; i++) g.box(-30 + i, i, 14 + (2 - i), -20 - i, i, 14 + (2 - i), C.stone);
  // ground floor (glass front, warm interior lights)
  g.box(-28, 4, -13, 6, 15, -1, (x, y, z) => (y === 15 ? 0x3a3a40 : C.white));
  for (let x = -27; x <= 5; x++) for (let y = 5; y <= 13; y++) {
    const mull = (x + 27) % 6 === 0 || y === 9;
    g.set(x, y, -1, mull ? 0x5a5a60 : y > 10 && (x % 7 === 0) ? C.warm : (x + y) % 9 === 0 ? 0xc8f0f8 : C.glass, !mull && y > 10 && x % 7 === 0);
  }
  // upper floor cantilever with wood cladding
  g.box(-16, 16, -11, 22, 26, 2, (x, y, z) => (y === 26 ? 0x3a3a40 : x > 16 ? ((x & 1) ? C.wood : C.woodD) : C.white));
  for (let x = -15; x <= 15; x++) for (let y = 17; y <= 24; y++) {
    const mull = (x + 15) % 5 === 0;
    g.set(x, y, 2, mull ? 0x5a5a60 : y === 22 && (x % 6 === 1) ? C.warm : (x - y) % 8 === 0 ? 0xc8f0f8 : C.glass, !mull && y === 22 && x % 6 === 1);
  }
  g.box(-16, 16, 3, 15, 16, 4, 0xd8d4cc);
  for (let x = -16; x <= 15; x += 3) g.set(x, 17, 4, 0x5a5a60);
  // roof garden + "100M" gold plaque on the upper wall side
  for (let x = -14; x <= 20; x++) for (let z = -9; z <= 0; z++) if (hash3(x, 27, z) < 0.25 && (x < -8 || x > 14)) g.set(x, 27, z, hash3(x, 1, z) < 0.5 ? C.palm : C.palmD);
  text(g, '100M', 3, 27, 0, '+z', C.gold, { center: true, depth: 2 });
  // wooden sun deck
  for (let x = -28; x <= 6; x++) for (let z = 0; z <= 12; z++) g.set(x, 4, z, (x & 1) ? C.plank : C.plankL);
  // infinity pool basin (water surface is a separate animated plane)
  g.box(8, 1, -4, 31, 3, 12, (x, y, z) => (x === 8 || x === 31 || z === -4 || z === 12 ? (y === 3 ? 0xffffff : C.white2) : (y === 1 ? 0x1aa0c0 : null)));
  for (let x = 9; x <= 30; x++) for (let z = -3; z <= 11; z++) g.set(x, 1, z, ((x + z) & 3) ? 0x2ab8d0 : 0x40c8dc);
  // loungers + umbrellas on the deck
  for (const x of [-24, -16, -8]) {
    g.box(x, 5, 7, x + 4, 5, 11, C.white); g.box(x, 6, 7, x + 4, 7, 7, C.white);
    g.box(x + 1, 6, 8, x + 3, 6, 10, x === -16 ? C.pink : C.cyan);
  }
  for (const x of [-20, -4]) {
    g.box(x, 5, 6, x, 13, 6, C.ink);
    for (let r = 0; r <= 5; r++) for (let a = 0; a < 24; a++) { const an = (a / 24) * Math.PI * 2; g.set(x + Math.round(Math.cos(an) * r), 14 - Math.floor(r / 2), 6 + Math.round(Math.sin(an) * r), (a >> 1) & 1 ? C.white : C.cyan); }
  }
  // palm planters at the corners
  for (const [x, z] of [[-33, 12], [32, -15]]) g.box(x - 1, 4, z - 1, x + 1, 6, z + 1, C.stoneD);
  return g;
};

/** Superyacht: navy-banded white hull, tinted decks, helipad. Faces +x, name on the +z side. */
const yachtGrid = () => {
  const g = new VoxGrid();
  for (let x = -42; x <= 44; x++) {
    const bow = Math.max(0, x - 22) / 22;
    const half = Math.round(8 * Math.sqrt(Math.max(0, 1 - bow * bow)));
    const lift = Math.round(bow * bow * 4);
    for (let z = -half; z <= half; z++) for (let y = -2 + lift; y <= 8; y++) {
      const side = Math.abs(z) === half;
      g.set(x, y, z, y < 2 ? (side ? 0x2a3050 : 0x22283a) : y === 5 || y === 6 ? C.navy : y === 8 ? 0xd8d4cc : side ? C.white : 0xe2ded6);
    }
  }
  const deck = (x0, x1, y0, y1, half, tint) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = -half; z <= half; z++) {
      const sidez = Math.abs(z) === half;
      const win = sidez && y > y0 && y < y1 && (x - x0) % 5 !== 0;
      g.set(x, y, z, y === y1 ? 0xd8d4cc : win ? tint : C.white);
    }
  };
  deck(-30, 24, 9, 15, 6, 0x2a3a5a);
  deck(-22, 14, 16, 21, 5, 0x2a3a5a);
  deck(-12, 6, 22, 26, 4, 0x1a2a4a);
  g.box(-4, 27, -1, -3, 33, 0, C.white2);
  g.box(-8, 32, -1, 2, 32, 0, C.white2);
  g.set(-3, 34, 0, C.red, true);
  // helipad on the stern
  for (let x = -40; x <= -31; x++) for (let z = -6; z <= 6; z++) g.set(x, 9, z, (Math.hypot(x + 35.5, z) > 4.6 && Math.hypot(x + 35.5, z) < 5.6) ? C.gold : 0x5a5a64);
  g.box(-37, 9, -2, -37, 9, 2, 0xffffff).box(-34, 9, -2, -34, 9, 2, 0xffffff).box(-36, 9, 0, -35, 9, 0, 0xffffff);
  text(g, 'BEAST', 0, 3, 9, '+z', C.gold, { center: true });
  return g;
};

/** Pink flamingo pool float (faces +z). */
const flamingoGrid = () => {
  const g = new VoxGrid();
  const P0 = C.pink, PD = C.pinkD;
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) for (let y = 0; y <= 3; y++) {
    const r = Math.hypot(x, z);
    const tube = Math.hypot(r - 5, y - 1.5);
    if (tube <= 1.8) g.set(x, y, z, y >= 3 ? 0xffa0cc : (x + z) % 7 === 0 ? PD : P0);
  }
  const neck = [[0, 3, 5], [0, 5, 6], [0, 7, 6], [0, 9, 5], [0, 11, 5], [0, 12, 6]];
  for (let i = 0; i < neck.length - 1; i++) g.line(...neck[i], ...neck[i + 1], P0, 0);
  for (const [x, y, z] of neck) g.set(x - 1, y, z, P0);
  g.box(-1, 12, 5, 0, 14, 7, P0);
  g.box(-1, 13, 8, 0, 13, 9, 0xffffff).set(-1, 12, 9, C.ink).set(0, 12, 9, C.ink);
  g.set(-2, 14, 7, C.ink).set(1, 14, 7, C.ink);
  for (let x = -2; x <= 1; x++) g.set(x, 3, -6, P0).set(x, 4, -7, PD);
  return g;
};
const donutGrid = () => {
  const g = new VoxGrid();
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) for (let y = 0; y <= 3; y++) {
    const tube = Math.hypot(Math.hypot(x, z) - 4, y - 1.5);
    if (tube <= 1.7) g.set(x, y, z, y >= 2 ? ((hash3(x, y, z) < 0.12) ? [C.cyan, C.goldL, 0xffffff][(x + z + 9) % 3] : 0xff8ac0) : 0xf0c890);
  }
  return g;
};
const beachBallGrid = () => {
  const g = new VoxGrid();
  const cols = [C.red, 0xffffff, C.cyan, C.goldL, 0xffffff, 0x5fdc4a];
  g.sphere(0, 3, 0, 3.2, (x, y, z) => (Math.abs(y - 3) > 2.4 ? 0xffffff : cols[((Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 3))) % 6 + 6) % 6]));
  return g;
};

/** Tiki torch (bamboo) — flame animated separately. */
const tikiGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 18; y++) g.box(-1, y, -1, 0, y, 0, y % 4 === 0 ? C.bambooD : C.bamboo);
  g.box(-2, 18, -2, 1, 20, 1, (x, y, z) => ((x + y + z) & 1 ? 0x8a6a3a : 0xb08a4a));
  g.box(-2, 21, -2, 1, 21, 1, C.ink);
  return g;
};
const flameFrame = (f) => () => {
  const g = new VoxGrid();
  const R = mulberry32(53 + f * 11);
  for (let y = 0; y < 8; y++) {
    const r = Math.max(0, 2.2 - y * 0.3 + (R() - 0.5) * 0.7);
    const sway = Math.round(Math.sin(y * 0.8 + f * 1.6) * (y / 6));
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const d = Math.hypot(x - sway, z);
      if (d > r) continue;
      const core = d < r * 0.45 && y < 4;
      g.set(x, y, z, y > 5 ? 0xff5a1a : core ? 0xfff07a : y > 3 ? 0xff7a1a : 0xffb02a, true);
    }
  }
  return g;
};
function addTiki(K, list, scale = 0.1) {
  K.inst('tiki', tikiGrid, { scale, ao: true }, list.map(([x, z]) => [x, 0, z]), { shadow: true });
  const frames = [0, 1, 2, 3].map((f) => K.geo('tflame' + f, flameFrame(f), { scale: scale * 0.85, pivot: [0.5, 0, 0.5] }));
  list.forEach(([x, z], i) => {
    const m = makeMesh(frames[0], Mats.pair);
    m.castShadow = false;
    m.position.set(x - 0.5 * scale, 22 * scale, z - 0.5 * scale);
    K.add(m);
    const ph = i * 1.71;
    K.onUpdate((dt, t) => {
      m.geometry = frames[Math.floor(t * 10 + ph * 3) % 4];
      m.scale.y = 0.85 + Math.sin(t * 15 + ph) * 0.1;
    });
  });
}

const umbrellaGrid = (c1, c2) => () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 18, 0, 0xf0f0f0);
  for (let r = 0; r <= 9; r++) for (let a = 0; a < 40; a++) {
    const an = (a / 40) * Math.PI * 2;
    g.set(Math.round(Math.cos(an) * r), 19 - Math.floor(r / 2.5), Math.round(Math.sin(an) * r), (Math.floor(a / 5) & 1) ? c1 : c2);
  }
  g.set(0, 20, 0, c1);
  return g;
};
const loungerGrid = (towel) => () => {
  const g = new VoxGrid();
  g.box(-6, 2, -2, 5, 2, 2, 0xffffff);
  for (let i = 0; i < 5; i++) g.box(-6 - i, 3 + i, -2, -6 - i, 3 + i, 2, 0xffffff);
  for (const [x, z] of [[-5, -2], [-5, 2], [4, -2], [4, 2]]) g.box(x, 0, z, x, 1, z, 0xc8c8c8);
  g.box(-5, 3, -1, 4, 3, 1, (x) => ((x >> 1) & 1 ? towel : 0xffffff));
  return g;
};
const chestGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 4, 2, (x, y) => (y === 0 ? C.woodD : C.wood));
  g.box(-4, 5, -3, 3, 6, 2, (x, y, z) => (y === 6 && Math.abs(z + 0.5) < 2 ? C.wood : C.woodD));
  for (const x of [-4, 3]) g.box(x, 0, -3, x, 6, 2, C.gold);
  g.box(-4, 4, -3, 3, 4, 2, C.gold);
  g.box(-1, 2, 3, 0, 4, 3, C.goldL);
  g.set(-1, 3, 3, C.ink);
  return g;
};
const coolerGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -3, 3, 5, 2, (x, y) => (y === 5 ? 0xffffff : y > 3 ? C.cyan : 0x1a88d8));
  g.box(-2, 6, -1, 1, 6, 0, 0xffffff);
  text(g, 'B', -1, 1, 3, '+z', 0xffffff);
  return g;
};
const sandcastleGrid = () => {
  const g = new VoxGrid();
  const s = (x, y, z) => (hash3(x, y, z) < 0.3 ? C.sandD : C.sand);
  g.box(-5, 0, -4, 4, 3, 3, s);
  for (const [x, z] of [[-5, -4], [4, -4], [-5, 3], [4, 3]]) { g.box(x - 1, 0, z - 1, x + 1, 6, z + 1, s); g.set(x, 7, z, C.sandD); }
  g.box(-2, 4, -2, 1, 8, 1, s);
  for (const [x, z] of [[-2, -2], [1, -2], [-2, 1], [1, 1]]) g.set(x, 9, z, s(x, 9, z));
  g.box(0, 9, 0, 0, 12, 0, C.woodD);
  g.box(1, 11, 0, 3, 12, 0, C.red);
  g.box(-1, 0, 4, 0, 2, 4, C.sandW);
  return g;
};
const tikiIdolGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 13, 2, (x, y) => (y % 5 === 0 ? C.woodD : C.wood));
  g.box(-2, 9, 3, -1, 10, 3, 0xffffff).box(0, 9, 3, 1, 10, 3, 0xffffff);
  g.set(-2, 9, 3, C.ink).set(1, 9, 3, C.ink);
  g.box(-1, 6, 3, 0, 8, 4, C.woodD);
  g.box(-2, 3, 3, 1, 4, 3, C.ink).box(-1, 3, 3, 0, 3, 3, 0xffffff);
  g.box(-4, 14, -4, 3, 14, 3, C.palm).box(-3, 15, -3, 2, 15, 2, C.palmD);
  return g;
};
const pedestalGrid = () => {
  const g = new VoxGrid();
  g.box(-9, 0, -9, 8, 2, 8, C.stoneD);
  g.box(-8, 3, -8, 7, 12, 7, (x, y, z) => (y === 12 ? C.goldD : vnoise(x * 0.4, y * 0.4, z * 0.4) < 0.4 ? 0xece4d4 : 0xf8f2e6));
  g.box(-9, 13, -9, 8, 14, 8, C.white);
  g.box(-6, 5, 8, 5, 10, 8, C.goldD);
  g.box(-5, 6, 8, 4, 9, 8, C.gold);
  text(g, '100M', 0, 6, 9, '+z', C.navy, { center: true });
  return g;
};
const rockIsleGrid = () => rockGrid({ color: 0x8a8070, r: 6 });
/** The shared golden panther statue, recoloured to a brighter polished gold with glowing eyes. */
const goldStatue = () => {
  const g = pantherStatueGrid();
  const map = { 0xffd040: 0xffcc2a, 0xffe680: 0xfff0a8, 0xc89a20: 0xd89a1a };
  g.paint((x, y, z, c) => map[c]);
  g.forEach((x, y, z, c) => { if (c === 0x15121f || c === 0x1a1a24) g.set(x, y, z, 0x7affe8, true); });
  return g;
};
/** Twinkling glints (instanced glow cubes). spots: [x, y, z, spreadXZ, spreadY] */
function addGlints(K, spots, n) {
  const mat = glowMat(0xffffff).clone();
  mat.color.setRGB(2.4, 2.2, 1.6);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  K.add(im);
  const R = mulberry32(9);
  const g = Array.from({ length: n }, () => { const s = spots[Math.floor(R() * spots.length)]; return { x: s[0] + (R() - 0.5) * s[3], y: s[1] + R() * s[4], z: s[2] + (R() - 0.5) * s[3] * 0.6, ph: R(), sp: 0.3 + R() * 0.5 }; });
  K.onUpdate((dt, t) => {
    g.forEach((p, i) => { const q = (t * p.sp + p.ph) % 1; setInst(im, i, p.x, p.y, p.z, 0.785, 0.6, 0, q < 0.15 ? Math.sin((q / 0.15) * Math.PI) * 0.09 : 0.0001); });
    im.instanceMatrix.needsUpdate = true;
  });
}
const crabGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -1, 1, 1, 1, C.red);
  g.set(-1, 2, 1, 0xffffff).set(0, 2, 1, 0xffffff).set(-1, 3, 1, C.ink).set(0, 3, 1, C.ink);
  for (const sx of [-3, 2]) { g.set(sx, 0, 0, C.redD); g.set(sx, 1, 1, C.red); g.set(sx, 2, 2, C.red); }
  return g;
};
const shellGrid = () => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 0, 0, 0xffd0c0).set(0, 1, -1, 0xffe8e0).set(-1, 0, 1, 0xffa890);
  return g;
};
const starfishGrid = () => {
  const g = new VoxGrid();
  g.set(0, 0, 0, 0xff7a4a);
  for (let a = 0; a < 5; a++) for (let r = 1; r <= 2; r++) g.set(Math.round(Math.cos(a * 1.2566 - 1.57) * r), 0, Math.round(Math.sin(a * 1.2566 - 1.57) * r), r === 2 ? 0xff9a6a : 0xff7a4a);
  return g;
};
/** Giant SUBSCRIBE push-button on a pedestal: red dome with a white play triangle. */
const subButtonBaseGrid = () => {
  const g = new VoxGrid();
  // podium slab with the SUBSCRIBE plaque on its front
  g.box(-20, 0, -12, 19, 6, 11, (x, y, z) => (y === 6 ? (Math.abs(x + 0.5) > 18 || Math.abs(z + 0.5) > 10 ? C.gold : 0xf4f4f8) : y === 0 ? C.stoneD : 0xf8f8fa));
  g.box(-18, 1, 12, 17, 5, 12, 0xffffff);
  text(g, 'SUBSCRIBE', 0, 1, 13, '+z', C.red, { center: true });
  // pedestal column
  for (let y = 7; y <= 20; y++) {
    const r = y >= 18 ? 8.5 : 7;
    g.cylinder(-0.5, -0.5, y, y, r, y >= 18 ? (y === 20 ? 0x3a3a44 : C.gold) : (y % 3 === 0 ? 0xe4e4ea : 0xf4f4f8));
  }
  for (let a = 0; a < 16; a++) { const an = (a / 16) * Math.PI * 2; g.set(Math.round(Math.cos(an) * 8.6 - 0.5), 19, Math.round(Math.sin(an) * 8.6 - 0.5), a & 1 ? 0xffffff : C.red, !(a & 1)); }
  return g;
};
const subButtonCapGrid = () => {
  const g = new VoxGrid();
  for (let x = -7; x <= 7; x++) for (let z = -7; z <= 7; z++) for (let y = 0; y <= 4; y++) {
    const d = (x / 7.3) ** 2 + (z / 7.3) ** 2 + (y / 4.6) ** 2;
    if (d > 1) continue;
    g.set(x, y, z, y >= 3 ? 0xff4a4a : C.red);
  }
  // white play triangle on the top (points +x)
  for (let x = -3; x <= 4; x++) { const hw = Math.round((4 - x) * 0.6); for (let z = -hw; z <= hw; z++) { for (let y = 4; y >= 0; y--) if (g.has(x, y, z)) { g.set(x, y, z, 0xffffff); break; } } }
  return g;
};

// --------------------------------------------------------------------------- postcard props

/** Little sloop with a striped sail (bow toward +x when ry = PI/2 ... built along z). */
const sailboatGrid = (sail) => () => {
  const g = new VoxGrid();
  for (let z = -12; z <= 12; z++) { const hw = Math.round(4 - Math.max(0, z - 6) * 0.6 - Math.max(0, -z - 9) * 0.6); for (let x = -hw; x <= hw; x++) for (let y = 0; y < 4; y++) { if (y > 0 && Math.abs(x) < hw && Math.abs(z) < 11 && y < 3) continue; g.set(x, y, z, y === 3 ? 0xc89a6a : y === 0 ? 0x2a4a8a : 0xffffff); } }
  for (let y = 3; y < 34; y++) g.set(0, y, 0, 0x6a4a2a);
  for (let y = 6; y < 32; y++) { const w = Math.round((32 - y) * 0.42); for (let z = 1; z <= w; z++) g.set(0, y, z, Math.floor(y / 4) % 2 ? sail : 0xffffff); }
  for (let y = 8; y < 26; y++) { const w = Math.round((26 - y) * 0.3); for (let z = 1; z <= w; z++) g.set(0, y, -z - 1, 0xf4f0e8); }
  g.set(0, 34, 0, 0xff3a3a);
  return g;
};
/** Bottlenose dolphin (side profile toward +x). */
const dolphinGrid = () => {
  const g = new VoxGrid();
  for (let x = -12; x <= 12; x++) {
    const r = 3 * Math.sin(((x + 12) / 25) * Math.PI) + 0.5;
    for (let y = -Math.round(r); y <= Math.round(r); y++) for (let z = -Math.round(r * 0.7); z <= Math.round(r * 0.7); z++) if (y * y + (z / 0.75) ** 2 <= r * r) g.set(x, y, z, y < -r * 0.3 ? 0xd8e4f0 : 0x6a8aa8);
  }
  g.box(13, -1, -1, 15, 0, 0, 0x6a8aa8);
  for (let k = 0; k < 4; k++) g.box(-1 + Math.floor(k / 2), 3 + k, 0, 1, 3 + k, 0, 0x5a7a98);
  for (const z of [-3, 2]) g.box(-15, 0, z, -12, 1, z + 1, 0x5a7a98);
  g.set(9, 1, 2, 0x15121f).set(9, 1, -3, 0x15121f);
  return g;
};

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- sunset sky
  const sky = skyTexture('island2', [[0, 0x1e1446], [0.1, 0x3e2268], [0.2, 0x7a3484], [0.3, 0xd04e80], [0.38, 0xff7a62], [0.46, 0xffa45a], [0.56, 0xffcc78], [1, 0xffc890]], (ctx, w, h) => {
    const P = pixbuf(ctx, w, h);
    paintStarfield(P, w, h, { n: 60, ymax: h * 0.16, seed: 5, tint: 0xffd0f0 });
    skyGlow(P, w * 0.42, h * 0.62, w * 0.6, h * 0.42, 0xffe0a0, 0.75, { bands: 6, pow: 1.3 });
    const rimLit = { light: 0xffe4a8, color: 0xff9a8a, shade: 0xc0507a, dark: 0x8a3a6a };
    paintCumulus(P, w * 0.12, h * 0.3, 15, 71, { ...rimLit, sunX: 1 });
    paintCumulus(P, w * 0.7, h * 0.22, 12, 72, { ...rimLit, sunX: -1 });
    paintCumulus(P, w * 0.9, h * 0.36, 10, 73, { ...rimLit, sunX: -1 });
    paintCumulus(P, w * 0.3, h * 0.16, 7, 74, { light: 0xffc8b0, color: 0xc8608a, shade: 0x8a3a72, dark: 0x6a2a5a, sunX: 1 });
    paintStreaks(P, w, { n: 14, y0: h * 0.36, y1: h * 0.52, len: [26, 90], color: 0xffc890, shade: 0xe0708a, seed: 75, alpha: 0.75 });
    paintCloudBank(P, w, Math.round(h * 0.58), { s: 7, seed: 76, light: 0xffe0a0, color: 0xffa890, shade: 0xe07a8a, dark: 0xc0607e, alpha: 0.8 });
    paintBirdsPx(P, [[w * 0.5, h * 0.3, 1], [w * 0.53, h * 0.27, 1], [w * 0.56, h * 0.31, 0]], 0x4a2050, 0.75);
    P.flush();
  }, { w: 320, h: 180, bands: 14 });
  fitSky(K, sky);

  // ---- parallax: horizon with the setting sun + far islands, mid islands with sailboats
  K.parallax('horizon', {
    z: -166, y: -3, w: parallaxWidth(-166), h: 26, tw: 400, th: 104,
    paint: (ctx, w, h) => {
      const hz = Math.round(h * (1 - 7.6 / 26)); // world y ~ 4.6
      const sx = Math.round(w * 0.42);
      // sun sinking into the sea + glow
      for (let k = 4; k >= 1; k--) { ctx.globalAlpha = 0.08 * k; disc(ctx, sx, hz - 4, 14 + k * 5, 0xffd890); }
      ctx.globalAlpha = 1;
      disc(ctx, sx, hz - 4, 13, 0xffe6a0);
      disc(ctx, sx, hz - 5, 10, 0xfff4c8);
      // far islands
      const R = mulberry32(3);
      for (let i = 0; i < 6; i++) {
        const cx = R() * w | 0, iw = 12 + (R() * 26 | 0), ih = 3 + (R() * 7 | 0);
        if (Math.abs(cx - sx) < 26) continue;
        for (let x = -iw; x <= iw; x++) { const t = 1 - (x / iw) ** 2; const hh = Math.round(ih * Math.sqrt(Math.max(0, t)) + vnoise(x * 0.3, i, 1) * 2 * t); px(ctx, cx + x, hz - hh, 1, hh, x < 0 ? 0x8a4a7a : 0x6a3a6a); }
        for (let k = 0; k < 3; k++) { const px0 = cx - iw / 2 + R() * iw | 0; px(ctx, px0, hz - ih - 5, 1, 5, 0x5a2a5a); px(ctx, px0 - 2, hz - ih - 5, 5, 1, 0x5a2a5a); }
      }
      // sea band under the horizon with the sun's glitter path
      paintGradient(ctx, 0, hz, w, h - hz, [[0, 0xd8789a], [0.3, 0xa0508a], [1, 0x5a3a8a]], { bands: 4 });
      for (let y = hz; y < h; y++) {
        const spread = 6 + (y - hz) * 0.9;
        for (let k = 0; k < 5; k++) { const x = sx + Math.round((R() - 0.5) * 2 * spread); if (bayer(x, y) < 0.5) px(ctx, x, y, 2 + (R() * 4 | 0), 1, R() < 0.5 ? 0xffe8a8 : 0xffb070); }
      }
      // tiny sailboats on the horizon
      for (const fx of [0.14, 0.31, 0.78, 0.9]) { const x = Math.round(w * fx); px(ctx, x, hz - 1, 6, 1, 0x4a2a4a); for (let k = 0; k < 6; k++) px(ctx, x + 2, hz - 2 - k, Math.max(1, 3 - (k >> 1)), 1, 0xfff0e0); }
    },
  });
  K.parallax('islands', {
    z: -128, y: -2, w: parallaxWidth(-128), h: 15, tw: 352, th: 60,
    paint: (ctx, w, h) => {
      const wl = Math.round(h - (1.6 / 15) * h);
      const R = mulberry32(8);
      for (const [fx, iw, ih] of [[0.08, 34, 14], [0.27, 22, 9], [0.7, 40, 18], [0.93, 26, 11]]) {
        const cx = Math.round(fx * w);
        for (let x = -iw; x <= iw; x++) {
          const t = 1 - (x / iw) ** 2;
          const hh = Math.round(ih * Math.pow(Math.max(0, t), 0.7) + vnoise(x * 0.2, fx * 10, 1) * 3 * t);
          for (let y = 0; y < hh; y++) px(ctx, cx + x, wl - 1 - y, 1, 1, y < 2 ? 0xf0c8a0 : y > hh - 3 ? (x < 0 ? 0x5aa84a : 0x3a8a4a) : (x < iw * 0.2 ? 0x3a9a4a : 0x2a7a42));
        }
        for (let k = 0; k < 5; k++) {
          const x = cx - iw * 0.6 + R() * iw * 1.2 | 0, base = wl - Math.round(ih * 0.6);
          for (let y = 0; y < 8; y++) px(ctx, x + (y > 4 ? 1 : 0), base - y, 1, 1, 0x7a5a3a);
          for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) for (let j = 1; j <= 4; j++) px(ctx, x + 1 + dx * j, base - 8 + dy * Math.round(j * j / 5), 1, 1, j & 1 ? 0x3a9a3a : 0x2a7a2a);
        }
      }
      // lighthouse on the big island
      const lx = Math.round(0.73 * w);
      for (let y = 0; y < 14; y++) px(ctx, lx, wl - 18 - y, 3, 1, (y >> 1) & 1 ? 0xe8343c : 0xffffff);
      px(ctx, lx, wl - 33, 3, 2, 0xffe680);
      // sailboats
      for (const [fx, c] of [[0.18, 0xffffff], [0.45, 0xff6fb0], [0.58, 0xffffff], [0.84, 0x29b6f6]]) {
        const x = Math.round(fx * w);
        px(ctx, x - 4, wl - 2, 10, 2, 0xf4f0e8);
        px(ctx, x - 3, wl, 8, 1, 0x8a5a3a);
        px(ctx, x, wl - 14, 1, 12, 0x5a3a2a);
        for (let k = 0; k < 11; k++) px(ctx, x + 1, wl - 13 + k, Math.max(1, Math.round(k * 0.6)), 1, c);
        for (let k = 0; k < 7; k++) px(ctx, x - Math.round(k * 0.5) - 1, wl - 9 + k, Math.max(1, Math.round(k * 0.5)), 1, shade(c, -0.1));
      }
      px(ctx, 0, wl, w, h - wl, 0x6a4a8a);
    },
    fogTint: [0xf0a0a0, 0.18],
  });

  // ---- seas: back ocean behind the island + the lagoon in front
  const tBack = waterTex('is_oceanM', 0xd4dadc, 0xffffff, 0xa8b4bc, 0xfff4d8);
  waterPlane(K, { tex: tBack, w: 460, d: 144, y: -0.45, z: -96, tile: 10, sx: 0.006, grad: (t) => (t < 0.55 ? mixHex(0xd07aa4, 0x5a9ad0, t / 0.55) : mixHex(0x5a9ad0, 0x36d4e0, (t - 0.55) / 0.45)), name: 'ocean' });
  const tLag = waterTex('is_lagoonM', 0xd8e0e0, 0xffffff, 0xaebcc4, 0xffffff);
  waterPlane(K, { tex: tLag, w: 220, d: 56, y: -0.12, z: 4.2 + 28, tile: 6, sx: 0.012, sy: -0.01, grad: (t) => mixHex(0x9cfff6, 0x1aa8d0, Math.min(1, t * 1.3)), name: 'lagoon' });
  addFoam(K, SHORE, -70, 70, 1, { y: -0.08, depth: 1.1 });
  addFoam(K, (x) => SHORE(x) + 1.6, -70, 70, 2, { y: -0.1, depth: 0.8 });
  addFoam(K, (x) => SHORE(x) + 3.6, -70, 70, 3, { y: -0.11, depth: 0.6, travel: true });

  // ---- ground: sand island (near + far), wet sand at the shores
  const sandCol = (x, z) => {
    const n = vnoise(x * 0.09, 3, z * 0.12), m = hash3(Math.floor(x * 2), 4, Math.floor(z * 2));
    if (m < 0.012) return [0xffd0c0, 0xffffff, 0xd8c0a0][Math.floor(m * 250) % 3]; // shells
    return n > 0.64 ? C.sandL : n < 0.3 ? C.sandD : C.sand;
  };
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 12, scale: 0.5,
    skip: (x, z) => z + 0.25 > SHORE(x + 0.25) + 0.3,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.sandD;
      const d = SHORE(x + 0.25) - (z + 0.25);
      if (d < 0.9) return C.wet;
      if (d < 1.6) return C.sandW;
      return sandCol(x, z);
    },
  });
  K.ground({
    id: 'groundFar', x0: -120, x1: 120, z0: -48, z1: -14, scale: 1,
    skip: (x, z) => z + 0.5 < BACKSHORE(x + 0.5),
    color: (x, z) => {
      const d = (z + 0.5) - BACKSHORE(x + 0.5);
      if (d < 1.2) return C.wet;
      if (Math.abs(x + 0.5 - 2) < 1.5 && z < -16 && z > -26) return ((Math.floor(z) & 1) ? C.plank : C.plankL); // path to the villa
      if (vnoise(x * 0.06, 5, z * 0.08) > 0.62 && z < -16) return hash3(x, 2, z) < 0.5 ? 0x7acb5a : 0x5aa84a; // grass patches
      return sandCol(x, z);
    },
  });

  // ---- lane: wooden boardwalk over sand, rope-post edges
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 2, side: C.plankD,
    color: (ix, iz, x, z) => {
      const zc = z + 0.125;
      if (Math.abs(zc) > 1.75) {
        if (iz === -10 || iz === 9) return hash3(ix, 1, iz) < 0.5 ? C.sandW : C.sandD;
        return hash3(ix, 2, iz) < 0.1 ? C.sandL : C.sand;
      }
      if (Math.abs(zc) > 1.5) return C.plankD; // stringer beams
      const plank = ((ix % 3) + 3) % 3;
      if (plank === 0) return C.plankD;
      const board = Math.floor(ix / 3);
      return hash3(board, 1, 7) < 0.3 ? C.plankL : hash3(board, 2, iz >> 2) < 0.15 ? 0xa87440 : C.plank;
    },
  });
  // rope posts along the boardwalk
  const posts = [];
  for (let x = -24; x <= 24; x += 4) for (const z of [-2.05, 2.05]) posts.push([x, 0, z]);
  K.inst('ropePost', () => { const g = new VoxGrid(); g.box(-1, 0, -1, 0, 3, 0, C.plankD); g.box(-1, 4, -1, 0, 4, 0, C.rope); return g; }, { scale: 0.09, ao: true }, posts);
  K.mesh('ropes', () => {
    const g = new VoxGrid();
    for (const z of [-21, 20]) for (let x = -230; x < 230; x++) { const k = ((x % 40) + 40) % 40; g.set(x, 3 - Math.round(Math.sin((k / 40) * Math.PI) * 1.4), z, C.rope); }
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] }, 0, 0, 0);
  // golden panther-paw centre marker
  K.mesh('pawMarker', () => {
    const g = new VoxGrid();
    for (let x = -3; x <= 3; x++) for (let z = -2; z <= 3; z++) if ((x / 3.4) ** 2 + ((z - 0.6) / 2.9) ** 2 <= 1) g.set(x, 0, z, C.gold, (x + z) % 3 === 0);
    for (const [cx, cz] of [[-4, -3], [-1.5, -4.6], [1.5, -4.6], [4, -3]]) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) if (x * x + z * z <= 1.2) g.set(Math.round(cx) + x, 0, Math.round(cz) + z, C.goldL);
    return g;
  }, { scale: 0.11, pivot: [0, 0, 0] }, 0.05, 0.002, 1.2);

  // ---- breakables right behind the lane
  const brk = [[-19, 'chest'], [-9.6, 'sandcastle'], [-3.3, 'cooler'], [4.6, 'tiki'], [10.4, 'chest'], [18.6, 'sandcastle']];
  for (const [x, kind] of brk) {
    if (kind === 'chest') K.breakable('crate', 'chest', chestGrid, { scale: 0.11 }, x, -3.3, K.rand(-0.3, 0.3));
    else if (kind === 'sandcastle') K.breakable('sandcastle', 'sandcastle', sandcastleGrid, { scale: 0.1 }, x, -3.2, K.rand(-0.3, 0.3));
    else if (kind === 'cooler') K.breakable('crate', 'cooler', coolerGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else K.breakable('tiki', 'tikiIdol', tikiIdolGrid, { scale: 0.09 }, x, -3.2, K.rand(-0.3, 0.3));
  }

  // ---- beach behind the lane: tiki torches, umbrellas, loungers, palms
  addTiki(K, [[-22, -5], [-15, -5.4], [-6.6, -5.6], [0.4, -5.2], [7.4, -5.6], [15, -5.4], [22, -5]]);
  K.mesh('umbrellaA', umbrellaGrid(C.pink, 0xffffff), { scale: 0.1, ao: true }, -12, 0, -7.6, 0, 1, { shadow: true });
  K.mesh('umbrellaB', umbrellaGrid(C.cyan, 0xffffff), { scale: 0.1, ao: true }, 11.6, 0, -7.4, 0, 1, { shadow: true });
  K.mesh('umbrellaC', umbrellaGrid(C.goldL, C.red), { scale: 0.1, ao: true }, -27, 0, -8, 0, 1, { shadow: true });
  K.inst('loungerP', loungerGrid(C.pink), { scale: 0.1, ao: true }, [[-13.4, 0, -6.6, 0.1], [-26, 0, -6.6, -0.2]], { shadow: true });
  K.inst('loungerC', loungerGrid(C.cyan), { scale: 0.1, ao: true }, [[-10.6, 0, -6.8, -0.1], [12.8, 0, -6.4, 0.15], [10.2, 0, -6.6, -0.1]], { shadow: true });
  K.inst('ball', beachBallGrid, { scale: 0.09, ao: true }, [[3.2, 0, -6.6], [-30, 0, -4.4]], { shadow: true });
  const palmSpots = [[-21.5, -8.4, 0.21], [-8.2, -11.5, 0.24], [-1.5, -13.4, 0.2], [17.2, -10.2, 0.22], [24.5, -12.4, 0.25], [-23.5, -13.2, 0.23], [-33, -9.4, 0.22], [33, -8.6, 0.22], [-38, -16, 0.25], [40, -15, 0.24], [-46, -22, 0.26], [48, -22, 0.25], [-20, -24, 0.24], [27, -25, 0.22], [-5, -27, 0.22]];
  const palms = liveInst(K, 'palm', () => ENV_GRIDS.treePalm(), { scale: 1 }, palmSpots.length, { shadow: true });
  const palmRy = palmSpots.map(() => K.rand(0, 6));
  K.onUpdate((dt, t) => {
    palmSpots.forEach(([x, z, s], i) => setInst(palms, i, x, 0, z, palmRy[i], Math.sin(t * 0.8 + i * 1.3) * 0.02, Math.sin(t * 1.1 + i) * 0.035, s));
    palms.instanceMatrix.needsUpdate = true;
  });
  K.inst('beachRock', rockIsleGrid, { scale: 0.13 }, [[-29.5, 0, -5.4, 0.3], [29, 0, -5.8, 1.1], [-41, 0, -4.5, 2], [42, 0, -5, 0.4]]);

  // ---- landmarks: villa + pool, golden panther, yacht
  const VX = 6.5, VZ = -19, VS = 0.2;
  K.mesh('villa', villaGrid, { scale: VS, pivot: [0, 0, 0] }, VX, 0, VZ, 0, 1, { shadow: true });
  const tPool = waterTex('is_pool', 0x3ad8e8, 0x9af4f4, 0x24b0d0, 0xffffff);
  waterPlane(K, { tex: tPool, w: 22 * VS, d: 15 * VS, y: 3.2 * VS, z: VZ + 4 * VS, x: VX + 20 * VS, tile: 1.2, sx: 0.02, grad: () => 0xffffff, segs: 1, name: 'pool' });
  K.mesh('pedestal', pedestalGrid, { scale: 0.12 }, -14, 0, -17.5, 0.25, 1, { shadow: true });
  K.mesh('goldPanther', goldStatue, { scale: 0.16 }, -14, 15 * 0.12, -17.5, 0.25, 1, { shadow: true });
  addGlints(K, [[-14, 2.2, -17.2, 1.6, 3.6], [VX + 0.6, 5.7, VZ, 3, 0.8]], 14);
  const yacht = K.mesh('yacht', yachtGrid, { scale: 0.17 }, -14, -0.95, -46, -0.12);
  K.onUpdate((dt, t) => { yacht.position.y = -0.95 + Math.sin(t * 0.6) * 0.08; yacht.rotation.z = Math.sin(t * 0.45) * 0.015; yacht.rotation.x = Math.sin(t * 0.37) * 0.01; });
  K.mesh('dock', () => {
    const g = new VoxGrid();
    for (let z = 0; z < 60; z++) for (let x = -3; x <= 2; x++) g.set(x, 0, -z, (z & 1) ? C.plank : C.plankL);
    for (let z = 0; z < 60; z += 6) for (const x of [-3, 2]) g.box(x, -6, -z, x, 1, -z, C.plankD);
    return g;
  }, { scale: 0.2, pivot: [0, 0, 0] }, 20, 0.0, BACKSHORE(20) + 1.5);
  K.inst('flamingo', flamingoGrid, { scale: 0.07, ao: true }, [[VX + 23 * VS, 3.1 * VS, VZ + 5 * VS, 0.6]]);

  // ---- floats in the lagoon (bob + spin), crabs and gulls
  const floats = [
    ['flamingoF', flamingoGrid, 0.065, -9, 10.5, 0.4], ['donut', donutGrid, 0.07, 5, 9.6, 0], ['flamingoF', flamingoGrid, 0.065, 17, 11.5, 2.2], ['donut', donutGrid, 0.07, -21, 9.2, 0], ['ballF', beachBallGrid, 0.08, 12, 8.4, 0],
  ];
  for (const [id, fn, s, x, z, ry] of floats) {
    const m = K.mesh(id, fn, { scale: s, ao: true }, x, -0.12, z, ry, 1, { shadow: true });
    const ph = x * 0.3;
    K.onUpdate((dt, t) => { m.position.y = -0.14 + Math.sin(t * 1.3 + ph) * 0.04; m.rotation.y = ry + Math.sin(t * 0.25 + ph) * 0.6; m.rotation.z = Math.sin(t * 1.1 + ph) * 0.06; m.position.x = x + Math.sin(t * 0.15 + ph) * 0.8; });
  }
  const crabs = liveInst(K, 'crab', crabGrid, { scale: 0.06 }, 5);
  const cr = Array.from({ length: 5 }, (_, i) => ({ cx: -18 + i * 9 + K.rand(-2, 2), sp: K.rand(0.6, 1.1), ph: K.rand(0, 6) }));
  K.onUpdate((dt, t) => {
    cr.forEach((c, i) => {
      const x = c.cx + Math.sin(t * 0.35 * c.sp + c.ph) * 2.2;
      const moving = Math.cos(t * 0.35 * c.sp + c.ph);
      setInst(crabs, i, x, Math.abs(Math.sin(t * 14 + i)) * 0.015 * Math.abs(moving), SHORE(x) - 1.3, 0, 0, Math.sin(t * 10 + i) * 0.08 * Math.abs(moving), 1);
    });
    crabs.instanceMatrix.needsUpdate = true;
  });
  addBirds(K, { id: 'gulls', n: 6, mode: 'circle', cx: -4, cy: 9.6, cz: -30, r: 12, rz: 0.45, speed: 0.22, color: 0xffffff, wingTip: 0x3a3a48, belly: 0xf0f0f4, beak: 0xffb030, vox: 0.07, flap: 7, soar: 0.6, seed: 9 });

  // ---- LOW foreground: shells + starfish on the beach strip
  const shells = [], stars = [];
  for (let i = 0; i < 26; i++) { const x = K.rand(-40, 40); shells.push([x, 0, K.rand(LH + 0.6, SHORE(x) - 0.4), K.rand(0, 6), K.rand(0.8, 1.3)]); }
  for (let i = 0; i < 8; i++) { const x = K.rand(-36, 36); stars.push([x, 0, K.rand(LH + 0.8, SHORE(x) - 0.6), K.rand(0, 6), K.rand(0.9, 1.2)]); }
  K.inst('shell', shellGrid, { scale: 0.07 }, shells);
  K.inst('starfish', starfishGrid, { scale: 0.06 }, stars);

  // ---- postcard extras: a jungle volcano isle with a waterfall, voxel sailboats, leaping dolphins, fireflies, flags
  {
    const IX = 34, IZ = -82;
    voxTerrain(K, 'jungleIsle', {
      x0: IX - 26, x1: IX + 26, z0: IZ - 14, z1: IZ + 10, scale: 0.9, y: -1.2, min: 0,
      h: (x, z) => { const d = Math.hypot((x - IX) / 24, (z - IZ) / 11); if (d > 1) return 0; const peak = Math.pow(1 - d, 1.35) * 17 + vnoise(x * 0.25, 3, z * 0.25) * 2.5; return Math.max(1, peak); },
      col: (x, y, z, h) => { const j = hash3(Math.floor(x * 2), y, Math.floor(z * 2)); if (y < 2) return j < 0.5 ? 0xf0d8a8 : 0xe4c890; if (y === h - 1) return h > 15 ? 0x6a5a4a : j < 0.3 ? 0x2f8a3a : 0x3aa048; return h > 15 && y > 13 ? 0x5a4a3e : j < 0.3 ? 0x2a6a32 : 0x8a6a4a; },
    });
    addFall(K, { id: 'isleFall', x: IX - 3, z: IZ + 8.2, top: 7.6, bottom: -1.0, width: 1.4, vox: 0.22, colors: [0x4ab0e8, 0x7ad0f4, 0xc8f0ff, 0xffffff], speed: 3, n: 14 });
    const trees = [];
    for (let i = 0; i < 40; i++) { const a = K.rand(0, 6.28), r = K.rand(0.15, 0.8); const x = IX + Math.cos(a) * 24 * r, z = IZ + Math.sin(a) * 9 * r; const d = Math.hypot((x - IX) / 24, (z - IZ) / 11); trees.push([x, -1.2 + (Math.pow(1 - d, 1.35) * 17) * 0.9 - 0.4, z, K.rand(0, 6), K.rand(0.16, 0.24)]); }
    K.inst('isleTree', () => leafyTreeGrid({ seed: 31, leaf: 0x3aa048, h: 5, r: 5 }), { scale: 1 }, trees);
    addPuffs(K, { id: 'isleMist', sources: [[IX - 3, -0.8, IZ + 8.8]], n: 6, life: 2.4, rise: 1.6, drift: [0, 0.8], size: [0.8, 2], scale: 0.2, color: 0xf0f8ff, light: 0xffffff, shade: 0xc8e0f0, opacity: 0.75, seed: 4 });
  }
  {
    const boats = [[-40, -70, 0.25, 0xffffff], [10, -100, 0.18, 0xff6fb0], [60, -64, 0.22, 0x29b6f6]].map(([x, z, v, c], i) => ({ m: K.mesh('sailboat' + i, sailboatGrid(c), { scale: 0.1 }, x, -1.0, z, Math.PI / 2, 1), x, v }));
    K.onUpdate((dt, t) => { for (const b of boats) { b.m.position.x = ((b.x + t * b.v + 120) % 240) - 120; b.m.position.y = -1.0 + Math.sin(t * 0.9 + b.x) * 0.06; b.m.rotation.z = Math.sin(t * 0.7 + b.x) * 0.05; } });
  }
  {
    const dol = [0, 1, 2].map((i) => K.mesh('dolphin', dolphinGrid, { scale: 0.07, pivot: 'center' }, 0, -5, 0));
    K.onUpdate((dt, t) => {
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.9 + i * 0.35) % 5) / 1.4;
        const m = dol[i];
        if (k > 1) { m.visible = false; continue; }
        m.visible = true;
        m.position.set(-30 + i * 1.6 + k * 4 + Math.floor(t * 0.9 / 5) % 3 * 8, -0.9 + Math.sin(k * Math.PI) * 1.4, -54 - i * 0.8);
        m.rotation.set(0, 0, (0.5 - k) * 1.8);
      }
    });
  }
  addClouds(K, { id: 'sunsetCloud', n: 6, kinds: 3, x0: -130, x1: 130, y0: 12, y1: 17, z0: -100, z1: -135, s0: 0.9, s1: 1.3, scale: 0.8, speed: 0.4, seed: 14, len: 22, height: 7, color: 0xffa890, shade: 0xc8608a, dark: 0x9a4a7a, light: 0xffe0a0 });
  addSparkles(K, { id: 'fireflies', n: 26, area: [-30, 30, 0.6, 3.4, -16, -5], color: 0xfff0a0, scale: 0.05, rate: 0.5, wander: 0.7, sharp: 2, seed: 17 });
  addSparkles(K, { id: 'sunGlitter', n: 30, area: [-40, 40, -0.42, -0.4, -80, -40], color: 0xffe8a8, scale: 0.14, rate: 1, sharp: 6, seed: 19 });
  addFlag(K, { id: 'villaFlag', x: VX + 9.2, y: 7.4, z: VZ - 0.5, w: 14, h: 9, vox: 0.1, pattern: (u, v) => (v < 3 ? 0x29b6f6 : v < 6 ? 0xffffff : 0xff2e88), poleH: 2.2 });

  return {
    sky,
    fog: { color: 0xf0a0a0, near: 80, far: 280 },
    lights: { sky: 0xffe0d0, ground: 0x7a6a9a, hemi: 1.1, sun: 2.3, sunColor: 0xffd0a0, dir: [-6, 13, 10], rim: 1.4, rimColor: 0xff9a7a },
    dust: 0xfbe6b4,
    bloom: { strength: 0.7, threshold: 1.7, radius: 0.25 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // the island itself: sand top, grassy middle, rocky sides, in a ring of lagoon water
  K.mesh('zoneIsland', () => {
    const g = new VoxGrid();
    for (let x = -24; x <= 23; x++) for (let z = -24; z <= 23; z++) {
      const a = Math.atan2(z + 0.5, x + 0.5), r = Math.hypot(x + 0.5, z + 0.5);
      const R = 21 + Math.sin(a * 3) * 1.5 + Math.sin(a * 7 + 2) * 0.7;
      if (r > R) continue;
      const grass = r < R - 6 && vnoise(x * 0.15, 2, z * 0.15) > 0.42;
      g.set(x, 0, z, grass ? (hash3(x, 1, z) < 0.3 ? 0x7acb5a : 0x5aa84a) : r > R - 1.2 ? C.wet : hash3(x, 2, z) < 0.25 ? C.sandL : C.sand);
      for (let y = -1; y >= -5; y--) g.set(x, y, z, y > -3 ? C.sandD : hash3(x, y, z) < 0.4 ? 0x8a8070 : 0x9a9080);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  const tLag = waterTex('is_lagoonZ', 0x2cd0d8, 0x7af0ec, 0x18a8c0, 0xffffff).clone();
  tLag.needsUpdate = true;
  tLag.wrapS = tLag.wrapT = THREE.RepeatWrapping;
  tLag.repeat.set(4, 4);
  const lag = new THREE.Mesh(pixelDiscGeo(7, 4.6, 0.25), new THREE.MeshBasicMaterial({ map: tLag, color: 0xdfffff }));
  lag.rotation.x = -Math.PI / 2;
  lag.position.y = -0.35;
  K.add(lag);
  K.onUpdate((dt, t) => { tLag.offset.x = (t * 0.02) % 1; });
  // villa + pool
  const VS = 0.085, VX = 0.4, VZ = -2.6;
  K.mesh('villa', villaGrid, { scale: VS, pivot: [0, 0, 0] }, VX, 0, VZ, 0, 1, { shadow: true });
  const tPool = waterTex('is_poolZ', 0x3ad8e8, 0x9af4f4, 0x24b0d0, 0xffffff);
  waterPlane(K, { tex: tPool, w: 22 * VS, d: 15 * VS, y: 3.2 * VS, z: VZ + 4 * VS, x: VX + 20 * VS, tile: 0.6, sx: 0.02, grad: () => 0xffffff, segs: 1, name: 'pool' });
  // golden panther + palms + tiki torches + chest + yacht
  K.mesh('pedestal', pedestalGrid, { scale: 0.05 }, -3.6, 0, -1.6, 0.5, 1, { shadow: true });
  K.mesh('goldPanther', goldStatue, { scale: 0.065 }, -3.6, 15 * 0.05, -1.6, 0.5, 1, { shadow: true });
  addGlints(K, [[-3.6, 0.9, -1.4, 0.6, 1.4]], 6);
  const palmSpots = [[-4.2, 2.4, 0.1], [-1.4, -4.4, 0.11], [5.0, 0.2, 0.09], [-4.8, -3.4, 0.1]];
  const palms = liveInst(K, 'palm', () => ENV_GRIDS.treePalm(), { scale: 1 }, palmSpots.length, { shadow: true });
  K.onUpdate((dt, t) => { palmSpots.forEach(([x, z, s], i) => setInst(palms, i, x, 0, z, i * 1.7, 0, Math.sin(t * 1.1 + i) * 0.04, s)); palms.instanceMatrix.needsUpdate = true; });
  addTiki(K, [[-0.5, 2.5], [-3.6, 3.2]], 0.07);
  K.mesh('chest', chestGrid, { scale: 0.08, ao: true }, 1.0, 0, 3.2, -0.3, 1, { shadow: true });
  const yacht = K.mesh('yacht', yachtGrid, { scale: 0.045 }, 3.6, -0.5, -5.2, -0.6);
  K.onUpdate((dt, t) => { yacht.position.y = -0.5 + Math.sin(t * 0.7) * 0.04; yacht.rotation.z = Math.sin(t * 0.5) * 0.02; });
  const fl = K.mesh('flamingoF', flamingoGrid, { scale: 0.05, ao: true }, -5.6, -0.38, 3.6, 0.8, 1);
  K.onUpdate((dt, t) => { fl.position.y = -0.38 + Math.sin(t * 1.3) * 0.03; fl.rotation.y = 0.8 + Math.sin(t * 0.3) * 0.5; });
  // the giant SUBSCRIBE button (tap target)
  const BS = 0.075, BX = 3.3, BZ = 2.9, BR = -0.45;
  K.mesh('subButtonBase', subButtonBaseGrid, { scale: BS, ao: true, pivot: [0, 0, 0] }, BX, 0, BZ, BR, 1, { shadow: true });
  const cap = K.mesh('subButtonCap', subButtonCapGrid, { scale: BS, ao: true, pivot: [0.5, 0, 0.5] }, BX, 21 * BS, BZ, BR, 1, { shadow: true });
  K.onUpdate((dt, t) => { const p = (t % 2.4) < 0.25 ? Math.sin(((t % 2.4) / 0.25) * Math.PI) : 0; cap.position.y = 21 * BS - p * 0.1; });
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; K.root.add(o); K.hotspots[name] = o; return o; };
  anchor('boss', -2.4, 0, 4.2);
  anchor('subButton', BX, 2.0, BZ);
  anchor('goldPanther', -3.6, 1.6, -1.6);
  anchor('npc', 0.6, 0, 5.0);
  anchor('enterVilla', 1.4, 0.8, -1.6);
  return { focus: [0, 1.2, 0], radius: 7 };
}
