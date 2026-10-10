// In-battle Lab energy levels (tap the Lab to upgrade during a match).
export const LAB_LEVELS = [
  { max: 220, regen: 14, upCost: 70 },
  { max: 330, regen: 20, upCost: 130 },
  { max: 460, regen: 27, upCost: 210 },
  { max: 610, regen: 35, upCost: 300 },
  { max: 780, regen: 44, upCost: 410 },
  { max: 980, regen: 54, upCost: 540 },
  { max: 1200, regen: 65, upCost: 700 },
  { max: 1450, regen: 78, upCost: null },
];

// Lab building styles for battles (visual only).
export const LAB_STYLES = {
  default: { name: 'Beast Lab' },
  mansion: { name: "Jimmy's Mansion Lab" },
  martLab: { name: 'Beast Mart Lab' },
  mart: { name: 'Checkout Fortress' },
  chocoLab: { name: 'Chocolate Lab' },
  goldVault: { name: 'Gold Vault' },
  rival: { name: 'Rival Lab' },
};
