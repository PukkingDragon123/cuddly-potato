// 2D PIXEL-ART particles for the battle: hand-drawn sprites (4-point sparkles,
// crosses, embers, runes, bolts, droplets, snow, storm clouds, a clock glyph,
// the spell aim reticle) as camera-facing or ground-flat / tilted quads with
// nearest-filtered textures, one InstancedMesh per sprite + blend mode, so a
// screen full of them costs a handful of draw calls. Masks use '#' brightest ..
// 'o' darkest and are tinted per particle, so the shading survives any colour.
// pix(view) returns the view's system (created on first use; view.update ticks
// it); pixTexture(name) returns a sprite texture (decals, the aim reticle).
// Used by the Commander ultimate cinematic (sigCutscene.js) and the magic
// spells (spellVfx.js).
import * as THREE from 'three';

const QUAD = new THREE.PlaneGeometry(1, 1);
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _qs = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);

// mask characters -> luminance
const LUM = { '#': 255, '+': 205, '-': 150, '.': 95, o: 40 };
const SPRITES = {
  star4: ['    +    ', '    #    ', '   .#.   ', '   +#+   ', '+##+#+##+', '   +#+   ', '   .#.   ', '    #    ', '    +    '],
  plus: ['  +  ', '  #  ', '+###+', '  #  ', '  +  '],
  diamond: ['   .   ', '  .+.  ', ' .+#+. ', '.+###+.', ' .+#+. ', '  .+.  ', '   .   '],
  ember: [' .+. ', '.+#+.', '+###+', '.+#+.', ' .+. '],
  bolt: ['  .##', ' .##.', '.##. ', '####.', ' .## ', ' ##. ', '.#.  ', '#.   '],
  drop: ['  .  ', '  +  ', ' .#. ', ' +#+ ', '.###.', '+###+', '.+#+.'],
  flake: ['   +   ', ' + # + ', '  +#+  ', '+##+##+', '  +#+  ', ' + # + ', '   +   '],
  rune: [' .###. ', '.#. .#.', '#  #  #', '# ### #', '#  #  #', '.#. .#.', ' .###. '],
  hex: ['    .++.    ', '  .+####+.  ', ' +##+--+##+ ', '.##+.  .+##.', '+#+. ## .+#+', '+#+ #..# +#+', '+#+ #..# +#+', '+#+. ## .+#+', '.##+.  .+##.', ' +##+--+##+ ', '  .+####+.  ', '    .++.    '],
  cash: ['+#######+', '#-+---+-#', '#+-.#.-+#', '#-.###.-#', '#+-.#.-+#', '#-+---+-#', '+#######+'],
  flame: ['   .   ', '   +.  ', '  .#+  ', ' .+#+. ', ' +###+ ', '.+###+.', '+##-##+', '.+#-#+.', ' .+#+. '],
  chevron: ['#+.    ', '+##+.  ', ' .+##+.', '   .+##', ' .+##+.', '+##+.  ', '#+.    '],
};
/** A lumpy pixel cloud (32 x 14). */
function cloudMask() {
  const rows = [];
  const blobs = [[7, 7, 6], [15, 5, 7], [23, 7, 6], [11, 9, 5], [20, 9, 6], [28, 9, 4], [4, 10, 4]];
  for (let y = 0; y < 14; y++) {
    let row = '';
    for (let x = 0; x < 32; x++) {
      let inside = false, top = 99;
      for (const [cx, cy, r] of blobs) {
        const dx = (x + 0.5 - cx) / r, dy = (y + 0.5 - cy) / (r * 0.8);
        if (Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) / 1.35) <= 1) { inside = true; top = Math.min(top, dy); }
      }
      if (!inside || y > 12) { row += ' '; continue; }
      row += top < -0.55 ? '#' : top < -0.1 ? '+' : y > 10 ? '.' : '-';
    }
    rows.push(row);
  }
  return rows;
}
SPRITES.cloud = cloudMask();
/** A pixel clock face (33 x 33): octagon rim, ticks, two hands. */
function clockMask() {
  const g = Array.from({ length: 33 }, () => Array(33).fill(' '));
  const oct = (x, y) => { const dx = Math.abs(x - 16), dy = Math.abs(y - 16); return Math.max(dx, dy, (dx + dy) / 1.42); };
  for (let y = 0; y < 33; y++) for (let x = 0; x < 33; x++) {
    const d = oct(x, y);
    if (d >= 15 && d < 16.2) g[y][x] = '#';
    else if (d >= 13.6 && d < 15) g[y][x] = (x + y) % 2 ? '.' : '-';
    else if (d < 3) g[y][x] = d < 1.5 ? '#' : '+';
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    for (let r = 10.5; r < 13.5; r += 0.5) {
      const x = Math.round(16 + Math.sin(a) * r), y = Math.round(16 - Math.cos(a) * r);
      g[y][x] = i % 3 === 0 ? '#' : '+';
    }
  }
  const hand = (a, len, ch) => { for (let r = 2; r < len; r += 0.5) g[Math.round(16 - Math.cos(a) * r)][Math.round(16 + Math.sin(a) * r)] = ch; };
  hand(0, 10, '#');
  hand(Math.PI * 0.62, 7, '+');
  return g.map((r) => r.join(''));
}
SPRITES.clock = clockMask();
/** The spell aim reticle (48 x 48): stepped dashes, inward chevrons, crosshair. */
function reticleMask() {
  const g = Array.from({ length: 48 }, () => Array(48).fill(' '));
  const set = (x, y, ch) => { if (x >= 0 && y >= 0 && x < 48 && y < 48) g[y][x] = ch; };
  const c = 23.5;
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const dx = Math.abs(x - c), dy = Math.abs(y - c), d = Math.max(dx, dy, (dx + dy) / 1.38);
    if (d >= 21.5 && d < 23.5) {
      const a = Math.atan2(y - c, x - c);
      set(x, y, Math.floor((a + Math.PI) / (Math.PI / 16)) % 2 ? '#' : ' ');
    }
    if (d >= 19.5 && d < 21.5 && (x + y) % 3 === 0) set(x, y, '.');
  }
  for (let side = 0; side < 4; side++) for (let k = 0; k < 4; k++) for (const s of [-1, 1]) {
    const o = s * k, r = 15 - k;
    const pts = [[c + o, c - r], [c + r, c + o], [c + o, c + r], [c - r, c + o]];
    const [x, y] = pts[side];
    set(Math.round(x), Math.round(y), '+');
  }
  for (let i = -3; i <= 3; i++) { set(23 + i, 23, '#'); set(24 + i, 24, '#'); set(23, 23 + i, '#'); set(24, 24 + i, '#'); }
  return g.map((r) => r.join(''));
}
SPRITES.reticle = reticleMask();

const texCache = new Map();
/** Nearest-filtered sprite texture for a mask name (texture.aspect = w / h). */
export function pixTexture(name) {
  if (texCache.has(name)) return texCache.get(name);
  const rows = SPRITES[name] ?? SPRITES.star4;
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rows[y][x] ?? ' ';
    if (ch === ' ') continue;
    const v = LUM[ch] ?? 255, i = (y * w + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.aspect = w / h;
  texCache.set(name, tex);
  return tex;
}

const CAP = 160;
class SpriteLayer {
  constructor(scene, tex, additive) {
    const t = pixTexture(tex);
    this.aspect = t.aspect;
    this.mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.5, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
    this.mesh = new THREE.InstancedMesh(QUAD, this.mat, CAP);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    scene.add(this.mesh);
    this.list = [];
    this.additive = additive;
  }
}

class PixFx {
  constructor(scene) {
    this.scene = scene;
    this.layers = new Map();
  }
  layer(tex, additive) {
    const key = tex + (additive ? '+' : '');
    let l = this.layers.get(key);
    if (!l) { l = new SpriteLayer(this.scene, tex, additive); this.layers.set(key, l); }
    return l;
  }
  /**
   * One sprite: { tex, x, y, z, vx, vy, vz, grav, drag, delay, life, size, size1, color (hex | [hex]),
   * glow, rot, spin, flat / tilt (lie on the ground), pull: {x,y,z,k}, flicker, ground, onDie, additive }
   */
  spawn(o) {
    const l = this.layer(o.tex ?? 'star4', o.additive ?? true);
    if (l.list.length >= CAP) l.list.shift();
    const col = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : o.color ?? 0xffffff;
    l.list.push({
      x: o.x, y: o.y, z: o.z ?? 0, vx: o.vx ?? 0, vy: o.vy ?? 0, vz: o.vz ?? 0,
      grav: o.grav ?? 0, drag: o.drag ?? 0, t: -(o.delay ?? 0), life: o.life ?? 0.8,
      s0: o.size ?? 0.3, s1: o.size1 ?? (o.size ?? 0.3) * 0.2,
      col: new THREE.Color(col).multiplyScalar(o.glow ?? 1.6),
      rot: o.rot ?? 0, spin: o.spin ?? 0, flat: !!o.flat || o.tilt !== undefined, tilt: o.tilt ?? Math.PI / 2,
      pull: o.pull ?? null, flicker: o.flicker ?? 0, ground: o.ground ?? null, onDie: o.onDie ?? null,
    });
  }
  /** Radial burst of sprites (opts as spawn + count, speed, radius, up, lift). */
  burst(pos, o = {}) {
    const n = o.count ?? 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * Math.PI * 0.9;
      const sp = (o.speed ?? 4) * (0.4 + Math.random() * 0.6), r = (o.radius ?? 0) * Math.random();
      this.spawn({
        ...o,
        x: pos.x + Math.cos(a) * r, y: pos.y + (o.up ?? 0) * Math.random(), z: pos.z + Math.sin(a) * r * 0.6,
        vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + (o.lift ?? 0), vz: Math.sin(a) * Math.cos(e) * sp * 0.6,
        life: (o.life ?? 0.7) * (0.6 + Math.random() * 0.6), size: (o.size ?? 0.3) * (0.7 + Math.random() * 0.6),
        rot: o.rot ?? (Math.random() < 0.5 ? 0 : Math.PI / 4),
      });
    }
  }
  /** Sprites rushing in from a shell to a point (charge-ups). */
  converge(pos, o = {}) {
    const n = o.count ?? 6, R = o.radius ?? 2.5, life = o.life ?? 0.45;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.5) * Math.PI;
      const x = pos.x + Math.cos(a) * Math.cos(e) * R, y = pos.y + Math.sin(e) * R * 0.8, z = pos.z + Math.sin(a) * Math.cos(e) * R * 0.7;
      this.spawn({ ...o, x, y, z, vx: (pos.x - x) / life, vy: (pos.y - y) / life, vz: (pos.z - z) / life, life, size1: (o.size ?? 0.25) * 0.4 });
    }
  }
  clear() {
    for (const l of this.layers.values()) { l.list.length = 0; l.mesh.count = 0; }
  }
  update(dt, camera) {
    const camQ = camera.quaternion;
    for (const l of this.layers.values()) {
      const keep = [];
      let n = 0;
      for (const p of l.list) {
        p.t += dt;
        if (p.t < 0) { keep.push(p); continue; }
        if (p.t >= p.life) { p.onDie?.(p); continue; }
        keep.push(p);
        if (p.pull) {
          const k = Math.min(1, dt * (p.pull.k ?? 6));
          p.vx += (p.pull.x - p.x) * k * 6; p.vy += (p.pull.y - p.y) * k * 6; p.vz += (p.pull.z - p.z) * k * 6;
        }
        const dr = Math.max(0, 1 - p.drag * dt);
        p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.ground !== null && p.y < p.ground) { p.y = p.ground; p.vy = 0; }
        p.rot += p.spin * dt;
        const k = p.t / p.life;
        let s = p.s0 + (p.s1 - p.s0) * k * k;
        if (p.flicker && Math.random() < p.flicker) s *= 0.55;
        _p.set(p.x, p.y, p.z);
        _qs.setFromAxisAngle(AXIS_Z, p.rot);
        if (p.flat) _q.setFromAxisAngle(AXIS_X, -p.tilt).multiply(_qs);
        else _q.copy(camQ).multiply(_qs);
        _s.set(s * l.aspect, s, 1);
        _m.compose(_p, _q, _s);
        l.mesh.setMatrixAt(n, _m);
        const fade = l.additive ? Math.min(1, (1 - k) * 2.2) : 1;
        _c.copy(p.col).multiplyScalar(fade);
        l.mesh.setColorAt(n, _c);
        n++;
        if (n >= CAP) break;
      }
      l.list = keep;
      l.mesh.count = n;
      l.mesh.instanceMatrix.needsUpdate = true;
      if (l.mesh.instanceColor) l.mesh.instanceColor.needsUpdate = true;
    }
  }
  dispose() {
    for (const l of this.layers.values()) { this.scene.remove(l.mesh); l.mesh.dispose(); l.mat.dispose(); }
    this.layers.clear();
  }
}

/** The battle view's sprite system (created on first use; view.update ticks it). */
export function pix(view) {
  if (!view.pixfx) view.pixfx = new PixFx(view.scene);
  return view.pixfx;
}
