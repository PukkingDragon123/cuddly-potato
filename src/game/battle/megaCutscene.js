// MEGA ultimate cutscene + Mega special-attack effects.
//
// The battle freezes (sim.cinematic) while a giant MrBeast Lab containment cup
// slams down in front of the base, water pours in, the MEGA-TECH Mutator
// figure mutates to full size inside, the glass cracks and it BREAKS OUT with
// a roar. Letterbox bars, alarms, slow-mo and a name slam sell the moment.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { animate } from '../../core/tween.js';
import { h, $overlay } from '../../ui/ui.js';
import { createSwarm } from '../../models/swarmModels.js';
import { MEGAS } from '../../data/megas.js';
import { battleCamera } from '../../models/arenas/kit.js';
import { glassMat } from '../../models/props/common.js';
import './megaCutscene.css';

const CONTAINMENT = import.meta.glob('../../models/props/containment.js', { eager: true });
const containmentModule = Object.values(CONTAINMENT)[0] ?? null;

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hexOf = (css) => parseInt(String(css).replace('#', ''), 16);

/** Simple stand-in vessel used until the dedicated containment model exists. */
function fallbackVessel() {
  const root = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 6.4, 28, 1, true), glassMat(0xbfe9ff, 0.25));
  glass.position.y = 3.6;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1, 28), new THREE.MeshBasicMaterial({ color: 0x29b6f6, transparent: true, opacity: 0.45, depthWrite: false }));
  water.position.y = 0.4;
  water.scale.y = 0.01;
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a93aa, roughness: 0.35, metalness: 0.7 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.5, 28), metal);
  base.position.y = 0.25;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.4, 0.45, 28), metal);
  lid.position.y = 7;
  root.add(glass, water, base, lid);
  let crack = 0;
  return {
    root, height: 7.3,
    update() {},
    setFill(k) { water.scale.y = Math.max(0.01, k * 6.2); water.position.y = 0.5 + k * 3.1; },
    setCrack(k) { crack = k; glass.material.opacity = 0.25 + k * 0.35; },
    setGlow() {},
    burst() { root.remove(glass, water, lid); void crack; return [glass, lid]; },
    dispose() {},
  };
}

/**
 * Play the cutscene for a 'megaStart' event. Returns a controller the view
 * drives every frame: { update(dt), finish(ev), done, ownsCamera }.
 */
export function playMegaCutscene(view, ev) {
  const def = MEGAS[ev.id];
  const side = ev.side;
  const dir = side === 0 ? 1 : -1;
  const x = ev.x;
  const scene = view.scene;
  const cam = view.camera;
  // the Mega figure (full-size height H drives the vessel size and camera shots)
  const rig = createSwarm(ev.id, { variant: ev.variant, scale: def?.size ?? 3.4 });
  const H = Math.max(2, rig.height || 6);
  // vessel, scaled so the full-grown figure just fits inside
  const wantH = H * 1.18 + 1.4;
  let vessel;
  try {
    vessel = containmentModule?.makeContainment
      ? containmentModule.makeContainment({ height: wantH, accent: hexOf(def?.bolt ?? '#ff2e88') })
      : fallbackVessel();
  } catch (e) { console.warn('containment failed', e); vessel = fallbackVessel(); }
  const vs = vessel.interior ? 1 : Math.max(0.6, wantH / (vessel.height ?? 7.3));
  vessel.root.scale.setScalar(vs);
  const floorY = (vessel.interior?.floorY ?? 0.45) * vs;
  const dropH = 10 + H * 1.5;
  vessel.root.position.set(x, dropH, 0);
  scene.add(vessel.root);
  rig.root.position.set(x, floorY, 0);
  rig.root.rotation.y = dir > 0 ? Math.PI / 2 - 0.5 : -Math.PI / 2 + 0.5;
  rig.baseScale = (def?.size ?? 3.4) * 0.3;
  rig.setState('idle');
  rig.root.visible = false;
  scene.add(rig.root);
  // overlay: letterbox + title
  const top = h('div', { class: 'mc-bar top' }), bot = h('div', { class: 'mc-bar bot' });
  const flash = h('div', { class: 'mc-flash' });
  const warn = h('div', { class: 'mc-warn' }, '⚠ MEGA CONTAINMENT BREACH ⚠');
  const title = h('div', { class: 'mc-title' }, h('small', {}, side === 0 ? 'MEGA ULTIMATE' : 'RIVAL MEGA!'), h('span', {}, (def?.name ?? 'MEGA').toUpperCase()), h('em', {}, def?.special?.name ?? ''));
  const wrap = h('div', { class: `mc-wrap s${side}`, style: { '--mc': def?.color ?? '#ff2e88', '--mb': def?.bolt ?? '#ff2e88' } }, top, bot, warn, flash, title);
  $overlay().appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));
  audio.play('alarm', { pitch: 0.8 });
  audio.play('whoosh', { pitch: 0.5 });

  // camera rig: start from the current battle camera
  const startPos = cam.position.clone();
  const startLook = new THREE.Vector3();
  cam.getWorldDirection(startLook);
  startLook.multiplyScalar(30).add(cam.position);
  const lookAt = new THREE.Vector3();
  const pos = new THREE.Vector3();
  // shots scale with the figure: a wide establishing crane, a low hero angle
  // looking up at the vessel, then a push-in on the face as the glass cracks
  const portrait = cam.aspect < 1 ? 1.35 : 1;
  const shots = {
    high: { pos: new THREE.Vector3(x - dir * H * 0.8, H * 1.6, H * 2.4 * portrait), look: new THREE.Vector3(x, H * 0.45, 0) },
    low: { pos: new THREE.Vector3(x + dir * H * 0.95, H * 0.2, H * 2.2 * portrait), look: new THREE.Vector3(x, H * 0.62, 0) },
    close: { pos: new THREE.Vector3(x + dir * H * 0.6, H * 0.7, H * 1.65 * portrait), look: new THREE.Vector3(x, H * 0.66, 0) },
  };
  let T = 0;
  const ctl = { done: false, ownsCamera: true };
  const step = { slam: false, fill: false, crack: false, burst: false, out: false };
  let lastBubble = 0;

  ctl.update = (dt) => {
    if (ctl.done) return;
    T += dt;
    ctl.t = T;
    // --- camera path
    let a, b, k;
    if (T < 0.8) { a = { pos: startPos, look: startLook }; b = shots.high; k = ease(T / 0.8); }
    else if (T < 2.4) { a = shots.high; b = shots.low; k = ease((T - 0.8) / 1.6); }
    else if (T < 4.3) { a = shots.low; b = shots.close; k = ease(Math.min(1, (T - 2.4) / 1.4)); }
    else {
      // pull back to the live battle camera
      const c = battleCamera(view.camX, view.viewWidth(), cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
      a = shots.close; b = { pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look) }; k = ease(Math.min(1, (T - 4.3) / 1.1));
    }
    pos.lerpVectors(a.pos, b.pos, k);
    lookAt.lerpVectors(a.look, b.look, k);
    if (T > 2.4 && T < 3.7) { const r = (T - 2.4) * 0.05; pos.x += (Math.random() - 0.5) * r; pos.y += (Math.random() - 0.5) * r; }
    cam.position.copy(pos);
    cam.lookAt(lookAt);
    // --- the vessel drops and slams
    if (T >= 0.3 && !step.slam) {
      const q = Math.min(1, (T - 0.3) / 0.45);
      vessel.root.position.y = dropH * (1 - q * q);
      if (q >= 1) {
        step.slam = true;
        vessel.root.position.y = 0;
        engine.shake(0.75);
        audio.play('thud', { pitch: 0.5 });
        audio.play('explode', { pitch: 0.6, vol: 0.6 });
        fx.impact(new THREE.Vector3(x, 0, 0), { radius: 4.5, colors: [0xd8c4a0, 0xffffff, 0x9ff2ff] });
        fx.dust(new THREE.Vector3(x, 0, 0.5), { count: 30, scale: 2.6 });
        rig.root.visible = true;
        warn.classList.add('on');
      }
    }
    // --- water pours in; the figure mutates to full size
    if (T >= 0.9 && T < 2.4) {
      const q = (T - 0.9) / 1.5;
      vessel.setFill?.(q);
      vessel.setGlow?.(q * 0.6);
      rig.baseScale = (def?.size ?? 3.4) * (0.3 + 0.7 * ease(q));
      if (!step.fill) { step.fill = true; audio.play('pour'); audio.play('slosh', { pitch: 0.6 }); }
      if (T - lastBubble > 0.06) {
        lastBubble = T;
        fx.bubbles(new THREE.Vector3(x + (Math.random() - 0.5) * H * 0.5, 0.6 + q * H * 0.9, (Math.random() - 0.5) * H * 0.3), { count: 3, color: hexOf(def?.color ?? '#29b6f6') });
      }
    }
    // --- cracks spread, the beast thrashes
    if (T >= 2.4 && T < 3.7) {
      const q = (T - 2.4) / 1.3;
      vessel.setCrack?.(q);
      vessel.setGlow?.(0.6 + q * 0.4);
      vessel.setRumble?.(q);
      if (!step.crack) { step.crack = true; audio.play('heartbeat'); audio.play('rattle', { pitch: 0.6 }); }
      if (Math.random() < dt * 6) { rig.attack(0.4); rig.boing(0.3); audio.play('crunch', { pitch: 0.5 + q, gap: 0.12 }); engine.shake(0.15 + q * 0.2); }
      if (Math.random() < dt * 10) fx.sparkle(new THREE.Vector3(x + (Math.random() - 0.5) * H * 0.6, Math.random() * H, H * 0.3), { count: 2, colors: [0xffffff, 0x9ff2ff], speed: 3, life: 0.3 });
    }
    // --- BREAKOUT
    if (T >= 3.7 && !step.burst) {
      step.burst = true;
      let shards = [];
      vessel.setRumble?.(0);
      try { shards = vessel.burst?.({ force: 10 }) ?? []; } catch (e) { shards = []; }
      // (the containment model flies its own shards; the stand-in vessel uses voxel shatter)
      if (!vessel.interior) for (const m of shards) { m.updateMatrixWorld?.(true); if (m.isMesh) fx.shatter(m, { force: 10, life: 2.2 }); }
      const c = new THREE.Vector3(x, H * 0.5, 0);
      fx.slime(c, { count: 60, color: hexOf(def?.color ?? '#29b6f6'), speed: 9 });
      fx.bubbles(c, { count: 40, color: 0xcff2ff, radius: 3, speed: 4 });
      fx.burst(c, { count: 60, colors: [0xffffff, 0xcff2ff, 0x9fe6ff], size: 0.14, speed: 11 });
      fx.shockwave(new THREE.Vector3(x, 0.05, 0), { radius: 9, color: hexOf(def?.bolt ?? '#ff2e88') });
      fx.confetti(new THREE.Vector3(x, H * 1.1, 0), { count: 80, spread: 3 });
      engine.shake(1);
      engine.hitstop(0.12);
      audio.play('shatter');
      audio.play('explode', { pitch: 0.5 });
      audio.play('roar', { pitch: 0.45 });
      audio.play('fanfare');
      rig.baseScale = def?.size ?? 3.4;
      rig.attack(0.9);
      rig.boing(0.8);
      flash.classList.add('go');
      title.classList.add('go');
      warn.classList.remove('on');
      engine.timeScale = 0.4;
      setTimeout(() => { engine.timeScale = 1; }, 700);
    }
    if (T >= 5.0 && !step.out) {
      step.out = true;
      wrap.classList.remove('in');
      wrap.classList.add('out');
    }
    vessel.update?.(dt);
    rig.update(dt);
  };

  ctl.finish = () => {
    if (ctl.done) return;
    ctl.done = true;
    ctl.ownsCamera = false;
    engine.timeScale = 1;
    scene.remove(rig.root);
    // the vessel's base plate stays behind for a moment, then sinks away
    const r = vessel.root;
    animate(0.8, (e) => { r.position.y = -e * 1.5; }, { onComplete: () => { scene.remove(r); vessel.dispose?.(); } });
    setTimeout(() => wrap.remove(), 900);
    if (!step.out) { wrap.classList.remove('in'); wrap.classList.add('out'); }
  };
  return ctl;
}

/** Visuals for Mega specials (the sim applies the damage a moment later). */
export function megaSpecialFx(view, ev) {
  const a = view.actors.get(ev.unit.id);
  if (!a) return;
  const rig = a.rig;
  const def = MEGAS[ev.unit.type];
  const col = hexOf(def?.bolt ?? '#ff2e88');
  const z = rig.root.position.z;
  switch (ev.id) {
    case 'pounce': {
      rig.attack(0.6);
      audio.play('roar', { pitch: 0.6 });
      a.jump = { t: 0, dur: 0.55, h: 3.2 };
      fx.dust(new THREE.Vector3(ev.from, 0, z), { count: 14, scale: 2 });
      break;
    }
    case 'beam': {
      rig.attack(0.7);
      audio.play('laser', { pitch: 0.5 });
      const len = Math.abs(ev.x - ev.from);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 10, 1, true).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2.6), toneMapped: false, transparent: true, opacity: 0.95, depthWrite: false }));
      beam.position.set((ev.from + ev.x) / 2, 1.9, z + 0.2);
      view.scene.add(beam);
      animate(0.75, (e) => { beam.scale.set(1, 1 + Math.sin(e * 40) * 0.3, 1 + Math.sin(e * 40) * 0.3); beam.material.opacity = 0.95 * (1 - e * e); }, { onComplete: () => view.scene.remove(beam) });
      for (let i = 0; i < 18; i++) fx.sparkle(new THREE.Vector3(lerp(ev.from, ev.x, i / 17), 1.9, z), { count: 2, colors: [col, 0xffffff], speed: 3, life: 0.4 });
      engine.shake(0.35);
      break;
    }
    case 'drain': {
      rig.attack(0.7);
      audio.play('growl', { pitch: 0.5 });
      setTimeout(() => {
        const p = new THREE.Vector3(ev.x, 0.3, z);
        fx.slime(p, { count: 40, color: 0x7cff3a, speed: 6 });
        fx.rise(p, { count: 30, colors: [0x7cff3a, 0xb05cff], radius: 3 });
        engine.shake(0.5);
      }, 450);
      break;
    }
    case 'glitch': {
      audio.play('zap', { pitch: 0.6 });
      fx.burst(new THREE.Vector3(ev.from, 2, z), { count: 30, colors: [0xff2ea8, 0x29e0ff, 0xffffff], size: 0.16, speed: 6 });
      a.glitchT = 0.4;
      setTimeout(() => fx.burst(new THREE.Vector3(ev.x, 2, z), { count: 40, colors: [0xff2ea8, 0x29e0ff, 0xffffff], size: 0.16, speed: 7 }), 350);
      break;
    }
    default:
      break;
  }
}

/** The Mega's time is up: it shrinks back into a vial and zips home. */
export function megaEndFx(view, ev) {
  const a = view.actors.get(ev.unit.id);
  if (!a) return;
  view.actors.delete(ev.unit.id);
  const rig = a.rig;
  const s0 = rig.baseScale;
  const p = rig.root.position.clone();
  audio.play('magic', { pitch: 0.6 });
  fx.sparkle(p.clone().setY(p.y + 2), { count: 40, colors: [0xffd84a, 0xffffff, 0xff7ac0], speed: 4, radius: 2 });
  animate(0.7, (e) => { rig.baseScale = s0 * (1 - e) + 0.01; rig.update(0.016); }, { onComplete: () => a.dispose() });
  a.plate.remove();
}
