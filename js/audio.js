// Procedural Web Audio: punches, bell, crowd, pub ambience. No asset files needed.
class AudioSys {
  constructor() { this.ctx = null; this.crowdLevel = 0; this.enabled = true; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    const ctx = this.ctx = new C();
    this.master = ctx.createGain(); this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(ctx.destination);
    // noise buffers
    const len = ctx.sampleRate * 2;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.white.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    this._crowd();
    this._room();
  }

  _noise(buf, loop = true) { const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = loop; return s; }

  _crowd() {
    const ctx = this.ctx;
    const src = this._noise(this.brown);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.6;
    const bp2 = ctx.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = 1200; bp2.gain.value = 6;
    this.crowdGain = ctx.createGain(); this.crowdGain.gain.value = 0;
    // murmur LFO
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.31;
    const lg = ctx.createGain(); lg.gain.value = 0.15;
    lfo.connect(lg); lg.connect(this.crowdGain.gain);
    src.connect(bp); bp.connect(bp2); bp2.connect(this.crowdGain); this.crowdGain.connect(this.master);
    src.start(); lfo.start();
  }

  _room() {
    // low hum / rain for pub
    const ctx = this.ctx;
    const rain = this._noise(this.white);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(hp); hp.connect(lp); lp.connect(this.rainGain); this.rainGain.connect(this.master);
    rain.start();
  }

  setAmbience(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const crowd = kind === 'fight' ? 0.55 : kind === 'fightSmall' ? 0.3 : kind === 'pub' ? 0.09 : 0;
    const rain = kind === 'pub' ? 0.035 : kind === 'gym' ? 0.02 : 0;
    this.crowdGain.gain.setTargetAtTime(crowd, t, 0.8);
    this.rainGain.gain.setTargetAtTime(rain, t, 0.8);
    this.baseCrowd = crowd;
  }

  cheer(amount = 1) {
    if (!this.ctx || !this.baseCrowd) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this._noise(this.white, false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 400; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.25 * amount, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.2 + amount);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 2.5 + amount);
  }

  punch(strength = 1, blocked = false, body = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    // flesh slap
    const src = this._noise(this.white, false);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = blocked ? 900 : body ? 1400 : 2600;
    const g = ctx.createGain();
    const vol = (blocked ? 0.35 : 0.7) * (0.5 + strength * 0.5);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + (blocked ? 0.07 : 0.12));
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.2);
    // thump
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(blocked ? 140 : 110, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const og = ctx.createGain(); og.gain.setValueAtTime(vol * (body ? 1.2 : 0.9), t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(og); og.connect(this.master); o.start(t); o.stop(t + 0.2);
    if (strength > 0.8 && !blocked) this.cheer(Math.min(1.5, strength - 0.4));
  }

  whoosh(speed = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = this._noise(this.white, false);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(1800 * speed, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + 0.2);
  }

  bell(times = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    for (let k = 0; k < times; k++) {
      const t = ctx.currentTime + k * 0.32;
      [[820, 0.3], [1340, 0.18], [2150, 0.1], [2900, 0.06]].forEach(([f, v]) => {
        const o = ctx.createOscillator(); o.frequency.value = f;
        const g = ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0008, t + 1.8);
        o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 2);
      });
    }
  }

  thud() { // body hitting canvas
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.5);
    this.punch(0.6, true, true);
  }

  tick(high = false) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = high ? 1200 : 700;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.07);
  }

  ui() { this.tick(true); }
}

export const audio = new AudioSys();
