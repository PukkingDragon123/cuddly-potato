// Accessory system for chibi characters (sculpted hi-res, 0.025 units per voxel).
//
// A character (or Commander outfit) lists accessories in `acc` (and outfits can
// add more with `accPlus` or drop some with `accMinus`). Legacy fields keep
// working: `hat: { type, color }` and `chain: true` become accessories too.
// Precedence for exclusive slots (hats, eyewear): accPlus > hat > acc.
//
//   acc: ['watch', 'badge', { type: 'cap', color: 0xff4f4f, logo: 'bolt' }, { type: 'cape', color: 0x29b6f6 }]
//
// Each accessory type has a slot (which joint it rides on) and a builder that
// draws voxels into that joint's grid (or into `metal` for shiny bits). Head
// accessories wrap the character's own sculpted skull (inHead / shell), so hats,
// helmets and headsets fit every head shape. Hats are exclusive (the last one
// wins), and so are eyewear items.
import { shade, hash3 } from '../../core/util.js';
import { blob, rbox, capsule, cyl, stamp } from '../kit.js';
import { inHead, shell, HEAD, FRONT, buildBackpack } from './parts.js';

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
  // a sealed helmet (e.g. the Recruit's exosuit) is part of the outfit: it always keeps the
  // hat slot (outfit skins can't swap it for a cap/chef hat), a crown sits on top of it, and
  // eyewear / face items are dropped since there is no face
  const sealed = !minus.has('helmet') && list.find((a) => a.type === 'helmet' && a.visor === 'sealed');
  let hat = false, eye = false;
  if (sealed) { seen.add('helmet'); hat = true; eye = true; }
  for (let i = list.length - 1; i >= 0; i--) {
    const a = list[i];
    if (minus.has(a.type) || seen.has(a.type)) continue;
    if (sealed && (a.type === 'shadesUp' || a.type === 'goggles')) continue;
    if (sealed && a.type === 'crown') { seen.add(a.type); out.unshift({ ...a, onHelmet: true }); continue; }
    if (HATS.has(a.type)) { if (hat) continue; hat = true; }
    if (EYEWEAR.has(a.type)) { if (eye) continue; eye = true; }
    seen.add(a.type);
    out.unshift(a);
  }
  if (sealed) out.unshift(sealed); // built first, so the crown can sit on the shell
  return out;
}

/** Hand-held items for one side ('L' | 'R'). */
export const handItem = (accs, side) => accs.find((a) => SLOT[a.type] === 'hand' && a.side === side) ?? null;

// ---------------------------------------------------------------------------
// helpers (head grid: x -20..19, y 0..39, z -17..19, face plane z = 20)

/** Remove hair (anything outside the skull) where test holds, keeping the beard/jaw area. */
const removeHair = (g, test) => g.carve((x, y, z) => !inHead(x, y, z, 0) && y > 12 && test(x, y, z));
/** Topmost voxel near the head centre (hair height). */
function topOfHead(g) {
  for (let y = 70; y >= 0; y--) for (const [x, z] of [[-1, 0], [0, 2], [-1, 6], [0, -6]]) if (g.has(x, y, z)) return y;
  return HEAD.y1;
}
/** Outermost voxel on the side (s = -1 | 1) at (y, z). */
function sideOf(g, s, y, z) {
  for (let x = s < 0 ? -32 : 31; Math.abs(x) > 4; x -= s) if (g.has(x, y, z)) return x;
  return s < 0 ? -20 : 19;
}
/** Elliptic ring band around the head at heights y0..y1. */
function ring(g, y0, y1, rx, rz, col, cx = 0, cz = 1, th = 1.6) {
  for (let y = y0; y <= y1; y++)
    for (let x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++)
      for (let z = Math.floor(cz - rz - 2); z <= Math.ceil(cz + rz + 2); z++) {
        const d = Math.hypot((x + 0.5 - cx) / rx, (z + 0.5 - cz) / rz);
        if (d <= 1 && d >= 1 - th / Math.max(rx, rz)) g.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
}
/** Front-most torso voxel z at (x, y). */
function fz(g, x, y, other) {
  let z = 16;
  while (z > -4 && !g.has(x, y, z) && !other?.has(x, y, z)) z--;
  return z;
}
/** Set a voxel on the front of the torso, in front of whatever is already there. */
function pf(g, x, y, c, glow = false, other = null) {
  const z = Math.max(fz(g, x, y), other ? fz(other, x, y) : -99) + 1;
  g.set(x, y, z, c, glow);
  return z;
}
const up2 = (art) => { const o = []; for (const r of art) { const s = [...r].map((c) => c + c).join(''); o.push(s, s); } return o; };

const LOGOS = {
  bolt: ['.##', '##.', '###', '.##', '##.'],
  b: ['##.', '#.#', '##.', '#.#', '##.'],
  heart: ['#.#', '###', '.#.'],
  star: ['.#.', '###', '.#.'],
  dollar: ['.#.', '###', '##.', '.##', '###', '.#.'],
};

function capImpl(g, def, a, back) {
  const c = a.color ?? 0xff2e88, cd = shade(c, -0.12), ce = shade(c, -0.26);
  const Y0 = 30;
  removeHair(g, (x, y, z) => y >= Y0 + 1 && !(z > 15 && y < Y0 + 3));
  // six-panel crown with seams and a top button
  shell(g, 3.4, (x, y) => y >= Y0, (x, y, z) => {
    if (y <= Y0 + 1) return cd; // sweatband edge
    const ang = Math.atan2(x + 0.5, z - 1);
    const seam = Math.abs(((ang / (Math.PI / 3)) % 1 + 1) % 1 - 0.5) > 0.46;
    return seam && y > Y0 + 3 ? shade(c, -0.08) : c;
  });
  const top = topOfHead(g);
  for (let x = -2; x <= 1; x++) for (let z = 0; z <= 3; z++) if (!((x === -2 || x === 1) && (z === 0 || z === 3))) g.set(x, top + 1, z, ce);
  // curved brim
  for (let x = -15; x <= 14; x++)
    for (let k = 0; k <= 12; k++) {
      const ax = Math.abs(x + 0.5);
      const reach = 12 - (ax / 15) ** 2 * 8;
      if (k > reach) continue;
      const z = back ? -17 - k : 21 + k;
      const y = Y0 - Math.round((ax / 15) ** 2 * 2) + (k > reach - 1 ? 0 : 0);
      g.set(x, y, z, k >= reach - 1 ? ce : cd);
      g.set(x, y + 1, z, k >= reach - 1 ? cd : c);
      if (!back && k <= 2) g.set(x, y - 1, z, ce);
    }
  if (!back) {
    const art = LOGOS[a.logo ?? 'bolt'] ?? LOGOS.bolt;
    stamp(g, up2(art), { '#': a.logoColor ?? 0xffffff }, { axis: 'z', x: -3, y: Y0 + 12, raise: 1, zmax: 30 });
  } else {
    // strap gap + snap at the front opening
    for (let x = -4; x <= 3; x++) for (let y = Y0 + 1; y <= Y0 + 3; y++) for (let z = 18; z <= 24; z++) if (g.has(x, y, z) && !inHead(x, y, z, 0)) g.set(x, y, z, y === Y0 + 3 ? ce : shade(c, -0.18));
  }
}

function headsetImpl(g, metal, def, a, big) {
  const c = a.color ?? 0x2a2a36, acc = a.accent ?? def.accent ?? 0x29b6f6;
  const top = topOfHead(g) + 1;
  for (let x = -24; x <= 23; x++) {
    const u = (x + 0.5) / 23.5;
    const y = Math.round(18 + Math.sqrt(Math.max(0, 1 - u * u)) * (top - 18));
    for (let z = 0; z <= (big ? 3 : 2); z++) g.set(x, y, z, z === 0 && big ? shade(c, 0.12) : c);
    if (big) g.set(x, y + 1, 1, shade(c, 0.12));
  }
  const r = big ? 6.2 : 4.6;
  for (const s of [-1, 1]) {
    const x = sideOf(g, s, 18, -1) + s * (big ? 2.5 : 1.5);
    blob(g, x, 17.5, -0.5, big ? 2.6 : 1.8, r, r, c, { p: 2.2 });
    blob(g, x + s * (big ? 2.4 : 1.6), 17.5, -0.5, 0.8, r - 1.6, r - 1.6, acc, { p: 2.2 });
    if (big) blob(metal, x + s * (big ? 3.2 : 2), 17.5, -0.5, 0.5, 1.4, 1.4, 0xd8dce4);
  }
  if (!big && a.mic !== false) {
    capsule(g, [sideOf(g, -1, 16, 2) - 2, 16, 2], [-10, 8, 22], 0.8, 0.8, c);
    blob(g, -9, 8, 22.5, 2, 1.6, 1.6, 0x111118);
  }
}

function glassesImpl(g, a, solid) {
  const c = a.color ?? 0x222233, z = FRONT;
  const lens = a.lens ?? 0x15151f;
  for (const [x0, x1] of [[-13, -3], [2, 12]]) {
    for (let x = x0; x <= x1; x++) for (let y = 16; y <= 25; y++) {
      const edge = x === x0 || x === x1 || y === 16 || y === 25;
      const corner = (x === x0 || x === x1) && (y === 16 || y === 25);
      if (corner) continue;
      if (edge) g.set(x, y, z, y === 25 ? shade(c, 0.12) : c);
      else if (solid) g.set(x, y, z, (x - y) % 7 === 0 ? shade(lens, 0.25) : y >= 23 ? shade(lens, 0.08) : lens);
    }
    if (solid) { g.set(x0 + 2, 23, z + 1, 0xffffff); g.set(x0 + 3, 22, z, 0xc8d8ff); }
  }
  for (let x = -2; x <= 1; x++) g.set(x, 22, z, c); // bridge
  // temples running back to the ears
  for (const s of [-1, 1]) for (let zz = 2; zz <= 19; zz++) g.set(sideOf(g, s, 22, zz) + s, 22, zz, c);
}

// ---------------------------------------------------------------------------
// builders: (g, metal, def, a, side)

const B = {
  // ----- hats
  cap(g, metal, def, a) { capImpl(g, def, a, false); },
  capBack(g, metal, def, a) { capImpl(g, def, a, true); },

  beanie(g, metal, def, a) {
    const c = a.color ?? 0xff2e88;
    removeHair(g, (x, y) => y >= 29);
    shell(g, 4, (x, y) => y >= 28, (x, y, z) => ((Math.round(Math.atan2(x + 0.5, z - 1) * 9) & 1) ? c : shade(c, -0.09)));
    // folded cuff with ribbing
    shell(g, 5.2, (x, y) => y >= 27 && y <= 31, (x, y, z) => (y === 31 ? shade(c, -0.08) : (Math.round(Math.atan2(x + 0.5, z - 1) * 12) & 1) ? shade(c, -0.16) : shade(c, -0.22)), 3.8);
    const top = topOfHead(g);
    const pom = a.pom ?? 0xffffff;
    for (let i = 0; i < 9; i++) blob(g, -0.5 + Math.cos(i * 2.4) * 2.4, top + 4 + Math.sin(i * 1.7) * 1.6, 1 + Math.sin(i * 2.4) * 2.4, 2.4, 2.4, 2.4, (x, y, z) => (hash3(x, y, z) < 0.35 ? shade(pom, -0.12) : pom));
    if (a.logo !== false) stamp(g, up2(LOGOS.bolt), { '#': a.logoColor ?? 0xffd23f }, { axis: 'z', x: -3, y: 40, raise: 0, zmax: 30 });
  },
  chef(g, metal, def, a) {
    const w = 0xffffff, sh = 0xe4e8f0;
    removeHair(g, (x, y) => y >= 31);
    shell(g, 2.6, (x, y) => y >= 30 && y <= 40, (x, y, z) => (Math.round(Math.atan2(x + 0.5, z - 1) * 8) & 1 ? w : sh));
    const top = topOfHead(g);
    for (let y = top - 2; y <= top + 4; y++) ring(g, y, y, 15.5 + (y - top) * 0.6, 14.5 + (y - top) * 0.6, (x, yy, z) => (hash3(x >> 1, 0, z >> 1) < 0.3 ? sh : w), 0, 1, 20);
    for (const [x, z] of [[-11, -6], [10, -6], [0, 10], [-10, 8], [9, 8], [0, -11], [0, 0]]) blob(g, x, top + 9, z, 9, 6.5, 9, (xx, yy) => (yy < top + 6 ? sh : w), { p: 2 });
  },
  crown(g, metal, def, a) {
    const top = a.onHelmet ? topOfHead(g) - 3 : Math.max(38, topOfHead(g) - 4);
    const gold = 0xffd23f, gd = 0xc89a1a, gem = [0xff2e88, 0x29b6f6, 0x5fdc4a];
    ring(metal, top, top + 3, 15, 14, (x, y) => (y === top ? gd : gold), 0, 1, 2.6);
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      const cx = Math.cos(an) * 13.8, cz = 1 + Math.sin(an) * 12.8;
      for (let y = top + 4; y <= top + 9; y++) {
        const r = 2.4 * (1 - (y - top - 4) / 7);
        for (let x = Math.floor(cx - 3); x <= Math.ceil(cx + 3); x++) for (let z = Math.floor(cz - 3); z <= Math.ceil(cz + 3); z++) if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= r + 0.5) metal.set(x, y, z, y === top + 9 ? 0xfff0a0 : gold);
      }
      metal.set(Math.round(cx - 0.5), top + 10, Math.round(cz - 0.5), 0xfff4c0);
      const gz = Math.round(cz - 0.5), gx = Math.round(cx - 0.5);
      g.set(gx + Math.sign(cx) * 0, top + 1, gz + (Math.abs(Math.sin(an)) > 0.5 ? Math.sign(Math.sin(an)) : 0), gem[i % 3]);
    }
  },
  headband(g, metal, def, a) {
    const c = a.color ?? 0xff2e88;
    removeHair(g, (x, y, z) => y >= 30 && y <= 33 && z > -4);
    shell(g, 2, (x, y) => y >= 30 && y <= 33, (x, y) => (y === 33 ? c : y === 30 ? shade(c, -0.2) : shade(c, -0.08)));
    blob(g, -0.5, 31.5, -20, 3, 2.6, 1.8, shade(c, -0.08));
    capsule(g, [-1, 31, -20], [-7, 21, -24], 1.6, 1.2, c);
    capsule(g, [0, 31, -20], [4, 19, -22], 1.6, 1.2, c);
    if (a.logo !== false) stamp(g, up2(LOGOS.bolt), { '#': a.logoColor ?? 0xffffff }, { axis: 'z', x: -3, y: 33, zmin: 19, zmax: 24 });
  },
  goggles(g, metal, def, a) {
    const rim = a.rim ?? 0x333344, lens = a.lens ?? 0x7fe8ff, strap = a.color ?? 0x2a2a3a;
    removeHair(g, (x, y, z) => y >= 29 && y <= 38 && z >= 14);
    shell(g, 2.5, (x, y) => y >= 32 && y <= 34, (x, y) => (y === 33 ? shade(strap, 0.1) : strap), 0.5);
    for (const cx of [-7.5, 6.5]) {
      for (let x = Math.floor(cx - 6); x <= Math.ceil(cx + 6); x++) for (let y = 29; y <= 39; y++) {
        const d = ((x + 0.5 - cx - 0.5) / 5.6) ** 2 + ((y + 0.5 - 34) / 4.8) ** 2;
        if (d > 1) continue;
        const z = 20;
        if (d > 0.62) { metal.set(x, y, z, rim === 0x333344 ? 0x5a6070 : rim); metal.set(x, y, z + 1, d > 0.8 ? 0x4a505e : 0x6a7080); }
        else {
          g.set(x, y, z + 1, (x + y) % 5 === 0 ? shade(lens, 0.2) : y < 33 ? shade(lens, -0.12) : lens);
          if (d < 0.18 && y > 34) g.set(x, y, z + 2, 0xffffff, true);
        }
      }
    }
    for (let x = -2; x <= 1; x++) metal.set(x, 34, 20, 0x5a6070);
  },
  hardhat(g, metal, def, a) {
    const c = a.color ?? 0xffd23f;
    removeHair(g, (x, y) => y >= 31);
    shell(g, 3.6, (x, y) => y >= 30, c);
    ring(g, 30, 31, 22, 20.5, (x, y) => (y === 30 ? shade(c, -0.18) : shade(c, -0.08)), 0, 1, 4);
    const top = topOfHead(g);
    for (let z = -16; z <= 22; z++) for (let y = 30; y <= top + 2; y++) for (const x of [-2, -1, 0, 1]) if (g.has(x, y, z) && !g.has(x, y + 1, z)) g.set(x, y + 1, z, shade(c, 0.1));
  },
  partyhat(g, metal, def, a) {
    const c = a.color ?? 0x29b6f6;
    const top = topOfHead(g) - 1;
    for (let y = 0; y <= 20; y++) {
      const r = 9 * (1 - y / 21);
      for (let x = -11; x <= 10; x++) for (let z = -10; z <= 12; z++) if (Math.hypot(x + 0.5, z - 0.5) <= r + 0.4) g.set(x, top + y, z, (y + Math.floor((x + z + 40) / 5)) % 6 < 3 ? c : 0xffd23f);
    }
    for (let i = 0; i < 6; i++) blob(g, -0.5 + Math.cos(i) * 1.4, top + 22 + Math.sin(i * 2) * 1, 0.5 + Math.sin(i) * 1.4, 1.8, 1.8, 1.8, i & 1 ? 0xff2e88 : 0xff6aa8);
  },
  tophat(g, metal, def, a) {
    const c = a.color ?? 0x1a1a22;
    const top = Math.max(36, topOfHead(g) - 2);
    ring(g, top, top + 1, 23, 22, (x, y) => (y === top ? shade(c, -0.2) : c), 0, 1, 8);
    for (let y = top + 2; y <= top + 19; y++) for (let x = -16; x <= 15; x++) for (let z = -14; z <= 16; z++) {
      const r = Math.hypot((x + 0.5) / 14.6, (z - 0.5) / 13.8);
      if (r <= 1 + (y - top) * 0.004) g.set(x, y, z, y >= top + 3 && y <= top + 6 ? (y === top + 3 ? shade(a.band ?? 0xff2e88, -0.2) : a.band ?? 0xff2e88) : y === top + 19 ? shade(c, 0.12) : c);
    }
  },
  headset(g, metal, def, a) { headsetImpl(g, metal, def, a, false); },
  headphones(g, metal, def, a) { headsetImpl(g, metal, def, a, true); },

  glasses(g, metal, def, a) { glassesImpl(g, a, false); },
  shades(g, metal, def, a) { glassesImpl(g, a, true); },

  shadesUp(g, metal, def, a) {
    const c = a.color ?? 0x222233;
    let top = 0;
    for (let x = -13; x <= 12; x++) for (let z = 10; z <= 24; z++) for (let y = 34; y <= 50; y++) if (g.has(x, y, z)) top = Math.max(top, y);
    const y0 = Math.min(top - 4, 40);
    for (const [x0, x1] of [[-13, -3], [2, 12]]) for (let x = x0; x <= x1; x++) for (let y = 0; y <= 6; y++) {
      const edge = x === x0 || x === x1 || y === 0 || y === 6;
      if ((x === x0 || x === x1) && (y === 0 || y === 6)) continue;
      let z = 30; while (z > 8 && !g.has(x, y0 + y, z)) z--;
      g.set(x, y0 + y, z + 1, edge ? c : (x - y) % 6 === 0 ? 0x3a3a5a : 0x15151f);
    }
    for (let x = -2; x <= 1; x++) { let z = 30; while (z > 8 && !g.has(x, y0 + 3, z)) z--; g.set(x, y0 + 3, z + 1, c); }
  },
  earpiece(g) {
    const x = sideOf(g, 1, 18, 0) + 1;
    blob(g, x, 18, 0, 1, 1.6, 1.6, 0x1a1a22);
    for (let y = 2; y <= 16; y++) g.set(x - 1 - (y < 8 ? 1 : 0), y, 1 - ((y >> 1) % 2), 0xc8d8e8);
  },
  earring(g, metal) {
    for (const s of [-1, 1]) { const x = sideOf(g, s, 13, -1); metal.set(x, 11, -1, 0xffd23f); metal.set(x, 10, -1, 0xffd23f); metal.set(x, 10, 0, 0xffe27a); }
  },

  helmet(g, metal, def, a) {
    // space helmet: panel seams, comm pods, antenna and a visor.
    //   a.visor: 'up' (default, flipped onto the forehead) | 'down' (clear visor over the face)
    //          | 'sealed' (fully closed helmet, opaque tinted glass, no face at all)
    const c = a.color ?? 0xeef2f8, d = shade(c, -0.14), e = shade(c, -0.32);
    const vis = a.visorColor ?? 0x1e6fa8, glow = a.glow ?? def.glow ?? 0x3fd2ee, acc = a.accent ?? def.accent ?? 0xff2e88;
    const sealed = a.visor === 'sealed';
    if (sealed) g.carve((x, y, z) => !inHead(x, y, z, 0)); // nose, hair, beard all go under the shell
    else g.carve((x, y, z) => !inHead(x, y, z, 0) && !(z >= 18 && y >= 6 && y <= 33 && Math.abs(x + 0.5) <= 15));
    const T = 4.5;
    const open = (x, y, z) => z >= 6 && y >= 5 && y <= 32 && Math.abs(x + 0.5) <= 15 + (y >= 11 && y <= 27 ? 1 : 0);
    for (let x = HEAD.x0 - 6; x <= HEAD.x1 + 6; x++)
      for (let y = HEAD.y0 - 3; y <= HEAD.y1 + 7; y++)
        for (let z = HEAD.z0 - 6; z <= HEAD.z1 + 7; z++) {
          if (!inHead(x, y, z, T) || inHead(x, y, z, 0)) continue;
          if (open(x, y, z)) {
            if (sealed) g.set(x, y, z, 0x0a0f18); // dark backing behind the glass
            continue;
          }
          if (y < 4 && z < 6) continue; // open neck ring at the bottom
          let col = c;
          if (y === 22 && z < 6) col = d; // panel seam
          if (Math.abs(z - 1) < 0.6 && y > 30) col = d;
          if (y >= 38 && Math.abs(x + 0.5) <= 2) col = acc; // racing stripe
          if (open(x, y + 1, z) || open(x, y - 1, z) || open(x + 1, y, z) || open(x - 1, y, z)) col = e; // rim
          g.set(x, y, z, col);
        }
    // neck ring
    ring(metal, 2, 4, 14.5, 13, (x, y) => (y === 3 ? 0x9aa4b4 : 0x7a8496), 0, -1, 3);
    for (const s of [-1, 1]) {
      const x = s < 0 ? -26 : 25;
      cyl(g, 'x', 18, 1, x - s, x, 5.2, 5.2, e);
      cyl(g, 'x', 18, 1, x + s, x + s, 3.8, 3.8, d);
      g.set(x + 2 * s, 18, 1, glow, true); g.set(x + 2 * s, 19, 1, glow, true); g.set(x + 2 * s, 18, 0, shade(glow, -0.4));
    }
    capsule(g, [-26, 24, -3], [-28, 44, -7], 0.8, 0.6, e);
    g.set(-29, 45, -8, 0xff3d4d, true); g.set(-28, 45, -8, 0xff3d4d, true);
    if (sealed) {
      // opaque, glossy tinted visor: a domed, round-cornered pane of dark mirror glass (metal
      // grid = env reflections) with a reflected-horizon band, a diagonal sheen streak and a
      // glint, a raised rim with a glow strip across the top and one small HUD light in the
      // lower corner. Deliberately asymmetric so nothing reads as eyes or a mouth.
      const tint = a.visorColor ?? 0x0e1a2e, tintD = shade(tint, -0.45);
      const band = a.visorBand ?? 0x2a5a86;
      const zf = FRONT + 4;
      const inV = (x, y) => {
        const ux = Math.abs(x + 0.5) / 17.2, uy = Math.abs(y + 0.5 - 19) / 14.6;
        return y >= 5 && y <= 33 && ux ** 4 + uy ** 4 <= 1;
      };
      for (let x = -18; x <= 17; x++)
        for (let y = 5; y <= 33; y++) {
          if (!inV(x, y)) continue;
          const edge = !inV(x - 1, y) || !inV(x + 1, y) || !inV(x, y - 1) || !inV(x, y + 1);
          const ux = (x + 0.5) / 16, uy = (y + 0.5 - 19) / 14;
          const dome = 1 - ux * ux * 0.8 - uy * uy * 0.6;
          const zt = zf + (edge ? 0 : Math.max(1, Math.round(dome * 4)));
          let col = y >= 26 ? shade(tint, 0.1) : y <= 10 ? shade(tint, -0.15) : tint;
          if (y === 12 || y === 13) col = shade(band, -0.35);
          if (y === 10 || y === 11) col = shade(band, -0.15);
          const k = x - y;
          if (!edge && x <= 2 && y >= 18 && (k >= -36 && k <= -33)) col = 0x8fb4d8;
          if (!edge && x <= 4 && y >= 16 && (k === -28 || k === -27)) col = 0x4d77a0;
          for (let z = zf - 2; z <= zt; z++) metal.set(x, y, z, z === zt ? col : tintD);
        }
      metal.set(-10, 29, zf + 4, 0xd8ecff); metal.set(-9, 28, zf + 4, 0xd8ecff);
      metal.set(10, 9, zf + 2, 0xffb347, true); metal.set(11, 9, zf + 2, 0xffb347, true);
      for (let x = -20; x <= 19; x++)
        for (let y = 3; y <= 35; y++) {
          if (inV(x, y)) continue;
          if (inV(x - 1, y) || inV(x + 1, y) || inV(x, y - 1) || inV(x, y + 1) || inV(x - 1, y - 1) || inV(x + 1, y + 1)) { g.set(x, y, zf + 1, e); g.set(x, y, zf, e); }
        }
      for (let x = -12; x <= 11; x++) g.set(x, 35, zf + 1, glow, true);
      for (let x = -17; x <= 16; x++) for (let y = 3; y <= 4; y++) g.set(x, y, zf + 1, d); // chin guard
      for (const x of [-12, -8, 7, 11]) g.set(x, 3, zf + 2, e); // chin vents
    } else if (a.visor === 'down') {
      for (let x = -17; x <= 16; x++) for (let y = 4; y <= 33; y++) g.set(x, y, FRONT + 4, (x - y) % 9 === 0 ? shade(vis, 0.35) : vis);
    } else {
      for (let x = -17; x <= 16; x++) for (let y = 33; y <= 42; y++) {
        const z = FRONT + 4 - Math.floor((y - 33) / 2);
        g.set(x, y, z, y === 33 ? e : (x + y) % 8 === 0 ? shade(vis, 0.4) : vis);
      }
    }
  },

  // ----- torso (body grid: x -14..13, y 0..19, z -8..8, front surface ~ z 7..9)
  chain(g, metal, def, a) {
    const gold = a.color ?? 0xffd23f, dk = shade(gold, -0.28);
    let k = 0;
    for (let i = 0; i <= 26; i++) {
      const u = i / 26;
      const x = Math.round(-9.5 + u * 18), y = Math.round(19 - Math.sin(u * Math.PI) * 9);
      const z = pf(metal, x, y, k++ % 2 ? dk : gold, false, g);
      if (k % 2) metal.set(x, y - 1, z, dk);
    }
    for (let z = -6; z <= 6; z++) for (const x of [-10, 9]) metal.set(x, 20, z, (z & 1) ? gold : dk);
    const art = up2(LOGOS[a.pendant ?? 'dollar'] ?? LOGOS.dollar);
    for (let r = 0; r < art.length; r++) for (let q = 0; q < art[r].length; q++) if (art[r][q] === '#') pf(metal, -3 + q, 9 - r, (r + q) % 4 ? gold : 0xfff0a0, false, g);
  },
  badge(g, metal, def, a) {
    const strap = a.color ?? 0x29b6f6, card = 0xffffff;
    for (let y = 9; y <= 19; y++) { pf(g, -11 + Math.round((19 - y) * 0.25), y, strap); pf(g, -3 - Math.round((19 - y) * 0.3), y, strap); }
    for (let x = -12; x <= -4; x++) for (let y = 1; y <= 8; y++) pf(g, x, y, y >= 7 ? a.header ?? 0x29b6f6 : card);
    // photo + text lines on the card
    for (let x = -11; x <= -9; x++) for (let y = 2; y <= 5; y++) pf(g, x, y, y >= 5 ? def.hair?.color ?? 0x4a2f1c : def.skin ?? 0xf1c3a0);
    for (const y of [3, 5]) for (let x = -7; x <= -5; x++) pf(g, x, y, 0x9aa0b0);
    metal.set(-8, 9, fz(g, -8, 9) + 1, 0xd0d4dc);
  },
  nametag(g, metal, def, a) {
    for (let x = 4; x <= 10; x++) for (let y = 12; y <= 15; y++) pf(g, x, y, y >= 14 ? a.color ?? 0xff4f4f : 0xffffff);
    for (let x = 5; x <= 9; x++) pf(g, x, 12, x & 1 ? 0x333344 : 0x5a5a6a);
  },
  bowtie(g, metal, def, a) {
    const c = a.color ?? def.accent ?? 0xff2e88;
    for (let x = -6; x <= 5; x++) for (let y = 15; y <= 19; y++) {
      const ax = Math.abs(x + 0.5);
      if (ax < 1.5 ? y >= 16 && y <= 18 : Math.abs(y - 17) <= (ax - 1) * 0.6 + 0.6) pf(g, x, y, ax < 1.5 ? shade(c, -0.22) : (y + x) % 3 ? c : shade(c, -0.1));
    }
  },
  tie(g, metal, def, a) {
    const c = a.color ?? def.accent ?? 0xff2e88;
    for (let y = 4; y <= 19; y++) {
      const w = y >= 17 ? 1.6 : y <= 6 ? 1 + (y - 4) * 0.3 : 1.9;
      for (let x = -3; x <= 2; x++) if (Math.abs(x + 0.5) <= w) pf(g, x, y, y >= 17 ? shade(c, -0.18) : (y + x) % 5 === 0 ? shade(c, -0.12) : c);
    }
  },
  whistle(g, metal, def, a) {
    for (let i = 0; i <= 10; i++) { pf(g, -8 + i, 19 - i, 0xff4f4f); pf(g, 7 - i, 19 - i, 0xff4f4f); }
    for (let x = -2; x <= 2; x++) for (let y = 5; y <= 8; y++) pf(metal, x, y, 0xd8dce4, false, g);
  },
  backpack(g, metal, def, a) { buildBackpack(g, def, a); },
  jetpack(g, metal, def, a) {
    const c = a.color ?? def.coat ?? 0xeef2f8, d = shade(c, -0.2), e = shade(c, -0.36);
    rbox(g, -10, 4, -12, 9, 19, -9, 2, d);
    for (const x of [-6.5, 5.5]) {
      cyl(g, 'y', x, -16, 2, 19, 4.2, 4.2, (xx, yy) => (yy === 18 || yy === 10 || yy === 19 ? e : yy > 15 ? shade(c, 0.05) : c));
      cyl(metal, 'y', x, -16, -3, 1, 3, 4.2, 0x7a8496);
      for (let xx = Math.floor(x) - 1; xx <= Math.floor(x) + 1; xx++) g.set(xx, -4, -16, 0xff8a2a, true);
    }
    for (let y = 6; y <= 17; y++) for (const x of [-1, 0]) g.set(x, y, -13, def.accent ?? 0xff2e88);
  },
  radio(g, metal, def, a) {
    rbox(g, -17, 2, -2, -14, 10, 2, 1, 0x22222a);
    for (let y = 10; y <= 19; y++) g.set(-16, y, -1, 0x111118);
    g.set(-18, 8, 0, 0xff3d3d, true);
    for (let y = 4; y <= 6; y++) for (let z = -1; z <= 1; z++) g.set(-18, y, z, (y + z) & 1 ? 0x555566 : 0x3a3a48);
  },
  pens(g) {
    for (const [x, c] of [[4, 0x29b6f6], [6, 0xff2e88], [8, 0x5fdc4a]]) for (let y = 13; y <= 16; y++) pf(g, x, y, y === 16 ? shade(c, 0.3) : c);
  },
  scarf(g, metal, def, a) {
    const c = a.color ?? 0xff4f4f, d = shade(c, -0.14);
    for (let x = -14; x <= 13; x++) for (let z = -10; z <= 9; z++) for (let y = 17; y <= 21; y++) {
      const r = ((x + 0.5) / 12.5) ** 2 + ((z + 0.5) / 9) ** 2;
      if (r <= 1 && r >= 0.42) g.set(x, y, z, (x + y * 2 + 40) % 6 < 3 ? c : d);
    }
    for (let y = 4; y <= 17; y++) for (let x = -10; x <= -6; x++) pf(g, x + (y < 10 ? 1 : 0), y, y <= 5 ? (x & 1 ? shade(c, 0.2) : d) : (y + 40) % 6 < 3 ? c : d);
  },
  neckphones(g, metal, def, a) {
    const c = a.color ?? 0x2a2a36, acc = a.accent ?? def.accent ?? 0xff2e88;
    for (const s of [-1, 1]) {
      const x = s < 0 ? -11 : 10;
      blob(g, x, 19, 2, 2.4, 3.8, 3.8, c);
      blob(g, x, 19, 5.5, 1.8, 2.6, 1.2, acc);
    }
    for (let x = -11; x <= 10; x++) { const u = (x + 0.5) / 11; g.set(x, 20 + Math.round(Math.sqrt(Math.max(0, 1 - u * u)) * 1.5), -9, c); }
  },
  medal(g, metal, def, a) {
    for (let y = 9; y <= 19; y++) { pf(g, -6 + Math.round((19 - y) * 0.4), y, 0x29b6f6); pf(g, 5 - Math.round((19 - y) * 0.4), y, 0xff2e88); }
    for (let x = -4; x <= 3; x++) for (let y = 2; y <= 8; y++) if (Math.hypot(x + 0.5, y - 5) <= 3.8) pf(metal, x, y, Math.hypot(x + 0.5, y - 5) > 2.8 ? shade(a.color ?? 0xffd23f, -0.2) : a.color ?? 0xffd23f, false, g);
  },

  // ----- forearm (radius ~3.3 round (-0.5, -0.5), wrist at y = -8)
  watch(g, metal, def, a, side) {
    const band = a.color ?? 0x22222a;
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) for (let y = -6; y <= -4; y++) {
      const d = Math.hypot(x + 1, z + 1);
      if (d <= 4.2 && d >= 2.9) g.set(x, y, z, y === -5 ? shade(band, 0.12) : band);
    }
    const ox = side < 0 ? -5 : 4;
    for (let y = -7; y <= -3; y++) for (let z = -3; z <= 2; z++) if (!((y === -7 || y === -3) && (z === -3 || z === 2))) metal.set(ox + (side < 0 ? -1 : 1), y, z, a.bezel ?? 0xd8dce4);
    for (let y = -6; y <= -4; y++) for (let z = -2; z <= 1; z++) g.set(ox + (side < 0 ? -2 : 2), y, z, y === -4 && z === 1 ? 0xffffff : a.screen ?? 0x2f6f86, true);
  },
  wristband(g, metal, def, a) {
    const c = a.color ?? def.accent ?? 0xffffff;
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) for (let y = -8; y <= -5; y++) {
      const d = Math.hypot(x + 1, z + 1);
      if (d <= 4.2 && d >= 2.5) g.set(x, y, z, y === -8 || y === -5 ? shade(c, -0.12) : (x + z) & 1 ? c : shade(c, -0.04));
    }
  },
  armband(g, metal, def, a) {
    const c = a.color ?? 0xffd23f;
    for (let x = -6; x <= 5; x++) for (let z = -6; z <= 5; z++) for (let y = -6; y <= -4; y++) {
      const d = Math.hypot(x + 1, z + 1);
      if (d <= 4.6 && d >= 2.8) g.set(x, y, z, y === -5 ? c : shade(c, -0.14));
    }
  },

  // ----- hand items (hand grid at the wrist, fingers down -y, thumb towards +z)
  clipboard(g, metal, def, a, side) {
    const x = side < 0 ? -4 : 3;
    for (let y = -20; y <= -2; y++) for (let z = -6; z <= 8; z++) g.set(x, y, z, (y === -20 || z === -6 || z === 8) ? 0x7a5028 : 0x9a6a3a);
    const px = x + (side < 0 ? -1 : 1);
    for (let y = -19; y <= -5; y++) for (let z = -5; z <= 7; z++) g.set(px, y, z, (y === -9 || y === -12 || y === -15) && z < 5 ? 0x9aa6c0 : y === -7 && z < 2 ? 0xff4f4f : 0xffffff);
    for (let z = -1; z <= 3; z++) for (let y = -4; y <= -2; y++) metal.set(px, y, z, y === -2 ? 0xa0a4ac : 0xd0d4dc);
  },
  phone(g, metal, def, a) {
    rbox(g, -2, -12, 1, 0, -3, 6, 1, 0x1a1a22);
    for (let y = -11; y <= -4; y++) for (let z = 2; z <= 5; z++) g.set(-1 + (z > 0 ? 0 : 0), y, 7, y === -4 ? 0x14141c : (y + z) % 5 === 0 ? 0x4f9fc6 : a.screen ?? 0x2f6f86, y !== -4);
  },
  mic(g, metal, def, a) {
    capsule(g, [-0.5, -4, 3], [-0.5, -2, 12], 1.5, 1.9, 0x22222a);
    blob(metal, -0.5, -1.6, 15, 3.1, 3.1, 3.1, (x, y, z) => ((x + y + z) & 1 ? 0xc8ccd8 : 0x9aa0b0));
    for (let z = 10; z <= 11; z++) for (let x = -2; x <= 1; x++) g.set(x, -2, z, 0xff2e88);
  },
  whisk(g, metal, def, a) {
    capsule(g, [-0.5, -4, 3], [-0.5, -2, 10], 1.4, 1.4, 0x9a6a3a);
    for (let i = 0; i < 5; i++) capsule(metal, [-0.5, -2, 10], [-0.5 + (i - 2) * 1.6, -1 + (i % 2) * 1.5, 20], 0.5, 0.5, 0xd8dce4);
    blob(metal, -0.5, -0.5, 20, 3.4, 1.4, 1.4, 0xd8dce4, { hollow: 1 });
  },
};

/** Draw accessory `a` into a joint grid. */
export function buildAccessory(a, slot, g, metal, def, side = 1) {
  const fn = B[a.type];
  if (!fn) return;
  fn(g, metal, def, a, side);
}
