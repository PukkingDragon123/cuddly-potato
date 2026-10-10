// Interactive vial opening: grab -> shake (bubbles + foam build up) -> POP ->
// creatures burst out of the foam one by one.
import * as THREE from 'three';
import { engine } from '../../core/engine.js';
import { audio } from '../../core/audio.js';
import { fx, particles } from '../../core/particles.js';
import { animate, tween, wait } from '../../core/tween.js';
import { clamp, damp, rand, pick } from '../../core/util.js';
import { h, icon, button, $overlay, pointAt } from '../../ui/ui.js';
import { createSwarm } from '../../models/swarmModels.js';
import { SWARMS, RARITIES } from '../../data/swarms.js';
import { VIALS } from '../../data/vials.js';
import { Vial } from './vial.js';
import { revealCard } from './reveal.js';

/**
 * lab: LabScene (needs .scene, .camTo(), .benchPos, .jimmy, .jimmySay())
 * result: rolled vial result {coins, bucks, cards:[{id,copies,variant,isNew}], spells:[]}
 * opts: { hints: bool (tutorial prompts), quick: bool }
 */
export async function openVialSequence(lab, type, result, opts = {}) {
  const def = VIALS[type] || VIALS.lab;
  const bench = lab.benchPos.clone();
  lab.busy = true;
  lab.hideHub && lab.hideHub(true);
  await lab.camTo(new THREE.Vector3(bench.x + 0.3, bench.y + 1.35, bench.z + 3.9), new THREE.Vector3(bench.x + 0.2, bench.y + 0.85, bench.z), 0.8);

  const vial = new Vial(type);
  vial.root.position.set(bench.x, bench.y + 4, bench.z);
  lab.scene.add(vial.root);
  // drop in
  audio.play('whoosh', { pitch: 0.8 });
  await animate(0.55, (e) => (vial.root.position.y = bench.y + 4 * (1 - e)), { ease: 'inQuad' }).promise;
  vial.root.scale.set(1.25, 0.75, 1.25);
  tween(vial.root.scale, { x: 1, y: 1, z: 1 }, 0.5, { ease: 'outElastic' });
  fx.dust(vial.root.position, { count: 8, scale: 1.2 });
  audio.play('thud', { pitch: 1.3 });
  vial.slosh(4);

  // ---- interaction
  const prompt = h('div', { class: 'vial-prompt outline' }, 'GRAB THE VIAL!');
  const meterFill = h('i', { style: { width: '0%' } });
  const meter = h('div', { class: 'shake-meter hidden' }, h('div', { class: 'lbl outline-sm' }, 'SHAKE IT!'), h('div', { class: 'bar' }, meterFill));
  $overlay().append(prompt, meter);
  let removePtr = opts.hints ? pointAt(vial.root, 'Hold it!') : null;

  const st = { phase: 'grab', holding: false, shake: 0, px: 0, py: 0, sx: 0, sy: 0, vx: 0, lastSign: 0, vel: 0, off: new THREE.Vector3(), target: new THREE.Vector3(), lastMove: performance.now(), bubbleT: 0, sloshT: 0 };
  const rest = new THREE.Vector3(bench.x, bench.y, bench.z);
  let resolvePop;
  const popped = new Promise((r) => (resolvePop = r));
  let jimmyHinted = false;

  const onDown = (e) => {
    audio.unlock();
    if (st.phase === 'ready') {
      st.phase = 'pop';
      resolvePop();
      return;
    }
    if (st.phase !== 'grab' && st.phase !== 'shake') return;
    st.holding = true;
    st.sx = st.px = e.clientX;
    st.sy = st.py = e.clientY;
    st.lastMove = performance.now();
    if (st.phase === 'grab') {
      st.phase = 'shake';
      prompt.textContent = 'SHAKE IT!!';
      prompt.classList.add('wiggle');
      meter.classList.remove('hidden');
      audio.play('boing', { pitch: 1.4 });
      if (removePtr) { removePtr(); removePtr = null; }
      if (opts.hints && !jimmyHinted) { jimmyHinted = true; lab.jimmySay && lab.jimmySay('Shake it like you mean it!'); }
    }
    // tapping also adds a little shake (accessibility)
    addShake(0.035);
  };
  const onMove = (e) => {
    if (!st.holding) return;
    const now = performance.now();
    const dtm = Math.max(1, now - st.lastMove) / 1000;
    const dx = e.clientX - st.px, dy = e.clientY - st.py;
    st.lastMove = now;
    st.px = e.clientX;
    st.py = e.clientY;
    const vx = dx / dtm, vy = dy / dtm;
    const speed = Math.hypot(vx, vy);
    st.vel = speed;
    // direction reversals = proper shaking
    const sign = Math.sign(Math.abs(vx) > Math.abs(vy) ? vx : vy);
    if (sign !== 0 && sign !== st.lastSign && speed > 400) {
      st.lastSign = sign;
      addShake(0.05);
      vial.slosh(sign * 6);
      if (now - st.sloshT > 90) { st.sloshT = now; audio.play('slosh', { pitch: 0.8 + st.shake * 0.8, gap: 0.05 }); }
    }
    addShake(Math.min(speed, 4000) * dtm * 0.00007);
    st.vx = vx;
  };
  const onUp = () => { st.holding = false; };
  const onKey = (e) => {
    if (st.phase === 'ready' && (e.key === ' ' || e.key === 'Enter')) { st.phase = 'pop'; resolvePop(); return; }
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key) && (st.phase === 'grab' || st.phase === 'shake')) {
      if (st.phase === 'grab') { onDown({ clientX: engine.width / 2, clientY: engine.height / 2 }); st.holding = false; }
      addShake(0.06);
      vial.slosh((e.key === 'ArrowLeft' ? -1 : 1) * 6);
      audio.play('slosh', { pitch: 0.8 + st.shake, gap: 0.05 });
      st.kbdKick = 0.15;
      st.kbdDir = e.key === 'ArrowLeft' ? -1 : 1;
    }
  };
  function addShake(a) {
    if (st.phase !== 'shake') return;
    st.shake = Math.min(1, st.shake + a);
  }
  engine.canvas.addEventListener('pointerdown', onDown);
  $overlay().addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey);

  lab.interaction = (dt) => {
    vial.update(dt);
    // follow pointer while holding
    if (st.holding) {
      const k = 2.2 / engine.height;
      st.target.set(rest.x + clamp((st.px - st.sx) * k, -0.9, 0.9), rest.y + 0.45 + clamp(-(st.py - st.sy) * k, -0.3, 0.6), rest.z + 0.2);
    } else if (st.phase === 'shake' || st.phase === 'grab') {
      st.target.copy(rest);
      if (st.kbdKick > 0) { st.kbdKick -= dt; st.target.x += st.kbdDir * 0.25; st.target.y += 0.3; }
    }
    if (st.phase === 'ready') {
      st.target.set(rest.x + Math.sin(engine.time * 50) * 0.03, rest.y + 0.25 + Math.sin(engine.time * 37) * 0.02, rest.z);
    }
    const p = vial.root.position;
    p.x = damp(p.x, st.target.x, 14, dt);
    p.y = damp(p.y, st.target.y, 14, dt);
    p.z = damp(p.z, st.target.z, 14, dt);
    const tilt = clamp(-(st.holding ? st.vx : 0) * 0.00025, -0.7, 0.7);
    vial.body.rotation.z = damp(vial.body.rotation.z, tilt + (st.phase === 'ready' ? Math.sin(engine.time * 45) * 0.08 : 0), 10, dt);
    if (st.phase === 'shake') {
      if (!st.holding && !(st.kbdKick > 0)) st.shake = Math.max(0, st.shake - dt * 0.03);
      st.vx *= Math.exp(-dt * 6);
      meterFill.style.width = (st.shake * 100).toFixed(1) + '%';
      vial.foamLevel = damp(vial.foamLevel, st.shake * 0.92, 5, dt);
      vial.light.intensity = st.shake * 3;
      // bubbles proportional to intensity
      st.bubbleT -= dt * (1 + st.shake * 10 + (st.holding ? st.vel / 800 : 0));
      if (st.bubbleT <= 0) {
        st.bubbleT = 0.15;
        const wp = vial.root.position.clone().add(new THREE.Vector3(rand(-0.15, 0.15), 0.35 + rand(0, 0.5), rand(-0.1, 0.1)));
        fx.bubbles(wp, { count: 1 + Math.floor(st.shake * 3), color: def.liquid, radius: 0.08, size: 0.05, life: 0.6, speed: 0.6 });
        if (Math.random() < 0.3 + st.shake * 0.5) audio.play('bubble', { pitch: 0.8 + st.shake, gap: 0.05 });
      }
      if (st.shake >= 1) {
        st.phase = 'ready';
        meter.classList.add('full');
        prompt.textContent = 'TAP TO POP!!';
        prompt.classList.remove('wiggle');
        prompt.classList.add('pulse');
        audio.play('fizz');
        if (opts.hints) removePtr = pointAt(vial.root, 'POP!');
        engine.shake(0.15);
      }
    }
    if (st.phase === 'ready') {
      vial.foamLevel = 1;
      vial.light.intensity = 4 + Math.sin(engine.time * 20) * 1.5;
      vial.cap.position.y = vial.H + 0.1 + Math.abs(Math.sin(engine.time * 40)) * 0.04;
      if (Math.random() < dt * 25) {
        const cp = vial.root.position.clone().add(new THREE.Vector3(rand(-0.3, 0.3), vial.H + 0.15, rand(-0.2, 0.2)));
        fx.foam(cp, { count: 2, power: 0.3, speed: 1.2, scale: 0.5, colors: [0xffffff, def.liquid] });
      }
      engine.shake(0.02);
    }
  };

  await popped;
  if (removePtr) { removePtr(); removePtr = null; }
  engine.canvas.removeEventListener('pointerdown', onDown);
  $overlay().removeEventListener('pointerdown', onDown);
  window.removeEventListener('pointermove', onMove);
  window.removeEventListener('pointerup', onUp);
  window.removeEventListener('keydown', onKey);
  prompt.remove();
  meter.remove();

  // ---- POP!
  const top = vial.root.position.clone().add(new THREE.Vector3(0, vial.H + 0.2, 0));
  audio.play('bigPop');
  engine.shake(0.7);
  engine.hitstop(0.08);
  fx.foam(top, { count: 90, power: 1.3, colors: [0xffffff, 0xf2fbff, def.liquid, def.liquid], speed: 3.5, ground: bench.y });
  fx.bubbles(top, { count: 30, color: def.liquid, radius: 0.5, speed: 2 });
  fx.slime(top, { count: 24, color: def.liquid, speed: 5, ground: bench.y });
  fx.sparkle(top, { count: 30, colors: [0xffffff, def.liquid], speed: 5, radius: 1 });
  fx.shockwave(new THREE.Vector3(top.x, bench.y, top.z), { radius: 2, color: def.liquid });
  // cap flies off
  const cap = vial.cap;
  const capStart = cap.getWorldPosition(new THREE.Vector3());
  vial.body.remove(cap);
  lab.scene.add(cap);
  cap.position.copy(capStart);
  const cvx = rand(-1.5, 1.5);
  animate(1.6, (e, k) => {
    cap.position.set(capStart.x + cvx * k * 2, capStart.y + k * 6 - k * k * 7, capStart.z - k * 1.5);
    cap.rotation.x += 0.3;
    cap.rotation.z += 0.2;
  }, { onComplete: () => lab.scene.remove(cap) });
  vial.foamLevel = 0.2;
  vial.liqLevel = 0.3;
  vial.silhouette.visible = false;
  vial.light.intensity = 6;
  // foam bursts continuously for a bit
  let foamT = 0;
  lab.interaction = (dt) => {
    vial.update(dt);
    foamT += dt;
    vial.light.intensity = damp(vial.light.intensity, 1.5, 2, dt);
    if (foamT < 1.4 && Math.random() < dt * 30) fx.foam(top, { count: 3, power: 0.6, colors: [0xffffff, def.liquid], speed: 2, ground: bench.y });
  };
  await wait(0.45);

  // ---- reveal coins
  const items = [];
  if (result.coins) items.push({ kind: 'coins', amount: result.coins });
  if (result.bucks) items.push({ kind: 'bucks', amount: result.bucks });
  for (const c of result.cards) items.push({ kind: 'swarm', ...c });
  for (const s of result.spells || []) items.push({ kind: 'spell', id: s });

  let skipAll = false;
  let skipBtn = null;
  if (result.cards.length > 3) {
    skipBtn = button('Skip ▶▶', () => { skipAll = true; skipBtn.remove(); }, 'small gray');
    Object.assign(skipBtn.style, { position: 'absolute', right: '12px', top: 'calc(var(--safe-t) + 12px)', zIndex: 26 });
    $overlay().appendChild(skipBtn);
  }

  let prevRig = null;
  for (const it of items) {
    if (skipAll) break;
    if (it.kind === 'coins' || it.kind === 'bucks') {
      fx.coins(top, 30, { ground: bench.y });
      fx.cash(top, it.kind === 'bucks' ? 20 : 8, { speed: 4, coinRatio: 0.8, ground: bench.y });
      audio.play('chaching');
      await revealCard(it);
      continue;
    }
    if (it.kind === 'spell') {
      fx.sparkle(top, { count: 40, colors: [0x5fdc4a, 0xffd23f, 0xffffff], speed: 5, radius: 1 });
      await revealCard(it);
      continue;
    }
    // swarm creature bursts from the foam
    const s = SWARMS[it.id];
    const rar = RARITIES[s.rarity];
    if (rar.order >= 2) {
      // build-up for ultra rare+
      const rl = new THREE.PointLight(rar.hex, 0, 6);
      rl.position.copy(top);
      lab.scene.add(rl);
      for (let i = 0; i < 6; i++) {
        audio.play('drum');
        rl.intensity = 2 + i * 1.5;
        fx.sparkle(top, { count: 8, color: rar.hex, speed: 3 + i, radius: 0.8 });
        engine.shake(0.05 + i * 0.03);
        await wait(0.12);
      }
      fx.rise(new THREE.Vector3(top.x, bench.y, top.z), { count: 40, colors: [rar.hex, 0xffffff], radius: 0.8 });
      setTimeout(() => lab.scene.remove(rl), 1500);
    }
    if (prevRig) {
      const pr = prevRig;
      animate(0.25, (e) => pr.root.scale.setScalar(1 - e), { onComplete: () => lab.scene.remove(pr.root) });
    }
    const rig = createSwarm(it.id, { variant: it.variant ?? 'base', skin: null, scale: 1 });
    const fit = 1.05 / Math.max(rig.height, rig.length * 0.8, 0.5);
    rig.baseScale = fit;
    rig.root.position.copy(top).setY(bench.y + 0.3);
    rig.root.rotation.y = 0.25;
    lab.scene.add(rig.root);
    prevRig = rig;
    lab.revealRig = rig;
    audio.play('pop', { pitch: 0.8 });
    audio.play('slime');
    fx.foam(top, { count: 30, power: 0.8, colors: [0xffffff, def.liquid], speed: 2.5, ground: bench.y });
    const fromY = bench.y + 0.3, peak = bench.y + 1.8, land = bench.y;
    const landX = top.x - 0.8;
    await animate(0.6, (e, k) => {
      rig.root.position.set(top.x + (landX - top.x) * k, fromY + (peak - fromY) * Math.sin(k * Math.PI * 0.5) * (1 - k) + (land - fromY) * k + Math.sin(k * Math.PI) * 0.6, top.z + 0.25 * k);
      rig.root.rotation.y = 0.25 + k * Math.PI * 2;
    }).promise;
    rig.root.rotation.y = 0.3;
    rig.boing(0.7);
    fx.dust(rig.root.position, { count: 8 });
    fx.slime(rig.root.position.clone().setY(bench.y + 0.05), { count: 10, color: def.liquid, speed: 2, ground: bench.y });
    if (it.variant && it.variant !== 'base') fx.sparkle(rig.root.position.clone().setY(bench.y + 0.5), { count: 40, colors: [0xffffff, 0x9ff2ff, 0xffd23f], speed: 3, radius: 0.6, life: 1.2 });
    audio.play(rar.order >= 3 ? 'roar' : 'growl', { pitch: rar.order >= 3 ? 1 : 1.3 });
    lab.jimmyReact && lab.jimmyReact(rar.order);
    rig.attack(0.6);
    await revealCard(it, { side: true, tapText: items.indexOf(it) < items.length - 1 ? 'Tap for next' : 'Tap to finish' });
  }
  if (skipBtn) skipBtn.remove();
  if (skipAll) await summary(result);
  lab.revealRig = null;
  // cleanup
  if (prevRig) {
    const pr = prevRig;
    animate(0.3, (e) => pr.root.scale.setScalar(1 - e), { onComplete: () => lab.scene.remove(pr.root) });
  }
  await animate(0.35, (e) => vial.root.scale.setScalar(1 - e), { ease: 'inBack' }).promise;
  lab.scene.remove(vial.root);
  lab.interaction = null;
  await lab.camHome(0.7);
  lab.busy = false;
  lab.hideHub && lab.hideHub(false);
}

async function summary(result) {
  const { swarmThumb } = await import('../../ui/thumbs.js');
  const { modal } = await import('../../ui/ui.js');
  return new Promise((res) => {
    const grid = h('div', { class: 'grid' }, result.cards.map((c) => {
      const s = SWARMS[c.id];
      return h('div', { class: `card ${s.rarity}` },
        h('div', { class: 'portrait' }, h('img', { src: swarmThumb(c.id, c.variant ?? 'base') })),
        h('div', { class: 'name' }, s.name),
        h('div', { class: 'tiny center row' }, c.isNew ? h('span', { class: 'greent' }, 'NEW! ') : null, `x${c.copies}`));
    }));
    const m = modal({ title: 'VIAL CONTENTS', color: 'pink', size: 'mid', body: h('div', {}, h('div', { class: 'row center' }, icon('coin'), `+${result.coins}`), grid), onClose: res, foot: [button('Awesome!', () => m.close(), 'green')] });
  });
}
