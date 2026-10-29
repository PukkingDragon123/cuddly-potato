// Human art in the DOM UI drawn as the game's 3D voxel chibis (same models as
// the characters on Beast Island) instead of flat 2D pixel people, so every human
// on screen shares one style. Loaded lazily by ui.js icon() / pointAt().
//   chibiIconURL('friends')   two chibi buddies (Nolan + Juan), ink outlined
//   chibiHandURL()            the tutorial pointer: a chibi gloved hand, index finger out
// Each render gets a 1-texel ink outline + soft drop so it sits in the pixel UI.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { makeMesh } from '../core/voxel.js';
import { buildHand, H as FV } from '../models/characters/parts.js';
import { CHARACTERS } from '../data/characters.js';
import { charPortrait } from './thumbs.js';

const cache = new Map();

function loadImg(url) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}
/** Ink outline (4-neighbour dilation, `w` texels) under the sprite, plus a drop shadow. */
function outlined(src, w = 2, drop = 2) {
  const W = src.width, H = src.height;
  const sil = document.createElement('canvas');
  sil.width = W; sil.height = H;
  const sg = sil.getContext('2d');
  sg.drawImage(src, 0, 0);
  sg.globalCompositeOperation = 'source-in';
  sg.fillStyle = '#120c24';
  sg.fillRect(0, 0, W, H);
  const out = document.createElement('canvas');
  out.width = W; out.height = H;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.globalAlpha = 0.45;
  g.drawImage(sil, drop, drop + w);
  g.globalAlpha = 1;
  for (let dy = -w; dy <= w; dy++) for (let dx = -w; dx <= w; dx++) if (Math.abs(dx) + Math.abs(dy) <= w) g.drawImage(sil, dx, dy);
  g.drawImage(src, 0, 0);
  return out;
}
const toCanvas = (im, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(im, 0, 0, w, h); return c; };

/** Async: URL of a chibi-rendered icon, or null for names that aren't human art. */
export async function chibiIconURL(name) {
  if (cache.has(name)) return cache.get(name);
  let url = null;
  if (name === 'friends') {
    const S = 96;
    const [a, b] = await Promise.all([
      loadImg(charPortrait('juan', { size: 112, mouth: 'grin', yaw: 0.35 })),
      loadImg(charPortrait('nolan', { size: 112, mouth: 'grin', yaw: -0.3 })),
    ]);
    const c = document.createElement('canvas');
    c.width = S; c.height = S;
    const g = c.getContext('2d');
    if (a) g.drawImage(outlined(toCanvas(a, 70, 70)), S - 72, 2);
    if (b) g.drawImage(outlined(toCanvas(b, 76, 76)), -2, S - 78);
    url = c.toDataURL();
  }
  cache.set(name, url);
  return url;
}
export const CHIBI_ICONS = new Set(['friends']);

/** The tutorial pointer hand as a voxel chibi glove (index finger pointing up-left). */
export function chibiHandURL(rot = [0.3, 0.6, Math.PI + 0.5]) {
  const key = 'hand|' + rot.map((v) => v.toFixed(2)).join(',');
  if (cache.has(key)) return cache.get(key);
  const def = { ...CHARACTERS.recruit, gloves: 0xffffff };
  const { g } = buildHand(def, 'point', -1);
  // lab-glove cuff (pink, with a white stripe) so the hand reads at small sizes
  for (let x = -2; x <= 1; x++) for (let y = 0; y <= 1; y++) for (let z = -2; z <= 2; z++) {
    const e = (x === -2 || x === 1) + (z === -2 || z === 2);
    if (e === 2) continue;
    if (e) g.set(x, y, z, y === 1 ? 0xffffff : 0xff2e88);
  }
  const mesh = makeMesh(g.build({ scale: FV, pivot: 'center' }));
  const holder = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.add(mesh);
  tilt.rotation.set(rot[0], rot[1], rot[2]); // finger up-left like a cursor, thumb + knuckles toward the camera
  holder.add(tilt);
  const url0 = engine.renderThumb(holder, { size: 72, yaw: 0, pitch: 0.15, zoom: 0.9 });
  const src = engine.thumbCanvas;
  let url = url0;
  if (src) url = outlined(toCanvas(src, 72, 72), 2, 2).toDataURL();
  cache.set(key, url);
  return url;
}
