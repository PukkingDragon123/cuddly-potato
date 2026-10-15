// Battle scene: wires the simulation, AI / network, 3D view and HUD together.
// Modes: tutorial (vs Jimmy), ranked (vs a ghost player), practice, boss, friend.
//
// Controls (Clash Royale card cycle in a Battle Cats lane):
//   * tap a troop card: it pops out of your base and marches (or drag it onto
//     your half); the played card goes to the back of your deck and the NEXT
//     one slides in. Spells: tap then tap the field, or drag. SPECIAL cards:
//     tap to play (hand / draw tricks)
//   * tap YOUR BASE to upgrade it, tap YOUR COMMANDER to unleash the MEGA
//   * drag the battlefield to pan, pinch / mouse-wheel to zoom, tap the minimap to jump
//   * keys: 1-6 hand cards, Space/Enter cast the selected spell, Q signature,
//     W/E skills, O upgrade base, M / R unleash the MEGA ultimate
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { h, say, modal, bigBanner, pointAt, toast, $ui, $overlay, closeDialogue, button } from '../ui/ui.js';
import { charPortrait } from '../ui/thumbs.js';
import { BattleSim } from '../game/battle/sim.js';
import { BattleAI } from '../game/battle/ai.js';
import { BattleView } from '../game/battle/view.js';
import { BattleHUD, vsIntro, EMOTES } from '../game/battle/hud.js';
import { showResult } from '../game/battle/result.js';
import { state, battleRewards, stat } from '../game/state.js';
import { SWARMS } from '../data/swarms.js';
import { SPELLS } from '../data/spells.js';
import { ARENAS, arenaById, BOSSES, ghostOpponent, currentArena } from '../data/arenas.js';
import { STARTER_CARDS } from '../data/cards.js';
import { game } from '../game/game.js';
import { net } from '../net/p2p.js';
import { HostSync, RemoteSim } from '../game/battle/netsync.js';
import { commanderCfg, playerSide, deckEntry } from '../game/battle/loadout.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const JIMMY = () => ({ name: 'Jimmy', color: '#2b8cf2', portrait: charPortrait('jimmy', { eyes: 'happy', mouth: 'grin' }) });
const TAP_MOVE = 10;

export class BattleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, engine.aspect, 0.1, 600);
    this.ended = false;
    this.ready = false;
    this.sel = -1;
    this.drag = null;
    this.fieldPtr = null;
    this.pointers = new Map();
    this.lastTap = { slot: -1, t: 0 };
  }

  // -------------------------------------------------------------------------
  // Setup

  buildConfig(params) {
    const mode = this.mode;
    const p = state.p;
    const me = playerSide();
    let enemy, arenaId = params.arena ?? currentArena(p.trophies).id, boss = null, aiOpts = {};
    if (mode === 'tutorial') {
      arenaId = 'lab';
      me.deck = STARTER_CARDS.map((id) => deckEntry(id, 1));
      me.noShuffle = true;
      me.labLevel = 1;
      // Jimmy lends you a MEGA-TECH Panthar for the finale
      me.mega = { id: 'panthar', variant: 'base', level: 1 };
      enemy = {
        name: 'Jimmy', deck: ['panther', 'toiletRollRipper', 'trashedCan'].map((id) => deckEntry(id, 1)),
        commander: commanderCfg('jimmy', 1), perks: {}, labStyle: 'mansion', labLevel: 1, hpMult: 0.55, clan: 'MrBeast Lab',
      };
      aiOpts = { difficulty: 0.05, maxLab: 0, noSpells: true, sigDelay: 9999 };
    } else if (mode === 'boss') {
      const b = BOSSES[params.bossId];
      arenaId = b.arena;
      enemy = {
        name: b.name, deck: b.deck.map((id) => deckEntry(id, b.level)), commander: b.commander ? commanderCfg(b.commander, Math.min(10, b.level)) : null,
        perks: {}, labStyle: b.lab ?? 'rival', labLevel: b.level + 1, hpMult: 1.2, clan: 'BOSS CHALLENGE',
      };
      if (b.boss) boss = { id: b.id, unit: b.boss, model: b.bossModel, scale: b.bossScale, hp: b.bossHp, dmg: b.bossDmg, level: b.level };
      aiOpts = { difficulty: Math.min(0.9, 0.5 + b.level * 0.05) };
    } else if (mode === 'friend') {
      const ar = arenaById(params.arena) ?? ARENAS[0];
      arenaId = ar.id;
      enemy = { ...params.remote, ghost: false };
      this.opponentTrophies = enemy.trophies ?? 0;
    } else if (mode === 'practice') {
      enemy = {
        name: 'Training Bot', deck: ['panther', 'trashedCan', 'cloggedToilet', 'pizzaSlicer', 'fryFiend', 'toiletRollRipper', 'foodThrow', 'moneyDrop'].map((id) => deckEntry(id, 1)),
        commander: commanderCfg('recruit', 1), perks: {}, labStyle: 'rival', labLevel: 1, clan: 'Practice',
      };
      aiOpts = { difficulty: 0.25, maxLab: 1 };
    } else {
      const g = params.opponent ?? ghostOpponent(p.trophies, Date.now(), arenaId);
      enemy = {
        name: g.name, deck: g.deck.map((id) => deckEntry(id, g.level)), commander: commanderCfg(g.commander, g.cmdLevel), perks: g.perks ?? {}, hpMult: g.hpMult, mega: g.mega ?? null,
        labStyle: ['rival', 'martLab', 'chocoLab', 'default'][g.name.length % 4], labLevel: g.labLevel, banner: g.banner, trophies: g.trophies, clan: g.clan, ghost: true,
      };
      this.opponentTrophies = g.trophies;
      aiOpts = { difficulty: g.difficulty };
    }
    const arena = arenaById(arenaId) ?? ARENAS[0];
    this.arenaId = arena.id;
    this.aiOpts = aiOpts;
    return { theme: arena.theme, seed: (Date.now() & 0xffff) || 1, sides: [me, enemy], boss };
  }

  async enter(params) {
    this.params = params;
    this.mode = params.mode ?? (state.p.tutorial === 'done' ? 'ranked' : 'tutorial');
    const cfg = (this.cfg = this.buildConfig(params));
    const mode = this.mode;
    // simulation (+ AI or network)
    if (mode === 'friend') {
      const peer = (this.peer = net.peer);
      if (params.role === 'guest') this.sim = new RemoteSim({ sides: cfg.sides }, peer);
      else {
        this.sim = new BattleSim({ sides: cfg.sides, seed: cfg.seed });
        this.hostSync = peer ? new HostSync(this.sim, peer) : null;
        if (this.hostSync) this.hostSync.peerEmote = (i) => this.hud?.showEmote(1, i);
      }
      this.ai = null;
      this.offClose = peer?.onClose(() => this.peerLost());
      this.offMsg = peer?.on((m) => { if (m.t === 'emote' && params.role === 'guest') this.hud?.showEmote(1, m.e); });
    } else {
      this.sim = new BattleSim({ sides: cfg.sides, boss: cfg.boss, seed: cfg.seed, timeLimit: mode === 'tutorial' ? 300 : undefined, noOvertime: mode === 'tutorial', baseFloor: mode === 'tutorial' ? 0.3 : 0 });
      this.ai = new BattleAI(this.sim, 1, this.aiOpts);
    }
    this.sim.paused = true;
    // 3D view (shares this scene object so particles attach correctly)
    cfg.scene = this.scene;
    cfg.camera = this.camera;
    this.view = new BattleView(this.sim, cfg);
    await this.view.load();
    this.bloom = this.view.bloom;
    this.shakeScale = state.p.settings.shake === false ? 0 : 1;
    // HUD
    this.hud = new BattleHUD(this.sim, this.view, cfg, {
      press: (slot, e) => this.pressCard(slot, e),
      signature: () => this.trySignature(),
      skill: (k) => this.trySkill(k),
      overclock: () => this.tryOverclock(),
      mega: () => this.tryMega(),
      pause: () => this.pauseMenu(),
      emote: (i) => this.sendEmote(i),
      minimap: (x) => this.view.focus(x, 4),
    });
    this.hud.mount($ui());
    this.hud.setVisible(false);
    this.view.on((ev) => this.onSimEvent(ev));
    this.view.onBaseTap = () => this.tryOverclock();
    if (params.dev) window.__battle = this;
    this.bindInput();
    audio.music(mode === 'boss' ? 'boss' : 'battle');
    this.intro();
  }

  // -------------------------------------------------------------------------
  async intro() {
    const v = this.view;
    // camera sweeps from the rival's Lab to yours while the VS bands play
    v.autoFollow = false;
    v.focus(20, 99);
    v.updateCamera(0, true);
    const vs = vsIntro($overlay(), this.cfg, { hold: this.mode === 'tutorial' ? 1500 : 2000, portraits: [null, this.cfg.boss ? null : null] });
    await wait(0.6);
    v.focus(-20, 99);
    await vs;
    if (this.dead) return;
    v.manualT = 0;
    v.autoFollow = true;
    this.hud.setVisible(true);
    if (this.mode === 'tutorial') {
      this.ready = true;
      this.tutorial();
      return;
    }
    if (this.mode === 'friend') await this.friendHandshake();
    bigBanner(this.mode === 'boss' ? 'BOSS FIGHT!' : 'BATTLE!', '', { dur: 0.9, color: '#ffd84a' });
    audio.play('go');
    if (!(this.mode === 'friend' && this.params.role === 'guest')) this.sim.paused = false;
    this.ready = true;
    if (this.ai && this.mode === 'ranked' && Math.random() < 0.5) setTimeout(() => !this.ended && this.hud.showEmote(1, 0), 1500);
  }

  async friendHandshake() {
    if (this.params.role === 'guest') {
      const iv = setInterval(() => {
        if (this.ended || this.sim.t > 0 || !this.peer?.open) clearInterval(iv);
        else this.peer.send({ t: 'ready' });
      }, 400);
      return;
    }
    toast('Waiting for your friend...', { icon: 'clock' });
    await new Promise((res) => {
      const off = this.peer?.on((m) => { if (m.t === 'ready') { off(); res(); } });
      setTimeout(res, 12000);
    });
  }

  // -------------------------------------------------------------------------
  // Card selection, drag & deploy

  canAct() {
    return this.ready && !this.ended && !this.sim.over && !this.sim.cinematic && !(this.sim.paused && !(this.sim instanceof RemoteSim));
  }
  // the tutorial only points at things: it never blocks your controls
  allowed(what) {
    void what;
    return true;
  }
  card(slot) {
    return this.sim.handCard(0, slot);
  }

  select(slot) {
    if (slot === this.sel) return;
    this.sel = slot;
    this.hud.select(slot);
    const c = slot >= 0 ? this.card(slot) : null;
    if (c && !c.spell) this.view.showDeployZone(this.sim.deployRange(0));
    else this.view.showDeployZone(null);
    if (!c) { this.view.setGhost(null); this.view.setAim(null); }
    if (c) audio.play('cardPick', { pitch: 1 + slot * 0.05 });
  }

  pressCard(slot, e) {
    if (!this.canAct() || !this.allowed('deploy' + slot)) return;
    const c = this.card(slot);
    if (!c) return;
    const wasSel = this.sel === slot;
    // SPECIAL cards: a tap plays them (no aiming)
    if (c.special) {
      this.select(-1);
      this.drag = { slot, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, wasSel: false, over: false, x: null, troopTap: true, special: true };
      return;
    }
    // troops: a tap sends them out of the base (Battle Cats style), a drag drops them on the field
    if (!c.spell) {
      this.select(-1);
      this.drag = { slot, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, wasSel: false, over: false, x: null, troopTap: true };
      return;
    }
    this.select(slot);
    this.drag = { slot, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, wasSel, over: false, x: null };
  }

  /** Preview at a screen point for the selected card; returns the world x (or null). */
  preview(cx, cy) {
    const c = this.card(this.sel);
    if (!c) return null;
    const over = this.hud.isOverField(cx, cy);
    if (!over) {
      this.view.setGhost(null);
      this.view.setAim(null);
      this.view.setEdgePan(0);
      return null;
    }
    let x = this.view.screenToX(cx, cy);
    if (x === null) return null;
    if (c.spell) this.view.setAim(c.unit, x);
    else {
      x = this.sim.clampDeploy(0, x);
      this.view.setGhost(c.unit, x, true);
    }
    const w = engine.width;
    this.view.setEdgePan(cx < w * 0.08 ? -1 : cx > w * 0.92 ? 1 : 0);
    return x;
  }

  deploy(slot, x) {
    if (!this.canAct()) return false;
    const c = this.card(slot);
    if (!c) return false;
    const cost = this.sim.cardCost(0, slot);
    if (this.sim.sides[0].energy < cost) {
      this.hud.needEnergy(cost);
      return false;
    }
    if (x !== null && !c.spell) x = this.sim.clampDeploy(0, x);
    this.view.lastDropX = x ?? this.sim.sides[0].labX + 2;
    const ok = this.sim.play(0, slot, x);
    if (!ok) { audio.play('deny'); return false; }
    audio.play('pop', { pitch: 1.1 });
    if (c.spell && !c.special) bigBanner((SPELLS[c.unit]?.name ?? c.unit).toUpperCase() + '!', '', { dur: 0.7, color: '#c99aff' });
    this.select(-1);
    this.view.setGhost(null);
    this.view.setAim(null);
    this.view.setEdgePan(0);
    this.onTut && this.onTut('deploy', slot, c.id);
    return true;
  }

  // -------------------------------------------------------------------------
  // Commander + base upgrade + MEGA + emotes

  trySignature() {
    if (!this.canAct() || !this.allowed('sig')) return;
    const s = this.sim.sides[0];
    if (this.sim.useSignature(0)) {
      audio.play('levelUp');
      bigBanner(s.cmd.signature.name.toUpperCase() + '!', '', { dur: 1.1, color: '#ff7ac0' });
      this.onTut && this.onTut('sig');
    } else {
      audio.play('deny');
      this.hud.hint(`${s.cmd?.name ?? 'Commander'} is charging...`);
    }
  }
  trySkill(k) {
    if (!this.canAct() || this.lockInput) return;
    const sk = this.sim.sides[0].skills[k];
    if (this.sim.useSkill(0, k)) {
      audio.play('magic');
      bigBanner(sk.name.toUpperCase() + '!', '', { dur: 1, color: '#a8f07a' });
    } else {
      audio.play('deny');
      this.hud.hint(`${sk?.name ?? 'Skill'} recharging...`);
    }
  }
  tryOverclock() {
    if (!this.canAct() || !this.allowed('lab')) return;
    if (this.sim.upgradeLab(0)) this.onTut && this.onTut('lab');
    else {
      const info = this.sim.overclockInfo(0);
      if (info.cost === null) this.hud.hint('Your base is MAXED: Mega HQ!');
      else this.hud.needEnergy(info.cost);
    }
  }
  /** Tapping your Commander: unleash the MEGA when it's ready, otherwise show its charge. */
  tapCommander() {
    const s = this.sim.sides[0];
    if (s.mega && this.sim.canMega(0)) return this.tryMega();
    this.view.pokeCommander(0);
    if (!s.mega) this.hud.hint('Win a MEGA-TECH figure on the Trophy Road to power up your Commander!');
    else this.hud.megaDeny();
  }
  tryMega() {
    if (!this.canAct() || !this.allowed('mega')) return;
    if (this.sim.canMega(0) && this.sim.useMega(0)) {
      this.select(-1);
      this.hud.dragEnd();
      this.onTut && this.onTut('mega');
    } else this.hud.megaDeny();
  }
  sendEmote(i) {
    if (this.ended) return;
    this.hud.showEmote(0, i);
    if (this.mode === 'friend') {
      if (this.params.role === 'guest') this.sim.emote?.(i);
      else this.peer?.send({ t: 'emote', e: i });
    } else if (this.ai && Math.random() < 0.45) {
      const reply = i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 2 : i === 5 ? 4 : 3;
      setTimeout(() => !this.ended && this.hud.showEmote(1, reply), 900 + Math.random() * 900);
    }
  }

  onSimEvent(ev) {
    if (ev.type === 'end') this.endReason = ev.reason;
    else if (ev.type === 'labUp' && ev.side === 0) this.baseUps = (this.baseUps ?? 0) + 1;
    else if (ev.type === 'megaStart') {
      if (ev.side === 0) this.megasUsed = (this.megasUsed ?? 0) + 1;
      this.select(-1);
      this.hud.dragEnd();
      closeDialogue();
      this.hud.setCinematic(true);
    } else if (ev.type === 'megaLand') {
      this.hud.setCinematic(false);
      this.onTut && this.onTut('megaLand');
    }
    this.hud.onEvent(ev);
    if (!this.ai || this.ended) return;
    // the AI rival reacts with emotes now and then
    if (ev.type === 'towerDown' && Math.random() < 0.7) setTimeout(() => !this.ended && this.hud.showEmote(1, ev.side === 1 ? 5 : 4), 1200);
    else if (ev.type === 'signature' && ev.side === 1 && Math.random() < 0.4) setTimeout(() => !this.ended && this.hud.showEmote(1, 4), 600);
  }

  pauseMenu() {
    if (this.ended || this.pauseOpen) return;
    const online = this.mode === 'friend';
    const wasPaused = this.sim.paused;
    if (!online) this.sim.paused = true;
    this.pauseOpen = true;
    const sound = () => (state.p.settings.muted ? 'Sound: OFF' : 'Sound: ON');
    const m = modal({
      title: 'PAUSED', size: 'narrow', color: 'purple',
      body: h('div', { class: 'col center' },
        h('div', { class: 't-sm c-muted center-t' }, 'Drag cards onto the battlefield, or tap a card then tap where to drop it. Double-tap a card to drop it at your Lab.'),
        button('RESUME', () => m.close(), 'green lg'),
        button(sound(), (e) => {
          state.p.settings.muted = !state.p.settings.muted;
          audio.setMuted(state.p.settings.muted);
          state.save();
          e.currentTarget.querySelector('span span').textContent = sound();
        }, 'blue', { icon: 'sound' }),
        this.mode !== 'tutorial' ? button('SURRENDER', () => { m.close(); this.surrender(); }, 'red', { icon: 'flag' }) : null),
      onClose: () => {
        this.pauseOpen = false;
        if (!wasPaused && !online && !this.ended) this.sim.paused = false;
      },
    });
  }
  surrender() {
    if (this.sim instanceof RemoteSim) this.sim.surrender?.();
    else this.sim.end(1, { reason: 'surrender' });
  }

  // -------------------------------------------------------------------------
  // Input

  bindInput() {
    const c = engine.canvas;
    this.onDown = (e) => {
      audio.unlock();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
        this.fieldPtr = null;
        return;
      }
      if (!this.ready) return;
      this.fieldPtr = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, moved: false, aiming: this.sel >= 0 };
      if (this.sel >= 0) this.fieldPtr.x = this.preview(e.clientX, e.clientY);
    };
    this.onMove = (e) => {
      const pt = this.pointers.get(e.pointerId);
      if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.view.zoomBy(this.pinch / Math.max(1, d));
        this.pinch = d;
        return;
      }
      // dragging a card from the hand
      const d = this.drag;
      if (d && e.pointerId === d.id) {
        if (d.special) return;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_MOVE) {
          d.moved = true;
          if (d.troopTap) this.select(d.slot);
          this.hud.dragStart(d.slot);
        }
        if (d.moved) {
          d.over = this.hud.isOverField(e.clientX, e.clientY);
          this.hud.dragMove(e.clientX, e.clientY, d.over);
          d.x = this.preview(e.clientX, e.clientY);
        }
        return;
      }
      const f = this.fieldPtr;
      if (f && e.pointerId === f.id) {
        if (Math.hypot(e.clientX - f.sx, e.clientY - f.sy) > TAP_MOVE) f.moved = true;
        if (f.aiming && this.sel >= 0) f.x = this.preview(e.clientX, e.clientY);
        else if (f.moved) this.view.pan(e.clientX - f.lx);
        f.lx = e.clientX;
        return;
      }
      // desktop hover preview for a selected card
      if (e.pointerType === 'mouse' && this.sel >= 0 && !e.buttons) this.preview(e.clientX, e.clientY);
    };
    this.onUp = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const d = this.drag;
      if (d && e.pointerId === d.id) {
        this.drag = null;
        this.hud.dragEnd();
        this.view.setEdgePan(0);
        if (d.moved) {
          if (d.over && d.x !== null && d.x !== undefined) this.deploy(d.slot, d.x);
          else { this.view.setGhost(null); this.view.setAim(null); }
          if (d.troopTap) this.select(-1);
        } else if (d.troopTap) this.deploy(d.slot, null);
        else if (d.wasSel) this.select(-1);
        return;
      }
      const f = this.fieldPtr;
      if (f && e.pointerId === f.id) {
        this.fieldPtr = null;
        this.view.setEdgePan(0);
        // a plain tap on your own Commander / base
        if (this.sel < 0 && !f.moved && this.canAct()) {
          const hit = this.view.hitTest(e.clientX, e.clientY);
          if (hit === 'commander') { this.tapCommander(); return; }
          if (hit === 'base') { this.tryOverclock(); return; }
        }
        if (this.sel >= 0 && (f.aiming || !f.moved)) {
          const x = f.x ?? this.preview(e.clientX, e.clientY);
          if (x !== null && x !== undefined && this.hud.isOverField(e.clientX, e.clientY)) this.deploy(this.sel, x);
        }
      }
    };
    this.onWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.view.pan(-e.deltaX);
      else this.view.zoomBy(e.deltaY > 0 ? 1.08 : 0.93);
    };
    this.onKey = (e) => {
      if (e.repeat || !this.ready || this.ended) return;
      const k = e.key.toLowerCase();
      if (k >= '1' && k <= '6') {
        const slot = +k - 1;
        const c = this.card(slot);
        if (!c || !this.allowed('deploy' + slot)) return;
        if (c.spell && !c.special) this.select(this.sel === slot ? -1 : slot);
        else this.deploy(slot, null);
      } else if ((k === ' ' || k === 'enter') && this.sel >= 0) {
        e.preventDefault();
        this.deploy(this.sel, null);
      } else if (k === 'q') this.trySignature();
      else if (k === 'w') this.trySkill(0);
      else if (k === 'e') this.trySkill(1);
      else if (k === 'o') this.tryOverclock();
      else if (k === 'm' || k === 'r') this.tryMega();
      else if (k === 'escape') { if (this.sel >= 0) this.select(-1); else this.pauseMenu(); }
      else if (k === 'arrowleft' || k === 'a') this.view.pan(engine.width * 0.15);
      else if (k === 'arrowright' || k === 'd') this.view.pan(-engine.width * 0.15);
    };
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    c.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKey);
    if ('ontouchstart' in window) document.body.classList.add('touch');
  }

  exit() {
    this.dead = true;
    const c = engine.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
    this.hud?.dispose();
    this.view?.dispose();
    this.tutCleanup && this.tutCleanup();
    this.hostSync?.dispose();
    this.sim?.dispose?.();
    this.offClose && this.offClose();
    this.offMsg && this.offMsg();
    this.offRematch && this.offRematch();
    engine.timeScale = 1;
    if (window.__battle === this) window.__battle = null;
  }

  peerLost() {
    if (this.ended) return;
    toast('Your friend disconnected - you win by forfeit!', { icon: 'trophy' });
    if (this.sim instanceof RemoteSim) {
      this.sim.over = true;
      this.sim.winner = 0;
    } else this.sim.end(0, { reason: 'forfeit' });
  }

  resize(w, hh) {
    this.view?.resize(w, hh);
  }

  update(dt, gdt) {
    if (!this.sim || !this.view?.loaded) return;
    if (this.ai && !this.sim.paused) this.ai.update(gdt);
    this.sim.update(gdt);
    this.hostSync && this.hostSync.update(dt);
    this.view.update(dt, this.sim.paused && !this.sim.over ? 0 : gdt);
    this.hud.update(dt);
    this.tutTick && this.tutTick(dt);
    if (this.sim.over && !this.ended) this.finish();
  }

  // -------------------------------------------------------------------------
  // Tutorial battle vs Jimmy

  async tutorial() {
    const sim = this.sim;
    const J = JIMMY();
    const ch = this.view.cmds[1];
    let remove = null;
    const clearPtr = () => { if (remove) { remove(); remove = null; } };
    this.tutCleanup = clearPtr;
    const waitFor = (fn) => new Promise((res) => {
      const prev = this.tutTick;
      this.tutTick = (dt) => {
        if (this.dead) return;
        if (fn(dt)) { this.tutTick = prev; res(); }
      };
    });
    const talk = async (text, opts) => {
      if (this.dead) return new Promise(() => {});
      sim.paused = true;
      await say({ ...J, chibi: ch }, text, opts);
      if (!this.ended) sim.paused = false;
    };
    const until = (kind) => {
      if (this.ai) this.ai.hold = true;
      return new Promise((res) => (this.onTut = (k, slot, id) => {
        if (k === kind) {
          this.onTut = null;
          if (this.ai) this.ai.hold = false;
          res({ slot, id });
        }
      }));
    };
    const slotOf = (id) => sim.sides[0].hand.findIndex((k) => sim.sides[0].deck[k].id === id);
    if (ch) ch.expr('happy', 'grin', 3);
    const cmdPos = () => {
      const c = this.view.cmds?.[0];
      return c ? c.root.position.clone().setY(c.root.position.y + 0.8) : null;
    };
    await talk("Welcome to the *Beast Lab* arena! Your base is on the LEFT - right now it's just a *Camp Tent*. Mine's on the RIGHT. *Smash my base to win!*");
    // 1) tap a unit button: it pops out of the base
    sim.sides[0].energy = Math.max(sim.sides[0].energy, 6);
    await talk('These are your *cards*. *Tap* a troop card and that Swarm pops out of your base and marches into battle *on its own*. Send a *Panther*!');
    this.lockInput = 'deploy';
    remove = pointAt(() => this.hud.slotEl(Math.max(0, slotOf('panther'))), 'Tap!');
    await until('deploy');
    clearPtr();
    this.lockInput = null;
    await wait(1.8);
    // 2) power + the card cycle
    await talk('Every card costs electric *POWER* (the yellow cells), and POWER refills by itself. See that? A *new card* slid into the empty spot - the little *NEXT* card shows what comes after. Your deck *cycles* forever!');
    // 3) the ranged unit
    sim.sides[0].energy = Math.max(sim.sides[0].energy, 5);
    const tslot = slotOf('cloggedToilet');
    if (tslot >= 0) {
      await talk('Now send your *Clogged Toilet*: it shoots from behind your Panther. Tanks in front, shooters behind!');
      this.lockInput = 'deploy';
      remove = pointAt(() => this.hud.slotEl(tslot), 'Tap!');
      await until('deploy');
      clearPtr();
      this.lockInput = null;
    }
    // 3b) a SPECIAL card
    const dslot = slotOf('energyDrink');
    if (dslot >= 0 && !sim.over) {
      await talk('The *shiny* cards are *SPECIAL* cards - card tricks! *Energy Drink* gives you +3 POWER, but it *EXHAUSTS*: only once per battle. Tap it!');
      this.lockInput = 'deploy';
      remove = pointAt(() => this.hud.slotEl(slotOf('energyDrink')), 'Special!');
      await until('deploy');
      clearPtr();
      this.lockInput = null;
      await wait(0.8);
      if (slotOf('quickDraw') >= 0) await talk('*Quick Draw* pulls 2 extra cards into your hand. Mix tricks with troops and build *combos*!');
    }
    // 4) defend
    await waitFor(() => sim.enemiesOf(0).length > 0 || sim.t > 25);
    await talk("Here come my Swarms! Your base *zaps* anything close, but keep sending Swarms to *defend* too.");
    // 5) Food Throw if the lineup has it
    await waitFor(() => sim.alliesOf(0).some((u) => u.hp < u.maxHp * 0.7) || sim.t > 50);
    const fslot = slotOf('foodThrow');
    if (fslot >= 0 && !sim.over) {
      sim.sides[0].energy = Math.max(sim.sides[0].energy, 4);
      this.view.focus(sim.frontAllyX(0), 5);
      await talk('Your Swarms are getting HANGRY! *Food Throw* heals them and makes them *BIGGER*. Tap it, then tap your troops!');
      this.lockInput = 'deploy' + fslot;
      remove = pointAt(() => this.hud.slotEl(slotOf('foodThrow')), 'Spell!');
      await until('deploy');
      clearPtr();
      this.lockInput = null;
    }
    // 6) tap the base to upgrade it
    await waitFor(() => sim.t > 35 || sim.over);
    if (!sim.over) {
      sim.sides[0].energy = Math.max(sim.sides[0].energy, sim.overclockInfo(0).cost ?? 4);
      this.view.focus(sim.sides[0].labX + (engine.width < engine.height ? 3.5 : 6), 8);
      await wait(0.6);
      await talk('That tent is kinda sad. *TAP YOUR BASE* to upgrade it: Tent, Shack, Trailer... all the way to *MEGA HQ*! Each tier = more HP, a stronger zapper and *more max POWER*.');
      this.lockInput = 'lab';
      remove = pointAt(() => this.view.baseBadge?.el, 'Tap your base!');
      await until('lab');
      clearPtr();
      this.lockInput = null;
      await wait(1.6);
    }
    // 7) Commander signature
    await waitFor(() => sim.sides[0].sig >= 1 || sim.t > 75 || sim.over);
    if (!sim.over) {
      sim.sides[0].sig = 1;
      await talk("That's YOU sitting on your base - the *Commander*! Your ability is charged: tap your portrait for *Beaker Barrage*!");
      this.lockInput = 'sig';
      remove = pointAt(this.hud.sig, 'Unleash!');
      await until('sig');
      clearPtr();
      this.lockInput = null;
      await wait(2);
      await talk("Okay, not bad! Now push into my base. I'm not going easy! (I'm going a little easy.)");
    }
    // Jimmy fights back with his giveaway when his base is hurt
    const jLab = sim.sides[1].lab;
    await waitFor(() => jLab.hp < jLab.maxHp * 0.8 || sim.t > 110 || sim.over);
    if (!sim.over) {
      sim.sides[1].sig = 1;
      sim.useSignature(1);
      await wait(1.4);
      if (!sim.over) await talk("Ha! My *Mega Giveaway* distracts your Swarms with cash! Don't worry, Commanders recharge. Keep pushing!");
    }
    // 8) the MEGA ultimate (borrowed Panthar): tap your Commander
    await waitFor(() => jLab.hp < jLab.maxHp * 0.6 || sim.t > 150 || sim.over);
    const m = sim.sides[0].mega;
    if (!sim.over && m && !m.used) {
      await talk("Okay... you're ready. I'm lending you something *TOP SECRET*: a *MEGA-TECH MUTATOR* figure! It needs at least a *Trailer Lab*, so here's a free upgrade.");
      while (sim.sides[0].overclock + 1 < 3 && !sim.over) {
        sim.sides[0].energy = Math.max(sim.sides[0].energy, sim.overclockInfo(0).cost ?? 0);
        sim.upgradeLab(0);
        await wait(0.9);
      }
      this.view.focus(sim.sides[0].labX + (engine.width < engine.height ? 3.5 : 5), 8);
      m.charge = 1;
      sim.emit('megaReady', { side: 0 });
      await wait(0.8);
      await talk('See your Commander crackling with *electric energy*? The *MEGA* charges up as you deal damage - and you only get ONE per battle. It\'s FULL right now. *TAP YOUR COMMANDER!*');
      this.lockInput = 'mega';
      remove = pointAt(cmdPos, 'Tap your Commander!');
      await until('mega');
      clearPtr();
      this.lockInput = null;
      await until('megaLand');
      await wait(1.5);
      if (!sim.over) await talk("WHAT IS THAT THING?! Okay okay, it's yours for this fight! Earn your OWN Megas on the *Trophy Road*.");
    }
  }

  // -------------------------------------------------------------------------
  // End of battle

  async finish() {
    this.ended = true;
    const sim = this.sim;
    const res = sim.draw ? 'draw' : sim.winner === 0 ? 'win' : 'loss';
    const win = res === 'win';
    this.select(-1);
    this.hud.dragEnd();
    closeDialogue();
    this.tutCleanup && this.tutCleanup();
    this.lockInput = null;
    const labFell = !sim.sides[0].lab.alive || !sim.sides[1].lab.alive;
    if (labFell) await wait(2.4);
    else {
      const why = {
        tiebreak: ['TIEBREAKER!', 'The most damaged base loses'],
        surrender: ['SURRENDER', win ? 'Your rival gave up!' : 'You gave up...'],
        forfeit: ['FORFEIT', 'Your rival left the battle'],
      }[this.endReason] ?? (sim.draw ? ["TIME'S UP!", 'Too close to call!'] : ["TIME'S UP!", 'The healthier base wins!']);
      bigBanner(why[0], why[1], { dur: 1.6, color: '#ffd84a' });
      audio.play('bell');
      await wait(1.6);
    }
    if (this.dead) return;
    this.hud.setVisible(false);
    audio.stopMusic();
    if (!sim.draw) this.view.celebrate(sim.winner);
    audio.jingle?.(win ? 'victory' : 'defeat');
    // stats
    const st = sim.sides[0].stats;
    stat('deployed', st.deployed);
    for (const id in st.deployById) stat('deploy_' + id, st.deployById[id]);
    stat('deployFood', st.food);
    stat('signatures', st.sigs);
    for (const k in st) if (k.startsWith('cast_')) stat('cast' + k.slice(5), st[k]);
    if (this.view.cartsSmashed) stat('cartsSmashed', this.view.cartsSmashed);
    if (this.baseUps) stat('baseUpgrades', this.baseUps);
    if (this.megasUsed) stat('megasUsed', this.megasUsed);
    if (win && !sim.sides[1].lab.alive) stat('basesDestroyed');
    // base report for the result screen: HP left + tier reached
    const bases = [0, 1].map((i) => {
      const b = sim.sides[i].lab;
      return { frac: Math.max(0, b.hp / b.maxHp), alive: b.alive, tier: sim.sides[i].overclock };
    });
    const names = [this.cfg.sides[0].name, this.cfg.sides[1].name];
    if (this.mode === 'tutorial') return this.tutorialEnd(win, bases, names);
    if (this.mode === 'friend') return this.friendEnd(res, bases, names);
    const rewards = battleRewards({ result: res, margin: bases[0].frac, arenaId: this.arenaId, mode: this.mode, opponentTrophies: this.opponentTrophies ?? state.p.trophies, bossId: this.params.bossId });
    state.save();
    const again = this.mode === 'boss' ? 'RETRY' : this.mode === 'practice' ? 'AGAIN' : null;
    const btns = [{ id: 'ok', label: 'OK', color: 'blue' }];
    if (again) btns.unshift({ id: 'again', label: again, color: 'yellow', icon: 'swords' });
    const choice = await showResult($overlay(), { result: res, bases, names, rewards, mode: this.mode, buttons: btns });
    if (choice === 'again') game.go('battle', this.mode === 'boss' ? { mode: 'boss', bossId: this.params.bossId } : { mode: this.mode, arena: this.arenaId });
    else game.go('home', { from: 'battle', rewards });
  }

  async tutorialEnd(win, bases, names) {
    const J = JIMMY();
    await showResult($overlay(), { result: win ? 'win' : 'loss', bases, names, rewards: null, mode: 'tutorial', buttons: [{ id: 'ok', label: 'OK', color: 'blue' }] });
    if (!win) {
      await say(J, "Oof! Happens to everyone. Let's run it back - drop a tanky Panther in front and ranged Swarms behind!");
      game.go('battle', { mode: 'tutorial' });
      return;
    }
    state.p.tutorial = 'briefcase';
    state.save();
    game.go('lab', { step: 'won' });
  }

  async friendEnd(res, bases, names) {
    const host = this.params.role !== 'guest';
    const peer = this.peer;
    const btns = [{ id: 'ok', label: 'OK', color: 'blue' }];
    if (host && peer?.open) btns.unshift({ id: 'rematch', label: 'REMATCH', color: 'pink', icon: 'swords' });
    if (!host && peer) {
      this.offRematch = peer.on((msg) => {
        if (msg.t !== 'start') return;
        document.querySelector('.res-wrap')?.remove();
        game.go('battle', { mode: 'friend', role: 'guest', remote: msg.host, arena: msg.arena });
      });
    }
    const choice = await showResult($overlay(), { result: res, bases, names, rewards: null, mode: 'friend', buttons: btns });
    if (choice === 'rematch') {
      const me = this.cfg.sides[0];
      peer.send({ t: 'start', host: me, guest: this.params.remote, arena: this.arenaId });
      game.go('battle', { mode: 'friend', role: 'host', remote: this.params.remote, arena: this.arenaId });
    } else {
      net.clear();
      game.go('home');
    }
  }
}

export { EMOTES };
