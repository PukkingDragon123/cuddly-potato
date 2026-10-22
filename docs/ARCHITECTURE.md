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
                       MEGA tuning), megas (MEGA-TECH Mutator ultimates), season, entrances (NEW CARD cutscene cosmetics)
  game/
    state.js           profile v2 persistence + every economy operation (cards, decks, vials, trophies, pass...)
    game.js            scene router: game.go('title' | 'lab' | 'home' | 'battle' | 'vialopen' | dev scenes, params)
    battle/
      field.js         lane geometry shared by sim, view and arenas
      sim.js           deterministic battle logic (Clash Royale card cycle: 8-card deck, hand of 4 + NEXT,
                       SPECIAL card tricks: draw / discard / echo / copy / exhaust; troops spawn at the base; one base per side, POWER, base tiers, MEGA ultimate with a frozen
                       cinematic window), events
      ai.js            opponent AI (reads its hand, defends, builds pushes, spells, base upgrades, MEGA)
      netsync.js       friend battles: HostSync streams state, RemoteSim mirrors it for the guest
      loadout.js       the player's battle side config from the profile
      view.js          3D battle presentation (arena, bases + tier swaps, units, plates, projectiles, spells, camera)
      megaCutscene.js  MEGA breakout cutscene (containment vessel, camera shots, overlay) + Mega special fx
      commandFx.js     Commander electric MEGA charge-up (voxel lightning, energy helix, label)
      voxfx.js         voxel effect meshes (laser beam, goo puddle, shield dome) + ring-free impacts
                       (groundHit / groundImpact: flash, sparks, debris, dust; battles never use fx.shockwave)
      liveChibi.js     a live 3D Commander rendered into a HUD button canvas (ULT) via the thumb renderer
      hud.js           battle HUD (top: one tug-of-war base-HP bar with clock, lean chip + lane strip;
                       Battle Cats dock: BASE upgrade button
                       with a 3D next-tier model, POWER wallet, hand + NEXT card with card-use animations,
                       live 3D Commander ULT + MEGA buttons with cut-ins, Beast-emblem emotes the Commander acts out
                       with a wind-up bar, squash / overshoot press tweens on every button); lineup.css
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
    title.js           title: movie title sequence over the frozen battle (UI instantly, 3D fades up when built;
                       TAP TO START -> the Lab for new players, home for everyone else); captures loading stills
    loading.js         cinematic loading screen for heavy scene changes (game.go: battle / home / lab): Ken Burns
                       stills of the frozen battle, logo, destination, bar, tips; cinematic.css (shared film look)
    lab.js             the Beast Lab: first-time flow (Jimmy, your name, first pack -> tutorial battle ->
                       MEGA tube -> Beast Island) and later visits
    home.js            Beast Island home lobby (top bar, vial slots, battle, nav tabs, unlock cinematic); spring
                       motion (press / release / hover, staggered entrances, tab carousel) in homeMotion.js
    frozenBattle.js    title / loading cinematic: a time-stopped lane fight in an arena (real arena/bases/
                       Commanders/Swarms, suspended fx snapshot, live arcs/glows/streaks), scripted camera shots
    battle.js          battle scene: modes (tutorial/ranked/practice/boss/friend), input, tutorial, finish
    vialOpen.js        vial opening: pour (drag / tilt) + shake (DeviceMotion / swipe) with shake upgrades, card reveal
    vialGestures.js    phone shake + tilt input (iOS permission) with swipe / keyboard fallbacks
    newCardCutscene.js NEW CARD cutscene: entrance animation (data/entrances.js), bottle pop, pose, stats panel
  ui/
    ui.css, ui.js      pixel UI kit: h(), button(), icon(), panel(), ribbon(), pill(), bar(), modal(), toast(),
                       say() dialogue, speech(), floatText(), pointAt(), sparkle(), rollNumber()
    skin.js, icons.js  procedural 9-slice pixel frame skins (sk-*, glass tanks, plates, pods, ensureSkin tints),
                       pixel textures as CSS vars, 16/24 px pixel icons
    cards.js           cardEl(): the card component (rarity frame, cost, level, copies progress)
    thumbs.js          cached 3D thumbnails: swarmThumb, charPortrait, spell art, arenaThumb (diorama snapshots),
                       labSkinThumb, baseSpin/baseThumb (battle base tiers); lazy queue renders on-screen images first
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
  `bloom`, optional `shown()` (called by game.go once the loading screen / fade is gone). `dt` is real time, `gdt` is game time (slowed by hitstop / timeScale).
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
