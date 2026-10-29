// Commander ULTIMATE payoffs in the battle view. The cutscene (sigCutscene.js)
// stages the build-up while the battle is frozen; this lands the result when
// the sim fires the ability and runs the lingering effects:
//   MUTANT UPRISING  troops bulk up in a green serum burst, free mutant squads drop in
//   BEAST BUYOUT     bought troops vanish in cash and re-appear on your side, a cash storm
//   ORBITAL FLOP     the meteor impact (debris, flames, dust) + a burning crater
//   TIEMPO MUERTO    enemies frozen in amber under a stopped clock, then they shatter
// 2D pixel-art sprites only (pixfx.js); no rings, discs or shockwave circles.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { rand } from '../../core/util.js';
import { pix, defineSprite } from './pixfx.js';

/** Ultimate colours (cutscene name card, HUD ring); a signature's own `color` wins. */
export const SIG_COL = { mutantUprising: '#7cff3a', beastBuyout: '#ffd84a', orbitalFlop: '#3fb8ff', tiempoMuerto: '#ff8a2a' };
export const sigColor = (sg) => sg?.color ?? SIG_COL[sg?.id] ?? '#ffd84a';
/** The word stamped on screen when an ultimate lands. */
export const PAYOFF = { mutantUprising: 'MUTATE!', beastBuyout: 'SOLD!', orbitalFlop: 'SPLASHDOWN!', tiempoMuerto: 'TIME STOP!' };

// extra sprites for the ultimates
defineSprite('dollar', ['  +  ', ' ####', '# #  ', '#+#  ', ' ### ', '  #+#', '  # #', '#### ', '  +  ']);
defineSprite('chunk', [' .++. ', '.+##+.', '+###-+', '.-#--.', ' .--  ']);
defineSprite('streak', [' + ', ' # ', '+#+', '+#+', '-#-', '-+-', '.+.', '.-.', ' . ', ' . ']);
defineSprite('helix', ['#.  .+', '.#..+.', ' .##. ', ' .++. ', '.+..#.', '+.  .#', '.+..#.', ' .##. ', ' .++. ', '.#..+.', '#.  .+']);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const GREEN = [0x7cff3a, 0xd4ff9a, 0x3fd14a, 0xffffff];
const GOLD = [0xffd84a, 0xfff2b0, 0xffb02e, 0xffffff];
const AMBER = [0xffa31a, 0xffd27a, 0xff7a1f, 0xfff2c8];

let amberMat = null;
function amberIce(view) {
  if (!amberMat && view.iceMat) {
    amberMat = view.iceMat.clone();
    amberMat.color = new THREE.Color(0xffa31a);
    if (amberMat.emissive) amberMat.emissive = new THREE.Color(0x5a2a00);
    amberMat.opacity = 0.6;
  }
  return amberMat;
}

/** A lingering effect ticked by the view in battle time (frozen during cutscenes). */
function linger(view, dur, fn) {
  let t = 0;
  const z = { done: false, update: (dt) => { t += dt; fn(t, dt); if (t >= dur) z.done = true; } };
  view.zones.push(z);
  return z;
}

/** The sim's 'signature' event: land the ability's result. */
export function sigResolveFx(view, ev) {
  const P = pix(view);
  const side = ev.side, dir = side === 0 ? 1 : -1;
  switch (ev.id) {
    case 'mutantUprising': {
      for (const id of ev.mutated ?? []) {
        const a = view.actors.get(id);
        if (!a) continue;
        const q = a.rig.root.position, H = Math.max(0.5, a.rig.height);
        P.burst(V(q.x, q.y + H * 0.5, q.z + 0.2), { tex: 'plus', count: 10, speed: 4, lift: 2, size: 0.26, color: GREEN, glow: 2.4, life: 0.6, drag: 2 });
        P.burst(V(q.x, q.y + 0.2, q.z + 0.2), { tex: 'drop', count: 6, speed: 3, lift: 3, grav: 10, size: 0.22, color: GREEN, glow: 2, life: 0.7 });
        a.rig.boing?.(0.9);
      }
      for (const sq of ev.squads ?? []) view.dropVial?.(side, sq.unit, sq.x, sq.count, sq.delay);
      audio.play('slime', { pitch: 0.7 });
      audio.play('growl', { pitch: 0.8, vol: 0.6 });
      audio.play('upgrade', { pitch: 0.8 });
      engine.shake(0.45);
      break;
    }
    case 'beastBuyout': {
      for (const sw of ev.swaps ?? []) {
        const a = view.actors.get(sw.from);
        const q = a ? a.rig.root.position.clone() : V(sw.x, 0, 0);
        if (a) { a.flushDamage?.(); a.dispose(); view.actors.delete(sw.from); }
        P.burst(V(q.x, q.y + 0.6, q.z + 0.3), { tex: 'cash', count: 16, speed: 5, lift: 3, grav: 5, size: 0.34, color: [0x5fdc4a, 0x8af07a, 0xd4ffb0], glow: 1.4, life: 1.1, spin: 6, additive: false });
        P.burst(V(q.x, q.y + 0.8, q.z + 0.3), { tex: 'dollar', count: 6, speed: 3, lift: 2.5, size: 0.34, color: GOLD, glow: 2.4, life: 0.8, drag: 2 });
        P.burst(V(q.x, q.y + 0.6, q.z + 0.3), { tex: 'star4', count: 8, speed: 4, size: 0.4, color: GOLD, glow: 2.6, life: 0.4 });
        const n = view.actors.get(sw.to);
        if (n) { n.rig.flash?.(0.3); n.rig.boing?.(0.6); }
      }
      for (const hi of ev.hires ?? []) view.dropVial?.(side, hi.unit, hi.x, hi.count, hi.delay);
      for (const a of view.actors.values()) {
        if (a.u.side === side || a.u.dead) continue;
        const q = a.rig.root.position, H = Math.max(0.5, a.rig.height);
        P.spawn({ tex: 'dollar', x: q.x, y: q.y + H + 0.3, z: q.z + 0.3, vy: 0.8, size: 0.3, color: GOLD, glow: 2.4, life: 1.4, flicker: 0.1 });
      }
      // the cash storm keeps falling over the battlefield for a moment
      linger(view, 2.2, (t) => {
        if (Math.random() < 0.7) {
          const x = (ev.x ?? 0) + rand(-6, 6);
          P.spawn({ tex: 'cash', x, y: 7 + rand(0, 2), z: rand(-1, 1.5), vx: rand(-0.6, 0.6), vy: -2.6, size: 0.36, color: [0x5fdc4a, 0x8af07a], glow: 1.3, life: 2.4, spin: rand(-4, 4), ground: 0.05, additive: false });
        }
        void t;
      });
      audio.play('chaching');
      audio.play('stamp', { pitch: 0.9 });
      audio.play('cheer', { vol: 0.6 });
      engine.shake(0.3);
      break;
    }
    case 'orbitalFlop': {
      const x = ev.x, R = ev.r ?? 4;
      P.burst(V(x, 0.6, 0.3), { tex: 'flame', count: 46, speed: 10, lift: 4, size: 0.8, color: [0xff3a1a, 0xff7a1f, 0xffd84a, 0xfff2b0], glow: 2.4, life: 0.8, drag: 2.2 });
      P.burst(V(x, 0.5, 0.3), { tex: 'chunk', count: 30, speed: 11, lift: 7, grav: 22, size: 0.42, color: [0x8a6a4a, 0x6a4a32, 0xb08a5a], glow: 1, life: 1.3, spin: 8, ground: 0.1, additive: false });
      P.burst(V(x, 0.4, 0.3), { tex: 'ember', count: 40, speed: 13, lift: 6, grav: 9, size: 0.24, color: [0xffd84a, 0xff7a1f, 0xffffff], glow: 2.4, life: 1.1 });
      P.burst(V(x, 1.2, 0.4), { tex: 'star4', count: 14, speed: 6, size: 1.1, color: [0xffffff, 0xbfe8ff], glow: 3, life: 0.3 });
      for (let i = 0; i < 18; i++) {
        const k = (i / 17) * 2 - 1;
        P.spawn({ tex: 'cloud', x: x + k * 1.2, y: 0.5, z: rand(-0.6, 1), vx: k * 9, vy: rand(0.3, 1.2), drag: 2.4, size: rand(1, 1.6), color: [0xd8c8b0, 0xb8a890, 0xf0e8d8], glow: 1.05, life: rand(0.9, 1.4), additive: false });
      }
      for (let i = 0; i < 10; i++) P.spawn({ tex: 'streak', x: x + rand(-R * 0.5, R * 0.5), y: rand(1, 3), z: rand(0, 0.8), vy: rand(10, 16), size: rand(0.6, 1), color: [0xffffff, 0x9ff2ff], glow: 2.6, life: 0.35 });
      view.smashNear?.(x, R, side);
      audio.play('explode', { pitch: 0.6 });
      audio.play('boom', { pitch: 0.7 });
      audio.play('vineBoom', { vol: 0.9 });
      engine.shake(1);
      engine.hitstop(0.12);
      // the burning crater (sim zone: slows + burns enemies)
      const z = view.sim.zones.find((zz) => zz.kind === 'crater' && Math.abs(zz.x - x) < 0.01);
      const r = z?.r ?? R * 0.8;
      linger(view, z?.t ?? 10, (t) => {
        const fade = Math.min(1, (10 - t) / 1.5);
        if (Math.random() < 0.85 * fade) {
          const px = x + rand(-r, r);
          P.spawn({ tex: 'flame', x: px, y: 0.15, z: rand(-1.2, 1.4), vy: rand(0.8, 1.8), size: rand(0.28, 0.5), color: [0xff3a1a, 0xff7a1f, 0xffb02e], glow: 2.2, life: rand(0.35, 0.6), flicker: 0.15 });
        }
        if (Math.random() < 0.4 * fade) P.spawn({ tex: 'ember', x: x + rand(-r, r), y: 0.2, z: rand(-1, 1.2), vy: rand(1.5, 3), vx: rand(-0.5, 0.5), size: 0.14, color: [0xffd84a, 0xff7a1f], glow: 2.2, life: 0.9 });
        if (Math.random() < 0.25 * fade) P.spawn({ tex: 'cloud', x: x + rand(-r, r), y: 0.6, z: rand(-1.5, 0), vy: 0.6, size: rand(0.7, 1.1), color: [0x4a3a36, 0x5a4a44], glow: 1, life: 1.4, additive: false });
      });
      break;
    }
    case 'tiempoMuerto': {
      const en = 1 - side;
      const dur = ev.dur ?? 7;
      for (const a of view.actors.values()) if (a.u.side === en) stopBurst(view, a);
      const lab = view.labs?.[en];
      const bx = lab ? lab.root.position.x : view.sim.sides[en].labX;
      const top = Math.min(7, (lab?.height ?? 3) + 2.4);
      // a giant stopped clock hangs over the rival base for the whole time-stop
      P.spawn({ tex: 'clock', x: bx - dir * 0.4, y: top, z: -0.6, size: 3.2, size1: 3.2, color: 0xffb02e, glow: 1.35, life: dur, additive: false });
      audio.play('lightsOut', { vol: 0.8 });
      audio.play('freeze', { pitch: 0.6 });
      audio.play('bell', { pitch: 0.5 });
      engine.shake(0.4);
      let tick = 0;
      linger(view, dur, (t, dt) => {
        tick -= dt;
        if (tick <= 0) { tick = 0.5; audio.play('tick', { pitch: 0.7, vol: 0.35, gap: 0.2 }); }
        const mat = amberIce(view);
        for (const a of view.actors.values()) {
          if (a.u.side !== en || !a.u.tStop) continue;
          if (a.iceMesh && mat && a.iceMesh.material !== mat) a.iceMesh.material = mat;
          if (Math.random() < 0.08) {
            const q = a.rig.root.position, H = Math.max(0.5, a.rig.height);
            P.spawn({ tex: 'plus', x: q.x + rand(-0.4, 0.4), y: q.y + H * rand(0.3, 1.2), z: q.z + 0.4, size: 0.18, color: AMBER, glow: 2.2, life: 0.6 });
          }
        }
        if (lab && Math.random() < 0.3) P.spawn({ tex: 'plus', x: bx + rand(-1.6, 1.6), y: rand(0.3, top - 1), z: rand(0.4, 1.4), size: 0.2, color: AMBER, glow: 2.2, life: 0.7 });
      });
      break;
    }
    default:
      break;
  }
}

/** One enemy caught by TIEMPO MUERTO. */
function stopBurst(view, a) {
  const q = a.rig.root.position, H = Math.max(0.5, a.rig.height);
  pix(view).burst(V(q.x, q.y + H * 0.5, q.z + 0.3), { tex: 'hex', count: 4, speed: 1.6, size: 0.36, color: AMBER, glow: 2.2, life: 0.5, drag: 3 });
  pix(view).burst(V(q.x, q.y + H * 0.5, q.z + 0.3), { tex: 'plus', count: 6, speed: 3, size: 0.2, color: AMBER, glow: 2.4, life: 0.4 });
}

/** Lingering ultimate events: a new enemy frozen mid time-stop, and time restarting. */
export function sigEventFx(view, ev) {
  if (ev.type === 'timeStopped') {
    const a = view.actors.get(ev.unit.id);
    if (a) stopBurst(view, a);
    return;
  }
  if (ev.type === 'timeResume') {
    const P = pix(view);
    for (const x of ev.xs ?? []) {
      P.burst(V(x, 0.7, 0.3), { tex: 'diamond', count: 12, speed: 6, lift: 3, grav: 12, size: 0.3, color: AMBER, glow: 2.2, life: 0.7 });
      P.burst(V(x, 0.8, 0.3), { tex: 'star4', count: 4, speed: 3, size: 0.5, color: [0xffffff, 0xffd27a], glow: 2.8, life: 0.25 });
    }
    const en = 1 - ev.side;
    const lab = view.labs?.[en];
    if (lab) {
      const bx = lab.root.position.x, H = Math.min(6, lab.height ?? 3);
      P.burst(V(bx, H * 0.6, 0.8), { tex: 'chunk', count: 18, speed: 7, lift: 4, grav: 16, size: 0.36, color: [0xffa31a, 0xffd27a, 0x8a6a4a], glow: 1.2, life: 1, spin: 6, ground: 0.1, additive: false });
      P.burst(V(bx, H * 0.6, 0.8), { tex: 'diamond', count: 14, speed: 6, size: 0.3, color: AMBER, glow: 2.4, life: 0.6 });
    }
    audio.play('shatter', { pitch: 0.8 });
    audio.play('hitHeavy', { pitch: 0.7 });
    engine.shake(0.5);
  }
}
