// Lab interior (hub room) props: specimen tanks, consoles, workstations,
// pipes, the workbench, shelves, vial racks, the door, the monitor wall, floor
// tiles and wall panels. Everything is voxel (cached geometry); screens are
// regions of one shared pixel-art canvas atlas (nearest filtering) that the
// lab animates with tickLabScreens().
import {
  THREE, VoxGrid, Mats, makeMesh, PAL, shade, mixHex, hash3, ring, text, vmesh, glassMat,
  group, hazardC, instanced,
} from './common.js';
import { aoMesh, aoGeometry, dense } from './voxmesh.js';
import { chain } from '../kit.js';

const S = { scale: 0.1 };
const wrap = (m, name) => { const r = group(m); r.name = name; return r; };
const SCREW = 0xe8edf4;

// ---------------------------------------------------------------------------
// Small brushes

/** Pipe along an axis with a highlight stripe and optional flanged joints. */
export function tube(g, axis, a0, a1, cu, cv, r, col, o = {}) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
  g.cylinder(cu, cv, lo, hi, r, col, axis);
  const hl = shade(col, 0.24), sh = shade(col, -0.2);
  for (let a = lo; a <= hi; a++) {
    if (axis === 'x') { g.set(a, cu + r, cv, hl); g.set(a, cu - r, cv, sh); }
    else if (axis === 'z') { g.set(cu, cv + r, a, hl); g.set(cu, cv - r, a, sh); }
    else { g.set(cu - Math.max(1, r - 1), a, cv + r, hl); }
  }
  if (o.every) {
    const fl = o.flange ?? PAL.metalD;
    for (let a = lo + (o.off ?? 3); a <= hi - 1; a += o.every) {
      g.cylinder(cu, cv, a, a + 1, r + 1, fl, axis);
      if (r >= 2) {
        const put = (du, dv) => {
          if (axis === 'x') g.set(a, cu + du, cv + dv, SCREW);
          else if (axis === 'z') g.set(cu + du, cv + dv, a, SCREW);
          else g.set(cu + du, a, cv + dv, SCREW);
        };
        put(r + 1, 0); put(-r - 1, 0); put(0, r + 1); put(0, -r - 1);
      }
    }
  }
  return g;
}

/** Round dial gauge on a +z face centred (cx, cy): rim, red zone, needle, body behind. */
export function gaugeZ(g, cx, cy, z, r = 3, o = {}) {
  const rim = o.rim ?? PAL.metalDD, face = o.face ?? 0xf6f8fc;
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.45) continue;
      const a = Math.atan2(dy, dx);
      let c = d > r - 0.6 ? rim : face;
      if (c === face && d > r - 1.7 && a > -0.2 && a < 0.9) c = PAL.red;
      g.set(cx + dx, cy + dy, z, c);
    }
  const a = o.angle ?? 2.3;
  for (let i = 1; i < r; i++) g.set(cx + Math.round(Math.cos(a) * i), cy + Math.round(Math.sin(a) * i), z + 1, o.needle ?? PAL.red);
  g.set(cx, cy, z + 1, PAL.ink);
  if (o.body !== false) g.cylinder(cx, cy, z - (o.depth ?? 2), z - 1, Math.max(1, r - 1), PAL.metalD, 'z');
  return g;
}

/** Spoked valve hand-wheel facing +z (or 'y' = lying flat, facing up). */
export function valve(g, cx, cy, z, r = 3, col = PAL.red, plane = 'z') {
  const put = (u, v, c) => (plane === 'z' ? g.set(cx + u, cy + v, z, c) : g.set(cx + u, cy, z + v, c));
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    put(Math.round(Math.cos(t) * r), Math.round(Math.sin(t) * r), col);
  }
  for (let i = -r + 1; i < r; i++) { put(i, 0, shade(col, -0.15)); put(0, i, shade(col, -0.15)); }
  put(0, 0, PAL.metalL);
  return g;
}

/** Recolour the frontmost voxel under each text pixel (text on curved fronts). */
function stampText(g, str, cx, y, color, zmax, o = {}) {
  const t = new VoxGrid();
  text(t, str, cx, y, 0, '+z', color, { center: true, ...o });
  t.forEach((x, yy) => {
    for (let z = zmax; z >= -zmax; z--) if (g.has(x, yy, z)) { g.set(x, yy, z, color, !!o.glow); break; }
  });
  return g;
}

// ---------------------------------------------------------------------------
// Animated pixel-art screens. Every lab screen is a region of one shared
// canvas atlas (nearest filtering, unlit, below the bloom threshold) that is
// redrawn ~8 times a second by tickLabScreens().

const ATLAS = 256;
const PXU = 30; // atlas pixels per world unit
const SCR = { tex: null, ctx: null, mat: null, regions: new Map(), geos: new Map(), list: [], sx: 0, sy: 0, sh: 0, last: -1 };
const FONT = new Map();
function glyphPts(str) {
  let p = FONT.get(str);
  if (!p) {
    const g = new VoxGrid();
    text(g, str, 0, 0, 0, '+z', 1);
    p = [];
    g.forEach((x, y) => p.push([x, 4 - y]));
    FONT.set(str, p);
  }
  return p;
}
function atlas() {
  if (SCR.tex) return SCR;
  const c = document.createElement('canvas');
  c.width = c.height = ATLAS;
  SCR.ctx = c.getContext('2d');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  SCR.tex = t;
  SCR.mat = new THREE.MeshBasicMaterial({ map: t, toneMapped: false });
  return SCR;
}
function region(key, w, h) {
  let r = SCR.regions.get(key);
  if (r) return r;
  if (SCR.sx + w > ATLAS) { SCR.sx = 0; SCR.sy += SCR.sh; SCR.sh = 0; }
  if (SCR.sy + h > ATLAS) r = { x: 0, y: 0, w: Math.min(w, ATLAS), h: Math.min(h, ATLAS), shared: true };
  else { r = { x: SCR.sx, y: SCR.sy, w, h }; SCR.sx += w; SCR.sh = Math.max(SCR.sh, h); }
  SCR.regions.set(key, r);
  return r;
}

const CSS = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');
function drawScreen(r, t) {
  const c = SCR.ctx;
  const { x: X, y: Y, w: W, h: H } = r;
  const s = r.seed;
  c.save();
  c.beginPath();
  c.rect(X, Y, W, H);
  c.clip();
  const P = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(X + Math.round(x), Y + Math.round(y), w, h); };
  const T = (str, x, y, col, k = 1) => { for (const [u, v] of glyphPts(str)) P(x + u * k, y + v * k, k, k, col); };
  const scan = () => { for (let y = 1; y < H; y += 2) { c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(X, Y + y, W, 1); } };
  const kind = r.kind;
  if (kind === 'ekg') {
    P(0, 0, W, H, '#06261a');
    for (let y = 2; y < H; y += 4) for (let x = 2; x < W; x += 4) P(x, y, 1, 1, '#0d4a2a');
    const mid = Math.round(H * 0.62);
    const beat = (p) => (p < 2 ? 0 : p < 3 ? 2 : p < 4 ? -H * 0.36 : p < 5 ? H * 0.22 : p < 6 ? 0 : p < 9 ? -1.5 : 0);
    const head = Math.floor(t * 22) % W;
    let py = mid;
    for (let i = 0; i < W; i++) {
      const age = (head - i + W) % W;
      if (age > W - 6) continue;
      const y = Math.round(mid + beat((i + s * 7) % 22));
      const col = age < 2 ? '#ffffff' : age < W * 0.5 ? '#6dff7a' : '#2fa84a';
      const y0 = Math.min(y, py), y1 = Math.max(y, py);
      P(i, y0, 1, y1 - y0 + 1, col);
      py = y;
    }
    T('BPM', 2, 2, '#3fd860');
    T(String(118 + Math.round(Math.sin(t * 0.7 + s) * 6)), W - 12, 2, '#b8ffbf');
  } else if (kind === 'dna') {
    P(0, 0, W, H, '#0b0f2e');
    const mid = H / 2, amp = H * 0.34;
    for (let i = 0; i < W; i++) {
      const a = i * 0.32 + t * 3 + s;
      const y1 = Math.round(mid + Math.sin(a) * amp), y2 = Math.round(mid - Math.sin(a) * amp);
      const front = Math.cos(a) > 0;
      if (i % 4 === 0) P(i, Math.min(y1, y2), 1, Math.abs(y2 - y1), '#3a3f7a');
      P(i, y1, 1, 2, front ? '#ff4fa3' : '#9a2a6a');
      P(i, y2, 1, 2, front ? '#2a8aa0' : '#5ce1e6');
    }
  } else if (kind === 'radar') {
    P(0, 0, W, H, '#031a0e');
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    for (let k = 1; k <= 3; k++) for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      P(cx + Math.cos(a) * R * k / 3, cy + Math.sin(a) * R * k / 3, 1, 1, '#0f5a2e');
    }
    P(cx - R, cy, R * 2, 1, '#0f5a2e');
    P(cx, cy - R, 1, R * 2, '#0f5a2e');
    const sw = t * 2.2 + s;
    for (let i = 0; i < R; i++) P(cx + Math.cos(sw) * i, cy + Math.sin(sw) * i, 1, 1, '#7dff9a');
    for (let k = 0; k < 4; k++) {
      const ba = hash3(k, s, 3) * Math.PI * 2, br = R * (0.3 + hash3(k, s, 5) * 0.6);
      const d = ((sw - ba) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      if (d < 2.5) P(cx + Math.cos(ba) * br - 1, cy + Math.sin(ba) * br - 1, 2, 2, d < 0.6 ? '#ffffff' : '#3fd860');
    }
  } else if (kind === 'scan' || kind === 'tankcam') {
    const cam = kind === 'tankcam';
    P(0, 0, W, H, cam ? '#0b3a6a' : '#10162e');
    if (cam) for (let k = 0; k < 14; k++) {
      const bx = hash3(k, 1, s) * W, sp = 6 + hash3(k, 2, s) * 10;
      P(bx + Math.sin(t * 3 + k) * 1.5, H - ((t * sp + hash3(k, 3, s) * H) % H), 1, 1, '#bff2ff');
    }
    // pixel Beast Tiger head
    const S = Math.max(1, Math.floor(Math.min(W / 16, H / 12)));
    const ox = Math.round(W / 2 - 6 * S), oy = Math.round(H / 2 - 5 * S) + (cam ? Math.round(Math.sin(t * 1.4) * S) : 0);
    const art = ['k..........k', 'ok........ko', 'oookkkkkkooo', 'oooooooooooo', 'okoowooowook', 'oowkwoowkwoo', 'ooowwwwwwooo', 'okowwnnwwoko', '.oowwwwwwoo.', '..ookkkkoo..'];
    const pal = { o: cam ? '#2a5a8a' : '#ff9a2a', k: cam ? '#123a66' : '#1a1020', w: cam ? '#3f74a6' : '#fff4e0', n: cam ? '#123a66' : '#ff4fa3' };
    art.forEach((row, v) => [...row].forEach((ch, u) => { if (pal[ch]) P(ox + u * S, oy + v * S, S, S, pal[ch]); }));
    if (cam) {
      if (Math.floor(t * 2) % 2) P(2, 2, 3, 3, '#ff3040');
      T('LIVE', 7, 1, '#ffffff');
    } else {
      const sy = Math.floor((t * 14) % H);
      P(0, sy, W, 1, '#5ce1e6');
      P(0, sy - 1, W, 1, '#2a7a8a');
      T(String(Math.floor((t * 9) % 100)).padStart(2, '0') + '%', 2, H - 7, '#5ce1e6');
    }
  } else if (kind === 'bars') {
    P(0, 0, W, H, '#1a0a24');
    T('MEGA', 2, 2, '#ff4fa3');
    const n = Math.max(3, Math.floor((W - 2) / 4));
    for (let i = 0; i < n; i++) {
      const v = 0.35 + 0.6 * Math.abs(Math.sin(t * (1.3 + i * 0.37) + i * 1.7 + s));
      const bh = Math.round(v * (H - 11));
      for (let y = 0; y < bh; y++) P(2 + i * 4, H - 2 - y, 3, 1, y > (H - 11) * 0.66 ? '#ffd23f' : y > (H - 11) * 0.33 ? '#ff8ac0' : '#ff2e88');
    }
  } else if (kind === 'subs') {
    P(0, 0, W, H, '#2a0710');
    P(2, 2, 9, 7, '#ff1a2e');
    P(5, 4, 1, 3, '#ffffff'); P(6, 4, 1, 3, '#ffffff'); P(7, 5, 1, 1, '#ffffff');
    T('SUBS', 13, 3, '#ffd6dc');
    const n = String(Math.floor(400000000 + t * 13 + s * 1e5));
    const k = W >= 4 * n.length + 4 ? 1 : 1;
    T(n.slice(-Math.floor((W - 4) / 4)), 2, H - 8, '#ffffff', k);
    if (Math.floor(t * 3) % 2) P(W - 4, 2, 2, 2, '#ffd23f');
  } else if (kind === 'wave') {
    P(0, 0, W, H, '#1c1806');
    for (let x = 0; x < W; x += 6) P(x, 0, 1, H, '#2e2810');
    P(0, Math.floor(H / 2), W, 1, '#2e2810');
    let py = null;
    for (let i = 0; i < W; i++) {
      const y = Math.round(H / 2 + (Math.sin(i * 0.4 + t * 5 + s) * 0.6 + Math.sin(i * 1.3 - t * 7) * 0.25) * H * 0.38);
      if (py !== null) P(i, Math.min(y, py), 1, Math.abs(y - py) + 1, '#ffd23f');
      py = y;
    }
  } else if (kind === 'warn') {
    const on = Math.floor(t * 2.5 + s) % 2 === 0;
    P(0, 0, W, H, on ? '#2a1a04' : '#140c02');
    for (let i = -H; i < W + H; i++) for (let k = 0; k < 2; k++) if (((i >> 2) & 1) === 0) { P(i + k, k, 1, 1, '#ffd23f'); P(i + k - H + 2, H - 2 + k, 1, 1, '#ffd23f'); }
    if (on) { T('!', W / 2 - 0.5, H / 2 - 3, '#ff3040', Math.max(1, Math.floor(H / 12))); }
    else T('MEGA', Math.round(W / 2 - 7), Math.round(H / 2 - 2), '#ffd23f');
  } else if (kind === 'code') {
    P(0, 0, W, H, '#0a0f1a');
    const off = Math.floor(t * 6);
    const cols = ['#5ce1e6', '#ff8ac0', '#ffd23f', '#7cff3a', '#b8c0cc'];
    for (let row = 0; row < H / 3; row++) {
      const id = row + off;
      let x = 2 + Math.floor(hash3(id, 1, s) * 3) * 2;
      while (x < W - 3) {
        const len = 2 + Math.floor(hash3(id, x, s) * 7);
        P(x, row * 3 + 1, Math.min(len, W - 2 - x), 1, cols[Math.floor(hash3(id, x, 9) * cols.length)]);
        x += len + 2;
        if (hash3(id, x, 4) < 0.25) break;
      }
    }
    if (Math.floor(t * 3) % 2) P(2, H - 3, 3, 1, '#ffffff');
  } else if (kind === 'map') {
    P(0, 0, W, H, '#0d4f8a');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot((x - W * 0.5) / (W * 0.36), (y - H * 0.55) / (H * 0.36)) + (hash3(x >> 1, y >> 1, 7) - 0.5) * 0.18;
      if (d < 1) P(x, y, 1, 1, d < 0.45 ? '#2f9a3a' : d < 0.85 ? '#5fbf4a' : '#f4e2b0');
      else if (d < 1.12) P(x, y, 1, 1, '#2fd4d8');
    }
    if (Math.floor(t * 2) % 2) P(W * 0.5 - 1, H * 0.5 - 1, 3, 3, '#ff2e88');
    T('ISLAND', 2, 2, '#ffffff');
  } else {
    // 'swarm': the big lab screen - logo, bouncing Swarm face, waveform
    P(0, 0, W, H, '#141c44');
    for (let y = 0; y < H; y += 3) P(0, y, W, 1, '#18215a');
    for (let k = 0; k < 10; k++) if (hash3(k, Math.floor(t * 2), s) < 0.5) P(hash3(k, 1, s) * W, hash3(k, 2, s) * H * 0.5, 1, 1, '#8fe3ff');
    const tw = 6 * 4 * 2 - 2;
    const k2 = W > tw + 30 ? 2 : 1;
    T('SWARM', Math.round(W / 2 - (19 * k2) / 2), 3, '#ff4fa3', k2);
    const S2 = Math.max(1, Math.floor(H / 22));
    const fx = Math.round(W / 2 - 6 * S2), fy = Math.round(H * 0.42 + Math.abs(Math.sin(t * 3)) * -3 * S2);
    const face = ['.bb......bb.', 'bbbb....bbbb', 'bbbbbbbbbbbb', 'bwwbbbbbbwwb', 'bwkbpbbpbkwb', 'bbbbbppbbbbb', 'bbbwwwwwwbbb', '.bbbwkkwbbb.', '..bbbbbbbb..'];
    const fp = { b: '#29b6f6', w: '#ffffff', k: '#15121f', p: '#ff2e88' };
    face.forEach((row, v) => [...row].forEach((ch, u) => { if (fp[ch]) P(fx + u * S2, fy + v * S2, S2, S2, fp[ch]); }));
    let py = null;
    for (let i = 0; i < W; i++) {
      const y = Math.round(H - 5 + Math.sin(i * 0.5 - t * 6) * 2);
      if (py !== null) P(i, Math.min(y, py), 1, Math.abs(y - py) + 1, '#5ce1e6');
      py = y;
    }
  }
  scan();
  c.restore();
}

/**
 * An animated pixel screen (w x h world units, facing +z) showing `kind`:
 * ekg | dna | radar | scan | tankcam | bars | subs | wave | warn | code | map | swarm.
 * Screens of the same kind/size/seed share their atlas region.
 */
export function labScreen(kind, w, h, o = {}) {
  atlas();
  const pw = Math.max(8, Math.round(w * PXU)), ph = Math.max(8, Math.round(h * PXU));
  const seed = o.seed ?? 0;
  const r = region(`${kind}|${pw}x${ph}|${seed}`, pw, ph);
  if (!r.kind) {
    r.kind = kind;
    r.seed = seed;
    SCR.list.push(r);
    drawScreen(r, 0);
    SCR.tex.needsUpdate = true;
  }
  const gk = `${kind}|${pw}x${ph}|${seed}|${w}|${h}`;
  let geo = SCR.geos.get(gk);
  if (!geo) {
    geo = new THREE.PlaneGeometry(w, h);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      uv.setXY(i, (r.x + u * r.w) / ATLAS, 1 - (r.y + (1 - v) * r.h) / ATLAS);
    }
    SCR.geos.set(gk, geo);
  }
  const m = new THREE.Mesh(geo, SCR.mat);
  m.name = 'screen:' + kind;
  return m;
}
/** Redraw the screen atlas (throttled to ~8 fps, safe to call every frame from several places). */
export function tickLabScreens() {
  if (!SCR.tex) return;
  const now = performance.now() / 1000;
  if (now - SCR.last < 0.125) return;
  SCR.last = now;
  for (const r of SCR.list) drawScreen(r, now);
  SCR.tex.needsUpdate = true;
}
/** Put a screen on a voxel grid's +z face: (x0, y0) bottom-left voxel, w x h voxels, face at voxel z (front of that voxel). */
function screenAt(kind, x0, y0, w, h, z, vox = 0.1, o = {}) {
  const m = labScreen(kind, w * vox, h * vox, o);
  m.position.set((x0 + w / 2) * vox, (y0 + h / 2) * vox, (z + 1) * vox + 0.004);
  return m;
}

// ---------------------------------------------------------------------------
// Specimen tank

const bubbleGeo = new THREE.BoxGeometry(1, 1, 1);
let tankGlassGeo = null;
const bubbleMat = new THREE.MeshBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.78, depthWrite: false });

function tankFrameGrid(style) {
  const g = dense(-20, 0, -34, 20, 54, 20);
  const R = 14, mega = style === 'mega';
  const acc = mega ? PAL.yellow : PAL.pink, acc2 = mega ? 0xff2ea8 : PAL.cyan;
  const ang = (x, z) => Math.atan2(z, x) + Math.PI;
  const hz = (x, y, z) => ((Math.floor((ang(x, z) / (Math.PI * 2)) * 44 + y * 0.5) & 1) ? PAL.yellow : PAL.ink);
  // stepped plinth with a hazard band
  g.cylinder(0, 0, 0, 0, R + 4, PAL.metalDD);
  g.cylinder(0, 0, 1, 1, R + 3, (x, y, z) => (Math.hypot(x, z) > R + 2.3 ? PAL.metalD : PAL.metalDD));
  g.cylinder(0, 0, 2, 3, R + 1, PAL.metalD);
  ring(g, 0, 0, 2, 3, R + 2, hz, false, 1);
  // body: vents, band, LEDs
  g.cylinder(0, 0, 4, 6, R + 1, PAL.metal);
  ring(g, 0, 0, 4, 5, R + 1, (x, y, z) => ((Math.floor((ang(x, z) / (Math.PI * 2)) * 36) % 3 === 0) ? 0x2a2f3a : y === 4 ? PAL.metalD : PAL.metal), false, 1);
  ring(g, 0, 0, 6, 6, R + 1, acc, false, 1);
  for (let a = 0; a < 12; a++) {
    const t = (a / 12) * Math.PI * 2 + 0.13;
    g.set(Math.round(Math.cos(t) * (R + 1.8)), 5, Math.round(Math.sin(t) * (R + 1.8)), a % 2 ? acc2 : PAL.slime, true);
  }
  // inner floor: dark grate with two glowing rings and spokes
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      const d = Math.hypot(x, z);
      if (d > R - 0.6) continue;
      const glowRing = Math.abs(d - 11) < 0.5 || Math.abs(d - 5.5) < 0.5;
      const spoke = x === 0 || z === 0 || x === z || x === -z;
      g.set(x, 6, z, glowRing ? acc2 : spoke ? PAL.metalD : (z & 1) ? 0x1c3640 : 0x2c5560, glowRing);
    }
  g.cylinder(0, 0, 7, 7, 2, PAL.metalL);
  g.set(0, 7, 0, acc2, true);
  // collars + struts with brackets
  ring(g, 0, 0, 7, 8, R + 1, PAL.metalL, false, 1);
  ring(g, 0, 0, 38, 39, R + 1, PAL.metalL, false, 1);
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    g.set(Math.round(Math.cos(t) * (R + 1.6)), 8, Math.round(Math.sin(t) * (R + 1.6)), SCREW);
    g.set(Math.round(Math.cos(t) * (R + 1.6)), 38, Math.round(Math.sin(t) * (R + 1.6)), SCREW);
  }
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.round(Math.cos(t) * (R + 1)), z = Math.round(Math.sin(t) * (R + 1));
    const ox = Math.round(Math.cos(t) * (R + 2)), oz = Math.round(Math.sin(t) * (R + 2));
    g.box(x, 9, z, x, 37, z, PAL.metalD);
    for (const y of [14, 22, 30]) { g.set(ox, y, oz, PAL.metal); g.set(ox, y + 1, oz, PAL.metalL); g.set(x, y, z, PAL.metalL); }
  }
  // cap
  g.cylinder(0, 0, 40, 45, R + 1, (x, y) => (y === 40 ? PAL.metalD : (y === 41 || y === 42) ? acc : y === 45 ? PAL.metalL : PAL.metal));
  if (mega) {
    g.cylinder(0, 0, 40, 44, R + 1, PAL.yellow);
    stampText(g, 'MEGA', 0, 40, PAL.ink, R + 2);
    ring(g, 0, 0, 45, 45, R + 1, hz, false, 1);
  }
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2;
    g.set(Math.round(Math.cos(t) * (R + 1.7)), 43, Math.round(Math.sin(t) * (R + 1.7)), SCREW);
  }
  g.cylinder(0, 0, 45, 45, R - 2, PAL.metalD);
  g.cylinder(0, 0, 46, 46, 10, PAL.metal);
  g.cylinder(0, 0, 47, 47, 8, PAL.metalL);
  g.cylinder(0, 0, 48, 48, 5, PAL.metal);
  g.cylinder(0, 0, 49, 49, 2, PAL.metalD);
  g.box(0, 50, 0, 1, 51, 1, acc2, true);
  // hatch with a handle
  g.box(-3, 47, 3, 3, 47, 6, PAL.metalD).box(-1, 48, 5, 1, 48, 5, PAL.yellow);
  // pipes out of the cap and back into the wall (below the wall sign)
  tube(g, 'y', 46, 48, -8, -8, 2, PAL.metalL, {});
  tube(g, 'z', -31, -8, -8, 48, 2, PAL.metalL, { every: 7, flange: acc, off: 4 });
  g.box(-11, 45, -32, -5, 51, -31, PAL.metalD).set(-10, 50, -30, SCREW).set(-6, 50, -30, SCREW).set(-10, 46, -30, SCREW).set(-6, 46, -30, SCREW);
  tube(g, 'y', 46, 47, 8, -6, 1, PAL.metal, {});
  tube(g, 'z', -31, -6, 8, 47, 1, PAL.metal, { every: 6, flange: PAL.blue });
  g.box(6, 45, -32, 10, 49, -31, PAL.metalD);
  gaugeZ(g, 3, 47, 11, 2, { angle: 2.0, depth: 2 });
  // side control box (right side) with a pixel readout, LEDs and a lever
  g.box(15, 2, -3, 18, 15, 3, PAL.metalD);
  g.box(15, 16, -3, 18, 16, 3, PAL.metal);
  g.box(19, 9, -2, 19, 13, 2, (x, y, z) => (y === 11 || (z + y) % 4 === 0 ? PAL.cyan : 0x0d2a3a));
  g.set(19, 6, -2, PAL.slime, true).set(19, 6, 0, acc, true).set(19, 6, 2, PAL.yellow);
  g.box(16, 17, 1, 16, 20, 1, PAL.metal).set(16, 21, 1, PAL.red).set(17, 21, 1, PAL.red);
  g.box(16, 17, -2, 17, 18, -1, PAL.yellow);
  // hazard label on the plinth front
  g.box(-2, 1, R + 3, 2, 7, R + 3, PAL.yellow);
  g.set(-2, 1, R + 3, PAL.metalDD).set(2, 1, R + 3, PAL.metalDD).set(-2, 7, R + 3, PAL.metalDD).set(2, 7, R + 3, PAL.metalDD);
  text(g, '!', 0, 2, R + 3, '+z', PAL.ink, { center: true });
  // glass glints (pixel highlights on the front-left of the glass)
  g.box(-6, 12, 12, -6, 33, 12, 0xeefcff);
  g.box(-3, 20, 13, -3, 27, 13, 0xeefcff);
  g.box(-6, 35, 12, -6, 36, 12, 0xeefcff);
  return g;
}

/** Colour-neutral liquid (tinted by the material colour). */
function tankLiquidGrid() {
  const g = dense(-14, 6, -14, 14, 38, 14);
  const bot = 7, top = 37;
  const c = 0xffffff, dark = 0x707070;
  g.cylinder(0, 0, bot, top, 13, (x, y, z) => {
    if (y === top) return 0xffffff;
    const t = Math.floor((y - bot) / 4) * 4 / (top - bot);
    return mixHex(dark, c, Math.sqrt(t));
  });
  return g;
}

/** Huge specimen tank. { root, glass, liquid, frame, bubbler, update(dt) }. o: { color, style: 'mega', liquidOpacity, glassOpacity } */
export function makeTank(o = {}) {
  const liquidColor = o.color ?? 0x3fe8d0;
  const style = o.style ?? 'std';
  const frame = aoMesh('bigTank_frame3_' + style, () => tankFrameGrid(style), { scale: 0.1, pivot: [0.5, 0, 0.5], maxSamples: 120 });
  frame.name = 'tankFrame';
  const H = 3.35, R = 1.45;
  const liqGeo = aoGeometry('tankLiquid4', tankLiquidGrid, { scale: 0.1, pivot: [0.5, 0, 0.5], ao: false, jitter: 0.03 });
  const liquidMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: liquidColor, transparent: true, opacity: o.liquidOpacity ?? 0.4, depthWrite: false });
  const liquid = new THREE.Mesh(liqGeo, liquidMat);
  liquid.name = 'tankLiquid';
  liquid.renderOrder = 2;
  if (!tankGlassGeo) tankGlassGeo = new THREE.CylinderGeometry(R, R, H, 28, 1, true);
  const glass = new THREE.Mesh(tankGlassGeo, glassMat(0xd8f8ff, o.glassOpacity ?? 0.2));
  glass.position.y = 0.7 + H / 2;
  glass.renderOrder = 3;
  // rising voxel bubbles (one instanced mesh)
  const N = 26;
  const bubbler = new THREE.InstancedMesh(bubbleGeo, bubbleMat, N);
  bubbler.name = 'bubbler';
  bubbler.frustumCulled = false;
  bubbler.renderOrder = 2;
  const st = new Float32Array(N * 6); // a, r, speed, phase, y, size
  for (let i = 0; i < N; i++) {
    st[i * 6] = Math.random() * Math.PI * 2;
    st[i * 6 + 1] = 0.2 + Math.random() * 1.0;
    st[i * 6 + 2] = 0.4 + Math.random() * 0.7;
    st[i * 6 + 3] = Math.random() * 6;
    st[i * 6 + 4] = 0.75 + Math.random() * 3;
    st[i * 6 + 5] = 0.035 + Math.random() * 0.045;
  }
  const arr = bubbler.instanceMatrix.array;
  const top = 0.7 + H * 0.9;
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (let i = 0; i < N; i++) {
      const k = i * 6;
      let y = st[k + 4] + dt * st[k + 2];
      if (y > top) y = 0.75;
      st[k + 4] = y;
      const s = st[k + 5] * (y > top - 0.12 ? 0.6 : 1);
      const m = i * 16;
      arr[m] = s; arr[m + 1] = 0; arr[m + 2] = 0; arr[m + 3] = 0;
      arr[m + 4] = 0; arr[m + 5] = s; arr[m + 6] = 0; arr[m + 7] = 0;
      arr[m + 8] = 0; arr[m + 9] = 0; arr[m + 10] = s; arr[m + 11] = 0;
      arr[m + 12] = Math.cos(st[k]) * st[k + 1] + Math.sin(t * 2 + st[k + 3]) * 0.05;
      arr[m + 13] = y;
      arr[m + 14] = Math.sin(st[k]) * st[k + 1];
      arr[m + 15] = 1;
    }
    bubbler.instanceMatrix.needsUpdate = true;
  };
  update(0);
  const root = group(frame, liquid, bubbler, glass);
  root.name = 'tank';
  root.userData.update = update;
  return { root, glass, liquid, frame, bubbler, update };
}
// ---------------------------------------------------------------------------
// Control console (sloped desk, faces +z) with two live screens on a riser.

function consoleGrid() {
  const g = dense(-14, 0, -20, 13, 28, 9);
  const hAt = (z) => 9 + Math.round((5 - z) * 0.4);
  for (let z = -5; z <= 5; z++) {
    const h = hAt(z);
    g.box(-12, 0, z, 11, h, z, (x, y) => {
      if (y <= 1) return PAL.metalDD;
      if (x === -12 || x === 11) return y === h ? PAL.metalL : y === h - 1 ? PAL.pink : PAL.metalD;
      if (y === h) return x <= -11 || x >= 10 || z <= -5 || z >= 5 ? PAL.metalL : 0x2a3348;
      return (x + 12) % 8 === 0 ? PAL.seam : PAL.white2;
    });
  }
  // front face: hazard kick plate, panels, vents, cable port, LEDs
  g.box(-12, 0, 6, 11, 1, 6, hazardC(PAL.yellow, PAL.ink, 2));
  g.box(-12, 2, 6, 11, 9, 6, (x, y) => (y === 9 ? PAL.metalL : y === 7 ? PAL.blue : (x + 12) % 8 === 0 ? PAL.seam : PAL.white));
  for (let x = -10; x <= -5; x++) for (const y of [3, 5]) g.set(x, y, 6, 0x3d4352);
  g.box(4, 3, 6, 8, 5, 6, PAL.metalDD).set(5, 4, 7, PAL.red).set(7, 4, 7, PAL.blue);
  for (const [x, y] of [[-12, 2], [11, 2], [-12, 8], [11, 8]]) g.set(x, y, 7, SCREW);
  g.set(9, 8, 7, PAL.slime, true).set(7, 8, 7, PAL.yellow, true).set(-2, 8, 7, PAL.cyan, true);
  // control deck
  const top = (z) => hAt(z) + 1;
  const btn = [PAL.red, PAL.yellow, PAL.slime, PAL.blue, PAL.pink];
  for (let x = -10; x <= -6; x += 2) for (let z = -3; z <= 1; z += 2) {
    const c = btn[Math.abs(x * 3 + z * 7) % btn.length];
    g.set(x, top(z), z, c, (x + z) % 4 === 0);
  }
  for (const [x, kz] of [[-3, -1], [-1, 2]]) {
    for (let z = -3; z <= 3; z++) g.set(x, hAt(z), z, 0x4a5570);
    g.box(x, top(kz), kz, x, top(kz) + 1, kz, PAL.white);
  }
  // big red button with guard ring
  for (let x = 1; x <= 4; x++) for (let z = -2; z <= 1; z++) if (x === 1 || x === 4 || z === -2 || z === 1) g.set(x, top(z), z, PAL.yellow);
  g.box(2, top(-1), -1, 3, top(-1) + 1, 0, PAL.red).set(2, top(-1) + 1, -1, 0xff7a80);
  // joystick
  g.box(6, top(1), 0, 8, top(1), 2, PAL.ink);
  g.box(7, top(1) + 1, 1, 7, top(1) + 3, 1, PAL.metalD);
  g.set(7, top(1) + 4, 1, PAL.red);
  // keyboard strip
  for (let x = -9; x <= 7; x++) for (const z of [3, 4]) g.set(x, top(z), z, (x + z) % 2 ? PAL.metalL : 0xc8d0dc);
  g.box(-4, top(4), 4, 2, top(4), 4, PAL.white);
  // levers
  for (const x of [8, 10]) { g.box(x, top(-3), -3, x, top(-3) + 3, -3, PAL.metal); g.set(x, top(-3) + 4, -3, x === 8 ? PAL.red : PAL.blue); }
  // riser with two monitors
  g.box(-12, 10, -6, 11, 13, -6, PAL.metalD);
  for (const [x0, x1] of [[-12, -1], [0, 11]]) {
    g.box(x0, 14, -6, x1, 23, -5, PAL.ink);
    g.box(x0, 23, -6, x1, 23, -5, PAL.metalDD);
    g.set(x1 - 1, 14, -4, PAL.slime, true);
  }
  g.box(-1, 14, -6, 0, 22, -6, PAL.metalDD);
  // beacon on top
  g.box(10, 24, -6, 11, 24, -5, PAL.metalD);
  g.box(10, 25, -6, 11, 26, -5, PAL.orange, true);
  // cable bundle from the back down to the floor
  const cab = [[0x15121f, -4], [PAL.red, -2], [PAL.blueD, 0], [PAL.yellow, 2]];
  for (const [c, x] of cab) chain(g, [[x, 9, -6], [x, 4, -7], [x - 1, 1, -9], [x - 3, 0, -13], [x - 5, 0, -16]], 0.2, c);
  return g;
}

export function makeConsole() {
  const body = aoMesh('console3', consoleGrid, { scale: 0.1, pivot: [0, 0, 0], maxSamples: 120 });
  const r = group(body,
    screenAt('ekg', -11, 15, 10, 8, -5, 0.1, { seed: 1 }),
    screenAt('radar', 1, 15, 10, 8, -5, 0.1, { seed: 2 }));
  r.name = 'console';
  return r;
}

// ---------------------------------------------------------------------------
// Workstation: desk, dual monitors, tower PC and an office chair.

function computerGrid() {
  const g = dense(-12, 0, -7, 17, 21, 15);
  // desk
  g.box(-10, 7, -5, 9, 8, 4, (x, y, z) => (y === 7 ? PAL.woodD : (x === -10 || x === 9 || z === -5 || z === 4) ? PAL.wood : PAL.woodL));
  for (const x of [-10, 9]) { g.box(x, 0, -5, x, 6, -5, PAL.metalD); g.box(x, 0, 4, x, 6, 4, PAL.metalD); g.box(x, 1, -4, x, 1, 3, PAL.metalD); }
  // drawer unit
  g.box(-9, 0, -4, -5, 6, 3, (x, y) => (y === 2 || y === 4 ? PAL.seam : PAL.white2));
  for (const y of [1, 3, 5]) g.box(-8, y, 4, -6, y, 4, PAL.metal);
  // monitor arm + main monitor + side monitor
  g.box(-2, 9, -4, 0, 9, -2, PAL.metalDD).box(-1, 10, -3, -1, 11, -3, PAL.metalDD);
  g.box(-7, 11, -3, 4, 19, -3, PAL.ink);
  g.set(-6, 11, -2, PAL.slime, true);
  g.box(6, 9, -4, 8, 9, -2, PAL.metalDD).box(7, 10, -3, 7, 11, -3, PAL.metalDD);
  g.box(5, 11, -3, 9, 19, -3, PAL.ink);
  // sticky notes on the bezel
  g.set(-7, 18, -2, PAL.yellow).set(-7, 17, -2, PAL.yellow).set(4, 18, -2, PAL.pinkL).set(9, 16, -2, 0x9dff9a);
  // keyboard, mouse pad + mouse, mug, speakers, papers
  g.box(-6, 9, 0, 2, 9, 2, 0xe4e8ee);
  for (let x = -5; x <= 1; x++) g.set(x, 10, (x & 1) ? 1 : 0, (x & 1) ? 0xb8c0cc : 0xcfd6e0);
  g.box(-3, 10, 2, 0, 10, 2, 0xb8c0cc);
  g.box(3, 9, 0, 6, 9, 3, PAL.blueDD).box(5, 10, 1, 5, 10, 2, PAL.white);
  g.box(-9, 9, 0, -8, 11, 1, PAL.white).set(-8, 11, 0, 0x5a3220).set(-7, 10, 1, PAL.pink);
  for (const x of [-9, 7]) {
    g.box(x, 9, -4, x + 1, 12, -4, PAL.ink);
    g.set(x, 11, -3, 0x5a6478).set(x + 1, 10, -3, 0x5a6478);
  }
  g.box(6, 9, 2, 8, 9, 4, 0xffffff).box(6, 10, 3, 7, 10, 3, 0xe8ecf2);
  // tower PC with RGB fan window
  g.box(10, 0, -4, 14, 11, 3, 0x2a2e3a);
  g.box(10, 0, 4, 14, 11, 4, 0x1a1d26);
  for (let y = 2; y <= 9; y += 2) g.box(11, y, 4, 13, y, 4, 0x3d4352);
  g.set(12, 10, 5, PAL.cyan, true);
  g.box(15, 2, -3, 15, 9, 2, 0x1a1d26);
  for (const [cy, cz, c] of [[7, -1, PAL.pink], [4, 0, PAL.cyan]]) {
    for (const [dy, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) g.set(15, cy + dy, cz + dz, c, true);
    g.set(15, cy, cz, PAL.metalDD);
  }
  // office chair (faces the desk, -z)
  for (let a = 0; a < 5; a++) {
    const t = (a / 5) * Math.PI * 2;
    const ex = Math.round(Math.cos(t) * 4), ez = 9 + Math.round(Math.sin(t) * 4);
    g.line(0, 1, 9, ex, 1, ez, PAL.metalDD);
    g.set(ex, 0, ez, PAL.ink);
  }
  g.box(0, 2, 9, 0, 4, 9, PAL.metal);
  g.box(-4, 5, 6, 3, 5, 12, PAL.blueD).box(-3, 6, 6, 2, 6, 11, PAL.blue);
  g.box(-4, 6, 12, 3, 15, 13, (x, y) => (y === 15 || x === -4 || x === 3 ? PAL.blueD : PAL.blue));
  g.box(-2, 12, 12, 1, 13, 12, PAL.pink);
  for (const x of [-5, 4]) { g.box(x, 6, 8, x, 8, 8, PAL.metalD); g.box(x, 9, 7, x, 9, 10, PAL.ink); }
  return g;
}

export function makeComputer() {
  const body = aoMesh('computer3', computerGrid, { scale: 0.1, pivot: [0, 0, 0], maxSamples: 120 });
  const r = group(body,
    screenAt('code', -6, 12, 10, 7, -3, 0.1, { seed: 3 }),
    screenAt('map', 6, 12, 3, 7, -3, 0.1, { seed: 4 }));
  r.name = 'computer';
  return r;
}

// ---------------------------------------------------------------------------
// Pipe run along x (wall mounted, faces +z): three pipes, flanges, valve
// wheels, gauges, brackets, a junction box and a drop pipe.

function pipesGrid(n) {
  const g = dense(-Math.floor(n / 2) - 2, -2, -4, -Math.floor(n / 2) + n + 2, 18, 8);
  const x0 = -Math.floor(n / 2), x1 = x0 + n - 1;
  for (let x = x0 + 3; x < x1; x += 16) {
    g.box(x, 0, -2, x + 1, 16, -2, PAL.metalD);
    for (const y of [3, 9, 14]) g.box(x, y - 3, -1, x + 1, y - 3, 3, PAL.metalDD);
  }
  tube(g, 'x', x0, x1, 3, 1, 2, PAL.metal, { every: 12, flange: PAL.blueD, off: 6 });
  tube(g, 'x', x0, x1, 9, 1, 1, PAL.metalL, { every: 10, flange: PAL.pinkD, off: 2 });
  tube(g, 'x', x0, x1, 14, 0, 1, 0xd08a40, { every: 14, flange: PAL.goldD, off: 5 });
  for (let x = x0 + 10, k = 0; x < x1 - 4; x += 20, k++) {
    g.box(x, 3, 4, x, 3, 5, PAL.metalD);
    valve(g, x, 3, 6, 3, k % 2 ? PAL.red : PAL.blue);
  }
  for (let x = x0 + 18, k = 0; x < x1 - 4; x += 20, k++) {
    g.box(x, 9, 3, x, 9, 3, PAL.metalD);
    gaugeZ(g, x, 10, 4, 2, { angle: 1.2 + k * 0.9, depth: 1 });
  }
  // flow arrows + colour bands on the copper line
  for (let x = x0 + 8; x < x1 - 3; x += 24) {
    g.box(x, 13, 2, x + 3, 15, 2, PAL.yellow);
    g.set(x + 1, 14, 3, PAL.ink).set(x + 2, 14, 3, PAL.ink).set(x + 2, 15, 3, PAL.ink).set(x + 2, 13, 3, PAL.ink).set(x + 3, 14, 3, PAL.ink);
  }
  // junction box with a hazard label
  const jx = x0 + Math.floor(n * 0.3);
  g.box(jx, 5, -1, jx + 4, 7, 3, PAL.metalD);
  g.box(jx + 1, 6, 4, jx + 3, 6, 4, hazardC(PAL.yellow, PAL.ink, 1));
  // drop pipe to the floor
  tube(g, 'y', 0, 13, x1 - 3, 3, 1, PAL.metalL, {});
  g.box(x1 - 5, 0, 1, x1 - 1, 0, 5, PAL.metalD);
  g.set(x1 - 3, 7, 5, PAL.slime, true);
  return g;
}

export function makePipes(len = 4) {
  const n = Math.max(8, Math.round(len * 10));
  return wrap(aoMesh('pipes3_' + n, () => pipesGrid(n), { scale: 0.1, pivot: [0, 0, 0], maxSamples: 80 }), 'pipes');
}

// ---------------------------------------------------------------------------
// The workbench (top at y = 0.9) with a microscope, centrifuge, test tubes,
// petri dishes, a desk lamp, papers, drawers and an under-shelf. The middle
// stays clear for the first pack.

function deskGrid() {
  const g = dense(-15, 0, -7, 14, 20, 8);
  // top: metal band + white top + pink "drop zone" mat in the middle
  g.box(-14, 7, -5, 13, 7, 5, PAL.metalD);
  g.box(-14, 8, -5, 13, 8, 5, (x, y, z) => {
    if (x === -14 || x === 13 || z === -5 || z === 5) return PAL.metalL;
    const dx = Math.abs(x + 0.5), dz = Math.abs(z);
    if (dx <= 4 && dz <= 3) return (dx === 4 || dz === 3) ? PAL.pinkD : ((Math.floor(dx) + dz) % 2 ? 0xffd2e6 : 0xffe6f1);
    return hash3(x, 8, z) < 0.04 ? 0xdde3ec : 0xf2f5fa;
  });
  // left pedestal with drawers
  g.box(-14, 0, -5, -8, 6, 5, (x, y) => (y === 0 ? PAL.metalDD : y === 2 || y === 4 ? PAL.seam : PAL.white2));
  for (const y of [1, 3, 5]) g.box(-12, y, 6, -10, y, 6, PAL.metal);
  g.set(-9, 5, 6, PAL.pink);
  // right legs, crossbar and under-shelf with a lab box and a jug
  for (const z of [-5, 5]) g.box(12, 0, z, 13, 6, z, PAL.metalD);
  g.box(-7, 1, -4, 13, 1, 4, PAL.white2);
  g.box(13, 1, -5, 13, 1, 5, PAL.metalD);
  g.box(4, 2, -3, 9, 5, 2, 0xc9a06a).box(4, 5, -1, 9, 5, 0, 0xe0bc84);
  g.set(6, 3, 3, PAL.pink).set(7, 4, 3, PAL.pink).set(6, 4, 3, PAL.pink);
  g.box(10, 2, -2, 11, 5, 0, 0x9de8ff).box(10, 2, -2, 11, 3, 0, PAL.slime).set(10, 6, -1, PAL.blue);
  // microscope
  g.box(5, 9, -4, 9, 9, -1, PAL.ink);
  g.box(8, 10, -3, 8, 15, -3, PAL.white2);
  g.line(8, 15, -3, 6, 17, -1, PAL.white2, 0);
  g.box(5, 12, -2, 7, 12, 0, PAL.metalD);
  g.box(6, 13, -1, 6, 14, -1, PAL.metal);
  g.set(5, 18, 0, PAL.ink).set(5, 17, 0, PAL.metalD);
  g.set(9, 12, -3, PAL.metalL).set(6, 13, 0, PAL.cyan, true);
  // centrifuge
  g.cylinder(11, -3, 9, 10, 1.6, PAL.white);
  g.cylinder(11, -3, 11, 11, 1.2, PAL.metalL);
  g.set(11, 10, -1, PAL.slime, true);
  // test tube rack
  g.box(8, 9, 2, 12, 10, 3, PAL.wood).box(8, 11, 2, 12, 11, 3, PAL.woodL);
  for (const [x, c] of [[8, PAL.slime], [10, PAL.pink], [12, PAL.cyan]]) {
    g.box(x, 11, 2, x, 13, 2, c);
    g.box(x, 14, 2, x, 15, 2, 0xe8f8ff);
    g.set(x, 14, 2, c, true);
  }
  // petri dishes
  for (const [cx, cz, c] of [[5, 3, PAL.slime], [6, 1, PAL.purple]]) {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) g.set(cx + dx, 9, cz + dz, Math.abs(dx) + Math.abs(dz) === 2 ? 0xd8f4ff : c);
  }
  // desk lamp (left back) shining on the mat
  g.box(-12, 9, -4, -10, 9, -3, PAL.ink);
  g.box(-11, 10, -4, -11, 15, -4, PAL.blue);
  g.line(-11, 15, -4, -7, 18, -3, PAL.blue, 0);
  g.box(-7, 17, -4, -5, 18, -2, PAL.blueD);
  g.box(-7, 16, -4, -5, 16, -2, null);
  g.set(-6, 16, -3, 0xfff4c8, true);
  // papers, clipboard and a pen
  g.box(-13, 9, -2, -9, 9, 1, 0xffffff);
  g.box(-12, 9, -1, -10, 9, -1, 0x9aa2b4).box(-12, 9, 0, -11, 9, 0, 0x9aa2b4);
  g.box(-8, 9, -4, -6, 9, -1, PAL.woodL).box(-8, 10, -3, -6, 10, -1, 0xffffff).set(-7, 10, -4, PAL.metalD);
  g.box(-5, 9, 4, -3, 9, 4, PAL.blue).set(-2, 9, 4, PAL.ink);
  // sticky notes on the front edge
  g.set(-6, 8, 6, PAL.yellow).set(3, 8, 6, PAL.pinkL);
  return g;
}

export function makeLabDesk() {
  const body = aoMesh('labDesk3', deskGrid, { scale: 0.1, pivot: [0, 0, 0], maxSamples: 120 });
  const r = group(body);
  r.name = 'labDesk';
  return r;
}

export function makeMug() {
  return wrap(vmesh('mug', () => {
    const g = new VoxGrid();
    g.cylinder(0, 0, 0, 6, 3, (x, y) => (y === 0 ? 0xd8dde6 : 0xffffff));
    g.cylinder(0, 0, 6, 6, 2, 0x5a3220);
    g.cylinder(0, 0, 1, 6, 2, null);
    g.cylinder(0, 0, 1, 5, 2, 0x4a2412);
    g.box(4, 2, 0, 4, 4, 0, 0xffffff).set(5, 2, 0, 0xffffff).set(5, 4, 0, 0xffffff).box(5, 3, 0, 5, 3, 0, 0xffffff).set(6, 3, 0, 0xffffff);
    // pink bolt logo
    g.set(0, 4, 4, PAL.pink).set(-1, 3, 4, PAL.pink).set(0, 3, 4, PAL.pink).set(0, 2, 4, PAL.pink).set(1, 2, 4, PAL.pink).set(0, 1, 4, PAL.pink);
    // steam
    g.set(0, 8, 0, 0xffffff, true).set(1, 9, 0, 0xeaeaea, true).set(0, 10, 0, 0xffffff, true);
    return g;
  }, { scale: 0.035 }), 'mug');
}

// ---------------------------------------------------------------------------
// Specimen shelf: jars (one with an eyeball), beakers, books, a potted plant,
// a toy Panther, lab boxes and drums.

function shelfGrid() {
  const g = dense(-11, 0, -4, 10, 34, 4);
  for (const x of [-10, 9]) g.box(x, 0, -3, x, 27, 2, (xx, y, z) => ((y % 3 === 1 && (z === -1 || z === 1)) ? PAL.metalDD : PAL.metalD));
  g.box(-9, 0, -3, 8, 27, -3, (x, y) => ((x + y) % 3 === 0 && y % 2 === 0 ? 0xc8d2e0 : PAL.white2));
  for (const y of [1, 9, 17, 25]) {
    g.box(-9, y, -2, 8, y, 2, PAL.metal);
    g.box(-9, y, 3, 8, y, 3, y === 25 ? PAL.pink : PAL.metalL);
  }
  g.box(-10, 28, -3, 9, 28, 3, PAL.metalD);
  // bottom shelf: two drums + a lab box
  for (const x of [-7, -3]) {
    g.cylinder(x, 0, 2, 7, 1.6, (xx, y) => (y === 3 || y === 6 ? PAL.blueD : PAL.blue));
    g.set(x, 4, 2, PAL.yellow).set(x, 8, 0, PAL.metalL);
  }
  g.box(0, 2, -2, 7, 7, 2, 0xc9a06a).box(0, 7, -2, 7, 7, 2, 0xe0bc84).box(3, 7, -2, 4, 7, 2, 0xb8905a);
  g.set(3, 5, 3, PAL.pink).set(4, 4, 3, PAL.pink).set(3, 4, 3, PAL.pink).set(4, 3, 3, PAL.pink);
  // middle shelf: specimen jar with an eyeball, goo jar, books
  g.box(-8, 10, -2, -4, 15, 2, 0xd8f4ff);
  g.box(-7, 10, -1, -5, 14, 1, 0x9dffd8);
  g.box(-7, 11, 0, -5, 13, 2, 0xffffff).box(-6, 12, 2, -6, 12, 2, PAL.ink).set(-7, 12, 2, PAL.blue).set(-5, 12, 2, PAL.blue).set(-6, 13, 2, PAL.blue).set(-6, 11, 2, PAL.blue);
  g.box(-8, 16, -2, -4, 16, 2, PAL.metalD);
  g.box(-2, 10, -1, 0, 14, 1, 0xd8f4ff).box(-2, 10, -1, 0, 12, 1, PAL.slime).set(-1, 13, 1, PAL.slime, true).box(-2, 15, -1, 0, 15, 1, PAL.red);
  const books = [PAL.red, PAL.blue, PAL.yellow, PAL.pink, PAL.green, PAL.purple];
  books.forEach((c, i) => {
    const h = 5 + ((i * 3) % 3);
    g.box(2 + i, 10, -2, 2 + i, 9 + h, 1, c).set(2 + i, 9 + h - 1, 2, PAL.white);
  });
  // top-middle shelf: beakers, plant, toy Panther
  for (const [x, c, h] of [[-8, PAL.pink, 4], [-6, PAL.cyan, 5], [-4, PAL.yellow, 3]]) {
    g.box(x, 18, -1, x + 1, 18 + h, 0, 0xd8f4ff);
    g.box(x, 18, -1, x + 1, 18 + Math.floor(h / 2), 0, c);
    g.set(x, 19 + h, 0, c, x === -6);
  }
  g.box(-1, 18, -1, 1, 20, 1, PAL.orange).box(-1, 21, -1, 1, 21, 1, 0x5a3220);
  for (const [x, y, z] of [[0, 22, 0], [-1, 23, 0], [1, 23, 0], [0, 24, -1], [0, 24, 1], [0, 23, 0]]) g.set(x, y, z, PAL.green);
  g.box(3, 18, -1, 6, 21, 1, PAL.blue);
  g.set(3, 22, 0, PAL.blue).set(6, 22, 0, PAL.blue);
  g.set(4, 20, 2, PAL.white).set(5, 20, 2, PAL.white).set(4, 19, 2, PAL.pink).set(5, 19, 2, PAL.pink);
  // top: hazard box + lab box
  g.box(-7, 29, -2, -2, 32, 1, PAL.yellow).box(-7, 29, 2, -2, 29, 2, PAL.ink);
  g.set(-5, 31, 2, PAL.ink).set(-5, 30, 2, PAL.ink).set(-4, 31, 2, PAL.ink).set(-4, 30, 2, PAL.ink);
  g.box(0, 29, -2, 6, 33, 2, 0xc9a06a).box(0, 33, -2, 6, 33, 2, 0xe0bc84);
  g.set(3, 32, 3, PAL.pink).set(3, 31, 3, PAL.pink).set(4, 31, 3, PAL.pink).set(3, 30, 3, PAL.pink);
  return g;
}

export function makeLabShelf() {
  return wrap(aoMesh('labShelf3', shelfGrid, { scale: 0.1, pivot: [0, 0, 0], maxSamples: 120 }), 'labShelf');
}

// ---------------------------------------------------------------------------

function vialRackGrid() {
  const g = dense(-10, 0, -4, 9, 14, 5);
  g.box(-9, 0, -3, 8, 1, 3, PAL.metalD);
  g.box(-9, 2, -3, 8, 2, 3, PAL.metalL);
  g.box(-9, 7, -3, 8, 7, 3, PAL.metal);
  g.box(-9, 12, -3, 8, 12, 3, PAL.metal);
  for (const x of [-9, 8]) for (const z of [-3, 3]) g.box(x, 0, z, x, 13, z, PAL.metalD);
  g.box(-9, 13, -3, 8, 13, -3, PAL.pink);
  const cols = [PAL.slime, PAL.pink, PAL.cyan, PAL.yellow, PAL.purple, PAL.orange, PAL.red];
  let i = 0;
  for (let x = -7; x <= 6; x += 2) for (const z of [-2, 1]) {
    const c = cols[i++ % cols.length];
    const h = 2 + ((x + z + 9) % 3);
    g.box(x, 3, z, x, 3 + h, z, c, i % 5 === 0);
    g.box(x, 4 + h, z, x, 9, z, 0xe8f8ff);
    g.set(x, 10, z, i % 2 ? PAL.red : PAL.blue);
  }
  for (let x = -8; x <= 7; x++) g.set(x, 8, 3, (x & 1) ? PAL.white : PAL.metalL);
  for (let x = -7; x <= 6; x += 3) g.set(x, 1, 4, PAL.yellow);
  return g;
}

export function makeVialRack() {
  return wrap(aoMesh('vialRack3', vialRackGrid, { scale: 0.06, pivot: [0, 0, 0], maxSamples: 80 }), 'vialRack');
}

// ---------------------------------------------------------------------------

function doorGrid() {
  const g = dense(-16, 0, -3, 15, 36, 4);
  g.box(-15, 0, -2, 14, 31, 1, PAL.metalD);
  g.box(-11, 0, -1, 10, 25, 1, null);
  g.box(-12, 0, 1, -11, 26, 1, hazardC());
  g.box(10, 0, 1, 11, 26, 1, hazardC());
  g.box(-12, 26, 1, 11, 27, 1, hazardC());
  // door halves: panels, portholes, handles
  for (const [a, b] of [[-11, -1], [0, 10]]) {
    g.box(a, 0, -1, b, 25, -1, (x, y) => (y % 6 === 0 ? PAL.metal : (x === a || x === b) ? PAL.white2 : PAL.white));
    const cx = (a + b) / 2, cy = 17;
    for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) {
      const d = Math.hypot(dx, dy);
      const x = Math.round(cx + dx), y = cy + dy;
      if (d <= 2.6) g.set(x, y, -1, (dx === -1 && dy >= 0) || (dx === -2 && dy === 1) ? 0xffffff : 0x8fd4ff);
      else if (d <= 3.9) g.set(x, y, 0, PAL.metalL);
    }
    g.box(Math.round(cx) - 2, 3, 0, Math.round(cx) + 2, 4, 0, hazardC(PAL.yellow, PAL.ink, 1));
  }
  g.box(-1, 0, -1, 0, 25, -1, PAL.ink);
  g.box(-2, 9, 0, -2, 13, 0, PAL.metalDD).box(1, 9, 0, 1, 13, 0, PAL.metalDD);
  // keypad + status lights
  g.box(12, 9, 2, 14, 15, 2, PAL.ink);
  for (let y = 10; y <= 12; y++) for (const x of [12, 13, 14]) g.set(x, y, 3, (x + y) % 2 ? 0xb8c0cc : 0x8a93a6);
  g.set(13, 14, 3, PAL.slime, true).set(12, 14, 3, PAL.red);
  // LAB sign + beacon
  g.box(-8, 28, 1, 7, 35, 2, PAL.ink);
  g.box(-8, 28, 1, 7, 28, 2, PAL.metalD);
  text(g, 'LAB', 0, 29, 3, '+z', PAL.pink, { center: true, glow: true });
  g.box(-14, 28, 2, -12, 30, 3, PAL.metalD).box(-14, 31, 2, -12, 32, 3, PAL.orange, true);
  // vent above the frame
  for (let x = 9; x <= 13; x++) for (const y of [29, 31, 33]) g.set(x, y, 2, 0x3d4352);
  return g;
}

export function makeLabDoor() {
  return wrap(aoMesh('labDoor3', doorGrid, { scale: 0.1, pivot: [0, 0, 0], maxSamples: 80 }), 'labDoor');
}

// ---------------------------------------------------------------------------
// Monitor wall: a rack of bezels around animated pixel screens.

const MON_SCREENS = [
  // x0, y0, w, h (voxels, inner screen), kind
  [-29, 14, 13, 9, 'ekg'], [-29, 3, 6, 9, 'radar'], [-22, 3, 6, 9, 'bars'],
  [-12, 8, 24, 13, 'swarm'],
  [16, 14, 13, 9, 'dna'], [16, 3, 6, 9, 'subs'], [23, 3, 6, 9, 'warn'],
  [-12, 1, 11, 5, 'wave'], [1, 1, 11, 5, 'code'],
];

function monitorWallGrid() {
  const g = dense(-32, -8, -4, 31, 27, 3);
  // rack frame
  g.box(-31, 0, -3, 30, 25, -2, PAL.metalDD);
  for (const x of [-31, -14, 13, 30]) g.box(x, 0, -3, x, 26, -1, PAL.metalD);
  g.box(-31, 26, -3, 30, 26, -1, PAL.metalD);
  g.box(-31, 26, 0, 30, 26, 0, PAL.pink);
  for (const [x0, y0, w, h] of MON_SCREENS) {
    g.box(x0 - 1, y0 - 1, -1, x0 + w, y0 + h, -1, PAL.ink);
    g.box(x0 - 1, y0 - 1, -1, x0 + w, y0 - 1, -1, 0x2a2f3a);
    g.set(x0 + w - 1, y0 - 1, 0, (x0 + y0) % 3 ? PAL.slime : PAL.red, true);
  }
  // "LIVE" tag over the big screen + header lights
  g.box(-3, 22, -1, 2, 24, -1, PAL.red);
  for (let x = -27; x <= 27; x += 6) g.set(x, 25, -1, x % 4 ? PAL.cyan : PAL.yellow, x % 12 === 0);
  // cable bundles hanging below
  for (const [x, c] of [[-24, PAL.ink], [-23, PAL.red], [20, PAL.blueD], [21, PAL.ink], [22, PAL.yellow]]) chain(g, [[x, 0, -2], [x + 1, -3, 0], [x + 2, -6, 1]], 0.2, c);
  return g;
}

export function makeMonitorWall() {
  const body = aoMesh('monitorWall3', monitorWallGrid, { scale: 0.1, pivot: [0, 0, 0], maxSamples: 80 });
  const r = group(body);
  MON_SCREENS.forEach(([x0, y0, w, h, kind], i) => r.add(screenAt(kind, x0, y0, w, h, -1, 0.1, { seed: 10 + i })));
  r.name = 'monitorWall';
  r.userData.update = () => tickLabScreens();
  return r;
}

// ---------------------------------------------------------------------------
// Floor + walls (greedy-meshed voxels: big, cheap, no AO)

/** One 1.6 x 1.6 floor tile (16 x 16 voxels, top at y = 0, corner at the origin). kind: 0 light, 1 dark, 2 drain. */
function floorTileGeo(kind) {
  return aoGeometry('floorTile4_' + kind, () => {
    const g = dense(0, -1, 0, 15, -1, 15);
    const alt = kind === 1;
    for (let u = 0; u < 16; u++)
      for (let v = 0; v < 16; v++) {
        let c;
        if (u === 0 || v === 0) c = 0xa8b2c2;
        else {
          c = alt ? 0xe4eaf2 : 0xd6dde8;
          if (u === 1 || v === 1) c = alt ? 0xf0f4fa : 0xe2e8f0;
          if (u === 15 || v === 15) c = alt ? 0xd2d9e4 : 0xc8d0dc;
          if (hash3(u, kind + 3, v) < 0.012) c = 0xbcc5d2;
          if (kind === 2 && u > 4 && u < 12 && v > 4 && v < 12) c = (u === 5 || u === 11 || v === 5 || v === 11) ? 0x9aa4b4 : ((u + v) & 1) ? 0x6b7386 : 0x3d4352;
        }
        g.set(u, -1, v, c);
      }
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0], ao: false, jitter: 0.02, skip: [3] });
}

/** Lab floor (about w x d units, centred, top at y = 0): instanced voxel tiles + hazard edges. */
export function makeFloorTiles(w = 10, d = 8) {
  const T = 1.6;
  const ni = Math.ceil(w / T), nj = Math.ceil(d / T);
  const x0 = (-ni * T) / 2, z0 = (-nj * T) / 2;
  const items = [[], [], []];
  for (let i = 0; i < ni; i++)
    for (let j = 0; j < nj; j++) {
      const kind = hash3(i, 9, j) < 0.07 ? 2 : (i + j) & 1;
      items[kind].push([x0 + i * T, 0, z0 + j * T]);
    }
  const r = new THREE.Group();
  r.name = 'floorTiles';
  items.forEach((it, k) => { if (it.length) r.add(instanced(floorTileGeo(k), it, { receive: true })); });
  // hazard stripes along the edges
  const nx = Math.round(ni * 16), nz = Math.round(nj * 16);
  const edge = (n, id) => aoGeometry(id, () => {
    const g = dense(0, 0, 0, n - 1, 0, 1);
    for (let x = 0; x < n; x++) for (let z = 0; z < 2; z++) g.set(x, 0, z, ((x + z) >> 1) & 1 ? PAL.yellow : PAL.ink);
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0], ao: false, skip: [3] });
  const ex = edge(nx, 'floorEdge4_' + nx), ez = edge(nz, 'floorEdge4_' + nz);
  for (const [geo, x, z, ry] of [[ex, x0, z0, 0], [ex, x0, -z0 - 0.2, 0], [ez, x0, -z0, Math.PI / 2], [ez, -x0 - 0.2, -z0, Math.PI / 2]]) {
    const m = makeMesh(geo, Mats.pair);
    m.position.set(x, -0.098, z);
    m.rotation.y = ry;
    m.castShadow = false;
    m.receiveShadow = true;
    r.add(m);
  }
  return r;
}

/**
 * One 2-unit wide wall column (20 voxels, ny tall, front plane at z = 0, left
 * edge at x = 0): dark baseboard, a riveted lower panel (kind 0 plain, 1 vent,
 * 2 hatch, 3 LED plate), a chair rail, white tiles, a conduit with a bracket,
 * and blue/pink top bands.
 */
function wallColumnGeo(ny, kind) {
  return aoGeometry(`wallCol4_${ny}_${kind}`, () => {
    const g = dense(0, 0, -3, 19, ny - 1, 2);
    const rail = Math.round(ny * 0.52), top = ny - 8, conduit = top - 4, PW = 20;
    g.box(0, 0, -3, PW - 1, ny - 1, -2, PAL.metalDD);
    for (let u = 0; u < PW; u++)
      for (let y = 0; y < ny; y++) {
        let c, z = -1;
        if (y < 4) { c = y === 3 ? PAL.metal : PAL.metalDD; z = 0; }
        else if (y < rail) {
          const v = y - 4, ph = rail - 4;
          if (u === 0 || v === 0 || v === ph - 1) c = 0x8d99ad;
          else {
            c = kind & 1 ? 0xc9d3e3 : 0xbfcadb;
            if (u === 1 || v === ph - 2) c = 0xdfe6f0;
            if (u === PW - 1 || v === 1) c = 0xa9b5c8;
            const iu = u - 4, iv = v - 5;
            if (kind === 1 && iu >= 0 && iu < PW - 8 && iv >= 0 && iv < ph - 12) { c = (iv % 2) ? 0x3d4352 : 0x5a6478; if (iv % 2) z = -2; }
            else if (kind === 2 && iu >= 2 && iu < PW - 10 && iv >= 6 && iv < 13) {
              const ed = iu === 2 || iu === PW - 11 || iv === 6 || iv === 12;
              c = ed ? (((iu + iv) >> 1) & 1 ? PAL.yellow : PAL.ink) : 0xd0d8e6;
            }
          }
          if ((u === 2 || u === PW - 2) && (v === 2 || v === ph - 3)) { c = SCREW; z = 0; }
        } else if (y < rail + 3) { c = y === rail + 2 ? PAL.metalL : PAL.metal; z = 0; }
        else if (y < top) {
          const tu = u % 10, tv = (y - rail - 3) % 10;
          const ti = Math.floor(u / 10), tj = Math.floor((y - rail - 3) / 10);
          c = tu === 0 || tv === 0 ? 0xc5cfdd : ((ti + tj) & 1) ? 0xeef2f8 : 0xe4eaf2;
          if (c !== 0xc5cfdd && hash3(ti + kind * 2, tj, 7) < 0.1) c = 0xd8e8f6;
          if (y === conduit || y === conduit + 1) { c = y === conduit + 1 ? PAL.metalL : PAL.metal; z = 0; }
        } else {
          const v = y - top;
          c = v === 0 ? PAL.blueDD : v < 3 ? PAL.blueD : v < 4 ? PAL.white : v < 7 ? PAL.pink : PAL.metalDD;
        }
        g.set(u, y, z, c);
        if (z === 0) g.set(u, y, -1, c);
      }
    g.box(6, conduit - 1, 0, 7, conduit + 2, 1, PAL.metalD);
    if (kind === 3) {
      g.box(11, conduit - 3, 0, 15, conduit + 1, 1, PAL.metalD);
      g.set(13, conduit - 2, 2, PAL.slime, true);
      g.box(8, rail - 9, 0, 12, rail - 6, 0, 0x2a2f3a);
      g.set(9, rail - 7, 1, PAL.slime, true).set(11, rail - 7, 1, PAL.red, true).set(10, rail - 8, 1, PAL.yellow);
    }
    return g;
  }, { scale: 0.1, pivot: [0, 0, 0], jitter: 0.025, skip: [5] });
}

/**
 * Sci-fi wall (about w x h units) facing +z, bottom centre at origin, front
 * plane at z = 0: instanced 2-unit voxel columns in four variants.
 */
export function makeWallPanel(w = 4, h = 3) {
  const ny = Math.max(16, Math.round(h * 10));
  const cols = Math.max(1, Math.round(w / 2));
  const items = [[], [], [], []];
  for (let c = 0; c < cols; c++) {
    const r = hash3(c, ny, cols);
    const kind = r < 0.3 ? 1 : r < 0.5 ? 2 : r < 0.68 ? 3 : 0;
    items[kind].push([-cols + c * 2, 0, 0]);
  }
  const r = new THREE.Group();
  r.name = 'wallPanel';
  items.forEach((it, k) => { if (it.length) r.add(instanced(wallColumnGeo(ny, k), it, { receive: true })); });
  return r;
}
