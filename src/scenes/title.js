// Title screen: a movie title sequence over the frozen cinematic battle.
//
// The UI is up the instant the scene starts (no 3D needed): letterbox bars,
// grain, a painted "clash in the dark" backdrop and the logo assembling letter
// by letter. Meanwhile the frozen battle (frozenBattle.js, code-split so boot
// stays lean) is staged in the player's current arena; when it is ready it
// fades up from the backdrop and the camera starts its shots: a slow pull-back
// reveal of the whole fight, then a loop of push-ins and tracking moves (your
// Commander, your Swarm line, the leaper hanging in the air, the battered rival
// base, a wide crane) with dips to black and lower-third captions.
// A few frames are captured as stills for the loading screen (loading.js).
//
// TAP TO START:
//   new players -> inside the Lab (scenes/lab.js): Jimmy, your name, your
//                  FIRST PACK, then the tutorial battle and back to the Lab
//   everyone else -> Beast Island home
import * as THREE from 'three';
import './cinematic.css';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { particles } from '../core/particles.js';
import { h, $ui, closeDialogue } from '../ui/ui.js';
import { state } from '../game/state.js';
import { game } from '../game/game.js';
import { currentArena } from '../data/arenas.js';
import { cineBackdrop, cineDressing, cineLogo, setLoadingStills } from './loading.js';

const frames = (n = 2) => new Promise((r) => { const f = () => (--n <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); });
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
// shot order after the opening reveal (indices into FrozenBattle.shots())
const LOOP = [1, 2, 3, 4, 5];
const CUT = 0.27; // seconds from the start of a dip-to-black to its darkest point

export class TitleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020208);
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 600);
    this.t = 0;
    this.fb = null;
    this.stills = [];
  }

  get bloom() { return this.fb?.bloom ?? {}; }

  async enter(params = {}) {
    this.params = params;
    // ---- UI, up immediately
    this.cut = h('i', { class: 'cn-cut' });
    this.flash = h('i', { class: 'cn-flash' });
    this.cap = h('div', { class: 'cn-cap' }, h('span', { class: 'k' }), h('span', { class: 'n' }));
    this.startEl = h('div', { class: 'tt-start' }, 'TAP TO START');
    this.root = h('div', { class: 'tt-cine' },
      h('div', { class: 'tt-pre' }, cineBackdrop()),
      h('div', { class: 'cn-layer' }, cineDressing(), this.cut, this.flash, this.cap),
      h('div', { class: 'tt-load' }, h('i'), h('span', {}, 'STAGING')),
      h('div', { class: 'tt-wrap' },
        h('div', { class: 'tt-logo-wrap' }, cineLogo({ reveal: true })),
        h('div', { class: 'tt-foot' },
          this.startEl,
          h('div', { class: 'tt-disc' }, 'Unofficial fan-made game. Not affiliated with MrBeast or Moose Toys. MrBeast Lab Swarms are toys by Moose Toys.'))));
    $ui().appendChild(this.root);
    audio.music('title');
    // a tutorial that was interrupted after the battle picks up in the Lab
    if (state.p.tutorial === 'briefcase') { this.root.style.display = 'none'; setTimeout(() => game.go('lab', { step: 'won' }), 300); return; }
    this.onTap = (e) => {
      if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      this.unbind();
      audio.unlock();
      audio.play('go');
      this.start();
    };
    this.root.addEventListener('pointerdown', this.onTap);
    engine.canvas.addEventListener('pointerdown', this.onTap);
    window.addEventListener('keydown', this.onTap);
    // ---- 3D, built after the title has painted (never blocks the first frame)
    this.build();
  }

  unbind() {
    this.root?.removeEventListener('pointerdown', this.onTap);
    engine.canvas.removeEventListener('pointerdown', this.onTap);
    window.removeEventListener('keydown', this.onTap);
  }

  async build() {
    // let the title paint and the boot screen / router fade finish first, so the
    // logo is on screen before the (main-thread heavy) staging starts
    await frames(3);
    await wait(0.8);
    await frames(2);
    if (this.exited) return;
    let fb;
    try {
      const { buildFrozenBattle } = await import('./frozenBattle.js');
      if (this.exited) return;
      const k = Math.max(0, currentArena(state.p.bestTrophies ?? 0).index);
      fb = await buildFrozenBattle(k);
    } catch (e) {
      console.error('title cinematic failed', e);
      return; // the painted backdrop stays: still a complete title screen
    }
    if (this.exited) { fb.dispose(); return; }
    // compile its shaders before it is ever drawn (in parallel where the driver supports it)
    await engine.precompile(fb.scene, fb.camera);
    if (this.exited) { fb.dispose(); return; }
    this.fb = fb;
    this.scene = fb.scene;
    this.camera = fb.camera;
    fb.resize(engine.width, engine.height);
    fb.sun?.shadow.mapSize.set(engine.shadowRes ?? 2048, engine.shadowRes ?? 2048);
    particles.attach(fb.scene);
    particles.clear();
    engine.setBloom(fb.bloom || {});
    engine.setGrade(fb.liveGrade);
    this.shots = fb.shots();
    this.loopI = 0;
    fb.setShot(this.shots[0]);
    this.shotN = 0;
    // let it render (and compile) under the backdrop, then fade the 3D up
    await frames(3);
    if (this.exited) return;
    this.root.classList.add('live');
    this.live = true;
  }

  /** Next shot: dip to black (or a white hit-flash into the leap), swap at the darkest point. */
  nextShot() {
    const sh = this.shots[LOOP[this.loopI % LOOP.length]];
    this.loopI++;
    const el = sh.id === 'leap' ? this.flash : this.cut;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
    this.pendingShot = sh;
    this.cutAt = this.t + (sh.id === 'leap' ? 0.06 : CUT);
    if (sh.id === 'leap') audio.play('whoosh', { pitch: 1.4, vol: 0.25, gap: 0.5 });
  }
  applyShot(sh) {
    this.fb.setShot(sh);
    this.shotN++;
    const c = this.cap;
    if (sh.cap) {
      c.querySelector('.k').textContent = sh.cap.k;
      c.querySelector('.n').textContent = sh.cap.n;
      c.style.setProperty('--ac', sh.cap.ac ?? '#9ff2ff');
      c.classList.remove('go');
      void c.offsetWidth;
      c.classList.add('go');
    }
    // stills for the loading screen: a few distinct frames, mid-move
    if (this.stills.length < 3 && ['cmd', 'leap', 'wide', 'rival'].includes(sh.id)) this.snapAt = this.t + sh.dur * 0.45;
  }

  /** Grab the current frame (rendered now, so the drawing buffer is valid) as a JPEG still. */
  capture() {
    const fb = this.fb;
    if (!fb || typeof engine.canvas.toBlob !== 'function') return;
    try {
      engine.render(fb.scene, fb.camera);
      engine.canvas.toBlob((b) => {
        if (!b || this.stills.length >= 3) return;
        this.stills.push(URL.createObjectURL(b));
        setLoadingStills(this.stills);
      }, 'image/jpeg', 0.86);
    } catch (e) { /* stills are optional */ }
  }

  async start() {
    this.root.classList.add('go');
    this.flash.classList.remove('go');
    void this.flash.offsetWidth;
    this.flash.classList.add('go');
    // the first wide frame is always worth keeping for the loading screen
    const S = this.fb?.cineShot;
    if (this.live && !this.stills.length && S && (S.id !== 'reveal' || S.t > S.dur * 0.5)) this.capture();
    await wait(0.32);
    const p = state.p;
    if (p.tutorial === 'done' || p.tutorial === 'home') game.go('home');
    else game.go('lab'); // first time: into the Lab to meet Jimmy and open your first pack
  }

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this.fb?.resize(w, hh);
  }

  update(dt) {
    this.t += dt;
    const fb = this.fb;
    if (!fb) return;
    fb.update(dt);
    engine.setGrade(fb.liveGrade);
    if (!this.live) return;
    if (this.pendingShot && this.t >= this.cutAt) {
      const sh = this.pendingShot;
      this.pendingShot = null;
      this.applyShot(sh);
      fb.update(0);
    }
    const S = fb.cineShot;
    if (S && !this.pendingShot && S.t >= S.dur - CUT) this.nextShot();
    if (this.snapAt && this.t >= this.snapAt) { this.snapAt = 0; this.capture(); }
  }

  exit() {
    this.exited = true;
    this.unbind();
    closeDialogue();
    // free the frozen battle once the next scene has taken over
    const fb = this.fb;
    this.fb = null;
    if (fb) setTimeout(() => { try { fb.dispose(); } catch (e) { /* ignore */ } }, 0);
  }
}
