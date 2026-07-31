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
   * Starts a melodic forge ambience — warm harmonic drone.
   * Web: three detuned oscillators + shimmer + slow breath (Web Audio API).
   * Native: silent — the hammer strike plays only on tap; a real audio file
   *         will be wired in via task #77.
   * Safe to call multiple times — won't stack layers.
   */
  startForgeAmbience(): void {
    // Native: no looping sound — hammer plays only on actual taps
    if (Platform.OS !== 'web') return;

    if (!this.ctx || !this.masterGain) this._initWebAudio();
    if (!this.ctx || !this.masterGain || this.muted) return;
    if (this.ambienceSource) return; // already running

    try {
      const ctx = this.ctx;
      const mg = this.masterGain;

      // ── Shared warm lowpass filter ─────────────────────────────────────────
      const warmLp = ctx.createBiquadFilter();
      warmLp.type = 'lowpass';
      warmLp.frequency.value = 800;
      warmLp.Q.value = 0.7;
      warmLp.connect(mg);

      // ── Master ambience gain (breathing envelope lives here) ───────────────
      const ambiGain = ctx.createGain();
      ambiGain.gain.value = 0.13;
      ambiGain.connect(warmLp);
      this.ambienceGainNode = ambiGain;

      // Helper: make one sustained oscillator
      const makeOsc = (freq: number, detuneCents: number, gainVal: number, type: OscType = 'sine') => {
        const osc = ctx.createOscillator();
        const g   = ctx.createGain();
        osc.type  = type;
        osc.frequency.value = freq;
        osc.detune.value    = detuneCents;
        g.gain.value        = gainVal;
        osc.connect(g);
        g.connect(ambiGain);
        osc.start();
        return osc;
      };

      // ── Layer 1: root drone F2 (~87 Hz) ────────────────────────────────────
      const osc1 = makeOsc(87.3, 0,   1.0, 'sine');
      // ── Layer 2: fifth C3 (~130 Hz) slightly detuned for warmth ───────────
      const osc2 = makeOsc(130.8, +8, 0.55, 'sine');
      // ── Layer 3: octave F3 (~175 Hz), soft triangle ─────────────────────── 
      const osc3 = makeOsc(174.6, -6, 0.35, 'triangle');
      // ── Layer 4: high shimmer F4, very quiet ───────────────────────────────
      const osc4 = makeOsc(349.2, +14, 0.10, 'sine');

      // Store first osc as the sentinel so stopForgeAmbience knows we're live
      this.ambienceSource = osc1 as unknown as AudioBufferSourceNode;
      this.ambienceSource2 = osc2 as unknown as AudioBufferSourceNode;
      // (osc3 / osc4 are stopped in stopForgeAmbience via the gain disconnect)

      // ── Slow breath: gentle amplitude swell every ~6 s ────────────────────
      let t = 0;
      const breathe = () => {
        if (!this.ambienceSource) return;
        t += 0.016;
        // Two overlapping sine waves give an organic, uneven breath
        const breath = 0.13 + Math.sin(t * 0.55) * 0.035 + Math.sin(t * 1.1) * 0.018;
        ambiGain.gain.value = breath;
        this.ambienceRafId = requestAnimationFrame(breathe);
      };
      this.ambienceRafId = requestAnimationFrame(breathe);

      // Stop osc3 / osc4 on stopForgeAmbience by hooking into ambienceGainNode
      // We store references via a closure so the stop method can reach them.
      (this as unknown as Record<string, unknown>)._ambiOsc3 = osc3;
      (this as unknown as Record<string, unknown>)._ambiOsc4 = osc4;

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
    // Stop all oscillator nodes (ambienceSource = osc1, ambienceSource2 = osc2,
    // plus osc3 / osc4 stored via closure key)
    const self = this as unknown as Record<string, unknown>;
    for (const key of ['ambienceSource', 'ambienceSource2', '_ambiOsc3', '_ambiOsc4']) {
      const node = self[key] as { stop?: () => void } | null;
      if (node) { try { node.stop?.(); } catch { /* ignore */ } self[key] = null; }
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
