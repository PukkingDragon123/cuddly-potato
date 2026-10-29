// Base destroyed: the slow-mo collapse cinematic played by BattleView.labDestroyed.
//
//   0.00 s  the killing blow: hit-stop, slow-mo (x0.22), the camera pushes in and
//           starts orbiting the base, the Commander panics on the trembling roof
//   0.00-0.85  chain explosions burst out of the walls (pixel fireballs, sparks,
//           voxel chips), the structure shudders and sinks
//   0.90 s  COLLAPSE: the body shatters into voxel debris, heavy voxel chunks fly
//           and bounce, the rubble heap slams down, a dust wave rolls out along
//           the ground both ways (the shockwave is debris + dust, never a ring),
//           a smoke column rises, the Commander is blasted off the roof tumbling
//   1.40 s  time eases back to normal; the rubble keeps burning and smoking
// Synced with result.js finalBlow (its BASE DESTROYED stamp lands at 1.0 s).
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { VoxGrid, makeMesh } from '../../core/voxel.js';
import { hpx } from './hitPix.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const pickc = (a) => a[(Math.random() * a.length) | 0];
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TEAM = [0x2b9cff, 0xff3d55];

let chunkGeos = null;
/** A few lumpy voxel chunk shapes (walls, panels, girders) built once. */
function chunkShapes() {
  if (chunkGeos) return chunkGeos;
  chunkGeos = [];
  const pal = [[0xeaf2ff, 0xc8d2e4, 0x9aa6bc], [0x5a6688, 0x3a4258, 0x7a86a8], [0xf4ead0, 0xd8c4a0, 0xb89a70]];
  for (let i = 0; i < 9; i++) {
    const g = new VoxGrid();
    const c = pal[i % 3];
    const w = 2 + (i % 3), hgt = 2 + ((i * 7) % 3), d = 2 + ((i * 5) % 2);
    for (let x = 0; x < w; x++) for (let y = 0; y < hgt; y++) for (let z = 0; z < d; z++) {
      if (Math.random() < 0.18 && (x === 0 || y === hgt - 1)) continue; // broken edges
      g.set(x, y, z, y === hgt - 1 ? c[0] : (x + z) % 3 ? c[1] : c[2]);
    }
    if (i % 4 === 3) g.set(1, 0, 0, TEAM[0], true); // a still-glowing panel light
    chunkGeos.push(g.build({ scale: 0.13, pivot: 'center' }));
  }
  return chunkGeos;
}

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
  const scene = view.scene;
  const bx = lab.root.position.x;
  const H = Math.max(2, lab.height ?? 3), W = Math.max(2.4, lab.width ?? 3.4);
  const out = side === 0 ? 1 : -1; // toward the field
  const team = TEAM[side];
  view.autoFollow = false;

  // ---- camera: push in + slow orbit around the base (keeps going until the result screen)
  const clk = makeClock(view);
  const tgt = V3(bx, H * 0.42, 0);
  const yawDir = side === 0 ? -1 : 1; // swing around to look in toward the field
  const pos0 = new THREE.Vector3(), look0 = new THREE.Vector3(), want = new THREE.Vector3(), look = new THREE.Vector3();
  view.camFx = (cam, c) => {
    const t = clk.now();
    const k = 1 - (1 - Math.min(1, t / 1.3)) ** 3;
    const yaw = yawDir * (0.12 + 0.26 * k + 0.035 * t);
    const dist = THREE.MathUtils.lerp(c.dist, Math.max(H * 2.6, W * 2, c.dist * (cam.aspect < 1 ? 0.62 : 0.5)), k);
    pos0.set(...c.pos); look0.set(...c.look);
    want.set(tgt.x + Math.sin(yaw) * dist, tgt.y + dist * (0.26 + 0.04 * k), Math.cos(yaw) * dist);
    cam.position.copy(pos0).lerp(want, k);
    look.copy(look0).lerp(tgt, k);
    cam.lookAt(look);
  };

  // ---- 0 s: the killing blow
  engine.hitstop(0.14);
  engine.shake(0.7);
  engine.timeScale = 0.22 / clk.slow();
  audio.play('explode', { pitch: 0.5 });
  audio.play('alarm', { vol: 0.5, pitch: 0.8 });
  const ch = view.cmds[side];
  if (ch) {
    ch.busy = true;
    ch.play('panic', { restart: true });
    ch.expr('shock', 'scream');
    ch.face?.fx('sweat', true);
  }
  const win = view.cmds[1 - side];
  if (win) {
    win.busy = true;
    win.play('cheer');
    win.expr('star', 'grin');
  }
  // the structure shudders and sinks a little
  const r0 = lab.root.rotation.z, y0 = lab.root.position.y;
  clk.anim(0.9, (e) => {
    lab.root.rotation.z = r0 + Math.sin(e * 60) * 0.025 * e - out * 0.05 * e;
    lab.root.position.y = y0 - e * 0.15;
    lab.root.position.x = (side === 0 ? -1 : 1) * Math.abs(lab.root.position.x) + Math.sin(e * 77) * 0.05 * e;
  });
  // fires catch everywhere
  view.emit(0.9 * 0.22, 0.05, () => {
    const p = V3(bx + rnd(-W, W) * 0.45, rnd(0.3, H * 0.9), rnd(-0.6, 0.9));
    hpx.fire(p, { count: 2, scale: rnd(0.9, 1.5), radius: 0.4 });
  });
  // chain explosions out of the walls
  for (let i = 0; i < 5; i++) {
    clk.at(0.06 + i * 0.17, () => {
      const p = V3(bx + rnd(-W, W) * 0.42, rnd(H * 0.25, H * 0.9), rnd(0.2, 1));
      hpx.boom(p, { scale: 1 + i * 0.12 });
      fx.burst(p, { count: 14, colors: [0xeaf2ff, team, 0x9aa6bc, 0xffd23f], size: 0.12, speed: 7 });
      hpx.chips(p, { count: 6, colors: [0xeaf2ff, 0x9aa6bc, team], speed: 6 });
      audio.play('explode', { pitch: 0.7 + i * 0.12, vol: 0.8 });
      engine.shake(0.35);
    });
  }

  // ---- 0.9 s: COLLAPSE
  clk.at(0.9, () => {
    const prevChunk = lab.onChunk;
    lab.onChunk = (mesh) => fx.shatter(mesh, { force: 11, dirX: out * 0.5, life: 3.2, fraction: 0.8 });
    lab.setDamage(1);
    lab.onChunk = prevChunk;
    // the rubble heap slams down
    lab.root.rotation.z = 0;
    lab.root.position.y = y0;
    const sc = lab.root.scale.clone();
    clk.anim(0.5, (e) => {
      const s = e < 0.35 ? 1.35 - (e / 0.35) * 0.55 : e < 0.7 ? 0.8 + ((e - 0.35) / 0.35) * 0.3 : 1.1 - ((e - 0.7) / 0.3) * 0.1;
      lab.root.scale.set(sc.x * (2 - s) ** 0.5, sc.y * s, sc.z * (2 - s) ** 0.5);
    }, () => lab.root.scale.copy(sc));
    const c = V3(bx, H * 0.45, 0.4);
    hpx.boom(c, { scale: 2.2, flames: 5 });
    hpx.boom(V3(bx - W * 0.3, H * 0.3, 0.6), { scale: 1.3 });
    hpx.boom(V3(bx + W * 0.3, H * 0.6, 0.2), { scale: 1.2 });
    hpx.sparks(c, { count: 46, speed: 11, scale: 1.3, up: 5 });
    fx.burst(c, { count: 60, colors: [0xeaf2ff, team, 0x9aa6bc, 0x5a6688], size: 0.14, speed: 10 });
    // heavy voxel chunks: fly, spin, bounce, then lie in the rubble
    const geos = chunkShapes();
    const chunks = [];
    for (let i = 0; i < 12; i++) {
      const m = makeMesh(geos[i % geos.length]);
      m.position.set(bx + rnd(-W, W) * 0.3, rnd(H * 0.3, H * 0.8), rnd(-0.3, 0.8));
      m.scale.setScalar(rnd(0.8, 1.5));
      scene.add(m);
      const a = rnd(-0.9, 0.9) + (i % 3 === 0 ? Math.PI : 0); // most fly toward the field, some backward
      const sp = rnd(4, 10);
      chunks.push({ m, vx: Math.cos(a) * sp * (i % 3 === 0 ? 1 : out), vy: rnd(5, 11), vz: rnd(-1, 3), sx: rnd(-9, 9), sy: rnd(-9, 9), rest: false, bounces: 0 });
    }
    view.emit(6, 1 / 60, () => {
      const dt = 1 / 60;
      for (const k of chunks) {
        if (k.rest) continue;
        k.vy -= 22 * dt;
        k.m.position.x += k.vx * dt; k.m.position.y += k.vy * dt; k.m.position.z += k.vz * dt;
        k.m.rotation.x += k.sx * dt; k.m.rotation.y += k.sy * dt;
        const floor = 0.1 * k.m.scale.x;
        if (k.m.position.y < floor) {
          k.m.position.y = floor;
          if (k.bounces++ < 2 && k.vy < -2) {
            k.vy = -k.vy * 0.35; k.vx *= 0.5; k.vz *= 0.5; k.sx *= 0.4; k.sy *= 0.4;
            hpx.dust(k.m.position, { count: 2, scale: 0.8 });
            hpx.chips(k.m.position, { count: 2, colors: [0xd8c4a0, 0x9aa6bc], speed: 2 });
          } else { k.rest = true; k.m.rotation.x = Math.round(k.m.rotation.x / (Math.PI / 2)) * (Math.PI / 2); }
        }
      }
    });
    view.chunkDebris = (view.chunkDebris ?? []).concat(chunks.map((k) => k.m));
    // the dust wave: rolling dust + low debris sweeping out along the ground both ways
    for (let i = 0; i < 26; i++) {
      const d = i % 2 ? 1 : -1;
      hpx.dust(V3(bx + d * rnd(0.2, W * 0.5), 0, rnd(-0.6, 1.2)), { count: 1, scale: rnd(1.4, 2.4), vx: d * rnd(3, 8), spread: 0.4, life: rnd(1.2, 1.8), color: pickc([0xe8dcc0, 0xd8c4a0, 0xc8b28a, 0xb8b0a8]) });
    }
    for (let i = 0; i < 16; i++) {
      const d = i % 2 ? 1 : -1;
      hpx.chips(V3(bx + d * 0.6, 0.15, rnd(-0.4, 1)), { count: 1, colors: [0xd8c4a0, 0x9aa6bc, 0xeaf2ff], speed: 1, vx: d * rnd(4, 9), up: 0.4 });
    }
    hpx.smoke(V3(bx, H * 0.4, 0), { count: 16, scale: 2.4, radius: W * 0.5, rise: 2.2, life: 2, colors: [0x46404f, 0x5a5468, 0x2e2a38, 0x6e687c] });
    if (view.theme === 'mart') fx.groceries(c, { count: 40, speed: 10 });
    if (lab.style === 'mansion' || lab.style === 'goldVault') fx.cash(c, 120, { speed: 10 });
    engine.shake(1);
    engine.hitstop(0.1);
    audio.play('boom', { pitch: 0.55 });
    audio.play('explode', { pitch: 0.45 });
    audio.play('shatter', { pitch: 0.7 });
    clk.at(0.12, () => audio.play('crunch', { pitch: 0.5 }));
    clk.at(0.26, () => audio.play('thud', { pitch: 0.6 }));

    // the Commander is blasted off the roof, tumbling
    if (ch) {
      ch.play('shocked', { restart: true, dur: 0.4, then: 'panic' });
      ch.expr('dizzy', 'shout');
      ch.flash?.(0.12);
      const from = ch.root.position.clone();
      const to = V3(bx + out * rnd(3.2, 4), 0, 1.6);
      const peak = Math.max(from.y + 2.4, H + 2.5);
      clk.anim(1.15, (k) => {
        const x = THREE.MathUtils.lerp(from.x, to.x, k), z = THREE.MathUtils.lerp(from.z, to.z, k);
        const y = (1 - k) * (1 - k) * from.y + 2 * (1 - k) * k * (peak * 1.2) + k * k * 0;
        ch.root.position.set(x, Math.max(0, y), z);
        ch.root.rotation.x = k * Math.PI * 4;
        ch.root.rotation.z = -out * k * Math.PI * 2;
        if (Math.random() < 0.5) hpx.streaks(V3(x, y + 0.5, z), out, { count: 1, h: 0.6, color: 0xffffff });
        if (Math.random() < 0.3) hpx.smoke(V3(x, y + 0.4, z), { count: 1, scale: 0.5, colors: [0x46404f, 0x5a5468] });
      }, () => {
          ch.root.rotation.set(0, side === 0 ? 0.55 : -0.55, 0);
          ch.boing?.(-0.5);
          ch.play('dizzy');
          ch.expr('x', 'open');
          ch.emote?.('star', 1.6);
          hpx.dust(ch.root.position, { count: 6, scale: 1.4 });
          hpx.hit(V3(ch.root.position.x, 0.4, ch.root.position.z), 'heavy', 1.2, out);
          audio.play('thud', { pitch: 0.9 });
          audio.play('boing', { pitch: 0.7 });
          engine.shake(0.3);
          clk.at(1.1, () => { ch.play('cry'); ch.expr('cry', 'sad'); ch.face?.fx('tears', true); });
      });
    }
    if (win) {
      win.play('victory');
      win.emote?.('sparkle', 2);
    }
    // the rubble keeps burning and smoking
    view.emit(8, 0.08, (k) => {
      const p = V3(bx + rnd(-W, W) * 0.4, rnd(0.1, 0.6), rnd(-0.4, 0.9));
      if (Math.random() < 0.7 * (1 - k * 0.6)) hpx.fire(p, { count: 1, scale: rnd(0.9, 1.6), radius: 0.3 });
      if (Math.random() < 0.35) hpx.smoke(p, { count: 1, scale: rnd(1.2, 2), rise: 1.3, colors: [0x46404f, 0x5a5468, 0x2e2a38] });
      if (Math.random() < 0.25) hpx.embers(p, { count: 2 });
    });
    // ease time back to normal
    clk.at(0.5, () => {
      const s0 = engine.timeScale;
      clk.anim(0.5, (e) => { if (engine.timeScale < 1) engine.timeScale = s0 + (1 - s0) * e; }, () => { engine.timeScale = 1; });
    });
  });
  await new Promise((r) => clk.at(2.2, r));
}
