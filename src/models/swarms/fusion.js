// Hyper Fusion: elemental mash-ups (Magma Misfits, Frozen Freaks...). Hi-res
// (0.05) toy sculpts: chunky chibi bodies, huge angry faces with open toothy
// mouths, split/elemental colourways, glowing magma, crystal ice and stone.
// See ../kit.js and ./panthers.js for the modelling conventions (model faces
// +Z, y = 0 ground, x symmetric around -0.5, parts in absolute coordinates
// attached with jp() at their joints).
// eslint-disable-next-line no-unused-vars
import { G, blob, rbox, capsule, chain, cyl, stamp, eyes, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, part, shade, mixHex, mottle, frontZ } from '../kit.js';

const MAG = 0xff1f9e; // MrBeast magenta
const INK = 0x15121f;
const TOOTH = 0xffffff;
const MOUTH = 0x2a0a1e;
const TONGUE = 0xff5a9a;
// fire ramp (outer -> core)
const F_RED = 0xff3a14, F_ORANGE = 0xff7a1a, F_YELLOW = 0xffc21f, F_WHITE = 0xffec8a;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}
/** Mirror pixel-art rows horizontally. */
const rev = (rows) => rows.map((r) => [...r].reverse().join(''));

/**
 * Bulging cartoon eyeball on a front-facing surface with a slanted angry brow
 * slab (reads in profile too). side: -1 = model's left (x < -0.5).
 * o: white, glow, pupil, pupilGlow, pw/ph, inward/down, browCol, browT,
 *    browHi/browLo, browOut (extension past the outer corner), brow:false.
 */
function eyeBall(g, cx, cy, cz, r, side, o = {}) {
  const [rx, ry, rz] = r;
  const white = o.white ?? 0xffffff;
  const inEye = (x, y) => Math.abs(x - cx) <= rx + 1 && Math.abs(y - cy) <= ry + 1;
  blob(g, cx, cy, cz, rx, ry, rz, white, { p: 2.2, clip: (x, y, z) => z < cz - 1, glow: !!o.glow });
  const outer = cx + side * (rx + 0.5), inner = cx - side * (rx + 0.5);
  const yo = cy + ry * (o.browHi ?? 0.95), yi = cy + ry * (o.browLo ?? 0.15);
  const yLine = (x) => yo + ((x - outer) / (inner - outer)) * (yi - yo);
  if (o.brow !== false) g.carve((x, y, z, c) => c === white && inEye(x, y) && z >= cz - 1 && y > yLine(x) - 0.5);
  const pw = o.pw ?? 3, ph = o.ph ?? 3;
  const px = Math.round(cx - side * (o.inward ?? 1) - pw / 2 + 0.5), py = Math.round(cy - (o.down ?? 0.8) + ph / 2 - 0.5);
  const art = [];
  for (let v = 0; v < ph; v++) art.push('P'.repeat(pw));
  const gx = side < 0 ? 0 : pw - 1;
  if (o.glint !== false) art[0] = art[0].slice(0, gx) + 'G' + art[0].slice(gx + 1);
  stamp(g, art, { P: { c: o.pupil ?? INK, glow: !!o.pupilGlow }, G: { c: 0xffffff, glow: true } }, { axis: 'z', x: px, y: py, depth: 2 });
  if (o.brow !== false) {
    const bc = o.browCol ?? INK, bt = o.browT ?? 2;
    const ext = o.browOut ?? 1;
    const x0 = Math.floor(Math.min(outer, inner)) - (side < 0 ? ext : 0), x1 = Math.ceil(Math.max(outer, inner)) + (side > 0 ? ext : 0);
    for (let x = x0; x <= x1; x++) {
      const yb = Math.round(yLine(Math.max(Math.min(x, Math.max(outer, inner)), Math.min(outer, inner))));
      const t = (x - cx) / (rx + 1.2);
      const zf = Math.round(cz + rz * Math.sqrt(Math.max(0, 1 - t * t)) + 0.6);
      for (let y = yb; y < yb + bt; y++) for (let z = cz - 1; z <= zf; z++) g.set(x, y, z, bc);
    }
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

/**
 * Carve an open mouth into a front surface: mask(x,y) inside, `depth` deep,
 * back wall coloured `inside` (glow optional); upper zig-zag teeth hang from
 * the top edge, lower teeth rise from the bottom edge (o.lower).
 */
function mouthCut(g, mask, x0, x1, y0, y1, o = {}) {
  const depth = o.depth ?? 3;
  const fz = {};
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (!mask(x, y)) continue;
    const z = frontZ(g, x, y, o.zmin ?? -60, o.zmax ?? 60);
    if (z !== null) fz[x + ',' + y] = z;
  }
  for (const k in fz) {
    const [x, y] = k.split(',').map(Number);
    for (let d = 0; d < depth; d++) g.del(x, y, fz[k] - d);
    g.set(x, y, fz[k] - depth, o.inside ?? MOUTH, !!o.insideGlow);
  }
  for (const k in fz) {
    const [x, y] = k.split(',').map(Number);
    const z = fz[k] - (o.inset ?? 1);
    if (fz[x + ',' + (y + 1)] === undefined) {
      g.set(x, y, z, o.tooth ?? TOOTH);
      if ((x + 64) % 2 === (o.phase ?? 0) && fz[x + ',' + (y - 1)] !== undefined) g.set(x, y - 1, z, o.tooth ?? TOOTH);
    }
    if (o.lower && fz[x + ',' + (y - 1)] === undefined) {
      g.set(x, y, z, o.tooth ?? TOOTH);
      if ((x + 65) % 2 === (o.phase ?? 0) && fz[x + ',' + (y + 1)] !== undefined) g.set(x, y + 1, z, o.tooth ?? TOOTH);
    }
  }
  return fz;
}

/** Flame tongue: a curling capsule chain coloured hot at the tip, glowing in its upper part. */
function flame(g, pts, r0, o = {}) {
  const ramp = o.ramp ?? [F_RED, F_ORANGE, F_YELLOW, F_WHITE];
  chain(g, pts, [r0, 0.35], ramp[0]);
  // colour by height along the flame: red at the root -> pale yellow at the tip
  const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const hits = [];
  g.forEach((x, y, z, c) => {
    if (y < y0 - r0 - 1 || y > y1 + 1) return;
    if (!pts.some((p) => Math.hypot(x - p[0], y - p[1], z - p[2]) <= r0 + 1.6)) return;
    if (!ramp.includes(c)) return;
    hits.push([x, y, z]);
  });
  for (const [x, y, z] of hits) {
    const t = Math.max(0, Math.min(0.999, (y - y0) / Math.max(1, y1 - y0)));
    const c = ramp[Math.floor(t * ramp.length)];
    g.set(x, y, z, c, t >= (o.glowFrom ?? 0.45));
  }
  return g;
}

// ===========================================================================
// Blaze Hybrid (Magma Misfits): a stocky fire imp. Cracked charcoal crust
// over glowing magma skin, a roaring flame mohawk, stubby horns, a molten
// belly, a mouth glowing like a furnace and flaming fists (the right one
// palms a fireball it hurls at range).
function blazeHybrid() {
  const K = {
    skin: 0xf0381a, skinD: 0xb8240f, crust: 0x3a1a1c, crustL: 0x5a2a26, crack: 0xffa21a,
    horn: 0x1f1418, belly: 0xff8a1a, eye: 0xfff27a, brow: 0x2a1014,
  };
  // lava skin with dark crust plates; bright cracks where plates meet
  const crustAt = (x, y, z, s = 0) => n3(Math.floor(x / 3), Math.floor(y / 3), Math.floor(z / 3), 7 + s) < 0.45;
  const lava = (minY) => (x, y, z) => {
    if (y >= minY && crustAt(x, y, z)) {
      const edge = !crustAt(x + 1, y, z) || !crustAt(x - 1, y, z) || !crustAt(x, y + 1, z) || !crustAt(x, y - 1, z);
      return edge && n3(x, y, z, 3) < 0.5 ? K.crack : n3(x, y, z, 2) < 0.2 ? K.crustL : K.crust;
    }
    return n3(x, y, z, 4) < 0.12 ? K.skinD : K.skin;
  };

  // ------------------------------------------------------------ legs
  const leg = G();
  capsule(leg, [-4, 7, 0], [-4, 2.5, 0.5], 2.3, 2.1, lava(4));
  blob(leg, -4, 1.4, 1.4, 2.8, 1.7, 3.4, K.crust, { p: 2.4, clip: (x, y) => y < 0 });
  for (const dx of [-1.6, 0, 1.6]) leg.set(Math.round(-4 + dx), 1, 5, K.crack, true);
  const legR = flipX(leg);

  // ------------------------------------------------------------ body: pot belly with a molten core
  const body = G();
  blob(body, -0.5, 10, 0, 6.2, 5.2, 5.2, lava(12), { p: 2.2 });
  body.forEach((x, y, z) => {
    const d = Math.hypot((x + 0.5) / 3.6, (y - 9.5) / 3.4);
    if (z >= 2 && d <= 1) body.set(x, y, z, d < 0.55 ? F_YELLOW : K.belly, d < 0.8);
    else if (z >= 2 && d <= 1.25) body.set(x, y, z, K.crust);
  });
  // tail: devilish point with a flame tip
  chain(body, [[-0.5, 8, -4.5], [-0.5, 6.5, -8.5], [-0.5, 8.5, -12], [-0.5, 11.5, -13]], [1.8, 1.4, 1, 0.8], K.skin);
  flame(body, [[-0.5, 12, -13], [-0.5, 14.5, -14], [-0.5, 16.5, -13.5]], 1.4);

  // ------------------------------------------------------------ head
  const HJ = [-0.5, 13, 1];
  const head = G();
  const capY = (x, z) => 23.5 + Math.round(n3(x, 0, z, 9) * 2) - (z > 4 ? 0 : 1);
  const headCol = (x, y, z) => {
    const cy = capY(x, z);
    if (y > cy) return n3(x, y, z, 2) < 0.2 ? K.crustL : K.crust;
    if (y === Math.floor(cy)) return K.crack;
    return n3(x, y, z, 4) < 0.1 ? K.skinD : K.skin;
  };
  blob(head, -0.5, 20, 1.5, 8.8, 7.6, 7.8, headCol, { p: 2.3 });
  blob(head, -0.5, 16, 4, 8, 3.6, 5.4, K.skin, { p: 2.2 }); // cheeks / jowls
  // pointed ears + horns
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -8.5 : 7.5;
    capsule(head, [ex, 19.5, 1], [ex + s * 4, 22, -0.5], 2, 0.5, K.skin);
    capsule(head, [ex + s * 0.5, 19.8, 1.6], [ex + s * 3, 21.4, 0.6], 0.9, 0.3, K.crust);
    const hx = s < 0 ? -4.5 : 3.5;
    chain(head, [[hx, 26, 2], [hx + s * 1.6, 29, 1], [hx + s * 2.2, 31, -1]], [1.7, 1.1, 0.4], K.horn);
  }
  // furnace mouth: deep, glowing inside, white teeth top and bottom (bottom ones ride on the jaw)
  const mask = (x, y) => {
    const t = (y - 13) / 4;
    return y >= 13 && y <= 17 && Math.abs(x + 0.5) <= 5.6 * (0.7 + 0.3 * Math.sqrt(Math.max(0, t)));
  };
  mouthCut(head, mask, -8, 7, 13, 17, { depth: 4, inside: F_ORANGE, insideGlow: true });
  // eyes: glowing ember eyes under heavy crust brows
  for (const [cx, side] of [[-4.6, -1], [3.6, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 20.5) ?? 8) - 1;
    eyeBall(head, cx, 20.5, cz, [2.8, 3, 2], side, { white: K.eye, pw: 2, ph: 3, inward: 0.6, browCol: K.brow, browT: 2, browOut: 1, browHi: 1.05, browLo: 0.3 });
  }
  // magenta bolt war-paint on the cheeks
  stamp(head, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: '-x', y: 18, z: 5 });
  stamp(head, ['MM..', '.MM.', 'MMMM', '.MM.', '..MM'], { M: MAG }, { axis: 'x', y: 18, z: 2 });
  // flame mohawk (tongues lean back like it's charging forward)
  const TONGUES = [[-0.5, 5, 6, 2], [-0.5, 2, 8, 3], [-0.5, -1.5, 9, 4], [-3, 0.5, 6, 3], [2, 0.5, 6, 3], [-0.5, -4.5, 6, 3], [-3.5, 4, 4, 2], [2.5, 4, 4, 2]];
  const bases = TONGUES.map(([x, z]) => { for (let y = 40; y > 10; y--) if (head.has(Math.round(x), y, Math.round(z))) return y; return 26; });
  TONGUES.forEach(([x, z, h, lean], i) => {
    const b = bases[i];
    flame(head, [[x, b - 1, z], [x, b + h * 0.45, z - lean * 0.35], [x, b + h * 0.8, z - lean * 0.8], [x, b + h, z - lean]], 2.1, { glowFrom: 0.93 });
  });
  gradY(head, 12, 27, -0.08, 0.05, (x, y, z, c) => c === K.skin || c === K.skinD);

  // ------------------------------------------------------------ jaw
  const JJ = [-0.5, 13.5, 2];
  const jaw = G();
  blob(jaw, -0.5, 11.8, 5.5, 5.6, 2.2, 4.4, K.skinD, { p: 2.3 });
  jaw.carve((x, y) => y > 13);
  jaw.forEach((x, y, z) => {
    if (y !== 13) return;
    const front = !jaw.has(x, 13, z + 1);
    const side = !jaw.has(x + 1, 13, z) || !jaw.has(x - 1, 13, z);
    if (front) { jaw.set(x, 13, z, TOOTH); if ((x + 41) % 2 === 0) jaw.set(x, 14, z, TOOTH); }
    else if (side) jaw.set(x, y, z, K.skinD);
    else jaw.set(x, y, z, Math.abs(x + 0.5) <= 2.2 ? TONGUE : MOUTH);
  });

  // ------------------------------------------------------------ arms: rock forearms with flaming fists
  const arm = G();
  capsule(arm, [-6.5, 12.5, 0], [-9, 9, 2], 1.9, 1.7, lava(0));
  blob(arm, -9.5, 7.6, 3, 2.5, 2.3, 2.5, K.crust, { p: 2.3 });
  for (const [dx, dz] of [[-1.2, 1.2], [0.2, 2.2], [1.2, 1]]) flame(arm, [[-9.5 + dx, 9, 3 + dz * 0.5], [-9.5 + dx, 11, 2 + dz * 0.4], [-9.5 + dx * 1.3, 12.5, 1.5]], 0.9, { glowFrom: 0.75 });
  const armR = flipX(arm);
  // the right fist palms a fireball
  blob(armR, 8.6, 8, 6.4, 2.6, 2.6, 2.6, (x, y, z) => (Math.hypot(x - 8.6, y - 8, z - 6.4) < 1.5 ? F_WHITE : Math.hypot(x - 8.6, y - 8, z - 6.4) < 2.3 ? F_YELLOW : F_ORANGE), { glow: true });
  flame(armR, [[8.6, 10, 6.4], [8.6, 12, 5.6], [8.6, 13.5, 4.6]], 1.6, { glowFrom: 0.5 });

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-4, 7, 0]), jp('legR', legR, [3, 7, 0]),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', arm, [-6.5, 12.5, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, [5.5, 12.5, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.18, 0, 0] }),
    ],
    muzzle: [8.5, 12, 8],
  };
}

// ===========================================================================
// Frost Hybrid (Frozen Freaks): a hulking little yeti. Shaggy white fur over
// icy-blue skin, a frost-crystal crown and shoulder shards, glowing cyan eyes
// under a shaggy brow, tusks, and giant ice-crystal claws that freeze foes.
function frostHybrid() {
  const K = {
    fur: 0xf2f8ff, furS: 0xd2e4f8, furB: 0xb8d8ff, skin: 0x4fa6ff, skinD: 0x2f78e0, skinL: 0x8cc8ff,
    ice: 0x8ff0ff, iceL: 0xe6ffff, iceD: 0x48c8f0, eye: 0xe4fdff, brow: 0xffffff, nail: 0xffffff,
  };
  const furCol = (x, y, z) => (n3(x, y, z, 3) < 0.12 ? K.furS : n3(x, y, z, 4) < 0.03 ? K.furB : K.fur);
  const crystal = (g, a, b, r, glowTip = true) => capsule(g, a, b, r, 0.35, (x, y, z, t) => (t > 0.7 ? K.iceL : t > 0.3 ? K.ice : K.iceD), {});
  const tuft = (g, x, y, z, dx, dy, dz, r = 1.2) => capsule(g, [x, y, z], [x + dx, y + dy, z + dz], r, 0.4, furCol);

  // ------------------------------------------------------------ legs
  const leg = G();
  capsule(leg, [-4.2, 7.5, -0.5], [-4.2, 3, 0], 2.8, 2.5, furCol);
  for (let i = 0; i < 5; i++) tuft(leg, -4.2 + Math.cos(i * 1.3) * 2.6, 3.5, Math.sin(i * 1.3) * 2.6, 0, -1.5, 0.3, 0.9);
  blob(leg, -4.2, 1.3, 1.3, 2.9, 1.6, 3.4, K.skin, { p: 2.4, clip: (x, y) => y < 0 });
  for (const dx of [-1.8, 0, 1.8]) capsule(leg, [-4.2 + dx, 1, 4.2], [-4.2 + dx, 0.6, 5.6], 0.7, 0.4, K.nail);
  const legR = flipX(leg);

  // ------------------------------------------------------------ body: shaggy hunched torso + ice shards
  const body = G();
  blob(body, -0.5, 11.5, -1, 7.8, 6.2, 6.2, furCol, { p: 2.2 });
  // fur fringe around the hips and belly patch of blue skin
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    tuft(body, -0.5 + Math.cos(a) * 7.4, 7.5, -1 + Math.sin(a) * 5.8, Math.cos(a) * 0.6, -2.2, Math.sin(a) * 0.6, 1.3);
  }
  body.forEach((x, y, z) => {
    const d = Math.hypot((x + 0.5) / 4.2, (y - 11.5) / 3.8);
    if (z >= 2 && d <= 1) body.set(x, y, z, d < 0.8 ? 0xdcecff : K.furB);
  });
  // ice shards bursting from the back + shoulders
  for (const [x, z, h, lx] of [[-0.5, -5, 6, 0], [-4, -4, 5, -2], [3, -4, 5, 2], [-7, -1, 4, -3], [6, -1, 4, 3]]) {
    let top = 16;
    for (let y = 30; y > 5; y--) if (body.has(Math.round(x), y, Math.round(z))) { top = y; break; }
    crystal(body, [x, top - 1, z], [x + lx, top + h, z - 2], 1.5);
  }
  glowWhere(body, (x, y, z, c) => c === K.iceL);
  gradY(body, 5, 19, -0.1, 0.04, (x, y, z, c) => c === K.fur || c === K.furS);

  // ------------------------------------------------------------ head: shaggy dome, blue face, ice crown
  const HJ = [-0.5, 16, 1];
  const head = G();
  blob(head, -0.5, 22, 2, 9.2, 7.6, 7.4, furCol, { p: 2.3 });
  // blue face oval
  head.forEach((x, y, z) => {
    const d = Math.hypot((x + 0.5) / 6.6, (y - 19.6) / 5.4);
    if (z >= 4 && d <= 1) head.set(x, y, z, d < 0.86 ? K.skin : K.skinD);
  });
  // snarling mouth under the nose
  mouthCut(head, (x, y) => y >= 15 && y <= 18 && Math.abs(x + 0.5) <= 5.2 - (18 - y) * 0.45, -7, 6, 15, 18, { depth: 3 });
  // shaggy cheek tufts (swept back so the face stays clear)
  for (const s of [-1, 1]) {
    tuft(head, s < 0 ? -8 : 7, 18, 3, s * 2.4, -2.6, -0.6, 1.6);
    tuft(head, s < 0 ? -8.5 : 7.5, 21.5, 1.5, s * 2.4, -1.2, -0.6, 1.4);
  }
  // glowing ice eyes under a heavy dark-blue brow
  for (const [cx, side] of [[-4, -1], [3, 1]]) {
    const cz = (frontZ(head, Math.round(cx), 22) ?? 8) - 1;
    eyeBall(head, cx, 22, cz, [2.8, 3, 2], side, { white: K.eye, pw: 2, ph: 3, inward: 0.5, pupil: INK, pupilGlow: false, browCol: 0x163a8a, browT: 2, browOut: 1, browHi: 1.05, browLo: 0.3 });
  }
  // nose
  blob(head, -0.5, 19.4, (frontZ(head, -1, 19) ?? 9) + 0.3, 1.5, 0.9, 0.9, 0x163a8a);
  // ice-crystal crown / horns
  for (const [x, z, h, lx, r] of [[-0.5, 3, 6, 0, 1.6], [-3.5, 2, 5, -2.4, 1.3], [2.5, 2, 5, 2.4, 1.3], [-6, 0, 4, -3.4, 1.1], [5, 0, 4, 3.4, 1.1]]) {
    let top = 27;
    for (let y = 40; y > 10; y--) if (head.has(Math.round(x), y, Math.round(z))) { top = y; break; }
    crystal(head, [x, top - 1, z], [x + lx, top + h, z - 1.5], r);
  }
  glowWhere(head, (x, y, z, c) => c === K.iceL);
  // magenta bolt war-paint on the cheeks
  stamp(head, ['.M', 'MM', 'M.'], { M: MAG }, { axis: 'z', x: -8, y: 20, mirror: true, zmin: 2 });

  // ------------------------------------------------------------ jaw: lower lip with up-tusks
  const JJ = [-0.5, 15.5, 4];
  const jaw = G();
  blob(jaw, -0.5, 14, 4.5, 4.8, 1.8, 3.4, K.skinD, { p: 2.3 });
  jaw.carve((x, y) => y > 14);
  jaw.carve((x, y, z) => z > (frontZ(head, x, 16) ?? 9));
  for (let x = -5; x <= 4; x++) {
    let fz = null;
    for (let z = 12; z >= 0; z--) if (jaw.has(x, 14, z)) { fz = z; break; }
    if (fz === null) continue;
    for (let z = 3; z < fz; z++) if (jaw.has(x, 14, z)) jaw.set(x, 14, z, Math.abs(x + 0.5) <= 2 ? TONGUE : MOUTH);
    jaw.set(x, 15, fz, TOOTH);
    if (x === -4 || x === 3) { jaw.set(x, 16, fz, TOOTH); jaw.set(x, 17, fz, TOOTH); jaw.set(x, 18, fz, TOOTH); }
  }

  // ------------------------------------------------------------ arms: long shaggy arms with giant ice claws
  const arm = G();
  capsule(arm, [-8, 14.5, 0], [-10.5, 10, 1.5], 2.6, 2.3, furCol);
  capsule(arm, [-10.5, 10, 1.5], [-11, 6.5, 3], 2.3, 2.1, furCol);
  for (let i = 0; i < 4; i++) tuft(arm, -12.5, 11 - i * 1.4, 1 + i * 0.4, -1.4, -1.2, 0, 0.9);
  blob(arm, -11, 5, 4, 2.8, 2.4, 2.8, K.skin, { p: 2.3 });
  stamp(arm, ['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], { M: MAG }, { axis: '-x', y: 12, z: 3 });
  for (const [dx, dy] of [[-1.6, 0.6], [0, 0], [1.6, 0.6]]) crystal(arm, [-11 + dx, 4.5 + dy, 6], [-11 + dx * 1.2, 2.5 + dy, 10.5], 1);
  glowWhere(arm, (x, y, z, c) => c === K.iceL);
  const armR = flipX(arm);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-4.2, 7.5, -0.5]), jp('legR', legR, [3.2, 7.5, -0.5]),
      jp('body', body, [-0.5, 0, 0]),
      jp('armL', arm, [-8, 14.5, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, [7, 14.5, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('head', head, HJ),
      jp('jaw', jaw, JJ, HJ, { parent: 'head', rot: [0.16, 0, 0] }),
    ],
    muzzle: [-0.5, 14, 12],
  };
}

// ===========================================================================
// Stone Hybrid: a walking boulder golem siege tank. The whole lumpy boulder is
// its head and body: deep-set glowing eyes under a jutting stone brow, a
// cavernous mouth of blocky stone teeth, a mossy top sprouting fusion
// crystals, magenta war-bolts on its flanks and two massive smashing fists.
function stoneHybrid() {
  const K = {
    rock: 0x8d95a8, rockD: 0x6b7286, rockL: 0xb0b8c8, rockDD: 0x4e5466, moss: 0x5cc23a, mossD: 0x3f9a26, mossL: 0x8ae05a,
    crystal: 0x5ff0e0, crystalL: 0xd8fff8, crystalD: 0x22b8b0, eye: 0x7ffcf0, tooth: 0xe8ecf2, mouth: 0x1c1a2a, flower: 0xff7ccc,
  };
  // boulder shading: chunky facets (3-voxel cells) of light/mid/dark stone
  const rockCol = (x, y, z) => {
    const v = n3(Math.floor((x + 40) / 3), Math.floor((y + 40) / 3), Math.floor((z + 40) / 3), 21);
    return v < 0.22 ? K.rockD : v > 0.8 ? K.rockL : K.rock;
  };
  const crystal = (g, a, b, r) => capsule(g, a, b, r, 0.35, (x, y, z, t) => (t > 0.65 ? K.crystalL : t > 0.25 ? K.crystal : K.crystalD));
  const mossify = (g, minY, p = 0.7) => {
    const tops = [];
    g.forEach((x, y, z, c) => { if (y >= minY && !g.has(x, y + 1, z) && (c === K.rock || c === K.rockD || c === K.rockL) && n3(x, 0, z, 5) < p) tops.push([x, y, z]); });
    for (const [x, y, z] of tops) {
      g.set(x, y, z, n3(x, y, z, 6) < 0.25 ? K.mossD : n3(x, y, z, 7) < 0.2 ? K.mossL : K.moss);
      if (n3(x, y, z, 8) < 0.35 && g.has(x, y - 1, z)) g.set(x, y - 1, z, K.moss);
    }
  };

  // ------------------------------------------------------------ legs: stubby stone pillars
  const leg = G();
  blob(leg, -5, 5, -0.5, 3.4, 4, 3.6, rockCol, { p: 2.3 });
  rbox(leg, -9, 0, -4, -1, 2, 4, 1.5, K.rockD);
  for (const dx of [-3, 0, 3]) blob(leg, -5 + dx, 1, 4.2, 1.2, 1, 1, K.rockDD);
  const legR = flipX(leg);

  // ------------------------------------------------------------ body: the lumpy boulder with the face
  const body = G();
  blob(body, -0.5, 16, -1, 11.4, 9.8, 9.6, rockCol, { p: 2.2 });
  for (const [x, y, z, r] of [[-7, 21, -3, 5], [6, 20, -4, 5], [-0.5, 23, -4, 6], [-8, 12, 2, 4.5], [7, 12, 2, 4.5], [-0.5, 10, -7, 6]]) blob(body, x, y, z, r, r * 0.9, r, rockCol, { p: 2.2 });
  body.carve((x, y) => y < 6);
  // jutting stone brow ledge
  rbox(body, -10, 20, 5, 9, 22, 10, 1.5, K.rockD, { clip: (x, y, z) => Math.abs(x + 0.5) > 9.5 - Math.max(0, 8 - z) * 0.3 });
  body.forEach((x, y, z) => { if (y === 20 && z >= 6 && Math.abs(x + 0.5) < 8) { const v = (x + 40) % 5; if (v === 0) body.set(x, 21, z, K.rockDD); } });
  // deep eye sockets with glowing eyes, slanted angry
  for (const s of [-1, 1]) {
    const ex = s < 0 ? -4.5 : 3.5;
    const fz = frontZ(body, Math.round(ex), 17) ?? 9;
    for (let x = Math.round(ex) - 2; x <= Math.round(ex) + 2; x++) for (let y = 15; y <= 19; y++) {
      const inner = s < 0 ? x - (Math.round(ex) - 2) : Math.round(ex) + 2 - x; // 0 outer .. 4 inner
      if (y > 19 - Math.floor(inner * 0.6)) continue; // slant: lower towards the nose
      const z0 = frontZ(body, x, y) ?? fz;
      body.del(x, y, z0); body.del(x, y, z0 - 1);
      body.set(x, y, z0 - 2, K.mouth);
    }
    blob(body, ex, 16.6, fz - 2, 1.5, 1.4, 1, K.eye, { glow: true });
    body.set(Math.round(ex) + (s < 0 ? 1 : -1), 17, fz - 1, 0xffffff, true);
  }
  // cavernous mouth with blocky stone teeth
  const mz = {};
  for (let x = -9; x <= 8; x++) for (let y = 7; y <= 13; y++) {
    const t = (y - 7) / 6;
    if (Math.abs(x + 0.5) > 7.6 * (0.55 + 0.45 * Math.sqrt(t))) continue;
    const z = frontZ(body, x, y);
    if (z !== null) mz[x + ',' + y] = z;
  }
  for (const k in mz) { const [x, y] = k.split(',').map(Number); for (let d = 0; d < 4; d++) body.del(x, y, mz[k] - d); body.set(x, y, mz[k] - 4, K.mouth); }
  for (const k in mz) {
    const [x, y] = k.split(',').map(Number);
    if (mz[x + ',' + (y + 1)] !== undefined) continue;
    const blockTooth = ((x + 40) % 3) !== 2;
    body.set(x, y, mz[k] - 1, blockTooth ? K.tooth : K.mouth);
    if (blockTooth && ((x + 40) % 3) === 0) { body.set(x, y - 1, mz[k] - 1, K.tooth); body.set(x + 1, y - 1, mz[k] - 1, K.tooth); }
  }
  for (let x = -6; x <= 5; x++) body.set(x, 9, (frontZ(body, x, 9, -30, 30) ?? 6), K.crystalD, true); // glowing throat
  // glowing crystal cracks
  const crack = (pts, side) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [y0, z0] = pts[i], [y1, z1] = pts[i + 1];
      const n = Math.max(Math.abs(y1 - y0), Math.abs(z1 - z0));
      for (let k = 0; k <= n; k++) {
        const y = Math.round(y0 + (y1 - y0) * k / n), z = Math.round(z0 + (z1 - z0) * k / n);
        for (let i2 = 0; i2 < 14; i2++) { const x = side < 0 ? -14 + i2 : 13 - i2; if (body.has(x, y, z)) { body.set(x, y, z, K.crystal, true); break; } }
      }
    }
  };
  crack([[22, -6], [19, -3], [17, -5], [13, -2], [10, -4]], -1);
  crack([[23, -2], [20, -5], [16, -3], [12, -6]], 1);
  // magenta war-bolts on the flanks
  const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
  stamp(body, BOLT, { M: MAG }, { axis: '-x', y: 20, z: 4 });
  stamp(body, rev(BOLT), { M: MAG }, { axis: 'x', y: 20, z: 0 });
  // moss cap with a little pink flower, and fusion crystals sprouting out of the top
  mossify(body, 21, 0.75);
  for (const [x, z, h, lx, lz, r] of [[-2, -4, 7, -1, -2, 2], [2.5, -6, 5, 2, -1, 1.6], [-6, -6, 4, -2.5, -1, 1.3], [5.5, -2, 3.5, 2, 0, 1.1]]) {
    let top = 24;
    for (let y = 40; y > 6; y--) if (body.has(Math.round(x), y, Math.round(z))) { top = y; break; }
    crystal(body, [x, top - 1, z], [x + lx, top + h, z + lz], r);
  }
  glowWhere(body, (x, y, z, c) => c === K.crystalL);
  {
    let fy = 24; for (let y = 40; y > 6; y--) if (body.has(5, y, 3)) { fy = y; break; }
    body.set(5, fy + 1, 3, K.mossD); body.set(5, fy + 2, 3, K.flower); body.set(4, fy + 2, 3, K.flower); body.set(6, fy + 2, 3, K.flower); body.set(5, fy + 2, 4, K.flower); body.set(5, fy + 2, 2, K.flower); body.set(5, fy + 3, 3, 0xffd23f);
  }
  gradY(body, 6, 26, -0.12, 0.06, (x, y, z, c) => c === K.rock || c === K.rockD || c === K.rockL);
  hollowOut(body, 2);

  // ------------------------------------------------------------ jaw: heavy lower-lip slab with up-teeth
  const JJ = [-0.5, 8, 2];
  const jaw = G();
  blob(jaw, -0.5, 6.5, 6, 7.4, 2.4, 4.6, rockCol, { p: 2.6 });
  jaw.carve((x, y) => y > 7);
  for (let x = -7; x <= 6; x++) {
    let fz = null;
    for (let z = 14; z >= 0; z--) if (jaw.has(x, 7, z)) { fz = z; break; }
    if (fz === null) continue;
    for (let z = 2; z < fz; z++) if (jaw.has(x, 7, z)) jaw.set(x, 7, z, K.mouth);
    if (((x + 40) % 3) !== 1) { jaw.set(x, 8, fz, K.tooth); if (((x + 40) % 3) === 2) jaw.set(x, 9, fz, K.tooth); }
  }

  // ------------------------------------------------------------ arms: boulder shoulders, huge smashing fists
  const arm = G();
  blob(arm, -11.5, 17, 0, 3.6, 3.4, 3.6, rockCol, { p: 2.2 });
  blob(arm, -13.5, 12.5, 1.5, 3, 3.2, 3, rockCol, { p: 2.2 });
  blob(arm, -14.5, 7, 3.5, 4.9, 4.5, 4.9, (x, y, z) => (n3(Math.floor((x + 40) / 3), Math.floor((y + 40) / 3), Math.floor((z + 40) / 3), 22) < 0.3 ? K.rock : K.rockL), { p: 2.5 });
  for (const dy of [-2, 0.4, 2.8]) blob(arm, -14.5, 7 + dy, 8.2, 1.6, 0.8, 0.8, K.rockDD); // knuckle grooves
  for (const dy of [-2, 0.4, 2.8]) arm.set(-15, Math.round(7 + dy), 9, K.crystal, true);
  mossify(arm, 19, 0.6);
  crystal(arm, [-12, 20, -1], [-14, 24, -3], 1.2);
  glowWhere(arm, (x, y, z, c) => c === K.crystalL);
  const armR = flipX(arm);

  return {
    gait: 'walk', voxel: 0.05, jitter: 0.02, finish: 'gloss',
    parts: [
      jp('legL', leg, [-5, 8, -0.5]), jp('legR', legR, [4, 8, -0.5]),
      jp('body', body, [-0.5, 0, 0]),
      jp('jaw', jaw, JJ, [-0.5, 0, 0], { parent: 'body', rot: [0.12, 0, 0] }),
      jp('armL', arm, [-11.5, 17, 0], [-0.5, 0, 0], { parent: 'body' }),
      jp('armR', armR, [10.5, 17, 0], [-0.5, 0, 0], { parent: 'body' }),
    ],
    muzzle: [-0.5, 10, 12],
  };
}

export const FUSION_MODELS = {
  blazeHybrid,
  frostHybrid,
  stoneHybrid,
};
