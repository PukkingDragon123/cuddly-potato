// Throwaway harness for the hub UI: open /src/dev/hubtest.html
//   ?keep=1   keep the saved profile instead of re-seeding
//   ?screen=collection&id=panther   open a screen right away
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/press-start-2p/400.css';
import '../ui/ui.css';
import * as THREE from 'three';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import {
  state, refreshDaily, grantSwarm, grantSpell, grantCommander, addVial, rollVial, applyVial, takeVial, unlockMega, setDeck,
} from '../game/state.js';
import { game } from '../game/game.js';
import { VIALS } from '../data/vials.js';
import { createSwarm } from '../models/swarmModels.js';
import { bigBanner, toast } from '../ui/ui.js';
import { mountHub } from '../ui/hub.js';
import { showRewards } from '../ui/screens/common.js';

class HubTestScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x24306a);
    this.camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.1, 200);
    addLights(this.scene, { shadowExtent: 8 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 0.4, 24), new THREE.MeshLambertMaterial({ color: 0x3a4a8a }));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.5, 16), new THREE.MeshLambertMaterial({ color: 0x29b6f6 }));
    ped.position.y = 0.25;
    this.scene.add(ped);
    this.holder = new THREE.Group();
    this.holder.position.y = 0.5;
    this.scene.add(this.holder);
    this.t = 0;
    this.setPreview('panther');
  }
  setPreview(id, variant = 'base', skin = null) {
    if (this.rig) this.holder.remove(this.rig.root);
    this.rig = createSwarm(id, { variant, skin, scale: 1.4 });
    this.holder.add(this.rig.root);
  }
  enter() {}
  resize(w, hh) {
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
  }
  update(dt) {
    this.t += dt;
    this.camera.position.set(Math.sin(this.t * 0.2) * 1.5, 3.2, 7.5);
    this.camera.lookAt(0, 1, 0);
    this.holder.rotation.y += dt * 0.6;
    this.rig.setState('idle');
    this.rig.update(dt);
  }
}

function seed() {
  state.reset();
  const p = state.p;
  p.name = 'LabLegend';
  p.tutorial = 'done';
  p.coins = 24850;
  p.bucks = 960;
  p.trophies = 340;
  p.bestTrophies = 380;
  p.calories = 2330;
  const give = (id, level, copies, variants = []) => {
    grantSwarm(id, 1);
    const e = p.swarms[id];
    e.level = level;
    e.copies = copies;
    for (const v of variants) e.variants[v] = true;
  };
  give('panther', 3, 9, ['silver', 'gold']);
  give('cloggedToilet', 2, 5);
  give('toiletRollRipper', 4, 20);
  give('trashedCan', 2, 2);
  give('mutantMailbox', 2, 3);
  give('ragingStopSign', 1, 1);
  give('badEggsperiment', 1, 0);
  give('fryFiend', 3, 6, ['chrome']);
  give('pizzaSlicer', 2, 1);
  give('donutDasher', 1, 2);
  give('steelPanther', 2, 1);
  give('glitchBot', 1, 0);
  give('atomicSlime', 1, 1);
  give('chocoChomper', 1, 0);
  give('beastTiger', 1, 0);
  setDeck(['panther', 'cloggedToilet', 'toiletRollRipper', 'fryFiend']);
  p.swarms.fryFiend.variant = 'chrome';
  grantSpell('foodThrow');
  grantSpell('moneyDrop');
  grantSpell('slimeFlood');
  p.spells.equipped = ['foodThrow', 'moneyDrop'];
  const rc = p.commanders.owned.recruit;
  rc.level = 5;
  rc.xp = 220;
  rc.perks = [{ id: 'coinMagnet', tier: 'rare', v: 18 }, null, null];
  grantCommander('juan');
  p.commanders.owned.juan.level = 2;
  p.cosmetics.banners = ['default', 'pinkBolt', 'animStars', 'animFeast', 'feastBanner', 'animGoldenTicket', 'animDrip'];
  p.cosmetics.banner = 'animFeast';
  p.cosmetics.swarmSkins.wrapperPanther = true;
  p.cosmetics.cmdSkins.juanChef = true;
  p.cosmetics.labSkins = ['default', 'martLab'];
  unlockMega('feastablesPanther');
  for (let i = 0; i < 10; i++) p.pass.free[i] = true;
  p.pass.free[14] = true;
  addVial('lab');
  p.vials.slots[0].skipped = true;
  addVial('homeHorrors');
  p.vials.slots[1].unlockStart = Date.now() - 5 * 60 * 1000;
  addVial('gold');
  addVial('mega');
  p.vials.storage = ['food', 'lab'];
  p.trophyRoad = { 30: true, 60: true, 90: true };
  Object.assign(p.stats, { wins: 42, losses: 17, battles: 59, vialsOpened: 23, deployed: 1234 });
  p.secrets = { tigerTaps: Date.now(), coffeeMug: Date.now() };
  p.bosses = { kingClog: 1 };
  refreshDaily();
  // make one challenge complete
  const c0 = p.challenges.ids[0];
  if (c0) p.challenges.base[c0] = -100;
  state.emit('seed');
}

async function boot() {
  engine.init();
  const params = new URLSearchParams(location.search);
  state.load();
  if (params.get('keep') !== '1') seed();
  refreshDaily();
  game.settings();
  window.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  const scene = new HubTestScene();
  await engine.setScene(scene, {});
  try {
    await Promise.race([Promise.all([document.fonts.load('16px "Pixelify Sans"'), document.fonts.load('16px "Press Start 2P"')]), new Promise((r) => setTimeout(r, 1500))]);
  } catch (e) { /* ignore */ }

  const ctx = {
    async openVial(slot) {
      const e = state.p.vials.slots[slot];
      if (!e) return;
      const res = applyVial(rollVial(e.type));
      takeVial(slot);
      bigBanner('POP!', VIALS[e.type].name, { dur: 0.8, color: '#ffd23f' });
      await new Promise((r) => setTimeout(r, 900));
      const list = [{ type: 'coins', amount: res.coins }, ...res.cards.map((c) => ({ type: 'swarm', id: c.id, copies: c.copies, isNew: c.isNew }))];
      if (res.bucks) list.push({ type: 'bucks', amount: res.bucks });
      await showRewards(list, { title: VIALS[e.type].name.toUpperCase() });
    },
    async megaTransform(baseId) {
      bigBanner('MEGA!', `${baseId} transforms`, { dur: 1.4, color: '#ff2e88' });
      await new Promise((r) => setTimeout(r, 1600));
    },
    startBattle(opts) {
      toast(`ctx.startBattle(${JSON.stringify(opts)})`, { icon: 'sword' });
    },
    goArena() {
      toast('ctx.goArena()', { icon: 'pin' });
    },
    previewSwarm(id, variant, skin) {
      scene.setPreview(id, variant, skin);
    },
  };
  const hub = mountHub(ctx);
  window.__hub = hub;
  window.__state = state;
  const sc = params.get('screen');
  if (sc) hub.openScreen(sc, { id: params.get('id'), tab: params.get('tab') ?? undefined });
}

boot();
