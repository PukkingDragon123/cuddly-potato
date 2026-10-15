// Little voxel "manga" emote icons that pop above a chibi's head:
// ! ? heart anger-vein sweat-drop zzz music-note idea-bulb star $ sparkle skull.
// Geometry is built once and shared; meshes use an unlit material so they read
// clearly in any scene lighting (and don't bloom).
import * as THREE from 'three';
import { VoxGrid } from '../../core/voxel.js';

const H = 0.05;

const ART = {
  '!': { rows: ['.kkk.', 'kRRRk', 'kRRRk', 'kRRRk', 'kRRRk', '.kRk.', '.kRk.', '..k..', '.kkk.', 'kRRRk', '.kkk.'], pal: { R: 0xff3d4d } },
  '?': { rows: ['.kkkkk.', 'kYYYYYk', 'kYkkkYk', '.k..kYk', '...kYYk', '..kYYk.', '..kYk..', '..kkk..', '..kkk..', '..kYk..', '..kkk..'], pal: { Y: 0xffd23f } },
  heart: { rows: ['.kk...kk.', 'kPPk.kPPk', 'kPWPkPPPk', 'kPPPPPPPk', '.kPPPPPk.', '..kPPPk..', '...kPk...', '....k....'], pal: { P: 0xff3d7f, W: 0xffffff } },
  anger: { rows: ['.RR...RR.', 'R..R.R..R', 'R.......R', '.R.....R.', '.........', '.R.....R.', 'R.......R', 'R..R.R..R', '.RR...RR.'], pal: { R: 0xff2e4a } },
  sweat: { rows: ['...k...', '..kBk..', '..kBk..', '.kBBBk.', 'kBWBBBk', 'kBWBBBk', 'kBBBBBk', '.kBBBk.', '..kkk..'], pal: { B: 0x6cc7ff, W: 0xffffff } },
  zzz: { rows: ['......kkkkk', '......kZZZk', '.......kZk.', '......kZZZk', 'kkkk..kkkkk', 'kZZk.......', '.kZk.......', 'kZZk.......', 'kkkk.......'], pal: { Z: 0x9fd8ff } },
  note: { rows: ['...kkkkk', '...kNNNk', '...kNkkk', '...kNk..', '...kNk..', '.kkkNk..', 'kNNNNk..', 'kNNNNk..', '.kkkk...'], pal: { N: 0x29b6f6 } },
  idea: { rows: ['..kkkk..', '.kLLLLk.', 'kLLWLLLk', 'kLWLLLLk', 'kLLLLLLk', '.kLLLLk.', '..kGGk..', '..kGGk..', '...kk...'], pal: { L: 0xffe27a, W: 0xffffff, G: 0x9aa0b0 }, glow: 'L' },
  star: { rows: ['...k...', '..kYk..', 'kkYYYkk', 'kYYWYYk', '.kYYYk.', 'kYk.kYk', 'kk...kk'], pal: { Y: 0xffd23f, W: 0xffffff } },
  cash: { rows: ['..kGk..', '.kGGGk.', 'kGkGkk.', 'kGGGGk.', '.kkGkGk', '.kGGGGk', '..kGk..'], pal: { G: 0x2fbf4f } },
  sparkle: { rows: ['...k...', '..kWk..', '.kWYWk.', 'kWYYYWk', '.kWYWk.', '..kWk..', '...k...'], pal: { W: 0xffffff, Y: 0xfff3a0 } },
  skull: { rows: ['.kkkkk.', 'kWWWWWk', 'kWkWkWk', 'kWkWkWk', 'kWWWWWk', '.kWkWk.', '..kkk..'], pal: { W: 0xf4f4f4 } },
  music: null,
};
ART.music = ART.note;
ART['!!'] = { rows: ['.kkk..kkk.', 'kRRRkkRRRk', 'kRRRkkRRRk', 'kRRRkkRRRk', '.kRk..kRk.', '.kRk..kRk.', '..k....k..', '.kkk..kkk.', 'kRRRkkRRRk', '.kkk..kkk.'], pal: { R: 0xff3d4d } };

export const EMOTES = Object.keys(ART);

const geoCache = new Map();
const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
glowMat.color.setScalar(1.6);

function emoteGeo(name) {
  if (geoCache.has(name)) return geoCache.get(name);
  const a = ART[name] ?? ART['!'];
  const g = new VoxGrid();
  const rows = a.rows;
  const w = rows[0].length;
  for (let r = 0; r < rows.length; r++)
    for (let q = 0; q < w; q++) {
      const ch = rows[r][q];
      if (ch === '.' || ch === ' ') continue;
      const c = ch === 'k' ? 0x1b1530 : a.pal[ch];
      if (c === undefined) continue;
      const x = q - Math.floor(w / 2), y = rows.length - 1 - r;
      g.set(x, y, 0, c, a.glow === ch);
      if (ch !== 'k') g.set(x, y, 1, c, a.glow === ch);
      else g.set(x, y, -1, 0x1b1530);
    }
  const geo = g.build({ scale: H, pivot: 'center', jitter: 0.02, ao: false });
  geoCache.set(name, geo);
  return geo;
}

/** One emote bubble: pops in, bobs, then shrinks away. */
export class Emote {
  constructor(parent) {
    this.root = new THREE.Group();
    this.root.visible = false;
    parent.add(this.root);
    this.mesh = new THREE.Mesh(emoteGeo('!'), [mat, glowMat]);
    this.root.add(this.mesh);
    this.extra = []; // orbiting copies (dizzy stars)
    this.t = 0;
    this.dur = 0;
    this.name = null;
  }
  show(name, dur = 1.4) {
    if (!ART[name]) return;
    this.name = name;
    this.mesh.geometry = emoteGeo(name);
    this.t = 0;
    this.dur = dur;
    this.root.visible = true;
    const orbit = name === 'star';
    if (orbit && !this.extra.length) for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(emoteGeo('star'), [mat, glowMat]); this.root.add(m); this.extra.push(m); }
    for (const m of this.extra) m.visible = orbit;
  }
  hide() {
    this.root.visible = false;
    this.name = null;
  }
  update(dt) {
    if (!this.root.visible) return;
    this.t += dt;
    const t = this.t;
    const tail = this.dur - t;
    if (this.dur > 0 && tail <= 0) { this.hide(); return; }
    // springy pop-in, soft shrink out
    const pin = Math.min(1, t / 0.22);
    let s = pin < 1 ? 1 + Math.sin(pin * Math.PI) * 0.35 - (1 - pin) * 0.9 : 1;
    if (this.dur > 0 && tail < 0.2) s *= tail / 0.2;
    const n = this.name;
    const m = this.mesh;
    m.position.set(0, 0, 0);
    m.rotation.set(0, 0, 0);
    if (n === 'star') {
      // dizzy stars orbit the head
      const all = [m, ...this.extra];
      for (let i = 0; i < all.length; i++) {
        const a = t * 4 + (i * Math.PI * 2) / all.length;
        all[i].position.set(Math.cos(a) * 0.55 - 0.5, -0.2 + Math.sin(a * 2) * 0.04, Math.sin(a) * 0.45);
        all[i].rotation.y = -a;
        all[i].scale.setScalar(0.8);
      }
      this.root.scale.setScalar(Math.max(0.001, s) * 0.8);
      return;
    }
    m.scale.setScalar(1);
    if (n === 'zzz' || n === 'note' || n === 'music') {
      m.position.y = (t * 0.25) % 0.3;
      m.position.x = Math.sin(t * 3) * 0.05;
    } else if (n === 'anger') {
      const p = 1 + Math.max(0, Math.sin(t * 14)) * 0.18;
      m.scale.setScalar(p);
    } else if (n === 'sweat') {
      m.position.y = -((t * 0.4) % 0.2);
    } else if (n === 'heart') {
      m.position.y = Math.sin(t * 5) * 0.04;
      m.scale.setScalar(1 + Math.max(0, Math.sin(t * 9)) * 0.12);
    } else {
      m.position.y = Math.sin(t * 6) * 0.03;
      m.rotation.z = Math.sin(t * 8) * 0.08;
    }
    this.root.scale.setScalar(Math.max(0.001, s) * 0.8);
  }
}
