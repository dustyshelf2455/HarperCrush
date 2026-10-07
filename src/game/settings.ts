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
  reducedMotion: 'follow' | 'on' | 'off';
  /**
   * Session length in minutes, or 0 for no timer (DESIGN.md 3.8, as decided in the Stage 3 play-test:
   * the last four minutes get sleepy, then the level ends at the map). Counts foreground play only.
   */
  sessionMinutes: 0 | 5 | 10 | 15 | 20 | 30;
  /** The sleepy stretch at the end of a timed session (and after "Finish after this level"); off, the level simply ends when the time is up. */
  windDown: boolean;
  /**
   * How long the sleeping scene stays after an ending before a relaunch opens the game again
   * (DESIGN.md 3.8), in minutes; 0 means until a grown-up opens the gate and taps New session.
   */
  restUntilMinutes: 0 | 15 | 30 | 60;
  /** The night dimmer (DESIGN.md 3.9): how much of the screen's light to take away, 0 to 0.75. */
  nightDim: number;
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
  reducedMotion: 'follow',
  sessionMinutes: 0,
  windDown: true,
  restUntilMinutes: 30,
  nightDim: 0,
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
