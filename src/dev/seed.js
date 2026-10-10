// Dev helper: ?seed=1 (basic) or ?seed=all gives a populated profile for testing.
import { state, grantSwarm, grantSpell, grantCommander, addVial, unlockMega } from '../game/state.js';
import { COLLECTABLE } from '../data/swarms.js';
import { SPELLS } from '../data/spells.js';

export function seedProfile(level = '1') {
  const p = state.p;
  p.tutorial = 'done';
  p.coins = Math.max(p.coins, 5000);
  p.bucks = Math.max(p.bucks, 500);
  grantSwarm('panther', 5);
  grantSwarm('cloggedToilet', 3);
  grantSpell('foodThrow');
  grantSpell('moneyDrop');
  if (level === 'all') {
    p.trophies = p.bestTrophies = 900;
    p.calories = 2400;
    for (const s of COLLECTABLE) grantSwarm(s.id, 6, Math.random() < 0.15 ? 'gold' : 'base');
    for (const id of Object.keys(SPELLS)) grantSpell(id);
    for (const id of ['jimmy', 'nolan', 'juan']) grantCommander(id);
    p.commanders.owned.juan.level = 6;
    p.commanders.equipped = 'juan';
    unlockMega('feastablesPanther');
    p.deck = ['panther', 'cloggedToilet', 'trashedCan', 'mutantMailbox', 'burgerBrute', 'chocoChomper'];
    p.spells.equipped = ['foodThrow', 'moneyDrop', 'sodaRocket'];
    addVial('lab');
    addVial('food');
    addVial('mega');
  }
  state.save();
}
