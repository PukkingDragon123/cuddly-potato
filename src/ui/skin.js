// Procedural pixel-art UI skins.
//
// Every frame (buttons, panels, pills, bars, cards, ribbons...) is drawn at
// 1x pixel-art resolution on a tiny canvas with an ink outline, stepped
// rounded corners, a light inner bevel on top, a darker "3D lip" at the
// bottom and a specular glint, then used as a 9-slice CSS border-image that
// is scaled up by an integer pixel size (--px) with nearest-neighbour
// filtering. The result: crisp, chunky, shaded pixel-art frames that scale to
// any element size.

const css = (hex) => (typeof hex === 'string' ? hex : '#' + (hex >>> 0).toString(16).padStart(6, '0'));
const hexToRgb = (hex) => {
  const h = typeof hex === 'string' ? parseInt(hex.slice(1), 16) : hex;
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
};
export function shadeHex(hex, f) {
  let [r, g, b] = hexToRgb(hex);
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + ((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0');
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Rounded-rect inside test with a pixel-stepped corner radius. */
function insideRR(x, y, w, h, r) {
  const cx = x < r ? r - 0.5 : x > w - 1 - r ? w - r - 0.5 : x;
  const cy = y < r ? r - 0.5 : y > h - 1 - r ? h - r - 0.5 : y;
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= (r - 0.15) * (r - 0.15) + 0.6;
}

/**
 * Draw a frame skin. Returns { url, slice, w, h }.
 * o: { w, h, r (corner radius), outline, fill, top (gloss band colour), topRows,
 *      lip (rows), lipColor, hi, lo, inset (recessed), glint, ring (inner ring colour), ringW, dither }
 */
export function frameSkin(o) {
  const w = o.w ?? 20, h = o.h ?? 20, r = o.r ?? 4, lip = o.lip ?? 0;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const d = img.data;
  const inside = (x, y) => x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && insideRR(x - 1, y - 1, w - 2, h - 2, r);
  const set = (x, y, col, a = 255) => {
    if (!col) return;
    const [R, G, B] = hexToRgb(col);
    const i = (y * w + x) * 4;
    d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = a;
  };
  const fill = o.fill ?? '#3a56c8';
  const outline = o.outline ?? '#0d0a1f';
  const hi = o.hi ?? shadeHex(fill, o.inset ? -0.35 : 0.42);
  const lo = o.lo ?? shadeHex(fill, o.inset ? 0.18 : -0.28);
  const lipC = o.lipColor ?? shadeHex(fill, -0.38);
  const topC = o.top ?? null;
  const topRows = o.topRows ?? Math.floor(h / 2) - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) {
        if (inside(x + 1, y) || inside(x - 1, y) || inside(x, y + 1) || inside(x, y - 1)) set(x, y, outline);
        else if (o.shadow && (inside(x, y - 1) || inside(x - 1, y - 1))) set(x, y, o.shadow, 140);
        continue;
      }
      let col = fill;
      if (topC && y <= topRows) col = o.dither && y === topRows ? (bayer(x, y) < 0.5 ? topC : fill) : topC;
      const up = inside(x, y - 1), dn = inside(x, y + 1), lf = inside(x - 1, y), rt = inside(x + 1, y);
      const lipStart = h - 2 - lip;
      if (lip && y > lipStart) col = lipC;
      else if (!up) col = hi;
      else if (!dn || (lip && y === lipStart)) col = lo;
      else if (!lf) col = o.inset ? shadeHex(fill, -0.2) : shadeHex(col, 0.16);
      else if (!rt) col = o.inset ? shadeHex(fill, 0.1) : shadeHex(col, -0.14);
      if (o.ring && !(lip && y > lipStart - 1)) {
        let ed = 5;
        for (let k = 1; k <= 4; k++) if (!inside(x, y - k) || !inside(x, y + k) || !inside(x - k, y) || !inside(x + k, y)) { ed = k; break; }
        if (ed >= 2 && ed <= 1 + (o.ringW ?? 1)) col = o.ring;
      }
      set(x, y, col);
    }
  }
  if (o.glint !== false && !o.inset) {
    // specular glint in the top-left corner
    const gx = r > 2 ? Math.floor(r * 0.7) + 1 : 2, gy = 2;
    set(gx, gy, '#ffffff'); set(gx + 1, gy, '#ffffff'); set(gx, gy + 1, '#ffffff');
    if (o.glint === 'big') { set(gx + 2, gy, '#ffffff'); set(gx, gy + 2, '#ffffff'); }
  }
  g.putImageData(img, 0, 0);
  const slice = Math.max(r + 2, lip + 3, o.slice ?? 0);
  return { url: c.toDataURL(), slice, w, h };
}

/** Ribbon / banner with folded tails (3-slice horizontally). */
export function ribbonSkin(o) {
  const w = 40, h = 18;
  const c = canvas(w, h);
  const g = c.getContext('2d');
  const col = o.fill ?? '#ff2e88', dark = shadeHex(col, -0.4), light = shadeHex(col, 0.35), ink = o.outline ?? '#0d0a1f';
  const P = (x, y, ww, hh, cc) => { g.fillStyle = cc; g.fillRect(x, y, ww, hh); };
  // tails (behind)
  for (const side of [0, 1]) {
    const x0 = side ? w - 9 : 0;
    P(x0, 5, 9, 11, ink);
    P(x0 + 1, 6, 7, 9, dark);
    // notch
    const nx = side ? w - 2 : 1;
    P(nx, 9, 1, 3, 'rgba(0,0,0,0)');
    g.clearRect(side ? w - 3 : 0, 9, 3, 3);
    P(side ? w - 4 : 3, 9, 1, 3, ink);
  }
  // main band
  P(5, 1, w - 10, 15, ink);
  P(6, 2, w - 12, 13, col);
  P(6, 2, w - 12, 2, light);
  P(6, 12, w - 12, 3, dark);
  P(7, 2, 2, 1, '#ffffff');
  return { url: c.toDataURL(), sliceX: 12, sliceY: 6, w, h };
}

// ---------------------------------------------------------------------------
// Skin registry -> CSS

const FILL = {
  yellow: { fill: '#ffc21a', top: '#ffe04a', lipColor: '#c76a12', hi: '#fff6b8', lo: '#e8901a' },
  orange: { fill: '#ff8a1f', top: '#ffab3a', lipColor: '#b54a0e', hi: '#ffe0a8', lo: '#de6a14' },
  blue: { fill: '#2b8cf2', top: '#4fb0ff', lipColor: '#174ea8', hi: '#c4ecff', lo: '#1e6fd0' },
  green: { fill: '#3ec43a', top: '#63e04a', lipColor: '#1d7a2a', hi: '#d4ffb0', lo: '#2ea132' },
  red: { fill: '#f23a4a', top: '#ff6070', lipColor: '#9a1a2a', hi: '#ffd0d4', lo: '#c82838' },
  pink: { fill: '#ff2e88', top: '#ff5aa8', lipColor: '#a8145a', hi: '#ffd0e8', lo: '#d81c70' },
  purple: { fill: '#9a4cf0', top: '#b874ff', lipColor: '#5a2aa0', hi: '#ead4ff', lo: '#7a36d0' },
  gray: { fill: '#8a96b8', top: '#a8b4d4', lipColor: '#4e5878', hi: '#e4ecff', lo: '#6e7a9c' },
  teal: { fill: '#1ec8b0', top: '#46e8cc', lipColor: '#0e7a6e', hi: '#c8fff2', lo: '#16a090' },
  gold: { fill: '#ffb21a', top: '#ffd84a', lipColor: '#a8600e', hi: '#fffadc', lo: '#e08a14' },
  white: { fill: '#e8eefc', top: '#ffffff', lipColor: '#8e9ac0', hi: '#ffffff', lo: '#c4cee8' },
};

let injected = false;
export function injectSkins() {
  if (injected) return;
  injected = true;
  const rules = [];
  const add = (cls, sk, extra = '', o = {}) => {
    const unit = o.unit ?? 'var(--px)';
    rules.push(`${cls}{border-style:solid;border-image:url(${sk.url}) ${sk.slice}${o.fill === false ? '' : ' fill'} / calc(${sk.slice} * ${unit}) / 0 stretch;border-width:calc(${sk.slice} * ${unit});${extra}}`);
  };
  // buttons (with 3D lip)
  for (const [k, v] of Object.entries(FILL)) {
    add(`.sk-btn-${k}`, frameSkin({ w: 20, h: 22, r: 4, lip: 3, topRows: 8, dither: true, shadow: '#000000', ...v }));
    add(`.sk-btn-${k}.pressed,.sk-btn-${k}:active:not(.disabled)`, frameSkin({ w: 20, h: 22, r: 4, lip: 1, topRows: 9, dither: true, ...v, glint: false }));
    add(`.sk-chip-${k}`, frameSkin({ w: 12, h: 12, r: 2, lip: 1, topRows: 5, ...v }));
  }
  // panels
  add('.sk-panel', frameSkin({ w: 24, h: 24, r: 5, fill: '#2a3f9a', top: '#30479f', hi: '#5a7ae8', lo: '#1c2a72', lip: 2, lipColor: '#141e58', glint: 'big', ring: '#223585' }));
  add('.sk-panel-dark', frameSkin({ w: 20, h: 20, r: 4, fill: '#1a2460', hi: '#3a4c9e', lo: '#10173f', lip: 1, lipColor: '#0c1236' }));
  add('.sk-panel-light', frameSkin({ w: 20, h: 20, r: 4, fill: '#e8eefc', top: '#f4f7ff', hi: '#ffffff', lo: '#b8c4e4', lip: 2, lipColor: '#8e9ac0' }));
  add('.sk-panel-cream', frameSkin({ w: 20, h: 20, r: 4, fill: '#fff4dc', top: '#fffaf0', hi: '#ffffff', lo: '#e6cfa0', lip: 2, lipColor: '#b8956a' }));
  add('.sk-panel-gold', frameSkin({ w: 24, h: 24, r: 5, fill: '#5a3a14', top: '#6a4618', hi: '#ffd84a', lo: '#3a240c', lip: 2, lipColor: '#2a1806', ring: '#c88a1a', glint: 'big' }));
  add('.sk-panel-pink', frameSkin({ w: 24, h: 24, r: 5, fill: '#7a1a5a', top: '#8a2066', hi: '#ff7ac0', lo: '#4a0c36', lip: 2, lipColor: '#360628', ring: '#c4307e', glint: 'big' }));
  // recessed wells (pills, bar troughs, slots)
  add('.sk-well', frameSkin({ w: 14, h: 14, r: 3, fill: '#0f1438', inset: true, hi: '#060920', lo: '#2a3474', glint: false }));
  add('.sk-well-light', frameSkin({ w: 14, h: 14, r: 3, fill: '#c8d2ee', inset: true, hi: '#8e9ac0', lo: '#ffffff', glint: false }));
  add('.sk-slot', frameSkin({ w: 16, h: 16, r: 3, fill: '#1e2a6e', inset: true, hi: '#10173f', lo: '#4a5cb8', glint: false }));
  // card frames (rarity rims)
  const rim = { common: '#b8c6e8', rare: '#ff9a2e', epic: '#c063ff', legendary: '#3ff2c8', mythic: '#ff2e88', locked: '#4a5478' };
  for (const [k, col] of Object.entries(rim)) {
    add(`.sk-card-${k}`, frameSkin({ w: 16, h: 18, r: 2, fill: col, hi: shadeHex(col, 0.55), lo: shadeHex(col, -0.35), lip: 1, lipColor: shadeHex(col, -0.5), glint: 'big' }), '', { fill: false, unit: 'var(--pxs)' });
  }
  // ribbons
  for (const k of ['pink', 'blue', 'gold', 'green', 'purple', 'red']) {
    const rb = ribbonSkin({ fill: FILL[k === 'gold' ? 'yellow' : k].fill });
    rules.push(`.sk-ribbon-${k}{border-style:solid;border-image:url(${rb.url}) ${rb.sliceY} ${rb.sliceX} fill / calc(${rb.sliceY} * var(--px)) calc(${rb.sliceX} * var(--px)) / 0 stretch;border-width:calc(${rb.sliceY} * var(--px)) calc(${rb.sliceX} * var(--px));}`);
  }
  const style = document.createElement('style');
  style.id = 'pixel-skins';
  style.textContent = rules.join('\n');
  document.head.appendChild(style);
}
