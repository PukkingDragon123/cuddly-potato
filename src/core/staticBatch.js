// Static batching: merges the meshes of a big, mostly still scene graph (Beast Island)
// into one draw per (cluster, material, shadow flags), so hundreds of little voxel props
// cost a handful of draw calls instead of one (plus one more in the shadow pass) each.
//
// Nothing has to declare itself static. The batcher snapshots every node (transform,
// visibility, parent, material, geometry, instance buffers) and checks those snapshots
// every frame (a few float compares per node). The moment anything changes, that node's
// whole subtree is handed back to normal rendering and the batches it was part of are
// rebuilt without it, so animations, unlocks and swaps keep working exactly as before.
// A short warm-up probe (the caller's update function run for a few simulated seconds)
// finds the always-moving parts up front so they are never merged at all.
//
// Merged originals stay in the graph (matrices, hotspots and later changes keep working)
// but are hidden from every camera with layers.mask = 0 (no game code uses layers).
//
//   const sb = batchStatic(root, { probe: (dt, t) => island.update(dt, t) });
//   each frame, after the scene's own update: sb.check();   on teardown: sb.dispose();
import * as THREE from 'three';

const ATTRS = ['position', 'normal', 'color', 'uv'];
const ITEM = { position: 3, normal: 3, color: 3, uv: 2 };
const BASE_OBR = THREE.Object3D.prototype.onBeforeRender;
const BASE_OAR = THREE.Object3D.prototype.onAfterRender;
const BASE_OBC = THREE.Material.prototype.onBeforeCompile;
const SNAP = 13; // floats per node snapshot

const _m = new THREE.Matrix4();
const _im = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();

function materialOk(m) {
  return m && !m.transparent && !m.isShaderMaterial && !m.isRawShaderMaterial && m.onBeforeCompile === BASE_OBC && !m.alphaHash && m.visible !== false;
}

function geometryOk(g) {
  if (!g?.isBufferGeometry || !g.attributes.position || g.attributes.position.itemSize !== 3) return false;
  for (const k in g.morphAttributes) if (g.morphAttributes[k].length) return false;
  for (const k in g.attributes) {
    const a = g.attributes[k];
    if (!ITEM[k] || a.isInterleavedBufferAttribute || a.normalized) return false;
    if (k === 'color' ? a.itemSize !== 3 && a.itemSize !== 4 : a.itemSize !== ITEM[k]) return false;
  }
  return true;
}

// a piece's vertex range: the source vertices it uses + its triangles re-indexed into them
// (cached while a build pass runs: instanced props repeat the same range per instance)
let rangeCache = new Map();
function rangeOf(p) {
  const g = p.geo;
  let m = rangeCache.get(g);
  if (!m) rangeCache.set(g, (m = new Map()));
  const k = p.start + ':' + p.count;
  let r = m.get(k);
  if (r) return r;
  if (g.index) {
    const idx = g.index.array, remap = new Map(), local = new Uint32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const v = idx[p.start + i];
      let l = remap.get(v);
      if (l === undefined) remap.set(v, (l = remap.size));
      local[i] = l;
    }
    r = { verts: Int32Array.from(remap.keys()), local };
  } else {
    const verts = new Int32Array(p.count), local = new Uint32Array(p.count);
    for (let i = 0; i < p.count; i++) { verts[i] = p.start + i; local[i] = i; }
    r = { verts, local };
  }
  m.set(k, r);
  return r;
}

function freeArray() {
  this.array = null;
}

class StaticBatcher {
  constructor(root, o = {}) {
    this.root = root;
    // instanced props are baked into the batches only when small (it copies their vertices)
    this.maxInstVerts = o.maxInstVerts ?? 3000;
    this.cell = o.cell ?? 28; // merged meshes are clustered on a ground grid of this size
    this.batches = new Map(); // key -> { key, mat, cast, recv, attrs, pieces: [], mesh }
    this.objPieces = new Map(); // batched object -> [pieces]
    this.hidden = new Map(); // object -> original layers mask
    this.dynamic = new Set();
    this.group = new THREE.Group();
    this.group.name = 'staticBatches';
    this.stats = { batches: 0, objects: 0, pieces: 0, unbatched: 0, ms: 0 };
    const t0 = performance.now();
    // 1) warm-up probe: whatever moves within a few simulated seconds is dynamic from the start
    root.updateMatrixWorld(true);
    this.snapshot();
    if (o.probe) {
      let t = o.probeT0 ?? 1000;
      for (let i = 0; i < (o.probeSteps ?? 48); i++) {
        const dt = i % 12 === 11 ? 1.7 : 1 / 30;
        t += dt;
        try { o.probe(dt, t); } catch (e) { break; }
        this.diff(false);
      }
    }
    this.stats.probeMs = Math.round(performance.now() - t0);
    // 2) gather pieces of everything still and mergeable, grouped per cluster + material
    root.updateMatrixWorld(true);
    _im.copy(root.matrixWorld).invert();
    const cand = new Map(); // obj -> pieces
    for (const top of root.children) this.gather(top, top, cand);
    this.stats.gatherMs = Math.round(performance.now() - t0) - this.stats.probeMs;
    // 3) keep only batches that merge 2+ objects (they save draws), and only objects whose
    //    every piece lands in such a batch (an object is hidden as a whole)
    let changed = true;
    const counts = new Map();
    while (changed) {
      changed = false;
      counts.clear();
      for (const pcs of cand.values()) {
        const seen = new Set();
        for (const p of pcs) if (!seen.has(p.key)) { seen.add(p.key); counts.set(p.key, (counts.get(p.key) ?? 0) + 1); }
      }
      for (const [obj, pcs] of cand) {
        if (pcs.some((p) => (counts.get(p.key) ?? 0) < 2)) { cand.delete(obj); changed = true; }
      }
    }
    for (const [obj, pcs] of cand) {
      for (const p of pcs) {
        let b = this.batches.get(p.key);
        if (!b) this.batches.set(p.key, (b = { key: p.key, mat: p.mat, cast: obj.castShadow, recv: obj.receiveShadow, attrs: p.attrs, pieces: [], mesh: null }));
        b.pieces.push(p);
      }
      this.objPieces.set(obj, pcs);
    }
    const tb = performance.now();
    for (const b of this.batches.values()) this.build(b);
    rangeCache = new Map();
    this.stats.buildMs = Math.round(performance.now() - tb);
    for (const obj of this.objPieces.keys()) { this.hidden.set(obj, obj.layers.mask); obj.layers.mask = 0; }
    root.add(this.group);
    this.stats.batches = this.batches.size;
    this.stats.objects = this.objPieces.size;
    this.stats.pieces = [...this.batches.values()].reduce((a, b) => a + b.pieces.length, 0);
    this.stats.ms = Math.round(performance.now() - t0);
    this.snapshot();
  }

  /** Collect mergeable pieces under `o` (cluster = the root's direct child it belongs to). */
  gather(o, top, cand) {
    // hidden subtrees stay out (if they are shown later, that change unbatches nothing and they render normally)
    if (this.dynamic.has(o) || o.layers.mask !== 1 || !o.visible) return;
    if (o.isMesh) this.piecesOf(o, top, cand);
    for (const c of o.children) this.gather(c, top, cand);
  }
  piecesOf(o, top, cand) {
    if (o.isSkinnedMesh || o.isBatchedMesh || o.morphTargetInfluences || o.renderOrder !== 0) return;
    if (o.onBeforeRender !== BASE_OBR || o.onAfterRender !== BASE_OAR || o.customDepthMaterial || o.customDistanceMaterial) return;
    if (!o.isInstancedMesh && o.frustumCulled === false) return;
    const g = o.geometry;
    if (!geometryOk(g) || g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const pos = g.attributes.position;
    const ranges = [];
    const total = g.index ? g.index.count : pos.count;
    if (Array.isArray(o.material)) {
      if (!g.groups.length) return;
      for (const gr of g.groups) {
        const m = mats[gr.materialIndex];
        if (!m) continue;
        ranges.push({ m, start: gr.start, count: Math.min(gr.count, total - gr.start) });
      }
    } else ranges.push({ m: mats[0], start: 0, count: total });
    if (!ranges.length || ranges.some((r) => !materialOk(r.m))) return;
    let insts = [-1];
    if (o.isInstancedMesh) {
      if (!o.count || o.count * pos.count > this.maxInstVerts) return;
      if (o.instanceColor && !(g.attributes.color && ranges.every((r) => r.m.vertexColors))) return;
      insts = [...Array(o.count).keys()];
    }
    const attrs = ATTRS.filter((k) => g.attributes[k]).map((k) => k + (k === 'color' ? g.attributes.color.itemSize : '')).join(',');
    o.updateWorldMatrix(true, false);
    // cluster on a ground grid (by each piece's centre) so the merged meshes still
    // frustum-cull (main camera and the sun's shadow box) about as well as the originals
    if (!g.boundingSphere) g.computeBoundingSphere();
    const base = new THREE.Matrix4().multiplyMatrices(_im, o.matrixWorld);
    const pcs = [];
    for (const i of insts) {
      const mat = base.clone();
      if (i >= 0) { o.getMatrixAt(i, _m); mat.multiply(_m); }
      _v.copy(g.boundingSphere.center).applyMatrix4(mat);
      const cluster = `${Math.floor(_v.x / this.cell)}_${Math.floor(_v.z / this.cell)}`;
      const col = i >= 0 && o.instanceColor ? o.getColorAt(i, new THREE.Color()) : null;
      for (const r of ranges) {
        if (r.count <= 0) continue;
        const key = `${cluster}|${r.m.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${attrs}`;
        pcs.push({ obj: o, key, mat: r.m, attrs, geo: g, start: r.start, count: r.count, matrix: mat, col, inst: i >= 0 });
      }
    }
    if (pcs.length) cand.set(o, pcs);
  }

  /** (Re)build a batch's merged geometry from its pieces, in root space. */
  build(b) {
    const names = ATTRS.filter((k) => b.attrs.includes(k));
    const csz = b.attrs.includes('color4') ? 4 : 3;
    // each piece copies only the vertices its index range uses (compacted, cached per range)
    const ranges = b.pieces.map((p) => rangeOf(p));
    let nv = 0, ni = 0;
    for (const r of ranges) { nv += r.verts.length; ni += r.local.length; }
    const out = {};
    // normals as normalized bytes (voxel normals are axis-aligned): a quarter of the memory
    for (const k of names) out[k] = k === 'normal' ? new Int8Array(nv * 3) : new Float32Array(nv * (k === 'color' ? csz : ITEM[k]));
    const index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    const P = out.position, N = out.normal, C = out.color, U = out.uv;
    b.pieces.forEach((p, pi) => {
      const g = p.geo, { verts, local } = ranges[pi];
      const e = p.matrix.elements;
      _nm.getNormalMatrix(p.matrix);
      const ne = _nm.elements;
      const flip = p.matrix.determinant() < 0;
      const sp = g.attributes.position.array, sn = g.attributes.normal?.array, sc = g.attributes.color?.array, su = g.attributes.uv?.array;
      const scs = g.attributes.color?.itemSize ?? 3;
      const cr = p.col ? p.col.r : 1, cg = p.col ? p.col.g : 1, cb = p.col ? p.col.b : 1;
      for (let j = 0, n = verts.length; j < n; j++) {
        const s = verts[j], d = vo + j;
        const x = sp[s * 3], y = sp[s * 3 + 1], z = sp[s * 3 + 2];
        P[d * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
        P[d * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        P[d * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        if (N) {
          const a = sn[s * 3], bq = sn[s * 3 + 1], c = sn[s * 3 + 2];
          const nx = ne[0] * a + ne[3] * bq + ne[6] * c, ny = ne[1] * a + ne[4] * bq + ne[7] * c, nz = ne[2] * a + ne[5] * bq + ne[8] * c;
          const l = 127 / (Math.sqrt(nx * nx + ny * ny + nz * nz) || 1);
          N[d * 3] = Math.round(nx * l); N[d * 3 + 1] = Math.round(ny * l); N[d * 3 + 2] = Math.round(nz * l);
        }
        if (C) {
          C[d * csz] = sc[s * scs] * cr; C[d * csz + 1] = sc[s * scs + 1] * cg; C[d * csz + 2] = sc[s * scs + 2] * cb;
          if (csz === 4) C[d * 4 + 3] = sc[s * 4 + 3];
        }
        if (U) { U[d * 2] = su[s * 2]; U[d * 2 + 1] = su[s * 2 + 1]; }
      }
      for (let k = 0, n = local.length; k < n; k += 3) {
        index[io++] = vo + local[k];
        if (flip) { index[io++] = vo + local[k + 2]; index[io++] = vo + local[k + 1]; } else { index[io++] = vo + local[k + 1]; index[io++] = vo + local[k + 2]; }
      }
      vo += verts.length;
    });
    const geo = new THREE.BufferGeometry();
    for (const k of names) geo.setAttribute(k, new THREE.BufferAttribute(out[k], k === 'color' ? csz : ITEM[k], k === 'normal'));
    geo.setIndex(new THREE.BufferAttribute(io === index.length ? index : index.slice(0, io), 1));
    // bounds straight from the typed array (the BufferAttribute getters are slow on cold JIT)
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < P.length; i += 3) {
      const x = P[i], y = P[i + 1], z = P[i + 2];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
    let r2 = 0;
    for (let i = 0; i < P.length; i += 3) {
      const dx = P[i] - cx, dy = P[i + 1] - cy, dz = P[i + 2] - cz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d > r2) r2 = d;
    }
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, cy, cz), Math.sqrt(r2));
    // the GPU keeps the only copy: drop the JS arrays once uploaded (rebuilds start from the
    // original pieces, never from these)
    for (const a of [...Object.values(geo.attributes), geo.index]) a.onUpload(freeArray);
    if (b.mesh) {
      b.mesh.geometry.dispose();
      b.mesh.geometry = geo;
    } else {
      b.mesh = new THREE.Mesh(geo, b.mat);
      b.mesh.name = 'staticBatch';
      b.mesh.castShadow = b.cast;
      b.mesh.receiveShadow = b.recv;
      b.mesh.matrixAutoUpdate = false;
      this.group.add(b.mesh);
    }
  }

  /** Give an object back to normal rendering (its batches are rebuilt by the caller). */
  unbatchObject(obj, restore = true) {
    const pcs = this.objPieces.get(obj);
    if (!pcs) return null;
    this.objPieces.delete(obj);
    if (restore && this.hidden.has(obj)) { obj.layers.mask = this.hidden.get(obj); this.hidden.delete(obj); }
    const keys = new Set();
    for (const p of pcs) {
      const b = this.batches.get(p.key);
      if (!b) continue;
      b.pieces = b.pieces.filter((q) => q.obj !== obj);
      keys.add(p.key);
    }
    return keys;
  }

  /** Watch every node that is not (yet) known to be dynamic. */
  snapshot() {
    const nodes = (this.nodes = []);
    const index = (this.index = new Map());
    const walk = (o) => {
      if (o === this.group || this.dynamic.has(o)) return;
      index.set(o, nodes.length);
      nodes.push(o);
      for (const c of o.children) walk(c);
    };
    walk(this.root);
    this.snap = new Float64Array(nodes.length * SNAP);
    this.refs = new Array(nodes.length * 3);
    for (let i = 0; i < nodes.length; i++) this.write(i);
  }
  write(i) {
    const o = this.nodes[i], s = this.snap, k = i * SNAP;
    s[k] = o.position.x; s[k + 1] = o.position.y; s[k + 2] = o.position.z;
    s[k + 3] = o.quaternion.x; s[k + 4] = o.quaternion.y; s[k + 5] = o.quaternion.z; s[k + 6] = o.quaternion.w;
    s[k + 7] = o.scale.x; s[k + 8] = o.scale.y; s[k + 9] = o.scale.z;
    s[k + 10] = o.visible ? 1 : 0;
    s[k + 11] = o.isInstancedMesh ? o.instanceMatrix.version * 4096 + o.count : 0;
    s[k + 12] = o.isInstancedMesh && o.instanceColor ? o.instanceColor.version : 0;
    this.refs[i * 3] = o.parent;
    this.refs[i * 3 + 1] = o.material;
    this.refs[i * 3 + 2] = o.geometry;
  }
  changed(i) {
    const o = this.nodes[i], s = this.snap, k = i * SNAP;
    return s[k] !== o.position.x || s[k + 1] !== o.position.y || s[k + 2] !== o.position.z ||
      s[k + 3] !== o.quaternion.x || s[k + 4] !== o.quaternion.y || s[k + 5] !== o.quaternion.z || s[k + 6] !== o.quaternion.w ||
      s[k + 7] !== o.scale.x || s[k + 8] !== o.scale.y || s[k + 9] !== o.scale.z ||
      s[k + 10] !== (o.visible ? 1 : 0) ||
      (o.isInstancedMesh && (s[k + 11] !== o.instanceMatrix.version * 4096 + o.count || s[k + 12] !== (o.instanceColor ? o.instanceColor.version : 0))) ||
      this.refs[i * 3] !== o.parent || this.refs[i * 3 + 1] !== o.material || this.refs[i * 3 + 2] !== o.geometry;
  }
  /** Mark changed nodes (and their subtrees) dynamic. Returns the batch keys to rebuild. */
  diff(apply = true) {
    const nodes = this.nodes;
    let dirty = null;
    for (let i = 0; i < nodes.length; i++) {
      const o = nodes[i];
      if (!o || !this.changed(i)) continue;
      if (o === this.root) { this.write(i); continue; } // the whole island moving keeps the batches valid
      // this node now moves (or changed): it and everything under it render normally from now
      // on, and are no longer watched
      o.traverse((d) => {
        const j = this.index.get(d);
        if (j !== undefined) nodes[j] = null;
        if (this.dynamic.has(d)) return;
        this.dynamic.add(d);
        if (apply) {
          const keys = this.unbatchObject(d);
          if (keys) { this.stats.unbatched++; dirty ??= new Set(); for (const k of keys) dirty.add(k); }
        }
      });
    }
    return dirty;
  }

  /** Per frame, after the scene's own update. */
  check() {
    if (!this.nodes) return;
    const dirty = this.diff(true);
    if (!dirty) return;
    for (const k of dirty) {
      const b = this.batches.get(k);
      if (!b) continue;
      if (new Set(b.pieces.map((p) => p.obj)).size < 2 || !b.pieces.length) {
        // too few left to be worth a batch: give the rest back too
        for (const p of [...b.pieces]) {
          const more = this.unbatchObject(p.obj);
          if (more) for (const k2 of more) if (k2 !== k) dirty.add(k2);
        }
        b.mesh?.removeFromParent();
        b.mesh?.geometry.dispose();
        this.batches.delete(k);
      }
    }
    for (const k of dirty) { const b = this.batches.get(k); if (b) this.build(b); }
    rangeCache = new Map();
  }

  dispose() {
    for (const [obj, mask] of this.hidden) obj.layers.mask = mask;
    this.hidden.clear();
    for (const b of this.batches.values()) b.mesh?.geometry.dispose();
    this.batches.clear();
    this.group.removeFromParent();
    this.nodes = null;
  }
}

/** Returns the batcher (call check() every frame, dispose() on teardown), or null with ?batch=0. */
export function batchStatic(root, opts) {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('batch') === '0') return null;
  return new StaticBatcher(root, opts);
}
