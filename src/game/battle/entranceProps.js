// Voxel set props for the battle ENTRANCES (entranceSets.js): a stage spotlight on a tripod
// (+ a dithered pixel light shaft), a paparazzi row, a helicopter with a rope, a stretch limo
// with an opening door, a skateboard, a cardboard box with eyes in the handle slot, a brick
// wall that breaks into chunks (and the door right next to it), a parade float, marching
// drums and a microphone. Everything is crafted voxel art (no plain boxes / discs); the
// geometry is baked once per prop and cached, materials are the shared toy / glow pair.
import * as THREE from 'three';
import { Mats, makeMesh } from '../../core/voxel.js';
import { G, rbox, cyl, blob, capsule, n3, shade } from '../../models/kit.js';
import { text, textW } from '../../models/props/common.js';

const GEO = new Map();
const bake = (key, fn, opts) => {
  if (!GEO.has(key)) GEO.set(key, fn().build({ jitter: 0.02, ...opts }));
  return GEO.get(key);
};
const mesh = (geo, mats = Mats.toyPair) => makeMesh(geo, mats);

// ---------------------------------------------------------------------------
// Stage spotlight: tripod + a can light whose head tilts (userData.head) and a lens.

export function spotRig() {
  const S = 0.045;
  const stand = bake('ent:spotStand', () => {
    const g = G();
    const leg = 0x2a2e3a, legL = 0x4a5262;
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.5;
      capsule(g, [0, 22, 0], [Math.cos(a) * 11, 0, Math.sin(a) * 11], 0.9, 0.7, (x, y) => (y < 2 ? 0x15151c : leg));
    }
    cyl(g, 'y', 0, 0, 20, 40, 1.2, 1.2, (x, y) => (y % 6 === 0 ? legL : leg));
    rbox(g, -2, 19, -2, 2, 23, 2, 1, legL);
    // yoke
    for (const z of [-6, 6]) rbox(g, -1, 40, z - (z > 0 ? 0 : 1), 1, 50, z + (z > 0 ? 1 : 0), 0, 0x3a3f4e);
    rbox(g, -1, 39, -7, 1, 41, 7, 0, 0x3a3f4e);
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const head = bake('ent:spotHead', () => {
    const g = G();
    // the can points along +x; pivot at the yoke bolts
    cyl(g, 'x', 0, 0, -9, 9, 5, 5, (x, y, z) => (x === -9 ? 0x22252e : x % 4 === 0 ? 0x2e3240 : 0x3a3f4e));
    cyl(g, 'x', 0, 0, 10, 11, 6, 6, 0x15151c, { hollow: 1.4 });
    cyl(g, 'x', 0, 0, 10, 10, 4.4, 4.4, (x, y, z) => (Math.abs(y) + Math.abs(z) < 3 ? 0xffffff : 0xfff2c8), { glow: true });
    // barn doors
    for (const s of [-1, 1]) for (let x = 11; x <= 15; x++) for (let z = -5; z <= 5; z++) g.set(x, s * (6 + ((x - 11) >> 1)), z, 0x22252e);
    // cooling fins + handle
    for (let y = -4; y <= 4; y += 2) for (let z = -3; z <= 3; z++) g.set(-10, y, z, 0x5a6272);
    rbox(g, -3, 6, -1, 3, 8, 1, 0, 0x15151c);
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const root = new THREE.Group();
  root.add(mesh(stand));
  const pivot = new THREE.Group();
  pivot.position.y = 45 * S;
  const hm = mesh(head);
  pivot.add(hm);
  root.add(pivot);
  root.userData.head = pivot;
  root.userData.lens = new THREE.Vector3(11 * S, 0, 0); // in the head's space
  return root;
}

// A pixel light shaft: a dithered trapezoid (narrow at the lamp, wide on the ground) drawn
// additively, aimed between two points and turned to face the camera round its own axis.
let shaftTex = null;
function shaftTexture() {
  if (shaftTex) return shaftTex;
  const W = 24, H = 48;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const k = y / (H - 1);
    const half = 1.5 + k * (W / 2 - 1.5);
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2);
      if (dx > half) continue;
      const edge = dx / half;
      let a = (0.95 - k * 0.55) * (edge > 0.75 ? 0.45 : 1);
      if (((x + y) & 1) && edge > 0.55) a *= 0.4; // dither the soft edge
      if (y % 6 === 3) a *= 0.7; // scan bands
      const i = (y * W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * Math.max(0, a));
    }
  }
  g.putImageData(img, 0, 0);
  shaftTex = new THREE.CanvasTexture(c);
  shaftTex.magFilter = shaftTex.minFilter = THREE.NearestFilter;
  shaftTex.generateMipmaps = false;
  shaftTex.colorSpace = THREE.SRGBColorSpace;
  return shaftTex;
}
const SHAFT_GEO = (() => { const g = new THREE.PlaneGeometry(1, 1); g.translate(0, -0.5, 0); return g; })();
export function lightShaft(color = 0xfff2c8, opacity = 0.5) {
  const m = new THREE.Mesh(SHAFT_GEO, new THREE.MeshBasicMaterial({ map: shaftTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false }));
  m.renderOrder = 6;
  m.castShadow = false;
  m.userData.disposeMat = true;
  return m;
}
const _a = new THREE.Vector3(), _n = new THREE.Vector3(), _x = new THREE.Vector3(), _mm = new THREE.Matrix4();
/** Stretch a light shaft from `from` (the lamp) to `to` (the floor), `width` wide at the floor. */
export function aimShaft(m, from, to, width, cam) {
  _a.subVectors(from, to);
  const len = _a.length();
  _a.normalize();
  cam.getWorldDirection(_n).negate();
  _n.addScaledVector(_a, -_n.dot(_a)).normalize();
  _x.crossVectors(_a, _n).normalize();
  _mm.makeBasis(_x, _a, _n);
  m.quaternion.setFromRotationMatrix(_mm);
  m.position.copy(from);
  m.scale.set(width, len, 1);
}

// ---------------------------------------------------------------------------
// Paparazzi row (faces +z): big-headed photographers holding cameras / phones up.

const SKINS = [0xf5cfae, 0xe0a882, 0xb87a52, 0x8a5a3a, 0xfadcc0];
const SHIRTS = [0x29b6f6, 0xff4fa3, 0xffd23f, 0x5fdc4a, 0xb05cff, 0xff8a2a, 0xeef2f8];
const HAIRS = [0x3a2a20, 0x15121f, 0xc89a5a, 0x7a3a1a, 0xe8d2a8];
export function paparazzi(n = 5, seed = 1) {
  const S = 0.05, STEP = 13;
  const flashes = [];
  const geo = bake('ent:pap:' + n + ':' + seed, () => {
    const g = G();
    for (let i = 0; i < n; i++) {
      const cx = Math.round((i - (n - 1) / 2) * STEP);
      const r = (k) => n3(i, k, seed);
      const tall = Math.round(r(1) * 3);
      const skin = SKINS[Math.floor(r(2) * SKINS.length)], shirt = SHIRTS[Math.floor(r(3) * SHIRTS.length)], hair = HAIRS[Math.floor(r(4) * HAIRS.length)];
      const pants = r(5) < 0.5 ? 0x2a3152 : 0x3a2a20;
      const y0 = 0;
      // legs + shoes
      for (const lx of [-2, 1]) { rbox(g, cx + lx, y0, -1, cx + lx + 1, y0 + 7 + tall, 1, 0, pants); rbox(g, cx + lx - 1, y0, -1, cx + lx + 1, y0, 2, 0, 0x15121f); }
      // body
      const by = y0 + 8 + tall;
      rbox(g, cx - 5, by, -2, cx + 4, by + 8, 2, 1, (x, y) => (y === by ? shade(shirt, -0.2) : shirt));
      // head
      const hy = by + 9;
      rbox(g, cx - 5, hy, -3, cx + 4, hy + 9, 3, 2, skin);
      rbox(g, cx - 5, hy + 7, -4, cx + 4, hy + 10, 3, 2, hair);
      const phone = r(6) < 0.35;
      // arms up to the face
      for (const s of [-1, 1]) capsule(g, [cx + s * 5, by + 7, 0], [cx + s * 3, hy + 3, 4], 1.1, 1, shirt);
      if (phone) {
        rbox(g, cx - 2, hy + 1, 5, cx + 1, hy + 7, 5, 0, 0x15151c);
        for (let y = hy + 2; y <= hy + 6; y++) for (let x = cx - 1; x <= cx; x++) g.set(x, y, 6, y === hy + 6 ? 0xffffff : 0x8fd8ff, true);
        flashes.push([cx * S, (hy + 7) * S, 6 * S]);
      } else {
        rbox(g, cx - 4, hy + 1, 4, cx + 3, hy + 6, 7, 1, 0x22252e);
        for (let y = hy + 2; y <= hy + 4; y++) for (let x = cx - 2; x <= cx; x++) g.set(x, y, 8, (x + y) & 1 ? 0x3a4a6a : 0x5a7aa0);
        g.set(cx - 1, hy + 4, 8, 0xffffff);
        // flash unit on top
        rbox(g, cx + 1, hy + 7, 5, cx + 3, hy + 9, 6, 0, 0xc8ccd8);
        g.set(cx + 2, hy + 8, 7, 0xffffff, true);
        flashes.push([(cx + 2) * S, (hy + 8) * S, 7.5 * S]);
      }
    }
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  if (!GEO.has('ent:pap:fl:' + n + ':' + seed)) GEO.set('ent:pap:fl:' + n + ':' + seed, flashes.length ? flashes : []);
  const m = mesh(geo, Mats.pair);
  m.userData.flashes = GEO.get('ent:pap:fl:' + n + ':' + seed).map((p) => new THREE.Vector3(...p));
  return m;
}

// ---------------------------------------------------------------------------
// Helicopter (nose +x): body, tail, skids, BEAST on the door side; rotor + tail rotor spin.

export function helicopter() {
  const S = 0.07;
  const body = bake('ent:heli', () => {
    const g = G();
    const white = 0xf4f6fa, blue = 0x1477c9, blueD = 0x0d4f8a, glass = 0x8fd8ff, dark = 0x1a1f3c, yel = 0xffd23f;
    blob(g, 0, 9, 0, 12, 7, 7, (x, y, z) => {
      if (x > 5 && y > 9) return (x + y) % 5 === 0 ? 0xd8f4ff : glass; // windshield
      if (y < 7) return y === 6 ? yel : blue;
      return z > 4 && x > -6 && x < 4 && y > 7 && y < 13 ? dark : white; // the open door (+z side)
    });
    capsule(g, [-9, 10, 0], [-31, 12, 0], 2.6, 1.3, (x, y) => (y <= 10 ? blueD : blue));
    // tail fin + stabiliser
    for (let x = -33; x <= -28; x++) for (let y = 12; y <= 21 - (-28 - x) * 0; y++) if (y - 12 <= (x + 34) * 2) g.set(x, y, 0, x === -33 || y === 21 ? yel : blue);
    for (let z = -5; z <= 5; z++) for (let x = -31; x <= -28; x++) g.set(x, 12, z, blueD);
    g.set(-31, 22, 0, 0xff3a3a, true);
    // skids + struts
    for (const s of [-1, 1]) {
      for (let x = -9; x <= 11; x++) g.set(x, 0, s * 7, 0x3d4352).set(x, 0, s * 7 + s, 0x2a2e3a);
      g.set(12, 1, s * 7, 0x3d4352).set(13, 2, s * 7, 0x3d4352);
      for (const x of [-5, 6]) for (let y = 1; y <= 4; y++) g.set(x, y, s * (7 - (y > 2 ? 1 : 0)), 0x3d4352);
    }
    // mast, exhaust, lights
    cyl(g, 'y', 0, 0, 16, 18, 1.4, 1.4, 0x2a2e3a);
    rbox(g, -6, 14, -3, -2, 16, 3, 1, 0x5a6272);
    g.set(12, 6, 0, 0xffffff, true).set(12, 6, 1, 0xfff2a0, true);
    text(g, 'BEAST', -2, 8, 8, '+z', 0xffffff, { center: true });
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const rotor = bake('ent:heliRotor', () => {
    const g = G();
    for (let k = -30; k <= 30; k++) for (const w of [0, 1]) {
      const tip = Math.abs(k) > 26;
      g.set(k, 0, w, tip ? 0xffd23f : 0x3a3f4e);
      g.set(w, 0, k, tip ? 0xffd23f : 0x3a3f4e);
    }
    rbox(g, -2, -1, -2, 3, 1, 3, 1, 0x22252e);
    return g;
  }, { scale: S, pivot: [0.5, 0, 0.5] });
  const tailR = bake('ent:heliTail', () => {
    const g = G();
    for (let k = -6; k <= 6; k++) { g.set(k, 0, 0, Math.abs(k) > 4 ? 0xffd23f : 0x3a3f4e); g.set(0, k, 0, Math.abs(k) > 4 ? 0xffd23f : 0x3a3f4e); }
    return g;
  }, { scale: S, pivot: [0.5, 0.5, 0.5] });
  const root = new THREE.Group();
  root.add(mesh(body));
  const r = mesh(rotor);
  r.position.set(0.5 * S, 18.5 * S, 0.5 * S);
  root.add(r);
  const tr = mesh(tailR);
  tr.position.set(-31 * S, 17 * S, 2 * S);
  root.add(tr);
  root.userData = { rotor: r, tail: tr, door: new THREE.Vector3(-1 * S, 7 * S, 7 * S) };
  return root;
}

/** A braided rope, 1 unit long hanging down from its origin (scale.y = length). */
export function rope() {
  const S = 0.04, N = 25;
  const geo = bake('ent:rope', () => {
    const g = G();
    for (let y = 0; y < N; y++) for (const [x, z] of [[0, 0], [1, 0], [0, 1], [1, 1]]) g.set(x, -y, z, (y + x + z) % 3 === 0 ? 0xa07a4a : (y + x) % 2 ? 0xd8b880 : 0xc8a068);
    return g;
  }, { scale: S, pivot: [1, 0, 1], jitter: 0 });
  const m = mesh(geo, Mats.pair);
  m.userData.unit = N * S;
  return m;
}

// ---------------------------------------------------------------------------
// Stretch limo (nose +x; the door is on the `side` (+1 / -1) z face): wheels spin, the door swings open.

export function limo(side = 1) {
  const S = 0.06, L = 40;
  const body = bake('ent:limo:' + side, () => {
    const g = G();
    const blk = 0x17171f, blkL = 0x262633, chrome = 0xd7dde6, gold = 0xffc21a, tint = 0x2a1f48, tintL = 0x5a4a8a, red = 0x8a0a2e;
    for (let x = -L; x < L; x++) {
      const nose = x >= L - 14, tail = x < -L + 4;
      const top = nose ? 8 - Math.max(0, x - (L - 8)) * 0.4 : tail ? 11 : 12;
      for (let z = -7; z <= 7; z++) {
        const zr = Math.abs(z);
        for (let y = 2; y <= top; y++) {
          if (y > 8 && zr > 6) continue; // roof is a little narrower
          if (y === top && zr === 7) continue;
          let c = (x + y) % 17 === 0 ? blkL : blk;
          if (y === 5) c = chrome;
          if (y === 8) c = gold;
          if (y >= 9 && y <= 11 && zr >= 6 && !nose && !tail) c = (x + 40) % 13 === 0 ? blk : (x + y) % 9 === 0 ? tintL : tint;
          if (nose && y > 8 && x < L - 9 && x > L - 14) c = 0x6ab0d8; // windshield
          // the door opening behind the door panel (velvet inside)
          if (z === 7 * side && x >= -6 && x <= 4 && y >= 3 && y <= 11) c = red;
          g.set(x, y, z, c);
        }
      }
    }
    // bumpers + grille + lights
    for (let z = -7; z <= 7; z++) { g.set(L, 3, z, chrome).set(L, 4, z, chrome).set(-L - 1, 3, z, chrome); }
    for (let z = -4; z <= 4; z++) for (let y = 5; y <= 6; y++) g.set(L, y, z, z % 2 ? chrome : 0x8a92a0);
    for (const s of [-1, 1]) {
      g.set(L, 6, s * 6, 0xffffff, true).set(L, 6, s * 5, 0xfff2c8, true);
      g.set(-L - 1, 6, s * 6, 0xff2a2a, true).set(-L - 1, 7, s * 6, 0xff2a2a, true);
    }
    g.set(L - 2, 9, 0, gold).set(L - 1, 9, 0, gold).set(L - 2, 10, 0, gold);
    // wheel arches
    for (const wx of [-30, 29]) for (const s of [-1, 1]) for (let x = wx - 4; x <= wx + 4; x++) for (let y = 2; y <= 6; y++) if ((x - wx) ** 2 + (y - 2) ** 2 < 20) g.del(x, y, s * 7);
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const wheel = bake('ent:limoWheel', () => {
    const g = G();
    cyl(g, 'z', 0, 0, -1, 1, 3.6, 3.6, (x, y, z) => {
      const r = Math.hypot(x, y);
      if (Math.abs(z) === 1 && r < 1.6) return (x + y) & 1 ? 0xd7dde6 : 0x9aa2b4;
      return r < 2.2 ? 0x3a3d48 : 0x15151c;
    });
    return g;
  }, { scale: S, pivot: [0.5, 0.5, 0.5] });
  const door = bake('ent:limoDoor', () => {
    const g = G();
    for (let x = -11; x <= 0; x++) for (let y = 3; y <= 11; y++) {
      let c = y >= 9 ? (x === -11 || x === 0 ? 0x17171f : (x + y) % 7 === 0 ? 0x5a4a8a : 0x2a1f48) : y === 5 ? 0xd7dde6 : y === 8 ? 0xffc21a : 0x1d1d27;
      g.set(x, y, 0, c);
    }
    g.set(-9, 7, 1, 0xd7dde6).set(-8, 7, 1, 0xd7dde6);
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const root = new THREE.Group();
  root.add(mesh(body, Mats.toyGlossPair));
  const wheels = [];
  for (const wx of [-30, 29]) for (const s of [-1, 1]) {
    const w = mesh(wheel);
    w.position.set((wx + 0.5) * S, 2.5 * S, s * 7.2 * S);
    root.add(w);
    wheels.push(w);
  }
  const hinge = new THREE.Group();
  hinge.position.set(5 * S, 0, side * 7.6 * S);
  hinge.add(mesh(door, Mats.toyGlossPair));
  root.add(hinge);
  root.userData = { wheels, door: hinge, side, wheelR: 3.6 * S, seat: new THREE.Vector3(-1.5 * S, 0, 0) };
  return root;
}

// ---------------------------------------------------------------------------
// Skateboard (along +x): kicked nose / tail, grip tape, trucks and wheels, bolt graphic.

export function skateboard() {
  const S = 0.038;
  const geo = bake('ent:skate', () => {
    const g = G();
    for (let x = -15; x <= 14; x++) {
      const kick = x < -11 ? (-11 - x) * 0.7 : x > 10 ? (x - 10) * 0.7 : 0;
      const y = 3 + Math.round(kick);
      const zr = x < -13 || x > 12 ? 3 : 4;
      for (let z = -zr; z < zr; z++) {
        g.set(x, y, z, (x * 7 + z * 3) % 5 === 0 ? 0x3a3a46 : 0x22222c); // grip tape
        const bolt = Math.abs(z + 0.5 - Math.sin(x * 0.6) * 1.5) < 1.2;
        g.set(x, y - 1, z, bolt ? 0xffd23f : (x + z) % 2 ? 0xff4fa3 : 0xff6ab4);
      }
    }
    for (const tx of [-9, 8]) {
      rbox(g, tx - 1, 1, -3, tx + 1, 1, 2, 0, 0xb8c0cc);
      for (const z of [-4, 3]) blob(g, tx, 0.5, z, 1.2, 1.2, 0.6, 0xfff1d6);
    }
    return g;
  }, { scale: S, pivot: [0, 0, 0.5] });
  const m = mesh(geo);
  m.userData.top = 4.6 * S;
  return m;
}

// ---------------------------------------------------------------------------
// Cardboard box (faces +z): flaps, tape, FRAGILE, a handle slot the eyes peek through.

export function cardBox() {
  const S = 0.05;
  const geo = bake('ent:box', () => {
    const g = G();
    const cb = 0xc8955a, cbD = 0xa87440, cbL = 0xdcae74, tape = 0xe6d2a0;
    for (let x = -10; x <= 9; x++) for (let y = 0; y <= 17; y++) for (let z = -9; z <= 8; z++) {
      const ex = x === -10 || x === 9, ey = y === 17, ez = z === -9 || z === 8;
      if (!(ex || ey || ez)) continue;
      const edge = (ex && ez) || (ex && ey) || (ez && ey);
      let c = edge ? cbD : (x + y * 3) % 11 === 0 ? cbL : cb;
      if (ey && (x === 0 || x === -1)) c = tape;
      if (ez && (x === 0 || x === -1) && y >= 12) c = tape;
      if (ey && z === 0) c = cbD; // flap seam
      g.set(x, y, z, c);
    }
    // handle slot on the front: dark (eyes peek through it)
    for (let x = -4; x <= 3; x++) for (let y = 11; y <= 12; y++) g.set(x, y, 8, 0x1c120a);
    // FRAGILE + this-side-up arrows
    text(g, 'FRAGILE', 0, 3, 9, '+z', 0xd8243a, { center: true });
    for (const ax of [-8, 6]) { g.set(ax, 13, 9, 0x3a2a1a).set(ax - 1, 12, 9, 0x3a2a1a).set(ax + 1, 12, 9, 0x3a2a1a).set(ax, 12, 9, 0x3a2a1a).set(ax, 11, 9, 0x3a2a1a).set(ax, 10, 9, 0x3a2a1a); }
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const eyes = bake('ent:boxEyes', () => {
    const g = G();
    for (const x of [-3, 1]) { g.set(x, 0, 0, 0xffffff, true).set(x + 1, 0, 0, 0xffffff, true); g.set(x + (x < 0 ? 1 : 0), 0, 1, 0x15121f); }
    return g;
  }, { scale: S, pivot: [0, 0, 0], jitter: 0 });
  const root = new THREE.Group();
  root.add(mesh(geo, Mats.pair));
  const e = makeMesh(eyes, Mats.pair);
  e.position.set(-0.5 * S, 11.5 * S, 8.7 * S);
  root.add(e);
  root.userData = { eyes: e, h: 18 * S };
  return root;
}

// ---------------------------------------------------------------------------
// Brick wall (thin along x, wide along z) that breaks into chunks, + the door right beside it.

export function brickWall() {
  const S = 0.06, X1 = 4, Z0 = -20, Z1 = 19, Y1 = 35;
  const key = 'ent:wall';
  if (!GEO.has(key)) {
    const brick = (x, y, z) => {
      const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
      if (y % 4 === 3) return 0xd8cbb8;
      if ((z + 40 + off) % 8 === 7 && (x === 0 || x === X1)) return 0xd8cbb8;
      const id = Math.floor((z + 40 + off) / 8) * 31 + row * 7;
      return [0xc8603e, 0xb8553a, 0xa84a32, 0xc06a48, 0x9a3f2c][id % 5];
    };
    // jagged cuts: 3 columns x 3 rows
    const colOf = (y, z) => (z < -7 + Math.round(n3(y >> 2, 1, 3) * 4 - 2) ? 0 : z < 6 + Math.round(n3(y >> 2, 2, 3) * 4 - 2) ? 1 : 2);
    const rowOf = (y, z) => (y < 12 + Math.round(n3(z >> 2, 3, 3) * 4 - 2) ? 0 : y < 24 + Math.round(n3(z >> 2, 4, 3) * 4 - 2) ? 1 : 2);
    const grids = Array.from({ length: 9 }, () => G());
    for (let x = 0; x <= X1; x++) for (let y = 0; y <= Y1; y++) for (let z = Z0; z <= Z1; z++) {
      if (y === Y1 && n3(z, x, 9) < 0.3) continue; // a ragged top
      grids[rowOf(y, z) * 3 + colOf(y, z)].set(x, y, z, brick(x, y, z));
    }
    const chunks = grids.filter((g) => g.size).map((g) => {
      const b = g.bounds();
      const c = [(b.minX + b.maxX + 1) / 2, (b.minY + b.maxY + 1) / 2, (b.minZ + b.maxZ + 1) / 2];
      return { geo: g.build({ scale: S, pivot: c, jitter: 0.02 }), at: c.map((v) => v * S) };
    });
    GEO.set(key, chunks);
  }
  const door = bake('ent:door', () => {
    const g = G();
    const fr = 0xf4f6fa, dr = 0x8a5a3a, drD = 0x6e4224;
    for (let y = 0; y <= 30; y++) { g.set(0, y, -9, fr).set(0, y, -8, fr).set(0, y, 8, fr).set(0, y, 9, fr); }
    for (let z = -9; z <= 9; z++) { g.set(0, 31, z, fr).set(0, 30, z, fr); }
    for (let y = 0; y <= 29; y++) for (let z = -7; z <= 7; z++) g.set(1, y, z, (y % 10 === 0 || z === -7 || z === 7) ? drD : dr);
    g.set(2, 14, 5, 0xffc21a).set(2, 14, 4, 0xffc21a);
    // a tiny EXIT sign on top
    for (let z = -3; z <= 3; z++) g.set(0, 33, z, 0x2f9a3a, true);
    return g;
  }, { scale: S, pivot: [0.5, 0, 0.5] });
  const root = new THREE.Group();
  const pieces = GEO.get(key).map((c) => {
    const m = mesh(c.geo, Mats.pair);
    m.position.set(...c.at);
    root.add(m);
    return { m, home: new THREE.Vector3(...c.at) };
  });
  const d = mesh(door, Mats.pair);
  root.userData = { pieces, door: d, w: (Z1 - Z0 + 1) * S, h: (Y1 + 1) * S, thick: (X1 + 1) * S };
  return root;
}

// ---------------------------------------------------------------------------
// Parade float (along +x, faces +z): gold-fringed skirt, HYPE panel, a big star on a pole,
// confetti cannons at the front corners. Deck top at userData.deck.

export function paradeFloat() {
  const S = 0.06;
  const geo = bake('ent:float', () => {
    const g = G();
    const pink = 0xff4fa3, pinkD = 0xc2185b, gold = 0xffc21a, goldD = 0xc8901a, blue = 0x29b6f6;
    for (let x = -24; x <= 23; x++) for (let z = -11; z <= 11; z++) for (let y = 1; y <= 9; y++) {
      const side = Math.abs(z) === 11 || x === -24 || x === 23;
      if (!side && y < 9) continue;
      let c = y === 9 ? ((x + z) % 4 === 0 ? 0x1f8fd0 : blue) : (Math.floor((x + 24 + (z + 11)) / 3) % 2 ? pink : pinkD);
      if (y === 8 && side) c = gold;
      if (y === 1 && side) c = (x + z) % 2 ? gold : goldD; // fringe
      g.set(x, y, z, c);
    }
    // wheels under the skirt
    for (const wx of [-17, 16]) for (const s of [-1, 1]) cyl(g, 'z', wx, 1, s * 10, s * 9, 1.6, 1.6, 0x15151c);
    // HYPE panel on the front side
    rbox(g, -9, 3, 12, 8, 7, 12, 0, 0xffffff);
    text(g, 'HYPE', 0, 3, 13, '+z', pink, { center: true });
    // star on a pole at the back
    cyl(g, 'y', -19, -6, 10, 26, 0.9, 0.9, 0xd7dde6);
    const star = ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.', '##.....##'];
    star.forEach((row, r) => [...row].forEach((ch, i) => {
      if (ch !== '#') return;
      const sx = -19 + (i - 4) * 1, sy = 34 - r * 1;
      for (let dz = 0; dz <= 1; dz++) g.set(sx, sy, -6 + dz, r === 0 || i === 0 || i === 8 ? 0xffffff : gold, r < 3);
    }));
    // confetti cannons (front corners, angled up and forward)
    for (const s of [-1, 1]) capsule(g, [19, 10, s * 8], [23, 15, s * 9], 1.4, 1.8, (x, y) => (y > 13 ? goldD : 0x8a92a0));
    return g;
  }, { scale: S, pivot: [0, 0, 0] });
  const m = mesh(geo);
  m.userData = { deck: 10 * S, cannons: [new THREE.Vector3(23 * S, 15 * S, -9 * S), new THREE.Vector3(23 * S, 15 * S, 9 * S)], star: new THREE.Vector3(-19 * S, 30 * S, -5 * S) };
  return m;
}

/** Marching snare drum worn at the belly (attach to a Chibi's torso). */
export function snareDrum() {
  const S = 0.035;
  const geo = bake('ent:drum', () => {
    const g = G();
    cyl(g, 'y', 0, 0, 0, 6, 6.5, 6.5, (x, y, z) => {
      if (y === 0 || y === 6) return 0xd7dde6;
      const a = Math.atan2(z, x);
      return Math.abs(((a * 6 / Math.PI + y * 0.5) % 2 + 2) % 2 - 1) < 0.18 ? 0xd7dde6 : 0xe8343c;
    });
    cyl(g, 'y', 0, 0, 7, 7, 6, 6, 0xfff6ec);
    return g;
  }, { scale: S, pivot: [0.5, 0, 0.5] });
  return mesh(geo);
}

/** A stage microphone (held, then dropped). */
export function microphone() {
  const S = 0.03;
  const geo = bake('ent:mic', () => {
    const g = G();
    capsule(g, [0, 0, 0], [0, 7, 0], 0.9, 1.2, (x, y) => (y === 5 ? 0xffc21a : 0x22222a));
    blob(g, 0, 9.5, 0, 2.2, 2.4, 2.2, (x, y, z) => ((x + y + z) & 1 ? 0xc8ccd8 : 0x9aa2b4));
    return g;
  }, { scale: S, pivot: [0.5, 0, 0.5] });
  return mesh(geo);
}

/** Text width helper re-export for set pieces that stamp words. */
export { textW };
