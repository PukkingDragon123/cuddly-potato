// Shop ENTRANCE preview, played right inside the shop. The shop's stage window (the view onto
// Lonan's counter: top in portrait, left in landscape) rolls its shutter down, turns into a
// green-screen film studio (entranceStudio.js) with your base on the cyc, and your Commander
// (in their outfit) performs the real cinematic (entranceCine.js + entranceSets.js): set piece,
// walk-in, poses, voiced line, title card, the hop onto your base. Then the shutter brings Lonan back. The goods stay on screen the whole
// time, so BUY / EQUIP are a tap away.
//
// Drawn by the main renderer (engine.setBackdrop) with the camera's view offset framing the
// window, so there is no second WebGL context and nothing goes full screen. The studio is built
// once per shop visit (ahead of time when the ENTRANCES section scrolls into view), each
// entrance's props are built and their shaders compiled behind the shutter, and everything is
// freed when the shop closes. It never takes or clears a backdrop it does not own.
//
//   const pv = entranceStage({ host, onShow, onHide, onEnd, onState });
//   pv.play(id, { celebrate })   // (re)starts; another id cancels the current one cleanly
//   pv.stop()                    // back to the bunker
//   pv.prewarm()                 // build the range now (no drawing)
//   pv.dispose()                 // the shop closed mid-preview or not: free everything
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { Chibi } from '../../core/chibi.js';
import { h, button } from '../../ui/ui.js';
import { CHARACTERS } from '../../data/characters.js';
import { entranceDef } from '../../data/entrances.js';
import { state } from '../state.js';
import { playerSide } from './loadout.js';
import { playEntrance, makeWrap } from './entranceCine.js';
import { prepSet } from './entranceSets.js';
import { pixSystem } from './pixfx.js';
import { buildStudio } from './entranceStudio.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHUT_DOWN = 260; // ms, matches .bk-pvshut.down in entrance.css
const CONF = [0xffd23f, 0xff4fa3, 0x3ff2c8, 0x29b6f6, 0xffffff, 0x7cff3a];
const cmdKey = (c) => JSON.stringify([c?.char ?? 'recruit', c?.override ?? null]);
function makeCommander(c) {
  const def = { ...CHARACTERS[c?.char ?? 'recruit'], ...(c?.override ?? {}) };
  const ch = new Chibi(def, { scale: 0.9 });
  ch.root.scale.setScalar(0.68); // a tier-1 base's Commander (battle view cmdScale)
  return ch;
}
function freeChibi(ch) {
  ch.root.parent?.remove(ch.root);
  ch.root.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); });
  ch.face?.texture?.dispose?.();
}

/** The green-screen film studio (entranceStudio.js) with your base and your Commander. Built in slices. */
async function buildRange() {
  const { makeBase } = await import('../../models/props/base.js');
  const me = playerSide();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1c23);
  scene.fog = new THREE.Fog(0x1a1c23, 34, 70);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  // bright, clean studio light: a warm key with shadows, a cool fill, a little green spill from the cyc
  scene.add(new THREE.HemisphereLight(0xf4f8ff, 0x52604e, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.3);
  sun.position.set(-6, 14, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xcfe2ff, 0.75);
  fill.position.set(9, 6, 9);
  const spill = new THREE.DirectionalLight(0x9affb0, 0.55);
  spill.position.set(0, 5, -9);
  scene.add(fill, spill);
  const lab = makeBase(1, { side: 0, flip: false, style: me.labStyle ?? 'default' });
  lab.root.position.set(-5.2, 0, 0);
  for (const m of lab.meshes ?? []) m.castShadow = true;
  scene.add(lab.root);
  lab.root.updateMatrixWorld(true);
  await nextFrame();
  const bd = lab.bounds ?? { x0: -1.7, x1: 1.7, z0: -1.4, z1: 1.8 };
  const studio = await buildStudio({ markX: lab.root.position.x + bd.x1 + 2.15, markZ: 1.45 }); // the entrance's mark (entranceCine.js M)
  scene.add(studio.root);
  await nextFrame();
  const seat = new THREE.Vector3().setFromMatrixPosition(lab.seat.matrixWorld);
  const ch = makeCommander(me.commander);
  scene.add(ch.root);
  return { scene, camera, sun, lab, seat, ch, studio, key: cmdKey(me.commander), P: pixSystem(scene) };
}
function freeRange(R) {
  R.P.dispose();
  freeChibi(R.ch);
  R.studio.dispose();
  R.scene.traverse((o) => { if (o.geometry && !o.userData.keepGeo) o.geometry.dispose(); });
  if (R.sun.shadow?.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; }
}

/**
 * The inline preview stage. host: the shop's stage window element (the shutter, the close button
 * and the cinematic's letterbox / title card / speech bubble go inside it). Callbacks: onShow()
 * when the range replaces the bunker (behind the shutter), onHide() when it gives the window back
 * (attach the bunker there), onEnd(id, { celebrate }) after a preview played to the end,
 * onState(id | null) whenever the entrance being shown changes.
 */
export function entranceStage({ host, onShow, onHide, onEnd, onState } = {}) {
  let R = null, building = null, disposed = false, seq = 0;
  let ctl = null, started = false, on = false, curId = null, wrap = null;
  let cel = null; // celebration state after a purchase
  let rect = { left: 0, top: 0, width: 1, height: 1 }, rk = '';
  const label = h('div', { class: 'bk-pvshut-t t-d' });
  const shut = h('div', { class: 'bk-pvshut', 'aria-hidden': 'true' }, label, h('i', { class: 'bk-shutter-bar' }));
  const xBtn = button('', () => api.stop(), 'red sm icon-only bk-pv-x', { icon: 'x', sound: 'tap' });
  xBtn.setAttribute('aria-label', 'Back to the counter');
  host.append(shut, xBtn);
  const setShut = (down, text) => {
    if (text !== undefined) label.textContent = text;
    shut.classList.toggle('down', down);
  };
  const setId = (id) => { if (curId !== id) { curId = id; onState?.(id); } };

  // the camera's full view is the window rect; the rest of the canvas is the same frustum extended
  const syncView = () => {
    const r = host.getBoundingClientRect();
    const W = engine.width, H = engine.height;
    const k = `${r.left},${r.top},${r.width},${r.height},${W},${H}`;
    if (k === rk || r.width < 8 || r.height < 8) return;
    rk = k;
    rect = r;
    R.camera.setViewOffset(r.width, r.height, -r.left, -r.top, W, H); // aspect = the window's
    R.camera.updateProjectionMatrix();
  };

  const stage = {
    get scene() { return R.scene; },
    get camera() { return R.camera; },
    overlay: () => host,
    box: () => rect,
    cmd: (i) => (i === 0 ? R.ch : null),
    base() {
      const lab = R.lab, bd = lab.bounds ?? { x0: -1.7, x1: 1.7, z0: -1.4, z1: 1.8 };
      return { x: lab.root.position.x, front: lab.root.position.x + bd.x1, z1: bd.z1 ?? 1.8, height: lab.height ?? 3, seat: R.seat.clone(), seatYaw: 0.55 };
    },
    shake: (a) => engine.shake(a * 0.45),
    toScreen: (v) => engine.toScreen(v, R.camera),
    /** Where the hop lands: the whole base with you on your seat, a little from the field side. */
    endShot() {
      const cam = R.camera, lab = R.lab, bd = lab.bounds ?? { x0: -1.7, x1: 1.7, z0: -1.4, z1: 1.8 };
      const x0 = Math.min(lab.root.position.x + bd.x0, R.seat.x - 0.6), x1 = lab.root.position.x + bd.x1 + 0.4;
      const top = Math.max(lab.height ?? 3, R.seat.y + R.ch.height * R.ch.root.scale.y) + 0.35;
      const look = new THREE.Vector3((x0 + x1) / 2, top * 0.5, 0.3);
      const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const d = Math.max((top + 0.7) / (2 * tan), (x1 - x0 + 1.2) / (2 * tan * cam.aspect));
      const yaw = 0.24, pitch = 0.2;
      const pos = new THREE.Vector3(look.x + Math.sin(yaw) * Math.cos(pitch) * d, look.y + Math.sin(pitch) * d, look.z + Math.cos(yaw) * Math.cos(pitch) * d);
      return { pos, look };
    },
  };

  const update = (dt) => {
    if (!R) return;
    syncView();
    const ch = R.ch;
    const n = Math.min(4, Math.ceil(dt / (1 / 40)));
    for (let i = 0; i < n; i++) ch.update(dt / n);
    R.lab.update?.(dt);
    R.studio.update(dt);
    if (ctl && started && !ctl.done) ctl.update(dt);
    if (cel && ctl) {
      if (!cel.pose && ctl.phase === 'pose') { cel.pose = true; burst(ch.root.position, 1); audio.play('fanfare', { vol: 0.7 }); }
      if (!cel.end && ctl.done && !ctl.skipped) { cel.end = true; burst(R.seat, 0.7); audio.play('cheer', { vol: 0.5 }); }
    }
    R.P.update(dt, R.camera);
    if (import.meta.env.DEV && window.__pvCam) { R.camera.position.set(...window.__pvCam[0]); R.camera.lookAt(...window.__pvCam[1]); } // dev: look around the studio
    R.sun.position.set(R.camera.position.x - 6, 14, 10);
    R.sun.target.position.set(R.camera.position.x, 0, 0);
  };
  /** Pixel confetti + streamers (2D sprites) around a point. */
  const burst = (p, k) => {
    const at = { x: p.x, y: p.y + 0.6, z: p.z };
    R.P.burst(at, { tex: 'entConf', additive: false, count: Math.round(46 * k), speed: 5.5, lift: 3.4, grav: 7, drag: 0.7, size: 0.13, size1: 0.11, color: CONF, glow: 1.15, life: 1.7, spin: 7, radius: 0.4 });
    R.P.burst(at, { tex: 'entStreamer', additive: false, count: Math.round(14 * k), speed: 4.5, lift: 3, grav: 5, drag: 0.9, size: 0.2, size1: 0.18, color: CONF, glow: 1.1, life: 1.9, spin: 3 });
  };
  const backdrop = () => ({ scene: R.scene, camera: R.camera, update, bloom: { strength: 0.5, radius: 0.12, threshold: 1.75 }, grade: { sat: 0.1, contrast: 0.08, vignette: 0.12 }, owner: api });

  const ensureBuilt = () => {
    if (R) return Promise.resolve(R);
    if (!building) {
      building = buildRange().then((r) => {
        if (disposed) { freeRange(r); throw new Error('shop closed'); }
        R = r;
        return r;
      }).finally(() => { building = null; });
    }
    return building;
  };
  /** Back to the starting line: the Commander you have equipped right now, sitting on the base. */
  const resetCommander = () => {
    const c = playerSide().commander;
    if (cmdKey(c) !== R.key) {
      freeChibi(R.ch);
      R.ch = makeCommander(c);
      R.key = cmdKey(c);
      R.scene.add(R.ch.root);
    }
    const ch = R.ch;
    ch.root.visible = true;
    ch.root.position.copy(R.seat);
    ch.root.rotation.set(0, 0.55, 0);
    ch.play('sit');
    ch.busy = ch.emoting = false;
  };
  const cancelCtl = () => {
    if (ctl && !ctl.finished) { ctl.skipped = true; ctl.finish(); }
    ctl = null;
    started = false;
  };
  const info = () => ({ ...playerSide(), name: state.p.name, trophies: state.p.trophies });
  /** Give the window back to the bunker (behind the shutter). */
  const teardown = () => {
    cancelCtl();
    cel = null;
    wrap?.remove();
    wrap = null;
    if (engine.backdrop?.owner === api) engine.setBackdrop(null);
    if (on) {
      on = false;
      host.classList.remove('pv-on');
      onHide?.();
    }
  };
  const close = async (tok) => {
    setShut(true);
    audio.play('rattle', { vol: 0.3, pitch: 1.15 });
    await wait(SHUT_DOWN);
    if (tok !== seq || disposed) return false;
    teardown();
    setId(null);
    await nextFrame();
    await nextFrame();
    if (tok !== seq || disposed) return false;
    setShut(false);
    return true;
  };

  const api = {
    get on() { return on; },
    get id() { return curId; },
    prewarm() { if (!disposed) ensureBuilt().catch(() => {}); },
    async play(id, o = {}) {
      if (disposed) return;
      const tok = ++seq;
      const e = entranceDef(id);
      setId(e.id);
      const wasDown = shut.classList.contains('down');
      setShut(true, e.name.toUpperCase());
      if (!wasDown) audio.play('rattle', { vol: 0.35, pitch: 1.05 });
      const t0 = performance.now();
      try {
        await ensureBuilt();
      } catch (err) {
        if (!disposed) { console.warn('entrance preview unavailable', err); if (tok === seq) { setShut(false); setId(null); } }
        return;
      }
      const left = SHUT_DOWN - (performance.now() - t0);
      if (left > 0) await wait(left);
      if (tok !== seq || disposed) return;
      // the shutter is down: swap the set
      cancelCtl();
      if (!on) { on = true; host.classList.add('pv-on'); onShow?.(); }
      if (!wrap) { wrap = makeWrap(host); wrap.classList.add('inl'); }
      resetCommander();
      try { prepSet(e.id); } catch (err) { /* built on the fly */ }
      syncView();
      cel = o.celebrate ? { pose: false, end: false } : null;
      started = false;
      ctl = playEntrance(stage, 0, e.id, { info: info(), wrap, preview: true, last: true });
      ctl.update(1e-4); // its props are built and the first shot is set up
      if (engine.backdrop?.owner !== api) engine.setBackdrop(backdrop());
      // every material of the set compiled before the shutter lifts, then two frames drawn behind it
      await engine.precompile(R.scene, R.camera);
      await nextFrame();
      await nextFrame();
      if (tok !== seq || disposed) return;
      started = true;
      setShut(false);
      const mine = ctl;
      await mine.wait;
      if (tok !== seq || disposed || mine.skipped) return;
      // hold on you sitting on your base, then Lonan's window comes back
      await wait(cel ? 1900 : 1300);
      if (tok !== seq || disposed) return;
      const celebrate = !!cel;
      if (await close(tok)) onEnd?.(e.id, { celebrate });
    },
    stop() {
      if (disposed) return;
      const tok = ++seq;
      if (!on) { setShut(false); setId(null); return; }
      close(tok);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      ++seq;
      cancelCtl();
      if (engine.backdrop?.owner === api) engine.setBackdrop(null);
      wrap?.remove();
      shut.remove();
      xBtn.remove();
      host.classList.remove('pv-on');
      if (R) freeRange(R);
      R = null;
      on = false;
      curId = null;
    },
  };
  if (typeof window !== 'undefined') window.__entPv = api; // tests / dev tools
  return api;
}
