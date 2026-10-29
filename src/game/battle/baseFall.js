// Base destroyed: a short, clean crumble played by BattleView.labDestroyed.
//
//   0.00 s  the killing blow: a brief hit-stop, a gentle slow-down (x0.45) and a
//           small camera push toward the base; the Commander on the roof flinches
//   0.30 s  the base crumbles into its rubble state with one pixel blast, a puff
//           of dust along the ground and a little smoke (no flying chunks, no
//           tumbling Commander: the battle cuts to the news right after)
//   0.70 s  time is back to normal
// Synced with result.js finalBlow (stamp at 0 s, TV static at 0.72 s, news at ~1 s).
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { hpx } from './hitPix.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TEAM = [0x2b9cff, 0xff3d55];

/**
 * The sequence's own clock (real time, so slow-mo / hit-stop don't stretch the
 * choreography). Dev: window.__fxSlow = 4 plays the whole beat 4x slower.
 */
function makeClock(view) {
  const tasks = [], runs = [];
  let t = 0;
  const off = engine.onFrame((dt) => {
    if (view.disposed) { off(); return; }
    t += dt / ((typeof window !== 'undefined' && window.__fxSlow) || 1);
    for (const r of runs.slice()) {
      const k = Math.min(1, (t - r.t0) / r.dur);
      r.fn(k);
      if (k >= 1) { runs.splice(runs.indexOf(r), 1); r.done?.(); }
    }
    for (let i = 0; i < tasks.length; i++) if (t >= tasks[i].at) { const f = tasks[i].fn; tasks.splice(i--, 1); f(); }
  });
  return {
    now: () => t,
    at: (s, fn) => tasks.push({ at: t + s, fn }),
    anim: (dur, fn, done) => runs.push({ t0: t, dur, fn, done }),
    slow: () => (typeof window !== 'undefined' && window.__fxSlow) || 1,
  };
}

export async function labCollapse(view, side) {
  const lab = view.labs[side];
  if (!lab || lab.fallen) return;
  lab.fallen = true;
  const bx = lab.root.position.x;
  const H = Math.max(2, lab.height ?? 3), W = Math.max(2.4, lab.width ?? 3.4);
  const out = side === 0 ? 1 : -1; // toward the field
  const team = TEAM[side];
  view.autoFollow = false;

  // ---- camera: a small, smooth push toward the base (no orbit)
  const clk = makeClock(view);
  const tgt = V3(bx, H * 0.4, 0);
  const pos0 = new THREE.Vector3(), look0 = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3();
  view.camFx = (cam, c) => {
    const k = 1 - (1 - Math.min(1, clk.now() / 0.7)) ** 3;
    pos0.set(...c.pos); look0.set(...c.look);
    look.copy(look0).lerp(tgt, 0.45 * k);
    want.copy(pos0).lerp(look, 0.18 * k);
    want.x += (look.x - look0.x);
    cam.position.copy(want);
    cam.lookAt(look);
  };

  // ---- 0 s: the killing blow
  engine.hitstop(0.08);
  engine.shake(0.3);
  engine.timeScale = 0.45 / clk.slow();
  audio.play('explode', { pitch: 0.7, vol: 0.8 });
  const ch = view.cmds[side];
  if (ch) {
    ch.busy = true;
    ch.play('shocked', { restart: true, dur: 0.4, then: 'sad' });
    ch.expr('shock', 'open');
  }
  const win = view.cmds[1 - side];
  if (win) {
    win.busy = true;
    win.play('cheer');
    win.expr('star', 'grin');
  }
  // the structure shudders for a moment
  const r0 = lab.root.rotation.z, y0 = lab.root.position.y, x0 = lab.root.position.x;
  clk.anim(0.3, (e) => {
    lab.root.rotation.z = r0 + Math.sin(e * 40) * 0.015 * (1 - e);
    lab.root.position.x = x0 + Math.sin(e * 55) * 0.04 * (1 - e);
  }, () => { lab.root.rotation.z = r0; lab.root.position.x = x0; });

  // ---- 0.3 s: crumble into rubble
  clk.at(0.3, () => {
    const prevChunk = lab.onChunk;
    lab.onChunk = (mesh) => fx.shatter(mesh, { force: 5, dirX: out * 0.3, life: 1.6, fraction: 0.35 });
    lab.setDamage(1);
    lab.onChunk = prevChunk;
    lab.root.position.y = y0;
    const sc = lab.root.scale.clone();
    clk.anim(0.3, (e) => {
      const s = e < 0.5 ? 1 - e * 0.24 : 0.88 + (e - 0.5) * 0.24;
      lab.root.scale.set(sc.x, sc.y * s, sc.z);
    }, () => lab.root.scale.copy(sc));
    const c = V3(bx, H * 0.4, 0.4);
    hpx.boom(c, { scale: 1.3 });
    fx.burst(c, { count: 18, colors: [0xeaf2ff, team, 0x9aa6bc], size: 0.12, speed: 6 });
    for (let i = 0; i < 10; i++) {
      const d = i % 2 ? 1 : -1;
      hpx.dust(V3(bx + d * rnd(0.2, W * 0.45), 0, rnd(-0.5, 1)), { count: 1, scale: rnd(1, 1.6), vx: d * rnd(1.5, 4), spread: 0.3, life: rnd(0.8, 1.2) });
    }
    hpx.smoke(V3(bx, H * 0.35, 0), { count: 5, scale: 1.1, radius: W * 0.4, rise: 1.6, life: 1.2, colors: [0x5a5468, 0x6e687c, 0x8a8698] });
    if (lab.style === 'mansion' || lab.style === 'goldVault') fx.cash(c, 30, { speed: 6 });
    engine.shake(0.35);
    audio.play('crunch', { pitch: 0.6 });
    audio.play('thud', { pitch: 0.7 });
    if (win) win.play('victory');
    // ease time back to normal
    const s0 = engine.timeScale;
    clk.anim(0.4, (e) => { if (engine.timeScale < 1) engine.timeScale = s0 + (1 - s0) * e; }, () => { engine.timeScale = 1; });
  });
  await new Promise((r) => clk.at(1.0, r));
}
