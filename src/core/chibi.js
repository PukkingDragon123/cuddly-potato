// Chibi characters (Jimmy, Nolan, Juan, the Recruit, NPCs, Commander outfits):
// hi-res voxel toy figures with oversized heads, a parametric pixel face, an
// accessory system, elbows/knees/hand shapes, and a procedural pose-blending
// animation system with secondary motion (breathing, blinks, glances, head
// jiggle, coat tails / capes, landing squash) and idle fidgets.
//
// Public API (unchanged): new Chibi(def, { scale }), root, inner, play(name, opts),
// expr(eyes, mouth, hold), talk(on), boing(amt), flash(sec), update(dt), headTop(),
// handWorld(), height. Added: mood(name, hold), react(name, opts), emote(name, dur),
// look(x, y, hold), snap(), setLoop(name). Game code may freely set busy / reactT /
// home / side on instances.
import * as THREE from 'three';
import { Mats, makeMesh, VOX } from './voxel.js';
import { PixelFace } from './face.js';
import { damp, rand, shade } from './util.js';
import {
  H, buildHead, buildBody, buildTail, buildCape, buildUpperArm, buildForearm, buildHand, buildThigh, buildShin,
} from '../models/characters/parts.js';
import { normalizeAcc, handItem } from '../models/characters/accessories.js';
import { Emote } from '../models/characters/emotes.js';

const SPRING_STEP = 1 / 120; // max integration step for the secondary-motion springs
const HEAD_H = 10, BODY_H = 5, LEG_H = 4; // in legacy 0.1 voxels (world sizes kept identical)
const GEO_CACHE = new Map();
const PLANE_GEO = new THREE.PlaneGeometry(1.0, HEAD_H * VOX); // face plane over the 20x20 voxel head front

// toy vinyl: slightly matte so skin doesn't look wet; metal for bling
const CHAR_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.55 });
const METAL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85, envMapIntensity: 1.0 });
METAL_MAT.color.setScalar(0.72); // keeps polished gold/chrome below the bloom threshold
const PAIR = [CHAR_MAT, Mats.glow];
const METAL_PAIR = [METAL_MAT, Mats.glow];
function syncEnv() {
  const env = Mats.toy.envMap;
  if (env && CHAR_MAT.envMap !== env) {
    CHAR_MAT.envMap = env; METAL_MAT.envMap = env;
    CHAR_MAT.needsUpdate = true; METAL_MAT.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
// Geometry (cached per character/outfit + part)

function bake(res) {
  if (!res) return null;
  const g = res.g && res.g.size ? res.g.build({ scale: H, pivot: [0, 0, 0], jitter: 0.035 }) : null;
  const m = res.metal && res.metal.size ? res.metal.build({ scale: H, pivot: [0, 0, 0], jitter: 0.02 }) : null;
  return g || m ? { g, m } : null;
}
function cached(key, fn) {
  if (!GEO_CACHE.has(key)) GEO_CACHE.set(key, bake(fn()));
  return GEO_CACHE.get(key);
}

// ---------------------------------------------------------------------------
// Poses: functions writing target joint values (radians / world units).
//
// Conventions: armLZ < 0 / armRZ > 0 swings an arm OUT to the side; armX < 0 raises
// it forward; elbow < 0 bends the forearm forward; elbowLZ > 0 / elbowRZ < 0 bends
// the forearm in towards the body; legX < 0 swings a leg forward, knee > 0 bends
// the shin back; headRX > 0 nods down; headRY > 0 turns to +x.

const KEYS = ['y', 'hipsRY', 'hipsRZ', 'torsoRX', 'torsoRY', 'torsoRZ', 'headRX', 'headRY', 'headRZ',
  'armLX', 'armLY', 'armLZ', 'armRX', 'armRY', 'armRZ', 'elbowL', 'elbowR', 'elbowLZ', 'elbowRZ',
  'legLX', 'legRX', 'legLZ', 'legRZ', 'kneeL', 'kneeR', 'sx', 'sy', 'lookX', 'lookY'];
const DEF = { armLZ: -0.1, armRZ: 0.1, elbowL: -0.12, elbowR: -0.12, sx: 1, sy: 1 };
function resetPose(p) {
  for (const k of KEYS) p[k] = DEF[k] ?? 0;
  p.hl = 'open'; p.hr = 'open';
  p.lookOn = 0;
  return p;
}
const newPose = () => resetPose({});
const sin = Math.sin, cos = Math.cos, abs = Math.abs, max = Math.max, min = Math.min;
const handOnHipL = (p) => { p.armLZ = -0.8; p.armLX = 0.1; p.elbowLZ = 1.9; p.elbowL = 0; p.hl = 'fist'; };
const handOnHipR = (p) => { p.armRZ = 0.8; p.armRX = 0.1; p.elbowRZ = -1.9; p.elbowR = 0; p.hr = 'fist'; };

const POSES = {
  idle(t, p) {
    const b = sin(t * 2.2);
    p.sy = 1 + b * 0.012; p.sx = 1 - b * 0.006;
    p.armLZ = -(0.1 + b * 0.025); p.armRZ = 0.1 + b * 0.025;
    p.elbowL = p.elbowR = -0.15 - b * 0.03;
    p.headRZ = sin(t * 0.9) * 0.035;
    p.headRX = sin(t * 1.3) * 0.025;
    p.headRY = sin(t * 0.45) * 0.1;
    p.hipsRZ = sin(t * 0.6) * 0.015;
  },
  walk(t, p, k = 1) {
    const s = sin(t * 11 * k), c = cos(t * 11 * k);
    p.legLX = s * 0.7; p.legRX = -s * 0.7;
    p.kneeL = max(0, -c) * 0.8; p.kneeR = max(0, c) * 0.8;
    p.armLX = -s * 0.6; p.armRX = s * 0.6;
    p.elbowL = -0.35 - max(0, -s) * 0.3; p.elbowR = -0.35 - max(0, s) * 0.3;
    p.y = abs(c) * 0.05;
    p.torsoRY = s * 0.08;
    p.headRZ = s * 0.04;
  },
  run(t, p) {
    const s = sin(t * 16.5), c = cos(t * 16.5);
    p.legLX = s * 0.95; p.legRX = -s * 0.95;
    p.kneeL = max(0, -c) * 1.3 + 0.1; p.kneeR = max(0, c) * 1.3 + 0.1;
    p.armLX = -s * 1.0; p.armRX = s * 1.0;
    p.elbowL = p.elbowR = -1.35;
    p.hl = p.hr = 'fist';
    p.y = abs(c) * 0.085;
    p.torsoRX = 0.25; p.torsoRY = s * 0.12;
    p.headRX = -0.12; p.headRZ = s * 0.04;
  },
  talk(t, p) {
    POSES.idle(t, p);
    p.headRX = sin(t * 7) * 0.05;
    p.headRZ = sin(t * 3) * 0.06;
    p.armRX = -0.55 + sin(t * 4) * 0.22; p.armRZ = 0.25;
    p.elbowR = -0.9 + sin(t * 4.3) * 0.2;
    p.armLX = -max(0, sin(t * 1.7)) * 0.45; p.elbowL = -0.45;
  },
  cheer(t, p) {
    const j = abs(sin(t * 7));
    p.y = j * 0.3;
    p.armLZ = -(2.45 + sin(t * 14) * 0.15); p.armRZ = 2.45 + sin(t * 14) * 0.15;
    p.armLX = p.armRX = -0.25;
    p.elbowL = p.elbowR = -0.25;
    p.hl = p.hr = 'fist';
    p.kneeL = p.kneeR = j * 0.9;
    p.legLX = p.legRX = -j * 0.25;
    p.headRX = -0.15;
    p.sy = 1 + (j - 0.5) * 0.1; p.sx = 1 - (j - 0.5) * 0.06;
  },
  dance(t, p) {
    const s = sin(t * 8), c = cos(t * 8);
    p.y = abs(s) * 0.1;
    p.hipsRZ = s * 0.14;
    p.torsoRY = c * 0.3; p.torsoRZ = -s * 0.1;
    p.headRZ = s * 0.16; p.headRY = c * 0.15;
    p.armLZ = -(1.3 + s * 0.9); p.armRZ = 1.3 - s * 0.9;
    p.armLX = c * 0.5; p.armRX = -c * 0.5;
    p.elbowL = p.elbowR = -0.6;
    p.hl = s > 0.3 ? 'point' : 'open'; p.hr = s < -0.3 ? 'point' : 'open';
    p.legLX = -max(0, s) * 0.5; p.legRX = -max(0, -s) * 0.5;
    p.kneeL = max(0, s) * 0.9; p.kneeR = max(0, -s) * 0.9;
  },
  throw(t, p, k, d) {
    const u = t / (d || 0.5);
    if (u < 0.45) {
      const v = u / 0.45;
      p.armRX = -2.6 * v; p.elbowR = -1.2 * v; p.torsoRY = 0.45 * v; p.torsoRX = -0.1;
      p.armLX = -0.8 * v; p.hr = 'fist';
    } else {
      const v = min(1, (u - 0.45) / 0.3);
      p.armRX = -2.6 + v * 3.4; p.elbowR = -1.2 * (1 - v); p.torsoRY = 0.45 - v * 0.9; p.torsoRX = v * 0.25;
      p.armLX = -0.8 + v * 1.2; p.hr = v > 0.3 ? 'open' : 'fist';
    }
    p.armLZ = -0.4;
  },
  kick(t, p, k, d) {
    const u = t / (d || 0.6);
    if (u < 0.4) { const v = u / 0.4; p.legRX = 0.7 * v; p.kneeR = 1.3 * v; p.torsoRX = -0.1; p.armLX = -0.5; }
    else { const v = min(1, (u - 0.4) / 0.25); p.legRX = 0.7 - v * 2.3; p.kneeR = 1.3 * (1 - v); p.torsoRX = -0.25 * v; p.armLZ = -1; p.armRZ = 1; }
    p.y = 0.03;
    p.hl = p.hr = 'fist';
  },
  point(t, p) {
    POSES.idle(t, p);
    p.armRX = -1.5; p.armRZ = 0.05; p.elbowR = 0;
    p.hr = 'point';
    p.torsoRY = -0.1; p.headRY = 0.05;
  },
  present(t, p) {
    POSES.idle(t, p);
    p.armLX = p.armRX = -1.05;
    p.armLZ = -0.3; p.armRZ = 0.3;
    p.elbowL = p.elbowR = -0.5;
    p.torsoRX = -0.05; p.headRZ = 0.06;
  },
  holdUp(t, p) {
    POSES.idle(t, p);
    p.armLX = p.armRX = -2.3;
    p.armLZ = -0.65; p.armRZ = 0.65;
    p.elbowL = p.elbowR = -0.25;
    p.y = abs(sin(t * 3)) * 0.05;
    p.headRX = -0.2;
  },
  sit(t, p) {
    p.y = -0.38;
    p.legLX = p.legRX = -1.45;
    p.legLZ = sin(t * 2) * 0.05; p.legRZ = -sin(t * 2 + 1) * 0.05;
    p.kneeL = 0.08 + max(0, sin(t * 2)) * 0.06; p.kneeR = 0.08 + max(0, sin(t * 2 + 1.5)) * 0.06;
    p.armLX = p.armRX = -0.55;
    p.armLZ = -0.15; p.armRZ = 0.15;
    p.elbowL = p.elbowR = -0.6;
    p.headRZ = sin(t * 1.1) * 0.05;
    p.headRY = sin(t * 0.5) * 0.12;
    p.sy = 1 + sin(t * 2.2) * 0.015;
  },
  sitCheer(t, p) {
    POSES.sit(t, p);
    p.armLZ = -(2.35 + sin(t * 12) * 0.2); p.armRZ = 2.35 + sin(t * 12) * 0.2;
    p.armLX = p.armRX = -0.3;
    p.elbowL = p.elbowR = -0.2;
    p.hl = p.hr = 'fist';
    p.y = -0.38 + abs(sin(t * 7)) * 0.13;
    p.headRX = -0.12;
  },
  sitWorried(t, p) {
    POSES.sit(t, p);
    p.armLX = p.armRX = -1.1;
    p.armLZ = -0.55; p.armRZ = 0.55;
    p.elbowL = p.elbowR = -1.75;
    p.headRZ = sin(t * 20) * 0.04;
    p.headRX = 0.05;
    p.kneeL = p.kneeR = 0.02;
  },
  shocked(t, p) {
    p.y = max(0, sin(min(t, 0.4) * 7.8)) * 0.28;
    p.armLZ = -1.25; p.armRZ = 1.25;
    p.armLX = p.armRX = -0.5;
    p.elbowL = p.elbowR = -0.5;
    p.torsoRX = -0.15; p.headRX = -0.12;
    p.legLZ = -0.12; p.legRZ = 0.12;
    p.sy = 1.06;
  },
  hit(t, p) {
    p.torsoRX = -0.35; p.headRX = -0.3;
    p.armLZ = -0.9; p.armRZ = 0.9;
    p.armLX = p.armRX = -0.6; p.elbowL = p.elbowR = -0.3;
    p.sx = 1.1; p.sy = 0.9;
  },
  sad(t, p) {
    p.headRX = 0.38; p.torsoRX = 0.15;
    p.armLZ = -0.03; p.armRZ = 0.03;
    p.elbowL = p.elbowR = -0.05;
    p.sy = 0.97;
    p.headRY = sin(t * 0.8) * 0.06;
    p.hipsRZ = sin(t) * 0.02;
  },
  angry(t, p) {
    const s = sin(t * 16);
    p.armLX = -1.1 + s * 0.25; p.armRX = -1.1 - s * 0.25;
    p.armLZ = -0.35; p.armRZ = 0.35;
    p.elbowL = p.elbowR = -1.1;
    p.hl = p.hr = 'fist';
    p.y = abs(sin(t * 8)) * 0.07;
    p.headRX = 0.12; p.headRZ = s * 0.05; p.torsoRX = 0.08;
  },
  facepalm(t, p) {
    p.armRX = -1.4; p.armRZ = 0.75; p.elbowR = -1.8;
    p.headRX = 0.3; p.headRZ = -0.12;
    p.sy = 0.98;
    p.armLZ = -0.08;
  },
  wave(t, p) {
    POSES.idle(t, p);
    p.armRZ = 2.3; p.armRX = -0.15;
    p.elbowR = -0.2; p.elbowRZ = sin(t * 10) * 0.45;
    p.headRZ = 0.08; p.torsoRZ = -0.04;
  },
  flick(t, p, k, d) {
    const u = t / (d || 0.5);
    p.armRX = -1.4; p.elbowR = -0.4;
    p.torsoRY = -0.15;
    p.elbowRZ = u < 0.5 ? u * 1.2 : 0.6 - (u - 0.5) * 2.6;
    p.hr = 'point';
  },
  shake(t, p) {
    p.armLX = p.armRX = -2.1 + sin(t * 30) * 0.35;
    p.armLZ = -0.35; p.armRZ = 0.35;
    p.elbowL = p.elbowR = -0.6;
    p.hl = p.hr = 'fist';
    p.y = abs(sin(t * 15)) * 0.05;
    p.headRX = -0.1;
  },
  bellyflop(t, p) {
    p.torsoRX = 1.4; p.armLZ = -1.5; p.armRZ = 1.5;
    p.legLX = p.legRX = 0.4; p.kneeL = p.kneeR = 0.3;
    p.headRX = -0.6;
  },
  victory(t, p) {
    const s = sin(t * 6);
    p.y = abs(s) * 0.22;
    p.armRZ = 2.6; p.armRX = -0.2; p.elbowR = -0.2; p.hr = 'fist';
    handOnHipL(p);
    p.torsoRY = s * 0.15; p.headRZ = 0.08;
  },

  // ----- new expressive poses
  laugh(t, p) {
    const s = sin(t * 14);
    p.torsoRX = -0.18 + s * 0.06; p.headRX = -0.22 + s * 0.05;
    p.armLX = p.armRX = -0.35;
    p.armLZ = -0.25; p.armRZ = 0.25;
    p.elbowLZ = 1.5; p.elbowRZ = -1.5; p.elbowL = p.elbowR = -0.6;
    p.y = abs(s) * 0.03; p.sy = 1 + s * 0.02;
  },
  celebrate(t, p) {
    const u = (t % 0.9) / 0.9;
    const j = max(0, sin(u * Math.PI));
    p.y = j * 0.4;
    p.torsoRY = sin(u * Math.PI * 2) * 0.45;
    p.armLZ = -2.5; p.armRZ = 2.5; p.armLX = p.armRX = -0.2;
    p.hl = p.hr = 'fist';
    p.kneeL = p.kneeR = j * 1.2; p.legLX = p.legRX = -j * 0.4;
    p.headRX = -0.18;
    p.sy = 1 + (j - 0.4) * 0.12; p.sx = 1 - (j - 0.4) * 0.07;
  },
  jump(t, p, k, d) {
    const u = t / (d || 0.75);
    if (u < 0.25) { const v = u / 0.25; p.sy = 1 - v * 0.12; p.sx = 1 + v * 0.06; p.kneeL = p.kneeR = v * 0.7; p.legLX = p.legRX = -v * 0.35; p.y = -v * 0.04; p.armLX = p.armRX = 0.4 * v; }
    else if (u < 0.85) {
      const v = (u - 0.25) / 0.6;
      p.y = sin(v * Math.PI) * 0.45;
      p.armLZ = -2.4; p.armRZ = 2.4; p.hl = p.hr = 'fist';
      p.kneeL = p.kneeR = sin(v * Math.PI) * 1.0; p.legLX = p.legRX = -sin(v * Math.PI) * 0.3;
      p.sy = 1.08; p.sx = 0.95; p.headRX = -0.15;
    } else { const v = (u - 0.85) / 0.15; p.sy = 0.9 + v * 0.1; p.sx = 1.06 - v * 0.06; p.kneeL = p.kneeR = 0.5 * (1 - v); }
  },
  fistPump(t, p) {
    const c = (t * 3.2) % 1;
    const up = c < 0.3 ? c / 0.3 : 1 - (c - 0.3) / 0.7;
    p.armRZ = 0.9 + up * 1.5; p.armRX = -0.2;
    p.elbowRZ = -(1 - up) * 1.7; p.elbowR = -0.1;
    p.hr = 'fist';
    handOnHipL(p);
    p.y = up * 0.05; p.headRX = -0.12 * up; p.torsoRZ = -0.05 * up;
  },
  thumbsUp(t, p) {
    POSES.idle(t, p);
    p.armRX = -0.45; p.armRZ = 0.25; p.elbowR = -1.25;
    p.hr = 'thumb';
    p.headRZ = 0.12; p.torsoRZ = -0.04;
    p.y = abs(sin(t * 4)) * 0.02;
  },
  clap(t, p) {
    const c = sin(t * 16);
    p.armLX = p.armRX = -1.15;
    p.armLZ = 0.55 + c * 0.25; p.armRZ = -(0.55 + c * 0.25);
    p.elbowL = p.elbowR = -0.45;
    p.y = abs(sin(t * 8)) * 0.03; p.headRX = sin(t * 8) * 0.04 - 0.05;
  },
  nervous(t, p) {
    POSES.idle(t, p);
    p.armLX = p.armRX = -0.6;
    p.armLZ = 0.45; p.armRZ = -0.45;
    p.elbowL = -0.9 + sin(t * 9) * 0.12; p.elbowR = -0.9 - sin(t * 9) * 0.12;
    p.headRY = sin(t * 1.7) * 0.35; p.lookX = sin(t * 1.7) * 1.3; p.lookOn = 1;
    p.sy = 0.97; p.kneeL = p.kneeR = 0.1;
    p.hipsRZ = sin(t * 3) * 0.02;
  },
  think(t, p) {
    POSES.idle(t, p);
    p.armRX = -0.9; p.armRZ = -0.1; p.elbowR = -1.9 + sin(t * 3) * 0.08; p.hr = 'fist';
    p.armLX = -0.5; p.armLZ = 0.2; p.elbowLZ = 1.3; p.elbowL = -0.4;
    p.headRZ = 0.15; p.headRX = -0.08;
    p.lookX = -1.2; p.lookY = -1.2; p.lookOn = 1;
  },
  idea(t, p) {
    POSES.idle(t, p);
    p.armRZ = 1.9; p.armRX = -0.2; p.elbowRZ = -1.1; p.hr = 'point';
    p.headRX = -0.15; p.y = abs(sin(t * 5)) * 0.04;
  },
  shrug(t, p) {
    const s = max(0, sin(t * 5)) * 0.04;
    p.armLZ = -0.65; p.armRZ = 0.65; p.armLX = p.armRX = -0.3;
    p.elbowL = p.elbowR = -1.35;
    p.sy = 1.02 + s; p.headRZ = 0.18; p.headRX = -0.04; p.torsoRZ = 0.03;
  },
  panic(t, p) {
    const s = sin(t * 18);
    p.armLZ = -(2.0 + s * 0.5); p.armRZ = 2.0 - s * 0.5;
    p.armLX = s * 0.5; p.armRX = -s * 0.5;
    p.elbowL = p.elbowR = -0.4;
    p.legLX = s * 0.6; p.legRX = -s * 0.6;
    p.kneeL = max(0, s) * 1.1; p.kneeR = max(0, -s) * 1.1;
    p.y = abs(s) * 0.08;
    p.headRY = sin(t * 9) * 0.4; p.torsoRX = -0.05;
  },
  taunt(t, p) {
    p.torsoRX = -0.12;
    p.armLX = p.armRX = -0.9; p.armLZ = -0.3; p.armRZ = 0.3;
    p.elbowL = p.elbowR = -0.6 - max(0, sin(t * 8)) * 1.0;
    p.headRZ = sin(t * 4) * 0.12; p.hipsRZ = sin(t * 4) * 0.05;
  },
  sleep(t, p) {
    const b = sin(t * 1.6);
    p.headRX = 0.45 + b * 0.05; p.headRZ = 0.18;
    p.torsoRX = 0.1 + b * 0.03;
    p.armLZ = -0.04; p.armRZ = 0.04; p.armLX = p.armRX = 0.05;
    p.elbowL = p.elbowR = -0.05;
    p.sy = 1 + b * 0.02; p.hipsRZ = sin(t * 0.8) * 0.03;
  },
  dizzy(t, p) {
    const a = t * 5;
    p.headRZ = sin(a) * 0.22; p.headRX = cos(a) * 0.12;
    p.torsoRZ = sin(a + 1) * 0.1; p.hipsRZ = sin(a * 0.5) * 0.08;
    p.armLZ = -(0.6 + sin(a) * 0.3); p.armRZ = 0.6 + cos(a) * 0.3;
    p.elbowL = p.elbowR = -0.3;
    p.legLZ = sin(a * 0.5) * 0.12; p.legRZ = sin(a * 0.5) * 0.12;
  },
  salute(t, p) {
    p.armRZ = 1.85; p.armRX = -0.35; p.elbowRZ = -2.0; p.elbowR = -0.2;
    p.armLZ = -0.03; p.elbowL = 0;
    p.headRX = -0.05; p.torsoRX = -0.04; p.sy = 1.02;
  },
  flex(t, p) {
    const pump = max(0, sin(t * 5)) * 0.15;
    p.armLZ = -1.45; p.armRZ = 1.45; p.armLX = p.armRX = -0.2;
    p.elbowLZ = -1.5 - pump; p.elbowRZ = 1.5 + pump;
    p.hl = p.hr = 'fist';
    p.torsoRX = -0.06; p.headRY = sin(t * 2) * 0.3;
    p.sy = 1.02 + pump * 0.1;
  },
  facepalm2(t, p) {
    p.armLX = p.armRX = -1.3; p.armLZ = -0.7; p.armRZ = 0.7;
    p.elbowL = p.elbowR = -1.9;
    p.headRX = 0.35; p.sy = 0.97; p.headRZ = sin(t * 2) * 0.06;
  },
  cry(t, p) {
    const s = sin(t * 20);
    p.armLX = p.armRX = -1.25; p.armLZ = -0.6; p.armRZ = 0.6;
    p.elbowL = p.elbowR = -2.0;
    p.hl = p.hr = 'fist';
    p.headRX = 0.15 + s * 0.02; p.sy = 0.98 + s * 0.01; p.y = abs(s) * 0.01;
  },
  love(t, p) {
    p.armLX = p.armRX = -1.0; p.armLZ = 0.4; p.armRZ = -0.4;
    p.elbowL = p.elbowR = -1.5;
    p.torsoRZ = sin(t * 2.5) * 0.1; p.headRZ = sin(t * 2.5) * 0.15; p.hipsRZ = -sin(t * 2.5) * 0.04;
    p.y = abs(sin(t * 5)) * 0.02;
  },
  stomp(t, p) {
    const s = sin(t * 12);
    p.legLX = -max(0, s) * 0.6; p.kneeL = max(0, s) * 1.0;
    p.legRX = -max(0, -s) * 0.6; p.kneeR = max(0, -s) * 1.0;
    p.armLZ = -0.5; p.armRZ = 0.5; p.armLX = p.armRX = 0.15 + abs(s) * 0.1;
    p.elbowL = p.elbowR = -0.7; p.hl = p.hr = 'fist';
    p.y = abs(s) * 0.05; p.headRX = 0.12; p.torsoRX = 0.1;
  },
  yawn(t, p) {
    const u = min(1, t / 0.8);
    p.armLZ = -2.2 * u; p.armRZ = 2.2 * u;
    p.elbowL = p.elbowR = -0.8 * u; p.hl = p.hr = 'fist';
    p.headRX = -0.3 * u; p.torsoRX = -0.1 * u; p.sy = 1 + 0.04 * u;
  },
  lookAround(t, p) {
    POSES.idle(t, p);
    p.headRY = sin(t * 1.6) * 0.6; p.headRX = -0.05; p.torsoRY = sin(t * 1.6) * 0.12;
    p.lookX = sin(t * 1.6) * 1.4; p.lookOn = 1;
  },
  scratchHead(t, p) {
    POSES.idle(t, p);
    p.armRZ = 2.0; p.armRX = -0.3; p.elbowRZ = -1.9 + sin(t * 18) * 0.12; p.elbowR = -0.2;
    p.headRZ = -0.15; p.headRX = 0.05;
  },
  bow(t, p) {
    const u = min(1, t / 0.4);
    p.torsoRX = 0.55 * u; p.headRX = 0.2 * u;
    p.armLZ = -0.05; p.armRX = -0.6 * u; p.elbowRZ = -1.4 * u; p.armRZ = 0.3;
  },
  peace(t, p) {
    p.armRZ = 1.7; p.armRX = -0.4; p.elbowRZ = -1.3; p.hr = 'peace';
    handOnHipL(p);
    p.headRZ = 0.15; p.y = abs(sin(t * 4)) * 0.03;
  },
  crossArms(t, p) {
    POSES.idle(t, p);
    p.armLX = -0.3; p.armRX = -0.35;
    p.armLZ = -0.05; p.armRZ = 0.05;
    p.armLY = 0.75; p.armRY = -0.75;
    p.elbowL = -1.45; p.elbowR = -1.6;
    p.hl = p.hr = 'fist';
    p.headRX = -0.06; p.torsoRX = -0.04;
  },
  tapFoot(t, p) {
    POSES.crossArms(t, p);
    p.legRX = -0.18 - max(0, sin(t * 10)) * 0.12;
    p.headRZ = 0.1 + sin(t * 10) * 0.02;
  },
  stretch(t, p) {
    p.armLZ = -2.5; p.armRZ = 2.5; p.elbowL = p.elbowR = -0.4;
    p.hl = p.hr = 'fist';
    p.torsoRZ = sin(t * 1.5) * 0.2; p.headRZ = sin(t * 1.5) * 0.15;
    p.sy = 1.03;
  },
  whistle(t, p) {
    POSES.idle(t, p);
    p.armLX = p.armRX = 0.5; p.armLZ = 0.2; p.armRZ = -0.2;
    p.elbowL = p.elbowR = -0.6;
    p.headRZ = sin(t * 2) * 0.1; p.y = abs(sin(t * 4)) * 0.02;
  },
  waveBoth(t, p) {
    POSES.idle(t, p);
    p.armLZ = -2.3; p.armRZ = 2.3; p.armLX = p.armRX = -0.15;
    p.elbowLZ = sin(t * 10) * 0.45; p.elbowRZ = -sin(t * 10) * 0.45;
    p.y = abs(sin(t * 5)) * 0.04;
  },
};

// seated variants of reaction poses: legs stay on the seat
POSES.sitLaugh = (t, p) => seatWrap(POSES.laugh, t, p);
POSES.sitClap = (t, p) => seatWrap(POSES.clap, t, p);
POSES.sitThumbsUp = (t, p) => seatWrap(POSES.thumbsUp, t, p);
POSES.sitPanic = (t, p) => seatWrap(POSES.panic, t, p);
POSES.sitAngry = (t, p) => seatWrap(POSES.angry, t, p);
POSES.sitSleep = (t, p) => seatWrap(POSES.sleep, t, p);
POSES.sitThink = (t, p) => seatWrap(POSES.think, t, p);
POSES.sitWave = (t, p) => seatWrap(POSES.wave, t, p);
POSES.sitFacepalm = (t, p) => seatWrap(POSES.facepalm, t, p);
POSES.sitFlex = (t, p) => seatWrap(POSES.flex, t, p);

const _seat = newPose();
const SEAT_KEYS = ['legLX', 'legRX', 'legLZ', 'legRZ', 'kneeL', 'kneeR', 'hipsRY'];
function seatWrap(fn, t, p, k, d) {
  fn(t, p, k, d);
  resetPose(_seat);
  POSES.sit(t, _seat);
  for (const key of SEAT_KEYS) p[key] = _seat[key];
  p.y = _seat.y + max(0, p.y) * 0.45;
  p.torsoRX = min(p.torsoRX, 0.4);
}

// shop counter poses (the shady seller): lean on the counter drumming the fingers while glancing
// around, flash the coat open, lean in to whisper
POSES.counterTap = (t, p) => {
  const s = sin(t * 15);
  p.torsoRX = 0.14; p.headRX = -0.04;
  p.armLX = p.armRX = -0.78; p.armLZ = -0.22; p.armRZ = 0.22;
  p.elbowL = -0.85; p.elbowR = -0.85 + max(0, s) * 0.12;
  p.hl = 'open'; p.hr = s > 0.2 ? 'point' : 'open';
  const g = sin(t * 0.8) + sin(t * 2.1) * 0.35;
  p.headRY = g * 0.32; p.lookX = g * 1.2; p.lookOn = 1;
  p.sy = 1 + sin(t * 2.2) * 0.01;
};
POSES.coatOpen = (t, p) => {
  const b = sin(t * 3);
  p.armLZ = -1.05; p.armRZ = 1.05; p.armLX = p.armRX = -0.3;
  p.elbowL = p.elbowR = -0.45; p.elbowLZ = 0.55; p.elbowRZ = -0.55;
  p.hl = p.hr = 'fist';
  p.torsoRX = -0.1; p.headRX = -0.06; p.headRZ = b * 0.05;
  p.y = abs(b) * 0.02;
};
POSES.pushShades = (t, p) => {
  POSES.counterTap(t, p);
  p.armRX = -1.25; p.armRZ = 0.62; p.elbowR = -1.95; p.hr = 'point'; p.headRX = 0.08;
};
POSES.whisper = (t, p) => {
  p.torsoRX = 0.3; p.headRX = 0.06; p.headRZ = -0.08;
  p.armRX = -1.35; p.armRZ = 0.55; p.elbowR = -1.95; p.hr = 'open';
  p.armLX = -0.8; p.armLZ = -0.2; p.elbowL = -0.8; p.hl = 'open';
  p.lookX = sin(t * 2.6) * 1.2; p.lookOn = 1;
};
const ONE_SHOT = { throw: 0.5, kick: 0.6, flick: 0.5, hit: 0.3, shocked: 0.7, jump: 0.75 };
const LEGACY = new Set(['idle', 'walk', 'run', 'talk', 'cheer', 'dance', 'throw', 'kick', 'point', 'present', 'holdUp', 'sit', 'sitCheer', 'sitWorried', 'shocked', 'hit', 'sad', 'angry', 'facepalm', 'wave', 'flick', 'shake', 'bellyflop', 'victory']);
// poses that make no sense while seated (react() won't seat-wrap them)
const STAND_ONLY = new Set(['walk', 'run', 'kick', 'bellyflop', 'jump', 'celebrate', 'stomp', 'tapFoot', 'bow']);

export const POSE_NAMES = Object.keys(POSES);

// ---------------------------------------------------------------------------
// Moods (face presets) and reactions (pose + mood + emote)

export const MOODS = {
  neutral: { eyes: 'normal', mouth: 'smile' },
  happy: { eyes: 'happy', mouth: 'grin' },
  excited: { eyes: 'star', mouth: 'beam', fx: ['shine', 'blush'], emote: 'sparkle' },
  laugh: { eyes: 'squint', mouth: 'laugh', fx: ['blush'] },
  love: { eyes: 'heart', mouth: 'smileSmall', fx: ['blush'], emote: 'heart' },
  angry: { eyes: 'angry', mouth: 'teeth', fx: ['vein'], emote: 'anger' },
  rage: { eyes: 'fire', mouth: 'shout', fx: ['vein'], emote: 'anger' },
  shock: { eyes: 'shock', mouth: 'gasp', emote: '!' },
  surprised: { eyes: 'wide', mouth: 'o', emote: '!' },
  scared: { eyes: 'worried', mouth: 'wobble', fx: ['sweat', 'gloom'] },
  nervous: { eyes: 'worried', mouth: 'grimace', fx: ['sweat'], emote: 'sweat' },
  panic: { eyes: 'shock', mouth: 'scream', fx: ['sweat'], emote: '!!' },
  sad: { eyes: 'sad', mouth: 'frown' },
  cry: { eyes: 'cry', mouth: 'sad', fx: ['tears'] },
  think: { eyes: 'think', mouth: 'pout', emote: '?' },
  confused: { eyes: 'side', mouth: 'wobble', emote: '?' },
  idea: { eyes: 'wide', mouth: 'o', emote: 'idea' },
  smug: { eyes: 'smug', mouth: 'smirk' },
  tease: { eyes: 'wink', mouth: 'tongue' },
  cool: { eyes: 'determined', mouth: 'smirk', fx: ['shine'] },
  proud: { eyes: 'determined', mouth: 'grin', fx: ['shine'] },
  confident: { eyes: 'wink', mouth: 'grin', emote: 'sparkle' },
  sleepy: { eyes: 'closed', mouth: 'o', emote: 'zzz' },
  tired: { eyes: 'tired', mouth: 'flat' },
  dizzy: { eyes: 'dizzy', mouth: 'wobble', emote: 'star' },
  ko: { eyes: 'x', mouth: 'open', emote: 'star' },
  rich: { eyes: 'money', mouth: 'grin', emote: 'cash' },
  determined: { eyes: 'determined', mouth: 'grin' },
  focus: { eyes: 'focus', mouth: 'flat' },
  annoyed: { eyes: 'closed', mouth: 'flat', fx: ['gloom'] },
  despair: { eyes: 'closed', mouth: 'wobble', fx: ['gloom', 'sweat'] },
  hurt: { eyes: 'squint', mouth: 'grimace' },
  embarrassed: { eyes: 'happy', mouth: 'wobble', fx: ['blush', 'sweat'] },
  whistle: { eyes: 'closed', mouth: 'whistle', emote: 'note' },
  yum: { eyes: 'happy', mouth: 'tongue' },
  shrug: { eyes: 'side', mouth: 'flat' },
  teary: { eyes: 'teary', mouth: 'wobble' },
  yawn: { eyes: 'closed', mouth: 'yawn' },
};

export const REACTIONS = {
  laugh: { anim: 'laugh', mood: 'laugh', dur: 1.6 },
  celebrate: { anim: 'celebrate', mood: 'excited', dur: 1.8 },
  jump: { anim: 'jump', mood: 'happy', dur: 0.75 },
  fistPump: { anim: 'fistPump', mood: 'determined', dur: 1.4 },
  thumbsUp: { anim: 'thumbsUp', mood: 'confident', dur: 1.4 },
  clap: { anim: 'clap', mood: 'happy', dur: 1.5 },
  nervous: { anim: 'nervous', mood: 'nervous', dur: 2 },
  think: { anim: 'think', mood: 'think', dur: 2 },
  idea: { anim: 'idea', mood: 'idea', dur: 1.4 },
  shrug: { anim: 'shrug', mood: 'shrug', dur: 1.3 },
  panic: { anim: 'panic', mood: 'panic', dur: 1.6 },
  taunt: { anim: 'taunt', mood: 'tease', dur: 1.6 },
  sleep: { anim: 'sleep', mood: 'sleepy', dur: 3 },
  dizzy: { anim: 'dizzy', mood: 'dizzy', dur: 2 },
  salute: { anim: 'salute', mood: 'determined', dur: 1.4 },
  flex: { anim: 'flex', mood: 'proud', dur: 1.6 },
  facepalm: { anim: 'facepalm', mood: 'annoyed', dur: 1.6 },
  facepalm2: { anim: 'facepalm2', mood: 'despair', dur: 1.6 },
  cry: { anim: 'cry', mood: 'cry', dur: 2 },
  love: { anim: 'love', mood: 'love', dur: 1.8 },
  angry: { anim: 'angry', mood: 'angry', dur: 1.4 },
  rage: { anim: 'stomp', mood: 'rage', dur: 1.4 },
  shock: { anim: 'shocked', mood: 'shock', dur: 0.9 },
  surprised: { anim: 'shocked', mood: 'surprised', dur: 0.8 },
  hurt: { anim: 'hit', mood: 'hurt', dur: 0.5 },
  ko: { anim: 'dizzy', mood: 'ko', dur: 1.8 },
  victory: { anim: 'victory', mood: 'proud', dur: 2 },
  cheer: { anim: 'cheer', mood: 'happy', dur: 1.4 },
  wave: { anim: 'wave', mood: 'happy', dur: 1.4 },
  yawn: { anim: 'yawn', mood: 'yawn', dur: 1.4 },
  lookAround: { anim: 'lookAround', mood: 'neutral', dur: 2.4 },
  scratchHead: { anim: 'scratchHead', mood: 'confused', dur: 1.6 },
  bow: { anim: 'bow', mood: 'happy', dur: 1.2 },
  peace: { anim: 'peace', mood: 'confident', dur: 1.5 },
  crossArms: { anim: 'crossArms', mood: 'smug', dur: 2 },
  tapFoot: { anim: 'tapFoot', mood: 'annoyed', dur: 2 },
  whistle: { anim: 'whistle', mood: 'whistle', dur: 2 },
  rich: { anim: 'holdUp', mood: 'rich', dur: 1.6 },
  sad: { anim: 'sad', mood: 'sad', dur: 2 },
  embarrassed: { anim: 'nervous', mood: 'embarrassed', dur: 1.6 },
  smug: { anim: 'crossArms', mood: 'smug', dur: 1.6 },
  stretch: { anim: 'stretch', mood: 'tired', dur: 1.6 },
  dance: { anim: 'dance', mood: 'happy', dur: 2.4 },
};
export const REACTION_NAMES = Object.keys(REACTIONS);

// default faces for the new poses (legacy poses never touch the face)
const POSE_MOOD = {};
for (const r of Object.values(REACTIONS)) if (!LEGACY.has(r.anim) && !POSE_MOOD[r.anim]) POSE_MOOD[r.anim] = r.mood;
POSE_MOOD.stomp = 'rage';
POSE_MOOD.waveBoth = 'happy';

// ---------------------------------------------------------------------------
// Idle fidgets (layered over idle / sit). fn(u 0..1, p, t, chibi)

const FIDGETS = {
  glance(u, p) { const s = u < 0.5 ? 1 : -1; p.headRY = 0.45 * s; p.lookX = 1.4 * s; p.lookOn = 1; },
  lookAround(u, p) { p.headRY = sin(u * Math.PI * 2) * 0.55; p.lookX = sin(u * Math.PI * 2) * 1.4; p.lookOn = 1; p.headRX = -0.05; },
  scratch(u, p, t) { p.armRZ = 2.0; p.armRX = -0.3; p.elbowRZ = -1.9 + sin(t * 18) * 0.12; p.elbowR = -0.2; p.headRZ = -0.15; },
  stretch(u, p) { p.armLZ = -2.4; p.armRZ = 2.4; p.elbowL = p.elbowR = -0.5; p.hl = p.hr = 'fist'; p.headRX = -0.2; p.sy = 1.04; },
  checkWatch(u, p) { p.armLX = -1.15; p.armLZ = 0.3; p.elbowL = -1.35; p.armLY = 0.5; p.headRX = 0.28; p.headRY = -0.25; p.lookY = 1; p.lookX = -0.6; p.lookOn = 1; },
  adjustGlasses(u, p) { p.armRX = -1.3; p.armRZ = 0.6; p.elbowR = -1.9; p.hr = 'point'; p.headRX = 0.06; },
  hop(u, p) { p.y = abs(sin(u * Math.PI * 2)) * 0.1; p.kneeL = p.kneeR = 0.2; },
  tap(u, p, t) { p.legRX = -0.18 - max(0, sin(t * 10)) * 0.12; p.armLZ = -0.8; p.elbowLZ = 1.9; p.elbowL = 0; p.hl = 'fist'; },
  wave(u, p, t) { p.armRZ = 2.3; p.armRX = -0.15; p.elbowRZ = sin(t * 10) * 0.45; },
  swing(u, p, t) { p.kneeL = 0.15 + max(0, sin(t * 7)) * 0.25; p.kneeR = 0.15 + max(0, -sin(t * 7)) * 0.25; },
  yawn(u, p) { const k = sin(u * Math.PI); p.armLZ = -2.1 * k; p.armRZ = 2.1 * k; p.elbowL = p.elbowR = -0.8 * k; p.hl = p.hr = 'fist'; p.headRX = -0.3 * k; },
};
const STAND_FIDGETS = ['glance', 'lookAround', 'scratch', 'stretch', 'hop', 'tap', 'glance', 'yawn'];
const SIT_FIDGETS = ['glance', 'lookAround', 'swing', 'stretch', 'wave', 'swing'];
const FIDGET_FACE = { yawn: ['closed', 'yawn'], scratch: ['side', 'wobble'], tap: ['side', 'flat'], stretch: ['closed', 'o'], hop: ['happy', 'grin'], wave: ['happy', 'grin'] };

// ---------------------------------------------------------------------------

export class Chibi {
  constructor(def, opts = {}) {
    syncEnv();
    this.def = def;
    const s = opts.scale ?? 1;
    this.root = new THREE.Group();
    this.root.name = 'chibi:' + (def.id ?? def.name ?? '');
    this.inner = new THREE.Group(); // scaled container (squash & stretch)
    this.root.add(this.inner);
    this.inner.scale.setScalar(s);
    this.baseScale = s;
    this.meshes = [];
    this.metalMeshes = [];
    const V = VOX;

    // normalised copy of the def (accessories resolved), used for geometry keys
    const d = { ...def };
    d._acc = normalizeAcc(def);
    this.acc = d._acc;
    this.d = d;
    const ck = JSON.stringify(d);
    const add = (parent, part) => {
      if (!part) return null;
      let main = null;
      if (part.g) { main = makeMesh(part.g, PAIR); parent.add(main); this.meshes.push(main); }
      if (part.m) { const m = makeMesh(part.m, METAL_PAIR); parent.add(m); this.metalMeshes.push(m); }
      return main;
    };

    this.hips = new THREE.Group();
    this.hips.position.y = LEG_H * V;
    this.inner.add(this.hips);

    // legs (thigh + knee + shin/shoe)
    const thigh = cached('thigh|' + ck, () => buildThigh(d));
    const shin = cached('shin|' + ck, () => buildShin(d));
    const leg = (x) => {
      const L = new THREE.Group(); L.position.set(x, 0, 0);
      add(L, thigh);
      const knee = new THREE.Group(); knee.position.y = -4 * H; L.add(knee);
      add(knee, shin);
      this.hips.add(L);
      return [L, knee];
    };
    [this.legL, this.kneeL] = leg(-3 * H);
    [this.legR, this.kneeR] = leg(3 * H);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.bodyMesh = add(this.torso, cached('body|' + ck, () => buildBody(d)));
    // coat tails
    const tail = cached('tail|' + ck, () => buildTail(d));
    if (tail) {
      this.tail = new THREE.Group();
      this.tail.position.y = 1.5 * H;
      this.torso.add(this.tail);
      const m = add(this.tail, tail);
      if (m) m.position.y = -1.5 * H;
    }
    // cape
    const capeA = this.acc.find((a) => a.type === 'cape');
    if (capeA) {
      this.cape = new THREE.Group();
      const hasPack = this.acc.some((a) => a.type === 'backpack');
      this.cape.position.set(0, 9.5 * H, (hasPack ? -11 : -5) * H);
      this.torso.add(this.cape);
      add(this.cape, cached('cape|' + ck, () => buildCape(d, capeA)));
    }

    // arms: shoulder -> elbow -> wrist
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * 8 * H, (BODY_H - 0.5) * V, 0);
      add(sh, cached('upper' + side + '|' + ck, () => buildUpperArm(d, side)));
      const el = new THREE.Group(); el.position.y = -4 * H; sh.add(el);
      add(el, cached('fore' + side + '|' + ck, () => buildForearm(d, side)));
      const hand = new THREE.Group(); hand.position.y = -4 * H; el.add(hand);
      this.torso.add(sh);
      return [sh, el, hand];
    };
    [this.armL, this.elbowL, this.handL] = arm(-1);
    [this.armR, this.elbowR, this.handR] = arm(1);
    this.handItems = { L: handItem(this.acc, 'L'), R: handItem(this.acc, 'R') };
    this.handMesh = { L: null, R: null };
    this.handMetal = { L: null, R: null };
    this.handShape = { L: null, R: null };
    this.setHand('L', 'open');
    this.setHand('R', 'open');

    // head
    this.head = new THREE.Group();
    this.head.position.y = BODY_H * V;
    this.torso.add(this.head);
    const headPart = cached('head|' + ck, () => buildHead(d));
    this.headMesh = add(this.head, headPart);
    this.headTopY = Math.max((HEAD_H + 2) * V, (headPart?.g?.boundingBox?.max.y ?? 1) + 0.12);

    const hairC = def.hair?.color ?? 0x3a2a20;
    const browColor = def.brow ?? (def.hair?.style === 'bald' ? 0x5a3a2a : shade(hairC, -0.38));
    // stubble shadow: def.stubble (true = from the beard/hair colour, or a hex colour)
    const stubC = def.stubble ? (typeof def.stubble === 'number' ? def.stubble : typeof def.beard === 'number' ? def.beard : hairC) : null;
    const stubble = stubC != null ? `rgba(${(stubC >> 16) & 255},${(stubC >> 8) & 255},${stubC & 255},0.3)` : null;
    // blush only by default for lash (feminine) faces; hero faces stay clean
    this.face = new PixelFace({ eyeColor: def.eyeColor, blush: def.blush ?? !!def.lashes, browColor, lashes: def.lashes, freckles: def.freckles, stubble });
    const faceMat = new THREE.MeshStandardMaterial({ map: this.face.texture, transparent: true, alphaTest: 0.05, roughness: 0.6, metalness: 0, envMapIntensity: 0.4, envMap: CHAR_MAT.envMap });
    const plane = new THREE.Mesh(PLANE_GEO, faceMat);
    plane.position.set(0, (HEAD_H / 2) * V, 0.5 + 0.004);
    this.head.add(plane);
    this.facePlane = plane;
    // a sealed helmet (tinted visor) hides the face completely: no eyes / mouth anywhere
    this.faceHidden = this.acc.some((a) => a.type === 'helmet' && a.visor === 'sealed');
    if (this.faceHidden) plane.visible = false;

    // emote anchor above the head (top right)
    this.emoteAnchor = new THREE.Group();
    this.emoteAnchor.position.set(0.5, this.headTopY + 0.05, 0.1);
    this.head.add(this.emoteAnchor);
    this._emote = null;

    this.anim = 'idle';
    this.animT = 0;
    this.animDur = 0;
    this.after = 'idle';
    this.loopAnim = 'idle';
    this.seatedPlay = false;
    this.pose = newPose();
    this._tgt = newPose();
    this._fid = newPose();
    this.speed = 1;
    this.flashT = 0;
    this.squash = 0; // impulse for squash/stretch
    this.squashV = 0;
    this.height = (LEG_H + BODY_H + HEAD_H) * V * s;
    // secondary motion state
    this.fidgets = opts.fidget !== false;
    this.fidgetT = rand(3.5, 8);
    this.fidget = null;
    this.headJ = 0; this.headJV = 0;
    this.prevY = 0; this.prevVY = 0; this.air = false;
    this.tailA = 0.08; this.tailV = 0;
    this.capeA = 0.15; this.capeV = 0;
    this.px = 0; this.pz = 0; this.speedXZ = 0;
    this.moodPose = null;
    this.t = Math.random() * 10;
  }

  // ------------------------------------------------------------------ hands
  setHand(side, shape) {
    if (this.handShape[side] === shape) return;
    this.handShape[side] = shape;
    const s = side === 'L' ? -1 : 1;
    const item = this.handItems[side];
    const d = this.d;
    const key = `hand|${shape}|${side}|${d.gloves ?? d.skin}|${item ? JSON.stringify(item) : ''}`;
    const part = cached(key, () => buildHand(d, shape, s, item));
    const grp = side === 'L' ? this.handL : this.handR;
    if (part?.g) {
      if (!this.handMesh[side]) { this.handMesh[side] = makeMesh(part.g, PAIR); grp.add(this.handMesh[side]); this.meshes.push(this.handMesh[side]); }
      else this.handMesh[side].geometry = part.g;
    }
    if (part?.m) {
      if (!this.handMetal[side]) { this.handMetal[side] = makeMesh(part.m, METAL_PAIR); grp.add(this.handMetal[side]); this.metalMeshes.push(this.handMetal[side]); }
      else { this.handMetal[side].geometry = part.m; this.handMetal[side].visible = true; }
    } else if (this.handMetal[side]) this.handMetal[side].visible = false;
  }

  // ------------------------------------------------------------------ animation API
  play(name, opts = {}) {
    if (!POSES[name]) name = 'idle';
    if (this.anim === name && !opts.restart && !ONE_SHOT[name] && !opts.dur) return this;
    this.anim = name;
    this.animT = 0;
    this.animDur = opts.dur ?? ONE_SHOT[name] ?? 0;
    this.after = opts.then ?? (this.animDur ? this.loopAnim ?? 'idle' : name);
    if (!ONE_SHOT[name] && !opts.dur) this.loopAnim = name;
    this.seatedPlay = !!opts.seated;
    this.fidget = null;
    // leaving a pose that brought its own face: return to the base expression
    if (this.moodPose && this.moodPose !== name) this.endPoseMood();
    // new expressive poses bring their own face (callers can still override with expr())
    if (opts.face !== false && POSE_MOOD[name] && !LEGACY.has(name)) {
      this.mood(POSE_MOOD[name], this.animDur || 1e6);
      this.moodPose = name;
    }
    return this;
  }
  endPoseMood() {
    if (this.face.holdT > 0) this.face.holdT = 0.001;
    this.face.clearFx();
    if (this._emote && this._emote.dur === 0) this._emote.hide();
    this.moodPose = null;
  }
  setLoop(name) {
    this.loopAnim = name;
    if (!ONE_SHOT[this.anim] && !this.animDur) this.play(name);
  }
  /** True while the character rests on a seat (sit loops). */
  get seated() {
    return (this.loopAnim ?? '').startsWith('sit') || this.anim.startsWith('sit');
  }
  expr(eyes, mouth, hold = 0) {
    this.face.set(eyes, mouth, hold);
    if (!hold) this.face.clearFx();
    return this;
  }
  /** Face preset (see MOODS): eyes + mouth + overlays + emote. hold>0 reverts after hold s. */
  mood(name, hold = 0) {
    const m = MOODS[name];
    if (!m) return this;
    this.face.set(m.eyes, m.mouth, hold);
    this.face.clearFx();
    for (const f of m.fx ?? []) this.face.fx(f, true, hold);
    if (m.emote) this.emote(m.emote, hold > 0 && hold < 100 ? Math.max(1, hold) : m.emote === 'zzz' ? 0 : 2);
    return this;
  }
  /** Pop a voxel emote over the head ('!', '?', 'heart', 'anger', 'sweat', 'zzz', 'note', 'idea', 'star', 'cash', 'sparkle', 'skull', '!!'). */
  emote(name, dur = 1.6) {
    if (!this._emote) this._emote = new Emote(this.emoteAnchor);
    this._emote.show(name, dur);
    return this;
  }
  /** Full reaction: pose (seated variant when sitting) + mood + emote. */
  react(name, opts = {}) {
    const r = REACTIONS[name];
    if (!r) return this;
    const dur = opts.dur ?? r.dur;
    const seated = opts.seated ?? (this.seated && !STAND_ONLY.has(r.anim));
    const then = opts.then ?? (seated ? (this.loopAnim?.startsWith('sit') ? this.loopAnim : 'sit') : this.loopAnim ?? 'idle');
    this.play(r.anim, { restart: true, dur, then, seated, face: false });
    this.mood(r.mood, dur);
    if (opts.boing !== false) this.boing(0.18);
    return this;
  }
  look(x, y = 0, hold = 1.5) {
    this.face.look(x, y, hold);
    return this;
  }
  talk(on) {
    this.face.talk(on);
  }
  /** Bouncy squash impulse (positive = stretch tall). */
  boing(amount = 0.25) {
    this.squashV += amount * 14;
  }
  flash(sec = 0.08) {
    this.flashT = sec;
  }
  /** Jump straight to the current pose (thumbnails / portraits). */
  snap() {
    this._snap = true;
    this.update(0);
    return this;
  }

  // ------------------------------------------------------------------ frame update
  update(dt) {
    this.t += dt;
    this.animT += dt * this.speed;
    if (this.animDur && this.animT >= this.animDur) {
      const next = this.after || 'idle';
      this.anim = next;
      this.animT = 0;
      this.animDur = 0;
      this.seatedPlay = false;
      if (this.moodPose) this.endPoseMood();
    }
    const target = resetPose(this._tgt);
    const fn = POSES[this.anim];
    if (this.seatedPlay && !this.anim.startsWith('sit')) seatWrap(fn, this.animT, target, 1, this.animDur);
    else fn(this.animT, target, 1, this.animDur);

    // talking while idle / seated: little nods
    if (this.face.talking && (this.anim === 'idle' || this.anim === 'sit')) {
      target.headRX += sin(this.t * 7.5) * 0.045;
      target.headRZ += sin(this.t * 3.1) * 0.05;
    }
    // idle fidgets
    this.updateFidget(dt, target);
    // head follows the pupils a little
    target.headRY += (this.face.lx ?? 0) * 0.05;

    const p = this.pose;
    if (this._snap || dt <= 0) {
      for (const key of KEYS) p[key] = target[key];
      this._snap = false;
    } else {
      const k = 16;
      for (const key of KEYS) p[key] = damp(p[key], target[key], k, dt);
    }
    if (target.hl !== this.handShape.L) this.setHand('L', target.hl);
    if (target.hr !== this.handShape.R) this.setHand('R', target.hr);
    if (target.lookOn) this.face.look(target.lookX, target.lookY, 0.3);

    // spring for squash/stretch
    // (sub-stepped semi-implicit Euler: stable at any frame rate, even with long hitches)
    const nSub = dt > 0 ? Math.min(30, Math.ceil(Math.min(dt, 0.25) / SPRING_STEP)) : 0, hSub = nSub ? Math.min(dt, 0.25) / nSub : 0;
    for (let i = 0; i < nSub; i++) {
      this.squashV += (-this.squash * 180 - this.squashV * 12) * hSub;
      this.squash += this.squashV * hSub;
    }
    if (!Number.isFinite(this.squash) || Math.abs(this.squash) > 0.6) { this.squash = Number.isFinite(this.squash) ? Math.sign(this.squash) * 0.6 : 0; this.squashV = 0; }
    const sq = this.squash;

    // vertical velocity -> landing squash + head jiggle
    if (dt > 0) {
      const vy = (p.y - this.prevY) / dt;
      if (p.y > 0.06) this.air = true;
      if (this.air && p.y < 0.03 && this.prevVY < -0.6) { this.boing(-0.12); this.air = false; }
      const acc = Math.max(-40, Math.min(40, (vy - this.prevVY) / dt));
      for (let i = 0; i < nSub; i++) {
        this.headJV += (-this.headJ * 260 - this.headJV * 14 - acc * 0.06) * hSub;
        this.headJ += this.headJV * hSub;
      }
      if (!Number.isFinite(this.headJ)) { this.headJ = 0; this.headJV = 0; }
      this.headJ = Math.max(-0.08, Math.min(0.08, this.headJ));
      this.prevY = p.y; this.prevVY = vy;
      // horizontal speed (for tails / capes)
      const rp = this.root.position;
      const sp = Math.hypot(rp.x - this.px, rp.z - this.pz) / dt;
      this.px = rp.x; this.pz = rp.z;
      this.speedXZ += (Math.min(sp, 8) - this.speedXZ) * Math.min(1, dt * 6);
    }

    this.inner.position.y = p.y;
    this.inner.scale.set(
      this.baseScale * p.sx * (1 - sq * 0.5),
      this.baseScale * p.sy * (1 + sq),
      this.baseScale * p.sx * (1 - sq * 0.5),
    );
    this.hips.rotation.set(0, p.hipsRY, p.hipsRZ);
    this.torso.rotation.set(p.torsoRX, p.torsoRY, p.torsoRZ);
    this.head.rotation.set(p.headRX, p.headRY, p.headRZ);
    const hj = this.headJ;
    this.head.scale.set(1 - hj * 0.5, 1 + hj, 1 - hj * 0.5);
    this.armL.rotation.set(p.armLX, p.armLY, p.armLZ);
    this.armR.rotation.set(p.armRX, p.armRY, p.armRZ);
    this.elbowL.rotation.set(p.elbowL, 0, p.elbowLZ);
    this.elbowR.rotation.set(p.elbowR, 0, p.elbowRZ);
    this.legL.rotation.set(p.legLX, 0, p.legLZ);
    this.legR.rotation.set(p.legRX, 0, p.legRZ);
    this.kneeL.rotation.x = p.kneeL;
    this.kneeR.rotation.x = p.kneeR;

    // coat tails and cape swing (springs driven by lean, legs, speed and bounce)
    if (this.tail || this.cape) {
      const sitting = p.y < -0.2;
      const legSwing = Math.max(abs(p.legLX), abs(p.legRX));
      const lift = this.speedXZ * 0.08 + legSwing * 0.25 + Math.max(0, -this.prevVY) * 0.25;
      if (this.tail) {
        const tt = (sitting ? 1.25 : 0.06 + lift) - p.torsoRX * 0.8;
        for (let i = 0; i < nSub; i++) { this.tailV += ((tt - this.tailA) * 120 - this.tailV * 11) * hSub; this.tailA += this.tailV * hSub; }
        this.tail.rotation.x = this.tailA;
      }
      if (this.cape) {
        const ct = (sitting ? 0.55 : 0.12 + lift * 1.6 + sin(this.t * 6) * 0.04 * (0.3 + lift)) - p.torsoRX * 0.9;
        for (let i = 0; i < nSub; i++) { this.capeV += ((ct - this.capeA) * 80 - this.capeV * 8) * hSub; this.capeA += this.capeV * hSub; }
        this.cape.rotation.x = Math.max(-0.2, this.capeA);
      }
    }

    if (!this.faceHidden) this.face.update(dt);
    this._emote?.update(dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.meshes) m.material = on ? Mats.flashPair : PAIR;
      for (const m of this.metalMeshes) m.material = on ? Mats.flashPair : METAL_PAIR;
    }
  }

  updateFidget(dt, target) {
    const base = this.anim;
    const can = this.fidgets && !this.animDur && (base === 'idle' || base === 'sit') && !this.face.talking;
    if (!can) { this.fidget = null; return; }
    if (!this.fidget) {
      this.fidgetT -= dt;
      if (this.fidgetT > 0) return;
      this.fidgetT = rand(4, 9);
      const pool = base === 'sit' ? SIT_FIDGETS : STAND_FIDGETS.slice();
      if (base !== 'sit') {
        if (this.acc.some((a) => a.type === 'watch')) pool.push('checkWatch', 'checkWatch');
        if (this.acc.some((a) => a.type === 'glasses' || a.type === 'shades')) pool.push('adjustGlasses');
      }
      const name = pool[Math.floor(Math.random() * pool.length)];
      const dur = name === 'glance' ? 1.6 : name === 'lookAround' ? 2.6 : name === 'yawn' ? 1.8 : name === 'swing' || name === 'tap' ? 2.4 : 1.5;
      this.fidget = { name, t: 0, dur };
      const f = FIDGET_FACE[name];
      if (f && this.face.holdT <= 0) this.face.set(f[0], f[1], dur * 0.9);
      if (name === 'yawn' && Math.random() < 0.5) this.emote('zzz', 1.4);
    }
    const fd = this.fidget;
    fd.t += dt;
    const u = fd.t / fd.dur;
    if (u >= 1) { this.fidget = null; return; }
    const w = Math.min(1, u / 0.2, (1 - u) / 0.2);
    const ws = w * w * (3 - 2 * w);
    const f = this._fid;
    for (const k of KEYS) f[k] = target[k];
    f.hl = target.hl; f.hr = target.hr; f.lookOn = target.lookOn;
    FIDGETS[fd.name](u, f, this.t, this);
    for (const k of KEYS) target[k] += (f[k] - target[k]) * ws;
    if (ws > 0.5) { target.hl = f.hl; target.hr = f.hr; }
    if (f.lookOn && ws > 0.3) { target.lookOn = 1; target.lookX = f.lookX; target.lookY = f.lookY; }
  }

  /** World position of the top of the head (for speech bubbles). */
  headTop(out = new THREE.Vector3()) {
    this.head.updateWorldMatrix(true, false);
    return out.set(0, this.headTopY, 0).applyMatrix4(this.head.matrixWorld);
  }
  handWorld(out = new THREE.Vector3(), side = 'R') {
    const h = side === 'R' ? this.handR : this.handL;
    h.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(h.matrixWorld);
  }
}

export const CHIBI_HEIGHT = (LEG_H + BODY_H + HEAD_H) * VOX;
