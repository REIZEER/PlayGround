const STORAGE_KEY = "rast.sound";
const BPM = 112;
const STEP = 60 / BPM / 4;

const BARS = [
  { root: 55.0, chord: [220.0, 261.63, 329.63] },
  { root: 43.65, chord: [174.61, 220.0, 261.63] },
  { root: 65.41, chord: [261.63, 329.63, 392.0] },
  { root: 49.0, chord: [196.0, 246.94, 293.66] },
];

const ARP = [0, 1, 2, 1, 0, 2, 1, 2];

export class AudioEngine {
  constructor() {
    let saved = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      saved = null;
    }
    this.enabled = saved !== "off";
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
    this.timer = null;
    this.step = 0;
    this.nextTime = 0;
    this.musicLevel = 0.2;
    this.paused = false;
  }

  ensure() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.72 : 0.0001;
      this.master.connect(this.ctx.destination);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = 0.9;
      this.sfxBus.connect(this.master);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicLevel;
      this.musicBus.connect(this.master);

      this.noiseBuffer = this.makeNoise();
      this.startMusic();
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
  }

  makeNoise() {
    const length = Math.floor(this.ctx.sampleRate * 1.2);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setEnabled(enabled) {
    this.enabled = Boolean(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, this.enabled ? "on" : "off");
    } catch {
      /* storage may be unavailable */
    }
    if (!this.ctx) {
      if (this.enabled) this.ensure();
      return;
    }
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.exponentialRampToValueAtTime(this.enabled ? 0.72 : 0.0001, now + 0.18);
  }

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  setPaused(paused) {
    this.paused = paused;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(Math.max(0.001, this.musicBus.gain.value), now);
    this.musicBus.gain.exponentialRampToValueAtTime(
      paused ? 0.02 : this.musicLevel,
      now + 0.4,
    );
  }

  startMusic() {
    if (this.timer || !this.ctx) return;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.schedule(), 90);
  }

  schedule() {
    if (!this.ctx) return;
    if (this.enabled === false) {
      this.nextTime = Math.max(this.nextTime, this.ctx.currentTime);
    }
    while (this.nextTime < this.ctx.currentTime + 0.28) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(step, when) {
    if (!this.ctx || !this.enabled) return;
    const bar = BARS[Math.floor(step / 16) % BARS.length];
    const s = step % 16;

    if (s === 0 || s === 8) this.kick(when, s === 0 ? 0.055 : 0.034);

    if ([0, 3, 6, 8, 11, 14].includes(s)) {
      this.tone({
        freq: bar.root,
        dur: s === 8 ? 0.36 : 0.24,
        type: "triangle",
        gain: 0.035,
        attack: 0.01,
        bus: this.musicBus,
        when,
        filter: 420,
      });
    }

    if (s === 0) {
      for (let i = 0; i < bar.chord.length; i += 1) {
        this.tone({
          freq: bar.chord[i],
          dur: 2.05,
          type: "sawtooth",
          gain: 0.009,
          attack: 0.5,
          release: 1.1,
          bus: this.musicBus,
          when: when + i * 0.015,
          filter: 760,
          detune: i % 2 === 0 ? 3 : -3,
        });
      }
    }

    if (s % 2 === 0) {
      const note = bar.chord[ARP[(s / 2) % ARP.length] % bar.chord.length] * 2;
      this.tone({
        freq: note,
        dur: 0.16,
        type: "triangle",
        gain: 0.012,
        attack: 0.004,
        release: 0.1,
        bus: this.musicBus,
        when,
        filter: 2400,
      });
    }

    if (s % 4 === 2) this.hat(when, 0.008);
  }

  tone({ freq, to, dur = 0.12, type = "sine", gain = 0.05, attack = 0.004, release = 0.06, bus, when = 0, filter = null, detune = 0 }) {
    if (!this.ctx) return;
    const t = when || this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (to && to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    if (detune) osc.detune.value = detune;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + Math.max(0.002, attack));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur + release);

    let node = osc;
    if (filter) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = filter;
      lp.Q.value = 0.7;
      node.connect(lp);
      node = lp;
    }
    node.connect(env);
    env.connect(bus || this.sfxBus || this.master);
    osc.start(t);
    osc.stop(t + dur + release + 0.04);
  }

  noise({ dur = 0.2, gain = 0.05, freq = 700, q = 0.9, type = "bandpass", when = 0, sweep = null }) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = when || this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, sweep), t + dur);
    filter.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(Math.max(0.0002, gain), t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(env);
    env.connect(this.sfxBus || this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  kick(when, gain) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.12);
    env.gain.setValueAtTime(gain, when);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
    osc.connect(env);
    env.connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.24);
  }

  hat(when, gain) {
    this.noise({ dur: 0.035, gain, freq: 7000, q: 1.1, type: "highpass", when });
  }

  shoot() {
    if (!this.ctx || !this.enabled) return;
    this.tone({
      freq: 880,
      to: 420,
      dur: 0.055,
      type: "square",
      gain: 0.012,
      attack: 0.002,
      release: 0.02,
      filter: 3200,
    });
  }

  pickup() {
    if (!this.ctx || !this.enabled) return;
    this.tone({ freq: 1180, to: 1760, dur: 0.08, type: "sine", gain: 0.035, release: 0.05 });
  }

  hit() {
    if (!this.ctx || !this.enabled) return;
    this.noise({ dur: 0.09, gain: 0.035, freq: 2200, q: 0.7 });
    this.tone({ freq: 420, to: 190, dur: 0.07, type: "square", gain: 0.016, filter: 1800 });
  }

  explode(size = 1) {
    if (!this.ctx || !this.enabled) return;
    const clamp = Math.min(1.6, Math.max(0.7, size));
    this.noise({ dur: 0.28 * clamp, gain: 0.055 * clamp, freq: 520, q: 0.55, sweep: 90 });
    this.tone({ freq: 120, to: 42, dur: 0.25 * clamp, type: "sine", gain: 0.05 * clamp, release: 0.1, filter: 400 });
  }

  dash() {
    if (!this.ctx || !this.enabled) return;
    this.noise({ dur: 0.22, gain: 0.045, freq: 420, q: 0.8, sweep: 2400 });
    this.tone({ freq: 620, to: 980, dur: 0.16, type: "sawtooth", gain: 0.013, filter: 2400 });
  }

  hurt() {
    if (!this.ctx || !this.enabled) return;
    this.tone({ freq: 210, to: 52, dur: 0.36, type: "sawtooth", gain: 0.055, release: 0.12, filter: 900 });
    this.noise({ dur: 0.24, gain: 0.05, freq: 900, q: 0.5, sweep: 120 });
  }

  wave() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    [329.63, 440, 659.25].forEach((freq, i) => {
      this.tone({
        freq,
        dur: 0.32,
        type: "triangle",
        gain: 0.024,
        when: now + i * 0.07,
        release: 0.2,
        filter: 3800,
      });
    });
  }

  overdrive() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    [392, 523.25, 659.25, 1046.5].forEach((freq, i) => {
      this.tone({
        freq,
        dur: 0.5,
        type: "sawtooth",
        gain: 0.02,
        when: now + i * 0.05,
        release: 0.3,
        filter: 3000,
      });
    });
  }

  over() {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    [440, 329.63, 261.63, 174.61].forEach((freq, i) => {
      this.tone({
        freq,
        dur: 0.6,
        type: "triangle",
        gain: 0.03,
        when: now + i * 0.14,
        release: 0.5,
        filter: 1600,
      });
    });
    this.noise({ dur: 0.8, gain: 0.025, freq: 800, q: 0.4, sweep: 80, when: now + 0.2 });
  }

  click() {
    if (!this.ctx || !this.enabled) return;
    this.tone({ freq: 760, to: 980, dur: 0.05, type: "triangle", gain: 0.025, release: 0.03 });
  }
}
