// Arena environments registry. Each arena module exports:
//   buildBattle(K, opts) -> { sky, fog, lights, dust, bloom? }   (scenery goes into K.root)
//   buildZone(K, opts)   -> { focus: [x,y,z], radius }           (Beast Island diorama, hotspots in K.hotspots)
// where K is an ArenaKit (see ./kit.js).
import { ArenaKit } from './kit.js';

const MODULES = {
  lab: () => import('./lab.js'),
  circle: () => import('./circle.js'),
  factory: () => import('./factory.js'),
  mart: () => import('./mart.js'),
  redlight: () => import('./redlight.js'),
  antarctica: () => import('./antarctica.js'),
  reactor: () => import('./reactor.js'),
  pyramid: () => import('./pyramid.js'),
  island: () => import('./island.js'),
  // the Northern Wilds
  jungle: () => import('./jungle.js'),
  laser: () => import('./laser.js'),
  haunted: () => import('./haunted.js'),
  reef: () => import('./reef.js'),
  volcano: () => import('./volcano.js'),
  space: () => import('./space.js'),
};
export const ARENA_THEMES = Object.keys(MODULES);

async function load(id) {
  const fn = MODULES[id] ?? MODULES.lab;
  try {
    return await fn();
  } catch (e) {
    console.warn('arena module missing, falling back to lab:', id, e);
    return MODULES.lab();
  }
}

/** Build a battle arena. Returns { root, update(dt,t), breakables, sky, fog, lights, dust, bloom }. */
export async function makeArenaBattle(id, opts = {}) {
  const mod = await load(id);
  const K = new ArenaKit(id + ':battle', opts.seed ?? 1);
  let params = {};
  try {
    params = mod.buildBattle(K, opts) || {};
  } catch (e) {
    console.error('arena build failed', id, e);
  }
  return { root: K.root, update: (dt, t) => K.update(dt, t), breakables: K.breakables, ...params };
}

/** Build a Beast Island zone diorama. Returns { root, update(dt,t), hotspots, focus, radius }. */
export async function makeArenaZone(id, opts = {}) {
  const mod = await load(id);
  const K = new ArenaKit(id + ':zone', opts.seed ?? 2);
  let params = {};
  try {
    params = mod.buildZone ? mod.buildZone(K, opts) || {} : {};
  } catch (e) {
    console.error('zone build failed', id, e);
  }
  return { root: K.root, update: (dt, t) => K.update(dt, t), hotspots: K.hotspots, focus: [0, 1, 0], radius: 7, ...params };
}
