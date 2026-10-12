// Beast Island sky: dithered pixel sky (scene.background), pixel-art cloud
// billboards (camera-facing instanced quads with dithered fade, also used for
// the locked-zone cloud cover) and distant islands as flat pixel-art cards.
import * as THREE from 'three';
import { skyTexture, paintSun, paintClouds, disc, px, bayer, canvas as mkCanvas } from '../arenas/kit.js';
import { mulberry32, shade } from '../../core/util.js';
import { vnoise } from '../props/common.js';

export const HORIZON = 0xd4f2ff;

export function makeSky() {
  return skyTexture('beastIsland', [[0, 0x2a86f0], [0.45, 0x6cc4ff], [0.8, 0xaee4ff], [1, HORIZON]], (ctx, w, h) => {
    paintSun(ctx, w * 0.8, h * 0.18, 7, 0xfff6c8, 0xfffbe8);
    paintClouds(ctx, w, h, { n: 4, y0: 10, y1: h * 0.35, size: 6, seed: 21, shade: 0xcfe6fa });
    paintClouds(ctx, w, h, { n: 3, y0: h * 0.45, y1: h * 0.62, size: 4, seed: 5, shade: 0xd6ecfb, light: 0xffffff });
  }, { w: 192, h: 108, bands: 14 });
}

// ---------------------------------------------------------------------------
// Cloud atlas: 4 frames (2x2) of puffy pixel clouds with lit tops

function cloudAtlas() {
  const ctx = mkCanvas(256, 128);
  const R = mulberry32(42);
  for (let f = 0; f < 4; f++) {
    const ox = (f % 2) * 128, oy = Math.floor(f / 2) * 64;
    const puffs = [];
    const n = 5 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const r = 10 + Math.sin(t * Math.PI) * 12 + R() * 5;
      puffs.push([ox + 18 + t * 92 + (R() - 0.5) * 6, oy + 44 - Math.sin(t * Math.PI) * 10 - R() * 6, r]);
    }
    // outline, shade, body, highlight
    for (const [x, y, r] of puffs) disc(ctx, x, y + 1, Math.round(r) + 1, 0x9fc4e8);
    for (const [x, y, r] of puffs) disc(ctx, x, y + 2, Math.round(r), 0xc6dcf4);
    for (const [x, y, r] of puffs) disc(ctx, x, y - 1, Math.round(r - 1), 0xffffff);
    for (const [x, y, r] of puffs) disc(ctx, x - r * 0.3, y - r * 0.45, Math.max(2, Math.round(r * 0.4)), 0xffffff);
    // flat shaded base
    const minX = Math.min(...puffs.map((p) => p[0] - p[2] * 0.6)), maxX = Math.max(...puffs.map((p) => p[0] + p[2] * 0.6));
    px(ctx, Math.round(minX), oy + 52, Math.round(maxX - minX), 3, 0xc6dcf4);
    px(ctx, Math.round(minX) + 2, oy + 55, Math.round(maxX - minX) - 4, 1, 0x9fc4e8);
    // dithered shade band on the lower half
    const img = ctx.getImageData(ox, oy, 128, 64);
    const d = img.data;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4;
      if (d[i + 3] < 128) continue;
      if (d[i] === 255 && y > 38 && bayer(x, y) < (y - 38) / 18) { d[i] = 0xe2; d[i + 1] = 0xee; d[i + 2] = 0xfb; }
    }
    ctx.putImageData(img, ox, oy);
    // clear spill beyond the frame
    ctx.clearRect(ox, oy + 58, 128, 6);
  }
  const t = new THREE.CanvasTexture(ctx.canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

let _atlas = null;
const FRAMES = [[0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5], [0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5]]; // u0, v0, du, dv (flipY: top row = v 0.5..1)

/**
 * Camera-facing instanced billboards. Each instance: position, size (sx, sy),
 * atlas frame and a fade (0..1, dithered).
 */
export class Billboards {
  constructor(count, opts = {}) {
    _atlas = _atlas || cloudAtlas();
    const geo = new THREE.PlaneGeometry(1, 1);
    if (opts.anchorBottom) geo.translate(0, 0.5, 0);
    this.frame = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.fade = new THREE.InstancedBufferAttribute(new Float32Array(count).fill(1), 1);
    geo.setAttribute('aFrame', this.frame);
    geo.setAttribute('aFade', this.fade);
    const mat = new THREE.MeshBasicMaterial({ map: opts.map ?? _atlas, color: opts.color ?? 0xffffff, fog: opts.fog ?? true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 aFrame;\nattribute float aFade;\nvarying float vFade;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = aFrame.xy + uv * aFrame.zw;\nvFade = aFade;')
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4(0.0, 0.0, 0.0, 1.0);
          float bsx = 1.0, bsy = 1.0;
          #ifdef USE_INSTANCING
            mvPosition = instanceMatrix * mvPosition;
            bsx = length(instanceMatrix[0].xyz);
            bsy = length(instanceMatrix[1].xyz);
          #endif
          mvPosition = modelViewMatrix * mvPosition;
          mvPosition.xy += position.xy * vec2(bsx, bsy);
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vFade;
          float bb2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
          float bb4(vec2 a) { return bb2(0.5 * a) * 0.25 + bb2(a); }`)
        .replace('#include <map_fragment>', `#include <map_fragment>
          if (diffuseColor.a < 0.5 || vFade < bb4(gl_FragCoord.xy * 0.34)) discard;
          diffuseColor.a = 1.0;`);
    };
    mat.customProgramCacheKey = () => 'pixelBillboard' + (opts.anchorBottom ? 'B' : '');
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.name = opts.name ?? 'billboards';
    this.count = count;
    this._m = new THREE.Matrix4();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._c = new THREE.Color();
    for (let i = 0; i < count; i++) { this.set(i, 0, -999, 0, 0.001, 0.001, 0, 0); this.mesh.setColorAt(i, this._c.setHex(0xffffff)); }
  }
  setTint(i, hex) {
    this.mesh.setColorAt(i, this._c.setHex(hex));
    this.mesh.instanceColor.needsUpdate = true;
  }
  set(i, x, y, z, sx, sy, frame = 0, fade = 1, flip = false) {
    this._p.set(x, y, z);
    this._s.set(sx, sy, 1);
    this._m.compose(this._p, this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    const F = FRAMES[frame % FRAMES.length];
    if (flip) this.frame.setXYZW(i, F[0] + F[2], F[1], -F[2], F[3]);
    else this.frame.setXYZW(i, F[0], F[1], F[2], F[3]);
    this.fade.setX(i, fade);
  }
  setFade(i, f) { this.fade.setX(i, f); }
  commit() {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.frame.needsUpdate = true;
    this.fade.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Distant islands: flat pixel-art cards on the horizon (pre-hazed, unlit)

function paintIsland(ctx, w, h, seed, kind) {
  const R = mulberry32(seed);
  const base = h - 6;
  const cx = w * (0.4 + R() * 0.2), hw = w * (0.32 + R() * 0.12);
  const tops = [];
  for (let x = 0; x < w; x++) {
    const e = 1 - ((x - cx) / hw) ** 2;
    if (e <= 0) { tops.push(h + 5); continue; }
    let v = Math.sqrt(e) * (0.55 + vnoise(x * 0.05, seed, 0.5) * 0.6);
    if (kind === 'volcano') v = Math.max(v, Math.max(0, 1 - Math.abs(x - cx) / (hw * 0.55)) * 1.25);
    if (kind === 'peaks') v = Math.pow(v, 0.8) * (0.8 + Math.abs(Math.sin(x * 0.09 + seed)) * 0.5);
    tops.push(Math.round(base - v * h * 0.62));
  }
  // sand + foam rim
  for (let x = 0; x < w; x++) {
    if (tops[x] > h) continue;
    px(ctx, x, base - 2, 1, 4, 0xf4e2b0);
    px(ctx, x, base + 2, 1, 1, 0xffffff);
  }
  for (let x = 0; x < w; x++) {
    const t = tops[x];
    if (t >= base - 2) continue;
    const rockCol = kind === 'volcano' ? 0x6a6478 : 0x4fae54;
    px(ctx, x, t, 1, base - 2 - t, rockCol);
    if (x > 0 && tops[x] > tops[x - 1]) px(ctx, x, t, 1, base - 2 - t, shade(rockCol, -0.25), 0.35);
    px(ctx, x, t, 1, 1, shade(rockCol, 0.3));
    if (kind === 'volcano' && t < base - h * 0.5) px(ctx, x, t, 1, 2, 0x8a8298);
  }
  if (kind === 'volcano') {
    const top = Math.min(...tops);
    for (let k = 0; k < 4; k++) disc(ctx, cx + k * 3, top - 4 - k * 5, 3 + k, 0xe8eef6);
  }
  // palms on the low parts
  for (let k = 0; k < 6; k++) {
    const x = Math.round(cx + (R() - 0.5) * hw * 1.6);
    if (tops[x] > base - 3 || tops[x] < base - h * 0.35) continue;
    const y = tops[x] + 1;
    for (let i = 0; i < 8; i++) px(ctx, x + Math.round(Math.sin(i * 0.2) * 1.2), y - i, 1, 1, 0x8a6a3a);
    const tx = x + 1, ty = y - 8;
    for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) for (let i = 1; i <= 4; i++) px(ctx, tx + dx * i, ty + dy * Math.round(i * i / 6), 1, 1, 0x3f9a4a);
  }
  if (kind === 'arch') {
    const ax = Math.round(cx + hw * 0.9);
    for (let y = 0; y < 16; y++) {
      const r = 8 - Math.abs(y - 8) * 0.2;
      px(ctx, ax - 10, base - 2 - y, 3, 1, 0x9aa2b4);
      px(ctx, ax + 6, base - 2 - y, 3, 1, 0x8a92a4);
      void r;
    }
    for (let x = -10; x <= 8; x++) px(ctx, ax + x, base - 18 - Math.round(Math.cos((x + 1) / 10) * 3), 1, 4, 0x9aa2b4);
  }
}

export function makeDistantIslands(n = 7, radius = 520) {
  const group = new THREE.Group();
  group.name = 'distantIslands';
  const kinds = ['hills', 'volcano', 'peaks', 'arch', 'hills', 'peaks', 'volcano'];
  const R = mulberry32(77);
  for (let k = 0; k < n; k++) {
    const kind = kinds[k % kinds.length];
    const ctx = mkCanvas(160, 56);
    paintIsland(ctx, 160, 56, 100 + k * 7, kind);
    // atmospheric haze
    ctx.globalCompositeOperation = 'source-atop';
    px(ctx, 0, 0, 160, 56, HORIZON, 0.3 + (k % 3) * 0.06);
    ctx.globalCompositeOperation = 'source-over';
    const tex = new THREE.CanvasTexture(ctx.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    const W = 150 + R() * 70, Hh = W * 56 / 160;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, fog: false }));
    const a = (k / n) * Math.PI * 2 + R() * 0.5 + 0.3;
    const r = radius + R() * 140;
    mesh.position.set(Math.cos(a) * r, Hh / 2 - Hh * 6 / 56 - 0.5, Math.sin(a) * r);
    mesh.lookAt(0, mesh.position.y, 0);
    mesh.name = 'distant:' + kind;
    group.add(mesh);
  }
  return group;
}

