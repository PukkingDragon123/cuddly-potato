// Home lobby: the living 3D Beast Island (every arena is a diorama on the
// trophy road) with the Clash Royale home UI on top — profile + currencies,
// free / crown vials, the arena banner (swipe or arrows fly between the
// island's zones), the BATTLE button, boss challenges, 4 vial slots and the
// bottom nav whose tabs (Shop, Cards, Lab, Pass) slide over the island.
// NPC quests, boss gates and secrets live on the island; the arena-unlock
// cinematic flies up the trophy road when the player reaches a new arena.
// Motion: staggered spring entrances, press squash / release overshoot /
// hover lift on every tappable, a sliding nav indicator, carousel tab
// transitions and rolling currency counters (see homeMotion.js).
import * as THREE from 'three';
import './home.css';
import './home-mega.css';
import './home-motion.css';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { h, icon, animIcon, iconURL, button, pill, bar, modal, toast, bigBanner, say, pointAt, bump, burst, rollNumber, $ui, $overlay, speech, ribbon } from '../ui/ui.js';
import { charPortrait, swarmThumb } from '../ui/thumbs.js';
import { cardEl } from '../ui/cards.js';
import * as M from './homeMotion.js';
import { createSwarm } from '../models/swarmModels.js';
import { Chibi } from '../core/chibi.js';
import { CHARACTERS } from '../data/characters.js';
import { ARENAS, currentArena, bossOfArena, QUEST_NPC_ZONE, SECRETS } from '../data/arenas.js';
import { VIALS, skipPrice } from '../data/vials.js';
import { cardsOfArena, isSpell } from '../data/cards.js';
import { MEGAS, MEGA_IDS } from '../data/megas.js';
import { SWARMS } from '../data/swarms.js';
import {
  state, labXpInfo, vialTimeLeft, isUnlocking, startUnlock, vialReady, skipVial, takeVial, freeVialStatus, claimFreeVial,
  equipMega, pendingArenaUnlock, markArenaSeen, currentDeck, deployInfo, findSecret, questState, acceptQuest, completeQuest,
} from '../game/state.js';
import { game } from '../game/game.js';
import { ONLINE_ENABLED } from '../ui/home/friend.js';

const TABS = [
  { id: 'shop', label: 'SHOP', icon: 'shop' },
  { id: 'cards', label: 'CARDS', icon: 'cards' },
  { id: 'battle', label: 'BATTLE', icon: 'swords' },
  { id: 'lab', label: 'LAB', icon: 'lab' },
  { id: 'pass', label: 'PASS', icon: 'calorie' },
];
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const fmtTime = (sec) => {
  sec = Math.max(0, Math.ceil(sec));
  if (sec >= 3600) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  if (sec >= 60) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${sec}s`;
};
const fmtN = (n) => Math.round(n).toLocaleString('en-US');
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const NPC_OF_ZONE = Object.fromEntries(Object.entries(QUEST_NPC_ZONE).map(([npc, z]) => [z, npc]));
const ZONE_EXTRAS = { circle: 'fan', factory: 'labTech', redlight: 'guard', antarctica: 'labTech', reactor: 'labTech', pyramid: 'fan', island: 'fan', jungle: 'fan', laser: 'guard', haunted: 'fan', reef: 'fan', volcano: 'labTech', space: 'labTech' };

// vial thumbnails come from the vial module (rendered 3D); fall back to the pixel icon
// screens are code-split: each tab / modal loads on first use
const MODULES = {
  '../ui/vialThumb.js': () => import('../ui/vialThumb.js'),
  '../ui/home/badges.js': () => import('../ui/home/badges.js'),
  '../ui/home/shop.js': () => import('../ui/home/shop.js'),
  '../ui/home/cards.js': () => import('../ui/home/cards.js'),
  '../ui/home/lab.js': () => import('../ui/home/lab.js'),
  '../ui/home/pass.js': () => import('../ui/home/pass.js'),
  '../ui/home/cardInfo.js': () => import('../ui/home/cardInfo.js'),
  '../ui/home/trophyRoad.js': () => import('../ui/home/trophyRoad.js'),
  '../ui/home/profile.js': () => import('../ui/home/profile.js'),
  '../ui/home/settings.js': () => import('../ui/home/settings.js'),
  '../ui/home/friend.js': () => import('../ui/home/friend.js'),
  '../ui/home/online.js': () => import('../ui/home/online.js'),
  '../ui/home/boss.js': () => import('../ui/home/boss.js'),
};
const loadOpt = (path) => (MODULES[path] ? MODULES[path]() : Promise.reject(new Error('missing ' + path)));
let vialThumbFn = null;
loadOpt('../ui/vialThumb.js').then((m) => (vialThumbFn = m.vialThumb)).catch(() => {});
function vialImg(type, cls = 'vt') {
  if (vialThumbFn) {
    try { return h('img', { class: cls, src: vialThumbFn(type, 160), draggable: 'false' }); } catch (e) { /* fall through */ }
  }
  return h('img', { class: cls + ' pi', src: iconURL('vial'), draggable: 'false' });
}

const _camOff = new THREE.Vector3(), _camLook = new THREE.Vector3(), _yAxis = new THREE.Vector3(0, 1, 0), _tagV = new THREE.Vector3();
// what the counters showed when the lobby was last on screen: coming back from a
// battle / the shop rolls them up to the new values instead of snapping
const shown = { coins: null, bucks: null, trophies: null };

export class HomeScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, engine.aspect, 0.5, 3000);
    this.t = 0;
    this.tab = 'battle';
    this.cam = { pos: new THREE.Vector3(0, 80, 120), look: new THREE.Vector3() };
    this.fly = null;
    this.actors = [];
    this.pickables = [];
    this.tags = [];
  }

  // -------------------------------------------------------------------------
  async enter(params = {}) {
    this.params = params;
    const p = state.p;
    if (p.tutorial !== 'done' && p.tutorial !== 'home') {
      // the first-time flow lives in the title scene (once the router is free again)
      this.redirect = true;
      this.showT = setTimeout(() => this.shown(), 1500);
      return;
    }
    const best = currentArena(p.bestTrophies).index;
    if (params.skipUnlock) markArenaSeen(best); // dev: ?scene=home&skipUnlock=1
    const pending = pendingArenaUnlock();
    this.unlockTarget = pending ? pending.index : -1;
    this.zoneIdx = pending ? Math.max(0, pending.index - 1) : Math.min(best, params.zone ?? best);
    await this.buildIsland();
    this.placeZone(this.zoneIdx, true);

    this.buildUI();
    if (params.tab) this.setTab(params.tab, true); // e.g. back from a shop entrance preview
    this.offState = state.on(() => this.refresh());
    this.bindInput();
    audio.music('map');
    if (params.dev) window.__home = this;
    // the lobby waits behind the loading screen; game.go calls shown() once it has faded
    this.pending = pending;
    this.root.classList.add('hm-pre');
    this.showT = setTimeout(() => this.shown(), 3000);
  }

  /** Called by the router when the loading screen is gone: entrance, unlock cinematic, tutorial. */
  shown() {
    if (this.wasShown || this.exited) return;
    if (this.redirect) { this.wasShown = true; clearTimeout(this.showT); game.go('title', {}); return; }
    if (!this.root) return;
    this.wasShown = true;
    clearTimeout(this.showT);
    // the unlock cinematic flies over a bare island; the lobby springs in when it ends
    if (this.pending) this.root.style.visibility = 'hidden';
    this.root.classList.remove('hm-pre');
    if (this.pending) setTimeout(() => this.unlockCinematic(this.pending), 450);
    else {
      this.intro();
      this.afterEnter();
    }
  }

  async afterEnter() {
    const p = state.p;
    if (p.tutorial === 'home') {
      p.tutorial = 'done';
      state.save();
      await wait(1.0);
      const J = { name: 'Jimmy', color: '#2b8cf2', portrait: charPortrait('jimmy', { eyes: 'happy', mouth: 'grin' }) };
      await say(J, 'Welcome to *BEAST ISLAND*! Every arena on this island is from one of my videos. Win battles to earn *trophies* and climb the road to the top!');
      await say(J, 'Battles also win you *vials* full of Swarms. Upgrade your cards in the *CARDS* tab and build your best deck. Now go get some trophies!');
      const off = pointAt(this.battleBtn, 'Battle!');
      this.tutPtr = off;
    }
  }

  // -------------------------------------------------------------------------
  // Beast Island

  /** Build the Beast Island: sky, lights, padlocks, NPCs, bosses, secrets, your squad. */
  async buildIsland() {
    const { makeBeastIsland } = await import('../models/island/beastIsland.js');
    const I = await makeBeastIsland({ log: false });
    const sc = this.scene;
    sc.add(I.root);
    sc.background = I.sky;
    sc.fog = new THREE.Fog(I.fog.color, I.fog.near, I.fog.far);
    const L = I.lights;
    const { sun } = addLights(sc, { sky: L.sky, ground: L.ground, hemi: L.hemi, sun: L.sun, sunColor: L.sunColor, dir: L.dir, rimIntensity: L.rim, rimColor: L.rimColor, shadowExtent: 30, shadowFar: 400 });
    this.sun = sun;
    this.sunDir = new THREE.Vector3(...L.dir).normalize();
    // arenas above the player's best are locked behind padlocks
    const best = currentArena(state.p.bestTrophies).index;
    for (const z of I.zones) if (z.index > best || (this.unlockTarget >= 0 && z.index >= this.unlockTarget)) I.setLocked(z.id, true);
    this.I = I;
    this.populate();
    return I;
  }

  // -------------------------------------------------------------------------
  // 3D: camera framing, actors, hotspots

  zoneCam(k) {
    const Z = this.I.zones[k];
    const off = Z.camPos.clone().sub(Z.camLook);
    const a = this.camera.aspect;
    off.multiplyScalar(a < 1 ? Math.min(2.1, 0.98 / a) : a < 1.4 ? 1.2 : 1);
    const look = Z.camLook.clone();
    // keep the diorama above the bottom dock in portrait
    if (a < 1) look.y -= off.length() * 0.06;
    return { pos: Z.camLook.clone().add(off), look };
  }
  placeZone(k, snap = false, dur = 1.6) {
    const c = this.zoneCam(k);
    this.zoneIdx = k;
    if (snap) {
      this.cam.pos.copy(c.pos);
      this.cam.look.copy(c.look);
      this.fly = null;
    } else {
      if (this.fly?.done) this.fly.done();
      let done;
      this.flyDone = new Promise((r) => (done = r));
      this.fly = { from: { pos: this.cam.pos.clone(), look: this.cam.look.clone() }, to: c, t: 0, dur, done };
      audio.play('whoosh', { pitch: 0.8 });
    }
    this.fitShadow(c.look);
  }
  fitShadow(target) {
    const s = this.sun;
    s.target.position.copy(target);
    s.position.copy(target).addScaledVector(this.sunDir, 160);
    const sc = s.shadow.camera;
    const ext = 34;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.near = 1; sc.far = 400;
    sc.updateProjectionMatrix();
    s.target.updateMatrixWorld();
  }
  hotspotPos(Z, name) {
    const o = Z.hotspots?.[name];
    if (!o) return null;
    o.updateWorldMatrix(true, false);
    return new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);
  }

  /** NPCs, boss gates, secret sparkles and your deck's Swarms roaming the zones. */
  populate() {
    const p = state.p;
    const best = currentArena(p.bestTrophies).index;
    for (const Z of this.I.zones) {
      if (Z.index > best) continue;
      const ground = (v) => v.setY(Math.max(v.y, this.I.heightAt(v.x, v.z)));
      // quest NPC or a crowd extra
      const npcId = NPC_OF_ZONE[Z.id] ?? ZONE_EXTRAS[Z.id];
      const np = this.hotspotPos(Z, 'npc');
      if (npcId && CHARACTERS[npcId] && np) {
        const c = new Chibi(CHARACTERS[npcId], { scale: 1.6 });
        c.root.position.copy(np);
        c.root.lookAt(Z.camPos.x, np.y, Z.camPos.z);
        c.play('idle');
        this.scene.add(c.root);
        const quest = !!NPC_OF_ZONE[Z.id] && npcId !== 'jimmy' ? npcId : null;
        this.actors.push({ kind: 'npc', obj: c, update: (dt) => c.update(dt), zone: Z });
        this.addPick(c.root, () => this.talkNpc(npcId, c, quest), { label: CHARACTERS[npcId].name ?? npcId, cls: quest ? 'quest' : '', iconName: quest ? 'quest' : 'smile', h: 3.2, zone: Z });
      }
      // boss gate
      const boss = bossOfArena(Z.id);
      const bp = this.hotspotPos(Z, 'boss');
      if (boss && bp && boss.boss) {
        const rig = createSwarm(boss.boss, { model: boss.bossModel, scale: 1.7 });
        rig.root.position.copy(bp);
        rig.root.lookAt(Z.camPos.x, bp.y, Z.camPos.z);
        rig.setState('idle');
        this.scene.add(rig.root);
        // pixel-art boss sigil on the ground (a spiked diamond with a skull, not a plain ring)
        const ring = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bossSigilTex(), color: 0xff4fa3, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
        ring.position.copy(bp).setY(bp.y + 0.06);
        this.scene.add(ring);
        this.actors.push({ kind: 'boss', obj: rig, update: (dt) => { rig.update(dt); ring.material.opacity = 0.6 + Math.sin(this.t * 3) * 0.25; ring.scale.setScalar(1 + Math.sin(this.t * 3) * 0.03); }, zone: Z });
        const defeated = !!p.bosses?.[boss.id];
        this.addPick(rig.root, () => this.openBoss(boss.id), { label: boss.name, cls: `boss ${defeated ? 'beaten' : ''}`, iconName: defeated ? 'check' : 'skull', h: rig.height + 0.6, zone: Z });
      }
      // secrets hidden in this zone (sparkle until found)
      for (const [sid, s] of Object.entries(SECRETS)) {
        if (s.zone !== Z.id || p.secrets?.[sid]) continue;
        const sp = this.hotspotPos(Z, sid);
        if (!sp) continue;
        const o = new THREE.Object3D();
        o.position.copy(sp);
        this.scene.add(o);
        const st = { found: false };
        this.actors.push({ kind: 'secret', obj: o, update: () => { if (!st.found && Math.random() < 0.08) fx.sparkle(sp, { count: 1, colors: [0xffd84a, 0xffffff], speed: 0.6, radius: 0.6 }); }, zone: Z });
        this.addPick(o, () => { if (!st.found) { st.found = true; this.secretFound(sid, sp); } }, { label: '?', cls: 'secret', iconName: 'star', h: 0.6, zone: Z, radius: 1.6 });
      }
      // deck Swarms hanging out on your current arena
      if (Z.index === best) this.spawnSquad(Z);
    }
  }

  spawnSquad(Z) {
    const ids = currentDeck().filter((id) => !isSpell(id)).slice(0, 4);
    const center = Z.focus.clone();
    const toCam = Z.camPos.clone().sub(Z.camLook).setY(0).normalize();
    const side = new THREE.Vector3(-toCam.z, 0, toCam.x);
    ids.forEach((id, i) => {
      const d = deployInfo(id);
      const rig = createSwarm(d.unit ?? id, { variant: d.variant, skin: d.skin, scale: 2.2 * (SWARMS[d.unit ?? id]?.size ?? 1) });
      const home = center.clone().addScaledVector(toCam, 4.5 + (i % 2) * 1.2).addScaledVector(side, (i - (ids.length - 1) / 2) * 2.6);
      home.y = Math.max(Z.center.y, this.I.heightAt(home.x, home.z));
      rig.root.position.copy(home);
      this.scene.add(rig.root);
      const a = { kind: 'swarm', obj: rig, home, target: home.clone(), wait: Math.random() * 3, zone: Z, id };
      a.update = (dt) => {
        const pos = rig.root.position;
        a.wait -= dt;
        if (a.wait <= 0) {
          a.wait = 2.5 + Math.random() * 4;
          if (Math.random() < 0.3) { rig.attack(0.5); a.target.copy(pos); }
          else a.target.copy(a.home).addScaledVector(side, (Math.random() - 0.5) * 3).addScaledVector(toCam, (Math.random() - 0.5) * 2);
        }
        const dx = a.target.x - pos.x, dz = a.target.z - pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.1) {
          const sp = Math.min(dist, dt * 1.6);
          pos.x += (dx / dist) * sp;
          pos.z += (dz / dist) * sp;
          const yaw = Math.atan2(dx, dz);
          rig.root.rotation.y += ((yaw - rig.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 6);
          rig.setState('walk');
        } else {
          rig.setState('idle');
          const yaw = Math.atan2(toCam.x, toCam.z);
          rig.root.rotation.y += ((yaw - rig.root.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI) * Math.min(1, dt * 3);
        }
        rig.update(dt);
      };
      this.actors.push(a);
      this.addPick(rig.root, () => {
        rig.attack(0.5);
        rig.boing(0.5);
        audio.play(pickSound(id), { pitch: 0.9 + Math.random() * 0.3 });
        fx.sparkle(rig.root.position.clone().setY(rig.root.position.y + rig.height * 0.8), { count: 8, speed: 2 });
      }, { zone: Z, radius: 1.6 * (SWARMS[id]?.size ?? 1) });
    });
  }

  addPick(obj, fn, o = {}) {
    const pk = { obj, fn, zone: o.zone, radius: o.radius ?? 2, tag: null };
    if (o.label) {
      pk.tag = h('div', { class: `hm-tag ${o.cls ?? ''}` }, o.iconName ? icon(o.iconName) : null, o.label === '?' ? null : o.label);
      pk.tagH = o.h ?? 2;
    }
    this.pickables.push(pk);
  }

  // -------------------------------------------------------------------------
  // UI

  buildUI() {
    const p = state.p;
    const root = (this.root = h('div', { class: 'home' }));
    // top bar
    this.lvlEl = h('div', { class: 'hm-lvl' }, '1');
    this.nameEl = h('div', { class: 'nm' }, p.name);
    this.xpBar = bar(0, 'blue', '');
    const prof = h('div', { class: 'hm-prof hit', 'data-tip': 'Your *Lab Level*: upgrade cards and win battles for Lab XP', onclick: () => this.openModal('profile', 'openProfile') }, h('div', { class: 'hm-lvlw' }, this.lvlEl, h('i', { class: 'hm-lvl-ring' })), h('div', { class: 'hm-pname' }, this.nameEl, this.xpBar));
    // pills start at what they showed last time; refresh() after the entrance rolls them up
    this.coinPill = pill('coin', shown.coins ?? p.coins, { plus: () => this.setTab('shop'), cls: 'hm-pill-coin' });
    this.buckPill = pill('bucks', shown.bucks ?? p.bucks, { plus: () => this.setTab('shop'), cls: 'hm-pill-buck' });
    this.coinPill.dataset.tip = '*Beast Coins*: upgrade cards, roll perks';
    this.buckPill.dataset.tip = '*Beast Bucks*: vials, skins and skips';
    this.top = h('div', { class: 'hm-top' }, prof, this.coinPill, this.buckPill);
    root.appendChild(this.top);
    // side buttons (right edge only: the free vial lives in the SHOP, the MEGA in CARDS, the Lab visit in LAB)
    root.appendChild(h('div', { class: 'hm-side right' },
      button('', () => this.openModal('settings', 'openSettings'), 'gray icon-only hm-sb hm-sb-set', { icon: 'gear' }),
      button('', () => this.openModal('friend', 'openFriendBattle'), 'teal icon-only hm-sb hm-sb-fr', { icon: 'friends' }),
      this.roadBtn = button('', () => this.openModal('trophyRoad', 'openTrophyRoad'), 'gold icon-only hm-sb hm-sb-road', { icon: 'road' })));
    // tags over the island
    this.tagLayer = h('div', { class: 'hm-tags' });
    for (const pk of this.pickables) if (pk.tag) this.tagLayer.appendChild(pk.tag);
    root.appendChild(this.tagLayer);
    // dock: arena banner, battle row, vial slots, nav
    this.prevBtn = button('', () => this.browse(-1), 'blue icon-only arr', { icon: 'arrowL' });
    this.nextBtn = button('', () => this.browse(1), 'blue icon-only arr', { icon: 'arrowR' });
    this.zArena = h('div', { class: 'an' }, 'ARENA 1');
    this.zRibbon = ribbon('BEAST LAB', 'blue');
    this.zTro = h('div', { class: 'zt' });
    this.zProg = bar(0, 'gold', '', { cls: 'hm-zprog' });
    this.zBox = h('div', { class: 'hm-zbox', 'data-sfx': 'tap', onclick: () => this.openModal('trophyRoad', 'openTrophyRoad') }, this.zArena, this.zRibbon, h('div', { class: 'hm-ztrow' }, this.zTro, this.zProg));
    const zone = h('div', { class: 'hm-zone' }, this.prevBtn, this.zBox, this.nextBtn);
    this.battleBtn = button('BATTLE', () => this.battle(), 'yellow xl shine hm-battle', { icon: 'swords', sub: 'Win trophies & vials', sound: 'go' });
    this.bossBtn = button('BOSS', () => this.openBoss(bossOfArena(ARENAS[this.zoneIdx].id)?.id), 'purple lg hm-side-play', { icon: 'skull' });
    this.practiceBtn = button('TRAIN', () => game.go('battle', { mode: 'practice' }), 'gray lg hm-side-play', { icon: 'sword' });
    // the wrapper breathes + lifts on hover; the button itself keeps the generic press / release
    const bwrap = (this.bwrap = h('div', { class: 'hm-bwrap' }, this.battleBtn));
    const play = h('div', { class: 'hm-play' }, this.practiceBtn, bwrap, this.bossBtn);
    // ONLINE BATTLE (engineer A): the LIVE 1v1 sticker on the BATTLE button + live-match lobby
    // (parked: live online play is not offered yet)
    if (ONLINE_ENABLED) loadOpt('../ui/home/online.js').then((m) => m.mountOnlineEntry(bwrap, this.ctx())).catch((e) => console.warn('online unavailable', e));
    this.slotEls = [0, 1, 2, 3].map((i) => {
      const el = h('div', { class: 'hm-slot sk-slot', onclick: () => this.tapSlot(i) });
      return { el, key: null };
    });
    const slots = h('div', { class: 'hm-slots' }, this.slotEls.map((s) => s.el));
    this.navBtns = TABS.map((t) => {
      const b = h('button', { class: 'hm-tabbtn', type: 'button', style: { '--ti': TABS.indexOf(t) }, onclick: () => { audio.play('tap'); this.setTab(t.id); } }, icon(t.icon), h('span', { class: 'tl' }, t.label));
      b.dataset.tab = t.id;
      return b;
    });
    // the glass tube behind the active tab slides between tabs on a spring
    this.navInd = h('i', { class: 'hm-nav-ind' });
    this.nav = h('div', { class: 'hm-nav' }, this.navInd, this.navBtns);
    this.zoneEl = zone;
    this.playEl = play;
    this.slotsEl = slots;
    this.dock = h('div', { class: 'hm-dock' }, zone, h('div', { class: 'hm-mid' }, play, slots), this.nav);
    root.appendChild(this.dock);
    $ui().appendChild(root);
    // press squash / release overshoot / hover lift on everything tappable that isn't a generic button
    M.pressable(prof, { press: { sx: 0.95, sy: 0.92, y: 1 }, hover: { y: -2, sx: 1.02, sy: 1.02 } });
    M.pressable(this.zBox, { press: { sx: 0.95, sy: 0.9, y: 2 }, hover: { y: -2, sx: 1.03, sy: 1.03 } });
    for (const s of this.slotEls) M.pressable(s.el, { press: { sx: 1.07, sy: 0.86, y: 3 }, hover: { y: -5, sx: 1.05, sy: 1.05 } });
    for (const b of this.navBtns) M.pressable(b, { press: { sx: 1.1, sy: 0.84, y: 3 }, hover: { y: -3, sx: 1.06, sy: 1.06 } });
    M.pressable(bwrap, { press: { sx: 1, sy: 1, y: 0 }, hover: { y: -4, sx: 1.03, sy: 1.03 } });
    for (const pl of [this.coinPill, this.buckPill]) M.pressable(pl, { press: { sx: 0.96, sy: 0.9, y: 1 }, hover: { y: -2, sx: 1.03, sy: 1.03 } });
    this.setTab('battle', true);
    this.refresh(true);
  }

  /** Lobby entrance: everything springs in from its own edge, staggered. */
  intro() {
    if (!this.root) return;
    const q = (s) => [...this.root.querySelectorAll(s)];
    M.enter([this.top], { from: { y: -90 }, stiffness: 260, damping: 22, fade: false });
    M.enter([this.root.querySelector('.hm-prof'), this.coinPill, this.buckPill], { from: { y: -24, sx: 0.6, sy: 0.6 }, delay: 0.12, step: 0.07, stiffness: 380, damping: 14 });
    M.enter(q('.hm-side.right > *'), { from: { x: 110, r: 12 }, delay: 0.24, step: 0.07, stiffness: 300, damping: 16 });
    M.enter([this.nav], { from: { y: 110 }, stiffness: 260, damping: 22, fade: false });
    M.enter(this.navBtns, { from: { y: 40, sx: 0.5, sy: 0.5 }, delay: 0.14, step: 0.045, stiffness: 420, damping: 15 });
    this.dockIntro(0.3);
    // counters roll up to their real values once the bar has landed
    setTimeout(() => this.refresh(), 650);
  }
  /** The battle tab's dock (arena sign, BATTLE, side plays, slots) pops in, staggered. */
  dockIntro(delay = 0) {
    M.enter([this.zoneEl], { from: { y: -30, sx: 0.7, sy: 0.7 }, delay, stiffness: 360, damping: 14 });
    M.enter([this.bwrap], { from: { y: 30, sx: 0.35, sy: 0.35 }, delay: delay + 0.08, stiffness: 340, damping: 11 });
    M.enter([this.practiceBtn, this.bossBtn], { from: { y: 40, sx: 0.6, sy: 0.6 }, delay: delay + 0.16, step: 0.05, stiffness: 380, damping: 14 });
    M.enter(this.slotEls.map((s) => s.el), { from: { y: 70, sx: 0.8, sy: 0.8 }, delay: delay + 0.18, step: 0.055, stiffness: 340, damping: 15 });
  }

  /** first: the lobby is still flying in, so counters keep last visit's values until intro() rolls them. */
  refresh(first = false) {
    if (!this.root) return;
    const p = state.p;
    this.rollReady = !first;
    const xp = labXpInfo();
    if (this.lvlEl.textContent !== String(xp.level)) {
      if (this.lvlEl.textContent !== '1' || xp.level !== 1) M.pop(this.lvlEl.parentNode, 0.4);
      this.lvlEl.textContent = String(xp.level);
    }
    this.nameEl.textContent = p.name;
    const xf = xp.max ? 1 : xp.xp / Math.max(1, xp.need);
    this.xpBar.set(xf, xp.max ? 'MAX' : `${xp.xp}/${xp.need}`);
    if (!first) {
      this.setPill(this.coinPill, p.coins);
      this.setPill(this.buckPill, p.bucks);
    }
    this.updateZoneBanner();
    this.updateSlots(true);
    this.updateMinis();
    this.updateBadges();
    this.currentTab?.refresh?.();
  }
  setPill(el, v) {
    if (el.set) { if (el._v !== v) el.set(v); return; }
    const val = el.querySelector('.val');
    const s = v.toLocaleString('en-US');
    if (val.textContent !== s) {
      val.textContent = s;
      bump(el);
    }
  }

  updateZoneBanner() {
    const p = state.p;
    const k = this.zoneIdx;
    const A = ARENAS[k];
    const best = currentArena(p.bestTrophies).index;
    const locked = k > best || this.unlockTarget === k;
    this.zArena.textContent = A.legendary ? 'LEGENDARY ARENA' : `ARENA ${k + 1}`;
    this.zRibbon.querySelector('span').textContent = A.name.toUpperCase();
    this.zRibbon.className = `ribbon sk-ribbon-${k % 3 === 0 ? 'blue' : k % 3 === 1 ? 'pink' : 'purple'}`;
    this.zBox.classList.toggle('locked', locked);
    this.zTro.innerHTML = '';
    if (locked) this.zTro.append(icon('lock'), h('span', { class: 'lockt' }, `Unlocks at ${A.trophies}`), icon('trophy'));
    else {
      // trophy counter: rolls up (or down) from what it showed last time
      const sp = h('span', { class: 'tv' });
      this.zTro.append(animIcon('trophy'), sp);
      const to = p.trophies;
      const from = this.troShown ?? shown.trophies ?? to;
      if (!this.rollReady) { sp.textContent = fmtN(from); this.troShown = from; }
      else if (from !== to) {
        sp.textContent = fmtN(from);
        rollNumber(sp, from, to, Math.min(1.4, 0.5 + Math.abs(to - from) / 120), fmtN);
        bump(this.zTro, 'hm-tro-pop');
        this.troShown = to;
      } else sp.textContent = fmtN(to);
    }
    // progress tube toward the next arena (on your current arena only)
    const nextA = ARENAS[k + 1];
    const cur = currentArena(p.trophies).index;
    const showProg = !locked && nextA && k === cur;
    this.zProg.style.display = showProg ? '' : 'none';
    if (showProg) {
      const f = (p.trophies - A.trophies) / Math.max(1, nextA.trophies - A.trophies);
      this.zProg.set(Math.max(0.02, Math.min(1, f)), `${nextA.trophies.toLocaleString('en-US')}`);
      this.zProg.dataset.tip = `*${nextA.name}* unlocks at ${nextA.trophies.toLocaleString('en-US')} trophies`;
    }
    this.prevBtn.classList.toggle('off', k <= 0);
    this.nextBtn.classList.toggle('off', k >= ARENAS.length - 1);
    const boss = bossOfArena(A.id);
    this.bossBtn.style.display = boss && !locked && p.trophies >= (boss.minTrophies ?? 0) ? '' : 'none';
    this.practiceBtn.style.display = boss && !locked && p.trophies >= (boss.minTrophies ?? 0) ? 'none' : '';
  }

  /** The free vial (claimed in the SHOP) refills on a timer: light the shop dot when one is ready. */
  updateMinis() {
    const ready = freeVialStatus().ready;
    if (ready !== this.freeReady) {
      const first = this.freeReady === undefined;
      this.freeReady = ready;
      if (!first) { this.updateBadges(); this.currentTab?.refresh?.(); }
    }
  }

  updateSlots(force = false) {
    const v = state.p.vials;
    const unlocking = isUnlocking();
    this.slotEls.forEach((s, i) => {
      const e = v.slots[i];
      const ready = e && vialReady(i);
      const left = e ? vialTimeLeft(i) : 0;
      const mode = !e ? 'empty' : ready ? 'ready' : e.unlockStart ? 'unlocking' : 'locked';
      const key = `${mode}|${e?.type}|${mode === 'unlocking' ? Math.ceil(left) : ''}|${mode === 'locked' ? unlocking : ''}`;
      if (!force && key === s.key) return;
      const rebuild = !s.key || s.key.split('|').slice(0, 2).join('|') !== key.split('|').slice(0, 2).join('|') || (!!e && !!vialThumbFn && !!s.el.querySelector('img.vt.pi'));
      // a slot changing state (new vial, unlock started, ready) gets an elastic pop
      if (s.key && s.key.split('|')[0] !== mode) M.pop(s.el, 0.22);
      s.key = key;
      if (rebuild) {
        s.el.innerHTML = '';
        s.el.className = `hm-slot sk-slot ${mode}`;
        s.el.style.setProperty('--si', i);
        if (mode === 'ready') s.el.appendChild(h('i', { class: 'hm-slot-rays' }));
        if (e) s.el.appendChild(vialImg(e.type));
        if (mode === 'unlocking') s.el.appendChild(s.pb = h('div', { class: 'hm-slot-prog' }, h('i')));
        s.st = h('div', { class: 'st' });
        s.sn = h('div', { class: 'sn' });
        s.el.append(s.st, s.sn);
      }
      if (mode === 'empty') { s.st.textContent = 'Vial slot'; s.sn.textContent = 'Win battles!'; }
      else if (mode === 'ready') { s.st.textContent = 'OPEN'; s.sn.textContent = VIALS[e.type].name; }
      else if (mode === 'unlocking') {
        const total = Math.max(1, VIALS[e.type].time);
        const fr = Math.max(0, Math.min(1, 1 - left / total));
        s.el.style.setProperty('--prog', fr.toFixed(3));
        s.st.textContent = fmtTime(left);
        s.sn.innerHTML = '';
        s.sn.appendChild(h('span', { class: 'skip' }, icon('bucks'), String(skipPrice(left))));
      } else {
        s.st.textContent = unlocking ? fmtTime(VIALS[e.type].time) : 'UNLOCK';
        s.sn.textContent = unlocking ? VIALS[e.type].name : fmtTime(VIALS[e.type].time);
      }
    });
  }

  async updateBadges() {
    try {
      const m = await loadOpt('../ui/home/badges.js');
      const b = m.badges();
      for (const btn of this.navBtns) {
        btn.querySelector('.badge')?.remove();
        const n = b[btn.dataset.tab] ?? 0;
        if (n > 0) btn.appendChild(h('div', { class: 'badge' }, n > 9 ? '9+' : String(n)));
      }
      this.roadBtn.querySelector('.badge')?.remove();
      if (b.road > 0) this.roadBtn.appendChild(h('div', { class: 'badge' }, b.road > 9 ? '9+' : String(b.road)));
    } catch (e) { /* screens not available yet */ }
  }

  // -------------------------------------------------------------------------
  // Tabs and modals

  ctx() {
    return {
      refresh: () => this.refresh(),
      openTab: (n) => this.setTab(n),
      openVial: (o) => this.openVial(o.type, o.slot, o.source),
      openFree: () => this.openFree(),
      openMegas: () => this.openMegas(),
      visitLab: () => game.go('lab', { visit: true, backTab: 'lab' }),
      battle: (params) => game.go('battle', params),
      focusArena: (id) => {
        document.querySelectorAll('.modal-back').forEach((m) => m.remove());
        this.setTab('battle');
        const k = ARENAS.findIndex((a) => a.id === id);
        if (k >= 0 && k !== this.zoneIdx) this.goArena(k);
      },
      toast,
    };
  }

  async setTab(id, instant = false) {
    const prevIdx = TABS.findIndex((t) => t.id === this.tab);
    const idx = TABS.findIndex((t) => t.id === id);
    const homeIdx = TABS.findIndex((t) => t.id === 'battle');
    const changed = prevIdx !== idx;
    this.tab = id;
    this.navBtns.forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    M.slideIndicator(this.navInd, this.navBtns[idx], instant || !changed);
    const oldTab = this.currentTab, oldEl = this.tabEl;
    this.currentTab = null;
    this.tabEl = null;
    const disposeOld = () => { if (oldTab) { try { oldTab.dispose?.(); } catch (e) { console.error(e); } } oldEl?.remove(); };
    const dir = idx > prevIdx ? 1 : -1;
    if (oldEl && !instant && changed) {
      // the old screen leaves in the direction of travel (or drops away when going home), then is disposed
      oldEl.classList.add('hm-tab-out');
      oldEl.style.pointerEvents = 'none';
      M.tabOut(oldEl, id === 'battle' ? 0 : dir).then(disposeOld);
    } else disposeOld();
    this.root.classList.toggle('tabbed', id !== 'battle');
    // once a tab panel has slid in it hides the island completely: stop drawing it meanwhile
    clearTimeout(this.coverT);
    if (id === 'battle') engine.cover('homeTab', false);
    else this.coverT = setTimeout(() => { if (this.tab !== 'battle' && !this.exited) engine.cover('homeTab', true); }, instant ? 0 : 450);
    if (id === 'battle') {
      if (!instant && changed) this.dockIntro(0.05);
      return;
    }
    const el = (this.tabEl = h('div', { class: 'hm-tab' }));
    this.layoutTab();
    this.root.insertBefore(el, this.dock);
    if (!instant && changed) M.tabIn(el, prevIdx === homeIdx ? 0 : dir);
    try {
      const mod = await loadOpt(`../ui/home/${id}.js`);
      if (this.tab !== id || this.tabEl !== el) return;
      this.currentTab = mod.mount(el, this.ctx());
    } catch (e) {
      console.warn('tab unavailable', id, e);
      el.appendChild(h('div', { class: 'hm-soon' }, icon(TABS[idx].icon, 'xl'), h('div', { class: 't-d outline t-xl' }, TABS[idx].label), h('div', { class: 'c-muted' }, 'Coming soon!')));
    }
  }
  layoutTab() {
    if (this.navInd) M.slideIndicator(this.navInd, this.navBtns[TABS.findIndex((t) => t.id === this.tab)], true);
    if (!this.tabEl) return;
    const top = this.root.querySelector('.hm-top').getBoundingClientRect().bottom;
    const bottom = this.nav.getBoundingClientRect().top;
    this.tabEl.style.top = top + 'px';
    this.tabEl.style.height = Math.max(100, bottom - top) + 'px';
  }

  async openModal(file, fn, ...args) {
    try {
      const mod = await loadOpt(`../ui/home/${file}.js`);
      return mod[fn](...args, this.ctx());
    } catch (e) {
      console.warn('screen unavailable', file, e);
      toast('Coming soon!', { icon: 'clock' });
    }
  }
  openBoss(bossId) {
    if (!bossId) return;
    this.openModal('boss', 'openBoss', bossId);
  }

  // -------------------------------------------------------------------------
  // Vials

  openVial(type, slot = null, source = 'slot') {
    if (slot !== null && slot !== undefined) takeVial(slot);
    state.save();
    // opened from a tab (shop, pass...): come back to that tab
    game.go('vialopen', { type, slot, source, back: 'home', backParams: this.tab && this.tab !== 'battle' ? { tab: this.tab } : {} });
  }
  tapSlot(i) {
    const e = state.p.vials.slots[i];
    if (!e) { toast('Win battles to earn *vials*!', { icon: 'vial' }); return; }
    if (vialReady(i)) { audio.play('pop'); this.openVial(e.type, i, 'slot'); return; }
    const V = VIALS[e.type];
    const left = vialTimeLeft(i);
    const unlocking = e.unlockStart && left > 0;
    const price = skipPrice(left);
    const info = h('div', { class: 'col center' },
      vialImg(e.type, 'vt-big'),
      h('div', { class: 'c-muted center-t t-sm' }, V.desc ?? ''),
      h('div', { class: 'row center wrap' },
        h('span', { class: 'row', style: { gap: '0.2em' } }, icon('cards'), `x${V.cards} cards`),
        h('span', { class: 'row', style: { gap: '0.2em' } }, icon('coin'), `${V.coins[0]}-${V.coins[1]}`),
        V.bucks ? h('span', { class: 'row', style: { gap: '0.2em' } }, icon('bucks'), `${V.bucks}`) : null),
      h('div', { class: 't-d outline t-lg' }, unlocking ? `${fmtTime(left)} left` : `Unlock time: ${fmtTime(V.time)}`));
    const big = info.querySelector('.vt-big');
    if (big) Object.assign(big.style, { width: 'calc(var(--u) * 30)', height: 'calc(var(--u) * 30)' });
    const foot = [];
    if (!unlocking && !isUnlocking()) foot.push(button('START UNLOCK', () => { startUnlock(i); m.close(); audio.play('tick'); this.refresh(); }, 'green lg', { icon: 'clock' }));
    foot.push(button('OPEN NOW', () => {
      if (!skipVial(i, price)) { toast('Not enough *Beast Bucks*!', { icon: 'bucks' }); return; }
      m.close();
      this.openVial(e.type, i, 'slot');
    }, 'purple lg', { price: { cur: 'bucks', amount: price } }));
    const m = modal({ title: V.name.toUpperCase(), color: 'blue', size: 'narrow', body: info, foot });
  }
  openFree() {
    const fs = freeVialStatus();
    if (!fs.ready) { toast(`Next free vial in *${fmtTime(fs.nextIn)}*`, { icon: 'clock' }); return; }
    claimFreeVial();
    this.openVial('free', null, 'free');
  }
  /** MEGA ultimates: the giant MEGA-TECH Mutator figures you unleash in battle. */
  openMegas() {
    const p = state.p;
    const grid = h('div', { class: 'hm-megas' }, MEGA_IDS.map((id) => {
      const M = MEGAS[id];
      const own = p.megas.owned[id];
      const eq = p.megas.equipped === id;
      const el = h('div', { class: `hm-mega sk-panel-dark ${own ? '' : 'locked'} ${eq ? 'eq' : ''}` },
        h('img', { src: swarmThumb(id, own?.variant ?? 'base', null, 160) }),
        h('div', { class: 'nm t-d outline' }, M.name, own?.variant === 'gold' ? h('span', { class: 'c-gold' }, ' GOLD') : null),
        h('div', { class: 'sp' }, icon('lightning', 's'), h('span', {}, M.special.name)),
        h('div', { class: 'ds' }, own ? M.desc : `Unlocks on the ${M.unlock}.`),
        own ? (eq ? h('div', { class: 'eqt t-d' }, 'EQUIPPED') : button('EQUIP', () => { equipMega(id); m.close(); this.refresh(); toast(`*${M.name}* is your MEGA now!`, { icon: 'mega' }); }, 'green sm')) : h('div', { class: 'lk' }, icon('lock')));
      return el;
    }));
    const m = modal({
      title: 'MEGA ULTIMATES', color: 'pink', size: 'wide',
      body: h('div', { class: 'col' },
        h('div', { class: 'c-muted center-t t-sm hm-megas-intro' }, 'Charge your MEGA by fighting (damage + knockouts). Once your base is a ', h('b', { class: 'c-gold' }, 'Trailer Lab'), ' or better, tap it once per battle: it smashes out of its containment cup and stomps down the lane.'),
        grid),
    });
  }

  // -------------------------------------------------------------------------
  // Island interactions

  browse(d) {
    const k = Math.max(0, Math.min(ARENAS.length - 1, this.zoneIdx + d));
    if (k === this.zoneIdx) return;
    this.goArena(k);
  }
  /** Fly the island camera to arena k; the arena sign kicks in from the side it came from. */
  goArena(k, dur) {
    const dir = Math.sign(k - this.zoneIdx) || 1;
    this.zoneIdx = k;
    this.updateZoneBanner();
    M.slideSwap(this.zBox, dir);
    if (this.I) this.placeZone(k, false, dur);
  }
  battle() {
    if (this.tutPtr) { this.tutPtr(); this.tutPtr = null; }
    burst(this.battleBtn, { color: '#ffd84a', count: 22, scale: 1.4, ring: false });
    const best = currentArena(state.p.bestTrophies).index;
    // ranked battles always happen in your current arena (like Clash Royale)
    game.go('battle', { mode: 'ranked', arena: ARENAS[Math.min(best, currentArena(state.p.trophies).index)].id });
  }

  async talkNpc(npcId, chibi, questNpc) {
    const ch = CHARACTERS[npcId];
    const who = { name: ch.name ?? npcId, color: '#ff8a1f', portrait: charPortrait(npcId, { eyes: 'happy', mouth: 'grin' }), chibi };
    chibi.play('wave', { restart: true, dur: 1.2, then: 'idle' });
    audio.play('pop');
    if (!questNpc) {
      const lines = ['This island is AMAZING. Jimmy built all of it!', 'Have you seen the Beast Tiger? It does NOT like being tapped.', 'Rumor says there are secrets hidden on every arena...', 'Upgrade your base to a Trailer Lab to unlock your MEGA in battle!'];
      speech(chibi, lines[Math.floor(Math.random() * lines.length)], 3);
      return;
    }
    const st = questState(questNpc);
    if (!st) return;
    if (st.finished) { await say(who, "You've done everything I asked. You're a legend!"); return; }
    if (!st.accepted) {
      const r = await say(who, `*${st.quest.title}*: ${st.text}`, { choices: [{ label: 'Accept', cls: 'green' }, { label: 'Later', cls: 'gray' }] });
      if (r === 0) { acceptQuest(questNpc); toast('Quest accepted!', { icon: 'quest' }); this.refresh(); }
      return;
    }
    if (st.done) {
      const rewards = completeQuest(questNpc);
      audio.play('levelUp');
      fx.confetti(chibi.root.position.clone().setY(chibi.root.position.y + 3), { count: 50 });
      await say(who, `You did it! Here's your reward: ${(rewards || []).map((x) => x.label ?? '').filter(Boolean).join(', ') || 'thanks!'}`);
      this.refresh();
      return;
    }
    await say(who, `${st.text} (${st.prog}/${st.need}). Keep going!`);
  }

  secretFound(id, pos) {
    const r = findSecret(id);
    if (!r) return;
    audio.play('levelUp');
    fx.sparkle(pos, { count: 40, colors: [0xffd84a, 0xffffff, 0xff7ac0], speed: 4, radius: 1 });
    fx.confetti(pos.clone().setY(pos.y + 2), { count: 40 });
    bigBanner('SECRET FOUND!', r.secret.name, { dur: 2, color: '#ffd84a' });
    state.save();
    this.refresh();
  }

  // -------------------------------------------------------------------------
  // Arena unlock cinematic: fly up the trophy road, padlock bursts, banner

  async unlockCinematic(A) {
    const k = A.index;
    this.root.style.visibility = 'hidden';
    await wait(0.4);
    this.placeZone(k, false, 2.6);
    await this.flyDone;
    await wait(0.2);
    const I = this.I;
    I.setLocked(A.id, false, { animate: true });
    audio.play('shatter');
    await wait(1.0);
    engine.shake(0.4);
    audio.play('levelUp');
    audio.play('cheer');
    const Z = I.zones[k];
    fx.confetti(Z.focus.clone().setY(Z.focus.y + 8), { count: 140, spread: 4 });
    const cards = cardsOfArena(A.id).slice(0, 6);
    const ov = h('div', { class: 'hm-unlock' },
      h('div', { class: 'new' }, 'NEW ARENA UNLOCKED!'),
      h('div', { class: 'nm' }, A.name.toUpperCase()),
      h('div', { class: 'vid' }, `Inspired by "${A.video}"`),
      cards.length ? h('div', { class: 'cards' }, cards.map((c, i) => { const el = cardEl(c.id, { locked: false, owned: { level: 1 }, noLevel: true }); el.style.animationDelay = `${0.8 + i * 0.12}s`; return el; })) : null,
      button('LET\'S GO!', () => close(), 'yellow lg', { icon: 'star' }));
    $overlay().appendChild(ov);
    let done;
    const close = () => { ov.remove(); done(); };
    await new Promise((r) => (done = r));
    markArenaSeen(k);
    this.unlockTarget = -1;
    state.save();
    // more than one arena behind? play the next one too
    const next = pendingArenaUnlock();
    if (next) {
      this.unlockTarget = next.index;
      return this.unlockCinematic(next);
    }
    for (const a of this.actors) if (a.kind === 'swarm') this.scene.remove(a.obj.root);
    this.actors = this.actors.filter((a) => a.kind !== 'swarm');
    this.pickables = this.pickables.filter((pk) => pk.zone?.index !== -1);
    this.spawnSquad(I.zones[k]);
    this.zoneIdx = k;
    this.refresh();
    this.root.style.visibility = '';
    this.intro();
    this.afterEnter();
  }

  // -------------------------------------------------------------------------
  // Input: swipe to browse arenas, tap actors / NPCs / bosses / secrets. Only
  // touches on the bare 3D canvas get here: every button / panel sits above it.

  bindInput() {
    const c = engine.canvas;
    this.onDown = (e) => {
      if (this.tab !== 'battle') return;
      this.ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    };
    this.onUp = (e) => {
      const p = this.ptr;
      if (!p || p.id !== e.pointerId) return;
      this.ptr = null;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.3) { this.browse(dx < 0 ? 1 : -1); return; }
      if (Math.hypot(dx, dy) < 12) this.tapWorld(e.clientX, e.clientY);
    };
    c.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
  }
  tapWorld(x, y) {
    let best = null, bd = Infinity;
    const v = new THREE.Vector3();
    for (const pk of this.pickables) {
      pk.obj.getWorldPosition(v);
      const s = engine.toScreen(v.clone().setY(v.y + (pk.tagH ?? 1) * 0.4), this.camera);
      if (!s.visible) continue;
      const d = Math.hypot(s.x - x, s.y - y);
      const scaled = 26 + pk.radius * 18;
      if (d < scaled && d < bd) { bd = d; best = pk; }
    }
    if (best) best.fn();
  }

  // -------------------------------------------------------------------------

  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    if (this.I && !this.fly) this.placeZone(this.zoneIdx, true);
    this.layoutTab();
  }

  update(dt) {
    this.t += dt;
    if (this.I && !engine.covered) this.updateIsland(dt);
    // timers
    this.tickT = (this.tickT ?? 0) - dt;
    if (this.tickT <= 0 && this.root) {
      this.tickT = 1;
      this.updateSlots();
      this.updateMinis();
    }
  }

  updateIsland(dt) {
    this.I.update(dt, this.t);
    const cam = this.camera;
    // camera: fly between zones, then gently sway
    if (this.fly) {
      const f = this.fly;
      f.t += dt / f.dur;
      const k = ease(Math.min(1, f.t));
      this.cam.pos.lerpVectors(f.from.pos, f.to.pos, k);
      this.cam.pos.y += Math.sin(k * Math.PI) * f.from.pos.distanceTo(f.to.pos) * 0.18;
      this.cam.look.lerpVectors(f.from.look, f.to.look, k);
      if (f.t >= 1) { this.fly = null; f.done?.(); }
    }
    // cinematic idle drift: a slow orbit sway, a gentle dolly "breath" and a drifting look target;
    // it eases in after each camera flight so zone framing stays exact when you arrive
    this.idleK = this.fly ? 0 : Math.min(1, (this.idleK ?? 0) + dt * 0.35);
    const ik = this.idleK * this.idleK * (3 - 2 * this.idleK), t = this.t;
    const off = _camOff.copy(this.cam.pos).sub(this.cam.look);
    off.applyAxisAngle(_yAxis, (Math.sin(t * 0.11) * 0.05 + Math.sin(t * 0.23 + 1.3) * 0.015) * ik + Math.sin(t * 0.13) * 0.02);
    off.multiplyScalar(1 + Math.sin(t * 0.085 + 0.6) * 0.03 * ik);
    _camLook.copy(this.cam.look);
    _camLook.x += Math.sin(t * 0.17) * 0.35 * ik;
    _camLook.z += Math.cos(t * 0.13) * 0.25 * ik;
    cam.position.copy(_camLook).add(off);
    cam.position.y += Math.sin(t * 0.4) * 0.15 + Math.sin(t * 0.07) * 0.6 * ik;
    cam.lookAt(_camLook);
    for (const a of this.actors) a.update?.(dt);
    // world tags
    const v = _tagV;
    const shownTags = [];
    for (const pk of this.pickables) {
      if (!pk.tag) continue;
      pk.obj.getWorldPosition(v);
      v.y += pk.tagH;
      const s = engine.toScreen(v, cam);
      const near = cam.position.distanceTo(v) < 140;
      if (!s.visible || !near || this.tab !== 'battle') { pk.tag.style.display = 'none'; continue; }
      if (pk.tag.style.display === 'none' || !pk.tagBox?.[0]) { pk.tag.style.display = ''; pk.tagBox = [pk.tag.offsetWidth, pk.tag.offsetHeight]; }
      shownTags.push({ pk, x: s.x, y: s.y });
    }
    // labels never sit on top of each other: a tag overlapping one lower on screen steps up above it
    shownTags.sort((a, b) => b.y - a.y);
    for (let i = 0; i < shownTags.length; i++) {
      const t = shownTags[i], [w, hh] = t.pk.tagBox;
      for (let j = 0; j < i; j++) {
        const o = shownTags[j], [ow, oh] = o.pk.tagBox;
        if (Math.abs(t.x - o.x) < (w + ow) / 2 + 4 && t.y > o.y - oh - 3) t.y = o.y - oh - 3;
      }
      t.pk.tag.style.transform = `translate(${Math.round(t.x)}px, ${Math.round(t.y)}px)`;
    }
  }

  exit() {
    this.exited = true;
    const c = engine.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    this.offState && this.offState();
    try { this.currentTab?.dispose?.(); } catch (e) { /* ignore */ }
    if (this.tutPtr) this.tutPtr();
    clearTimeout(this.showT);
    clearTimeout(this.coverT);
    engine.cover('homeTab', false);
    // remember what the counters showed so the next visit can roll them up
    const p = state.p;
    if (p) Object.assign(shown, { coins: p.coins, bucks: p.bucks, trophies: p.trophies });
  }
}

/** Boss gate sigil: a hazard diamond with corner spikes, notched rim and a pixel skull (white, tinted). */
let _sigil = null;
function bossSigilTex() {
  if (_sigil) return _sigil;
  const S = 40, c = S / 2;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const px = (x, y, a = 1) => { ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.fillRect(x, y, 1, 1); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x + 0.5 - c) + Math.abs(y + 0.5 - c);
    if (d > 15 && d <= 17.5 && !((x + y) % 6 === 0)) px(x, y, 1); // notched rim
    else if (d > 12 && d <= 13.5) px(x, y, 0.55); // inner rim
    else if (d <= 12 && (x + y) % 2 === 0) px(x, y, 0.16); // dithered fill
  }
  // spikes off the four corners
  for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) {
    const [dx, dy] = [[1, 0], [-1, 0], [0, 1], [0, -1]][k];
    px(c + dx * (18 + i) - (dx ? 0 : 0), c + dy * (18 + i), 1);
  }
  // pixel skull
  const skull = ['..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XX..X..XX', 'XX..X..XX', 'XXXX.XXXX', '.XXXXXXX.', '..X.X.X..'];
  skull.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') px(c - 4 + i, c - 4 + j, 0.95); }));
  const t = new THREE.CanvasTexture(cv);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return (_sigil = t);
}

function pickSound(id) {
  const role = SWARMS[id]?.role;
  return role === 'tank' ? 'growl' : role === 'ranged' ? 'zap' : 'bite';
}
