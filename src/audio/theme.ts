/**
 * The Glimmerfall theme: the tune of the launch picture and the map (the
 * parent, 7 October: "theme music for the splash page and map, music for each
 * of the zones when you are on the map view").
 *
 * Unlike the lullaby that plays under a level, which a generator walks through
 * so it never repeats, the theme is a written tune: thirty-two bars in G major
 * pentatonic that loop without a join, so it is the same song every time she
 * opens the game, the way a storybook's first page is always the same. Each
 * area of the map plays it in its own voice (DESIGN.md 2c: celesta in Twinkle
 * Meadow, struck crystal in Crystal Cave, a watery marimba in Mermaid Lagoon, a
 * gentle horn in Cloud Castle, a harp in Star Garden, a shimmering bell on
 * Aurora Peak, a kalimba in Dragon Hollow), with its own accompaniment figure,
 * its own twinkles and its own pulse, while the tune, the chords and the beat
 * stay the same. So when the view scrolls from one area into the next the
 * player simply moves weight from one voice to another and the music changes
 * places without ever stopping: the one world, heard.
 *
 * Pure, like the composer: given a seeded RNG and the current voice weights
 * it produces events in beats; the player turns them into sound. Tested
 * without a browser in tests/theme.test.ts.
 */
import type { AreaId } from '../core/journey';
import { AREA_IDS } from '../core/journey';
import type { Rng } from '../shared/rng';
import { CHORDS, type Chord, chordRootIn, chordTones, degreeToMidi } from '../shared/scale';
import type { MelodyInstrument, MusicEvent } from './composer';

export const BEATS_PER_BAR = 4;
/** Slow and steady, a little above the lullaby's 58, so the map feels like setting out rather than settling. */
export const THEME_BPM = 64;

/** One written note: scale degree relative to G5 (degree 10), length in beats, and an optional loudness. */
interface ScoreNote {
  readonly d: number;
  readonly b: number;
  readonly v?: number;
}
/** A rest of `b` beats. */
interface ScoreRest {
  readonly r: number;
}
type Bar = readonly (ScoreNote | ScoreRest)[];

const MELODY_BASE = 10;

/**
 * The tune. Degrees: 0 = G5, 1 = A5, 2 = B5, 3 = D6, 4 = E6, 5 = G6; -1 = E5,
 * -2 = D5, -3 = B4, -5 = G4. Four phrases of eight bars: the call (A), the
 * call lifted higher (A'), a quieter answer that wanders (B), and the lifted
 * call again to close, ending on a long home note that the first bar's
 * rising "Glim-mer-fall" steps out of, so the loop has no seam.
 */
const A: readonly Bar[] = [
  [{ d: -2, b: 1 }, { d: 0, b: 1 }, { d: 1, b: 0.5 }, { d: 2, b: 1.5, v: 1.05 }],
  [{ d: 3, b: 1.5, v: 1.08 }, { d: 2, b: 0.5 }, { d: 0, b: 2 }],
  [{ d: -1, b: 1 }, { d: 0, b: 1 }, { d: 2, b: 1 }, { d: 3, b: 1 }],
  [{ d: 2, b: 2.5 }, { r: 1.5 }],
  [{ d: 1, b: 1 }, { d: 3, b: 1 }, { d: 4, b: 1.5, v: 1.08 }, { d: 3, b: 0.5 }],
  [{ d: 2, b: 1 }, { d: 1, b: 1 }, { d: 0, b: 1.5 }, { d: -1, b: 0.5 }],
  [{ d: 0, b: 1 }, { d: 2, b: 1 }, { d: 1, b: 1 }, { d: -2, b: 1 }],
  [{ d: 0, b: 3, v: 0.95 }, { r: 1 }],
];

const A_LIFTED: readonly Bar[] = [
  [{ d: -2, b: 1 }, { d: 0, b: 1 }, { d: 1, b: 0.5 }, { d: 2, b: 1.5, v: 1.05 }],
  [{ d: 3, b: 1.5, v: 1.08 }, { d: 2, b: 0.5 }, { d: 4, b: 2, v: 1.1 }],
  [{ d: 5, b: 1, v: 1.1 }, { d: 4, b: 1 }, { d: 3, b: 1 }, { d: 2, b: 1 }],
  [{ d: 3, b: 2.5 }, { r: 1.5 }],
  [{ d: 1, b: 1 }, { d: 3, b: 1 }, { d: 4, b: 1.5, v: 1.08 }, { d: 5, b: 0.5, v: 1.1 }],
  [{ d: 4, b: 1 }, { d: 3, b: 1 }, { d: 2, b: 1.5 }, { d: 1, b: 0.5 }],
  [{ d: 2, b: 1 }, { d: 0, b: 1 }, { d: 1, b: 1 }, { d: -2, b: 1 }],
  [{ d: 0, b: 4, v: 0.95 }],
];

const B: readonly Bar[] = [
  [{ d: 4, b: 2, v: 0.9 }, { d: 3, b: 1, v: 0.85 }, { d: 2, b: 1, v: 0.85 }],
  [{ d: 1, b: 2, v: 0.85 }, { d: 0, b: 2, v: 0.8 }],
  [{ d: -1, b: 1, v: 0.8 }, { d: 0, b: 1, v: 0.85 }, { d: 2, b: 1, v: 0.9 }, { d: 1, b: 1, v: 0.85 }],
  [{ d: 0, b: 3, v: 0.8 }, { r: 1 }],
  [{ d: 4, b: 2, v: 0.9 }, { d: 5, b: 1, v: 1.0 }, { d: 4, b: 1, v: 0.9 }],
  [{ d: 3, b: 2, v: 0.9 }, { d: 2, b: 1, v: 0.85 }, { d: 1, b: 1, v: 0.85 }],
  [{ d: 2, b: 1.5, v: 0.9 }, { d: 1, b: 0.5 }, { d: 0, b: 1 }, { d: -2, b: 1, v: 0.85 }],
  [{ d: 1, b: 3, v: 0.85 }, { r: 1 }],
];

export const THEME_BARS: readonly Bar[] = [...A, ...A_LIFTED, ...B, ...A_LIFTED];

/** One chord per bar, the same cycle under every phrase so the voices always agree. */
const CHORDS_A: readonly Chord[] = [CHORDS.G, CHORDS.G, CHORDS.Em, CHORDS.Em, CHORDS.Asus, CHORDS.Dsus, CHORDS.G, CHORDS.G];
const CHORDS_B: readonly Chord[] = [CHORDS.Em, CHORDS.Dsus, CHORDS.G, CHORDS.G, CHORDS.Em, CHORDS.Asus, CHORDS.Dsus, CHORDS.Dsus];
export const THEME_CHORDS: readonly Chord[] = [...CHORDS_A, ...CHORDS_A, ...CHORDS_B, ...CHORDS_A];

export const LOOP_BARS = THEME_BARS.length;
export const LOOP_BEATS = LOOP_BARS * BEATS_PER_BAR;

/** A flattened note of the loop: its beat within the loop, MIDI note and loudness. */
export interface ThemeNote {
  readonly beat: number;
  readonly midi: number;
  readonly vel: number;
}

/** The written melody flattened to beats, once. */
export const THEME_MELODY: readonly ThemeNote[] = (() => {
  const out: ThemeNote[] = [];
  THEME_BARS.forEach((bar, i) => {
    let beat = i * BEATS_PER_BAR;
    for (const n of bar) {
      if ('r' in n) {
        beat += n.r;
        continue;
      }
      out.push({ beat, midi: degreeToMidi(MELODY_BASE + n.d), vel: n.v ?? 1 });
      beat += n.b;
    }
  });
  return out;
})();

/** One accompaniment note: where in the bar it falls and which chord tone (0 = lowest in the window) it takes. */
export interface Figure {
  readonly at: number;
  readonly tone: number;
}

export interface ThemeVoice {
  readonly area: AreaId;
  /** The tune's instrument. */
  readonly melody: MelodyInstrument;
  readonly melodyLevel: number;
  /** The accompaniment figure, repeated every bar on the chord of the bar, and its instrument and level. */
  readonly figure: readonly Figure[];
  readonly figureInstrument: MelodyInstrument;
  readonly figureLevel: number;
  /** Beat offsets within the bar for the low pulse, and its level. */
  readonly bassBeats: readonly number[];
  readonly bassLevel: number;
  readonly padLevel: number;
  /** Twinkles: the gap between them in beats [min, max], and their level. */
  readonly shimmerEvery: readonly [number, number];
  readonly shimmerLevel: number;
}

/** Degree window the accompaniment figures draw their chord tones from: G4 to A5, under the tune. */
const FIGURE_LO = -5;
const FIGURE_HI = 1;
/** Degree window for twinkles: high above the tune. */
const SHIMMER_LO = 12;
const SHIMMER_HI = 17;
/** Degree window for pad voicings. */
const PAD_LO = -2;
const PAD_HI = 4;

/** Figures: a music-box turn, a slow roll, a plucked rise and fall, two held notes, a kalimba pulse. */
const TURN: readonly Figure[] = [
  { at: 0, tone: 0 },
  { at: 0.5, tone: 1 },
  { at: 1, tone: 2 },
  { at: 1.5, tone: 1 },
  { at: 2, tone: 0 },
  { at: 2.5, tone: 1 },
  { at: 3, tone: 2 },
  { at: 3.5, tone: 3 },
];
const ROLL: readonly Figure[] = [
  { at: 0, tone: 0 },
  { at: 1, tone: 1 },
  { at: 2, tone: 2 },
  { at: 3, tone: 1 },
];
const DRIPS: readonly Figure[] = [
  { at: 0, tone: 0 },
  { at: 1.5, tone: 2 },
  { at: 2, tone: 1 },
  { at: 3.5, tone: 3 },
];
const RISE_FALL: readonly Figure[] = [
  { at: 0, tone: 0 },
  { at: 0.5, tone: 1 },
  { at: 1, tone: 2 },
  { at: 1.5, tone: 3 },
  { at: 2, tone: 2 },
  { at: 2.5, tone: 1 },
  { at: 3, tone: 0 },
  { at: 3.5, tone: 1 },
];
const TWO: readonly Figure[] = [
  { at: 0, tone: 0 },
  { at: 2, tone: 2 },
];
const PULSE: readonly Figure[] = [
  { at: 0, tone: 0 },
  { at: 1, tone: 2 },
  { at: 1.5, tone: 1 },
  { at: 2, tone: 0 },
  { at: 3, tone: 2 },
  { at: 3.5, tone: 1 },
];

/**
 * The seven voices. Melody levels are equal (the engine's voices are matched
 * in loudness, tests/sounds.test.ts), so crossing an area never changes how
 * loud the tune is; what changes is its colour and what moves beneath it.
 */
export const THEME_VOICES: Record<AreaId, ThemeVoice> = {
  // Twinkle Meadow: the music box itself, a turning figure under the tune, a few twinkles.
  meadow: {
    area: 'meadow',
    melody: 'celesta',
    melodyLevel: 0.62,
    figure: TURN,
    figureInstrument: 'celesta',
    figureLevel: 0.17,
    bassBeats: [0],
    bassLevel: 0.28,
    padLevel: 0.2,
    shimmerEvery: [6, 12],
    shimmerLevel: 0.16,
  },
  // Crystal Cave: struck crystal, drips of glass under it, dense twinkles like water on stone.
  cave: {
    area: 'cave',
    melody: 'glass',
    melodyLevel: 0.62,
    figure: DRIPS,
    figureInstrument: 'glass',
    figureLevel: 0.15,
    bassBeats: [0],
    bassLevel: 0.26,
    padLevel: 0.22,
    shimmerEvery: [2.5, 6],
    shimmerLevel: 0.17,
  },
  // Mermaid Lagoon: the tune under water, a slow roll like a swell, deeper pad, few twinkles.
  lagoon: {
    area: 'lagoon',
    melody: 'water',
    melodyLevel: 0.64,
    figure: ROLL,
    figureInstrument: 'water',
    figureLevel: 0.2,
    bassBeats: [0],
    bassLevel: 0.26,
    padLevel: 0.24,
    shimmerEvery: [8, 14],
    shimmerLevel: 0.13,
  },
  // Cloud Castle: a gentle horn carries the tune over a fuller pad, a harp holds two notes a bar.
  castle: {
    area: 'castle',
    melody: 'horn',
    melodyLevel: 0.6,
    figure: TWO,
    figureInstrument: 'harp',
    figureLevel: 0.18,
    bassBeats: [0],
    bassLevel: 0.3,
    padLevel: 0.27,
    shimmerEvery: [8, 14],
    shimmerLevel: 0.15,
  },
  // Star Garden: plucked on a harp, rising and falling harp figures, stars coming out everywhere.
  garden: {
    area: 'garden',
    melody: 'harp',
    melodyLevel: 0.62,
    figure: RISE_FALL,
    figureInstrument: 'harp',
    figureLevel: 0.16,
    bassBeats: [0],
    bassLevel: 0.26,
    padLevel: 0.2,
    shimmerEvery: [4, 8],
    shimmerLevel: 0.19,
  },
  // Aurora Peak: a shimmering bell high and alone over the fullest pad, frequent twinkles, almost no figure.
  peak: {
    area: 'peak',
    melody: 'shimmer',
    melodyLevel: 0.6,
    figure: TWO,
    figureInstrument: 'shimmer',
    figureLevel: 0.12,
    bassBeats: [0],
    bassLevel: 0.24,
    padLevel: 0.3,
    shimmerEvery: [3, 7],
    shimmerLevel: 0.2,
  },
  // Dragon Hollow: a warm kalimba, a two-beat pulse like a sleeping dragon's breath, the glow of a low pad.
  hollow: {
    area: 'hollow',
    melody: 'kalimba',
    melodyLevel: 0.62,
    figure: PULSE,
    figureInstrument: 'kalimba',
    figureLevel: 0.18,
    bassBeats: [0, 2.5],
    bassLevel: 0.3,
    padLevel: 0.22,
    shimmerEvery: [7, 13],
    shimmerLevel: 0.14,
  },
};

export type VoiceWeights = Partial<Record<AreaId, number>>;

/** Weights normalised to sum to one, with anything below a hair dropped. */
export function normaliseWeights(weights: VoiceWeights): Record<AreaId, number> {
  const out = {} as Record<AreaId, number>;
  let sum = 0;
  for (const id of AREA_IDS) {
    const w = Math.max(0, weights[id] ?? 0);
    out[id] = w > 0.002 ? w : 0;
    sum += out[id];
  }
  if (sum <= 0) {
    out.meadow = 1;
    return out;
  }
  for (const id of AREA_IDS) out[id] /= sum;
  return out;
}

/** The loudness share of a voice at weight `w`: an equal-power curve, so two voices crossing sum to a steady level. */
function share(w: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, w)));
}

/** The chord of the bar at `beat` (any beat, the loop repeating forever). */
export function themeChordAt(beat: number): Chord {
  const bar = Math.floor(((Math.max(0, beat) % LOOP_BEATS) + LOOP_BEATS) % LOOP_BEATS / BEATS_PER_BAR);
  return THEME_CHORDS[bar] ?? CHORDS.G;
}

/**
 * Plays the theme forever from beat 0, in whatever mix of voices the player
 * asks for. `next(upTo)` returns every event with beat < upTo not yet
 * returned, in beat order. The melody waits out the first bar so the theme
 * opens on the pad and the figure, a swell rather than a note.
 */
export class ThemeComposer {
  private weights: Record<AreaId, number>;
  private barCursor = 0;
  private shimmerCursor = 2;
  private melodyIndex = 0;
  private melodyLoop = 0;
  private readonly queue: MusicEvent[] = [];

  constructor(
    private readonly rng: Rng,
    weights: VoiceWeights,
    private readonly introBars = 1,
  ) {
    this.weights = normaliseWeights(weights);
  }

  get bpm(): number {
    return THEME_BPM;
  }

  /** The player moves the mix as the view crosses between areas. */
  setWeights(weights: VoiceWeights): void {
    this.weights = normaliseWeights(weights);
  }

  get mix(): Readonly<Record<AreaId, number>> {
    return this.weights;
  }

  chordAt(beat: number): Chord {
    return themeChordAt(beat);
  }

  next(upTo: number): MusicEvent[] {
    const out: MusicEvent[] = [];
    this.emitBars(upTo);
    this.emitShimmer(upTo, out);
    this.emitMelody(upTo, out);
    while (this.queue.length > 0 && (this.queue[0] as MusicEvent).beat < upTo) out.push(this.queue.shift() as MusicEvent);
    out.sort((a, b) => a.beat - b.beat);
    return out;
  }

  private voices(): Array<{ v: ThemeVoice; w: number }> {
    return AREA_IDS.filter((id) => this.weights[id] > 0).map((id) => ({ v: THEME_VOICES[id], w: this.weights[id] }));
  }

  private mixed(pick: (v: ThemeVoice) => number): number {
    let sum = 0;
    for (const { v, w } of this.voices()) sum += pick(v) * w;
    return sum;
  }

  /** Each bar's chord, bass and accompaniment figure, mixed by the weights at the moment the bar is composed. */
  private emitBars(upTo: number): void {
    while (this.barCursor < upTo) {
      const bar = this.barCursor;
      const chord = this.chordAt(bar);
      const voices = this.voices();
      this.queue.push({ kind: 'chord', beat: bar, chord, midis: chordTones(chord, PAD_LO, PAD_HI), level: this.mixed((v) => v.padLevel) });

      // The low pulse: voices that share a beat share one note, at their combined weight.
      const bass = new Map<number, number>();
      for (const { v, w } of voices) {
        for (const at of v.bassBeats) bass.set(at, (bass.get(at) ?? 0) + w * v.bassLevel);
      }
      for (const [at, level] of bass) {
        this.queue.push({ kind: 'bass', beat: bar + at, midi: chordRootIn(chord, 40, 51), vel: Math.min(0.4, level) });
      }

      // The figures: one note per (instrument, beat, pitch), its loudness the equal-power share of the weights behind it.
      const tones = chordTones(chord, FIGURE_LO, FIGURE_HI);
      const figures = new Map<string, { instrument: MelodyInstrument; beat: number; midi: number; w: number; level: number }>();
      for (const { v, w } of voices) {
        for (const f of v.figure) {
          const midi = tones[f.tone % tones.length] as number;
          const key = `${v.figureInstrument}/${f.at}/${midi}`;
          const hit = figures.get(key);
          if (hit) {
            hit.w += w;
            hit.level = Math.max(hit.level, v.figureLevel);
          } else figures.set(key, { instrument: v.figureInstrument, beat: bar + f.at, midi, w, level: v.figureLevel });
        }
      }
      for (const f of figures.values()) {
        const accent = f.beat === bar ? 1.12 : 1;
        this.queue.push({ kind: 'note', instrument: f.instrument, beat: f.beat + this.rng.range(-0.01, 0.01), midi: f.midi, vel: f.level * share(f.w) * accent });
      }
      this.barCursor += BEATS_PER_BAR;
    }
    this.queue.sort((a, b) => a.beat - b.beat);
  }

  /** Twinkles at the mix's density: a cave drips often, a lagoon hardly at all. */
  private emitShimmer(upTo: number, out: MusicEvent[]): void {
    while (this.shimmerCursor < upTo) {
      const tones = chordTones(this.chordAt(this.shimmerCursor), SHIMMER_LO, SHIMMER_HI);
      const level = this.mixed((v) => v.shimmerLevel);
      if (tones.length > 0 && level > 0) out.push({ kind: 'ping', beat: this.shimmerCursor, midi: this.rng.pick(tones), vel: level });
      const lo = this.mixed((v) => v.shimmerEvery[0]);
      const hi = this.mixed((v) => v.shimmerEvery[1]);
      this.shimmerCursor += Math.max(1, this.rng.range(lo, hi));
    }
  }

  /** The written tune, every voice that carries weight playing it at its share. */
  private emitMelody(upTo: number, out: MusicEvent[]): void {
    for (;;) {
      const note = THEME_MELODY[this.melodyIndex];
      if (!note) {
        this.melodyLoop += 1;
        this.melodyIndex = 0;
        continue;
      }
      const beat = this.melodyLoop * LOOP_BEATS + note.beat;
      if (beat >= upTo) return;
      this.melodyIndex += 1;
      if (beat < this.introBars * BEATS_PER_BAR) continue;
      const jitter = this.rng.range(-0.015, 0.015);
      const swell = this.rng.range(0.94, 1.0);
      for (const { v, w } of this.voices()) {
        out.push({ kind: 'note', instrument: v.melody, beat: beat + jitter, midi: note.midi, vel: v.melodyLevel * note.vel * swell * share(w) });
      }
    }
  }
}
