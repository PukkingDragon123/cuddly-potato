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
  const str = [size[1] * size[2], size[2], 1];
  // dense key volume: 0 = empty, else (colour * 2 + glow) + 1
  const vol = new Float64Array(size[0] * size[1] * size[2]);
  grid.forEach((x, y, z, c, glow) => { vol[(x - min[0]) * str[0] + (y - min[1]) * str[1] + (z - min[2])] = c * 2 + (glow ? 1 : 0) + 1; });

  const pos = [], nor = [], col = [], iS = [], iG = [];
  let vc = 0;
  const tmp = new THREE.Color();
  const sideShade = [0.92, 0.92, 1.0, 0.8, 0.96, 0.88]; // +x -x +y -y +z -z
  const base = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const su = size[u], sv = size[v], sd = size[d];
    const stD = str[d], stU = str[u], stV = str[v];
    const mask = new Float64Array(su * sv);
    for (const dir of [1, -1]) {
      const fi = d * 2 + (dir > 0 ? 0 : 1);
      for (let s = 0; s < sd; s++) {
        const nIn = s + dir >= 0 && s + dir < sd;
        let n = 0;
        let any = false;
        for (let j = 0; j < sv; j++) {
          let id = s * stD + j * stV;
          for (let i = 0; i < su; i++, id += stU) {
            const a = vol[id];
            const m = a && !(nIn && vol[id + dir * stD]) ? a : 0;
            mask[n++] = m;
            if (m) any = true;
          }
        }
        if (!any) continue;
        n = 0;
        for (let j = 0; j < sv; j++)
          for (let i = 0; i < su; ) {
            const k = mask[n];
            if (!k) { i++; n++; continue; }
            let w = 1;
            while (i + w < su && mask[n + w] === k) w++;
            let h = 1;
            outer: while (j + h < sv) {
              const row = n + h * su;
              for (let t = 0; t < w; t++) if (mask[row + t] !== k) break outer;
              h++;
            }
            const key = k - 1;
            const glow = key % 2 === 1;
            const c = (key - (glow ? 1 : 0)) / 2;
            base[d] = s + (dir > 0 ? 1 : 0); base[u] = i; base[v] = j;
            const x0 = base[0], y0 = base[1], z0 = base[2];
            const jt = glow || !jitter ? 1 : 1 + (hash3(x0 + min[0], y0 + min[1], z0 + min[2] + fi) - 0.5) * 2 * jitter;
            const l = glow ? 1 : jt * (shadeSides ? sideShade[fi] : 1);
            tmp.setHex(c);
            const cr = tmp.r * l, cg = tmp.g * l, cb = tmp.b * l;
            const du0 = u === 0 ? w : 0, du1 = u === 1 ? w : 0, du2 = u === 2 ? w : 0;
            const dv0 = v === 0 ? h : 0, dv1 = v === 1 ? h : 0, dv2 = v === 2 ? h : 0;
            const ox = min[0] - px, oy = min[1] - py, oz = min[2] - pz;
            pos.push(
              (x0 + ox) * scale, (y0 + oy) * scale, (z0 + oz) * scale,
              (x0 + du0 + ox) * scale, (y0 + du1 + oy) * scale, (z0 + du2 + oz) * scale,
              (x0 + du0 + dv0 + ox) * scale, (y0 + du1 + dv1 + oy) * scale, (z0 + du2 + dv2 + oz) * scale,
              (x0 + dv0 + ox) * scale, (y0 + dv1 + oy) * scale, (z0 + dv2 + oz) * scale,
            );
            const nx = d === 0 ? dir : 0, ny = d === 1 ? dir : 0, nz = d === 2 ? dir : 0;
            for (let q = 0; q < 4; q++) { nor.push(nx, ny, nz); col.push(cr, cg, cb); }
            const tgt = glow ? iG : iS;
            if (dir > 0) tgt.push(vc, vc + 1, vc + 2, vc, vc + 2, vc + 3);
            else tgt.push(vc, vc + 2, vc + 1, vc, vc + 3, vc + 2);
            vc += 4;
            for (let hh = 0; hh < h; hh++) mask.fill(0, n + hh * su, n + hh * su + w);
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
