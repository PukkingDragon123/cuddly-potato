// Combat-feel pixel-art particles (hitPix.js): camera-facing sprites cut from one
// procedurally drawn atlas (nearest-filtered, alpha-tested, no soft blobs) and
// flip-book animated over their life. Two instanced layers: `glow` (additive,
// bloom-hot: hit sparks, slash smears, muzzle flashes, fire, explosion frames,
// embers) and `solid` (alpha-tested with an ordered-dither fade: dust, smoke,
// death poofs, goo splats, debris chips).
//
// The atlas stores LUMINANCE bands (0..1) + alpha; the shader colours it from a
// per-particle tint: the hottest band blends to near-white, lower bands shade the
// tint down, so one drawing serves every damage kind / team colour.
//
// (Spell / signature sprites live in pixfx.js; this module is the combat + base
// destruction layer.) Usage: hpx.attach(scene) once per battle view, hpx.update(gdt)
// per frame, then
//   hpx.hit(pos, kind, scale, dir)   hit spark per damage kind
//   hpx.slash(pos, dir, tint, scale) melee smear arc
//   hpx.rake(pos, dir, side, tint, scale) three-mark claw rake (alternating paws)
//   hpx.muzzle(pos, dir, tint, scale)
//   hpx.dust / smoke / fire / boom / poof / chips / embers / sparks / splat / streaks (pos, o)
import * as THREE from 'three';
import './combatFx.css';

const TEX = 0.034; // world units per atlas texel (sprite pixel)
const ATLAS = 512, CELL = 32;
const rnd = (a, b) => a + Math.random() * (b - a);
const pickc = (a) => a[(Math.random() * a.length) | 0];
const hsh = (x, y, s = 0) => {
  let n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;

// ------------------------------------------------------------------ atlas
let atlas = null; // { tex, anims: { name: [{u,v,w,h,pw,ph}] } }
function buildAtlas() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS;
  const g = cv.getContext('2d');
  const anims = {};
  let slot = 0;
  // allocate a w x h cell block in reading order
  const alloc = (cw = 1, ch = 1) => {
    const perRow = ATLAS / CELL;
    let col = slot % perRow;
    if (col + cw > perRow) { slot += perRow - col; col = 0; }
    const row = Math.floor(slot / perRow);
    slot += cw;
    if (ch > 1) slot += perRow * (ch - 1) - 0; // reserve the rows below (simple: never mix tall + wide on one row)
    return [col * CELL, row * CELL];
  };
  const frame = (name, w, h, draw, cw = 1, ch = 1) => {
    const [ox, oy] = alloc(cw, ch);
    const put = (x, y, L, a = 1) => {
      x = Math.round(x); y = Math.round(y);
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const v = Math.max(0, Math.min(255, Math.round(L * 255)));
      g.fillStyle = `rgba(${v},${v},${v},${a})`;
      g.fillRect(ox + x, oy + y, 1, 1);
    };
    draw(put, w, h);
    (anims[name] ??= []).push({ u: ox / ATLAS, v: 1 - (oy + h) / ATLAS, w: w / ATLAS, h: h / ATLAS, pw: w, ph: h });
  };

  // HIT STAR: 4-point star + flying sparkle bits, shrinking (generic / physical)
  for (let f = 0; f < 4; f++) frame('star', 32, 32, (put) => {
    const c = 15.5, arm = [14, 10, 6, 3][f], th = [2.6, 2, 1.4, 1][f];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = Math.abs(x + 0.5 - 16), dy = Math.abs(y + 0.5 - 16);
      const onH = dy < th * (1 - dx / arm) + 0.5 && dx < arm, onV = dx < th * (1 - dy / arm) + 0.5 && dy < arm;
      if (onH || onV) put(x, y, dx + dy < 3 ? 1 : dx + dy < arm * 0.5 ? 0.85 : 0.55);
      else if (f < 2 && Math.abs(dx - dy) < 0.8 && dx + dy < arm * 0.75) put(x, y, 0.7);
    }
    void c;
    const r = [0, 9, 12, 14][f];
    if (r) for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.5 + f * 0.2, px = 16 + Math.cos(a) * r, py = 16 + Math.sin(a) * r;
      put(px, py, f === 3 ? 0.6 : 1); if (f === 1) { put(px + 1, py, 0.6); put(px, py + 1, 0.6); }
    }
  });
  // ZAP: jagged branching bolts (electric / laser)
  for (let f = 0; f < 3; f++) frame('zap', 32, 32, (put) => {
    for (let b = 0; b < 5; b++) {
      let x = 16, y = 16, a = (b / 5) * Math.PI * 2 + f * 0.7 + hsh(b, f, 3);
      const len = [14, 12, 7][f];
      for (let s = 0; s < len; s++) {
        a += (hsh(b, s, f) - 0.5) * 1.6;
        x += Math.cos(a); y += Math.sin(a);
        put(x, y, s < 3 ? 1 : 0.85);
        if (f === 0) put(x + 1, y, 0.5);
      }
    }
    for (let y = 13; y < 19; y++) for (let x = 13; x < 19; x++) if (Math.abs(x - 15.5) + Math.abs(y - 15.5) < 4 - f) put(x, y, 1);
  });
  // SPLAT: goo blob that bursts into droplets
  for (let f = 0; f < 4; f++) frame('splat', 32, 32, (put) => {
    const R = [5, 7.5, 6, 3][f];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 16, a = Math.atan2(dy, dx);
      const lump = 1 + 0.25 * Math.sin(a * 5 + f) + 0.12 * Math.sin(a * 9);
      const r = Math.hypot(dx, dy) / (R * lump);
      if (r < 1 && !(f >= 2 && r < 0.45)) put(x, y, dx + dy < -R * 0.5 ? 0.95 : r > 0.75 ? 0.45 : 0.7);
    }
    const dr = [0, 10, 13, 15][f];
    if (dr) for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3, px = 16 + Math.cos(a) * dr * (0.8 + hsh(i, 1) * 0.3), py = 16 + Math.sin(a) * dr * 0.85;
      const s = f === 3 ? 1 : 2;
      for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) put(px + xx, py + yy, xx + yy === 0 ? 0.95 : 0.6);
    }
  });
  // FLAME: a licking tongue of fire (4 frame loop)
  for (let f = 0; f < 4; f++) frame('flame', 16, 24, (put) => {
    for (let y = 0; y < 24; y++) for (let x = 0; x < 16; x++) {
      const t = y / 23; // 0 top .. 1 base
      const sway = Math.sin(f * 1.57 + t * 3) * (1 - t) * 2.2;
      const hw = (0.6 + Math.pow(t, 0.7) * 6.4) * (t > 0.86 ? 1 - (t - 0.86) * 3.2 : 1);
      const d = Math.abs(x + 0.5 - 8 - sway);
      if (d > hw) continue;
      if (t < 0.12 && hsh(x, y, f) > 0.5) continue;
      if (d > hw - 1.2 && t < 0.7 && hsh(x, y >> 1, f) > 0.55) continue; // ragged licks
      const core = d < hw * 0.45 && t > 0.45;
      put(x, y, core ? 1 : d < hw * 0.75 ? 0.75 : 0.5);
    }
  });
  // PUFF: dust / smoke cloud that swells and dissolves (6 frames)
  const puff = (name, seed) => {
    const blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([(hsh(i, 1, seed) - 0.5) * 1.1, (hsh(i, 2, seed) - 0.5) * 0.8 - (i === 0 ? 0.2 : 0), 0.42 + hsh(i, 3, seed) * 0.38]);
    for (let f = 0; f < 6; f++) frame(name, 32, 32, (put) => {
      const u = f / 5, R = 32 * (0.17 + u * 0.17), fade = Math.max(0, (u - 0.3) / 0.7);
      const field = (x, y) => {
        let best = 9, sh = 0;
        for (const [bx, by, br] of blobs) {
          const dx = (x + 0.5 - 16) / R - bx * (1 + u * 0.6), dy = (y + 0.5 - 16) / R - by * (1 + u * 0.6);
          const d = Math.hypot(dx, dy) / (br * (1 + u * 0.25));
          if (d < best) { best = d; sh = (dx + dy) / br; }
        }
        return [best, sh];
      };
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const [best, sh] = field(x, y);
        if (bay(x + f, y) < fade) continue;
        if (best > 1) {
          // dark pixel rim around the cloud (reads on any background)
          if (fade < 0.4 && (field(x + 1, y)[0] <= 1 || field(x - 1, y)[0] <= 1 || field(x, y + 1)[0] <= 1 || field(x, y - 1)[0] <= 1)) put(x, y, 0.22);
          continue;
        }
        put(x, y, best > 0.82 ? 0.4 : sh < -0.45 ? 0.95 : sh > 0.5 ? 0.5 : 0.72);
      }
    });
  };
  puff('puff', 1); puff('puff2', 5);
  // BOOM: fireball frames (glow; smoke is spawned separately)
  for (let f = 0; f < 6; f++) frame('boom', 32, 32, (put) => {
    const u = f / 5, R = 32 * (f === 0 ? 0.22 : 0.3 + u * 0.16), erode = Math.max(0, (u - 0.35) / 0.65);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 16, a = Math.atan2(dy, dx);
      const lump = 1 + 0.18 * Math.sin(a * 5 + f) + 0.1 * Math.sin(a * 11 - f * 2) + (f === 0 ? 0.5 * Math.max(0, Math.cos(a * 4)) ** 8 : 0);
      const r = Math.hypot(dx, dy) / (R * lump);
      if (r > 1) continue;
      if (bay(x, y) < erode * (0.5 + r * 0.7)) continue;
      const k = r + hsh(x, y, f) * 0.15 + u * 0.35;
      put(x, y, k < 0.45 ? 1 : k < 0.75 ? 0.82 : k < 1 ? 0.6 : 0.4);
    }
  });
  // SLASH: crescent smear arc (64 x 32), sweeping then thinning out
  for (let f = 0; f < 4; f++) frame('slash', 64, 32, (put) => {
    const a0 = -1.25, a1 = 1.15, lead = [0.55, 1, 1, 1][f], tail = [0, 0, 0.35, 0.75][f];
    for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
      const dx = (x + 0.5 - 18) / 40, dy = (y + 0.5 - 16) / 15;
      const r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
      if (a < a0 || a > a1) continue;
      const s = (a - a0) / (a1 - a0); // 0 top .. 1 bottom (sweep direction)
      if (s > lead || s < tail) continue;
      const th = 0.27 * Math.sin(Math.PI * Math.min(1, (s - tail) / Math.max(0.05, lead - tail))) * (f === 3 ? 0.5 : 1);
      const d = 1 - r;
      if (d < 0 || d > th) continue;
      const edge = d / Math.max(0.01, th);
      if (f >= 2 && bay(x, y) < (s - tail) * 0.3 + (f === 3 ? 0.4 : 0)) continue;
      put(x, y, edge < 0.3 ? 1 : edge < 0.65 ? 0.8 : 0.55);
    }
    if (f >= 1) for (let i = 0; i < 4; i++) { const yy = 6 + i * 6 + f, xx = 44 + (i % 2) * 6 - f * 2; for (let k = 0; k < 5 - f; k++) put(xx + k, yy, 0.7); }
  }, 2, 1);
  // MUZZLE: spiky launch flash pointing +x (three tapered spikes + a hot diamond core)
  for (let f = 0; f < 3; f++) frame('muzzle', 32, 32, (put) => {
    const L = [20, 14, 7][f], cx = 7, cy = 16;
    const spikes = [[0, L, 2.6], [-0.6, L * 0.55, 1.6], [0.6, L * 0.55, 1.6], [-1.3, L * 0.3, 1], [1.3, L * 0.3, 1]];
    for (const [ang, len, th] of spikes) {
      for (let r = 0; r < len; r += 0.5) {
        const w = Math.max(0.5, th * (1 - r / len) * (1 - f * 0.25));
        const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
        for (let o = -w; o <= w; o += 0.5) put(x - Math.sin(ang) * o, y + Math.cos(ang) * o, r < len * 0.35 ? 1 : Math.abs(o) < w * 0.5 ? 0.85 : 0.55);
      }
    }
    const core = 5 - f * 1.5;
    for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) if (Math.abs(x) + Math.abs(y) <= core) put(cx + x, cy + y, Math.abs(x) + Math.abs(y) <= core - 2 ? 1 : 0.8);
    if (f < 2) for (let i = 0; i < 3; i++) put(cx + 6 + i * 5 + f * 3, cy + (i % 2 ? -5 : 5), 0.75);
  });
  // POOF: cartoon cloud burst for KOs (6 frames)
  for (let f = 0; f < 6; f++) frame('poof', 32, 32, (put) => {
    const u = f / 5, spread = 5.2 + u * 6, br = 3.9 - u * 1.4, fade = Math.max(0, (u - 0.45) / 0.55);
    const C = [[0, 0, 0.8]];
    for (let i = 0; i < 5; i++) C.push([Math.cos(i * 1.2566 + 0.4) * spread * (i % 2 ? 1 : 0.85), Math.sin(i * 1.2566 + 0.4) * spread * 0.85, i % 2 ? 1.05 : 0.75]);
    const field = (x, y) => {
      let best = 9, sh = 0;
      for (const [cx, cy, s] of C) {
        if (f >= 3 && cx === 0 && cy === 0) continue;
        const dx = x + 0.5 - 16 - cx, dy = y + 0.5 - 16 - cy;
        const d = Math.hypot(dx, dy) / (br * s);
        if (d < best) { best = d; sh = (dx + dy) / (br * s); }
      }
      return [best, sh];
    };
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const [best, sh] = field(x, y);
      if (bay(x, y) < fade) continue;
      if (best > 1) {
        if (fade < 0.3 && (field(x + 1, y)[0] <= 1 || field(x - 1, y)[0] <= 1 || field(x, y + 1)[0] <= 1 || field(x, y - 1)[0] <= 1)) put(x, y, 0.2);
        continue;
      }
      put(x, y, best > 0.78 ? 0.5 : sh < -0.3 ? 0.95 : 0.74);
    }
    if (f >= 1 && f <= 4) for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.8, r = 9 + f * 2.2, px = 16 + Math.cos(a) * r, py = 16 + Math.sin(a) * r;
      put(px, py, 1); put(px - 1, py, 0.8); put(px + 1, py, 0.8); put(px, py - 1, 0.8); put(px, py + 1, 0.8);
    }
  });
  // CLAW: three raked diagonal gashes of light (slash / claw attacks), drawn in, then dithered out
  for (let f = 0; f < 4; f++) frame('claw', 32, 32, (put) => {
    const grow = [0.55, 1, 1, 1][f], thin = [1, 1, 0.7, 0.4][f], erode = [0, 0, 0.25, 0.55][f];
    for (let k = 0; k < 3; k++) {
      const ox = 6 + k * 7, oy = 3 + Math.abs(k - 1) * 2, len = (k === 1 ? 26 : 21) * grow;
      for (let s = 0; s < len; s += 0.5) {
        const u = s / Math.max(1, len), w = Math.max(0.5, 2.4 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * thin);
        const x = ox + s * 0.42, y = oy + s;
        for (let o = -w; o <= w; o += 0.5) {
          if (erode && bay(Math.round(x + o), Math.round(y)) < erode * (1 - u * 0.5)) continue;
          put(x + o, y, Math.abs(o) < w * 0.45 ? 1 : 0.7);
        }
      }
    }
    if (f === 1 || f === 2) for (let i = 0; i < 4; i++) { const px = 4 + i * 8 + f, py = 27 - (i % 2) * 3 + f; put(px, py, 0.9); put(px + 1, py, 0.6); }
  });
  // RAKE: three parallel curved claw marks torn through the air by a paw (claw attacks): the strokes are
  // drawn in along the swipe, burn hot, then thin and dither away. A dark rim keeps them readable on
  // bright sand / snow. Flipped horizontally for the pull-back rake of the other paw.
  for (let f = 0; f < 5; f++) frame('rake', 32, 32, (put) => {
    const lead = [0.5, 1, 1, 1, 1][f], tail = [0, 0, 0.12, 0.32, 0.55][f], thin = [1, 1.1, 0.85, 0.6, 0.42][f];
    const m = new Float32Array(32 * 32);
    const ax = 4, ay = 3, bx = 24, by = 29; // stroke: top-left -> bottom-right (the swipe direction)
    const L = Math.hypot(bx - ax, by - ay), tx = (bx - ax) / L, ty = (by - ay) / L, nx = ty, ny = -tx;
    for (let k = 0; k < 3; k++) {
      const off = (k - 1) * 6.2, len = k === 1 ? 1 : 0.84, s0 = k === 1 ? 0 : 0.08;
      for (let u = s0; u <= s0 + len; u += 0.01) {
        const q = (u - s0) / len;
        if (q > lead || q < tail) continue;
        const w = Math.max(0.55, 2.5 * Math.sin(Math.PI * Math.pow(Math.min(1, (q - tail) / Math.max(0.05, lead - tail)), 0.8)) * thin);
        const bulge = 3.6 * Math.sin(Math.PI * q);
        const cx = ax + tx * L * u + nx * (off + bulge), cy = ay + ty * L * u + ny * (off + bulge);
        for (let o = -w; o <= w; o += 0.35) {
          const x = Math.round(cx + nx * o), y = Math.round(cy + ny * o);
          if (x < 0 || y < 0 || x > 31 || y > 31) continue;
          const L2 = Math.abs(o) < w * 0.42 ? 1 : 0.76;
          if (m[y * 32 + x] < L2) m[y * 32 + x] = L2;
        }
      }
    }
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const v = m[y * 32 + x];
      if (v) {
        if (f >= 3 && bay(x, y) < (f === 3 ? 0.3 : 0.55)) continue;
        put(x, y, v);
      } else if (f < 3 && ((x > 0 && m[y * 32 + x - 1]) || (x < 31 && m[y * 32 + x + 1]) || (y > 0 && m[(y - 1) * 32 + x]) || (y < 31 && m[(y + 1) * 32 + x]))) put(x, y, 0.22);
    }
  });
  // POW: jagged comic impact burst (punch / blunt): solid star blob -> hollow jagged outline -> bits
  for (let f = 0; f < 4; f++) frame('pow', 32, 32, (put) => {
    const R = [8, 12.5, 14, 14.5][f], hole = [0, 0, 0.62, 0.8][f], pts = 9;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const dx = x + 0.5 - 16, dy = y + 0.5 - 16, a = Math.atan2(dy, dx);
      const spike = 0.62 + 0.38 * Math.abs(((((a / (Math.PI * 2)) * pts + 0.25) % 1) + 1) % 1 * 2 - 1) + 0.08 * hsh(Math.floor((a + 4) * 3), f, 9);
      const r = Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) / 1.32) / (R * spike);
      if (r > 1 || r < hole) continue;
      if (f === 3 && bay(x, y) < 0.5) continue;
      put(x, y, r > 0.84 ? 0.5 : r < 0.42 ? 1 : 0.82);
    }
  });
  // CHOMP: two rows of pixel teeth snapping shut (bite attacks), then sparkle bits
  for (let f = 0; f < 4; f++) frame('chomp', 32, 32, (put) => {
    const gap = [9, 4, 0, 0][f], fade = f === 3 ? 0.5 : 0;
    const jaw = (yBase, down) => {
      for (let t = 0; t < 4; t++) {
        const cx = 5 + t * 7.3;
        for (let r = 0; r < 6; r++) {
          const half = 3 - r * 0.5;
          const y = down ? yBase + r : yBase - r;
          for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
            if (fade && bay(x, y) < fade) continue;
            put(x, y, x === Math.round(cx - half) || r === 5 ? 0.55 : r < 2 ? 1 : 0.85);
          }
        }
      }
      for (let x = 2; x < 30; x++) { if (!(fade && bay(x, yBase) < fade)) put(x, down ? yBase - 1 : yBase + 1, 0.45); }
    };
    jaw(16 - 6 - gap, true);
    jaw(16 + 6 + gap, false);
    if (f >= 2) for (let i = 0; i < 4; i++) { const px = i < 2 ? 1 + i * 2 : 28 + (i - 2) * 2, py = 10 + i * 4; put(px, py, 1); put(px, py + 1, 0.7); }
  });
  // PING: small bullet ricochet star with spray lines kicked back (+x = travel direction)
  for (let f = 0; f < 3; f++) frame('ping', 24, 24, (put) => {
    const c = 12, arm = [8, 6, 3][f];
    for (let i = -arm; i <= arm; i++) { const L = Math.abs(i) < 2 ? 1 : 0.75; put(c + i, c, L); put(c, c + i * 0.8, L); }
    if (f < 2) for (const [ax, ay] of [[-1, -0.6], [-1, 0.6], [-1, 0]]) {
      for (let s = 3 + f * 2; s < 10 + f * 2; s++) put(c + ax * s, c + ay * s, s < 6 + f * 2 ? 0.85 : 0.55);
    }
  });
  // MAGIC: a spinning diamond sparkle with orbiting twinkles (magic / energy hits)
  for (let f = 0; f < 4; f++) frame('magic', 32, 32, (put) => {
    const R = [5, 7, 5, 2][f];
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const d = Math.abs(x) + Math.abs(y); if (d <= R) put(16 + x, 16 + y, d < R * 0.4 ? 1 : d < R * 0.75 ? 0.85 : 0.6); }
    const orb = [6, 10, 13, 15][f];
    for (let i = 0; i < 4; i++) {
      const a = i * 1.5708 + f * 0.45 + 0.4, px = 16 + Math.cos(a) * orb, py = 16 + Math.sin(a) * orb;
      const s = f < 3 ? 2 : 1;
      for (let k = -s; k <= s; k++) { put(px + k, py, Math.abs(k) === s ? 0.6 : 1); put(px, py + k, Math.abs(k) === s ? 0.6 : 1); }
    }
    if (f === 1 || f === 2) for (let i = 0; i < 4; i++) { const a = i * 1.5708 + 1.2 - f * 0.3, r = orb * 0.6; put(16 + Math.cos(a) * r, 16 + Math.sin(a) * r, 0.8); }
  });
  // small bits: chunky chip, ember, shard, sparkle cross, drop
  frame('chip', 6, 6, (put) => { for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) put(x, y, x === 1 || y === 1 ? 0.95 : x === 4 || y === 4 ? 0.45 : 0.7); });
  frame('chip', 6, 6, (put) => { for (let y = 1; y < 4; y++) for (let x = 1; x < 5; x++) put(x, y, y === 1 ? 0.95 : y === 3 ? 0.45 : 0.7); put(2, 4, 0.45); });
  frame('ember', 4, 4, (put) => { put(1, 1, 1); put(2, 1, 0.8); put(1, 2, 0.8); put(2, 2, 0.6); });
  frame('shard', 8, 8, (put) => { for (let y = 1; y < 7; y++) for (let x = 1; x < 8 - y; x++) put(x, y, x === 1 ? 1 : x + y > 6 ? 0.5 : 0.8); });
  frame('twinkle', 9, 9, (put) => { for (let i = 1; i < 8; i++) { const e = Math.abs(i - 4); const L = e === 0 ? 1 : e < 2 ? 0.85 : 0.55; put(i, 4, L); put(4, i, L); } });
  frame('drop', 5, 7, (put) => { put(2, 1, 0.8); for (let y = 2; y < 6; y++) for (let x = 1; x < 4; x++) put(x, y, x === 1 && y < 4 ? 1 : y === 5 ? 0.45 : 0.7); });
  // speed streak (knockback / dash)
  frame('streak', 16, 3, (put) => { for (let x = 0; x < 16; x++) put(x, 1, x > 11 ? 1 : x > 5 ? 0.7 : 0.5, x < 4 ? (x % 2 ? 1 : 0) : 1); });

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  atlas = { tex, anims, canvas: cv, single: {} };
  return atlas;
}

// ------------------------------------------------------------------ instanced billboard layers
const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iUv;
attribute vec4 iCol;
attribute vec3 iSR;
varying vec2 vUv;
varying vec4 vCol;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  vec2 c = position.xy;
  float cs = cos(iSR.z), sn = sin(iSR.z);
  mv.xy += vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * iSR.xy;
  gl_Position = projectionMatrix * mv;
  vec2 uv = position.xy + 0.5;
  if (iSR.x < 0.0) uv.x = uv.x; // flipped quads mirror via negative width
  vUv = iUv.xy + uv * iUv.zw;
  vCol = iCol;
}`;
const FRAG = /* glsl */ `
uniform sampler2D map;
uniform float boost;
uniform float dither;
varying vec2 vUv;
varying vec4 vCol;
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float i = q.x + q.y * 4.0;
  // 4x4 Bayer matrix, row-major
  float m[16];
  m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k = 0; k < 16; k++) if (float(k) == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}
void main() {
  vec4 t = texture2D(map, vUv);
  if (t.a < 0.5) discard;
  float L = t.r;
  vec3 hot = vec3(1.0, 0.97, 0.86);
  // negative alpha = a "cool" particle (smoke, dust): highlights stay in the tint, no white-hot band
  vec3 col = (L >= 0.8 && vCol.a >= 0.0) ? mix(vCol.rgb, hot, (L - 0.8) / 0.2) : vCol.rgb * (0.32 + 0.85 * L);
  float a = abs(vCol.a);
  if (dither > 0.5) {
    if (a < bayer4(gl_FragCoord.xy / 2.0)) discard;
    gl_FragColor = vec4(col, 1.0);
  } else {
    gl_FragColor = vec4(col * boost * a, 1.0);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Layer {
  constructor(cap, additive) {
    this.cap = cap;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.getAttribute('position'));
    g.setAttribute('uv', base.getAttribute('uv'));
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aUv = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aSR = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iUv', this.aUv); g.setAttribute('iCol', this.aCol); g.setAttribute('iSR', this.aSR);
    g.instanceCount = 0;
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: atlas.tex }, boost: { value: additive ? 1.05 : 1 }, dither: { value: additive ? 0 : 1 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: additive, depthWrite: !additive, depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: !additive,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 8 : 2;
    this.list = [];
    this.free = []; // recycled particle records (no per-spawn allocation once warm)
  }
  update(dt, _c) {
    const L = this.list, F = this.free;
    let w = 0;
    const P = this.aPos.array, U = this.aUv.array, C = this.aCol.array, S = this.aSR.array;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.t += dt;
      if (p.t >= p.life) { F.push(p); continue; }
      p.vy += p.grav * dt;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.ground) { p.y = p.ground; p.vy = -p.vy * p.bounce; p.vx *= 0.6; p.vz *= 0.6; p.spin *= 0.5; }
      p.rot += p.spin * dt;
      const k = p.t / p.life;
      const fr = p.frames;
      const fi = p.fps ? Math.floor(p.t * p.fps) % fr.length : Math.min(fr.length - 1, Math.floor(k * fr.length));
      const f = fr[fi];
      const sc = p.scale * (1 + p.grow * p.t);
      const j = w;
      P[j * 3] = p.x; P[j * 3 + 1] = p.y; P[j * 3 + 2] = p.z;
      U[j * 4] = f.u; U[j * 4 + 1] = f.v; U[j * 4 + 2] = f.w; U[j * 4 + 3] = f.h;
      const fade = k < p.fadeIn ? k / p.fadeIn : k > p.fadeOut ? 1 - (k - p.fadeOut) / (1 - p.fadeOut) : 1;
      C[j * 4] = p.r; C[j * 4 + 1] = p.g; C[j * 4 + 2] = p.b; C[j * 4 + 3] = Math.max(0.001, fade) * p.alpha * (p.cool ? -1 : 1);
      // 90-degree snapped spin keeps the pixel grid square
      const rot = p.snap ? Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2) : p.rot;
      S[j * 3] = f.pw * TEX * sc * (p.flip ? -1 : 1); S[j * 3 + 1] = f.ph * TEX * sc; S[j * 3 + 2] = rot;
      L[w++] = p;
    }
    L.length = w;
    this.geo.instanceCount = w;
    this.aPos.needsUpdate = this.aUv.needsUpdate = this.aCol.needsUpdate = this.aSR.needsUpdate = true;
    this.aPos.clearUpdateRanges?.(); this.aUv.clearUpdateRanges?.(); this.aCol.clearUpdateRanges?.(); this.aSR.clearUpdateRanges?.();
  }
}

const _col = new THREE.Color();
class HitPix {
  constructor() {
    this.scene = null;
    this.layers = null;
    this.quality = 1;
  }
  attach(scene) {
    if (!atlas) buildAtlas();
    if (!this.layers) this.layers = { glow: new Layer(1400, true), solid: new Layer(1400, false) };
    for (const l of Object.values(this.layers)) { l.list.length = 0; l.geo.instanceCount = 0; if (l.mesh.parent) l.mesh.parent.remove(l.mesh); scene?.add(l.mesh); }
    this.scene = scene;
  }
  detach() {
    if (!this.layers) return;
    for (const l of Object.values(this.layers)) { l.list.length = 0; l.geo.instanceCount = 0; l.mesh.parent?.remove(l.mesh); }
    this.scene = null;
  }
  update(dt) {
    if (!this.layers) return;
    this.layers.glow.update(dt);
    this.layers.solid.update(dt);
  }
  get count() { return this.layers ? this.layers.glow.list.length + this.layers.solid.list.length : 0; }
  /** Spawn one sprite particle. */
  emit(layer, anim, o) {
    if (!this.layers || !atlas) return null;
    const Lr = this.layers[layer];
    // hard cap: a full layer drops the newest cosmetic bit instead of shifting the whole list
    if (Lr.list.length >= Lr.cap) return null;
    _col.set(o.color ?? 0xffffff);
    const p = Lr.free.pop() ?? {};
    p.x = o.x; p.y = o.y; p.z = o.z ?? 0; p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.grav = o.grav ?? 0; p.drag = o.drag ?? 0; p.ground = o.ground ?? -99; p.bounce = o.bounce ?? 0.3;
    p.t = 0; p.life = o.life ?? 0.4; p.fps = o.fps ?? 0;
    const fr = atlas.anims[anim];
    p.frames = o.frame != null ? (atlas.single[anim] ??= fr.map((f) => [f]))[o.frame % fr.length] : fr;
    p.scale = o.scale ?? 1; p.grow = o.grow ?? 0; p.flip = !!o.flip; p.rot = o.rot ?? 0; p.spin = o.spin ?? 0; p.snap = o.snap ?? false;
    p.r = _col.r; p.g = _col.g; p.b = _col.b; p.alpha = o.alpha ?? 1; p.cool = !!o.cool; p.fadeIn = o.fadeIn ?? 0; p.fadeOut = o.fadeOut ?? 0.7;
    Lr.list.push(p);
    return p;
  }
  /** 0..1 how full the busiest layer is: presets thin their extra bits out when the screen is crowded. */
  get load() {
    if (!this.layers) return 0;
    return Math.max(this.layers.glow.list.length / this.layers.glow.cap, this.layers.solid.list.length / this.layers.solid.cap);
  }

  // ---------------------------------------------------------------- presets
  /** Hit spark per damage kind. dir = +1 / -1 (the direction the blow travels). */
  hit(pos, kind = 'melee', scale = 1, dir = 1) {
    const s = scale;
    const z = (pos.z ?? 0) + 0.35;
    const K = HIT_KINDS[kind] ?? HIT_KINDS.melee;
    this.emit('solid', K.anim, { x: pos.x, y: pos.y, z, life: K.life ?? 0.22, scale: s * (K.size ?? 1), color: K.color, flip: dir < 0, rot: K.tilt ? dir * K.tilt : 0, fadeOut: 0.8 });
    const n = Math.round((K.bits ?? 5) * Math.min(2, s) * (this.load > 0.5 ? 0.4 : 1));
    for (let i = 0; i < n; i++) {
      const a = rnd(-1.1, 1.1) + (dir > 0 ? 0 : Math.PI), sp = rnd(2.5, 6) * Math.sqrt(s);
      this.emit(K.bitLayer ?? 'glow', K.bit ?? 'ember', { x: pos.x, y: pos.y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + rnd(1, 3), grav: K.bitGrav ?? -14, drag: 1.5, life: rnd(0.18, 0.4), scale: rnd(0.8, 1.3) * Math.min(1.6, s), color: pickc(K.bitColors ?? [K.color, 0xffffff]), ground: 0.02, fadeOut: 0.6 });
    }
    if (K.extra) K.extra(this, pos, s, dir, z);
  }
  /** Melee smear: a crescent swept in front of the attacker (dir: facing). */
  slash(pos, dir = 1, tint = 0xffffff, scale = 1) {
    this.emit('solid', 'slash', { x: pos.x + dir * 0.32 * scale, y: pos.y, z: (pos.z ?? 0) + 0.4, life: 0.16, scale: scale * 0.85, color: tint, flip: dir < 0, fadeOut: 0.75 });
  }
  /**
   * Claw rake: three parallel curved marks across the struck point. dir = the way the attacker faces,
   * side = which paw (+1 the forward swat, -1 the pull-back rake: mirrored), tint, scale.
   */
  rake(pos, dir = 1, side = 1, tint = 0xffffff, scale = 1) {
    const z = pos.z ?? 0;
    this.emit('solid', 'rake', { x: pos.x, y: pos.y, z, life: 0.34, scale, color: tint, flip: (dir < 0) !== (side < 0), fadeOut: 0.85 });
    // a few hot bits flicked off along the swipe
    const n = this.load > 0.5 ? 1 : 3, sx = (side < 0 ? -1 : 1) * dir;
    for (let i = 0; i < n; i++) this.emit('glow', 'ember', { x: pos.x + rnd(-0.2, 0.2) * scale, y: pos.y + rnd(-0.25, 0.2) * scale, z, vx: sx * rnd(1.5, 3.5), vy: rnd(-2.5, 0.5), grav: -8, drag: 1.5, life: rnd(0.16, 0.3), scale: rnd(0.9, 1.3), color: i ? 0xffffff : tint, fadeOut: 0.5 });
  }
  /** Launch flash at a muzzle (dir: shot direction). */
  muzzle(pos, dir = 1, tint = 0xffe27a, scale = 1) {
    this.emit('solid', 'muzzle', { x: pos.x + dir * 0.14 * scale, y: pos.y, z: (pos.z ?? 0) + 0.3, life: 0.12, scale: scale * 0.8, color: tint, flip: dir < 0, fadeOut: 0.8 });
    this.emit('solid', 'puff2', { x: pos.x + dir * 0.1, y: pos.y, z: (pos.z ?? 0) + 0.25, vx: dir * 0.8, vy: 0.5, drag: 3, life: 0.4, scale: scale * 0.35, color: 0xd8dce6, fadeOut: 0.5, cool: true });
  }
  /** Kicked-up dust puffs rolling along the ground. */
  dust(pos, o = {}) {
    const n = o.count ?? 3, s = o.scale ?? 1;
    for (let i = 0; i < n; i++) {
      const vx = (o.vx ?? 0) + rnd(-1, 1) * (o.spread ?? 1.2);
      this.emit('solid', i % 2 ? 'puff' : 'puff2', { x: pos.x + rnd(-0.15, 0.15) * s, y: 0.12 + rnd(0, 0.1) * s, z: (pos.z ?? 0) + rnd(-0.1, 0.3), vx, vy: rnd(0.2, 0.9), drag: 2.5, life: rnd(0.4, 0.7) * (o.life ?? 1), scale: rnd(0.4, 0.65) * s, color: o.color ?? pickc([0xe8dcc0, 0xd8c4a0, 0xf2ead8]), fadeOut: 0.5, cool: true });
    }
  }
  /** Rolling smoke (grey by default). */
  smoke(pos, o = {}) {
    const n = o.count ?? 4, s = o.scale ?? 1;
    for (let i = 0; i < n; i++) {
      this.emit('solid', i % 2 ? 'puff' : 'puff2', { x: pos.x + rnd(-0.4, 0.4) * (o.radius ?? 1), y: pos.y + rnd(0, 0.4), z: (pos.z ?? 0) + rnd(-0.2, 0.5), vx: rnd(-0.6, 0.6) + (o.vx ?? 0), vy: rnd(0.6, 1.8) * (o.rise ?? 1), drag: 1.2, life: rnd(0.9, 1.6) * (o.life ?? 1), scale: rnd(0.8, 1.3) * s, grow: o.grow ?? 0.5, color: o.color ?? pickc(o.colors ?? [0x8a8698, 0x6a6678, 0xa8a4b4]), fadeOut: 0.55, fadeIn: 0.05, cool: true });
    }
  }
  /** Flickering flames licking upward. */
  fire(pos, o = {}) {
    const n = o.count ?? 4, s = o.scale ?? 1;
    for (let i = 0; i < n; i++) {
      this.emit('solid', 'flame', { x: pos.x + rnd(-0.5, 0.5) * (o.radius ?? 1), y: pos.y + rnd(0, 0.3), z: (pos.z ?? 0) + rnd(0, 0.5), vx: rnd(-0.3, 0.3), vy: rnd(0.6, 1.6), drag: 1, life: rnd(0.4, 0.8) * (o.life ?? 1), fps: 12, scale: rnd(0.7, 1.2) * s, color: pickc(o.colors ?? [0xff5a1a, 0xff7a1a, 0xffa31a]), fadeOut: 0.6 });
    }
    if (o.embers !== false) this.embers(pos, { count: Math.ceil(n / 2), scale: s });
  }
  embers(pos, o = {}) {
    const n = o.count ?? 4, s = o.scale ?? 1;
    for (let i = 0; i < n; i++) this.emit('glow', 'ember', { x: pos.x + rnd(-0.4, 0.4) * s, y: pos.y + rnd(0, 0.5) * s, z: (pos.z ?? 0) + rnd(0, 0.5), vx: rnd(-0.8, 0.8), vy: rnd(1, 3), grav: 0.5, drag: 1, life: rnd(0.5, 1.1), scale: rnd(0.9, 1.4), color: pickc(o.colors ?? [0xffa31a, 0xffd23f, 0xff5a1a]), fadeOut: 0.5 });
  }
  /** Radial glowing sparks (flying 4-point twinkles + embers). */
  sparks(pos, o = {}) {
    const n = o.count ?? 8, s = o.scale ?? 1, sp = o.speed ?? 5;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(0.4, 1) * sp;
      this.emit('glow', i % 3 ? 'ember' : 'twinkle', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + rnd(0, 0.5), vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 + (o.up ?? 2), grav: o.grav ?? -10, drag: 1.2, life: rnd(0.3, 0.7) * (o.life ?? 1), scale: rnd(0.8, 1.3) * s, color: pickc(o.colors ?? [0xffd23f, 0xffffff, 0xffa31a]), ground: 0.02, bounce: 0.4, fadeOut: 0.6 });
    }
  }
  /** Explosion: fireball frames + sparks + rolling smoke. */
  boom(pos, o = {}) {
    const s = o.scale ?? 1;
    this.emit('solid', 'boom', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + 0.5, life: 0.55 * (o.life ?? 1), scale: 1.5 * s, color: o.color ?? 0xff6a1a, fadeOut: 0.8 });
    // a hot additive core flash for the first instant
    this.emit('glow', 'star', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + 0.6, life: 0.12, scale: 1.2 * s, color: 0xffb02e, alpha: 0.7, fadeOut: 0.3 });
    for (let i = 0; i < (o.flames ?? 3); i++) this.emit('solid', 'boom', { x: pos.x + rnd(-0.7, 0.7) * s, y: pos.y + rnd(-0.3, 0.6) * s, z: (pos.z ?? 0) + rnd(0.2, 0.7), vy: rnd(0.3, 1.2), life: rnd(0.35, 0.55), scale: rnd(0.7, 1.1) * s, color: pickc([0xff5a1a, 0xff8a1a, 0xe8401a]), fadeOut: 0.8 });
    this.sparks(pos, { count: Math.round(10 * s), scale: 1, speed: 6 * Math.sqrt(s) });
    this.smoke(pos.clone ? pos.clone().setY(pos.y + 0.2) : pos, { count: Math.round(4 * s), scale: 0.9 * s, radius: s, colors: [0x5a5468, 0x46404f, 0x6e687c] });
  }
  /** Cartoon KO poof: cloud burst + twinkles (tint = cloud colour). */
  poof(pos, o = {}) {
    const s = o.scale ?? 1;
    this.emit('solid', 'poof', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + 0.45, vy: 0.4, life: 0.5, scale: 1.2 * s, color: o.color ?? 0xd4cce8, fadeOut: 0.95, cool: true });
    for (let i = 0; i < 3; i++) this.emit('glow', 'twinkle', { x: pos.x + rnd(-0.5, 0.5) * s, y: pos.y + rnd(-0.2, 0.6) * s, z: (pos.z ?? 0) + 0.6, vy: rnd(0.5, 1.4), life: rnd(0.3, 0.55), scale: rnd(0.9, 1.4), color: o.spark ?? 0xffe27a, fadeOut: 0.5 });
  }
  /** Chunky debris chips (solid, bouncing). */
  chips(pos, o = {}) {
    const n = o.count ?? 6, s = o.scale ?? 1;
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), v = rnd(0.4, 1) * (o.speed ?? 4);
      this.emit('solid', o.anim ?? 'chip', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + rnd(0, 0.4), vx: Math.cos(a) * v + (o.vx ?? 0), vy: Math.abs(Math.sin(a)) * v + rnd(1, 3) * (o.up ?? 1), grav: -16, drag: 0.4, ground: 0.03, bounce: 0.35, life: rnd(0.6, 1.1) * (o.life ?? 1), scale: rnd(0.8, 1.5) * s, spin: rnd(-14, 14), snap: true, color: pickc(o.colors ?? [0xd8c4a0]), fadeOut: 0.75 });
    }
  }
  /** Goo splash (tinted). */
  splat(pos, o = {}) {
    const s = o.scale ?? 1;
    this.emit('solid', 'splat', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + 0.4, life: 0.3, scale: s * 0.6, color: o.color ?? 0x7cff3a, fadeOut: 0.85 });
    for (let i = 0; i < Math.round(4 * s); i++) this.emit('solid', 'drop', { x: pos.x, y: pos.y, z: (pos.z ?? 0) + 0.4, vx: rnd(-3, 3), vy: rnd(1.5, 4), grav: -16, ground: 0.03, life: rnd(0.35, 0.6), scale: rnd(0.8, 1.2), color: o.color ?? 0x7cff3a, fadeOut: 0.7 });
  }
  /** Projectile trail bit: one short-lived pixel (ember / twinkle / flame / puff) left behind a shot. */
  trail(pos, kind, tint, o = {}) {
    const z = pos.z ?? 0;
    if (kind === 'smoke') this.emit('solid', 'puff2', { x: pos.x, y: pos.y, z, vy: 0.4, drag: 2, life: 0.45, scale: o.scale ?? 0.32, grow: 0.8, color: tint, fadeOut: 0.4, cool: true });
    else if (kind === 'flame') this.emit('solid', 'flame', { x: pos.x, y: pos.y, z, vy: 0.6, life: 0.22, fps: 16, scale: o.scale ?? 0.55, color: tint, fadeOut: 0.5 });
    else this.emit('glow', kind === 'twinkle' ? 'twinkle' : 'ember', { x: pos.x + rnd(-0.03, 0.03), y: pos.y + rnd(-0.03, 0.03), z, vy: o.vy ?? 0, grav: o.grav ?? 0, life: o.life ?? 0.2, scale: o.scale ?? 1.2, color: tint, fadeOut: 0.3 });
  }
  /** Landing thud: a pair of dust puffs squirting out left + right along the ground (platformer-style), plus a pebble or two. */
  landPuff(pos, o = {}) {
    const s = o.scale ?? 1, z = (pos.z ?? 0) + 0.3, col = o.color ?? 0xf2ead8;
    for (const d of [-1, 1]) {
      this.emit('solid', d < 0 ? 'puff' : 'puff2', { x: pos.x + d * 0.12 * s, y: 0.1 + 0.04 * s, z, vx: d * rnd(1.5, 2) * Math.sqrt(s), vy: rnd(0.25, 0.5), drag: 4.5, life: 0.42, scale: 0.42 * s, color: col, flip: d < 0, fadeOut: 0.4, cool: true });
      this.emit('solid', 'chip', { x: pos.x + d * 0.08, y: 0.1, z: z + 0.05, vx: d * rnd(0.8, 1.6), vy: rnd(1.6, 2.6), grav: -16, ground: 0.03, bounce: 0.3, life: 0.45, scale: 0.6, spin: d * 12, snap: true, color: o.chip ?? 0xd8c4a0, fadeOut: 0.6 });
    }
  }
  /** Melee clash: a little pixel dust kick at the feet between two fighters. */
  clash(pos, dir = 1, o = {}) {
    const s = o.scale ?? 1;
    this.emit('solid', 'puff2', { x: pos.x, y: 0.1 + 0.05 * s, z: (pos.z ?? 0) + 0.2, vx: dir * 0.6, vy: 0.5, drag: 3, life: 0.36, scale: 0.42 * s, color: o.color ?? 0xe8dcc0, fadeOut: 0.45, cool: true });
    for (let i = 0; i < 2; i++) this.emit('solid', 'chip', { x: pos.x, y: 0.12, z: (pos.z ?? 0) + 0.25, vx: dir * rnd(0.5, 2) + rnd(-0.6, 0.6), vy: rnd(1.6, 3), grav: -14, ground: 0.03, life: rnd(0.3, 0.5), scale: rnd(0.6, 0.9), spin: rnd(-10, 10), snap: true, color: o.color ?? 0xd8c4a0, fadeOut: 0.6 });
  }
  /** Horizontal speed streaks (knockback / dash), dir = travel direction. */
  streaks(pos, dir = 1, o = {}) {
    for (let i = 0; i < (o.count ?? 3); i++) this.emit('glow', 'streak', { x: pos.x - dir * rnd(0.1, 0.5), y: pos.y + rnd(-0.3, 0.3) * (o.h ?? 1), z: (pos.z ?? 0) + 0.4, vx: -dir * rnd(1.5, 3), drag: 3, life: rnd(0.14, 0.24), scale: rnd(0.8, 1.2) * (o.scale ?? 1), color: o.color ?? 0xffffff, flip: dir > 0, fadeOut: 0.4 });
  }
}

// damage kind -> spark look
const HIT_KINDS = {
  melee: { anim: 'star', color: 0xffe27a, bits: 5 },
  heavy: { anim: 'star', color: 0xffb02e, size: 1.5, bits: 8 },
  crit: { anim: 'star', color: 0xff5a3a, size: 1.8, bits: 10, life: 0.28 },
  // per attack style (view.js picks one from the attacker): claw / slash rakes, punch POW, bite chomp, bullet ping, magic sparkle
  claw: { anim: 'claw', color: 0xfff2c8, size: 0.85, bits: 3, life: 0.2, bitColors: [0xffffff, 0xffe27a] },
  punch: { anim: 'pow', color: 0xffd84a, size: 0.8, bits: 4, life: 0.2, bit: 'chip', bitLayer: 'solid', bitColors: [0xffffff, 0xffd84a, 0xffa31a] },
  bite: { anim: 'chomp', color: 0xffffff, size: 0.75, bits: 2, life: 0.24, bitColors: [0xffffff, 0xffe27a] },
  bullet: { anim: 'ping', color: 0xfff0a0, size: 0.8, bits: 3, life: 0.14 },
  magic: { anim: 'magic', color: 0xd08aff, size: 0.85, bits: 4, life: 0.26, bit: 'twinkle', bitGrav: -2, bitColors: [0xffffff, 0xd08aff, 0x9ff2ff] },
  ice: { anim: 'magic', color: 0x9ff2ff, size: 0.8, bits: 4, life: 0.24, bit: 'shard', bitLayer: 'solid', bitColors: [0xffffff, 0xcff6ff, 0x9fe6ff] },
  thorns: { anim: 'claw', color: 0x9adf5a, size: 0.6, bits: 3, life: 0.18, bit: 'shard', bitLayer: 'solid', bitColors: [0x6ab83a, 0x9adf5a, 0xd8ffb0] },
  venom: { anim: 'splat', color: 0x62d834, bits: 0, extra: (P, pos, s) => P.splat(pos, { color: 0x62d834, scale: s * 0.6 }) },
  sludge: { anim: 'splat', color: 0x8fb23a, bits: 0, extra: (P, pos, s) => P.splat(pos, { color: 0x8fb23a, scale: s * 0.8 }) },
  acid: { anim: 'splat', color: 0x7cff3a, bits: 0, extra: (P, pos, s) => P.splat(pos, { color: 0x7cff3a, scale: s * 0.8 }) },
  fries: { anim: 'star', color: 0xffd23f, bits: 6, bit: 'chip', bitLayer: 'solid', bitColors: [0xffd23f, 0xf7c873, 0xe8a83a] },
  fire: { anim: 'star', color: 0xff7a1a, bits: 4, extra: (P, pos, s) => P.fire(pos, { count: 3, scale: s * 0.8, radius: 0.4 }) },
  burn: { anim: 'flame', color: 0xff7a1a, bits: 2, extra: (P, pos, s) => P.fire(pos, { count: 2, scale: s * 0.6, radius: 0.3, embers: false }) },
  zap: { anim: 'zap', color: 0x7ff2ff, bits: 6, bitColors: [0x9ff2ff, 0xffffff, 0xff4fd8] },
  laser: { anim: 'zap', color: 0xff4fd8, bits: 6, bitColors: [0xff9af0, 0xffffff] },
  nuke: { anim: 'zap', color: 0x7cff3a, bits: 6, bitColors: [0xd4ff9a, 0xffffff] },
  money: { anim: 'star', color: 0x6fdc7a, bits: 6, bit: 'chip', bitLayer: 'solid', bitColors: [0x3fbf4f, 0x6fdc7a, 0xffd23f] },
  turretBolt: { anim: 'ping', color: 0x9fe0ff, bits: 4 },
  labCannon: { anim: 'star', color: 0xffd23f, size: 1.4, bits: 8 },
  soda: { anim: 'splat', color: 0xc8742a, bits: 0, extra: (P, pos, s) => P.splat(pos, { color: 0xe0a060, scale: s * 0.7 }) },
};
export const HIT_KIND_NAMES = Object.keys(HIT_KINDS);

export const hpx = new HitPix();
if (typeof window !== 'undefined' && import.meta.env?.DEV) window.__hpx = hpx;
/** Dev: the sprite atlas canvas (for inspection). */
export const hitPixAtlas = () => (atlas ?? buildAtlas()).canvas;
