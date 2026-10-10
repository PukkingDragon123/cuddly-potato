# MrBeast Swarmers

**An unofficial fan-made voxel + pixel-art mobile PvP strategy game**, inspired by the MrBeast Lab Swarms toy line and
Battle Cats-style lane battles. Not affiliated with MrBeast, Beast Industries or Moose Toys. Every model, face,
icon, sound and song is generated in code: no external art or audio assets.

Built with **Three.js** and **Vite** in plain JavaScript. It runs in any modern browser, phone or desktop (landscape
recommended on phones).

## Play it

```bash
npm install
npm run dev        # http://localhost:5173  (add --host to test on your phone over Wi-Fi)
npm run build      # static build in dist/  (deploy to GitHub Pages, Netlify, itch.io, ...)
npm run preview    # serve the production build
```

The build is fully static (relative `base`), so the `dist/` folder can be uploaded anywhere.

## What's in the game

**Beast Lab (hub + tutorial)**
- A futuristic voxel lab with a huge bubbling tank holding the **Beast Tiger**. Don't tap the glass (or do, ten times).
- **Jimmy**, a chibi block-head in a Beast Lab coat, runs an interactive tutorial with expressive pixel faces.
- **Real-toy-style vials**: grab the vial, **shake it** (drag back and forth, or use the arrow keys) until the bubbles
  and foam build up, then **POP** it. The cap flies off, foam erupts and the creature bursts out.
- The first vial guarantees Beast Coins, the **Panther** and the **Food Throw** spell. Jimmy also gifts a Clogged Toilet.

**Battles (side-view PvP lane)**
- Both sides have a Lab and regenerating energy. Spend it on troops, or **tap your Lab to upgrade it** for faster
  energy and a bigger tank.
- Swarms walk forward and fight automatically: melee, ranged, tanks, kamikazes, flyers, area attacks, knockbacks,
  stun/freeze/slow/burn, chain lightning, splitting slimes and more.
- **Spells** are aimed on the battlefield. *Food Throw* heals your troops and makes them bigger with more HP for a
  while. *$100K Drop* slams a giant money bag down with knockback. *Slime Flood*, *Freeze Ray*, *Soda Rocket* and
  *Lab Shield* are also in the game.
- **Commanders** physically sit on your Lab and react to the fight. Each has a charged signature ability and
  unlockable skills, and they fly, kick and dance across the field.
- The first battle is against Jimmy's crazy **Mansion Lab**. Beating him earns a **money-filled briefcase** (cash
  explosion) that unlocks *$100K Drop*, plus a **Home Horrors vial** whose skip price Jimmy flicks down to 0.

**Arena (explorable 3D voxel map)**
- Walk your chibi around (tap to move, drag for a virtual joystick, or WASD; `E` interact, `Q` dance, `M` map)
  through the Trophy Road zones: Beast Lab Yard, Suburb of Horrors, Jimmy's Mansion, Techno Tower, Atomic Reactor
  and the Chocolate Factory. Zones unlock with Trophies.
- Challenge ranked opponents at the Ranked Gate, fight bosses behind skull gates (King Clog, Jimmy Rematch,
  Cart Kong, Mega Mech Prime, Beast Tiger Unleashed), and meet NPCs like **Nolan** (quest chain that unlocks him
  as a Commander), **Juan**, and Lab techs, cashiers and super fans.
- **Beast Mart**, the Season 1 grocery store, has aisles of shelves, checkout lanes, a produce stand and pushable
  shopping carts with physics. Smash them, knock products flying, or return one to the corral.
- Secrets: the Golden Chocolate Bar, Nolan's lost phone, a giant Subscribe button, a hidden golden Panther statue,
  and (back in the Lab) Jimmy's coffee mug and the Tiger's tank.

**Collection and progression**
- 30 collectable Swarms plus a Mega Form, across the Beast Originals, Home Horrors, Techno Terrors, Atomic,
  Lab Hybrids and Food Fighters series. Rarities run Common, Rare, Ultra Rare, Legendary and Limited, with **Silver, Gold and Chrome shiny
  variants**.
- Beast Coins and duplicate copies upgrade troops. Beast Bucks are the premium currency (earned in game only: no
  real-money purchases).
- Vial types with unlock timers, a vial slot bar, a daily rotating shop, Trophy Road rewards, and deck slots that
  unlock with trophies.
- Commander levels, unique skills, **rollable perks** (tiered random stats) and outfits.
- **Season 1: FOOD SEASON battle pass**: earn **Calories** from battles and daily challenges to unlock food troops,
  Juan, swarm/Lab skins, Commander outfits, and static and animated banners.
- **Mega Forms**: transform the Panther into the gigantic chocolate-and-wrapper **Feastables Panther** in a Lab
  cutscene.

## Controls

| Action | Touch | Keyboard / mouse |
|---|---|---|
| Deploy troop | tap card | `1`-`6` |
| Upgrade Lab | tap Lab or the LAB button | `U` |
| Cast spell | tap spell, then tap the battlefield | `Q`/`W`/`E`, then click |
| Commander signature / skills | tap portrait / small buttons | `Space` / `Z`, `X` |
| Pan / zoom battle camera | drag / pinch | drag / mouse wheel |
| Shake a vial | hold and drag back and forth | arrow keys |

## Real players: Friend Battles (peer-to-peer)

**Friend Battle** (hub button, or *Friend* on the Arena's Ranked Gate) lets two real players fight each other
directly over WebRTC, with no account or game server:

1. One player taps **HOST A BATTLE** and sends the battle code (Copy, or Share to any chat app).
2. The friend taps **JOIN A BATTLE**, pastes it, and sends back the reply code.
3. The host pastes the reply and the battle starts. Each player sees their own Lab on the left.

The host's device runs the authoritative simulation and streams state to the guest about 15 times a second.
The guest's taps are sent back as inputs. A public STUN server is used only so the two devices can find each
other. A few very strict networks (some corporate or carrier NATs) block direct connections; those would need a
TURN relay, which isn't included.

**Ranked** matches (for Trophies) are against **Ghost Players**: AI-controlled rivals with generated names,
decks and trophy counts, matched to your Trophies. The game labels them "Ghost Player (AI)", because there is no
matchmaking server.

## Developer URLs

- `?dev=reset` wipes the save (it is stored in `localStorage`).
- `?seed=all` gives a fully populated profile for testing (all Swarms, spells, Commanders, trophies).
- `?scene=battle&mode=practice` (or `ranked`, `boss&bossId=cartKong`), `?scene=arena`, `?scene=lab` jump to a scene.
- `?dev=models[&id=panther,feastablesPanther][&variant=chrome]`, `?dev=props`, `?dev=chars` open model viewers.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the code layout.
