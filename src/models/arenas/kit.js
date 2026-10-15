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
/**
 * "Cover"-fit a screen-space background texture to a viewport aspect so its
 * pixels stay square (crops the sides in portrait instead of stretching).
 */
export function coverFit(tex, aspect) {
  const img = tex?.image;
  if (!img?.width) return;
  const ta = img.width / img.height;
  if (aspect < ta) { tex.repeat.set(aspect / ta, 1); tex.offset.set((1 - aspect / ta) / 2, 0); }
  else { tex.repeat.set(1, ta / aspect); tex.offset.set(0, 1 - ta / aspect); }
}

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
  text(g, label, 0, (o.legH ?? 0) + (o.pad ?? 3), 2, '+z', o.color ?? 0xff2e88, { center: true, scale: sc, glow: !!o.glow }); // big glowing text hazes the whole screen with bloom: opt-in only
  if (o.legH) for (const lx of [x0 + 2, x0 + W - 3]) g.box(lx, 0, 0, lx, o.legH - 1, 1, o.leg ?? 0x5d6476);
  return g;
}

// ===========================================================================
// Postcard toolkit (detailed battle backdrops). Pixel-buffer sky painting
// (dithered glows, shaded cumulus, streaks, moons, aurora, lit mountain
// ranges), 3D voxel far layers (ranges, terrain), drifting voxel clouds,
// flapping voxel birds and cheap transform-only animated instancing (sway,
// blink, puffs, sparkles, voxel waterfalls, waving flags). Animations go
// through K.onUpdate and never allocate per frame.

/** Direct pixel access to a canvas region at (0,0)..(w,h). Call flush() when done. */
export function pixbuf(ctx, w, h) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  const P = {
    w, h, d,
    get(x, y) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h) return -1;
      const i = (y * w + x) * 4;
      return d[i + 3] ? (d[i] << 16) | (d[i + 1] << 8) | d[i + 2] : -1;
    },
    set(x, y, hex, a = 1) {
      x |= 0; y |= 0;
      if (x < 0 || y < 0 || x >= w || y >= h || a <= 0) return;
      const i = (y * w + x) * 4;
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      if (a >= 1 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a >= 1 ? 255 : Math.round(255 * a); return; }
      d[i] += (r - d[i]) * a; d[i + 1] += (g - d[i + 1]) * a; d[i + 2] += (b - d[i + 2]) * a;
      d[i + 3] = Math.max(d[i + 3], Math.round(255 * a));
    },
    /** Blend toward hex by f (0..1) quantised to `bands` levels with ordered dithering. */
    dither(x, y, hex, f, bands = 4) {
      if (f <= 0) return;
      const q = Math.min(1, f) * bands, b0 = Math.floor(q);
      const lvl = (b0 + (q - b0 > bayer(x, y) ? 1 : 0)) / bands;
      if (lvl > 0) P.set(x, y, hex, lvl);
    },
    rect(x, y, rw, rh, hex, a = 1) { for (let yy = y | 0; yy < (y | 0) + rh; yy++) for (let xx = x | 0; xx < (x | 0) + rw; xx++) P.set(xx, yy, hex, a); },
    disc(cx, cy, r, hex, a = 1) {
      for (let y = -r; y <= r; y++) {
        const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
        for (let x = -hw; x <= hw; x++) P.set(Math.round(cx) + x, Math.round(cy) + y, hex, a);
      }
    },
    flush() { ctx.putImageData(img, 0, 0); },
  };
  return P;
}

/** Soft elliptical glow blended into the pixels with dithered bands (sun halos, horizon glow, nebulae). */
export function skyGlow(P, cx, cy, rx, ry, hex, strength = 1, o = {}) {
  const bands = o.bands ?? 5, pow = o.pow ?? 2;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    if (d < 1) P.dither(x, y, hex, strength * Math.pow(1 - d, pow), bands);
  }
}

/** Pixel sun: dithered halo rings, optional rays, shaded disc. o: { color, core, halo, halo2, rays, rayColor, rayLen } */
export function paintSunPx(P, cx, cy, r, o = {}) {
  const col = o.color ?? 0xfff0b0, core = o.core ?? 0xffffff, halo = o.halo ?? 0xfff6d8;
  skyGlow(P, cx, cy, r * (o.haloR ?? 5), r * (o.haloR ?? 5), halo, o.haloA ?? 0.55, { bands: 6, pow: 1.6 });
  skyGlow(P, cx, cy, r * 2.2, r * 2.2, o.halo2 ?? halo, 0.85, { bands: 4, pow: 1.2 });
  if (o.rays) {
    const n = o.rays, len = r * (o.rayLen ?? 6);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (o.rayRot ?? 0.2);
      const wide = k % 2 ? 1 : 2;
      for (let t = r * 1.6; t < len; t += 0.5) {
        const f = (1 - (t - r * 1.6) / (len - r * 1.6)) * 0.45;
        for (let w0 = -wide + 1; w0 < wide; w0++) {
          const x = cx + Math.cos(a) * t - Math.sin(a) * w0, y = cy + Math.sin(a) * t + Math.cos(a) * w0;
          P.dither(Math.round(x), Math.round(y), o.rayColor ?? halo, f, 3);
        }
      }
    }
  }
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.3) continue;
    const lit = (x + y) / (r * 2);
    let c = col;
    if (d < r * 0.55 && lit < 0) c = core;
    else if (lit > 0.42 && d > r * 0.6) c = shade(col, -0.06);
    P.set(cx + x, cy + y, c);
  }
}

/** Pixel moon with craters and a dithered terminator. o: { color, dark, phase (-1..1, + = lit from the left), halo } */
export function paintMoonPx(P, cx, cy, r, o = {}) {
  const col = o.color ?? 0xf4f2e4, dark = o.dark ?? 0x9aa4c4;
  if (o.halo !== false) skyGlow(P, cx, cy, r * 3.4, r * 3.4, o.halo ?? 0xbfd4ff, o.haloA ?? 0.35, { bands: 4, pow: 1.5 });
  const R = mulberry32(o.seed ?? 77);
  const craters = Array.from({ length: Math.max(3, Math.round(r * 0.8)) }, () => [(R() - 0.5) * r * 1.3, (R() - 0.5) * r * 1.3, 1 + R() * r * 0.22]);
  const ph = o.phase ?? 0.35;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
    const d = Math.hypot(x, y);
    if (d > r + 0.3) continue;
    let c = col;
    for (const [qx, qy, qr] of craters) if (Math.hypot(x - qx, y - qy) < qr) { c = shade(col, -0.14); if (Math.hypot(x - qx + 0.8, y - qy + 0.8) > qr) c = shade(col, -0.24); }
    const term = x / r - ph;
    if (term > 0.25 || (term > 0 && term * 4 > bayer(x + 99, y))) c = mixHex(c, dark, 0.75);
    P.set(cx + x, cy + y, c);
  }
}

/**
 * Shaded pixel cloud from a set of discs [[x, y, r], ...] cut flat at `bottom`:
 * lit top rim, puff seams, dithered shaded belly and a dark base line.
 * o: { light, color, shade, dark, alpha, sunX (-1 sun left / 1 right), shadeAt (0..1) }
 */
export function paintCloudShape(P, discs, bottom, o = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const [x, y, r] of discs) { x0 = Math.min(x0, Math.floor(x - r - 1)); x1 = Math.max(x1, Math.ceil(x + r + 1)); y0 = Math.min(y0, Math.floor(y - r - 1)); }
  bottom = Math.round(bottom);
  const W = x1 - x0 + 1, H = bottom - y0 + 1;
  if (W <= 0 || H <= 0) return;
  const m = new Uint8Array(W * H);
  const seam = new Uint8Array(W * H);
  for (const [cx, cy, r] of discs) {
    for (let y = Math.floor(cy - r); y <= Math.min(bottom, Math.ceil(cy + r)); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r) continue;
      const i = (y - y0) * W + (x - x0);
      if (i < 0 || i >= m.length) continue;
      m[i] = 1;
      if (d > r - 1.2 && y > cy + r * 0.15) seam[i] = 1;
    }
  }
  const at = (x, y) => (x < x0 || x > x1 || y < y0 || y > bottom ? 0 : m[(y - y0) * W + (x - x0)]);
  const light = o.light ?? 0xffffff, base = o.color ?? 0xf2f6ff, sh = o.shade ?? 0xc8d6ec, dark = o.dark ?? shade(sh, -0.14);
  const sx = o.sunX ?? -1, a = o.alpha ?? 1, shadeAt = o.shadeAt ?? 0.62;
  // seams only count where the cloud continues below (puff overlaps)
  for (let y = y0; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
    const i = (y - y0) * W + (x - x0);
    if (!m[i]) continue;
    const t = (y - y0) / Math.max(1, bottom - y0);
    let c = base;
    if (t + (bayer(x, y) - 0.5) * 0.3 > shadeAt) c = sh;
    if (seam[i] && at(x, y + 2) && t > 0.25) c = sh;
    if (!at(x, y - 1) || (!at(x, y - 2) && bayer(x, y) < 0.5)) c = t > 0.7 ? base : light;
    if (!at(x + sx, y) && t < 0.75) c = light;
    if (!at(x, y + 1)) c = dark;
    P.set(x, y, c, a);
  }
}

/** Puffy cumulus at (cx, cy) about `s` px tall. */
export function paintCumulus(P, cx, cy, s, seed = 1, o = {}) {
  const R = mulberry32(seed * 131 + 7);
  const discs = [];
  const n = (o.puffs ?? 4) + Math.floor(R() * 3);
  const span = s * (o.wide ?? 2.4);
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1) - 0.5;
    const r = s * (0.32 + R() * 0.22) * (1 - Math.abs(u) * 0.7);
    discs.push([cx + u * span + (R() - 0.5) * s * 0.3, cy - r * 0.4 - (1 - Math.abs(u) * 2) * s * 0.25, r]);
  }
  for (let i = 0; i < 1 + Math.floor(R() * 2); i++) discs.push([cx + (R() - 0.5) * span * 0.45, cy - s * (0.45 + R() * 0.2), s * (0.3 + R() * 0.18)]);
  paintCloudShape(P, discs, cy + s * 0.18, o);
}

/** Long cloud bank / fog shelf across the whole width with a bumpy top. o: { s, depth, seed, step } + cloud colours */
export function paintCloudBank(P, w, y, o = {}) {
  const R = mulberry32((o.seed ?? 3) * 71 + 1);
  const s = o.s ?? 8, discs = [];
  for (let x = -s; x < w + s; x += s * (o.step ?? 0.7) * (0.6 + R() * 0.8)) {
    const r = s * (0.5 + R() * 0.7);
    discs.push([x, y - r * 0.35 + (R() - 0.5) * s * 0.4, r]);
  }
  paintCloudShape(P, discs, y + (o.depth ?? s * 0.6), o);
}

/** Thin stratus streaks. o: { n, y0, y1, len: [a, b], color, shade, seed, alpha } */
export function paintStreaks(P, w, o = {}) {
  const R = mulberry32((o.seed ?? 9) * 37);
  const [la, lb] = o.len ?? [10, 40];
  for (let i = 0; i < (o.n ?? 8); i++) {
    const y = Math.round(o.y0 + R() * (o.y1 - o.y0)), x = Math.round(R() * w), L = Math.round(la + R() * (lb - la));
    for (let k = 0; k < L; k++) {
      const e = Math.min(k, L - 1 - k) / Math.max(1, L * 0.18);
      if (e < 1 && bayer(x + k, y) > e) continue;
      P.set(x + k, y, o.color ?? 0xffffff, o.alpha ?? 0.8);
      if (k > 2 && k < L - 3 && (k + i) % 5 < 3) P.set(x + k + 2, y + 1, o.shade ?? 0xd8e4f4, (o.alpha ?? 0.8) * 0.8);
    }
  }
}

/** Star field (dimmer toward the horizon) + optional milky-way band. o: { n, ymax, seed, tint, milky: [x0,y0,x1,y1,width], milkyColor } */
export function paintStarfield(P, w, h, o = {}) {
  const R = mulberry32(o.seed ?? 3);
  const ymax = o.ymax ?? h * 0.6;
  if (o.milky) {
    const [ax, ay, bx, by, wd] = o.milky;
    const L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L;
    for (let y = 0; y < ymax; y++) for (let x = 0; x < w; x++) {
      const dist = Math.abs((x - ax) * nx + (y - ay) * ny);
      const n = vnoise(x * 0.08, y * 0.08, 5);
      const f = Math.max(0, 1 - dist / (wd * (0.6 + n * 0.8))) * (1 - y / ymax);
      if (f > 0) P.dither(x, y, o.milkyColor ?? 0x7a86c8, f * 0.55, 4);
      if (f > 0.2 && hash3(x, y, 17) < f * 0.18) P.set(x, y, 0xe8ecff, 0.7);
    }
  }
  for (let i = 0; i < (o.n ?? 120); i++) {
    const x = Math.floor(R() * w), y = Math.floor(Math.pow(R(), 1.3) * ymax);
    const b = (0.45 + R() * 0.55) * (1 - (y / ymax) * 0.6);
    const c = R() < 0.25 ? (o.tint ?? 0xbfe0ff) : R() < 0.1 ? 0xffe0b0 : 0xffffff;
    P.set(x, y, c, b);
    if (R() < 0.07) { P.set(x - 1, y, c, b * 0.5); P.set(x + 1, y, c, b * 0.5); P.set(x, y - 1, c, b * 0.5); P.set(x, y + 1, c, b * 0.5); }
  }
}

/** Aurora curtain painted into the sky. o: { y, amp, freq, height, colors: [low, mid, high], seed, alpha } */
export function paintAuroraPx(P, w, o = {}) {
  const [c0, c1, c2] = o.colors ?? [0x6effa8, 0x4ae0d0, 0xb070ff];
  const seed = o.seed ?? 1, H = o.height ?? 30, A = o.alpha ?? 0.7;
  for (let x = 0; x < w; x++) {
    const yb = o.y + Math.sin(x * (o.freq ?? 0.05) + seed) * (o.amp ?? 8) + Math.sin(x * (o.freq ?? 0.05) * 2.7 + seed * 3) * (o.amp ?? 8) * 0.35;
    const hh = H * (0.45 + vnoise(x * 0.06, seed, 1) * 0.8);
    const streak = 0.55 + 0.45 * Math.sin(x * 1.3 + vnoise(x * 0.2, seed, 2) * 6);
    for (let k = 0; k < hh; k++) {
      const t = k / hh, y = Math.round(yb - k);
      const c = t < 0.35 ? mixHex(c0, c1, t / 0.35) : mixHex(c1, c2, (t - 0.35) / 0.65);
      P.dither(x, y, c, A * Math.pow(1 - t, 1.4) * streak * (k < 2 ? 1.4 : 1), 4);
    }
  }
}

/** Tiny pixel birds ("v" shapes). list: [[x, y, size], ...] */
export function paintBirdsPx(P, list, hex = 0x3a3a4a, a = 0.85) {
  for (const [x, y, s = 1] of list) {
    for (let k = 1; k <= s + 1; k++) { P.set(x - k, y - Math.round(k * 0.7), hex, a); P.set(x + k, y - Math.round(k * 0.7), hex, a); }
    P.set(x, y, hex, a);
  }
}

/**
 * Lit pixel mountain range drawn to the bottom of the canvas: lit / shaded faces
 * by slope, ridged peaks, jagged snow caps, gullies, and a dithered haze fade.
 * o: { base (0..1 of h), amp (px), freq, seed, ridged, lit, mid, dark, rim, snow, snowLit, snowLine (0..1, from the top of the amp range),
 *      haze: [hex, from (0..1 of h), strength], sunX (-1 = light from the left), speck, gullies }
 * Returns the top y per column.
 */
export function paintRange(P, w, h, o = {}) {
  const base = (o.base ?? 0.6) * h, amp = o.amp ?? h * 0.3, freq = o.freq ?? 0.02, seed = o.seed ?? 1, sx = o.sunX ?? -1;
  const lit = o.lit ?? 0x8aa8d0, mid = o.mid ?? shade(lit, -0.12), dark = o.dark ?? shade(lit, -0.28), rim = o.rim ?? shade(lit, 0.25);
  const tops = new Float32Array(w);
  for (let x = 0; x < w; x++) {
    let v = vnoise(x * freq + seed * 13.1, seed, 0.5) * 0.62 + vnoise(x * freq * 2.6 + 5, 1.5, seed) * 0.26 + vnoise(x * freq * 7, 2.5, seed) * 0.12;
    if (o.ridged) v = 1 - Math.abs(v * 2 - 1) * 0.9;
    if (o.round) v = Math.sin(v * Math.PI * 0.5);
    tops[x] = base - (v - 0.5) * 2 * amp;
  }
  const snowY = base - amp * (1 - 2 * (o.snowLine ?? 0.35));
  for (let x = 0; x < w; x++) {
    const t = Math.round(tops[x]);
    const sl = (tops[Math.min(w - 1, x + 2)] - tops[Math.max(0, x - 2)]) * -sx; // > 0 : face toward the light
    const faceLit = sl > 0.6, faceDark = sl < -0.6;
    const depth = 6 + vnoise(x * 0.15, seed, 3) * 14;
    for (let y = Math.max(0, t); y < h; y++) {
      const dy = y - t;
      let c = mid;
      if (dy < depth) { if (faceLit) c = dy < depth * 0.6 || bayer(x, y) > (dy - depth * 0.6) / (depth * 0.4) ? lit : mid; else if (faceDark) c = dark; }
      if (o.gullies !== false && hash3(x, 3, seed) < 0.08 && dy > 2 && dy < depth * 1.6) c = dark;
      if (o.speck && hash3(x, y, seed) < (o.speckN ?? 0.04)) c = o.speck;
      if (o.snow && t < snowY) {
        const sd = (snowY - t) * 0.7 + (hash3(x, 9, seed) - 0.5) * 3;
        if (dy < sd && !(dy > sd - 2 && bayer(x, y) > 0.5)) c = faceDark ? (o.snowShade ?? shade(o.snow, -0.18)) : faceLit ? (o.snowLit ?? o.snow) : shade(o.snow, -0.06);
      }
      if (dy === 0) c = faceDark ? mid : (o.snow && t < snowY ? (o.snowLit ?? o.snow) : rim);
      P.set(x, y, c);
    }
  }
  if (o.haze) {
    const [hx, from, st] = o.haze;
    for (let y = Math.floor(from * h); y < h; y++) {
      const f = ((y - from * h) / Math.max(1, h - from * h)) * (st ?? 0.8);
      for (let x = 0; x < w; x++) if (y >= tops[x]) P.dither(x, y, hx, f, 4);
    }
  }
  return tops;
}

// ---------------------------------------------------------------------------
// Instancing helpers

const _o3 = new THREE.Object3D();
_o3.rotation.order = 'YXZ';
/** Write instance i of an InstancedMesh (no allocations). */
export function setInstance(im, i, x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _o3.position.set(x, y, z);
  _o3.rotation.set(rx, ry, rz);
  _o3.scale.set(sx, sy, sz);
  _o3.updateMatrix();
  im.setMatrixAt(i, _o3.matrix);
}
/** Instanced voxel prop whose matrices are rewritten every frame. */
export function liveInstances(K, id, gridFn, opts, n, o = {}) {
  const im = K.inst(id, gridFn, opts, Array.from({ length: n }, () => [0, -80, 0, 0, 0.0001]), o);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  return im;
}

/** Instanced plants / flags / antennas that sway in the wind. o: { amp (rad), speed, shadow } */
export function swayInst(K, id, gridFn, opts, items, o = {}) {
  const im = K.inst(id, gridFn, opts, items, o);
  if (!im) return null;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const amp = o.amp ?? 0.08, sp = o.speed ?? 1.3;
  K.onUpdate((dt, t) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i], s = it[4] ?? 1, ph = it[0] * 0.37 + it[2] * 0.21;
      const g = Math.sin(t * sp + ph) * amp + Math.sin(t * sp * 2.3 + ph * 1.7) * amp * 0.3;
      if (Array.isArray(s)) setInstance(im, i, it[0], it[1], it[2], it[3] ?? 0, g * 0.4, g, s[0], s[1], s[2]);
      else setInstance(im, i, it[0], it[1], it[2], it[3] ?? 0, g * 0.4, g, s);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

/**
 * Blinking lights / chasing bulbs: items are split into `groups` instanced
 * meshes toggled on a schedule. o: { groups, rate (Hz), mode: 'chase' | 'twinkle', duty (-1..1) }
 */
export function blinkInst(K, id, gridFn, opts, items, o = {}) {
  const groups = o.groups ?? 2, rate = o.rate ?? 1, mode = o.mode ?? 'chase';
  const meshes = [];
  for (let g = 0; g < groups; g++) {
    const m = K.inst(id, gridFn, opts, items.filter((_, i) => i % groups === g), o);
    if (m) meshes.push([m, g]);
  }
  K.onUpdate((dt, t) => {
    for (const [m, g] of meshes) m.visible = mode === 'chase' ? Math.floor(t * rate) % groups === g : Math.sin(t * rate * 6.283 + g * 2.4) > (o.duty ?? 0);
  });
  return meshes.map((e) => e[0]);
}

/** Rounded voxel puff (smoke / steam / foam / cloud tufts). */
export function puffGrid(o = {}) {
  const g = new VoxGrid();
  const r = o.r ?? 4, light = o.light ?? 0xffffff, base = o.color ?? 0xeef2f8, sh = o.shade ?? 0xc4ccd8;
  for (let x = -r - 1; x <= r; x++) for (let y = -r - 1; y <= r; y++) for (let z = -r - 1; z <= r; z++) {
    const d = Math.hypot(x + 0.5, (y + 0.5) * 1.1, z + 0.5);
    if (d > r + 0.2 + (hash3(x, y, z + (o.seed ?? 0)) - 0.5) * 1.1) continue;
    g.set(x, y, z, y > r * 0.35 ? light : y < -r * 0.3 ? sh : base);
  }
  return g;
}

/**
 * Rising, growing and vanishing voxel puffs (steam, smoke, sea spray, dust).
 * o: { id, sources: [[x, y, z], ...], n (per source), life (s), rise, drift: [dx, dz], wobble, size: [s0, s1],
 *      scale (voxel), r, color, light, shade, opacity, seed }
 */
export function addPuffs(K, o) {
  const per = o.n ?? 6, N = o.sources.length * per;
  const op = o.opacity ?? 1;
  const mats = op < 1 ? [new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: op, depthWrite: false, emissive: o.emissive ?? 0x000000 }), Mats.glow] : o.emissive ? [new THREE.MeshLambertMaterial({ vertexColors: true, emissive: o.emissive }), Mats.glow] : Mats.pair;
  const im = liveInstances(K, o.id ?? 'puff', () => puffGrid(o), { scale: o.scale ?? 0.1, pivot: 'center', jitter: 0.03 }, N, { mats });
  if (op < 1) im.renderOrder = 2;
  const R = mulberry32(o.seed ?? 21);
  const P = [];
  for (const [x, y, z] of o.sources) for (let k = 0; k < per; k++) P.push({ x, y, z, ph: k / per + R() * 0.08, r: R() * 6.28, w: 0.5 + R() });
  const life = o.life ?? 4, rise = o.rise ?? 3, [dx, dz] = o.drift ?? [0.8, 0], wob = o.wobble ?? 0.25, [s0, s1] = o.size ?? [0.5, 1.6];
  K.onUpdate((dt, t) => {
    for (let i = 0; i < N; i++) {
      const p = P[i], k = (t / life + p.ph) % 1;
      const s = (s0 + (s1 - s0) * k) * Math.min(1, k * 7) * Math.min(1, (1 - k) * 4);
      setInstance(im, i, p.x + dx * k + Math.sin(t * p.w + p.r) * wob * k, p.y + rise * Math.pow(k, o.ease ?? 0.85), p.z + dz * k, p.r + t * 0.25 * p.w, 0, 0, Math.max(0.0001, s));
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

/**
 * Twinkling glow voxels (water glints, fireflies, magic dust, sparks).
 * o: { id, n, area: [x0, x1, y0, y1, z0, z1], color, scale, rate, wander, cross, seed }
 */
export function addSparkles(K, o) {
  const n = o.n ?? 20, [x0, x1, y0, y1, z0, z1] = o.area;
  const im = liveInstances(K, o.id ?? 'sparkle', () => {
    const g = new VoxGrid();
    g.set(0, 0, 0, o.color ?? 0xffffff, true);
    if (o.cross) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(a, b, 0, o.color2 ?? o.color ?? 0xffffff, true);
    return g;
  }, { scale: o.scale ?? 0.06, pivot: 'center' }, n);
  const R = mulberry32(o.seed ?? 5);
  const P = Array.from({ length: n }, () => ({ x: x0 + R() * (x1 - x0), y: y0 + R() * (y1 - y0), z: z0 + R() * (z1 - z0), ph: R() * 6.28, sp: 0.6 + R() * 0.8 }));
  const rate = o.rate ?? 1.5, wander = o.wander ?? 0, sharp = o.sharp ?? 3;
  K.onUpdate((dt, t) => {
    for (let i = 0; i < n; i++) {
      const p = P[i];
      const s = Math.pow(Math.max(0, Math.sin(t * rate * p.sp + p.ph)), sharp);
      const wx = wander ? Math.sin(t * 0.7 * p.sp + p.ph) * wander : 0, wy = wander ? Math.sin(t * 1.1 * p.sp + p.ph * 2) * wander * 0.5 : 0;
      setInstance(im, i, p.x + wx, p.y + wy, p.z, 0, 0, t * 2, Math.max(0.0001, s));
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return im;
}

/** Voxel cloud (flat shaded belly, bright puffy top). o: { len, height, depth, color, light, shade, dark } */
export function cloudGrid(seed = 1, o = {}) {
  const g = new VoxGrid();
  const R = mulberry32(seed * 977 + 13);
  const L = o.len ?? 22, Hh = o.height ?? 7, D = o.depth ?? 5;
  const n = 4 + Math.floor(R() * 3);
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) - 0.5;
    const r = Hh * (0.55 + R() * 0.4) * (1 - Math.abs(u) * 0.9);
    g.ellipsoid(u * L * 0.85 + (R() - 0.5) * 2, r * 0.5, 0, r * 1.1, r, Math.min(D, r * 0.8), 1);
  }
  for (let i = 0; i < 2; i++) { const r = Hh * (0.5 + R() * 0.3); g.ellipsoid((R() - 0.5) * L * 0.4, Hh * 0.75, (R() - 0.5) * 2, r * 1.1, r * 0.9, Math.min(D, r * 0.7), 1); }
  g.carve((x, y) => y < 0);
  const top = g.bounds().maxY;
  const light = o.light ?? 0xffffff, base = o.color ?? 0xf2f6fc, sh = o.shade ?? 0xc6d4ea, dark = o.dark ?? shade(sh, -0.1);
  g.paint((x, y, z) => {
    const t = y / Math.max(1, top), j = (hash3(x, y, z + seed) - 0.5) * 0.18;
    if (y === 0) return dark;
    if (t + j < 0.22) return sh;
    if (!g.has(x, y + 1, z) && t + j > 0.42) return light;
    return base;
  });
  return g;
}

const cloudMats = new Map();
/** Unlit vertex-colour material for clouds / far billboards (keeps painted brightness, still fogged). */
export function unlitPair(key = 'u') {
  let m = cloudMats.get(key);
  if (!m) { m = [new THREE.MeshBasicMaterial({ vertexColors: true }), Mats.glow]; cloudMats.set(key, m); }
  return m;
}

/**
 * Drifting voxel clouds (instanced, a few shapes). Wraps around in x.
 * o: { id, n, kinds, x0, x1, y0, y1, z0, z1, s0, s1 (instance scale), scale (voxel), speed, seed, ...cloudGrid colours }
 */
export function addClouds(K, o = {}) {
  const kinds = o.kinds ?? 3, n = o.n ?? 8;
  const R = mulberry32(o.seed ?? 5);
  const x0 = o.x0 ?? -110, x1 = o.x1 ?? 110, span = x1 - x0;
  const all = [];
  for (let i = 0; i < n; i++) all.push({ k: i % kinds, x: x0 + R() * span, y: o.y0 + R() * (o.y1 - o.y0), z: o.z0 + R() * (o.z1 - o.z0), s: (o.s0 ?? 1) + R() * ((o.s1 ?? 1.6) - (o.s0 ?? 1)), v: (o.speed ?? 0.4) * (0.7 + R() * 0.6) });
  const sets = [];
  for (let k = 0; k < kinds; k++) {
    const list = all.filter((c) => c.k === k);
    if (!list.length) continue;
    const im = K.inst((o.id ?? 'cloud') + k, () => cloudGrid(k + 1 + (o.seed ?? 5) * 10, o), { scale: o.scale ?? 1, jitter: 0.03 }, list.map((c) => [c.x, c.y, c.z, 0, c.s]), { receive: false, mats: o.mats ?? (o.lit ? undefined : unlitPair()) });
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.frustumCulled = false;
    sets.push([im, list]);
  }
  if (o.speed !== 0) K.onUpdate((dt) => {
    for (const [im, list] of sets) {
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        c.x += c.v * dt;
        if (c.x > x1) c.x -= span;
        setInstance(im, i, c.x, c.y, c.z, 0, 0, 0, c.s);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  });
  return sets.map((s) => s[0]);
}

const _bq = new THREE.Quaternion(), _be = new THREE.Euler(0, 0, 0, 'YXZ'), _bp = new THREE.Vector3(), _bs = new THREE.Vector3();
const _mBody = new THREE.Matrix4(), _mW = new THREE.Matrix4(), _mRz = new THREE.Matrix4(), _mFlip = new THREE.Matrix4().makeRotationY(Math.PI);
/**
 * Flapping voxel birds (body + two wings, instanced).
 * o: { id, n, mode: 'circle' | 'flock', cx, cy, cz, r, rz, speed, x0, x1, y, z, dir, color, belly, wingTip, beak,
 *      vox (voxel size), flap (rad/s), soar (0..1 glide amount), seed }
 */
export function addBirds(K, o = {}) {
  const n = o.n ?? 6, v = o.vox ?? 0.06, id = o.id ?? 'bird';
  const col = o.color ?? 0xf4f4f4, tip = o.wingTip ?? shade(col, -0.35), belly = o.belly ?? shade(col, -0.1);
  const body = liveInstances(K, id + 'Body', () => {
    const g = new VoxGrid();
    g.box(-1, 0, -3, 0, 1, 2, col).box(-1, 0, -3, 0, 0, 2, belly);
    g.box(-1, 1, 3, 0, 2, 4, o.head ?? col);
    g.set(-1, 1, 5, o.beak ?? 0xffb030).set(0, 1, 5, o.beak ?? 0xffb030);
    g.set(-1, 2, 4, 0x15121f).set(0, 2, 4, 0x15121f);
    g.box(-1, 1, -5, 0, 1, -4, tip);
    return g;
  }, { scale: v, pivot: [0, 0, 0], ao: false }, n);
  const wingGrid = () => {
    const g = new VoxGrid();
    for (let k = 0; k < 7; k++) {
      const c0 = -2 + Math.floor(k / 3), c1 = 1 - Math.floor(k / 4);
      g.box(k, 0, c0, k, 0, c1, k > 4 ? tip : col);
    }
    return g;
  };
  const wingR = liveInstances(K, id + 'Wing', wingGrid, { scale: v, pivot: [0, 0, 0], ao: false }, n);
  const wingL = liveInstances(K, id + 'Wing', wingGrid, { scale: v, pivot: [0, 0, 0], ao: false }, n);
  const R = mulberry32(o.seed ?? 3);
  const B = Array.from({ length: n }, (_, i) => ({ ph: R() * 6.28, r: (o.r ?? 8) * (0.7 + R() * 0.5), y: (R() - 0.5) * 2, sp: (o.speed ?? 0.25) * (0.8 + R() * 0.4), fx: (i % 2 ? 1 : -1) * Math.ceil(i / 2), fl: (o.flap ?? 9) * (0.85 + R() * 0.3) }));
  const mode = o.mode ?? 'circle', dir = o.dir ?? 1, span = (o.x1 ?? 60) - (o.x0 ?? -60);
  const wy = 1 * v, wxr = 0.5 * v, wxl = -0.5 * v;
  K.onUpdate((dt, t) => {
    for (let i = 0; i < n; i++) {
      const b = B[i];
      let x, y, z, yaw, bank = 0;
      if (mode === 'circle') {
        const a = t * b.sp * dir + b.ph, rz = (o.rz ?? 0.5) * b.r;
        x = (o.cx ?? 0) + Math.cos(a) * b.r; z = (o.cz ?? -30) + Math.sin(a) * rz; y = (o.cy ?? 12) + b.y + Math.sin(t * 0.6 + b.ph) * 0.4;
        yaw = Math.atan2(-Math.sin(a) * b.r * dir, Math.cos(a) * rz * dir);
        bank = -0.35 * dir;
      } else {
        const lead = ((t * (o.speed ?? 3) + b.ph * 0) % span + span) % span;
        x = dir > 0 ? (o.x0 ?? -60) + lead - Math.abs(b.fx) * 1.1 : (o.x1 ?? 60) - lead + Math.abs(b.fx) * 1.1;
        if (x < (o.x0 ?? -60)) x += span;
        if (x > (o.x1 ?? 60)) x -= span;
        y = (o.y ?? 10) - Math.abs(b.fx) * 0.3 + Math.sin(t * 1.3 + b.ph) * 0.25;
        z = (o.z ?? -30) + b.fx * 0.9;
        yaw = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      const glide = (o.soar ?? 0.4) > 0 ? Math.max(0, Math.sin(t * 0.5 + b.ph)) * (o.soar ?? 0.4) : 0;
      const fa = Math.sin(t * b.fl + b.ph) * 0.75 * (1 - glide) + 0.12;
      _be.set(0, yaw, bank);
      _bq.setFromEuler(_be);
      _bp.set(x, y, z);
      _bs.setScalar(o.size ?? 1);
      _mBody.compose(_bp, _bq, _bs);
      body.setMatrixAt(i, _mBody);
      _mRz.makeRotationZ(fa);
      _mW.makeTranslation(wxr, wy, 0).premultiply(_mBody).multiply(_mRz);
      wingR.setMatrixAt(i, _mW);
      _mW.makeTranslation(wxl, wy, 0).premultiply(_mBody).multiply(_mFlip).multiply(_mRz);
      wingL.setMatrixAt(i, _mW);
    }
    body.instanceMatrix.needsUpdate = wingR.instanceMatrix.needsUpdate = wingL.instanceMatrix.needsUpdate = true;
  });
  return { body, wingR, wingL };
}

/**
 * 3D voxel mountain / hill / dune range for the far background (greedy-meshed,
 * lit and fogged like everything else). Columns along x, `depth` voxels deep
 * (z grows backwards from o.z), taller toward the back so slopes and lit tops show.
 * o: { x0, x1, z, y, depth, scale, base, amp, freq, seed, ridged, peaks, h(xv, zv) -> voxels,
 *      col(xv, y, zv, h, hmax) -> hex  (or palette: rock, rockD, rockL, top, snow, snowAt (0..1 of amp)) }
 */
export function voxRange(K, id, o = {}) {
  const s = o.scale ?? 1.5, D = o.depth ?? 8, seed = o.seed ?? 1;
  const xs = Math.floor((o.x0 ?? -130) / s), xe = Math.ceil((o.x1 ?? 130) / s);
  const amp = o.amp ?? 10, base = o.base ?? 2, freq = o.freq ?? 0.06;
  const ridge = (xv) => {
    let n = vnoise(xv * freq + seed * 7.3, seed, 0.5) * 0.62 + vnoise(xv * freq * 2.3 + 11, seed + 3, 1.5) * 0.26 + vnoise(xv * freq * 5.5, seed + 9, 2.5) * 0.12;
    if (o.ridged) n = 1 - Math.abs(n * 2 - 1);
    if (o.peaks) n = Math.pow(n, 1.6) * 1.5;
    return n;
  };
  const H = o.h ?? ((xv, zv) => {
    const back = zv / Math.max(1, D - 1);
    return Math.max(1, Math.round(base + amp * ridge(xv) * (0.4 + 0.6 * Math.sqrt(back)) + (vnoise(xv * 0.35, zv * 0.35, seed) - 0.5) * 2.2));
  });
  const rock = o.rock ?? 0x7a86a0, rockD = o.rockD ?? shade(rock, -0.14), rockL = o.rockL ?? shade(rock, 0.12), top = o.top ?? rockL, snow = o.snow;
  const snowAt = base + amp * (o.snowAt ?? 0.62);
  const col = o.col ?? ((xv, y, zv, h) => {
    const j = hash3(xv, y, zv + seed);
    if (snow && y >= snowAt - (hash3(xv, 5, zv) * 1.5)) return y === h - 1 || j < 0.7 ? snow : shade(snow, -0.08);
    if (y === h - 1) return j < 0.2 ? shade(top, -0.06) : top;
    const strata = Math.floor(y / 2 + vnoise(xv * 0.2, zv * 0.2, seed) * 2) % 3;
    return strata === 0 ? rockD : j < 0.15 ? rockL : rock;
  });
  return K.mesh(id, () => {
    const g = new VoxGrid();
    for (let x = xs; x < xe; x++) for (let z = 0; z < D; z++) {
      const h = H(x, z);
      for (let y = 0; y < h; y++) g.set(x, y, -z, col(x, y, z, h));
    }
    return g;
  }, { scale: s, pivot: [0, 0, 0], jitter: o.jitter ?? 0.05 }, 0, o.y ?? -0.5, o.z ?? -100, 0, 1, { receive: false, mats: o.mats });
}

/**
 * Voxel heightfield terrain chunk (hills, dunes, snow fields, berms). World coordinates in.
 * o: { x0, x1, z0, z1, scale, y, h(wx, wz) -> height in voxels, col(wx, y, wz, h) -> hex, skip(wx, wz) }
 */
export function voxTerrain(K, id, o) {
  const s = o.scale ?? 0.5;
  const xs = Math.floor(o.x0 / s), xe = Math.ceil(o.x1 / s), zs = Math.floor(o.z0 / s), ze = Math.ceil(o.z1 / s);
  return K.mesh(id, () => {
    const g = new VoxGrid();
    for (let x = xs; x < xe; x++) for (let z = zs; z < ze; z++) {
      const wx = (x + 0.5) * s, wz = (z + 0.5) * s;
      if (o.skip && o.skip(wx, wz)) continue;
      const h = Math.round(o.h(wx, wz));
      for (let y = o.min ?? 0; y < h; y++) g.set(x, y, z, o.col(wx, y, wz, h));
    }
    return g;
  }, { scale: s, pivot: [0, 0, 0], jitter: o.jitter ?? 0.05 }, 0, o.y ?? 0, 0, 0, 1, { receive: o.receive ?? true, shadow: !!o.shadow });
}

/**
 * Voxel waterfall: a static streaked sheet plus falling instanced voxel streaks
 * and spray puffs at the foot. o: { id, x, z, top, bottom, width, vox, colors: [deep, mid, light, foam], speed, n, spray }
 */
export function addFall(K, o) {
  const v = o.vox ?? 0.16, W = Math.max(2, Math.round(o.width / v)), Hh = Math.max(2, Math.round((o.top - o.bottom) / v));
  const [deep, mid, light, foam] = o.colors ?? [0x1f7ad0, 0x3aa6ee, 0x9ae4ff, 0xffffff];
  K.mesh(o.id + 'Sheet', () => {
    const g = new VoxGrid();
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1;
      for (let y = 0; y < Hh; y++) {
        const k = hash3(x, Math.floor(y / 4), 7);
        g.set(x, y, 0, edge ? light : k < 0.3 ? deep : k < 0.8 ? mid : light);
        if (y < 3 || hash3(x, y, 3) < 0.05) g.set(x, y, 1, foam);
      }
    }
    return g;
  }, { scale: v, pivot: [W / 2, 0, 0], jitter: 0.04 }, o.x, o.bottom, o.z, o.ry ?? 0);
  const L = o.streak ?? 5;
  const n = o.n ?? W * 2;
  const im = liveInstances(K, o.id + 'Streak', () => {
    const g = new VoxGrid();
    for (let y = 0; y < L; y++) g.set(0, y, 0, y >= L - 2 ? foam : light);
    return g;
  }, { scale: v, pivot: [0.5, 0, 0], ao: false }, n);
  const R = mulberry32(o.seed ?? 4);
  const S = Array.from({ length: n }, (_, i) => ({ c: i % W, ph: R(), sp: 0.8 + R() * 0.5 }));
  const span = o.top - o.bottom, sp = o.speed ?? 3.5;
  const cr = Math.cos(o.ry ?? 0), sr = Math.sin(o.ry ?? 0);
  K.onUpdate((dt, t) => {
    for (let i = 0; i < n; i++) {
      const s = S[i], k = (t * sp * s.sp / span + s.ph) % 1;
      const lx = (s.c - W / 2 + 0.5) * v;
      setInstance(im, i, o.x + lx * cr, o.top - k * span - L * v * (1 - k), o.z + v * 1.2 - lx * sr, o.ry ?? 0, 0, 0, 1);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  const ns = Math.max(2, Math.round(o.width / 0.7));
  if (o.spray !== false) addPuffs(K, { id: o.id + 'Spray', sources: Array.from({ length: ns }, (_, i) => [o.x + (i / (ns - 1) - 0.5) * o.width * cr, o.bottom, o.z + 0.4 - (i / (ns - 1) - 0.5) * o.width * sr]), n: 3, life: 1.6, rise: 0.8, drift: [0, 0.5], size: [0.5, 1.3], scale: v * 0.8, color: foam, light: 0xffffff, shade: light, seed: 9 });
  return im;
}

/**
 * Waving voxel flag (vertex-animated clone, so each flag waves on its own).
 * o: { id, x, y, z, ry, w, h, vox, pattern(u, v) -> hex, speed, amp, pole: hex | false, poleH (world) }
 */
export function addFlag(K, o) {
  const W = o.w ?? 12, Hh = o.h ?? 8, v = o.vox ?? 0.08;
  const geo = vgeo('ar_flag_' + K.id + '_' + o.id, () => {
    const g = new VoxGrid();
    for (let u = 0; u < W; u++) for (let vv = 0; vv < Hh; vv++) g.set(u, vv, 0, o.pattern ? o.pattern(u, vv) : (o.color ?? 0xe8343c));
    return g;
  }, { scale: v, pivot: [0, Hh, 0.5], ao: false, jitter: 0.03 }).clone();
  const base = Float32Array.from(geo.attributes.position.array);
  const m = makeMesh(geo, Mats.pair);
  m.castShadow = false;
  const grp = new THREE.Group();
  grp.position.set(o.x, o.y, o.z);
  grp.rotation.y = o.ry ?? 0;
  grp.add(m);
  if (o.pole !== false) {
    const ph = o.poleH ?? Hh * v * 2.4;
    const pm = makeMesh(vgeo('ar_flagpole_' + Math.round(ph / v) + '_' + (o.pole ?? 0xd8dde6), () => {
      const g = new VoxGrid();
      g.box(0, 0, 0, 0, Math.round(ph / v), 0, o.pole ?? 0xd8dde6);
      g.set(0, Math.round(ph / v) + 1, 0, o.knob ?? 0xffd23f);
      return g;
    }, { scale: v * 1.3, pivot: [0.5, 0, 0.5], ao: false }), Mats.pair);
    pm.position.set(-v * 0.6, -ph, 0);
    grp.add(pm);
  }
  K.add(grp);
  const sp = o.speed ?? 4, amp = o.amp ?? v * 2.5, L = W * v, ph = o.phase ?? (o.x * 0.7);
  const pos = geo.attributes.position, arr = pos.array;
  K.onUpdate((dt, t) => {
    for (let i = 0; i < arr.length; i += 3) {
      const u = Math.max(0, base[i]) / L;
      arr[i + 2] = base[i + 2] + Math.sin(t * sp - base[i] * 6 / L + ph) * amp * (0.25 + u);
      arr[i + 1] = base[i + 1] + Math.sin(t * sp * 0.7 - base[i] * 3 / L + ph) * amp * 0.25 * u;
    }
    pos.needsUpdate = true;
  });
  return grp;
}

// ---------------------------------------------------------------------------
// Detailed nature brushes (voxel scale ~0.08-0.12)

/**
 * Leafy broadleaf tree: flared trunk with branches and a clumpy canopy (lit
 * top-left, darker underside, speckled leaves, optional blossoms / fruit).
 * o: { seed, h (trunk voxels), r (canopy radius), leaf, leafD, leafL, trunk, blossom, fruit }
 */
export function leafyTreeGrid(o = {}) {
  const g = new VoxGrid();
  const R = mulberry32((o.seed ?? 1) * 7919 + 3);
  const leaf = o.leaf ?? 0x4cba3a, leafD = o.leafD ?? shade(leaf, -0.25), leafL = o.leafL ?? shade(leaf, 0.22), leafDD = shade(leafD, -0.2);
  const trunk = o.trunk ?? 0x7a4a26, trunkD = shade(trunk, -0.22), trunkL = shade(trunk, 0.15);
  const H = o.h ?? 10, r = o.r ?? 7;
  // trunk + root flare
  for (let y = 0; y < H + 2; y++) {
    const w = y < 2 ? 2 : 1;
    for (let x = -w; x < w; x++) for (let z = -w; z < w; z++) g.set(x, y, z, (x + z + y) % 4 === 0 ? trunkD : x < 0 ? trunkL : trunk);
  }
  // branches
  const clumps = [[0, H + r * 0.55, 0, r]];
  const nb = 3 + Math.floor(R() * 2);
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + R() * 0.8, L = r * (0.55 + R() * 0.3), y0 = H - 2 + Math.floor(R() * 3);
    const ex = Math.round(Math.cos(a) * L), ez = Math.round(Math.sin(a) * L * 0.8), ey = y0 + Math.round(L * 0.6);
    g.line(0, y0, 0, ex, ey, ez, trunk);
    clumps.push([ex, ey + r * 0.25, ez, r * (0.55 + R() * 0.2)]);
  }
  for (const [cx, cy, cz, cr] of clumps) {
    for (let x = Math.floor(cx - cr - 1); x <= cx + cr + 1; x++) for (let y = Math.floor(cy - cr * 0.8); y <= cy + cr * 0.9; y++) for (let z = Math.floor(cz - cr - 1); z <= cz + cr + 1; z++) {
      const d = ((x - cx) / (cr + 0.4)) ** 2 + ((y - cy) / (cr * 0.82)) ** 2 + ((z - cz) / (cr + 0.4)) ** 2;
      if (d > 1 + (hash3(x, y, z + (o.seed ?? 1)) - 0.5) * 0.35) continue;
      const ly = (y - cy) / cr, lx = (x - cx + (z - cz) * 0.5) / cr;
      const k = hash3(x * 3, y, z);
      let c = ly - lx * 0.4 > 0.35 ? leafL : ly < -0.35 ? leafD : leaf;
      if (k < 0.16) c = c === leafL ? leaf : leafD;
      if (ly < -0.6 && k < 0.5) c = leafDD;
      g.set(x, y, z, c);
    }
  }
  // blossoms / fruit sprinkled on the surface
  if (o.blossom || o.fruit) {
    const extra = [];
    g.forEach((x, y, z, c) => {
      if (c === trunk || c === trunkD || c === trunkL) return;
      if (g.has(x, y + 1, z) && g.has(x + 1, y, z) && g.has(x, y, z + 1)) return;
      if (hash3(x, y * 5, z) < (o.fruit ? 0.04 : 0.09)) extra.push([x, y, z]);
    });
    for (const [x, y, z] of extra) g.set(x, y, z, o.fruit ?? o.blossom);
  }
  return g;
}

/** Layered conifer with a lit side, snow option and a slightly crooked tip. o: { seed, layers, r, leaf, trunk, snow } */
export function pineTreeGrid(o = {}) {
  const g = new VoxGrid();
  const leaf = o.leaf ?? 0x2f8a4a, leafD = shade(leaf, -0.25), leafL = shade(leaf, 0.2), trunk = o.trunk ?? 0x6a4226;
  const L = o.layers ?? 5, R0 = o.r ?? 6, seed = o.seed ?? 1;
  g.box(-1, 0, -1, 0, 4, 0, trunk);
  let y = 3;
  for (let i = 0; i < L; i++) {
    const r = R0 * (1 - i / (L + 0.6)), hh = 4;
    for (let yy = 0; yy < hh; yy++) {
      const rr = r * (1 - yy / (hh + 1.2)) + 0.6;
      for (let x = -Math.ceil(rr) - 1; x <= Math.ceil(rr); x++) for (let z = -Math.ceil(rr) - 1; z <= Math.ceil(rr); z++) {
        const d = Math.hypot(x + 0.5, z + 0.5);
        if (d > rr + (hash3(x, y + yy, z + seed) - 0.5) * 0.9) continue;
        let c = (x + 0.5) - (z + 0.5) * 0.3 < -rr * 0.25 ? leafL : yy === 0 && d > rr - 1.2 ? leafD : leaf;
        if (hash3(x * 2, y + yy, z) < 0.12) c = leafD;
        if (o.snow && yy === hh - 1 && hash3(x, y, z) < 0.75) c = o.snow;
        if (o.snow && yy === 0 && d > rr - 1 && hash3(z, x, y) < 0.4) c = o.snow;
        g.set(x, y + yy, z, c);
      }
    }
    y += 3;
  }
  g.box(-1, y, -1, 0, y + 1, 0, o.snow ?? leafL);
  return g;
}

/** Bush / hedge clump. o: { seed, w, h, d, leaf, flowers: [hex...] } */
export function bushGrid(o = {}) {
  const g = new VoxGrid();
  const leaf = o.leaf ?? 0x45a83a, leafD = shade(leaf, -0.22), leafL = shade(leaf, 0.2);
  const w = o.w ?? 6, h = o.h ?? 4, d = o.d ?? 4, seed = o.seed ?? 1;
  for (let x = -w; x <= w; x++) for (let y = 0; y <= h * 1.6; y++) for (let z = -d; z <= d; z++) {
    const n = (x / (w + 0.5)) ** 2 + (y / (h * 1.5)) ** 2 + (z / (d + 0.5)) ** 2;
    if (n > 1 + (hash3(x, y, z + seed) - 0.5) * 0.4) continue;
    let c = y > h * 0.9 ? leafL : y < h * 0.35 ? leafD : leaf;
    if (hash3(x * 3, y, z) < 0.15) c = leafD;
    if (o.flowers && hash3(x, y * 7, z + seed) < 0.07 && (y > h * 0.5)) c = o.flowers[Math.floor(hash3(z, x, y) * o.flowers.length)];
    g.set(x, y, z, c);
  }
  return g;
}

/** Little flower: stem, two leaves and a petal cross. */
export function flowerGrid(petal = 0xff6fb8, o = {}) {
  const g = new VoxGrid();
  const stem = o.stem ?? 0x3f9e3a, h = o.h ?? 4;
  g.box(0, 0, 0, 0, h - 1, 0, stem);
  g.set(1, 1, 0, shade(stem, 0.15)).set(-1, 2, 0, shade(stem, 0.15));
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.set(a, h, b, petal);
  g.set(0, h, 0, o.center ?? 0xffd23f);
  g.set(0, h + 1, 0, shade(petal, 0.25));
  return g;
}

/** Grass tuft with 4-6 blades. */
export function tuftGrid(col = 0x4cb83a, o = {}) {
  const g = new VoxGrid();
  const light = o.light ?? shade(col, 0.25), dark = o.dark ?? shade(col, -0.25);
  for (const [x, z, h] of o.blades ?? [[0, 0, 4], [1, 0, 3], [-1, 1, 3], [2, 1, 2], [-2, 0, 2], [0, -1, 3]]) for (let y = 0; y < h; y++) g.set(x + (y === h - 1 && x > 0 ? 1 : 0), y, z, y === h - 1 ? light : y === 0 ? dark : col);
  return g;
}

/** Keep a screen-space sky texture cover-fitted to the window aspect (also works outside the battle view). */
export function fitSkyAuto(K, tex) {
  let last = 0;
  K.onUpdate(() => {
    const a = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 16 / 9;
    if (Math.abs(a - last) < 1e-3) return;
    last = a;
    coverFit(tex, a);
  });
  return tex;
}

/**
 * 3D voxel skyline band (city blocks / factory halls) with window grids, roof
 * kit, chimneys and antennas; a few windows lit (glow). Greedy-meshed.
 * o: { x0, x1, z, depth, scale, minH, maxH, minW, maxW, gap, seed, walls: [hex...], window, lit: [hex...], litP, roof, antenna, chimney }
 */
export function voxSkyline(K, id, o = {}) {
  const s = o.scale ?? 0.8, D = o.depth ?? 6, seed = o.seed ?? 3;
  const R = mulberry32(seed * 313 + 1);
  const walls = o.walls ?? [0x4a5262, 0x5a6272, 0x3e4656], win = o.window ?? 0x2a3040, lit = o.lit ?? [0xffe08a, 0xfff2c0], litP = o.litP ?? 0.12;
  return K.mesh(id, () => {
    const g = new VoxGrid();
    let x = Math.floor((o.x0 ?? -120) / s);
    const xe = Math.ceil((o.x1 ?? 120) / s);
    while (x < xe) {
      const bw = (o.minW ?? 5) + Math.floor(R() * ((o.maxW ?? 12) - (o.minW ?? 5)));
      const bh = (o.minH ?? 6) + Math.floor(R() * ((o.maxH ?? 18) - (o.minH ?? 6)));
      const bd = Math.max(2, D - Math.floor(R() * 3)), wall = walls[Math.floor(R() * walls.length)], z0 = -Math.floor(R() * 2);
      const shaded = shade(wall, -0.12);
      for (let xx = x; xx < x + bw; xx++) for (let y = 0; y < bh; y++) for (let z = z0 - bd + 1; z <= z0; z++) {
        let c = xx === x || xx === x + bw - 1 ? shaded : wall;
        if (z === z0 && y > 0 && y < bh - 1 && (xx - x) % 2 === 1 && y % 2 === 1 && xx < x + bw - 1) {
          const h = hash3(xx, y, seed);
          g.set(xx, y, z, h < litP ? lit[Math.floor(h * 97) % lit.length] : win, h < litP);
          continue;
        }
        if (y === bh - 1) c = o.roof ?? shade(wall, 0.12);
        g.set(xx, y, z, c);
      }
      if (o.chimney && R() < o.chimney) { const cx = x + 1 + Math.floor(R() * (bw - 2)); for (let y = bh; y < bh + 4 + Math.floor(R() * 6); y++) g.set(cx, y, z0 - 1, y % 3 === 0 ? 0xb8442a : 0x8a8a84); }
      if (o.antenna && R() < o.antenna) { const cx = x + Math.floor(bw / 2); for (let y = bh; y < bh + 3 + Math.floor(R() * 4); y++) g.set(cx, y, z0 - 1, 0x6a6e78); }
      x += bw + Math.floor(R() * ((o.gap ?? 2) + 1));
    }
    return g;
  }, { scale: s, pivot: [0, 0, 0], jitter: o.jitter ?? 0.04 }, 0, o.y ?? 0, o.z ?? -90, 0, 1, { receive: false });
}
