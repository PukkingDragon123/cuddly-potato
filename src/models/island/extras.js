// Beast Island extras: landmarks + life that make the home map feel alive.
//   * a BEAST blimp circling the island, a banner plane, a breaching whale + dolphins
//   * foam wakes behind every boat
//   * beach life on the south beach (towels, sandcastles, beach balls, surfboards, starfish, chairs)
//   * zone plinth corner lanterns (glowing tops) + zone-colour pennants
//   * a voxel rainbow over the big waterfall
//   * drifting cloud shadows on the terrain + ocean (shader patch, masked around the arena plinths)
// Everything is instanced / greedy-meshed and animated through `updaters` with no per-frame allocations.
import * as THREE from 'three';
import { VoxGrid, Mats } from '../../core/voxel.js';
import { text } from '../props/common.js';
import { mulberry32, hash3, shade } from '../../core/util.js';
import { MAT } from './terrain.js';
import * as P from './props.js';

const _o = new THREE.Object3D();
_o.rotation.order = 'YXZ';
const setM = (im, i, x, y, z, ry = 0, rx = 0, rz = 0, s = 1, sy = s, sz = s) => {
  _o.position.set(x, y, z);
  _o.rotation.set(rx, ry, rz);
  _o.scale.set(s, sy, sz);
  _o.updateMatrix();
  im.setMatrixAt(i, _o.matrix);
};
function liveIM(geo, n, o = {}) {
  const im = new THREE.InstancedMesh(geo, o.mats ?? Mats.pair, n);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  im.castShadow = !!o.shadow;
  for (let i = 0; i < n; i++) setM(im, i, 0, -200, 0, 0, 0, 0, 0.0001);
  return im;
}

// ---------------------------------------------------------------------------
// Grids

/** Blimp (voxel 0.25): nose +z, BEAST banner on both flanks. */
export function blimpGrid() {
  const g = new VoxGrid();
  const L = 30, Rr = 9;
  const white = 0xf4f6fa, whiteD = 0xd8dee8, blue = 0x29b6f6, pink = 0xff2e88;
  for (let z = -L; z <= L; z++) {
    const t = z / L;
    const r = Rr * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(t), t > 0 ? 2.2 : 1.6)));
    const ri = Math.ceil(r);
    for (let x = -ri; x <= ri; x++) for (let y = -ri; y <= ri; y++) {
      const d = Math.hypot(x, y);
      if (d > r || d < r - 1.6) continue;
      let c = y > r * 0.35 ? white : y < -r * 0.45 ? whiteD : white;
      if (Math.abs(z - 18) < 1 || Math.abs(z + 20) < 1) c = blue;
      if (z > L - 3) c = pink;
      g.set(x, y, z, c);
    }
  }
  // tail fins (cross)
  for (let z = -L + 1; z < -L + 10; z++) {
    const h = Math.round((z + L) * 0.9) + 3;
    for (let k = 7; k < 7 + Math.min(7, h); k++) {
      g.set(0, k, z, blue).set(0, -k, z, blue).set(k, 0, z, pink).set(-k, 0, z, pink);
    }
  }
  // gondola
  g.box(-3, -12, -6, 2, -10, 7, 0x3d4352).box(-3, -11, -5, 2, -11, 6, (x, y, z) => (z % 3 === 0 ? 0x24324e : 0x8fd8ff));
  g.box(-1, -9, -2, 0, -9, 3, 0x3d4352);
  // banner panels + text
  for (const s of [1, -1]) {
    g.box(s > 0 ? 9 : -10, -4, -15, s > 0 ? 9 : -10, 4, 15, 0x15121f);
    g.box(s > 0 ? 9 : -10, -4, -15, s > 0 ? 9 : -10, -4, 15, 0xffd23f).box(s > 0 ? 9 : -10, 4, -15, s > 0 ? 9 : -10, 4, 15, 0xffd23f);
    text(g, 'BEAST', s > 0 ? 10 : -11, -2, 0, s > 0 ? '+x' : '-x', 0xffd23f, { center: true, scale: 1, sy: 1 });
  }
  g.set(0, -13, 7, 0xff3d55, true);
  return g;
}
export function propGrid(r = 5, col = 0x3d4352) {
  const g = new VoxGrid();
  for (let k = -r; k <= r; k++) g.set(k, 0, 0, col).set(0, k, 0, col);
  g.set(0, 0, 1, 0xffd23f);
  return g;
}
/** Little prop plane (voxel 0.1), nose +z. */
export function planeGrid() {
  const g = new VoxGrid();
  const red = 0xe8343c, white = 0xf6f8fc;
  g.box(-2, -2, -14, 1, 1, 8, (x, y, z) => (y === 1 && z > -2 && z < 4 ? 0x8fd8ff : (z % 6 === 0 ? red : white)));
  g.box(-1, -1, 9, 0, 0, 10, 0x3d4352);
  g.box(-16, -1, -2, 15, -1, 3, (x) => (Math.abs(x) > 12 ? red : white));
  g.box(-6, 0, -14, 5, 0, -11, white);
  g.box(-1, 1, -15, 0, 6, -11, red);
  g.box(-1, -5, 0, 0, -3, 1, 0x3d4352).box(-4, -5, 0, -3, -4, 1, 0x15121f).box(2, -5, 0, 3, -4, 1, 0x15121f);
  return g;
}
/** Tow banner (voxel 0.1): text runs along -z from the tow point at z = 0. */
export function bannerGrid(label) {
  const g = new VoxGrid();
  const W = label.length * 6 + 6;
  g.box(0, 0, -W - 2, 0, 8, -3, 0xfff6dc);
  g.box(0, 0, -W - 2, 0, 0, -3, 0xff2e88).box(0, 8, -W - 2, 0, 8, -3, 0xff2e88);
  text(g, label, 1, 2, -5, '+x', 0x15121f, {});
  text(g, label, -1, 2, -W, '-x', 0x15121f, {});
  for (let z = -2; z <= 0; z++) g.set(0, 4, z, 0x8a8a8a);
  return g;
}
/** Whale (voxel 0.2): nose +z, back up. */
export function whaleGrid() {
  const g = new VoxGrid();
  const top = 0x3a5a8a, mid = 0x4a6c9c, belly = 0xe8eef6;
  for (let z = -22; z <= 20; z++) {
    const t = (z + 22) / 42;
    const r = 6.2 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62 + 0.18) * (t > 0.85 ? 1 - (t - 0.85) * 2.5 : 1);
    const ri = Math.ceil(r);
    for (let x = -ri; x <= ri; x++) for (let y = -ri; y <= ri; y++) {
      if (x * x + (y * 1.15) ** 2 > r * r) continue;
      g.set(x, y, z, y < -r * 0.35 ? (Math.abs(x) % 2 ? belly : shade(belly, -0.08)) : y > r * 0.4 ? top : mid);
    }
  }
  // flukes
  for (let x = -9; x <= 9; x++) for (let z = -28; z <= -22; z++) if (Math.abs(x) * 0.6 + (z + 25) * 0.5 < 4.2 && !(Math.abs(x) < 2 && z < -25)) g.set(x, 0, z, top);
  // flippers + eye + blowhole
  g.box(5, -3, 6, 9, -3, 9, mid).box(-10, -3, 6, -6, -3, 9, mid);
  g.set(5, 0, 14, 0x15121f).set(-6, 0, 14, 0x15121f);
  g.box(-1, 5, 8, 0, 5, 9, 0x24324e);
  return g;
}
export function dolphinGrid() {
  const g = new VoxGrid();
  const c = 0x7a98c0, b = 0xe8eef6;
  for (let z = -8; z <= 8; z++) {
    const r = 2.2 * Math.sin(((z + 9) / 18) * Math.PI);
    for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) if (x * x + y * y <= r * r + 0.3) g.set(x, y, z, y < -0.5 ? b : c);
  }
  g.box(0, 2, -1, 0, 4, 1, c).box(-3, 0, -10, 2, 0, -9, c).box(0, 0, 9, 0, -1, 11, c);
  return g;
}
const towelGrid = (a, b) => () => new VoxGrid().box(0, 0, 0, 5, 0, 11, (x, y, z) => ((z >> 1) & 1 ? a : b));
function sandcastleGrid() {
  const g = new VoxGrid();
  const s = 0xe8c47a, sd = 0xd0a860, sl = 0xf6dc9c;
  g.box(-5, 0, -5, 4, 2, 4, (x, y) => (y === 2 ? sl : sd));
  for (const [x, z] of [[-5, -5], [3, -5], [-5, 3], [3, 3]]) { g.box(x, 3, z, x + 1, 6, z + 1, s); g.set(x, 7, z, sl).set(x + 1, 7, z + 1, sl); }
  g.box(-2, 3, -2, 1, 8, 1, s).box(-2, 9, -2, 1, 9, 1, sl);
  g.set(-1, 10, 0, 0x8a5a2a).set(-1, 11, 0, 0x8a5a2a).set(0, 11, 0, 0xff2e88).set(0, 10, 0, 0xff2e88);
  g.box(-1, 0, 5, 0, 1, 5, 0x5a3a20);
  return g;
}
function ballGrid() {
  const g = new VoxGrid();
  const C = [0xff2e88, 0xffffff, 0x29b6f6, 0xffd23f];
  for (let x = -3; x <= 2; x++) for (let y = -3; y <= 2; y++) for (let z = -3; z <= 2; z++) {
    if ((x + 0.5) ** 2 + (y + 0.5) ** 2 + (z + 0.5) ** 2 > 9.5) continue;
    g.set(x, y, z, C[Math.floor((Math.atan2(z + 0.5, x + 0.5) + Math.PI) / (Math.PI / 2)) % 4]);
  }
  return g;
}
function surfGrid(c) {
  const g = new VoxGrid();
  for (let y = 0; y < 22; y++) {
    const w = y < 3 ? 1 : y > 18 ? 1 : 2;
    for (let x = -w; x < w; x++) g.set(x, y, 0, y % 9 === 4 ? 0xffffff : c);
  }
  return g;
}
function starfishGrid() {
  const g = new VoxGrid();
  const c = 0xff7a4a;
  g.set(0, 0, 0, c);
  for (const [a, b] of [[0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1]]) for (let k = 1; k <= 2; k++) g.set(a * k, 0, b * k, k === 2 ? 0xffa070 : c);
  return g;
}
function chairGrid(c) {
  const g = new VoxGrid();
  g.box(-2, 0, 0, -2, 2, 0, 0xc8ccd4).box(2, 0, 0, 2, 2, 0, 0xc8ccd4).box(-2, 0, 7, -2, 1, 7, 0xc8ccd4).box(2, 0, 7, 2, 1, 7, 0xc8ccd4);
  g.box(-2, 2, 1, 2, 2, 7, (x, y, z) => (z & 1 ? c : 0xffffff));
  for (let k = 0; k < 5; k++) g.box(-2, 3 + k, -k * 0.5 | 0, 2, 3 + k, -k * 0.5 | 0, k & 1 ? c : 0xffffff);
  return g;
}
/** Plinth corner lantern post (voxel 0.1): stone base, dark post, glowing lantern, little cap. */
function lanternPostGrid() {
  const g = new VoxGrid();
  const st = 0xe8e2d4, std = 0xcfc6b2, d = 0x3d3a4a;
  g.box(-2, 0, -2, 1, 1, 1, std).box(-2, 2, -2, 1, 2, 1, st);
  g.box(-1, 3, -1, 0, 12, 0, d);
  g.box(-2, 13, -2, 1, 13, 1, d);
  g.box(-2, 14, -2, 1, 16, 1, (x, y, z) => ((x === -2 || x === 1) && (z === -2 || z === 1) ? d : 0xffd27a));
  // only the inner lantern core glows (small accent)
  g.set(-1, 15, -1, 0xffe8a8, true).set(0, 15, 0, 0xffe8a8, true).set(-1, 15, 0, 0xffe8a8, true).set(0, 15, -1, 0xffe8a8, true);
  g.box(-2, 17, -2, 1, 17, 1, d).box(-1, 18, -1, 0, 18, 0, d);
  return g;
}
/** White pennant (tinted per zone via instance colour), hangs from a short arm at the top of the post. */
function pennantGrid() {
  const g = new VoxGrid();
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) if (y > x * 0.9 || y > 4) g.set(x, -y, 0, y === 0 ? 0xdddddd : 0xffffff);
  g.set(1, -8, 0, 0xffffff).set(2, -8, 0, 0xffffff);
  return g;
}
/** Foam bit (voxel 0.12) for wakes. */
const foamGrid = () => new VoxGrid().box(-1, 0, -1, 0, 0, 0, 0xf4ffff);

/** Rainbow arc (voxel 0.5) for the big waterfall; additive banded colours. */
function rainbowGrid(R0 = 18) {
  const g = new VoxGrid();
  const bands = [0xc02020, 0xc07010, 0xb0a010, 0x30a030, 0x2060c0, 0x6030a0];
  for (let x = -R0 - 7; x <= R0 + 7; x++) for (let y = 0; y <= R0 + 7; y++) {
    const d = Math.hypot(x, y);
    const k = Math.floor(R0 + 6 - d);
    if (k < 0 || k > 5) continue;
    const fade = Math.min(1, y / 6);
    const c = bands[5 - k];
    const r = Math.round(((c >> 16) & 255) * fade), gg = Math.round(((c >> 8) & 255) * fade), b = Math.round((c & 255) * fade);
    if (fade < 0.2 && hash3(x, y, 3) > fade * 4) continue;
    g.set(x, y, 0, (r << 16) | (gg << 8) | b);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Cloud shadows: shader patch for the terrain materials + the ocean

export const CLOUD_GLSL = /* glsl */ `
uniform float uCloudT;
uniform vec4 uCloudZones[16];
float cl_h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cl_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cl_h(i), cl_h(i + vec2(1.0, 0.0)), f.x), mix(cl_h(i + vec2(0.0, 1.0)), cl_h(i + vec2(1.0, 1.0)), f.x), f.y); }
float cloudShade(vec2 w) {
  vec2 q = floor(w * 2.0) * 0.5; // snap to the 0.5 voxel grid
  vec2 d = vec2(uCloudT * 1.1, uCloudT * 0.35);
  float n = cl_n((q + d) * 0.022) * 0.68 + cl_n((q + d * 1.3) * 0.061 + 7.0) * 0.32;
  float m = 1.0;
  for (int i = 0; i < 16; i++) { vec4 Z = uCloudZones[i]; if (Z.z > 0.0) m = min(m, smoothstep(Z.z, Z.z + 10.0, distance(q, Z.xy))); }
  float bayer = fract(dot(floor(q * 2.0), vec2(0.5, 0.25)) + 0.125);
  float s = smoothstep(0.6, 0.66, n + (bayer - 0.5) * 0.03);
  return 1.0 - 0.24 * s * m;
}`;
export function makeCloudUniforms(zoneCenters) {
  const arr = Array.from({ length: 16 }, (_, i) => {
    const z = zoneCenters[i];
    return z ? new THREE.Vector4(z[0], z[1], z[2], 0) : new THREE.Vector4(0, 0, 0, 0);
  });
  return { uCloudT: { value: 0 }, uCloudZones: { value: arr } };
}
/** Patch a Lambert material: multiply outgoing light by the drifting cloud shade. */
export function patchCloudShadows(mat, U) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCloudT = U.uCloudT;
    sh.uniforms.uCloudZones = U.uCloudZones;
    sh.vertexShader = 'varying vec2 vCloudW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCloudW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = 'varying vec2 vCloudW;\n' + CLOUD_GLSL + '\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= cloudShade(vCloudW);\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'cloudShadow';
  mat.needsUpdate = true;
}

// ---------------------------------------------------------------------------

/**
 * Build the extras. ctx: { T, root, updaters, R, zones (built zone records), ZONES (layout), boats (for wakes),
 * CX, CZ (island centre), falls: [{x, y, z, h}] }
 */
export function addIslandExtras(ctx) {
  const { T, root, updaters, CX, CZ } = ctx;
  const R = mulberry32(777);

  // ---- BEAST blimp: slow loop around the island, banner facing out
  {
    const blimp = new THREE.Group();
    blimp.name = 'blimp';
    const body = P.mesh(P.geo('blimp', blimpGrid, 0.25, 'center'), { shadow: false }); // too high for its shadow to land in a zone's shadow box
    const prop = P.mesh(P.geo('blimpProp', () => propGrid(5), 0.25, 'center'), { shadow: false });
    prop.position.set(0, 0, -8.2);
    blimp.add(body, prop);
    root.add(blimp);
    updaters.push((dt, t) => {
      const a = t * 0.018 + 1.2;
      const x = CX + Math.cos(a) * 118, z = CZ + 40 + Math.sin(a) * 150;
      blimp.position.set(x, 58 + Math.sin(t * 0.21) * 1.5, z);
      blimp.rotation.set(Math.sin(t * 0.3) * 0.03, Math.atan2(-Math.sin(a) * 118, Math.cos(a) * 150), Math.sin(t * 0.17) * 0.04, 'YXZ');
      prop.rotation.z = t * 6;
    });
  }

  // ---- banner plane: wide figure-eight over the southern island, BEAST ISLAND tow banner
  {
    const plane = new THREE.Group();
    plane.name = 'bannerPlane';
    const body = P.mesh(P.geo('plane', planeGrid, 0.1, 'center'), { shadow: true });
    const prop = P.mesh(P.geo('planeProp', () => propGrid(5, 0x2a2238), 0.1, 'center'), { shadow: false });
    prop.position.set(0, 0, 1.1);
    const banner = P.mesh(P.geo('planeBanner', () => bannerGrid('BEAST ISLAND'), 0.16, [0.5, 4, 0.5]), { shadow: true });
    banner.position.set(0, 0, -2.2);
    plane.add(body, prop, banner);
    root.add(plane);
    const p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
    const path = (t, out) => {
      const a = t * 0.045;
      return out.set(CX - 5 + Math.sin(a) * 95, 42 + Math.sin(a * 2) * 3, CZ + 70 + Math.sin(a * 2) * 48);
    };
    updaters.push((dt, t) => {
      path(t, p0); path(t + 0.25, p1);
      plane.position.copy(p0);
      const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
      const yaw2 = Math.atan2(path(t + 0.5, p1).x - p0.x, p1.z - p0.z);
      plane.rotation.set(0, yaw, (yaw2 - yaw) * -6, 'YXZ');
      prop.rotation.z = t * 30;
      banner.rotation.y = Math.sin(t * 3.1) * 0.06;
    });
  }

  // ---- whale surfacing + spouting off the east coast, dolphins leaping near the lab beach
  {
    const whale = P.mesh(P.geo('whale', whaleGrid, 0.2, 'center'), { shadow: false });
    whale.name = 'whale';
    root.add(whale);
    const spoutGeo = P.geo('spout', () => new VoxGrid().box(-1, 0, -1, 0, 1, 0, 0xf4fbff), 0.2, 'center');
    const spout = liveIM(spoutGeo, 18);
    root.add(spout);
    const SP = Array.from({ length: 18 }, () => ({ a: R() * 6.28, r: R(), up: 0.6 + R() * 0.6, ph: R() }));
    const spots = [[CX + 128, CZ + 30], [CX + 120, CZ + 120], [CX - 120, CZ + 90], [CX - 125, CZ - 40]];
    const per = 22;
    updaters.push((dt, t) => {
      const cyc = Math.floor(t / per), k = (t % per) / per;
      const [sx, sz] = spots[cyc % spots.length];
      const ang = cyc * 1.7;
      const fx = Math.sin(ang), fz = Math.cos(ang);
      // swim forward while surfacing (0.15..0.75), then dive with the flukes up
      const u = Math.min(1, Math.max(0, (k - 0.1) / 0.75));
      const x = sx + fx * (u - 0.5) * 30, z = sz + fz * (u - 0.5) * 30;
      const y = -4.2 + Math.sin(u * Math.PI) * 3.6;
      whale.position.set(x, y, z);
      whale.rotation.set(-Math.cos(u * Math.PI) * 0.32, ang, 0, 'YXZ');
      whale.visible = k > 0.05 && k < 0.95;
      const sk = (u - 0.42) / 0.22; // spout window near the top of the arc
      for (let i = 0; i < SP.length; i++) {
        const s = SP[i], q = (sk * 1.0 + s.ph * 0.4);
        if (sk < 0 || sk > 1 || q > 1) { setM(spout, i, 0, -200, 0, 0, 0, 0, 0.0001); continue; }
        const hx = x + fx * 2.2, hz = z + fz * 2.2;
        setM(spout, i, hx + Math.cos(s.a) * s.r * q * 1.6, y + 1.4 + Math.sin(q * Math.PI * 0.8) * 4.5 * s.up, hz + Math.sin(s.a) * s.r * q * 1.6, 0, 0, 0, (1 - q) * 1.6 + 0.2);
      }
      spout.instanceMatrix.needsUpdate = true;
    });

    const dol = liveIM(P.geo('dolphin', dolphinGrid, 0.12, 'center'), 3, { shadow: false });
    dol.name = 'dolphins';
    root.add(dol);
    const D = [0, 1, 2].map((i) => ({ ph: i * 0.33, off: i * 2.2 }));
    updaters.push((dt, t) => {
      const a = t * 0.06;
      const cx = -36 + Math.cos(a) * 26, cz = 82 + Math.sin(a) * 8;
      const hx = -Math.sin(a), hz = Math.cos(a) * 0.3;
      const yaw = Math.atan2(hx, hz);
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.55 + D[i].ph) % 1);
        const y = -1.0 + Math.sin(k * Math.PI) * 1.9;
        setM(dol, i, cx - hx * D[i].off + (i - 1) * 1.4, y, cz - hz * D[i].off, yaw, -Math.cos(k * Math.PI) * 0.9);
      }
      dol.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- foam wakes behind every boat (ring buffer of past positions)
  if (ctx.boats?.length) {
    const N = 14, B = ctx.boats.length;
    const im = liveIM(P.geo('wakeFoam', foamGrid, 0.16, 'center', 0), B * N);
    im.name = 'wakes';
    root.add(im);
    const hist = new Float32Array(B * N * 2);
    let filled = 0, acc = 0, head = 0;
    updaters.push((dt, t) => {
      acc += dt;
      if (acc > 0.18) {
        acc = 0;
        head = (head + 1) % N;
        for (let b = 0; b < B; b++) {
          const p = ctx.boats[b].m.position;
          hist[(b * N + head) * 2] = p.x;
          hist[(b * N + head) * 2 + 1] = p.z;
        }
        filled = Math.min(N, filled + 1);
      }
      for (let b = 0; b < B; b++) for (let k = 0; k < N; k++) {
        const i = b * N + k;
        if (k >= filled) { setM(im, i, 0, -200, 0, 0, 0, 0, 0.0001); continue; }
        const idx = (head - k + N) % N;
        const age = k / N, side = (k & 1 ? 1 : -1) * (0.3 + age * 1.6);
        const x = hist[(b * N + idx) * 2], z = hist[(b * N + idx) * 2 + 1];
        const sc = (1 - age) * (1.6 + Math.sin(t * 5 + k) * 0.2);
        setM(im, i, x + side * 0.5, 0.02, z + side * 0.3, k * 0.7, 0, 0, sc, 1, sc);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- beach life on the south sand (around the lab beach)
  {
    const sandSpots = [];
    for (let i = 0; i < 1400 && sandSpots.length < 70; i++) {
      const x = -70 + R() * 120, z = 40 + R() * 40;
      if (T.matAt(x, z) !== MAT.SAND) continue;
      const id = T.colAt(x, z);
      if (id < 0 || T.roadD[id] < T.RW + 1.5) continue;
      const y = T.heightAt(x, z);
      if (y < 0.5 || T.minHeight(x, z, 1.0) < y - 0.3) continue;
      if (ctx.exclude?.some(([ex, ez, er]) => Math.hypot(x - ex, z - ez) < er)) continue;
      if (ctx.ZONES.some((Z) => Math.hypot(x - Z.x, z - Z.z) < 12)) continue;
      sandSpots.push([x, y, z]);
    }
    const take = (n) => sandSpots.splice(0, n);
    const kinds = [
      ['towelA', towelGrid(0xff2e88, 0xffffff), 0.12, 4],
      ['towelB', towelGrid(0x29b6f6, 0xffd23f), 0.12, 4],
      ['castle', sandcastleGrid, 0.1, 4],
      ['bball', ballGrid, 0.1, 4],
      ['surfA', () => surfGrid(0xff7a2a), 0.1, 3],
      ['surfB', () => surfGrid(0x29e0ff), 0.1, 3],
      ['star', starfishGrid, 0.09, 10],
      ['chairA', () => chairGrid(0x29b6f6), 0.1, 3],
      ['chairB', () => chairGrid(0xff4fa3), 0.1, 3],
    ];
    const balls = [];
    for (const [id, fn, s, n] of kinds) {
      const items = take(n).map(([x, y, z]) => [x, y + (id === 'bball' ? 0.3 : 0.01), z, R() * 6.28, 1]);
      if (!items.length) continue;
      const im = new THREE.InstancedMesh(P.geo('beach_' + id, fn, s, id === 'bball' ? 'center' : 'bottom'), Mats.pair, items.length);
      items.forEach((it, i) => setM(im, i, it[0], it[1], it[2], it[3], id.startsWith('surf') ? 0.18 : 0, 0, 1));
      im.castShadow = id !== 'star' && !id.startsWith('towel');
      im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = 'beach:' + id;
      root.add(im);
      if (id === 'bball') { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); balls.push([im, items]); }
    }
    updaters.push((dt, t) => {
      for (const [im, items] of balls) {
        items.forEach((it, i) => {
          const k = Math.abs(Math.sin(t * 2.2 + i * 1.7));
          setM(im, i, it[0], it[1] + k * 0.7, it[2], it[3] + t * (i & 1 ? 1 : -1));
        });
        im.instanceMatrix.needsUpdate = true;
      }
    });
  }

  // ---- plinth corner lanterns + zone pennants
  {
    const posts = [], pens = [];
    const pv = new THREE.Vector3();
    for (const Z of ctx.zones) {
      Z.group.updateMatrixWorld(true);
      const A = P.PLINTH_A * 0.25 - 0.55;
      for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        // the octagon's diagonal faces: corners sit on them
        pv.set(cx * A * 0.66, 0, cz * A * 0.66);
        pv.applyMatrix4(Z.group.matrixWorld);
        posts.push([pv.x, pv.y - 0.04, pv.z, Math.atan2(cx, cz), Z.color]);
        pens.push([pv.x, pv.y + 2.1, pv.z, Math.atan2(cx, cz) + Math.PI / 2, Z.color]);
      }
    }
    const postIM = new THREE.InstancedMesh(P.geo('plinthLantern', lanternPostGrid, 0.13, 'bottom'), Mats.pair, posts.length);
    posts.forEach((p, i) => setM(postIM, i, p[0], p[1], p[2], p[3]));
    postIM.castShadow = false; // spans every zone: one instanced draw would hit every shadow pass
    postIM.computeBoundingSphere();
    postIM.name = 'plinthLanterns';
    root.add(postIM);
    const penIM = new THREE.InstancedMesh(P.geo('plinthPennant', pennantGrid, 0.12, [0, 0, 0.5], 0), Mats.pair, pens.length);
    penIM.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.Color();
    pens.forEach((p, i) => penIM.setColorAt(i, col.setHex(p[4])));
    penIM.frustumCulled = false;
    penIM.name = 'plinthPennants';
    root.add(penIM);
    updaters.push((dt, t) => {
      for (let i = 0; i < pens.length; i++) {
        const p = pens[i];
        setM(penIM, i, p[0], p[1], p[2], p[3] + Math.sin(t * 2.3 + i) * 0.35, 0, Math.sin(t * 3.1 + i * 0.7) * 0.08);
      }
      penIM.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- butterflies flitting around every zone plinth (tiny instanced voxels, zone-tinted)
  {
    const per = 6, Zs = ctx.zones, n = Zs.length * per;
    const geo = P.geo('butterfly', () => new VoxGrid().set(0, 0, 0, 0xffffff).set(1, 0, 0, 0xffffff).set(-1, 0, 0, 0xffffff).set(0, 0, 1, 0x2a2238), 0.07, 'center', 0);
    const im = liveIM(geo, n);
    im.name = 'butterflies';
    const c = new THREE.Color();
    const F = [];
    Zs.forEach((Z, k) => {
      for (let i = 0; i < per; i++) {
        F.push({ x: Z.center.x, y: Z.center.y, z: Z.center.z, r: 6 + R() * 5, ph: R() * 6.28, sp: (0.2 + R() * 0.25) * (R() < 0.5 ? -1 : 1), h: 0.6 + R() * 1.6 });
        im.setColorAt(k * per + i, c.setHex(i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffd23f : Z.color));
      }
    });
    root.add(im);
    updaters.push((dt, t) => {
      for (let i = 0; i < n; i++) {
        const f = F[i], a = f.ph + t * f.sp;
        const flap = 0.25 + Math.abs(Math.sin(t * 14 + f.ph * 3)) * 0.75;
        setM(im, i, f.x + Math.cos(a) * f.r, f.y + f.h + Math.sin(t * 1.7 + f.ph) * 0.35, f.z + Math.sin(a) * f.r, -a, 0, 0, flap, 1, 1);
      }
      im.instanceMatrix.needsUpdate = true;
    });
  }

  // ---- rainbow over the tallest waterfall
  if (ctx.falls?.length) {
    const F = ctx.falls.reduce((a, b) => (b.h > a.h ? b : a));
    const m = new THREE.Mesh(P.geo('rainbow', () => rainbowGrid(18), 0.5, [0, 0, 0.5], 0), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false }));
    m.position.set(F.x + 1.5, F.y - 2, F.z + 3);
    m.rotation.y = 0.5;
    m.scale.setScalar(0.55);
    m.renderOrder = 3;
    m.name = 'rainbow';
    root.add(m);
    updaters.push((dt, t) => { m.material.opacity = 0.42 + Math.sin(t * 0.25) * 0.12; });
  }
}
