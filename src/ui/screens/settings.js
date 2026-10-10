// Settings: volumes, mute, pixel look, screen shake, fullscreen, reset save, credits.
import { h, icon, button, toast, fullscreenToggle } from '../ui.js';
import { audio } from '../../core/audio.js';
import { engine } from '../../core/engine.js';
import { state } from '../../game/state.js';
import { makeScreen, sectionTitle, confirmBox } from './common.js';

export const DISCLAIMER = 'Unofficial fan-made game. Not affiliated with MrBeast, Beast Industries or Moose Toys.';
const PIXEL_MODES = [
  ['chunky', 'Chunky'],
  ['retro', 'Retro'],
  ['crisp', 'Crisp'],
  ['hd', 'HD'],
];

function slider(label, ic, value, onInput, onChange) {
  const val = h('b', { class: 'val' }, Math.round(value * 100) + '%');
  const input = h('input', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(value * 100)), class: 'hub-range' });
  const paint = () => input.style.setProperty('--fill', input.value + '%');
  paint();
  input.addEventListener('input', () => {
    val.textContent = input.value + '%';
    paint();
    onInput(+input.value / 100);
  });
  input.addEventListener('change', () => onChange(+input.value / 100));
  input.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    audio.unlock();
  });
  return h('div', { class: 'hub-setting' }, icon(ic), h('span', { class: 'nm' }, label), input, val);
}

function toggle(label, ic, on, fn) {
  const sw = h('div', { class: 'hub-switch ' + (on ? 'on' : '') }, h('i'));
  const row = h('div', { class: 'hub-setting clickable' }, icon(ic), h('span', { class: 'nm' }, label), h('span', { class: 'spacer' }), sw);
  row.addEventListener('click', () => {
    audio.unlock();
    fn(!on);
  });
  return row;
}

export function openSettings(hub) {
  return makeScreen(hub, {
    name: 'settings',
    title: 'SETTINGS',
    color: '',
    size: 'narrow',
    cls: 'sc-settings',
    render(scr) {
      const s = state.p.settings;
      const root = h('div', { class: 'col' });
      root.appendChild(sectionTitle('SOUND'));
      root.appendChild(
        slider('Sound FX', 'music', s.sfx, (v) => {
          s.sfx = v;
          audio.setVolumes(s.sfx, s.music);
        }, () => {
          state.save();
          audio.play('coin');
        }),
      );
      root.appendChild(
        slider('Music', 'music', s.music, (v) => {
          s.music = v;
          audio.setVolumes(s.sfx, s.music);
        }, () => state.save()),
      );
      root.appendChild(
        toggle('Mute everything', 'x', !!s.muted, (v) => {
          s.muted = v;
          audio.setMuted(v);
          state.emit('settings');
          if (!v) audio.play('click');
        }),
      );

      root.appendChild(sectionTitle('GRAPHICS'));
      const seg = h('div', { class: 'hub-seg' });
      for (const [id, name] of PIXEL_MODES) {
        const b = h('div', { class: 'opt ' + ((s.pixel ?? 'retro') === id ? 'sel' : '') }, name);
        b.addEventListener('click', () => {
          audio.play('tap');
          s.pixel = id;
          engine.setPixelMode(id);
          state.emit('settings');
        });
        seg.appendChild(b);
      }
      root.appendChild(h('div', { class: 'hub-setting col-ish' }, icon('paint'), h('span', { class: 'nm' }, 'Pixel look'), seg));
      root.appendChild(
        toggle('Screen shake', 'energy', s.shake !== false, (v) => {
          s.shake = v;
          state.emit('settings');
          if (v) engine.shake(0.5);
        }),
      );
      const fsRow = h('div', { class: 'hub-setting clickable' }, icon('play'), h('span', { class: 'nm' }, 'Fullscreen'), h('span', { class: 'spacer' }), h('span', { class: 'small muted' }, document.fullscreenElement ? 'On' : 'Off'));
      fsRow.addEventListener('click', () => {
        audio.play('click');
        fullscreenToggle();
        setTimeout(() => scr.rerender(), 400);
      });
      root.appendChild(fsRow);

      root.appendChild(sectionTitle('SAVE DATA'));
      root.appendChild(
        h('div', { class: 'hub-setting' }, icon('skull'), h('span', { class: 'nm grow' }, 'Reset all progress'),
          button('Reset', async () => {
            const a = await confirmBox({ title: 'RESET SAVE?', color: 'orange', text: 'This deletes <b>ALL</b> your swarms, trophies, coins and cosmetics.', yes: 'Reset', yesCls: 'red' });
            if (!a) return;
            const b = await confirmBox({ title: 'REALLY SURE?', color: 'orange', text: 'There is <b>no undo</b>. Your Lab will start from scratch.', yes: 'DELETE EVERYTHING', yesCls: 'red' });
            if (!b) return;
            state.reset();
            toast('Save reset. Restarting...', { icon: 'skull' });
            setTimeout(() => location.reload(), 700);
          }, 'red small')),
      );

      root.appendChild(sectionTitle('CREDITS'));
      root.appendChild(
        h('div', { class: 'hub-credits px-box dark' },
          h('b', { class: 'display small' }, 'MRBEAST SWARMERS'),
          h('span', { class: 'small' }, 'A voxel + pixel-art fan game. All models, sounds and music are generated in code.'),
          h('span', { class: 'tiny muted' }, 'Built with Three.js + Vite · Fonts: Pixelify Sans, Press Start 2P'),
          h('span', { class: 'small gold hub-disclaimer' }, DISCLAIMER),
        ),
      );
      return root;
    },
  });
}
