// The Snack Squad (FOOD SEASON). Junk food turned into angry little toy
// monsters, sculpted like the MrBeast Lab Swarms "Snack Squad" / "Snack
// Attackers" figures: one big food silhouette that is mostly face, chunky
// stubby limbs, open mouths full of white teeth, glossy saturated colours and
// MrBeast-magenta accents. See ../kit.js and ./panthers.js for conventions.
// eslint-disable-next-line no-unused-vars
import { G, blob, rbox, capsule, chain, cyl, stamp, eyes, eyeArt, mirror, sym, symBox, glowWhere, fadeY, gradY, n3, jp, part, shade, mixHex, mottle } from '../kit.js';

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

/** Remove fully enclosed voxels (keeps the voxel budget down; the shell is unchanged). */
function hollowOut(g) {
  const kill = [];
  g.forEach((x, y, z) => {
    if (g.has(x + 1, y, z) && g.has(x - 1, y, z) && g.has(x, y + 1, z) && g.has(x, y - 1, z) && g.has(x, y, z + 1) && g.has(x, y, z - 1)) kill.push([x, y, z]);
  });
  for (const [x, y, z] of kill) g.del(x, y, z);
  return g;
}

/** Topmost occupied y at (x, z), or null. */
function topAt(g, x, z, ymin = -10, ymax = 60) {
  for (let y = ymax; y >= ymin; y--) if (g.has(x, y, z)) return y;
  return null;
}

/** Outermost occupied x on the +x (side = 1) or -x (side = -1) side at (y, z). */
function edgeX(g, y, z, side = 1) {
  if (side > 0) { for (let x = 40; x >= -40; x--) if (g.has(x, y, z)) return x; } else { for (let x = -40; x <= 40; x++) if (g.has(x, y, z)) return x; }
  return null;
}

/**
 * Stamp pixel art onto the side (+x / -x) surface of `src`, writing into `dst`.
 * Viewed from that side, art u runs towards the model's back. (y, z) = top-left.
 * pal values: colour | { c, glow, lift (voxels above the surface, 0 = recolour), thick }.
 */
function sideDecal(dst, src, art, pal, o = {}) {
  const side = o.side ?? 1;
  for (let v = 0; v < art.length; v++) for (let u = 0; u < art[v].length; u++) {
    let spec = pal[art[v][u]];
    if (spec === undefined) continue;
    if (typeof spec === 'number') spec = { c: spec };
    const y = o.y - v, z = side > 0 ? o.z - u : o.z + u;
    let sx = edgeX(src, y, z, side);
    if (sx === null) continue;
    if (o.hug) for (const [dy, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const e = edgeX(src, y + dy, z + dz, side); if (e !== null) sx = side > 0 ? Math.max(sx, e) : Math.min(sx, e); }
    const lift = spec.lift ?? o.lift ?? 0, thick = spec.thick ?? o.thick ?? 1;
    for (let i = lift; i < lift + thick; i++) dst.set(sx + side * i, y, z, spec.c, !!spec.glow);
  }
  return dst;
}

/** Left/right angry eye + brow art pair for a side-facing face (see sideDecal). */
function sideEyes(dst, src, y, gap, w, h, o = {}) {
  const pal = { W: { c: o.white ?? WHITE, lift: o.lift ?? 1, thick: o.thick ?? 1 }, P: { c: o.pupil ?? INK, lift: o.lift ?? 1, thick: o.thick ?? 1 }, I: { c: o.iris ?? INK, lift: o.lift ?? 1, thick: o.thick ?? 1 }, G: { c: WHITE, glow: true, lift: o.lift ?? 1, thick: o.thick ?? 1 }, B: { c: o.brow ?? INK, lift: o.lift ?? 1, thick: o.browThickness ?? (o.thick ?? 1) + 1 } };
  const side = o.side ?? 1;
  const L = eyeArt(w, h, { angle: 'angry', side: 'L', look: o.look });
  const R = eyeArt(w, h, { angle: 'angry', side: 'R', look: o.look ? [-o.look[0], o.look[1]] : undefined });
  // seen from +x the model's front (+z) is on the viewer's left
  const zL = side > 0 ? gap + w - 1 : -gap - w, zR = side > 0 ? -gap - 1 : gap;
  sideDecal(dst, src, L, pal, { side, y, z: zL, hug: true });
  sideDecal(dst, src, R, pal, { side, y, z: zR, hug: true });
  if (o.brow !== null) {
    const bs = o.browSlant ?? 2, bt = o.browThick ?? 2;
    const bL = browArt(w, bs, bt), bR = bL.map((r) => [...r].reverse().join(''));
    const by = y + bt + (o.browDy ?? 0);
    sideDecal(dst, src, bL, pal, { side, y: by, z: zL + side, hug: true });
    sideDecal(dst, src, bR, pal, { side, y: by, z: zR + side, hug: true });
  }
  return dst;
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
  // =================================================================== DONUT DASHER
  // A strawberry-frosted sprinkle donut standing on its edge like a wheel. It
  // barrels into enemies at full speed (the whole donut rolls) while its face
  // stays upright: angry eyes on the frosting and the donut HOLE is a gaping,
  // screaming mouth ringed with teeth. Seen side-on it is one big round face.
  donutDasher() {
    const DOUGH = 0xeaa456, DOUGHL = 0xffd99c, DOUGHD = 0xc0742e;
    const FROST = 0xff5cbc, FROSTL = 0xff9ad6, FROSTD = 0xe02c98;
    const SPR = [0xffffff, 0xffe14a, 0x3fd7ff, 0x8cff4a, 0xa970ff, 0xff8a2a];
    const CY = 14.9, R = 10, A = 4.4, B = 4.4, P = 2.5;
    const holeR = (s) => R - (A + 0.35) * Math.max(0, 1 - (s / (B + 0.35)) ** P) ** (1 / P);
    const body = G();
    for (let x = -6; x <= 5; x++) for (let y = -1; y <= 30; y++) for (let z = -16; z <= 15; z++) {
      const xc = x + 0.5, yc = y + 0.5 - CY, zc = z + 0.5;
      const t = Math.hypot(yc, zc) - R;
      if (Math.abs(t / (A + 0.35)) ** P + Math.abs(xc / (B + 0.35)) ** P > 1) continue;
      const th = Math.atan2(yc, zc), s = Math.abs(xc), side = xc < 0 ? -1 : 1;
      // frosting on both flat faces: wavy edge plus long drips over the rim
      const drip = t > 0 ? Math.max(0, Math.sin(th * 5 + side * 1.9)) ** 8 * 2.2 : 0;
      const edge = (t < -2 ? 2.6 : 1.5 + 0.7 * Math.sin(th * 9 + side)) - drip;
      let c;
      if (s > edge) c = s < edge + 0.9 ? FROSTD : n3(x, y, z, 3) < 0.12 ? FROSTL : FROST;
      else c = s < 0.9 && t > 2 ? DOUGHL : n3(x, y, z, 1) < 0.2 ? DOUGHD : DOUGH;
      body.set(x, y, z, c);
    }
    // rainbow sprinkles (flush, so the upright face can slide over them)
    const spr = [];
    body.forEach((x, y, z, c) => {
      if (c !== FROST && c !== FROSTL) return;
      const side = x + 0.5 < 0 ? -1 : 1;
      if (body.has(x + side, y, z) || n3(x, y, z, 7) > 0.075) return;
      spr.push([x, y, z, SPR[Math.floor(n3(z, x, y, 2) * SPR.length) % SPR.length]]);
    });
    for (const [x, y, z, c] of spr) {
      body.set(x, y, z, c);
      const [dy, dz] = n3(x, z, y, 4) < 0.5 ? [1, 0] : [0, 1];
      if (body.get(x, y + dy, z + dz) === FROST) body.set(x, y + dy, z + dz, c);
    }
    // candy lightning bolts on both faces (they whirl round as it rolls)
    const BOLT = ['..MMM', '.MMM.', 'MMM..', 'MMMMM', '..MM.', '.MM..', 'MM...'];
    sideDecal(body, body, BOLT, { M: 0xffe14a }, { side: 1, y: 8, z: 2 });
    sideDecal(body, body, BOLT, { M: 0xffe14a }, { side: -1, y: 8, z: -3 });

    // ---- the upright face (does not roll)
    const head = G();
    sideEyes(head, body, 25, 1, 5, 5, { brow: INK, look: [0, -0.2], browThickness: 1, browDy: -1 });
    mirror(head);
    // stubby gloved arms punching forward off the front of the wheel
    const armL = G();
    capsule(armL, [-5.5, 12, 6], [-7.5, 10.5, 9.5], 0.9, 0.9, DOUGHD);
    glove(armL, -8, 10, 10.5, { r: 2.1, cuffCol: MAG });
    const armR = flipX(armL);
    // the hole is the mouth: dark throat + tongue in the middle, zig-zag teeth
    for (let x = -3; x <= 2; x++) {
      const s = Math.abs(x + 0.5);
      const lim = holeR(s) - 0.75;
      const cells = new Set();
      for (let y = 8; y <= 21; y++) for (let z = -7; z <= 6; z++) if (Math.hypot(y + 0.5 - CY, z + 0.5) < lim) cells.add(`${y},${z}`);
      for (const k of cells) {
        const [y, z] = k.split(',').map(Number);
        const yc = y + 0.5 - CY, zc = z + 0.5;
        if (s < 1) head.set(x, y, z, yc < -1.2 && Math.abs(zc) < 3.2 ? TONGUE : MOUTH);
        else {
          // teeth hang from the top of the hole and stick up from the bottom
          const up = !cells.has(`${y + 1},${z}`), up2 = !cells.has(`${y + 2},${z}`) && (z + 64) % 2 === 0;
          const dn = !cells.has(`${y - 1},${z}`), dn2 = !cells.has(`${y - 2},${z}`) && (z + 64) % 2 === 1;
          if (Math.abs(zc) < 3.6 && (up || up2 || dn || dn2)) head.set(x, y, z, T);
          else if (s < 2) head.set(x, y, z, MOUTH);
        }
      }
    }

    const C = [0, CY, 0];
    return {
      gait: 'roll',
      voxel: 0.05,
      parts: [
        jp('body', body, C),
        jp('head', head, C),
        jp('armL', armL, [-5.5, 12, 6]),
        jp('armR', armR, [4.5, 12, 6]),
      ],
      muzzle: [0, 14, 15],
      jitter: 0.02,
    };
  },
  // =================================================================== BURGER BRUTE
  // A towering double-decker cheeseburger tank. The sesame top bun is a
  // hinged lid (upper jaw) with a furious face that flips open to CHOMP; the
  // lower stack is a mouth lined with teeth, a ketchup tongue, lettuce lips
  // and cheese drooping over the patty. Huge meaty arms with white boxing
  // gloves, and a toothpick flag with a magenta lightning bolt.
  burgerBrute() {
    const BUN = 0xf2a443, BUNL = 0xffc96a, BUND = 0xc9772a, CRUMB = 0xffe3a6;
    const PAT = 0x6b3518, PATD = 0x4a2210, PATL = 0x8f5129;
    const CHZ = 0xffc21a, CHZL = 0xffdf5a;
    const LET = 0x5bd63a, LETD = 0x2f9e22, TOM = 0xf23a32, TOML = 0xff8a72;
    const SEED = 0xfff3cf, WOOD = 0xe8c48a;
    const RB = 10.5;
    const bunCol = (x, y, z) => (n3(x, y, z, 2) < 0.18 ? BUNL : n3(x, y, z, 6) < 0.1 ? BUND : BUN);
    const rr = (x, z) => Math.hypot(x + 0.5, z + 0.5);
    const ang = (x, z) => Math.atan2(z + 0.5, x + 0.5);

    const body = G();
    // bottom bun: rounded underside, crumb ring on the cut top
    blob(body, -0.5, 9.8, 0, RB, 3.9, RB, (x, y, z) => (y >= 11 ? CRUMB : bunCol(x, y, z)), { p: 2.4, clip: (x, y) => y > 11 });
    // patty: bumpy, chargrilled edge
    for (let y = 12; y <= 14; y++) for (let x = -13; x <= 12; x++) for (let z = -13; z <= 12; z++) {
      const lim = 11.3 + (n3(x, 0, z, 5) - 0.5) * 1.3 - (y !== 13 ? 0.45 : 0);
      if (rr(x, z) > lim) continue;
      body.set(x, y, z, n3(x, y, z, 1) < 0.25 ? PATD : n3(x, y, z, 8) < 0.15 ? PATL : PAT);
    }
    // cheese slice (a diamond-turned square) with the corners melting down
    for (let x = -16; x <= 15; x++) for (let z = -16; z <= 15; z++) {
      const u = Math.abs(x + 0.5), v = Math.abs(z + 0.5);
      if (u + v > 14.6) continue;
      const r = rr(x, z);
      const droop = r > 10.6 ? Math.floor((r - 10.6) * 1.15) : 0;
      for (let y = 15 - droop; y <= 15; y++) body.set(x, y, z, y === 15 - droop && droop > 0 ? CHZL : n3(x, y, z, 3) < 0.2 ? CHZL : CHZ);
    }
    // gooey cheese strings
    for (const [x, z, n] of [[-1, 13, 3], [5, 10, 2], [-8, 8, 2], [10, -3, 2]]) for (let i = 0; i < n; i++) body.set(x, 11 - i, z, CHZ);
    // ruffled lettuce
    for (let x = -14; x <= 13; x++) for (let z = -14; z <= 13; z++) {
      const r = rr(x, z), a = ang(x, z);
      const edge = 11.6 + Math.sin(a * 13) * 0.9;
      if (r > edge) continue;
      const lobe = Math.sin(a * 13) > 0.3;
      body.set(x, 16, z, r > edge - 1.2 ? LETD : LET);
      if (r > 10.4 && lobe) body.set(x, 15, z, LETD);
    }
    // tomato slices
    for (let x = -12; x <= 11; x++) for (let z = -12; z <= 11; z++) {
      const r = rr(x, z), a = ang(x, z);
      if (r > 10.6) continue;
      body.set(x, 17, z, r > 9.6 ? TOM : Math.sin(a * 6) > 0.6 && r > 7 ? TOML : TOM);
    }
    // mouth: dark floor + ketchup tongue + lower teeth around the front
    for (let x = -10; x <= 9; x++) for (let z = -10; z <= 9; z++) if (rr(x, z) < 8.6) body.set(x, 17, z, MOUTH);
    blob(body, -0.5, 17.6, 3.8, 3.8, 0.9, 4.6, TONGUE, { p: 2.2, clip: (x, y) => y < 18 });
    body.set(-1, 18, 6, 0xd8306e).set(0, 18, 6, 0xd8306e).set(-1, 18, 5, 0xd8306e).set(0, 18, 5, 0xd8306e);
    for (let x = -11; x <= 10; x++) for (let z = -3; z <= 11; z++) {
      const r = rr(x, z);
      if (r < 8.6 || r > 10.2) continue;
      body.set(x, 18, z, T);
      if (Math.floor((ang(x, z) + 4) * 10.4 / 2) % 2 === 0) body.set(x, 19, z, T);
    }
    // ketchup drips + pickles poking out of the sides
    for (const [x, z, n] of [[-6, 9, 3], [8, 6, 2], [-10, -2, 2]]) for (let i = 0; i < n; i++) body.set(x, 16 - i, z, 0xd8142a);
    for (const s of [-1, 1]) {
      const px = s < 0 ? -12 : 11;
      cyl(body, 'x', 16, 4, px, px + s, 2.2, 2.2, (x, y, z) => (Math.hypot(y - 16, z - 4) > 1.6 ? 0x2f8a2a : 0x8cd84a));
    }
    gradY(body, 6, 17, -0.12, 0.04);
    hollowOut(body);

    // ---- top bun lid (hinged at the back)
    const LJ = [-0.5, 20, -9];
    const lid = G();
    blob(lid, -0.5, 20, 0, RB + 0.3, 9.2, RB + 0.3, (x, y, z) => (y === 20 ? (rr(x, z) < 8.8 ? MOUTH : CRUMB) : bunCol(x, y, z)), { p: 2.15, clip: (x, y) => y < 20 });
    // upper teeth hanging from the front rim
    for (let x = -11; x <= 10; x++) for (let z = -3; z <= 11; z++) {
      const r = rr(x, z);
      if (r < 8.6 || r > 10.2) continue;
      lid.set(x, 19, z, T);
      if (Math.floor((ang(x, z) + 4) * 10.4 / 2) % 2 === 1) lid.set(x, 18, z, T);
    }
    gradY(lid, 20, 29, -0.06, 0.1);
    // furious face on the bun
    angryEyes(lid, 27, 1, 6, 6, { brow: INK, look: [0, -0.3], zmin: 0, browSlant: 3 });
    // sesame seeds on the dome
    for (let x = -11; x <= 10; x++) for (let z = -11; z <= 10; z++) {
      if (n3(x, 0, z, 9) > 0.07) continue;
      const y = topAt(lid, x, z, 20, 40);
      if (y === null || y < 25) continue;
      if (z > 2 && y < 28) continue; // keep the face clear
      lid.set(x, y + 1, z, SEED);
      if (n3(z, 1, x, 3) < 0.5) lid.set(x + 1, y + 1, z, SEED); else lid.set(x, y + 1, z + 1, SEED);
    }
    // toothpick flag (seen side-on by the battle camera)
    capsule(lid, [3, 26, -3], [3, 35, -3.5], 0.45, 0.45, WOOD);
    for (let y = 30; y <= 35; y++) for (let z = -11; z <= -4; z++) {
      const notch = z <= -10 && Math.abs(y - 32.5) < 1;
      if (notch) continue;
      lid.set(3, y, z, MAG).set(4, y, z, MAG);
    }
    const FLAGBOLT = ['..WW', '.WW.', 'WWWW', '.WW.', 'WW..'];
    stamp(lid, FLAGBOLT, { W: WHITE }, { axis: 'x', y: 34, z: -6 });
    stamp(lid, FLAGBOLT, { W: WHITE }, { axis: '-x', y: 34, z: -9 });
    hollowOut(lid);

    // ---- big meaty arms with boxing gloves
    const AJ = [-10.5, 13.5, 0];
    const armL = G();
    capsule(armL, [-10.5, 13.5, 0], [-14, 9.5, 2], 2.3, 2.0, PAT);
    glove(armL, -14.6, 7.6, 3.4, { r: 3.1, cuffCol: MAG });
    const armR = flipX(armL);

    const legL = stubLeg(-5, 7, 0, { col: PATD, r0: 2.4, r1: 2.1, ankle: 2.6, shoe: { col: MAG, w: 3.2, l: 4.2, h: 2.2 } });
    const legR = flipX(legL);

    const BJ = [-0.5, 6, 0];
    return {
      gait: 'walk',
      voxel: 0.05,
      parts: [
        jp('legL', legL, [-5, 7, 0]),
        jp('legR', legR, [4, 7, 0]),
        jp('body', body, BJ),
        jp('lid', lid, LJ, BJ, { parent: 'body', rot: [-0.2, 0, 0] }),
        jp('armL', armL, AJ, BJ, { parent: 'body' }),
        jp('armR', armR, [9.5, 13.5, 0], BJ, { parent: 'body' }),
      ],
      muzzle: [0, 18, 13],
      jitter: 0.02,
    };
  },
  // ===================================================================== SODA SURGE
  // A shaken-up blue-raspberry soda can with a magenta swoosh, foam bursting
  // out of the top and a striped bendy straw bent forward like a blaster: it
  // recoils as it sprays a fizzy stream that pierces everything in line.
  sodaSurge() {
    const CAN = 0x1fb4ff, CAND = 0x0f7fe0, CANL = 0x8fe2ff, SIL = 0xd8dfea, SILD = 0x9aa6b8, SILL = 0xf4f7fb;
    const FOAM = 0xf2fdff, FOAMB = 0xbfefff, FIZZ = 0x9ff4ff;
    const Y0 = 5, Y1 = 25, RC = 7.6;
    const radAt = (y) => (y <= Y0 + 1 ? RC - (Y0 + 2 - y) * 0.8 : y >= Y1 - 2 ? RC - (y - (Y1 - 3)) * 0.55 : RC);
    const canCol = (x, y, z) => {
      if (y <= Y0 + 1) return y === Y0 ? SILD : SIL;
      if (y >= Y1 - 1) return (x + z + 40) % 5 === 0 ? SILL : SIL;
      const th = Math.atan2(x + 0.5, z + 0.5); // 0 = straight ahead
      const yb = 7.6 + 6.5 * (1 - Math.cos(th)) / 2;
      const d = y - yb;
      if (Math.abs(d) < 1.2) return MAG;
      if (d >= 1.2 && d < 2.2) return WHITE;
      if (y === Y1 - 2 || y === Y0 + 2) return CAND;
      return n3(x, y, z, 4) < 0.06 ? CANL : CAN;
    };
    const body = G();
    for (let y = Y0; y <= Y1; y++) cyl(body, 'y', -0.5, -0.5, y, y, radAt(y), radAt(y), canCol);
    // lid rim + the opening the straw comes out of
    for (let x = -8; x <= 7; x++) for (let z = -8; z <= 7; z++) {
      const r = Math.hypot(x + 0.5, z + 0.5);
      if (r > 4.7 && r < 6.2) body.set(x, Y1 + 1, z, SIL);
    }
    body.box(-2, Y1, 1, 1, Y1, 4, 0x1a2638);
    // pull tab at the back of the lid
    body.box(-2, Y1 + 1, -4, 1, Y1 + 1, -2, SILL).del(-1, Y1 + 1, -3).del(0, Y1 + 1, -3);
    // foam bursting out of the top and running down the sides
    blob(body, -0.5, Y1 + 1.4, 3, 2.6, 1.3, 2.2, (x, y, z) => (n3(x, y, z, 5) < 0.3 ? FOAMB : FOAM), { p: 2 });
    for (const [x, y, z] of [[-2, 27, 5], [1, 27, 4], [-4, 26, 4], [3, 26, 2], [-3, 27, 1]]) body.set(x, y, z, FOAM);
    for (const [x, y, z] of [[-7, 24, 2], [-7, 23, 2], [-7, 22, 2], [-8, 21, 2], [6, 24, 1], [6, 23, 1], [7, 22, 1]]) body.set(x, y, z, FOAM);
    // dented side + a few bubbles printed on the label
    for (const [x, y] of [[-8, 18], [-8, 17]]) body.set(x, y, -2, CAND);
    stamp(body, ['.WW.', 'W..W', 'W..W', '.WW.'], { W: CANL }, { axis: '-x', y: 21, z: -2 });
    stamp(body, ['.W.', 'W.W', '.W.'], { W: CANL }, { axis: 'x', y: 19, z: -3 });
    // big white lightning-bolt logo on the back
    stamp(body, ['..WWW', '.WWW.', 'WWW..', 'WWWWW', '..WW.', '.WW..', 'WW...'], { W: WHITE }, { axis: '-z', x: -3, y: 22 });
    gradY(body, Y0, Y1, -0.12, 0.06);

    // face
    angryEyes(body, 22, 1, 6, 6, { brow: INK, browSlant: 2 });
    const mouthMask = (x, y) => y >= 9 && y <= 14 && Math.abs(x + 0.5) <= 6 - (y < 11 ? (11 - y) * 1.6 : 0);
    carveMouth(body, mouthMask, -8, 7, 9, 14, { depth: 3 });
    for (let x = -3; x <= 2; x++) for (let y = 9; y <= 10; y++) { const z = frontAt(body, x, y, -6, 10); if (z !== null && body.get(x, y, z) === MOUTH) body.set(x, y, z, TONGUE); }
    // fizzy drool spilling over the lip
    for (const [x, n] of [[-3, 3], [-2, 2], [1, 4], [2, 2]]) {
      for (let i = 1; i <= n; i++) { const z = frontAt(body, x, 9 - i, -8, 10); if (z !== null) body.set(x, 9 - i, z + 1, i === n ? FIZZ : FOAM, i === n && x === 1); }
    }

    // ---- bendy-straw blaster (striped MrBeast magenta)
    const CJ = [-0.5, Y1, 2.5];
    const straw = G();
    const stripe = (x, y, z) => (z > 6 ? (Math.floor(z / 2) % 2 === 0 ? MAG : WHITE) : y < 30 ? (Math.floor(y / 2) % 2 === 0 ? MAG : WHITE) : 0xff8fd0);
    chain(straw, [[-0.5, Y1 - 1, 2.5], [-0.5, 30, 2.5], [-0.5, 32.6, 4.4], [-0.5, 33.4, 7.5], [-0.5, 33.4, 14]], 1.5, stripe);
    // flared nozzle + fizzy bubbles (glow)
    cyl(straw, 'z', -0.5, 33.4, 14, 15, 1.6, 2.1, WHITE, { hollow: 1 });
    for (const [x, y, z] of [[-1, 33, 16], [0, 34, 17], [-1, 35, 18], [0, 33, 19], [-2, 34, 18]]) straw.set(x, y, z, z % 2 ? FIZZ : WHITE, true);

    // ---- arms + legs
    const AJ = [-7.6, 16, 0];
    const armL = G();
    capsule(armL, [-7.6, 16, 0], [-10.6, 12, 2], 1.3, 1.2, SIL);
    glove(armL, -11.1, 10.6, 2.6, { r: 2.1, cuffCol: MAG });
    const armR = flipX(armL);
    const legL = stubLeg(-3.5, 5.5, 0, { col: CAND, r0: 1.7, r1: 1.5, shoe: { col: MAG, sole: WHITE, toe: WHITE } });
    const legR = flipX(legL);

    const BJ = [-0.5, 5, 0];
    return {
      gait: 'hop',
      voxel: 0.05,
      parts: [
        jp('legL', legL, [-3.5, 5.5, 0]),
        jp('legR', legR, [2.5, 5.5, 0]),
        jp('body', body, BJ),
        jp('cannon', straw, CJ, BJ, { parent: 'body' }),
        jp('armL', armL, AJ, BJ, { parent: 'body' }),
        jp('armR', armR, [6.6, 16, 0], BJ, { parent: 'body' }),
      ],
      muzzle: [-0.5, 33.5, 17],
      jitter: 0.02,
    };
  },
};
