// Chibi character appearance definitions (used for Commanders and NPCs).
export const CHARACTERS = {
  jimmy: {
    id: 'jimmy', name: 'Jimmy', skin: 0xf2c4a2, eyeColor: 0x3d7fd8,
    hair: { style: 'jimmy', color: 0x6b4428 }, beard: 0x6b4428,
    outfit: 'labcoat', coat: 0xf4f6fb, shirt: 0x17171f, logo: 'panther', pants: 0x2d3650, shoes: 0xf2f2f2, accent: 0x29b6f6,
    color: '#29b6f6',
  },
  jimmyBoss: {
    id: 'jimmyBoss', name: 'Jimmy', skin: 0xf2c4a2, eyeColor: 0x3d7fd8,
    hair: { style: 'jimmy', color: 0x6b4428 }, beard: 0x6b4428,
    outfit: 'suit', shirt: 0x1d9bf0, logo: 'panther', pants: 0x1a2040, shoes: 0x111111, accent: 0xff2e88,
    color: '#29b6f6',
  },
  nolan: {
    id: 'nolan', name: 'Nolan', skin: 0xf5cfae, eyeColor: 0x4a8a5a,
    hair: { style: 'messy', color: 0xc89a5a },
    outfit: 'hoodie', shirt: 0xffd23f, pants: 0x3a4a6a, shoes: 0xff4a4a,
    color: '#ffd23f',
  },
  juan: {
    id: 'juan', name: 'Juan', skin: 0xc98d62, eyeColor: 0x3a2618,
    hair: { style: 'undercut', color: 0x1c1410 }, beard: 0x1c1410, beardStyle: 'chin',
    outfit: 'jersey', shirt: 0x1f9e4a, accent: 0xffffff, pants: 0x1a1a28, shoes: 0xffffff, chain: true, shorts: false,
    color: '#1f9e4a',
  },
  recruit: {
    id: 'recruit', name: 'You', skin: 0xf0c09c, eyeColor: 0x2a2a4a,
    hair: { style: 'spiky', color: 0xff8a2a },
    outfit: 'labcoat', coat: 0xeaf6ff, shirt: 0x29b6f6, pants: 0x2d3650, shoes: 0x29b6f6, accent: 0xff2e88,
    hat: { type: 'goggles' },
    color: '#ff8a2a',
  },
  labTech: {
    id: 'labTech', name: 'Lab Tech', skin: 0xe8b48e, eyeColor: 0x2a2a4a,
    hair: { style: 'bob', color: 0x2a2a3a },
    outfit: 'labcoat', coat: 0xf4f6fb, shirt: 0xb05cff, pants: 0x3a3a50, shoes: 0x333333,
    hat: { type: 'goggles' }, color: '#b05cff',
  },
  cashier: {
    id: 'cashier', name: 'Cashier Cass', skin: 0xb07a52, eyeColor: 0x2a1a10,
    hair: { style: 'ponytail', color: 0x2a1a10 },
    outfit: 'apron', shirt: 0x29b6f6, accent: 0xff4f4f, pants: 0x2d3650, shoes: 0x222222,
    hat: { type: 'cap', color: 0xff4f4f }, color: '#ff4f4f',
  },
  stocker: {
    id: 'stocker', name: 'Stocker Stan', skin: 0xf0c09c, eyeColor: 0x2a2a4a,
    hair: { style: 'buzz', color: 0x8a5a2a },
    outfit: 'apron', shirt: 0x5fdc4a, accent: 0xff8a2a, pants: 0x2d3650, shoes: 0x222222, color: '#5fdc4a',
  },
  guard: {
    id: 'guard', name: 'Guard Gus', skin: 0x8a5a3a, eyeColor: 0x1a1010,
    hair: { style: 'buzz', color: 0x111111 },
    outfit: 'suit', shirt: 0x111122, accent: 0x333344, pants: 0x111122, shoes: 0x111111,
    hat: { type: 'cap', color: 0x222233 }, color: '#8a93b8',
  },
  fan: {
    id: 'fan', name: 'Super Fan', skin: 0xf0c09c, eyeColor: 0x2a2a4a,
    hair: { style: 'short', color: 0xffd23f },
    outfit: 'hoodie', shirt: 0x29b6f6, logo: 'panther', pants: 0x2d3650, shoes: 0xff2e88,
    hat: { type: 'beanie', color: 0xff2e88 }, color: '#ff2e88',
  },
};

export function speaker(id) {
  const c = CHARACTERS[id];
  return { name: c?.name ?? id, color: c?.color };
}
