// Cached voxel thumbnails (data URLs) for cards, portraits and icons.
import { engine } from '../core/engine.js';
import { createSwarm } from '../models/swarmModels.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';

const cache = new Map();

export function swarmThumb(id, variant = 'base', skin = null, size = 96) {
  const key = `s|${id}|${variant}|${skin}|${size}`;
  if (cache.has(key)) return cache.get(key);
  const rig = createSwarm(id, { variant, skin });
  rig.update(0.016);
  const url = engine.renderThumb(rig.root, { size, yaw: -0.6, pitch: 0.25 });
  cache.set(key, url);
  return url;
}

/** Head-and-shoulders portrait of a chibi character. */
export function charPortrait(charId, opts = {}) {
  const key = `c|${charId}|${opts.eyes}|${opts.mouth}|${opts.size}|${JSON.stringify(opts.override ?? null)}`;
  if (cache.has(key)) return cache.get(key);
  const def = { ...CHARACTERS[charId], ...(opts.override ?? {}) };
  const c = new Chibi(def);
  c.expr(opts.eyes ?? 'normal', opts.mouth ?? 'smile');
  c.face.blinkT = 99;
  c.update(0.016);
  c.face.redraw();
  const url = engine.renderThumb(c.root, { size: opts.size ?? 96, yaw: opts.yaw ?? -0.25, pitch: 0.1, zoom: opts.full ? 1 : 0.62, focusHead: true });
  cache.set(key, url);
  return url;
}

/** Thumbnail of an arbitrary Object3D factory (props, vials...). */
export function objThumb(key, factory, opts = {}) {
  const k = `o|${key}|${opts.size ?? 96}`;
  if (cache.has(k)) return cache.get(k);
  const url = engine.renderThumb(factory(), { size: opts.size ?? 96, yaw: opts.yaw ?? -0.5, pitch: opts.pitch ?? 0.3, zoom: opts.zoom ?? 1 });
  cache.set(k, url);
  return url;
}
