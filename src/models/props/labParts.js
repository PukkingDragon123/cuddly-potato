// Reusable voxel parts shared by lab buildings, backdrops and props.
import { VoxGrid, PAL, shade, hash3, hazardC, text } from './common.js';

/** Panelled box: alternating panel tints, seams on the faces. */
export function panelBox(g, x0, y0, z0, x1, y1, z1, o = {}) {
  const c1 = o.c1 ?? PAL.white, c2 = o.c2 ?? PAL.white2, seam = o.seam ?? PAL.seam;
  const px = o.px ?? 8, py = o.py ?? 9;
  g.box(x0, y0, z0, x1, y1, z1, (x, y, z) => {
    const onZ = z === z0 || z === z1, onX = x === x0 || x === x1;
    if (o.hollow && !onZ && !onX && y !== y0 && y !== y1) return null;
    const u = onZ ? x - x0 : z - z0;
    if ((onZ || onX) && (u % px === 0 || (y - y0) % py === 0)) return seam;
    if (!onZ && !onX && (x - x0) % px === 0) return seam; // top seams
    const pi = Math.floor(u / px) + Math.floor((y - y0) / py) * 3;
    return hash3(pi, 7, onZ ? 1 : 2) < 0.5 ? c1 : c2;
  });
  return g;
}

/** Window with frame protruding on a +Z face. Glass glows. */
export function windowZ(g, x0, y0, x1, y1, z, o = {}) {
  const frame = o.frame ?? PAL.white2, glass = o.glass ?? PAL.blueL;
  g.box(x0 - 1, y0 - 1, z + 1, x1 + 1, y1 + 1, z + 1, frame);
  g.box(x0, y0, z + 1, x1, y1, z + 1, null);
  g.box(x0, y0, z, x1, y1, z, (x, y) => (o.shine && (x - x0 + y - y0) % 7 === 0 ? 0xffffff : glass), o.glow !== false);
  if (o.mull) for (let x = x0 + o.mull; x < x1; x += o.mull + 1) g.box(x, y0, z + 1, x, y1, z + 1, frame);
  if (o.sill) g.box(x0 - 1, y0 - 2, z + 1, x1 + 1, y0 - 2, z + 2, o.sill);
  return g;
}
/** Window on a +X face. */
export function windowX(g, z0, y0, z1, y1, x, o = {}) {
  const frame = o.frame ?? PAL.white2, glass = o.glass ?? PAL.blueL;
  g.box(x + 1, y0 - 1, z0 - 1, x + 1, y1 + 1, z1 + 1, frame);
  g.box(x + 1, y0, z0, x + 1, y1, z1, null);
  g.box(x, y0, z0, x, y1, z1, glass, o.glow !== false);
  if (o.mull) for (let z = z0 + o.mull; z < z1; z += o.mull + 1) g.box(x + 1, y0, z, x + 1, y1, z, frame);
  return g;
}

/** Barrel standing at (x,y,z) base-centre. */
export function barrel(g, x, y, z, col = PAL.blue, o = {}) {
  const h = o.h ?? 7, r = o.r ?? 2;
  g.cylinder(x, z, y, y + h - 1, r, (xx, yy) => (yy === y + 1 || yy === y + h - 2 ? shade(col, -0.3) : col));
  g.cylinder(x, z, y + h - 1, y + h - 1, r - 1, shade(col, -0.15));
  if (o.hazard) g.box(x - 1, y + 3, z + r, x + 1, y + 4, z + r, PAL.yellow).set(x, y + 3, z + r, PAL.ink);
  if (o.glow) g.set(x, y + h - 1, z, o.glow, true);
  return g;
}

/** Crate (wooden) at min corner. */
export function crate(g, x, y, z, s = 5, col = PAL.wood) {
  const d = shade(col, -0.25);
  g.box(x, y, z, x + s - 1, y + s - 1, z + s - 1, (xx, yy, zz) => {
    const ex = xx === x || xx === x + s - 1, ey = yy === y || yy === y + s - 1, ez = zz === z || zz === z + s - 1;
    if ((ex && ey) || (ey && ez) || (ex && ez)) return d;
    return (yy - y) % 2 ? col : shade(col, 0.08);
  });
  return g;
}

/** Hazard stripe box. */
export function hazard(g, x0, y0, z0, x1, y1, z1, a = PAL.yellow, b = PAL.ink) {
  return g.box(x0, y0, z0, x1, y1, z1, hazardC(a, b));
}

/** Satellite dish grid (local, base at origin). Tilted bowl pointing +X-ish/up. */
export function dishGrid(o = {}) {
  const g = new VoxGrid();
  const R = o.r ?? 6, col = o.col ?? PAL.white, back = o.back ?? PAL.metal, post = o.post ?? PAL.metalD;
  g.cylinder(0, 0, 0, 3, 1, post);
  g.box(-1, 3, -1, 1, 4, 1, back);
  const tilt = o.tilt ?? 0.6;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const cy = 6;
  for (let x = -R - 2; x <= R + 2; x++)
    for (let y = 0; y <= R + 8; y++)
      for (let z = -R - 2; z <= R + 2; z++) {
        // rotate point about Z by -tilt into dish frame (dish axis = local +Y rotated toward +X)
        const px = x, py = y - cy, pz = z;
        const dx = px * ct - py * st;
        const dy = px * st + py * ct;
        const r2 = dx * dx + pz * pz;
        if (r2 > R * R + 1) continue;
        const surf = r2 / (R * 1.6);
        if (Math.abs(dy - surf) < 0.55) g.set(x, y, z, r2 > (R - 1) * (R - 1) ? (o.rim ?? PAL.pink) : col);
        else if (Math.abs(dy - surf + 1) < 0.5) g.set(x, y, z, back);
      }
  // feed arm + glowing tip
  for (let i = 1; i <= 5; i++) {
    const dx = 0, dy = i;
    g.set(Math.round(dx * ct + dy * st), Math.round(cy - dx * st + dy * ct), 0, post);
  }
  g.set(Math.round(6 * st), Math.round(cy + 6 * ct), 0, o.tip ?? PAL.pink, true);
  return g;
}

/** Antenna mast grid (local base at origin). */
export function antennaGrid(h = 16, o = {}) {
  const g = new VoxGrid();
  const c = o.col ?? PAL.metal;
  g.box(-1, 0, -1, 1, 1, 1, o.base ?? PAL.metalD);
  g.box(0, 2, 0, 0, h, 0, c);
  for (let y = 5; y < h - 1; y += 4) {
    g.box(-2, y, 0, 2, y, 0, c);
    g.set(-2, y + 1, 0, o.tipCol ?? PAL.pink, true).set(2, y + 1, 0, o.tipCol ?? PAL.pink, true);
  }
  return g;
}

/** Flag cloth grid (local: pole side at x=0, extends +x). */
export function flagGrid(w, h, fill) {
  const g = new VoxGrid();
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) g.set(x, y, 0, fill(x, y));
  // ragged end
  g.del(w - 1, 0, 0).del(w - 1, h - 1, 0);
  return g;
}

/** Simple pipe run along an axis with joints. */
export function pipe(g, axis, a0, a1, u, v, col = PAL.metal, joint = PAL.blue, r = 1, every = 6) {
  for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++) {
    const j = (a - a0) % every === 0;
    const rr = j ? r + 1 : r;
    const cc = j ? joint : col;
    for (let i = -rr; i <= rr; i++)
      for (let k = -rr; k <= rr; k++) {
        if (rr > 1 && Math.abs(i) === rr && Math.abs(k) === rr) continue;
        if (axis === 'x') g.set(a, u + i, v + k, cc);
        else if (axis === 'y') g.set(u + i, a, v + k, cc);
        else g.set(u + i, v + k, a, cc);
      }
  }
  return g;
}

/** Round vault door on a face: '+z' or '+x' with centre (u,v) in the face plane at depth w. */
export function vaultDoor(g, face, cu, cy, w, R = 7, o = {}) {
  const steel = o.steel ?? PAL.metalL, dark = o.dark ?? PAL.metalD, gold = o.gold ?? PAL.gold;
  const put = (du, dy, d, c, glow) => {
    if (face === '+z') g.set(cu + du, cy + dy, w + d, c, glow);
    else g.set(w + d, cy + dy, cu - du, c, glow);
  };
  for (let du = -R - 1; du <= R + 1; du++)
    for (let dy = -R - 1; dy <= R + 1; dy++) {
      const r = Math.sqrt(du * du + dy * dy);
      if (r <= R + 0.5) {
        let c = steel;
        if (r > R - 1.2) c = dark;
        else if (Math.abs(r - (R - 3)) < 0.5) c = shade(steel, -0.15);
        put(du, dy, 0, c);
        if (r <= R - 1.2) put(du, dy, 1, (Math.abs(r - (R - 3)) < 0.6) ? shade(steel, -0.1) : null);
      }
      // bolts
      if (Math.abs(r - (R - 0.5)) < 0.5 && (Math.abs(du) === 0 || Math.abs(dy) === 0 || Math.abs(du) === Math.abs(dy))) put(du, dy, 1, gold);
    }
  // wheel
  for (let i = -3; i <= 3; i++) {
    put(i, 0, 2, gold); put(0, i, 2, gold); put(i, i, 2, gold); put(i, -i, 2, gold);
  }
  put(0, 0, 3, o.hub ?? PAL.pink, true);
  // hinge block
  for (let dy = -R + 2; dy <= R - 2; dy += 4) { put(-R - 1, dy, 1, dark); put(-R - 1, dy + 1, 1, dark); }
  return g;
}

/** Shopping cart grid at 0.1 scale. Local base-centre at origin, faces +X (handle at -x). Wheels separate. */
export function cartGrid(o = {}) {
  const g = new VoxGrid();
  const wire = o.wire ?? PAL.metalL, wireD = o.wireD ?? PAL.metal, accent = o.accent ?? PAL.red;
  const L0 = -4, L1 = 5, W = 3, y0 = 3, y1 = 8;
  // basket: wire mesh walls
  for (let x = L0; x <= L1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = -W; z <= W; z++) {
        const edge = x === L0 || x === L1 || z === -W || z === W || y === y0;
        if (!edge) continue;
        const rim = y === y1 || y === y0;
        const grid = (x + z) % 2 === 0 || y % 2 === 0;
        if (rim) g.set(x, y, z, accent);
        else if (grid) g.set(x, y, z, (x + y + z) % 3 ? wire : wireD);
      }
  // handle
  g.box(L0 - 1, y1 + 1, -W, L0 - 1, y1 + 1, W, accent);
  g.box(L0 - 1, y1, -W, L0 - 1, y1, -W, wireD).box(L0 - 1, y1, W, L0 - 1, y1, W, wireD);
  // chassis
  g.box(L0, 1, -2, L1, 2, -2, wireD).box(L0, 1, 2, L1, 2, 2, wireD);
  g.box(L0 + 1, 2, -2, L1 - 1, 2, 2, (x, y, z) => ((x + z) % 2 ? wireD : null));
  if (o.full) {
    const cols = [PAL.red, PAL.yellow, PAL.blue, PAL.green, PAL.pink, PAL.orange, 0xffffff];
    for (let x = L0 + 1; x < L1; x += 2)
      for (let z = -W + 1; z < W; z += 2) {
        const c = cols[Math.floor(hash3(x, 9, z) * cols.length)];
        const hh = 2 + Math.floor(hash3(x, 3, z) * 4);
        g.box(x, y0 + 1, z, x + 1, y0 + hh, z + 1, c);
        if (hash3(x, 5, z) < 0.4) g.set(x, y0 + hh + 1, z, PAL.white);
      }
  }
  return g;
}
export function cartWheelGrid() {
  const g = new VoxGrid();
  g.box(-1, -1, 0, 1, 1, 0, PAL.ink).set(0, 0, 0, PAL.metal);
  return g;
}

/** Product box (cereal-ish) at min corner. */
export function productBox(g, x, y, z, w, h, d, col, o = {}) {
  g.box(x, y, z, x + w - 1, y + h - 1, z + d - 1, col);
  if (h >= 3) {
    g.box(x, y + h - 2, z + d - 1, x + w - 1, y + h - 2, z + d - 1, o.band ?? shade(col, 0.45));
    if (w >= 2) g.set(x + Math.floor(w / 2), y + 1, z + d - 1, o.logo ?? PAL.white);
  }
  return g;
}

/** Glow sign with text on a +Z face. */
export function signZ(g, str, cx, y, z, o = {}) {
  const s = o.scale ?? 1;
  const tw = text(new VoxGrid(), str, 0, 0, 0, '+z', 0, { scale: s });
  const pad = o.pad ?? 2;
  const x0 = cx - Math.floor(tw / 2) - pad, x1 = x0 + tw - 1 + pad * 2;
  const sy = o.sy ?? s;
  const th = 5 * sy;
  if (o.frame) g.box(x0 - 1, y - 1, z, x1 + 1, y + th + pad * 2, z, o.frame);
  g.box(x0, y, z, x1, y + th - 1 + pad * 2, z, o.board ?? PAL.ink);
  text(g, str, cx, y + pad, z + 1, '+z', o.color ?? PAL.pink, { scale: s, sy, center: true, glow: o.glow !== false, mirror: o.mirror, depth: o.depth });
  return { x0, x1, y1: y + th - 1 + pad * 2 };
}

/** Pink lightning bolt emblem on a +Z face (centre cx, cy). */
export function boltEmblem(g, cx, cy, z, o = {}) {
  const R = o.r ?? 5;
  g.cylinder(cx, cy, z, z, R, o.disc ?? PAL.pink, 'z');
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    g.set(Math.round(cx + Math.cos(t) * (R + 0.6)), Math.round(cy + Math.sin(t) * (R + 0.6)), z, o.rim ?? PAL.white);
  }
  const bolt = ['...##', '..##.', '.##..', '#####', '..##.', '.##..', '##...'];
  const sc = R >= 6 ? 2 : 1;
  bolt.forEach((row, r) => [...row].forEach((ch, i) => {
    if (ch !== '#') return;
    for (let a = 0; a < sc; a++) for (let b2 = 0; b2 < sc; b2++)
      g.set(cx + (i - 2) * sc + a, cy + (3 - r) * sc + b2 - (sc > 1 ? 1 : 0), z + 1, o.bolt ?? PAL.white, o.glow !== false);
  }));
  return g;
}
