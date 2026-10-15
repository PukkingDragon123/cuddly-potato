// Victory / defeat / draw screen (Clash Royale style): the rival's and your
// banner with each base's HP draining to what was left (or a BASE DESTROYED
// stamp), a WINNER tag, then the rewards (trophies, coins, the vial you won,
// XP, calories) popping in with roll-up numbers. Resolves with the button
// pressed.
import { h, icon, animIcon, button, panel, bar, rollNumber, sparkle, burst, confetti, bump } from '../../ui/ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { VIALS } from '../../data/vials.js';
import { BASE_UPGRADES } from '../../data/labs.js';
import { fx } from '../../core/particles.js';
import * as THREE from 'three';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * opts: { result: 'win'|'loss'|'draw', bases: [{ frac, alive, tier }] x2 (mine, theirs), names: [mine, theirs], rewards (battleRewards result | null),
 *         mode, buttons: [{ id, label, color }], vialThumb?: (type) => url }
 */
export async function showResult(parent, opts) {
  const { result, names } = opts;
  const bases = opts.bases ?? [{ frac: 1, alive: true, tier: 0 }, { frac: 1, alive: true, tier: 0 }];
  const r = opts.rewards;
  const title = result === 'win' ? 'VICTORY!' : result === 'draw' ? 'DRAW' : 'DEFEAT';
  const team = (i) => {
    const b = bases[i];
    const fill = h('i', { class: 'f' });
    const pct = h('span', { class: 'pc' }, '100%');
    const winner = (result === 'win' && i === 0) || (result === 'loss' && i === 1);
    const el = h('div', { class: `res-team s${i}${winner ? ' winner' : ''}` },
      h('div', { class: 'res-base' },
        h('div', { class: 'tn' }, icon('lab'), BASE_UPGRADES[b.tier ?? 0]?.name ?? 'Base'),
        h('b', { class: 'rb' }, fill, pct)),
      h('div', { class: 'rn' }, names[i]));
    return { el, fill, pct, b };
  };
  const t1 = team(1), t0 = team(0);
  // the title: each letter slams down in turn over a spinning pixel sunburst and a neon plate
  const letters = [...title].map((ch, i) => h('span', { class: ch === ' ' ? 'sp' : '', style: { '--i': i } }, ch === ' ' ? '\u00a0' : ch));
  const titleEl = h('div', { class: `res-titlew ${result}` },
    h('div', { class: 'px-rays res-rays' + (result === 'win' ? '' : ' w') }),
    h('div', { class: 'res-plate' }),
    result === 'win' ? icon('crown', 'res-crown') : result === 'loss' ? icon('skull', 'res-crown') : null,
    h('div', { class: `res-title ${result}` }, letters),
    h('div', { class: 'res-sub t-d' }, result === 'win' ? 'YOUR LAB WINS!' : result === 'draw' ? 'NOBODY BLINKED' : 'THE RIVAL LAB WINS'));
  setTimeout(() => wrap.classList.add('settled'), 2600);
  const wrap = h('div', { class: `res-wrap r-${result}` }, h('div', { class: 'res-flash' }), titleEl, t1.el, h('div', { class: 'res-vs' }, 'VS'), t0.el);
  parent.appendChild(wrap);
  audio.play(result === 'win' ? 'levelUp' : result === 'draw' ? 'bell' : 'error');
  setTimeout(() => { if (wrap.isConnected) engine.shake?.(result === 'loss' ? 0.25 : 0.18); }, 120 + title.length * 55);
  if (result === 'win') {
    audio.play('cheer');
    fx.confetti(new THREE.Vector3(0, 6, 0), { count: 60, spread: 3 });
    confetti(wrap, { count: 46, life: 5, spread: 1.4 });
    setTimeout(() => wrap.isConnected && burst(titleEl.querySelector('.res-title'), { color: '#ffd84a', count: 24, scale: 1.1 }), 140 + title.length * 55);
  }
  await wait(450);
  // each base's HP drains to what was left; a destroyed base gets stamped
  for (const t of [t1, t0]) {
    const to = Math.max(0, t.b.frac);
    const t0ms = performance.now(), dur = 520;
    await new Promise((res) => {
      const step = (now) => {
        const q = Math.min(1, (now - t0ms) / dur);
        const v = 1 - (1 - to) * (1 - Math.pow(1 - q, 3));
        t.fill.style.width = (v * 100).toFixed(1) + '%';
        t.pct.textContent = Math.round(v * 100) + '%';
        if (q < 1) requestAnimationFrame(step);
        else res();
      };
      requestAnimationFrame(step);
    });
    if (!t.b.alive) {
      t.el.querySelector('.res-base').appendChild(h('div', { class: 'res-stamp' }, icon('skull', 's'), 'BASE DESTROYED!'));
      audio.play('stamp');
      engine.shake?.(0.12);
      bump(t.el, 'res-hit');
    } else if (t.b.frac >= 0.999) {
      t.el.querySelector('.res-base').appendChild(h('div', { class: 'res-stamp good' }, icon('star', 's'), 'FLAWLESS!'));
      sparkle(t.el, { count: 14, colors: ['#ffd84a', '#ffffff'] });
      audio.play('stamp', { pitch: 1.2 });
    }
    await wait(200);
  }
  await wait(250);

  // rewards
  if (r) {
    const items = [];
    const add = (ic, value, label, o = {}) => {
      const v = h('div', { class: 'v' }, '0');
      const el = h('div', { class: `res-rw sk-panel-dark k-${ic}${o.neg ? ' neg' : ''}` }, h('div', { class: 'px-rays w res-rw-rays' }), o.img ?? animIcon(ic), v, h('div', { class: 'l' }, label));
      items.push({ el, v, value, sign: o.sign, text: o.text, neg: o.neg });
    };
    // the 3D vial render, even when the caller didn't pass a thumbnail function
    let vialThumb = opts.vialThumb;
    if (r.vial && !vialThumb) {
      try { vialThumb = (await import('../../ui/vialThumb.js')).vialThumb; } catch (e) { vialThumb = null; }
    }
    if (r.trophies) add('trophy', r.trophies, 'Trophies', { neg: r.trophies < 0, sign: true });
    if (r.coins) add('coin', r.coins, 'Coins');
    if (r.vial) {
      const vd = VIALS[r.vial];
      let src = null;
      try { src = vialThumb ? vialThumb(r.vial, 160) : null; } catch (e) { src = null; }
      const img = src ? h('img', { class: 'vial3d', src }) : icon('vial');
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
      if (!it.neg) setTimeout(() => it.el.isConnected && sparkle(it.el, { count: 8, spread: 40 }), 260);
      await wait(170);
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

export { panel, bar };
