// Scene router. Scenes are classes with { scene, camera, enter(params), exit(), update(dt, gdt), resize(w,h) }.
import { engine } from '../core/engine.js';
import { clearUI } from '../ui/ui.js';
import { audio } from '../core/audio.js';
import { state } from './state.js';
import { showLoading, prewarmLoading } from '../scenes/loading.js';
import { tx } from '../ui/transitions.js';

// heavy scenes get the cinematic loading screen (scenes/loading.js) between the bubble lab transitions
const LOADING_SCREEN = new Set(['battle', 'home', 'lab']);

const loaders = {
  title: () => import('../scenes/title.js').then((m) => m.TitleScene),
  lab: () => import('../scenes/lab.js').then((m) => m.LabScene),
  home: () => import('../scenes/home.js').then((m) => m.HomeScene),
  battle: () => import('../scenes/battle.js').then((m) => m.BattleScene),
  preview: () => import('../dev/preview.js').then((m) => m.PreviewScene),
  charview: () => import('../dev/charView.js').then((m) => m.CharViewScene),
  modellab: () => import('../dev/modelLab.js').then((m) => m.ModelLabScene),
  arenaview: () => import('../dev/arenaView.js').then((m) => m.ArenaViewScene),
  islandview: () => import('../dev/islandView.js').then((m) => m.IslandViewScene),
  uibench: () => import('../dev/uiBench.js').then((m) => m.UiBenchScene),
  screenbench: () => import('../dev/screenBench.js').then((m) => m.ScreenBenchScene),
  baseview: () => import('../dev/baseView.js').then((m) => m.BaseViewScene),
  vialopen: () => import('../scenes/vialOpen.js').then((m) => m.VialOpenScene),
  containmentview: () => import('../dev/containmentView.js').then((m) => m.ContainmentViewScene),
};

let transitioning = false;

export const game = {
  current: null,
  currentName: null,
  async go(name, params = {}) {
    if (transitioning) return;
    transitioning = true;
    const tr = !params.instant; // the bubble lab transition (ui/transitions.js)
    const loadCls = loaders[name]();
    loadCls.catch(() => {}); // reported below
    let ld = null;
    if (tr) {
      await tx.cover();
      if (LOADING_SCREEN.has(name)) {
        // the loading screen goes up under the cover, which then lifts off it
        ld = showLoading(name, { ...params, cover: true });
        await tx.reveal();
      }
    }
    let sc = null;
    try {
      const Cls = await loadCls;
      clearUI();
      sc = new Cls();
      this.current = sc;
      this.currentName = name;
      await engine.setScene(sc, params);
    } catch (e) {
      console.error('Scene load failed', name, e);
    }
    if (ld) await ld.done(true);
    else if (tr) tx.reveal();
    transitioning = false;
    // scenes may hold their entrance until the screen is actually visible
    try { if (sc && engine.current === sc) sc.shown?.(); } catch (e) { console.error(e); }
    // the next loading screen's Commander frames render while nothing else is going on
    if (name !== 'battle') prewarmLoading();
  },
  settings() {
    const s = state.p.settings;
    audio.setVolumes(s.sfx, s.music);
    audio.setMuted(!!s.muted);
    if (!s.graphics) s.graphics = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches ? 'medium' : 'high';
    engine.setQuality(s.graphics, s.pixel === 'retro' || s.pixel === 'chunky');
    engine.shakeEnabled = s.shake !== false;
  },
};

if (typeof window !== 'undefined') {
  window.__game = game;
  window.__state = state;
}
