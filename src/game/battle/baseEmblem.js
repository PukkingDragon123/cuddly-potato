// The tug bar's END CAPS: each base is a hand-pixeled shield built into the
// tube's frame (team colour), drawn at one canvas pixel per --px art pixel.
//   - HP: a 5-segment gauge set into the shield that drains from the top, the
//     % number stamped over it; a lost chunk breaks off and falls, a heal ticks
//     the gained rows bright, low HP blinks.
//   - Tier (T1..T6): six gem sockets on the shield's inner rail light up one per
//     tier, and the frame grows more ornate: steel > bronze > silver (+rivets) >
//     gold with crown battlements > gold + team gems > prism with a light sweep.
//     A tier-up stamps the shield and flashes the new gem.
// Cheap: a ~20 x 30 ImageData, redrawn at <= 30 fps only while something moves.
import { h } from '../../ui/ui.js';

const INK = [10, 8, 32];
// metal per tier: [hi, mid, lo]
const METAL = [
  [[214, 222, 244], [132, 142, 184], [58, 62, 104]], // T1 steel
  [[255, 206, 150], [205, 127, 60], [104, 56, 26]], // T2 bronze
  [[255, 255, 255], [192, 202, 224], [88, 98, 132]], // T3 silver
  [[255, 246, 184], [255, 196, 40], [150, 92, 10]], // T4 gold
  [[255, 246, 184], [255, 196, 40], [150, 92, 10]], // T5 gold + gems
  [[255, 255, 255], [200, 236, 255], [92, 110, 180]], // T6 prism (hue-shifted live)
];
const TEAM = [
  { lit: [79, 180, 255], hi: [200, 240, 255], lo: [20, 96, 192], well: [8, 22, 64], gem: [63, 200, 255] },
  { lit: [255, 72, 98], hi: [255, 214, 220], lo: [176, 28, 52], well: [52, 8, 22], gem: [255, 90, 120] },
];
const GOLD = [255, 216, 74], WHITE = [255, 255, 255];
const LOW = [255, 140, 40];
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const SEGS = 5;

export class BaseEmblem {
  constructor(side) {
    this.side = side;
    this.cv = h('canvas', { class: 'tw-emb' });
    this.pc = h('b', { class: 'pc' }, '100');
    this.el = h('div', { class: `tw-cap s${side}` }, this.cv, this.pc);
    this.ctx = this.cv.getContext('2d');
    this.frac = 1;
    this.shown = 1; // drawn fill (eases down)
    this.tier = 0;
    this.t = 0;
    this.drawT = 0;
    this.hitT = 0;
    this.healT = 0;
    this.healRows = null;
    this.stampT = 0;
    this.chunks = [];
    this.measureT = 0;
  }

  setHp(frac, o = {}) {
    frac = Math.max(0, Math.min(1, frac));
    if (frac === this.frac) return;
    const L = this.L;
    if (L && !o.calm) {
      if (frac < this.frac) {
        this.hitT = o.big ? 0.3 : 0.18;
        // the lost slice of the gauge breaks off and falls
        const r0 = this.fillTop(frac), r1 = this.fillTop(this.frac);
        if (r0 > r1) this.chunks.push({ y: r1, n: Math.min(r0 - r1, 4), vy: -6, x: 0, vx: (this.side ? 1 : -1) * (6 + Math.random() * 6), t: 0 });
        if (this.chunks.length > 6) this.chunks.shift();
      } else {
        this.healT = 0.5;
        this.healRows = [this.fillTop(frac), this.fillTop(this.frac)];
      }
    }
    this.frac = frac;
    const pc = String(Math.max(0, Math.ceil(frac * 100)));
    if (this.pc.textContent !== pc) this.pc.textContent = pc;
    this.el.classList.toggle('low', frac < 0.3);
    this.drawT = 0;
  }

  setTier(t, o = {}) {
    if (t === this.tier && !o.force) return;
    const up = t > this.tier;
    this.tier = Math.max(0, Math.min(5, t));
    this.el.classList.toggle('t6', this.tier >= 5);
    if (up && !o.silent) { this.stampT = 0.7; this.el.classList.remove('stamp'); void this.el.offsetWidth; this.el.classList.add('stamp'); }
    this.drawT = 0;
  }

  /** Row (art px) where the lit gauge starts for a fill fraction. */
  fillTop(f) {
    const L = this.L;
    return L.g1 - Math.round(f * (L.g1 - L.g0 + 1)) + 1;
  }

  measure() {
    const w = this.el.clientWidth, hh = this.el.clientHeight;
    if (!w || !hh) return false;
    const px = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--px')) || 3;
    const key = `${w}x${hh}@${px}`;
    if (key === this.key) return true;
    this.key = key;
    const W = Math.max(14, Math.round(w / px)), H = Math.max(18, Math.round(hh / px));
    const extra = 8; // rows below the shield for falling chunks
    this.cv.width = W;
    this.cv.height = H + extra;
    this.cv.style.width = W * px + 'px';
    this.cv.style.height = (H + extra) * px + 'px';
    this.img = this.ctx.createImageData(W, H + extra);
    // layout (drawn for the blue side, mirrored for red): outer band 2, inner gem rail 4
    const bw = 2, rail = 4;
    const point = Math.max(3, Math.round(W / 5));
    const L = { W, H, extra, px, bw, rail, point, pointStart: H - point };
    L.gx0 = 1 + bw;
    L.gx1 = W - 2 - rail;
    L.g0 = 1 + bw + 1;
    L.g1 = L.pointStart - 1;
    // segment rows (1 dark gap row between segments)
    const rows = L.g1 - L.g0 + 1;
    L.gap = new Set();
    for (let s = 1; s < SEGS; s++) L.gap.add(L.g1 - Math.round((rows * s) / SEGS) + 1);
    // gem sockets down the inner rail
    const span = L.pointStart - (1 + bw) - 1;
    L.pip = Math.max(2, Math.min(3, Math.floor((span + 1) / 6) - 1));
    const step = L.pip + 1, tot = 6 * step - 1;
    L.pipY = 1 + bw + Math.max(0, Math.floor((span - tot) / 2)) + 1;
    L.pipX = W - 1 - rail + Math.floor((rail - L.pip) / 2);
    this.L = L;
    // the % number sits centred on the gauge
    const gx = (L.gx0 + L.gx1 + 1) / 2, gy = (L.g0 + L.g1 + 1) / 2;
    const cx = this.side ? W - gx : gx;
    this.pc.style.left = cx * px + 'px';
    this.pc.style.top = gy * px + 'px';
    this.drawT = 0;
    return true;
  }

  update(dt) {
    this.t += dt;
    this.measureT -= dt;
    if (this.measureT <= 0 || !this.L) { this.measureT = 0.5; if (!this.measure()) return; }
    const busy = this.hitT > 0 || this.healT > 0 || this.stampT > 0 || this.chunks.length || Math.abs(this.shown - this.frac) > 0.002 || this.frac < 0.3 || this.tier >= 5;
    this.hitT = Math.max(0, this.hitT - dt);
    this.healT = Math.max(0, this.healT - dt);
    this.stampT = Math.max(0, this.stampT - dt);
    this.shown += (this.frac - this.shown) * Math.min(1, dt * 8);
    for (const c of this.chunks) { c.t += dt; c.vy += 90 * dt; c.y += c.vy * dt; c.x += c.vx * dt; }
    this.chunks = this.chunks.filter((c) => c.t < 0.9);
    this.drawT -= dt;
    if (this.drawT > 0) return;
    this.drawT = busy ? 1 / 30 : 0.5;
    this.draw();
  }

  /** Is (x, y) inside the shield silhouette (blue-side coordinates)? */
  inside(x, y) {
    const L = this.L;
    if (x < 0 || y < 0 || x >= L.W || y >= L.H) return false;
    // crown battlements from T4: the top row keeps only the merlons
    if (y === 0 && this.tier >= 3) {
      const m = Math.max(2, Math.round(L.W / 7));
      const k = Math.floor(x / m);
      if (k % 2 === 1) return false;
    } else if (y === 0 && (x === 0 || x === L.W - 1)) return false; // rounded corners
    if (y >= L.pointStart) {
      const k = (y - L.pointStart + 1) / (L.point + 1);
      const ins = Math.round(k * (L.W / 2 - 1));
      return x >= ins && x < L.W - ins;
    }
    return true;
  }

  draw() {
    const L = this.L, d = this.img.data, W = L.W, H = L.H, T = TEAM[this.side];
    d.fill(0);
    const tier = this.tier;
    let [mh, mm, ml] = METAL[tier];
    if (tier >= 5) {
      // prism: the metal cycles through soft hues
      const a = this.t * 1.6;
      const tint = [200 + 55 * Math.sin(a), 200 + 55 * Math.sin(a + 2.1), 200 + 55 * Math.sin(a + 4.2)];
      mm = mix(mm, tint, 0.55); ml = mix(ml, tint.map((v) => v * 0.45), 0.5);
    }
    const set = (x, y, c) => {
      if (x < 0 || x >= W || y < 0 || y >= H + L.extra) return;
      const X = this.side ? W - 1 - x : x;
      const i = (y * W + X) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    };
    const flash = this.hitT > 0 ? Math.min(1, this.hitT * 6) : 0;
    const sweep = tier >= 5 ? ((this.t * 14) % (W + H + 20)) - 10 : -99;
    const low = this.frac < 0.3 && Math.floor(this.t * 3) % 2 === 0;
    const top = this.fillTop(this.shown);
    const healA = this.healT > 0 && this.healRows ? this.healRows : null;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!this.inside(x, y)) continue;
        // outline: any 4-neighbour outside
        if (!this.inside(x - 1, y) || !this.inside(x + 1, y) || !this.inside(x, y - 1) || !this.inside(x, y + 1)) { set(x, y, INK); continue; }
        const inGauge = x >= L.gx0 && x <= L.gx1 && y >= L.g0 - 1 && y <= L.g1 && y < L.pointStart;
        if (inGauge) {
          // the well: ink rim, then segments
          if (x === L.gx0 || x === L.gx1 || y === L.g0 - 1) { set(x, y, INK); continue; }
          let c;
          if (L.gap.has(y)) c = mix(T.well, INK, 0.5);
          else if (y >= top) {
            const segTop = y === L.g0 || L.gap.has(y - 1);
            c = segTop ? T.hi : x === L.gx0 + 1 ? mix(T.lit, WHITE, 0.25) : x === L.gx1 - 1 ? T.lo : T.lit;
            if (low) c = mix(c, LOW, 0.6);
            if (healA && y >= healA[0] && y < healA[1]) c = mix(c, [190, 255, 140], Math.min(1, this.healT * 2.5));
          } else c = (x + y) % 4 === 0 ? mix(T.well, T.lo, 0.35) : T.well;
          if (flash) c = mix(c, WHITE, flash * 0.8);
          set(x, y, c);
          continue;
        }
        // metal: lit from the top-left, rivets from T3, a light sweep at T6
        let c = mm;
        const edgeT = !this.inside(x, y - 2) || !this.inside(x - 2, y);
        const edgeB = !this.inside(x, y + 2) || !this.inside(x + 2, y);
        if (edgeT) c = mh; else if (edgeB) c = ml;
        if (tier >= 2 && x <= 2 && y > 3 && y < L.pointStart && y % 4 === 0) c = (x === 1) ? WHITE : ml;
        if (sweep > -50 && Math.abs(x + y - sweep) < 1.5) c = mix(c, WHITE, 0.7);
        if (flash) c = mix(c, WHITE, flash * 0.5);
        set(x, y, c);
      }
    }
    // gem sockets on the inner rail: lit up to the tier
    for (let i = 0; i < 6; i++) {
      const y0 = L.pipY + (5 - i) * (L.pip + 1);
      const lit = i <= tier;
      const fresh = i === tier && this.stampT > 0;
      for (let yy = 0; yy < L.pip; yy++) for (let xx = 0; xx < L.pip; xx++) {
        let c;
        if (!lit) c = (xx + yy) % 2 ? INK : ml;
        else {
          const g = tier >= 4 ? T.gem : GOLD;
          c = xx === 0 && yy === 0 ? WHITE : yy === L.pip - 1 ? mix(g, INK, 0.35) : g;
          if (fresh) c = mix(c, WHITE, Math.min(1, this.stampT * 2));
        }
        set(L.pipX + xx, y0 + yy, c);
      }
    }
    // T5+: a team gem set in the shield's point and the top corners
    if (tier >= 4) {
      const px = Math.floor(W / 2) - 1, py = L.pointStart + 1;
      set(px, py, WHITE); set(px + 1, py, T.gem); set(px, py + 1, T.gem); set(px + 1, py + 1, mix(T.gem, INK, 0.4));
    }
    // chipped gauge chunks falling away
    for (const c of this.chunks) {
      const a = 1 - c.t / 0.9;
      if (a <= 0) continue;
      const x0 = Math.round(L.gx0 + 1 + c.x), y0 = Math.round(c.y);
      for (let yy = 0; yy < c.n; yy++) for (let xx = 0; xx < L.gx1 - L.gx0 - 1; xx++) {
        if ((xx + yy + Math.floor(c.t * 10)) % 5 === 0) continue; // cracked edge
        const col = yy === 0 ? T.hi : T.lit;
        set(x0 + xx, y0 + yy, Math.floor(c.t * 12) % 2 && c.t > 0.5 ? WHITE : col);
      }
    }
    this.ctx.putImageData(this.img, 0, 0);
  }
}
