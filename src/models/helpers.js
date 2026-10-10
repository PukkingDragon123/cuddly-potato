// Shared voxel-modelling helpers for Swarm models.
import { VoxGrid } from '../core/voxel.js';
import { shade } from '../core/util.js';

// ---------------------------------------------------------------------------
// Shared helpers

export const C = {
  white: 0xf7f7f2, ink: 0x15121f, pink: 0xff2e88, blue: 0x29b6f6, blueD: 0x1477c9, yellow: 0xffd23f,
  red: 0xe8343c, green: 0x5fdc4a, slime: 0x7cff3a, brown: 0x7d4a2d, choco: 0x5a3220, chocoL: 0x7d4a2d,
  gray: 0x9aa2b4, grayD: 0x5d6476, metal: 0xb8c0cc, orange: 0xff8a2a, purple: 0xb05cff, tooth: 0xffffff, tongue: 0xff6f8a,
};

/** Cartoon eye on a +Z facing surface. (x,y) = bottom-left voxel of the eye, z = surface layer. */
export function eye(g, x, y, z, o = {}) {
  const w = o.w ?? 2, hgt = o.h ?? 2;
  const white = o.white ?? C.white;
  g.box(x, y, z, x + w - 1, y + hgt - 1, z, white, !!o.glow);
  const px = o.pupilX ?? (o.side === 'R' ? x : x + w - 1);
  const py = o.pupilY ?? y;
  g.set(px, py, z, o.pupil ?? C.ink);
  if (o.pupil2) g.set(px, py + 1, z, o.pupil2, true);
  if (o.angry) {
    // brow: dark voxel above outer corner, slanting down toward centre
    const bx0 = o.side === 'R' ? x + w - 1 : x;
    const bx1 = o.side === 'R' ? x : x + w - 1;
    g.set(bx0, y + hgt, z, o.brow ?? C.ink);
    g.set(bx1, y + hgt - 1, z + 1, o.brow ?? C.ink);
  }
}

/** Pair of eyes symmetric around x=-0.5 (grid built with mirror convention -1-x). */
export function eyes(g, gap, y, z, o = {}) {
  const w = o.w ?? 2;
  eye(g, -gap - w, y, z, { ...o, side: 'L' });
  eye(g, gap - 1, y, z, { ...o, side: 'R' });
}

/** Zig-zag teeth row along x at height y, surface z. */
export function teeth(g, x0, x1, y, z, o = {}) {
  for (let x = x0; x <= x1; x++) {
    const up = (x - x0) % 2 === 0;
    g.set(x, y, z, o.color ?? C.tooth);
    if (o.double) g.set(x, up ? y + 1 : y - 1, z, o.color ?? C.tooth);
  }
}

/** Dark mouth with teeth on top & bottom rows. */
export function mouth(g, x0, x1, y0, y1, z, o = {}) {
  g.box(x0, y0, z, x1, y1, z, o.inside ?? 0x3a0f1f);
  for (let x = x0; x <= x1; x++) {
    if ((x - x0) % 2 === 0) g.set(x, y1, z, C.tooth);
    if ((x - x0) % 2 === 1 && y1 - y0 >= 2) g.set(x, y0, z, C.tooth);
  }
  if (o.tongue) g.set(Math.floor((x0 + x1) / 2), y0, z, C.tongue);
}

const noise = (x, y, z) => {
  let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791);
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
export { noise };

/** Simple quadruped legs, returns part list. */
export function legs4(color, paw, o = {}) {
  const h = o.h ?? 3, w = o.w ?? 2;
  const make = () => {
    const g = new VoxGrid();
    g.box(-Math.floor(w / 2), -h, -Math.floor(w / 2), Math.ceil(w / 2) - 1, -1, Math.ceil(w / 2) - 1, color);
    g.box(-Math.floor(w / 2), -h, -Math.floor(w / 2), Math.ceil(w / 2) - 1, -h, Math.ceil(w / 2) - 1 + (o.toe ? 1 : 0), paw ?? shade(color, -0.15));
    if (o.claws) for (let x = -Math.floor(w / 2); x < Math.ceil(w / 2); x++) g.set(x, -h, Math.ceil(w / 2) + (o.toe ? 1 : 0), C.white);
    return g;
  };
  const fx = o.x ?? 2, fz = o.fz ?? 3, bz = o.bz ?? -3, y = o.y ?? h;
  return [
    { name: 'legFL', grid: make(), at: [-fx, y, fz] },
    { name: 'legFR', grid: make(), at: [fx, y, fz] },
    { name: 'legBL', grid: make(), at: [-fx, y, bz] },
    { name: 'legBR', grid: make(), at: [fx, y, bz] },
  ];
}

/** Two stubby feet for hopping objects. */
export function feet2(color, o = {}) {
  const make = () => {
    const g = new VoxGrid();
    g.box(-1, -(o.h ?? 2), -1, 0, -1, 0, color);
    g.box(-1, -(o.h ?? 2), 1, 0, -(o.h ?? 2), 1, shade(color, -0.12));
    return g;
  };
  const x = o.x ?? 2, y = o.y ?? (o.h ?? 2), z = o.z ?? 0;
  return [
    { name: 'legL', grid: make(), at: [-x, y, z] },
    { name: 'legR', grid: make(), at: [x, y, z] },
  ];
}

/** Little arms hanging from shoulders. */
export function arms2(color, o = {}) {
  const make = (side) => {
    const g = new VoxGrid();
    const len = o.len ?? 3;
    g.box(-1, -len, -1, 0, 0, 0, color);
    g.box(-1, -len - 1, -1, 0, -len - 1, 0, o.hand ?? shade(color, -0.15));
    if (o.claws) { g.set(-1, -len - 2, 0, C.white); g.set(0, -len - 2, 0, C.white); }
    return g;
  };
  const x = o.x ?? 4, y = o.y ?? 6, z = o.z ?? 0;
  return [
    { name: 'armL', grid: make('L'), at: [-x, y, z], parent: o.parent },
    { name: 'armR', grid: make('R'), at: [x, y, z], parent: o.parent },
  ];
}

