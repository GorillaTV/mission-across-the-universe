// Audio for the game. The ambient beds and the laser SFX are REAL, public-domain
// NASA recordings from the "Sounds from Beyond" collection (nasa.gov), processed
// into short looping clips. Small UI blips (collect / mission / travel / win) are
// synthesised with the Web Audio API so they stay crisp and tiny.
//
//   mars-wind.mp3   - Wind on Mars, NASA Perseverance rover SuperCam microphone.
//   space-radio.mp3 - Plasma-wave radio emissions at Jupiter, NASA Juno (Ganymede flyby).
//   driving.mp3     - Perseverance rover driving across Jezero Crater.
//   laser.mp3       - Perseverance SuperCam laser zapping a Martian rock.

const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/';

const FILES = {
  wind: 'audio/mars-wind.mp3',
  radio: 'audio/space-radio.mp3',
  driving: 'audio/driving.mp3',
  laser: 'audio/laser.mp3',
};

// Per-world ambient bed + an honest on-arrival credit. NASA has only ever
// recorded real audio on Mars (microphones) and in Jupiter's magnetosphere
// (Juno's plasma-wave radio). Mars gets its wind; every other world gets the
// Juno space-radio bed as the authentic "sound of space".
const PLANET_AUDIO = {
  moon: { bed: 'radio' },
  mars: { bed: 'wind' },
  mercury: { bed: 'radio' },
  venus: { bed: 'radio' },
  jupiter: { bed: 'radio', jupiter: true },
  saturn: { bed: 'radio' },
  uranus: { bed: 'radio' },
  neptune: { bed: 'radio' },
  pluto: { bed: 'radio' },
};

const CREDIT = {
  wind: '🔊 Real NASA audio: wind on Mars, recorded by Perseverance\u2019s SuperCam microphone.',
  radio:
    '🔊 Real NASA audio: plasma-wave radio emissions in Jupiter\u2019s magnetosphere, recorded by the Juno spacecraft \u2014 the eerie \u201csound\u201d of deep space.',
  jupiter:
    '🔊 Real NASA audio: radio emissions recorded as Juno flew past Jupiter\u2019s moon Ganymede.',
};

const AMBIENT_VOL = 0.34;
const DRIVE_VOL = 0.4;
const LASER_VOL = 0.7;

export class SoundManager {
  constructor() {
    this.muted = localStorage.getItem('mau-muted') === '1';
    this.unlocked = false;
    this.currentBed = null;
    this._fades = new Map();
    this._creditedBed = new Set();

    this.audio = {};
    for (const [key, path] of Object.entries(FILES)) {
      const a = new Audio(BASE + path);
      a.preload = 'auto';
      if (key === 'wind' || key === 'radio' || key === 'driving') a.loop = true;
      a.volume = 0;
      this.audio[key] = a;
    }

    this.ctx = null; // lazily created on first gesture
  }

  // Must be called from within a user gesture (click / key / touch).
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !this.ctx) this.ctx = new AC();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch {}
    // Kick the ambient bed now that we're allowed to make noise.
    if (this.currentBed) this._playBed(this.currentBed);
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('mau-muted', muted ? '1' : '0');
    if (muted) {
      for (const a of Object.values(this.audio)) a.volume = 0;
    } else {
      if (this.currentBed) this._fade(this.currentBed, AMBIENT_VOL, 400);
    }
    return this.muted;
  }

  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  // Switch ambient bed for a planet. Returns the credit line (or null) so the
  // caller can surface it once per world.
  setPlanet(planet) {
    const cfg = PLANET_AUDIO[planet.id] || { bed: 'radio' };
    const bed = cfg.bed;
    if (bed !== this.currentBed) {
      const prev = this.currentBed;
      this.currentBed = bed;
      if (prev) this._fade(prev, 0, 700, true);
      if (this.unlocked) this._playBed(bed);
    }
    const creditKey = cfg.jupiter ? 'jupiter' : bed;
    if (!this._creditedBed.has(planet.id)) {
      this._creditedBed.add(planet.id);
      return CREDIT[creditKey];
    }
    return null;
  }

  // Fade the ambient down while a travel cutscene plays.
  duckAmbient() {
    if (this.currentBed) this._fade(this.currentBed, 0, 500);
  }

  _playBed(bed) {
    if (this.muted) return;
    const a = this.audio[bed];
    if (!a) return;
    a.play().catch(() => {});
    this._fade(bed, AMBIENT_VOL, 600);
  }

  // ---- Rover driving loop ----
  setDriving(on) {
    const a = this.audio.driving;
    if (!a) return;
    if (on && !this.muted) {
      if (a.paused) a.play().catch(() => {});
      this._fade('driving', DRIVE_VOL, 220);
    } else {
      this._fade('driving', 0, 260);
    }
  }

  // ---- One-shot SFX ----
  playLaser() {
    if (this.muted || !this.unlocked) return;
    const a = this.audio.laser;
    try {
      a.currentTime = 0;
      a.volume = LASER_VOL;
      a.play().catch(() => {});
    } catch {}
  }

  collect() {
    this._blip(880, 0.07, 'triangle', 0.18);
    this._blip(1320, 0.09, 'sine', 0.12, 0.04);
  }

  chime() {
    this._blip(660, 0.12, 'sine', 0.2);
    this._blip(990, 0.16, 'sine', 0.18, 0.1);
    this._blip(1320, 0.22, 'sine', 0.15, 0.22);
  }

  whoosh() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(680, t + 0.8);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + 0.95);
  }

  fanfare() {
    [523, 659, 784, 1046].forEach((f, i) => this._blip(f, 0.3, 'triangle', 0.18, i * 0.13));
  }

  _blip(freq, dur, type = 'sine', vol = 0.2, delay = 0) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // ---- Volume fader for HTMLAudio elements ----
  _fade(key, target, ms, pauseAtEnd = false) {
    const a = this.audio[key];
    if (!a) return;
    if (this.muted) target = 0;
    const existing = this._fades.get(key);
    if (existing) clearInterval(existing);
    const from = a.volume;
    const steps = Math.max(1, Math.round(ms / 30));
    let i = 0;
    const id = setInterval(() => {
      i++;
      const v = from + (target - from) * (i / steps);
      a.volume = Math.min(1, Math.max(0, v));
      if (i >= steps) {
        clearInterval(id);
        this._fades.delete(key);
        if (pauseAtEnd && a.volume <= 0.001) {
          try { a.pause(); } catch {}
        }
      }
    }, 30);
    this._fades.set(key, id);
  }
}
