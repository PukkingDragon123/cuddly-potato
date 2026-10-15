// Arena 1: BEAST LAB — the futuristic Lab compound yard where every recruit
// starts. Clean white/blue lab tiles, hazard-striped lane edges, bubbling
// specimen tanks, a giant glowing MRBEAST LAB billboard, satellite dishes and
// lab domes, layered over pixel-art hills, mountains and a bright sky.
import {
  THREE, VoxGrid, ArenaKit, FIELD, shade, mixHex, hash3, vnoise, text, textW, glassMat, glowMat, mulberry32, canvasTex,
  paintGradient, paintClouds, paintRidge, paintTrees, paintSkyline, paintSun, px, disc, skyTexture, parallaxWidth,
  treeGrid, rockGrid, signGrid,
  pixbuf, skyGlow, paintSunPx, paintCumulus, paintCloudBank, paintStreaks, paintBirdsPx, paintRange,
  setInstance, liveInstances, swayInst, blinkInst, addPuffs, addSparkles, addClouds, addBirds, voxRange, addFlag,
  leafyTreeGrid, pineTreeGrid, bushGrid, flowerGrid, tuftGrid,
} from './kit.js';

const C = {
  tile: 0xf2f6fc, tile2: 0xe2eaf6, seam: 0x9fb4d6, blue: 0x29b6f6, blueD: 0x1477c9, pink: 0xff2e88, yellow: 0xffd23f, ink: 0x15121f,
  grass: 0x5cc24a, grassD: 0x3f9e3a, grassL: 0x86de5e, metal: 0xb8c0cc, metalD: 0x6b7386, glass: 0xbfe9ff,
};

// --------------------------------------------------------------------------- shared props

const tankGrid = (liquid) => () => {
  const g = new VoxGrid();
  // base
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    const d = (x + 0.5) ** 2 + (z + 0.5) ** 2;
    if (d <= 36) { g.set(x, 0, z, C.metalD); g.set(x, 1, z, d > 25 ? C.yellow : C.metal); }
    if (d <= 36 && d > 25) g.set(x, 2, z, (x + z) & 1 ? C.yellow : C.ink);
  }
  // cap
  for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    const d = (x + 0.5) ** 2 + (z + 0.5) ** 2;
    if (d <= 36) { g.set(x, 22, z, C.metal); g.set(x, 23, z, d > 20 ? C.metalD : C.metal); }
  }
  for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) g.set(x, 24, z, C.blue, true);
  // struts
  for (const [x, z] of [[-6, -1], [5, -1], [-1, -6], [-1, 5]]) for (let y = 3; y < 22; y++) g.set(x, y, z, C.metalD);
  void liquid;
  return g;
};

function addTank(K, x, z, liquid, s = 0.12) {
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  K.add(grp);
  K.mesh('tankFrame', tankGrid(liquid), { scale: s, ao: true }, 0, 0, 0, 0, 1, { parent: grp, shadow: true });
  const r = 5.4 * s, h = 19 * s;
  const liq = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.96, r * 0.96, h * 0.86, 20), new THREE.MeshBasicMaterial({ color: liquid, transparent: true, opacity: 0.55, toneMapped: false }));
  liq.position.y = 3 * s + h * 0.43;
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20, 1, true), glassMat(C.glass, 0.22));
  glass.position.y = 3 * s + h / 2;
  grp.add(liq, glass);
  // floating specimen silhouette + rising bubbles
  const bubbles = [];
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), glowMat(shade(liquid, 0.6)));
    b.userData.o = Math.random() * 10;
    b.position.set((Math.random() - 0.5) * r, 0, (Math.random() - 0.5) * r);
    grp.add(b);
    bubbles.push(b);
  }
  K.onUpdate((dt, t) => {
    for (const b of bubbles) {
      const k = ((t * 0.35 + b.userData.o) % 1);
      b.position.y = 3 * s + k * h * 0.84;
    }
    liq.material.opacity = 0.5 + Math.sin(t * 2 + x) * 0.05;
  });
  return grp;
}

const domeGrid = () => {
  const g = new VoxGrid();
  const R = 14;
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) for (let y = 0; y <= R; y++) {
    const d = Math.sqrt(x * x + y * y * 1.25 + z * z);
    if (d > R || d < R - 1.6) continue;
    const ring = y % 4 === 0;
    const win = !ring && Math.abs(x) % 5 < 2 && y > 2 && y < 10;
    g.set(x, y, z, win ? 0x8fe3ff : ring ? C.blue : C.tile, win);
  }
  for (let x = -R - 1; x <= R + 1; x++) for (let z = -R - 1; z <= R + 1; z++) if (x * x + z * z <= (R + 1) ** 2) g.set(x, 0, z, C.metalD);
  // antenna
  for (let y = R; y < R + 6; y++) g.set(0, y, 0, C.metal);
  g.set(0, R + 6, 0, C.pink, true);
  return g;
};

const dishGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 10; y++) g.box(-1, y, -1, 0, y, 0, C.metalD);
  for (let x = -7; x <= 6; x++) for (let y = -7; y <= 6; y++) {
    const d = (x + 0.5) ** 2 + (y + 0.5) ** 2;
    if (d <= 49) g.set(x, y + 16, Math.round(d / 14), d > 36 ? C.metal : C.tile);
  }
  for (let z = 0; z < 6; z++) g.set(0, 16, -z - 1, C.metalD);
  g.set(0, 16, -7, C.pink, true);
  return g;
};

const fenceGrid = () => {
  const g = new VoxGrid();
  for (let x = 0; x < 24; x++) {
    const post = x % 12 === 0;
    for (let y = 0; y < (post ? 9 : 7); y++) g.set(x, y, 0, post ? C.metalD : y === 0 || y === 6 ? C.metal : (x + y) % 2 ? 0xd8e6f6 : 0xc6d6ec);
    if (post) g.set(x, 9, 0, C.blue, true);
    if (x % 12 === 6) for (let y = 2; y < 5; y++) g.set(x, y, 1, C.pink);
  }
  return g;
};

const crateGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 5, 2, 0xc9874a);
  g.box(-3, 0, -3, 2, 0, 2, 0x8a5a2a);
  g.box(-3, 5, -3, 2, 5, 2, 0xe0a060);
  for (const z of [-3, 2]) for (let x = -3; x <= 2; x++) { g.set(x, x + 3, z, 0x8a5a2a); }
  text(g, '$', 0, 1, 3, '+z', C.yellow, { center: true });
  return g;
};

const barrelGrid = (col) => () => {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
    if ((x + 0.5) ** 2 + (z + 0.5) ** 2 > 9.5) continue;
    g.set(x, y, z, y === 1 || y === 6 ? shade(col, -0.25) : col);
  }
  for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) g.set(x, 8, z, shade(col, 0.2));
  // hazard trefoil-ish sticker
  g.set(-1, 4, 3, C.yellow).set(0, 4, 3, C.yellow).set(-1, 3, 3, C.ink).set(0, 3, 3, C.yellow);
  return g;
};

const bollardGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 3; y++) g.box(-1, y, -1, 0, y, 0, y === 2 ? C.blue : (y & 1 ? C.yellow : C.ink));
  g.box(-1, 3, -1, 0, 3, 0, C.blue);
  return g;
};

const robotArmGrid = () => {
  const g = new VoxGrid();
  g.box(-3, 0, -3, 2, 2, 2, C.metalD);
  g.box(-1, 3, -1, 0, 12, 0, C.yellow);
  g.box(-2, 12, -2, 1, 14, 1, C.metalD);
  for (let i = 0; i < 9; i++) g.box(i - 1, 14 + Math.round(i * 0.4), -1, i, 15 + Math.round(i * 0.4), 0, C.yellow);
  g.box(8, 16, -2, 10, 19, 1, C.metalD);
  g.set(9, 15, 0, C.pink, true);
  return g;
};

// --------------------------------------------------------------------------- battle props (postcard backdrop)

const HQ = { x: 0, z: -44 };
const W2 = 0xdfe7f2, GLASS = 0x4aa4e4, GLASSL = 0xa8e4ff, GLASSD = 0x23609e, FRAME = 0xc8d2e2, NAVY = 0x1a2340;

/** The Beast Lab HQ: stepped white campus with glass curtain walls, a glass atrium dome, rooftop kit and a helipad (0.2 scale). */
const hqGrid = () => {
  const g = new VoxGrid();
  const block = (x0, x1, z0, z1, y1, o = {}) => {
    const fh = o.floorH ?? 7, ww = o.winW ?? 5;
    for (let x = x0; x <= x1; x++) for (let y = 0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
      const face = z === z1 ? x - x0 : x === x0 || x === x1 ? z - z0 : -1;
      let c = (x * 7 + y * 3) % 23 === 0 ? W2 : C.tile;
      const fl = (y - 2) % fh;
      if (y < 2) c = 0x8a96aa;
      else if (y === y1) c = FRAME;
      else if (fl === 0) c = y % (fh * 2) === 2 ? C.blue : 0xb8c6da;
      if (face >= 0 && y >= 2 && y < y1 - 1 && fl >= 2 && fl <= fh - 2) {
        const wu = face % ww;
        if (wu >= 1 && wu <= ww - 2) {
          if (o.curtain || ((face / ww | 0) + (y / fh | 0)) % 7 !== 3) {
            // recessed window: glass one voxel back
            const glass = fl === fh - 2 ? GLASSL : wu === 1 && fl === 2 ? GLASSD : hash3(face, y, 3) < 0.08 ? 0xfff2c0 : GLASS;
            if (z === z1) { g.set(x, y, z - 1, glass); continue; }
            if (x === x0) { g.set(x + 1, y, z, glass); continue; }
            if (x === x1) { g.set(x - 1, y, z, glass); continue; }
          }
        }
      }
      g.set(x, y, z, c);
    }
    // parapet + rooftop
    for (let x = x0; x <= x1; x++) { g.set(x, y1 + 1, z1, FRAME); g.set(x, y1 + 1, z0, FRAME); if (x % 4 === 0) g.set(x, y1 + 2, z1, C.metal); }
    for (let z = z0; z <= z1; z++) { g.set(x0, y1 + 1, z, FRAME); g.set(x1, y1 + 1, z, FRAME); }
    for (let x = x0; x <= x1; x += 2) g.set(x, y1 + 3, z1, C.metalD);
  };
  // wings, then the taller centre block
  block(-66, -23, -10, 9, 26, { floorH: 6, winW: 5 });
  block(22, 65, -10, 9, 26, { floorH: 6, winW: 5 });
  block(-22, 21, -13, 13, 40, { floorH: 7, winW: 4, curtain: true });
  // glass atrium dome with white ribs
  for (let x = -18; x <= 17; x++) for (let z = -11; z <= 11; z++) for (let y = 0; y <= 14; y++) {
    const d = Math.hypot((x + 0.5) / 18, y / 14, (z + 0.5) / 12);
    if (d > 1 || d < 0.86) continue;
    const ang = Math.atan2(z + 0.5, x + 0.5);
    const rib = Math.abs(((ang / (Math.PI / 6)) % 1 + 1) % 1 - 0.5) > 0.42 || y % 5 === 0;
    g.set(x, 42 + y, z, rib ? 0xf4f8ff : y > 9 ? GLASSL : (x + y) % 6 === 0 ? 0x7cc8f4 : GLASS);
  }
  g.box(-1, 56, -1, 0, 57, 0, C.metal);
  // entrance: recessed glass doors, canopy, columns, sign
  g.box(-9, 2, 11, 8, 15, 13, null);
  g.box(-9, 2, 11, 8, 15, 11, (x, y) => (x % 4 === 0 || y === 9 ? FRAME : y > 12 ? GLASSL : GLASS));
  g.box(-12, 16, 13, 11, 17, 19, C.blue);
  g.box(-12, 17, 19, 11, 17, 19, C.pink);
  for (const x of [-11, 10]) g.box(x, 2, 18, x, 15, 18, C.metal);
  g.box(-21, 20, 14, 20, 30, 14, NAVY);
  text(g, 'BEAST LAB', 0, 23, 15, '+z', C.pink, { center: true, scale: 1, sy: 1, depth: 1 });
  g.box(-21, 20, 15, 20, 20, 15, C.blue).box(-21, 30, 15, 20, 30, 15, C.blue);
  // steps
  for (let k = 0; k < 3; k++) g.box(-14 + k, k, 14 + 6 - k * 2, 13 - k, k, 14 + 7 - k * 2, k ? 0xe2e8f2 : 0xb8c4d4);
  // rooftop AC units with fan grilles (left wing) and solar rows (left + centre)
  for (const [x, z] of [[-60, -6], [-52, -6], [-60, 1], [30, -6], [38, -6]]) {
    g.box(x, 28, z, x + 5, 31, z + 4, 0xd0d8e4);
    for (let k = 0; k < 2; k++) g.box(x + 1 + k * 3, 32, z + 1, x + 2 + k * 3, 32, z + 2, 0x4a5262);
  }
  for (let r = 0; r < 3; r++) for (let x = -45; x <= -26; x++) {
    g.set(x, 28 + r, -8 + r * 4, (x % 4 === 0) ? 0x9fb4d6 : 0x1f3a7a);
    g.set(x, 28 + r, -7 + r * 4, (x % 4 === 0) ? 0x9fb4d6 : 0x2a4c96);
  }
  // helipad on the right wing
  for (let x = 44; x <= 62; x++) for (let z = -9; z <= 8; z++) {
    const d = Math.hypot(x - 53, z + 0.5);
    if (d <= 8.6) g.set(x, 28, z, d > 7.4 ? C.yellow : 0x3a4252);
  }
  text(g, 'H', 53, 29, 2, '+y', 0xffffff, { center: true, scale: 1 });
  // glass stair towers at the wing ends
  for (const cx of [-70, 69]) {
    for (let y = 0; y <= 34; y++) for (let x = cx - 4; x <= cx + 4; x++) for (let z = -6; z <= 3; z++) {
      const d = Math.hypot(x - cx, (z + 1.5) * 0.9);
      if (d > 4.4) continue;
      const shell = d > 3.3;
      if (!shell && y < 34) continue;
      g.set(x, y, z, y >= 33 ? FRAME : y % 6 === 0 ? C.blue : shell && (x + z) % 3 === 0 ? GLASSL : GLASS);
    }
  }
  return g;
};

/** Slim voxel antenna mast (glow tip is a separate blinking light). */
const mastGrid = (h) => () => {
  const g = new VoxGrid();
  for (let y = 0; y < h; y++) { g.set(0, y, 0, y % 6 === 0 ? C.metalD : C.metal); if (y % 6 === 3 && y < h - 6) g.set(1, y, 0, C.metalD).set(-1, y, 0, C.metalD); }
  return g;
};
const beaconGrid = (col) => () => new VoxGrid().box(-1, 0, -1, 0, 1, 0, col, true);

/** Biodome greenhouse with palms showing through the open panes (0.12 scale). */
const biodomeGrid = () => {
  const g = new VoxGrid();
  const R = 26;
  // ground bed + plants inside first (so panes overwrite overlap)
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) if (x * x + z * z <= R * R) g.set(x, 0, z, (x * 3 + z) % 7 === 0 ? 0x6a4a2a : 0x5a9a3a);
  for (const [px0, pz0, h] of [[-8, 4, 20], [6, -4, 24], [12, 8, 16], [-14, -6, 14]]) {
    for (let y = 1; y < h; y++) g.set(px0 + Math.round(Math.sin(y * 0.2)), y, pz0, 0x8a6a3a);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]])
      for (let k = 1; k < 8; k++) g.set(px0 + Math.round(dx * k), h + Math.round(1.5 - k * k / 14), pz0 + Math.round(dz * k), k % 3 ? 0x3faa48 : 0x2a8a3a);
  }
  for (let x = -R; x <= R; x++) for (let z = -R; z <= R; z++) for (let y = 0; y <= R; y++) {
    const d = Math.sqrt(x * x + y * y * 1.2 + z * z);
    if (d > R || d < R - 1.4) continue;
    const ang = Math.atan2(z, x), lat = Math.floor(y / 5);
    const frame = y % 5 === 0 || Math.abs((((ang + lat * 0.26) / (Math.PI / 10)) % 1 + 1) % 1 - 0.5) > 0.4;
    if (!frame && z > 4 && y > 2 && y < 16 && hash3(x, y, z) < 0.5) continue; // open panes show the jungle inside
    g.set(x, y, z, frame ? 0xf4f8ff : y > R * 0.7 ? 0xd8f4ff : (x + y) % 5 === 0 ? 0xbfe8ff : 0x9ad8f4);
  }
  for (let x = -R - 1; x <= R + 1; x++) for (let z = -R - 1; z <= R + 1; z++) if (x * x + z * z <= (R + 1) ** 2 && x * x + z * z > (R - 1) ** 2) g.set(x, 0, z, C.metalD);
  for (let y = R - 1; y < R + 5; y++) g.set(0, y, 0, C.metal);
  return g;
};

/** Water tower with the BEAST logo (0.12 scale). */
const waterTowerGrid = () => {
  const g = new VoxGrid();
  for (const [x, z] of [[-9, -9], [8, -9], [-9, 8], [8, 8]]) { g.box(x, 0, z, x, 40, z, C.metalD); }
  for (let y = 8; y < 40; y += 10) { g.line(-9, y, -9, 8, y + 9, -9, C.metal); g.line(8, y, 8, -9, y + 9, 8, C.metal); g.line(-9, y, 8, -9, y + 9, -9, C.metal); g.line(8, y, -9, 8, y + 9, 8, C.metal); }
  g.box(-1, 0, -1, 0, 40, 0, C.metal);
  for (let y = 40; y < 62; y++) {
    const r = y < 44 ? 9 + (y - 40) * 0.6 : y > 56 ? 11.4 - (y - 56) * 1.6 : 11.4;
    for (let x = -13; x <= 12; x++) for (let z = -13; z <= 12; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > r) continue;
      g.set(x, y, z, y > 56 ? C.blueD : y === 44 || y === 55 ? C.blueD : (x + 0.5) < -4 ? 0xffffff : C.tile);
    }
  }
  g.box(-8, 46, 11, 7, 53, 12, C.pink);
  text(g, 'BEAST', 0, 47, 13, '+z', 0xffffff, { center: true });
  for (let x = -12; x <= 11; x++) if (x % 3 === 0) g.set(x, 41, 13, C.metalD);
  g.box(-12, 40, 12, 11, 40, 13, C.metalD);
  g.box(-1, 62, -1, 0, 64, 0, C.metal);
  return g;
};

/** Wind turbine tower + nacelle (0.15 scale); the rotor spins separately. */
const turbineGrid = () => {
  const g = new VoxGrid();
  for (let y = 0; y < 62; y++) { const r = y < 4 ? 2.4 : 1.6 - y * 0.008; g.cylinder(-0.5, -0.5, y, y, r, y < 4 ? 0xb8c0cc : y % 20 === 10 ? 0xe8edf4 : 0xf6f8fc); }
  g.box(-2, 61, -3, 1, 64, 4, 0xf0f4f8).box(-2, 61, 4, 1, 63, 4, C.blue);
  g.set(0, 65, -3, C.pink);
  return g;
};
const rotorGrid = () => {
  const g = new VoxGrid();
  g.box(-1, -1, 0, 0, 0, 1, 0xdfe6ee);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    for (let r = 2; r < 30; r++) {
      const w = r < 8 ? 1 : 0;
      const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r);
      g.set(x, y, 0, r > 26 ? C.pink : 0xf6f8fc);
      if (w) g.set(x + Math.round(-Math.sin(a)), y + Math.round(Math.cos(a)), 0, 0xe2e8f0);
    }
  }
  return g;
};

/** Monorail: one long beam on T-pillars; the train runs on top. */
const railBeamGrid = () => new VoxGrid().box(-400, 0, -2, 399, 2, 1, (x, y) => (y === 2 ? 0xdfe6ee : y === 0 ? 0x8a96aa : (x % 16 === 0 ? C.blue : 0xc8d2e2)));
const railPillarGrid = () => {
  const g = new VoxGrid();
  g.box(-2, 0, -2, 1, 1, 1, 0x8a96aa);
  g.box(-1, 2, -1, 0, 30, 0, 0xc8d2e2);
  g.box(-4, 31, -2, 3, 32, 1, 0xb8c4d4);
  return g;
};
const trainGrid = () => {
  const g = new VoxGrid();
  const cars = 3, L = 30;
  for (let c = 0; c < cars; c++) {
    const x0 = c * (L + 2);
    for (let x = 0; x < L; x++) for (let y = 0; y < 11; y++) for (let z = -4; z <= 3; z++) {
      const nose = c === cars - 1 ? Math.max(0, x - (L - 8)) : 0;
      if (y > 10 - nose * 1.2 || (nose && Math.abs(z + 0.5) > 4 - nose * 0.35)) continue;
      const edge = z === -4 || z === 3;
      let col = y < 2 ? 0x8a96aa : y === 4 || y === 3 ? C.blue : y >= 9 ? 0xf4f8ff : 0xffffff;
      if (edge && y >= 5 && y <= 8 && (x % 6) > 0 && (x % 6) < 5) col = y === 8 ? GLASSL : GLASS;
      if (nose && y >= 5 && y <= 8 && x > L - 7) col = GLASSD;
      if (y === 3 && x % 10 === 5) col = C.pink;
      g.set(x0 + x, y, z, col);
    }
    if (c < cars - 1) g.box(x0 + L, 3, -2, x0 + L + 1, 8, 1, 0x4a5262);
  }
  text(g, 'BEAST', 14, 5, 4, '+z', C.pink, { center: true });
  return g;
};

/** Tall street lamp with a glowing head (0.1 scale). */
const lampPostGrid = () => {
  const g = new VoxGrid();
  g.box(-1, 0, -1, 1, 1, 1, 0x5a6476);
  g.box(0, 2, 0, 0, 30, 0, 0x8a96aa);
  g.box(0, 30, 0, 5, 30, 0, 0x8a96aa);
  g.box(3, 28, -1, 6, 29, 1, 0x4a5262);
  g.box(4, 27, 0, 5, 27, 0, 0xdff6ff, true);
  g.box(-1, 18, 1, 0, 24, 1, C.pink).box(-1, 19, 2, 0, 23, 2, C.blue);
  return g;
};

/** Low planter box with a trimmed hedge and flowers (0.1 scale). */
const planterGrid = (seed) => () => {
  const g = new VoxGrid();
  g.box(-16, 0, -4, 15, 3, 3, (x, y) => (y === 3 ? 0xdfe6ee : (x & 3) === 0 ? 0xb8c4d4 : 0xccd6e4));
  for (let x = -15; x <= 14; x++) for (let z = -3; z <= 2; z++) {
    const h = 4 + Math.round(vnoise(x * 0.4, seed, z * 0.4) * 3);
    for (let y = 4; y < 4 + h; y++) {
      const top = y === 3 + h;
      const fl = top && hash3(x, seed, z) < 0.18;
      g.set(x, y, z, fl ? [0xff6fb8, 0xffd23f, 0xffffff, 0xb05cff][Math.floor(hash3(z, x, seed) * 4)] : top ? C.grassL : hash3(x, y, z) < 0.25 ? C.grassD : C.grass);
    }
  }
  return g;
};

/** Specimen tank parts for the battle (voxel glass + voxel liquid). */
const tankLiquidGrid = (col) => () => {
  const g = new VoxGrid();
  g.cylinder(-0.5, -0.5, 3, 19, 4.6, (x, y, z) => (y === 19 ? shade(col, 0.35) : hash3(x, y, z) < 0.2 ? shade(col, 0.15) : y < 6 ? shade(col, -0.15) : col));
  return g;
};
const tankGlassGrid = () => {
  const g = new VoxGrid();
  for (let y = 3; y <= 21; y++) for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) {
    const d = Math.hypot(x + 0.5, z + 0.5);
    if (d <= 5.5 && d > 4.6) g.set(x, y, z, 0xffffff);
  }
  return g;
};
const specimenGrid = (seed) => () => {
  // a curled-up swarm critter silhouette floating in the tank
  const g = new VoxGrid();
  g.ellipsoid(0, 0, 0, 2.6, 2.2, 2.2, 0x1f2a3a);
  g.ellipsoid(1.5, 2.2, 0.5, 1.8, 1.6, 1.6, 0x26324a);
  g.set(2, 3, 2, 0xffffff).set(3, 3, 2, 0x15121f);
  for (const [x, z] of [[-2, 2], [2, 2], [-2, -2]]) g.set(x, -2, z, 0x1f2a3a);
  if (seed % 2) g.box(-4, 0, -1, -3, 1, 0, 0x26324a);
  return g;
};
const liquidMat = (col) => new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });

function addTankV(K, x, z, liquid, i) {
  const s = 0.12;
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  K.add(grp);
  K.mesh('tankFrame', tankGrid(liquid), { scale: s, ao: true }, 0, 0, 0, 0, 1, { parent: grp, shadow: true });
  const spec = K.mesh('specimen' + (i % 2), specimenGrid(i), { scale: 0.11, pivot: 'center', ao: true }, 0, 1.4, 0, 0, 1, { parent: grp });
  const liq = K.mesh('tankLiquid' + liquid, tankLiquidGrid(liquid), { scale: s, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { parent: grp, mats: liquidMat(liquid) });
  liq.renderOrder = 2;
  const glass = K.mesh('tankGlass', tankGlassGrid, { scale: s, pivot: [0, 0, 0], ao: false }, 0, 0, 0, 0, 1, { parent: grp, mats: glassMat(C.glass, 0.2) });
  glass.renderOrder = 3;
  const bub = liveInstances(K, 'tankBubble' + liquid, () => new VoxGrid().set(0, 0, 0, shade(liquid, 0.55), true), { scale: 0.07, pivot: 'center' }, 8, { parent: grp });
  const ph = Array.from({ length: 8 }, (_, k) => [k / 8 + K.rand(0, 0.1), K.rand(-0.35, 0.35), K.rand(-0.35, 0.35)]);
  K.onUpdate((dt, t) => {
    for (let k = 0; k < 8; k++) {
      const q = (t * 0.32 + ph[k][0]) % 1;
      setInstance(bub, k, ph[k][1] + Math.sin(t * 3 + k) * 0.04, 0.42 + q * 1.85, ph[k][2], 0, 0, 0, q > 0.95 ? 0.0001 : 1);
    }
    bub.instanceMatrix.needsUpdate = true;
    spec.position.y = 1.35 + Math.sin(t * 0.8 + i) * 0.12;
    spec.rotation.y = Math.sin(t * 0.3 + i) * 0.6;
  });
  return grp;
}

/** Little lab drone (0.06 scale) with spinning voxel rotors. */
function addDrone(K, path) {
  const drone = new THREE.Group();
  K.mesh('labDrone', () => {
    const g = new VoxGrid();
    g.box(-3, 0, -3, 2, 2, 2, 0xf4f8ff).box(-3, 0, -3, 2, 0, 2, C.blue);
    g.box(-1, -2, 1, 0, -1, 2, 0x2a3242).set(0, -2, 3, 0x6fd8ff, true);
    for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) { g.line(x < 0 ? -3 : 2, 2, z < 0 ? -3 : 2, x, 2, z, 0x8a96aa); g.set(x, 3, z, 0x4a5262); }
    g.set(-6, 1, 5, 0xff3060, true).set(5, 1, 5, 0x30ff80, true);
    return g;
  }, { scale: 0.06, pivot: [0, 0, 0], ao: true }, 0, 0, 0, 0, 1, { parent: drone });
  const rotors = [[-6, -6], [5, -6], [-6, 5], [5, 5]].map(([x, z]) => K.mesh('labRotor', () => new VoxGrid().box(-4, 0, 0, 3, 0, 0, 0x3a4252), { scale: 0.06, pivot: 'center' }, (x + 0.5) * 0.06, 0.25, (z + 0.5) * 0.06, 0, 1, { parent: drone }));
  K.add(drone);
  K.onUpdate((dt, t) => {
    const a = t * path.speed + path.ph;
    drone.position.set(path.x + Math.sin(a) * path.rx, path.y + Math.sin(t * 1.9 + path.ph) * 0.18, path.z + Math.sin(a * 2) * path.rz);
    drone.rotation.y = Math.cos(a) * 0.8;
    drone.rotation.z = -Math.cos(a) * 0.12;
    for (let i = 0; i < 4; i++) rotors[i].rotation.y = t * 38 * (i & 1 ? 1 : -1);
  });
}

/** Animated LED video wall frames for the HQ (pixel art). */
function ledFrames() {
  const glyph = { M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], R: ['##.', '#.#', '##.', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], A: ['.#.', '#.#', '###', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], $: ['.#.', '###', '#..', '###', '..#', '###', '.#.'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 0: ['###', '#.#', '#.#', '#.#', '###'], ',': ['.', '.', '.', '#', '#'], '!': ['#', '#', '#', '.', '#'], ' ': ['..', '..', '..', '..', '..'], L: ['#..', '#..', '#..', '#..', '###'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'], I: ['###', '.#.', '.#.', '.#.', '###'] };
  const write = (ctx, str, cx, y, col, s = 1) => {
    let w = 0;
    for (const ch of str) w += ((glyph[ch] ?? glyph[' '])[0].length + 1) * s;
    let x = Math.round(cx - w / 2);
    for (const ch of str) { const gl = glyph[ch] ?? glyph[' ']; gl.forEach((row, r) => [...row].forEach((c, i) => { if (c === '#') px(ctx, x + i * s, y + r * s, s, s, col); })); x += (gl[0].length + 1) * s; }
  };
  return [0, 1, 2, 3].map((f) => canvasTex('lab_led' + f, 48, 20, (ctx, w, h) => {
    if (f === 0) { paintGradient(ctx, 0, 0, w, h, [[0, 0x1a2a6a], [1, 0x29b6f6]], { bands: 4 }); write(ctx, 'MRBEAST', w / 2, 3, 0xffffff); write(ctx, 'LAB', w / 2, 11, 0xff2e88); }
    else if (f === 1) { px(ctx, 0, 0, w, h, 0x0e3a1a); write(ctx, '$1,000,000', w / 2, 7, 0x7cff6a); for (let i = 0; i < 12; i++) px(ctx, (i * 9) % w, (i * 5) % h, 2, 1, 0x3faa48); }
    else if (f === 2) { paintGradient(ctx, 0, 0, w, h, [[0, 0xff2e88], [1, 0xffd23f]], { bands: 4 }); write(ctx, 'WIN!', w / 2, 4, 0xffffff, 2); }
    else { px(ctx, 0, 0, w, h, 0x15121f); disc(ctx, w / 2, h / 2, 7, 0x29b6f6); px(ctx, w / 2 - 4, h / 2 - 2, 2, 2, 0xffffff); px(ctx, w / 2 + 2, h / 2 - 2, 2, 2, 0xffffff); px(ctx, w / 2 - 3, h / 2 + 3, 6, 1, 0x15121f); write(ctx, 'SWARMS', w / 2, 1, 0xffd23f); }
  }, { mip: false }));
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  const LH = FIELD.LANE_HALF;
  // ---- sky (screen space, 320x180 pixel art): deep blue -> pale horizon, sun with rays, cumulus, streaks, birds
  const sky = skyTexture('lab2', [[0, 0x1f6fe0], [0.3, 0x3c9cf4], [0.62, 0x8fd2ff], [0.8, 0xc4ecff], [1, 0xeaf8ff]], (ctx, w, h) => {
    const P = pixbuf(ctx, w, h);
    skyGlow(P, w * 0.5, h * 0.95, w * 0.7, h * 0.45, 0xf4fcff, 0.7, { bands: 5, pow: 1.4 });
    paintSunPx(P, Math.round(w * 0.6), Math.round(h * 0.2), 9, { color: 0xfff6c8, halo: 0xe8f8ff, halo2: 0xfffbe6, rays: 12, rayColor: 0xf0faff, rayLen: 5 });
    paintStreaks(P, w, { n: 9, y0: h * 0.08, y1: h * 0.34, len: [16, 54], color: 0xffffff, shade: 0xcfe8fb, seed: 3, alpha: 0.75 });
    paintCumulus(P, w * 0.16, h * 0.3, 15, 1, { light: 0xffffff, color: 0xf2f8ff, shade: 0xbcd6f0, dark: 0x9cbce0, sunX: 1 });
    paintCumulus(P, w * 0.43, h * 0.16, 9, 2, { light: 0xffffff, color: 0xf4faff, shade: 0xc4dcf4, sunX: 1 });
    paintCumulus(P, w * 0.84, h * 0.27, 13, 3, { light: 0xffffff, color: 0xf2f8ff, shade: 0xbcd6f0, dark: 0x9cbce0, sunX: -1 });
    paintCumulus(P, w * 0.7, h * 0.42, 8, 4, { light: 0xffffff, color: 0xeef6ff, shade: 0xc8dcf2, sunX: -1 });
    paintCloudBank(P, w, Math.round(h * 0.6), { s: 9, seed: 5, light: 0xffffff, color: 0xf0f8ff, shade: 0xd2e6f8, dark: 0xc4dcf2, alpha: 0.9 });
    paintBirdsPx(P, [[w * 0.36, h * 0.3, 1], [w * 0.39, h * 0.27, 1], [w * 0.42, h * 0.31, 0], [w * 0.53, h * 0.36, 1]], 0x2a4a7a, 0.75);
    P.flush();
  }, { w: 320, h: 180, bands: 14 });

  // ---- far pixel range + voxel mountains + forested voxel hills
  const w1 = parallaxWidth(-170);
  K.parallax('peaks', {
    z: -170, y: -4, w: w1, h: 40, tw: 520, th: 80,
    paint: (ctx, w, h) => {
      const P = pixbuf(ctx, w, h);
      paintRange(P, w, h, { base: 0.52, amp: 22, freq: 0.022, seed: 4, ridged: true, lit: 0x9cc0ec, mid: 0x86aadc, dark: 0x6f92c8, rim: 0xd8ecff, snow: 0xf4faff, snowLit: 0xffffff, snowShade: 0xc8dcf4, snowLine: 0.42, haze: [0xcfeaff, 0.5, 0.85] });
      paintRange(P, w, h, { base: 0.72, amp: 12, freq: 0.03, seed: 9, lit: 0x86b8d8, mid: 0x74a4cc, dark: 0x6090bc, rim: 0xc0e0f8, haze: [0xd4eeff, 0.7, 0.9] });
      P.flush();
    },
  });
  voxRange(K, 'mtnRange', { x0: -150, x1: 150, z: -112, depth: 7, scale: 1.7, base: 1, amp: 9, freq: 0.07, seed: 3, ridged: true, rock: 0x7f9cbc, rockD: 0x6a86a8, rockL: 0x9ab6d2, top: 0x8eb07a, snow: 0xf2f8ff, snowAt: 0.55 });
  voxRange(K, 'hills', {
    x0: -120, x1: 120, z: -64, depth: 9, scale: 1.1, base: 1, amp: 5, freq: 0.06, seed: 8, y: -0.6,
    col: (xv, y, zv, h) => {
      const j = hash3(xv, y, zv);
      if (y === h - 1) return j < 0.25 ? C.grassD : j > 0.9 ? 0xffe16a : C.grass;
      return y === h - 2 ? (j < 0.5 ? C.grassD : 0x8a6a4a) : j < 0.3 ? 0x7a5a3a : 0x8a6a4a;
    },
  });
  // forest on the hills (heights follow the hill profile roughly)
  {
    const pines = [], oaks = [];
    for (let i = 0; i < 70; i++) {
      const x = K.rand(-110, 110), z = K.rand(-73, -60);
      (i % 3 ? pines : oaks).push([x, K.rand(2.2, 4.6), z, K.rand(0, 6), K.rand(0.16, 0.26)]);
    }
    K.inst('farPine', () => pineTreeGrid({ leaf: 0x2f8a4a, seed: 3 }), { scale: 1 }, pines);
    K.inst('farOak', () => leafyTreeGrid({ seed: 5, leaf: 0x4caa3a, h: 7, r: 6 }), { scale: 1 }, oaks);
  }
  // wind turbines on the ridge
  {
    const rotors = [];
    for (const [x, z, s] of [[-46, -60, 1], [-24, -66, 0.85], [34, -61, 1], [58, -66, 0.9]]) {
      K.mesh('turbine', turbineGrid, { scale: 0.15 * s, ao: true }, x, 2.6, z, 0.2, 1);
      const r = K.mesh('rotor', rotorGrid, { scale: 0.15 * s, pivot: 'center' }, x + 0.075 * s, 2.6 + 64 * 0.15 * s, z + 0.75 * s, 0.2, 1);
      r.rotation.order = 'YXZ';
      rotors.push(r);
    }
    K.onUpdate((dt) => { for (let i = 0; i < rotors.length; i++) rotors[i].rotation.z -= dt * (0.9 + i * 0.12); });
  }
  addClouds(K, { id: 'labCloud', n: 9, kinds: 3, x0: -130, x1: 130, y0: 11, y1: 17, z0: -85, z1: -125, s0: 0.9, s1: 1.4, scale: 0.9, speed: 0.6, seed: 4, color: 0xf4faff, shade: 0xc4daf2, light: 0xffffff });

  // ---- ground + lane
  const grassCol = (x, z) => {
    const n = vnoise(x * 0.11, 3, z * 0.11), m = hash3(Math.floor(x * 2), 7, Math.floor(z * 2));
    if (m < 0.012) return [0xffd23f, 0xff6fb8, 0xffffff][Math.floor(m * 250) % 3]; // flowers
    return n > 0.64 ? C.grassL : n < 0.3 ? C.grassD : m < 0.2 ? shade(C.grass, -0.06) : C.grass;
  };
  const walk = (x, z) => (Math.abs(x - HQ.x) < 2.6 && z < -9.4 && z > -34) || (z < -24 && z > -26.6 && Math.abs(x) < 30);
  const pool = (x, z) => Math.abs(x - HQ.x) < 7.5 && z < -28 && z > -35.5 && Math.abs(x - HQ.x) > 2.6;
  K.ground({ id: 'groundNear', x0: -60, x1: 60, z0: -12, z1: 20, scale: 0.5, color: (x, z) => (Math.abs(z) < FIELD.LANE_HALF + 0.3 ? 0x8a9aae : grassCol(x, z)) });
  K.ground({
    id: 'groundFar2', x0: -110, x1: 110, z0: -70, z1: -12, scale: 1,
    color: (x, z) => {
      if (z < -3.5 && z > -9 && Math.abs(x) < 34) return (Math.floor(x) + Math.floor(z)) & 1 ? 0xdfe8f4 : 0xcfdcec; // plaza tiles behind lane
      if (walk(x, z)) return (Math.floor(x) + Math.floor(z)) & 1 ? 0xe8eef6 : 0xd6e0ec;
      if (pool(x, z)) return 0xb8c4d4;
      return grassCol(x, z);
    },
  });
  K.ground({ id: 'groundHorizon', x0: -170, x1: 170, z0: -130, z1: -70, scale: 2, color: (x, z) => (vnoise(x * 0.05, 1, z * 0.05) > 0.5 ? 0x5cae4a : 0x4c9e42) });
  K.lane({
    x0: -24, x1: 24, scale: 0.25,
    color: (ix, iz, x, z) => {
      const edge = Math.abs(z) > LH - 0.5;
      if (edge) return ((ix + iz) >> 1) & 1 ? C.yellow : C.ink; // hazard stripes
      if (Math.abs(x) < 0.26) return C.blue; // centre line
      const tx = ((ix % 8) + 8) % 8, tz = ((iz % 8) + 8) % 8;
      if (tx === 0 || tz === 0) return C.seam;
      if (tx === 1 && tz === 1) return 0xffffff;
      const t = ((Math.floor(ix / 8) + Math.floor(iz / 8)) & 1) ? C.tile : C.tile2;
      return hash3(ix, 3, iz) < 0.05 ? shade(t, -0.04) : t;
    },
    raise: (ix, iz) => Math.abs(iz * 0.25) < 0.75 && Math.abs(ix * 0.25) < 0.26,
    raiseColor: () => C.blue,
    depth: 3,
  });
  // glowing centre marker (magenta bolt on the floor)
  K.mesh('centerBolt', () => {
    const g = new VoxGrid();
    const B = ['..###', '.###.', '#####', '..##.', '.##..', '##...'];
    B.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(c - 2, 0, r - 3, C.pink, true); }));
    return g;
  }, { scale: 0.25, pivot: [0, 0, 0] }, 0.02, 0.005, 1.4);

  // ---- the HQ campus: building, LED wall, flags, reflecting pool + fountain, antenna beacons
  K.mesh('hq', hqGrid, { scale: 0.2 }, HQ.x, 0, HQ.z, 0, 1, { shadow: false });
  {
    const frames = ledFrames();
    const mat = new THREE.MeshBasicMaterial({ map: frames[0], toneMapped: false });
    const led = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.6), mat);
    led.position.set(HQ.x + 0.0, 6.1 + 0.2, HQ.z + 13 * 0.2 + 0.25);
    led.name = 'ledWall';
    K.add(led);
    K.mesh('ledFrame', () => new VoxGrid().box(-34, -14, 0, 33, 13, 0, (x, y) => (Math.abs(y) === 14 || y === 13 || x === -34 || x === 33 ? C.blue : NAVY)), { scale: 0.1, pivot: [0, 0, 0] }, HQ.x, 6.3, HQ.z + 2.73);
    let last = -1;
    K.onUpdate((dt, t) => { const f = Math.floor(t / 2.2) % 4; if (f !== last) { last = f; mat.map = frames[f]; } });
    // NB the LED wall replaces part of the curtain wall above the entrance
  }
  blinkInst(K, 'hqBeacon', beaconGrid(0xff2e88), { scale: 0.12, pivot: 'center' }, [[HQ.x, 11.75, HQ.z], [HQ.x - 14, 7.2, HQ.z - 0.5], [HQ.x + 13.8, 7.2, HQ.z - 0.5]], { groups: 1, mode: 'twinkle', rate: 0.6, duty: 0.2 });
  K.inst('hqMast', mastGrid(26), { scale: 0.1 }, [[HQ.x, 11.4, HQ.z], [HQ.x - 14, 4.6, HQ.z - 0.5], [HQ.x + 13.8, 4.6, HQ.z - 0.5]]);
  // helicopter idling on the pad (rotor spins)
  {
    const hx = HQ.x + 10.6, hz = HQ.z - 0.1, hy = 5.82;
    K.mesh('heli', () => {
      const g = new VoxGrid();
      g.ellipsoid(0, 3, 0, 7, 3.2, 3.2, (x, y) => (y > 4 && x > 1 ? GLASS : y === 3 ? C.pink : 0xf4f8ff));
      g.box(-16, 3, -1, -6, 4, 0, 0xf4f8ff).box(-17, 4, -1, -15, 8, 0, C.blue);
      for (const z of [-4, 3]) { g.box(-5, 0, z, 6, 0, z, C.metalD); g.box(-3, 1, z, -3, 1, z, C.metalD).box(4, 1, z, 4, 1, z, C.metalD); }
      g.box(-1, 7, -1, 0, 8, 0, C.metalD);
      return g;
    }, { scale: 0.08, ao: true }, hx, hy, hz, 0.4, 1);
    const rot = K.mesh('heliRotor', () => new VoxGrid().box(-22, 0, -1, 21, 0, 0, 0x3a4252).box(-1, 0, -22, 0, 0, 21, 0x3a4252), { scale: 0.08, pivot: 'center' }, hx, hy + 0.72, hz, 0.4, 1);
    K.onUpdate((dt) => { rot.rotation.y += dt * 3.2; });
  }
  // flags out front
  const flagPat = (a, b) => (u, v) => (v === 3 || v === 4 ? b : (u + v) % 11 === 0 ? shade(a, 0.15) : a);
  for (const [x, a, b] of [[-9, C.blue, 0xffffff], [-6.4, C.pink, 0xffffff], [6.4, C.pink, 0xffffff], [9, C.blue, 0xffffff]]) addFlag(K, { id: 'hq' + a, x, y: 5.4, z: -37.4, w: 14, h: 8, vox: 0.1, pattern: flagPat(a, b), poleH: 5.4, speed: 4.5 });
  // reflecting pool with a fountain
  {
    const tex = canvasTex('lab_pool', 32, 32, (ctx, w, h) => {
      px(ctx, 0, 0, w, h, 0x3aa8e8);
      const R = mulberry32(6);
      for (let i = 0; i < 30; i++) px(ctx, R() * w | 0, R() * h | 0, 2 + (R() * 4 | 0), 1, R() < 0.5 ? 0x6ac8f8 : 0x2a90d8);
      for (let i = 0; i < 6; i++) px(ctx, R() * w | 0, R() * h | 0, 2, 1, 0xe8fbff);
    }, { repeatX: true });
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 2);
    for (const sx of [-1, 1]) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 7), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x0a2a4a }));
      water.rotation.x = -Math.PI / 2;
      water.position.set(HQ.x + sx * 5.1, 0.02, -31.7);
      water.name = 'pool';
      K.add(water);
    }
    K.onUpdate((dt, t) => { tex.offset.x = (t * 0.03) % 1; tex.offset.y = Math.sin(t * 0.7) * 0.05; });
    K.inst('poolRim', () => new VoxGrid().box(-24, 0, -36, 23, 1, 35, (x, y, z) => (Math.abs(x + 0.5) < 22.6 && Math.abs(z + 0.5) < 34.6 ? null : y ? 0xf4f8ff : 0xb8c4d4)), { scale: 0.1, pivot: [0, 0, 0] }, [[HQ.x - 5.1, 0, -31.7], [HQ.x + 5.1, 0, -31.7]]);
    addPuffs(K, { id: 'fountain', sources: [[HQ.x - 5.1, 0.2, -31.7], [HQ.x + 5.1, 0.2, -31.7]], n: 10, life: 1.4, rise: 2.2, drift: [0, 0], wobble: 0.35, ease: 0.6, size: [0.9, 0.3], scale: 0.07, r: 3, color: 0xd8f4ff, light: 0xffffff, shade: 0x8ad0f4, seed: 3 });
  }

  // ---- midground: monorail, biodome, water tower, dish, lamps, planters, tanks
  {
    const RY = 3.6, RZ = -19.5;
    K.mesh('railBeam', railBeamGrid, { scale: 0.12, pivot: [0, 0, 0] }, 0, RY, RZ);
    K.inst('railPillar', railPillarGrid, { scale: 0.12 }, [-56, -42, -28, -14, 14, 28, 42, 56].map((x) => [x, 0, RZ - 0.06]));
    const train = K.mesh('train', trainGrid, { scale: 0.12, pivot: [0, 0, 0] }, 0, RY + 0.36, RZ + 0.03);
    K.onUpdate((dt, t) => { train.position.x = ((t * 5.5) % 150) - 85; });
  }
  K.mesh('biodome', biodomeGrid, { scale: 0.13 }, -21, 0, -30, 0, 1);
  K.mesh('waterTower', waterTowerGrid, { scale: 0.12 }, 23.5, 0, -29, -0.3, 1);
  const dish = K.mesh('dish', dishGrid, { scale: 0.13, ao: true }, -25, 0, -14, 0.5, 1, { shadow: true });
  K.onUpdate((dt, t) => { dish.rotation.y = 0.5 + Math.sin(t * 0.3) * 0.6; });
  K.mesh('dish', dishGrid, { scale: 0.13, ao: true }, 27, 0, -15, -0.6, 1, { shadow: true });
  K.inst('lampPost', lampPostGrid, { scale: 0.1, ao: true }, [-28, -20, -4, 4, 20, 28].map((x) => [x, 0, -10.6, x < 0 ? 0 : Math.PI]), { shadow: true });
  for (let v = 0; v < 2; v++) K.inst('planter' + v, planterGrid(v + 3), { scale: 0.1, ao: true }, [[-7.4, 0, -9.6], [7.6, 0, -9.6], [-31, 0, -9.4], [31, 0, -9.4]].filter((_, i) => i % 2 === v), { shadow: true });
  K.inst('fence', fenceGrid, { scale: 0.125, ao: true }, [-36, -24, -18, -12, 12, 18, 24, 30].map((x) => [x, 0, -9.6]), { shadow: true });
  ['tankA', 'tankB', 'tankC', 'tankD'].forEach((_, i) => addTankV(K, [-16, -9.5, 9.5, 16][i], -6.4, [0x7cff3a, 0x29e0ff, 0xff4fd8, 0x7cff3a][i], i));
  const arm = K.mesh('robotArm', robotArmGrid, { scale: 0.12, ao: true }, 4.5, 0, -6.2, 0, 1, { shadow: true });
  K.onUpdate((dt, t) => { arm.rotation.y = Math.sin(t * 0.7) * 0.9; });
  addDrone(K, { x: -6, y: 3.8, z: -12, rx: 10, rz: 2, speed: 0.22, ph: 0 });
  addDrone(K, { x: 14, y: 4.6, z: -22, rx: 8, rz: 3, speed: 0.17, ph: 2 });
  // breakables right behind the lane
  for (const [x, kind] of [[-13, 'crate'], [-4.5, 'barrel'], [3, 'crate'], [12.5, 'barrel'], [-19, 'barrel'], [19, 'crate']]) {
    if (kind === 'crate') K.breakable('crate', 'crate', crateGrid, { scale: 0.1 }, x, -3.3, K.rand(-0.3, 0.3));
    else K.breakable('barrel', 'barrel' + (x > 0 ? 'p' : 'g'), barrelGrid(x > 0 ? C.pink : 0x5fdc4a), { scale: 0.1 }, x, -3.2, K.rand(0, 1));
  }

  // ---- trees + bushes around the campus
  const trees = [];
  for (let i = 0; i < 30; i++) {
    const x = K.rand(-58, 58), z = K.rand(-56, -12.5);
    if (Math.abs(x - HQ.x) < 16 && z < -26) continue;
    if (Math.abs(x + 21) < 5 && Math.abs(z + 30) < 5) continue;
    if (Math.abs(x - 23.5) < 3 && Math.abs(z + 29) < 3) continue;
    if (Math.abs(z + 19.5) < 1.2) continue;
    trees.push([x, 0, z, K.rand(0, 6), K.rand(0.11, 0.15)]);
  }
  swayInst(K, 'oakA', () => leafyTreeGrid({ seed: 2, leaf: 0x54b840, h: 10, r: 7 }), { scale: 1, ao: true }, trees.filter((_, i) => i % 3 === 0), { amp: 0.025, speed: 0.9 });
  swayInst(K, 'oakB', () => leafyTreeGrid({ seed: 7, leaf: 0x48a83e, h: 9, r: 6, blossom: 0xffb8d8 }), { scale: 1, ao: true }, trees.filter((_, i) => i % 3 === 1), { amp: 0.03, speed: 1.1 });
  swayInst(K, 'pineA', () => pineTreeGrid({ seed: 4, leaf: 0x2f9a4c }), { scale: 1, ao: true }, trees.filter((_, i) => i % 3 === 2).map((t) => [t[0], 0, t[2], t[3], t[4] * 1.2]), { amp: 0.02, speed: 0.8 });
  const bushes = [];
  for (let i = 0; i < 26; i++) { const x = K.rand(-50, 50), z = K.rand(-26, -11); if (Math.abs(z + 19.5) < 1.4 || (Math.abs(x) < 3 && z < -9.4)) continue; bushes.push([x, 0, z, K.rand(0, 6), K.rand(0.09, 0.13)]); }
  K.inst('bushA', () => bushGrid({ seed: 1, leaf: 0x4cb63e, flowers: [0xff6fb8, 0xffffff, 0xffd23f] }), { scale: 1, ao: true }, bushes);
  K.inst('rock', () => rockGrid({ color: 0xa8b0c0 }), { scale: 0.18 }, [[-26, 0, -5, 0.4], [27, 0, -4.6, 1.2], [-31, 0, 5, 2], [33, 0, 6, 0.1]]);

  // ---- life: birds, gulls around the HQ, butterflies over the front grass
  addBirds(K, { id: 'labFlock', n: 7, mode: 'flock', x0: -70, x1: 70, y: 10.5, z: -38, speed: 3.2, dir: 1, color: 0x2e3a52, wingTip: 0x1a2236, belly: 0x3a465e, beak: 0x2e3a52, head: 0x2e3a52, vox: 0.07, flap: 10, soar: 0.2, seed: 2 });
  addBirds(K, { id: 'labGull', n: 3, mode: 'circle', cx: 8, cy: 9.5, cz: -30, r: 9, rz: 0.45, speed: 0.22, color: 0xffffff, wingTip: 0x3a4252, vox: 0.06, flap: 7, soar: 0.7, seed: 5 });
  addSparkles(K, { id: 'butterfly', n: 10, area: [-22, 22, 0.25, 0.5, LH + 1.2, 7], color: 0xffd23f, color2: 0xff8ac0, cross: true, scale: 0.05, rate: 0.5, wander: 0.8, sharp: 0.6, seed: 8 });

  // ---- foreground (low!): bollards, flower beds, swaying grass, pebbles, cable runs
  const boll = [];
  for (let x = -22; x <= 22; x += 4) boll.push([x, 0, LH + 0.45, 0, 1]);
  K.inst('bollard', bollardGrid, { scale: 0.11, ao: true }, boll, { shadow: true });
  const tufts = [];
  for (let i = 0; i < 90; i++) tufts.push([K.rand(-40, 40), 0, K.rand(LH + 1.0, 12), K.rand(0, 6), K.rand(0.06, 0.09)]);
  swayInst(K, 'tuft', () => tuftGrid(C.grass), { scale: 1 }, tufts, { amp: 0.12, speed: 2.2 });
  const fl = [[], [], []];
  for (let i = 0; i < 60; i++) fl[i % 3].push([K.rand(-36, 36), 0, K.rand(LH + 1.1, 11), K.rand(0, 6), K.rand(0.06, 0.08)]);
  [0xff6fb8, 0xffd23f, 0xffffff].forEach((c, i) => swayInst(K, 'flower' + i, () => flowerGrid(c, { center: i === 2 ? 0xffd23f : 0xffffff }), { scale: 1 }, fl[i], { amp: 0.1, speed: 1.8 }));
  K.inst('pebble', () => rockGrid({ color: 0xb8c0cc, r: 2 }), { scale: 0.06 }, Array.from({ length: 24 }, () => [K.rand(-30, 30), 0, K.rand(LH + 1, 10), K.rand(0, 6), K.rand(0.8, 1.4)]));
  K.inst('cableRun', () => new VoxGrid().box(-30, 0, 0, 29, 0, 0, (x) => (x % 10 === 0 ? 0x5a6476 : 0x2a3242)).box(-30, 0, 1, 29, 0, 1, (x) => (x % 10 === 0 ? 0x5a6476 : C.blueD)), { scale: 0.06, pivot: [0, 0, 0] }, [[-14, 0, LH + 0.95, 0.05], [12, 0, LH + 1.05, -0.04]]);

  return {
    sky,
    fog: { color: 0xd4eeff, near: 70, far: 270 },
    lights: { sky: 0xdff0ff, ground: 0x7a8a6a, hemi: 1.15, sun: 2.3, sunColor: 0xfff1dc, dir: [-6, 14, 10], rim: 1.0, rimColor: 0xa8dcff },
    dust: 0xd8e2ee,
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // circular lab plaza with a mini dome, tanks, the Beast Tiger tank and the billboard
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    for (let x = -28; x <= 27; x++) for (let z = -28; z <= 27; z++) {
      const d = Math.sqrt((x + 0.5) ** 2 + (z + 0.5) ** 2);
      if (d > 27.5) continue;
      const edge = d > 25.5;
      g.set(x, 0, z, edge ? (((x + z) >> 1) & 1 ? C.yellow : C.ink) : (((x >> 2) + (z >> 2)) & 1) ? C.tile : C.tile2);
      g.set(x, -1, z, C.metalD);
    }
    return g;
  }, { scale: 0.25 }, 0, -0.25, 0);
  K.mesh('dome', domeGrid, { scale: 0.16 }, -2.5, 0, -2.5, 0.4);
  for (const [x, z, col] of [[3.2, -2.6, 0x7cff3a], [4.6, 0.2, 0xff4fd8], [-4.8, 1.6, 0x29e0ff]]) addTank(K, x, z, col, 0.09);
  K.mesh('billboard', () => signGrid('LAB', { textScale: 3, pad: 2, legH: 10, bg: 0x15121f, frame: C.blue, color: C.pink }), { scale: 0.12 }, 2, 0, -5);
  const dish = K.mesh('dish', dishGrid, { scale: 0.09, ao: true }, -5.5, 0, -2, 0.3, 1, { shadow: true });
  K.onUpdate((dt, t) => { dish.rotation.y = Math.sin(t * 0.4) * 0.8; });
  // hotspot anchors (the home scene places NPCs / boss gates / secrets here)
  const anchor = (name, x, y, z) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; K.root.add(o); K.hotspots[name] = o; return o; };
  anchor('npc', 1.5, 0, 3.5);
  anchor('boss', -3.5, 0, 3.8);
  anchor('enterLab', -2.5, 0.8, 0.5);
  return { focus: [0, 1.2, 0], radius: 7 };
}
