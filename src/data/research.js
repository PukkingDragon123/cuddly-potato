// RESEARCH TREE: the Lab's long-term upgrades (replaces the old Commander perk
// rolls). Nine branches, drawn as rows; every branch is a chain of nodes and a
// branch starts from a node of another branch (the pipes in the tree UI).
//
// A node has 1-5 levels. Each level costs Beast Coins and real time (one
// research at a time, timers keep running while the game is closed, finish
// early with Beast Bucks) and the node is gated by RANK (Lab Level medal tier).
//
// Battle effects: researchMods(levels) folds every researched level into one
// flat modifier object (side.rs in the battle sim). Keys:
//   base:    baseHp zapDmg zapRange (fractions), upgradeDiscount (POWER), repair (max HP / s),
//            sentry (2nd zap damage fraction), bunker (shield fraction)
//   POWER:   regen (fraction), maxPower, startPower (POWER), refund (chance), killPower (POWER / KO)
//   ULT:     ultCharge ultStart skillCd megaCharge ultPower (fractions)
//   troops:  <cls>Hp <cls>Dmg <cls>Spd <cls>Atk (fractions) for cls = brawl tank shoot fly swarm,
//            shootRange, brawlFirst, bonk (stun s), tankShield, tankKb, tankThorns, tankMule,
//            doubleTap, lucky, foil, gift (damage), packExtra (units), hazmat
//   spells:  spellPow spellRadius (fractions), preMixed (spells), wallBreaker (fraction)

import { LAB_MAX_LEVEL } from './labs.js';

/** Lab Level where each rank medal tier starts (matches RANK_TIERS in src/ui/rankMedal.js). */
export const RANK_LEVELS = { bronze: 1, silver: 3, gold: 5, platinum: 8, diamond: 11, legend: LAB_MAX_LEVEL };
const R = RANK_LEVELS;

// --------------------------------------------------------------------------- cost / time tables

/** Coins and seconds for level 1 of a node, by tier. */
export const TIER_COINS = [20, 60, 150, 400, 900, 2000, 4000, 8000, 15000, 25000];
export const TIER_TIME = [10, 40, 150, 600, 1800, 3600, 7200, 14400, 21600, 28800];
/** Level multipliers (level 1..5). */
const LV_COINS = [1, 1.6, 2.4, 3.4, 4.6];
const LV_TIME = [1, 1.4, 1.9, 2.4, 3];

const roundNice = (n) => (n < 100 ? Math.round(n / 5) * 5 : n < 1000 ? Math.round(n / 10) * 10 : n < 10000 ? Math.round(n / 50) * 50 : Math.round(n / 500) * 500);
const roundTime = (s) => (s < 180 ? Math.round(s / 5) * 5 : s < 3600 ? Math.round(s / 30) * 30 : Math.round(s / 300) * 300);

/** Coins to research `level` (1-based) of a node. */
export const nodeCost = (node, level) => roundNice(TIER_COINS[node.tier] * LV_COINS[Math.max(0, Math.min(4, level - 1))]);
/** Seconds to research `level` (1-based) of a node. */
export const nodeTime = (node, level) => roundTime(TIER_TIME[node.tier] * LV_TIME[Math.max(0, Math.min(4, level - 1))]);

/** Beast Bucks to finish a research right now (cheaper per minute the longer it is). */
export function researchSkipPrice(secLeft) {
  if (!(secLeft > 0)) return 0;
  return Math.max(1, Math.ceil(Math.pow(secLeft / 60, 0.85) / 4));
}

// --------------------------------------------------------------------------- formatting helpers

const pct = (v) => `${Math.round(v * 1000) / 10}%`;
const num = (v) => String(Math.round(v * 100) / 100);
const lin = (step, n) => Array.from({ length: n }, (_, i) => Math.round(step * (i + 1) * 1000) / 1000);

// --------------------------------------------------------------------------- branches (rows, top to bottom)

export const BRANCHES = [
  { id: 'power', name: 'POWER', color: '#ffd23f', ink: '#5a3c00', icon: 'energy', row: 0 },
  { id: 'shack', name: 'LAB SHACK', color: '#4fb4ff', ink: '#0a2a5a', icon: 'lab', row: 1 },
  { id: 'ult', name: 'ULTIMATE', color: '#ff9a2e', ink: '#5a2400', icon: 'star', row: 2 },
  { id: 'brawl', name: 'BRAWLERS', color: '#ff4a5a', ink: '#5a0814', icon: 'sword', row: 3 },
  { id: 'tank', name: 'TANKS', color: '#a8b8d8', ink: '#232c48', icon: 'shield', row: 4 },
  { id: 'shoot', name: 'SHOOTERS', color: '#8af04a', ink: '#1a4a08', icon: 'range', row: 5 },
  { id: 'fly', name: 'FLYERS', color: '#7ae8ff', ink: '#0a3a4a', icon: 'wing', row: 6 },
  { id: 'swarm', name: 'SWARMS', color: '#b47cff', ink: '#2e0a5a', icon: 'swarm', row: 7 },
  { id: 'spell', name: 'SPELLS', color: '#ff5ab4', ink: '#5a0834', icon: 'magic', row: 8 },
];
export const BRANCH = Object.fromEntries(BRANCHES.map((b) => [b.id, b]));

/** Which branch's troop upgrades a Swarm uses (null: not a troop). MEGA ultimates and bosses are skipped by the sim. */
export function troopClass(def) {
  if (!def) return null;
  if ((def.count ?? 1) > 1 || def.role === 'swarm') return 'swarm';
  if (def.traits?.flying || def.role === 'flying') return 'fly';
  if (def.role === 'tank' || def.role === 'siege') return 'tank';
  if (def.projectile || def.role === 'ranged') return 'shoot';
  return 'brawl';
}
export const CLASS_NAME = { brawl: 'Brawler', tank: 'Tank', shoot: 'Shooter', fly: 'Flyer', swarm: 'Swarm' };

// --------------------------------------------------------------------------- nodes
// branch: row; col: column in the tree grid; req: the node it hangs off (needs level 1);
// rank: Lab Level needed (a rank medal tier); tier: cost/time tier of level 1;
// fx: { key: [value at level 1, 2, ...] }; text(v): the effect at those values;
// line: the flavour line (short, specific, funny).

const N = [];
function branch(id, startCol, parent, nodes) {
  nodes.forEach((n, i) => {
    N.push({ ...n, branch: id, col: startCol + i, req: i === 0 ? parent : nodes[i - 1].id, max: Object.values(n.fx)[0].length, sig: !!n.sig });
  });
}

branch('shack', 0, null, [
  { id: 'plywood', name: 'Thicker Plywood', icon: 'rs_plank', rank: R.bronze, tier: 0,
    fx: { baseHp: lin(0.03, 5) }, text: (v) => `Base HP +${pct(v.baseHp)}`, line: 'Two sheets instead of one. Science.' },
  { id: 'zapTune', name: 'Zapper Tune-Up', icon: 'rs_zapper', rank: R.bronze, tier: 1,
    fx: { zapDmg: lin(0.05, 5) }, text: (v) => `Base zapper damage +${pct(v.zapDmg)}`, line: 'Turned it off and on again. Now it hurts more.' },
  { id: 'extCord', name: 'Extension Cord', icon: 'rs_plug', rank: R.silver, tier: 3,
    fx: { zapRange: lin(0.04, 3) }, text: (v) => `Base zapper range +${pct(v.zapRange)}`, line: "Reaches all the way to the rival's snack table." },
  { id: 'flatPack', name: 'Flat-Pack Walls', icon: 'rs_box', rank: R.silver, tier: 4,
    fx: { upgradeDiscount: [1, 2] }, text: (v) => `Base upgrades cost ${v.upgradeDiscount} less POWER`, line: 'Some assembly required. Instructions not included.' },
  { id: 'ductTape', name: 'Duct Tape Crew', icon: 'rs_tape', rank: R.gold, tier: 5,
    fx: { repair: lin(0.001, 5) }, text: (v) => `Base repairs ${pct(v.repair)} of its HP per second after 3s without a hit`, line: 'Two interns and a roll of tape. They never sleep.' },
  { id: 'sentry', name: 'Shack Sentry', icon: 'rs_twinZap', rank: R.platinum, tier: 7, sig: true,
    fx: { sentry: [0.4, 0.55, 0.7] }, text: (v) => `The base fires a 2nd zap at another enemy (${pct(v.sentry)} damage)`, line: 'We glued a second zapper on. It works.' },
  { id: 'bunker', name: 'Bunker Mode', icon: 'rs_door', rank: R.diamond, tier: 8, sig: true,
    fx: { bunker: [0.1, 0.15, 0.2] }, text: (v) => `The first time the base drops below 30% HP it gets a ${pct(v.bunker)} HP shield`, line: 'Blast doors. Bought them from a guy in a bunker.' },
]);

branch('power', 2, 'zapTune', [
  { id: 'hamster', name: 'Hamster Wheel', icon: 'rs_hamster', rank: R.bronze, tier: 1,
    fx: { regen: lin(0.02, 5) }, text: (v) => `POWER regen +${pct(v.regen)}`, line: "His name is Gerald. He's paid in sunflower seeds." },
  { id: 'battery', name: 'Bigger Battery', icon: 'rs_battery', rank: R.silver, tier: 3,
    fx: { maxPower: [1, 2] }, text: (v) => `Max POWER +${v.maxPower}`, line: "Same battery. Bigger sticker." },
  { id: 'warmStart', name: 'Warm Start', icon: 'rs_kettle', rank: R.silver, tier: 3,
    fx: { startPower: [1, 2] }, text: (v) => `Start battles with +${v.startPower} POWER`, line: 'Pre-heat the lab to 350 degrees.' },
  { id: 'coupon', name: 'Coupon Clipper', icon: 'rs_coupon', rank: R.gold, tier: 5,
    fx: { refund: lin(0.04, 4) }, text: (v) => `${pct(v.refund)} chance a troop deploy refunds 1 POWER`, line: 'Extreme couponing, but for electricity.' },
  { id: 'scrap', name: 'Scrap Collector', icon: 'rs_magnet', rank: R.platinum, tier: 7, sig: true,
    fx: { killPower: [0.1, 0.2, 0.3] }, text: (v) => `+${num(v.killPower)} POWER for every enemy troop knocked out`, line: "One rival's junk is another rival's battery." },
  { id: 'fusion', name: 'Fusion Hamster', icon: 'rs_hamsterGlow', rank: R.legend, tier: 9,
    fx: { regen: lin(0.04, 3) }, text: (v) => `POWER regen +${pct(v.regen)} more`, line: "Gerald found the plutonium. We can't stop him now." },
]);

branch('ult', 5, 'ductTape', [
  { id: 'hypeJuice', name: 'Hype Juice', icon: 'soda', rank: R.silver, tier: 3,
    fx: { ultCharge: lin(0.04, 5) }, text: (v) => `ULTIMATE charges ${pct(v.ultCharge)} faster`, line: 'Tastes like a thumbnail with three red arrows.' },
  { id: 'preCharged', name: 'Pre-Charged', icon: 'rs_plugIn', rank: R.gold, tier: 4,
    fx: { ultStart: lin(0.05, 4) }, text: (v) => `Start battles with ${pct(v.ultStart)} ULTIMATE charge`, line: 'We left it plugged in overnight.' },
  { id: 'cmdGym', name: 'Commander Gym', icon: 'rs_dumbbell', rank: R.gold, tier: 5,
    fx: { skillCd: lin(0.04, 5) }, text: (v) => `Commander skill cooldowns -${pct(v.skillCd)}`, line: 'Leg day for leaders.' },
  { id: 'megaMagnet', name: 'Mega Magnet', icon: 'rs_horseshoe', rank: R.platinum, tier: 6,
    fx: { megaCharge: lin(0.05, 4) }, text: (v) => `MEGA charges ${pct(v.megaCharge)} faster`, line: 'Mega things are attracted to it. So are forks.' },
  { id: 'megaphone', name: 'Louder Megaphone', icon: 'megaphone', rank: R.diamond, tier: 8,
    fx: { ultPower: lin(0.04, 5) }, text: (v) => `ULTIMATE and skill power +${pct(v.ultPower)}`, line: 'Goes to eleven. The neighbors filed a complaint.' },
]);

branch('brawl', 1, 'plywood', [
  { id: 'knuckles', name: 'Knuckle Wraps', icon: 'rs_fist', rank: R.bronze, tier: 0,
    fx: { brawlDmg: lin(0.03, 5) }, text: (v) => `Brawler damage +${pct(v.brawlDmg)}`, line: 'Wrapped with the finest lab tape.' },
  { id: 'protein', name: 'Protein Shake', icon: 'rs_shaker', rank: R.bronze, tier: 1,
    fx: { brawlHp: lin(0.03, 5) }, text: (v) => `Brawler HP +${pct(v.brawlHp)}`, line: 'Chocolate flavor. Contains 0% chocolate.' },
  { id: 'fastHands', name: 'Fast Hands', icon: 'rs_fastFist', rank: R.silver, tier: 3,
    fx: { brawlAtk: lin(0.03, 4) }, text: (v) => `Brawler attack speed +${pct(v.brawlAtk)}`, line: 'Trained by slapping 1,000 mosquitoes.' },
  { id: 'suckerPunch', name: 'Sucker Punch', icon: 'rs_glove', rank: R.gold, tier: 5, sig: true,
    fx: { brawlFirst: lin(0.25, 3) }, text: (v) => `A Brawler's first hit deals +${pct(v.brawlFirst)} damage`, line: 'Look over there! ...Bonk.' },
  { id: 'cardio', name: 'Cardio Day', icon: 'rs_sneaker', rank: R.platinum, tier: 6,
    fx: { brawlSpd: lin(0.04, 3) }, text: (v) => `Brawler move speed +${pct(v.brawlSpd)}`, line: 'Nobody skips cardio day. Nobody.' },
  { id: 'bonkCombo', name: 'Bonk Combo', icon: 'rs_mallet', rank: R.diamond, tier: 8, sig: true,
    fx: { bonk: [0.3, 0.45, 0.6] }, text: (v) => `Every 4th Brawler hit stuns for ${num(v.bonk)}s`, line: 'Bonk, bonk, bonk, BONK.' },
]);

branch('tank', 4, 'fastHands', [
  { id: 'padding', name: 'Extra Padding', icon: 'rs_pillow', rank: R.silver, tier: 3,
    fx: { tankHp: lin(0.03, 5) }, text: (v) => `Tank HP +${pct(v.tankHp)}`, line: 'Bubble wrap, three layers. Do not pop.' },
  { id: 'ironHide', name: 'Iron Hide', icon: 'rs_plate', rank: R.gold, tier: 5, sig: true,
    fx: { tankShield: lin(0.05, 3) }, text: (v) => `Tanks start with a shield of ${pct(v.tankShield)} of their HP`, line: 'Spray-painted silver. Basically iron.' },
  { id: 'heavyBoots', name: 'Heavy Boots', icon: 'rs_boot', rank: R.platinum, tier: 6,
    fx: { tankKb: [0.25, 0.5] }, text: (v) => `Tanks get knocked back ${pct(v.tankKb)} less`, line: 'Lead soles. Walking is now optional.' },
  { id: 'bigBonk', name: 'Big Bonk', icon: 'rs_maul', rank: R.platinum, tier: 7,
    fx: { tankDmg: lin(0.04, 5) }, text: (v) => `Tank damage +${pct(v.tankDmg)}`, line: 'Bigger arms. Same tiny brain.' },
  { id: 'spikes', name: 'Spite Spikes', icon: 'rs_spikes', rank: R.diamond, tier: 8, sig: true,
    fx: { tankThorns: lin(0.05, 3) }, text: (v) => `Tanks hit back for ${pct(v.tankThorns)} of the melee damage they take`, line: 'Hug at your own risk.' },
  { id: 'mule', name: 'Stubborn Mule', icon: 'rs_bandage', rank: R.legend, tier: 9, sig: true,
    fx: { tankMule: [0.1, 0.15, 0.2] }, text: (v) => `The first time a Tank drops below 25% HP it heals ${pct(v.tankMule)}`, line: 'Refuses to fall over out of pure spite.' },
]);

branch('shoot', 3, 'protein', [
  { id: 'laserSight', name: 'Laser Sights', icon: 'rs_scope', rank: R.bronze, tier: 1,
    fx: { shootDmg: lin(0.03, 5) }, text: (v) => `Shooter damage +${pct(v.shootDmg)}`, line: 'The red dot is mostly for drama.' },
  { id: 'hoodie', name: 'Kevlar Hoodie', icon: 'rs_hoodie', rank: R.silver, tier: 3,
    fx: { shootHp: lin(0.04, 5) }, text: (v) => `Shooter HP +${pct(v.shootHp)}`, line: 'Merch, but bulletproof. Sold out in 4 seconds.' },
  { id: 'stool', name: 'Taller Stool', icon: 'rs_stool', rank: R.gold, tier: 4,
    fx: { shootRange: lin(0.03, 4) }, text: (v) => `Shooter range +${pct(v.shootRange)}`, line: "Height is range. That's just physics." },
  { id: 'doubleTap', name: 'Double Tap', icon: 'rs_darts', rank: R.platinum, tier: 6, sig: true,
    fx: { doubleTap: lin(0.05, 4) }, text: (v) => `${pct(v.doubleTap)} chance a Shooter fires twice`, line: 'Like and subscribe. Twice.' },
  { id: 'hotBarrels', name: 'Hot Barrels', icon: 'rs_barrel', rank: R.platinum, tier: 7,
    fx: { shootAtk: lin(0.03, 4) }, text: (v) => `Shooter attack speed +${pct(v.shootAtk)}`, line: 'Do not touch. We touched it.' },
  { id: 'luckySocks', name: 'Lucky Socks', icon: 'rs_sock', rank: R.diamond, tier: 8, sig: true,
    fx: { lucky: lin(0.04, 3) }, text: (v) => `${pct(v.lucky)} chance a Shooter hit deals triple damage`, line: "Unwashed since the first win. It's science." },
]);

branch('fly', 6, 'stool', [
  { id: 'lightWings', name: 'Lighter Wings', icon: 'wing', rank: R.gold, tier: 4,
    fx: { flySpd: lin(0.04, 4) }, text: (v) => `Flyer move speed +${pct(v.flySpd)}`, line: 'Shaved off two whole grams of feathers.' },
  { id: 'featherArmor', name: 'Feather Armor', icon: 'rs_feather', rank: R.gold, tier: 5,
    fx: { flyHp: lin(0.04, 5) }, text: (v) => `Flyer HP +${pct(v.flyHp)}`, line: 'Armor, but fluffy. Mostly fluffy.' },
  { id: 'foil', name: 'Anti-Zap Foil', icon: 'rs_foilHat', rank: R.platinum, tier: 6, sig: true,
    fx: { foil: lin(0.1, 3) }, text: (v) => `Flyers take ${pct(v.foil)} less damage from the rival base`, line: 'Tin foil hats for the whole flock.' },
  { id: 'diveBomb', name: 'Dive Bomb', icon: 'rs_dive', rank: R.diamond, tier: 8,
    fx: { flyDmg: lin(0.04, 5) }, text: (v) => `Flyer damage +${pct(v.flyDmg)}`, line: 'Gravity does half the work.' },
  { id: 'partingGift', name: 'Parting Gift', icon: 'gift', rank: R.legend, tier: 9, sig: true,
    fx: { gift: [80, 120, 160] }, text: (v) => `Knocked-out Flyers drop a soda bomb (${v.gift} area damage)`, line: 'Leaves a present. Not the good kind.' },
]);

branch('swarm', 2, 'knuckles', [
  { id: 'groupChat', name: 'Group Chat', icon: 'rs_chat', rank: R.bronze, tier: 1,
    fx: { swarmHp: lin(0.04, 5) }, text: (v) => `Swarm HP +${pct(v.swarmHp)}`, line: 'They share everything. Including hitpoints.' },
  { id: 'toenails', name: 'Sharp Toenails', icon: 'rs_claw', rank: R.silver, tier: 3,
    fx: { swarmDmg: lin(0.03, 5) }, text: (v) => `Swarm damage +${pct(v.swarmDmg)}`, line: 'Nobody asked for this. We did it anyway.' },
  { id: 'sugarRush', name: 'Sugar Rush', icon: 'choco', rank: R.gold, tier: 4,
    fx: { swarmSpd: lin(0.04, 3) }, text: (v) => `Swarm move speed +${pct(v.swarmSpd)}`, line: 'Feastables for breakfast, lunch and dinner.' },
  { id: 'packTactics', name: 'Pack Tactics', icon: 'swarm', rank: R.platinum, tier: 7, sig: true,
    fx: { swarmDmg: [0.03, 0.06, 0.09, 0.12, 0.12], packExtra: [0, 0, 0, 0, 1] },
    text: (v) => (v.packExtra ? `Swarm cards spawn +${v.packExtra} unit, Swarm damage +${pct(v.swarmDmg)}` : `Swarm damage +${pct(v.swarmDmg)} (LV 5: Swarm cards spawn +1 unit)`),
    line: "There's always room for one more rat." },
  { id: 'hazmat', name: 'Hazmat Onesies', icon: 'rs_gasMask', rank: R.diamond, tier: 8,
    fx: { hazmat: lin(0.08, 3) }, text: (v) => `Swarm troops take ${pct(v.hazmat)} less damage from spells and abilities`, line: 'One size fits all. All 300 of them.' },
]);

branch('spell', 5, 'sugarRush', [
  { id: 'extraStrength', name: 'Extra Strength', icon: 'rs_potion', rank: R.silver, tier: 3,
    fx: { spellPow: lin(0.03, 5) }, text: (v) => `Spell power +${pct(v.spellPow)}`, line: 'Now with 30% more spell per spell.' },
  { id: 'widerSplash', name: 'Wider Splash', icon: 'rs_bucket', rank: R.gold, tier: 5,
    fx: { spellRadius: lin(0.04, 4) }, text: (v) => `Spell radius +${pct(v.spellRadius)}`, line: 'We bought a bigger bucket.' },
  { id: 'preMixed', name: 'Pre-Mixed', icon: 'rs_flasks', rank: R.gold, tier: 5, sig: true,
    fx: { preMixed: [1, 2] }, text: (v) => (v.preMixed > 1 ? `Your first ${v.preMixed} spells each battle cost 1 less POWER` : 'Your first spell each battle costs 1 less POWER'), line: 'Skip the warm-up. Straight to the zap.' },
  { id: 'wallBreaker', name: 'Wall Breaker', icon: 'rs_brick', rank: R.platinum, tier: 7,
    fx: { wallBreaker: lin(0.08, 3) }, text: (v) => `Spells deal +${pct(v.wallBreaker)} damage to bases`, line: 'Knock knock. Who is there? Not your wall.' },
  { id: 'bigBrain', name: 'Big Brain Dosage', icon: 'rs_brain', rank: R.legend, tier: 9,
    fx: { spellPow: lin(0.05, 3) }, text: (v) => `Spell power +${pct(v.spellPow)} more`, line: 'Brain size: yes.' },
]);

export const NODES = Object.fromEntries(N.map((n) => [n.id, n]));
export const NODE_LIST = N;
export const TOTAL_LEVELS = N.reduce((a, n) => a + n.max, 0);
/** Grid size of the tree (columns x rows). */
export const GRID = { cols: Math.max(...N.map((n) => n.col)) + 1, rows: BRANCHES.length };
/** The sub-branches hanging off each node (for the pipes). */
export const CHILDREN = {};
for (const n of N) if (n.req) (CHILDREN[n.req] ??= []).push(n.id);

/** Effect values of a node at a level (0 = nothing). */
export function nodeFx(node, level) {
  const out = {};
  for (const [k, arr] of Object.entries(node.fx)) out[k] = level > 0 ? arr[Math.min(arr.length, level) - 1] : 0;
  return out;
}
/** Effect text at a level (level 0: what level 1 would do). */
export const nodeText = (node, level) => node.text(nodeFx(node, Math.max(1, level)));

// --------------------------------------------------------------------------- battle modifiers

const ZERO = {
  baseHp: 0, zapDmg: 0, zapRange: 0, upgradeDiscount: 0, repair: 0, sentry: 0, bunker: 0,
  regen: 0, maxPower: 0, startPower: 0, refund: 0, killPower: 0,
  ultCharge: 0, ultStart: 0, skillCd: 0, megaCharge: 0, ultPower: 0,
  brawlHp: 0, brawlDmg: 0, brawlSpd: 0, brawlAtk: 0, brawlFirst: 0, bonk: 0,
  tankHp: 0, tankDmg: 0, tankSpd: 0, tankAtk: 0, tankShield: 0, tankKb: 0, tankThorns: 0, tankMule: 0,
  shootHp: 0, shootDmg: 0, shootSpd: 0, shootAtk: 0, shootRange: 0, doubleTap: 0, lucky: 0,
  flyHp: 0, flyDmg: 0, flySpd: 0, flyAtk: 0, foil: 0, gift: 0,
  swarmHp: 0, swarmDmg: 0, swarmSpd: 0, swarmAtk: 0, packExtra: 0, hazmat: 0,
  spellPow: 0, spellRadius: 0, preMixed: 0, wallBreaker: 0,
};
/** Flat battle modifiers from researched levels ({ nodeId: level }). Unknown ids are ignored. */
export function researchMods(levels) {
  const m = { ...ZERO };
  if (!levels || typeof levels !== 'object') return m;
  for (const [id, lv] of Object.entries(levels)) {
    const n = NODES[id];
    const l = Math.max(0, Math.min(n?.max ?? 0, Math.floor(Number(lv) || 0)));
    if (!n || !l) continue;
    for (const [k, v] of Object.entries(nodeFx(n, l))) m[k] = (m[k] ?? 0) + v;
  }
  return m;
}

// --------------------------------------------------------------------------- rules shared by the player and the AI

/** Is a node's prerequisite met for these levels? */
export const reqMet = (node, levels) => !node.req || (levels[node.req] ?? 0) >= 1;

/**
 * Research levels for an AI rival at a trophy count: what a typical player
 * there has bought. New players (under ~300 trophies) meet rivals with none;
 * the budget grows with trophies, and the rival buys the cheapest open level
 * first (with a little seeded variety), respecting prerequisites and its rank.
 */
export function researchForTrophies(trophies, labLevel = 1, rng = Math.random) {
  const levels = {};
  let budget = Math.max(0, trophies - 280) ** 1.45 * 0.25;
  if (budget <= 0) return levels;
  for (let guard = 0; guard < 400; guard++) {
    let best = null, bestC = Infinity;
    for (const n of N) {
      const lv = levels[n.id] ?? 0;
      if (lv >= n.max || n.rank > labLevel || !reqMet(n, levels)) continue;
      const c = nodeCost(n, lv + 1) * (0.75 + rng() * 0.5);
      if (c < bestC) { bestC = c; best = n; }
    }
    if (!best) break;
    const real = nodeCost(best, (levels[best.id] ?? 0) + 1);
    if (real > budget) break;
    budget -= real;
    levels[best.id] = (levels[best.id] ?? 0) + 1;
  }
  return levels;
}
