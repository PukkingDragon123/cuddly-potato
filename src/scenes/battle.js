// Battle scene: wires the simulation, AI / network, 3D view and HUD together.
// Modes: tutorial (vs Jimmy), ranked (vs a ghost player), practice, boss, friend (WebRTC code),
// online (live 1v1 over the claude.ai room: src/net/lobby.js + roomNet.js; ranked rewards).
//
// Controls (Clash Royale card cycle in a Battle Cats lane):
//   * Clash Royale placement: tap a card to pick it up (tap it again to put it
//     back), then tap the battlefield to drop it there - or drag the card onto
//     the field (drag it back onto the hand to cancel). Troops land inside your
//     deploy zone (sim.deployRange: your half, or up to your frontmost Swarm);
//     a hologram ghost shows where (placement.js). Spells aim anywhere. A card
//     dropped before you can afford it waits there and deploys the moment you
//     have the POWER. The played card goes to the back of your deck and the NEXT
//     one slides in. SPECIAL cards: tap to play (hand / draw tricks)
//   * tap YOUR BASE to upgrade it, tap YOUR COMMANDER to unleash the MEGA
//   * drag the battlefield to pan, pinch / mouse-wheel to zoom, tap the minimap to jump
//   * keys: 1-6 pick a card (press it again to drop it at the mouse / in front of
//     your base), Space/Enter drop the picked card, Q signature,
//     W/E skills, O upgrade base, M / R unleash the MEGA ultimate
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { animate } from '../core/tween.js';
import { h, say, modal, bigBanner, pointAt, toast, $ui, $overlay, closeDialogue, button } from '../ui/ui.js';
import { charPortrait } from '../ui/thumbs.js';
import { BattleSim } from '../game/battle/sim.js';
import { BattleAI } from '../game/battle/ai.js';
import { BattleView } from '../game/battle/view.js';
import { BattleHUD, EMOTES } from '../game/battle/hud.js';
import { Placement } from '../game/battle/placement.js';
import { FIELD } from '../game/battle/field.js';
import { vsIntro } from '../game/battle/vsIntro.js';
import { showResult, finalBlow } from '../game/battle/result.js';
import { state, battleRewards, stat } from '../game/state.js';
import { SWARMS } from '../data/swarms.js';
import { SPELLS } from '../data/spells.js';
import { ARENAS, arenaById, BOSSES, ghostOpponent, currentArena } from '../data/arenas.js';
import { STARTER_CARDS } from '../data/cards.js';
import { game } from '../game/game.js';
import { net } from '../net/p2p.js';
import { HostSync, RemoteSim } from '../game/battle/netsync.js';
import { lobby } from '../net/lobby.js';
import { commanderCfg, playerSide, deckEntry } from '../game/battle/loadout.js';
import { prewarmBattle } from '../game/battle/prewarm.js';

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
      // no MEGA yet: those are earned on the Trophy Road
      me.mega = null;
      me.noMegaTeaser = true;
      enemy = {
        name: 'Jimmy', deck: ['toiletRollRipper', 'trashedCan'].map((id) => deckEntry(id, 1)),
        commander: commanderCfg('jimmy', 1), perks: { energySurge: -50 }, labStyle: 'mansion', labLevel: 1, hpMult: 0.4, clan: 'MrBeast Lab',
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
    } else if (mode === 'friend' || mode === 'online') {
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
    this.netMode = mode === 'friend' || mode === 'online';
    if (this.netMode) {
      const peer = (this.peer = net.peer);
      if (params.role === 'guest') this.sim = new RemoteSim({ sides: cfg.sides }, peer);
      else {
        this.sim = new BattleSim({ sides: cfg.sides, seed: cfg.seed });
        this.hostSync = peer ? new HostSync(this.sim, peer) : null;
        if (this.hostSync) this.hostSync.peerEmote = (i) => this.hud?.showEmote(1, i);
      }
      this.ai = null;
      this.offClose = peer?.onClose((why) => this.peerLost(why));
      if (mode === 'online') {
        this.offStatus = peer?.onStatus?.((st) => this.netStatus(st));
        // the opponent vanished while this page was still building the battle
        if (!peer || peer.dead) setTimeout(() => this.peerLost(peer?.closeReason === 'lost' ? 'lost' : 'left'), 0);
      }
      this.offMsg = peer?.on((m) => {
        if (m.t === 'emote' && params.role === 'guest') this.hud?.showEmote(1, m.e);
        if (m.t === 'ready') this.peerReady = true;
      });
      // an online link holds what arrived during the hand-off until everyone here listens
      peer?.release?.();
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
    this.plc = new Placement(this.view, this.hud, 0);
    this.view.on((ev) => this.onSimEvent(ev));
    this.view.onBaseTap = () => this.tryOverclock();
    if (params.dev) window.__battle = this;
    this.bindInput();
    audio.music(mode === 'boss' ? 'boss' : 'battle');
    await prewarmBattle(this); // deck models + shaders now (behind the loading screen), not on each card's first deploy
    if (this.dead) return;
    this.intro();
  }

  // -------------------------------------------------------------------------
  async intro() {
    const v = this.view;
    // camera sweeps from the rival's Lab to yours while the VS bands play
    v.autoFollow = false;
    v.focus(20, 99);
    v.updateCamera(0, true);
    const vs = vsIntro($overlay(), this.cfg, { hold: this.mode === 'tutorial' ? 1600 : 2000, arena: arenaById(this.arenaId), boss: this.mode === 'boss' });
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
    if (this.netMode) await this.friendHandshake();
    bigBanner(this.mode === 'boss' ? 'BOSS FIGHT!' : 'BATTLE!', '', { dur: 0.9, color: '#ffd84a' });
    audio.play('fight');
    if (!(this.netMode && this.params.role === 'guest')) this.sim.paused = false;
    this.ready = true;
    if (this.ai && this.mode === 'ranked' && Math.random() < 0.5) setTimeout(() => !this.ended && this.hud.showEmote(1, 0), 1500);
  }

  async friendHandshake() {
    if (this.params.role === 'guest') {
      // a reliable link (online) delivers it once; WebRTC repeats until the host starts
      if (this.peer?.reliable) { this.peer.send({ t: 'ready' }); return; }
      const iv = setInterval(() => {
        if (this.ended || this.sim.t > 0 || !this.peer?.open) clearInterval(iv);
        else this.peer.send({ t: 'ready' });
      }, 400);
      return;
    }
    if (this.peerReady) return;
    toast(this.mode === 'online' ? 'Waiting for your opponent...' : 'Waiting for your friend...', { icon: 'clock' });
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

  /** Pick up a hand card (-1 puts it back). Troop cards light up the deploy zone. */
  select(slot) {
    if (slot === this.sel) return;
    if (slot >= 0) this.cancelPending();
    this.sel = slot;
    this.hud.select(slot);
    const c = slot >= 0 ? this.card(slot) : null;
    this.plc.zone(c && !c.spell);
    this.plc.ghost(null);
    this.view.setAim(null);
    this.hoverX = null;
    if (!c) { this.aimPt = null; this.view.setEdgePan(0); return; }
    audio.play('cardPick', { pitch: 1 + slot * 0.05 });
    if (!c.spell) this.revealZone();
    this.onTut && this.onTut('select', slot, c.id);
  }

  /** The zone's front line is off to the left of the screen: slide the camera so the zone shows. */
  revealZone() {
    const v = this.view;
    const front = this.sim.deployRange(0)[1];
    const sx = v.xToScreen(front, 0).x;
    if (sx < engine.width * 0.22) v.focus(front - (v.halfW ?? 6) * 0.3, 2.5);
  }

  pressCard(slot, e) {
    if (!this.canAct() || !this.allowed('deploy' + slot)) return;
    const c = this.card(slot);
    if (!c) return;
    const d = { slot, id: e.pointerId, sx: e.clientX, sy: e.clientY, moved: false, over: false, x: null };
    // SPECIAL cards: a tap plays them (no aiming)
    if (c.special) {
      this.select(-1);
      this.drag = { ...d, special: true };
      return;
    }
    // the card waiting for POWER: tapping it takes it back
    if (this.pending?.slot === slot) {
      this.cancelPending();
      audio.play('click');
      this.drag = { ...d, swallow: true };
      return;
    }
    // Clash Royale: touching a card picks it up; tap the field or drag it there
    const wasSel = this.sel === slot;
    this.select(slot);
    this.drag = { ...d, wasSel };
  }

  /** Aim the picked card at a screen point: ghost / reticle + edge pan. Returns the world x (or null). */
  aim(cx, cy, edge = true) {
    const c = this.card(this.sel);
    if (!c) return null;
    this.aimPt = { x: cx, y: cy, edge };
    const over = this.hud.isOverField(cx, cy);
    const w = engine.width, band = Math.max(30, w * 0.1);
    this.view.setEdgePan(edge && over ? (cx < band ? -1 : cx > w - band ? 1 : 0) : 0);
    if (!over) {
      this.plc.ghost(null);
      this.view.setAim(null);
      return null;
    }
    const raw = this.view.screenToX(cx, cy);
    if (raw === null) return null;
    if (c.spell) {
      const x = Math.max(-FIELD.VIEW_X, Math.min(FIELD.VIEW_X, raw));
      this.view.setAim(c.unit, x);
      return x;
    }
    // troops snap into the legal zone (the same clamp the sim applies)
    const x = this.sim.clampDeploy(0, raw);
    this.plc.ghost(c, x, { clamped: raw > x + 0.05 });
    return x;
  }
  stopAim() {
    this.aimPt = null;
    this.view.setEdgePan(0);
  }
  /** Where a card goes without a pointer (keyboard): in front of your base / the densest enemies. */
  defaultX(c) {
    if (!c.spell) return this.sim.clampDeploy(0, this.sim.sides[0].labX + FIELD.LAB_HALF + 1.2);
    return this.sim.densestEnemyX(0)?.x ?? this.sim.sides[1].labX;
  }

  /**
   * Drop the card at x. Not enough POWER yet: like Clash Royale the card waits on the field (ghost +
   * meter) and deploys the moment you can afford it; tap it in the hand to take it back.
   */
  placeCard(slot, x) {
    const c = this.card(slot);
    if (!c || !this.canAct()) return false;
    if (x === null || x === undefined) x = this.defaultX(c);
    const cost = this.sim.cardCost(0, slot);
    if (this.sim.sides[0].energy >= cost) return this.deploy(slot, x);
    const tx = c.spell ? x : this.sim.clampDeploy(0, x);
    this.select(-1);
    this.pending = { slot, k: this.sim.sides[0].hand[slot], x: tx, cost, card: c };
    this.hud.queued(slot);
    if (c.spell) this.view.setAim(c.unit, tx);
    else this.plc.ghost(c, tx, { pending: true, cost });
    audio.play('cardPick', { pitch: 0.75 });
    this.onTut && this.onTut('queued', slot, c.id);
    return true;
  }
  cancelPending() {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    this.hud.queued(-1);
    if (p.card.spell) this.view.setAim(null);
    else this.plc.ghost(null);
  }
  /** Per frame: the queued card deploys once affordable; aiming follows the camera (edge pan, front line). */
  tickPlacement(dt) {
    const p = this.pending;
    if (p) {
      const s = this.sim.sides[0];
      if (s.hand[p.slot] !== p.k || this.sim.over) this.cancelPending();
      else if (this.canAct()) {
        p.cost = this.sim.cardCost(0, p.slot);
        if (s.energy >= p.cost) {
          this.pending = null;
          this.hud.queued(-1);
          if (!this.deploy(p.slot, p.x)) this.plc.ghost(null);
        } else if (!p.card.spell) this.plc.ghost(p.card, this.sim.clampDeploy(0, p.x), { pending: true, cost: p.cost });
      }
    }
    const a = this.aimPt;
    if (a && this.sel >= 0) {
      const x = this.aim(a.x, a.y, a.edge);
      if (this.drag?.moved) this.drag.x = x;
      else if (this.fieldPtr?.aiming) this.fieldPtr.x = x;
      else if (!a.edge) this.hoverX = x;
    }
    this.plc.update(dt, this.view.edge);
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
    this.hud.cardUsed(slot, c, x);
    audio.play('pop', { pitch: 1.1 });
    if (c.spell && !c.special) bigBanner((SPELLS[c.unit]?.name ?? c.unit).toUpperCase() + '!', '', { dur: 0.7, color: '#c99aff' });
    if (this.sel === slot) this.select(-1);
    this.plc.ghost(null);
    this.view.setAim(null);
    this.stopAim();
    this.onTut && this.onTut('deploy', slot, c.id);
    return true;
  }

  // -------------------------------------------------------------------------
  // Commander + base upgrade + MEGA + emotes

  trySignature() {
    if (!this.canAct() || !this.allowed('sig')) return;
    if (this.sim.useSignature(0)) {
      audio.play('levelUp');
      this.onTut && this.onTut('sig');
    } else audio.play('deny'); // the HUD's ULT callout says what charges it
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
      this.cancelPending();
      this.hud.dragEnd();
      this.onTut && this.onTut('mega');
    } else this.hud.megaDeny();
  }
  sendEmote(i) {
    if (this.ended) return;
    this.hud.showEmote(0, i);
    if (this.netMode) {
      if (this.params.role === 'guest') this.sim.emote?.(i);
      else this.peer?.send({ t: 'emote', e: i });
    } else if (this.ai && Math.random() < 0.45) {
      const reply = i === 0 ? 0 : i === 1 ? 1 : i === 2 ? 2 : i === 5 ? 4 : 3;
      setTimeout(() => !this.ended && this.hud.showEmote(1, reply), 900 + Math.random() * 900);
    }
  }

  onSimEvent(ev) {
    // per-card damage for the result screen's MVP (BEAST NEWS summary)
    if ((ev.type === 'hit' || ev.type === 'towerHit') && ev.src?.card && ev.src.side === 0) {
      const d = (this.cardDmg ??= {});
      d[ev.src.card] = (d[ev.src.card] ?? 0) + (ev.amount ?? 0);
    }
    if (ev.type === 'end') this.endReason = ev.reason;
    else if (ev.type === 'labUp' && ev.side === 0) this.baseUps = (this.baseUps ?? 0) + 1;
    else if (ev.type === 'megaStart') {
      if (ev.side === 0) this.megasUsed = (this.megasUsed ?? 0) + 1;
      this.select(-1);
      this.cancelPending();
      this.hud.dragEnd();
      closeDialogue();
      this.hud.setCinematic(true);
    } else if (ev.type === 'sigStart') {
      // Commander ultimate cinematic: the HUD tucks away until the view's camera is back
      this.select(-1);
      this.cancelPending();
      this.hud.dragEnd();
      this.hud.setCinematic(true);
      this.sigCine = true;
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
    const online = this.netMode;
    const wasPaused = this.sim.paused;
    if (!online) this.sim.paused = true;
    this.pauseOpen = true;
    const sound = () => (state.p.settings.muted ? 'Sound: OFF' : 'Sound: ON');
    const m = modal({
      title: 'PAUSED', size: 'narrow', color: 'purple',
      body: h('div', { class: 'col center' },
        h('div', { class: 't-sm c-muted center-t' }, 'Tap a card, then tap the battlefield to drop it there - or drag it straight on. Troops land in your glowing zone; tap a card again to put it back.'),
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
      if (this.sel >= 0) this.fieldPtr.x = this.aim(e.clientX, e.clientY);
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
        if (d.special || d.swallow || this.sel !== d.slot) return;
        if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > TAP_MOVE) {
          d.moved = true;
          this.hud.dragStart(d.slot);
        }
        if (d.moved) {
          d.over = this.hud.isOverField(e.clientX, e.clientY);
          this.hud.dragMove(e.clientX, e.clientY, d.over);
          d.x = this.aim(e.clientX, e.clientY);
        }
        return;
      }
      const f = this.fieldPtr;
      if (f && e.pointerId === f.id) {
        if (Math.hypot(e.clientX - f.sx, e.clientY - f.sy) > TAP_MOVE) f.moved = true;
        if (f.aiming && this.sel >= 0) f.x = this.aim(e.clientX, e.clientY);
        else if (f.moved) this.view.pan(e.clientX - f.lx);
        f.lx = e.clientX;
        return;
      }
      // desktop hover preview for a picked card
      if (e.pointerType === 'mouse' && this.sel >= 0 && !e.buttons) this.hoverX = this.aim(e.clientX, e.clientY, false);
    };
    this.onUp = (e) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      const d = this.drag;
      if (d && e.pointerId === d.id) {
        this.drag = null;
        this.hud.dragEnd();
        this.stopAim();
        if (d.swallow) return;
        if (d.special) { if (e.type === 'pointerup') this.deploy(d.slot, null); return; }
        if (this.sel !== d.slot) return;
        if (d.moved) {
          // dropped on the field: place it there; dragged back onto the hand: put it back
          if (d.over && d.x !== null && d.x !== undefined && e.type === 'pointerup') this.placeCard(d.slot, d.x);
          else this.select(-1);
        } else if (d.wasSel) this.select(-1); // tapping the picked card again puts it back
        return;
      }
      const f = this.fieldPtr;
      if (f && e.pointerId === f.id) {
        this.fieldPtr = null;
        this.stopAim();
        // a plain tap on your own Commander / base
        if (this.sel < 0 && !f.moved && this.canAct()) {
          const hit = this.view.hitTest(e.clientX, e.clientY);
          if (hit === 'commander') { this.tapCommander(); return; }
          if (hit === 'base') { this.tryOverclock(); return; }
        }
        if (this.sel >= 0 && f.aiming && e.type === 'pointerup') {
          const x = f.x ?? this.aim(e.clientX, e.clientY, false);
          this.stopAim();
          if (x !== null && x !== undefined && this.hud.isOverField(e.clientX, e.clientY)) this.placeCard(this.sel, x);
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
        if (!c || !this.allowed('deploy' + slot) || !this.canAct()) return;
        if (c.special) this.deploy(slot, null);
        else if (this.pending?.slot === slot) this.cancelPending();
        else if (this.sel === slot) this.placeCard(slot, this.hoverX);
        else this.select(slot);
      } else if ((k === ' ' || k === 'enter') && this.sel >= 0) {
        e.preventDefault();
        this.placeCard(this.sel, this.hoverX);
      } else if (k === 'q') this.trySignature();
      else if (k === 'w') this.trySkill(0);
      else if (k === 'e') this.trySkill(1);
      else if (k === 'o') this.tryOverclock();
      else if (k === 'm' || k === 'r') this.tryMega();
      else if (k === 'escape') { if (this.sel >= 0) this.select(-1); else if (this.pending) this.cancelPending(); else this.pauseMenu(); }
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
    this.plc?.dispose();
    this.hud?.dispose();
    this.view?.dispose();
    this.tutCleanup && this.tutCleanup();
    this.hostSync?.dispose();
    this.sim?.dispose?.();
    this.offClose && this.offClose();
    this.offMsg && this.offMsg();
    this.offRematch && this.offRematch();
    this.offStatus && this.offStatus();
    this.netChip?.remove();
    // leaving an online battle (result screen OK, or the scene changing mid-battle) leaves the match room
    if (this.mode === 'online') { if (net.peer === this.peer) net.clear(); lobby.endMatch(); }
    engine.timeScale = 1;
    if (window.__battle === this) window.__battle = null;
  }

  peerLost(why) {
    if (this.ended) return;
    if (this.mode === 'online' && why === 'lost') {
      // OUR connection died: nobody wins, no trophies change
      this.noContest = true;
      toast('Connection lost - the battle was cancelled.', { icon: 'x' });
      if (this.sim instanceof RemoteSim) { this.sim.over = true; this.sim.draw = true; this.sim.winner = -1; }
      else { this.sim.over = true; this.sim.draw = true; this.sim.winner = -1; }
      return;
    }
    toast(this.mode === 'online' ? 'Your opponent left - you win by forfeit!' : 'Your friend disconnected - you win by forfeit!', { icon: 'trophy' });
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
    // a Commander ULTIMATE cutscene freezes the world (engine.timeScale 0) while its sim-time clock runs on real time
    this.sim.update(this.sim.cinematicKind === 'sig' && this.sim.cinematic > 0 ? dt : gdt);
    this.hostSync && this.hostSync.update(dt);
    // online: both pages are past loading once the clock runs - back to normal disconnect detection
    if (this.mode === 'online' && !this.netLive && this.sim.t > 0.5 && this.peer) { this.netLive = true; this.peer.silentMax = this.peer.baseSilent ?? 15000; }
    this.view.update(dt, this.sim.paused && !this.sim.over ? 0 : gdt);
    if (this.sigCine && !this.view.cine) { this.sigCine = false; this.hud.setCinematic(false); }
    if (this.plc) this.tickPlacement(dt);
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
    let remove = null, teachIv = 0;
    const clearPtr = () => { if (remove) { remove(); remove = null; } };
    this.tutCleanup = () => { clearInterval(teachIv); clearPtr(); };
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
    // teach Clash Royale placement: the hand points at the card until it's picked up, then at the
    // spot on the field to drop it (back to the card if it's put down again); resolves on the deploy
    const teach = async (id, cardTip, fieldTip, spotX) => {
      let mode = '', spot = 0;
      const tick = () => {
        if (this.dead) return;
        const slot = slotOf(id);
        const want = this.pending ? 'wait' : slot >= 0 && this.sel === slot ? 'field' : 'card';
        if (want === mode) return;
        mode = want;
        clearPtr();
        if (want === 'card') remove = pointAt(() => this.hud.slotEl(slotOf(id)), cardTip);
        else if (want === 'field') {
          spot = spotX();
          if (Math.abs(spot - this.view.camX) > (this.view.halfW ?? 6) * 0.7) this.view.focus(spot, 3);
          remove = pointAt(() => { const q = this.view.xToScreen(spot, 0.35); return { x: q.x, y: q.y }; }, fieldTip);
        }
      };
      tick();
      teachIv = setInterval(tick, 100);
      const r = await until('deploy');
      clearInterval(teachIv);
      clearPtr();
      return r;
    };
    // a drop spot inside your zone that is on screen right now (or just behind your front troop)
    const zoneSpot = (behind = null) => {
      const [a, b] = sim.deployRange(0);
      const want = behind ?? this.view.camX + (this.view.halfW ?? 6) * 0.25;
      return Math.max(a + 1.2, Math.min(b - 0.6, want));
    };
    if (ch) ch.expr('happy', 'grin', 3);
    await talk("Welcome to the *Beast Lab* arena! Your base is on the LEFT - right now it's just a *Camp Lab* (a folding table under a tarp). Mine's on the RIGHT. *Smash my base to win!*");
    // 1) pick a card up, then drop it on the field
    sim.sides[0].energy = Math.max(sim.sides[0].energy, 6);
    await talk('These are your *cards*. *Tap* a card to pick it up, then *tap the glowing floor* to drop that Swarm right there. Send a *Panther*!');
    this.lockInput = 'deploy';
    await teach('panther', 'Tap!', 'Drop here!', () => zoneSpot());
    this.lockInput = null;
    await wait(1.8);
    // 2) power + the card cycle + the deploy zone
    await talk('Cards cost *POWER* (the yellow bar) - it fills up fast! A *new card* slides in after each play. Your deck *cycles* forever!');
    await talk("You can only drop troops in *your zone*. The *hazard tape* is the line - and it moves up with your *front Swarm*! Short on POWER? Drop it anyway: it *waits there* until you can pay.");
    // 3) the ranged unit
    sim.sides[0].energy = Math.max(sim.sides[0].energy, 5);
    const tslot = slotOf('cloggedToilet');
    if (tslot >= 0) {
      await talk('Now your *Clogged Toilet*: it shoots from behind, so drop it *behind your Panther*. Tanks in front, shooters behind! Tip: you can also *drag* a card straight onto the field.');
      this.lockInput = 'deploy';
      await teach('cloggedToilet', 'Tap!', 'Behind!', () => zoneSpot(sim.frontAllyX(0) - 2.2));
      this.lockInput = null;
    }
    // 4) defend
    await waitFor(() => sim.enemiesOf(0).length > 0 || sim.t > 25);
    await talk('Here come my Swarms! Keep sending yours - your base *zaps* anything close.');
    // 5) Food Throw if the lineup has it
    await waitFor(() => sim.alliesOf(0).some((u) => u.hp < u.maxHp * 0.7) || sim.t > 50);
    const fslot = slotOf('foodThrow');
    if (fslot >= 0 && !sim.over) {
      sim.sides[0].energy = Math.max(sim.sides[0].energy, 4);
      this.view.focus(sim.frontAllyX(0), 5);
      this.noPush = true;
      await talk('Your Swarms are getting HANGRY! *Food Throw* heals them and makes them *BIGGER*. Tap it, then tap your troops!');
      this.noPush = false;
      this.lockInput = 'deploy' + fslot;
      await teach('foodThrow', 'Spell!', 'Tap here!', () => sim.frontAllyX(0));
      this.lockInput = null;
    }
    // 6) tap the base to upgrade it
    await waitFor(() => sim.t > 35 || sim.over);
    if (!sim.over) {
      sim.sides[0].energy = Math.max(sim.sides[0].energy, sim.overclockInfo(0).cost ?? 4);
      this.view.focus(sim.sides[0].labX + (engine.width < engine.height ? 3.5 : 6), 8);
      await wait(0.6);
      this.noPush = true;
      await talk('Now *UPGRADE YOUR BASE* with the big BASE button: more HP, a stronger zapper and *more POWER*!');
      this.noPush = false;
      this.lockInput = 'lab';
      remove = pointAt(() => this.hud.ocBtn, 'Upgrade!');
      await until('lab');
      clearPtr();
      this.lockInput = null;
      await wait(1.6);
    }
    // 7) Commander signature
    await waitFor(() => sim.sides[0].sig >= 1 || sim.t > 75 || sim.over);
    if (!sim.over) {
      sim.sides[0].sig = 1;
      await talk(`Your *ULTIMATE* is charged! It fills up from the *POWER* you make and from *damage to your base*. Tap the glowing *ULT* button for *${sim.sides[0].cmd?.signature?.name ?? 'your ULTIMATE'}*!`);
      this.lockInput = 'sig';
      remove = pointAt(this.hud.sig, 'Unleash!');
      await until('sig');
      clearPtr();
      this.lockInput = null;
      // let the full ULTIMATE cutscene play out first
      await waitFor(() => !sim.cinematic && !this.view.cine);
      await wait(1.6);
      await talk("Nice! Now smash my base!");
    }
    // the finish: no MEGA yet (those are earned on the Trophy Road)
    const jLab = sim.sides[1].lab;
    await waitFor(() => jLab.hp < jLab.maxHp * 0.5 || sim.t > 120 || sim.over);
    if (!sim.over) await talk('Almost there! Later you can earn *MEGA-TECH* figures on the *Trophy Road* - giant ultimate monsters. Now FINISH ME!');
  }

  /** Dialogue camera (dialogue.js): while a Commander talks (game paused), push in toward them. */
  dialogueFocus(who, on) {
    const v = this.view;
    const ch = who?.chibi;
    if (!v || !ch || !v.cmds?.includes(ch)) return;
    const tweenZoom = (to) => {
      const from = v.zoom;
      this.pushTw?.cancel();
      this.pushTw = animate(0.7, (e) => { v.zoom = from + (to - from) * e; }, { ease: 'inOutCubic' });
    };
    if (on && !this.noPush && this.pushZoom === undefined && !this.ended) {
      this.pushZoom = v.zoom;
      tweenZoom(Math.max(0.7, v.zoom * 0.74));
      v.focus(ch.root.position.x + (ch.side === 1 ? -1 : 1) * v.viewWidth() * 0.12, 99);
    } else if (!on && this.pushZoom !== undefined) {
      tweenZoom(this.pushZoom);
      this.pushZoom = undefined;
      v.manualT = Math.min(v.manualT, 0.8);
    }
  }

  /** Battle report for the result screen's BEAST NEWS summary (result.js reads it). */
  battleSummary() {
    const sim = this.sim;
    const sides = [0, 1].map((i) => {
      const s = sim.sides?.[i] ?? {};
      const c = this.cfg.sides[i] ?? {};
      return { name: c.name, commander: c.commander ?? null, trophies: c.trophies, stats: { ...(s.stats ?? {}) }, tier: s.overclock ?? 0 };
    });
    // MVP: the card that dealt the most damage (else the most deployed)
    let mvp = null;
    const dmg = this.cardDmg ?? {};
    for (const id in dmg) if (!mvp || dmg[id] > mvp.dmg) mvp = { id, dmg: Math.round(dmg[id]) };
    const by = sides[0].stats.deployById ?? {};
    if (!mvp) for (const id in by) if (!mvp || by[id] > mvp.count) mvp = { id, count: by[id] };
    if (mvp) mvp.count = by[mvp.id] ?? mvp.count ?? 0;
    return { time: sim.t ?? 0, sides, mvp, arena: arenaById(this.arenaId), mode: this.mode, megas: this.megasUsed ?? 0, baseUps: this.baseUps ?? 0 };
  }

  // -------------------------------------------------------------------------
  // End of battle

  async finish() {
    this.ended = true;
    const sim = this.sim;
    const res = sim.draw ? 'draw' : sim.winner === 0 ? 'win' : 'loss';
    const win = res === 'win';
    this.select(-1);
    this.cancelPending();
    this.hud.dragEnd();
    closeDialogue();
    this.tutCleanup && this.tutCleanup();
    this.lockInput = null;
    const labFell = !sim.sides[0].lab.alive || !sim.sides[1].lab.alive;
    if (labFell) {
      // a short clean beat (stamp + TV static over the crumble), then straight to the news
      this.hud.setVisible(false);
      finalBlow($overlay(), { win: !sim.sides[1].lab.alive });
      await wait(1.0);
    }
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
    this.cutToNews = labFell;
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
    if (this.mode === 'online') return this.onlineEnd(res, bases, names);
    const rewards = battleRewards({ result: res, margin: bases[0].frac, arenaId: this.arenaId, mode: this.mode, opponentTrophies: this.opponentTrophies ?? state.p.trophies, bossId: this.params.bossId });
    state.save();
    const again = this.mode === 'boss' ? 'RETRY' : this.mode === 'practice' ? 'AGAIN' : null;
    const btns = [{ id: 'ok', label: 'OK', color: 'blue' }];
    if (again) btns.unshift({ id: 'again', label: again, color: 'yellow', icon: 'swords' });
    const choice = await showResult($overlay(), { result: res, bases, names, rewards, mode: this.mode, buttons: btns, cut: this.cutToNews });
    if (choice === 'again') game.go('battle', this.mode === 'boss' ? { mode: 'boss', bossId: this.params.bossId } : { mode: this.mode, arena: this.arenaId });
    else game.go('home', { from: 'battle', rewards });
  }

  async tutorialEnd(win, bases, names) {
    const J = JIMMY();
    await showResult($overlay(), { result: win ? 'win' : 'loss', bases, names, rewards: null, mode: 'tutorial', buttons: [{ id: 'ok', label: 'OK', color: 'blue' }], cut: this.cutToNews });
    if (!win) {
      await say(J, "Oof! Happens to everyone. Let's run it back - drop a tanky Panther in front and ranged Swarms behind!");
      game.go('battle', { mode: 'tutorial' });
      return;
    }
    state.p.tutorial = 'briefcase';
    state.save();
    game.go('lab', { step: 'won' });
  }

  /** Online 1v1 over: normal ranked rewards (none for a cancelled or near-instant forfeit). */
  async onlineEnd(res, bases, names) {
    const sim = this.sim;
    // rewards need a real fight: a base destroyed, or 20+ seconds of battle (no farming instant forfeits)
    const quickForfeit = sim.t < 20 && sim.sides[0].lab.alive && sim.sides[1].lab.alive;
    const fair = !this.noContest && !quickForfeit;
    const rewards = fair ? battleRewards({ result: res, margin: bases[0].frac, arenaId: this.arenaId, mode: 'ranked', opponentTrophies: this.opponentTrophies ?? state.p.trophies }) : null;
    state.save();
    if (!fair) toast(this.noContest ? 'No contest: trophies unchanged.' : 'Your opponent left early: no trophies this time.', { icon: 'info' });
    // keep streaming the final state until the guest has it, then leave the match room
    setTimeout(() => { if (!this.dead && net.peer === this.peer) { net.clear(); lobby.endMatch(); } }, 6000);
    const btns = [{ id: 'again', label: 'PLAY AGAIN', color: 'yellow', icon: 'swords' }, { id: 'ok', label: 'OK', color: 'blue' }];
    const choice = await showResult($overlay(), { result: this.noContest ? 'draw' : res, bases, names, rewards, mode: rewards ? 'ranked' : 'friend', buttons: btns, cut: this.cutToNews });
    if (choice === 'again') (await import('../ui/home/online.js')).onlineIntent.next = 'search';
    game.go('home', { from: 'battle', rewards });
  }

  /** Online link health: a small chip while the opponent (or we) lag. */
  netStatus(st) {
    if (this.ended) return;
    if (!this.netChip) {
      this.netChip = h('div', { style: { position: 'absolute', zIndex: '45', left: '50%', top: 'calc(var(--u) * 17)', translate: '-50% 0', padding: '0.15em 0.7em', fontWeight: '700', fontSize: '0.85em', color: '#ffe9a0', background: 'rgba(10,6,30,0.85)', boxShadow: '0 0 0 var(--px) #120c24', pointerEvents: 'none' } });
      $overlay().appendChild(this.netChip);
    }
    const text = { lagging: 'Opponent connection unstable...', reconnecting: 'Reconnecting...' }[st];
    this.netChip.textContent = text ?? '';
    this.netChip.style.display = text ? '' : 'none';
  }

  async friendEnd(res, bases, names) {
    const host = this.params.role !== 'guest';
    const peer = this.peer;
    const btns = [{ id: 'ok', label: 'OK', color: 'blue' }];
    if (host && peer?.open) btns.unshift({ id: 'rematch', label: 'REMATCH', color: 'pink', icon: 'swords' });
    if (!host && peer) {
      this.offRematch = peer.on((msg) => {
        if (msg.t !== 'start') return;
        document.querySelector('.res-wrap, .cres')?.remove();
        game.go('battle', { mode: 'friend', role: 'guest', remote: msg.host, arena: msg.arena });
      });
    }
    const choice = await showResult($overlay(), { result: res, bases, names, rewards: null, mode: 'friend', buttons: btns, cut: this.cutToNews });
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
