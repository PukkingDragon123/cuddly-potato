# MrBeast Swarmers

**An unofficial fan-made mobile strategy game** in the spirit of Clash Royale, with Battle Cats-style side-view
lane battles, starring high-res voxel versions of the **MrBeast Lab Swarms** toys. Not affiliated with MrBeast,
Beast Industries or Moose Toys. Every model, face, icon, sound and song is generated in code: no external art or
audio assets.

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

**The loop (Clash Royale-style)**
- Battle in real time, earn **trophies**, win **vials** (the game's chests), open them for cards, upgrade your
  Swarms with copies + Beast Coins, build the best **8-card deck**, and climb **Beast Island**.
- **Beast Island** is the home screen: a living 3D voxel island. The trophy road winds from the beach up to the
  summit through nine arenas, each a diorama inspired by a real MrBeast video: *Beast Lab*, *Last To Leave Circle*,
  *Chocolate Factory*, *Beast Mart*, *Red Light Courtyard*, *Antarctica Outpost*, *Atomic Reactor*, *Lost Pyramid* and
  the legendary *Beast Island Paradise*. Reaching an arena's trophy gate plays an unlock cinematic and unlocks its cards.
- Each arena has a **boss challenge**, NPCs with quest chains (Nolan, Juan), hidden secrets, and your own deck's
  Swarms hanging out on it.
- **Vials** modelled on the real packaging (test tubes, Lab Packs, the Mega Lab, the Cash Case, Hyperchrome tubes)
  unlock on timers in 4 slots, plus a free vial every 4 hours and a daily Crown Case.

**Battles**
- Each side has a **Lab** (king tower, with your Commander sitting on the roof) and a **Panther Cannon** guard
  turret. Destroying the turret earns 1 crown; destroying the Lab wins with 3 crowns.
- **Energy** fills from 0 to 10 (2x in the last minute, 3x in overtime). Play cards from a hand of 4 (with the next
  card shown) by dragging them onto your half of the battlefield, tapping a card then the field, or double-tapping to
  drop at your Lab. Taking the enemy turret opens their side for deployment.
- Swarms drop in from shattering lab vials, then march and fight on their own: tanks, ranged, splash, flyers,
  kamikazes, knockback, stun/freeze/slow/burn, chain lightning, splitting slimes and bosses.
- **Spells** (Food Throw, $100K Drop, Slime Flood, Freeze Ray, Soda Rocket, Lab Shield) are cards too.
- **Commanders** (Recruit, Jimmy, Nolan, Juan) have a charged signature ability, unlockable skills and perks.
  **Overclock** your Lab mid-battle to make energy faster.
- 3:00 regulation, sudden-death overtime, then lowest-tower tiebreak. Emotes included.

**Collection**
- 40+ Swarms across the Beast Originals, Home Horrors, Techno Terrors, Atomic, Lab Hybrids and Snack Squad
  series, plus spells. Rarities: Common, Rare, Ultra Rare, Legendary, Limited. Shiny **Silver, Gold and Chrome**
  variants, skins and the Feastables Panther **Mega Form**.
- Lab Level (king level) from Lab XP, Commander levels, the Food Season pass, daily challenges, Trophy Road rewards
  and a daily shop. Beast Bucks are earned in game only (no real-money purchases).

## Controls

| Action | Touch | Keyboard / mouse |
|---|---|---|
| Play a card | drag it onto the field, or tap it then tap the field | `1`-`4` select, click the field |
| Quick-drop at your Lab | double-tap a card | `Space` / `Enter` with a card selected |
| Commander signature / skills | tap the portrait / skill buttons | `Q` / `W`, `E` |
| Overclock the Lab | OVERCLOCK button | `O` |
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
- `?scene=home` (add `&skipUnlock=1` to skip arena-unlock cinematics), `?scene=battle&mode=practice|ranked|boss&bossId=kingClog`.
- `?dev=modellab&id=panther,steelPanther[&variant=gold][&anim=attack]` model turntable,
  `?dev=arena&theme=factory[&zone=1]` arena viewer, `?dev=island[&zone=k|&overview=1]` Beast Island viewer,
  `?dev=ui` UI kit bench, `?dev=screens&screen=cards` menu screens, `?dev=vial&type=megaLab` vial opening.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code layout.
