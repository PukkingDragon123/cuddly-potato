// High-res voxel food for the FOOD SEASON pass (0.02 units per voxel, about
// 2.5x the detail of the ability-prop food in abilities.js): Feastables bars,
// a sesame burger, a pepperoni pizza slice, a glazed donut, fries, a soda cup,
// an ice-cream cone, a cupcake, a hot dog and a popcorn bucket, plus the
// plates / golden cake stand they spin on. Every food faces +Z and sits on y = 0.
//   makeFeast(kind, { gold, metal }) -> Object3D  FEAST_KINDS (metal: real gold material, needs an env map)
//   makePlate(kind)            -> Object3D        'plate' | 'gold' | 'premium'
import { THREE, VoxGrid, Mats, makeMesh, PAL, hash3, vnoise, text, cachedGeometry } from './common.js';
import { variantMaterials, variantColor } from '../../core/voxel.js';

export const FEAST_VOX = 0.02;
const R = (x, y, z) => hash3(x | 0, y | 0, z | 0);
const ang = (x, z) => Math.atan2(z, x);

const FEAST = {
  burger() {
    const g = new VoxGrid();
    const bunTop = 0xe89a3a, bunHi = 0xf8c060, bunLo = 0xc0702a, seed = 0xfff4dc;
    // bottom bun (flat-topped dome)
    g.ellipsoid(0, 3, 0, 13, 4, 13, (x, y) => (y < 2 ? bunLo : bunTop));
    g.carve((x, y) => y < 0 || y > 5);
    // patty: charred, bumpy edge
    g.cylinder(0, 0, 6, 10, 14, (x, y, z) => {
      const n = vnoise(x * 0.4, y * 0.6, z * 0.4);
      return n < 0.3 ? 0x3a1a0c : n < 0.62 ? 0x5a2c14 : 0x6e3a1c;
    });
    g.carve((x, y, z) => y >= 6 && y <= 10 && Math.hypot(x, z) > 13.2 + R(x, y, z) * 1.6);
    // melty cheese: square slab whose corners droop over the patty
    for (let x = -13; x <= 13; x++) for (let z = -13; z <= 13; z++) {
      g.set(x, 11, z, PAL.yellow);
      const corner = Math.abs(x) > 9 && Math.abs(z) > 9;
      if (corner) for (let d = 1; d <= 2 + ((x * 7 + z * 3) & 3); d++) g.set(x, 11 - d, z, d > 2 ? 0xffe680 : PAL.yellow);
    }
    for (const [x, z, n] of [[14, 3, 4], [-14, -4, 3], [5, 14, 5], [-6, -14, 3]]) for (let d = 0; d < n; d++) g.set(x, 11 - d, z, 0xffd84a);
    // frilly lettuce
    g.cylinder(0, 0, 12, 12, 15, (x, y, z) => {
      const a = ang(x, z), r = Math.hypot(x, z), edge = 13.2 + Math.sin(a * 11) * 1.6;
      return r > edge ? undefined : r > edge - 2 ? 0x8ee05a : R(x, 2, z) < 0.5 ? 0x4fc83a : 0x63d64a;
    });
    g.carve((x, y, z) => y === 12 && Math.hypot(x, z) > 13.2 + Math.sin(ang(x, z) * 11) * 1.6);
    // tomato slices
    g.cylinder(0, 0, 13, 14, 12.4, (x, y, z) => { const r = Math.hypot(x, z); return r > 11 ? 0xc81e2a : r % 4 < 1 ? 0xff8a8a : 0xe8343c; });
    // top bun dome + sesame seeds
    g.ellipsoid(0, 15, 0, 14, 11, 14, (x, y, z) => {
      if (y > 18 && R(x, y, z) < 0.05) return seed;
      const lit = (x * -0.4 + y * 0.8 + z * 0.5) / 14;
      return lit > 0.75 ? bunHi : y < 17 ? bunLo : bunTop;
    });
    g.carve((x, y) => y < 15 && y > 14);
    return g;
  },

  pizza() {
    const g = new VoxGrid();
    // slice: tip toward +z, crust along the back (z = -14)
    const inside = (x, z) => z >= -14 && z <= 16 && Math.abs(x) <= (16 - z) * 0.5;
    for (let x = -16; x <= 16; x++) for (let z = -14; z <= 16; z++) {
      if (!inside(x, z)) continue;
      g.set(x, 0, z, 0xd8903a);
      g.set(x, 1, z, 0xe8a24a);
      const edge = Math.abs(x) > (16 - z) * 0.5 - 1.2;
      g.set(x, 2, z, edge ? 0xd03028 : vnoise(x * 0.5, 0, z * 0.5) < 0.25 ? 0xffc23a : 0xffd84a);
      if (!edge && vnoise(x * 0.35, 9, z * 0.35) > 0.62) g.set(x, 3, z, 0xffe680);
    }
    // puffy crust
    g.cylinder(2.5, -14, -15, 15, 2.8, (x, y, z) => (y > 2 && R(x, y, z) < 0.18 ? 0xf0b860 : y < 1 ? 0xb06a28 : 0xd8903a), 'x');
    g.carve((x, y) => y < 0);
    // cheese drips off the sides
    for (const [x, z, n] of [[-12, -7, 4], [11, -5, 3], [-6, 5, 5], [7, 1, 3], [2, 12, 4]]) {
      const sx = Math.sign(x) * Math.floor((16 - z) * 0.5);
      for (let d = 0; d < n; d++) g.set(sx, 2 - d, z, d === n - 1 ? 0xffe680 : 0xffd84a);
    }
    // pepperoni (raised discs with dark spots) + basil
    for (const [px, pz] of [[-5, -8], [5, -9], [0, -2], [-3, 5], [3, 3], [0, 10]]) {
      g.cylinder(px, pz, 3, 3, 2.6, (x, y, z) => (R(x, 5, z) < 0.18 ? 0x8a1418 : Math.hypot(x - px, z - pz) > 2 ? 0xb01e24 : 0xd8343a));
    }
    for (const [x, z] of [[-8, -4], [7, -3], [-1, 7]]) { g.set(x, 3, z, 0x2f9a3a).set(x + 1, 3, z, 0x5fdc4a).set(x, 3, z + 1, 0x2f9a3a); }
    return g;
  },

  donut() {
    const g = new VoxGrid();
    const sp = [0x29b6f6, 0xffd23f, 0xffffff, 0x5fdc4a, 0xff8a2a, 0xb05cff];
    for (let x = -15; x <= 15; x++) for (let y = 0; y <= 12; y++) for (let z = -15; z <= 15; z++) {
      const r = Math.hypot(x, z), d = Math.hypot(r - 9.5, (y - 6) * 1.05);
      if (d > 6) continue;
      // icing on the upper half with a wavy drip line
      const a = ang(x, z);
      const line = 5.6 + Math.sin(a * 7 + r) * 1.4 + (R(x, 0, z) < 0.2 ? -1 : 0);
      let c = d > 4.8 ? (y < 5 ? 0xc87a30 : 0xe0a050) : 0xf0c070;
      if (y >= line) c = d > 5 ? 0xff7ab8 : 0xff4f9e;
      if (y >= line + 1.5 && d > 5.2 && R(x, y, z) < 0.16) c = sp[Math.floor(R(z, x, y) * sp.length)];
      g.set(x, y, z, c);
    }
    return g;
  },

  feast() { return feastBar(0x1f6fe8, 0x8fd4ff); },
  feastPink() { return feastBar(0xff2e88, 0xffb0d6); },
  feastGold() { return feastBar(0xffc21a, 0xfff2a0); },

  fries() {
    const g = new VoxGrid();
    // tapered red carton with a pixel lightning-bolt badge
    for (let y = 0; y <= 20; y++) {
      const w = 8 + Math.floor(y * 0.22), d = 5 + Math.floor(y * 0.08);
      for (let x = -w; x <= w; x++) for (let z = -d; z <= d; z++) {
        if (Math.abs(x) < w && Math.abs(z) < d && y > 0) continue;
        const scallop = y > 17 && Math.abs(z) === d && Math.sin(x * 0.9) * 2 + 18.5 < y;
        if (scallop) continue;
        g.set(x, y, z, y > 18 ? 0xff5a5a : Math.abs(x) === w ? 0xc81e2a : 0xe8343c);
      }
    }
    const bolt = ['..##', '.##.', '####', '.##.', '##..'];
    bolt.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') for (let k = 0; k < 2; k++) for (let m = 0; m < 2; m++) g.set(-4 + c * 2 + k, 15 - r * 2 - m, 6 + 1, 0xffd23f); }));
    // fries: 2x2 sticks, golden with darker tips, leaning a little
    for (let x = -8; x <= 7; x += 2) for (let z = -4; z <= 3; z += 2) {
      const h = 20 + Math.floor(R(x, 1, z) * 11), lean = Math.round((R(z, 2, x) - 0.5) * 3);
      for (let y = 10; y <= h; y++) {
        const ox = Math.round(((y - 10) / (h - 10)) * lean);
        const c = y >= h - 1 ? 0xd8902a : (x + z) & 2 ? 0xffd23f : 0xffe066;
        g.box(x + ox, y, z, x + ox + 1, y, z + 1, c);
      }
    }
    return g;
  },

  soda() {
    const g = new VoxGrid();
    for (let y = 0; y <= 26; y++) {
      const r = 7 + y * 0.1;
      g.cylinder(0, 0, y, y, r, (x, yy, z) => {
        const a = ang(x, z) + yy * 0.12;
        return y < 2 ? 0xc81e2a : (Math.floor((a / Math.PI) * 4 + 8) & 1) ? 0xffffff : 0xe8343c;
      });
    }
    g.carve((x, y, z) => y > 0 && Math.hypot(x, z) < 6 + y * 0.1);
    // lid + straw
    g.cylinder(0, 0, 27, 27, 10.4, 0xe8eef8);
    g.ellipsoid(0, 27, 0, 9, 3, 9, 0xf4f6fa);
    g.carve((x, y) => y < 27 && y > 26.5);
    for (let y = 28; y <= 42; y++) { const x = Math.round((y - 28) * 0.35); g.box(x, y, 0, x + 1, y, 1, (y >> 1) & 1 ? 0xff4f9e : 0xffffff); }
    // pixel logo badge
    text(g, 'B', 0, 11, 9, '+z', 0x1f6fe8, { center: true });
    return g;
  },

  icecream() {
    const g = new VoxGrid();
    // waffle cone
    for (let y = 0; y <= 18; y++) {
      const r = 1 + y * 0.42;
      g.cylinder(0, 0, y, y, r, (x, yy, z) => ((x + yy) % 4 === 0 || (z - yy + 40) % 4 === 0 ? 0xb06a28 : 0xe8a24a));
    }
    g.cylinder(0, 0, 19, 19, 9, 0xd8903a);
    // strawberry scoop with a drip skirt, mint scoop on top, choco chips, cherry
    g.sphere(0, 25, 0, 9, (x, y, z) => (R(x, y, z) < 0.04 ? 0xffd6ea : 0xff8ac0));
    for (let a = 0; a < 18; a++) { const t = (a / 18) * Math.PI * 2, n = 1 + Math.floor(R(a, 3, 1) * 4); for (let d = 0; d < n; d++) g.set(Math.round(Math.cos(t) * 9), 20 - d, Math.round(Math.sin(t) * 9), 0xff8ac0); }
    g.sphere(0, 35, 0, 7.5, (x, y, z) => (R(x, y, z) < 0.08 ? 0x3a1d10 : 0x8ef0c0));
    g.sphere(0, 43, 0, 2.6, 0xe8343c);
    g.line(0, 45, 0, 2, 49, -1, 0x2f9a3a);
    g.set(-1, 44, 1, 0xff8a90);
    return g;
  },

  cupcake() {
    const g = new VoxGrid();
    for (let y = 0; y <= 10; y++) {
      const r = 8 + y * 0.25;
      g.cylinder(0, 0, y, y, r, (x, yy, z) => (Math.floor(((ang(x, z) + Math.PI) / (Math.PI * 2)) * 24) & 1 ? 0x29b6f6 : 0x8fe3ff));
    }
    // swirl frosting: stacked tori shrinking upward
    const tiers = [[12, 11.5], [15, 9.5], [18, 7.2], [21, 4.6], [24, 2.4]];
    for (const [y, r] of tiers) {
      for (let x = -13; x <= 13; x++) for (let z = -13; z <= 13; z++) for (let dy = -2; dy <= 2; dy++) {
        const d = Math.hypot(Math.hypot(x, z) - (r - 2), dy);
        if (d <= 2.4 || Math.hypot(x, z) < r - 2) g.set(x, y + dy, z, d > 1.8 && dy > 0 ? 0xffd6ea : 0xff8ac0);
      }
    }
    g.paint((x, y, z, c) => (c === 0xff8ac0 || c === 0xffd6ea) && R(x, y, z) < 0.05 ? [0x29b6f6, 0xffd23f, 0x5fdc4a, 0xffffff][Math.floor(R(y, z, x) * 4)] : undefined);
    g.sphere(0, 28, 0, 2.5, 0xe8343c);
    return g;
  },

  hotdog() {
    const g = new VoxGrid();
    // bun halves along x
    for (let x = -15; x <= 15; x++) for (let y = 0; y <= 9; y++) for (let z = -7; z <= 7; z++) {
      const ex = Math.max(0, Math.abs(x) - 11);
      const d = Math.hypot(ex, y - 4, Math.abs(z) - 3.5);
      if (d > 4.2 || Math.abs(z) < 1.5 && y > 3) continue;
      g.set(x, y, z, y > 6 ? 0xf8c060 : y < 2 ? 0xc0702a : 0xe89a3a);
    }
    // sausage + mustard zigzag
    g.cylinder(6, 0, -17, 17, 3, (x, y, z) => (y > 7 ? 0xd85a3a : 0xb83a24), 'x');
    g.carve((x, y, z) => Math.abs(x) > 15 && Math.hypot(Math.abs(x) - 15, y - 6) > 3);
    for (let x = -13; x <= 13; x++) { const z = Math.round(Math.sin(x * 0.8) * 1.6); g.set(x, 9, z, 0xffd23f).set(x, 9, z + 1, 0xffd23f); }
    return g;
  },

  popcorn() {
    const g = new VoxGrid();
    for (let y = 0; y <= 20; y++) {
      const r = 8 + y * 0.18;
      g.cylinder(0, 0, y, y, r, (x, yy, z) => (Math.floor(((ang(x, z) + Math.PI) / (Math.PI * 2)) * 12) & 1 ? 0xffffff : 0xe8343c));
    }
    g.carve((x, y, z) => y > 1 && Math.hypot(x, z) < 7 + y * 0.18);
    // heaped kernels
    for (let i = 0; i < 70; i++) {
      const a = R(i, 1, 2) * Math.PI * 2, rr = Math.sqrt(R(i, 3, 4)) * 10, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const y = 20 + (10 - rr) * 0.6 + R(i, 5, 6) * 3;
      g.sphere(Math.round(x), Math.round(y), Math.round(z), 1.6 + R(i, 7, 8), R(i, 9, 9) < 0.25 ? 0xffe680 : 0xfff6dc);
    }
    g.cylinder(0, 0, 18, 22, 9.5, 0xfff6dc);
    return g;
  },
};

function feastBar(wrap, wrapL) {
  const g = new VoxGrid();
  // upright bar leaning back a touch: wrapper on the bottom 60%, chocolate squares above
  const W = 11, H = 38, D = 3;
  for (let y = 0; y <= H; y++) {
    const lean = Math.floor(y / 12);
    for (let x = -W; x <= W; x++) for (let z = -D; z <= D; z++) {
      const zz = z - lean;
      const torn = 21 + Math.round(Math.sin(x * 1.3) * 1.5 + (R(x, 0, 0) - 0.5) * 2);
      if (y <= torn) {
        const rim = y >= torn - 1;
        g.set(x, y, zz, rim ? 0xd7dde6 : Math.abs(x) === W ? wrapL : (x + y) % 9 === 0 && z === D ? wrapL : wrap);
      } else {
        // chocolate: 3 columns x 4 rows of squares with grooves, a bite out of the top corner
        if (Math.hypot(x - 9, y - H) < 6.5) continue;
        const gx = (x + W) % 7.4 < 1, gy = (y - 22) % 4 === 0;
        const top = Math.abs(z) === D && z > 0;
        g.set(x, y, zz, (gx || gy) && top ? 0x3a1d10 : top && R(x, y, 1) < 0.08 ? 0x8a5232 : x < -W + 1 ? 0x5a3220 : 0x6a3c24);
      }
    }
  }
  // FEAST logo on the wrapper front + a white stripe
  const lean = Math.floor(10 / 12);
  for (let x = -W + 1; x <= W - 1; x++) { g.set(x, 4, D + 1 - lean, 0xffffff); g.set(x, 17, D + 1 - lean, 0xffffff); }
  text(g, 'FEAST', 0, 8, D + 1 - lean, '+z', 0xffffff, { center: true });
  return g;
}

export const FEAST_KINDS = ['burger', 'pizza', 'donut', 'feast', 'fries', 'soda', 'icecream', 'cupcake', 'hotdog', 'popcorn', 'feastPink'];
export const FEAST_NAMES = {
  burger: 'Beast Burger', pizza: 'Pepperoni Slice', donut: 'Sprinkle Donut', feast: 'Feastables Bar', feastPink: 'Feastables Crunch',
  feastGold: 'Golden Feastables', fries: 'Lab Fries', soda: 'Beast Soda', icecream: 'Triple Scoop', cupcake: 'Party Cupcake', hotdog: 'Mega Dog', popcorn: 'Popcorn Bucket',
};
/** Display scale per item so flat foods read as big as tall ones. */
export const FEAST_SCALE = { pizza: 1.3, hotdog: 1.2, donut: 1.12, burger: 1.05 };
/** Rough calories per item, purely for flavour text. */
export const FEAST_KCAL = { burger: 780, pizza: 420, donut: 350, feast: 210, feastPink: 230, feastGold: 999, fries: 510, soda: 250, icecream: 620, cupcake: 380, hotdog: 460, popcorn: 600 };

const goldGrid = (fn) => () => { const g = fn(); g.paint((x, y, z, c) => variantColor('gold', c)); return g; };

/** A food item (Object3D, about 0.6 units across). opts.gold = metallic gold version. */
export function makeFeast(kind = 'burger', opts = {}) {
  const fn = FEAST[kind] ?? FEAST.burger;
  const gold = !!opts.gold;
  const geo = cachedGeometry(`feast:${kind}:${gold ? 'g' : ''}`, gold ? goldGrid(fn) : fn, { scale: FEAST_VOX, jitter: 0.03 });
  // gold = the gold-recoloured grid in toy plastic (metal finishes need a scene env map;
  // thumbnails and the UI stage render without one, where metal reads as dull brown)
  const m = makeMesh(geo, gold && opts.metal ? variantMaterials('gold') : Mats.pair);
  const root = new THREE.Group();
  root.add(m);
  root.name = 'feast:' + kind;
  return root;
}

/** Plate / stand under a pass food: 'plate' (diner plate), 'premium' (gold-rim plate), 'gold' (golden cake stand), 'none'. */
export function makePlate(kind = 'plate') {
  if (kind === 'none') { const g = new THREE.Group(); g.userData.top = 0; return g; }
  const geo = cachedGeometry('feastPlate:' + kind, () => {
    const g = new VoxGrid();
    const rim = kind === 'plate' ? 0x29b6f6 : 0xffc21a;
    if (kind === 'gold') {
      g.cylinder(0, 0, 0, 1, 9, 0xc8901a);
      g.cylinder(0, 0, 2, 7, 3, 0xffc21a);
      g.cylinder(0, 0, 8, 9, 20, (x, y, z) => (Math.hypot(x, z) > 18.6 ? 0xffe680 : 0xffc21a));
      g.cylinder(0, 0, 10, 10, 19, (x, y, z) => (Math.floor(((ang(x, z) + Math.PI) / (Math.PI * 2)) * 32) & 1 ? 0xffe680 : 0xffd23f));
      g.carve((x, y, z) => y === 10 && Math.hypot(x, z) < 17);
    } else {
      g.cylinder(0, 0, 0, 0, 13, 0xd7dde6);
      g.cylinder(0, 0, 1, 1, 20, (x, y, z) => (Math.hypot(x, z) > 17 ? rim : 0xf4f6fa));
      g.cylinder(0, 0, 2, 2, 20.4, (x, y, z) => { const r = Math.hypot(x, z); return r > 17.2 ? (r > 19.4 ? rim : 0xffffff) : undefined; });
      g.carve((x, y, z) => y === 2 && Math.hypot(x, z) <= 17.2);
      if (kind === 'premium') g.paint((x, y, z, c) => (c === rim && Math.floor(((ang(x, z) + Math.PI) / (Math.PI * 2)) * 24) & 1 ? 0xfff2a0 : undefined));
    }
    return g;
  }, { scale: FEAST_VOX, jitter: 0.02 });
  const root = new THREE.Group();
  root.add(makeMesh(geo, Mats.pair));
  root.userData.top = (kind === 'gold' ? 10 : 2) * FEAST_VOX;
  return root;
}
