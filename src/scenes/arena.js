// ARENA: an explorable voxel island (progression map). The player walks around as
// their chibi avatar; zones unlock along a physical Trophy Road, NPCs give quests,
// gates start ranked / boss / practice battles, and secrets hide everywhere.
import * as THREE from 'three';
import './arena/arena.css';
import { engine, addLights } from '../core/engine.js';
import { audio } from '../core/audio.js';
import { fx } from '../core/particles.js';
import { clamp, damp, lerp, rand } from '../core/util.js';
import { animate } from '../core/tween.js';
import { state, findSecret } from '../game/state.js';
import { game } from '../game/game.js';
import { ARENAS, arenaById, BOSSES } from '../data/arena.js';
import { say, toast, bigBanner, closeDialogue, floatText, speech, h, $world } from '../ui/ui.js';
import { charPortrait } from '../ui/thumbs.js';
import { Terrain, makeLiquid } from './arena/terrain.js';
import { World } from './arena/collide.js';
import { bake } from './arena/batch.js';
import { prop, bboxSize } from './arena/kit.js';
import { Input, Avatar, RUN } from './arena/player.js';
import { NPC } from './arena/npc.js';
import { HUD } from './arena/hud.js';
import { ZONES, zoneAt, MART_STORE, inRect, SPAWN, PORTAL_POS, LAB_DOOR, GRID, HALF } from './arena/layout.js';
import { buildIsland } from './arena/zones/island.js';
import { buildLabYard } from './arena/zones/labyard.js';
import { buildPark } from './arena/zones/park.js';
import { buildSuburb } from './arena/zones/suburb.js';
import { buildMansion } from './arena/zones/mansion.js';
import { buildMart } from './arena/zones/mart.js';
import { buildTechno, buildReactor } from './arena/zones/north.js';
import { buildFactory } from './arena/zones/factory.js';
import { buildGates } from './arena/gates.js';
import { buildCritters } from './arena/critters.js';
import { openSecretReward, rewardToasts } from './arena/modals.js';

const PITCH = THREE.MathUtils.degToRad(52);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class ArenaScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, engine.aspect, 0.5, 240);
    this.state = state;
    this.statics = new Map();
    this.updaters = [];
    this.interactables = [];
    this.pickables = [];
    this.npcs = [];
    this.pois = [];
    this.dynamics = [];
    this.time = 0;
    this.camTarget = new THREE.Vector3();
    this.camDist = 20;
    this.zoom = 1;
    this.talkZoom = 1;
    this.zone = null;
    this.disposers = [];
    this.posts = [];
    this.bossGates = {};
    this.shakeScale = 1;
  }

  // ---------------------------------------------------------------------------
  // Builder API (used by zone modules)

  static(zoneId = 'misc') {
    let g = this.statics.get(zoneId);
    if (!g) {
      g = new THREE.Group();
      g.name = 'static:' + zoneId;
      this.statics.set(zoneId, g);
    }
    return g;
  }

  /**
   * Place a prop. o: { x, z, y, rot, zone, fit, scale, collide: 'box'|'circle'|false|{r}|{w,d}, pad, dynamic, tag, data, onBump }
   */
  put(name, args = [], o = {}) {
    const p = prop(name, args, { fit: o.fit, fallback: o.fallback });
    const root = p.root;
    if (o.scale) root.scale.multiplyScalar(o.scale);
    let rot = o.rot ?? 0;
    if (o.long && p.real) {
      const s = bboxSize(root);
      if ((o.long === 'z' && s.x > s.z * 1.05) || (o.long === 'x' && s.z > s.x * 1.05)) rot += o.longRot ?? Math.PI / 2;
    }
    root.position.set(o.x ?? 0, o.y ?? this.terrain.heightAt(o.x ?? 0, o.z ?? 0), o.z ?? 0);
    if (rot) root.rotation.y = rot;
    o.rot = rot;
    const dynamic = o.dynamic || !!p.update;
    if (dynamic) {
      this.scene.add(root);
      if (p.update) this.onUpdate(p.update, o.x, o.z, o.updateRange ?? 40);
    } else this.static(o.zone).add(root);
    p.collider = this.colliderFor(root, o);
    return p;
  }

  colliderFor(root, o) {
    const c = o.collide ?? 'box';
    if (!c) return null;
    const opts = { tag: o.tag, data: o.data, onBump: o.onBump, carts: o.carts, bounce: o.bounce };
    if (c === 'circle' || c.r) {
      const r = c.r ?? 0.45;
      return this.world.circle(root.position.x, root.position.z, r, opts);
    }
    if (c.w) return this.world.boxAt(root.position.x, root.position.z, c.w, c.d ?? c.w, o.rot ?? 0, opts);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const pad = o.pad ?? 0.08;
    return this.world.box(box.min.x + pad, box.min.z + pad, box.max.x - pad, box.max.z - pad, opts);
  }

  /** World-space bounding box of a placed object. */
  bbox(obj) {
    obj.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(obj);
  }

  /** Add an Object3D to the static batch of a zone. */
  addStatic(obj, zone = 'misc') {
    this.static(zone).add(obj);
    return obj;
  }

  /** Run fn after all zone builders (before terrain meshing). Lower order runs first. */
  post(fn, order = 1) {
    this.posts.push({ fn, order });
  }

  /** Per-frame callback fn(dt, t); return true to remove it. Optional range gate around (x,z). */
  onUpdate(fn, x, z, range) {
    const u = { fn, x, z, r: range, dead: false };
    this.updaters.push(u);
    return u;
  }
  offUpdate(u) {
    if (u) u.dead = true;
  }

  interact(o) {
    const it = {
      range: 1.8, label: 'USE', icon: 'star', color: 'yellow', inside: false, ...o,
      pos: o.pos?.isVector3 ? o.pos : new THREE.Vector3(o.pos?.x ?? o.pos?.[0] ?? 0, 0, o.pos?.z ?? o.pos?.[1] ?? 0),
    };
    this.interactables.push(it);
    if (it.hit) {
      it.hit.userData.it = it;
      this.pickables.push(it.hit);
    }
    return it;
  }

  npc(charId, opts) {
    const n = new NPC(this, charId, opts);
    this.npcs.push(n);
    return n;
  }

  poi(o) {
    this.pois.push(o);
    return o;
  }

  liquid(x, z, w, d, kind, y, opts) {
    const L = makeLiquid(w, d, kind, opts);
    L.mesh.position.set(x, y, z);
    this.scene.add(L.mesh);
    this.onUpdate(L.update, x, z, opts?.range ?? 80);
    return L;
  }

  zoneUnlocked(z) {
    if (!z) return true;
    if (z.open || z.seasonal || !z.arena) return true;
    const a = arenaById(z.arena);
    return !a || state.p.bestTrophies >= a.trophies;
  }
  zoneArenaReq(z) {
    const a = z.arena ? arenaById(z.arena) : null;
    return a ? a.trophies : 0;
  }

  // ---------------------------------------------------------------------------

  async enter(params = {}) {
    this.params = params;
    if (params.dev) this.applyDev(params);
    const p = state.p;
    p.arena = p.arena || { pos: null, visited: {} };
    p.arena.visited = p.arena.visited || {};

    this.scene.background = new THREE.Color(0x2d7bb0);
    this.scene.fog = new THREE.Fog(0x2d7bb0, 46, 92);
    this.lights = addLights(this.scene, { shadowExtent: 25, dir: [9, 16, 8], sun: 2.2, hemi: 1.35, shadowRes: 1024 });
    this.sunDir = new THREE.Vector3(9, 16, 8);

    this.terrain = new Terrain();
    this.world = new World(this.terrain);
    this.input = new Input(this);
    this.player = new Avatar(this);

    // Build the island (order matters: terrain paint first, then props).
    const t0 = performance.now();
    const builders = [buildIsland, buildLabYard, buildPark, buildSuburb, buildMansion, buildMart, buildTechno, buildReactor, buildFactory, buildGates, buildCritters];
    for (const b of builders) {
      try {
        b(this);
      } catch (e) {
        console.error('[arena] builder failed:', b.name, e);
      }
    }
    this.posts.sort((a, b) => a.order - b.order);
    for (const p of this.posts) {
      try {
        p.fn();
      } catch (e) {
        console.error('[arena] post step failed', e);
      }
    }
    this.terrain.build(this.scene);
    const ocean = makeLiquid(420, 420, 'water', { opacity: 0.8, texel: 4, flow: [0.012, 0.02] });
    ocean.mesh.position.set(0, -0.55, 0);
    ocean.mesh.renderOrder = -1;
    this.scene.add(ocean.mesh);
    this.onUpdate(ocean.update);
    this.ocean = ocean;
    for (const [id, g] of this.statics) {
      const baked = bake(g, { chunk: 20 });
      this.scene.add(baked);
    }
    this.statics.clear();
    this.world.buildPathGrid();
    if (params.dev && params.perf) console.log(`[arena] island built in ${Math.round(performance.now() - t0)}ms`);

    // tap marker
    this.tapMarker = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.5, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
    this.tapMarker.rotation.x = -Math.PI / 2;
    this.tapMarker.visible = false;
    this.scene.add(this.tapMarker);
    // interact highlight ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.visible = false;
    this.scene.add(this.ring);

    this.hud = new HUD(this);
    this.placePlayer(params);
    for (const it of this.interactables) it.inside = it.pos.distanceTo(_v.set(this.player.pos.x, it.pos.y, this.player.pos.z)) < it.range;

    this.resize(engine.width, engine.height);
    this.updateCamera(0, true);
    audio.music('map');
    this.zone = null;
    this.zoneCheckT = 0;
    if (typeof window !== 'undefined') window.__arena = this;

    if (p.tutorial === 'arena') setTimeout(() => this.runTutorial(), 700);
  }

  applyDev(params) {
    const p = state.p;
    if (params.trophies !== undefined) {
      const t = parseInt(params.trophies, 10) || 0;
      p.trophies = t;
      p.bestTrophies = Math.max(t, params.best ? parseInt(params.best, 10) : t);
    }
    if (params.tutorial) p.tutorial = params.tutorial;
    if (params.name) p.name = params.name;
    if (params.pos === 'reset') p.arena = { pos: null, visited: {} };
  }

  placePlayer(params) {
    const p = state.p;
    let x = SPAWN[0], z = SPAWN[1], face = Math.PI;
    if (params.at) {
      const zn = ZONES.find((zz) => zz.id === params.at);
      const s = zn ? this.zoneSpawn(zn) : null;
      if (s) [x, z] = s;
    } else if (params.from === 'battle') {
      const b = params.bossId && this.bossGates?.[params.bossId];
      if (b) {
        x = b.x;
        z = b.z + 2.6;
      } else {
        x = PORTAL_POS[0] + 1.5;
        z = PORTAL_POS[1] + 3;
      }
      face = 0;
    } else if (params.from === 'lab') {
      x = LAB_DOOR[0];
      z = LAB_DOOR[1] + 2.2;
      face = 0;
    } else if (p.arena.pos && Array.isArray(p.arena.pos)) {
      [x, z] = p.arena.pos;
    }
    if (!this.world.free(x, z, 0.4) || !this.terrain.walkable(x, z)) [x, z] = SPAWN;
    this.player.place(x, z);
    this.player.facing = face;
    this.player.root.rotation.y = face;
  }

  zoneSpawn(z) {
    if (z.spawn) return z.spawn;
    const cx = (z.rect[0] + z.rect[2]) / 2, cz = (z.rect[1] + z.rect[3]) / 2;
    const nf = this.world.nearestFree(Math.floor(cx + HALF), Math.floor(cz + HALF), 12);
    return nf ? [nf[0] - HALF + 0.5, nf[1] - HALF + 0.5] : null;
  }

  exit() {
    const p = state.p;
    if (this.player) {
      p.arena.pos = [Math.round(this.player.pos.x * 10) / 10, Math.round(this.player.pos.z * 10) / 10];
      state.save();
    }
    this.input?.dispose();
    this.hud?.dispose();
    this.player?.dispose();
    for (const d of this.disposers) {
      try {
        d();
      } catch (e) { /* ignore */ }
    }
    closeDialogue();
    this.scene.traverse((o) => {
      if (o.userData?.disposable && o.geometry) o.geometry.dispose();
    });
    if (window.__arena === this) window.__arena = null;
  }

  resize(w, hgt) {
    const cam = this.camera;
    cam.aspect = w / hgt;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * 2;
    // keep at least ~15 units wide and ~13 units tall visible around the player
    const byH = 16.5 / t;
    const byW = 19 / (t * cam.aspect);
    this.camDist = clamp(Math.max(byH, byW), 21, 36);
    cam.far = this.camDist + 120;
    cam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------------------
  // Input handlers

  onTap(x, y) {
    if (this.player.locked) return;
    audio.unlock();
    const hits = engine.raycast(x, y, this.pickables, this.camera, false);
    for (const hit of hits) {
      const it = hit.object.userData.it;
      if (!it || (it.enabled && !it.enabled())) continue;
      this.goInteract(it);
      return;
    }
    const pt = engine.rayToPlane(x, y, 0, this.camera);
    if (!pt) return;
    if (this.player.walkTo(pt.x, pt.z)) {
      this.showTapMarker(pt.x, pt.z);
    } else {
      audio.play('deny', { vol: 0.5 });
      floatText(pt, '✖', 'info', { life: 0.6 });
    }
  }

  goInteract(it) {
    const pl = this.player;
    const d = Math.hypot(it.pos.x - pl.pos.x, it.pos.z - pl.pos.z);
    if (d <= it.range) {
      this.activate(it);
      return;
    }
    audio.play('tap', { vol: 0.6 });
    const ok = pl.walkTo(it.pos.x, it.pos.z, { target: it.pos, range: it.range * 0.85, onArrive: () => this.activate(it) });
    if (ok) this.showTapMarker(it.pos.x, it.pos.z, 0xffd23f);
  }

  activate(it) {
    if (it.enabled && !it.enabled()) return;
    if (this.player.locked && !it.allowLocked) return;
    this.player.cancelPath();
    this.player.sitting = null;
    if (it.face !== false) this.player.face(it.pos.x, it.pos.z);
    try {
      it.act(it);
    } catch (e) {
      console.error('[arena] interact failed', it.id, e);
    }
  }

  showTapMarker(x, z, color = 0xffffff) {
    const m = this.tapMarker;
    m.visible = true;
    m.material.color.setHex(color);
    m.position.set(x, this.terrain.heightAt(x, z) + 0.06, z);
    this.tapT = 0;
  }
  hideTapMarker() {
    if (this.tapMarker) this.tapMarker.visible = false;
  }

  emote() {
    const pl = this.player;
    if (pl.locked) return;
    const anims = ['dance', 'cheer', 'wave', 'victory'];
    this.emoteIdx = ((this.emoteIdx ?? -1) + 1) % anims.length;
    const a = anims[this.emoteIdx];
    pl.emote(a, a === 'dance' ? 3.2 : 1.8);
    pl.chibi.expr('happy', 'grin', 2.5);
    audio.play(a === 'dance' ? 'magic' : 'boing', { vol: 0.6 });
    if (a === 'dance') {
      fx.sparkle(_v.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z), { count: 14, colors: [0xff2e88, 0x29b6f6, 0xffd23f] });
      // nearby NPCs join the dance
      for (const n of this.npcs) {
        if (n.busy || n.pos.distanceTo(pl.pos) > 7) continue;
        setTimeout(() => {
          n.chibi.play('dance', { dur: 2.8, then: n.idleAnim });
          n.chibi.expr('happy', 'grin', 2.8);
        }, rand(100, 600));
      }
    }
  }

  goLab() {
    if (this.leaving) return;
    this.leaving = true;
    audio.play('whoosh');
    game.go('lab', { from: 'arena' });
  }

  /** Teleport with a poof. */
  fastTravel(z) {
    const s = this.zoneSpawn(z);
    if (!s) return;
    const pl = this.player;
    fx.smoke(pl.pos, { count: 14, scale: 1.4, color: 0xffffff });
    audio.play('whoosh');
    pl.place(s[0], s[1]);
    this.updateCamera(0, true);
    fx.burst(_v.set(s[0], 0.6, s[1]), { count: 20, colors: [0xffffff, 0xffd23f, 0x29b6f6], speed: 5, size: 0.12 });
    fx.shockwave(_v.set(s[0], 0, s[1]), { radius: 2.5 });
    audio.play('magic');
    pl.chibi.boing(0.4);
  }

  /** Lock controls & zoom while talking to an NPC. fn is the async dialogue body. */
  async dialogue(npc, fn) {
    const pl = this.player;
    pl.locked = true;
    pl.cancelPath();
    pl.face(npc.pos.x, npc.pos.z);
    this.talkFocus = npc;
    this.hud.setAction(null);
    try {
      await fn();
    } catch (e) {
      console.error('[arena] dialogue error', e);
    } finally {
      pl.locked = false;
      this.talkFocus = null;
      closeDialogue();
    }
  }

  /** Dialogue line from an NPC (portrait + typewriter). */
  line(npc, text, opts = {}) {
    const who = { name: npc.name, portrait: charPortrait(npc.charId, opts.portrait), color: npc.def.color, chibi: npc.chibi };
    if (opts.anim) npc.chibi.play(opts.anim, opts.animOpts);
    else npc.chibi.play('talk');
    if (opts.expr) npc.chibi.expr(...opts.expr);
    const r = say(who, text.replace(/\{name\}/g, state.p.name), opts);
    return Promise.resolve(r).then((v) => {
      if (!opts.keepAnim) npc.chibi.play(npc.idleAnim);
      return v;
    });
  }

  /** Discover a secret (once). Returns true if newly found. */
  secret(id, pos) {
    const r = findSecret(id);
    if (!r) return false;
    openSecretReward(this, r, pos);
    return true;
  }

  engineShake(a) {
    if (state.p.settings?.shake !== false) engine.shake(a);
  }

  rewardToasts(list) {
    rewardToasts(list);
  }

  /** Player vs dynamic bodies (NPCs). Carts handle their own pushing. */
  dynamicCollide(pl) {
    for (const n of this.npcs) {
      const dx = pl.pos.x - n.pos.x, dz = pl.pos.z - n.pos.z;
      const R = pl.radius + n.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pl.pos.x += (dx / d) * (R - d);
        pl.pos.z += (dz / d) * (R - d);
      }
    }
    if (this.carts) this.carts.pushFrom(pl);
  }

  // ---------------------------------------------------------------------------
  // Tutorial: Jimmy pops in on the first visit

  async runTutorial() {
    if (this.tutorialRunning) return;
    this.tutorialRunning = true;
    const pl = this.player;
    const sx = pl.pos.x + 2.2, sz = pl.pos.z - 1.2;
    const jimmy = this.npc('jimmy', { id: 'jimmyTut', pos: [sx, sz], react: null });
    jimmy.root.scale.setScalar(0.01);
    fx.confetti(_v.set(sx, 1, sz), { count: 70 });
    fx.smoke(_v.set(sx, 0.2, sz), { count: 10, color: 0xffffff, scale: 1.3 });
    audio.play('bigPop');
    animate(0.45, (e) => jimmy.root.scale.setScalar(Math.max(0.01, e)), { ease: 'outBack' });
    await new Promise((r) => setTimeout(r, 500));
    jimmy.chibi.play('wave', { dur: 1.2, then: 'idle' });
    await this.dialogue(jimmy, async () => {
      await this.line(jimmy, 'Welcome to the *Arena*, {name}! This whole island is our playground.', { expr: ['happy', 'grin'] });
      await this.line(jimmy, 'Walk into the *Ranked Gate* to battle Ghost Players for Trophies. More Trophies unlock new zones along the *Trophy Road*!', { anim: 'point' });
      await this.line(jimmy, "It's *FOOD SEASON* - check out *Beast Mart*! Bosses lurk behind skull gates... and Nolan's in the Suburb. He lost something. Again.", { expr: ['wink', 'smirk'] });
    });
    state.p.tutorial = 'done';
    state.save();
    jimmy.chibi.play('cheer', { dur: 1.2, then: 'idle' });
    audio.play('cheer');
    // Jimmy points at the portal, then runs off towards his mansion
    const stop = (await import('../ui/ui.js')).pointAt(_v2.set(PORTAL_POS[0], 2.2, PORTAL_POS[1]).clone(), 'Ranked Gate');
    setTimeout(stop, 4500);
    setTimeout(() => {
      jimmy.followTarget = { x: -18, z: 30, speed: 5, stop: 0.5 };
      setTimeout(() => {
        fx.smoke(jimmy.pos, { count: 12, color: 0xffffff, scale: 1.2 });
        audio.play('pop');
        jimmy.alive = false;
        this.scene.remove(jimmy.root);
        this.npcs.splice(this.npcs.indexOf(jimmy), 1);
      }, 2600);
    }, 1400);
  }

  // ---------------------------------------------------------------------------

  update(dt, gdt) {
    this.time += dt;
    const t = this.time;
    const pl = this.player;
    if (!pl) return;
    pl.update(dt);
    // updaters (range gated)
    const px = pl.pos.x, pz = pl.pos.z;
    let dead = 0;
    for (const u of this.updaters) {
      if (u.dead) {
        dead++;
        continue;
      }
      if (u.r && u.x !== undefined && (Math.abs(u.x - px) > u.r || Math.abs(u.z - pz) > u.r)) continue;
      if (u.fn(dt, t) === true) u.dead = true;
    }
    if (dead > 16) this.updaters = this.updaters.filter((u) => !u.dead);
    for (const n of this.npcs) n.update(dt, t);
    this.updateInteract(dt);
    this.updateZone(dt);
    this.updateCamera(dt);
    this.hud.update(dt);
    if (this.tapMarker.visible) {
      this.tapT += dt;
      const s = 1 + Math.sin(this.tapT * 10) * 0.12;
      this.tapMarker.scale.set(s, s, s);
      if (!pl.path) this.tapMarker.visible = false;
    }
  }

  updateInteract(dt) {
    const pl = this.player;
    let best = null, bestD = Infinity;
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) {
        it.inside = false;
        continue;
      }
      const d = Math.hypot(it.pos.x - pl.pos.x, it.pos.z - pl.pos.z);
      const inside = d < it.range;
      if (it.auto) {
        if (inside && !it.inside && !pl.locked) {
          it.inside = true;
          this.activate(it);
        } else if (!inside && d > it.range + 0.6) it.inside = false;
        if (it.auto === 'only') continue;
      } else it.inside = inside;
      if (inside && d < bestD && !it.hidden) {
        best = it;
        bestD = d;
      }
    }
    if (pl.locked) best = null;
    this.hud.setAction(best);
    if (best && !best.noRing) {
      this.ring.visible = true;
      const r = best.ringR ?? 0.9;
      this.ring.position.set(best.pos.x, this.terrain.heightAt(best.pos.x, best.pos.z) + 0.05, best.pos.z);
      const s = r * (1 + Math.sin(this.time * 6) * 0.06);
      this.ring.scale.set(s, s, s);
      this.ring.rotation.z += dt;
    } else this.ring.visible = false;
  }

  updateZone(dt) {
    this.zoneCheckT -= dt;
    if (this.zoneCheckT > 0) return;
    this.zoneCheckT = 0.25;
    const pl = this.player;
    const z = zoneAt(pl.pos.x, pl.pos.z);
    if (z && z !== this.zone && this.zoneUnlocked(z)) {
      const prev = this.zone;
      this.zone = z;
      const vis = state.p.arena.visited;
      const isNew = !vis[z.id];
      if (isNew) {
        vis[z.id] = Date.now();
        state.save();
      }
      if (prev || isNew) {
        this.hud.showZone(z, isNew && !!prev);
        if (isNew && prev) {
          audio.play('levelUp', { vol: 0.6 });
          fx.confetti(_v.set(pl.pos.x, 1.5, pl.pos.z), { count: 30 });
        }
      }
    }
    // music
    let track = this.zone?.music ?? 'map';
    if (inRect(pl.pos.x, pl.pos.z, MART_STORE, -0.5)) track = 'grocery';
    if (track !== this.track) {
      this.track = track;
      audio.music(track);
    }
  }

  updateCamera(dt, snap = false) {
    const pl = this.player;
    const sp = clamp(pl.speed / RUN, 0, 1);
    let tx = pl.pos.x + pl.vel.x * 0.22, tz = pl.pos.z + pl.vel.z * 0.22;
    let ty = Math.max(0, pl.pos.y);
    if (this.talkFocus) {
      tx = (tx + this.talkFocus.pos.x) / 2;
      tz = (tz + this.talkFocus.pos.z) / 2 + 0.6;
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 5);
    this.camTarget.x += (tx - this.camTarget.x) * k;
    this.camTarget.y += (ty - this.camTarget.y) * k;
    this.camTarget.z += (tz - this.camTarget.z) * k;
    const zoomT = this.talkFocus ? 0.62 : 1 + sp * sp * 0.13;
    this.zoom = snap ? zoomT : damp(this.zoom, zoomT, 2.5, dt);
    const d = this.camDist * this.zoom;
    const cam = this.camera;
    cam.position.set(this.camTarget.x, this.camTarget.y + Math.sin(PITCH) * d, this.camTarget.z + Math.cos(PITCH) * d);
    cam.lookAt(this.camTarget.x, this.camTarget.y + 0.9, this.camTarget.z);
    // shadow camera follows the view centre (snapped to texels to avoid shimmer)
    const sun = this.lights.sun;
    const ext = 25;
    const texel = (ext * 2) / 1024;
    const cx = Math.round(this.camTarget.x / texel) * texel;
    const cz = Math.round((this.camTarget.z - 5) / texel) * texel;
    sun.target.position.set(cx, 0, cz);
    sun.position.set(cx + this.sunDir.x, this.sunDir.y, cz + this.sunDir.z);
    sun.target.updateMatrixWorld();
  }
}
