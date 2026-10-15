// Procedural WebAudio sound effects + tiny chiptune sequencer.
//
// Mix: every SFX goes through the sfx bus (gentle 12 kHz roll-off), the music
// through the music bus (soft slap-back delay for space); both meet in the
// master, then a glue compressor and a brick-wall-ish limiter so stacked
// battle sounds never clip. Voices use soft waveforms (sine / triangle, or
// squares and saws only behind a low-pass) and click-free envelopes: a short
// linear attack, optional hold, exponential decay to -80 dB, then stop.
import { rand } from './util.js';

const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
function midi(n) {
  if (typeof n === 'number') return n;
  const m = /^([A-G][#b]?)(-?\d)$/.exec(n);
  if (!m) return 0;
  return 12 * (parseInt(m[2], 10) + 1) + NOTE[m[1]];
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const nhz = (n) => hz(midi(n));
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
    this.out = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.build(new AC());
    if (this.pendingMusic) {
      const p = this.pendingMusic;
      this.pendingMusic = null;
      this.music(p);
    }
  }

  /** Build the mixing graph on a context (also used for offline renders in tests). */
  build(ctx) {
    this.ctx = ctx;
    const c = ctx;
    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    // glue compressor: evens out stacked hits without pumping the music
    const glue = c.createDynamicsCompressor();
    glue.threshold.value = -18;
    glue.knee.value = 12;
    glue.ratio.value = 3;
    glue.attack.value = 0.004;
    glue.release.value = 0.2;
    // limiter: catches the peaks of explosions + jingles
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -3;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.08;
    this.master.connect(glue).connect(lim).connect(c.destination);
    // sfx bus: take the fizz off the top end
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.sfxVol;
    const sfxTone = c.createBiquadFilter();
    sfxTone.type = 'lowpass';
    sfxTone.frequency.value = 12000;
    sfxTone.Q.value = 0.5;
    this.sfxBus.connect(sfxTone).connect(this.master);
    this.out = this.sfxBus;
    // music bus: dry + a soft filtered slap-back delay
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.musicVol;
    const musicTone = c.createBiquadFilter();
    musicTone.type = 'lowpass';
    musicTone.frequency.value = 9000;
    musicTone.Q.value = 0.5;
    // trim: the tunes sit under the action (the glue compressor's make-up gain lifts everything)
    const musicTrim = c.createGain();
    musicTrim.gain.value = 0.7;
    this.musicBus.connect(musicTone).connect(musicTrim).connect(this.master);
    const dly = c.createDelay(1);
    dly.delayTime.value = 0.21;
    const fb = c.createGain();
    fb.gain.value = 0.22;
    const dlp = c.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2400;
    const wet = c.createGain();
    wet.gain.value = 0.16;
    musicTone.connect(dly);
    dly.connect(dlp).connect(fb).connect(dly);
    dlp.connect(wet).connect(musicTrim);
    // noise buffer
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (this.sfxBus) this.sfxBus.gain.value = sfx;
    if (this.musicBus) this.musicBus.gain.value = music;
  }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  // -------------------------------------------------------------------------
  // primitives
  /** Click-free gain envelope: linear attack, optional hold, exponential decay to silence at t + dur. */
  _env(t, dur, vol, attack, hold, dest) {
    const c = this.ctx;
    const g = c.createGain();
    const a = Math.max(0.001, Math.min(attack, dur * 0.8));
    const hd = Math.max(0, Math.min(hold, dur - a - 0.005));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (hd > 0) g.gain.setValueAtTime(vol, t + a + hd);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(dest);
    return g;
  }
  _out(dest, pan) {
    let out = dest || this.out || this.sfxBus;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(out);
      out = p;
    }
    return out;
  }
  tone({ type = 'triangle', f0 = 440, f1, dur = 0.1, vol = 0.2, attack = 0.004, hold = 0, delay = 0, dest, vibrato = 0, vibRate = 6, detune = 0, curve = 'exp', lp = 0, q = 0.7, pan = 0 }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.005 + delay;
    const o = c.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    const g = this._env(t, dur, vol, attack, hold, this._out(dest, pan));
    let src = o;
    if (lp) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      f.Q.value = q;
      o.connect(f);
      src = f;
    }
    if (vibrato) {
      const l = c.createOscillator();
      const lg = c.createGain();
      l.frequency.value = vibRate;
      lg.gain.value = vibrato;
      l.connect(lg).connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    src.connect(g);
    o.start(t);
    o.stop(t + dur + 0.03);
  }
  noise({ dur = 0.2, vol = 0.2, type = 'lowpass', f0 = 2000, f1, q = 1, delay = 0, dest, attack = 0.003, hold = 0, pan = 0 }) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + 0.005 + delay;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = rand(0.9, 1.1);
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = this._env(t, dur, vol, attack, hold, this._out(dest, pan));
    s.connect(f).connect(g);
    s.start(t, rand(0, 1));
    s.stop(t + dur + 0.03);
  }
  /** A short bright transient (the "snap" at the front of hits, taps and pops). */
  snap(vol = 0.08, f = 3500, delay = 0, dur = 0.018) {
    this.noise({ dur, vol, type: 'bandpass', f0: f, q: 0.9, attack: 0.001, delay });
  }
  /** A pitched body thump (kick-drum style pitch drop). */
  thump(f0 = 160, f1 = 50, dur = 0.18, vol = 0.3, delay = 0) {
    this.tone({ type: 'sine', f0, f1, dur, vol, attack: 0.002, delay });
  }
  /** A soft bell / chime note: sine fundamental + a quieter octave partial. */
  chime(f, dur = 0.4, vol = 0.08, delay = 0, pan = 0) {
    this.tone({ type: 'sine', f0: f, dur, vol, attack: 0.003, delay, pan });
    this.tone({ type: 'triangle', f0: f * 2, dur: dur * 0.5, vol: vol * 0.28, attack: 0.002, delay, pan });
  }

  // -------------------------------------------------------------------------
  play(name, o = {}) {
    if (!this.ctx || this.muted) return;
    // simple rate-limit for spammy sounds
    const now = this.ctx.currentTime;
    const minGap = o.gap ?? 0.03;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    const fn = SFX[name];
    if (!fn) return;
    this.lastPlay[name] = now;
    const vol = o.vol ?? 1;
    if (vol !== 1) {
      const g = this.ctx.createGain();
      g.gain.value = Math.max(0, vol);
      g.connect(this.sfxBus);
      this.out = g;
    }
    try {
      fn(this, o.pitch ?? 1, vol);
    } finally {
      this.out = this.sfxBus;
    }
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
    bus.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 0.8);
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
        s.bus.gain.setValueAtTime(Math.max(0.0001, s.bus.gain.value), this.ctx.currentTime);
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
      g.setValueAtTime(0.15, t + j.len);
      g.exponentialRampToValueAtTime(1, t + j.len + 0.8);
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
        // ch.on: which passes of the pattern play (e.g. [1, 1, 0] = the lead rests every third loop)
        if (ch.on && !ch.on[Math.floor(s.step / steps.length) % ch.on.length]) continue;
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
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.setValueAtTime(vol, t + Math.max(attack, dur - release));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  g.connect(dest);
  return g;
}
function lowpass(a, dest, t, from, to = from, glide = 0.08, q = 0.8) {
  const f = a.ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + glide);
  f.connect(dest);
  return f;
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
  // soft chip lead: two detuned pulses behind a plucky low-pass (no raw square fizz)
  lead(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.9, vol, 0.008, 0.05);
    const f = lowpass(a, g, t, 3200, 1500, Math.min(0.2, dur), 0.6);
    oscAt(a, 'square', hz(n), t, dur, f, -7);
    oscAt(a, 'triangle', hz(n), t, dur, f, 6);
  },
  pulse(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.8, vol, 0.005, 0.04);
    oscAt(a, 'square', hz(n), t, dur, lowpass(a, g, t, 2200, 1100, 0.1));
  },
  tri(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.95, vol, 0.01, 0.06);
    oscAt(a, 'triangle', hz(n), t, dur, g);
  },
  bass(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.85, vol, 0.006, 0.05);
    oscAt(a, 'triangle', hz(n), t, dur, g);
    // a little low-passed square underneath for growl, no buzz
    oscAt(a, 'square', hz(n - 12), t, dur, lowpass(a, env(a, d, t, dur * 0.6, vol * 0.22, 0.006, 0.04), t, 900, 380, 0.12));
  },
  epiano(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 1.6, vol, 0.004, dur * 1.2);
    oscAt(a, 'sine', hz(n), t, dur * 1.6, g);
    oscAt(a, 'sine', hz(n + 12), t, dur * 0.6, env(a, d, t, dur * 0.6, vol * 0.22, 0.003, dur * 0.5));
  },
  trumpet(a, d, t, n, dur, vol) {
    const g = env(a, d, t, dur * 0.95, vol, 0.03, 0.06);
    const f = a.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(700, t);
    f.frequency.linearRampToValueAtTime(2400, t + 0.06);
    f.frequency.linearRampToValueAtTime(1600, t + dur);
    f.connect(g);
    const o1 = oscAt(a, 'sawtooth', hz(n), t, dur, f);
    const o2 = oscAt(a, 'sawtooth', hz(n), t, dur, f, 9);
    const l = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    l.frequency.value = 5.5;
    lg.gain.value = hz(n) * 0.01;
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
      const g = env(a, d, tt, Math.min(dur, 0.2), vol * (1 - i * 0.15), 0.002, 0.14);
      oscAt(a, 'square', hz(n + [0, 4, 7][i]), tt, 0.22, lowpass(a, g, tt, 2600, 700, 0.15));
    }
  },
  pluckMinor(a, d, t, n, dur, vol) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.012;
      const g = env(a, d, tt, Math.min(dur, 0.2), vol * (1 - i * 0.15), 0.002, 0.14);
      oscAt(a, 'square', hz(n + [0, 3, 7][i]), tt, 0.22, lowpass(a, g, tt, 2600, 700, 0.15));
    }
  },
  kick(a, d, t, n, dur, vol) {
    const g = env(a, d, t, 0.2, vol, 0.002, 0.17);
    const o = a.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    o.connect(g);
    o.start(t);
    o.stop(t + 0.22);
  },
  snare(a, d, t, n, dur, vol) {
    noiseAt(a, t, 0.14, env(a, d, t, 0.14, vol, 0.001, 0.12), 'bandpass', 2200, 0.7);
    oscAt(a, 'triangle', 185, t, 0.07, env(a, d, t, 0.07, vol * 0.5, 0.001, 0.06));
  },
  hat(a, d, t, n, dur, vol) {
    noiseAt(a, t, 0.04, env(a, d, t, 0.04, vol, 0.001, 0.035), 'highpass', 7500);
  },
  shaker(a, d, t, n, dur, vol, idx) {
    const acc = idx % 2 === 0 ? 1 : 0.55;
    noiseAt(a, t, 0.07, env(a, d, t, 0.07, vol * acc, 0.015, 0.045), 'bandpass', 6000, 1.5);
  },
  clap(a, d, t, n, dur, vol) {
    for (let i = 0; i < 3; i++) noiseAt(a, t + i * 0.01, 0.06, env(a, d, t + i * 0.01, 0.06, vol, 0.001, 0.05), 'bandpass', 1600, 1.4);
  },
};

// ---------------------------------------------------------------------------
// Tracks (step = 8th note). Leads rest every few loops (ch.on) so the tunes
// breathe instead of nagging; bass + drums keep the groove going.
const DRUM_ROCK = { kick: seq('C2 . . . C2 . . .'), snare: seq('. . C2 . . . C2 .'), hat: seq('C2 C2 C2 C2 C2 C2 C2 C2') };

const TRACKS = {
  title: {
    bpm: 124,
    channels: [
      { inst: 'lead', vol: 0.06, on: [1, 1, 0], steps: seq('C5 E5 G5 C6 . G5 E5 . D5 F5 A5 D6 . A5 F5 . E5 G5 B5 E6 . D6 C6 B5 C6 . G5 . E5 . . .') },
      { inst: 'epiano', vol: 0.035, steps: seq('. . . . E5 . . . . . . . F5 . . . . . . . G5 . . . . . . . E5 . . .') },
      { inst: 'bass', vol: 0.15, steps: seq('C3 . C3 . C3 . G2 . D3 . D3 . D3 . A2 . E3 . E3 . E3 . B2 . C3 . G2 . C3 . . .') },
      { inst: 'kick', vol: 0.32, steps: DRUM_ROCK.kick },
      { inst: 'snare', vol: 0.1, steps: DRUM_ROCK.snare },
      { inst: 'hat', vol: 0.035, steps: DRUM_ROCK.hat },
    ],
  },
  lab: {
    bpm: 96,
    channels: [
      { inst: 'tri', vol: 0.08, len: 1.2, steps: seq('D4 F4 A4 D5 A4 F4 D4 F4 Bb3 D4 F4 Bb4 F4 D4 Bb3 D4 C4 E4 G4 C5 G4 E4 C4 E4 A3 C#4 E4 A4 E4 C#4 A3 E4') },
      { inst: 'epiano', vol: 0.05, steps: seq('. . . . F5 . . . . . . . D5 . . . . . . . E5 . . . . . . . C#5 . . .') },
      { inst: 'bass', vol: 0.11, len: 3, steps: seq('D2 . . . . . . . Bb1 . . . . . . . C2 . . . . . . . A1 . . . . . . .') },
      { inst: 'hat', vol: 0.02, steps: seq('. . C2 . . . C2 .') },
    ],
  },
  map: {
    bpm: 116,
    channels: [
      { inst: 'lead', vol: 0.055, on: [1, 1, 0, 1, 0], steps: seq('E5 D5 C5 G4 . E5 G5 . A5 G5 E5 C5 D5 . . . F5 E5 D5 C5 A4 . C5 . D5 . E5 . D5 . G4 .') },
      { inst: 'epiano', vol: 0.04, steps: seq('C5 . E4 . G4 . E4 . A4 . E4 . C5 . E4 . F4 . A4 . C5 . A4 . G4 . B4 . D5 . B4 .') },
      { inst: 'bass', vol: 0.14, len: 1.6, steps: seq('C3 . G2 . C3 . G2 . A2 . E2 . A2 . E2 . F2 . C3 . F2 . C3 . G2 . D3 . G2 . G2 .') },
      { inst: 'kick', vol: 0.26, steps: seq('C2 . . . C2 . . C2') },
      { inst: 'snare', vol: 0.08, steps: DRUM_ROCK.snare },
      { inst: 'shaker', vol: 0.03, steps: DRUM_ROCK.hat },
    ],
  },
  battle: {
    bpm: 144,
    channels: [
      { inst: 'lead', vol: 0.05, on: [1, 0, 1, 1, 0], steps: seq('A4 . C5 E5 . D5 C5 . B4 . G4 . B4 C5 D5 . C5 . A4 . F4 A4 C5 . B4 . E5 . D5 . B4 . A4 . C5 E5 . A5 G5 E5 F5 . E5 D5 C5 . B4 . A4 . C5 . F5 E5 D5 C5 B4 . G#4 . B4 . E5 .') },
      { inst: 'pluckMinor', vol: 0.03, on: [0, 1, 0, 0, 1], steps: seq('. A3 . A3 . A3 . A3 . G3 . G3 . G3 . G3 . F3 . F3 . F3 . F3 . E3 . E3 . E3 . E3') },
      { inst: 'bass', vol: 0.15, steps: seq('A2 A2 A3 A2 A2 A3 A2 A2 G2 G2 G3 G2 G2 G3 G2 G2 F2 F2 F3 F2 F2 F3 F2 F2 E2 E2 E3 E2 E2 E3 E2 E2') },
      { inst: 'kick', vol: 0.34, steps: seq('C2 . . C2 C2 . . .') },
      { inst: 'snare', vol: 0.11, steps: DRUM_ROCK.snare },
      { inst: 'hat', vol: 0.035, steps: DRUM_ROCK.hat },
    ],
  },
  boss: {
    bpm: 152,
    channels: [
      { inst: 'lead', vol: 0.055, on: [1, 1, 0], steps: seq('E5 . G5 . F#5 . D5 . E5 . B4 . . . E5 G5 A5 . G5 . F#5 . D5 . E5 . . . B4 . . . C5 . E5 . D5 . B4 . C5 . A4 . . . C5 E5 D#5 . F#5 . A5 . B5 . . . B4 . . .') },
      { inst: 'bass', vol: 0.16, steps: seq('E2 E2 E3 E2 E2 E3 E2 E2 G2 G2 G3 G2 D2 D2 D3 D2 C2 C2 C3 C2 C2 C3 C2 C2 B1 B1 B2 B1 B1 B2 D#2 B1') },
      { inst: 'kick', vol: 0.36, steps: seq('C2 . C2 . C2 . C2 .') },
      { inst: 'snare', vol: 0.12, steps: seq('. . C2 . . . C2 C2') },
      { inst: 'hat', vol: 0.04, steps: DRUM_ROCK.hat },
    ],
  },
  grocery: {
    bpm: 108,
    swing: 0.12,
    channels: [
      { inst: 'epiano', vol: 0.075, steps: seq('A4 . C5 . F5 . E5 D5 C5 . A4 . G4 . . . Bb4 . D5 . G5 . F5 E5 F5 . . . C5 . . . A4 . C5 . F5 . A5 G5 F5 . D5 . C5 . A4 . G4 . Bb4 . E5 . D5 C5 F5 . . . . . . .') },
      { inst: 'bass', vol: 0.12, steps: seq('F2 . A2 . C3 . A2 . D2 . F2 . A2 . F2 . G2 . Bb2 . D3 . Bb2 . C2 . E2 . G2 . C3 .') },
      { inst: 'hat', vol: 0.03, steps: seq('C2 . C2 C2 C2 . C2 C2') },
      { inst: 'kick', vol: 0.18, steps: seq('C2 . . . . . . .') },
      { inst: 'snare', vol: 0.05, steps: seq('. . . . C2 . . .') },
    ],
  },
  dance: {
    // Upbeat parade tune: oom-pah bass, strummed off-beats, twin trumpets in thirds, shakers.
    bpm: 138,
    channels: [
      { inst: 'trumpet', vol: 0.065, steps: seq('D5 . G5 . B5 . A5 G5 F#5 . A5 . D5 . . . E5 . A5 . C6 . B5 A5 G5 . B5 . G5 . . . D5 E5 F#5 G5 A5 . F#5 . G5 A5 B5 C6 D6 . B5 . C6 B5 A5 G5 F#5 . A5 . G5 . D5 . G5 . . .') },
      { inst: 'trumpet', vol: 0.04, steps: seq('B4 . D5 . G5 . F#5 E5 D5 . F#5 . A4 . . . C5 . F#5 . A5 . G5 F#5 E5 . G5 . D5 . . . B4 C5 D5 E5 F#5 . D5 . E5 F#5 G5 A5 B5 . G5 . A5 G5 F#5 E5 D5 . F#5 . B4 . B4 . D5 . . .') },
      { inst: 'bass', vol: 0.16, steps: seq('G2 . D2 . G2 . D2 . D2 . A1 . D2 . A1 . C2 . G1 . C2 . G1 . G2 . D2 . G2 . D2 .') },
      { inst: 'pluck', vol: 0.045, steps: seq('. G3 . G3 . G3 . G3 . D3 . D3 . D3 . D3 . C3 . C3 . C3 . C3 . G3 . G3 . G3 . G3') },
      { inst: 'shaker', vol: 0.045, steps: seq('C2 C2 C2 C2 C2 C2 C2 C2') },
      { inst: 'kick', vol: 0.24, steps: seq('C2 . . . C2 . . .') },
      { inst: 'clap', vol: 0.05, steps: seq('. . C2 . . . C2 C2') },
    ],
  },
};

const JINGLES = {
  victory: {
    len: 1.8,
    play(a) {
      const d = a.musicBus, t0 = a.ctx.currentTime + 0.02;
      ['C5', 'E5', 'G5', 'C6'].forEach((n, i) => INSTR.lead(a, d, t0 + i * 0.1, midi(n), 0.14, 0.1));
      ['C5', 'E5', 'G5', 'C6'].forEach((n) => INSTR.epiano(a, d, t0 + 0.42, midi(n), 0.7, 0.05));
      INSTR.lead(a, d, t0 + 0.42, midi('E6'), 0.8, 0.08);
      INSTR.pluck(a, d, t0 + 0.42, midi('C4'), 0.6, 0.08);
      INSTR.kick(a, d, t0 + 0.42, 0, 0.2, 0.35);
      INSTR.clap(a, d, t0 + 0.42, 0, 0.2, 0.06);
    },
  },
  defeat: {
    len: 1.6,
    play(a) {
      const d = a.musicBus;
      ['G4', 'F#4', 'F4', 'E4'].forEach((n, i) => INSTR.tri(a, d, a.ctx.currentTime + i * 0.28, midi(n), i === 3 ? 0.8 : 0.26, 0.14));
      INSTR.epiano(a, d, a.ctx.currentTime + 0.84, midi('C4'), 0.8, 0.05);
    },
  },
  unlock: {
    len: 1.0,
    play(a) {
      const d = a.musicBus;
      ['G5', 'B5', 'D6', 'G6'].forEach((n, i) => INSTR.epiano(a, d, a.ctx.currentTime + i * 0.07, midi(n), 0.2, 0.08));
      INSTR.epiano(a, d, a.ctx.currentTime + 0.3, midi('G5'), 0.5, 0.08);
    },
  },
  rare: {
    len: 1.4,
    play(a) {
      const d = a.musicBus;
      ['C5', 'E5', 'G5', 'B5', 'D6', 'G6'].forEach((n, i) => INSTR.epiano(a, d, a.ctx.currentTime + i * 0.06, midi(n), 0.4, 0.08));
    },
  },
};

// ---------------------------------------------------------------------------
// Sound effects: (audio, pitch, vol) - vol is applied by play() through a per-call gain.
const arp = (a, notes, step, o = {}) => notes.forEach((n, i) => a.tone({ type: o.type ?? 'triangle', f0: nhz(n) * (o.p ?? 1), dur: o.dur ?? 0.16, vol: o.vol ?? 0.08, delay: (o.delay ?? 0) + i * step, lp: o.lp ?? 0, pan: o.spread ? (i / (notes.length - 1) - 0.5) * o.spread : 0 }));

const SFX = {
  // ---- UI
  click: (a, p) => { a.tone({ type: 'sine', f0: 1050 * p, f1: 640 * p, dur: 0.05, vol: 0.095 }); a.snap(0.03, 4200); },
  tap: (a, p) => { a.tone({ type: 'sine', f0: 480 * p, f1: 980 * p, dur: 0.06, vol: 0.11 }); a.tone({ type: 'triangle', f0: 960 * p, f1: 1700 * p, dur: 0.035, vol: 0.03 }); a.snap(0.025, 5000); },
  deny: (a) => { a.tone({ type: 'triangle', f0: 220, f1: 190, dur: 0.1, vol: 0.12, lp: 1200 }); a.tone({ type: 'triangle', f0: 175, f1: 150, dur: 0.14, vol: 0.12, lp: 1200, delay: 0.11 }); a.thump(110, 70, 0.1, 0.08); },
  error: (a) => { a.tone({ type: 'triangle', f0: nhz('A3'), dur: 0.12, vol: 0.15, lp: 1400 }); a.tone({ type: 'triangle', f0: nhz('F3'), dur: 0.22, vol: 0.15, lp: 1400, delay: 0.12 }); },
  pop: (a, p) => { a.tone({ type: 'sine', f0: 380 * p, f1: 1250 * p, dur: 0.07, vol: 0.22, attack: 0.002 }); a.snap(0.05, 3000 * p); },
  bigPop: (a, p) => {
    a.tone({ type: 'sine', f0: 280 * p, f1: 1300 * p, dur: 0.1, vol: 0.28, attack: 0.002 });
    a.thump(140 * p, 42, 0.32, 0.38);
    a.noise({ dur: 0.38, vol: 0.2, type: 'lowpass', f0: 5000, f1: 300 });
    a.chime(1568 * p, 0.35, 0.03, 0.05);
  },
  bubble: (a, p) => a.tone({ type: 'sine', f0: rand(320, 480) * p, f1: rand(850, 1250) * p, dur: 0.06, vol: 0.07, attack: 0.003 }),
  bubblePop: (a, p) => { a.tone({ type: 'sine', f0: 560 * p, f1: 1150 * p, dur: 0.05, vol: 0.08, attack: 0.002 }); a.tone({ type: 'sine', f0: 900 * p, f1: 1500 * p, dur: 0.04, vol: 0.04, delay: 0.035 }); },
  blip: (a, p) => a.tone({ type: 'triangle', f0: 470 * p, f1: 440 * p, dur: 0.045, vol: 0.055, attack: 0.003, lp: 2400 }),
  tick: (a, p) => { a.tone({ type: 'sine', f0: 1700 * p, f1: 1400 * p, dur: 0.025, vol: 0.06, attack: 0.001 }); a.snap(0.02, 6000, 0, 0.01); },
  countTick: (a, p) => { a.tone({ type: 'sine', f0: 1400 * p, dur: 0.035, vol: 0.06, attack: 0.001 }); a.snap(0.018, 5000, 0, 0.01); },
  cardPick: (a, p) => { a.noise({ dur: 0.07, vol: 0.06, type: 'bandpass', f0: 2200 * p, f1: 5200 * p, q: 1.2, attack: 0.02 }); a.tone({ type: 'triangle', f0: 620 * p, f1: 940 * p, dur: 0.06, vol: 0.1 }); },
  emote: (a, p) => { a.tone({ type: 'sine', f0: 640 * p, f1: 880 * p, dur: 0.08, vol: 0.12 }); a.tone({ type: 'sine', f0: 990 * p, f1: 1180 * p, dur: 0.1, vol: 0.1, delay: 0.075, vibrato: 14, vibRate: 16 }); },
  go: (a) => {
    // bright stab + rising sweep + a thump: "let's go!"
    a.tone({ type: 'sawtooth', f0: nhz('G5'), dur: 0.42, vol: 0.06, lp: 2600, hold: 0.08 });
    a.tone({ type: 'sawtooth', f0: nhz('D6'), dur: 0.42, vol: 0.045, lp: 2600, hold: 0.08, detune: 6 });
    a.tone({ type: 'triangle', f0: nhz('G6'), dur: 0.3, vol: 0.05 });
    a.noise({ dur: 0.25, vol: 0.08, type: 'bandpass', f0: 800, f1: 5000, q: 1, attack: 0.05 });
    a.thump(150, 50, 0.2, 0.2);
  },
  countdown: (a, p) => { a.tone({ type: 'triangle', f0: 660 * p, dur: 0.14, vol: 0.12, hold: 0.03, lp: 2500 }); a.tone({ type: 'sine', f0: 1320 * p, dur: 0.08, vol: 0.03 }); },
  bell: (a) => { a.chime(1320, 0.9, 0.1); a.tone({ type: 'sine', f0: 1320 * 2.76, dur: 0.25, vol: 0.015 }); },
  alarm: (a, p) => {
    // a soft two-tone siren (wee-woo), filtered so it warns without drilling
    for (let i = 0; i < 3; i++) {
      a.tone({ type: 'triangle', f0: 740 * p, f1: 880 * p, dur: 0.2, vol: 0.065, hold: 0.1, lp: 1800, delay: i * 0.42, curve: 'lin' });
      a.tone({ type: 'triangle', f0: 880 * p, f1: 620 * p, dur: 0.2, vol: 0.065, hold: 0.1, lp: 1800, delay: i * 0.42 + 0.2, curve: 'lin' });
    }
  },
  horn: (a) => {
    // air-horn blasts: detuned saws through a low-pass
    for (const [d, len] of [[0, 0.22], [0.28, 0.4]]) {
      a.tone({ type: 'sawtooth', f0: 330, dur: len, vol: 0.07, attack: 0.015, hold: len * 0.6, lp: 1700, delay: d });
      a.tone({ type: 'sawtooth', f0: 415, dur: len, vol: 0.06, attack: 0.015, hold: len * 0.6, lp: 1700, delay: d, detune: 8 });
    }
  },
  // ---- movement
  whoosh: (a, p) => a.noise({ dur: 0.3, vol: 0.17, type: 'bandpass', f0: 380 * p, f1: 2600 * p, q: 1.3, attack: 0.1 }),
  swing: (a, p) => a.noise({ dur: 0.14, vol: 0.11, type: 'bandpass', f0: 800 * p, f1: 2800 * p, q: 1.6, attack: 0.04 }),
  flick: (a) => { a.noise({ dur: 0.07, vol: 0.12, type: 'highpass', f0: 2500, attack: 0.01 }); a.tone({ type: 'triangle', f0: 1200, f1: 420, dur: 0.1, vol: 0.1 }); },
  slosh: (a, p) => a.noise({ dur: 0.2, vol: 0.16, type: 'bandpass', f0: 480 * p, f1: 1400 * p, q: 2, attack: 0.04 }),
  fizz: (a) => a.noise({ dur: 0.5, vol: 0.08, type: 'highpass', f0: 4500, f1: 7500, attack: 0.04 }),
  // ---- combat
  hit: (a, p) => {
    a.thump(190 * p, 75 * p, 0.07, 0.13);
    a.noise({ dur: 0.05, vol: 0.08, type: 'bandpass', f0: 1700 * p, q: 0.9, attack: 0.001 });
    a.snap(0.03, 4500);
  },
  hitHeavy: (a, p) => {
    a.thump(130 * p, 40, 0.24, 0.3);
    a.noise({ dur: 0.2, vol: 0.22, type: 'lowpass', f0: 2400, f1: 220, attack: 0.001 });
    a.noise({ dur: 0.07, vol: 0.12, type: 'bandpass', f0: 900 * p, q: 1.2, attack: 0.001 });
  },
  bite: (a, p) => { a.noise({ dur: 0.05, vol: 0.16, type: 'bandpass', f0: 1800 * p, q: 2.5, attack: 0.001 }); a.tone({ type: 'sine', f0: 320 * p, f1: 130, dur: 0.06, vol: 0.14 }); },
  chomp: (a, p) => { for (const d of [0, 0.075]) { a.noise({ dur: 0.05, vol: 0.15, type: 'bandpass', f0: 1000 * p, q: 2, attack: 0.001, delay: d }); a.tone({ type: 'sine', f0: 240 * p, f1: 110, dur: 0.05, vol: 0.12, delay: d }); } },
  zap: (a, p) => {
    a.tone({ type: 'sawtooth', f0: 1500 * p, f1: 260 * p, dur: 0.14, vol: 0.08, lp: 4000 });
    for (let i = 0; i < 3; i++) a.noise({ dur: 0.025, vol: 0.06, type: 'bandpass', f0: rand(2500, 5000), q: 3, attack: 0.001, delay: i * 0.035 });
  },
  shoot: (a, p) => { a.tone({ type: 'triangle', f0: 1150 * p, f1: 340 * p, dur: 0.09, vol: 0.12 }); a.snap(0.025, 3000 * p); },
  laser: (a, p) => a.tone({ type: 'sawtooth', f0: 1500 * p, f1: 750 * p, dur: 0.18, vol: 0.06, vibrato: 40, vibRate: 28, lp: 3200 }),
  explode: (a, p) => {
    a.noise({ dur: 0.8, vol: 0.42, type: 'lowpass', f0: 2200 * p, f1: 80, attack: 0.002 });
    a.thump(95 * p, 30, 0.6, 0.5);
    for (let i = 0; i < 4; i++) a.noise({ dur: 0.04, vol: 0.07, type: 'bandpass', f0: rand(1200, 3200), q: 2, attack: 0.001, delay: 0.06 + i * rand(0.04, 0.08) });
  },
  boom: (a, p) => { a.thump(150 * p, 45, 0.3, 0.38); a.noise({ dur: 0.2, vol: 0.2, type: 'lowpass', f0: 1500 * p, f1: 200, attack: 0.002 }); },
  death: (a, p) => {
    // toy "poof": a falling boop + a puff of air
    a.tone({ type: 'sine', f0: 620 * p, f1: 150 * p, dur: 0.2, vol: 0.14 });
    a.noise({ dur: 0.24, vol: 0.12, type: 'lowpass', f0: 3200, f1: 300, attack: 0.01 });
  },
  crunch: (a, p) => {
    a.thump(110 * p, 50, 0.12, 0.12);
    for (let i = 0; i < 4; i++) a.noise({ dur: 0.06, vol: 0.11, type: 'bandpass', f0: rand(600, 2200) * p, q: 2, attack: 0.001, delay: i * 0.035 });
  },
  splat: (a, p) => {
    a.noise({ dur: 0.16, vol: 0.2, type: 'lowpass', f0: 1300 * p, f1: 200, attack: 0.002 });
    a.noise({ dur: 0.1, vol: 0.08, type: 'bandpass', f0: 500 * p, f1: 1300 * p, q: 3, delay: 0.02 });
    a.thump(200 * p, 55, 0.12, 0.18);
  },
  slime: (a, p) => a.tone({ type: 'sine', f0: 240 * p, f1: 70 * p, dur: 0.22, vol: 0.2, vibrato: 18, vibRate: 22 }),
  spawn: (a, p) => {
    // a bouncy "plop": quick rising boop over a little thump
    a.tone({ type: 'sine', f0: 260 * p, f1: 780 * p, dur: 0.09, vol: 0.13, attack: 0.002 });
    a.thump(120 * p, 60, 0.12, 0.1);
    a.snap(0.03, 2500 * p);
  },
  thud: (a, p) => { a.thump(115 * p, 40, 0.26, 0.42); a.noise({ dur: 0.1, vol: 0.12, type: 'lowpass', f0: 800, attack: 0.002 }); },
  kick: (a) => { a.thump(170, 45, 0.18, 0.42); a.snap(0.08, 2800); },
  roar: (a, p) => {
    a.tone({ type: 'sawtooth', f0: 115 * p, f1: 62 * p, dur: 0.9, vol: 0.15, vibrato: 10, vibRate: 17, attack: 0.06, hold: 0.25, lp: 1100 });
    a.tone({ type: 'sawtooth', f0: 172 * p, f1: 92 * p, dur: 0.8, vol: 0.08, vibrato: 12, vibRate: 13, attack: 0.06, hold: 0.2, lp: 1400 });
    a.noise({ dur: 0.9, vol: 0.18, type: 'lowpass', f0: 1000, f1: 300, attack: 0.06, hold: 0.2 });
  },
  growl: (a, p) => a.tone({ type: 'sawtooth', f0: 150 * p, f1: 92 * p, dur: 0.3, vol: 0.12, vibrato: 9, vibRate: 24, lp: 1300, attack: 0.02 }),
  squeak: (a, p) => a.tone({ type: 'sine', f0: 1450 * p, f1: 2050 * p, dur: 0.09, vol: 0.06, vibrato: 30, vibRate: 30 }),
  boing: (a, p) => a.tone({ type: 'sine', f0: 170 * p, f1: 520 * p, dur: 0.24, vol: 0.18, vibrato: 30, vibRate: 13 }),
  drum: (a) => { a.noise({ dur: 0.09, vol: 0.12, type: 'bandpass', f0: 320, q: 1, attack: 0.001 }); a.thump(130, 80, 0.08, 0.12); },
  freeze: (a) => {
    a.noise({ dur: 0.45, vol: 0.1, type: 'highpass', f0: 6000, f1: 2000, attack: 0.01 });
    for (let i = 0; i < 4; i++) a.chime(rand(2400, 3800), 0.25, 0.025, i * 0.05);
  },
  heal: (a) => arp(a, ['E5', 'G#5', 'B5', 'E6'], 0.055, { type: 'sine', dur: 0.26, vol: 0.08 }),
  magic: (a, p) => arp(a, ['C6', 'D6', 'E6', 'G6', 'A6', 'C7'], 0.04, { type: 'sine', dur: 0.2, vol: 0.045, p, spread: 0.6 }),
  shatter: (a) => {
    for (let i = 0; i < 6; i++) a.tone({ type: 'sine', f0: rand(2000, 4500), dur: rand(0.08, 0.16), vol: 0.04, attack: 0.001, delay: i * 0.028, pan: rand(-0.4, 0.4) });
    a.noise({ dur: 0.28, vol: 0.1, type: 'highpass', f0: 3500, attack: 0.002 });
    a.thump(180, 80, 0.06, 0.1);
  },
  cheer: (a) => {
    for (let i = 0; i < 10; i++) a.noise({ dur: rand(0.4, 1), vol: 0.05, type: 'bandpass', f0: rand(800, 2400), q: 4, delay: rand(0, 0.4), attack: 0.08, pan: rand(-0.6, 0.6) });
    a.noise({ dur: 1.2, vol: 0.07, type: 'bandpass', f0: 1200, q: 0.6, attack: 0.15, hold: 0.3 });
  },
  engine: (a) => {
    a.tone({ type: 'sawtooth', f0: 55, f1: 95, dur: 1.6, vol: 0.09, vibrato: 8, vibRate: 22, curve: 'lin', lp: 700, attack: 0.1, hold: 1 });
    a.noise({ dur: 1.6, vol: 0.08, type: 'lowpass', f0: 400, attack: 0.1, hold: 1 });
  },
  tear: (a) => a.noise({ dur: 0.25, vol: 0.16, type: 'bandpass', f0: 1500, f1: 4000, q: 1, attack: 0.02 }),
  // ---- rewards
  coin: (a, p) => {
    // classic "ba-ding": short B5 then a ringing E6
    a.tone({ type: 'triangle', f0: 988 * p, dur: 0.08, vol: 0.1, hold: 0.04 });
    a.tone({ type: 'sine', f0: 1976 * p, dur: 0.05, vol: 0.025 });
    a.chime(1319 * p, 0.3, 0.1, 0.075);
  },
  chaching: (a) => {
    a.noise({ dur: 0.08, vol: 0.1, type: 'bandpass', f0: 3000, q: 2, attack: 0.001 });
    a.chime(1319, 0.12, 0.09, 0.02);
    a.chime(1760, 0.5, 0.1, 0.08);
    a.noise({ dur: 0.35, vol: 0.06, type: 'bandpass', f0: 6000, q: 5, delay: 0.08 });
    a.tone({ type: 'sine', f0: 3520, dur: 0.4, vol: 0.025, delay: 0.1 });
  },
  upgrade: (a) => { arp(a, ['C5', 'E5', 'G5', 'C6'], 0.06, { dur: 0.16, vol: 0.09, lp: 3500 }); a.chime(nhz('E6'), 0.4, 0.04, 0.24); },
  levelUp: (a) => {
    arp(a, ['G4', 'C5', 'E5', 'G5', 'C6', 'E6'], 0.05, { dur: 0.16, vol: 0.085, lp: 3800, spread: 0.5 });
    ['C5', 'E5', 'G5'].forEach((n) => a.tone({ type: 'triangle', f0: nhz(n), dur: 0.6, vol: 0.04, delay: 0.3, hold: 0.15 }));
    a.chime(nhz('C7'), 0.6, 0.035, 0.32);
  },
  crown: (a) => { arp(a, ['G5', 'B5', 'D6', 'G6'], 0.07, { dur: 0.16, vol: 0.08, lp: 3500 }); a.chime(2093, 0.6, 0.05, 0.28); },
  fanfare: (a) => {
    arp(a, ['G4', 'C5', 'E5', 'G5'], 0.09, { type: 'sawtooth', dur: 0.14, vol: 0.05, lp: 2200 });
    ['C5', 'E5', 'G5', 'C6'].forEach((n) => a.tone({ type: 'sawtooth', f0: nhz(n), dur: 0.75, vol: 0.035, delay: 0.38, attack: 0.03, hold: 0.25, lp: 2400 }));
    a.chime(nhz('C7'), 0.8, 0.04, 0.42);
    a.thump(150, 50, 0.2, 0.25, 0.38);
  },
  // ---- vial opening (src/scenes/vialOpen.js)
  pour: (a, p) => {
    a.noise({ dur: 0.9, vol: 0.14, type: 'bandpass', f0: 650 * p, f1: 1100 * p, q: 1.4, attack: 0.1, hold: 0.4 });
    for (let i = 0; i < 6; i++) a.tone({ type: 'sine', f0: rand(260, 420) * p, f1: rand(700, 1100) * p, dur: 0.07, vol: 0.05, delay: 0.1 + i * 0.12 });
  },
  rattle: (a, p) => { for (let i = 0; i < 4; i++) a.noise({ dur: 0.035, vol: 0.15, type: 'bandpass', f0: rand(1600, 3200) * p, q: 4, attack: 0.001, delay: i * 0.045 }); },
  latch: (a, p) => {
    a.tone({ type: 'triangle', f0: 1900 * p, f1: 900 * p, dur: 0.04, vol: 0.1 });
    a.snap(0.1, 3200);
    a.tone({ type: 'triangle', f0: 1300 * p, f1: 700 * p, dur: 0.05, vol: 0.08, delay: 0.07 });
    a.snap(0.06, 2600, 0.07);
  },
  cork: (a, p) => { a.tone({ type: 'sine', f0: 380 * p, f1: 1900 * p, dur: 0.07, vol: 0.3, attack: 0.002 }); a.noise({ dur: 0.09, vol: 0.18, type: 'highpass', f0: 2200, attack: 0.001 }); },
  flare: (a, p) => {
    a.noise({ dur: 0.85, vol: 0.13, type: 'bandpass', f0: 300 * p, f1: 3200 * p, q: 2, attack: 0.55 });
    a.tone({ type: 'sawtooth', f0: 180 * p, f1: 760 * p, dur: 0.85, vol: 0.045, attack: 0.6, curve: 'lin', lp: 2000 });
  },
  heartbeat: (a, p) => { a.thump(95 * p, 40, 0.16, 0.5); a.thump(80 * p, 36, 0.14, 0.32, 0.17); },
  lightsOut: (a) => { a.tone({ type: 'sawtooth', f0: 420, f1: 45, dur: 0.6, vol: 0.1, lp: 1200 }); a.noise({ dur: 0.18, vol: 0.18, type: 'lowpass', f0: 900, attack: 0.002 }); a.thump(90, 35, 0.3, 0.15); },
  shimmer: (a, p) => { for (let i = 0; i < 9; i++) a.tone({ type: 'sine', f0: (1500 + i * 240) * p, dur: 0.3, vol: 0.035, delay: i * 0.035, pan: (i / 8 - 0.5) * 0.8 }); },
  reveal: (a, p) => { a.noise({ dur: 0.18, vol: 0.1, type: 'bandpass', f0: 1100 * p, f1: 3200 * p, q: 1.5, attack: 0.04 }); a.chime(1320 * p, 0.25, 0.08, 0.07); },
  stamp: (a) => { a.thump(240, 90, 0.1, 0.3); a.noise({ dur: 0.08, vol: 0.18, type: 'lowpass', f0: 1600, attack: 0.001 }); },
};

export const audio = new AudioSys();
