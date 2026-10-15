// Arena 7: ATOMIC REACTOR — a toxic power facility at a sickly green dusk.
// Steel-plate lane with toxic-green edge lights, a glowing sludge channel,
// hazard barrels and hazmat crates, catwalks and big pipe runs, radiation
// signs and rotating warning beacons, the BEAST ATOMIC containment dome,
// steaming cooling towers and a smoking stack over an industrial skyline.
import {
  THREE, VoxGrid, Mats, makeMesh, FIELD, shade, mixHex, hash3, vnoise, clamp, text, textW, glowMat, mulberry32, bayer,
  paintGradient, paintClouds, paintSkyline, paintRidge, paintSun, px, disc, skyTexture, parallaxWidth, canvasTex,
  pixbuf, skyGlow, paintSunPx, paintCumulus, paintCloudBank, paintStreaks, paintBirdsPx,
  setInstance, liveInstances, blinkInst, addPuffs, addSparkles, addBirds, voxSkyline,
} from './kit.js';

const C = {
  plate: 0x7d8590, plate2: 0x6f7782, plateL: 0x9aa2ac, plateD: 0x4e5560, rivet: 0xb8c0ca,
  conc: 0x8c8e88, conc2: 0x7e807a, concD: 0x5c5e5a, concL: 0xa4a6a0, asph: 0x4a4d48, asph2: 0x55584f,
  toxic: 0x9dff3a, toxicL: 0xd8ff8a, sludge: 0x4f9a24, sludgeD: 0x2e5a1a, rust: 0x8a4a2a, rustL: 0xb0643a,
  yellow: 0xffd23f, yellowD: 0xc89a1a, ink: 0x1a1c20, red: 0xe23a2a, redD: 0xa2261c, white: 0xf2f2ea,
  metal: 0xb4bcc6, metalL: 0xd2d8e0, metalD: 0x5e6674, metalDD: 0x353b46, pipeG: 0x4a8a5a, pipeGD: 0x2f6a40, amber: 0xffa21a,
  dirt: 0x6a6448, dirtD: 0x55503a, grassDead: 0x8a8a4a,
};
const LH = FIELD.LANE_HALF;

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
/** Is (u,v) (centred, radius ~R) on a radiation trefoil? */
function trefoil(u, v, R) {
  const r = Math.hypot(u, v);
  if (r < R * 0.24) return true;
  if (r < R * 0.38 || r > R) return false;
  const a = Math.atan2(v, u) * 180 / Math.PI;
  for (const c of [90, 210, 330]) { let d = Math.abs(((a - c + 540) % 360) - 180); if (d < 30) return true; }
  return false;
}
/** Paint a trefoil sticker onto a +z face. */
function trefoilZ(g, cx, cy, z, R, bg = C.yellow, fg = C.ink, glow = false) {
  const n = Math.ceil(R);
  for (let u = -n; u <= n; u++) for (let v = -n; v <= n; v++) {
    if (Math.hypot(u, v) > R + 1.2) continue;
    g.set(cx + u, cy + v, z, trefoil(u, v, R) ? fg : bg, glow && !trefoil(u, v, R));
  }
}
/** Diagonal hazard stripes. */
const hz = (a = C.yellow, b = C.ink, w = 2) => (x, y, z) => ((Math.floor((x + y + z) / w) & 1) ? a : b);

// --------------------------------------------------------------------------- voxel props

/** Hyperboloid cooling tower (~28 wide, 46 tall voxels). */
const coolingTowerGrid = () => {
  const g = new VoxGrid();
  const H = 46;
  for (let y = 0; y <= H; y++) {
    const t = (y - 32) / 30;
    const r = 10 + t * t * 9;
    const ro = r + 0.5, ri = r - 1.7;
    for (let x = -Math.ceil(ro); x <= Math.ceil(ro); x++) for (let z = -Math.ceil(ro); z <= Math.ceil(ro); z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > ro || d < ri) continue;
      if (y < 3 && ((Math.atan2(z, x) * 8 / Math.PI + 16) | 0) % 2 === 0) { if (y < 3) g.set(x, y, z, C.concD); continue; }
      let c = Math.floor(y / 9) % 2 ? 0xc4c6bc : 0xbabcb2;
      if (y > H - 7 && y < H - 3) c = (Math.floor(Math.atan2(z, x) * 6) & 1) ? C.red : C.white;
      else if (hash3(x, 0, z) < 0.16 && y < H - 8 && y > 6) c = 0x9a9c90; // rain streaks
      if (y === H) c = C.concD;
      g.set(x, y, z, c);
    }
  }
  return g;
};

/** Red & white smokestack. */
const stackGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 64; y++) {
    const r = 3.6 - y * 0.012;
    g.cylinder(0, 0, y, y, r, Math.floor(y / 8) % 2 ? C.red : C.white);
  }
  for (const y of [20, 40, 58]) g.cylinder(0, 0, y, y, 4.4, C.metalDD);
  g.cylinder(0, 0, 63, 63, 2.4, C.ink);
  g.set(0, 64, 3, C.red, true).set(3, 64, 0, C.red, true);
  for (let y = 2; y < 60; y++) g.set(4, y, 0, y % 3 === 0 ? C.metalD : undefined);
  g.box(-5, 0, -5, 4, 1, 4, C.concD);
  return g;
};

/** Containment dome + turbine hall: BEAST ATOMIC. */
const reactorGrid = () => {
  const g = new VoxGrid();
  // base hall
  g.box(-34, 0, -12, 34, 15, 11, (x, y, z) => {
    if (y === 15) return C.concD;
    if (y < 2) return C.concD;
    if ((x + 34) % 9 === 0) return 0xa0a498;
    return y % 5 === 0 ? 0xb8bcb0 : (hash3(x >> 1, y, z) < 0.2 ? 0xc2c6ba : 0xcacebf);
  });
  // hazard band + glowing control windows on the front
  g.box(-34, 2, 12, 34, 3, 12, hz());
  for (let x = -30; x <= 30; x += 6) if (Math.abs(x) > 8) { g.box(x, 6, 12, x + 3, 9, 12, C.metalDD); g.box(x, 7, 11, x + 3, 8, 11, null); g.box(x + 1, 7, 12, x + 2, 8, 12, C.toxicL, true); }
  // big glowing core viewport
  g.box(-8, 4, 12, 7, 13, 12, C.metalDD);
  g.box(-7, 5, 12, 6, 12, 12, (x, y) => ((x + y) % 4 === 0 ? C.toxicL : 0x7ad82e));
  for (const [x, y] of [[-5, 10], [-3, 6], [2, 11], [4, 7], [5, 10], [-6, 7]]) g.set(x, y, 12, C.toxicL, true);
  g.box(-1, 5, 13, 0, 12, 13, C.metalD);
  g.box(-7, 8, 13, 6, 8, 13, C.metalD);
  // dome
  for (let x = -22; x <= 21; x++) for (let z = -22; z <= 21; z++) for (let y = 0; y <= 20; y++) {
    const d = Math.sqrt((x + 0.5) ** 2 + (y * 1.08) ** 2 + (z + 0.5) ** 2);
    if (d > 21.5 || d < 19.8) continue;
    g.set(x, 16 + y, z, y % 6 === 0 ? 0xc8ccc2 : (x + z) % 11 === 0 ? 0xd4d8ce : 0xe2e6dc);
  }
  // dome trefoil
  trefoilZ(g, 0, 26, 19, 6.5);
  // sign
  const W = textW('BEAST ATOMIC', 1) + 6;
  g.box(-Math.floor(W / 2), 37, -2, Math.ceil(W / 2), 50, -1, C.ink);
  g.box(-Math.floor(W / 2), 37, 0, Math.ceil(W / 2), 37, 0, C.yellow);
  g.box(-Math.floor(W / 2), 50, 0, Math.ceil(W / 2), 50, 0, C.yellow);
  for (let x = -Math.floor(W / 2) + 1; x < W / 2; x += 4) g.set(x, 50, 1, C.toxicL, true);
  text(g, 'BEAST ATOMIC', 0, 39, 0, '+z', C.toxicL, { center: true, scale: 1, sy: 2 });
  for (const x of [-16, 15]) g.box(x, 30, -2, x + 1, 36, -1, C.metalD);
  // roof vents + side annex with roll-up door
  for (const x of [-30, -24, 24, 30]) { g.box(x - 2, 16, -6, x + 1, 18, -3, C.metalD); g.box(x - 1, 19, -5, x, 19, -4, C.metal); }
  g.box(35, 0, -8, 46, 11, 9, (x, y) => (y === 11 ? C.concD : y % 4 === 0 ? 0x9aa08e : 0xa8ae9a));
  g.box(37, 0, 10, 44, 8, 10, (x, y) => (y % 2 ? C.metalD : C.metal));
  g.box(37, 9, 10, 44, 9, 10, hz());
  return g;
};

/** Steel catwalk segment (deck at y = 22) along x, 60 voxels long. */
const catwalkGrid = () => {
  const g = new VoxGrid();
  const L = 60;
  for (let x = 0; x < L; x++) for (let z = -6; z <= 6; z++) g.set(x, 22, z, z % 2 ? C.metalD : C.metalDD);
  for (let x = 0; x < L; x++) { g.set(x, 23, 6, C.yellow); g.set(x, 23, -6, C.yellow); g.set(x, 30, 6, C.yellow); g.set(x, 30, -6, C.yellow); g.set(x, 26, 6, C.metal); }
  for (let x = 0; x < L; x += 6) for (const z of [-6, 6]) g.box(x, 23, z, x, 30, z, C.metal);
  for (const x of [1, L - 2]) for (const z of [-5, 5]) g.box(x, 0, z, x, 21, z, (xx, y) => (Math.floor(y / 3) % 2 ? C.yellow : C.ink));
  for (const x of [1, L - 2]) g.line(x, 2, -5, x, 20, 5, C.metalD);
  return g;
};
const stairsGrid = () => {
  const g = new VoxGrid();
  for (let i = 0; i < 22; i++) g.box(-i, 21 - i, -4, -i, 21 - i, 4, i % 2 ? C.metalD : C.metalDD);
  for (let i = 0; i < 22; i += 1) { g.set(-i, 27 - i, 5, C.yellow); g.set(-i, 27 - i, -5, C.yellow); }
  for (let i = 0; i < 22; i += 5) { g.box(-i, 22 - i, 5, -i, 27 - i, 5, C.metal); g.box(-i, 22 - i, -5, -i, 27 - i, -5, C.metal); }
  return g;
};

/** Big pipe run along x (120 voxels): green coolant pipe + rusty pipe + valves. */
const pipeRunGrid = () => {
  const g = new VoxGrid();
  const L = 120;
  const pipe = (y, z, r, col, colJ, every) => {
    for (let x = 0; x < L; x++) {
      const j = x % every === 0 || x % every === 1;
      const rr = j ? r + 1 : r;
      for (let a = -rr; a <= rr; a++) for (let b = -rr; b <= rr; b++) {
        if (a * a + b * b > rr * rr + rr * 0.8) continue;
        g.set(x, y + a, z + b, j ? colJ : b > rr * 0.4 && a > 0 ? shade(col, 0.12) : col);
      }
    }
  };
  pipe(7, 0, 3, C.pipeG, C.metalD, 20);
  pipe(14, -6, 2, C.rust, C.rustL, 15);
  for (let x = 6; x < L; x += 30) {
    g.box(x, 0, -3, x + 1, 4, 3, C.metalDD);
    g.box(x - 1, 4, -4, x + 2, 4, 4, C.yellow);
    g.box(x, 0, -8, x + 1, 11, -7, C.metalDD);
  }
  for (const x of [22, 82]) {
    g.box(x, 11, -1, x + 1, 13, 0, C.metalD);
    for (let a = 0; a < 12; a++) { const an = (a / 12) * Math.PI * 2; g.set(x, 15 + Math.round(Math.sin(an) * 3), Math.round(Math.cos(an) * 3) - 0, C.red); }
    g.box(x, 14, -1, x, 16, 1, C.red);
  }
  // glowing coolant sight-glass
  for (const x of [50, 104]) g.box(x, 6, 4, x + 3, 8, 4, C.toxic, true);
  return g;
};

/** Storage tank with hazard band, ladder and glowing gauge. */
const tankGrid = () => {
  const g = new VoxGrid();
  g.cylinder(0, 0, 0, 24, 9, (x, y, z) => (y >= 4 && y <= 5 ? hz()(x, y, z) : y > 22 ? 0xd0d4c8 : (Math.atan2(z, x) * 10 | 0) % 3 === 0 ? 0xbcc0b4 : 0xc8ccc0));
  g.ellipsoid(0, 25, 0, 9, 3, 9, 0xd8dcd0);
  trefoilZ(g, 0, 14, 10, 4.5);
  for (let y = 0; y < 26; y++) { g.set(-7, y, 7, C.metalD); g.set(-5, y, 8, C.metalD); if (y % 2 === 0) g.set(-6, y, 8, C.metal); }
  g.box(5, 10, 8, 6, 13, 8, C.metalDD);
  g.box(5, 11, 9, 6, 12, 9, C.toxic, true);
  return g;
};

/** Yellow hazard barrel (optionally leaking glowing sludge). */
const barrelGrid = (col, leak) => () => {
  const g = new VoxGrid();
  for (let y = 0; y < 9; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
    if ((x + 0.5) ** 2 + (z + 0.5) ** 2 > 9.5) continue;
    g.set(x, y, z, y === 1 || y === 7 ? C.ink : y === 8 ? shade(col, -0.15) : col);
  }
  trefoilZ(g, -0.5, 4, 3, 1.6, col, C.ink);
  g.set(1, 9, -1, C.metalD);
  if (leak) {
    g.box(-1, 7, 3, 0, 8, 3, C.toxic, true);
    g.box(-1, 4, 3, -1, 6, 3, C.toxic, true);
    for (let x = -3; x <= 3; x++) for (let z = 3; z <= 6; z++) if ((x / 3.5) ** 2 + ((z - 4.5) / 2) ** 2 < 1) g.set(x, 0, z, C.toxic, true);
  }
  return g;
};
/** Hazmat crate: yellow body, black-striped edges, trefoil sticker. */
const hazmatGrid = () => {
  const g = new VoxGrid();
  g.box(-4, 0, -4, 3, 7, 3, (x, y, z) => {
    const ex = x === -4 || x === 3, ey = y === 0 || y === 7, ez = z === -4 || z === 3;
    if ((ex && ey) || (ey && ez) || (ex && ez)) return (x + y + z) & 1 ? C.ink : C.yellow;
    return y % 3 === 0 ? C.yellowD : C.yellow;
  });
  trefoilZ(g, -0.5, 3.5, 4, 2.2, 0xf6f2e0, C.ink);
  g.box(-3, 8, -3, 2, 8, 2, C.metalD);
  return g;
};
const crateStackGrid = () => {
  const g = new VoxGrid();
  const crate = (ox, oy, oz) => g.merge(hazmatGrid(), ox, oy, oz);
  crate(-5, 0, 0); crate(4, 0, 1); crate(0, 9, 0);
  for (const [x, z] of [[13, 0], [16, -4]]) for (let y = 0; y < 9; y++) for (let a = -3; a <= 2; a++) for (let b = -3; b <= 2; b++) if ((a + 0.5) ** 2 + (b + 0.5) ** 2 <= 9.5) g.set(x + a, y, z + b, y === 1 || y === 7 ? C.ink : x > 14 ? 0x3a8a3a : C.yellow);
  return g;
};
/** Radiation warning sign on a post. */
const radSignGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 14, 0, C.metalD);
  g.box(-9, 15, 0, 9, 34, 0, C.yellow);
  g.box(-9, 15, 1, 9, 15, 1, C.ink); g.box(-9, 34, 1, 9, 34, 1, C.ink);
  g.box(-9, 15, 1, -9, 34, 1, C.ink); g.box(9, 15, 1, 9, 34, 1, C.ink);
  trefoilZ(g, 0, 27, 1, 5.6, C.yellow, C.ink);
  g.box(-8, 17, 1, 8, 21, 1, C.red);
  text(g, 'DANGER', 0, 17, 2, '+z', 0xffffff, { center: true });
  return g;
};
/** Warning beacon base (the lamp + beams rotate). */
const beaconBaseGrid = () => {
  const g = new VoxGrid();
  g.box(0, 0, 0, 0, 16, 0, C.metalD);
  g.box(-1, 16, -1, 1, 17, 1, C.metalDD);
  g.box(-1, 0, -1, 1, 0, 1, C.metalDD);
  return g;
};
const forkliftGrid = () => {
  const g = new VoxGrid();
  g.box(-6, 2, -4, 6, 7, 4, C.yellow);
  g.box(-6, 8, -4, 1, 8, 4, C.ink);
  for (const z of [-4, 4]) for (const x of [-6, 1]) g.box(x, 8, z, x, 15, z, C.ink);
  g.box(-6, 16, -4, 1, 16, 4, C.ink);
  g.box(-4, 8, -1, -2, 10, 1, 0x2a2a2a);
  g.box(-8, 2, -3, -7, 8, 3, C.metalDD);
  for (const z of [-5, 5]) for (const x of [-4, 4]) g.box(x - 1, 0, z, x + 1, 2, z, C.ink);
  g.box(7, 0, -3, 7, 14, -3, C.metalD).box(7, 0, 3, 7, 14, 3, C.metalD);
  g.box(8, 1, -3, 13, 1, -2, C.metalD).box(8, 1, 2, 13, 1, 3, C.metalD);
  g.box(8, 2, -3, 12, 6, 3, C.yellow).box(8, 2, 4, 12, 6, 4, C.ink);
  trefoilZ(g, 10, 4, 4, 1.4);
  return g;
};
const transformerGrid = () => {
  const g = new VoxGrid();
  g.box(-6, 0, -4, 5, 10, 3, (x, y) => (y % 3 === 0 ? 0x6a7a6a : 0x7a8a7a));
  for (let x = -6; x <= 5; x += 2) g.box(x, 1, 4, x, 9, 5, 0x5a6a5a);
  for (const x of [-4, 0, 4]) { g.box(x, 11, -1, x, 14, 0, 0xd8d8c8); g.box(x - 1, 12, -1, x + 1, 12, 0, 0xb8b8a8); }
  g.box(-5, 3, 4, -2, 6, 4, C.yellow);
  g.set(-4, 5, 5, C.ink).set(-3, 4, 5, C.ink).set(-4, 4, 5, C.ink);
  return g;
};
const fanVentGrid = () => {
  const g = new VoxGrid();
  for (let a = 0; a < 4; a++) { const an = a * Math.PI / 2; for (let r = 1; r < 6; r++) { g.set(Math.round(Math.cos(an) * r), Math.round(Math.sin(an) * r), 0, C.metalDD); g.set(Math.round(Math.cos(an + 0.2) * r), Math.round(Math.sin(an + 0.2) * r), 0, C.metalD); } }
  g.box(-1, -1, 0, 0, 0, 0, C.toxic, true);
  return g;
};
const fenceGrid = () => {
  const g = new VoxGrid();
  for (let x = 0; x < 30; x++) {
    const post = x % 15 === 0;
    if (post) g.box(x, 0, 0, x, 14, 0, C.metalD);
    else if (x % 2 === 0) g.box(x, 0, 0, x, 12, 0, 0x9aa2ac);
    g.set(x, 6, 0, C.metal);
    g.set(x, 13, 0, C.metal);
    if (post) for (let k = 0; k < 3; k++) g.set(x, 15 + k, -k, C.metalD);
    if (x % 3 === 0) g.set(x, 16, -1, 0x6a6a6a);
  }
  return g;
};

// --------------------------------------------------------------------------- dynamic bits

/** Rising puff clouds (steam / smoke) as instanced voxel cubes that swell and fade out. */
function addPlumes(K, sources, n, o) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1, depthWrite: (o.opacity ?? 1) >= 1 });
  const total = sources.length * n;
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, total);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const col = new THREE.Color();
  for (let i = 0; i < total; i++) im.setColorAt(i, col.setHex(0xffffff));
  K.add(im);
  const R = mulberry32(o.seed ?? 3);
  const parts = [];
  sources.forEach((s, si) => { for (let k = 0; k < n; k++) parts.push({ s, ph: k / n + R() * 0.05, ox: R() - 0.5, oz: R() - 0.5, rot: R() * 6 }); });
  K.onUpdate((dt, t) => {
    parts.forEach((p, i) => {
      const s = p.s;
      const q = (t / s.life + p.ph) % 1;
      const size = s.size * (0.35 + Math.sin(Math.min(1, q * 1.15) * Math.PI) * 0.9) * (q > 0.85 ? (1 - q) / 0.15 : 1);
      const x = s.x + p.ox * s.r + q * s.drift + Math.sin(q * 4 + p.rot) * 0.4;
      const y = s.y + q * s.rise + p.oz * 0.4;
      const z = s.z + p.oz * s.r;
      setInst(im, i, x, y, z, p.rot, 0, 0, Math.max(0.001, size));
      im.setColorAt(i, col.setHex(mixHex(s.c0, s.c1, q)));
    });
    im.instanceMatrix.needsUpdate = true;
    im.instanceColor.needsUpdate = true;
  });
  return im;
}

/** Rotating warning beacons: glowing lamp + two sweeping beams. */
function addBeacons(K, list, o = {}) {
  const lampGeo = new THREE.BoxGeometry(0.22, 0.2, 0.22);
  const beamGeo = new THREE.PlaneGeometry(1.6, 0.34);
  beamGeo.translate(0.8, 0, 0);
  const beamMat = new THREE.MeshBasicMaterial({ color: o.beam ?? 0xffb030, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  for (const [x, y, z, ph, colHex] of list) {
    const grp = new THREE.Group();
    grp.position.set(x, y, z);
    const lampMat = glowMat(colHex ?? C.amber).clone();
    lampMat.color.multiplyScalar(2);
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    grp.add(lamp);
    for (const r of [0, Math.PI]) { const b = new THREE.Mesh(beamGeo, beamMat); b.rotation.y = r; grp.add(b); }
    K.add(grp);
    K.onUpdate((dt, t) => { grp.rotation.y = t * 4 + ph; });
  }
}

/** Glowing toxic liquid strip with a scrolling pixel texture. */
function toxicTex() {
  return canvasTex('re_toxic', 32, 32, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, 0x6ad82a);
    const R = mulberry32(5);
    for (let i = 0; i < 40; i++) { const x = R() * w | 0, y = R() * h | 0; px(ctx, x, y, 2 + (R() * 4 | 0), 1, R() < 0.5 ? C.toxic : 0x4fb81e); }
    for (let i = 0; i < 10; i++) { const x = R() * w | 0, y = R() * h | 0; px(ctx, x, y, 2, 2, C.toxicL); px(ctx, x, y, 1, 1, 0xffffff); }
  }, { repeatX: true });
}
function addToxicPlane(K, x0, x1, z0, z1, y, tex, rep = 3) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  mat.color.setScalar(1.3);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
  const t2 = tex.clone();
  t2.needsUpdate = true;
  t2.wrapS = t2.wrapT = THREE.RepeatWrapping;
  t2.repeat.set((x1 - x0) / rep, (z1 - z0) / rep);
  mat.map = t2;
  K.add(m);
  return t2;
}
/** Bubbles popping up out of toxic liquid. */
function addBubbles(K, n, spots, y0) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), (() => { const m = glowMat(C.toxicL).clone(); m.color.multiplyScalar(1.6); return m; })(), n);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  K.add(im);
  const R = mulberry32(17);
  const b = Array.from({ length: n }, () => { const s = spots[Math.floor(R() * spots.length)]; return { x: s[0] + (R() - 0.5) * s[2], z: s[1] + (R() - 0.5) * s[3], ph: R(), sp: 0.5 + R() * 0.7 }; });
  K.onUpdate((dt, t) => {
    b.forEach((p, i) => {
      const q = (t * p.sp + p.ph) % 1;
      const s = q < 0.8 ? 0.05 + q * 0.12 : 0.15 * (1 - (q - 0.8) / 0.2) * 1.4;
      setInst(im, i, p.x, y0 + q * 0.18, p.z, 0, 0, 0, Math.max(0.001, s));
    });
    im.instanceMatrix.needsUpdate = true;
  });
}

// --------------------------------------------------------------------------- postcard props

/** Tower crane lattice mast (0.14 scale); the jib slews separately. */
const craneMastGrid = () => {
  const g = new VoxGrid();
  g.box(-5, 0, -5, 4, 2, 4, 0x6a6e66);
  for (let y = 3; y < 66; y++) {
    for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) g.set(x, y, z, C.yellow);
    if (y % 6 === 0) { g.line(-3, y, -3, 2, y + 5, -3, 0xd8b830); g.line(-3, y, 2, 2, y + 5, 2, 0xd8b830); g.line(-3, y, -3, -3, y + 5, 2, 0xd8b830); g.line(2, y, -3, 2, y + 5, 2, 0xd8b830); }
  }
  g.box(-3, 62, -3, 2, 65, 2, 0x4a4e46);
  g.box(-2, 62, 3, 1, 64, 3, 0x9ad8ff);
  return g;
};
const craneJibGrid = () => {
  const g = new VoxGrid();
  for (let x = -14; x <= 40; x++) {
    g.set(x, 0, -1, C.yellow).set(x, 0, 1, C.yellow);
    if (x % 3 === 0) g.line(x, 0, -1, x, 3 - Math.floor(Math.abs(x) / 16), 0, 0xd8b830);
    g.set(x, 3 - Math.floor(Math.abs(x) / 16), 0, C.yellow);
  }
  g.box(-14, -3, -2, -9, 0, 2, 0x8a8e86);
  g.box(-1, 1, -1, 1, 9, 1, C.yellow);
  g.line(0, 9, 0, 38, 2, 0, 0x3a3e36).line(0, 9, 0, -13, 1, 0, 0x3a3e36);
  return g;
};
const craneLoadGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 22; y++) g.set(0, y + 12, 0, 0x2a2e26);
  g.box(-9, 0, -5, 8, 11, 4, (x, y) => (x % 3 === 0 ? 0xd8b020 : C.yellow));
  g.box(-4, 3, 5, 3, 8, 5, C.ink);
  for (const [a, b] of [[0, 2], [-2, -1], [2, -1], [0, 0]]) g.set(a, 5 + b, 6, C.yellow);
  return g;
};
/** High-voltage pylon (0.16 scale). */
const pylonGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 62; y++) {
    const r = Math.max(1, Math.round(9 - y * 0.13));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.set(sx * r, y, sz * Math.max(1, Math.round(r * 0.5)), 0x3a4030);
    if (y % 7 === 0) g.line(-r, y, 0, r, y + 6, 0, 0x4a5038);
  }
  for (const y of [52, 60]) g.box(-14, y, -1, 13, y, 0, 0x3a4030);
  for (const x of [-14, 13]) for (const y of [52, 60]) g.box(x, y - 2, -1, x, y - 1, 0, 0xc8ccb8);
  return g;
};

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- sky: sickly green-yellow dusk with smog bands and a hazy sun
  const sky = skyTexture('reactor2', [[0, 0x16141e], [0.1, 0x262c26], [0.2, 0x46602c], [0.3, 0x8aa83c], [0.4, 0xd8c84a], [0.48, 0xf4a850], [0.62, 0xd88848], [1, 0x7a5a3a]], (ctx, w, h) => {
    const P = pixbuf(ctx, w, h);
    skyGlow(P, w * 0.36, h * 0.42, w * 0.45, h * 0.3, 0xffd870, 0.6, { bands: 6, pow: 1.3 });
    paintSunPx(P, Math.round(w * 0.36), Math.round(h * 0.36), 11, { color: 0xfff0a0, core: 0xfffce0, halo: 0xf8d060, halo2: 0xffe890, haloR: 5, haloA: 0.55 });
    const smog = { light: 0xb8b878, color: 0x7a7a54, shade: 0x54523e, dark: 0x3e3c30 };
    paintCloudBank(P, w, Math.round(h * 0.14), { ...smog, s: 10, seed: 41, depth: 6 });
    paintCumulus(P, w * 0.14, h * 0.24, 13, 42, { ...smog, sunX: 1 });
    paintCumulus(P, w * 0.72, h * 0.22, 15, 43, { ...smog, sunX: -1 });
    paintCumulus(P, w * 0.55, h * 0.36, 8, 44, { light: 0xe8d890, color: 0xa8a068, shade: 0x7a7450, dark: 0x5a5640, sunX: -1 });
    paintStreaks(P, w, { n: 12, y0: h * 0.3, y1: h * 0.5, len: [30, 90], color: 0xe8c060, shade: 0xb8c050, seed: 45, alpha: 0.55 });
    paintBirdsPx(P, [[w * 0.42, h * 0.28, 1], [w * 0.46, h * 0.25, 1], [w * 0.49, h * 0.29, 0]], 0x1e1e1a, 0.8);
    P.flush();
  }, { w: 320, h: 180, bands: 14 });
  fitSky(K, sky);

  // ---- parallax pixel layers
  K.parallax('skyline', {
    z: -160, y: -4, w: parallaxWidth(-160), h: 36, tw: 384, th: 84,
    paint: (ctx, w, h) => {
      const P = pixels(ctx, w, h);
      // distant cooling towers (hyperbolic silhouettes) with steam
      const R = mulberry32(4);
      for (let i = 0; i < 5; i++) {
        const cx = (i + 0.3 + R() * 0.4) * (w / 5), th = 30 + R() * 14, base = h;
        for (let y = 0; y < th; y++) {
          const t = (y / th - 0.7) / 0.7, r = 7 + t * t * 7;
          for (let x = -r; x <= r; x++) P.set(cx + x, base - y, x < -r * 0.3 ? 0x5a6a44 : 0x4a5838);
        }
        for (let k = 0; k < 6; k++) { const pr = 6 + k * 2.2; const py = base - th - 4 - k * 5; for (let a = -pr; a <= pr; a++) for (let b = -pr * 0.6; b <= pr * 0.6; b++) if (a * a + b * b * 2.4 < pr * pr) P.set(cx + a + k * 3, py + b, k < 2 ? 0xdfe8c0 : 0xc8d4a4, 0.85 - k * 0.1); }
      }
      P.flush();
      paintSkyline(ctx, w, h, { color: 0x3e4a30, rim: 0x6a7a48, window: [0xd8ff6a, 0xffe07a], minH: 8, maxH: 26, minW: 6, maxW: 18, seed: 22, gap: 5, lit: 0.35, antenna: true });
      // smokestacks with blinking-light pixels
      for (const fx of [0.12, 0.33, 0.47, 0.71, 0.9]) {
        const x = Math.round(fx * w), sh = 34 + Math.round(R() * 18);
        for (let y = 0; y < sh; y++) px(ctx, x, h - y, 3, 1, Math.floor(y / 5) % 2 ? 0x8a3a2a : 0x9a9a84);
        px(ctx, x, h - sh, 3, 1, 0xff4a2a);
        for (let k = 0; k < 7; k++) disc(ctx, x + 1 + k * 3, h - sh - 3 - k * 3, 2 + k * 0.6, k < 3 ? 0x6a6a5a : 0x8a8a6a);
      }
      paintGradient(ctx, 0, h - 6, w, 6, [[0, 0x4a5838], [1, 0x3a4630]], { bands: 3 });
    },
    fogTint: [0xd0b870, 0.3],
  });
  voxSkyline(K, 'refineryBlocks', { x0: -140, x1: 140, z: -104, depth: 6, scale: 0.9, minH: 5, maxH: 15, minW: 5, maxW: 13, gap: 3, seed: 9, walls: [0x4a5440, 0x56604a, 0x3e4636, 0x5e5a46], window: 0x262a20, lit: [0xd8ff6a, 0xffe07a], litP: 0.1, chimney: 0.35, antenna: 0.3 });
  K.parallax('yard', {
    z: -78, y: -2, w: parallaxWidth(-78), h: 13, tw: 320, th: 52,
    paint: (ctx, w, h) => {
      const P = pixels(ctx, w, h);
      // power pylons + sagging lines
      const pyl = [];
      for (let x = 10; x < w; x += 46) pyl.push(x);
      for (const x of pyl) {
        for (let y = 0; y < 40; y++) { const hw = Math.max(1, Math.round((40 - y) * 0.16)); P.set(x - hw, h - 4 - y, 0x3a4030); P.set(x + hw, h - 4 - y, 0x3a4030); if (y % 6 === 0) for (let k = -hw; k <= hw; k++) P.set(x + k, h - 4 - y, 0x3a4030); }
        for (let k = -6; k <= 6; k++) { P.set(x + k, h - 40, 0x3a4030); P.set(x + k, h - 33, 0x3a4030); }
      }
      for (let i = 0; i < pyl.length - 1; i++) for (const [dy, hw] of [[40, 6], [33, 6]]) for (const s of [-1, 1]) for (let k = 0; k <= 46; k++) {
        const x = pyl[i] + s * hw + k, sag = Math.sin((k / 46) * Math.PI) * 4;
        P.set(x, h - dy + sag + 1, 0x2a3020);
      }
      P.flush();
      // dead trees + toxic mounds
      const R = mulberry32(12);
      for (let i = 0; i < 18; i++) {
        const x = R() * w | 0, th = 6 + R() * 8 | 0;
        px(ctx, x, h - 4 - th, 1, th, 0x4a4030);
        px(ctx, x - 2, h - 4 - th + 2, 2, 1, 0x4a4030); px(ctx, x + 1, h - 4 - th + 4, 2, 1, 0x4a4030);
      }
      for (let i = 0; i < 9; i++) { const x = R() * w | 0, r = 4 + R() * 6 | 0; disc(ctx, x, h - 3, r, 0x5a5a3a); px(ctx, x - r + 2, h - 4, 2 * r - 4, 1, 0x9dff3a); }
      paintGradient(ctx, 0, h - 4, w, 4, [[0, 0x6a6a44], [1, 0x5a5a3a]], { bands: 2 });
    },
    fogTint: [0xd0b870, 0.08],
  });

  // ---- ground: cracked concrete / asphalt near, toxic dirt yard far
  const concCol = (x, z) => {
    const n = vnoise(x * 0.12, 7, z * 0.12), m = hash3(Math.floor(x * 2), 3, Math.floor(z * 2));
    const slab = vnoise(Math.floor(x / 4) * 0.7, 3, Math.floor(z / 4) * 0.7) > 0.58;
    if (slab) {
      if ((((x % 4) + 4) % 4) < 0.5 || (((z % 4) + 4) % 4) < 0.5) return C.concD;
      return n > 0.6 ? C.concL : m < 0.3 ? C.conc2 : C.conc;
    }
    if (vnoise(x * 0.3, 2, z * 0.3) > 0.82) return hash3(Math.floor(x * 2), 1, Math.floor(z * 2)) < 0.5 ? 0x5a4a3a : 0x3a3c3a; // oil & rust stains
    if (m < 0.05) return 0x6a6c6a;
    return n > 0.6 ? 0x5e6266 : n < 0.32 ? 0x46494e : 0x52565a;
  };
  const yardCol = (x, z) => {
    const n = vnoise(x * 0.09, 4, z * 0.09), m = hash3(Math.floor(x), 5, Math.floor(z));
    if (m < 0.03) return C.grassDead;
    return n > 0.6 ? 0x787258 : n < 0.3 ? C.dirtD : C.dirt;
  };
  K.ground({
    id: 'groundNear', x0: -64, x1: 64, z0: -14, z1: 48, scale: 0.5,
    color: (x, z) => {
      if (Math.abs(z) < LH + 0.3) return C.plateD;
      if (z > LH + 0.3 && z < LH + 1.3) return ((Math.floor(x) & 1) ? C.yellow : C.ink); // hazard apron
      if (z < -LH - 0.3 && z > -6.2) return (Math.floor(x / 2) + Math.floor(z / 2)) & 1 ? C.asph : C.asph2;
      if (Math.abs(z - 9) < 0.3 && ((Math.floor(x) & 3) < 2)) return C.yellow; // painted road line
      return concCol(x, z);
    },
  });
  K.ground({
    id: 'groundFar', x0: -120, x1: 120, z0: -72, z1: -14, scale: 1,
    color: (x, z) => {
      if (z > -40 && Math.abs(x) < 50) return concCol(x, z);
      if (Math.abs(z + 46 + Math.sin(x * 0.05) * 3) < 1.5) return C.asph;
      return yardCol(x, z);
    },
  });

  // ---- lane: riveted steel plates, toxic-green edge light strips
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 3, side: C.metalDD,
    color: (ix, iz, x, z) => {
      if (iz === -10 || iz === 9) return ((ix >> 1) & 1) ? C.yellow : C.ink;
      if (iz === -9 || iz === 8) return C.metalDD;
      const tx = ((ix % 8) + 8) % 8, tz = ((iz + 10) % 6);
      if (tx === 0 || tz === 0) return C.plateD;
      if ((tx === 1 || tx === 7) && (tz === 1 || tz === 5)) return C.rivet;
      if (vnoise(x * 0.25, 9, z * 0.7) > 0.74) return hash3(ix, 1, iz) < 0.5 ? C.rust : C.rustL;
      const tread = (ix + iz * 3) % 4 === 0 ? C.plateL : null;
      return tread ?? (((Math.floor(ix / 8) + Math.floor((iz + 10) / 6)) & 1) ? C.plate : C.plate2);
    },
    raise: (ix, iz) => iz === -10 || iz === 9,
    raiseColor: (ix) => ((ix >> 1) & 1 ? C.yellow : C.ink),
  });
  // glowing edge strips along the inner kerb lines
  K.mesh('edgeGlow', () => {
    const g = new VoxGrid();
    for (let x = -96; x < 96; x++) if ((x & 7) < 2) { g.set(x, 0, -9, C.toxic, true); g.set(x, 0, 8, C.toxic, true); }
    return g;
  }, { scale: 0.25, pivot: [0, 0, 0] }, 0, 0.0, 0, 0, [1, 0.12, 1]);
  // radiation trefoil centre marker
  K.mesh('centerTrefoil', () => {
    const g = new VoxGrid();
    for (let u = -9; u <= 9; u++) for (let v = -9; v <= 9; v++) {
      const r = Math.hypot(u, v);
      if (r > 9.4) continue;
      g.set(u, 0, v, r > 8.2 ? C.toxic : trefoil(u, v, 7.6) ? C.ink : C.yellow, r > 8.2);
    }
    return g;
  }, { scale: 0.08, pivot: [0, 0, 0] }, 0.04, 0.002, 1.5);

  // ---- toxic channel behind the lane + puddles in front
  const ttex = toxicTex();
  K.mesh('channelWalls', () => {
    const g = new VoxGrid();
    for (let x = -240; x < 240; x++) for (const z of [0, 7]) { g.set(x, 0, z, (x & 15) === 0 ? C.yellow : C.concD); g.set(x, -1, z, C.concD); }
    return g;
  }, { scale: 0.25, pivot: [0, 0, 0] }, 0, -0.17, -5.85);
  const chTex = addToxicPlane(K, -60, 60, -5.6, -4.1, 0.0, ttex, 2.5);
  const puddleGrid = () => {
    const g = new VoxGrid();
    const spots = [[-17, 5.2, 2.2, 1], [-5.5, 7.4, 1.6, 0.8], [7, 4.6, 2.6, 0.9], [18.5, 6.8, 1.8, 1.1], [-27, 8, 2.4, 1.2], [29, 4.8, 2, 0.9], [-36, 5, 2, 1], [38, 7.5, 2.6, 1.1]];
    for (const [cx, cz, rx, rz] of spots) for (let x = Math.floor((cx - rx - 1) * 4); x <= (cx + rx + 1) * 4; x++) for (let z = Math.floor((cz - rz - 1) * 4); z <= (cz + rz + 1) * 4; z++) {
      const d = ((x / 4 - cx) / rx) ** 2 + ((z / 4 - cz) / rz) ** 2 + (vnoise(x * 0.3, z * 0.3, cx) - 0.5) * 0.5;
      if (d < 0.3) g.set(x, 0, z, hash3(x, 1, z) < 0.5 ? C.toxicL : C.toxic, hash3(x, 1, z) < 0.5);
      else if (d < 0.6) g.set(x, 0, z, d < 0.45 ? 0x7ad82e : 0x58b024);
      else if (d < 1.05) g.set(x, 0, z, d < 0.9 ? C.sludge : C.sludgeD);
    }
    return g;
  };
  K.mesh('puddles', puddleGrid, { scale: 0.25, pivot: [0, 0, 0] }, 0, -0.01, 0, 0, [1, 0.1, 1]);
  addBubbles(K, 46, [[0, -4.85, 110, 1.2], [-17, 5.2, 2.6, 1.2], [7, 4.6, 3, 1], [18.5, 6.8, 2, 1.2], [-5.5, 7.4, 1.8, 0.8]], 0.0);
  K.onUpdate((dt, t) => { chTex.offset.x = (t * 0.08) % 1; chTex.offset.y = Math.sin(t * 0.7) * 0.05; });

  // ---- breakables right behind the lane
  const brk = [[-19, 'barrel', 0], [-9.6, 'crate'], [-3.2, 'barrel', 1], [4.6, 'crate'], [10.4, 'barrel', 0], [18.4, 'barrel', 1]];
  for (const [x, kind, leak] of brk) {
    if (kind === 'crate') K.breakable('crate', 'hazmat', hazmatGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else K.breakable('barrel', leak ? 'leakBarrel' : 'hazBarrel', barrelGrid(leak ? 0x3a9a3a : C.yellow, leak), { scale: 0.1 }, x, -3.15, K.rand(-0.4, 0.4));
  }

  // ---- signs, beacons, pipes, catwalks behind the channel
  K.inst('radSign', radSignGrid, { scale: 0.075 }, [[-23, 0, -6.4, 0.1], [-13.5, 0, -6.6, -0.1], [1.2, 0, -6.4, 0.05], [14.5, 0, -6.5, -0.1], [26, 0, -6.3, 0.1]], { shadow: true });
  K.inst('beaconPost', beaconBaseGrid, { scale: 0.1 }, [[-17.5, 0, -6.6], [-7.2, 0, -6.6], [7.6, 0, -6.6], [21.5, 0, -6.6]], { shadow: true });
  K.inst('pipeRun', pipeRunGrid, { scale: 0.1 }, [[-48, 0, -8.4], [-36, 0, -8.4], [-24, 0, -8.4], [-12, 0, -8.4], [0, 0, -8.4], [12, 0, -8.4], [24, 0, -8.4], [36, 0, -8.4]], { shadow: true });
  K.inst('catwalk', catwalkGrid, { scale: 0.1 }, [[-27, 0, -11.2], [-21, 0, -11.2], [9, 0, -11.2], [15, 0, -11.2]], { shadow: true });
  K.inst('stairs', stairsGrid, { scale: 0.1 }, [[-27, 0, -11.2], [9, 0, -11.2]]);
  addBeacons(K, [
    [-17.5, 1.75, -6.6, 0], [-7.2, 1.75, -6.6, 1.3], [7.6, 1.75, -6.6, 2.1], [21.5, 1.75, -6.6, 0.7],
    [-15.2, 3.2, -11.2, 0.4, C.red], [20.8, 3.2, -11.2, 2.4, C.red], [-1.8, 6.8, -21.5, 1.0, C.red], [9.6, 4.6, -21.5, 3.0, C.red],
  ]);
  K.inst('tank', tankGrid, { scale: 0.13 }, [[-33, 0, -15, 0.3], [-4.5, 0, -14.6, 0], [26, 0, -14.4, -0.4], [33, 0, -17, 0.8]], { shadow: true });
  K.inst('crateStack', crateStackGrid, { scale: 0.1 }, [[-11, 0, -14, 0.2], [3.5, 0, -13.2, -0.3], [18, 0, -14.2, 0.5], [-39, 0, -9, 0.1], [40, 0, -9.5, -0.6]], { shadow: true });
  K.inst('forklift', forkliftGrid, { scale: 0.1, ao: true }, [[-30.5, 0, -6.2, 0.4], [30.5, 0, -6.8, 2.6]], { shadow: true });
  K.inst('transformer', transformerGrid, { scale: 0.12, ao: true }, [[-20.5, 0, -15.5, 0], [12.5, 0, -16, 0]], { shadow: true });
  K.inst('fence', fenceGrid, { scale: 0.12 }, Array.from({ length: 34 }, (_, i) => [-61 + i * 3.6, 0, -37.5]));

  // ---- landmarks: containment dome, cooling towers, smokestack
  K.mesh('reactor', reactorGrid, { scale: 0.2 }, -1.5, 0, -24.5, 0, 1, { shadow: true });
  const fans = [];
  for (const x of [-30, -24, 24, 30]) {
    const f = K.mesh('fanVent', fanVentGrid, { scale: 0.13, pivot: [0, 0, 0] }, -1.5 + x * 0.2, 20 * 0.2, -24.5 - 4.5 * 0.2, 0, 1);
    f.rotation.x = -Math.PI / 2;
    fans.push(f);
  }
  K.onUpdate((dt, t) => { fans.forEach((f, i) => { f.rotation.z = t * (5 + i); }); });
  const towers = [[-25, -38, 0.23], [25, -40, 0.25], [-54, -48, 0.25]];
  for (const [x, z, s] of towers) K.mesh('coolTower', coolingTowerGrid, { scale: s }, x, 0, z);
  K.mesh('stack', stackGrid, { scale: 0.22 }, 9.5, 0, -28, 0, 1);
  addPlumes(K, towers.map(([x, z, s]) => ({ x, y: 46 * s, z, r: 8 * s, rise: 10, drift: 7, size: 1.3, life: 8, c0: 0xeef0e2, c1: 0xb8bca4 })), 26, { seed: 4, opacity: 0.72 });
  addPlumes(K, [{ x: 9.5, y: 64 * 0.22, z: -28, r: 0.6, rise: 8, drift: 6, size: 1.1, life: 5, c0: 0x3e3e3a, c1: 0x7a7a6a }], 14, { seed: 8, opacity: 0.85 });

  // ---- LOW foreground: drain grates, low pipe stubs, debris
  K.inst('grate', () => { const g = new VoxGrid(); g.box(-4, 0, -3, 3, 0, 2, (x, y, z) => ((x & 1) ? C.metalDD : C.ink)); g.box(-5, 0, -4, 4, 0, 3, (x, y, z) => (Math.abs(x + 0.5) > 4 || Math.abs(z + 0.5) > 3 ? C.metalD : undefined)); return g; }, { scale: 0.12 },
    [[-12, 0.0, 4.4], [2, 0.0, 5.6], [13, 0.0, 4.4], [24, 0.0, 6.1], [-24, 0.0, 6.0]].map((p) => [p[0], -0.02, p[2]]));
  K.inst('lowPipe', () => { const g = new VoxGrid(); for (let x = -12; x < 12; x++) for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (a * a + b * b < 2.5) g.set(x, a + 1, b, Math.abs(x) % 8 === 0 ? C.metalD : C.pipeG); g.box(-12, 0, -2, -12, 0, 2, C.metalDD); g.box(11, 0, -2, 11, 0, 2, C.metalDD); return g; }, { scale: 0.12 }, [[-31, 0, 10, 0.2], [32, 0, 11, -0.3], [-8, 0, 13, 0.1]]);
  const debris = [];
  for (let i = 0; i < 40; i++) debris.push([K.rand(-40, 40), 0, K.rand(LH + 1.6, 14), K.rand(0, 6), K.rand(0.5, 1.2)]);
  K.inst('debris', () => { const g = new VoxGrid(); g.box(0, 0, 0, 1, 0, 0, C.concD); g.set(0, 1, 0, C.conc2); return g; }, { scale: 0.12 }, debris);

  // ---- postcard extras: tower crane swinging a hazard container, voxel pylons, steam vents, toxic fireflies, crows
  {
    const cx = -14, cz = -33;
    K.mesh('craneMast', craneMastGrid, { scale: 0.14 }, cx, 0, cz);
    const jib = K.mesh('craneJib', craneJibGrid, { scale: 0.14, pivot: [0, 0, 0] }, cx, 66 * 0.14, cz);
    const load = K.mesh('craneLoad', craneLoadGrid, { scale: 0.1, pivot: [0, 1, 0] }, 0, 0, 0);
    K.onUpdate((dt, t) => {
      const a = Math.sin(t * 0.16) * 1.1 + 0.4;
      jib.rotation.y = a;
      const r = 30 * 0.14 + Math.sin(t * 0.3) * 0.8;
      load.position.set(cx + Math.cos(a) * r, 66 * 0.14 - 2.4 + Math.sin(t * 0.5) * 0.6, cz - Math.sin(a) * r);
      load.rotation.y = a + Math.sin(t * 0.7) * 0.2;
    });
    blinkInst(K, 'craneTip', () => new VoxGrid().set(0, 0, 0, 0xff3a2a, true), { scale: 0.16, pivot: 'center' }, [[cx, 66 * 0.14 + 1.3, cz]], { groups: 1, mode: 'twinkle', rate: 0.7, duty: 0.3 });
  }
  K.inst('pylon', pylonGrid, { scale: 0.16 }, [-58, -30, 2, 34, 62].map((x) => [x, 0, -60, 0]));
  {
    const wire = [];
    const px0 = [-58, -30, 2, 34, 62];
    for (let i = 0; i < px0.length - 1; i++) for (const dz of [-0.9, 0.9]) for (let k = 0; k <= 28; k++) {
      const u = k / 28, x = px0[i] + (px0[i + 1] - px0[i]) * u;
      wire.push([x, 9.6 - Math.sin(u * Math.PI) * 1.4, -60 + dz, 0, [12, 1, 1]]);
    }
    K.inst('pylonWire', () => new VoxGrid().set(0, 0, 0, 0x22261c), { scale: 0.09, pivot: 'center' }, wire);
  }
  addPuffs(K, { id: 'ventSteam', sources: [[-36, 1.2, -8.4], [-12, 1.2, -8.4], [12, 1.2, -8.4], [36, 1.2, -8.4], [-20.5, 2.4, -15.5], [12.5, 2.4, -16]], n: 4, life: 3, rise: 2.6, drift: [0.8, -0.2], size: [0.35, 1.1], scale: 0.1, color: 0xe8ecdc, light: 0xffffff, shade: 0xb8bca8, opacity: 0.75, seed: 6 });
  addSparkles(K, { id: 'toxicFly', n: 22, area: [-28, 28, 0.3, 2.2, -6.2, -3.6], color: 0xb8ff4a, scale: 0.06, rate: 0.6, wander: 0.6, sharp: 1.5, seed: 11 });
  addSparkles(K, { id: 'puddleFly', n: 12, area: [-30, 30, 0.2, 0.9, LH + 1.5, 8], color: 0x9dff3a, scale: 0.05, rate: 0.5, wander: 0.5, sharp: 1.5, seed: 13 });
  addBirds(K, { id: 'crows', n: 5, mode: 'circle', cx: 9.5, cy: 15.5, cz: -30, r: 6, rz: 0.5, speed: 0.28, color: 0x1e1e24, wingTip: 0x101014, belly: 0x2a2a30, beak: 0x3a3a3a, head: 0x1e1e24, vox: 0.06, flap: 8, soar: 0.6, seed: 4 });

  return {
    sky,
    fog: { color: 0xc8b878, near: 75, far: 260 },
    lights: { sky: 0xe8ecd4, ground: 0x5e5648, hemi: 1.1, sun: 2.2, sunColor: 0xffcc90, dir: [-9, 11, 8], rim: 0.8, rimColor: 0xb8ff7a },
    dust: 0xb8b8a0,
    bloom: { strength: 0.6, threshold: 1.7, radius: 0.25 },
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // concrete pad with hazard edging, a toxic pool, a mini reactor, towers and pipes
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const r = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5)) * 0.7 + Math.hypot(x + 0.5, z + 0.5) * 0.3;
      if (r > 26.5) continue;
      const edge = r > 24.6;
      g.set(x, 0, z, edge ? ((x + z) >> 1) & 1 ? C.yellow : C.ink : (((x >> 2) + (z >> 2)) & 1) ? C.conc : C.conc2);
      for (let y = -1; y >= -4; y--) g.set(x, y, z, y === -1 && edge ? C.concD : (hash3(x, y, z) < 0.3 ? C.dirtD : C.dirt));
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  K.mesh('reactor', reactorGrid, { scale: 0.08 }, -0.5, 0, -2.6, 0.2, 1, { shadow: true });
  K.mesh('coolTower', coolingTowerGrid, { scale: 0.085 }, -4.2, 0, -3.6);
  K.mesh('stack', stackGrid, { scale: 0.065 }, 4.6, 0, -4.0);
  addPlumes(K, [{ x: -4.2, y: 46 * 0.085, z: -3.6, r: 0.5, rise: 3, drift: 1.5, size: 0.55, life: 6, c0: 0xf4f8ec, c1: 0xc8ccb4 }, { x: 4.6, y: 64 * 0.065, z: -4.0, r: 0.15, rise: 2.5, drift: 1.5, size: 0.35, life: 4, c0: 0x4a4a44, c1: 0x8a8a7a }], 12, { seed: 6, opacity: 0.8 });
  // toxic pool with bubbles
  K.mesh('poolRim', () => {
    const g = new VoxGrid();
    for (let x = -14; x <= 13; x++) for (let z = -9; z <= 8; z++) {
      const d = ((x + 0.5) / 13.5) ** 2 + ((z + 0.5) / 8.5) ** 2;
      if (d > 1) continue;
      const gl = d <= 0.72 && hash3(x, 2, z) < 0.12;
      g.set(x, 0, z, d > 0.72 ? (d > 0.86 ? C.concD : C.sludgeD) : gl ? C.toxicL : d > 0.5 ? 0x6ac82a : 0x8ae83a, gl);
    }
    return g;
  }, { scale: 0.13, pivot: [0, 0, 0] }, 2.6, 0.001, 2.6, 0, [1, 0.3, 1]);
  addBubbles(K, 14, [[2.6, 2.6, 2.4, 1.4]], 0.04);
  K.inst('hazBarrel', barrelGrid(C.yellow, false), { scale: 0.08, ao: true }, [[-2.6, 0, 3.6, 0.3], [-3.4, 0, 2.8, 1.2], [-1.9, 0, 4.6, 2.1], [5, 0, 0.6, 0.5]], { shadow: true });
  K.mesh('leakBarrel', barrelGrid(0x3a9a3a, true), { scale: 0.08, ao: true }, -4.6, 0, 1.2, 0.4, 1, { shadow: true });
  K.inst('hazmat', hazmatGrid, { scale: 0.09, ao: true }, [[4.6, 0, 3.4, 0.2], [5.4, 0, 2.2, -0.4]], { shadow: true });
  K.inst('radSign', radSignGrid, { scale: 0.06, ao: true }, [[0.6, 0, 5.4, 0], [4.2, 0, 4.6, -0.4]], { shadow: true });
  K.inst('pipeRun', pipeRunGrid, { scale: 0.05 }, [[-5.9, 0, 0.6, Math.PI / 2]], { shadow: true });
  addBeacons(K, [[1.2, 3.4, -2.6, 0, C.red], [-5.9, 0.95, -3.3, 1.4]]);
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; K.root.add(o); K.hotspots[name] = o; return o; };
  anchor('boss', -1.2, 0, 3.6);
  anchor('npc', 3.2, 0, 5.0);
  anchor('enterReactor', -0.5, 0.8, -1.4);
  return { focus: [0, 1.2, 0], radius: 7 };
}
