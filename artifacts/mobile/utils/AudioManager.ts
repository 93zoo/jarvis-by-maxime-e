/**
 * AudioManager — centralized audio for Forge & Kingdoms
 *
 * Native (iOS/Android): loads real .mp3 files via expo-av for premium feel.
 * Web: synthesizes sounds via the Web Audio API (no external files required).
 */

import { Platform } from 'react-native';

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

  // expo-av fields (native only)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private avSounds: Record<string, any> = {};
  private avLoaded = false;

  private muted = false;
  private volume = 0.35;

  /** Must be called after a user gesture (browser autoplay policy on web). */
  init(): void {
    if (Platform.OS !== 'web') {
      this._loadNativeSounds();
    } else {
      this._initWebAudio();
    }
  }

  // ── Native (expo-av) ────────────────────────────────────────────────────────

  private async _loadNativeSounds(): Promise<void> {
    if (this.avLoaded) return;
    try {
      // Dynamic import so web bundlers never try to load expo-av
      const { Audio } = await import('expo-av');
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      const entries = Object.entries(SOUND_FILES);
      const loaded = await Promise.all(
        entries.map(async ([key, module]) => {
          const { sound } = await Audio.Sound.createAsync(module, {
            shouldPlay: false,
            volume: this.volume,
          });
          return [key, sound] as const;
        }),
      );

      for (const [key, sound] of loaded) {
        this.avSounds[key] = sound;
      }
      this.avLoaded = true;
    } catch {
      // expo-av unavailable — silently degrade
    }
  }

  private async _playNative(key: string): Promise<void> {
    if (this.muted) return;
    if (!this.avLoaded) return;
    const sound = this.avSounds[key];
    if (!sound) return;
    try {
      await sound.setVolumeAsync(this.volume);
      await sound.replayAsync();
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

  // ── Volume control ──────────────────────────────────────────────────────────

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.masterGain) {
      this.masterGain.gain.value = value ? 0 : this.volume;
    }
    if (Platform.OS !== 'web') {
      // Update volume on all loaded sounds
      Object.values(this.avSounds).forEach((sound) => {
        try { sound?.setVolumeAsync(value ? 0 : this.volume); } catch { /* ignore */ }
      });
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol)) * 0.35;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
  }
}

const AudioManager = new AudioManagerClass();
export default AudioManager;
