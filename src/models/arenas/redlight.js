// Arena 5: RED LIGHT COURTYARD — "$456,000 Squid Game In Real Life!" (our own
// take): a pastel playground courtyard of warm sand enclosed by walls painted
// with a sky mural, a GIANT ROBOT PANTHER DOLL at the far end whose head
// swivels while its eyes switch green/red, a big bare tree, pastel guard
// towers with sweeping lamps, swings and see-saws, a countdown board, and
// impossible pastel staircases towering in the distance. A red finish line
// crosses the lane.
import {
  THREE, VoxGrid, FIELD, shade, mixHex, hash3, vnoise, mulberry32, text, textW, canvasTex,
  paintGradient, paintClouds, paintSun, px, disc, skyTexture, parallaxWidth,
} from './kit.js';

const LH = FIELD.LANE_HALF;
const C = {
  sand: 0xe8d4a4, sandD: 0xd8c08c, sandL: 0xf4e4bc, laneA: 0xdcc596, laneB: 0xd2ba8a, chalk: 0xfaf6ee,
  pink: 0xff9ab8, pinkD: 0xe06890, mint: 0x9ee8c8, mintD: 0x6cc8a4, teal: 0x5cc8c8, tealD: 0x3a9a9e, yellow: 0xffe08a, lav: 0xc8b0f0,
  red: 0xe8343c, redD: 0xb3222c, white: 0xfaf6ee, ink: 0x2a2030, metal: 0xc8ccd8, metalD: 0x7a8296, bark: 0x7a6a5a, barkD: 0x5a4a40,
  sky: 0x8fd0ff, skyL: 0xcfeaff,
};
const PASTEL = [C.pink, C.mint, C.teal, C.yellow, C.lav, 0xffc8a0];

function anchor(K, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  K.root.add(o);
  K.hotspots[name] = o;
  return o;
}

// --------------------------------------------------------------------------- the robot panther doll (original design)

const DOLL = { teal: 0x48b8d8, tealD: 0x2a86a8, white: 0xf4f6fa, pink: 0xff7ab0, pinkL: 0xffb0d0, gold: 0xffd23f, joint: 0x6b7386, dark: 0x22283a };

/** Body: boots, jointed legs, pastel tutu, panelled chest with bolt emblem, mitten hands. 0.15 scale, neck top ~ y 44. */
const dollBodyGrid = () => {
  const g = new VoxGrid();
  // boots + legs
  for (const sx of [-1, 1]) {
    const lx = sx * 4;
    g.box(lx - 3, 0, -3, lx + 2, 3, 4, DOLL.pink);
    g.box(lx - 3, 3, -3, lx + 2, 3, 4, DOLL.pinkL);
    g.box(lx - 2, 4, -2, lx + 1, 11, 1, (x, y) => (y % 4 === 0 ? DOLL.tealD : DOLL.teal));
    g.box(lx - 3, 12, -3, lx + 2, 14, 2, DOLL.joint);
    g.box(lx - 2, 15, -2, lx + 1, 20, 1, DOLL.teal);
  }
  // tiered tutu skirt
  for (let t = 0; t < 3; t++) {
    const y0 = 19 + t * 3, r = 10 - t * 1.5;
    for (let x = -12; x <= 11; x++) for (let z = -10; z <= 9; z++) {
      const d = Math.hypot(x + 0.5, (z + 0.5) * 1.15);
      if (d > r) continue;
      for (let y = y0; y < y0 + 3; y++) g.set(x, y, z, d > r - 1.2 ? (Math.floor(Math.atan2(z, x) * 5) & 1 ? DOLL.pink : DOLL.pinkL) : DOLL.pinkL);
    }
  }
  // chest barrel with panel seams
  for (let y = 28; y <= 42; y++) for (let x = -8; x <= 7; x++) for (let z = -6; z <= 5; z++) {
    const d = ((x + 0.5) / 8.4) ** 2 + ((z + 0.5) / 6.4) ** 2;
    if (d > 1) continue;
    const seam = y === 34 || y === 39 || Math.abs(x + 0.5) < 0.6;
    g.set(x, y, z, seam ? DOLL.tealD : z > 3 && x > -6 && x < 5 && y > 29 && y < 38 ? DOLL.white : DOLL.teal);
  }
  // bolt emblem on the chest
  const B = ['..##', '.##.', '####', '.##.', '##..'];
  B.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') g.set(c - 2, 36 - r, 6, DOLL.pink); }));
  // bow tie at the collar
  g.box(-4, 41, 5, -1, 43, 6, DOLL.pink).box(0, 41, 5, 3, 43, 6, DOLL.pink).box(-1, 41, 6, 0, 43, 7, DOLL.gold);
  // shoulders + arms hanging at the sides, mitten hands
  for (const sx of [-1, 1]) {
    const ax = sx > 0 ? 9 : -10;
    g.box(ax - 1, 38, -3, ax + 2, 42, 2, DOLL.joint);
    g.box(ax, 30, -2, ax + 1, 37, 1, DOLL.teal);
    g.box(ax - 1, 27, -3, ax + 2, 29, 2, DOLL.joint);
    g.box(ax, 20, -2, ax + 1, 26, 1, DOLL.teal);
    g.box(ax - 1, 16, -3, ax + 2, 19, 2, DOLL.white);
  }
  g.box(-2, 43, -2, 1, 45, 1, DOLL.joint); // neck
  return g;
};

/** Head (pivot at the neck): rounded panther head, ears, white muzzle, eye sockets (lit eyes are separate). */
const dollHeadGrid = () => {
  const g = new VoxGrid();
  for (let x = -9; x <= 8; x++) for (let y = 0; y <= 15; y++) for (let z = -8; z <= 7; z++) {
    const d = ((x + 0.5) / 9.2) ** 2 + ((y - 7.5) / 8.2) ** 2 + ((z + 0.5) / 8.2) ** 2;
    if (d > 1) continue;
    g.set(x, y, z, y < 2 ? 0xd85a90 : hash3(x, y, z) < 0.06 ? 0xf06aa4 : 0xff86bc);
  }
  // ears
  for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) {
    const ex = sx * 5 + (sx > 0 ? -1 : 0);
    g.box(ex - 2 + Math.floor(k / 2), 13 + k, -2, ex + 2 - Math.ceil(k / 2), 13 + k, 1, k < 4 ? 0xff86bc : 0xd85a90);
    if (k < 4) g.box(ex - 1 + Math.floor(k / 2), 13 + k, 2, ex + 1 - Math.ceil(k / 2), 13 + k, 2, DOLL.teal);
  }
  // muzzle, nose, mouth, whisker studs
  g.box(-4, 2, 6, 3, 6, 8, DOLL.white);
  g.box(-1, 5, 9, 0, 6, 9, DOLL.tealD);
  g.box(-2, 3, 9, 1, 3, 9, DOLL.dark);
  for (const sx of [-1, 1]) for (const y of [3, 5]) g.set(sx > 0 ? 5 : -6, y, 7, DOLL.joint);
  // eye sockets
  for (const sx of [-1, 1]) g.box(sx > 0 ? 2 : -6, 8, 6, sx > 0 ? 5 : -3, 11, 7, DOLL.dark);
  // forehead stripe markings + antenna, back speaker grille
  for (let x = -3; x <= 2; x += 2) g.box(x, 12, 5, x, 14, 6, DOLL.teal);
  g.box(-1, 16, -1, 0, 19, 0, DOLL.joint);
  for (let y = 4; y <= 10; y += 2) g.box(-4, y, -9, 3, y, -9, DOLL.tealD);
  return g;
};

function makeDoll(K, x, z, s, o = {}) {
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.name = 'robotPantherDoll';
  K.add(root);
  K.mesh('dollBody', dollBodyGrid, { scale: s, ao: true }, 0, 0, 0, 0, 1, { parent: root, shadow: true, receive: false });
  const head = new THREE.Group();
  head.position.set(0, 45 * s, 0);
  root.add(head);
  K.mesh('dollHead', dollHeadGrid, { scale: s, ao: true }, 0, 0, 0, 0, 1, { parent: head, shadow: true, receive: false });
  // lit eyes (HDR so they bloom) + an antenna bulb and a big status light on the back of the head
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const eyeGeo = new THREE.BoxGeometry(3.2 * s, 3.2 * s, 0.6 * s);
  for (const ex of [3.5, -4.5]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    e.position.set(ex * s + 0.5 * s, 9.5 * s + 0.5 * s, 8 * s);
    head.add(e);
  }
  const backMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
  const back = new THREE.Mesh(new THREE.BoxGeometry(4 * s, 4 * s, 0.6 * s), backMat);
  back.position.set(0, 9 * s, -9.4 * s);
  head.add(back);
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(1.6 * s, 1.6 * s, 1.6 * s), backMat);
  bulb.position.set(-0.5 * s, 20.5 * s, -0.5 * s);
  head.add(bulb);
  const RED = new THREE.Color(2.6, 0.18, 0.16), GREEN = new THREE.Color(0.25, 2.3, 0.5), OFF = new THREE.Color(0.08, 0.08, 0.1);
  const period = o.period ?? 9;
  const state = { red: false };
  const ease = (k) => k * k * (3 - 2 * k);
  K.onUpdate((dt, t) => {
    const k = (t + (o.phase ?? 0)) % period;
    let ry, red;
    if (k < 4.5) { ry = Math.PI + Math.sin(t * 1.4) * 0.05; red = false; }
    else if (k < 5.1) { ry = Math.PI * (1 - ease((k - 4.5) / 0.6)); red = k > 4.95; }
    else if (k < 8.4) { ry = Math.sin((k - 5.1) * 1.1) * 0.22; red = true; }
    else { ry = Math.PI * ease((k - 8.4) / 0.6); red = k < 8.55; }
    head.rotation.y = ry;
    eyeMat.color.copy(red ? RED : OFF);
    backMat.color.copy(red ? OFF : GREEN);
    state.red = red;
  });
  return { root, head, state };
}

// --------------------------------------------------------------------------- other voxel props

/** Big bare tree (0.15 scale): twisting trunk + recursive branches. */
const bareTreeGrid = () => {
  const g = new VoxGrid();
  const R = mulberry32(7);
  g.box(-3, 0, -3, 2, 1, 2, C.barkD);
  const branch = (x, y, z, dx, dy, dz, len, r, depth) => {
    for (let i = 0; i <= len; i++) {
      const px0 = x + dx * i, py0 = y + dy * i, pz0 = z + dz * i;
      const rr = r * (1 - (i / len) * 0.4);
      for (let a = -Math.ceil(rr); a <= Math.ceil(rr); a++) for (let b = -Math.ceil(rr); b <= Math.ceil(rr); b++) for (let c = -Math.ceil(rr); c <= Math.ceil(rr); c++) {
        if (a * a + b * b + c * c > rr * rr + 0.3) continue;
        g.set(Math.round(px0 + a), Math.round(py0 + b), Math.round(pz0 + c), hash3(Math.round(px0 + a), Math.round(py0 + b), 3) < 0.3 ? C.barkD : C.bark);
      }
    }
    if (depth <= 0) return;
    const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
    const n = depth > 2 ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const ang = (k / n) * Math.PI * 2 + R() * 1.5, spread = 0.5 + R() * 0.5;
      const ndx = dx * 0.5 + Math.cos(ang) * spread, ndz = dz * 0.5 + Math.sin(ang) * spread * 0.6, ndy = 0.55 + R() * 0.4;
      const L = Math.hypot(ndx, ndy, ndz);
      branch(ex, ey, ez, ndx / L, ndy / L, ndz / L, len * (0.62 + R() * 0.15), Math.max(0.6, r * 0.62), depth - 1);
    }
  };
  branch(0, 0, 0, 0.08, 1, 0, 22, 3.2, 4);
  return g;
};

/** Pastel guard tower (0.12 scale): legs + braces, hut, roof, ladder, flagpole. */
const towerGrid = (col) => () => {
  const g = new VoxGrid();
  const H = 44;
  for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) g.box(x, 0, z, x, H, z, C.white);
  for (let y = 4; y < H; y += 10) {
    g.line(-6, y, 5, 5, y + 10, 5, C.metalD).line(5, y, 5, -6, y + 10, 5, C.metalD);
    g.line(-6, y, -6, -6, y + 10, 5, C.metalD).line(5, y, -6, 5, y + 10, 5, C.metalD);
  }
  g.box(-8, H, -8, 7, H + 1, 7, C.metalD);
  g.box(-7, H + 2, -7, 6, H + 11, 6, (x, y, z) => (y > H + 5 && y < H + 9 && (Math.abs(x + 0.5) < 4 || Math.abs(z + 0.5) < 4) && (x === -7 || x === 6 || z === -7 || z === 6) ? 0x3a3040 : col));
  for (let i = 0; i < 4; i++) g.box(-9 + i, H + 12 + i, -9 + i, 8 - i, H + 12 + i, 8 - i, i & 1 ? C.white : shade(col, -0.2));
  for (let y = 0; y < H; y++) { g.set(-3, y, 7, C.metalD); g.set(2, y, 7, C.metalD); if (y % 3 === 0) g.box(-2, y, 7, 1, y, 7, C.metalD); }
  g.box(-1, H + 16, -1, -1, H + 26, -1, C.metal);
  return g;
};
const flagGrid = (col) => () => new VoxGrid().box(0, 0, 0, 9, 5, 0, (x, y) => ((x + y) % 4 < 2 ? col : shade(col, 0.2)));

const swingFrameGrid = () => {
  const g = new VoxGrid();
  for (const x of [-14, 13]) {
    g.line(x, 0, -6, x, 22, 0, C.mintD, 0);
    g.line(x, 0, 6, x, 22, 0, C.mintD, 0);
  }
  g.box(-15, 22, -1, 14, 23, 0, C.mint);
  return g;
};
const swingSeatGrid = (col) => () => {
  const g = new VoxGrid();
  g.box(0, -18, 0, 0, 0, 0, C.metalD).box(5, -18, 0, 5, 0, 0, C.metalD);
  g.box(-1, -20, -2, 6, -19, 1, col);
  return g;
};
const seesawBaseGrid = () => new VoxGrid().box(-2, 0, -2, 1, 5, 1, (x, y) => (y > 3 ? C.yellow : shade(C.yellow, -0.15)));
const seesawPlankGrid = () => {
  const g = new VoxGrid();
  g.box(-22, 0, -2, 21, 0, 1, C.teal);
  for (const x of [-20, 19]) g.box(x, 1, -1, x, 3, 0, C.pink).box(x - 1, 3, -2, x + 1, 3, 1, C.pinkD);
  return g;
};
const slideGrid = () => {
  const g = new VoxGrid();
  // ladder + platform + chute
  for (const z of [-4, 3]) g.box(-12, 0, z, -12, 22, z, C.lav);
  for (let y = 2; y < 22; y += 3) g.box(-12, y, -3, -12, y, 2, C.white);
  g.box(-12, 22, -4, -6, 23, 3, C.lav);
  for (let i = 0; i < 26; i++) {
    const x = -6 + i, y = 22 - Math.round(i * 0.82);
    g.box(x, y, -3, x, y, 2, C.pink).box(x, y + 1, -4, x, y + 2, -4, C.pinkD).box(x, y + 1, 3, x, y + 2, 3, C.pinkD);
  }
  g.box(-12, 24, -4, -12, 27, 3, C.lav).box(-6, 24, -4, -6, 27, 3, C.lav).box(-12, 27, -4, -6, 27, 3, C.yellow);
  return g;
};
const domeGrid = () => {
  // climbing dome lattice
  const g = new VoxGrid();
  const R = 13;
  for (let x = -R; x <= R; x++) for (let y = 0; y <= R; y++) for (let z = -R; z <= R; z++) {
    const d = Math.sqrt(x * x + y * y + z * z);
    if (Math.abs(d - R) > 0.6) continue;
    const on = Math.abs(Math.atan2(z, x) * 8 / Math.PI % 1) < 0.18 || y % 4 === 0;
    if (on) g.set(x, y, z, y % 4 === 0 ? C.teal : C.lav);
  }
  return g;
};
/** Pastel courtyard wall segment with an arched doorway (0.25 scale), face +z. */
const pastelWallGrid = (col, W = 32, H = 18) => () => {
  const g = new VoxGrid();
  g.box(-W / 2, 0, -1, W / 2 - 1, H - 1, 0, (x, y) => (y < 2 ? shade(col, -0.15) : col));
  g.box(-W / 2 - 1, H, -2, W / 2, H, 1, C.white);
  for (let x = -4; x < 4; x++) for (let y = 0; y < 12; y++) if (y < 9 || Math.hypot(x + 0.5, y - 9) < 4) g.del(x, y, -1).del(x, y, 0);
  for (let x = -5; x < 5; x++) for (let y = 0; y < 14; y++) if (!g.has(x, y, 0) && (g.has(x + 1, y, 0) || g.has(x - 1, y, 0) || g.has(x, y + 1, 0))) g.set(x, y, 1, C.white);
  return g;
};

/** Breakables. */
const blocksGrid = (seed) => () => {
  // stack of pastel ABC toy blocks
  const g = new VoxGrid();
  const R = mulberry32(seed);
  const cube = (x0, y0, z0, col, ch) => {
    g.box(x0, y0, z0, x0 + 5, y0 + 5, z0 + 5, col);
    for (const [a, b] of [[0, 0], [5, 0], [0, 5], [5, 5]]) g.box(x0 + a, y0, z0 + b, x0 + a, y0 + 5, z0 + b, shade(col, -0.15));
    text(g, ch, x0 + 1, y0 + 1, z0 + 6, '+z', C.white, {});
  };
  const L = 'ABCRGL';
  cube(-6, 0, -3, PASTEL[seed % 6], L[seed % 6]);
  cube(0, 0, -2, PASTEL[(seed + 1) % 6], L[(seed + 2) % 6]);
  cube(-3, 6, -3, PASTEL[(seed + 2) % 6], L[(seed + 4) % 6]);
  if (R() < 0.6) cube(3, 0, 3, PASTEL[(seed + 3) % 6], L[(seed + 1) % 6]);
  return g;
};
const marbleGrid = (seed) => () => {
  const g = new VoxGrid();
  const a = PASTEL[seed % 6], b = PASTEL[(seed + 2) % 6];
  for (let x = -6; x <= 5; x++) for (let y = 0; y <= 11; y++) for (let z = -6; z <= 5; z++) {
    const d = Math.hypot(x + 0.5, y - 5.5, z + 0.5);
    if (d > 6.2) continue;
    const swirl = Math.sin(Math.atan2(z + 0.5, x + 0.5) * 2 + y * 0.6) > 0.3;
    g.set(x, y, z, d < 5 ? b : swirl ? a : mixHex(a, 0xffffff, 0.55));
  }
  g.set(-2, 9, 4, 0xffffff).set(-3, 8, 4, 0xffffff);
  return g;
};
const drumGrid = (col) => () => {
  const g = new VoxGrid();
  g.cylinder(-0.5, -0.5, 0, 9, 4, (x, y) => (y === 1 || y === 8 ? shade(col, -0.2) : col));
  g.cylinder(-0.5, -0.5, 10, 10, 3, C.white);
  text(g, '456', 0, 3, 4, '+z', C.white, { center: true });
  return g;
};

// --------------------------------------------------------------------------- pixel painters

/** One flight of chunky pastel stairs (Escher-ish), drawn from (x0,y0) climbing in dir (+1 right / -1 left); flip hangs it upside down. */
function paintFlight(ctx, x0, y0, n, dir, col, o = {}) {
  const sx = o.sx ?? 4, sy = o.sy ?? 3, flip = o.flip ? -1 : 1;
  const side = shade(col, -0.18), lit = shade(col, 0.15), rail = o.rail ?? 0xffffff;
  for (let i = 0; i < n; i++) {
    const x = x0 + dir * i * sx - (dir < 0 ? sx : 0), y = y0 - flip * (i + 1) * sy;
    const h = (i + 1) * sy;
    const top = flip > 0 ? y : y0;
    px(ctx, x, top, sx, h, i % 2 ? col : side);
    px(ctx, x, flip > 0 ? y : y0 + h - 1, sx, 1, lit);
    if (flip > 0) px(ctx, x, y - 3, 1, 3, rail);
  }
  if (flip > 0) for (let i = 0; i < n * sx; i++) px(ctx, x0 + dir * i - (dir < 0 ? 1 : 0), y0 - 3 - Math.round((i / sx) * sy), 1, 1, rail);
}
function paintEscher(ctx, w, h, seed, o = {}) {
  const R = mulberry32(seed);
  const cols = o.cols ?? [C.pink, C.mint, C.yellow, C.lav, C.teal, 0xffc8a0];
  for (let i = 0; i < (o.n ?? 40); i++) {
    const x = Math.floor(R() * w), y = Math.floor((o.y0 ?? h * 0.2) + R() * ((o.y1 ?? h * 0.9) - (o.y0 ?? h * 0.2)));
    const col = cols[Math.floor(R() * cols.length)];
    const kind = R();
    const s = o.s ?? 1;
    if (kind < 0.25) {
      // landing block with a dark doorway, propped on a pillar down to the ground
      const bw = Math.round((10 + R() * 12) * s), bh = Math.round((6 + R() * 10) * s);
      px(ctx, x + 2, y, Math.max(2, Math.round(3 * s)), h - y, shade(col, -0.1));
      px(ctx, x, y - bh, bw, bh, col);
      px(ctx, x, y - bh, bw, 1, shade(col, 0.2));
      px(ctx, x + bw - 2, y - bh, 2, bh, shade(col, -0.18));
      if (R() < 0.7) { const dw = Math.max(2, Math.round(3 * s)), dh = Math.max(3, Math.round(5 * s)); px(ctx, x + Math.floor(bw / 2) - 1, y - dh, dw, dh, 0x5a4a6a); }
    } else {
      paintFlight(ctx, x, y, 3 + Math.floor(R() * 5), R() < 0.5 ? 1 : -1, col, { sx: Math.round(4 * s), sy: Math.round(3 * s), flip: R() < 0.2 });
    }
  }
}

// --------------------------------------------------------------------------- battle

export function buildBattle(K) {
  // ---- sky: bright pastel blue with puffy clouds (the courtyard walls repeat it as a mural)
  const sky = skyTexture('redlight', [[0, 0x5cb4f0], [0.55, 0x9ad6ff], [1, 0xdaf0ff]], (ctx, w, h) => {
    paintSun(ctx, w * 0.24, h * 0.16, 6, 0xfff8d8, 0xfff4e0);
    paintClouds(ctx, w, h, { n: 6, y0: 8, y1: h * 0.42, size: 6, seed: 51, color: 0xffffff, shade: 0xd8e8f8 });
  });

  // ---- parallax: impossible pastel staircases towering over the courtyard walls
  const w1 = parallaxWidth(-160);
  K.parallax('stairsFar', {
    z: -160, y: -4, w: w1, h: 48, tw: Math.round(w1 * 1.6), th: 77,
    paint: (ctx, w, h) => {
      paintClouds(ctx, w, h, { n: 8, y0: 2, y1: 24, size: 5, seed: 61, color: 0xffffff, shade: 0xdcecfa });
      paintEscher(ctx, w, h, 3, { n: 70, y0: h * 0.42, y1: h * 0.98, s: 0.8, cols: [0xf4c8d8, 0xc8ecdc, 0xf8ecc0, 0xdcd0f4, 0xb8e4e4] });
      // vertical pillars tying it together
      const R = mulberry32(8);
      for (let i = 0; i < 18; i++) { const x = Math.floor(R() * w), y = Math.floor(h * (0.3 + R() * 0.3)); px(ctx, x, y, 3, h - y, [0xe8d0e0, 0xd0e8e0, 0xe0dcf0][i % 3]); }
    },
  });
  const w2 = parallaxWidth(-110);
  K.parallax('stairsNear', {
    z: -110, y: -4, w: w2, h: 30, tw: Math.round(w2 * 2.2), th: 66,
    paint: (ctx, w, h) => {
      paintEscher(ctx, w, h, 9, { n: 55, y0: h * 0.38, y1: h, s: 1.2 });
      const R = mulberry32(4);
      for (let i = 0; i < 14; i++) { const x = Math.floor(R() * w), y = Math.floor(h * (0.4 + R() * 0.3)); px(ctx, x, y, 4, h - y, PASTEL[i % 6]); px(ctx, x + 3, y, 1, h - y, shade(PASTEL[i % 6], -0.2)); }
    },
  });
  const w3 = parallaxWidth(-70);
  K.parallax('dorms', {
    z: -70, y: -3, w: w3, h: 21, tw: Math.round(w3 * 3), th: 63,
    paint: (ctx, w, h) => {
      // pastel block buildings with arched windows, painted-sky panels and rooftop stairs
      const R = mulberry32(12);
      let x = -4;
      while (x < w) {
        const bw = 24 + Math.floor(R() * 26), bh = 30 + Math.floor(R() * 24);
        const col = PASTEL[Math.floor(R() * PASTEL.length)];
        const top = h - bh;
        px(ctx, x, top, bw, bh, col);
        px(ctx, x, top, bw, 2, 0xffffff);
        px(ctx, x + bw - 3, top, 3, bh, shade(col, -0.15));
        if (R() < 0.45) { paintGradient(ctx, x + 3, top + 4, bw - 8, Math.floor(bh * 0.4), [[0, 0x7cc4f4], [1, 0xc4e6ff]], { bands: 3 }); px(ctx, x + 6, top + 8, 8, 3, 0xffffff); }
        else for (let wy = top + 5; wy < h - 8; wy += 7) for (let wx = x + 3; wx < x + bw - 6; wx += 6) { px(ctx, wx, wy + 1, 3, 4, 0x5a4a6a); px(ctx, wx, wy, 3, 1, 0xffffff); }
        if (R() < 0.6) paintFlight(ctx, x + 2 + Math.floor(R() * (bw - 20)), top, 4, R() < 0.5 ? 1 : -1, PASTEL[Math.floor(R() * 6)], { sx: 4, sy: 3 });
        x += bw + Math.floor(R() * 3);
      }
    },
  });

  // ---- ground: warm courtyard sand with ripples + pebbles
  const sandCol = (x, z) => {
    const n = vnoise(x * 0.09, 4, z * 0.09), m = hash3(Math.floor(x * 2), 21, Math.floor(z * 2));
    if (m < 0.008) return PASTEL[Math.floor(m * 800) % 6];
    const ripple = Math.sin(x * 0.7 + z * 2.1 + n * 4) > 0.82;
    return ripple ? C.sandD : n > 0.66 ? C.sandL : n < 0.3 ? shade(C.sand, -0.05) : m < 0.15 ? shade(C.sand, -0.03) : C.sand;
  };
  K.ground({ id: 'sandNear', x0: -60, x1: 60, z0: -18, z1: 20, scale: 0.5, color: sandCol, jitter: 0.03 });
  K.ground({ id: 'sandFar', x0: -110, x1: 110, z0: -70, z1: -18, scale: 1, color: sandCol, jitter: 0.03 });
  K.ground({ id: 'sandFront', x0: -60, x1: 60, z0: 20, z1: 44, scale: 1, color: sandCol, jitter: 0.03 });

  // ---- the lane: packed play-track sand, chalk edges, the red finish line across the middle
  K.lane({
    x0: -24, x1: 24, scale: 0.25, depth: 2, side: 0xb8a070, jitter: 0.03,
    color: (ix, iz) => {
      const x = (ix + 0.5) * 0.25, z = (iz + 0.5) * 0.25, az = Math.abs(z);
      if (Math.abs(x) < 0.38) return hash3(ix, 2, iz) < 0.08 ? C.redD : C.red;
      if (Math.abs(x) < 0.63) return C.white;
      if (az > 2.25) return ((ix >> 2) & 1) ? C.pink : C.mint;
      if (az > 2.0) return C.chalk;
      const h = hash3(ix, 9, iz);
      if (h < 0.015) return C.sandD;
      return (Math.floor(x / 3) & 1) ? C.laneA : C.laneB;
    },
  });

  // ---- breakables behind the lane: toy-block stacks, giant marbles, a painted drum
  for (const [x, kind, v] of [[-16.4, 'blocks', 0], [-9.6, 'marble', 1], [-3.6, 'blocks', 2], [3.6, 'marble', 3], [9.6, 'blocks', 4], [16.4, 'drum', 0]]) {
    if (kind === 'blocks') K.breakable('blocks', 'blocks' + v, blocksGrid(v), { scale: 0.1 }, x, -3.25, K.rand(-0.4, 0.4));
    else if (kind === 'marble') K.breakable('marble', 'marble' + v, marbleGrid(v), { scale: 0.12 }, x, -3.2, K.rand(0, 3));
    else K.breakable('drum', 'drum', drumGrid(C.teal), { scale: 0.11 }, x, -3.25, 0.3);
  }

  // ---- playground in the middle ground (animated swings + see-saw)
  {
    const sx = 4.8, sz = -11.6;
    K.mesh('swingFrame', swingFrameGrid, { scale: 0.1, ao: true }, sx, 0, sz, 0, 1, { shadow: true, receive: false });
    const seats = [[-0.7, C.yellow, 0], [0.6, C.pink, 1.7]].map(([dx, col, ph]) => {
      const pivot = new THREE.Group();
      pivot.position.set(sx + dx, 2.25, sz);
      K.add(pivot);
      K.mesh('swingSeat' + col, swingSeatGrid(col), { scale: 0.1, pivot: [2.5, 0, 0], ao: true }, 0, 0, 0, 0, 1, { parent: pivot, shadow: true });
      pivot.userData.ph = ph;
      return pivot;
    });
    K.onUpdate((dt, t) => { for (const p of seats) p.rotation.x = Math.sin(t * 2.1 + p.userData.ph) * 0.55; });
  }
  {
    const bx = -4.4, bz = -8.6;
    K.mesh('seesawBase', seesawBaseGrid, { scale: 0.1, ao: true }, bx, 0, bz, 0, 1, { shadow: true });
    const plank = K.mesh('seesawPlank', seesawPlankGrid, { scale: 0.1, pivot: [0, 0, 0], ao: true }, bx, 0.6, bz, 0, 1, { shadow: true });
    K.onUpdate((dt, t) => { plank.rotation.z = Math.sin(t * 1.6) * 0.16; });
  }
  K.mesh('slide', slideGrid, { scale: 0.1, ao: true }, -11.2, 0, -10.4, 0.35, 1, { shadow: true });
  K.mesh('dome', domeGrid, { scale: 0.1, ao: true }, 12.6, 0, -15.4, 0, 1, { shadow: true });
  // hopscotch-style chalk grids + a few stray marbles out front (flat, low)
  K.inst('hopscotch', () => {
    const g = new VoxGrid();
    const cell = (x0, z0) => { for (let i = 0; i < 6; i++) { g.set(x0 + i, 0, z0, C.chalk).set(x0 + i, 0, z0 + 5, C.chalk).set(x0, 0, z0 + i, C.chalk).set(x0 + 5, 0, z0 + i, C.chalk); } };
    cell(0, 0); cell(5, -3); cell(5, 2); cell(10, 0); cell(15, -3); cell(15, 2); cell(20, 0);
    return g;
  }, { scale: 0.14, pivot: [0, 1, 0] }, [[-14.5, 0.006, 5.2, 0.05], [7.5, 0.006, 6.4, -0.08]]);
  const marbles = [];
  for (let i = 0; i < 14; i++) marbles.push([K.rand(-24, 24), 0, K.rand(LH + 0.9, 10), K.rand(0, 6), K.rand(0.8, 1.2)]);
  for (let v = 0; v < 3; v++) K.inst('miniMarble' + v, () => new VoxGrid().box(-1, 0, -1, 0, 1, 0, PASTEL[v * 2]).set(-1, 1, -1, 0xffffff), { scale: 0.09 }, marbles.filter((_, i) => i % 3 === v), { receive: false });
  // low chalk boundary markers along the near lane edge
  const pegs = [];
  for (let x = -22; x <= 22; x += 4) pegs.push([x + 1, 0, LH + 0.5, 0, 1]);
  K.inst('peg', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 1, 2, 1, C.white).box(0, 3, 0, 1, 3, 1, C.pink);
    return g;
  }, { scale: 0.1, ao: true }, pegs, { shadow: true });

  // ---- the courtyard walls: a long wall painted with a sky mural, pastel base bands
  const WZ = -31, WH = 7.6;
  K.mesh('muralWall', () => {
    const g = new VoxGrid();
    for (let x = -280; x < 280; x++) {
      for (let y = 0; y < 6; y++) g.set(x, y, 0, y < 2 ? C.pinkD : y < 4 ? C.mint : C.teal);
      g.set(x, Math.round(WH * 4), 0, C.white).set(x, Math.round(WH * 4), 1, C.white);
      if (x % 24 === 0) for (let y = 6; y < WH * 4; y++) g.set(x, y, 1, 0xb8d8f0);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 0, 1] }, 0, 0, WZ);
  {
    const tex = canvasTex('rl_mural', 256, 32, (ctx, w, h) => {
      paintGradient(ctx, 0, 0, w, h, [[0, 0x6cbcf4], [1, 0xbfe4ff]], { bands: 5 });
      paintClouds(ctx, w, h, { n: 9, y0: 6, y1: h * 0.75, size: 4, seed: 71, color: 0xffffff, shade: 0xd0e4f6 });
      const R = mulberry32(2);
      for (let i = 0; i < 6; i++) { const bx = Math.floor(R() * w), by = 4 + Math.floor(R() * 10); px(ctx, bx, by, 1, 1, 0x3a4a6a); px(ctx, bx - 1, by - 1, 1, 1, 0x3a4a6a); px(ctx, bx + 1, by - 1, 1, 1, 0x3a4a6a); }
    }, { repeatX: true });
    tex.repeat.set(140 / 32, 1);
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(140, WH - 1.5), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x2a3a48 }));
    mural.position.set(0, 1.5 + (WH - 1.5) / 2, WZ + 0.02);
    mural.name = 'skyMural';
    K.add(mural);
  }
  // freestanding pastel walls with arched doorways
  for (const [x, z, col, ry] of [[-24, -21, C.pink, 0.15], [25, -22, C.mint, -0.2], [-36, -15, C.teal, 0.3], [37, -16, C.lav, -0.3]]) {
    K.mesh('pwall' + col, pastelWallGrid(col), { scale: 0.25 }, x, 0, z, ry, 1, { shadow: true });
  }

  // ---- the GIANT ROBOT PANTHER DOLL, the bare tree, the go/stop lamps and countdown board
  const doll = makeDoll(K, 0, -24.5, 0.17);
  K.mesh('bareTree', bareTreeGrid, { scale: 0.15 }, -7.8, 0, -25.5, 0.4, 1, { shadow: true });
  {
    // big round STOP / GO lamps on the wall top
    const lampGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.25, 20);
    lampGeo.rotateX(Math.PI / 2);
    const red = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false }), green = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    K.mesh('lampHousing', () => {
      const g = new VoxGrid();
      g.box(-20, 0, -1, 19, 9, 0, C.ink);
      g.box(-21, -1, -2, 20, -1, 1, C.white).box(-21, 10, -2, 20, 10, 1, C.white);
      return g;
    }, { scale: 0.1 }, 9.6, WH + 0.1, WZ + 0.3);
    for (const [x, m] of [[8.6, red], [10.6, green]]) { const l = new THREE.Mesh(lampGeo, m); l.position.set(x, WH + 0.6, WZ + 0.55); K.add(l); }
    const RED = new THREE.Color(2.4, 0.15, 0.15), GREEN = new THREE.Color(0.2, 2.2, 0.45), DIM_R = new THREE.Color(0.25, 0.04, 0.05), DIM_G = new THREE.Color(0.04, 0.2, 0.08);
    // countdown board on the mural wall
    const cv = document.createElement('canvas');
    cv.width = 40; cv.height = 14;
    const ctx = cv.getContext('2d');
    const tex = new THREE.CanvasTexture(cv);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const DIG = { 0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'], 3: ['###', '..#', '###', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'], 6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'], ':': ['.', '#', '.', '#', '.'] };
    let last = -1;
    const draw = (sec) => {
      px(ctx, 0, 0, 40, 14, 0x1a1626);
      px(ctx, 0, 0, 40, 1, C.pink);
      px(ctx, 0, 13, 40, 1, C.pink);
      const str = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      let cx = 5;
      for (const ch of str) {
        const gl = DIG[ch];
        gl.forEach((row, r) => [...row].forEach((c, i) => { if (c === '#') px(ctx, cx + i * 2, 3 + r * 2 - 1, 2, 2, 0xff5a8a); }));
        cx += gl[0].length * 2 + 2;
      }
      tex.needsUpdate = true;
    };
    draw(300);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.2), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    board.position.set(-12.5, 4.4, WZ + 0.38);
    K.add(board);
    K.mesh('boardFrame', () => new VoxGrid().box(-18, -7, 0, 17, 6, 0, C.white), { scale: 0.1, pivot: [0, 0, 0] }, -12.5, 4.4, WZ + 0.26);
    K.onUpdate((dt, t) => {
      red.color.copy(doll.state.red ? RED : DIM_R);
      green.color.copy(doll.state.red ? DIM_G : GREEN);
      const sec = Math.max(0, 300 - Math.floor(t));
      if (sec !== last) { last = sec; draw(sec); }
    });
  }

  // ---- guard towers with sweeping lamps and fluttering flags
  {
    const beamGeo = new THREE.ConeGeometry(1.2, 10, 16, 1, true);
    beamGeo.translate(0, -5, 0);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2d0, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    for (const [x, z, col, ph] of [[-19.5, -19.5, C.pink, 0], [20, -20, C.teal, 2]]) {
      K.mesh('gtower' + col, towerGrid(col), { scale: 0.12, ao: true }, x, 0, z, Math.sign(x) * 0.3, 1, { shadow: true });
      const head = new THREE.Group();
      head.position.set(x, 7.1, z);
      K.add(head);
      const lamp = K.mesh('gLamp', () => {
        const g = new VoxGrid();
        g.box(-2, -2, -2, 1, 1, 2, C.ink);
        g.box(-1, -1, 3, 0, 0, 3, 0xfff0c0, true);
        return g;
      }, { scale: 0.12, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { parent: head });
      void lamp;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.rotation.x = -1.05;
      head.add(beam);
      const flag = K.mesh('gflag' + col, flagGrid(col === C.pink ? C.teal : C.pink), { scale: 0.12, pivot: [0, 0, 0] }, x - 0.1, 8.6, z - 0.1);
      K.onUpdate((dt, t) => {
        head.rotation.y = -Math.sign(x) * (0.5 + Math.sin(t * 0.5 + ph) * 0.45);
        flag.scale.x = 0.85 + Math.sin(t * 5 + ph) * 0.15;
        flag.rotation.y = Math.sin(t * 3 + ph) * 0.25;
      });
    }
  }

  return {
    sky,
    fog: { color: 0xd8ecfa, near: 60, far: 175 },
    lights: { sky: 0xe4f2ff, ground: 0x9a8a6a, hemi: 1.2, sun: 2.2, sunColor: 0xfff4e4, dir: [-7, 14, 10], rim: 0.9, rimColor: 0xffd8e8 },
    dust: 0xe8d8b0,
  };
}

// --------------------------------------------------------------------------- Beast Island zone diorama

export function buildZone(K) {
  // sandy courtyard plinth with a red finish line and pastel base
  K.mesh('zoneBase', () => {
    const g = new VoxGrid();
    for (let x = -26; x <= 25; x++) for (let z = -26; z <= 25; z++) {
      const d = Math.max(Math.abs(x + 0.5), Math.abs(z + 0.5));
      if (d > 25.5 || Math.hypot(x + 0.5, z + 0.5) > 33) continue;
      const finish = z === 6 || z === 7;
      const n = vnoise(x * 0.3, 2, z * 0.3);
      g.set(x, 0, z, finish ? C.red : n > 0.66 ? C.sandL : hash3(x, 1, z) < 0.2 ? C.sandD : C.sand);
      g.set(x, -1, z, d > 24.5 ? C.pinkD : C.sandD);
      g.set(x, -2, z, d > 24.5 ? C.mint : 0xb8a070);
      g.set(x, -3, z, d > 24.5 ? C.teal : 0xa08a60);
    }
    return g;
  }, { scale: 0.25, pivot: [0, 1, 0] }, 0, 0, 0);
  // two mural walls meeting at the back-left corner
  const tex = canvasTex('rl_muralZ', 64, 24, (ctx, w, h) => {
    paintGradient(ctx, 0, 0, w, h, [[0, 0x6cbcf4], [1, 0xbfe4ff]], { bands: 4 });
    paintClouds(ctx, w, h, { n: 4, y0: 4, y1: h * 0.7, size: 3, seed: 72, color: 0xffffff, shade: 0xd0e4f6 });
  });
  for (const [x, z, ry, len] of [[0, -6.25, 0, 12.6], [-6.25, 0, Math.PI / 2, 12.6]]) {
    const wall = K.mesh('zoneWall', () => {
      const g = new VoxGrid();
      for (let x2 = -25; x2 < 25; x2++) for (let y = 0; y < 18; y++) g.set(x2, y, 0, y < 2 ? C.pinkD : y < 4 ? C.mint : y < 5 ? C.teal : 0xa8d4f4).set(x2, y, -1, C.pink);
      g.box(-26, 18, -2, 25, 18, 1, C.white);
      return g;
    }, { scale: 0.25, pivot: [0, 0, 0] }, x, 0, z, ry);
    void wall;
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.2, 3.2), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x2a3a48 }));
    mural.position.set(x + (ry ? 0.27 : 0), 2.85, z + (ry ? 0 : 0.27));
    mural.rotation.y = ry;
    K.add(mural);
  }
  // the robot panther doll in the back corner (head swivels, eyes switch), the bare tree beside it
  makeDoll(K, -2.4, -4.2, 0.07, { period: 8 });
  K.mesh('bareTreeZ', bareTreeGrid, { scale: 0.065 }, -4.8, 0, -4.4, 0.6, 1, { shadow: true });
  // a guard tower, the swings, a see-saw, the slide, toy blocks + marbles
  K.mesh('gtowerZ', towerGrid(C.pink), { scale: 0.07, ao: true }, 4.6, 0, -4.4, -0.4, 1, { shadow: true });
  K.mesh('swingFrameZ', swingFrameGrid, { scale: 0.1, ao: true }, 3.4, 0, -0.6, -0.5, 1, { shadow: true });
  const seat = new THREE.Group();
  seat.position.set(3.4, 2.25, -0.6);
  seat.rotation.y = -0.5;
  K.add(seat);
  const sm = K.mesh('swingSeatZ', swingSeatGrid(C.yellow), { scale: 0.1, pivot: [2.5, 0, 0], ao: true }, 0, 0, 0, 0, 1, { parent: seat });
  K.onUpdate((dt, t) => { sm.rotation.x = Math.sin(t * 2) * 0.5; });
  K.mesh('slideZ', slideGrid, { scale: 0.1, ao: true }, -4.4, 0, 2.0, 1.2, 1, { shadow: true });
  K.mesh('blocksZ', blocksGrid(1), { scale: 0.1, ao: true }, 2.2, 0, 3.6, 0.3, 1, { shadow: true, receive: false });
  K.mesh('marbleZ', marbleGrid(2), { scale: 0.12, ao: true }, 4.8, 0, 2.8, 0, 1, { shadow: true, receive: false });
  K.inst('pegZ', () => new VoxGrid().box(0, 0, 0, 1, 2, 1, C.white).box(0, 3, 0, 1, 3, 1, C.pink), { scale: 0.1 }, [[-5.6, 0, 1.6], [-3, 0, 1.6], [-0.4, 0, 1.6], [2.2, 0, 1.6], [4.8, 0, 1.6]]);
  anchor(K, 'boss', -0.8, 0, 3.4);
  return { focus: [0, 1.3, 0], radius: 7 };
}
