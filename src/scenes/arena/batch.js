// Static batching: bake a group of (voxel) meshes into a handful of merged meshes,
// split into spatial chunks for frustum culling. Meshes whose material can't be
// merged (textures, transparency, metal) are kept as-is with their world transform.
import * as THREE from 'three';
import { Mats } from '../../core/voxel.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _c = new THREE.Color();
const _wp = new THREE.Vector3();

function classify(mat) {
  if (!mat) return null;
  if (mat === Mats.solid) return 'solid';
  if (mat === Mats.glow) return 'glow';
  if (mat.map || mat.transparent || mat.alphaTest > 0 || mat.envMap) return null;
  if (mat.isMeshLambertMaterial) {
    if (mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0.01) return null;
    return 'solid';
  }
  if (mat.isMeshBasicMaterial) return 'glow';
  return null;
}

class Acc {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
    this.n = 0;
  }
  add(geo, start, count, matrix, mat) {
    const P = geo.attributes.position, N = geo.attributes.normal, C = geo.attributes.color;
    const useVC = !!(C && (mat.vertexColors || mat === Mats.solid || mat === Mats.glow));
    const mc = mat.color || _c.setRGB(1, 1, 1);
    _nm.getNormalMatrix(matrix);
    const flip = matrix.determinant() < 0;
    const index = geo.index ? geo.index.array : null;
    const remap = new Map();
    const tri = [];
    const end = start + count;
    for (let k = start; k < end; k++) {
      const vi = index ? index[k] : k;
      let ni = remap.get(vi);
      if (ni === undefined) {
        ni = this.n++;
        remap.set(vi, ni);
        _v.fromBufferAttribute(P, vi).applyMatrix4(matrix);
        this.pos.push(_v.x, _v.y, _v.z);
        if (N) _n.fromBufferAttribute(N, vi).applyMatrix3(_nm).normalize();
        else _n.set(0, 1, 0);
        this.nor.push(_n.x, _n.y, _n.z);
        if (useVC) this.col.push(C.getX(vi) * mc.r, C.getY(vi) * mc.g, C.getZ(vi) * mc.b);
        else this.col.push(mc.r, mc.g, mc.b);
      }
      tri.push(ni);
      if (tri.length === 3) {
        if (flip) this.idx.push(tri[0], tri[2], tri[1]);
        else this.idx.push(tri[0], tri[1], tri[2]);
        tri.length = 0;
      }
    }
  }
}

function buildGeo(solid, glow) {
  const pos = solid.pos.concat(glow.pos);
  const nor = solid.nor.concat(glow.nor);
  const col = solid.col.concat(glow.col);
  const off = solid.n;
  const idx = solid.idx.slice();
  for (const i of glow.idx) idx.push(i + off);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = solid.n + glow.n;
  g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.addGroup(0, solid.idx.length, 0);
  if (glow.idx.length) g.addGroup(solid.idx.length, glow.idx.length, 1);
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

/**
 * Bake all static meshes under `group` (world space) into merged chunk meshes.
 * Returns a new Group to add to the scene (the input group is emptied of kept meshes).
 */
export function bake(group, opts = {}) {
  const chunk = opts.chunk ?? 20;
  group.updateMatrixWorld(true);
  const buckets = new Map();
  const keep = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    if (o.isInstancedMesh || o.userData.noBake || !o.visible) {
      keep.push(o);
      return;
    }
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = o.geometry;
    if (!g || !g.attributes.position) return;
    const groups = g.groups.length
      ? g.groups
      : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
    if (groups.some((gr) => !classify(mats[gr.materialIndex ?? 0] ?? mats[0]))) {
      keep.push(o);
      return;
    }
    o.getWorldPosition(_wp);
    const key = Math.floor(_wp.x / chunk) + ',' + Math.floor(_wp.z / chunk) + (o.castShadow === false ? ':ns' : '');
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { solid: new Acc(), glow: new Acc(), cast: o.castShadow !== false }));
    for (const gr of groups) {
      const mat = mats[gr.materialIndex ?? 0] ?? mats[0];
      b[classify(mat)].add(g, gr.start, gr.count, o.matrixWorld, mat);
    }
  });
  const out = new THREE.Group();
  out.name = (group.name || 'static') + ':baked';
  for (const b of buckets.values()) {
    if (!b.solid.n && !b.glow.n) continue;
    const m = new THREE.Mesh(buildGeo(b.solid, b.glow), Mats.pair);
    m.castShadow = b.cast && opts.cast !== false;
    m.receiveShadow = opts.receive !== false;
    m.matrixAutoUpdate = false;
    m.userData.disposable = true;
    out.add(m);
  }
  for (const k of keep) out.attach(k);
  return out;
}
