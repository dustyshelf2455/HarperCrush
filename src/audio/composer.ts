/**
 * The composer is pure: given a sketch specification and a seeded RNG it
 * produces a stream of musical events in beats. The player turns beats into
 * seconds and Web Audio nodes. Keeping this split means the music can be
 * tested without a browser.
 */
import type { Rng } from '../shared/rng';
import { type Chord, chordRootIn, chordTones, degreeToMidi } from '../shared/scale';

/**
 * The melody voices the engine can synthesise. The first three are the Stage 1
 * sketch voices; the rest are the area voices of DESIGN.md 2c and 3.11: glass
 * for Crystal Cave, water for Mermaid Lagoon, horn for Cloud Castle, harp for
 * Star Garden, shimmer for Aurora Peak, kalimba for Dragon Hollow.
 */
export type MelodyInstrument = 'celesta' | 'marimba' | 'bell' | 'glass' | 'water' | 'horn' | 'harp' | 'shimmer' | 'kalimba';
export const MELODY_INSTRUMENTS: readonly MelodyInstrument[] = ['celesta', 'marimba', 'bell', 'glass', 'water', 'horn', 'harp', 'shimmer', 'kalimba'];

/** One note of a motif: scale degree relative to the melody base, and length in beats. */
export interface MotifNote {
  readonly d: number;
  readonly b: number;
}
export type Motif = readonly MotifNote[];

export interface MelodySpec {
  readonly instrument: MelodyInstrument;
  /** Scale degree the motifs are written against (10 = G5). */
  readonly base: number;
  readonly motifs: readonly Motif[];
  /** Rest between motifs, in beats [min, max]. */
  readonly rest: readonly [number, number];
  /** Probability that a note gets a quick grace note before it. */
  readonly ornament: number;
  /** Probability that a motif is answered an octave lower, quietly. */
  readonly echo: number;
  /** Probability that the last note of a motif is held longer. */
  readonly hold: number;
  readonly velocity: readonly [number, number];
}

export interface BassSpec {
  /** Beat offsets within a four-beat bar. */
  readonly beats: readonly number[];
  readonly level: number;
}

export interface ShimmerSpec {
  /** Gap between pings, in beats [min, max]. */
  readonly every: readonly [number, number];
  readonly level: number;
  /** Degree window the pings are drawn from. */
  readonly degrees: readonly [number, number];
}

export interface WindDownSpec {
  readonly bpm: number;
  readonly melody: Partial<MelodySpec>;
  readonly padLevel?: number;
  readonly bass?: BassSpec | null;
  readonly shimmer?: ShimmerSpec | null;
}

export interface SketchSpec {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly bpm: number;
  readonly melody: MelodySpec;
  readonly chords: readonly Chord[];
  readonly beatsPerChord: number;
  readonly padLevel: number;
  /** Degree window for pad voicings. */
  readonly padDegrees: readonly [number, number];
  readonly bass: BassSpec | null;
  readonly shimmer: ShimmerSpec | null;
  readonly windDown: WindDownSpec;
}

export type MusicEvent =
  | { kind: 'note'; instrument: MelodyInstrument; beat: number; midi: number; vel: number }
  | { kind: 'bass'; beat: number; midi: number; vel: number }
  | { kind: 'ping'; beat: number; midi: number; vel: number }
  | { kind: 'chord'; beat: number; chord: Chord; midis: number[]; level: number };

const BEATS_PER_BAR = 4;

export class Composer {
  private readonly queue: MusicEvent[] = [];
  private readonly bassQueue: MusicEvent[] = [];
  private melodyCursor = 1;
  private chordCursor = 0;
  private barCursor = 0;
  private shimmerCursor = 2;
  private lastMotif = -1;
  private windDown = false;

  constructor(
    private readonly spec: SketchSpec,
    private readonly rng: Rng,
  ) {
    if (spec.chords.length === 0) throw new Error('a sketch needs at least one chord');
    if (spec.melody.motifs.length === 0) throw new Error('a sketch needs at least one motif');
  }

  get bpm(): number {
    return this.windDown ? this.spec.windDown.bpm : this.spec.bpm;
  }

  get isWindDown(): boolean {
    return this.windDown;
  }

  setWindDown(on: boolean): void {
    this.windDown = on;
  }

  /** The chord that is sounding at a given beat. */
  chordAt(beat: number): Chord {
    const index = Math.floor(Math.max(0, beat) / this.spec.beatsPerChord) % this.spec.chords.length;
    return this.spec.chords[index] ?? (this.spec.chords[0] as Chord);
  }

  /** Every event with beat < upTo that has not been returned yet, in beat order. */
  next(upTo: number): MusicEvent[] {
    const out: MusicEvent[] = [];
    this.emitChords(upTo, out);
    this.emitBass(upTo, out);
    this.emitShimmer(upTo, out);
    this.emitMelody(upTo, out);
    out.sort((a, b) => a.beat - b.beat);
    return out;
  }

  private melody(): MelodySpec {
    return this.windDown ? { ...this.spec.melody, ...this.spec.windDown.melody } : this.spec.melody;
  }

  private padLevel(): number {
    return this.windDown ? (this.spec.windDown.padLevel ?? this.spec.padLevel) : this.spec.padLevel;
  }

  private bass(): BassSpec | null {
    if (!this.windDown) return this.spec.bass;
    return this.spec.windDown.bass === undefined ? this.spec.bass : this.spec.windDown.bass;
  }

  private shimmer(): ShimmerSpec | null {
    if (!this.windDown) return this.spec.shimmer;
    return this.spec.windDown.shimmer === undefined ? this.spec.shimmer : this.spec.windDown.shimmer;
  }

  private emitChords(upTo: number, out: MusicEvent[]): void {
    while (this.chordCursor < upTo) {
      const chord = this.chordAt(this.chordCursor);
      const [lo, hi] = this.spec.padDegrees;
      out.push({ kind: 'chord', beat: this.chordCursor, chord, midis: chordTones(chord, lo, hi), level: this.padLevel() });
      this.chordCursor += this.spec.beatsPerChord;
    }
  }

  private emitBass(upTo: number, out: MusicEvent[]): void {
    while (this.barCursor < upTo) {
      const bass = this.bass();
      if (bass) {
        for (const offset of bass.beats) {
          const beat = this.barCursor + offset;
          this.bassQueue.push({ kind: 'bass', beat, midi: chordRootIn(this.chordAt(beat), 40, 51), vel: bass.level });
        }
      }
      this.barCursor += BEATS_PER_BAR;
    }
    this.bassQueue.sort((a, b) => a.beat - b.beat);
    while (this.bassQueue.length > 0 && (this.bassQueue[0] as MusicEvent).beat < upTo) {
      out.push(this.bassQueue.shift() as MusicEvent);
    }
  }

  private emitShimmer(upTo: number, out: MusicEvent[]): void {
    while (this.shimmerCursor < upTo) {
      const shimmer = this.shimmer();
      if (shimmer) {
        const tones = chordTones(this.chordAt(this.shimmerCursor), shimmer.degrees[0], shimmer.degrees[1]);
        if (tones.length > 0) {
          out.push({ kind: 'ping', beat: this.shimmerCursor, midi: this.rng.pick(tones), vel: shimmer.level });
        }
        this.shimmerCursor += this.rng.range(shimmer.every[0], shimmer.every[1]);
      } else {
        this.shimmerCursor += BEATS_PER_BAR;
      }
    }
  }

  private emitMelody(upTo: number, out: MusicEvent[]): void {
    for (;;) {
      while (this.queue.length > 0 && (this.queue[0] as MusicEvent).beat < upTo) {
        out.push(this.queue.shift() as MusicEvent);
      }
      if (this.queue.length > 0 || this.melodyCursor >= upTo) return;
      this.generateMotif();
    }
  }

  private generateMotif(): void {
    const m = this.melody();
    let index = this.rng.int(m.motifs.length);
    if (m.motifs.length > 1 && index === this.lastMotif) index = (index + 1) % m.motifs.length;
    this.lastMotif = index;
    const motif = m.motifs[index] as Motif;

    let beat = this.melodyCursor;
    const emit = (base: number, velScale: number): void => {
      motif.forEach((note, i) => {
        let length = note.b;
        if (i === motif.length - 1 && this.rng.chance(m.hold)) length *= 1.5;
        const vel = this.rng.range(m.velocity[0], m.velocity[1]) * velScale;
        const jitter = this.rng.range(-0.02, 0.02);
        if (i > 0 && note.b >= 0.75 && this.rng.chance(m.ornament)) {
          this.queue.push({
            kind: 'note',
            instrument: m.instrument,
            beat: beat - 0.14 + jitter,
            midi: degreeToMidi(base + note.d + 1),
            vel: vel * 0.5,
          });
        }
        this.queue.push({ kind: 'note', instrument: m.instrument, beat: beat + jitter, midi: degreeToMidi(base + note.d), vel });
        beat += length;
      });
    };

    emit(m.base, 1);
    if (this.rng.chance(m.echo)) {
      beat += 0.5;
      emit(m.base - 5, 0.55);
    }
    beat += this.rng.range(m.rest[0], m.rest[1]);
    this.melodyCursor = beat;
    this.queue.sort((a, b) => a.beat - b.beat);
  }
}
