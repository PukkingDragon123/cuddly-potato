// Beast Park (island centre): duck pond, the giant Subscribe button easter egg,
// hot-dog stand, Trophy podium, Food Season billboard and wandering fans.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../../core/voxel.js';
import { fx } from '../../../core/particles.js';
import { audio } from '../../../core/audio.js';
import { animate } from '../../../core/tween.js';
import { pick, rand } from '../../../core/util.js';
import { speech, floatText, bigBanner, toast } from '../../../ui/ui.js';
import { state } from '../../../game/state.js';
import { ARENAS } from '../../../data/arena.js';
import { SEASON } from '../../../data/season.js';
import { propRaw, rootOf, textPanel, pickProxy, fit } from '../kit.js';
import { spawnFan } from './labyard.js';

const _v = new THREE.Vector3();
export const POND = { x: -6, z: -9, r: 5.2 };

export function buildPark(A) {
  const T = A.terrain;
  const Z = 'park';
  T.rect(-15, -24, 15, 12, 'lawn', { onlyLand: true });
  // central plaza
  T.circle(0, 0, 4.2, 'plazaPink');
  T.circle(0, 0, 3.5, 'plaza');
  // pond
  T.circle(POND.x, POND.z, POND.r + 1.1, 'sand', { h: -0.12 });
  T.circle(POND.x, POND.z, POND.r, 'pondBed');
  T.circle(POND.x + 1, POND.z + 1, 1.2, 'pondBed', { h: -1.4 });
  A.liquid(POND.x, POND.z, POND.r * 2 + 2, POND.r * 2 + 2, 'pond', -0.3, { opacity: 0.86, texel: 2.5, flow: [0.03, 0.01], range: 30 });
  A.poi({ x: POND.x, z: POND.z, color: '#4cb6d4', size: 1 });

  subscribeButton(A, 0, -0.6);
  hotDogStand(A, 8.5, -14);
  trophyPodium(A, 8.6, 1.6);
  billboard(A, -8.5, -20.5);

  // benches around the pond
  for (const [x, z, r] of [[-12.4, -9, Math.PI / 2], [-6, -1.8, 0], [0.4, -9.5, -Math.PI / 2]]) {
    A.put('makeBench', [], { x, z, rot: r, zone: Z, fit: { w: 1.7, clamp: 1.6 } });
  }
  // trees & flowers
  const trees = [[-13, 9], [-9, 10], [12.5, 9.5], [13, -4], [-13, -16], [-13, -22], [13, -22], [4, -22], [12.5, -9], [-13, 2], [4.5, 9.5]];
  trees.forEach(([x, z], i) => A.put('makeTree', [i % 3 === 1 ? 'pine' : 'round', i + 3], { x, z, rot: i * 1.3, zone: Z, collide: { r: 0.4 }, fit: { h: 3.6, clamp: 1.6 } }));
  for (const [x, z] of [[-3.5, 3.5], [3.5, 3.5], [-3.5, -4.6], [3.6, -4.4], [-11, -3], [6, 8], [-1, -17], [11, -18]]) {
    A.put('makeFlowers', [Math.abs(Math.round(x * z))], { x, z, zone: Z, collide: false });
  }
  for (const [x, z] of [[-10.5, -14], [-1.5, -13.6], [10.5, 5]]) A.put('makeBush', [Math.round(x)], { x, z, zone: Z, collide: { r: 0.5 }, fit: { h: 0.9, clamp: 1.8 } });
  for (const [x, z] of [[-4.6, 4.8], [4.6, 4.8], [-4.6, -5.8], [4.6, -5.8]]) A.put('makeLamp', [], { x, z, zone: Z, collide: { r: 0.22 }, fit: { h: 2.8, clamp: 1.5 } });

  spawnFan(A, 3, -7, 3, 6);
  spawnFan(A, -2, 6, 4, 6);
  spawnFan(A, 9, -6, 1, 5);
}

// ---------------------------------------------------------------------------

function subscribeButton(A, x, z) {
  let raw;
  try {
    raw = propRaw('makeSubscribeButton');
  } catch (e) {
    raw = null;
  }
  let root, cap = null;
  if (raw && raw.real) {
    root = rootOf(raw.value);
    fit(root, { w: 3.6, clamp: 1.3 });
  } else {
    root = new THREE.Group();
    const base = makeMesh(cachedGeometry('arena:subBase', () => {
      const g = new VoxGrid();
      g.box(-18, 0, -13, 17, 3, 12, 0x2a2f3c);
      g.box(-16, 4, -11, 15, 4, 10, 0x15121f);
      return g;
    }, { scale: 0.1 }));
    cap = makeMesh(cachedGeometry('arena:subCap', () => {
      const g = new VoxGrid();
      g.box(-15, 0, -10, 14, 4, 9, 0xff1a1a);
      g.box(-14, 5, -9, 13, 5, 8, 0xff3a3a);
      for (const xx of [-15, 14]) for (const zz of [-10, 9]) g.del(xx, 4, zz);
      // white play triangle on top
      for (let i = 0; i < 9; i++) g.box(-4 + i, 6, -5 + Math.floor(i * 0.55), -4 + i, 6, 4 - Math.floor(i * 0.55), 0xffffff);
      return g;
    }, { scale: 0.1 }));
    cap.position.y = 0.45;
    root.add(base, cap);
  }
  root.position.set(x, 0, z);
  A.scene.add(root);
  A.world.box(x - 1.8, z - 1.3, x + 1.8, z + 1.2);
  const label = textPanel([{ text: 'SUBSCRIBE', size: 0.3, color: '#ffffff', icon: 'play' }], { w: 2.9, h: 0.5, bg: '#e01010', border: '#0d1029' });
  label.position.set(x, 0.3, z + 1.26);
  A.scene.add(label);
  const proxy = pickProxy(1.8, 1.4);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  let presses = 0;
  let squash = 0;
  A.onUpdate((dt) => {
    squash = Math.max(0, squash - dt * 4);
    const k = Math.sin(squash * Math.PI) * 0.6;
    if (cap) cap.position.y = 0.45 - k * 0.35;
    else root.scale.y = 1 - k * 0.35;
  }, x, z, 25);
  A.interact({
    id: 'subscribe', pos: new THREE.Vector3(x, 0, z + 2), range: 1.6, label: 'PRESS', icon: 'play', color: 'red', hit: proxy, ringR: 1,
    act: () => {
      presses++;
      squash = 1;
      const pl = A.player;
      pl.chibi.play('flick');
      audio.play('click', { pitch: 0.6 });
      audio.play('boing', { pitch: 0.8 + presses * 0.05 });
      fx.burst(_v.set(x, 0.9, z), { count: 8, colors: [0xff3a3a, 0xffffff], speed: 4, size: 0.08, ground: 0 });
      A.engineShake(0.08);
      const goal = 10;
      floatText(_v.set(x, 1.6, z), presses >= goal ? `${presses}!` : `${presses}/${goal}`, presses >= goal ? 'crit' : 'big');
      if (presses === goal) {
        audio.play('bell');
        if (!A.secret('subButton', _v.set(x, 1.5, z))) {
          bigBanner('SUBSCRIBED!', 'and the bell is ON', { color: '#ff3a3a' });
          fx.confetti(_v.set(x, 1.2, z), { count: 80 });
        }
        for (const n of A.npcs) if (n.pos.distanceTo(pl.pos) < 10) {
          n.chibi.play('cheer', { dur: 1.8, then: n.idleAnim });
          if (Math.random() < 0.5) n.say(pick(['SUBSCRIBED!!', 'Bell is ON!', 'Notification squad!']), 1.8);
        }
      } else if (presses > goal && presses % 10 === 0) {
        audio.play('bell');
        fx.confetti(_v.set(x, 1.2, z), { count: 40 });
        speech(pl.chibi, pick(['Double subscribed!', 'Triple subscribed?!', 'Can you even do that?']), 1.6);
      } else if (presses === 5) speech(pl.chibi, 'Halfway there...', 1.2);
    },
  });
  A.poi({ x, z, color: '#ff1a1a', size: 3 });
}

function hotDogStand(A, x, z) {
  const geo = cachedGeometry('arena:hotdogStand', () => {
    const g = new VoxGrid();
    g.box(-10, 3, -5, 9, 11, 4, 0xf4f0e6);
    g.box(-10, 3, 5, 9, 11, 5, 0xe8343c);
    g.paint((xx, y, zz, c) => (c === 0xe8343c && y % 4 === 0 ? 0xffffff : undefined));
    g.box(-10, 12, -5, 9, 12, 5, 0xc8ccd8);
    // giant hot dog on the counter
    g.box(-7, 13, -2, 6, 14, 1, 0xe8a04a);
    g.cylinder(0, -0.5, -8, 7, 1.5, 0xc8402a, 'x');
    g.box(-6, 15, -1, 5, 15, -1, 0xffd23f);
    // wheels
    for (const xx of [-8, 7]) for (const zz of [-6, 5]) g.box(xx, 0, zz, xx + 1, 2, zz, 0x2a2a30);
    // umbrella
    g.box(8, 12, -4, 8, 26, -4, 0xc8ccd8);
    for (let r = 0; r < 9; r++) g.cylinder(8, -4, 26 - Math.floor(r / 3), 26 - Math.floor(r / 3), 10 - r, r % 2 ? 0xffd23f : 0xe8343c);
    return g;
  }, { scale: 0.12 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, 'park');
  A.world.box(x - 1.3, z - 0.7, x + 1.3, z + 0.7);
  const sign = textPanel([{ text: 'BEAST DOGS', size: 0.24, color: '#ffd23f' }], { w: 2.2, h: 0.42, bg: '#b8282f', border: '#0d1029' });
  sign.position.set(x - 0.2, 1.05, z + 0.68);
  A.scene.add(sign);
  const hal = A.npc('stocker', {
    id: 'hotdogHal', name: 'Hot Dog Hal', pos: [x - 0.2, z - 1.4], facing: 0, react: 'wave',
    override: { shirt: 0xe8343c, accent: 0xffffff, hat: { type: 'cap', color: 0xffd23f }, hair: { style: 'short', color: 0x6b4428 } },
    lines: ['Hot dogs! Get your voxel hot dogs!', 'Extra mustard? Extra mustard.', 'Ketchup on a hot dog is a crime. Kidding!'],
    greet: ['Hungry, {name}?'],
    onTalk: async (n) => {
      const r = await A.line(n, 'One *Beast Dog*, fresh off the grill. On the house - Jimmy already paid for everyone!', { choices: ['Yes please!', 'No thanks'] });
      if (r !== 0) {
        await A.line(n, 'Your loss! More for the ducks.');
        return;
      }
      n.chibi.play('present', { dur: 0.8, then: 'idle' });
      const pl = A.player;
      pl.chibi.play('holdUp');
      pl.chibi.expr('happy', 'chew');
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          audio.play('chomp', { pitch: rand(0.9, 1.2) });
          fx.burst(_v.set(pl.pos.x, 1.4, pl.pos.z), { count: 6, colors: [0xe8a04a, 0xc8402a, 0xffd23f], speed: 2.4, size: 0.06, ground: pl.pos.y });
        }, 300 + i * 380);
      }
      await new Promise((r2) => setTimeout(r2, 1500));
      pl.chibi.expr('star', 'grin', 1.5);
      pl.chibi.play('idle');
      floatText(_v.set(pl.pos.x, 2.4, pl.pos.z), '+0 Calories', 'info');
      await A.line(n, "+0 Calories. They're voxels. But they're *delicious* voxels.");
    },
  });
  A.poi({ x, z, color: '#ffd23f', size: 2 });
}

function trophyPodium(A, x, z) {
  const p = A.put('makeTrophyPodium', [], { x, z, zone: 'park', collide: { r: 0.75 }, fit: { h: 2, clamp: 1.6 } });
  const best = state.p.bestTrophies;
  const next = ARENAS.filter((a) => !a.seasonal && a.trophies > best).sort((a, b) => a.trophies - b.trophies)[0];
  const sign = textPanel(
    [{ text: `BEST ${best}`, size: 0.24, color: '#ffd23f', icon: 'trophy' }, { text: next ? `NEXT: ${next.name.toUpperCase()} ${next.trophies}` : 'ALL ARENAS OPEN!', size: 0.12, color: '#ffffff' }],
    { w: 2.4, h: 0.72, bg: '#1c2558', border: '#ffd23f' },
  );
  sign.position.set(x, 2.55, z + 0.1);
  A.scene.add(sign);
  const proxy = pickProxy(0.9, 2.4);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  A.interact({
    id: 'podium', pos: new THREE.Vector3(x, 0, z + 1.4), range: 1.6, label: 'LOOK', icon: 'trophy', hit: proxy,
    act: () => {
      const pl = A.player;
      pl.chibi.play('point', { dur: 1.2, then: 'idle' });
      fx.sparkle(_v.set(x, 2.2, z), { count: 12, color: 0xffd23f });
      audio.play('coin');
      speech(pl.chibi, next ? `${next.trophies - best} more 🏆 to unlock ${next.name}!` : 'Every arena unlocked. Legend!', 2.4);
    },
  });
}

function billboard(A, x, z) {
  const geo = cachedGeometry('arena:billboard', () => {
    const g = new VoxGrid();
    for (const px of [-10, 9]) g.box(px, 0, 0, px + 1, 20, 1, 0x5d6476);
    g.box(-14, 20, -1, 14, 38, 0, 0x2a2f3c);
    for (let i = -12; i <= 12; i += 6) g.box(i, 18, 2, i, 18, 3, 0xfff1b0, true);
    return g;
  }, { scale: 0.12 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, 'park');
  A.world.box(x - 1.4, z - 0.3, x + 1.4, z + 0.3);
  const panel = textPanel(
    [
      { text: `SEASON ${SEASON.id}`, size: 0.28, color: '#ffffff' },
      { text: SEASON.name, size: 0.46, color: '#ffd23f' },
      { text: SEASON.tagline, size: 0.2, color: '#ffffff' },
    ],
    { w: 3.3, h: 2.05, bg: '#ff4fa3', border: '#ffd23f' },
  );
  panel.position.set(x, 3.5, z + 0.07);
  A.scene.add(panel);
}
