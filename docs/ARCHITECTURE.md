# MrBeast Swarmers - Architecture

Vanilla JS (ES modules) + Three.js, bundled by Vite. No framework. All art is generated in code:
voxel models (`VoxGrid`) + pixel-art faces/icons drawn on tiny canvases.

```
src/
  main.js              boot, fonts, settings, route by URL (?scene=, ?dev=)
  core/
    engine.js          renderer, loop, current scene, shake, hitstop, raycast, toScreen, renderThumb, addLights
    voxel.js           VoxGrid (box/ellipsoid/cylinder/line/carve/paint/mirrorX/build), Mats, variant materials
    chibi.js           Chibi characters (block heads + PixelFace + pose animations)
    face.js            PixelFace (eyes/mouth expressions, blink, talk)
    particles.js       instanced particles + fx presets (burst, shatter, cash, foam, slime, confetti, ...)
    audio.js           procedural SFX (audio.play(name)) + music tracks (audio.music(name)) + jingles
    tween.js           animate / tween / wait / after (real-time)
    util.js            math, rng, easing, colour helpers, formatting
  data/                pure data: swarms, spells, commanders, vials, season, arena, labs, characters
  game/
    state.js           profile persistence + ALL economy operations (grant/upgrade/vials/pass/quests/shop)
    game.js            scene router: game.go('lab' | 'battle' | 'arena' | 'title', params)
    battle/            sim.js (logic), ai.js, view.js (3D), hud.js (DOM), loadout.js (player side config),
                       netsync.js (friend battles: HostSync streams state, RemoteSim mirrors it for the guest)
  net/
    p2p.js             WebRTC data channel with copy/paste "battle code" signalling (no server)
  models/
    helpers.js         modelling helpers (eyes, teeth, mouth, legs4, feet2, arms2, colours C)
    swarmRig.js        multi-part animated swarm model
    swarmModels.js     createSwarm(id, {variant, skin, scale}) + core models
    swarmModelsExtra.js remaining swarm models
    props.js           props & buildings (labs, grocery, environment, ability props)
  scenes/              title.js, lab.js (+ lab/: vial, openVial, reveal), battle.js,
                       arena.js (+ arena/: terrain, layout, zones/*, player, npc, carts, gates, quests, hud, modals)
  ui/
    ui.css, ui.js      pixel UI kit: h(), button(), icon(), modal(), toast(), say(), speech(), floatText(), pointAt()
    thumbs.js          swarmThumb(id, variant, skin), charPortrait(charId), objThumb(key, factory)
    hub.js             hub top bar + nav (mounted by the Lab scene)
    screens/*.js       collection, deck, commanders, mega, shop, pass, vials, trophy road, profile, settings, friend
  dev/preview.js       ?dev=models[&id=a,b] | ?dev=chars | ?dev=props[&id=...]
```

## Conventions

* World units: 1 voxel = `VOX` = 0.1 units. Chibi ~1.9 tall. Swarms ~0.8-2 tall.
* Models face **+Z**; y = 0 is the ground. In battle the player's side is on the left (−X) facing +X.
* Colours are `0xRRGGBB` ints (sRGB). Glow voxels: `grid.set(x,y,z,color,true)` (unlit, bright).
* Scenes: class with `scene` (THREE.Scene), `camera`, `enter(params)`, `exit()`, `update(dt, gdt)`, `resize(w,h)`.
  `dt` is real time, `gdt` is game time (slowed by hitstop / timeScale).
* DOM layers: `#ui` (scene UI), `#overlay` (modals/dialogue/toasts), `#world-ui` (world anchored text).
  `clearUI()` is called by the router on every scene change.
* Never use `localStorage` directly - use `state.p` + `state.save()`/`state.emit()`.
* Particles: `fx.*(position, opts)`; ground height via `opts.ground`.
* Sounds: `audio.play('pop')`, music `audio.music('battle')`, jingles `audio.jingle('victory')`.

## Swarm model format (swarmRig.js)

```js
{ gait: 'walk'|'hop'|'roll'|'slide'|'float',
  parts: [{ name, grid: VoxGrid, at:[x,y,z] /*voxels*/, pivot:[px,py,pz], parent:'body'?, rot:[rx,ry,rz]? }],
  muzzle: [x,y,z] }
```
Part names drive animation: `body head jaw lid tail armL armR legL legR legFL legFR legBL legBR wheel* spin prop flag antenna* cannon wingL wingR`.
`SwarmRig` API: `setState('idle'|'walk'|'stun'|'dance')`, `attack(dur)`, `flash()`, `boing()`, `update(dt)`, `muzzleWorld()`, `meshes`, `height`.
