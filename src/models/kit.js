// High-resolution toy modelling kit.
//
// Swarms are modelled at HI = 0.05 world units per voxel (twice the density of
// the original 0.1 models) with rounded "vinyl toy" primitives, symmetric
// modelling, and pixel-art stamping so faces, war-paint lightning bolts and
// decals are authored as tiny 2D pixel maps that get projected onto the
// curved voxel surface.
//
// Conventions (same as the rest of the codebase):
//   * model faces +Z, y = 0 is the ground, x is symmetric around x = -0.5
//     (mirror maps x -> -1 - x), 1 unit = 1 voxel.
//   * colours are 0xRRGGBB ints; glow voxels are unlit and bloom.
import { VoxGrid } from '../core/voxel.js';
import { shade, mixHex, hash3 } from '../core/util.js';

export const HI = 0.05;
export { shade, mixHex };

export const G = () => new VoxGrid();

/** Deterministic 0..1 noise for voxel coords (+ seed). */
export const n3 = (x, y, z, s = 0) => hash3(x + s * 31, y - s * 17, z + s * 7);

/** Colour function: base with occasional alternate (mottling). */
export const mottle = (a, b, p = 0.2, s = 0) => (x, y, z) => (n3(x, y, z, s) < p ? b : a);

const resolve = (c, x, y, z) => (typeof c === 'function' ? c(x, y, z) : c);

// ---------------------------------------------------------------------------
// Primitives

/**
 * Superellipsoid blob centred at (cx,cy,cz) with radii (rx,ry,rz).
 * o.p: roundness exponent (2 = ellipsoid, 3 = soft box, 6 = boxy), o.glow,
 * o.clip(x,y,z) -> true to skip, o.hollow (shell thickness in voxels).
 */
export function blob(g, cx, cy, cz, rx, ry, rz, col, o = {}) {
  const p = o.p ?? 2;
  const ax = rx + 0.35, ay = ry + 0.35, az = rz + 0.35;
  for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let z = Math.floor(cz - rz - 1); z <= Math.ceil(cz + rz + 1); z++) {
        const dx = Math.abs((x + 0.5 - (cx + 0.5)) / ax), dy = Math.abs((y + 0.5 - (cy + 0.5)) / ay), dz = Math.abs((z + 0.5 - (cz + 0.5)) / az);
        const d = dx ** p + dy ** p + dz ** p;
        if (d > 1) continue;
        if (o.hollow) {
          const ix = Math.abs((x - cx) / Math.max(0.5, ax - o.hollow)), iy = Math.abs((y - cy) / Math.max(0.5, ay - o.hollow)), iz = Math.abs((z - cz) / Math.max(0.5, az - o.hollow));
          if (ix ** p + iy ** p + iz ** p < 1) continue;
        }
        if (o.clip && o.clip(x, y, z)) continue;
        g.set(x, y, z, resolve(col, x, y, z), !!o.glow);
      }
  return g;
}

/** Rounded box between inclusive corners with edge radius r (voxels). */
export function rbox(g, x0, y0, z0, x1, y1, z1, r, col, o = {}) {
  const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
  const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
  const [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
  const R = Math.max(0, r);
  for (let x = ax; x <= bx; x++)
    for (let y = ay; y <= by; y++)
      for (let z = az; z <= bz; z++) {
        if (R > 0) {
          const dx = Math.max(ax + R - x, 0, x - (bx - R)), dy = Math.max(ay + R - y, 0, y - (by - R)), dz = Math.max(az + R - z, 0, z - (bz - R));
          const rx = o.noRoundX ? 0 : dx, ry = o.noRoundY ? 0 : dy, rz = o.noRoundZ ? 0 : dz;
          if (rx * rx + ry * ry + rz * rz > (R + 0.35) * (R + 0.35)) continue;
        }
        if (o.clip && o.clip(x, y, z)) continue;
        g.set(x, y, z, resolve(col, x, y, z), !!o.glow);
      }
  return g;
}

/**
 * Tapered capsule from A to B with radii r0 (at A) and r1 (at B).
 * Great for limbs, tails, horns, tentacles, antennae.
 */
export function capsule(g, a, b, r0, r1 = r0, col, o = {}) {
  const [ax, ay, az] = a, [bx, by, bz] = b;
  const minx = Math.floor(Math.min(ax, bx) - Math.max(r0, r1) - 1), maxx = Math.ceil(Math.max(ax, bx) + Math.max(r0, r1) + 1);
  const miny = Math.floor(Math.min(ay, by) - Math.max(r0, r1) - 1), maxy = Math.ceil(Math.max(ay, by) + Math.max(r0, r1) + 1);
  const minz = Math.floor(Math.min(az, bz) - Math.max(r0, r1) - 1), maxz = Math.ceil(Math.max(az, bz) + Math.max(r0, r1) + 1);
  const vx = bx - ax, vy = by - ay, vz = bz - az;
  const L2 = vx * vx + vy * vy + vz * vz || 1;
  for (let x = minx; x <= maxx; x++)
    for (let y = miny; y <= maxy; y++)
      for (let z = minz; z <= maxz; z++) {
        const px = x - ax, py = y - ay, pz = z - az;
        let t = (px * vx + py * vy + pz * vz) / L2;
        t = Math.max(0, Math.min(1, t));
        const qx = px - vx * t, qy = py - vy * t, qz = pz - vz * t;
        const r = r0 + (r1 - r0) * t + 0.4;
        if (qx * qx + qy * qy + qz * qz > r * r) continue;
        if (o.clip && o.clip(x, y, z)) continue;
        g.set(x, y, z, typeof col === 'function' ? col(x, y, z, t) : col, !!o.glow);
      }
  return g;
}

/** Chain of capsules through points (e.g. a curling tail). radii: array or [r0, r1]. */
export function chain(g, pts, radii, col, o = {}) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const r0 = Array.isArray(radii) ? (radii.length === pts.length ? radii[i] : radii[0] + (radii[1] - radii[0]) * (i / n)) : radii;
    const r1 = Array.isArray(radii) ? (radii.length === pts.length ? radii[i + 1] : radii[0] + (radii[1] - radii[0]) * ((i + 1) / n)) : radii;
    capsule(g, pts[i], pts[i + 1], r0, r1, col, o);
  }
  return g;
}

/** Cylinder along an axis with optional taper (r0 -> r1). */
export function cyl(g, axis, cu, cv, a0, a1, r0, r1 = r0, col, o = {}) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  const R = Math.max(r0, r1);
  for (let a = lo; a <= hi; a++) {
    const t = hi === lo ? 0 : (a - a0) / (a1 - a0);
    const r = r0 + (r1 - r0) * Math.max(0, Math.min(1, t)) + 0.4;
    for (let u = Math.floor(cu - R - 1); u <= Math.ceil(cu + R + 1); u++)
      for (let v = Math.floor(cv - R - 1); v <= Math.ceil(cv + R + 1); v++) {
        const du = u - cu, dv = v - cv;
        const d2 = du * du + dv * dv;
        if (d2 > r * r) continue;
        if (o.hollow && d2 < (r - o.hollow) * (r - o.hollow)) continue;
        let x, y, z;
        if (axis === 'y') { x = u; y = a; z = v; } else if (axis === 'x') { x = a; y = u; z = v; } else { x = u; y = v; z = a; }
        if (o.clip && o.clip(x, y, z)) continue;
        g.set(x, y, z, resolve(col, x, y, z), !!o.glow);
      }
  }
  return g;
}

/** Remove voxels where fn(x,y,z,c) is true. */
export const carve = (g, fn) => g.carve(fn);

/** Mirror the model: copy every voxel with x >= 0 (or x <= -1 when fromLeft) to the other side. */
export function mirror(g, fromLeft = false) {
  const add = [];
  g.forEach((x, y, z, c, glow) => {
    if (fromLeft ? x <= -1 : x >= 0) add.push([-1 - x, y, z, c, glow]);
  });
  for (const [x, y, z, c, glow] of add) g.set(x, y, z, c, glow);
  return g;
}

/** Symmetric set / box helpers. */
export function sym(g, x, y, z, c, glow) {
  g.set(x, y, z, c, glow);
  g.set(-1 - x, y, z, c, glow);
  return g;
}
export function symBox(g, x0, y0, z0, x1, y1, z1, c, glow) {
  g.box(x0, y0, z0, x1, y1, z1, c, glow);
  g.box(-1 - x0, y0, z0, -1 - x1, y1, z1, c, glow);
  return g;
}

/** Recolour existing voxels: fn(x,y,z,c) -> colour | undefined. */
export function recolor(g, fn) {
  return g.paint(fn);
}

/** Vertical paint gradient: multiplies brightness from `bottom` (at y0) to `top` (at y1). */
export function gradY(g, y0, y1, bottom = -0.18, top = 0.08, only) {
  return g.paint((x, y, z, c) => {
    if (only && !only(x, y, z, c)) return undefined;
    const t = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0)));
    const f = bottom + (top - bottom) * t;
    return shade(c, f);
  });
}

/** Re-flag voxels as glowing where fn is true (optionally recolour). */
export function glowWhere(g, fn, col) {
  const hits = [];
  g.forEach((x, y, z, c) => { if (fn(x, y, z, c)) hits.push([x, y, z, c]); });
  for (const [x, y, z, c] of hits) g.set(x, y, z, col ?? c, true);
  return g;
}

// ---------------------------------------------------------------------------
// Surface queries

/** Frontmost (max z) voxel at (x,y), or null. */
export function frontZ(g, x, y, zmin = -200, zmax = 200) {
  for (let z = zmax; z >= zmin; z--) if (g.has(x, y, z)) return z;
  return null;
}
/** Backmost (min z) voxel at (x,y), or null. */
export function backZ(g, x, y, zmin = -200, zmax = 200) {
  for (let z = zmin; z <= zmax; z++) if (g.has(x, y, z)) return z;
  return null;
}
/** Outermost voxel along +x (side = 1) or -x (side = -1) at (y,z). */
export function sideX(g, y, z, side = 1, lim = 200) {
  if (side > 0) { for (let x = lim; x >= -lim; x--) if (g.has(x, y, z)) return x; } else { for (let x = -lim; x <= lim; x++) if (g.has(x, y, z)) return x; }
  return null;
}
/** Topmost voxel at (x,z). */
export function topY(g, x, z, lim = 200) {
  for (let y = lim; y >= -lim; y--) if (g.has(x, y, z)) return y;
  return null;
}

// ---------------------------------------------------------------------------
// Pixel-art stamping
//
// art: array of strings (top row first). Each char maps through `pal`:
//   '.' or ' '  -> leave untouched
//   '_'         -> carve (remove the surface voxel; paints the one behind with pal._ if given)
//   any other   -> colour from pal[ch]; a value of {c, glow, raise, carve} gives control.
// Projection axis:
//   'z'  : onto the FRONT surface (+Z), art u -> +x, v -> -y; (x,y) = top-left
//   '-z' : onto the back
//   'x'  : onto the +X side (u -> -z i.e. towards the back as you look at it), '-x' onto the -X side (u -> +z)
//   'y'  : onto the top (u -> +x, v -> +z i.e. rows go towards the front)
// o.raise: add a voxel on top of the surface (embossed decal), o.depth: paint N voxels deep.
// o.mirror: also stamp mirrored across the model's centre seam (x -> -1-x, art flipped).

export function stamp(g, art, pal, o = {}) {
  const axis = o.axis ?? 'z';
  const rows = art.length;
  const doOne = (flip) => {
    for (let v = 0; v < rows; v++) {
      const row = art[v];
      for (let u = 0; u < row.length; u++) {
        const ch = row[u];
        if (ch === '.' || ch === ' ') continue;
        let spec = pal[ch];
        if (spec === undefined && ch !== '_') continue;
        if (typeof spec === 'number' || typeof spec === 'function') spec = { c: spec };
        if (ch === '_') spec = { carve: true, c: pal._ };
        let x, y, z;
        if (axis === 'z' || axis === '-z') {
          x = flip ? -1 - (o.x + u) : o.x + u;
          y = o.y - v;
          const s = axis === 'z' ? frontZ(g, x, y, o.zmin ?? -200, o.zmax ?? 200) : backZ(g, x, y, o.zmin ?? -200, o.zmax ?? 200);
          if (s === null) continue;
          z = s;
          applyAt(g, x, y, z, axis === 'z' ? [0, 0, 1] : [0, 0, -1], spec, o);
        } else if (axis === 'x' || axis === '-x') {
          const side = axis === 'x' ? 1 : -1;
          y = o.y - v;
          z = side > 0 ? o.z - u : o.z + u;
          const sx = sideX(g, y, z, flip ? -side : side);
          if (sx === null) continue;
          applyAt(g, sx, y, z, [flip ? -side : side, 0, 0], spec, o);
        } else if (axis === 'y') {
          x = flip ? -1 - (o.x + u) : o.x + u;
          z = o.z + v;
          const sy = topY(g, x, z);
          if (sy === null) continue;
          applyAt(g, x, sy, z, [0, 1, 0], spec, o);
        }
      }
    }
  };
  doOne(false);
  if (o.mirror) doOne(true);
  return g;
}


function applyAt(g, x, y, z, n, spec, o) {
  const glow = !!spec.glow;
  if (spec.carve) {
    const depth = spec.depth ?? o.carveDepth ?? 1;
    for (let i = 0; i < depth; i++) g.del(x - n[0] * i, y - n[1] * i, z - n[2] * i);
    if (spec.c !== undefined) g.set(x - n[0] * depth, y - n[1] * depth, z - n[2] * depth, spec.c, glow);
    return;
  }
  const raise = spec.raise ?? o.raise ?? 0;
  const depth = spec.depth ?? o.depth ?? 1;
  for (let i = 0; i < depth; i++) {
    const px = x - n[0] * i, py = y - n[1] * i, pz = z - n[2] * i;
    if (g.has(px, py, pz)) g.set(px, py, pz, spec.c, glow);
  }
  for (let i = 1; i <= raise; i++) g.set(x + n[0] * i, y + n[1] * i, z + n[2] * i, spec.c, glow);
}

// ---------------------------------------------------------------------------
// Common toy features

/**
 * Cartoon eye stamped onto the front surface.
 * (x, y) = top-left of the eye box, w/h size, o.look [dx,dy] pupil offset,
 * o.iris colour (ring around the pupil), o.angle 'angry' | 'sad' | 'none' trims
 * the top inner/outer corner, o.side 'L' | 'R' for which side the inner corner is.
 */
export function eyeArt(w, h, o = {}) {
  const rows = [];
  const pw = o.pw ?? Math.max(1, Math.round(w * 0.42)), ph = o.ph ?? Math.max(1, Math.round(h * 0.55));
  const look = o.look ?? [0, 0];
  const px0 = Math.round((w - pw) / 2 + look[0] + (o.inward ?? 0) * (o.side === 'L' ? 1 : -1));
  const py0 = Math.round((h - ph) / 2 + 0.5 - look[1]);
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) {
      // rounded corners
      const corner = (x === 0 || x === w - 1) && (y === 0 || y === h - 1) && w > 2 && h > 2;
      let ch = corner ? '.' : 'W';
      // angry: slice the top towards the nose; sad: slice the top outer corner
      if (o.angle === 'angry') {
        const inner = o.side === 'L' ? x : w - 1 - x; // distance from outer edge
        if (y < Math.floor((inner / (w - 1)) * (o.slant ?? Math.ceil(h * 0.45)))) ch = '.';
      } else if (o.angle === 'sad') {
        const outer = o.side === 'L' ? w - 1 - x : x;
        if (y < Math.floor((outer / (w - 1)) * (o.slant ?? Math.ceil(h * 0.4)))) ch = '.';
      }
      if (ch === 'W' && x >= px0 && x < px0 + pw && y >= py0 && y < py0 + ph) {
        ch = 'P';
        if (o.iris && (x === px0 || x === px0 + pw - 1 || y === py0 + ph - 1) && pw > 2) ch = 'I';
      }
      r += ch;
    }
    rows.push(r);
  }
  // glint (top-left of the pupil)
  if (o.glint !== false && pw >= 2 && ph >= 2) {
    const gy = py0, gx = o.side === 'R' ? px0 + pw - 1 : px0;
    rows[gy] = rows[gy].slice(0, gx) + 'G' + rows[gy].slice(gx + 1);
  }
  return rows;
}

/** Stamp a pair of eyes symmetric around the seam. (gap) = voxels from the seam to the inner edge. */
export function eyes(g, y, gap, w, h, o = {}) {
  const pal = { W: o.white ?? 0xffffff, P: o.pupil ?? 0x15121f, I: o.iris ?? o.pupil ?? 0x15121f, G: { c: 0xffffff, glow: true } };
  if (o.glow) pal.W = { c: pal.W, glow: true };
  if (o.pupilGlow) pal.P = { c: pal.P, glow: true };
  const raise = o.raise ?? 0;
  const L = eyeArt(w, h, { ...o, side: 'L' });
  const R = eyeArt(w, h, { ...o, side: 'R', look: o.look ? [-o.look[0], o.look[1]] : undefined });
  stamp(g, L, pal, { axis: 'z', x: -gap - w, y, raise, zmin: o.zmin, zmax: o.zmax });
  stamp(g, R, pal, { axis: 'z', x: gap, y, raise, zmin: o.zmin, zmax: o.zmax });
  return g;
}

/** A row of zig-zag teeth art (w wide). */
export function teethRow(w, down = true) {
  let a = '', b = '';
  for (let i = 0; i < w; i++) {
    a += 'T';
    b += i % 2 === 0 ? 'T' : '.';
  }
  return down ? [a, b] : [b, a];
}

/** Classic MrBeast Lab panther "lightning bolt" war-paint (8x7, left eye; mirror for right). */
export const BOLT_L = [
  '..MM....',
  '...MM...',
  '....MM..',
  '..MMMM..',
  '...MM...',
  '....MM..',
  '.....M..',
];

/** Small 5x7 lightning bolt (flank/badge decal). */
export const BOLT_SMALL = [
  '..MMM',
  '.MMM.',
  'MMM..',
  'MMMMM',
  '..MM.',
  '.MM..',
  'MM...',
];

/** Paint a vertical colour fade (e.g. Midnight Panther black -> blue). */
export function fadeY(g, y0, y1, c0, c1, only) {
  return g.paint((x, y, z, c) => {
    if (only && !only(c)) return undefined;
    const t = Math.max(0, Math.min(1, (y - y0) / Math.max(1, y1 - y0)));
    return mixHex(c0, c1, t);
  });
}

// ---------------------------------------------------------------------------
// Part helper: wraps a grid with placement info for SwarmRig

/** part(name, grid, at=[x,y,z] voxels in parent space, extra) */
export const part = (name, grid, at = [0, 0, 0], extra = {}) => ({ name, grid, at, ...extra });

/** Bounds helper: returns {minX..maxZ} of a grid. */
export const bounds = (g) => g.bounds();

/**
 * Joint part: the grid is modelled in absolute model coordinates and the part
 * rotates around `joint`. For child parts pass the parent's joint so the
 * placement is converted to parent space. extra: { parent, rot }.
 */
export function jp(name, grid, joint, parentJoint = null, extra = {}) {
  const at = parentJoint ? [joint[0] - parentJoint[0], joint[1] - parentJoint[1], joint[2] - parentJoint[2]] : joint.slice();
  return { name, grid, at, pivot: joint.slice(), ...extra };
}
