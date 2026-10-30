// Creature moves for SwarmRig: procedural, physically-motivated attack and ability
// poses (pounce, grab, claw rakes, bites, headbutts, tail whips, stomps, dives,
// spits, recoils) plus held states (crouch, mid-air, pinning, pinned, grabbed, lifted).
//
// A move writes ADDITIVE offsets into one reusable pose record (no allocation per
// frame); SwarmRig.update adds them on top of the gait animation. Every move gracefully
// degrades to the parts a model actually has: quadrupeds rake with their front paws,
// bipeds with their arms, mouth-bodies (bins, slimes) lunge with the whole body.
//
// Conventions (model space, faces +Z): brx > 0 pitches nose-down / leans forward,
// limb rx < 0 swings the paw forward and up, jaw > 0 opens, lid < 0 flips the lid open,
// sq > 0 stretches tall (sq < 0 squashes flat), sz > 0 stretches the body long.
// Attack moves land their blow at a = 0.5 (the sim's wind-up ends there).

export const POSE_KEYS = ['bx', 'by', 'bz', 'brx', 'bry', 'brz', 'roll', 'lie', 'sq', 'sz', 'crouch', 'hrx', 'hry', 'hrz', 'hpy', 'hpz', 'jaw', 'lid', 'alrx', 'alrz', 'arrx', 'arrz', 'flrx', 'flrz', 'frrx', 'frrz', 'blrx', 'brrx', 'llrx', 'lrrx', 'trx', 'tly', 'cannon', 'wing', 'yaw'];
export function newPose() {
  const P = {};
  for (const k of POSE_KEYS) P[k] = 0;
  return P;
}
export function resetPose(P) {
  P.bx = P.by = P.bz = P.brx = P.bry = P.brz = P.roll = P.lie = P.sq = P.sz = P.crouch = 0;
  P.hrx = P.hry = P.hrz = P.hpy = P.hpz = P.jaw = P.lid = 0;
  P.alrx = P.alrz = P.arrx = P.arrz = P.flrx = P.flrz = P.frrx = P.frrz = P.blrx = P.brrx = P.llrx = P.lrrx = 0;
  P.trx = P.tly = P.cannon = P.wing = 0;
  P.yaw = 0; // 1 = this move sets the body yaw outright (spins)
}

const PI2 = Math.PI * 2;
const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const seg = (a, a0, a1) => cl((a - a0) / (a1 - a0));
const sm = (k) => k * k * (3 - 2 * k);
const eo = (k) => 1 - (1 - k) * (1 - k);
const bell = (k) => Math.sin(Math.PI * cl(k));
/** Damped wobble after an impact (0 before t0). */
const wob = (a, t0, f, len) => {
  const k = (a - t0) / len;
  return k <= 0 || k >= 1 ? 0 : Math.sin(k * f * PI2) * (1 - k) * (1 - k);
};

// shared three-beat envelope: wind-up -> strike -> recover
let W = 0, S = 0, R = 0;
function beats(a, w1 = 0.42, s1 = 0.53, r0 = 0.6) {
  W = sm(seg(a, 0, w1));
  S = eo(seg(a, w1, s1));
  R = 1 - sm(seg(a, r0, 1));
}
/** blend: the wind-up pose, then the strike pose, eased home. */
const v = (w, s) => (w * W * (1 - S) + s * S) * R;

/** Paw / arm on side s (+1 right, -1 left) gets rx / rz; legs first for quadrupeds. */
function limb(P, r, s, rx, rz) {
  if (r.has.legF && !r.has.arms) {
    if (s > 0) { P.frrx += rx; P.frrz += rz; } else { P.flrx += rx; P.flrz += rz; }
  } else if (r.has.arms) {
    if (s > 0) { P.arrx += rx; P.arrz += rz; } else { P.alrx += rx; P.alrz += rz; }
  }
}
function flail(P, t, amp = 0.8, f = 24) {
  P.flrx += Math.sin(t * f) * amp; P.frrx += Math.sin(t * f + 2.1) * amp;
  P.blrx += Math.sin(t * f * 0.9 + 1) * amp * 0.8; P.brrx += Math.sin(t * f * 0.9 + 3.2) * amp * 0.8;
  P.llrx += Math.sin(t * f) * amp; P.lrrx += Math.sin(t * f + 2.6) * amp;
  P.alrx += Math.sin(t * f * 0.85 + 0.6) * amp; P.arrx += Math.sin(t * f * 0.85 + 2.4) * amp;
  P.tly += Math.sin(t * f * 0.6) * amp;
}

// ---------------------------------------------------------------- one-shot moves
// (P, a: 0..1 progress, r: the rig; r.mvSide = +1/-1 alternating limb, r.mvAmp = strength)
const MOVES = {
  /** CLAW: rear back with one paw raised high, then rake it down across the target, body twisting into the swipe. */
  claw(P, a, r) {
    beats(a, 0.4, 0.52, 0.6);
    const s = r.mvSide, k = r.mvAmp;
    limb(P, r, s, v(-2.35, -0.15) * k, v(0.6, -0.55) * s);
    limb(P, r, -s, v(-0.25, -0.35), 0); // the other paw braces
    P.bry += v(0.32, -0.42) * s * k;
    P.brz += v(0.07, -0.1) * s;
    P.brx += v(-0.22, 0.2) * k;
    P.bz += v(-0.07, 0.22) * k;
    P.hrx += v(-0.18, 0.28);
    P.hry += v(-0.15, 0.28) * s;
    P.jaw += v(0.25, 0.6);
    P.tly += v(0.55, -0.7) * s;
    P.blrx += v(0.3, -0.12); P.brrx += v(0.3, -0.12);
    P.sq += v(0.06, 0) - 0.14 * bell(seg(a, 0.5, 0.66)) * k;
  },
  /** BITE: head cocks back with the jaw gaping, lunges, snaps shut, then shakes. */
  bite(P, a, r) {
    beats(a, 0.4, 0.5, 0.64);
    const k = r.mvAmp;
    const sh = wob(a, 0.5, 2.6, 0.34) * 0.45 * k;
    if (r.has.head) {
      P.hrx += v(-0.5, 0.32); P.hpz += v(-0.06, 0.2) * k; P.hpy += v(0.04, -0.03);
      P.hry += sh; P.hrz += sh * 0.5;
    } else P.bry += sh * 0.6;
    P.jaw += 1.15 * W * (1 - S) + 0.2 * bell(seg(a, 0.56, 0.76));
    P.lid -= 1.3 * W * (1 - S);
    P.brx += v(-0.14, 0.22) * k; P.bz += v(-0.08, r.has.head ? 0.22 : 0.32) * k;
    P.flrx += v(0.05, -0.32); P.frrx += v(0.05, -0.32);
    P.alrx += v(-0.5, -1.2); P.arrx += v(-0.5, -1.2); // little arms grab at it
    P.tly += sh * 1.4;
    P.sq += v(0.05, -0.06);
  },
  /** CHOMP: a mouth-body squashes down gaping wide, then springs forward and snaps. */
  chomp(P, a, r) {
    beats(a, 0.4, 0.5, 0.62);
    const k = r.mvAmp;
    P.sq += v(-0.2, 0.18) * k - 0.12 * bell(seg(a, 0.52, 0.7));
    P.bz += v(-0.08, 0.32) * k; P.brx += v(-0.18, 0.26) * k;
    P.jaw += 1.3 * W * (1 - S) + 0.15 * bell(seg(a, 0.56, 0.76));
    P.lid -= 1.5 * W * (1 - S);
    P.hrx += v(-0.4, 0.3);
    P.alrx += v(-1.6, -0.6); P.arrx += v(-1.6, -0.6); P.alrz += v(-0.5, 0.2); P.arrz += v(0.5, -0.2);
    P.bry += wob(a, 0.5, 2, 0.3) * 0.25;
  },
  /** HEADBUTT: rear back on the hind legs, then drive forward head-first. */
  headbutt(P, a, r) {
    beats(a, 0.42, 0.52, 0.62);
    const k = r.mvAmp;
    P.bz += v(-0.22, 0.42) * k; P.brx += v(-0.34, 0.34) * k;
    P.hrx += v(-0.32, 0.5); P.hpz += v(-0.04, 0.08);
    P.flrx += v(-0.6, 0.3); P.frrx += v(-0.55, 0.3);
    P.blrx += v(-0.15, 0.55); P.brrx += v(-0.15, 0.55);
    P.llrx += v(-0.3, 0.45); P.lrrx += v(0.3, -0.5);
    P.alrx += v(0.6, 0.9); P.arrx += v(0.6, 0.9);
    P.crouch += 0.25 * W * (1 - S);
    P.sq += v(0.05, 0) - 0.18 * bell(seg(a, 0.5, 0.66)) * k;
  },
  /** TAIL WHIP: a wound-up full turn so the tail sweeps through the target. */
  tailwhip(P, a, r) {
    const w = sm(seg(a, 0, 0.3)), sp = sm(seg(a, 0.3, 0.64));
    P.yaw = 1;
    P.bry += -0.6 * w * (1 - sp) + PI2 * sp;
    P.tly += 1.1 * bell(seg(a, 0.25, 0.75)) * (a < 0.5 ? 1 : 0.6);
    P.trx += -0.25 * bell(seg(a, 0.2, 0.8));
    P.crouch += 0.2 * bell(seg(a, 0.1, 0.8));
    P.brx += 0.08 * bell(seg(a, 0.3, 0.7));
    P.sq += -0.1 * bell(seg(a, 0.6, 0.85));
  },
  /** STOMP: rear up high on the hind legs (one leg for bipeds), then slam down. */
  stomp(P, a, r) {
    beats(a, 0.44, 0.53, 0.64);
    const k = r.mvAmp;
    if (r.has.legF) {
      P.brx += v(-0.72, 0.14) * k;
      P.flrx += v(-1.45, 0.18); P.frrx += v(-1.3, 0.18);
      P.blrx += v(0.35, -0.1); P.brrx += v(0.35, -0.1);
    } else {
      P.brx += v(-0.2, 0.12) * k;
      P.llrx += v(-1.35, 0.15) * k; P.lrrx += v(0.25, -0.05);
      P.alrz += v(-0.7, -0.2); P.arrz += v(0.7, 0.2); P.alrx += v(-0.6, -0.2); P.arrx += v(-0.6, -0.2);
      P.by += v(0.04, 0);
    }
    P.hrx += v(-0.35, 0.25); P.jaw += v(0.8, 0.3);
    P.sq += v(0.1, 0) - 0.28 * bell(seg(a, 0.5, 0.68)) * k;
    P.bry += wob(a, 0.52, 2, 0.3) * 0.08;
  },
  /** SMASH: both arms high overhead, then hammer down with the whole body. */
  smash(P, a, r) {
    beats(a, 0.42, 0.52, 0.62);
    const k = r.mvAmp;
    if (r.has.arms) {
      P.alrx += v(-2.9, -0.7) * k; P.arrx += v(-2.9, -0.7) * k;
      P.alrz += v(0.25, -0.15); P.arrz += v(-0.25, 0.15);
    } else { P.hrx += v(-0.4, 0.5); P.lid -= 1.2 * W * (1 - S); }
    P.brx += v(-0.26, 0.34) * k; P.bz += v(-0.08, 0.2) * k;
    P.hrx += v(-0.25, 0.3);
    P.jaw += v(0.5, 0.2);
    P.llrx += v(0.2, -0.3); P.lrrx += v(-0.2, 0.3);
    P.sq += v(0.12, 0) - 0.24 * bell(seg(a, 0.5, 0.68)) * k;
  },
  /** PUNCH: alternating jabs with a shoulder twist. */
  punch(P, a, r) {
    beats(a, 0.4, 0.5, 0.6);
    const s = r.mvSide;
    if (r.has.arms) {
      if (s > 0) { P.arrx += v(0.6, -1.75); P.arrz += v(0.2, -0.1); P.alrx += -0.7 * W * R; }
      else { P.alrx += v(0.6, -1.75); P.alrz += v(-0.2, 0.1); P.arrx += -0.7 * W * R; }
    } else P.hrx += v(-0.3, 0.4);
    P.bry += v(0.36, -0.42) * s;
    P.bz += v(-0.05, 0.18); P.brx += v(-0.08, 0.14);
    P.llrx += v(0, -0.25); P.lrrx += v(0, 0.25);
    P.lid -= 0.5 * bell(seg(a, 0.4, 0.7));
    P.sq += -0.08 * bell(seg(a, 0.5, 0.64));
  },
  /** DIVE: a flyer climbs, folds and swoops down through the target, then beats back up. */
  dive(P, a, r) {
    beats(a, 0.4, 0.52, 0.58);
    const k = r.mvAmp;
    P.by += v(0.3, -0.55) * k + 0.12 * bell(seg(a, 0.62, 1));
    P.bz += v(-0.16, 0.42) * k;
    P.brx += v(-0.36, 0.6) * k;
    P.jaw += 0.9 * W * (1 - S) + 0.3 * S * R;
    P.flrx += v(-0.4, -1.4); P.frrx += v(-0.4, -1.4);
    P.alrx += v(-0.6, -1.8); P.arrx += v(-0.6, -1.8); P.alrz += v(-0.4, 0.2); P.arrz += v(0.4, -0.2);
    P.llrx += v(-0.5, -1.2); P.lrrx += v(-0.5, -1.2);
    P.hrx += v(-0.3, 0.35);
    P.wing += 1 + W;
    P.tly += wob(a, 0.5, 2, 0.4) * 0.6;
  },
  /** SHOOT: brace, then a sharp recoil kick and a springy settle (mvAmp scales the gun). */
  shoot(P, a, r) {
    const k = r.mvAmp;
    const br = sm(seg(a, 0, 0.45)) * (1 - seg(a, 0.45, 0.5));
    const kick = a < 0.5 ? 0 : Math.exp(-(a - 0.5) * 9) * Math.cos((a - 0.5) * 16);
    P.brx += 0.06 * br - 0.2 * kick * k;
    P.bz += 0.03 * br - 0.17 * kick * k;
    P.sq += -0.07 * br - 0.08 * Math.max(0, kick) * k;
    P.cannon += -0.16 * Math.max(0, kick) * k;
    P.hrx += -0.2 * kick; P.jaw += 0.5 * Math.max(0, kick);
    P.lid -= 1.2 * Math.max(0, kick) * Math.min(1, k);
    P.alrx += -0.5 * br - 0.6 * Math.max(0, kick); P.arrx += -0.5 * br - 0.6 * Math.max(0, kick);
  },
  /** SPIT: the head rears back, then thrusts forward with the mouth wide (snakes, bins, breathers). */
  spit(P, a, r) {
    beats(a, 0.42, 0.52, 0.64);
    const k = r.mvAmp;
    P.hrx += v(-0.45, 0.35); P.hpz += v(-0.08, 0.15); P.hpy += v(0.05, -0.02);
    P.jaw += 0.35 * W * (1 - S) + 1.05 * S * R;
    P.lid -= 0.5 * W * (1 - S) + 1.5 * S * R;
    P.brx += v(-0.2, 0.2) * k; P.bz += v(-0.06, 0.12) * k;
    P.sq += v(-0.08, 0.1);
    P.alrx += v(0.4, -0.9); P.arrx += v(0.4, -0.9);
    P.tly += v(0.4, -0.4);
  },
  /** SPIN: arms flung out for one fast full turn (blades, cutters). */
  spin(P, a, r) {
    const w = sm(seg(a, 0, 0.32)), sp = sm(seg(a, 0.32, 0.66));
    P.yaw = 1;
    P.bry += -0.5 * w * (1 - sp) + PI2 * sp;
    const out = bell(seg(a, 0.2, 0.85));
    P.alrz += -1.3 * out; P.arrz += 1.3 * out; P.alrx += -0.6 * out; P.arrx += -0.6 * out;
    P.sq += -0.1 * bell(seg(a, 0.1, 0.35)) + 0.08 * bell(seg(a, 0.4, 0.6));
    P.crouch += 0.2 * bell(seg(a, 0.1, 0.8));
  },
  /** PULSE: a speaker pump: compress, then BOOM outward with the arms thrown wide. */
  pulse(P, a, r) {
    beats(a, 0.42, 0.5, 0.6);
    P.sq += v(-0.24, 0.26);
    P.alrz += v(0.3, -1.1); P.arrz += v(-0.3, 1.1); P.alrx += v(0.2, -0.8); P.arrx += v(0.2, -0.8);
    P.jaw += v(0, 0.9);
    P.brx += v(0.08, -0.12);
    P.bry += wob(a, 0.5, 3, 0.4) * 0.15;
  },
  /** ROAR: rear up, head thrown back, jaw wide, the whole body shaking with it. */
  roar(P, a, r) {
    const up = sm(seg(a, 0, 0.2)) * (1 - sm(seg(a, 0.75, 1)));
    const t = r.mvT;
    P.brx += -0.42 * up; P.hrx += -0.55 * up; P.jaw += 1.25 * up; P.lid -= 1.4 * up;
    P.flrx += -0.55 * up; P.frrx += -0.55 * up;
    P.alrx += -2.2 * up; P.arrx += -2.2 * up; P.alrz += -0.6 * up; P.arrz += 0.6 * up;
    P.sq += 0.1 * up;
    const shake = seg(a, 0.2, 0.75) > 0 && a < 0.75 ? 1 : 0;
    P.bx += Math.sin(t * 70) * 0.018 * shake; P.hry += Math.sin(t * 34) * 0.07 * shake;
    P.tly += Math.sin(t * 18) * 0.6 * up;
  },
  /** GRAB: reach and clamp, lift, shake (or a full death roll), then slam down or gulp. mvKind: roll | gulp | slam */
  grab(P, a, r) {
    const kind = r.mvKind;
    const R1 = eo(seg(a, 0, 0.12)), L = sm(seg(a, 0.12, 0.3)), Sl = eo(seg(a, 0.72, 0.84)), Rc = 1 - sm(seg(a, 0.86, 1));
    const Sh = seg(a, 0.3, 0.72), shk = Sh > 0 && Sh < 1 ? Math.sin(Sh * PI2 * 3.5) : 0;
    const gulp = kind === 'gulp';
    if (r.has.head) {
      P.hpz += (0.24 * R1 * (1 - 0.5 * L) + 0.14 * Sl) * Rc;
      P.hrx += (0.18 * R1 - 0.65 * L * (1 - Sl) + (gulp ? -0.95 : 0.75) * Sl) * Rc;
      P.hpy += 0.08 * L * (1 - Sl) * Rc;
      P.hry += shk * (kind === 'roll' ? 0.2 : 0.5);
    }
    // jaw: gape on the reach, clamp around the prey, gulp it down
    P.jaw += 1.15 * bell(seg(a, 0, 0.16)) + 0.28 * seg(a, 0.12, 0.14) * (1 - seg(a, 0.72, 0.76)) + (gulp ? 1.2 * bell(seg(a, 0.72, 0.88)) : 0);
    P.lid -= 1.3 * bell(seg(a, 0, 0.16));
    P.brx += (0.22 * R1 - 0.3 * L * (1 - Sl) + 0.34 * Sl) * Rc;
    P.bz += (0.2 * R1 * (1 - L) + 0.1 * Sl) * Rc;
    if (kind === 'roll') P.roll = PI2 * sm(Sh);
    else P.brz += shk * 0.12;
    // arms / claws do the holding for models without a biting head
    P.alrx += (-1.7 * R1 - 0.9 * L * (1 - Sl) + 1.1 * Sl) * Rc; P.arrx += (-1.7 * R1 - 0.9 * L * (1 - Sl) + 1.1 * Sl) * Rc;
    P.alrz += (0.35 * R1 + shk * 0.3) * Rc; P.arrz += (-0.35 * R1 + shk * 0.3) * Rc;
    P.flrx += (-0.6 * R1 - 0.4 * L) * Rc; P.frrx += (-0.6 * R1 - 0.4 * L) * Rc;
    P.blrx += 0.25 * L * Rc; P.brrx += 0.25 * L * Rc;
    P.tly += shk * 0.8;
    P.sq += -0.25 * bell(seg(a, 0.8, 0.95)) + (gulp ? 0.16 * bell(seg(a, 0.86, 1)) : 0);
  },
  /** YANK: a tentacle / arm shoots out, then hauls back hard (Sludge Kraken pull). */
  yank(P, a, r) {
    const R1 = eo(seg(a, 0, 0.3)), Y = sm(seg(a, 0.3, 0.55)), Rc = 1 - sm(seg(a, 0.6, 1));
    P.alrx += (-2.1 * R1 * (1 - Y) + 0.6 * Y) * Rc; P.arrx += (-1.8 * R1 * (1 - Y) + 0.5 * Y) * Rc;
    P.alrz += -0.3 * R1 * Rc; P.arrz += 0.3 * R1 * Rc;
    P.brx += (0.2 * R1 - 0.32 * Y) * Rc; P.bz += (0.14 * R1 - 0.14 * Y) * Rc;
    P.hrx += (0.2 * R1 - 0.3 * Y) * Rc; P.jaw += 0.8 * bell(seg(a, 0.2, 0.7));
    P.sq += -0.1 * bell(seg(a, 0.5, 0.7));
  },
  /** BEAM: a tractor-beam lean towards the prey (UFO abduct). */
  beam(P, a, r) {
    const e = sm(seg(a, 0, 0.15)) * (1 - sm(seg(a, 0.85, 1)));
    P.brx += 0.28 * e; P.by += 0.08 * e;
    P.alrx += -0.7 * e + Math.sin(r.mvT * 14) * 0.15 * e; P.arrx += -0.7 * e + Math.sin(r.mvT * 14 + 1) * 0.15 * e;
    P.alrz += 0.4 * e; P.arrz += -0.4 * e;
    P.jaw += 0.4 * e;
  },
  /** SURFACE: burst up out of the ground claws first (Magma Mole). */
  surface(P, a, r) {
    const up = bell(seg(a, 0, 0.6));
    P.by += 0.3 * up; P.sq += 0.28 * up - 0.2 * bell(seg(a, 0.55, 0.8));
    P.alrx += -2.7 * up; P.arrx += -2.7 * up; P.alrz += -0.4 * up; P.arrz += 0.4 * up;
    P.hrx += -0.4 * up; P.jaw += 0.9 * up;
  },
  /** THRASH: a kill shaken in the jaws, head whipping side to side (sharks, wolves, dogs). */
  thrash(P, a, r) {
    const e = sm(seg(a, 0, 0.12)) * (1 - sm(seg(a, 0.82, 1)));
    const w = Math.sin(a * PI2 * 3) * e;
    P.hry += w * 0.65; P.hrz += w * 0.3; P.hrx += -0.3 * e; P.hpy += 0.05 * e;
    P.bry += w * 0.22 * (r.has.head ? 1 : 2); P.brx += -0.12 * e;
    P.jaw += 0.3 * e; P.tly += -w * 0.9;
    P.flrx += -0.25 * e; P.frrx += -0.25 * e;
  },
  /** LAND: a heavy landing squash with the legs splaying (after a pounce or leap). */
  land(P, a, r) {
    const k = bell(seg(a, 0, 1)) * (1 - a * 0.5);
    P.sq += -0.3 * k; P.crouch += 0.6 * k; P.brx += 0.12 * k;
    P.flrx += -0.3 * k; P.frrx += -0.3 * k;
  },
};
MOVES.ram = MOVES.headbutt;

// ---------------------------------------------------------------- held states
// (P, k: 0..1 progress where meaningful, r: rig; r.hlT = time in this state, r.hlSide = +1 blow came from the front)
const HOLDS = {
  /** Pounce anticipation: body low, hind legs coiled, rear wiggling, tail lashing, eyes on the prey. */
  crouch(P, k, r) {
    const e = sm(cl(k * 1.4)), t = r.hlT;
    P.crouch += 0.95 * e;
    P.brx += 0.1 * e; P.bz += -0.08 * e;
    P.brz += Math.sin(t * 30) * 0.05 * e; P.bry += Math.sin(t * 15) * 0.06 * e;
    P.tly += Math.sin(t * 17) * 0.9; P.trx += -0.3 * e;
    P.hrx += 0.16 * e; P.hpz += 0.04 * e; P.jaw += 0.25 * e;
    P.alrx += -0.9 * e; P.arrx += -0.9 * e;
    P.sq += -0.07 * e;
  },
  /** Mid-leap (k = flight progress): launch stretched with hind legs kicking back, claws reaching, nose dipping onto the prey. */
  air(P, k, r) {
    const d = sm(cl(k));
    P.brx += -0.5 + 0.92 * d;
    P.sz += 0.24 * bell(k * 0.9 + 0.05);
    P.sq += -0.05 * bell(k);
    P.flrx += -1.95 + 0.7 * sm(seg(k, 0.55, 1)); P.frrx += -1.8 + 0.7 * sm(seg(k, 0.55, 1));
    P.blrx += 1.25 - 0.7 * d; P.brrx += 1.3 - 0.7 * d;
    P.alrx += -2.3; P.arrx += -2.1;
    P.llrx += -0.9; P.lrrx += 0.7;
    P.trx += 0.45; P.tly += Math.sin(r.hlT * 10) * 0.2;
    P.hrx += -0.25 + 0.35 * d; P.jaw += 0.95;
  },
  /** Standing over pinned prey: front paws planted on it, head low. */
  pinning(P, k, r) {
    const t = r.hlT;
    P.flrx += -1.0; P.frrx += -1.1; P.brx += 0.16; P.bz += 0.05;
    P.alrx += -1.1; P.arrx += -1.1;
    P.hrx += 0.22; P.jaw += 0.35 + 0.15 * Math.sin(t * 9);
    P.tly += Math.sin(t * 12) * 0.6;
  },
  /** Knocked over under a pouncer: flipped onto its side (belly to the camera: hlSide), squashed, legs kicking in the air. */
  pinned(P, k, r) {
    const t = r.hlT, e = eo(seg(t, 0, 0.1));
    P.lie += 1.15 * e * r.hlSide;
    P.sq += -0.22 * e;
    flail(P, t, 0.75, 22);
    P.hry += Math.sin(t * 8) * 0.3; P.jaw += 0.5;
  },
  /** Held in a grabber's jaws / claws: dangling nose-down and kicking. */
  grabbed(P, k, r) {
    const t = r.hlT;
    P.brx += 0.7 + Math.sin(t * 9) * 0.22;
    P.brz += Math.sin(t * 7) * 0.28;
    P.sq += 0.1;
    flail(P, t, 0.9, 30);
    P.jaw += 0.6;
  },
  /** Abducted: slowly turning in the beam, kicking. */
  lifted(P, k, r) {
    const t = r.hlT;
    P.yaw = 1;
    P.bry += PI2 * sm(cl(k));
    P.brx += Math.sin(t * 5) * 0.3;
    flail(P, t, 0.8, 26);
    P.jaw += 0.5;
  },
  /** Charging: head down, leaning into the run. */
  charge(P, k, r) {
    P.brx += 0.24; P.hrx += 0.32; P.bz += 0.04;
    P.alrx += 0.5; P.arrx += 0.5;
    P.trx += 0.3;
  },
};

export const MOVE_NAMES = Object.keys(MOVES);
export function applyMove(P, name, a, rig) {
  const f = MOVES[name];
  if (f) f(P, a, rig);
}
export function applyHold(P, name, k, rig) {
  const f = HOLDS[name];
  if (f) f(P, k, rig);
}
