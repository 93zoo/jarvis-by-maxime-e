/**
 * AudioManager — centralized audio for Forge & Kingdoms
 *
 * Native (iOS/Android): plays real .mp3 files via expo-audio.
 * Web: synthesizes sounds via the Web Audio API (no external files required).
 */

import { Platform } from 'react-native';

// expo-audio is loaded lazily on native so a missing native module doesn't
// crash the whole app on Expo Go SDK 54 if the module isn't registered.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExpoAudioPlayer = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _createAudioPlayer: ((src: any) => ExpoAudioPlayer) | null = null;
function getCreateAudioPlayer() {
  if (_createAudioPlayer) return _createAudioPlayer;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _createAudioPlayer = require('expo-audio').createAudioPlayer;
  } catch { _createAudioPlayer = null; }
  return _createAudioPlayer;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OscType = OscillatorType;

interface SynthOptions {
  frequency?: number;
  type?: OscType;
  duration?: number;
  gain?: number;
  /** Exponential decay: gain falls to `decayTarget` over `duration` ms */
  decay?: boolean;
  decayTarget?: number;
  /** Detune in cents */
  detune?: number;
}

// ─── Sound asset map ─────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SoundModule = any;

const SOUND_FILES: Record<string, SoundModule> = {
  hammer_strike:  require('../assets/sounds/hammer_strike.mp3'),
  perfect_strike: require('../assets/sounds/perfect_strike.mp3'),
  craft_complete: require('../assets/sounds/craft_complete.mp3'),
  craft_fail:     require('../assets/sounds/craft_fail.mp3'),
  achievement:    require('../assets/sounds/achievement.mp3'),
  collect:        require('../assets/sounds/collect.mp3'),
  click:          require('../assets/sounds/click.mp3'),
  coin:           require('../assets/sounds/coin.mp3'),
  quest_complete: require('../assets/sounds/quest_complete.mp3'),
  talent_unlock:  require('../assets/sounds/talent_unlock.mp3'),
};

// ─── AudioManagerClass ───────────────────────────────────────────────────────

class AudioManagerClass {
  // Web Audio API fields
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;

  // expo-audio players (native only)
  private nativePlayers: Record<string, ExpoAudioPlayer> = {};
  private nativeLoaded = false;
  private nativeAmbiencePlayer: ExpoAudioPlayer | null = null;
  private ambienceVolume = 0.18;

  private muted = false;
  private volume = 0.35;
  /** User-facing volume level 0–1 (before the internal 0.35 ceiling). */
  private volumeLevel = 1.0;

  // Forge ambience nodes (fire crackle loop)
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceGainNode: GainNode | null = null;
  private ambienceSource2: AudioBufferSourceNode | null = null; // low rumble
  private ambienceRafId: number | null = null;

  /** Must be called after a user gesture (browser autoplay policy on web). */
  init(): void {
    if (Platform.OS !== 'web') {
      this._loadNativeSounds();
    } else {
      this._initWebAudio();
    }
  }

  // ── Native (expo-audio) ──────────────────────────────────────────────────────

  private _loadNativeSounds(): void {
    const cap = getCreateAudioPlayer();
    if (!cap) { this.nativeLoaded = false; return; }
    try {
      for (const [key, src] of Object.entries(SOUND_FILES)) {
        const player: ExpoAudioPlayer = cap(src);
        player.volume = this.muted ? 0 : this.volume;
        this.nativePlayers[key] = player;
      }
      this.nativeLoaded = true;
    } catch {
      this.nativeLoaded = false;
    }
  }

  private _playNative(key: string): void {
    if (this.muted) return;
    if (!this.nativeLoaded) return;
    const player: ExpoAudioPlayer = this.nativePlayers[key];
    if (!player) return;
    try {
      player.volume = this.volume;
      // Seek to start then play so the same player can be reused
      player.seekTo(0).then(() => player.play()).catch(() => {
        // Fallback: just call play directly
        try { player.play(); } catch { /* ignore */ }
      });
    } catch {
      // ignore playback errors
    }
  }

  // ── Web Audio API synthesis ─────────────────────────────────────────────────

  private _initWebAudio(): void {
    if (typeof window === 'undefined') return;
    if (!('AudioContext' in window) && !('webkitAudioContext' in window)) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      this.ctx = new Ctx() as AudioContext;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // ignore — audio not available
    }
  }

  private synth(opts: SynthOptions): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const {
        frequency = 440,
        type = 'sine',
        duration = 200,
        gain = 0.5,
        decay = true,
        decayTarget = 0.001,
        detune = 0,
      } = opts;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(frequency, now);
      osc.detune.setValueAtTime(detune, now);

      gainNode.gain.setValueAtTime(gain, now);
      if (decay) {
        gainNode.gain.exponentialRampToValueAtTime(decayTarget, now + duration / 1000);
      }

      osc.connect(gainNode);
      gainNode.connect(this.masterGain!);

      osc.start(now);
      osc.stop(now + duration / 1000 + 0.05);
    } catch {
      // ignore synthesis errors
    }
  }

  /** Play a short note for chaining melodies (web only). */
  private note(freq: number, startSec: number, dur = 0.15, gain = 0.4): void {
    if (!this.ctx || !this.masterGain || this.muted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gainNode = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startSec);
      gainNode.gain.setValueAtTime(gain, startSec);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startSec + dur);
      osc.connect(gainNode);
      gainNode.connect(this.masterGain!);
      osc.start(startSec);
      osc.stop(startSec + dur + 0.05);
    } catch {
      // ignore
    }
  }

  // ── Public sound API ────────────────────────────────────────────────────────

  /** Metallic hammer strike on an anvil */
  playHammerStrike(): void {
    if (Platform.OS !== 'web') { this._playNative('hammer_strike'); return; }
    this.synth({ frequency: 320, type: 'sawtooth', duration: 120, gain: 0.6, decay: true, detune: -20 });
    this.synth({ frequency: 800, type: 'triangle', duration: 80, gain: 0.3, decay: true });
  }

  /** Perfect / excellent strike bonus feedback */
  playPerfectStrike(): void {
    if (Platform.OS !== 'web') { this._playNative('perfect_strike'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(880, now, 0.1, 0.4);
    this.note(1100, now + 0.1, 0.1, 0.3);
  }

  /** Soft UI button press */
  playClick(): void {
    if (Platform.OS !== 'web') { this._playNative('click'); return; }
    this.synth({ frequency: 600, type: 'triangle', duration: 60, gain: 0.25, decay: true });
  }

  /** Item collected (positive pop) */
  playCollect(): void {
    if (Platform.OS !== 'web') { this._playNative('collect'); return; }
    this.synth({ frequency: 520, type: 'sine', duration: 90, gain: 0.3, decay: true });
    this.synth({ frequency: 780, type: 'sine', duration: 60, gain: 0.15, decay: true, detune: 5 });
  }

  /** Gold received / sale completed */
  playCoin(): void {
    if (Platform.OS !== 'web') { this._playNative('coin'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(1047, now, 0.08, 0.3);
    this.note(1319, now + 0.08, 0.08, 0.25);
  }

  /** Quest completed / order delivered */
  playQuestComplete(): void {
    if (Platform.OS !== 'web') { this._playNative('quest_complete'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(523, now, 0.12, 0.35);
    this.note(659, now + 0.12, 0.12, 0.35);
    this.note(784, now + 0.24, 0.12, 0.35);
    this.note(1047, now + 0.36, 0.2, 0.4);
  }

  /** Achievement unlocked — triumphant ascending arpeggio */
  playAchievement(): void {
    if (Platform.OS !== 'web') { this._playNative('achievement'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      this.note(freq, now + i * 0.1, 0.18, 0.4);
    });
  }

  /** Region unlocked */
  playRegionUnlock(): void {
    if (Platform.OS !== 'web') { this._playNative('achievement'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(392, now, 0.15, 0.4);
    this.note(523, now + 0.15, 0.15, 0.4);
    this.note(659, now + 0.3, 0.25, 0.4);
  }

  /** Craft completed successfully */
  playCraftComplete(): void {
    if (Platform.OS !== 'web') { this._playNative('craft_complete'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(659, now, 0.1, 0.35);
    this.note(784, now + 0.1, 0.1, 0.35);
    this.note(988, now + 0.2, 0.1, 0.35);
    this.note(1175, now + 0.3, 0.2, 0.4);
  }

  /** Craft failed */
  playCraftFail(): void {
    if (Platform.OS !== 'web') { this._playNative('craft_fail'); return; }
    this.synth({ frequency: 200, type: 'sawtooth', duration: 300, gain: 0.3, decay: true, detune: -10 });
  }

  /** Talent unlocked */
  playTalentUnlock(): void {
    if (Platform.OS !== 'web') { this._playNative('talent_unlock'); return; }
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(440, now, 0.12, 0.35);
    this.note(554, now + 0.12, 0.12, 0.35);
    this.note(659, now + 0.24, 0.2, 0.4);
  }

  /** Error / negative action */
  playError(): void {
    if (Platform.OS !== 'web') { this._playNative('craft_fail'); return; }
    this.synth({ frequency: 160, type: 'sawtooth', duration: 200, gain: 0.3, decay: true });
  }

  // ── Forge ambience — fire crackle + low rumble loop ─────────────────────────

  /**
   * Starts a looping fire-crackle ambience.
   * Web: synthesised brown-noise via Web Audio API.
   * Native: loops hammer_strike at low volume as a stand-in until a real
   *         ambience track is added (task #77).
   * Safe to call multiple times — won't stack layers.
   */
  startForgeAmbience(): void {
    if (Platform.OS !== 'web') {
      if (!this.nativeLoaded || this.muted) return;
      if (this.nativeAmbiencePlayer) return; // already running
      try {
        const cap = getCreateAudioPlayer();
        if (!cap) return;
        const p: ExpoAudioPlayer = cap(require('../assets/sounds/hammer_strike.mp3'));
        p.volume = this.ambienceVolume * this.volumeLevel;
        p.loop = true;
        p.play();
        this.nativeAmbiencePlayer = p;
      } catch { /* ignore */ }
      return;
    }
    if (!this.ctx || !this.masterGain) this._initWebAudio();
    if (!this.ctx || !this.masterGain || this.muted) return;
    if (this.ambienceSource) return; // already running

    try {
      const ctx = this.ctx;

      // ── Layer 1: brown-noise fire crackle ──────────────────────────────────
      // 3-second noise buffer looped; filtered to low-mid (fire texture)
      const sampleRate = ctx.sampleRate;
      const bufLen = Math.floor(sampleRate * 3);
      const buf = ctx.createBuffer(1, bufLen, sampleRate);
      const data = buf.getChannelData(0);

      // Generate brown noise (integrated white noise — warmer, deeper)
      let lastOut = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut + 0.02 * white) / 1.02;
        data[i] = lastOut * 3.5; // amplify
      }

      const crackleSrc = ctx.createBufferSource();
      crackleSrc.buffer = buf;
      crackleSrc.loop = true;
      crackleSrc.playbackRate.value = 1.0;

      // Bandpass + lowpass chain to sculpt fire sound
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 380;
      bp.Q.value = 0.6;

      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.Q.value = 0.5;

      const crackleGain = ctx.createGain();
      crackleGain.gain.value = 0.12;

      crackleSrc.connect(bp);
      bp.connect(lp);
      lp.connect(crackleGain);
      crackleGain.connect(this.masterGain);
      crackleSrc.start();
      this.ambienceSource = crackleSrc;

      // ── Layer 2: deep sub-rumble (forge bellows / structural low end) ──────
      const rumbleBuf = ctx.createBuffer(1, Math.floor(sampleRate * 5), sampleRate);
      const rumbleData = rumbleBuf.getChannelData(0);
      let rv = 0;
      for (let i = 0; i < rumbleData.length; i++) {
        rv = (rv + 0.005 * (Math.random() * 2 - 1)) / 1.005;
        rumbleData[i] = rv * 8;
      }

      const rumbleSrc = ctx.createBufferSource();
      rumbleSrc.buffer = rumbleBuf;
      rumbleSrc.loop = true;
      rumbleSrc.playbackRate.value = 0.7;

      const rumbleLp = ctx.createBiquadFilter();
      rumbleLp.type = 'lowpass';
      rumbleLp.frequency.value = 120;
      rumbleLp.Q.value = 0.4;

      const rumbleGain = ctx.createGain();
      rumbleGain.gain.value = 0.18;

      rumbleSrc.connect(rumbleLp);
      rumbleLp.connect(rumbleGain);
      rumbleGain.connect(this.masterGain);
      rumbleSrc.start();
      this.ambienceSource2 = rumbleSrc;
      this.ambienceGainNode = crackleGain;

      // ── Slow gain modulation — makes the fire feel alive (breathing) ───────
      let ambiT = 0;
      const modulateAmbience = () => {
        if (!this.ambienceSource) return; // stopped
        ambiT += 0.016;
        const mod = 1.0 + Math.sin(ambiT * 0.8) * 0.18 + Math.sin(ambiT * 1.9) * 0.10;
        crackleGain.gain.value = 0.12 * mod;
        rumbleGain.gain.value  = 0.18 * (0.9 + Math.sin(ambiT * 0.5) * 0.12);
        this.ambienceRafId = requestAnimationFrame(modulateAmbience);
      };
      this.ambienceRafId = requestAnimationFrame(modulateAmbience);

    } catch {
      // Silently degrade if Web Audio isn't available
    }
  }

  /** Stops the forge ambience loop. */
  stopForgeAmbience(): void {
    // Native: pause the looping player
    if (Platform.OS !== 'web') {
      if (this.nativeAmbiencePlayer) {
        try { this.nativeAmbiencePlayer.pause(); } catch { /* ignore */ }
        this.nativeAmbiencePlayer = null;
      }
      return;
    }
    if (this.ambienceRafId !== null) {
      cancelAnimationFrame(this.ambienceRafId);
      this.ambienceRafId = null;
    }
    if (this.ambienceSource) {
      try { this.ambienceSource.stop(); } catch { /* ignore */ }
      this.ambienceSource = null;
    }
    if (this.ambienceSource2) {
      try { this.ambienceSource2.stop(); } catch { /* ignore */ }
      this.ambienceSource2 = null;
    }
    this.ambienceGainNode = null;
  }

  // ── Volume control ──────────────────────────────────────────────────────────

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.masterGain) {
      this.masterGain.gain.value = value ? 0 : this.volume;
    }
    if (Platform.OS !== 'web') {
      const v = value ? 0 : this.volume;
      Object.values(this.nativePlayers).forEach((p) => {
        try { p.volume = v; } catch { /* ignore */ }
      });
      if (this.nativeAmbiencePlayer) {
        try { this.nativeAmbiencePlayer.volume = value ? 0 : this.ambienceVolume; } catch { /* ignore */ }
      }
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(vol: number): void {
    this.volumeLevel = Math.max(0, Math.min(1, vol));
    this.volume = this.volumeLevel * 0.35;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    if (Platform.OS !== 'web') {
      const v = this.muted ? 0 : this.volume;
      Object.values(this.nativePlayers).forEach((p) => {
        try { p.volume = v; } catch { /* ignore */ }
      });
      if (this.nativeAmbiencePlayer) {
        try { this.nativeAmbiencePlayer.volume = this.muted ? 0 : this.ambienceVolume; } catch { /* ignore */ }
      }
    }
  }

  /** Returns the user-facing volume level 0–1. */
  getVolume(): number {
    return this.volumeLevel;
  }
}

const AudioManager = new AudioManagerClass();
export default AudioManager;
