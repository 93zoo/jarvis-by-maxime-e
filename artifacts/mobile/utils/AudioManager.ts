/**
 * AudioManager — centralized audio for Forge & Kingdoms
 *
 * Web: synthesizes sounds via the Web Audio API (no external files required).
 * Native: gracefully no-ops (real sounds can be added via expo-av later).
 */

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

class AudioManagerClass {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;

  /** Must be called after a user gesture (browser autoplay policy). */
  init(): void {
    if (typeof window === 'undefined' || !('AudioContext' in window) && !('webkitAudioContext' in window)) {
      return; // native — skip Web Audio
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Ctx = (window as any).AudioContext ?? (window as any).webkitAudioContext;
      this.ctx = new Ctx() as AudioContext;
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.35;
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

  /** Play a short note for chaining melodies. */
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
    // High metallic thud: mix a short noise burst + pitched ring
    this.synth({ frequency: 320, type: 'sawtooth', duration: 120, gain: 0.6, decay: true, detune: -20 });
    this.synth({ frequency: 800, type: 'triangle', duration: 80, gain: 0.3, decay: true });
  }

  /** Perfect / excellent strike bonus feedback */
  playPerfectStrike(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(880, now, 0.1, 0.4);
    this.note(1100, now + 0.1, 0.1, 0.3);
  }

  /** Soft UI button press */
  playClick(): void {
    this.synth({ frequency: 600, type: 'triangle', duration: 60, gain: 0.25, decay: true });
  }

  /** Item collected (positive pop) */
  playCollect(): void {
    this.synth({ frequency: 520, type: 'sine', duration: 90, gain: 0.3, decay: true });
    this.synth({ frequency: 780, type: 'sine', duration: 60, gain: 0.15, decay: true, detune: 5 });
  }

  /** Gold received / sale completed */
  playCoin(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(1047, now, 0.08, 0.3);       // C6
    this.note(1319, now + 0.08, 0.08, 0.25); // E6
  }

  /** Quest completed / order delivered */
  playQuestComplete(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(523, now, 0.12, 0.35);        // C5
    this.note(659, now + 0.12, 0.12, 0.35); // E5
    this.note(784, now + 0.24, 0.12, 0.35); // G5
    this.note(1047, now + 0.36, 0.2, 0.4);  // C6
  }

  /** Achievement unlocked — triumphant ascending arpeggio */
  playAchievement(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
    notes.forEach((freq, i) => {
      this.note(freq, now + i * 0.1, 0.18, 0.4);
    });
  }

  /** Region unlocked */
  playRegionUnlock(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(392, now, 0.15, 0.4);         // G4
    this.note(523, now + 0.15, 0.15, 0.4);  // C5
    this.note(659, now + 0.3, 0.25, 0.4);   // E5
  }

  /** Craft completed successfully */
  playCraftComplete(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(659, now, 0.1, 0.35);         // E5
    this.note(784, now + 0.1, 0.1, 0.35);   // G5
    this.note(988, now + 0.2, 0.1, 0.35);   // B5
    this.note(1175, now + 0.3, 0.2, 0.4);   // D6
  }

  /** Craft failed */
  playCraftFail(): void {
    this.synth({ frequency: 200, type: 'sawtooth', duration: 300, gain: 0.3, decay: true, detune: -10 });
  }

  /** Talent unlocked */
  playTalentUnlock(): void {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.note(440, now, 0.12, 0.35);
    this.note(554, now + 0.12, 0.12, 0.35);
    this.note(659, now + 0.24, 0.2, 0.4);
  }

  /** Error / negative action */
  playError(): void {
    this.synth({ frequency: 160, type: 'sawtooth', duration: 200, gain: 0.3, decay: true });
  }

  // ── Volume control ──────────────────────────────────────────────────────────

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.masterGain) {
      this.masterGain.gain.value = value ? 0 : 0.35;
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  setVolume(vol: number): void {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, vol)) * 0.35;
    }
  }
}

const AudioManager = new AudioManagerClass();
export default AudioManager;
