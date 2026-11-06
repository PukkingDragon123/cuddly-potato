// Battle ENTRANCES: the walk-in cinematic each Commander makes at the start of a battle.
//
// After the VS slam (vsIntro.js) the rival makes a short entrance, then you make the full one:
//   ARRIVAL  the entrance's own set piece (entranceSets.js): a wide establishing shot, a
//            tracking shot as they come in, an insert (the landing, the door, the flip...)
//   POSE     a low hero close-up while they strike the entrance's signature poses and say
//            its line (voiced word by word in their own voice, mouth moving); the title card
//            slams in: rank medal, name and trophies on their profile banner
//   HOP      they jump onto their base's seat while the camera eases back to the battle view
//            and the set props clear out
// Tap to skip (the rival's skips to yours, yours skips to the battle). The cinematic only
// moves the camera, the two Commanders and its own props / 2D pixel sprites, so the very
// same code plays on the shop's preview stage (entrancePreview.js).
//
//   const ent = setupEntrances(view, cfg, mode);  // hides both Commanders, builds the props
//   await ent.play();                             // rival, then you
//   const ctl = playEntrance(stage, side, id, { short, info });  await ctl.wait;
import * as THREE from 'three';
import './entrance.css';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { h, icon, $overlay } from '../../ui/ui.js';
import { rankMedal } from '../../ui/rankMedal.js';
import { sideAvatarEl } from '../../ui/avatar.js';
import { voiceOf } from '../../data/characters.js';
import { BANNERS } from '../../data/season.js';
import { entranceDef, ghostEntrance } from '../../data/entrances.js';
import { battleCamera } from '../../models/arenas/kit.js';
import { FIELD } from './field.js';
import { pixSystem } from './pixfx.js';
import { SETS, prepSet } from './entranceSets.js';
import { equippedEntrance } from '../state.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp01 = (k) => (k < 0 ? 0 : k > 1 ? 1 : k);
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const outC = (k) => 1 - Math.pow(1 - k, 3);
const TEAM = ['#2b8cf2', '#f23a4a'];
const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _hp = new THREE.Vector3();

/** The entrance a battle side uses (you: the equipped one; ghosts: picked by trophies). */
export function entranceFor(sideCfg, side, mode) {
  // dev: ?dev=...&ent=<id>&rent=<id> forces yours / the rival's
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
  const forced = q?.has('dev') ? q.get(side ? 'rent' : 'ent') : null;
  if (forced) return entranceDef(forced).id;
  if (sideCfg?.entrance) return entranceDef(sideCfg.entrance).id;
  if (side === 0) return equippedEntrance();
  if (mode === 'practice') return 'boxSneak';
  if (mode === 'boss') return 'wallBurst';
  return ghostEntrance(sideCfg?.trophies ?? 0, sideCfg?.name ?? '');
}

// ---------------------------------------------------------------------------
// Stage adapter for the battle view (the preview stage provides the same shape)

export function battleStage(view) {
  const cam = view.camera;
  const hidden = [];
  const _b = new THREE.Box3();
  return {
    scene: view.scene,
    camera: cam,
    overlay: () => $overlay(),
    cmd: (i) => view.cmds?.[i] ?? null,
    base(i) {
      const lab = view.labs[i];
      const x = lab.root.position.x;
      const bd = lab.bounds ?? { x0: -1.7, x1: 1.7, z0: -1.4, z1: 1.8 };
      const ch = view.cmds?.[i];
      return { x, front: x + (i === 0 ? bd.x1 : bd.x0), z1: bd.z1 ?? 1.8, height: lab.height ?? 3, seat: (ch?.home ?? V(x, lab.height ?? 3, 0)).clone(), seatYaw: i === 0 ? 0.55 : -0.55 };
    },
    shake: (a) => engine.shake(a * (view.shakeScale ?? 1)),
    toScreen: (v) => engine.toScreen(v, cam),
    /** The battle camera the fight starts on (your side). */
    endShot(i) {
      const w = view.viewWidth();
      const half = w / 2;
      const minX = -FIELD.VIEW_X + half, maxX = FIELD.VIEW_X - half;
      const x = minX > maxX ? 0 : i === 0 ? minX : maxX;
      view.camX = view.camTargetX = x;
      const c = battleCamera(x, w, cam.aspect, cam.fov, cam.aspect < 1 ? 0.56 : 0.6);
      return { pos: V(...c.pos), look: V(...c.look) };
    },
    begin() {
      // arena props between the lane and the camera would block the close shots
      try {
        view.arena?.root?.traverse?.((o) => {
          if (!o.visible || !(o.isMesh || o.isPoints || o.isSprite)) return;
          _b.setFromObject(o);
          if (!_b.isEmpty() && _b.min.z > 2.6 && _b.max.y > 0.35) { o.visible = false; hidden.push(o); }
        });
      } catch (e) { /* cosmetic */ }
      if (view.plateLayer) view.plateLayer.style.visibility = 'hidden';
    },
    end() {
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      if (view.plateLayer) view.plateLayer.style.visibility = '';
    },
  };
}

/**
 * Battle start: hides both Commanders (they make their entrances after the VS intro) and builds
 * the two entrances' props now (behind the loading screen). Returns { ids, play() } or null.
 */
export function setupEntrances(view, cfg, mode) {
  if (mode === 'tutorial') return null;
  const ids = [0, 1].map((i) => entranceFor(cfg.sides[i], i, mode));
  const stage = battleStage(view);
  const sides = [1, 0].filter((i) => stage.cmd(i));
  if (!sides.length) return null;
  for (const i of sides) {
    const ch = stage.cmd(i);
    ch.root.visible = false;
    ch.busy = ch.emoting = true;
    try { prepSet(ids[i]); } catch (e) { console.warn('entrance prep', ids[i], e); }
  }
  let wrap = null;
  return {
    ids,
    /** Rival (short), then you (full). Resolves when your Commander sits on your base. */
    async play() {
      wrap = makeWrap(stage.overlay());
      stage.begin();
      try {
        for (const i of sides) {
          if (view.disposed) break;
          const ctl = playEntrance(stage, i, ids[i], { short: i === 1, info: cfg.sides[i], wrap, last: i === sides[sides.length - 1], boss: mode === 'boss' });
          view.cine = ctl;
          // safety net: if the cinematic stops getting frames (the view stopped updating it), the battle still starts
          let lastT = -1;
          const guard = setInterval(() => {
            if (ctl.finished || (import.meta.env.DEV && typeof window.__entT === 'number')) return;
            if (ctl.t === lastT) { ctl.skipped = true; ctl.finish(); }
            lastT = ctl.t;
          }, 4000);
          await ctl.wait;
          clearInterval(guard);
        }
      } catch (e) {
        console.error('battle entrance failed', e);
      } finally {
        stage.end();
        for (const i of sides) settle(stage, i);
        wrapOut(wrap);
        if (view.cine && view.cine.entrance) view.cine = null;
      }
    },
    /** Never leave a Commander hidden (the battle ended / was left during the intro). */
    abort() {
      try { for (const i of sides) settle(stage, i); } catch (e) { /* the view is gone */ }
      wrapOut(wrap);
    },
  };
}

function settle(stage, i) {
  const ch = stage.cmd(i);
  if (!ch || !ch.emoting) return;
  const B = stage.base(i);
  ch.root.visible = true;
  ch.root.position.copy(B.seat);
  ch.root.rotation.set(0, B.seatYaw, 0);
  ch.play('sit');
  ch.busy = ch.emoting = false;
  ch.reactT = 0;
}

// ---------------------------------------------------------------------------
// Overlay: letterbox, pixel skip icon, flash, title card, speech bubble (no captions)

export function makeWrap(parent) {
  const el = h('div', { class: 'ent' },
    h('div', { class: 'ent-bar t' }, h('i', { class: 'ent-trim' })),
    h('div', { class: 'ent-bar b' }, h('i', { class: 'ent-trim' }), h('div', { class: 'ent-skip', role: 'img', 'aria-label': 'Tap to skip' }, h('i', { class: 'px-skip' }))),
    h('div', { class: 'ent-flash' }));
  parent.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  return el;
}
export function wrapOut(el) {
  if (!el || !el.isConnected || el.classList.contains('out')) return;
  el.classList.remove('in');
  el.classList.add('out');
  setTimeout(() => el.remove(), 500);
}

function titleCard(info, side, e) {
  const b = BANNERS[info.banner] ?? BANNERS.default;
  const name = info.name || (side ? 'Rival' : 'You');
  const tag = side ? (info.clan || 'RIVAL') : 'YOU';
  const sub = [];
  if (info.trophies !== undefined && info.trophies !== null) sub.push(h('span', { class: 'ent-card-tr' }, icon('trophy', 'ent-card-ic'), h('b', {}, Number(info.trophies).toLocaleString('en-US'))));
  return h('div', { class: `ent-card s${side}`, style: { '--tc': TEAM[side], '--ec': e.color, '--nk': String(Math.min(1, 10 / Math.max(10, name.length))) } },
    h('i', { class: 'ent-card-bn', style: { background: b.css } }),
    h('i', { class: 'ent-card-shade' }),
    h('i', { class: 'ent-card-trim' }),
    h('div', { class: 'ent-card-in' },
      sideAvatarEl(info, { cls: 'ent-card-av' }),
      info.labLevel ? rankMedal(info.labLevel, { cls: 'ent-card-rk' }) : null,
      h('div', { class: 'ent-card-tx' },
        h('div', { class: `ent-card-tag ${side ? 'sk-chip-red' : 'sk-chip-blue'}` }, tag),
        h('div', { class: 'ent-card-nm' }, name),
        h('div', { class: 'ent-card-sub' }, ...sub))));
}

// ---------------------------------------------------------------------------

/**
 * Play one Commander's entrance on a stage. o: { short (rival cut), info (side cfg: name,
 * trophies, labLevel, banner, clan, commander), wrap (shared overlay), last, preview }.
 * Returns ctl { wait (Promise), done, update(dt), skip(), finish(), ownsCamera }.
 */
export function playEntrance(stage, side, id, o = {}) {
  const ch = stage.cmd(side);
  const e = entranceDef(id);
  const make = SETS[e.id] ?? SETS.strut;
  const dir = side === 0 ? 1 : -1;
  const cam = stage.camera;
  const scene = stage.scene;
  const B = stage.base(side);
  const short = !!o.short;
  const info = o.info ?? {};
  const H = Math.max(0.6, ch.height * ch.root.scale.x);
  const M = V(B.front + dir * 2.15, 0, 1.45);
  const P = pixSystem(scene);
  const wrap = o.wrap ?? makeWrap(stage.overlay());
  const ownWrap = !o.wrap;
  let resolveDone;
  const ctl = { entrance: true, ownsCamera: true, freeze: false, t: 0, done: false, finished: false };
  ctl.wait = new Promise((r) => (resolveDone = r));

  // ---- camera framing helpers
  const TAN = () => Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const fit = (w, hh) => Math.max(hh / (2 * TAN()), w / (2 * TAN() * cam.aspect));
  /**
   * Camera framing a w x hh window around `center`: yaw (local, mirrored for the rival) swings
   * the camera round, pitch raises it (negative = low angle). sx / sy put the centre at that
   * screen fraction (0.5 = middle).
   */
  const shot = (center, w, hh, so = {}) => {
    const d = fit(w, hh) * (so.zoom ?? 1);
    const yaw = (so.yaw ?? 0) * dir, pitch = so.pitch ?? 0.1;
    const pos = V(center.x + Math.sin(yaw) * Math.cos(pitch) * d, center.y + Math.sin(pitch) * d, center.z + Math.cos(yaw) * Math.cos(pitch) * d);
    pos.y = Math.max(so.minY ?? 0.28, pos.y);
    const look = center.clone();
    const sx = so.sx ?? 0.5, sy = so.sy ?? 0.5;
    if (sx !== 0.5 || sy !== 0.5) {
      _f.subVectors(look, pos).normalize();
      _r.crossVectors(_f, THREE.Object3D.DEFAULT_UP).normalize();
      _u.crossVectors(_r, _f);
      const halfH = d * TAN(), halfW = halfH * cam.aspect;
      look.addScaledVector(_r, -(2 * sx - 1) * halfW).addScaledVector(_u, (2 * sy - 1) * halfH);
    }
    return { pos, look };
  };
  const portrait = () => cam.aspect < 1;

  // ---- overlay bits
  const flashEl = wrap.querySelector('.ent-flash');
  const flash = (col = '#ffffff', a = 0.8) => {
    flashEl.style.setProperty('--fc', col);
    flashEl.style.setProperty('--fa', String(a));
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  };
  wrap.classList.toggle('s1', side === 1);
  const card = titleCard(info, side, e);
  card.classList.add(portrait() ? 'port' : 'land');
  wrap.appendChild(card);
  const sayEl = h('div', { class: 'ent-say' }, h('span', {}, e.line), h('i', { class: 'ent-say-tail' }));
  wrap.appendChild(sayEl);
  const onTap = (ev) => { ev.stopPropagation(); ev.preventDefault(); ctl.skip(); };
  wrap.addEventListener('pointerdown', onTap);

  // ---- the director (set piece)
  const props = [];
  const acc = {};
  let freeze = 0;
  const c = {
    side, dir, H, ch, scene, M, B, P, cam, short, preview: !!o.preview,
    zLane: Math.max(B.z1 + 0.75, 2.3),
    X: (u) => M.x + dir * u,
    at: (u, y = 0, z = M.z) => V(M.x + dir * u, y, z),
    yaw: (a) => dir * a,
    add(obj) { scene.add(obj); props.push(obj); return obj; },
    remove(obj) { obj.parent?.remove(obj); const i = props.indexOf(obj); if (i >= 0) props.splice(i, 1); },
    sfx: (sid, so) => audio.play(sid, so),
    shake: (a) => stage.shake(a),
    flash, hitstop: (s) => { freeze = Math.max(freeze, s); },
    shot, fit, portrait,
    /** Rate emitter: how many to spawn this frame for `perSec`. */
    E(key, perSec, dt) { const a = (acc[key] ?? Math.random()) + perSec * dt; const n = Math.floor(a); acc[key] = a - n; return n; },
    walk(on, speed = 1.45) { ch.speed = on ? speed : 1; ch.play(on ? 'walk' : 'idle'); },
  };
  const D = make(c);
  const T = D.T;
  const t0 = short ? (D.T0r ?? Math.max(0, T - 1.3)) : 0;
  const poses = short ? D.pose.slice(-1).map(([n, d, m]) => [n, Math.min(d, 1.0), m]) : D.pose;
  const PD = poses.reduce((a, p) => a + p[1], 0);
  const HOP = short ? 0.6 : 0.85;
  const END = T + PD + HOP;
  Object.assign(ctl, { side, id: e.id, T, END, PD });
  const evs = (D.ev ?? []).map(([te, fn]) => ({ te, fn, fired: te <= t0 + 1e-4 && te < T }));

  // ---- start: the Commander walks onto the set
  ch.busy = ch.emoting = true;
  ch.root.visible = true;
  ch.root.rotation.set(0, dir * Math.PI / 2, 0);
  ch.speed = 1;
  ch.play('idle');
  ch.expr('determined', 'grin');
  let t = t0;
  D.at(t);

  // ---- voice: word by word in the Commander's voice
  const words = (e.line ?? '').split(/\s+/).filter(Boolean);
  const v8 = voiceOf(info.commander?.char ?? info.commander?.id ?? ch.def?.id);
  const CPS = 14;
  let wi = 0, wClock = 0, talkLeft = 0;
  const speak = (dt) => {
    wClock += dt;
    while (wi < words.length) {
      const w = words[wi];
      const len = w.replace(/[^A-Za-z0-9']/g, '').length;
      const cost = Math.max(0.15, (len + 1) / CPS) + (/[.,?]$/.test(words[wi - 1] ?? '') ? 0.2 : 0);
      if (wi > 0 && wClock < cost) break;
      if (wi > 0) wClock -= cost;
      if (len) {
        audio.voice(v8, { text: w, span: Math.max(0.12, ((len + 1) / CPS) * 1.1), pos: wi / words.length, emph: wi === 0, ask: /\?$/.test(w) });
        ch.talk(true);
        talkLeft = Math.min(0.45, 0.08 + len * 0.055);
      }
      wi++;
    }
    talkLeft -= dt;
    if (talkLeft <= 0) ch.talk(false);
  };

  // ---- camera state
  let camKey = '', blend = null;
  const cur = { pos: cam.position.clone(), look: V() };
  cam.getWorldDirection(_f);
  cur.look.copy(cam.position).addScaledVector(_f, 10);
  const place = (s, dt) => {
    if (!s) return;
    if (s.key !== undefined && s.key !== camKey) {
      camKey = s.key;
      blend = s.blend ? { from: cur.pos.clone(), look: cur.look.clone(), t: 0, dur: s.blend } : null;
    }
    if (blend) {
      blend.t += dt;
      const k = ease(clamp01(blend.t / blend.dur));
      cur.pos.lerpVectors(blend.from, s.pos, k);
      cur.look.lerpVectors(blend.look, s.look, k);
      if (k >= 1) blend = null;
    } else {
      cur.pos.copy(s.pos);
      cur.look.copy(s.look);
    }
    cam.position.copy(cur.pos);
    cam.lookAt(cur.look);
  };
  // the pose close-up: low, slightly round the field side, pushing in
  const heroShot = (k) => {
    const p = ch.root.position;
    const fH = lerp(H * 2.55, H * 1.8, outC(k));
    const port = portrait();
    return shot(V(p.x, p.y + H * 0.56, p.z), fH * 0.62, fH, {
      yaw: 0.36, pitch: -0.07, minY: 0.22,
      sx: port ? 0.5 : dir > 0 ? 0.33 : 0.67, sy: port ? 0.4 : 0.5,
    });
  };
  const endShot = () => (o.last && stage.endShot ? stage.endShot(side) : shot(V(B.x + dir * 2.2, 1.7, 0.6), portrait() ? 5.5 : 9, 4.6, { pitch: 0.16 }));

  // ---- phases
  let phase = 'arrive', poseIdx = -1, poseT0 = 0, rot0 = 0, cardIn = false, cardOut = false, hop = null, sayOn = false;
  const showCard = () => {
    if (cardIn) return;
    cardIn = true;
    card.classList.add('in');
    audio.play('stamp', { pitch: side ? 1.1 : 0.9 });
    audio.play('whoosh', { pitch: 1.4, vol: 0.5 });
  };
  const hideCard = () => {
    if (cardOut) return;
    cardOut = true;
    card.classList.remove('in');
    card.classList.add('out');
    sayEl.classList.remove('on');
  };
  const placeSay = () => {
    if (!sayOn) return;
    const p = ch.headTop ? ch.headTop(_hp) : _hp.copy(ch.root.position).setY(ch.root.position.y + H);
    p.y += H * 0.12;
    const s = stage.toScreen(p);
    const W = window.innerWidth, Hh = window.innerHeight;
    const w = sayEl.offsetWidth || 160;
    const x = Math.max(12 + w / 2, Math.min(W - 12 - w / 2, s.x));
    const y = Math.max(Hh * 0.13 + sayEl.offsetHeight + 6, Math.min(Hh * 0.8, s.y));
    sayEl.style.transform = `translate3d(${Math.round(x - w / 2)}px, ${Math.round(y - sayEl.offsetHeight)}px, 0)`;
    sayEl.style.setProperty('--tx', Math.round(Math.max(14, Math.min(w - 14, s.x - (x - w / 2)))) + 'px');
  };
  const propsOut = (k) => {
    if (D.out?.(k)) return;
    for (const p of props) {
      if (!p.userData.entOut) {
        p.userData.entOut = true;
        p.userData.entS = p.scale.clone();
        const bx = new THREE.Box3().setFromObject(p);
        if (!bx.isEmpty()) {
          const cx = (bx.min.x + bx.max.x) / 2, cz = (bx.min.z + bx.max.z) / 2, sz = Math.max(0.6, Math.min(3, bx.max.x - bx.min.x));
          for (let i = 0; i < 5; i++) P.spawn({ tex: 'entPuff', additive: false, x: cx + (Math.random() - 0.5) * sz, y: Math.max(0.15, bx.min.y + Math.random() * 0.5), z: cz + (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 0.6, vx: (Math.random() - 0.5) * 1.2, drag: 2, size: 0.22 + sz * 0.05, size1: 0.05, color: [0xe8ecf6, 0xc8d0e0], glow: 1, life: 0.5 });
        }
      }
      const s0 = p.userData.entS;
      const kk = 1 - outC(clamp01(k / 0.35));
      p.scale.set(s0.x * Math.max(0.001, kk), s0.y * Math.max(0.001, kk), s0.z * Math.max(0.001, kk));
    }
  };

  ctl.update = (dtReal) => {
    if (ctl.finished) return;
    try { step(dtReal); } catch (err) {
      // never strand the battle intro on a broken set piece
      console.error('entrance failed', e.id, err);
      ctl.skipped = true;
      ctl.finish();
    }
  };
  const step = (dtReal) => {
    let dt = Math.min(dtReal, 0.08);
    if (freeze > 0) { freeze -= dt; dt *= 0.06; }
    if (phase === 'arrive' && D.warp) dt *= D.warp(t);
    t += dt;
    // dev: window.__entT = seconds pins the timeline (screenshots on slow machines)
    if (import.meta.env.DEV && typeof window.__entT === 'number') t = window.__entT;
    ctl.t = t;
    P.update(dt, cam);
    if (phase === 'arrive') {
      const ta = Math.min(t, T);
      D.at(ta);
      for (const ev of evs) if (!ev.fired && ev.te <= ta) { ev.fired = true; try { ev.fn(); } catch (err) { console.warn('entrance event', err); } }
      D.fx?.(ta, dt);
      place(D.cam(ta), dt);
      if (t >= T) {
        phase = 'pose';
        poseT0 = T;
        rot0 = ch.root.rotation.y;
        ch.speed = 1;
      }
    }
    if (phase === 'pose') {
      const tp = t - poseT0;
      D.fx?.(T, dt);
      // turn to the camera, then the pose sequence
      const kr = outC(clamp01(tp / 0.25));
      if (!D.keepYaw) ch.root.rotation.y = lerp(rot0, dir * 0.32, kr);
      let acc2 = 0, idx = 0;
      for (; idx < poses.length - 1; idx++) { if (tp < acc2 + poses[idx][1]) break; acc2 += poses[idx][1]; }
      D.hold?.(poses[idx][0], tp - acc2, dt);
      if (idx !== poseIdx) {
        poseIdx = idx;
        const [pn, pd, mood] = poses[idx];
        ch.play(pn, { restart: true, face: false });
        if (mood) ch.mood(mood, pd + (idx === poses.length - 1 ? HOP : 0));
        ch.boing(0.22);
        audio.play('swing', { pitch: 1.2 + idx * 0.15, vol: 0.4 });
      }
      if (tp > (short ? 0.05 : 0.12)) showCard();
      if (tp > (short ? 0.1 : 0.22)) {
        if (!sayOn) { sayOn = true; sayEl.classList.add('on'); }
        speak(dt);
      }
      placeSay();
      place({ key: 'hero', ...heroShot(clamp01(tp / Math.max(0.5, PD))) }, dt);
      if (t >= T + PD) {
        phase = 'hop';
        hideCard();
        ch.talk(false);
        const from = ch.root.position.clone();
        hop = { from, to: B.seat.clone(), cam0: { pos: cur.pos.clone(), look: cur.look.clone() }, end: endShot(), y0: ch.root.rotation.y };
        hop.apex = Math.max(from.y, hop.to.y) + H * 0.7 + 0.5;
        ch.play('entTuck', { restart: true });
        ch.boing(-0.35);
        audio.play('boing', { pitch: 1.1 });
        audio.play('whoosh', { pitch: 0.9, vol: 0.6 });
      }
    }
    if (phase === 'hop') {
      const k = clamp01((t - T - PD) / HOP);
      propsOut(k);
      D.fx?.(T, dt);
      // a short crouch, then the arc with a spin
      const ka = clamp01((k - 0.12) / 0.88);
      const e2 = ease(ka);
      const p = ch.root.position;
      p.x = lerp(hop.from.x, hop.to.x, e2);
      p.z = lerp(hop.from.z, hop.to.z, e2);
      const base = lerp(hop.from.y, hop.to.y, ka);
      p.y = base + (hop.apex - Math.max(hop.from.y, hop.to.y)) * Math.sin(ka * Math.PI) + (ka > 0 ? 0 : 0);
      if (ka > 0) p.y = Math.max(p.y, lerp(hop.from.y, hop.to.y, ka));
      ch.root.rotation.y = lerp(hop.y0, B.seatYaw + dir * Math.PI * 2, outC(ka));
      const kc = ease(clamp01(k / 0.9));
      cam.position.lerpVectors(hop.cam0.pos, hop.end.pos, kc);
      cur.look.lerpVectors(hop.cam0.look, hop.end.look, kc);
      cur.pos.copy(cam.position);
      cam.lookAt(cur.look);
      if (t >= END) ctl.finish();
    }
  };

  ctl.skip = () => {
    if (ctl.finished) return;
    ctl.skipped = true;
    ctl.finish();
  };

  ctl.finish = () => {
    if (ctl.finished) return;
    ctl.finished = true;
    ctl.done = true;
    ctl.ownsCamera = false;
    wrap.removeEventListener('pointerdown', onTap);
    hideCard();
    ch.talk(false);
    try { D.cleanup?.(); } catch (err) { console.warn('entrance cleanup', err); }
    for (const p of props) {
      p.parent?.remove(p);
      if (p.userData.disposeMat) (p.material ?? p.userData.mat)?.dispose?.(); // per-use tinted materials (shafts, reticle, beam)
    }
    props.length = 0;
    // the Commander takes their seat
    const land = !ctl.skipped;
    ch.root.visible = true;
    ch.root.scale.setScalar(ch.root.scale.y);
    ch.root.position.copy(B.seat);
    ch.root.rotation.set(0, B.seatYaw, 0);
    ch.speed = 1;
    ch.play('sit');
    ch.expr('determined', 'grin', 1.2);
    ch.busy = ch.emoting = false;
    ch.reactT = 1.2;
    if (land) {
      ch.boing(-0.3);
      audio.play('thud', { pitch: 1.3, vol: 0.6 });
      for (let i = 0; i < 7; i++) P.spawn({ tex: 'entPuff', additive: false, x: B.seat.x + (Math.random() - 0.5) * 0.7, y: B.seat.y + 0.05, z: B.seat.z + (Math.random() - 0.5) * 0.5, vx: (Math.random() - 0.5) * 1.6, vy: 0.4 + Math.random() * 0.4, drag: 2.5, size: 0.18, size1: 0.04, color: [0xffffff, 0xd8e0f0], glow: 1, life: 0.5 });
    }
    if (o.last && stage.endShot) {
      const s = stage.endShot(side);
      cam.position.copy(s.pos);
      cam.lookAt(s.look);
    }
    setTimeout(() => { card.remove(); sayEl.remove(); }, 450);
    if (ownWrap) wrapOut(wrap);
    // let the last sprites finish, then free them
    let tt = 0;
    const tick = (dt) => { tt += dt; P.update(Math.max(dt, 1 / 60), cam); if (tt > 1) { P.dispose(); return true; } return false; };
    const off = engine.onFrame((dt) => { if (tick(dt)) off(); });
    resolveDone();
  };
  if (import.meta.env.DEV) window.__ent = ctl;
  return ctl;
}
