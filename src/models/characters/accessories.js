// Accessory system for chibi characters.
//
// A character (or Commander outfit) lists accessories in `acc` (and outfits can
// add more with `accPlus` or drop some with `accMinus`). Legacy fields keep
// working: `hat: { type, color }` and `chain: true` become accessories too.
// Precedence for exclusive slots (hats, eyewear): accPlus > hat > acc.
//
//   acc: ['watch', 'badge', { type: 'cap', color: 0xff4f4f, logo: 'bolt' }, { type: 'cape', color: 0x29b6f6 }]
//
// Each accessory type has a slot (which joint it rides on) and a builder that
// draws voxels into that joint's grid (or into `metal` for shiny bits).
// Hats are exclusive (the last one wins), and so are eyewear items.
import { shade, hash3 } from '../../core/util.js';
import { blob, rbox, capsule, cyl, stamp } from '../kit.js';
import { inHead, HEAD, buildBackpack } from './parts.js';

const SLOT = {
  cap: 'head', capBack: 'head', beanie: 'head', chef: 'head', crown: 'head', headband: 'head', goggles: 'head', hardhat: 'head',
  partyhat: 'head', tophat: 'head', helmet: 'head', jetpack: 'torso', headset: 'head', headphones: 'head', glasses: 'head', shades: 'head', shadesUp: 'head', earpiece: 'head', earring: 'head',
  chain: 'torso', badge: 'torso', nametag: 'torso', bowtie: 'torso', tie: 'torso', whistle: 'torso', backpack: 'torso', radio: 'torso',
  pens: 'torso', scarf: 'torso', neckphones: 'torso', medal: 'torso',
  watch: 'fore', wristband: 'fore',
  armband: 'upper',
  clipboard: 'hand', phone: 'hand', mic: 'hand', whisk: 'hand',
  cape: 'cape',
};
const HATS = new Set(['cap', 'capBack', 'beanie', 'chef', 'crown', 'headband', 'goggles', 'hardhat', 'partyhat', 'tophat', 'helmet']);
const EYEWEAR = new Set(['glasses', 'shades']);
const HAND_DEFAULT = { clipboard: 'L', phone: 'R', mic: 'R', whisk: 'R' };

export const ACCESSORY_TYPES = Object.keys(SLOT);
export const accSlot = (a) => SLOT[a?.type] ?? null;

/** Normalised accessory list for a character def (legacy hat/chain fields included). */
export function normalizeAcc(def) {
  const list = [];
  const add = (x) => {
    if (!x) return;
    const a = typeof x === 'string' ? { type: x } : { ...x };
    if (!SLOT[a.type]) return;
    if (a.type === 'watch' || a.type === 'wristband') a.side ??= a.type === 'wristband' ? 'both' : 'L';
    if (SLOT[a.type] === 'hand') a.side ??= HAND_DEFAULT[a.type] ?? 'R';
    list.push(a);
  };
  for (const x of def.acc ?? []) add(x);
  if (def.chain) add('chain');
  if (def.hat) add({ ...def.hat });
  for (const x of def.accPlus ?? []) add(x);
  const minus = new Set(def.accMinus ?? []);
  // last hat / eyewear wins, no duplicate types
  const out = [];
  const seen = new Set();
  let hat = false, eye = false;
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (minus.has(a.type) || seen.has(a.type)) continue;
    if (HATS.has(a.type)) { if (hat) continue; hat = true; }
    if (EYEWEAR.has(a.type)) { if (eye) continue; eye = true; }
    seen.add(a.type);
    out.unshift(a);
  }
  return out;
}

/** Hand-held items for one side ('L' | 'R'). */
export const handItem = (accs, side) => accs.find((a) => SLOT[a.type] === 'hand' && a.side === side) ?? null;

// ---------------------------------------------------------------------------
// helpers

const removeHair = (g, test) => g.carve((x, y, z) => !inHead(x, y, z, 0) && test(x, y, z) && !(y < 12 && Math.abs(x + 0.5) > 10));
/** Topmost voxel near the head centre (hair height). */
function topOfHead(g) {
  for (let y = 40; y >= 0; y--) for (const [x, z] of [[-1, 0], [0, 1], [-1, 3], [0, -3]]) if (g.has(x, y, z)) return y;
  return HEAD.y1;
}
/** Voxels on an elliptic ring around the head at height y (radius rx, rz). */
function ring(g, y0, y1, rx, rz, col, cx = -0.5, cz = 0.5, th = 1.2) {
  for (let y = y0; y <= y1; y++)
    for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
      for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++) {
        const d = Math.hypot((x + 0.5 - cx - 0.5) / rx, (z + 0.5 - cz - 0.5) / rz);
        if (d <= 1 && d >= 1 - th / Math.max(rx, rz)) g.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
}

/** Set a voxel on the front of the torso, in front of whatever is already there. */
function pf(g, x, y, c, glow = false, other = null) {
  let z = 4;
  while (g.has(x, y, z) || other?.has(x, y, z)) z++;
  g.set(x, y, z, c, glow);
  return z;
}

const LOGOS = {
  bolt: ['.##', '##.', '###', '.##', '##.'],
  b: ['##.', '#.#', '##.', '#.#', '##.'],
  heart: ['#.#', '###', '.#.'],
  star: ['.#.', '###', '.#.'],
  dollar: ['.#.', '###', '##.', '.##', '###', '.#.'],
};

function capImpl(g, def, a, back) {
  const c = a.color ?? 0xff2e88;
  removeHair(g, (x, y) => y >= 17);
  blob(g, -0.5, 16.5, 0.5, 11.3, 7.4, 10.6, (x, y, z) => (Math.abs(x + 0.5) < 1 && y > 20 ? shade(c, -0.1) : c), { p: 2.2, clip: (x, y) => y < 17 });
  ring(g, 17, 17, 11.3, 10.6, shade(c, -0.12), -0.5, 0.5, 1.5);
  g.set(-1, 24, 0, shade(c, -0.22)); g.set(0, 24, 0, shade(c, -0.22)); g.set(-1, 24, 1, shade(c, -0.22)); g.set(0, 24, 1, shade(c, -0.22));
  const bz = back ? [-16, -9] : [9, 16];
  const brim = shade(c, -0.18);
  rbox(g, -9, 17, bz[0], 8, 17, bz[1], 2, (x, y, z) => ((back ? z === bz[0] + 0 : z === bz[1]) ? shade(c, -0.28) : brim));
  if (!back) {
    const art = LOGOS[a.logo ?? 'bolt'] ?? LOGOS.bolt;
    stamp(g, art, { '#': a.logoColor ?? 0xffffff }, { axis: 'z', x: -2, y: 22 });
  } else {
    for (let x = -3; x <= 2; x++) g.del(x, 18, 11);
    g.set(-1, 18, 11, shade(c, -0.3));
  }
}

function headsetImpl(g, def, a, big) {
  const c = a.color ?? 0x2a2a36, acc = a.accent ?? def.accent ?? 0x29b6f6;
  const top = topOfHead(g) + 1;
  for (let x = -13; x <= 12; x++) {
    const u = (x + 0.5) / 12.5;
    const y = Math.round(10 + Math.sqrt(Math.max(0, 1 - u * u)) * (top - 10));
    g.set(x, y, 0, c); g.set(x, y, 1, c);
    if (big) g.set(x, y + 1, 0, shade(c, 0.1));
  }
  const r = big ? 3.4 : 2.6;
  for (const s of [-1, 1]) {
    const x = s < 0 ? HEAD.x0 - 2 : HEAD.x1 + 2;
    blob(g, x, 9, 0.5, big ? 1.6 : 1.2, r, r, c);
    blob(g, x + s * (big ? 1.4 : 1), 9, 0.5, 0.6, r - 0.8, r - 0.8, acc);
  }
  if (!big && a.mic !== false) {
    capsule(g, [HEAD.x0 - 2, 8, 2], [-7, 5, HEAD.z1 + 1.5], 0.5, 0.5, c);
    blob(g, -6, 5, HEAD.z1 + 2, 1.2, 1.2, 1.2, 0x111118);
  }
}

function glassesImpl(g, a, solid) {
  const c = a.color ?? 0x222233, z = HEAD.z1 + 1;
  for (const [x0, x1] of [[-8, -2], [1, 7]]) {
    for (let x = x0; x <= x1; x++) for (let y = 8; y <= 14; y++) {
      const edge = x === x0 || x === x1 || y === 8 || y === 14;
      const corner = (x === x0 || x === x1) && (y === 8 || y === 14);
      if (corner && !solid) continue;
      if (edge) g.set(x, y, z, c);
      else if (solid) g.set(x, y, z, (x + y) % 5 === 0 ? 0x4a4a6a : a.lens ?? 0x15151f);
    }
    if (solid) { g.set(x0 + 1, 13, z, 0xffffff); g.set(x0 + 2, 12, z, 0xc8d8ff); }
  }
  g.set(-1, 12, z, c); g.set(0, 12, z, c);
  for (let zz = 1; zz <= z; zz++) { g.set(HEAD.x0 - 1, 12, zz, c); g.set(HEAD.x1 + 1, 12, zz, c); }
  g.set(-9, 12, z, c); g.set(8, 12, z, c);
}

// ---------------------------------------------------------------------------
// builders: (g, metal, def, a, side)

const B = {
  // ----- hats
  cap(g, metal, def, a) { capImpl(g, def, a, false); },
  capBack(g, metal, def, a) { capImpl(g, def, a, true); },

  beanie(g, metal, def, a) {
    const c = a.color ?? 0xff2e88;
    removeHair(g, (x, y) => y >= 16);
    blob(g, -0.5, 16, 0.5, 11.6, 9.2, 10.8, (x, y, z) => ((x + 20) % 2 ? c : shade(c, -0.08)), { p: 2.2, clip: (x, y) => y < 16 });
    ring(g, 16, 18, 12.2, 11.2, (x, y) => (y === 17 ? shade(c, -0.14) : shade(c, -0.2)), -0.5, 0.5, 2.2);
    blob(g, -0.5, 26.5, 0.5, 3, 3, 3, (x, y, z) => (hash3(x, y, z) < 0.35 ? shade(a.pom ?? 0xffffff, -0.1) : a.pom ?? 0xffffff));
    if (a.logo !== false) stamp(g, LOGOS.bolt, { '#': a.logoColor ?? 0xffd23f }, { axis: 'z', x: -2, y: 22 });
  },
  chef(g, metal, def, a) {
    const w = 0xffffff, sh = 0xe6e9f0;
    removeHair(g, (x, y) => y >= 17);
    ring(g, 17, 21, 11, 10.2, (x, y, z) => (hash3(x, 0, z) < 0.3 ? sh : w), -0.5, 0.5, 3);
    for (let x = -9; x <= 8; x++) for (let z = -8; z <= 9; z++) for (let y = 17; y <= 21; y++) if (!g.has(x, y, z) && Math.hypot((x + 0.5) / 10, (z - 0.5) / 9.4) < 1) g.set(x, y, z, w);
    blob(g, -0.5, 25, 0.5, 11.5, 4.5, 10.5, w, { p: 2 });
    for (const [x, z] of [[-6, -3], [5, -3], [-1, 5], [-6, 4], [5, 4], [-1, -6]]) blob(g, x, 28, z, 4.5, 3.5, 4.5, (xx, yy, zz) => (yy < 27 ? sh : w));
    blob(g, -0.5, 30, 0.5, 4.5, 2.5, 4.5, w);
  },
  crown(g, metal, def, a) {
    const top = Math.max(19, topOfHead(g) - 2);
    const gold = 0xffd23f, gem = [0xff2e88, 0x29b6f6, 0x5fdc4a];
    ring(metal, top, top + 2, 7.5, 7, gold, -0.5, 0.5, 1.6);
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      const x = Math.round(-0.5 + Math.cos(an) * 7), z = Math.round(0.5 + Math.sin(an) * 6.5);
      for (let y = top + 3; y <= top + 5; y++) metal.set(x, y, z, gold);
      metal.set(x, top + 6, z, 0xfff0a0);
    }
    g.set(-1, top + 1, 8, gem[0]); g.set(0, top + 1, 8, gem[0]);
    g.set(-7, top + 1, 4, gem[1]); g.set(6, top + 1, 4, gem[2]);
  },
  headband(g, metal, def, a) {
    const c = a.color ?? 0xff2e88;
    removeHair(g, (x, y, z) => y >= 15 && y <= 16 && z > -2);
    for (let x = HEAD.x0 - 1; x <= HEAD.x1 + 1; x++) for (let z = HEAD.z0 - 1; z <= HEAD.z1 + 1; z++) for (const y of [15, 16]) if (inHead(x, y, z, 1) && !inHead(x, y, z, 0)) g.set(x, y, z, y === 16 ? c : shade(c, -0.1));
    // knot + tails at the back
    blob(g, -0.5, 15.5, HEAD.z0 - 2, 1.6, 1.4, 1, shade(c, -0.08));
    capsule(g, [-1, 15, HEAD.z0 - 2], [-4, 10, HEAD.z0 - 4], 0.9, 0.7, c);
    capsule(g, [0, 15, HEAD.z0 - 2], [2, 9, HEAD.z0 - 3], 0.9, 0.7, c);
    if (a.logo !== false) stamp(g, LOGOS.bolt, { '#': a.logoColor ?? 0xffffff }, { axis: 'z', x: -2, y: 17, zmin: HEAD.z1, zmax: HEAD.z1 + 2 });
  },
  goggles(g, metal, def, a) {
    const rim = a.rim ?? 0x333344, lens = a.lens ?? 0x7fe8ff, strap = a.color ?? 0x2a2a3a;
    removeHair(g, (x, y, z) => y >= 15 && y <= 21 && z >= 6);
    for (let x = HEAD.x0 - 1; x <= HEAD.x1 + 1; x++) for (let z = HEAD.z0 - 2; z <= HEAD.z1 + 1; z++) for (const y of [17, 18]) if (inHead(x, y, z, 2) && !inHead(x, y, z, 1)) g.set(x, y, z, strap);
    for (const [x0, x1] of [[-8, -2], [1, 7]]) {
      rbox(g, x0, 15, HEAD.z1 + 1, x1, 20, HEAD.z1 + 2, 1, rim);
      for (let x = x0 + 1; x <= x1 - 1; x++) for (let y = 16; y <= 19; y++) g.set(x, y, HEAD.z1 + 3, (x + y) % 4 === 0 ? shade(lens, 0.15) : lens);
      g.set(x0 + 1, 19, HEAD.z1 + 3, 0xffffff, true);
      g.set(x0 + 2, 18, HEAD.z1 + 3, shade(lens, -0.45), true);
    }
    g.set(-1, 17, HEAD.z1 + 1, rim); g.set(0, 17, HEAD.z1 + 1, rim);
  },
  hardhat(g, metal, def, a) {
    const c = a.color ?? 0xffd23f;
    removeHair(g, (x, y) => y >= 17);
    blob(g, -0.5, 17, 0.5, 11, 7, 10.4, c, { p: 2.2, clip: (x, y) => y < 17 });
    ring(g, 17, 17, 13, 12.5, shade(c, -0.1), -0.5, 0.5, 3);
    for (let z = -9; z <= 10; z++) for (let y = 21; y <= 25; y++) if (g.has(-1, y, z) && !g.has(-1, y + 1, z)) { g.set(-1, y + 1, z, shade(c, 0.08)); g.set(0, y + 1, z, shade(c, 0.08)); }
  },
  partyhat(g, metal, def, a) {
    const c = a.color ?? 0x29b6f6;
    const top = topOfHead(g);
    for (let y = 0; y <= 10; y++) {
      const r = 5 * (1 - y / 11);
      for (let x = -6; x <= 5; x++) for (let z = -5; z <= 6; z++) if (Math.hypot(x + 0.5, z - 0.5) <= r + 0.4) g.set(x, top + y, z, (y + Math.floor((x + z + 20) / 3)) % 3 ? c : 0xffd23f);
    }
    blob(g, -0.5, top + 11, 0.5, 1.6, 1.6, 1.6, 0xff2e88);
  },
  tophat(g, metal, def, a) {
    const c = a.color ?? 0x1a1a22;
    const top = Math.max(18, topOfHead(g) - 1);
    ring(g, top, top, 12, 11.5, c, -0.5, 0.5, 4);
    for (let y = top + 1; y <= top + 9; y++) for (let x = -8; x <= 7; x++) for (let z = -7; z <= 8; z++) if (Math.hypot((x + 0.5) / 7.6, (z - 0.5) / 7.2) <= 1) g.set(x, y, z, y === top + 2 || y === top + 3 ? a.band ?? 0xff2e88 : c);
  },
  headset(g, metal, def, a) { headsetImpl(g, def, a, false); },
  headphones(g, metal, def, a) { headsetImpl(g, def, a, true); },

  glasses(g, metal, def, a) { glassesImpl(g, a, false); },
  shades(g, metal, def, a) { glassesImpl(g, a, true); },

  shadesUp(g, metal, def, a) {
    const c = a.color ?? 0x222233;
    removeHair(g, (x, y, z) => y >= 18 && y <= 21 && z >= 5);
    for (const [x0, x1] of [[-8, -2], [1, 7]]) for (let x = x0; x <= x1; x++) for (let y = 18; y <= 21; y++) g.set(x, y, HEAD.z1 + 1 - (y > 19 ? 1 : 0), x === x0 || x === x1 || y === 18 || y === 21 ? c : 0x15151f);
    g.set(-1, 20, HEAD.z1 + 1, c); g.set(0, 20, HEAD.z1 + 1, c);
  },
  earpiece(g) {
    g.set(HEAD.x1 + 2, 8, 1, 0x1a1a22); g.set(HEAD.x1 + 2, 7, 1, 0x1a1a22);
    for (let y = 0; y <= 6; y++) g.set(HEAD.x1 + 1, y, 1 - (y % 2), 0xc8d8e8);
  },
  earring(g, metal) {
    metal.set(HEAD.x0 - 1, 6, 1, 0xffd23f); metal.set(HEAD.x1 + 1, 6, 1, 0xffd23f);
  },

  helmet(g, metal, def, a) {
    // space helmet: open face, panel seams, comm discs, antenna, flip-up visor (a.visor: 'down' closes it)
    const c = a.color ?? 0xeef2f8, d = shade(c, -0.16), e = shade(c, -0.34);
    const vis = a.visorColor ?? 0x1e6fa8, glow = a.glow ?? 0x3fd2ee, acc = a.accent ?? def.accent ?? 0xff2e88;
    // keep the face (nose, fringe peeking out); everything else outside the skull goes under the helmet
    g.carve((x, y, z) => !inHead(x, y, z, 0) && !(z >= 9 && y >= 3 && y <= 17 && Math.abs(x + 0.5) <= 7.5));
    const open = (x, y, z) => z >= 3 && y >= 3 && y <= 16 && Math.abs(x + 0.5) <= 7.5 + (y >= 6 && y <= 14 ? 0.6 : 0);
    for (let x = HEAD.x0 - 2; x <= HEAD.x1 + 2; x++)
      for (let y = HEAD.y0; y <= HEAD.y1 + 2; y++)
        for (let z = HEAD.z0 - 2; z <= HEAD.z1 + 2; z++) {
          if (!inHead(x, y, z, 2) || inHead(x, y, z, 0) || open(x, y, z)) continue;
          if (y < 3 && z < 3) continue; // open neck at the back/bottom
          let col = c;
          if (y === 12 && z < 3) col = d;
          if (y >= 19 && Math.abs(x + 0.5) <= 1) col = acc;
          if (open(x, y + 1, z) || open(x, y - 1, z) || open(x + 1, y, z) || open(x - 1, y, z)) col = e; // rim
          g.set(x, y, z, col);
        }
    for (const s of [-1, 1]) {
      const x = s < 0 ? HEAD.x0 - 3 : HEAD.x1 + 3;
      cyl(g, 'x', 9, 1, x, x, 2.6, 2.6, e);
      g.set(x + s, 9, 1, glow, true);
      g.set(x + s, 9, 0, shade(glow, -0.4));
    }
    capsule(g, [HEAD.x0 - 3, 12, -1], [HEAD.x0 - 4, 22, -3], 0.5, 0.4, e);
    g.set(HEAD.x0 - 4, 23, -3, 0xff3d4d, true);
    if (a.visor === 'down') {
      for (let x = -9; x <= 8; x++) for (let y = 2; y <= 16; y++) g.set(x, y, HEAD.z1 + 2, (x - y) % 7 === 0 ? shade(vis, 0.35) : vis);
    } else {
      // visor flipped up onto the forehead
      for (let x = -9; x <= 8; x++) for (let y = 17; y <= 21; y++) {
        const z = HEAD.z1 + 2 - Math.floor((y - 17) / 2);
        g.set(x, y, z, y === 17 ? e : (x + y) % 6 === 0 ? shade(vis, 0.4) : vis);
      }
    }
  },

  // ----- torso (body grid: x -6..5, y 0..9, z -4..3, raised layer z = 4)
  chain(g, metal, def, a) {
    const gold = a.color ?? 0xffd23f, dk = shade(gold, -0.25);
    const pts = [];
    for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push([Math.round(-5 + u * 9), Math.round(9 - Math.sin(u * Math.PI) * 4)]); }
    let k = 0;
    for (const [x, y] of pts) pf(metal, x, y, k++ % 2 ? dk : gold, false, g);
    for (let z = -4; z <= 3; z++) { metal.set(-6, 9, z, z % 2 ? gold : dk); metal.set(5, 9, z, z % 2 ? gold : dk); }
    // pendant
    const pend = a.pendant ?? 'dollar';
    const art = LOGOS[pend] ?? LOGOS.dollar;
    for (let r = 0; r < art.length; r++) for (let q = 0; q < art[r].length; q++) if (art[r][q] === '#') pf(metal, -2 + q, 5 - r, (r + q) % 3 ? gold : 0xfff0a0, false, g);
  },
  badge(g, metal, def, a) {
    const strap = a.color ?? 0x29b6f6, card = 0xffffff;
    for (let y = 5; y <= 9; y++) { pf(g, -5 + Math.round((9 - y) * 0.2), y, strap); pf(g, -1 - Math.round((9 - y) * 0.3), y, strap); }
    for (let x = -6; x <= -2; x++) for (let y = 1; y <= 4; y++) pf(g, x, y, y === 4 ? a.header ?? 0x29b6f6 : card);
    const z = pf(g, -5, 2, def.skin ?? 0xf1c3a0);
    g.set(-5, 3, z, def.hair?.color ?? 0x4a2f1c);
    g.set(-3, 2, z, 0x9aa0b0); g.set(-4, 2, z, 0x9aa0b0);
    metal.set(-4, 5, z - 1, 0xd0d4dc);
  },
  nametag(g, metal, def, a) {
    let z = 4;
    for (let x = 2; x <= 5; x++) for (let y = 6; y <= 7; y++) z = Math.max(z, pf(g, x, y, y === 7 ? a.color ?? 0xff4f4f : 0xffffff));
    g.set(3, 6, z, 0x333344); g.set(4, 6, z, 0x333344);
  },
  bowtie(g, metal, def, a) {
    const c = a.color ?? def.accent ?? 0xff2e88;
    for (const [x, y] of [[-3, 8], [-3, 9], [-2, 8], [-2, 9], [1, 8], [1, 9], [2, 8], [2, 9], [-4, 7], [3, 7]]) pf(g, x, y, c);
    for (const [x, y] of [[-1, 8], [0, 8], [-1, 9], [0, 9]]) pf(g, x, y, shade(c, -0.2));
  },
  tie(g, metal, def, a) {
    const c = a.color ?? def.accent ?? 0xff2e88;
    for (let y = 2; y <= 9; y++) { pf(g, -1, y, c); pf(g, 0, y, y === 9 ? shade(c, -0.15) : c); }
    pf(g, -1, 1, shade(c, -0.2));
  },
  whistle(g, metal, def, a) {
    for (let i = 0; i <= 5; i++) { pf(g, -4 + i, 9 - i, 0xff4f4f); pf(g, 3 - i, 9 - i, 0xff4f4f); }
    for (const [x, y] of [[-1, 2], [0, 2], [1, 2], [-1, 3], [0, 3]]) pf(metal, x, y, 0xd8dce4, false, g);
  },
  backpack(g, metal, def, a) { buildBackpack(g, def, a); },
  jetpack(g, metal, def, a) {
    const c = a.color ?? def.coat ?? 0xeef2f8, d = shade(c, -0.2);
    rbox(g, -5, 2, -6, 4, 9, -5, 1, d);
    for (const x of [-3.5, 2.5]) {
      cyl(g, 'y', x, -8.5, 1, 9, 2.1, 2.1, (xx, yy) => (yy === 9 || yy === 5 ? d : c));
      cyl(metal, 'y', x, -8.5, -1, 0, 1.6, 2.2, 0x7a8496);
      g.set(Math.floor(x), -2, -9, 0xff8a2a, true);
    }
    for (let y = 3; y <= 8; y++) { g.set(-1, y, -7, def.accent ?? 0xff2e88); g.set(0, y, -7, def.accent ?? 0xff2e88); }
  },
  radio(g, metal, def, a) {
    rbox(g, -9, 1, -1, -7, 5, 1, 0, 0x22222a);
    for (let y = 5; y <= 9; y++) g.set(-8, y, -1, 0x111118);
    g.set(-9, 4, 0, 0xff3d3d, true);
    for (let y = 2; y <= 3; y++) g.set(-9, y, 1, 0x555566);
  },
  pens(g) {
    for (const [x, c] of [[2, 0x29b6f6], [3, 0xff2e88], [4, 0x5fdc4a]]) { pf(g, x, 8, c); pf(g, x, 7, c); }
  },
  scarf(g, metal, def, a) {
    const c = a.color ?? 0xff4f4f, d = shade(c, -0.14);
    for (let x = -7; x <= 6; x++) for (let z = -5; z <= 4; z++) for (let y = 9; y <= 10; y++) if (x === -7 || x === 6 || z === -5 || z === 4) g.set(x, y, z, (x + y) % 3 ? c : d);
    for (let y = 3; y <= 9; y++) { pf(g, -5, y, y % 3 ? c : d); pf(g, -4, y, y % 3 ? c : d); }
  },
  neckphones(g, metal, def, a) {
    const c = a.color ?? 0x2a2a36, acc = a.accent ?? def.accent ?? 0xff2e88;
    for (const s of [-1, 1]) {
      const x = s < 0 ? -6 : 5;
      blob(g, x, 10, 1, 1.5, 2, 2, c);
      blob(g, x, 10, 3, 1, 1.2, 0.6, acc);
    }
    for (let x = -6; x <= 5; x++) g.set(x, 10, -5, c);
  },
  medal(g, metal, def, a) {
    for (let y = 5; y <= 9; y++) { pf(g, -3 + Math.round((9 - y) * 0.4), y, 0x29b6f6); pf(g, 2 - Math.round((9 - y) * 0.4), y, 0xff2e88); }
    for (let x = -2; x <= 1; x++) for (let y = 2; y <= 4; y++) if (!((x === -2 || x === 1) && (y === 2 || y === 4))) pf(metal, x, y, a.color ?? 0xffd23f, false, g);
  },

  // ----- forearm (x -2..1, y -4..0, z -2..1)
  watch(g, metal, def, a, side) {
    const band = a.color ?? 0x22222a;
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) if (x === -3 || x === 2 || z === -3 || z === 2) g.set(x, -3, z, band);
    const ox = side < 0 ? -4 : 3;
    rbox(metal, ox, -4, -2, ox, -2, 1, 0, a.bezel ?? 0xd8dce4);
    g.set(ox + (side < 0 ? -1 : 1), -3, -1, a.screen ?? 0x2f6f86, true);
    g.set(ox + (side < 0 ? -1 : 1), -3, 0, a.screen ?? 0x2f6f86, true);
  },
  wristband(g, metal, def, a) {
    const c = a.color ?? def.accent ?? 0xffffff;
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) for (let y = -4; y <= -3; y++) if (x === -3 || x === 2 || z === -3 || z === 2) g.set(x, y, z, y === -4 ? shade(c, -0.1) : c);
  },
  armband(g, metal, def, a) {
    const c = a.color ?? 0xffd23f;
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) for (let y = -3; y <= -2; y++) if (x === -3 || x === 2 || z === -3 || z === 2) g.set(x, y, z, c);
  },

  // ----- hand items (hand grid at the wrist, y down)
  clipboard(g, metal, def, a, side) {
    const x = side < 0 ? -3 : 2;
    for (let y = -10; y <= -1; y++) for (let z = -3; z <= 4; z++) g.set(x, y, z, 0x9a6a3a);
    const px = x + (side < 0 ? -1 : 1);
    for (let y = -9; y <= -3; y++) for (let z = -2; z <= 3; z++) g.set(px, y, z, (y === -5 || y === -7) && z < 2 ? 0x9aa6c0 : 0xffffff);
    for (let z = 0; z <= 1; z++) metal.set(px, -2, z, 0xd0d4dc);
  },
  phone(g, metal, def, a) {
    rbox(g, -1, -6, 1, 0, -2, 3, 0, 0x1a1a22);
    for (let y = -5; y <= -3; y++) g.set(-1, y, 4, a.screen ?? 0x2f6f86, true);
  },
  mic(g, metal, def, a) {
    capsule(g, [-0.5, -2, 1.5], [-0.5, -1, 6], 0.8, 1, 0x22222a);
    blob(metal, -0.5, -0.8, 7.5, 1.6, 1.6, 1.6, 0xc8ccd8);
  },
  whisk(g, metal, def, a) {
    capsule(g, [-0.5, -2, 1.5], [-0.5, -1, 5], 0.7, 0.7, 0x9a6a3a);
    for (let i = 0; i < 4; i++) capsule(metal, [-0.5, -1, 5], [-0.5 + (i - 1.5), -0.5 + (i % 2), 10], 0.3, 0.3, 0xd8dce4);
  },
};

/** Draw accessory `a` into a joint grid. */
export function buildAccessory(a, slot, g, metal, def, side = 1) {
  const fn = B[a.type];
  if (!fn) return;
  fn(g, metal, def, a, side);
}
