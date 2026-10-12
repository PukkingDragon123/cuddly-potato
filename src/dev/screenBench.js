// Menu screen test bench: ?dev=screens&screen=<shop|cards|lab|pass|cardInfo|trophyRoad|profile|settings|friend|boss>&id=<cardId|bossId>
// Mounts one home-lobby screen (inside a fake top bar + bottom nav frame, &chrome=0 to drop it)
// or opens one modal over a plain backdrop, with a stub ctx that logs every call.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { h, $ui, toast, clear } from '../ui/ui.js';
import { state } from '../game/state.js';

const TABS = {
  shop: () => import('../ui/home/shop.js'),
  cards: () => import('../ui/home/cards.js'),
  lab: () => import('../ui/home/lab.js'),
  pass: () => import('../ui/home/pass.js'),
};
const MODALS = {
  cardInfo: async (p, ctx) => (await import('../ui/home/cardInfo.js')).openCardInfo(p.id ?? 'panther', ctx, { autoUpgrade: p.up === '1' }),
  trophyRoad: async (p, ctx) => (await import('../ui/home/trophyRoad.js')).openTrophyRoad(ctx),
  profile: async (p, ctx) => (await import('../ui/home/profile.js')).openProfile(ctx),
  settings: async (p, ctx) => (await import('../ui/home/settings.js')).openSettings(ctx),
  friend: async (p, ctx) => (await import('../ui/home/friend.js')).openFriendBattle(ctx),
  boss: async (p, ctx) => (await import('../ui/home/boss.js')).openBoss(p.id ?? 'kingClog', ctx),
};

export class ScreenBenchScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a4ab0);
    this.camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.1, 100);
  }

  async enter(params) {
    const name = params.screen ?? 'cards';
    // test helpers: &copies=N gives the card (id) N copies, &coins=N sets coins
    if (params.copies && state.p.cards[params.id]) state.p.cards[params.id].copies = +params.copies;
    if (params.coins) state.p.coins = +params.coins;
    const chrome = params.chrome !== '0' && !!TABS[name];
    const logEl = h('div', { class: 'sb-log', style: { position: 'absolute', left: '4px', bottom: '2px', zIndex: '45', font: '11px monospace', color: '#ffd84a', textShadow: '0 1px 0 #000', pointerEvents: 'none', whiteSpace: 'pre' } });
    const log = (...a) => {
      const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
      console.log('[ctx]', line);
      (window.__sbLog ??= []).push(line);
      logEl.textContent = 'ctx.' + line;
    };
    const host = h('div', { class: 'sb-host', style: { position: 'absolute', left: '0', right: '0', top: chrome ? 'calc(var(--safe-t) + var(--u) * 15)' : '0', bottom: chrome ? 'calc(var(--safe-b) + var(--u) * 18)' : '0', overflow: 'hidden' } });
    const root = h('div', { style: { position: 'absolute', inset: '0', background: 'linear-gradient(#3a6ad8, #1a2a7a)' } }, host);
    let current = null;
    const mountTab = async (tab) => {
      current?.dispose();
      clear(host);
      const mod = await TABS[tab]();
      current = mod.mount(host, ctx);
      window.__sb.tab = tab;
      window.__sb.handle = current;
      navEl?.querySelectorAll('.sb-nav-b').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    };
    const ctx = {
      refresh: () => log('refresh()'),
      openTab: (t) => { log('openTab', t); if (TABS[t]) mountTab(t); },
      openVial: (o) => { log('openVial', o); toast(`(bench) open vial *${o.type}*`, { icon: 'vial' }); },
      battle: (p) => { log('battle', { ...p, remote: p.remote ? '[remote]' : undefined }); toast(`(bench) battle: *${p.mode}*`, { icon: 'swords' }); },
      focusArena: (id) => { log('focusArena', id); toast(`(bench) focus arena *${id}*`, { icon: 'island' }); },
      toast: (t, o) => { log('toast', t); toast(t, o); },
    };
    window.__sb = { ctx, log, state, mountTab };
    let navEl = null;
    if (chrome) {
      const top = h('div', { style: { position: 'absolute', left: '0', right: '0', top: '0', height: 'calc(var(--safe-t) + var(--u) * 15)', background: 'linear-gradient(#141c4e, #0c1238)', boxShadow: '0 3px 0 #120c24', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', zIndex: '3' } },
        h('span', { class: 't-d outline', style: { opacity: '0.5' } }, `TOP BAR  ·  coins ${state.p.coins}  ·  bucks ${state.p.bucks}`));
      navEl = h('div', { style: { position: 'absolute', left: '0', right: '0', bottom: '0', height: 'calc(var(--safe-b) + var(--u) * 18)', background: 'linear-gradient(#1e2a6e, #0c1238)', boxShadow: '0 -3px 0 #120c24', display: 'flex', zIndex: '3' } },
        ...['shop', 'cards', 'home', 'lab', 'pass'].map((t) => {
          const b = h('button', { class: 'sb-nav-b t-d outline', 'data-t': t, type: 'button', style: { flex: '1', background: 'none', border: '0', color: '#fff', fontSize: '1.1em', cursor: 'pointer' } }, t.toUpperCase());
          b.addEventListener('click', () => TABS[t] && mountTab(t));
          return b;
        }));
      const st = h('style', {}, '.sb-nav-b.on{background:linear-gradient(#ffd84a,#e08a14)!important;}');
      root.append(top, navEl, st);
    }
    root.appendChild(logEl);
    $ui().appendChild(root);
    if (TABS[name]) await mountTab(name);
    else if (MODALS[name]) {
      const reopen = h('button', { class: 'btn sk-btn-blue', type: 'button', style: { position: 'absolute', left: '50%', top: '50%', translate: '-50% -50%' } }, h('span', {}, 'REOPEN ' + name.toUpperCase()));
      reopen.addEventListener('click', () => MODALS[name](params, ctx));
      root.appendChild(reopen);
      window.__sb.modal = await MODALS[name](params, ctx);
    }
  }

  exit() {
    window.__sb?.handle?.dispose?.();
  }

  update() {}
}
