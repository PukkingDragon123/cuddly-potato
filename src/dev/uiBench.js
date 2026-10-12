// UI kit test bench: ?dev=ui — every component in one screen.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { h, $ui, icon, button, panel, pill, bar, ribbon, modal, toast } from '../ui/ui.js';
import { ICON_NAMES } from '../ui/icons.js';
import { cardEl } from '../ui/cards.js';
import { state } from '../game/state.js';

export class UiBenchScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3a5ab8);
    this.camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.1, 100);
  }
  enter(params) {
    const p = state.p;
    for (const id of ['panther', 'cloggedToilet', 'steelPanther', 'beastTiger', 'hyperFusionPanther', 'moneyDrop', 'foodThrow']) {
      if (!p.cards[id]) p.cards[id] = { level: 3, copies: 9, variants: { base: true }, variant: 'base', skin: null, found: 1 };
    }
    p.coins = Math.max(p.coins, 5000);
    const icons = h('div', { class: 'row wrap', style: { gap: '6px' } }, ICON_NAMES.map((n) => h('div', { class: 'col center', style: { gap: '2px', width: '54px' } }, icon(n, 'xl'), h('span', { class: 't-xs c-muted' }, n))));
    const colors = ['yellow', 'blue', 'green', 'red', 'pink', 'purple', 'gray', 'orange', 'teal', 'gold', 'white'];
    const btns = h('div', { class: 'row wrap' }, colors.map((c) => button(c.toUpperCase(), () => toast(`Pressed *${c}*`, { icon: 'star' }), c)), button('BATTLE', null, 'yellow xl shine', { icon: 'swords' }), button('', null, 'red sm icon-only', { icon: 'x' }), button('OPEN', null, 'green', { price: { cur: 'bucks', amount: 12 } }));
    const pills = h('div', { class: 'row wrap', style: { gap: '40px', padding: '10px 30px' } }, pill('coin', 12345, { plus: () => {} }), pill('bucks', 340, { plus: () => {} }), pill('trophy', 1520));
    const bars = h('div', { class: 'col', style: { width: '320px', padding: '0 20px' } }, bar(0.6, '', '6/10'), bar(0.3, 'blue', 'XP 120/400'), bar(0.9, 'pink', 'Energy'), bar(1, 'gold', 'MAX', { icon: 'star' }));
    const cards = h('div', { class: 'row wrap', style: { gap: '28px', padding: '14px' } },
      ['panther', 'cloggedToilet', 'steelPanther', 'beastTiger', 'hyperFusionPanther', 'moneyDrop', 'foodThrow', 'glitchBot'].map((id) => cardEl(id, { progress: true })));
    const panels = h('div', { class: 'row wrap', style: { gap: '12px' } },
      ['', 'dark', 'light', 'cream', 'gold', 'pink'].map((k) => panel(k, h('div', { style: { width: '120px', height: '60px', color: k === 'light' || k === 'cream' ? '#120c24' : '#fff' }, class: 't-d center-t' }, k || 'panel'))),
      h('div', { class: 'col center' }, ribbon('SWARM COLLECTION', 'pink'), ribbon('VICTORY!', 'gold'), ribbon('SHOP', 'blue')));
    const root = h('div', { class: 'scroll-y', style: { position: 'absolute', inset: '0', padding: '12px', display: 'flex', flexDirection: 'column', gap: '14px' } },
      h('div', { class: 't-d outline t-xl' }, 'UI BENCH ', h('span', { class: 'c-gold' }, 'MrBeast Swarmers')), btns, pills, bars, cards, panels, icons);
    $ui().appendChild(root);
    if (params.modal) modal({ title: 'VIAL INFO', body: h('div', { class: 'col center' }, h('div', { class: 't-d outline t-lg' }, 'Lab Pack'), h('div', {}, 'A lab kit full of tubes.')), foot: [button('OPEN', null, 'green lg')] });
  }
  update() {}
}
