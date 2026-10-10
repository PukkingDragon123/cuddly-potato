// Props & buildings: battle labs, backdrops, ability props, lab interior,
// grocery and environment pieces. Implementation lives in ./props/*.
// Every factory builds its voxel geometry once (module caches) and reuses it.
import { makeLabBuilding } from './props/lab.js';
import {
  makeBriefcase, makeMoneyBag, makeTruck, makeFootball, makeSubscribeButton, makeSodaRocket, makeBeaker, makeFood, FOOD_KINDS,
} from './props/abilities.js';
import {
  makeTank, makeConsole, makeComputer, makePipes, makeLabDesk, makeMug, makeLabShelf, makeVialRack, makeLabDoor,
  makeMonitorWall, makeFloorTiles, makeWallPanel,
} from './props/interior.js';
import {
  makeShelf, makeCart, makeCheckout, makeFreezer, makeProduceStand, makeAisleSign, makeCartCorral, makeMartFront,
} from './props/grocery.js';
import {
  makeTree, makeRock, makeBush, makeFlowers, makeFence, makeLamp, makeMailbox, makeHouse, makeMansion, makeTechnoTower,
  makeReactor, makeFactory, makeGoldenStatue, makePortal, makeTrophyPodium, makeCrate, makeBarrel, makeCone, makeBench,
  makeSignpost, makeBossGate,
} from './props/environment.js';
import { makeBattleBackdrop, BACKDROP_THEMES } from './props/backdrops.js';

export { makeLabBuilding, LEVEL_COLORS } from './props/lab.js';
export {
  makeBriefcase, makeMoneyBag, makeTruck, makeFootball, makeSubscribeButton, makeSodaRocket, makeBeaker, makeFood, FOOD_KINDS,
} from './props/abilities.js';
export {
  makeTank, makeConsole, makeComputer, makePipes, makeLabDesk, makeMug, makeLabShelf, makeVialRack, makeLabDoor,
  makeMonitorWall, makeFloorTiles, makeWallPanel,
} from './props/interior.js';
export {
  makeShelf, makeCart, makeCheckout, makeFreezer, makeProduceStand, makeAisleSign, makeCartCorral, makeMartFront,
} from './props/grocery.js';
export {
  makeTree, makeRock, makeBush, makeFlowers, makeFence, makeLamp, makeMailbox, makeHouse, makeMansion, makeTechnoTower,
  makeReactor, makeFactory, makeGoldenStatue, makePortal, makeTrophyPodium, makeCrate, makeBarrel, makeCone, makeBench,
  makeSignpost, makeBossGate,
} from './props/environment.js';
export { makeBattleBackdrop, BACKDROP_THEMES } from './props/backdrops.js';

// Attach an animation hook so previews can tick animated props.
const withUpdate = (o) => {
  if (o.update && o.root) o.root.userData.update = o.update;
  return o.root;
};
const labEntry = (style, flip = false, level = 1) => () => {
  const l = makeLabBuilding({ style, flip });
  l.setLevel(level);
  l.update(0.1);
  l.root.userData.update = (dt) => l.update(dt);
  return l.root;
};

/** Zero-arg factories for every prop (dev preview: ?dev=props[&id=a,b]). */
export const PROPS = {
  // battle labs
  lab_default: labEntry('default', false, 1),
  lab_mansion: labEntry('mansion', false, 3),
  lab_martLab: labEntry('martLab', false, 4),
  lab_mart: labEntry('mart', false, 5),
  lab_chocoLab: labEntry('chocoLab', false, 6),
  lab_goldVault: labEntry('goldVault', false, 8),
  lab_rival: labEntry('rival', true, 2),
  // ability props
  briefcase: () => { const b = makeBriefcase(); b.open(0.75); return b.root; },
  moneyBag: () => makeMoneyBag(),
  truck: () => makeTruck().root,
  football: () => makeFootball(),
  subscribeButton: () => makeSubscribeButton(),
  sodaRocket: () => makeSodaRocket(),
  beaker: () => makeBeaker(0x7cff3a),
  beaker_pink: () => makeBeaker(0xff2e88),
  ...Object.fromEntries(FOOD_KINDS.map((k) => ['food_' + k, () => makeFood(k)])),
  // lab interior
  tank: () => withUpdate(makeTank()),
  console: () => makeConsole(),
  computer: () => makeComputer(),
  pipes: () => makePipes(4),
  labDesk: () => makeLabDesk(),
  mug: () => makeMug(),
  labShelf: () => makeLabShelf(),
  vialRack: () => makeVialRack(),
  labDoor: () => makeLabDoor(),
  monitorWall: () => makeMonitorWall(),
  floorTiles: () => makeFloorTiles(6, 4),
  wallPanel: () => makeWallPanel(4, 3),
  // grocery
  shelf_mixed: () => makeShelf({ length: 4, kind: 'mixed' }).root,
  shelf_chocolate: () => makeShelf({ length: 3, kind: 'chocolate' }).root,
  shelf_cereal: () => makeShelf({ length: 3, kind: 'cereal' }).root,
  shelf_drinks: () => makeShelf({ length: 3, kind: 'drinks' }).root,
  shelf_produce: () => makeShelf({ length: 3, kind: 'produce' }).root,
  shelf_snacks: () => makeShelf({ length: 3, kind: 'snacks' }).root,
  cart: () => makeCart().root,
  checkout: () => makeCheckout(1),
  freezer: () => makeFreezer(),
  produceStand: () => makeProduceStand(),
  aisleSign: () => makeAisleSign(0x29b6f6, '3'),
  cartCorral: () => makeCartCorral(),
  martFront: () => makeMartFront(),
  // environment
  tree_round: () => makeTree('round'),
  tree_pine: () => makeTree('pine'),
  tree_palm: () => makeTree('palm'),
  rock: () => makeRock(1),
  bush: () => makeBush(),
  flowers: () => makeFlowers(),
  fence: () => makeFence(3),
  lamp: () => makeLamp(),
  mailbox: () => makeMailbox(),
  house: () => makeHouse(0x8fd0ff),
  house_orange: () => makeHouse(0xffb46a),
  mansion: () => makeMansion(),
  technoTower: () => makeTechnoTower(),
  reactor: () => makeReactor(),
  factory: () => makeFactory(),
  goldenStatue: () => makeGoldenStatue(),
  portal: () => withUpdate(makePortal(0x29b6f6)),
  trophyPodium: () => makeTrophyPodium(),
  crate: () => makeCrate(),
  barrel: () => makeBarrel(),
  cone: () => makeCone(),
  bench: () => makeBench(),
  signpost: () => makeSignpost(0xff2e88),
  bossGate: () => withUpdate(makeBossGate(0xb05cff)),
  // battle backdrops (big!)
  ...Object.fromEntries(BACKDROP_THEMES.map((t) => ['backdrop_' + t, () => withUpdate(makeBattleBackdrop(t))])),
};
