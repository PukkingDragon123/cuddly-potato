// Online lobby: real-time 1v1 matchmaking over the claude.ai `room` capability.
//
// Everyone with the game open shares the artifact's lobby room. Each page keeps
//   presence.mp = { st: 'idle'|'searching'|'matching'|'playing', since, hb, tr, cmd, lv,
//                   nick, uid, want, inv, acc, dec, vs }
// QUICK MATCH: searchers are sorted by (since, peer) and paired greedily, so every
// page computes the same pairs; a page publishes its partner as `want`, and a pair
// is made only when both `want` each other (two tabs of the same person never pair).
// CHALLENGE: `inv: {to, n}` on the inviter, answered by `acc` / `dec` on the invitee.
// A made pair joins the named room `m-<hash(host|guest|nonce)>` (the lower peer
// label hosts), wraps it in a RoomLink, swaps loadouts and starts mode 'online'.
//
// `window.claude.use('room')` is called lazily (first time the lobby is needed) and
// everything degrades to "offline" when it resolves null (dev server, saved copy).
import { state, perkBonuses, labLevel, equippedMega, lineupSize, currentDeck, deployInfo } from '../game/state.js';
import { commanderCfg, deckEntry } from '../game/battle/loadout.js';
import { SWARMS, VARIANTS, MAX_LEVEL } from '../data/swarms.js';
import { SPELLS } from '../data/spells.js';
import { COMMANDERS, CMD_MAX_LEVEL, PERKS } from '../data/commanders.js';
import { MEGAS } from '../data/megas.js';
import { BANNERS, SWARM_SKINS, CMD_SKINS } from '../data/season.js';
import { ARENAS, currentArena } from '../data/arenas.js';
import { RoomLink, hashName } from './roomNet.js';

const FRESH_MS = 35000; // a searcher whose presence has not changed for this long is ignored
const SEARCH_HB = 10000;
const INVITE_MS = 30000;
const LINK_MS = 12000; // pair made -> the opponent must show up in the match room

let roomP = null;
/** Resolve { room, user } or null. Lazy and memoized; never throws. */
export function getRoom() {
  if (!roomP) {
    roomP = (async () => {
      try {
        if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('mockroom') === '1' && !window.claude?.use) {
          (await import('./mockRoom.js')).installMockRoom();
        }
        const use = window.claude?.use;
        if (typeof use !== 'function') return null;
        const room = await window.claude.use('room');
        if (!room) return null;
        const user = await window.claude.use('user').catch(() => null);
        return { room, user };
      } catch (e) {
        console.warn('room unavailable', e);
        return null;
      }
    })();
  }
  return roomP;
}

// ---------------------------------------------------------------------------
// Untrusted data from other pages: sanitize everything

const ID = /^[A-Za-z0-9_]{1,40}$/;
const clampInt = (v, lo, hi, d = lo) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.round(+v))) : d);
export const cleanNick = (s) => String(s ?? '').replace(/[^A-Za-z0-9 _.\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

/** My side as it travels (compact; ids only). */
export function wireSide() {
  const p = state.p;
  const deck = currentDeck().filter((id) => p.cards[id]).slice(0, lineupSize()).map((id) => {
    const d = deployInfo(id);
    return [id, d.unit, d.level, d.variant, d.skin ?? null];
  });
  const cid = p.commanders.equipped;
  const cs = p.commanders.owned[cid];
  const mg = equippedMega();
  return {
    deck, cmd: [cid, cs?.level ?? 1, cs?.skin ?? null], perks: perkBonuses(), ll: labLevel(), mega: mg ? [mg.id, mg.variant, mg.level] : null,
    ls: p.cosmetics.labSkin === 'default' ? 'default' : p.cosmetics.labSkin, bn: p.cosmetics.banner, tr: p.trophies,
  };
}

/** Turn a received wire side into a battle side config, rejecting anything unknown. */
export function sideFromWire(w, name) {
  w = w && typeof w === 'object' ? w : {};
  const deck = [];
  for (const e of Array.isArray(w.deck) ? w.deck.slice(0, 8) : []) {
    if (!Array.isArray(e)) continue;
    const [id, unit, level, variant, skin] = e;
    if (!ID.test(id) || !(SWARMS[id] || SPELLS[id])) continue;
    const u = ID.test(unit) && (SWARMS[unit] || SPELLS[unit]) ? unit : id;
    deck.push(deckEntry(id, clampInt(level, 1, MAX_LEVEL), {
      unit: u, variant: VARIANTS[variant] ? variant : 'base', skin: typeof skin === 'string' && SWARM_SKINS[skin] && SWARM_SKINS[skin].swarm === u ? skin : null,
    }));
  }
  if (deck.length < 4) for (const id of ['panther', 'trashedCan', 'cloggedToilet', 'foodThrow']) if (deck.length < 4 && !deck.some((c) => c.id === id)) deck.push(deckEntry(id, 1));
  const c = Array.isArray(w.cmd) ? w.cmd : [];
  const cid = COMMANDERS[c[0]] ? c[0] : 'recruit';
  const skin = typeof c[2] === 'string' && CMD_SKINS[c[2]] && (!CMD_SKINS[c[2]].commander || CMD_SKINS[c[2]].commander === cid) ? c[2] : null;
  const perks = {};
  if (w.perks && typeof w.perks === 'object') for (const k of Object.keys(w.perks)) if (PERKS[k]) perks[k] = clampInt(w.perks[k], -50, 60, 0);
  const m = Array.isArray(w.mega) ? w.mega : null;
  const mega = m && MEGAS[m[0]] ? { id: m[0], variant: typeof m[1] === 'string' && ID.test(m[1]) ? m[1] : 'base', level: clampInt(m[2], 1, 20) } : null;
  return {
    name: cleanNick(name) || 'Rival', deck, commander: commanderCfg(cid, clampInt(c[1], 1, CMD_MAX_LEVEL), skin), perks, labLevel: clampInt(w.ll, 1, 20), mega,
    labStyle: typeof w.ls === 'string' && ID.test(w.ls) ? w.ls : 'rival', banner: BANNERS[w.bn] ? w.bn : 'default', trophies: clampInt(w.tr, 0, 99999), ghost: false, online: true,
  };
}

// ---------------------------------------------------------------------------

class Lobby {
  constructor() {
    this.conn = 'idle'; // idle | connecting | on | off
    this.room = null;
    this.user = null;
    this.myId = null;
    this.mode = 'idle'; // idle | searching | matching | playing
    this.since = 0;
    this.want = null;
    this.inv = null; // my outgoing invite { to, n, at }
    this.acc = null; // my answer { to, n }
    this.dec = null;
    this.vs = null;
    this.hb = 0;
    this.fns = new Set();
    this.seenInv = new Map(); // `${peer}:${n}` -> 'open' | 'done'
    this.skip = new Map(); // peer -> until (a pairing that failed)
    this.match = null; // { link, role, partner, ... }
    this.names = {}; // by-id -> resolved display name (render only)
  }

  on(fn) {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
  fire(type, data) {
    for (const fn of [...this.fns]) {
      try { fn(type, data); } catch (e) { console.error('lobby listener', e); }
    }
  }

  /** Connect to the lobby (lazy). Resolves true when online. */
  async connect() {
    if (this.conn === 'on') return true;
    if (this.conn === 'off') return false;
    if (!this.connectP) {
      this.conn = 'connecting';
      this.connectP = getRoom().then(async (r) => {
        if (!r) { this.conn = 'off'; this.fire('conn', 'off'); return false; }
        this.room = r.room;
        this.user = r.user;
        this.myId = this.user ? await this.user.id().catch(() => null) : null;
        this.conn = 'on';
        this.room.onPeers(() => this.evaluate(), (e) => { console.warn('lobby room error', e?.code); this.conn = 'off'; this.fire('conn', 'off'); });
        this.publish();
        this.tick = setInterval(() => this.onTick(), 1000);
        this.fire('conn', 'on');
        return true;
      });
    }
    return this.connectP;
  }

  get myPeer() {
    return this.room?.peers().find((p) => p.sameTab)?.peer ?? null;
  }

  publish() {
    if (!this.room) return;
    const p = state.p;
    const mp = {
      st: this.mode, since: this.since || null, hb: this.hb, tr: p.trophies | 0, cmd: p.commanders.equipped, lv: labLevel(),
      nick: cleanNick(p.name) || 'Player', uid: this.myId, want: this.want, inv: this.inv ? { to: this.inv.to, n: this.inv.n } : null,
      acc: this.acc, dec: this.dec, vs: this.vs,
    };
    this.room.presence({ mp }).catch((e) => console.warn('lobby presence', e?.code, e?.message));
  }

  /** Other players with the game open (one entry per open page), me included. */
  players() {
    if (!this.room) return [];
    return this.room.peers().filter((p) => p.kind === 'viewer' && p.presence?.mp && typeof p.presence.mp === 'object').map((p) => ({
      peer: p.peer, by: p.by, isMe: p.isMe, sameTab: p.sameTab, updatedAt: p.updatedAt, mp: p.presence.mp,
      nick: cleanNick(p.presence.mp.nick) || 'Player', key: p.by ?? (typeof p.presence.mp.uid === 'string' ? p.presence.mp.uid : null),
    }));
  }
  /** Display name for a player: the platform's profile name, else their nickname. */
  async resolveNames(list) {
    const ids = [...new Set(list.map((p) => p.by).filter(Boolean))];
    if (this.user && ids.length) {
      try {
        const ps = await this.user.profiles(ids);
        for (const id of ids) if (ps[id]?.name) this.names[id] = ps[id].name;
      } catch (e) { /* names are optional */ }
    }
    return list.map((p) => ({ ...p, name: (p.by && this.names[p.by]) || p.nick }));
  }
  nameOf(p) {
    return (p?.by && this.names[p.by]) || p?.nick || 'Rival';
  }
  onlineCount() {
    return this.players().length;
  }

  // ---- quick match -------------------------------------------------------
  async search() {
    if (!(await this.connect())) return false;
    if (this.mode === 'searching') return true;
    this.cancelInvite();
    this.mode = 'searching';
    this.since = Date.now();
    this.want = null;
    this.publish();
    this.fire('mode', this.mode);
    this.evaluate();
    return true;
  }
  cancel() {
    if (this.mode === 'searching') {
      this.mode = 'idle';
      this.since = 0;
      this.want = null;
      this.publish();
      this.fire('mode', this.mode);
    }
    this.cancelInvite();
  }
  compatible(a, b) {
    if (a.peer === b.peer) return false;
    if (a.key && b.key && a.key === b.key) return false; // the same person (two tabs) never pairs
    if (a.isMe && b.isMe) return false;
    return true;
  }
  partnerFor(me, list) {
    const now = Date.now();
    const S = list.filter((p) => p.mp.st === 'searching' && typeof p.mp.since === 'number' && (p.sameTab || now - p.updatedAt < FRESH_MS) && !(this.skip.get(p.peer) > now))
      .sort((a, b) => a.mp.since - b.mp.since || (a.peer < b.peer ? -1 : a.peer > b.peer ? 1 : 0));
    const used = new Set();
    for (let i = 0; i < S.length; i++) {
      if (used.has(i)) continue;
      for (let j = i + 1; j < S.length; j++) {
        if (used.has(j) || !this.compatible(S[i], S[j])) continue;
        used.add(i);
        used.add(j);
        if (S[i].peer === me) return S[j];
        if (S[j].peer === me) return S[i];
        break;
      }
    }
    return null;
  }

  // ---- challenges ----------------------------------------------------------
  async challenge(peer) {
    if (!(await this.connect())) return false;
    if (this.mode === 'searching') this.cancel();
    this.inv = { to: peer, n: Math.random().toString(36).slice(2, 8), at: Date.now() };
    this.publish();
    this.fire('inviteSent', { peer });
    return true;
  }
  cancelInvite() {
    if (this.inv) { this.inv = null; this.publish(); }
  }
  accept(inv) {
    this.seenInv.set(inv.peer + ':' + inv.n, 'done');
    if (this.mode === 'searching') { this.mode = 'idle'; this.since = 0; this.want = null; }
    this.acc = { to: inv.peer, n: inv.n };
    this.publish();
    const p = this.players().find((x) => x.peer === inv.peer);
    if (p) this.beginMatch(p, 'c' + inv.n);
  }
  decline(inv) {
    this.seenInv.set(inv.peer + ':' + inv.n, 'done');
    this.dec = { to: inv.peer, n: inv.n };
    this.publish();
    setTimeout(() => { if (this.dec?.n === inv.n) { this.dec = null; this.publish(); } }, 8000);
  }

  // ---- the state machine -----------------------------------------------------
  onTick() {
    if (this.mode === 'searching' && Date.now() - (this.lastHb ?? 0) > SEARCH_HB) {
      this.lastHb = Date.now();
      this.hb++;
      this.publish();
    }
    if (this.inv && Date.now() - this.inv.at > INVITE_MS) {
      this.inv = null;
      this.publish();
      this.fire('inviteExpired');
    }
    this.evaluate();
  }

  evaluate() {
    if (!this.room) return;
    const me = this.myPeer;
    if (!me) return;
    const list = this.players();
    this.fire('peers', list);
    if (this.mode === 'matching' || this.mode === 'playing') return;
    // invites to me
    const open = new Set();
    for (const p of list) {
      const inv = p.mp.inv;
      if (!inv || inv.to !== me || p.sameTab || typeof inv.n !== 'string') continue;
      const key = p.peer + ':' + inv.n;
      open.add(key);
      if (this.seenInv.has(key)) continue;
      this.seenInv.set(key, 'open');
      if (p.isMe) { this.decline({ peer: p.peer, n: inv.n }); continue; } // your own other tab
      this.fire('invite', { peer: p.peer, n: inv.n, by: p.by, nick: p.nick, tr: clampInt(p.mp.tr, 0, 99999), cmd: p.mp.cmd });
    }
    for (const [key, st] of this.seenInv) if (st === 'open' && !open.has(key)) { this.seenInv.set(key, 'done'); this.fire('inviteGone', { key }); }
    // my invite answered?
    if (this.inv) {
      const t = list.find((p) => p.peer === this.inv.to);
      if (!t) { this.inv = null; this.publish(); this.fire('inviteFailed', { why: 'left' }); }
      else if (t.mp.acc?.to === me && t.mp.acc.n === this.inv.n) { const n = this.inv.n; this.inv = null; this.beginMatch(t, 'c' + n); return; }
      else if (t.mp.dec?.to === me && t.mp.dec.n === this.inv.n) { this.inv = null; this.publish(); this.fire('declined', { peer: t.peer, nick: t.nick, by: t.by }); }
    }
    // quick match
    if (this.mode === 'searching') {
      // the partner I wanted saw the pair first and is already joining: follow it
      // (presence is latest-wins, so the moment both 'want' each other can be missed)
      const caller = this.want && list.find((p) => p.peer === this.want && p.mp.st === 'matching' && p.mp.vs === me && typeof p.mp.since === 'number');
      if (caller) {
        const a = Math.min(this.since, caller.mp.since), b = Math.max(this.since, caller.mp.since);
        this.beginMatch(caller, 'q' + a + '.' + b);
        return;
      }
      const partner = this.partnerFor(me, list);
      const w = partner?.peer ?? null;
      if (w !== this.want) { this.want = w; this.publish(); }
      if (partner && partner.mp.want === me) {
        const a = Math.min(this.since, partner.mp.since), b = Math.max(this.since, partner.mp.since);
        this.beginMatch(partner, 'q' + a + '.' + b);
      }
    }
  }

  async beginMatch(partner, nonce) {
    if (this.mode === 'matching' || this.mode === 'playing') return;
    const me = this.myPeer;
    const wasSearching = this.mode === 'searching';
    this.mode = 'matching';
    this.want = wasSearching ? partner.peer : null;
    this.vs = partner.peer;
    this.publish();
    const role = me < partner.peer ? 'host' : 'guest';
    const host = role === 'host' ? me : partner.peer, guest = role === 'host' ? partner.peer : me;
    const mid = hashName(host + '|' + guest + '|' + nonce);
    const name = ('m-' + mid).slice(0, 48);
    const info = { partner, role, name: this.nameOf(partner), by: partner.by, nick: partner.nick, mid };
    this.fire('matching', info);
    let link = null;
    try {
      const named = await this.room.join(name);
      link = new RoomLink(named, partner.peer, mid);
      this.match = { link, ...info };
      // swap loadouts; the host picks the arena and says go
      link.send({ t: 'hi', side: wireSide(), nick: cleanNick(state.p.name) });
      // everything the opponent says before the battle scene listens is kept for it
      const early = [];
      const offEarly = link.on((m) => early.push(m));
      const waitMsg = (t) => new Promise((res, rej) => {
        const hit = early.find((m) => m?.t === t);
        if (hit) return res(hit);
        const to = setTimeout(() => { off(); rej(new Error('timeout')); }, LINK_MS);
        const off = link.on((m) => { if (m?.t === t) { clearTimeout(to); off(); res(m); } });
        link.onClose(() => { clearTimeout(to); rej(new Error('closed')); });
      });
      const remoteP = waitMsg('hi');
      link.release();
      const remote = await remoteP;
      await this.resolveNames([partner]);
      const side = sideFromWire(remote.side, this.nameOf({ by: partner.by, nick: cleanNick(remote.nick) || partner.nick }));
      let arena;
      if (role === 'host') {
        // the lower-trophy player's arena: both have it unlocked
        const tr = Math.min(state.p.trophies, side.trophies);
        arena = currentArena(tr).id;
        link.send({ t: 'go', arena });
      } else {
        const go = await waitMsg('go');
        arena = ARENAS.some((a) => a.id === go.arena) ? go.arena : ARENAS[0].id;
      }
      // hand over to the battle scene: hold anything that arrives until it listens
      link.hold();
      offEarly();
      const late = early.filter((m) => m?.t !== 'hi' && m?.t !== 'go');
      link.queue.unshift(...late.map((m) => [m, 'r']));
      if (this.mode !== 'matching') { link.close(); return; } // cancelled meanwhile
      this.mode = 'playing';
      this.acc = null;
      this.publish();
      this.match = { ...this.match, remote: side, arena };
      this.fire('ready', this.match);
    } catch (e) {
      console.warn('match failed', e?.message);
      link?.close();
      this.match = null;
      this.skip.set(partner.peer, Date.now() + 30000);
      this.vs = null;
      this.want = null;
      this.acc = null;
      this.mode = wasSearching ? 'searching' : 'idle';
      if (wasSearching) this.since = this.since || Date.now();
      this.publish();
      this.fire('matchFailed', { why: e?.message });
      this.fire('mode', this.mode);
    }
  }
  /** Abort a pending pairing (UI cancel during the handshake). */
  abortMatch() {
    if (this.mode === 'matching') {
      this.mode = 'idle';
      this.match?.link?.close();
      this.match = null;
      this.vs = null;
      this.publish();
      this.fire('mode', this.mode);
    }
  }
  /** The battle is over (or never started): back to idle in the lobby. */
  endMatch() {
    this.match?.link?.close();
    this.match = null;
    this.mode = 'idle';
    this.since = 0;
    this.vs = null;
    this.acc = null;
    this.want = null;
    this.publish();
    this.fire('mode', this.mode);
  }
}

export const lobby = new Lobby();
if (typeof window !== 'undefined') window.__lobby = lobby;
