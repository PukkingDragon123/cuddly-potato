// Voxel model builders for every Swarm. Each builder returns a model
// definition consumed by SwarmRig (see swarmRig.js for the format).
// Convention: model faces +Z, y=0 is the ground, 1 unit = 1 voxel.
import { VoxGrid } from '../core/voxel.js';
import { shade } from '../core/util.js';
import { SwarmRig } from './swarmRig.js';
import { C, eye, eyes, teeth, mouth, noise, legs4, feet2, arms2 } from './helpers.js';
import { SWARMS } from '../data/swarms.js';
import { EXTRA_MODELS } from './swarmModelsExtra.js';
import { PANTHER_MODELS } from './swarms/panthers.js';
import { HOME_HORROR_MODELS } from './swarms/homeHorrors.js';
import { CRITTER_MODELS } from './swarms/critters.js';
import { TECHNO_MODELS } from './swarms/techno.js';
import { TOXIC_MODELS } from './swarms/toxic.js';
import { FUSION_MODELS } from './swarms/fusion.js';
import { SNACK_MODELS } from './swarms/snacks.js';
import { BOSS_MODELS } from './swarms/bosses.js';
import { MEGA_MODELS } from './swarms/megas.js';
import { WAVE2_MODELS } from './swarms/wave2.js';

// ---------------------------------------------------------------------------
// Core models (more in swarmModelsExtra.js)

const MODELS = {
  panther(o = {}) {
    const skin = o.skin;
    const wrap = skin === 'wrapperPanther';
    const fur = wrap ? 0x1d9bf0 : C.blue;
    const furD = wrap ? 0x0f5fa0 : C.blueD;
    const belly = wrap ? 0xc8ccd8 : 0x9ee3ff;
    const body = new VoxGrid();
    body.box(-3, 0, -5, 2, 4, 4, fur);
    body.box(-2, 0, -4, 1, 0, 3, belly);
    // stripes
    for (let z = -4; z <= 3; z += 3) body.box(-3, 4, z, 2, 4, z, furD).box(-3, 3, z, -3, 3, z, furD).box(2, 3, z, 2, 3, z, furD);
    // pink lightning bolt on both flanks
    for (const x of [-3, 2]) {
      body.set(x, 3, 1, C.pink).set(x, 2, 0, C.pink).set(x, 2, -1, C.pink).set(x, 1, -2, C.pink).set(x, 2, 1, C.pink);
    }
    if (wrap) {
      body.box(-3, 0, -1, 2, 4, 1, 0x1d9bf0);
      body.box(-3, 1, 0, -3, 3, 0, C.white).box(2, 1, 0, 2, 3, 0, C.white);
      body.box(-3, 0, 2, 2, 4, 2, 0xd8dde8).box(-3, 0, -2, 2, 4, -2, 0xd8dde8);
    }
    const head = new VoxGrid();
    head.box(-3, -2, 0, 2, 3, 5, fur);
    head.box(-2, -2, 6, 1, 0, 7, belly); // snout
    head.box(-1, 0, 8, 0, 0, 8, C.pink); // nose
    head.box(-2, -2, 8, 1, -2, 8, 0x3a0f1f); // mouth line
    head.set(-2, -1, 8, C.tooth).set(1, -1, 8, C.tooth);
    eyes(head, 1, 1, 5, { w: 2, h: 2, pupil2: 0x7fe8ff });
    // ears
    head.box(-3, 4, 1, -2, 5, 2, fur).set(-3, 4, 3, C.pink).set(-2, 4, 3, C.pink);
    head.box(1, 4, 1, 2, 5, 2, fur).set(1, 4, 3, C.pink).set(2, 4, 3, C.pink);
    head.box(-3, 3, 0, 2, 3, 0, furD);
    // cheek fluff
    head.box(-4, -1, 2, -4, 1, 4, furD).box(3, -1, 2, 3, 1, 4, furD);
    const tail = new VoxGrid();
    tail.box(-1, 0, -4, 0, 0, -1, fur).box(-1, 1, -6, 0, 1, -5, fur).box(-1, 2, -7, 0, 2, -7, C.pink);
    return {
      gait: 'walk',
      parts: [
        ...legs4(fur, belly, { h: 3, x: 2, fz: 3, bz: -3, toe: true, claws: true }),
        { name: 'body', grid: body, at: [0, 3, 0] },
        { name: 'head', grid: head, at: [0, 6, 3], parent: null },
        { name: 'tail', grid: tail, at: [0, 7, -5] },
      ],
      muzzle: [0, 7, 11],
    };
  },

  feastablesPanther(o = {}) {
    const golden = o.skin === 'goldenWrapperPanther';
    const choco = golden ? 0xb8862b : C.choco, chocoL = golden ? 0xe0b040 : C.chocoL, chocoD = golden ? 0x8a5a1a : 0x3e2014;
    const wrapC = golden ? 0xffd23f : 0x1d9bf0;
    const bar = (x, y, z) => ((x % 3 === 0 || z % 3 === 0) ? chocoD : (noise(x, y, z) < 0.5 ? choco : chocoL));
    const body = new VoxGrid();
    body.box(-5, 0, -7, 4, 7, 7, bar);
    body.carve((x, y, z) => (Math.abs(x + 0.5) > 4 && (y === 0 || y === 7)) || (Math.abs(z) === 7 && (y === 0 || y === 7)));
    // wrapper band (torn foil edges)
    body.box(-6, -1, -3, 5, 8, 2, wrapC);
    body.box(-6, 2, -1, -6, 5, 0, C.white).box(5, 2, -1, 5, 5, 0, C.white); // label
    body.set(-6, 4, 0, C.pink).set(5, 4, 0, C.pink).set(-6, 3, -1, C.pink).set(5, 3, -1, C.pink);
    for (let x = -6; x <= 5; x++) {
      body.set(x, 8, 3, (x & 1) ? 0xd8dde8 : null).set(x, -1, 3, (x & 1) ? null : 0xd8dde8);
      body.set(x, 8, -4, (x & 1) ? null : 0xd8dde8);
    }
    body.carve((x, y, z) => (y === -1 || y === 8) && (z === -3 || z === 2) && (x & 1));
    // drips
    for (const [x, z] of [[-5, 5], [4, -6], [-2, 6], [3, 4]]) body.box(x, -2, z, x, -1, z, chocoL);
    const head = new VoxGrid();
    head.box(-4, -3, 0, 3, 4, 7, bar);
    head.box(-3, -3, 8, 2, 0, 9, chocoL); // snout
    head.box(-1, 0, 10, 0, 0, 10, C.pink);
    mouth(head, -3, 2, -3, -1, 10, { tongue: true });
    eyes(head, 1, 1, 7, { w: 3, h: 2, white: 0xfff27a, glow: true, pupil: 0xff2e88 });
    // brows of broken chocolate
    head.box(-4, 3, 8, -2, 3, 8, chocoD).box(1, 3, 8, 3, 3, 8, chocoD);
    // ears with wrapper inside
    head.box(-4, 5, 2, -2, 7, 3, choco).box(-3, 5, 4, -3, 6, 4, wrapC);
    head.box(1, 5, 2, 3, 7, 3, choco).box(2, 5, 4, 2, 6, 4, wrapC);
    // chocolate chunk crown
    head.box(-1, 5, 3, 0, 6, 4, chocoL);
    head.box(-5, -2, 3, -5, 1, 6, chocoD).box(4, -2, 3, 4, 1, 6, chocoD);
    const tail = new VoxGrid();
    tail.box(-1, 0, -5, 0, 1, -1, choco).box(-1, 2, -8, 0, 3, -6, choco).box(-2, 3, -10, 1, 4, -9, wrapC);
    const jaw = new VoxGrid();
    jaw.box(-3, -1, 0, 2, 0, 4, chocoD);
    teeth(jaw, -3, 2, 1, 4);
    return {
      gait: 'walk',
      parts: [
        ...legs4(choco, chocoD, { h: 5, w: 3, x: 3, fz: 5, bz: -5, toe: true, claws: true }),
        { name: 'body', grid: body, at: [0, 5, 0] },
        { name: 'head', grid: head, at: [0, 11, 6] },
        { name: 'jaw', grid: jaw, at: [0, 7, 11] },
        { name: 'tail', grid: tail, at: [0, 11, -7] },
      ],
      muzzle: [0, 10, 17],
    };
  },

  cloggedToilet(o = {}) {
    const ketchup = o.skin === 'ketchupClog';
    const por = 0xf4f6f8, porD = 0xd6dbe4;
    const sludge = ketchup ? 0xd8262f : 0x7a6a2a, sludge2 = ketchup ? 0xff4a3a : 0x8fb23a;
    const body = new VoxGrid();
    body.box(-2, 0, -2, 1, 2, 2, por); // pedestal
    body.ellipsoid(-0.5, 4.5, 1, 4.2, 2.3, 4.2, por);
    body.carve((x, y, z) => y >= 5 && ((x + 0.5) ** 2) / 9 + ((z - 1) ** 2) / 9 < 1);
    body.ellipsoid(-0.5, 5, 1, 3, 0.4, 3, (x, y, z) => (noise(x, y, z) < 0.45 ? sludge2 : sludge));
    // rim teeth around the front
    for (let x = -4; x <= 3; x++) if ((x & 1) === 0) body.set(x, 7, 4, C.tooth);
    body.box(-4, 6, 5, 3, 6, 5, porD);
    // tank
    body.box(-4, 5, -5, 3, 12, -3, por);
    body.box(-4, 12, -5, 3, 12, -3, porD);
    body.box(-5, 13, -6, 4, 13, -2, por); // tank lid
    body.box(3, 10, -2, 4, 10, -2, C.metal).set(5, 10, -2, C.metal); // handle
    body.box(-4, 8, -2, 3, 11, -2, por);
    eyes(body, 1, 8, -2, { w: 2, h: 3, pupilY: 8, angry: true });
    // drips of sludge
    body.set(-3, 5, 5, sludge2).set(-3, 4, 5, sludge2).set(2, 5, 5, sludge2);
    const lid = new VoxGrid();
    lid.box(-4, 0, 0, 3, 0, 7, porD);
    lid.box(-3, 1, 1, 2, 1, 6, por);
    return {
      gait: 'hop',
      parts: [
        ...feet2(porD, { h: 2, x: 2, z: 1 }),
        { name: 'body', grid: body, at: [0, 2, 0] },
        { name: 'lid', grid: lid, at: [0, 9, -2], parent: 'body' },
      ],
      muzzle: [0, 9, 3],
    };
  },

  trashedCan(o = {}) {
    const cart = o.skin === 'cartCan';
    const m = 0x8f98aa, mD = 0x6b7386, mL = 0xb8c0cc;
    const body = new VoxGrid();
    body.cylinder(-0.5, -0.5, 0, 10, 4, (x, y, z) => (y % 3 === 0 ? mD : noise(x, y, z) < 0.15 ? mL : m), 'y');
    body.cylinder(-0.5, -0.5, 1, 10, 3, null, 'y'); // hollow
    body.cylinder(-0.5, -0.5, 0, 0, 3, mD, 'y');
    // dents & stickers
    body.box(-5, 4, -1, -5, 6, 0, 0x3a9a3a).set(-5, 5, 1, C.yellow);
    // glowing eyes in the dark gap + teeth rim
    body.box(-3, 9, 3, 2, 10, 3, 0x1a1420);
    eyes(body, 1, 9, 4, { w: 2, h: 1, white: 0xfff27a, glow: true, pupil: 0xff4a4a });
    for (let x = -4; x <= 3; x += 2) body.set(x, 10, 4, C.tooth);
    // trash sticking out
    const lid = new VoxGrid();
    lid.cylinder(-0.5, 3.5, 0, 0, 4.5, mL, 'y');
    lid.box(-1, 1, 3, 0, 1, 4, mD); // handle
    lid.box(-3, -1, 6, -2, -1, 7, C.yellow).set(-4, -2, 7, C.yellow); // banana peel
    lid.box(1, -1, 1, 2, 0, 2, 0xe0e0e0).set(3, -1, 2, 0xe0e0e0); // fish bone
    const parts = [
      ...feet2(mD, { h: 2, x: 2, z: 0 }),
      { name: 'body', grid: body, at: [0, 2, 0] },
      { name: 'lid', grid: lid, at: [0, 13, -4], parent: 'body' },
      ...arms2(m, { x: 5, y: 8, z: 0, len: 3, claws: true, parent: 'body' }),
    ];
    if (cart) {
      for (const [n, x, z] of [['wheelFL', -3, 3], ['wheelFR', 3, 3], ['wheelBL', -3, -3], ['wheelBR', 3, -3]]) {
        const w = new VoxGrid();
        w.box(0, -1, -1, 0, 0, 0, 0x222222).set(0, 0, 0, C.red);
        parts.push({ name: n, grid: w, at: [x, 1, z], pivot: [0.5, -0.5, -0.5] });
      }
    }
    return { gait: 'hop', parts, muzzle: [0, 10, 5] };
  },

  beastTiger(o = {}) {
    const fur = 0xff8a1f, furD = 0xd8601a, stripe = 0x1a1420, white = 0xfff4e8;
    const st = (x, y, z) => ((z + Math.floor(y / 2)) % 4 === 0 ? stripe : fur);
    const body = new VoxGrid();
    body.box(-4, 0, -7, 3, 6, 6, st);
    body.box(-3, 0, -6, 2, 0, 5, white);
    body.box(-3, 1, 4, 2, 4, 6, white); // chest
    const head = new VoxGrid();
    head.box(-4, -3, 0, 3, 4, 7, (x, y, z) => (y >= 3 && (x === -2 || x === 1) ? stripe : fur));
    head.box(-3, -3, 8, 2, 0, 9, white);
    head.box(-1, 0, 10, 0, 0, 10, 0x2a1a1a);
    eyes(head, 1, 1, 7, { w: 2, h: 2, white: 0x9ff2ff, glow: true, pupil: 0x1477c9, angry: true });
    head.box(-4, 5, 1, -3, 6, 3, fur).set(-4, 5, 4, C.pink);
    head.box(2, 5, 1, 3, 6, 3, fur).set(3, 5, 4, C.pink);
    head.box(-5, -3, 2, -5, 1, 6, white).box(4, -3, 2, 4, 1, 6, white); // ruff
    const jaw = new VoxGrid();
    jaw.box(-3, -1, 0, 2, 0, 4, white);
    jaw.box(-2, 0, 0, 1, 0, 3, 0x7a1a2a);
    teeth(jaw, -3, 2, 1, 4);
    jaw.set(-3, 2, 4, C.tooth).set(2, 2, 4, C.tooth);
    const tail = new VoxGrid();
    tail.box(-1, 0, -6, 0, 1, -1, st).box(-1, 2, -9, 0, 3, -7, fur).box(-1, 4, -10, 0, 4, -10, stripe);
    return {
      gait: 'walk',
      parts: [
        ...legs4(fur, white, { h: 4, w: 3, x: 3, fz: 4, bz: -5, toe: true, claws: true }),
        { name: 'body', grid: body, at: [0, 4, 0] },
        { name: 'head', grid: head, at: [0, 9, 5] },
        { name: 'jaw', grid: jaw, at: [0, 6, 9] },
        { name: 'tail', grid: tail, at: [0, 9, -6] },
      ],
      muzzle: [0, 9, 15],
    };
  },

  /** Fallback generic blob creature, tinted by series colour. */
  blob(o = {}) {
    const col = o.color ?? 0x7cff3a;
    const body = new VoxGrid();
    body.ellipsoid(-0.5, 4, 0, 4, 4, 4, (x, y, z) => (noise(x, y, z) < 0.2 ? shade(col, -0.15) : col));
    eyes(body, 1, 5, 4, { w: 2, h: 2 });
    mouth(body, -2, 1, 2, 3, 4, { tongue: true });
    return { gait: 'hop', parts: [...feet2(shade(col, -0.25), { h: 1, x: 2 }), { name: 'body', grid: body, at: [0, 1, 0] }] };
  },
};

// New high-resolution toy models override the legacy ones as they land.
const ALL_MODELS = {
  ...MODELS, ...EXTRA_MODELS,
  ...PANTHER_MODELS, ...HOME_HORROR_MODELS, ...CRITTER_MODELS, ...TECHNO_MODELS, ...TOXIC_MODELS, ...FUSION_MODELS, ...SNACK_MODELS, ...BOSS_MODELS, ...MEGA_MODELS, ...WAVE2_MODELS,
};

export function hasModel(id) {
  return !!ALL_MODELS[id];
}

const defCache = new Map();

/** Build a SwarmRig for a swarm id. opts: { variant, skin, scale, model } */
export function createSwarm(id, opts = {}) {
  const modelId = opts.model ?? id;
  const builder = ALL_MODELS[modelId] || MODELS.blob;
  const dkey = `${modelId}|${opts.skin ?? ''}`;
  let def = defCache.get(dkey);
  if (!def) {
    def = builder({ skin: opts.skin });
    defCache.set(dkey, def);
  }
  const size = opts.scale ?? 1;
  const rig = new SwarmRig(def, { variant: opts.variant ?? 'base', cacheKey: `${modelId}|${opts.skin ?? ''}`, scale: size });
  rig.id = id;
  return rig;
}

export const MODEL_IDS = Object.keys(ALL_MODELS);
