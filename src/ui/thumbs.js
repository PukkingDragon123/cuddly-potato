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
  const key = `c|${charId}|${opts.eyes}|${opts.mouth}|${opts.mood}|${opts.size}|${opts.full}|${JSON.stringify(opts.override ?? null)}`;
  if (cache.has(key)) return cache.get(key);
  const def = { ...CHARACTERS[charId], ...(opts.override ?? {}) };
  const c = new Chibi(def, { fidget: false });
  if (opts.mood) c.mood(opts.mood);
  else c.expr(opts.eyes ?? 'normal', opts.mouth ?? 'smile');
  c.face.blinkT = 99;
  c.face.autoLook = false;
  c.snap();
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

// SPECIAL cards: little 3D playing cards with a pixel-art face (icon on a
// coloured foil field, gold trim), arranged per trick.
async function cardFaceTex(iconName, color, gold = false) {
  const { iconURL } = await import('./icons.js');
  const img = new Image();
  img.src = iconURL(iconName);
  try { await img.decode(); } catch (e) { /* draw without the icon */ }
  const W = 64, H = 88;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const col = new THREE.Color(color);
  const dark = col.clone().multiplyScalar(0.35).getStyle();
  const mid = col.getStyle();
  g.fillStyle = gold ? '#7a4a06' : '#140c2e';
  g.fillRect(0, 0, W, H);
  g.fillStyle = gold ? '#ffd84a' : '#fff4c0';
  g.fillRect(2, 2, W - 4, H - 4);
  g.fillStyle = gold ? '#b8740c' : dark;
  g.fillRect(4, 4, W - 8, H - 8);
  // foil field with pixel rays
  for (let y = 6; y < H - 6; y += 2) {
    for (let x = 6; x < W - 6; x += 2) {
      const a = Math.atan2(y - H * 0.45, x - W / 2);
      const ray = Math.floor((a + Math.PI) / (Math.PI / 6)) % 2;
      g.fillStyle = ray ? mid : (gold ? '#ffe9a0' : col.clone().lerp(new THREE.Color('#ffffff'), 0.3).getStyle());
      g.globalAlpha = 0.55 + 0.45 * (1 - Math.hypot(x - W / 2, y - H * 0.45) / 50);
      g.fillRect(x, y, 2, 2);
    }
  }
  g.globalAlpha = 1;
  // corner pips
  g.fillStyle = '#ffffff';
  for (const [x, y] of [[7, 7], [W - 11, 7], [7, H - 11], [W - 11, H - 11]]) { g.fillRect(x, y, 4, 4); g.fillStyle = gold ? '#ffd84a' : mid; g.fillRect(x + 1, y + 1, 2, 2); g.fillStyle = '#ffffff'; }
  if (img.complete && img.naturalWidth) g.drawImage(img, W / 2 - 22, H * 0.45 - 22, 44, 44);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  return t;
}
async function playingCard(iconName, color, o = {}) {
  const face = await cardFaceTex(iconName, color, o.gold);
  const edge = new THREE.MeshStandardMaterial({ color: o.gold ? 0xffc21a : 0xfff4c0, roughness: 0.35, metalness: o.gold ? 0.8 : 0.1 });
  const back = new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.5), roughness: 0.5 });
  const front = new THREE.MeshStandardMaterial({ map: face, roughness: 0.3, metalness: o.gold ? 0.35 : 0.05, emissive: 0xffffff, emissiveMap: face, emissiveIntensity: 0.18, transparent: !!o.ghost, opacity: o.ghost ? 0.55 : 1 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.88, 0.035), [edge, edge, edge, edge, front, back]);
  m.position.y = 0.5;
  return m;
}
async function specialObject(id, sp) {
  const g = new THREE.Group();
  const put = (m, x, y, z, rz = 0, ry = 0) => { m.position.set(x, 0.5 + y, z); m.rotation.set(0, ry, rz); g.add(m); return m; };
  const col = sp.color ?? '#3ff2e0';
  switch (id) {
    case 'quickDraw':
      put(await playingCard('card', col), -0.32, -0.04, -0.12, 0.32);
      put(await playingCard('card', col), 0.32, -0.04, -0.12, -0.32);
      put(await playingCard('cards', col), 0, 0.05, 0.04);
      break;
    case 'energyDrink': {
      put(await playingCard('soda', col), -0.12, 0.02, -0.15, 0.12);
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.62, 18), new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: 0.7, roughness: 0.25 }));
      can.position.set(0.3, 0.32, 0.18);
      g.add(can);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 18), new THREE.MeshStandardMaterial({ color: 0xdfe6f0, metalness: 0.9, roughness: 0.2 }));
      top.position.set(0.3, 0.66, 0.18);
      g.add(top);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.16, 18), new THREE.MeshStandardMaterial({ color: 0x1a1240, emissive: 0x3ff2e0, emissiveIntensity: 0.25 }));
      band.position.set(0.3, 0.34, 0.18);
      g.add(band);
      break;
    }
    case 'couponBook':
      for (let k = 0; k < 4; k++) put(await playingCard('ticket', col), (k - 1.5) * 0.08, -0.06 + k * 0.03, -0.1 + k * 0.05, (k - 1.5) * 0.12);
      break;
    case 'trashCompactor': {
      put(await playingCard('trash', col), 0, 0.04, -0.05);
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.42, 10), new THREE.MeshStandardMaterial({ color: 0x5c6b80, metalness: 0.6, roughness: 0.4 }));
      bin.position.set(0.32, 0.21, 0.22);
      g.add(bin);
      for (let k = 0; k < 3; k++) {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0xfff4c0, roughness: 0.8, flatShading: true }));
        ball.position.set(0.24 + k * 0.08, 0.46 + (k % 2) * 0.05, 0.2 + (k - 1) * 0.06);
        g.add(ball);
      }
      break;
    }
    case 'doubleUp':
      put(await playingCard('swords', col), -0.16, 0, -0.08, 0.2);
      put(await playingCard('swords', col), 0.16, 0, 0.06, -0.2);
      break;
    case 'copyCat':
      put(await playingCard('card', col, { ghost: true }), 0.2, 0.06, -0.12, -0.18);
      put(await playingCard('card', col), -0.1, 0, 0.06, 0.12);
      break;
    case 'goldenTicket':
      put(await playingCard('ticket', col, { gold: true }), 0, 0.04, 0, -0.08);
      for (let k = 0; k < 5; k++) {
        const sp4 = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), new THREE.MeshStandardMaterial({ color: 0xfff6b8, emissive: 0xffd84a, emissiveIntensity: 1.2 }));
        sp4.position.set(Math.cos(k * 1.3) * 0.45, 0.4 + (k % 3) * 0.25, 0.15);
        g.add(sp4);
      }
      break;
    default:
      put(await playingCard(sp.icon ?? 'card', col), 0, 0, 0);
  }
  return g;
}

async function spellObject(id) {
  if (SPELLS[id]?.special) return specialObject(id, SPELLS[id]);
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
    default: {
      // magic lab spells: a big potion in the spell's colour, with two small vials beside it
      const col = new THREE.Color(SPELLS[id]?.color ?? '#ff2e88').getHex();
      add(P.makeBeaker(col), 0, 0, 0, 2.2, 0.3);
      add(P.makeBeaker(col), -0.42, 0, 0.18, 1.1, -0.4);
      add(P.makeBeaker(col), 0.44, 0, 0.12, 1.25, 0.6);
    }
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
/** Next job to render: the first one with an image on screen (up to 40 scanned), else the queue head. */
function nextJob() {
  const vh = innerHeight, vw = innerWidth;
  const n = Math.min(queue.length, 40);
  for (let i = 0; i < n; i++) {
    const img = queue[i].imgs.find((im) => im.isConnected);
    if (!img) continue;
    const r = img.getBoundingClientRect();
    if (r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw && r.width > 0) return queue.splice(i, 1)[0];
  }
  return queue.shift();
}
function pump() {
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 12) {
    const job = nextJob();
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
// which arena diorama modules exist (an arena still being built falls back to pixel art, not the Lab)
const ARENA_FILES = import.meta.glob('../models/arenas/*.js');
/**
 * Snapshot of an arena's Beast Island diorama (the voxel plinth with its props), for
 * banners. Resolves null when the arena has no diorama module. o: { w, h, yaw, pitch, zoom }
 */
export async function arenaThumb(id, o = {}) {
  const w = o.w ?? 360, hh = o.h ?? 200;
  const k = `${id}|${w}x${hh}|${o.yaw ?? ''}|${o.zoom ?? ''}`;
  if (arenaUrls.has(k)) return arenaUrls.get(k);
  const A = await import('../models/arenas/index.js');
  if (!A.ARENA_THEMES?.includes(id) || !ARENA_FILES[`../models/arenas/${id}.js`]) return null;
  const z = await A.makeArenaZone(id);
  try { z.update?.(0.016, 2.5); } catch (e) { /* animated bits are optional */ }
  const url = engine.renderThumb(z.root, { w, h: hh, yaw: o.yaw ?? -0.38, pitch: o.pitch ?? 0.68, zoom: o.zoom ?? 0.88 });
  arenaUrls.set(k, url);
  return url;
}
/** Lazy <img> of an arena diorama (renders when scrolled into view). Falls back to `fallback` (URL) if none. */
export function arenaImg(id, cls = '', o = {}) {
  return lazyImg(`ar|${id}|${o.w ?? 360}x${o.h ?? 200}`, () => arenaThumb(id, o).then((u) => u ?? o.fallback ?? BLANK), cls, { visible: o.visible ?? true, priority: o.priority ?? true });
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

// --------------------------------------------------------------------------- battle base tiers
// The battle HUD's base-upgrade button shows the NEXT base tier as a 3D model
// and spins it (a turntable strip of frames) when you can afford it / upgrade.
const baseUrls = new Map();
let baseModP = null;
const loadBaseMod = () => (baseModP ??= import('../models/props/base.js'));
/**
 * Turntable frames (data URLs) of a battle base tier (1 = Camp Lab ... 6 = Mega HQ).
 * o: { side, style, size, frames }. Cached; resolves with an array (frame 0 = the 3/4 hero angle).
 */
export async function baseSpin(tier, o = {}) {
  const n = o.frames ?? 1, size = o.size ?? 128;
  const cmd = o.cmd ?? null;
  const k = `${tier}|${o.side ?? 0}|${tier === 5 ? o.style ?? '' : ''}|${size}|${n}|${o.zoom ?? ''}|${o.sway ?? ''}|${cmd ? (cmd.char ?? cmd.id) + JSON.stringify(cmd.override ?? null) + (o.cmdScale ?? '') : ''}`;
  if (baseUrls.has(k)) return baseUrls.get(k);
  const job = loadBaseMod().then((M) => {
    const b = M.makeBase(tier, { side: o.side ?? 0, style: o.style });
    try { b.update?.(0.016, 1); } catch (e) { /* animated bits are optional */ }
    // the player's chibi Commander sits on the base's seat anchor (a little larger than in battle so it reads at button size)
    if (cmd && b.seat) {
      try {
        const def = { ...CHARACTERS[cmd.char ?? cmd.id], ...(cmd.override ?? {}) };
        const ch = new Chibi(def, { fidget: false });
        ch.play('sit');
        if (o.mood) ch.mood(o.mood); else ch.expr('happy', 'grin');
        ch.face.blinkT = 99;
        ch.face.autoLook = false;
        for (let i = 0; i < 8; i++) ch.update(0.03);
        ch.face.redraw?.();
        b.seat.updateWorldMatrix(true, false);
        ch.root.position.copy(b.seat.position);
        ch.root.rotation.y = (o.side ?? 0) === 0 ? 0.55 : -0.55;
        ch.root.scale.setScalar(o.cmdScale ?? 1.3);
        b.root.add(ch.root);
      } catch (e) { console.warn('base thumb commander failed', e); }
    }
    const urls = [];
    for (let i = 0; i < n; i++) {
      // o.sway: rock back and forth around the hero angle (keeps a seated Commander facing out) instead of a full turn
      const yaw = o.sway ? -0.62 + Math.sin((i / n) * Math.PI * 2) * o.sway : -0.62 + (i / n) * Math.PI * 2;
      urls.push(engine.renderThumb(b.root, { size, yaw, pitch: 0.3, zoom: o.zoom ?? 0.8 }));
    }
    try { b.dispose?.(); } catch (e) { /* ignore */ }
    return urls;
  });
  baseUrls.set(k, job);
  return job;
}
/** One 3/4 view of a battle base tier. */
export async function baseThumb(tier, o = {}) {
  return (await baseSpin(tier, { ...o, frames: 1 }))[0];
}
