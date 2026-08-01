/**
 * Shared audio settings persistence helpers.
 * Used by both the profile screen (UI) and the forge screen (init-time restore).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import AudioManager from './AudioManager';

export const AUDIO_SETTINGS_KEY = '@fk_audio_settings';

export interface AudioSettings {
  muted: boolean;
  /** User-facing SFX volume 0–1 */
  volume: number;
  /** Music volume 0–1 (independent) */
  musicVolume?: number;
  /** Ambience volume 0–1 (independent) */
  ambienceVolume?: number;
}

/** Load audio prefs from AsyncStorage and apply them to AudioManager. */
export async function applyStoredAudioSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(AUDIO_SETTINGS_KEY);
    if (!raw) return;
    const settings: AudioSettings = JSON.parse(raw);
    AudioManager.setVolume(settings.volume ?? 1);
    AudioManager.setMusicVolume(settings.musicVolume ?? 0.6);
    AudioManager.setAmbienceVolume(settings.ambienceVolume ?? 0.5);
    AudioManager.setMuted(settings.muted ?? false);
  } catch {
    // ignore — audio works with defaults
  }
}

/** Persist current audio settings to AsyncStorage. */
export async function saveAudioSettings(settings: AudioSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
