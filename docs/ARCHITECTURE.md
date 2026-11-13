# MrBeast Swarmers - Architecture

Vanilla JS (ES modules) + Three.js, bundled by Vite. No framework. All art is generated in code: voxel models
(`VoxGrid`), pixel-art faces/icons/UI skins drawn on tiny canvases. Audio is CC0 recordings (src/assets/sfx/).

```
src/
  main.js              boot, fonts, settings, route by URL (?scene=, ?dev=)
  core/
    engine.js          renderer + EffectComposer (bloom, output), quality presets, loop, current scene, shake,
                       hitstop, raycast / rayToZPlane / toScreen, renderThumb (3D -> data URL; renderThumbAsync -> blob URL),
                       addLights; adaptive quality governor (shadow refresh, then resolution; ?gov=0 off), shader
                       precompile on scene change, frees the old scene's GPU buffers / shadow maps, engine.cover() for
                       opaque UI (skips drawing the 3D), engine.setBackdrop() for a small scene drawn instead while
                       covered (the shop bunker, the pass), on the same renderer
    voxel.js           VoxGrid (sparse grid, per-voxel AO, glow voxels, build), Mats (toy plastic, glow HDR), variants
    chibi.js, face.js  chibi characters (Jimmy, Nolan, Juan, NPCs) with pixel faces and pose animations
    particles.js       instanced particles + fx presets (burst, shatter, cash, foam, slime, confetti, shockwave...)
    staticBatch.js     batchStatic(root): merges still meshes / small instanced props into one draw per grid cell +
                       material (Beast Island); watches every node and hands anything that changes back to normal rendering
    perfHud.js         ?dev=perf overlay (fps, frame ms, draw calls, tris, GPU memory counts, governor level)
    audio.js           recorded SFX (audio.play, src/assets/sfx/<id>-<n>.ogg|mp3, lazy-decoded after the first tap,
                       synthesized fallback) + music loops (audio.music) + jingles; CREDITS.md lists every source
    tween.js, util.js  animation helpers, rng, colour + math helpers
  data/                pure data: swarms, spells, cards (unified catalogue), commanders, vials, arenas (+ trophy
                       road, bosses, quests, secrets, ghost opponents), labs (base, POWER, BASE_UPGRADES tiers,
                       MEGA tuning), megas (MEGA-TECH Mutator ultimates), season, entrances (battle ENTRANCES: 14 walk-ins, prices / sources, ghost picks),
                       research (the Lab's research tree: 9 branches / 51 nodes, coin + time costs, rank gates,
                       researchMods() -> the battle sim's side.rs, researchForTrophies() for AI rivals),
                       profileItems (profile pictures / frames / titles / troop banners, how to get each, ownership,
                       Lonan's daily PROFILE GEAR, ghostLook() for rivals), mastery (Troop Mastery: 5 levels per
                       troop, tasks, rewards, recordMastery() fed by battleRewards with per-card battle counts)
  game/
    state.js           profile v2 persistence + every economy operation (cards, decks, vials, trophies, pass...)
    progression.js     progressive unlocks (featureUnlocked / onFeatureUnlock / lockInfo: tabs open after wins,
                       ULT + base upgrades in battle), guided-tutorial + battle-lesson bookkeeping, the MAIN QUEST line
    game.js            scene router: game.go('title' | 'lab' | 'home' | 'battle' | 'vialopen' | dev scenes, params)
    battle/
      field.js         lane geometry shared by sim, view and arenas
      sim.js           deterministic battle logic (Clash Royale card cycle: 8-card deck, hand of 4 + NEXT,
                       SPECIAL card tricks: draw / discard / echo / copy / exhaust; troops spawn at the base; one base per side, POWER, base tiers, MEGA ultimate with a frozen
                       cinematic window), events
      ai.js            opponent AI (reads its hand, defends, builds pushes, spells, base upgrades, MEGA)
      netsync.js       friend battles: HostSync streams state, RemoteSim mirrors it for the guest
      loadout.js       the player's battle side config from the profile
      labMods.js       LAB MODULES in the sim (side.lm): Tesla / Goo / Laser / Acid weapons, Repair Drone, Snack
                       Dispenser, Cloning Vat, Hamster Dynamo regen, Reactor meltdown ('modFire' events); modFx.js =
                       the module models on each base + their battle effects
      view.js          3D battle presentation (arena, bases + tier swaps, units, plates, projectiles, spells, camera)
      megaCutscene.js  MEGA breakout cutscene (containment vessel, camera shots, overlay) + Mega special fx
      commandFx.js     Commander electric MEGA charge-up (voxel lightning, energy helix, label)
      voxfx.js         voxel effect meshes (laser beam, goo puddle, shield dome) + ring-free impacts
                       (groundHit / groundImpact: flash, sparks, debris, dust; battles never use fx.shockwave)
      liveChibi.js     a live 3D Commander rendered into a HUD button canvas (ULT) via the thumb renderer
      sigCutscene.js   Commander ULTIMATE cutscene: freezes the world, hero shot (no captions), follows the ability, payoff
      sigFx.js         ULTIMATE payoffs + lingering effects (mutants, buyout swaps, meteor crater, amber time-stop)
      entranceCine.js  battle ENTRANCES after the VS intro: the rival's short walk-in, then yours (multi-shot camera,
                       signature poses, voiced line, title card with rank medal + banner, hop onto the base); tap to
                       skip; plays on any stage (the battle view, or the shop's preview: entrancePreview.js)
      entranceSets.js  one set piece per entrance (props, pixel FX, camera shots, poses); entranceProps.js = voxel props
      placement.js     Clash Royale card placement previews: deploy-zone floor grid + hazard-tape front line,
                       red dithered out-of-bounds veil, hologram ghost of the troop formation, drop pin,
                       waiting-for-POWER marker, edge-pan arrows (placement.css); the rule is sim.deployRange
      hud.js           battle HUD (top: one tug-of-war base-HP bar with clock, lean chip + lane strip;
                       Battle Cats dock: BASE upgrade button
                       with a 3D next-tier model, POWER wallet, hand + NEXT card with card-use animations,
                       live 3D Commander ULT + MEGA buttons with cut-ins, Beast-emblem emotes the Commander acts out
                       with a wind-up bar, squash / overshoot press tweens on every button); lineup.css
      baseFall.js      final blow + base explosion (no captions or stamps): slow-mo pre-roll when the next hit is lethal (low camera tracks
                       the shot), impact freeze, glowing voxel crack seams, the base cut into big voxel chunks
                       (pooled, capped), pixel fire / smoke / dust wave, the Commander launched off the roof;
                       snapshots for the news replay (view.replay); tap to skip
      endCine.js       VICTORY / DEFEAT / DRAW cinematic in the arena (poses, money throw, pixel fireworks +
                       confetti, voxel rain cloud, title, voiced line in a speech bubble); tap to skip
      result.js        BEAST NEWS report: TV static, BREAKING NEWS sting, lower third, Nora's voiced lines,
                       replay box, base HP, numbers + MVP, payout (trophies, rewards, level ups, mastery), ticker;
                       each segment skips with a tap. newsStudio.js = its 3D studio (engine.setBackdrop)
  net/p2p.js           WebRTC data channel with copy/paste "battle code" signalling (no server)
  models/
    kit.js             high-res toy modelling kit (blob, rbox, cyl, capsule, pixel-art stamping, joints)
    swarmRig.js        part-driven procedural animation + toy finishes (gloss, metal, translucent, glow)
    swarmMoves.js      creature moves layered on the rig (claw, bite, chomp, headbutt, tailwhip, stomp, smash,
                       punch, dive, shoot, spit, spin, pulse, roar, grab, yank, beam, surface, thrash, land) and
                       held states (crouch, air, pinning, pinned, grabbed, lifted, charge); SWARMS[id].anim picks them
    swarmModels.js     createSwarm(id, {variant, skin, scale, model}) registry; models in swarms/*.js by series
    arenas/            battle arenas + Beast Island zone dioramas (kit.js ArenaKit + sky/animation/scenery
                       helpers, hdpaint.js HD painted skies / far layers / clouds (never hard pixel art),
                       wildsKit.js; one module per arena, 15 arenas)
    island/            Beast Island world: terrain (chunked), water, sky, props, makeBeastIsland() - 15 zones
                       incl. the northern region and the floating space station, laid out in design units x SC
                       (terrain.js; coves, flats, forests, meadows, the glacier falls); trophyPath.js builds the
                       TROPHY_ROAD into it like a treasure map (wood / iron / gold / legendary chests on red-X
                       sand daises with stake signs, a glint shine + pixel light beam when claimable, a red
                       dashed trail ahead / footprints behind, map signposts, a coin spill, floating reward
                       billboards, arena gates with a camera-facing trophy sign, a road boss barricade in front
                       of every gate, the fork trails with their signs + barricades, the orbit road);
                       town.js = Beast Town (cottages, shops, fountain, stalls) + roadside fences / barrels /
                       benches; fun.js = grids for the tappable things (hives, bees, palms, crabs, the X...)
    props/             base tiers Camp Lab -> Mega HQ (base.js: lab-gear brushes, dressBox), MEGA containment vessel (containment.js), legacy Lab
                       buildings (lab.js), vials (vials.js), lab interior + misc props
  scenes/
    title.js           title: movie title sequence over the frozen battle (UI instantly, 3D fades up when built;
                       TAP TO START -> the Lab for new players, home for everyone else); captures loading stills
    loading.js         cinematic loading screen for heavy scene changes (game.go: battle / home / lab): Ken Burns
                       stills of the frozen battle, logo, destination, bar, tips; cinematic.css (shared film look)
    lab.js             the Beast Lab: first-time flow (Jimmy, your name, first pack -> tutorial battle ->
                       MEGA tube -> Beast Island) and later visits
    home.js            Beast Island home lobby (top bar, vial slots, battle, nav tabs, unlock cinematic); spring
                       motion (press / release / hover, staggered entrances, tab carousel) in homeMotion.js;
                       islandFun.js = the island's tappable fun (bee swarm, coconuts, fishing pier, treasure X,
                       geyser, cave, lighthouse, seagull, townsfolk; daily coin treats in game/islandFun.js);
                       homeExplore.js = drag / pinch free look over the island with a BACK button;
                       homeRoad.js = Trophy Road mode (camera flies onto the island road, drag / inertia pan,
                       tap a chest, CLAIM walks your Commander to it to kick it open, pick a trail at each fork,
                       a road boss swarm guards every gate) + the YOU marker; afterBattle() = back from a win
                       your Commander walks the road from the old trophy count to the new one opening chests
                       (or watches a beaten road boss fall); its HUD is mountIslandRoad() in home/trophyRoad.js;
                       fork data in data/roadForks.js, picks + bonus chests in game/roadForks.js
                       (state.p.roadForks); road bosses in data/roadBosses.js (state.p.roadBoss: wins, losses,
                       falls seen, banked trophies; addTrophies caps at an unbeaten checkpoint)
    frozenBattle.js    title / loading cinematic: a time-stopped lane fight in an arena (real arena/bases/
                       Commanders/Swarms, suspended fx snapshot, live arcs/glows/streaks), scripted camera shots
    battle.js          battle scene: modes (tutorial/ranked/practice/boss/friend), input, tutorial, finish
    vialOpen.js        vial opening: pour (drag / tilt) + shake (DeviceMotion / swipe) with shake upgrades, card reveal
    vialGestures.js    phone shake + tilt input (iOS permission) with swipe / keyboard fallbacks
    newCardCutscene.js NEW CARD cutscene: reveal by rarity (data/entrances.js cardReveal), bottle pop, pose, stats panel
  ui/
    guide.js           progression UI: locked tabs / buttons BLACKED OUT (dark silhouette + padlock, tap = what opens
                       it), unlock reveals (spotlight, padlock snaps, silhouette floods back to colour, voiced line),
                       guided first-session steps (pointing hand, skippable), the main quest tracker note (opens the
                       QUEST BOARD), battle locks + lessons
    fonts.css          Swarm Text (hand-made, tools/pixelfont/build.py): Swarm Display = Bold, Swarm Body = Regular
                       (+ Bold for 600+); font sizes round() to --fq so pixels stay whole; cinematics skip icon (.px-skip)
    ui.css, ui.js      pixel UI kit: h(), button(), icon(), panel(), ribbon(), pill(), bar(), modal(), toast(),
                       say() dialogue, speech(), floatText(), pointAt(), sparkle(), rollNumber()
    skin.js, icons.js  procedural 9-slice pixel frame skins (sk-*, glass tanks, plates, pods, ensureSkin tints),
                       pixel textures as CSS vars, 16/24 px pixel icons
    cards.js           cardEl(): the card component (rarity frame, cost, level, copies progress)
    avatar.js          profile avatars: avatarEl(picture, frame) everywhere a player shows up; pictures composited
                       once per size bucket (pixel plate + 3D chibi head / troop render; "Me" = your Commander), frames
                       painted on the icon shader at the laid-out size; animated frames = masked shine or a
                       stepped sprite strip (no per-frame redraws)
    thumbs.js          cached 3D thumbnails: swarmThumb, charPortrait, spell art, arenaThumb (diorama snapshots),
                       labSkinThumb, baseSpin/baseThumb (battle base tiers); lazy queue renders on-screen images first
    home/*.js          home tabs (shop, cards/deck, lab/commanders, pass) and modals (card info, trophy road,
                       profile, settings, friend battle, boss); profile.js = player card + CUSTOMIZE tabs,
                       masteryUI.js = Troop Mastery panel / collection crest / claim, profileShop.js = PROFILE GEAR shelf
    home/questBoard.js QUEST BOARD: cork board of pinned notes, tabs STORY (chapter clipboard, current + next quest, done
                       pile, TOP SECRET folder) / DAILY (season challenges) / CREW (crew quest chains + Jimmy's
                       rematch); pictures over text: each quest has an illustration, objective = icon + tally/count,
                       rewards = icons + amounts; polaroid tap = voiced line in a speech bubble; stamps, claim slam +
                       reward fly-in; questBoardArt.js paints everything procedurally at 1 CSS px per texel, sized to
                       the layout and cached (lab wall + lamp + shelf, walnut frame + tray, cork, lamp light, each
                       note's paper, quest illustrations, pins, tape, stains, doodles, red string)
    home/lab.js        LAB tab: your base in a 3D lab yard (labYard.js + labYardProps.js, engine.setBackdrop) with your
                       modules and Commander; segments LAB / MODULES / SKINS / COMMANDER; module data src/data/labModules.js
                       (4 slots x 4 modules, 5 levels, unlocks, AI loadouts), profile ops src/game/labGear.js,
                       models src/models/props/labModules.js
    home/research.js   the RESEARCH TREE (mountResearchTree, mounted by the Lab tab): pan / zoom pipe tree,
                       node sheet, lab bench timer + SPEED UP; researchArt.js = node icons, frames, chains,
                       junctions, the bubbling beaker; research state + timers live in game/state.js
    home/shop.js       SHOP tab: the secret bunker. bunker.js = the live voxel diorama drawn behind the tab with
                       engine.setBackdrop (Lonan, the shady seller, behind his counter: idle acting, coat flash,
                       parcel); bunkerProps.js = pure voxel builders, baked in bunkerWorker.js off the main thread;
                       shopArt.js = pixel-art skins (crates, steel plates, stamp, CRT, vault); shopTalk.js = his lines
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
`flash()`, `boing()`, `update(dt)`, `muzzleWorld()`, `meshes`, `height`. Battle actors set `rig.posed = true` and drive
`play(move, dur, side, amp, kind)` / `hold(state, k, side)` (swarmMoves.js), `ext` (hit flinch offsets) and
`gripWorld()` (the mouth point grabbed prey hangs from); the sim side of pounce / grab lives in troopTraits.js.

## Arena module format (models/arenas/*.js)

`buildBattle(K, opts) -> { sky, fog, lights, dust, bloom? }` adds scenery to `K.root` around the lane;
`buildZone(K, opts) -> { focus, radius }` builds the Beast Island diorama and sets `K.hotspots` (`npc`, `boss`,
secret ids). Keep anything taller than ~0.5 out of z in [0.6, 6] so units stay visible.
