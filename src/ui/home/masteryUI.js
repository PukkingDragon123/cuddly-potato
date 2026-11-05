// TROOP MASTERY UI (data + rules: src/data/mastery.js).
//
//   masteryPanel(id, ctx)   card info section: the 5 level crests, the current level's tasks with
//                           progress, its rewards and CLAIM (crest pop + burst + reward popup)
//   masteryBadge(id)        the little crest on a collection card (claimed level, "!" when ready)
//   masteryCrestEl(level)   pixel-art crest (0 = empty socket, 1-5 = Bronze..Master)
//   masteryUpsLine(list)    a short line for the result screen ("Panther: Silver ready")
import './mastery.css';
import { h, icon, button, sparkle, burst, bump, rich } from '../ui.js';
import { PixCanvas, renderPixArt } from '../icons.js';
import { audio } from '../../core/audio.js';
import { state, claimMastery } from '../../game/state.js';
import { cardDef } from '../../data/cards.js';
import { masteryStatus, masteryTrack, isMasteryCard, MASTERY_MAX, MASTERY_NAMES, MASTERY_COLORS, TASK_ICON } from '../../data/mastery.js';
import { featureUnlocked, featureHint } from '../../game/progression.js';
import { rewardTile, rewardLabel, rewardKind, showRewards, fmtN, refreshCtx } from './common.js';

// --------------------------------------------------------------------------- crest art (24-unit grid)

const CREST = [
  { body: '#4e5878', rim: '#2a3050', star: '#8a96b8' },
  { body: '#cf7d3c', rim: '#7c3e1a', star: '#ffd2a8' },
  { body: '#b4bfd8', rim: '#5e6a90', star: '#ffffff' },
  { body: '#ffc21a', rim: '#9a5410', star: '#fff6c8' },
  { body: '#3fd2ee', rim: '#13708a', star: '#e6ffff' },
  { body: '#ff4fa3', rim: '#8a1250', star: '#ffe46a' },
];
const crestCache = new Map();
function crestURL(level, q) {
  const key = level + '|' + q;
  if (crestCache.has(key)) return crestCache.get(key);
  const c = CREST[Math.max(0, Math.min(5, level))];
  const p = new PixCanvas(24, 1, q);
  // master: a crown on top, wings at the sides
  if (level >= 5) {
    p.poly([[6, 6], [8, 1.4], [10.4, 4.6], [12, 0.6], [13.6, 4.6], [16, 1.4], [18, 6]], '#ffc21a');
    p.dot(12, 2, '#ff2e88');
    p.poly([[4, 9], [0.4, 7], [1.4, 12], [0.6, 15.6], [4.6, 15]], '#fff6c8');
    p.poly([[20, 9], [23.6, 7], [22.6, 12], [23.4, 15.6], [19.4, 15]], '#fff6c8');
  }
  // shield
  const top = level >= 5 ? 5.4 : 3;
  p.poly([[4, top], [20, top], [20, 13], [12, 22.6], [4, 13]], c.rim);
  p.poly([[5.6, top + 1.4], [18.4, top + 1.4], [18.4, 12.4], [12, 20.4], [5.6, 12.4]], c.body);
  // star (empty socket: a dim star)
  p.star(12, top + 6.6, 4.6, 2, 5, c.star);
  // pips for the level
  for (let i = 0; i < Math.min(level, 4); i++) p.rect(8.4 + i * 2.2 - (Math.min(level, 4) - 1) * 0 , top + 12.4, 1.2, 1.2, level ? '#ffffff' : c.star);
  renderPixArt(p, { glints: 1 });
  const url = renderPixArt.last.toDataURL();
  crestCache.set(key, url);
  return url;
}
/** Crest <img> for a mastery level (0 = none yet). */
export function masteryCrestEl(level, cls = '') {
  const lv = Math.max(0, Math.min(5, level | 0));
  return h('img', { class: `ms-crest ml-${lv} ${cls}`.trim(), src: crestURL(lv, 3), alt: lv ? `${MASTERY_NAMES[lv - 1]} mastery` : 'No mastery yet', draggable: 'false' });
}

// --------------------------------------------------------------------------- collection badge

/** Small crest for a collection card: the claimed level, with a "!" when a level is ready to claim. */
export function masteryBadge(id) {
  if (!isMasteryCard(id) || !featureUnlocked('mastery')) return null;
  const st = masteryStatus(state.p, id);
  if (!st || (!st.claimed && !st.done)) return null;
  return h('div', { class: `ms-badge ${st.done ? 'ready' : ''}`, 'data-tip': st.done ? 'Mastery reward ready!' : `${MASTERY_NAMES[st.claimed - 1]} mastery` },
    masteryCrestEl(st.claimed), st.done ? h('b', { class: 'ms-badge-n t-d' }, '!') : null);
}

// --------------------------------------------------------------------------- card info panel

const pct = (a, b) => Math.max(0, Math.min(1, b ? a / b : 0));
function taskRow(t) {
  return h('div', { class: `ms-task ${t.done ? 'done' : ''}` },
    icon(t.done ? 'check' : TASK_ICON[t.stat] ?? 'star', 'ms-task-ic'),
    h('div', { class: 'ms-task-main' },
      h('span', { class: 'ms-task-t' }, t.text),
      h('div', { class: 'ms-bar' }, h('i', { style: { width: (pct(t.have, t.n) * 100).toFixed(1) + '%' } }), h('span', { class: 't-d' }, `${fmtN(t.have)} / ${fmtN(t.n)}`))));
}

/** The TROOP MASTERY section for a card's info modal (null for spells / specials). */
export function masteryPanel(id, ctx, opts = {}) {
  if (!isMasteryCard(id)) return null;
  const d = cardDef(id);
  const wrap = h('div', { class: 'mn-ci-sec ms-panel' });
  const head = () => h('div', { class: 'mn-ci-sh t-d outline' }, icon('star', 's'), ' TROOP MASTERY');
  if (!featureUnlocked('mastery')) {
    wrap.append(head(), h('div', { class: 'ms-locked' }, icon('lock', 's'), h('span', { html: rich(featureHint('mastery') ?? 'Locked for now.') })));
    return wrap;
  }
  if (!state.p.cards[id]) {
    wrap.append(head(), h('div', { class: 'ms-locked' }, icon('lock', 's'), h('span', {}, `Find ${d.name} to start its mastery.`)));
    return wrap;
  }
  let busy = false;
  const render = () => {
    wrap.textContent = '';
    const st = masteryStatus(state.p, id);
    const track = masteryTrack(id);
    // the 5 crests
    const crests = h('div', { class: 'ms-crests' }, ...track.map((L, i) => {
      const got = i < st.claimed, cur = i === st.claimed;
      return h('div', { class: `ms-step ${got ? 'got' : ''} ${cur ? 'cur' : ''} ${cur && st.done ? 'ready' : ''}` },
        masteryCrestEl(got || cur ? L.level : 0), h('span', { class: 'ms-step-n t-d', style: { '--mc': L.color } }, L.name));
    }));
    wrap.append(head(), crests);
    if (st.max) {
      const t = track[MASTERY_MAX - 1];
      wrap.append(h('div', { class: 'ms-max' }, masteryCrestEl(5, 'big'),
        h('div', { class: 'col', style: { gap: 'calc(var(--u)*0.5)' } },
          h('b', { class: 't-d outline ms-max-t' }, `${d.name.toUpperCase()} MASTERED`),
          h('span', { class: 't-sm' }, `Title unlocked: ${rewardLabel(t.rewards[0])}. Wear it from your Profile.`))));
      return;
    }
    const L = st.level;
    const body = h('div', { class: `ms-cur ${st.done ? 'ready' : ''}`, style: { '--mc': L.color } },
      h('div', { class: 'ms-cur-h' }, h('b', { class: 't-d outline' }, `${L.name.toUpperCase()}`), h('span', { class: 't-xs c-muted' }, `Level ${L.level} of ${MASTERY_MAX}`)),
      ...st.tasks.map(taskRow),
      h('div', { class: 'ms-rw' }, h('span', { class: 't-xs ms-rw-l' }, 'REWARD'), ...L.rewards.map((r) => h('div', { class: 'ms-rw-t' }, rewardTile(r, { cls: 'ms-rwtile' }), h('span', { class: 'ms-rw-n' }, h('b', {}, rewardLabel(r)), ['coins', 'bucks'].includes(r.type) ? null : h('small', { class: 'c-muted' }, rewardKind(r)))))));
    if (st.done) {
      const btn = button('CLAIM', () => claim(btn), 'yellow lg shine pulse ms-claim', { icon: 'gift' });
      body.appendChild(btn);
    }
    wrap.append(body);
  };
  async function claim(btn) {
    if (busy) return;
    const st = masteryStatus(state.p, id);
    if (!st?.done) return;
    busy = true;
    const L = st.level;
    // crest pop: the current step swells, flashes and bursts before the rewards pop up
    const step = wrap.querySelectorAll('.ms-step')[st.claimed];
    btn?.classList.add('pressed');
    audio.play('upgrade');
    if (step) {
      step.classList.add('ms-pop');
      setTimeout(() => {
        burst(step.querySelector('.ms-crest') ?? step, { count: 22, color: L.color, rays: true });
        sparkle(step, { count: 18, colors: ['#ffffff', L.color, '#ffe46a'] });
      }, 260);
    }
    await new Promise((r) => setTimeout(r, 620));
    const got = claimMastery(id);
    audio.play('levelUp');
    render();
    bump(wrap.querySelectorAll('.ms-step')[st.claimed] ?? wrap);
    refreshCtx(ctx);
    opts.onClaim?.(got);
    await showRewards(got, { title: `${L.name.toUpperCase()} MASTERY!`, color: 'gold', hero: masteryCrestEl(L.level, 'ms-hero'), note: got.some((g) => ['avatar', 'frame', 'banner', 'title'].includes(g.kind)) ? 'Wear it from your Profile.' : null, jingle: 'victory' });
    busy = false;
  }
  render();
  return wrap;
}

/** Cards whose mastery level became claimable in a battle -> short lines for the result screen. */
export function masteryUpsText(list = []) {
  return (list ?? []).filter((x) => cardDef(x.id)).map((x) => `${cardDef(x.id).name}: ${MASTERY_NAMES[x.level - 1]} mastery ready`);
}
export { MASTERY_COLORS };
