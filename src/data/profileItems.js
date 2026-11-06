// Profile customization items: PICTURES (avatars), FRAMES, mastery BANNERS and TITLES.
//
//   AVATARS   commander faces (3D chibi portraits), NPC faces, Beast Lab icons (pixel art,
//             src/ui/avatar.js) and one portrait per troop (Troop Mastery Silver)
//   FRAMES    pixel-art avatar frames (src/ui/avatar.js draws them): rank frames, shop frames,
//             animated legendary frames and one troop-themed frame per troop (Mastery Gold)
//   BANNERS   one banner per troop (Mastery Platinum), merged into season.js BANNERS at load
//   TITLES    a line under your name (one "<Troop> Master" per troop at Mastery Master)
//
// Every item has `get`, the way you earn it:
//   { free }                 everyone has it
//   { cmd: id }              own that Commander         { cmdSkin: id }  own that outfit
//   { lab: n }               reach Lab Level n          { trophies: n }  best trophies
//   { stat: key, n }         a career stat (stats.<key>) { bosses: n }    different bosses beaten
//   { shop: 'coins'|'bucks', price }  sold by Lonan (rotates daily)  -> stored in cosmetics lists
//   { mastery: cardId, level }        Troop Mastery reward            -> stored in cosmetics lists
//
// Pure data + pure helpers (they take the profile `p`; no state.js import, no DOM).
import { BANNERS, CMD_SKINS } from './season.js';
import { SWARMS, SERIES } from './swarms.js';
import { ALL_CARDS, cardDef, isSpell } from './cards.js';
import { COMMANDERS } from './commanders.js';
import { labLevelFor } from './labs.js';
import { mulberry32, hashString, todayKey } from '../core/util.js';

/** Troop cards that have a mastery track (and a picture / frame / banner / title). */
export const MASTERY_CARDS = ALL_CARDS.filter((c) => !isSpell(c.id) && !c.special && SWARMS[c.id] && !SWARMS[c.id].hidden).map((c) => c.id);

// ---------------------------------------------------------------------------
// PICTURES

const A = {};
const av = (id, o) => { A[id] = { id, ...o }; };
// commander faces (plate = two-tone backdrop behind the portrait)
av('cmd_recruit', { name: 'Lab Recruit', kind: 'cmd', char: 'recruit', full: true, plate: ['#ff8a2a', '#7a2a6a'], rarity: 'common', get: { free: true }, desc: 'Helmet stays on. Always.' });
av('cmd_jimmy', { name: 'Jimmy', kind: 'cmd', char: 'jimmy', plate: ['#29b6f6', '#163c8a'], rarity: 'rare', get: { cmd: 'jimmy' }, desc: 'The beard. The legend.' });
av('cmd_nolan', { name: 'Nolan', kind: 'cmd', char: 'nolan', plate: ['#ffd23f', '#b8461e'], rarity: 'rare', get: { cmd: 'nolan' }, desc: 'Professional fall guy.' });
av('cmd_juan', { name: 'Juan', kind: 'cmd', char: 'juan', plate: ['#1f9e4a', '#0c3a4a'], rarity: 'rare', get: { cmd: 'juan' }, desc: 'Number 10. Every season.' });
av('cmd_juanChef', { name: 'Chef Juan', kind: 'cmd', char: 'juan', skin: 'juanChef', plate: ['#ff6a5a', '#7a1a3a'], rarity: 'epic', get: { cmdSkin: 'juanChef' }, desc: 'Yes, chef.' });
av('cmd_juanGold', { name: 'Golden Juan', kind: 'cmd', char: 'juan', skin: 'juanGold', plate: ['#ffd23f', '#a8600e'], rarity: 'legendary', get: { cmdSkin: 'juanGold' }, desc: 'Shinier than his trophies.' });
av('cmd_nolanFry', { name: 'Fry Cook Nolan', kind: 'cmd', char: 'nolan', skin: 'nolanFryCook', plate: ['#ff4a4a', '#6a1a2a'], rarity: 'epic', get: { cmdSkin: 'nolanFryCook' }, desc: 'Would you like fries with that?' });
av('cmd_jimmyFeast', { name: 'Feastables Jimmy', kind: 'cmd', char: 'jimmy', skin: 'jimmyFeast', plate: ['#ff4fa3', '#1d4fa0'], rarity: 'epic', get: { cmdSkin: 'jimmyFeast' }, desc: 'Brought snacks for everyone.' });
// NPC faces
av('npc_lonan', { name: 'Lonan', kind: 'npc', char: 'shadyNolan', plate: ['#d8a548', '#3a2418'], rarity: 'epic', get: { shop: 'bucks', price: 90 }, desc: 'Definitely a different guy.' });
av('npc_labTech', { name: 'Lab Tech', kind: 'npc', char: 'labTech', plate: ['#b05cff', '#2a1a6a'], rarity: 'rare', get: { shop: 'coins', price: 1500 }, desc: 'Labels everything. Even you.' });
av('npc_cashier', { name: 'Cashier Cass', kind: 'npc', char: 'cashier', plate: ['#ff4f4f', '#2a3a8a'], rarity: 'rare', get: { shop: 'coins', price: 1500 }, desc: 'Paper or plastic?' });
av('npc_stocker', { name: 'Stocker Stan', kind: 'npc', char: 'stocker', plate: ['#5fdc4a', '#1a5a3a'], rarity: 'rare', get: { shop: 'coins', price: 1500 }, desc: 'Aisle 7 is his whole life.' });
av('npc_guard', { name: 'Guard Gus', kind: 'npc', char: 'guard', plate: ['#8a93b8', '#1a1e3a'], rarity: 'rare', get: { shop: 'coins', price: 2500 }, desc: 'Has not blinked since Tuesday.' });
av('npc_fan', { name: 'Super Fan', kind: 'npc', char: 'fan', plate: ['#ff2e88', '#1d4fa0'], rarity: 'epic', get: { shop: 'bucks', price: 60 }, desc: 'Subscribed twice. Somehow.' });
av('npc_anchor', { name: 'Nora Newsly', kind: 'npc', char: 'anchor', plate: ['#ff3a52', '#14183a'], rarity: 'epic', get: { shop: 'bucks', price: 60 }, desc: 'Breaking news: it is you.' });
av('npc_boss', { name: 'Boss Jimmy', kind: 'npc', char: 'jimmyBoss', plate: ['#ff2e88', '#14183a'], rarity: 'legendary', get: { bosses: 5 }, desc: 'Suit on. Wallet out.' });
// Beast Lab icons (pixel art, drawn in src/ui/avatar.js)
av('lab_flask', { name: 'Goo Flask', kind: 'lab', art: 'flask', plate: ['#2b8cf2', '#122a7a'], rarity: 'common', get: { free: true }, desc: 'Do not drink. Again.' });
av('lab_goggles', { name: 'Lab Goggles', kind: 'lab', art: 'goggles', plate: ['#3ff2c8', '#0c4a5a'], rarity: 'common', get: { stat: 'wins', n: 25 }, desc: 'Safety first. Style second.' });
av('lab_barrel', { name: 'Toxic Barrel', kind: 'lab', art: 'barrel', plate: ['#7cff3a', '#1a4a1a'], rarity: 'rare', get: { trophies: 1200 }, desc: 'Contents: yes.' });
av('lab_brain', { name: 'Brain Jar', kind: 'lab', art: 'brain', plate: ['#ff8ac4', '#4a1a6a'], rarity: 'rare', get: { lab: 6 }, desc: 'Smarter than the intern.' });
av('lab_skull', { name: 'Boss Skull', kind: 'lab', art: 'skull', plate: ['#b05cff', '#1a0a2a'], rarity: 'epic', get: { bosses: 3 }, desc: 'Proof you were there.' });
av('lab_mustache', { name: 'Mustache', kind: 'lab', art: 'mustache', plate: ['#d8a548', '#4a2a18'], rarity: 'common', get: { shop: 'coins', price: 999 }, desc: "Lonan's spare. Barely used." });
av('lab_choco', { name: 'Feastables Bar', kind: 'lab', art: 'choco', plate: ['#ff4fa3', '#5a1a3a'], rarity: 'rare', get: { shop: 'coins', price: 2400 }, desc: 'One bite missing. Not us.' });
av('lab_duck', { name: 'Hazmat Duck', kind: 'lab', art: 'duck', plate: ['#ffd23f', '#2a5a8a'], rarity: 'epic', get: { shop: 'coins', price: 3600 }, desc: 'Squeaks through a gas mask.' });
av('lab_ticket', { name: 'Golden Ticket', kind: 'lab', art: 'ticket', plate: ['#ffe46a', '#a8461e'], rarity: 'epic', get: { shop: 'bucks', price: 120 }, desc: 'Admits one. Probably.' });
av('lab_case', { name: 'Cash Case', kind: 'lab', art: 'case', plate: ['#4cd24a', '#123a2a'], rarity: 'legendary', get: { shop: 'bucks', price: 160 }, desc: '$100K, minus snacks.' });
// troop portraits (Troop Mastery: Silver)
for (const id of MASTERY_CARDS) {
  const d = cardDef(id), s = SERIES[d.series];
  av('troop_' + id, { name: d.name, kind: 'troop', card: id, plate: [s?.color ?? '#29b6f6', '#141a4a'], rarity: d.rarity === 'mythic' ? 'legendary' : d.rarity, get: { mastery: id, level: 2 }, desc: `Proof you play a lot of ${d.name}.` });
}
export const AVATARS = A;
export const DEFAULT_AVATAR = 'cmd_recruit';

// ---------------------------------------------------------------------------
// FRAMES (art: src/ui/avatar.js). anim: shine | goo | laser | holo | flame | cosmic

const F = {};
const fr = (id, o) => { F[id] = { id, ...o }; };
fr('basic', { name: 'Lab Issue', rarity: 'common', get: { free: true }, desc: 'Standard. Riveted. Fine.' });
fr('bronze', { name: 'Bronze Bolts', rarity: 'common', get: { lab: 2 }, desc: 'Bolted on by an intern.' });
fr('silver', { name: 'Silver Circuit', rarity: 'rare', get: { lab: 4 }, desc: 'Runs on one AA battery.' });
fr('gold', { name: 'Golden Lab', rarity: 'epic', get: { lab: 7 }, anim: 'shine', desc: 'Real gold. Ask no questions.' });
fr('hazard', { name: 'Hazard Tape', rarity: 'rare', get: { shop: 'coins', price: 2500 }, desc: 'Do not cross. Do look.' });
fr('choco', { name: 'Choco Wrap', rarity: 'rare', get: { shop: 'coins', price: 4000 }, desc: 'Smells like a candy bar.' });
fr('neonGoo', { name: 'Neon Goo', rarity: 'epic', get: { shop: 'bucks', price: 150 }, anim: 'goo', desc: 'Still wet. Do not touch.' });
fr('boss', { name: 'Boss Slayer', rarity: 'epic', get: { bosses: 3 }, desc: 'Horns sold separately.' });
fr('laser', { name: 'Laser Vault', rarity: 'epic', get: { trophies: 2500 }, anim: 'laser', desc: 'Lasers on. Hands off.' });
fr('holo', { name: 'Hyperchrome', rarity: 'legendary', get: { shop: 'bucks', price: 450 }, anim: 'holo', desc: 'Every color. At once.' });
fr('flame', { name: 'Volcano Forge', rarity: 'legendary', get: { trophies: 4000 }, anim: 'flame', desc: 'Forged in an actual volcano.' });
fr('cosmic', { name: 'Zero-G', rarity: 'legendary', get: { trophies: 6000 }, anim: 'cosmic', desc: 'Floats a little. Shh.' });
// troop-themed mastery frames (Troop Mastery: Gold): the series motif + the troop's rarity gems
for (const id of MASTERY_CARDS) {
  const d = cardDef(id);
  fr('m_' + id, { name: `${d.name} Frame`, rarity: d.rarity === 'mythic' ? 'legendary' : d.rarity, get: { mastery: id, level: 3 }, card: id, series: d.series, anim: ['legendary', 'mythic'].includes(d.rarity) ? 'shine' : null, desc: `${SERIES[d.series]?.name ?? 'Troop'} trim. ${d.name} mastery, framed.` });
}
export const FRAMES = F;
export const DEFAULT_FRAME = 'basic';

// ---------------------------------------------------------------------------
// BANNERS: one per troop (Troop Mastery: Platinum). Pixel texture by series + series colours;
// `troop` makes bannerEl (src/ui/home/common.js) stand the troop's portrait on the right.

const SERIES_TX = {
  originals: ['--tx-stars', '96px 96px'], homeHorrors: ['--tx-drip', '48px 48px'], technoTerrors: ['--tx-grid', '24px 24px'],
  atomic: ['--tx-bubbles-sm', '32px 48px'], hybrids: ['--tx-zap', '48px 15px'], food: ['--tx-sprinkles', '48px 48px'],
  labBrats: ['--tx-bubbles-sm', '32px 48px'], creepyCritters: ['--tx-grid', '24px 24px'], megaTech: ['--tx-grid', '24px 24px'],
  fireIce: ['--tx-zap', '48px 15px'], battleFusion: ['--tx-hazard', '24px 24px'], wildlands: ['--tx-gingham', '24px 24px'],
  spooky: ['--tx-stars', '96px 96px'], cosmic: ['--tx-stars', '72px 72px'],
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return '#' + ((c((n >> 16) & 255) << 16) | (c((n >> 8) & 255) << 8) | c(n & 255)).toString(16).padStart(6, '0');
};
export const MASTERY_BANNERS = {};
for (const id of MASTERY_CARDS) {
  const d = cardDef(id), s = SERIES[d.series], col = s?.color ?? '#29b6f6';
  const [tx, sz] = SERIES_TX[d.series] ?? ['--tx-grid', '24px 24px'];
  MASTERY_BANNERS['mb_' + id] = {
    name: `${d.name} Banner`, troop: id, mastery: true,
    css: `var(${tx}) 0 0/${sz}, linear-gradient(90deg, ${shade(col, -0.62)}, ${shade(col, -0.25)} 55%, ${col})`,
    animated: ['legendary', 'mythic'].includes(d.rarity) ? 'pan' : false,
  };
}
// one banner list everywhere (profile, shop, rewards, bannerEl)
for (const [k, b] of Object.entries(MASTERY_BANNERS)) if (!BANNERS[k]) BANNERS[k] = b;

// ---------------------------------------------------------------------------
// TITLES

const T = {};
const ti = (id, o) => { T[id] = { id, ...o }; };
ti('t_recruit', { name: 'Fresh Recruit', get: { free: true } });
ti('t_intern', { name: 'Unpaid Intern', get: { shop: 'coins', price: 500 } });
ti('t_shaker', { name: 'Vial Shaker', get: { stat: 'vialsOpened', n: 25 } });
ti('t_streak', { name: 'On Fire', get: { stat: 'bestStreak', n: 5 } });
ti('t_breaker', { name: 'Base Breaker', get: { stat: 'basesDestroyed', n: 25 } });
ti('t_flawless', { name: 'Untouchable', get: { stat: 'flawless', n: 5 } });
ti('t_mega', { name: 'MEGA Maniac', get: { stat: 'megasUsed', n: 15 } });
ti('t_plunger', { name: 'Plunger Pro', get: { shop: 'coins', price: 1200 } });
ti('t_customer', { name: "Lonan's Best Customer", get: { shop: 'bucks', price: 40 } });
ti('t_hunter', { name: 'Boss Hunter', get: { bosses: 5 } });
ti('t_royal', { name: 'Island Royalty', get: { trophies: 5000 } });
ti('t_legend', { name: 'Lab Legend', get: { lab: 14 } });
for (const id of MASTERY_CARDS) ti('tm_' + id, { name: `${cardDef(id).name} Master`, get: { mastery: id, level: 5 }, card: id });
export const TITLES = T;
export const DEFAULT_TITLE = 't_recruit';

// ---------------------------------------------------------------------------
// Ownership + how to get

export const KINDS = { avatar: AVATARS, frame: FRAMES, title: TITLES };
const LIST = { avatar: 'avatars', frame: 'frames', title: 'titles' };
export const itemDef = (kind, id) => KINDS[kind]?.[id] ?? null;

function cmdSkinHave(p, skinId) {
  const o = p.cosmetics?.cmdSkins ?? {}, c = CMD_SKINS[skinId]?.commander;
  return !!(o[skinId] || (c && o[c + ':' + skinId]));
}
/** Is the item's own rule met (independent of the granted list)? */
function ruleMet(g, p) {
  if (!g || g.free) return true;
  if (g.cmd) return !!p.commanders?.owned?.[g.cmd];
  if (g.cmdSkin) return cmdSkinHave(p, g.cmdSkin);
  if (g.lab) return labLevelFor(p.labXp ?? 0) >= g.lab;
  if (g.trophies) return (p.bestTrophies ?? 0) >= g.trophies;
  if (g.stat) return (p.stats?.[g.stat] ?? 0) >= g.n;
  if (g.bosses) return Object.keys(p.bosses ?? {}).length >= g.bosses;
  return false; // shop + mastery items are granted into the cosmetics lists
}
export function ownsItem(p, kind, id) {
  const it = itemDef(kind, id);
  if (!it || !p) return false;
  if (p.cosmetics?.[LIST[kind]]?.includes(id)) return true;
  return ruleMet(it.get, p);
}
/** Progress toward a rule-based item: [have, need] or null. */
export function itemProgress(p, kind, id) {
  const g = itemDef(kind, id)?.get;
  if (!g) return null;
  if (g.lab) return [labLevelFor(p.labXp ?? 0), g.lab];
  if (g.trophies) return [p.bestTrophies ?? 0, g.trophies];
  if (g.stat) return [p.stats?.[g.stat] ?? 0, g.n];
  if (g.bosses) return [Object.keys(p.bosses ?? {}).length, g.bosses];
  return null;
}
export const MASTERY_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Master'];
const STAT_TEXT = {
  wins: (n) => `Win ${n} battles`, vialsOpened: (n) => `Open ${n} vials`, bestStreak: (n) => `Win ${n} battles in a row`,
  basesDestroyed: (n) => `Destroy ${n} rival bases`, flawless: (n) => `Win ${n} battles without a scratch`, megasUsed: (n) => `Use your MEGA ${n} times`,
};
/** How to get an item, in one short line (UI adds cosmetic-specific hints for outfits). */
export function howToGet(kind, id) {
  const it = itemDef(kind, id);
  const g = it?.get;
  if (!g || g.free) return 'Free for everyone';
  if (g.cmd) return `Unlock ${COMMANDERS[g.cmd]?.name ?? 'the Commander'}`;
  if (g.cmdSkin) return `Get the ${CMD_SKINS[g.cmdSkin]?.name ?? 'outfit'} outfit`;
  if (g.lab) return `Reach Lab Level ${g.lab}`;
  if (g.trophies) return `Reach ${g.trophies.toLocaleString('en-US')} trophies`;
  if (g.stat) return (STAT_TEXT[g.stat] ?? ((n) => `${g.stat} x${n}`))(g.n);
  if (g.bosses) return `Beat ${g.bosses} different bosses`;
  if (g.shop) return "Lonan's shop (rotates daily)";
  if (g.mastery) return `${cardDef(g.mastery)?.name ?? 'Troop'} Mastery: ${MASTERY_NAMES[g.level - 1]}`;
  return 'Coming soon';
}
/** Grant into the cosmetics list (shop + mastery). Returns true if it was new. */
export function grantItem(p, kind, id) {
  if (!itemDef(kind, id)) return false;
  const key = LIST[kind];
  const list = (p.cosmetics[key] ??= []);
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}
/** Every id of a kind the player owns. */
export const ownedItems = (p, kind) => Object.keys(KINDS[kind]).filter((id) => ownsItem(p, kind, id));
/** Repair equipped picks (unknown / not owned -> defaults). */
export function sanitizeLooks(p) {
  const c = p.cosmetics;
  for (const k of ['avatars', 'frames', 'titles']) c[k] = Array.isArray(c[k]) ? c[k].filter((id, i, a) => typeof id === 'string' && a.indexOf(id) === i) : [];
  if (!ownsItem(p, 'avatar', c.avatar)) c.avatar = DEFAULT_AVATAR;
  if (!ownsItem(p, 'frame', c.frame)) c.frame = DEFAULT_FRAME;
  if (!ownsItem(p, 'title', c.title)) c.title = DEFAULT_TITLE;
}

// ---------------------------------------------------------------------------
// Lonan's PROFILE GEAR shelf: 4 items a day (2 pictures, a frame, a title)

const SHOP_POOL = { avatar: [], frame: [], title: [] };
for (const [kind, defs] of Object.entries(KINDS)) for (const it of Object.values(defs)) if (it.get?.shop) SHOP_POOL[kind].push(it.id);
export function profileShopOffers(day = todayKey()) {
  const rng = mulberry32(hashString('pgear' + day));
  const pick = (kind, n) => {
    const pool = SHOP_POOL[kind].slice(), out = [];
    while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    return out;
  };
  return [...pick('avatar', 2).map((id) => ({ kind: 'avatar', id })), ...pick('frame', 1).map((id) => ({ kind: 'frame', id })), ...pick('title', 1).map((id) => ({ kind: 'title', id }))]
    .map((o) => ({ ...o, cur: itemDef(o.kind, o.id).get.shop, price: itemDef(o.kind, o.id).get.price }));
}

// ---------------------------------------------------------------------------
// Rival looks: ghosts dress like a player at their trophies (seeded, so a rival keeps its look)

const FRAME_LADDER = [
  [0, ['basic', 'basic', 'bronze']], [300, ['bronze', 'basic', 'hazard']], [800, ['bronze', 'silver', 'hazard', 'choco']],
  [1500, ['silver', 'choco', 'neonGoo', 'hazard']], [2500, ['gold', 'silver', 'neonGoo', 'laser', 'boss']],
  [4000, ['gold', 'laser', 'boss', 'holo', 'flame']], [6000, ['holo', 'flame', 'cosmic', 'gold', 'laser']],
];
/** { avatar, frame, title } for a rival at `trophies` (seed = name or a number). */
export function ghostLook(trophies = 0, seed = 1) {
  const rng = mulberry32(typeof seed === 'number' ? seed : hashString(String(seed)));
  const t = Math.max(0, trophies | 0);
  const roll = (arr) => arr[Math.floor(rng() * arr.length)];
  const lab = Object.values(AVATARS).filter((a) => a.kind === 'lab' && (!a.get.trophies || a.get.trophies <= t)).map((a) => a.id);
  const cmds = ['cmd_recruit', 'cmd_jimmy', 'cmd_nolan', ...(t > 300 ? ['cmd_juan', 'cmd_juanChef'] : []), ...(t > 1500 ? ['cmd_nolanFry', 'cmd_jimmyFeast', 'cmd_juanGold'] : [])];
  const npcs = ['npc_labTech', 'npc_cashier', 'npc_stocker', 'npc_guard', 'npc_fan', 'npc_anchor', ...(t > 800 ? ['npc_lonan'] : []), ...(t > 2500 ? ['npc_boss'] : [])];
  // troop portraits: the cheap early troops low down, anything at the top
  const troops = MASTERY_CARDS.filter((id) => { const r = cardDef(id).rarity; return t > 2000 || r === 'common' || (t > 600 && r === 'rare'); });
  const r = rng();
  const avatar = r < 0.42 && troops.length ? 'troop_' + roll(troops) : r < 0.62 ? roll(cmds) : r < 0.8 ? roll(npcs) : roll(lab);
  let ladder = FRAME_LADDER[0][1];
  for (const [min, list] of FRAME_LADDER) if (t >= min) ladder = list;
  // high up, some rivals show off a troop mastery frame instead
  const frame = t > 1200 && rng() < 0.3 ? 'm_' + roll(troops.length ? troops : MASTERY_CARDS) : roll(ladder);
  const titles = Object.values(TITLES).filter((x) => !x.card && (!x.get.trophies || x.get.trophies <= t) && (!x.get.lab || t > 3000)).map((x) => x.id);
  const title = t > 1000 && rng() < 0.35 ? 'tm_' + roll(troops.length ? troops : MASTERY_CARDS) : roll(titles);
  return { avatar, frame, title };
}
