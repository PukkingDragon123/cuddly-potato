// Readable first-pass visuals for the troop signature-trait events emitted by
// troopTraits.js (roar, leap, charge, devour, meltdown...). view.js forwards
// every event it doesn't handle itself to troopFx(view, ev). Only reuses the
// existing pixel / voxel FX kit (hitPix, pixfx, particles, voxfx), so the
// combat-FX owner can restyle any of these in one place.
import * as THREE from 'three';
import { fx } from '../../core/particles.js';
import { audio } from '../../core/audio.js';
import { floatText } from '../../ui/ui.js';
import { hpx } from './hitPix.js';
import { pix } from './pixfx.js';
import { voxelPuddle, voxelBeam, groundHit, groundImpact } from './voxfx.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rand = (a, b) => a + Math.random() * (b - a);

/** The troop's actor, if it is on screen. */
function actorOf(view, unit) {
  const a = unit ? view.actors.get(unit.id) : null;
  return a && !a.hidden ? a : null;
}
function topOf(a) {
  const p = a.rig.root.position;
  return V(p.x, p.y + Math.max(0.5, a.rig.height) + 0.35, p.z);
}
function midOf(a) {
  const p = a.rig.root.position;
  return V(p.x, p.y + Math.max(0.5, a.rig.height) * 0.55, p.z);
}
/** A floating label, de-duplicated: the same word never stacks on itself within 0.7 s. */
function label(view, pos, text, cls, life) {
  const now = view.t ?? 0;
  const seen = (view.troopLabels ??= {});
  if (seen[text] > now - 0.7) return;
  seen[text] = now;
  floatText(pos, text, cls, { life, rise: 36 });
}
/** One short callout above a troop (rate limited per troop too, so labels never pile up). */
function callout(view, a, text, cls = 'crit', life = 0.85) {
  if (!a) return;
  const now = view.t ?? 0;
  if (a.calloutT > now - 0.9) return;
  a.calloutT = now;
  label(view, topOf(a), text, cls, life);
}
/** A ground decal puddle (voxel goo) that fades out after dur seconds. */
function groundPool(view, x, z, r, color, dur, tick) {
  const pool = voxelPuddle(r, color);
  const mat = pool.material[0];
  pool.position.set(x, 0.02, z ?? 0);
  pool.scale.set(0.2, 1, 0.2);
  view.scene.add(pool);
  let t = 0;
  const zone = {
    done: false,
    update: (dt) => {
      t += dt;
      const k = Math.min(1, t / 0.2);
      pool.scale.set(0.2 + k * 0.8, 1, 0.2 + k * 0.8);
      tick?.(t, dt);
      if (t > dur) {
        mat.opacity = Math.max(0, 0.85 - (t - dur) * 2);
        if (mat.opacity <= 0) {
          view.scene.remove(pool);
          mat.dispose();
          zone.done = true;
        }
      }
    },
  };
  view.zones.push(zone);
}

const POOL_COLORS = { fire: 0xff6a1f, water: 0x5fc8ff, slime: 0x7cff3a };

export function troopFx(view, ev) {
  switch (ev.type) {
    case 'roar': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      a.rig.boing?.(0.5);
      pix(view).burst(V(p.x, 0.6, p.z + 0.2), { tex: 'chevron', count: 14, speed: 6, size: 0.35, color: [0xffd23f, 0xffffff], glow: 2, life: 0.5 });
      hpx.dust(V(p.x - ev.r * 0.5, 0, p.z), { count: 3, scale: 1.3, vx: -2 });
      hpx.dust(V(p.x + ev.r * 0.5, 0, p.z), { count: 3, scale: 1.3, vx: 2 });
      callout(view, a, 'ROAR!', 'big', 1);
      audio.play('roar', { pitch: 0.9, gap: 0.2 });
      break;
    }
    case 'stop': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(midOf(a), { tex: 'star4', count: 6, speed: 2.5, size: 0.3, color: [0xff3d3d, 0xffffff], glow: 2, life: 0.4 });
      callout(view, a, 'STOP!', 'crit');
      audio.play('stamp', { pitch: 1.1, gap: 0.12 });
      break;
    }
    case 'wrap': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(midOf(a), { tex: 'plus', count: 10, speed: 2, size: 0.28, color: [0xffffff, 0xf2ead8], glow: 1.4, life: 0.5 });
      callout(view, a, 'WRAPPED!', 'armor');
      audio.play('tear', { pitch: 1.2, gap: 0.15 });
      break;
    }
    case 'spin': {
      const a = actorOf(view, ev.unit);
      const z = a ? a.rig.root.position.z : 0;
      const big = ev.r > 1.8;
      pix(view).burst(V(ev.x, big ? 0.5 : 0.45, z + 0.2), { tex: big ? 'chevron' : 'diamond', count: big ? 16 : 8, speed: big ? 7 : 4, size: big ? 0.32 : 0.22, color: big ? [0xc063ff, 0xff4fa3, 0xffffff] : [0xffd23f, 0xff8a2a, 0xffffff], glow: 1.8, life: 0.35 });
      if (big) { hpx.dust(V(ev.x, 0, z), { count: 4, scale: 1.2 }); audio.play('boom', { pitch: 1.3, vol: 0.5, gap: 0.12 }); }
      break;
    }
    case 'trail':
      groundPool(view, ev.x, ev.z, ev.r * 0.8, POOL_COLORS[ev.kind] ?? 0xff6a1f, ev.dur, (t, dt) => {
        if (Math.random() < dt * 5) hpx.fire(V(ev.x + rand(-0.3, 0.3), 0.05, (ev.z ?? 0) + rand(-0.2, 0.2)), { count: 1, scale: 0.6, embers: false });
      });
      break;
    case 'puddle':
      groundPool(view, ev.x, rand(-0.2, 0.2), ev.r, POOL_COLORS[ev.kind] ?? 0x5fc8ff, ev.dur, (t, dt) => {
        if (Math.random() < dt * 3) fx.bubbles(V(ev.x + rand(-ev.r, ev.r) * 0.7, 0.08, rand(-0.6, 0.6)), { count: 1, color: 0xbff0ff });
      });
      audio.play('slosh', { pitch: 1.3, vol: 0.5, gap: 0.2 });
      break;
    case 'blink': {
      const a = actorOf(view, ev.unit);
      const z = a ? a.rig.root.position.z : 0;
      pix(view).burst(V(ev.from, 0.6, z + 0.2), { tex: 'diamond', count: 10, speed: 3, size: 0.24, color: [0x5ce1e6, 0xff4fa3, 0xffffff], glow: 2, life: 0.35 });
      pix(view).burst(V(ev.to, 0.6, z + 0.2), { tex: 'diamond', count: 10, speed: 3, size: 0.24, color: [0x5ce1e6, 0xff4fa3, 0xffffff], glow: 2, life: 0.35 });
      if (a) { a.glitchT = 0.35; a.rig.root.position.x = ev.to; }
      audio.play('laser', { pitch: 1.8, vol: 0.5, gap: 0.15 });
      break;
    }
    case 'charge': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      callout(view, a, 'CHARGE!', 'crit');
      hpx.streaks(midOf(a), ev.unit.side === 0 ? 1 : -1, { count: 4, h: a.rig.height * 0.6 });
      audio.play('whoosh', { pitch: 1.2, gap: 0.15 });
      break;
    }
    case 'chargeHit': {
      const a = actorOf(view, ev.unit);
      const z = a ? a.rig.root.position.z : 0;
      groundHit(V(ev.x, 0, z), { radius: 1.2, color: 0xffd23f });
      hpx.hit(V(ev.x, 0.6, z), 'heavy', 1.4, ev.unit.side === 0 ? 1 : -1);
      audio.play('hitHeavy', { pitch: 0.9, gap: 0.08 });
      break;
    }
    case 'leap': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      hpx.dust(V(p.x, 0, p.z), { count: 2, scale: 0.7 });
      audio.play('boing', { pitch: 1.6, vol: 0.5, gap: 0.1 });
      break;
    }
    case 'leapLand': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      hpx.landPuff?.(V(p.x, 0, p.z), { scale: 0.8 });
      a.rig.boing?.(0.4);
      break;
    }
    case 'reveal': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(midOf(a), { tex: 'star4', count: 10, speed: 3, size: 0.3, color: [0x5a7cff, 0xc8d4ff, 0xffffff], glow: 2.2, life: 0.45 });
      callout(view, a, 'AMBUSH!', 'crit');
      audio.play('reveal', { pitch: 1.3, vol: 0.6, gap: 0.2 });
      break;
    }
    case 'burrow':
    case 'surface': {
      const a = view.actors.get(ev.unit.id);
      const z = a ? a.rig.root.position.z : 0;
      hpx.chips(V(ev.x, 0.1, z), { count: ev.type === 'surface' ? 10 : 5, colors: [0x8a5a3a, 0xd8c4a0, 0xff6a1f], speed: 4 });
      hpx.dust(V(ev.x, 0, z), { count: 4, scale: 1.2 });
      if (ev.type === 'surface') { groundHit(V(ev.x, 0, z), { radius: 1.4, color: 0xff6a1f }); audio.play('thud', { pitch: 1.1, gap: 0.1 }); }
      break;
    }
    case 'phase': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(midOf(a), { tex: 'diamond', count: 6, speed: 1.5, size: 0.22, color: [0x7af0c8, 0xffffff], glow: 1.8, life: 0.5, lift: 1 });
      if (ev.on) audio.play('shimmer', { pitch: 1.4, vol: 0.35, gap: 0.3 });
      break;
    }
    case 'expose': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(topOf(a), { tex: 'chevron', count: 3, speed: 1, size: 0.24, color: [0xc063ff, 0xff4fa3], glow: 2, life: 0.6, rot: -Math.PI / 2 });
      break;
    }
    case 'root': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      hpx.chips(V(p.x, 0.1, p.z), { count: 6, colors: [0x2fd47a, 0x1f8a4a, 0x8adf5a], speed: 1.5, up: 1.5 });
      callout(view, a, 'ROOTED', 'heal', 0.7);
      break;
    }
    case 'scare': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(topOf(a), { tex: 'flame', count: 8, speed: 3, size: 0.3, color: [0xff8a2a, 0xffd23f], glow: 2.2, life: 0.5 });
      callout(view, a, 'BOO!', 'big', 1);
      audio.play('laugh', { pitch: 0.7, vol: 0.5, gap: 1 });
      break;
    }
    case 'summon': {
      const a = actorOf(view, ev.unit);
      if (a) a.rig.boing?.(0.5);
      hpx.dust(V(ev.x, 0, ev.minion?.z ?? 0), { count: 3, scale: 0.8 });
      fx.groceries?.(V(ev.x, 0.6, ev.minion?.z ?? 0), { count: 3 });
      audio.play('rattle', { pitch: 1.2, vol: 0.5, gap: 0.3 });
      break;
    }
    case 'strike': {
      // a falling column of rocket sparks marks the spot
      const P = pix(view);
      for (let i = 0; i < 8; i++) P.spawn({ tex: 'diamond', x: ev.x + rand(-0.15, 0.15), y: 5 - i * 0.4, z: rand(0, 0.4), vy: -7, life: 0.6, size: 0.24, color: [0xff4fa3, 0x7a6cff, 0xffffff], glow: 2.4, delay: i * 0.05 });
      P.burst(V(ev.x, 0.05, 0.2), { tex: 'chevron', count: 6, speed: 1.2, size: 0.3, color: [0xff4fa3], glow: 2, life: ev.delay, flat: true });
      audio.play('whoosh', { pitch: 0.7, gap: 0.2 });
      break;
    }
    case 'strikeHit':
      groundImpact(V(ev.x, 0, 0), { radius: ev.r * 1.2, colors: [0xff4fa3, 0x7a6cff, 0xffd23f] });
      hpx.boom(V(ev.x, 0.6, 0), { scale: 1.1, color: 0xff6a1a });
      view.smashNear?.(ev.x, ev.r, ev.side);
      audio.play('explode', { pitch: 1.1, gap: 0.1 });
      break;
    case 'abduct': {
      const a = actorOf(view, ev.unit), s = actorOf(view, ev.src);
      if (a && s) voxelBeam(view.scene, midOf(s), a.rig.root.position.clone().setY(0.1), 0x7cff3a, ev.dur * 0.8, 0.28);
      if (a) callout(view, a, 'ABDUCTED!', 'heal');
      audio.play('magic', { pitch: 1.6, vol: 0.6, gap: 0.3 });
      break;
    }
    case 'pull': {
      const a = actorOf(view, ev.unit), s = actorOf(view, ev.src);
      if (a && s) voxelBeam(view.scene, midOf(s), midOf(a), 0xb45cff, 0.35, 0.2);
      if (a) callout(view, a, 'YANK!', 'crit', 0.7);
      audio.play('slosh', { pitch: 0.8, gap: 0.2 });
      break;
    }
    case 'slam': {
      const a = actorOf(view, ev.unit);
      const z = a ? a.rig.root.position.z : 0;
      groundImpact(V(ev.x, 0, z), { radius: ev.r, colors: [0x6a8a4a, 0x8a7a5a, 0xd8c4a0] });
      hpx.chips(V(ev.x, 0.1, z), { count: 8, colors: [0x6a8a4a, 0x8a7a5a], speed: 5 });
      view.smashNear?.(ev.x, ev.r, ev.unit.side);
      audio.play('thud', { pitch: 0.7, gap: 0.1 });
      break;
    }
    case 'freezeHit': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      pix(view).burst(midOf(a), { tex: 'flake', count: 10, speed: 3, size: 0.26, color: [0x9ff2ff, 0xffffff], glow: 2, life: 0.5 });
      audio.play('freeze', { pitch: 1.2, vol: 0.6, gap: 0.15 });
      break;
    }
    case 'heatUp': {
      const a = actorOf(view, ev.unit);
      if (a) callout(view, a, 'MAX HEAT', 'crit', 0.7);
      break;
    }
    case 'execute': {
      const a = actorOf(view, ev.target);
      if (a && Math.random() < 0.5) pix(view).burst(midOf(a), { tex: 'star4', count: 5, speed: 2.5, size: 0.3, color: [0xff3d3d, 0xffffff], glow: 2.2, life: 0.35 });
      break;
    }
    case 'devour': {
      const a = actorOf(view, ev.unit);
      if (a) { a.rig.boing?.(0.7); callout(view, a, 'CHOMP!', 'big', 1); }
      fx.chocolate?.(V(ev.x, 0.6, 0), { count: 14 });
      audio.play('chomp', { gap: 0.1 });
      break;
    }
    case 'feast': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      callout(view, a, 'FRENZY!', 'crit');
      audio.play('bite', { pitch: 0.9, gap: 0.15 });
      break;
    }
    case 'absorb': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      fx.slime(midOf(a), { count: 10, color: 0x7cff3a, speed: 3 });
      callout(view, a, 'ABSORBED!', 'heal');
      audio.play('slime', { pitch: 0.8, gap: 0.15 });
      break;
    }
    case 'deathBomb': {
      const z = ev.unit?.z ?? 0;
      if (ev.kind === 'zap') {
        pix(view).burst(V(ev.x, 0.8, z + 0.2), { tex: 'bolt', count: 16, speed: 6, size: 0.4, color: [0x5fe8ff, 0xffffff, 0xffd23f], glow: 2.6, life: 0.4 });
        groundHit(V(ev.x, 0, z), { radius: ev.r, color: 0x5fe8ff });
        audio.play('zap', { pitch: 0.9, gap: 0.1 });
      } else {
        hpx.boom(V(ev.x, 0.7, z), { scale: Math.min(2, 0.6 + ev.r * 0.45), color: ev.kind === 'nuke' ? 0x9dff3a : 0xff6a1a });
        groundImpact(V(ev.x, 0, z), { radius: ev.r, colors: ev.kind === 'nuke' ? [0x9dff3a, 0x7cff3a, 0xffd23f] : [0xff6a1a, 0xffd23f] });
        view.smashNear?.(ev.x, ev.r, ev.unit?.side ?? 0);
        audio.play('explode', { pitch: 0.8, gap: 0.1 });
        if (ev.r > 2.2) label(view, V(ev.x, 2.4, z), 'MELTDOWN!', 'big', 1.2);
      }
      break;
    }
    case 'erupt': {
      const a = actorOf(view, ev.unit);
      hpx.boom(V(ev.x, 0.9, ev.unit.z ?? 0), { scale: 1.8, color: 0xff5a1a });
      groundImpact(V(ev.x, 0, ev.unit.z ?? 0), { radius: ev.r, colors: [0xff5a1a, 0xffa31a, 0x3a2a2a] });
      hpx.fire(V(ev.x, 0.2, ev.unit.z ?? 0), { count: 10, radius: ev.r * 0.6 });
      if (a) callout(view, a, 'ERUPTION!', 'big', 1.2);
      view.smashNear?.(ev.x, ev.r, ev.unit.side);
      audio.play('explode', { pitch: 0.6, gap: 0.1 });
      break;
    }
    case 'revive': {
      const z = ev.unit?.z ?? 0;
      pix(view).burst(V(ev.x, 0.8, z + 0.2), { tex: 'plus', count: 10, speed: 2.5, size: 0.28, color: [0x7cff3a, 0xffffff, 0xffd23f], glow: 2.2, life: 0.6, lift: 1.5 });
      label(view, V(ev.x, 1.4, z), '1-UP!', 'heal', 1);
      audio.play('levelUp', { pitch: 1.6, vol: 0.4, gap: 0.3 });
      break;
    }
    case 'healPulse': {
      const a = actorOf(view, ev.target);
      if (!a) break;
      fx.rise(a.rig.root.position, { count: 6, colors: [0x5fdc4a, 0xd4ff9a], radius: 0.4 });
      break;
    }
    case 'rally': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      pix(view).burst(V(p.x, 0.4, p.z + 0.2), { tex: 'chevron', count: 6, speed: 2, size: 0.22, color: [0xff4fa3, 0xffd23f], glow: 2, life: 0.45, lift: 2 });
      break;
    }
    case 'shove': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      hpx.dust(V(p.x, 0, p.z), { count: 1, scale: 0.6, vx: ev.unit.side === 0 ? -1.5 : 1.5 });
      break;
    }
    default:
      break;
  }
}
