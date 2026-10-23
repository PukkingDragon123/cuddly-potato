// Settings modal: sound / music / SFX (mute + volumes), graphics quality,
// pixel mode, screen shake, fullscreen, credits and a double-confirmed
// progress reset.
import { h, icon, button, modal, toast, fullscreenToggle, clear } from '../ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { state } from '../../game/state.js';
import { game } from '../../game/game.js';
import { subHead, confirmBox, refreshCtx } from './common.js';

export const DISCLAIMER = 'Unofficial fan-made game. Not affiliated with, endorsed by or connected to MrBeast, Beast Industries or Moose Toys.';

export function openSettings(ctx) {
  const body = h('div', { class: 'mn-set' });
  const m = modal({ title: 'SETTINGS', color: 'blue', size: 'narrow', cls: 'mn-setm', body, onClose: () => { state.save(); refreshCtx(ctx); } });
  const S = () => state.p.settings;
  const apply = () => { try { game.settings(); } catch (e) { console.warn(e); } };

  function row(ic, label, ctl, sub = null) {
    return h('div', { class: 'mn-setrow' }, icon(ic, 'mn-setrow-ic'), h('div', { class: 'col grow', style: { gap: 0, minWidth: 0 } }, h('span', { class: 'mn-setrow-l' }, label), sub ? h('span', { class: 't-xs c-muted' }, sub) : null), ctl);
  }
  function toggle(on, fn) {
    const sw = h('button', { class: `mn-switch ${on ? 'on' : ''}`, type: 'button' }, h('i'), h('span', { class: 't-d' }, on ? 'ON' : 'OFF'));
    sw.addEventListener('click', (e) => {
      e.stopPropagation();
      audio.unlock();
      fn(!on);
      render();
    });
    return sw;
  }
  function slider(value, onInput, onDone) {
    const val = h('b', { class: 'mn-slider-v t-d outline' }, Math.round(value * 100) + '%');
    const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(value * 100)), class: 'mn-slider' });
    const paint = () => input.style.setProperty('--f', input.value + '%');
    paint();
    input.addEventListener('input', () => { val.textContent = input.value + '%'; paint(); onInput(+input.value / 100); });
    input.addEventListener('change', () => onDone(+input.value / 100));
    input.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio.unlock(); });
    return h('div', { class: 'mn-slider-w' }, input, val);
  }
  function seg(opts, cur, fn) {
    const w = h('div', { class: 'mn-minseg' });
    for (const [id, label] of opts) {
      const b = h('button', { class: `mn-minseg-b t-d ${id === cur ? 'on' : ''}`, type: 'button' }, label);
      b.addEventListener('click', (e) => { e.stopPropagation(); if (id === cur) return; audio.play('tap'); fn(id); render(); });
      w.appendChild(b);
    }
    return w;
  }

  function render() {
    const s = S();
    clear(body);
    body.append(
      subHead('SOUND'),
      row(s.muted ? 'x' : 'sound', 'Sound', toggle(!s.muted, (on) => { s.muted = !on; audio.setMuted(!on); state.emit('settings'); if (on) audio.play('click'); }), s.muted ? 'Everything is muted' : null),
      row('sound', 'Sound Effects', slider(s.sfx, (v) => { s.sfx = v; audio.setVolumes(s.sfx, s.music); }, () => { state.emit('settings'); audio.play('coin'); })),
      row('music', 'Music', slider(s.music, (v) => { s.music = v; audio.setVolumes(s.sfx, s.music); }, () => state.emit('settings'))),
      subHead('GRAPHICS'),
      row('star', 'Quality', seg([['low', 'LOW'], ['medium', 'MED'], ['high', 'HIGH']], s.graphics ?? engine.quality, (q) => { s.graphics = q; apply(); state.emit('settings'); }), 'Lower it if battles feel slow'),
      row('paint', 'Pixel Mode', toggle(s.pixel === 'retro' || s.pixel === 'chunky', (on) => { s.pixel = on ? 'retro' : 'off'; apply(); state.emit('settings'); }), 'Chunky retro rendering'),
      row('bomb', 'Screen Shake', toggle(s.shake !== false, (on) => { s.shake = on; engine.shakeEnabled = on; state.emit('settings'); if (on) engine.shake?.(0.5); })),
      row('arrowR', 'Fullscreen', toggle(!!document.fullscreenElement, () => { fullscreenToggle(); setTimeout(render, 400); })),
      subHead('CREDITS'),
      h('div', { class: 'mn-credits' },
        h('b', { class: 't-d outline mn-credits-t' }, 'MRBEAST ', h('span', { class: 'c-pink' }, 'SWARMERS')),
        h('span', { class: 't-sm' }, 'A voxel + pixel-art fan game. Every model, sound and tune is generated in code.'),
        h('span', { class: 't-xs c-muted' }, 'Built with Three.js + Vite · Fonts: Jersey 25 + Handjet'),
        h('span', { class: 'mn-disclaimer' }, icon('alert', 's'), DISCLAIMER)),
      subHead('SAVE DATA'),
      row('skull', 'Reset all progress', button('RESET', resetFlow, 'red sm', { icon: 'trash' }), 'Deletes your cards, trophies and everything'),
    );
  }

  async function resetFlow() {
    const a = await confirmBox({ title: 'RESET SAVE?', color: 'red', text: 'This deletes <b>ALL</b> your cards, trophies, coins, Commanders and cosmetics.', yes: 'RESET', yesCls: 'red' });
    if (!a) return;
    const b = await confirmBox({ title: 'REALLY SURE?', color: 'red', text: 'There is <b>NO UNDO</b>. Your Lab starts from scratch.', yes: 'DELETE EVERYTHING', yesCls: 'red' });
    if (!b) return;
    state.reset();
    audio.play('explode');
    toast('Save reset. Restarting the Lab...', { icon: 'skull' });
    setTimeout(() => location.reload(), 800);
  }

  render();
  return m;
}
