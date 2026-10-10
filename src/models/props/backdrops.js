// Battle backdrops: lane floor (x -30..30, z -3..3, top y=0), wider ground,
// layered background scenery (parallax), low foreground pieces and
// breakable props near the lane.
// makeBattleBackdrop(theme) -> { root, breakables:[{obj,kind,x,z}], update(dt), sky, fog }
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, vnoise, ring, text, vgeo, glassMat, glowMat, tintMat,
  hazardC, checker, pixelTex, css, mulberry32, instanced, texPlane,
} from './common.js';
import { foodGrid } from './abilities.js';
import { shelfFrame, productsRow, checkoutGrid, freezerGrid, produceGrid, aisleSignGrid, makeFreezer } from './grocery.js';
import { cartGrid, barrel, crate, pipe, dishGrid, panelBox, windowZ, productBox, signZ, boltEmblem } from './labParts.js';
import { greedyGeometry } from './greedy.js';
import { ENV_GRIDS, houseGrid, mansionGrid, technoTowerGrid, reactorGrid, pantherStatueGrid as pantherGrid } from './environment.js';
import { variantMaterials } from '../../core/voxel.js';

export const BACKDROP_THEMES = ['lab', 'suburb', 'mansion', 'mart', 'techno', 'reactor', 'factory'];

const PCOLS = [PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.pink, PAL.orange, PAL.purple, 0xffffff, PAL.cyan];

// ---------------------------------------------------------------------------
// Kit

class Kit {
  constructor(theme, seed = 1) {
    this.theme = theme;
    this.root = new THREE.Group();
    this.root.name = 'backdrop:' + theme;
    this.breakables = [];
    this.updaters = [];
    this.R = mulberry32(seed * 7919 + theme.length * 31);
  }
  add(o) { this.root.add(o); return o; }
  rand(a = 0, b = 1) { return a + this.R() * (b - a); }
  /** Instanced voxel scenery (cached geometry). items: [[x,y,z,ry,s]] */
  geo(id, gridFn, opts = {}) {
    return opts.greedy === false ? vgeo('bd_' + id, gridFn, { maxSamples: 8, ...opts }) : greedyGeometry('bd_' + id, gridFn, opts);
  }
  inst(id, gridFn, opts, items, o = {}) {
    if (!items.length) return null;
    const geo = this.geo(id, gridFn, opts);
    const im = instanced(geo, items, { shadow: o.shadow ?? false, receive: o.receive ?? false, mats: o.mats });
    im.name = id;
    return this.add(im);
  }
  /** Single static mesh (cached geometry). */
  mesh(id, gridFn, opts, x = 0, y = 0, z = 0, ry = 0, s = 1, o = {}) {
    const m = makeMesh(this.geo(id, gridFn, opts), o.mats);
    m.name = id;
    m.position.set(x, y, z);
    m.rotation.y = ry;
    if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
    m.castShadow = !!o.shadow;
    m.receiveShadow = !!o.receive;
    return this.add(m);
  }
  /** Breakable prop near the lane: standalone Group with mesh children. */
  breakable(kind, parts, x, z, ry = 0) {
    const g = new THREE.Group();
    g.name = 'breakable:' + kind;
    for (const [id, fn, opts, px = 0, py = 0, pz = 0] of parts) {
      const m = makeMesh(vgeo('brk_' + id, fn, { maxSamples: 70, ...opts }));
      m.name = 'brk_' + id;
      m.position.set(px, py, pz);
      m.castShadow = true;
      g.add(m);
    }
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    this.add(g);
    this.breakables.push({ obj: g, kind, x, z });
    return g;
  }
  /** Ground planes: lane strip (z -3..3) + wide ground. */
  ground(laneTex, groundTex, o = {}) {
    const lane = texPlane(laneTex, -30, 30, -3, 3, 0);
    lane.name = 'lane';
    this.add(lane);
    const g = texPlane(groundTex, o.x0 ?? -80, o.x1 ?? 80, o.z0 ?? -34, o.z1 ?? 10, -0.005);
    g.name = 'ground';
    this.add(g);
    if (o.far) {
      const f = texPlane(o.far, -140, 140, -90, o.z0 ?? -34, -0.01);
      this.add(f);
    }
    return { lane, ground: g };
  }
  /** Vertical sky backdrop (unlit, ignores fog). */
  sky(drawFn, o = {}) {
    const tex = pixelTex('sky_' + this.theme, 128, 64, drawFn);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 80), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
    m.position.set(0, o.y ?? 24, o.z ?? -70);
    m.renderOrder = -10;
    m.name = 'sky';
    return this.add(m);
  }
  /** Rolling hills / skyline silhouette band of big voxels. */
  hills(id, o) {
    const s = o.scale ?? 1.2;
    return this.mesh(id, () => {
      const g = new VoxGrid();
      const n = Math.ceil((o.width ?? 240) / s / 2);
      for (let x = -n; x <= n; x++) {
        const h = Math.max(1, Math.round((o.base ?? 4) + vnoise(x * (o.freq ?? 0.08) + (o.seed ?? 0), 0.5, 0.5) * (o.amp ?? 6) + Math.sin(x * 0.05 + (o.seed ?? 0)) * (o.wave ?? 1.5)));
        for (let y = 0; y < h; y++)
          for (let z = 0; z < (o.depth ?? 2); z++) g.set(x, y, -z, o.col(x, y, h));
      }
      return g;
    }, { scale: s, ao: false, jitter: 0.04 }, 0, 0, o.z ?? -45, 0, 1, { receive: false });
  }
  update(dt) { for (const u of this.updaters) u(dt); }
}

// textures
const tileTex = (id, a, b, grout, repeat, o = {}) => pixelTex(id, 32, 32, (c) => {
  c.fillStyle = css(grout); c.fillRect(0, 0, 32, 32);
  c.fillStyle = css(a); c.fillRect(1, 1, 15, 15); c.fillRect(17, 17, 15, 15);
  c.fillStyle = css(b); c.fillRect(17, 1, 15, 15); c.fillRect(1, 17, 15, 15);
  if (o.shine) { c.fillStyle = css(o.shine); c.fillRect(2, 2, 4, 1); c.fillRect(18, 18, 4, 1); c.fillRect(2, 2, 1, 3); c.fillRect(18, 18, 1, 3); }
  if (o.draw) o.draw(c);
}, repeat);
const noiseTex = (id, cols, repeat, o = {}) => pixelTex(id, 32, 32, (c) => {
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const h = hash3(x, y, id.length);
    c.fillStyle = css(cols[Math.floor(h * h * cols.length)]);
    c.fillRect(x, y, 1, 1);
  }
  if (o.draw) o.draw(c);
}, repeat);
const gradient = (stops) => (c, w, h) => {
  const g = c.createLinearGradient(0, 0, 0, h);
  for (const [t, col] of stops) g.addColorStop(t, css(col));
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
};
function pixelClouds(c, w, h, col, n = 7, y0 = 6, y1 = 30, seed = 1) {
  const R = mulberry32(seed);
  c.fillStyle = css(col);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(R() * w), cy = Math.floor(y0 + R() * (y1 - y0)), len = 6 + Math.floor(R() * 12);
    c.fillRect(cx, cy, len, 2);
    c.fillRect(cx + 2, cy - 1, len - 5, 1);
    c.fillRect(cx + 3, cy - 2, Math.max(2, len - 9), 1);
  }
}
function stars(c, w, h, n = 60, ymax = 40, seed = 3) {
  const R = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    c.fillStyle = R() < 0.3 ? '#ffe9a8' : '#ffffff';
    c.fillRect(Math.floor(R() * w), Math.floor(R() * ymax), 1, 1);
  }
}

// ---------------------------------------------------------------------------
// Shared small grids

const G = {
  cartBody: () => cartGrid({}),
  cartBodyFull: () => cartGrid({ full: true }),
  cartWheel: () => new VoxGrid().box(-1, -1, 0, 0, 0, 0, PAL.ink),
  canPyramid() {
    const g = new VoxGrid();
    const cols = [PAL.red, PAL.blue, PAL.green, PAL.orange];
    for (let row = 0; row < 4; row++) {
      const n = 4 - row, y = row * 3;
      for (let i = 0; i < n; i++) {
        const x = -4 + row + i * 2;
        const c = cols[(row + i) % 4];
        g.box(x, y, -1, x + 1, y + 2, 0, (xx, yy) => (yy === y + 1 ? 0xffffff : c));
        g.set(x, y + 2, -1, 0xd8dee8);
      }
    }
    return g;
  },
  cerealStack() {
    const g = new VoxGrid();
    const cols = [PAL.orange, PAL.blue, PAL.pink, PAL.yellow];
    for (let i = 0; i < 4; i++) {
      const c = cols[i], y = i * 4, off = (i & 1) ? 1 : 0;
      g.box(-3 + off, y, -1, 2 + off, y + 3, 1, c);
      g.box(-2 + off, y + 1, 2, 1 + off, y + 2, 2, 0xffffff);
      g.set(-1 + off, y + 1, 2, PAL.red);
      g.box(-3 + off, y + 3, 2, 2 + off, y + 3, 2, shade(c, 0.4));
    }
    return g;
  },
  waterPallet() {
    const g = new VoxGrid();
    g.box(-5, 0, -4, 4, 1, 3, PAL.woodL);
    g.box(-5, 0, -4, 4, 0, 3, (x) => (x % 2 ? PAL.woodD : PAL.wood));
    for (let y = 2; y <= 7; y += 3) for (let x = -5; x <= 3; x += 3) for (let z = -4; z <= 2; z += 3) {
      g.box(x, y, z, x + 1, y + 2, z + 1, 0x8fd8ff);
      g.set(x, y + 2, z, 0x1d77c9).set(x + 1, y + 1, z + 1, 0xffffff);
    }
    g.box(-6, 3, 4, 5, 9, 4, 0xffffff);
    text(g, 'H2O', 0, 4, 5, '+z', PAL.blueD, { center: true });
    return g;
  },
  melonBin() {
    const g = new VoxGrid();
    g.box(-5, 0, -4, 4, 5, 3, (x, y) => (y === 5 ? PAL.woodD : PAL.woodL));
    g.box(-4, 2, -3, 3, 5, 2, null);
    for (const [x, z, y] of [[-2, -1, 5], [2, -1, 5], [0, 1, 5], [-2, 2, 6], [1, 0, 7]]) g.ellipsoid(x, y, z, 2, 1.6, 2, (xx, yy, zz) => ((xx + zz) % 2 ? PAL.greenD : 0x7cd64a));
    g.box(-3, 2, 4, 2, 4, 4, PAL.yellow);
    text(g, '$2', 0, 2, 5, '+z', PAL.red, { center: true });
    return g;
  },
  wetSign() {
    const g = new VoxGrid();
    for (let y = 0; y <= 9; y++) {
      const z = Math.round((9 - y) * 0.25);
      g.box(-3, y, z, 2, y, z, PAL.yellow).box(-3, y, -z - 1, 2, y, -z - 1, PAL.yellow);
    }
    g.box(-1, 4, 3, 0, 7, 3, PAL.ink).set(-1, 5, 3, PAL.yellow);
    g.set(-1, 2, 2, PAL.ink).set(0, 2, 2, PAL.ink);
    return g;
  },
  miniShelf() {
    const g = new VoxGrid();
    shelfFrame(g, -7, 14, 1, { h: 15, d: 4, levels: [2, 7, 12], top: PAL.pink });
    for (const y of [3, 8, 13]) productsRow(g, -6, 5, y, 0, 'mixed', y * 13);
    return g;
  },
  hydrant() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 0, 2, PAL.redD);
    g.cylinder(0, 0, 1, 5, 1.6, PAL.red);
    g.box(-3, 3, 0, 3, 3, 0, PAL.red).set(-3, 3, 0, PAL.yellow).set(3, 3, 0, PAL.yellow);
    g.ellipsoid(0, 6, 0, 1.6, 1.2, 1.6, PAL.red);
    g.set(0, 8, 0, PAL.redD).set(0, 4, 2, PAL.yellow);
    return g;
  },
  urn() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 1, 2, PAL.goldD);
    g.ellipsoid(0, 5, 0, 3.4, 3.5, 3.4, (x, y, z) => (y === 5 ? PAL.goldL : (x + z) % 3 === 0 ? PAL.goldD : PAL.gold));
    g.cylinder(0, 0, 8, 9, 2, PAL.gold);
    g.cylinder(0, 0, 10, 10, 3, PAL.goldL);
    g.ellipsoid(0, 12.5, 0, 3, 2.5, 3, (x, y, z) => (hash3(x, y, z) < 0.3 ? 0x2f8a3a : 0x4fb84a));
    g.set(1, 14, 2, PAL.pink).set(-2, 13, 1, PAL.pink).set(0, 15, -1, 0xffffff);
    return g;
  },
  cashPile() {
    const g = new VoxGrid();
    for (const [x, y, z] of [[-4, 0, -2], [0, 0, -2], [-4, 0, 1], [0, 0, 1], [-2, 2, -1], [1, 2, 0], [-1, 4, -1]]) {
      g.box(x, y, z, x + 3, y + 1, z + 2, (xx, yy) => (yy === y ? PAL.cashD : PAL.cash));
      g.box(x + 1, y, z, x + 1, y + 1, z + 2, 0xffffff);
    }
    g.set(-1, 6, 0, PAL.gold).set(2, 4, 2, PAL.gold);
    return g;
  },
  goldPile() {
    const g = new VoxGrid();
    for (let l = 0; l < 3; l++) for (let i = 0; i < 3 - l; i++) for (let k = 0; k < 2; k++) {
      const x = -5 + i * 3 + l * 1.5, y = l * 2, z = -2 + k * 2;
      g.box(Math.round(x), y, z, Math.round(x) + 2, y + 1, z + 1, (xx, yy) => (yy === y + 1 ? PAL.goldL : PAL.gold));
    }
    g.set(0, 6, 0, PAL.cyan, true);
    return g;
  },
  bust() {
    const g = new VoxGrid();
    g.box(-3, 0, -3, 2, 5, 2, 0xe8e2d6);
    g.box(-4, 6, -4, 3, 6, 3, PAL.gold);
    g.box(-3, 7, -2, 2, 9, 1, 0xf4f0e8);
    g.box(-2, 10, -2, 1, 14, 1, 0xf8f4ec);
    g.set(-1, 12, 2, 0x8a8a8a).set(0, 12, 2, 0x8a8a8a).set(0, 11, 2, 0xd8d0c0);
    g.box(-2, 15, -2, 1, 15, 1, PAL.gold);
    return g;
  },
  serverCrate() {
    const g = new VoxGrid();
    g.box(-4, 0, -3, 3, 7, 2, 0x1c2034);
    for (let y = 1; y <= 6; y += 2) { g.box(-3, y, 3, 2, y, 3, 0x2a3050); g.set(-3 + ((y * 3) % 6), y, 3, [0x5ce1e6, 0x7cff3a, 0xff4fa3][y % 3], true); }
    g.box(-4, 8, -3, 3, 8, 2, 0x2a3050);
    return g;
  },
  neonBarrel() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 7, 2.6, 0x22263c);
    ring(g, 0, 0, 2, 2, 3, 0x5ce1e6, true);
    ring(g, 0, 0, 5, 5, 3, 0xff4fa3, true);
    g.cylinder(0, 0, 8, 8, 1.5, 0x5ce1e6, 'y', true);
    return g;
  },
  botHead() {
    const g = new VoxGrid();
    g.box(-3, 0, -3, 2, 5, 2, 0x8f98aa);
    g.box(-3, 5, -3, 2, 5, 2, 0xb8c0cc);
    g.box(-2, 2, 3, -1, 3, 3, 0xff3040, true).box(1, 2, 3, 1, 3, 3, 0xff3040, true);
    g.box(-2, 1, 3, 1, 1, 3, 0x2a3050);
    g.box(0, 6, 0, 0, 8, 0, PAL.metal).set(0, 9, 0, 0x5ce1e6, true);
    g.box(-4, 2, -1, -4, 3, 0, PAL.metalD).box(3, 2, -1, 3, 3, 0, PAL.metalD);
    return g;
  },
  gasTank() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 10, 2, (x, y) => (y >= 4 && y <= 6 ? PAL.yellow : 0x3a8a4a));
    g.ellipsoid(0, 11, 0, 2, 1.2, 2, 0x3a8a4a);
    g.box(0, 12, 0, 0, 13, 0, PAL.metal).box(-1, 14, 0, 1, 14, 0, PAL.red);
    g.set(0, 5, 3, PAL.ink);
    return g;
  },
  chocoStack() {
    const g = new VoxGrid();
    const wr = [0xff4fa3, 0x1d9bf0, PAL.gold];
    for (let i = 0; i < 5; i++) {
      const o = (i & 1) ? 1 : 0;
      g.box(-4 + o, i * 2, -2, 3 + o, i * 2 + 1, 1, (x) => ((x + 8) % 3 === 0 ? PAL.chocoD : PAL.choco));
      g.box(-2 + o, i * 2, -2, 1 + o, i * 2 + 1, 1, wr[i % 3]);
      g.box(-1 + o, i * 2 + 1, 2, 0 + o, i * 2 + 1, 2, 0xffffff);
    }
    return g;
  },
  candyJar() {
    const g = new VoxGrid();
    const cols = [PAL.red, PAL.yellow, PAL.green, PAL.blue, PAL.pink, PAL.orange];
    g.box(-3, 0, -3, 2, 0, 2, 0xd8f0ff);
    g.box(-3, 1, -3, 2, 7, 2, (x, y, z) => cols[Math.floor(hash3(x, y, z) * cols.length)]);
    for (const [x, z] of [[-3, -3], [2, -3], [-3, 2], [2, 2]]) g.box(x, 1, z, x, 7, z, 0xe8f8ff);
    g.box(-3, 8, -3, 2, 8, 2, 0xe8f8ff);
    g.box(-2, 9, -2, 1, 10, 1, PAL.red);
    g.box(-1, 3, 3, 0, 5, 3, 0xffffff);
    return g;
  },
  cocoaBarrel() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 8, 3, (x, y) => (y === 1 || y === 7 ? PAL.metalD : (x + 9) % 2 ? PAL.wood : PAL.woodD));
    g.cylinder(0, 0, 8, 8, 2, PAL.choco);
    g.box(-1, 3, 3, 1, 5, 3, 0xfff1d6).set(0, 4, 4, PAL.choco);
    return g;
  },
  cocoaCrate() {
    const g = new VoxGrid();
    crate(g, -3, 0, -3, 6, PAL.woodL);
    g.box(-2, 6, -2, 1, 6, 1, PAL.choco).box(-1, 7, -2, 0, 7, -1, 0xff4fa3).box(1, 7, 0, 2, 8, 0, PAL.chocoL);
    return g;
  },
  crate: () => ENV_GRIDS.crate(),
  cone: () => ENV_GRIDS.cone(),
  mailbox: () => ENV_GRIDS.mailbox(),
  barrelBlue: () => ENV_GRIDS.barrel(),
  barrelToxic: () => ENV_GRIDS.toxicBarrel(),
  trashCan() {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 8, 3, (x, y) => (y % 3 === 0 ? 0x6b7386 : 0x8f98aa));
    g.cylinder(0, 0, 9, 9, 4, 0x6b7386);
    g.box(-1, 10, 0, 0, 10, 0, 0x3d4352);
    g.set(2, 10, 1, 0x5fbf4a).set(-3, 9, 3, 0x9a6a3a); // trash poking out
    return g;
  },
};

/** Breakable shopping cart (flat: body + wheels as direct mesh children). */
function brkCart(K, x, z, ry, full = false) {
  const wheels = [];
  for (const wx of [-4, 5]) for (const wz of [-2, 2]) wheels.push(['cartWheel', G.cartWheel, { scale: 0.1, pivot: [0, 0, 0.5] }, (wx + 0.5) * 0.1, 0.1, (wz + 0.5) * 0.1]);
  return K.breakable('cart', [[full ? 'cartBodyFull' : 'cartBody', full ? G.cartBodyFull : G.cartBody, { scale: 0.1, pivot: [0, 0, 0] }], ...wheels], x, z, ry);
}

// ---------------------------------------------------------------------------
// MART: crazy voxel grocery store
function buildMart(K) {
  K.ground(
    tileTex('martLane', 0xfafcff, 0xffd6ea, 0xc8ccd8, [30, 3], { shine: 0xffffff }),
    tileTex('martFloor', 0xf0f4fa, 0xcfe6f6, 0xb8c0cc, [80, 22]),
  );
  // lane edge stripes
  K.mesh('martLaneEdge', () => {
    const g = new VoxGrid();
    for (const z of [-30, 29]) g.box(-300, 0, z, 299, 0, z, (x) => (Math.floor(x / 4) % 2 ? PAL.pink : PAL.yellow));
    return g;
  }, { scale: 0.1, pivot: [0, 0.9, 0], ao: false }, 0, 0, 0, 0, 1, { receive: true });

  // back wall (textured) + ceiling band
  const wallTex = pixelTex('martWall', 16, 32, (c) => {
    c.fillStyle = css(0xfff4e4); c.fillRect(0, 0, 16, 32);
    c.fillStyle = css(0x2a7ac8); c.fillRect(0, 28, 16, 4);
    c.fillStyle = css(0x3a8ad8); for (let x = 0; x < 16; x += 2) c.fillRect(x, 28, 1, 4);
    c.fillStyle = css(0xffffff); c.fillRect(0, 16, 16, 12);
    c.fillStyle = css(0xe4ecf4); for (let x = 0; x < 16; x += 4) c.fillRect(x, 16, 1, 12); c.fillRect(0, 22, 16, 1);
    const st = [PAL.pink, PAL.yellow, PAL.blue, PAL.green];
    st.forEach((col, i) => { c.fillStyle = css(col); c.fillRect(0, 11 + i, 16, 1); });
  }, [18, 1]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(150, 16), new THREE.MeshLambertMaterial({ map: wallTex }));
  wall.position.set(0, 8, -24);
  K.add(wall);
  // department signs
  const depts = [['DELI', -36, PAL.red], ['BAKERY', -18, PAL.orange], ['BEAST MART', 0, PAL.pink], ['DAIRY', 18, PAL.blue], ['FROZEN', 36, PAL.cyan]];
  for (const [label, x, col] of depts) {
    K.mesh('dept_' + label, () => {
      const g = new VoxGrid();
      signZ(g, label, 0, 0, 0, { board: 0xffffff, color: col, pad: 1, frame: col, scale: 1 });
      return g;
    }, { scale: label === 'BEAST MART' ? 0.32 : 0.24 }, x, label === 'BEAST MART' ? 9.6 : 10.2, -23.8);
  }
  // ceiling light bars
  const lights = [];
  for (const z of [-7.5, -13.5, -19.5]) for (let x = -63; x <= 63; x += 7) lights.push([x, 7.6 + (z === -7.5 ? 0.3 : 0), z]);
  const lb = new THREE.InstancedMesh(new THREE.BoxGeometry(4.6, 0.14, 0.42), glowMat(0xfffbe6), lights.length);
  lights.forEach(([x, y, z], i) => lb.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
  K.add(lb);
  const lh = new THREE.InstancedMesh(new THREE.BoxGeometry(4.9, 0.12, 0.55), new THREE.MeshLambertMaterial({ color: 0x8a92a4 }), lights.length);
  lights.forEach(([x, y, z], i) => lh.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y + 0.12, z)));
  K.add(lh);

  // aisles: shelves running along z (scale 0.2) + end caps
  const aisleShelf = (seed) => () => {
    const g = new VoxGrid();
    const L = 27;
    g.box(-3, 0, -L, 2, 0, L, 0x8a92a4);
    g.box(-1, 1, -L, 0, 11, L, 0xd8dee8);
    for (const y of [1, 4, 7, 10]) {
      g.box(-3, y, -L, 2, y, L, 0xeef2f6);
      g.box(2, y, -L, 2, y, L, (x, yy, z) => (z % 6 === 0 ? PAL.yellow : PAL.red));
      g.box(-3, y, -L, -3, y, L, (x, yy, z) => (z % 6 === 0 ? PAL.yellow : PAL.red));
      for (let z = -L; z <= L; z++) {
        for (const [x0, x1] of [[1, 1], [-2, -2]]) {
          if (hash3(z, y, seed + x0) < 0.08) continue;
          const c = PCOLS[Math.floor(hash3(z >> 1, y, seed * 3 + x0) * PCOLS.length)];
          const h = hash3(z, y + 1, seed) < 0.5 ? 2 : 1;
          g.box(x0, y + 1, z, x1, y + h, z, (xx, yy) => (yy === y + h && h === 2 ? shade(c, 0.35) : c));
        }
      }
    }
    for (const x of [-3, 2]) for (const z of [-L, L]) g.box(x, 0, z, x, 11, z, 0xc8ccd8);
    g.box(-3, 12, -L, 2, 12, L, [PAL.pink, PAL.blue, PAL.orange][seed % 3]);
    return g;
  };
  const aisleXs = [];
  for (let x = -32; x <= 32; x += 5.4) aisleXs.push(x);
  for (let v = 0; v < 3; v++) {
    const items = aisleXs.filter((_, i) => i % 3 === v).map((x) => [x, 0, -15.2]);
    K.inst('aisle' + v, aisleShelf(v + 1), { scale: 0.2 }, items, { shadow: false });
  }
  // end caps facing the camera
  const endCap = (label, kind) => () => {
    const g = new VoxGrid();
    g.box(-6, 0, -2, 5, 2, 2, PAL.red);
    g.box(-6, 3, -3, 5, 22, -2, 0xe8ecf2);
    for (const [y, dz] of [[3, 2], [9, 1], [15, 0]]) {
      g.box(-6, y - 1, -2, 5, y - 1, dz, 0xf4f6fa);
      if (kind === 'cans') {
        for (let x = -5; x <= 4; x += 2) for (let z = -1; z <= dz; z += 2) g.box(x, y, z, x + 1, y + 3, z + 1, (xx, yy) => (yy === y + 2 ? 0xffffff : PCOLS[(x + y) & 7]));
      } else if (kind === 'boxes') {
        for (let x = -6; x <= 3; x += 3) productBox(g, x, y, dz - 1, 3, 5, 2, PCOLS[(x * 3 + y) % 9 < 0 ? 0 : (x * 3 + y) % 9]);
      } else {
        productsRow(g, -6, 5, y, dz, kind, y * 7 + label.length);
        productsRow(g, -6, 5, y, dz - 2, kind, y * 5 + 1);
      }
    }
    signZ(g, label, 0, 23, -2, { board: PAL.yellow, color: PAL.red, pad: 1, frame: PAL.red, glow: false });
    return g;
  };
  const caps = [['SALE', 'cans'], ['$1', 'boxes'], ['NEW', 'mixed'], ['YUM', 'snacks']];
  caps.forEach(([label, kind], v) => {
    const items = aisleXs.filter((_, i) => i % 4 === v).map((x) => [x - 0.05, 0, -9.3]);
    K.inst('endcap_' + label, endCap(label, kind), { scale: 0.1 }, items);
  });
  // hanging aisle signs
  aisleXs.slice(0, -1).forEach((x, i) => {
    const n = String(i + 1);
    K.mesh(`aisleSign_${i}`, () => aisleSignGrid([PAL.blue, PAL.pink, PAL.green, PAL.orange][i % 4], n.length > 1 ? n.slice(-1) : n), { scale: 0.085 }, x + 2.7, 5.9, -11.5);
  });

  // checkout lanes + freezers + produce
  const checkouts = [];
  [[-14, 1], [-8.5, 2], [8.5, 3], [14, 4]].forEach(([x, n]) => K.mesh('checkout' + n, () => checkoutGrid(n), { scale: 0.1 }, x, 0, -5.4, 0, 1, { shadow: true }));
  for (const x of [-30.5, -27, 27, 30.5]) {
    const f = makeFreezer();
    f.position.set(x, 0, -6.2);
    K.add(f);
  }
  K.mesh('produce', produceGrid, { scale: 0.1 }, -37, 0, -6, 0.15);
  K.mesh('produce', produceGrid, { scale: 0.1 }, 37, 0, -6, -0.15);
  // centre promo pyramid
  K.mesh('promoPyramid', () => {
    const g = new VoxGrid();
    for (let t = 0; t < 6; t++) {
      const w = 14 - t * 2;
      for (let x = -w; x < w; x += 2) for (let z = -4 + t; z <= 3 - t; z += 2) {
        const c = PCOLS[Math.abs(x + t * 3) % 9];
        g.box(x, t * 3, z, x + 1, t * 3 + 2, z + 1, (xx, yy) => (yy === t * 3 + 1 ? 0xffffff : c));
      }
    }
    g.box(-1, 18, 0, 0, 24, 0, PAL.metal);
    signZ(g, 'SALE', 0, 25, 0, { board: PAL.red, color: 0xffffff, pad: 2, frame: PAL.yellow, scale: 2 });
    return g;
  }, { scale: 0.1 }, 0, 0, -6.2, 0, 1, { shadow: true });

  // giant hanging food decorations (spin slowly)
  const giants = [['donut', -24, 6.3, -12.5, 4.6], ['burger', 0, 6.4, -12, 5], ['soda', 21, 6.2, -13, 4.6], ['pizza', -10, 7.0, -17, 6], ['banana', 11, 7.0, -18, 6], ['cake', 33, 6.2, -15, 4.6], ['apple', -36, 6.4, -15, 5]];
  for (const [kind, x, y, z, s] of giants) {
    const m = makeMesh(greedyGeometry('giantFood_' + kind, () => foodGrid(kind), { scale: 0.05 * s }));
    m.castShadow = false;
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    holder.add(m);
    if (kind === 'pizza' || kind === 'chocoBar') m.rotation.x = Math.PI / 2;
    const wire = new THREE.Mesh(new THREE.BoxGeometry(0.03, 4, 0.03), new THREE.MeshLambertMaterial({ color: 0x5d6476 }));
    wire.position.set(x, y + 2.4, z);
    K.add(wire);
    K.add(holder);
    let ph = K.rand(0, 6);
    K.updaters.push((dt) => { holder.rotation.y += dt * 0.5; holder.position.y = y + Math.sin((ph += dt) * 1.2) * 0.08; });
  }

  // background carts
  K.inst('bgCart', G.cartBodyFull, { scale: 0.1 }, [[-20, 0, -7.4, 0.4], [-2.2, 0, -7.8, -0.2], [24, 0, -8, 2.9], [-33, 0, -8.6, 1.2]]);

  // foreground (low)
  const fgKinds = [['fgMelon', G.melonBin], ['fgCans', G.canPyramid], ['fgWater', G.waterPallet], ['fgChoco', () => {
    const g = new VoxGrid();
    g.box(-5, 0, -4, 4, 4, 3, (x, y, z) => (y === 4 || x === -5 || x === 4 ? PAL.woodD : PAL.wood));
    g.box(-4, 2, -3, 3, 4, 2, null);
    const wr = [0xff4fa3, 0x1d9bf0, PAL.gold, 0x8a4ad0];
    for (let x = -4; x <= 3; x += 2) for (let z = -3; z <= 2; z += 3) {
      const c = wr[(x + z + 8) % 4], h = 4 + ((x + z) & 1);
      g.box(x, 2, z, x + 1, h, z + 1, c).set(x, h, z + 1, 0xffffff);
    }
    g.box(-3, 1, 4, 2, 3, 4, 0xfff1d6);
    text(g, 'YUM', 0, 1, 5, '+z', PAL.choco, { center: true, sy: 1 });
    return g;
  }]];
  fgKinds.forEach(([id, fn], v) => {
    const items = [];
    for (let x = -40 + v * 5.5; x <= 40; x += 22) items.push([x + K.rand(-1, 1), 0, 5.6 + K.rand(0, 1.3), K.rand(-0.5, 0.5)]);
    K.inst(id, fn, { scale: 0.1 }, items, { shadow: true });
  });

  // breakables near the lane
  const B = [
    ['cart', -15, 2.3], ['shelf', -11, -2.4], ['cereal', -6.5, 2.5], ['cart', -2.5, -2.2], ['water', 2.5, 2.4],
    ['melons', 6.5, -2.4], ['cart', 10.5, 2.2], ['shelf', 14.5, -2.4], ['sign', 17, 2.5], ['cans', -17.5, -2.3], ['cans', 4.5, -2.2],
  ];
  for (const [kind, x, z] of B) {
    const ry = K.rand(-0.6, 0.6);
    if (kind === 'cart') brkCart(K, x, z, ry + (K.R() < 0.5 ? Math.PI : 0), K.R() < 0.5);
    else if (kind === 'shelf') K.breakable('shelf', [['miniShelf', G.miniShelf, { scale: 0.1 }]], x, z, K.rand(-0.15, 0.15));
    else if (kind === 'cans') K.breakable('cans', [['canPyramid', G.canPyramid, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'cereal') K.breakable('cereal', [['cerealStack', G.cerealStack, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'water') K.breakable('water', [['waterPallet', G.waterPallet, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'melons') K.breakable('melons', [['melonBin', G.melonBin, { scale: 0.1 }]], x, z, ry);
    else K.breakable('sign', [['wetSign', G.wetSign, { scale: 0.1 }]], x, z, ry);
  }
  return { sky: 0xfff4e4, fog: 0xf4f0ea };
}

// ---------------------------------------------------------------------------
// Shared scenery helpers

/** Chain-link fence along x at z (posts instanced + translucent wire texture). */
function chainFence(K, x0, x1, z, h = 2.2, gaps = []) {
  const posts = [];
  for (let x = x0; x <= x1; x += 2.5) if (!gaps.some(([a, b]) => x > a && x < b)) posts.push([x, 0, z]);
  K.inst('fencePost', () => new VoxGrid().box(0, 0, 0, 0, 21, 0, PAL.metalD).box(-1, 22, 0, 1, 22, 0, PAL.metal), { scale: 0.1 }, posts);
  const tex = pixelTex('chainWire', 8, 8, (c) => {
    c.clearRect(0, 0, 8, 8);
    c.fillStyle = '#c8d0dc';
    for (let i = 0; i < 8; i++) { c.fillRect(i, i, 1, 1); c.fillRect(7 - i, i, 1, 1); }
  }, [1, 1]);
  const segs = [];
  let a = x0;
  for (const [g0, g1] of [...gaps, [x1, x1]]) { if (g0 > a) segs.push([a, Math.min(g0, x1)]); a = g1; }
  for (const [s0, s1] of segs) {
    const t = tex.clone();
    t.needsUpdate = true;
    t.repeat.set((s1 - s0) * 2.5, h * 2.5);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s1 - s0, h), new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }));
    m.position.set((s0 + s1) / 2, h / 2, z);
    K.add(m);
  }
}
/** Tree line: mixed round/pine trees. */
function treeLine(K, id, x0, x1, z0, z1, n, s0, s1, kinds = ['treeRound', 'treePine']) {
  const per = kinds.map(() => []);
  for (let i = 0; i < n; i++) {
    const k = Math.floor(K.R() * kinds.length);
    per[k].push([K.rand(x0, x1), 0, K.rand(z0, z1), K.rand(0, 6), K.rand(s0, s1)]);
  }
  kinds.forEach((k, i) => K.inst(id + '_' + k, ENV_GRIDS[k], { scale: 0.1 }, per[i]));
}
const skyDay = (seed) => (c, w, h) => {
  gradient([[0, 0x3a8ae8], [0.55, 0x8fd0ff], [1, 0xd8f0ff]])(c, w, h);
  pixelClouds(c, w, h, 0xffffff, 9, 6, 30, seed);
  pixelClouds(c, w, h, 0xeaf6ff, 5, 20, 36, seed + 5);
};
function laneEdge(K, id, colFn, o = {}) {
  K.mesh(id, () => {
    const g = new VoxGrid();
    const w = o.w ?? 1;
    for (const z of [-30, 30 - w]) g.box(-300, 0, z, 299, o.h ?? 0, z + w - 1, colFn);
    return g;
  }, { scale: 0.1, pivot: [0, (o.h ?? 0) + 0.9, 0] }, 0, (o.h ?? 0) * 0.1, 0, 0, 1, { receive: true });
}

// ---------------------------------------------------------------------------
// LAB YARD
function buildLab(K) {
  K.sky(skyDay(4));
  const lane = pixelTex('labLane', 32, 48, (c) => {
    c.fillStyle = css(0xb8bec8); c.fillRect(0, 0, 32, 48);
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) if (hash3(x, y, 77) < 0.12) { c.fillStyle = css(0xa8aeb8); c.fillRect(x, y, 1, 1); }
    c.fillStyle = css(0x8a92a0);
    for (let x = 0; x < 32; x += 16) c.fillRect(x, 0, 1, 48);
    c.fillRect(0, 24, 32, 1);
    c.fillStyle = css(0x29b6f6); c.fillRect(0, 23, 32, 1); c.fillRect(0, 25, 32, 1);
  }, [15, 1]);
  K.ground(lane, noiseTex('labYard', [0x9aa2ae, 0xa6aeba, 0x8e96a2, 0x7aa85a], [60, 22], {
    draw: (c) => { c.fillStyle = css(0x868e9a); c.fillRect(0, 0, 32, 1); c.fillRect(0, 0, 1, 32); },
  }), { far: noiseTex('grassFar', [0x5fbf4a, 0x52b048, 0x6fcf55], [70, 14]) });
  laneEdge(K, 'labEdge', hazardC(PAL.yellow, PAL.ink, 4), { w: 2 });
  // far hills + trees
  K.hills('labHills', { z: -52, scale: 1.5, base: 5, amp: 7, depth: 2, col: (x, y, h) => (y === h - 1 ? 0x7fd05a : y > h - 3 ? 0x5fb84a : 0x4a9a42), seed: 2 });
  K.hills('labHills2', { z: -44, scale: 1.2, base: 2, amp: 5, freq: 0.12, depth: 2, col: (x, y, h) => (y === h - 1 ? 0x6fc650 : 0x4fa846), seed: 7 });
  treeLine(K, 'labTrees', -90, 90, -40, -34, 46, 1.6, 2.6);
  // main lab building (greedy, 0.25)
  K.mesh('labMain', () => {
    const g = new VoxGrid();
    panelBox(g, -48, 0, -12, 47, 26, 11, { px: 8, py: 9 });
    g.box(-48, 0, -12, 47, 2, 11, PAL.metalD);
    g.box(-48, 20, -12, 47, 21, 11, PAL.blue);
    g.box(-49, 25, -13, 48, 27, 12, PAL.pink);
    for (const wy of [5, 13]) for (let x = -44; x <= 40; x += 7) {
      if (wy === 5 && x > -10 && x < 6) continue;
      g.box(x - 1, wy - 1, 12, x + 5, wy + 5, 12, PAL.white2);
      g.box(x, wy, 12, x + 4, wy + 4, 12, null);
      g.box(x, wy, 11, x + 4, wy + 4, 11, (xx, yy) => ((xx + yy) % 5 === 0 ? 0xffffff : PAL.blueL), true);
    }
    // entrance
    g.box(-8, 0, 12, 7, 10, 12, PAL.pink);
    g.box(-7, 0, 12, 6, 9, 12, null);
    g.box(-7, 0, 11, 6, 9, 11, (x) => (x === -1 || x === 0 ? PAL.metal : 0xcff4ff), true);
    // roof sign
    g.box(-18, 28, 0, -17, 29, 1, PAL.metalD).box(16, 28, 0, 17, 29, 1, PAL.metalD);
    signZ(g, 'BEAST LAB', 0, 30, 1, { scale: 1, sy: 2, board: 0x1b2440, color: PAL.pink, pad: 2, frame: PAL.white });
    boltEmblem(g, -30, 35, 2, { r: 5 });
    boltEmblem(g, 29, 35, 2, { r: 5 });
    return g;
  }, { scale: 0.22 }, 0, 0, -21);
  // dome lab (left) and hangar (right)
  K.mesh('labDome', () => {
    const g = new VoxGrid();
    panelBox(g, -24, 0, -10, 23, 14, 9, { c1: PAL.white, c2: PAL.white2 });
    g.box(-25, 14, -11, 24, 15, 10, PAL.blue);
    g.ellipsoid(0, 16, 0, 18, 14, 9, (x, y, z) => ((x + y) % 4 === 0 ? PAL.white2 : (y + z) % 6 === 0 ? PAL.cyan : PAL.blueL), false);
    g.carve((x, y) => y < 16 && y > 15);
    g.forEach((x, y, z, c) => { if (c === PAL.cyan) g.set(x, y, z, c, true); });
    for (let x = -20; x <= 18; x += 6) g.box(x, 4, 10, x + 3, 9, 10, PAL.cyan, true);
    return g;
  }, { scale: 0.25 }, -32, 0, -19);
  K.mesh('labHangar', () => {
    const g = new VoxGrid();
    panelBox(g, -22, 0, -10, 21, 20, 9, { c1: 0xdfe5ee, c2: 0xd0d8e4, px: 6 });
    for (let x = -23; x <= 22; x++) {
      const y = 21 + Math.round(Math.sqrt(Math.max(0, 1 - (x / 23) ** 2)) * 7);
      g.box(x, 21, -11, x, y, 10, x % 4 === 0 ? PAL.metalD : PAL.metal);
    }
    g.box(-12, 0, 10, 11, 17, 10, hazardC());
    g.box(-10, 0, 10, 9, 15, 10, null);
    g.box(-10, 0, 9, 9, 15, 9, (x, y) => (y % 3 === 0 ? PAL.metal : PAL.metalD));
    g.box(-4, 18, 11, 3, 19, 11, PAL.pink, true);
    return g;
  }, { scale: 0.25 }, 31, 0, -18);
  // spinning dishes on the hangar + radio tower
  for (const [x, y, z, sp] of [[27, 7.2, -18, 0.6], [35, 7.2, -18, -0.8], [6, 6.2, -22, 0.5]]) {
    const holder = new THREE.Group();
    holder.position.set(x, y, z);
    const m = makeMesh(greedyGeometry('bd_dishBig', () => dishGrid({ r: 7 }), { scale: 0.15, pivot: [0.5, 0, 0.5] }));
    m.castShadow = false;
    holder.add(m);
    K.add(holder);
    K.updaters.push((dt) => { holder.rotation.y += dt * sp; });
  }
  K.mesh('radioTower', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 44; y++) {
      const r = Math.round(4 - y / 14);
      for (const [x, z] of [[-r, -r], [r, -r], [-r, r], [r, r]]) g.set(x, y, z, y % 2 ? PAL.red : 0xffffff);
      if (y % 5 === 0) g.box(-r, y, -r, r, y, -r, PAL.metal).box(-r, y, r, r, y, r, PAL.metal);
    }
    return g;
  }, { scale: 0.22 }, -15, 0, -27);
  const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), glowMat(0xff3040));
  beacon.position.set(-15, 9.9, -27);
  K.add(beacon);
  let bt = 0;
  K.updaters.push((dt) => { bt += dt; beacon.visible = (bt % 1.2) < 0.6; });
  // fence + containers + outdoor tanks + floodlights
  chainFence(K, -60, 60, -5.2, 2.0, [[-4, 4]]);
  const container = (col) => () => {
    const g = new VoxGrid();
    g.box(-15, 0, -6, 14, 12, 5, (x, y, z) => ((x + 15) % 2 === 0 && (z === 5 || z === -6) ? shade(col, -0.18) : (z + 6) % 2 === 0 && Math.abs(x) === 15 ? shade(col, -0.18) : col));
    g.box(-15, 0, -6, 14, 0, 5, shade(col, -0.35)).box(-15, 12, -6, 14, 12, 5, shade(col, 0.1));
    g.box(14, 1, -5, 14, 11, 4, shade(col, -0.25));
    for (let z = -4; z <= 3; z += 2) g.box(15, 1, z, 15, 11, z, PAL.metal);
    return g;
  };
  const cont = { red: [], blue: [], green: [], orange: [] };
  const cpos = [[-30, 0, -8.5, 0, 'red'], [-30, 1.3, -8.5, 0, 'blue'], [-24, 0, -8.8, 0.1, 'orange'], [22, 0, -8.6, 0, 'green'], [28.5, 0, -8.6, 0, 'blue'], [25, 1.3, -8.6, 0.05, 'red'], [44, 0, -9, 0.2, 'orange'], [-46, 0, -9, -0.1, 'green']];
  for (const [x, y, z, ry, c] of cpos) cont[c].push([x, y, z, ry]);
  for (const [c, items] of Object.entries(cont)) K.inst('container_' + c, container({ red: 0xd8443a, blue: 0x2a7ac8, green: 0x3a9a5a, orange: 0xf08a2a }[c]), { scale: 0.2 }, items);
  for (const [x, col] of [[-10, 0x7cff3a], [10, 0x5ce1e6], [-16, 0xff4fa3]]) {
    K.mesh('yardTankFrame', () => {
      const g = new VoxGrid();
      g.cylinder(0, 0, 0, 3, 7, PAL.metalD);
      ring(g, 0, 0, 2, 2, 7, PAL.yellow);
      g.cylinder(0, 0, 26, 29, 7, PAL.metal);
      ring(g, 0, 0, 27, 27, 7, PAL.pink);
      for (const [a, b] of [[-7, 0], [7, 0], [0, -7]]) g.box(a, 4, b, a, 25, b, PAL.metalD);
      return g;
    }, { scale: 0.1, pivot: [0.5, 0, 0.5] }, x, 0, -7.5, 0, 1, { shadow: true });
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2.1, 14), new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.45, transparent: true, opacity: 0.55, depthWrite: false }));
    liq.position.set(x, 0.4 + 1.1, -7.5);
    liq.renderOrder = 2;
    const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 2.2, 14, 1, true), glassMat(0xd8f4ff, 0.2));
    gl.position.set(x, 0.4 + 1.1, -7.5);
    gl.renderOrder = 3;
    K.add(liq); K.add(gl);
  }
  K.inst('floodlight', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 34, 0, PAL.metalD);
    g.box(-3, 35, -1, 3, 37, 0, PAL.metalDD);
    g.box(-3, 35, 1, 3, 37, 1, 0xfff6c0, true);
    return g;
  }, { scale: 0.1 }, [[-20, 0, -5.8], [20, 0, -5.8], [-40, 0, -5.8], [40, 0, -5.8]]);
  K.inst('groundPipe', () => {
    const g = new VoxGrid();
    pipe(g, 'x', -60, 60, 2, 0, PAL.metal, PAL.blue, 1, 12);
    for (let x = -54; x <= 54; x += 12) g.box(x, 0, -1, x, 1, 1, PAL.metalD);
    return g;
  }, { scale: 0.1 }, [[-38, 0, -11], [38, 0, -11], [0, 0, -12.2]]);
  // foreground: jersey barriers + crates
  K.inst('jersey', () => {
    const g = new VoxGrid();
    for (let y = 0; y <= 7; y++) {
      const w = y < 2 ? 3 : y < 4 ? 2 : 1;
      g.box(-10, y, -w, 9, y, w - 1, (x) => (y === 5 && Math.floor(x / 3) % 2 ? PAL.yellow : y === 5 ? PAL.ink : 0xc8ccd4));
    }
    return g;
  }, { scale: 0.1 }, [[-34, 0, 6.2, 0.1], [-13, 0, 6.6, -0.08], [9, 0, 6.1, 0.05], [30, 0, 6.5, -0.1]], { shadow: true });
  K.inst('fgCrates', () => {
    const g = new VoxGrid();
    crate(g, -5, 0, -2, 5); crate(g, 0, 0, -3, 5, PAL.woodL); crate(g, -3, 5, -2, 4, PAL.wood);
    return g;
  }, { scale: 0.1 }, [[-24, 0, 5.8, 0.3], [20, 0, 6.0, -0.4], [42, 0, 5.6, 0.2]], { shadow: true });
  K.inst('fgBarrels', () => {
    const g = new VoxGrid();
    barrel(g, -2, 0, 0, PAL.blue, { h: 8, r: 2 }); barrel(g, 3, 0, 1, PAL.yellow, { h: 8, r: 2 }); barrel(g, 0, 0, 4, PAL.blue, { h: 8, r: 2 });
    return g;
  }, { scale: 0.1 }, [[-4, 0, 6.2], [-44, 0, 6.0, 1], [33, 0, 5.4, 2]], { shadow: true });
  // breakables
  const B = [['barrel', -16, 2.4], ['crate', -12, -2.4], ['cone', -8, 2.6], ['toxic', -4.5, -2.3], ['crate', 0, 2.5], ['barrel', 3.5, -2.4], ['cone', 7, -2.6], ['toxic', 10.5, 2.3], ['crate', 14, -2.3], ['barrel', 17, 2.5]];
  for (const [kind, x, z] of B) brkEnv(K, kind, x, z);
  return { sky: 0x8fd0ff, fog: 0xbfe4ff };
}

/** Common environment breakables. */
function brkEnv(K, kind, x, z) {
  const ry = K.rand(-0.8, 0.8);
  const map = {
    barrel: ['barrelBlue', G.barrelBlue], toxic: ['barrelToxic', G.barrelToxic], crate: ['crate', G.crate], cone: ['cone', G.cone],
    trash: ['trashCan', G.trashCan], mailbox: ['mailbox', G.mailbox], hydrant: ['hydrant', G.hydrant],
  };
  const [id, fn] = map[kind] ?? map.crate;
  return K.breakable(kind, [[id, fn, { scale: 0.1 }]], x, z, ry);
}

// ---------------------------------------------------------------------------
// SUBURB OF HORRORS (dusk)
function buildSuburb(K) {
  K.sky((c, w, h) => {
    gradient([[0, 0x2a1a4a], [0.45, 0x6a3a7a], [0.75, 0xe86a5a], [1, 0xffb86a]])(c, w, h);
    stars(c, w, h, 50, 26, 9);
    c.fillStyle = '#fff4d0'; c.fillRect(92, 8, 10, 10); c.fillRect(91, 10, 12, 6); c.fillRect(94, 7, 6, 12);
    c.fillStyle = '#e8d8b0'; c.fillRect(95, 11, 2, 2); c.fillRect(98, 14, 2, 1);
    pixelClouds(c, w, h, 0x8a4a7a, 5, 24, 40, 3);
  });
  const road = pixelTex('suburbRoad', 32, 48, (c) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) { c.fillStyle = css(hash3(x, y, 5) < 0.2 ? 0x34363f : hash3(x, y, 6) < 0.1 ? 0x464a55 : 0x3c3f49); c.fillRect(x, y, 1, 1); }
    c.fillStyle = css(0xe8e8e0); c.fillRect(0, 2, 32, 1); c.fillRect(0, 45, 32, 1);
    c.fillStyle = css(PAL.yellow); c.fillRect(2, 23, 14, 2);
    c.fillStyle = css(0x2e3038); c.fillRect(20, 30, 5, 1); c.fillRect(22, 31, 4, 1);
  }, [15, 1]);
  K.ground(road, noiseTex('duskGrass', [0x3f7a3a, 0x356e34, 0x4a8a42, 0x2e6430], [70, 22]), { far: noiseTex('duskGrassFar', [0x2f5a32, 0x284e2c], [60, 14]) });
  // curbs + sidewalks
  K.mesh('curbs', () => {
    const g = new VoxGrid();
    for (const z of [-32, 30]) g.box(-300, 0, z, 299, 1, z + 1, (x) => (x % 10 === 0 ? 0x9aa0a8 : 0xb8bcc4));
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] }, 0, 0, 0, 0, 1, { receive: true });
  const walk = tileTex('sidewalk', 0xb4b8c0, 0xaeb2ba, 0x8a8e96, [40, 1]);
  K.add(texPlane(walk, -80, 80, 3.2, 5.0, 0.01));
  K.add(texPlane(tileTex('sidewalk', 0xb4b8c0, 0xaeb2ba, 0x8a8e96, [40, 1]), -80, 80, -5.0, -3.2, 0.01));
  // far hills + trees + water tower
  K.hills('subHills', { z: -50, scale: 1.5, base: 4, amp: 6, depth: 2, col: (x, y, h) => (y === h - 1 ? 0x3a4a5a : 0x2a3446), seed: 5 });
  treeLine(K, 'subTreesFar', -90, 90, -34, -26, 50, 1.6, 2.4);
  K.mesh('waterTower', () => {
    const g = new VoxGrid();
    for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) g.box(x, 0, z, x, 30, z, 0x6a7080);
    g.cylinder(0, 0, 31, 44, 10, (x, y) => (y === 31 || y === 44 ? 0x8a90a0 : 0xc8ccd8));
    for (let i = 0; i < 12; i++) g.cylinder(0, 0, 45 + i, 45 + i, 10 - i, 0x8a90a0);
    text(g, 'SUBURB', 0, 35, 11, '+z', 0xff8a2a, { center: true });
    return g;
  }, { scale: 0.2 }, 24, 0, -30);
  // houses
  const HC = [0x8fd0ff, 0xffb46a, 0x9ae07a, 0xff9ac8, 0xc8a0ff];
  const houseItems = HC.map(() => []);
  let i = 0;
  for (let x = -44; x <= 44; x += 8.8) houseItems[i++ % HC.length].push([x + K.rand(-0.4, 0.4), 0, -12.5 + K.rand(-0.6, 0.6), K.rand(-0.06, 0.06), 1.35]);
  HC.forEach((c, k) => K.inst('house' + k, () => houseGrid(c, k), { scale: 0.12 }, houseItems[k], { shadow: false }));
  // yard trees, spooky dead trees, fences, mailboxes, lamps
  const yardTrees = [];
  for (let x = -40; x <= 40; x += 8.8) yardTrees.push([x + 4.4 + K.rand(-0.5, 0.5), 0, -9 + K.rand(-1, 1), K.rand(0, 6), K.rand(1.1, 1.5)]);
  K.inst('yardTrees', ENV_GRIDS.treeRound, { scale: 0.1 }, yardTrees.filter((_, k) => k % 3 !== 1));
  K.inst('deadTree', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 16, 0, 0x4a3a3a);
    g.line(0, 10, 0, 5, 16, 1, 0x4a3a3a).line(-1, 12, 0, -6, 18, -1, 0x4a3a3a).line(0, 15, 0, 2, 22, 0, 0x4a3a3a);
    g.line(5, 16, 1, 7, 19, 1, 0x4a3a3a).line(-6, 18, -1, -8, 17, -1, 0x4a3a3a);
    return g;
  }, { scale: 0.1 }, yardTrees.filter((_, k) => k % 3 === 1).map(([x, y, z, r, s]) => [x, y, z, r, s * 1.2]));
  const fences = [];
  for (let x = -44; x <= 44; x += 8.8) { fences.push([x - 2.4, 0, -6.4]); fences.push([x + 2.6, 0, -6.4]); }
  K.inst('picket', () => {
    const g = new VoxGrid();
    for (let x = -18; x < 18; x++) {
      if ((x + 18) % 3 === 0) { g.box(x, 0, 0, x, 8, 0, 0xf4f6fa); g.set(x, 9, 0, 0xdfe4ea); }
      g.set(x, 2, -1, 0xd8dce4).set(x, 6, -1, 0xd8dce4);
    }
    return g;
  }, { scale: 0.1 }, fences);
  const boxes = [];
  for (let x = -44; x <= 44; x += 8.8) boxes.push([x + 0.6, 0, -5.6, Math.PI / 2]);
  K.inst('bgMailbox', ENV_GRIDS.mailbox, { scale: 0.1 }, boxes);
  const lampXs = [-35, -18, 0, 18, 35];
  K.inst('streetLamp', ENV_GRIDS.lamp, { scale: 0.12 }, lampXs.map((x) => [x, 0, -4.4]));
  for (const x of lampXs) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(1.4, 12), glowMat(0xffe9a0, 0.12));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x + 0.6, 0.02, -4.2);
    K.add(pool);
  }
  // pumpkins (glowing faces)
  const pumpkin = () => {
    const g = new VoxGrid();
    g.ellipsoid(0, 3, 0, 4, 3, 3.5, (x, y, z) => (Math.abs(x) % 3 === 0 ? 0xe86a1a : PAL.orange));
    g.box(0, 6, 0, 0, 7, 0, 0x3a6a2a);
    g.set(-2, 4, 4, 0xffe060, true).set(2, 4, 4, 0xffe060, true);
    g.box(-2, 2, 4, 2, 2, 4, 0xffe060, true);
    g.set(-1, 3, 4, 0xffe060, true).set(1, 3, 4, 0xffe060, true);
    g.carve((x, y) => y < 0);
    return g;
  };
  // foreground
  K.inst('fgPicket', () => {
    const g = new VoxGrid();
    for (let x = -14; x < 14; x++) {
      if ((x + 14) % 3 === 0) { g.box(x, 0, 0, x, 7, 0, 0xeef0f4); g.set(x, 8, 0, 0xd8dce4); }
      g.set(x, 2, -1, 0xd0d4dc).set(x, 5, -1, 0xd0d4dc);
    }
    return g;
  }, { scale: 0.1 }, [[-30, 0, 6.6, 0.05], [-14, 0, 6.8, -0.05], [12, 0, 6.6, 0.02], [30, 0, 6.9, -0.1]], { shadow: true });
  K.inst('fgBush', ENV_GRIDS.bush, { scale: 0.1 }, [[-22, 0, 5.8], [-6, 0, 6.2], [4, 0, 5.9, 1], [22, 0, 6.0, 2], [40, 0, 5.7], [-40, 0, 5.9]], { shadow: true });
  K.inst('pumpkin', pumpkin, { scale: 0.08 }, [[-25, 0, 5.4, 0.2], [-2, 0, 5.6, -0.3], [16, 0, 5.3, 0.1], [36, 0, 5.4, -0.2], [-8, 0, -6.0, 0.3], [9, 0, -6.1], [27, 0, -6.0]], { shadow: true });
  // bats (animated)
  const bats = [];
  const batGeo = greedyGeometry('bd_bat', () => {
    const g = new VoxGrid();
    g.box(-1, 0, 0, 0, 1, 0, 0x1a1424).box(-4, 1, 0, -2, 1, 0, 0x2a2034).box(1, 1, 0, 3, 1, 0, 0x2a2034).set(-4, 2, 0, 0x2a2034).set(3, 2, 0, 0x2a2034);
    g.set(-1, 1, 1, 0xff3040, true).set(0, 1, 1, 0xff3040, true);
    return g;
  }, { scale: 0.12, pivot: 'center' });
  for (let k = 0; k < 6; k++) {
    const b = makeMesh(batGeo);
    b.castShadow = false;
    b.userData = { cx: K.rand(-30, 30), y: K.rand(6, 9), z: K.rand(-14, -8), r: K.rand(2, 5), sp: K.rand(0.6, 1.2), ph: K.rand(0, 6) };
    K.add(b);
    bats.push(b);
  }
  let t = 0;
  K.updaters.push((dt) => {
    t += dt;
    for (const b of bats) {
      const u = b.userData, a = t * u.sp + u.ph;
      b.position.set(u.cx + Math.cos(a) * u.r, u.y + Math.sin(a * 3) * 0.3, u.z + Math.sin(a) * u.r * 0.4);
      b.scale.y = 0.6 + Math.abs(Math.sin(t * 14 + u.ph)) * 0.6;
      b.rotation.y = -a;
    }
  });
  // breakables
  const B = [['trash', -16, -2.5], ['cone', -12.5, 2.6], ['mailbox', -9, 2.7], ['hydrant', -5, -2.6], ['trash', -1, 2.5], ['cone', 3, -2.6], ['mailbox', 6.5, -2.7], ['trash', 10, 2.4], ['hydrant', 13.5, 2.6], ['cone', 17, -2.5]];
  for (const [kind, x, z] of B) brkEnv(K, kind, x, z);
  return { sky: 0x6a3a7a, fog: 0x5a3a6a };
}

// ---------------------------------------------------------------------------
// JIMMY'S MANSION (sunny, gold & marble)
function buildMansion(K) {
  K.sky(skyDay(11));
  const lane = pixelTex('mansionLane', 32, 48, (c) => {
    for (let y = 0; y < 48; y++) for (let x = 0; x < 32; x++) {
      const tile = ((x >> 3) + (y >> 3)) & 1;
      c.fillStyle = css(tile ? 0xf4efe4 : 0xe4dccc);
      if (hash3(x, y, 3) < 0.06) c.fillStyle = css(0xd4ccbc);
      c.fillRect(x, y, 1, 1);
    }
    c.fillStyle = css(PAL.gold); c.fillRect(0, 15, 32, 1); c.fillRect(0, 32, 32, 1);
    c.fillStyle = css(0xc0203a); c.fillRect(0, 16, 32, 16);
    c.fillStyle = css(0xa8182e); for (let x = 0; x < 32; x += 4) c.fillRect(x, 16, 1, 16);
    c.fillStyle = css(0xe0405a); c.fillRect(0, 17, 32, 1);
  }, [15, 1]);
  const lawn = pixelTex('mansionLawn', 32, 32, (c) => {
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      c.fillStyle = css(((x >> 3) & 1) ? (hash3(x, y, 1) < 0.2 ? 0x5ec44a : 0x6ad050) : (hash3(x, y, 2) < 0.2 ? 0x4fb442 : 0x58bc48));
      c.fillRect(x, y, 1, 1);
    }
  }, [40, 11]);
  K.ground(lane, lawn, { far: noiseTex('lawnFar', [0x58bc48, 0x4fb442], [60, 14]) });
  laneEdge(K, 'mansionEdge', (x) => (x % 6 === 0 ? PAL.goldL : PAL.gold), { w: 1 });
  K.hills('manHills', { z: -55, scale: 1.6, base: 4, amp: 6, depth: 2, col: (x, y, h) => (y === h - 1 ? 0x7fd05a : 0x5fb84a), seed: 9 });
  treeLine(K, 'manCypress', -90, 90, -38, -30, 40, 1.8, 2.6, ['treePine', 'treeRound']);
  // mansion + guest wings
  K.mesh('mansionBig', mansionGrid, { scale: 0.19 }, 0, 0, -21);
  K.inst('mansionSmall', mansionGrid, { scale: 0.12 }, [[-38, 0, -24, 0.25], [38, 0, -24, -0.25]]);
  // hedge wall with gaps
  K.inst('hedge', () => {
    const g = new VoxGrid();
    g.box(-30, 0, -4, 29, 11, 3, (x, y, z) => (y === 11 && hash3(x, y, z) < 0.4 ? 0x6fd85a : hash3(x >> 1, y >> 1, z) < 0.3 ? 0x2f8a3a : 0x3f9a42));
    return g;
  }, { scale: 0.1 }, [[-27, 0, -7.6], [-13, 0, -7.6], [13, 0, -7.6], [27, 0, -7.6], [-41, 0, -7.6], [41, 0, -7.6]]);
  // fountain (animated jet)
  K.mesh('fountain', () => {
    const g = new VoxGrid();
    ring(g, 0, 0, 0, 3, 22, (x, y) => (y === 3 ? PAL.gold : 0xf0ece4), false, 2);
    g.cylinder(0, 0, 0, 0, 21, 0xd8d0c0);
    g.cylinder(0, 0, 1, 14, 3, 0xf0ece4);
    ring(g, 0, 0, 14, 17, 10, (x, y) => (y === 17 ? PAL.gold : 0xf0ece4), false, 2);
    g.cylinder(0, 0, 14, 14, 9, 0xe8e0d0);
    g.cylinder(0, 0, 18, 26, 2, 0xf0ece4);
    g.sphere(0, 28, 0, 3, PAL.gold);
    return g;
  }, { scale: 0.1, pivot: [0.5, 0, 0.5] }, 0, 0, -10.5);
  const waterMat = new THREE.MeshLambertMaterial({ color: 0x5ac8ff, emissive: 0x1a5a8a, transparent: true, opacity: 0.7 });
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.05, 0.2, 24), waterMat);
  pool.position.set(0, 0.2, -10.5);
  const pool2 = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.1, 18), waterMat);
  pool2.position.set(0, 1.62, -10.5);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.16, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xc8f0ff, transparent: true, opacity: 0.75 }));
  jet.position.set(0, 3.4, -10.5);
  K.add(pool); K.add(pool2); K.add(jet);
  const drops = [];
  for (let k = 0; k < 10; k++) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xdff6ff }));
    d.userData.ph = k / 10;
    K.add(d);
    drops.push(d);
  }
  let ft = 0;
  K.updaters.push((dt) => {
    ft += dt;
    jet.scale.y = 1 + Math.sin(ft * 5) * 0.12;
    for (const d of drops) {
      const p = (ft * 0.7 + d.userData.ph) % 1, a = d.userData.ph * Math.PI * 2;
      d.position.set(Math.cos(a) * p * 1.1, 4.0 + p * 0.6 - p * p * 2.6, -10.5 + Math.sin(a) * p * 1.1);
    }
  });
  // gold statues on pedestals (shiny)
  const goldM = variantMaterials('gold');
  for (const [x, ry] of [[-9, 0.4], [9, -0.4], [-20, 0.2], [20, -0.2]]) {
    K.mesh('statuePed2', () => {
      const g = new VoxGrid();
      g.box(-6, 0, -6, 5, 1, 5, 0xe8e2d6);
      g.box(-5, 2, -5, 4, 9, 4, (xx, y, z) => (vnoise(xx * 0.4, y * 0.4, z * 0.4) < 0.4 ? 0xdcd6ca : 0xf2eee6));
      g.box(-6, 10, -6, 5, 11, 5, 0xe8e2d6);
      g.box(-5, 9, 5, 4, 9, 5, PAL.gold);
      return g;
    }, { scale: 0.1 }, x, 0, -6.3, ry, 1, { shadow: true });
    const st = K.mesh('pantherGold', pantherGrid, { scale: 0.065, greedy: false }, x, 1.2, -6.3, ry, 1, { shadow: true, mats: goldM });
    st.castShadow = true;
  }
  // palms in gold planters
  K.inst('palmPlanter', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 4, 4, (x, y) => (y === 4 ? PAL.goldL : PAL.gold));
    g.cylinder(0, 0, 4, 4, 3, 0x6a4a2a);
    g.merge(ENV_GRIDS.treePalm(), 0, 5, 0);
    return g;
  }, { scale: 0.1 }, [[-15, 0, -8.6], [15, 0, -8.6, 2], [-33, 0, -9.4, 1], [33, 0, -9.4, 4]]);
  // gold sports car
  K.mesh('goldCar', () => {
    const g = new VoxGrid();
    g.box(-20, 3, -8, 19, 7, 7, (x, y) => (y === 7 ? PAL.goldL : PAL.gold));
    g.box(-8, 8, -7, 8, 11, 6, PAL.gold);
    g.box(-7, 8, -8, 7, 10, -8, 0x2a2a34).box(-7, 8, 7, 7, 10, 7, 0x2a2a34);
    g.box(9, 8, -6, 9, 10, 5, 0x2a2a34);
    g.box(20, 4, -7, 20, 6, 6, PAL.goldD).box(20, 5, -6, 20, 5, -4, 0xffffe0, true).box(20, 5, 3, 20, 5, 5, 0xffffe0, true);
    g.box(-21, 5, -6, -21, 6, 5, PAL.red, true);
    g.box(-19, 12, -7, -17, 12, 6, PAL.goldD);
    for (const x of [-13, 12]) for (const z of [-8, 7]) g.cylinder(x, 3, z - 1, z + 1, 3, (xx, y) => (Math.hypot(xx - x, y - 3) < 1.5 ? PAL.goldL : PAL.ink), 'z');
    return g;
  }, { scale: 0.1 }, 26, 0, -6.6, -0.3, 1, { shadow: true });
  // foreground: hedges, stanchions + velvet rope, flowers
  K.inst('fgHedge', () => {
    const g = new VoxGrid();
    g.box(-12, 0, -3, 11, 7, 2, (x, y, z) => (y === 7 && hash3(x, y, z) < 0.4 ? 0x6fd85a : hash3(x >> 1, y >> 1, z) < 0.3 ? 0x2f8a3a : 0x3f9a42));
    return g;
  }, { scale: 0.1 }, [[-36, 0, 6.4], [-20, 0, 6.8], [20, 0, 6.8], [36, 0, 6.4]], { shadow: true });
  K.inst('stanchions', () => {
    const g = new VoxGrid();
    for (const x of [-15, 0, 15]) { g.cylinder(x, 0, 0, 0, 2, PAL.goldD); g.box(x, 1, 0, x, 9, 0, PAL.gold); g.sphere(x, 10, 0, 1, PAL.goldL); }
    for (let x = -15; x <= 15; x++) if (x % 15) g.set(x, 8 - Math.round(Math.sin(((x + 15) % 15) / 15 * Math.PI) * 3), 0, 0xc0203a);
    return g;
  }, { scale: 0.1 }, [[-7, 0, 5.6], [8, 0, 5.8]], { shadow: true });
  K.inst('fgFlowers', ENV_GRIDS.flowers, { scale: 0.1 }, [[-28, 0, 5.4], [-13, 0, 6.0, 1], [0, 0, 6.6, 2], [14, 0, 5.9, 3], [28, 0, 5.5, 4], [44, 0, 6.0]], { shadow: true });
  // breakables
  const B = [['urn', -16, -2.4], ['cash', -12, 2.4], ['gold', -8, -2.5], ['urn', -4, 2.6], ['statue', 0, -2.5], ['cash', 4, 2.3], ['urn', 8, -2.5], ['gold', 12, 2.5], ['cash', 15.5, -2.4], ['urn', 17.5, 2.5]];
  for (const [kind, x, z] of B) {
    const ry = K.rand(-0.6, 0.6);
    if (kind === 'urn') K.breakable('urn', [['urn', G.urn, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'cash') K.breakable('cash', [['cashPile', G.cashPile, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'gold') K.breakable('gold', [['goldPile', G.goldPile, { scale: 0.1 }]], x, z, ry);
    else K.breakable('statue', [['bust', G.bust, { scale: 0.1 }]], x, z, ry);
  }
  return { sky: 0x8fd0ff, fog: 0xc8eaff };
}

// ---------------------------------------------------------------------------
// TECHNO TOWER (neon night)
function buildTechno(K) {
  K.sky((c, w, h) => {
    gradient([[0, 0x070a1e], [0.5, 0x1a1450], [0.85, 0x4a1a6a], [1, 0x8a2a8a]])(c, w, h);
    stars(c, w, h, 90, 34, 21);
  });
  const lane = pixelTex('technoLane', 32, 48, (c) => {
    c.fillStyle = css(0x161a2e); c.fillRect(0, 0, 32, 48);
    c.fillStyle = css(0x1e2440); for (let y = 0; y < 48; y += 8) for (let x = 0; x < 32; x += 8) c.fillRect(x + 1, y + 1, 6, 6);
  }, [15, 1]);
  const laneEm = pixelTex('technoLaneEm', 32, 48, (c) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, 32, 48);
    c.fillStyle = css(0x5ce1e6);
    c.fillRect(0, 4, 32, 1); c.fillRect(0, 43, 32, 1);
    c.fillRect(3, 4, 1, 10); c.fillRect(3, 14, 9, 1); c.fillRect(12, 14, 1, 8); c.fillRect(12, 22, 20, 1);
    c.fillRect(20, 30, 1, 13); c.fillRect(20, 30, 8, 1); c.fillRect(28, 26, 1, 4);
    c.fillStyle = css(0xff4fa3); c.fillRect(12, 22, 2, 2); c.fillRect(27, 25, 2, 2); c.fillRect(2, 13, 2, 2);
    c.fillStyle = css(0xb05cff); c.fillRect(0, 24, 6, 1);
  }, [15, 1]);
  const gr = K.ground(lane, tileTex('technoFloor', 0x1a1e34, 0x20263e, 0x2a3a6a, [60, 22]));
  gr.lane.material.emissiveMap = laneEm;
  gr.lane.material.emissive = new THREE.Color(0xffffff);
  laneEdge(K, 'technoEdge', (x) => (x % 8 < 4 ? 0x5ce1e6 : 0xff4fa3), { w: 1 });
  K.root.getObjectByName('technoEdge').material = [Mats.glow, Mats.glow];
  // far skyline (dark blocks with lit windows)
  K.mesh('skyline', () => {
    const g = new VoxGrid();
    for (let x = -100; x <= 100; ) {
      const w = 4 + Math.floor(hash3(x, 1, 2) * 6), h = 8 + Math.floor(hash3(x, 3, 4) * 22);
      const d = 3;
      for (let xx = x; xx < x + w; xx++) for (let y = 0; y < h; y++) for (let z = 0; z < d; z++) {
        const win = z === d - 1 && y % 2 === 1 && (xx - x) % 2 === 1 && hash3(xx, y, 7) < 0.45;
        g.set(xx, y, z - d, win ? (hash3(xx, y, 9) < 0.7 ? 0xffe9a0 : 0x5ce1e6) : (y === h - 1 ? 0x2a2e50 : 0x141830), win);
      }
      x += w + (hash3(x, 5, 6) < 0.3 ? 1 : 0);
    }
    return g;
  }, { scale: 0.7 }, 0, 0, -48);
  // towers
  const tw = [];
  for (let x = -60; x <= 60; x += 10) tw.push([x + K.rand(-2, 2), 0, -22 + K.rand(-4, 3), K.rand(0, 1.5), K.rand(1.0, 1.7)]);
  K.inst('technoTower', technoTowerGrid, { scale: 0.13 }, tw);
  // holo billboards (flickering)
  const holoGeo = greedyGeometry('bd_holo', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -1, 0, 30, 0, 0x2a3046);
    g.box(-14, 31, -1, 13, 46, -1, 0x0a1830, true);
    for (let x = -14; x <= 13; x++) { g.set(x, 31, 0, 0xffffff, true); g.set(x, 46, 0, 0xffffff, true); }
    for (let y = 31; y <= 46; y++) { g.set(-14, y, 0, 0xffffff, true); g.set(13, y, 0, 0xffffff, true); }
    const bolt = ['....##', '...##.', '..##..', '.#####', '...##.', '..##..', '.##...', '##....'];
    bolt.forEach((row, r) => [...row].forEach((ch, i) => ch === '#' && g.box(-10 + i * 2, 43 - r * 1.5, 0, -9 + i * 2, 43 - r * 1.5, 0, 0xffffff, true)));
    text(g, 'SWARM', 5, 35, 0, '+z', 0xffffff, { center: true, glow: true });
    return g;
  }, { scale: 0.1 });
  const holoMats = [0x5ce1e6, 0xff4fa3, 0xb05cff].map((c) => [Mats.solid, tintMat(c)]);
  const holos = [];
  [[-27, -8.2, 0], [-9, -8.6, 1], [9, -8.4, 2], [27, -8.2, 0], [45, -9, 1], [-45, -9, 2]].forEach(([x, z, k]) => {
    const m = makeMesh(holoGeo, holoMats[k]);
    m.position.set(x, 0, z);
    m.castShadow = false;
    K.add(m);
    holos.push(m);
  });
  // server racks + neon rails
  K.inst('serverRack', () => {
    const g = new VoxGrid();
    for (let i = 0; i < 3; i++) {
      const x0 = -10 + i * 7;
      g.box(x0, 0, -3, x0 + 5, 20, 2, 0x1c2034);
      for (let y = 2; y <= 18; y += 2) { g.box(x0 + 1, y, 3, x0 + 4, y, 3, 0x2a3050); g.set(x0 + 1 + ((y + i) % 4), y, 3, [0x5ce1e6, 0x7cff3a, 0xff4fa3][(y + i) % 3], true); }
    }
    return g;
  }, { scale: 0.1 }, [[-36, 0, -6.4], [-18, 0, -6.6], [18, 0, -6.6], [36, 0, -6.4]]);
  K.inst('neonRail', () => {
    const g = new VoxGrid();
    for (let x = -30; x < 30; x += 6) g.box(x, 0, 0, x, 7, 0, 0x2a3046);
    g.box(-30, 7, 0, 29, 7, 0, 0x5ce1e6, true);
    g.box(-30, 3, 0, 29, 3, 0, 0xff4fa3, true);
    return g;
  }, { scale: 0.1 }, [[-40, 0, -4.6], [-13, 0, -4.6], [13, 0, -4.6], [40, 0, -4.6]]);
  // drones
  const droneGeo = greedyGeometry('bd_drone', () => {
    const g = new VoxGrid();
    g.box(-2, 0, -2, 1, 1, 1, 0x2a3046);
    g.set(-1, 0, 2, 0xff3040, true).set(0, 0, 2, 0xff3040, true);
    for (const [x, z] of [[-4, -4], [3, -4], [-4, 3], [3, 3]]) { g.line(0, 1, 0, x, 1, z, 0x3a4060); g.box(x - 1, 2, z, x + 1, 2, z, 0x5ce1e6, true); }
    return g;
  }, { scale: 0.1, pivot: 'center' });
  const drones = [];
  for (let k = 0; k < 5; k++) {
    const d = makeMesh(droneGeo);
    d.castShadow = false;
    d.userData = { x: K.rand(-30, 30), y: K.rand(5, 7.5), z: K.rand(-12, -6), ph: K.rand(0, 6), sp: K.rand(0.3, 0.6) };
    K.add(d);
    drones.push(d);
  }
  let t = 0;
  K.updaters.push((dt) => {
    t += dt;
    for (const d of drones) {
      const u = d.userData;
      d.position.set(u.x + Math.sin(t * u.sp + u.ph) * 4, u.y + Math.sin(t * 2 + u.ph) * 0.25, u.z + Math.cos(t * u.sp * 0.7 + u.ph) * 1.5);
      d.rotation.y = Math.sin(t * u.sp + u.ph) * 0.5;
    }
    holos.forEach((h, k) => { h.visible = !(Math.sin(t * 7 + k * 3) > 0.985); });
  });
  // foreground: glowing floor lights + cable boxes
  K.inst('fgCableBox', () => {
    const g = new VoxGrid();
    g.box(-6, 0, -3, 5, 6, 2, 0x22263c);
    g.box(-6, 6, -3, 5, 6, 2, 0x2e3450);
    g.box(-5, 2, 3, 4, 2, 3, 0x5ce1e6, true);
    g.set(-4, 4, 3, 0x7cff3a, true).set(-2, 4, 3, 0xff4fa3, true);
    for (let x = -8; x <= 8; x++) g.set(x, 0, -4 + Math.round(Math.sin(x * 0.6)), 0x1a1a22);
    return g;
  }, { scale: 0.1 }, [[-30, 0, 6.2], [-12, 0, 6.6, 0.2], [6, 0, 6.0, -0.2], [24, 0, 6.5], [42, 0, 6.1]], { shadow: true });
  // breakables
  const B = [['server', -16, -2.4], ['nbarrel', -12, 2.5], ['bot', -8, -2.5], ['server', -4, 2.4], ['nbarrel', 0, -2.4], ['bot', 4, 2.5], ['server', 8, -2.4], ['nbarrel', 12, 2.4], ['bot', 15.5, -2.5], ['server', 17.5, 2.4]];
  for (const [kind, x, z] of B) {
    const ry = K.rand(-0.5, 0.5);
    if (kind === 'server') K.breakable('crate', [['serverCrate', G.serverCrate, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'nbarrel') K.breakable('barrel', [['neonBarrel', G.neonBarrel, { scale: 0.1 }]], x, z, ry);
    else K.breakable('bot', [['botHead', G.botHead, { scale: 0.1 }]], x, z, ry);
  }
  return { sky: 0x1a1450, fog: 0x1a1440 };
}

// ---------------------------------------------------------------------------
// ATOMIC REACTOR (toxic haze)
function buildReactor(K) {
  K.sky((c, w, h) => {
    gradient([[0, 0x3a4a3a], [0.5, 0x7a9a5a], [0.85, 0xc8d880], [1, 0xe8f0a0]])(c, w, h);
    pixelClouds(c, w, h, 0x9ab07a, 8, 8, 30, 13);
  });
  const lane = pixelTex('reactorLane', 32, 48, (c) => {
    c.fillStyle = css(0x4a505c); c.fillRect(0, 0, 32, 48);
    c.fillStyle = css(0x3a3f4a);
    for (let x = 0; x < 32; x += 4) c.fillRect(x, 0, 1, 48);
    for (let y = 0; y < 48; y += 4) c.fillRect(0, y, 32, 1);
    c.fillStyle = css(0x5a606c); for (let x = 2; x < 32; x += 4) for (let y = 2; y < 48; y += 4) c.fillRect(x, y, 1, 1);
    c.fillStyle = css(0x2a2f38); c.fillRect(0, 0, 32, 2); c.fillRect(0, 46, 32, 2);
  }, [15, 1]);
  const gr = K.ground(lane, noiseTex('reactorGround', [0x6a6e64, 0x5e6258, 0x74786c, 0x585c50, 0x7a8a3a], [60, 22]), { far: noiseTex('reactorFar', [0x5a6a4a, 0x4e5e42], [60, 14]) });
  laneEdge(K, 'reactorEdge', (x) => (Math.floor(x / 3) % 2 ? PAL.toxic : 0x2a2f38), { w: 1 });
  K.root.getObjectByName('reactorEdge').material = [Mats.solid, Mats.glow];
  K.hills('reHills', { z: -55, scale: 1.6, base: 4, amp: 7, depth: 2, col: (x, y, h) => (y === h - 1 ? 0x6a7a5a : 0x4e5a46), seed: 13 });
  // power pylons
  K.inst('pylon', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 40; y++) { const r = Math.max(1, Math.round(5 - y / 9)); g.set(-r, y, 0, 0x8a8e96).set(r, y, 0, 0x8a8e96); if (y % 6 === 0) g.box(-r, y, 0, r, y, 0, 0x8a8e96); }
    g.box(-10, 36, 0, 10, 36, 0, 0x8a8e96).box(-8, 30, 0, 8, 30, 0, 0x8a8e96);
    return g;
  }, { scale: 0.25 }, [[-60, 0, -40], [-25, 0, -42], [12, 0, -41], [48, 0, -40]]);
  // reactor complex + extra cooling towers
  K.mesh('reactorMain', reactorGrid, { scale: 0.24 }, 2, 0, -24);
  const tower = () => {
    const g = new VoxGrid();
    for (let y = 0; y <= 40; y++) {
      const tt = (y - 26) / 26, r = 9 + tt * tt * 7;
      ring(g, 0, 0, y, y, r, (x, yy, z) => (yy > 34 && yy < 38 ? 0xd84a4a : vnoise(x * 0.2, yy * 0.2, z * 0.2) < 0.4 ? 0xb8bcc4 : 0xc8ccd4), false, 2);
    }
    return g;
  };
  K.inst('coolTower', tower, { scale: 0.22 }, [[-30, 0, -26], [34, 0, -28], [-48, 0, -30]]);
  // steam puffs from towers
  const puffs = [];
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xf4f8f0, transparent: true, opacity: 0.8, depthWrite: false });
  const puffGeo = new THREE.BoxGeometry(1, 1, 1);
  const tops = [[-30, 9.2, -26], [34, 9.2, -28], [-48, 9.2, -30], [-1.4, 9.8, -24]];
  for (const [tx, ty, tz] of tops) for (let k = 0; k < 6; k++) {
    const p = new THREE.Mesh(puffGeo, puffMat);
    p.userData = { tx, ty, tz, ph: k / 6, ox: K.rand(-1, 1), oz: K.rand(-1, 1) };
    K.add(p);
    puffs.push(p);
  }
  // toxic pools + pipes + barrel stacks + fence
  const poolMat = glowMat(0x9dff3a, 0.85);
  for (const [x, z, r] of [[-12, -8, 2.2], [12, -8.5, 1.8], [-36, -9, 2.4], [38, -8.6, 2]]) {
    K.mesh('poolRim', () => {
      const g = new VoxGrid();
      ring(g, 0, 0, 0, 1, 10, (xx, y, zz) => (hash3(xx, y, zz) < 0.3 ? 0x6a6e64 : 0x8a8e84), false, 2);
      return g;
    }, { scale: 0.1, pivot: [0.5, 0, 0.5] }, x, 0, z, 0, r / 2.1);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95, 16), poolMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(x, 0.12 * (r / 2.1), z);
    K.add(pool);
  }
  K.inst('bigPipes', () => {
    const g = new VoxGrid();
    pipe(g, 'x', -60, 60, 6, 0, 0xb8a040, PAL.toxic, 2, 15);
    pipe(g, 'x', -60, 60, 12, -4, PAL.metal, PAL.red, 1, 10);
    for (let x = -55; x <= 55; x += 15) { g.box(x, 0, -1, x + 1, 6, 1, PAL.metalD); g.box(x, 6, -5, x + 1, 12, -3, PAL.metalD); }
    for (let x = -50; x <= 50; x += 20) { g.cylinder(x, 0, 9, 9, 2, PAL.red); g.box(x, 10, 0, x, 10, 0, PAL.red); }
    return g;
  }, { scale: 0.1 }, [[-35, 0, -11.5], [35, 0, -11.5], [0, 0, -12.5]]);
  chainFence(K, -60, 60, -5.0, 2.0, [[-3, 3]]);
  K.inst('radSign', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 10, 0, PAL.metalD);
    g.box(-4, 11, 0, 4, 19, 0, PAL.yellow);
    g.box(-1, 14, 1, 0, 15, 1, PAL.ink).box(-3, 16, 1, -2, 18, 1, PAL.ink).box(1, 16, 1, 2, 18, 1, PAL.ink).box(-1, 11, 1, 0, 13, 1, PAL.ink);
    return g;
  }, { scale: 0.1 }, [[-22, 0, -4.7], [-6, 0, -4.7], [6, 0, -4.7], [22, 0, -4.7], [42, 0, -4.7], [-42, 0, -4.7]]);
  K.inst('barrelStack', () => {
    const g = new VoxGrid();
    for (const [x, y, z] of [[-3, 0, 0], [3, 0, 0], [0, 0, 5], [0, 9, 2]]) {
      barrel(g, x, y, z, PAL.yellow, { h: 8, r: 2 });
      g.set(x, y + 4, z + 2, PAL.ink);
      g.set(x, y + 8, z, PAL.toxic, true);
    }
    return g;
  }, { scale: 0.1 }, [[-26, 0, -7], [26, 0, -7.2, 1], [-44, 0, -7, 2]]);
  // foreground
  K.inst('fgToxic', () => {
    const g = new VoxGrid();
    barrel(g, -3, 0, 0, PAL.yellow, { h: 8, r: 2 });
    barrel(g, 2, 0, 1, 0x3a8a3a, { h: 7, r: 2 });
    g.box(-3, 8, 0, -3, 8, 0, PAL.toxic, true);
    g.ellipsoid(5, 0, 4, 3, 0.4, 2, PAL.toxic, true);
    return g;
  }, { scale: 0.1 }, [[-32, 0, 6.0], [-10, 0, 6.5, 1], [8, 0, 6.0, 2], [28, 0, 6.6, 3], [44, 0, 6.1]], { shadow: true });
  let t = 0;
  K.updaters.push((dt) => {
    t += dt;
    for (const p of puffs) {
      const u = p.userData, q = (t * 0.12 + u.ph) % 1;
      p.position.set(u.tx + u.ox * q * 3 + q * 3, u.ty + q * 9, u.tz + u.oz * q * 2);
      p.scale.setScalar(1 + q * 3.5);
    }
    puffMat.opacity = 0.7;
    poolMat.color.setHex(0x9dff3a).multiplyScalar(0.85 + Math.sin(t * 2) * 0.15);
  });
  const B = [['toxic', -16, 2.4], ['crate', -12, -2.4], ['cone', -8.5, 2.6], ['toxic', -5, -2.4], ['gas', -1, 2.5], ['toxic', 3, -2.5], ['crate', 7, 2.4], ['gas', 10.5, -2.4], ['toxic', 14, 2.5], ['cone', 17, -2.5]];
  for (const [kind, x, z] of B) {
    if (kind === 'gas') K.breakable('barrel', [['gasTank', G.gasTank, { scale: 0.1 }]], x, z, K.rand(-0.5, 0.5));
    else brkEnv(K, kind, x, z);
  }
  return { sky: 0x9ab07a, fog: 0xa8b888 };
}

// ---------------------------------------------------------------------------
// CHOCOLATE FACTORY (indoor)
function buildFactory(K) {
  K.ground(
    tileTex('factoryLane', 0xf6e4c4, 0x8a5a3a, 0x6a4028, [30, 3], { shine: 0xfff4dc }),
    tileTex('factoryFloor', 0xb8a088, 0xa89078, 0x7a6450, [60, 22]),
  );
  laneEdge(K, 'chocoEdge', (x) => (x % 5 === 0 ? PAL.chocoL : PAL.choco), { w: 2, h: 0 });
  K.mesh('chocoDrips', () => {
    const g = new VoxGrid();
    for (const z of [-28, 27]) for (let x = -300; x < 300; x++) { const d = Math.floor(hash3(x, 3, z) * 3); g.box(x, 0, z, x, 0, z + (z > 0 ? -d : d), PAL.choco); }
    return g;
  }, { scale: 0.1, pivot: [0, 0.9, 0] }, 0, 0, 0, 0, 1, { receive: true });
  // back wall (brick texture) + windows
  const brick = pixelTex('factoryWall', 16, 16, (c) => {
    c.fillStyle = css(0x7a3a2a); c.fillRect(0, 0, 16, 16);
    c.fillStyle = css(0x9a4a32);
    for (let y = 0; y < 16; y += 2) for (let x = (y / 2) % 2 ? 0 : 2; x < 16; x += 4) c.fillRect(x, y, 3, 1);
    c.fillStyle = css(0xa85a3a); c.fillRect(1, 2, 2, 1); c.fillRect(9, 8, 2, 1);
  }, [40, 5]);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(160, 20), new THREE.MeshLambertMaterial({ map: brick }));
  wall.position.set(0, 10, -26);
  K.add(wall);
  K.inst('factoryWindow', () => {
    const g = new VoxGrid();
    g.box(-8, 0, 0, 7, 19, 0, 0x4a3a2a);
    g.box(-7, 1, 0, 6, 18, 0, (x, y) => (x === -1 || y === 9 ? 0x4a3a2a : y > 12 ? 0xfff0b0 : 0xffd27a), true);
    for (let x = -9; x <= 8; x++) g.set(x, -1, 1, 0x6a5a4a);
    return g;
  }, { scale: 0.2 }, [-48, -32, -16, 16, 32, 48].map((x) => [x, 4.5, -25.8]));
  K.mesh('factorySign', () => {
    const g = new VoxGrid();
    g.box(-30, 0, 0, 29, 13, 1, (x, y) => ((x + 30) % 6 === 0 || y === 7 ? PAL.chocoD : PAL.choco));
    g.box(-30, 0, 0, -12, 13, 2, 0xff4fa3);
    g.box(-30, 5, 3, -12, 8, 3, 0xffffff);
    text(g, 'CHOCO FACTORY', 6, 4, 2, '+z', 0xffe680, { center: true, glow: true });
    return g;
  }, { scale: 0.22 }, 0, 6.0, -25.6);
  // ceiling lights
  const lights = [];
  for (const z of [-9, -16]) for (let x = -56; x <= 56; x += 8) lights.push([x, 7.8, z]);
  const lb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.5, 0.9), glowMat(0xffe8b0), lights.length);
  lights.forEach(([x, y, z], i) => lb.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
  K.add(lb);
  // chocolate river with scrolling texture + candy-cane rail
  const riverTex = pixelTex('chocoRiver', 32, 16, (c) => {
    c.fillStyle = css(0x5a3220); c.fillRect(0, 0, 32, 16);
    c.fillStyle = css(0x6e4028); for (let i = 0; i < 14; i++) c.fillRect((i * 7) % 32, (i * 5) % 16, 5, 1);
    c.fillStyle = css(0x8a5a38); for (let i = 0; i < 6; i++) c.fillRect((i * 11) % 32, (i * 3 + 2) % 16, 3, 1);
  }, [24, 1]);
  const river = new THREE.Mesh(new THREE.PlaneGeometry(160, 3.6), new THREE.MeshPhongMaterial({ map: riverTex, shininess: 80, specular: 0x6a4a3a }));
  river.rotation.x = -Math.PI / 2;
  river.position.set(0, 0.06, -8.0);
  K.add(river);
  K.mesh('riverBanks', () => {
    const g = new VoxGrid();
    for (const z of [-99, -61]) g.box(-400, 0, z, 399, 1, z + 1, (x) => (x % 4 === 0 ? 0xc8a070 : 0xd8b080));
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] }, 0, 0, 0);
  K.inst('candyRail', () => {
    const g = new VoxGrid();
    for (const x of [-20, 0]) for (let y = 0; y <= 9; y++) g.set(x, y, 0, (y >> 1) % 2 ? 0xffffff : PAL.red);
    for (let x = -20; x <= 0; x++) g.set(x, 9, 0, ((x >> 1) & 1) ? 0xffffff : PAL.red);
    for (let x = -1; x <= 2; x++) g.set(x, 10 + (x === -1 || x === 2 ? 0 : 1), 0, 0xffffff);
    return g;
  }, { scale: 0.1 }, Array.from({ length: 24 }, (_, i) => [-58 + i * 5, 0, -5.8]).filter(([x]) => Math.abs(x) > 3));
  // chocolate waterfall from a pipe
  const fallTex = pixelTex('chocoFall', 8, 32, (c) => {
    c.fillStyle = css(0x5a3220); c.fillRect(0, 0, 8, 32);
    c.fillStyle = css(0x7a4a2a); for (let i = 0; i < 10; i++) c.fillRect((i * 3) % 8, (i * 7) % 32, 1, 4);
  }, [2, 2]);
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 5.8), new THREE.MeshLambertMaterial({ map: fallTex }));
  fall.position.set(0, 3.0, -9.6);
  K.add(fall);
  K.mesh('fallPipe', () => {
    const g = new VoxGrid();
    pipe(g, 'z', -40, 0, 0, 0, PAL.gold, PAL.goldD, 6, 10);
    g.cylinder(0, 0, 0, 2, 7, PAL.goldD, 'z');
    return g;
  }, { scale: 0.11, pivot: [0.5, 0, 0] }, 0, 5.4, -9.9);
  // vats, gears, conveyor with moving bars, pipes, lollipops
  K.inst('vat', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 30, 12, (x, y, z) => (y % 10 === 0 ? 0xa8602a : (x + z) % 7 === 0 ? 0xd88a4a : 0xc8783a));
    g.cylinder(0, 0, 30, 30, 11, PAL.choco);
    g.cylinder(0, 0, 31, 33, 13, 0xa8602a);
    g.cylinder(0, 0, 31, 33, 11, null);
    g.cylinder(0, 0, 31, 31, 11, PAL.chocoL);
    g.cylinder(0, 12, 14, 18, 3, 0xffffff, 'z');
    g.set(0, 16, 15, PAL.red).set(1, 17, 15, PAL.ink);
    g.box(-3, 0, 13, 3, 3, 13, PAL.goldD);
    return g;
  }, { scale: 0.13 }, [[-30, 0, -15], [-20, 0, -16.5], [20, 0, -16.5], [30, 0, -15], [44, 0, -17], [-44, 0, -17]]);
  const gearGeo = greedyGeometry('bd_gear', () => {
    const g = new VoxGrid();
    for (let x = -14; x <= 14; x++) for (let y = -14; y <= 14; y++) {
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      const tooth = Math.cos(a * 10) > 0.3;
      if (r <= 10.5 || (tooth && r <= 13.5)) if (r > 3) for (let z = -1; z <= 1; z++) g.set(x, y, z, r < 5 ? PAL.goldD : (r > 10 ? 0xc8902a : PAL.gold));
    }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; for (let r = 5; r < 10; r++) if ((r & 1) === 0) g.set(Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r), 2, PAL.goldD); }
    return g;
  }, { scale: 0.13, pivot: 'center' });
  const gears = [];
  for (const [x, y, s, dir] of [[-12, 5.5, 1, 1], [-8.4, 7.4, 0.62, -1.6], [12, 5.2, 1.1, -1], [15.6, 7.6, 0.6, 1.8], [-38, 6, 0.9, 1], [38, 6.4, 0.9, -1]]) {
    const m = makeMesh(gearGeo);
    m.position.set(x, y, -25.4);
    m.scale.setScalar(s);
    m.castShadow = false;
    K.add(m);
    gears.push([m, dir]);
  }
  K.mesh('conveyor', () => {
    const g = new VoxGrid();
    g.box(-150, 6, -3, 149, 7, 2, (x) => (x % 2 ? 0x2a2a34 : 0x3a3a44));
    g.box(-150, 5, -3, 149, 5, 2, PAL.metal);
    for (let x = -148; x < 150; x += 12) g.box(x, 0, -2, x + 1, 4, 1, PAL.metalD);
    return g;
  }, { scale: 0.1 }, 0, 0, -12.2);
  const barGeo = greedyGeometry('bd_convBar', () => {
    const g = new VoxGrid();
    g.box(-3, 0, -2, 2, 1, 1, PAL.choco).box(-1, 0, -2, 0, 1, 1, 0xff4fa3).box(-3, 2, -2, 2, 2, 1, null);
    g.set(-3, 1, 1, PAL.chocoL).set(2, 1, 1, PAL.chocoL);
    return g;
  }, { scale: 0.1 });
  const bars = new THREE.InstancedMesh(barGeo, Mats.pair, 40);
  K.add(bars);
  const mtx = new THREE.Matrix4();
  K.inst('lollipop', () => {
    const g = new VoxGrid();
    g.box(0, 0, 0, 0, 22, 0, 0xffffff);
    for (let x = -7; x <= 7; x++) for (let y = -7; y <= 7; y++) {
      const r = Math.hypot(x, y);
      if (r > 7.4) continue;
      const a = Math.atan2(y, x) + r * 0.45;
      g.set(x, 29 + y, 0, Math.sin(a * 2) > 0 ? PAL.pink : 0xffffff).set(x, 29 + y, -1, Math.sin(a * 2) > 0 ? PAL.pink : 0xffffff);
    }
    return g;
  }, { scale: 0.12 }, [[-24, 0, -10.5], [24, 0, -10.5, 0.3], [-50, 0, -11], [52, 0, -11, -0.2]]);
  K.inst('copperPipes', () => {
    const g = new VoxGrid();
    pipe(g, 'y', 0, 60, 0, 0, 0xc8783a, PAL.gold, 2, 12);
    pipe(g, 'y', 0, 60, 7, 0, 0xc8783a, PAL.gold, 1, 9);
    return g;
  }, { scale: 0.13 }, [[-26, 0, -21], [8, 0, -21], [26, 0, -21], [-8, 0, -21]]);
  // foreground
  K.inst('fgChocoStack', () => {
    const g = new VoxGrid();
    const wr = [0xff4fa3, 0x1d9bf0, PAL.gold];
    for (let i = 0; i < 4; i++) g.box(-5 + (i & 1), i * 2, -2, 4 + (i & 1), i * 2 + 1, 2, (x) => (x % 3 === 0 ? PAL.chocoD : i % 2 ? PAL.choco : wr[i % 3]));
    return g;
  }, { scale: 0.1 }, [[-34, 0, 6.0], [-16, 0, 6.6, 0.4], [4, 0, 6.1, -0.3], [22, 0, 6.5], [40, 0, 5.8, 0.2]], { shadow: true });
  K.inst('fgGumdrops', () => {
    const g = new VoxGrid();
    const cols = [PAL.red, PAL.green, PAL.yellow, PAL.purple, PAL.orange];
    for (let i = 0; i < 6; i++) g.ellipsoid(-4 + i * 1.6, 1, ((i * 3) % 5) - 2, 1.4, 1.3, 1.4, cols[i % 5]);
    g.carve((x, y) => y < 0);
    return g;
  }, { scale: 0.1 }, [[-26, 0, 5.6], [-6, 0, 5.8], [14, 0, 5.6], [32, 0, 6.2]], { shadow: true });
  let t = 0;
  K.updaters.push((dt) => {
    t += dt;
    riverTex.offset.x -= dt * 0.05;
    fallTex.offset.y += dt * 0.6;
    for (const [m, d] of gears) m.rotation.z += dt * d * 0.6;
    for (let i = 0; i < 40; i++) {
      const x = ((i * 0.75 + t * 1.2) % 30) - 15;
      mtx.makeTranslation(x, 0.8, -12.2);
      bars.setMatrixAt(i, mtx);
    }
    bars.instanceMatrix.needsUpdate = true;
  });
  // breakables
  const B = [['choco', -16, 2.4], ['crate', -12, -2.4], ['jar', -8, 2.5], ['choco', -4, -2.5], ['barrel', 0, 2.4], ['jar', 4, -2.4], ['choco', 8, 2.5], ['crate', 12, -2.5], ['jar', 15, 2.4], ['choco', 17.5, -2.4]];
  for (const [kind, x, z] of B) {
    const ry = K.rand(-0.6, 0.6);
    if (kind === 'choco') K.breakable('choco', [['chocoStackB', G.chocoStack, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'jar') K.breakable('jar', [['candyJar', G.candyJar, { scale: 0.1 }]], x, z, ry);
    else if (kind === 'barrel') K.breakable('barrel', [['cocoaBarrel', G.cocoaBarrel, { scale: 0.1 }]], x, z, ry);
    else K.breakable('crate', [['cocoaCrate', G.cocoaCrate, { scale: 0.1 }]], x, z, ry);
  }
  return { sky: 0x7a4a3a, fog: 0x6a4030 };
}

// ---------------------------------------------------------------------------
const BUILDERS = { lab: buildLab, suburb: buildSuburb, mansion: buildMansion, mart: buildMart, techno: buildTechno, reactor: buildReactor, factory: buildFactory };

/**
 * Battle backdrop for a theme ('lab','suburb','mansion','mart','techno','reactor','factory').
 * @returns {{root: THREE.Group, breakables: {obj:THREE.Group,kind:string,x:number,z:number}[], update(dt), sky:number, fog:number}}
 */
export function makeBattleBackdrop(theme = 'lab') {
  const fn = BUILDERS[theme] ?? BUILDERS.lab;
  const K = new Kit(theme);
  const info = fn(K) ?? {};
  return {
    root: K.root,
    breakables: K.breakables,
    update: (dt) => K.update(dt),
    sky: info.sky ?? 0x9fd8ff,
    fog: info.fog ?? info.sky ?? 0x9fd8ff,
    theme,
  };
}
