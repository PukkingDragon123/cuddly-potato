// Greedy voxel mesher WITH ambient occlusion: like props/greedy.js it merges
// coplanar same-colour faces into big quads, but every face also carries its
// 4 corner AO values and only faces with identical colour + AO merge. Flat
// areas collapse to a few quads while creases, corners and contact edges keep
// the toy-like AO shading of VoxGrid.build(). Output matches build(): groups
// [solid, glow] for Mats.pair, plus userData.dims. Typically 4-10x fewer
// triangles than VoxGrid.build() on props.
import * as THREE from 'three';
import { hash3 } from '../../core/util.js';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';

const AO_LEVELS = [0.5, 0.68, 0.84, 1.0];

// growable typed buffers (no per-vertex JS array churn)
class Buf {
  constructor(T, n) { this.T = T; this.a = new T(n); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  view() { return this.a.subarray(0, this.n); }
}
const linCache = new Map();
const _c = new THREE.Color();
function linear(hex) {
  let v = linCache.get(hex);
  if (!v) { _c.setHex(hex); v = [_c.r, _c.g, _c.b]; linCache.set(hex, v); }
  return v;
}

/**
 * VoxGrid with a fixed box of cells stored in a typed array (no Map, no GC
 * churn): same brush API (set/get/has/del/box/cylinder/line/paint/carve/
 * forEach/bounds), voxels outside [x0..x1, y0..y1, z0..z1] are dropped (and
 * counted in .dropped). buildGreedyAO() reads its array directly.
 */
export class DenseGrid extends VoxGrid {
  constructor(x0, y0, z0, x1, y1, z1) {
    super();
    this.min = [x0 - 1, y0 - 1, z0 - 1];
    this.dim = [x1 - x0 + 3, y1 - y0 + 3, z1 - z0 + 3];
    this.str = [this.dim[1] * this.dim[2], this.dim[2], 1];
    this.vol = new Int32Array(this.dim[0] * this.dim[1] * this.dim[2]);
    this.dropped = 0;
  }
  idx(x, y, z) {
    const i = x - this.min[0], j = y - this.min[1], k = z - this.min[2];
    if (i < 1 || j < 1 || k < 1 || i >= this.dim[0] - 1 || j >= this.dim[1] - 1 || k >= this.dim[2] - 1) return -1;
    return i * this.str[0] + j * this.str[1] + k;
  }
  set(x, y, z, c, glow = false) {
    x |= 0; y |= 0; z |= 0;
    const i = this.idx(x, y, z);
    if (i < 0) { this.dropped++; return this; }
    const col = typeof c === 'function' ? c(x, y, z) : c;
    this.vol[i] = col === null || col === undefined || col === false ? 0 : col * 2 + (glow ? 1 : 0) + 1;
    return this;
  }
  get(x, y, z) { const i = this.idx(x | 0, y | 0, z | 0); const v = i < 0 ? 0 : this.vol[i]; return v ? (v - 1) >> 1 : undefined; }
  has(x, y, z) { const i = this.idx(x | 0, y | 0, z | 0); return i >= 0 && this.vol[i] !== 0; }
  del(x, y, z) { const i = this.idx(x | 0, y | 0, z | 0); if (i >= 0) this.vol[i] = 0; return this; }
  forEach(fn) {
    const [D0, D1, D2] = this.dim, v = this.vol;
    for (let i = 1; i < D0 - 1; i++) for (let j = 1; j < D1 - 1; j++) {
      let id = i * this.str[0] + j * this.str[1] + 1;
      for (let k = 1; k < D2 - 1; k++, id++) { const a = v[id]; if (a) fn(i + this.min[0], j + this.min[1], k + this.min[2], (a - 1) >> 1, ((a - 1) & 1) === 1); }
    }
  }
  paint(fn) {
    const hits = [];
    this.forEach((x, y, z, c, glow) => { const nc = fn(x, y, z, c); if (nc !== undefined && nc !== null) hits.push(x, y, z, nc, glow ? 1 : 0); });
    for (let i = 0; i < hits.length; i += 5) this.set(hits[i], hits[i + 1], hits[i + 2], hits[i + 3], hits[i + 4] === 1);
    return this;
  }
  carve(fn) {
    const hits = [];
    this.forEach((x, y, z, c) => { if (fn(x, y, z, c)) hits.push(x, y, z); });
    for (let i = 0; i < hits.length; i += 3) this.del(hits[i], hits[i + 1], hits[i + 2]);
    return this;
  }
  mirrorX(axis = -1) {
    const add = [];
    this.forEach((x, y, z, c, glow) => { if (!this.has(axis - x, y, z)) add.push([axis - x, y, z, c, glow]); });
    for (const [x, y, z, c, glow] of add) this.set(x, y, z, c, glow);
    return this;
  }
  merge(other, dx = 0, dy = 0, dz = 0) { other.forEach((x, y, z, c, glow) => this.set(x + dx, y + dy, z + dz, c, glow)); return this; }
  get size() { let n = 0; for (let i = 0; i < this.vol.length; i++) if (this.vol[i]) n++; return n; }
  bounds() {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    this.forEach((x, y, z) => {
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    });
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }
}
/** DenseGrid shorthand: inclusive voxel box. */
export const dense = (x0, y0, z0, x1, y1, z1) => new DenseGrid(x0, y0, z0, x1, y1, z1);

export function buildGreedyAO(grid, opts = {}) {
  const scale = opts.scale ?? 0.1;
  const jitter = opts.jitter ?? 0.04;
  const useAO = opts.ao !== false;
  const skip = opts.skip ?? null; // face ids never seen: 0 +x, 1 -x, 2 +y, 3 -y, 4 +z, 5 -z
  const pivot = opts.pivot ?? 'bottom';
  const b = Array.isArray(pivot) && grid.vol ? null : grid.bounds();
  if (b && !isFinite(b.minX)) return new THREE.BufferGeometry();
  let px = 0, py = 0, pz = 0;
  if (Array.isArray(pivot)) [px, py, pz] = pivot;
  else if (pivot === 'bottom') { px = (b.minX + b.maxX + 1) / 2; py = b.minY; pz = (b.minZ + b.maxZ + 1) / 2; }
  else if (pivot === 'center') { px = (b.minX + b.maxX + 1) / 2; py = (b.minY + b.maxY + 1) / 2; pz = (b.minZ + b.maxZ + 1) / 2; }

  // dense volume with a 1-cell empty border: 0 = empty, else colour * 2 + glow + 1
  let min, size, str, vol;
  if (grid.vol) ({ min, dim: size, str, vol } = grid);
  else {
    min = [b.minX - 1, b.minY - 1, b.minZ - 1];
    size = [b.maxX - b.minX + 3, b.maxY - b.minY + 3, b.maxZ - b.minZ + 3];
    str = [size[1] * size[2], size[2], 1];
    vol = new Int32Array(size[0] * size[1] * size[2]);
    grid.forEach((x, y, z, c, glow) => { vol[(x - min[0]) * str[0] + (y - min[1]) * str[1] + (z - min[2])] = c * 2 + (glow ? 1 : 0) + 1; });
  }

  const P = new Buf(Float32Array, 3072), N = new Buf(Float32Array, 3072), C = new Buf(Float32Array, 3072);
  const IS = new Buf(Uint32Array, 1536), IG = new Buf(Uint32Array, 256);
  let vc = 0;
  const base = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const su = size[u], sv = size[v], sd = size[d];
    const stD = str[d], stU = str[u], stV = str[v];
    const mask = new Float64Array(su * sv);
    for (const dir of [1, -1]) {
      const fi = d * 2 + (dir > 0 ? 0 : 1);
      if (skip && skip.includes(fi)) continue;
      for (let s = 1; s < sd - 1; s++) {
        let any = false;
        mask.fill(0);
        for (let j = 1; j < sv - 1; j++) {
          let id = s * stD + j * stV + stU;
          let n = j * su + 1;
          for (let i = 1; i < su - 1; i++, id += stU, n++) {
            const a = vol[id];
            if (!a) continue;
            const nb = id + dir * stD;
            if (vol[nb]) continue;
            let ao = 255;
            if (useAO && !((a - 1) & 1)) {
              // corners (u-,v-) (u+,v-) (u+,v+) (u-,v+) sampled around the empty neighbour cell
              const uM = vol[nb - stU] ? 1 : 0, uP = vol[nb + stU] ? 1 : 0, vM = vol[nb - stV] ? 1 : 0, vP = vol[nb + stV] ? 1 : 0;
              const c00 = vol[nb - stU - stV] ? 1 : 0, c10 = vol[nb + stU - stV] ? 1 : 0, c11 = vol[nb + stU + stV] ? 1 : 0, c01 = vol[nb - stU + stV] ? 1 : 0;
              const a0 = uM && vM ? 0 : 3 - (uM + vM + c00);
              const a1 = uP && vM ? 0 : 3 - (uP + vM + c10);
              const a2 = uP && vP ? 0 : 3 - (uP + vP + c11);
              const a3 = uM && vP ? 0 : 3 - (uM + vP + c01);
              ao = a0 | (a1 << 2) | (a2 << 4) | (a3 << 6);
            }
            mask[n] = (a - 1) * 256 + ao + 1;
            any = true;
          }
        }
        if (!any) continue;
        for (let j = 1; j < sv - 1; j++)
          for (let i = 1, n = j * su + 1; i < su - 1; ) {
            const k = mask[n];
            if (!k) { i++; n++; continue; }
            let w = 1;
            while (i + w < su - 1 && mask[n + w] === k) w++;
            let h = 1;
            outer: while (j + h < sv - 1) {
              const row = n + h * su;
              for (let t = 0; t < w; t++) if (mask[row + t] !== k) break outer;
              h++;
            }
            const key = k - 1;
            const ao = key % 256;
            const cg = (key - ao) / 256;
            const glow = cg % 2 === 1;
            const c = (cg - (glow ? 1 : 0)) / 2;
            base[d] = s + (dir > 0 ? 1 : 0); base[u] = i; base[v] = j;
            const x0 = base[0], y0 = base[1], z0 = base[2];
            const jt = glow || !jitter ? 1 : 1 + (hash3(x0 + min[0], y0 + min[1], z0 + min[2] + fi) - 0.5) * 2 * jitter;
            const lc = linear(c);
            const du0 = u === 0 ? w : 0, du1 = u === 1 ? w : 0, du2 = u === 2 ? w : 0;
            const dv0 = v === 0 ? h : 0, dv1 = v === 1 ? h : 0, dv2 = v === 2 ? h : 0;
            const ox = min[0] - px, oy = min[1] - py, oz = min[2] - pz;
            P.need(12); N.need(12); C.need(12);
            const pa = P.a, na = N.a, ca = C.a;
            let o = P.n;
            pa[o] = (x0 + ox) * scale; pa[o + 1] = (y0 + oy) * scale; pa[o + 2] = (z0 + oz) * scale;
            pa[o + 3] = (x0 + du0 + ox) * scale; pa[o + 4] = (y0 + du1 + oy) * scale; pa[o + 5] = (z0 + du2 + oz) * scale;
            pa[o + 6] = (x0 + du0 + dv0 + ox) * scale; pa[o + 7] = (y0 + du1 + dv1 + oy) * scale; pa[o + 8] = (z0 + du2 + dv2 + oz) * scale;
            pa[o + 9] = (x0 + dv0 + ox) * scale; pa[o + 10] = (y0 + dv1 + oy) * scale; pa[o + 11] = (z0 + dv2 + oz) * scale;
            P.n += 12;
            const nx = d === 0 ? dir : 0, ny = d === 1 ? dir : 0, nz = d === 2 ? dir : 0;
            const A0 = ao & 3, A1 = (ao >> 2) & 3, A2 = (ao >> 4) & 3, A3 = (ao >> 6) & 3;
            for (let q = 0; q < 4; q++) {
              const l = glow ? 1 : AO_LEVELS[q === 0 ? A0 : q === 1 ? A1 : q === 2 ? A2 : A3] * jt;
              na[o] = nx; na[o + 1] = ny; na[o + 2] = nz;
              ca[o] = lc[0] * l; ca[o + 1] = lc[1] * l; ca[o + 2] = lc[2] * l;
              o += 3;
            }
            N.n += 12; C.n += 12;
            const T = glow ? IG : IS;
            T.need(6);
            const ia = T.a;
            let k6 = T.n;
            const flip = A0 + A2 < A1 + A3;
            const q0 = flip ? vc + 1 : vc, q1 = flip ? vc + 2 : vc + 1, q2 = flip ? vc + 3 : vc + 2, q3 = flip ? vc : vc + 3;
            if (dir > 0) { ia[k6++] = q0; ia[k6++] = q1; ia[k6++] = q2; ia[k6++] = q0; ia[k6++] = q2; ia[k6++] = q3; }
            else { ia[k6++] = q0; ia[k6++] = q2; ia[k6++] = q1; ia[k6++] = q0; ia[k6++] = q3; ia[k6++] = q2; }
            T.n = k6;
            vc += 4;
            for (let hh = 0; hh < h; hh++) mask.fill(0, n + hh * su, n + hh * su + w);
            i += w; n += w;
          }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P.a.slice(0, P.n), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N.a.slice(0, N.n), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(C.a.slice(0, C.n), 3));
  const ni = IS.n + IG.n;
  const index = vc > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  index.set(IS.view(), 0);
  index.set(IG.view(), IS.n);
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.addGroup(0, IS.n, 0);
  if (IG.n) geo.addGroup(IS.n, IG.n, 1);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.voxelSize = scale;
  geo.userData.dims = { w: (size[0] - 2) * scale, h: (size[1] - 2) * scale, d: (size[2] - 2) * scale };
  return geo;
}

const cache = new Map();
/** Cached greedy+AO geometry for a grid-producing function. */
export function aoGeometry(id, makeGrid, opts) {
  let g = cache.get(id);
  if (!g) {
    const grid = makeGrid();
    if (grid.dropped) console.warn(`voxmesh: ${id} dropped ${grid.dropped} voxels outside its DenseGrid box`);
    g = buildGreedyAO(grid, opts);
    cache.set(id, g);
  }
  return g;
}
/** Cached greedy+AO voxel mesh (casts shadows unless opts.noShadow). */
export function aoMesh(id, makeGrid, opts = {}, mats = Mats.pair) {
  const m = makeMesh(aoGeometry(id, makeGrid, opts), mats);
  if (opts.noShadow) m.castShadow = false;
  if (opts.receive) m.receiveShadow = true;
  return m;
}
