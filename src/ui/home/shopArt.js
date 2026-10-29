// Pixel-art skins for the SHOP's secret bunker, painted once on tiny canvases and
// exposed as CSS custom properties (9-slice border images and tiles):
//   --bk-crate     wooden crate frame (boards, nail heads, steel corner brackets, dark plank inside)
//   --bk-plate     gunmetal plate with a bevel and rivets (section signs, chips)
//   --bk-concrete  concrete wall tile (speckles, pits, hairline cracks)
//   --bk-floor     darker concrete tile with slab seams (behind the goods list)
//   --bk-stamp     red rubber-stamp frame, distressed ink (SOLD OUT)
//   --bk-sign      plank sign with nails (the stash sign)
//   --bk-crt       beige CRT bezel around a green scanline screen (timers, readouts)
//   --bk-vault     vault door frame: thick steel, bolt ring, hazard band (the featured offer)
//   --bk-bubble    speech bubble (cream paper, ink outline, drop shadow) + --bk-tail
//   --bk-burst     jagged price sticker (haggled discounts)
//   --bk-tag       paper shipping tag with a punched hole (stock left)
//   --bk-note      sticky note with a strip of tape
// One art pixel = var(--px) / 2 on screen (the same grid as the rest of the pixel UI).

const INK = '#120c0a';
let done = false;

function painter(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const set = (x, y, hex, a = 255) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = (y * w + x) * 4, v = parseInt(hex.slice(1), 16);
    d[i] = (v >> 16) & 255; d[i + 1] = (v >> 8) & 255; d[i + 2] = v & 255; d[i + 3] = a;
  };
  return { set, w, h, url() { ctx.putImageData(img, 0, 0); return c.toDataURL('image/png'); } };
}
const hash = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
function shadeHex(hex, f) {
  const v = parseInt(hex.slice(1), 16);
  let r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const c = (x) => Math.max(0, Math.min(255, Math.round(x)));
  return '#' + ((c(r) << 16) | (c(g) << 8) | c(b)).toString(16).padStart(6, '0');
}
/** Inside a rect with stepped (pixel) rounded corners of radius r. */
const inRR = (x, y, w, h, r) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return false;
  const cx = x < r ? r - x - 0.5 : x >= w - r ? x - (w - r) + 0.5 : 0;
  const cy = y < r ? r - y - 0.5 : y >= h - r ? y - (h - r) + 0.5 : 0;
  return cx * cx + cy * cy <= r * r + 0.5;
};
/** Distance (in px, up to n) from (x, y) to the outside of a rounded rect. */
const edgeDist = (x, y, w, h, r, n) => {
  for (let k = 1; k <= n; k++) if (!inRR(x - k, y, w, h, r) || !inRR(x + k, y, w, h, r) || !inRR(x, y - k, w, h, r) || !inRR(x, y + k, w, h, r)) return k;
  return n + 1;
};
function rivet(set, cx, cy, metal = '#9aa2ae') {
  const px = [[0, -1], [-1, 0], [0, 0], [1, 0], [0, 1], [1, -1], [-1, 1], [1, 1], [-1, -1]];
  for (const [dx, dy] of px) {
    const corner = dx && dy;
    const c = dx + dy < 0 ? shadeHex(metal, 0.45) : dx + dy > 0 ? shadeHex(metal, -0.45) : metal;
    set(cx + dx, cy + dy, corner ? shadeHex(metal, -0.25) : c);
  }
  set(cx - 1, cy - 1, '#ffffff');
}

// ---------------------------------------------------------------------------

function crate() {
  const W = 40, H = 40, P = painter(W, H), B = 9;
  const wood = '#8a5a30', woodL = '#b47a42', woodD = '#5e3a1c', grain = '#6e4626', gap = '#24140a';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inRR(x, y, W, H, 3)) continue;
      const e = edgeDist(x, y, W, H, 3, B + 2);
      if (e <= 2) { P.set(x, y, INK); continue; }
      if (e <= B) {
        // boards: horizontal on top / bottom, vertical on the sides; light top-left, dark bottom-right
        const horiz = (y < B + 1 || y >= H - B - 1) && x >= e - 1 && x <= W - e;
        const along = horiz ? x : y, across = horiz ? y : x;
        let c = hash(along >> 3, across, 1) < 0.5 ? wood : shadeHex(wood, -0.06);
        if (hash(along, across >> 1, 2) < 0.12) c = grain;
        if (e === 3) c = y < H / 2 && x < W - 3 ? woodL : woodD;
        if (e === B) c = shadeHex(woodD, -0.25);
        if (e === B - 1) c = woodD;
        P.set(x, y, c);
      } else {
        // the inside of the crate: dark planks with gaps
        const row = Math.floor((y - B) / 5);
        let c = (y - B) % 5 === 0 ? gap : shadeHex('#3a2412', (hash(row, x >> 2, 3) - 0.5) * 0.18);
        if (y === B + 1) c = '#1a0e06';
        P.set(x, y, c);
      }
    }
  // steel corner brackets + rivets
  for (const [cx, cy, sx, sy] of [[3, 3, 1, 1], [W - 4, 3, -1, 1], [3, H - 4, 1, -1], [W - 4, H - 4, -1, -1]]) {
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 3; j++) {
        const lit = j === 0;
        P.set(cx + sx * i, cy + sy * j, lit ? '#c8d0da' : '#7a828e');
        P.set(cx + sx * j, cy + sy * i, lit ? '#c8d0da' : '#7a828e');
      }
    for (let i = 0; i < 9; i++) { P.set(cx + sx * i, cy + sy * 3, INK); P.set(cx + sx * 3, cy + sy * i, INK); }
    rivet(P.set, cx + sx * 1, cy + sy * 1, '#a8b0bc');
  }
  // nail heads along the boards
  for (const x of [14, 20, 26]) { P.set(x, 5, '#2a2a2a'); P.set(x, H - 6, '#2a2a2a'); }
  for (const y of [14, 20, 26]) { P.set(5, y, '#2a2a2a'); P.set(W - 6, y, '#2a2a2a'); }
  return P.url();
}

function plate(metal = '#59616c', fill = '#2c3138') {
  const W = 30, H = 24, P = painter(W, H), B = 5;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inRR(x, y, W, H, 3)) continue;
      const e = edgeDist(x, y, W, H, 3, B + 2);
      if (e <= 2) { P.set(x, y, INK); continue; }
      const top = y < H / 2, left = x < W / 2;
      let c;
      if (e === 3) c = top || left ? shadeHex(metal, 0.5) : shadeHex(metal, -0.35);
      else if (e < B) c = shadeHex(metal, (top ? 0.12 : -0.1) + (hash(x, y >> 1, 4) < 0.15 ? 0.08 : 0));
      else if (e === B) c = top || left ? shadeHex(metal, -0.55) : shadeHex(metal, 0.25);
      else c = shadeHex(fill, (y % 3 === 0 ? -0.06 : 0) + (hash(x >> 2, y, 5) < 0.1 ? 0.05 : 0));
      P.set(x, y, c);
    }
  for (const [x, y] of [[4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5]]) rivet(P.set, x, y, shadeHex(metal, 0.2));
  return P.url();
}

function concrete(base = '#5f5b55', s = 7) {
  const N = 48, P = painter(N, N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = hash(x, y, s);
      let c = v < 0.08 ? shadeHex(base, -0.14) : v > 0.94 ? shadeHex(base, 0.1) : hash(x >> 2, y >> 2, s + 1) < 0.3 ? shadeHex(base, -0.04) : base;
      if (hash(x, y, s + 2) < 0.012) c = shadeHex(base, -0.35); // pits
      P.set(x, y, c);
    }
  // hairline cracks that wrap around the tile
  for (const [x0, y0, len, sd] of [[6, 10, 26, 1], [30, 34, 18, 2]]) {
    let x = x0, y = y0;
    for (let i = 0; i < len; i++) {
      P.set(((x % N) + N) % N, ((y % N) + N) % N, shadeHex(base, -0.4));
      x += 1;
      if (hash(i, sd, 9) < 0.45) y += hash(i, sd, 10) < 0.5 ? -1 : 1;
    }
  }
  return P.url();
}

function floorTile() {
  const N = 48, P = painter(N, N), base = '#3a3632';
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const v = hash(x, y, 21);
      let c = v < 0.1 ? shadeHex(base, -0.18) : v > 0.95 ? shadeHex(base, 0.12) : base;
      if (x === 0 || y === 0) c = '#24211e';
      if (x === 1 || y === 1) c = shadeHex(base, 0.1);
      P.set(x, y, c);
    }
  return P.url();
}

function stamp() {
  const W = 26, H = 20, P = painter(W, H), red = '#d8242e';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, y, W - 1 - x, H - 1 - y);
      const ring = e <= 2 || e === 4;
      if (!ring) continue;
      if (hash(x, y, 31) < 0.14) continue; // ink that didn't take
      P.set(x, y, hash(x, y, 32) < 0.2 ? '#b0141e' : red, 235);
    }
  return P.url();
}

function sign() {
  const W = 36, H = 26, P = painter(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inRR(x, y, W, H, 2)) continue;
      const e = edgeDist(x, y, W, H, 2, 4);
      if (e <= 2) { P.set(x, y, INK); continue; }
      const plank = Math.floor((y - 2) / 7);
      let c = ['#a06a36', '#94602e', '#a87240'][((plank % 3) + 3) % 3];
      if ((y - 2) % 7 === 0) c = '#3a220e';
      else if ((y - 2) % 7 === 1) c = shadeHex(c, 0.18);
      if (hash(x >> 1, y, 41) < 0.1) c = shadeHex(c, -0.15);
      if (e === 3) c = y < 4 ? shadeHex(c, 0.25) : shadeHex(c, -0.25);
      P.set(x, y, c);
    }
  for (const [x, y] of [[5, 5], [W - 6, 5], [5, H - 6], [W - 6, H - 6]]) { P.set(x, y, '#c8ccd4'); P.set(x + 1, y + 1, '#4a4a50'); }
  return P.url();
}

function crt() {
  const W = 36, H = 30, P = painter(W, H), B = 7;
  const body = '#c9c0a8', bodyL = '#ece4ce', bodyD = '#8a8170';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inRR(x, y, W, H, 5)) continue;
      const e = edgeDist(x, y, W, H, 5, B + 3);
      if (e <= 2) { P.set(x, y, INK); continue; }
      let c;
      if (e < B) c = e === 3 ? (y < H / 2 ? bodyL : bodyD) : hash(x, y, 51) < 0.08 ? shadeHex(body, -0.06) : body;
      else if (e === B) c = '#4a4538';
      else if (e === B + 1) c = '#0a1a10';
      else c = y % 2 ? '#071a0e' : '#0b2414';
      P.set(x, y, c);
    }
  P.set(W - 6, H - 4, '#5aff6a'); P.set(W - 7, H - 4, '#2a8a3a');
  return P.url();
}

function vault() {
  const W = 44, H = 44, P = painter(W, H), B = 12;
  const steel = '#6a7380';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!inRR(x, y, W, H, 4)) continue;
      const e = edgeDist(x, y, W, H, 4, B + 3);
      if (e <= 2) { P.set(x, y, INK); continue; }
      let c;
      if (e <= 5) {
        // hazard band
        const on = ((x + y) >> 2) % 2 === 0;
        c = on ? (e === 3 ? '#ffe680' : '#f2b21e') : e === 3 ? '#3a3226' : '#221c14';
      } else if (e === 6) c = INK;
      else if (e < B - 1) c = shadeHex(steel, (y < H / 2 ? 0.12 : -0.12) + (hash(x, y >> 1, 61) < 0.15 ? 0.06 : 0));
      else if (e === B - 1) c = y < H / 2 ? shadeHex(steel, -0.5) : shadeHex(steel, 0.3);
      else if (e === B) c = '#14181e';
      else c = shadeHex('#262c34', (y % 4 === 0 ? -0.08 : 0) + (hash(x >> 3, y, 62) < 0.1 ? 0.05 : 0));
      P.set(x, y, c);
    }
  // bolt heads around the steel ring
  for (let i = 8; i < W - 8; i += 7) { rivet(P.set, i, 8, '#b8c0cc'); rivet(P.set, i, H - 9, '#b8c0cc'); }
  for (let j = 15; j < H - 12; j += 7) { rivet(P.set, 8, j, '#b8c0cc'); rivet(P.set, W - 9, j, '#b8c0cc'); }
  return P.url();
}

function bubble() {
  const W = 20, H = 18, P = painter(W, H), paper = '#fff6e2';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (y >= H - 2) { if (inRR(x - 1, y - 2, W - 1, H - 2, 4)) P.set(x, y, '#000000', 90); continue; }
      if (!inRR(x, y, W - 1, H - 2, 4)) continue;
      const e = edgeDist(x, y, W - 1, H - 2, 4, 3);
      P.set(x, y, e <= 2 ? INK : e === 3 && y > H / 2 ? '#ead8b4' : paper);
    }
  return P.url();
}
function tail() {
  const W = 10, H = 9, P = painter(W, H);
  for (let y = 0; y < H; y++) {
    const half = Math.max(0, 4 - Math.floor(y * 0.55));
    for (let x = 0; x < W; x++) {
      const cx = 3 - y * 0.3;
      const d = x - cx;
      if (d < -half - 2 || d > half + 2) continue;
      P.set(x, y, Math.abs(d) <= half && y < H - 2 ? '#fff6e2' : INK);
    }
  }
  return P.url();
}

/** Tail for a bubble sitting beside the speaker (points left). */
function tailL() {
  const W = 9, H = 10, P = painter(W, H);
  for (let x = 0; x < W; x++) {
    const half = Math.max(0, Math.floor((x + 1) * 0.5) - 1);
    for (let y = 0; y < H; y++) {
      const cy = 3 + x * 0.25, d = y - cy;
      if (d < -half - 2 || d > half + 2) continue;
      P.set(x, y, Math.abs(d) <= half && x > 1 ? '#fff6e2' : INK);
    }
  }
  return P.url();
}

function burst() {
  const N = 28, P = painter(N, N), c = (N - 1) / 2;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const a = Math.atan2(y - c, x - c), d = Math.hypot(x - c, y - c);
      const r = 10.5 + (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 ? 2.6 : 0);
      if (d > r + 1.4) continue;
      P.set(x, y, d > r ? INK : d > r - 1.2 ? '#ffe680' : '#e8262e');
    }
  return P.url();
}

function tag() {
  const W = 22, H = 12, P = painter(W, H), paper = '#f2e2bc';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const cut = Math.max(0, 4 - x); // pointed left end
      if (y < cut || y >= H - cut) continue;
      const edge = y === cut || y === H - 1 - cut || x === 0 || x === W - 1 || (x < 5 && (y === cut || y === H - 1 - cut));
      P.set(x, y, edge ? INK : y > H - 4 ? '#d8c494' : paper);
    }
  for (const [x, y] of [[4, 5], [5, 5], [4, 6], [5, 6]]) P.set(x, y, '#3a2a1a');
  return P.url();
}

function note() {
  const W = 20, H = 20, P = painter(W, H), y0 = '#ffe45a';
  for (let y = 2; y < H; y++)
    for (let x = 0; x < W; x++) {
      const edge = x === 0 || x === W - 1 || y === 2 || y === H - 1;
      P.set(x, y, edge ? '#8a7a1a' : y > H - 5 ? '#f2d248' : y0);
    }
  for (let y = 0; y < 5; y++) for (let x = 6; x < 14; x++) P.set(x, y, '#e8e4d8', 200);
  return P.url();
}

/** Inject the bunker skins once (CSS custom properties on :root). */
export function injectBunkerArt() {
  if (done || typeof document === 'undefined') return;
  done = true;
  const vars = {
    '--bk-crate': crate(),
    '--bk-plate': plate(),
    '--bk-plate-hi': plate('#7a8494', '#3a414c'),
    '--bk-concrete': concrete(),
    '--bk-floor': floorTile(),
    '--bk-stamp': stamp(),
    '--bk-sign': sign(),
    '--bk-crt': crt(),
    '--bk-vault': vault(),
    '--bk-bubble': bubble(),
    '--bk-tail': tail(),
    '--bk-tail-l': tailL(),
    '--bk-burst': burst(),
    '--bk-tag': tag(),
    '--bk-note': note(),
  };
  const st = document.createElement('style');
  st.id = 'bunker-art';
  st.textContent = `:root{${Object.entries(vars).map(([k, v]) => `${k}:url(${v})`).join(';')}}`;
  document.head.appendChild(st);
}
