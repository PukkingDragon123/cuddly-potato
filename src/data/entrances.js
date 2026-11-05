// Battle ENTRANCES: the walk-in your Commander makes at the start of every battle
// (src/game/battle/entranceCine.js runs it, entranceSets.js holds each set piece).
// After the VS slam each Commander arrives on the battlefield in their equipped
// entrance: a set piece with its own camera shots, a signature pose, a short voiced
// line and a title card (name, rank medal, banner), then they hop onto their base.
//
// Where they come from:
//   free: true      everybody has it (the default)
//   price           sold in the shop for Beast Bucks
//   pass: true      a Food Pass reward (granted as { type: 'entrance', id })
//   trophies        claimed free in the shop once you reach that many trophies
// `line` is what the Commander says (voiced), `ghost` is the trophy count a ghost
// rival needs before it uses this entrance, `pose` the signature pose names the
// cinematic plays (custom poses live in entranceSets.js).
export const ENTRANCES = {
  strut: {
    name: 'Classic Strut', icon: 'swarm', color: '#29b6f6', free: true, ghost: 0,
    desc: 'Walks out under the spotlights like the base already belongs to them.',
    line: "Relax. I'm here now.",
  },
  boxSneak: {
    name: 'Cardboard Box Sneak', icon: 'eye', color: '#d8a868', price: 200, ghost: 0,
    desc: 'A cardboard box shuffles onto the field. Nobody suspects a thing.',
    line: 'You saw nothing.',
  },
  heroLanding: {
    name: 'Superhero Landing', icon: 'star', color: '#ffd23f', price: 250, ghost: 150,
    desc: 'Drops out of the sky into a three-point landing. The ground did not survive.',
    line: 'Knees are fine. Probably.',
  },
  skateKickflip: {
    name: 'Skateboard Kickflip', icon: 'speed', color: '#ff8ac4', price: 350, ghost: 300,
    desc: 'Rolls in, kickflips, lands it. First try, allegedly.',
    line: "First try. Don't check.",
  },
  labExplosion: {
    name: 'Lab Explosion', icon: 'flask', color: '#7cff3a', price: 300, ghost: 500,
    desc: 'A giant beaker goes KABOOM and you walk out of the smoke a little crispy.',
    line: 'Totally on purpose.',
  },
  glitchTeleport: {
    name: 'Glitch Teleport', icon: 'bolt', color: '#3ff2e0', pass: true, ghost: 700,
    desc: 'Beams in through a glitching column of pixels. Arrives mostly in one piece.',
    line: 'Did I lag? I lagged.',
  },
  rocketDrop: {
    name: 'Rocket Drop', icon: 'rocket', color: '#ff8a2a', pass: true, ghost: 900,
    desc: 'Rides a soda rocket in and bails out at the last second.',
    line: 'Who needs brakes?',
  },
  redCarpet: {
    name: 'Red Carpet', icon: 'crown', color: '#ff3a5a', price: 450, ghost: 1200,
    desc: 'Carpet, velvet ropes, a wall of cameras. Signs zero autographs.',
    line: 'One photo. Okay, two.',
  },
  wallBurst: {
    name: 'Burst Through the Wall', icon: 'tower', color: '#e0703a', price: 550, ghost: 1600,
    desc: 'Runs straight through a brick wall. There was a door right next to it.',
    line: 'Doors are for quitters.',
  },
  heliDrop: {
    name: 'Helicopter Rope Drop', icon: 'wing', color: '#8fd8ff', price: 500, ghost: 2000,
    desc: 'A chopper swings in low and you slide down the rope. The pilot keeps the meter running.',
    line: 'Rope burn. Worth it.',
  },
  jetpack: {
    name: 'Jetpack', icon: 'fire', color: '#ff6a1f', trophies: 2300, ghost: 2300,
    desc: 'Flies in on a lab jetpack and lands with the engine still smoking.',
    line: 'Parking up there is awful.',
  },
  limo: {
    name: 'Limo Arrival', icon: 'ticket', color: '#c9a0ff', price: 650, ghost: 2800,
    desc: 'A limo so long it takes up two lanes pulls up. Door opens. Shades go on.',
    line: 'Keep it running.',
  },
  moneyRain: {
    name: 'Money Rain', icon: 'bag', color: '#5fdc4a', price: 800, ghost: 3400,
    desc: 'It rains cash. You stroll through it like it is a normal Tuesday.',
    line: 'Keep the change.',
  },
  hypeParade: {
    name: 'Hype Parade', icon: 'megaphone', color: '#ff4fa3', trophies: 4000, ghost: 4000,
    desc: 'A float, a drumline and confetti cannons. The drummers are not paid enough.',
    line: 'Okay, okay. You can clap.',
  },
};
for (const [id, e] of Object.entries(ENTRANCES)) e.id = id;
export const DEFAULT_ENTRANCE = 'strut';
export const entranceDef = (id) => ENTRANCES[id] ?? ENTRANCES[DEFAULT_ENTRANCE];

/** How you get it, as a short label: 'FREE' | '250' (Bucks) | 'FOOD PASS' | '2,300 TROPHIES'. */
export function entranceSource(id) {
  const e = entranceDef(id);
  if (e.free) return { kind: 'free' };
  if (e.pass) return { kind: 'pass' };
  if (e.trophies) return { kind: 'trophies', n: e.trophies };
  return { kind: 'bucks', n: e.price ?? 0 };
}

/** The entrance a ghost rival uses: one of the flashiest few its trophies allow (stable per name). */
export function ghostEntrance(trophies = 0, seed = '') {
  const ok = Object.values(ENTRANCES).filter((e) => (e.ghost ?? 0) <= trophies).sort((a, b) => (a.ghost ?? 0) - (b.ghost ?? 0));
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const top = ok.slice(-5);
  return (top[h % top.length] ?? ENTRANCES.strut).id;
}

// The NEW CARD cutscene (src/scenes/newCardCutscene.js) keeps its own reveal, picked by rarity:
// these six have a Swarm version there. Battle entrances do not change it.
const CARD_REVEAL = { common: 'strut', rare: 'heroLanding', epic: 'labExplosion', legendary: 'rocketDrop', mythic: 'redCarpet' };
export const cardReveal = (rarity, spell = false) => (spell ? 'glitchTeleport' : CARD_REVEAL[rarity] ?? 'strut');
