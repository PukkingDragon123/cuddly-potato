// Cached 3D-rendered vial icons (HUD slots, home screen, result screens).
// vialThumb(type, size = 128) -> PNG data URL of the vial's toy model.
import { engine } from '../core/engine.js';
import { makeVial } from '../models/props/vials.js';
import { VIALS, vialId } from '../data/vials.js';

const cache = new Map();

// Camera framing per product (the briefcase lies flat, so look down more).
const FRAME = {
  testTube: { yaw: -0.42, pitch: 0.2, zoom: 0.94 },
  labPack: { yaw: -0.5, pitch: 0.32, zoom: 0.92 },
  megaLab: { yaw: -0.5, pitch: 0.3, zoom: 0.92 },
  cashCase: { yaw: -0.45, pitch: 0.62, zoom: 0.9 },
};

/**
 * vialThumb(type, size = 128, opts) -> data URL (square, transparent background).
 * opts: { w, h } to render a non-square image instead.
 */
export function vialThumb(type, size = 128, opts = {}) {
  const id = vialId(type);
  const w = opts.w ?? size, h = opts.h ?? size;
  const key = `${id}|${w}x${h}`;
  if (cache.has(key)) return cache.get(key);
  const v = makeVial(id, { thumb: true });
  v.update(0);
  const f = FRAME[VIALS[id]?.product] ?? FRAME.testTube;
  let url = '';
  try {
    url = engine.renderThumb(v.root, { w, h, yaw: f.yaw, pitch: f.pitch, zoom: f.zoom });
  } finally {
    v.dispose();
  }
  cache.set(key, url);
  return url;
}
