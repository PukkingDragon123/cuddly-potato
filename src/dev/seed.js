// Dev helper: ?seed=1 (fresh player past the tutorial), ?seed=mid (~900 trophies)
// or ?seed=all (everything unlocked) gives a populated profile for testing.
import { state, grantCard, grantCommander, addVial, unlockMega, setDeck, grantMega, equipMega } from '../game/state.js';
import { MEGA_IDS } from '../data/megas.js';
import { ALL_CARDS, STARTER_DECK, STARTER_TROOPS } from '../data/cards.js';

export function seedProfile(level = '1') {
  const p = state.p;
  p.tutorial = 'done';
  p.name = p.name === 'Recruit' ? 'LabHero' : p.name;
  p.coins = Math.max(p.coins, 5000);
  p.bucks = Math.max(p.bucks, 500);
  // seed=1 is a fresh Commander: just the two starter troops
  const start = level === '1' ? STARTER_TROOPS : STARTER_DECK;
  for (const id of start) grantCard(id, 4);
  setDeck(start.slice());
  if (level === 'mid' || level === 'all') {
    const tro = level === 'all' ? 3600 : 900;
    p.trophies = p.bestTrophies = Math.max(p.trophies, tro);
    p.calories = 2400;
    for (const c of ALL_CARDS) {
      if (level === 'mid' && !['lab', 'circle', 'factory'].includes(c.arena)) continue;
      grantCard(c.id, 12);
      if (p.cards[c.id]) p.cards[c.id].level = Math.max(p.cards[c.id].level, level === 'all' ? 7 : 4);
    }
    for (const id of ['jimmy', 'nolan', 'juan']) grantCommander(id);
    p.commanders.owned.jimmy.level = 6;
    p.commanders.equipped = 'jimmy';
    if (level === 'all') unlockMega('feastablesPanther');
    // MEGA-TECH figures: Panthar at mid, the whole set (one Metallic Gold) at all
    if (level === 'mid') grantMega('panthar', 'base');
    else MEGA_IDS.forEach((id, i) => grantMega(id, i === 1 ? 'gold' : 'base'));
    equipMega('panthar');
    setDeck(['panther', 'cloggedToilet', 'steelPanther', 'fryFiend', 'beastTiger', 'pizzaSlicer', 'foodThrow', 'moneyDrop'].filter((id) => p.cards[id]));
    addVial('labPack');
    addVial('megaLab');
    addVial('testTube');
  }
  state.save();
}
