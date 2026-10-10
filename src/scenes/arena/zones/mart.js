// BEAST MART (Season 1: FOOD SEASON): cut-away voxel grocery store with instanced
// product shelves that get knocked over by carts, freezers, produce, checkouts,
// hanging aisle signs, giant food, sliding doors, Juan / Cass / Stan, Cart Kong's
// boss gate, the Cart Corral and the hidden Golden Chocolate Bar.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh, cachedGeometry } from '../../../core/voxel.js';
import { fx, particles } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { rand, pick, shuffle, shade } from '../../../core/util.js';
import { speech, floatText } from '../../../ui/ui.js';
import { state } from '../../../game/state.js';
import { textPanel, pickProxy } from '../kit.js';
import { placeBossGate } from '../gates.js';
import { questMarker, questTalk } from '../quests.js';
import { Carts } from '../carts.js';

const _v = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const Z = 'mart';

// Store footprint
const SX0 = 29, SX1 = 57, SZ0 = 17.6, SZ1 = 45;

// ---------------------------------------------------------------------------
// Products (tiny voxel models, tinted per instance)

const PRODUCTS = {
  box: {
    w: 0.26, h: 0.42, d: 0.2,
    grid: () => {
      const g = new VoxGrid();
      g.box(-6, 0, -5, 6, 20, 4, 0xb4b4b4);
      g.box(-6, 8, 5, 6, 14, 5, 0xffffff);
      g.box(-3, 10, 6, 2, 12, 6, 0x505050);
      g.box(-6, 18, -5, 6, 20, 4, 0x8c8c8c);
      return g;
    },
  },
  can: {
    w: 0.18, h: 0.24, d: 0.18,
    grid: () => {
      const g = new VoxGrid();
      g.cylinder(0, 0, 0, 11, 4, 0xb4b4b4);
      g.paint((x, y) => (y >= 4 && y <= 7 ? 0xffffff : y === 11 || y === 0 ? 0xd8d8d8 : undefined));
      return g;
    },
  },
  bottle: {
    w: 0.12, h: 0.42, d: 0.12,
    grid: () => {
      const g = new VoxGrid();
      g.cylinder(0, 0, 0, 13, 3, 0xb4b4b4);
      g.cylinder(0, 0, 14, 18, 1.5, 0xd0d0d0);
      g.box(-1, 19, -1, 1, 20, 1, 0x404040);
      g.paint((x, y, z, c) => (y >= 5 && y <= 9 && c === 0xb4b4b4 ? 0xffffff : undefined));
      return g;
    },
  },
  bag: {
    w: 0.28, h: 0.34, d: 0.14,
    grid: () => {
      const g = new VoxGrid();
      g.ellipsoid(0, 8, 0, 6.5, 8, 3, 0xb4b4b4);
      g.box(-6, 16, -1, 6, 17, 1, 0xe0e0e0);
      g.box(-6, 0, -1, 6, 1, 1, 0xe0e0e0);
      g.box(-3, 6, 3, 3, 10, 3, 0xffffff);
      g.carve((x, y) => y < 0);
      return g;
    },
  },
  bar: {
    w: 0.32, h: 0.22, d: 0.14,
    grid: () => {
      const g = new VoxGrid();
      for (let k = 0; k < 3; k++) {
        const y = k * 4;
        g.box(-8, y, -3, 7, y + 2, 3, 0xb4b4b4);
        g.box(-8, y, 4, 7, y + 2, 4, 0xffffff);
        g.box(-8, y, -3, -8, y + 2, 3, 0x6a3a22);
      }
      return g;
    },
  },
};
for (const [k, p] of Object.entries(PRODUCTS)) p.geo = () => cachedGeometry('arena:prod:' + k, p.grid, { scale: 0.02 });

const KINDS = {
  snacks: { types: ['bag', 'box'], colors: [0xff8a2a, 0xffd23f, 0xe8343c, 0x29b6f6, 0x5fdc4a], sign: 'SNACKS', signColor: 0xff8a2a },
  drinks: { types: ['bottle', 'can'], colors: [0xe8343c, 0x29b6f6, 0x5fdc4a, 0xff8a2a, 0xb05cff], sign: 'DRINKS', signColor: 0x29b6f6 },
  candy: { types: ['box', 'bag'], colors: [0xff4fa3, 0xffd23f, 0xb05cff, 0x29b6f6, 0xffffff], sign: 'CANDY', signColor: 0xff4fa3 },
  chocolate: { types: ['bar'], colors: [0x1d9bf0, 0xff4fa3, 0xffd23f, 0xff7b29, 0x7cff3a], sign: 'FEASTABLES', signColor: 0x1d9bf0 },
  cereal: { types: ['box'], colors: [0xffd23f, 0xe8343c, 0x5fdc4a, 0x29b6f6, 0xff8a2a], sign: 'CEREAL', signColor: 0xffd23f },
  cans: { types: ['can'], colors: [0xe8343c, 0x5fdc4a, 0xffd23f, 0xc8ccd8], sign: 'CANNED', signColor: 0x5fdc4a },
};

// ---------------------------------------------------------------------------
// Shelves

class Shelf {
  constructor(sys, x, z, L, kind) {
    this.sys = sys;
    this.A = sys.A;
    this.x = x;
    this.z = z;
    this.L = L;
    this.kind = kind;
    this.slots = [];
    this.dead = 0;
    this.restockT = 0;
    this.shakeT = 0;
    const K = KINDS[kind];
    // stepped display shelving: lower levels stick out further so the top-down camera sees every level
    const LV = [{ y: 0.2, edge: 0.8 }, { y: 0.7, edge: 0.6 }, { y: 1.2, edge: 0.4 }];
    let n = 0;
    for (const face of [1, -1])
      for (let li = 0; li < 3; li++) {
        let cx = -L / 2 + 0.18;
        const ti = (li + (face > 0 ? 0 : 1)) % K.types.length;
        while (true) {
          const type = K.types[(ti + Math.floor(n / 6)) % K.types.length];
          const P = PRODUCTS[type];
          if (cx + P.w > L / 2 - 0.12) break;
          const col = K.colors[Math.floor((n * 7 + li * 3 + (face > 0 ? 0 : 5)) / 3) % K.colors.length];
          this.slots.push({ type, x: x + cx + P.w / 2, y: LV[li].y, z: z + face * (LV[li].edge - P.d / 2 - 0.04), face, color: col, alive: true, pop: 1, idx: -1, li });
          cx += P.w + 0.04;
          n++;
        }
      }
    // frame
    const geo = cachedGeometry(`arena:shelf2:${L}:${kind}`, () => {
      const g = new VoxGrid();
      const W = Math.round(L * 10);
      const x0 = -Math.floor(W / 2), x1 = x0 + W - 1;
      const metal = 0xe8ecf2, dark = 0x5d6476, cap = K.signColor, tag = 0xffd23f;
      g.box(x0, 0, -8, x1, 0, 7, dark);
      g.box(x0, 1, -8, x1, 1, 7, metal);
      g.box(x0, 6, -6, x1, 6, 5, metal);
      g.box(x0, 11, -4, x1, 11, 3, metal);
      g.box(x0, 1, -1, x1, 15, 0, 0xc8ccd8);
      g.box(x0, 16, -2, x1, 16, 1, cap);
      for (const [y, e] of [[1, 7], [6, 5], [11, 3]]) {
        g.box(x0, y, e + 1, x1, y, e + 1, tag);
        g.box(x0, y, -e - 2, x1, y, -e - 2, tag);
        for (let xx = x0 + 3; xx < x1; xx += 6) {
          g.set(xx, y, e + 2, 0xffffff);
          g.set(xx, y, -e - 3, 0xffffff);
        }
      }
      for (const xx of [x0, x1]) {
        g.box(xx, 0, -8, xx, 5, 7, dark);
        g.box(xx, 6, -6, xx, 10, 5, dark);
        g.box(xx, 11, -4, xx, 16, 3, dark);
      }
      return g;
    }, { scale: 0.1, pivot: [0, 0, 0] });
    this.mesh = makeMesh(geo);
    this.mesh.position.set(x, 0, z);
    this.A.scene.add(this.mesh);
    this.collider = this.A.world.box(x - L / 2 - 0.05, z - 0.92, x + L / 2 + 0.05, z + 0.92, { tag: 'shelf', data: this, bounce: 0.35 });
  }

  knock(px, pz, power) {
    const face = pz > this.z ? 1 : -1;
    const reach = 0.6 + power * 0.12;
    const max = 3 + Math.round(power * 1.3);
    let n = 0;
    const cands = this.slots.filter((s) => s.alive && s.face === face && Math.abs(s.x - px) < reach && !s.golden);
    shuffle(cands);
    for (const s of cands) {
      if (n >= max) break;
      s.alive = false;
      this.dead++;
      this.sys.setSlot(s, 0);
      const P = PRODUCTS[s.type];
      const out = face * rand(2, 4.5) * (0.5 + power * 0.1);
      particles.spawn('cube', {
        x: s.x, y: s.y + P.h / 2, z: s.z,
        vx: rand(-1.5, 1.5) + (s.x - px) * 1.5, vy: rand(2.5, 6), vz: out,
        rvx: rand(-10, 10), rvy: rand(-10, 10), rvz: rand(-10, 10),
        sx: P.w, sy: P.h, sz: P.d, life: rand(2.2, 3.2), grav: -16, drag: 0.3, ground: 0, bounce: 0.45, color: s.color, shrinkStart: 0.85,
      });
      n++;
    }
    if (n) {
      fx.groceries(_v.set(px, 1, pz + face * 0.3), { count: Math.min(12, 2 + n), speed: 4 + power * 0.4, ground: 0 });
      audio.play('crunch', { pitch: rand(0.9, 1.2) });
      audio.play('pop', { pitch: 0.7 });
      this.shakeT = 0.45;
      this.restockT = rand(9, 13);
      this.sys.onKnock(this, n);
    }
  }

  update(dt) {
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) / 0.45;
      this.mesh.position.x = this.x + Math.sin(this.shakeT * 70) * 0.06 * k;
      this.mesh.rotation.z = Math.sin(this.shakeT * 55) * 0.02 * k;
    }
    if (this.dead > 0) {
      this.restockT -= dt;
      if (this.restockT <= 0) {
        this.dead = 0;
        for (const s of this.slots) if (!s.alive) {
          s.alive = true;
          s.pop = 0;
        }
        audio.play('spawn', { vol: 0.4 });
        fx.sparkle(_v.set(this.x, 1, this.z), { count: 12, color: 0xffffff, radius: this.L / 2 });
        this.sys.onRestock(this);
      }
    }
    for (const s of this.slots) {
      if (s.alive && s.pop < 1) {
        s.pop = Math.min(1, s.pop + dt * 3);
        this.sys.setSlot(s, s.pop < 1 ? s.pop * (1 + Math.sin(s.pop * Math.PI) * 0.4) : 1);
      }
    }
  }
}

class ShelfSystem {
  constructor(A) {
    this.A = A;
    this.shelves = [];
    this.meshes = {};
  }
  add(x, z, L, kind) {
    const s = new Shelf(this, x, z, L, kind);
    this.shelves.push(s);
    return s;
  }
  /** Build instanced product meshes after all shelves exist. */
  finalize() {
    const counts = {};
    for (const sh of this.shelves) for (const s of sh.slots) counts[s.type] = (counts[s.type] ?? 0) + 1;
    for (const [type, n] of Object.entries(counts)) {
      const im = new THREE.InstancedMesh(PRODUCTS[type].geo(), Mats.solid, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = false;
      im.receiveShadow = true;
      this.meshes[type] = { im, next: 0 };
      this.A.scene.add(im);
    }
    for (const sh of this.shelves)
      for (const s of sh.slots) {
        const M = this.meshes[s.type];
        s.idx = M.next++;
        s.rot = (Math.random() - 0.5) * 0.25;
        M.im.setColorAt(s.idx, _c.setHex(s.color));
        this.setSlot(s, 1, true);
      }
    for (const { im } of Object.values(this.meshes)) {
      im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }
  setSlot(s, scale, quiet) {
    const M = this.meshes[s.type];
    if (!M) return;
    const sc = Math.max(1e-4, scale);
    _q.setFromAxisAngle(_p.set(0, 1, 0), (s.face > 0 ? 0 : Math.PI) + s.rot);
    _m4.compose(_p.set(s.x, s.y, s.z), _q, _s.set(sc, sc, sc));
    M.im.setMatrixAt(s.idx, _m4);
    M.im.instanceMatrix.needsUpdate = true;
  }
  update(dt) {
    for (const s of this.shelves) s.update(dt);
  }
  onKnock(shelf, n) {
    this.A.martKnock?.(shelf, n);
  }
  onRestock(shelf) {
    this.A.martRestock?.(shelf);
  }
}

// ---------------------------------------------------------------------------

export function buildMart(A) {
  const T = A.terrain;
  // ground: parking lot + store floor
  T.rect(22, 15, 58, 56, 'asphalt', { onlyLand: true });
  T.rect(SX0, SZ0, SX1, SZ1, 'tile');
  T.rect(SX0 + 0.6, 39, SX1 - 0.6, SZ1 - 0.6, 'tilePink');
  for (let x = 36; x < 57; x += 2.6) T.rect(x, 47, x + 0.25, 52, 'lineW', { onlyLand: true });
  for (let z = 22; z < 44; z += 2.6) T.rect(23, z, 26, z + 0.25, 'lineW');
  T.rect(22, 28, SX0, 33, 'plazaPink');

  walls(A);
  const sys = (A.martShelves = new ShelfSystem(A));
  // aisles: rows of shelves running east-west (two segments per row)
  const rows = [[23.5, ['drinks', 'cans']], [28, ['snacks', 'cereal']], [32.5, ['candy', 'snacks']], [37, ['chocolate', 'drinks']]];
  for (const [z, kinds] of rows) {
    sys.add(37, z, 7.4, kinds[0]);
    sys.add(45.6, z, 7.4, kinds[1]);
  }
  sys.finalize();
  A.onUpdate((dt) => sys.update(dt), 40, 31, 34);
  goldenBar(A, sys.shelves[6]);
  // hanging aisle signs between rows
  const aisles = [[25.75, 'DRINKS', 0x29b6f6, 'SNACKS', 0xff8a2a], [30.25, 'CEREAL', 0xffd23f, 'CANDY', 0xff4fa3], [34.75, 'SWEETS', 0xff4fa3, 'FEASTABLES', 0x1d9bf0]];
  for (const [z, l1, c1, l2, c2] of aisles) {
    aisleSign(A, 37, z, l1, c1);
    aisleSign(A, 45.6, z, l2, c2);
  }
  // freezers along the back wall
  for (let k = 0; k < 6; k++) A.put('makeFreezer', [], { x: 31.6 + k * 2.5, z: SZ0 + 1.65, zone: Z, fit: { w: 2.4, clamp: 1.3 }, tag: 'wall' });
  const front = A.put('makeMartFront', [], { x: 43, z: SZ0 + 0.55, zone: Z, collide: false, fit: { w: 12, clamp: 1.3 } });
  // produce on the east side
  A.put('makeProduceStand', [], { x: 53.2, z: 22.4, zone: Z, fit: { w: 3, clamp: 1.3 }, tag: 'shelf' });
  A.put('makeProduceStand', [], { x: 53.2, z: 27.2, zone: Z, fit: { w: 3, clamp: 1.3 }, tag: 'shelf' });
  A.put('makeCrate', [], { x: 55.5, z: 31.5, zone: Z, collide: { r: 0.42 }, fit: { h: 0.8, clamp: 1.6 } });
  A.put('makeCrate', [], { x: 54.5, z: 32, zone: Z, collide: { r: 0.42 }, fit: { h: 0.8, clamp: 1.6 } });
  // checkouts
  for (const x of [35, 40, 45]) A.put('makeCheckout', [1], { x, z: 40.6, zone: Z, long: 'z', fit: { max: 2.9, clamp: 1.35 }, tag: 'wall' });
  for (const x of [35, 45]) {
    const s = textPanel([{ text: 'LANE CLOSED', size: 0.13, color: '#ffffff' }], { w: 1.2, h: 0.28, bg: '#b8282f' });
    s.position.set(x + 0.55, 3.15, 39.3);
    A.scene.add(s);
  }
  // giant food on top of the back wall
  const foods = [['burger', 31.5], ['donut', 36.5], ['soda', 49.5], ['chocoBar', 52.5], ['cake', 55]];
  for (const [k, x] of foods) {
    const f = A.put('makeFood', [k], { x, z: SZ0 + 0.1, y: 3.55, zone: Z, collide: false, fit: { h: 2, clamp: 1.6 }, scale: k === 'soda' || k === 'chocoBar' || k === 'cake' ? 0.75 : 1.2 });
    f.root.rotation.y = rand(-0.3, 0.3);
  }
  const fries = A.put('makeFood', ['fries'], { x: 26.5, z: 34.8, zone: Z, collide: { r: 0.8 }, fit: { h: 2, clamp: 1.6 }, scale: 1.9 });
  A.put('makeFood', ['watermelon'], { x: 56, z: 47.6, zone: Z, collide: { r: 0.9 }, fit: { h: 1.4, clamp: 1.6 } });
  A.put('makeFood', ['pizza'], { x: 24.4, z: 50.5, zone: Z, collide: { r: 0.9 }, fit: { h: 1.2, clamp: 1.6 } });
  // store sign + banners
  if (!front.real) {
    const sign = textPanel([{ text: 'BEAST MART', size: 0.9, color: '#ffffff' }], { w: 9, h: 1.3, bg: '#ff4fa3', border: '#ffd23f' });
    sign.position.set(43, 3.25, SZ0 + 0.66);
    A.scene.add(sign);
  }
  for (const [x, z] of [[23.6, 17.5], [23.6, 44.5], [36.5, 55], [50, 55]]) foodBanner(A, x, z);
  for (const x of [31.5, 54.5]) {
    const b = textPanel([{ text: 'FOOD', size: 0.32, color: '#ffd23f' }, { text: 'SEASON', size: 0.24, color: '#ffffff' }, { text: 'S1', size: 0.3, color: '#1d9bf0' }], { w: 1.3, h: 1.5, bg: '#ff4fa3', border: '#0d1029' });
    b.position.set(x, 2.25, SZ0 + 0.66);
    A.scene.add(b);
  }
  // ceiling light bars
  const lightGeo = new THREE.BoxGeometry(6.5, 0.08, 0.28);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff8e0 });
  for (const z of [25.75, 30.25, 34.75]) for (const x of [37, 45.6]) {
    const l = new THREE.Mesh(lightGeo, lightMat);
    l.position.set(x, 3.6, z);
    l.castShadow = false;
    A.addStatic(l, Z);
  }
  // sliding doors (west entrance)
  slidingDoors(A, SX0 + 0.3, 30.5);
  wetFloor(A, 50.5, 20.8);

  // cart corral + carts
  const corral = A.put('makeCartCorral', [], { x: 33, z: 50.6, zone: Z, collide: false, long: 'z', longRot: -Math.PI / 2, fit: { max: 3, clamp: 1.35 } });
  // remove decorative carts parked inside the real corral model (returned carts park there)
  const deco = [];
  corral.root.traverse((o) => { if (o.name === 'cart' && o !== corral.root) deco.push(o); });
  deco.forEach((o) => o.parent.remove(o));
  const kb = A.bbox(corral.root);
  A.world.box(kb.min.x - 0.05, kb.min.z, kb.min.x + 0.12, kb.max.z, { bounce: 0.2 });
  A.world.box(kb.max.x - 0.12, kb.min.z, kb.max.x + 0.05, kb.max.z, { bounce: 0.2 });
  A.world.box(kb.min.x, kb.min.z - 0.05, kb.max.x, kb.min.z + 0.12, { bounce: 0.2 });
  const corralRect = [kb.min.x + 0.12, kb.min.z + 0.15, kb.max.x - 0.12, kb.max.z - 0.25];
  const cs = textPanel([{ text: 'CART RETURN', size: 0.2, color: '#ffffff', icon: 'play' }], { w: 1.9, h: 0.38, bg: '#29b6f6' });
  cs.position.set(33, kb.max.y + 0.35, kb.min.z + 0.1);
  A.scene.add(cs);
  const spawns = [[25, 37, 0.3], [24.8, 25, -0.2], [27, 47.5, 1.2], [42, 50, 0], [48.5, 51, 0.4], [31.5, 26, 1.6], [48, 42.5, -1.4], [52.5, 35, 0.2]];
  const carts = (A.carts = new Carts(A, { corral: corralRect, spawns }));
  for (const [x, z, a] of spawns.slice(0, 7)) carts.add(x, z, a);
  A.onUpdate((dt) => carts.update(dt), 40, 35, 40);
  A.poi({ x: 33, z: 50.6, color: '#29b6f6', size: 2 });

  // Cart Kong boss gate (north-west of the lot) + cart pile
  placeBossGate(A, 'cartKong', 25.6, 20.6, Z);
  cartPile(A, 23.4, 17.4);

  // NPCs
  A.npc('juan', {
    pos: [31.4, 35.2], facing: 1.2, wander: 1.4, react: 'dance',
    marker: () => questMarker('juan'),
    lines: ['FOOD SEASON, baby!', 'Have you tried racing the carts?', 'Cart Kong is NOT a real gorilla. I think.', 'Smash a cart, win a prize. Probably.'],
    greet: ['¡Hola {name}!', 'Welcome to Beast Mart!'],
    onTalk: (n) => questTalk(A, n, 'juan', {
      hello: async () => {
        n.chibi.play('dance', { dur: 1.4, then: 'idle' });
        n.chibi.expr('happy', 'grin', 1.4);
        audio.play('magic', { vol: 0.5 });
        fx.sparkle(_v.set(n.pos.x, 1.6, n.pos.z), { count: 10, colors: [0x1f9e4a, 0xffd23f, 0xffffff] });
        await new Promise((r) => setTimeout(r, 1100));
      },
      intro: {
        juan1: "Welcome to Beast Mart, amigo! It's *FOOD SEASON*. Fight a battle here and feel the energy!",
        juan2: 'These carts are WILD. Push them hard into a wall and... *crunch*. Smash some for science. And snacks.',
        juan3: '*Cart Kong* guards the checkout. A monster made of carts! Beat him and the Feast Vial is yours.',
      },
      done: {
        juan1: 'You felt it, right? The FOOD SEASON energy! Here, take some Calories.',
        juan2: 'So much crunch! Stan is going to cry. Great job!',
        juan3: 'You beat Cart Kong?! Checkout champion! Take this Feast Vial!',
      },
      progress: (st) => {
        if (st.quest.id === 'juan2') return `Carts smashed: *${st.prog}/${st.need}*. Push one REALLY fast into a wall!`;
        if (st.quest.boss) return 'Cart Kong is waiting behind the skull gate in the parking lot!';
        return `${st.text} (${st.prog}/${st.need}). Ranked battles count when your arena is Beast Mart... or try the Cart Kong gate!`;
      },
      finished: ['Best customer EVER.', 'Want to dance? We always dance.', 'Try the Feastables aisle. Trust me.'],
      allDone: 'You did EVERYTHING. Beast Mart owes you one, {name}!',
      decline: 'No problem! More carts for me.',
    }),
  });
  const stan = (A.martStan = A.npc('stocker', {
    pos: [41.2, 30.25], facing: 0, wander: 2.8, speed: 1.2, react: 'wave',
    lines: ['I JUST restocked that shelf.', 'Aisle 4: chocolate. Aisle 5: more chocolate.', 'Who keeps leaving carts everywhere?', 'Please do not lick the produce.'],
    greet: ['Need help finding something?'],
    onTalk: async (n) => {
      await A.line(n, pick([
        "If a cart hits my shelf one more time... I'll just restock it. Again. It's fine. I'm fine.",
        "Rumor says there's a *golden* chocolate bar somewhere in the Feastables aisle. I've never seen it. I stock it every day.",
        'Return a cart to the *Cart Return* outside and you get good-citizen points!',
      ]));
    },
  }));
  A.npc('cashier', {
    pos: [41.25, 41.6], facing: -Math.PI / 2, react: 'wave',
    lines: ['Paper or plastic?', 'Next in line!', 'Beep. Beep. Beep.', 'Did you find everything okay?'],
    greet: ['Welcome to Beast Mart!'],
    onTalk: async (n) => {
      await A.line(n, pick([
        'Paper or plastic? Just kidding, everything here is made of voxels.',
        'Did you find everything okay? Including the GOLDEN bar? ...I have said too much.',
        "Please don't race the carts. Okay, maybe ONE race.",
        'Your total is... zero! Jimmy is paying for everyone today.',
      ]));
      audio.play('chaching');
    },
  });
  // reactions
  let lastReact = 0;
  A.martKnock = (shelf, n) => {
    const now = performance.now();
    if (now - lastReact < 2500) return;
    lastReact = now;
    const d = stan.pos.distanceTo(_v.set(shelf.x, 0, shelf.z));
    if (d < 12 && !stan.busy) {
      stan.chibi.play('facepalm', { dur: 1.2, then: 'idle' });
      stan.say(pick(['MY SHELF!', 'Not again...', 'I just stacked those!', 'Clean up on aisle... everywhere.']), 1.8);
    }
  };
  A.martRestock = (shelf) => {
    const d = stan.pos.distanceTo(_v.set(shelf.x, 0, shelf.z));
    if (d < 14 && !stan.busy) {
      stan.chibi.play('present', { dur: 0.9, then: 'idle' });
      if (Math.random() < 0.5) stan.say(pick(['Restocked!', 'Good as new.', 'Please. Be gentle.']), 1.4);
    }
  };
}

// ---------------------------------------------------------------------------

function walls(A) {
  const pink = new THREE.MeshLambertMaterial({ color: 0xff6fb0 });
  const white = new THREE.MeshLambertMaterial({ color: 0xf6f2ea });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.45 });
  const wall = (x0, z0, x1, z1, h, mat, opts = {}) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, h, z1 - z0), mat);
    m.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
    m.castShadow = true;
    m.receiveShadow = true;
    A.addStatic(m, Z);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.06, 0.14, z1 - z0 + 0.06), white);
    trim.position.set((x0 + x1) / 2, h + 0.07, (z0 + z1) / 2);
    A.addStatic(trim, Z);
    if (opts.collide !== false) A.world.box(x0, z0, x1, z1, { tag: 'wall', bounce: 0.45 });
  };
  // back wall (tall), with stripes
  wall(SX0, SZ0 - 0.6, SX1, SZ0, 3.4, pink);
  for (let x = SX0 + 1; x < SX1; x += 2) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.38, 0.04), white);
    s.position.set(x, 1.7, SZ0 + 0.01);
    A.addStatic(s, Z);
  }
  // cut-away side & front walls (low)
  wall(SX0 - 0.6, SZ0 - 0.6, SX0, 28.6, 0.9, pink);
  wall(SX0 - 0.6, 32.4, SX0, SZ1, 0.9, pink);
  wall(SX1, SZ0 - 0.6, SX1 + 0.6, SZ1, 0.9, pink);
  wall(SX0, SZ1 - 0.6, 46, SZ1, 0.9, pink);
  wall(50, SZ1 - 0.6, SX1, SZ1, 0.9, pink);
  // corner pillars
  for (const [x, z] of [[SX0 - 0.3, SZ0 - 0.3], [SX1 + 0.3, SZ0 - 0.3], [SX0 - 0.3, SZ1 - 0.3], [SX1 + 0.3, SZ1 - 0.3], [SX0 - 0.3, 28.3], [SX0 - 0.3, 32.7], [46, SZ1 - 0.3], [50, SZ1 - 0.3]]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), white);
    p.position.set(x, 0.8, z);
    p.castShadow = true;
    A.addStatic(p, Z);
  }
  // glass top on the low front wall for a shop-window feel
  for (const [x0, x1] of [[SX0, 46], [50, SX1]]) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.6, 0.06), glass);
    g.position.set((x0 + x1) / 2, 1.3, SZ1 - 0.3);
    g.userData.noBake = true;
    A.scene.add(g);
  }
  const ex = textPanel([{ text: 'EXIT', size: 0.22, color: '#7cff6b' }], { w: 0.9, h: 0.34, bg: '#15121f' });
  ex.position.set(48, 1.9, SZ1 - 0.25);
  A.scene.add(ex);
}

function aisleSign(A, x, z, label, color) {
  const p = A.put('makeAisleSign', [color], { x, z, y: 2.55, zone: Z, collide: false, fit: { w: 2, clamp: 1.4 } });
  const t = textPanel([{ text: label, size: 0.22, color: '#ffffff' }], { w: 1.8, h: 0.42, bg: '#' + color.toString(16).padStart(6, '0'), border: '#0d1029' });
  t.position.set(x, 2.87, z + 0.08);
  A.scene.add(t);
}

function foodBanner(A, x, z) {
  const geo = cachedGeometry('arena:pole', () => new VoxGrid().box(0, 0, 0, 0, 40, 0, 0xc8ccd8).box(-1, 41, -1, 1, 42, 1, 0xffd23f), { scale: 0.1 });
  const pole = makeMesh(geo);
  pole.position.set(x, 0, z);
  A.addStatic(pole, Z);
  A.world.circle(x, z, 0.15);
  const b = textPanel([{ text: 'FOOD', size: 0.3, color: '#ffd23f' }, { text: 'SEASON', size: 0.22, color: '#ffffff' }], { w: 1.1, h: 1.4, bg: '#ff4fa3', border: '#1d9bf0' });
  b.position.set(x + 0.6, 3.1, z);
  A.scene.add(b);
  let t = Math.random() * 6;
  A.onUpdate((dt) => {
    t += dt;
    b.rotation.y = Math.sin(t * 1.6) * 0.12;
  }, x, z, 26);
}

function slidingDoors(A, x, z) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x9ff2ff, transparent: true, opacity: 0.5 });
  const frame = new THREE.MeshLambertMaterial({ color: 0xf6f2ea });
  const doors = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.2, 1.9), mat);
    d.position.set(x, 1.1, z + s * 0.95);
    d.userData.noBake = true;
    A.scene.add(d);
    doors.push({ d, s });
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 4.6), frame);
  top.position.set(x, 2.38, z);
  A.addStatic(top, Z);
  const lbl = textPanel([{ text: 'OPEN 24/7', size: 0.16, color: '#ff4fa3' }], { w: 1.4, h: 0.3, bg: '#ffffff' });
  lbl.position.set(x - 0.6, 2.55, z);
  lbl.rotation.y = -Math.PI / 2;
  A.scene.add(lbl);
  let open = 0;
  A.onUpdate((dt) => {
    const p = A.player.pos;
    let near = Math.hypot(p.x - x, p.z - z) < 3.4;
    if (!near && A.carts) for (const c of A.carts.list) if (!c.broken && Math.hypot(c.x - x, c.z - z) < 3) near = true;
    const prev = open;
    open += ((near ? 1 : 0) - open) * Math.min(1, dt * 6);
    if (prev < 0.05 && open >= 0.05) audio.play('whoosh', { pitch: 1.6, vol: 0.4 });
    for (const { d, s } of doors) d.position.z = z + s * (0.95 + open * 1.7);
  }, x, z, 20);
}

function wetFloor(A, x, z) {
  const geo = cachedGeometry('arena:wetSign', () => {
    const g = new VoxGrid();
    for (let y = 0; y < 10; y++) {
      g.box(-3, y, Math.floor(y / 3) - 3, 3, y, Math.floor(y / 3) - 3, 0xffd23f);
      g.box(-3, y, 3 - Math.floor(y / 3), 3, y, 3 - Math.floor(y / 3), 0xffd23f);
    }
    g.box(-1, 5, 3, 1, 7, 3, 0x15121f);
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.position.set(x - 1.4, 0, z);
  A.addStatic(m, Z);
  A.world.circle(x - 1.4, z, 0.3);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 14), new THREE.MeshBasicMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.55, depthWrite: false }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(x, 0.03, z);
  puddle.scale.set(1.2, 0.8, 1);
  A.scene.add(puddle);
  let cool = 0, spin = 0;
  A.onUpdate((dt) => {
    cool -= dt;
    const pl = A.player;
    if (spin > 0) {
      spin -= dt;
      pl.facing += dt * 22;
      pl.root.rotation.y = pl.facing;
      if (spin <= 0) pl.chibi.expr('dizzy', 'wobble', 1.2);
    }
    if (cool > 0) return;
    if (Math.hypot(pl.pos.x - x, pl.pos.z - z) < 1.1 && pl.speed > 3.2) {
      cool = 2.5;
      spin = 0.6;
      pl.chibi.play('shocked');
      pl.chibi.boing(0.5);
      pl.vel.x *= 1.6;
      pl.vel.z *= 1.6;
      audio.play('whoosh', { pitch: 0.8 });
      audio.play('squeak', { pitch: 0.7 });
      fx.bubbles(_v.set(x, 0.1, z), { count: 10, radius: 0.6 });
      speech(pl.chibi, pick(['WHOAAA!', 'Wet floor!!', 'Slippery!']), 1.3);
    }
  }, x, z, 16);
}

function cartPile(A, x, z) {
  const geo = cachedGeometry('arena:cartPile', () => {
    const g = new VoxGrid();
    const wire = 0xc8ccd8, red = 0xe8343c;
    for (const [bx, by, bz] of [[0, 0, 0], [9, 0, 2], [4, 7, 1], [-6, 0, 3]]) {
      for (let xx = bx - 4; xx <= bx + 3; xx++)
        for (let yy = by + 1; yy <= by + 6; yy++)
          for (let zz = bz - 5; zz <= bz + 4; zz++) {
            const edge = xx === bx - 4 || xx === bx + 3 || zz === bz - 5 || zz === bz + 4 || yy === by + 1;
            if (edge && ((xx + zz + yy) % 2 === 0 || yy === by + 6)) g.set(xx, yy, zz, wire);
          }
      g.box(bx - 4, by + 6, bz - 6, bx + 3, by + 6, bz - 6, red);
    }
    return g;
  }, { scale: 0.1 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  m.rotation.y = 0.4;
  A.addStatic(m, Z);
  A.world.circle(x, z, 1);
}

function goldenBar(A, shelf) {
  if (!shelf) return;
  const found = !!state.p.secrets?.goldenBar;
  // pick a front-face slot on the middle level near the shelf centre
  const cands = shelf.slots.filter((s) => s.face === 1 && s.li === 1);
  const s = cands[Math.floor(cands.length * 0.62)];
  if (!s) return;
  if (found) return;
  s.golden = true;
  A.martShelves.setSlot(s, 0);
  const geo = cachedGeometry('arena:goldBar', () => {
    const g = new VoxGrid();
    g.box(-8, 0, -3, 7, 2, 3, 0xffd23f, true);
    g.box(-8, 0, 4, 7, 2, 4, 0xfff27a, true);
    g.box(-2, 1, 5, 1, 1, 5, 0xe0a21a, true);
    return g;
  }, { scale: 0.02 });
  const bar = makeMesh(geo);
  bar.position.set(s.x, s.y, s.z);
  A.scene.add(bar);
  let acc = 0;
  const sp = new THREE.Vector3(s.x, s.y + 0.1, s.z + 0.12);
  A.onUpdate((dt) => {
    if (!bar.parent) return true;
    acc += dt;
    if (acc > 1.4) {
      acc = 0;
      fx.sparkle(sp, { count: 1, color: 0xfff27a, speed: 0.4, size: 0.04, life: 0.8 });
    }
  }, s.x, s.z, 16);
  const proxy = pickProxy(0.3, 0.4);
  proxy.position.set(s.x, s.y - 0.1, s.z);
  A.scene.add(proxy);
  A.interact({
    id: 'goldenBar', pos: new THREE.Vector3(s.x, 0, shelf.z + 1.35), range: 1.0, label: 'GRAB', icon: 'star', color: 'yellow', hit: proxy, ringR: 0.5,
    enabled: () => !!bar.parent,
    act: () => {
      if (!bar.parent) return;
      A.scene.remove(bar);
      s.golden = false;
      A.martShelves.setSlot(s, 1);
      A.player.chibi.play('holdUp', { dur: 1.6, then: 'idle' });
      A.secret('goldenBar', sp);
    },
  });
}
