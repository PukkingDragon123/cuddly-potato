// Chibi block-head characters: oversized voxel heads with pixel faces, tiny
// bodies, and a procedural pose-blending animation system.
import * as THREE from 'three';
import { VoxGrid, Mats, makeMesh, VOX } from './voxel.js';
import { PixelFace } from './face.js';
import { damp, shade } from './util.js';

const HEAD_W = 10, HEAD_H = 10, HEAD_D = 9;
const GEO_CACHE = new Map();
const BODY_H = 5, LEG_H = 4;

// ---------------------------------------------------------------------------
// Grid builders

function buildHead(def) {
  const g = new VoxGrid();
  const skin = def.skin ?? 0xf1c3a0;
  // head cube: x -5..4, y 0..9, z -4..4  (front face at z = 4)
  g.box(-5, 0, -4, 4, HEAD_H - 1, 4, skin);
  // round off the corners a little
  for (const x of [-5, 4]) for (const z of [-4, 4]) { g.del(x, 0, z); g.del(x, HEAD_H - 1, z); }
  // ears
  g.box(-6, 4, 0, -6, 5, 1, shade(skin, -0.08));
  g.box(5, 4, 0, 5, 5, 1, shade(skin, -0.08));

  const hair = def.hair?.color ?? 0x4a2f1c;
  const hs = def.hair?.style ?? 'short';
  const hairDark = shade(hair, -0.15);
  const hairTop = (h = 1) => g.box(-5, HEAD_H, -4, 4, HEAD_H + h - 1, 4, hair);
  const backSides = (low = 4) => {
    g.box(-5, low, -5, 4, HEAD_H - 1, -5, hair); // back
    g.box(-6, low + 2, -4, -6, HEAD_H - 1, 3, hair);
    g.box(5, low + 2, -4, 5, HEAD_H - 1, 3, hair);
  };
  switch (hs) {
    case 'jimmy': {
      hairTop(1);
      g.box(-5, HEAD_H + 1, -3, 3, HEAD_H + 1, 3, hair);
      g.box(-4, HEAD_H + 2, -1, 2, HEAD_H + 2, 4, hair); // front quiff
      g.box(-3, HEAD_H + 1, 4, 3, HEAD_H + 2, 5, hair);
      backSides(5);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 4, hair); // hairline
      g.box(-5, HEAD_H - 2, 4, -3, HEAD_H - 2, 4, hair);
      g.paint((x, y, z, c) => (c === hair && (x + y + z) % 5 === 0 ? hairDark : undefined));
      break;
    }
    case 'messy': {
      hairTop(1);
      for (let x = -5; x <= 4; x += 2) g.box(x, HEAD_H + 1, -3 + (x & 1), x, HEAD_H + 2, 2, hair);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 5, hair);
      g.box(-4, HEAD_H - 2, 5, -1, HEAD_H - 2, 5, hair);
      g.box(1, HEAD_H - 2, 5, 2, HEAD_H - 3, 5, hair);
      backSides(4);
      break;
    }
    case 'undercut': {
      hairTop(2);
      g.box(-4, HEAD_H + 2, -2, 3, HEAD_H + 2, 4, hair);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H, 5, hair);
      g.box(-5, 6, -5, 4, HEAD_H - 1, -5, hair);
      g.box(-6, 7, -4, -6, HEAD_H - 1, 3, hairDark);
      g.box(5, 7, -4, 5, HEAD_H - 1, 3, hairDark);
      break;
    }
    case 'spiky': {
      hairTop(1);
      for (let x = -5; x <= 4; x += 3) for (let z = -3; z <= 3; z += 3) g.box(x, HEAD_H + 1, z, x + 1, HEAD_H + 2 + ((x + z) & 1), z + 1, hair);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 5, hair);
      g.set(-3, HEAD_H - 2, 5, hair); g.set(0, HEAD_H - 2, 5, hair); g.set(3, HEAD_H - 2, 5, hair);
      backSides(4);
      break;
    }
    case 'bob': {
      hairTop(1);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 5, hair);
      g.box(-6, 2, -5, -6, HEAD_H, 4, hair);
      g.box(5, 2, -5, 5, HEAD_H, 4, hair);
      g.box(-5, 2, -5, 4, HEAD_H, -5, hair);
      break;
    }
    case 'ponytail': {
      hairTop(1);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 5, hair);
      backSides(5);
      g.box(-1, 3, -7, 0, HEAD_H - 1, -6, hair);
      g.box(-1, HEAD_H - 2, -6, 0, HEAD_H - 2, -6, 0xff2e88);
      break;
    }
    case 'buzz': {
      g.box(-5, HEAD_H, -4, 4, HEAD_H, 4, hair);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 4, hair);
      g.box(-5, 6, -5, 4, HEAD_H - 1, -5, hair);
      break;
    }
    case 'bald':
      break;
    default: {
      hairTop(1);
      g.box(-5, HEAD_H - 1, 4, 4, HEAD_H - 1, 4, hair);
      backSides(5);
    }
  }

  // Beard / mustache: recolour the skin of the lower face (mouth is drawn on top).
  if (def.beard) {
    const b = def.beard;
    g.paint((x, y, z, c) => {
      if (c !== skin) return undefined;
      if (z >= 0 && (x === -5 || x === 4) && y <= 4) return b;
      if (z === 4 && y <= 2) return b;
      if (def.beardStyle !== 'chin' && z === 4 && y === 3 && x >= -3 && x <= 2) return b;
      return undefined;
    });
    g.box(-4, -1, 0, 3, -1, 4, b); // chin
  }

  // Hats
  const hat = def.hat;
  if (hat) {
    const hc = hat.color ?? 0xff2e88;
    if (hat.type === 'cap') {
      g.box(-5, HEAD_H, -4, 4, HEAD_H + 2, 4, hc);
      g.box(-5, HEAD_H, 5, 4, HEAD_H, 7, shade(hc, -0.15));
      g.box(-1, HEAD_H + 1, 5, 0, HEAD_H + 2, 5, hat.logo ?? 0xffffff);
    } else if (hat.type === 'beanie') {
      g.box(-6, HEAD_H - 1, -5, 5, HEAD_H + 2, 5, hc);
      g.box(-5, HEAD_H + 3, -4, 4, HEAD_H + 3, 4, hc);
      g.box(-1, HEAD_H + 4, -1, 0, HEAD_H + 4, 0, 0xffffff);
      g.box(-6, HEAD_H - 1, 5, 5, HEAD_H - 1, 5, shade(hc, -0.2));
    } else if (hat.type === 'chef') {
      g.box(-5, HEAD_H, -4, 4, HEAD_H + 1, 4, 0xf4f4f4);
      g.ellipsoid(-0.5, HEAD_H + 4, 0, 5.5, 3, 4.5, 0xffffff);
    } else if (hat.type === 'crown') {
      g.box(-4, HEAD_H + 1, -3, 3, HEAD_H + 2, 3, hc);
      for (let x = -4; x <= 3; x += 2) { g.set(x, HEAD_H + 3, 3, hc); g.set(x, HEAD_H + 3, -3, hc); }
      g.set(-1, HEAD_H + 2, 4, 0xff2e88); g.set(0, HEAD_H + 2, 4, 0x29b6f6);
    } else if (hat.type === 'headband') {
      g.box(-5, HEAD_H - 2, -4, 4, HEAD_H - 2, 4, hc);
      g.box(-5, HEAD_H - 2, 5, 4, HEAD_H - 2, 5, hc);
      g.box(-5, HEAD_H - 2, -5, 4, HEAD_H - 2, -5, hc);
    } else if (hat.type === 'goggles') {
      g.box(-6, 7, -4, 5, 7, 4, 0x333344);
      g.box(-4, 6, 5, -1, 8, 5, 0x333344);
      g.box(1, 6, 5, 4, 8, 5, 0x333344);
      g.box(-3, 7, 6, -2, 7, 6, 0x7fe8ff, true);
      g.box(2, 7, 6, 3, 7, 6, 0x7fe8ff, true);
    }
  }
  if (def.chain) {
    // gold chain around neck sits on body instead
  }
  return g;
}

function buildBody(def) {
  const g = new VoxGrid();
  const shirt = def.shirt ?? 0x222233;
  const outfit = def.outfit ?? 'tee';
  // torso x -3..2, y 0..4, z -2..1
  g.box(-3, 0, -2, 2, BODY_H - 1, 1, shirt);
  if (outfit === 'labcoat') {
    const coat = def.coat ?? 0xf4f6fb;
    g.box(-3, 0, -2, 2, BODY_H - 1, 1, coat);
    g.box(-1, 0, 1, 0, BODY_H - 1, 1, shirt); // open front shows shirt
    g.box(-3, -2, -2, 2, -1, -2, coat); // coat tail back
    g.box(-3, -2, -1, -3, -1, 1, coat);
    g.box(2, -2, -1, 2, -1, 1, coat);
    g.box(-3, BODY_H - 1, 1, -2, BODY_H - 1, 1, shade(coat, -0.1)); // collar
    g.box(1, BODY_H - 1, 1, 2, BODY_H - 1, 1, shade(coat, -0.1));
    g.set(-3, 2, 2, def.accent ?? 0x29b6f6); // pocket pen
    g.set(1, 1, 2, shade(coat, -0.06)); g.set(2, 1, 2, shade(coat, -0.06));
  } else if (outfit === 'hoodie') {
    g.box(-3, 0, -2, 2, BODY_H - 1, 1, shirt);
    g.box(-2, 0, 2, 1, 1, 2, shade(shirt, -0.12)); // pocket
    g.box(-3, BODY_H - 1, -3, 2, BODY_H, -2, shade(shirt, -0.1)); // hood
    g.set(-1, BODY_H - 2, 2, 0xffffff); g.set(0, BODY_H - 2, 2, 0xffffff);
  } else if (outfit === 'jersey') {
    g.box(-3, 0, -2, 2, BODY_H - 1, 1, shirt);
    g.box(-3, BODY_H - 1, -2, 2, BODY_H - 1, 1, def.accent ?? 0xffffff);
    // number on chest
    g.box(-1, 1, 2, 0, 3, 2, def.accent ?? 0xffffff);
    g.set(-1, 2, 2, shirt);
  } else if (outfit === 'apron') {
    g.box(-2, -1, 2, 1, BODY_H - 2, 2, def.accent ?? 0xff4f4f);
  } else if (outfit === 'suit') {
    g.box(-1, 0, 2, 0, BODY_H - 1, 2, 0xffffff);
    g.box(-1, 1, 2, 0, BODY_H - 2, 2, def.accent ?? 0xff2e88);
  }
  if (def.logo === 'panther') {
    // MrBeast-style panther mark on chest (blue head + pink bolt)
    const z = outfit === 'labcoat' ? 2 : 2;
    const x0 = outfit === 'labcoat' ? -1 : -1;
    g.box(x0, 2, z, x0 + 1, 3, z, 0x29b6f6);
    g.set(x0 + 1, 2, z, 0xff2e88);
  }
  if (def.chain) {
    g.box(-2, BODY_H - 1, 2, 1, BODY_H - 1, 2, 0xffd23f);
    g.box(-1, BODY_H - 2, 2, 0, BODY_H - 2, 2, 0xffd23f);
  }
  return g;
}

function buildArm(def, side) {
  const g = new VoxGrid();
  const sleeve = def.outfit === 'labcoat' ? def.coat ?? 0xf4f6fb : def.sleeve ?? def.shirt ?? 0x222233;
  g.box(-1, -4, -1, 0, -1, 0, sleeve);
  g.box(-1, -5, -1, 0, -5, 0, def.skin ?? 0xf1c3a0);
  if (def.gloves) g.box(-1, -5, -1, 0, -5, 0, def.gloves);
  if (def.outfit === 'jersey' || def.outfit === 'tee') g.box(-1, -4, -1, 0, -3, 0, def.skin ?? 0xf1c3a0);
  if (def.outfit === 'jersey') g.box(-1, -2, -1, 0, -2, 0, def.accent ?? 0xffffff);
  return g;
}

function buildLeg(def) {
  const g = new VoxGrid();
  const pants = def.pants ?? 0x2b3448;
  g.box(-1, -3, -1, 0, -1, 0, pants);
  if (def.shorts) g.box(-1, -3, -1, 0, -3, 0, def.skin ?? 0xf1c3a0);
  const shoe = def.shoes ?? 0xf2f2f2;
  g.box(-1, -4, -1, 0, -4, 1, shoe);
  g.set(-1, -4, 1, shade(shoe, -0.2));
  return g;
}

// ---------------------------------------------------------------------------
// Poses: functions returning target rotations for each part.

const ZERO = () => ({
  y: 0, hipsRY: 0, hipsRZ: 0, torsoRX: 0, torsoRY: 0, torsoRZ: 0,
  headRX: 0, headRY: 0, headRZ: 0,
  armLX: 0, armLZ: 0.08, armRX: 0, armRZ: -0.08,
  legLX: 0, legRX: 0, legLZ: 0, legRZ: 0,
  sx: 1, sy: 1,
});

const POSES = {
  idle(t, p) {
    const b = Math.sin(t * 2.2);
    p.sy = 1 + b * 0.015; p.sx = 1 - b * 0.01;
    p.armLZ = 0.1 + b * 0.04; p.armRZ = -0.1 - b * 0.04;
    p.headRZ = Math.sin(t * 0.9) * 0.04;
    p.headRX = Math.sin(t * 1.3) * 0.03;
  },
  walk(t, p, k = 1) {
    const s = Math.sin(t * 11 * k);
    p.legLX = s * 0.75; p.legRX = -s * 0.75;
    p.armLX = -s * 0.7; p.armRX = s * 0.7;
    p.y = Math.abs(Math.cos(t * 11 * k)) * 0.06;
    p.torsoRY = s * 0.08;
    p.headRZ = s * 0.05;
  },
  run(t, p) {
    POSES.walk(t, p, 1.5);
    p.torsoRX = 0.2;
    p.y *= 1.6;
  },
  talk(t, p) {
    POSES.idle(t, p);
    p.headRX = Math.sin(t * 7) * 0.06;
    p.headRZ = Math.sin(t * 3) * 0.07;
    p.armRX = -0.6 + Math.sin(t * 4) * 0.3;
    p.armRZ = -0.3;
  },
  cheer(t, p) {
    const j = Math.abs(Math.sin(t * 7));
    p.y = j * 0.35;
    p.armLZ = 2.7 + Math.sin(t * 14) * 0.15; p.armRZ = -2.7 - Math.sin(t * 14) * 0.15;
    p.legLX = -j * 0.3; p.legRX = -j * 0.3;
    p.sy = 1 + (j - 0.5) * 0.12; p.sx = 1 - (j - 0.5) * 0.08;
  },
  dance(t, p) {
    const s = Math.sin(t * 8), c = Math.cos(t * 8);
    p.y = Math.abs(s) * 0.12;
    p.hipsRZ = s * 0.15;
    p.torsoRY = c * 0.35;
    p.torsoRZ = -s * 0.12;
    p.headRZ = s * 0.18;
    p.armLZ = 1.6 + s * 0.9; p.armRZ = -1.6 + s * 0.9;
    p.armLX = c * 0.4; p.armRX = -c * 0.4;
    p.legLX = Math.max(0, s) * -0.6; p.legRX = Math.max(0, -s) * -0.6;
  },
  throw(t, p, k, d) {
    const u = t / (d || 0.5);
    if (u < 0.45) {
      p.armRX = -2.6 * (u / 0.45); p.torsoRY = 0.4 * (u / 0.45); p.torsoRX = -0.1;
    } else {
      const v = Math.min(1, (u - 0.45) / 0.3);
      p.armRX = -2.6 + v * 3.6; p.torsoRY = 0.4 - v * 0.8; p.torsoRX = v * 0.25;
    }
    p.armLZ = 0.4;
  },
  kick(t, p, k, d) {
    const u = t / (d || 0.6);
    if (u < 0.4) { p.legRX = 0.8 * (u / 0.4); p.torsoRX = -0.1; p.armLX = -0.5; }
    else { const v = Math.min(1, (u - 0.4) / 0.25); p.legRX = 0.8 - v * 2.4; p.torsoRX = -0.25 * v; p.armLZ = 1; p.armRZ = -1; }
    p.y = 0.05;
  },
  point(t, p) {
    POSES.idle(t, p);
    p.armRX = -1.55; p.armRZ = -0.15;
    p.torsoRY = -0.1;
  },
  present(t, p) {
    POSES.idle(t, p);
    p.armLX = -1.2; p.armRX = -1.2; p.armLZ = -0.15; p.armRZ = 0.15;
  },
  holdUp(t, p) {
    POSES.idle(t, p);
    p.armLX = -2.9; p.armRX = -2.9; p.armLZ = -0.1; p.armRZ = 0.1;
    p.y = Math.abs(Math.sin(t * 3)) * 0.05;
  },
  sit(t, p) {
    p.y = -0.38;
    p.legLX = -1.45; p.legRX = -1.45;
    p.legLZ = Math.sin(t * 2) * 0.05; p.legRZ = -Math.sin(t * 2 + 1) * 0.05;
    p.armLZ = 0.35; p.armRZ = -0.35;
    p.headRZ = Math.sin(t * 1.1) * 0.05;
    p.sy = 1 + Math.sin(t * 2.2) * 0.015;
  },
  sitCheer(t, p) {
    POSES.sit(t, p);
    p.armLZ = 2.6 + Math.sin(t * 12) * 0.25; p.armRZ = -2.6 - Math.sin(t * 12) * 0.25;
    p.y = -0.38 + Math.abs(Math.sin(t * 7)) * 0.15;
  },
  sitWorried(t, p) {
    POSES.sit(t, p);
    p.armLX = -2.4; p.armRX = -2.4; p.armLZ = -0.6; p.armRZ = 0.6;
    p.headRZ = Math.sin(t * 20) * 0.04;
  },
  shocked(t, p) {
    p.y = Math.max(0, Math.sin(Math.min(t, 0.4) * 7.8)) * 0.3;
    p.armLZ = 1.5; p.armRZ = -1.5; p.armLX = -0.4; p.armRX = -0.4;
    p.torsoRX = -0.15;
    p.sy = 1.05;
  },
  hit(t, p) {
    p.torsoRX = -0.35; p.headRX = -0.3;
    p.armLZ = 0.8; p.armRZ = -0.8;
    p.sx = 1.1; p.sy = 0.9;
  },
  sad(t, p) {
    p.headRX = 0.35; p.torsoRX = 0.15;
    p.armLZ = 0.02; p.armRZ = -0.02;
    p.sy = 0.97;
  },
  angry(t, p) {
    const s = Math.sin(t * 16);
    p.armLX = -1.2 + s * 0.3; p.armRX = -1.2 - s * 0.3; p.armLZ = -0.3; p.armRZ = 0.3;
    p.y = Math.abs(Math.sin(t * 8)) * 0.08;
    p.headRZ = s * 0.06;
  },
  facepalm(t, p) {
    p.armRX = -2.2; p.armRZ = 0.55;
    p.headRX = 0.3;
    p.sy = 0.98;
  },
  wave(t, p) {
    POSES.idle(t, p);
    p.armRZ = -2.6 + Math.sin(t * 10) * 0.35;
    p.headRZ = 0.08;
  },
  flick(t, p, k, d) {
    const u = t / (d || 0.5);
    p.armRX = -1.4; p.armRZ = -0.2;
    p.torsoRY = -0.15;
    p.armRZ = u < 0.5 ? -0.2 + u * 1.2 : 0.4 - (u - 0.5) * 2.6;
  },
  shake(t, p) {
    // shaking a vial with both hands above head
    p.armLX = -2.4 + Math.sin(t * 30) * 0.4; p.armRX = -2.4 + Math.sin(t * 30) * 0.4;
    p.armLZ = -0.3; p.armRZ = 0.3;
    p.y = Math.abs(Math.sin(t * 15)) * 0.05;
  },
  bellyflop(t, p) {
    p.torsoRX = 1.4; p.armLZ = 1.6; p.armRZ = -1.6; p.legLX = 0.4; p.legRX = 0.4;
  },
  victory(t, p) {
    const s = Math.sin(t * 6);
    p.y = Math.abs(s) * 0.25;
    p.armRZ = -2.8; p.armLZ = 0.2 + Math.abs(s) * 0.3;
    p.torsoRY = s * 0.15;
  },
};

const ONE_SHOT = { throw: 0.5, kick: 0.6, flick: 0.5, hit: 0.3, shocked: 0.7 };

// ---------------------------------------------------------------------------

export class Chibi {
  constructor(def, opts = {}) {
    this.def = def;
    const s = (opts.scale ?? 1);
    this.root = new THREE.Group();
    this.root.name = 'chibi:' + (def.id ?? def.name ?? '');
    this.inner = new THREE.Group(); // scaled container (squash & stretch)
    this.root.add(this.inner);
    this.inner.scale.setScalar(s);
    this.baseScale = s;

    const V = VOX;
    this.hips = new THREE.Group();
    this.hips.position.y = LEG_H * V;
    this.inner.add(this.hips);

    const ck = JSON.stringify(def);
    const geo = (part, fn) => {
      const k = part + '|' + ck;
      if (!GEO_CACHE.has(k)) GEO_CACHE.set(k, fn().build({ pivot: [0, 0, 0] }));
      return GEO_CACHE.get(k);
    };
    const legGeo = geo('leg', () => buildLeg(def));
    this.legL = new THREE.Group(); this.legL.position.set(-1.5 * V, 0, 0);
    this.legR = new THREE.Group(); this.legR.position.set(1.5 * V, 0, 0);
    this.legL.add(makeMesh(legGeo)); this.legR.add(makeMesh(legGeo));
    // legs are 2 wide: shift mesh so it's centred under pivot
    for (const L of [this.legL, this.legR]) L.children[0].position.x = 0;
    this.hips.add(this.legL, this.legR);

    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    const bodyGeo = geo('body', () => buildBody(def));
    this.bodyMesh = makeMesh(bodyGeo);
    this.torso.add(this.bodyMesh);

    const armGeoL = geo('arm', () => buildArm(def, -1));
    this.armL = new THREE.Group(); this.armL.position.set(-4 * V, (BODY_H - 0.5) * V, 0);
    this.armR = new THREE.Group(); this.armR.position.set(3.95 * V, (BODY_H - 0.5) * V, 0);
    // arm grid spans x -1..0 => centred around -0? (span -1..1) so offset to pivot
    const aL = makeMesh(armGeoL); const aR = makeMesh(armGeoL);
    this.armL.add(aL); this.armR.add(aR);
    this.torso.add(this.armL, this.armR);
    this.handR = new THREE.Group(); this.handR.position.set(0, -5 * V, 0.2 * V); this.armR.add(this.handR);
    this.handL = new THREE.Group(); this.handL.position.set(0, -5 * V, 0.2 * V); this.armL.add(this.handL);

    this.head = new THREE.Group();
    this.head.position.y = BODY_H * V;
    this.torso.add(this.head);
    const headGeo = geo('head', () => buildHead(def));
    this.headMesh = makeMesh(headGeo);
    this.head.add(this.headMesh);

    this.face = new PixelFace({ eyeColor: def.eyeColor, blush: def.blush ?? true });
    const faceMat = new THREE.MeshLambertMaterial({ map: this.face.texture, transparent: true, alphaTest: 0.5 });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(HEAD_W * V, HEAD_H * V), faceMat);
    plane.position.set(0, (HEAD_H / 2) * V, (HEAD_D / 2 + 0.5) * V + 0.004);
    this.head.add(plane);
    this.facePlane = plane;

    this.meshes = [];
    this.root.traverse((o) => { if (o.isMesh && o !== plane) this.meshes.push(o); });

    this.anim = 'idle';
    this.animT = 0;
    this.animDur = 0;
    this.after = 'idle';
    this.pose = ZERO();
    this.speed = 1;
    this.flashT = 0;
    this.squash = 0; // impulse for squash/stretch
    this.squashV = 0;
    this.height = (LEG_H + BODY_H + HEAD_H) * V * s;
  }

  play(name, opts = {}) {
    if (!POSES[name]) name = 'idle';
    if (this.anim === name && !opts.restart && !ONE_SHOT[name]) return this;
    this.anim = name;
    this.animT = 0;
    this.animDur = opts.dur ?? ONE_SHOT[name] ?? 0;
    this.after = opts.then ?? (ONE_SHOT[name] ? this.loopAnim ?? 'idle' : name);
    if (!ONE_SHOT[name] && !opts.dur) this.loopAnim = name;
    return this;
  }
  setLoop(name) {
    this.loopAnim = name;
    if (!ONE_SHOT[this.anim] && !this.animDur) this.play(name);
  }
  expr(eyes, mouth, hold = 0) {
    this.face.set(eyes, mouth, hold);
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

  update(dt) {
    this.animT += dt * this.speed;
    if (this.animDur && this.animT >= this.animDur) {
      const next = this.after || 'idle';
      this.anim = next;
      this.animT = 0;
      this.animDur = 0;
    }
    const target = ZERO();
    POSES[this.anim](this.animT, target, 1, this.animDur);
    const p = this.pose;
    const k = 16;
    for (const key in target) p[key] = damp(p[key], target[key], k, dt);

    // spring for squash/stretch
    this.squashV += (-this.squash * 180 - this.squashV * 12) * dt;
    this.squash += this.squashV * dt;
    const sq = this.squash;

    this.inner.position.y = p.y;
    this.inner.scale.set(
      this.baseScale * p.sx * (1 - sq * 0.5),
      this.baseScale * p.sy * (1 + sq),
      this.baseScale * p.sx * (1 - sq * 0.5),
    );
    this.hips.rotation.set(0, p.hipsRY, p.hipsRZ);
    this.torso.rotation.set(p.torsoRX, p.torsoRY, p.torsoRZ);
    this.head.rotation.set(p.headRX, p.headRY, p.headRZ);
    this.armL.rotation.set(p.armLX, 0, p.armLZ);
    this.armR.rotation.set(p.armRX, 0, p.armRZ);
    this.legL.rotation.set(p.legLX, 0, p.legLZ);
    this.legR.rotation.set(p.legRX, 0, p.legRZ);
    this.face.update(dt);

    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.meshes) m.material = on ? Mats.flashPair : Mats.pair;
    }
  }

  /** World position of the top of the head (for speech bubbles). */
  headTop(out = new THREE.Vector3()) {
    this.head.updateWorldMatrix(true, false);
    return out.set(0, (HEAD_H + 2) * VOX, 0).applyMatrix4(this.head.matrixWorld);
  }
  handWorld(out = new THREE.Vector3(), side = 'R') {
    const h = side === 'R' ? this.handR : this.handL;
    h.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(h.matrixWorld);
  }
}

export const CHIBI_HEIGHT = (LEG_H + BODY_H + HEAD_H) * VOX;
