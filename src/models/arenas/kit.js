// Arena environment kit: shared helpers for building (a) side-view battle
// arenas (voxel lane + 3D scenery + layered 2D pixel-art parallax backgrounds)
// and (b) Beast Island zone dioramas.
//
// Battle arena layout (see src/game/battle/field.js):
//   * lane ground top at y = 0, x in [-22, 22], z in [-LANE_HALF, LANE_HALF]
//   * Labs stand at x = ±12, guard turrets at x = ±7.2 (added by the battle view)
//   * the camera sits at z ≈ +24..34 looking at the lane slightly from above,
//     panning in x within ±(VIEW_X - halfView). Keep tall things out of z 0.6..7.
//   * background scenery z < -3, landmarks around z -12..-30, parallax pixel
//     layers far behind (z -50..-160), sky is a screen-space gradient.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh } from '../../core/voxel.js';
import { mulberry32, hash3, shade, mixHex, clamp } from '../../core/util.js';
import { greedyGeometry, buildGreedy } from '../props/greedy.js';
import { instanced, vgeo, glassMat, glowMat, text, textW, vnoise, PAL, css } from '../props/common.js';
import { FIELD } from '../../game/battle/field.js';

export { THREE, VoxGrid, Mats, makeMesh, mulberry32, hash3, shade, mixHex, clamp, greedyGeometry, buildGreedy, instanced, vgeo, glassMat, glowMat, text, textW, vnoise, PAL, css, FIELD };

// ---------------------------------------------------------------------------
// Pixel-art canvas painting helpers (all coordinates in texture pixels)

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither threshold 0..1 at pixel (x,y). */
export const bayer = (x, y) => (BAYER4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}
export const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];

/**
 * Vertical gradient quantised into bands with Bayer dithering between them
 * (classic pixel-art sky). stops: [[t, hex], ...] t in 0..1 (top -> bottom).
 */
export function paintGradient(ctx, x0, y0, w, h, stops, o = {}) {
  const bands = o.bands ?? 10;
  const img = ctx.getImageData(x0, y0, w, h);
  const d = img.data;
  const colAt = (t) => {
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [ta, ca] = stops[i], [tb, cb] = stops[Math.min(i + 1, stops.length - 1)];
    const k = tb === ta ? 0 : clamp((t - ta) / (tb - ta), 0, 1);
    return mixHex(ca, cb, k);
  };
  for (let y = 0; y < h; y++) {
    const t = y / Math.max(1, h - 1);
    const q = t * bands;
    const b0 = Math.floor(q), f = q - b0;
    for (let x = 0; x < w; x++) {
      const band = f > bayer(x, y) ? b0 + 1 : b0;
      const [r, g, b] = rgb(colAt(Math.min(1, band / bands)));
      const i = (y * w + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, x0, y0);
}

/** Fill a rect. */
export function px(ctx, x, y, w, h, hex, a = 1) {
  ctx.globalAlpha = a;
  ctx.fillStyle = css(hex);
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}

/** Pixel disc. */
export function disc(ctx, cx, cy, r, hex) {
  ctx.fillStyle = css(hex);
  for (let y = -r; y <= r; y++) {
    const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
    ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1);
  }
}

/**
 * Puffy pixel clouds with a lit top and shaded bottom.
 * o: { n, y0, y1, seed, color, shade, light, size }
 */
export function paintClouds(ctx, w, h, o = {}) {
  const R = mulberry32(o.seed ?? 7);
  const n = o.n ?? 6;
  const base = o.color ?? 0xffffff, dark = o.shade ?? 0xc9dcf2, light = o.light ?? 0xffffff;
  for (let i = 0; i < n; i++) {
    const cx = R() * w, cy = (o.y0 ?? 6) + R() * ((o.y1 ?? h * 0.4) - (o.y0 ?? 6));
    const s = (o.size ?? 7) * (0.6 + R() * 0.8);
    const puffs = 4 + Math.floor(R() * 4);
    const pts = [];
    for (let k = 0; k < puffs; k++) pts.push([cx + (k - puffs / 2) * s * 0.8 + (R() - 0.5) * s * 0.5, cy - R() * s * 0.6, s * (0.55 + R() * 0.5)]);
    for (const [x, y, r] of pts) disc(ctx, x, y + 2, Math.round(r), dark);
    for (const [x, y, r] of pts) disc(ctx, x, y, Math.round(r), base);
    for (const [x, y, r] of pts) disc(ctx, x - r * 0.25, y - r * 0.3, Math.max(1, Math.round(r * 0.45)), light);
    // flat bottom
    px(ctx, Math.round(cx - puffs * s * 0.45), Math.round(cy + s * 0.55), Math.round(puffs * s * 0.9), 2, dark);
  }
}

/** Twinkly pixel stars. */
export function paintStars(ctx, w, h, o = {}) {
  const R = mulberry32(o.seed ?? 3);
  for (let i = 0; i < (o.n ?? 80); i++) {
    const x = Math.floor(R() * w), y = Math.floor(R() * (o.ymax ?? h * 0.6));
    const big = R() < 0.12;
    px(ctx, x, y, 1, 1, R() < 0.3 ? (o.tint ?? 0xbfe6ff) : 0xffffff, 0.6 + R() * 0.4);
    if (big) { px(ctx, x - 1, y, 3, 1, 0xffffff, 0.5); px(ctx, x, y - 1, 1, 3, 0xffffff, 0.5); }
  }
}

/**
 * Ridge / hills / mountains silhouette band from a jagged top line down to the
 * bottom of the canvas, with a lit rim, texture specks and optional snow caps.
 * o: { color, rim, dark, base (0..1 of h, average top), amp (px), freq, seed, jag (0..1), snow, speck }
 */
export function paintRidge(ctx, w, h, o = {}) {
  const base = (o.base ?? 0.5) * h, amp = o.amp ?? h * 0.2, freq = o.freq ?? 0.02, seed = o.seed ?? 1, jag = o.jag ?? 0.2;
  const tops = [];
  for (let x = 0; x < w; x++) {
    let v = vnoise(x * freq + seed * 13.1, seed, 0.5) * 0.75 + vnoise(x * freq * 3.1 + seed * 5, 1.5, seed) * 0.25 * (1 + jag * 2);
    if (o.peaks) v = Math.pow(v, 1.6) * 1.4;
    tops.push(Math.round(base - (v - 0.5) * 2 * amp));
  }
  for (let x = 0; x < w; x++) {
    const t = clamp(tops[x], 0, h);
    px(ctx, x, t, 1, h - t, o.color ?? 0x4a8a5a);
    if (o.dark) {
      // vertical shading strips on the right-hand slopes
      if (x > 0 && tops[x] > tops[x - 1]) px(ctx, x, t, 1, h - t, o.dark, 0.35);
    }
    px(ctx, x, t, 1, 1, o.rim ?? shade(o.color ?? 0x4a8a5a, 0.25));
    if (o.snow && t < base - amp * 0.35) px(ctx, x, t, 1, Math.max(1, Math.round((base - amp * 0.35 - t) * 0.6)), o.snow);
  }
  if (o.speck) {
    const R = mulberry32(seed * 31);
    for (let i = 0; i < w * (o.speckN ?? 0.6); i++) {
      const x = Math.floor(R() * w);
      const y = tops[x] + 2 + Math.floor(R() * (h - tops[x]));
      px(ctx, x, y, 1, 1, o.speck, 0.7);
    }
  }
  return tops;
}

/**
 * City / building skyline silhouettes with lit windows.
 * o: { color, rim, window, base, minH, maxH, minW, maxW, seed, gap, antenna }
 */
export function paintSkyline(ctx, w, h, o = {}) {
  const R = mulberry32(o.seed ?? 5);
  let x = -4;
  while (x < w) {
    const bw = Math.floor((o.minW ?? 6) + R() * ((o.maxW ?? 16) - (o.minW ?? 6)));
    const bh = Math.floor((o.minH ?? 10) + R() * ((o.maxH ?? h * 0.6) - (o.minH ?? 10)));
    const top = h - bh;
    px(ctx, x, top, bw, bh, o.color ?? 0x2a3266);
    px(ctx, x, top, bw, 1, o.rim ?? shade(o.color ?? 0x2a3266, 0.3));
    if (o.window) {
      for (let wy = top + 3; wy < h - 2; wy += 3)
        for (let wx = x + 2; wx < x + bw - 1; wx += 3) if (R() < (o.lit ?? 0.45)) px(ctx, wx, wy, 1, 1, Array.isArray(o.window) ? o.window[Math.floor(R() * o.window.length)] : o.window);
    }
    if (o.antenna && R() < 0.3) px(ctx, x + Math.floor(bw / 2), top - 4, 1, 4, o.color ?? 0x2a3266);
    x += bw + Math.floor(R() * (o.gap ?? 3));
  }
}

/** Row of pixel trees (round or pine) standing on a baseline y. */
export function paintTrees(ctx, w, y, o = {}) {
  const R = mulberry32(o.seed ?? 11);
  for (let x = -6; x < w + 6; x += (o.step ?? 7) + Math.floor(R() * (o.jitter ?? 6))) {
    const s = (o.size ?? 6) * (0.7 + R() * 0.6);
    const col = o.color ?? 0x2f7a3a, dark = o.dark ?? shade(col, -0.25), light = o.light ?? shade(col, 0.25);
    if (o.kind === 'pine') {
      const hgt = Math.round(s * 2.2);
      for (let i = 0; i < hgt; i++) {
        const hw = Math.round((i / hgt) * s * 0.8);
        px(ctx, x - hw, y - hgt + i, hw * 2 + 1, 1, i % 3 === 0 ? dark : col);
        px(ctx, x - hw, y - hgt + i, 1, 1, light);
      }
      px(ctx, x, y, 1, 2, o.trunk ?? 0x5a3a20);
    } else if (o.kind === 'palm') {
      const hgt = Math.round(s * 2.4);
      for (let i = 0; i < hgt; i++) px(ctx, x + Math.round(Math.sin(i * 0.18) * 1.5), y - i, 1, 1, o.trunk ?? 0x8a6a3a);
      const tx = x + Math.round(Math.sin(hgt * 0.18) * 1.5), ty = y - hgt;
      for (const [dx, dy] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) for (let k = 1; k <= s; k++) px(ctx, tx + dx * k, ty + dy * Math.round(k * k / s * 0.6), 1, 1, k % 2 ? col : dark);
    } else {
      px(ctx, x, y - Math.round(s * 0.6), 1, Math.round(s * 0.6) + 1, o.trunk ?? 0x5a3a20);
      disc(ctx, x, y - s * 1.1, Math.round(s * 0.75), dark);
      disc(ctx, x, y - s * 1.25, Math.round(s * 0.65), col);
      disc(ctx, x - s * 0.25, y - s * 1.45, Math.max(1, Math.round(s * 0.28)), light);
    }
  }
}

/** Soft pixel sun / moon with a glow halo. */
export function paintSun(ctx, cx, cy, r, color = 0xfff2b0, halo = 0xfff8d8) {
  for (let k = 3; k >= 1; k--) {
    ctx.globalAlpha = 0.12 * k;
    disc(ctx, cx, cy, r + k * 3, halo);
  }
  ctx.globalAlpha = 1;
  disc(ctx, cx, cy, r, color);
  disc(ctx, cx - r * 0.3, cy - r * 0.3, Math.max(1, Math.round(r * 0.35)), shade(color, 0.4));
}

// ---------------------------------------------------------------------------
// Textures

const texCache = new Map();
/** Cached nearest-filtered canvas texture. paint(ctx, w, h). */
export function canvasTex(id, w, h, paint, o = {}) {
  let t = texCache.get(id);
  if (!t) {
    const ctx = canvas(w, h);
    paint(ctx, w, h);
    t = new THREE.CanvasTexture(ctx.canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = o.mip === false ? THREE.NearestFilter : THREE.NearestMipmapNearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = o.repeatX ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.wrapT = THREE.ClampToEdgeWrapping;
    texCache.set(id, t);
  }
  return t;
}

// ---------------------------------------------------------------------------
// Kit

export class ArenaKit {
  constructor(id, seed = 1) {
    this.id = id;
    this.root = new THREE.Group();
    this.root.name = 'arena:' + id;
    this.breakables = [];
    this.updaters = [];
    this.hotspots = {};
    this.R = mulberry32(seed * 7919 + id.length * 31);
  }
  add(o, parent = this.root) { parent.add(o); return o; }
  rand(a = 0, b = 1) { return a + this.R() * (b - a); }
  pick(arr) { return arr[Math.floor(this.R() * arr.length)]; }
  onUpdate(fn) { this.updaters.push(fn); return fn; }
  update(dt, t) { for (const u of this.updaters) u(dt, t); }

  /** Cached greedy voxel geometry (big, few triangles; no AO). opts.scale = voxel size. */
  geo(id, gridFn, opts = {}) {
    return opts.ao ? vgeo('ar_' + this.id + '_' + id, gridFn, { maxSamples: 60, ...opts }) : greedyGeometry('ar_' + this.id + '_' + id, gridFn, opts);
  }
  /** Static voxel mesh. o: { shadow, receive, mats, parent } */
  mesh(id, gridFn, opts = {}, x = 0, y = 0, z = 0, ry = 0, s = 1, o = {}) {
    const m = makeMesh(this.geo(id, gridFn, opts), o.mats ?? Mats.pair);
    m.name = id;
    m.position.set(x, y, z);
    m.rotation.y = ry;
    if (Array.isArray(s)) m.scale.set(...s); else m.scale.setScalar(s);
    m.castShadow = !!o.shadow;
    m.receiveShadow = o.receive !== false;
    return this.add(m, o.parent);
  }
  /** Instanced copies of one voxel prop. items: [[x,y,z,ry?,s?], ...] */
  inst(id, gridFn, opts, items, o = {}) {
    if (!items.length) return null;
    const im = instanced(this.geo(id, gridFn, opts), items, { shadow: o.shadow ?? false, receive: o.receive ?? true, mats: o.mats });
    im.name = id;
    return this.add(im, o.parent);
  }
  /**
   * Breakable prop near the lane (gets knocked around / shattered by big
   * impacts during battles, then respawns). Built with per-voxel geometry so
   * it can shatter into cubes.
   */
  breakable(kind, id, gridFn, opts, x, z, ry = 0, s = 1) {
    const g = new THREE.Group();
    g.name = 'breakable:' + kind;
    const m = makeMesh(vgeo('brk_' + this.id + '_' + id, gridFn, { maxSamples: 90, ...opts }));
    m.castShadow = true;
    g.add(m);
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    g.scale.setScalar(s);
    this.add(g);
    this.breakables.push({ obj: g, kind, x, z });
    return g;
  }

  /**
   * Battle lane ground as a voxel slab (top at y = 0).
   * o: { x0, x1, z0, z1, scale (voxel size, default 0.25), depth (voxels), color(ix, iz) -> hex, side (hex) }
   */
  lane(o = {}) {
    const s = o.scale ?? 0.25;
    const x0 = Math.round((o.x0 ?? -24) / s), x1 = Math.round((o.x1 ?? 24) / s);
    const z0 = Math.round((o.z0 ?? -FIELD.LANE_HALF) / s), z1 = Math.round((o.z1 ?? FIELD.LANE_HALF) / s) - 1;
    const depth = o.depth ?? 2;
    const m = this.mesh('lane', () => {
      const g = new VoxGrid();
      for (let x = x0; x < x1; x++)
        for (let z = z0; z <= z1; z++) {
          const c = o.color ? o.color(x, z, x * s, z * s) : 0xbfae86;
          g.set(x, -1, z, c);
          for (let y = 2; y <= depth; y++) g.set(x, -y, z, o.side ?? shade(c, -0.25));
          if (o.raise && o.raise(x, z)) g.set(x, 0, z, o.raiseColor ? o.raiseColor(x, z) : shade(c, 0.1));
        }
      return g;
    }, { scale: s, pivot: [0, 0, 0], jitter: o.jitter ?? 0.04 }, 0, 0, 0, 0, 1, { receive: true });
    return m;
  }

  /** Large flat surrounding ground (voxel scale 1 by default) with a colour function of world x,z. */
  ground(o = {}) {
    const s = o.scale ?? 1;
    const xs = Math.round((o.x0 ?? -90) / s), xe = Math.round((o.x1 ?? 90) / s), zs = Math.round((o.z0 ?? -70) / s), ze = Math.round((o.z1 ?? 14) / s);
    return this.mesh(o.id ?? 'ground', () => {
      const g = new VoxGrid();
      for (let x = xs; x < xe; x++) for (let z = zs; z < ze; z++) {
        if (o.skip && o.skip(x * s, z * s)) continue;
        g.set(x, -1, z, o.color ? o.color(x * s, z * s, x, z) : 0x5fbf4a);
      }
      return g;
    }, { scale: s, pivot: [0, 0, 0], jitter: o.jitter ?? 0.05 }, 0, o.y ?? -0.02, 0, 0, 1, { receive: true });
  }

  /**
   * Parallax pixel-art layer: a big unlit plane far behind the lane painted
   * on a low-res canvas (each texel shows up as a crisp "pixel").
   * o: { z (negative), y (bottom), w, h (world units), tw, th (texture px), paint(ctx, tw, th), fogTint: [hex, amount] }
   */
  parallax(id, o) {
    const tex = canvasTex('px_' + this.id + '_' + id, o.tw, o.th, (ctx, w, h) => {
      o.paint(ctx, w, h);
      if (o.fogTint) {
        ctx.globalCompositeOperation = 'source-atop';
        px(ctx, 0, 0, w, h, o.fogTint[0], o.fogTint[1]);
        ctx.globalCompositeOperation = 'source-over';
      }
    }, { repeatX: !!o.repeat });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, fog: false, depthWrite: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.w, o.h), mat);
    mesh.position.set(o.x ?? 0, (o.y ?? -1) + o.h / 2, o.z);
    mesh.renderOrder = -5;
    mesh.name = 'parallax:' + id;
    return this.add(mesh);
  }
}

/**
 * The battle camera rig (also used by the arena viewer): near-horizontal
 * Battle-Cats style view. Returns { pos, look } for a camera centred at camX
 * showing `width` world units of lane, with the lane at `laneFrac` of the
 * screen height from the top and the horizon at `horizonFrac`.
 */
export function battleCamera(camX, width, aspect, fov = 30, laneFrac = 0.6, horizonFrac = 0.34) {
  const tanV = Math.tan((fov * Math.PI) / 360);
  const dist = width / (2 * tanV * aspect);
  const pitch = Math.atan((0.5 - horizonFrac) * 2 * tanV);
  const laneAng = pitch + Math.atan((laneFrac - 0.5) * 2 * tanV);
  const y = 0.6 + dist * Math.tan(laneAng);
  return { pos: [camX, y, dist], look: [camX, y - dist * Math.tan(pitch), 0], dist };
}

/** Layer width that always covers the view for a parallax plane at depth z (< 0). */
export const parallaxWidth = (z, margin = 1.25) => Math.round((2 * (FIELD.VIEW_X + 2) + 2 * 17 * (34 - z) / 34) * margin);

/**
 * Screen-space sky background (scene.background) painted as a dithered pixel
 * gradient with optional extras (sun, stars, aurora...).
 * paint(ctx, w, h) runs after the gradient.
 */
export function skyTexture(id, stops, paint, o = {}) {
  return canvasTex('sky_' + id, o.w ?? 160, o.h ?? 90, (ctx, w, h) => {
    paintGradient(ctx, 0, 0, w, h, stops, { bands: o.bands ?? 12 });
    paint && paint(ctx, w, h);
  }, { mip: false });
}

// ---------------------------------------------------------------------------
// Small voxel brushes shared by arenas

/** Simple stylised voxel tree grid (round | pine | palm | candy). Voxel scale ~0.12. */
export function treeGrid(kind = 'round', o = {}) {
  const g = new VoxGrid();
  const leaf = o.leaf ?? 0x4cba3a, leafD = shade(leaf, -0.22), leafL = shade(leaf, 0.22), trunk = o.trunk ?? 0x7a4a26;
  const seed = o.seed ?? 1;
  if (kind === 'pine') {
    g.box(-1, 0, -1, 0, 5, 0, trunk);
    for (let i = 0; i < 4; i++) {
      const r = 6 - i * 1.4, y = 4 + i * 4;
      for (let x = -7; x <= 6; x++) for (let z = -7; z <= 6; z++) for (let yy = 0; yy < 4; yy++) {
        const rr = r - yy * 0.9;
        if ((x + 0.5) ** 2 + (z + 0.5) ** 2 <= rr * rr) g.set(x, y + yy, z, yy === 3 ? leafL : hash3(x, y + yy, z + seed) < 0.3 ? leafD : leaf);
      }
    }
    if (o.snow) g.paint((x, y, z, c) => (c !== trunk && !g.has(x, y + 1, z) ? 0xffffff : undefined));
  } else if (kind === 'palm') {
    for (let y = 0; y < 18; y++) g.box(Math.round(Math.sin(y * 0.15) * 2) - 1, y, -1, Math.round(Math.sin(y * 0.15) * 2), y, 0, y % 3 === 0 ? shade(trunk, -0.15) : trunk);
    const tx = Math.round(Math.sin(18 * 0.15) * 2);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      for (let k = 0; k < 8; k++) {
        const x = Math.round(tx + dx * k), z = Math.round(dz * k), y = 18 + Math.round(2 - (k * k) / 12);
        g.set(x, y, z, k % 3 === 0 ? leafD : leaf);
        g.set(x, y - 1, z, leafD);
      }
    }
    g.box(tx - 1, 17, -1, tx, 18, 0, 0x8a5a2a);
  } else {
    g.box(-1, 0, -1, 0, 6, 0, trunk);
    const cy = 10;
    for (let x = -6; x <= 5; x++) for (let y = cy - 5; y <= cy + 5; y++) for (let z = -6; z <= 5; z++) {
      const d = ((x + 0.5) / 5.6) ** 2 + ((y - cy) / 5) ** 2 + ((z + 0.5) / 5.6) ** 2;
      if (d > 1 + (hash3(x, y, z + seed) - 0.5) * 0.25) continue;
      g.set(x, y, z, y > cy + 2 ? leafL : y < cy - 2 ? leafD : hash3(x, y, z) < 0.25 ? leafD : leaf);
    }
  }
  return g;
}

/** Rounded rock grid. */
export function rockGrid(o = {}) {
  const g = new VoxGrid();
  const c = o.color ?? 0x9aa2b4, r = o.r ?? 3;
  for (let x = -r - 1; x <= r; x++) for (let y = 0; y <= r * 1.3; y++) for (let z = -r - 1; z <= r; z++) {
    const d = ((x + 0.5) / (r + 0.5)) ** 2 + (y / (r * 1.2)) ** 2 + ((z + 0.5) / (r + 0.5)) ** 2;
    if (d <= 1 + (hash3(x, y, z) - 0.5) * 0.3) g.set(x, y, z, y > r * 0.8 ? shade(c, 0.15) : hash3(x, y, z) < 0.3 ? shade(c, -0.12) : c);
  }
  return g;
}

/** Voxel billboard / sign board with pixel text on the +z face. */
export function signGrid(label, o = {}) {
  const g = new VoxGrid();
  const sc = o.textScale ?? 1;
  const W = textW(label, sc) + (o.pad ?? 3) * 2, H = 5 * sc + (o.pad ?? 3) * 2;
  const x0 = -Math.floor(W / 2);
  g.box(x0, o.legH ?? 0, 0, x0 + W - 1, (o.legH ?? 0) + H - 1, 1, o.bg ?? 0x15121f);
  g.box(x0, o.legH ?? 0, 0, x0 + W - 1, (o.legH ?? 0), 1, o.frame ?? 0xffd23f);
  g.box(x0, (o.legH ?? 0) + H - 1, 0, x0 + W - 1, (o.legH ?? 0) + H - 1, 1, o.frame ?? 0xffd23f);
  g.box(x0, o.legH ?? 0, 0, x0, (o.legH ?? 0) + H - 1, 1, o.frame ?? 0xffd23f);
  g.box(x0 + W - 1, o.legH ?? 0, 0, x0 + W - 1, (o.legH ?? 0) + H - 1, 1, o.frame ?? 0xffd23f);
  text(g, label, 0, (o.legH ?? 0) + (o.pad ?? 3), 2, '+z', o.color ?? 0xff2e88, { center: true, scale: sc, glow: o.glow !== false });
  if (o.legH) for (const lx of [x0 + 2, x0 + W - 3]) g.box(lx, 0, 0, lx, o.legH - 1, 1, o.leg ?? 0x5d6476);
  return g;
}
