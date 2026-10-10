// Additional Swarm models. Same format as swarmModels.js (see swarmRig.js).
// Convention: model faces +Z, y=0 is the ground, 1 unit = 1 voxel, x symmetric
// around -0.5 (mirrorX(-1) maps x -> -1-x).
import { VoxGrid } from '../core/voxel.js';
import { shade } from '../core/util.js';
import { C, noise } from './helpers.js';

// ---------------------------------------------------------------------------
// Local modelling helpers

const G = () => new VoxGrid();

/** Colour fn picking from a palette with spatial noise. */
const pal = (cols, seed = 0) => (x, y, z) => cols[Math.min(cols.length - 1, Math.floor(noise(x + seed * 13, y + seed * 7, z - seed * 5) * cols.length))];
/** Colour fn: base colour with occasional alt colour. */
const mot = (a, b, p = 0.25, seed = 0) => (x, y, z) => (noise(x + seed * 11, y - seed * 3, z + seed * 5) < p ? b : a);
/** Re-flag existing voxels as glowing where fn(x,y,z,c) is true (optionally recolour). */
function glowWhere(g, fn, col) {
  const hits = [];
  g.forEach((x, y, z, c) => { if (fn(x, y, z, c)) hits.push([x, y, z, c]); });
  for (const [x, y, z, c] of hits) g.set(x, y, z, col ?? c, true);
  return g;
}
/** Set only where empty. */
function fill(g, x, y, z, c, glow) {
  if (!g.has(x, y, z)) g.set(x, y, z, c, glow);
}
/** Recolour existing voxels in a box. */
function paintBox(g, x0, y0, z0, x1, y1, z1, c, glow) {
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
      for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) if (g.has(x, y, z)) g.set(x, y, z, c, glow);
  return g;
}
/** Mirror helper for a single voxel set (x and -1-x). */
function sym(g, x, y, z, c, glow) {
  g.set(x, y, z, c, glow);
  g.set(-1 - x, y, z, c, glow);
}
function symBox(g, x0, y0, z0, x1, y1, z1, c, glow) {
  g.box(x0, y0, z0, x1, y1, z1, c, glow);
  g.box(-1 - x0, y0, z0, -1 - x1, y1, z1, c, glow);
}

/**
 * Big cartoon eye on a +Z facing plane z. (x,y) = bottom-left. side 'L' (model's left, -x) or 'R'.
 * o: w,h, white, pupil, pw, ph, glow (whites glow), pupilGlow, glint (bool), look ([dx,dy] pupil offset from inner-bottom),
 *    brow (colour) + angry/sad, lid (colour, covers top row), depth (extra layers behind)
 */
function bigEye(g, x, y, z, o = {}) {
  const w = o.w ?? 3, h = o.h ?? 3;
  const white = o.white ?? C.white;
  g.box(x, y, z, x + w - 1, y + h - 1, z, white, !!o.glow);
  // rounded corners for big eyes
  if (w >= 3 && h >= 3 && o.round !== false) {
    g.del(x, y + h - 1, z); g.del(x + w - 1, y + h - 1, z);
    if (h >= 4) { g.del(x, y, z); g.del(x + w - 1, y, z); }
  }
  const pw = o.pw ?? (w >= 3 ? 2 : 1), ph = o.ph ?? (h >= 3 ? 2 : 1);
  const look = o.look ?? [0, 0];
  const inner = o.side === 'R' ? x : x + w - pw;
  const px = Math.max(x, Math.min(x + w - pw, inner + look[0]));
  const py = Math.max(y, Math.min(y + h - ph, y + (h >= 4 ? 1 : 0) + look[1]));
  g.box(px, py, z, px + pw - 1, py + ph - 1, z, o.pupil ?? C.ink, !!o.pupilGlow);
  if (o.glint !== false && pw >= 2 && ph >= 2) g.set(o.side === 'R' ? px + pw - 1 : px, py + ph - 1, z, o.glintC ?? 0xffffff, true);
  if (o.lid) g.box(x, y + h - 1, z, x + w - 1, y + h - 1, z, o.lid);
  if (o.brow) {
    // slanted brow in the eye plane: outer end high, inner end dips into the eye (angry) or the reverse (sad)
    const outer = o.side === 'R' ? x + w - 1 : x;
    const dir = o.side === 'R' ? -1 : 1; // towards centre
    for (let i = 0; i < w; i++) {
      const bx = outer + dir * i;
      const t = w === 1 ? 0 : i / (w - 1);
      let by = y + h;
      if (o.angry && t > 0.6) by = y + h - 1;
      if (o.sad && t < 0.4) by = y + h - 1;
      g.set(bx, by, z, o.brow);
    }
    if (o.angry) g.set(outer + dir * w, y + h - 1, z, o.brow);
  }
  if (o.depth) g.box(x, y, z - o.depth, x + w - 1, y + h - 1, z - 1, white, !!o.glow);
}
/** Pair of big eyes, gap = distance from centre seam to the inner edge. */
function bigEyes(g, gap, y, z, o = {}) {
  const w = o.w ?? 3;
  bigEye(g, -gap - w, y, z, { ...o, side: 'L' });
  bigEye(g, gap - 1, y, z, { ...o, side: 'R', look: o.look ? [-o.look[0], o.look[1]] : undefined });
}

/** Quadruped leg: top at y=0 (pivot), foot at y=-h. */
function quadLeg(o = {}) {
  const g = G();
  const w = o.w ?? 2, d = o.d ?? w, h = o.h ?? 3;
  const x0 = -Math.floor(w / 2), x1 = x0 + w - 1, z0 = -Math.floor(d / 2), z1 = z0 + d - 1;
  g.box(x0, -h, z0, x1, -1, z1, o.color);
  if (o.upper) g.box(x0, -Math.floor(h / 2), z0, x1, -1, z1, o.upper);
  g.box(x0, -h, z0, x1, -h, z1 + (o.toe ? 1 : 0), o.paw ?? shade(typeof o.color === 'number' ? o.color : 0x888888, -0.15));
  if (o.claw) for (let x = x0; x <= x1; x += o.clawStep ?? 1) g.set(x, -h, z1 + (o.toe ? 2 : 1), o.claw, !!o.clawGlow);
  return g;
}
function quadLegs(makeL, makeR, o = {}) {
  const xl = o.xl ?? -2, xr = o.xr ?? 2, y = o.y ?? 3, fz = o.fz ?? 3, bz = o.bz ?? -3;
  return [
    { name: 'legFL', grid: makeL('F'), at: [xl, y, fz] },
    { name: 'legFR', grid: makeR('F'), at: [xr, y, fz] },
    { name: 'legBL', grid: makeL('B'), at: [xl, y, bz] },
    { name: 'legBR', grid: makeR('B'), at: [xr, y, bz] },
  ];
}

/** Biped leg (x -1..0 by default), top at y=0, foot with toe forward. */
function bipedLeg(o = {}) {
  const g = G();
  const h = o.h ?? 3, x0 = o.x0 ?? -1, x1 = o.x1 ?? 0, z0 = o.z0 ?? -1, z1 = o.z1 ?? 0;
  g.box(x0, -h, z0, x1, -1, z1, o.color);
  if (o.knee) g.box(x0, -Math.ceil(h / 2), z1 + 1, x1, -Math.ceil(h / 2), z1 + 1, o.knee);
  const fh = o.footH ?? 1;
  g.box(x0 - (o.wide ? 1 : 0), -h, z0 - (o.heel ? 1 : 0), x1 + (o.wide ? 1 : 0), -h + fh - 1, z1 + (o.toe ?? 1), o.foot ?? o.color);
  if (o.claw) for (let x = x0 - (o.wide ? 1 : 0); x <= x1 + (o.wide ? 1 : 0); x += o.clawStep ?? 1) g.set(x, -h, z1 + (o.toe ?? 1) + 1, o.claw, !!o.clawGlow);
  return g;
}

/** Hanging arm, pivot at the shoulder (y=0), hand at the bottom. */
function arm(o = {}) {
  const g = G();
  const len = o.len ?? 3, x0 = o.x0 ?? -1, x1 = o.x1 ?? 0, z0 = o.z0 ?? -1, z1 = o.z1 ?? 0;
  g.box(x0, -len, z0, x1, 0, z1, o.color);
  if (o.hand) {
    const hw = o.handGrow ?? 0;
    g.box(x0 - hw, -len - (o.handH ?? 2), z0 - hw, x1 + hw, -len - 1, z1 + hw, o.hand);
  }
  if (o.claw) {
    const yb = -len - (o.handH ?? 2) - (o.hand ? 0 : -1);
    for (let x = x0; x <= x1; x++) g.set(x, yb - 1, z1, o.claw, !!o.clawGlow);
  }
  return g;
}

/** 7x7 radiation trefoil sticker. axis: 'z' (plane z, u=x), 'x' (plane x, u=z), 'y' (plane y, u=x, v=z). */
const TREFOIL = ['..yyy..', '.KKyKK.', 'yKKyKKy', 'yyyKyyy', 'yyKKKyy', '.yKKKy.', '..yyy..'];
function trefoil(g, cu, cv, plane, axis = 'z', o = {}) {
  const fg = o.fg ?? C.ink, bg = o.bg ?? 0xffd23f;
  for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
    const ch = TREFOIL[r][c];
    if (ch === '.') continue;
    const col = ch === 'K' ? fg : bg;
    const glow = ch === 'K' ? !!o.glowFg : !!o.glowBg;
    const u = cu - 3 + c, v = cv + 3 - r;
    if (axis === 'z') g.set(u, v, plane, col, glow);
    else if (axis === 'x') g.set(plane, v, u, col, glow);
    else g.set(u, plane, cv - 3 + r, col, glow);
  }
}

// ---------------------------------------------------------------------------
// Cat head (shared by the panthers): head box x -4..3, y -3..4, z 0..7,
// snout y 0..1 z 8..10, mouth cavity under the snout, jaw part hinged at (y=-1, z=5).
function catHead(o) {
  const head = G();
  head.box(-4, -3, 0, 3, 4, 7, o.skin);
  // bevel front/top edges
  for (const x of [-4, 3]) { head.del(x, 4, 7); head.del(x, 4, 0); head.del(x, -3, 7); }
  head.box(-3, 0, 8, 2, 1, 10, o.snout);
  head.box(-2, 2, 8, 1, 2, 9, o.snoutTop ?? o.snout);
  head.set(-1, 2, 10, o.nose ?? C.ink).set(0, 2, 10, o.nose ?? C.ink); // nose
  // mouth cavity
  head.carve((x, y, z) => y <= -2 && z >= 5);
  head.box(-3, -1, 5, 2, -1, 9, o.roof ?? 0x4a0c18);
  for (const x of [-3, -1, 0, 2]) head.set(x, -1, 10, o.tooth ?? C.tooth);
  if (o.fangs !== false) { head.set(-3, -2, 10, o.tooth ?? C.tooth); head.set(2, -2, 10, o.tooth ?? C.tooth); }
  const jaw = G();
  jaw.box(-3, -2, 0, 2, -1, 4, o.jaw);
  jaw.box(-2, -1, 0, 1, -1, 3, o.tongue ?? 0x7a1a2a);
  jaw.set(-1, -1, 2, C.tongue).set(0, -1, 2, C.tongue);
  for (const x of [-2, 1]) jaw.set(x, 0, 4, o.tooth ?? C.tooth);
  return { head, jaw };
}

// ---------------------------------------------------------------------------
// Atomic slime (big + mini share one builder)
function slime(o) {
  const k = o.mini ? 0.66 : 1;
  const greens = [0x7cff3a, 0x66e82e, 0x8cff4a, 0x5fd82a];
  const skin = (x, y, z) => (y <= 0 ? 0x3fae1a : greens[Math.floor(noise(x, y, z) * greens.length) % greens.length]);
  const body = G();
  const cy = 4 * k, rx = 4.6 * k, ry = 4.2 * k, rz = 4.3 * k;
  body.ellipsoid(-0.5, cy, 0, rx, ry, rz, skin);
  body.carve((x, y) => y < 0);
  body.ellipsoid(-0.5, 0, 0, rx + 0.8, 0.3, rz + 0.8, 0x4fc81f); // puddle base
  body.ellipsoid(-0.5, Math.round(cy + ry * 0.95), -1, 1.4 * k, 1.4 * k, 1.4 * k, skin); // droplet tip
  body.set(-1, Math.round(cy + ry * 0.95 + 1.6 * k), -2, 0x8cff4a);
  // glowing speckles + bubbles
  glowWhere(body, (x, y, z) => noise(x + 9, y, z) < 0.09 && y > 0, 0xd8ff9a);
  glowWhere(body, (x, y, z) => noise(x, y + 4, z + 2) < 0.05 && y > 1, 0xb8ff6a);
  // drips hanging from the sides
  const b = body.bounds();
  for (const [x, z] of o.mini ? [[-3, 1], [2, -2]] : [[-5, 1], [4, -2], [-3, -4], [2, 3], [-1, -5]]) {
    let top = -1;
    for (let y = b.maxY; y >= 1; y--) if (body.has(x, y, z)) { top = y; break; }
    if (top < 0) continue;
    body.set(x + (x < 0 ? -1 : 1), 1, z, 0x66e82e).set(x + (x < 0 ? -1 : 1), 2, z, 0x7cff3a);
  }
  // face on the front surface
  const fz = (x, y) => { for (let z = b.maxZ; z >= 0; z--) if (body.has(x, y, z)) return z; return 0; };
  if (o.mini) {
    const ey = 3, z = Math.max(fz(-2, ey), fz(1, ey)) + 1;
    bigEye(body, -3, ey, z, { w: 2, h: 2, side: 'L' });
    bigEye(body, 1, ey, z, { w: 2, h: 2, side: 'R' });
    body.box(-1, 1, z, 0, 1, z, 0x1a4a0a).set(-1, 1, z, C.tooth);
  } else {
    const ey = 4, z = Math.max(fz(-3, ey + 1), fz(2, ey + 1)) + 1;
    bigEye(body, -4, ey, z, { w: 3, h: 4, side: 'L', look: [0, 0] });
    bigEye(body, 1, ey + 1, z, { w: 3, h: 3, side: 'R' });
    body.box(-3, 1, z - 1, 2, 2, z - 1, 0x1a4a0a);
    body.box(-2, 1, z - 1, 1, 1, z - 1, 0x2a6a10);
    body.set(-3, 2, z - 1, C.tooth).set(2, 2, z - 1, C.tooth).set(-1, 1, z - 1, C.tongue).set(0, 1, z - 1, C.tongue);
    body.set(-4, 3, z - 1, 0x1a4a0a).set(3, 3, z - 1, 0x1a4a0a);
    // a stray bolt stuck in the goo
    body.box(-6, 5, -1, -5, 5, -1, 0x9aa2b4).set(-6, 6, -1, 0xb8c0cc);
  }
  return { gait: 'hop', parts: [{ name: 'body', grid: body, at: [0, 0, 0] }], muzzle: [0, 4 * k, 5 * k] };
}

// ---------------------------------------------------------------------------

export const EXTRA_MODELS = {
  // ======================================================== Beast Originals
  steelPanther() {
    const plate = 0x6b7386, plateL = 0x9aa2b4, seam = 0x3e4452, rivet = 0xdde3ec, under = 0x4e5564;
    const collar = 0x26232e, spike = 0xeef2f8, red = 0xff2a2a, hot = 0xffc0b0;
    const armor = (x, y, z) => {
      const zz = z + 7;
      if (zz % 4 === 0) return seam;
      let c = (Math.floor(zz / 4) % 2) ? plateL : plate;
      if (y <= 1) c = under;
      return noise(x, y, z) < 0.14 ? shade(c, -0.1) : noise(x + 3, y, z) > 0.92 ? shade(c, 0.12) : c;
    };
    const body = G();
    body.box(-4, 0, -7, 3, 6, 4, armor);
    for (const x of [-4, 3]) for (const z of [-7, 4]) { body.del(x, 6, z); body.del(x, 0, z); }
    // rivets on each plate
    for (let z = -6; z <= 4; z += 4) for (const y of [2, 5]) { sym(body, -4, y, z + 1, rivet); }
    // shoulder & hip pauldrons (raised plates)
    for (const [z0, z1] of [[1, 4], [-7, -4]]) {
      symBox(body, -5, 3, z0, -5, 6, z1, plateL);
      symBox(body, -4, 7, z0, -3, 7, z1, plateL);
      sym(body, -5, 6, z0, seam); sym(body, -5, 6, z1, seam);
      sym(body, -5, 5, Math.round((z0 + z1) / 2), rivet);
    }
    // spine ridge
    for (let z = -6; z <= 2; z += 2) { body.set(-1, 7, z, seam).set(0, 7, z, seam); body.set(-1, 8, z, plate).set(0, 8, z, plate); }
    // spiked collar (slab between body and head)
    body.box(-5, 1, 5, 4, 7, 5, collar);
    body.carve((x, y, z) => z === 5 && (x === -5 || x === 4) && (y === 1 || y === 7));
    for (const y of [3, 6]) { sym(body, -6, y, 5, spike); sym(body, -7, y, 5, 0xb8c0cc); }
    for (const x of [-4, -2, 1, 3]) { body.set(x, 8, 5, spike); }
    body.set(-3, 9, 5, 0xb8c0cc).set(2, 9, 5, 0xb8c0cc);
    body.set(-1, 0, 5, spike).set(0, 0, 5, spike);
    for (const x of [-4, -2, 1, 3]) body.set(x, 1, 6, 0xffcf3a); // studs
    // battle scratches
    body.set(-4, 4, -2, rivet).set(-4, 3, -1, rivet).set(3, 4, 0, rivet).set(3, 3, 1, rivet);

    const hd = catHead({
      skin: (x, y, z) => (y >= 3 ? (x === -1 || x === 0 ? seam : plateL) : noise(x, y, z) < 0.15 ? shade(plate, -0.1) : plate),
      snout: plateL, snoutTop: plate, nose: 0x15121f, jaw: plate, tooth: spike, roof: 0x3a0a14,
    });
    const head = hd.head;
    // glowing red angry eyes with visor brow
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -4 : 1;
      head.box(x0, 2, 8, x0 + 2, 3, 8, red, true);
      head.set(s < 0 ? x0 + 2 : x0, 2, 8, hot, true);
    }
    head.box(-4, 4, 8, 3, 4, 8, seam);
    head.set(-2, 3, 8, seam).set(1, 3, 8, seam).set(-1, 3, 8, seam).set(0, 3, 8, seam);
    // cheek armour + rivets
    symBox(head, -5, -2, 2, -5, 2, 6, plateL);
    sym(head, -6, 0, 4, rivet);
    // angular ears
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -4 : 2;
      head.box(x0, 5, 2, x0 + 1, 6, 4, plate);
      head.set(s < 0 ? x0 : x0 + 1, 7, 3, plate);
      head.set(s < 0 ? x0 + 1 : x0, 5, 5, 0x2a2a33).set(s < 0 ? x0 + 1 : x0, 6, 5, 0x2a2a33);
    }
    head.box(-1, 5, 1, 0, 5, 6, rivet); // crest
    const tail = G();
    tail.box(-1, 0, -3, 0, 1, -1, plate).box(-1, 1, -5, 0, 2, -4, plateL).box(-1, 2, -7, 0, 3, -6, plate);
    tail.box(-2, 3, -10, 1, 5, -8, seam);
    for (const [x, y, z] of [[-3, 4, -9], [2, 4, -9], [-1, 6, -9], [0, 6, -9], [-1, 4, -11], [0, 4, -11], [-1, 2, -9]]) tail.set(x, y, z, spike);
    const leg = () => {
      const g = quadLeg({ w: 3, h: 3, color: plate, upper: plateL, paw: seam, toe: true, claw: spike });
      g.set(-2, -1, 0, rivet).set(2, -1, 0, rivet);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        ...quadLegs(leg, leg, { xl: -3, xr: 2, y: 3, fz: 2, bz: -5 }),
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 8, 6] },
        { name: 'jaw', grid: hd.jaw, at: [0, -1, 5], parent: 'head' },
        { name: 'tail', grid: tail, at: [0, 7, -7] },
      ],
      muzzle: [0, 8, 17],
    };
  },

  hyperFusionPanther() {
    const fireP = [0xff4a1a, 0xf03a14, 0xff5f22, 0xe8341a];
    const iceP = [0x3a9ad8, 0x4ab0e8, 0x2f8ad0, 0x58bcf0];
    const chrome = [0xf2f6fc, 0xc8d2e0, 0xa4b0c4, 0xe0e6f0];
    const fireAt = (x, y, z) => x + (noise(y, z, 77) < 0.3 ? 1 : 0) - (noise(y, z, 99) < 0.25 ? 1 : 0) < 0;
    const skin = (x, y, z) => {
      const isF = fireAt(x, y, z);
      const p = isF ? fireP : iceP;
      let c = p[Math.floor(noise(x, y, z) * p.length) % p.length];
      if (y <= 0) c = isF ? 0xb81e10 : 0x2470b0;
      return c;
    };
    const flameCol = (i, h) => (i >= h - 1 ? 0xfff6a0 : i >= h - 2 ? 0xffd23f : i >= h - 3 ? 0xffa21a : 0xff6a1a);
    const body = G();
    body.box(-4, 0, -7, 3, 6, 5, skin);
    for (const x of [-4, 3]) for (const z of [-7, 5]) { body.del(x, 6, z); body.del(x, 0, z); }
    // hot-rod flame decal rising up the fire flank
    const fh = [5, 3, 2, 4, 6, 3, 2, 4, 5, 2, 3, 5, 4];
    for (let z = -7; z <= 5; z++) {
      const h = fh[(z + 7) % fh.length];
      for (let y = 0; y < h && y <= 6; y++) if (body.has(-4, y, z)) body.set(-4, y, z, y >= h - 1 ? 0xff7a1a : y >= h - 2 ? 0xffb21a : 0xffe14a, true);
    }
    // icicle decal hanging down the ice flank
    const ih = [4, 2, 1, 3, 5, 2, 1, 3, 4, 1, 2, 4, 3];
    for (let z = -7; z <= 5; z++) {
      const h = ih[(z + 7) % ih.length];
      for (let i = 0; i < h; i++) if (body.has(3, 6 - i, z)) body.set(3, 6 - i, z, i === h - 1 ? 0xffffff : i === 0 ? 0xa8e8ff : 0xd8f6ff);
    }
    // chrome seam stripe down the spine
    for (let z = -7; z <= 5; z++) { body.set(-1, 7, z, chrome[(z + 9) % 4]); body.set(0, 7, z, chrome[(z + 10) % 4]); }
    for (let z = -6; z <= 4; z += 3) { body.set(-1, 8, z, 0xff5ad8, true); body.set(0, 8, z, 0x7ff6ff, true); }
    // flame tufts on the fire half of the back, ice shards on the ice half
    for (const [x, z, h] of [[-4, -5, 4], [-3, -2, 5], [-4, 1, 4], [-3, 4, 3], [-2, -7, 3]]) {
      for (let i = 0; i < h; i++) {
        body.set(x, 7 + i, z - (i >> 1), flameCol(i, h), true);
        if (i < h - 2) body.set(x + 1, 7 + i, z - (i >> 1), flameCol(i + 1, h), true);
      }
    }
    for (const [x, z, h] of [[3, -5, 4], [2, -2, 5], [3, 1, 3], [2, 4, 3], [1, -7, 2]]) {
      for (let i = 0; i < h; i++) body.set(x, 7 + i, z - (i >> 1), i === h - 1 ? 0xffffff : i === 0 ? 0x8fe4ff : 0xc8f4ff, i === h - 1);
      body.set(x - 1, 7, z, 0xbdf2ff);
    }
    // neck
    body.box(-3, 3, 6, 2, 7, 7, skin);
    // chrome fusion core orb on the chest
    for (let x = -4; x <= 3; x++) for (let y = -1; y <= 5; y++) for (let z = 4; z <= 11; z++) {
      const d = Math.hypot(x + 0.5, (y - 1.8) * 1.05, z - 7);
      if (d > 3.1) continue;
      if (y >= 3 && z >= 8) continue;
      const ring = y === 1 || y === 2;
      body.set(x, y, z, ring ? [0xff5ad8, 0xffffff, x < 0 ? 0xffb03a : 0x7ff6ff][(z + x + 30) % 3] : chrome[(x + y * 2 + z + 20) % 4], ring);
    }
    body.box(-2, 0, 10, 1, 2, 10, 0xff5ad8, true);
    body.box(-1, 0, 10, 0, 2, 10, 0xffffff, true);
    body.set(-1, 1, 11, 0xffffff, true).set(0, 1, 11, 0xffffff, true);
    body.set(-2, 1, 10, 0xffb03a, true).set(1, 1, 10, 0x7ff6ff, true);
    // icicles hanging under the ice belly
    for (const z of [-5, -2, 2]) { body.set(3, -1, z, 0xd8f6ff); body.set(3, -2, z, 0xffffff, true); }

    const hd = catHead({
      skin, snout: (x, y, z) => (fireAt(x, y, z) ? 0xffc46a : 0xd8f6ff), nose: 0x2a1030,
      jaw: (x, y, z) => (x < 0 ? 0xd8301a : 0x3a9ad8), tooth: 0xffffff,
    });
    const head = hd.head;
    // eyes: fire eye & ice eye
    head.box(-4, 2, 8, -2, 3, 8, 0xffe14a, true);
    head.set(-2, 2, 8, 0xc81a00).set(-2, 3, 8, 0xffffff, true);
    head.box(1, 2, 8, 3, 3, 8, 0xc8ffff, true);
    head.set(1, 2, 8, 0x0f4f9a).set(1, 3, 8, 0xffffff, true);
    head.box(-4, 4, 8, -3, 4, 8, 0x7a1408).set(-2, 4, 9, 0x7a1408);
    head.box(2, 4, 8, 3, 4, 8, 0x1a4a88).set(1, 4, 9, 0x1a4a88);
    // flame decal on fire cheek
    for (let z = 0; z <= 7; z++) {
      const h = [3, 5, 2, 4, 6, 3, 4, 2][z];
      for (let y = -3; y < -3 + h; y++) if (head.has(-4, y, z)) head.set(-4, y, z, y >= -4 + h ? 0xff7a1a : 0xffd23f, true);
    }
    // flame mane: tongues licking up and back from the fire half of the head
    for (const [x, z, h] of [[-4, 1, 5], [-3, 3, 6], [-2, 5, 4], [-4, 5, 4], [-2, 1, 4], [-3, -1, 5]]) {
      for (let i = 0; i < h; i++) {
        const zz = z - (i >> 1);
        head.set(x, 5 + i, zz, flameCol(i, h), true);
        if (i < h - 2) head.set(x + (x < -3 ? 1 : -1), 5 + i, zz, flameCol(i + 1, h), true);
      }
    }
    for (const [y, z, h] of [[-2, 2, 4], [0, 4, 3], [2, 1, 4], [-1, 6, 3]]) {
      for (let i = 0; i < h; i++) head.set(-5 - (i > 1 ? 1 : 0), y + (i >> 1), z - i, flameCol(i, h), true);
    }
    // ice crown (right half)
    for (const [x, z, h] of [[2, 3, 5], [3, 1, 4], [1, 5, 3], [3, 5, 3], [1, 1, 3]]) {
      for (let i = 0; i < h; i++) head.set(x, 5 + i, z - (i >> 1), i === h - 1 ? 0xffffff : i === 0 ? 0x8fe4ff : 0xc8f4ff, i === h - 1);
    }
    for (const [y, z] of [[-2, 2], [0, 4], [2, 1], [-1, 6]]) {
      head.set(4, y, z, 0xc8f4ff).set(5, y, z - 1, 0xe4faff).set(6, y, z - 2, 0xffffff, true);
    }
    // ears
    head.box(-4, 5, 1, -3, 6, 3, 0xff5a1a);
    head.box(2, 5, 1, 3, 6, 3, 0x3a9ad8);

    const tail = G();
    for (let i = 0; i < 5; i++) {
      const y = Math.floor(i * 0.8);
      tail.set(-1, y, -1 - i * 2, 0xff5a1a).set(-1, y, -2 - i * 2, 0xff7a22);
      tail.set(0, y, -1 - i * 2, 0x3a9ad8).set(0, y, -2 - i * 2, 0x58bcf0);
    }
    for (let i = 0; i < 4; i++) tail.set(-1 - (i > 2 ? 1 : 0), 3 + i, -11 - (i >> 1), flameCol(i, 4), true);
    tail.box(-2, 3, -12, -1, 4, -11, 0xffa21a, true);
    tail.box(0, 3, -12, 1, 4, -11, 0xbdf2ff).set(1, 5, -11, 0xc8f4ff).set(1, 6, -12, 0xffffff, true).set(0, 5, -13, 0xffffff, true);
    const legF = () => {
      const g = quadLeg({ w: 3, h: 4, color: pal([0xe8341a, 0xff4a1a, 0xc82814]), paw: 0x3a0a0a, toe: true, claw: 0xffd23f, clawGlow: true });
      for (let x = -1; x <= 1; x++) g.set(x, -2, 2, 0xffa21a, true);
      g.set(-1, -3, 2, 0xffe14a, true).set(1, -3, 2, 0xffe14a, true);
      return g;
    };
    const legI = () => {
      const g = quadLeg({ w: 3, h: 4, color: pal([0x3a9ad8, 0x4ab0e8, 0x2f8ad0]), paw: 0xe4faff, toe: true, claw: 0xffffff, clawGlow: true });
      g.set(2, -1, 0, 0xc8f4ff).set(2, -2, 0, 0xffffff, true);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        ...quadLegs(legF, legI, { xl: -3, xr: 2, y: 4, fz: 3, bz: -5 }),
        { name: 'body', grid: body, at: [0, 4, 0] },
        { name: 'head', grid: head, at: [0, 10, 8] },
        { name: 'jaw', grid: hd.jaw, at: [0, -1, 5], parent: 'head' },
        { name: 'tail', grid: tail, at: [0, 9, -7] },
      ],
      muzzle: [0, 10, 19],
    };
  },

  // ======================================================== Home Horrors
  toiletRollRipper() {
    const paper = (x, y, z) => (y % 3 === 0 ? 0xe8e9f0 : noise(x, y, z) < 0.2 ? 0xffffff : 0xf6f6f2);
    const body = G();
    body.cylinder(-0.5, -0.5, 0, 9, 3.6, paper, 'y');
    body.box(-3, 0, 3, 2, 9, 3, paper); // flatter face
    // rims
    body.paint((x, y, z, c) => (y === 0 || y === 9) && Math.hypot(x + 0.5, z + 0.5) > 3 ? 0xdcdee6 : undefined);
    // cardboard tube on top
    body.carve((x, y, z) => y >= 7 && Math.hypot(x + 0.5, z + 0.5) < 1.1);
    for (let x = -3; x <= 2; x++) for (let z = -3; z <= 2; z++) {
      const d = Math.hypot(x + 0.5, z + 0.5);
      if (d >= 1.1 && d < 2.2) body.set(x, 9, z, (x + z) % 2 ? 0xc8945a : 0xb07a44).set(x, 10, z, d < 1.7 ? 0xd8a468 : null);
      if (d < 1.1) body.set(x, 6, z, 0x3a2010);
    }
    for (let x = -1; x <= 0; x++) for (let z = -1; z <= 0; z++) for (let y = 7; y <= 10; y++) body.del(x, y, z);
    for (const [x, z] of [[-2, -1], [-2, 0], [1, -1], [1, 0], [-1, -2], [0, -2], [-1, 1], [0, 1]]) body.set(x, 10, z, 0xd8a468);
    // paper shark fin at the back
    body.box(-1, 10, -4, 0, 11, -3, 0xf6f6f2).set(-1, 12, -4, 0xf6f6f2).set(0, 12, -4, 0xe8e9f0).box(-1, 10, -5, 0, 10, -5, 0xe8e9f0);
    // shark mouth
    body.carve((x, y, z) => z >= 1 && x >= -3 && x <= 2 && y >= 2 && y <= 5);
    body.box(-3, 2, 1, 2, 5, 1, 0x3a0814);
    body.box(-3, 5, 2, 2, 5, 3, 0xc8344a); // gums
    body.box(-3, 2, 2, 2, 2, 3, 0xc8344a);
    for (const x of [-3, -1, 0, 2]) body.set(x, 4, 3, C.tooth).set(x, 4, 2, C.tooth);
    for (const x of [-2, 1]) body.set(x, 3, 3, C.tooth).set(x, 3, 2, C.tooth);
    body.set(-3, 3, 3, C.tooth).set(2, 3, 3, C.tooth);
    // black shark eyes + angry brows
    for (const [x0, s] of [[-3, -1], [1, 1]]) {
      body.box(x0, 6, 4, x0 + 1, 7, 4, C.ink);
      body.set(s < 0 ? x0 : x0 + 1, 7, 4, 0xffffff, true);
      body.set(s < 0 ? x0 : x0 + 1, 9, 4, C.ink).set(s < 0 ? x0 + 1 : x0, 8, 4, C.ink);
      body.set(s < 0 ? x0 - 1 : x0 + 2, 9, 3, C.ink);
    }
    // quilted paper pattern on the sides
    body.paint((x, y, z, c) => (Math.abs(x + 0.5) > 2.5 && (x + y + z + 40) % 4 === 0 && y > 0 && y < 9 && c !== C.ink ? 0xe2e4ec : undefined));
    body.set(3, 2, -3, 0x8a7a6a).set(3, 3, -3, 0x8a7a6a);
    // paper tongue (jaw): unrolls out of the mouth and dangles
    const tongue = G();
    tongue.box(-2, 0, -1, 1, 0, 4, 0xffffff);
    tongue.box(-2, -3, 5, 1, 0, 5, 0xf6f6f2);
    tongue.box(-2, -3, 6, 1, -3, 6, 0xffffff);
    for (let x = -2; x <= 1; x++) { tongue.set(x, 0, 2, 0xd0d2dc); tongue.set(x, -2, 5, 0xd0d2dc); }
    tongue.set(-1, 0, -1, 0xff9ab0).set(0, 0, -1, 0xff9ab0);
    const foot = () => {
      const g = G();
      g.box(-1, -2, -1, 0, -1, 0, 0xe4e6ee).box(-1, -2, 1, 0, -2, 1, 0xcfd2dc);
      return g;
    };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-2, 2, 0] },
        { name: 'legR', grid: foot(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'jaw', grid: tongue, at: [0, 2, 2], parent: 'body' },
      ],
      muzzle: [0, 6, 5],
    };
  },

  mutantMailbox() {
    const blue = (x, y, z) => ((z + 10) % 4 === 0 ? 0x2456c0 : noise(x, y, z) < 0.15 ? 0x3a7cf0 : 0x2f68e0);
    const wood = (x, y, z) => ((y + (x & 1)) % 3 === 0 ? 0x6a4224 : noise(x, y, z) < 0.3 ? 0x9a6a3a : 0x86562e);
    const body = G();
    // stand + post
    body.box(-3, 0, -1, 2, 0, 0, wood);
    body.box(-1, 0, -1, 0, 3, 0, wood);
    body.set(-1, 2, 1, 0x5a3a20).set(0, 1, -2, 0x5a3a20);
    // box with arched top
    body.box(-3, 4, -4, 2, 7, 5, blue);
    body.cylinder(-0.5, 7, -4, 5, 3.2, blue, 'z');
    body.carve((x, y, z) => y < 4);
    body.box(-1, 0, -1, 0, 3, 0, wood);
    body.box(-3, 0, -1, 2, 0, 0, wood);
    // hollow mouth opening at the front
    body.carve((x, y, z) => z >= 2 && z <= 5 && x >= -2 && x <= 1 && y >= 5 && y <= 9);
    body.box(-2, 5, 1, 1, 9, 1, 0x1a1430);
    // teeth hanging from the arch, rim
    for (let x = -2; x <= 1; x++) body.set(x, 9, 5, (x & 1) ? C.tooth : null);
    body.set(-2, 9, 4, C.tooth).set(1, 9, 4, C.tooth).set(-1, 8, 5, C.tooth).set(0, 8, 5, C.tooth);
    for (let x = -3; x <= 2; x++) for (let y = 4; y <= 10; y++) if (body.has(x, y, 5)) body.set(x, y, 5, 0x1f48a8);
    // letters spilling out
    body.box(-2, 7, 2, 0, 7, 7, 0xf7f7f2).set(-2, 7, 7, C.red).set(0, 7, 7, 0x1477c9).set(-1, 7, 6, 0xd8d8e0);
    body.box(-1, 8, 3, 1, 8, 6, 0xfff4d0).set(1, 8, 6, C.red).set(-1, 8, 6, 0x1477c9);
    body.box(-2, 5, 2, 1, 5, 4, 0xf7f7f2).set(0, 6, 3, 0xfff4d0);
    // side decals: white label & dents
    body.box(-4, 5, -2, -4, 7, 1, 0xffd23f).box(-4, 6, -2, -4, 6, 1, C.red).set(-4, 5, 1, 0xf7f7f2);
    body.set(3, 6, -3, 0x1f48a8).set(3, 5, 2, 0x1f48a8);
    body.set(-4, 5, -3, 0xffd23f).set(-4, 9, 3, 0x3a7cf0);
    // big wonky eyeballs on top
    const eyeBall = (x0, y0, z0, lx, ly, lid) => {
      body.box(x0, y0, z0, x0 + 3, y0 + 3, z0 + 3, 0xf7f7f2);
      for (const dx of [0, 3]) for (const dy of [0, 3]) { body.del(x0 + dx, y0 + dy, z0); body.del(x0 + dx, y0 + dy, z0 + 3); }
      body.box(x0 + lx, y0 + ly, z0 + 3, x0 + lx + 1, y0 + ly + 1, z0 + 3, C.ink);
      body.set(x0 + lx, y0 + ly + 1, z0 + 3, 0xffffff, true);
      body.set(x0 + lx + 1, y0 + ly, z0 + 4, C.ink);
      if (lid) body.box(x0, y0 + 3, z0, x0 + 3, y0 + 3, z0 + 3, 0x2456c0).box(x0 + 1, y0 + 4, z0 + 1, x0 + 2, y0 + 4, z0 + 2, 0x2f68e0);
    };
    eyeBall(-4, 9, 2, 1, 1, false);
    eyeBall(0, 9, 1, 1, 0, true);
    body.box(-2, 9, 2, 1, 9, 3, 0x2f68e0);
    // front door = jaw (hinged at the bottom front, slightly ajar)
    const door = G();
    for (let x = -3; x <= 2; x++) for (let y = 0; y <= 6; y++) {
      const dy = y - 3, dx = x + 0.5;
      if (y > 3 && Math.hypot(dx, dy) > 3.6) continue;
      door.set(x, y, 0, (x === -3 || x === 2 || y === 0 || Math.hypot(dx, dy) > 2.7) && y > 0 ? 0x2456c0 : 0x3a7cf0);
    }
    door.box(-1, 5, 1, 0, 5, 1, 0xc8d0dc); // latch
    for (const x of [-2, 0]) door.set(x, 5, -1, C.tooth).set(x, 6, -1, C.tooth);
    for (const x of [-1, 1]) door.set(x, 6, -1, C.tooth);
    door.box(-2, 1, -1, 1, 3, -1, 0xff6f8a); // tongue lining
    // flag (side, raised)
    const flag = G();
    flag.box(0, 0, 0, 0, 5, 0, 0xc8d0dc);
    flag.box(0, 4, -3, 0, 6, -1, C.red).set(0, 6, -1, 0xff5a5a).set(0, 4, -3, 0xb81e28);
    const foot = () => {
      const g = G();
      g.box(-1, -2, -1, 0, -1, 0, 0x5a3a20).box(-1, -2, 1, 0, -2, 1, 0x4a2a14);
      return g;
    };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-2, 2, 0] },
        { name: 'legR', grid: foot(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'jaw', grid: door, at: [0, 4, 6], parent: 'body', rot: [0.85, 0, 0] },
        { name: 'flag', grid: flag, at: [3, 8, -1], parent: 'body' },
      ],
      muzzle: [0, 9, 7],
    };
  },

  ragingStopSign() {
    const red = (x, y, z) => (noise(x, y, z) < 0.15 ? 0xd01c26 : 0xe4262e);
    const metal = mot(0x9aa2b4, 0x8a92a4, 0.3), metalD = 0x6b7386;
    // sign (head): 10x10 octagon, 3 thick, white border
    const inOct = (x, y) => Math.abs(x + 0.5) <= 4.5 && Math.abs(y - 4.5) <= 4.5 && Math.abs(x + 0.5) + Math.abs(y - 4.5) <= 6.5;
    const head = G();
    for (let x = -5; x <= 4; x++) for (let y = 0; y <= 9; y++) {
      if (!inOct(x, y)) continue;
      const edge = !inOct(x + 1, y) || !inOct(x - 1, y) || !inOct(x, y + 1) || !inOct(x, y - 1);
      head.set(x, y, 0, metal);
      head.set(x, y, 1, red);
      head.set(x, y, 2, edge ? 0xf4f4f0 : red);
    }
    head.box(-1, 2, -1, 0, 7, -1, metalD); // bracket on the back
    head.set(-1, 3, -2, 0xc8d0dc).set(0, 6, -2, 0xc8d0dc);
    // furious face
    for (const [x0, s] of [[-3, -1], [1, 1]]) {
      head.box(x0, 4, 3, x0 + 1, 6, 3, C.white);
      head.box(s < 0 ? x0 + 1 : x0, 4, 3, s < 0 ? x0 + 1 : x0, 5, 3, C.ink);
      head.set(s < 0 ? x0 + 1 : x0, 5, 3, 0x3a3a50);
      // heavy slanted brows
      head.set(s < 0 ? x0 - 1 : x0 + 2, 7, 3, C.ink).set(x0 + (s < 0 ? 0 : 1), 7, 3, C.ink).set(s < 0 ? x0 + 1 : x0, 6, 3, C.ink);
      head.set(s < 0 ? x0 + 2 : x0 - 1, 6, 3, C.ink);
    }
    head.box(-2, 1, 3, 1, 2, 3, 0x2a0a10);
    head.set(-2, 2, 3, C.white).set(1, 2, 3, C.white).set(-1, 1, 3, 0xff6f8a).set(0, 1, 3, 0xff6f8a);
    head.set(-3, 1, 3, C.ink).set(2, 1, 3, C.ink);
    // body: metal pole with bolts and a hip bracket
    const body = G();
    body.box(-1, 0, -1, 0, 4, 0, metal);
    body.box(-2, 0, -1, 1, 0, 0, metalD);
    body.set(-2, 2, -1, 0xc8d0dc).set(1, 2, -1, 0xc8d0dc);
    for (let y = 0; y <= 4; y += 2) body.set(-1, y, 1, 0x7a8294).set(0, y + 1, 1, 0x7a8294);
    // concrete-chunk feet on metal legs
    const leg = () => {
      const g = G();
      g.box(-1, -3, -1, 0, -1, 0, metal);
      g.box(-2, -3, -2, 1, -2, 1, mot(0xb0b0a8, 0x8a8a84, 0.3));
      g.set(-2, -2, 1, null).set(1, -2, -2, null).set(-1, -3, 2, 0x9a9a92).set(0, -3, 2, 0xb0b0a8);
      return g;
    };
    const armG = () => {
      const g = G();
      g.box(-1, -3, -1, 0, 0, 0, metal);
      g.box(-1, -5, -1, 0, -4, 0, 0xf4f4f0).set(-1, -5, 1, 0xf4f4f0).set(0, -4, 1, 0xd8d8e0); // white gloves
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 3, 0] },
        { name: 'legR', grid: leg(), at: [2, 3, 0] },
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 7, 0] },
        { name: 'armL', grid: armG(), at: [-6, 12, 1] },
        { name: 'armR', grid: armG(), at: [6, 12, 1] },
      ],
      muzzle: [0, 10, 4],
    };
  },

  badEggsperiment() {
    const shell = (x, y, z) => (noise(x, y, z) < 0.12 ? 0xd8c090 : noise(x + 5, y, z) < 0.1 ? 0xe8d8b0 : 0xfff3d6);
    const yolk = mot(0xffc21a, 0xffa800, 0.3);
    const R = (y) => { const t = (y - 4.3) / 5.2; return t * t >= 1 ? 0 : 4.2 * Math.sqrt(1 - t * t) * (1 - 0.13 * t); };
    const crack = (x, z) => 5 + ((x + z + 40) % 3 === 0 ? 1 : 0) - ((x * 3 + z + 40) % 4 === 0 ? 1 : 0);
    const body = G(), lid = G();
    for (let y = 0; y <= 9; y++) {
      const r = R(y);
      for (let x = -5; x <= 4; x++) for (let z = -5; z <= 4; z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > r + 0.3) continue;
        const isShell = d > r - 0.9;
        if (y <= crack(x, z)) body.set(x, y, z, isShell ? shell : yolk);
        else if (isShell) lid.set(x, y, z, shell);
        else if (y <= 7 && d < r - 1.4) body.set(x, y, z, yolk); // yolk monster rises inside
      }
    }
    // crack opening at the front reveals the yolk monster
    const gapF = (x, y, z) => z >= 1 && Math.abs(x + 0.5) <= 3 && y >= 4 && y <= 7;
    body.carve((x, y, z, c) => gapF(x, y, z) && z >= 2 && y >= 4);
    lid.carve((x, y, z) => gapF(x, y, z));
    for (let x = -3; x <= 2; x++) for (let y = 4; y <= 7; y++) fill(body, x, y, 2, yolk);
    // peeking eyes + fangs
    for (const [x0, s] of [[-3, -1], [1, 1]]) {
      body.box(x0, 5, 3, x0 + 1, 6, 3, C.white);
      body.set(s < 0 ? x0 + 1 : x0, 5, 3, C.ink).set(s < 0 ? x0 + 1 : x0, 6, 3, 0x3a1a00);
      body.set(s < 0 ? x0 : x0 + 1, 6, 3, 0xffffff, true);
    }
    body.set(-2, 4, 3, C.tooth).set(1, 4, 3, C.tooth).box(-1, 4, 3, 0, 4, 3, 0x7a1a0a);
    // jagged shell edges around the gap
    for (const [x, y] of [[-4, 6], [3, 5], [-4, 4], [3, 7]]) fill(body, x, y, 2, 0xfff3d6);
    // lab goggles strapped around the top shell
    lid.paint((x, y, z) => (y === 7 ? 0x2a2a3a : undefined));
    for (const [cx, s] of [[-2, -1], [1, 1]]) {
      lid.box(cx - 1, 7, 4, cx + 1, 9, 4, 0xff8a2a);
      lid.box(cx - (s < 0 ? 1 : 0), 8, 5, cx + (s < 0 ? 0 : 1), 8, 5, 0x9fe8ff);
      lid.set(cx, 8, 4, 0x9fe8ff).set(s < 0 ? cx - 1 : cx + 1, 9, 5, 0xffffff, true);
    }
    lid.carve((x, y, z) => y === 7 && z === 4 && (x === -3 || x === 2));
    // hairline cracks spreading from the opening
    for (const [x, y, z] of [[-4, 6, 1], [-5, 5, 0], [-5, 6, -1], [3, 6, 1], [4, 7, 0], [4, 6, -1], [-1, 8, 3], [0, 9, 2]]) if (lid.has(x, y, z)) lid.set(x, y, z, 0x8a7a5a);
    for (const [x, y, z] of [[-4, 3, 2], [-4, 2, 1], [3, 3, 2], [3, 2, 1]]) if (body.has(x, y, z)) body.set(x, y, z, 0x8a7a5a);
    // warning sticker
    lid.set(-5, 6, 0, 0xffd23f).set(-5, 6, -1, 0xffd23f).set(-5, 7, -1, C.ink);
    // fuse (antenna) with a glowing tip
    const fuse = G();
    fuse.set(0, 0, 0, 0x5a4a3a).set(0, 1, -1, 0x3a2a1a).set(1, 2, -1, 0x3a2a1a);
    fuse.set(1, 3, -1, 0xff6a1a, true).set(1, 4, -1, 0xffd23f, true).set(2, 4, -1, 0xfff6a0, true).set(0, 4, -2, 0xffa21a, true).set(2, 3, 0, 0xfff27a, true);
    const leg = () => {
      const g = G();
      g.box(0, -3, 0, 0, -1, 0, 0xff9a2a);
      g.box(-1, -3, 1, 1, -3, 1, 0xff8a1a).set(0, -3, 2, 0xff8a1a).set(0, -3, -1, 0xe87a14);
      return g;
    };
    const lidPivot = [0, 5, -4];
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 3, 0] },
        { name: 'legR', grid: leg(), at: [1, 3, 0] },
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'lid', grid: lid, at: [0, 3 + lidPivot[1], lidPivot[2]], pivot: lidPivot, parent: null },
        { name: 'antenna', grid: fuse, at: [0, 10 - lidPivot[1], 0 - lidPivot[2]], parent: 'lid' },
      ],
      muzzle: [0, 8, 5],
    };
  },

  barfBin() {
    const bin = (x, y, z) => ((x + 40) % 2 === 0 && Math.abs(z + 0.5) > 3 ? 0x237a34 : (z + 40) % 2 === 0 && Math.abs(x + 0.5) > 3 ? 0x237a34 : noise(x, y, z) < 0.18 ? 0x3aa04c : 0x2e9040);
    const barf = (x, y, z) => { const n = noise(x, y, z); return n < 0.1 ? 0xff9a2a : n < 0.18 ? 0x8a5a2a : n < 0.55 ? 0x9cff3a : 0x7ad82a; };
    const body = G();
    body.box(-4, 0, -4, 3, 8, 3, bin);
    body.box(-5, 8, -5, 4, 8, 4, 0x237a34); // rim
    for (const x of [-4, 3]) for (const z of [-4, 3]) body.box(x, 0, z, x, 7, z, 0x1f6a2e);
    // recycling arrows on the sides
    for (const x of [-5, 4]) {
      body.set(x, 4, -1, 0xf0f0e0).set(x, 5, 0, 0xf0f0e0).set(x, 4, 1, 0xf0f0e0).set(x, 3, -1, 0xf0f0e0).set(x, 3, 0, 0xf0f0e0).set(x, 3, 1, 0xf0f0e0);
    }
    // sickly face: droopy eyes with bags
    for (const [x0, s] of [[-4, -1], [1, 1]]) {
      body.box(x0, 4, 4, x0 + 2, 6, 4, 0xf4f8d0);
      if (s < 0) body.box(x0, 6, 4, x0 + 2, 6, 4, 0x1f5a2a); // droopy lid on one eye
      body.set(x0 + 1, s < 0 ? 4 : 5, 4, C.ink);
      body.set(x0 + 1, s < 0 ? 5 : 4, 4, 0xd8e0a0);
      body.box(x0, 3, 4, x0 + 2, 3, 4, 0x8a6aa8); // eye bags
      body.set(s < 0 ? x0 : x0 + 2, 7, 4, 0x1f5a2a);
    }
    // gaping mouth
    body.box(-3, 0, 4, 2, 2, 4, 0x2a0a10);
    body.box(-2, 2, 4, 1, 2, 4, 0x2a0a10);
    body.set(-3, 2, 4, C.tooth).set(2, 2, 4, C.tooth).set(-1, 2, 5, 0xe8f0a0);
    // barf pouring out and a puddle
    body.box(-2, -1, 4, 1, 1, 5, barf);
    body.box(-1, -2, 5, 0, -1, 6, barf);
    body.ellipsoid(-0.5, -2, 7, 3.5, 0, 3, barf);
    body.set(-3, -2, 11, 0x9cff3a).set(3, -2, 9, 0x7ad82a);
    glowWhere(body, (x, y, z, c) => (c === 0x9cff3a) && y <= 1 && z >= 4 && noise(x, y, z + 3) < 0.4);
    // drips down the bin
    for (const [x, z, n] of [[-5, 2, 3], [4, -1, 2], [-5, -3, 1], [4, 3, 4]]) for (let i = 0; i < n; i++) body.set(x, 7 - i, z, 0x9cff3a);
    // stink lines
    body.set(-5, 10, 0, 0xb8ff7a).set(-6, 11, 0, 0xb8ff7a).set(-5, 12, 0, 0xb8ff7a);
    const lid = G();
    lid.box(-5, 0, 0, 4, 1, 9, 0x2a8a3c);
    lid.box(-4, 2, 1, 3, 2, 8, 0x38a04a);
    lid.box(-1, 3, 4, 0, 3, 6, 0x1f6a2e); // handle
    // compost poking out from under the lid
    lid.box(-4, -1, 8, -3, -1, 9, 0xffd23f).set(-5, -2, 9, 0xffd23f); // banana peel
    lid.box(2, -1, 7, 2, -2, 8, 0x8a5a2a).set(2, -1, 9, 0xff4a3a); // apple core
    lid.set(0, -1, 9, 0xf0e8d0).set(-1, -1, 9, 0x6aa83a);
    const foot = () => {
      const g = G();
      g.box(-1, -2, -1, 1, -1, 0, 0x1f6a2e).box(-1, -2, 1, 1, -2, 1, 0x18562a);
      return g;
    };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-2, 2, -1] },
        { name: 'legR', grid: foot(), at: [2, 2, -1] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'lid', grid: lid, at: [0, 9, -5], parent: 'body' },
      ],
      muzzle: [0, 4, 7],
    };
  },

  atomicToilet() {
    const por = (x, y, z) => (noise(x, y, z) < 0.12 ? 0xe4e8f0 : 0xf4f6f8), porD = 0xd0d6e0;
    const goo = (x, y, z) => (noise(x, y, z) < 0.3 ? 0xb8ff6a : 0x7cff3a);
    const body = G();
    body.box(-3, 0, -2, 2, 3, 3, por); // pedestal
    body.box(-4, 0, -3, 3, 0, 4, porD);
    body.ellipsoid(-0.5, 5.5, 2, 5.2, 2.6, 5, por);
    body.carve((x, y, z) => y >= 6 && ((x + 0.5) ** 2) / 14 + ((z - 2) ** 2) / 13 < 1);
    // radioactive water (glowing)
    for (let x = -5; x <= 4; x++) for (let z = -3; z <= 7; z++) {
      if (((x + 0.5) ** 2) / 14 + ((z - 2) ** 2) / 13 < 1) body.set(x, 6, z, goo, true);
    }
    body.set(-2, 7, 1, 0xd8ffb0, true).set(1, 7, 3, 0xb8ff6a, true).set(0, 8, 2, 0xd8ffb0, true).set(-1, 7, 4, 0x9cff3a, true); // bubbles
    body.box(-5, 7, 6, 4, 7, 6, porD); // rim front
    // glowing drips running down the bowl
    for (const [x, z, n] of [[-5, 4, 3], [4, 2, 2], [-3, 7, 4], [2, 7, 2]]) for (let i = 0; i < n; i++) fill(body, x + (x < 0 ? -1 : 1) * (i > 1 ? 0 : 0), 6 - i, z + (i > 0 ? 1 : 0), 0x7cff3a, true);
    // tank with trefoil stickers, hazard-striped lid
    body.box(-5, 5, -9, 4, 13, -3, por);
    const hz = (u, y) => ((u + y + 40) % 4 < 2 ? 0xffd23f : 0x1a1a1a);
    body.box(-6, 14, -10, 5, 15, -2, por); // tank lid
    for (let x = -6; x <= 5; x++) { body.set(x, 14, -2, hz(x, 14)); body.set(x, 15, -2, hz(x, 15)); body.set(x, 14, -10, hz(-x, 14)); body.set(x, 15, -10, hz(-x, 15)); }
    for (let z = -10; z <= -2; z++) for (const y of [14, 15]) { body.set(-6, y, z, hz(z, y)); body.set(5, y, z, hz(-z, y)); }
    body.box(-2, 16, -7, 1, 16, -6, 0x7cff3a, true); // glowing cap button
    trefoil(body, -6, 9, -6, 'x');
    trefoil(body, -6, 9, 5, 'x');
    body.box(4, 11, -2, 6, 11, -2, C.metal).set(6, 10, -2, C.metal); // handle
    // glowing green eyes on the tank front
    for (const [x0, s] of [[-4, -1], [1, 1]]) {
      body.box(x0, 9, -2, x0 + 2, 11, -2, 0x9cff3a, true);
      body.set(s < 0 ? x0 + 2 : x0, 9, -2, 0x1a3a0a).set(s < 0 ? x0 + 2 : x0, 10, -2, 0x1a3a0a);
      body.set(s < 0 ? x0 : x0 + 2, 11, -2, 0xeaffd0, true);
      body.set(s < 0 ? x0 : x0 + 2, 12, -1, C.ink).set(x0 + 1, 12, -1, C.ink).set(s < 0 ? x0 + 2 : x0, 11, -1, C.ink);
    }
    // green glow leaking from under the lid
    for (const x of [-4, -2, 1, 3]) body.set(x, 7, 6, 0x9cff3a, true);
    const lid = G();
    lid.box(-5, 0, 0, 4, 0, 9, porD);
    lid.box(-4, 1, 1, 3, 1, 8, por);
    trefoil(lid, -1, 5, 2, 'y');
    const foot = () => {
      const g = G();
      g.box(-1, -2, -1, 1, -1, 1, porD).box(-1, -2, 2, 1, -2, 2, 0xb8c0cc);
      return g;
    };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-3, 2, 0] },
        { name: 'legR', grid: foot(), at: [3, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'lid', grid: lid, at: [0, 8, -1], parent: 'body', rot: [-0.22, 0, 0] },
      ],
      muzzle: [0, 9, 3],
    };
  },

  shockSign() {
    const yel = (x, y, z) => (noise(x, y, z) < 0.15 ? 0xf0c020 : 0xffd23f);
    const inD = (x, y) => Math.abs(x + 0.5) + Math.abs(y - 6.5) <= 6.2;
    const head = G();
    for (let x = -7; x <= 6; x++) for (let y = 0; y <= 13; y++) {
      if (!inD(x, y)) continue;
      const edge = Math.abs(x + 0.5) + Math.abs(y - 6.5) > 5.2;
      head.set(x, y, 0, 0x8a92a4);
      head.set(x, y, 1, yel);
      head.set(x, y, 2, edge ? 0x1a1a1a : yel);
    }
    head.box(-1, 2, -1, 0, 9, -1, 0x6b7386); // bracket
    // lightning bolt
    const bolt = [[10, [0, 1]], [9, [-1, 0]], [8, [-2, 1]], [7, [0, 1]], [6, [-1, 0]], [5, [-2, -1]], [4, [-2, -2]]];
    for (const [y, [a, b]] of bolt) for (let x = a; x <= b; x++) head.set(x, y, 3, C.ink);
    // electric eyes with angry brows
    for (const [x0, s] of [[-5, -1], [3, 1]]) {
      head.box(x0, 6, 3, x0 + 1, 7, 3, 0x7ff6ff, true);
      head.set(s < 0 ? x0 + 1 : x0, 6, 3, 0xffffff, true);
      head.set(s < 0 ? x0 + 1 : x0, 7, 3, C.ink).set(x0, 8, 3, C.ink).set(x0 + 1, 8, 3, C.ink);
    }
    // zig-zag grin
    head.box(-3, 3, 3, 2, 3, 3, C.ink).box(-2, 2, 3, 1, 2, 3, C.ink);
    for (const x of [-3, -1, 1]) head.set(x, 3, 3, C.white);
    for (const x of [-2, 0]) head.set(x, 2, 3, C.white);
    // glowing sparks around the edges
    const spark = 0x7ff6ff, sparkW = 0xe8ffff;
    for (const [x, y, z] of [[-5, 10, 1], [-6, 11, 1], [-5, 12, 1], [-6, 13, 1], [4, 10, 1], [5, 11, 1], [4, 12, 1], [5, 13, 1], [-4, 2, 1], [-5, 1, 1], [-6, 2, 1], [3, 2, 1], [4, 1, 1], [5, 2, 1]]) head.set(x, y, z, (x + y) % 2 ? spark : sparkW, true);
    // antenna with sparking tip
    const ant = G();
    ant.box(0, 0, 0, 0, 1, 0, 0x8a92a4);
    ant.set(0, 2, 0, 0xffffff, true).set(-1, 3, 0, spark, true).set(1, 3, 0, spark, true).set(-1, 2, 0, spark, true).set(1, 2, 0, sparkW, true);
    const body = G();
    body.box(-1, 0, -1, 0, 3, 0, mot(0x9aa2b4, 0x8a92a4));
    body.box(-3, 0, -2, 2, 0, 1, 0x6b7386);
    for (const y of [1, 3]) body.set(-1, y, 1, 0xffd23f).set(0, y, 1, C.ink);
    const armG = () => {
      const g = G();
      g.box(-1, -3, -1, 0, 0, 0, 0x8a92a4);
      g.box(-1, -5, -1, 0, -4, 0, 0x7ff6ff, true);
      g.set(-1, -6, 0, 0xffffff, true).set(0, -5, 1, 0xe8ffff, true);
      return g;
    };
    const foot = () => { const g = G(); g.box(-1, -2, -1, 0, -1, 0, 0x2a2a33).box(-1, -2, 1, 0, -2, 1, 0x1a1a22); return g; };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-2, 2, 0] },
        { name: 'legR', grid: foot(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'head', grid: head, at: [0, 3, 0] },
        { name: 'antenna', grid: ant, at: [0, 16, 1] },
        { name: 'armL', grid: armG(), at: [-7, 10, 1] },
        { name: 'armR', grid: armG(), at: [7, 10, 1] },
      ],
      muzzle: [0, 10, 4],
    };
  },

  // ======================================================== Techno Terrors
  glitchBot() {
    const beige = mot(0xddd3b8, 0xcfc4a4, 0.25), beigeD = 0xb8ab88;
    const metal = mot(0x8f9ab0, 0x7d889e, 0.3), metalD = 0x4e5668;
    const head = G();
    head.box(-4, 0, -3, 3, 7, 3, beige); // CRT casing
    head.box(-3, 1, -5, 2, 6, -4, beigeD); // tube bulge at the back
    head.box(-2, 2, -6, 1, 5, -6, beigeD);
    for (const x of [-4, 3]) for (let z = -2; z <= 1; z += 1) if ((z & 1) === 0) head.box(x, 2, z, x, 5, z, 0x9a8e6e); // side vents
    // screen with scanlines
    for (let x = -3; x <= 2; x++) for (let y = 1; y <= 6; y++) head.set(x, y, 4, y % 2 ? 0x0c1420 : 0x182638);
    head.box(-4, 0, 4, 3, 0, 4, beigeD).box(-4, 7, 4, 3, 7, 4, beigeD).box(-4, 1, 4, -4, 6, 4, beigeD).box(3, 1, 4, 3, 6, 4, beigeD);
    // glitchy glowing face
    const mag = 0xff3ad8, cy = 0x3af6ff;
    head.box(-3, 4, 4, -2, 5, 4, mag, true).set(-3, 5, 5, 0xffb0f0, true);
    head.box(1, 4, 4, 2, 5, 4, cy, true).set(2, 5, 5, 0xc0ffff, true);
    head.set(-1, 4, 4, 0x7a1a6a, true); // chromatic smear
    head.set(-2, 2, 4, mag, true).set(-1, 2, 4, 0xffffff, true).set(0, 2, 4, cy, true).set(1, 3, 4, cy, true).set(-3, 3, 4, mag, true);
    head.set(2, 1, 4, 0x7cff3a, true).set(-3, 6, 4, 0x3af6ff, true); // dead pixels
    // knobs + power LED
    head.set(-3, 0, 5, 0x5a5040).set(-2, 0, 5, 0x5a5040).set(2, 0, 5, 0xff3a3a, true);
    head.set(-4, 7, 0, 0xff8a2a).set(-4, 6, 1, 0x29b6f6); // sticker
    const ant = G();
    ant.box(0, 0, 0, 0, 2, 0, metalD).set(0, 3, 0, 0xff3ad8, true).set(1, 2, 0, 0x8f9ab0).set(1, 3, 0, 0x8f9ab0);
    const body = G();
    body.box(-3, 0, -2, 2, 4, 2, metal);
    body.box(-2, 1, 3, 1, 3, 3, metalD); // chest panel
    body.set(-2, 3, 3, 0xff3a3a, true).set(-1, 3, 3, 0xffd23f, true).set(0, 3, 3, 0x7cff3a, true);
    body.box(-2, 1, 3, 1, 1, 3, 0x2a3040).set(1, 2, 3, 0x3af6ff, true).set(-2, 2, 3, 0x9aa2b4);
    body.box(-3, 4, -2, 2, 4, 2, 0x5d6476); // neck plate
    for (const x of [-4, 3]) body.box(x, 2, -1, x, 4, 0, metalD); // shoulder joints
    body.set(-1, 0, -3, metalD).set(0, 0, -3, metalD).set(-1, 2, -3, 0xffd23f); // backpack bolt
    const legG = () => bipedLeg({ h: 2, color: metalD, foot: 0x3a3f4e, toe: 1, knee: 0x8f9ab0 });
    const armLg = G();
    armLg.box(-1, -3, -1, 0, 0, 0, metal).box(-1, -4, -1, 0, -4, 0, metalD);
    armLg.set(-1, -5, -1, 0xc8d0dc).set(-1, -5, 0, 0xc8d0dc).set(0, -5, 0, 0xc8d0dc).set(-1, -6, 0, 0xc8d0dc); // pincer
    const armRg = G(); // blaster arm
    armRg.box(-1, -2, -1, 0, 0, 0, metal);
    armRg.cylinder(-0.5, -0.5, -5, -3, 1.4, (x, y, z) => (y === -4 ? 0xff3ad8 : 0x5d6476), 'y');
    armRg.box(-1, -6, -1, 0, -6, 0, 0x3af6ff, true);
    armRg.set(-2, -4, -1, 0xff3ad8, true).set(1, -4, 0, 0xff3ad8, true);
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: legG(), at: [-2, 2, 0] },
        { name: 'legR', grid: legG(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'head', grid: head, at: [0, 7, 0] },
        { name: 'antenna', grid: ant, at: [1, 15, -1] },
        { name: 'armL', grid: armLg, at: [-4, 6, 0] },
        { name: 'armR', grid: armRg, at: [4, 6, 0] },
      ],
      muzzle: [4, 5, 5],
    };
  },

  droneFang() {
    const shellC = mot(0x353b4a, 0x2a2f3a, 0.3), top = 0x4a5266, red = 0xe8343c;
    const body = G();
    body.box(-3, 0, -4, 2, 4, 3, shellC);
    body.box(-3, 4, -4, 2, 4, 3, top);
    body.box(-2, 5, -3, 1, 5, 1, top);
    for (let z = -4; z <= 3; z++) { body.set(-4, 2, z, red); body.set(3, 2, z, red); }
    body.box(-4, 1, -4, -4, 3, -3, 0x2a2f3a).box(3, 1, -4, 3, 3, -3, 0x2a2f3a);
    // arms to the four rotor hubs
    for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      const x0 = sx < 0 ? -3 : 2, z0 = sz < 0 ? -4 : 3;
      const hx = sx < 0 ? -6 : 5, hz = sz < 0 ? -6 : 5;
      body.line(x0, 3, z0, hx, 3, hz, 0x5d6476);
      body.box(Math.min(hx, hx + sx), 3, Math.min(hz, hz + sz), Math.max(hx, hx + sx), 4, Math.max(hz, hz + sz), 0x1a1d24);
      body.set(hx, 2, hz, red, true).set(hx + sx, 4, hz + sz, 0x8a92a4);
    }
    // big glowing camera eye
    for (let x = -3; x <= 2; x++) for (let y = 0; y <= 4; y++) {
      const d = Math.hypot(x + 0.5, y - 2);
      if (d > 2.7) continue;
      body.set(x, y, 4, d > 1.9 ? 0x15121f : d > 1.2 ? 0xff2a2a : 0xffb0a0, d <= 1.9);
      if (d > 1.9) body.set(x, y, 5, 0x3a3f4e);
    }
    body.set(-2, 3, 5, 0xffffff, true);
    body.box(-1, 1, 5, 0, 2, 5, 0x5a0a10); // pupil
    // antenna with blinking light
    body.box(1, 6, -3, 1, 7, -3, 0x8a92a4).set(1, 8, -3, red, true);
    // fang jaw hanging under the front
    // body rounding
    for (const x of [-3, 2]) for (const z of [-4, 3]) body.del(x, 0, z).del(x, 4, z);
    const jaw = G();
    jaw.box(-3, -1, 0, 2, -1, 7, 0x2a2f3a);
    jaw.box(-2, -1, 2, 1, -1, 6, 0x5a0a10);
    for (const x of [-2, 1]) jaw.box(x, -3, 7, x, -2, 7, C.tooth).set(x, -4, 7, 0xe8e8f0).set(x, -2, 6, C.tooth);
    for (const x of [-3, -1, 0, 2]) jaw.set(x, -2, 7, C.tooth);
    for (const x of [-3, 2]) jaw.set(x, -2, 5, C.tooth);
    // dangling grabber claws
    for (const x of [-3, 2]) jaw.box(x, -3, 1, x, -2, 1, 0x5d6476).set(x, -4, 2, 0x8a92a4);
    const prop = () => {
      const g = G();
      g.box(-3, 0, 0, 3, 0, 0, 0xd8dde8).box(0, 0, -3, 0, 0, 3, 0xd8dde8);
      for (const [x, z] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) g.set(x, 0, z, red);
      g.set(0, 1, 0, 0x8a92a4);
      return g;
    };
    return {
      gait: 'float',
      parts: [
        { name: 'body', grid: body, at: [0, 4, 0] },
        { name: 'jaw', grid: jaw, at: [0, 0, -4], parent: 'body' },
        { name: 'prop1', grid: prop(), at: [-5.5, 9, -5.5], pivot: [0.5, 0, 0.5] },
        { name: 'prop2', grid: prop(), at: [5.5, 9, -5.5], pivot: [0.5, 0, 0.5] },
        { name: 'prop3', grid: prop(), at: [-5.5, 9, 5.5], pivot: [0.5, 0, 0.5] },
        { name: 'prop4', grid: prop(), at: [5.5, 9, 5.5], pivot: [0.5, 0, 0.5] },
      ],
      muzzle: [0, 5, 7],
    };
  },

  circuitShark() {
    const pcb = (x, y, z) => (noise(x, y, z) < 0.2 ? 0x176030 : 0x1f7a3a), belly = mot(0xbfe8c8, 0xa8dcb4, 0.3);
    const gold = 0xffcc33;
    const body = G();
    for (let z = -9; z <= 9; z++) {
      const t = (z + 0.5) / 9.5;
      const w = 3.6 * Math.sqrt(Math.max(0, 1 - t * t * (t > 0 ? 0.8 : 1))) + 0.4;
      const h = 3.2 * Math.sqrt(Math.max(0, 1 - t * t * (t > 0 ? 0.7 : 1))) + 0.4;
      for (let x = -5; x <= 4; x++) for (let y = -1; y <= 7; y++) {
        const dx = (x + 0.5) / w, dy = (y - 3) / h;
        if (dx * dx + dy * dy <= 1) body.set(x, y, z, y <= 1 ? belly : pcb);
      }
    }
    // gold traces with right-angle turns + vias (glowing)
    const trace = (pts, side) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [y0, z0] = pts[i], [y1, z1] = pts[i + 1];
        for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
          for (let x = side < 0 ? -6 : 5; side < 0 ? x <= 0 : x >= -1; x -= side) if (body.has(x, y, z)) { body.set(x, y, z, gold, true); break; }
        }
      }
    };
    for (const s of [-1, 1]) {
      trace([[4, -7], [4, -2], [5, -2], [5, 3]], s);
      trace([[2, -6], [2, 0], [3, 0], [3, 4]], s);
      trace([[5, -5], [6, -5]], s);
    }
    // IC chips on the flanks
    for (const s of [-1, 1]) {
      const x = s < 0 ? -5 : 4;
      body.box(x, 3, -5, x, 4, -3, 0x15121f);
      for (const z of [-5, -3]) body.set(x, 5, z, 0xc8d0dc).set(x, 2, z, 0xc8d0dc);
    }
    // gills
    for (const z of [0, 1, 2]) for (const s of [-1, 1]) body.box(s < 0 ? -5 : 4, 2, z * 1, s < 0 ? -5 : 4, 4, z * 1, z === 1 ? pcb : 0x0a2a14);
    // red LED eyes on the sides of the head
    for (const s of [-1, 1]) { const x = s < 0 ? -4 : 3; body.box(x, 5, 4, x, 5, 5, 0xff2a2a, true).set(x + s, 5, 5, 0xffb0a0, true).set(x, 6, 4, 0x0a2a14); }
    // mouth: carve and add upper teeth
    body.carve((x, y, z) => y <= 2 && z >= 2);
    body.box(-3, 2, 2, 2, 2, 7, 0x4a0c18);
    for (let z = 3; z <= 7; z += 1) for (const x of [-4, 3]) if (body.has(x, 3, z)) body.set(x, 2, z, (z & 1) ? C.tooth : null);
    for (let x = -3; x <= 2; x++) if (body.has(x, 3, 8)) body.set(x, 2, 8, (x & 1) ? C.tooth : null);
    // dorsal fin
    for (let i = 0; i < 4; i++) body.box(-1, 7 + i, -3 - i, 0, 7 + i, i < 3 ? 0 - i : -3, pcb);
    body.box(-1, 8, -2, 0, 8, -1, gold, true).set(-1, 9, -4, gold, true).set(0, 9, -4, gold, true);
    const jaw = G();
    for (let z = 0; z <= 6; z++) {
      const hw = z < 5 ? 3 : z < 6 ? 2 : 1;
      jaw.box(-hw - 1, -2, z, hw, -1, z, belly);
    }
    jaw.box(-3, -1, 0, 2, -1, 5, 0x7a1a2a);
    for (let z = 1; z <= 5; z++) for (const x of [-4, 3]) jaw.set(x, 0, z, (z & 1) ? null : C.tooth);
    for (let x = -2; x <= 1; x++) jaw.set(x, 0, 6, (x & 1) ? null : C.tooth);
    const tail = G();
    tail.box(-1, 2, -3, 0, 4, -1, pcb);
    tail.box(-1, 3, -6, 0, 3, -4, pcb);
    for (let i = 0; i < 4; i++) { tail.box(-1, 4 + i, -6 - i, 0, 4 + i, -5 - i, pcb); }
    for (let i = 0; i < 3; i++) { tail.box(-1, 2 - i, -6 - i, 0, 2 - i, -5 - i, pcb); }
    tail.set(-1, 7, -9, gold, true).set(0, 7, -9, gold, true);
    const leg = () => {
      const g = G();
      g.box(-1, -2, -1, 0, -1, 0, 0x5d6476);
      g.box(-1, -3, -1, 0, -3, 0, 0xffcc33);
      g.box(-1, -5, 0, 0, -4, 0, 0x8a92a4);
      g.box(-1, -5, 1, 0, -5, 1, 0x3a3f4e).box(-2, -5, 0, 1, -5, 0, 0x3a3f4e);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        ...quadLegs(leg, leg, { xl: -3, xr: 3, y: 5, fz: 3, bz: -5 }),
        { name: 'body', grid: body, at: [0, 5, 0] },
        { name: 'jaw', grid: jaw, at: [0, 2, 2], parent: 'body' },
        { name: 'tail', grid: tail, at: [0, 5, -8] },
      ],
      muzzle: [0, 7, 14],
    };
  },

  megaTechMech() {
    const navy = mot(0x24305e, 0x1c264c, 0.25), navyL = 0x34447a, orange = 0xff7a1a, white = 0xf0f2f6, joint = 0x5d6476;
    const body = G();
    body.box(-5, 0, -3, 4, 6, 3, navy);
    body.box(-4, 1, 4, 3, 2, 4, white); // chest plate
    body.box(-5, 0, -3, 4, 0, 3, joint);
    body.box(-5, 3, 4, -5, 6, 4, orange).box(4, 3, 4, 4, 6, 4, orange);
    // cockpit window
    body.box(-3, 3, 4, 2, 6, 4, 0x1a2a40);
    body.box(-2, 4, 5, 1, 6, 5, 0x5ce1e6, true);
    body.set(-2, 6, 5, 0xd8ffff, true).set(-1, 6, 5, 0xb8ffff, true);
    body.box(-1, 4, 5, 0, 5, 5, 0x2aa8c0, true); // pilot silhouette
    body.box(-3, 7, 4, 2, 7, 4, white);
    body.box(-4, 7, -3, 3, 7, 3, navyL);
    // orange hazard stripes on the flanks
    for (let z = -3; z <= 3; z++) { body.set(-6, 2, z, (z & 1) ? orange : C.ink); body.set(5, 2, z, (z & 1) ? C.ink : orange); }
    body.box(-6, 4, -2, -6, 6, 1, white).box(5, 4, -2, 5, 6, 1, white);
    body.set(-6, 5, -1, C.ink).set(-6, 5, 0, C.ink).set(5, 5, -1, C.ink).set(5, 5, 0, C.ink); // unit number
    // exhaust vents on the back
    body.box(-3, 2, -4, -2, 5, -4, joint).box(1, 2, -4, 2, 5, -4, joint).set(-3, 6, -4, 0xff8a2a, true).set(2, 6, -4, 0xff8a2a, true);
    // small sensor head
    const head = G();
    head.box(-2, 0, -2, 1, 2, 2, navyL);
    head.box(-2, 1, 3, 1, 1, 3, 0xff3a3a, true);
    head.box(-2, 2, 3, 1, 2, 3, white);
    const ant = G();
    ant.box(0, 0, 0, 0, 1, 0, joint).set(0, 2, 0, orange, true).set(-1, 1, 0, joint);
    // shoulder missile pods (cannon)
    const pods = G();
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -9 : 5;
      pods.box(x0, 0, -3, x0 + 3, 3, 3, navyL);
      pods.box(x0, 0, -3, x0 + 3, 0, 3, white);
      for (let x = x0; x <= x0 + 3; x++) for (let y = 1; y <= 3; y++) pods.set(x, y, 4, (x + y) % 2 ? C.red : white);
      pods.set(s < 0 ? x0 : x0 + 3, 2, 0, orange).set(s < 0 ? x0 : x0 + 3, 2, 1, orange);
    }
    const armG = (s) => {
      const g = G();
      g.box(-2, -1, -2, 1, 1, 1, joint); // shoulder joint
      g.box(-1, -5, -1, 0, -2, 0, navy);
      g.box(-2, -8, -2, 1, -6, 1, white);
      g.box(-2, -8, 2, 1, -6, 2, orange);
      g.box(-2, -10, -2, 1, -9, 1, joint);
      g.set(-2, -10, 2, 0x8a92a4).set(1, -10, 2, 0x8a92a4);
      return g;
    };
    const legG = () => {
      const g = G();
      g.box(-2, -3, -1, 1, -1, 1, navy);
      g.box(-2, -4, -1, 1, -4, 2, orange); // knee
      g.box(-1, -5, -1, 0, -5, 0, joint);
      g.box(-3, -6, -2, 2, -6, 3, white).box(-3, -6, 4, 2, -6, 4, joint);
      g.box(-2, -5, 1, 1, -5, 2, white).set(-3, -5, 0, orange).set(2, -5, 0, orange);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: legG(), at: [-3, 6, 0] },
        { name: 'legR', grid: legG(), at: [3, 6, 0] },
        { name: 'body', grid: body, at: [0, 6, 0] },
        { name: 'head', grid: head, at: [0, 14, -1] },
        { name: 'antenna', grid: ant, at: [1, 17, -2] },
        { name: 'cannon', grid: pods, at: [0, 12, -1] },
        { name: 'armL', grid: armG(-1), at: [-7, 11, 0] },
        { name: 'armR', grid: armG(1), at: [7, 11, 0] },
      ],
      muzzle: [6, 14, 5],
    };
  },

  // ======================================================== Atomic Series
  atomicSlime() { return slime({ mini: false }); },
  miniSlime() { return slime({ mini: true }); },

  plutoniumPup() {
    const fur = mot(0xf0e0c0, 0xe4d2ac, 0.3), furD = 0xd0b890, ear = 0x8a5a3a, glow1 = 0x7cff3a, glow2 = 0xb8ff6a;
    const spots = (g, list) => { for (const [x, y, z, r] of list) for (let dx = 0; dx < r; dx++) for (let dy = 0; dy < r; dy++) if (g.has(x + dx, y + dy, z)) g.set(x + dx, y + dy, z, (dx + dy) % 2 ? glow2 : glow1, true); };
    const body = G();
    body.box(-3, 0, -5, 2, 4, 3, fur);
    for (const x of [-3, 2]) for (const z of [-5, 3]) body.del(x, 4, z).del(x, 0, z);
    body.box(-2, 0, -4, 1, 0, 2, 0xfff4e0);
    spots(body, [[-3, 2, -3, 2], [-3, 1, 1, 2], [2, 2, -1, 2], [2, 1, -4, 2]]);
    for (const [x, z] of [[-2, -3], [0, 0], [-1, 2], [1, -4]]) body.set(x, 4, z, glow1, true);
    // radiation hazard collar + trefoil tag
    for (let x = -4; x <= 3; x++) for (let y = 1; y <= 5; y++) {
      if (x > -4 && x < 3 && y > 1 && y < 5) continue;
      body.set(x, y, 4, (x + y + 20) % 2 ? 0xffd23f : 0x1a1a1a);
    }
    body.box(-3, 2, 4, 2, 4, 4, fur);
    body.box(-1, -1, 5, 0, 1, 5, 0xffd23f).set(-1, 0, 6, C.ink).set(0, 0, 6, 0xffd23f).set(-1, 1, 6, 0xffd23f).set(0, 1, 6, C.ink).set(-1, -1, 6, C.ink).set(0, -1, 6, C.ink);
    const head = G();
    head.box(-4, -3, 0, 3, 3, 6, fur);
    for (const x of [-4, 3]) { head.del(x, 3, 0).del(x, 3, 6).del(x, -3, 6).del(x, -3, 0); }
    head.box(-2, -3, 7, 1, -1, 9, 0xfff4e0); // snout
    head.box(-1, -1, 10, 0, -1, 10, C.ink).set(-1, -1, 9, C.ink).set(0, -1, 9, C.ink); // nose
    head.set(-1, -1, 11, 0x3a3a50);
    head.box(-2, -3, 10, 1, -3, 10, 0x3a1a1a); // mouth
    // big puppy eyes
    bigEyes(head, 1, 0, 7, { w: 3, h: 3, pupil: 0x15121f, glintC: 0xd8ffb0 });
    head.set(-3, 0, 7, 0x2a5a1a).set(2, 0, 7, 0x2a5a1a);
    // eyebrow spots + forehead glow spot
    head.box(-1, 3, 7, 0, 3, 7, glow1, true).set(-1, 4, 6, glow2, true);
    spots(head, [[-4, 0, 2, 2], [3, -2, 4, 2]]);
    // floppy ears
    for (const s of [-1, 1]) {
      const x = s < 0 ? -5 : 4;
      head.box(x, -2, 1, x, 3, 3, ear).box(x - s, -3, 1, x - s, -2, 3, ear);
      head.set(x, 2, 2, glow1, true);
    }
    // tongue (jaw)
    const jaw = G();
    jaw.box(-1, -1, 0, 0, -1, 1, C.tongue).set(-1, -2, 1, C.tongue).set(0, -2, 1, 0xff4a6a);
    const tail = G();
    tail.box(-1, 0, -2, 0, 1, -1, fur).box(-1, 2, -3, 0, 3, -3, fur).set(-1, 4, -3, glow1, true).set(0, 4, -3, glow2, true);
    const leg = () => quadLeg({ w: 2, h: 3, color: fur, paw: 0xfff4e0, toe: true });
    return {
      gait: 'walk',
      parts: [
        ...quadLegs(leg, leg, { xl: -2, xr: 2, y: 3, fz: 2, bz: -4 }),
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 9, 4] },
        { name: 'jaw', grid: jaw, at: [0, -3, 10], parent: 'head' },
        { name: 'tail', grid: tail, at: [0, 6, -5] },
      ],
      muzzle: [0, 7, 14],
    };
  },

  reactorRex() {
    const sc = (x, y, z) => ((x + y * 2 + z + 60) % 5 === 0 ? 0x27967a : noise(x, y, z) < 0.2 ? 0x2ba082 : 0x32b490);
    const scD = 0x1f7a6a, belly = mot(0xc8f4d0, 0xb0e8bc, 0.3), spike = 0x7cff3a;
    const body = G();
    body.ellipsoid(-0.5, 4, -1, 4, 3.6, 5.5, sc);
    body.box(-3, 1, 2, 2, 5, 4, belly);
    body.ellipsoid(-0.5, 6, 3.5, 3, 3, 2.5, sc); // shoulders / neck base
    body.ellipsoid(-0.5, 8, 5, 2.6, 2.6, 2.4, sc); // neck
    body.ellipsoid(-0.5, 9.5, 7.5, 2.4, 2.4, 2.2, sc);
    body.carve((x, y, z) => y < 0);
    // reactor core in the chest
    for (let x = -4; x <= 3; x++) for (let y = 1; y <= 8; y++) {
      const d = Math.hypot(x + 0.5, y - 4.5);
      if (d > 3.3) continue;
      body.set(x, y, 6, d > 2.3 ? 0x8a92a4 : d > 1.2 ? 0x7cff3a : 0xeaffd0, d <= 2.3);
      if (d > 2.3) body.set(x, y, 7, (x + y) % 3 === 0 ? 0xc8d0dc : 0x6b7386);
      else body.set(x, y, 5, 0x3ad85a, true);
    }
    body.box(-4, 4, 3, -4, 5, 4, 0x6b7386).box(3, 4, 3, 3, 5, 4, 0x6b7386); // coolant pipes
    body.set(-5, 5, 2, 0x7cff3a, true).set(4, 5, 2, 0x7cff3a, true);
    // glowing back plates
    for (let z = -5; z <= 4; z += 2) {
      const h = z > 2 ? 1 : 2;
      for (let i = 0; i < h; i++) { body.set(-1, 8 + i, z, i === h - 1 ? spike : 0x3ad85a, i === h - 1); body.set(0, 8 + i, z, i === h - 1 ? spike : 0x3ad85a, i === h - 1); }
    }
    // glowing scars on flanks
    for (const s of [-1, 1]) { const x = s < 0 ? -5 : 4; body.set(x, 5, -2, spike, true).set(x, 4, -1, spike, true).set(x, 5, 0, spike, true); }
    const head = G();
    head.box(-3, 0, 0, 2, 5, 8, sc);
    head.box(-3, 0, 0, 2, 1, 8, belly);
    head.carve((x, y, z) => y === 5 && z >= 6 && (x === -3 || x === 2));
    head.box(-4, 3, 4, -4, 4, 6, scD).box(3, 3, 4, 3, 4, 6, scD); // cheek ridges
    // brow ridges + glowing eyes on the sides/front
    for (const s of [-1, 1]) {
      const x = s < 0 ? -4 : 3;
      head.box(x, 3, 5, x, 4, 6, 0xffe14a, true);
      head.set(x, 3, 6, 0x1a1a1a).set(x, 4, 6, 0x1a1a1a);
      head.box(x, 5, 4, x, 5, 7, scD).set(x + s, 5, 5, scD);
    }
    head.box(-3, 3, 9, -3, 3, 9, scD).box(2, 3, 9, 2, 3, 9, scD); // nostrils
    head.box(-2, 4, 9, 1, 5, 9, sc);
    head.box(-1, 6, 2, 0, 6, 5, spike, true);
    // upper teeth
    for (let z = 2; z <= 8; z++) for (const x of [-3, 2]) if (z % 2 === 0) head.set(x, -1, z, C.tooth);
    for (const x of [-2, 0, 1]) head.set(x, -1, 9, C.tooth);
    head.box(-2, 0, 9, 1, 0, 9, sc);
    head.box(-3, 2, 9, 2, 2, 9, sc);
    head.set(-2, 1, 9, sc).set(1, 1, 9, sc).set(-1, 1, 9, 0x4a0c18).set(0, 1, 9, 0x4a0c18);
    const jaw = G();
    jaw.box(-3, -3, 0, 2, -2, 7, belly);
    jaw.box(-2, -2, 0, 1, -2, 6, 0x7a1a2a);
    for (let z = 0; z <= 6; z++) for (const x of [-3, 2]) if (z % 2 === 0) jaw.set(x, -1, z, C.tooth);
    jaw.set(-1, -1, 7, C.tooth).set(0, -1, 7, C.tooth);
    const tail = G();
    for (let i = 0; i < 11; i++) {
      const r = Math.max(0.6, 2.6 - i * 0.22);
      tail.ellipsoid(-0.5, 2 - i * 0.15, -i, r, r * 0.9, 0.6, sc);
      if (i % 2 === 0 && i < 10) tail.set(-1, Math.round(2 - i * 0.15 + r) + 1, -i, spike, true).set(0, Math.round(2 - i * 0.15 + r) + 1, -i, spike, true);
    }
    const legG = () => {
      const g = G();
      g.box(-2, -3, -2, 1, 0, 2, sc);
      g.box(-1, -5, -1, 0, -4, 0, sc);
      g.box(-2, -6, -1, 1, -6, 2, scD);
      for (const x of [-2, 0, 1]) g.set(x, -6, 3, C.white);
      return g;
    };
    const armG = () => {
      const g = G();
      g.box(-1, -2, 0, 0, 0, 1, sc);
      g.set(-1, -2, 2, C.white).set(0, -2, 2, C.white);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: legG(), at: [-4, 6, -2] },
        { name: 'legR', grid: legG(), at: [4, 6, -2] },
        { name: 'body', grid: body, at: [0, 5, 0] },
        { name: 'head', grid: head, at: [0, 14, 8] },
        { name: 'jaw', grid: jaw, at: [0, 0, 1], parent: 'head' },
        { name: 'armL', grid: armG(), at: [-4, 10, 5] },
        { name: 'armR', grid: armG(), at: [4, 10, 5] },
        { name: 'tail', grid: tail, at: [0, 8, -6] },
      ],
      muzzle: [0, 15, 18],
    };
  },

  // ======================================================== Lab Hybrids
  blazeHybrid() {
    const rock = pal([0x3a1a1a, 0x4a1f1a, 0x2a1414, 0x5a2418]);
    const crack = (g, fn) => glowWhere(g, fn, 0xff7a1a);
    const body = G();
    body.box(-3, 0, -2, 2, 3, 2, rock);
    body.box(-2, 0, 3, 1, 2, 3, 0xff8a1a, true).box(-1, 1, 3, 0, 1, 3, 0xffe14a, true); // molten belly
    crack(body, (x, y, z) => (x === -3 || x === 2) && (y + z + 9) % 4 === 0);
    const head = G();
    head.box(-4, 0, -3, 3, 5, 3, rock);
    for (const x of [-4, 3]) for (const z of [-3, 3]) head.del(x, 5, z).del(x, 0, z);
    crack(head, (x, y, z) => (x === -4 || x === 3) && (y * 2 + z + 20) % 5 === 0);
    crack(head, (x, y, z) => z === -3 && (x + y + 20) % 4 === 0);
    // face
    for (const [x0, s] of [[-3, -1], [1, 1]]) {
      head.box(x0, 3, 4, x0 + 1, 4, 4, 0xffe14a, true);
      head.set(s < 0 ? x0 + 1 : x0, 3, 4, 0xff5a1a, true);
      head.set(s < 0 ? x0 : x0 + 1, 5, 4, 0x1a0a0a).set(s < 0 ? x0 + 1 : x0, 5, 4, 0x1a0a0a).set(s < 0 ? x0 + 2 : x0 - 1, 4, 4, 0x1a0a0a);
    }
    head.box(-3, 1, 4, 2, 2, 4, 0xff6a1a, true);
    for (let x = -3; x <= 2; x++) head.set(x, (x & 1) ? 2 : 1, 4, 0xfff0c0);
    head.box(-4, 1, 4, -4, 2, 4, 0x2a1414).box(3, 1, 4, 3, 2, 4, 0x2a1414);
    // pointed ears + horns
    for (const s of [-1, 1]) {
      const x = s < 0 ? -5 : 4;
      head.box(x, 2, -1, x, 3, 1, rock).set(x + s, 3, -1, rock).set(x + s, 4, -2, 0x2a1414);
      const hx = s < 0 ? -3 : 2;
      head.set(hx, 6, 0, 0x1a0a0a).set(hx + s, 7, -1, 0x1a0a0a);
    }
    // flame hair
    for (const [x, z, h] of [[-3, -1, 3], [-2, 1, 4], [-1, -1, 5], [0, 1, 5], [1, -1, 4], [2, 1, 3], [-1, 2, 3], [0, -2, 4], [-2, -2, 3], [1, -2, 3]]) {
      for (let i = 0; i < h; i++) head.set(x, 6 + i, z - (i >> 1), i >= h - 1 ? 0xfff6a0 : i >= h - 2 ? 0xffd23f : i >= h - 3 ? 0xffa21a : 0xff5a1a, true);
    }
    const ember = 0xff5a1a;
    const armG = () => {
      const g = G();
      g.box(-1, -2, -1, 0, 0, 0, rock);
      g.box(-1, -4, -1, 0, -3, 1, 0xff8a1a, true).set(-1, -3, 1, 0xffd23f, true).set(0, -4, 1, 0xffe14a, true);
      g.set(-1, -5, 0, 0xffd23f, true).set(0, -5, 1, 0xfff6a0, true);
      return g;
    };
    const tail = G();
    tail.box(-1, 0, -1, 0, 0, -2, rock).box(-1, 1, -3, 0, 1, -3, rock);
    tail.box(-1, 2, -4, 0, 2, -4, ember, true);
    for (let i = 0; i < 4; i++) tail.set(-1 + (i & 1), 3 + i, -4 - (i >> 1), i >= 3 ? 0xfff6a0 : i >= 2 ? 0xffd23f : 0xffa21a, true);
    tail.set(-1, 3, -5, 0xff7a1a, true).set(0, 4, -3, 0xffa21a, true);
    const leg = () => {
      const g = G();
      g.box(-1, -2, -1, 0, -1, 0, rock);
      g.box(-1, -2, 1, 0, -2, 1, 0x1a0a0a);
      g.set(-1, -1, 0, 0xff7a1a, true);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 2, 0] },
        { name: 'legR', grid: leg(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'head', grid: head, at: [0, 6, 0] },
        { name: 'armL', grid: armG(), at: [-4, 5, 0] },
        { name: 'armR', grid: armG(), at: [4, 5, 0] },
        { name: 'tail', grid: tail, at: [0, 3, -2] },
      ],
      muzzle: [4, 4, 4],
    };
  },

  frostHybrid() {
    const fur = pal([0xf2faff, 0xe2f2fc, 0xd2eaf8, 0xeaf6ff]), skin = 0x6a9ac0, skinD = 0x4a7aa8;
    const ice = 0x9fe8ff, iceW = 0xe8ffff;
    const icicle = (g, x, y, z, dx, dy, dz, n) => {
      for (let i = 0; i < n; i++) g.set(x + dx * i, y + dy * i, z + dz * i, i === n - 1 ? iceW : ice, i === n - 1);
    };
    const body = G();
    body.ellipsoid(-0.5, 4, 0, 4.6, 4.4, 3.6, fur);
    body.carve((x, y) => y < 0);
    // shaggy fur tufts
    for (const [x, y, z] of [[-5, 2, 0], [4, 2, 1], [-5, 5, -1], [4, 5, 0], [-2, 0, 4], [1, 0, 4], [-3, 7, -3], [2, 7, -3]]) body.set(x, y, z, 0xd2eaf8);
    body.box(-2, 2, 4, 1, 5, 4, mot(0xd8eef8, 0xc4e4f4)); // chest
    // icicle spikes on shoulders and back
    icicle(body, -4, 7, 0, 0, 1, 0, 3); icicle(body, 3, 7, 0, 0, 1, 0, 3);
    icicle(body, -3, 8, -1, 0, 1, -1, 2); icicle(body, 2, 8, -1, 0, 1, -1, 2);
    for (const [x, y] of [[-2, 6], [1, 6], [-1, 3], [0, 4]]) icicle(body, x, y, -4, 0, 1, -1, 2);
    const head = G();
    head.box(-4, 0, -1, 3, 5, 3, fur);
    head.box(-3, 0, 4, 2, 4, 4, 0x8ab8d8); // face
    head.box(-4, 5, 4, 3, 5, 5, 0xf2faff); // shaggy brow
    head.set(-4, 4, 4, 0xe2f2fc).set(3, 4, 4, 0xe2f2fc).set(-4, 4, 5, 0xe2f2fc).set(3, 4, 5, 0xe2f2fc);
    for (const [x0, s] of [[-3, -1], [1, 1]]) {
      head.box(x0, 3, 5, x0 + 1, 4, 5, 0x9ff6ff, true);
      head.set(s < 0 ? x0 + 1 : x0, 3, 5, 0x1a4a8a).set(s < 0 ? x0 : x0 + 1, 4, 5, 0xe8ffff, true);
      head.set(s < 0 ? x0 + 1 : x0, 4, 5, 0xf2faff); // angry fur brow dip
    }
    head.box(-2, 0, 5, 1, 1, 5, 0x1a2a4a);
    head.set(-2, 1, 5, C.tooth).set(1, 1, 5, C.tooth).set(-1, 0, 5, C.tooth).set(0, 0, 5, C.tooth);
    head.set(-2, 0, 6, C.tooth).set(1, 0, 6, C.tooth); // tusks
    head.set(-1, 2, 5, 0x5a88b0).set(0, 2, 5, 0x5a88b0); // nose
    // icy horns
    for (const s of [-1, 1]) { const x = s < 0 ? -4 : 3; head.set(x, 6, 1, ice).set(x + s, 6, 0, ice).set(x + s, 7, 0, iceW, true); }
    const armG = (s) => {
      const g = G();
      g.box(-1, -4, -1, 0, 0, 1, fur);
      g.box(-2, -6, -1, 1, -5, 2, fur);
      g.box(-2, -8, -1, 1, -7, 2, skin);
      g.box(-2, -8, 3, 1, -8, 3, skinD);
      for (const x of [-2, 0, 1]) g.set(x, -9, 3, C.white);
      icicle(g, s < 0 ? -3 : 2, -5, 0, s, 1, -1, 2);
      icicle(g, s < 0 ? -2 : 1, -3, 0, s, 1, 0, 2);
      return g;
    };
    const leg = () => {
      const g = G();
      g.box(-1, -3, -1, 1, -1, 1, fur);
      g.box(-2, -3, -1, 1, -3, 3, skin);
      for (const x of [-2, 0, 1]) g.set(x, -3, 4, C.white);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 3, 0] },
        { name: 'legR', grid: leg(), at: [2, 3, 0] },
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 10, 1] },
        { name: 'armL', grid: armG(-1), at: [-5, 10, 0] },
        { name: 'armR', grid: armG(1), at: [5, 10, 0] },
      ],
      muzzle: [0, 10, 7],
    };
  },

  stoneHybrid() {
    const rock = pal([0x7a7f88, 0x8f949c, 0x6b7078, 0x848990]);
    const moss = [0x4f8a2a, 0x6aa83a, 0x5a9a30];
    const mossify = (g, p = 0.55) => {
      const tops = [];
      g.forEach((x, y, z, c, gl) => { if (!gl && !g.has(x, y + 1, z) && noise(x + 4, y, z * 3) < p && y > 3) tops.push([x, y, z]); });
      for (const [x, y, z] of tops) {
        g.set(x, y, z, moss[(x + z + 30) % 3]);
        if (!g.has(x, y - 1, z + 1) && noise(x, y, z) < 0.35) g.set(x, y - 1, z + 1, moss[1]);
      }
    };
    const crackFront = (g, pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
        for (let k = 0; k <= n; k++) {
          const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
          for (let z = 12; z >= -12; z--) if (g.has(x, y, z)) { g.set(x, y, z, k % 2 ? 0xff8a1a : 0xffb02a, true); break; }
        }
      }
    };
    const crackSide = (g, s, pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
        const n = Math.max(Math.abs(z1 - z0), Math.abs(y1 - y0));
        for (let k = 0; k <= n; k++) {
          const z = Math.round(z0 + (z1 - z0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
          for (let i2 = 0; i2 < 14; i2++) { const x = s < 0 ? -12 + i2 : 11 - i2; if (g.has(x, y, z)) { g.set(x, y, z, 0xff8a1a, true); break; } }
        }
      }
    };
    const body = G();
    body.ellipsoid(-0.5, 4.5, 0, 5.2, 4.5, 3.8, rock);
    body.ellipsoid(-5, 7, 0, 2.6, 2.4, 2.6, rock);
    body.ellipsoid(4, 7, 0, 2.6, 2.4, 2.6, rock);
    body.ellipsoid(-0.5, 7, -2, 3.2, 2.6, 2.6, rock);
    body.carve((x, y) => y < 0);
    crackFront(body, [[-3, 7], [-2, 5], [-3, 3], [-1, 1]]);
    crackFront(body, [[2, 8], [1, 6], [2, 4]]);
    crackSide(body, -1, [[-2, 7], [0, 5], [-1, 3], [1, 1]]);
    crackSide(body, 1, [[2, 7], [0, 5], [1, 2]]);
    mossify(body);
    const head = G();
    head.box(-2, 0, -1, 1, 3, 3, rock);
    head.box(-3, 3, 2, 2, 3, 4, 0x5f646c); // heavy brow
    head.box(-2, 4, -1, 1, 4, 2, rock);
    head.set(-2, 2, 4, 0xffa21a, true).set(1, 2, 4, 0xffa21a, true).set(-2, 2, 3, 0xff6a1a, true).set(1, 2, 3, 0xff6a1a, true);
    head.box(-1, 0, 4, 0, 0, 4, 0xff6a1a, true).set(-2, 1, 4, 0x5f646c).set(1, 1, 4, 0x5f646c);
    mossify(head, 0.8);
    const armG = (s) => {
      const g = G();
      g.ellipsoid(-0.5, -2, 0, 2, 2.2, 2, rock);
      g.ellipsoid(-0.5, -5, 0.5, 2.3, 2, 2.3, rock);
      g.ellipsoid(-0.5, -7.5, 1, 2.8, 2.4, 2.8, rock);
      g.carve((x, y) => y < -9);
      crackFront(g, [[-2, -7], [0, -8], [1, -6]]);
      glowWhere(g, (x, y, z) => y === -9 && noise(x, y, z) < 0.3, 0xff8a1a);
      mossify(g, 0.4);
      return g;
    };
    const leg = () => {
      const g = G();
      g.box(-2, -3, -2, 1, -1, 1, rock);
      g.box(-2, -3, 2, 1, -3, 2, 0x5f646c);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 3, 0] },
        { name: 'legR', grid: leg(), at: [2, 3, 0] },
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 10, 1] },
        { name: 'armL', grid: armG(-1), at: [-7, 11, 0] },
        { name: 'armR', grid: armG(1), at: [7, 11, 0] },
      ],
      muzzle: [0, 8, 6],
    };
  },

  // ======================================================== Food Fighters
  fryFiend() {
    const red = (x, y, z) => (noise(x, y, z) < 0.12 ? 0xc81e22 : 0xe02a2a), redD = 0xa81a1e;
    const fryC = [0xffd23f, 0xffe066, 0xf0c030, 0xffda50];
    const body = G();
    for (let y = 0; y <= 7; y++) {
      const hx = 3 + y * 0.28, hz = 2.2 + y * 0.12;
      for (let x = -6; x <= 5; x++) for (let z = -4; z <= 4; z++) {
        if (Math.abs(x + 0.5) > hx || Math.abs(z + 0.5) > hz) continue;
        const wall = Math.abs(x + 0.5) > hx - 1 || Math.abs(z + 0.5) > hz - 1;
        if (y === 0 || wall) body.set(x, y, z, red);
      }
    }
    // scalloped front/back top edges
    body.carve((x, y, z) => y >= 6 && Math.abs(z + 0.5) > 2 && Math.abs(x + 0.5) < 3.5 - (y - 6) * 1.5);
    body.paint((x, y, z, c) => (y === 0 ? redD : undefined));
    // white stripe band + yellow star sticker
    body.paint((x, y, z, c) => (y === 1 ? 0xf7f7f2 : undefined));
    // fries
    const fries = [[-3, -1, 10], [-2, 0, 12], [-1, -1, 11], [0, 1, 12], [1, -1, 10], [2, 0, 11], [-3, 1, 9], [3, -1, 9], [-1, 1, 13], [1, 1, 10], [0, -2, 11], [-2, -2, 10], [2, -2, 9], [-4, 0, 8], [4, 0, 8]];
    for (const [x, z, h] of fries) {
      const c = fryC[(x * 7 + z * 3 + 50) % fryC.length];
      for (let y = 2; y <= h; y++) body.set(x, y, z, c);
      body.set(x, h, z, 0xd89a20);
    }
    body.set(-4, 9, 1, 0xffe066).set(-5, 10, 1, 0xffe066).set(3, 10, -2, 0xf0c030).set(4, 11, -2, 0xd89a20); // leaning fries
    // face on the carton front
    const fz = 3;
    bigEye(body, -4, 3, fz, { w: 2, h: 3, side: 'L', brow: C.ink, angry: true });
    bigEye(body, 2, 3, fz, { w: 2, h: 3, side: 'R', brow: C.ink, angry: true });
    body.box(-2, 2, fz, 1, 3, fz, 0x3a0a10);
    body.set(-2, 3, fz, C.tooth).set(1, 3, fz, C.tooth).set(-1, 2, fz, C.tongue).set(0, 2, fz, C.tongue);
    body.set(-3, 2, fz, C.ink).set(2, 2, fz, C.ink);
    // ketchup splat
    body.box(3, 4, -1, 3, 5, 0, 0xc80a14).set(3, 3, 0, 0xc80a14);
    const armG = () => {
      const g = G();
      g.box(0, -3, 0, 0, 0, 0, 0xffd23f).set(0, -3, 1, 0xffd23f);
      g.box(-1, -5, 0, 1, -4, 1, 0xf7f7f2);
      return g;
    };
    const foot = () => { const g = G(); g.box(-1, -2, -1, 0, -1, 0, 0x8a1418).box(-1, -2, 1, 0, -2, 1, 0x6a0a10); return g; };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-2, 2, 0] },
        { name: 'legR', grid: foot(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'armL', grid: armG(), at: [-5, 8, 0], parent: 'body' },
        { name: 'armR', grid: armG(), at: [5, 8, 0], parent: 'body' },
      ],
      muzzle: [0, 12, 3],
    };
  },

  pizzaSlicer() {
    const cheese = (x, y, z) => (noise(x, y, z) < 0.2 ? 0xffe07a : noise(x + 3, y, z) < 0.15 ? 0xffb02a : 0xffc83a);
    const crust = (x, y, z) => (noise(x, y, z) < 0.25 ? 0xc0803a : noise(x, y + 2, z) < 0.12 ? 0x9a5a28 : 0xd89a4a);
    const hw = (y) => 0.6 + (y - 1) * 0.62;
    const head = G(); // the whole slice (lunges on attack)
    for (let y = 1; y <= 9; y++) for (let x = -7; x <= 6; x++) {
      if (Math.abs(x + 0.5) > hw(y)) continue;
      head.set(x, y, 0, 0xe8b870);
      head.set(x, y, 1, Math.abs(x + 0.5) > hw(y) - 1 ? 0xd8402a : cheese);
      head.set(x, y, 2, cheese);
    }
    // crust
    for (let x = -6; x <= 5; x++) for (let y = 10; y <= 11; y++) for (let z = 0; z <= 3; z++) {
      if ((x === -6 || x === 5) && (y === 11 || z === 3)) continue;
      if (y === 11 && z === 3) continue;
      head.set(x, y, z, crust);
    }
    // cheese drips
    for (const [x, y, n] of [[-5, 8, 2], [4, 7, 3], [-3, 4, 2], [2, 3, 2], [0, 1, 2]]) for (let i = 0; i < n; i++) fill(head, x, y - i, 3, 0xffd04a);
    // pepperoni
    const pep = (cx, cy) => {
      for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) if (Math.abs(x - cx) + Math.abs(y - cy) < 2 || (x === cx || y === cy)) head.set(x, y, 3, (x + y) % 3 === 0 ? 0x9a1a1a : 0xc8282a);
    };
    pep(-4, 8); pep(3, 8); pep(0, 9 - 6);
    // face
    bigEye(head, -3, 5, 3, { w: 2, h: 2, side: 'L', brow: 0x8a3a1a, angry: true });
    bigEye(head, 1, 5, 3, { w: 2, h: 2, side: 'R', brow: 0x8a3a1a, angry: true });
    head.box(-1, 3, 3, 0, 4, 3, 0x6a1a1a).set(-1, 4, 3, C.tooth).set(0, 3, 3, C.tongue);
    head.set(-2, 4, 3, 0x6a1a1a).set(1, 4, 3, 0x6a1a1a);
    // basil leaf
    head.set(2, 6, 3, 0x3a9a3a).set(3, 6, 3, 0x2a7a2a);
    const leg = () => {
      const g = G();
      g.box(-1, -3, -1, 0, -1, 0, 0xe8b870);
      g.box(-1, -3, 1, 0, -3, 1, 0xd8402a).box(-2, -3, -1, 0, -3, 0, 0xd8402a);
      return g;
    };
    const armL = arm({ len: 3, color: 0xe8b870, hand: 0xf7f7f2, handH: 2 });
    const armR = G();
    armR.box(-1, -3, -1, 0, 0, 0, 0xe8b870).box(-1, -5, -1, 0, -4, 0, 0xf7f7f2);
    armR.box(-1, -5, 1, 0, -5, 3, 0xe8343c); // cutter handle
    armR.box(-1, -4, 3, 0, -4, 4, 0xb8c0cc); // fork arm
    const mount = G();
    const wheel = G();
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      const d = Math.hypot(x, z);
      if (d > 2.6) continue;
      wheel.set(x, 0, z, d > 1.9 ? 0xeef2f8 : d > 0.9 ? 0xb8c0cc : 0xe8343c);
    }
    wheel.set(-2, 0, 0, 0x8a92a4).set(2, 0, 0, 0xffffff);
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 4, 0] },
        { name: 'legR', grid: leg(), at: [2, 4, 0] },
        { name: 'head', grid: head, at: [0, 3, 0] },
        { name: 'armL', grid: armL, at: [-6, 11, 1] },
        { name: 'armR', grid: armR, at: [6, 11, 1] },
        { name: 'cutterMount', grid: mount, at: [1, -4.5, 5.5], parent: 'armR', rot: [0, 0, Math.PI / 2] },
        { name: 'spin1', grid: wheel, at: [0, 0, 0], pivot: [0.5, 0.5, 0.5], parent: 'cutterMount' },
      ],
      muzzle: [6, 6, 6],
    };
  },

  donutDasher() {
    const R = 4.1, r = 2.05, cy = 6;
    const dough = mot(0xd89a5a, 0xc8843a, 0.3);
    const frost = (x, y, z) => (noise(x, y, z) < 0.15 ? 0xff8ac0 : 0xff6fb0);
    const sprinkles = [0xffffff, 0xffd23f, 0x29b6f6, 0x7cff3a, 0xb05cff, 0xff4a3a];
    const body = G();
    for (let x = -4; x <= 3; x++) for (let y = -6; y <= 6; y++) for (let z = -6; z <= 6; z++) {
      const px = x + 0.5, py = y, pz = z;
      const q = Math.hypot(py, pz) - R;
      if (q * q + px * px > (r + 0.35) * (r + 0.35)) continue;
      const side = Math.abs(px) > 0.9;
      body.set(x, y, z, side ? frost : dough);
    }
    // sprinkles on both frosted faces + frosting drips over the rim
    body.forEach((x, y, z, c) => {});
    const pts = [];
    body.forEach((x, y, z) => { if ((x === -3 || x === 2) && noise(x * 3, y, z) < 0.2) pts.push([x, y, z]); });
    for (const [x, y, z] of pts) body.set(x, y, z, sprinkles[Math.floor(noise(y, z, x) * sprinkles.length) % sprinkles.length]);
    for (let a = 0; a < 12; a++) {
      const ang = a / 12 * Math.PI * 2;
      const y = Math.round(Math.sin(ang) * (R + 1.2)), z = Math.round(Math.cos(ang) * (R + 1.2));
      if (a % 2 === 0) { if (body.has(-1, y, z)) body.set(-1, y, z, 0xff6fb0); if (body.has(0, y, z)) body.set(0, y, z, 0xff6fb0); }
    }
    // face plates (do not rotate)
    const head = G();
    for (const s of [-1, 1]) {
      const x = s < 0 ? -3 : 2;
      // eyes above the hole, mouth below, looking at the camera from the side
      for (const [z0, eyeS] of [[-3, 'a'], [1, 'b']]) {
        head.box(x, 2, z0, x, 4, z0 + 1, C.white);
        head.box(x, 2, eyeS === 'a' ? z0 + 1 : z0 + 1, x, 3, eyeS === 'a' ? z0 + 1 : z0 + 1, C.ink);
        head.set(x, 3, z0 + 1, 0xffffff, true);
        head.set(x, 2, z0 + 1, C.ink).set(x, 4, z0 + 1, C.white);
      }
      head.box(x, -4, -2, x, -3, 1, 0x5a1a2a);
      head.set(x, -3, -2, C.tooth).set(x, -3, 1, C.tooth).set(x, -4, -1, C.tongue).set(x, -4, 0, C.tongue);
      head.set(x, -2, -3, 0xff4f8a).set(x, -2, 2, 0xff4f8a); // cheeks
    }
    // front: eyes peeking over the rolling rim
    head.box(-3, 2, 7, -2, 3, 7, C.white).box(1, 2, 7, 2, 3, 7, C.white);
    head.set(-2, 2, 7, C.ink).set(1, 2, 7, C.ink).set(-3, 3, 7, 0xffffff, true).set(2, 3, 7, 0xffffff, true);
    head.box(-1, -1, 7, 0, -1, 7, 0x5a1a2a);
    return {
      gait: 'roll',
      parts: [
        { name: 'body', grid: body, at: [0, cy + 0.5, 0.5], pivot: [0, 0.5, 0.5] },
        { name: 'head', grid: head, at: [0, cy, 0] },
      ],
      muzzle: [0, 6, 7],
    };
  },

  burgerBrute() {
    const bun = (x, y, z) => (noise(x, y, z) < 0.2 ? 0xe0a050 : 0xd8902e), bunL = 0xf0c070;
    const patty = (x, y, z) => (noise(x, y, z) < 0.3 ? 0x4a2410 : noise(x + 1, y, z) < 0.2 ? 0x7a4220 : 0x5e3018);
    const body = G();
    body.cylinder(-0.5, -0.5, 0, 1, 5.2, bun, 'y');
    body.cylinder(-0.5, -0.5, 0, 0, 4.6, 0xc07a28, 'y');
    body.cylinder(-0.5, -0.5, 2, 4, 5.6, patty, 'y');
    // cheese slice with drooping corners
    body.box(-6, 5, -6, 5, 5, 5, 0xffc21a);
    for (const [x, z] of [[-6, -6], [5, -6], [-6, 5], [5, 5]]) { body.del(x, 5, z); }
    for (const [x, z, n] of [[-7, 0, 2], [6, -2, 3], [-1, 6, 3], [2, -7, 2], [-4, 6, 2]]) for (let i = 0; i < n; i++) body.set(x, 5 - i, z, 0xffb000);
    // lettuce ruffle
    for (let a = 0; a < 40; a++) {
      const ang = a / 40 * Math.PI * 2, rr = 6.2 + (a % 2) * 0.6;
      const x = Math.round(-0.5 + Math.cos(ang) * rr), z = Math.round(-0.5 + Math.sin(ang) * rr);
      body.set(x, 6, z, a % 3 ? 0x5ac83a : 0x3aa82a);
      if (a % 4 === 0) body.set(x, 5, z, 0x3aa82a);
    }
    body.cylinder(-0.5, -0.5, 6, 6, 5.4, 0x6ad84a, 'y');
    // tomato slices
    for (const [cx, cz] of [[-3, 2], [2, 1], [-1, -3]]) body.cylinder(cx, cz, 7, 7, 2.4, (x, y, z) => (Math.hypot(x - cx, z - cz) < 1.2 ? 0xff7a6a : 0xe02a2a), 'y');
    // monster mouth: teeth row under the top bun at the front + tongue
    for (let x = -4; x <= 3; x++) body.set(x, 7, 5, (x & 1) ? C.tooth : null);
    body.box(-2, 7, 4, 1, 7, 4, 0x4a0c18);
    body.box(-1, 6, 6, 0, 6, 7, C.tongue);
    // big fists
    const head = G(); // sesame top bun
    for (let y = 0; y <= 5; y++) {
      const rr = 5.6 * Math.sqrt(Math.max(0, 1 - (y / 6.2) ** 2)) + 0.2;
      head.cylinder(-0.5, -0.5, y, y, rr, bun, 'y');
    }
    head.paint((x, y, z) => (y === 0 ? bunL : undefined));
    // sesame seeds
    head.forEach(() => {});
    const seeds = [];
    head.forEach((x, y, z) => { if (!head.has(x, y + 1, z) && y >= 2 && noise(x * 2, y, z * 2) < 0.22) seeds.push([x, y, z]); });
    for (const [x, y, z] of seeds) head.set(x, y + 1, z, 0xfff4d0);
    // upper teeth along the bun's lip + eyes
    for (let x = -4; x <= 3; x++) head.set(x, -1, 5, (x & 1) ? null : C.tooth);
    for (const [x0, s] of [[-4, -1], [1, 1]]) {
      bigEye(head, x0, 1, 6, { w: 3, h: 3, side: s < 0 ? 'L' : 'R', brow: 0x7a4220, angry: true });
    }
    const armG = () => {
      const g = G();
      g.box(-1, -3, -1, 0, 0, 0, 0xd8902e);
      g.box(-2, -6, -2, 1, -4, 1, 0xe0a050);
      g.set(-2, -4, 2, 0xe0a050).set(1, -4, 2, 0xe0a050).set(-1, -5, 2, 0xe0a050).set(0, -5, 2, 0xe0a050);
      return g;
    };
    const leg = () => bipedLeg({ h: 3, color: 0xc07a28, foot: 0x8a4a1a, toe: 1, wide: true });
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 3, 0] },
        { name: 'legR', grid: leg(), at: [2, 3, 0] },
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 11, 0] },
        { name: 'armL', grid: armG(), at: [-7, 8, 0] },
        { name: 'armR', grid: armG(), at: [7, 8, 0] },
      ],
      muzzle: [0, 10, 7],
    };
  },

  sodaSurge() {
    const body = G();
    const canC = (x, y, z) => {
      if (y === 0 || y === 10) return 0xc8d0dc;
      if (y === 4 || y === 6) return 0xf7f7f2;
      if (y === 5) return 0x1d6ad8;
      const ang = Math.atan2(z + 0.5, x + 0.5);
      if (y === 8 && Math.sin(ang * 3) > 0.3) return 0xf7f7f2; // wave stripe
      return noise(x, y, z) < 0.12 ? 0xc81a24 : 0xe0222c;
    };
    body.cylinder(-0.5, -0.5, 0, 10, 3.6, canC, 'y');
    body.cylinder(-0.5, -0.5, 10, 10, 2.8, 0xb8c0cc, 'y'); // lid
    body.cylinder(-0.5, -0.5, 11, 11, 3.2, null, 'y');
    for (let x = -4; x <= 3; x++) for (let z = -4; z <= 3; z++) { const d = Math.hypot(x + 0.5, z + 0.5); if (d > 2.9 && d < 4.1) body.set(x, 11, z, 0xd8dee8); }
    body.box(-1, 10, 1, 0, 10, 2, 0x2a2a33); // opening
    // fizz bubbling out
    for (const [x, y, z, c] of [[-1, 11, 1, 0xffffff], [0, 11, 2, 0xd8f4ff], [-1, 12, 2, 0xffffff], [0, 12, 1, 0xbfe8ff], [-2, 12, 2, 0xd8f4ff], [1, 13, 2, 0xffffff], [-1, 13, 1, 0xe8fbff], [0, 14, 2, 0xffffff], [-2, 14, 1, 0xd8f4ff], [1, 15, 1, 0xffffff]]) body.set(x, y, z, c, c === 0xffffff);
    // face
    bigEye(body, -3, 6, 3, { w: 2, h: 3, side: 'L', brow: C.ink, angry: true });
    bigEye(body, 1, 6, 3, { w: 2, h: 3, side: 'R', brow: C.ink, angry: true });
    body.box(-2, 2, 3, 1, 3, 3, 0x3a0a10);
    body.set(-2, 3, 3, C.tooth).set(1, 3, 3, C.tooth).set(-1, 2, 3, 0x7fd8ff).set(0, 2, 3, 0x7fd8ff);
    body.set(-1, 1, 4, 0x7fd8ff).set(0, 0, 4, 0xbfe8ff); // fizzy drool
    // dent
    body.set(-4, 7, -1, 0xa8141c).set(-4, 6, -1, 0xa8141c);
    const tab = G();
    tab.box(-1, 0, 0, 0, 0, 0, 0xdfe6f0).box(-1, 0, -2, 0, 0, -1, 0xc8d0dc).set(-1, 1, -2, 0xc8d0dc).set(0, 1, -2, 0xc8d0dc);
    tab.del(-1, 0, -1);
    const armG = () => {
      const g = G();
      g.box(0, -3, 0, 0, 0, 0, 0xc8d0dc);
      g.box(-1, -5, -1, 1, -4, 1, 0xf7f7f2);
      return g;
    };
    const foot = () => { const g = G(); g.box(-1, -2, -1, 0, -1, 0, 0x1d6ad8).box(-1, -2, 1, 0, -2, 1, 0xf7f7f2); return g; };
    return {
      gait: 'hop',
      parts: [
        { name: 'legL', grid: foot(), at: [-2, 2, 0] },
        { name: 'legR', grid: foot(), at: [2, 2, 0] },
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'antenna', grid: tab, at: [0, 13, 0] },
        { name: 'armL', grid: armG(), at: [-5, 9, 0], parent: 'body' },
        { name: 'armR', grid: armG(), at: [4, 9, 0], parent: 'body' },
      ],
      muzzle: [0, 9, 5],
    };
  },

  chocoChomper() {
    const choco = 0x6e3c22, chocoL = 0x93593a, groove = 0x2e170b;
    const inChunkX = (x) => (x >= -5 && x <= -2) || (x >= 1 && x <= 4);
    const inChunkY = (y) => (y + 1) % 4 !== 0;
    const bar = (x, y, z) => (!inChunkY(y) ? groove : noise(x, y, z) < 0.25 ? chocoL : choco);
    const body = G();
    body.box(-5, 0, -2, 4, 12, 1, bar);
    // raised chunks on the front and back with a lit top edge
    for (let y = 0; y <= 12; y++) for (let x = -5; x <= 4; x++) {
      if (!inChunkY(y) || !inChunkX(x)) continue;
      const top = (y + 2) % 4 === 0;
      body.set(x, y, 2, top ? chocoL : choco);
      body.set(x, y, -3, top ? chocoL : choco);
    }
    body.box(-1, 0, 1, 0, 12, 1, groove);
    // bite marks in the top corner
    body.carve((x, y, z) => y >= 10 && x >= 2 && (x - 2) + (y - 10) >= 1);
    // peeled wrapper (lower half) with torn edge and flaps
    const wrapC = (x, y, z) => (y === 3 || y === 4 ? 0xff4fa3 : y === 1 ? 0xf7f7f2 : 0x1d9bf0);
    for (let y = 0; y <= 4; y++) for (let x = -6; x <= 5; x++) for (let z = -4; z <= 3; z++) {
      if (x > -6 && x < 5 && z > -4 && z < 3) continue;
      if (y === 4 && (x + z + 20) % 2 === 0) continue;
      body.set(x, y, z, wrapC(x, y, z));
    }
    body.box(-7, 4, 3, -6, 4, 4, 0x1d9bf0).set(-8, 3, 4, 0xd8dde8); // peeled flaps
    body.box(5, 5, -4, 6, 6, -4, 0x1d9bf0).set(6, 7, -4, 0xd8dde8);
    body.box(-1, 2, 3, 0, 2, 3, 0xffd23f); // label star
    // face: big eyes, monster mouth cavity
    bigEye(body, -5, 8, 3, { w: 3, h: 3, side: 'L', brow: groove, angry: true });
    bigEye(body, 2, 8, 3, { w: 3, h: 3, side: 'R', brow: groove, angry: true });
    body.carve((x, y, z) => y >= 5 && y <= 7 && z >= 1 && x >= -4 && x <= 3);
    body.box(-3, 7, 0, 2, 7, 0, 0x2a0a0a);
    for (const x of [-4, -2, 1, 3]) body.set(x, 7, 2, C.tooth);
    body.box(-3, 8, 2, 2, 8, 2, groove);
    // melty drips down the sides
    for (const [x, y, z, n] of [[-6, 11, 0, 3], [5, 9, -1, 2], [-6, 8, -2, 2]]) for (let i = 0; i < n; i++) body.set(x, y - i, z, 0x5a3220);
    const jaw = G();
    jaw.box(-4, -2, 1, 3, -1, 4, bar);
    jaw.box(-3, -1, 1, 2, -1, 3, 0x7a1a2a);
    for (const x of [-3, -1, 0, 2]) jaw.set(x, 0, 4, C.tooth);
    jaw.set(-3, 1, 4, C.tooth).set(2, 1, 4, C.tooth);
    const armG = () => {
      const g = G();
      g.box(-1, -3, -1, 0, 0, 0, choco);
      g.box(-2, -5, -1, 1, -4, 1, chocoL);
      g.set(-2, -5, 2, groove).set(1, -5, 2, groove);
      return g;
    };
    const leg = () => bipedLeg({ h: 3, color: choco, foot: groove, toe: 1, wide: true });
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 3, 0] },
        { name: 'legR', grid: leg(), at: [2, 3, 0] },
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'jaw', grid: jaw, at: [0, 7, 0], parent: 'body' },
        { name: 'armL', grid: armG(), at: [-7, 11, 0] },
        { name: 'armR', grid: armG(), at: [7, 11, 0] },
      ],
      muzzle: [0, 9, 6],
    };
  },

  melonMauler() {
    const rind = (x, y, z) => {
      const ang = Math.atan2(z, x + 0.5) + Math.sin(y * 0.7) * 0.25;
      const st = Math.floor((ang + Math.PI) / (Math.PI / 7)) % 2;
      return st ? 0x1f6a2a : noise(x, y, z) < 0.3 ? 0x6ab84a : 0x5aa83a;
    };
    const body = G();
    body.ellipsoid(-0.5, 6, 0, 6.3, 5.6, 5.6, rind);
    body.carve((x, y) => y < 0);
    // bitten-open mouth: carve a wedge and line it with rind, white and red flesh
    const inBite = (x, y, z) => z >= 2 && y >= 1 && y <= 6 && Math.abs(x + 0.5) <= 4.5 - Math.max(0, y - 5) - Math.max(0, 2 - y);
    body.carve(inBite);
    const fleshAt = [];
    body.forEach((x, y, z) => {
      const n = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]].some(([dx, dy, dz]) => inBite(x + dx, y + dy, z + dz));
      if (n) fleshAt.push([x, y, z]);
    });
    for (const [x, y, z] of fleshAt) {
      const deep = !inBite(x, y, z + 1) ? 0 : 1;
      body.set(x, y, z, 0xf04a5a);
    }
    // white rind lip around the bite
    body.forEach((x, y, z, c) => {});
    for (let x = -6; x <= 5; x++) for (let y = 0; y <= 7; y++) {
      for (let z = 6; z >= 2; z--) {
        if (!body.has(x, y, z)) continue;
        const c = body.get(x, y, z);
        if (c !== 0xf04a5a && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBite(x + dx, y + dy, z))) body.set(x, y, z, 0xe8f4d8);
        break;
      }
    }
    // seeds in the red flesh
    for (const [x, y, z] of fleshAt) if (noise(x * 5, y * 3, z) < 0.13) body.set(x, y, z, 0x15121f);
    // a couple of teeth on the upper lip
    for (const x of [-3, 2]) for (let z = 6; z >= 2; z--) if (body.has(x, 7, z)) { body.set(x, 6, z, C.tooth); break; }
    // angry eyes on the rind
    const fz = (x, y) => { for (let z = 8; z >= 0; z--) if (body.has(x, y, z)) return z; return 0; };
    const ez = Math.max(fz(-3, 9), fz(2, 9)) + 1;
    bigEye(body, -4, 8, ez, { w: 3, h: 3, side: 'L', brow: 0x0f3a14, angry: true });
    bigEye(body, 1, 8, ez, { w: 3, h: 3, side: 'R', brow: 0x0f3a14, angry: true });
    // stem + leaf
    body.box(-1, 12, -1, 0, 13, -1, 0x7a5a2a).set(1, 13, -1, 0x4aa83a).set(2, 13, -1, 0x4aa83a).set(2, 14, -1, 0x3a8a2a);
    const armG = () => arm({ len: 2, color: 0x1f6a2a, hand: 0x5aa83a, handH: 2, x0: -1, x1: 0, z0: -1, z1: 0 });
    const leg = () => bipedLeg({ h: 2, color: 0x1f6a2a, foot: 0x174f20, toe: 1, wide: true });
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-3, 2, 0] },
        { name: 'legR', grid: leg(), at: [3, 2, 0] },
        { name: 'body', grid: body, at: [0, 1, 0] },
        { name: 'armL', grid: armG(), at: [-7, 8, 0] },
        { name: 'armR', grid: armG(), at: [7, 8, 0] },
      ],
      muzzle: [0, 5, 7],
    };
  },

  seedling() {
    const body = G();
    body.ellipsoid(-0.5, 3.5, 0, 2.6, 3.2, 2.4, mot(0x6ac84a, 0x5ab83a, 0.3));
    body.carve((x, y) => y < 1);
    body.box(-2, 1, 1, 1, 1, 2, 0x4a9a2a);
    bigEye(body, -3, 3, 3, { w: 2, h: 2, side: 'L' });
    bigEye(body, 1, 3, 3, { w: 2, h: 2, side: 'R' });
    body.set(-1, 2, 3, 0x2a5a1a).set(0, 2, 3, 0x2a5a1a);
    body.set(-3, 2, 2, 0xff8aa0).set(2, 2, 2, 0xff8aa0); // blush
    // sprout
    body.box(-1, 7, 0, -1, 8, 0, 0x4a9a2a);
    body.box(-3, 9, 0, -2, 9, 1, 0x7ad84a).set(-4, 9, 1, 0x6ac83a);
    body.box(0, 9, -1, 1, 9, 0, 0x6ac83a).set(2, 10, -1, 0x7ad84a).set(-1, 9, 0, 0x4a9a2a);
    const leg = () => { const g = G(); g.box(0, -1, 0, 0, -1, 0, 0x3a7a2a).box(0, -2, 0, 0, -2, 1, 0x2a5a1a); return g; };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: leg(), at: [-2, 2, 0] },
        { name: 'legR', grid: leg(), at: [1, 2, 0] },
        { name: 'body', grid: body, at: [0, 1, 0] },
      ],
      muzzle: [0, 4, 4],
    };
  },

  // ======================================================== Bosses
  cartKong() {
    const wire = (x, y, z) => (noise(x, y, z) < 0.25 ? 0xa4acbc : 0xc4ccd8), wireD = 0x7a8294, red = 0xe8343c;
    const wireBox = (g, x0, y0, z0, x1, y1, z1, step = 2, col = wire) => {
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) {
        const fx = x === x0 || x === x1, fy = y === y0 || y === y1, fz = z === z0 || z === z1;
        if (!fx && !fy && !fz) continue;
        const edges = (fx ? 1 : 0) + (fy ? 1 : 0) + (fz ? 1 : 0);
        let on = edges >= 2;
        if (!on && fx) on = (y - y0) % step === 0 || (z - z0) % step === 0;
        if (!on && fy) on = (x - x0) % step === 0 || (z - z0) % step === 0;
        if (!on && fz) on = (x - x0) % step === 0 || (y - y0) % step === 0;
        if (on) g.set(x, y, z, col);
      }
    };
    const body = G();
    wireBox(body, -7, 0, -4, 6, 8, 4, 3);
    wireBox(body, -6, 6, -2, 5, 9, 5, 3); // hunched shoulders
    // red plastic trim along the shoulders and hips
    for (let x = -7; x <= 6; x++) { body.set(x, 8, 4, red); body.set(x, 0, 4, 0xb8202a); }
    body.box(-3, 2, 5, 2, 6, 5, red); // child-seat chest plate
    body.box(-2, 3, 6, 1, 5, 6, 0xff5a5a);
    body.box(-1, 4, 6, 0, 4, 6, 0xffd23f);
    // groceries stuck inside (visible through the wire gaps)
    body.box(-6, 1, -3, -4, 6, 0, (x, y, z) => (y === 3 || y === 4 ? C.red : 0xffd23f)); // cereal box
    body.box(2, 1, -3, 4, 5, -1, (x, y, z) => (y >= 5 ? 0x1d6ad8 : 0xf7f7f2)); // milk carton
    body.sphere(-1, 2, 2, 1.4, 0xe8343c).sphere(1.5, 2, 2, 1.2, 0x7cd83a); // apples
    body.box(-2, 1, -3, 0, 2, -1, 0xd8a050); // bread
    body.cylinder(4.5, 2, 1, 4, 1, 0xe0222c, 'y'); // soda can
    for (let i = 0; i < 5; i++) body.set(-4 + i, 7 + (i === 2 ? 1 : 0), 0, 0xffd23f); // banana bunch
    body.box(-5, 8, -1, -5, 11, -1, 0xd8a050).set(-5, 12, -1, 0xc08040); // baguette sticking out
    body.box(3, 8, 0, 3, 10, 0, 0x6ac83a).set(4, 11, 0, 0x8ae85a).set(2, 11, 0, 0x8ae85a); // celery
    // head: solid face plate inside a wire skull, cart-handle brow
    const head = G();
    wireBox(head, -4, 0, -2, 3, 5, 3);
    head.box(-3, 0, 4, 2, 4, 4, 0x5d6476);
    head.box(-5, 4, 5, 4, 4, 5, red); // handle brow
    head.set(-6, 4, 5, wireD).set(5, 4, 5, wireD);
    head.box(-3, 2, 5, -2, 3, 5, 0xff3a2a, true).box(1, 2, 5, 2, 3, 5, 0xff3a2a, true);
    head.set(-2, 3, 5, 0xffd0a0, true).set(1, 3, 5, 0xffd0a0, true);
    head.box(-3, 0, 5, 2, 1, 6, 0x2a2f3a); // muzzle
    for (let x = -3; x <= 2; x++) head.set(x, 1, 7, (x & 1) ? C.tooth : 0x4a0c18);
    head.box(-3, 0, 7, 2, 0, 7, 0x4a0c18).set(-3, 0, 7, C.tooth).set(2, 0, 7, C.tooth);
    head.set(-1, 2, 6, 0x15121f).set(0, 2, 6, 0x15121f);
    const castor = (g, x0, x1, y, z) => {
      g.box(x0, y, z - 1, x1, y + 1, z, 0x1a1a22);
      g.set(x0, y, z - 1, red).set(x1, y + 1, z, red);
    };
    const armG = () => {
      const g = G();
      wireBox(g, -2, -5, -2, 1, 0, 1, 3);
      wireBox(g, -3, -9, -2, 2, -6, 2, 3);
      g.box(-3, -10, -2, 2, -10, 2, wireD);
      g.box(-3, -9, 3, 2, -8, 3, red); // plastic knuckle guard
      castor(g, -2, -1, -12, 0);
      castor(g, 0, 1, -12, 0);
      return g;
    };
    const legG = () => {
      const g = G();
      wireBox(g, -2, -3, -2, 1, -1, 1);
      g.box(-2, -4, -2, 1, -4, 2, wireD);
      castor(g, -2, 1, -5, 1);
      return g;
    };
    return {
      gait: 'walk',
      parts: [
        { name: 'legL', grid: legG(), at: [-3, 5, -1] },
        { name: 'legR', grid: legG(), at: [3, 5, -1] },
        { name: 'body', grid: body, at: [0, 5, 0] },
        { name: 'head', grid: head, at: [0, 12, 4] },
        { name: 'armL', grid: armG(), at: [-9, 12, 2] },
        { name: 'armR', grid: armG(), at: [9, 12, 2] },
      ],
      muzzle: [0, 12, 12],
    };
  },
};
