// Battle ENTRANCE set pieces (played by entranceCine.js). One director per entrance:
//
//   SETS[id](c) -> { T, T0r, at(t), ev, fx(t, dt), cam(t), pose, hold?, out?, warp?, cleanup? }
//     T        arrival length (s); the pose + hop follow (entranceCine.js)
//     T0r      where the rival's short version starts (skips the build-up)
//     at(t)    puts the props and the Commander where they are at time t (pure, so the
//              rival's cut and the dev scrub can start anywhere)
//     ev       one-shot beats [[t, fn]] (sounds, bursts, flashes)
//     fx       continuous 2D pixel particles (rate based)
//     cam(t)   the arrival's camera: { pos, look, key } (a new key = a hard cut)
//     pose     the signature pose sequence [[pose, seconds, mood]] (the rival plays the last)
//     hold(pose, t, dt)  per-frame extras during the pose (the falling mic)
//     out(k)   how the props leave during the hop (default: they poof away)
//
// c (from entranceCine.js): side, dir (+1 you, -1 rival), H (Commander height), ch, M (the
// mark), B (base), P (pixel sprites), X(u) / at(u, y, z) (u = metres towards the enemy),
// yaw(a) (0 = facing the camera, PI/2 = facing the enemy), add(obj), sfx, shake, flash,
// hitstop, shot(center, w, h, { yaw, pitch, sx, sy, zoom }), portrait(), E (rate emitter),
// zLane (a walking line clear of the base).
import * as THREE from 'three';
import { audio } from '../../core/audio.js';
import { Chibi, definePoses } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { Mats, makeMesh, VoxGrid } from '../../core/voxel.js';
import { defineSprite } from './pixfx.js';
import { makeBeaker, makeSodaRocket, makeBriefcase } from '../../models/props/abilities.js';
import { buildAccessory } from '../../models/characters/accessories.js';
import { pixelReticle, pixelBeam, voxCarpet, voxPost, voxRope, voxCracks } from '../../scenes/vialProps.js';
import { spotRig, lightShaft, aimShaft, paparazzi, helicopter, rope, limo, skateboard, cardBox, brickWall, paradeFloat, snareDrum, microphone } from './entranceProps.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const sm = (k) => k * k * (3 - 2 * k);
const outC = (k) => 1 - Math.pow(1 - k, 3);
const inQ = (k) => k * k;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const PI = Math.PI;
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Pixel sprites ('#' brightest .. 'o' darkest, tinted per particle)

defineSprite('entPuff', ['   .+#+.    ', ' .+###+.+.  ', '.+#####+##+.', '+##########+', '.+########+.', '  .-+##+-.  ']);
defineSprite('entChip', ['.##', '##+', '+-.']);
defineSprite('entConf', ['##', '#+', '+-']);
defineSprite('entStreamer', ['#.', '.#', '#.', '.#', '#.']);
defineSprite('entBar', ['########']);
defineSprite('entBlock', ['##', '#+']);
defineSprite('entNote', ['..##', '..#+', '..#.', '..#.', '+##.', '###.', '.#..']);
defineSprite('entFlash', ['   .   ', '   +   ', '  .#.  ', '.+###+.', '  .#.  ', '   +   ', '   .   ']);

// ---------------------------------------------------------------------------
// Entrance poses (same conventions as chibi.js POSES)

const hipL = (p) => { p.armLZ = -0.8; p.armLX = 0.1; p.elbowLZ = 1.9; p.elbowL = 0; p.hl = 'fist'; };
const hipR = (p) => { p.armRZ = 0.8; p.armRX = 0.1; p.elbowRZ = -1.9; p.elbowR = 0; p.hr = 'fist'; };
const walkLegs = (t, p, f = 11) => {
  const s = Math.sin(t * f), c = Math.cos(t * f);
  p.legLX = s * 0.7; p.legRX = -s * 0.7;
  p.kneeL = Math.max(0, -c) * 0.8; p.kneeR = Math.max(0, c) * 0.8;
  p.y = Math.abs(c) * 0.05;
  return s;
};
definePoses({
  entStrutWalk(t, p) {
    const s = walkLegs(t, p, 10);
    p.armLX = -s * 0.75; p.armRX = s * 0.75;
    p.elbowL = p.elbowR = -0.45;
    p.hl = p.hr = 'fist';
    p.torsoRY = s * 0.2; p.torsoRX = -0.08;
    p.headRZ = s * 0.09; p.headRX = -0.1;
    p.hipsRZ = s * 0.05;
  },
  entWalkWave(t, p) {
    const s = walkLegs(t, p, 10);
    p.armLX = -s * 0.5; p.elbowL = -0.4;
    p.armRZ = 2.3; p.armRX = -0.15; p.elbowRZ = Math.sin(t * 10) * 0.45;
    p.torsoRY = s * 0.12; p.headRZ = 0.08;
  },
  entTuck(t, p) {
    p.kneeL = p.kneeR = 1.35; p.legLX = p.legRX = -0.85;
    p.armLZ = -1.9; p.armRZ = 1.9; p.armLX = p.armRX = -0.3;
    p.elbowL = p.elbowR = -0.35; p.hl = p.hr = 'fist';
    p.headRX = -0.15; p.y = 0.04;
  },
  entFall(t, p) {
    p.armLZ = -0.45; p.armRZ = 0.45; p.armLX = p.armRX = 0.15;
    p.hl = p.hr = 'fist';
    p.legLX = 0.05; p.legRX = -0.05;
    p.headRX = 0.2; p.sy = 1.05; p.sx = 0.97;
  },
  entHeroLand(t, p) {
    p.y = -0.4;
    p.legLX = -1.35; p.kneeL = 1.45;
    p.legRX = 0.55; p.kneeR = 1.95;
    p.torsoRX = 0.5; p.headRX = -0.45;
    p.armRX = -0.55; p.armRZ = 0.25; p.elbowR = 0; p.hr = 'fist';
    p.armLZ = -1.15; p.armLX = 0.75; p.elbowL = -0.25; p.hl = 'open';
    p.sy = 1 + Math.sin(t * 3) * 0.01;
  },
  entPowerStance(t, p) {
    hipL(p); hipR(p);
    p.legLZ = -0.1; p.legRZ = 0.1;
    p.torsoRX = -0.08; p.headRX = -0.1; p.headRY = Math.sin(t * 1.2) * 0.08;
    p.sy = 1.03 + Math.sin(t * 2.2) * 0.012;
  },
  entFingerGuns(t, p) {
    const k = (ph) => { const c = (t * 1.6 + ph) % 1; return c < 0.12 ? c / 0.12 : Math.max(0, 1 - (c - 0.12) / 0.3); };
    p.armLX = -1.4 - k(0) * 0.4; p.armRX = -1.4 - k(0.5) * 0.4;
    p.armLZ = 0.16; p.armRZ = -0.16;
    p.elbowL = p.elbowR = -0.12;
    p.hl = p.hr = 'point';
    p.torsoRX = -0.06; p.torsoRY = Math.sin(t * 3) * 0.08;
    p.headRZ = 0.1; p.y = Math.abs(Math.sin(t * 3.2)) * 0.02;
  },
  entMicDrop(t, p) {
    hipL(p);
    p.armRZ = 1.45; p.armRX = -0.3; p.elbowR = -0.1; p.hr = 'open';
    p.headRY = -0.25; p.headRX = -0.12; p.torsoRX = -0.05;
  },
  entShades(t, p) {
    hipL(p);
    p.armRX = -1.25; p.armRZ = 0.62; p.elbowR = -1.95; p.hr = 'point';
    p.headRX = 0.06; p.headRZ = 0.06;
  },
  entCough(t, p) {
    const s = Math.abs(Math.sin(t * 9));
    p.torsoRX = 0.26 + s * 0.08; p.headRX = 0.16;
    p.armRX = -1.2; p.armRZ = 0.35; p.elbowR = -2.0; p.hr = 'fist';
    p.armLZ = -0.9 + Math.sin(t * 11) * 0.35; p.armLX = -0.7; p.elbowL = -0.6; p.hl = 'open';
    p.sy = 0.97; p.kneeL = p.kneeR = 0.12;
  },
  entDustOff(t, p) {
    const s = Math.sin(t * 14);
    p.armLX = p.armRX = -0.85;
    p.armLZ = 0.45 + s * 0.14; p.armRZ = -(0.45 - s * 0.14);
    p.elbowL = p.elbowR = -0.95;
    p.headRY = -0.22; p.headRX = -0.1; p.torsoRX = -0.04;
  },
  entShush(t, p) {
    p.armRX = -1.28; p.armRZ = 0.32; p.elbowR = -2.15; p.hr = 'point';
    p.armLX = -0.2; p.armLZ = -0.15; p.elbowL = -0.3;
    p.torsoRX = 0.1; p.headRX = 0.05;
    p.kneeL = p.kneeR = 0.18; p.y = -0.03;
    p.headRY = Math.sin(t * 2.5) * 0.25; p.lookX = Math.sin(t * 2.5) * 1.3; p.lookOn = 1;
  },
  entRiding(t, p) {
    p.kneeL = p.kneeR = 0.45; p.legLX = p.legRX = -0.25; p.y = -0.06;
    p.armLZ = -1.15; p.armRZ = 1.0; p.armLX = 0.15; p.armRX = -0.2;
    p.elbowL = p.elbowR = -0.3;
    p.torsoRX = 0.14; p.headRX = -0.12; p.torsoRZ = Math.sin(t * 3) * 0.05;
  },
  entOllie(t, p) {
    p.kneeL = p.kneeR = 1.45; p.legLX = p.legRX = -0.95; p.y = 0.08;
    p.armLZ = -1.7; p.armRZ = 1.7; p.hl = p.hr = 'fist';
    p.torsoRX = 0.15; p.headRX = 0.1;
  },
  entRope(t, p) {
    p.armLX = p.armRX = -2.95; p.armLZ = 0.14; p.armRZ = -0.14;
    p.elbowL = p.elbowR = -0.15; p.hl = p.hr = 'fist';
    p.legLX = -0.18; p.legRX = 0.12; p.kneeL = 0.3; p.kneeR = 0.12;
    p.headRX = -0.12; p.sy = 1.04;
  },
  entHover(t, p) {
    p.armLX = p.armRX = 0.75; p.armLZ = -0.35; p.armRZ = 0.35;
    p.elbowL = p.elbowR = -0.1; p.hl = p.hr = 'fist';
    p.legLX = p.legRX = 0.3;
    p.kneeL = 0.4 + Math.sin(t * 6) * 0.12; p.kneeR = 0.5 - Math.sin(t * 6) * 0.12;
    p.headRX = -0.2;
  },
  entDrum(t, p) {
    walkLegs(t, p, 9);
    const s = Math.sin(t * 14);
    p.armLX = -0.85 - Math.max(0, s) * 0.45; p.armRX = -0.85 - Math.max(0, -s) * 0.45;
    p.armLZ = 0.2; p.armRZ = -0.2;
    p.elbowL = p.elbowR = -0.95; p.hl = p.hr = 'fist';
    p.headRX = -0.05;
  },
});

// ---------------------------------------------------------------------------
// Shared helpers

const steps = (c, key, dt, every = 0.27) => {
  if (!c.E(key, 1 / every, dt)) return;
  const p = c.ch.root.position;
  for (let i = 0; i < 2; i++) c.P.spawn({ tex: 'entPuff', additive: false, x: p.x + rand(-0.15, 0.15), y: 0.08, z: p.z + rand(-0.1, 0.1), vx: rand(-0.5, 0.5) - c.dir * 0.3, vy: rand(0.2, 0.5), drag: 3, size: c.H * 0.13, size1: c.H * 0.03, color: [0xe8e2d4, 0xd0c8b8], glow: 1, life: 0.45 });
};
const puffs = (c, at, n, o = {}) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, PI * 2), r = rand(0, o.r ?? 0.6);
    c.P.spawn({ tex: 'entPuff', additive: false, x: at.x + Math.cos(a) * r, y: (at.y ?? 0) + rand(0.05, o.up ?? 0.4), z: at.z + Math.sin(a) * r * 0.6, vx: Math.cos(a) * rand(0.4, o.sp ?? 2), vy: rand(0.2, o.rise ?? 1), vz: Math.sin(a) * rand(0.2, (o.sp ?? 2) * 0.5), drag: o.drag ?? 2.2, size: (o.size ?? 0.5) * 0.55 * rand(0.7, 1.3), size1: (o.size ?? 0.5) * 0.15, color: o.color ?? [0xf0ece4, 0xd8d0c4, 0xc0b8ac], glow: 1, life: (o.life ?? 0.8) * rand(0.7, 1.2) });
  }
};
const sparks = (c, at, n, colors, o = {}) => c.P.burst(at, { tex: o.tex ?? 'star4', count: n, speed: o.speed ?? 4, size: o.size ?? c.H * 0.14, color: colors, glow: o.glow ?? 2.2, life: o.life ?? 0.5, grav: o.grav ?? 3, radius: o.radius ?? 0.2, up: o.up ?? 0.2 });
const chips = (c, at, n, colors, o = {}) => {
  for (let i = 0; i < n; i++) {
    const a = rand(0, PI * 2), sp = rand(1.5, o.speed ?? 5);
    c.P.spawn({ tex: 'entChip', additive: false, x: at.x, y: (at.y ?? 0) + 0.05, z: at.z, vx: Math.cos(a) * sp * (o.fx ?? 1), vy: rand(2, o.up ?? 5), vz: Math.sin(a) * sp * 0.6 + (o.vz ?? 0), grav: 14, ground: 0.03, drag: 0.4, size: rand(0.08, 0.16) * (o.scale ?? 1), size1: 0.06, color: colors, glow: 1, life: rand(0.6, 1.1), rot: rand(0, PI), spin: rand(-12, 12) });
  }
};
/** Hide / show a prop. */
const vis = (o, on) => { if (o && o.visible !== on) o.visible = on; };
/** Place + face the Commander (yaw local: 0 = camera, PI/2 = towards the enemy). */
const put = (c, u, y, z, yawL) => {
  c.ch.root.position.set(c.X(u), y, z);
  if (yawL !== undefined) c.ch.root.rotation.y = c.yaw(yawL);
};
const W = (c, w) => (c.portrait() ? w * 0.48 : w);
/** Low tracking shot alongside the Commander. */
const track = (c, key, o = {}) => {
  const p = c.ch.root.position;
  return { key, ...c.shot(V(p.x + c.dir * (o.lead ?? 0.45), p.y + c.H * (o.ly ?? 0.55), p.z), W(c, o.w ?? c.H * 3.6), o.h ?? c.H * 2.3, { yaw: o.yaw ?? 0.32, pitch: o.pitch ?? 0.02, minY: 0.22 }) };
};
/** Establishing shot: the base and the mark. */
const est = (c, key, t, o = {}) => ({ key, ...c.shot(c.at(o.u ?? -1.6, o.y ?? 1.25, o.z ?? 1.0), W(c, o.w ?? 9), o.h ?? 4.6, { yaw: o.yaw ?? -0.12, pitch: o.pitch ?? 0.15, zoom: lerp(1.07, 1, outC(clamp01(t / (o.dur ?? 1)))), sy: o.sy ?? 0.5 }) });
/** The rotor-chop / engine thrum of a helicopter (procedural, short bursts). */
const chop = (vol) => {
  if (!audio.ctx || audio.muted) return;
  try {
    audio.noise({ dur: 0.05, vol: 0.1 * vol, type: 'lowpass', f0: 520, f1: 140, attack: 0.003 });
    audio.thump(72, 40, 0.06, 0.12 * vol);
  } catch (e) { /* optional */ }
};
/** A voxel accessory (shades / jetpack) stuck onto a Chibi joint; returns the mesh. */
const wear = (ch, type, slot, joint) => {
  const g = new VoxGrid(), m = new VoxGrid();
  buildAccessory({ type }, slot, g, m, ch.def);
  const grp = new THREE.Group();
  if (g.size) grp.add(makeMesh(g.build({ scale: 0.05, pivot: [0, 0, 0], jitter: 0.02 }), Mats.pair));
  if (m.size) grp.add(makeMesh(m.build({ scale: 0.05, pivot: [0, 0, 0], jitter: 0.02 }), Mats.toyGlossPair));
  joint.add(grp);
  return grp;
};
const unwear = (grp) => {
  if (!grp) return;
  grp.parent?.remove(grp);
  grp.traverse((o) => o.geometry?.dispose());
};
/** A camera-flash burst at a point (paparazzi). */
const camFlash = (c, p, big = false) => {
  c.P.spawn({ tex: 'entFlash', x: p.x, y: p.y, z: p.z + 0.05, size: big ? 0.9 : 0.55, size1: 0.1, color: 0xffffff, glow: 2.6, life: 0.16 });
  c.P.spawn({ tex: 'plus', x: p.x, y: p.y, z: p.z + 0.06, size: 0.22, size1: 0.05, color: 0xfff2c8, glow: 2.4, life: 0.24 });
};

// ---------------------------------------------------------------------------

export const SETS = {
  // ============================================================ CLASSIC STRUT
  strut(c) {
    const rigs = [-1.45, 1.9].map((du) => {
      const r = c.add(spotRig());
      r.position.copy(c.at(du, 0, c.M.z - 1.5));
      return r;
    });
    const shafts = rigs.map(() => c.add(lightShaft(0xfff0c8, 0.6)));
    const on = [0.2, 0.5];
    const lens = (r) => r.userData.head.localToWorld(_v.copy(r.userData.lens));
    const aim = (r, tgt) => {
      r.lookAt(tgt.x, 0, tgt.z);
      r.rotateY(-PI / 2); // the can points along +x
      r.userData.head.rotation.z = -0.55;
      r.updateMatrixWorld(true);
    };
    const u0 = -3.7, t0 = 0.9, t1 = 2.45;
    return {
      T: 2.75, T0r: 1.55,
      at(t) {
        const k = seg(t, t0, t1);
        const u = lerp(u0, 0, k);
        const z = lerp(c.zLane, c.M.z, sm(seg(k, 0.35, 1)));
        vis(c.ch.root, t >= t0);
        put(c, u, 0, z, k < 1 ? PI / 2 : PI / 2 - seg(t, t1, t1 + 0.2) * 0.8);
        c.ch.speed = 1.45;
        c.ch.play(k > 0 && k < 1 ? 'entStrutWalk' : 'idle');
        const tgt = c.at(lerp(-0.6, 0, k), 0, lerp(c.M.z + 0.1, c.M.z, k));
        rigs.forEach((r, i) => {
          aim(r, tgt);
          const lit = t >= on[i];
          vis(shafts[i], lit);
          if (lit) aimShaft(shafts[i], lens(r), tgt, 1.9, c.cam);
          shafts[i].material.opacity = lit ? 0.5 + Math.sin(t * 23 + i) * 0.04 : 0;
        });
      },
      ev: [
        [on[0], () => { c.sfx('latch', { pitch: 0.7 }); c.sfx('thud', { pitch: 0.6, vol: 0.6 }); }],
        [on[1], () => { c.sfx('latch', { pitch: 0.6 }); c.sfx('thud', { pitch: 0.5, vol: 0.7 }); }],
        [t0, () => { c.sfx('drum', { pitch: 0.9 }); c.ch.mood('confident', 2); }],
      ],
      fx(t, dt) {
        if (t > t0 && t < t1) steps(c, 'st', dt, 0.24);
        // dust motes drifting in the beams
        for (let i = 0; i < 2; i++) {
          if (t < on[i] || !c.E('mote' + i, 7, dt)) continue;
          const l = lens(rigs[i]);
          c.P.spawn({ tex: 'plus', x: lerp(l.x, c.X(0), rand(0.2, 0.9)), y: rand(0.3, 1.8), z: lerp(l.z, c.M.z, rand(0.3, 1)), vy: rand(-0.1, 0.2), vx: rand(-0.1, 0.1), size: 0.06, size1: 0.03, color: 0xfff2c8, glow: 1.8, life: 1.1, flicker: 0.2 });
        }
      },
      cam(t) {
        if (t < t0) return est(c, 'est', t, { dur: t0, u: -0.4, w: 7.5, h: 4.0, z: 0.8 });
        return track(c, 'track', { yaw: 0.3, lead: 0.25, w: c.H * 4.4, h: c.H * 2.6 });
      },
      pose: [['point', 0.75, 'confident'], ['crossArms', 1.15, 'smug']],
    };
  },

  // ============================================================ CARDBOARD BOX SNEAK
  boxSneak(c) {
    const box = c.add(cardBox());
    const eyes = box.userData.eyes;
    // stop-and-go shuffles: [t0, t1, u0, u1]
    const legs = [[0.3, 0.85, -3.4, -2.2], [1.35, 1.85, -2.2, -1.0], [2.15, 2.4, -1.0, 0]];
    const tUp = 2.5;
    const boxAt = (t) => {
      let u = legs[0][2], moving = false;
      for (const [a, b, u0, u1] of legs) { if (t >= a) u = lerp(u0, u1, sm(seg(t, a, b))); if (t > a && t < b) moving = true; }
      return { u, moving };
    };
    return {
      T: 3.05, T0r: 1.75,
      at(t) {
        const { u, moving } = boxAt(t);
        const z = lerp(c.zLane, c.M.z, sm(seg(u, -3.4, -1.2)));
        const lift = seg(t, tUp, tUp + 0.45);
        box.position.set(c.X(u - lift * 0.8), (moving ? Math.abs(Math.sin(t * 20)) * 0.035 : 0) + Math.sin(lift * PI * 0.9) * 2.4 + lift * 0.4, z - lift * 1.2);
        box.rotation.set(-lift * 1.2, c.yaw(lift * 2.4), moving ? Math.sin(t * 20) * 0.04 : 0);
        vis(box, lift < 0.98);
        // peeking eyes in the handle slot while it holds still
        const peek = !moving && t < tUp;
        vis(eyes, peek && (t * 3) % 1 > 0.08);
        eyes.position.x = Math.sin(t * 2.2) * 0.07;
        vis(c.ch.root, t >= tUp);
        put(c, 0, 0, c.M.z, 0.25);
        c.ch.speed = 1;
        c.ch.play(t >= tUp && t < tUp + 0.3 ? 'entShush' : 'idle');
      },
      ev: [
        [0.3, () => c.sfx('squeak', { pitch: 1.2, vol: 0.5 })],
        [0.92, () => c.sfx('crickets', { vol: 0.6 })],
        [1.35, () => c.sfx('squeak', { pitch: 1.0, vol: 0.5 })],
        [2.15, () => c.sfx('squeak', { pitch: 1.4, vol: 0.5 })],
        [tUp, () => {
          c.sfx('pop'); c.sfx('slideWhistle', { pitch: 1.2, vol: 0.6 });
          c.ch.boing(0.6); c.ch.mood('tease', 2);
          puffs(c, c.at(0, 0.1, c.M.z), 8, { r: 0.5, size: 0.4 });
          sparks(c, c.at(0, c.H * 0.6, c.M.z), 12, [0xffffff, 0xffd23f], { speed: 3 });
        }],
      ],
      fx(t, dt) {
        const { moving } = boxAt(t);
        if (moving && t < tUp) steps(c, 'bx', dt, 0.16);
      },
      cam(t) {
        if (t < 0.95) return est(c, 'est', t, { u: -1.4, w: 7, h: 3.6, dur: 0.95 });
        if (t < 1.95) {
          // insert: the box holds very still
          const p = box.position;
          return { key: 'box', ...c.shot(V(p.x, 0.5, p.z), W(c, 2.4), 1.5, { yaw: 0.12, pitch: 0.02, minY: 0.2, zoom: lerp(1.05, 0.95, seg(t, 0.95, 1.95)) }) };
        }
        return { key: 'reveal', ...c.shot(c.at(-0.2, c.H * 0.7, c.M.z), W(c, 4.2), 3.0, { yaw: 0.28, pitch: 0.04 }) };
      },
      pose: [['entShush', 0.95, 'tease'], ['shrug', 0.95, 'smug']],
    };
  },

  // ============================================================ SUPERHERO LANDING
  heroLanding(c) {
    const ret = c.add(pixelReticle(1.5, 0xff3a5a));
    ret.userData.disposeMat = true;
    ret.position.copy(c.at(0, 0.03, c.M.z));
    const cracks = c.add(voxCracks(2));
    cracks.scale.setScalar(1.7);
    cracks.position.copy(c.at(0, 0.004, c.M.z));
    const tF = 0.55, tI = 1.15, Y0 = 11;
    return {
      T: 2.05, T0r: 0.62,
      warp: (t) => (t > tI - 0.18 && t < tI ? 0.4 : 1),
      at(t) {
        const k = seg(t, tF, tI);
        vis(c.ch.root, t >= tF);
        put(c, 0, t < tI ? Y0 * (1 - inQ(k)) : 0, c.M.z, 0.3);
        c.ch.play(t < tI ? 'entFall' : 'entHeroLand');
        vis(ret, t < tI);
        ret.material.opacity = (Math.floor(t * 8) % 2 ? 0.95 : 0.45) * seg(t, 0, 0.2);
        ret.scale.setScalar(1.3 - k * 0.3);
        ret.rotation.y = (1 - k) * 0.8;
        vis(cracks, t >= tI);
      },
      ev: [
        [0.08, () => c.sfx('alarm', { pitch: 1.3, vol: 0.35 })],
        [tF, () => { c.sfx('whoosh', { pitch: 0.45 }); c.sfx('slideWhistle', { pitch: 0.7, vol: 0.4 }); c.ch.mood('determined', 2); }],
        [tI, () => {
          c.hitstop(0.12); c.shake(0.95); c.flash('#ffffff', 0.75);
          c.sfx('boom', { pitch: 0.8 }); c.sfx('thud', { pitch: 0.6 }); c.sfx('crunch', { pitch: 0.7 });
          c.ch.boing(-0.5);
          const at = c.at(0, 0, c.M.z);
          chips(c, at, 22, [0x6f7788, 0x8a6a4a, 0x9aa2b4, 0x3d4352]);
          puffs(c, at, 12, { r: 0.9, sp: 3.4, rise: 0.5, size: 0.42, life: 0.8 });
          sparks(c, _v.copy(at).setY(0.3), 14, [0xffffff, 0xffd23f, 0xff3a5a], { speed: 5 });
        }],
      ],
      fx(t, dt) {
        if (t > tF && t < tI && c.E('fall', 40, dt)) {
          const p = c.ch.root.position;
          c.P.spawn({ tex: 'entBar', x: p.x + rand(-0.3, 0.3), y: p.y + c.H * rand(0.6, 1.4), z: p.z, vy: 6, size: 0.35, size1: 0.1, color: [0xffffff, 0xffd23f], glow: 1.8, life: 0.18, rot: PI / 2 });
        }
        if (t > tI && t < tI + 0.8 && c.E('settle', 8, dt)) puffs(c, c.at(rand(-0.8, 0.8), 0, c.M.z + rand(-0.3, 0.3)), 1, { r: 0.1, sp: 0.4, size: 0.4, rise: 0.3 });
      },
      cam(t) {
        if (t < tF) return est(c, 'est', t, { u: -0.6, w: 6.5, h: 3.6, pitch: 0.32, dur: tF });
        if (t < tI) {
          const p = c.ch.root.position;
          const s = c.shot(c.at(0, 1.5, c.M.z), W(c, 4.6), 3.6, { yaw: 0.35, pitch: -0.16, minY: 0.3 });
          s.look.lerp(_w.set(p.x, Math.min(p.y + c.H * 0.5, 3.4), p.z), 0.35);
          return { key: 'fall', ...s };
        }
        return { key: 'land', ...c.shot(c.at(0, c.H * 0.45, c.M.z), W(c, c.H * 3.4), c.H * 2.5, { yaw: 0.5, pitch: 0.02, minY: 0.2, zoom: lerp(0.88, 1, outC(seg(t, tI, tI + 0.5))) }) };
      },
      pose: [['entHeroLand', 0.5, 'focus'], ['entPowerStance', 1.3, 'proud']],
    };
  },

  // ============================================================ SKATEBOARD KICKFLIP
  skateKickflip(c) {
    const board = c.add(skateboard());
    const top = board.userData.top;
    const tA = 1.85, tL = 2.35;
    const uAt = (t) => (t < tA ? lerp(-7.2, -0.9, 1 - Math.pow(1 - seg(t, 0, tA), 1.4)) : t < tL ? lerp(-0.9, 0, seg(t, tA, tL)) : lerp(0, 0.25, outC(seg(t, tL, tL + 0.35))));
    return {
      T: 2.75, T0r: 1.3,
      warp: (t) => (t > tA + 0.08 && t < tL - 0.05 ? 0.42 : 1),
      at(t) {
        const u = uAt(t);
        const z = lerp(c.zLane, c.M.z, sm(seg(t, 0.5, tA)));
        const k = seg(t, tA, tL);
        const air = Math.sin(k * PI);
        board.position.set(c.X(u), air * 0.42, z);
        board.rotation.set(k > 0 && k < 1 ? k * PI * 2 : 0, c.dir > 0 ? 0 : PI, 0);
        put(c, u, top + air * 0.62, z, PI / 2);
        c.ch.play(k > 0.05 && k < 0.95 ? 'entOllie' : 'entRiding');
      },
      ev: [
        [0.05, () => { c.sfx('whoosh', { pitch: 0.6 }); c.ch.mood('confident', 3); }],
        [tA, () => { c.sfx('kick', { pitch: 1.3 }); c.sfx('whoosh', { pitch: 1.2 }); }],
        [tL, () => {
          c.sfx('thud', { pitch: 1.6 }); c.sfx('scratch', { pitch: 1.1, vol: 0.5 }); c.shake(0.3);
          c.ch.boing(-0.35);
          sparks(c, c.at(0, 0.05, c.M.z), 12, [0xffd23f, 0xffffff, 0xff8a2a], { speed: 3.5, grav: 6 });
        }],
      ],
      fx(t, dt) {
        if (t < tA && c.E('roll', 9, dt)) {
          const p = board.position;
          c.P.spawn({ tex: 'entPuff', additive: false, x: p.x - c.dir * 0.4, y: 0.06, z: p.z, vx: -c.dir * 1.2, vy: 0.3, drag: 3, size: 0.18, size1: 0.04, color: [0xe8e2d4, 0xd0c8b8], glow: 1, life: 0.4 });
        }
        if (t < tA && c.E('rollsfx', 5, dt)) c.sfx('tick', { pitch: 0.7, vol: 0.25, gap: 0.05 });
      },
      cam(t) {
        if (t < 0.75) {
          // a static low camera the rider whooshes into
          return { key: 'pass', ...c.shot(c.at(-3.6, 0.55, c.zLane), W(c, 5.5), 2.6, { yaw: 0.3, pitch: 0.04, minY: 0.2 }) };
        }
        if (t < tA) return track(c, 'track', { yaw: 0.55, lead: 0.9, w: c.H * 4, h: c.H * 2.2 });
        return { key: 'flip', ...c.shot(c.at(0, 0.7, c.M.z), W(c, c.H * 3.4), c.H * 2.4, { yaw: 0.52, pitch: -0.1, minY: 0.18 }) };
      },
      out(k) {
        board.position.x += c.dir * 0.12;
        board.scale.setScalar(Math.max(0.001, 1 - seg(k, 0.6, 1)));
        return true;
      },
      pose: [['entFingerGuns', 1.0, 'confident'], ['thumbsUp', 0.9, 'happy']],
    };
  },

  // ============================================================ LAB EXPLOSION
  labExplosion(c) {
    const bk = c.add(makeBeaker(0x7cff3a));
    const S = 5.4;
    bk.position.copy(c.at(0, 0, c.M.z - 0.1));
    const tB = 1.3, tOut = 1.55, tStop = 2.35;
    return {
      T: 2.6, T0r: 1.15,
      at(t) {
        const k = seg(t, 0, tB);
        vis(bk, t < tB);
        const j = k * k;
        bk.position.copy(c.at(Math.sin(t * 61) * 0.03 * j, 0, c.M.z - 0.1 + Math.sin(t * 47) * 0.02 * j));
        bk.scale.set(S + Math.sin(t * 30) * 0.25 * j, S + j * 0.9, S + Math.sin(t * 30) * 0.25 * j);
        vis(c.ch.root, t >= tB + 0.12);
        const kw = seg(t, tOut, tStop);
        put(c, lerp(-0.85, 0, kw), 0, c.M.z, kw > 0 && kw < 1 ? PI / 2 : 0.3);
        c.ch.speed = 0.85;
        c.ch.play(kw > 0 && kw < 1 ? 'walk' : 'idle');
      },
      ev: [
        [0.05, () => c.sfx('fizz')],
        [0.6, () => c.sfx('heartbeat', { pitch: 1.2, vol: 0.6 })],
        [tB, () => {
          c.hitstop(0.1); c.shake(0.95); c.flash('#9dff6a', 0.8);
          c.sfx('explode'); c.sfx('boom', { pitch: 0.9 }); c.sfx('shatter', { pitch: 1.1, vol: 0.6 });
          const at = c.at(0, 0.9, c.M.z);
          puffs(c, _v.copy(at).setY(0.2), 16, { r: 1.1, sp: 2.6, rise: 1.4, size: 0.6, life: 1.2, color: [0x5aa848, 0x3a7a34, 0x8ad86a] });
          c.P.burst(at, { tex: 'drop', count: 22, speed: 6, size: 0.18, color: [0x7cff3a, 0x9dff6a, 0xeaffd0], glow: 2, life: 0.8, grav: 9, up: 0.4 });
          c.P.burst(at, { tex: 'diamond', count: 18, speed: 7, size: 0.16, color: [0xffffff, 0xbfe9ff], glow: 2.2, life: 0.7, grav: 10 });
        }],
        [tB + 0.12, () => { c.ch.mood('dizzy', 3); c.ch.emote('star', 1.6); }],
        [tOut + 0.3, () => c.sfx('oof', { pitch: 1.2, vol: 0.5 })],
      ],
      fx(t, dt) {
        if (t < tB && c.E('bub', 6 + t * 14, dt)) {
          c.P.spawn({ tex: 'drop', x: c.X(rand(-0.3, 0.3)), y: S * 0.32 + rand(0, 0.3), z: c.M.z - 0.1 + rand(-0.2, 0.2), vy: rand(1, 2.4), size: 0.13, size1: 0.04, color: [0x9dff6a, 0xeaffd0], glow: 2, life: 0.6, rot: PI });
          if (Math.random() < 0.4) c.sfx('bubble', { pitch: 0.7 + t * 0.6, vol: 0.4, gap: 0.05 });
        }
        if (t > tB && c.E('smoke', t < tStop ? 7 : 2.5, dt)) {
          puffs(c, c.at(rand(-1.1, 0.9), 0, c.M.z + rand(-0.6, 0.2)), 1, { r: 0.2, sp: 0.4, rise: 0.5, size: 0.5, life: 1.1, color: [0x5aa848, 0x3a7a34, 0x8ad86a] });
        }
      },
      cam(t) {
        if (t < tB) return { key: 'beaker', ...c.shot(c.at(0, 1.25, c.M.z), W(c, lerp(6.5, 4.2, sm(seg(t, 0, tB)))), lerp(3.6, 3.0, seg(t, 0, tB)), { yaw: -0.08, pitch: 0.06 }) };
        return { key: 'smoke', ...c.shot(c.at(-0.3, c.H * 0.6, c.M.z), W(c, 4), 2.7, { yaw: 0.28, pitch: 0.0, minY: 0.22 }) };
      },
      pose: [['entCough', 0.85, 'dizzy'], ['thumbsUp', 1.0, 'embarrassed']],
    };
  },

  // ============================================================ GLITCH TELEPORT
  glitchTeleport(c) {
    const beam = c.add(pixelBeam(0.5, 5.2, 0x3ff2e0));
    beam.userData.disposeMat = true;
    beam.position.copy(c.at(0, 0, c.M.z));
    const mat = beam.userData.mat;
    const tA = 0.5, tB = 1.6;
    let jit = 0;
    return {
      T: 2.25, T0r: 0.95,
      at(t) {
        mat.opacity = t < tA ? 0.65 * seg(t, 0.15, tA) : t < tB ? 0.45 + Math.random() * 0.4 : 0.7 * (1 - seg(t, tB, tB + 0.45));
        vis(beam, t < tB + 0.45);
        const k = seg(t, tA, tB);
        const on = t >= tB || (t >= tA && Math.random() < 0.3 + k * 0.6);
        vis(c.ch.root, on);
        jit = t >= tA && t < tB && Math.random() < 0.35 ? rand(-0.35, 0.35) * (1 - k) : 0;
        put(c, jit, 0, c.M.z, 0.3);
        const s = c.ch.root.scale.y;
        c.ch.root.scale.x = t >= tA && t < tB ? s * (1 + rand(-0.35, 0.35) * (1 - k)) : s;
        c.ch.play('idle');
      },
      ev: [
        [0.15, () => { c.sfx('zap'); c.sfx('laser', { pitch: 0.6 }); }],
        [tA, () => c.ch.mood('focus', 2)],
        [tB, () => {
          c.sfx('bigPop'); c.sfx('zap', { pitch: 1.4 }); c.flash('#3ff2e0', 0.4); c.shake(0.3);
          c.ch.boing(0.7); c.ch.mood('cool', 2);
          sparks(c, c.at(0, c.H * 0.5, c.M.z), 26, [0x3ff2e0, 0xffffff, 0xff2e88], { speed: 4.5, grav: 0, radius: 0.4 });
        }],
      ],
      fx(t, dt) {
        beam.userData.update(dt);
        if (t > tA - 0.1 && t < tB + 0.1 && c.E('gl', 30, dt)) {
          const p = c.at(rand(-0.6, 0.6), rand(0.1, c.H * 1.3), c.M.z + rand(-0.2, 0.3));
          c.P.spawn({ tex: Math.random() < 0.6 ? 'entBar' : 'entBlock', x: p.x, y: p.y, z: p.z, vx: rand(-2, 2), size: rand(0.1, 0.32), size1: 0.05, color: [0x3ff2e0, 0xff2e88, 0xffffff], glow: 1.3, life: 0.14 });
          if (Math.random() < 0.25) c.sfx('blip', { pitch: rand(0.6, 1.8), vol: 0.35, gap: 0.03 });
        }
      },
      cam(t) {
        if (t < 0.62) return est(c, 'est', t, { u: -0.5, w: 6.5, h: 4.4, dur: 0.62, y: 1.6 });
        return { key: 'med', ...c.shot(c.at(0, c.H * 0.62, c.M.z), W(c, 3.6), lerp(2.9, 2.5, seg(t, 0.62, 2.25)), { yaw: 0.2, pitch: 0.05 }) };
      },
      pose: [['entFingerGuns', 0.95, 'cool'], ['peace', 0.95, 'confident']],
    };
  },

  // ============================================================ ROCKET DROP
  rocketDrop(c) {
    const rk = c.add(makeSodaRocket());
    rk.scale.multiplyScalar(1.35);
    const P0 = c.at(-9.5, 9.5, c.M.z - 0.7), PI_ = c.at(1.7, 0.25, c.M.z - 0.45);
    const dv = V().subVectors(PI_, P0).normalize();
    rk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dv);
    const t0 = 0.1, tBail = 1.12, tHit = 1.35, tLand = 1.85;
    const rkAt = (t) => _v.lerpVectors(P0, PI_, inQ(seg(t, t0, tHit)));
    let bail0 = null;
    const ride = (t, out) => out.copy(rkAt(t)).addScaledVector(dv, -0.55).add(_w.set(0, 0.32, 0));
    return {
      T: 2.35, T0r: 0.95,
      at(t) {
        vis(rk, t < tHit);
        rk.position.copy(rkAt(t));
        if (t < tBail) {
          const p = ride(t, V());
          c.ch.root.position.copy(p);
          c.ch.root.rotation.y = c.yaw(PI / 2);
          c.ch.play('sit');
        } else {
          bail0 ??= ride(tBail, V());
          const k = seg(t, tBail, tLand);
          const end = c.at(0, 0, c.M.z);
          c.ch.root.position.set(lerp(bail0.x, end.x, outC(k)), lerp(bail0.y, 0, k) + Math.sin(k * PI) * 1.6, lerp(bail0.z, end.z, k));
          c.ch.root.rotation.y = c.yaw(PI / 2 + (k < 1 ? k * PI * 2 - PI / 2 * k : -PI / 2 + 0.3));
          c.ch.play(k < 1 ? 'entTuck' : 'idle');
        }
      },
      ev: [
        [t0, () => { c.sfx('engine', { pitch: 1.2 }); c.sfx('whoosh', { pitch: 0.5 }); c.ch.mood('excited', 1.2); }],
        [tBail, () => { c.sfx('boing', { pitch: 1.3 }); c.ch.mood('panic', 0.8); }],
        [tHit, () => {
          c.hitstop(0.08); c.shake(0.85); c.flash('#ffa31a', 0.75);
          c.sfx('explode'); c.sfx('boom');
          const at = PI_;
          c.P.burst(at, { tex: 'flame', count: 24, speed: 5, size: 0.45, color: [0xff5a1f, 0xffa31a, 0xffe14a], glow: 2.4, life: 0.6, grav: -2, up: 0.4 });
          c.P.burst(at, { tex: 'drop', count: 20, speed: 6, size: 0.17, color: [0xc8142e, 0xff4a5a, 0xffffff], glow: 1.8, life: 0.8, grav: 10 });
          puffs(c, at, 12, { r: 1, sp: 2.5, rise: 1.3, size: 0.6, life: 1.0, color: [0x8a8e98, 0xa8acb8, 0x6b6f7a] });
          chips(c, at, 12, [0x6f7788, 0x8a6a4a]);
        }],
        [tLand, () => { c.sfx('thud'); c.shake(0.3); c.ch.boing(-0.45); c.ch.mood('excited', 2); puffs(c, c.at(0, 0, c.M.z), 8, { r: 0.4, size: 0.4 }); }],
      ],
      fx(t, dt) {
        if (t < tHit && t > t0 && c.E('trail', 34, dt)) {
          const tail = _v.copy(rk.position).addScaledVector(dv, -1.1);
          c.P.spawn({ tex: 'flame', x: tail.x, y: tail.y, z: tail.z, vx: -dv.x * 3, vy: -dv.y * 3, size: 0.4, size1: 0.1, color: [0xffe14a, 0xffa31a, 0xff5a1f], glow: 2.4, life: 0.25 });
          c.P.spawn({ tex: 'entPuff', additive: false, x: tail.x + rand(-0.1, 0.1), y: tail.y, z: tail.z, vy: 0.3, drag: 2, size: 0.3, size1: 0.1, color: [0xf0f2f8, 0xd8dce6], glow: 1, life: 0.8 });
        }
        if (t > tHit && c.E('fire', 9, dt)) c.P.spawn({ tex: 'flame', x: PI_.x + rand(-0.4, 0.4), y: 0.1, z: PI_.z + rand(-0.2, 0.2), vy: rand(1, 2), size: 0.35, size1: 0.08, color: [0xff5a1f, 0xffa31a], glow: 2.2, life: 0.5 });
      },
      cam(t) {
        if (t < 0.55) return { key: 'sky', ...c.shot(c.at(-4.5, 4.6, c.M.z - 0.5), W(c, 10), 6.4, { yaw: 0.1, pitch: -0.14 }) };
        if (t < tBail) {
          const p = rk.position;
          return { key: 'chase', ...c.shot(V(p.x, p.y, p.z), W(c, 5), 3.3, { yaw: 0.42, pitch: 0.05 }) };
        }
        return { key: 'land', ...c.shot(c.at(0.5, c.H * 0.75, c.M.z - 0.2), W(c, 5.2), 3.2, { yaw: 0.25, pitch: 0.02 }) };
      },
      pose: [['salute', 0.9, 'determined'], ['fistPump', 1.0, 'excited']],
    };
  },

  // ============================================================ RED CARPET
  redCarpet(c) {
    const zc = Math.max(c.zLane, 2.45);
    const len = 5.2;
    const carpet = c.add(voxCarpet(len));
    carpet.position.copy(c.at(-4.9, 0.006, zc));
    carpet.rotation.y = c.dir * PI / 2;
    const posts = [], ropes = [];
    const pu = [-4.2, -2.7, -1.2, 0.3];
    for (const u of pu) { const p = c.add(voxPost()); p.position.copy(c.at(u, 0, zc - 0.85)); posts.push(p); }
    for (let i = 0; i < pu.length - 1; i++) {
      const r = c.add(voxRope(1.5));
      r.position.copy(c.at(pu[c.dir > 0 ? i : i + 1], 0, zc - 0.85));
      ropes.push(r);
    }
    const pap = c.add(paparazzi(5, c.side + 3));
    pap.position.copy(c.at(-0.3, 0, zc - 1.55));
    const flashes = pap.userData.flashes;
    const tW = 0.75, tE = 2.6;
    let mic = null, micV = 0, micY = 0, micDone = false;
    return {
      T: 2.9, T0r: 1.65,
      at(t) {
        const k = outC(seg(t, 0, 0.6));
        carpet.scale.set(1.35, 1, Math.max(0.001, k));
        posts.forEach((p, i) => { const s = outC(seg(t, 0.15 + i * 0.08, 0.4 + i * 0.08)); p.scale.setScalar(Math.max(0.001, s)); });
        ropes.forEach((r, i) => { r.scale.setScalar(Math.max(0.001, outC(seg(t, 0.45 + i * 0.08, 0.6 + i * 0.08)))); });
        const kw = seg(t, tW, tE);
        vis(c.ch.root, t >= tW);
        put(c, lerp(-4.4, 0, kw), 0, zc, kw < 1 ? PI / 2 : PI / 2);
        c.ch.speed = 1.3;
        c.ch.play(kw > 0 && kw < 1 ? 'entWalkWave' : 'idle');
      },
      ev: [
        [0.05, () => c.sfx('whoosh', { pitch: 0.7 })],
        [tW, () => { c.sfx('cheer'); c.sfx('applause', { vol: 0.6 }); c.ch.mood('happy', 3); }],
      ],
      fx(t, dt) {
        if (t > 0.4 && c.E('flash', t < tE + 0.3 ? 9 : 4, dt)) {
          const f = pick(flashes);
          pap.updateMatrixWorld();
          const p = pap.localToWorld(_v.copy(f));
          camFlash(c, p, Math.random() < 0.3);
          c.sfx('tick', { pitch: rand(0.5, 0.8), vol: 0.35, gap: 0.03 });
          if (Math.random() < 0.18) c.flash('#ffffff', 0.12);
        }
        if (t > tW && t < tE) steps(c, 'rc', dt, 0.25);
      },
      hold(name, tl, dt) {
        if (name !== 'entMicDrop' || micDone) return;
        const ch = c.ch;
        if (!mic) { mic = c.add(microphone()); micV = 0; }
        if (tl < 0.35) {
          ch.handWorld(_v, 'R');
          mic.position.set(_v.x, _v.y - 0.02, _v.z);
          micY = _v.y;
        } else {
          micV -= 18 * dt;
          micY += micV * dt;
          if (micY <= 0) {
            micY = 0;
            if (micV < -3) { c.sfx('thud', { pitch: 1.4, vol: 0.7 }); c.sfx('vineBoom', { vol: 0.5 }); c.shake(0.25); micV = -micV * 0.3; } else { micV = 0; micDone = true; }
          }
          mic.position.y = micY;
          mic.rotation.z = c.dir * Math.min(1.5, (tl - 0.35) * 5);
        }
      },
      cam(t) {
        if (t < tW) return est(c, 'est', t, { u: -2.1, y: 1.0, z: zc - 0.6, w: 8.5, h: 4.2, pitch: 0.2, dur: tW });
        if (t < 1.85) return track(c, 'track', { yaw: 0.12, lead: 0.5, w: c.H * 3.8 });
        const p = c.ch.root.position;
        return { key: 'end', ...c.shot(V(p.x, c.H * 0.6, p.z), W(c, c.H * 3.4), c.H * 2.3, { yaw: 0.78, pitch: 0.03, minY: 0.22 }) };
      },
      pose: [['waveBoth', 0.85, 'happy'], ['entMicDrop', 1.05, 'smug']],
    };
  },

  // ============================================================ BURST THROUGH THE WALL
  wallBurst(c) {
    const wall = c.add(brickWall());
    wall.position.copy(c.at(0, 0, c.M.z - 0.55));
    wall.rotation.y = PI / 2;
    const door = wall.userData.door;
    c.add(door);
    door.rotation.y = PI / 2;
    door.position.copy(c.at(c.dir * 0 + 1.85, 0, c.M.z - 0.55));
    const pieces = wall.userData.pieces;
    const tB = 1.05, tR = 1.5, tS = 1.85;
    // each chunk: launch velocity + spin (towards the camera, fanning out)
    const fly = pieces.map((p) => {
      const lx = p.home.z; // local z = world x after the turn
      return { v: V(lx * 1.8 + rand(-0.6, 0.6), rand(2.5, 5) + p.home.y * 0.8, rand(3.5, 6.5)), s: V(rand(-6, 6), rand(-4, 4), rand(-6, 6)) };
    });
    return {
      T: 2.45, T0r: 0.85,
      at(t) {
        const kb = t - tB;
        const thump = t < tB ? Math.max(0, Math.sin((t - 0.35) * 18)) * (Math.abs(t - 0.4) < 0.12 || Math.abs(t - 0.8) < 0.12 ? 0.03 : 0) : 0;
        pieces.forEach((p, i) => {
          if (kb <= 0) { p.m.position.copy(p.home); p.m.position.x += thump * (i % 2 ? 1 : -1); p.m.rotation.set(0, 0, 0); return; }
          const f = fly[i];
          // wall-local: x = thickness (world -z), z = width (world +x)
          const wx = f.v.x * kb, wy = p.home.y + f.v.y * kb - 7 * kb * kb, wz = f.v.z * kb;
          const y = Math.max(0.08, wy);
          p.m.position.set(p.home.x - wz, y, p.home.z + wx);
          const spin = Math.min(kb, wy < 0.08 ? 0.45 : kb);
          p.m.rotation.set(f.s.x * spin, f.s.y * spin, f.s.z * spin);
        });
        const kr = seg(t, tB - 0.1, tR), ks = seg(t, tR, tS);
        vis(c.ch.root, t >= tB - 0.05);
        put(c, 0, 0, t < tR ? lerp(c.M.z - 2.0, c.M.z + 0.3, kr) : lerp(c.M.z + 0.3, c.M.z, outC(ks)), 0);
        c.ch.speed = 1;
        c.ch.play(t < tR ? 'run' : 'idle');
      },
      ev: [
        [0.4, () => { c.sfx('hitHeavy', { pitch: 0.6, vol: 0.7 }); c.shake(0.15); puffs(c, c.at(rand(-1, 1), 2.1, c.M.z - 0.4), 4, { r: 0.6, sp: 0.4, rise: -0.4, size: 0.35 }); }],
        [0.8, () => { c.sfx('hitHeavy', { pitch: 0.55, vol: 0.8 }); c.shake(0.2); puffs(c, c.at(rand(-1, 1), 2.1, c.M.z - 0.4), 5, { r: 0.6, sp: 0.4, rise: -0.4, size: 0.35 }); }],
        [tB, () => {
          c.hitstop(0.1); c.shake(0.9); c.flash('#ffffff', 0.5);
          c.sfx('crunch', { pitch: 0.7 }); c.sfx('boom', { pitch: 1.1 }); c.sfx('shatter', { pitch: 0.7, vol: 0.6 });
          c.ch.mood('rage', 1);
          const at = c.at(0, 1, c.M.z - 0.3);
          chips(c, at, 26, [0xc8603e, 0xb8553a, 0x9a3f2c, 0xd8cbb8], { vz: 3, up: 4 });
          puffs(c, _v.copy(at).setY(0.3), 14, { r: 1.2, sp: 2.5, rise: 0.9, size: 0.5, life: 1.0, color: [0xd8cbb8, 0xc8b8a4, 0xe0d4c4] });
        }],
        [tR, () => { c.sfx('scratch', { pitch: 0.8, vol: 0.6 }); c.ch.mood('smug', 2); }],
      ],
      fx(t, dt) {
        if (t > tR && t < tS) steps(c, 'skid', dt, 0.06);
      },
      cam(t) {
        if (t < tB - 0.08) return est(c, 'est', t, { u: 0.3, y: 1.15, z: c.M.z - 0.5, w: 6.4, h: 3.4, yaw: 0.06, pitch: 0.1, dur: tB });
        if (t < tR + 0.1) return { key: 'burst', ...c.shot(c.at(0, 1.0, c.M.z - 0.3), W(c, 4), 2.8, { yaw: 0.16, pitch: -0.1, minY: 0.2 }) };
        return { key: 'stop', ...c.shot(c.at(0.1, c.H * 0.62, c.M.z), W(c, 3.8), 2.6, { yaw: 0.3, pitch: 0.02 }) };
      },
      pose: [['entDustOff', 0.9, 'smug'], ['taunt', 1.0, 'tease']],
    };
  },

  // ============================================================ HELICOPTER ROPE DROP
  heliDrop(c) {
    const heli = c.add(helicopter());
    const rp = c.add(rope());
    const door = heli.userData.door;
    const HY = 6.3;
    heli.rotation.y = c.dir > 0 ? 0 : PI;
    // hover so the door hangs over the mark
    const hov = c.at(0, HY, c.M.z);
    heli.updateMatrixWorld(true);
    const off = V().copy(door).applyEuler(heli.rotation);
    hov.sub(V(off.x, 0, off.z));
    const start = c.at(-12, HY + 2.2, hov.z - 1.2);
    const tH = 1.1, tR = 1.32, tS = 1.35, tG = 2.35;
    const anchor = V();
    return {
      T: 3.1, T0r: 1.65,
      at(t) {
        const k = outC(seg(t, 0, tH));
        heli.position.lerpVectors(start, hov, k);
        heli.position.y += Math.sin(t * 2.2) * 0.08;
        heli.rotation.z = -c.dir * 0.28 * (1 - k) + Math.sin(t * 1.7) * 0.02;
        heli.updateMatrixWorld(true);
        anchor.copy(door).applyMatrix4(heli.matrixWorld);
        const drop = seg(t, tH - 0.1, tR);
        const back = seg(t, tG + 0.2, tG + 0.6);
        const len = Math.max(0.001, (anchor.y - 0.02) * (drop - back));
        rp.position.copy(anchor);
        rp.scale.set(1, len / rp.userData.unit, 1);
        rp.rotation.z = Math.sin(t * 3) * 0.03;
        vis(rp, drop > 0 && back < 1);
        const ks = seg(t, tS, tG);
        vis(c.ch.root, t >= tS);
        put(c, 0, 0, anchor.z, 0.3);
        c.ch.root.position.x = anchor.x;
        c.ch.root.position.y = Math.max(0, (anchor.y - c.H * 1.15) * (1 - sm(ks)));
        c.ch.play(ks < 1 ? 'entRope' : 'idle');
      },
      ev: [
        [0.02, () => c.sfx('whoosh', { pitch: 0.4 })],
        [tH - 0.1, () => c.sfx('swing', { pitch: 0.6 })],
        [tS, () => { c.sfx('slideWhistle', { pitch: 0.8, vol: 0.5 }); c.ch.mood('determined', 2.5); }],
        [tG, () => { c.sfx('thud'); c.ch.boing(-0.45); puffs(c, c.ch.root.position, 8, { r: 0.4, size: 0.4 }); }],
      ],
      fx(t, dt) {
        heli.userData.rotor.rotation.y += dt * 38;
        heli.userData.tail.rotation.z += dt * 50;
        if (c.E('chop', 11, dt)) chop(t < 3.2 ? 0.9 : 0.4);
        // downwash: dust skating out along the ground under the hover
        if (heli.position.y < HY + 1.2 && c.E('wash', 18, dt)) {
          const a = rand(0, PI * 2);
          const p = heli.position;
          c.P.spawn({ tex: 'entPuff', additive: false, x: p.x + Math.cos(a) * 0.4, y: 0.06, z: p.z + Math.sin(a) * 0.3, vx: Math.cos(a) * rand(2, 3.5), vz: Math.sin(a) * rand(1, 2), vy: 0.15, drag: 1.5, size: 0.26, size1: 0.08, color: [0xe8e2d4, 0xd0c8b8], glow: 1, life: 0.7 });
        }
      },
      cam(t) {
        if (t < 1.15) return { key: 'up', ...c.shot(c.at(-2.6, 4.2, c.M.z - 0.6), W(c, 10.5), 6.8, { yaw: 0.18, pitch: -0.16, minY: 0.3 }) };
        if (t < tG) {
          const p = c.ch.root.position;
          return { key: 'slide', ...c.shot(V(p.x, p.y + c.H * 0.45, p.z), W(c, 3.4), 3.1, { yaw: 0.3, pitch: -0.06, minY: 0.25 }) };
        }
        return { key: 'land', ...c.shot(c.at(0, 1.5, c.M.z), W(c, 4.4), 4.0, { yaw: 0.32, pitch: -0.12, minY: 0.22 }) };
      },
      out(k) {
        heli.position.x += c.dir * k * 0.25;
        heli.position.y += k * 0.12;
        vis(rp, false);
        return true;
      },
      pose: [['salute', 0.9, 'determined'], ['entPowerStance', 1.0, 'proud']],
    };
  },

  // ============================================================ JETPACK
  jetpack(c) {
    const ch = c.ch;
    const pack = wear(ch, 'jetpack', 'torso', ch.torso);
    const ord = ch.root.rotation.order;
    ch.root.rotation.order = 'YXZ';
    const P0 = c.at(-9.5, 6.8, c.M.z - 1.2), P1 = c.at(-2.2, 4.4, c.M.z - 0.4), P2 = c.at(0, 0.55, c.M.z);
    const tA = 1.95, tL = 2.25;
    const bez = (k, out) => {
      const a = (1 - k) * (1 - k), b = 2 * k * (1 - k), d = k * k;
      return out.set(P0.x * a + P1.x * b + P2.x * d, P0.y * a + P1.y * b + P2.y * d, P0.z * a + P1.z * b + P2.z * d);
    };
    const noz = [V(-3 * 0.05, -1.5 * 0.05, -8.5 * 0.05), V(3 * 0.05, -1.5 * 0.05, -8.5 * 0.05)];
    const nozW = (i) => ch.torso.localToWorld(_v.copy(noz[i]));
    return {
      T: 2.75, T0r: 1.3,
      at(t) {
        const k = seg(t, 0, tA);
        const p = bez(outC(k) * 0.4 + sm(k) * 0.6, V());
        if (t > tA) p.y = lerp(0.55, 0, sm(seg(t, tA, tL))) + Math.sin(t * 9) * 0.03 * (1 - seg(t, tA, tL));
        ch.root.position.copy(p);
        const lean = t < tA - 0.5 ? 0.42 : lerp(0.42, -0.25, seg(t, tA - 0.5, tA)) * (1 - seg(t, tA, tL));
        ch.root.rotation.x = lean;
        ch.root.rotation.y = c.yaw(lerp(PI / 2, 0.35, seg(t, tA - 0.3, tL)));
        ch.play(t < tL ? 'entHover' : 'idle');
      },
      ev: [
        [0.02, () => { c.sfx('engine', { pitch: 1.5 }); c.sfx('flare', { pitch: 0.8, vol: 0.5 }); ch.mood('excited', 2); }],
        [tA, () => c.sfx('whoosh', { pitch: 0.8 })],
        [tL, () => { c.sfx('thud'); ch.boing(-0.4); puffs(c, c.at(0, 0, c.M.z), 10, { r: 0.6, size: 0.45 }); ch.mood('proud', 2); }],
        [tL + 0.18, () => { c.sfx('pop', { pitch: 0.6 }); for (let i = 0; i < 2; i++) puffs(c, nozW(i), 3, { r: 0.05, sp: 0.6, rise: 0.8, size: 0.35, color: [0x3a3d48, 0x22252e] }); }],
        [tL + 0.4, () => { c.sfx('pop', { pitch: 0.5 }); puffs(c, nozW(1), 3, { r: 0.05, sp: 0.6, rise: 0.8, size: 0.35, color: [0x3a3d48, 0x22252e] }); }],
      ],
      fx(t, dt) {
        if (t < tL && c.E('jet', 40, dt)) {
          for (let i = 0; i < 2; i++) {
            const n = nozW(i);
            c.P.spawn({ tex: 'flame', x: n.x, y: n.y, z: n.z, vy: -rand(3, 5), vx: rand(-0.3, 0.3), size: rand(0.18, 0.28), size1: 0.05, color: [0xffe14a, 0xffa31a, 0xff5a1f], glow: 2.5, life: 0.2, rot: PI });
          }
          if (Math.random() < 0.4) { const n = nozW(0); c.P.spawn({ tex: 'entPuff', additive: false, x: n.x, y: n.y - 0.2, z: n.z, vy: -0.5, drag: 2, size: 0.22, size1: 0.08, color: [0xf0f2f8, 0xd8dce6], glow: 1, life: 0.7 }); }
        }
      },
      cam(t) {
        if (t < 0.85) return { key: 'sky', ...c.shot(c.at(-5.2, 4.6, c.M.z - 0.6), W(c, 11), 6.6, { yaw: 0.08, pitch: -0.06 }) };
        if (t < tA - 0.05) return track(c, 'track', { yaw: 0.55, lead: 0.6, w: c.H * 4.2, h: c.H * 3 });
        return { key: 'land', ...c.shot(c.at(0, c.H * 0.6, c.M.z), W(c, 4), 2.8, { yaw: 0.26, pitch: -0.05, minY: 0.22 }) };
      },
      cleanup() { unwear(pack); ch.root.rotation.order = ord; },
      pose: [['flex', 1.0, 'proud'], ['thumbsUp', 0.9, 'confident']],
    };
  },

  // ============================================================ LIMO ARRIVAL
  limo(c) {
    // drives in from the field side, nose towards the base; the door side faces the camera
    const car = c.add(limo(c.dir > 0 ? -1 : 1));
    const ud = car.userData;
    car.rotation.y = c.dir > 0 ? PI : 0;
    const zc = c.M.z - 1.0, uStop = 0.55;
    const tD = 1.45, tO = 1.65, tX = 1.95, tS = 2.6;
    let shades = null;
    const ch = c.ch;
    return {
      T: 3.05, T0r: 1.6,
      at(t) {
        const k = seg(t, 0, tD);
        const u = lerp(9.5, uStop, outC(k));
        car.position.copy(c.at(u, 0, zc));
        for (const w of ud.wheels) w.rotation.z = (u - 9.5) / ud.wheelR;
        car.rotation.z = (t > tD ? Math.sin((t - tD) * 18) * 0.025 * Math.exp(-(t - tD) * 5) : 0);
        const ko = seg(t, tO, tO + 0.3);
        ud.door.rotation.y = ud.side * 1.25 * outC(ko);
        const kx = seg(t, tX, tS);
        vis(ch.root, t >= tX);
        put(c, uStop, 0, lerp(zc, c.M.z + 0.2, sm(kx)), 0);
        ch.speed = 1.1;
        ch.play(kx > 0 && kx < 1 ? 'walk' : 'idle');
        if (t >= tX && !shades) { shades = wear(ch, 'shades', 'head', ch.head); }
      },
      ev: [
        [0.05, () => c.sfx('engine', { pitch: 0.7, vol: 0.7 })],
        [0.4, () => c.sfx('horn', { vol: 0.8 })],
        [tD - 0.15, () => c.sfx('squeak', { pitch: 0.6, vol: 0.6 })],
        [tO, () => c.sfx('latch')],
        [tX, () => { ch.mood('cool', 3); c.sfx('whoosh', { pitch: 1.3, vol: 0.5 }); }],
        [tS - 0.1, () => c.sfx('cheer', { vol: 0.5 })],
      ],
      fx(t, dt) {
        if (t < tD && c.E('exh', 10, dt)) {
          const p = c.at(lerp(9.5, uStop, outC(seg(t, 0, tD))) + 2.5, 0.2, zc);
          c.P.spawn({ tex: 'entPuff', additive: false, x: p.x, y: p.y, z: p.z, vx: c.dir * 1.5, vy: 0.3, drag: 2, size: 0.22, size1: 0.07, color: [0xd8dce6, 0xb8c0cc], glow: 1, life: 0.6 });
        }
        if (t > tX && c.E('sparkle', 6, dt)) {
          const p = ch.root.position;
          c.P.spawn({ tex: 'star4', x: p.x + rand(-0.5, 0.5), y: rand(0.2, c.H * 1.1), z: p.z + 0.2, size: 0.16, size1: 0.02, color: [0xffffff, 0xc9a0ff, 0xffd23f], glow: 2.4, life: 0.5 });
        }
      },
      cam(t) {
        if (t < 1.25) return { key: 'arrive', ...c.shot(c.at(1.2, 0.95, zc + 0.2), W(c, 8.2), 3.6, { yaw: 0.14, pitch: 0.1 }) };
        if (t < tX) return { key: 'door', ...c.shot(c.at(uStop, 0.6, zc + 0.5), W(c, 2.8), 1.6, { yaw: -0.32, pitch: -0.02, minY: 0.18 }) };
        return { key: 'out', ...c.shot(c.at(uStop, c.H * 0.62, c.M.z), W(c, 3.8), 2.6, { yaw: 0.26, pitch: -0.04, minY: 0.2 }) };
      },
      cleanup() { unwear(shades); },
      pose: [['entShades', 0.95, 'cool'], ['crossArms', 1.0, 'smug']],
    };
  },

  // ============================================================ MONEY RAIN
  moneyRain(c) {
    const bc = makeBriefcase();
    const brief = c.add(bc.root);
    brief.scale.setScalar(0.62);
    const ch = c.ch;
    const tW = 0.6, tE = 2.1, tT = 2.18, tP = 2.48;
    let toss0 = null;
    return {
      T: 2.7, T0r: 1.25,
      at(t) {
        const kw = seg(t, tW, tE);
        vis(ch.root, t >= tW);
        put(c, lerp(-3.6, 0, kw), 0, lerp(c.zLane, c.M.z, sm(seg(kw, 0.3, 1))), kw < 1 ? PI / 2 : 0.3);
        ch.speed = 1.2;
        ch.play(kw > 0 && kw < 1 ? 'walk' : t >= tT ? 'holdUp' : 'idle');
        ch.root.updateMatrixWorld(true);
        if (t < tT) {
          ch.handWorld(_v, 'R');
          brief.position.set(_v.x, _v.y - 0.32, _v.z);
          brief.rotation.set(0, ch.root.rotation.y, 0);
          bc.open(0);
          vis(brief, t >= tW);
          toss0 = null;
        } else {
          toss0 ??= brief.position.clone();
          const k = seg(t, tT, tP);
          brief.position.set(lerp(toss0.x, ch.root.position.x, k), toss0.y + Math.sin(k * PI * 0.7) * 2.2, lerp(toss0.z, ch.root.position.z, k));
          brief.rotation.x = k * PI * 1.5;
          bc.open(k);
          vis(brief, t < tP);
        }
      },
      ev: [
        [0.05, () => c.sfx('chaching', { vol: 0.7 })],
        [tW, () => ch.mood('cool', 2)],
        [tT, () => { c.sfx('swing'); ch.mood('rich', 3); }],
        [tP, () => {
          c.sfx('chaching'); c.sfx('coin', { pitch: 1.2 }); c.sfx('cheer', { vol: 0.6 }); c.flash('#b8f0a0', 0.35);
          const p = brief.position;
          for (let i = 0; i < 30; i++) c.P.spawn({ tex: 'cash', additive: false, x: p.x, y: p.y, z: p.z, vx: rand(-3, 3), vy: rand(1, 5), vz: rand(-1.5, 1.5), grav: 3, drag: 1.6, ground: 0.05, size: rand(0.18, 0.26), size1: 0.16, color: [0x6fcf5f, 0x8fe07a, 0x4fb04a], glow: 1, life: rand(1.4, 2.2), rot: rand(0, PI), spin: rand(-6, 6) });
          sparks(c, p, 16, [0xffd23f, 0xffffff], { speed: 4 });
        }],
      ],
      fx(t, dt) {
        const bill = (y, near) => c.P.spawn({ tex: 'cash', additive: false, x: c.X(near ? rand(-1.6, 1.6) : rand(-4.5, 3)), y, z: c.M.z + (near ? rand(-0.4, 1.3) : rand(-1.6, 1.4)), vx: rand(-0.6, 0.6), vy: -rand(1.4, 2.2), grav: 0, ground: 0.05, size: rand(0.16, 0.24), size1: 0.15, color: [0x6fcf5f, 0x8fe07a, 0x4fb04a], glow: 1, life: 4, rot: rand(0, PI), spin: rand(-5, 5) });
        if (!this.filled) { this.filled = true; for (let i = 0; i < 46; i++) bill(rand(0.4, 7.5), i % 3 === 0); }
        const n = c.E('rain', 30, dt);
        for (let i = 0; i < n; i++) bill(rand(5, 7.5), Math.random() < 0.4);
        if (t > tW && t < tE) steps(c, 'mr', dt, 0.27);
      },
      cam(t) {
        if (t < 0.72) return est(c, 'est', t, { u: -1.4, y: 2.0, w: 8, h: 4.8, pitch: 0.22, dur: 0.72 });
        if (t < tT - 0.1) return track(c, 'track', { yaw: 0.32, lead: 0.5, w: c.H * 3.8, h: c.H * 2.6 });
        return { key: 'toss', ...c.shot(c.at(0, 1.55, c.M.z), W(c, 3.6), 3.6, { yaw: 0.3, pitch: -0.2, minY: 0.2 }) };
      },
      pose: [['holdUp', 1.0, 'rich'], ['entFingerGuns', 0.9, 'confident']],
    };
  },

  // ============================================================ HYPE PARADE
  hypeParade(c) {
    const fl = c.add(paradeFloat());
    const zc = c.zLane + 0.25;
    const deck = fl.userData.deck;
    const drummers = [CHARACTERS.fan, CHARACTERS.labTech].map((def, i) => {
      const d = new Chibi(def, { scale: 0.9, fidget: false });
      d.root.scale.setScalar(c.ch.root.scale.x * 0.92);
      d.play('entDrum');
      d.expr('happy', 'grin');
      const drum = snareDrum();
      drum.position.set(0, 0.32, 0.42);
      d.torso.add(drum);
      c.add(d.root);
      d.root.userData.zo = i ? -0.42 : 0.42;
      return d;
    });
    const tF = 2.35, tJ = 2.55, tLnd = 2.95;
    const uF = (t) => lerp(-8.2, -1.55, outC(seg(t, 0, tF)) * 0.35 + seg(t, 0, tF) * 0.65);
    return {
      T: 3.25, T0r: 1.85,
      at(t) {
        const u = uF(t);
        fl.position.copy(c.at(u, 0, zc));
        drummers.forEach((d, i) => {
          const du = u + 2.2 + i * 0.75;
          d.root.position.copy(c.at(du, 0, zc + d.root.userData.zo));
          d.root.rotation.y = c.yaw(t < tF ? PI / 2 : 0.4);
        });
        const kj = seg(t, tJ, tLnd);
        const from = c.at(u + 0.2, deck, zc);
        const to = c.at(0.15, 0, c.M.z + 0.2);
        c.ch.root.position.set(lerp(from.x, to.x, kj), lerp(deck, 0, kj) + Math.sin(kj * PI) * 1.1, lerp(from.z, to.z, kj));
        c.ch.root.rotation.y = c.yaw(kj > 0 ? lerp(0.5, 0.3, kj) + (kj < 1 ? kj * PI * 2 : 0) : 0.5);
        c.ch.play(kj > 0 && kj < 1 ? 'entTuck' : t < tJ ? 'waveBoth' : 'idle');
      },
      ev: [
        [0.02, () => { c.sfx('drumroll', { vol: 0.6 }); c.ch.mood('excited', 3); }],
        [tF, () => { c.sfx('fanfare', { vol: 0.7 }); c.sfx('applause', { vol: 0.6 }); }],
        [tF + 0.08, () => {
          c.sfx('pop'); c.sfx('pop', { pitch: 0.8 }); c.shake(0.25);
          fl.updateMatrixWorld(true);
          for (const cn of fl.userData.cannons) {
            const p = fl.localToWorld(_v.copy(cn));
            for (let i = 0; i < 26; i++) c.P.spawn({ tex: Math.random() < 0.7 ? 'entConf' : 'entStreamer', additive: false, x: p.x, y: p.y, z: p.z, vx: c.dir * rand(0.5, 3), vy: rand(4, 7.5), vz: rand(-1.4, 1.4), grav: 7, drag: 1.4, ground: 0.04, size: rand(0.1, 0.17), size1: 0.12, color: [0xff4fa3, 0xffd23f, 0x29b6f6, 0x5fdc4a, 0xffffff, 0xb05cff], glow: 1, life: rand(1.4, 2.2), rot: rand(0, PI), spin: rand(-10, 10) });
          }
        }],
        [tJ, () => c.sfx('boing', { pitch: 1.2 })],
        [tLnd, () => { c.sfx('thud'); c.ch.boing(-0.4); puffs(c, c.at(0.15, 0, c.M.z + 0.2), 8, { r: 0.4, size: 0.4 }); }],
      ],
      fx(t, dt) {
        for (const d of drummers) d.update(Math.min(dt, 1 / 30));
        if (c.E('beat', 4.2, dt)) c.sfx('drum', { pitch: Math.random() < 0.5 ? 1.25 : 1.45, vol: 0.45, gap: 0.05 });
        if (c.E('note', 5, dt)) {
          const d = pick(drummers);
          const p = d.root.position;
          c.P.spawn({ tex: 'entNote', x: p.x + rand(-0.3, 0.3), y: c.H * 1.1, z: p.z, vy: rand(0.8, 1.4), vx: rand(-0.3, 0.3), size: 0.22, size1: 0.12, color: [0xffd23f, 0xff4fa3, 0x29b6f6], glow: 2, life: 0.9 });
        }
      },
      cam(t) {
        if (t < 1.0) return est(c, 'est', t, { u: -3.2, y: 1.4, z: zc - 0.4, w: 9.5, h: 4.4, pitch: 0.14 });
        if (t < tF + 0.05) return { key: 'track', ...c.shot(c.at(uF(t) + 0.9, 1.15, zc), W(c, 5.4), 3.1, { yaw: 0.36, pitch: 0.06 }) };
        return { key: 'party', ...c.shot(c.at(-0.4, 1.1, c.M.z + 0.3), W(c, 4.8), 3.1, { yaw: 0.3, pitch: 0.03 }) };
      },
      out(k) {
        drummers.forEach((d) => { d.root.position.x += c.dir * 0.06; d.root.rotation.y = c.yaw(PI / 2); });
        fl.scale.setScalar(Math.max(0.001, 1 - outC(seg(k, 0, 0.35))));
        if (k > 0.5) drummers.forEach((d) => d.root.scale.setScalar(Math.max(0.001, d.root.scale.x * 0.9)));
        return true;
      },
      cleanup() {
        for (const d of drummers) {
          d.root.parent?.remove(d.root);
          d.face?.texture?.dispose?.();
          d.facePlane?.material?.dispose?.();
        }
      },
      pose: [['waveBoth', 0.9, 'excited'], ['celebrate', 1.0, 'excited']],
    };
  },
};

/** Bake an entrance's voxel props now (battle load), so its first frame doesn't hitch. */
export function prepSet(id) {
  const B = {
    strut: () => spotRig(),
    boxSneak: () => cardBox(),
    redCarpet: () => { voxCarpet(5.2); voxPost(); voxRope(1.5); paparazzi(5, 3); paparazzi(5, 4); },
    wallBurst: () => brickWall(),
    heliDrop: () => { helicopter(); rope(); },
    limo: () => { limo(1); limo(-1); },
    skateKickflip: () => skateboard(),
    hypeParade: () => { paradeFloat(); snareDrum(); },
    redCarpetMic: () => microphone(),
  }[id];
  B?.();
  if (id === 'redCarpet') microphone();
}
