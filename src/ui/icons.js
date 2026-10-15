// Hi-res pixel-art icon set (16x16, plus 24x24 / 32x32 "reward art" sprites
// for coin piles, gem heaps, tier flasks...). Icons are drawn with tiny raster
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
  volt: '#3a6cff', voltL: '#5a9cff', voltD: '#2a2a9e',
};

class Pix {
  constructor(n = N) {
    this.n = n;
    this.g = Array.from({ length: n }, () => Array(n).fill(null));
    this.noShade = new Set();
  }
  px(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < this.n && y < this.n) this.g[y][x] = c; return this; }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); return this; }
  circ(cx, cy, r, c) {
    const n = this.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) this.px(x, y, c);
    return this;
  }
  ell(cx, cy, rx, ry, c) {
    const n = this.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) this.px(x, y, c);
    return this;
  }
  poly(pts, c) {
    const n = this.n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
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
  flat(x, y) { this.noShade.add(y * this.n + x); return this; }
}

const lighten = (hex, f) => {
  const h = parseInt(hex.slice(1), 16);
  let r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
};

function render(p, o = {}) {
  const N = p.n;
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
// POWER (the electric currency cards are played with): a charged energy cell
// with a lightning bolt crackling through it.
const powerCell = (p, boltCol, boltHi) => {
  p.poly([[4.5, 1], [11.5, 1], [15, 4.5], [15, 11.5], [11.5, 15], [4.5, 15], [1, 11.5], [1, 4.5]], C.voltD);
  p.poly([[5, 2.2], [11, 2.2], [13.8, 5], [13.8, 11], [11, 13.8], [5, 13.8], [2.2, 11], [2.2, 5]], C.volt);
  p.poly([[5.4, 3.2], [10.6, 3.2], [12.8, 5.4], [12.8, 8], [3.2, 8], [3.2, 5.4]], C.voltL);
  p.poly([[9.6, 0.6], [3.6, 9.2], [7.4, 9.2], [5.6, 15.4], [12.6, 6.4], [8.8, 6.4], [11.2, 0.6]], boltCol);
  p.px(9, 3, boltHi).px(8, 4, boltHi).px(7, 5, boltHi).px(6, 6, boltHi).px(9, 8, boltHi).px(8, 10, boltHi).px(7, 12, boltHi);
  for (const [x, y] of [[9, 3], [8, 4], [7, 5], [6, 6], [9, 8], [8, 10], [7, 12]]) p.flat(x, y);
  p.px(3, 3, C.white).px(13, 12, C.cyan).px(2, 12, C.cyan);
};
def('power', (p) => powerCell(p, C.gold, C.white));
def('energy', (p) => powerCell(p, C.gold, C.goldL)); // card cost badge (the number sits on top)
def('powerBolt', (p) => {
  p.poly([[10, 0.5], [3, 9.4], [7.6, 9.4], [5.4, 15.6], [13.2, 6.2], [8.8, 6.2], [11.8, 0.5]], C.gold);
  for (const [x, y] of [[9, 2], [8, 3], [7, 5], [6, 7], [9, 8], [8, 10], [7, 12]]) p.px(x, y, C.white).flat(x, y);
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

// --------------------------------------------------------------------------- lobby / season set (v2)
// More detailed redraws of plain icons + the Food Season food set, pass
// ticket, arena gate and sparkle sprites.

const F = {
  crust: '#e8a24a', crustD: '#b86a22', cheese: '#ffd84a', pep: '#d8283a', dough: '#e8a860', frost: '#ff8ac4',
  chocoL: '#8a5232', chocoD: '#4a2412', glass: '#cfeeff', glassD: '#7fb4e6', cream: '#fff4dc', asphalt: '#3a3f5a',
};
// trophy on the road it climbs
def('road', (p) => {
  // winding road climbing to a trophy
  p.line(1.5, 15, 3, 11.5, C.brownD, 3).line(3, 11.5, 8, 10, C.brownD, 3).line(8, 10, 8.5, 7.5, C.brownD, 3);
  p.line(1.5, 15, 3, 11.5, C.orangeL, 1).line(3, 11.5, 8, 10, C.orangeL, 1).line(8, 10, 8.5, 7.5, C.orangeL, 1);
  p.px(2, 14, C.white).px(5, 11, C.white).px(8, 9, C.white);
  p.poly([[9, 0], [16, 0], [15, 3.4], [10, 3.4]], C.gold).ell(12.5, 3.4, 2.6, 1.6, C.gold);
  p.px(9, 1, C.goldD).px(15, 1, C.goldD).rect(12, 5, 1, 1, C.goldD).rect(10, 6, 5, 1, C.goldD);
  p.px(11, 1, C.white).px(11, 2, C.goldL).px(12, 1, C.goldL);
  p.px(4, 4, C.goldL).px(3, 5, C.white).px(5, 5, C.goldL).px(4, 6, C.goldL);
});
def('lock', (p) => {
  p.circ(8, 6.5, 4.6, C.silverD).circ(8, 6.5, 2.7, null).rect(3, 7, 10, 2, null);
  p.px(5, 3, C.silver).px(6, 2, C.white);
  p.rect(3, 7, 10, 8, C.gold).rect(3, 7, 10, 1, C.goldL).rect(3, 13, 10, 2, C.goldD);
  p.circ(8, 10, 1.4, C.goldDD).rect(7.5, 10, 1, 3, C.goldDD);
  p.px(4, 8, C.white).px(11, 8, C.goldL).px(4, 13, C.goldL).px(11, 13, C.goldL);
});
def('chest', (p) => {
  p.ell(8, 5.5, 7, 3.6, C.brown).rect(1, 5, 14, 3, C.brown);
  p.rect(1, 8, 14, 7, C.brownD).rect(1, 7, 14, 2, C.gold);
  p.rect(3, 3, 2, 12, C.goldD).rect(11, 3, 2, 12, C.goldD);
  p.rect(6, 6, 4, 5, C.goldL).px(7, 8, C.goldDD).px(8, 8, C.goldDD).px(7, 9, C.goldDD);
  p.line(2, 11, 13, 11, C.brown).px(3, 3, C.goldL).px(4, 2, C.white);
});
def('ticket', (p) => {
  p.rect(1, 4, 14, 9, C.gold).rect(1, 4, 14, 1, C.goldL);
  p.circ(1, 8.5, 1.6, null).circ(15, 8.5, 1.6, null);
  for (let y = 5; y < 13; y += 2) p.px(5, y, C.goldD);
  p.poly([[10.5, 5], [11.5, 7.6], [14, 7.8], [12, 9.4], [12.8, 12], [10.5, 10.5], [8.2, 12], [9, 9.4], [7, 7.8], [9.5, 7.6]], C.pink);
  p.px(10, 7, C.white).px(3, 6, C.white).px(3, 10, C.goldD).px(3, 11, C.goldD);
});
def('pizza', (p) => {
  p.poly([[1.5, 3], [14.5, 3], [8, 15.6]], F.cheese);
  p.rect(1, 1, 14, 3, F.crust).rect(2, 0, 12, 1, F.crust).rect(1, 3, 14, 1, F.crustD);
  p.circ(5, 6.2, 1.7, F.pep).circ(10.6, 6, 1.7, F.pep).circ(8, 10.2, 1.5, F.pep);
  p.px(4, 5, C.redL).px(10, 5, C.redL).px(7, 9, C.redL);
  p.px(4, 9, C.goldL).px(12, 8, C.goldL).px(3, 1, C.white).px(4, 1, C.white);
});
def('donut', (p) => {
  p.circ(8, 8.6, 7.2, F.dough).circ(8, 8, 6.2, F.frost);
  for (let a = 0; a < 8; a++) { const x = 8 + Math.cos(a * 0.8 + 0.3) * 6.4, y = 9.6 + Math.abs(Math.sin(a * 0.8 + 0.3)) * 4.8; if (y > 9) p.px(x, y, F.dough); }
  p.circ(8, 8.4, 2.1, null);
  const sp = [[4, 5, C.blueL], [11, 4, C.goldL], [5, 11, C.greenL], [12, 10, C.white], [8, 3, C.white], [3, 8, C.gold], [13, 7, C.blue], [10, 12, C.purpleL]];
  for (const [x, y, c] of sp) p.px(x, y, c).flat(x, y);
  p.px(5, 3, C.white).px(4, 4, C.pinkL);
});
def('soda', (p) => {
  p.line(9, 3, 12, 0, C.pink, 1).px(12, 0, C.pinkL);
  p.poly([[3, 5], [13, 5], [11.6, 15.5], [4.4, 15.5]], C.red);
  p.rect(2, 3, 12, 2, C.white).rect(4, 2, 8, 1, C.silver);
  p.rect(4, 9, 8, 2, C.white).px(6, 9, C.red).px(8, 9, C.red).px(10, 9, C.red);
  p.rect(5, 6, 1, 3, C.redL).rect(5, 12, 1, 2, C.redL).px(3, 3, C.white);
});
def('fries', (p) => {
  for (const [x, y, hh] of [[4, 2, 7], [6, 0, 8], [8, 1, 8], [10, 0, 8], [12, 2, 6], [5, 3, 6], [11, 3, 6]]) p.rect(x, y, 1, hh, x % 4 ? C.gold : C.goldL);
  p.poly([[2, 6], [14, 6], [12.5, 15.5], [3.5, 15.5]], C.red);
  p.rect(2, 6, 12, 1, C.redL).line(5, 10, 8, 12, C.goldL).line(8, 12, 11, 10, C.goldL);
  p.px(4, 8, C.white);
});
def('choco', (p) => {
  p.rect(2, 1, 12, 14, F.chocoL);
  for (let y = 1; y < 9; y += 4) for (let x = 2; x < 14; x += 4) { p.rect(x, y, 4, 1, '#a8683e'); p.rect(x + 3, y, 1, 4, F.chocoD); }
  p.poly([[1, 9], [15, 7], [15, 16], [1, 16]], C.blue).poly([[1, 9], [15, 7], [15, 9], [1, 11]], C.white);
  p.rect(4, 12, 8, 2, C.gold).px(5, 12, C.white).px(13, 13, C.blueL);
});
def('gate', (p) => {
  p.rect(1, 5, 3, 11, C.silver).rect(12, 5, 3, 11, C.silver).rect(2, 6, 1, 9, C.white);
  p.rect(0, 2, 16, 3, C.red).rect(0, 2, 16, 1, C.redL).rect(5, 5, 6, 3, C.gold).px(6, 6, C.white);
  p.rect(7, 0, 1, 2, C.silverD).poly([[8, 0], [12, 0.6], [8, 1.6]], C.pink);
  p.rect(4, 13, 8, 3, '#2a1a5a').rect(5, 11, 6, 2, '#2a1a5a').px(6, 14, C.cyan).px(9, 12, C.cyan);
});
def('spark4', (p) => {
  p.poly([[8, 0], [9.6, 6.4], [16, 8], [9.6, 9.6], [8, 16], [6.4, 9.6], [0, 8], [6.4, 6.4]], C.goldL);
  p.poly([[8, 3], [9, 7], [13, 8], [9, 9], [8, 13], [7, 9], [3, 8], [7, 7]], C.white);
}, { shade: false });
def('friends', (p) => {
  p.ell(11, 14, 4.4, 3.4, C.pink).circ(10.6, 6, 3.3, C.skin).rect(7, 2, 7, 2, C.brownD).px(13, 4, C.brownD).px(7, 4, C.brownD);
  p.px(9, 6, C.ink).px(12, 6, C.ink).px(10, 8, C.redD).px(11, 8, C.redD);
  p.ell(5, 15, 4.6, 3.4, C.blue).circ(5.4, 7.2, 3.5, C.skin);
  p.poly([[1.6, 6], [2.6, 2.4], [4, 4], [5.4, 1.6], [6.6, 4], [8.6, 2.6], [9, 6]], C.orange);
  p.px(4, 7, C.ink).px(7, 7, C.ink).line(4, 9, 7, 9, C.redD).px(3, 8, C.pinkL).px(8, 8, C.pinkL);
  p.px(3, 13, C.blueL).px(10, 12, C.pinkL);
});
def('emote', (p) => {
  p.ell(8, 6.8, 7.4, 5.8, C.white).poly([[3.6, 10], [8, 11.6], [2, 15.4]], C.white);
  p.rect(4, 4, 2, 2, C.ink).rect(10, 4, 2, 2, C.ink).px(4, 4, C.white).px(10, 4, C.white);
  p.px(5, 8, C.ink).px(6, 9, C.ink).px(7, 9, C.ink).px(8, 9, C.ink).px(9, 9, C.ink).px(10, 8, C.ink).px(7, 10, C.red).px(8, 10, C.red);
  p.px(3, 7, C.pinkL).px(12, 7, C.pinkL);
}, { shade: true });
def('sound', (p) => {
  p.rect(1, 6, 3, 5, C.silverD).poly([[4, 6], [9, 1.6], [9, 14.4], [4, 11]], C.silver).px(7, 4, C.white).px(6, 5, C.white);
  for (const [r, c] of [[3.2, C.cyan], [5.6, C.white]]) for (let a = -0.9; a <= 0.91; a += 0.15) p.px(9.6 + Math.cos(a) * r, 8 + Math.sin(a) * r * 1.25, c);
});
def('music', (p) => {
  p.rect(5, 4, 2, 9, C.purple).rect(12, 2, 2, 9, C.purple).poly([[5, 4], [14, 1.4], [14, 4.4], [5, 7]], C.purpleD);
  p.ell(4.4, 13, 2.9, 2.3, C.purple).ell(11.4, 11, 2.9, 2.3, C.purple);
  p.px(3, 12, C.purpleL).px(10, 10, C.purpleL).px(6, 5, C.purpleL).px(13, 3, C.purpleL);
});
def('paint', (p) => {
  p.line(2, 15, 7, 10, C.brown, 1).px(2, 15, C.brownD);
  p.rect(7, 8, 3, 3, C.silver).px(7, 8, C.white);
  p.poly([[9, 7], [13, 2], [15, 1], [14, 4], [10, 9]], C.pink).px(13, 2, C.pinkL).px(12, 3, C.pinkL);
  p.px(14, 6, C.pink).px(14, 7, C.pink).px(3, 6, C.blue).px(4, 7, C.blue).px(5, 4, C.gold).px(11, 13, C.green).px(12, 14, C.green);
});
def('megaphone', (p) => {
  p.poly([[3, 6], [12, 1], [12, 15], [3, 10]], C.red).rect(1, 6, 3, 4, C.silver).rect(12, 2, 2, 12, C.white);
  p.rect(5, 10, 2, 4, C.silverD).px(5, 6, C.redL).px(6, 5, C.redL);
});

// 24x24 reward art: coin stacks / piles / chests, gem heaps
const coinFace = (p, x, y, r = 2.7) => {
  p.circ(x, y, r, C.goldD).circ(x - 0.2, y - 0.2, r - 0.9, C.gold).px(x - 1, y - 1, C.goldL).px(x, y - 1, C.goldL);
};
def('coinStack', (p) => {
  for (let i = 0; i < 5; i++) { const y = 20 - i * 3; p.ell(9, y + 1, 7.6, 2.9, C.goldDD).ell(9, y, 7.6, 2.9, i % 2 ? C.goldD : C.gold); }
  p.ell(9, 8, 7.6, 2.9, C.gold).ell(9, 8, 5.2, 1.8, C.goldL).px(9, 8, C.goldD).px(8, 8, C.goldD);
  for (let i = 0; i < 5; i++) p.px(2, 20 - i * 3, C.goldL);
  p.circ(18.5, 15.5, 5.6, C.goldD).circ(18.3, 15.3, 4.7, C.gold).circ(18.6, 15.6, 3, C.goldD).circ(18.3, 15.3, 2.6, C.gold);
  p.art(['.M', 'MM', 'M.'], 18, 14, { M: C.goldDD });
  p.px(16, 12, C.white).px(15, 13, C.white).px(4, 7, C.white).px(5, 6, C.white);
}, { size: 24 });
def('coinPile', (p) => {
  p.poly([[0.5, 23.5], [23.5, 23.5], [20, 15], [14, 9], [9, 10], [4, 15]], C.goldD);
  const cs = [[4, 20], [9, 21], [14, 21], [19, 20], [6, 16], [11, 16.5], [16, 16], [9, 12.5], [14, 12], [11.5, 8.5]];
  for (const [x, y] of cs) coinFace(p, x, y, 2.9);
  p.px(20, 4, C.white).px(19, 5, C.goldL).px(21, 5, C.goldL).px(20, 6, C.goldL).px(4, 9, C.white).px(5, 10, C.goldL);
}, { size: 24 });
def('coinChest', (p) => {
  p.poly([[3, 12], [21, 12], [19, 4], [5, 4]], C.brownD).rect(5, 4, 14, 1, C.brown).rect(3, 4, 2, 9, C.goldD).rect(19, 4, 2, 9, C.goldD);
  p.poly([[3, 13], [21, 13], [18, 8], [12, 6], [6, 8]], C.goldD);
  for (const [x, y] of [[6, 11], [11, 10.5], [16, 11], [9, 8], [14, 7.6], [19, 10.5]]) coinFace(p, x, y, 2.4);
  p.rect(1, 13, 22, 10, C.brown).rect(1, 13, 22, 2, C.gold).rect(1, 21, 22, 2, C.brownD);
  p.rect(4, 13, 2, 10, C.goldD).rect(18, 13, 2, 10, C.goldD).line(2, 18, 21, 18, C.brownD);
  p.rect(10, 15, 4, 5, C.goldL).px(11, 17, C.goldDD).px(12, 17, C.goldDD).px(11, 18, C.goldDD);
  p.px(21, 2, C.white).px(20, 3, C.goldL).px(22, 3, C.goldL).px(2, 15, C.white);
}, { size: 24 });
const gem = (p, x, y, s = 1) => {
  p.poly([[x - 5 * s, y - 2 * s], [x - 3 * s, y - 5 * s], [x + 3 * s, y - 5 * s], [x + 5 * s, y - 2 * s], [x, y + 6 * s]], C.pink);
  p.poly([[x - 5 * s, y - 2 * s], [x + 5 * s, y - 2 * s], [x, y + 6 * s]], C.pinkD).poly([[x - 2.6 * s, y - 2 * s], [x + 2.6 * s, y - 2 * s], [x, y + 4 * s]], C.pink);
  p.poly([[x - 3 * s, y - 5 * s], [x + 3 * s, y - 5 * s], [x + 3.6 * s, y - 2 * s], [x - 3.6 * s, y - 2 * s]], C.pinkL);
  p.px(x - 2 * s, y - 4 * s, C.white).px(x - 1 * s, y - 4 * s, C.white);
};
def('bucksPile', (p) => {
  gem(p, 6, 15, 0.9);
  gem(p, 18, 15, 0.9);
  gem(p, 12, 11, 1.25);
  p.px(20, 3, C.white).px(19, 4, C.pinkL).px(21, 4, C.pinkL).px(20, 5, C.pinkL).px(3, 6, C.white);
}, { size: 24 });

// Pass tier markers: erlenmeyer flasks (empty glass / goo / current / milestone gold)
const flask = (p, liq, liqL, level, glass = F.glass, cork = C.brown) => {
  p.rect(9, 0, 6, 3, cork).rect(9, 0, 6, 1, shadeC(cork, 0.35));
  p.rect(9, 3, 6, 6, glass);
  p.poly([[9, 8.5], [15, 8.5], [22, 19.5], [22, 23.5], [2, 23.5], [2, 19.5]], glass);
  if (liq) {
    const y0 = level, k = (y) => 3 + ((y - 8.5) / 11) * 7;
    const half = (y) => Math.min(10, y < 8.5 ? 3 : k(y));
    p.poly([[12 - half(y0), y0], [12 + half(y0), y0], [12 + 10, 19.5], [12 + 10, 23], [2, 23], [2, 19.5]], liq);
    for (let x = Math.ceil(12 - half(y0)); x < 12 + half(y0); x++) p.px(x, Math.round(y0), liqL).flat(x, Math.round(y0));
    p.px(8, 19, C.white).px(15, 21, liqL).px(12, 17, liqL).px(17, 18, C.white);
  }
  p.rect(10, 3, 1, 5, C.white).line(8, 11, 4, 18, C.white).px(10, 1, C.white);
};
const shadeC = (hex, f) => {
  const h = parseInt(hex.slice(1), 16);
  let r = (h >> 16) & 255, g = (h >> 8) & 255, b = h & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return '#' + ((Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).padStart(6, '0');
};
def('flaskOff', (p) => flask(p, '#2a3270', '#3a4490', 18, '#5a6aa8', '#6a5a7a'), { size: 24 });
def('flaskOn', (p) => flask(p, '#4cd24a', '#c8ff9a', 11), { size: 24 });
def('flaskCur', (p) => flask(p, '#ff2e98', '#ffb8dc', 13), { size: 24 });
def('flaskGold', (p) => flask(p, '#ffc21a', '#fff4a8', 10, F.glass, C.pink), { size: 24 });
def('flaskPrem', (p) => flask(p, '#c063ff', '#ecd0ff', 12, F.glass, C.gold), { size: 24 });

// --------------------------------------------------------------------------- API

const cache = new Map();
export function iconURL(name) {
  if (cache.has(name)) return cache.get(name);
  const d = D[name] ?? D.star;
  const p = new Pix(d.opts?.size ?? N);
  d.fn(p);
  const url = render(p, d.opts ?? {});
  cache.set(name, url);
  return url;
}
export const ICON_NAMES = Object.keys(D);
export const ICON_COLORS = C;
