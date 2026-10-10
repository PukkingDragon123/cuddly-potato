// Battle scene: wires the simulation, AI, 3D view and HUD together.
// Modes: tutorial (vs Jimmy), ranked (vs ghost player), practice, boss.
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { animate, wait } from '../core/tween.js';
import { h, icon, button, say, modal, bigBanner, pointAt, toast, $overlay, $ui, closeDialogue, floatText } from '../ui/ui.js';
import { swarmThumb, charPortrait } from '../ui/thumbs.js';
import { BattleSim, LAB_X } from '../game/battle/sim.js';
import { BattleAI } from '../game/battle/ai.js';
import { BattleView } from '../game/battle/view.js';
import { BattleHUD } from '../game/battle/hud.js';
import { state, deployInfo, perkBonuses, battleRewards, stat } from '../game/state.js';
import { SWARMS } from '../data/swarms.js';
import { SPELLS } from '../data/spells.js';
import { COMMANDERS } from '../data/commanders.js';
import { CHARACTERS } from '../data/characters.js';
import { CMD_SKINS, BANNERS } from '../data/season.js';
import { ARENAS, arenaById, BOSSES, ghostOpponent, currentArena } from '../data/arena.js';
import { VIALS } from '../data/vials.js';
import { game } from '../game/game.js';
import { net } from '../net/p2p.js';
import { HostSync, RemoteSim } from '../game/battle/netsync.js';
import { commanderCfg, playerSide } from '../game/battle/loadout.js';
import { fmt, clamp } from '../core/util.js';

const JIMMY = () => ({ name: 'Jimmy', color: '#29b6f6', portrait: charPortrait('jimmy', { eyes: 'happy', mouth: 'grin' }) });

export class BattleScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, engine.aspect, 0.1, 200);
    this.ended = false;
    this.ready = false;
    this.pointers = new Map();
  }

  async enter(params) {
    this.params = params;
    const mode = (this.mode = params.mode ?? 'ranked');
    const p = state.p;
    const me = playerSide();
    let enemy, theme = 'lab', arenaId = params.arena ?? currentArena(p.trophies).id, boss = null, aiOpts = {};
    if (mode === 'tutorial') {
      theme = 'mansion';
      arenaId = 'mansion';
      enemy = {
        name: 'Jimmy', deck: [{ id: 'panther', level: 1 }, { id: 'toiletRollRipper', level: 1 }], spells: [],
        commander: commanderCfg('jimmy', 1), perks: {}, labStyle: 'mansion', banner: 'goldBars', labHp: 1500,
      };
      me.labHp = 2400;
      aiOpts = { difficulty: 0.08, maxLab: 2, noSpells: true, sigDelay: 9999 };
    } else if (mode === 'boss') {
      const b = BOSSES[params.bossId];
      arenaId = b.arena;
      theme = arenaById(b.arena)?.theme ?? 'lab';
      enemy = {
        name: b.name, deck: b.deck.map((id) => ({ id, level: b.level })), spells: b.commander ? [{ id: 'moneyDrop', level: b.level }] : [],
        commander: b.commander ? commanderCfg(b.commander, Math.min(10, b.level)) : null, perks: {},
        labStyle: b.lab ?? 'rival', banner: 'bossSkull', boss: true,
      };
      if (b.boss) boss = { id: b.id, unit: b.boss, model: b.bossModel, scale: b.bossScale, hp: b.bossHp, dmg: b.bossDmg, level: b.level };
      aiOpts = { difficulty: 0.55 + b.level * 0.04 };
    } else if (mode === 'friend') {
      const ar = arenaById(params.arena) ?? ARENAS[0];
      arenaId = ar.id;
      enemy = { ...params.remote, ghost: false };
      this.opponentTrophies = enemy.trophies ?? 0;
    } else if (mode === 'practice') {
      enemy = {
        name: 'Training Dummy', deck: [{ id: 'panther', level: 1 }, { id: 'trashedCan', level: 1 }, { id: 'cloggedToilet', level: 1 }], spells: [],
        commander: null, perks: {}, labStyle: 'rival', banner: 'default',
      };
      aiOpts = { difficulty: 0.2, maxLab: 4 };
    } else {
      const g = params.opponent ?? ghostOpponent(p.trophies, Date.now(), arenaId);
      enemy = {
        name: g.name, deck: g.deck.map((id) => ({ id, level: g.level })), spells: g.spells.map((id) => ({ id, level: Math.max(1, g.level - 1) })),
        commander: commanderCfg(g.commander, g.cmdLevel), perks: {}, labStyle: ['rival', 'martLab', 'chocoLab', 'default'][g.name.length % 4],
        banner: g.banner, trophies: g.trophies, ghost: true,
      };
      this.opponentTrophies = g.trophies;
      aiOpts = { difficulty: g.difficulty };
    }
    if (mode !== 'tutorial') theme = arenaById(arenaId)?.theme ?? theme;
    const arena = arenaById(arenaId) ?? ARENAS[0];
    me.labHp = me.labHp ?? arena.labHp;
    enemy.labHp = enemy.labHp ?? arena.labHp * (mode === 'boss' ? 1.3 : 1);
    if (mode === 'boss' && enemy.labStyle === 'mart') theme = 'mart';
    this.arenaId = arenaId;
    this.cfg = { theme, sides: [me, enemy], boss };
    if (mode === 'friend') {
      me.labHp = enemy.labHp = arena.labHp;
      const peer = net.peer;
      this.peer = peer;
      if (params.role === 'guest') {
        this.sim = new RemoteSim({ sides: [me, enemy] }, peer);
      } else {
        this.sim = new BattleSim({ sides: [me, enemy], timeLimit: 150 });
        this.hostSync = peer ? new HostSync(this.sim, peer) : null;
      }
      this.ai = { update() {} };
      this.offClose = peer?.onClose(() => this.peerLost());
    } else {
      this.sim = new BattleSim({ sides: [me, enemy], boss, timeLimit: mode === 'tutorial' ? 600 : 150 });
      this.ai = new BattleAI(this.sim, 1, aiOpts);
    }
    this.view = new BattleView(this.sim, this.cfg);
    this.scene = this.view.scene;
    this.camera = this.view.camera;
    this.shakeScale = state.p.settings.shake ? 1 : 0;
    this.hud = new BattleHUD(this.sim, this.cfg, {
      deploy: (i) => this.tryDeploy(i),
      spell: (i) => this.toggleSpell(i),
      signature: () => this.trySignature(),
      skill: (k) => this.trySkill(k),
      upgradeLab: () => this.tryUpgrade(),
      pause: () => this.pauseMenu(),
    });
    this.sim.paused = true;
    if (params.dev) window.__battle = this;
    this.bindInput();
    audio.music(mode === 'boss' ? 'boss' : 'battle');
    if (engine.width < engine.height) setTimeout(() => toast('Tip: rotate your phone for the best battle view!', { icon: 'swarm' }), 2600);
    this.intro();
  }

  // -------------------------------------------------------------------------
  async intro() {
    const [me, en] = this.cfg.sides;
    const por = (cmd, fallback) => (cmd ? charPortrait(cmd.char ?? cmd.id, { override: cmd.override, size: 128 }) : fallback);
    const deckRow = (d) => h('div', { class: 'deckrow' }, d.deck.map((c) => h('img', { src: swarmThumb(c.id, c.variant, c.skin, 64) })));
    const side = (s, i) => h('div', { class: 'vs-side slide-up' },
      h('img', { class: 'por px-box', src: por(s.commander, swarmThumb(this.cfg.boss?.unit ?? s.deck[0].id, 'base', null, 128)) }),
      h('div', { class: 'bname outline-sm' + ((BANNERS[s.banner] || {}).animated ? ' anim-' + BANNERS[s.banner].animated : ''), style: { background: (BANNERS[s.banner] || BANNERS.default).css, fontSize: '1em' } }, s.name),
      s.trophies !== undefined ? h('div', { class: 'row' }, icon('trophy'), String(s.trophies)) : null,
      i === 1 && s.ghost ? h('div', { class: 'tiny muted' }, 'Ghost Player (AI-controlled)') : null,
      deckRow(s));
    const vs = h('div', { class: 'vs-screen fade-in' }, side(me, 0), h('div', { class: 'vs slam outline', style: { position: 'static', transform: 'none' } }, 'VS'), side(en, 1));
    $overlay().appendChild(vs);
    audio.play('whoosh');
    await wait(this.mode === 'tutorial' ? 1.4 : 1.8);
    vs.style.transition = 'opacity 0.3s';
    vs.style.opacity = '0';
    setTimeout(() => vs.remove(), 320);
    if (this.mode === 'tutorial') {
      this.ready = true;
      this.tutorial();
      return;
    }
    if (this.mode === 'friend') {
      if (this.params.role === 'guest') {
        // keep pinging until the host's snapshots arrive
        const iv = setInterval(() => {
          if (this.ended || this.sim.t > 0 || !this.peer?.open) clearInterval(iv);
          else this.peer.send({ t: 'ready' });
        }, 400);
      } else {
        toast('Waiting for your friend...', { icon: 'clock' });
        await new Promise((res) => {
          const off = this.peer?.on((m) => { if (m.t === 'ready') { off(); res(); } });
          setTimeout(res, 12000);
        });
      }
    }
    for (const n of ['3', '2', '1']) {
      bigBanner(n, '', { dur: 0.5 });
      audio.play('tick', { pitch: 0.5 });
      await wait(0.6);
    }
    bigBanner(this.mode === 'boss' ? 'BOSS FIGHT!' : 'FIGHT!', '', { dur: 0.8, color: '#ffd23f' });
    audio.play('bell');
    if (!(this.mode === 'friend' && this.params.role === 'guest')) this.sim.paused = false;
    this.ready = true;
  }

  // -------------------------------------------------------------------------
  // Player actions
  tryDeploy(i) {
    if (!this.ready || this.ended || this.sim.paused) return;
    if (this.lockInput && this.lockInput !== 'deploy' + i && this.lockInput !== 'deploy') return;
    const s = this.sim.sides[0];
    if (!s.deck[i]) return;
    if (this.sim.deploy(0, i)) {
      audio.play('pop', { pitch: 1.1 });
      this.onTut && this.onTut('deploy', i);
    } else {
      audio.play('deny');
      const card = this.hud.cards[i]?.el;
      if (card) {
        card.classList.remove('shake-x');
        void card.offsetWidth;
        card.classList.add('shake-x');
      }
      if (s.energy < this.sim.cardCost(0, i)) toast('Not enough energy!', { icon: 'energy' });
    }
  }
  toggleSpell(i) {
    if (!this.ready || this.ended || this.sim.paused) return;
    if (this.lockInput && this.lockInput !== 'spell') return;
    if (!this.sim.sides[0].spells[i]) return;
    if (this.hud.aiming === i) {
      this.hud.setAiming(null);
      this.view.setAim(null);
      return;
    }
    if (!this.sim.canCast(0, i)) {
      audio.play('deny');
      toast(this.sim.sides[0].spellCds[i] > 0 ? 'Spell recharging...' : 'Not enough energy!', { icon: 'energy' });
      return;
    }
    audio.play('magic', { pitch: 1.4 });
    this.hud.setAiming(i);
    this.view.setAim(this.sim.sides[0].spells[i].id, this.view.camX);
    this.aimX = this.view.camX;
  }
  castAt(x) {
    const i = this.hud.aiming;
    if (i === null) return;
    const ok = this.sim.castSpell(0, i, x);
    this.hud.setAiming(null);
    this.view.setAim(null);
    if (ok) this.onTut && this.onTut('spell', i);
    else audio.play('deny');
  }
  trySignature() {
    if (!this.ready || this.ended || this.sim.paused) return;
    if (this.lockInput && this.lockInput !== 'sig') return;
    if (this.sim.useSignature(0)) {
      audio.play('levelUp');
      bigBanner(this.sim.sides[0].cmd.signature.name.toUpperCase() + '!', '', { dur: 1.1, color: '#ff2e88' });
      this.onTut && this.onTut('sig');
    } else {
      audio.play('deny');
      toast('Commander still charging...', { icon: 'star' });
    }
  }
  trySkill(k) {
    if (!this.ready || this.ended || this.sim.paused || this.lockInput) return;
    const sk = this.sim.sides[0].skills[k];
    if (this.sim.useSkill(0, k)) {
      audio.play('magic');
      bigBanner(sk.name.toUpperCase() + '!', '', { dur: 1, color: '#5fdc4a' });
    } else audio.play('deny');
  }
  tryUpgrade() {
    if (!this.ready || this.ended || this.sim.paused) return;
    if (this.lockInput && this.lockInput !== 'lab') return;
    if (this.sim.upgradeLab(0)) {
      this.onTut && this.onTut('lab');
    } else {
      audio.play('deny');
      const s = this.sim.sides[0];
      if (s.labLevel >= 8) toast('Lab is at MAX level!', { icon: 'flask' });
      else toast('Need more energy to upgrade!', { icon: 'energy' });
    }
  }

  pauseMenu() {
    if (this.ended || this.pauseOpen) return;
    const online = this.mode === 'friend';
    const wasPaused = this.sim.paused;
    if (!online) this.sim.paused = true;
    this.pauseOpen = true;
    const m = modal({
      title: 'PAUSED', size: 'narrow', color: 'purple',
      body: h('div', { class: 'col center' },
        h('div', { class: 'muted small' }, 'Tip: tap your Lab to upgrade energy production. Keys: 1-6 deploy, Q/W spells, Space signature, U upgrade.'),
        button('Resume', () => m.close(), 'green big'),
        button(state.p.settings.muted ? 'Sound: OFF' : 'Sound: ON', (e) => {
          state.p.settings.muted = !state.p.settings.muted;
          audio.setMuted(state.p.settings.muted);
          state.save();
          e.currentTarget.querySelector('span').textContent = state.p.settings.muted ? 'Sound: OFF' : 'Sound: ON';
        }, 'blue'),
        this.mode !== 'tutorial' ? button('Surrender', () => { m.close(); this.sim.end(1); }, 'red') : null),
      onClose: () => {
        this.pauseOpen = false;
        if (!wasPaused && !online) this.sim.paused = false;
      },
    });
  }

  // -------------------------------------------------------------------------
  bindInput() {
    const c = engine.canvas;
    const groundX = (e) => {
      const p = engine.rayToPlane(e.clientX, e.clientY, 0, this.camera);
      return p ? p.x : this.view.camX;
    };
    this.onDown = (e) => {
      audio.unlock();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = Math.hypot(a.x - b.x, a.y - b.y);
      }
      if (this.hud.aiming !== null) {
        this.aimX = groundX(e);
        this.view.setAim(this.sim.sides[0].spells[this.hud.aiming].id, this.aimX);
      }
    };
    this.onMove = (e) => {
      const pt = this.pointers.get(e.pointerId);
      if (this.hud.aiming !== null) {
        this.aimX = groundX(e);
        this.view.setAim(this.sim.sides[0].spells[this.hud.aiming].id, this.aimX);
        if (pt) { pt.x = e.clientX; pt.y = e.clientY; }
        return;
      }
      if (!pt) return;
      if (this.pointers.size === 2) {
        pt.x = e.clientX;
        pt.y = e.clientY;
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinch) this.view.zoomBy(this.pinch / d);
        this.pinch = d;
        return;
      }
      const dx = e.clientX - pt.x;
      pt.x = e.clientX;
      pt.y = e.clientY;
      if (Math.abs(pt.x - pt.sx) > 6) this.view.pan(dx);
    };
    this.onUp = (e) => {
      const pt = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!pt) return;
      const moved = Math.hypot(e.clientX - pt.sx, e.clientY - pt.sy);
      if (this.hud.aiming !== null) {
        if (moved < 30 || performance.now() - pt.t < 600) this.castAt(this.aimX);
        return;
      }
      if (moved < 10) {
        // tap: lab?
        const hits = engine.raycast(e.clientX, e.clientY, [this.view.labs[0].root], this.camera);
        if (hits.length) this.tryUpgrade();
      }
    };
    this.onWheel = (e) => this.view.zoomBy(e.deltaY > 0 ? 1.08 : 0.92);
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    c.addEventListener('wheel', this.onWheel, { passive: true });
  }

  exit() {
    this.dead = true;
    const c = engine.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    c.removeEventListener('wheel', this.onWheel);
    this.hud?.destroy();
    this.view?.dispose();
    this.tutCleanup && this.tutCleanup();
    this.hostSync?.dispose();
    this.sim?.dispose?.();
    this.offClose && this.offClose();
    this.offRematch && this.offRematch();
    engine.timeScale = 1;
  }

  peerLost() {
    if (this.ended) return;
    toast('Your friend disconnected - you win by forfeit!', { icon: 'trophy' });
    if (this.sim instanceof RemoteSim) {
      this.sim.over = true;
      this.sim.winner = 0;
    } else this.sim.end(0);
  }

  resize(w, hh) {
    this.view?.resize(w, hh);
  }

  update(dt, gdt) {
    if (!this.sim) return;
    if (!this.sim.paused) this.ai.update(gdt);
    this.sim.update(gdt);
    this.hostSync && this.hostSync.update(dt);
    this.view.update(dt, this.sim.paused && !this.sim.over ? 0 : gdt);
    this.hud.update();
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
        if (fn(dt)) {
          this.tutTick = prev;
          res();
        }
      };
    });
    const talk = async (text, opts) => {
      if (this.dead) return new Promise(() => {});
      sim.paused = true;
      await say({ ...J, chibi: ch }, text, opts);
      sim.paused = false;
    };
    this.view.focus(-8, 6);
    if (ch) { ch.expr('happy', 'grin', 3); }
    await talk("Welcome to my *Mansion Lab*! Your Lab is on the LEFT, mine's on the RIGHT. First to destroy the other's Lab wins!");
    await talk('Your Swarms walk forward and fight *automatically*. Tap the *Panther* card to summon one!');
    this.lockInput = 'deploy0';
    sim.sides[0].energy = Math.max(sim.sides[0].energy, 60);
    remove = pointAt(this.hud.cards[0].el, 'Tap!');
    sim.paused = false;
    await new Promise((res) => (this.onTut = (k, i) => k === 'deploy' && res()));
    clearPtr();
    this.lockInput = null;
    await wait(1.5);
    await talk('Nice! Every summon costs *energy* ⚡, which refills over time. Now add a *Clogged Toilet* - it shoots from range!');
    sim.sides[0].energy = Math.max(sim.sides[0].energy, sim.cardCost(0, 1));
    sim.sides[0].cds[1] = 0;
    this.lockInput = 'deploy1';
    remove = pointAt(this.hud.cards[1].el, 'Ranged!');
    await new Promise((res) => (this.onTut = (k, i) => k === 'deploy' && i === 1 && res()));
    clearPtr();
    this.lockInput = null;
    // Lab upgrade
    await waitFor(() => sim.sides[0].energy >= 70 || sim.t > 30);
    sim.sides[0].energy = Math.max(sim.sides[0].energy, 70);
    await talk('Pro tip: tap your *LAB* to upgrade it! A higher Lab level makes energy faster and holds more. Spend wisely: troops OR upgrades!');
    this.lockInput = 'lab';
    remove = pointAt(this.hud.labBtn, 'Upgrade!');
    const labPtr = pointAt(this.view.labs[0].core, '');
    await new Promise((res) => (this.onTut = (k) => k === 'lab' && res()));
    labPtr();
    clearPtr();
    this.lockInput = null;
    // Food Throw
    await waitFor(() => sim.alliesOf(0).some((u) => u.hp < u.maxHp * 0.75) || sim.t > 45);
    if (sim.sides[0].spells.length) {
      sim.sides[0].energy = Math.max(sim.sides[0].energy, 140);
      sim.sides[0].spellCds[0] = 0;
      const front = sim.frontAllyX(0);
      this.view.focus(front, 4);
      await talk('Your Swarms are getting HANGRY! Use *Food Throw*: tap the spell, then tap near your troops. They heal and get *BIGGER*!');
      this.lockInput = 'spell';
      remove = pointAt(this.hud.spells[0].el, 'Spell!');
      await new Promise((res) => (this.onTut = (k) => k === 'spell' && res()));
      clearPtr();
      this.lockInput = null;
    }
    // Signature
    await waitFor(() => sim.sides[0].sig >= 1 || sim.t > 70);
    sim.sides[0].sig = 1;
    await talk("Your Commander is fully charged - that's YOU sitting on your Lab! Tap your portrait to unleash *Beaker Barrage*!");
    this.lockInput = 'sig';
    remove = pointAt(this.hud.sig.el, 'Unleash!');
    await new Promise((res) => (this.onTut = (k) => k === 'sig' && res()));
    clearPtr();
    this.lockInput = null;
    this.onTut = null;
    await wait(2);
    await talk("Okay okay, not bad! Now let's see if you can actually smash my Lab. I'm not going easy! (I'm going a little easy.)");
    // Jimmy shows off his giveaway when hurt
    await waitFor(() => sim.sides[1].labHp < sim.sides[1].labMaxHp * 0.55 || sim.over);
    if (!sim.over) {
      sim.sides[1].sig = 1;
      sim.useSignature(1);
      await wait(1.6);
      if (!sim.over) await talk("Ha! My *Mega Giveaway* distracts your Swarms with cash! Don't worry, Commanders recharge. Keep pushing!");
    }
  }

  // -------------------------------------------------------------------------
  async finish() {
    this.ended = true;
    const sim = this.sim;
    const win = sim.winner === 0;
    this.hud.setAiming(null);
    this.view.setAim(null);
    this.hud.hide();
    closeDialogue();
    this.tutCleanup && this.tutCleanup();
    audio.stopMusic();
    await this.view.labDestroyed(win ? 1 : 0);
    this.view.celebrate(sim.winner);
    audio.jingle(win ? 'victory' : 'defeat');
    if (win) audio.play('cheer');
    bigBanner(win ? 'VICTORY!' : 'DEFEAT', win ? 'Lab destroyed!' : 'Your Lab fell...', { dur: 2, color: win ? '#ffd23f' : '#ff4a4a' });
    // record stats
    const st = sim.sides[0].stats;
    stat('deployed', st.deployed);
    for (const id in st.deployById) stat('deploy_' + id, st.deployById[id]);
    stat('deployFood', st.food);
    stat('signatures', st.sigs);
    for (const k in st) if (k.startsWith('cast_')) stat('cast' + k.slice(5), st[k]);
    if (this.view.cartsSmashed) stat('cartsSmashed', this.view.cartsSmashed);
    state.save();
    await wait(2.2);
    if (this.mode === 'tutorial') return this.tutorialEnd(win);
    if (this.mode === 'friend') return this.friendResults(win);
    const res = battleRewards({ win, arenaId: this.arenaId, mode: this.mode === 'practice' ? 'practice' : this.mode, opponentTrophies: this.opponentTrophies ?? state.p.trophies, bossId: this.params.bossId });
    this.showResults(win, res);
  }

  async tutorialEnd(win) {
    const J = JIMMY();
    if (!win) {
      await say(J, "Oof! Happens to everyone. Let's run it back - remember to upgrade your Lab and use Food Throw!");
      game.go('battle', { mode: 'tutorial' });
      return;
    }
    await say({ ...J, portrait: charPortrait('jimmy', { eyes: 'shock', mouth: 'open' }) }, "NO WAY! You actually destroyed my Mansion Lab?! That's it... you've earned something SPECIAL.");
    state.p.tutorial = 'briefcase';
    state.save();
    game.go('lab', { tutorial: 'briefcase' });
  }

  friendResults(win) {
    const host = this.params.role !== 'guest';
    const peer = this.peer;
    const status = h('div', { class: 'small muted' }, peer?.open ? (host ? 'Play again?' : 'Waiting for the host to start a rematch...') : 'Connection closed.');
    const body = h('div', { class: 'result-panel' },
      h('div', { class: 'display big ' + (win ? 'gold' : 'redt') }, win ? 'VICTORY!' : 'DEFEAT'),
      h('div', { class: 'small' }, `Friendly battle vs ${this.cfg.sides[1].name}`),
      status);
    const foot = [button('Lab', () => { m.close(); net.clear(); game.go('lab'); }, 'blue', { icon: 'flask' })];
    if (host && peer?.open) {
      foot.push(button('Rematch', () => {
        m.close();
        const me = this.cfg.sides[0];
        peer.send({ t: 'start', host: me, guest: this.params.remote, arena: this.arenaId });
        game.go('battle', { mode: 'friend', role: 'host', remote: this.params.remote, arena: this.arenaId });
      }, 'pink', { icon: 'sword' }));
    }
    const m = modal({ title: 'FRIEND BATTLE', color: win ? 'yellow' : 'purple', size: 'narrow', closable: false, body, foot });
    if (!host && peer) {
      this.offRematch = peer.on((msg) => {
        if (msg.t !== 'start') return;
        m.close();
        game.go('battle', { mode: 'friend', role: 'guest', remote: msg.host, arena: msg.arena });
      });
    }
  }

  showResults(win, res) {
    const p = state.p;
    const rows = [];
    const row = (ic, label, val, cls = '') => h('div', { class: 'result-row px-box light bounce-in ' + cls }, icon(ic), h('div', { class: 'v outline-sm' }, val), h('div', { class: 'tiny muted' }, label));
    if (res.trophies) rows.push(row('trophy', 'Trophies', (res.trophies > 0 ? '+' : '') + res.trophies, res.trophies > 0 ? 'gold' : 'redt'));
    rows.push(row('coin', 'Beast Coins', '+' + res.coins));
    rows.push(row('calorie', 'Calories', '+' + res.calories));
    if (res.cmdXp) rows.push(row('crown', 'Commander XP', '+' + res.cmdXp));
    if (res.vial) rows.push(row('vial', VIALS[res.vial].name, 'NEW!', 'pinkt'));
    rows.forEach((r, i) => (r.style.animationDelay = i * 0.12 + 's'));
    const extra = [];
    if (win && !res.vial && this.mode !== 'boss') extra.push(h('div', { class: 'small muted' }, 'Vial slots full! Open some vials to earn more.'));
    if (res.passTiers > 0) extra.push(h('div', { class: 'gold small' }, `FOOD SEASON tier up! +${res.passTiers} tier${res.passTiers > 1 ? 's' : ''} - claim rewards in the Pass.`));
    for (const lu of res.levelUps) extra.push(h('div', { class: 'greent small' }, `Commander reached level ${lu.level}! ${lu.reward?.text ?? ''}`));
    if (res.bossResult) {
      extra.push(h('div', { class: 'gold' }, res.bossResult.first ? 'BOSS DEFEATED! First-time rewards:' : 'Boss defeated again!'));
      for (const r of res.bossResult.rewards) extra.push(h('div', { class: 'row small center' }, icon(r.icon), r.label));
    }
    const body = h('div', { class: 'result-panel' },
      h('div', { class: 'display big ' + (win ? 'gold' : 'redt') }, win ? 'VICTORY!' : 'DEFEAT'),
      h('div', { class: 'row small muted' }, icon('trophy'), `${p.trophies} trophies`),
      h('div', { class: 'result-rows' }, rows),
      extra);
    if (win) audio.play('chaching');
    const again = this.mode === 'boss' ? 'Retry Boss' : this.mode === 'practice' ? 'Practice Again' : 'Battle Again';
    const m = modal({
      title: win ? 'BATTLE WON' : 'BATTLE LOST', color: win ? 'yellow' : 'purple', size: 'mid', closable: false, body,
      foot: [
        button('Lab', () => { m.close(); game.go('lab'); }, 'blue', { icon: 'flask' }),
        button('Arena', () => { m.close(); game.go('arena', { from: 'battle' }); }, 'green', { icon: 'pin' }),
        button(again, () => {
          m.close();
          game.go('battle', this.mode === 'boss' ? { mode: 'boss', bossId: this.params.bossId } : { mode: this.mode, arena: this.mode === 'ranked' ? undefined : this.arenaId });
        }, 'pink', { icon: 'sword' }),
      ],
    });
  }
}
