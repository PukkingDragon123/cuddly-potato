// 2D pixel-art particles for the LAB tab's live lab (labStage.js): one THREE.Points
// draw for every particle in the room. Each particle is a camera-facing sprite cut
// from a tiny procedural pixel atlas (8x8 tiles: pixel, smoke puff, spark, star,
// confetti strips, bubble, goo drop), tinted per particle, sized in world units,
// and faded out by dissolving its own art pixels (ordered dither), so nothing is
// ever a smooth blob, circle or ring.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';

export const TILE = { px: 0, smoke: 1, spark: 2, star: 3, confV: 4, confH: 5, bubble: 6, drop: 7 };

// 8x8 tile art: '#' full white, '+' mid grey (two-tone shading under the tint), '@' highlight
const ART = [
  ['########', '########', '########', '########', '########', '########', '########', '########'],
  ['...++...', '..+##+++', '.+####@+', '+#####@+', '+######+', '.+##+##+', '..++.++.', '........'],
  ['...#....', '...#....', '..+#+...', '###@###.', '..+#+...', '...#....', '...#....', '........'],
  ['...#....', '..###...', '#######.', '.#####..', '..###...', '.##.##..', '.#...#..', '........'],
  ['........', '...##...', '...##...', '...++...', '...++...', '...##...', '........', '........'],
  ['........', '........', '........', '.##++##.', '.##++##.', '........', '........', '........'],
  ['........', '..###...', '.#@++#..', '.#+++#..', '.#+++#..', '..###...', '........', '........'],
  ['...#....', '...#....', '..###...', '.##@##..', '.#####..', '.#####..', '..###...', '........'],
];

let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 16;
  const g = c.getContext('2d');
  ART.forEach((rows, i) => {
    const ox = (i % 4) * 8, oy = Math.floor(i / 4) * 8;
    rows.forEach((row, y) => [...row].forEach((ch, x) => {
      if (ch === '.') return;
      g.fillStyle = ch === '+' ? '#9a9a9a' : '#ffffff';
      g.fillRect(ox + x, oy + y, 1, 1);
    }));
  });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.magFilter = THREE.NearestFilter;
  atlasTex.minFilter = THREE.NearestFilter;
  atlasTex.generateMipmaps = false;
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  return atlasTex;
}

const VERT = `
attribute vec4 pcolor;
attribute vec2 pinfo; // size (world units), tile
uniform float uScale;
varying vec4 vColor;
varying float vTile;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, pinfo.x * uScale / max(0.05, -mv.z));
  vColor = pcolor;
  vTile = pinfo.y;
}`;
const FRAG = `
uniform sampler2D uAtlas;
varying vec4 vColor;
varying float vTile;
float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
void main() {
  float t = floor(vTile + 0.5);
  vec2 cell = vec2(mod(t, 4.0), floor(t / 4.0));
  vec2 texel = floor(gl_PointCoord * 8.0);
  vec2 uv = vec2((cell.x * 8.0 + texel.x + 0.5) / 32.0, 1.0 - (cell.y * 8.0 + texel.y + 0.5) / 16.0);
  vec4 tx = texture2D(uAtlas, uv);
  if (tx.a < 0.5) discard;
  // fade by dissolving the sprite's own art pixels
  if (vColor.a < 0.999 && bayer4(texel) >= vColor.a) discard;
  gl_FragColor = vec4(tx.rgb * vColor.rgb, 1.0);
  #include <colorspace_fragment>
}`;

/**
 * Pixel particle pool. spawn({ x, y, z, vx, vy, vz, life, size, size1, color, glow, tile,
 * grav, drag, wobble, flip }) ; update(dt, camera) once per frame.
 */
export class PixelFx {
  constructor(max = 700) {
    this.max = max;
    this.n = 0;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.info = new Float32Array(max * 2);
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false });
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.BufferAttribute(this.info, 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos);
    geo.setAttribute('pcolor', this.aCol);
    geo.setAttribute('pinfo', this.aInfo);
    geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: { value: atlas() }, uScale: { value: 400 } },
      vertexShader: VERT, fragmentShader: FRAG, toneMapped: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    this.points.name = 'pixelFx';
    this.geo = geo;
    this.cursor = 0;
    this._c = new THREE.Color();
    this._v = new THREE.Vector2();
  }
  spawn(o) {
    // find a free slot (round robin; recycles the oldest when full)
    let p = null;
    for (let k = 0; k < this.max; k++) {
      const q = this.p[(this.cursor + k) % this.max];
      if (!q.alive) { p = q; this.cursor = (this.cursor + k + 1) % this.max; break; }
    }
    if (!p) { p = this.p[this.cursor]; this.cursor = (this.cursor + 1) % this.max; }
    p.alive = true;
    p.x = o.x; p.y = o.y; p.z = o.z;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0; p.vz = o.vz ?? 0;
    p.t = 0; p.life = o.life ?? 1;
    p.s0 = o.size ?? 0.06; p.s1 = o.size1 ?? p.s0;
    p.grav = o.grav ?? 0; p.drag = o.drag ?? 0;
    p.tile = o.tile ?? TILE.px;
    p.flip = !!o.flip; p.wob = o.wobble ?? 0; p.ph = Math.random() * 6.28;
    p.fadeIn = o.fadeIn ?? 0;
    p.floor = o.floor ?? -1e9;
    this._c.set(o.color ?? 0xffffff);
    const k = o.glow ?? 1;
    p.r = this._c.r * k; p.g = this._c.g * k; p.b = this._c.b * k;
    return p;
  }
  burst(at, n, o = {}) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = (o.speed ?? 2) * (0.4 + Math.random() * 0.8);
      const r = Math.sqrt(1 - u * u);
      this.spawn({
        ...o, x: at.x + (Math.random() - 0.5) * (o.spread ?? 0.05), y: at.y + (Math.random() - 0.5) * (o.spread ?? 0.05), z: at.z + (Math.random() - 0.5) * (o.spread ?? 0.05),
        vx: Math.cos(a) * r * s, vy: Math.abs(u) * s * (o.up ?? 1) + (o.lift ?? 0), vz: Math.sin(a) * r * s * (o.zs ?? 0.6),
        life: (o.life ?? 1) * (0.7 + Math.random() * 0.6), color: Array.isArray(o.color) ? o.color[Math.floor(Math.random() * o.color.length)] : o.color,
      });
    }
  }
  clear() {
    for (const p of this.p) p.alive = false;
    this.geo.setDrawRange(0, 0);
  }
  update(dt, camera) {
    // world size -> pixels: drawing buffer height / (2 tan(fov / 2))
    const r = engine.renderer;
    if (r && camera) this.mat.uniforms.uScale.value = r.getDrawingBufferSize(this._v).y / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * (camera.zoom ?? 1);
    let w = 0;
    const P = this.pos, Cc = this.col, I = this.info;
    for (let i = 0; i < this.max; i++) {
      const p = this.p[i];
      if (!p.alive) continue;
      p.t += dt;
      if (p.t >= p.life) { p.alive = false; continue; }
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + p.grav * dt;
      p.x += p.vx * dt + (p.wob ? Math.sin(p.t * 7 + p.ph) * p.wob * dt : 0);
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      const u = p.t / p.life;
      let a = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
      if (p.fadeIn && p.t < p.fadeIn) a *= p.t / p.fadeIn;
      P[w * 3] = p.x; P[w * 3 + 1] = p.y; P[w * 3 + 2] = p.z;
      Cc[w * 4] = p.r; Cc[w * 4 + 1] = p.g; Cc[w * 4 + 2] = p.b; Cc[w * 4 + 3] = a;
      let tile = p.tile;
      if (p.flip) tile = Math.floor(p.t * 9 + p.ph) % 2 ? TILE.confV : TILE.confH;
      I[w * 2] = p.s0 + (p.s1 - p.s0) * u; I[w * 2 + 1] = tile;
      w++;
    }
    this.n = w;
    this.geo.setDrawRange(0, w);
    this.points.visible = w > 0;
    if (w) {
      this.aPos.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aInfo.needsUpdate = true;
    }
  }
  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
