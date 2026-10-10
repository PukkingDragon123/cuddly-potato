// Props & buildings: battle labs, backdrops, ability props, lab interior,
// grocery and environment pieces. Implementation lives in ./props/*.
import { makeLabBuilding } from './props/lab.js';

export { makeLabBuilding, LEVEL_COLORS } from './props/lab.js';

const labEntry = (style, flip = false, level = 1, dmg = 0) => () => {
  const l = makeLabBuilding({ style, flip });
  l.setLevel(level);
  l.setDamage(dmg);
  l.update(0.1);
  return l.root;
};

export const PROPS = {
  lab_default: labEntry('default', false, 1),
  lab_mansion: labEntry('mansion', false, 3),
  lab_martLab: labEntry('martLab', false, 5),
  lab_mart: labEntry('mart', false, 6),
  lab_chocoLab: labEntry('chocoLab', false, 7),
  lab_goldVault: labEntry('goldVault', false, 8),
  lab_rival: labEntry('rival', true, 4),
};
PROPS.lab_default8 = labEntry('default', false, 8);
PROPS.lab_default_d1 = labEntry('default', false, 4, 0.4);
PROPS.lab_default_d2 = labEntry('default', false, 4, 0.7);
PROPS.lab_default_d3 = labEntry('default', false, 4, 0.95);
PROPS.lab_default_d4 = labEntry('default', false, 4, 1);
PROPS.lab_rival_noflip = labEntry('rival', false, 2);
PROPS.lab_default_flip = labEntry('default', true, 5);
PROPS.lab_mansion_flip = labEntry('mansion', true, 5);
