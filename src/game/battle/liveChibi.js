// A LIVE 3D Commander inside a HUD button: the real Chibi (same rig, face and
// animations as on the base roof), rendered every other frame through the
// engine's small thumbnail renderer and blitted into a 2D canvas, so it can
// sit in the DOM (rings, liquid, labels on top) without a WebGL context per
// button. It idles and fidgets, gets fired up as its ultimate charges
// (fist pumps, flexes, an energy rim light), and plays a full-body action
// when the ultimate is unleashed or an emote is sent.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { Chibi, CHIBI_HEIGHT } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { h } from '../../ui/ui.js';

const CHARGED_POSES = ['fistPump', 'flex', 'thumbsUp', 'salute'];
const READY_POSES = ['flex', 'fistPump', 'taunt', 'celebrate'];

export class LiveChibi {
  /** cmd: the side's commander config ({ char | id, override }), o: { size, color } */
  constructor(cmd, o = {}) {
    const def = { ...CHARACTERS[cmd.char ?? cmd.id], ...(cmd.override ?? {}) };
    this.size = o.size ?? 160;
    this.canvas = h('canvas', { class: 'u-live', width: this.size, height: this.size });
    this.ctx = this.canvas.getContext('2d');
    this.ch = new Chibi(def, { scale: 1 });
    this.ch.root.rotation.y = -0.38;
    this.ch.play('idle');
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xe8f4ff, 0x4a3a6a, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.6);
    key.position.set(3, 5, 6);
    this.rim = new THREE.DirectionalLight(new THREE.Color(o.color ?? '#ffd84a'), 0.6);
    this.rim.position.set(-4, 3, -3);
    const fill = new THREE.DirectionalLight(0xbfe0ff, 0.7);
    fill.position.set(-4, -1, 5);
    this.scene.add(key, this.rim, fill, this.ch.root);
    this.cam = new THREE.PerspectiveCamera(24, 1, 0.1, 40);
    this.zoom = 1;
    this.zoomV = 0;
    this.t = 0;
    this.frameT = 0;
    this.state = 'idle';
    this.poseT = 2;
    this.busyT = 0;
    this.envSwap = [];
    this.visible = true;
  }

  /** 'idle' | 'charged' | 'ready' | 'used' */
  setState(s) {
    if (s === this.state) return;
    const prev = this.state;
    this.state = s;
    this.poseT = 0.2;
    if (s === 'ready' && prev !== 'ready') { this.ch.react('celebrate', { dur: 1.2 }); this.busyT = 1.2; this.kick(0.18); }
    if (s === 'idle' || s === 'used') { this.ch.setLoop('idle'); this.ch.mood('neutral'); }
  }
  /** Camera punch-in (positive = zoom in). */
  kick(k) {
    this.zoomV += k * 22;
  }
  /** The ultimate is unleashed: a full-body shout + throw. */
  action() {
    const ch = this.ch;
    ch.play('throw', { restart: true, dur: 0.6, then: 'idle', face: false });
    ch.mood('rage', 1.4);
    ch.boing(0.5);
    ch.flash(0.1);
    this.busyT = 1.4;
    this.kick(0.35);
    setTimeout(() => { if (this.ch) { ch.react('victory', { dur: 0.9 }); } }, 600);
  }
  /** Mirror an emote: wind-up then the reaction. */
  emote(em, wind = 0.7) {
    const ch = this.ch;
    ch.play(em.wind ?? 'think', { restart: true, dur: wind, then: 'idle', face: false });
    ch.mood(em.windMood ?? 'focus', wind);
    ch.boing(-0.25);
    this.busyT = wind + (em.dur ?? 1.5);
    setTimeout(() => {
      if (!this.ch) return;
      ch.react(em.act, { dur: em.dur ?? 1.5, seated: false });
      if (em.mood) ch.mood(em.mood, em.dur ?? 1.5);
      if (em.vox) ch.emote(em.vox, em.dur ?? 1.5);
      ch.boing(0.55);
      this.kick(0.25);
    }, wind * 1000);
  }
  poke() {
    this.ch.react(Math.random() < 0.5 ? 'fistPump' : 'flex', { dur: 0.9 });
    this.ch.boing(0.35);
    this.busyT = 0.9;
    this.kick(0.12);
  }

  update(dt, k = 0) {
    if (!this.ch) return;
    this.t += dt;
    const ch = this.ch;
    const n = Math.min(4, Math.ceil(dt / (1 / 40)));
    for (let i = 0; i < n; i++) ch.update(dt / n);
    // state-driven acting
    this.busyT -= dt;
    this.poseT -= dt;
    if (this.busyT <= 0 && this.poseT <= 0) {
      if (this.state === 'ready') {
        const p = READY_POSES[(Math.random() * READY_POSES.length) | 0];
        ch.react(p, { dur: 1.3 });
        ch.mood(Math.random() < 0.5 ? 'excited' : 'proud', 1.3);
        this.poseT = 1.35;
      } else if (this.state === 'charged') {
        if (Math.random() < 0.5) { ch.react(CHARGED_POSES[(Math.random() * CHARGED_POSES.length) | 0], { dur: 1.2 }); this.poseT = 1.2 + Math.random() * 2.5; }
        else { ch.mood('determined', 1.5); this.poseT = 1.5; }
      } else this.poseT = 3;
    }
    // energy rim light grows with the charge, strobes when ready
    this.rim.intensity = 0.5 + k * 2.6 + (this.state === 'ready' ? Math.max(0, Math.sin(this.t * 14)) * 2.5 : 0);
    // springy camera
    for (let i = 0, h2 = Math.min(dt, 0.1) / n; i < n; i++) {
      this.zoomV += (-(this.zoom - 1) * 160 - this.zoomV * 13) * h2;
      this.zoom += this.zoomV * h2;
    }
    this.zoom = Math.max(0.8, Math.min(1.5, this.zoom));
    // render at ~30 fps while visible
    this.frameT -= dt;
    if (this.frameT > 0 || !this.visible || !this.canvas.isConnected) return;
    this.frameT = 1 / 30;
    this.render();
  }

  render() {
    const r = engine.thumbRenderer ?? (engine.renderThumb(new THREE.Group(), { size: 4 }), engine.thumbRenderer);
    if (!r) return;
    const S = this.size;
    r.setPixelRatio(1);
    const sz = r.getSize(new THREE.Vector2());
    if (sz.x !== S || sz.y !== S) r.setSize(S, S, false);
    r.setClearColor(0x000000, 0);
    // bust framing (head + chest, arms in when they go up), with a punchy zoom
    const H = CHIBI_HEIGHT;
    this.camY = (this.camY ?? 0) + (this.ch.inner.position.y - (this.camY ?? 0)) * 0.35;
    const cy = H * 0.6 + this.camY;
    const dist = (H * 2.2) / Math.max(0.6, this.zoom);
    this.cam.position.set(0.15, cy + H * 0.12, dist);
    this.cam.lookAt(0, cy, 0);
    // this context needs its own env map + no scene colour grade
    const sw = this.envSwap;
    sw.length = 0;
    this.ch.root.traverse((o) => {
      for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) if (m.envMap && m.envMap === engine.envMap) { m.envMap = engine.thumbEnv; sw.push(m); }
    });
    const g = engine.grade;
    engine.setGrade(null);
    try {
      r.render(this.scene, this.cam);
    } finally {
      for (const m of sw) m.envMap = engine.envMap;
      engine.setGrade(g);
    }
    this.ctx.clearRect(0, 0, S, S);
    this.ctx.drawImage(r.domElement, 0, 0, S, S);
  }

  dispose() {
    this.scene.remove(this.ch.root);
    this.ch = null;
    this.canvas.remove();
  }
}
