// End-of-battle VICTORY / DEFEAT / DRAW cinematic, played in the arena right after the base
// explosion (baseFall.js) or after TIME'S UP, before the BEAST NEWS report (result.js).
//
//   VICTORY  your Commander stands up on your base: fist pump, a dance, then a MrBeast money
//            throw (pixel bills fly at the lens) under pixel fireworks and confetti; a low
//            orbiting push-in; the VICTORY title slams in; a voiced line in a speech bubble
//   DEFEAT   a beat on the rival celebrating, then your Commander slumps (in the rubble if the
//            base went up) under a voxel rain cloud while the camera looks down on them
//   DRAW     your Commander shrugs
// Time-up / surrender endings play a shorter cut. Tap to skip. Resolves when done.
//   await playEndCine(view, { result, cause: 'base' | 'time' | ..., names: [mine, theirs] })
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { VoxGrid, makeMesh } from '../../core/voxel.js';
import { voiceOf } from '../../data/characters.js';
import { $overlay, h } from '../../ui/ui.js';
import { bigText } from '../../ui/bigType.js';
import { pixSystem, defineSprite } from './pixfx.js';
import { battleStage, makeWrap, wrapOut } from './entranceCine.js';
import { sunAt, captureFrame } from './baseFall.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const lerp = (a, b, k) => a + (b - a) * k;
const outC = (k) => 1 - Math.pow(1 - k, 3);
const inOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const slowK = () => (typeof window !== 'undefined' && window.__fxSlow) || 1;

// pixel confetti (a folded paper strip and a twisted square), tinted per piece
defineSprite('confA', ['+##.', '+##.', '.+#+', '.+#+', '+##.', '+##.']);
defineSprite('confB', ['.##+', '####', '+##.', '.+..']);

const LINES = {
  winBase: ['That base had it coming.', 'Somebody call a cleanup crew.', 'Lab one, them zero.', 'Flattened. Next!'],
  winTime: ['Close one. Still counts.', 'Won on base HP. I will take it.', 'Beat the buzzer!'],
  loss: ['Okay. That one stung.', 'I need a bigger base.', 'Rematch. Right now.', 'We will rebuild. Bigger.'],
  draw: ['Nobody wins? Rematch.', 'A tie. Seriously?'],
};
const FIREWORKS = [[0xffd84a, 0xff9a1a, 0xffe8a0], [0x2b9cff, 0x9fe0ff, 0x5a7aff], [0xff3d8a, 0xffb0d0, 0xff6ab4], [0x7cff6b, 0xd8ffb0, 0x3fd84a]];
const CONFETTI = [0xff2e88, 0x29b6f6, 0xffd23f, 0x7cff6b, 0xb05cff, 0xff8a2a, 0xffffff];

// camera framing (shared model with the entrance cinematics)
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _v = new THREE.Vector3();
function frame(cam, c, w, hh, o = {}) {
  const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const d = Math.max(hh / (2 * tan), w / (2 * tan * cam.aspect)) * (o.zoom ?? 1);
  const yaw = o.yaw ?? 0, pitch = o.pitch ?? 0.05;
  const pos = V(c.x + Math.sin(yaw) * Math.cos(pitch) * d, c.y + Math.sin(pitch) * d, c.z + Math.cos(yaw) * Math.cos(pitch) * d);
  pos.y = Math.max(o.minY ?? 0.3, pos.y);
  const look = c.clone();
  const sx = o.sx ?? 0.5, sy = o.sy ?? 0.5;
  if (sx !== 0.5 || sy !== 0.5) {
    _f.subVectors(look, pos).normalize();
    _r.crossVectors(_f, THREE.Object3D.DEFAULT_UP).normalize();
    _u.crossVectors(_r, _f);
    const halfH = d * tan, halfW = halfH * cam.aspect;
    look.addScaledVector(_r, -(2 * sx - 1) * halfW).addScaledVector(_u, (2 * sy - 1) * halfH);
  }
  return { pos, look };
}

/** A lumpy voxel rain cloud (shared geometry). */
let cloudGeo = null;
function rainCloud() {
  if (!cloudGeo) {
    const g = new VoxGrid();
    const blobs = [[0, 0, 0, 5.5], [-5, -1, 0, 4], [5, -0.5, 0, 4.5], [-2, 2.5, 0, 4], [3, 2, 0, 3.6], [-8, -2, 0, 2.6], [8.5, -2, 0, 2.6]];
    for (let x = -12; x <= 12; x++) for (let y = -5; y <= 7; y++) for (let z = -4; z <= 4; z++) {
      let inside = false, top = -99;
      for (const [bx, by, bz, r] of blobs) {
        const d = Math.max(Math.abs(x - bx), Math.abs(y - by) * 1.15, Math.abs(z - bz) * 1.3, (Math.abs(x - bx) + Math.abs(y - by) + Math.abs(z - bz)) / 1.45);
        if (d <= r) { inside = true; top = Math.max(top, y - by); }
      }
      if (!inside || y < -3) continue;
      const shade = y <= -2 ? 0x4a5068 : top > 2.5 ? 0x9aa2bc : top > 0.5 ? 0x7a829c : 0x626a84;
      g.set(x, y, z, shade);
    }
    cloudGeo = g.build({ scale: 0.06, pivot: [0, -3, 0], maxSamples: 40 });
  }
  return makeMesh(cloudGeo);
}

/**
 * o: { result: 'win'|'loss'|'draw', cause: 'base'|'time'|'tiebreak'|'surrender'|'forfeit', names }
 * Returns a Promise; resolves when the cinematic ends (or is skipped).
 */
export function playEndCine(view, o = {}) {
  return new Promise((resolve) => {
    try { run(view, o, resolve); } catch (e) { console.error('end cinematic failed', e); resolve(); }
  });
}

function run(view, o, resolve) {
  if (!view || view.disposed) { resolve(); return; }
  const result = o.result ?? 'win';
  const win = result === 'win', loss = result === 'loss';
  const short = o.cause !== 'base';
  const cam = view.camera;
  const scene = view.scene;
  const stage = view.endStage ?? battleStage(view);
  if (!view.endStage) { stage.begin(); view.endStage = stage; }
  const port = () => cam.aspect < 1;
  const fov0 = view.camFov0 ??= cam.fov;
  document.body.classList.add('cine-end');
  const lens = () => { const f = port() ? 42 : 30; if (Math.abs(cam.fov - f) > 0.01) { cam.fov = f; cam.updateProjectionMatrix(); } };
  const P = pixSystem(scene);
  const props = [];

  // ---- overlay (the explosion's letterbox carries on, else a fresh one)
  const wrap = view.endWrap?.isConnected ? view.endWrap : makeWrap($overlay());
  wrap.classList.add('ecw');
  view.endWrap = wrap;
  const flashEl = wrap.querySelector('.ent-flash');
  const flash = (col = '#ffffff', a = 0.7) => {
    if (!flashEl) return;
    flashEl.style.setProperty('--fc', col);
    flashEl.style.setProperty('--fa', String(a));
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  };
  const titleTxt = win ? 'VICTORY' : loss ? 'DEFEAT' : 'DRAW';
  const titleBt = bigText(titleTxt, { theme: win ? 'gold' : loss ? 'ice' : 'violet', drop: loss ? 'thud' : 'slam', delay: 0.05, play: false });
  const title = h('div', { class: `ecv ${result}` }, h('div', { class: 'ecv-title' }, titleBt));
  const gloom = loss ? h('i', { class: 'ecv-gloom' }) : null;
  const sayEl = h('div', { class: 'ecv-say' }, h('span', {}), h('i', { class: 'ecv-say-tail' }));
  if (gloom) wrap.appendChild(gloom);
  wrap.appendChild(title);
  wrap.appendChild(sayEl);

  // ---- who stars
  const meCh = view.cmds?.[0] ?? null, rivCh = view.cmds?.[1] ?? null;
  const star = meCh; // your Commander is the hero of every ending
  const B = stage.base(0);
  const Br = stage.base(1);
  const lab = view.labs[0];
  const Hb = Math.max(2, lab?.height ?? 3);
  const out = 1;
  const fell = !!lab?.fallen;
  const spot = view.loserSpot?.side === 0 ? view.loserSpot.pos.clone() : null;
  const Hc = star ? Math.max(0.6, star.height * star.root.scale.y) : 1.2;
  const v8 = voiceOf(star?.def);
  const lineKey = win ? (o.cause === 'base' ? 'winBase' : 'winTime') : loss ? 'loss' : 'draw';
  const line = pick(LINES[lineKey]);

  // durations
  const RIV = loss && rivCh?.root.visible && !view.labs[1]?.fallen ? (short ? 1.1 : 1.5) : 0; // the rival's beat first
  const HERO = win ? (short ? 3.4 : 4.6) : loss ? (short ? 2.8 : 3.2) : 2.6;
  const END = RIV + HERO;

  // ---- place the hero
  const standOn = () => {
    if (!star) return null;
    star.busy = star.emoting = true;
    star.root.visible = true;
    star.speed = 1;
    if (loss && fell && spot) {
      star.root.position.copy(spot);
      return spot.clone();
    }
    const p = B.seat.clone();
    star.root.position.copy(p);
    return p;
  };
  let heroPos = null;
  const faceCam = (ch, p) => { ch.root.rotation.set(0, Math.atan2(cam.position.x - p.x, cam.position.z - p.z) * 0.85, 0); };

  // ---- shots
  const heroShot = (k) => {
    const p = heroPos ?? (star ? star.root.position : V(B.x, Hb, 0));
    const c = V(p.x, p.y + Hc * 0.55, p.z);
    if (win) {
      const fH = lerp(Hc * 3.5, Hc * 2.8, outC(k));
      return frame(cam, c, fH * (port() ? 0.62 : 1.25), fH, { yaw: out * lerp(-0.5, -0.12, inOut(k)), pitch: -0.1, minY: 0.3, sy: 0.62, sx: port() ? 0.36 : 0.44 });
    }
    if (loss) {
      const fH = port() ? lerp(Hc * 3.6, Hc * 2.9, outC(k)) : lerp(Hc * 3, Hc * 2.5, outC(k));
      c.y = p.y + Hc * (port() ? 0.95 : 0.9);
      return frame(cam, c, fH * (port() ? 0.62 : 1.1), fH, { yaw: out * lerp(0.35, 0.2, k), pitch: 0.16, minY: 0.4, sy: port() ? 0.6 : 0.6, sx: port() ? 0.36 : 0.3 });
    }
    const fH = Hc * 2.8;
    return frame(cam, c, fH * (port() ? 0.6 : 1.2), fH, { yaw: out * 0.3, pitch: 0.02, minY: 0.3, sy: 0.6, sx: port() ? 0.36 : 0.44, zoom: lerp(1.05, 0.95, k) });
  };
  const rivShot = (k) => {
    const p = rivCh.root.position;
    const H2 = Math.max(0.6, rivCh.height * rivCh.root.scale.y);
    const fH = lerp(H2 * 3, H2 * 2.4, k);
    return frame(cam, V(p.x, p.y + H2 * 0.55, p.z), fH * (port() ? 0.62 : 1.1), fH, { yaw: -lerp(0.45, 0.25, k), pitch: -0.1, minY: 0.3, sy: 0.6 });
  };

  // ---- effects
  const rockets = [];
  const firework = () => {
    const hp = heroPos ?? V(B.x, Hb, 0);
    const x = hp.x + rnd(-5, 5), z = rnd(-9, -5.5);
    rockets.push({ x, y: Math.max(0.5, hp.y - 1), z, vy: rnd(8, 10), top: hp.y + rnd(2.6, 4.6), pal: pick(FIREWORKS), t: 0 });
    audio.play('whoosh', { pitch: rnd(1.6, 2), vol: 0.25, gap: 0.1 });
  };
  const burstAt = (r) => {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.1, 0.1), e = rnd(-0.7, 0.7), sp = rnd(2.6, 4.2);
      P.spawn({ tex: i % 3 ? 'star4' : 'plus', x: r.x, y: r.y, z: r.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(a) * sp * 0.9, vz: Math.sin(e) * sp * 0.5, grav: 2.2, drag: 1.1, life: rnd(1.1, 1.5), size: rnd(0.3, 0.42), size1: 0.08, color: r.pal, glow: 2.2, flicker: 0.12 });
    }
    P.spawn({ tex: 'star4', x: r.x, y: r.y, z: r.z, life: 0.22, size: 0.9, size1: 0.3, color: r.pal[2], glow: 2.4 });
    audio.play('pop', { pitch: rnd(0.6, 0.9), vol: 0.35, gap: 0.05 });
  };
  const updRockets = (dt) => {
    for (const r of rockets) {
      if (r.done) continue;
      r.t += dt;
      r.y += r.vy * dt;
      if (Math.random() < dt * 40) P.spawn({ tex: 'ember', x: r.x + rnd(-0.03, 0.03), y: r.y, z: r.z, vy: -0.5, life: 0.35, size: 0.12, size1: 0.03, color: r.pal[0], glow: 2 });
      if (r.y >= r.top) { r.done = true; burstAt(r); }
    }
  };
  const confetti = (p, n = 26) => {
    for (let i = 0; i < n; i++) {
      P.spawn({
        tex: Math.random() < 0.6 ? 'confA' : 'confB', additive: false, x: p.x + rnd(-2.4, 2.4), y: p.y + rnd(2.2, 4), z: p.z + rnd(-1.4, 1.6),
        vx: rnd(-0.7, 0.7), vy: rnd(-1.6, -0.6), vz: rnd(-0.3, 0.3), grav: 0.9, drag: 0.6, life: rnd(2.4, 3.4), size: rnd(0.08, 0.12), size1: rnd(0.07, 0.1),
        color: pick(CONFETTI), glow: 1, rot: rnd(0, 6), spin: rnd(-9, 9),
      });
    }
  };
  const throwCash = () => {
    if (!star) return;
    const hp = star.handWorld(V(), 'R');
    _v.subVectors(cam.position, hp).normalize();
    // a fountain of bills: up and out, a few toward the lens, fluttering down around them
    for (let i = 0; i < 14; i++) {
      const sp = rnd(0.8, 2);
      P.spawn({
        tex: 'cash', additive: false, x: hp.x, y: hp.y, z: hp.z, vx: _v.x * sp + rnd(-1.8, 1.8), vy: rnd(3, 4.6), vz: _v.z * sp + rnd(-0.6, 0.6),
        grav: 4, drag: 1.5, life: rnd(1.7, 2.3), size: rnd(0.08, 0.11), size1: 0.09, color: pick([0x6fdc7a, 0x52cc5e, 0x8fe89a]), glow: 1, rot: rnd(0, 6), spin: rnd(-7, 7),
      });
    }
    audio.play('chaching', { pitch: rnd(0.95, 1.1), vol: 0.7 });
  };
  let cloud = null;
  const rain = (dt) => {
    if (!cloud || !heroPos) return;
    const n = Math.floor((rain.acc = (rain.acc ?? 0) + dt * 44));
    rain.acc -= n;
    const top = cloud.position.y - 0.08;
    for (let i = 0; i < n; i++) {
      const x = cloud.position.x + rnd(-0.55, 0.55) * cloud.scale.x * 1.2, z = cloud.position.z + rnd(-0.2, 0.2);
      P.spawn({ tex: 'drop', additive: false, x, y: top, z, vy: -6.5, life: Math.max(0.15, (top - heroPos.y) / 6.5), size: 0.15, size1: 0.15, color: 0x9fd0ff, glow: 1.2 });
    }
  };

  // ---- voice + bubble
  let sayOn = false, sayT = 0;
  const speak = () => {
    if (!star) return;
    sayEl.querySelector('span').textContent = line;
    sayEl.classList.add('on');
    sayOn = true;
    const span = Math.max(0.9, line.split(/\s+/).length * 0.26);
    audio.babble(v8, line, span);
    star.talk(true);
    sayT = span + 0.15;
  };
  // beside the head (right, or left when there is no room), tail pointing at the mouth
  const placeSay = () => {
    if (!sayOn || !star) return;
    const top = engine.toScreen(star.headTop(V()), cam);
    star.head.updateWorldMatrix(true, false);
    const mid = engine.toScreen(V().setFromMatrixPosition(star.head.matrixWorld).setY(star.head.matrixWorld.elements[13] + Hc * 0.22), cam);
    const W = window.innerWidth, Hh = window.innerHeight;
    const w = sayEl.offsetWidth || 160, sh = sayEl.offsetHeight || 40;
    const bar = Hh * 0.105;
    const half = Math.max(24, Math.abs(mid.y - top.y) * 0.9);
    const minY = Math.min(Hh * 0.6, title.getBoundingClientRect().bottom + 8);
    const right = mid.x + half + 14 + w <= W - 10, leftOk = mid.x - half - 14 - w >= 10;
    let x, y, mode;
    if (right || leftOk) {
      mode = right ? '' : 'r';
      x = right ? mid.x + half + 14 : mid.x - half - 14 - w;
      y = Math.max(minY, Math.min(Hh - bar - sh - 10, mid.y - sh * 0.6));
      sayEl.style.setProperty('--ty', Math.round(Math.max(12, Math.min(sh - 12, mid.y - y))) + 'px');
    } else {
      // no room beside the head: over it, under the title, tail pointing down
      mode = 'd';
      x = Math.max(10, Math.min(W - 10 - w, top.x - w / 2));
      y = Math.max(minY, Math.min(top.y - sh - 16, Hh - bar - sh - 10));
      sayEl.style.setProperty('--tx', Math.round(Math.max(14, Math.min(w - 14, top.x - x))) + 'px');
    }
    sayEl.classList.toggle('r', mode === 'r');
    sayEl.classList.toggle('d', mode === 'd');
    sayEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  };

  // ---- the timeline
  let t = 0, phase = '', poseIdx = -1, done = false, fireT = 0, confT = 0;
  const winPoses = short ? [['fistPump', 1.1], ['dance', 1.2], ['throw', 0.55], ['throw', 0.55]] : [['fistPump', 1.25], ['dance', 1.5], ['throw', 0.6], ['throw', 0.6], ['victory', 1]];
  const winAt = [];
  { let a = 0.25; for (const p of winPoses) { winAt.push(a); a += p[1]; } }
  const showTitle = () => {
    title.classList.add('in');
    titleBt.classList.add('go');
    if (win) { audio.jingle?.('victory'); audio.play('cheer', { vol: 0.8 }); flash('#fff6d0', 0.55); }
    else if (loss) { audio.jingle?.('defeat'); setTimeout(() => audio.play('sadTrombone', { vol: 0.6 }), 450); }
    else audio.play('bell');
    setTimeout(() => { if (title.isConnected) { audio.play('stamp', { pitch: loss ? 0.7 : 1 }); engine.shake(loss ? 0.18 : 0.12); } }, Math.max(150, titleBt._end * 1000 - (loss ? 260 : 300)));
  };

  const enterHero = () => {
    phase = 'hero';
    heroPos = standOn();
    if (star) {
      faceCam(star, heroPos);
      if (win) { star.play('jump', { restart: true }); star.mood('excited', 9); star.boing(0.4); }
      else if (loss) {
        star.play('sad', { restart: true, dur: 99 });
        star.mood('cry', 99);
        cloud = rainCloud();
        cloud.scale.setScalar(Math.max(0.7, Hc * 0.7));
        cloud.position.set(heroPos.x, heroPos.y + Hc * 1.55, heroPos.z);
        cloud.castShadow = false;
        scene.add(cloud);
        props.push(cloud);
      } else { star.react('shrug', { dur: 2.4 }); }
    }
    sunAt(view, heroPos?.x ?? B.x);
    setTimeout(() => !done && showTitle(), 300 * slowK());
  };

  if (RIV) {
    phase = 'riv';
    rivCh.busy = rivCh.emoting = true;
    const p = rivCh.root.position;
    rivCh.play('victory', { restart: true, dur: 9 });
    rivCh.mood('excited', 9);
    const s0 = rivShot(0);
    rivCh.root.rotation.set(0, Math.atan2(s0.pos.x - p.x, s0.pos.z - p.z) * 0.85, 0);
    sunAt(view, p.x);
    audio.play('laugh', { vol: 0.6 });
  } else enterHero();

  const update = (dtRaw) => {
    if (done) return;
    const dt = Math.min(0.1, dtRaw) / slowK();
    t += dt;
    if (import.meta.env.DEV && typeof window.__ecPin === 'number' && t > window.__ecPin) t = window.__ecPin;
    lens();
    P.update(dt, cam);
    updRockets(dt);
    if (phase === 'riv') {
      const s = rivShot(clamp01(t / RIV));
      cam.position.copy(s.pos); cam.lookAt(s.look);
      if (t >= RIV) enterHero();
      return;
    }
    const th = t - RIV;
    const k = clamp01(th / HERO);
    const s = heroShot(k);
    cam.position.copy(s.pos); cam.lookAt(s.look);
    if (star && heroPos) faceCam(star, heroPos);
    if (win && star) {
      let idx = -1;
      for (let i = 0; i < winAt.length; i++) if (th >= winAt[i]) idx = i;
      if (idx !== poseIdx && idx >= 0) {
        poseIdx = idx;
        const [pn, pd] = winPoses[idx];
        star.play(pn, { restart: true, dur: pd, then: 'victory' });
        star.boing(0.25);
        if (pn === 'throw') setTimeout(() => !done && throwCash(), 230 * slowK());
        if (pn === 'dance') audio.play('drum', { vol: 0.4 });
      }
      fireT -= dt;
      if (fireT <= 0) { fireT = rnd(0.32, 0.5); firework(); }
      confT -= dt;
      if (confT <= 0 && th > 0.3) { confT = 0.45; confetti(heroPos ?? star.root.position, th < 0.8 ? 30 : 12); }
    }
    if (loss) rain(dt);
    if (cloud) cloud.position.y = (heroPos?.y ?? 0) + Hc * 1.55 + Math.sin(th * 2.4) * 0.04;
    if (!sayOn && th > (win ? 1.35 : loss ? 0.9 : 0.6) && star) speak();
    if (sayOn) {
      placeSay();
      sayT -= dt;
      if (sayT <= 0) star?.talk(false);
    }
    if (!fireT0 && th > 0.6) { fireT0 = true; captureFrame(view); }
    if (th >= HERO) finish();
  };
  let fireT0 = false;

  const ctl = { endgame: true, ownsCamera: true, done: false, update, finish: () => finish() };
  view.cine = ctl;
  // the battle can be torn down mid-cinematic (scene change): never leave the page in cinematic mode
  const offGuard = engine.onFrame(() => { if (view.disposed || done) { offGuard(); if (view.disposed) { document.body.classList.remove('cine-end'); title.remove(); sayEl.remove(); gloom?.remove(); P.dispose(); } } });


  let skipAt = performance.now() + 300;
  const onTap = (ev) => {
    ev.stopPropagation(); ev.preventDefault();
    if (performance.now() < skipAt) return;
    finish();
  };
  wrap.addEventListener('pointerdown', onTap);

  const finish = () => {
    if (done) return;
    done = true; // the camera holds its last frame until the news covers it
    wrap.removeEventListener('pointerdown', onTap);
    star?.talk(false);
    if (!title.classList.contains('in')) { title.classList.add('in', 'now'); titleBt.classList.add('go'); }
    if (!view.replay?.frames?.length) captureFrame(view);
    // the news takes over the screen; tidy up behind it
    setTimeout(() => {
      sayEl.remove();
      title.remove();
      gloom?.remove();
      wrapOut(wrap);
      for (const pr of props) pr.parent?.remove(pr);
      P.dispose();
      ctl.done = true;
      document.body.classList.remove('cine-end');
      if (view.cine === ctl) { ctl.ownsCamera = false; view.cine = null; }
      if (!view.disposed) { cam.fov = fov0; cam.updateProjectionMatrix(); }
    }, 900);
    resolve();
  };
  if (import.meta.env.DEV) window.__endCine = ctl;
}
