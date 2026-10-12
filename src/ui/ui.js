// DOM UI toolkit: hyperscript helper, pixel icons, skinned buttons, panels,
// pills, bars, ribbons, modals, toasts, slam banners, typewriter dialogue,
// world-anchored speech bubbles & floating combat text, tutorial pointers,
// DOM sparkles and number roll-ups. Pixel scale adapts to the screen.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { iconURL as pixIconURL } from './icons.js';
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
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
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
  bubbles.length = 0;
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
    audio.play(opts.sound ?? 'click');
    onClick && onClick(e);
  });
  return b;
}
export function setDisabled(btn, on) {
  btn.classList.toggle('disabled', !!on);
  return btn;
}

export function priceTag(cur, amount) {
  return h('span', { class: 'price' }, icon(cur === 'bucks' ? 'bucks' : cur === 'coins' ? 'coin' : cur), h('span', {}, typeof amount === 'number' ? fmt(amount) : String(amount)));
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
  const el = h('div', { class: 'pill trough ' + (opts.plus ? 'has-plus ' : '') + (opts.cls ?? '') }, icon(iconName), val);
  if (opts.plus) {
    const plus = h('button', { class: 'btn sk-btn-green plus icon-only', type: 'button' }, h('span', { class: 't-d', style: { fontSize: '1.2em' } }, '+'));
    plus.addEventListener('click', (e) => { e.stopPropagation(); audio.play('click'); opts.plus(); });
    el.appendChild(plus);
  }
  if (opts.onClick) el.addEventListener('click', () => { audio.unlock(); audio.play('click'); opts.onClick(); });
  el.val = val;
  return el;
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
// Dialogue (typewriter)

let activeDialogue = null;
/**
 * Show a dialogue line. Resolves when the player taps (after typing).
 * who: { name, portrait?, color?, chibi? }
 * opts: { choices:[label|{label,cls}], wait:false (non-blocking, returns {close}), speed }
 */
export function say(who, text, opts = {}) {
  if (activeDialogue) activeDialogue.remove();
  const textEl = h('div', { class: 'txt' });
  const box = h('div', { class: 'box sk-panel-cream' }, who?.name ? h('div', { class: 'speaker', style: who.color ? { background: who.color } : null }, who.name) : null, textEl);
  const next = h('div', { class: 'next' }, '▼');
  const portrait = who?.portrait ? h('div', { class: 'portrait panel sk-panel-light' }, h('img', { src: who.portrait })) : null;
  const dlg = h('div', { class: 'dialogue' }, portrait, box);
  $overlay().appendChild(dlg);
  activeDialogue = dlg;
  const html = rich(text);
  const plain = html.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '_');
  let shown = 0;
  let typing = true;
  const speed = opts.speed ?? 60;
  const chibi = who?.chibi;
  if (chibi) chibi.talk(true);
  let acc = 0;
  let lastTick = performance.now();
  const renderPartial = (n) => {
    let out = '', count = 0;
    for (let i = 0; i < html.length && count < n; i++) {
      if (html[i] === '<') {
        const j = html.indexOf('>', i);
        out += html.slice(i, j + 1);
        i = j;
      } else if (html[i] === '&') {
        const j = html.indexOf(';', i);
        out += html.slice(i, j + 1);
        i = j;
        count++;
      } else {
        out += html[i];
        count++;
      }
    }
    const opens = (out.match(/<(b|em)>/g) || []).length - (out.match(/<\/(b|em)>/g) || []).length;
    if (opens > 0) out += out.lastIndexOf('<em>') > out.lastIndexOf('<b>') ? '</em>' : '</b>';
    textEl.innerHTML = out;
  };
  let raf = 0;
  const tick = (now) => {
    acc += ((now - lastTick) / 1000) * speed;
    lastTick = now;
    const n = Math.floor(acc);
    if (n !== shown) {
      shown = n;
      renderPartial(shown);
      if (shown % 3 === 0) audio.play('tick', { pitch: 0.8 + Math.random() * 0.5, gap: 0.04 });
    }
    if (shown >= plain.length) finishTyping();
    else raf = requestAnimationFrame(tick);
  };
  const finishTyping = () => {
    typing = false;
    cancelAnimationFrame(raf);
    textEl.innerHTML = html;
    if (chibi) chibi.talk(false);
    if (opts.choices) {
      const ch = h('div', { class: 'choices' });
      opts.choices.forEach((c, i) => {
        const lbl = typeof c === 'string' ? c : c.label;
        ch.appendChild(button(lbl, () => done(i), (typeof c === 'object' && c.cls) || (i === 0 ? 'pink sm' : 'blue sm')));
      });
      box.appendChild(ch);
    } else if (opts.wait !== false) box.appendChild(next);
  };
  raf = requestAnimationFrame(tick);

  let resolveFn;
  const promise = new Promise((r) => (resolveFn = r));
  const done = (val) => {
    if (chibi) chibi.talk(false);
    cancelAnimationFrame(raf);
    dlg.remove();
    if (activeDialogue === dlg) activeDialogue = null;
    resolveFn(val);
  };
  dlg.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    audio.unlock();
    if (typing) {
      shown = plain.length;
      finishTyping();
      return;
    }
    if (opts.choices || opts.wait === false) return;
    audio.play('tap');
    done();
  });
  if (opts.wait === false) return { close: () => done(), promise, el: dlg };
  return promise;
}
export function closeDialogue() {
  if (activeDialogue) {
    activeDialogue.remove();
    activeDialogue = null;
  }
}

// ---------------------------------------------------------------------------
// World-anchored elements: speech bubbles, floating text, pointers

const floaters = [];
const bubbles = [];
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

/** Speech bubble following an Object3D-like target with getWorldPosition, or a chibi (uses headTop). */
export function speech(target, text, dur = 2.2, opts = {}) {
  const el = h('div', { class: 'speech' }, h('span', { class: 'speech-b pop-in', html: rich(text) }));
  $world().appendChild(el);
  const b = { el, target, t: 0, dur, offsetY: opts.offsetY ?? 0 };
  bubbles.push(b);
  return { close: () => { b.t = b.dur; } };
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
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    b.t += dt;
    if (b.t >= b.dur) {
      b.el.remove();
      bubbles.splice(i, 1);
      continue;
    }
    let wp;
    if (b.target.headTop) wp = b.target.headTop(_v);
    else if (b.target.isVector3) wp = _v.copy(b.target);
    else wp = b.target.getWorldPosition(_v);
    const s = engine.toScreen(wp);
    b.el.style.left = s.x + 'px';
    b.el.style.top = s.y - b.offsetY + 'px';
    b.el.style.display = s.visible ? '' : 'none';
  }
  for (const p of pointers) updatePointer(p);
}

engine.onFrame((dt) => updateWorldUI(dt));

// ---------------------------------------------------------------------------
// Juice: sparkles, bumps, number roll-ups

/** Burst of pixel sparkles from an element (screen space). */
export function sparkle(el, o = {}) {
  const r = el.getBoundingClientRect();
  const n = o.count ?? 14;
  const cols = o.colors ?? ['#ffffff', '#ffd84a', '#ff7ac0', '#8fd4ff'];
  for (let i = 0; i < n; i++) {
    const s = h('div', { class: 'spark' });
    s.style.background = cols[i % cols.length];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
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
