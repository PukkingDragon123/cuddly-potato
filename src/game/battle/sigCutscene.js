// COMMANDER ULTIMATE cinematic (~2.4 s).
//
// sim.useSignature() freezes the battle for a short wind-up (sim.cinematic,
// like the MEGA's), so this plays in two acts the view drives every frame:
//   1. WIND-UP  letterbox slides in, the camera cuts from the battle view and
//               dollies in on the chibi Commander on their base: they stand,
//               rage-face, arms up, gathering 2D pixel-art energy (sparkles,
//               crosses and diamonds sucked into their hands, embers rising,
//               pixel bolts crackling) while the ability name slams in.
//   2. IMPACT   the sim's 'signature' event lands it: white flash, hard cut to
//               where the ability hits (slight slow-mo), then the camera eases
//               back to the live battle view.
// Tap anywhere to skip (ends the wind-up early / jumps to the ease-back).
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { h, $overlay } from '../../ui/ui.js';
import { battleCamera } from '../../models/arenas/kit.js';
import { pix } from './pixfx.js';
import './sigCutscene.css';

/** Signature ability colours (cinematic, HUD ring). */
export const SIG_COL = { beakerBarrage: '#7cff3a', megaGiveaway: '#ffd84a', bellyFlop: '#3fb8ff', juansTruck: '#ff8a2a' };

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outQ = (t) => 1 - (1 - t) * (1 - t);
const hex = (css) => new THREE.Color(css).getHex();

export function playSigCutscene(view, ev) {
  const side = ev.side;
  const ch = view.cmds?.[side];
  const s = view.sim.sides[side];
  const sg = s.cmd?.signature;
  if (!ch || !sg) return null;
  const dir = side === 0 ? 1 : -1;
  const cam = view.camera;
  const P = pix(view);
  const col = side === 0 ? SIG_COL[sg.id] ?? '#ffd84a' : '#ff3d55';
  const C = hex(col), W = 0xffffff, G = 0xffe27a;
  const portrait = cam.aspect < 1;

  // ---- overlay: letterbox, kicker + name slam, skip hint, flash
  const name = sg.name.toUpperCase();
  // letters drop in one by one; words never break apart
  let li = 0;
  const letters = name.split(' ').map((w) => h('span', { class: 'sc-word' }, [...w].map((c) => h('i', { style: { '--i': li++ } }, c))));
  const wrap = h('div', { class: `sc-wrap s${side}`, style: { '--sc': col } },
    h('div', { class: 'sc-bar top' }, h('i', { class: 'sc-trim' })),
    h('div', { class: 'sc-bar bot' }, h('i', { class: 'sc-trim' })),
    h('div', { class: 'sc-title' },
      h('small', { class: 'sc-kick' }, side === 0 ? `${(s.cmd.name ?? 'COMMANDER').toUpperCase()} · ULTIMATE` : 'RIVAL ULTIMATE'),
      h('div', { class: 'sc-name' }, h('span', { class: 'sc-chev l' }), h('b', {}, letters), h('span', { class: 'sc-chev r' }))),
    h('div', { class: 'sc-skip' }, 'TAP TO SKIP', h('span', { class: 'sc-chev r' })),
    h('div', { class: 'sc-flash' }));
  $overlay().appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('in'));

  // ---- the Commander stands up on the roof for the wind-up
  ch.busy = true;
  ch.play('stomp', { restart: true, dur: 0.35, then: 'holdUp' });
  ch.mood?.('rage', 2.2);
  ch.boing?.(0.4);
  audio.play('whoosh', { pitch: 0.55 });
  audio.play('magic', { pitch: 0.7 });

  // ---- shots
  const box = new THREE.Box3().setFromObject(ch.root);
  const H = Math.max(0.6, box.max.y - box.min.y);
  const p = ch.root.position.clone();
  // the shots follow the Commander live (they may still be hopping onto a freshly upgraded base)
  const look0 = new THREE.Vector3(p.x, p.y + H * 0.58, p.z);
  const follow = () => {
    const q = ch.root.position;
    const nx = q.x, ny = q.y + H * 0.58, nz = q.z;
    const dx = nx - look0.x, dy = ny - look0.y, dz = nz - look0.z;
    if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < 1e-4) return;
    look0.set(nx, ny, nz);
    for (const v of [closeFrom.pos, closeFrom.look, closeTo.pos, closeTo.look]) { v.x += dx; v.y += dy; v.z += dz; }
    p.copy(q);
  };
  const dist = H * (portrait ? 5.4 : 3.6);
  const closeFrom = { pos: look0.clone().add(new THREE.Vector3(dir * H * 1.6, H * 0.5, dist * 1.35)), look: look0.clone() };
  const closeTo = { pos: look0.clone().add(new THREE.Vector3(dir * H * 0.9, H * 0.12, dist * 0.92)), look: look0.clone().add(new THREE.Vector3(0, H * 0.05, 0)) };
  const startPos = cam.position.clone();
  const startLook = new THREE.Vector3();
  cam.getWorldDirection(startLook);
  startLook.multiplyScalar(30).add(cam.position);
  const pos = new THREE.Vector3(), lk = new THREE.Vector3();
  const battleShot = () => {
    const c = battleCamera(view.camX, view.viewWidth(), cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
    return { pos: new THREE.Vector3(...c.pos), look: new THREE.Vector3(...c.look) };
  };

  let T = 0, landT = -1, impact = null, back = null, slowOn = false, chargeT = 0, boltT = 0, sfxT = 0.2;
  let HOLD = 1.05;
  const BACK = 0.5;
  const ctl = { done: false, ownsCamera: true, sig: true };

  const _hl = new THREE.Vector3(), _hr = new THREE.Vector3();
  /** Between the Commander's raised hands (where the energy gathers). */
  const handPos = () => {
    if (!ch.handWorld) return new THREE.Vector3(p.x, p.y + H * 1.05, p.z + 0.1);
    ch.handWorld(_hl, 'L');
    ch.handWorld(_hr, 'R');
    return _hl.add(_hr).multiplyScalar(0.5).clone().add(new THREE.Vector3(0, H * 0.08, 0.05));
  };

  const impactShot = (e) => {
    const sim = view.sim;
    let x;
    if (e.xs?.length) x = e.xs.reduce((a, b) => a + b, 0) / e.xs.length;
    else if (typeof e.x === 'number') x = e.x;
    else x = sim.frontEnemyX(side) ?? (s.labX + dir * 8);
    if (sg.id === 'juansTruck') x = s.labX + dir * 5;
    const lookAt = new THREE.Vector3(x, 1.1, 0);
    const d = portrait ? 15 : 10.5;
    return {
      from: { pos: new THREE.Vector3(x - dir * 3.4, 2.3, d * 0.92), look: lookAt.clone() },
      to: { pos: new THREE.Vector3(x - dir * 1.6, 3.4, d), look: lookAt.clone().add(new THREE.Vector3(sg.id === 'juansTruck' ? dir * 6 : dir * 0.4, 0, 0)) },
    };
  };

  /** The ability lands (the sim's 'signature' event). */
  ctl.land = (e) => {
    if (ctl.done || landT >= 0) return;
    landT = T;
    if (ctl.skipped) HOLD = 0.55; // skipped the wind-up: a quick look at the hit, then back
    impact = impactShot(e);
    ch.busy = false; // signatureFx takes the Commander over (throw / flop / point...)
    wrap.classList.add('land');
    const f = wrap.querySelector('.sc-flash');
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    // release burst off the Commander: pixel stars + chevrons flying out
    const hp = handPos();
    P.burst(hp, { tex: 'star4', count: 18, speed: 7, size: 0.32, color: [W, C, G], glow: 2.4, life: 0.6, drag: 2 });
    P.burst(hp, { tex: 'diamond', count: 14, speed: 5, size: 0.22, color: [C, W], glow: 2, life: 0.5, drag: 2 });
    engine.shake(0.35);
    audio.play('explode', { pitch: 1.3, vol: 0.5 });
  };
  ctl.skip = () => {
    if (ctl.done) return;
    if (landT < 0) { view.sim.skipCinematic?.(); ctl.skipped = true; }
    else if (T - landT < HOLD) landT = T - HOLD;
  };
  wrap.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); ctl.skip(); });

  ctl.update = (dt) => {
    if (ctl.done) return;
    T += dt;
    let a, b, k;
    if (landT < 0) {
      // ---- act 1: cut in close, slow dolly
      follow();
      if (T < 0.32) { a = { pos: startPos, look: startLook }; b = closeFrom; k = ease(T / 0.32); }
      else { a = closeFrom; b = closeTo; k = outQ(Math.min(1, (T - 0.32) / 1.1)); }
      pos.lerpVectors(a.pos, b.pos, k);
      lk.lerpVectors(a.look, b.look, k);
      // building rumble
      if (T > 0.5) { const r = Math.min(1, (T - 0.5)) * H * 0.012; pos.x += (Math.random() - 0.5) * r; pos.y += (Math.random() - 0.5) * r; }
      cam.position.copy(pos);
      cam.lookAt(lk);
      cam.rotateZ(-dir * 0.05 * Math.min(1, T / 0.6));
      // charging energy: pixel sparkles sucked into the hands, embers rising, bolts crackling
      const hp = handPos();
      chargeT -= dt;
      if (chargeT <= 0 && T > 0.15) {
        chargeT = 0.035;
        const kk = Math.min(1, T / 1.1);
        P.converge(hp, { tex: Math.random() < 0.5 ? 'star4' : Math.random() < 0.5 ? 'plus' : 'diamond', count: 2 + Math.round(kk * 2), radius: H * (1.2 + Math.random() * 0.6), size: H * 0.12, color: [W, C, C, G], glow: 2.2, life: 0.42 });
        P.spawn({ tex: 'ember', x: p.x + (Math.random() - 0.5) * H, y: p.y - H * 0.2, z: p.z + (Math.random() - 0.3) * H * 0.6, vy: H * (1.4 + Math.random()), size: H * 0.07, color: [C, G], glow: 2, life: 0.7, flicker: 0.2 });
      }
      boltT -= dt;
      if (boltT <= 0 && T > 0.4) {
        boltT = 0.09;
        const a2 = Math.random() * Math.PI * 2;
        P.spawn({ tex: 'bolt', x: hp.x + Math.cos(a2) * H * 0.45, y: hp.y + Math.sin(a2) * H * 0.35, z: hp.z + 0.15, size: H * 0.22, size1: H * 0.2, rot: a2, color: [W, C], glow: 2.6, life: 0.12 });
      }
      sfxT -= dt;
      if (sfxT <= 0) { sfxT = 0.28; audio.play('zap', { pitch: 1.2 + T * 0.6, vol: 0.25, gap: 0.1 }); }
      if (T > 0.3 && !ctl.slammed) { ctl.slammed = true; wrap.classList.add('slam'); audio.play('thud', { pitch: 0.8 }); }
      // the sim never landed it (battle ended / paused for long): bow out
      if (T > 4.5) ctl.finish();
      return;
    }
    // ---- act 2: impact shot, then back to the battle
    const tb = T - landT;
    if (tb > 0.4 && tb < 0.95 && !slowOn) { slowOn = true; engine.timeScale = 0.7; }
    if (tb >= 0.95 && slowOn) { slowOn = false; engine.timeScale = 1; }
    if (tb > HOLD - 0.15 && !ctl.out) { ctl.out = true; wrap.classList.remove('in'); wrap.classList.add('out'); }
    if (tb < HOLD) { a = impact.from; b = impact.to; k = outQ(tb / HOLD); }
    else {
      back ??= { pos: cam.position.clone(), look: lk.clone() };
      a = back; b = battleShot(); k = ease(Math.min(1, (tb - HOLD) / BACK));
    }
    pos.lerpVectors(a.pos, b.pos, k);
    lk.lerpVectors(a.look, b.look, k);
    cam.position.copy(pos);
    cam.lookAt(lk);
    if (tb >= HOLD + BACK) ctl.finish();
  };

  ctl.finish = () => {
    if (ctl.done) return;
    ctl.done = true;
    ctl.ownsCamera = false;
    if (slowOn) engine.timeScale = 1;
    if (landT < 0) ch.busy = false;
    wrap.classList.remove('in');
    wrap.classList.add('out');
    setTimeout(() => wrap.remove(), 500);
  };
  return ctl;
}
