// Meadow grass: instanced, wind-swept blade clumps. A port of MoleForge's meadow grass
// (upgraded-guacamole src/world/plants.js, the 'grass' plant kind + the oscean shelf recipe):
//   * a clump of 3-5 blades, each a chain of segments that tapers from w 2 -> 0.25 and keeps a random
//     rest curl (curl 0.09 * (0.4 + u), random sign), so blades lean and hook a little
//   * every blade is split along its spine into a lit half and a shaded half (MoleForge's two-tone facet
//     voxels: cap(...) colours a cell by which side of the spine it falls on), darker at the root
//   * the same two-sine current, sin(t*0.8 + x*k + ph*0.2)*0.8 + sin(t*1.9 + x*4.3k + z*1.8k)*0.35 + drift,
//     pushes harder toward the tip (MoleForge's node force 60 + 140u), done here in the vertex shader
//   * per-clump colour from MoleForge's grass palette, varied per instance
// One InstancedMesh (one draw call) per field; the instance order is shuffled, so lowering mesh.count thins
// the field evenly (low / medium quality draw fewer clumps).
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { mulberry32 } from '../../core/util.js';

// MoleForge oscean meadow grass palette (deepsea.js SHELF.oscean grass colours)
export const MOLE_GRASS = [0x3cb43a, 0x4ac84a, 0x2e9a36, 0x62d24a];
const QDENS = { low: 0.45, medium: 0.75, high: 1 };

const geoCache = new Map();
/** One clump: `blades` blades, `segs` segments each, ~1 unit tall, root at y = 0. Attributes: position, normal, color, aH (0 root .. 1 tip). */
function clumpGeometry(blades = 4, segs = 3, seed = 1, o = {}) {
  const key = [blades, segs, seed, o.lit ?? 1.18, o.dark ?? 0.72, o.spread ?? 0.22].join('|');
  if (geoCache.has(key)) return geoCache.get(key);
  const R = mulberry32(seed * 977 + 13);
  const pos = [], col = [], hh = [], idx = [];
  const lit = o.lit ?? 1.18, dark = o.dark ?? 0.72, spread = o.spread ?? 0.22;
  for (let b = 0; b < blades; b++) {
    // blade base point + facing (yaw) + lean
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * spread;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const yaw = R() * Math.PI * 2, cy = Math.cos(yaw), sy = Math.sin(yaw);
    const H = 0.65 + R() * 0.45; // blade length (clump is ~1 tall)
    const curl = 0.09 * (R() < 0.5 ? 1 : -1) * (0.8 + R() * 0.9);
    const base = (R() - 0.5) * 0.24 + Math.atan2(bx, 0.6) * 0.5; // outer blades lean outward a touch
    const w0 = 0.075 + R() * 0.03; // half width at the root (MoleForge w: [2, 0.25] relative)
    // chain FK in the blade plane (u along the blade's width axis, v up)
    let ang = base, u = 0, v = 0;
    const nodes = [[0, 0]];
    for (let i = 0; i < segs; i++) {
      const k = i / Math.max(1, segs - 1);
      ang += curl * (0.4 + k) + (R() - 0.5) * 0.06;
      u += Math.sin(ang) * (H / segs);
      v += Math.cos(ang) * (H / segs);
      nodes.push([u, v]);
    }
    const P = (uu, vv, side) => {
      // blade plane: width along (cy, sy) rotated 90deg, lean along (cy, sy); side offsets across
      const x = bx + uu * cy - side * sy, z = bz + uu * sy + side * cy;
      return [x, vv, z];
    };
    const v0 = pos.length / 3;
    for (let j = 0; j <= segs; j++) {
      const t = j / segs, [nu, nv] = nodes[j];
      const hw = j === segs ? 0 : w0 * (1 - t * 0.85);
      const g = 0.7 + t * 0.45; // darker at the root
      for (const [side, f] of [[-hw, lit], [0, lit], [0, dark], [hw, dark]]) { // spine doubled: a hard lit / shade split
        pos.push(...P(nu, nv, side));
        const c = Math.min(1.6, f * g);
        col.push(c, c, c * (f === lit ? 0.9 : 1.05)); // warm lit side, cool shade
        hh.push(t);
      }
    }
    for (let j = 0; j < segs; j++) {
      const a0 = v0 + j * 4, a1 = a0 + 4;
      if (j === segs - 1) { // tip: one triangle per half to the tip point (the tip row is degenerate)
        idx.push(a0, a0 + 1, a1 + 1, a0 + 2, a0 + 3, a1 + 2);
      } else {
        idx.push(a0, a0 + 1, a1, a0 + 1, a1 + 1, a1); // lit half
        idx.push(a0 + 2, a0 + 3, a1 + 2, a0 + 3, a1 + 3, a1 + 2); // shaded half
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aH', new THREE.Float32BufferAttribute(hh, 1));
  // normals straight up: blades shade like the ground they grow from, the facet split carries the form
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  geoCache.set(key, geo);
  return geo;
}

/** Wind-swept Lambert material (shared per wind setting). Uniforms on mat.userData.U. */
export function grassMaterial(o = {}) {
  const U = {
    uT: { value: 0 },
    uAmp: { value: o.amp ?? 0.55 },
    uK: { value: o.freq ?? 0.55 },
    uDrift: { value: 0.2 },
    uDir: { value: new THREE.Vector2(1, 0.3).normalize() },
  };
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aH;\nuniform float uT, uAmp, uK, uDrift;\nuniform vec2 uDir;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        // MoleForge current: two sines along x + a slow drift (gusts), stronger toward the tip
        float fl = (sin(uT * 0.8 + ip.x * uK + ph * 0.2) * 0.8 + sin(uT * 1.9 + ip.x * uK * 4.3 + ip.z * uK * 1.8) * 0.35 + uDrift) * uAmp;
        float hy = max(mvPosition.y - ip.y, 0.0);
        float bend = fl * hy * aH * (0.3 + 0.7 * aH);
        mvPosition.xz += uDir * bend;
        mvPosition.y -= abs(bend) * 0.4 * aH;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'moleGrass';
  mat.userData.U = U;
  return mat;
}

/**
 * Build a grass field. items: [[x, y, z], ...] clump roots. o: { cols (hex palette), h: [min, max] clump height,
 * w (width factor), blades, segs, seed, amp, freq, shadow }. Returns { mesh, update(t) }.
 */
export function makeGrassField(items, o = {}) {
  const R = mulberry32((o.seed ?? 1) * 7121 + 3);
  // shuffle so mesh.count thins evenly
  for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; }
  const geo = clumpGeometry(o.blades ?? 4, o.segs ?? 3, o.seed ?? 1, o);
  const mat = o.mat ?? grassMaterial(o);
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  im.name = o.name ?? 'grass';
  im.castShadow = false;
  im.receiveShadow = o.receive !== false;
  const cols = o.cols ?? MOLE_GRASS, [h0, h1] = o.h ?? [0.26, 0.42], wf = o.w ?? 1;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), c = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    const h = h0 + R() * (h1 - h0);
    q.setFromAxisAngle(up, R() * Math.PI * 2);
    m.compose(p.set(it[0], it[1], it[2]), q, s.set(h * wf * (it[3] ?? 1), h * (it[3] ?? 1), h * wf * (it[3] ?? 1)));
    im.setMatrixAt(i, m);
    c.setHex(cols[Math.floor(R() * cols.length)]);
    const k = 0.92 + R() * 0.16;
    im.setColorAt(i, c.multiplyScalar(k));
  });
  im.count = items.length;
  im.computeBoundingSphere();
  const N = items.length, U = mat.userData.U;
  let lastQ = null;
  return {
    mesh: im,
    update(t) {
      U.uT.value = t;
      U.uDrift.value = 0.18 + Math.sin(t * 0.23) * 0.22 + Math.max(0, Math.sin(t * 0.61 + 1.3)) * 0.25; // gusts
      const qn = engine.quality;
      if (qn !== lastQ) { lastQ = qn; im.count = Math.max(1, Math.floor(N * (QDENS[qn] ?? 1))); }
    },
  };
}

const LH = 2.4;
/**
 * Battle-arena meadow (one draw call): clumps scattered over the front strip and the strip behind the lane.
 * o: { n: [front, back], front: [z0, z1], back: [z0, z1], x: [x0, x1], ok(x, z), cols, h, seed, amp }
 */
export function addGrassField(K, o = {}) {
  const R = mulberry32((o.seed ?? 5) * 313 + 1);
  const [xa, xb] = o.x ?? [-30, 30];
  const items = [];
  const scatter = (n, [z0, z1], bias = 0) => {
    for (let i = 0, tries = 0; i < n && tries < n * 4; tries++) {
      // clumps gather in patches (MoleForge clump [3, 5]): a patch centre + a few roots around it
      const x = xa + R() * (xb - xa);
      let u = R();
      if (bias) u = Math.pow(u, 1 / (1 + bias)); // denser toward z1 (the camera side)
      const z = z0 + u * (z1 - z0);
      const k = 2 + Math.floor(R() * 3);
      for (let j = 0; j < k && i < n; j++) {
        const px = x + (R() - 0.5) * 0.9, pz = z + (R() - 0.5) * 0.6;
        if (pz < Math.min(z0, z1) || pz > Math.max(z0, z1)) continue;
        if (o.ok && !o.ok(px, pz)) continue;
        if (Math.abs(Math.abs(px) - 12) < 3.2 && pz > -3.6 && pz < 2.8) continue; // base pads
        items.push([px, o.y ?? 0, pz, 0.85 + R() * 0.3]);
        i++;
      }
    }
  };
  const [nf, nb] = o.n ?? [1500, 500];
  scatter(nf, o.front ?? [LH + 0.4, 12.5], 0.6);
  scatter(nb, o.back ?? [-11, -LH - 0.4]);
  if (!items.length) return null;
  const G = makeGrassField(items, { ...o, name: 'meadow' });
  K.add(G.mesh);
  K.onUpdate((dt, t) => G.update(t));
  return G;
}
