// Season 1: FOOD SEASON battle pass. Calories = season XP.
import { cardDef } from './cards.js';

export const SEASON = {
  id: 1,
  name: 'FOOD SEASON',
  tagline: 'Eat. Battle. Repeat.',
  premiumCost: 450, // Beast Bucks
  calPerTier: 150,
  color: '#ff4fa3',
  // hero art on the season banner (3D renders) + premium showcase
  hero: { swarm: 'feastablesPanther', alt: 'chocoChomper', cmd: 'juan', cmdSkin: 'juanChef' },
  showcase: [{ type: 'cmdSkin', id: 'juanGold' }, { type: 'skin', id: 'goldenWrapperPanther' }, { type: 'mega', id: 'panthar', variant: 'gold' }],
};

/** The season clock (presentational, no server): seasons roll over at the end of each calendar month. */
export function seasonEndMs(now = Date.now()) {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
}

// reward types: coins, bucks, vial, swarm, spell, commander, skin (swarm skin), labSkin, cmdSkin, banner, serum (mega form unlock),
//               entrance (NEW CARD cutscene entrance animation, see data/entrances.js)
export const PASS_TIERS = [
  { free: { type: 'coins', amount: 200 }, premium: { type: 'vial', id: 'snackPack' } },
  { free: { type: 'card', id: 'fryFiend' }, premium: { type: 'bucks', amount: 30 } },
  { free: { type: 'vial', id: 'testTube' }, premium: { type: 'card', id: 'pizzaSlicer', copies: 3 } },
  { free: { type: 'commander', id: 'juan' }, premium: { type: 'cmdSkin', id: 'juanChef', commander: 'juan' } },
  { free: { type: 'coins', amount: 300 }, premium: { type: 'banner', id: 'feastBanner' } },
  { free: { type: 'card', id: 'pizzaSlicer' }, premium: { type: 'skin', id: 'wrapperPanther', swarm: 'panther' } },
  { free: { type: 'vial', id: 'snackPack' }, premium: { type: 'coins', amount: 800 } },
  { free: { type: 'bucks', amount: 25 }, premium: { type: 'card', id: 'sodaSurge' } },
  { free: { type: 'card', id: 'donutDasher' }, premium: { type: 'vial', id: 'megaLab' } },
  { free: { type: 'spell', id: 'sodaRocket' }, premium: { type: 'labSkin', id: 'martLab' } },
  { free: { type: 'coins', amount: 500 }, premium: { type: 'skin', id: 'ketchupClog', swarm: 'cloggedToilet' } },
  { free: { type: 'vial', id: 'snackPack' }, premium: { type: 'bucks', amount: 60 } },
  { free: { type: 'card', id: 'burgerBrute' }, premium: { type: 'banner', id: 'animDrip' } },
  { free: { type: 'entrance', id: 'heroLanding' }, premium: { type: 'card', id: 'chocoChomper' } },
  { free: { type: 'serum', id: 'feastablesPanther' }, premium: { type: 'cmdSkin', id: 'juanGold', commander: 'juan' } },
  { free: { type: 'vial', id: 'testTube' }, premium: { type: 'vial', id: 'hyperchrome' } },
  { free: { type: 'card', id: 'sodaSurge' }, premium: { type: 'skin', id: 'cartCan', swarm: 'trashedCan' } },
  { free: { type: 'bucks', amount: 40 }, premium: { type: 'entrance', id: 'rocketDrop' } },
  { free: { type: 'vial', id: 'snackPack' }, premium: { type: 'card', id: 'melonMauler' } },
  { free: { type: 'card', id: 'chocoChomper' }, premium: { type: 'labSkin', id: 'chocoLab' } },
  { free: { type: 'coins', amount: 900 }, premium: { type: 'banner', id: 'animFeast' } },
  { free: { type: 'vial', id: 'megaLab' }, premium: { type: 'bucks', amount: 100 } },
  { free: { type: 'card', id: 'melonMauler' }, premium: { type: 'skin', id: 'goldenWrapperPanther', swarm: 'feastablesPanther' } },
  { free: { type: 'coins', amount: 1200 }, premium: { type: 'vial', id: 'cashCase' } },
  { free: { type: 'vial', id: 'cashCase' }, premium: { type: 'banner', id: 'animGoldenTicket' } },
  // ---- tiers 26-50: the second half of the season (new Swarms, outfits, the Mansion Lab, a Golden MEGA)
  { free: { type: 'coins', amount: 1000 }, premium: { type: 'card', id: 'pumpkinBrute', copies: 2, alt: { type: 'card', id: 'burgerBrute', copies: 6 } } },
  { free: { type: 'card', id: 'donutDasher', copies: 8 }, premium: { type: 'banner', id: 'sprinkleParty' } },
  { free: { type: 'vial', id: 'snackPack' }, premium: { type: 'entrance', id: 'glitchTeleport' } },
  { free: { type: 'bucks', amount: 40 }, premium: { type: 'card', id: 'jellyZapper', copies: 4, alt: { type: 'card', id: 'atomicSlime', copies: 10 } } },
  { free: { type: 'vial', id: 'megaLab' }, premium: { type: 'cmdSkin', id: 'nolanFryCook', commander: 'nolan' } },
  { free: { type: 'coins', amount: 1400 }, premium: { type: 'card', id: 'emberImps', copies: 4, alt: { type: 'card', id: 'emberWolf', copies: 6 } } },
  { free: { type: 'card', id: 'burgerBrute', copies: 10 }, premium: { type: 'vial', id: 'hyperchrome' } },
  { free: { type: 'spell', id: 'sodaRocket', copies: 3 }, premium: { type: 'bucks', amount: 80 } },
  { free: { type: 'vial', id: 'testTube' }, premium: { type: 'banner', id: 'picnicBanner' } },
  { free: { type: 'card', id: 'sharkByte', copies: 2, alt: { type: 'card', id: 'circuitShark', copies: 6 } }, premium: { type: 'card', id: 'ghostPanther', copies: 1, alt: { type: 'card', id: 'midnightPanther', copies: 6 } } },
  { free: { type: 'coins', amount: 1800 }, premium: { type: 'vial', id: 'snackPack' } },
  { free: { type: 'bucks', amount: 50 }, premium: { type: 'card', id: 'vineViper', copies: 2, alt: { type: 'card', id: 'vexViper', copies: 6 } } },
  { free: { type: 'card', id: 'melonMauler', copies: 4 }, premium: { type: 'coins', amount: 3000 } },
  { free: { type: 'vial', id: 'labPack' }, premium: { type: 'cmdSkin', id: 'headChef', commander: '*' } },
  { free: { type: 'card', id: 'laserLynx', copies: 2, alt: { type: 'card', id: 'hyperchargePanther', copies: 2 } }, premium: { type: 'labSkin', id: 'mansion' } },
  { free: { type: 'coins', amount: 2200 }, premium: { type: 'card', id: 'templeGolem', copies: 2, alt: { type: 'card', id: 'stoneHybrid', copies: 3 } } },
  { free: { type: 'card', id: 'chocoChomper', copies: 4 }, premium: { type: 'bucks', amount: 120 } },
  { free: { type: 'vial', id: 'snackPack' }, premium: { type: 'banner', id: 'animSoda' } },
  { free: { type: 'bucks', amount: 60 }, premium: { type: 'card', id: 'magmaTitan', copies: 1, alt: { type: 'card', id: 'magmaMole', copies: 3 } } },
  { free: { type: 'card', id: 'vaultBot', copies: 2, alt: { type: 'card', id: 'glitchBot', copies: 12 } }, premium: { type: 'vial', id: 'cashCase' } },
  { free: { type: 'coins', amount: 2600 }, premium: { type: 'card', id: 'ufoGrabber', copies: 2, alt: { type: 'card', id: 'droneFang', copies: 8 } } },
  { free: { type: 'vial', id: 'megaLab' }, premium: { type: 'cmdSkin', id: 'jimmyFeast', commander: 'jimmy' } },
  { free: { type: 'card', id: 'sodaSurge', copies: 8 }, premium: { type: 'card', id: 'astroPanther', copies: 1, alt: { type: 'card', id: 'sludgeKraken', copies: 1 } } },
  { free: { type: 'bucks', amount: 80 }, premium: { type: 'banner', id: 'animChampion' } },
  { free: { type: 'vial', id: 'cashCase' }, premium: { type: 'mega', id: 'panthar', variant: 'gold' } },
];
// Troop cards that are still being built fall back to their `alt` reward, so a tier is never empty.
for (const t of PASS_TIERS) {
  for (const k of ['free', 'premium']) {
    const r = t[k];
    if (r.alt && (r.type === 'card' || r.type === 'swarm' || r.type === 'spell') && !cardDef(r.id)) t[k] = r.alt;
  }
}
/** Milestone tiers (every 5th) get the big showcase rows on the pass track. */
export const isMilestoneTier = (i) => (i + 1) % 5 === 0;

export function tierForCalories(cal) {
  return Math.min(PASS_TIERS.length, Math.floor(cal / SEASON.calPerTier));
}

// Season challenges reset daily (seeded) - progress tracked in profile.quests.season
export const SEASON_CHALLENGES = [
  { id: 'winBattles', text: 'Win {n} battles', n: 3, cal: 150, stat: 'wins' },
  { id: 'deployFood', text: 'Deploy {n} Snack Squad troops', n: 15, cal: 120, stat: 'deployFood' },
  { id: 'useFoodThrow', text: 'Use Food Throw {n} times', n: 4, cal: 100, stat: 'castfoodThrow' },
  { id: 'martBattles', text: 'Battle {n} times at Beast Mart', n: 2, cal: 120, stat: 'martBattles' },
  { id: 'openVials', text: 'Open {n} vials', n: 2, cal: 100, stat: 'vialsOpened' },
  { id: 'unleashMega', text: 'Unleash your MEGA {n} times', n: 2, cal: 160, stat: 'megasUsed' },
  { id: 'useSignature', text: 'Use your Commander signature {n} times', n: 4, cal: 110, stat: 'signatures' },
  { id: 'deployTroops', text: 'Deploy {n} troops', n: 40, cal: 110, stat: 'deployed' },
  { id: 'smashCarts', text: 'Smash {n} shopping carts', n: 6, cal: 90, stat: 'cartsSmashed' },
  { id: 'bases', text: 'Destroy {n} rival bases', n: 3, cal: 120, stat: 'basesDestroyed' },
  { id: 'baseUp', text: 'Upgrade your base {n} times', n: 6, cal: 150, stat: 'baseUpgrades' },
];

export const BANNERS = {
  default: { name: 'Lab Blue', css: 'linear-gradient(90deg,#1477c9,#29b6f6)', animated: false },
  pinkBolt: { name: 'Pink Bolt', css: 'repeating-linear-gradient(135deg,#ff2e88 0 14px,#c4126a 14px 28px)', animated: false },
  goldBars: { name: 'Gold Bars', css: 'repeating-linear-gradient(90deg,#ffd23f 0 18px,#e0a21a 18px 22px)', animated: false },
  feastBanner: { name: 'Feast Banner', css: 'repeating-linear-gradient(90deg,#ff4fa3 0 16px,#ffd23f 16px 32px,#1d9bf0 32px 48px)', animated: false, season: 1 },
  animStars: { name: 'Starfield', css: 'radial-gradient(#fff 1px, transparent 2px) 0 0/16px 16px, linear-gradient(90deg,#2a1a6a,#6a2ad0)', animated: 'pan' },
  animDrip: { name: 'Choco Drip', css: 'repeating-linear-gradient(180deg,#5a3220 0 10px,#7d4a2d 10px 20px)', animated: 'drip', season: 1 },
  animFeast: { name: 'Food Fight', css: 'repeating-linear-gradient(45deg,#ff4fa3 0 12px,#ffd23f 12px 24px,#5fdc4a 24px 36px,#29b6f6 36px 48px)', animated: 'pan', season: 1 },
  animGoldenTicket: { name: 'Golden Ticket', css: 'linear-gradient(90deg,#e0a21a,#fff27a,#e0a21a,#fff27a,#e0a21a)', animated: 'shine', season: 1 },
  bossSkull: { name: 'Boss Slayer', css: 'repeating-linear-gradient(90deg,#222 0 12px,#b8282f 12px 24px)', animated: false },
  secretSub: { name: 'Subscribed', css: 'linear-gradient(90deg,#ff0000,#ff4a4a)', animated: 'pan' },
  // Food Season 2nd half: pixel-texture banners (textures come from skin.js --tx-* tiles)
  sprinkleParty: { name: 'Sprinkle Party', css: 'var(--tx-sprinkles) 0 0/48px 48px, linear-gradient(180deg,#ffb8dc,#ff6ab4)', animated: 'pan', season: 1 },
  picnicBanner: { name: 'Picnic Blanket', css: 'var(--tx-gingham) 0 0/24px 24px, #ffffff', animated: 'pan', season: 1 },
  animSoda: { name: 'Soda Fizz', css: 'var(--tx-bubbles-sm) 0 0/48px 72px, linear-gradient(180deg,#ff6a7a,#c8142e 70%,#8a0a1e)', animated: 'rise', season: 1 },
  animChampion: { name: 'Food Champion', css: 'var(--tx-stars) 0 0/96px 96px, linear-gradient(90deg,#e0a21a,#fff27a,#ff4fa3,#fff27a,#e0a21a)', animated: 'shine', season: 1 },
};

export const SWARM_SKINS = {
  wrapperPanther: { name: 'Wrapper Panther', swarm: 'panther', desc: 'Wrapped in a shiny chocolate wrapper.' },
  ketchupClog: { name: 'Ketchup Clog', swarm: 'cloggedToilet', desc: 'Filled to the brim with ketchup.' },
  cartCan: { name: 'Cart Can', swarm: 'trashedCan', desc: 'A trash can on shopping-cart wheels.' },
  goldenWrapperPanther: { name: 'Golden Wrapper', swarm: 'feastablesPanther', desc: 'The rarest wrapper of all.' },
};

export const LAB_SKINS = {
  default: { name: 'Beast Lab', desc: 'The classic futuristic lab.' },
  martLab: { name: 'Beast Mart Lab', desc: 'A supermarket lab with a checkout lane.', season: 1 },
  chocoLab: { name: 'Chocolate Lab', desc: 'Built from chocolate bars. Smells amazing.', season: 1 },
  goldVault: { name: 'Gold Vault', desc: 'Earned by true Lab legends.' },
  mansion: { name: 'Beast Mansion', desc: "Jimmy's mansion, now with a Lab in the basement.", season: 1 },
};

export const CMD_SKINS = {
  // accPlus: extra accessories layered on the Commander's own (see models/characters/accessories.js)
  juanChef: { name: 'Chef Juan', commander: 'juan', hat: { type: 'chef' }, accPlus: ['whisk', { type: 'scarf', color: 0xff4f4f }] },
  juanGold: { name: 'Golden Juan', commander: 'juan', shirt: 0xffd23f, accent: 0xff4fa3, accPlus: [{ type: 'shades', lens: 0x3a2a00 }, { type: 'watch', bezel: 0xffd23f, color: 0xb8860b, side: 'R' }] },
  gold: { name: 'Golden Outfit', commander: '*', shirt: 0xffd23f, coat: 0xffe27a, accPlus: [{ type: 'crown' }, { type: 'chain', pendant: 'star' }] },
  nolanFryCook: { name: 'Fry Cook Nolan', commander: 'nolan', outfit: 'apron', shirt: 0xffd23f, accent: 0xff4a4a, hat: { type: 'cap', color: 0xff4a4a }, accPlus: [{ type: 'nametag', color: 0xff4a4a }, { type: 'headset', mic: true }] },
  headChef: { name: 'Head Chef', commander: '*', outfit: 'apron', shirt: 0xf4f6fb, accent: 0xff4fa3, hat: { type: 'chef' }, accPlus: ['whisk', { type: 'scarf', color: 0xff4fa3 }] },
  jimmyFeast: { name: 'Feastables Jimmy', commander: 'jimmy', outfit: 'hoodie', shirt: 0x1d9bf0, logo: 'panther', accent: 0xff4fa3, accPlus: [{ type: 'capBack', color: 0xff4fa3 }, { type: 'chain', pendant: 'bolt' }] },
};
