// Entrance animations: cosmetics for the NEW CARD cutscene (src/scenes/newCardCutscene.js).
// When a card is unlocked for the first time its Swarm makes an entrance in the
// style the player has equipped, pops a lab vial, strikes a pose and its stats
// slam in. The default is free; the others are sold in the shop (`price`, Beast
// Bucks) or earned on the Food Pass (`pass: true`, granted as
// { type: 'entrance', id } rewards).
export const ENTRANCES = {
  strut: {
    name: 'Classic Strut', icon: 'swarm', color: '#29b6f6', price: 0, free: true,
    desc: 'Walks into the spotlight like it owns the Lab.',
  },
  heroLanding: {
    name: 'Superhero Landing', icon: 'star', color: '#ffd23f', price: 250,
    desc: 'Drops from the ceiling into a three-point landing. The floor did not survive.',
  },
  labExplosion: {
    name: 'Lab Explosion', icon: 'flask', color: '#7cff3a', price: 300,
    desc: 'A beaker goes KABOOM and your Swarm steps out of the toxic smoke.',
  },
  redCarpet: {
    name: 'Red Carpet', icon: 'crown', color: '#ff3a5a', price: 450,
    desc: 'A red carpet rolls out, the cameras flash, the crowd goes wild.',
  },
  rocketDrop: {
    name: 'Rocket Drop', icon: 'rocket', color: '#ff8a2a', pass: true,
    desc: 'FOOD PASS: rides a soda rocket in and bails out at the last second.',
  },
  glitchTeleport: {
    name: 'Glitch Teleport', icon: 'bolt', color: '#3ff2e0', pass: true,
    desc: 'FOOD PASS: teleports in through a glitching beam of pixels.',
  },
};
for (const [id, e] of Object.entries(ENTRANCES)) e.id = id;
export const DEFAULT_ENTRANCE = 'strut';
export const entranceDef = (id) => ENTRANCES[id] ?? ENTRANCES[DEFAULT_ENTRANCE];
