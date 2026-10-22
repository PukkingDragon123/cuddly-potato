// DEV ONLY (?mockroom=1): an in-browser stand-in for the claude.ai `room` and
// `user` capabilities, so two tabs / Playwright pages of the same origin can
// find each other and play online battles without the platform.
//
// Transport: BroadcastChannel (localStorage `storage` events as a fallback).
// Emulates: the lobby + named rooms (join/leave), presence (merged, 4 KiB
// limit, coalesced ~30/s, handed to newcomers, cleared on leave), emit/on
// (4 KiB limit, own echo, `not_permitted` for viewers), peers()/onPeers()
// (joined/left/updated, at most one delivery per frame), connected().
//
// URL knobs: mockuser=<id> (default: one per tab), mockname=<display name>,
// mockrole=viewer (no emits: presence-only path), mockdrop=0.3 (drop that share
// of emits), mocklag=120 (ms delivery delay). In-page: window.__mockRoom
// .drop() (simulate a dead connection), .restore(), .kill() (tab gone).
const q = new URLSearchParams(location.search);
const CH = 'swarmers-mockroom';
const LIMIT = 4096;
const enc = new TextEncoder();
const size = (o) => enc.encode(JSON.stringify(o)).length;
const rid = () => Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 8);
const err = (code, message) => Object.assign(new Error(message), { code, message });

function ss(key, make) {
  try {
    let v = sessionStorage.getItem(key);
    if (!v) { v = make(); sessionStorage.setItem(key, v); }
    return v;
  } catch (e) { return make(); }
}

export function installMockRoom() {
  if (window.claude?.use) return;
  const myPeer = rid();
  const myUser = q.get('mockuser') || ss('mockroom.user', () => 'u_' + rid());
  const myName = q.get('mockname') || '';
  const viewer = q.get('mockrole') === 'viewer';
  const dropRate = +(q.get('mockdrop') || 0);
  const lag = +(q.get('mocklag') || 0);
  // display names travel through localStorage (the platform's directory)
  const names = () => { try { return JSON.parse(localStorage.getItem('mockroom.names') || '{}'); } catch (e) { return {}; } };
  if (myName) try { localStorage.setItem('mockroom.names', JSON.stringify({ ...names(), [myUser]: myName })); } catch (e) { /* ignore */ }

  let alive = true, linkUp = true;
  const rooms = new Map(); // name ('' = lobby) -> room state
  let bc = null;
  const post = (msg) => {
    if (!alive || !linkUp) return;
    msg.from = myPeer;
    msg.by = myUser;
    if (bc) bc.postMessage(msg);
    else try { localStorage.setItem('mockroom.msg', JSON.stringify({ ...msg, n: rid() })); } catch (e) { /* ignore */ }
  };
  const receive = (msg) => {
    if (!alive || !linkUp || !msg || msg.from === myPeer) return;
    const go = () => handle(msg);
    if (lag) setTimeout(go, lag * (0.6 + Math.random() * 0.8));
    else go();
  };
  if (typeof BroadcastChannel !== 'undefined') {
    bc = new BroadcastChannel(CH);
    bc.onmessage = (e) => receive(e.data);
  } else {
    window.addEventListener('storage', (e) => { if (e.key === 'mockroom.msg' && e.newValue) receive(JSON.parse(e.newValue)); });
  }

  function makeRoom(name) {
    const R = {
      name, joined: true, peers: new Map(), mine: {}, snapshot: Object.freeze([]), dirty: true,
      peerFns: new Set(), topicFns: new Map(), connFns: new Set(),
      pend: { joined: new Map(), left: new Map(), updated: new Map() }, first: true, presT: 0,
    };
    const self = () => ({ peer: myPeer, by: myUser, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...R.mine }), updatedAt: Date.now() });
    R.peers.set(myPeer, self());
    R.pend.joined.set(myPeer, R.peers.get(myPeer));
    R.setSelf = () => { const p = self(); R.peers.set(myPeer, p); R.mark('updated', p); };
    R.mark = (kind, p) => {
      R.dirty = true;
      if (kind === 'left') { R.pend.joined.delete(p.peer); R.pend.updated.delete(p.peer); R.pend.left.set(p.peer, p); }
      else if (kind === 'joined') { R.pend.left.delete(p.peer); R.pend.joined.set(p.peer, p); }
      else if (!R.pend.joined.has(p.peer)) R.pend.updated.set(p.peer, p);
      if (!R.flushT) R.flushT = setTimeout(R.flush, 16);
    };
    R.flush = () => {
      R.flushT = 0;
      if (!R.joined) return;
      R.snapshot = Object.freeze([...R.peers.values()]);
      const ch = { peers: R.snapshot, joined: Object.freeze([...R.pend.joined.values()]), left: Object.freeze([...R.pend.left.values()]), updated: Object.freeze([...R.pend.updated.values()]) };
      R.pend = { joined: new Map(), left: new Map(), updated: new Map() };
      if (!ch.joined.length && !ch.left.length && !ch.updated.length) return;
      for (const fn of R.peerFns) try { fn(ch); } catch (e) { console.error(e); }
    };
    R.sendPres = () => {
      // coalesce to ~30/s, whole object
      if (R.presT) return;
      R.presT = setTimeout(() => { R.presT = 0; if (R.joined) post({ k: 'pres', room: name, p: R.mine }); }, 33);
    };
    const api = {
      name,
      emit(topic, data) {
        if (!R.joined) return Promise.reject(err('invalid_argument', 'left this room'));
        if (!/^[a-z][a-z0-9_.-]{0,47}$/.test(topic)) return Promise.reject(err('invalid_argument', 'bad topic'));
        if (viewer) return Promise.reject(err('not_permitted', 'viewers may not send on ' + topic));
        if (data !== undefined && size(data) > LIMIT) return Promise.reject(err('invalid_argument', 'data over 4096 bytes: ' + size(data)));
        if (!linkUp) return Promise.resolve();
        post({ k: 'emit', room: name, topic, data });
        // own echo
        const msg = Object.freeze({ peer: myPeer, by: myUser, isMe: true, sameTab: true, kind: 'viewer', guest: false, topic, data });
        setTimeout(() => { for (const fn of R.topicFns.get(topic) || []) fn(msg); }, 0);
        return Promise.resolve();
      },
      on(topic, fn) {
        if (typeof fn !== 'function') throw new TypeError('handler');
        if (!R.topicFns.has(topic)) R.topicFns.set(topic, new Set());
        R.topicFns.get(topic).add(fn);
        return () => R.topicFns.get(topic)?.delete(fn);
      },
      presence(patch) {
        if (!R.joined) return Promise.reject(err('invalid_argument', 'left this room'));
        const next = { ...R.mine };
        for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
        const n = size(next);
        if (n > LIMIT) return Promise.reject(err('invalid_argument', 'presence over 4096 bytes: ' + n));
        R.mine = JSON.parse(JSON.stringify(next));
        R.setSelf();
        R.sendPres();
        return Promise.resolve();
      },
      peers: () => R.snapshot,
      onPeers(fn) {
        R.peerFns.add(fn);
        // first delivery: the room so far, as joined
        setTimeout(() => {
          if (!R.peerFns.has(fn)) return;
          const all = Object.freeze([...R.peers.values()]);
          R.snapshot = all;
          fn({ peers: all, joined: all, left: Object.freeze([]), updated: Object.freeze([]) });
        }, 0);
        return () => R.peerFns.delete(fn);
      },
      connected: () => alive && linkUp,
      onConnection(fn) {
        R.connFns.add(fn);
        setTimeout(() => R.connFns.has(fn) && fn(alive && linkUp), 0);
        return () => R.connFns.delete(fn);
      },
      leave() {
        if (R.joined) {
          post({ k: 'bye', room: name });
          R.joined = false;
          R.peerFns.clear();
          R.topicFns.clear();
          R.connFns.clear();
          rooms.delete(name);
        }
        return Promise.resolve();
      },
    };
    R.api = api;
    rooms.set(name, R);
    post({ k: 'hello', room: name });
    R.sendPres();
    return R;
  }

  function handle(msg) {
    const R = rooms.get(msg.room);
    if (!R || !R.joined) return;
    const prev = R.peers.get(msg.from);
    const peerOf = (presence) => ({ peer: msg.from, by: msg.by, isMe: msg.by === myUser, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(presence ?? prev?.presence ?? {}), updatedAt: Date.now() });
    if (msg.k === 'hello') {
      // a newcomer: hand them our presence
      post({ k: 'pres', room: msg.room, p: R.mine });
      if (!prev) { const p = peerOf({}); p.seen = performance.now(); R.peers.set(msg.from, p); R.mark('joined', p); }
    } else if (msg.k === 'pres') {
      const changed = !prev || JSON.stringify(prev.presence) !== JSON.stringify(msg.p);
      const p = changed ? peerOf(msg.p) : prev;
      p.seen = performance.now();
      if (changed) { R.peers.set(msg.from, p); R.mark(prev ? 'updated' : 'joined', p); }
    } else if (msg.k === 'hb') {
      if (prev) prev.seen = performance.now();
      else { post({ k: 'hello', room: msg.room }); }
    } else if (msg.k === 'bye') {
      if (prev) { R.peers.delete(msg.from); R.mark('left', prev); }
    } else if (msg.k === 'emit') {
      if (dropRate && Math.random() < dropRate) return;
      if (!prev) return;
      prev.seen = performance.now();
      const m = Object.freeze({ peer: msg.from, by: msg.by, isMe: msg.by === myUser, sameTab: false, kind: 'viewer', guest: false, topic: msg.topic, data: msg.data });
      for (const fn of R.topicFns.get(msg.topic) || []) try { fn(m); } catch (e) { console.error(e); }
    }
  }

  // heartbeats: peers silent for 4 s have left (a crashed / killed tab)
  setInterval(() => {
    if (!alive) return;
    for (const R of rooms.values()) {
      if (linkUp) post({ k: 'hb', room: R.name });
      const now = performance.now();
      for (const [id, p] of R.peers) {
        if (id === myPeer || now - (p.seen ?? now) < 4000) continue;
        R.peers.delete(id);
        R.mark('left', p);
      }
    }
  }, 1000);
  window.addEventListener('pagehide', () => { for (const R of rooms.values()) post({ k: 'bye', room: R.name }); });

  const lobby = makeRoom('');
  const roomApi = {
    ...lobby.api,
    leave: undefined,
    join(name) {
      if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return Promise.reject(err('invalid_argument', 'bad room name ' + name));
      if (rooms.has(name)) return Promise.resolve(rooms.get(name).api);
      if (rooms.size > 16) return Promise.reject(err('limit_reached', 'too many rooms'));
      return new Promise((res) => setTimeout(() => res(makeRoom(name).api), 30 + lag));
    },
    sendToClaudeSession: () => Promise.reject(err('claude_unavailable', 'mock')),
    canSendToClaudeSession: () => Promise.resolve('off'),
  };
  delete roomApi.leave;
  const setLink = (up) => {
    linkUp = up;
    for (const R of rooms.values()) {
      for (const fn of R.connFns) fn(up);
      if (up) { post({ k: 'hello', room: R.name }); post({ k: 'pres', room: R.name, p: R.mine }); }
    }
  };
  const userApi = {
    id: async () => myUser,
    name: async () => myName,
    me: async () => ({ id: myUser, name: myName, avatarUrl: '', color: '#2b8cf2', email: null, isOwner: false, canEdit: false }),
    profiles: async (ids) => {
      const n = names();
      const out = {};
      for (const id of [].concat(ids)) out[id] = { id, name: n[id] || '', avatarUrl: '', color: '#2b8cf2', email: null, isMe: id === myUser, guest: false };
      return out;
    },
    isOwner: async () => false,
    canEdit: async () => false,
    can: async () => null,
    search: async () => [],
  };
  window.claude = Object.freeze({
    use: (name) => new Promise((res) => setTimeout(() => res(name === 'room' ? Object.freeze(roomApi) : name === 'user' ? Object.freeze(userApi) : null), 50)),
  });
  window.__mockRoom = {
    peer: myPeer, user: myUser, rooms,
    drop: () => setLink(false),
    restore: () => setLink(true),
    kill: () => { for (const R of rooms.values()) post({ k: 'bye', room: R.name }); alive = false; bc?.close(); },
  };
}
