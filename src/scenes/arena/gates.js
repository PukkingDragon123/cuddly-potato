// Trophy Road furniture (arena pillars, entrance arch), locked-zone fences with
// trophy gates, and boss gates.
import * as THREE from 'three';
import { VoxGrid, makeMesh, cachedGeometry } from '../../core/voxel.js';
import { shade } from '../../core/util.js';
import { audio } from '../../core/audio.js';
import { fx } from '../../core/particles.js';
import { speech, floatText } from '../../ui/ui.js';
import { state } from '../../game/state.js';
import { ARENAS, BOSSES, arenaById } from '../../data/arena.js';
import { ZONES, roadPillars } from './layout.js';
import { textPanel, pickProxy } from './kit.js';
import { openBossModal } from './modals.js';

const cssToHex = (c) => parseInt(c.replace('#', ''), 16);
const _v = new THREE.Vector3();

export function buildGates(A) {
  for (const { arena, pos } of roadPillars()) pillar(A, arena, pos[0], pos[1]);
  roadArch(A, -18, 17);
  for (const z of ZONES) {
    if (!z.gate) continue;
    if (A.zoneUnlocked(z)) openGate(A, z);
    else lockZone(A, z);
  }
}

// ---------------------------------------------------------------------------

function pillar(A, arena, x, z) {
  const open = state.p.bestTrophies >= arena.trophies;
  const col = cssToHex(arena.color);
  const geo = cachedGeometry(`arena:pillar:${arena.id}:${open}`, () => {
    const g = new VoxGrid();
    const stone = open ? 0xe8e2d4 : 0x8a8f9c, dark = shade(stone, -0.2);
    g.box(-4, 0, -4, 3, 1, 3, dark);
    g.box(-3, 2, -3, 2, 17, 2, stone);
    g.paint((xx, y, zz, c) => (c === stone && y % 4 === 0 ? dark : undefined));
    g.box(-4, 18, -4, 3, 19, 3, open ? col : dark);
    g.box(-1, 20, -1, 0, 23, 0, open ? col : 0x5a5f6c, open);
    g.box(-2, 21, -1, 1, 22, 0, open ? shade(col, 0.3) : 0x5a5f6c, open);
    return g;
  }, { scale: 0.15 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, 'road');
  A.world.circle(x, z, 0.65);
  const sign = textPanel(
    [
      { text: arena.name.toUpperCase(), size: 0.17, color: open ? '#ffffff' : '#c8ccd8' },
      { text: open ? `${arena.trophies}` : `${arena.trophies}`, size: 0.3, color: open ? '#ffd23f' : '#ff8080', icon: open ? 'trophy' : 'lock' },
    ],
    { w: 2.3, h: 0.95, bg: open ? '#1c2558' : '#3a3f50', border: open ? arena.color : '#0d1029' },
  );
  sign.position.set(x, 1.7, z + 0.62);
  A.scene.add(sign);
  if (open) {
    const gem = new THREE.Vector3(x, 3.3, z);
    let acc = Math.random();
    A.onUpdate((dt) => {
      acc += dt;
      if (acc > 0.7) {
        acc = 0;
        fx.sparkle(gem, { count: 2, color: col, speed: 1, life: 0.8 });
      }
    }, x, z, 26);
  }
  A.poi({ x, z, color: arena.color, size: 2 });
}

function roadArch(A, x, z) {
  const geo = cachedGeometry('arena:roadArch', () => {
    const g = new VoxGrid();
    const s = 0xe8c37a, d = 0xb8894a;
    for (const px of [-16, 15]) {
      g.box(px - 1, 0, -1, px + 1, 26, 1, s);
      g.box(px - 2, 0, -2, px + 2, 1, 2, d);
      g.paint((xx, y, zz, c) => (c === s && y % 5 === 0 ? d : undefined));
    }
    g.box(-18, 27, -1, 17, 30, 1, d);
    g.box(-3, 31, 0, 2, 35, 0, 0xffd23f);
    g.box(-2, 32, 1, 1, 34, 1, 0xffe27a, true);
    return g;
  }, { scale: 0.15 });
  const m = makeMesh(geo);
  m.position.set(x, 0, z);
  A.addStatic(m, 'road');
  A.world.circle(x - 2.4, z, 0.35);
  A.world.circle(x + 2.3, z, 0.35);
  const sign = textPanel([{ text: 'TROPHY ROAD', size: 0.34, color: '#ffd23f', icon: 'trophy' }], { w: 4.6, h: 0.62, bg: '#5a3220', border: '#ffd23f' });
  sign.position.set(x, 4.3, z + 0.2);
  A.scene.add(sign);
}

// ---------------------------------------------------------------------------
// Zone gates

function gateFrame(A, z, open) {
  const [gx, gz] = z.gate;
  const col = cssToHex(z.color);
  const vertical = z.side === 'E' || z.side === 'W'; // fence runs along z
  const geo = cachedGeometry(`arena:gate:${z.id}:${open}`, () => {
    const g = new VoxGrid();
    const stone = 0x5d6476, cap = open ? col : 0x3a3f50;
    for (const px of [-17, 16]) {
      g.box(px - 2, 0, -2, px + 2, 24, 2, stone);
      g.box(px - 3, 25, -3, px + 3, 27, 3, cap);
      g.box(px - 1, 28, -1, px + 1, 30, 1, open ? shade(col, 0.3) : 0xff4a4a, true);
    }
    g.box(-15, 22, -1, 14, 24, 1, cap);
    if (!open) {
      for (let px = -14; px <= 13; px += 3) g.box(px, 0, 0, px, 21, 0, 0x2a2f3c);
      g.box(-15, 4, 0, 14, 5, 0, 0x2a2f3c);
      g.box(-15, 15, 0, 14, 16, 0, 0x2a2f3c);
      // big padlock
      g.box(-3, 8, 1, 2, 13, 2, 0xffd23f);
      g.box(-2, 14, 1, -2, 16, 1, 0xc8ccd8);
      g.box(1, 14, 1, 1, 16, 1, 0xc8ccd8);
      g.box(-2, 17, 1, 1, 17, 1, 0xc8ccd8);
      g.box(-1, 10, 3, 0, 11, 3, 0x0d1029);
    }
    return g;
  }, { scale: 0.12 });
  const m = makeMesh(geo);
  m.position.set(gx, 0, gz);
  if (vertical) m.rotation.y = Math.PI / 2;
  A.addStatic(m, 'gates');
  const half = 2.05;
  if (vertical) {
    A.world.circle(gx, gz - half, 0.35);
    A.world.circle(gx, gz + half, 0.35);
  } else {
    A.world.circle(gx - half, gz, 0.35);
    A.world.circle(gx + half, gz, 0.35);
  }
  const a = arenaById(z.arena);
  const lines = open
    ? [{ text: z.name.toUpperCase(), size: 0.24, color: '#ffffff' }]
    : [{ text: z.name.toUpperCase(), size: 0.2, color: '#ffffff' }, { text: `${a.trophies}`, size: 0.36, color: '#ffd23f', icon: 'trophy' }];
  const sign = textPanel(lines, { w: 3.6, h: open ? 0.6 : 1.05, bg: open ? z.color : '#b8282f', border: '#0d1029' });
  sign.position.set(gx + (z.side === 'E' ? 0.3 : z.side === 'W' ? -0.3 : 0), open ? 3.5 : 3.9, gz + (vertical ? 0 : 0.3) + (vertical ? 0 : 0));
  // face the camera (+z) for readability
  A.scene.add(sign);
  return { m, sign };
}

function openGate(A, z) {
  gateFrame(A, z, true);
}

function lockZone(A, z) {
  const a = arenaById(z.arena);
  const { sign } = gateFrame(A, z, false);
  const [x0, z0, x1, z1] = z.rect;
  // iron fence around the zone (instanced posts + rails), baked as static boxes
  const posts = [];
  const step = 1.5;
  const sides = [
    [[x0, z0], [x1, z0]],
    [[x1, z0], [x1, z1]],
    [[x1, z1], [x0, z1]],
    [[x0, z1], [x0, z0]],
  ];
  const [gx, gz] = z.gate;
  for (const [[ax, az], [bx, bz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.round(len / step);
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, zz = az + ((bz - az) * i) / n;
      if (Math.hypot(x - gx, zz - gz) < 2.4) continue;
      if (A.terrain.heightAt(x, zz) < -0.6) continue;
      posts.push([x, zz]);
    }
  }
  const postGeo = new THREE.BoxGeometry(0.16, 1.5, 0.16);
  const tipGeo = new THREE.BoxGeometry(0.24, 0.16, 0.24);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2a2f3c });
  const tipMat = new THREE.MeshLambertMaterial({ color: 0xffd23f });
  const inst = new THREE.InstancedMesh(postGeo, postMat, posts.length);
  const tips = new THREE.InstancedMesh(tipGeo, tipMat, posts.length);
  const m4 = new THREE.Matrix4();
  posts.forEach(([x, zz], i) => {
    const y = Math.max(0, A.terrain.heightAt(x, zz));
    m4.makeTranslation(x, y + 0.75, zz);
    inst.setMatrixAt(i, m4);
    m4.makeTranslation(x, y + 1.55, zz);
    tips.setMatrixAt(i, m4);
  });
  inst.castShadow = true;
  inst.computeBoundingSphere();
  tips.computeBoundingSphere();
  A.scene.add(inst, tips);
  // rails
  const railMat = postMat;
  for (const [[ax, az], [bx, bz]] of sides) {
    const len = Math.hypot(bx - ax, bz - az);
    for (const y of [0.45, 1.15]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), railMat);
      r.position.set((ax + bx) / 2, y, (az + bz) / 2);
      r.rotation.y = -Math.atan2(bz - az, bx - ax);
      A.addStatic(r, 'gates');
    }
  }
  // the whole zone is a solid box for the player (bounces back at the fence)
  let lastBump = 0;
  const bump = (ct, who) => {
    if (who !== A.player) return;
    const now = performance.now();
    if (now - lastBump < 1100) return;
    lastBump = now;
    const pl = A.player;
    pl.vel.x = ct.nx * 7;
    pl.vel.z = ct.nz * 7;
    pl.cancelPath();
    pl.chibi.play('hit');
    pl.chibi.boing(-0.3);
    pl.chibi.expr('dizzy', 'wobble', 1);
    audio.play('boing');
    audio.play('deny', { vol: 0.6 });
    speech(pl.chibi, `Need ${a.trophies} 🏆`, 1.8);
    fx.burst(_v.set(pl.pos.x - ct.nx * 0.4, 1, pl.pos.z - ct.nz * 0.4), { count: 6, colors: [0xffd23f, 0xffffff], speed: 3, size: 0.07, ground: 0 });
    // sign wiggle
    const base = sign.rotation.z;
    let t = 0;
    const wig = A.onUpdate((dt) => {
      if (t > 0.6) return;
      t += dt;
      sign.rotation.z = base + Math.sin(t * 40) * 0.08 * (1 - t / 0.6);
    });
  };
  A.world.box(x0, z0, x1, z1, { tag: 'locked', onBump: bump, npc: false, carts: true, data: z });
  A.poi({ x: gx, z: gz, color: '#ff4a4a', size: 3 });
  // the gate itself is tappable to show the requirement
  const proxy = pickProxy(1.4, 3);
  proxy.position.set(gx, 1.5, gz);
  A.scene.add(proxy);
  A.interact({
    id: 'gate:' + z.id,
    pos: new THREE.Vector3(gx + (z.side === 'E' ? 1.4 : z.side === 'W' ? -1.4 : 0), 0, gz + (z.side === 'S' ? 1.4 : 0)),
    range: 1.6,
    label: 'LOCKED',
    icon: 'lock',
    color: 'red',
    hit: proxy,
    act: () => {
      const pl = A.player;
      speech(pl.chibi, `${z.name} needs ${a.trophies} 🏆 (you have ${state.p.bestTrophies})`, 2.4);
      audio.play('deny', { vol: 0.6 });
      pl.chibi.play('facepalm', { dur: 0.9, then: 'idle' });
    },
  });
}

// ---------------------------------------------------------------------------
// Boss gates (called by zone builders)

const BOSS_COLORS = { kingClog: 0x7cff3a, jimmyRematch: 0xffd23f, cartKong: 0xff4fa3, megaMech: 0x5ce1e6, tigerUnleashed: 0xff8a2a };

export function placeBossGate(A, bossId, x, z, zone) {
  const b = BOSSES[bossId];
  if (!b) return null;
  const color = BOSS_COLORS[bossId] ?? 0xff4a4a;
  const g = A.put('makeBossGate', [color], { x, z, collide: false, dynamic: true, fit: { h: 6, clamp: 1.4 } });
  A.world.circle(x - 2.3, z, 0.55);
  A.world.circle(x + 2.3, z, 0.55);
  A.world.box(x - 2.6, z - 0.7, x + 2.6, z - 0.25);
  const defeated = state.p.bosses?.[bossId] ?? 0;
  const lines = [{ text: b.name.toUpperCase(), size: 0.26, color: '#ffffff', icon: 'skull' }];
  if (defeated) lines.push({ text: `DEFEATED x${defeated}`, size: 0.17, color: '#7cff6b' });
  else lines.push({ text: `BOSS · ${b.minTrophies}+`, size: 0.17, color: '#ffd23f', icon: 'trophy' });
  const sign = textPanel(lines, { w: 3.6, h: 0.9, bg: '#2a1030', border: '#' + color.toString(16).padStart(6, '0') });
  sign.position.set(x, 6.9, z + 0.2);
  A.scene.add(sign);
  const proxy = pickProxy(2.2, 5);
  proxy.position.set(x, 0, z);
  A.scene.add(proxy);
  const front = new THREE.Vector3(x, 0, z + 1.2);
  A.interact({
    id: 'boss:' + bossId,
    pos: front,
    range: 2.6,
    label: 'BOSS',
    icon: 'skull',
    color: 'red',
    hit: proxy,
    ringR: 1.6,
    act: () => openBossModal(A, bossId),
  });
  // walking straight into the vortex also opens the card
  A.interact({ id: 'bossAuto:' + bossId, pos: new THREE.Vector3(x, 0, z + 0.1), range: 0.9, auto: 'only', hidden: true, act: () => openBossModal(A, bossId) });
  let acc = 0;
  const p0 = new THREE.Vector3(x, 2.4, z + 0.2);
  A.onUpdate((dt) => {
    acc += dt;
    if (acc > 0.18) {
      acc = 0;
      fx.sparkle(_v.set(x + (Math.random() - 0.5) * 3.4, 0.4 + Math.random() * 4, z + 0.2), { count: 1, color, speed: 0.6, life: 1 });
    }
  }, x, z, 22);
  A.bossGates[bossId] = { x, z, front };
  A.poi({ x, z, color: '#ff2e88', size: 3 });
  return g;
}
