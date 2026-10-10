// Arena building kit: defensive prop factory wrapper (props.js first, voxel fallback
// second), size fitting, canvas text signs, quest markers and small helpers.
import * as THREE from 'three';
import * as Props from '../../models/props.js';
import * as FB from './fallbacks.js';
import { VoxGrid, makeMesh, cachedGeometry, Mats } from '../../core/voxel.js';

const warned = new Set();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/** Call Props[name](...args) if it exists and works, else the local fallback. Returns { value, real }. */
export function propRaw(name, ...args) {
  return propRawOpt(name, args, false);
}
function propRawOpt(name, args, forceFallback) {
  const f = forceFallback ? null : Props[name];
  if (typeof f === 'function') {
    try {
      const r = f(...args);
      if (r && (r.isObject3D || r.root?.isObject3D)) return { value: r, real: true };
    } catch (e) {
      if (!warned.has(name)) {
        warned.add(name);
        console.warn(`[arena] Props.${name} threw, using fallback:`, e?.message || e);
      }
    }
  }
  const fb = FB[name];
  if (!fb) throw new Error('No fallback for prop ' + name);
  return { value: fb(...args), real: false };
}
export const rootOf = (r) => (r?.isObject3D ? r : r?.root);

/**
 * Create a prop, normalised to { root, update?, real, raw }.
 * opts.fit: { h | w | d | max } target size used for REAL props only (unknown scale),
 *           clamp: only rescale if off by more than this factor (default: always).
 */
export function prop(name, args = [], opts = {}) {
  const { value, real } = propRawOpt(name, args, !!opts.fallback);
  const root = rootOf(value);
  const out = { root, update: typeof value.update === 'function' ? value.update.bind(value) : null, real, raw: value };
  if (real && opts.fit) fit(root, opts.fit);
  return out;
}

/** Uniformly scale obj so its bounding box matches a target dimension. */
export function fit(obj, f) {
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  if (_box.isEmpty()) return obj;
  _box.getSize(_size);
  let k = 1;
  if (f.h) k = f.h / Math.max(0.01, _size.y);
  else if (f.w) k = f.w / Math.max(0.01, _size.x);
  else if (f.d) k = f.d / Math.max(0.01, _size.z);
  else if (f.max) k = f.max / Math.max(0.01, _size.x, _size.y, _size.z);
  const clamp = f.clamp ?? 1;
  if (k < 1 / clamp || k > clamp) obj.scale.multiplyScalar(k);
  return obj;
}

export function bboxSize(obj) {
  obj.updateMatrixWorld(true);
  _box.setFromObject(obj);
  return _box.getSize(new THREE.Vector3());
}

// ---------------------------------------------------------------------------
// Canvas text signs

const PIX = {
  k: '#0d1029', w: '#ffffff', y: '#ffd23f', Y: '#e0a21a', s: '#c8ccd8', S: '#8a93b8', r: '#ff4a4a', R: '#b8282f', p: '#ff2e88',
};
const SIGN_ICONS = {
  trophy: ['..kkkkkkkk..', 'kkkwyyyyYkkk', 'kykwyyyyYkyk', 'kykyyyyyYkyk', '.kkyyyyyYkk.', '..kyyyyyYk..', '...kkyYkk...', '....kyYk....', '....kyYk....', '...kkkkkk...', '..kYyyyyYk..', '..kkkkkkkk..'],
  lock: ['....kkkk....', '...kSSSSk...', '..kSk..kSk..', '..kSk..kSk..', '.kkkkkkkkkk.', '.kyyyyyyyYk.', '.kyyykkyyYk.', '.kyyykkyyYk.', '.kyyyykyyYk.', '.kYYYYYYYYk.', '.kkkkkkkkkk.'],
  skull: ['..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwwwwwwwwwk', 'kwkkwwwwkkwk', 'kwkkwwwwkkwk', 'kwwwwkkwwwwk', '.kwwwwwwwwk.', '..kwkwkwkk..', '..kkkkkkkk..'],
  play: ['kk........', 'kwkk......', 'kwwwkk....', 'kwwwwwkk..', 'kwwwwwwwk.', 'kwwwwwkk..', 'kwwwkk....', 'kwkk......', 'kk........'],
};
function drawIcon(ctx, name, x, y, px) {
  const rows = SIGN_ICONS[name];
  if (!rows) return 0;
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      ctx.fillStyle = PIX[ch];
      ctx.fillRect(x + i * px, y + j * px, px, px);
    }
  });
  return rows[0].length * px;
}

const texCache = new Map();
/**
 * Pixel-font sign texture. lines: [{ text, size, color, icon }] or a string.
 * Returns a Mesh (plane facing +Z) of world size w x h.
 */
export function textPanel(lines, opts = {}) {
  if (typeof lines === 'string') lines = [{ text: lines }];
  const w = opts.w ?? 3, hgt = opts.h ?? 1;
  const ppu = opts.ppu ?? 40;
  const key = JSON.stringify([lines, w, hgt, opts.bg, opts.border, opts.fg, ppu]);
  let tex = texCache.get(key);
  if (!tex) {
    const cw = Math.round(w * ppu), ch = Math.round(hgt * ppu);
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    if (opts.bg !== null) {
      ctx.fillStyle = opts.bg ?? '#1c2558';
      ctx.fillRect(0, 0, cw, ch);
    }
    if (opts.border) {
      const b = Math.max(2, Math.round(ppu * 0.08));
      ctx.fillStyle = opts.border;
      ctx.fillRect(0, 0, cw, b);
      ctx.fillRect(0, ch - b, cw, b);
      ctx.fillRect(0, 0, b, ch);
      ctx.fillRect(cw - b, 0, b, ch);
    }
    const total = lines.reduce((s, l) => s + (l.size ?? 0.32) * ppu * 1.3, 0);
    let y = (ch - total) / 2;
    for (const l of lines) {
      const fs = Math.round((l.size ?? 0.32) * ppu);
      ctx.font = `${fs}px "Press Start 2P", "Pixelify Sans", monospace`;
      ctx.textBaseline = 'top';
      const tw = ctx.measureText(l.text).width;
      const ipx = Math.max(1, Math.round(fs / 10));
      const iw = l.icon ? (SIGN_ICONS[l.icon]?.[0].length ?? 0) * ipx + fs * 0.3 : 0;
      let x = (cw - tw - iw) / 2;
      const ty = y + fs * 0.15;
      if (l.icon) {
        drawIcon(ctx, l.icon, Math.round(x), Math.round(ty - ipx), ipx);
        x += iw;
      }
      // outline
      ctx.fillStyle = l.outline ?? '#0d1029';
      const o = Math.max(1, Math.round(fs / 9));
      for (const [dx, dy] of [[o, 0], [-o, 0], [0, o], [0, -o], [o, o], [-o, o], [o, -o], [-o, -o]]) ctx.fillText(l.text, x + dx, ty + dy);
      ctx.fillStyle = l.color ?? opts.fg ?? '#ffffff';
      ctx.fillText(l.text, x, ty);
      y += fs * 1.3;
    }
    tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    texCache.set(key, tex);
  }
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: opts.bg === null, alphaTest: opts.bg === null ? 0.2 : 0, toneMapped: false, side: opts.double ? THREE.DoubleSide : THREE.FrontSide });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), mat);
  m.userData.noBake = true;
  return m;
}

/** Sign board on posts with text. Faces +Z. */
export function signBoard(lines, opts = {}) {
  const g = new THREE.Group();
  const w = opts.w ?? 3, hgt = opts.h ?? 1.1, y = opts.y ?? 1.4;
  const panel = textPanel(lines, { w, h: hgt, bg: opts.bg, border: opts.border ?? '#0d1029', fg: opts.fg });
  panel.position.set(0, y + hgt / 2, 0.08);
  g.add(panel);
  const backCol = opts.frame ?? 0x5a3a20;
  const back = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, hgt + 0.16, 0.12), new THREE.MeshLambertMaterial({ color: backCol }));
  back.position.set(0, y + hgt / 2, 0);
  back.castShadow = true;
  g.add(back);
  if (opts.posts !== false) {
    const pm = new THREE.MeshLambertMaterial({ color: opts.postColor ?? 0x6a4a2a });
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, y + 0.1, 0.14), pm);
      p.position.set(s * (w / 2 - 0.25), (y + 0.1) / 2, -0.05);
      p.castShadow = true;
      g.add(p);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Quest markers ("!" / "?") as glowing voxels

export function makeMarker(kind = '!', color = 0xffd23f) {
  const geo = cachedGeometry(`arena:marker${kind}${color}`, () => {
    const g = new VoxGrid();
    const ink = 0x0d1029;
    if (kind === '!') {
      g.box(-1, 3, 0, 0, 9, 0, color, true);
      g.box(-1, 0, 0, 0, 1, 0, color, true);
    } else {
      g.box(-2, 7, 0, 1, 8, 0, color, true);
      g.box(1, 5, 0, 2, 7, 0, color, true);
      g.box(-1, 4, 0, 0, 5, 0, color, true);
      g.box(-1, 3, 0, 0, 3, 0, color, true);
      g.box(-3, 6, 0, -3, 7, 0, color, true);
      g.box(-1, 0, 0, 0, 1, 0, color, true);
    }
    // ink outline behind
    const out = new VoxGrid();
    g.forEach((x, y, z) => {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!g.has(x + dx, y + dy, z)) out.set(x + dx, y + dy, -1, ink);
    });
    g.merge(out);
    return g;
  }, { scale: 0.09, pivot: 'center' });
  const m = makeMesh(geo, Mats.pair);
  m.castShadow = false;
  m.userData.noBake = true;
  return m;
}

/** Soft blob shadow decal (cheap shadow for small critters). */
let blobGeo = null, blobMat = null;
export function blobShadow(r = 0.4) {
  if (!blobGeo) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const ctx = c.getContext('2d');
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5) / 8;
        if (d < 1) {
          ctx.fillStyle = `rgba(0,0,0,${d < 0.7 ? 0.35 : 0.18})`;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    blobGeo = new THREE.PlaneGeometry(1, 1);
    blobGeo.rotateX(-Math.PI / 2);
    blobMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(blobGeo, blobMat);
  m.scale.set(r * 2, 1, r * 2);
  m.position.y = 0.02;
  m.renderOrder = 1;
  m.userData.noBake = true;
  return m;
}

/** Invisible pick proxy (cylinder) for raycasting taps on world objects. */
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
export function pickProxy(r = 0.8, hgt = 2) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, hgt, 8), proxyMat);
  m.position.y = hgt / 2;
  m.userData.noBake = true;
  return m;
}
