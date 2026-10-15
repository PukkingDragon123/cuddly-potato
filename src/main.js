import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/press-start-2p/400.css';
import '@fontsource/jersey-10/400.css';
import './ui/ui.css';
import { engine } from './core/engine.js';
import { audio } from './core/audio.js';
import { state, refreshDaily } from './game/state.js';
import { game } from './game/game.js';

const bootBar = document.querySelector('#boot .boot-bar i');
const setBoot = (f) => bootBar && (bootBar.style.width = Math.round(f * 100) + '%');

async function boot() {
  setBoot(0.15);
  engine.init();
  setBoot(0.35);
  state.load();
  refreshDaily();
  const qp = new URLSearchParams(location.search).get('q');
  if (qp) state.p.settings.graphics = qp;
  game.settings();
  setBoot(0.6);
  try {
    await Promise.race([
      Promise.all([document.fonts.load('16px "Pixelify Sans"'), document.fonts.load('16px "Press Start 2P"'), document.fonts.load('16px "Jersey 10"')]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch (e) { /* fonts optional */ }
  setBoot(1);
  const unlock = () => audio.unlock();
  window.addEventListener('pointerdown', unlock, { capture: true });
  window.addEventListener('keydown', unlock, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) state.save();
  });
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  const params = new URLSearchParams(location.search);
  const dev = params.get('dev');
  if (dev === 'reset') state.reset();
  if (params.get('seed')) (await import('./dev/seed.js')).seedProfile(params.get('seed'));
  if (dev === 'chars') await game.go('charview', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'models' || dev === 'props') await game.go('preview', { mode: dev, id: params.get('id'), instant: true });
  else if (dev === 'modellab') await game.go('modellab', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'arena') await game.go('arenaview', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'island') await game.go('islandview', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'ui') await game.go('uibench', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'screens') await game.go('screenbench', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'bases') await game.go('baseview', { ...Object.fromEntries(params), instant: true });
  else if (dev === 'containment') await game.go('containmentview', { ...Object.fromEntries(params), instant: true });
  else if (params.getAll('dev').includes('vial')) await game.go('vialopen', { type: params.get('type') ?? 'testTube', back: params.get('back') ?? 'home', instant: true });
  else if (params.get('scene')) await game.go(params.get('scene'), { instant: true, dev: true, ...Object.fromEntries(params) });
  else await game.go('title', { instant: true });
  const b = document.getElementById('boot');
  b.classList.add('hide');
  setTimeout(() => b.remove(), 500);
}

boot();
