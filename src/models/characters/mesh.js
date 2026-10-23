// Greedy voxel mesher with ambient occlusion for the hi-res character parts.
//
// Like VoxGrid.build() (per-vertex AO, [solid, glow] groups for Mats.pair) but
// coplanar faces with the same colour and a uniform AO are merged into big
// quads, so the fine 0.025-unit sculpted characters stay cheap to draw.
// Faces whose four AO corners differ are emitted one by one (merging them would
// smear the occlusion across the quad).
import * as THREE from 'three';

const AO_LEVELS = [0.56, 0.72, 0.87, 1.0];

/**
 * @param {import('../../core/voxel.js').VoxGrid} grid
 * @param {{ scale?: number, pivot?: number[], ao?: boolean }} opts
 */
export function meshAO(grid, opts = {}) {
  const scale = opts.scale ?? 0.025;
  const [px, py, pz] = opts.pivot ?? [0, 0, 0];
  const useAO = opts.ao !== false;
  const b = grid.bounds();
  if (!isFinite(b.minX)) return null;
  // padded dense volume: 0 = empty, else colour * 2 + glow + 1
  const min = [b.minX - 1, b.minY - 1, b.minZ - 1];
  const size = [b.maxX - b.minX + 3, b.maxY - b.minY + 3, b.maxZ - b.minZ + 3];
  const str = [size[1] * size[2], size[2], 1];
  const vol = new Int32Array(size[0] * size[1] * size[2]);
  grid.forEach((x, y, z, c, glow) => {
    vol[(x - min[0]) * str[0] + (y - min[1]) * str[1] + (z - min[2])] = (c & 0xffffff) * 2 + (glow ? 1 : 0) + 1;
  });

  const pos = [], nor = [], col = [], iS = [], iG = [];
  let vc = 0;
  const tmp = new THREE.Color();
  const q = [0, 0, 0];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3, v = (d + 2) % 3;
    const su = size[u], sv = size[v], sd = size[d];
    const stD = str[d], stU = str[u], stV = str[v];
    const key = new Int32Array(su * sv); // voxel key of the exposed face (0 = none)
    const aoM = new Uint8Array(su * sv); // packed AO (4 x 2 bits)
    for (const dir of [1, -1]) {
      const n = [0, 0, 0];
      n[d] = dir;
      for (let s = 1; s < sd - 1; s++) {
        let any = false;
        for (let j = 0; j < sv; j++) {
          let id = s * stD + j * stV;
          for (let i = 0; i < su; i++, id += stU) {
            const k = j * su + i;
            const a = vol[id];
            if (!a || vol[id + dir * stD]) { key[k] = 0; continue; }
            key[k] = a;
            any = true;
            if (!useAO || (a - 1) & 1) { aoM[k] = 0xff; continue; }
            // AO from the slice in front of the face
            const f = id + dir * stD;
            const sU0 = i > 0 && vol[f - stU] ? 1 : 0, sU1 = i < su - 1 && vol[f + stU] ? 1 : 0;
            const sV0 = j > 0 && vol[f - stV] ? 1 : 0, sV1 = j < sv - 1 && vol[f + stV] ? 1 : 0;
            const c00 = i > 0 && j > 0 && vol[f - stU - stV] ? 1 : 0, c10 = i < su - 1 && j > 0 && vol[f + stU - stV] ? 1 : 0;
            const c11 = i < su - 1 && j < sv - 1 && vol[f + stU + stV] ? 1 : 0, c01 = i > 0 && j < sv - 1 && vol[f - stU + stV] ? 1 : 0;
            const ao = (s1, s2, c) => (s1 && s2 ? 0 : 3 - (s1 + s2 + c));
            // corners: (0,0) (1,0) (1,1) (0,1) in (u,v)
            aoM[k] = ao(sU0, sV0, c00) | (ao(sU1, sV0, c10) << 2) | (ao(sU1, sV1, c11) << 4) | (ao(sU0, sV1, c01) << 6);
          }
        }
        if (!any) continue;
        for (let j = 0; j < sv; j++)
          for (let i = 0; i < su; ) {
            const k0 = j * su + i;
            const kk = key[k0];
            if (!kk) { i++; continue; }
            const ao = aoM[k0];
            const uniform = ao === 0 || ao === 0x55 || ao === 0xaa || ao === 0xff;
            let w = 1, h = 1;
            if (uniform) {
              while (i + w < su && key[k0 + w] === kk && aoM[k0 + w] === ao) w++;
              outer: while (j + h < sv) {
                const row = k0 + h * su;
                for (let t = 0; t < w; t++) if (key[row + t] !== kk || aoM[row + t] !== ao) break outer;
                h++;
              }
            }
            for (let jj = 0; jj < h; jj++) key.fill(0, k0 + jj * su, k0 + jj * su + w);
            const glow = ((kk - 1) & 1) === 1;
            const c = (kk - 1 - (glow ? 1 : 0)) / 2;
            tmp.setHex(c);
            q[d] = s + (dir > 0 ? 1 : 0) + min[d]; q[u] = i + min[u]; q[v] = j + min[v];
            const corners = [[0, 0], [w, 0], [w, h], [0, h]];
            const aos = [ao & 3, (ao >> 2) & 3, (ao >> 4) & 3, (ao >> 6) & 3];
            for (let ci = 0; ci < 4; ci++) {
              const p = [q[0], q[1], q[2]];
              p[u] += corners[ci][0]; p[v] += corners[ci][1];
              pos.push((p[0] - px) * scale, (p[1] - py) * scale, (p[2] - pz) * scale);
              nor.push(n[0], n[1], n[2]);
              const l = glow ? 1 : AO_LEVELS[aos[ci]];
              col.push(tmp.r * l, tmp.g * l, tmp.b * l);
            }
            const tgt = glow ? iG : iS;
            const v0 = vc;
            const flip = aos[0] + aos[2] < aos[1] + aos[3];
            if (dir > 0) {
              if (flip) tgt.push(v0 + 1, v0 + 2, v0 + 3, v0 + 1, v0 + 3, v0);
              else tgt.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
            } else if (flip) tgt.push(v0 + 1, v0, v0 + 3, v0 + 1, v0 + 3, v0 + 2);
            else tgt.push(v0, v0 + 2, v0 + 1, v0, v0 + 3, v0 + 2);
            vc += 4;
            i += w;
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
  return geo;
}
