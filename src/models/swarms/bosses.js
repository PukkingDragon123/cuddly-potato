// Bosses: oversized toy sculpts (scaled ~3x in battle). Hi-res (0.05) with
// the same house style as the Swarms: chunky silhouette, huge angry face,
// open toothy mouth, neon colours and MrBeast-magenta accents.
// See ../kit.js and ./panthers.js for the modelling conventions (model faces
// +Z, y = 0 ground, x symmetric around -0.5, parts in absolute coordinates
// attached with jp() at their joints).
// eslint-disable-next-line no-unused-vars
import { G, blob, rbox, capsule, chain, cyl, stamp, eyes, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, part, shade, mixHex, mottle, frontZ } from '../kit.js';

const MAG = 0xff1f9e; // MrBeast magenta
const MAG_D = 0xc8107a, MAG_L = 0xff7ccc;
const INK = 0x15121f;
const TOOTH = 0xffffff;
const MOUTH = 0x2a0a1e;
const TONGUE = 0xff5a9a;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}

/**
 * Wire-mesh shell: draws the surface of the solid `inside(x,y,z)` (within the
 * bounding box) as a grid of wires `step` apart, leaving gaps to see through.
 * Wires are coloured by col(x,y,z).
 */
function wireShell(g, inside, [x0, y0, z0, x1, y1, z1], step, col) {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
    if (!inside(x, y, z)) continue;
    const ox = !inside(x + 1, y, z) || !inside(x - 1, y, z);
    const oy = !inside(x, y + 1, z) || !inside(x, y - 1, z);
    const oz = !inside(x, y, z + 1) || !inside(x, y, z - 1);
    if (!ox && !oy && !oz) continue;
    const m = (v) => ((v % step) + step) % step === 0;
    let on = false;
    if (oz) on = on || m(x) || m(y);
    if (ox) on = on || m(y) || m(z);
    if (oy) on = on || m(x) || m(z);
    if ((ox ? 1 : 0) + (oy ? 1 : 0) + (oz ? 1 : 0) >= 2) on = true; // edges are solid
    if (on) g.set(x, y, z, typeof col === 'function' ? col(x, y, z) : col);
  }
  return g;
}

/** Remove interior voxels deeper than d from the surface (keeps the look, trims the voxel count). */
function hollowOut(g, d = 2) {
  const kill = [];
  g.forEach((x, y, z) => {
    for (let dx = -d; dx <= d; dx++) for (let dy = -d; dy <= d; dy++) for (let dz = -d; dz <= d; dz++) if (!g.has(x + dx, y + dy, z + dz)) return;
    kill.push([x, y, z]);
  });
  for (const [x, y, z] of kill) g.del(x, y, z);
  return g;
}

// ===========================================================================
// Cart Kong: a gorilla-shaped monster assembled from wrecked shopping carts.
// Its hunched torso is a wire basket stuffed with groceries (cereal, milk,
// a watermelon, bananas, a baguette and celery poking out of the top), a bent
// magenta cart handle forms its furious brow over glowing red eyes, the jaw
// is a chunky plastic child seat full of teeth, and it knuckle-walks on giant
// plastic fists and rattling castor wheels.
function cartKong() {
  const K = {
    wire: 0xc8d0dc, wireD: 0x8a94a8, chrome: 0xeef2f8, plastic: 0xf0303c, plasticD: 0xb81e2a, seat: 0x4a4f66, seatD: 0x33374a, face: 0x3a3f56, faceD: 0x262a3c,
    muzzle: 0x8a90a8, rubber: 0x1c1c26, hub: 0xb8c0cc, eye: 0xff3a2a, eyeHot: 0xffd0a0,
  };
  const wireCol = (x, y, z) => (n3(x, y, z, 3) < 0.18 ? K.wireD : K.wire);

  // ------------------------------------------------------------ legs: chrome posts + castor wheels (wheels spin)
  const leg = G();
  const LX = -6;
  cyl(leg, 'y', LX, -6, 4, 11, 1.4, 1.4, K.chrome);
  wireShell(leg, (x, y, z) => Math.abs(x - LX) <= 2.6 && y >= 5 && y <= 11 && z >= -8.6 && z <= -3.4, [LX - 4, 4, -10, LX + 4, 12, -2], 2, wireCol);
  rbox(leg, LX - 2, 4, -8, LX + 2, 5, -4, 0, K.plasticD); // bumper plate
  // castor fork
  rbox(leg, LX - 1.5, 3, -7, LX + 1.5, 4, -5, 0, K.chrome);
  for (const dx of [-2, 2]) rbox(leg, LX + dx, 1, -6.5, LX + dx, 3, -5.5, 0, K.chrome);
  const wheel = (cx, cy, cz, r = 2.4) => {
    const w = G();
    cyl(w, 'x', cy, cz, cx - 1, cx + 1, r, r, (x, y, z) => (Math.hypot(y - cy, z - cz) < 1 ? K.hub : K.rubber));
    w.set(cx - 1 - (cx < -0.5 ? 0 : 0), Math.round(cy + r - 0.5), Math.round(cz), K.hub);
    return w;
  };
  const wheelL = wheel(LX, 2.4, -6);
  const legR = flipX(leg), wheelR = flipX(wheelL);

  // ------------------------------------------------------------ body: hunched wire-basket torso full of groceries
  const body = G();
  const hw = (y) => 8 + (y - 9) * 0.2;
  const ytop = (z) => 26 - Math.max(0, -z - 1) * 0.75;
  const inBasket = (x, y, z) => y >= 9 && z >= -10 && z <= 6 && Math.abs(x + 0.5) <= hw(y) && y <= ytop(z);
  wireShell(body, inBasket, [-15, 8, -11, 14, 27, 7], 3, wireCol);
  // chrome rim + magenta plastic bumper bands along the shoulders and hips
  body.forEach((x, y, z) => {
    if (!inBasket(x, y, z)) return;
    const top = !inBasket(x, y + 1, z);
    if (top) body.set(x, y, z, K.chrome);
    if (y === 9 || y === 10) body.set(x, y, z, (x + z + 40) % 6 < 3 ? K.plastic : K.plasticD);
  });
  for (let x = -12; x <= 11; x++) for (const [y, z] of [[24, 6], [25, 6]]) if (Math.abs(x + 0.5) <= hw(y) + 0.5) body.set(x, y, z + 1, K.plastic);
  // child-seat flap on the chest (magenta, with a lightning-bolt sticker)
  rbox(body, -6, 13, 6, 5, 21, 7, 1, MAG);
  stamp(body, ['..WWW', '.WWW.', 'WWW..', 'WWWWW', '..WW.', '.WW..', 'WW...'], { W: 0xffffff }, { axis: 'z', x: -3, y: 20, zmin: 6 });
  // groceries inside (visible through the mesh) and poking out of the top
  rbox(body, -7, 10, -6, -2, 23, -2, 0, (x, y) => (y >= 17 && y <= 19 ? 0xffffff : y > 19 ? 0xff3a3a : 0xffd23f)); // cereal box
  rbox(body, 2, 10, -7, 6, 20, -3, 0, (x, y) => (y >= 18 ? 0x2a7cff : 0xfafafa)); // milk carton
  rbox(body, 2, 21, -6, 6, 22, -4, 0, 0x2a7cff);
  blob(body, -0.5, 13, 1, 4.6, 4, 4.4, (x, y, z) => ((Math.floor(Math.atan2(z - 1, x + 0.5) * 3) % 2) ? 0x2e9a3a : 0x5fd04a)); // watermelon
  blob(body, -6, 12, 2.5, 1.8, 1.8, 1.8, 0xff2a3a); blob(body, 5, 12, 2.5, 1.8, 1.8, 1.8, 0xffa21a); // apple + orange
  cyl(body, 'y', 5, 2.5, 14, 19, 1.4, 1.4, (x, y) => (y >= 18 ? 0xeef2f8 : y >= 16 ? 0xffffff : 0xff3a14)); // soda bottle
  // things sticking out of the top: baguette, celery stalks, banana bunch, a wrapped chocolate bar
  capsule(body, [-5, 20, -6], [-8, 30, -9], 1.5, 1.3, (x, y, z, t) => (Math.floor(t * 8) % 2 ? 0xd8a050 : 0xe8b868));
  for (const [x, z, h] of [[4, -6, 30], [5.5, -5, 29], [3, -4.5, 28.5]]) { capsule(body, [x, 20, z], [x + 0.6, h, z - 1.5], 0.7, 0.6, 0x6ac83a); blob(body, x + 0.6, h + 0.6, z - 1.5, 1.2, 1.1, 1.2, 0x9ae860); }
  for (let i = 0; i < 4; i++) chain(body, [[-1.5 + i * 1.2, 24, -3], [-1 + i * 1.5, 27, -2.5], [-0.5 + i * 1.8, 28.5, -0.5]], [0.8, 0.6], i === 3 ? 0xffe36a : 0xffd23f);
  rbox(body, -3, 24, 1, 2, 26, 3, 0, (x) => (x <= -2 ? 0xe4e8f0 : 0x1d9bf0)); // chocolate bar in a blue wrapper
  gradY(body, 8, 27, -0.1, 0.05, (x, y, z, c) => c === K.wire || c === K.wireD);

  // ------------------------------------------------------------ head: dark gorilla face plate in a wire child seat
  const HJ = [-0.5, 19, 3];
  const head = G();
  wireShell(head, (x, y, z) => Math.abs(x + 0.5) <= 6.6 && y >= 18 && y <= 30 && z >= 1 && z <= 8, [-9, 17, 0, 8, 31, 9], 2, wireCol);
  rbox(head, -7, 17, 6, 6, 29, 12, 3, (x, y, z) => (n3(x, y, z, 2) < 0.15 ? K.faceD : K.face));
  // bent magenta cart-handle brow (V-shaped = furious) with chrome brackets
  chain(head, [[-10.5, 30, 11], [-0.5, 26.6, 13.4], [9.5, 30, 11]], [1.5, 1.7, 1.5], (x, y, z) => (y >= 29 ? MAG_L : MAG));
  for (const s of [-1, 1]) capsule(head, [s < 0 ? -10.5 : 9.5, 30, 11], [s < 0 ? -8 : 7, 29, 5], 0.9, 0.9, K.chrome);
  // glowing red slanted eyes under the brow
  const EYE_L = ['RR.....', 'RRRR...', 'RhhRRR.', 'RhhPPRR', 'RRPPPR.', '.RRRR..'];
  const EYE = EYE_L.map((r) => r + [...r].reverse().join(''));
  stamp(head, EYE, { R: { c: K.eye, glow: true }, h: { c: K.eyeHot, glow: true }, P: INK }, { axis: 'z', x: -7, y: 26, zmin: 8, raise: 0 });
  // gorilla nose: small muzzle bump with flared nostrils
  blob(head, -0.5, 20, 12.6, 3, 1.5, 1.2, K.muzzle, { p: 2.2 });
  for (const x of [-2, 1]) head.set(x, 20, (frontZ(head, x, 20) ?? 13), INK);
  head.carve((x, y, z) => y < 18 && z > 5);
  for (let x = -6; x <= 5; x++) {
    const fz = frontZ(head, x, 18, -10, 20);
    if (fz === null) continue;
    head.set(x, 17, fz, TOOTH);
    if ((x + 40) % 2 === 0) head.set(x, 16, fz, TOOTH);
  }
  for (const x of [-5, 4]) for (let y = 14; y <= 17; y++) head.set(x, y, (frontZ(head, x, 18, -10, 20) ?? 12), TOOTH); // fangs
  // magenta war-bolts on the cheeks
  stamp(head, ['.MM', 'MM.', 'MMM', '.M.'], { M: MAG }, { axis: '-x', y: 22, z: 11 });
  stamp(head, ['MM.', '.MM', 'MMM', '.M.'], { M: MAG }, { axis: 'x', y: 22, z: 9 });

  // ------------------------------------------------------------ jaw: plastic child-seat jaw stuffed with teeth
  const JJ = [-0.5, 18, 5];
  const jaw = G();
  rbox(jaw, -7, 11, 4, 6, 17, 13, 2.5, (x, y) => (y <= 12 ? K.plasticD : K.seat));
  jaw.carve((x, y, z) => y >= 15 && z >= 6 && z <= 11 && Math.abs(x + 0.5) <= 5);
  for (let x = -5; x <= 4; x++) for (let z = 6; z <= 11; z++) jaw.set(x, 14, z, Math.abs(x + 0.5) <= 2.5 && z >= 8 ? TONGUE : MOUTH);
  for (let x = -6; x <= 5; x++) {
    const fz = frontZ(jaw, x, 16, -10, 20);
    if (fz === null) continue;
    jaw.set(x, 17, fz, TOOTH);
    if ((x + 41) % 2 === 0) jaw.set(x, 18, fz, TOOTH);
  }
  for (const x of [-5, 4]) for (let y = 16; y <= 20; y++) jaw.set(x, y, 12, TOOTH); // up-tusks
  // drool-proof bumper chin with grille slots
  for (let x = -5; x <= 4; x += 2) jaw.set(x, 12, 14, K.faceD);

  // ------------------------------------------------------------ arms: chrome tube upper arm, wire forearm, giant plastic fist
  const arm = G();
  blob(arm, -11, 23.5, 0, 3.2, 3, 3.2, K.chrome); // shoulder ball
  capsule(arm, [-11.5, 22, 0.5], [-13.5, 14, 3], 1.6, 1.5, K.chrome);
  blob(arm, -13.5, 14, 3, 2, 2, 2, K.wireD); // elbow
  wireShell(arm, (x, y, z) => {
    // forearm: a tapered mesh barrel from the elbow down to the wrist
    const t = (14 - y) / 8;
    if (t < 0 || t > 1) return false;
    const cx = -13.5 - t * 0.5, cz = 3 + t * 3.5, r = 3.4 + t * 0.8;
    return Math.hypot(x - cx, z - cz) <= r;
  }, [-20, 5, -3, -8, 15, 11], 3, wireCol);
  for (const y of [13, 7]) for (let x = -19; x <= -8; x++) for (let z = -2; z <= 11; z++) {
    const t = (14 - y) / 8, cx = -13.5 - t * 0.5, cz = 3 + t * 3.5, r = 3.4 + t * 0.8;
    const d = Math.hypot(x - cx, z - cz);
    if (d <= r + 0.4 && d >= r - 0.8) arm.set(x, y, z, K.plastic);
  }
  rbox(arm, -18, 1, 3, -9, 6, 11, 2, (x, y) => (y <= 2 ? K.plasticD : K.plastic)); // fist
  for (const x of [-17, -15, -13, -11]) for (let y = 3; y <= 5; y++) arm.set(x, y, 12, K.plasticD); // knuckles
  for (const x of [-16, -14, -12, -10]) arm.set(x, 5, 12, MAG_L);
  const armR = flipX(arm);
  // castor wheel under each fist (spins while walking)
  const wheelAL = wheel(-13.5, 1.6, 6.5, 1.6);
  const wheelAR = flipX(wheelAL);
  // lift the fist a touch so the castor carries it
  const lift = (g) => { const o = G(); g.forEach((x, y, z, c, gl) => o.set(x, y + 1, z, c, gl)); return o; };
  const armL2 = lift(arm), armR2 = lift(armR);

  hollowOut(head, 2);
  hollowOut(jaw, 2);
  // sit the head a little higher and prouder between the shoulders
  const headU = G(), jawU = G();
  head.forEach((x, y, z, c, gl) => headU.set(x, y + 2, z + 1, c, gl));
  jaw.forEach((x, y, z, c, gl) => jawU.set(x, y + 2, z + 1, c, gl));
  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-6, 11, -6]), jp('legR', legR, [5, 11, -6]),
      jp('wheelBL', wheelL, [-6, 2.4, -6], [-6, 11, -6], { parent: 'legL' }),
      jp('wheelBR', wheelR, [5, 2.4, -6], [5, 11, -6], { parent: 'legR' }),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', armL2, [-11, 24.5, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR2, [10, 24.5, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('wheelFL', wheelAL, [-13.5, 1.6, 6.5], [-11, 24.5, 0], { parent: 'armL' }),
      jp('wheelFR', wheelAR, [12.5, 1.6, 6.5], [10, 24.5, 0], { parent: 'armR' }),
      jp('head', headU, [HJ[0], HJ[1] + 2, HJ[2] + 1]),
      jp('jaw', jawU, [JJ[0], JJ[1] + 2, JJ[2] + 1], [HJ[0], HJ[1] + 2, HJ[2] + 1], { parent: 'head', rot: [0.2, 0, 0] }),
    ],
    muzzle: [-0.5, 20, 16],
  };
}

export const BOSS_MODELS = {
  cartKong,
};
