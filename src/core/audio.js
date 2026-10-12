// Procedural WebAudio sound effects + tiny chiptune sequencer.
import { rand } from './util.js';

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 0;
  return 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]];
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
/** Parse "A4 . C5 E5 - D5" into steps (null = rest, '-' = tie/rest). */
const seq = (s) => s.trim().split(/\s+/).map((t) => (t === '.' || t === '-' ? null : midi(t)));

class AudioSys {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.45;
    this.muted = false;
    this.track = null;
    this.trackName = null;
    this.lastPlay = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVol;
    this.musicBus.connect(this.master);
    // noise buffer
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.pendingMusic) {
      const p = this.pendingMusic;
      this.pendingMusic = null;
      this.music(p);
    }
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (this.sfxBus) this.sfxBus.gain.value = sfx;
    if (this.musicBus) this.musicBus.gain.value = music;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  // -------------------------------------------------------------------------
  // primitives
  tone({ type = 'square', f0 = 440, f1, dur = 0.1, vol = 0.2, attack = 0.005, delay = 0, dest, vibrato = 0, vibRate = 6, detune = 0, curve = 'exp' }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (vibrato) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = vibRate;
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  noise({ dur = 0.2, vol = 0.2, type = 'lowpass', f0 = 2000, f1, q = 1, delay = 0, dest, attack = 0.005 }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rand(0.9, 1.1);
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfxBus);
    s.start(t, rand(0, 1));
    s.stop(t + dur + 0.05);
  }

  // -------------------------------------------------------------------------
  play(name, o = {}) {
    if (!this.ctx || this.muted) return;
    // simple rate-limit for spammy sounds
    const now = this.ctx.currentTime;
    const minGap = o.gap ?? 0.03;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const fn = SFX[name];
    if (fn) fn(this, o.pitch ?? 1, o.vol ?? 1);
  }

  // -------------------------------------------------------------------------
  // Music sequencer
  music(name) {
    if (!this.ctx) {
      this.pendingMusic = name;
      return;
    }
    if (this.trackName === name) return;
    this.stopMusic();
    const tr = TRACKS[name];
    this.trackName = name;
    if (!tr) return;
    const bus = this.ctx.createGain();
    bus.gain.value = 0.0001;
    bus.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 0.6);
    bus.connect(this.musicBus);
    const state = { tr, bus, step: 0, next: this.ctx.currentTime + 0.08, stepDur: 60 / tr.bpm / 2 };
    this.track = state;
    state.timer = setInterval(() => this._schedule(state), 30);
    this._schedule(state);
  }
  stopMusic() {
    if (this.track) {
      const s = this.track;
      clearInterval(s.timer);
      try {
        s.bus.gain.cancelScheduledValues(this.ctx.currentTime);
        s.bus.gain.setValueAtTime(s.bus.gain.value, this.ctx.currentTime);
        s.bus.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
      } catch (e) { /* ignore */ }
      setTimeout(() => s.bus.disconnect(), 600);
    }
    this.track = null;
    this.trackName = null;
  }
  /** Play a one-off jingle over (ducked) music. */
  jingle(name) {
    if (!this.ctx) return;
    const j = JINGLES[name];
    if (!j) return;
    if (this.track) {
      const g = this.track.bus.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.15, t + 0.1);
      g.exponentialRampToValueAtTime(1, t + j.len + 0.6);
    }
    j.play(this);
  }

  _schedule(s) {
    const c = this.ctx;
    while (s.next < c.currentTime + 0.15) {
      const tr = s.tr;
      for (const ch of tr.channels) {
        const steps = ch.steps;
        const idx = s.step % steps.length;
        const n = steps[idx];
        if (n !== null && n !== undefined) INSTR[ch.inst](this, s.bus, s.next, n, s.stepDur * (ch.len ?? 1), ch.vol ?? 0.2, idx);
      }
      s.next += s.stepDur * (tr.swing && s.step % 2 === 0 ? 1 + tr.swing : tr.swing && s.step % 2 === 1 ? 1 - tr.swing : 1);
      s.step++;
    }
  }
}

// ---------------------------------------------------------------------------
// Instruments: (audio, dest, time, midi|token, dur, vol, stepIndex)

function env(a, dest, t, dur, vol, attack = 0.005, release = 0.05) {
  const g = a.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}
function oscAt(a, type, f, t, dur, out, detune = 0) {
  const o = a.ctx.createOscillator();
  o.type = type;
  o.frequency.value = f;
  o.detune.value = detune;
  o.connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
  return o;
}
function noiseAt(a, t, dur, out, type, freq, q = 1) {
  const s = a.ctx.createBufferSource();
  s.buffer = a.noiseBuf;
  const f = a.ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  s.connect(f).connect(out);
  s.start(t, Math.random());
  s.stop(t + dur + 0.02);
}

const INSTR = {
  lead(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.9, vol, 0.01, 0.04);
    oscAt(a, 'square', hz(n), t, dur, g, -6);
    oscAt(a, 'square', hz(n), t, dur, g, 7);
  },
  pulse(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.8, vol, 0.005, 0.03);
    oscAt(a, 'square', hz(n), t, dur, g);
  },
  tri(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.95, vol, 0.01, 0.06);
    oscAt(a, 'triangle', hz(n), t, dur, g);
  },
  bass(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.85, vol, 0.005, 0.04);
    oscAt(a, 'triangle', hz(n), t, dur, g);
    oscAt(a, 'square', hz(n - 12), t, dur, env(a, d, t, dur * 0.5, vol * 0.18));
  },
  epiano(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 1.6, vol, 0.004, dur * 1.2);
    oscAt(a, 'sine', hz(n), t, dur * 1.6, g);
    oscAt(a, 'sine', hz(n + 12), t, dur * 0.6, env(a, d, t, dur * 0.6, vol * 0.25));
  },
  trumpet(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.95, vol, 0.03, 0.05);
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(3200, t + 0.06);
    f.connect(g);
    const o1 = oscAt(a, 'sawtooth', hz(n), t, dur, f);
    const o2 = oscAt(a, 'sawtooth', hz(n), t, dur, f, 9);
    const l = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    l.frequency.value = 5.5;
    lg.gain.value = hz(n) * 0.012;
    l.connect(lg);
    lg.connect(o1.frequency);
    lg.connect(o2.frequency);
    l.start(t + 0.08);
    l.stop(t + dur + 0.02);
  },
  pluck(a, d, t, n, dur, vol) {
    // guitar-ish strum: three quick notes of a major triad above n
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.012;
      const g = env(a, d, tt, Math.min(dur, 0.18), vol * (1 - i * 0.15), 0.002, 0.12);
      oscAt(a, 'square', hz(n + [0, 4, 7][i]), tt, 0.2, g);
    }
  },
  pluckMinor(a, d, t, n, dur, vol) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.012;
      const g = env(a, d, tt, Math.min(dur, 0.18), vol * (1 - i * 0.15), 0.002, 0.12);
      oscAt(a, 'square', hz(n + [0, 3, 7][i]), tt, 0.2, g);
    }
  },
  kick(a, d, t, n, dur, vol) {
    const g = env(a, d, t, 0.18, vol, 0.002, 0.15);
    const o = a.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.2);
  },
  snare(a, d, t, n, dur, vol) {
    noiseAt(a, t, 0.12, env(a, d, t, 0.12, vol, 0.001, 0.1), 'highpass', 1500);
    oscAt(a, 'triangle', 190, t, 0.06, env(a, d, t, 0.06, vol * 0.6));
  },
  hat(a, d, t, n, dur, vol) {
    noiseAt(a, t, 0.04, env(a, d, t, 0.04, vol, 0.001, 0.03), 'highpass', 7000);
  },
  shaker(a, d, t, n, dur, vol, idx) {
    const acc = idx % 2 === 0 ? 1 : 0.55;
    noiseAt(a, t, 0.07, env(a, d, t, 0.07, vol * acc, 0.015, 0.04), 'bandpass', 6000, 1.5);
  },
  clap(a, d, t, n, dur, vol) {
    for (let i = 0; i < 3; i++) noiseAt(a, t + i * 0.01, 0.05, env(a, d, t + i * 0.01, 0.05, vol, 0.001, 0.04), 'bandpass', 1800, 2);
  },
};

// ---------------------------------------------------------------------------
// Tracks (step = 8th note)
const DRUM_ROCK = { kick: seq('C2 . . . C2 . . .'), snare: seq('. . C2 . . . C2 .'), hat: seq('C2 C2 C2 C2 C2 C2 C2 C2') };

const TRACKS = {
  title: {
    bpm: 124,
    channels: [
      { inst: 'lead', vol: 0.07, steps: seq('C5 E5 G5 C6 . G5 E5 . D5 F5 A5 D6 . A5 F5 . E5 G5 B5 E6 . D6 C6 B5 C6 . G5 . E5 . . .') },
      { inst: 'bass', vol: 0.16, steps: seq('C3 . C3 . C3 . G2 . D3 . D3 . D3 . A2 . E3 . E3 . E3 . B2 . C3 . G2 . C3 . . .') },
      { inst: 'kick', vol: 0.35, steps: DRUM_ROCK.kick },
      { inst: 'snare', vol: 0.12, steps: DRUM_ROCK.snare },
      { inst: 'hat', vol: 0.05, steps: DRUM_ROCK.hat },
    ],
  },
  lab: {
    bpm: 96,
    channels: [
      { inst: 'tri', vol: 0.09, len: 1.2, steps: seq('D4 F4 A4 D5 A4 F4 D4 F4 Bb3 D4 F4 Bb4 F4 D4 Bb3 D4 C4 E4 G4 C5 G4 E4 C4 E4 A3 C#4 E4 A4 E4 C#4 A3 E4') },
      { inst: 'epiano', vol: 0.05, steps: seq('. . . . F5 . . . . . . . D5 . . . . . . . E5 . . . . . . . C#5 . . .') },
      { inst: 'bass', vol: 0.12, len: 3, steps: seq('D2 . . . . . . . Bb1 . . . . . . . C2 . . . . . . . A1 . . . . . . .') },
      { inst: 'hat', vol: 0.025, steps: seq('. . C2 . . . C2 .') },
    ],
  },
  map: {
    bpm: 116,
    channels: [
      { inst: 'lead', vol: 0.065, steps: seq('E5 D5 C5 G4 . E5 G5 . A5 G5 E5 C5 D5 . . . F5 E5 D5 C5 A4 . C5 . D5 . E5 . D5 . G4 .') },
      { inst: 'pulse', vol: 0.04, steps: seq('C5 . E4 . G4 . E4 . A4 . E4 . C5 . E4 . F4 . A4 . C5 . A4 . G4 . B4 . D5 . B4 .') },
      { inst: 'bass', vol: 0.15, len: 1.6, steps: seq('C3 . G2 . C3 . G2 . A2 . E2 . A2 . E2 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . G2 .') },
      { inst: 'kick', vol: 0.28, steps: seq('C2 . . . C2 . . C2') },
      { inst: 'snare', vol: 0.09, steps: DRUM_ROCK.snare },
      { inst: 'hat', vol: 0.04, steps: DRUM_ROCK.hat },
    ],
  },
  battle: {
    bpm: 144,
    channels: [
      { inst: 'lead', vol: 0.065, steps: seq('A4 . C5 E5 . D5 C5 . B4 . G4 . B4 C5 D5 . C5 . A4 . F4 A4 C5 . B4 . E5 . D5 . B4 . A4 . C5 E5 . A5 G5 E5 F5 . E5 D5 C5 . B4 . A4 . C5 . F5 E5 D5 C5 B4 . G#4 . B4 . E5 .') },
      { inst: 'bass', vol: 0.16, steps: seq('A2 A2 A3 A2 A2 A3 A2 A2 G2 G2 G3 G2 G2 G3 G2 G2 F2 F2 F3 F2 F2 F3 F2 F2 E2 E2 E3 E2 E2 E3 E2 E2') },
      { inst: 'kick', vol: 0.36, steps: seq('C2 . . C2 C2 . . .') },
      { inst: 'snare', vol: 0.13, steps: DRUM_ROCK.snare },
      { inst: 'hat', vol: 0.045, steps: DRUM_ROCK.hat },
    ],
  },
  boss: {
    bpm: 152,
    channels: [
      { inst: 'lead', vol: 0.07, steps: seq('E5 . G5 . F#5 . D5 . E5 . B4 . . . E5 G5 A5 . G5 . F#5 . D5 . E5 . . . B4 . . . C5 . E5 . D5 . B4 . C5 . A4 . . . C5 E5 D#5 . F#5 . A5 . B5 . . . B4 . . .') },
      { inst: 'bass', vol: 0.17, steps: seq('E2 E2 E3 E2 E2 E3 E2 E2 G2 G2 G3 G2 D2 D2 D3 D2 C2 C2 C3 C2 C2 C3 C2 C2 B1 B1 B2 B1 B1 B2 D#2 B1') },
      { inst: 'kick', vol: 0.38, steps: seq('C2 . C2 . C2 . C2 .') },
      { inst: 'snare', vol: 0.14, steps: seq('. . C2 . . . C2 C2') },
      { inst: 'hat', vol: 0.05, steps: DRUM_ROCK.hat },
    ],
  },
  grocery: {
    bpm: 108,
    swing: 0.12,
    channels: [
      { inst: 'epiano', vol: 0.08, steps: seq('A4 . C5 . F5 . E5 D5 C5 . A4 . G4 . . . Bb4 . D5 . G5 . F5 E5 F5 . . . C5 . . . A4 . C5 . F5 . A5 G5 F5 . D5 . C5 . A4 . G4 . Bb4 . E5 . D5 C5 F5 . . . . . . .') },
      { inst: 'bass', vol: 0.13, steps: seq('F2 . A2 . C3 . A2 . D2 . F2 . A2 . F2 . G2 . Bb2 . D3 . Bb2 . C2 . E2 . G2 . C3 .') },
      { inst: 'hat', vol: 0.035, steps: seq('C2 . C2 C2 C2 . C2 C2') },
      { inst: 'kick', vol: 0.18, steps: seq('C2 . . . . . . .') },
      { inst: 'snare', vol: 0.05, steps: seq('. . . . C2 . . .') },
    ],
  },
  dance: {
    // Upbeat parade tune: oom-pah bass, strummed off-beats, twin trumpets in thirds, shakers.
    bpm: 138,
    channels: [
      { inst: 'trumpet', vol: 0.07, steps: seq('D5 . G5 . B5 . A5 G5 F#5 . A5 . D5 . . . E5 . A5 . C6 . B5 A5 G5 . B5 . G5 . . . D5 E5 F#5 G5 A5 . F#5 . G5 A5 B5 C6 D6 . B5 . C6 B5 A5 G5 F#5 . A5 . G5 . D5 . G5 . . .') },
      { inst: 'trumpet', vol: 0.045, steps: seq('B4 . D5 . G5 . F#5 E5 D5 . F#5 . A4 . . . C5 . F#5 . A5 . G5 F#5 E5 . G5 . D5 . . . B4 C5 D5 E5 F#5 . D5 . E5 F#5 G5 A5 B5 . G5 . A5 G5 F#5 E5 D5 . F#5 . B4 . B4 . D5 . . .') },
      { inst: 'bass', vol: 0.17, steps: seq('G2 . D2 . G2 . D2 . D2 . A1 . D2 . A1 . C2 . G1 . C2 . G1 . G2 . D2 . G2 . D2 .') },
      { inst: 'pluck', vol: 0.05, steps: seq('. G3 . G3 . G3 . G3 . D3 . D3 . D3 . D3 . C3 . C3 . C3 . C3 . G3 . G3 . G3 . G3') },
      { inst: 'shaker', vol: 0.05, steps: seq('C2 C2 C2 C2 C2 C2 C2 C2') },
      { inst: 'kick', vol: 0.25, steps: seq('C2 . . . C2 . . .') },
      { inst: 'clap', vol: 0.06, steps: seq('. . C2 . . . C2 C2') },
    ],
  },
};

const JINGLES = {
  victory: {
    len: 1.6,
    play(a) {
      const d = a.musicBus;
      const notes = ['C5', 'E5', 'G5', 'C6', 'G5', 'C6'];
      notes.forEach((n, i) => {
        const t = a.ctx.currentTime + i * 0.11;
        INSTR.lead(a, d, t, midi(n), i === notes.length - 1 ? 0.7 : 0.12, 0.12);
      });
      INSTR.pluck(a, d, a.ctx.currentTime + 0.55, midi('C4'), 0.6, 0.1);
      INSTR.kick(a, d, a.ctx.currentTime + 0.55, 0, 0.2, 0.4);
    },
  },
  defeat: {
    len: 1.6,
    play(a) {
      const d = a.musicBus;
      ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) => INSTR.tri(a, d, a.ctx.currentTime + i * 0.28, midi(n), i === 3 ? 0.8 : 0.26, 0.16));
    },
  },
  unlock: {
    len: 1.0,
    play(a) {
      const d = a.musicBus;
      ['G5', 'B5', 'D6', 'G6'].forEach((n, i) => INSTR.pulse(a, d, a.ctx.currentTime + i * 0.07, midi(n), 0.14, 0.08));
      INSTR.epiano(a, d, a.ctx.currentTime + 0.3, midi('G5'), 0.5, 0.1);
    },
  },
  rare: {
    len: 1.4,
    play(a) {
      const d = a.musicBus;
      ['C5', 'E5', 'G5', 'B5', 'D6', 'G6'].forEach((n, i) => INSTR.epiano(a, d, a.ctx.currentTime + i * 0.06, midi(n), 0.4, 0.09));
    },
  },
};

// ---------------------------------------------------------------------------
// Sound effects
const SFX = {
  click: (a, p) => a.tone({ type: 'square', f0: 900 * p, f1: 700 * p, dur: 0.05, vol: 0.12 }),
  tap: (a, p) => a.tone({ type: 'triangle', f0: 600 * p, f1: 900 * p, dur: 0.06, vol: 0.15 }),
  deny: (a) => { a.tone({ type: 'square', f0: 140, dur: 0.1, vol: 0.12 }); a.tone({ type: 'square', f0: 120, dur: 0.12, vol: 0.12, delay: 0.12 }); },
  pop: (a, p) => {
    a.tone({ type: 'sine', f0: 500 * p, f1: 1500 * p, dur: 0.08, vol: 0.3 });
    a.noise({ dur: 0.06, vol: 0.15, type: 'highpass', f0: 3000 });
  },
  bigPop: (a, p) => {
    a.tone({ type: 'sine', f0: 300 * p, f1: 1400 * p, dur: 0.12, vol: 0.4 });
    a.tone({ type: 'sine', f0: 120, f1: 40, dur: 0.35, vol: 0.5 });
    a.noise({ dur: 0.4, vol: 0.35, type: 'lowpass', f0: 6000, f1: 300 });
  },
  bubble: (a, p) => a.tone({ type: 'sine', f0: rand(300, 500) * p, f1: rand(800, 1300) * p, dur: 0.06, vol: 0.08 }),
  slosh: (a, p) => a.noise({ dur: 0.18, vol: 0.18, type: 'bandpass', f0: 500 * p, f1: 1400 * p, q: 2 }),
  fizz: (a) => a.noise({ dur: 0.5, vol: 0.12, type: 'highpass', f0: 5000, f1: 8000 }),
  whoosh: (a, p) => a.noise({ dur: 0.3, vol: 0.2, type: 'bandpass', f0: 400 * p, f1: 2400 * p, q: 1.5 }),
  flick: (a) => { a.noise({ dur: 0.08, vol: 0.25, type: 'highpass', f0: 2500 }); a.tone({ type: 'triangle', f0: 1200, f1: 400, dur: 0.1, vol: 0.12 }); },
  hit: (a, p) => {
    a.tone({ type: 'square', f0: 260 * p, f1: 90 * p, dur: 0.08, vol: 0.13 });
    a.noise({ dur: 0.05, vol: 0.13, type: 'highpass', f0: 2000 });
  },
  hitHeavy: (a, p) => {
    a.tone({ type: 'triangle', f0: 160 * p, f1: 40, dur: 0.22, vol: 0.35 });
    a.noise({ dur: 0.2, vol: 0.25, type: 'lowpass', f0: 2500, f1: 200 });
  },
  bite: (a, p) => { a.noise({ dur: 0.05, vol: 0.2, type: 'bandpass', f0: 1800 * p, q: 3 }); a.tone({ type: 'square', f0: 400 * p, f1: 150, dur: 0.05, vol: 0.1 }); },
  zap: (a, p) => a.tone({ type: 'sawtooth', f0: 1600 * p, f1: 200 * p, dur: 0.15, vol: 0.12 }),
  shoot: (a, p) => a.tone({ type: 'square', f0: 900 * p, f1: 300 * p, dur: 0.09, vol: 0.1 }),
  explode: (a, p) => {
    a.noise({ dur: 0.7, vol: 0.5, type: 'lowpass', f0: 1800 * p, f1: 80 });
    a.tone({ type: 'sine', f0: 90 * p, f1: 28, dur: 0.6, vol: 0.5 });
  },
  coin: (a, p) => {
    a.tone({ type: 'square', f0: 988 * p, dur: 0.07, vol: 0.09 });
    a.tone({ type: 'square', f0: 1319 * p, dur: 0.18, vol: 0.09, delay: 0.07 });
  },
  chaching: (a) => {
    a.tone({ type: 'square', f0: 1319, dur: 0.06, vol: 0.1 });
    a.tone({ type: 'square', f0: 1760, dur: 0.3, vol: 0.1, delay: 0.06 });
    a.noise({ dur: 0.35, vol: 0.12, type: 'bandpass', f0: 5000, q: 6, delay: 0.06 });
    a.tone({ type: 'sine', f0: 3520, dur: 0.4, vol: 0.05, delay: 0.08 });
  },
  spawn: (a, p) => {
    a.tone({ type: 'triangle', f0: 260 * p, f1: 720 * p, dur: 0.14, vol: 0.18 });
    a.noise({ dur: 0.12, vol: 0.06, type: 'highpass', f0: 4000 });
  },
  death: (a, p) => {
    a.tone({ type: 'square', f0: 420 * p, f1: 70 * p, dur: 0.25, vol: 0.12 });
    a.noise({ dur: 0.25, vol: 0.15, type: 'lowpass', f0: 3000, f1: 300 });
  },
  crunch: (a, p) => {
    for (let i = 0; i < 4; i++) a.noise({ dur: 0.06, vol: 0.2, type: 'bandpass', f0: rand(600, 2200) * p, q: 2, delay: i * 0.035 });
  },
  upgrade: (a) => {
    ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => a.tone({ type: 'square', f0: hz(midi(n)), dur: 0.1, vol: 0.09, delay: i * 0.06 }));
  },
  levelUp: (a) => {
    ['G4', 'C5', 'E5', 'G5', 'C6', 'E6'].forEach((n, i) => a.tone({ type: 'square', f0: hz(midi(n)), dur: 0.12, vol: 0.08, delay: i * 0.05 }));
    a.tone({ type: 'sine', f0: hz(midi('C7')), dur: 0.6, vol: 0.05, delay: 0.3 });
  },
  magic: (a, p) => {
    for (let i = 0; i < 6; i++) a.tone({ type: 'sine', f0: (1200 + i * 220) * p, dur: 0.18, vol: 0.05, delay: i * 0.04 });
  },
  heal: (a) => {
    ['E5', 'G#5', 'B5', 'E6'].forEach((n, i) => a.tone({ type: 'triangle', f0: hz(midi(n)), dur: 0.2, vol: 0.09, delay: i * 0.05 }));
  },
  roar: (a, p) => {
    a.tone({ type: 'sawtooth', f0: 110 * p, f1: 60 * p, dur: 0.9, vol: 0.22, vibrato: 12, vibRate: 18, attack: 0.05 });
    a.noise({ dur: 0.9, vol: 0.25, type: 'lowpass', f0: 900, f1: 300, attack: 0.05 });
  },
  growl: (a, p) => a.tone({ type: 'sawtooth', f0: 150 * p, f1: 90 * p, dur: 0.3, vol: 0.12, vibrato: 10, vibRate: 25 }),
  slime: (a, p) => a.tone({ type: 'sine', f0: 240 * p, f1: 60 * p, dur: 0.22, vol: 0.25, vibrato: 30, vibRate: 30 }),
  splat: (a, p) => { a.noise({ dur: 0.15, vol: 0.25, type: 'lowpass', f0: 1200 * p, f1: 200 }); a.tone({ type: 'sine', f0: 200 * p, f1: 50, dur: 0.12, vol: 0.2 }); },
  kick: (a) => { a.tone({ type: 'sine', f0: 180, f1: 45, dur: 0.18, vol: 0.5 }); a.noise({ dur: 0.04, vol: 0.3, type: 'highpass', f0: 3000 }); },
  horn: (a) => {
    a.tone({ type: 'square', f0: 330, dur: 0.22, vol: 0.12, attack: 0.01 });
    a.tone({ type: 'square', f0: 415, dur: 0.22, vol: 0.1, attack: 0.01 });
    a.tone({ type: 'square', f0: 330, dur: 0.32, vol: 0.12, delay: 0.28 });
    a.tone({ type: 'square', f0: 415, dur: 0.32, vol: 0.1, delay: 0.28 });
  },
  engine: (a) => {
    a.tone({ type: 'sawtooth', f0: 55, f1: 95, dur: 1.6, vol: 0.14, vibrato: 8, vibRate: 22, curve: 'lin' });
    a.noise({ dur: 1.6, vol: 0.1, type: 'lowpass', f0: 400 });
  },
  squeak: (a, p) => a.tone({ type: 'sine', f0: 1500 * p, f1: 1900 * p, dur: 0.1, vol: 0.06, vibrato: 80, vibRate: 40 }),
  thud: (a, p) => { a.tone({ type: 'sine', f0: 120 * p, f1: 40, dur: 0.25, vol: 0.45 }); a.noise({ dur: 0.1, vol: 0.15, type: 'lowpass', f0: 800 }); },
  boing: (a, p) => a.tone({ type: 'sine', f0: 180 * p, f1: 520 * p, dur: 0.22, vol: 0.2, vibrato: 40, vibRate: 14 }),
  tick: (a, p) => a.tone({ type: 'square', f0: 2000 * p, dur: 0.02, vol: 0.06 }),
  drum: (a) => a.noise({ dur: 0.08, vol: 0.2, type: 'bandpass', f0: 300, q: 1 }),
  cheer: (a) => {
    for (let i = 0; i < 10; i++) a.noise({ dur: rand(0.4, 1), vol: 0.06, type: 'bandpass', f0: rand(800, 2400), q: 4, delay: rand(0, 0.4) });
    a.noise({ dur: 1.2, vol: 0.08, type: 'bandpass', f0: 1200, q: 0.6 });
  },
  shatter: (a) => { for (let i = 0; i < 6; i++) a.tone({ type: 'sine', f0: rand(2000, 4500), dur: 0.12, vol: 0.05, delay: i * 0.03 }); a.noise({ dur: 0.3, vol: 0.2, type: 'highpass', f0: 4000 }); },
  swing: (a, p) => a.noise({ dur: 0.12, vol: 0.12, type: 'bandpass', f0: 900 * p, f1: 2500 * p, q: 2 }),
  chomp: (a, p) => { a.noise({ dur: 0.07, vol: 0.2, type: 'bandpass', f0: 900 * p, q: 2 }); a.tone({ type: 'square', f0: 220 * p, f1: 110, dur: 0.06, vol: 0.08, delay: 0.02 }); },
  freeze: (a) => a.noise({ dur: 0.4, vol: 0.15, type: 'highpass', f0: 6000, f1: 2000 }),
  laser: (a, p) => a.tone({ type: 'sawtooth', f0: 1800 * p, f1: 900 * p, dur: 0.2, vol: 0.08, vibrato: 60, vibRate: 30 }),
  error: (a) => a.tone({ type: 'square', f0: 200, f1: 150, dur: 0.18, vol: 0.12 }),
  tear: (a) => a.noise({ dur: 0.25, vol: 0.2, type: 'bandpass', f0: 1500, f1: 4000, q: 1 }),
  bell: (a) => { a.tone({ type: 'sine', f0: 1320, dur: 0.8, vol: 0.12 }); a.tone({ type: 'sine', f0: 2640, dur: 0.5, vol: 0.05 }); },
  alarm: (a, p) => { for (let i = 0; i < 3; i++) { a.tone({ type: 'square', f0: 880 * p, f1: 660 * p, dur: 0.18, vol: 0.07, delay: i * 0.36 }); a.tone({ type: 'square', f0: 660 * p, f1: 880 * p, dur: 0.18, vol: 0.07, delay: i * 0.36 + 0.18 }); } },
  boom: (a, p) => { a.tone({ type: 'sine', f0: 150 * p, f1: 45, dur: 0.3, vol: 0.4 }); a.noise({ dur: 0.18, vol: 0.22, type: 'lowpass', f0: 1400 * p, f1: 200 }); },
  crown: (a) => { [784, 988, 1175, 1568].forEach((f, i) => a.tone({ type: 'square', f0: f, dur: 0.14, vol: 0.08, delay: i * 0.07 })); a.tone({ type: 'sine', f0: 2093, dur: 0.6, vol: 0.06, delay: 0.28 }); },
  countdown: (a, p) => a.tone({ type: 'square', f0: 660 * p, dur: 0.12, vol: 0.1 }),
  go: (a) => { a.tone({ type: 'square', f0: 990, dur: 0.35, vol: 0.12 }); a.tone({ type: 'square', f0: 1320, dur: 0.35, vol: 0.06 }); },
  cardPick: (a, p) => a.tone({ type: 'triangle', f0: 500 * p, f1: 820 * p, dur: 0.07, vol: 0.13 }),
  emote: (a, p) => a.tone({ type: 'sine', f0: 700 * p, f1: 1100 * p, dur: 0.12, vol: 0.12, vibrato: 30, vibRate: 18 }),
};

export const audio = new AudioSys();
