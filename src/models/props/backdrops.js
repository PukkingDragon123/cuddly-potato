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
import { ENV_GRIDS, houseGrid, mansionGrid, technoTowerGrid, reactorGrid, factoryGrid, roofGable } from './environment.js';

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
const BUILDERS = { mart: buildMart };

/**
 * Battle backdrop for a theme ('lab','suburb','mansion','mart','techno','reactor','factory').
 * @returns {{root: THREE.Group, breakables: {obj:THREE.Group,kind:string,x:number,z:number}[], update(dt), sky:number, fog:number}}
 */
export function makeBattleBackdrop(theme = 'lab') {
  const fn = BUILDERS[theme] ?? BUILDERS.mart;
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
