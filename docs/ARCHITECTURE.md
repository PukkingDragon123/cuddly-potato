# MrBeast Swarmers - Architecture

Vanilla JS (ES modules) + Three.js, bundled by Vite. No framework. All art is generated in code: voxel models
(`VoxGrid`), pixel-art faces/icons/UI skins drawn on tiny canvases, procedural audio.

```
src/
  main.js              boot, fonts, settings, route by URL (?scene=, ?dev=)
  core/
    engine.js          renderer + EffectComposer (bloom, output), quality presets, loop, current scene, shake,
                       hitstop, raycast / rayToZPlane / toScreen, renderThumb (3D -> data URL), addLights
    voxel.js           VoxGrid (sparse grid, per-voxel AO, glow voxels, build), Mats (toy plastic, glow HDR), variants
    chibi.js, face.js  chibi characters (Jimmy, Nolan, Juan, NPCs) with pixel faces and pose animations
    particles.js       instanced particles + fx presets (burst, shatter, cash, foam, slime, confetti, shockwave...)
    audio.js           procedural SFX (audio.play) + music tracks (audio.music) + jingles
    tween.js, util.js  animation helpers, rng, colour + math helpers
  data/                pure data: swarms, spells, cards (unified catalogue), commanders, vials, arenas (+ trophy
                       road, bosses, quests, secrets, ghost opponents), labs (base, POWER, BASE_UPGRADES tiers,
                       MEGA tuning), megas (MEGA-TECH Mutator ultimates), season
  game/
    state.js           profile v2 persistence + every economy operation (cards, decks, vials, trophies, pass...)
    game.js            scene router: game.go('title' | 'lab' | 'home' | 'battle' | 'vialopen' | dev scenes, params)
    battle/
      field.js         lane geometry shared by sim, view and arenas
      sim.js           deterministic battle logic (Battle Cats lineup: up to 10 slots with recharge, troops
                       spawn at the base; one base per side, POWER, base tiers, MEGA ultimate with a frozen
                       cinematic window), events
      ai.js            opponent AI (reads its hand, defends, builds pushes, spells, base upgrades, MEGA)
      netsync.js       friend battles: HostSync streams state, RemoteSim mirrors it for the guest
      loadout.js       the player's battle side config from the profile
      view.js          3D battle presentation (arena, bases + tier swaps, units, plates, projectiles, spells, camera)
      megaCutscene.js  MEGA breakout cutscene (containment vessel, camera shots, overlay) + Mega special fx
      commandFx.js     Commander electric MEGA charge-up (voxel lightning, halo, label) + base upgrade sign
      voxfx.js         voxel effect meshes (laser beam, goo puddle, shield dome)
      hud.js           battle HUD (base HP banners, timer, minimap, 10-slot lineup with recharge wipes, POWER
                       counter + cells, Commander, base level + MEGA buttons, emotes, VS intro); lineup.css
      result.js        victory / defeat / draw screen with base HP and rewards
  net/p2p.js           WebRTC data channel with copy/paste "battle code" signalling (no server)
  models/
    kit.js             high-res toy modelling kit (blob, rbox, cyl, capsule, pixel-art stamping, joints)
    swarmRig.js        part-driven procedural animation + toy finishes (gloss, metal, translucent, glow)
    swarmModels.js     createSwarm(id, {variant, skin, scale, model}) registry; models in swarms/*.js by series
    arenas/            battle arenas + Beast Island zone dioramas (kit.js ArenaKit + sky/animation/scenery
                       helpers, wildsKit.js; one module per arena, 15 arenas)
    island/            Beast Island world: terrain (chunked), water, sky, props, makeBeastIsland() - 15 zones
                       incl. the northern region and the floating space station
    props/             base tiers tent -> Mega HQ (base.js), MEGA containment vessel (containment.js), legacy Lab
                       buildings (lab.js), vials (vials.js), lab interior + misc props
  scenes/
    title.js           title stage (TAP TO PLAY -> the Lab for new players, home for everyone else)
    lab.js             the Beast Lab: first-time flow (Jimmy, your name, first pack -> tutorial battle ->
                       MEGA tube -> Beast Island) and later visits
    home.js            Beast Island home lobby (top bar, vial slots, battle, nav tabs, unlock cinematic)
    battle.js          battle scene: modes (tutorial/ranked/practice/boss/friend), input, tutorial, finish
    vialOpen.js        vial opening + card reveal
  ui/
    ui.css, ui.js      pixel UI kit: h(), button(), icon(), panel(), ribbon(), pill(), bar(), modal(), toast(),
                       say() dialogue, speech(), floatText(), pointAt(), sparkle(), rollNumber()
    skin.js, icons.js  procedural 9-slice pixel frame skins (sk-*, glass tanks, plates, pods, ensureSkin tints),
                       pixel textures as CSS vars, 16/24 px pixel icons
    cards.js           cardEl(): the card component (rarity frame, cost, level, copies progress)
    thumbs.js          cached 3D thumbnails: swarmThumb, charPortrait, spell art, arenaThumb (diorama snapshots),
                       labSkinThumb; lazy queue renders on-screen images first
    home/*.js          home tabs (shop, cards/deck, lab/commanders, pass) and modals (card info, trophy road,
                       profile, settings, friend battle, boss)
  dev/                 modelLab, arenaView, islandView, uiBench, screenBench, seed
```

## Conventions

* World units: battle lane along X (your base at x = -12, rival at +12). Swarms are modelled at
  0.05 units per voxel, face **+Z**, y = 0 is the ground.
* Colours are `0xRRGGBB` ints. Glow voxels (`grid.set(x, y, z, color, true)`) render unlit at 2.6x HDR and are the
  only thing that blooms (bloom selects by brightest channel, threshold 1.75) - keep them to small accents.
* Scenes: class with `scene`, `camera`, `enter(params)`, `exit()`, `update(dt, gdt)`, `resize(w, h)`, optional
  `bloom`. `dt` is real time, `gdt` is game time (slowed by hitstop / timeScale).
* DOM layers: `#ui` (scene UI), `#overlay` (modals, dialogue, toasts), `#world-ui` (world-anchored text and plates).
  `clearUI()` runs on every scene change. Layout unit `--u`, pixel size `--px`; `body.portrait|landscape`.
* Never touch `localStorage` directly - use `state.p` + `state.save()` / `state.emit()`.
* Battle sim is pure logic with a fixed 30 Hz step and its own seeded RNG; the view only reads it and consumes
  `sim.drainEvents()`.

## Swarm model format (swarmRig.js)

```js
{ gait: 'walk'|'hop'|'roll'|'slide'|'float', finish?: 'toy'|'gloss'|'metal'|'translucent'|'glow',
  parts: [{ name, grid: VoxGrid, at:[x,y,z] /*voxels*/, pivot:[px,py,pz], parent:'body'?, rot:[rx,ry,rz]? }],
  muzzle: [x,y,z] }
```
Part names drive animation: `body head jaw lid tail armL armR legL legR legFL legFR legBL legBR wheel* spin prop
flag antenna* cannon wingL wingR`. `SwarmRig` API: `setState('idle'|'walk'|'stun'|'dance')`, `attack(dur)`,
`flash()`, `boing()`, `update(dt)`, `muzzleWorld()`, `meshes`, `height`.

## Arena module format (models/arenas/*.js)

`buildBattle(K, opts) -> { sky, fog, lights, dust, bloom? }` adds scenery to `K.root` around the lane;
`buildZone(K, opts) -> { focus, radius }` builds the Beast Island diorama and sets `K.hotspots` (`npc`, `boss`,
secret ids). Keep anything taller than ~0.5 out of z in [0.6, 6] so units stay visible.
