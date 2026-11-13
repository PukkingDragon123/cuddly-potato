// BEAST NEWS: the battle report, played as a TV broadcast after the arena cinematics
// (baseFall.js explosion, endCine.js VICTORY / DEFEAT).
//
// showResult(parent, opts) resolves with the id of the button pressed.
//   0. the feed changes channel (pixel TV static), BEAST NEWS sting
//   1. INTRO     the studio (newsStudio.js: Nora Newsly at her desk, video wall, drawn by the
//                main renderer as a backdrop) cuts from wide to mid; the lower third slides in
//                and its headline types out while Nora says her first line (voiced, speech bubble)
//   2. REPLAY    a picture-in-picture box fills the screen and plays the snapshots taken during
//                the final blow / explosion / victory (view.replay), then docks over Nora's shoulder
//   3. RESULT    base HP bars drain with DESTROYED / FLAWLESS stamps (avatars, rank medals)
//   4. NUMBERS   battle time, troops deployed, damage, KOs tick up one by one; the MVP card flips in
//   5. PAYOUT    trophies, coins, vial, calories, XP drop in with weight; level ups, Lab Level
//                medal, mastery lines
//   6. SIGN OFF  the buttons
// A tap skips the segment that is playing (the next one still plays); a scrolling ticker runs
// along the bottom the whole time.
//
// opts: { result: 'win'|'loss'|'draw', bases: [{ frac, alive, tier }] x2 (mine, theirs), names: [mine, theirs],
//         rewards (battleRewards result | null), mode, buttons: [{ id, label, color, icon }], vialThumb?,
//         summary? (else read from the battle scene: scene.battleSummary()), replay? (else the view's) }
import './result.css';
import { h, icon, animIcon, button, rollNumber, sparkle, burst, bump } from '../../ui/ui.js';
import { popWords } from '../../ui/dialogue.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { voiceOf } from '../../data/characters.js';
import { VIALS } from '../../data/vials.js';
import { cardDef } from '../../data/cards.js';
import { cardArtImg } from '../../ui/thumbs.js';
import { rankMedal, setRankMedal } from '../../ui/rankMedal.js';
import { sideAvatarEl } from '../../ui/avatar.js';
import { MASTERY_NAMES } from '../../data/mastery.js';
import { createNewsStudio } from './newsStudio.js';
import { injectNewsArt } from './newsArt.js';
import { tx } from '../../ui/transitions.js';

const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const fmtBig = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e5 ? Math.round(n / 1e3) + 'K' : fmtN(n));
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const pick = (a) => a[(Math.random() * a.length) | 0];
const slowK = () => (import.meta.env.DEV && typeof window !== 'undefined' && window.__fxSlow) || 1;

function sfx(fn) {
  if (!audio.ctx || audio.muted) return;
  try { fn(audio); } catch (e) { /* optional */ }
}
const SND = {
  // "da-da-da DUM" news sting
  news: () => sfx((a) => {
    const n = [392, 392, 523.3, 784];
    n.forEach((f, i) => {
      const d = i * 0.11 + (i === 3 ? 0.08 : 0);
      a.tone({ type: 'sawtooth', f0: f, dur: i === 3 ? 0.7 : 0.1, vol: 0.05, lp: 2600, hold: i === 3 ? 0.25 : 0.02, delay: d });
      a.tone({ type: 'square', f0: f / 2, dur: i === 3 ? 0.6 : 0.09, vol: 0.03, lp: 1400, delay: d });
    });
    a.thump(140, 45, 0.3, 0.35, 0.41);
    a.noise({ dur: 0.5, vol: 0.06, type: 'highpass', f0: 5000, attack: 0.002, delay: 0.41 });
  }),
  swoosh: () => sfx((a) => a.noise({ dur: 0.35, vol: 0.18, type: 'bandpass', f0: 300, f1: 3400, q: 1.1, attack: 0.12 })),
  static: () => sfx((a) => a.noise({ dur: 0.36, vol: 0.08, type: 'highpass', f0: 2400, attack: 0.005 })),
  tickRoll: (p = 1) => audio.play('countTick', { pitch: p, gap: 0.04 }),
};
// recorded versions (src/core/audio.js) win; the procedural voices above are the fallback
for (const [k, id] of Object.entries({ news: 'news', swoosh: 'whoosh' })) { const f = SND[k]; SND[k] = (...a) => (audio.ctx && !audio.muted && audio.play(id)) || f(...a); }

/** A segment clock: wait(ms) resolves early once skip() is called. */
function clock() {
  let skipping = false;
  const pending = new Set();
  return {
    get skipping() { return skipping; },
    wait(ms) {
      if (skipping) return Promise.resolve();
      return new Promise((r) => {
        const e = { r, id: setTimeout(() => { pending.delete(e); r(); }, ms * slowK()) };
        pending.add(e);
      });
    },
    skip() {
      skipping = true;
      for (const e of pending) { clearTimeout(e.id); e.r(); }
      pending.clear();
    },
  };
}

/** A little pixel-art "recording" light (7x7 sprite with a highlight, no CSS circles). */
let _dot = null;
function recDot(cls = '') {
  if (!_dot) {
    const rows = ['..kkk..', '.krrrk.', 'krwrrrk', 'krrrrdk', 'krrrrdk', '.krddk.', '..kkk..'];
    const pal = { k: '#3a0610', r: '#ff3a52', w: '#ffd0d8', d: '#c8102e' };
    const c = document.createElement('canvas');
    c.width = c.height = 7;
    const g = c.getContext('2d');
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
    _dot = c.toDataURL();
  }
  return h('img', { class: 'recdot ' + cls, src: _dot, alt: '', draggable: 'false' });
}

/** Pixel TV static (chunky grey noise + a rolling dark band), redrawn every frame while it runs. */
function staticCanvas() {
  const W = 96, H = Math.max(40, Math.round(96 * (window.innerHeight / Math.max(1, window.innerWidth))));
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  cv.className = 'cn-static';
  const g = cv.getContext('2d');
  const img = g.createImageData(W, H);
  const draw = (t) => {
    const band = ((t * 1.8) % 1) * H;
    for (let y = 0; y < H; y++) {
      const dark = Math.abs(y - band) < H * 0.08 ? 0.45 : 1;
      for (let x = 0; x < W; x++) {
        const v = (Math.random() * 4 | 0) * 70 * dark;
        const i = (y * W + x) * 4;
        img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 12; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };
  draw(0);
  return {
    cv,
    run(ms) {
      const t0 = performance.now();
      const step = (now) => {
        if (!cv.isConnected) return;
        draw((now - t0) / 1000);
        if (now - t0 < ms) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    },
  };
}

// ---------------------------------------------------------------------------
// Nora's lines (short, said out loud, shown in her speech bubble)

function noraLines({ result, names, smashed, fell, mvpName, tr, mode }) {
  const [me, riv] = names;
  const win = result === 'win', loss = result === 'loss';
  const intro = win
    ? (smashed ? pick([`${riv} no longer has a base.`, `${riv}'s base is now gravel.`, `${me} just flattened a base.`]) : pick([`${me} wins it on base HP.`, `Close one. ${me} holds on.`]))
    : loss
      ? (fell ? pick([`Ouch. ${me}'s base is a crater.`, `${me}'s base did not make it.`]) : pick([`${riv} edges it on base HP.`, `So close for ${me}.`]))
      : pick(['A draw. Both bases still standing.', 'Nobody blinked. A draw.']);
  return {
    intro,
    replay: pick(['Roll the tape.', "Let's see that again. Slower.", 'Here it is again.']),
    numbers: mvpName ? pick([`${mvpName} did the heavy lifting.`, `MVP tonight: ${mvpName}.`]) : 'The numbers are in.',
    payout: mode === 'tutorial' ? 'Jimmy wants a rematch.' : win ? (tr > 0 ? 'And here is the prize money.' : 'Here is what that earned.') : loss ? 'Here is the damage report.' : 'Here is the payout.',
    signoff: pick(['Back to you, Jimmy.', "I'm Nora Newsly. Good night.", 'More smashing after the break.']),
  };
}

// ---------------------------------------------------------------------------

export async function showResult(parent, opts) {
  const { result } = opts;
  const names = opts.names ?? ['You', 'Rival'];
  const bases = opts.bases ?? [{ frac: 1, alive: true, tier: 0 }, { frac: 1, alive: true, tier: 0 }];
  const r = opts.rewards;
  let sum = opts.summary;
  if (sum === undefined) { try { sum = engine.current?.battleSummary?.() ?? null; } catch (e) { sum = null; } }
  let replay = opts.replay;
  if (replay === undefined) { try { replay = engine.current?.view?.replay ?? null; } catch (e) { replay = null; } }
  const portrait = () => window.innerHeight > window.innerWidth;

  // the arena feed switches off like an old TV (ui/transitions.js) before the static and the studio
  await tx.cover('tv');
  injectNewsArt();
  const root = h('div', { class: `cres r-${result} ${portrait() ? 'portrait' : 'landscape'}` });
  parent.appendChild(root);
  document.body.classList.add('news-on');
  let alive = true;

  // ======================= the studio (3D, main renderer) =======================
  const arenaName = sum?.arena?.name ?? 'Beast Island';
  let studio = null;
  try {
    studio = createNewsStudio({
      result, arena: arenaName,
      // where Nora sits on screen (the report's layout leaves her this area)
      layout: () => (portrait() ? { sx: 0.25, sy: 0.215, h: 0.2 } : { sx: 0.13, sy: 0.42, h: 0.38 }),
    });
    engine.cover('news', true);
    engine.setBackdrop({ scene: studio.scene, camera: studio.camera, update: (dt) => studio.update(dt), bloom: studio.bloom, grade: studio.grade, owner: studio });
    engine.precompile(studio.scene, studio.camera);
  } catch (e) { console.error('news studio failed', e); studio = null; root.classList.add('no3d'); }
  const anchor = studio?.anchor ?? null;
  const end = () => {
    if (!alive) return;
    alive = false;
    if (studio) {
      if (engine.backdrop?.owner === studio) engine.setBackdrop(null);
      studio.dispose();
    }
    engine.cover('news', false);
    document.body.classList.remove('news-on');
  };

  // ======================= 0. static + BEAST NEWS sting =======================
  const stat = staticCanvas();
  root.appendChild(stat.cv);
  stat.run(380);
  tx.clear();
  SND.static();
  await new Promise((res) => setTimeout(res, 340 * slowK()));
  // red / white / navy bands wipe across, the BEAST NEWS plates slam in on top
  const sting = h('div', { class: 'cres-sting' },
    h('i', { class: 'cs-band a' }), h('i', { class: 'cs-band b' }), h('i', { class: 'cs-band c' }),
    h('div', { class: 'cs-txt' }, h('b', { class: 'nx-s-red' }, 'BEAST'), h('span', { class: 'nx-s-white' }, 'NEWS')));
  root.appendChild(sting);
  SND.swoosh();
  SND.news();
  await new Promise((res) => setTimeout(res, 420 * slowK()));
  stat.cv.remove();
  tx.play('roll'); // the picture rolls into place as the channel lands
  if (!root.isConnected) { end(); return 'ok'; }

  // ======================= the broadcast =======================
  const smashed = !bases[1].alive, fell = !bases[0].alive;
  const mvp = sum?.mvp;
  const mvpDef = mvp ? cardDef(mvp.id) : null;
  const lines = noraLines({ result, names, smashed, fell, mvpName: mvpDef?.name, tr: r?.trophies ?? 0, mode: opts.mode });
  const news = buildNews({ result, names, bases, r, sum, opts, replay, smashed, fell, mvp, mvpDef });
  root.appendChild(news.el);
  setTimeout(() => sting.remove(), 700 * slowK());
  studio?.shot('wide');

  // Nora talks: voiced line + speech bubble that follows her head
  const v8 = voiceOf('anchor');
  let talkT = 0;
  const say = (txt) => {
    if (!txt) return 0;
    news.sayTxt.textContent = txt;
    news.say.classList.remove('on');
    void news.say.offsetWidth;
    news.say.classList.add('on');
    const span = Math.max(0.9, txt.split(/\s+/).length * 0.27);
    audio.babble(v8, txt, span);
    anchor?.talk(true);
    clearTimeout(talkT);
    talkT = setTimeout(() => anchor?.talk(false), span * 1000 * slowK());
    return span;
  };
  const hush = () => { clearTimeout(talkT); anchor?.talk(false); };
  // per frame: bubble + PIP playback
  const tick = () => {
    if (!alive || !root.isConnected) return;
    const port = portrait();
    if (root.classList.contains('portrait') !== port) { root.classList.toggle('portrait', port); root.classList.toggle('landscape', !port); }
    news.placeSay(studio);
    news.pip.tick();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // taps skip the segment that is playing
  let seg = null;
  const onTap = (ev) => {
    if (ev.target.closest?.('.cres-foot')) return;
    seg?.skip();
  };
  root.addEventListener('pointerdown', onTap);

  const run = async (fn) => {
    if (!root.isConnected) return;
    seg = clock();
    try { await fn(seg); } catch (e) { console.warn('news segment', e); }
    seg = null;
  };

  // 1. INTRO
  await run(async (c) => {
    await c.wait(250);
    studio?.shot('mid', 3);
    news.lower.classList.add('in');
    anchor?.play('talk');
    anchor?.expr('happy', 'grin');
    const span = say(lines.intro);
    await c.wait(260);
    const hl = popWords(news.headline, news.headlineText, {
      cps: 30,
      onWord: (wd) => {
        audio.play('blip', { pitch: wd.emph ? 1.15 : 1.3 + Math.random() * 0.15, gap: 0.05, vol: 0.7 });
        if (wd.emph) anchor?.boing(0.12);
      },
    });
    const off = () => hl.finish();
    if (c.skipping) off();
    const skipNow = c.skip;
    c.skip = () => { off(); skipNow(); };
    await Promise.all([hl.promise, c.wait(Math.max(1500, span * 1000))]);
  });
  news.lower.classList.add('in');

  // 2. REPLAY
  if (news.pip.frames > 0) {
    await run(async (c) => {
      studio?.shot('close');
      news.bumper('REPLAY', 'red', 'play');
      news.live.classList.add('replay');
      await c.wait(380);
      news.pip.open();
      say(lines.replay);
      anchor?.play('point', { dur: 1.4, then: 'talk' });
      await c.wait(Math.max(1900, news.pip.playMs()));
    });
    news.pip.dock();
    news.live.classList.remove('replay');
    hush();
  }

  // 3. RESULT, 4. NUMBERS, 5. PAYOUT
  for (const s of news.segments) {
    if (!root.isConnected) break;
    await run(async (c) => {
      if (s.shot) studio?.shot(s.shot);
      if (s.bumper) news.bumper(s.bumper, s.col, s.ic);
      if (s.bumper) await c.wait(420);
      if (s.say) say(lines[s.say]);
      for (const step of s.steps) {
        await step(c);
        if (!root.isConnected) return;
      }
      if (s.react && anchor && !c.skipping) s.react(anchor);
      await c.wait(s.hold ?? 300);
    });
    s.done?.();
  }

  // 6. SIGN OFF
  studio?.shot('mid', 2.5);
  say(lines.signoff);
  anchor?.react?.('wave', { dur: 1.6 });
  news.el.classList.add('done');
  root.removeEventListener('pointerdown', onTap);

  const buttons = opts.buttons ?? [{ id: 'ok', label: 'OK', color: 'blue' }];
  return new Promise((resolve) => {
    const foot = h('div', { class: 'res-foot cres-foot' }, buttons.map((b) => button(b.label, () => {
      hush();
      root.remove();
      end();
      resolve(b.id);
    }, `${b.color ?? 'blue'} lg`, { icon: b.icon })));
    // landscape: the buttons take the lower third's place at the bottom of the studio (the board stays whole)
    if (!portrait()) news.studio.appendChild(news.footSlot);
    news.footSlot.appendChild(foot);
    requestAnimationFrame(() => news.board.scrollTo?.({ top: news.board.scrollHeight, behavior: 'smooth' }));
    // the screen was torn down from outside (scene change)
    const watch = setInterval(() => { if (!root.isConnected) { clearInterval(watch); hush(); end(); } }, 500);
  });
}

// ---------------------------------------------------------------------------
// BEAST NEWS layout + segment steps

function buildNews({ result, names, bases, r, sum, opts, replay, smashed, fell, mvp, mvpDef }) {
  const win = result === 'win', loss = result === 'loss';
  const me = names[0] ?? 'You', riv = names[1] ?? 'Rival';
  const st = sum?.sides?.[0]?.stats ?? {};
  const time = sum?.time ?? 0;
  // the headline is the only sentence on the board: who did what (the time and stats are tiles below)
  const headlineText = win
    ? (smashed ? `*${me}* SMASHES *${riv}*!` : `*${me}* OUTLASTS *${riv}*!`)
    : loss
      ? (fell ? `*${riv}* FLATTENS *${me}*!` : `*${riv}* EDGES *${me}*!`)
      : 'STALEMATE!';

  // ---- top bar: logo bug + LIVE / REPLAY
  const live = h('div', { class: 'cn-live nx-c-red' }, recDot(), h('span', { class: 'l' }, 'LIVE'), h('span', { class: 'rp' }, 'REPLAY'));
  const bug = h('div', { class: 'cn-bug' },
    h('b', { class: 'nx-s-red' }, 'BEAST'),
    h('span', { class: 'nx-s-white' }, 'NEWS'),
    h('i', { class: 'cn-bug-sheen' }));

  // ---- Nora's speech bubble
  const sayTxt = h('span', {});
  const say = h('div', { class: 'cn-say' }, sayTxt, h('i', { class: 'cn-say-tail' }));
  const placeSay = (studio) => {
    if (!say.classList.contains('on')) return;
    const p = studio?.headScreen?.();
    const W = window.innerWidth, H = window.innerHeight;
    const port = H > W;
    const w = say.offsetWidth || 160, sh = say.offsetHeight || 40;
    // to the right of her head, inside the studio area
    let x = p ? p.x + Math.max(28, W * 0.06) : W * 0.42;
    let y = p ? p.y + (port ? H * 0.06 : H * 0.08) : H * 0.2;
    const maxX = port ? W - 10 : W * 0.44 - 6;
    x = Math.max(8, Math.min(maxX - w, x));
    const pip = pipEl.classList.contains('docked') ? pipEl.getBoundingClientRect() : null;
    if (pip && x + w > pip.left && y < pip.bottom + 8) y = pip.bottom + 10;
    y = Math.min(y, (lower.getBoundingClientRect().top || H * 0.4) - sh - 10);
    say.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    const ty = p ? Math.max(12, Math.min(sh - 12, p.y + 30 - y)) : sh / 2;
    say.style.setProperty('--ty', Math.round(ty) + 'px');
  };

  // ---- lower third: two bands slide in under the BEAST NEWS tag + the headline plate
  //      (team colours on the names: blue = mine, red = theirs) and an arena strap
  const headline = h('div', { class: `cn-hl ${loss ? 'riv-first' : 'me-first'}` });
  const arenaName = String(sum?.arena?.name ?? 'Beast Island').toUpperCase();
  const lower = h('div', { class: 'cn-lower' },
    h('div', { class: 'cn-strap nx-c-navy' }, icon('pin'), h('span', {}, arenaName)),
    h('div', { class: 'cn-lrow' },
      h('i', { class: 'cn-ls a' }), h('i', { class: 'cn-ls b' }),
      h('div', { class: 'cn-tag nx-s-red' }, 'BEAST NEWS'),
      h('div', { class: 'cn-hlw nx-s-white' }, headline)));

  // ---- replay box (picture in picture): a bevelled TV with scanline glass, a REPLAY tag and
  //      a pixel progress bar that fills as the clip plays
  const frames = (replay?.frames ?? []).filter((f) => f?.width);
  const pipCv = document.createElement('canvas');
  pipCv.width = frames[0]?.width ?? 256; pipCv.height = frames[0]?.height ?? 144;
  pipCv.className = 'cn-pip-cv';
  const pg = pipCv.getContext('2d');
  pg.imageSmoothingEnabled = false;
  const pipBar = h('i', { class: 'f' });
  const pipEl = h('div', { class: 'cn-pip nx-s-steel' },
    h('div', { class: 'cn-pip-in' }, pipCv, h('i', { class: 'cn-pip-scan' }), h('i', { class: 'cn-pip-glare' }), h('b', { class: 'cn-pip-bar' }, pipBar)),
    h('div', { class: 'cn-pip-tag nx-c-red' }, recDot(), 'REPLAY'));
  let fi = -1, ft = 0, playing = false;
  // the whole clip plays in about two seconds, however many snapshots there are
  const FRAME_MS = Math.max(110, Math.min(170, 2100 / Math.max(1, frames.length)));
  const drawFrame = (i) => {
    if (!frames[i]) return;
    pg.drawImage(frames[i], 0, 0, pipCv.width, pipCv.height);
    fi = i;
    pipBar.style.width = (((i + 1) / frames.length) * 100).toFixed(1) + '%';
  };
  if (frames.length) drawFrame(frames.length - 1);
  const pip = {
    frames: frames.length,
    playMs: () => frames.length * FRAME_MS + 500,
    open() {
      pipEl.classList.add('big');
      playing = true;
      ft = performance.now();
      drawFrame(0);
      audio.play('whoosh', { pitch: 1.3, vol: 0.5 });
    },
    dock() {
      if (!frames.length) return;
      playing = false;
      pipEl.classList.remove('big');
      pipEl.classList.add('docked');
      drawFrame(frames.length - 1);
    },
    tick() {
      if (!frames.length) return;
      const now = performance.now();
      // big: plays once through (slow), docked: loops the clip quietly
      const per = (playing ? FRAME_MS : 240) * slowK();
      if (now - ft < per) return;
      ft = now;
      if (playing) { if (fi < frames.length - 1) drawFrame(fi + 1); }
      else if (pipEl.classList.contains('docked') && frames.length > 2) drawFrame((fi + 1) % frames.length);
    },
  };

  // ---- the board (segment panels)
  const board = h('div', { class: 'cn-board' });
  const footSlot = h('div', { class: 'cn-footslot' });
  const segments = [];

  // keep what was just revealed in view (the board scrolls when it is taller than the screen)
  const show = (e) => requestAnimationFrame(() => { try { e.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (x) { /* old browsers */ } });
  // category plate on a panel's top edge: icon + one word, in the segment's colour
  const plate = (txt, col, ic) => h('div', { class: `cn-plate nx-s-${col}` }, icon(ic), h('span', {}, txt));

  // bumper: three stripe bands wipe across the board, the segment's plate rides in the middle
  const bumperTx = h('span', {});
  const bumperIc = h('i', { class: 'ic' });
  const bumperPl = h('div', { class: 'p nx-s-red' }, bumperIc, bumperTx);
  const bumperEl = h('div', { class: 'cn-bumper' }, h('i', { class: 'a' }), h('i', { class: 'b' }), h('i', { class: 'c' }), bumperPl);
  const bumperFx = (txt, col = 'red', ic = 'star') => {
    bumperTx.textContent = txt;
    bumperIc.replaceChildren(icon(ic));
    bumperPl.className = `p nx-s-${col}`;
    bumperEl.style.setProperty('--seg', `var(--nx-st-${col})`);
    bumperEl.style.setProperty('--segc', `var(--nx-${col})`);
    bumperEl.classList.remove('go');
    void bumperEl.offsetWidth;
    bumperEl.classList.add('go');
    SND.swoosh();
  };

  // 3. RESULT: base HP left (avatars + Lab Level rank medals), team colours
  let levels = opts.levels;
  if (!levels) { try { levels = engine.current?.cfg?.sides?.map((sd) => sd?.labLevel) ?? []; } catch (e) { levels = []; } }
  let sideCfgs = opts.sides;
  if (!sideCfgs) { try { sideCfgs = engine.current?.cfg?.sides ?? []; } catch (e) { sideCfgs = []; } }
  const baseRow = (i) => {
    const b = bases[i];
    const fill = h('i', { class: 'f' });
    const pct = h('span', { class: 'pc' }, '100%');
    const lv = levels[i];
    const medal = lv ? rankMedal(lv, { cls: 'cn-rank', shine: false }) : null;
    const av = sideCfgs?.[i] ? sideAvatarEl(sideCfgs[i], { cls: 'cn-av', anim: false }) : null;
    const el = h('div', { class: `cn-base s${i}` },
      h('div', { class: 'who' }, av, medal),
      h('div', { class: `nm nx-c-${i ? 'red' : 'blue'}` }, h('span', {}, i ? riv : me)),
      h('b', { class: 'bar' }, h('i', { class: 'fw' }, fill), pct));
    return { el, fill, pct, b, medal };
  };
  const bRows = [baseRow(0), baseRow(1)];
  const basesEl = h('div', { class: 'cn-card cn-bases nx-g-steel' }, plate('RESULT', 'red', 'flag'), bRows[0].el, bRows[1].el);
  board.appendChild(basesEl);
  segments.push({
    shot: 'mid', bumper: 'RESULT', col: 'red', ic: 'flag',
    steps: [async (c) => {
      basesEl.classList.add('in');
      show(basesEl);
      audio.play('whoosh', { pitch: 1.5, vol: 0.5 });
      await c.wait(200);
      await Promise.all(bRows.map((t, k) => new Promise((res) => {
        const to = Math.max(0, t.b.frac), dur = c.skipping ? 1 : 900 * slowK();
        const t0 = performance.now() + k * 160;
        const stepF = (now) => {
          const q = Math.max(0, Math.min(1, (now - t0) / dur));
          const v = 1 - (1 - to) * (1 - Math.pow(1 - q, 3));
          t.fill.style.width = (v * 100).toFixed(1) + '%';
          t.pct.textContent = Math.round(v * 100) + '%';
          if (q < 1 && !c.skipping) requestAnimationFrame(stepF);
          else {
            t.fill.style.width = (to * 100).toFixed(1) + '%';
            t.pct.textContent = Math.round(to * 100) + '%';
            if (!t.b.alive) { t.el.appendChild(h('div', { class: 'cn-stamp ic nx-c-red', role: 'img', 'aria-label': 'Destroyed' }, icon('skull'))); audio.play('stamp'); bump(t.el, 'cn-hit'); }
            else if (t.b.frac >= 0.999) { t.el.appendChild(h('div', { class: 'cn-stamp ic good nx-c-gold', role: 'img', 'aria-label': 'Flawless' }, icon('star'))); audio.play('stamp', { pitch: 1.2 }); }
            res();
          }
        };
        requestAnimationFrame(stepF);
      })));
    }],
    hold: 250,
  });

  // 4. NUMBERS: four stats tick up one by one, then the MVP card
  const tiles = [
    { ic: 'clock', label: 'Battle time', value: time, fmt: fmtTime },
    { ic: 'swords', label: 'Troops deployed', value: st.deployed ?? 0 },
    { ic: 'bolt', label: 'Damage dealt', value: Math.round(st.dmg ?? 0), fmt: fmtBig },
    { ic: 'skull', label: 'Swarms defeated', value: st.kills ?? 0 },
  ];
  const grid = h('div', { class: 'cn-grid' });
  const numsEl = h('div', { class: 'cn-card cn-nums nx-g-steel' }, plate('STATS', 'red', 'bolt'), grid);
  board.appendChild(numsEl);
  // the MVP card and the trophies share a row
  const rowC = h('div', { class: 'cn-row' });
  board.appendChild(rowC);
  const numSteps = [async () => { numsEl.classList.add('in'); show(numsEl); }];
  tiles.forEach((tl, k) => {
    const v = h('b', { class: 'v' }, tl.fmt ? tl.fmt(0) : '0');
    const el = h('div', { class: 'cn-tile nx-t-steel', title: tl.label },
      h('i', { class: 'cn-tile-pod' }, icon(tl.ic, 'cn-tile-ic')), v);
    grid.appendChild(el);
    numSteps.push(async (c) => {
      el.classList.add('in');
      SND.tickRoll(1 + k * 0.08);
      if (c.skipping) v.textContent = tl.fmt ? tl.fmt(tl.value) : fmtN(tl.value);
      else rollNumber(v, 0, tl.value, 0.5 * slowK(), tl.fmt ?? fmtN);
      await c.wait(340);
    });
  });
  if (mvpDef) {
    let art = null;
    try { art = cardArtImg(mvp.id, 'base', null, 160, 'cn-mvp-art'); } catch (e) { art = null; }
    const dmgV = h('b', {}, '0');
    // the MVP stands in a spotlight: a dithered pixel cone over its card art
    const el = h('div', { class: 'cn-mvp nx-g-steel' },
      plate('MVP', 'red', 'star'),
      h('div', { class: 'cn-mvp-frame nx-t-steel' }, h('i', { class: 'px-rays w' }), h('i', { class: 'cn-spot' }), art),
      h('div', { class: 'cn-mvp-info' },
        h('span', { class: 'nm' }, mvpDef.name ?? mvp.id),
        mvp.dmg ? h('span', { class: 'd' }, icon('bolt'), dmgV) : mvp.count ? h('span', { class: 'd' }, icon('swords'), `x${mvp.count}`) : null));
    rowC.appendChild(el);
    numSteps.push(async (c) => {
      el.classList.add('in');
      show(rowC);
      audio.play('reveal', { pitch: 1.1 });
      if (mvp.dmg) { if (c.skipping) dmgV.textContent = fmtN(mvp.dmg); else rollNumber(dmgV, 0, mvp.dmg, 0.7 * slowK(), fmtN); }
      setTimeout(() => el.isConnected && sparkle(el, { count: 12, colors: ['#ffd84a', '#ffffff'] }), 240);
      await c.wait(700);
    });
  }
  segments.push({ shot: 'desk', bumper: 'STATS', col: 'red', ic: 'bolt', say: 'numbers', steps: numSteps, react: (a) => a.react('thumbsUp', { dur: 1.3 }), hold: 450 });

  // 5. PAYOUT: trophies, then the rewards drop in one by one with weight
  const payEl = h('div', { class: 'cn-card cn-pay nx-g-steel' }, plate('REWARDS', 'gold', 'gift'));
  const paySteps = [async () => { payEl.classList.add('in'); }];
  // trophies held back by a Trophy Road boss (data/roadBosses.js) still count here, marked with a padlock
  const banked = Math.max(0, r?.banked ?? 0);
  const tr = (r?.trophies ?? 0) + banked;
  if (r && (tr || opts.mode === 'ranked' || opts.mode === 'online')) {
    const tv = h('b', { class: 'v' }, '0');
    const el = h('div', { class: `cn-trophy ${tr < 0 ? 'neg nx-g-steel' : 'nx-g-gold'}` }, h('i', { class: 'px-rays w' }), animIcon('trophy'), h('div', { class: 'tx' }, tv), banked ? icon('lock', 'cn-tro-bank') : null, h('i', { class: 'cn-sheen' }));
    rowC.appendChild(el);
    paySteps.push(async (c) => {
      el.classList.add('in');
      show(rowC);
      audio.play(tr >= 0 ? 'crown' : 'error');
      if (c.skipping) tv.textContent = (tr > 0 ? '+' : '') + tr;
      else rollNumber(tv, 0, tr, 0.6 * slowK(), (n) => (tr > 0 && n > 0 ? '+' : '') + n);
      if (!c.skipping) { engine.shake?.(0.05); if (tr > 0) setTimeout(() => el.isConnected && burst(el, { color: '#ffd84a', count: 18 }), 320); }
      await c.wait(650);
    });
  }
  if (r) {
    const items = [];
    // reward tiles: icon + number on gold-rimmed tiles (gold is kept for rewards)
    const add = (ic, value, label, o = {}) => {
      const v = h('b', {}, '0');
      const col = o.neg ? 'steel' : 'gold';
      const el = h('div', { class: `cn-chip nx-t-${col} ${o.neg ? 'neg' : ''} k-${ic}`, title: o.title ?? '' },
        h('i', { class: 'cn-chip-pod' }, o.img ?? animIcon(ic)), h('div', {}, v, label ? h('small', {}, label) : null));
      items.push({ el, v, value, text: o.text });
    };
    // icon + number; only the two XP kinds keep a word (the icon says whose XP)
    if (r.coins) add('coin', r.coins, null, { title: 'Coins' });
    if (r.vial) {
      const vd = VIALS[r.vial];
      let img = null;
      const vt = opts.vialThumb;
      try { img = vt ? h('img', { class: 'vial3d', src: vt(r.vial, 96) }) : null; } catch (e) { img = null; }
      if (!img) {
        img = icon('vial');
        import('../../ui/vialThumb.js').then((m) => {
          try { const src = m.vialThumb(r.vial, 96); if (src && img.isConnected) { img.src = src; img.classList.add('vial3d'); } } catch (e) { /* keep the icon */ }
        }).catch(() => {});
      }
      add('vial', 0, null, { img, text: 'NEW!', title: vd?.name ?? 'Vial' });
    } else if (r.slotsFull && result === 'win') add('vial', 0, null, { text: 'FULL', neg: true, title: 'Vial slots full' });
    if (r.calories) add('calorie', r.calories, null, { title: 'Calories' });
    if (r.cmdXp) add('star', r.cmdXp, 'XP', { title: 'Commander XP' });
    if (r.labXp) add('lab', r.labXp, 'XP', { title: 'Lab XP' });
    if (items.length) {
      const chips = h('div', { class: 'cn-chips' }, items.map((it) => it.el));
      payEl.appendChild(chips);
      paySteps.push(async (c) => {
        for (const [k, it] of items.entries()) {
          it.el.classList.add('in');
          if (!k) show(chips);
          if (it.text) it.v.textContent = it.text;
          else if (c.skipping) it.v.textContent = '+' + fmtN(it.value);
          else rollNumber(it.v, 0, it.value, 0.5 * slowK(), (n) => '+' + fmtN(n));
          if (!c.skipping) {
            audio.play(k === 0 ? 'chaching' : 'coin', { pitch: 1 + k * 0.08, vol: 0.8 });
            setTimeout(() => { if (it.el.isConnected) { audio.play('thud', { pitch: 1.4, vol: 0.35 }); bump(board, 'cn-thud'); } }, 200);
          }
          await c.wait(300);
        }
      });
    }
    // level ups: icon + level on navy chips (gold text), no sentences
    const ups = (r.levelUps ?? []).map((lu) => h('span', { class: 'nx-c-navy' }, icon('up'), `CMDR LV ${lu.level ?? lu}`));
    // Lab Level up: the rank medal pops from the old level to the new one (and so does the one by your name)
    const labTo = r.labUps?.length ? r.labUps[r.labUps.length - 1].level ?? r.labUps[r.labUps.length - 1] : null;
    const labMedal = labTo ? rankMedal(Math.max(1, labTo - r.labUps.length), { cls: 'cn-up-rank' }) : null;
    if (labTo) ups.push(h('span', { class: 'cn-up-lab nx-c-navy' }, labMedal, `LAB LV ${labTo}`));
    // TROOP MASTERY: levels that just became claimable (claim them from the card's info)
    const ms = (r.mastery ?? []).filter((x) => cardDef(x.id));
    for (const x of ms.slice(0, 2)) ups.push(h('span', { class: 'cn-up-ms nx-c-navy' }, icon('star'), `${cardDef(x.id).name} ${MASTERY_NAMES[x.level - 1].toUpperCase()}`));
    if (ms.length > 2) ups.push(h('span', { class: 'cn-up-ms nx-c-navy' }, icon('star'), `+${ms.length - 2}`));
    if (ups.length) {
      const el = h('div', { class: 'cn-ups' }, ups);
      payEl.appendChild(el);
      paySteps.push(async (c) => {
        el.classList.add('in');
        show(el);
        audio.play('levelUp');
        if (labTo) {
          await c.wait(260);
          setRankMedal(labMedal, labTo, { pop: !c.skipping });
          if (bRows[0].medal) setRankMedal(bRows[0].medal, labTo, { pop: !c.skipping });
        }
        await c.wait(300);
      });
    }
  }
  if (paySteps.length > 1) {
    if (payEl.children.length > 1) board.appendChild(payEl);
    segments.push({ shot: 'close', bumper: 'REWARDS', col: 'gold', ic: 'gift', say: 'payout', steps: paySteps, react: (a) => (tr > 0 ? a.react('clap', { dur: 1.4 }) : tr < 0 ? a.react('shrug', { dur: 1.3 }) : null), hold: 400 });
  }
  board.appendChild(footSlot);

  // ---- ticker: the headline, the score and a few gags, each with its own icon
  const bits = [
    [headlineText.replace(/\*/g, ''), 'flag'],
    r?.trophies ? [`TROPHIES ${tr > 0 ? '+' : ''}${tr}`, 'trophy'] : null,
    ['Local toilet clogs, refuses to comment', 'megaphone'],
    ['Beast Tiger "totally fine", says Jimmy', 'swarm'],
    ['Weather: 100% chance of confetti', 'spark4'],
  ].filter(Boolean);
  const tickTxt = bits.map(([b, ic]) => h('span', {}, icon(ic), b.toUpperCase(), h('i', {})));
  const ticker = h('div', { class: 'cn-ticker' },
    h('b', { class: 'cn-ticker-tag nx-s-red' }, 'BEAST NEWS'),
    h('div', { class: 'cn-ticker-run' }, h('div', { class: 'cn-ticker-in' }, tickTxt, tickTxt.map((e) => e.cloneNode(true)))));

  const studio = h('div', { class: 'cn-studio' }, h('i', { class: 'cn-vig' }), bug, live, lower);
  const el = h('div', { class: 'cres-news' },
    studio,
    h('div', { class: 'cn-right' }, board, bumperEl),
    ticker,
    pipEl, say,
    h('div', { class: 'cn-hint', role: 'img', 'aria-label': 'Tap to skip' }, h('i', { class: 'px-skip' })));
  return { el, board, studio, headline, headlineText, lower, segments, footSlot, live, pip, say, sayTxt, placeSay, bumper: bumperFx };
}

export { button };
