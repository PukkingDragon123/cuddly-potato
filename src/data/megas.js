// MEGA ultimates: the giant MEGA-TECH Mutator action figures (the biggest
// MrBeast Lab figures ever, each breaking out of a water-activated containment
// vessel). In battle a Mega is your ULTIMATE: charge it by fighting, then
// unleash it in a cinematic — it smashes out of its containment cup and stomps
// down the lane for a while.
//
// Megas are hidden units in SWARMS (so the battle sim can spawn them) and are
// owned separately from cards (profile.megas).
import { SWARMS } from './swarms.js';

export const MEGAS = {
  panthar: {
    name: 'Panthar', color: '#2b8cf2', bolt: '#ff2e88', unlock: 'Trophy Road: 300 trophies',
    desc: 'The Lab Panther grown into a 9-inch armored MEGA-TECH beast. Pounces onto the biggest crowd.',
    special: { id: 'pounce', name: 'Thunder Pounce', every: 4.5, radius: 3, dmg: 520, stun: 1.2 },
    hp: 5600, dmg: 280, atk: 1.1, range: 1.6, speed: 1.0, size: 3.4,
  },
  silverByte: {
    name: 'Silver-Byte', color: '#c8d2e8', bolt: '#3ff2c8', unlock: 'Trophy Road: 1,400 trophies',
    desc: 'A chrome cyber-beast made of living data. Its byte-beam slices the whole lane.',
    special: { id: 'beam', name: 'Gigabyte Annihilator', every: 5, length: 9, dmg: 380, stun: 0.6 },
    hp: 5000, dmg: 240, atk: 1.0, range: 2.6, speed: 0.95, size: 3.3,
  },
  necroClaw: {
    name: 'NecroClaw', color: '#7cff3a', bolt: '#b05cff', unlock: 'Trophy Road: 2,300 trophies',
    desc: 'Bone armor, toxic glow and claws like shovels. Every slam drains life from its victims.',
    special: { id: 'drain', name: 'Soul Harvest Slam', every: 4.5, radius: 3.2, dmg: 420, heal: 0.6 },
    hp: 6400, dmg: 300, atk: 1.25, range: 1.8, speed: 0.85, size: 3.5,
  },
  cyberGlitch: {
    name: 'Cyber Glitch', color: '#ff2ea8', bolt: '#29e0ff', unlock: 'Trophy Road: 3,400 trophies',
    desc: 'A glitching digital monster. It teleports through enemy lines and scrambles everything it hits.',
    special: { id: 'glitch', name: 'Fatal System Crash', every: 5, radius: 4, dmg: 360, stun: 2.2, blink: 4 },
    hp: 5200, dmg: 260, atk: 0.9, range: 1.6, speed: 1.1, size: 3.3,
  },
};
for (const [id, m] of Object.entries(MEGAS)) {
  m.id = id;
  // hidden battle unit
  SWARMS[id] = {
    id, kind: 'troop', name: m.name, series: 'megaTech', rarity: 'mythic', role: 'melee', hidden: true, isMegaUltimate: true,
    elixir: 0, cost: 0, hp: m.hp, dmg: m.dmg, atk: m.atk, range: m.range, speed: m.speed, size: m.size, kb: 1,
    traits: { area: true }, desc: m.desc,
  };
}
export const MEGA_IDS = Object.keys(MEGAS);
export const megaDef = (id) => MEGAS[id] ?? null;
