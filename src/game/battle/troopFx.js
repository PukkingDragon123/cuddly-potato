// Readable visuals for the troop signature-trait events emitted by troopTraits.js
// (roar, pounce, grab, charge, devour, meltdown...). Creature moves on the rig itself
// (rig.play / rig.hold, models/swarmMoves.js) are started from here and from view.js. view.js forwards
// every event it doesn't handle itself to troopFx(view, ev). Only reuses the
// existing pixel / voxel FX kit (hitPix, pixfx, particles, voxfx), so the
// combat-FX owner can restyle any of these in one place.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { floatText } from '../../ui/ui.js';
import { hpx } from './hitPix.js';
import { pix } from './pixfx.js';
import { voxelBeam, groundHit, groundImpact } from './voxfx.js';

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
  // one compact pixel tag style for every trait callout (plate colour by mood), matching the damage numbers
  const tone = { crit: 'c-red', big: 'c-gold', heal: 'c-green', armor: 'c-steel' }[cls] ?? 'c-red';
  floatText(pos, text, `hitn t-call ${tone}`, { life, rise: 30, spreadX: 4 });
}
/** One short callout above a troop (rate limited per troop too, so labels never pile up). */
function callout(view, a, text, cls = 'crit', life = 0.85) {
  if (!a) return;
  const now = view.t ?? 0;
  if (a.calloutT > now - 0.9) return;
  a.calloutT = now;
  label(view, topOf(a), text, cls, life);
}
// ---------------------------------------------------------------------------
// Ground patches (fire trail, wet floor): a flat pixel-art decal (lumpy, dithered
// edge, never a circle) PLUS upright pixel sprites, because the side-view camera
// sees the ground almost edge-on - a decal alone reads as a thin line.
// Decal meshes + materials are pooled per view; textures are cached per kind.
const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const decalTex = {};
function patchTex(kind) {
  if (decalTex[kind]) return decalTex[kind];
  const S = 40, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const hsh = (x, y) => { let n = Math.imul(x * 374761393 + y * 668265263, 1274126177); n ^= n >>> 13; return ((n >>> 0) % 1000) / 1000; };
  const fire = kind === 'fire';
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (x + 0.5 - S / 2) / (S / 2), dy = (y + 0.5 - S / 2) / (S / 2), a = Math.atan2(dy, dx);
    const lump = 0.86 + 0.1 * Math.sin(a * 3 + 1) + 0.07 * Math.sin(a * 7) + 0.05 * (hsh(Math.floor((a + 4) * 4), 3) - 0.5);
    const d = Math.max(Math.abs(dx), Math.abs(dy), (Math.abs(dx) + Math.abs(dy)) / 1.3) / lump;
    if (d > 1) continue;
    const edge = d > 0.78, bay = BAY[(y & 3) * 4 + (x & 3)] / 16;
    if (edge && bay < (d - 0.78) / 0.22) continue;
    let c;
    if (fire) {
      // scorched ground: charcoal with glowing ember cracks
      const crack = Math.abs(Math.sin(x * 0.55 + Math.sin(y * 0.4) * 2.2)) < 0.16 || Math.abs(Math.sin(y * 0.7 - x * 0.2)) < 0.1;
      c = crack && d < 0.8 ? (hsh(x, y) > 0.5 ? '#ffd23f' : '#ff7a1a') : d < 0.55 ? '#3a2422' : '#5a3426';
    } else {
      // wet floor: blue water, lighter rim, white glint dashes
      const glint = (y === 13 && x > 12 && x < 20) || (y === 15 && x > 15 && x < 18) || (y === 25 && x > 22 && x < 27);
      c = glint ? '#ffffff' : edge ? '#bfeaff' : d < 0.5 ? '#3fa8ff' : '#6cc4ff';
    }
    g.fillStyle = c;
    g.fillRect(x, y, 1, 1);
  }
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return (decalTex[kind] = t);
}
function groundPatch(view, kind, x, z, r, dur, tick) {
  const pool = (view.patchPool ??= []);
  let m = pool.pop();
  if (!m) {
    m = new THREE.Mesh(PLANE, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false, toneMapped: false }));
    m.renderOrder = 1;
  }
  m.material.map = patchTex(kind);
  m.material.needsUpdate = true;
  m.material.opacity = 0;
  m.position.set(x, 0.035, z ?? 0);
  m.rotation.y = Math.random() < 0.5 ? 0 : Math.PI;
  const W = r * (kind === 'water' ? 2.6 : 2.2), D = Math.max(kind === 'water' ? 2.4 : 1.5, r * 1.8); // deep in z so the edge-on camera still sees a band
  m.scale.set(W * 0.4, 1, D * 0.4);
  view.scene.add(m);
  let t = 0;
  const zone = {
    done: false,
    update: (dt) => {
      t += dt;
      const k = Math.min(1, t / 0.18);
      const e = 1 - (1 - k) ** 2;
      m.scale.set(W * (0.4 + 0.6 * e), 1, D * (0.4 + 0.6 * e));
      const fade = t > dur ? Math.max(0, 1 - (t - dur) / 0.4) : 1;
      m.material.opacity = (kind === 'fire' ? 0.85 + Math.sin(t * 9 + x) * 0.12 : 0.88) * e * fade;
      if (fade > 0.3) tick?.(t, dt);
      if (fade <= 0) {
        view.scene.remove(m);
        pool.push(m);
        zone.done = true;
      }
    },
  };
  view.zones.push(zone);
}
const _tp = new THREE.Vector3(), _tg = new THREE.Vector3();
const amp = (a) => a?.anim?.amp ?? 1;

/** KO'd in the jaws: the victim hangs from the killer's mouth while it thrashes, then pops (done()). */
export function thrashFx(view, a, killer, done) {
  const p = a.rig.root.position, H = Math.max(0.35, a.rig.height);
  a.plate.style.display = 'none';
  a.ring.visible = false;
  killer.rig.play('thrash', 0.42, 1, 1);
  audio.play('growl', { pitch: 1.4 / Math.sqrt(killer.u.size), vol: 0.4, gap: 0.2 });
  let t = 0;
  view.zones.push({
    done: false,
    update(dt) {
      t += dt;
      killer.rig.gripWorld(_tg);
      const k = Math.min(1, dt * 30);
      p.x += (_tg.x - p.x) * k;
      p.y += (Math.max(0, _tg.y - H * 0.62) - p.y) * k;
      p.z += (_tg.z + 0.06 - p.z) * k;
      a.rig.hold('grabbed');
      a.rig.update(dt);
      if (t >= 0.36) {
        this.done = true;
        done();
      }
    },
  });
}
/** DEVOURED: the victim is pulled into the grabber's mouth and shrinks away (then disposed). */
export function swallowFx(view, a) {
  const by = a.swallowBy;
  const p = a.rig.root.position, s0 = a.rig.inner.scale.x;
  a.plate.style.display = 'none';
  a.ring.visible = a.shadow.visible = false;
  let t = 0;
  view.zones.push({
    done: false,
    update(dt) {
      t += dt;
      const k = Math.min(1, t / 0.24);
      if (by?.rig?.root.parent) {
        by.rig.gripWorld(_tg);
        p.x += (_tg.x - p.x) * Math.min(1, dt * 18);
        p.y += (_tg.y - a.rig.height * 0.3 - p.y) * Math.min(1, dt * 18);
        p.z += (_tg.z - p.z) * Math.min(1, dt * 18);
      }
      a.rig.inner.scale.setScalar(Math.max(0.01, s0 * (1 - k * k)));
      a.rig.inner.rotation.x += dt * 9;
      if (k >= 1) {
        this.done = true;
        a.dispose();
      }
    },
  });
}

export function troopFx(view, ev) {
  switch (ev.type) {
    case 'roar': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      a.rig.play('roar', 1, 1, amp(a));
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
    case 'trail': {
      // FIRE TRAIL: a scorched, ember-cracked patch with a row of licking pixel flames on it
      const z = ev.z ?? 0, r = ev.r ?? 0.75;
      groundPatch(view, 'fire', ev.x, z, r, ev.dur, (t, dt) => {
        if (hpx.load > 0.6) return;
        const k = Math.min(1, t / 0.3) * (t > ev.dur - 0.6 ? Math.max(0.25, (ev.dur - t) / 0.6) : 1);
        if (Math.random() < dt * 11 * k) hpx.emit('solid', 'flame', { x: ev.x + rand(-r, r) * 0.85, y: 0.18, z: z + rand(-0.15, 0.45), vy: rand(0.4, 0.9), life: rand(0.35, 0.6), fps: 14, scale: rand(0.75, 1.15), color: Math.random() < 0.5 ? 0xff6a1a : 0xffa31a, fadeOut: 0.55 });
        if (Math.random() < dt * 3 * k) hpx.embers(_tp.set(ev.x + rand(-r, r) * 0.6, 0.3, z + 0.3), { count: 1, scale: 1 });
      });
      hpx.emit('solid', 'flame', { x: ev.x, y: 0.22, z: z + 0.3, vy: 0.8, life: 0.5, fps: 14, scale: 1.3, color: 0xff7a1a, fadeOut: 0.5 });
      break;
    }
    case 'puddle': {
      // WET FLOOR: a glossy blue puddle splashed down with drops, then glints and drips while it lasts
      const z = rand(0.2, 0.4), r = ev.r ?? 1; // a little in front of the lane so the troops don't hide it
      groundPatch(view, 'water', ev.x, z, r, ev.dur, (t, dt) => {
        if (hpx.load > 0.6) return;
        if (Math.random() < dt * 5) hpx.emit('glow', 'twinkle', { x: ev.x + rand(-r, r) * 0.8, y: 0.12, z: z + rand(0, 0.5), life: 0.4, scale: rand(0.9, 1.3), color: 0xdff6ff, fadeOut: 0.4 });
        if (Math.random() < dt * 5) hpx.emit('solid', 'drop', { x: ev.x + rand(-r, r) * 0.8, y: 0.1, z: z + rand(0, 0.5), vx: rand(-0.6, 0.6), vy: rand(1.6, 2.6), grav: -14, ground: 0.05, life: 0.35, scale: 1, color: 0x8fd8ff, fadeOut: 0.6 });
      });
      for (let i = 0; i < 7; i++) hpx.emit('solid', 'drop', { x: ev.x + rand(-0.3, 0.3), y: 0.15, z: z + 0.4, vx: rand(-3, 3), vy: rand(2, 4.5), grav: -16, ground: 0.05, life: rand(0.35, 0.55), scale: rand(0.9, 1.3), color: i % 3 ? 0x6cc4ff : 0xffffff, fadeOut: 0.7 });
      hpx.emit('solid', 'splat', { x: ev.x, y: 0.25, z: z + 0.45, life: 0.25, scale: 0.7, color: 0x8fd8ff, fadeOut: 0.6 });
      audio.play('slosh', { pitch: 1.3, vol: 0.5, gap: 0.2 });
      break;
    }
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
      const d = ev.unit.side === 0 ? 1 : -1;
      hpx.hit(V(ev.x, 0.6, z), 'punch', 1.4, d);
      hpx.hit(V(ev.x, 0.6, z), 'heavy', 0.8, d);
      hpx.clash(V(ev.x, 0, z), d, { scale: 1.5, color: view.dustColor });
      hpx.streaks(V(ev.x - d * 0.4, 0.6, z), d, { count: 3, h: 0.6 });
      audio.play('hitHeavy', { pitch: 0.9, gap: 0.08 });
      break;
    }
    case 'pounceCrouch': {
      // coiling to spring: the hind feet dig in
      const a = actorOf(view, ev.unit);
      if (!a) break;
      a.crouchT = 0;
      a.crouchDur = ev.dur;
      const p = a.rig.root.position, back = ev.unit.side === 0 ? -1 : 1, s = Math.min(1.8, ev.unit.size);
      hpx.dust(_tp.set(p.x + back * 0.25 * s, 0, p.z), { count: 1, scale: 0.5 * s, vx: back * 0.6, spread: 0.2, color: view.dustColor });
      if (ev.unit.size >= 0.95) audio.play('growl', { pitch: 1.5 / Math.sqrt(ev.unit.size), vol: 0.45, gap: 0.25 });
      break;
    }
    case 'leap': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position, d = ev.unit.side === 0 ? 1 : -1, s = Math.min(1.8, ev.unit.size);
      // push-off: dirt kicked back from the hind feet + a whoosh of speed lines
      hpx.dust(_tp.set(p.x - d * 0.3 * s, 0, p.z), { count: 3, scale: 0.75 * s, vx: -d * 2.6, spread: 0.6, color: view.dustColor });
      hpx.streaks(_tp.set(p.x, p.y + a.rig.height * 0.5, p.z), d, { count: 2, h: a.rig.height * 0.5, scale: 0.8 });
      a.rig.boing?.(0.25);
      audio.play('whoosh', { pitch: 1.5 / Math.sqrt(ev.unit.size), vol: 0.55, gap: 0.08 });
      break;
    }
    case 'leapLand': {
      const a = actorOf(view, ev.unit);
      if (!a) break;
      const p = a.rig.root.position;
      hpx.landPuff?.(V(p.x, 0, p.z), { scale: 0.8 * Math.min(1.8, ev.unit.size) });
      if (!ev.pounce) a.rig.play('land', 0.3);
      a.rig.boing?.(ev.pounce ? -0.2 : 0.4);
      break;
    }
    case 'pounceHit': {
      // landed ON the prey: a heavy hit flash, dust thrown out from under them both
      const a = actorOf(view, ev.unit), v = actorOf(view, ev.target);
      const d = ev.unit.side === 0 ? 1 : -1;
      const at = v ? v.rig.root.position : V(ev.x, 0, ev.unit.z ?? 0);
      const H = v ? Math.max(0.4, v.rig.height) : 0.6;
      hpx.hit(_tp.set(at.x, at.y + H * 0.5, at.z), 'heavy', 0.75 + Math.min(0.6, ev.unit.size * 0.25), d);
      hpx.dust(_tp.set(at.x - d * 0.1, 0, at.z), { count: 2, scale: 0.9 * Math.min(1.8, ev.unit.size), vx: d * 1.4, spread: 1.2, color: view.dustColor });
      hpx.clash(_tp.set(at.x, 0, at.z), d, { scale: 1.2, color: view.dustColor });
      if (a) callout(view, a, 'POUNCE!', 'big', 0.8);
      engine.shake(Math.min(0.22, 0.08 + ev.unit.size * 0.06));
      audio.play('hitHeavy', { pitch: 1.1 / Math.sqrt(ev.unit.size), vol: 0.8, gap: 0.06 });
      audio.play('growl', { pitch: 1.3 / Math.sqrt(ev.unit.size), vol: 0.5, gap: 0.2 });
      break;
    }
    case 'pin': {
      // knocked flat: the victim pancakes under the paws, pebbles skitter out
      const v = actorOf(view, ev.unit);
      if (!v) break;
      const p = v.rig.root.position;
      v.rig.boing?.(-0.45);
      hpx.chips(_tp.set(p.x, 0.1, p.z), { count: 3, colors: [0xd8c4a0, 0xb8a080], speed: 2.5, up: 0.8 });
      break;
    }
    case 'grab': {
      // GRAB: the grabber clamps on and lifts; the victim is carried (view.js hangs it from the grip point)
      const a = actorOf(view, ev.unit), v = actorOf(view, ev.victim);
      if (a) a.rig.play('grab', ev.hold / 0.9, 1, amp(a), ev.kind);
      if (v) { v.rig.flash?.(0.08); v.rig.boing?.(0.3); }
      if (a && ev.kind === 'roll') callout(view, a, 'DEATH ROLL!', 'crit', 1);
      audio.play('chomp', { pitch: 0.8 + 0.3 / Math.max(0.8, ev.unit.size), gap: 0.08 });
      break;
    }
    case 'grabSlam': {
      // thrown down: the victim smacks into the ground in front of the grabber
      const v = actorOf(view, ev.victim);
      const z = v ? v.rig.root.position.z : ev.unit.z ?? 0, d = ev.unit.side === 0 ? 1 : -1;
      if (v) { v.rig.boing?.(-0.6); v.dropT = 0.12; }
      hpx.hit(V(ev.x, 0.3, z), 'heavy', 1.1, d);
      hpx.dust(V(ev.x, 0, z), { count: 4, scale: 1.1, spread: 1.6, color: view.dustColor });
      hpx.chips(V(ev.x, 0.1, z), { count: 5, colors: [0xd8c4a0, 0xb8a080, 0x8a7a5a], speed: 3.5 });
      engine.shake(0.2);
      audio.play('thud', { pitch: 0.8, gap: 0.08 });
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
      if (ev.type === 'surface') {
        groundHit(V(ev.x, 0, z), { radius: 1.4, color: 0xff6a1f });
        audio.play('thud', { pitch: 1.1, gap: 0.1 });
        if (a) a.rig.play('surface', 0.6);
      }
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
      a.rig.play('roar', 0.8);
      callout(view, a, 'BOO!', 'big', 1);
      audio.play('laugh', { pitch: 0.7, vol: 0.5, gap: 1 });
      break;
    }
    case 'summon': {
      const a = actorOf(view, ev.unit);
      if (a) a.rig.boing?.(0.5);
      hpx.dust(V(ev.x, 0, ev.minion?.z ?? 0), { count: 3, scale: 0.8 });
      hpx.poof(V(ev.x, 0.45, ev.minion?.z ?? 0), { scale: 0.6, color: 0xd6cdea, spark: 0xffe27a });
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
      engine.shake(0.25);
      audio.play('explode', { pitch: 1.1, gap: 0.1 });
      break;
    case 'abduct': {
      const a = actorOf(view, ev.unit), s = actorOf(view, ev.src);
      if (s) s.rig.play('beam', ev.dur);
      if (a && s) voxelBeam(view.scene, midOf(s), a.rig.root.position.clone().setY(0.1), 0x7cff3a, ev.dur * 0.8, 0.28);
      if (a) callout(view, a, 'ABDUCTED!', 'heal');
      audio.play('magic', { pitch: 1.6, vol: 0.6, gap: 0.3 });
      break;
    }
    case 'pull': {
      const a = actorOf(view, ev.unit), s = actorOf(view, ev.src);
      if (s) s.rig.play('yank', 0.55);
      if (a) a.pulledT = 0.45; // dragged in kicking
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
      engine.shake(0.2);
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
      const a = actorOf(view, ev.unit), v = ev.victim ? view.actors.get(ev.victim.id) : null;
      if (v && a) v.swallowBy = a; // the death that follows plays the gulp instead of a KO poof
      const at = a ? a.rig.gripWorld(_tg) : V(ev.x, 0.7, 0);
      if (a) { a.rig.boing?.(0.5); callout(view, a, 'CHOMP!', 'big', 1); }
      hpx.chips(at, { count: 6, colors: [0x5a3220, 0x7d4a2d, 0xffd23f], speed: 3 });
      hpx.hit(at, 'bite', 1.2, ev.unit.side === 0 ? 1 : -1);
      audio.play('chomp', { pitch: 0.7, gap: 0.1 });
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
      hpx.splat(midOf(a), { color: 0x7cff3a, scale: 0.9 });
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
      if (a) a.rig.play('stomp', 0.7, 1, 1.2);
      hpx.boom(V(ev.x, 0.9, ev.unit.z ?? 0), { scale: 1.8, color: 0xff5a1a });
      groundImpact(V(ev.x, 0, ev.unit.z ?? 0), { radius: ev.r, colors: [0xff5a1a, 0xffa31a, 0x3a2a2a] });
      hpx.fire(V(ev.x, 0.2, ev.unit.z ?? 0), { count: 10, radius: ev.r * 0.6 });
      if (a) callout(view, a, 'ERUPTION!', 'big', 1.2);
      view.smashNear?.(ev.x, ev.r, ev.unit.side);
      engine.shake(0.3);
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
      const p = a.rig.root.position;
      for (let i = 0; i < 4; i++) hpx.emit('glow', i % 2 ? 'twinkle' : 'ember', { x: p.x + rand(-0.3, 0.3), y: p.y + rand(0.1, 0.6), z: p.z + 0.3, vy: rand(1, 1.8), life: rand(0.4, 0.7), scale: 1.2, color: i % 2 ? 0xd4ff9a : 0x5fdc4a, fadeOut: 0.5 });
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
