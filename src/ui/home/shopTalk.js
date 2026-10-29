// Lines for Lonan, the SHOP's shady seller (Nolan in a fake mustache, badly denying it).
// Short, in character, *emphasis* = gold pop words in the dialogue system.

export const SELLER = { char: 'shadyNolan', name: 'Lonan' };

/** Ambient one-liners (speech bubble) when you walk in or hang around. */
export const AMBIENT = [
  'Psst. Over here. Act natural.',
  'Keep it down. The walls have Swarms.',
  'Fresh stock. Don\'t ask where from.',
  'Nice to meet you. For the first time. Ever.',
  'Everything here is legit. Legit-ish.',
  'You didn\'t see me. Wanna buy something?',
  'This mustache is real. Don\'t pull it.',
  'Jimmy doesn\'t know about this place.',
  'Regular guy. Regular cards. Regular bunker.',
  'Restock is at midnight. I don\'t sleep. I lurk.',
];
export const AMBIENT_GIFT = 'The gift is *free*. Grab it before I change my mind.';
export const AMBIENT_FREEVIAL = 'Free vial on the counter. Not a trap. Probably.';
export const AMBIENT_ALLSOLD = 'You bought the whole counter. Respect.';

/** After a purchase. */
export const BUY = [
  'Pleasure doing business.',
  'Good choice. You didn\'t get it from me.',
  'Sold. No refunds. Read the counter.',
  'Fell off a truck. A very nice truck.',
  'Smooth. You\'re a natural.',
  'Wrap it? No. Enjoy.',
];
export const BUY_KIND = {
  vial: ['Shake it hard. Harder than that.', 'Fresh from the vault. Still warm.'],
  coins: ['Count it later. Not here.', 'Small bills. Well, coins.'],
  legendary: ['Careful. That one bites.'],
  look: ['Looking sharp. Almost as sharp as me.'],
  entrance: ['Now that\'s an entrance. Mine is quieter.'],
};
/** When you can't afford it (after "*40 Bucks* short."). */
export const BROKE = [
  'Come back richer.',
  'I take Bucks. Not promises.',
  'I can count, you know.',
  'Nice try, though.',
  'No Bucks, no deal.',
];
export const BROKE_COINS = ['Win a few battles. Then we talk.', 'Come back richer.', 'I can count, you know.'];
export const SOLD_OUT = ['Gone. Restock is at midnight.', 'Sold out. Like my dignity.'];
export const BELL = ['Don\'t ring that. They\'ll hear us.', 'Shh! Okay. What do you need?'];
export const CRT = ['Hands off. That\'s my security system.', 'Nothing on those screens. Move along.'];
export const REGISTER = ['The register is for me. Your Bucks go in it.'];

// ---------------------------------------------------------------------------
// The conversation

export const OPENERS = [
  'What do you want? I mean, hello, valued customer.',
  'You again. Good. Bring Bucks?',
  'Make it quick. I have a reputation.',
  'Welcome to the stash. Wipe your feet.',
];
export const CHOICES = ['What are you selling?', 'Are you... Nolan?', 'Any discounts?', 'Bye'];

export function sellingLine({ hero, legend, deals }) {
  const out = [`Cards, vials, coins, a few things that glow. Big one today: the *${hero}*.`];
  if (legend) out.push(`I got a *${legend}* on the counter today. Don't ask how.`);
  if (deals) out.push(`*${deals}* deals on the counter. When they're gone, they're gone.`);
  return out;
}
/** "Are you Nolan?" escalates the more you ask. */
export const DENY = [
  'Nolan? Never heard of him. I\'m *Lonan*. Totally different guy.',
  'Nolan is taller. And worse at disguises. Next question.',
  'Look at this mustache. Does Nolan have a mustache? *Exactly.*',
  'Okay. Fine. I\'m... no. No, I\'m not. *Lonan*. With an L.',
  '...Please don\'t tell Jimmy.',
];
export const HAGGLE_THINK = 'Hmm. Hmm hmm. You drive a hard bargain.';
export const haggleLine = (pct, name) => `Fine. *${pct}% off* the ${name}. Today only. Don't tell Jimmy.`;
export const HAGGLE_SMALL = (name) => `Fine. *5% off* the ${name}. Don't spend it all at once.`;
export const HAGGLE_DONE = 'I already gave you a deal today. I have bills. Bunker bills.';
export const HAGGLE_NONE = 'A discount on what? You bought everything.';
export const BYE = ['You were never here.', 'Same time tomorrow. Bring Bucks.', 'Leave through the back. Trust me.'];

/** Pick a line, never the same one twice in a row. */
const last = new Map();
export function pick(list, key = list) {
  if (!list.length) return '';
  let i = Math.floor(Math.random() * list.length);
  if (list.length > 1 && i === last.get(key)) i = (i + 1) % list.length;
  last.set(key, i);
  return list[i];
}
