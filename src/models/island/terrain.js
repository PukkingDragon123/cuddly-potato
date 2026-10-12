// Beast Island terrain: a voxel heightfield (0.5 unit columns, 0.5 unit
// steps) shaped around the zone plateaus, the trophy road and the river,
// meshed with a greedy column mesher (merged top quads + run-merged cliff
// walls split into strata bands). Top faces sample a 0.25-unit pixel colour
// map (grass speckles, flowers, paving, sand...), so the surface reads as
// high-resolution voxels at a fraction of the triangles.
import * as THREE from 'three';
import { vnoise } from '../props/common.js';
import { hash3, clamp } from '../../core/util.js';

export const CS = 0.5; // column size (world units)
export const VY = 0.5; // height step
export const X0 = -92, Z0 = -88, NX = 368, NZ = 352;
const TPC = 2; // colour-map texels per column (0.25 units / texel)

export const MAT = { WATER: 0, SAND: 1, GRASS: 2, ROCK: 3, SNOW: 4, DESERT: 5, ASH: 6, CANDY: 7, ROAD: 8, LUSH: 9, PASTEL: 10, CHANNEL: 11, PLAZA: 12 };

export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
export function fbm(x, z, oct = 3, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x * f, seed + i * 7.31, z * f) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

// ---------------------------------------------------------------------------
// Colour helpers (linear colour for vertex colours, sRGB bytes for canvas)
const _c = new THREE.Color();
const rgbOf = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// Strata (side wall) palettes per material: [lip colour | null, lip height, bands...]
const SIDES = {
  [MAT.SAND]: [null, 0, 0xf0d898, 0xe6c983, 0xf0d898, 0xdcbc74],
  [MAT.GRASS]: [0x4fb441, 0.28, 0xc98d55, 0xb57a46, 0xd9a066, 0xa86c3c, 0xc48450],
  [MAT.LUSH]: [0x44c24a, 0.3, 0xc98d55, 0xb57a46, 0xd9a066, 0xa86c3c, 0xc48450],
  [MAT.PASTEL]: [0x6fd27a, 0.28, 0xe8b0c0, 0xd496aa, 0xf2c4cf, 0xc98aa0],
  [MAT.ROCK]: [0x58b84a, 0.24, 0x8e96a8, 0x9ea6b8, 0x7c8496, 0xaab2c2],
  [MAT.SNOW]: [0xffffff, 0.34, 0xbfe0f6, 0x9fc8ea, 0xd4ecfa, 0x8ab8e0],
  [MAT.DESERT]: [0xf2c879, 0.22, 0xe0a058, 0xc9803e, 0xeab070, 0xb86e34, 0xd89048],
  [MAT.ASH]: [0x5a5468, 0.2, 0x3a3446, 0x4a4256, 0x2e2a3a, 0x423a4e],
  [MAT.CANDY]: [0x8ee8b8, 0.3, 0x7d4a2d, 0x5a3220, 0x6a3c24, 0x8a5634],
  [MAT.ROAD]: [0xfff1d0, 0.12, 0xe2cfa2, 0xd2bd8c],
  [MAT.PLAZA]: [null, 0, 0xe2cfa2, 0xd2bd8c],
  [MAT.CHANNEL]: [null, 0, 0x8a7a5a, 0x6e6046],
};
const FACE_SHADE = { px: 0.9, nx: 0.86, pz: 1.0, nz: 0.8 };

/**
 * Build the island terrain.
 * spec: { zones: [{x,z,y,rp,rb,biome}], road: THREE.Vector3[] control points (x,z), river: [[x,z],...], peaks: [[x,z,h,r]] }
 */
export function buildTerrain(spec) {
  const _t0 = performance.now();
  const tick = (label) => { if (spec.log) console.log(`[terrain] ${label} ${Math.round(performance.now() - _t0)}ms`); };
  const N = NX * NZ;
  const H = new Float32Array(N); // working height (world units)
  const fine = new Uint8Array(N); // 1 = shaped (fine 0.5 quantisation)
  const hv = new Int16Array(N); // final height in VY steps (<= 0 => water)
  const mat = new Uint8Array(N);
  const roadD = new Float32Array(N).fill(99);
  const roadY = new Float32Array(N);
  const riverD = new Float32Array(N).fill(99);
  const riverW = new Float32Array(N);
  const riverY = new Float32Array(N);
  const zones = spec.zones;
  const cx = (i) => X0 + (i + 0.5) * CS;
  const cz = (j) => Z0 + (j + 0.5) * CS;

  // ---------------------------------------------------------------- coast + natural height
  const landF = new Float32Array(N);
  const cliffF = new Float32Array(N);
  for (let j = 0; j < NZ; j++) {
    const z = cz(j);
    for (let i = 0; i < NX; i++) {
      const x = cx(i);
      const th = Math.atan2(z, x);
      const R = 1 + 0.07 * Math.sin(3 * th + 0.7) + 0.05 * Math.sin(5 * th + 2.1) + 0.035 * Math.sin(9 * th + 0.3) + (fbm(x * 0.035, z * 0.035, 2, 3) - 0.5) * 0.22;
      const rho = Math.sqrt((x / 76) ** 2 + ((z + 1) / 70) ** 2) / R;
      let L = 1 - rho;
      // cliffy north + west coasts, beaches south + east
      const north = clamp(-z / 50, 0, 1), west = clamp(-x / 55, 0, 1);
      const cliff = clamp(Math.max(north * 1.1, west * 0.95) - 0.12, 0, 1);
      cliffF[j * NX + i] = cliff;
      landF[j * NX + i] = L;
    }
  }
  // river distance (for the valley + calmer hills along it)
  const riverPts = densify(spec.river, 0.25);
  const rDist = new Float32Array(N).fill(99);
  stamp(riverPts, 16, (id, d) => { if (d < rDist[id]) rDist[id] = d; });
  // zone RBF base height + hills + peaks
  const sig2 = 2 * 20 * 20;
  for (let j = 0; j < NZ; j++) {
    const z = cz(j);
    for (let i = 0; i < NX; i++) {
      const id = j * NX + i, x = cx(i);
      let L = landF[id];
      // keep zones on land
      let near = 0, ws = 0, hs = 0;
      for (const Z of zones) {
        const d2 = (x - Z.x) ** 2 + (z - Z.z) ** 2;
        const R0 = Z.rp + Z.rb;
        if (d2 < (R0 + 10) ** 2) near = Math.max(near, 1 - smooth(R0, R0 + 10, Math.sqrt(d2)));
        const w = Math.exp(-d2 / sig2) + 1e-6;
        ws += w;
        hs += w * (Z.y - 0.5);
      }
      L = Math.max(L, near * 0.12);
      const base = hs / ws;
      const cliff = cliffF[id];
      const coastW = lerp(0.22, 0.035, cliff);
      const coast = smooth(0, coastW, L);
      const inland = smooth(0.05, 0.3, L);
      const rd = rDist[id];
      const calm = smooth(3, 13, rd);
      let h = (base + 0.4) * coast + (fbm(x * 0.045, z * 0.045, 3, 11) - 0.5) * 8 * inland * calm;
      // gentle river valley (never below the beach level inland)
      if (rd < 16 && L > 0) h = Math.max(Math.min(h, 1.5), h - 3 * Math.exp(-(rd * rd) / (2 * 6 * 6)) * inland);
      // rolling beach dunes
      if (L > 0 && L < 0.12 && cliff < 0.4) h = Math.max(h, 0.55 + vnoise(x * 0.12, 5, z * 0.12) * 0.6);
      if (L <= 0) h = Math.min(h, L * 40); // open sea
      for (const [px, pz, ph, pr] of spec.peaks) {
        let d2 = (x - px) ** 2 + (z - pz) ** 2;
        if (d2 > 9 * pr * pr) continue;
        d2 *= 0.6 + vnoise(x * 0.16 + px, 13, z * 0.16) * 0.8;
        const k = Math.exp(-d2 / (2 * pr * pr));
        h = Math.max(h, ph * k * (0.85 + vnoise(x * 0.2, 21, z * 0.2) * 0.3));
      }
      H[id] = h;
    }
  }
  tick('natural');

  // ---------------------------------------------------------------- zone plateaus
  for (let j = 0; j < NZ; j++) {
    const z = cz(j);
    for (let i = 0; i < NX; i++) {
      const id = j * NX + i, x = cx(i);
      for (const Z of zones) {
        const d = Math.hypot(x - Z.x, z - Z.z);
        if (d > Z.rp + Z.rb) continue;
        const s = smooth(Z.rp, Z.rp + Z.rb, d + (fbm(x * 0.2, z * 0.2, 2, 4) - 0.5) * 2.5);
        H[id] = lerp(Z.y - 0.5, H[id], s);
        fine[id] = 1;
      }
      for (const [bx, bz, by, br, bb] of spec.basins ?? []) {
        const d = Math.hypot(x - bx, z - bz);
        if (d > br + bb) continue;
        const s = smooth(br, br + bb, d + (vnoise(x * 0.25, 6, z * 0.25) - 0.5) * 2);
        H[id] = lerp(by, H[id], s);
      }
    }
  }

  tick('zones');
  // ---------------------------------------------------------------- road
  const road = densify(spec.road, 0.25);
  // indices of zone centres along the dense road
  const zIdx = zones.map((Z) => {
    let best = 0, bd = 1e9;
    road.forEach((p, k) => { const d = (p.x - Z.x) ** 2 + (p.z - Z.z) ** 2; if (d < bd) { bd = d; best = k; } });
    return best;
  });
  const RW = spec.roadHalf ?? 1.5, SH = 4.5;
  for (let k = 0; k < road.length; k++) {
    const p = road[k];
    let seg = 0;
    while (seg < zones.length - 2 && k > zIdx[seg + 1]) seg++;
    const A = zones[seg], B = zones[seg + 1];
    const a = Math.hypot(p.x - A.x, p.z - A.z) - (A.rp + 1.5), b = Math.hypot(p.x - B.x, p.z - B.z) - (B.rp + 1.5);
    let u = a <= 0 ? 0 : b <= 0 ? 1 : a / (a + b);
    if (k <= zIdx[0]) u = 0;
    if (k >= zIdx[zones.length - 1]) u = 1;
    u = u * 0.75 + u * u * (3 - 2 * u) * 0.25;
    p.y = Math.max(0.5, lerp(A.y, B.y, u) - 0.5);
    p.seg = seg;
  }
  stamp(road, RW + SH, (id, d, p) => {
    if (d < roadD[id]) { roadD[id] = d; roadY[id] = p.y; }
  });
  for (let id = 0; id < N; id++) {
    if (roadD[id] > RW + SH) continue;
    const s = smooth(RW + 0.2, RW + SH, roadD[id]);
    H[id] = lerp(roadY[id], H[id], s);
    fine[id] = 1;
  }

  tick('road');
  // ---------------------------------------------------------------- quantise
  for (let j = 0; j < NZ; j++) {
    const z = cz(j);
    for (let i = 0; i < NX; i++) {
      const id = j * NX + i, x = cx(i);
      let h = H[id];
      if (fine[id]) hv[id] = Math.round(h / VY);
      else {
        h += (vnoise(x * 0.35, 1.7, z * 0.35) - 0.5) * 0.7;
        hv[id] = Math.round(h / 1.0) * 2; // 1.0 unit terraces
      }
      if (hv[id] < 1 && landF[id] > 0 && H[id] > 0.22) hv[id] = 1;
      if (hv[id] < -2) hv[id] = -2;
    }
  }

  // ---------------------------------------------------------------- river
  // water level profile: monotonically descending along the path
  let wl = Infinity;
  const riverInfo = [];
  for (let k = 0; k < riverPts.length; k++) {
    const p = riverPts[k];
    const id = colAt(p.x, p.z);
    let g = id >= 0 ? hv[id] * VY : 0;
    if (k === 0) g = (spec.riverStartY ?? g);
    // under the road: keep clear of the bridge deck
    let rd = 99, ry = 0;
    if (id >= 0) { rd = roadD[id]; ry = roadY[id]; }
    if (rd < RW + 2.6) g = Math.min(g, ry - 1.0);
    wl = Math.min(wl, g - 0.12);
    if (k > riverPts.length - 12) wl = Math.min(wl, 0.12 * (riverPts.length - k) / 12);
    // pool-and-drop: water levels on whole units so cascades are fewer + taller
    p.y = Math.max(0.05, k === 0 ? wl : Math.floor((wl + 0.12) / 1.0) * 1.0 - 0.15);
    p.w = (spec.riverWidth ? spec.riverWidth(k / (riverPts.length - 1)) : 1.2);
    riverInfo.push(p);
  }
  stamp(riverPts, 4.5, (id, d, p) => {
    if (d < riverD[id]) { riverD[id] = d; riverW[id] = p.w; riverY[id] = p.y; }
  });
  for (let id = 0; id < N; id++) {
    const d = riverD[id];
    if (d > riverW[id] + 1.2) continue;
    const wy = riverY[id];
    if (d <= riverW[id] + 0.25) {
      hv[id] = Math.min(hv[id], Math.floor((wy - 0.3) / VY));
      if (hv[id] < -2) hv[id] = -2;
      mat[id] = MAT.CHANNEL;
    } else if (hv[id] * VY < wy + 0.2 && wy > 0.3 && roadD[id] > RW + 0.5) {
      hv[id] = Math.ceil((wy + 0.2) / VY); // levee so the water never floats
    }
  }
  // summit lagoon
  if (spec.lagoon) {
    const [lx, lz, lr, ly] = spec.lagoon;
    forDisc(lx, lz, lr + 1.5, (id, d, x, z) => {
      const rr = lr * (1 + (fbm(x * 0.3, z * 0.3, 2, 9) - 0.5) * 0.35);
      if (d < rr) { hv[id] = Math.floor((ly - 0.75) / VY); mat[id] = MAT.CHANNEL; }
    });
  }

  tick('river');
  // ---------------------------------------------------------------- materials (per column)
  const biomeAt = (x, z, jit = 0) => {
    let best = null, bw = 0;
    for (const B of spec.biomes) {
      const w = 1 - Math.hypot(x - B.x, z - B.z) / B.r + (fbm(x * 0.08, z * 0.08, 2, 31) - 0.5) * 0.5 + jit;
      if (w > bw) { bw = w; best = B; }
    }
    return best;
  };
  const colBiome = new Uint8Array(N);
  for (let j = 0; j < NZ; j++) {
    const z = cz(j);
    for (let i = 0; i < NX; i++) {
      const id = j * NX + i, x = cx(i);
      if (hv[id] < 1) { if (mat[id] !== MAT.CHANNEL) mat[id] = MAT.WATER; continue; }
      if (mat[id] === MAT.CHANNEL) continue;
      const B = biomeAt(x, z);
      let m = B ? B.mat : MAT.GRASS;
      const y = hv[id] * VY;
      const beach = y <= 1.0 + (fbm(x * 0.1, z * 0.1, 2, 2) - 0.5) && landF[id] < 0.2 && cliffF[id] < 0.6;
      if (beach && m !== MAT.SNOW) m = MAT.SAND;
      for (const [px, pz, , pr] of spec.peaks) if (Math.hypot(x - px, z - pz) < pr * 1.25 && y > 9) m = m === MAT.SNOW ? m : MAT.ROCK;
      if (roadD[id] < RW) m = MAT.ROAD;
      for (const Z of zones) {
        const d = Math.hypot(x - Z.x, z - Z.z);
        if (d < (Z.plinthR ?? 7.6) + 1.6 && Math.abs(y - (Z.y - 0.5)) < 0.3) m = MAT.PLAZA;
      }
      mat[id] = m;
      colBiome[id] = B ? B.id : 0;
    }
  }

  // ---------------------------------------------------------------- helpers
  function colAt(x, z) {
    const i = Math.floor((x - X0) / CS), j = Math.floor((z - Z0) / CS);
    if (i < 0 || j < 0 || i >= NX || j >= NZ) return -1;
    return j * NX + i;
  }
  function forDisc(x, z, r, fn) {
    const i0 = Math.max(0, Math.floor((x - r - X0) / CS)), i1 = Math.min(NX - 1, Math.ceil((x + r - X0) / CS));
    const j0 = Math.max(0, Math.floor((z - r - Z0) / CS)), j1 = Math.min(NZ - 1, Math.ceil((z + r - Z0) / CS));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = cx(i), pz = cz(j);
      const d = Math.hypot(px - x, pz - z);
      if (d <= r) fn(j * NX + i, d, px, pz);
    }
  }
  function stamp(pts, r, fn) {
    for (const p of pts) forDisc(p.x, p.z, r, (id, d) => fn(id, d, p));
  }

  const api = {
    hv, mat, roadD, roadY, riverD, riverW, riverY, landF, colBiome,
    road, zIdx, river: riverInfo, RW,
    colAt,
    forDisc,
    /** Top surface height (world y) at x,z (0 for water). */
    heightAt(x, z) {
      const id = colAt(x, z);
      if (id < 0) return 0;
      return Math.max(0, hv[id] * VY);
    },
    matAt(x, z) {
      const id = colAt(x, z);
      return id < 0 ? MAT.WATER : mat[id];
    },
    /** Max height in a small square (for placing props on stepped ground). */
    maxHeight(x, z, r) {
      let m = 0;
      forDisc(x, z, r, (id) => { m = Math.max(m, hv[id] * VY); });
      return m;
    },
    minHeight(x, z, r) {
      let m = 1e9;
      forDisc(x, z, r, (id) => { m = Math.min(m, hv[id] * VY); });
      return m;
    },
  };
  tick('materials');
  api.mesh = buildMesh(api);
  tick('mesh');
  api.colorTex = paintColorMap(api, spec);
  tick('colormap');
  api.distTex = shoreDistance(api);
  tick('shore');
  return api;
}

// ---------------------------------------------------------------------------
// Dense Catmull-Rom path through [x,z] points (or Vector3) every `step` units.
export function densify(pts, step) {
  const v = pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1])));
  const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map((p) => ({ x: p.x, z: p.z, y: 0 }));
}

// ---------------------------------------------------------------------------
// Greedy column mesher

function buildMesh(T) {
  const { hv, mat } = T;
  const pos = [], nor = [], col = [], uv = [];
  const iTop = [], iSide = [];
  let vc = 0;
  const W = NX * CS, D = NZ * CS;
  const quad = (a, b, c, d, n, cols, top) => {
    pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) nor.push(n[0], n[1], n[2]);
    if (cols) col.push(...cols); else for (let k = 0; k < 4; k++) col.push(1, 1, 1);
    for (const p of [a, b, c, d]) uv.push((p[0] - X0) / W, (p[2] - Z0) / D);
    (top ? iTop : iSide).push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
    vc += 4;
  };

  // ---- tops: 2D greedy by height
  const used = new Uint8Array(NX * NZ);
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const id = j * NX + i, h = hv[id];
      if (h < 1 || used[id]) continue;
      let w = 1;
      while (i + w < NX && !used[id + w] && hv[id + w] === h) w++;
      let d = 1;
      outer: while (j + d < NZ) {
        for (let k = 0; k < w; k++) { const q = (j + d) * NX + i + k; if (used[q] || hv[q] !== h) break outer; }
        d++;
      }
      for (let dd = 0; dd < d; dd++) used.fill(1, (j + dd) * NX + i, (j + dd) * NX + i + w);
      const x0 = X0 + i * CS, x1 = X0 + (i + w) * CS, z0 = Z0 + j * CS, z1 = Z0 + (j + d) * CS, y = h * VY;
      quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], null, true);
    }

  // ---- walls: run-merged along the boundary, split into strata bands
  const eff = (h) => (h < 1 ? -2 : h);
  const bandCols = (m, yb, yt, sh) => {
    const S = SIDES[m] ?? SIDES[MAT.GRASS];
    const out = [];
    let top = yt;
    if (S[0] !== null && S[1] > 0) {
      const lb = Math.max(yb, yt - S[1]);
      out.push([lb, top, S[0]]);
      top = lb;
    }
    const bands = S.length - 2;
    while (top > yb + 1e-4) {
      const k = Math.floor((top - 1e-4) / 1.0);
      const b0 = Math.max(yb, k * 1.0);
      const c = S[2 + (((k % bands) + bands) % bands)];
      out.push([b0, top, c]);
      top = b0;
    }
    return out.map(([a, b, c]) => {
      _c.setHex(c);
      const ao = (y) => (0.7 + 0.3 * smooth(0, 1.6, y - yb)) * sh;
      return [a, b, _c.r, _c.g, _c.b, ao(a), ao(b)];
    });
  };
  const emitWall = (axis, dir, plane, s0, s1, ylo, yhi, m) => {
    const yb = ylo * VY, yt = yhi * VY;
    const sh = axis === 'x' ? (dir > 0 ? FACE_SHADE.px : FACE_SHADE.nx) : dir > 0 ? FACE_SHADE.pz : FACE_SHADE.nz;
    for (const [a, b, r, g, bl, la, lb] of bandCols(m, yb, yt, sh)) {
      const cA = [r * la, g * la, bl * la], cB = [r * lb, g * lb, bl * lb];
      if (axis === 'x') {
        const x = plane;
        if (dir > 0) quad([x, a, s0], [x, b, s0], [x, b, s1], [x, a, s1], [1, 0, 0], [...cA, ...cB, ...cB, ...cA]);
        else quad([x, a, s1], [x, b, s1], [x, b, s0], [x, a, s0], [-1, 0, 0], [...cA, ...cB, ...cB, ...cA]);
      } else {
        const z = plane;
        if (dir > 0) quad([s1, a, z], [s1, b, z], [s0, b, z], [s0, a, z], [0, 0, 1], [...cA, ...cB, ...cB, ...cA]);
        else quad([s0, a, z], [s0, b, z], [s1, b, z], [s1, a, z], [0, 0, -1], [...cA, ...cB, ...cB, ...cA]);
      }
    }
  };
  // x boundaries (faces normal +-x), runs along z
  for (let i = -1; i < NX; i++) {
    const xb = X0 + (i + 1) * CS;
    for (const dir of [1, -1]) {
      let run = null;
      const flush = () => { if (run) emitWall('x', dir, xb, Z0 + run.j0 * CS, Z0 + run.j1 * CS, run.lo, run.hi, run.m); run = null; };
      for (let j = 0; j < NZ; j++) {
        const a = i >= 0 ? hv[j * NX + i] : -2, b = i + 1 < NX ? hv[j * NX + i + 1] : -2;
        let hi, lo, m;
        if (dir > 0) { hi = a; lo = eff(b); m = i >= 0 ? mat[j * NX + i] : 0; } else { hi = b; lo = eff(a); m = i + 1 < NX ? mat[j * NX + i + 1] : 0; }
        if (hi < 1 || hi <= lo) { flush(); continue; }
        if (run && run.hi === hi && run.lo === lo && run.m === m) run.j1 = j + 1;
        else { flush(); run = { j0: j, j1: j + 1, hi, lo, m }; }
      }
      flush();
    }
  }
  // z boundaries (faces normal +-z), runs along x
  for (let j = -1; j < NZ; j++) {
    const zb = Z0 + (j + 1) * CS;
    for (const dir of [1, -1]) {
      let run = null;
      const flush = () => { if (run) emitWall('z', dir, zb, X0 + run.i0 * CS, X0 + run.i1 * CS, run.lo, run.hi, run.m); run = null; };
      for (let i = 0; i < NX; i++) {
        const a = j >= 0 ? hv[j * NX + i] : -2, b = j + 1 < NZ ? hv[(j + 1) * NX + i] : -2;
        let hi, lo, m;
        if (dir > 0) { hi = a; lo = eff(b); m = j >= 0 ? mat[j * NX + i] : 0; } else { hi = b; lo = eff(a); m = j + 1 < NZ ? mat[(j + 1) * NX + i] : 0; }
        if (hi < 1 || hi <= lo) { flush(); continue; }
        if (run && run.hi === hi && run.lo === lo && run.m === m) run.i1 = i + 1;
        else { flush(); run = { i0: i, i1: i + 1, hi, lo, m }; }
      }
      flush();
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(new THREE.Uint32BufferAttribute(iTop.concat(iSide), 1));
  geo.addGroup(0, iTop.length, 0);
  geo.addGroup(iTop.length, iSide.length, 1);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

// ---------------------------------------------------------------------------
// Colour map (top faces)

function paintColorMap(T, spec) {
  const { hv, mat, roadD } = T;
  const TW = NX * TPC, TH = NZ * TPC;
  const cnv = document.createElement('canvas');
  cnv.width = TW;
  cnv.height = TH;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(TW, TH);
  const d = img.data;
  const RW = T.RW;
  const FLOWERS = [0xffffff, 0xffd23f, 0xff6fb8, 0xff4a5a, 0xb88cff];
  const pal = {
    [MAT.GRASS]: [0x5cc24a, 0x4fb441, 0x6ad154, 0x86de5e, 0x3f9e3a],
    [MAT.LUSH]: [0x4fd05a, 0x3fbe4c, 0x62de68, 0x9af07a, 0x2f9e44],
    [MAT.PASTEL]: [0x7cd88a, 0x6fcc7e, 0x8fe29a, 0xb4f0b8, 0x5ab86c],
    [MAT.ROCK]: [0x58b84a, 0x4fa844, 0x9aa2b4, 0x6ad154, 0x8a92a4],
    [MAT.SNOW]: [0xf4f9ff, 0xe6f0fb, 0xffffff, 0xffffff, 0xc8dcf0],
    [MAT.DESERT]: [0xf2c879, 0xe8b866, 0xf8d68e, 0xffe6a8, 0xd8a050],
    [MAT.ASH]: [0x4a4458, 0x564f64, 0x3e3a4c, 0x6a6278, 0x2e2a3a],
    [MAT.CANDY]: [0x9cf0c4, 0x8ae4b4, 0xffc2dc, 0xffffff, 0x6ad0a0],
    [MAT.SAND]: [0xf8e6ae, 0xf0da98, 0xfff0c4, 0xffffff, 0xe0c482],
    [MAT.CHANNEL]: [0x6fc8d8, 0x5ab8cc, 0x80d4e0, 0x80d4e0, 0x4aa8c0],
    [MAT.PLAZA]: [0xece0c0, 0xe2d4b0, 0xf4ead0, 0xfff6e0, 0xc8b48a],
  };
  const put = (o, hex) => { d[o] = (hex >> 16) & 255; d[o + 1] = (hex >> 8) & 255; d[o + 2] = hex & 255; d[o + 3] = 255; };
  const lighten = (hex, k) => {
    const [r, g, b] = rgbOf(hex);
    const f = (v) => clamp(Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)), 0, 255);
    return (f(r) << 16) | (f(g) << 8) | f(b);
  };
  for (let tj = 0; tj < TH; tj++) {
    const j = tj >> 1;
    const z = Z0 + (tj + 0.5) * (CS / TPC);
    for (let ti = 0; ti < TW; ti++) {
      const i = ti >> 1;
      const id = j * NX + i;
      const o = (tj * TW + ti) * 4;
      const m = mat[id];
      const x = X0 + (ti + 0.5) * (CS / TPC);
      if (hv[id] < 1 && m !== MAT.CHANNEL) { put(o, 0x2a9ad8); continue; }
      let c;
      const hs = hash3(ti, tj, 17);
      if (m === MAT.ROAD) {
        const rd = roadD[id];
        const gx = ((ti % 4) + 4) % 4, gz = ((tj % 4) + 4) % 4;
        if (rd > RW - 0.32) c = 0xc79a5a; // curb
        else if (rd > RW - 0.6) c = 0xf6e2b0;
        else if (gx === 0 || gz === 0) c = 0xe0cc9c;
        else c = ((ti >> 2) + (tj >> 2)) & 1 ? 0xfff4d8 : 0xfbe9c0;
        if (hs < 0.04 && rd < RW - 0.6 && gx && gz) c = lighten(c, -0.05);
      } else if (m === MAT.PLAZA) {
        const B = spec.biomeById[T.colBiome[id]];
        const P = B?.plaza ?? pal[MAT.PLAZA];
        const gx = ((ti % 3) + 3) % 3, gz = ((tj % 3) + 3) % 3;
        c = gx === 0 || gz === 0 ? P[1] : (((Math.floor(ti / 3) + Math.floor(tj / 3)) & 1) ? P[0] : P[2]);
      } else {
        const P = pal[m] ?? pal[MAT.GRASS];
        const n = vnoise(x * 0.12, 3.3, z * 0.12) + (bayer(ti, tj) - 0.5) * 0.12;
        c = n > 0.62 ? P[2] : n < 0.36 ? P[1] : P[0];
        if (hs < 0.05) c = P[3];
        else if (hs > 0.955) c = P[4];
        if (m === MAT.GRASS || m === MAT.LUSH || m === MAT.PASTEL) {
          const fl = hash3(ti >> 1, tj >> 1, 5);
          const fz = vnoise(x * 0.09, 8.1, z * 0.09);
          if (fz > (m === MAT.LUSH || m === MAT.PASTEL ? 0.55 : 0.66) && fl < 0.05 && ((ti + tj) & 1) === 0) c = m === MAT.PASTEL ? [0xff9ec8, 0xffffff, 0xffc2dc][Math.floor(fl * 60) % 3] : FLOWERS[Math.floor(fl * 100) % FLOWERS.length];
        } else if (m === MAT.DESERT) {
          if (Math.sin(x * 1.3 + z * 0.45 + vnoise(x * 0.2, 1, z * 0.2) * 4) > 0.8) c = P[1];
        } else if (m === MAT.ASH) {
          const cr = vnoise(x * 0.5, 2, z * 0.5);
          if (cr > 0.48 && cr < 0.5) c = 0xff7a2a;
          const pool = vnoise(x * 0.16, 9, z * 0.16);
          if (pool > 0.74) c = pool > 0.78 ? 0x9dff3a : 0x5fdc4a;
        } else if (m === MAT.SAND) {
          // wet sand next to the sea
          let wet = false;
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const q = (j + dj) * NX + i + di;
            if (q >= 0 && q < hv.length && hv[q] < 1 && mat[q] !== MAT.CHANNEL) wet = true;
          }
          if (wet) c = hs < 0.1 ? 0xffffff : 0xe2c88a;
          if (hash3(ti, tj, 77) < 0.006) c = [0xff9e9e, 0xffffff, 0xffb070][Math.floor(hs * 3)];
        } else if (m === MAT.SNOW) {
          if (hash3(ti >> 2, tj >> 2, 31) < 0.03) c = 0xbfe0f6;
        }
      }
      // crisp voxel edges: lit rim where the ground drops, contact shade where it rises
      const h = hv[id];
      const li = ti & 1, lj = tj & 1;
      const nb = (di, dj) => {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ) return -2;
        return hv[jj * NX + ii];
      };
      const edgeN = (lj === 0 && nb(0, -1) < h) || (li === 0 && nb(-1, 0) < h);
      const edgeS = (lj === 1 && nb(0, 1) < h) || (li === 1 && nb(1, 0) < h);
      const wallN = (lj === 0 && nb(0, -1) > h) || (li === 0 && nb(-1, 0) > h) || (lj === 1 && nb(0, 1) > h) || (li === 1 && nb(1, 0) > h);
      if (edgeS || edgeN) c = lighten(c, 0.14);
      else if (wallN) c = lighten(c, -0.16);
      put(o, c);
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cnv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  tex.flipY = false;
  tex.generateMipmaps = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Distance-to-shore field for the ocean shader (R channel, 0..32 units).

function shoreDistance(T) {
  const { hv } = T;
  const PAD = 48; // extra columns of open sea on each side
  const W = NX + PAD * 2, Hh = NZ + PAD * 2;
  const N = W * Hh;
  const D = new Float32Array(N);
  const INF = 1e6;
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const ii = i - PAD, jj = j - PAD;
    const land = ii >= 0 && jj >= 0 && ii < NX && jj < NZ && hv[jj * NX + ii] >= 1;
    D[j * W + i] = land ? 0 : INF;
  }
  const a = CS, b = CS * Math.SQRT2;
  for (let j = 0; j < Hh; j++)
    for (let i = 0; i < W; i++) {
      const id = j * W + i;
      let v = D[id];
      if (i > 0) v = Math.min(v, D[id - 1] + a);
      if (j > 0) {
        v = Math.min(v, D[id - W] + a);
        if (i > 0) v = Math.min(v, D[id - W - 1] + b);
        if (i < W - 1) v = Math.min(v, D[id - W + 1] + b);
      }
      D[id] = v;
    }
  for (let j = Hh - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const id = j * W + i;
      let v = D[id];
      if (i < W - 1) v = Math.min(v, D[id + 1] + a);
      if (j < Hh - 1) {
        v = Math.min(v, D[id + W] + a);
        if (i < W - 1) v = Math.min(v, D[id + W + 1] + b);
        if (i > 0) v = Math.min(v, D[id + W - 1] + b);
      }
      D[id] = v;
    }
  const data = new Uint8Array(N * 4);
  for (let id = 0; id < N; id++) {
    data[id * 4] = Math.round(clamp(D[id] / 32, 0, 1) * 255);
    data[id * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, Hh, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  tex.userData.rect = [X0 - PAD * CS, Z0 - PAD * CS, W * CS, Hh * CS];
  return tex;
}
