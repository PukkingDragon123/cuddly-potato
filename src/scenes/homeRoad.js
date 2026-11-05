// Trophy Road mode of the home lobby: the road is part of Beast Island
// (models/island/trophyPath.js), so "opening" it flies the island camera down
// onto the road at your position. Drag pans along the road (with inertia, then
// it settles on the nearest stop), tapping a chest focuses it, CLAIM pops the
// chest. Stops are the chests plus the fork signposts: at a fork you pick the
// COIN TRAIL or the VIAL TRAIL (game/roadForks.js) and the camera route, the
// barricades and the YOU marker follow your pick. Also owns the YOU marker (your
// Commander + a YOU flag standing at your trophy count) and paints the floating
// reward art into the road's atlas.
//
//   const road = setupIslandRoad(home);   // after the island + populate, before static batching
//   road.open(key?)  road.close()  road.active  road.refresh()  road.update(dt)  road.dispose()
//   road.stops[i]  { kind: 'chest', i (milestone), M } | { kind: 'fork', f (TP fork), F (data) }
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { Chibi } from '../core/chibi.js';
import { VoxGrid } from '../core/voxel.js';
import { text, textW } from '../models/props/common.js';
import * as IP from '../models/island/props.js';
import { CHARACTERS } from '../data/characters.js';
import { COMMANDERS } from '../data/commanders.js';
import { ARENAS } from '../data/arenas.js';
import { SPELLS } from '../data/spells.js';
import { cardDef } from '../data/cards.js';
import { state, claimTrophyRoad } from '../game/state.js';
import { forkChoice, forkItemState, claimForkItem, chooseFork, pendingForks, forkReached, forkDone } from '../game/roadForks.js';
import { iconURL, speech } from '../ui/ui.js';
import { swarmThumbAsync, spellThumbAsync, labSkinThumb } from '../ui/thumbs.js';
import { cmdOverride } from '../ui/home/common.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

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

export function setupIslandRoad(home) {
  const I = home.I;
  const TP = I?.trophyPath;
  if (!TP) return null;
  const ms = TP.milestones;
  const camDir = TP.camDir; // Vector2 (x, z)
  const faceY = Math.atan2(camDir.x, camDir.y);

  // ------------------------------------------------ YOU marker
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
  function placeYou() {
    youS = TP.sOfTrophies(state.p.trophies, picks());
    TP.posAt(youS, _v);
    you.position.set(_v.x, _v.y, _v.z);
  }

  // ------------------------------------------------ stops: every chest + every fork signpost, in road order
  const forks = TP.forks ?? [];
  const stops = [];
  ms.forEach((M, i) => stops.push({ kind: 'chest', i, M, t: M.t, ord: M.side === 'b' ? 2 : M.side === 'a' ? 1 : 0 }));
  for (const f of forks) stops.push({ kind: 'fork', f, F: f.F, t: f.F.lo, ord: 0.5 });
  stops.sort((a, b) => a.t - b.t || a.ord - b.ord);
  const stopOfMs = new Map(stops.map((st, k) => [st.kind === 'chest' ? st.i : -1 - forks.indexOf(st.f), k]));
  const picks = () => Object.fromEntries(forks.map((f) => [f.id, forkChoice(f.id)]).filter(([, c]) => c));

  // ------------------------------------------------ chest states (+ taps on the island open the road)
  const stateOf = (M) => {
    if (M.fork) return forkItemState(M.m);
    return state.p.trophyRoad[M.key] ? 'claimed' : state.p.bestTrophies >= M.t ? 'ready' : 'locked';
  };
  /** 'ready' | 'claimed' | 'locked' for chests; 'pick' | 'picked' | 'open' | 'ahead' for forks. */
  const stopState = (k) => {
    const st = stops[k];
    if (!st) return 'locked';
    if (st.kind === 'chest') return stateOf(st.M);
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
  function applyStates() {
    ms.forEach((M, i) => { if (M.state !== 'opening') TP.setState(i, stateOf(M)); });
    for (const A of ARENAS) TP.setGateLocked(A.id, I.isLocked(A.id));
  }
  applyRoute();
  applyStates();
  placeYou();
  const roadLocked = () => home.roadBtn?.classList.contains('pg-lock');
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
    return a < 1 ? 31 * Math.min(1.9, Math.max(1, 0.8 / a)) : a < 1.4 ? 34 : 31;
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
    // a fork: both trail signs and the first stretch of both trails
    const f = st.f;
    const sMid = f.sSign + 4;
    TP.posAt(sMid, _w);
    latTo.set(f.signPos.x - _w.x, 0, f.signPos.z - _w.z).multiplyScalar(0.9);
    return sMid;
  }

  // ------------------------------------------------ the mode itself
  let hud = null, hudMod = null;
  let active = false, flying = false, disposed = false;
  let s = 0, v = 0, target = null, focus = -1, drag = null, lastShadow = -99;
  const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const stopS = (k) => { const st = stops[k]; return st.kind === 'chest' ? st.M.s : st.f.sSign + 4; };
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
      const i = typeof key === 'number' ? key : ms.findIndex((M) => M.key === key);
      if (i >= 0 && stopOfMs.has(i)) return stopOfMs.get(i);
    }
    // a fork waiting for your pick first, then a claimable reward near you, else the next reward ahead
    const pend = pendingForks()[0];
    if (pend) { const j = stops.findIndex((st) => st.kind === 'fork' && st.f.id === pend.id); if (j >= 0) return j; }
    const ready = stops.map((st, k) => k).filter((k) => stopState(k) === 'ready');
    const close = ready.filter((k) => Math.abs(stopS(k) - youS) < 30);
    if (close.length) return close[close.length - 1];
    if (ready.length) return ready[ready.length - 1];
    const next = stops.findIndex((st) => st.t > state.p.trophies && (st.kind === 'fork' || !st.M.fork || (forkChoice(st.M.fork) ?? 'a') === st.M.side));
    return next >= 0 ? next : stops.length - 1;
  }

  const ctl = {
    get active() { return active; },
    milestones: ms,
    stops,
    get focus() { return focus; },
    stateOf: (k) => stopState(k),
    async open(key) {
      if (active || disposed) { if (active && key !== undefined) setFocus(firstFocus(key)); return; }
      active = true;
      flying = true;
      const dist = camDist();
      if (!pitchTab || Math.abs(dist - pitchDist) > 0.5 || pitchLen !== TP.length) buildPitch(dist);
      const k0 = firstFocus(key);
      // start at your position, then glide to the focused stop
      const s0 = stopFrame(k0);
      lat.copy(latTo);
      s = Math.abs(s0 - youS) < 30 ? youS : s0;
      v = 0;
      target = null;
      focus = -1;
      camFor(s, cam);
      home.root?.classList.add('hm-road');
      audio.play('whoosh', { pitch: 0.75 });
      if (home.fly?.done) home.fly.done();
      let done;
      const arrived = new Promise((r) => (done = r));
      home.fly = { from: { pos: home.cam.pos.clone(), look: home.cam.look.clone() }, to: { pos: cam.pos.clone(), look: cam.look.clone() }, t: 0, dur: 1.25, done };
      home.fitShadow(cam.look);
      try {
        hudMod = hudMod ?? (await import('../ui/home/trophyRoad.js'));
        if (!active) return;
        hud = hudMod.mountIslandRoad(ctl, home.ctx());
        // the card shows the focused stop while the camera is still flying in
        focus = k0;
        const st = stops[k0];
        TP.setFocus(st.kind === 'chest' ? st.i : -1);
        hud.focus(k0);
      } catch (e) { console.warn('trophy road hud', e); }
      bindInput();
      await arrived;
      if (!active) return;
      flying = false;
      setFocus(k0, true);
    },
    close() {
      if (!active) return;
      active = false;
      flying = false;
      unbindInput();
      TP.setFocus(-1);
      focus = -1;
      hud?.close();
      hud = null;
      home.root?.classList.remove('hm-road');
      home.placeZone(home.zoneIdx, false, 1.1);
    },
    /** Pan to and focus stop k. */
    focusOn(k) { setFocus(k, true); },
    step(d) {
      let k = focus < 0 ? nearestStop(s) : focus;
      k = Math.max(0, Math.min(stops.length - 1, k + d));
      setFocus(k, true);
    },
    nextClaimable() {
      const list = stops.map((st, k) => k).filter((k) => stopState(k) === 'ready' || stopState(k) === 'pick');
      if (!list.length) return;
      const after = list.find((k) => k > focus);
      setFocus(after ?? list[0], true);
    },
    youS: () => youS,
    youObj: () => you,
    debug: () => ({ s, target, flying, focus, lat: lat.toArray().map((x) => +x.toFixed(2)), active }),
    /** Claim the chest at stop k: it pops open (the HUD adds the pixel confetti + the reward flying to the UI). Returns the granted rewards. */
    claim(k) {
      const st = stops[k];
      if (!st || st.kind !== 'chest') return [];
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
    screenOf(pos) { return engine.toScreen(pos, home.camera); },
    viewArena(id) {
      ctl.close();
      setTimeout(() => home.ctx().focusArena?.(id), 60);
    },
    refresh() {
      applyRoute();
      if (pitchLen !== TP.length && active) buildPitch(camDist());
      applyStates();
      buildChibi();
      placeYou();
      hud?.refresh();
    },
    update(dt) {
      if (disposed) return;
      chibi?.update(dt);
      // the Commander waves now and then
      ctl._wave = (ctl._wave ?? 4) - dt;
      if (ctl._wave <= 0) { ctl._wave = 7 + Math.random() * 6; chibi?.play('wave', { restart: true, dur: 1.4, then: 'idle' }); }
      // reward art: one paint at a time, texture upload throttled
      pump();
      const now = performance.now();
      if (dirty && now - lastCommit > 220) { dirty = false; lastCommit = now; atlas.commit(); }
      if (!active) return;
      // the phone turned: re-frame for the new aspect
      if (Math.abs(camDist() - pitchDist) > 0.5) buildPitch(camDist());
      if (!flying) {
        if (drag) {
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
        camFor(s, cam);
        home.cam.pos.copy(cam.pos);
        home.cam.look.copy(cam.look);
        if (Math.abs(s - lastShadow) > 1.5) { lastShadow = s; home.fitShadow(cam.look); }
      }
      hud?.frame(dt);
    },
    dispose() {
      disposed = true;
      // the YOU marker stays in the dropped scene graph: the engine frees its GPU copies with the rest
      if (active) { active = false; unbindInput(); hud?.close(); hud = null; }
    },
  };

  // ------------------------------------------------ input: drag to pan along the road, tap a chest or a fork sign
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
      else {
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
      const d = Math.hypot(x - (b.x + vx * u), y - (b.y + vy * u));
      if (d < bd) { bd = d; bk = k; }
    });
    const rad = Math.max(30, Math.min(engine.width, engine.height) * 0.07);
    return bd < rad ? bk : -1;
  }
  const onDown = (e) => {
    if (!active || flying || e.button > 0) return;
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
        if (k === focus && stopState(k) === 'ready') hud?.claim(k);
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
    if (e.key === 'Escape') ctl.close();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') ctl.step(1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ctl.step(-1);
  };
  const onWheel = (e) => {
    if (!active || flying) return;
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
