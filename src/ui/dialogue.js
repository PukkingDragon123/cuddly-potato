// Cinematic dialogue: say(who, text, opts).
//
// A letterboxed "face cam" shows a live 3D close-up of the speaker (the real
// Chibi model rendered by the shared Stage3D renderer): the camera slowly
// pushes in on the face, the mouth flaps in time with the words, the head
// bobs on *emphasis* words and bounces on "!" beats, blinks and glances run on
// their own. Below it, words pop in one by one with a springy scale / bounce;
// *emphasis* words land bigger, glow gold and keep shaking; punctuation adds
// beats (the mouth closes, the panel kicks on "!"). Scenes can push their own
// camera toward the speaker by implementing scene.dialogueFocus(who, on).
//
// API (unchanged): await say(who, text, opts) ; closeDialogue()
//   who:  { name, color?, portrait? (fallback image), chibi? (in-scene Chibi: talks too),
//           char? (CHARACTERS id), override?, eyes?, mouth?, mood?, voice? (blip pitch) }
//   opts: { choices:[label|{label,cls}], wait:false (returns {close, promise, el}), speed (chars/s),
//           place: 'auto'|'top'|'bottom' }
import './dialogue.css';
import * as THREE from 'three';
import { h, rich, button, hudBands, $overlay } from './ui.js';
import { audio } from '../core/audio.js';
import { engine } from '../core/engine.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS, voiceOf } from '../data/characters.js';
import { Stage3D } from './stage3d.js';
import { ensureSkin } from './skin.js';

let active = null; // { el, done }
let lastClose = 0, lastName = '';
let cam = null; // persistent FaceCam (reused while the same speaker keeps talking)
let camKill = 0;
let focusWho = null, focusKill = 0;

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Live 3D face close-up

const _t = new THREE.Vector3(), _aim = new THREE.Vector3();
class FaceCam {
  constructor(def, key, color) {
    this.key = key;
    this.stage = new Stage3D({ fov: 20, maxPixels: 7e5, rimA: new THREE.Color(color).getHex(), rimB: 0xffffff, rimI: 2.4 });
    const ch = (this.ch = new Chibi(def, { fidget: false }));
    ch.play('idle');
    ch.face.autoLook = true;
    this.stage.add(ch.root);
    this.cur = null;
    this.t = Math.random() * 10;
    this.push = 0; // 0 .. 1 slow push-in
    this.punch = 0; // quick zoom kick (emphasis / "!")
    this.roll = 0;
    this.rollT = 0;
    this.yaw = -0.3;
    this.wide = false;
    this.stage.onUpdate((dt) => this.update(dt));
  }
  setColor(color) { this.stage.rimA?.color.set(color); }
  mount(host, wide) {
    this.wide = wide;
    this.stage.mount(host);
    this.stage.start();
  }
  update(dt) {
    const ch = this.ch;
    this.t += dt;
    // sub-step: the chibi's squash spring is only stable at <= 1/30 s steps (slow frames would blow it up)
    const n = Math.max(1, Math.ceil(dt / (1 / 30)));
    for (let i = 0; i < n; i++) ch.update(dt / n);
    ch.head.updateWorldMatrix(true, false);
    _t.set(0, this.wide ? 0.5 : 0.43, 0.2).applyMatrix4(ch.head.matrixWorld);
    if (!this.cur) this.cur = _t.clone();
    else this.cur.lerp(_t, 1 - Math.exp(-7 * dt));
    this.push = Math.min(1, this.push + dt * 0.16);
    this.punch *= Math.exp(-7 * dt);
    this.roll += (this.rollT - this.roll) * (1 - Math.exp(-5 * dt));
    this.rollT *= Math.exp(-1.5 * dt);
    const ease = 1 - Math.pow(1 - this.push, 2);
    // visible height of the shot (world units): wide window = head + shoulders, strip = extreme close-up
    const visH = (this.wide ? 1.75 - 0.3 * ease : 1.12 - 0.26 * ease) * (1 - this.punch * 0.16);
    const cam = this.stage.camera;
    const dist = visH / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const yaw = this.yaw + Math.sin(this.t * 0.37) * 0.06;
    const pitch = 0.06 + Math.sin(this.t * 0.29) * 0.025;
    // rule of thirds: in the wide strip the face sits right of centre (the name plate owns the left)
    const off = this.wide ? 0 : visH * cam.aspect * 0.13;
    _aim.set(this.cur.x - Math.cos(yaw) * off, this.cur.y, this.cur.z + Math.sin(yaw) * off);
    cam.position.set(_aim.x + Math.sin(yaw) * Math.cos(pitch) * dist, _aim.y + Math.sin(pitch) * dist, _aim.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    const r = -0.05 + this.roll + Math.sin(this.t * 0.5) * 0.012;
    cam.up.set(Math.sin(r), Math.cos(r), 0);
    cam.lookAt(_aim);
  }
  dispose() { this.stage.dispose(); }
}

function charDefOf(who) {
  if (who?.char && CHARACTERS[who.char]) return { def: { ...CHARACTERS[who.char], ...(who.override ?? {}) }, key: who.char + JSON.stringify(who.override ?? null) };
  if (who?.chibi?.def) return { def: who.chibi.def, key: 'ch:' + JSON.stringify(who.chibi.def) };
  const c = Object.values(CHARACTERS).find((d) => d.name === who?.name && d.id !== 'jimmyBoss');
  return c ? { def: c, key: c.id } : null;
}

function faceCamFor(who, color) {
  const cd = charDefOf(who);
  if (!cd) return null;
  clearTimeout(camKill);
  if (cam && cam.key === cd.key) { cam.setColor(color); return cam; }
  cam?.dispose();
  try { cam = new FaceCam(cd.def, cd.key, color); } catch (e) { console.warn('face cam failed', e); cam = null; }
  return cam;
}
function releaseCam() {
  clearTimeout(camKill);
  camKill = setTimeout(() => { cam?.dispose(); cam = null; }, 500);
}

/** Scene camera push toward the speaker (scenes opt in with dialogueFocus(who, on)). */
function sceneFocus(who) {
  clearTimeout(focusKill);
  if (focusWho && focusWho.name === who?.name) return;
  if (focusWho) { try { engine.current?.dialogueFocus?.(focusWho, false); } catch (e) { /* scene gone */ } }
  focusWho = who;
  try { engine.current?.dialogueFocus?.(who, true); } catch (e) { /* optional */ }
}
function releaseFocus() {
  clearTimeout(focusKill);
  focusKill = setTimeout(() => {
    const w = focusWho;
    focusWho = null;
    try { engine.current?.dialogueFocus?.(w, false); } catch (e) { /* optional */ }
  }, 460);
}

// ---------------------------------------------------------------------------
// Words

/** Split rich() HTML into word spans (inline-blocks that pop) + a beat after punctuation. */
function wordSpans(container, html) {
  // punctuation right after an emphasis / accent run joins it (so "*Panther*!" never wraps the "!" alone)
  container.innerHTML = html.replace(/<\/(b|em)>([!?.,;:]+)/g, '$2</$1>');
  const words = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    const frag = document.createDocumentFragment();
    const emph = !!node.parentElement?.closest('b');
    const accent = !!node.parentElement?.closest('em');
    for (const part of node.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
      const w = document.createElement('span');
      w.className = 'w';
      w.textContent = part;
      w.style.setProperty('--r', ((Math.random() - 0.5) * (emph ? 22 : 12)).toFixed(1) + 'deg');
      w.style.setProperty('--d', (Math.random() * 0.5).toFixed(2) + 's');
      frag.appendChild(w);
      const last = part[part.length - 1];
      const beat = /\.\.\.$|…$/.test(part) ? 0.42 : '.!?'.includes(last) ? 0.3 : ',;:'.includes(last) ? 0.13 : last === '-' || part === '-' ? 0.1 : 0;
      words.push({ el: w, text: part, emph, accent, beat, bang: last === '!', ask: last === '?' });
    }
    node.parentNode.replaceChild(frag, node);
  }
  return words;
}

// ---------------------------------------------------------------------------

export function resetDialogue() {
  active = null;
}

/**
 * Show a dialogue line. Resolves when the player taps (after the words are in).
 */
export function say(who, text, opts = {}) {
  const now = performance.now();
  if (active) { active.el.remove(); active = null; }
  for (const old of $overlay().querySelectorAll('.cdlg')) old.remove();
  const name = who?.name ?? '';
  const color = who?.color ?? CHARACTERS[who?.char]?.color ?? '#2b8cf2';
  const blocking = opts.wait !== false;
  const cont = !!name && name === lastName && now - lastClose < 450;
  const W = window.innerWidth, H = window.innerHeight;
  const wide = W > H * 1.1; // landscape: face cam beside the text, portrait: a cinema strip above it

  // face cam: live 3D close-up (fallback: the portrait image with a slow push-in)
  const fc = reduced() ? null : faceCamFor(who, color);
  const host = h('div', { class: 'cdlg-host' });
  const fallback = !fc && who?.portrait ? h('img', { class: 'cdlg-still', src: who.portrait, alt: '', draggable: 'false' }) : null;
  const camEl = (fc || fallback) ? h('div', { class: 'cdlg-cam' },
    h('div', { class: 'cdlg-cam-in' },
      h('i', { class: 'cdlg-glow' }), h('i', { class: 'px-rays w cdlg-rays' }), host, fallback, h('i', { class: 'cdlg-sweep' }), h('i', { class: 'cdlg-grade' })),
    h('i', { class: 'cdlg-mark tl' }), h('i', { class: 'cdlg-mark tr' }), h('i', { class: 'cdlg-mark bl' }), h('i', { class: 'cdlg-mark br' })) : null;

  const textEl = h('div', { class: 'cdlg-txt' });
  // pixel-art frames tinted in the speaker colour (riveted plate panel, jelly name plate + TAP chip)
  let plateSk = '', btnSk = '';
  try { plateSk = ensureSkin('plate', color); btnSk = ensureSkin('btn', color); } catch (e) { /* plain fallback */ }
  const next = h('div', { class: 'cdlg-next ' + btnSk }, h('span', {}, 'TAP'), h('i'));
  const nameEl = name ? h('div', { class: 'cdlg-name ' + btnSk }, h('span', {}, name)) : null;
  const box = h('div', { class: 'cdlg-box ' + plateSk }, nameEl, textEl, next);
  const panel = h('div', { class: 'cdlg-panel' }, camEl, box);
  const dlg = h('div', { class: `dialogue cdlg ${wide ? 'wide' : 'tall'} ${camEl ? 'has-cam' : ''} ${cont ? 'cont' : ''} ${blocking ? '' : 'passive'}`, style: { '--spk': color } },
    blocking ? h('div', { class: 'cdlg-catch' }) : null,
    blocking ? h('i', { class: 'cdlg-bar t' }) : null, blocking ? h('i', { class: 'cdlg-bar b' }) : null,
    panel);

  // placement: above the bottom HUD, or below the top HUD when the bottom one is tall (battle hand)
  const bands = hudBands();
  let place = opts.place ?? 'auto';
  if (place === 'auto') place = bands.bottom > bands.H * 0.15 ? 'top' : 'bottom';
  dlg.classList.add('at-' + place);
  if (place === 'top') panel.style.top = `calc(var(--safe-t) + ${Math.round(bands.top + 8)}px + var(--u) * 2)`;
  else panel.style.bottom = `calc(var(--safe-b) + ${Math.round(bands.bottom + 6)}px + var(--u) * 2)`;

  $overlay().appendChild(dlg);
  active = { el: dlg };
  lastName = name;
  if (fc) fc.mount(host, wide);
  if (blocking) sceneFocus(who);

  // expression: explicit eyes / mouth / mood, else a friendly default
  const ch = fc?.ch;
  if (ch) {
    if (who.mood) ch.mood(who.mood);
    else ch.expr(who.eyes ?? 'happy', who.mouth ?? 'grin');
    if (!cont) { ch.boing(0.35); fc.push = 0; fc.punch = 0.6; }
    else fc.push = Math.min(fc.push, 0.55);
  }
  const sceneCh = who?.chibi;
  const talk = (on) => {
    if (ch) ch.talk(on);
    if (sceneCh) sceneCh.talk(on);
  };
  if (!cont && blocking) audio.play('whoosh', { pitch: 1.6, gap: 0.2, vol: 0.5 });

  const words = wordSpans(textEl, rich(text));
  let shown = 0;
  let typing = true;
  let finished = false;
  const cps = opts.speed ?? 52; // characters per second (words pop at the same reading pace)
  const voice = who?.voice ?? 1;
  const v8 = voiceOf(charDefOf(who)?.def ?? who);
  let clock = cont ? -0.08 : -0.32; // beat before the first word (the panel lands first)
  let talkUntil = 0, tNow = 0;
  let raf = 0, lastTick = performance.now();
  const popWord = (wd) => {
    wd.el.classList.add('on');
    const len = wd.text.replace(/[^A-Za-z0-9]/g, '').length;
    if (len) {
      talk(true);
      talkUntil = tNow + Math.min(0.42, 0.05 + len * 0.045);
      // 8-bit voice: one chiptune syllable per ~3 letters, pitched per character
      const vp = { ...v8, base: v8.base * voice };
      audio.voice(vp, { syll: Math.min(3, Math.ceil(len / 3)), emph: wd.emph, ask: /\?/.test(wd.text) });
    }
    if (wd.emph) {
      audio.play('pop', { pitch: 1.25 + Math.random() * 0.2, gap: 0.08, vol: 0.55 });
      if (fc) { fc.punch = Math.max(fc.punch, 0.55); ch.boing(0.16); }
      if (ch && ch.face.eyes !== 'star' && Math.random() < 0.5) ch.face.set('wide', null, 0.45);
    }
    if (wd.bang) {
      bumpPanel(panel);
      if (fc) { fc.punch = Math.max(fc.punch, 0.8); ch.boing(0.28); fc.rollT = (Math.random() < 0.5 ? -1 : 1) * 0.05; }
    } else if (wd.ask && fc) {
      fc.rollT = 0.07;
      ch.look(1.2, -0.6, 0.8);
    }
  };
  const tick = (t) => {
    const dt = Math.max(0, Math.min(0.1, (t - lastTick) / 1000));
    lastTick = t;
    tNow += dt;
    clock += dt;
    while (shown < words.length) {
      const wd = words[shown];
      const cost = Math.max(0.07, (wd.text.length + 1) / cps);
      if (clock < cost) break;
      clock -= cost;
      popWord(wd);
      shown++;
      if (wd.beat && shown < words.length) { clock -= wd.beat; talkUntil = Math.min(talkUntil, tNow + 0.12); }
    }
    if (tNow > talkUntil) talk(false);
    if (shown >= words.length) finishTyping();
    else raf = requestAnimationFrame(tick);
  };
  const finishTyping = () => {
    if (!typing) return;
    typing = false;
    cancelAnimationFrame(raf);
    for (const wd of words) if (!wd.el.classList.contains('on')) wd.el.classList.add('on', 'now');
    setTimeout(() => !finished && talk(false), 140);
    if (opts.choices) {
      const chs = h('div', { class: 'cdlg-choices' });
      opts.choices.forEach((c, i) => {
        const lbl = typeof c === 'string' ? c : c.label;
        chs.appendChild(button(lbl, () => done(i), (typeof c === 'object' && c.cls) || (i === 0 ? 'pink sm' : 'blue sm')));
      });
      box.appendChild(chs);
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
    talk(false);
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKey, true);
    dlg.classList.add('closing');
    lastClose = performance.now();
    if (active?.el === dlg) active = null;
    releaseCam();
    if (blocking) releaseFocus();
    // keep the tap catcher alive for a moment so the release doesn't click whatever is underneath
    setTimeout(() => dlg.remove(), 200);
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
    if (e.target instanceof Element && e.target.closest('.cdlg-choices')) return;
    advance();
  });
  if (blocking) window.addEventListener('keydown', onKey, true);
  // the dialogue was removed from outside (scene change / clearUI): stop talking
  const watch = setInterval(() => {
    if (dlg.isConnected) return;
    clearInterval(watch);
    if (!finished) { finished = true; talk(false); cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey, true); releaseCam(); if (blocking) releaseFocus(); }
  }, 300);
  if (!blocking) return { close: () => done(), promise, el: dlg };
  return promise;
}

function bumpPanel(el) {
  el.classList.remove('kick');
  void el.offsetWidth;
  el.classList.add('kick');
}

export function closeDialogue() {
  if (active) { active.el.remove(); active = null; }
  for (const old of $overlay()?.querySelectorAll('.cdlg') ?? []) old.remove();
}

/**
 * Pop `text` (rich markup) into `el` word by word with the dialogue's word animation
 * (el gets the cdlg-txt styling). Returns { promise, finish() }; o: { cps, delay, onWord(word) }.
 */
export function popWords(el, text, o = {}) {
  el.classList.add('cdlg-txt');
  const words = wordSpans(el, rich(text));
  let i = 0, over = false, timer = 0, resolve;
  const promise = new Promise((r) => (resolve = r));
  const end = () => { if (!over) { over = true; resolve(); } };
  const step = () => {
    if (over) return;
    if (i >= words.length) { end(); return; }
    const wd = words[i++];
    wd.el.classList.add('on');
    o.onWord?.(wd);
    timer = setTimeout(step, Math.max(70, ((wd.text.length + 1) / (o.cps ?? 40)) * 1000) + wd.beat * 1000);
  };
  timer = setTimeout(step, o.delay ?? 0);
  return {
    promise,
    finish() {
      clearTimeout(timer);
      for (const w of words) if (!w.el.classList.contains('on')) w.el.classList.add('on', 'now');
      end();
    },
  };
}
