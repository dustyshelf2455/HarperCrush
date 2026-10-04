/**
 * Turns the composer's beat-based events into scheduled Web Audio notes.
 * Runs a short look-ahead scheduler so tempo changes (wind-down) take
 * effect within half a second.
 */
import { createRng } from '../shared/rng';
import { CHORDS, type Chord, chordTones } from '../shared/scale';
import { Composer, type SketchSpec } from './composer';
import type { AudioEngine, Channel, MusicLevel, PadVoice } from './engine';

const LOOKAHEAD_SECONDS = 0.5;
const TICK_MS = 100;

export class MusicPlayer {
  private composer: Composer | null = null;
  private spec: SketchSpec | null = null;
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

  get current(): SketchSpec | null {
    return this.spec;
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
    this.emit();
    const ctx = await this.engine.unlock();
    if (!ctx || generation !== this.generation) return;
    this.channel = this.engine.createChannel();
    this.composer = new Composer(spec, createRng(seed));
    this.composer.setWindDown(windDown);
    this.bpm = this.composer.bpm;
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
    const wasPlaying = this.spec !== null;
    this.channel = null;
    this.pad = null;
    this.composer = null;
    this.spec = null;
    this.stopAt = null;
    if (wasPlaying) this.emit();
  }

  /** The chord sounding now (the home chord, G, when nothing plays), so every chime and phrase agrees with the tune (DESIGN.md 3.11). */
  get chord(): Chord {
    if (!this.composer) return CHORDS.G;
    return this.composer.chordAt(this.beatAt(this.engine.now));
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
    const composer = this.composer;
    const channel = this.channel;
    if (!ctx || !composer || !channel) return;
    const now = ctx.currentTime;
    if (this.stopAt !== null && now > this.stopAt) {
      this.stop(3);
      return;
    }
    const events = composer.next(this.beatAt(now + LOOKAHEAD_SECONDS));
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
