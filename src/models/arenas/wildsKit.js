// Shared helpers for the Northern Wilds arenas (jungle, laser, haunted, reef,
// volcano, space): fast pixel buffers for painted skies/parallax, live
// instancing, cover-fit skies, scrolling pixel water / lava planes, flapping
// flyers, floating particles (embers, fireflies, bubbles, dust), twinkling
// glints, animated voxel flames, zone ground discs and hotspot anchors.
import {
  THREE, VoxGrid, Mats, makeMesh, mulberry32, hash3, shade, mixHex, clamp, vnoise, glowMat, canvasTex, px, disc, bayer,
} from './kit.js';
import { hdPixbuf } from './hdpaint.js';

// --------------------------------------------------------------------------- pixels

/** Direct pixel buffer for fast per-pixel painting (flush() writes it back). */
export function pixels(ctx, w, h) {
  if (ctx._hd) return hdPixbuf(ctx, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const api = {
    w, h,
    set(x, y, hex, a = 1) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return api;
      const i = (y * w + x) * 4;
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      if (a >= 1 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a >= 1 ? 255 : Math.round(255 * a); return api; }
      d[i] = d[i] * (1 - a) + r * a; d[i + 1] = d[i + 1] * (1 - a) + g * a; d[i + 2] = d[i + 2] * (1 - a) + b * a;
      return api;
    },
    rect(x, y, rw, rh, hex, a = 1) { for (let yy = y; yy < y + rh; yy++) for (let xx = x; xx < x + rw; xx++) this.set(xx, yy, hex, a); },
    alpha: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[((y | 0) * w + (x | 0)) * 4 + 3]),
    flush() { ctx.putImageData(img, 0, 0); },
  };
  return api;
}

/** Ridge band (jagged top, filled to the bottom) into a pixel buffer; returns the top line. */
export function ridge(P, o) {
  const tops = [];
  for (let x = 0; x < P.w; x++) {
    let v = vnoise(x * o.freq + o.seed * 13.1, o.seed, 0.5) * 0.7 + vnoise(x * o.freq * 3.3 + o.seed * 5, 1.5, o.seed) * 0.3;
    if (o.peaks) v = Math.pow(v, o.peaks) * 1.5;
    tops.push(Math.round(o.base - (v - 0.5) * 2 * o.amp));
  }
  for (let x = 0; x < P.w; x++) {
    const t = Math.max(0, tops[x]);
    for (let y = t; y < P.h; y++) {
      let c = o.color;
      if (o.dark && x > 0 && tops[x] > tops[x - 1] + 0) c = o.dark;
      if (o.band && (y - t) % o.band[0] === 0 && y > t) c = o.band[1];
      if (o.fade && y > t + o.fade[0]) c = bayer(x, y) < (y - t - o.fade[0]) / o.fade[1] ? o.fade[2] : c;
      P.set(x, y, c);
    }
    if (o.rim) P.set(x, t, o.rim);
  }
  return tops;
}

// --------------------------------------------------------------------------- instancing

const _D = new THREE.Object3D();
_D.rotation.order = 'YXZ';
export function setInst(im, i, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) {
  _D.position.set(x, y, z);
  _D.rotation.set(rx, ry, rz);
  if (Array.isArray(s)) _D.scale.set(s[0], s[1], s[2]); else _D.scale.setScalar(s);
  _D.updateMatrix();
  im.setMatrixAt(i, _D.matrix);
}
export function liveInst(K, id, gridFn, opts, n, o = {}) {
  const im = K.inst(id, gridFn, opts, Array.from({ length: n }, () => [0, -50, 0]), o);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  return im;
}

/** Keep a screen-space sky cover-fitted to the viewport (square pixels in portrait). */
export function fitSky(K, tex, texAspect = 16 / 9) {
  let last = 0;
  K.onUpdate(() => {
    const a = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : texAspect;
    if (Math.abs(a - last) < 1e-3) return;
    last = a;
    if (a < texAspect) { tex.repeat.set(a / texAspect, 1); tex.offset.set((1 - a / texAspect) / 2, 0); }
    else { tex.repeat.set(1, texAspect / a); tex.offset.set(0, 1 - texAspect / a); }
  });
}

// --------------------------------------------------------------------------- water / lava

/** Tileable pixel texture with ripples + sparkles. */
export function rippleTex(id, base, ripple, deep, spark, o = {}) {
  return canvasTex(id, o.size ?? 32, o.size ?? 32, (ctx, w, h) => {
    px(ctx, 0, 0, w, h, base);
    const R = mulberry32(id.length * 7 + (o.seed ?? 0));
    for (let i = 0; i < (o.n ?? 34); i++) { const x = R() * w | 0, y = R() * h | 0, l = 2 + (R() * 5 | 0); px(ctx, x, y, l, 1, R() < 0.55 ? ripple : deep); }
    for (let i = 0; i < (o.sparks ?? 7); i++) { const x = R() * w | 0, y = R() * h | 0; px(ctx, x, y, 2, 1, spark); }
    o.paint?.(ctx, w, h, R);
  }, { repeatX: true });
}

/** Flat plane (top at y) with a scrolling pixel texture and a vertex-colour gradient along z. */
export function scrollPlane(K, o) {
  const tex = o.tex.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(o.w / o.tile, o.d / o.tile);
  const geo = new THREE.PlaneGeometry(o.w, o.d, 1, o.segs ?? 12);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getZ(i) + o.d / 2) / o.d, 0, 1); // 0 = far edge, 1 = near edge
    c.setHex(o.grad ? o.grad(t) : 0xffffff);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, fog: o.fog ?? true });
  if (o.boost) mat.color.setScalar(o.boost);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(o.x ?? 0, o.y, o.z);
  m.name = o.name ?? 'water';
  if (o.renderOrder !== undefined) m.renderOrder = o.renderOrder;
  K.add(m, o.parent);
  K.onUpdate((dt, t) => {
    tex.offset.x = (t * (o.sx ?? 0.01)) % 1;
    tex.offset.y = (t * (o.sy ?? 0.004) + Math.sin(t * 0.6) * (o.wob ?? 0.02)) % 1;
  });
  return m;
}

/** Vertical scrolling sheet (waterfall / lava fall / light beam) with a pixel texture. */
export function fallSheet(K, o) {
  const tex = o.tex.clone();
  tex.needsUpdate = true;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(o.w / (o.tile ?? 2), o.h / (o.tile ?? 2));
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: !o.transparent, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: o.fog ?? true });
  if (o.boost) mat.color.setScalar(o.boost);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
  m.position.set(o.x, o.y + o.h / 2, o.z);
  m.rotation.y = o.ry ?? 0;
  m.name = o.name ?? 'falls';
  K.add(m, o.parent);
  K.onUpdate((dt, t) => { tex.offset.y = (t * (o.speed ?? 1.2)) % 1; });
  return m;
}

/** Pixel waterfall texture (vertical streaks). */
export function fallsTex(id, cols) {
  return canvasTex(id, 16, 32, (ctx, w, h) => {
    const R = mulberry32(id.length * 3);
    px(ctx, 0, 0, w, h, cols[0]);
    for (let x = 0; x < w; x++) {
      px(ctx, x, 0, 1, h, R() < 0.4 ? cols[1] : R() < 0.5 ? cols[2] : cols[0]);
      let y = Math.floor(R() * h);
      for (let k = 0; k < 3; k++) {
        const l = 3 + Math.floor(R() * 7);
        px(ctx, x, y, 1, l, R() < 0.5 ? cols[3] : cols[1]);
        y = (y + l + 2 + Math.floor(R() * 8)) % h;
      }
    }
  }, { repeatX: true });
}

// --------------------------------------------------------------------------- life

/**
 * Flapping flyers (birds / bats / parrots): body + 2 wings per flyer, each on
 * its own orbit. list: [{ cx, cy, cz, rx, rz, sp, ph, fl, s }]
 */
export function addFlyers(K, id, bodyFn, wingFn, opts, list, o = {}) {
  const bodies = liveInst(K, id + 'B', bodyFn, opts, list.length, { shadow: o.shadow ?? true });
  const wings = liveInst(K, id + 'W', wingFn, { ...opts, pivot: [0, 0, 0] }, list.length * 2, { shadow: o.shadow ?? true });
  const m4 = new THREE.Matrix4(), w4 = new THREE.Matrix4(), rz = new THREE.Matrix4(), ry = new THREE.Matrix4();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  K.onUpdate((dt, t) => {
    list.forEach((G, i) => {
      const a = G.ph + t * G.sp;
      p.set(G.cx + Math.cos(a) * G.rx, G.cy + Math.sin(t * 0.7 + G.ph) * (o.bob ?? 0.4), G.cz + Math.sin(a) * G.rz);
      const vx = -Math.sin(a) * G.rx * Math.sign(G.sp), vz = Math.cos(a) * G.rz * Math.sign(G.sp);
      e.set(0, Math.atan2(vx, vz), -Math.sign(G.sp) * (o.bank ?? 0.3), 'YXZ');
      q.setFromEuler(e);
      sc.setScalar(G.s ?? 1);
      m4.compose(p, q, sc);
      bodies.setMatrixAt(i, m4);
      const flap = Math.sin(t * G.fl + G.ph) * (o.flap ?? 0.6);
      for (const s of [1, -1]) {
        w4.makeTranslation(0, o.hinge ?? 0, 0);
        w4.multiply(rz.makeRotationZ(s * flap));
        if (s < 0) w4.multiply(ry.makeRotationY(Math.PI));
        m4.compose(p, q, sc).multiply(w4);
        wings.setMatrixAt(i * 2 + (s > 0 ? 0 : 1), m4);
      }
    });
    bodies.instanceMatrix.needsUpdate = true;
    wings.instanceMatrix.needsUpdate = true;
  });
  return { bodies, wings };
}
export const orbitList = (K, n, c, o = {}) => Array.from({ length: n }, () => ({
  cx: c[0] + K.rand(-1, 1) * (o.spread ?? 3), cy: c[1] + K.rand(0, o.dy ?? 2), cz: c[2] + K.rand(-1, 1) * (o.spread ?? 3),
  rx: K.rand(o.r0 ?? 3, o.r1 ?? 7), rz: K.rand(o.r0 ?? 3, o.r1 ?? 7) * (o.squash ?? 0.5), sp: K.rand(0.25, 0.45) * (K.R() < 0.5 ? -1 : 1), ph: K.rand(0, 6.28), fl: K.rand(o.f0 ?? 7, o.f1 ?? 11), s: K.rand(o.s0 ?? 0.9, o.s1 ?? 1.15),
}));

/**
 * Floating voxel particles (embers rising, fireflies wandering, snow / ash
 * falling, bubbles). area: [x0, x1, y0, y1, z0, z1]. o: { color (hex or
 * array), glow (HDR mult, > 1.75 blooms), size [a, b], vy (units/s, + up),
 * drift, twinkle, n }.
 */
export function addParticles(K, n, area, o = {}) {
  const [x0, x1, y0, y1, z0, z1] = area;
  const cols = Array.isArray(o.color) ? o.color : [o.color ?? 0xffffff];
  const mats = cols.map((c) => {
    const m = new THREE.MeshBasicMaterial({ color: c, fog: o.fog ?? true });
    if (o.glow) m.color.multiplyScalar(o.glow);
    return m;
  });
  const per = Math.ceil(n / cols.length);
  const R = mulberry32(o.seed ?? n * 7 + 3);
  const groups = mats.map((mat) => {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, per);
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    K.add(im);
    const ps = Array.from({ length: per }, () => ({ x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0), z: z0 + R() * (z1 - z0), ph: R() * 6.28, v: 0.6 + R() * 0.8, s: (o.size?.[0] ?? 0.05) + R() * ((o.size?.[1] ?? 0.1) - (o.size?.[0] ?? 0.05)) }));
    return { im, ps };
  });
  const vy = o.vy ?? 0.4, drift = o.drift ?? 0.3;
  K.onUpdate((dt, t) => {
    for (const { im, ps } of groups) {
      ps.forEach((p, i) => {
        p.y += vy * p.v * dt;
        p.x += Math.sin(t * 0.7 + p.ph) * drift * dt + (o.wind ?? 0) * dt;
        p.z += Math.cos(t * 0.5 + p.ph * 1.3) * drift * 0.5 * dt;
        if (p.y > y1) { p.y = y0; p.x = x0 + ((p.x - x0 + 7.31) % (x1 - x0)); }
        if (p.y < y0) { p.y = y1; p.x = x0 + ((p.x - x0 + 3.7) % (x1 - x0)); }
        if (p.x > x1) p.x -= x1 - x0;
        if (p.x < x0) p.x += x1 - x0;
        let s = p.s;
        if (o.twinkle) s *= Math.max(0.001, Math.sin(t * o.twinkle * p.v + p.ph));
        if (o.fadeTop) s *= clamp((y1 - p.y) / ((y1 - y0) * 0.35), 0, 1);
        setInst(im, i, p.x, p.y, p.z, t * p.v + p.ph, p.ph, 0, Math.max(0.0001, s));
      });
      im.instanceMatrix.needsUpdate = true;
    }
  });
  return groups.map((g) => g.im);
}

/** Twinkling star glints (small blooming cubes). spots: [x, y, z, spreadXZ, spreadY] */
export function addGlints(K, spots, n, rgb = [2.4, 2.2, 1.6]) {
  const mat = glowMat(0xffffff).clone();
  mat.color.setRGB(...rgb);
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  K.add(im);
  const R = mulberry32(9 + n);
  const g = Array.from({ length: n }, () => { const s = spots[Math.floor(R() * spots.length)]; return { x: s[0] + (R() - 0.5) * s[3], y: s[1] + R() * s[4], z: s[2] + (R() - 0.5) * s[3] * 0.6, ph: R(), sp: 0.3 + R() * 0.5 }; });
  K.onUpdate((dt, t) => {
    g.forEach((p, i) => { const q = (t * p.sp + p.ph) % 1; setInst(im, i, p.x, p.y, p.z, 0.785, 0.6, 0, q < 0.15 ? Math.sin((q / 0.15) * Math.PI) * 0.09 : 0.0001); });
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

/** One frame of a voxel flame (glow voxels). */
export const flameFrame = (f, cols = [0xfff07a, 0xffb02a, 0xff7a1a, 0xff5a1a], h = 8) => () => {
  const g = new VoxGrid();
  const R = mulberry32(53 + f * 11);
  for (let y = 0; y < h; y++) {
    const r = Math.max(0, 2.2 - y * (2.2 / h) * 1.1 + (R() - 0.5) * 0.7);
    const sway = Math.round(Math.sin(y * 0.8 + f * 1.6) * (y / 6));
    for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) {
      const d = Math.hypot(x - sway, z);
      if (d > r) continue;
      const core = d < r * 0.45 && y < h / 2;
      g.set(x, y, z, y > h * 0.7 ? cols[3] : core ? cols[0] : y > h * 0.45 ? cols[2] : cols[1], true);
    }
  }
  return g;
};
/** Animated flames (4 frames, geometry swap) at points [[x, y, z, s?], ...]. */
export function addFlames(K, id, list, scale, cols, h) {
  const frames = [0, 1, 2, 3].map((f) => K.geo(id + f, flameFrame(f, cols, h), { scale, pivot: [0.5, 0, 0.5] }));
  list.forEach(([x, y, z, s = 1], i) => {
    const m = makeMesh(frames[0], Mats.pair);
    m.castShadow = false;
    m.position.set(x - 0.5 * scale * s, y, z - 0.5 * scale * s);
    m.scale.setScalar(s);
    K.add(m);
    const ph = i * 1.71;
    K.onUpdate((dt, t) => {
      m.geometry = frames[Math.floor(t * 10 + ph * 3) % 4];
      m.scale.y = s * (0.85 + Math.sin(t * 15 + ph) * 0.1);
    });
  });
}

// --------------------------------------------------------------------------- zone helpers

/**
 * Round voxel ground disc for a Beast Island diorama (top at y = 0): a
 * wobbly-edged top surface over layered strata. colorTop(x, z, r, R) and
 * colorSide(x, y, z) work in voxel units.
 */
export function zoneDisc(K, id, o) {
  const s = o.scale ?? 0.25, R0 = o.r ?? 21, depth = o.depth ?? 5;
  return K.mesh(id, () => {
    const g = new VoxGrid();
    const n = Math.ceil(R0 + 3);
    for (let x = -n; x <= n; x++) for (let z = -n; z <= n; z++) {
      const a = Math.atan2(z + 0.5, x + 0.5), r = Math.hypot(x + 0.5, z + 0.5);
      const R = R0 + Math.sin(a * 3 + (o.seed ?? 0)) * 1.2 + Math.sin(a * 7 + 2) * 0.6;
      if (r > R) continue;
      const top = o.colorTop(x, z, r, R);
      if (top === null) continue;
      g.set(x, 0, z, top);
      if (o.height) { const hh = o.height(x, z, r, R); for (let y = 1; y <= hh; y++) g.set(x, y, z, o.colorTop(x, z, r, R, y)); }
      for (let y = -1; y >= -depth; y--) g.set(x, y, z, o.colorSide(x, y, z, r, R));
    }
    return g;
  }, { scale: s, pivot: [0, 1, 0] }, 0, 0, 0, 0, 1, { receive: true });
}

/** Hotspot anchor (boss gate, NPC, secrets) in the zone diorama. */
export function anchor(K, name, x, y, z) {
  const o = new THREE.Object3D();
  o.position.set(x, y, z);
  o.name = name;
  K.root.add(o);
  K.hotspots[name] = o;
  return o;
}

export { THREE, VoxGrid, Mats, makeMesh, mulberry32, hash3, shade, mixHex, clamp, vnoise, glowMat, canvasTex, px, disc, bayer };
