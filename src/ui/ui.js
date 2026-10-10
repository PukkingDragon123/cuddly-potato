// DOM UI toolkit: hyperscript helper, pixel icons, buttons, modals, toasts,
// dialogue with typewriter text, world-anchored speech bubbles & floating text,
// and tutorial pointers.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';

export const $ui = () => document.getElementById('ui');
export const $overlay = () => document.getElementById('overlay');
export const $world = () => document.getElementById('world-ui');

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
}

/** Light markup: *bold* and _emphasis_. */
export function rich(text) {
  const esc = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*(.+?)\*/g, '<b>$1</b>').replace(/_(.+?)_/g, '<em>$1</em>').replace(/\n/g, '<br>');
}

// ---------------------------------------------------------------------------
// Pixel icons

const PAL = {
  k: '#0d1029', w: '#ffffff', y: '#ffd23f', Y: '#e0a21a', o: '#ff8a2a', O: '#d0601a', r: '#ff4a4a', R: '#b8282f',
  p: '#ff2e88', P: '#c4126a', b: '#29b6f6', B: '#1477c9', g: '#5fdc4a', G: '#2f9e2f', s: '#c8ccd8', S: '#8a93b8',
  n: '#8e5a3c', N: '#5a3220', v: '#b05cff', V: '#7a2fd0', c: '#9ff2ff',
};

const ICONS = {
  coin: ['....kkkk....', '..kkyyyykk..', '.kyyyyyyyyk.', '.kywYYYyyyk.', 'kyywYyyYyyYk', 'kyyyYYYyyyYk', 'kyyyYyyYyyYk', 'kyyyYYYyyyYk', '.kyyyyyyyYk.', '.kYyyyyyYYk.', '..kkYYYYkk..', '....kkkk....'],
  bucks: ['............', '...kkkkkk...', '..kpwwpppk..', '.kpwpppppPk.', 'kkkkkkkkkkkk', 'kppwppppPPPk', '.kppppppPPk.', '..kpppppPk..', '...kpppPk...', '....kpPk....', '.....kk.....', '............'],
  trophy: ['..kkkkkkkk..', 'kkkwyyyyYkkk', 'kykwyyyyYkyk', 'kykyyyyyYkyk', '.kkyyyyyYkk.', '..kyyyyyYk..', '...kkyYkk...', '....kyYk....', '....kyYk....', '...kkkkkk...', '..kYyyyyYk..', '..kkkkkkkk..'],
  calorie: ['.....kk.....', '....kok.....', '...koork.k..', '...koyok.kk.', '..koyyyokok.', '.koyyyyyook.', '.koyywyyyok.', 'kooyywwyyook', 'koyyywwyyyok', 'koyyyyyyyyok', '.kooyyyyook.', '..kkkkkkkk..'],
  energy: ['......kkkk..', '.....kyyk...', '....kyyk....', '...kyyk.....', '..kyyykkkk..', '.kyyyyyyyk..', '.kkkkyyyk...', '....kyyk....', '...kyyk.....', '..kyyk......', '..kyk.......', '..kk........'],
  hp: ['............', '.kkk..kkk...', 'krrwkkrrrk..', 'krwrrrrrRRk.', 'krrrrrrrrRk.', 'krrrrrrrrRk.', '.krrrrrrRk..', '..krrrrRk...', '...krrrk....', '....krk.....', '.....k......', '............'],
  heart: ['............', '.kkk..kkk...', 'kppwkkpppk..', 'kpwpppppPPk.', 'kppppppppPk.', 'kppppppppPk.', '.kppppppPk..', '..kppppPk...', '...kpppk....', '....kpk.....', '.....k......', '............'],
  sword: ['.........kk.', '........kwsk', '.......kwsk.', '......kwsk..', '.....kwsk...', '.k..kwsk....', '.kkkwsk.....', '..kkSk......', '..knkk......', '.knnk.k.....', 'kNnk........', 'kkk.........'],
  clock: ['...kkkkkk...', '..kwwwwwwk..', '.kwwwkwwwwk.', 'kwwwwkwwwwwk', 'kwwwwkwwwwwk', 'kwwwwkkkkwwk', 'kwwwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...'],
  lock: ['....kkkk....', '...kSSSSk...', '..kSk..kSk..', '..kSk..kSk..', '.kkkkkkkkkk.', '.kyyyyyyyYk.', '.kyyykkyyYk.', '.kyyykkyyYk.', '.kyyyykyyYk.', '.kYYYYYYYYk.', '.kkkkkkkkkk.'],
  star: ['.....kk.....', '....kyyk....', '....kyyk....', 'kkkkkyykkkkk', 'kyyyywyyyyYk', '.kyyyyyyyYk.', '..kyyyyyYk..', '..kyyyyyyk..', '.kyyykkyyYk.', '.kyykk.kkYk.', 'kkkk....kkkk'],
  vial: ['...kkkkkk...', '...kooooOk..', '...kkkkkkk..', '....kcwck...', '....kccck...', '....kykkk...', '....kkyyk...', '....kgggk...', '....kgwgk...', '....kgggk...', '.....kgk....', '......k.....'],
  flask: ['....kkkk....', '....kcwk....', '....kcwk....', '....kcck....', '...kcccck...', '..kcccccck..', '..kgggggggk.', '.kggwggggGk.', '.kgggggggGk.', 'kgggggggggGk', 'kkkkkkkkkkkk'],
  up: ['.....kk.....', '....kggk....', '...kgggGk...', '..kggggGGk..', '.kkkkggkkkk.', '....kggk....', '....kggk....', '....kggk....', '....kGGk....', '....kkkk....'],
  bag: ['...k....k...', '....kkkk....', '.....kk.....', '....kGGk....', '...kggggk...', '..kgggwggk..', '.kggwwwgggk.', '.kggwgggGGk.', '.kgggwwgGGk.', '.kgggggwGGk.', '.kggwwwgGGk.', '..kgggGGGk..', '...kkkkkk...'],
  skull: ['..kkkkkkkk..', '.kwwwwwwwwk.', 'kwwwwwwwwwwk', 'kwkkwwwwkkwk', 'kwkkwwwwkkwk', 'kwwwwkkwwwwk', '.kwwwwwwwwk.', '..kwkwkwkk..', '..kkkkkkkk..'],
  cart: ['k...........', 'kk..........', '.kkkkkkkkkkk', '.kwwwwwwwwk.', '.kwbwbwbwk..', '.kwwwwwwwk..', '..kkkkkkkk..', '..k.....k...', '.kkk...kkk..', '.kSk...kSk..', '.kkk...kkk..'],
  pin: ['...kkkkkk...', '..kpppppPk..', '.kppwwwppPk.', '.kpwkkkwpPk.', '.kpwkkkwpPk.', '.kppwwwppPk.', '..kpppppPk..', '...kpppPk...', '....kpPk....', '.....kk.....'],
  crown: ['k....kk....k', 'kk..kyyk..kk', 'kyk.kyyk.kyk', 'kyykyyyykyyk', 'kyyyyyyyyyyk', 'kyyyyyyyyyyk', 'kypyyyyybyyk', 'kyyyyyyyyyyk', 'kYYYYYYYYYYk', 'kkkkkkkkkkkk'],
  swarm: ['..kkkkkkkk..', '.kbbbbbbbbk.', 'kbbwwbbwwbbk', 'kbbwkbbwkbbk', 'kbbbbbbbbbbk', 'kbkkkkkkkkbk', 'kbkwkwkwkwbk', 'kbbbbbbbbbbk', '.kbbbbbbbbk.', '..kk....kk..'],
  magic: ['.....k......', '....kvk.....', '.kk.kvk.kk..', '.kvkkvkkvk..', '..kvvvvvk...', 'kkkvvwvvkkk.', 'kvvvwwwvvvk.', 'kkkvvwvvkkk.', '..kvvvvvk...', '.kvkkvkkvk..', '.kk.kvk.kk..', '....kvk.....', '.....k......'],
  briefcase: ['....kkkk....', '....k..k....', 'kkkkkkkkkkkk', 'kNnnnnnnnnNk', 'kNnnnyynnnNk', 'kkkkkyykkkkk', 'kNnnnnnnnnNk', 'kNnnnnnnnnNk', 'kNnnnnnnnnNk', 'kkkkkkkkkkkk'],
  check: ['..........kk', '.........kgk', '........kgk.', '.kk....kgk..', 'kgk...kgk...', '.kgk.kgk....', '..kgkgk.....', '...kgk......', '....k.......'],
  x: ['kk......kk', 'kwk....kwk', '.kwk..kwk.', '..kwkkwk..', '...kwwk...', '...kwwk...', '..kwkkwk..', '.kwk..kwk.', 'kwk....kwk', 'kk......kk'],
  gear: ['....kkkk....', '.kk.kssk.kk.', '.kskssssksk.', '..kssssssk..', 'kkssskkssskk', 'ksssk..kssSk', 'ksssk..kssSk', 'kkssskkssSkk', '..kssssSSk..', '.kskssSSksk.', '.kk.kSSk.kk.', '....kkkk....'],
  speed: ['............', '....kkkkkk..', '...kbbbbbbk.', 'kk.kbwbbbbBk', '...kbbbbbbBk', 'kkkkbbbbbBBk', '...kbbbbbBk.', 'kk.kkkkkkk..'],
  range: ['.....kk.....', '....kwwk....', '...kwrrwk...', '..kwrkkrwk..', '.kwrk..krwk.', 'kwrk.kk.krwk', 'kwrk.kk.krwk', '.kwrk..krwk.', '..kwrkkrwk..', '...kwrrwk...', '....kwwk....', '.....kk.....'],
  shield: ['kkkkkkkkkkk', 'kbbbbwbbbBk', 'kbbbwwbbbBk', 'kbbbbwbbbBk', 'kbbbbbbbbBk', '.kbbbbbbBk.', '.kbbbbbbBk.', '..kbbbbBk..', '...kbbBk...', '....kkk....'],
  ball: ['...kkkkkk...', '..kwwwkkwwk.', '.kwwwkkkwwwk', 'kkwwwkwwwkkk', 'kkkwwwwwkkkk', 'kwwwwwwwwwwk', 'kwwkkwwwwwwk', 'kwkkkwwwkkwk', '.kwkwwwwkkk.', '..kwwwwwwk..', '...kkkkkk...'],
  truck: ['............', '......kkkk..', '......kccok.', 'kkkkkkkccook', 'kooooookoooo', 'koooowookooo', 'kkkkkkkkkkkk', '.kSSk..kSSk.', '.kkkk..kkkk.'],
  music: ['....kkkkkkk.', '....kvvvvvk.', '....kvkkkvk.', '....kvk.kvk.', '....kvk.kvk.', '..kkkvk.kvk.', '.kvvvvkkkvk.', '.kvvvvkvvvk.', '..kkkkkvvvk.', '.......kkk..'],
  play: ['kk........', 'kwkk......', 'kwwwkk....', 'kwwwwwkk..', 'kwwwwwwwk.', 'kwwwwwkk..', 'kwwwkk....', 'kwkk......', 'kk........'],
  bolt: ['....kkk.', '...kyyk.', '..kyyk..', '.kyyykk.', 'kkkyyyk.', '..kyyk..', '.kyyk...', '.kyk....', '.kk.....'],
  chest: ['..kkkkkkkk..', '.knnnnnnnnk.', 'knnnnnnnnnnk', 'kkkkkkkkkkkk', 'knnnnkkNnnnk', 'kyyyykykyyyk', 'knnnnkkknnnk', 'knnnnnnnnnnk', 'kNNNNNNNNNNk', 'kkkkkkkkkkkk'],
  quest: ['..kkkkkkk...', '.kwwwwwwwk..', '.kwkkkkkwk..', '.kwwwwwwwk..', '.kwkkkkwwk..', '.kwwwwwwwk..', '.kwkkkkkwk..', '.kwwwwwwwkk.', '.kwkkkwwkpk.', '.kwwwwwwkpk.', '..kkkkkkkk..'],
  dna: ['kk......kk', '.kbk..kpk.', '..kbkkpk..', '...kbpk...', '...kpbk...', '..kpkkbk..', '.kpk..kbk.', 'kpk....kbk', '.kpk..kbk.', '..kpkkbk..'],
  chrome: ['....kk....', '...kwck...', '..kwccsk..', '.kwccsssk.', 'kwccsssSSk', '.kcssssSk.', '..ksssSk..', '...kSSk...', '....kk....'],
  mega: ['kk.......kk', 'kpk.....kpk', 'kppk...kppk', 'kpppk.kpppk', 'kpwppkpppPk', 'kpwpppppPPk', 'kppppppppPk', 'kpppkkkppPk', 'kppk...kpPk', 'kkk.....kkk'],
  paint: ['.....kkkk...', '....kpbyk...', '...kpbygk...', '..kpbygk....', '..kkkkk.....', '..ksssk.....', '..knnk......', '.knnk.......', '.knk........', 'kkk.........'],
  flag: ['kk..........', 'kpkkkkkkk...', 'kppppppppk..', 'kppwpppppPk.', 'kppppppppk..', 'kpkkkkkkk...', 'kk..........', 'kk..........', 'kk..........', 'kk..........'],
};

const iconCache = new Map();
export function iconURL(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const rows = ICONS[name] || ICONS.star;
  const w = Math.max(...rows.map((r) => r.length)), hgt = rows.length;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = hgt;
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = PAL[ch] || '#f0f';
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const url = c.toDataURL();
  iconCache.set(name, url);
  return url;
}
export function icon(name, cls = '') {
  return h('img', { src: iconURL(name), class: 'pi ' + cls, alt: name, draggable: 'false' });
}

// ---------------------------------------------------------------------------
// Buttons

export function button(label, onClick, cls = '', opts = {}) {
  const b = h('button', { class: 'btn ' + cls, type: 'button' });
  if (opts.icon) b.appendChild(icon(opts.icon));
  if (label !== null && label !== undefined && label !== '') {
    if (label instanceof Node) b.appendChild(label);
    else b.appendChild(h('span', { html: rich(label) }));
  }
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

export function priceTag(cur, amount) {
  return h('span', { class: 'price' }, icon(cur), String(amount));
}

export function bar(frac, cls = '', label = '') {
  const i = h('i', { style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%' } });
  return h('div', { class: 'bar ' + cls }, i, label ? h('span', { class: 'outline-sm' }, label) : null);
}

// ---------------------------------------------------------------------------
// Modal

export function modal({ title, color = '', body, foot, onClose, size = '', closable = true, layer = 'overlay', cls = '' }) {
  const back = h('div', { class: 'modal-back fade-in' });
  const closeBtn = closable ? button('', () => close(), 'red small icon-only close-x', { icon: 'x' }) : null;
  const panel = h(
    'div',
    { class: `modal px-box bounce-in ${size} ${cls}` },
    h('div', { class: `modal-head ${color}` }, h('div', { class: 'title outline-sm' }, title), closeBtn),
    h('div', { class: 'modal-body' }, body),
    foot ? h('div', { class: 'modal-foot' }, foot) : null,
  );
  back.appendChild(panel);
  back.addEventListener('pointerdown', (e) => {
    if (e.target === back && closable) close();
  });
  (layer === 'ui' ? $ui() : $overlay()).appendChild(back);
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    back.remove();
    onClose && onClose();
  }
  const bodyEl = panel.querySelector('.modal-body');
  return {
    el: back, panel, body: bodyEl, close,
    setBody(node) { clear(bodyEl); appendChildren(bodyEl, [node]); },
    get closed() { return closed; },
  };
}

// ---------------------------------------------------------------------------
// Toasts

let toastBox = null;
export function toast(text, opts = {}) {
  if (!toastBox || !toastBox.isConnected) {
    toastBox = h('div', { class: 'toasts' });
    $overlay().appendChild(toastBox);
  }
  const t = h('div', { class: 'toast px-box ' + (opts.cls ?? '') }, opts.icon ? icon(opts.icon) : null, h('span', { html: rich(text) }));
  if (opts.color) t.style.background = opts.color;
  toastBox.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

export function bigBanner(text, sub = '', opts = {}) {
  const el = h('div', { class: 'banner-big outline slam ' + (opts.cls ?? ''), style: { color: opts.color ?? '#fff' } }, text, sub ? h('small', {}, sub) : null);
  $overlay().appendChild(el);
  if (opts.dur !== 0) setTimeout(() => {
    el.style.transition = 'opacity 0.3s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, (opts.dur ?? 1.4) * 1000);
  return el;
}

// ---------------------------------------------------------------------------
// Dialogue

let activeDialogue = null;
/**
 * Show a dialogue line. Resolves when the player taps (after typing).
 * who: { name, portrait?, color?, chibi? }
 * opts: { choices:[label|{label,cls}], wait:false (non-blocking, returns {close}), speed }
 */
export function say(who, text, opts = {}) {
  if (activeDialogue) activeDialogue.remove();
  const textEl = h('div', { class: 'txt' });
  const box = h('div', { class: 'box px-box cream' }, who?.name ? h('div', { class: 'speaker', style: who.color ? { background: who.color } : null }, who.name) : null, textEl);
  const next = h('div', { class: 'next display' }, '▼');
  const portrait = who?.portrait ? h('div', { class: 'portrait px-box' }, h('img', { src: who.portrait })) : null;
  const dlg = h('div', { class: 'dialogue slide-up' }, portrait, box);
  $overlay().appendChild(dlg);
  activeDialogue = dlg;
  const html = rich(text);
  // typewriter over visible characters while keeping tags
  const plain = html.replace(/<[^>]+>/g, '');
  let shown = 0;
  let typing = true;
  const speed = opts.speed ?? 55;
  const chibi = who?.chibi;
  if (chibi) chibi.talk(true);
  let acc = 0;
  let lastTick = performance.now();
  const renderPartial = (n) => {
    // walk html, count text characters
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
    // close dangling tags
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
        ch.appendChild(button(lbl, () => done(i), (typeof c === 'object' && c.cls) || (i === 0 ? 'pink small' : 'small')));
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
  const el = h('div', { class: 'ftext outline ' + cls }, text);
  $world().appendChild(el);
  floaters.push({
    el, pos: pos.clone ? pos.clone() : new THREE.Vector3(pos.x, pos.y, pos.z), t: 0,
    life: opts.life ?? 0.9, rise: opts.rise ?? 50, dx: (Math.random() - 0.5) * (opts.spreadX ?? 20), pop: opts.pop ?? true,
  });
  if (floaters.length > 60) {
    const f = floaters.shift();
    f.el.remove();
  }
}

/** Speech bubble following an Object3D-like target with getWorldPosition, or a chibi (uses headTop). */
export function speech(target, text, dur = 2.2, opts = {}) {
  const el = h('div', { class: 'speech' }, h('span', { class: 'speech-b bounce-in', html: rich(text) }));
  $world().appendChild(el);
  const b = { el, target, t: 0, dur, offsetY: opts.offsetY ?? 0 };
  bubbles.push(b);
  return { close: () => { b.t = b.dur; } };
}

/** Tutorial pointer: at a DOM element, screen point, or world position. Returns remover. */
export function pointAt(target, tip = '', opts = {}) {
  const hand = h('img', { class: 'tut-hand', src: handURL() });
  const ring = h('div', { class: 'tut-ring' });
  const tipEl = tip ? h('div', { class: 'tut-tip fade-in' }, tip) : null;
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
  const rows = ['...kk.......', '..kwwk......', '..kwwk......', '..kwwkkk....', '..kwwkwwkkk.', 'kkkwwkwwkwwk', 'kwkwwwwwwwwk', 'kwwwwwwwwwwk', '.kwwwwwwwwwk', '.kwwwwwwwwk.', '..kwwwwwwk..', '...kkkkkk...'];
  const c = document.createElement('canvas');
  c.width = 12; c.height = 12;
  const ctx = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { ctx.fillStyle = PAL[ch]; ctx.fillRect(x, y, 1, 1); } }));
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
    p.tipEl.style.top = s.y - (p.opts.tipOffset ?? 40) + 'px';
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
    const pop = f.pop ? (k < 0.15 ? 0.6 + (k / 0.15) * 0.8 : k < 0.3 ? 1.4 - ((k - 0.15) / 0.15) * 0.4 : 1) : 1;
    f.el.style.transform = `translate(${s.x + f.dx * k - 0}px, ${s.y - f.rise * Math.sqrt(k)}px) translate(-50%,-50%) scale(${pop})`;
    f.el.style.left = '0px';
    f.el.style.top = '0px';
    f.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
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
