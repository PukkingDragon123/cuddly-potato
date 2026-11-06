// Free look around Beast Island from the home lobby: drag pans across the island (with a little
// glide), pinch or the mouse wheel zooms, everything stays inside the island's bounds. A BACK button
// appears once you have wandered off and flies you back to your arena. Taps still go to the island
// (the home scene's tapWorld) because a pan only starts after the finger has really moved.
//
//   const ex = setupExplore(home);   ex.update(dt)   ex.reset()   ex.busy   ex.moved   ex.dispose()
import './islandExplore.css';
import * as THREE from 'three';
import { engine } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { button } from '../ui/ui.js';

const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _off = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export function setupExplore(home, o = {}) {
  const I = home.I;
  const B = o.bounds ?? { x0: -125, x1: 180, z0: -300, z1: 135 };
  const ptrs = new Map();
  let pan = null, pinch = null, vel = new THREE.Vector2(), moved = false, lastFit = null, zoomK = 1, settleY = null;
  const tabOk = () => home.tab === 'battle' && !home.road?.active && !home.fly && !home.root?.classList.contains('hm-road');

  // BACK to your arena
  const back = button('', () => { audio.play('tap'); ctl.reset(true); }, 'blue icon-only hm-sb hm-sb-home', { icon: 'pin', sound: false });
  back.classList.add('hm-ex-hide');
  const side = home.root?.querySelector('.hm-side.right');
  side?.appendChild(back);

  const lookDist = () => home.cam.pos.distanceTo(home.cam.look);
  /** World units per screen pixel on the ground at the look point. */
  const unitsPerPx = () => (2 * lookDist() * Math.tan(THREE.MathUtils.degToRad(home.camera.fov / 2))) / Math.max(1, engine.height);
  function panBy(dx, dy) {
    const c = home.camera;
    c.getWorldDirection(_f);
    _f.y = 0;
    if (_f.lengthSq() < 1e-6) return;
    _f.normalize();
    _r.crossVectors(_f, _up).normalize();
    const k = unitsPerPx();
    // the ground follows the finger (foreshortened along the view direction)
    const pitch = Math.max(0.35, Math.abs(Math.sin(Math.atan2(home.cam.pos.y - home.cam.look.y, Math.hypot(home.cam.pos.x - home.cam.look.x, home.cam.pos.z - home.cam.look.z)))));
    const mx = -dx * k, mz = (dy * k) / pitch;
    move(_r.x * mx + _f.x * mz, _r.z * mx + _f.z * mz);
  }
  function move(dx, dz) {
    const L = home.cam.look, P = home.cam.pos;
    const nx = THREE.MathUtils.clamp(L.x + dx, B.x0, B.x1), nz = THREE.MathUtils.clamp(L.z + dz, B.z0, B.z1);
    const ddx = nx - L.x, ddz = nz - L.z;
    L.x += ddx; L.z += ddz; P.x += ddx; P.z += ddz;
    if (Math.abs(ddx) + Math.abs(ddz) > 0.001) touch();
  }
  function zoomBy(f) {
    const nk = THREE.MathUtils.clamp(zoomK * f, 0.42, 2.4);
    const real = nk / zoomK;
    if (Math.abs(real - 1) < 1e-4) return;
    zoomK = nk;
    _off.copy(home.cam.pos).sub(home.cam.look).multiplyScalar(real);
    home.cam.pos.copy(home.cam.look).add(_off);
    touch();
  }
  function touch() {
    moved = true;
    home.idleK = 0;
    back.classList.remove('hm-ex-hide');
    const L = home.cam.look;
    if (!lastFit || Math.hypot(L.x - lastFit.x, L.z - lastFit.z) > 6) { lastFit = L.clone(); home.fitShadow(L); }
  }

  const onDown = (e) => {
    if (!tabOk() || e.button > 0) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    vel.set(0, 0);
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
      pan = null;
    } else if (ptrs.size === 1) pan = { id: e.pointerId, live: false, t: performance.now() };
  };
  const onMove = (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      zoomBy(pinch.d / d);
      pinch.d = d;
      return;
    }
    if (!pan || pan.id !== e.pointerId) return;
    if (!pan.live && Math.hypot(e.clientX - p.x0, e.clientY - p.y0) < 13) return;
    pan.live = true;
    ctl.busy = true;
    panBy(dx, dy);
    const now = performance.now(), dt = Math.max(1, now - pan.t) / 1000;
    pan.t = now;
    vel.lerp(new THREE.Vector2(dx / dt, dy / dt), 0.5);
  };
  const onUp = (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (pan && pan.id === e.pointerId) {
      if (!pan.live) vel.set(0, 0);
      else vel.clampLength(0, 2400);
      pan = null;
    }
    if (!ptrs.size) setTimeout(() => { ctl.busy = false; }, 0);
  };
  const onWheel = (e) => {
    if (!tabOk()) return;
    zoomBy(e.deltaY > 0 ? 1.12 : 1 / 1.12);
  };
  const c = engine.canvas;
  c.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  c.addEventListener('wheel', onWheel, { passive: true });

  const ctl = {
    busy: false,
    get moved() { return moved; },
    /** Was the last pointer gesture a pan / pinch (not a tap)? */
    dragged: () => ctl.busy,
    update(dt) {
      if (!tabOk()) { vel.set(0, 0); return; }
      if (!pan && vel.lengthSq() > 4) {
        panBy(vel.x * dt, vel.y * dt);
        vel.multiplyScalar(Math.exp(-dt * 4.2));
      }
      if (moved) {
        // the look point rides the ground so hills and the summit stay framed
        const L = home.cam.look;
        const gy = Math.max(1, I.heightAt(L.x, L.z) + 1);
        settleY = settleY ?? L.y;
        const ny = settleY + (gy - settleY) * Math.min(1, dt * 2.5);
        const d = ny - L.y;
        L.y += d; home.cam.pos.y += d;
        settleY = ny;
        home.idleK = 0;
      }
    },
    /** Back to the arena framing (fly = animate). */
    reset(fly = false) {
      vel.set(0, 0);
      moved = false;
      zoomK = 1;
      settleY = null;
      back.classList.add('hm-ex-hide');
      if (fly) home.placeZone(home.zoneIdx, false, 1.1);
    },
    /** The home scene placed the camera itself (arena arrows, road, cinematic). */
    placed() { moved = false; zoomK = 1; settleY = null; vel.set(0, 0); back.classList.add('hm-ex-hide'); },
    dispose() {
      c.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      c.removeEventListener('wheel', onWheel);
      back.remove();
    },
  };
  return ctl;
}
