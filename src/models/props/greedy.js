// Greedy voxel mesher for large background scenery: merges coplanar faces
// of the same colour into big quads (no AO), cutting triangle counts by
// 5-20x compared to VoxGrid.build(). Output matches build(): groups
// [solid, glow] for Mats.pair, plus userData.dims.
import * as THREE from 'three';
import { hash3 } from '../../core/util.js';

export function buildGreedy(grid, opts = {}) {
  const scale = opts.scale ?? 0.1;
  const jitter = opts.jitter ?? 0.05;
  const shadeSides = opts.shadeSides ?? true;
  const b = grid.bounds();
  if (!isFinite(b.minX)) return new THREE.BufferGeometry();
  let px = 0, py = 0, pz = 0;
  const pivot = opts.pivot ?? 'bottom';
  if (Array.isArray(pivot)) [px, py, pz] = pivot;
  else if (pivot === 'bottom') { px = (b.minX + b.maxX + 1) / 2; py = b.minY; pz = (b.minZ + b.maxZ + 1) / 2; }
  else if (pivot === 'center') { px = (b.minX + b.maxX + 1) / 2; py = (b.minY + b.maxY + 1) / 2; pz = (b.minZ + b.maxZ + 1) / 2; }

  const min = [b.minX, b.minY, b.minZ];
  const size = [b.maxX - b.minX + 1, b.maxY - b.minY + 1, b.maxZ - b.minZ + 1];
  // dense key volume: 0 = empty, else (colour << 1 | glow) + 1
  const N = size[0] * size[1] * size[2];
  const vol = new Float64Array(N);
  const idx = (x, y, z) => (x * size[1] + y) * size[2] + z;
  grid.forEach((x, y, z, c, glow) => { vol[idx(x - min[0], y - min[1], z - min[2])] = c * 2 + (glow ? 1 : 0) + 1; });
  const at = (p) => {
    if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= size[0] || p[1] >= size[1] || p[2] >= size[2]) return 0;
    return vol[idx(p[0], p[1], p[2])];
  };

  const pos = [], nor = [], col = [], iS = [], iG = [];
  let vc = 0;
  const tmp = new THREE.Color();
  const sideShade = [0.92, 0.92, 1.0, 0.8, 0.96, 0.88]; // +x -x +y -y +z -z (subtle baked shading)
  const p = [0, 0, 0], q = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const mask = new Float64Array(size[u] * size[v]);
    for (const dir of [1, -1]) {
      for (let s = 0; s < size[d]; s++) {
        // build mask
        let n = 0;
        for (let j = 0; j < size[v]; j++)
          for (let i = 0; i < size[u]; i++) {
            p[d] = s; p[u] = i; p[v] = j;
            const a = at(p);
            q[0] = p[0]; q[1] = p[1]; q[2] = p[2]; q[d] += dir;
            mask[n++] = a && !at(q) ? a : 0;
          }
        // greedy rectangles
        n = 0;
        for (let j = 0; j < size[v]; j++)
          for (let i = 0; i < size[u]; ) {
            const k = mask[n];
            if (!k) { i++; n++; continue; }
            let w = 1;
            while (i + w < size[u] && mask[n + w] === k) w++;
            let h = 1, done = false;
            while (j + h < size[v]) {
              for (let t = 0; t < w; t++) if (mask[n + t + h * size[u]] !== k) { done = true; break; }
              if (done) break;
              h++;
            }
            // emit quad
            const key = k - 1;
            const glow = key % 2 === 1;
            const c = Math.floor(key / 2);
            const base = [0, 0, 0];
            base[d] = s + (dir > 0 ? 1 : 0); base[u] = i; base[v] = j;
            const du = [0, 0, 0], dv = [0, 0, 0];
            du[u] = w; dv[v] = h;
            const corners = [
              [base[0], base[1], base[2]],
              [base[0] + du[0], base[1] + du[1], base[2] + du[2]],
              [base[0] + du[0] + dv[0], base[1] + du[1] + dv[1], base[2] + du[2] + dv[2]],
              [base[0] + dv[0], base[1] + dv[1], base[2] + dv[2]],
            ];
            const fi = d * 2 + (dir > 0 ? 0 : 1);
            const jt = glow || !jitter ? 1 : 1 + (hash3(base[0] + min[0], base[1] + min[1], base[2] + min[2] + fi) - 0.5) * 2 * jitter;
            const l = glow ? 1 : jt * (shadeSides ? [sideShade[0], sideShade[1], sideShade[2], sideShade[3], sideShade[4], sideShade[5]][[0, 1, 2, 3, 4, 5][fi === 0 ? 0 : fi === 1 ? 1 : fi === 2 ? 2 : fi === 3 ? 3 : fi === 4 ? 4 : 5]] : 1);
            tmp.setHex(c);
            const nx = [0, 0, 0]; nx[d] = dir;
            for (const cr of corners) {
              pos.push((cr[0] + min[0] - px) * scale, (cr[1] + min[1] - py) * scale, (cr[2] + min[2] - pz) * scale);
              nor.push(nx[0], nx[1], nx[2]);
              col.push(tmp.r * l, tmp.g * l, tmp.b * l);
            }
            const tgt = glow ? iG : iS;
            if (dir > 0) tgt.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
            else tgt.push(vc, vc + 2, vc + 1, vc, vc + 3, vc + 2);
            vc += 4;
            for (let hh = 0; hh < h; hh++) for (let t = 0; t < w; t++) mask[n + t + hh * size[u]] = 0;
            i += w; n += w;
          }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const index = iS.concat(iG);
  geo.setIndex(vc > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
  geo.addGroup(0, iS.length, 0);
  if (iG.length) geo.addGroup(iS.length, iG.length, 1);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.userData.voxelSize = scale;
  geo.userData.dims = { w: size[0] * scale, h: size[1] * scale, d: size[2] * scale };
  return geo;
}

const cache = new Map();
export function greedyGeometry(id, makeGrid, opts) {
  let g = cache.get(id);
  if (!g) { g = buildGreedy(makeGrid(), opts); cache.set(id, g); }
  return g;
}
