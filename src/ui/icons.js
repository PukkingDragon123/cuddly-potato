// Hi-res pixel-art icon set (16x16). Icons are drawn with tiny raster
// primitives (circles, polygons, rects, ascii art), then automatically
// shaded (lit top edges, shaded bottom edges) and ink-outlined, giving every
// icon a consistent detailed pixel-art look.

const N = 16;
const C = {
  ink: '#120c24', white: '#ffffff', gold: '#ffc21a', goldL: '#ffe46a', goldD: '#d8861a', goldDD: '#9a5410',
  pink: '#ff2e88', pinkL: '#ff8ac4', pinkD: '#b8125e', mag: '#ff1f9e', blue: '#2b8cf2', blueL: '#8fd4ff', blueD: '#1a52b0',
  cyan: '#7ae8ff', green: '#4cd24a', greenL: '#a8f07a', greenD: '#238a2e', red: '#f23a4a', redL: '#ff8a90', redD: '#a01a2a',
  purple: '#a35cff', purpleL: '#d4aaff', purpleD: '#5e2aa8', orange: '#ff8a1f', orangeL: '#ffc06a', orangeD: '#c04a10',
  silver: '#cdd5ea', silverD: '#7e8aa8', brown: '#a0602e', brownD: '#653818', teal: '#3ff2c8', tealD: '#13a08a',
  skin: '#f2c4a2', choco: '#6a3a1e', gray: '#8a96b8', grayD: '#4e5878',
};

class Pix {
  constructor() {
    this.g = Array.from({ length: N }, () => Array(N).fill(null));
    this.noShade = new Set();
  }
  px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N) this.g[y][x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); return this; }
  circ(cx, cy, r, c) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.px(x, y, c);
    return this;
  }
  ell(cx, cy, rx, ry, c) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.px(x, y, c);
    return this;
  }
  poly(pts, c) {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const X = x + 0.5, Y = y + 0.5;
      let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > Y !== yj > Y && X < ((xj - xi) * (Y - yi)) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) this.px(x, y, c);
    }
    return this;
  }
  line(x0, y0, x1, y1, c, t = 0) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      if (t) this.rect(Math.round(x - t / 2), Math.round(y - t / 2), t + 1, t + 1, c); else this.px(x, y, c);
    }
    return this;
  }
  art(rows, x0, y0, pal) {
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) this.px(x0 + x, y0 + y, pal[ch]); }));
    return this;
  }
  flat(x, y) { this.noShade.add(y * N + x); return this; }
}

const lighten = (hex, f) => {
  const h = parseInt(hex.slice(1), 16);
  let r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
};

function render(p, o = {}) {
  const S = N + 2; // room for the outline
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const g = p.g;
  const has = (x, y) => x >= 0 && y >= 0 && x < N && y < N && g[y][x];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (g[y][x]) continue;
    if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) {
      ctx.fillStyle = o.outline ?? C.ink;
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const col = g[y][x];
    if (!col) continue;
    let out = col;
    if (o.shade !== false && !p.noShade.has(y * N + x) && col !== C.ink && col !== C.white) {
      if (!has(x, y - 1) || (g[y - 1] && g[y - 1][x] !== col && g[y - 1][x] === C.ink)) out = lighten(col, 0.38);
      else if (!has(x, y + 1)) out = lighten(col, -0.3);
      else if (!has(x - 1, y)) out = lighten(col, 0.16);
      else if (!has(x + 1, y)) out = lighten(col, -0.16);
    }
    ctx.fillStyle = out;
    ctx.fillRect(x + 1, y + 1, 1, 1);
  }
  // drop shadow pixel row under the shape
  if (o.drop !== false) {
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (g[y][x] && !has(x, y + 1) && y + 2 < S) ctx.fillRect(x + 1, y + 2, 1, 1);
  }
  return c.toDataURL();
}

// --------------------------------------------------------------------------- icon designs

const D = {};
const def = (name, fn, opts) => (D[name] = { fn, opts });

def('coin', (p) => {
  p.circ(8, 8, 7.2, C.goldD).circ(8, 8, 6.2, C.gold).circ(8.4, 8.4, 4.2, C.goldD).circ(8, 8, 3.9, C.gold);
  p.art(['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], 6, 6, { M: C.goldDD });
  p.px(5, 3, C.white).px(4, 4, C.white).px(4, 5, C.white);
});
def('bucks', (p) => {
  p.poly([[3, 6], [6, 2], [10, 2], [13, 6], [8, 14]], C.pink);
  p.poly([[3, 6], [13, 6], [8, 14]], C.pinkD).poly([[5, 6], [11, 6], [8, 12]], C.pink);
  p.poly([[6, 2], [10, 2], [11, 6], [5, 6]], C.pinkL);
  p.px(6, 3, C.white).px(7, 3, C.white).px(6, 4, C.white);
});
def('trophy', (p) => {
  p.rect(4, 2, 8, 2, C.gold).poly([[4, 3], [12, 3], [11, 8], [5, 8]], C.gold).ell(8, 7, 3.6, 2.6, C.gold);
  p.circ(3.2, 5, 2, C.goldD).circ(3.2, 5, 1, null).px(3, 5, null).circ(12.8, 5, 2, C.goldD).px(12, 5, null);
  p.rect(7, 9, 2, 3, C.goldD).rect(5, 12, 6, 2, C.gold).rect(4, 14, 8, 1, C.goldD);
  p.rect(6, 4, 1, 3, C.white).px(7, 5, C.goldL);
  p.art(['.MM.', 'MMMM', '.MM.'], 6, 3, { M: C.goldL });
});
def('crown', (p) => {
  p.poly([[2, 13], [2, 5], [5, 8], [8, 3], [11, 8], [14, 5], [14, 13]], C.gold);
  p.rect(2, 11, 13, 2, C.goldD);
  p.circ(8, 3, 1.4, C.pink).circ(2.5, 5, 1.2, C.blue).circ(13.5, 5, 1.2, C.blue).circ(8, 9, 1.3, C.red);
  p.px(4, 9, C.goldL).px(5, 10, C.goldL);
});
def('energy', (p) => {
  // Beast Energy drop (like elixir)
  p.circ(8, 10, 5, C.mag).poly([[8, 1], [12.3, 8], [3.7, 8]], C.mag);
  p.circ(8.6, 10.6, 3.2, C.pinkD).circ(8, 10, 3, C.mag);
  p.rect(5, 8, 1, 3, C.pinkL).px(6, 6, C.pinkL).px(6, 7, C.white).px(5, 9, C.white);
});
def('vial', (p) => {
  p.rect(5, 1, 6, 3, C.pink).rect(4, 3, 8, 1, C.pinkD);
  p.rect(5, 4, 6, 9, C.blueL).ell(8, 13, 3, 2, C.blueL);
  p.rect(5, 8, 6, 5, C.green).ell(8, 13, 3, 2, C.green).flat(5, 8);
  p.rect(5, 6, 6, 2, C.white).px(7, 6, C.mag).px(8, 6, C.mag);
  p.px(9, 10, C.greenL).px(7, 12, C.greenL).rect(6, 4, 1, 3, C.white);
});
def('cards', (p) => {
  p.poly([[2, 4], [8, 2], [10, 12], [4, 14]], C.blueD).poly([[3, 5], [7.5, 3.5], [9, 11], [4.5, 12.6]], C.blue);
  p.rect(6, 3, 8, 11, C.ink).rect(7, 4, 6, 9, C.purple).rect(8, 5, 4, 4, C.purpleL).rect(8, 10, 4, 1, C.white);
});
def('card', (p) => {
  p.rect(3, 1, 10, 14, C.ink).rect(4, 2, 8, 12, C.blue).rect(5, 3, 6, 6, C.blueL).rect(5, 10, 6, 1, C.white).rect(5, 12, 4, 1, C.white);
  p.circ(4, 3, 2, C.mag);
});
def('star', (p) => {
  p.poly([[8, 1], [10, 6], [15, 6.2], [11, 9.5], [12.5, 15], [8, 12], [3.5, 15], [5, 9.5], [1, 6.2], [6, 6]], C.gold);
  p.px(7, 4, C.white).px(7, 5, C.goldL).px(6, 7, C.goldL);
});
def('lock', (p) => {
  p.rect(4, 2, 8, 6, C.silverD).rect(6, 4, 4, 4, null).rect(5, 3, 6, 1, C.silver);
  p.rect(3, 7, 10, 8, C.gold).rect(7, 9, 2, 3, C.goldDD).rect(4, 8, 8, 1, C.goldL);
});
def('clock', (p) => {
  p.circ(8, 8, 7, C.silverD).circ(8, 8, 6, C.white).rect(8, 4, 1, 5, C.ink).rect(8, 8, 3, 1, C.ink).px(8, 8, C.red);
  p.px(8, 2, C.ink).px(14, 8, C.ink).px(8, 14, C.ink).px(2, 8, C.ink);
});
def('sword', (p) => {
  p.line(4, 12, 13, 3, C.silver, 1).line(5, 11, 13, 3, C.white).px(13, 2, C.silver);
  p.line(2, 10, 6, 14, C.goldD, 1).rect(2, 13, 2, 2, C.brown).px(3, 14, C.brownD);
});
def('swords', (p) => {
  p.line(3, 3, 12, 12, C.silver, 1).line(13, 3, 4, 12, C.silver, 1).line(3, 3, 7, 7, C.white).line(13, 3, 9, 7, C.white);
  p.line(10, 13, 13, 10, C.goldD, 1).line(6, 13, 3, 10, C.goldD, 1).rect(12, 12, 2, 2, C.brown).rect(2, 12, 2, 2, C.brown);
});
def('shield', (p) => {
  p.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], C.blue).poly([[8, 2], [14, 2], [14, 8], [8, 15]], C.blueD);
  p.art(['..MM', '.MM.', 'MMMM', '.MM.', 'MM..'], 6, 5, { M: C.gold });
});
def('cart', (p) => {
  p.line(1, 2, 3, 2, C.silverD).line(3, 2, 5, 11, C.silverD, 1).rect(5, 4, 9, 6, C.red).rect(6, 5, 7, 4, C.redL).rect(5, 11, 9, 1, C.silverD);
  p.circ(6.5, 13.5, 1.6, C.ink).circ(12.5, 13.5, 1.6, C.ink).px(7, 6, C.gold).px(9, 6, C.green).px(11, 6, C.blue);
});
def('shop', (p) => {
  p.rect(2, 6, 12, 9, C.orangeL).rect(3, 9, 4, 6, C.brown).rect(9, 9, 4, 3, C.blueL);
  for (let i = 0; i < 6; i++) p.rect(1 + i * 2.4, 3, 3, 4, i % 2 ? C.white : C.red);
  p.rect(1, 2, 14, 1, C.redD);
});
def('flask', (p) => {
  p.rect(6, 1, 4, 5, C.blueL).rect(5, 1, 6, 1, C.silver).poly([[6, 6], [10, 6], [14, 14], [2, 14]], C.blueL);
  p.poly([[4.5, 10], [11.5, 10], [14, 14], [2, 14]], C.green).flat(6, 10);
  p.px(9, 12, C.greenL).px(6, 12, C.greenL).px(7, 3, C.white).px(7, 4, C.white);
});
def('pin', (p) => {
  p.circ(8, 6, 5, C.red).poly([[4, 8], [12, 8], [8, 15]], C.red).circ(8, 6, 2, C.white).px(6, 3, C.redL);
});
def('road', (p) => {
  p.poly([[6, 1], [10, 1], [15, 15], [1, 15]], C.brownD).poly([[7, 1], [9, 1], [13, 15], [3, 15]], C.orangeL);
  p.rect(8, 3, 1, 2, C.white).rect(8, 7, 1, 2, C.white).rect(7, 11, 2, 3, C.white);
  p.circ(12.5, 4, 2.2, C.gold).px(12, 3, C.white);
});
def('island', (p) => {
  p.ell(8, 13.5, 7, 2.5, C.blue).ell(8, 12, 5, 2.2, C.gold);
  p.line(8, 12, 9, 5, C.brown, 1).poly([[9, 5], [15, 7], [12, 4]], C.green).poly([[9, 5], [3, 7], [6, 3]], C.green).poly([[9, 5], [11, 1], [8, 2]], C.greenD);
});
def('gear', (p) => {
  for (let a = 0; a < 8; a++) { const x = 8 + Math.cos((a * Math.PI) / 4) * 6, y = 8 + Math.sin((a * Math.PI) / 4) * 6; p.rect(x - 1.5, y - 1.5, 3, 3, C.silverD); }
  p.circ(8, 8, 5.2, C.silver).circ(8, 8, 2.2, C.ink).circ(8, 8, 1.2, C.grayD);
});
def('plus', (p) => p.rect(6, 2, 4, 12, C.green).rect(2, 6, 12, 4, C.green).rect(7, 3, 1, 4, C.greenL));
def('check', (p) => p.line(2, 8, 6, 12, C.green, 2).line(6, 12, 13, 3, C.green, 2));
def('x', (p) => p.line(3, 3, 12, 12, C.red, 2).line(12, 3, 3, 12, C.red, 2));
def('up', (p) => p.poly([[8, 1], [15, 8], [11, 8], [11, 15], [5, 15], [5, 8], [1, 8]], C.green).rect(7, 4, 1, 9, C.greenL));
def('info', (p) => p.circ(8, 8, 7, C.blue).rect(7, 7, 2, 6, C.white).rect(7, 3, 2, 2, C.white));
def('alert', (p) => p.circ(8, 8, 7, C.red).rect(7, 3, 2, 7, C.white).rect(7, 11, 2, 2, C.white));
def('heart', (p) => p.circ(5, 6, 3.5, C.red).circ(11, 6, 3.5, C.red).poly([[1.6, 7], [14.4, 7], [8, 14.5]], C.red).px(4, 4, C.white).px(3, 5, C.redL));
def('skull', (p) => {
  p.circ(8, 7, 6, C.white).rect(5, 11, 6, 3, C.white).circ(5.5, 7.5, 1.6, C.ink).circ(10.5, 7.5, 1.6, C.ink).px(8, 10, C.ink);
  p.px(6, 13, C.ink).px(8, 13, C.ink).px(10, 13, C.ink);
}, { shade: true });
def('bolt', (p) => p.poly([[9, 1], [3, 9], [7.5, 9], [5.5, 15], [13, 6], [8.5, 6], [11, 1]], C.gold).px(8, 3, C.white));
def('case', (p) => {
  p.rect(5, 2, 6, 3, C.silverD).rect(6, 3, 4, 2, null);
  p.rect(1, 5, 14, 9, C.silver).rect(1, 9, 14, 1, C.silverD).rect(6, 8, 4, 3, C.gold);
  p.rect(2, 6, 3, 1, C.white).rect(11, 11, 3, 2, C.green).rect(2, 11, 3, 2, C.green);
});
def('chest', (p) => {
  p.rect(2, 4, 12, 4, C.brown).rect(2, 8, 12, 6, C.brownD).rect(2, 7, 12, 2, C.gold).rect(7, 7, 2, 4, C.goldL).rect(3, 4, 10, 1, C.orangeL);
});
def('gift', (p) => {
  p.rect(2, 6, 12, 9, C.pink).rect(1, 4, 14, 3, C.pinkL).rect(7, 4, 2, 11, C.gold);
  p.circ(5.5, 3, 2, C.gold).circ(10.5, 3, 2, C.gold).px(5, 3, C.goldD).px(10, 3, C.goldD);
});
def('calorie', (p) => {
  p.poly([[8, 1], [13, 8], [13, 11], [10, 15], [6, 15], [3, 11], [3, 8], [5, 5], [6, 8]], C.orange);
  p.poly([[8, 6], [11, 10], [10, 14], [6, 14], [5, 10]], C.gold).circ(8, 12, 1.6, C.white);
});
def('mega', (p) => {
  p.poly([[2, 2], [14, 2], [14, 9], [8, 15], [2, 9]], C.mag).poly([[4, 4], [12, 4], [12, 9], [8, 13], [4, 9]], C.pinkD);
  p.art(['M...M', 'MM.MM', 'M.M.M', 'M...M', 'M...M'], 5, 5, { M: C.white });
});
def('smile', (p) => p.circ(8, 8, 7, C.gold).circ(5.5, 6, 1.2, C.ink).circ(10.5, 6, 1.2, C.ink).line(4, 10, 6, 12, C.ink).line(6, 12, 10, 12, C.ink).line(10, 12, 12, 10, C.ink).px(4, 4, C.goldL));
def('friends', (p) => {
  p.circ(5, 5, 3, C.skin).ell(5, 13, 4, 3.5, C.blue).circ(11, 6, 3, C.skin).ell(11, 14, 4, 3.5, C.pink);
  p.rect(2, 2, 6, 2, C.brownD).rect(8, 3, 6, 2, C.ink);
});
def('music', (p) => p.rect(6, 2, 2, 10, C.purple).rect(6, 2, 7, 2, C.purple).rect(11, 2, 2, 8, C.purple).circ(5, 12, 2.6, C.purple).circ(10, 10, 2.6, C.purple));
def('sound', (p) => p.rect(2, 6, 3, 5, C.silver).poly([[5, 6], [9, 2], [9, 14], [5, 11]], C.silver).line(11, 5, 12, 8, C.white).line(12, 8, 11, 11, C.white).line(13, 3, 14, 8, C.white).line(14, 8, 13, 13, C.white));
def('tower', (p) => {
  p.rect(4, 5, 8, 10, C.silver).rect(3, 3, 10, 3, C.silverD).rect(3, 2, 2, 1, C.silverD).rect(7, 2, 2, 1, C.silverD).rect(11, 2, 2, 1, C.silverD);
  p.rect(7, 8, 2, 3, C.ink).rect(6, 12, 4, 3, C.brownD).rect(5, 6, 1, 8, C.white);
});
def('wing', (p) => p.poly([[2, 12], [6, 4], [14, 2], [12, 6], [14, 7], [11, 10], [12, 11], [8, 13]], C.white).line(5, 11, 12, 4, C.silverD));
def('bomb', (p) => p.circ(7, 10, 5, C.grayD).rect(9, 3, 2, 3, C.silverD).line(11, 3, 14, 1, C.orange).px(14, 1, C.gold).px(5, 8, C.silver).px(4, 9, C.silver));
def('snow', (p) => {
  p.line(8, 1, 8, 15, C.cyan, 1).line(2, 4, 14, 12, C.cyan, 1).line(2, 12, 14, 4, C.cyan, 1).circ(8, 8, 2, C.white);
});
def('rocket', (p) => {
  p.poly([[8, 1], [11, 5], [11, 12], [5, 12], [5, 5]], C.green).rect(5, 5, 6, 2, C.pink).circ(8, 8.5, 1.4, C.blueL);
  p.poly([[5, 9], [2, 13], [5, 12]], C.red).poly([[11, 9], [14, 13], [11, 12]], C.red).rect(6, 12, 4, 2, C.orange).rect(7, 14, 2, 1, C.gold);
});
def('burger', (p) => {
  p.ell(8, 5, 6.5, 3.5, C.orange).rect(1.5, 5, 13, 2, C.orange).rect(2, 7, 12, 1, C.green).rect(2, 8, 12, 2, C.choco).rect(1, 10, 14, 1, C.gold).rect(2, 11, 12, 3, C.orangeD);
  p.px(5, 3, C.white).px(8, 3, C.white).px(11, 4, C.white);
});
def('bag', (p) => {
  p.circ(8, 10, 5.5, C.greenD).poly([[5, 4], [11, 4], [10, 7], [6, 7]], C.greenD).rect(5, 3, 6, 1, C.gold);
  p.art(['.MMM.', 'M.M..', '.MMM.', '..M.M', '.MMM.'], 6, 7, { M: C.greenL });
});
def('paint', (p) => p.line(3, 14, 11, 6, C.brown, 1).rect(10, 2, 4, 5, C.silverD).rect(10, 1, 4, 2, C.pink).rect(11, 1, 1, 2, C.gold).rect(13, 1, 1, 2, C.blue));
def('flag', (p) => p.rect(3, 1, 1, 14, C.silverD).poly([[4, 2], [14, 3], [11, 6], [14, 9], [4, 9]], C.pink).px(6, 4, C.pinkL));
def('quest', (p) => {
  p.rect(3, 2, 10, 12, C.orangeL).rect(2, 1, 12, 2, C.brown).rect(2, 13, 12, 2, C.brown);
  p.rect(5, 5, 6, 1, C.brownD).rect(5, 7, 5, 1, C.brownD).rect(5, 9, 6, 1, C.brownD);
});
def('dna', (p) => { for (let y = 1; y < 15; y++) { const s = Math.sin(y * 0.6) * 4; p.px(8 + s, y, C.blue).px(8 - s, y, C.pink); if (y % 3 === 0) p.line(8 - s, y, 8 + s, y, C.silver); } });
def('chrome', (p) => {
  p.poly([[3, 6], [6, 2], [10, 2], [13, 6], [8, 14]], C.silver).poly([[3, 6], [13, 6], [8, 14]], C.silverD).poly([[6, 2], [10, 2], [11, 6], [5, 6]], C.white);
});
def('speed', (p) => p.poly([[4, 3], [12, 3], [12, 13], [4, 13], [7, 8]], C.blue).line(1, 6, 4, 6, C.white).line(1, 10, 4, 10, C.white).rect(9, 5, 2, 6, C.blueL));
def('range', (p) => p.circ(8, 8, 7, C.red).circ(8, 8, 5, C.white).circ(8, 8, 3, C.red).circ(8, 8, 1.2, C.white));
def('swarm', (p) => {
  p.circ(8, 9, 6.5, C.blue).ell(8, 13, 6, 2, C.blueD);
  p.poly([[3, 5], [4, 1], [6, 4]], C.blue).poly([[13, 5], [12, 1], [10, 4]], C.blue);
  p.rect(4, 6, 3, 3, C.white).rect(9, 6, 3, 3, C.white).rect(5, 7, 2, 2, C.ink).rect(9, 7, 2, 2, C.ink);
  p.line(3, 5, 6, 6, C.mag).line(13, 5, 10, 6, C.mag);
  p.rect(5, 11, 6, 2, C.ink).px(5, 11, C.white).px(7, 11, C.white).px(9, 11, C.white);
});
def('magic', (p) => {
  p.line(3, 13, 11, 5, C.purple, 1).circ(12, 4, 2.5, C.gold).px(12, 4, C.white);
  p.px(4, 4, C.gold).px(7, 2, C.goldL).px(14, 9, C.goldL).px(9, 9, C.gold);
});
def('hp', (p) => p.circ(5, 6, 3.5, C.red).circ(11, 6, 3.5, C.red).poly([[1.6, 7], [14.4, 7], [8, 14.5]], C.red).rect(7, 5, 2, 6, C.white).rect(5, 7, 6, 2, C.white));
def('lab', (p) => {
  p.rect(2, 7, 12, 8, C.white).rect(2, 7, 12, 2, C.blue).poly([[1, 7], [8, 2], [15, 7]], C.blueD).rect(6, 10, 4, 5, C.blueL).rect(3, 10, 2, 2, C.cyan).rect(11, 10, 2, 2, C.cyan).px(8, 4, C.mag);
});
def('play', (p) => p.poly([[4, 2], [14, 8], [4, 14]], C.green).px(5, 4, C.greenL));
def('pause', (p) => p.rect(3, 2, 4, 12, C.white).rect(9, 2, 4, 12, C.white), { shade: true });
def('ball', (p) => p.circ(8, 8, 7, C.white).circ(8, 8, 2.5, C.ink).circ(3, 5, 1.5, C.ink).circ(13, 5, 1.5, C.ink).circ(5, 13, 1.5, C.ink).circ(11, 13, 1.5, C.ink));
def('truck', (p) => p.rect(1, 5, 9, 7, C.orange).rect(10, 7, 5, 5, C.orangeD).rect(11, 8, 3, 2, C.blueL).circ(4, 13, 2, C.ink).circ(12, 13, 2, C.ink).rect(2, 6, 3, 2, C.white));
def('tooth', (p) => p.poly([[3, 3], [13, 3], [12, 9], [10, 14], [8, 10], [6, 14], [4, 9]], C.white));
def('emote', (p) => {
  p.rect(1, 2, 14, 10, C.white).poly([[4, 12], [8, 12], [3, 15]], C.white);
  p.circ(5, 7, 1.3, C.ink).circ(11, 7, 1.3, C.ink).line(6, 9, 10, 9, C.ink);
}, { shade: true });
def('lightning', D.bolt?.fn ?? (() => {}));
def('arrowL', (p) => p.poly([[1, 8], [8, 1], [8, 5], [15, 5], [15, 11], [8, 11], [8, 15]], C.white));
def('arrowR', (p) => p.poly([[15, 8], [8, 1], [8, 5], [1, 5], [1, 11], [8, 11], [8, 15]], C.white));
def('trash', (p) => p.rect(3, 4, 10, 11, C.silverD).rect(2, 2, 12, 2, C.silver).rect(6, 1, 4, 1, C.silver).rect(5, 6, 1, 7, C.grayD).rect(8, 6, 1, 7, C.grayD).rect(11, 6, 1, 7, C.grayD));
def('eye', (p) => p.ell(8, 8, 7, 4.5, C.white).circ(8, 8, 3, C.blue).circ(8, 8, 1.5, C.ink).px(7, 7, C.white));
def('boss', (p) => {
  p.circ(8, 9, 6, C.purple).poly([[2, 6], [3, 1], [6, 4]], C.purple).poly([[14, 6], [13, 1], [10, 4]], C.purple);
  p.rect(4, 7, 3, 2, C.gold).rect(9, 7, 3, 2, C.gold).rect(4, 11, 8, 2, C.ink).px(5, 11, C.white).px(10, 11, C.white);
});
def('tube', D.vial.fn);
def('fire', (p) => p.poly([[8, 1], [13, 8], [13, 11], [10, 15], [6, 15], [3, 11], [3, 8], [5, 5], [6, 8]], C.red).poly([[8, 6], [11, 10], [10, 14], [6, 14], [5, 10]], C.gold));
def('venom', (p) => p.circ(8, 10, 5, C.green).poly([[8, 1], [12, 8], [4, 8]], C.green).px(6, 8, C.greenL).px(6, 9, C.white));
def('sludge', (p) => p.ell(8, 10, 7, 4, C.brown).circ(6, 7, 3, C.brown).circ(10, 6, 3, C.green).px(5, 6, C.white));

// --------------------------------------------------------------------------- API

const cache = new Map();
export function iconURL(name) {
  if (cache.has(name)) return cache.get(name);
  const d = D[name] ?? D.star;
  const p = new Pix();
  d.fn(p);
  const url = render(p, d.opts ?? {});
  cache.set(name, url);
  return url;
}
export const ICON_NAMES = Object.keys(D);
export const ICON_COLORS = C;
