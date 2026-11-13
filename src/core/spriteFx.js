// 3D -> 2D sprite look for thumbnails. The thumbnail studio renders a model at a LOW internal
// resolution; this pass then makes it read as a hand-pixelled sprite:
//   1. alpha cleanup: anti-aliased silhouette pixels snap to in/out (no fringes), glass keeps
//      a few stepped alpha levels
//   2. toon ramp: colours snap to stepped value / saturation / hue bands (3-4 light bands per
//      lit surface), then a palette clamp merges rare colours into the nearest common one
//   3. inner lines: a depth discontinuity (an arm in front of the body) darkens the far side
//   4. a 1px light rim on silhouette pixels facing the key light (top / right)
//   5. a 1px outline around the silhouette, in a darkened, purple-leaning hue of the pixel it
//      touches (not flat black)
// The caller upscales the result with nearest-neighbour at an integer factor.
import * as THREE from 'three';

/** Depth material: linear view depth in [zN, zF] packed into R (high byte) + G (low byte). */
export function makeSpriteDepthMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { zN: { value: 0 }, zF: { value: 1 } },
    vertexShader: /* glsl */ `
      #include <common>
      #include <batching_pars_vertex>
      varying float vZ;
      void main() {
        #include <begin_vertex>
        #include <batching_vertex>
        #include <project_vertex>
        vZ = -mvPosition.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform float zN, zF;
      varying float vZ;
      void main() {
        float d = clamp((vZ - zN) / max(1e-4, zF - zN), 0.0, 1.0) * 255.0;
        gl_FragColor = vec4(floor(d) / 255.0, fract(d), 0.0, 1.0);
      }`,
    side: THREE.DoubleSide,
  });
}

// --------------------------------------------------------------------------- colour helpers
function rgb2hsv(r, g, b, out) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-6) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
    if (h < 0) h += 1;
  }
  out[0] = h; out[1] = mx > 0 ? d / mx : 0; out[2] = mx;
  return out;
}
function hsv2rgb(h, s, v, out) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  out[0] = Math.round(r * 255); out[1] = Math.round(g * 255); out[2] = Math.round(b * 255);
  return out;
}
const INK = [18, 12, 36]; // the UI's ink colour (#120c24): outlines lean toward it
const _h = [0, 0, 0], _c = [0, 0, 0];
/** Shift hue a little toward `target` (0..1 hue), the classic pixel-art hue shift for shadows / lights. */
function hueToward(h, target, k) {
  let d = target - h;
  if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
  return h + d * k;
}

/**
 * Process a low-res RGBA render in place. `depth` (optional): RGBA pixels of the depth pass.
 * o: { bands, maxColors, rim, inner, innerThr, outline }
 */
export function spriteize(img, w, h, depth = null, o = {}) {
  const px = img.data, n = w * h;
  const A = new Uint8Array(n);
  for (let i = 0; i < n; i++) A[i] = px[i * 4 + 3];
  const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && A[y * w + x] >= 128;
  const empty = (x, y) => x < 0 || y < 0 || x >= w || y >= h || A[y * w + x] < 24;

  // 1. alpha: silhouette edge pixels snap in/out; interior translucency keeps 4 steps
  const a2 = new Uint8Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, a = A[i];
    if (a < 24) a2[i] = 0;
    else if (a > 232) a2[i] = 255;
    else if (empty(x - 1, y) || empty(x + 1, y) || empty(x, y - 1) || empty(x, y + 1)) a2[i] = a >= 104 ? 255 : 0;
    else a2[i] = Math.min(255, Math.round(a / 64) * 64);
  }
  A.set(a2);

  // 2. toon ramp: stepped value / saturation / hue
  const VB = o.bands ?? 7, SB = 5, HB = 30;
  for (let i = 0; i < n; i++) {
    const k = i * 4;
    if (!A[i]) { px[k] = px[k + 1] = px[k + 2] = px[k + 3] = 0; continue; }
    rgb2hsv(px[k], px[k + 1], px[k + 2], _h);
    let v = Math.round(_h[2] * VB) / VB, s = Math.round(_h[1] * SB) / SB, hu = Math.round(_h[0] * HB) / HB;
    // shadows drift toward blue-violet, highlights toward warm yellow
    if (s > 0.05) hu = v < 0.5 ? hueToward(hu, 0.72, 0.06) : v > 0.85 ? hueToward(hu, 0.14, 0.04) : hu;
    hsv2rgb(hu, s, Math.max(v, 0.06), _c);
    px[k] = _c[0]; px[k + 1] = _c[1]; px[k + 2] = _c[2]; px[k + 3] = A[i];
  }

  // palette clamp: keep the most used colours, fold the rest into their nearest kept colour
  const maxC = o.maxColors ?? 40;
  const hist = new Map();
  for (let i = 0; i < n; i++) if (A[i]) { const k = i * 4, c = (px[k] << 16) | (px[k + 1] << 8) | px[k + 2]; hist.set(c, (hist.get(c) ?? 0) + 1); }
  if (hist.size > maxC) {
    const keep = [...hist.entries()].sort((p, q) => q[1] - p[1]).slice(0, maxC).map((e) => e[0]);
    const map = new Map();
    for (const c of hist.keys()) {
      let best = c, bd = Infinity;
      const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
      for (const q of keep) {
        const dr = r - (q >> 16), dg = g - ((q >> 8) & 255), db = b - (q & 255);
        const d = dr * dr * 3 + dg * dg * 4 + db * db * 2;
        if (d < bd) { bd = d; best = q; }
      }
      map.set(c, best);
    }
    for (let i = 0; i < n; i++) if (A[i]) {
      const k = i * 4, c = map.get((px[k] << 16) | (px[k + 1] << 8) | px[k + 2]);
      px[k] = c >> 16; px[k + 1] = (c >> 8) & 255; px[k + 2] = c & 255;
    }
  }

  // 3. inner lines on depth jumps (the far pixel darkens, so the near limb keeps its shape)
  const line = new Uint8Array(n);
  if (depth && o.inner !== false) {
    const dp = depth.data, D = new Float32Array(n);
    for (let i = 0; i < n; i++) D[i] = dp[i * 4 + 3] > 0 ? (dp[i * 4] + dp[i * 4 + 1] / 255) / 255 : -1;
    const thr = o.innerThr ?? 0.09;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (A[i] < 192 || D[i] < 0) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (!solid(xx, yy)) continue;
        const j = yy * w + xx;
        if (D[j] >= 0 && D[i] - D[j] > thr) { line[i] = 1; break; }
      }
    }
    for (let i = 0; i < n; i++) if (line[i]) {
      const k = i * 4;
      rgb2hsv(px[k], px[k + 1], px[k + 2], _h);
      hsv2rgb(hueToward(_h[0], 0.75, 0.15), Math.min(1, _h[1] * 1.1 + 0.15), _h[2] * 0.5, _c);
      px[k] = _c[0]; px[k + 1] = _c[1]; px[k + 2] = _c[2];
    }
  }

  // 4. light rim: silhouette pixels facing the key light (above / right is empty), on parts at least 3px thick
  if (o.rim !== false) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (A[i] < 255 || line[i]) continue;
      const top = empty(x, y - 1), right = empty(x + 1, y);
      if (!(top || right)) continue;
      if (top ? !(solid(x, y + 1) && solid(x, y + 2)) : !(solid(x - 1, y) && solid(x - 2, y))) continue;
      const k = i * 4;
      rgb2hsv(px[k], px[k + 1], px[k + 2], _h);
      hsv2rgb(hueToward(_h[0], 0.14, 0.05), _h[1] * 0.82, Math.min(1, _h[2] * 1.12 + 0.1), _c);
      px[k] = _c[0]; px[k + 1] = _c[1]; px[k + 2] = _c[2];
    }
  }

  // 5. outline: 1px (4-neighbour, so no diagonal blobs) in a darkened hue of the touched pixel
  if (o.outline !== false) {
    const src = new Uint8ClampedArray(px);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (A[i]) continue;
      let j = -1;
      for (const [dx, dy] of [[0, 1], [-1, 0], [1, 0], [0, -1]]) if (solid(x + dx, y + dy)) { j = (y + dy) * w + x + dx; break; }
      if (j < 0) continue;
      const k = i * 4, q = j * 4;
      rgb2hsv(src[q], src[q + 1], src[q + 2], _h);
      hsv2rgb(hueToward(_h[0], 0.75, 0.25), Math.min(1, _h[1] * 1.1 + 0.3), _h[2] * 0.34 + 0.04, _c);
      px[k] = Math.round(_c[0] * 0.65 + INK[0] * 0.35);
      px[k + 1] = Math.round(_c[1] * 0.65 + INK[1] * 0.35);
      px[k + 2] = Math.round(_c[2] * 0.65 + INK[2] * 0.35);
      px[k + 3] = 255;
    }
  }
  return img;
}

/** Integer nearest-neighbour upscale factor for a w x h thumbnail (internal art ~84px on its long side). */
export function spriteScale(w, h, target = 84) {
  return Math.max(1, Math.round(Math.max(w, h) / target));
}
