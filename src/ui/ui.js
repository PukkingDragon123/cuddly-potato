// DOM UI toolkit: hyperscript helper, pixel icons, skinned buttons, panels,
// pills, bars, ribbons, modals, toasts, slam banners, typewriter dialogue,
// world-anchored speech bubbles & floating combat text, tutorial pointers,
// DOM sparkles and number roll-ups. Pixel scale adapts to the screen.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { iconURL as pixIconURL, iconAnim, animKindOf } from './icons.js';
import { injectSkins } from './skin.js';
import { fmt } from '../core/util.js';

export const $ui = () => document.getElementById('ui');
export const $overlay = () => document.getElementById('overlay');
export const $world = () => document.getElementById('world-ui');

// ---------------------------------------------------------------------------
// Responsive pixel scale: --px (pixel-art pixel size), --u (layout unit), --fs

export function applyScale() {
  const w = window.innerWidth, hgt = window.innerHeight;
  const portrait = hgt > w;
  const base = portrait ? Math.min(w, hgt * 0.6) : Math.min(hgt * 0.78, w * 0.48);
  const u = Math.max(3.4, Math.min(9.5, base / 100));
  const px = Math.max(2, Math.min(4, Math.round(Math.min(w, hgt) / 260)));
  const de = document.documentElement.style;
  de.setProperty('--u', u.toFixed(2) + 'px');
  de.setProperty('--px', px + 'px');
  de.setProperty('--pxs', Math.max(2, px - 1) + 'px');
  de.setProperty('--fs', Math.max(12, Math.round(u * 3.5)) + 'px');
}
if (typeof window !== 'undefined') {
  injectSkins();
  applyScale();
  window.addEventListener('resize', applyScale);
  window.addEventListener('orientationchange', () => setTimeout(applyScale, 200));
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        // custom properties (--foo) need setProperty; Object.assign silently drops them
        for (const sk in v) {
          if (sk.startsWith('--')) { if (v[sk] !== undefined && v[sk] !== null) el.style.setProperty(sk, String(v[sk])); }
          else el.style[sk] = v[sk];
        }
      }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  appendChildren(el, children);
  return el;
}
function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}
export function clearUI() {
  clear($ui());
  clear($overlay());
  clear($world());
  floaters.length = 0;
  speechBubbles.length = 0;
  pointers.length = 0;
  activeDialogue = null;
}

/** Light markup: *bold* and _emphasis_. */
export function rich(text) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*(.+?)\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Icons

export const iconURL = pixIconURL;
export function icon(name, cls = '') {
  return h('img', { src: iconURL(name), class: 'pi ' + cls, alt: name, draggable: 'false' });
}
/**
 * Animated pixel icon (coin spin, gem glint, bolt flicker, vial bubbles): a sprite strip
 * stepped through with object-position, so it drops in anywhere an icon() <img> goes.
 * Falls back to the static icon for names without an animation. cls 'pia-hover' = only
 * animates while its button / tile is hovered or pressed.
 */
export function animIcon(name, cls = '', kind = undefined) {
  let a = null;
  try { a = animKindOf(name) || kind ? iconAnim(name, kind ?? animKindOf(name)) : null; } catch (e) { a = null; }
  if (!a) return icon(name, cls);
  const el = h('img', { src: a.url, class: `pi pia pia-${kind ?? animKindOf(name)} ${cls}`, alt: name, draggable: 'false' });
  el.style.setProperty('--n', a.n);
  el.style.setProperty('--dur', a.dur + 's');
  el.style.animationDelay = -(Math.random() * a.dur).toFixed(2) + 's';
  return el;
}

// ---------------------------------------------------------------------------
// Buttons

const COLORS = ['yellow', 'orange', 'blue', 'green', 'red', 'pink', 'purple', 'gray', 'teal', 'gold', 'white'];
const SIZE_ALIAS = { small: 'sm', big: 'lg', huge: 'xl' };

/**
 * button(label, onClick, cls, opts)
 * cls: space separated tokens: a colour (yellow|blue|green|red|pink|purple|gray|orange|teal|gold|white),
 *      a size (sm|lg|xl or legacy small|big), extra classes (pulse, shine, icon-only...).
 * opts: { icon, sound, sub (small second line), onDisabled, price: {cur, amount} }
 */
export function button(label, onClick, cls = '', opts = {}) {
  const tokens = String(cls || '').split(/\s+/).filter(Boolean).map((t) => SIZE_ALIAS[t] ?? t);
  const color = tokens.find((t) => COLORS.includes(t)) ?? 'blue';
  const rest = tokens.filter((t) => !COLORS.includes(t));
  const b = h('button', { class: `btn sk-btn-${color} ${rest.join(' ')}`, type: 'button' });
  const inner = h('span', { class: 'row gap-s', style: { gap: '0.3em' } });
  if (opts.icon) inner.appendChild(icon(opts.icon));
  if (label !== null && label !== undefined && label !== '') {
    if (label instanceof Node) inner.appendChild(label);
    else inner.appendChild(h('span', { html: rich(label) }));
  }
  if (opts.price) inner.appendChild(priceTag(opts.price.cur, opts.price.amount));
  if (opts.sub) {
    const wrap = h('span', { class: 'col', style: { gap: '0', alignItems: 'center' } }, inner, h('span', { class: 'sub' }, opts.sub));
    b.appendChild(wrap);
  } else b.appendChild(inner);
  b.addEventListener('pointerdown', () => audio.unlock());
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (b.disabled || b.classList.contains('disabled')) {
      audio.play('deny');
      b.classList.remove('shake-x');
      void b.offsetWidth;
      b.classList.add('shake-x');
      opts.onDisabled && opts.onDisabled();
      return;
    }
    // jelly release bounce (uses the `scale` property, so it never fights the press transform)
    b.classList.remove('btn-pop');
    void b.offsetWidth;
    b.classList.add('btn-pop');
    audio.play(opts.sound ?? 'click');
    onClick && onClick(e);
  });
  b.addEventListener('animationend', (e) => { if (e.animationName === 'btnPop') b.classList.remove('btn-pop'); });
  if (opts.tip) b.dataset.tip = opts.tip;
  return b;
}
export function setDisabled(btn, on) {
  btn.classList.toggle('disabled', !!on);
  return btn;
}

export function priceTag(cur, amount) {
  return h('span', { class: 'price' }, animIcon(cur === 'bucks' ? 'bucks' : cur === 'coins' ? 'coin' : cur, 'pia-hover'), h('span', {}, typeof amount === 'number' ? fmt(amount) : String(amount)));
}

// ---------------------------------------------------------------------------
// Frames

export function panel(kind = '', ...children) {
  return h('div', { class: `panel sk-panel${kind ? '-' + kind : ''}` }, ...children);
}
export function ribbon(text, color = 'pink', cls = '') {
  return h('div', { class: `ribbon sk-ribbon-${color} ${cls}` }, h('span', {}, text));
}
/** Currency pill: icon overlapping the left edge, value, optional green "+" button. */
export function pill(iconName, value, opts = {}) {
  const val = h('span', { class: 'val' }, typeof value === 'number' ? fmt(value) : value);
  const el = h('div', { class: 'pill trough ' + (opts.plus ? 'has-plus ' : '') + (opts.cls ?? '') }, animIcon(iconName), val);
  if (opts.plus) {
    const plus = h('button', { class: 'btn sk-btn-green plus icon-only', type: 'button' }, h('span', { class: 't-d', style: { fontSize: '1.2em' } }, '+'));
    plus.addEventListener('click', (e) => { e.stopPropagation(); audio.play('click'); opts.plus(); });
    el.appendChild(plus);
  }
  if (opts.onClick) el.addEventListener('click', () => { audio.unlock(); audio.play('click'); opts.onClick(); });
  el.val = val;
  /** Animated value change: rolls the number, jelly-bumps the pill and floats "+N" / "-N" off it. */
  el.set = (v, o = {}) => {
    const from = el._v ?? (typeof value === 'number' ? value : NaN);
    el._v = v;
    if (!Number.isFinite(from) || from === v || o.instant) { val.textContent = fmtFull(v); return; }
    rollNumber(val, from, v, Math.min(1.1, 0.45 + Math.abs(v - from) / 4000), fmtFull);
    bump(el, 'pill-pop');
    if (o.float !== false) floatDelta(el, v - from);
    if (v > from) {
      sparkle(el.querySelector('.pi') ?? el, { count: 8, spread: 34, colors: ['#ffffff', '#ffd84a', '#fff6b8'] });
      audio.play('coin', { pitch: 1.3, gap: 0.08 });
    }
  };
  if (typeof value === 'number') el._v = value;
  return el;
}
const fmtFull = (n) => Math.round(n).toLocaleString('en-US');
/** "+120" rising off an element (gold when positive, red when negative). */
export function floatDelta(el, d, cls = '') {
  if (!el?.isConnected || !d) return;
  const r = el.getBoundingClientRect();
  const t = h('div', { class: `ui-delta ${d > 0 ? 'up' : 'down'} ${cls}`, style: { left: r.left + r.width * 0.62 + 'px', top: r.bottom - r.height * 0.2 + 'px' } }, (d > 0 ? '+' : '-') + fmtFull(Math.abs(d)));
  $overlay().appendChild(t);
  setTimeout(() => t.remove(), 1200);
}
/** Progress bar. color: green|blue|pink|gold|purple|orange|red */
export function bar(frac, color = '', label = '', opts = {}) {
  const fill = h('i', { class: 'fill', style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%' } });
  const lbl = h('span', { class: 'lbl' }, label);
  const el = h('div', { class: `bar trough ${color} ${opts.cls ?? ''}` }, fill, lbl, opts.icon ? icon(opts.icon, 'ico') : null);
  el.set = (f, text) => {
    fill.style.width = Math.max(0, Math.min(1, f)) * 100 + '%';
    if (text !== undefined) lbl.textContent = text;
  };
  return el;
}

// ---------------------------------------------------------------------------
// Modal popups

/**
 * modal({ title, color, body, foot, onClose, size: ''|'narrow'|'wide', closable, cls, panel: 'panel'|'light'|'gold'|'pink' })
 */
export function modal({ title, color = 'pink', body, foot, onClose, size = '', closable = true, layer = 'overlay', cls = '', panel: pk = '' }) {
  const back = h('div', { class: 'modal-back' });
  const ribbonColor = { yellow: 'gold', purple: 'purple', green: 'green', blue: 'blue', red: 'red' }[color] ?? (['pink', 'blue', 'gold', 'green', 'purple', 'red'].includes(color) ? color : 'pink');
  const closeBtn = closable ? button('', () => close(), 'red sm icon-only modal-close', { icon: 'x', sound: 'tap' }) : null;
  const bodyEl = h('div', { class: 'modal-body' });
  appendChildren(bodyEl, [body]);
  const box = h('div', { class: `panel sk-panel${pk ? '-' + pk : ''}`, style: { display: 'flex', flexDirection: 'column', minHeight: '0', flex: '1 1 auto' } }, closeBtn, bodyEl, foot ? h('div', { class: 'modal-foot' }, foot) : null);
  const m = h('div', { class: `modal ${size} ${cls}` }, title ? h('div', { class: 'modal-head' }, ribbon(title, ribbonColor)) : null, box);
  back.appendChild(m);
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back && closable) close();
  });
  (layer === 'ui' ? $ui() : $overlay()).appendChild(back);
  // after the entrance, drop every fill-mode so no staggered child can stay hidden
  setTimeout(() => m.classList.add('settled'), 1400);
  audio.play('pop', { pitch: 1.2, gap: 0.05 });
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    m.style.transition = 'transform 0.14s, opacity 0.14s';
    m.style.transform = 'scale(0.85)';
    m.style.opacity = '0';
    back.style.transition = 'opacity 0.16s';
    back.style.opacity = '0';
    setTimeout(() => back.remove(), 160);
    onClose && onClose();
  }
  return {
    el: back, panel: m, body: bodyEl, close,
    setBody(node) { clear(bodyEl); appendChildren(bodyEl, [node]); },
    get closed() { return closed; },
  };
}

// ---------------------------------------------------------------------------
// Toasts & banners

let toastBox = null;
export function toast(text, opts = {}) {
  if (!toastBox || !toastBox.isConnected) {
    toastBox = h('div', { class: 'toasts' });
    $overlay().appendChild(toastBox);
  }
  const t = h('div', { class: 'toast sk-panel-dark ' + (opts.cls ?? '') }, opts.icon ? icon(opts.icon) : null, h('span', { html: rich(text) }));
  toastBox.appendChild(t);
  while (toastBox.children.length > 3) toastBox.firstChild.remove();
  setTimeout(() => t.remove(), 2600);
}

export function bigBanner(text, sub = '', opts = {}) {
  const el = h('div', { class: 'banner-big ' + (opts.cls ?? ''), style: { color: opts.color ?? '#fff' } }, text, sub ? h('small', { class: 'outline-sm' }, sub) : null);
  $overlay().appendChild(el);
  if (opts.dur !== 0) setTimeout(() => {
    el.style.transition = 'opacity 0.3s, translate 0.3s';
    el.style.opacity = '0';
    el.style.translate = '-50% -70%';
    setTimeout(() => el.remove(), 320);
  }, (opts.dur ?? 1.4) * 1000);
  return el;
}

// ---------------------------------------------------------------------------
// HUD bands: the strips of scene UI hugging the top / bottom screen edges
// (battle HUD, home top bar + nav). Dialogue and speech bubbles keep clear of them.

let _bands = null, _bandsAt = -1;
export function hudBands() {
  const now = performance.now();
  if (_bands && now - _bandsAt < 400) return _bands;
  const W = window.innerWidth, H = window.innerHeight;
  let top = 0, bottom = 0;
  const root = $ui();
  if (root) {
    const rects = [];
    for (const el of root.querySelectorAll(':scope > *, :scope > * > *, :scope > * > * > *')) {
      const r = el.getBoundingClientRect();
      if (r.width < W * 0.45 || r.height <= 0 || r.height > H * 0.45) continue;
      rects.push(r);
    }
    rects.sort((p, q) => p.top - q.top);
    for (const r of rects) if (r.top <= top + 8 && r.bottom < H * 0.4) top = Math.max(top, r.bottom);
    rects.sort((p, q) => q.bottom - p.bottom);
    for (const r of rects) if (r.bottom >= H - bottom - 8 && r.top > H * 0.5) bottom = Math.max(bottom, H - r.top);
  }
  _bands = { top, bottom, W, H };
  _bandsAt = now;
  return _bands;
}

// ---------------------------------------------------------------------------
// Dialogue (visual-novel panel with typewriter)

let activeDialogue = null;
let lastDlgClose = 0, lastDlgName = '';
const PAUSE = { '.': 7, '!': 7, '?': 7, ',': 3, ';': 4, ':': 4, '-': 2 };

/** Split rich() HTML into per-character spans (words kept unbreakable) so the layout never reflows while typing. */
function typeSpans(container, html) {
  container.innerHTML = html;
  const chars = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of node.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); continue; }
      const w = document.createElement('span');
      w.className = 'w';
      for (const chr of part) {
        const c = document.createElement('span');
        c.className = 'c';
        c.textContent = chr;
        w.appendChild(c);
        chars.push(c);
      }
      frag.appendChild(w);
    }
    node.parentNode.replaceChild(frag, node);
  }
  return chars;
}

/**
 * Show a dialogue line. Resolves when the player taps (after typing).
 * who: { name, portrait?, color?, chibi?, voice? (blip pitch) }
 * opts: { choices:[label|{label,cls}], wait:false (non-blocking, returns {close, promise, el}), speed (chars/s),
 *         place: 'auto'|'top'|'bottom' (auto keeps clear of a tall bottom HUD such as the battle hand) }
 */
export function say(who, text, opts = {}) {
  const now = performance.now();
  if (activeDialogue) { activeDialogue.remove(); activeDialogue = null; }
  for (const old of $overlay().querySelectorAll('.dialogue')) old.remove();
  const name = who?.name ?? '';
  const color = who?.color ?? '#2b8cf2';
  const blocking = opts.wait !== false;
  // same speaker straight after the previous line: keep the panel steady (no re-entrance)
  const cont = name && name === lastDlgName && now - lastDlgClose < 450;

  const textEl = h('div', { class: 'dlg-txt' });
  const next = h('div', { class: 'dlg-next' }, h('span', {}, 'TAP'), h('i'));
  const box = h('div', { class: 'dlg-box' }, name ? h('div', { class: 'dlg-name' }, h('span', {}, name)) : null, textEl, next);
  const portImg = who?.portrait ? h('img', { src: who.portrait, alt: '', draggable: 'false' }) : null;
  const port = portImg ? h('div', { class: 'dlg-port' }, h('i', { class: 'dlg-port-bg' }), portImg) : null;
  const panel = h('div', { class: 'dlg-panel' }, port, box);
  const dlg = h('div', { class: `dialogue ${port ? 'has-port' : ''} ${cont ? 'cont' : ''} ${blocking ? '' : 'passive'}`, style: { '--spk': color } },
    blocking ? h('div', { class: 'dlg-catch' }) : null, panel);

  // placement: above the bottom HUD, or below the top HUD when the bottom one is tall (battle hand)
  const bands = hudBands();
  let place = opts.place ?? 'auto';
  if (place === 'auto') place = bands.bottom > bands.H * 0.15 ? 'top' : 'bottom';
  dlg.classList.add('at-' + place);
  if (place === 'top') panel.style.top = `calc(var(--safe-t) + ${Math.round(bands.top + 10)}px + var(--u) * 3)`;
  else panel.style.bottom = `calc(var(--safe-b) + ${Math.round(bands.bottom + 6)}px + var(--u) * 2)`;

  $overlay().appendChild(dlg);
  activeDialogue = dlg;
  lastDlgName = name;

  const chars = typeSpans(textEl, rich(text));
  let shown = 0;
  let typing = true;
  let finished = false;
  const speed = opts.speed ?? 52;
  const chibi = who?.chibi;
  const voice = who?.voice ?? 1;
  if (chibi) chibi.talk(true);
  if (port) port.classList.add('talking');
  let budget = -2; // short beat before the first letter
  let lastTick = performance.now();
  let raf = 0;
  const tick = (t) => {
    budget += Math.max(0, Math.min(0.25, (t - lastTick) / 1000)) * speed;
    lastTick = t;
    let blip = false;
    while (budget >= 1 && shown < chars.length) {
      const c = chars[shown++];
      c.classList.add('on');
      budget -= 1 + (PAUSE[c.textContent] && shown < chars.length ? PAUSE[c.textContent] : 0);
      if (/[A-Za-z0-9]/.test(c.textContent) && shown % 2 === 1) blip = true;
    }
    if (blip) audio.play('blip', { pitch: voice * (0.94 + Math.random() * 0.14), gap: 0.055 });
    if (shown >= chars.length) finishTyping();
    else raf = requestAnimationFrame(tick);
  };
  const finishTyping = () => {
    if (!typing) return;
    typing = false;
    cancelAnimationFrame(raf);
    for (const c of chars) c.classList.add('on', 'now');
    if (chibi) chibi.talk(false);
    if (port) port.classList.remove('talking');
    if (opts.choices) {
      const ch = h('div', { class: 'dlg-choices' });
      opts.choices.forEach((c, i) => {
        const lbl = typeof c === 'string' ? c : c.label;
        ch.appendChild(button(lbl, () => done(i), (typeof c === 'object' && c.cls) || (i === 0 ? 'pink sm' : 'blue sm')));
      });
      box.appendChild(ch);
    } else if (blocking) dlg.classList.add('ready');
  };
  raf = requestAnimationFrame(tick);

  let resolveFn;
  const promise = new Promise((r) => (resolveFn = r));
  const onKey = (e) => {
    if (!dlg.isConnected) { window.removeEventListener('keydown', onKey, true); return; }
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    e.stopPropagation();
    advance();
  };
  const done = (val) => {
    if (finished) return;
    finished = true;
    if (chibi) chibi.talk(false);
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    dlg.classList.add('closing');
    lastDlgClose = performance.now();
    if (activeDialogue === dlg) activeDialogue = null;
    // keep the tap catcher alive for a moment so the release doesn't click whatever is underneath
    setTimeout(() => dlg.remove(), 170);
    resolveFn(val);
  };
  const advance = () => {
    if (finished) return;
    audio.unlock();
    if (typing) { finishTyping(); return; }
    if (opts.choices || !blocking) return;
    audio.play('tap');
    done();
  };
  dlg.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    if (e.target instanceof Element && e.target.closest('.dlg-choices')) return;
    advance();
  });
  if (blocking) window.addEventListener('keydown', onKey, true);
  if (!blocking) return { close: () => done(), promise, el: dlg };
  return promise;
}
export function closeDialogue() {
  if (activeDialogue) {
    activeDialogue.remove();
    activeDialogue = null;
  }
  for (const old of $overlay()?.querySelectorAll('.dialogue') ?? []) old.remove();
}

// ---------------------------------------------------------------------------
// World-anchored elements: speech bubbles, floating text, pointers

const floaters = [];
const speechBubbles = [];
const pointers = [];
const _v = new THREE.Vector3();

export function floatText(pos, text, cls = 'dmg', opts = {}) {
  const el = h('div', { class: 'ftext ' + cls }, text);
  $world().appendChild(el);
  floaters.push({
    el, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), t: 0,
    life: opts.life ?? 0.9, rise: opts.rise ?? 50, dx: (Math.random() - 0.5) * (opts.spreadX ?? 24), pop: opts.pop ?? true,
  });
  if (floaters.length > 60) {
    const f = floaters.shift();
    f.el.remove();
  }
}

/** Speech bubble following an Object3D-like target with getWorldPosition, or a chibi (uses headTop).
 * Stays on screen and clear of the HUD bands: slides sideways (the tail keeps pointing at the speaker)
 * and flips below the speaker when there is no room above. */
export function speech(target, text, dur = 2.2, opts = {}) {
  const inner = h('div', { class: 'speech-b' }, h('span', { html: rich(text) }), h('i', { class: 'speech-tail' }));
  const el = h('div', { class: 'speech' }, inner);
  $world().appendChild(el);
  const b = { el, inner, target, t: 0, dur, offsetY: opts.offsetY ?? 0, w: 0, hh: 0, out: false };
  speechBubbles.push(b);
  audio.play('bubblePop', { gap: 0.08 });
  return { close: () => { if (b.t < b.dur - 0.18) b.t = b.dur - 0.18; } };
}

/** Tutorial pointer: at a DOM element, screen point, or world position. Returns remover. */
export function pointAt(target, tip = '', opts = {}) {
  const hand = h('img', { class: 'tut-hand', src: handURL() });
  const ring = h('div', { class: 'tut-ring' });
  const tipEl = tip ? h('div', { class: 'tut-tip pop-in' }, tip) : null;
  const layer = $overlay();
  layer.appendChild(ring);
  layer.appendChild(hand);
  if (tipEl) layer.appendChild(tipEl);
  const p = { target, hand, ring, tipEl, opts };
  pointers.push(p);
  updatePointer(p);
  return () => {
    hand.remove();
    ring.remove();
    tipEl && tipEl.remove();
    const i = pointers.indexOf(p);
    if (i >= 0) pointers.splice(i, 1);
  };
}

let _hand = null;
function handURL() {
  if (_hand) return _hand;
  const rows = [
    '....kk..........', '...kwwk.........', '...kwwk.........', '...kwwk.........', '...kwwkkk.......', '...kwwkwwkkk....',
    '.kkkwwkwwkwwkk..', 'kwwkwwwwwwwwwwk.', 'kwwwwwwwwwwwwwk.', '.kwwwwwwwwwwwwk.', '.kwwwwwwwwwwwwk.', '..kwwwwwwwwwwk..',
    '..kwwwwwwwwwk...', '...kwwwwwwwk....', '...kssssssssk...', '...kkkkkkkkkk...',
  ];
  const c = document.createElement('canvas');
  c.width = 16; c.height = 16;
  const ctx = c.getContext('2d');
  const pal = { k: '#120c24', w: '#ffffff', s: '#c8d0e4' };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); } }));
  _hand = c.toDataURL();
  return _hand;
}

function targetScreen(t) {
  if (!t) return null;
  if (t instanceof Element) {
    if (!t.isConnected) return null;
    const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  if (typeof t === 'function') return targetScreen(t());
  if (t.isVector3) return engine.toScreen(t);
  if (t.isObject3D) return engine.toScreen(t.getWorldPosition(_v));
  if (typeof t.x === 'number' && typeof t.y === 'number' && t.z === undefined) return t;
  return null;
}
function updatePointer(p) {
  const s = targetScreen(p.target);
  if (!s) {
    p.hand.style.display = 'none';
    p.ring.style.display = 'none';
    if (p.tipEl) p.tipEl.style.display = 'none';
    return;
  }
  p.hand.style.display = p.ring.style.display = '';
  p.hand.style.left = s.x + 'px';
  p.hand.style.top = s.y + 'px';
  p.ring.style.left = s.x + 'px';
  p.ring.style.top = s.y + 'px';
  if (p.tipEl) {
    p.tipEl.style.display = '';
    p.tipEl.style.left = s.x + 'px';
    p.tipEl.style.top = s.y - (p.opts.tipOffset ?? 46) + 'px';
  }
}

export function updateWorldUI(dt) {
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i];
    f.t += dt;
    const k = f.t / f.life;
    if (k >= 1) {
      f.el.remove();
      floaters.splice(i, 1);
      continue;
    }
    const s = engine.toScreen(f.pos);
    const pop = f.pop ? (k < 0.12 ? 0.5 + (k / 0.12) * 0.9 : k < 0.26 ? 1.4 - ((k - 0.12) / 0.14) * 0.4 : 1) : 1;
    f.el.style.transform = `translate(${s.x + f.dx * k}px, ${s.y - f.rise * Math.sqrt(k)}px) translate(-50%,-50%) scale(${pop})`;
    f.el.style.opacity = k > 0.72 ? String(1 - (k - 0.72) / 0.28) : '1';
  }
  for (let i = speechBubbles.length - 1; i >= 0; i--) {
    const b = speechBubbles[i];
    b.t += dt;
    if (b.t >= b.dur) {
      b.el.remove();
      speechBubbles.splice(i, 1);
      continue;
    }
    if (!b.out && b.t >= b.dur - 0.18) { b.out = true; b.el.classList.add('out'); }
    let wp;
    if (b.target.headTop) wp = b.target.headTop(_v);
    else if (b.target.isVector3) wp = _v.copy(b.target);
    else wp = b.target.getWorldPosition(_v);
    const s = engine.toScreen(wp);
    if (!s.visible) { b.el.style.display = 'none'; continue; }
    b.el.style.display = '';
    if (!b.w) { b.w = b.el.offsetWidth; b.hh = b.el.offsetHeight; }
    const bands = hudBands();
    const m = 6, W = bands.W, H = bands.H;
    const ax = s.x, ay = s.y - b.offsetY;
    const tail = 16;
    // horizontal: keep the whole bubble on screen, the tail slides to stay over the speaker
    const left = Math.max(m, Math.min(W - m - b.w, ax - b.w / 2));
    // vertical: above the head, or flipped below it when the top HUD / screen edge is in the way
    let top = ay - tail - b.hh;
    const below = top < bands.top + m;
    if (below) top = Math.min(H - bands.bottom - m - b.hh, ay + tail + 4);
    b.el.classList.toggle('below', below);
    b.el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    b.el.style.setProperty('--tx', Math.round(Math.max(10, Math.min(b.w - 10, ax - left))) + 'px');
  }
  for (const p of pointers) updatePointer(p);
}

engine.onFrame((dt) => updateWorldUI(dt));

// ---------------------------------------------------------------------------
// Juice: sparkles, bumps, number roll-ups

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Burst of pixel sparkles from an element (screen space). o: { count, colors, spread, stars (4-point sprites) } */
export function sparkle(el, o = {}) {
  if (!el?.isConnected) return;
  const r = el.getBoundingClientRect();
  const n = reducedMotion() ? Math.min(4, o.count ?? 14) : o.count ?? 14;
  const cols = o.colors ?? ['#ffffff', '#ffd84a', '#ff7ac0', '#8fd4ff'];
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < n; i++) {
    // every 3rd particle is a 4-point pixel star sprite, the rest are chunky pixels / plus shapes
    const star = (o.stars ?? true) && i % 3 === 0;
    const s = star ? h('img', { class: 'spark star', src: iconURL('spark4'), alt: '' }) : h('div', { class: 'spark' + (i % 3 === 1 ? ' plus' : '') });
    if (!star) s.style.background = cols[i % cols.length];
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';
    $overlay().appendChild(s);
    const a = Math.random() * Math.PI * 2, d = (o.spread ?? 60) * (0.4 + Math.random() * 0.8);
    s.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(${0.4 + Math.random()})`, opacity: 0 },
    ], { duration: 450 + Math.random() * 400, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => s.remove();
  }
}

/**
 * Claim burst on an element: expanding pixel shockwave ring + spinning pixel
 * sunburst flash + sparkles. o: { color, count, rays (bool), ring (bool), scale }
 */
export function burst(el, o = {}) {
  if (!el?.isConnected) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const size = Math.max(r.width, r.height) * (o.scale ?? 1.6);
  const col = o.color ?? '#ffd84a';
  const layer = $overlay();
  if (o.rays !== false && !reducedMotion()) {
    const rays = h('div', { class: 'ui-burst-rays', style: { left: cx + 'px', top: cy + 'px', width: size * 1.6 + 'px', height: size * 1.6 + 'px' } });
    layer.appendChild(rays);
    rays.animate([{ transform: 'translate(-50%,-50%) scale(0.3) rotate(0deg)', opacity: 0.95 }, { transform: 'translate(-50%,-50%) scale(1.15) rotate(40deg)', opacity: 0 }], { duration: 700, easing: 'cubic-bezier(.2,.8,.3,1)' }).onfinish = () => rays.remove();
  }
  if (o.ring !== false) {
    const ring = h('div', { class: 'ui-burst-ring', style: { left: cx + 'px', top: cy + 'px', '--bc': col } });
    layer.appendChild(ring);
    ring.animate([{ width: '8px', height: '8px', opacity: 1 }, { width: size + 'px', height: size + 'px', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => ring.remove();
  }
  sparkle(el, { count: o.count ?? 18, spread: size * 0.55, colors: o.colors ?? [col, '#ffffff', '#ff7ac0', '#8fd4ff'] });
}

/**
 * Fly a few pixel icons from one element to another (coins into the coin pill...).
 * to: Element | {x, y} | null (flies upward). Resolves when the last one lands.
 */
export function flyIcons(from, iconName, to = null, o = {}) {
  if (!from?.isConnected) return Promise.resolve();
  const a = from.getBoundingClientRect();
  let tx, ty;
  if (to instanceof Element && to.isConnected) { const b = to.getBoundingClientRect(); tx = b.left + b.width / 2; ty = b.top + b.height / 2; }
  else if (to && typeof to.x === 'number') { tx = to.x; ty = to.y; }
  else { tx = a.left + a.width / 2; ty = Math.max(20, a.top - 160); }
  const n = reducedMotion() ? 1 : o.count ?? 6;
  const sz = o.size ?? 26;
  const url = iconURL(iconName);
  const jobs = [];
  for (let i = 0; i < n; i++) {
    const im = h('img', { class: 'ui-fly', src: url, alt: '', style: { width: sz + 'px', height: sz + 'px' } });
    $overlay().appendChild(im);
    const sx = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.5, sy = a.top + a.height / 2 + (Math.random() - 0.5) * a.height * 0.4;
    const mx = sx + (Math.random() - 0.5) * 120, my = sy - 40 - Math.random() * 60;
    const anim = im.animate([
      { transform: `translate(${sx}px, ${sy}px) translate(-50%,-50%) scale(0.4)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) translate(-50%,-50%) scale(1.25)`, opacity: 1, offset: 0.32 },
      { transform: `translate(${tx}px, ${ty}px) translate(-50%,-50%) scale(0.7)`, opacity: 1 },
    ], { duration: 620 + i * 70, delay: i * 55, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'both' });
    jobs.push(new Promise((res) => { anim.onfinish = () => { im.remove(); res(); }; }));
  }
  return Promise.all(jobs).then(() => {
    if (to instanceof Element) { bump(to); o.onLand?.(); }
  });
}
export function bump(el, cls = 'bump') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
export function rollNumber(el, from, to, dur = 0.6, f = fmt) {
  if (!el) return;
  if (el._roll) cancelAnimationFrame(el._roll);
  if (from === to) { el.textContent = f(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / (dur * 1000));
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = f(Math.round(from + (to - from) * e));
    if (k < 1) el._roll = requestAnimationFrame(step);
  };
  el._roll = requestAnimationFrame(step);
}

// ---------------------------------------------------------------------------
// Lab fizz: CSS-animated bubble particles (transform/opacity only, composited)

/**
 * Inject rising bubbles into an element (decorative, pointer-events none).
 * o: { count, size (1 = small pixel bubbles), dur (s), rise (px, default element height), cls }
 * Returns the bubble layer (re-calling replaces it).
 */
export function bubbles(el, o = {}) {
  if (!el) return null;
  for (const old of el.querySelectorAll(':scope > .lab-fizz')) old.remove();
  const layer = h('div', { class: 'lab-fizz ' + (o.cls ?? ''), 'aria-hidden': 'true' });
  const n = o.count ?? 6;
  for (let i = 0; i < n; i++) {
    const b = h('i');
    const s = Math.round((o.size ?? 1) * (2 + Math.random() * 2.6));
    const st = b.style;
    st.setProperty('--x', (6 + ((i + Math.random() * 0.8) / n) * 86).toFixed(1) + '%');
    st.setProperty('--s', `calc(var(--px) * ${s})`);
    st.setProperty('--d', ((o.dur ?? 2.4) * (0.75 + Math.random() * 0.6)).toFixed(2) + 's');
    st.setProperty('--dl', (-Math.random() * 3).toFixed(2) + 's');
    st.setProperty('--a', (0.55 + Math.random() * 0.4).toFixed(2));
    layer.appendChild(b);
  }
  el.prepend(layer);
  const setRise = () => layer.style.setProperty('--h', (o.rise ?? Math.max(24, el.offsetHeight || 60)) + 'px');
  setRise();
  if (!o.rise) requestAnimationFrame(setRise);
  return layer;
}

// Auto-fizz: elements matching these selectors get bubbles when they enter the
// DOM (so screens opt in from CSS class names alone, no JS changes needed).
// Add the class `fizz` to any element to opt in; `[data-fizz="N"]` sets the count.
export const FIZZ_SELECTORS = ['.fizz', '[data-fizz]', '.hm-battle', '.hm-slot.ready', '.hm-mini.ready', '.hm-tabbtn.on', '.vo-sum-ok'];
let fizzObs = null;
function fizzHit(el) {
  if (el.querySelector(':scope > .lab-fizz')) return;
  const n = +el.dataset?.fizz || (el.classList.contains('hm-battle') ? 9 : 5);
  const layer = bubbles(el, { count: n });
  if (layer) layer.dataset.auto = '1';
}
function fizzScan(root, deep) {
  if (!(root instanceof Element) || !root.isConnected) return;
  const sel = FIZZ_SELECTORS.join(',');
  if (root.matches(sel)) fizzHit(root);
  else if (!deep) root.querySelector(':scope > .lab-fizz[data-auto]')?.remove(); // lost its fizz class
  if (deep) for (const el of root.querySelectorAll(sel)) fizzHit(el);
}
function startAutoFizz() {
  if (fizzObs || typeof MutationObserver === 'undefined') return;
  const targets = [document.getElementById('ui'), document.getElementById('overlay')].filter(Boolean);
  if (!targets.length) return;
  let added = new Set(), changed = new Set();
  let raf = 0;
  fizzObs = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'attributes') changed.add(m.target);
      else for (const n of m.addedNodes) if (n.nodeType === 1 && !n.classList.contains('lab-fizz')) added.add(n);
    }
    if ((added.size || changed.size) && !raf) raf = requestAnimationFrame(() => {
      raf = 0;
      const a = added, c = changed;
      added = new Set();
      changed = new Set();
      for (const n of a) fizzScan(n, true);
      for (const n of c) if (!a.has(n)) fizzScan(n, false);
    });
  });
  for (const t of targets) fizzObs.observe(t, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'data-fizz'] });
}
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAutoFizz, { once: true });
  else startAutoFizz();
}

// ---------------------------------------------------------------------------
// Tooltips: any element with data-tip="..." shows a pixel speech tip on mouse
// hover or on a touch long-press (450 ms). tip(el, text) sets it from code.

export function tip(el, text) {
  if (el) {
    if (text) el.dataset.tip = text;
    else delete el.dataset.tip;
  }
  return el;
}
let tipEl = null, tipFor = null, tipHold = 0;
function showTip(target) {
  const text = target?.dataset?.tip;
  if (!text || !target.isConnected) return;
  hideTip();
  tipFor = target;
  const r = target.getBoundingClientRect();
  tipEl = h('div', { class: 'ui-tip', html: rich(text) });
  $overlay().appendChild(tipEl);
  const tw = tipEl.offsetWidth, th = tipEl.offsetHeight;
  const below = r.top - th - 14 < 8;
  const x = Math.max(6 + tw / 2, Math.min(innerWidth - 6 - tw / 2, r.left + r.width / 2));
  tipEl.style.left = x + 'px';
  tipEl.style.top = (below ? r.bottom + 10 : r.top - th - 10) + 'px';
  tipEl.style.setProperty('--ax', r.left + r.width / 2 - (x - tw / 2) + 'px');
  tipEl.classList.toggle('below', below);
}
function hideTip() {
  clearTimeout(tipHold);
  tipFor = null;
  if (tipEl) { tipEl.remove(); tipEl = null; }
}
if (typeof window !== 'undefined') {
  const find = (e) => (e.target instanceof Element ? e.target.closest('[data-tip]') : null);
  window.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const t = find(e);
    if (t && t !== tipFor) showTip(t);
    else if (!t && tipFor) hideTip();
  }, true);
  window.addEventListener('pointerdown', (e) => {
    hideTip();
    if (e.pointerType === 'mouse') return;
    const t = find(e);
    if (t) tipHold = setTimeout(() => showTip(t), 450);
  }, true);
  for (const ev of ['pointerup', 'pointercancel', 'scroll', 'wheel']) window.addEventListener(ev, (e) => {
    if (e.type === 'pointerup' && e.pointerType === 'mouse') return;
    clearTimeout(tipHold);
    if (tipEl && e.type !== 'pointerup') hideTip();
    else if (tipEl) setTimeout(hideTip, 900);
  }, true);
}

// ---------------------------------------------------------------------------
// Interaction layer (delegated, passive listeners; transform / opacity only):
//  - cards tilt toward the pointer with a parallax shine (menus + modals)
//  - scrollers bounce when a fling hits the top / bottom
//  - [data-sfx="tap|pop|..."] plays that sound on press

const TILT_SCOPE = '.mn-screen, .modal, .vo-root, .hm-unlock';
let tiltEl = null;
function setTilt(card, e) {
  const r = card.getBoundingClientRect();
  const fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), fy = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
  card.style.setProperty('--rx', ((fx - 0.5) * 18).toFixed(1) + 'deg');
  card.style.setProperty('--ry', ((0.5 - fy) * 14).toFixed(1) + 'deg');
  card.style.setProperty('--mx', (fx * 100).toFixed(0) + '%');
  card.style.setProperty('--my', (fy * 100).toFixed(0) + '%');
  card.classList.add('tilting');
}
function clearTilt() {
  if (!tiltEl) return;
  tiltEl.classList.remove('tilting');
  tiltEl = null;
}
function tiltTarget(e) {
  if (reducedMotion() || !(e.target instanceof Element)) return null;
  const c = e.target.closest('.gcard');
  return c && !c.classList.contains('locked') && c.closest(TILT_SCOPE) ? c : null;
}
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' && !e.buttons) return;
    const c = tiltTarget(e);
    if (c !== tiltEl) clearTilt();
    if (!c) return;
    tiltEl = c;
    setTilt(c, e);
  }, { passive: true });
  window.addEventListener('pointerdown', (e) => {
    const c = tiltTarget(e);
    if (c) { clearTilt(); tiltEl = c; setTilt(c, e); }
    const sfx = e.target instanceof Element ? e.target.closest('[data-sfx]') : null;
    if (sfx) audio.play(sfx.dataset.sfx, { pitch: 0.95 + Math.random() * 0.15, gap: 0.04 });
  }, { passive: true, capture: true });
  for (const ev of ['pointerup', 'pointercancel']) window.addEventListener(ev, (e) => { if (e.pointerType !== 'mouse') clearTilt(); }, { passive: true });
  document.addEventListener('pointerleave', clearTilt, { passive: true });

  // edge bounce for the menu scrollers
  const lastTop = new WeakMap();
  window.addEventListener('scroll', (e) => {
    const sc = e.target;
    if (!(sc instanceof Element) || !sc.matches('.mn-scroll, .modal-body, .scroll-y') || reducedMotion()) return;
    const prev = lastTop.get(sc) ?? sc.scrollTop;
    const top = sc.scrollTop, max = sc.scrollHeight - sc.clientHeight;
    lastTop.set(sc, top);
    const v = top - prev;
    const kid = sc.firstElementChild;
    if (!kid || Math.abs(v) < 6) return;
    if (top <= 0 && v < 0) bump(kid, 'edge-bounce-top');
    else if (top >= max - 1 && v > 0) bump(kid, 'edge-bounce-bot');
  }, { passive: true, capture: true });
}

/** Drop a short burst of pixel confetti over a layer (DOM, CSS-animated). o: { count, colors } */
export function confetti(parent = $overlay(), o = {}) {
  if (!parent) return null;
  const n = reducedMotion() ? 0 : o.count ?? 36;
  const cols = o.colors ?? ['#ffd84a', '#ff2e88', '#3ff2e0', '#7aff4a', '#ffffff', '#a35cff', '#ff8a1f'];
  const layer = h('div', { class: 'ui-confetti', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) {
    const p = h('i');
    const st = p.style;
    st.setProperty('--x', (Math.random() * 100).toFixed(1) + '%');
    st.setProperty('--c', cols[i % cols.length]);
    st.setProperty('--d', (1.8 + Math.random() * 1.6).toFixed(2) + 's');
    st.setProperty('--dl', (Math.random() * (o.spread ?? 0.9)).toFixed(2) + 's');
    st.setProperty('--dx', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
    st.setProperty('--r', (Math.random() * 720 - 360).toFixed(0) + 'deg');
    st.setProperty('--w', (2 + Math.floor(Math.random() * 3)) + '');
    layer.appendChild(p);
  }
  parent.appendChild(layer);
  setTimeout(() => layer.remove(), (o.life ?? 4.6) * 1000);
  return layer;
}

// ---------------------------------------------------------------------------
// Misc helpers

export function fullscreenToggle() {
  const d = document.documentElement;
  if (!document.fullscreenElement) d.requestFullscreen?.().catch(() => {});
  else document.exitFullscreen?.();
}

/** Await a single click/tap on an element (or anywhere if none). */
export function waitTap(el = document.getElementById('app')) {
  return new Promise((res) => {
    const fn = (e) => {
      el.removeEventListener('pointerdown', fn, true);
      audio.unlock();
      res(e);
    };
    el.addEventListener('pointerdown', fn, true);
  });
}
