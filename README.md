# MrBeast Swarmers

**An unofficial fan-made mobile strategy game** in the spirit of Clash Royale, with Battle Cats-style side-view
lane battles, starring high-res voxel versions of the **MrBeast Lab Swarms** toys. Not affiliated with MrBeast,
Beast Industries or Moose Toys. Every model, face and icon is generated in code: no external art. Sound effects
and music loops are CC0 recordings (Kenney + Freesound CC0, see `src/assets/sfx/CREDITS.md`).

Built with **Three.js** and **Vite** in plain JavaScript. Runs in any modern browser, on phones (portrait or
landscape) and desktop.

## Play it

```bash
npm install
npm run dev        # http://localhost:5173  (add --host to test on your phone over Wi-Fi)
npm run build      # static build in dist/  (deploy to GitHub Pages, Netlify, itch.io, ...)
npm run preview    # serve the production build
```

The build is fully static (relative `base`), so the `dist/` folder can be uploaded anywhere.

## The game

**Getting started**
- Your story starts inside the **Beast Lab**: Jimmy pops out from behind the Beast Tiger's tank, asks your name and
  hands you your **first pack** to open on the workbench. Then you battle Jimmy (an easy, guided first fight), and he
  shows you the MEGA containment tube before taking you out to Beast Island. Early ranked rivals are gentle too.

**The loop (Clash Royale-style)**
- Battle in real time, earn **trophies**, win **vials** (the game's chests), open them for cards, upgrade your
  Swarms with copies + Beast Coins, build the best **8-card deck**, and climb **Beast Island**.
- The title and loading screens are a movie title sequence over a **frozen battle**: a time-stopped cinematic lane fight in your arena (your deck vs. that arena's Swarms) with live VFX and slow camera moves. The home screen is **Beast Island**: a living 3D voxel island. The trophy road winds from the beach up to the
  summit and on across a huge northern region through fifteen arenas, each a diorama inspired by a MrBeast video:
  *Beast Lab*, *Last To Leave Circle*, *Chocolate Factory*, *Beast Mart*, *Red Light Courtyard*, *Antarctica Outpost*,
  *Atomic Reactor*, *Lost Pyramid*, *Beast Island Paradise*, *Lost Jungle Temple*, *Laser Maze Vault*, *Haunted
  Mansion*, *TeamSeas Reef*, *Volcano Forge* and the legendary *Zero-G Space Station* floating above the island on a
  space elevator. Reaching an arena's trophy gate plays an unlock cinematic and unlocks its cards.
- Each arena has a **boss challenge**, NPCs with quest chains (Nolan, Juan), hidden secrets, and your own deck's
  Swarms hanging out on it.
- **Vials** modelled on the real packaging (test tubes, Lab Packs, the Mega Lab, the Cash Case, Hyperchrome tubes)
  unlock on timers in 4 slots, plus a free vial every 4 hours. Opening one is hands-on: pour the water in (drag the jug
  or tilt your phone), then **shake your phone** (or swipe the vial back and forth): every strong shake has a chance to
  **upgrade** the vial a rarity tier (more cards, better guarantees). A card you find for the first time gets a cinematic
  **NEW CARD cutscene** with your equipped **entrance animation** (Superhero Landing, Lab Explosion, Red Carpet, Rocket
  Drop, Glitch Teleport: bought in the shop or earned on the Food Pass).

**Battles**
- Each side has one **base** with your Commander sitting on the roof. Smash the rival's base to win (no crowns,
  no guard towers).
- **Upgrade your base** with the big BASE button (it shows the next tier in 3D), or tap the base itself: it starts as a humble **Camp Lab** (a folding lab table under a pop-up canopy), then becomes a **Lab Shack**, **Trailer
  Lab**, **Field Lab**, **Beast Lab** and finally the **Mega HQ**. Every tier adds HP, a stronger zapper, faster POWER
  and a bigger POWER bar.
- **Clash Royale card cycle**: an 8-card deck cycles through a hand of 4 with a **NEXT** card. Tap a troop card and
  that Swarm pops out of your base and marches (or drag it onto your half); the played card goes to the back of the
  deck and the next one slides in. Cards cost electric **POWER** (2x in the last minute, 3x in overtime). Spells are
  aimed: tap the spell, then tap the field (or drag it).
- **SPECIAL cards** are card-game tricks (tap to play) that play with your hand: **Quick Draw** (DRAW 2, hand up to 6),
  **Energy Drink** (+3 POWER, EXHAUST = once per battle), **Coupon Book** (your hand costs 1 less), **Trash Compactor**
  (DISCARD your hand for +1 POWER each and draw a fresh one), **Double Up** (ECHO: the next troop deploys twice),
  **Copy Cat** (a temporary COPY of your last card) and **Golden Ticket** (draw your priciest card at 0 cost).
- You start with a 4-card deck (Panther, Clogged Toilet, Quick Draw, Energy Drink); more deck slots open with
  trophies (all 8 at 200) and the rest of the squad unlocks over your first wins on the Trophy Road.
- Swarms drop in from shattering lab vials, then march and fight on their own: tanks, ranged, splash, flyers,
  kamikazes, knockback, stun/freeze/slow/burn, chain lightning, splitting slimes and bosses.
- **Spells** (Food Throw, $100K Drop, Slime Flood, Freeze Ray, Soda Rocket, Lab Shield) are cards too.
- **Commanders** (Recruit, Jimmy, Nolan, Juan) have unlockable skills, perks and a game-changing **ULTIMATE**. It
  charges only from the POWER your side makes and from damage your base takes (a battered base charges it faster,
  ~90-120 s into a battle otherwise), and firing it stops the whole battle for a full cutscene: *Mutant Uprising*
  (your army mutates into giants + 3 free mutant squads), *Beast Buyout* (Jimmy buys the 3 strongest enemy troops),
  *Orbital Belly Flop* (Nolan rides a soda rocket into orbit and lands as a meteor: board wipe + burning crater) and
  *Tiempo Muerto* (time stops for the rival for 7 s, then their frozen troops shatter).
- **MEGA ultimate**: equip a **MEGA-TECH Mutator** figure (Panthar, Silver-Byte, NecroClaw, Cyber Glitch, plus rare
  Metallic Gold versions, won on the Trophy Road). Its charge only fills as you deal damage, it needs at least a
  Trailer Lab base, and you get one per battle. Your Commander crackles with more and more electric energy as it
  charges; **tap your Commander** to unleash it and the battle freezes for a cutscene: a giant containment
  vessel slams down, fills with water, the figure mutates to full size, cracks the glass and breaks out to rampage
  with its own special attack. Rivals can bring Megas too.
- 3:00 regulation, sudden-death overtime, then a base-HP tiebreak. Emotes included.

**Collection**
- 60+ Swarms across the Beast Originals, Home Horrors, Techno Terrors, Atomic, Lab Hybrids, Snack Squad, Mega-Tech,
  Fire & Ice, Battle Fusion, Wildlands, Spooky and Cosmic series, plus spells. Rarities: Common, Rare, Ultra Rare, Legendary, Limited. Shiny **Silver, Gold and Chrome**
  variants, skins and the Feastables Panther **Mega Form**.
- Lab Level (king level) from Lab XP, Commander levels, the 50-tier Food Season pass, daily challenges, Trophy Road rewards
  and a daily shop. Beast Bucks are earned in game only (no real-money purchases).

## Controls

| Action | Touch | Keyboard / mouse |
|---|---|---|
| Send a Swarm | tap its card (or drag it onto your half) | `1`-`6` |
| Play a SPECIAL card | tap it | number key |
| Cast a spell | tap it, then tap the field (or drag it) | number key, then click the field / `Space` |
| Commander ultimate / skills | tap the ULT button / skill buttons | `Q` / `W`, `E` |
| Upgrade your base | tap the BASE button (or your base) | `O` |
| Unleash the MEGA | tap your Commander (or the MEGA button) | `M` / `R` |
| Pan / zoom the battle camera | drag / pinch, tap the minimap | drag / mouse wheel, `A` `D` |
| Browse Beast Island | swipe or the arrows | arrows on screen |

## Friend Battles (peer-to-peer)

**Friend Battle** lets two real players fight directly over WebRTC, with no account or game server:

1. One player taps **HOST** and sends the battle code (Copy, or Share to any chat app).
2. The friend taps **JOIN**, pastes it, and sends back the reply code.
3. The host pastes the reply and the battle starts. Each player sees their own Lab on the left.

The host's device runs the authoritative simulation and streams state to the guest about 15 times a second.
Ranked battles are against **AI rivals** with generated names, decks and trophy counts matched to yours, because
there is no matchmaking server.

## Developer URLs

- `?dev=reset` wipes the save (stored in `localStorage`). `?seed=1|mid|all` gives a populated test profile.
- `?scene=home` (add `&skipUnlock=1` to skip arena-unlock cinematics), `?scene=battle&mode=practice|ranked|boss&bossId=kingClog`,
  `?scene=lab[&step=afterPack|won]` the Lab start scene.
- `?dev=modellab&id=panther,steelPanther[&variant=gold][&anim=attack]` model turntable,
  `?dev=arena&theme=factory[&zone=1]` arena viewer, `?dev=island[&zone=k|&overview=1]` Beast Island viewer,
  `?dev=ui` UI kit bench, `?dev=screens&screen=cards` menu screens, `?dev=vial&type=megaLab` vial opening.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code layout.
