// Beast Island water: a pixel-art ocean shader (shallows -> deep blue from a
// distance-to-shore field, dithered depth bands, animated foam rings, wave
// dashes and sparkles), flowing river ribbons + waterfalls with scrolling
// pixel textures, and splash bits at the bottom of each fall.
import * as THREE from 'three';
import { X0, Z0, NX, NZ, CS } from './terrain.js';
import { mulberry32 } from '../../core/util.js';
import { pixelDiscGeo } from '../arenas/atmos.js';
import { CLOUD_GLSL } from './extras.js';

const col = (hex) => new THREE.Color(hex);

const OCEAN_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const OCEAN_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
uniform sampler2D uDist;
uniform vec4 uRect;
uniform vec3 cFoam, cShallow, cShallow2, cMid, cDeep, cDeepest, cDash, cCaustic, cSky;
varying vec3 vWorld;
${CLOUD_GLSL}
float bb2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bb2(0.5 * a) * 0.25 + bb2(a) + 0.03; }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 ramp(float d, float dith) {
  vec3 a; vec3 b; float f;
  if (d < 2.5) { a = cShallow; b = cShallow2; f = d / 2.5; }
  else if (d < 6.5) { a = cShallow2; b = cMid; f = (d - 2.5) / 4.0; }
  else if (d < 13.0) { a = cMid; b = cDeep; f = (d - 6.5) / 6.5; }
  else { a = cDeep; b = cDeepest; f = clamp((d - 13.0) / 12.0, 0.0, 1.0); }
  f = floor(f * 3.0 + dith) / 3.0;
  return mix(a, b, f);
}
void main() {
  vec2 cell = floor(vWorld.xz / 0.25);
  vec2 q = (cell + 0.5) * 0.25;
  vec2 uv = (q - uRect.xy) / uRect.zw;
  float d = 32.0;
  if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) d = texture2D(uDist, uv).r * 32.0;
  float dith = bayer4(cell);
  float wob = sin(q.x * 0.31 + uTime * 0.9) * 0.3 + sin(q.y * 0.27 - uTime * 0.7) * 0.3;
  float dd = max(0.0, d + wob * smoothstep(0.5, 3.0, d));
  vec3 c = ramp(dd, dith);
  // wave dashes drifting across the deep water
  float row = floor(cell.y / 6.0);
  float dir = mod(row, 2.0) * 2.0 - 1.0;
  float s = q.x * 0.5 + dir * uTime * 0.35 + h21(vec2(row, 3.0)) * 40.0;
  if (mod(cell.y, 6.0) < 1.0 && fract(s * 0.11) < 0.09 && d > 3.0) c = mix(c, cDash, 0.55);
  // caustic web dancing over the sandy shallows
  float cz = 1.0 - smoothstep(1.0, 5.5, d);
  if (cz > 0.0) {
    vec2 cq = q * 0.95;
    float c1 = abs(sin(cq.x * 1.7 + sin(cq.y * 1.3 + uTime * 0.9) * 1.4 + uTime * 0.6));
    float c2 = abs(sin(cq.y * 1.9 + sin(cq.x * 1.1 - uTime * 0.7) * 1.4 - uTime * 0.5));
    float caus = 1.0 - min(c1, c2);
    if (caus > 0.8 && cz > dith * 0.7) c = mix(c, cCaustic, 0.5 * cz);
  }
  // the bright horizon sky reflected at grazing angles (banded fresnel)
  vec3 V = normalize(vWorld - cameraPosition);
  float fr = pow(1.0 - abs(V.y), 5.0);
  fr = floor(fr * 4.0 + dith) / 4.0;
  c = mix(c, cSky, fr * 0.55);
  // drifting cloud shadows
  c *= cloudShade(vWorld.xz);
  // foam rings rolling into the shore
  float ph = fract(dd * 0.24 - uTime * 0.2);
  float ringZone = 1.0 - smoothstep(1.5, 8.0, d);
  if (ph < 0.075 && h21(cell) < ringZone * 1.1) c = mix(c, cFoam, 0.75);
  // surf line
  float surf = 0.55 + 0.35 * sin(uTime * 1.5 + q.x * 0.23 + q.y * 0.19);
  if (d < surf) c = cFoam;
  else if (d < surf + 0.35 && dith > 0.5) c = mix(c, cFoam, 0.6);
  // sparkles
  if (h21(cell + floor(uTime * 2.5) * 13.1) > 0.9975 && d > 1.5) c = cFoam;
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function makeOcean(T, size = 2600, opts = {}) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uRect: { value: new THREE.Vector4(...(T.distTex.userData.rect ?? [X0, Z0, NX * CS, NZ * CS])) },
      cFoam: { value: col(0xf4ffff) },
      cShallow: { value: col(0x7af0e0) },
      cShallow2: { value: col(0x2fd4d8) },
      cMid: { value: col(0x18aee0) },
      cDeep: { value: col(0x1886d8) },
      cDeepest: { value: col(0x1666c4) },
      cDash: { value: col(0xbff2ff) },
      cCaustic: { value: col(0xd8fff6) },
      cSky: { value: col(0xd4f2ff) },
    },
  ]);
  // cloud shadows (shared with the terrain): uniforms from opts.cloud, zero = none
  uniforms.uCloudT = opts.cloud?.uCloudT ?? { value: 0 };
  uniforms.uCloudZones = opts.cloud?.uCloudZones ?? { value: Array.from({ length: 16 }, () => new THREE.Vector4()) };
  uniforms.uDist = { value: T.distTex };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: OCEAN_VERT, fragmentShader: OCEAN_FRAG, fog: true });
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ocean';
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  return { mesh, update: (t) => { uniforms.uTime.value = t; } };
}

// ---------------------------------------------------------------------------
// Pixel textures for flowing water

function pixTex(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const fill = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

export function riverTexture() {
  return pixTex(16, 32, (ctx, w, h) => {
    const R = mulberry32(5);
    fill(ctx, 0, 0, w, h, '#2fc6e0');
    for (let y = 0; y < h; y++) for (let x = 2; x < w - 2; x++) if (R() < 0.18) fill(ctx, x, y, 1, 1, '#45d4ea');
    for (let k = 0; k < 9; k++) {
      const x = 2 + Math.floor(R() * (w - 4)), y = Math.floor(R() * h), l = 2 + Math.floor(R() * 4);
      fill(ctx, x, y, 1, l, '#8fecf6');
      if (R() < 0.5) fill(ctx, x, y, 1, 1, '#ffffff');
    }
    // foamy banks
    for (let y = 0; y < h; y++) {
      fill(ctx, 0, y, 1, 1, '#e8fcff');
      fill(ctx, w - 1, y, 1, 1, '#e8fcff');
      if (R() < 0.5) fill(ctx, 1, y, 1, 1, '#bff4fa');
      if (R() < 0.5) fill(ctx, w - 2, y, 1, 1, '#bff4fa');
    }
  });
}
export function fallsTexture() {
  return pixTex(16, 32, (ctx, w, h) => {
    const R = mulberry32(9);
    fill(ctx, 0, 0, w, h, '#8fe6f6');
    for (let x = 0; x < w; x++) {
      const base = R() < 0.4 ? '#c8f6fc' : R() < 0.5 ? '#6fd8ee' : '#8fe6f6';
      fill(ctx, x, 0, 1, h, base);
      let y = Math.floor(R() * h);
      for (let k = 0; k < 3; k++) {
        const l = 3 + Math.floor(R() * 7);
        fill(ctx, x, y, 1, l, R() < 0.5 ? '#ffffff' : '#e4fbff');
        y = (y + l + 2 + Math.floor(R() * 8)) % h;
      }
    }
    fill(ctx, 0, 0, 1, h, '#ffffff');
    fill(ctx, w - 1, 0, 1, h, '#ffffff');
  });
}
/** Molten lava flow: hot streaks between drifting dark crust plates. */
export function lavaRiverTexture() {
  return pixTex(16, 32, (ctx, w, h) => {
    const R = mulberry32(17);
    fill(ctx, 0, 0, w, h, '#ff6a1f');
    for (let y = 0; y < h; y++) for (let x = 1; x < w - 1; x++) if (R() < 0.22) fill(ctx, x, y, 1, 1, R() < 0.5 ? '#ff8a2a' : '#e8481a');
    for (let k = 0; k < 7; k++) {
      const x = 2 + Math.floor(R() * (w - 5)), y = Math.floor(R() * h), l = 2 + Math.floor(R() * 4);
      fill(ctx, x, y, 2, l, '#8a2a10');
      fill(ctx, x, y, 1, l - 1, '#5a1a10');
    }
    for (let k = 0; k < 8; k++) {
      const x = 2 + Math.floor(R() * (w - 4)), y = Math.floor(R() * h), l = 2 + Math.floor(R() * 5);
      fill(ctx, x, y, 1, l, '#ffc04a');
      if (R() < 0.5) fill(ctx, x, y + 1, 1, 1, '#fff2a8');
    }
    // cooled crust banks
    for (let y = 0; y < h; y++) {
      fill(ctx, 0, y, 1, 1, R() < 0.5 ? '#3a1a14' : '#5a2216');
      fill(ctx, w - 1, y, 1, 1, R() < 0.5 ? '#3a1a14' : '#5a2216');
    }
  });
}
export function lavaFallsTexture() {
  return pixTex(16, 32, (ctx, w, h) => {
    const R = mulberry32(19);
    fill(ctx, 0, 0, w, h, '#ff7a22');
    for (let x = 0; x < w; x++) {
      fill(ctx, x, 0, 1, h, R() < 0.35 ? '#ffb040' : R() < 0.5 ? '#e8501a' : '#ff7a22');
      let y = Math.floor(R() * h);
      for (let k = 0; k < 2; k++) {
        const l = 3 + Math.floor(R() * 6);
        fill(ctx, x, y, 1, l, R() < 0.6 ? '#ffe07a' : '#7a2410');
        y = (y + l + 3 + Math.floor(R() * 8)) % h;
      }
    }
    fill(ctx, 0, 0, 1, h, '#5a1a10');
    fill(ctx, w - 1, 0, 1, h, '#5a1a10');
  });
}
/** Lava lake: crust plates with glowing seams. */
export function lavaLakeTexture() {
  return pixTex(32, 32, (ctx, w, h) => {
    const R = mulberry32(23);
    fill(ctx, 0, 0, w, h, '#ff7a22');
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(R() * w), y = Math.floor(R() * h), pw = 4 + Math.floor(R() * 6), ph = 3 + Math.floor(R() * 5);
      fill(ctx, x, y, pw, ph, '#6a2010');
      fill(ctx, x + 1, y + 1, pw - 2, ph - 2, '#4a1610');
      if (R() < 0.6) fill(ctx, x + 1, y + 1, 1, 1, '#8a3016');
    }
    for (let i = 0; i < 26; i++) fill(ctx, Math.floor(R() * w), Math.floor(R() * h), 1, 1, R() < 0.5 ? '#ffd060' : '#fff2a8');
  });
}
export function lagoonTexture() {
  return pixTex(32, 32, (ctx, w, h) => {
    const R = mulberry32(13);
    fill(ctx, 0, 0, w, h, '#3fdcd8');
    for (let i = 0; i < 70; i++) fill(ctx, Math.floor(R() * w), Math.floor(R() * h), 1, 1, R() < 0.5 ? '#5fe8e0' : '#2cc8d0');
    for (let i = 0; i < 8; i++) { const x = Math.floor(R() * w), y = Math.floor(R() * h); fill(ctx, x, y, 3, 1, '#c8fbf6'); }
    for (let i = 0; i < 4; i++) fill(ctx, Math.floor(R() * w), Math.floor(R() * h), 1, 1, '#ffffff');
  });
}

/**
 * River + waterfall ribbons following the terrain's river samples
 * (each { x, z, y (water level), w (half width) }).
 */
export function makeRiver(samples, opts = {}) {
  const lava = !!opts.lava;
  const flat = { pos: [], uv: [], idx: [] }, falls = { pos: [], uv: [], idx: [] };
  const splashes = [];
  const n = samples.length;
  const side = (k) => {
    const a = samples[Math.max(0, k - 2)], b = samples[Math.min(n - 1, k + 2)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l; tz /= l;
    return [-tz, tx];
  };
  const quad = (G, a, b, c, d, v0, v1) => {
    const base = G.pos.length / 3;
    G.pos.push(...a, ...b, ...c, ...d);
    G.uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    G.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  const edge = (k, y, ext = 0) => {
    const S = samples[Math.min(n - 1, k)];
    const [ax, az] = side(k);
    const w = S.w + ext;
    return [[S.x - ax * w, y, S.z - az * w], [S.x + ax * w, y, S.z + az * w]];
  };
  // drops + "rapids" (flats squeezed between nearby drops render as white water)
  const isDrop = (k) => k >= 0 && k < n - 1 && samples[k].y - samples[k + 1].y > 0.05;
  const nearDrop = (k) => { for (let d = -3; d <= 3; d++) if (isDrop(k + d)) return true; return false; };
  let v = 0, casTop = null;
  for (let k = 0; k < n - 1; k++) {
    const A = samples[k], B = samples[k + 1];
    const hz = Math.hypot(B.x - A.x, B.z - A.z);
    const dy = A.y - B.y;
    if (dy > 0.05 && k + 2 < n) {
      // drop: the top surface overhangs to k+2, then a vertical sheet falls to the lower pool
      if (casTop === null) casTop = A.y;
      const [a0, a1] = edge(k, A.y), [b0, b1] = edge(k + 2, A.y, 0.05);
      quad(nearDrop(k - 1) && isDrop(k - 2) ? falls : flat, a0, a1, b1, b0, v / 2, (v + hz * 2) / 2);
      const [c0, c1] = edge(k + 2, B.y - 0.02, 0.05);
      const fb = falls.pos.length / 3;
      falls.pos.push(...b0, ...b1, ...c1, ...c0);
      falls.uv.push(0, 0, 1, 0, 1, dy / 2, 0, dy / 2);
      falls.idx.push(fb, fb + 2, fb + 1, fb, fb + 3, fb + 2);
      let more = false;
      for (let d = 1; d <= 4; d++) if (isDrop(k + d)) more = true;
      if (!more) {
        const S = samples[k + 2];
        if (casTop - B.y > 0.9) splashes.push({ x: S.x, y: B.y, z: S.z, w: S.w, h: casTop - B.y });
        casTop = null;
      }
      v += hz;
      continue;
    }
    const [a0, a1] = edge(k, A.y), [b0, b1] = edge(k + 1, B.y);
    quad(nearDrop(k) && casTop !== null ? falls : flat, a0, a1, b1, b0, v / 2, (v + hz) / 2);
    v += hz;
  }
  const mk = (G, tex, name) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(G.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(G.uv, 2));
    geo.setIndex(G.idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
    if (lava) mat.color.setScalar(1.3); // hot, but under the bloom threshold
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    return m;
  };
  const rTex = lava ? lavaRiverTexture() : riverTexture(), fTex = lava ? lavaFallsTexture() : fallsTexture();
  const group = new THREE.Group();
  group.name = lava ? 'lavaRiver' : 'river';
  group.add(mk(flat, rTex, 'riverFlat'), mk(falls, fTex, 'riverFalls'));

  // splash bits: little white voxels bursting at the foot of each fall
  const per = 26;
  const bitMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  if (lava) bitMat.color.setRGB(2.2, 0.75, 0.2); // tiny blooming lava spatters
  const bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), bitMat, Math.max(1, splashes.length * per));
  bits.name = 'splash';
  bits.frustumCulled = false;
  const R = mulberry32(3);
  const seeds = [];
  for (let s = 0; s < splashes.length; s++) for (let i = 0; i < per; i++) seeds.push({ s, ph: R(), a: R() * Math.PI * 2, r: 0.4 + R() * 1.0, up: 0.8 + R() * 1.6, sz: 0.6 + R() * 0.9 });
  group.add(bits);
  // mist puffs (flat foam rings) under big falls
  const mist = [];
  for (const S of splashes) {
    if (S.h < 2.5 || lava) continue;
    const ringGeo = pixelDiscGeo(Math.round((S.w * 1.2 + 0.3) * 4) / 4, 0, 0.25).clone();
    ringGeo.rotateX(-Math.PI / 2);
    const ringM = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xe8fcff, transparent: true, opacity: 0.85, depthWrite: false }));
    ringM.position.set(S.x, S.y + 0.03, S.z);
    group.add(ringM);
    mist.push(ringM);
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const update = (dt, t) => {
    rTex.offset.y = -t * (lava ? 0.16 : 0.55);
    fTex.offset.y = -t * (lava ? 0.5 : 1.6);
    seeds.forEach((b, i) => {
      const S = splashes[b.s];
      const k = (t * (lava ? 0.45 : 0.9) + b.ph) % 1;
      const big = Math.min(2, 0.6 + S.h / 6);
      p.set(S.x + Math.cos(b.a) * b.r * k * S.w * 0.9, S.y + 0.1 + Math.sin(k * Math.PI) * b.up * big * 0.7, S.z + Math.sin(b.a) * b.r * k * S.w * 0.9);
      const s = b.sz * (1 - k) * big;
      sc.set(s, s, s);
      m4.compose(p, q, sc);
      bits.setMatrixAt(i, m4);
    });
    bits.instanceMatrix.needsUpdate = true;
    mist.forEach((m, i) => { const s = 1 + Math.sin(t * 3 + i) * 0.08; m.scale.set(s, 1, s); });
  };
  return { group, update, splashes };
}

/** Flat water surface over terrain columns (row runs merged). cols: [[i, j], ...] */
export function columnWater(cols, y, grid, mat) {
  const { X0, Z0, CS } = grid;
  const rows = new Map();
  for (const [i, j] of cols) { if (!rows.has(j)) rows.set(j, []); rows.get(j).push(i); }
  const pos = [], uv = [], idx = [];
  for (const [j, is] of rows) {
    is.sort((a, b) => a - b);
    for (let s = 0; s < is.length; ) {
      let e = s;
      while (e + 1 < is.length && is[e + 1] === is[e] + 1) e++;
      const x0 = X0 + is[s] * CS, x1 = X0 + (is[e] + 1) * CS, z0 = Z0 + j * CS, z1 = z0 + CS;
      const b = pos.length / 3;
      pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0);
      uv.push(x0 / 4, z0 / 4, x0 / 4, z1 / 4, x1 / 4, z1 / 4, x1 / 4, z0 / 4);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      s = e + 1;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return new THREE.Mesh(geo, mat);
}
