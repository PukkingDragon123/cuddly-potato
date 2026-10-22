// RoomLink: a two-player message link over a claude.ai named room, with the
// same peer interface netsync / the battle scene use for WebRTC (send / on /
// onClose / close / open / ready), plus two extra lanes:
//
//   send(msg)       RELIABLE + ORDERED. Carried by a sliding window in this
//                   page's presence (seq numbers; the other side acks the
//                   highest contiguous seq in ITS presence, acked messages
//                   leave the window). Emits on topic `mp` are a faster path
//                   for the same messages (deduplicated by seq), so the link
//                   works when presence is all a viewer may send.
//   sendState(obj)  LATEST-WINS (the host's battle snapshot) in presence.
//   sendFx(msg)     LOSSY (cosmetic battle events): emitted when allowed, and
//                   tucked into presence when there is room.
//
// Presence is one merged object of at most 4 KiB; everything here keeps the
// whole object under ~3.9 KB (UTF-8) and every string short. Messages may
// drop or arrive out of order: seq numbers sort it out.
const TOPIC = 'mp';
const LIMIT = 3900; // bytes for our whole presence object (platform limit 4096)
const FLUSH_MS = 80; // ~12 presence updates / s at most (emits + presence share ~40/s)
const HB_MS = 1000;
const LEFT_GRACE = 12000; // opponent left the room: wait this long for a reconnect
const SILENT_MAX = 15000; // nothing heard from the opponent for this long: gone
const LOST_MAX = 20000; // our own connection down this long: give up

const enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const bytes = (o) => {
  const s = JSON.stringify(o);
  return enc ? enc.encode(s).length : s.length * 2;
};

export class RoomLink {
  /**
   * @param named  a NamedRoom (room.join(name)) or a compatible mock
   * @param other  the opponent's `peer` label
   * @param mid    match id: presence from another match in the same room is ignored
   */
  constructor(named, other, mid = '') {
    this.named = named;
    this.other = other;
    this.mid = String(mid).slice(0, 24);
    this.reliable = true; // netsync / battle: no need to repeat messages
    this.handlers = new Set();
    this.closeHandlers = new Set();
    this.statusHandlers = new Set();
    this.open = false;
    this.dead = false;
    this.closeReason = null;
    // outgoing reliable stream
    this.seq = 0;
    this.out = []; // { s, m, n }
    this.peerAck = 0;
    this.emitted = 0; // highest seq already sent on the fast path
    // incoming reliable stream
    this.recv = 0;
    this.buf = new Map();
    // latest-wins state + lossy fx
    this.state = null;
    this.ss = 0;
    this.remoteSS = 0;
    this.fx = null;
    this.fxSeq = 0;
    this.fxEmitted = 0;
    this.remoteFx = 0;
    // liveness
    this.hb = 0;
    this.remoteHb = -1;
    this.lastHeard = 0;
    this.leftAt = 0;
    this.connected = named.connected ? named.connected() : true;
    this.downAt = this.connected ? 0 : performance.now();
    this.canEmit = true;
    this.dirty = true;
    this.status = 'connecting';
    // delivery is HELD until a listener is ready (release()): nothing heard while
    // switching owners (lobby -> battle scene) is lost
    this.held = true;
    this.queue = [];
    this.stats = { maxPresence: 0, maxEmit: 0, presenceCalls: 0, emits: 0, window: 0 };
    this.ready = new Promise((r) => (this._ready = r));

    this.offs = [];
    this.offs.push(named.onPeers((ch) => this.onPeers(ch), (e) => this.fatal(e)));
    this.offs.push(named.on(TOPIC, (msg) => {
      if (msg.peer !== this.other || !msg.data || typeof msg.data !== 'object') return;
      this.heard();
      this.take(msg.data);
    }, (e) => this.fatal(e)));
    if (named.onConnection) {
      this.offs.push(named.onConnection((c) => {
        this.connected = c;
        this.downAt = c ? 0 : this.downAt || performance.now();
        if (c) this.dirty = true;
      }, (e) => this.fatal(e)));
    }
    // read whoever is already here
    for (const p of named.peers ? named.peers() : []) if (p.peer === this.other) this.fromPresence(p.presence);
    this.flushT = setInterval(() => this.flush(), FLUSH_MS);
    this.hbT = setInterval(() => { this.hb++; this.dirty = true; this.watch(); }, HB_MS);
  }

  // ---- peer interface ------------------------------------------------------
  send(msg) {
    if (this.dead) return;
    this.out.push({ s: ++this.seq, m: msg, n: bytes(msg) });
    this.dirty = true;
  }
  sendState(obj) {
    if (this.dead) return;
    this.state = obj;
    this.ss++;
    this.dirty = true;
  }
  sendFx(msg) {
    if (this.dead) return;
    this.fx = msg;
    this.fxSeq++;
    this.dirty = true;
  }
  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }
  onClose(fn) {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }
  /** 'connecting' | 'ok' | 'lagging' (opponent quiet) | 'reconnecting' (our connection down) */
  onStatus(fn) {
    this.statusHandlers.add(fn);
    return () => this.statusHandlers.delete(fn);
  }
  close(reason = 'local') {
    if (this.dead) return;
    this.dead = true;
    this.open = false;
    this.closeReason = reason;
    clearInterval(this.flushT);
    clearInterval(this.hbT);
    for (const off of this.offs) try { off(); } catch (e) { /* ignore */ }
    this.offs = [];
    try { this.named.leave?.().catch?.(() => {}); } catch (e) { /* ignore */ }
    for (const fn of this.closeHandlers) fn(reason);
  }

  // ---- receiving -----------------------------------------------------------
  fatal(e) {
    console.warn('room link error', e?.code, e?.message);
    this.close('lost');
  }
  onPeers(ch) {
    for (const p of ch.left) if (p.peer === this.other) this.leftAt = performance.now();
    for (const p of [...ch.joined, ...ch.updated]) {
      if (p.peer !== this.other) continue;
      this.leftAt = 0;
      this.fromPresence(p.presence);
    }
  }
  fromPresence(pr) {
    if (!pr || pr.v !== 1 || (this.mid && pr.mid !== this.mid)) return;
    if (pr.hb !== this.remoteHb) {
      this.remoteHb = pr.hb;
      this.heard();
    }
    this.take(pr);
  }
  heard() {
    this.lastHeard = performance.now();
    if (!this.open && !this.dead) {
      this.open = true;
      this._ready();
    }
  }
  /** Buffer incoming messages (the latest state only, no fx) until release(). */
  hold() {
    this.held = true;
  }
  release() {
    this.held = false;
    const q = this.queue;
    this.queue = [];
    for (const [msg] of q) {
      if (this.dead) return;
      this.deliver(msg);
    }
  }
  deliver(msg, kind = 'r') {
    if (this.held) {
      if (kind === 'x') return;
      if (kind === 's') this.queue = this.queue.filter((e) => e[1] !== 's');
      this.queue.push([msg, kind]);
      return;
    }
    for (const fn of this.handlers) {
      try { fn(msg); } catch (e) { console.error('room link handler', e); }
    }
  }
  take(d) {
    if (this.dead) return;
    // their ack of our stream
    if (typeof d.k === 'number' && d.k > this.peerAck) {
      this.peerAck = Math.min(d.k, this.seq);
      while (this.out.length && this.out[0].s <= this.peerAck) this.out.shift();
    }
    // their reliable stream (in order, deduplicated)
    if (Array.isArray(d.r) && typeof d.rb === 'number') {
      d.r.forEach((m, i) => {
        const s = d.rb + i;
        if (s > this.recv && !this.buf.has(s)) this.buf.set(s, m);
      });
      const before = this.recv;
      while (this.buf.has(this.recv + 1)) {
        const m = this.buf.get(this.recv + 1);
        this.buf.delete(++this.recv);
        if (this.dead) return;
        this.deliver(m);
      }
      if (this.recv !== before) this.dirty = true; // ack it
    }
    // latest-wins state
    if (typeof d.ss === 'number' && d.ss > this.remoteSS && d.st) {
      this.remoteSS = d.ss;
      this.deliver(d.st, 's');
    }
    // lossy fx
    if (typeof d.xs === 'number' && d.xs > this.remoteFx && d.x) {
      this.remoteFx = d.xs;
      this.deliver(d.x, 'x');
    }
  }

  // ---- sending ---------------------------------------------------------------
  flush() {
    if (this.dead || !this.dirty) return;
    this.dirty = false;
    const pr = { v: 1, mid: this.mid, hb: this.hb, k: this.recv };
    if (this.state) { pr.ss = this.ss; pr.st = this.state; }
    let size = bytes(pr);
    // reliable window: oldest unacked first, as many as fit
    const win = [];
    for (const o of this.out) {
      if (size + o.n + 12 > LIMIT) break;
      win.push(o.m);
      size += o.n + 1;
    }
    if (win.length) { pr.rb = this.out[0].s; pr.r = win; size += 12; }
    this.stats.window = Math.max(this.stats.window, win.length);
    // fx only rides along when it fits (and nothing is waiting on the reliable stream)
    if (this.fx) {
      const n = bytes(this.fx);
      if (size + n + 16 <= LIMIT && win.length === this.out.length) { pr.xs = this.fxSeq; pr.x = this.fx; size += n + 16; }
    }
    let total = bytes(pr);
    while (total > LIMIT && (pr.x || (pr.r && pr.r.length))) {
      if (pr.x) { delete pr.x; delete pr.xs; } else { pr.r.pop(); if (!pr.r.length) { delete pr.r; delete pr.rb; } }
      total = bytes(pr);
    }
    if (total > LIMIT) {
      // never expected (a state far beyond budget): send the stream without it
      console.warn('room link: state too large', total);
      delete pr.st; delete pr.ss;
      total = bytes(pr);
    }
    this.stats.maxPresence = Math.max(this.stats.maxPresence, total);
    this.stats.presenceCalls++;
    this.named.presence(pr).catch((e) => {
      if (e?.code === 'invalid_argument') console.warn('room link presence rejected', e.message, total);
      this.dirty = true;
    });
    this.emitFast();
  }
  /** The fast path: new reliable messages + the latest fx batch, one emit per flush. */
  emitFast() {
    if (!this.canEmit || (this.named.connected && !this.named.connected())) return;
    const data = {};
    let size = 32;
    const fresh = this.out.filter((o) => o.s > this.emitted);
    const r = [];
    for (const o of fresh) {
      if (size + o.n > LIMIT) break;
      r.push(o.m);
      size += o.n + 1;
    }
    if (r.length) { data.rb = fresh[0].s; data.r = r; data.k = this.recv; }
    if (this.fx && this.fxSeq > this.fxEmitted) {
      const n = bytes(this.fx);
      if (size + n + 16 <= LIMIT) { data.xs = this.fxSeq; data.x = this.fx; size += n; }
      this.fxEmitted = this.fxSeq;
    }
    if (!data.r && !data.x) return;
    if (r.length) this.emitted = fresh[r.length - 1].s;
    this.stats.emits++;
    this.stats.maxEmit = Math.max(this.stats.maxEmit, bytes(data));
    this.named.emit(TOPIC, data).catch((e) => {
      // a viewer who may not send events: presence alone carries the game
      if (e?.code === 'not_permitted') this.canEmit = false;
    });
  }

  // ---- liveness ----------------------------------------------------------------
  watch() {
    if (this.dead) return;
    const now = performance.now();
    let st = 'ok';
    if (this.downAt && now - this.downAt > 2000) st = 'reconnecting';
    else if (!this.open) st = 'connecting';
    else if (now - this.lastHeard > 3000) st = 'lagging';
    if (st !== this.status) {
      this.status = st;
      for (const fn of this.statusHandlers) fn(st);
    }
    if (this.downAt && now - this.downAt > LOST_MAX) return this.close('lost');
    if (this.downAt) return; // can't judge the opponent while we are offline
    if (this.leftAt && now - this.leftAt > LEFT_GRACE) return this.close('left');
    if (this.open && now - this.lastHeard > SILENT_MAX) return this.close('timeout');
  }
}

/** Deterministic, room-name-safe hash (two FNV-1a passes, base 36). */
export function hashName(str) {
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x5bd1e995) ^ (b >>> 13);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}
