// Grocery store props (Food Season): shelves with products, carts, checkout,
// freezers, produce stands, aisle signs, cart corral and the store front.
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, vnoise, ring, text, vmesh, vgeo, glassBox, group, glowMat,
  stripesY, mulberry32,
} from './common.js';
import { cartGrid, productBox, signZ } from './labParts.js';

const PCOLS = [PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.pink, PAL.orange, PAL.purple, 0xffffff, PAL.cyan];
const pc = (i) => PCOLS[((i % PCOLS.length) + PCOLS.length) % PCOLS.length];

// ---------------------------------------------------------------------------
// Product "sections" at 0.05 voxel scale (~0.45 wide), merged per section.
// Local origin: bottom centre; faces +z.
const SECTION = {
  cereal(v) {
    const g = new VoxGrid();
    for (let i = 0; i < 2; i++) {
      const c = pc(v * 3 + i), x0 = -4 + i * 5;
      g.box(x0, 0, -2, x0 + 3, 7, 1, c);
      g.box(x0, 6, 1, x0 + 3, 7, 1, shade(c, 0.5));
      g.box(x0 + 1, 2, 2, x0 + 2, 4, 2, 0xffffff);
      g.set(x0 + 1, 3, 2, PAL.ink);
      g.set(x0 + 2, 1, 2, pc(v + i + 2));
    }
    return g;
  },
  chocolate(v) {
    const g = new VoxGrid();
    const wraps = [0xff4fa3, 0x1d9bf0, PAL.gold, 0x8a4ad0];
    for (let s = 0; s < 2; s++) for (let k = 0; k < 3; k++) {
      const c = wraps[(v + s + k) % 4], x0 = -4 + s * 5, y = k * 2;
      g.box(x0, y, -2, x0 + 3, y + 1, 1, c);
      g.box(x0 + 1, y + 1, 1, x0 + 2, y + 1, 1, 0xffffff);
      g.set(x0, y, 1, PAL.choco).set(x0 + 3, y, 1, PAL.choco);
    }
    if (v % 3 === 0) g.box(-4, 6, -2, -1, 6, 1, PAL.choco);
    return g;
  },
  drinks(v) {
    const g = new VoxGrid();
    for (let i = 0; i < 4; i++) {
      const c = pc(v + i), x = -4 + i * 2 + (i > 1 ? 1 : 0);
      if ((v + i) % 3 === 0) { // can
        g.box(x, 0, -1, x + 1, 3, 0, c).box(x, 2, 1, x + 1, 2, 1, 0xffffff).set(x, 4, -1, 0xb8c0cc);
      } else { // bottle
        g.box(x, 0, -1, x + 1, 5, 0, mixHex(c, 0xffffff, 0.15));
        g.box(x, 2, 1, x + 1, 3, 1, 0xffffff);
        g.set(x, 6, -1, c).set(x, 7, -1, 0xffffff);
      }
    }
    return g;
  },
  produce(v) {
    const g = new VoxGrid();
    g.box(-5, 0, -2, 4, 2, 2, PAL.woodL);
    g.box(-4, 1, -1, 3, 2, 1, null);
    const fruit = [PAL.red, PAL.orange, PAL.yellow, 0x7cd64a, 0x9a4ad0][v % 5];
    for (let x = -4; x <= 3; x++) for (let z = -1; z <= 1; z++) {
      g.set(x, 2 + ((x + z) & 1), z, hash3(x, v, z) < 0.25 ? shade(fruit, -0.2) : fruit);
      if (hash3(x, z, v) < 0.35) g.set(x, 4, z, fruit);
    }
    g.set(-1, 5, 0, 0x3f9a3a);
    return g;
  },
  snacks(v) {
    const g = new VoxGrid();
    for (let i = 0; i < 2; i++) {
      const c = pc(v * 2 + i + 1), x0 = -4 + i * 5;
      g.box(x0, 0, -1, x0 + 3, 6, 0, c);
      g.box(x0 + 1, 0, 1, x0 + 2, 5, 1, c);
      g.box(x0, 7, -1, x0 + 3, 7, 0, shade(c, -0.25));
      g.box(x0 + 1, 2, 2, x0 + 2, 3, 2, PAL.yellow);
      g.set(x0, 0, 1, c).set(x0 + 3, 0, 1, c);
    }
    return g;
  },
};
const KINDS = Object.keys(SECTION);
function sectionGeo(kind, v) {
  return vgeo(`sec_${kind}_${v}`, () => SECTION[kind](v), { scale: 0.05, maxSamples: 60 });
}

// Simplified products for merged (backdrop) shelves at 0.1 scale.
export function productsRow(g, x0, x1, y, z, kind, seed = 0) {
  for (let x = x0; x <= x1; ) {
    const k = kind === 'mixed' ? KINDS[Math.floor(hash3(x, y, seed) * KINDS.length)] : kind;
    const c = pc(Math.floor(hash3(x, y + 3, seed) * 9));
    let w = 2;
    if (k === 'cereal') { w = 2; productBox(g, x, y, z - 1, 2, 3, 2, c); }
    else if (k === 'drinks') { w = 1; g.box(x, y, z, x, y + 2, z, c).set(x, y + 3, z, 0xffffff); }
    else if (k === 'chocolate') { w = 2; g.box(x, y, z - 1, x + 1, y, z, [0xff4fa3, 0x1d9bf0, PAL.gold][Math.floor(hash3(x, 1, seed) * 3)]).box(x, y + 1, z - 1, x + 1, y + 1, z, [0xff4fa3, 0x1d9bf0, PAL.gold][Math.floor(hash3(x, 2, seed) * 3)]); }
    else if (k === 'produce') { w = 3; g.box(x, y, z - 1, x + 2, y, z, PAL.woodL).box(x, y + 1, z - 1, x + 2, y + 1, z, [PAL.red, PAL.orange, PAL.yellow, PAL.green][Math.floor(hash3(x, 5, seed) * 4)]); }
    else { w = 2; g.box(x, y, z, x + 1, y + 2, z, c).set(x, y + 3, z, shade(c, -0.3)); }
    if (hash3(x, y, seed + 7) < 0.12) { x += 1; continue; }
    x += w + (hash3(x, y, seed + 1) < 0.3 ? 1 : 0);
  }
}

/** Shelf frame grid (0.1 scale). length in voxels along x, faces +z. */
export function shelfFrame(g, x0, len, z0 = 0, o = {}) {
  const x1 = x0 + len - 1, H = o.h ?? 20, D = o.d ?? 5;
  const frame = o.frame ?? 0xe8ecf2, back = o.back ?? 0xd0d8e4, edge = o.edge ?? PAL.red;
  g.box(x0, 0, z0 - D + 1, x1, 1, z0, 0x8a92a4);
  g.box(x0, 2, z0 - D + 1, x1, H, z0 - D + 1, back);
  for (const x of [x0, x1]) g.box(x, 0, z0 - D + 1, x, H, z0, frame);
  const levels = o.levels ?? [2, 7, 12, 17];
  for (const y of levels) {
    g.box(x0, y, z0 - D + 2, x1, y, z0, frame);
    g.box(x0 + 1, y, z0 + 1, x1 - 1, y, z0 + 1, edge);
    for (let x = x0 + 3; x < x1 - 1; x += 6) g.set(x, y, z0 + 2, 0xffffff).set(x + 1, y, z0 + 2, PAL.yellow);
  }
  g.box(x0, H + 1, z0 - D + 1, x1, H + 3, z0 - D + 1, o.top ?? PAL.blue);
  return levels;
}

/** Whole shelf as one grid (for backdrops). */
export function shelfGrid(len = 40, kind = 'mixed', seed = 1, o = {}) {
  const g = new VoxGrid();
  const x0 = -Math.floor(len / 2);
  const levels = shelfFrame(g, x0, len, 0, o);
  for (const y of levels) productsRow(g, x0 + 1, x0 + len - 3, y + 1, -1, kind, seed + y);
  if (o.label) text(g, o.label, 0, (o.h ?? 20) + 1, 1, '+z', 0xffffff, { center: true });
  return g;
}

/**
 * Store shelf. { root, items } - items are product groups that can be knocked off.
 */
export function makeShelf({ length = 4, kind = 'mixed' } = {}) {
  const len = Math.max(10, Math.round(length * 10));
  const frameKind = kind;
  const tops = { mixed: PAL.blue, chocolate: 0xff4fa3, cereal: PAL.orange, drinks: PAL.cyan, produce: PAL.green, snacks: PAL.yellow };
  const frame = vmesh(`shelfFrame_${len}_${frameKind}`, () => {
    const g = new VoxGrid();
    shelfFrame(g, -Math.floor(len / 2), len, 2, { top: tops[kind] ?? PAL.blue });
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0] });
  const root = new THREE.Group();
  root.name = 'shelf:' + kind;
  root.add(frame);
  const items = [];
  const levels = [2, 7, 12, 17];
  const R = mulberry32(len * 31 + kind.length);
  for (const y of levels) {
    for (let x = -len / 2 + 0.3; x < len / 2 - 0.5; x += 4.6) {
      const k = kind === 'mixed' ? KINDS[Math.floor(R() * KINDS.length)] : (SECTION[kind] ? kind : 'snacks');
      const v = Math.floor(R() * 6);
      const m = makeMesh(sectionGeo(k, v));
      m.castShadow = false;
      const it = new THREE.Group();
      it.add(m);
      it.position.set((x + 2.3) * 0.1, (y + 1) * 0.1, 0.05);
      it.name = 'product';
      root.add(it);
      items.push(it);
    }
  }
  return { root, items };
}

// ---------------------------------------------------------------------------
export function makeCart(o = {}) {
  const full = !!o.full;
  const body = vmesh('cart' + (full ? 'Full' : ''), () => cartGrid({ full }), { scale: 0.1, pivot: [0, 0, 0] });
  const wheelGeo = vgeo('cartWheel', () => {
    const g = new VoxGrid();
    g.box(-1, -1, 0, 0, 0, 0, PAL.ink);
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0.5] });
  const root = new THREE.Group();
  root.name = 'cart';
  root.add(body);
  const wheels = [];
  for (const x of [-4, 5]) for (const z of [-2, 2]) {
    const w = new THREE.Group();
    w.position.set((x + 0.5) * 0.1, 0.1, (z + 0.5) * 0.1);
    w.add(makeMesh(wheelGeo));
    root.add(w);
    wheels.push(w);
  }
  return { root, wheels };
}

export function checkoutGrid(n = 1) {
  const g = new VoxGrid();
  // counter 24 long along x
  g.box(-12, 0, -4, 11, 8, 3, (x, y) => (y === 8 ? 0x9aa2b4 : y < 2 ? PAL.metalD : ((x + 12) % 6 === 0 ? 0xc8d0dc : 0xe4e8ee)));
  g.box(-11, 9, -3, 3, 9, 2, (x) => (x % 2 ? 0x2a2a34 : 0x1a1a22)); // conveyor
  g.box(-11, 9, 3, 3, 10, 3, PAL.metal).box(-11, 9, -4, 3, 10, -4, PAL.metal);
  // register
  g.box(5, 9, -3, 10, 12, 2, 0x3a3f4e);
  g.box(6, 13, -1, 9, 17, -1, 0x2a2e3a);
  g.box(6, 14, 0, 9, 16, 0, PAL.slime, true);
  text(g, '$', 7, 14, 1, '+z', 0x15301a, { center: true });
  for (let x = 5; x <= 10; x++) g.set(x, 13, 2, (x & 1) ? PAL.yellow : 0xffffff);
  g.box(5, 9, 3, 10, 10, 3, PAL.cash);
  // bagging area + bags
  g.box(-12, 9, -4, -10, 13, 3, null);
  // candy rack on the front
  g.box(-10, 1, 4, -2, 7, 5, 0xd0d8e4);
  for (let y = 2; y <= 6; y += 2) for (let x = -9; x <= -3; x += 2) g.set(x, y, 6, pc(x + y));
  // lane light pole
  g.box(11, 9, -4, 11, 22, -4, PAL.metal);
  g.box(9, 23, -5, 13, 28, -3, PAL.ink);
  text(g, String(n), 11, 24, -2, '+z', PAL.yellow, { center: true, glow: true });
  return g;
}
export function makeCheckout(n = 1) {
  const r = group(vmesh('checkout_' + n, () => checkoutGrid(n), { scale: 0.1 }));
  r.name = 'checkout';
  return r;
}

export function freezerGrid() {
  const g = new VoxGrid();
  g.box(-10, 0, -4, 9, 27, 3, (x, y) => (y < 2 ? PAL.metalD : 0xf2f6fa));
  g.box(-9, 2, -3, 8, 19, 3, null);
  g.box(-9, 2, -3, 8, 19, -3, 0x9fd8ff, true);
  for (const y of [2, 8, 14]) {
    g.box(-9, y, -2, 8, y, 2, 0xd0e8f8);
    for (let x = -8; x <= 7; x += 3) {
      const c = [0xff8ac0, 0xffe680, 0x8fe3ff, 0xffffff, 0xc8a0ff][Math.floor(hash3(x, y, 2) * 5)];
      g.box(x, y + 1, -1, x + 1, y + 2 + ((x + y) & 1), 1, c);
      g.set(x, y + 3 + ((x + y) & 1), 0, shade(c, -0.2));
    }
  }
  g.box(-10, 20, 4, 9, 27, 4, PAL.blue);
  text(g, 'ICE', 0, 21, 5, '+z', 0xffffff, { center: true, glow: true });
  g.box(-10, 20, 5, 9, 20, 5, 0xffffff);
  for (let x = -10; x <= 9; x += 10) g.box(x, 2, 4, x, 19, 4, 0xd8dee8);
  g.box(-1, 2, 4, 0, 19, 4, 0xd8dee8);
  g.box(-3, 9, 5, -3, 13, 5, PAL.metal).box(2, 9, 5, 2, 13, 5, PAL.metal);
  return g;
}
export function makeFreezer() {
  const body = vmesh('freezer', freezerGrid, { scale: 0.1 });
  const glass = glassBox(1.9, 1.8, 0.04, 0xd8f4ff, 0.28);
  glass.position.set(-0.05, 1.1, 0.38);
  const frost = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.25, 0.03), glowMat(0xeaffff, 0.35));
  frost.position.set(-0.05, 0.35, 0.4);
  const r = group(body, glass, frost);
  r.name = 'freezer';
  return r;
}

export function produceGrid() {
  const g = new VoxGrid();
  const fruits = [[PAL.red, 'apple'], [PAL.orange, 'orange'], [PAL.yellow, 'banana'], [0x7cd64a, 'lime'], [0x9a4ad0, 'grape']];
  g.box(-16, 0, -6, 15, 5, 5, PAL.wood);
  g.box(-16, 0, 5, 15, 5, 5, (x) => (x % 3 === 0 ? PAL.woodD : PAL.wood));
  for (let i = 0; i < 5; i++) {
    const x0 = -16 + i * 6 + (i > 0 ? 1 : 0);
    const [c] = fruits[i];
    // slanted crate
    for (let z = -5; z <= 4; z++) {
      const y = 6 + Math.round((-z + 5) * 0.6);
      g.box(x0, 6, z, x0 + 5, y, z, PAL.woodL);
      g.box(x0 + 1, y + 1, z, x0 + 4, y + 1, z, (x, yy, zz) => (hash3(x, yy, zz) < 0.25 ? shade(c, -0.25) : c));
      if (hash3(x0, z, 3) < 0.6) g.set(x0 + 2 + (z & 1), y + 2, z, c);
    }
    g.box(x0, 6, 5, x0 + 5, 7, 5, PAL.woodD);
    // chalkboard price
    g.box(x0 + 1, 8, 6, x0 + 4, 11, 6, 0x2a3a2a);
    g.box(x0 + 2, 9, 7, x0 + 3, 10, 7, 0xffffff);
  }
  // watermelons at the base
  for (const x of [-12, 0, 11]) g.ellipsoid(x, 2, 8, 2.5, 2, 2.5, (xx, y, z) => ((xx + z) % 2 ? PAL.greenD : 0x7cd64a));
  // awning
  for (let x = -17; x <= 16; x++) g.box(x, 18, -6, x, 18, 6, Math.floor((x + 17) / 3) % 2 ? PAL.green : 0xffffff);
  for (const x of [-17, 16]) g.box(x, 0, -6, x, 17, -6, PAL.woodD);
  return g;
}
export function makeProduceStand() {
  const r = group(vmesh('produce', produceGrid, { scale: 0.1 }));
  r.name = 'produceStand';
  return r;
}

export function aisleSignGrid(color = PAL.blue, label = '7') {
  const g = new VoxGrid();
  g.box(-15, 0, -1, 14, 7, 0, color);
  g.box(-15, 0, -1, 14, 0, 0, shade(color, -0.3)).box(-15, 7, -1, 14, 7, 0, shade(color, 0.3));
  g.box(-14, 1, 1, -10, 6, 1, 0xffffff);
  text(g, label, -12, 1, 2, '+z', shade(color, -0.2), { center: true });
  const names = ['SNACK', 'DRINK', 'CANDY', 'FRUIT', 'SALE!'];
  text(g, names[(label.charCodeAt(0) || 0) % names.length], 3, 1, 1, '+z', 0xffffff, { center: true, glow: true });
  for (const x of [-13, 12]) for (let y = 8; y <= 16; y++) g.set(x, y, 0, y % 2 ? PAL.metalD : PAL.metal);
  return g;
}
export function makeAisleSign(color = PAL.blue, label = '7') {
  const r = group(vmesh(`aisleSign_${color}_${label}`, () => aisleSignGrid(color, label), { scale: 0.1 }));
  r.name = 'aisleSign';
  return r;
}

export function makeCartCorral() {
  const rail = vmesh('cartCorral', () => {
    const g = new VoxGrid();
    for (const z of [-5, 5]) {
      g.box(-16, 0, z, 17, 0, z, PAL.metal);
      g.box(-16, 6, z, 17, 6, z, PAL.red);
      for (let x = -16; x <= 17; x += 5) g.box(x, 0, z, x, 6, z, PAL.metalD);
    }
    g.box(-14, 0, -5, -14, 0, 5, null);
    g.box(-16, 6, -5, -16, 6, 5, PAL.red).box(-16, 0, -5, -16, 6, -5, PAL.metalD).box(-16, 0, 5, -16, 6, 5, PAL.metalD);
    g.box(-16, 7, -1, -16, 12, 0, PAL.metal);
    g.box(-16, 13, -9, -16, 19, 8, PAL.blue);
    text(g, 'CARTS', -17, 14, 0, '-x', 0xffffff, { center: true });
    text(g, 'CARTS', -15, 14, 0, '+x', 0xffffff, { center: true });
    return g;
  }, { scale: 0.1 });
  const root = group(rail);
  for (const x of [-0.85, 0.05, 0.95]) {
    const c = makeCart();
    c.root.position.set(x, 0, 0);
    root.add(c.root);
  }
  root.name = 'cartCorral';
  return root;
}

export function martFrontGrid() {
  const g = new VoxGrid();
  const W = 60, H = 50;
  const stripes = stripesY([PAL.pink, PAL.pink, PAL.yellow, PAL.yellow, PAL.blue, PAL.blue, PAL.green, PAL.green], 1, 36);
  g.box(-W, 0, -6, W - 1, H, 0, (x, y, z) => {
    if (y < 3) return (x + y) & 1 ? PAL.red : PAL.redD;
    if (y >= 36 && y < 44) return stripes(x, y, z);
    if (y >= 44) return PAL.white;
    return (x + W) % 10 === 0 ? PAL.white2 : PAL.white;
  });
  g.box(-W - 1, H + 1, -7, W, H + 1, 1, PAL.pink);
  // windows with products
  for (const [x0, x1] of [[-56, -14], [14, 55]]) {
    g.box(x0 - 1, 5, 1, x1 + 1, 30, 1, PAL.white2);
    g.box(x0, 6, 1, x1, 29, 1, null);
    g.box(x0, 6, 0, x1, 29, 0, (x, y) => {
      const ry = (y - 6) % 6;
      if (ry === 0) return 0xd8e2ec;
      if (ry >= 4) return 0xdff6ff;
      return hash3(x >> 1, y >> 2, 5) < 0.15 ? 0xdff6ff : mixHex(pc(Math.floor(hash3(x >> 1, y >> 2, 3) * 9)), 0xffffff, 0.3);
    }, true);
    for (let x = x0 + 7; x < x1; x += 8) g.box(x, 6, 1, x, 29, 1, PAL.white2);
    // awning
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const c = Math.floor((x - x0) / 3) % 2 ? PAL.pink : 0xffffff;
      g.box(x, 32, 1, x, 33, 1, c).set(x, 31, 2, c).set(x, 30, 3, c).set(x, 29, 4, c);
    }
  }
  // doors
  g.box(-12, 0, 1, 11, 32, 1, PAL.red);
  g.box(-11, 0, 1, 10, 30, 1, null);
  g.box(-11, 0, 0, 10, 30, 0, (x) => (x === -1 || x === 0 ? PAL.metal : 0xcff4ff), true);
  // sign
  signZ(g, 'BEAST MART', 0, 37, 1, { scale: 1, sy: 1, board: 0xffffff, color: PAL.pink, pad: 1, frame: PAL.pink, depth: 2 });
  for (let x = -40; x <= 40; x += 4) g.set(x, 45, 1, PAL.yellow, true);
  return g;
}
export function makeMartFront() {
  const body = vmesh('martFront', martFrontGrid, { scale: 0.1 });
  const r = group(body);
  r.name = 'martFront';
  return r;
}

export { KINDS as SHELF_KINDS };
