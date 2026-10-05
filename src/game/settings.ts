/**
 * Parent settings (DESIGN.md 3.9): typed, defaulted, saved in localStorage
 * separately from her progress so a reset of one never touches the other.
 */

export interface Settings {
  /** Music on; mixed beneath the chimes. */
  music: boolean;
  musicLevel: 'soft' | 'normal';
  chimes: boolean;
  /** Ask iOS for the playback session so sound plays through Silent mode (decided in the Stage 2 play-tests). */
  playOnSilent: boolean;
  /** Scales each mode's own hint delay: quick halves it, slow doubles it, off never hints. */
  hintDelay: 'quick' | 'normal' | 'slow' | 'off';
  /** The tap-time haptic tick experiment (DESIGN.md 3.12). */
  haptics: boolean;
  reducedMotion: 'follow' | 'on' | 'off';
  /**
   * Session length in minutes, or 0 for no timer (DESIGN.md 3.8, as decided in the Stage 3 play-test:
   * the last four minutes get sleepy, then the level ends at the map). Counts foreground play only.
   */
  sessionMinutes: 0 | 5 | 10 | 15 | 20 | 30;
  /** Play mode's overall level; used by the Stage 4 level generator. */
  playDifficulty: 'gentle' | 'medium' | 'bigger';
  /** The soft breathing vignette around the board. */
  breathingGlow: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  music: true,
  musicLevel: 'soft',
  chimes: true,
  playOnSilent: true,
  hintDelay: 'normal',
  haptics: true,
  reducedMotion: 'follow',
  sessionMinutes: 0,
  playDifficulty: 'gentle',
  breathingGlow: true,
};

export const SETTINGS_KEY = 'glimmerfall.settings.v1';

/** The hint delay in ms for a mode's base delay, or null for no hints. */
export function hintDelayMs(setting: Settings['hintDelay'], baseMs: number): number | null {
  switch (setting) {
    case 'quick':
      return Math.round(baseMs / 2);
    case 'normal':
      return baseMs;
    case 'slow':
      return baseMs * 2;
    case 'off':
      return null;
  }
}

export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(s: Settings) => void>();

  constructor(private readonly key: string = SETTINGS_KEY) {
    this.value = { ...DEFAULT_SETTINGS, ...this.load() };
  }

  get(): Settings {
    return this.value;
  }

  set(patch: Partial<Settings>): void {
    this.value = { ...this.value, ...patch };
    try {
      localStorage.setItem(this.key, JSON.stringify(this.value));
    } catch {
      /* storage can be unavailable; settings then last for the session */
    }
    this.listeners.forEach((l) => l(this.value));
  }

  /** Called after every change with the new settings. Returns an unsubscribe function. */
  onChange(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Partial<Settings> {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Partial<Settings>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
}
