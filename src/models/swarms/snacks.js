// The Snack Squad (FOOD SEASON). Junk food turned into angry little toy
// monsters, sculpted like the MrBeast Lab Swarms "Snack Squad" / "Snack
// Attackers" figures: one big food silhouette that is mostly face, chunky
// stubby limbs, open mouths full of white teeth, glossy saturated colours and
// MrBeast-magenta accents. See ../kit.js and ./panthers.js for conventions.
// eslint-disable-next-line no-unused-vars
import { G, blob, rbox, capsule, chain, cyl, stamp, eyes, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, part, shade, mixHex, mottle } from '../kit.js';

// ---------------------------------------------------------------------------
// Shared palette + helpers

const INK = 0x15121f; // pupils, brows, outlines
const T = 0xfffdf6; // teeth
const MOUTH = 0x4a0820; // mouth cavity
const TONGUE = 0xff4f9a;
const MAG = 0xff1f9e; // MrBeast magenta
const WHITE = 0xffffff;
const GLOVE = 0xfaf7ff;

/** Mirror a grid across the seam into a new grid (left limb -> right limb). */
function flipX(g) {
  const o = G();
  g.forEach((x, y, z, c, glow) => o.set(-1 - x, y, z, c, glow));
  return o;
}

/** Slanted brow art for the LEFT eye: outer end high, inner end low. */
function browArt(w, slant = 2, thick = 2) {
  const W = w + 2;
  const out = Array.from({ length: slant + thick }, () => Array(W).fill('.'));
  for (let u = 0; u < W; u++) {
    const r = Math.round((u / (W - 1)) * slant);
    for (let t = 0; t < thick; t++) out[r + t][u] = 'B';
  }
  return out.map((r) => r.join(''));
}

/**
 * Angry toy eyes + raised brows on the front (+Z) surface.
 * y = top row of the eyes, gap = voxels from the seam to the inner edge.
 */
function angryEyes(g, y, gap, w, h, o = {}) {
  eyes(g, y, gap, w, h, { angle: 'angry', ...o });
  if (o.brow === null) return g;
  const bs = o.browSlant ?? 2, bt = o.browThick ?? 2;
  stamp(g, browArt(w, bs, bt), { B: { c: o.brow ?? INK, raise: o.browRaise ?? 1 } }, {
    axis: 'z', x: -gap - w - 1 + (o.browDx ?? 0), y: y + bt + (o.browDy ?? 0), mirror: true, zmin: o.zmin, zmax: o.zmax,
  });
  return g;
}

/** Frontmost voxel z at (x,y) between zmin..zmax, or null. */
function frontAt(g, x, y, zmin = -40, zmax = 40) {
  for (let z = zmax; z >= zmin; z--) if (g.has(x, y, z)) return z;
  return null;
}

/**
 * Carve an open mouth into the front surface. mask(x,y) -> true inside the
 * mouth. The cavity is `depth` deep, lined with MOUTH colour; upper teeth hang
 * from the top edge (zig-zag) unless o.upper === false.
 */
function carveMouth(g, mask, x0, x1, y0, y1, o = {}) {
  const depth = o.depth ?? 3;
  const fz = {};
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    if (!mask(x, y)) continue;
    const z = frontAt(g, x, y, o.zmin ?? -40, o.zmax ?? 40);
    if (z === null) continue;
    fz[`${x},${y}`] = z;
  }
  for (const k in fz) {
    const [x, y] = k.split(',').map(Number);
    const z = fz[k];
    for (let d = 0; d < depth; d++) g.del(x, y, z - d);
    g.set(x, y, z - depth, o.inside ?? MOUTH);
  }
  // line the cavity walls
  for (const k in fz) {
    const [x, y] = k.split(',').map(Number);
    const z = fz[k];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (fz[`${nx},${ny}`] !== undefined) continue;
      for (let d = 1; d < depth; d++) if (g.has(nx, ny, z - d)) g.set(nx, ny, z - d, o.inside ?? MOUTH);
    }
  }
  // upper teeth: top row of the mouth
  if (o.upper !== false) {
    for (let x = x0; x <= x1; x++) {
      let top = null;
      for (let y = y1; y >= y0; y--) if (fz[`${x},${y}`] !== undefined) { top = y; break; }
      if (top === null) continue;
      const z = fz[`${x},${top}`] - (o.teethInset ?? 1);
      g.set(x, top, z, T);
      if ((x + 64) % 2 === (o.teethPhase ?? 0)) g.set(x, top - 1, z, T);
    }
  }
  return fz;
}

/** Chunky toy sneaker centred at (cx, cz) with the toe pointing +Z. */
function sneaker(g, cx, cz, o = {}) {
  const w = o.w ?? 2.6, l = o.l ?? 3.6, h = o.h ?? 1.9;
  const col = o.col ?? MAG, sole = o.sole ?? WHITE, toe = o.toe ?? WHITE;
  blob(g, cx, h - 0.3, cz + 0.8, w, h, l, (x, y, z) => {
    if (y === 0) return sole;
    if (z >= cz + l - 0.4 && y <= 1) return toe;
    if (o.lace && y >= h + 0.2 && Math.abs(x - cx) < 1.2 && z > cz - 0.2 && z < cz + l - 1) return o.lace;
    return col;
  }, { p: 2.4, clip: (x, y) => y < 0 });
  return g;
}

/** Stubby biped leg (hip -> ankle capsule) + sneaker. Returns a new grid. */
function stubLeg(cx, hipY, cz, o = {}) {
  const g = G();
  capsule(g, [cx, hipY, cz], [cx, o.ankle ?? 2.5, cz + 0.3], o.r0 ?? 1.9, o.r1 ?? 1.6, o.col ?? INK);
  sneaker(g, cx, cz + (o.dz ?? 0), o.shoe ?? {});
  return g;
}

/** Glove fist (cartoon white glove with a cuff). */
function glove(g, cx, cy, cz, o = {}) {
  const r = o.r ?? 2;
  blob(g, cx, cy, cz, r, r * 0.95, r, o.col ?? GLOVE, { p: 2.3 });
  if (o.cuff !== false) blob(g, cx, cy + r * 0.85, cz, r * 0.95, 0.8, r * 0.95, o.cuffCol ?? (o.col ?? GLOVE), { p: 2.6 });
  // thumb nub
  blob(g, cx + (o.thumbX ?? 0), cy + 0.3, cz + r * 0.8, 0.9, 0.9, 0.9, o.col ?? GLOVE);
  return g;
}

/** Disc badge art (d x d) with an inner lightning bolt: W ring/field, M bolt. */
function boltBadge(d = 11) {
  const r = d / 2;
  const bolt = ['..MMMM', '.MMMM.', '.MMM..', 'MMMMMM', 'MMMMM.', '..MMM.', '..MM..', '.MM...', '.M....'];
  const bw = 6, bh = 9;
  const rows = [];
  for (let v = 0; v < d; v++) {
    let s = '';
    for (let u = 0; u < d; u++) {
      const dx = u + 0.5 - r, dy = v + 0.5 - r;
      if (dx * dx + dy * dy > r * r + 0.3) { s += '.'; continue; }
      const bu = u - Math.round((d - bw) / 2), bv = v - Math.round((d - bh) / 2);
      s += bolt[bv]?.[bu] === 'M' ? 'M' : (dx * dx + dy * dy > (r - 1) * (r - 1) ? 'R' : 'W');
    }
    rows.push(s);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Models

export const SNACK_MODELS = {
  // ===================================================================== FRY FIEND
  // A red fries carton monster: fries burst out of the top like spiky hair,
  // the carton front is one big angry face with a chomping chin, magenta
  // lightning-bolt badges on the sides. Ranged: flings fries from the bundle.
  fryFiend() {
    const RED = 0xff2a3a, REDD = 0xc8102c, REDL = 0xff7a86, IN = 0x7a0a1c;
    const FRY = 0xffd23f, FRYL = 0xffe98a, FRYD = 0xf2a72a, TIP = 0xd77e1c;
    const Y0 = 4, Y1 = 22;
    const hx = (y) => 6.6 + ((y - Y0) / (Y1 - Y0)) * 2.6;
    const hz = (y) => 4.4 + ((y - Y0) / (Y1 - Y0)) * 1.6;
    const inCarton = (x, y, z) => {
      if (y < Y0 || y > Y1) return 0;
      const ax = hx(y), az = hz(y);
      const dx = Math.abs(x + 0.5), dz = Math.abs(z + 0.5);
      if (dx > ax || dz > az) return 0;
      const rc = 2;
      if (dx > ax - rc && dz > az - rc && Math.hypot(dx - (ax - rc), dz - (az - rc)) > rc) return 0;
      const fb = dz / az > dx / ax; // front/back panel vs side panel
      const top = fb ? 18.4 + 3.6 * (dx / ax) ** 2 : Y1;
      if (y > top) return 0;
      const wall = dx > ax - 1.5 || dz > az - 1.5;
      if (y > 15 && !wall) return 0; // open top (fries go here)
      return wall ? 2 : 1;
    };
    const body = G();
    for (let y = Y0; y <= Y1; y++) for (let x = -12; x <= 11; x++) for (let z = -9; z <= 8; z++) {
      if (inCarton(x, y, z)) body.set(x, y, z, RED);
    }
    // rim highlight, inner walls, darker base band
    body.paint((x, y, z, c) => {
      if (!body.has(x, y + 1, z) && y > 15) return REDL;
      if (y > 15 && (!body.has(x + 1, y, z) || !body.has(x - 1, y, z) || !body.has(x, y, z + 1) || !body.has(x, y, z - 1)) && Math.abs(x + 0.5) < hx(y) - 1.2 && Math.abs(z + 0.5) < hz(y) - 1.2) return IN;
      if (y <= Y0 + 1) return REDD;
      return undefined;
    });
    // magenta bolt badges on both side panels (the battle camera sees these)
    const badge = { W: WHITE, M: MAG, R: { c: MAG, raise: 1 } };
    stamp(body, boltBadge(11), badge, { axis: '-x', y: 20, z: -6 });
    stamp(body, boltBadge(11).map((r) => [...r].reverse().join('')), badge, { axis: 'x', y: 20, z: 4 });
    // back: a white stripe band
    body.paint((x, y, z, c) => (z < -3 && (y === 9 || y === 10) && c === RED ? WHITE : undefined));

    // face: big angry eyes, black brows, wide toothy mouth
    angryEyes(body, 16, 1, 5, 6, { brow: INK, look: [0, -0.3], browSlant: 2 });
    const mouthMask = (x, y) => {
      const ax = Math.abs(x + 0.5);
      if (y < 6 || y > 10) return false;
      return ax <= 5 - (y < 8 ? (8 - y) * 1.2 : 0);
    };
    carveMouth(body, mouthMask, -7, 6, 6, 10, { depth: 3 });
    // tongue at the back of the mouth
    for (let x = -3; x <= 2; x++) for (let y = 6; y <= 7; y++) { const z = frontAt(body, x, y, -6, 8); if (z !== null && body.get(x, y, z) === MOUTH) body.set(x, y, z, TONGUE); }
    // cheek blush marks
    for (const [x, y] of [[-7, 10], [-8, 10]]) { const z = frontAt(body, x, y); if (z !== null) sym(body, x, y, z, 0xff5f8f); }

    // chomping chin: the carton front under the mouth is the jaw
    const JJ = [-0.5, 6, 1];
    const jaw = G();
    body.forEach((x, y, z, c) => {
      if (y <= 5 && z >= 2 && Math.abs(x + 0.5) <= 5.5) jaw.set(x, y, z, c);
    });
    jaw.forEach((x, y, z) => body.del(x, y, z));
    // lower teeth on the chin's top edge
    for (let x = -6; x <= 5; x++) {
      if (Math.abs(x + 0.5) > 4.5) continue;
      const z = frontAt(jaw, x, 5, -6, 8);
      if (z === null) continue;
      jaw.set(x, 6, z - 1, T);
      if ((x + 64) % 2 === 1) jaw.set(x, 7, z - 1, T);
    }
    // inner chin (mouth colour) so the open jaw shows a throat
    for (let x = -5; x <= 4; x++) for (let z = 1; z <= 3; z++) if (jaw.has(x, 5, z)) jaw.set(x, 5, z, TONGUE);

    // fries bundle ("head" so it whips back on the wind-up like a catapult)
    const HJ = [-0.5, 15, -0.5];
    const fries = G();
    for (let x = -7; x <= 6; x++) for (let z = -4; z <= 3; z++) for (let y = 14; y <= 16; y++) {
      if (inCarton(x, 16, z) === 0 && y >= 16) fries.set(x, y, z, FRYD);
      else if (y < 16) fries.set(x, y, z, FRYD);
    }
    const fry = (bx, bz, h, lx, lz, s) => {
      for (let i = 0; i <= h; i++) {
        const px = Math.round(bx + lx * i), pz = Math.round(bz + lz * i), py = 15 + i;
        const c = i >= h ? TIP : i === h - 1 ? FRYD : n3(px, py, pz, s) < 0.25 ? FRYL : FRY;
        fries.box(px, py, pz, px + 1, py, pz + 1, c);
      }
    };
    let s = 0;
    for (const [row, zb, base] of [[0, -5, 12], [1, -3, 11], [2, -1, 10], [3, 1, 8]]) {
      for (let k = 0; k < 8; k++) {
        const bx = -8 + k * 2 + (row % 2 ? 1 : 0);
        if (bx > 6) continue;
        const ax = Math.abs(bx + 0.5 + 0.5);
        const h = Math.round(base + 2.6 * (1 - ax / 8) + n3(bx, row, 3) * 5 - 2);
        fry(bx, zb, h, (bx + 0.5) / 8 * 0.42 + (n3(bx, row, 8) - 0.5) * 0.2, (zb + 0.5) / 5 * 0.4 + (row === 3 ? 0.12 : 0), s++);
      }
    }
    // a couple of crazy fries sticking out sideways
    capsule(fries, [-6, 17, 0], [-11, 25, 1], 0.6, 0.6, (x, y) => (y >= 24 ? TIP : FRY));
    capsule(fries, [5, 17, -2], [10, 24, -3], 0.6, 0.6, (x, y) => (y >= 23 ? TIP : FRY));

    // arms: short red arms, white gloves; the right one waves a fry
    const AJ = [-8, 12, 0];
    const armL = G();
    capsule(armL, [-8, 12, 0], [-11, 8.5, 1.5], 1.5, 1.3, REDD);
    glove(armL, -11.5, 7, 2, { r: 2.1 });
    const armR = flipX(armL);
    capsule(armR, [10.5, 7, 3], [11.5, 15, 6.5], 0.7, 0.7, (x, y) => (y >= 14 ? TIP : FRY));

    const legL = stubLeg(-3.5, 5, 0, { col: REDD, shoe: { col: MAG, sole: WHITE, toe: WHITE } });
    const legR = flipX(legL);

    return {
      gait: 'hop',
      voxel: 0.05,
      parts: [
        jp('legL', legL, [-3.5, 5, 0]),
        jp('legR', legR, [2.5, 5, 0]),
        jp('body', body, [-0.5, 4, 0]),
        jp('jaw', jaw, JJ, [-0.5, 4, 0], { parent: 'body' }),
        jp('head', fries, HJ, [-0.5, 4, 0], { parent: 'body' }),
        jp('armL', armL, AJ, [-0.5, 4, 0], { parent: 'body' }),
        jp('armR', armR, [7, 12, 0], [-0.5, 4, 0], { parent: 'body' }),
      ],
      muzzle: [0, 27, 1],
      jitter: 0.02,
    };
  },

  // =================================================================== PIZZA SLICER
  // A chunky pepperoni slice standing on its tip, the puffy crust roll is its
  // brow, gooey cheese drips everywhere, and a chrome pizza-cutter wheel in
  // each fist spins up to a blur when it attacks.
  pizzaSlicer() {
    const CHEESE = 0xffc93a, CHEESEL = 0xffe58a, CHEESED = 0xf6a51e, SAUCE = 0xe8322a;
    const CRUST = 0xe39a4a, CRUSTD = 0xa8601f, CRUSTL = 0xf8d08a, BREAD = 0xf0c27a;
    const PEP = 0xd62a3c, PEPD = 0x9e1428, PEPL = 0xf05a5a;
    const YT = 7, YB = 25;
    const hw = (y) => 2.6 + ((y - YT) / (YB - YT)) * 8.4;
    const body = G();
    for (let y = YT; y <= YB; y++) for (let x = -12; x <= 11; x++) {
      const dx = Math.abs(x + 0.5);
      const w = hw(y);
      if (dx > w) continue;
      for (let z = -4; z <= 3; z++) {
        if (y < YT + 2 && dx > w - (YT + 2 - y)) continue; // rounded tip
        if (z === 3 && dx > w - 1.2) continue; // soft front edge
        let c;
        if (z <= -3) c = n3(x, y, z) < 0.16 ? CRUSTD : BREAD; // underside bread
        else if (z === -2) c = SAUCE;
        else c = n3(x, y, z, 2) < 0.2 ? CHEESEL : n3(x, y, z, 5) < 0.1 ? CHEESED : CHEESE;
        if (dx > w - 1 && z >= -1) c = n3(x, y, z, 7) < 0.45 ? SAUCE : CHEESED; // saucy edge
        body.set(x, y, z, c);
      }
    }
    // gooey cheese drips over the side edges and off the tip
    for (const [x, y, n] of [[-10, 22, 4], [9, 20, 5], [-7, 15, 4], [6, 13, 3], [-2, 7, 4], [1, 7, 3]]) {
      for (let i = 0; i < n; i++) for (const z of [1, 2]) body.set(x, y - i, z, i === n - 1 ? CHEESEL : CHEESE);
      body.set(x + (x < -0.5 ? 1 : -1), y - 1, 2, CHEESE);
    }
    // puffy toasted crust roll across the top, curving down at the ends
    const crustCol = (x, y, z) => (y >= 27 && n3(x, y, z, 4) < 0.5 ? CRUSTL : n3(x, y, z, 3) < 0.2 ? CRUSTD : CRUST);
    chain(body, [[-11.8, 24.2, -0.5], [-7, 26, -0.5], [-0.5, 26.6, -0.5], [6, 26, -0.5], [10.8, 24.2, -0.5]], [2.3, 2.6, 2.7, 2.6, 2.3], crustCol);
    for (const [x, y, z, r] of [[-8, 27.4, 0.5, 1.4], [-3, 28.2, -1, 1.3], [3, 28, 0.5, 1.4], [8, 26.8, -1.5, 1.2]]) blob(body, x, y, z, r, r * 0.8, r, crustCol);
    // face: big angry eyes, crust-brown brows, a wide toothy grin
    angryEyes(body, 22, 1, 6, 7, { brow: CRUSTD, look: [0, -0.4], zmax: 6 });
    const mouthMask = (x, y) => y >= 10 && y <= 15 && Math.abs(x + 0.5) <= 5.2 - (y < 12 ? (12 - y) * 1.4 : 0);
    carveMouth(body, mouthMask, -7, 6, 10, 15, { depth: 3 });
    for (let x = -3; x <= 2; x++) for (let y = 10; y <= 11; y++) { const z = frontAt(body, x, y, -5, 5); if (z !== null && body.get(x, y, z) === MOUTH) body.set(x, y, z, TONGUE); }
    // lower fangs at the mouth corners
    for (const x of [-4, 3]) { const z = frontAt(body, x, 10, -5, 5); if (z !== null) { body.set(x, 11, z + 2, T); body.set(x, 12, z + 2, T); } }
    // pepperoni (raised discs)
    const pep = (cx, cy, r) => {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 0.3) continue;
        const z = frontAt(body, x, y, -5, 5);
        if (z === null || z < 2) continue;
        const c = d > r - 0.8 ? PEPD : n3(x, y, 11) < 0.25 ? PEPL : PEP;
        body.set(x, y, z + 1, c);
      }
    };
    pep(-9.5, 22, 1.8); pep(8.6, 21, 1.6); pep(-0.5, 8.4, 1.5); pep(-7.6, 12.8, 1.3); pep(6.4, 15.6, 1.3);
    // a basil leaf on the cheek
    stamp(body, ['.GG', 'GGG', 'GG.'], { G: { c: 0x2fae46, raise: 1 } }, { axis: 'z', x: 6, y: 13 });

    // stubby legs from the tip, red sneakers
    const legL = stubLeg(-2.5, 8, -0.5, { col: CRUSTD, r0: 1.5, r1: 1.4, shoe: { col: 0xff3a3a, sole: WHITE, toe: WHITE, w: 2.3, l: 3.3 } });
    const legR = flipX(legL);

    // arms holding pizza cutters (handle forward, fork on the outside)
    const armL = G();
    capsule(armL, [-9.5, 18, -0.5], [-11.8, 13.5, 1.5], 1.4, 1.3, CRUSTD);
    glove(armL, -11.8, 12.5, 2, { r: 2 });
    capsule(armL, [-11.8, 12.4, 1.5], [-11.8, 12.5, 6.6], 1.0, 1.0, MAG);
    capsule(armL, [-11.8, 12.5, 6.5], [-13.4, 12.5, 9.5], 0.5, 0.5, 0xc8d0dc);
    const armR = flipX(armL);
    // cutter wheel modelled around the origin (disc in the local x-z plane)
    const wheel = G();
    for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d > 4.9) continue;
      const ang = Math.atan2(z + 0.5, x + 0.5);
      let c = d > 3.9 ? 0xf4f8ff : d > 1.6 ? ((Math.floor((ang + Math.PI) / (Math.PI / 3)) % 2) ? 0xa8b4c8 : 0xdde4f0) : MAG;
      if (d > 3.9 && Math.abs(Math.sin(ang * 3)) < 0.2) c = 0x8a94a8;
      for (const y of [-1, 0]) wheel.set(x, y, z, c);
    }
    for (const y of [1, -2]) wheel.set(-1, y, -1, MAG).set(0, y, -1, MAG).set(-1, y, 0, MAG).set(0, y, 0, MAG);

    const BJ = [-0.5, 7, -0.5];
    const ALJ = [-9.5, 18, -0.5], ARJ = [8.5, 18, -0.5];
    const WL = [-12.3, 12.5, 10], WR = [12.3, 12.5, 10];
    return {
      gait: 'walk',
      voxel: 0.05,
      parts: [
        jp('legL', legL, [-2.5, 8, -0.5]),
        jp('legR', legR, [1.5, 8, -0.5]),
        jp('body', body, BJ, null, { rot: [0.1, 0, 0] }),
        jp('armL', armL, ALJ, BJ, { parent: 'body' }),
        jp('armR', armR, ARJ, BJ, { parent: 'body' }),
        jp('cutterL', G(), WL, ALJ, { parent: 'armL', rot: [0, 0, Math.PI / 2] }),
        jp('cutterR', G(), WR, ARJ, { parent: 'armR', rot: [0, 0, Math.PI / 2] }),
        { name: 'spinL', grid: wheel, at: [0, 0, 0], pivot: [0, 0, 0], parent: 'cutterL' },
        { name: 'spinR', grid: wheel, at: [0, 0, 0], pivot: [0, 0, 0], parent: 'cutterR' },
      ],
      muzzle: [0, 14, 10],
      jitter: 0.02,
    };
  },
};
