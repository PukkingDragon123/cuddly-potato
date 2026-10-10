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
    const outer = o.side === 'R' ? x + w - 1 : x;
    const dir = o.side === 'R' ? -1 : 1; // towards centre
    for (let i = 0; i < w + 1; i++) {
      const bx = outer - dir + dir * i;
      const t = i / w;
      let by = y + h;
      if (o.angry) by = y + h - (t > 0.55 ? 1 : 0);
      if (o.sad) by = y + h - (t < 0.45 ? 1 : 0);
      g.set(bx, by, z + 1, o.brow);
    }
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
    body.box(-1, 2, -1, 0, 3, 0, wood);
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
      body.box(x0, y0, z0, x0 + 2, y0 + 2, z0 + 2, 0xf7f7f2);
      body.del(x0, y0 + 2, z0).del(x0 + 2, y0 + 2, z0).del(x0, y0, z0).del(x0 + 2, y0, z0);
      body.box(x0 + lx, y0 + ly, z0 + 2, x0 + lx + 1, y0 + ly + 1, z0 + 2, C.ink);
      body.set(x0 + lx, y0 + ly + 1, z0 + 2, 0xffffff, true);
      if (lid) body.box(x0, y0 + 2, z0, x0 + 2, y0 + 2, z0 + 2, 0x2456c0).box(x0, y0 + 3, z0, x0 + 2, y0 + 3, z0 + 1, 0x2f68e0);
    };
    eyeBall(-3, 9, 2, 1, 0, false);
    eyeBall(0, 10, 2, 0, 0, true);
    body.set(1, 9, 3, 0x2f68e0).set(0, 9, 3, 0x2f68e0);
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
    fuse.set(0, 0, 0, 0x5a4a3a).set(0, 1, 0, 0x3a2a1a).set(0, 2, -1, 0x3a2a1a).set(1, 3, -1, 0x3a2a1a);
    fuse.set(1, 4, -1, 0xff6a1a, true).set(1, 5, -1, 0xffd23f, true).set(2, 5, -1, 0xfff6a0, true).set(0, 5, -2, 0xffa21a, true).set(1, 6, 0, 0xfff27a, true);
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
    ant.box(0, 0, 0, 0, 2, 0, 0x8a92a4);
    ant.set(0, 3, 0, 0xffffff, true).set(-1, 4, 0, spark, true).set(1, 4, 0, spark, true).set(0, 5, 0, sparkW, true).set(-1, 3, 0, spark, true).set(1, 3, 0, sparkW, true);
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
        { name: 'antenna', grid: ant, at: [0, 15, 1] },
        { name: 'armL', grid: armG(), at: [-7, 10, 1] },
        { name: 'armR', grid: armG(), at: [7, 10, 1] },
      ],
      muzzle: [0, 10, 4],
    };
  },
};
