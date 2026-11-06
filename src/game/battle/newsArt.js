// BEAST NEWS pixel art (result.js / result.css): the broadcast palette, bevelled pixel frames
// (9-slice border images scaled by --px), stripe / dither / scanline tiles, the MVP spotlight
// cone and the replay glass glare. Everything is painted once at 1x on tiny canvases and
// injected as one <style> (classes + CSS variables), so the report itself only uses CSS.
//
//   injectNewsArt();             // idempotent
//   class="nx-g-steel"           // dark glass panel, steel bevel (padding-box tinted glass)
//   class="nx-t-gold"            // small glass tile (reward tiles), gold bevel
//   class="nx-s-red"             // solid bevelled plate (logo bug, category plates, tags)
//   class="nx-c-navy"            // small solid chip (2 px bevel)
//   var(--nx-st-red)             // diagonal stepped stripes (8 x 8 tile), red / dark red
//   var(--nx-df-red), --nx-dg-*  // dither fade (4 x 16 tile): solid at the top, dissolving downward
//   var(--nx-scan), var(--nx-glare), var(--nx-spot), var(--nx-sheen)

/** Restrained broadcast palette: navy / steel base, Beast red + white accents, gold only for rewards.
 *  Team colours: mine = blue, theirs = red. */
export const NX = {
  red: '#e8203a', white: '#f2f5ff', steel: '#7c89b4', navy: '#34417a', gold: '#ffc23a', blue: '#3a7ee8',
};
const INK = '#120c24';
const NAVY = '#0a0d2e';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };
const shade = (a, f) => (f >= 0 ? mix(a, '#ffffff', f) : mix(a, '#000000', -f));
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

function painter(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  const set = (x, y, col, a = 255) => {
    if (!col || x < 0 || y < 0 || x >= w || y >= h) return;
    const [r, gg, b] = hex(col);
    const i = (y * w + x) * 4;
    img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = a;
  };
  return { set, url: () => { g.putImageData(img, 0, 0); return c.toDataURL(); } };
}

/**
 * Bevelled broadcast frame with stepped 45 degree chamfered corners. Returns a data URL.
 * kind 'g': ink outline, light / dark bevel, ink inner line, transparent centre (glass is CSS).
 * kind 's': solid plate: bevel + body + a gloss row and a dithered shade row under it.
 * kind 'c': small chip (outline, 1 px bevel, body).
 * kind 't': small glass tile (outline, 1 px bevel, ink line, transparent centre).
 */
function frame(col, kind) {
  const small = kind === 'c' || kind === 't';
  const W = small ? 12 : 18, C = small ? 1 : 2;
  const P = painter(W, W);
  const hiT = mix(col, '#ffffff', 0.62), hiL = mix(col, '#ffffff', 0.34), loB = shade(col, -0.52), loR = shade(col, -0.36);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const R = W - 1 - x, B = W - 1 - y;
    const terms = [[y, 't'], [x, 'l'], [B, 'b'], [R, 'r'], [x + y - C, 't'], [R + y - C, 't'], [x + B - C, 'b'], [R + B - C, 'b']];
    let ring = 99, sd = 't';
    for (const [v, s] of terms) if (v < ring) { ring = v; sd = s; }
    if (ring < 0) continue;
    let c = null;
    if (ring === 0) c = INK;
    else if (ring === 1) c = sd === 't' ? hiT : sd === 'l' ? hiL : sd === 'b' ? loB : loR;
    else if (kind === 't') {
      if (ring === 2) c = INK;
      else if (ring === 3) c = sd === 't' || sd === 'l' ? mix(col, NAVY, 0.55) : null;
    } else if (kind === 'g') {
      if (ring === 2) c = sd === 't' ? mix(col, '#ffffff', 0.18) : sd === 'b' ? shade(col, -0.2) : col;
      else if (ring === 3) c = INK;
      else if (ring === 4) c = sd === 't' || sd === 'l' ? mix(col, NAVY, 0.6) : null; // inner glass rim light
    } else {
      // solid plate body; the top row under the bevel is a gloss line, the bottom rows a dithered shade
      c = col;
      if (!small && y === 2 && sd === 't') c = mix(col, '#ffffff', 0.45);
      if (!small && y === 3 && ring >= 2) c = bayer(x, y) < 0.5 ? mix(col, '#ffffff', 0.22) : col;
      if (!small && B === 2 && ring >= 2) c = shade(col, -0.22);
      if (!small && B === 3 && ring >= 2) c = bayer(x, y) < 0.5 ? shade(col, -0.12) : col;
      if (small && B === 1 && ring >= 1 && sd !== 'r' && sd !== 'l') c = loB;
    }
    P.set(x, y, c);
  }
  // specular glint (top left)
  P.set(C + 1, 1, '#ffffff'); P.set(C + 2, 1, '#ffffff'); P.set(1, C + 1, '#ffffff');
  return P.url();
}

/** Diagonal stepped stripes: 8 x 8 tile, 4 px of each colour, one pixel step per row. */
function stripes(a, b) {
  const P = painter(8, 8);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) P.set(x, y, ((x + y) & 7) < 4 ? a : b);
  return P.url();
}
/** Dither fade: solid colour at the top dissolving to nothing over 16 rows (Bayer ordered dither). */
function ditherFade(col) {
  const P = painter(4, 16);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 4; x++) if (bayer(x, y) < 1 - (y + 0.5) / 16) P.set(x, y, col);
  return P.url();
}
/** Scanlines: 1 x 3 tile, one dark row. */
function scan() {
  const P = painter(1, 3);
  P.set(0, 2, '#000000', 90);
  return P.url();
}
/** Glass glare for the replay screen: two stepped diagonal light bands in the top-left corner. */
function glare() {
  const W = 64, H = 36;
  const P = painter(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = x + y * 1.4;
    if (d > 4 && d < 13) P.set(x, y, '#ffffff', 46);
    else if (d > 16 && d < 19) P.set(x, y, '#ffffff', 34);
  }
  return P.url();
}
/** Sheen: a 2-band pixel diagonal glint (used as a moving background over shiny counters). */
function sheen() {
  const W = 24, H = 24;
  const P = painter(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = (x + y) % 24;
    if (d >= 4 && d < 8) P.set(x, y, '#ffffff', 110);
    else if (d >= 10 && d < 11) P.set(x, y, '#ffffff', 80);
  }
  return P.url();
}
/** MVP spotlight: a warm cone from the top, dithered at its edges and toward the floor. */
function spot() {
  const W = 40, H = 48;
  const P = painter(W, H);
  for (let y = 0; y < H; y++) {
    const half = 4 + (y / H) * 16;
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + 0.5 - W / 2);
      if (dx > half) continue;
      const edge = 1 - dx / half, fall = 1 - y / H * 0.55;
      const k = Math.min(1, edge * 2.2) * fall;
      if (bayer(x, y) < k * 0.92) P.set(x, y, edge > 0.7 ? '#fff6c8' : '#ffd84a', edge > 0.7 ? 120 : 70);
    }
  }
  // the pool of light on the floor: a stepped ellipse of dithered light
  for (let y = H - 7; y < H; y++) for (let x = 0; x < W; x++) {
    const ex = (x + 0.5 - W / 2) / 19, ey = (y + 0.5 - (H - 3.5)) / 3.5;
    const q = ex * ex + ey * ey;
    if (q < 1 && bayer(x, y) < (1 - q) * 1.1) P.set(x, y, '#fff2a8', 130);
  }
  return P.url();
}

let done = false;
export function injectNewsArt() {
  if (done || typeof document === 'undefined') return;
  done = true;
  const rules = [];
  const vars = [];
  for (const [k, col] of Object.entries(NX)) {
    const glass = mix(col, NAVY, 0.86), glass2 = mix(col, '#05061a', 0.9);
    vars.push(`--nx-${k}:${col}`, `--nx-${k}-d:${shade(col, -0.45)}`, `--nx-${k}-l:${mix(col, '#ffffff', 0.55)}`);
    vars.push(`--nx-st-${k}:url(${stripes(col, shade(col, -0.28))})`, `--nx-df-${k}:url(${ditherFade(col)})`, `--nx-dg-${k}:url(${ditherFade(mix(col, NAVY, 0.5))})`);
    rules.push(`.nx-g-${k}{--nx:${col};--nx-d:${shade(col, -0.45)};--nx-l:${mix(col, '#ffffff', 0.55)};border-style:solid;border-width:calc(5 * var(--px));border-image:url(${frame(col, 'g')}) 5 / calc(5 * var(--px)) / 0 stretch;background:var(--nx-dg-${k}) 0 0 / calc(4 * var(--px)) calc(16 * var(--px)) repeat-x, linear-gradient(${glass}, ${glass2});background-clip:padding-box;}`);
    rules.push(`.nx-s-${k}{--nx:${col};--nx-d:${shade(col, -0.45)};border-style:solid;border-width:calc(4 * var(--px));border-image:url(${frame(col, 's')}) 4 fill / calc(4 * var(--px)) / 0 stretch;}`);
    rules.push(`.nx-t-${k}{--nx:${col};--nx-d:${shade(col, -0.45)};border-style:solid;border-width:calc(3 * var(--px));border-image:url(${frame(col, 't')}) 3 / calc(3 * var(--px)) / 0 stretch;background:var(--nx-dg-${k}) 0 0 / calc(4 * var(--px)) calc(16 * var(--px)) repeat-x, linear-gradient(${mix(col, NAVY, 0.8)}, ${glass2});background-clip:padding-box;}`);
    rules.push(`.nx-c-${k}{--nx:${col};--nx-d:${shade(col, -0.45)};border-style:solid;border-width:calc(3 * var(--px));border-image:url(${frame(col, 'c')}) 3 fill / calc(3 * var(--px)) / 0 stretch;}`);
  }
  vars.push(`--nx-st-ink:url(${stripes('#121838', '#0d1230')})`, `--nx-scan:url(${scan()})`, `--nx-glare:url(${glare()})`, `--nx-sheen:url(${sheen()})`, `--nx-spot:url(${spot()})`);
  rules.unshift(`:root{${vars.join(';')}}`);
  const st = document.createElement('style');
  st.id = 'news-art';
  st.textContent = rules.join('\n');
  document.head.appendChild(st);
}
