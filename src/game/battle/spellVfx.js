// MAGIC SPELL visuals (the aimed lab spells): every effect is built from 2D
// pixel-art particles (pixfx.js) plus voxel props - no plain rings or discs.
//   adrenaline      Rage Potion      a red potion lobbed in, smashes; rage chevrons blast
//                                    outward; raging troops boil red flames (unitMagic)
//   ironCoat        Iron Skin Hex    steel hex runes rain down onto each troop
//   titanSerum      Titan Serum      a green mutagen storm cloud rains serum drops
//   fireball        Plasma Fireball  a blazing orb arcs in from your base; fire explosion
//   lightningStorm  Tesla Storm      a pixel storm cloud; jagged bolts strike each target
//   overclockChip   Overcharge Bolt  lightning strikes your base; it crackles cyan while boosted
//   timeFreeze      Time Warp        a purple clock glyph spins backwards on the ground,
//                                    rune motes rise, ticking; frozen enemies turn purple
// The view calls magicSpellFx(view, ev) for 'spell' events it doesn't know,
// magicImpact(view, ev) for 'impact' kinds fire / shock, magicBuff(view, ev)
// for 'buff', unitMagic(actor, p) from each troop's status tick and
// updateMagic(view, dt) every frame.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { floatText } from '../../ui/ui.js';
import * as Props from '../../models/props.js';
import { pix } from './pixfx.js';

const rand = (a, b) => a + Math.random() * (b - a);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// storm / mutagen clouds hang just under the top of the battle camera's view
const CLOUD_Y = 3.7;

/** A zone: update(dt) until it returns true (runs on game time, pauses with the battle). */
function zone(view, fn) {
  let t = 0;
  const z = { done: false, update: (dt) => { t += dt; if (fn(t, dt)) z.done = true; } };
  view.zones.push(z);
  return z;
}

/** Jagged pixel lightning from (x, y0) down to (x, y1): stacked bolt sprites. */
export function pixBolt(view, x, y0, y1, z = 0.3, o = {}) {
  const P = pix(view);
  const n = Math.max(4, Math.round((y0 - y1) / 0.55));
  let cx = x;
  for (let i = 0; i < n; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / n;
    cx += rand(-0.28, 0.28);
    if (i === n - 1) cx = x;
    P.spawn({ tex: 'bolt', x: cx, y, z, size: (y0 - y1) / n * 1.25, size1: (y0 - y1) / n * 1.1, rot: rand(-0.3, 0.3), color: i % 3 ? o.color ?? 0x9ff2ff : 0xffffff, glow: 2.8, life: o.life ?? 0.16, flicker: 0.25 });
  }
  // branch sparks at the strike point
  P.burst(V(x, y1 + 0.1, z), { tex: 'star4', count: o.sparks ?? 8, speed: 5, size: 0.3, color: [0xffffff, o.color ?? 0x9ff2ff], glow: 2.6, life: 0.35, drag: 3 });
}

function alliesNear(view, side, x, r) {
  return view.sim.alliesOf(side).filter((u) => Math.abs(u.x - x) <= r + (u.radius ?? 0.3));
}
function enemiesNear(view, side, x, r) {
  return view.sim.enemiesOf(side).filter((u) => Math.abs(u.x - x) <= r + (u.radius ?? 0.3));
}

export function magicSpellFx(view, ev) {
  const side = ev.side, x = ev.x, R = Math.max(1, ev.radius || 2), d = ev.delay ?? 0;
  const P = pix(view);
  switch (ev.id) {
    case 'adrenaline': {
      const potion = (Props.makeBeaker && Props.makeBeaker(0xff3d55)) || null;
      const from = view.labTop(side);
      const to = V(x, 0.35, 0.2);
      audio.play('whoosh', { pitch: 1.2 });
      if (potion) { potion.scale.setScalar(1.6); view.lob(potion, from, to, Math.max(0.2, d), 3.2, 10); }
      zone(view, (t) => {
        if (t < d) { if (Math.random() < 0.5) P.spawn({ tex: 'ember', x: from.x + (to.x - from.x) * (t / d), y: from.y + (to.y - from.y) * (t / d) + Math.sin((t / d) * Math.PI) * 3.2, z: 0.2, size: 0.16, color: [0xff3d55, 0xff8a2a], glow: 2, life: 0.3 }); return false; }
        // SMASH: glass + red mist + rage chevrons racing outward along the ground
        audio.play('shatter', { pitch: 1.1 });
        audio.play('roar', { pitch: 1.5, vol: 0.5 });
        P.burst(V(x, 0.4, 0.2), { tex: 'drop', count: 16, speed: 6, lift: 3, grav: 14, size: 0.24, color: [0xff3d55, 0xff8aa0, 0xffffff], glow: 1.6, life: 0.6 });
        P.burst(V(x, 0.3, 0.2), { tex: 'flame', count: 18, speed: 3, lift: 2.5, size: 0.42, color: [0xff2a1a, 0xff7a1f, 0xffd84a], glow: 2.2, life: 0.7, drag: 2 });
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const ca = Math.cos(a), sa = Math.sin(a) * 0.45;
          P.spawn({ tex: 'chevron', x: x + ca * 0.5, y: 0.08, z: sa * 0.5, vx: ca * R * 2.4, vz: sa * R * 2.4, drag: 2.2, flat: true, rot: -a, size: 0.55, size1: 0.35, color: [0xff3d55, 0xff7a1f], glow: 2.2, life: 0.5 });
        }
        engine.shake(0.2);
        return true;
      });
      break;
    }
    case 'ironCoat': {
      audio.play('magic', { pitch: 0.8 });
      const targets = alliesNear(view, side, x, R);
      const xs = targets.length ? targets.map((u) => [u.x, u.z ?? 0]) : [[x, 0]];
      // one big hex per troop + a scatter over the area, all landing at d
      const drop = (tx, tz, size, big) => {
        const y0 = 5 + rand(0, 1.5), life = Math.max(0.25, d);
        P.spawn({ tex: 'hex', x: tx, y: y0, z: tz + 0.3, vy: -(y0 - (big ? 1 : 0.2)) / life, size, size1: size * 0.9, spin: rand(-4, 4), color: [0x9fb4d8, 0xdfe8ff], glow: 1.8, life,
          onDie: () => { if (big) P.burst(V(tx, 1, tz + 0.3), { tex: 'diamond', count: 8, speed: 3, size: 0.2, color: [0xdfe8ff, 0x9fb4d8, 0xffffff], glow: 2.2, life: 0.4, drag: 3 }); } });
      };
      for (const [tx, tz] of xs) drop(tx, tz, 0.75, true);
      for (let i = 0; i < 8; i++) drop(x + rand(-R, R), rand(-0.6, 0.6), 0.35, false);
      zone(view, (t) => { if (t >= d) { audio.play('latch', { pitch: 1.2 }); audio.play('upgrade', { pitch: 1.4, vol: 0.4 }); return true; } return false; });
      break;
    }
    case 'titanSerum': {
      audio.play('slosh', { pitch: 0.7 });
      audio.play('magic', { pitch: 0.5 });
      // a churning mutagen cloud, then serum rain
      for (let i = 0; i < 4; i++) {
        P.spawn({ tex: 'cloud', additive: false, x: x + (i - 1.5) * R * 0.45, y: CLOUD_Y + rand(-0.1, 0.2), z: rand(-0.4, 0.2), vx: rand(-0.2, 0.2), size: 1.05, size1: 0.9, color: [0x2f7a2a, 0x3f9a34], glow: 1, life: d + 1.3, delay: i * 0.05 });
      }
      zone(view, (t) => {
        if (t < d + 1.1) {
          for (let k = 0; k < 3; k++) P.spawn({ tex: 'drop', additive: false, x: x + rand(-R, R) * 0.8, y: CLOUD_Y - 0.3, z: rand(-0.8, 0.8), vy: -9, size: 0.22, size1: 0.2, color: [0x7cff3a, 0xd4ff9a], glow: 1.3, life: 0.45, ground: 0.05 });
          if (Math.random() < 0.25) P.spawn({ tex: 'diamond', x: x + rand(-R, R), y: 0.15, z: rand(-0.8, 0.8), vy: 1.5, size: 0.22, color: [0x7cff3a, 0xffffff], glow: 2, life: 0.5 });
          return false;
        }
        return true;
      });
      break;
    }
    case 'fireball': {
      const from = view.labTop(side);
      const to = V(x, 0.4, 0);
      audio.play('whoosh', { pitch: 0.6 });
      audio.play('flare', { pitch: 0.8 });
      zone(view, (t) => {
        const k = Math.min(1, t / Math.max(0.2, d));
        const px = from.x + (to.x - from.x) * k, py = from.y + (to.y - from.y) * k + Math.sin(k * Math.PI) * 2.2;
        // blazing core + licking flames + ember trail
        P.spawn({ tex: 'ember', x: px, y: py, z: 0.3, size: 1.1, size1: 0.9, color: 0xfff2b0, glow: 2.6, life: 0.06 });
        for (let i = 0; i < 3; i++) P.spawn({ tex: 'flame', x: px + rand(-0.3, 0.3), y: py + rand(-0.3, 0.3), z: 0.3, vy: 1.5, size: rand(0.4, 0.7), color: [0xff7a1f, 0xffd84a, 0xff3a1a], glow: 2.3, life: 0.28 });
        P.spawn({ tex: 'ember', x: px, y: py, z: 0.2, vx: rand(-1, 1), vy: rand(-1, 1), grav: 3, size: 0.2, color: [0xff7a1f, 0xffd84a], glow: 2, life: 0.5 });
        return k >= 1;
      });
      break;
    }
    case 'lightningStorm': {
      audio.play('rattle', { pitch: 0.5, vol: 0.6 });
      const n = Math.max(1, ev.xs?.length ?? 3);
      const life = d + n * 0.18 + 0.6;
      for (let i = 0; i < 5; i++) {
        P.spawn({ tex: 'cloud', additive: false, x: x + (i - 2) * R * 0.4, y: CLOUD_Y + 0.2 + rand(-0.1, 0.2), z: rand(-0.5, 0), vx: rand(-0.15, 0.15), size: 1.2, size1: 1.05, color: [0x4a5a9a, 0x5a68b0], glow: 0.9, life, delay: i * 0.04 });
      }
      // sheet lightning inside the cloud while it charges
      zone(view, (t) => {
        if (Math.random() < 0.35) P.spawn({ tex: 'bolt', x: x + rand(-R, R) * 0.8, y: CLOUD_Y + 0.2 + rand(-0.2, 0.2), z: 0.4, size: 0.5, rot: rand(0, 6), color: [0x5fe8ff, 0xffffff], glow: 2.6, life: 0.08 });
        return t > life;
      });
      break;
    }
    case 'overclockChip': {
      const top = view.labTop(side);
      audio.play('zap', { pitch: 0.6 });
      audio.play('explode', { pitch: 1.6, vol: 0.4 });
      pixBolt(view, top.x, 10, top.y - 0.6, 0.6, { color: 0xffd84a, sparks: 16, life: 0.25 });
      setTimeout(() => pixBolt(view, top.x + rand(-0.4, 0.4), 10, top.y - 0.4, 0.6, { color: 0x5fe8ff, sparks: 10 }), 90);
      P.burst(V(top.x, top.y - 0.5, 0.6), { tex: 'plus', count: 20, speed: 6, size: 0.3, color: [0x5fe8ff, 0xffffff, 0xffd84a], glow: 2.6, life: 0.5, drag: 2 });
      engine.shake(0.35);
      break;
    }
    case 'timeFreeze': {
      audio.play('shimmer', { pitch: 0.6 });
      const glyphLife = d + 3.2;
      // the clock glyph lies on the ground, spinning backwards; a second, smaller inner dial counter-turns
      // (tilted back 55 degrees so it reads from the low battle camera)
      const gs = Math.min(R * 1.5, 5);
      P.spawn({ tex: 'clock', x, y: gs * 0.5 * Math.cos(0.96) + 0.05, z: -0.4, tilt: 0.96, size: gs, size1: gs, spin: -1.1, color: 0x9a5aff, glow: 1.15, life: glyphLife });
      P.spawn({ tex: 'clock', x, y: gs * 0.5 * Math.cos(0.96) + 0.05, z: -0.3, tilt: 0.96, size: gs * 0.45, size1: gs * 0.45, spin: 2.2, color: 0xd8b0ff, glow: 1.1, life: glyphLife, delay: 0.1 });
      let tick = 0;
      const z = zone(view, (t, dt) => {
        tick -= dt;
        if (tick <= 0) { tick = t < d ? 0.12 : 0.36; audio.play('tick', { pitch: t < d ? 1.6 : 1, vol: 0.5, gap: 0.05 }); }
        if (Math.random() < 0.6) {
          const a = rand(0, Math.PI * 2), r = rand(0.3, 1) * R;
          P.spawn({ tex: Math.random() < 0.5 ? 'rune' : 'plus', x: x + Math.cos(a) * r, y: 0.2, z: Math.sin(a) * r * 0.45, vy: rand(0.8, 1.8), size: 0.26, color: [0xc99aff, 0xf0d8ff, 0x8a5aff], glow: 2.2, life: 0.9 });
        }
        if (t >= d && !z.hit) {
          z.hit = true;
          audio.play('freeze', { pitch: 0.7 });
          audio.play('boom', { pitch: 1.6, vol: 0.4 });
          for (const u of enemiesNear(view, side, x, R)) {
            const a = view.actors.get(u.id);
            if (a) a.warp = true;
          }
          P.burst(V(x, 0.5, 0), { tex: 'rune', count: 22, speed: 6, size: 0.32, color: [0xc99aff, 0xffffff], glow: 2.4, life: 0.6, drag: 2.5 });
        }
        return t > glyphLife;
      });
      break;
    }
    default:
      return false;
  }
  return true;
}

/** 'impact' events of the magic spells. Returns true when handled. */
export function magicImpact(view, ev) {
  const P = pix(view);
  const p = V(ev.x, 0, 0);
  if (ev.kind === 'fire') {
    const R = ev.radius ?? 2.4;
    P.burst(V(ev.x, 0.5, 0.2), { tex: 'flame', count: 34, speed: 7, lift: 3, size: 0.6, color: [0xff3a1a, 0xff7a1f, 0xffd84a, 0xfff2b0], glow: 2.4, life: 0.7, drag: 2.5 });
    P.burst(V(ev.x, 0.4, 0.2), { tex: 'ember', count: 26, speed: 9, lift: 4, grav: 9, size: 0.2, color: [0xffd84a, 0xff7a1f], glow: 2.2, life: 0.9 });
    P.burst(V(ev.x, 1, 0.3), { tex: 'star4', count: 10, speed: 4, size: 0.6, color: [0xffffff, 0xfff2b0], glow: 2.8, life: 0.25 });
    fx.fire(V(ev.x, 0.2, 0), { count: 26, radius: R * 0.8 });
    fx.burst(V(ev.x, 0.5, 0), { count: 30, colors: [0xffd84a, 0xff8a2a, 0x3a2418], speed: 8, size: 0.12 });
    fx.smoke(V(ev.x, 0.6, 0), { count: 8, scale: 1.6, color: 0x3a2a2a });
    audio.play('explode', { pitch: 0.8 });
    audio.play('flare', { pitch: 0.6, vol: 0.6 });
    engine.shake(0.6);
    engine.hitstop(0.07);
    view.smashNear?.(ev.x, R, ev.side);
    return true;
  }
  if (ev.kind === 'shock') {
    pixBolt(view, ev.x, CLOUD_Y, 0.1, 0.4, { color: 0x5fe8ff, sparks: 12 });
    fx.sparkle(V(ev.x, 0.5, 0.3), { count: 10, colors: [0x9ff2ff, 0xffffff], speed: 4, life: 0.35 });
    audio.play('zap', { pitch: 0.8, gap: 0.04 });
    audio.play('thud', { pitch: 1.4, vol: 0.5, gap: 0.04 });
    engine.shake(0.3);
    void p;
    return true;
  }
  return false;
}

/** 'buff' events: a troop goes berserk. */
export function magicBuff(view, ev) {
  const a = view.actors.get(ev.unit?.id);
  if (!a || a.hidden) return;
  const q = a.rig.root.position, H = Math.max(0.5, a.rig.height);
  if (ev.kind === 'rage') {
    pix(view).burst(V(q.x, q.y + H * 0.6, q.z + 0.2), { tex: 'flame', count: 8, speed: 2.5, lift: 2, size: 0.32, color: [0xff2a1a, 0xff7a1f], glow: 2.2, life: 0.5 });
    a.rig.flash?.(0.1);
    a.rig.boing?.(0.4);
    floatText(V(q.x, q.y + H + 0.5, q.z), 'RAGE!', 'crit', { life: 0.9, rise: 34 });
  }
}

/** Per-troop status particles (called from the troop's ~0.15 s status tick). */
export function unitMagic(actor, p) {
  const u = actor.u, view = actor.view, H = Math.max(0.5, actor.rig.height);
  if (u.buffs.rageT > 0) {
    const P = pix(view);
    for (let i = 0; i < 2; i++) P.spawn({ tex: 'flame', x: p.x + rand(-0.3, 0.3) * u.size, y: p.y + rand(0, 0.7) * H, z: p.z + rand(0, 0.3), vy: rand(1.2, 2.2), size: rand(0.18, 0.3) * Math.max(0.8, u.size), color: [0xff2a1a, 0xff5a1f, 0xffa31a], glow: 2.1, life: rand(0.35, 0.55) });
  }
  if (u.buffs.titanT > 0 && Math.random() < 0.5) {
    pix(view).spawn({ tex: 'diamond', x: p.x + rand(-0.4, 0.4) * u.size, y: p.y + rand(0.2, 1) * H * 1.2, z: p.z + 0.3, vy: 1, size: 0.18, color: [0x7cff3a, 0xd4ff9a], glow: 2, life: 0.5 });
  }
  if (actor.warp && actor.iceMesh && actor.iceMesh.material !== warpMat) actor.iceMesh.material = warpIceMat(actor.iceMesh.material);
  if (actor.warp && u.state === 'frozen' && Math.random() < 0.5) {
    pix(view).spawn({ tex: 'rune', x: p.x + rand(-0.3, 0.3), y: p.y + H * rand(0.6, 1.2), z: p.z + 0.35, vy: 0.6, size: 0.2, color: [0xc99aff, 0xf0d8ff], glow: 2.2, life: 0.6 });
  }
}

let warpMat = null;
/** Purple time-warp tint for the frozen block of a troop caught in a Time Warp. */
export function warpIceMat(iceMat) {
  if (!warpMat) { warpMat = iceMat.clone(); warpMat.color = new THREE.Color(0xb07aff); warpMat.emissive = new THREE.Color(0x3a1a6a); warpMat.opacity = 0.55; }
  return warpMat;
}

/** Every frame: bases crackle while their Overcharge Bolt boost runs. */
export function updateMagic(view, dt) {
  const sim = view.sim;
  view.magicT = (view.magicT ?? 0) - dt;
  if (view.magicT > 0) return;
  view.magicT = 0.07;
  for (let i = 0; i < 2; i++) {
    if (!(sim.sides[i]?.buffs?.overclock > 0)) continue;
    const top = view.labTop(i);
    const P = pix(view);
    const a = rand(0, Math.PI * 2);
    P.spawn({ tex: 'bolt', x: top.x + Math.cos(a) * 1.4, y: top.y - 1 + Math.sin(a) * 1.2, z: 0.8, size: 0.55, rot: a, color: [0x5fe8ff, 0xffffff], glow: 2.6, life: 0.1 });
    if (Math.random() < 0.6) P.spawn({ tex: 'plus', x: top.x + rand(-1.6, 1.6), y: top.y - rand(0.5, 2.2), z: 0.8, vy: 1.5, size: 0.22, color: [0x5fe8ff, 0xffffff], glow: 2.4, life: 0.4 });
    if (i === 0 && Math.random() < 0.08) audio.play('zap', { pitch: 1.8, vol: 0.15, gap: 0.2 });
  }
}
