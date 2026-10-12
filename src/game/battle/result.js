// Victory / defeat / draw screen (Clash Royale style): the rival's and your
// banner with crowns slamming in one by one, a WINNER tag, then the rewards
// (trophies, coins, the vial you won, crown-vial progress, XP, calories)
// popping in with roll-up numbers. Resolves with the button pressed.
import { h, icon, button, panel, bar, rollNumber, sparkle } from '../../ui/ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { VIALS } from '../../data/vials.js';
import { fx } from '../../core/particles.js';
import * as THREE from 'three';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * opts: { result: 'win'|'loss'|'draw', crowns: [mine, theirs], names: [mine, theirs], rewards (battleRewards result | null),
 *         mode, buttons: [{ id, label, color }], vialThumb?: (type) => url }
 */
export async function showResult(parent, opts) {
  const { result, crowns, names } = opts;
  const r = opts.rewards;
  const title = result === 'win' ? 'VICTORY!' : result === 'draw' ? 'DRAW' : 'DEFEAT';
  const team = (i) => {
    const cs = [0, 1, 2].map(() => icon('crown'));
    const winner = (result === 'win' && i === 0) || (result === 'loss' && i === 1);
    return { el: h('div', { class: `res-team s${i}${winner ? ' winner' : ''}` }, h('div', { class: 'res-crowns' }, cs), h('div', { class: 'rn' }, names[i])), cs };
  };
  const t1 = team(1), t0 = team(0);
  const wrap = h('div', { class: 'res-wrap' }, h('div', { class: `res-title ${result}` }, title), t1.el, h('div', { class: 'res-vs' }, 'VS'), t0.el);
  parent.appendChild(wrap);
  audio.play(result === 'win' ? 'levelUp' : result === 'draw' ? 'bell' : 'error');
  if (result === 'win') {
    audio.play('cheer');
    fx.confetti(new THREE.Vector3(0, 6, 0), { count: 60, spread: 3 });
  }
  await wait(450);
  // crowns slam in one at a time
  for (const [t, n] of [[t1, crowns[1]], [t0, crowns[0]]]) {
    for (let k = 0; k < n; k++) {
      t.cs[k].classList.add('on');
      sparkle(t.cs[k], { count: 10, colors: ['#ffd84a', '#ffffff'] });
      audio.play('crown');
      engine.shake?.(0.05);
      await wait(260);
    }
  }
  await wait(250);

  // rewards
  if (r) {
    const items = [];
    const add = (ic, value, label, o = {}) => {
      const v = h('div', { class: 'v' }, '0');
      const el = h('div', { class: `res-rw sk-panel-dark${o.neg ? ' neg' : ''}` }, o.img ?? icon(ic), v, h('div', { class: 'l' }, label));
      items.push({ el, v, value, sign: o.sign, text: o.text });
    };
    if (r.trophies) add('trophy', r.trophies, 'Trophies', { neg: r.trophies < 0, sign: true });
    if (r.coins) add('coin', r.coins, 'Coins');
    if (r.vial) {
      const vd = VIALS[r.vial];
      const img = opts.vialThumb ? h('img', { class: 'vial3d', src: opts.vialThumb(r.vial) }) : icon('vial');
      add('vial', 0, vd?.name ?? 'Vial', { img, text: 'NEW!' });
    } else if (r.slotsFull && result === 'win') add('vial', 0, 'Vial slots full!', { text: 'FULL', neg: true });
    if (r.calories) add('calorie', r.calories, 'Pass calories');
    if (r.cmdXp) add('star', r.cmdXp, 'Commander XP');
    if (r.labXp) add('lab', r.labXp, 'Lab XP');
    const row = h('div', { class: 'res-rewards' });
    wrap.appendChild(row);
    for (const it of items) {
      row.appendChild(it.el);
      if (it.text) it.v.textContent = it.text;
      else rollNumber(it.v, 0, it.value, 0.6, (n) => (it.sign && n > 0 ? '+' : '') + n);
      audio.play('coin', { pitch: 1 + items.indexOf(it) * 0.08 });
      await wait(170);
    }
    if (r.crownProgress) {
      const cp = r.crownProgress;
      const have = cp.crowns ?? 0, need = cp.goal ?? 10;
      const b = bar(Math.min(1, have / need), 'gold', `Crown Vial ${Math.min(have, need)}/${need}`, { icon: 'crown', cls: 'res-bar' });
      wrap.appendChild(b);
    }
    for (const lu of r.levelUps ?? []) wrap.appendChild(h('div', { class: 't-d outline c-gold' }, `Commander level ${lu.level ?? lu}!`));
    for (const lu of r.labUps ?? []) wrap.appendChild(h('div', { class: 't-d outline c-blue' }, `Lab Level ${lu.level ?? lu}!`));
  }
  const buttons = opts.buttons ?? [{ id: 'ok', label: 'OK', color: 'blue' }];
  return new Promise((resolve) => {
    const foot = h('div', { class: 'res-foot slide-up' }, buttons.map((b) => button(b.label, () => { wrap.remove(); resolve(b.id); }, `${b.color ?? 'blue'} lg`, { icon: b.icon })));
    wrap.appendChild(foot);
  });
}

export { panel };
