// Shared building blocks for the home lobby menu screens: screen shell with
// debounced state refresh, section headers, segmented tabs, pixel-art vial
// products, banners, Commander portraits, reward art/tiles + reward popup,
// confirm dialog, timers and small juice helpers.
import './home.css';
import { h, icon, button, modal, toast, clear, sparkle, burst, flyIcons, $overlay } from '../ui.js';
import { cardEl } from '../cards.js';
import { lazyImg, charPortrait, swarmThumb, labSkinImg } from '../thumbs.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { Chibi } from '../../core/chibi.js';
import { CHARACTERS } from '../../data/characters.js';
import { fmt, fmtTime } from '../../core/util.js';
import { state } from '../../game/state.js';
import { cardDef } from '../../data/cards.js';
import { SWARMS } from '../../data/swarms.js';
import { COMMANDERS, CMD_LEVEL_REWARDS } from '../../data/commanders.js';
import { VIALS } from '../../data/vials.js';
import { MEGAS } from '../../data/megas.js';
import { BANNERS, SWARM_SKINS, LAB_SKINS, CMD_SKINS, PASS_TIERS } from '../../data/season.js';
import { TROPHY_ROAD, SECRETS, BOSSES } from '../../data/arenas.js';

export { fmt, fmtTime };

// ---------------------------------------------------------------------------
// Profile metadata private to the menus (seen flags). Lives in state.p.hub.

export function meta() {
  const p = state.p;
  if (!p.hub || typeof p.hub !== 'object') p.hub = {};
  if (!p.hub.seenCards) {
    // first run of these menus (or a migrated save): what you already own isn't "new"
    p.hub.seenCards = {};
    for (const id of Object.keys(p.cards)) p.hub.seenCards[id] = 1;
  }
  return p.hub;
}
export const isCardNew = (id) => !!state.p.cards[id] && !meta().seenCards[id];
export function markCardSeen(id) {
  const m = meta();
  if (m.seenCards[id] || !state.p.cards[id]) return;
  m.seenCards[id] = 1;
  state.save();
}

// ---------------------------------------------------------------------------
// Feedback

export function notify(ctx, text, opts = {}) {
  if (ctx?.toast) ctx.toast(text, opts);
  else toast(text, opts);
}
export function deny(ctx, text, el) {
  audio.play('deny');
  if (el) {
    el.classList.remove('shake-x');
    void el.offsetWidth;
    el.classList.add('shake-x');
  }
  notify(ctx, text, { icon: 'x' });
}
export const refreshCtx = (ctx) => { try { ctx?.refresh?.(); } catch (e) { console.warn(e); } };

/** Floating text rising from an element ("+25 Lab XP"). */
export function flyText(el, text, cls = '') {
  if (!el?.isConnected) return;
  const r = el.getBoundingClientRect();
  const t = h('div', { class: 'mn-fly t-d outline ' + cls, style: { left: r.left + r.width / 2 + 'px', top: r.top + r.height * 0.35 + 'px' } }, text);
  $overlay().appendChild(t);
  setTimeout(() => t.remove(), 1300);
}

/** Big slam text over an element ("LEVEL UP!"). */
export function slam(parent, text, cls = '') {
  const t = h('div', { class: 'mn-slam t-d outline ' + cls }, text);
  parent.appendChild(t);
  setTimeout(() => t.remove(), 1500);
  return t;
}

// ---------------------------------------------------------------------------
// Time

export function secsToMidnight() {
  const now = new Date();
  return (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now) / 1000;
}
/** "12d 4h" for long timers, fmtTime below a day. */
export const fmtLong = (sec) => (sec >= 86400 ? `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h` : fmtTime(sec));
/** A self-updating countdown (any element with .js-cd and data-end ms epoch is refreshed by tickTimers). long: show days. */
export function countdown(endMs, cls = '', long = false) {
  const f = long ? fmtLong : fmtTime;
  return h('span', { class: 'js-cd ' + cls, 'data-end': String(endMs), 'data-long': long ? '1' : null }, f((endMs - Date.now()) / 1000));
}
export function tickTimers(root) {
  root.querySelectorAll('.js-cd').forEach((el) => {
    el.textContent = (el.dataset.long ? fmtLong : fmtTime)((+el.dataset.end - Date.now()) / 1000);
  });
}
export const midnightMs = () => Date.now() + secsToMidnight() * 1000;

// ---------------------------------------------------------------------------
// Screen shell: root + scroller, debounced re-render on state changes (held
// back while an animation is running), timers, scroll preservation.

export function screenShell(el, o) {
  const root = h('div', { class: `mn-screen mn-intro ${o.cls ?? ''}` });
  const scroll = h('div', { class: 'mn-scroll scroll-y' });
  root.appendChild(scroll);
  el.appendChild(root);
  let lockUntil = 0, dirty = false, timer = 0, disposed = false, first = true;
  const api = {
    root, scroll,
    render() {
      if (disposed) return;
      clearTimeout(timer);
      const st = scroll.scrollTop;
      const content = o.render(api, first);
      clear(scroll);
      if (content) scroll.appendChild(content);
      if (!first) scroll.scrollTop = st;
      first = false;
      dirty = false;
      o.after?.(api);
    },
    /** Hold automatic re-renders for ms (e.g. during a claim animation). */
    lock(ms) {
      lockUntil = Math.max(lockUntil, performance.now() + ms);
    },
    schedule(ms = 90) {
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (disposed || !dirty) return;
        const wait = lockUntil - performance.now();
        if (wait > 0) return api.schedule(wait + 30);
        api.render();
      }, ms);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
      clearInterval(iv);
      off();
      o.dispose?.();
      root.remove();
    },
  };
  const off = state.on(() => api.schedule());
  const iv = setInterval(() => {
    if (disposed) return;
    tickTimers(root);
    o.tick?.(api);
  }, 1000);
  setTimeout(() => root.classList.remove('mn-intro'), 1200);
  return api; // the caller does the first api.render() once its closures exist
}

// ---------------------------------------------------------------------------
// Headers, tabs, chips

/** Section header: ribbon + optional right-hand info. */
export function secHead(text, color = 'blue', right = null, cls = '') {
  return h('div', { class: 'mn-sec ' + cls },
    h('div', { class: `ribbon sk-ribbon-${color} mn-sec-rb` }, h('span', {}, text)),
    right ? h('div', { class: 'mn-sec-right' }, right) : null);
}
/** Small label bar (subsection). */
export function subHead(text, right = null, cls = '') {
  return h('div', { class: 'mn-sub ' + cls }, h('span', { class: 't-d outline' }, text), h('span', { class: 'spacer' }), right);
}
export function chip(content, cls = '') {
  return h('span', { class: 'mn-chip ' + cls }, content);
}
export function timerChip(endMs, label = 'New in') {
  return chip([icon('clock', 's'), h('span', { class: 'c-muted' }, label + ' '), countdown(endMs, 'c-gold')], 'mn-chip-timer');
}
export function badgeEl(n, cls = '') {
  if (!n) return null;
  return h('div', { class: 'badge ' + cls }, n > 9 ? '9+' : String(n));
}

/** Segmented tab strip. items: [{id,label,icon,badge}] */
export function segTabs(items, sel, onSel, cls = '') {
  const wrap = h('div', { class: 'mn-seg ' + cls });
  for (const it of items) {
    const b = h('button', { class: `mn-seg-b ${it.id === sel ? 'on sk-btn-yellow' : 'sk-btn-blue'}`, type: 'button' },
      h('span', { class: 'row gap-s' }, it.icon ? icon(it.icon) : null, h('span', {}, it.label)),
      badgeEl(it.badge));
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.unlock();
      if (it.id === sel) return;
      audio.play('tap');
      onSel(it.id);
    });
    wrap.appendChild(b);
  }
  return wrap;
}

// ---------------------------------------------------------------------------
// Pixel-art vial products (test tube, lab pack, mega lab, cash case)

const css = (hex) => '#' + (hex >>> 0).toString(16).padStart(6, '0');
function shadeHex(hex, f) {
  let r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}
const lum = (hex) => ((hex >> 16) & 255) * 0.3 + ((hex >> 8) & 255) * 0.59 + (hex & 255) * 0.11;

class Pix {
  constructor(w, hh) {
    this.w = w;
    this.h = hh;
    this.g = Array.from({ length: hh }, () => Array(w).fill(null));
  }
  px(x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.g[y][x] = typeof c === 'number' ? css(c) : c;
    return this;
  }
  rect(x, y, w, hh, c) { for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c); return this; }
  hline(x, y, w, c) { return this.rect(x, y, w, 1, c); }
  vline(x, y, hh, c) { return this.rect(x, y, 1, hh, c); }
  /** Shaded box: fill + lit top/left, dark bottom/right. */
  box(x, y, w, hh, c, o = {}) {
    this.rect(x, y, w, hh, c);
    this.hline(x, y, w, shadeHex(c, o.hi ?? 0.35));
    this.vline(x, y, hh, shadeHex(c, (o.hi ?? 0.35) * 0.5));
    this.hline(x, y + hh - 1, w, shadeHex(c, -(o.lo ?? 0.3)));
    this.vline(x + w - 1, y + 1, hh - 1, shadeHex(c, -(o.lo ?? 0.3) * 0.7));
    return this;
  }
  url(outline = '#120c24') {
    const c = document.createElement('canvas');
    c.width = this.w + 2;
    c.height = this.h + 3;
    const g = c.getContext('2d');
    const at = (x, y) => (x >= 0 && y >= 0 && x < this.w && y < this.h ? this.g[y][x] : null);
    // drop shadow
    g.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (at(x, y)) g.fillRect(x + 1, y + 3, 1, 1);
    for (let y = -1; y <= this.h; y++) for (let x = -1; x <= this.w; x++) {
      if (at(x, y)) continue;
      if (at(x + 1, y) || at(x - 1, y) || at(x, y + 1) || at(x, y - 1)) { g.fillStyle = outline; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const col = at(x, y);
      if (col) { g.fillStyle = col; g.fillRect(x + 1, y + 1, 1, 1); }
    }
    return c.toDataURL();
  }
}

function drawTube(p, x0, y0, v, o = {}) {
  const cap = v.cap, liq = v.liquid, lab = v.label;
  const W = o.w ?? 10, H = o.h ?? 26;
  const capH = Math.max(3, Math.round(H * 0.2));
  // screw cap with ridges
  p.box(x0, y0, W, capH, cap, { hi: 0.45 });
  for (let i = 1; i < W - 1; i += 2) p.vline(x0 + i, y0 + 1, capH - 2, shadeHex(cap, -0.18));
  if (v.chrome) { p.px(x0 + 1, y0 + 1, '#ffffff').px(x0 + 2, y0 + 1, '#ffffff').px(x0 + W - 3, y0 + capH - 2, '#ffffff'); }
  p.hline(x0, y0 + capH, W, shadeHex(cap, -0.5));
  // glass tube
  const gy = y0 + capH + 1, gh = H - capH - 1, gx = x0 + 1, gw = W - 2;
  p.rect(gx, gy, gw, gh - 1, '#d8eeff');
  p.rect(gx + 1, gy + gh - 1, gw - 2, 1, shadeHex(liq, -0.25));
  const ly = gy + Math.max(2, Math.round(gh * 0.16));
  p.rect(gx, ly, gw, gy + gh - 1 - ly, liq);
  p.hline(gx, ly, gw, shadeHex(liq, 0.35));
  p.vline(gx + 1, ly + 1, gy + gh - 2 - ly, shadeHex(liq, 0.3));
  p.vline(gx + gw - 1, ly, gy + gh - 1 - ly, shadeHex(liq, -0.3));
  p.vline(gx, gy, 2, '#ffffff');
  // label band with a tiny panther face
  if (gw >= 6 && !o.noLabel) {
    const lb = ly + Math.round((gh - (ly - gy)) * 0.28), lh = Math.max(3, Math.round(gh * 0.2));
    p.rect(gx, lb, gw, lh, lab);
    p.hline(gx, lb, gw, shadeHex(lab, 0.3));
    p.hline(gx, lb + lh - 1, gw, shadeHex(lab, -0.3));
    const ink = lum(lab) > 150 ? '#120c24' : '#ffffff';
    const cx = gx + Math.floor(gw / 2);
    p.px(cx - 2, lb + 1, ink).px(cx + 1, lb + 1, ink).px(cx - 1, lb + 2, ink).px(cx, lb + 2, ink);
    if (lh > 3) p.px(cx - 2, lb + 1, '#ff2e88');
  }
  // bubbles
  const b = shadeHex(liq, 0.7);
  p.px(gx + Math.floor(gw / 2), gy + gh - 3, b).px(gx + 2, gy + gh - 5, b).px(gx + gw - 2, ly + 2, b);
}

function vialPix(type) {
  const v = VIALS[type] ?? VIALS.testTube;
  const prod = v.product ?? 'testTube';
  if (prod === 'labPack') {
    const p = new Pix(26, 24);
    const body = v.label, trim = v.cap;
    p.rect(9, 0, 8, 2, 0x3a3f5a).rect(8, 1, 2, 4, 0x3a3f5a).rect(16, 1, 2, 4, 0x3a3f5a).hline(10, 0, 6, 0x6a7090);
    p.box(0, 4, 26, 20, body, { hi: 0.4 });
    p.rect(0, 4, 26, 3, shadeHex(body, 0.25));
    p.hline(0, 4, 26, shadeHex(body, 0.55));
    // window
    p.rect(3, 8, 20, 12, 0x101a4a);
    p.rect(3, 8, 20, 1, 0x060c2a);
    for (let i = 0; i < 4; i++) drawTube(p, 4 + i * 5, 9, { cap: i % 2 ? trim : v.cap, liquid: i % 2 ? v.liquid : shadeHex(v.liquid, -0.15), label: 0xffffff }, { w: 4, h: 10, noLabel: true });
    p.vline(3, 9, 10, 'rgba(255,255,255,0.35)');
    // bottom stripe
    p.rect(1, 21, 24, 2, trim);
    p.hline(1, 21, 24, shadeHex(trim, 0.4));
    p.px(5, 5, '#ffffff').px(6, 5, '#ffffff');
    return p;
  }
  if (prod === 'megaLab') {
    const p = new Pix(30, 28);
    const body = v.cap, gold = v.label;
    // dome lid
    p.rect(8, 0, 14, 2, gold).rect(5, 2, 20, 3, gold).hline(8, 0, 14, shadeHex(gold, 0.5)).hline(5, 4, 20, shadeHex(gold, -0.35));
    p.box(0, 5, 30, 23, body, { hi: 0.45 });
    p.rect(0, 5, 30, 3, shadeHex(body, 0.25));
    // window with big flask
    p.rect(4, 9, 22, 14, 0x140c3a);
    p.rect(13, 10, 4, 4, '#d8eeff').rect(10, 14, 10, 8, '#d8eeff').rect(11, 13, 8, 1, '#d8eeff');
    p.rect(11, 16, 8, 6, v.liquid).hline(11, 16, 8, shadeHex(v.liquid, 0.4)).px(13, 18, '#ffffff').px(16, 20, shadeHex(v.liquid, 0.6));
    p.rect(12, 9, 6, 1, gold);
    drawTube(p, 5, 11, { cap: gold, liquid: 0x7cff3a, label: 0xffffff }, { w: 4, h: 11, noLabel: true });
    drawTube(p, 21, 11, { cap: gold, liquid: 0x8fd4ff, label: 0xffffff }, { w: 4, h: 11, noLabel: true });
    // gold trim + corner studs
    p.rect(1, 24, 28, 3, gold).hline(1, 24, 28, shadeHex(gold, 0.45));
    for (const [x, y] of [[1, 6], [27, 6]]) p.rect(x, y, 2, 2, gold).px(x, y, '#ffffff');
    p.px(3, 6, '#ffffff').px(4, 6, '#ffffff');
    return p;
  }
  if (prod === 'cashCase') {
    const p = new Pix(30, 24);
    const body = v.label, gold = v.cap, cash = v.liquid;
    // handle
    p.rect(10, 0, 10, 2, 0x2a2a3a).rect(9, 1, 2, 4, 0x2a2a3a).rect(19, 1, 2, 4, 0x2a2a3a).hline(11, 0, 8, 0x5a5a72);
    // cash poking out of the seam
    p.rect(3, 9, 24, 3, cash).hline(3, 9, 24, shadeHex(cash, 0.4));
    for (let x = 4; x < 27; x += 4) p.px(x, 10, shadeHex(cash, -0.35));
    p.box(0, 4, 30, 6, body === 0x15121f ? 0x2a2440 : body, { hi: 0.5 });
    p.box(0, 12, 30, 12, body === 0x15121f ? 0x2a2440 : body, { hi: 0.3 });
    // gold trim & latches
    p.hline(0, 4, 30, gold).hline(0, 23, 30, shadeHex(gold, -0.3));
    p.rect(0, 4, 2, 20, gold).rect(28, 4, 2, 20, shadeHex(gold, -0.15));
    p.rect(6, 11, 4, 4, gold).rect(20, 11, 4, 4, gold).px(6, 11, '#ffffff').px(20, 11, '#ffffff');
    p.rect(7, 13, 2, 1, shadeHex(gold, -0.45)).rect(21, 13, 2, 1, shadeHex(gold, -0.45));
    p.rect(12, 16, 6, 4, gold).px(13, 17, '#120c24').px(16, 17, '#120c24').hline(14, 18, 2, '#120c24');
    p.px(2, 5, '#ffffff').px(3, 5, '#ffffff');
    return p;
  }
  const p = new Pix(12, 28);
  drawTube(p, 1, 0, v, { w: 10, h: 28 });
  return p;
}

const vialCache = new Map();
export function vialURL(type) {
  if (!vialCache.has(type)) vialCache.set(type, vialPix(type).url());
  return vialCache.get(type);
}
// 3D toy-model vial thumbnails (src/ui/vialThumb.js) when available, pixel art otherwise.
const OPTIONAL = import.meta.glob(['../vialThumb.js']);
const vial3d = () => (OPTIONAL['../vialThumb.js'] ? OPTIONAL['../vialThumb.js']() : Promise.reject(new Error('no vialThumb')));
export function vialArt(type, cls = '', opts = {}) {
  const v = VIALS[type] ?? VIALS.testTube;
  const base = `mn-vial p-${v.product ?? 'testTube'} r-${v.rarity ?? 'common'} ${cls}`;
  if (opts.pixel || !OPTIONAL['../vialThumb.js']) return h('img', { class: base, src: vialURL(type), alt: v.name, draggable: 'false' });
  const size = opts.size ?? 192;
  const img = lazyImg(`mnv|${type}|${size}`, () => vial3d().then((m) => m.vialThumb(type, size)).catch(() => vialURL(type)), `${base} v3d smooth`, { priority: true });
  img.alt = v.name;
  return img;
}

// ---------------------------------------------------------------------------
// Banners

export function bannerEl(id, cls = '', ...children) {
  const b = BANNERS[id] || BANNERS.default;
  const el = h('div', { class: `mn-banner ${b.animated ? 'anim anim-' + b.animated : ''} ${cls}` });
  el.appendChild(h('div', { class: 'mn-ban-bg', style: { background: b.css } }));
  el.appendChild(h('div', { class: 'mn-ban-sheen' }));
  if (children.length) el.appendChild(h('div', { class: 'mn-ban-c' }, ...children));
  return el;
}

// ---------------------------------------------------------------------------
// Portraits

export function cmdOverride(skinId) {
  const s = CMD_SKINS[skinId];
  if (!s) return null;
  const { name, commander, ...rest } = s;
  return rest;
}
export function charImg(charId, opts = {}, cls = '') {
  const o = { size: opts.size ?? 128, override: opts.override ?? null, eyes: opts.eyes, mouth: opts.mouth, full: opts.full, yaw: opts.yaw };
  return lazyImg(`hmc|${charId}|${o.size}|${JSON.stringify(o.override)}|${o.eyes}|${o.mouth}|${o.full}|${o.yaw}`, () => charPortrait(charId, o), 'smooth ' + cls, { priority: opts.priority });
}
export function cmdImg(cmdId, skinId = null, opts = {}, cls = '') {
  const c = COMMANDERS[cmdId];
  return charImg(c?.char ?? 'recruit', { ...opts, override: skinId ? cmdOverride(skinId) : null }, cls);
}
/** Full-body render of a chibi character in a pose (w x h). */
export function charFullImg(charId, o = {}, cls = '') {
  const w = o.w ?? 160, hh = o.h ?? 200;
  const key = `hmf|${charId}|${w}x${hh}|${JSON.stringify(o.override ?? null)}|${o.pose}|${o.mouth}|${o.yaw}`;
  return lazyImg(key, () => {
    const c = new Chibi({ ...CHARACTERS[charId], ...(o.override ?? {}) });
    c.expr(o.eyes ?? 'normal', o.mouth ?? 'smile');
    c.face.blinkT = 99;
    if (o.pose) c.play(o.pose);
    for (let i = 0; i < 8; i++) c.update(o.pose ? 0.09 : 0.016);
    c.face.redraw();
    return engine.renderThumb(c.root, { w, h: hh, yaw: o.yaw ?? -0.4, pitch: 0.1, zoom: o.zoom ?? 0.92 });
  }, 'smooth ' + cls, { priority: o.priority ?? true });
}
export function cmdFullImg(cmdId, skinId = null, o = {}, cls = '') {
  const c = COMMANDERS[cmdId];
  return charFullImg(c?.char ?? 'recruit', { ...o, override: skinId ? cmdOverride(skinId) : null }, cls);
}
export function swarmImg(id, variant = 'base', skin = null, size = 160, cls = '') {
  return lazyImg(`s|${id}|${variant}|${skin}|${size}`, () => swarmThumb(id, variant, skin, size), 'smooth ' + cls);
}

/** Does the player own a Commander outfit? (level-10 outfits are keyed "cmd:skin"). */
export function cmdSkinOwned(cmdId, skinId) {
  const o = state.p.cosmetics.cmdSkins ?? {};
  return !!(o[skinId] || o[cmdId + ':' + skinId]);
}
export const cmdSkinsFor = (cmdId) => Object.entries(CMD_SKINS).filter(([, s]) => s.commander === cmdId || s.commander === '*').map(([k]) => k);

// ---------------------------------------------------------------------------
// Where cosmetics come from

function passTierFor(type, id) {
  for (let i = 0; i < PASS_TIERS.length; i++) {
    for (const track of ['free', 'premium']) {
      const r = PASS_TIERS[i][track];
      if (r.type === type && r.id === id) return `Food Pass tier ${i + 1}${track === 'premium' ? ' (Premium)' : ''}`;
    }
  }
  return null;
}
export function unlockHint(type, id) {
  const ps = passTierFor(type, id);
  if (ps) return ps;
  const road = TROPHY_ROAD.find((m) => m.reward.type === type && m.reward.id === id);
  if (road) return `Trophy Road ${fmt(road.t)}`;
  if (type === 'banner') {
    const L = Object.keys(CMD_LEVEL_REWARDS).find((k) => CMD_LEVEL_REWARDS[k].banner === id);
    if (L) return `Commander level ${L}`;
    if (Object.values(SECRETS).some((s) => s.reward?.banner === id)) return 'Find a Beast Island secret';
    if (Object.values(BOSSES).some((b) => b.reward?.banner === id)) return 'Defeat a boss';
  }
  if (type === 'cmdSkin' && id === 'gold') return 'Commander level 10';
  return 'Beast Shop featured offer';
}

// ---------------------------------------------------------------------------
// Rewards

/** Normalise a reward def ({type,...}) or a grantReward display object ({kind,...}). */
export function rewardDef(x) {
  if (!x) return { type: 'unknown' };
  if (x.type) return x;
  switch (x.kind) {
    case 'coins': case 'bucks': case 'calories': return { type: x.kind, amount: x.amount };
    case 'card': return { type: 'card', id: x.id, copies: x.copies ?? 1, isNew: x.isNew };
    case 'mega': return { type: 'mega', id: x.id, variant: x.variant };
    default: return { type: x.kind, id: x.id };
  }
}

export function rewardLabel(r) {
  r = rewardDef(r);
  switch (r.type) {
    case 'coins': return `${fmt(r.amount)} Coins`;
    case 'bucks': return `${fmt(r.amount)} Bucks`;
    case 'calories': return `${fmt(r.amount)} Calories`;
    case 'vial': return VIALS[r.id]?.name ?? 'Vial';
    case 'card': case 'swarm': case 'spell': return `${cardDef(r.id)?.name ?? r.id}${(r.copies ?? 1) > 1 ? ' x' + r.copies : ''}`;
    case 'commander': return COMMANDERS[r.id]?.name ?? 'Commander';
    case 'skin': return SWARM_SKINS[r.id]?.name ?? 'Swarm Skin';
    case 'labSkin': return LAB_SKINS[r.id]?.name ?? 'Lab Skin';
    case 'cmdSkin': return CMD_SKINS[r.id]?.name ?? 'Outfit';
    case 'banner': return BANNERS[r.id]?.name ?? 'Banner';
    case 'serum': return `Mega ${SWARMS[r.id]?.name ?? 'Serum'}`;
    case 'mega': return `${r.variant === 'gold' ? 'Golden ' : ''}${MEGAS[r.id]?.name ?? 'MEGA'}`;
    default: return '???';
  }
}
export function rewardKind(r) {
  r = rewardDef(r);
  return {
    coins: 'Beast Coins', bucks: 'Beast Bucks', calories: 'Season Calories', vial: 'Vial', card: 'Card', swarm: 'Card', spell: 'Spell Card',
    commander: 'Commander', skin: 'Swarm Skin', labSkin: 'Lab Skin', cmdSkin: 'Commander Outfit', banner: 'Banner', serum: 'Mega Serum',
    mega: r.variant === 'gold' ? 'Metallic Gold MEGA' : 'MEGA Ultimate',
  }[r.type] ?? '';
}
/** Short amount label shown on reward tiles. */
export function rewardAmount(r) {
  r = rewardDef(r);
  if (r.type === 'coins' || r.type === 'bucks' || r.type === 'calories') return fmt(r.amount);
  if ((r.type === 'card' || r.type === 'swarm' || r.type === 'spell') && (r.copies ?? 1) > 1) return 'x' + r.copies;
  return '';
}

/** Visual for a reward (square-ish). */
export function rewardArt(r, opts = {}) {
  r = rewardDef(r);
  const wrap = (cls, ...kids) => h('div', { class: 'mn-ra ' + cls }, ...kids);
  switch (r.type) {
    case 'coins': return wrap('cur coins', icon(r.amount >= 2500 ? 'coinChest' : r.amount >= 900 ? 'coinPile' : r.amount >= 300 ? 'coinStack' : 'coin', 'mn-ra-ic big'));
    case 'bucks': return wrap('cur bucks', icon(r.amount >= 60 ? 'bucksPile' : 'bucks', 'mn-ra-ic big'));
    case 'calories': return wrap('cur cal', icon('calorie', 'mn-ra-ic'));
    case 'vial': return wrap('vial', vialArt(r.id));
    case 'card': case 'swarm': case 'spell': return wrap('card', cardEl(r.id, { size: 'mini', noLevel: true, locked: false, owned: state.p.cards[r.id] ?? { level: 1 }, artSize: 128 }));
    case 'commander': return wrap('cmd', cmdImg(r.id, null, { size: 128 }));
    case 'skin': {
      const sk = SWARM_SKINS[r.id];
      return wrap('skin', swarmImg(sk?.swarm ?? 'panther', 'base', r.id, 128), h('div', { class: 'mn-ra-corner' }, icon('paint')));
    }
    case 'labSkin': return wrap('labskin', labSkinImg(r.id === 'default' ? 'default' : r.id, 160, 'smooth'), h('div', { class: 'mn-ra-corner' }, icon('paint')));
    case 'cmdSkin': {
      const sk = CMD_SKINS[r.id];
      const cmd = sk?.commander && sk.commander !== '*' ? sk.commander : r.commander ?? state.p.commanders.equipped;
      return wrap('cmd', cmdImg(cmd, r.id, { size: 128 }), h('div', { class: 'mn-ra-corner' }, icon('crown')));
    }
    case 'banner': return wrap('banner', bannerEl(r.id, 'mini'), h('div', { class: 'mn-ra-corner' }, icon('flag')));
    case 'serum': return wrap('serum', swarmImg(r.id, 'base', null, 128), h('div', { class: 'mn-ra-corner' }, icon('mega')));
    case 'mega': return wrap(`mega ${r.variant === 'gold' ? 'gold' : ''}`, swarmImg(r.id, r.variant ?? 'base', null, 160), h('div', { class: 'mn-ra-corner' }, icon('mega')));
    default: return wrap('', icon('star', 'mn-ra-ic'));
  }
}

/** Reward tile: art + amount + optional label. */
export function rewardTile(r, opts = {}) {
  const d = rewardDef(r);
  const amt = rewardAmount(d);
  return h('div', { class: `mn-rw k-${d.type} ${opts.cls ?? ''}` },
    rewardArt(d, opts),
    amt ? h('div', { class: 'mn-rw-amt t-d outline' }, amt) : null,
    opts.label ? h('div', { class: 'mn-rw-lbl' }, rewardLabel(d)) : null,
    d.isNew ? h('div', { class: 'new-tag', style: { right: '-6%', top: '-6%' } }, 'NEW!') : null);
}

const BIG_KINDS = new Set(['mega', 'cmdSkin', 'labSkin', 'skin', 'commander', 'serum', 'banner']);
/** Is this reward worth the big celebration (burst + rays)? */
export function isBigReward(d) {
  d = rewardDef(d);
  if (BIG_KINDS.has(d.type)) return true;
  if (d.type === 'vial') return ['megaLab', 'cashCase', 'hyperchrome'].includes(d.id);
  if (d.type === 'card' || d.type === 'swarm' || d.type === 'spell') return ['legendary', 'mythic'].includes(cardDef(d.id)?.rarity) || !!d.isNew;
  return false;
}
/** The home top-bar currency pill for a reward type (for coins flying into it), if on screen. */
export function currencyPill(type) {
  const ic = type === 'coins' ? 'coin' : type === 'bucks' ? 'bucks' : null;
  return ic ? document.querySelector(`.hm-top .pill img[alt="${ic}"]`)?.closest('.pill') ?? null : null;
}

/** Celebratory popup listing granted rewards. Resolves on close. */
export function showRewards(list, opts = {}) {
  return new Promise((resolve) => {
    if (!list || !list.length) return resolve();
    const one = list.length === 1;
    const row = h('div', { class: 'mn-rwrow' + (list.length > 4 ? ' many' : '') + (one ? ' one' : '') });
    const tiles = [];
    let collecting = false;
    const collect = () => {
      if (collecting) return;
      collecting = true;
      // coins / bucks fly into the top-bar pills
      tiles.forEach(({ tile, def }) => {
        const pill = currencyPill(def.type);
        if (pill && tile.isConnected) flyIcons(tile, def.type === 'coins' ? 'coin' : 'bucks', pill, { count: 5 });
      });
      m.close();
    };
    const m = modal({
      title: opts.title ?? 'REWARDS!', color: opts.color ?? 'gold', size: 'narrow', cls: 'mn-rwmodal' + (one ? ' one' : ''),
      body: h('div', { class: 'col center mn-rwbody' }, h('div', { class: 'px-rays mn-rw-rays' }), h('div', { class: 'px-stars' }), opts.hero ?? null, row,
        opts.note ? h('div', { class: 'center-t t-sm c-muted mn-rwnote' }, opts.note) : null),
      foot: button('COLLECT', collect, 'green lg shine', { icon: 'check' }),
      onClose: resolve,
    });
    list.forEach((d, i) => {
      const def = rewardDef(d);
      const big = isBigReward(def);
      const tile = h('div', { class: `mn-rwpop k-${def.type} ${big ? 'big' : ''}`, style: { animationDelay: 0.12 + Math.min(i, 12) * 0.16 + 's' } },
        h('div', { class: 'mn-rwpop-art' }, big ? h('div', { class: 'px-rays w mn-rwpop-rays' }) : null, rewardTile(def)),
        h('div', { class: 'mn-rwpop-lbl' }, rewardLabel(def)), h('div', { class: 'mn-rwpop-kind' }, rewardKind(def)));
      row.appendChild(tile);
      tiles.push({ tile, def });
      setTimeout(() => {
        if (m.closed) return;
        audio.play(def.type === 'coins' ? 'coin' : big ? 'magic' : 'pop', { pitch: 1 + i * 0.08 });
        if (tile.getBoundingClientRect().bottom < innerHeight) {
          if (big || one) burst(tile.querySelector('.mn-rw') ?? tile, { count: 16, color: def.type === 'bucks' ? '#ff7ac0' : '#ffd84a', rays: big });
          else sparkle(tile, { count: 12 });
        }
      }, 220 + Math.min(i, 12) * 160);
    });
    audio.play('chaching');
    if (opts.jingle !== false) setTimeout(() => audio.jingle(opts.jingle ?? 'unlock'), 100);
  });
}

/** Confirmation popup. Resolves true/false. */
export function confirmBox({ title = 'ARE YOU SURE?', text = '', art = null, yes = 'YES', no = 'CANCEL', yesCls = 'green', price = null, color = 'blue', sub = null }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => {
      if (answered) return;
      answered = true;
      m.close();
      resolve(v);
    };
    const m = modal({
      title, color, size: 'narrow', cls: 'mn-confirm',
      body: h('div', { class: 'col center' }, art ? h('div', { class: 'mn-confirm-art' }, art) : null,
        text ? h('div', { class: 'center-t mn-confirm-t', html: text }) : null, sub),
      foot: [button(no, () => done(false), 'gray'), button(yes, () => done(true), yesCls, price ? { price } : {})],
      onClose: () => { if (!answered) { answered = true; resolve(false); } },
    });
  });
}

/** Spend a currency with feedback. */
export function priceBtn(label, cur, amount, onClick, cls = 'green', extra = {}) {
  return button(label, onClick, cls, { price: { cur: cur === 'bucks' ? 'bucks' : 'coins', amount }, ...extra });
}

/** Rarity → ribbon colour for headers. */
export const RARITY_RIBBON = { common: 'blue', rare: 'gold', epic: 'purple', legendary: 'green', mythic: 'pink' };
export const RARITY_BTN = { common: 'blue', rare: 'orange', epic: 'purple', legendary: 'teal', mythic: 'pink' };

/** Hexagonal Lab Level badge. */
export function labBadge(level, cls = '') {
  return h('div', { class: 'mn-labbadge ' + cls }, h('div', { class: 'mn-labbadge-in' }, h('b', { class: 't-d outline' }, String(level))));
}

/** Big pretty number (full digits below 100k). */
export const fmtN = (n) => (Math.abs(n) < 100000 ? Math.floor(n).toLocaleString('en-US') : fmt(n));
