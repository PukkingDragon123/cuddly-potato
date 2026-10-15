// Hi-res voxel builders for the chibi human characters (Jimmy, Nolan, Juan, the
// Recruit, NPCs and Commander outfits).
//
// Characters are modelled at H = 0.05 world units per voxel (twice the density
// of the original chibis) with the same overall proportions, so seats, speech
// bubbles and hit boxes line up exactly as before:
//
//   head   x -10..9, y 0..19, z -8..9  (front face at z = 10 -> 0.5 world)
//   torso  x  -6..5, y 0..9,  z -4..3  (hips at the torso origin)
//   arm    upper 4 + forearm 4 + hand ~4 voxels, shoulder at (+-8, 9)
//   leg    thigh 4 + shin/shoe 4 voxels, hip at (+-3, 0)
//
// Every builder returns { g: VoxGrid, metal?: VoxGrid } in the local space of
// its joint (pivot = the joint at the origin). `metal` voxels are rendered with
// a shiny metal material (chains, crowns, buckles, watch bezels).
import { VoxGrid } from '../../core/voxel.js';
import { shade, mixHex, hash3 } from '../../core/util.js';
import { blob, rbox, capsule, cyl, stamp } from '../kit.js';
import { buildAccessory, accSlot } from './accessories.js';

export const H = 0.05;
export const HEAD = { x0: -10, x1: 9, y0: 0, y1: 19, z0: -8, z1: 9, r: 4 };

/** Inside a rounded box (same test as kit.rbox). */
export function inRB(x, y, z, x0, y0, z0, x1, y1, z1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1 || z < z0 || z > z1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r)), dz = Math.max(z0 + r - z, 0, z - (z1 - r));
  return dx * dx + dy * dy + dz * dz <= (r + 0.35) * (r + 0.35);
}
export const inHead = (x, y, z, t = 0) => inRB(x, y, z, HEAD.x0 - t, HEAD.y0 - (t ? 1 : 0), HEAD.z0 - t, HEAD.x1 + t, HEAD.y1 + t, HEAD.z1 + t, HEAD.r + t);

/** Hair layer of thickness t around the skull where mask(x,y,z) is true. */
function shell(g, t, mask, col) {
  for (let x = HEAD.x0 - t; x <= HEAD.x1 + t; x++)
    for (let y = HEAD.y0; y <= HEAD.y1 + t; y++)
      for (let z = HEAD.z0 - t; z <= HEAD.z1 + t; z++) {
        if (!inHead(x, y, z, t) || inHead(x, y, z, 0)) continue;
        if (mask && !mask(x, y, z)) continue;
        g.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
      }
}

/** Strand-textured hair colour with a glossy top highlight. */
function hairCol(base, seed = 0) {
  const dk = shade(base, -0.16), dk2 = shade(base, -0.28), lt = shade(base, 0.12), hi = shade(base, 0.24);
  return (x, y, z) => {
    const s = hash3(x * 3 + seed, (y >> 2) + seed, z * 5 - seed);
    let c = s < 0.22 ? dk : s > 0.88 ? lt : base;
    if (y <= 13 && s < 0.4) c = dk2;
    if (y >= 20 && z >= 1 && z <= 6 && Math.abs(x + 0.5) < 7 && s > 0.35) c = hi;
    return c;
  };
}

const SKIN = 0xf1c3a0;

// ---------------------------------------------------------------------------
// Head

export function buildHead(def) {
  const g = new VoxGrid();
  const skin = def.skin ?? SKIN;
  const skinD = shade(skin, -0.1);
  rbox(g, HEAD.x0, HEAD.y0, HEAD.z0, HEAD.x1, HEAD.y1, HEAD.z1, HEAD.r, skin);
  // soft vertical shading: chin a touch darker, forehead brighter
  g.paint((x, y, z, c) => (y <= 2 ? shade(c, -0.05) : y >= 14 ? shade(c, 0.03) : undefined));
  // ears
  for (const s of [-1, 1]) {
    const ex = s < 0 ? HEAD.x0 - 1 : HEAD.x1 + 1;
    rbox(g, ex, 7, -1, ex, 11, 2, 0, skinD);
    g.set(ex + s, 8, 0, skinD); g.set(ex + s, 9, 0, skinD); g.set(ex + s, 10, 0, skinD); g.set(ex + s, 9, 1, skinD);
    g.set(ex, 9, 1, shade(skin, -0.24)); g.set(ex, 8, 1, shade(skin, -0.2));
  }
  // nose (a little button between eyes and mouth)
  g.set(-1, 8, HEAD.z1 + 1, shade(skin, 0.02)); g.set(0, 8, HEAD.z1 + 1, shade(skin, 0.02));

  buildHair(g, def);
  if (def.beard) buildBeard(g, def);
  const metal = new VoxGrid();
  for (const a of def._acc ?? []) if (accSlot(a) === 'head') buildAccessory(a, 'head', g, metal, def);
  return { g, metal };
}

function buildHair(g, def) {
  const style = def.hair?.style ?? 'short';
  const base = def.hair?.color ?? 0x4a2f1c;
  const col = hairCol(base, style.length);
  const hz = HEAD.z1; // 9 = front face voxel row
  switch (style) {
    case 'jimmy': {
      // short sides, fuller top with a swept-up front quiff
      shell(g, 1, (x, y, z) => (y >= 12 && z <= 6) || (y >= 16) || (z < -2 && y >= 7), col);
      shell(g, 2, (x, y, z) => y >= 17 && z <= 7, col);
      blob(g, -1, 20, 6, 8, 2.6, 4, col, { p: 2.4 });
      blob(g, -2.5, 21.5, 4, 6, 2.2, 4, col, { p: 2.4 });
      blob(g, -1, 21.5, 8, 5, 1.6, 2, col);
      // forehead hairline
      for (let x = -9; x <= 8; x++) { g.set(x, 18, hz + 1, col(x, 18, hz + 1)); if (x < -3 || x > 5) g.set(x, 17, hz + 1, col(x, 17, hz + 1)); }
      // side part groove
      for (let z = -4; z <= 9; z++) if (g.has(-5, 21, z)) g.set(-5, 21, z, shade(base, -0.3));
      // faded sideburns
      for (const x of [HEAD.x0 - 1, HEAD.x1 + 1]) for (let y = 9; y <= 13; y++) for (let z = 2; z <= 5; z++) if (!g.has(x, y, z) || y > 11) g.set(x, y, z, mixHex(base, def.skin ?? SKIN, (13 - y) * 0.08));
      break;
    }
    case 'messy': {
      shell(g, 1, (x, y, z) => (y >= 11 && z <= 6) || y >= 17 || (z < -1 && y >= 6), col);
      shell(g, 2, (x, y, z) => (y >= 15 && z <= 6) || y >= 18, col);
      const tufts = [[-6, 21, 2, -10, 25, -1], [-1, 22, 3, 1, 26, 0], [4, 21, 1, 9, 24, -2], [-3, 21, -3, -6, 24, -8], [3, 20, -4, 6, 23, -9], [-8, 18, -5, -12, 20, -8], [7, 17, -5, 11, 19, -8], [0, 21, 6, 2, 24, 9]];
      for (const [ax, ay, az, bx, by, bz] of tufts) capsule(g, [ax, ay, az], [bx, by, bz], 2.2, 0.6, col);
      // messy fringe locks over the forehead
      for (const [x, len] of [[-8, 3], [-5, 4], [-2, 3], [1, 4], [4, 3], [7, 2]]) {
        for (let i = 0; i < len; i++) { g.set(x, 19 - i, hz + 1, col(x, 19 - i, hz + 1)); g.set(x + 1, 19 - i, hz + 1, col(x + 1, 19 - i, hz + 1)); if (i < len - 1) g.set(x + 2, 19 - i, hz + 1, col(x + 2, 19 - i, hz + 1)); }
      }
      for (let x = -10; x <= 9; x++) g.set(x, 19, hz + 1, col(x, 19, hz + 1));
      break;
    }
    case 'undercut': {
      // shaved fade on the sides/back (painted onto the skull) + a thick slicked top
      const fade = mixHex(base, def.skin ?? SKIN, 0.55);
      g.paint((x, y, z, c) => {
        if (y < 7 || y > 15) return undefined;
        const side = x <= HEAD.x0 + 1 || x >= HEAD.x1 - 1 || z <= HEAD.z0 + 1;
        if (!side) return undefined;
        if (z >= 6 && y < 13) return undefined;
        return hash3(x, y, z) < 0.5 ? fade : shade(fade, -0.06);
      });
      shell(g, 3, (x, y, z) => y >= 15 && (y >= 17 || z <= 6) && x >= -9 && x <= 8, (x, y, z) => {
        const c = col(x, y, z);
        return (x + 20) % 3 === 0 && y >= 19 ? shade(c, -0.15) : c;
      });
      blob(g, -0.5, 20.5, 7.5, 8.5, 3, 3.5, col, { p: 3 });
      for (let x = -8; x <= 7; x++) g.set(x, 18, hz + 1, col(x, 18, hz + 1));
      // part line
      for (let z = -9; z <= 10; z++) if (g.has(4, 22, z)) g.del(4, 22, z);
      break;
    }
    case 'spiky': {
      shell(g, 1, (x, y, z) => (y >= 12 && z <= 6) || y >= 17 || (z < -1 && y >= 7), col);
      const spikes = [
        [-6, 20, 4, -10, 27, 7], [-1, 21, 4, -1, 29, 8], [4, 20, 4, 8, 27, 7],
        [-7, 20, -2, -12, 26, -3], [0, 21, -1, 1, 29, -3], [6, 20, -2, 11, 26, -3],
        [-4, 18, -6, -6, 23, -12], [3, 18, -6, 5, 23, -12], [-9, 15, -3, -14, 18, -5], [8, 15, -3, 13, 18, -5],
      ];
      for (const [ax, ay, az, bx, by, bz] of spikes) capsule(g, [ax, ay, az], [bx, by, bz], 2.6, 0.3, col);
      // front bangs pointing down over the forehead
      for (const [x, d] of [[-7, 4], [-3, 5], [1, 4], [5, 3]]) capsule(g, [x, 20, hz], [x + 0.5, 20 - d, hz + 1], 1.6, 0.3, col);
      break;
    }
    case 'bob': {
      shell(g, 2, (x, y, z) => y >= 4 && (y >= 16 || x <= HEAD.x0 + 1 || x >= HEAD.x1 - 1 || z <= 1), col);
      // straight-cut bangs
      for (let x = -10; x <= 9; x++) for (let y = 15; y <= 20; y++) { g.set(x, y, hz + 1, col(x, y, hz + 1)); if (y >= 17) g.set(x, y, hz + 2, col(x, y, hz + 2)); }
      // curl at the bottom of the bob
      for (const x of [HEAD.x0 - 3, HEAD.x1 + 3]) for (let z = -9; z <= 6; z++) { g.set(x, 4, z, shade(base, -0.1)); g.set(x, 5, z, col(x, 5, z)); }
      break;
    }
    case 'ponytail': {
      shell(g, 1, (x, y, z) => (y >= 12 && z <= 6) || y >= 17 || (z < 0 && y >= 8), col);
      for (let x = -9; x <= 8; x++) g.set(x, 18, hz + 1, col(x, 18, hz + 1));
      for (const x of [-9, -8, 7, 8]) for (let y = 12; y <= 17; y++) g.set(x, y, hz + 1, col(x, y, hz + 1));
      capsule(g, [-0.5, 14, HEAD.z0 - 2], [-0.5, 9, HEAD.z0 - 6], 2.6, 2.2, col);
      capsule(g, [-0.5, 9, HEAD.z0 - 6], [-0.5, 3, HEAD.z0 - 5], 2.2, 1, col);
      rbox(g, -3, 13, HEAD.z0 - 3, 2, 15, HEAD.z0 - 2, 0, def.hair?.tie ?? 0xff2e88);
      break;
    }
    case 'buzz': {
      const bz = (x, y, z) => (hash3(x, y, z) < 0.45 ? mixHex(base, def.skin ?? SKIN, 0.35) : base);
      shell(g, 1, (x, y, z) => (y >= 14 && z <= 8) || (z < -2 && y >= 8) || ((x < HEAD.x0 + 1 || x > HEAD.x1 - 1) && y >= 11), bz);
      break;
    }
    case 'curly': {
      shell(g, 1, (x, y, z) => (y >= 11 && z <= 6) || y >= 17 || (z < -1 && y >= 6), col);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 * 3.1, r = 7 + (i % 3);
        blob(g, -0.5 + Math.cos(a) * r, 18 + (i % 4) * 1.4, Math.sin(a) * r - 1, 3, 3, 3, col);
      }
      break;
    }
    case 'bald':
      g.set(-3, 20, 3, shade(def.skin ?? SKIN, 0.18)); g.set(-2, 20, 3, shade(def.skin ?? SKIN, 0.18));
      break;
    default: {
      // short: side-swept fringe
      shell(g, 1, (x, y, z) => (y >= 12 && z <= 6) || y >= 17 || (z < -1 && y >= 7), col);
      shell(g, 2, (x, y, z) => y >= 17 && z <= 6, col);
      blob(g, -3, 19, 8, 7, 2, 2.5, col);
      for (let x = -10; x <= 2; x++) g.set(x, 17 - Math.max(0, Math.floor((x + 10) / 5)) + 1, hz + 1, col(x, 17, hz + 1));
      for (let x = -10; x <= 9; x++) g.set(x, 19, hz + 1, col(x, 19, hz + 1));
    }
  }
}

function buildBeard(g, def) {
  const b = typeof def.beard === 'number' ? def.beard : def.hair?.color ?? 0x4a2f1c;
  const col = hairCol(b, 7);
  const style = def.beardStyle ?? 'full';
  const fz = HEAD.z1;
  if (style === 'stubble') {
    g.paint((x, y, z, c) => (y <= 6 && z >= 0 && hash3(x, y, z) < 0.5 ? mixHex(c, b, 0.4) : undefined));
    return;
  }
  if (style === 'chin') {
    // goatee + thin chinstrap
    g.paint((x, y, z, c) => {
      if (y <= 2 && z >= fz - 1 && Math.abs(x + 0.5) <= 4) return col(x, y, z);
      if (y <= 9 && (x <= HEAD.x0 || x >= HEAD.x1) && z >= 2 && y >= 4) return col(x, y, z);
      if (y <= 3 && (x <= HEAD.x0 + 2 || x >= HEAD.x1 - 2) && z >= 2) return col(x, y, z);
      if (y === 0 && z >= 2) return col(x, y, z);
      return undefined;
    });
    rbox(g, -4, -2, fz - 3, 3, 1, fz + 1, 1, col);
    for (let x = -4; x <= 3; x++) g.set(x, 7, fz, col(x, 7, fz)); // mustache line
    return;
  }
  // full beard (Jimmy): sideburns into a jaw beard, chin bulk and a mustache
  g.paint((x, y, z, c) => {
    if (y > 12) return undefined;
    if ((x <= HEAD.x0 + 1 || x >= HEAD.x1 - 1) && z >= 1 && y <= 12) return col(x, y, z);
    if (z >= fz - 1 && y <= 6 && Math.abs(x + 0.5) >= 6.5) return col(x, y, z);
    if (z >= fz - 1 && y <= 2) return col(x, y, z);
    if (y <= 1 && z >= -2) return col(x, y, z);
    return undefined;
  });
  shell(g, 1, (x, y, z) => y <= 11 && z >= 1 && (x <= HEAD.x0 + 1 || x >= HEAD.x1 - 1 || y <= 2), col);
  blob(g, -0.5, 0.5, 5.5, 7.5, 2, 4, col, { p: 2.6 });
  blob(g, -0.5, 1, 9, 4.5, 1.6, 1.2, col);
  // mustache: flush on the face with drooping corners
  for (let x = -5; x <= 4; x++) g.set(x, 7, fz, col(x, 7, fz));
  for (const x of [-6, -5, 4, 5]) g.set(x, 6, fz, col(x, 6, fz));
  for (const x of [-6, 5]) g.set(x, 5, fz, col(x, 5, fz));
  // keep the mouth area clear (the face texture draws the mouth there)
  for (let x = -4; x <= 3; x++) for (let y = 3; y <= 6; y++) if (g.get(x, y, fz) !== undefined && y < 7) g.set(x, y, fz, def.skin ?? SKIN);
  for (let x = -4; x <= 3; x++) for (let y = 3; y <= 6; y++) g.del(x, y, fz + 1);
}

// ---------------------------------------------------------------------------
// Torso + outfits

const PIX = {
  bolt: ['..##', '.##.', '####', '.##.', '##..'],
  panther: ['#....#', '##..##', '######', '#o##o#', '.####.', '..##..'],
  beast: ['#.#.#', '#####', '#o#o#', '.###.'],
};
const DIGITS = {
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['###', '..#', '###', '#..', '###'],
  3: ['###', '..#', '.##', '..#', '###'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '###', '..#', '###'],
  6: ['###', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '###'],
};
function numberArt(n) {
  const s = String(n);
  const rows = ['', '', '', '', ''];
  for (const ch of s) for (let r = 0; r < 5; r++) rows[r] += (rows[r] ? '.' : '') + (DIGITS[ch] ?? DIGITS[0])[r];
  return rows;
}

/** Stamp a logo onto the front (axis 'z') or back ('-z') of a grid, centred on x. */
export function logo(g, kind, cx, ty, axis = 'z', o = {}) {
  const art = PIX[kind] ?? numberArt(kind);
  const w = art[0].length;
  const pal = kind === 'bolt' ? { '#': o.c ?? 0xff2e88 } : kind === 'panther' ? { '#': o.c ?? 0x29b6f6, o: o.c2 ?? 0xff2e88 } : kind === 'beast' ? { '#': o.c ?? 0x29b6f6, o: 0xffffff } : { '#': o.c ?? 0xffffff };
  stamp(g, art, pal, { axis, x: Math.round(cx - w / 2), y: ty, raise: o.raise ?? 0 });
}

export function buildBody(def) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const outfit = def.outfit ?? 'tee';
  const shirt = def.shirt ?? 0x222233;
  const skin = def.skin ?? SKIN;
  const accent = def.accent ?? 0xffffff;
  const coat = def.coat ?? 0xf4f6fb;
  const main = outfit === 'labcoat' ? coat : shirt;
  // torso: rounded with a softer chest/back
  rbox(g, -6, 0, -4, 5, 9, 3, 2, main);
  g.set(-1, 10, 0, skin); g.set(0, 10, 0, skin);
  // fabric shading: darker towards the hem, fold lines
  g.paint((x, y, z, c) => {
    let f = y <= 1 ? -0.07 : y >= 8 ? 0.04 : 0;
    if ((x === -6 || x === 5) && hash3(x, y, z) < 0.5) f -= 0.05; // side seams
    if (z === 3 && y >= 2 && y <= 6 && (x === -4 || x === 3) && hash3(x, y, 1) < 0.55) f -= 0.05; // folds
    return f ? shade(c, f) : undefined;
  });
  const front = 3;
  const F = front + 1; // raised layer
  switch (outfit) {
    case 'labcoat': {
      // open front showing the shirt, V-neck, lapels, buttons, pockets, pen
      g.paint((x, y, z, c) => {
        const half = 1.5 + Math.max(0, y - 5) * 0.75;
        if (z >= front - 1 && Math.abs(x + 0.5) <= half) return shirt;
        return undefined;
      });
      for (let y = 5; y <= 9; y++) {
        const half = Math.ceil(1.5 + (y - 5) * 0.75);
        for (const s of [-1, 1]) {
          const x = s < 0 ? -1 - half : half;
          g.set(x, y, F, shade(coat, -0.08)); g.set(x + s, y, F, shade(coat, -0.04));
        }
      }
      for (let y = 0; y <= 4; y++) { g.set(-3, y, F, shade(coat, -0.1)); g.set(2, y, F, shade(coat, -0.1)); }
      for (const y of [1, 3]) metal.set(3, y, F, 0xd0d4dc);
      // pockets
      const pk = shade(coat, -0.12);
      for (let x = -6; x <= -4; x++) { g.set(x, 4, F, pk); }
      for (let x = 3; x <= 5; x++) { g.set(x, 4, F, pk); }
      for (let x = -6; x <= -4; x++) g.set(x, 1, F, pk);
      // chest pocket + pens
      for (let x = 2; x <= 4; x++) g.set(x, 6, F, pk);
      g.set(3, 7, F, def.accent ?? 0x29b6f6); g.set(3, 8, F, def.accent ?? 0x29b6f6);
      g.set(4, 7, F, 0xff2e88);
      // collar
      for (let x = -6; x <= 5; x++) for (let z = -4; z <= 0; z++) g.set(x, 9, z, shade(coat, -0.06));
      // back seam
      for (let y = 0; y <= 8; y++) g.set(-1, y, -4, shade(coat, -0.05));
      break;
    }
    case 'hoodie': {
      const d = shade(shirt, -0.12), dd = shade(shirt, -0.22);
      // ribbed hem
      g.paint((x, y, z, c) => (y <= 1 ? (x & 1 ? d : shade(shirt, -0.06)) : undefined));
      // kangaroo pocket (raised) with dark openings
      for (let x = -4; x <= 3; x++) for (let y = 1; y <= 4; y++) g.set(x, y, F, y === 4 || x === -4 || x === 3 ? shade(shirt, -0.05) : shirt);
      for (let y = 1; y <= 3; y++) { g.set(-4, y, F, dd); g.set(3, y, F, dd); }
      // hood bunched behind the neck + around the collar
      rbox(g, -6, 7, -8, 5, 11, -3, 2, d);
      rbox(g, -4, 8, -7, 3, 10, -5, 1, dd);
      for (let x = -6; x <= 5; x++) { g.set(x, 10, -3, d); g.set(x, 10, -2, d); }
      for (const x of [-6, 5]) for (let z = -3; z <= 2; z++) g.set(x, 10, z, d);
      // drawstrings with aglets
      for (let y = 5; y <= 9; y++) { g.set(-3, y, F, 0xffffff); g.set(2, y, F, 0xffffff); }
      g.set(-3, 4, F, def.accent ?? 0x29b6f6); g.set(2, 4, F, def.accent ?? 0x29b6f6);
      break;
    }
    case 'jersey': {
      // V collar, shoulder stripes, side panels and a number front & back
      for (let y = 7; y <= 9; y++) { const half = (y - 7) + 1; for (let x = -1 - half; x <= half; x++) g.set(x, y, front, Math.abs(x + 0.5) >= half - 0.5 ? accent : skin); }
      for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) if (g.has(x, 9, z) && Math.abs(x + 0.5) > 3) g.set(x, 9, z, accent);
      g.paint((x, y, z, c) => ((x === -6 || x === 5) && y <= 7 ? accent : undefined));
      g.paint((x, y, z, c) => (y === 0 ? shade(shirt, -0.12) : undefined));
      logo(g, def.number ?? 10, -0.5, 6, 'z', { c: accent });
      logo(g, def.number ?? 10, -0.5, 7, '-z', { c: accent });
      break;
    }
    case 'apron': {
      const ap = accent;
      for (let x = -4; x <= 3; x++) for (let y = 0; y <= 7; y++) g.set(x, y, F, y >= 6 && Math.abs(x + 0.5) > 3 ? undefined : ap);
      for (let x = -3; x <= 2; x++) g.set(x, 2, F + 1, shade(ap, -0.1));
      for (let x = -3; x <= 2; x++) g.set(x, 1, F + 1, shade(ap, -0.04));
      g.set(0, 2, F + 1, shade(ap, -0.25));
      // neck strap
      for (let y = 8; y <= 9; y++) { g.set(-3, y, F, ap); g.set(2, y, F, ap); }
      for (let x = -3; x <= 2; x++) g.set(x, 9, -1, shade(ap, -0.1));
      // waist ties + bow at the back
      for (let z = -4; z <= 3; z++) { g.set(-7, 3, z, shade(ap, -0.08)); g.set(6, 3, z, shade(ap, -0.08)); }
      for (let x = -7; x <= 6; x++) g.set(x, 3, -5, shade(ap, -0.08));
      blob(g, -2.5, 3, -6, 1.2, 1, 0.5, shade(ap, -0.04)); blob(g, 1.5, 3, -6, 1.2, 1, 0.5, shade(ap, -0.04));
      // collar of the tee under the apron
      for (let x = -3; x <= 2; x++) g.set(x, 9, front, shade(shirt, -0.15));
      break;
    }
    case 'suit': {
      // white shirt V, tie, lapels, buttons and a pocket square
      for (let y = 4; y <= 9; y++) { const half = 0.5 + (y - 4) * 0.6; for (let x = -6; x <= 5; x++) if (Math.abs(x + 0.5) <= half) g.set(x, y, front, 0xffffff); }
      for (let y = 3; y <= 9; y++) { g.set(-1, y, F, accent); g.set(0, y, F, y >= 8 ? shade(accent, -0.15) : accent); }
      g.set(-1, 2, F, shade(accent, -0.2)); g.set(0, 2, F, shade(accent, -0.2));
      for (let y = 4; y <= 9; y++) { const half = Math.ceil(0.5 + (y - 4) * 0.6) + 1; g.set(-1 - half, y, F, shade(shirt, 0.12)); g.set(half, y, F, shade(shirt, 0.12)); }
      for (const y of [1, 3]) metal.set(-1, y, F, 0xc8ccd8);
      g.set(3, 6, F, 0xffffff); g.set(4, 6, F, accent);
      // belt
      for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) if (g.has(x, 0, z)) g.set(x, 0, z, 0x1a1a22);
      metal.set(-1, 0, F, 0xffd23f); metal.set(0, 0, F, 0xffd23f);
      break;
    }
    case 'vest': {
      // utility vest over a tee: pockets, zip, reflective stripes
      for (let x = -6; x <= 5; x++) for (let y = 0; y <= 8; y++) if (Math.abs(x + 0.5) > 1) g.set(x, y, front, accent);
      g.paint((x, y, z, c) => (y >= 2 && y <= 3 && c === accent ? 0xe8e8e8 : undefined));
      break;
    }
    case 'mech': {
      // armoured space exosuit: chest plate, power core, bolt, segmented abs, collar ring, back plate
      const A = def.coat ?? 0xeef2f8, Ad = shade(A, -0.16), Ae = shade(A, -0.34);
      const glow = def.glow ?? 0x3fd2ee;
      rbox(g, -6, 3, 0, 5, 9, 4, 1, (x, y, z) => (y === 3 ? Ad : x === -6 || x === 5 ? shade(A, -0.06) : A));
      for (let y = 4; y <= 8; y++) { g.set(-6, y, 3, accent); g.set(5, y, 3, accent); }
      for (let x = -4; x <= 3; x++) g.set(x, 9, 4, Ad); // plate top edge
      // power core
      for (let x = -3; x <= 2; x++) for (let y = 3; y <= 6; y++) {
        const edge = x === -3 || x === 2 || y === 3 || y === 6;
        if (edge) g.set(x, y, 5, Ae);
      }
      for (let x = -2; x <= 1; x++) for (let y = 4; y <= 5; y++) g.set(x, y, 5, (x === -2 || x === 1) ? shade(glow, -0.35) : glow, x !== -2 && x !== 1);
      logo(g, 'bolt', -0.5, 9, 'z', { c: accent, raise: 1 });
      // segmented abs + belt
      for (let y = 0; y <= 2; y++) for (let x = -4; x <= 3; x++) g.set(x, y, 4, y === 0 ? Ae : (y + (x > -1 ? 1 : 0)) % 2 ? A : Ad);
      for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) if (g.has(x, 0, z) && (x === -6 || x === 5 || z === -4)) g.set(x, 0, z, Ae);
      metal.set(-1, 0, 5, 0xc8d0dc); metal.set(0, 0, 5, 0xc8d0dc);
      // collar ring
      for (let x = -5; x <= 4; x++) for (let z = -4; z <= 3; z++) if (x === -5 || x === 4 || z === -4 || z === 3) metal.set(x, 10, z, (x + z) % 3 ? 0xaab4c4 : 0x7a8496);
      // back plate with vents
      rbox(g, -5, 2, -5, 4, 9, -5, 0, A);
      for (let y = 4; y <= 7; y += 3) for (let x = -3; x <= 2; x++) g.set(x, y, -6, Ae);
      break;
    }
    default: {
      // tee: ringed collar, hem, belt line
      for (let x = -3; x <= 2; x++) g.set(x, 9, front, shade(shirt, -0.18));
      g.set(-4, 9, front - 1, shade(shirt, -0.18)); g.set(3, 9, front - 1, shade(shirt, -0.18));
      g.paint((x, y, z, c) => (y === 0 ? def.pants ?? 0x2b3448 : undefined));
      for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) if (g.has(x, 0, z) && (z === 3 || z === -4 || x === -6 || x === 5)) g.set(x, 0, z, 0x2a2018);
      metal.set(-1, 0, F, 0xd8dce4); metal.set(0, 0, F, 0xd8dce4);
    }
  }
  if (def.logo && outfit !== 'mech') {
    const big = outfit === 'hoodie' || outfit === 'tee';
    if (outfit === 'labcoat') logo(g, def.logo, -4.5, 8, 'z', { raise: 1 });
    else if (big) logo(g, def.logo, -0.5, 8, 'z', { raise: 0 });
    else if (outfit !== 'jersey') logo(g, def.logo, 3.5, 8, 'z', { raise: 0 });
  }
  for (const a of def._acc ?? []) if (accSlot(a) === 'torso') buildAccessory(a, 'torso', g, metal, def);
  return { g, metal };
}

/** Coat tails / skirt hanging from the waist (pivot at the torso origin). */
export function buildTail(def) {
  const outfit = def.outfit ?? 'tee';
  const g = new VoxGrid();
  if (outfit === 'labcoat') {
    const coat = def.coat ?? 0xf4f6fb;
    for (let y = -6; y <= 1; y++) {
      const flare = y < -2 ? 1 : 0;
      for (let x = -6 - flare; x <= 5 + flare; x++)
        for (let z = -4 - flare; z <= 3 + flare; z++) {
          const edge = x === -6 - flare || x === 5 + flare || z === -4 - flare || z === 3 + flare;
          if (!edge) continue;
          if (z >= 3 && Math.abs(x + 0.5) <= 1.5 + (1 - y) * 0.25) continue; // open front
          let c = y <= -6 ? shade(coat, -0.12) : coat;
          if (z === -4 - flare && x === -1) c = shade(coat, -0.08); // back vent
          if (y <= -2 && hash3(x, 0, z) < 0.18) c = shade(c, -0.06);
          g.set(x, y, z, c);
        }
    }
    // lower pockets
    for (let x = -6; x <= -4; x++) g.set(x, -1, 5, shade(coat, -0.12));
    for (let x = 3; x <= 5; x++) g.set(x, -1, 5, shade(coat, -0.12));
  }
  return g.size ? { g } : null;
}

/** Cape from the shoulders (pivot at the back of the neck). */
export function buildCape(def, a) {
  const g = new VoxGrid();
  const c = a.color ?? def.accent ?? 0xff2e88;
  const lining = a.lining ?? shade(c, -0.25);
  for (let y = -17; y <= 0; y++) {
    const w = 6 + Math.floor((-y) / 4);
    for (let x = -w; x <= w - 1; x++) {
      const wave = Math.round(Math.sin(x * 0.8) * 0.6);
      g.set(x, y, wave, y === -17 ? shade(c, -0.15) : c);
      g.set(x, y, wave + 1, lining);
    }
  }
  // collar
  for (let x = -6; x <= 5; x++) { g.set(x, 1, 1, shade(c, -0.1)); g.set(x, 1, 2, shade(c, -0.1)); }
  if (a.logo !== false) logo(g, 'bolt', -0.5, -5, '-z', { c: a.logoColor ?? 0xffd23f });
  return { g };
}

/** Backpack (torso back). */
export function buildBackpack(g, def, a) {
  const c = a.color ?? def.accent ?? 0xff2e88;
  rbox(g, -5, 1, -9, 4, 9, -5, 2, c);
  rbox(g, -4, 1, -10, 3, 5, -9, 1, shade(c, -0.12)); // front pocket
  for (let x = -4; x <= 3; x++) g.set(x, 6, -10, 0x333344); // zip
  g.set(3, 6, -11, 0xd0d4dc);
  logo(g, 'bolt', -0.5, 5, '-z', { c: a.logo ?? 0xffd23f });
  // straps over the shoulders
  for (const x of [-4, 3]) {
    for (let z = -5; z <= 3; z++) g.set(x, 10, z, 0x2a2a3a);
    for (let y = 3; y <= 9; y++) g.set(x, y, 4, 0x2a2a3a);
  }
  g.set(-1, 10, -7, shade(c, -0.2)); g.set(0, 10, -7, shade(c, -0.2)); // handle
}

// ---------------------------------------------------------------------------
// Arms / hands / legs

function sleeveInfo(def) {
  const o = def.outfit ?? 'tee';
  if (o === 'mech') return { color: def.shirt ?? 0x26304a, long: true, cuff: shade(def.coat ?? 0xeef2f8, -0.3), mech: true };
  if (o === 'labcoat') return { color: def.coat ?? 0xf4f6fb, long: true, cuff: shade(def.coat ?? 0xf4f6fb, -0.1) };
  if (o === 'hoodie') return { color: def.sleeve ?? def.shirt ?? 0x222233, long: true, cuff: shade(def.sleeve ?? def.shirt ?? 0x222233, -0.14) };
  if (o === 'suit') return { color: def.shirt ?? 0x222233, long: true, cuff: 0xffffff };
  if (o === 'jersey') return { color: def.shirt ?? 0x222233, long: false, trim: def.accent ?? 0xffffff };
  return { color: def.sleeve ?? def.shirt ?? 0x222233, long: !!def.longSleeves, trim: shade(def.sleeve ?? def.shirt ?? 0x222233, -0.15) };
}

export function buildUpperArm(def, side) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const sl = sleeveInfo(def);
  const skin = def.skin ?? SKIN;
  blob(g, -0.5, -1, -0.5, 2.1, 2, 2.1, sl.color, { p: 2.4 });
  rbox(g, -2, -4, -2, 1, -1, 1, 1, (x, y, z) => (sl.long || y >= -2 ? sl.color : skin));
  if (!sl.long) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (g.has(x, -2, z)) g.set(x, -2, z, sl.trim);
  // fold crease on the sleeve
  if (sl.long && !sl.mech) g.set(side < 0 ? -2 : 1, -3, 0, shade(sl.color, -0.08));
  if (sl.mech) {
    // shoulder pauldron + armour band
    const A = def.coat ?? 0xeef2f8;
    blob(g, -0.5 + side * 0.3, -0.3, -0.5, 2.9, 2.1, 2.8, (x, y) => (y <= -2 ? shade(A, -0.16) : A), { p: 2.6, clip: (x, y) => y < -2 });
    for (let z = -2; z <= 1; z++) g.set(side < 0 ? -4 : 3, 0, z, def.accent ?? 0xff2e88);
    for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (x === -2 || x === 1 || z === -2 || z === 1) g.set(x + (x < 0 ? -1 : 1) * 0, -4, z, shade(A, -0.1));
  }
  for (const a of def._acc ?? []) if (accSlot(a) === 'upper') buildAccessory(a, 'upper', g, metal, def, side);
  return { g, metal };
}

export function buildForearm(def, side) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const sl = sleeveInfo(def);
  const skin = def.skin ?? SKIN;
  rbox(g, -2, -4, -2, 1, 0, 1, 1, sl.long ? sl.color : skin);
  if (sl.long) for (let x = -2; x <= 1; x++) for (let z = -2; z <= 1; z++) if (g.has(x, -4, z) || inRB(x, -4, z, -2, -4, -2, 1, 0, 1, 1)) g.set(x, -4, z, sl.cuff);
  if (sl.mech) {
    const A = def.coat ?? 0xeef2f8;
    rbox(g, -3, -4, -3, 2, -1, 2, 1, (x, y) => (y === -4 ? shade(A, -0.3) : y === -1 ? shade(A, -0.12) : A));
    const ox = side < 0 ? -4 : 3;
    g.set(ox, -2, -1, def.glow ?? 0x3fd2ee, true); g.set(ox, -2, 0, def.glow ?? 0x3fd2ee, true);
    g.set(ox, -3, -1, shade(A, -0.3)); g.set(ox, -3, 0, shade(A, -0.3));
  }
  const me = side < 0 ? 'L' : 'R';
  for (const a of def._acc ?? []) {
    if (accSlot(a) !== 'fore') continue;
    const s = a.side ?? 'L';
    if (s === me || s === 'both') buildAccessory(a, 'fore', g, metal, def, side);
  }
  return { g, metal };
}

export const HAND_SHAPES = ['open', 'fist', 'point', 'thumb', 'peace'];

/** Hand at the wrist (palm faces inwards, thumb towards +z). */
export function buildHand(def, shape, side, item) {
  const g = new VoxGrid();
  const metal = new VoxGrid();
  const c = def.gloves ?? def.skin ?? SKIN;
  const d = shade(c, -0.1);
  if (shape === 'open') {
    rbox(g, -2, -3, -2, 1, 0, 1, 1, c);
    // four fingers (alternating shade reads as separate fingers), rounded tips
    for (let z = -2; z <= 1; z++) {
      const fc = z & 1 ? c : d;
      for (let y = -5; y <= -3; y++) {
        if (y === -5 && (z === -2 || z === 1)) continue;
        g.set(-1, y, z, fc);
        g.set(0, y, z, fc);
      }
    }
    capsule(g, [-0.5, -1.2, 1.4], [-0.5, -2.6, 3], 0.9, 0.8, c);
  } else {
    blob(g, -0.5, -2, -0.5, 2.1, 2.1, 2.1, c, { p: 2.6 });
    for (let x = -2; x <= 1; x++) g.set(x, -4, 1, d); // knuckles
    if (shape === 'fist') { g.set(-1, -2, 2, d); g.set(0, -2, 2, d); g.set(-1, -3, 2, c); g.set(0, -3, 2, c); }
    if (shape === 'point') capsule(g, [-0.5, -3.5, 0.6], [-0.5, -7, 0.8], 0.8, 0.7, c);
    if (shape === 'peace') { capsule(g, [-0.5, -3.5, 0.6], [-0.5, -7, 2], 0.7, 0.6, c); capsule(g, [-0.5, -3.5, -0.6], [-0.5, -7, -2], 0.7, 0.6, c); }
    if (shape === 'thumb') capsule(g, [-0.5, -1.5, 1.6], [-0.5, -1.2, 5], 0.9, 0.8, c);
    else { g.set(-1, -1, 2, c); g.set(0, -1, 2, c); }
  }
  if (item) buildAccessory(item, 'hand', g, metal, def, side);
  return { g, metal };
}

export function buildThigh(def) {
  const g = new VoxGrid();
  const pants = def.pants ?? 0x2b3448;
  rbox(g, -2, -4, -2, 1, 0, 1, 1, pants);
  g.paint((x, y, z, c) => (z === 1 && x === -1 && y === -2 ? shade(c, -0.08) : undefined));
  if (def.outfit === 'mech') rbox(g, -2, -3, 2, 1, -1, 2, 0, (x, y) => (y === -1 ? shade(def.coat ?? 0xeef2f8, -0.15) : def.coat ?? 0xeef2f8));
  return { g };
}

export function buildShin(def) {
  const g = new VoxGrid();
  const pants = def.pants ?? 0x2b3448;
  const skin = def.skin ?? SKIN;
  const shoe = def.shoes ?? 0xf2f2f2;
  const sole = def.sole ?? (shoe === 0xffffff || shoe === 0xf2f2f2 ? 0xd8dce4 : 0xf4f4f4);
  const lace = def.laces ?? (shoe === 0xffffff || shoe === 0xf2f2f2 ? 0x29b6f6 : 0xffffff);
  // shin
  rbox(g, -2, -2, -2, 1, 0, 1, 1, def.shorts ? skin : pants);
  for (let x = -2; x <= 1; x++) {
    for (let z = -2; z <= 1; z++) {
      if (def.shorts) { if (g.has(x, -2, z)) g.set(x, -2, z, def.socks ?? 0xffffff); }
      else if (g.has(x, -1, z) && (x === -2 || x === 1 || z === -2 || z === 1)) g.set(x, -1, z, shade(pants, -0.1));
    }
  }
  if (def.outfit === 'mech') {
    // armoured jet boots: knee pad, tall boot, toe cap, heel thruster
    const A = def.shoes ?? def.coat ?? 0xeef2f8, Ad = shade(A, -0.16), Ae = shade(A, -0.34);
    rbox(g, -2, -1, 1, 1, 0, 2, 0, def.coat ?? 0xeef2f8);
    g.set(-1, 0, 3, def.accent ?? 0xff2e88); g.set(0, 0, 3, def.accent ?? 0xff2e88);
    rbox(g, -2, -4, -3, 1, -2, 4, 1, A);
    for (let x = -2; x <= 1; x++) for (let z = -3; z <= 4; z++) if (g.has(x, -4, z)) g.set(x, -4, z, Ae);
    for (let x = -2; x <= 1; x++) { g.set(x, -2, 3, Ad); g.set(x, -3, 5, Ad); }
    for (let z = -2; z <= 2; z++) { g.set(-2, -3, z, def.accent ?? 0xff2e88); g.set(1, -3, z, def.accent ?? 0xff2e88); }
    g.set(-1, -3, -4, Ae); g.set(0, -3, -4, Ae);
    g.set(-1, -3, -5, 0xff8a2a, true); g.set(0, -3, -5, 0xffb05a, true);
    return { g };
  }
  // chunky sneaker: sole, toe cap, laces, heel tab
  rbox(g, -2, -4, -3, 1, -3, 4, 1, shoe);
  for (let x = -2; x <= 1; x++) for (let z = -3; z <= 4; z++) if (g.has(x, -4, z)) g.set(x, -4, z, sole);
  for (let x = -1; x <= 0; x++) { g.set(x, -2, 1, shoe); g.set(x, -2, 2, shade(shoe, -0.06)); }
  g.set(-1, -2, 1, lace); g.set(0, -2, 2, lace); g.set(-1, -3, 3, lace); g.set(0, -3, 3, lace);
  for (let x = -2; x <= 1; x++) g.set(x, -3, 4, shade(shoe, 0.06));
  g.set(-1, -3, -3, def.accent ?? 0xff2e88); g.set(0, -3, -3, def.accent ?? 0xff2e88);
  // swoosh stripe on the outside
  for (let z = -1; z <= 2; z++) { g.set(-2, -3, z, shade(shoe, -0.22)); g.set(1, -3, z, shade(shoe, -0.22)); }
  return { g };
}
