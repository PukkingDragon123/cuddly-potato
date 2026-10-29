// Serverless peer-to-peer connection (WebRTC data channel) with manual
// "battle code" signaling: the host shares an offer code, the guest answers
// with a reply code. Public STUN is used only for NAT discovery.

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

async function compress(str) {
  if (typeof CompressionStream === 'undefined') return 'R' + btoa(unescape(encodeURIComponent(str)));
  const cs = new CompressionStream('deflate-raw');
  const buf = await new Response(new Blob([str]).stream().pipeThrough(cs)).arrayBuffer();
  let bin = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return 'Z' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function decompress(code) {
  code = code.trim().replace(/\s+/g, '');
  if (code.startsWith('R')) return decodeURIComponent(escape(atob(code.slice(1))));
  if (!code.startsWith('Z')) throw new Error('Not a battle code');
  let b64 = code.slice(1).replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('deflate-raw');
  return await new Response(new Blob([bytes]).stream().pipeThrough(ds)).text();
}

function waitIce(pc, timeout = 4000) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        res();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, timeout);
  });
}

export const p2pSupported = () => typeof RTCPeerConnection !== 'undefined';

/** A peer connection with a JSON message channel. */
export class Peer {
  constructor(role) {
    this.role = role; // 'host' | 'guest'
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.handlers = new Set();
    this.closeHandlers = new Set();
    this.open = false;
    this.pc.addEventListener('connectionstatechange', () => {
      const st = this.pc.connectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') this._closed();
    });
    if (role === 'guest') {
      this.pc.addEventListener('datachannel', (e) => this._bind(e.channel));
    }
    this.ready = new Promise((r) => (this._ready = r));
  }

  _bind(ch) {
    this.ch = ch;
    ch.addEventListener('open', () => {
      this.open = true;
      this._ready();
    });
    ch.addEventListener('close', () => this._closed());
    ch.addEventListener('message', (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        return;
      }
      for (const fn of this.handlers) fn(msg);
    });
  }
  _closed() {
    if (this.dead) return;
    this.dead = true;
    this.open = false;
    for (const fn of this.closeHandlers) fn();
  }

  /** Host: create the offer code to share. */
  async createOffer() {
    this._bind(this.pc.createDataChannel('swarmers', { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await waitIce(this.pc);
    return compress(JSON.stringify({ v: 1, t: 'o', sdp: this.pc.localDescription.sdp }));
  }
  /** Guest: take the host's code, produce the reply code. */
  async acceptOffer(code) {
    const data = JSON.parse(await decompress(code));
    if (data.t !== 'o') throw new Error('That is a reply code. Paste the HOST code here.');
    await this.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await waitIce(this.pc);
    return compress(JSON.stringify({ v: 1, t: 'a', sdp: this.pc.localDescription.sdp }));
  }
  /** Host: apply the guest's reply code. */
  async acceptAnswer(code) {
    const data = JSON.parse(await decompress(code));
    if (data.t !== 'a') throw new Error('That is a host code. Paste your friend\'s REPLY code.');
    await this.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
  }

  send(msg) {
    if (this.open && this.ch && this.ch.readyState === 'open') this.ch.send(JSON.stringify(msg));
  }
  on(fn) {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }
  onClose(fn) {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }
  close() {
    try {
      this.ch && this.ch.close();
      this.pc.close();
    } catch (e) { /* ignore */ }
    this._closed();
  }
}

// The active peer survives scene changes (lobby -> battle -> results).
let active = null;
export const net = {
  get peer() {
    return active;
  },
  set(p) {
    if (active && active !== p) active.close();
    active = p;
  },
  clear() {
    if (active) active.close();
    active = null;
  },
};
