// Arena island layout: zone rectangles, the Trophy Road loop, gates and key spots.
// World: x = east, z = south (camera looks north / -z). Ground top at y = 0.
import { ARENAS, arenaById } from '../../data/arena.js';

export const GRID = 128; // terrain cells (1 unit each), covering [-64, 64)
export const HALF = 64;
export const ISLAND = 61; // rough island half-extent

/**
 * Zones. rect = [x0, z0, x1, z1]. `arena` links to ARENAS for trophy gating.
 * gate = where the Trophy Road enters the zone (fence opening), side = fence side.
 */
export const ZONES = [
  {
    id: 'labYard', arena: 'labYard', name: 'Beast Lab Yard', rect: [-16, 16, 16, 56], color: '#29b6f6',
    music: 'map', sub: 'Home sweet Lab', open: true,
  },
  {
    id: 'park', arena: null, name: 'Beast Park', rect: [-15, -24, 15, 12], color: '#5fdc4a',
    music: 'map', sub: 'Trophy Road Central', open: true,
  },
  {
    id: 'suburb', arena: 'suburb', name: 'Suburb of Horrors', rect: [-58, 15, -22, 56], color: '#ff8a2a',
    music: 'map', gate: [-22, 26], side: 'E', sub: 'Mind the mailboxes...',
  },
  {
    id: 'mansion', arena: 'mansion', name: "Jimmy's Mansion", rect: [-58, -28, -22, 10], color: '#ffd23f',
    music: 'title', gate: [-22, -6], side: 'E', sub: 'Everything is gold',
  },
  {
    id: 'techno', arena: 'techno', name: 'Techno Tower', rect: [-14, -60, 14, -30], color: '#5ce1e6',
    music: 'lab', gate: [0, -30], side: 'S', sub: 'Beep boop. Danger.',
  },
  {
    id: 'reactor', arena: 'reactor', name: 'Atomic Reactor', rect: [22, -60, 58, -26], color: '#7cff3a',
    music: 'boss', gate: [22, -36], side: 'W', sub: 'Do NOT lick the barrels',
  },
  {
    id: 'factory', arena: 'factory', name: 'Chocolate Factory', rect: [22, -21, 58, 9], color: '#8e5a3c',
    music: 'dance', gate: [22, -6], side: 'W', sub: 'Smells like victory',
  },
  {
    id: 'mart', arena: 'mart', name: 'Beast Mart', rect: [22, 15, 58, 56], color: '#ff4fa3',
    music: 'map', gate: [22, 30], side: 'W', sub: 'Season 1: FOOD SEASON', open: true, seasonal: true,
  },
];
export const zoneById = (id) => ZONES.find((z) => z.id === id);

/** Inside the Beast Mart building (switch to grocery music). */
export const MART_STORE = [29, 18, 57, 45];

/** Trophy Road: one loop around Beast Park, passing every zone gate in trophy order. */
export const TROPHY_ROAD = [
  [0, 33], [-18, 33], [-18, 26], [-18, -6], [-18, -27], [0, -27], [18, -27], [18, -36], [18, -6], [18, 30], [18, 33], [0, 33],
];
/** Side paths (dirt / stone) - [points, width, type]. */
export const PATHS = [
  [[[0, 33], [0, 44]], 6, 'plaza'],
  [[[-18, 26], [-23, 26]], 3, 'road'],
  [[[-18, -6], [-23, -6]], 3, 'road'],
  [[[0, -27], [0, -31]], 3, 'road'],
  [[[18, -36], [23, -36]], 3, 'road'],
  [[[18, -6], [23, -6]], 3, 'road'],
  [[[18, 30], [24, 30]], 4, 'road'],
  // park footpaths
  [[[-18, 6], [-6, 4], [0, 0]], 2, 'path'],
  [[[18, 6], [8, 4], [0, 0]], 2, 'path'],
  [[[0, -27], [0, -20], [2, -12], [0, 0]], 2, 'path'],
];

/** Pillars on the trophy road for each non-seasonal arena. */
export function roadPillars() {
  const spots = {
    labYard: [-5, 30.2], suburb: [-15.5, 23.5], mansion: [-15.5, -3.5], techno: [-3.5, -24.5],
    reactor: [15.5, -38.5], factory: [15.5, -3.5],
  };
  return ARENAS.filter((a) => !a.seasonal).map((a) => ({ arena: a, pos: spots[a.id] }));
}

export function zoneArena(z) {
  return z.arena ? arenaById(z.arena) : null;
}

export const SPAWN = [0, 42.5];
export const PORTAL_POS = [-9, 38];
export const PRACTICE_POS = [10, 41];
export const LAB_DOOR = [0, 29.6];

export function inRect(x, z, r, pad = 0) {
  return x >= r[0] - pad && x <= r[2] + pad && z >= r[1] - pad && z <= r[3] + pad;
}
export function zoneAt(x, z) {
  // Smaller/specific zones first (mart, etc. don't overlap anyway).
  for (const zn of ZONES) if (inRect(x, z, zn.rect)) return zn;
  return null;
}
