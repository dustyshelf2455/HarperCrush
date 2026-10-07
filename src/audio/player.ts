/**
 * Turns the composer's beat-based events into scheduled Web Audio notes.
 * Runs a short look-ahead scheduler so tempo changes (wind-down) take
 * effect within half a second.
 */
import { createRng } from '../shared/rng';
import { CHORDS, type Chord, chordTones } from '../shared/scale';
import type { AreaId } from '../core/journey';
import { Composer, type MusicEvent, type SketchSpec } from './composer';
import type { AudioEngine, Channel, MusicLevel, PadVoice } from './engine';
import { ThemeComposer, type VoiceWeights } from './theme';

const LOOKAHEAD_SECONDS = 0.5;
const TICK_MS = 100;
/** Seconds the theme takes to move from one area's voice to the next as the map crosses a border. */
export const THEME_CROSS_SECONDS = 3;

/** What the player plays: a sketch's composer under a level, or the theme on the splash and the map. */
interface MusicSource {
  readonly bpm: number;
  chordAt(beat: number): Chord;
  next(upTo: number): MusicEvent[];
}

export class MusicPlayer {
  private source: MusicSource | null = null;
  private composer: Composer | null = null;
  private theme: ThemeComposer | null = null;
  private spec: SketchSpec | null = null;
  /** The theme's voice weights, eased toward `themeTarget` a little every tick. */
  private themeWeights: VoiceWeights = {};
  private themeTarget: AreaId | null = null;
  private lastTick = 0;
  /** What is playing, for the debug overlay and the app: a sketch's id, or theme-<area>. */
  private playing: string | null = null;
  private channel: Channel | null = null;
  private generation = 0;
  private pad: PadVoice | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private anchorBeat = 0;
  private anchorTime = 0;
  private bpm = 60;
  private stopAt: number | null = null;
  private listeners = new Set<() => void>();

  constructor(private readonly engine: AudioEngine) {}

  /** The sketch playing under a level, or null (also null while the theme plays). */
  get current(): SketchSpec | null {
    return this.spec;
  }

  /** The id of whatever plays: a sketch's id, `theme-<area>` for the theme, or null. */
  get currentId(): string | null {
    return this.playing;
  }

  get isTheme(): boolean {
    return this.theme !== null;
  }

  get isWindDown(): boolean {
    return this.composer?.isWindDown ?? false;
  }

  /** Notified whenever playback starts or stops. */
  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(spec: SketchSpec, seed: number, windDown: boolean, autoStopSeconds: number | null = 60): Promise<void> {
    this.stop(1.2);
    const generation = ++this.generation;
    // Announce the sketch at once so a second tap on its button stops it, even while unlocking.
    this.spec = spec;
    this.playing = spec.id;
    this.emit();
    const ctx = await this.engine.unlock();
    if (!ctx || generation !== this.generation) return;
    const composer = new Composer(spec, createRng(seed));
    composer.setWindDown(windDown);
    this.composer = composer;
    this.begin(ctx, composer, autoStopSeconds);
  }

  /**
   * The Glimmerfall theme (theme.ts) in an area's voice, for the launch picture and the map. It plays until
   * stopped; `setThemeArea` moves it into another area's voice without a break as the view crosses a border.
   */
  async startTheme(area: AreaId, seed: number): Promise<void> {
    this.stop(1.2);
    const generation = ++this.generation;
    this.playing = `theme-${area}`;
    this.themeWeights = { [area]: 1 };
    this.themeTarget = area;
    this.emit();
    const ctx = await this.engine.unlock();
    if (!ctx || generation !== this.generation) return;
    const theme = new ThemeComposer(createRng(seed), this.themeWeights);
    this.theme = theme;
    this.lastTick = ctx.currentTime;
    this.begin(ctx, theme, null);
  }

  /** The area whose voice the theme should move to; no-op when the theme is not playing or already heading there. */
  setThemeArea(area: AreaId): void {
    if (this.themeTarget === area) return;
    this.themeTarget = area;
    if (this.theme) {
      this.playing = `theme-${area}`;
      this.emit();
    }
  }

  /** The theme's current voice weights (tests and the debug overlay). */
  get themeMix(): Readonly<VoiceWeights> {
    return this.themeWeights;
  }

  private begin(ctx: AudioContext, source: MusicSource, autoStopSeconds: number | null): void {
    this.channel = this.engine.createChannel();
    this.source = source;
    this.bpm = source.bpm;
    this.anchorBeat = 0;
    this.anchorTime = ctx.currentTime + 0.15;
    this.stopAt = autoStopSeconds === null ? null : ctx.currentTime + autoStopSeconds;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.emit();
  }

  setWindDown(on: boolean): void {
    if (!this.composer) return;
    const now = this.engine.now;
    this.anchorBeat = this.beatAt(now);
    this.anchorTime = now;
    this.composer.setWindDown(on);
    this.bpm = this.composer.bpm;
    this.emit();
  }

  stop(fadeSeconds = 1.5): void {
    this.generation++;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const ctx = this.engine.context;
    const channel = this.channel;
    const pad = this.pad;
    if (ctx && channel) {
      const t = ctx.currentTime;
      for (const g of [channel.dry, channel.wet]) {
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + fadeSeconds);
      }
      pad?.release(t, fadeSeconds);
      setTimeout(() => {
        channel.dry.disconnect();
        channel.wet.disconnect();
      }, (fadeSeconds + 4) * 1000);
    }
    const wasPlaying = this.playing !== null;
    this.channel = null;
    this.pad = null;
    this.composer = null;
    this.theme = null;
    this.source = null;
    this.spec = null;
    this.playing = null;
    this.themeTarget = null;
    this.themeWeights = {};
    this.stopAt = null;
    if (wasPlaying) this.emit();
  }

  /** The chord sounding now (the home chord, G, when nothing plays), so every chime and phrase agrees with the tune (DESIGN.md 3.11). */
  get chord(): Chord {
    if (!this.source) return CHORDS.G;
    return this.source.chordAt(this.beatAt(this.engine.now));
  }

  /** MIDI notes of the chord sounding now, in the given degree window, for chimes. */
  chordNow(lo = 5, hi = 14): number[] {
    return chordTones(this.chord, lo, hi);
  }

  /** The parent's music level, soft or normal (DESIGN.md 3.11); soft is the Stage 2 loudness. Safe to call before the first sound. */
  setLevel(level: MusicLevel): void {
    this.engine.setMusicLevel(level);
  }

  /** Dip the music for a big effect and ease back over `seconds` (DESIGN.md 3.11). `at` is an audio-clock time; defaults to now. */
  duck(seconds: number, at?: number): void {
    this.engine.duck(seconds, at);
  }

  private beatAt(time: number): number {
    return this.anchorBeat + ((time - this.anchorTime) * this.bpm) / 60;
  }

  private timeAt(beat: number): number {
    return this.anchorTime + ((beat - this.anchorBeat) * 60) / this.bpm;
  }

  private tick(): void {
    const ctx = this.engine.context;
    const source = this.source;
    const channel = this.channel;
    if (!ctx || !source || !channel) return;
    const now = ctx.currentTime;
    if (this.stopAt !== null && now > this.stopAt) {
      this.stop(3);
      return;
    }
    if (this.theme && this.themeTarget) {
      this.themeWeights = crossWeights(this.themeWeights, this.themeTarget, (now - this.lastTick) / THEME_CROSS_SECONDS);
      this.theme.setWeights(this.themeWeights);
    }
    this.lastTick = now;
    const events = source.next(this.beatAt(now + LOOKAHEAD_SECONDS));
    for (const ev of events) {
      const t = Math.max(now + 0.03, this.timeAt(ev.beat));
      switch (ev.kind) {
        case 'chord': {
          const previous = this.pad;
          this.pad = this.engine.pad(ev.midis, t, ev.level, channel);
          // Release at the same moment the new pad starts: a linear crossfade with no dip.
          previous?.release(t);
          break;
        }
        case 'note':
          this.engine.note(ev.instrument, ev.midi, t, ev.vel, channel);
          break;
        case 'bass':
          this.engine.bass(ev.midi, t, ev.vel, channel);
          break;
        case 'ping':
          this.engine.ping(ev.midi, t, ev.vel, channel);
          break;
      }
    }
  }

  private emit(): void {
    this.listeners.forEach((l) => l());
  }
}

/**
 * One step of the theme's crossing: the target voice gains `step` of the
 * weight (a share of the crossing time), taken evenly from the voices that
 * are leaving, so the weights always sum to one and a flick through several
 * areas simply retargets mid-way. Pure, for the tests.
 */
export function crossWeights(weights: Readonly<VoiceWeights>, target: AreaId, step: number): VoiceWeights {
  const k = Math.max(0, Math.min(1, step));
  const have = weights[target] ?? 0;
  const others = (Object.keys(weights) as AreaId[]).filter((id) => id !== target && (weights[id] ?? 0) > 0);
  if (others.length === 0) return { [target]: 1 };
  const gain = Math.min(1 - have, k);
  const leaving = 1 - have;
  const out: VoiceWeights = { [target]: have + gain };
  for (const id of others) {
    const w = (weights[id] ?? 0) * (1 - gain / leaving);
    if (w > 0.002) out[id] = w;
  }
  if (Object.keys(out).length === 1) out[target] = 1;
  return out;
}
