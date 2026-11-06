// Trophy Road mode of the home lobby: the road is part of Beast Island
// (models/island/trophyPath.js), so "opening" it flies the island camera down
// onto the road at your position. Drag pans along the road (with inertia, then
// it settles on the nearest stop), tapping a chest focuses it, CLAIM sends your
// Commander walking up to the chest to kick it open. Stops are the chests, the
// fork signposts (pick the COIN TRAIL or the VIAL TRAIL, game/roadForks.js) and
// the ROAD BOSS checkpoints (data/roadBosses.js): a big boss swarm behind a spiked
// barricade in front of every arena gate. Your trophies stop there until you beat
// it (FIGHT opens the boss modal, ui/home/boss.js); back from the win the boss
// collapses into a pixel poof, the barricade bursts and a loot chest drops.
//
// Back from a win (afterBattle) your Commander walks the road from the old trophy
// count to the new one with the camera following, kicking open every chest on the
// way (loot flies into the HUD), lifting a portcullis when an arena opens, and
// stopping in front of a boss. A tap skips to the end.
//
// Also owns the YOU marker (your Commander + a YOU flag standing at your trophy
// count) and paints the floating reward art into the road's atlas.
//
//   const road = setupIslandRoad(home);   // after the island + populate, before static batching
//   road.open(key?)  road.close()  road.active  road.refresh()  road.update(dt)  road.dispose()
//   road.afterBattle(params) -> Promise (resolves when the road view closes) | null
//   road.stops[i]  { kind: 'chest', i (milestone), M } | { kind: 'fork', f (TP fork), F (data) } | { kind: 'boss', B, rb }
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { Chibi } from '../core/chibi.js';
import { VoxGrid } from '../core/voxel.js';
import { text, textW } from '../models/props/common.js';
import * as IP from '../models/island/props.js';
import { createSwarm } from '../models/swarmModels.js';
import { CHARACTERS } from '../data/characters.js';
import { COMMANDERS } from '../data/commanders.js';
import { ARENAS } from '../data/arenas.js';
import { SPELLS } from '../data/spells.js';
import { cardDef } from '../data/cards.js';
import { roadBossState, blockingBoss } from '../data/roadBosses.js';
import { state, claimTrophyRoad, pendingArenaUnlock } from '../game/state.js';
import { featureRevealed } from '../game/progression.js';
import { forkChoice, forkItemState, claimForkItem, chooseFork, pendingForks, forkReached, forkDone } from '../game/roadForks.js';
import { iconURL, speech } from '../ui/ui.js';
import { swarmThumbAsync, spellThumbAsync, labSkinThumb } from '../ui/thumbs.js';
import { cmdOverride } from '../ui/home/common.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const BOSS_H = 4.3; // a road boss stands this tall (your Commander is about 2.75)

/** The voxel YOU flag: a tall pole (the flag flies above your Commander's head toward -x), white letters on both faces. */
function youFlagGrid() {
  const g = new VoxGrid();
  const top = 42;
  g.box(0, 0, 0, 0, top, 0, 0x6e4224);
  g.box(-1, 0, -1, 1, 0, 1, 0x4a2e18);
  g.box(-1, top + 1, -1, 1, top + 2, 1, 0xffc21a);
  const W = textW('YOU') + 4, y0 = top - 10;
  g.box(-W, y0, 0, -1, y0 + 9, 0, 0x2b8cf2);
  g.box(-W, y0, 0, -1, y0, 0, 0x1460b8);
  g.box(-W, y0 + 9, 0, -1, y0 + 9, 0, 0x6cc0ff);
  // swallow tail
  g.box(-W - 1, y0, 0, -W - 1, y0 + 3, 0, 0x2b8cf2);
  g.box(-W - 1, y0 + 6, 0, -W - 1, y0 + 9, 0, 0x2b8cf2);
  g.box(-W - 2, y0, 0, -W - 2, y0 + 1, 0, 0x2b8cf2);
  g.box(-W - 2, y0 + 8, 0, -W - 2, y0 + 9, 0, 0x2b8cf2);
  text(g, 'YOU', -W + 2, y0 + 2, 1, '+z', 0xffffff);
  text(g, 'YOU', -3, y0 + 2, -1, '-z', 0xffffff);
  return g;
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function setupIslandRoad(home) {
  const I = home.I;
  const TP = I?.trophyPath;
  if (!TP) return null;
  const ms = TP.milestones;
  const bosses = TP.bosses ?? [];
  const camDir = TP.camDir; // Vector2 (x, z)
  const faceY = Math.atan2(camDir.x, camDir.y);
  // mode state (the road view, its HUD, a running walk sequence: { skip, abort, loot, touched })
  let hud = null, hudMod = null;
  let active = false, flying = false, disposed = false;
  let s = 0, v = 0, target = null, focus = -1, drag = null, lastShadow = -99;
  let sCam = 0;
  let seq = null;
  let seqCam = null; // a walk sequence can hold the camera on a spot ({ s }) instead of following your Commander
  let autoClose = null;
  const closeWaiters = [];

  // ------------------------------------------------ YOU marker (+ the walker that moves it)
  const you = new THREE.Group();
  you.name = 'trophyRoadYou';
  home.scene.add(you);
  const flag = IP.mesh(IP.geo('trYouFlag', youFlagGrid, 0.1, [0, 0, 0]), {});
  flag.position.set(0.75, 0, -0.55);
  you.add(flag);
  let chibi = null;
  let chibiKey = '';
  function buildChibi() {
    const cmd = state.p.commanders?.equipped ?? 'recruit';
    const skin = state.p.commanders?.owned?.[cmd]?.skin ?? null;
    const key = cmd + '|' + skin;
    if (key === chibiKey && chibi) return;
    chibiKey = key;
    if (chibi) you.remove(chibi.root);
    const charId = COMMANDERS[cmd]?.char ?? 'recruit';
    const def = { ...(CHARACTERS[charId] ?? CHARACTERS.recruit), ...(skin ? cmdOverride(skin) ?? {} : {}) };
    chibi = new Chibi(def, { scale: 1.45 });
    chibi.play('idle');
    you.add(chibi.root);
  }
  buildChibi();
  you.rotation.y = faceY;
  let youS = 0;
  // walker: where your Commander is right now (route position + an optional step off the road)
  const W = { s: 0, legs: [], yaw: 0, yawTo: 0, home: true, off: false, flagPop: -1, job: 0 };
  function placeYou() {
    youS = TP.sOfTrophies(state.p.trophies, picks());
    if (W.legs.length || seq) return; // a walk owns the marker meanwhile
    W.s = youS;
    W.home = true;
    TP.posAt(youS, _v);
    you.position.set(_v.x, _v.y, _v.z);
    TP.setTrail?.(youS);
  }

  // ------------------------------------------------ stops: every chest, fork signpost and road boss, in road order
  const forks = TP.forks ?? [];
  const stops = [];
  ms.forEach((M, i) => stops.push({ kind: 'chest', i, M, t: M.t, ord: M.side === 'b' ? 2 : M.side === 'a' ? 1 : 0 }));
  for (const f of forks) stops.push({ kind: 'fork', f, F: f.F, t: f.F.lo, ord: 0.5 });
  for (const B of bosses) stops.push({ kind: 'boss', B, rb: B.rb, t: B.t, ord: 0.9 });
  stops.sort((a, b) => a.t - b.t || a.ord - b.ord);
  const stopOfMs = new Map(stops.map((st, k) => [st.kind === 'chest' ? st.i : st.kind === 'fork' ? 'f:' + st.f.id : 'b:' + st.B.id, k]));
  const picks = () => Object.fromEntries(forks.map((f) => [f.id, forkChoice(f.id)]).filter(([, c]) => c));

  // ------------------------------------------------ chest states (+ taps on the island open the road)
  const stateOf = (M) => {
    if (M.fork) return forkItemState(M.m);
    return state.p.trophyRoad[M.key] ? 'claimed' : state.p.bestTrophies >= M.t ? 'ready' : 'locked';
  };
  /** 'ready' | 'claimed' | 'locked' for chests; 'pick' | 'picked' | 'open' | 'ahead' for forks; 'fight' | 'ahead' | 'open' for bosses. */
  const stopState = (k) => {
    const st = stops[k];
    if (!st) return 'locked';
    if (st.kind === 'chest') return stateOf(st.M);
    if (st.kind === 'boss') { const b = roadBossState(state.p, st.rb); return b === 'beaten' ? 'open' : b; }
    if (forkDone(st.F)) return 'open';
    if (forkChoice(st.F.id)) return 'picked';
    return forkReached(st.F) ? 'pick' : 'ahead';
  };
  function applyRoute(animate = false) {
    const ch = picks();
    TP.setChoices?.(ch);
    for (const f of forks) {
      const c = ch[f.id];
      TP.setBarrier?.(f.id, c && !forkDone(f.F) ? (c === 'a' ? 'b' : 'a') : null, { animate });
    }
  }
  // chests a walk has not reached yet stay closed (they pop open as your Commander arrives)
  const held = new Set();
  // portcullis a walk already lifted (the arena unlock cinematic plays after the walk)
  const lifted = new Set();
  function applyStates() {
    ms.forEach((M, i) => { if (M.state !== 'opening') TP.setState(i, held.has(i) ? 'locked' : stateOf(M)); });
    for (const A of ARENAS) TP.setGateLocked(A.id, I.isLocked(A.id) && !lifted.has(A.id));
    syncBosses();
  }

  // ------------------------------------------------ road bosses: the swarm itself, standing behind its barricade
  const figs = new Map(); // id -> { B, rig, t, next, dying }
  const R = () => state.p.roadBoss ?? { won: {}, seen: {} };
  /** Stands on the road: not beaten yet, or beaten in a fight whose fall you have not watched yet. */
  const standing = (B) => roadBossState(state.p, B.rb) !== 'beaten' || (!!R().won?.[B.id] && !R().seen?.[B.id]);
  function syncBosses() {
    const first = bosses.find((B) => roadBossState(state.p, B.rb) !== 'beaten');
    for (const B of bosses) {
      const up = standing(B);
      if (!figs.get(B.id)?.dying && !B.anim) TP.setBossBarrier?.(B.id, up);
      // only the next boss (and any you just beat) is built: one swarm rig on the island at a time
      const want = up && (B === first || roadBossState(state.p, B.rb) === 'beaten');
      const F = figs.get(B.id);
      if (want && !F) buildFig(B);
      else if (!want && F && !F.dying) dropFig(B.id);
    }
  }
  function buildFig(B) {
    const rig = createSwarm(B.rb.unit, { scale: 1 });
    const k = BOSS_H / Math.max(0.5, rig.height || 1);
    rig.root.scale.setScalar(k);
    rig.root.position.copy(B.pos);
    rig.root.rotation.y = B.yaw;
    rig.posed = true;
    rig.setState('idle');
    rig.root.name = 'roadBoss:' + B.id;
    home.scene.add(rig.root);
    const F = { B, rig, k, t: 0, next: 2 + Math.random() * 2, dying: null, n: 0 };
    figs.set(B.id, F);
    home.addPick(rig.root, async () => {
      if (roadLocked()) { home.roadBtn.click(); return; }
      // onto the road, and straight into the fight when it blocks you
      await ctl.open('boss:' + B.id);
      const k = stopOfMs.get('b:' + B.id);
      if (active && k !== undefined && stopState(k) === 'fight') hud?.fight(k);
    }, { radius: 2.2, tagH: BOSS_H * 0.55 });
    return F;
  }
  function dropFig(id) {
    const F = figs.get(id);
    if (!F) return;
    home.scene.remove(F.rig.root);
    home.pickables = home.pickables.filter((pk) => pk.obj !== F.rig.root);
    figs.delete(id);
  }
  function updateFigs(dt) {
    for (const F of figs.values()) {
      const rig = F.rig;
      F.t += dt;
      if (F.dying) {
        const D = F.dying;
        D.t += dt;
        // staggers, then topples backwards and sinks
        if (D.t < 0.9) { rig.root.rotation.z = Math.sin(D.t * 30) * 0.05 * (1 - D.t / 0.9); }
        else {
          const u = Math.min(1, (D.t - 0.9) / 0.45);
          rig.root.rotation.x = -u * u * 1.35;
          rig.root.position.y = F.B.pos.y - Math.max(0, D.t - 1.2) * 1.6;
        }
        rig.update(dt);
        continue;
      }
      // idle menace: a slow heavy breath, a roar or a stomp every few seconds
      rig.root.scale.set(F.k, F.k * (1 + Math.sin(F.t * 2.2) * 0.025), F.k);
      F.next -= dt;
      if (F.next <= 0) {
        F.n++;
        const roar = F.n % 2 === 1;
        rig.play(roar ? 'roar' : 'stomp', roar ? 1.5 : 0.9);
        F.next = 4.5 + Math.random() * 2.5;
        if (active && !seq && Math.abs(sCam - F.B.s) < 16) {
          if (roar) audio.play('roar', { vol: 0.35, pitch: 0.8 + Math.random() * 0.15 });
          else setTimeout(() => { if (active) { audio.play('thud', { vol: 0.5 }); engine.shake(0.06); } }, 450);
        }
      }
      rig.update(dt);
    }
  }
  // the road's own taps (chests, fork signs) open the road too
  const roadLocked = () => home.roadBtn?.classList.contains('pg-lock');
  applyRoute();
  applyStates();
  placeYou();
  ms.forEach((M, i) => home.addPick(M.chest, () => {
    // the road button knows whether the Trophy Road is unlocked yet (ui/guide.js gates its taps)
    if (roadLocked()) { home.roadBtn.click(); return; }
    ctl.open(i);
  }, { radius: 1.3 }));
  for (const f of forks) for (const sd of ['a', 'b']) {
    home.addPick(f.signs[sd].mesh, () => { if (roadLocked()) { home.roadBtn.click(); return; } ctl.open('fork:' + f.id); }, { radius: 1.4, tagH: 2.4 });
  }

  // ------------------------------------------------ reward art (painted progressively, nearest first)
  const atlas = TP.atlas;
  const queue = ms.map((M, i) => i);
  let painting = false, dirty = false, lastCommit = 0;
  const fontReady = document.fonts?.load ? document.fonts.load('32px "Swarm Display"').catch(() => {}) : Promise.resolve();
  const loadImg = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  async function artFor(r) {
    switch (r.type) {
      case 'coins': return { pixel: iconURL(r.amount >= 2500 ? 'coinChest' : r.amount >= 900 ? 'coinPile' : r.amount >= 300 ? 'coinStack' : 'coin'), amt: r.amount };
      case 'bucks': return { pixel: iconURL(r.amount >= 60 ? 'bucksPile' : 'bucks'), amt: r.amount, amtCol: '#ff8ad8' };
      case 'calories': return { pixel: iconURL('calorie'), amt: r.amount };
      case 'vial': {
        try { const m = await import('../ui/vialThumb.js'); return { img: m.vialThumb(r.id, 128) }; } catch (e) { return { pixel: iconURL('vial') }; }
      }
      case 'card': case 'swarm': case 'spell': {
        const d = cardDef(r.id);
        const img = SPELLS[r.id] ? await spellThumbAsync(r.id, 128) : await swarmThumbAsync(r.id, 'base', null, 128);
        return { card: img, rarity: d?.rarity ?? 'common', copies: r.copies ?? 1 };
      }
      case 'mega': return { card: await swarmThumbAsync(r.id, r.variant ?? 'base', null, 128), rarity: r.variant === 'gold' ? 'gold' : 'mega', tag: 'MEGA' };
      case 'labSkin': return { img: await labSkinThumb(r.id === 'default' ? 'default' : r.id, 128).catch(() => null) ?? iconURL('paint') };
      case 'banner': return { pixel: iconURL('flag') };
      case 'commander': case 'cmdSkin': return { pixel: iconURL('crown') };
      default: return { pixel: iconURL('star') };
    }
  }
  const RAR = { common: '#b8c6e8', rare: '#ff9a2e', epic: '#c063ff', legendary: '#3ff2c8', mythic: '#ff2e88', mega: '#ff4fa3', gold: '#ffc21a' };
  function outlined(ctx, str, x, y, size, fill) {
    ctx.font = `${size}px "Swarm Display", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const o = Math.max(2, Math.round(size / 9));
    ctx.fillStyle = '#120c24';
    for (let dx = -o; dx <= o; dx += o) for (let dy = -o; dy <= o + 1; dy += o) ctx.fillText(str, x + dx, y + dy);
    ctx.fillText(str, x, y + o + 2);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }
  const short = (n) => n.toLocaleString('en-US');
  async function paint(i) {
    const M = ms[i];
    const a = await artFor(M.m.reward ?? {});
    await fontReady;
    const ctx = atlas.ctx, C = atlas.cell;
    const [x0, y0] = atlas.origin(i);
    ctx.clearRect(x0, y0, C, C);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, C, C);
    ctx.clip();
    if (a.card) {
      // a little card: ink frame, rarity border, art, copies badge
      const im = await loadImg(a.card);
      const w = Math.round(C * 0.7), hh = Math.round(C * 0.88);
      const cx = x0 + Math.round((C - w) / 2), cy = y0 + Math.round((C - hh) / 2);
      const B = Math.max(3, Math.round(C / 30));
      ctx.fillStyle = '#120c24'; ctx.fillRect(cx, cy, w, hh);
      ctx.fillStyle = RAR[a.rarity] ?? RAR.common; ctx.fillRect(cx + B, cy + B, w - B * 2, hh - B * 2);
      ctx.fillStyle = '#1c1438'; ctx.fillRect(cx + B * 2, cy + B * 2, w - B * 4, hh - B * 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx + B, cy + B, w - B * 2, B);
      if (im) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, cx + B * 2, cy + B * 2, w - B * 4, hh - B * 4); }
      if (a.tag) outlined(ctx, a.tag, x0 + C / 2, cy + hh - B * 2, Math.round(C * 0.22), a.rarity === 'gold' ? '#ffe680' : '#ffffff');
      else if (a.copies > 1) outlined(ctx, 'x' + a.copies, cx + w - B * 4, cy + hh - B * 2, Math.round(C * 0.26), '#ffffff');
    } else if (a.img) {
      const im = await loadImg(a.img);
      if (im) { ctx.imageSmoothingEnabled = true; ctx.drawImage(im, x0 + C * 0.04, y0 + C * 0.04, C * 0.92, C * 0.92); }
    } else if (a.pixel) {
      const im = await loadImg(a.pixel);
      const s = a.amt ? 0.7 : 0.86;
      if (im) { ctx.imageSmoothingEnabled = false; ctx.drawImage(im, x0 + C * (1 - s) / 2, y0 + (a.amt ? C * 0.02 : C * (1 - s) / 2), C * s, C * s); }
      if (a.amt) outlined(ctx, short(a.amt), x0 + C / 2, y0 + C * 0.9, Math.round(C * (String(a.amt).length > 4 ? 0.25 : 0.3)), a.amtCol ?? '#ffe680');
    }
    ctx.restore();
    atlas.painted(i);
    dirty = true;
  }
  function pump() {
    if (painting || !queue.length || disposed) return;
    painting = true;
    // nearest to the camera's look point first
    const L = home.cam.look;
    let bi = 0, bd = Infinity;
    for (let q = 0; q < queue.length; q++) {
      const d = ms[queue[q]].anchor.distanceToSquared(L);
      if (d < bd) { bd = d; bi = q; }
    }
    const i = queue.splice(bi, 1)[0];
    paint(i).catch((e) => console.warn('trophy road art', e)).finally(() => { painting = false; });
  }

  // ------------------------------------------------ road camera
  let pitchTab = null, pitchDist = 0, pitchLen = 0;
  const camDist = () => {
    const a = home.camera.aspect;
    return a < 1 ? 27 * Math.min(1.9, Math.max(1, 0.8 / a)) : a < 1.4 ? 30 : 27;
  };
  function buildPitch(dist) {
    pitchDist = dist;
    pitchLen = TP.length;
    const n = Math.ceil(TP.length) + 1;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      TP.posAt(i, _v);
      let p = 40;
      for (let tries = 0; tries < 14; tries++) {
        const r = (p * Math.PI) / 180;
        const cx = _v.x + camDir.x * Math.cos(r) * dist, cy = _v.y + Math.sin(r) * dist, cz = _v.z + camDir.y * Math.cos(r) * dist;
        let blocked = false;
        for (let s = 0.1; s < 1; s += 0.03) {
          const x = _v.x + (cx - _v.x) * s, y = _v.y + (cy - _v.y) * s, z = _v.z + (cz - _v.z) * s;
          if (I.heightAt(x, z) + 1.0 > y) { blocked = true; break; }
        }
        if (!blocked) break;
        p += 3;
      }
      raw[i] = p;
    }
    // widen (max) then soften (mean) so the camera never pops while panning
    const mx = new Float32Array(n), out = new Float32Array(n);
    for (let i = 0; i < n; i++) { let m = 0; for (let j = Math.max(0, i - 7); j <= Math.min(n - 1, i + 7); j++) m = Math.max(m, raw[j]); mx[i] = m; }
    for (let i = 0; i < n; i++) { let s = 0, c = 0; for (let j = Math.max(0, i - 6); j <= Math.min(n - 1, i + 6); j++) { s += mx[j]; c++; } out[i] = s / c; }
    pitchTab = out;
  }
  const pitchAt = (s) => {
    const i = Math.max(0, Math.min(pitchTab.length - 2, Math.floor(s)));
    const u = Math.max(0, Math.min(1, s - i));
    return pitchTab[i] + (pitchTab[i + 1] - pitchTab[i]) * u;
  };
  // sideways framing offset: a chest on the trail you are not following, or a whole fork, sits off the route
  const lat = new THREE.Vector3(), latTo = new THREE.Vector3();
  function camFor(s, out) {
    const dist = pitchDist;
    TP.posAt(s, _w);
    const look = out.look.set(_w.x + lat.x, _w.y + 1.1, _w.z + lat.z);
    // the bottom card covers the lower screen: aim a touch below the road so it sits above the card
    look.y -= dist * 0.012;
    const r = (pitchAt(s) * Math.PI) / 180;
    out.pos.set(look.x + camDir.x * Math.cos(r) * dist, look.y + Math.sin(r) * dist, look.z + camDir.y * Math.cos(r) * dist);
    return out;
  }
  /** Route position + sideways offset that frame stop k. */
  function stopFrame(k) {
    const st = stops[k];
    if (st.kind === 'chest') {
      const M = st.M;
      TP.posAt(M.s, _w);
      latTo.set(M.roadPos.x - _w.x, 0, M.roadPos.z - _w.z);
      if (latTo.lengthSq() < 4) latTo.set(0, 0, 0);
      return M.s;
    }
    if (st.kind === 'boss') {
      // your stop, the barricade and the boss behind it (framed on their middle, wherever the road bends)
      const B = st.B;
      const sm = (B.stopS + B.s) / 2;
      TP.posAt(sm, _w);
      latTo.set(B.bar.position.x - _w.x, 0, B.bar.position.z - _w.z);
      return sm;
    }
    // a fork: both trail signs and the first stretch of both trails
    const f = st.f;
    const sMid = f.sSign + 4;
    TP.posAt(sMid, _w);
    latTo.set(f.signPos.x - _w.x, 0, f.signPos.z - _w.z).multiplyScalar(0.9);
    return sMid;
  }

  // ------------------------------------------------ the mode itself
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const stopS = (k) => { const st = stops[k]; return st.kind === 'chest' ? st.M.s : st.kind === 'boss' ? (st.B.stopS + st.B.s) / 2 : st.f.sSign + 4; };
  const nearestStop = (sv) => {
    let bi = -1, bd = Infinity;
    stops.forEach((st, k) => {
      // stops on the trail you are not following are skipped when settling after a drag
      if (st.kind === 'chest' && st.M.fork && (forkChoice(st.M.fork) ?? 'a') !== st.M.side) return;
      const d = Math.abs(stopS(k) - sv);
      if (d < bd) { bd = d; bi = k; }
    });
    return bi;
  };
  function setFocus(k, fly = true) {
    if (k < 0 || k >= stops.length) return;
    focus = k;
    const st = stops[k];
    TP.setFocus(st.kind === 'chest' ? st.i : -1);
    if (fly) target = stopFrame(k);
    else stopFrame(k);
    hud?.focus(k);
  }
  function firstFocus(key) {
    if (key !== undefined && key !== null) {
      if (typeof key === 'string' && key.startsWith('fork:')) {
        const j = stops.findIndex((st) => st.kind === 'fork' && st.f.id === key.slice(5));
        if (j >= 0) return j;
      }
      if (typeof key === 'string' && key.startsWith('boss:')) {
        const j = stops.findIndex((st) => st.kind === 'boss' && st.B.id === key.slice(5));
        if (j >= 0) return j;
      }
      const i = typeof key === 'number' ? key : ms.findIndex((M) => M.key === key);
      if (i >= 0 && stopOfMs.has(i)) return stopOfMs.get(i);
    }
    // a fork waiting for your pick first, then a claimable reward near you, a boss in your way, else the next reward ahead
    const pend = pendingForks()[0];
    if (pend) { const j = stops.findIndex((st) => st.kind === 'fork' && st.f.id === pend.id); if (j >= 0) return j; }
    const ready = stops.map((st, k) => k).filter((k) => stopState(k) === 'ready');
    const close = ready.filter((k) => Math.abs(stopS(k) - youS) < 30);
    if (close.length) return close[close.length - 1];
    const blk = blockingBoss(state.p);
    if (blk) { const j = stopOfMs.get('b:' + blk.id); if (j !== undefined) return j; }
    if (ready.length) return ready[ready.length - 1];
    const next = stops.findIndex((st) => st.t > state.p.trophies && (st.kind !== 'chest' || !st.M.fork || (forkChoice(st.M.fork) ?? 'a') === st.M.side));
    return next >= 0 ? next : stops.length - 1;
  }

  // ------------------------------------------------ walking: legs along the route / straight to a point, plus waits
  const routePos = (sv, out) => TP.posAt(Math.max(0, Math.min(TP.length, sv)), out);
  function leg(o) {
    return new Promise((resolve) => { W.legs.push({ ...o, t: 0, resolve }); });
  }
  const sleep = (sec) => leg({ kind: 'wait', dur: sec });
  /** Walk (or run, when far) along the route to s1. */
  function along(s1, o = {}) {
    const d = Math.abs(s1 - W.s);
    if (d < 0.05) return Promise.resolve();
    const run = d > 4.5;
    // a long way back down the road is a sprint (never more than ~2.6 s), a few steps are a walk
    const speed = run ? Math.max(6.2, d / 2.6) : 3.4;
    return leg({ kind: 'road', s0: null, s1, dur: d / speed, run, follow: o.follow !== false });
  }
  /** Step from where you are to a world point (off the road, to a chest). */
  function stepTo(p, speed = 3, o = {}) {
    return leg({ kind: 'point', p0: null, p1: p.clone(), dur: Math.max(0.12, p.distanceTo(you.position) / speed), follow: o.follow !== false });
  }
  function faceTo(x, z) { W.yawTo = Math.atan2(x - you.position.x, z - you.position.z); }
  function updateWalk(dt) {
    const L = W.legs[0];
    if (!L) return;
    if (L.t === 0 && L.kind === 'road') {
      L.s0 = W.s;
      W.home = false;
      flag.visible = false;
      chibi?.play(L.run ? 'run' : 'walk');
    }
    if (L.t === 0 && L.kind === 'point') {
      L.p0 = you.position.clone();
      W.home = false;
      flag.visible = false;
      if (L.dur > 0.2) chibi?.play('walk');
    }
    L.t += dt * (seq?.skip ? 50 : 1);
    const u = Math.min(1, L.t / Math.max(1e-3, L.dur));
    if (L.kind === 'road') {
      const prev = _w.copy(you.position);
      W.s = L.s0 + (L.s1 - L.s0) * u;
      routePos(W.s, _v);
      you.position.copy(_v);
      const dx = _v.x - prev.x, dz = _v.z - prev.z;
      if (dx * dx + dz * dz > 1e-6) W.yawTo = Math.atan2(dx, dz);
    } else if (L.kind === 'point') {
      you.position.lerpVectors(L.p0, L.p1, u);
      const dx = L.p1.x - L.p0.x, dz = L.p1.z - L.p0.z;
      if (dx * dx + dz * dz > 1e-4) W.yawTo = Math.atan2(dx, dz);
    }
    if (u >= 1) {
      W.legs.shift();
      if (L.kind !== 'wait' && !W.legs.some((q) => q.kind !== 'wait')) chibi?.play('idle');
      L.resolve();
    }
  }
  function updateYou(dt) {
    // your Commander turns toward where he is going (the YOU group itself keeps facing the camera)
    if (W.home && !W.legs.length) W.yawTo = faceY;
    W.yaw += angDiff(W.yawTo, W.yaw) * Math.min(1, dt * 10);
    if (chibi) chibi.root.rotation.y = W.yaw - faceY;
    if (W.flagPop >= 0) {
      W.flagPop += dt;
      const u = Math.min(1, W.flagPop / 0.35);
      flag.scale.set(1, Math.max(0.01, u * (1 + Math.sin(u * Math.PI) * 0.25)), 1);
      if (u >= 1) W.flagPop = -1;
    }
  }
  /** Drop every queued leg (their promises resolve, the walks that queued them see a new job and stop). */
  function cancelLegs() {
    const legs = W.legs.splice(0);
    for (const L of legs) L.resolve();
  }
  /** Back to your trophy spot: onto the road, along it, flag planted (the camera stays where you are looking). */
  async function walkHome() {
    const job = W.job;
    if (W.off) { routePos(W.s, _v); await stepTo(_v.clone(), 3, { follow: false }); if (job !== W.job) return; W.off = false; }
    await along(youS, { follow: false });
    if (job !== W.job) return;
    W.home = true;
    flag.visible = true;
    W.flagPop = 0;
    TP.setTrail?.(youS);
  }
  /** Walk up to chest stop k (off the road to its front) and face it. */
  async function walkToChest(M) {
    const job = W.job;
    if (W.off) { routePos(W.s, _v); await stepTo(_v.clone()); W.off = false; }
    if (job !== W.job) return;
    await along(M.s);
    if (job !== W.job) return;
    await stepTo(M.standPos, 3.2);
    W.off = true;
    faceTo(M.anchor.x, M.anchor.z);
    await sleep(0.12);
  }
  /** The kick: the lid bursts, the coins spill and the reward is yours. Returns the granted rewards. */
  async function kickOpen(k) {
    const st = stops[k];
    const M = st.M;
    if (stateOf(M) !== 'ready') return [];
    if (!seq?.skip) {
      chibi?.play('kick', { restart: true, dur: 0.62, then: 'idle' });
      audio.play('swing', { pitch: 1.2 });
      await sleep(0.27);
    }
    audio.play('kick');
    held.delete(st.i);
    return claimNow(k);
  }
  function claimNow(k) {
    const st = stops[k];
    const M = st.M;
    if (stateOf(M) !== 'ready') return [];
    TP.open(st.i); // before the claim: its state change refreshes every chest
    const got = M.fork ? claimForkItem(M.m) : claimTrophyRoad(M.m);
    if (!got.length) { TP.setState(st.i, stateOf(M)); return got; }
    audio.play('chaching');
    audio.play('pop', { pitch: 1.2 });
    setTimeout(() => audio.play('coin', { pitch: 1.1 }), 260);
    engine.shake(0.12);
    return got;
  }

  // ------------------------------------------------ the boss falls (back from a won road boss fight)
  let lootChest = null;
  async function defeatBoss(B, bossRes) {
    const F = figs.get(B.id) ?? buildFig(B);
    const kB = stopOfMs.get('b:' + B.id);
    if (kB !== undefined) setFocus(kB, false);
    // the camera holds on you and the boss while it falls
    seqCam = { s: (B.stopS + B.s) / 2 + 0.4 };
    hud?.walking(true);
    await sleep(seq?.skip ? 0 : 0.7);
    // it staggers (white flashes), roars one last time and topples over
    F.dying = { t: 0 };
    F.rig.play('roar', 0.9);
    audio.play('hitHeavy');
    for (let j = 0; j < 3; j++) setTimeout(() => { F.rig.flash(0.09); audio.play('hit', { pitch: 0.7 + j * 0.15 }); }, 120 + j * 230);
    await sleep(1.25);
    if (stopped()) { dropFig(B.id); return; }
    audio.play('boom');
    engine.shake(0.35);
    const mid = B.pos.clone().setY(B.pos.y + BOSS_H * 0.45);
    hud?.poof(mid, BOSS_H);
    await sleep(0.12);
    dropFig(B.id);
    // the barricade bursts
    TP.breakBarricade?.(B.id);
    audio.play('crunch', { pitch: 0.8 });
    hud?.debris(B.bar.position.clone().setY(B.bar.position.y + 0.8));
    const Rb = state.p.roadBoss;
    if (Rb) { if (!Rb.seen) Rb.seen = {}; Rb.seen[B.id] = Date.now(); state.save(); }
    await sleep(0.7);
    // its loot chest drops where it stood, you walk up and kick it open
    const got = bossRes?.road && bossRes.rewards?.length ? bossRes.rewards : null;
    if (got) {
      const C = dropLootChest(B);
      await sleep(0.75);
      seqCam = null;
      if (W.off) { routePos(W.s, _v); await stepTo(_v.clone()); W.off = false; }
      await along(B.stopS + 0.4);
      const front = B.pos.clone().add(_w.set(Math.sin(B.yaw), 0, Math.cos(B.yaw)).multiplyScalar(1.65));
      front.y = Math.max(I.heightAt(front.x, front.z), B.pos.y);
      await stepTo(front, 3.2);
      W.off = true;
      faceTo(B.pos.x, B.pos.z);
      await sleep(0.1);
      if (!seq?.skip) { chibi?.play('kick', { restart: true, dur: 0.62, then: 'idle' }); await sleep(0.27); }
      audio.play('kick');
      C.open = 0;
      TP.spillAt?.(C.g.position, 26, C.g.position.y);
      audio.play('chaching');
      engine.shake(0.15);
      hud?.loot(got, C.g.position.clone().setY(C.g.position.y + 1.2), seq);
      await sleep(0.8);
    }
    seqCam = null;
  }
  function dropLootChest(B) {
    if (lootChest) home.scene.remove(lootChest.g);
    const parts = TP.chestParts('gold');
    const g = new THREE.Group();
    const body = IP.mesh(parts.body, {}), lid = IP.mesh(parts.lid, {});
    lid.position.set(0, parts.lidY, parts.lidZ);
    g.add(body, lid);
    g.position.copy(B.pos).setY(B.pos.y + 6);
    g.rotation.y = B.yaw;
    g.scale.setScalar(1.35);
    home.scene.add(g);
    lootChest = { g, lid, y0: B.pos.y + 0.02, vy: 0, open: -1, t: 0 };
    audio.play('whoosh', { pitch: 0.7 });
    return lootChest;
  }
  function updateLoot(dt) {
    const C = lootChest;
    if (!C) return;
    C.t += dt;
    if (C.g.position.y > C.y0 || C.vy > 0) {
      C.vy -= 22 * dt;
      C.g.position.y += C.vy * dt;
      if (C.g.position.y <= C.y0) {
        C.g.position.y = C.y0;
        if (C.vy < -3) { C.vy = -C.vy * 0.3; audio.play('thud', { vol: 0.7 }); engine.shake(0.1); } else C.vy = 0;
      }
    }
    if (C.open >= 0) {
      C.open += dt;
      const u = Math.min(1, C.open / 0.4);
      C.lid.rotation.x = -(2.2 * (1 - Math.pow(1 - u, 3)) - Math.sin(u * Math.PI) * 0.15);
    }
  }

  // ------------------------------------------------ the walk after a win: old trophies -> new trophies
  /** Chests on your route between two route positions, in walking order. */
  function chestsBetween(sa, sb) {
    const ch = picks();
    return stops.map((st, k) => ({ st, k })).filter(({ st }) => {
      if (st.kind !== 'chest') return false;
      const M = st.M;
      if (M.fork && (!ch[M.fork] || ch[M.fork] !== M.side)) return false;
      return M.s > sa - 0.01 && M.s <= sb + 0.6 && (held.has(st.i) || stateOf(M) === 'ready');
    }).sort((a, b) => a.st.M.s - b.st.M.s);
  }
  async function walkUp(sa, sb) {
    // portcullis of an arena that just opened: walk up to it, it rattles up, through you go
    const gatesOnWay = ARENAS.map((A, k) => ({ A, k, sg: TP.gateS[k] + 0.6 })).filter(({ A, k, sg }) => k > 0 && sg > sa && sg < sb && TP.gateLocked?.(A.id) && state.p.bestTrophies >= A.trophies);
    // a brand-new arena is still under its clouds (the unlock cinematic clears them): stop just inside its gate
    if (gatesOnWay.length) sb = Math.min(sb, gatesOnWay[0].sg + 3.4);
    const todo = chestsBetween(sa, sb);
    const events = [...todo.map((x) => ({ s: x.st.M.s, chest: x })), ...gatesOnWay.map((g) => ({ s: g.sg - 1.6, gate: g }))].sort((a, b) => a.s - b.s);
    for (const ev of events) {
      if (stopped()) return;
      if (ev.chest) {
        const { st, k } = ev.chest;
        const M = st.M;
        if (!seq?.skip) setFocus(k, false);
        await walkToChest(M);
        if (stopped()) return;
        // it wakes up as you arrive (padlock off, a hop), then you kick it open
        held.delete(st.i);
        if (stateOf(M) === 'ready') TP.setState(st.i, 'ready', { pop: !seq?.skip });
        if (!seq?.skip) { audio.play('latch'); await sleep(0.45); }
        const got = await kickOpen(k);
        if (got.length) hud?.loot(got, M.rewardPos, seq);
        await sleep(0.55);
      } else {
        await along(ev.s);
        if (stopped()) return;
        audio.play('rattle');
        TP.setGateLocked(ev.gate.A.id, false, { animate: true });
        lifted.add(ev.gate.A.id);
        chibi?.play('cheer', { restart: true, dur: 1.0, then: 'idle' });
        await sleep(1.4);
      }
    }
    if (stopped()) return;
    if (W.off) { routePos(W.s, _v); await stepTo(_v.clone()); W.off = false; }
    await along(sb);
    W.home = true;
    flag.visible = true;
    W.flagPop = 0;
    TP.setTrail?.(sb);
  }
  async function runSequence(t0, defeats, bossRes) {
    const p = state.p;
    seq = { skip: false, abort: false, loot: [], touched: false };
    const ch = picks();
    youS = TP.sOfTrophies(p.trophies, ch);
    const B0 = defeats[0];
    const sStart = B0 ? B0.stopS : TP.sOfTrophies(t0 ?? p.trophies, ch);
    const sEnd = youS;
    // the chests on the way wait closed for you
    held.clear();
    if (t0 !== null) for (const { st } of chestsBetween(sStart, sEnd)) held.add(st.i);
    applyStates();
    cancelLegs();
    W.job++;
    W.s = sStart;
    W.off = false;
    routePos(sStart, _v);
    you.position.copy(_v);
    W.home = false;
    flag.visible = false;
    TP.setTrail?.(sStart);
    await ctl.open(B0 ? 'boss:' + B0.id : null, { seq: true, s: sStart });
    if (!active) { endSequence(); return; }
    hud?.walking(true);
    await sleep(0.35);
    for (const B of defeats) { if (!stopped()) await defeatBoss(B, bossRes); }
    if (!stopped() && Math.abs(sEnd - W.s) > 0.05) await walkUp(W.s, sEnd);
    if (stopped()) { endSequence(); return; }
    // everything big you picked up on the way
    hud?.walking(false);
    const loot = seq.loot;
    if (loot.length && hud) await hud.lootSummary(loot);
    if (!active) { endSequence(); return; }
    // where you ended up: a boss in the way, a fork to pick, or back to the lobby
    const blk = blockingBoss(state.p);
    const kB = blk ? stopOfMs.get('b:' + blk.id) : undefined;
    const atBoss = kB !== undefined && Math.abs(stops[kB].B.stopS - W.s) < 1.5;
    const unlock = pendingArenaUnlock();
    const pend = pendingForks()[0];
    endSequence();
    if (atBoss && !unlock) {
      setFocus(kB, true);
      const F = figs.get(blk.id);
      if (F && !F.dying) { F.rig.play('roar', 1.5); F.next = 5; }
      audio.play('roar', { vol: 0.5 });
      chibi?.play('shocked', { restart: true, dur: 1.4, then: 'idle' });
      return;
    }
    if (pend && !unlock) { const j = stops.findIndex((st) => st.kind === 'fork' && st.f.id === pend.id); if (j >= 0) setFocus(j, true); return; }
    chibi?.play('cheer', { restart: true, dur: 1.3, then: 'idle' });
    const touched = await new Promise((r) => { autoClose = { t: unlock ? 0.9 : 1.6, r }; });
    if (!touched && active) ctl.close();
  }
  const stopped = () => !seq || seq.abort;
  function endSequence() {
    if (!seq) return;
    seq = null;
    seqCam = null;
    held.clear();
    W.job++;
    cancelLegs();
    W.off = false;
    hud?.walking(false);
    applyStates();
    placeYou();
    flag.visible = true;
    flag.scale.set(1, 1, 1);
  }

  const ctl = {
    get active() { return active; },
    get walking() { return !!seq || W.legs.length > 0; },
    milestones: ms,
    stops,
    get focus() { return focus; },
    stateOf: (k) => stopState(k),
    /** key: milestone index / key, 'fork:<id>' or 'boss:<id>'. o.seq: a walk sequence takes the camera from route position o.s. */
    async open(key, o = {}) {
      if (active || disposed) { if (active && key !== undefined && !seq) setFocus(firstFocus(key)); return; }
      active = true;
      flying = true;
      const dist = camDist();
      if (!pitchTab || Math.abs(dist - pitchDist) > 0.5 || pitchLen !== TP.length) buildPitch(dist);
      const k0 = firstFocus(key);
      // start at your position, then glide to the focused stop
      const s0 = stopFrame(k0);
      if (o.seq) { lat.set(0, 0, 0); latTo.set(0, 0, 0); } else lat.copy(latTo);
      s = o.seq ? o.s : Math.abs(s0 - youS) < 30 ? youS : s0;
      v = 0;
      target = null;
      focus = -1;
      camFor(s, cam);
      home.root?.classList.add('hm-road');
      audio.play('whoosh', { pitch: 0.75 });
      if (home.fly?.done) home.fly.done();
      let done;
      const arrived = new Promise((r) => (done = r));
      home.fly = { from: { pos: home.cam.pos.clone(), look: home.cam.look.clone() }, to: { pos: cam.pos.clone(), look: cam.look.clone() }, t: 0, dur: o.seq ? 1.0 : 1.25, done };
      home.fitShadow(cam.look);
      try {
        hudMod = hudMod ?? (await import('../ui/home/trophyRoad.js'));
        if (!active) return;
        hud = hudMod.mountIslandRoad(ctl, home.ctx());
        if (o.seq) hud.walking(true);
        // the card shows the focused stop while the camera is still flying in
        focus = k0;
        const st = stops[k0];
        TP.setFocus(o.seq || st.kind !== 'chest' ? -1 : st.i);
        hud.focus(k0);
      } catch (e) { console.warn('trophy road hud', e); }
      bindInput();
      await arrived;
      if (!active) return;
      flying = false;
      if (!o.seq) setFocus(k0, true);
    },
    close() {
      if (!active) return;
      if (seq) { seq.abort = true; endSequence(); }
      active = false;
      flying = false;
      unbindInput();
      TP.setFocus(-1);
      focus = -1;
      hud?.close();
      hud = null;
      if (autoClose) { const r = autoClose.r; autoClose = null; r(true); }
      if (lootChest) { home.scene.remove(lootChest.g); lootChest = null; }
      if (W.legs.length || !W.home) { W.job++; cancelLegs(); W.off = false; placeYou(); flag.visible = true; flag.scale.set(1, 1, 1); }
      home.root?.classList.remove('hm-road');
      home.placeZone(home.zoneIdx, false, 1.1);
      while (closeWaiters.length) closeWaiters.shift()();
    },
    /** Pan to and focus stop k. */
    focusOn(k) { setFocus(k, true); },
    step(d) {
      let k = focus < 0 ? nearestStop(s) : focus;
      k = Math.max(0, Math.min(stops.length - 1, k + d));
      setFocus(k, true);
    },
    nextClaimable() {
      const list = stops.map((st, k) => k).filter((k) => ['ready', 'pick', 'fight'].includes(stopState(k)));
      if (!list.length) return;
      const after = list.find((k) => k > focus);
      setFocus(after ?? list[0], true);
    },
    youS: () => youS,
    youObj: () => you,
    debug: () => ({ s, target, flying, focus, lat: lat.toArray().map((x) => +x.toFixed(2)), active, walker: { s: +W.s.toFixed(2), legs: W.legs.map((L) => [L.kind, +L.t.toFixed(2), +L.dur.toFixed(2)]), home: W.home, off: W.off, job: W.job }, seq: !!seq, figs: [...figs.keys()] }),
    /** Claim the chest at stop k right away (no walk): it pops open. Returns the granted rewards. */
    claim(k) { return claimNow(k); },
    /** Your Commander walks to the chest at stop k and kicks it open; resolves with the granted rewards (then walks back). */
    async walkClaim(k) {
      const st = stops[k];
      if (!st || st.kind !== 'chest' || stateOf(st.M) !== 'ready' || seq) return [];
      // a walk back from the last chest is dropped: straight on to this one
      cancelLegs();
      const job = ++W.job;
      await walkToChest(st.M);
      if (job !== W.job) return [];
      if (!active || stateOf(st.M) !== 'ready') { walkHome(); return []; }
      const got = await kickOpen(k);
      setTimeout(() => { if (!disposed && !seq && !W.legs.length && job === W.job) walkHome(); }, 700);
      return got;
    },
    /** Pick a trail at fork stop k. */
    choose(k, sd) {
      const st = stops[k];
      if (!st || st.kind !== 'fork' || !chooseFork(st.f.id, sd)) return false;
      applyRoute(true);
      buildPitch(camDist());
      applyStates();
      placeYou();
      // stay on the fork, now framed from the picked trail
      s = Math.max(0, Math.min(TP.length, stopS(k)));
      setFocus(k, true);
      audio.play('upgrade');
      audio.play('whoosh', { pitch: 1.2 });
      chibi?.play('cheer', { restart: true, dur: 1.3, then: 'idle' });
      // a word from your Commander if they are in the shot
      const ys = engine.toScreen(_v.copy(you.position).setY(you.position.y + 2.6), home.camera);
      if (ys.visible && ys.y > engine.height * 0.22 && ys.y < engine.height * 0.62 && ys.x > 40 && ys.x < engine.width - 40) {
        try { speech(chibi, sd === 'a' ? 'Coin trail it is. Shiny.' : 'Vial trail. Smells like science.', 2.4); } catch (e) { /* no bubble layer */ }
      }
      return true;
    },
    /** The boss at stop k (its rig), for the HUD's art + taps. */
    bossOf(k) { const st = stops[k]; return st?.kind === 'boss' ? st : null; },
    /** Skip the walk sequence (a tap): everything left happens at once. */
    skip() {
      if (seq) { seq.skip = true; seq.touched = true; }
      if (autoClose) { const r = autoClose.r; autoClose = null; r(true); }
    },
    screenOf(pos) { return engine.toScreen(pos, home.camera); },
    viewArena(id) {
      ctl.close();
      setTimeout(() => home.ctx().focusArena?.(id), 60);
    },
    /**
     * Back in the lobby after a battle: plays the boss fall (a road boss you just beat) and the walk from
     * the trophies you left with to the ones you have now. Returns a promise that resolves when the
     * road view closes again, or null when there is nothing to show.
     */
    afterBattle(params = {}) {
      if (disposed || !featureRevealed('road')) return null;
      const p = state.p;
      const Rb = p.roadBoss ?? {};
      const defeats = bosses.filter((B) => Rb.won?.[B.id] && !Rb.seen?.[B.id]);
      const from = params.walkFrom !== undefined ? Number(params.walkFrom) : params.from === 'battle' ? params.fromTrophies : null;
      const t0 = from !== null && from !== undefined && Number.isFinite(from) && p.trophies > from ? from : null;
      if (t0 === null && !defeats.length) return null;
      const closed = new Promise((r) => closeWaiters.push(r));
      runSequence(t0, defeats, params.rewards?.bossResult ?? null).catch((e) => { console.warn('road walk', e); endSequence(); if (active) ctl.close(); });
      return closed;
    },
    refresh() {
      applyRoute();
      if (pitchLen !== TP.length && active) buildPitch(camDist());
      if (!seq) applyStates();
      buildChibi();
      placeYou();
      hud?.refresh();
    },
    update(dt) {
      if (disposed) return;
      chibi?.update(dt);
      updateWalk(dt);
      updateYou(dt);
      updateFigs(dt);
      updateLoot(dt);
      // the Commander waves now and then
      ctl._wave = (ctl._wave ?? 4) - dt;
      if (ctl._wave <= 0 && W.home && !W.legs.length) { ctl._wave = 7 + Math.random() * 6; chibi?.play('wave', { restart: true, dur: 1.4, then: 'idle' }); }
      if (autoClose) { autoClose.t -= dt; if (autoClose.t <= 0) { const r = autoClose.r; autoClose = null; r(false); } }
      // reward art: one paint at a time, texture upload throttled
      pump();
      const now = performance.now();
      if (dirty && now - lastCommit > 220) { dirty = false; lastCommit = now; atlas.commit(); }
      if (!active) return;
      // the phone turned: re-frame for the new aspect
      if (Math.abs(camDist() - pitchDist) > 0.5) buildPitch(camDist());
      if (!flying) {
        if (seq && seqCam) {
          target = null;
          v = 0;
          s += (seqCam.s - s) * Math.min(1, dt * 3.5);
          latTo.set(0, 0, 0);
        } else if (seq || W.legs.some((L) => L.kind !== 'wait' && L.follow)) {
          // the camera follows your Commander (a little ahead of him)
          target = null;
          v = 0;
          const ahead = W.legs[0]?.kind === 'road' && W.legs[0].s1 !== undefined ? Math.sign(W.legs[0].s1 - W.s) * 1.2 : 0;
          s += (W.s + ahead - s) * Math.min(1, dt * 4.5);
          TP.posAt(s, _w);
          latTo.set((you.position.x - _w.x) * 0.5, 0, (you.position.z - _w.z) * 0.5);
        } else if (drag) {
          // the finger owns s; the sideways framing relaxes back onto the route
          latTo.set(0, 0, 0);
        } else if (Math.abs(v) > 0.4) {
          s += v * dt;
          v *= Math.exp(-dt * 3.2);
          latTo.set(0, 0, 0);
          if (Math.abs(v) <= 2.2) { v = 0; setFocus(nearestStop(s), true); }
        } else if (target !== null) {
          const d = target - s;
          s += d * Math.min(1, dt * 5.5);
          if (Math.abs(d) < 0.02) { s = target; target = null; }
        }
        lat.lerp(latTo, Math.min(1, dt * 4));
        s = Math.max(0, Math.min(TP.length, s));
        sCam = s;
        camFor(s, cam);
        home.cam.pos.copy(cam.pos);
        home.cam.look.copy(cam.look);
        if (Math.abs(s - lastShadow) > 1.5) { lastShadow = s; home.fitShadow(cam.look); }
      }
      hud?.frame(dt);
    },
    dispose() {
      disposed = true;
      // the YOU marker + boss rigs stay in the dropped scene graph: the engine frees their GPU copies with the rest
      if (seq) { seq.abort = true; endSequence(); }
      if (active) { active = false; unbindInput(); hud?.close(); hud = null; }
      while (closeWaiters.length) closeWaiters.shift()();
    },
  };

  // ------------------------------------------------ input: drag to pan along the road, tap a chest / fork sign / boss
  // A drag along the road's on-screen direction grabs the ground (the road follows the finger);
  // a drag across it still pans: finger down = further up the road (like scrolling the old list).
  const _sa = new THREE.Vector3(), _sb = new THREE.Vector3();
  function dragDelta(dx, dy) {
    TP.posAt(s, _sa);
    TP.posAt(s + 1, _sb);
    const a = engine.toScreen(_sa, home.camera), b = engine.toScreen(_sb, home.camera);
    const tx = b.x - a.x, ty = b.y - a.y;
    const tl = Math.hypot(tx, ty);
    // pixels per world unit across the screen at the focus (for drags that don't follow the road)
    _sb.copy(_sa).addScaledVector(_v.set(-camDir.y, 0, camDir.x), 1);
    const c = engine.toScreen(_sb, home.camera);
    const ppu = Math.max(4, Math.hypot(c.x - a.x, c.y - a.y));
    const along = tl > 0.01 ? (dx * tx + dy * ty) / tl : 0;
    const perp = tl > 0.01 ? Math.abs(dx * ty - dy * tx) / tl : Math.hypot(dx, dy);
    if (Math.abs(along) >= perp * 0.8) return -along / Math.max(tl, ppu * 0.45);
    if (Math.abs(dy) >= Math.abs(dx)) return (dy / ppu) * 1.1;
    return along ? -Math.sign(along) * Math.abs(dx) / ppu : 0;
  }
  function pick(x, y) {
    let bk = -1, bd = Infinity;
    stops.forEach((st, k) => {
      let a, b;
      if (st.kind === 'chest') { a = engine.toScreen(st.M.rewardPos, home.camera); b = engine.toScreen(st.M.anchor, home.camera); }
      else if (st.kind === 'boss') {
        if (!figs.has(st.B.id) && !st.B.bar.visible) return;
        a = engine.toScreen(_sa.copy(st.B.pos).setY(st.B.pos.y + BOSS_H * 0.75), home.camera);
        b = engine.toScreen(_sb.copy(st.B.bar.position), home.camera);
      } else {
        // either of the fork's two trail signs
        for (const sd of ['a', 'b']) {
          const P0 = st.f.signs[sd].pos;
          const c = engine.toScreen(_sa.copy(P0).setY(P0.y + 1.0), home.camera);
          if (!c.visible) continue;
          const d = Math.hypot(x - c.x, y - c.y) * 0.8;
          if (d < bd) { bd = d; bk = k; }
        }
        return;
      }
      if (!a.visible) return;
      // distance to the segment base -> top
      const vx = a.x - b.x, vy = a.y - b.y, l2 = vx * vx + vy * vy || 1;
      const u = Math.max(0, Math.min(1, ((x - b.x) * vx + (y - b.y) * vy) / l2));
      const d = Math.hypot(x - (b.x + vx * u), y - (b.y + vy * u)) * (st.kind === 'boss' ? 0.6 : 1);
      if (d < bd) { bd = d; bk = k; }
    });
    const rad = Math.max(30, Math.min(engine.width, engine.height) * 0.07);
    return bd < rad ? bk : -1;
  }
  const onDown = (e) => {
    if (!active || flying || e.button > 0) return;
    // a walk in progress: any tap skips it
    if (seq || autoClose) { ctl.skip(); return; }
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now(), moved: 0, vs: [] };
    v = 0;
    target = null;
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0));
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    if (drag.moved < 6) return;
    const ns = Math.max(0, Math.min(TP.length, s + dragDelta(dx, dy)));
    const now = performance.now();
    drag.vs.push([(ns - s) / (Math.max(1, now - drag.t) / 1000), now]);
    if (drag.vs.length > 5) drag.vs.shift();
    drag.t = now;
    s = ns;
  };
  const onUp = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    if (d.moved < 10) {
      const k = pick(e.clientX, e.clientY);
      if (k >= 0) {
        const st = stops[k];
        if (k === focus && stopState(k) === 'ready') hud?.claim(k);
        else if (st.kind === 'boss' && stopState(k) === 'fight') { audio.play('tap'); setFocus(k, true); hud?.fight(k); }
        else { audio.play('tap'); setFocus(k, true); }
      } else {
        // tapped your Commander?
        const ys = engine.toScreen(_v.copy(you.position).setY(you.position.y + 1.4), home.camera);
        if (Math.hypot(ys.x - e.clientX, ys.y - e.clientY) < 50) { chibi?.play('cheer', { restart: true, dur: 1.2, then: 'idle' }); audio.play('pop'); }
        else setFocus(nearestStop(s), true);
      }
      return;
    }
    const now = performance.now();
    const rec = d.vs.filter(([, t]) => now - t < 140);
    v = rec.length ? rec.reduce((a, [vv]) => a + vv, 0) / rec.length : 0;
    v = Math.max(-90, Math.min(90, v));
    if (Math.abs(v) <= 2.2) { v = 0; setFocus(nearestStop(s), true); }
  };
  const onKey = (e) => {
    if (!active) return;
    if (seq) { if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') ctl.skip(); return; }
    if (e.key === 'Escape') ctl.close();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') ctl.step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ctl.step(-1);
  };
  const onWheel = (e) => {
    if (!active || flying || seq) return;
    target = null;
    v = Math.max(-90, Math.min(90, v - Math.sign(e.deltaY) * 16));
  };
  function bindInput() {
    const c = engine.canvas;
    c.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('keydown', onKey);
    c.addEventListener('wheel', onWheel, { passive: true });
  }
  function unbindInput() {
    const c = engine.canvas;
    c.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('keydown', onKey);
    c.removeEventListener('wheel', onWheel);
    drag = null;
  }

  return ctl;
}
