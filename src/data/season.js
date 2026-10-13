// Season 1: FOOD SEASON battle pass. Calories = season XP.
export const SEASON = {
  id: 1,
  name: 'FOOD SEASON',
  tagline: 'Eat. Battle. Repeat.',
  premiumCost: 450, // Beast Bucks
  calPerTier: 150,
  color: '#ff4fa3',
};

// reward types: coins, bucks, vial, swarm, spell, commander, skin (swarm skin), labSkin, cmdSkin, banner, serum (mega form unlock)
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
  { free: { type: 'coins', amount: 600 }, premium: { type: 'card', id: 'chocoChomper' } },
  { free: { type: 'serum', id: 'feastablesPanther' }, premium: { type: 'cmdSkin', id: 'juanGold', commander: 'juan' } },
  { free: { type: 'vial', id: 'testTube' }, premium: { type: 'vial', id: 'hyperchrome' } },
  { free: { type: 'card', id: 'sodaSurge' }, premium: { type: 'skin', id: 'cartCan', swarm: 'trashedCan' } },
  { free: { type: 'bucks', amount: 40 }, premium: { type: 'coins', amount: 1500 } },
  { free: { type: 'vial', id: 'snackPack' }, premium: { type: 'card', id: 'melonMauler' } },
  { free: { type: 'card', id: 'chocoChomper' }, premium: { type: 'labSkin', id: 'chocoLab' } },
  { free: { type: 'coins', amount: 900 }, premium: { type: 'banner', id: 'animFeast' } },
  { free: { type: 'vial', id: 'megaLab' }, premium: { type: 'bucks', amount: 100 } },
  { free: { type: 'card', id: 'melonMauler' }, premium: { type: 'skin', id: 'goldenWrapperPanther', swarm: 'feastablesPanther' } },
  { free: { type: 'coins', amount: 1200 }, premium: { type: 'vial', id: 'cashCase' } },
  { free: { type: 'vial', id: 'cashCase' }, premium: { type: 'banner', id: 'animGoldenTicket' } },
];

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
};

export const CMD_SKINS = {
  juanChef: { name: 'Chef Juan', commander: 'juan', hat: { type: 'chef' } },
  juanGold: { name: 'Golden Juan', commander: 'juan', shirt: 0xffd23f, accent: 0xff4fa3 },
  gold: { name: 'Golden Outfit', commander: '*', shirt: 0xffd23f, coat: 0xffe27a },
};
