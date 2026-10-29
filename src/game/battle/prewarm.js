// Battle prewarm, run while the loading screen is still up: builds every deck card's
// Swarm model once (voxel geometry is cached per model) and compiles its materials (plus
// the unit ground decals) against the arena's lights and fog. Without it the FIRST deploy
// of each card builds its voxel meshes and compiles its shaders mid-battle: a visible hitch.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { createSwarm } from '../../models/swarmModels.js';
import { SWARMS } from '../../data/swarms.js';

const nextTask = () => new Promise((r) => setTimeout(r, 0));

/** bs: the BattleScene (sim, view, scene, camera). Never throws; resolves when done. */
export async function prewarmBattle(bs) {
  try {
    const holder = new THREE.Group();
    const seen = new Set();
    const want = [];
    for (const side of bs.sim?.sides ?? []) for (const c of side.deck ?? []) if (!c.spell && SWARMS[c.unit]) want.push(c);
    const boss = bs.cfg?.boss;
    if (boss?.unit && SWARMS[boss.unit]) want.push({ unit: boss.unit, model: boss.model });
    for (const c of want) {
      const key = `${c.unit}|${c.variant ?? 'base'}|${c.skin ?? ''}|${c.model ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        holder.add(createSwarm(c.unit, { variant: c.variant ?? 'base', skin: c.skin ?? null, model: c.model }).root);
      } catch (e) { /* a model that fails here fails visibly in battle too */ }
      await nextTask(); // keep the loading screen animating between model builds
    }
    const v = bs.view;
    const plane = new THREE.PlaneGeometry(1, 1);
    for (const m of [v?.shadowMat, ...(v?.ringMats ?? [])]) if (m) holder.add(new THREE.Mesh(plane, m));
    await engine.precompile(holder, bs.camera, bs.scene);
    plane.dispose();
  } catch (e) { /* only an optimisation */ }
}
