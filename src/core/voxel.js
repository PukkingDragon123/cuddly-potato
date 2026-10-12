// Voxel modelling toolkit: build models on a sparse integer grid with
// primitive brushes, then bake into a face-culled BufferGeometry with
// per-vertex ambient occlusion and subtle colour jitter.
import * as THREE from 'three';
import { hash3, shade } from './util.js';

const OFF = 512;
const key = (x, y, z) => ((x + OFF) << 20) | ((y + OFF) << 10) | (z + OFF);
const unkey = (k) => [((k >> 20) & 1023) - OFF, ((k >> 10) & 1023) - OFF, (k & 1023) - OFF];

export const VOX = 0.1; // default world size of one voxel

const AO_LEVELS = [0.5, 0.68, 0.84, 1.0];

// Face definitions: normal, 4 corners (CCW from outside), tangent axes.
const FACES = [
  { n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
for (const f of FACES) {
  const axis = f.n.findIndex((v) => v !== 0);
  f.axes = [0, 1, 2].filter((a) => a !== axis);
}

const resolve = (c, x, y, z) => (typeof c === 'function' ? c(x, y, z) : c);

export class VoxGrid {
  constructor() {
    this.map = new Map();
    this.glowSet = new Set();
  }

  set(x, y, z, c, glow = false) {
    x |= 0; y |= 0; z |= 0;
    const k = key(x, y, z);
    const col = resolve(c, x, y, z);
    if (col === null || col === undefined || col === false) {
      this.map.delete(k);
      this.glowSet.delete(k);
      return this;
    }
    this.map.set(k, col);
    if (glow) this.glowSet.add(k);
    else this.glowSet.delete(k);
    return this;
  }
  get(x, y, z) {
    return this.map.get(key(x, y, z));
  }
  has(x, y, z) {
    return this.map.has(key(x, y, z));
  }
  del(x, y, z) {
    const k = key(x, y, z);
    this.map.delete(k);
    this.glowSet.delete(k);
    return this;
  }

  box(x0, y0, z0, x1, y1, z1, c, glow) {
    const [ax, bx] = x0 < x1 ? [x0, x1] : [x1, x0];
    const [ay, by] = y0 < y1 ? [y0, y1] : [y1, y0];
    const [az, bz] = z0 < z1 ? [z0, z1] : [z1, z0];
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++) for (let z = az; z <= bz; z++) this.set(x, y, z, c, glow);
    return this;
  }
  /** Hollow box shell (walls only). */
  shell(x0, y0, z0, x1, y1, z1, c, glow) {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) {
          if (x === x0 || x === x1 || y === y0 || y === y1 || z === z0 || z === z1) this.set(x, y, z, c, glow);
        }
    return this;
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, c, glow) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
          const dx = (x - cx) / (rx + 0.35), dy = (y - cy) / (ry + 0.35), dz = (z - cz) / (rz + 0.35);
          if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, c, glow);
        }
    return this;
  }
  sphere(cx, cy, cz, r, c, glow) {
    return this.ellipsoid(cx, cy, cz, r, r, r, c, glow);
  }
  /** Cylinder along an axis ('y' default). (cx, cz) = centre on the cross plane; a0..a1 along axis. */
  cylinder(cx, cz, a0, a1, r, c, axis = 'y', glow) {
    const rr = (r + 0.4) * (r + 0.4);
    for (let a = Math.min(a0, a1); a <= Math.max(a0, a1); a++)
      for (let u = Math.floor(cx - r); u <= Math.ceil(cx + r); u++)
        for (let v = Math.floor(cz - r); v <= Math.ceil(cz + r); v++) {
          const du = u - cx, dv = v - cz;
          if (du * du + dv * dv > rr) continue;
          if (axis === 'y') this.set(u, a, v, c, glow);
          else if (axis === 'x') this.set(a, u, v, c, glow);
          else this.set(u, v, a, c, glow);
        }
    return this;
  }
  line(x0, y0, z0, x1, y1, z1, c, thick = 0, glow) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
      if (thick > 0) this.box(x - thick, y - thick, z - thick, x + thick, y + thick, z + thick, c, glow);
      else this.set(x, y, z, c, glow);
    }
    return this;
  }
  /** Remove voxels for which fn(x,y,z,color) returns true. */
  carve(fn) {
    for (const [k, c] of [...this.map]) {
      const [x, y, z] = unkey(k);
      if (fn(x, y, z, c)) this.del(x, y, z);
    }
    return this;
  }
  /** Recolour voxels: fn(x,y,z,color) -> new colour (or undefined to keep). */
  paint(fn) {
    for (const [k, c] of this.map) {
      const [x, y, z] = unkey(k);
      const nc = fn(x, y, z, c);
      if (nc !== undefined && nc !== null) this.map.set(k, nc);
    }
    return this;
  }
  /** Mirror all voxels across x = (axis/2). With axis=-1, x=0 maps to x=-1 (even width symmetry). */
  mirrorX(axis = -1) {
    for (const [k, c] of [...this.map]) {
      const [x, y, z] = unkey(k);
      const nx = axis - x;
      if (!this.has(nx, y, z)) this.set(nx, y, z, c, this.glowSet.has(k));
    }
    return this;
  }
  merge(other, dx = 0, dy = 0, dz = 0) {
    for (const [k, c] of other.map) {
      const [x, y, z] = unkey(k);
      this.set(x + dx, y + dy, z + dz, c, other.glowSet.has(k));
    }
    return this;
  }
  clone() {
    const g = new VoxGrid();
    g.map = new Map(this.map);
    g.glowSet = new Set(this.glowSet);
    return g;
  }
  get size() {
    return this.map.size;
  }
  forEach(fn) {
    for (const [k, c] of this.map) {
      const [x, y, z] = unkey(k);
      fn(x, y, z, c, this.glowSet.has(k));
    }
  }
  bounds() {
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const k of this.map.keys()) {
      const [x, y, z] = unkey(k);
      if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
      if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  /**
   * Bake to BufferGeometry.
   * opts.scale: world size per voxel
   * opts.pivot: 'bottom' (x/z centred, y=0 at min) | 'center' | 'none' | [px,py,pz] in voxel units
   * opts.jitter: colour noise amount
   * opts.ao: enable ambient occlusion (default true)
   */
  build(opts = {}) {
    const scale = opts.scale ?? VOX;
    const jitter = opts.jitter ?? 0.06;
    const useAO = opts.ao !== false;
    const b = this.bounds();
    let px = 0, py = 0, pz = 0;
    const pivot = opts.pivot ?? 'bottom';
    if (Array.isArray(pivot)) [px, py, pz] = pivot;
    else if (pivot === 'bottom') {
      px = (b.minX + b.maxX + 1) / 2; py = b.minY; pz = (b.minZ + b.maxZ + 1) / 2;
    } else if (pivot === 'center') {
      px = (b.minX + b.maxX + 1) / 2; py = (b.minY + b.maxY + 1) / 2; pz = (b.minZ + b.maxZ + 1) / 2;
    }

    const pos = [], nor = [], col = [];
    const idxSolid = [], idxGlow = [];
    const tmpColor = new THREE.Color();
    const solid = (x, y, z) => this.map.has(key(x, y, z));
    let vcount = 0;

    for (const [k, c] of this.map) {
      const [x, y, z] = unkey(k);
      const isGlow = this.glowSet.has(k);
      const j = jitter ? 1 + (hash3(x, y, z) - 0.5) * 2 * jitter : 1;
      for (const f of FACES) {
        const nx = x + f.n[0], ny = y + f.n[1], nz = z + f.n[2];
        if (solid(nx, ny, nz)) continue;
        const ao = [3, 3, 3, 3];
        if (useAO && !isGlow) {
          const [ua, va] = f.axes;
          for (let i = 0; i < 4; i++) {
            const cr = f.c[i];
            const du = cr[ua] ? 1 : -1, dv = cr[va] ? 1 : -1;
            const o1 = [nx, ny, nz], o2 = [nx, ny, nz], o3 = [nx, ny, nz];
            o1[ua] += du; o2[va] += dv; o3[ua] += du; o3[va] += dv;
            const s1 = solid(o1[0], o1[1], o1[2]) ? 1 : 0;
            const s2 = solid(o2[0], o2[1], o2[2]) ? 1 : 0;
            const s3 = solid(o3[0], o3[1], o3[2]) ? 1 : 0;
            ao[i] = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
          }
        }
        tmpColor.setHex(c);
        for (let i = 0; i < 4; i++) {
          const cr = f.c[i];
          pos.push((x + cr[0] - px) * scale, (y + cr[1] - py) * scale, (z + cr[2] - pz) * scale);
          nor.push(f.n[0], f.n[1], f.n[2]);
          const l = isGlow ? 1 : AO_LEVELS[ao[i]] * j;
          col.push(tmpColor.r * l, tmpColor.g * l, tmpColor.b * l);
        }
        const tgt = isGlow ? idxGlow : idxSolid;
        const v = vcount;
        if (ao[0] + ao[2] < ao[1] + ao[3]) tgt.push(v + 1, v + 2, v + 3, v + 1, v + 3, v);
        else tgt.push(v, v + 1, v + 2, v, v + 2, v + 3);
        vcount += 4;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const index = idxSolid.concat(idxGlow);
    geo.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(index, 1) : new THREE.Uint16BufferAttribute(index, 1));
    geo.clearGroups();
    geo.addGroup(0, idxSolid.length, 0);
    if (idxGlow.length) geo.addGroup(idxSolid.length, idxGlow.length, 1);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();

    // Voxel sample list (for destruction effects) in model space.
    const maxSamples = opts.maxSamples ?? 260;
    const all = [];
    for (const [k, c] of this.map) {
      const [x, y, z] = unkey(k);
      // prefer surface voxels
      if (solid(x + 1, y, z) && solid(x - 1, y, z) && solid(x, y + 1, z) && solid(x, y - 1, z) && solid(x, y, z + 1) && solid(x, y, z - 1)) continue;
      all.push([(x + 0.5 - px) * scale, (y + 0.5 - py) * scale, (z + 0.5 - pz) * scale, c]);
    }
    let samples = all;
    if (all.length > maxSamples) {
      samples = [];
      const step = all.length / maxSamples;
      for (let i = 0; i < maxSamples; i++) samples.push(all[Math.floor(i * step)]);
    }
    geo.userData.voxels = samples;
    geo.userData.voxelSize = scale;
    geo.userData.dims = {
      w: (b.maxX - b.minX + 1) * scale,
      h: (b.maxY - b.minY + 1) * scale,
      d: (b.maxZ - b.minZ + 1) * scale,
    };
    return geo;
  }
}

// ---------------------------------------------------------------------------
// Shared materials

export const Mats = {
  solid: new THREE.MeshLambertMaterial({ vertexColors: true }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
  // Glossy PVC toy plastic for Swarms (envMap assigned by the engine).
  toy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.85 }),
  toyGloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.08, envMapIntensity: 1.1 }),
  flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  flashRed: new THREE.MeshBasicMaterial({ color: 0xff5050 }),
};
// Glow voxels render as HDR (> 1.0) so bloom picks up only emissive bits, not lit surfaces.
Mats.glow.color.setScalar(2.6);
Mats.pair = [Mats.solid, Mats.glow];
Mats.toyPair = [Mats.toy, Mats.glow];
Mats.toyGlossPair = [Mats.toyGloss, Mats.glow];
Mats.flashPair = [Mats.flash, Mats.flash];
Mats.flashRedPair = [Mats.flashRed, Mats.flashRed];

const variantMats = {};
/** Materials for shiny variants (chrome / silver / gold). envMap is assigned by the engine. */
export function variantMaterials(kind) {
  if (variantMats[kind]) return variantMats[kind];
  const params = {
    chrome: { metalness: 0.95, roughness: 0.1 },
    silver: { metalness: 0.85, roughness: 0.24 },
    gold: { metalness: 0.92, roughness: 0.2 },
  }[kind] || { metalness: 0.5, roughness: 0.4 };
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...params, envMapIntensity: 1.6 });
  variantMats[kind] = [m, Mats.glow];
  return variantMats[kind];
}
export function allVariantMaterials() {
  return Object.values(variantMats).map((p) => p[0]);
}

/** Recolour a grid for a shiny variant. */
export function variantColor(kind, c) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const l = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
  if (kind === 'gold') {
    const t = 0.35 + l * 0.75;
    return (Math.min(255, Math.round(255 * t)) << 16) | (Math.min(255, Math.round(196 * t)) << 8) | Math.round(60 * t);
  }
  if (kind === 'silver') {
    const v = Math.min(255, Math.round(120 + l * 135));
    return (v << 16) | (v << 8) | Math.min(255, v + 8);
  }
  if (kind === 'chrome') {
    // keep a hint of the original hue, push towards bright metal
    return shade(c, 0.45);
  }
  return c;
}

export function makeMesh(geo, mats = Mats.pair) {
  const m = new THREE.Mesh(geo, mats);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}

const geoCache = new Map();
/** Build (and cache) a mesh from a grid-producing function. */
export function cachedGeometry(id, makeGrid, opts) {
  let g = geoCache.get(id);
  if (!g) {
    g = makeGrid().build(opts);
    geoCache.set(id, g);
  }
  return g;
}

/** Simple coloured box geometry helper for props that don't need voxels. */
export function boxMesh(w, h, d, color, opts = {}) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = opts.glow
    ? new THREE.MeshBasicMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 })
    : new THREE.MeshLambertMaterial({ color, transparent: !!opts.opacity, opacity: opts.opacity ?? 1 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = !opts.noShadow;
  m.receiveShadow = !!opts.receive;
  return m;
}
