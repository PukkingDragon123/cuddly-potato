// Cached 3D-rendered thumbnails (data URLs) for cards, portraits and icons,
// plus a lazy render queue so screens full of cards never block a frame.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { createSwarm } from '../models/swarmModels.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { SPELLS } from '../data/spells.js';

const cache = new Map();
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** Card portrait of a Swarm (3/4 view, fills a 4:5 card). */
export function swarmThumb(id, variant = 'base', skin = null, size = 160, opts = {}) {
  const key = `s|${id}|${variant}|${skin}|${size}|${opts.pose ?? ''}`;
  if (cache.has(key)) return cache.get(key);
  const rig = createSwarm(id, { variant, skin });
  rig.setState('idle');
  if (opts.pose === 'attack') rig.attack(0.5);
  for (let i = 0; i < 6; i++) rig.update(opts.pose === 'attack' ? 0.05 : 0.016);
  const url = engine.renderThumb(rig.root, { w: size, h: Math.round(size * 1.25), yaw: opts.yaw ?? 0.62, pitch: 0.16, zoom: opts.zoom ?? 0.82, lift: -0.02 });
  cache.set(key, url);
  return url;
}

/** Head-and-shoulders portrait of a chibi character. */
export function charPortrait(charId, opts = {}) {
  const key = `c|${charId}|${opts.eyes}|${opts.mouth}|${opts.size}|${opts.full}|${JSON.stringify(opts.override ?? null)}`;
  if (cache.has(key)) return cache.get(key);
  const def = { ...CHARACTERS[charId], ...(opts.override ?? {}) };
  const c = new Chibi(def);
  c.expr(opts.eyes ?? 'normal', opts.mouth ?? 'smile');
  c.face.blinkT = 99;
  c.update(0.016);
  c.face.redraw();
  const url = engine.renderThumb(c.root, { size: opts.size ?? 128, yaw: opts.yaw ?? -0.25, pitch: 0.1, zoom: opts.full ? 1 : 0.62, focusHead: !opts.full });
  cache.set(key, url);
  return url;
}

/** Thumbnail of an arbitrary Object3D factory (props, vials...). */
export function objThumb(key, factory, opts = {}) {
  const k = `o|${key}|${opts.size ?? 128}|${opts.w ?? ''}x${opts.h ?? ''}`;
  if (cache.has(k)) return cache.get(k);
  const url = engine.renderThumb(factory(), { size: opts.size ?? 128, w: opts.w, h: opts.h, yaw: opts.yaw ?? -0.5, pitch: opts.pitch ?? 0.3, zoom: opts.zoom ?? 1 });
  cache.set(k, url);
  return url;
}

// --------------------------------------------------------------------------- spell art

async function spellObject(id) {
  const P = await import('../models/props.js');
  const g = new THREE.Group();
  const add = (o, x = 0, y = 0, z = 0, s = 1, ry = 0) => { if (!o) return; o.position.set(x, y, z); o.scale.multiplyScalar(s); o.rotation.y = ry; g.add(o); };
  switch (id) {
    case 'foodThrow':
      add(P.makeFood('burger'), -0.25, 0, 0, 1.4, 0.4);
      add(P.makeFood('pizza'), 0.35, 0.05, 0.25, 1.2, -0.6);
      add(P.makeFood('donut'), 0.05, 0.42, -0.1, 1.1, 0.2);
      break;
    case 'moneyDrop': add(P.makeMoneyBag(), 0, 0, 0, 1.1, 0.4); break;
    case 'sodaRocket': { const r = P.makeSodaRocket(); r.rotation.z = -0.5; add(r, 0, 0, 0, 1.2); break; }
    case 'slimeFlood': add(P.makeBeaker(0x7cff3a), 0, 0, 0, 2.2, 0.3); break;
    case 'freezeRay': {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ color: 0x9ff2ff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.9 }));
      m.scale.set(0.8, 1.3, 0.8);
      m.position.y = 0.65;
      g.add(m);
      for (let i = 0; i < 4; i++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), m.material);
        s.position.set(Math.cos(i * 1.6) * 0.5, 0.25 + (i % 2) * 0.2, Math.sin(i * 1.6) * 0.4);
        s.scale.set(0.7, 1.3, 0.7);
        g.add(s);
      }
      break;
    }
    case 'labShield': {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x29b6f6, roughness: 0.1, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      g.add(m);
      const core = P.makeBeaker(0x29b6f6);
      core.scale.multiplyScalar(1.4);
      g.add(core);
      break;
    }
    default: add(P.makeBeaker(0xff2e88), 0, 0, 0, 2);
  }
  return g;
}
const spellUrls = new Map();
export function spellThumbAsync(id, size = 160) {
  const k = `${id}|${size}`;
  if (spellUrls.has(k)) return Promise.resolve(spellUrls.get(k));
  return spellObject(id).then((o) => {
    const url = engine.renderThumb(o, { w: size, h: Math.round(size * 1.25), yaw: -0.4, pitch: 0.3, zoom: 0.95 });
    spellUrls.set(k, url);
    return url;
  });
}

// --------------------------------------------------------------------------- lazy queue

const queue = [];
const jobs = new Map();
let pumping = false;
function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 12) {
    const job = queue.shift();
    jobs.delete(job.key);
    const live = job.imgs.filter((i) => i.isConnected || job.force);
    if (!live.length) continue;
    let res = null;
    try {
      res = job.gen();
    } catch (e) {
      console.warn('thumb failed', job.key, e);
    }
    const apply = (url) => {
      cache.set('lazy|' + job.key, url);
      for (const img of job.imgs) {
        if (url) img.src = url;
        img.classList.add('loaded');
      }
    };
    if (res && typeof res.then === 'function') res.then(apply, () => apply(null));
    else apply(res);
  }
  if (queue.length) requestAnimationFrame(pump);
  else pumping = false;
}
// Deferred start for images that only render once scrolled near the viewport.
let io = null;
const ioStart = new WeakMap();
function whenVisible(img, start) {
  if (typeof IntersectionObserver === 'undefined') return start();
  if (!io) {
    io = new IntersectionObserver((ents) => {
      for (const e of ents) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const f = ioStart.get(e.target);
        ioStart.delete(e.target);
        f?.();
      }
    }, { rootMargin: '160px 0px' });
  }
  ioStart.set(img, start);
  io.observe(img);
}

/**
 * <img> whose src is generated lazily (spread over frames). gen() may return a URL or a Promise of one.
 * opts: { priority, force, visible (wait until the image scrolls near the viewport) }
 */
export function lazyImg(key, gen, cls = '', opts = {}) {
  const img = document.createElement('img');
  img.className = 'thumb ' + cls;
  img.draggable = false;
  img.alt = '';
  const hit = cache.get('lazy|' + key);
  if (hit) {
    img.src = hit;
    img.classList.add('loaded');
    return img;
  }
  img.src = BLANK;
  const start = () => {
    const done = cache.get('lazy|' + key);
    if (done) { img.src = done; img.classList.add('loaded'); return; }
    let job = jobs.get(key);
    if (!job) {
      job = { key, gen, imgs: [], force: !!opts.force };
      jobs.set(key, job);
      if (opts.priority) queue.unshift(job); else queue.push(job);
    }
    job.imgs.push(img);
    if (!pumping) {
      pumping = true;
      requestAnimationFrame(pump);
    }
  };
  if (opts.visible) requestAnimationFrame(() => (img.isConnected ? whenVisible(img, start) : setTimeout(() => whenVisible(img, start), 60)));
  else start();
  return img;
}

/** Card art for any card id (Swarm or spell). */
export function cardArtImg(id, variant = 'base', skin = null, size = 160, cls = '', opts = {}) {
  if (SPELLS[id]) return lazyImg(`sp|${id}|${size}`, () => spellThumbAsync(id, size), cls, opts);
  return lazyImg(`s|${id}|${variant}|${skin}|${size}`, () => swarmThumb(id, variant, skin, size), cls, opts);
}

// --------------------------------------------------------------------------- arena dioramas + lab skins

const arenaUrls = new Map();
/**
 * Snapshot of an arena's Beast Island diorama (the voxel plinth with its props), for
 * banners. Resolves null when the arena has no diorama module. o: { w, h, yaw, pitch, zoom }
 */
export async function arenaThumb(id, o = {}) {
  const w = o.w ?? 360, hh = o.h ?? 200;
  const k = `${id}|${w}x${hh}|${o.yaw ?? ''}|${o.zoom ?? ''}`;
  if (arenaUrls.has(k)) return arenaUrls.get(k);
  const A = await import('../models/arenas/index.js');
  if (!A.ARENA_THEMES?.includes(id)) return null;
  const z = await A.makeArenaZone(id);
  try { z.update?.(0.016, 2.5); } catch (e) { /* animated bits are optional */ }
  const url = engine.renderThumb(z.root, { w, h: hh, yaw: o.yaw ?? -0.38, pitch: o.pitch ?? 0.68, zoom: o.zoom ?? 0.88 });
  arenaUrls.set(k, url);
  return url;
}
/** Lazy <img> of an arena diorama (renders when scrolled into view). Falls back to `fallback` (URL) if none. */
export function arenaImg(id, cls = '', o = {}) {
  return lazyImg(`ar|${id}|${o.w ?? 360}x${o.h ?? 200}`, () => arenaThumb(id, o).then((u) => u ?? o.fallback ?? BLANK), cls, { visible: o.visible ?? true, priority: o.priority });
}

const labUrls = new Map();
/** 3D render of a Lab building style (Lab skins: default, mansion, martLab, chocoLab, goldVault...). */
export async function labSkinThumb(style, size = 160) {
  const k = `${style}|${size}`;
  if (labUrls.has(k)) return labUrls.get(k);
  const { makeLabBuilding } = await import('../models/props/lab.js');
  const lab = makeLabBuilding({ style });
  try { lab.update?.(0.016); } catch (e) { /* ignore */ }
  const url = engine.renderThumb(lab.root, { size, yaw: -0.55, pitch: 0.26, zoom: 0.94 });
  labUrls.set(k, url);
  return url;
}
export function labSkinImg(style, size = 160, cls = '') {
  return lazyImg(`lab|${style}|${size}`, () => labSkinThumb(style, size), cls, { visible: true });
}
