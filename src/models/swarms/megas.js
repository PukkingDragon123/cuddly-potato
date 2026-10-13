// MEGA-TECH Mutators: the giant ULTIMATE figures. Modelled on Moose Toys'
// MrBeast Lab MEGA-TECH Mutators (2026): 9" poseable action figures, the
// largest the Lab has made, each with Mega-Tech armour, the signature magenta
// Mega-Tech lightning bolt and a water-activated containment-vessel breakout
// (see ../props/containment.js). Characters:
//   panthar     - the classic Panther grown into a hulking armoured mega-beast
//   silverByte  - a chrome cyber-beast with a visor, a giant biting jaw and data tech
//   necroClaw   - a shroud-corrupted nightmare Panthar: bone armour, huge claws, toxic glow
//   cyberGlitch - a glitching digital monster of magenta/cyan pixel blocks
// The rare Metallic Gold variant is the game's 'gold' variant (createSwarm(id, { variant: 'gold' })).
//
// Conventions as the rest of the Swarms (see ../kit.js, ./panthers.js): model
// faces +Z, y = 0 is the ground, x symmetric around -0.5, modelled with the kit
// primitives. They are ~80 voxels tall with finer voxels (MEGA_VOXEL) so they
// are ~1.7 units at scale 1 and become 5.5-6.5 unit giants at the battle scale
// (MEGAS[id].size). Parts are modelled in absolute coordinates and attached
// with jp() at their joints. Glow voxels (the only thing that blooms) are kept
// to small accents: eyes, cores, vents. Defs carry mega: true.
//
// Rig parts (all four): body, head, jaw (opens on attacks), armL/armR (swing on
// the walk, raise + slam on attacks), legL/legR (stomp), tail; plus cape
// (NecroClaw), antennaL/antennaR (Silver-Byte's fin ears, Cyber Glitch's
// floating pixel debris) and spin (Silver-Byte's data ring).
import { G, blob, rbox, capsule, chain, cyl, stamp, glowWhere, gradY, n3, jp, shade, frontZ, topY, sideX } from '../kit.js';

/**
 * World size of one voxel. The sculpts are ~80 voxels tall (2.5x the detail of
 * a normal Swarm), so at the kit's HI size (0.05) they would be ~4 units tall.
 * Instead each voxel is 0.0215 so a Mega is ~1.7 units at scale 1 (a normal
 * Swarm's height) and the battle's MEGAS[id].size (~3.4) makes it a 5.5-6.5
 * unit giant with fine voxel detail.
 */
export const MEGA_VOXEL = 0.0215;

const MAG = 0xff1f9e; // MrBeast / Mega-Tech magenta
const MAG_L = 0xff7ccc;
const INK = 0x15121f;
const TOOTH = 0xffffff;
const MOUTH = 0x3a0a22;
const TONGUE = 0xff5a8a;
const WHITE = 0xf6f8ff;

// ---------------------------------------------------------------------------
// Helpers

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}
/** Mirror pixel-art rows horizontally. */
const rev = (rows) => rows.map((r) => [...r].reverse().join(''));
const N6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const exposed = (g, x, y, z) => N6.some(([a, b, c]) => !g.has(x + a, y + b, z + c));

/** Remove voxels buried deeper than d (keeps the look, trims the voxel count). Run last. */
function hollowOut(g, d = 1) {
  const kill = [];
  g.forEach((x, y, z) => {
    for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) for (let dz = -d; dz <= d; dz++) if (!g.has(x + dx, y + dy, z + dz)) return;
    kill.push([x, y, z]);
  });
  for (const [x, y, z] of kill) g.del(x, y, z);
  return g;
}

/**
 * Paint a trim line where visible voxels of one material (isA) meet other
 * visible voxels: crisp rims around armour plates, like the painted edges on
 * a premium figure. col may be a colour or fn(x,y,z,c).
 */
function trim(g, isA, col) {
  const hits = [];
  g.forEach((x, y, z, c, gl) => {
    if (gl || !isA(c) || !exposed(g, x, y, z)) return;
    for (const [a, b, d] of N6) {
      const n = g.get(x + a, y + b, z + d);
      if (n !== undefined && !isA(n) && exposed(g, x + a, y + b, z + d)) { hits.push([x, y, z, c]); return; }
    }
  });
  for (const [x, y, z, c] of hits) g.set(x, y, z, typeof col === 'function' ? col(x, y, z, c) : col);
  return g;
}

/** Light the upward-facing edge voxels of a material (sculpted bevel highlight). */
function bevelTop(g, isA, f = 0.18) {
  const hits = [];
  g.forEach((x, y, z, c, gl) => { if (!gl && isA(c) && !g.has(x, y + 1, z)) hits.push([x, y, z, c]); });
  for (const [x, y, z, c] of hits) g.set(x, y, z, shade(c, f));
  return g;
}

/** Shift a whole grid. */
function shift(g, dx, dy, dz) {
  const o = G();
  g.forEach((x, y, z, c, gl) => o.set(x + dx, y + dy, z + dz, c, gl));
  return o;
}

/** Raised rivet on the front-most surface at (x, y). */
function rivetZ(g, x, y, col, zmin = -200) {
  const z = frontZ(g, x, y, zmin);
  if (z !== null) g.set(x, y, z + 1, col);
}

/** Big Mega-Tech lightning bolt (10x12): M = bolt, W = outline, C = core. */
const MEGA_BOLT = [
  '.....WWWWW',
  '....WMMMMW',
  '....WMMMW.',
  '...WMMMW..',
  '...WMMMWWW',
  '..WMMCMMMW',
  '..WWWMMMW.',
  '....WMMW..',
  '...WMMW...',
  '...WMW....',
  '..WMW.....',
  '..WW......',
];
/** Small bolt (5x7) for pauldrons, kneepads, buckles. */
const BOLT_S = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];

// ===========================================================================
// Mega beast anatomy: the hulking Panther-born sculpt shared by Panthar and
// NecroClaw (a shroud-corrupted Panthar). Heroic V-taper: barrel chest, big
// traps, long gorilla arms with huge fists, thick legs on big paws, a roaring
// Panther head pushed forward between the shoulders, hinged jaw and a tail.
// Joints (left side; the right side mirrors):
const J = {
  hip: [-7.5, 26, 0],
  shoulder: [-16.5, 46, 0],
  neck: [-0.5, 51, 5],
  head: [-0.5, 62, 8], // skull centre
  tail: [-0.5, 28, -7],
};

/** Big Panther-style face (left half, 12 cols = x -13..-2, top row at head y + 10):
 *  M = lightning-bolt war-paint, B = raised angry brow, W/P/G = eye white/pupil/glint. */
const MEGA_FACE_L = [
  '..MMM.......',
  '.MMM.BB.....',
  'MMM...BBBB..',
  'MMMMM..BBBBB',
  '..MMM.W.BBBB',
  '..MM.WWWW.BB',
  '.MM..WWWWWW.',
  '.M...WWWGPPW',
  '.....WWWPPPW',
  '.....WWWPPPW',
  '......WWWWW.',
];

/**
 * K: { fur, furL, furD, muzzle, inner, nose, claw, joint, pawPad }
 * o: { furFn, face: false to skip the face stamp, fist: false to leave the hands to the caller, brow, bolt, eyeW, pupil, glint }
 * Returns grids (left limbs only) + joints.
 */
function megaBeast(K, o = {}) {
  const furCol = o.furFn ?? ((x, y, z) => (n3(x, y, z, 3) < 0.12 ? shade(K.fur, -0.07) : n3(x, y, z, 4) < 0.05 ? shade(K.fur, 0.08) : K.fur));
  const C = J.head;

  // ------------------------------------------------------------ body
  const body = G();
  blob(body, -0.5, 26, 0, 9.6, 4.8, 6.8, furCol, { p: 2.4 }); // pelvis
  blob(body, -0.5, 32, 0.5, 9.2, 5.6, 7.2, furCol, { p: 2.3 }); // waist
  blob(body, -0.5, 41, 0, 14.4, 7.8, 9.2, furCol, { p: 2.5 }); // barrel chest
  blob(body, -0.5, 47, -1.5, 10, 4.4, 7, furCol, { p: 2.3 }); // traps
  // six-pack abs on a lighter belly
  body.paint((x, y, z) => {
    if (y < 27 || y > 36 || z < 3) return undefined;
    const ax = Math.abs(x + 0.5);
    if (ax > 6.6) return undefined;
    if (ax < 0.6 || y === 30 || y === 33) return shade(K.furL, -0.16);
    return K.furL;
  });

  // ------------------------------------------------------------ head
  const head = G();
  blob(head, C[0], C[1], C[2], 12.4, 9.6, 9.4, furCol, { p: 2.35 });
  blob(head, C[0], C[1] - 5, C[2] + 2.6, 11.2, 5.2, 7, furCol, { p: 2.2 }); // cheeks
  blob(head, C[0], C[1] - 5, C[2] + 9.8, 5.8, 3.3, 3.8, K.muzzle, { p: 2.2 }); // muzzle
  for (const s of [-1, 1]) {
    const ex = C[0] + s * 8.5;
    capsule(head, [ex, C[1] + 7, C[2] - 3], [ex + s * 2, C[1] + 15.5, C[2] - 5], 4.2, 0.8, furCol);
    capsule(head, [ex, C[1] + 7.5, C[2] - 1], [ex + s * 1.6, C[1] + 13.5, C[2] - 2.8], 2.3, 0.5, K.inner);
    const fx = C[0] + s * 11.5;
    capsule(head, [fx, C[1] - 5, C[2] + 2], [fx + s * 4.4, C[1] - 7.5, C[2] + 2.6], 2.2, 0.5, furCol);
    capsule(head, [fx, C[1] - 8, C[2] + 3], [fx + s * 3.6, C[1] - 10.5, C[2] + 3.6], 1.8, 0.4, K.furD);
  }
  // roaring mouth cavity under the muzzle (the hinged jaw fills the bottom)
  const mTop = C[1] - 8;
  head.carve((x, y, z) => y >= C[1] - 14 && y <= mTop - 1 && z >= C[2] + 4 && Math.abs(x + 0.5) <= 6.6);
  head.carve((x, y, z) => y < C[1] - 14 && z >= C[2] + 2);
  for (let x = -7; x <= 6; x++) {
    if (Math.abs(x + 0.5) > 6.6) continue;
    for (let y = C[1] - 13; y <= mTop - 1; y++) head.set(x, y, C[2] + 4, MOUTH);
    for (let z = C[2] + 4; z <= C[2] + 16; z++) if (head.has(x, mTop, z)) head.set(x, mTop, z, MOUTH);
  }
  for (let x = -6; x <= 5; x++) {
    let fz = null;
    for (let z = C[2] + 16; z >= C[2] + 4; z--) if (head.has(x, mTop, z)) { fz = z; break; }
    if (fz === null) continue;
    head.set(x, mTop - 1, fz, TOOTH);
    if ((x + 40) % 2 === 0) head.set(x, mTop - 2, fz, TOOTH);
  }
  for (const x of [-6, 5]) for (let y = mTop - 4; y <= mTop - 1; y++) head.set(x, y, C[2] + 11, TOOTH); // fangs
  stamp(head, ['NNNNNNNN', '.NNNNNN.', '..NNNN..', '...NN...'], { N: K.nose }, { axis: 'z', x: -4, y: C[1] - 2, raise: 1, zmin: C[2] + 6 });
  if (o.face !== false) {
    stamp(head, MEGA_FACE_L, {
      M: o.bolt ?? MAG, B: { c: o.brow ?? K.brow ?? K.furD, raise: 1 }, W: o.eyeW ?? 0xffffff, P: o.pupil ?? INK, G: o.glint ?? 0xffffff,
    }, { axis: 'z', x: -13, y: C[1] + 10, mirror: true, zmin: C[2] });
  }

  // ------------------------------------------------------------ jaw
  const jaw = G();
  const JJ = [-0.5, C[1] - 11, C[2] + 3];
  blob(jaw, -0.5, C[1] - 14.6, C[2] + 9.8, 6.2, 2.6, 5.4, K.muzzle, { p: 2.3 });
  blob(jaw, -0.5, C[1] - 14, C[2] + 5.6, 8.2, 3.4, 3.8, furCol, { p: 2.2 });
  jaw.carve((x, y) => y >= C[1] - 12);
  for (let x = -7; x <= 6; x++) for (let z = C[2] + 4; z <= C[2] + 16; z++) {
    if (jaw.has(x, C[1] - 13, z)) jaw.set(x, C[1] - 13, z, Math.abs(x + 0.5) <= 2.6 && z <= C[2] + 13 ? TONGUE : MOUTH);
  }
  for (let x = -6; x <= 5; x++) {
    let fz = null;
    for (let z = C[2] + 17; z >= C[2] + 4; z--) if (jaw.has(x, C[1] - 13, z)) { fz = z; break; }
    if (fz === null) continue;
    if ((x + 41) % 2 === 0 || x === -6 || x === 5) jaw.set(x, C[1] - 12, fz, TOOTH);
  }
  for (const x of [-6, 5]) for (let y = C[1] - 12; y <= C[1] - 10; y++) jaw.set(x, y, C[2] + 13, TOOTH);

  // ------------------------------------------------------------ arm (left)
  const S = J.shoulder;
  const arm = G();
  blob(arm, S[0], S[1], S[2], 4.4, 4.4, 4.4, K.joint); // shoulder ball joint
  capsule(arm, [-17.5, 44.5, 0], [-20, 35.5, 1], 5.4, 4.4, furCol); // upper arm
  blob(arm, -19.3, 39.5, 2.6, 4, 4.2, 3.2, furCol); // bicep
  blob(arm, -20.3, 34.2, 1.2, 3.8, 3.8, 3.8, K.joint); // elbow ball joint
  capsule(arm, [-20.5, 33, 1.5], [-21, 25, 3.5], 4.6, 5.2, furCol); // forearm
  if (o.fist !== false) {
    blob(arm, -21.3, 20.2, 5, 5.3, 4.9, 5.5, furCol, { p: 2.3 }); // fist
    for (const dx of [-3.4, -1.1, 1.1, 3.4]) blob(arm, -21.3 + dx, 19.4, 9.8, 1.3, 2, 1.5, K.furL); // knuckles
    capsule(arm, [-16.8, 20, 7.5], [-16.2, 17, 9.5], 1.5, 1, K.furL); // thumb
  }

  // ------------------------------------------------------------ leg (left)
  const H = J.hip;
  const leg = G();
  blob(leg, H[0], H[1], H[2], 4.3, 4.3, 4.3, K.joint); // hip ball joint
  capsule(leg, [-8, 25, 0.2], [-8.4, 15.6, 1.4], 6, 4.6, furCol); // thigh
  blob(leg, -8.4, 14.6, 1.4, 3.7, 3.7, 3.7, K.joint); // knee ball joint
  capsule(leg, [-8.4, 13.6, 1.2], [-8.4, 6.6, 1.2], 4.2, 3.9, furCol); // shin
  blob(leg, -8.4, 3, 2.8, 5.4, 3, 6.6, furCol, { p: 2.3, clip: (x, y) => y < 0 }); // paw
  for (const dx of [-3, 0, 3]) {
    blob(leg, -8.4 + dx, 2, 8.8, 1.6, 2, 1.7, K.furL, { clip: (x, y) => y < 0 });
  }

  // ------------------------------------------------------------ tail
  const tail = G();
  const T = J.tail;
  chain(tail, [T, [-0.5, 25.5, -13], [-0.5, 27, -19], [-0.5, 32.5, -22.5], [-0.5, 38, -21]], [3, 1.9], furCol);

  return { body, head, jaw, arm, leg, tail, furCol, joints: { ...J, jaw: JJ } };
}

/** Finish + pack a mega beast: hollow, mirror limbs, attach parts. extra: { parts, finish, muzzle } */
function packBeast(m, extra = {}) {
  const g = m.grids ?? m;
  const j = m.joints;
  for (const k of ['body', 'head', 'jaw', 'arm', 'leg', 'tail']) if (g[k]) hollowOut(g[k], 1);
  const armR = flipX(g.arm), legR = flipX(g.leg);
  const R = (p) => [-1 - p[0], p[1], p[2]];
  return {
    gait: 'walk', voxel: MEGA_VOXEL, jitter: 0.02, finish: extra.finish ?? 'toy', mega: true,
    parts: [
      jp('legL', g.leg, j.hip), jp('legR', legR, R(j.hip)),
      jp('body', g.body, [-0.5, 0, 0]),
      jp('armL', g.arm, j.shoulder, [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, R(j.shoulder), [-0.5, 0, 0], { parent: 'body' }),
      jp('head', g.head, j.neck),
      jp('jaw', g.jaw, j.jaw, j.neck, { parent: 'head', rot: [0.16, 0, 0] }),
      jp('tail', g.tail, j.tail),
      ...(extra.parts ?? []),
    ],
    muzzle: extra.muzzle ?? [-0.5, j.head[1] - 10, j.head[2] + 16],
  };
}

// ===========================================================================
// PANTHAR: the classic MrBeast Lab Panther - blue fur, magenta lightning-bolt
// war-paint, white muzzle, roaring angry face - grown into a hulking
// armoured mega-beast. Navy Mega-Tech armour with silver trim: chest cuirass
// with the big magenta Mega-Tech bolt and a glowing core, domed pauldrons
// with racing stripes, gauntlets, kneepads + greaves, a power pack with
// glowing cells on its back, and visible action-figure joints.
function panthar() {
  const K = {
    fur: 0x4cbcf2, furD: 0x2b84dc, furL: 0x9cd8f2, muzzle: 0xdcebf5, inner: 0xff59b8, nose: INK, claw: INK, joint: 0x3a3f58, brow: 0x1b3f8c,
    plate: 0x2b3560, plateD: 0x1c2242, plateL: 0x45558c, edge: 0x6676b4, trim: 0xd2dbec, trimD: 0x8f9ab4,
    glow: 0xff4fc8, glowHot: 0xffd2f0,
  };
  const m = megaBeast(K);
  const { body, head, arm, leg, tail } = m;
  const isPlate = (c) => c === K.plate || c === K.plateD || c === K.plateL;
  const plateCol = (hiY) => (x, y) => (y >= hiY ? K.plateL : K.plate);

  // ------------------------------------------------------------ torso armour
  blob(body, -0.5, 41.5, 0.2, 15.1, 7.5, 9.8, plateCol(47), { p: 2.6, clip: (x, y) => y < 33 }); // cuirass
  for (const s of [-1, 1]) blob(body, -0.5 + s * 6.3, 42.6, 8.7, 6.2, 4.6, 3, plateCol(45), { p: 2.4 }); // pecs
  blob(body, -0.5, 48.6, -0.5, 9.4, 1.6, 7.6, K.plateD, { p: 2.4 }); // neck gorget
  blob(body, -0.5, 24.5, 0, 10.4, 1.8, 7.6, (x, y) => (y === 25 ? K.plateL : K.plate), { p: 2.6 }); // belt
  trim(body, isPlate, K.edge);
  body.paint((x, y, z, c) => (isPlate(c) && y === 33 ? K.trim : undefined)); // cuirass hem
  rbox(body, -4, 22, 6, 3, 27, 9, 1, K.trim); // buckle
  rbox(body, -3, 23, 9, 2, 26, 9, 0, K.plateD);
  stamp(body, ['.MM', 'MM.', '.MM', 'MM.'], { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -2, y: 26, zmin: 8 });
  // the big Mega-Tech bolt across the chest with a glowing core
  stamp(body, MEGA_BOLT, { M: { c: MAG, raise: 1 }, W: { c: WHITE, raise: 1 }, C: { c: K.glow, raise: 1, glow: true } }, { axis: 'z', x: -5, y: 43, zmin: 4 });
  for (const [x, y] of [[-12, 44], [11, 44], [-11, 38], [10, 38]]) rivetZ(body, x, y, K.trim, 0);
  // back power pack with two glowing energy cells, vents and exhausts
  rbox(body, -8, 33, -12, 7, 46, -7, 2, (x, y) => (y >= 45 ? K.plateL : K.plateD));
  for (const cx of [-4.5, 3.5]) {
    cyl(body, 'y', cx, -12.5, 35, 43, 1.9, 1.9, (x, y) => (y === 35 || y === 43 ? K.trim : MAG));
    for (let y = 36; y <= 42; y++) body.set(cx < 0 ? -5 : 4, y, -15, K.glow, true);
  }
  for (let x = -6; x <= 5; x++) if ((x + 40) % 2 === 0) for (const y of [45, 46]) body.set(x, y, -13, K.joint);
  for (const s of [-1, 1]) capsule(body, [-0.5 + s * 5, 46, -10], [-0.5 + s * 6.5, 50, -12], 1.4, 1.1, K.trimD);
  gradY(body, 21, 51, -0.12, 0.06, (x, y, z, c) => !isPlate(c) && c !== K.trim && c !== MAG && c !== WHITE);

  // ------------------------------------------------------------ head armour: ear cuffs with status lights
  const C = J.head;
  for (const s of [-1, 1]) {
    const ex = C[0] + s * 9.1;
    blob(head, ex, C[1] + 7.6, C[2] - 3.2, 4.4, 1.5, 4.4, K.plate, { p: 2.6 });
    head.set(Math.round(ex + s * 4.4) + (s > 0 ? -1 : 0), Math.round(C[1] + 7.6), Math.round(C[2] - 2), K.glow, true);
  }
  trim(head, isPlate, K.trim);
  gradY(head, C[1] - 12, C[1] + 12, -0.12, 0.02, (x, y, z, c) => c !== K.muzzle && !isPlate(c) && c !== TOOTH && c !== MOUTH && c !== MAG && c !== 0xffffff && c !== INK);

  // ------------------------------------------------------------ arm armour
  // domed pauldron with a racing stripe + a lower tier
  blob(arm, -18.2, 48.6, 0, 7.4, 5.2, 7.8, (x, y, z) => (Math.abs(z + 0.5) <= 1 && y >= 50 ? MAG : y >= 52 ? K.plateL : K.plate), { p: 2.25, clip: (x, y) => y < 46 || x > -10 });
  blob(arm, -19.6, 45.2, 0, 6.8, 3.2, 7.2, K.plateD, { p: 2.4, clip: (x, y) => y > 45.6 || y < 42 || x > -12 });
  stamp(arm, BOLT_S, { M: { c: MAG, raise: 1 } }, { axis: '-x', y: 52, z: 5 });
  // gauntlet: armoured forearm with a magenta stripe, flared cuff and power LEDs
  capsule(arm, [-20.5, 33, 1.5], [-21, 25.5, 3.5], 5.2, 5.8, plateCol(32));
  arm.paint((x, y, z, c) => (isPlate(c) && y >= 26 && y <= 31 && x <= -25 && Math.abs(z - 2.5) <= 1 ? MAG : undefined));
  blob(arm, -21, 25, 3.6, 6.1, 1.3, 6.3, K.trim, { p: 2.2 }); // wrist cuff
  // knuckle guards + claws
  for (const dx of [-3.4, -1.1, 1.1, 3.4]) {
    const fx = -21.3 + dx;
    rbox(arm, Math.round(fx - 0.5), 21, 9, Math.round(fx + 0.5), 22, 11, 0, K.plateL);
    capsule(arm, [fx, 18.5, 11.2], [fx, 15.4, 13.4], 1, 0.3, K.claw);
  }
  capsule(arm, [-16.2, 17.5, 9.5], [-15.8, 15, 11.5], 0.9, 0.3, K.claw);
  trim(arm, isPlate, K.edge);
  arm.paint((x, y, z, c) => (isPlate(c) && (y === 46 || y === 47) && !arm.has(x, y - 1, z) ? K.trim : undefined)); // pauldron rim
  gradY(arm, 14, 54, -0.1, 0.05, (x, y, z, c) => !isPlate(c) && c !== K.joint && c !== MAG && c !== K.trim && c !== K.claw);

  // ------------------------------------------------------------ leg armour
  blob(leg, -8.8, 21.5, 1.4, 6.5, 4.6, 5.9, plateCol(24), { p: 2.4, clip: (x, y, z) => z < -1 || x > -5 }); // thigh plate
  stamp(leg, BOLT_S, { M: { c: MAG, raise: 1 } }, { axis: '-x', y: 24, z: 3 });
  blob(leg, -8.4, 15, 5, 3.9, 4.2, 2.4, K.plateL, { p: 2.4 }); // kneepad
  stamp(leg, ['.MM', 'MM.', '.MM'], { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -10, y: 16, zmin: 5 });
  capsule(leg, [-8.4, 13.4, 1.2], [-8.4, 6.8, 1.2], 4.6, 4.3, plateCol(12)); // greave
  blob(leg, -8.4, 6.6, 1.2, 4.9, 1.1, 4.9, K.trim, { p: 2.2 }); // ankle ring
  for (const dx of [-3, 0, 3]) capsule(leg, [-8.4 + dx, 1.6, 10.4], [-8.4 + dx, 0.2, 12], 0.9, 0.4, K.claw);
  trim(leg, isPlate, K.edge);
  gradY(leg, 0, 27, -0.14, 0.04, (x, y, z, c) => !isPlate(c) && c !== K.joint && c !== MAG && c !== K.trim && c !== K.claw);

  // ------------------------------------------------------------ tail: armour rings + magenta blade tip
  for (const [y, z] of [[26, -12], [28, -19.5]]) blob(tail, -0.5, y, z, 3.2, 3.2, 3.2, K.plate, { p: 2.2, clip: (x, yy, zz) => Math.abs(zz - z) > 0.6 && Math.abs(yy - y) > 0.6 });
  capsule(tail, [-0.5, 37.5, -21.2], [-0.5, 42.5, -19], 1.9, 0.4, MAG);
  trim(tail, isPlate, K.trim);

  return packBeast(m);
}

// ===========================================================================
// SILVER-BYTE: a chrome cyber-beast. Polished silver armour over a dark
// under-suit, a black visor with furious cyan eye slits under a V-shaped
// brow, a long robotic snout with a huge serrated biting jaw (the "byte"),
// fin ears that crackle like antennas, binary-code and data-glitch decals,
// claw hands with chrome talons, and a server-tower backpack with drive-bay
// LEDs and a spinning data ring.

/** 3x5 pixel digits for binary decals. */
const DIGITS = {
  0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
};
function bitsArt(str) {
  const rows = ['', '', '', '', ''];
  [...str].forEach((d, i) => { for (let r = 0; r < 5; r++) rows[r] += (i ? '.' : '') + DIGITS[d][r]; });
  return rows;
}

/**
 * Flat blade (fin, ear, spike) in the y-z plane from base to tip, w0 = half
 * width at the base (tapers to 0), thick = voxels along x (grows towards +x
 * from base[0]). col(t 0..1 along, k -1..1 across) -> colour | {c, glow}.
 */
function fin(g, base, tip, w0, thick, col) {
  const [bx, by, bz] = base, [ex, ey, ez] = tip;
  const len = Math.hypot(ex - bx, ey - by, ez - bz) || 1;
  const n = Math.ceil(len * 2.5);
  const dy = (ey - by) / len, dz = (ez - bz) / len;
  const py = -dz, pz = dy; // perpendicular in the y-z plane
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = bx + (ex - bx) * t, cy = by + (ey - by) * t, cz = bz + (ez - bz) * t;
    const w = w0 * (1 - t) + 0.3;
    for (let k = -w; k <= w + 1e-6; k += 0.4) {
      const y = Math.round(cy + py * k), z = Math.round(cz + pz * k);
      const spec = col(t, w > 0 ? k / w : 0);
      const c = typeof spec === 'object' ? spec.c : spec, gl = typeof spec === 'object' && !!spec.glow;
      for (let xx = 0; xx < thick; xx++) g.set(Math.round(cx) + xx, y, z, c, gl);
    }
  }
  return g;
}

/** Sprinkle short horizontal "data glitch" streaks over visible voxels matching isA. */
function glitchStreaks(g, isA, cols, p = 0.012, seed = 5) {
  const hits = [];
  g.forEach((x, y, z, c, gl) => { if (!gl && isA(c) && exposed(g, x, y, z) && n3(x, y, z, seed) < p) hits.push([x, y, z]); });
  for (const [x, y, z] of hits) {
    const c = cols[Math.floor(n3(x, z, y, seed + 1) * cols.length) % cols.length];
    const len = 2 + Math.floor(n3(y, x, z, seed + 2) * 3);
    for (let i = 0; i < len; i++) if (g.has(x + i, y, z) && exposed(g, x + i, y, z)) g.set(x + i, y, z, c);
  }
  return g;
}

function silverByte() {
  const K = {
    chrome: 0x929cb0, chromeL: 0xbfc8d6, chromeD: 0x6c778e, chromeDD: 0x3e4659,
    suit: 0x232838, suitL: 0x384058, visor: 0x0b1222, joint: 0x2e3346, gun: 0x4a5268, gunL: 0x66708c,
    cyan: 0x3ef0ff, cyanD: 0x1a8fb8, cyanHot: 0xd2fdff, tooth: 0xc4ccd8, gum: 0x1a1e2e,
  };
  const chromeCol = (x, y, z) => { const v = n3(x, y, z, 11); return v < 0.08 ? K.chromeD : v > 0.9 ? K.chromeL : K.chrome; };
  const isChrome = (c) => c === K.chrome || c === K.chromeL || c === K.chromeD;
  const isSuit = (c) => c === K.suit || c === K.suitL;
  const isMetal = (c) => isChrome(c) || c === K.chromeDD;

  // ------------------------------------------------------------ body
  const body = G();
  blob(body, -0.5, 26, -0.5, 9.2, 4.8, 6.6, K.suit, { p: 2.6 }); // pelvis
  cyl(body, 'y', -0.5, 0, 28, 36, 7.4, 8, K.suit); // abdomen core
  blob(body, -0.5, 41.5, -0.5, 14.4, 7.4, 9, chromeCol, { p: 3 }); // chest shell
  blob(body, -0.5, 48, -2, 10.4, 4, 7, chromeCol, { p: 2.6 }); // traps
  for (const s of [-1, 1]) blob(body, -0.5 + s * 6.4, 43, 8.2, 6.2, 4.4, 2.8, chromeCol, { p: 3.2 }); // pec plates
  // segmented ab plates with cyan seams
  for (const y of [28.5, 31.5, 34.5]) blob(body, -0.5, y, 0, 8.4 + (y - 28.5) * 0.15, 0.75, 7.6, (x, yy) => (yy === Math.ceil(y) ? K.chromeL : K.chrome), { p: 2.4, clip: (x, yy, z) => z < -1 });
  body.paint((x, y, z, c) => (isSuit(c) && (y === 30 || y === 33) && z >= 4 && Math.abs(x + 0.5) <= 5 ? K.cyanD : undefined));
  // hip faulds + belt with a glowing chip buckle
  blob(body, -0.5, 25, 0, 10, 2.8, 7.4, (x, y) => (y >= 26 ? K.gunL : K.gun), { p: 2.8, clip: (x, y, z) => z < -2 || y > 27 });
  blob(body, -0.5, 27.6, 0, 9.6, 0.8, 7.2, K.suitL, { p: 2.6 });
  rbox(body, -3, 23, 7, 2, 27, 8, 0, K.chromeDD);
  body.set(-1, 25, 9, K.cyan, true); body.set(0, 25, 9, K.cyan, true);
  // chest: center seam, the Mega-Tech bolt and a glowing data core
  body.paint((x, y, z, c) => (isChrome(c) && Math.abs(x + 0.5) === 0.5 && y >= 36 && y <= 48 && z > 4 ? K.chromeDD : undefined));
  body.paint((x, y, z, c) => (isChrome(c) && (y === 37 || (y === 47 && z > 2)) && exposed(body, x, y, z) ? K.chromeDD : undefined));
  body.paint((x, y, z, c) => (isChrome(c) && y <= 36 && exposed(body, x, y, z) ? K.gun : undefined)); // lower chest band
  stamp(body, MEGA_BOLT, { M: { c: MAG, raise: 1 }, W: { c: K.visor, raise: 1 }, C: { c: K.cyan, raise: 1, glow: true } }, { axis: 'z', x: -5, y: 46, zmin: 4 });
  // side vents with LEDs
  for (const s of [-1, 1]) for (const y of [38, 40, 42]) for (let z = -2; z <= 3; z++) {
    const sx = sideX(body, y, z, s);
    if (sx !== null) body.set(sx, y, z, z === 3 ? (y === 40 ? K.cyan : K.cyanD) : K.chromeDD, z === 3 && y === 40);
  }
  // server-tower backpack: drive bays with LEDs, antenna masts
  rbox(body, -8, 32, -14, 7, 50, -8, 2, (x, y) => (y >= 49 ? K.chromeL : y <= 33 ? K.chromeD : K.gun));
  for (let y = 34; y <= 47; y += 3) for (let x = -6; x <= 5; x++) {
    body.set(x, y, -15, x === 5 ? K.cyan : K.suit, x === 5);
    if (x === -6 || x === 5) continue;
    body.set(x, y + 1, -15, K.chromeDD);
  }
  for (const s of [-1, 1]) {
    capsule(body, [-0.5 + s * 5.5, 50, -11], [-0.5 + s * 6.5, 56, -12], 0.7, 0.5, K.chromeDD);
    body.set(s < 0 ? -7 : 6, 57, -12, MAG, true);
  }
  capsule(body, [-0.5, 50, -11], [-0.5, 58, -11], 1.1, 0.8, K.chromeD); // data mast
  gradY(body, 21, 52, -0.1, 0.06, (x, y, z, c) => isChrome(c));
  glitchStreaks(body, isChrome, [K.cyanD, MAG, K.chromeDD], 0.008, 7);

  // ------------------------------------------------------------ data ring (spins)
  const RJ = [-0.5, 57, -11];
  const ring = G();
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = Math.round(RJ[0] + Math.cos(a) * 5.6), z = Math.round(RJ[2] + Math.sin(a) * 5.6);
    ring.set(x, 57, z, i % 10 === 0 ? K.cyan : K.chromeL, i % 10 === 0);
    ring.set(x, 56, z, K.chromeD);
  }

  // ------------------------------------------------------------ head
  const NJ = [-0.5, 51, 3];
  const head = G();
  cyl(head, 'y', -0.5, 3, 50, 56, 4.4, 4.4, (x, y) => (y % 2 ? K.suit : K.suitL)); // neck cables
  blob(head, -0.5, 61, 5.5, 10.6, 8, 9.2, chromeCol, { p: 2.6 }); // cranium
  // long robotic snout (upper jaw)
  for (let z = 9; z <= 22; z++) {
    const t = (z - 9) / 13;
    const hw = 7 - t * 2.2, top = 61 - t * 3.6, bot = 54.5;
    for (let x = -9; x <= 8; x++) for (let y = 53; y <= 62; y++) {
      const ax = Math.abs(x + 0.5);
      if (ax > hw + 0.3 || y < bot || y > top + 0.3) continue;
      if (ax > hw - 1.2 && y > top - 1.2) continue;
      head.set(x, y, z, z >= 21 ? K.chromeD : chromeCol(x, y, z));
    }
  }
  // snout ridge, nostril vents and a magenta bolt on the bridge
  for (let z = 10; z <= 20; z++) for (const x of [-1, 0]) { const ty = topY(head, x, z); if (ty !== null) head.set(x, ty, z, K.chromeDD); }
  for (const x of [-3, -2, 1, 2]) head.set(x, 58, 23, K.suit);
  stamp(head, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: { c: MAG, raise: 1 } }, { axis: 'y', x: -2, z: 11 });
  // visor band with furious slit eyes
  head.paint((x, y, z, c) => (isChrome(c) && y >= 62 && y <= 65 && z >= 9 && Math.abs(x + 0.5) <= 10 && exposed(head, x, y, z) ? K.visor : undefined));
  const EYE_L = ['EE......', 'EEEE....', '.EEHHEE.', '...EEEEE'];
  stamp(head, EYE_L, { E: { c: K.cyan, glow: true }, H: { c: K.cyanHot, glow: true } }, { axis: 'z', x: -10, y: 65, mirror: true, zmin: 8 });
  // swept-back crest blade
  fin(head, [-1.5, 68, 7], [-1.5, 72.5, -7], 2.6, 2, (t, k) => (k > 0.55 ? MAG : t > 0.8 ? K.chromeL : K.chrome));
  // V-shaped angry brow ridge over the visor
  for (const s of [-1, 1]) capsule(head, [-0.5 + s * 10.4, 68.6, 7.5], [-0.5 + s * 1.4, 66, 13.2], 1.7, 1.4, K.chromeL);
  // cheek plates with vents
  for (const s of [-1, 1]) {
    blob(head, -0.5 + s * 10, 58.5, 7, 2.2, 3.6, 4.2, K.gun, { p: 3 });
    for (const y of [57, 59]) for (let z = 5; z <= 9; z++) head.set(s < 0 ? -13 : 12, y, z, K.chromeDD);
  }
  // upper teeth: a serrated row under the snout, big front fangs
  for (let z = 11; z <= 21; z++) {
    const t = (z - 9) / 13, hw = 7 - t * 2.2;
    for (const s of [-1, 1]) {
      const x = Math.round(-0.5 + s * (hw - 0.6) - (s > 0 ? 0.5 : -0.5) * 0);
      head.set(x, 53, z, K.tooth);
      if ((z + 40) % 2 === 0) head.set(x, 52, z, K.tooth);
    }
  }
  for (let x = -4; x <= 3; x++) { head.set(x, 53, 21, K.tooth); if ((x + 40) % 2 === 0) head.set(x, 52, 21, K.tooth); }
  for (const x of [-5, 4]) for (let y = 49; y <= 53; y++) head.set(x, y, 20, K.tooth);
  head.carve((x, y, z) => y === 54 && z >= 11 && z <= 20 && Math.abs(x + 0.5) <= 3.5);
  for (let z = 11; z <= 20; z++) for (let x = -4; x <= 3; x++) head.set(x, 55, z, K.gum);
  gradY(head, 50, 70, -0.12, 0.08, (x, y, z, c) => isChrome(c));

  // ------------------------------------------------------------ jaw: the huge biting lower jaw
  const JJ = [-0.5, 56, 4];
  const jaw = G();
  for (let z = 3; z <= 22; z++) {
    const t = (z - 3) / 19;
    const hw = 7.6 - t * 2.4, bot = 47 + t * 2.2, top = 52.5;
    for (let x = -9; x <= 8; x++) for (let y = 46; y <= 53; y++) {
      const ax = Math.abs(x + 0.5);
      if (ax > hw + 0.3 || y < bot || y > top) continue;
      if (ax > hw - 1.2 && y < bot + 1.2) continue;
      jaw.set(x, y, z, y <= bot + 1.5 ? K.gun : chromeCol(x, y, z));
    }
  }
  // hollow mouth with a dark floor, glowing throat, serrated lower teeth
  jaw.carve((x, y, z) => y >= 51 && z >= 6 && z <= 20 && Math.abs(x + 0.5) <= 4.6 - Math.max(0, z - 15) * 0.25);
  for (let z = 6; z <= 20; z++) for (let x = -5; x <= 4; x++) if (jaw.has(x, 50, z)) jaw.set(x, 50, z, z <= 7 ? (Math.abs(x + 0.5) <= 1.5 ? K.cyan : K.cyanD) : K.gum, z <= 7 && Math.abs(x + 0.5) <= 1.5);
  for (let z = 8; z <= 21; z++) {
    const t = (z - 3) / 19, hw = 7.6 - t * 2.4;
    for (const s of [-1, 1]) {
      const x = Math.round(-0.5 + s * (hw - 1.2));
      if (!jaw.has(x, 52, z)) continue;
      jaw.set(x, 53, z, K.tooth);
      if ((z + 41) % 2 === 0) jaw.set(x, 54, z, K.tooth);
    }
  }
  for (const x of [-4, 3]) for (let y = 53; y <= 56; y++) jaw.set(x, y, 21, K.tooth);
  // hydraulic jaw pistons
  for (const s of [-1, 1]) capsule(jaw, [-0.5 + s * 7.6, 51, 6], [-0.5 + s * 8.2, 56, 4], 1.1, 1.1, K.chromeDD);

  // ------------------------------------------------------------ fin ears (antennas)
  const AJ = [-7.5, 66, 2];
  const ear = G();
  fin(ear, [-8.5, 64, 3], [-13.5, 78, -6], 4.4, 2, (t, k) => (t > 0.9 ? { c: K.cyan, glow: true } : Math.abs(k) < 0.28 ? MAG : t < 0.12 || k < -0.75 ? K.chromeD : K.chrome));
  blob(ear, -7.8, 66, 2, 2.4, 2.4, 2.4, K.chromeDD);
  const earR = flipX(ear);

  // ------------------------------------------------------------ arm (left)
  const SJ = [-17, 46, 0];
  const arm = G();
  blob(arm, SJ[0], SJ[1], SJ[2], 4.2, 4.2, 4.2, K.joint);
  capsule(arm, [-18, 44, 0], [-20.5, 35, 1], 4.4, 3.9, K.suit); // under-suit upper arm
  for (const [y, dx] of [[42, 0.6], [38.5, 1.6]]) blob(arm, -18.6 - dx, y, 0.4, 5, 0.9, 5, K.chromeD, { p: 2.2 }); // armour bands
  blob(arm, -20.6, 34, 1.2, 3.6, 3.6, 3.6, K.joint); // elbow
  capsule(arm, [-21.4, 34, -1.5], [-23.4, 33, -5.5], 1.6, 0.4, K.chromeL); // elbow spike
  blob(arm, -21.1, 28.8, 2.4, 5.6, 5, 5.9, (x, y) => (y <= 25 ? K.gun : chromeCol(x, y, 0)), { p: 3 }); // gauntlet
  arm.paint((x, y, z, c) => (isChrome(c) && y === 29 && exposed(arm, x, y, z) && x < -15 ? K.chromeDD : undefined));
  for (let y = 25; y <= 32; y++) for (const z of [1, 2]) { const sx = sideX(arm, y, z, -1); if (sx !== null) arm.set(sx, y, z, y === 31 ? K.cyan : K.cyanD, y === 31); }
  stamp(arm, bitsArt('10'), { X: K.chromeD }, { axis: 'z', x: -25, y: 31, zmin: 4 });
  blob(arm, -21.1, 23.6, 3.4, 5.4, 1, 5.6, K.chromeDD, { p: 2.4 }); // wrist ring
  // robotic claw hand: palm, three talon fingers and a thumb
  blob(arm, -21.3, 20, 4.4, 4.6, 3.6, 4.6, K.chromeD, { p: 3 });
  for (const dx of [-3, 0, 3]) {
    const fx = -21.3 + dx;
    blob(arm, fx, 19.5, 8.6, 1.5, 1.5, 1.5, K.joint);
    chain(arm, [[fx, 19.5, 9], [fx, 17.5, 11.6], [fx, 14.5, 12.8]], [1.3, 1.1, 0.9], K.suitL);
    capsule(arm, [fx, 14.5, 12.8], [fx, 11, 12.6], 1, 0.2, K.chromeL); // talon
  }
  chain(arm, [[-17.2, 19.5, 6], [-16.2, 17, 8.5], [-16.6, 14.5, 9.5]], [1.2, 1, 0.3], K.chromeL);
  // layered blade pauldron with a magenta edge
  blob(arm, -18.4, 49.6, 0, 7.6, 3.2, 8, (x, y) => (y <= 47 ? MAG : chromeCol(x, y, 0)), { p: 3.2, clip: (x, y) => y < 46.5 || x > -11 });
  blob(arm, -20.2, 46.2, 0, 6.6, 2.4, 7.2, K.gun, { p: 3, clip: (x, y) => y > 46.5 || y < 44 || x > -13 });
  blob(arm, -21.6, 43.6, 0, 5.4, 2, 6.4, chromeCol, { p: 3, clip: (x, y) => y > 44 || y < 41.5 || x > -15 });
  stamp(arm, bitsArt('01'), { X: K.chromeD }, { axis: '-x', y: 52, z: 3 });
  gradY(arm, 12, 54, -0.12, 0.05, (x, y, z, c) => isChrome(c));
  glitchStreaks(arm, isChrome, [K.cyanD, MAG], 0.01, 9);

  // ------------------------------------------------------------ leg (left)
  const LJ = [-7.5, 26, -0.5];
  const leg = G();
  blob(leg, LJ[0], LJ[1], LJ[2], 4.2, 4.2, 4.2, K.joint);
  capsule(leg, [-8, 25, 0], [-8.4, 15.6, 1], 5.4, 4.2, K.suit); // thigh
  blob(leg, -8.8, 21, 1, 6.2, 4.8, 5.8, chromeCol, { p: 3, clip: (x, y, z) => z < -1 || x > -5 }); // thigh plate
  leg.paint((x, y, z, c) => (isChrome(c) && (y === 18 || x + z === -2) && exposed(leg, x, y, z) ? K.chromeDD : undefined));
  stamp(leg, bitsArt('1101'), { X: K.chromeD }, { axis: '-x', y: 24, z: 7 });
  blob(leg, -8.4, 14.6, 1, 3.6, 3.6, 3.6, K.joint); // knee joint
  blob(leg, -8.4, 15.6, 4.6, 3.8, 4.4, 2.6, K.chromeL, { p: 3 }); // knee cap
  capsule(leg, [-8.4, 17, 6.5], [-8.4, 20.5, 8.5], 1.4, 0.3, K.chromeL); // knee spike
  blob(leg, -8.4, 9.6, 1.6, 4.6, 4.2, 4.8, (x, y) => (y <= 7 ? K.gun : chromeCol(x, y, 0)), { p: 3 }); // greave
  for (let y = 7; y <= 12; y++) for (const x of [-9, -8]) { const fz = frontZ(leg, x, y); if (fz !== null) leg.set(x, y, fz, y === 11 ? K.cyan : K.cyanD, y === 11); }
  cyl(leg, 'y', -8.4, -3.6, 5, 13, 1.1, 1.1, K.chromeDD); // calf piston
  // robot paw: foot block, three talon toes, heel spur
  rbox(leg, -13, 0, -4, -4, 4, 6, 1.5, (x, y) => (y <= 0 ? K.suit : K.gun));
  rbox(leg, -12, 4, -3, -5, 5, 4, 1, K.suit);
  for (const dx of [-3, 0, 3]) {
    rbox(leg, Math.round(-8.4 + dx - 0.5), 0, 6, Math.round(-8.4 + dx + 0.5), 3, 9, 0.5, K.chrome);
    capsule(leg, [-8.4 + dx, 1.5, 9.5], [-8.4 + dx, 0.2, 12], 0.9, 0.3, K.chromeL);
  }
  capsule(leg, [-8.4, 2, -4], [-8.4, 1, -7.5], 1.2, 0.3, K.chromeL);
  gradY(leg, 0, 27, -0.12, 0.04, (x, y, z, c) => isChrome(c));
  glitchStreaks(leg, isChrome, [K.cyanD, MAG], 0.01, 13);

  // ------------------------------------------------------------ tail: segmented cable with a data-blade tip
  const TJ = [-0.5, 27, -8];
  const tail = G();
  const tp = [[-0.5, 27, -8], [-0.5, 24, -14], [-0.5, 26, -20], [-0.5, 31, -23.5], [-0.5, 36.5, -22]];
  chain(tail, tp, [1.7, 1.2], K.suitL);
  for (let i = 1; i <= 6; i++) {
    const t = i / 7, seg = Math.min(3, Math.floor(t * 4)), u = t * 4 - seg;
    const a = tp[seg], b = tp[seg + 1];
    const p = a.map((v, k) => v + (b[k] - v) * u);
    blob(tail, p[0], p[1], p[2], 2.5 - t * 0.8, 2.5 - t * 0.8, 2.5 - t * 0.8, i % 2 ? K.chrome : K.chromeD);
  }
  fin(tail, [-1.5, 36.5, -22], [-1.5, 42, -18.5], 2.2, 2, (t, k) => (t > 0.86 ? { c: K.cyan, glow: true } : Math.abs(k) < 0.35 ? MAG : K.chromeL));

  for (const g of [body, head, jaw, arm, leg, tail]) hollowOut(g, 1);
  const armR = flipX(arm), legR = flipX(leg);
  const R = (p) => [-1 - p[0], p[1], p[2]];
  return {
    gait: 'walk', voxel: MEGA_VOXEL, jitter: 0.015, finish: 'gloss', mega: true,
    parts: [
      jp('legL', leg, LJ), jp('legR', legR, R(LJ)),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', arm, SJ, [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, R(SJ), [-0.5, 0, 0], { parent: 'body' }),
      jp('spin', ring, RJ, [-0.5, 0, 0], { parent: 'body' }),
      jp('head', head, NJ),
      jp('jaw', jaw, JJ, NJ, { parent: 'head', rot: [0.3, 0, 0] }),
      jp('antennaL', ear, AJ, NJ, { parent: 'head' }),
      jp('antennaR', earR, R(AJ), NJ, { parent: 'head' }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, 53, 24],
  };
}

// ===========================================================================
// NECROCLAW: a nightmare, shroud-corrupted Panthar. Midnight-violet fur under
// bleached bone armour: a cracked skull mask with deep sockets and toxic-green
// eyes, curling horns, a ribcage cuirass with the toxic core glowing between
// the ribs, a bone mantle with spikes and a tattered shroud cape bearing a
// torn Mega-Tech bolt, huge hooked bone claws, bone greaves, and a scorpion
// tail tipped with venom.
function necroClaw() {
  const K = {
    fur: 0x2e2244, furD: 0x170f24, furL: 0x4a3a66, muzzle: 0xe6dcbc, inner: 0x6a2a5a, nose: 0x0a0710, claw: 0xe6dcbc, joint: 0x241a33,
    bone: 0xe8dfc2, boneL: 0xf6f0dc, boneD: 0xb6a885, boneDD: 0x77694c, void: 0x0c0814,
    toxic: 0x8cff3a, toxicD: 0x3f9a2a, toxicHot: 0xe2ffb0,
    shroud: 0x3b2a55, shroudD: 0x241835, shroudL: 0x56407a,
  };
  const furFn = (x, y, z) => { const v = n3(x, y, z, 21); return v < 0.14 ? K.furD : v > 0.95 ? K.furL : K.fur; };
  const boneCol = (x, y, z) => { const v = n3(x, y, z, 23); return v < 0.06 ? K.boneD : v > 0.94 ? K.boneL : K.bone; };
  const isBone = (c) => c === K.bone || c === K.boneL || c === K.boneD;
  const m = megaBeast(K, { furFn, face: false, fist: false });
  const { body, head, jaw, arm, leg, tail } = m;
  const C = J.head;

  // ------------------------------------------------------------ head: skull mask, sockets, horns
  // bone skull mask over the upper face
  blob(head, C[0], C[1] + 2.4, C[2] + 3.6, 11.4, 7.6, 7.2, boneCol, { p: 2.3, clip: (x, y, z) => z < C[2] + 2 || y < C[1] - 3 });
  // deep angry eye sockets with toxic eyes
  const SOCK_L = [
    'VV.......',
    'VVVV.....',
    'VVVVVV...',
    '.VVEEVVV.',
    '.VVEHEVVV',
    '..VVEEVV.',
    '...VVVV..',
  ];
  stamp(head, SOCK_L, { V: { c: K.void, carve: true }, E: { c: K.toxic, glow: true, carve: true }, H: { c: K.toxicHot, glow: true, carve: true } }, { axis: 'z', x: -11, y: C[1] + 6, mirror: true, zmin: C[2], carveDepth: 2 });
  for (const s of [-1, 1]) {
    // heavy V brow ridge
    capsule(head, [-0.5 + s * 11, C[1] + 8.4, C[2] + 5], [-0.5 + s * 1.6, C[1] + 5.6, C[2] + 10.6], 1.8, 1.5, K.boneL);
    // curling horns
    chain(head, [[-0.5 + s * 7, C[1] + 7.5, C[2] + 2], [-0.5 + s * 12, C[1] + 12.5, C[2] - 1], [-0.5 + s * 13.5, C[1] + 18, C[2] - 6], [-0.5 + s * 11.5, C[1] + 21, C[2] - 11]], [2.8, 2.2, 1.3, 0.3],
      (x, y, z, t) => (Math.floor(t * 9) % 3 === 0 ? K.boneD : K.bone));
  }
  // nasal cavity, cracks and the corrupted Mega-Tech bolt on the brow
  stamp(head, ['VVVVVV', '.VVVV.', '..VV..'], { V: K.void }, { axis: 'z', x: -3, y: C[1] - 1, zmin: C[2] + 6 });
  stamp(head, ['...MMM', '..MMM.', '.MMM..', 'MMMMMM', '..MMM.', '..MM..', '.MM...', '.M....'], { M: { c: MAG, raise: 1 } }, { axis: 'z', x: -3, y: C[1] + 14, zmin: C[2] });
  for (const [x, y, gl] of [[4, 66, false], [5, 65, false], [5, 64, true], [6, 63, false], [-7, 67, false], [-8, 66, false], [-8, 65, false]]) {
    const z = frontZ(head, x, y, C[2]);
    if (z !== null) head.set(x, y, z, gl ? K.toxic : K.boneDD, gl);
  }
  // torn left ear
  head.carve((x, y, z) => x <= -9 && x >= -12 && y >= C[1] + 11 && y <= C[1] + 13 && z <= C[2] - 2);
  gradY(head, C[1] - 12, C[1] + 20, -0.12, 0.06, (x, y, z, c) => isBone(c));

  // ------------------------------------------------------------ jaw: bone jaw, jagged fangs, venom drool
  jaw.paint((x, y, z, c) => (c === TONGUE ? K.toxicD : undefined));
  for (const [x, z, n] of [[-4, C[2] + 13, 3], [3, C[2] + 11, 4], [-1, C[2] + 15, 2]]) {
    for (let i = 0; i < n; i++) jaw.set(x, C[1] - 18 - i, z, i === n - 1 ? K.toxic : K.toxicD, i >= n - 2);
  }
  for (const x of [-4, 3]) for (let y = C[1] - 12; y <= C[1] - 9; y++) jaw.set(x, y, C[2] + 14, TOOTH);

  // ------------------------------------------------------------ body: ribcage cuirass, toxic core, bone mantle, belt
  // shroud-dark chest under the ribs with toxic glow seeping between them
  body.paint((x, y, z) => (y >= 33 && y <= 47 && z >= 6 && Math.abs(x + 0.5) <= 9 ? K.void : undefined));
  for (let i = 0; i < 4; i++) {
    const y = 46 - i * 3.5;
    for (const s of [-1, 1]) {
      chain(body, [[-0.5 + s * 1.5, y, 10], [-0.5 + s * 5, y - 0.6, 10], [-0.5 + s * 9.5, y - 1.4, 8.4], [-0.5 + s * 13.4, y - 2.6, 4]], [1.3, 1.2, 1.1, 0.8], boneCol);
    }
  }
  rbox(body, -2, 33, 9, 1, 48, 11, 1, boneCol); // sternum
  for (const [x, y] of [[-5, 44], [4, 44], [-6, 40], [5, 40], [-5, 37], [4, 37]]) { const z = frontZ(body, x, y, 4); if (z !== null && body.get(x, y, z) === K.void) body.set(x, y, z, K.toxic, true); }
  for (const [x, y] of [[-7, 44], [6, 44], [-3, 41], [2, 41], [-8, 37], [7, 37]]) { const z = frontZ(body, x, y, 4); if (z !== null && body.get(x, y, z) === K.void) body.set(x, y, z, K.toxicD); }
  // bone mantle around the shoulders with back spikes
  blob(body, -0.5, 48.6, -1, 11, 2.2, 8.4, boneCol, { p: 2.4 });
  for (const [x, z, h] of [[-6, -6, 6], [5, -6, 6], [-0.5, -8, 8], [-9, -2, 5], [8, -2, 5]]) capsule(body, [x, 49, z], [x * 1.15, 49 + h, z - 4], 1.6, 0.3, (xx, yy, zz, t) => (t > 0.7 ? K.boneL : K.bone));
  // belt of bone plates + skull-ish buckle
  blob(body, -0.5, 24.5, 0, 10.4, 1.6, 7.6, (x) => ((x + 40) % 4 === 0 ? K.boneDD : K.boneD), { p: 2.6 });
  blob(body, -0.5, 24.5, 7.6, 3, 2.6, 1.6, boneCol);
  for (const x of [-2, 1]) body.set(x, 25, frontZ(body, x, 25) ?? 9, K.void);
  gradY(body, 21, 51, -0.12, 0.05, (x, y, z, c) => c === K.fur || c === K.furD || c === K.furL);

  // ------------------------------------------------------------ shroud cape (tattered, with a torn magenta bolt)
  const CJ = [-0.5, 48, -6];
  const cape = G();
  for (let y = 48; y >= 16; y--) {
    const t = (48 - y) / 32;
    const hw = 10 + t * 4.5;
    const zc = -8.5 - t * 6 - Math.sin(t * Math.PI) * 1.2;
    for (let x = Math.floor(-0.5 - hw); x <= Math.ceil(-0.5 + hw); x++) {
      const u = (x + 0.5) / hw; // -1..1 across
      // tattered hem: ragged lengths per column, plus a few holes
      const hem = 16 + Math.floor(n3(x, 0, 0, 31) * 7) + (Math.abs(u) > 0.85 ? 4 : 0);
      if (y < hem) continue;
      if (n3(x, y, 0, 33) < 0.035 && y < 40) continue;
      const z = Math.round(zc + u * u * 3.2 + Math.sin(x * 0.9) * 0.6);
      const c = y <= hem + 1 ? K.shroudD : (x + 40) % 5 === 0 ? K.shroudL : K.shroud;
      cape.set(x, y, z, c);
      cape.set(x, y, z + 1, K.shroudD);
    }
  }
  stamp(cape, MEGA_BOLT, { M: { c: MAG }, W: { c: K.shroudD }, C: { c: K.toxic, glow: true } }, { axis: '-z', x: -5, y: 40, zmin: -30, zmax: 0 });

  // ------------------------------------------------------------ arms: bone vambraces, pauldrons, giant hooked claws
  const isFur = (c) => c === K.fur || c === K.furD || c === K.furL;
  capsule(arm, [-20.6, 32.5, 1.5], [-21, 25.5, 3.5], 4.9, 5.3, boneCol, { clip: (x) => x > -23 }); // outer bone vambrace
  for (const y of [27, 30]) for (let z = -3; z <= 9; z++) { const sx = sideX(arm, y, z, -1); if (sx !== null && isBone(arm.get(sx, y, z))) arm.set(sx, y, z, K.boneDD); }
  for (const [y, z] of [[31, 0], [28, 1], [25, 2]]) capsule(arm, [-25, y, z], [-29.5, y + 3, z - 3.5], 1.3, 0.3, K.boneL);
  for (const [x, y] of [[-18, 30], [-17, 29], [-17, 27], [-18, 26]]) { const z = frontZ(arm, x, y); if (z !== null) arm.set(x, y, z, K.toxic, y === 29 || y === 27); }
  // claw hand: dark palm + three huge hooked bone claws + a thumb claw
  blob(arm, -21.3, 21, 4.6, 4.9, 4.2, 5, furFn, { p: 2.4 });
  for (const dx of [-3.4, 0, 3.4]) {
    const fx = -21.3 + dx;
    blob(arm, fx, 20.6, 8.8, 1.7, 1.9, 1.7, K.furD); // knuckle
    chain(arm, [[fx, 20.8, 9.6], [fx, 20.4, 13.8], [fx, 18.4, 17.6], [fx, 14.6, 20], [fx, 10.6, 19.6]], [1.3, 1.15, 0.9, 0.55, 0.15],
      (x, y, z, t) => (z >= 19 && y < 15 ? K.boneDD : z >= 17 ? K.boneL : K.bone));
  }
  chain(arm, [[-16.6, 20.5, 6], [-14.6, 18.6, 10], [-14.8, 15, 12.8], [-15.6, 12.6, 12.6]], [1.2, 0.9, 0.5, 0.15], boneCol);
  // bone pauldron with three spikes
  blob(arm, -18.4, 48.6, 0, 7, 4.8, 7.4, boneCol, { p: 2.3, clip: (x, y) => y < 46 || x > -11 });
  for (const [a, b] of [[[-21, 52, -3], [-24.5, 58.5, -6.5]], [[-23.5, 50.5, 1], [-29.5, 54, 1.5]], [[-19, 53, 3.5], [-20, 59.5, 6]]]) capsule(arm, a, b, 1.8, 0.3, (x, y, z, t) => (t > 0.6 ? K.boneL : K.bone));
  arm.paint((x, y, z, c) => (isBone(c) && (y === 46 || y === 47) && !arm.has(x, y - 1, z) ? K.boneDD : undefined));
  gradY(arm, 12, 56, -0.1, 0.05, (x, y, z, c) => isFur(c));

  // ------------------------------------------------------------ legs: bone greaves + kneecaps, bone toe claws
  blob(leg, -8.4, 10, 3.2, 4.4, 4.6, 3, boneCol, { p: 2.4, clip: (x, y, z) => z < 2 });
  blob(leg, -8.4, 15.2, 4.6, 3.6, 3.6, 2.4, K.boneL, { p: 2.3 });
  capsule(leg, [-8.4, 16, 6.5], [-8.4, 19.5, 9.5], 1.3, 0.3, K.bone);
  for (const y of [8, 11]) for (let x = -12; x <= -5; x++) { const z = frontZ(leg, x, y); if (z !== null && isBone(leg.get(x, y, z))) leg.set(x, y, z, K.boneDD); }
  for (const dx of [-3, 0, 3]) chain(leg, [[-8.4 + dx, 2, 10], [-8.4 + dx, 1.4, 12.6], [-8.4 + dx, 0, 14]], [1, 0.7, 0.2], boneCol);
  gradY(leg, 0, 27, -0.14, 0.04, (x, y, z, c) => isFur(c));

  // ------------------------------------------------------------ tail: bone vertebrae + venom stinger
  for (const [y, z] of [[26.5, -12], [25.6, -16], [27, -19.5], [30, -22], [34, -22.6]]) blob(tail, -0.5, y + 1.6, z, 1.4, 1.2, 1.6, K.bone);
  chain(tail, [[-0.5, 38, -21], [-0.5, 42.5, -17.5], [-0.5, 44, -13], [-0.5, 42.5, -10]], [2.2, 1.6, 0.9, 0.2], (x, y, z, t) => (t > 0.85 ? K.toxic : K.bone));
  glowWhere(tail, (x, y, z, c) => c === K.toxic);

  return packBeast(m, { parts: [jp('cape', cape, CJ, [-0.5, 0, 0], { parent: 'body' })] });
}

// ===========================================================================
// CYBER GLITCH: a glitching digital monster built from a "unique fusion of
// materials": chunky indigo pixel-mosaic plastic, RGB-split magenta/cyan
// edges where horizontal slices of its body have glitched sideways, a right
// forearm that has de-rendered into a cyan hologram wireframe, a wide pixel
// grin, one angry eye and one corrupted double-image eye, stair-stepped pixel
// ears and crest, floating pixel debris and a tail of shrinking cubes ending
// in a magenta bolt.

/** Shift horizontal bands of a grid sideways and paint RGB-split edges on them. bands: [[y0, y1, dx]] */
function glitchShift(g, bands, lead = MAG, trail = 0x22e6ff) {
  const moved = [];
  g.forEach((x, y, z, c, gl) => {
    for (const [y0, y1, dx] of bands) if (y >= y0 && y <= y1) { moved.push([x, y, z, c, gl, dx]); break; }
  });
  for (const [x, y, z] of moved) g.del(x, y, z);
  for (const [x, y, z, c, gl, dx] of moved) g.set(x + dx, y, z, c, gl);
  // RGB split: the leading edge of each shifted row turns magenta, the trailing edge cyan
  const rows = new Map();
  for (const [x, y, z, , , dx] of moved) {
    const k = y + ',' + z;
    const r = rows.get(k) ?? { y, z, lo: Infinity, hi: -Infinity, dx };
    r.lo = Math.min(r.lo, x + dx); r.hi = Math.max(r.hi, x + dx);
    rows.set(k, r);
  }
  for (const r of rows.values()) {
    if (!isFinite(r.lo)) continue;
    const [a, b] = r.dx > 0 ? [lead, trail] : [trail, lead];
    if (g.has(r.hi, r.y, r.z)) g.set(r.hi, r.y, r.z, a);
    if (g.has(r.lo, r.y, r.z)) g.set(r.lo, r.y, r.z, b);
  }
  return g;
}

/** Replace the voxels of a grid inside box [x0..x1, y0..y1, z0..z1] by a wireframe of their surface. */
function hologram(g, [x0, y0, z0, x1, y1, z1], step, col) {
  const inside = new Set();
  const key = (x, y, z) => x + ',' + y + ',' + z;
  g.forEach((x, y, z) => { if (x >= x0 && x <= x1 && y >= y0 && y <= y1 && z >= z0 && z <= z1) inside.add(key(x, y, z)); });
  const isIn = (x, y, z) => inside.has(key(x, y, z));
  const keep = [];
  for (const k of inside) {
    const [x, y, z] = k.split(',').map(Number);
    const ox = !isIn(x + 1, y, z) || !isIn(x - 1, y, z), oy = !isIn(x, y + 1, z) || !isIn(x, y - 1, z), oz = !isIn(x, y, z + 1) || !isIn(x, y, z - 1);
    if (!ox && !oy && !oz) continue;
    const m = (v) => ((v % step) + step) % step === 0;
    let on = false;
    if (oz) on = on || m(x) || m(y);
    if (ox) on = on || m(y) || m(z);
    if (oy) on = on || m(x) || m(z);
    if (on) keep.push([x, y, z]);
  }
  for (const k of inside) { const [x, y, z] = k.split(',').map(Number); g.del(x, y, z); }
  for (const [x, y, z] of keep) g.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
  return g;
}

function cyberGlitch() {
  const K = {
    base: 0x35257a, baseL: 0x4e3aa4, baseD: 0x21164e, mag: 0xff2ea6, magL: 0xff92d4, cyan: 0x22e6ff, cyanL: 0xa6f8ff, cyanD: 0x1690c0,
    white: 0xf4f0ff, black: 0x0a0818, joint: 0x15102e, tongue: 0xff4fb8,
  };
  // pixel mosaic: 2x2x2 cells of three tones + rare dead pixels
  const pix = (x, y, z) => {
    const v = n3(Math.floor((x + 64) / 2), Math.floor((y + 64) / 2), Math.floor((z + 64) / 2), 41);
    if (v > 0.985) return v > 0.9925 ? K.mag : K.cyan;
    return v < 0.25 ? K.baseD : v > 0.8 ? K.baseL : K.base;
  };
  const isBase = (c) => c === K.base || c === K.baseL || c === K.baseD;
  const C = J.head;

  // ------------------------------------------------------------ body (boxy)
  const body = G();
  blob(body, -0.5, 26, 0, 9.4, 4.8, 6.8, pix, { p: 3.6 }); // pelvis
  blob(body, -0.5, 32, 0.5, 9, 5.4, 7, pix, { p: 3.6 }); // waist
  blob(body, -0.5, 41, 0, 14.4, 7.8, 9.2, pix, { p: 4 }); // chest
  blob(body, -0.5, 47.5, -1.5, 10, 4, 7, pix, { p: 3.6 }); // traps
  // pixel abs grid
  body.paint((x, y, z, c) => {
    if (y < 27 || y > 36 || z < 5 || Math.abs(x + 0.5) > 6.6) return undefined;
    return (y === 30 || y === 33 || Math.abs(x + 0.5) < 0.6) ? K.baseD : K.baseL;
  });
  // the Mega-Tech bolt as pixel art with a cyan RGB ghost offset behind it
  stamp(body, MEGA_BOLT, { M: { c: K.cyan, raise: 1 }, W: { c: K.cyan, raise: 1 }, C: { c: K.cyan, raise: 1 } }, { axis: 'z', x: -6, y: 46, zmin: 4 });
  stamp(body, MEGA_BOLT, { M: { c: K.mag, raise: 2 }, W: { c: K.white, raise: 2 }, C: { c: K.cyanL, raise: 2, glow: true } }, { axis: 'z', x: -5, y: 45, zmin: 4 });
  // chunky pixel belt
  blob(body, -0.5, 24.5, 0, 10.2, 1.4, 7.4, (x) => ((x + 40) % 4 < 2 ? K.mag : K.black), { p: 4 });
  // glitch slices + floating pixel debris
  glitchShift(body, [[37, 38, 2], [43, 43, -2], [29, 29, 1]]);
  for (const [x, y, z, s] of [[-17, 30, 6, 1], [16, 34, 5, 1], [-14, 52, -6, 0], [13, 50, -8, 1], [-6, 54, -11, 0]]) {
    rbox(body, x, y, z, x + s, y + s, z + s, 0, s ? K.mag : K.cyan);
  }
  gradY(body, 21, 51, -0.12, 0.06, (x, y, z, c) => isBase(c));

  // ------------------------------------------------------------ head (blocky beast, wide pixel grin)
  const head = G();
  blob(head, C[0], C[1], C[2], 12.4, 9.2, 9.4, pix, { p: 4.2 });
  blob(head, C[0], C[1] - 5.5, C[2] + 3, 11.4, 4.6, 7.4, pix, { p: 4 }); // jowls
  // stair-stepped pixel ears with magenta inners
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const w = 4 - Math.floor(i * 0.7), cx = -0.5 + s * (8.6 + i * 0.55);
      rbox(head, Math.round(cx - w), C[1] + 6 + i * 2, C[2] - 5, Math.round(cx + w), C[1] + 7 + i * 2, C[2] + 1, 0, i >= 4 ? K.cyan : pix);
      if (i < 4) rbox(head, Math.round(cx - w + 1), C[1] + 6 + i * 2, C[2] + 2, Math.round(cx + w - 1), C[1] + 7 + i * 2, C[2] + 2, 0, K.mag);
    }
  }
  // pixel crest along the top
  for (let i = 0; i < 6; i++) {
    const z = C[2] + 6 - i * 3, h = 2 + (i % 3);
    const top = topY(head, -1, z) ?? C[1] + 8;
    rbox(head, -2, top + 1, z - 1, 1, top + h, z, 0, i % 2 ? K.cyan : K.mag);
  }
  // wide grin: blocky mouth with 2x2 teeth and a pixel tongue
  const mT = C[1] - 2, mB = C[1] - 9;
  head.carve((x, y, z) => y >= mB && y <= mT && Math.abs(x + 0.5) <= 9 && z >= C[2] + 4);
  for (let x = -10; x <= 9; x++) for (let y = mB; y <= mT; y++) {
    if (Math.abs(x + 0.5) > 9) continue;
    head.set(x, y, C[2] + 4, K.black);
  }
  for (let x = -9; x <= 8; x += 3) {
    const fz = frontZ(head, x, mT + 1, C[2]) ?? C[2] + 11;
    head.box(x, mT - 1, fz - 1, x + 1, mT, fz, K.white);
  }
  head.carve((x, y, z) => y < mB && z >= C[2] + 2);
  // eyes: left angry, right corrupted (double image)
  const EYE_L = [
    'BB.......',
    'BBBB.....',
    'WWBBBB...',
    'WWWWWBBB.',
    'WWWWWWWBB',
    'WWWWWPPPW',
    'WWWWWPPPW',
    '.WWWWPPPW',
    '..WWWWWW.',
  ];
  stamp(head, EYE_L, { B: { c: K.mag, raise: 1 }, W: K.white, P: { c: K.cyan, glow: true } }, { axis: 'z', x: -11, y: C[1] + 8, zmin: C[2] });
  const EYE_R = rev(EYE_L);
  stamp(head, EYE_R.map((r) => r.replace(/[WP]/g, 'G')), { G: { c: K.cyanD } }, { axis: 'z', x: 3, y: C[1] + 7, zmin: C[2] });
  stamp(head, EYE_R, { B: { c: K.mag, raise: 1 }, W: K.white, P: { c: K.mag, glow: true } }, { axis: 'z', x: 1, y: C[1] + 9, zmin: C[2] });
  glitchShift(head, [[C[1] + 2, C[1] + 3, -2], [C[1] - 4, C[1] - 4, 2]]);
  gradY(head, C[1] - 12, C[1] + 12, -0.1, 0.08, (x, y, z, c) => isBase(c));

  // ------------------------------------------------------------ jaw: block jaw with up-teeth
  const JJ = [-0.5, C[1] - 9, C[2] + 2];
  const jaw = G();
  blob(jaw, -0.5, C[1] - 12.5, C[2] + 6.5, 9.4, 3.2, 6.4, pix, { p: 4 });
  jaw.carve((x, y, z) => y >= C[1] - 10 && z >= C[2] + 3 && Math.abs(x + 0.5) <= 7.6);
  for (let x = -8; x <= 7; x++) for (let z = C[2] + 3; z <= C[2] + 12; z++) if (jaw.has(x, C[1] - 11, z)) jaw.set(x, C[1] - 11, z, Math.abs(x + 0.5) <= 3 && z <= C[2] + 9 ? K.tongue : K.black);
  for (let x = -8; x <= 7; x += 3) {
    const fz = frontZ(jaw, x, C[1] - 11, C[2]) ?? C[2] + 12;
    jaw.box(x, C[1] - 10, fz - 1, x + 1, C[1] - 9, fz, K.white);
  }

  // ------------------------------------------------------------ arm (left: solid; right: hologram forearm)
  const S = J.shoulder;
  const arm = G();
  blob(arm, S[0], S[1], S[2], 4.4, 4.4, 4.4, K.joint);
  blob(arm, -18.6, 40, 0.6, 5, 5.6, 5, pix, { p: 3.4 }); // upper arm
  blob(arm, -20.3, 34.2, 1.2, 3.6, 3.6, 3.6, K.joint); // elbow
  blob(arm, -21, 29, 2.6, 5.6, 5.2, 5.8, pix, { p: 3.6 }); // forearm
  blob(arm, -21.3, 20.4, 4.8, 5.4, 4.6, 5.6, pix, { p: 4 }); // block fist
  for (const dx of [-3.5, -0.5, 2.5]) {
    const fx = Math.round(-21.3 + dx);
    arm.box(fx - 1, 18, 10, fx, 20, 11, K.baseL);
    arm.box(fx - 1, 16, 12, fx, 18, 13, K.white); // pixel claws
    arm.box(fx - 1, 14, 13, fx, 15, 14, K.white);
  }
  // shoulder: stacked cube pauldron (RGB)
  for (const [x, y, z, w, c] of [[-19, 49, -3, 3, K.mag], [-22, 47, 0, 3, K.baseL], [-19, 49, 2, 3, K.cyan], [-15, 51, -1, 2, K.baseL], [-23, 50, -4, 2, K.cyan], [-22, 50, 4, 2, K.mag]]) {
    rbox(arm, x - w, y - w, z - w, x + w, y + w, z + w, 0, c);
  }
  glitchShift(arm, [[30, 31, -2], [22, 22, 1]]);
  gradY(arm, 14, 54, -0.1, 0.06, (x, y, z, c) => isBase(c));
  const armR = flipX(arm);
  hologram(armR, [13, 13, -6, 30, 32, 16], 2, (x, y) => (y % 4 === 0 ? K.cyanL : K.cyan));
  for (const [x, y, z] of [[22, 25, 10], [19, 28, 9], [24, 21, 4]]) armR.set(x, y, z, K.cyanL, true);

  // ------------------------------------------------------------ leg (left)
  const H = J.hip;
  const leg = G();
  blob(leg, H[0], H[1], H[2], 4.3, 4.3, 4.3, K.joint);
  blob(leg, -8.4, 20.4, 0.8, 5.6, 5.8, 5.6, pix, { p: 3.6 }); // thigh
  blob(leg, -8.4, 14.6, 1.4, 3.7, 3.7, 3.7, K.joint);
  blob(leg, -8.4, 9.6, 1.4, 4.6, 4.6, 4.6, pix, { p: 3.8 }); // shin
  rbox(leg, -14, 0, -4, -3, 4, 8, 1, pix); // block foot
  for (const dx of [-3, 0, 3]) leg.box(Math.round(-8.4 + dx) - 1, 0, 9, Math.round(-8.4 + dx), 2, 11, K.white);
  rbox(leg, -12, 12, 4, -5, 16, 6, 0, K.mag); // knee block
  rbox(leg, -11, 13, 7, -6, 15, 7, 0, K.white);
  glitchShift(leg, [[18, 19, -2], [6, 6, 1]]);
  gradY(leg, 0, 27, -0.12, 0.05, (x, y, z, c) => isBase(c));
  const legR = flipX(leg);

  // ------------------------------------------------------------ tail: shrinking cubes ending in a pixel bolt
  const TJ = J.tail;
  const tail = G();
  const tpts = [[-0.5, 28, -7], [-0.5, 25, -12], [-0.5, 25.5, -17], [-0.5, 29, -21], [-0.5, 34, -22.5], [-0.5, 38.5, -21]];
  tpts.forEach(([x, y, z], i) => {
    const w = Math.max(1, 3 - Math.floor(i * 0.45));
    rbox(tail, Math.round(x - w), Math.round(y - w), Math.round(z - w), Math.round(x + w - 1), Math.round(y + w - 1), Math.round(z + w - 1), 0, i % 2 ? K.baseL : K.base);
  });
  const TB = ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'];
  TB.forEach((row, r) => [...row].forEach((ch, u) => { if (ch === 'M') for (const x of [-1, 0]) tail.set(x, 45 - r, -21 + u - 1, K.mag); }));

  // ------------------------------------------------------------ floating pixel debris (sways)
  const AJ = [-14, 56, -2];
  const bits = G();
  for (const [x, y, z, s, c, gl] of [[-18, 60, -2, 1, K.mag, false], [-15, 64, 1, 0, K.cyan, true], [-21, 56, 3, 0, K.cyanL, false], [-12, 61, -6, 1, K.cyan, false], [-23, 62, -4, 0, K.mag, true]]) {
    for (let dx = 0; dx <= s; dx++) for (let dy = 0; dy <= s; dy++) for (let dz = 0; dz <= s; dz++) bits.set(x + dx, y + dy, z + dz, c, gl);
  }
  const bitsR = flipX(bits);

  for (const g of [body, head, jaw, arm, armR, leg, legR, tail]) hollowOut(g, 1);
  const R = (p) => [-1 - p[0], p[1], p[2]];
  return {
    gait: 'walk', voxel: MEGA_VOXEL, jitter: 0.02, finish: 'toy', mega: true,
    parts: [
      jp('legL', leg, H), jp('legR', legR, R(H)),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', arm, S, [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, R(S), [-0.5, 0, 0], { parent: 'body' }),
      jp('head', head, J.neck),
      jp('jaw', jaw, JJ, J.neck, { parent: 'head', rot: [0.18, 0, 0] }),
      jp('antennaL', bits, AJ, [-0.5, 0, 0], { parent: 'body' }),
      jp('antennaR', bitsR, R(AJ), [-0.5, 0, 0], { parent: 'body' }),
      jp('tail', tail, TJ),
    ],
    muzzle: [-0.5, C[1] - 6, C[2] + 14],
  };
}

export const MEGA_MODELS = {
  panthar,
  silverByte,
  necroClaw,
  cyberGlitch,
};
