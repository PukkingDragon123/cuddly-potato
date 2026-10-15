// Chibi character appearance definitions (used for Commanders and NPCs).
//
// Fields (all optional): skin, eyeColor, brow, freckles, stubble (true | hex: jaw shadow on the face),
//   lashes (feminine face: lash line + wing, softer brows, blush on by default), blush,
//   hair: { style: jimmy|messy|undercut|spiky|bob|ponytail|buzz|curly|short|bald, color, tie },
//   beard (colour), beardStyle: full|chin|stubble,
//   outfit: labcoat|hoodie|jersey|apron|suit|vest|mech|tee, glow (mech accents), shirt, coat, sleeve, accent, pants, shorts, socks,
//   shoes, sole, laces, gloves, logo: panther|bolt|beast, number (jersey),
//   hat: { type, color, logo } (legacy, = one accessory), chain: true (legacy),
//   acc: [accessory | { type, ...opts }]  -> see models/characters/accessories.js
//     hats: cap capBack beanie chef crown headband goggles hardhat partyhat tophat helmet (visor: 'down')
//     face: glasses shades shadesUp headset headphones earpiece earring
//     torso: jetpack chain badge nametag bowtie tie whistle backpack radio pens scarf neckphones medal cape
//     arms/hands: watch wristband armband clipboard phone mic whisk
export const CHARACTERS = {
  jimmy: {
    id: 'jimmy', name: 'Jimmy', skin: 0xf2c4a2, eyeColor: 0x3d7fd8,
    hair: { style: 'jimmy', color: 0x6b4428 }, beard: 0x6b4428,
    outfit: 'labcoat', coat: 0xf4f6fb, shirt: 0x17171f, logo: 'panther', pants: 0x2d3650, shoes: 0xf2f2f2, accent: 0x29b6f6,
    acc: ['watch', { type: 'badge', color: 0x29b6f6 }],
    color: '#29b6f6',
  },
  jimmyBoss: {
    id: 'jimmyBoss', name: 'Jimmy', skin: 0xf2c4a2, eyeColor: 0x3d7fd8,
    hair: { style: 'jimmy', color: 0x6b4428 }, beard: 0x6b4428,
    outfit: 'suit', shirt: 0x1d9bf0, logo: 'panther', pants: 0x1a2040, shoes: 0x111111, accent: 0xff2e88,
    acc: ['shadesUp', { type: 'watch', bezel: 0xffd23f, color: 0x8a6a10 }, { type: 'chain', pendant: 'bolt' }],
    color: '#29b6f6',
  },
  nolan: {
    id: 'nolan', name: 'Nolan', skin: 0xf5cfae, eyeColor: 0x4a8a5a, freckles: true,
    hair: { style: 'messy', color: 0xc89a5a },
    outfit: 'hoodie', shirt: 0xffd23f, accent: 0xff4a4a, logo: 'bolt', pants: 0x3a4a6a, shoes: 0xff4a4a,
    acc: [{ type: 'neckphones', accent: 0xff4a4a }, { type: 'wristband', color: 0xff4a4a, side: 'R' }],
    color: '#ffd23f',
  },
  juan: {
    id: 'juan', name: 'Juan', skin: 0xc98d62, eyeColor: 0x3a2618,
    hair: { style: 'undercut', color: 0x1c1410 }, beard: 0x1c1410, beardStyle: 'chin', stubble: true,
    outfit: 'jersey', shirt: 0x1f9e4a, accent: 0xffffff, number: 10, pants: 0x1a1a28, shoes: 0xffffff, chain: true, shorts: false,
    acc: [{ type: 'wristband', color: 0xffffff }, 'earring'],
    color: '#1f9e4a',
  },
  recruit: {
    // the Lab Recruit (you): armoured space exosuit with jet boots and thrusters. The helmet is
    // sealed (opaque tinted visor), so the Recruit never shows a face - it's you behind the glass.
    id: 'recruit', name: 'You', skin: 0xf0c09c, eyeColor: 0x2a6ab8,
    hair: { style: 'spiky', color: 0xff8a2a },
    outfit: 'mech', coat: 0xeef2f8, shirt: 0x26304a, pants: 0x26304a, shoes: 0xeef2f8, accent: 0xff2e88, gloves: 0x3a4256, glow: 0x3fd2ee,
    acc: [{ type: 'helmet', color: 0xeef2f8, visor: 'sealed' }, 'jetpack'],
    color: '#ff8a2a',
  },
  labTech: {
    id: 'labTech', name: 'Lab Tech', skin: 0xe8b48e, eyeColor: 0x2a2a4a, lashes: true,
    hair: { style: 'bob', color: 0x2a2a3a },
    outfit: 'labcoat', coat: 0xf4f6fb, shirt: 0xb05cff, pants: 0x3a3a50, shoes: 0x333333, gloves: 0xb58cff,
    hat: { type: 'goggles', lens: 0xc89bff },
    acc: ['clipboard', { type: 'badge', color: 0xb05cff, header: 0xb05cff }],
    color: '#b05cff',
  },
  cashier: {
    id: 'cashier', name: 'Cashier Cass', skin: 0xb07a52, eyeColor: 0x2a1a10, lashes: true,
    hair: { style: 'ponytail', color: 0x2a1a10, tie: 0xffd23f },
    outfit: 'apron', shirt: 0x29b6f6, accent: 0xff4f4f, pants: 0x2d3650, shoes: 0x222222,
    hat: { type: 'cap', color: 0xff4f4f },
    acc: [{ type: 'headset', mic: true }, 'nametag'],
    color: '#ff4f4f',
  },
  stocker: {
    id: 'stocker', name: 'Stocker Stan', skin: 0xf0c09c, eyeColor: 0x2a2a4a, beard: 0x8a5a2a, beardStyle: 'stubble',
    hair: { style: 'buzz', color: 0x8a5a2a },
    outfit: 'apron', shirt: 0x5fdc4a, accent: 0xff8a2a, pants: 0x2d3650, shoes: 0x6a4a2a, gloves: 0xd8b070,
    acc: [{ type: 'capBack', color: 0x5fdc4a }, { type: 'nametag', color: 0xff8a2a }, 'pens'],
    color: '#5fdc4a',
  },
  guard: {
    id: 'guard', name: 'Guard Gus', skin: 0x8a5a3a, eyeColor: 0x1a1010, beard: 0x111111, beardStyle: 'stubble',
    hair: { style: 'buzz', color: 0x111111 },
    outfit: 'suit', shirt: 0x111122, accent: 0x333344, pants: 0x111122, shoes: 0x111111,
    hat: { type: 'cap', color: 0x222233, logo: 'star', logoColor: 0xffd23f },
    acc: ['shades', 'earpiece', 'radio'],
    color: '#8a93b8',
  },
  fan: {
    id: 'fan', name: 'Super Fan', skin: 0xf0c09c, eyeColor: 0x2a2a4a, freckles: true,
    hair: { style: 'short', color: 0xffd23f },
    outfit: 'hoodie', shirt: 0x29b6f6, logo: 'panther', pants: 0x2d3650, shoes: 0xff2e88, accent: 0xff2e88,
    hat: { type: 'beanie', color: 0xff2e88 },
    acc: [{ type: 'cape', color: 0xff2e88, logoColor: 0xffd23f }, { type: 'glasses', color: 0x29b6f6 }, 'phone'],
    color: '#ff2e88',
  },
};

export function speaker(id) {
  const c = CHARACTERS[id];
  return { name: c?.name ?? id, color: c?.color };
}
