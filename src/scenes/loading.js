// Loading screen shown while a heavy scene builds (entering a battle, Beast
// Island, the Lab). It is a movie title card over the frozen cinematic battle:
// stills of the title screen's frozen fight (captured by title.js) drift in a
// slow Ken Burns camera move and crossfade, under letterbox bars, grain, light
// leaks and anamorphic streaks, with the logo, where you're headed, a fizzing
// lab-tube loading bar and a gameplay tip. With no stills yet (a dev deep
// link), a painted "clash in the dark" backdrop stands in.
//
// Every moving part is a CSS transform / opacity animation, so the screen
// keeps moving on the compositor while the scene build blocks the main thread.
import './cinematic.css';
import { h, icon } from '../ui/ui.js';
import { arenaById, currentArena } from '../data/arenas.js';
import { state } from '../game/state.js';

const TIPS = [
  'Tanks in front, shooters behind: let your big Swarms soak the hits.',
  'Cards cost *POWER*. Keep a little in the tank for a counter-push!',
  'Upgrade your *BASE* in battle: more HP, a stronger zapper and faster POWER.',
  '*SPECIAL* cards are tricks: draw, discard, echo, copy. Timing is everything.',
  'Your *MEGA* can be unleashed once per battle from a Trailer Lab base or better.',
  'Win battles for *trophies* and *vials*. New arenas unlock new cards.',
  'Tap the people on *Beast Island*: some of them have quests for you.',
  'Every arena on Beast Island hides a *secret*. Look for the sparkles!',
  'Duplicate cards level up your Swarms in the *CARDS* tab.',
  'You hold 4 cards plus *NEXT*. Plan your cycle a play ahead!',
  'Spells can flip a lost lane: a *Money Drop* or *Soda Rocket* at the right moment wins fights.',
  'Boss gates open on the island once you have enough trophies.',
  'Your base zaps anything that gets close. Fight near it when you are behind.',
  'A free vial refills every 4 hours. Pop by the lobby to grab it!',
];

let stills = []; // object URLs of frozen-battle frames (newest last)
/** title.js hands over the frames it captured from the live frozen battle. */
export function setLoadingStills(urls) {
  const next = urls.filter(Boolean).slice(-4);
  for (const u of stills) if (!next.includes(u)) setTimeout(() => URL.revokeObjectURL(u), 20000);
  stills = next;
}
export function hasLoadingStills() {
  return stills.length > 0;
}

const rich = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<b class="hl">$1</b>');

/** Painted backdrop: two team glows clashing in a dark lab, a slow flare and drifting sparks. */
export function cineBackdrop() {
  const sparks = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + Math.random() * 0.3;
    const d = 18 + Math.random() * 26;
    sparks.push(h('i', { class: 'sp', style: {
      '--x': `${48 + Math.random() * 4}%`, '--y': `${52 + Math.random() * 4}%`, '--tx': `${Math.cos(a) * d}vmin`, '--ty': `${Math.sin(a) * d * 0.6 - 6}vmin`,
      '--d': `${2.2 + Math.random() * 2.4}s`, '--dl': `${-Math.random() * 4}s`,
    } }));
  }
  return h('div', { class: 'cn-back' }, h('i', { class: 'fl' }), sparks);
}
/** Film dressing shared with the title: vignette, grain, light leak, streaks, letterbox. */
export function cineDressing() {
  return [
    h('i', { class: 'cn-vig' }), h('i', { class: 'cn-leak' }), h('i', { class: 'cn-streak s1' }), h('i', { class: 'cn-streak s2' }), h('i', { class: 'cn-grain' }),
    h('i', { class: 'cn-bar top' }), h('i', { class: 'cn-bar bot' }),
  ];
}
/** The game logo (layered pixel lettering + bolt + tag); `reveal` plays the title-sequence assembly. */
export function cineLogo(o = {}) {
  const name = 'SWARMERS';
  return h('div', { class: `cn-logo ${o.reveal ? 'reveal' : ''} ${o.small ? 'sm' : ''}` },
    h('span', { class: 'l1' }, 'MrBeast'),
    h('span', { class: 'l2' }, [...name].map((ch, i) => h('span', { style: { '--i': i } }, ch))),
    h('img', { class: 'bolt', src: boltURL(), alt: '', draggable: 'false' }),
    o.tag === false ? null : h('div', { class: 'tag' }, 'BEAST ISLAND'),
    h('i', { class: 'sweep' }));
}
let _bolt = null;
function boltURL() {
  if (!_bolt) { try { _bolt = icon('logoBolt').src; } catch (e) { _bolt = ''; } }
  return _bolt;
}

function destination(name, params) {
  if (name === 'battle') {
    const mode = params.mode ?? 'ranked';
    const A = arenaById(params.arena) ?? currentArena(state.p?.trophies ?? 0);
    const k = mode === 'boss' ? 'BOSS FIGHT' : mode === 'practice' ? 'TRAINING' : mode === 'friend' ? 'FRIEND BATTLE' : mode === 'tutorial' ? 'FIRST BATTLE' : 'ENTERING BATTLE';
    return { k, n: (A?.name ?? 'The Arena').toUpperCase(), ac: A?.color ?? '#ffd23f' };
  }
  if (name === 'home') return { k: 'NEXT STOP', n: 'BEAST ISLAND', ac: '#7cff6a' };
  if (name === 'lab') return { k: 'HEADING INTO', n: 'THE BEAST LAB', ac: '#9ff2ff' };
  return { k: 'LOADING', n: '', ac: '#9ff2ff' };
}

/**
 * Show the loading screen for a scene change. Returns { done() } — call done()
 * once the scene is built: the bar fills, two frames render underneath, then
 * the card fades away. done() resolves just after the fade starts.
 */
export function showLoading(name, params = {}) {
  const app = document.getElementById('app');
  const dst = destination(name, params);
  const el = h('div', { class: `ld ${stills.length ? 'has-stills' : ''}`, style: { '--ac': dst.ac } });
  // stills: a different slow move for each, crossfading; the first one is up instantly
  const layer = h('div', { class: 'ld-stills' });
  if (stills.length) {
    const order = [...stills].sort(() => Math.random() - 0.5);
    const dur = 7.5;
    order.forEach((src, i) => {
      const s0 = 1.14 + Math.random() * 0.06, s1 = 1.02 + Math.random() * 0.04;
      const dir = Math.random() < 0.5 ? -1 : 1;
      const img = h('img', { class: `ld-still ${i === 0 ? 'first' : ''}`, src, alt: '', draggable: 'false', style: {
        '--s0': s0.toFixed(3), '--s1': s1.toFixed(3), '--x0': `${dir * 3.2}%`, '--x1': `${-dir * 3.2}%`, '--y0': `${(Math.random() - 0.5) * 2}%`, '--y1': `${(Math.random() - 0.5) * 2}%`,
        '--ox': `${30 + Math.random() * 40}%`, '--oy': `${40 + Math.random() * 20}%`, '--dur': dur + 's',
      } });
      layer.appendChild(img);
      // chain: each still starts as the previous one begins to fade
      setTimeout(() => img.classList.add('on'), i * (dur - 1) * 1000);
    });
  }
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  el.append(
    cineBackdrop(),
    layer,
    h('div', { class: 'cn-layer' }, cineDressing()),
    h('div', { class: 'ld-mid' },
      cineLogo({ small: true, tag: false }),
      h('div', { class: 'ld-foot' },
        h('div', { class: 'ld-dest' }, h('span', { class: 'k' }, dst.k), dst.n ? h('span', { class: 'n' }, dst.n) : null),
        h('div', { class: 'ld-bar' }, h('i')),
        h('div', { class: 'ld-tip' }, h('b', {}, 'TIP'), h('span', { html: rich(tip) })))),
  );
  app.appendChild(el);
  // fade up, then start the bar's long ease toward 90%
  void el.offsetWidth;
  el.classList.add('in');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('run')));
  let finished = false;
  return {
    el,
    done() {
      if (finished) return Promise.resolve();
      finished = true;
      el.classList.add('done');
      return new Promise((res) => {
        // let the new scene render (and compile) a couple of frames under the card first
        let n = 0;
        const step = () => {
          if (++n < 3) { requestAnimationFrame(step); return; }
          setTimeout(() => {
            el.classList.add('out');
            setTimeout(res, 140);
            setTimeout(() => el.remove(), 520);
          }, 160);
        };
        requestAnimationFrame(step);
      });
    },
  };
}
