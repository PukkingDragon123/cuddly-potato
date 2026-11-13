// Loading screen shown while a heavy scene builds (entering a battle, Beast
// Island, the Lab). Deliberately calm: the game logo, where you are headed, a
// glass lab tube filling with goo and one tip at a time in big type, over a dark
// lab backdrop tinted with the destination's colour.
//
// Every moving part is a CSS transform / opacity animation started up front, so
// it keeps moving on the compositor while the scene build blocks the main
// thread. When the scene is ready, done() tops the tube up and fades the screen
// out over the new scene.
//
// The cineBackdrop / cineDressing / cineLogo helpers are shared with the title.
import './cinematic.css';
import { h } from '../ui/ui.js';
import { tx } from '../ui/transitions.js';
import { bigText } from '../ui/bigType.js';
import { logoImg } from './titleLogo3d.js';
import { arenaById, currentArena } from '../data/arenas.js';
import { state } from '../game/state.js';
import * as Art from './labLoadArt.js';

const TIPS = [
  'Tanks in front, shooters behind. Let your big Swarms soak the hits.',
  'Cards cost *POWER*. Keep a little in the tank for a counter-push.',
  'Upgrade your *BASE* in battle for more HP, a stronger zapper and faster POWER.',
  'Drop *Rage Potion* on a brawl and *Time Warp* on a big push.',
  'Your *MEGA* works once per battle, once your base is a Trailer Lab or better.',
  'Your Commander *ULTIMATE* charges from the POWER you make and the hits your base takes.',
  "Save Jimmy's *Beast Buyout* for a big push. He buys the 3 strongest enemy troops.",
  'Win battles for *trophies* and *vials*. New arenas unlock new cards.',
  'Tap the people on *Beast Island*. Some of them have quests for you.',
  'Every arena on Beast Island hides a *secret*. Keep your eyes open.',
  'Duplicate cards level up your Swarms in the *CARDS* tab.',
  'You hold 4 cards plus the *NEXT* one. Plan your cycle a play ahead.',
  'A *$100K Drop* or *Soda Rocket* on a crowd can save a lost lane.',
  'Boss gates on the island open once you have enough trophies.',
  'Your base zaps anything that gets close. Fight near it when you are behind.',
  'A free vial refills every 4 hours. Grab it in the *SHOP*.',
];
const TIP_SHOW = 3; // tips per screen, shown one after another

const rich = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\*(.+?)\*/g, '<b class="hl">$1</b>');

/** Title backdrop before the 3D arrives: a dark lab with two team glows and a floor grid. */
export function cineBackdrop() {
  return h('div', { class: 'cn-back' });
}
/** Film dressing shared with the title: vignette and letterbox bars. */
export function cineDressing() {
  return [h('i', { class: 'cn-vig' }), h('i', { class: 'cn-bar top' }), h('i', { class: 'cn-bar bot' })];
}
/** The game name is always the 3D voxel sign (a still of it); the flat lettering only if WebGL is out. */
function gameLogo() {
  let im = null;
  try { im = logoImg('ld-logo3d'); } catch (e) { im = null; }
  return im?.src ? im : cineLogo({ small: true, tag: false });
}
/** Flat fallback logo (Swarm Arcade lettering + tag), used only where the 3D sign cannot render. */
export function cineLogo(o = {}) {
  const rv = !!o.reveal;
  // Swarm Block lettering (ui/bigType.js): on the title the letters slam in one by one, kick up dust and catch a shine
  const l1 = bigText('MRBEAST', { theme: 'pink', drop: rv ? 'stamp' : 'none', delay: 0.15 });
  const l2 = bigText('SWARMERS', { theme: 'gold', drop: rv ? 'stamp' : 'none', delay: 0.6 });
  return h('div', { class: `cn-logo ${rv ? 'reveal' : ''} ${o.small ? 'sm' : ''}` },
    h('div', { class: 'l1' }, l1),
    h('div', { class: 'l2' }, l2),
    o.tag === false ? null : h('div', { class: 'tag' }, 'BEAST ISLAND'));
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

/** A few different tips, starting from a random one. */
function pickTips(n) {
  const a = Math.floor(Math.random() * TIPS.length);
  const step = 1 + Math.floor(Math.random() * 4);
  return Array.from({ length: n }, (_, i) => TIPS[(a + i * step * 3) % TIPS.length]);
}

/** The goo tube: back glass, goo revealed from the left by a sliding clip, bright edge, front glints. */
function gooTube() {
  const A = Art.tubeArt();
  const lp = (n) => `calc(var(--lp) * ${n})`;
  const cv = (src, cls, w = src.width, hh = src.height) => {
    const c = Art.copyOf(src);
    c.className = cls;
    c.style.width = lp(w); c.style.height = lp(hh);
    return c;
  };
  const inner = h('div', { class: 'ld-goo-in' }, cv(A.goo, 'ld-goo'));
  // a few bubbles drifting up through the goo
  for (let i = 0; i < 7; i++) {
    const b = cv(A.bubble, 'ld-bub');
    b.style.left = lp(6 + ((i * 37) % 88) + (i % 2) * 3);
    b.style.setProperty('--d', `${1.4 + (i % 3) * 0.35}s`);
    b.style.setProperty('--dl', `${-(i * 0.43).toFixed(2)}s`);
    inner.appendChild(b);
  }
  const clip = h('div', { class: 'ld-goo-clip' }, inner, cv(A.edge, 'ld-edge'));
  const tube = h('div', { class: 'ld-tube', role: 'progressbar', 'aria-label': 'Loading' },
    cv(A.back, 'ld-back'), h('div', { class: 'ld-win' }, clip), cv(A.front, 'ld-front'));
  return { tube, clip, inner };
}

/**
 * Show the loading screen for a scene change. Returns { done() }: call done()
 * once the scene is built; it tops the tube up, then fades onto the new scene.
 * done() resolves as the fade starts. done(kind) hands off with a pixel
 * transition (ui/transitions.js) instead, resolving as it starts to uncover.
 */
export function showLoading(name, params = {}) {
  const app = document.getElementById('app');
  const dst = destination(name, params);
  const bar = gooTube();
  const tips = pickTips(TIP_SHOW);
  // whole art pixels: 3 on phones, up to 4 on big screens (2 on tiny ones)
  const land = window.innerWidth > window.innerHeight;
  const lp = Math.max(2, Math.min(land ? 3 : 4, Math.floor((Math.min(window.innerWidth, 620) - 48) / Art.TW)));
  const el = h('div', { class: 'ld', style: { '--ac': dst.ac, '--lp': lp + 'px' } },
    h('div', { class: 'ld-bg' }),
    h('div', { class: 'ld-col' },
      h('div', { class: 'ld-logo' }, gameLogo()),
      h('div', { class: 'ld-dest' }, h('span', { class: 'k' }, dst.k), dst.n ? h('span', { class: 'n' }, dst.n) : null),
      bar.tube,
      h('div', { class: 'ld-tips', style: { '--n': tips.length } },
        ...tips.map((t, i) => h('p', { class: 'ld-tip', style: { '--i': i } }, h('b', {}, 'TIP'), h('span', { html: rich(t) }))))));
  app.appendChild(el);
  // coming from the title's wipe (same navy), the screen is simply there; otherwise it fades in
  if (params.cover) el.classList.add('now');
  void el.offsetWidth;
  el.classList.add('in');

  let finished = false;
  return {
    el,
    done(outTx) {
      if (finished) return Promise.resolve();
      finished = true;
      return new Promise((res) => {
        // let the new scene render (and compile) a couple of frames under the screen first
        let n = 0;
        const step = () => {
          if (++n < 3) { requestAnimationFrame(step); return; }
          // freeze the fill where it is, then top it up
          const x = new DOMMatrixReadOnly(getComputedStyle(bar.clip).transform).m41;
          for (const [node, k] of [[bar.clip, 1], [bar.inner, -1]]) {
            node.style.animation = 'none';
            node.style.transform = `translateX(${(x * k).toFixed(1)}px)`;
          }
          void bar.clip.offsetWidth;
          el.classList.add('fin');
          bar.clip.style.transform = bar.inner.style.transform = 'none';
          setTimeout(() => {
            if (outTx) {
              // a pixel transition covers the screen, takes it away and uncovers the new scene
              tx.cover(outTx).then(() => { el.remove(); tx.reveal(outTx); res(); });
              return;
            }
            el.classList.add('out');
            setTimeout(res, 60);
            setTimeout(() => el.remove(), 400);
          }, 230);
        };
        requestAnimationFrame(step);
      });
    },
  };
}

/** Draw the tube art while the main thread is idle, so the next loading screen has it at once. */
export function prewarmLoading() {
  const run = () => { try { Art.tubeArt(); } catch (e) { /* ignore */ } };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 1500);
}
