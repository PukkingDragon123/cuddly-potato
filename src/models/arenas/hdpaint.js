// HD painting for arena skies and far backdrop layers.
//
// The arena paint helpers in kit.js (skyGlow, paintSunPx, paintCumulus,
// paintRange, paintClouds, ...) take coordinates in a small "logical" canvas
// space (e.g. 320x180). When the canvas was created by hdCanvas() (ctx._hd = k,
// a k-times larger backing store with a k-scale transform) they delegate here
// and paint smooth, anti-aliased, gradient-shaded shapes instead of dithered
// pixel art: soft painted clouds, glowing suns, cratered moons, aurora
// curtains, star fields and continuously shaded mountain ranges.
//
// Per-pixel legacy APIs (P.set / P.rect / P.dither from pixbuf() / pixels())
// write into a low-res buffer that is composited with smooth upscaling
// whenever a vector helper runs (keeps the painting order) and on flush().
import { mulberry32, hash3, shade, mixHex, clamp } from '../../core/util.js';
import { vnoise } from '../props/common.js';

export const rgba = (hex, a = 1) => `rgba(${(hex >> 16) & 255},${(hex >> 8) & 255},${hex & 255},${clamp(a, 0, 1)})`;
const TAU = Math.PI * 2;

/** A k-times supersampled canvas whose drawing coordinates stay in logical units (w x h). */
export function hdCanvas(w, h, k) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k));
  c.height = Math.max(1, Math.round(h * k));
  const ctx = c.getContext('2d', { willReadFrequently: false });
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx._hd = k;
  ctx._lw = w;
  ctx._lh = h;
  return ctx;
}

/** Smooth vertical gradient (stops [[t, hex], ...] top -> bottom). */
export function hdGradient(ctx, x0, y0, w, h, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
  for (const [t, c] of stops) g.addColorStop(clamp(t, 0, 1), rgba(c));
  ctx.fillStyle = g;
  ctx.fillRect(x0, y0, w, h);
}

/** Fine film grain over the whole backing store (kills 8-bit banding in wide gradients). */
export function hdGrain(ctx, amt = 2.2) {
  const c = ctx.canvas;
  const img = ctx.getImageData(0, 0, c.width, c.height), d = img.data;
  let s = 1234567;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const n = ((s >> 8) / 8388608 - 0.5) * amt * 2;
    d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

/** Soft elliptical glow, alpha = strength * (1 - d)^pow. */
export function hdGlow(ctx, cx, cy, rx, ry, hex, strength = 1, pow = 2, op = 'source-over') {
  if (rx <= 0 || ry <= 0) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let i = 0; i <= 10; i++) { const d = i / 10; g.addColorStop(d, rgba(hex, strength * Math.pow(1 - d, pow))); }
  ctx.globalCompositeOperation = op;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, TAU);
  ctx.fill();
  ctx.restore();
}

/** Glowing sun: wide halo, inner bloom, optional soft rays, gradient disc. */
export function hdSun(ctx, cx, cy, r, o = {}) {
  const col = o.color ?? 0xfff0b0, core = o.core ?? 0xffffff, halo = o.halo ?? 0xfff6d8;
  hdGlow(ctx, cx, cy, r * (o.haloR ?? 5) * 1.15, r * (o.haloR ?? 5) * 1.15, halo, (o.haloA ?? 0.55) * 0.9, 1.8);
  hdGlow(ctx, cx, cy, r * 2.4, r * 2.4, o.halo2 ?? halo, 0.8, 1.4);
  const rays = o.rays ?? 12;
  if (rays) {
    const n = rays, len = r * (o.rayLen ?? (o.rays ? 6 : 3.4));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + (o.rayRot ?? 0.2), wd = (k % 2 ? 0.05 : 0.09) * (o.rays ? 1 : 0.6);
      const g = ctx.createRadialGradient(cx, cy, r, cx, cy, len);
      g.addColorStop(0, rgba(o.rayColor ?? halo, o.rays ? 0.32 : 0.12));
      g.addColorStop(1, rgba(o.rayColor ?? halo, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, len, a - wd, a + wd);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const g = ctx.createRadialGradient(cx - r * 0.28, cy - r * 0.3, 0, cx, cy, r);
  g.addColorStop(0, rgba(core));
  g.addColorStop(0.5, rgba(mixHex(core, col, 0.6)));
  g.addColorStop(0.9, rgba(col));
  g.addColorStop(1, rgba(shade(col, -0.04)));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fill();
}

/** Moon with soft craters and a smooth terminator. o: { color, dark, phase (-1..1), halo, haloA, seed } */
export function hdMoon(ctx, cx, cy, r, o = {}) {
  const col = o.color ?? 0xf4f2e4, dark = o.dark ?? 0x9aa4c4;
  if (o.halo !== false) {
    hdGlow(ctx, cx, cy, r * 4.2, r * 4.2, o.halo ?? 0xbfd4ff, (o.haloA ?? 0.35) * 0.8, 1.8);
    hdGlow(ctx, cx, cy, r * 1.8, r * 1.8, o.halo ?? 0xbfd4ff, (o.haloA ?? 0.35) * 0.9, 1.3);
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.clip();
  const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, 0, cx, cy, r * 1.05);
  g.addColorStop(0, rgba(shade(col, 0.06)));
  g.addColorStop(1, rgba(shade(col, -0.08)));
  ctx.fillStyle = g;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  // maria + craters
  const R = mulberry32(o.seed ?? 77);
  for (let i = 0; i < 3; i++) hdGlow(ctx, cx + (R() - 0.5) * r, cy + (R() - 0.5) * r, r * (0.3 + R() * 0.25), r * (0.25 + R() * 0.2), shade(col, -0.2), 0.45, 0.8);
  const n = Math.max(4, Math.round(r * 0.9));
  for (let i = 0; i < n; i++) {
    const qx = cx + (R() - 0.5) * r * 1.5, qy = cy + (R() - 0.5) * r * 1.5, qr = r * (0.07 + R() * 0.13);
    ctx.fillStyle = rgba(shade(col, -0.22), 0.7);
    ctx.beginPath(); ctx.arc(qx, qy, qr, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(shade(col, 0.08), 0.8);
    ctx.beginPath(); ctx.arc(qx + qr * 0.25, qy + qr * 0.25, qr * 0.7, 0, TAU); ctx.fill();
  }
  // terminator (dark side to the right of x = phase * r)
  const ph = o.phase ?? 0.35;
  const tg = ctx.createLinearGradient(cx + (ph - 0.05) * r, 0, cx + (ph + 0.4) * r, 0);
  tg.addColorStop(0, rgba(dark, 0));
  tg.addColorStop(1, rgba(dark, 0.8));
  ctx.fillStyle = tg;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
}

/**
 * Painted cumulus from discs [[x, y, r], ...] cut flat at `bottom`: soft rounded
 * puffs, sun-side highlights, a shaded belly and soft edges.
 * o: { light, color, shade, dark, alpha, sunX (-1 = lit from the left, 1 = right), shadeAt (0..1) }
 */
export function hdCloud(ctx, discs, bottom, o = {}) {
  if (!discs.length) return;
  const k = ctx._hd ?? 1;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity;
  for (const [x, y, r] of discs) { x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r); y0 = Math.min(y0, y - r); }
  if (!(bottom > y0)) return;
  const light = o.light ?? 0xffffff, base = o.color ?? 0xf2f6ff, sh = o.shade ?? 0xc8d6ec, dark = o.dark ?? shade(sh, -0.14);
  const sx = o.sunX ?? -1, a = o.alpha ?? 1, shadeAt = o.shadeAt ?? 0.62;
  const pad = 2;
  const W = Math.ceil((x1 - x0 + pad * 2) * k), H = Math.ceil((bottom - y0 + pad * 2) * k);
  if (W <= 0 || H <= 0 || W * H > 16e6) return;
  const oc = document.createElement('canvas');
  oc.width = W; oc.height = H;
  const c = oc.getContext('2d');
  c.setTransform(k, 0, 0, k, -(x0 - pad) * k, -(y0 - pad) * k);
  const shape = (dx = 0, dy = 0, rs = 1) => {
    c.beginPath();
    for (const [x, y, r] of discs) { c.moveTo(x + dx + r * rs, y + dy); c.arc(x + dx, y + dy, r * rs, 0, TAU); }
  };
  c.save();
  c.beginPath();
  c.rect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, bottom - y0 + pad);
  c.clip();
  // body
  shape();
  c.fillStyle = rgba(base);
  c.fill();
  c.globalCompositeOperation = 'source-atop';
  // belly shading
  const hgt = bottom - y0;
  const g = c.createLinearGradient(0, y0 + hgt * (shadeAt - 0.32), 0, bottom);
  g.addColorStop(0, rgba(sh, 0));
  g.addColorStop(0.55, rgba(sh, 0.9));
  g.addColorStop(1, rgba(mixHex(sh, dark, 0.6), 1));
  c.fillStyle = g;
  c.fillRect(x0 - pad, y0 - pad, x1 - x0 + pad * 2, hgt + pad * 2);
  // each puff: shaded lower rim (separates overlapping puffs), lit sun-side cap
  for (const [x, y, r] of discs) {
    const rg = c.createRadialGradient(x - sx * r * 0.15, y - r * 0.25, r * 0.55, x, y, r * 1.02);
    rg.addColorStop(0, rgba(sh, 0));
    rg.addColorStop(1, rgba(sh, 0.38));
    c.fillStyle = rg;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI); c.fill();
  }
  for (const [x, y, r] of discs) {
    const hx = x + sx * r * 0.32, hy = y - r * 0.42;
    const lg = c.createRadialGradient(hx, hy, 0, hx, hy, r * 0.95);
    lg.addColorStop(0, rgba(light, 0.95));
    lg.addColorStop(0.55, rgba(light, 0.55));
    lg.addColorStop(1, rgba(light, 0));
    c.fillStyle = lg;
    c.beginPath(); c.arc(hx, hy, r * 0.95, 0, TAU); c.fill();
  }
  // flat base line
  const bg = c.createLinearGradient(0, bottom - 1.4, 0, bottom);
  bg.addColorStop(0, rgba(dark, 0));
  bg.addColorStop(1, rgba(dark, 0.9));
  c.fillStyle = bg;
  c.fillRect(x0 - pad, bottom - 1.4, x1 - x0 + pad * 2, 1.4);
  c.restore();
  ctx.save();
  ctx.globalAlpha = a;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${Math.max(0.6, k * 0.32).toFixed(2)}px)`;
  ctx.drawImage(oc, Math.round((x0 - pad) * k), Math.round((y0 - pad) * k));
  ctx.restore();
}

/** Thin stratus streaks with faded ends. o: { n, y0, y1, len: [a, b], color, shade, seed, alpha } */
export function hdStreaks(ctx, w, o = {}) {
  const R = mulberry32((o.seed ?? 9) * 37);
  const [la, lb] = o.len ?? [10, 40];
  const A = o.alpha ?? 0.8;
  for (let i = 0; i < (o.n ?? 8); i++) {
    const y = o.y0 + R() * (o.y1 - o.y0), x = R() * w, L = la + R() * (lb - la), th = 0.8 + R() * 0.9;
    const fill = (yy, hex, aa, inset, t) => {
      const g = ctx.createLinearGradient(x + inset, 0, x + L - inset, 0);
      g.addColorStop(0, rgba(hex, 0)); g.addColorStop(0.25, rgba(hex, aa)); g.addColorStop(0.7, rgba(hex, aa)); g.addColorStop(1, rgba(hex, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x + L / 2, yy, (L - inset * 2) / 2, t, 0, 0, TAU);
      ctx.fill();
    };
    fill(y + th * 0.7, o.shade ?? 0xd8e4f4, A * 0.55, L * 0.08, th * 0.45);
    fill(y, o.color ?? 0xffffff, A * 0.85, 0, th * 0.5);
  }
}

/** Soft star field, optional milky-way band. Same options as paintStarfield. */
export function hdStarfield(ctx, w, h, o = {}) {
  const R = mulberry32(o.seed ?? 3);
  const ymax = o.ymax ?? h * 0.6;
  if (o.milky) {
    const [ax, ay, bx, by, wd] = o.milky;
    const mc = o.milkyColor ?? 0x7a86c8;
    const R2 = mulberry32(99);
    for (let i = 0; i < 260; i++) {
      const t = R2(), off = (R2() + R2() + R2() - 1.5) * wd * 0.7;
      const L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L;
      const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
      if (y > ymax) continue;
      const n = vnoise(x * 0.05, y * 0.05, 5);
      hdGlow(ctx, x, y, wd * (0.25 + R2() * 0.35), wd * (0.18 + R2() * 0.25), mc, 0.07 + n * 0.08, 1.4);
    }
    ctx.fillStyle = rgba(0xe8ecff, 0.55);
    for (let i = 0; i < 520; i++) {
      const t = R2(), off = (R2() + R2() - 1) * wd * 0.6;
      const L = Math.hypot(bx - ax, by - ay), nx = -(by - ay) / L, ny = (bx - ax) / L;
      const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
      if (y > ymax) continue;
      ctx.globalAlpha = 0.25 + R2() * 0.45;
      ctx.beginPath(); ctx.arc(x, y, 0.16 + R2() * 0.14, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < (o.n ?? 120); i++) {
    const x = R() * w, y = Math.pow(R(), 1.3) * ymax;
    const b = (0.45 + R() * 0.55) * (1 - (y / ymax) * 0.6);
    const c = R() < 0.25 ? (o.tint ?? 0xbfe0ff) : R() < 0.1 ? 0xffe0b0 : 0xffffff;
    const big = R() < 0.07;
    const r = big ? 0.55 : 0.2 + R() * 0.25;
    if (big || r > 0.38) hdGlow(ctx, x, y, r * 4, r * 4, c, b * 0.35, 1.6);
    ctx.fillStyle = rgba(c, b);
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (big) {
      ctx.fillStyle = rgba(c, b * 0.55);
      ctx.beginPath(); ctx.ellipse(x, y, r * 4.5, r * 0.28, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.28, r * 4.5, 0, 0, TAU); ctx.fill();
    }
  }
}

/** Aurora curtain (smooth vertical streaks). Same options as paintAuroraPx. */
export function hdAurora(ctx, w, o = {}) {
  const [c0, c1, c2] = o.colors ?? [0x6effa8, 0x4ae0d0, 0xb070ff];
  const seed = o.seed ?? 1, H = o.height ?? 30, A = o.alpha ?? 0.7, f = o.freq ?? 0.05, amp = o.amp ?? 8;
  const step = 0.5;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let x = 0; x < w; x += step) {
    const yb = o.y + Math.sin(x * f + seed) * amp + Math.sin(x * f * 2.7 + seed * 3) * amp * 0.35;
    const hh = H * (0.45 + vnoise(x * 0.06, seed, 1) * 0.8);
    const streak = 0.5 + 0.5 * Math.sin(x * 0.9 + vnoise(x * 0.15, seed, 2) * 6);
    const g = ctx.createLinearGradient(0, yb + 1.5, 0, yb - hh);
    const a = A * (0.35 + 0.65 * streak);
    g.addColorStop(0, rgba(c0, 0));
    g.addColorStop(0.06, rgba(mixHex(c0, 0xffffff, 0.35), a));
    g.addColorStop(0.3, rgba(c1, a * 0.7));
    g.addColorStop(0.7, rgba(c2, a * 0.28));
    g.addColorStop(1, rgba(c2, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, yb - hh, step + 0.06, hh + 1.5);
  }
  ctx.restore();
}

/** Small painted birds (gull "v" strokes). list: [[x, y, size], ...] */
export function hdBirds(ctx, list, hex = 0x3a3a4a, a = 0.85) {
  ctx.save();
  ctx.strokeStyle = rgba(hex, a);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [x, y, s = 1] of list) {
    const L = (s + 1) * 1.1;
    ctx.lineWidth = 0.42 + s * 0.12;
    ctx.beginPath();
    ctx.moveTo(x - L, y - L * 0.45);
    ctx.quadraticCurveTo(x - L * 0.45, y - L * 0.75, x, y);
    ctx.quadraticCurveTo(x + L * 0.45, y - L * 0.75, x + L, y - L * 0.45);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Continuously shaded mountain range (one backing-store column at a time):
 * slope-lit faces, soft snow caps, gullies, rim light and a smooth haze fade.
 * Same options as paintRange; returns the logical top per integer column.
 */
export function hdRange(ctx, w, h, o = {}) {
  const k = ctx._hd ?? 1;
  const base = (o.base ?? 0.6) * h, amp = o.amp ?? h * 0.3, freq = o.freq ?? 0.02, seed = o.seed ?? 1, sx = o.sunX ?? -1;
  const lit = o.lit ?? 0x8aa8d0, mid = o.mid ?? shade(lit, -0.12), dark = o.dark ?? shade(lit, -0.28), rim = o.rim ?? shade(lit, 0.25);
  const topAt = (x) => {
    let v = vnoise(x * freq + seed * 13.1, seed, 0.5) * 0.62 + vnoise(x * freq * 2.6 + 5, 1.5, seed) * 0.26 + vnoise(x * freq * 7, 2.5, seed) * 0.12;
    if (o.ridged) v = 1 - Math.abs(v * 2 - 1) * 0.9;
    if (o.round) v = Math.sin(v * Math.PI * 0.5);
    return base - (v - 0.5) * 2 * amp;
  };
  const tops = new Float32Array(Math.ceil(w));
  for (let x = 0; x < tops.length; x++) tops[x] = topAt(x);
  const snowY = base - amp * (1 - 2 * (o.snowLine ?? 0.35));
  const N = Math.ceil(w * k), cw = 1 / k + 0.02;
  let haze = null;
  if (o.haze) {
    const [hx, from, st] = o.haze;
    haze = ctx.createLinearGradient(0, from * h, 0, h);
    haze.addColorStop(0, rgba(hx, 0));
    haze.addColorStop(1, rgba(hx, st ?? 0.8));
  }
  for (let i = 0; i < N; i++) {
    const x = i / k;
    const t = topAt(x);
    const sl = (topAt(x + 2) - topAt(x - 2)) * -sx;
    const face = clamp(sl / 2.2, -1, 1);
    const depth = 6 + vnoise(x * 0.15, seed, 3) * 14;
    const top = Math.max(0, t);
    ctx.fillStyle = rgba(mid);
    ctx.fillRect(x, top, cw, h - top);
    const fc = face > 0 ? mixHex(mid, lit, face) : mixHex(mid, dark, -face);
    const fg = ctx.createLinearGradient(0, t, 0, t + depth * 1.5);
    fg.addColorStop(0, rgba(fc));
    fg.addColorStop(0.55, rgba(fc, 0.85));
    fg.addColorStop(1, rgba(fc, 0));
    ctx.fillStyle = fg;
    ctx.fillRect(x, top, cw, depth * 1.5);
    if (o.gullies !== false) {
      const gx = x * 0.5 + seed * 7;
      const gv = Math.abs(gx - Math.round(gx));
      if (hash3(Math.round(gx), 3, seed) < 0.3 && gv < 0.08) {
        const gg = ctx.createLinearGradient(0, t + 2, 0, t + depth * 1.6);
        gg.addColorStop(0, rgba(dark, 0.55)); gg.addColorStop(1, rgba(dark, 0));
        ctx.fillStyle = gg;
        ctx.fillRect(x, t + 2, cw, depth * 1.6);
      }
    }
    if (o.snow && t < snowY) {
      const sd = (snowY - t) * 0.7 + (vnoise(x * 0.4, 9, seed) - 0.5) * 3;
      if (sd > 0) {
        const scol = face < -0.25 ? (o.snowShade ?? shade(o.snow, -0.18)) : face > 0.25 ? (o.snowLit ?? o.snow) : shade(o.snow, -0.06);
        const sg = ctx.createLinearGradient(0, t, 0, t + sd + 1.2);
        sg.addColorStop(0, rgba(scol));
        sg.addColorStop(Math.max(0, sd / (sd + 1.2)), rgba(scol, 0.95));
        sg.addColorStop(1, rgba(scol, 0));
        ctx.fillStyle = sg;
        ctx.fillRect(x, t, cw, sd + 1.2);
      }
    }
    ctx.fillStyle = rgba(face < -0.3 ? mid : o.snow && t < snowY ? (o.snowLit ?? o.snow) : rim, 0.9);
    ctx.fillRect(x, t, cw, 0.55);
    if (haze) {
      const hy = Math.max(t, o.haze[1] * h);
      ctx.fillStyle = haze;
      ctx.fillRect(x, hy, cw, h - hy);
    }
  }
  return tops;
}

/** Ridge band (ctx painter, see paintRidge) drawn smoothly. Returns the logical top per integer column. */
export function hdRidge(ctx, w, h, o = {}) {
  const k = ctx._hd ?? 1;
  const base = (o.base ?? 0.5) * h, amp = o.amp ?? h * 0.2, freq = o.freq ?? 0.02, seed = o.seed ?? 1, jag = o.jag ?? 0.2;
  const topAt = (x) => {
    let v = vnoise(x * freq + seed * 13.1, seed, 0.5) * 0.75 + vnoise(x * freq * 3.1 + seed * 5, 1.5, seed) * 0.25 * (1 + jag * 2);
    if (o.peaks) v = Math.pow(v, 1.6) * 1.4;
    return base - (v - 0.5) * 2 * amp;
  };
  const tops = [];
  for (let x = 0; x < w; x++) tops.push(Math.round(topAt(x)));
  const col = o.color ?? 0x4a8a5a, rim = o.rim ?? shade(col, 0.25);
  const N = Math.ceil(w * k), cw = 1 / k + 0.02;
  for (let i = 0; i < N; i++) {
    const x = i / k, t = clamp(topAt(x), 0, h);
    const sl = topAt(x + 1) - topAt(x - 1);
    ctx.fillStyle = rgba(col);
    ctx.fillRect(x, t, cw, h - t);
    if (o.dark && sl > 0) {
      ctx.fillStyle = rgba(o.dark, clamp(sl * 0.25, 0, 0.4));
      ctx.fillRect(x, t, cw, h - t);
    }
    if (o.snow && t < base - amp * 0.35) {
      ctx.fillStyle = rgba(o.snow);
      ctx.fillRect(x, t, cw, Math.max(0.6, (base - amp * 0.35 - t) * 0.6));
    }
    ctx.fillStyle = rgba(rim, 0.9);
    ctx.fillRect(x, t, cw, 0.6);
  }
  if (o.speck) {
    const R = mulberry32(seed * 31);
    ctx.fillStyle = rgba(o.speck, 0.6);
    for (let i = 0; i < w * (o.speckN ?? 0.6); i++) {
      const x = R() * w, y = topAt(x) + 2 + R() * (h - topAt(x));
      ctx.beginPath(); ctx.arc(x, y, 0.3, 0, TAU); ctx.fill();
    }
  }
  return tops;
}

/**
 * Pixel-buffer-compatible painter for an HD canvas. Legacy per-pixel painting
 * (set / rect / disc / dither, and kit px() / disc() on an HD canvas) goes into
 * a low-res buffer which sync() composites with a smooth upscale: colours are
 * interpolated and silhouettes get crisp anti-aliased curves (coverage-based
 * alpha), so nothing ever shows as hard pixel stair-steps. One buffer per canvas.
 */
export function hdPixbuf(ctx, w, h) {
  if (ctx._P) return ctx._P;
  w = Math.round(w); h = Math.round(h);
  let img = null, d = null, dirty = false;
  const ensure = () => { if (!img) { img = new ImageData(w, h); d = img.data; } };
  const P = {
    w, h, hd: ctx._hd, ctx, d: null,
    get() { return -1; },
    alpha(x, y) { if (!img) return 0; x |= 0; y |= 0; return x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]; },
    set(x, y, hex, a = 1) {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= w || y >= h || !(a > 0)) return P;
      ensure();
      dirty = true;
      const i = (y * w + x) * 4;
      const r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
      if (a >= 1 || d[i + 3] === 0) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = Math.round(255 * Math.min(1, a)); return P; }
      const da = d[i + 3] / 255, oa = a + da * (1 - a);
      d[i] = (r * a + d[i] * da * (1 - a)) / oa; d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa; d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
      d[i + 3] = Math.round(255 * oa);
      return P;
    },
    rect(x, y, rw, rh, hex, a = 1) {
      const x0 = Math.round(x), y0 = Math.round(y), x1 = Math.round(x + rw), y1 = Math.round(y + rh);
      for (let yy = Math.max(0, y0); yy < Math.min(h, y1); yy++) for (let xx = Math.max(0, x0); xx < Math.min(w, x1); xx++) P.set(xx, yy, hex, a);
      return P;
    },
    disc(cx, cy, r, hex, a = 1) {
      for (let y = -r; y <= r; y++) {
        const hw = Math.floor(Math.sqrt(r * r - y * y + r * 0.6));
        for (let x = -hw; x <= hw; x++) P.set(Math.round(cx) + x, Math.round(cy) + y, hex, a);
      }
      return P;
    },
    dither(x, y, hex, f) { if (f > 0) P.set(x, y, hex, Math.min(1, f)); },
    /** Composite pending buffered pixels (smooth upscale, coverage-sharpened edges) and clear the buffer. */
    sync() {
      if (!dirty) return;
      dirty = false;
      const k = ctx._hd ?? 1;
      const W = Math.round(w * k), H = Math.round(h * k);
      const src = document.createElement('canvas');
      src.width = w; src.height = h;
      src.getContext('2d').putImageData(img, 0, 0);
      const mk = new ImageData(w, h), md = mk.data;
      for (let i = 3; i < d.length; i += 4) if (d[i]) { md[i - 3] = md[i - 2] = md[i - 1] = 255; md[i] = 255; }
      const msrc = document.createElement('canvas');
      msrc.width = w; msrc.height = h;
      msrc.getContext('2d').putImageData(mk, 0, 0);
      const up = (c) => {
        const cv = document.createElement('canvas');
        cv.width = W; cv.height = H;
        const cc = cv.getContext('2d', { willReadFrequently: true });
        cc.imageSmoothingEnabled = true;
        cc.imageSmoothingQuality = 'high';
        cc.drawImage(c, 0, 0, W, H);
        return cc;
      };
      const cc = up(src), mc = up(msrc);
      const ci = cc.getImageData(0, 0, W, H), cd = ci.data, ld = mc.getImageData(0, 0, W, H).data;
      for (let i = 3; i < cd.length; i += 4) {
        const cov = ld[i] / 255;
        if (cov <= 0) { cd[i] = 0; continue; }
        const intended = Math.min(1, cd[i] / 255 / cov);
        let t = (cov - 0.3) / 0.4;
        t = t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t);
        cd[i] = Math.round(255 * intended * t);
      }
      cc.putImageData(ci, 0, 0);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(cc.canvas, 0, 0);
      ctx.restore();
      d.fill(0);
    },
    flush() { P.sync(); },
  };
  ctx._P = P;
  return P;
}
