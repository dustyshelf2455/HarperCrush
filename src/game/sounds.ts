/**
 * Maps what happens on the board to warm pentatonic sound (DESIGN.md 3.4 and
 * 3.11). Every phrase is built by a pure function from the chord the music is
 * playing at that moment, so chimes always agree with the tune and the
 * phrases can be tested without a browser. GameSounds only schedules them on
 * the audio clock, a little ahead, so they line up with the animation.
 *
 * Loudness: no note is louder than vel 0.5 (the Stage 2 orb run) and the
 * densest phrase, the sunrise, is quieter than two orb runs at once (today's
 * orb + orb); tests/sounds.test.ts holds both lines. Richer, never louder.
 */
import type { MelodyInstrument } from '../audio/composer';
import type { AudioEngine } from '../audio/engine';
import type { MusicPlayer } from '../audio/player';
import { sketchForArea } from '../audio/sketches';
import type { Combo, FireStep, Piece, PowerKind, Step } from '../core/game';
import type { Cell, GemType } from '../core/grid';
import type { AreaId } from '../core/journey';
import { CHORDS, type Chord, chordTones } from '../shared/scale';

// ------------------------------------------------------------------ phrases

export interface PhraseNote {
  /** Seconds after the phrase starts. */
  at: number;
  midi: number;
  vel: number;
  instrument: MelodyInstrument;
}

/** A soft pad under a phrase: swells in over `attack`, holds, and fades over `release` from `at + hold`. */
export interface PhrasePad {
  at: number;
  midis: number[];
  level: number;
  attack: number;
  hold: number;
  release: number;
}

export interface Phrase {
  notes: PhraseNote[];
  pads: PhrasePad[];
  /** Seconds the music dips to make room (DESIGN.md 3.11), 0 for none. */
  duck: number;
}

/** Degree 17 is B6 (MIDI 95), the top of the comfortable register; no phrase reaches past it. */
const TOP_DEGREE = 17;

/** Chord tones in a degree window, capped at the top of the register. */
function tones(chord: Chord, lo: number, hi: number): number[] {
  return chordTones(chord, lo, Math.min(hi, TOP_DEGREE));
}

const empty = (): Phrase => ({ notes: [], pads: [], duck: 0 });

function merge(...parts: Phrase[]): Phrase {
  const out = empty();
  for (const p of parts) {
    out.notes.push(...p.notes);
    out.pads.push(...p.pads);
    out.duck = Math.max(out.duck, p.duck);
  }
  out.notes.sort((a, b) => a.at - b.at);
  out.pads.sort((a, b) => a.at - b.at);
  return out;
}

function shifted(p: Phrase, dt: number): Phrase {
  return {
    notes: p.notes.map((n) => ({ ...n, at: n.at + dt })),
    pads: p.pads.map((n) => ({ ...n, at: n.at + dt })),
    duck: p.duck,
  };
}

/** When the last note starts or the last pad begins to fade, whichever is later. */
export function phraseEnd(p: Phrase): number {
  let end = 0;
  for (const n of p.notes) end = Math.max(end, n.at);
  for (const n of p.pads) end = Math.max(end, n.at + n.hold);
  return end;
}

/** A run up (or down) the given tones. Like the engine's arpeggio, the velocity rises a little toward the end. */
function run(midis: readonly number[], at: number, spacing: number, vel: number, instrument: MelodyInstrument, rise = 0.25): Phrase {
  const p = empty();
  const last = Math.max(1, midis.length - 1);
  midis.forEach((midi, i) => p.notes.push({ at: at + i * spacing, midi, vel: vel * (1 - rise + rise * (i / last)), instrument }));
  return p;
}

/** From the middle tone outward both ways at once: the starburst's X of light. */
function spread(midis: readonly number[], at: number, spacing: number, vel: number, instrument: MelodyInstrument): Phrase {
  const p = empty();
  const m = Math.floor(midis.length / 2);
  for (let i = 0; m - i >= 0 || m + i < midis.length; i++) {
    const v = vel * (0.85 + 0.15 * Math.min(1, i / 3));
    const up = midis[m + i];
    const down = midis[m - i];
    if (up !== undefined) p.notes.push({ at: at + i * spacing, midi: up, vel: v, instrument });
    if (i > 0 && down !== undefined) p.notes.push({ at: at + i * spacing, midi: down, vel: v, instrument });
  }
  return p;
}

/** The middle tone, then one step up, one down, two up, two down: a flower opening outward, one petal at a time. */
function outward(midis: readonly number[], at: number, spacing: number, vel: number, instrument: MelodyInstrument, count: number): Phrase {
  const p = empty();
  const m = Math.floor(midis.length / 2);
  let k = 0;
  for (let i = 0; p.notes.length < count && i <= midis.length; i++) {
    const idx = i === 0 ? m : i % 2 === 1 ? m + Math.ceil(i / 2) : m - i / 2;
    const midi = midis[idx];
    if (midi === undefined) continue;
    p.notes.push({ at: at + k * spacing, midi, vel: vel * (0.9 + 0.1 * Math.min(1, k / 4)), instrument });
    k++;
  }
  return p;
}

function pad(midis: number[], at: number, level: number, attack: number, hold: number, release: number): Phrase {
  const p = empty();
  if (midis.length > 0) p.pads.push({ at, midis, level, attack, hold, release });
  return p;
}

/** The soft low voicing every pad swell is built on (the Stage 2 orb used the same window). */
const lowPad = (chord: Chord): number[] => tones(chord, 3, 8).slice(0, 3);

// -------------------------------------------------------- the power phrases

/**
 * Each power's own phrase (DESIGN.md 3.4, 3.11). `wide` is the discovery
 * form: the run gains an octave, below, since the top of the register is
 * already in use. Comet and orb are the Stage 2 phrases unchanged.
 */
function cometPhrase(chord: Chord, wide: boolean): Phrase {
  // A rising run of six chord tones over about half a second: the sweep of the comet.
  return run(tones(chord, wide ? 3 : 8, 17), 0, 0.09, 0.45, 'celesta');
}

function orbPhrase(chord: Chord, wide: boolean): Phrase {
  // A sparkling two-octave run (degrees 7..17) over a soft pad swell.
  return merge(run(tones(chord, wide ? 2 : 7, 17), 0.05, 0.07, 0.5, 'celesta'), pad(lowPad(chord), 0, 0.1, 2.4, 2.4, 2.2));
}

function bloomPhrase(chord: Chord, phase: 1 | 2, wide: boolean, giant = false): Phrase {
  // Five marimba notes opening outward from the middle plus a short pad touch; the second opening a little fuller.
  const count = (phase === 2 ? 6 : 5) + (wide ? 2 : 0) + (giant ? 1 : 0);
  const petals = outward(tones(chord, wide || giant ? 1 : 6, 15), 0, 0.085, phase === 2 || giant ? 0.42 : 0.38, 'marimba', count);
  const touch = pad(lowPad(chord), 0, (phase === 2 ? 0.08 : 0.06) + (giant ? 0.01 : 0), 0.9, giant ? 1.4 : 0.9, 1.2);
  if (!giant) return merge(petals, touch);
  // The giant bloom doubles its last petals with a celesta sparkle.
  const sparkle = empty();
  for (const n of petals.notes.slice(-3)) sparkle.notes.push({ ...n, at: n.at + 0.02, vel: 0.22, instrument: 'celesta' });
  return merge(petals, touch, sparkle);
}

/** The sprite's flight: a quick fluttering trill rising, then a soft pop where it lands, about 0.7 s later. */
function spritePhrase(chord: Chord, wide: boolean, pop: boolean): Phrase {
  const trill = run(tones(chord, wide ? 7 : 12, 17), 0, 0.055, 0.32, 'celesta', 0.15);
  if (!pop) return trill;
  const landing = tones(chord, 8, 12)[0];
  if (landing === undefined) return trill;
  return merge(trill, { notes: [{ at: 0.7, midi: landing, vel: 0.36, instrument: 'marimba' }], pads: [], duck: 0 });
}

function starburstPhrase(chord: Chord, wide: boolean): Phrase {
  // A bright spread played both up and down from the middle: light sweeping along both diagonals.
  // Two notes sound at once, so each is a little softer than a comet's.
  return spread(tones(chord, wide ? 4 : 7, 17), 0, 0.08, 0.38, 'celesta');
}

function moonrisePhrase(chord: Chord, wide: boolean, full: boolean): Phrase {
  // A slow descending pair of low horn notes under a soft pad, over about 1.2 s. Fuller (combinations): three notes with a faint celesta an octave up.
  const low = tones(chord, 0, 5);
  const top = low[low.length - 1];
  const root = low[0];
  const p = empty();
  if (top === undefined || root === undefined) return p;
  if (full) {
    const mid = low[Math.max(0, low.length - 2)] ?? root;
    [top, mid, root].forEach((midi, i) => p.notes.push({ at: i * 0.5, midi, vel: 0.38, instrument: 'horn' }));
    [top, root].forEach((midi, i) => p.notes.push({ at: 0.06 + i * 1.0, midi: midi + 12, vel: 0.22, instrument: 'celesta' }));
  } else {
    p.notes.push({ at: 0, midi: top, vel: 0.38, instrument: 'horn' }, { at: 0.6, midi: root, vel: 0.36, instrument: 'horn' });
  }
  // Discovery: a soft celesta echo of the top note an octave up, after the beam has passed.
  if (wide) p.notes.push({ at: full ? 1.5 : 1.2, midi: top + 12 <= 95 ? top + 12 : top, vel: 0.24, instrument: 'celesta' });
  return merge(p, pad(lowPad(chord), 0, full ? 0.1 : 0.08, 1.0, 1.2, 1.4));
}

function auroraPhrase(chord: Chord, swells: 2 | 3, wide: boolean): Phrase {
  // One slow pad swell per colour wave, about 1.6 s apart, each on a different voicing, with sparse high twinkles.
  const voicings = [lowPad(chord), tones(chord, 5, 10).slice(0, 3), tones(chord, 1, 6).slice(0, 3)];
  const parts: Phrase[] = [];
  for (let i = 0; i < swells; i++) parts.push(pad(voicings[i] ?? lowPad(chord), i * 1.6, 0.09, 1.4, 1.6, 1.8));
  const high = tones(chord, 13, 17);
  const times = [0.4, 1.1, 2.0, 2.7];
  if (swells === 3) times.push(3.6, 4.3);
  if (wide) times.push(swells === 3 ? 5.0 : 3.4, swells === 3 ? 5.6 : 3.9);
  const twinkles = empty();
  times.forEach((at, i) => {
    const midi = high[i % Math.max(1, high.length)];
    if (midi !== undefined) twinkles.notes.push({ at, midi, vel: 0.22, instrument: 'bell' });
  });
  return merge(...parts, twinkles);
}

/** A single warm spread for the wave combinations (Orb + Bloom, Orb + Starburst, Orb + Moonrise): one strum, one pad, and the board rides it. */
function warmSpread(chord: Chord, instrument: MelodyInstrument, wide: boolean): Phrase {
  return merge(run(tones(chord, wide ? 0 : 5, 15), 0, 0.11, 0.4, instrument, 0.1), pad(lowPad(chord), 0, 0.09, 1.2, 1.4, 1.8));
}

/** A comet run doubled by a quieter glass run an octave below, a hair behind it. */
function doubledComet(chord: Chord, wide: boolean): Phrase {
  return merge(run(tones(chord, wide ? 3 : 8, 17), 0, 0.09, 0.38, 'celesta'), run(tones(chord, 3, 12), 0.04, 0.09, 0.3, 'glass'));
}

/**
 * Orb + Orb (DESIGN.md 3.4): "a sunrise sweeps the whole board ... over about
 * 2.5 seconds, with a slow warm swell and a full run of twinkling notes.
 * Majestic, not loud." The pad swells over 2.5 s; the run is spaced wide so
 * only a few notes ring at once, which keeps it well under two orb runs.
 */
function sunrisePhrase(chord: Chord, wide: boolean): Phrase {
  const swell = pad(tones(chord, 1, 10).slice(0, 4), 0, 0.14, 2.5, 3.0, 2.6);
  const climbTones = tones(chord, wide ? 0 : 5, 17);
  const climb = run(climbTones, 0.2, 0.28, 0.4, 'celesta', 0.15);
  // A quiet glass voice an octave below, half a step behind, fills the texture without raising the peak.
  const under = run(climbTones.map((m) => m - 12), 0.34, 0.28, 0.26, 'glass', 0.15);
  const high = tones(chord, 13, 17);
  const twinkles = empty();
  [1.2, 1.7, 2.2, 2.7, 3.2].forEach((at, i) => {
    const midi = high[i % Math.max(1, high.length)];
    if (midi !== undefined) twinkles.notes.push({ at, midi, vel: 0.24, instrument: 'bell' });
  });
  return merge(swell, climb, under, twinkles);
}

/** A power's phrase on its own, with no combination. */
function plainPhrase(step: FireStep, chord: Chord, wide: boolean): Phrase {
  switch (step.power) {
    case 'cometRow':
    case 'cometCol':
      return cometPhrase(chord, wide);
    case 'orb':
      return orbPhrase(chord, wide);
    case 'bloom':
      return bloomPhrase(chord, step.phase ?? 1, wide);
    case 'sprite':
      // A sprite carrying another power hands over to that power's phrase instead of popping.
      return spritePhrase(chord, wide, step.carrying === undefined);
    case 'starburst':
      return starburstPhrase(chord, wide);
    case 'moonrise':
      return moonrisePhrase(chord, wide, false);
    case 'aurora':
      return auroraPhrase(chord, 2, wide);
  }
}

/**
 * How each combination sounds (DESIGN.md 3.4 table). `once`: the swap fires
 * many pieces (every comet of a colour, both halves of a cross) but the
 * phrase plays once and the pieces ride it. `duck`: seconds the music dips.
 */
const COMBO_SOUND: Record<Combo, { once: boolean; duck: number }> = {
  cross: { once: true, duck: 1.2 },
  wideCross: { once: true, duck: 1.6 },
  giantBloom: { once: false, duck: 1.4 },
  cometShower: { once: true, duck: 2.0 },
  bloomWave: { once: true, duck: 2.0 },
  sunrise: { once: true, duck: 3.4 },
  carry: { once: false, duck: 0 },
  twinFlight: { once: false, duck: 0 },
  eightStar: { once: true, duck: 1.6 },
  starShower: { once: true, duck: 2.0 },
  wideMoon: { once: true, duck: 1.8 },
  moonflower: { once: true, duck: 1.8 },
  moonTide: { once: true, duck: 2.2 },
  fullMoon: { once: true, duck: 2.2 },
  moonStar: { once: true, duck: 1.8 },
  auroraSky: { once: true, duck: 5.0 },
  auroraDawn: { once: true, duck: 5.0 },
  pair: { once: false, duck: 0 },
};

/** Every combination, for tests and for callers that need the list (the core exports only the type). */
export const COMBOS: readonly Combo[] = Object.keys(COMBO_SOUND) as Combo[];

/** True when a combination's phrase plays once for the whole swap, however many pieces it sets off. */
export function playsOnce(combo: Combo): boolean {
  return COMBO_SOUND[combo].once;
}

function comboPhrase(step: FireStep, combo: Combo, chord: Chord, wide: boolean): Phrase {
  switch (combo) {
    case 'cross':
      return doubledComet(chord, wide);
    case 'wideCross':
      return merge(doubledComet(chord, wide), pad(lowPad(chord), 0, 0.07, 0.8, 1.0, 1.4));
    case 'giantBloom':
      return bloomPhrase(chord, step.phase ?? 1, wide, true);
    case 'cometShower':
      // One richer run; the comets fly in turn and ride it.
      return merge(run(tones(chord, wide ? 0 : 5, 17), 0, 0.08, 0.45, 'celesta'), pad(lowPad(chord), 0, 0.07, 1.0, 1.2, 1.6));
    case 'bloomWave':
      return warmSpread(chord, 'marimba', wide);
    case 'starShower':
      return warmSpread(chord, 'celesta', wide);
    case 'moonTide':
      return warmSpread(chord, 'water', wide);
    case 'sunrise':
      return sunrisePhrase(chord, wide);
    case 'carry':
    case 'twinFlight':
    case 'pair':
      // The sprite's trill, then the carried power's own phrase when its step begins; a pair plays each power's own.
      return plainPhrase(step, chord, wide);
    case 'eightStar':
      return merge(starburstPhrase(chord, wide), shifted(run(tones(chord, wide ? 3 : 8, 17), 0, 0.09, 0.34, 'celesta'), 0.35));
    case 'wideMoon':
    case 'moonflower':
    case 'moonStar':
    case 'fullMoon':
      return moonrisePhrase(chord, wide, true);
    case 'auroraSky':
    case 'auroraDawn':
      return auroraPhrase(chord, 3, wide);
  }
}

/** Seconds the music dips for a discovery (DESIGN.md 3.4: "the sound is a little richer, so the moment lands"). */
const DISCOVERY_DUCK = 2.4;

/**
 * The phrase for a power going off: its own, or the combination's, drawn
 * from the chord sounding now. A discovery (the first time a power ever goes
 * off) is a little richer: the run gains an octave, a soft pad swells
 * underneath, and the music dips to make room.
 */
export function phraseFor(step: FireStep, chord: Chord, discovery = false): Phrase {
  const base = step.combo ? comboPhrase(step, step.combo, chord, discovery) : plainPhrase(step, chord, discovery);
  const phrase: Phrase = { ...base, duck: Math.max(base.duck, step.combo ? COMBO_SOUND[step.combo].duck : 0) };
  if (!discovery) return phrase;
  const first = phrase.pads[0];
  if (first) first.level = Math.min(0.16, first.level + 0.02);
  else phrase.pads.push({ at: 0, midis: lowPad(chord), level: 0.08, attack: 1.2, hold: phraseEnd(phrase) + 0.4, release: 2.0 });
  phrase.duck = Math.max(phrase.duck, DISCOVERY_DUCK);
  return phrase;
}

// ------------------------------------------------------- the other phrases

/** Gems turning into powers (Orb + Comet and the like): a soft glass shimmer, one note per gem up to six. */
export function transformPhrase(count: number, chord: Chord): Phrase {
  const high = tones(chord, 10, 17);
  const n = Math.max(2, Math.min(6, count));
  const p = empty();
  for (let i = 0; i < n; i++) {
    const midi = high[i % Math.max(1, high.length)];
    if (midi !== undefined) p.notes.push({ at: i * 0.06, midi, vel: 0.22, instrument: 'glass' });
  }
  return p;
}

/** The lantern lights (DESIGN.md 3.5: "a warm chord"): the chord sounding now, resolving home to G, under a soft pad. */
export function lanternPhrase(chord: Chord, instrument: MelodyInstrument): Phrase {
  const strum = (c: Chord, at: number, vel: number): Phrase => run(tones(c, 8, 12), at, 0.06, vel, instrument, 0);
  const high = tones(CHORDS.G, 15, 17)[0];
  const top: Phrase = high === undefined ? empty() : { notes: [{ at: 0.9, midi: high, vel: 0.34, instrument }], pads: [], duck: 0 };
  return merge(strum(chord, 0, 0.4), strum(CHORDS.G, 0.45, 0.42), top, pad(lowPad(CHORDS.G), 0, 0.12, 1.2, 1.8, 2.4));
}

/** She picked a companion: a happy little two-note hop. */
export function companionPhrase(chord: Chord): Phrase {
  const t = tones(chord, 10, 14);
  const a = t[0];
  const b = t[t.length - 1];
  const p = empty();
  if (a !== undefined) p.notes.push({ at: 0, midi: a, vel: 0.4, instrument: 'marimba' });
  if (b !== undefined && b !== a) p.notes.push({ at: 0.16, midi: b, vel: 0.44, instrument: 'marimba' });
  return p;
}

/** One very soft high bell for a tap in the resting scene (DESIGN.md 3.11: "Taps in the rest scene twinkle in the same key"). `index` cycles through the chord's high tones. */
export function twinklePhrase(chord: Chord, index: number): Phrase {
  const high = tones(chord, 13, 17);
  const midi = high[Math.abs(index) % Math.max(1, high.length)];
  return midi === undefined ? empty() : { notes: [{ at: 0, midi, vel: 0.18, instrument: 'bell' }], pads: [], duck: 0 };
}

/** Level complete (DESIGN.md 3.11): a short, warm resolving phrase. A new area plays it in that area's voice, a touch fuller. */
export function levelDonePhrase(chord: Chord, instrument: MelodyInstrument, arrival = false): Phrase {
  const t = tones(chord, 5, 15);
  const steps = [t[3], t[2], t[1], t[0], t[2]].filter((m): m is number => m !== undefined);
  const p = empty();
  steps.forEach((midi, i) => p.notes.push({ at: 0.2 + i * 0.22, midi, vel: 0.5, instrument }));
  return merge(p, pad(lowPad(chord), 0.1, arrival ? 0.13 : 0.12, 2.6, 2.7, 2.5));
}

// --------------------------------------------------------------- scheduling

/** Phrases start this far ahead on the audio clock, so the first note lands with the animation rather than before it. */
const LEAD = 0.1;

/** A once-only combination phrase is not repeated for another piece of the same swap within this many seconds. */
/** A shower of eight comets takes about five seconds in slow motion; a repeat of the same combination inside this window is the same moment. */
const ONCE_WINDOW = 10;

/** A bare PowerKind from the view, before it passes whole fire steps: treat it as a plain firing. */
function plainStep(power: PowerKind): FireStep {
  return { kind: 'fire', power, at: { row: 0, col: 0 }, cells: [], color: null };
}

export class GameSounds {
  enabled = true;
  /** The sleepy stretch (DESIGN.md 3.8): chimes drop an octave and get quieter. */
  private soft = false;
  /** The area's melody voice, used for the lantern and level phrases. */
  private voice: MelodyInstrument = 'celesta';
  private lastOnce: { combo: Combo; at: number } | null = null;
  private twinkles = 0;

  constructor(
    private readonly engine: AudioEngine,
    private readonly player: MusicPlayer,
  ) {}

  private get ctx(): AudioContext | null {
    return this.enabled && this.engine.isRunning ? this.engine.context : null;
  }

  /** The softening of the sleepy stretch: on, every chime sounds an octave lower and about a third quieter. */
  setSoft(on: boolean): void {
    this.soft = on;
  }

  private shift(midi: number): number {
    return this.soft && midi - 12 >= 36 ? midi - 12 : midi;
  }

  private level(vel: number): number {
    return this.soft ? vel * 0.7 : vel;
  }

  /** The area she is in, so the lantern and level phrases take its voice (DESIGN.md 3.11). */
  setArea(area: AreaId): void {
    this.voice = sketchForArea(area).melody.instrument;
  }

  swap(valid: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (valid) this.engine.tick(ctx.currentTime, this.level(0.14));
    else this.engine.note('marimba', 55, ctx.currentTime + 0.12, this.level(0.22));
  }

  /** One soft note per cleared group, climbing with the cascade and the group index. */
  clear(groups: Array<{ cells: Cell[]; type: GemType | null }>, cascade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tones = this.player.chordNow(6, 18);
    groups.forEach((g, i) => {
      const idx = Math.min(tones.length - 1, cascade * 2 + i);
      const midi = tones[idx] ?? tones[tones.length - 1] ?? 67;
      const vel = Math.min(0.75, 0.42 + g.cells.length * 0.05 + cascade * 0.04);
      this.engine.note('celesta', this.shift(midi), ctx.currentTime + 0.1 + i * 0.05, this.level(vel));
    });
  }

  created(piece: Piece): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tones = this.player.chordNow(10, 18);
    const colourless = piece.power === 'orb' || piece.power === 'aurora';
    this.engine.arpeggio(tones.slice(0, colourless ? 5 : 3).map((m) => this.shift(m)), ctx.currentTime + 0.05, this.level(0.4), 0.06);
  }

  /**
   * A power goes off. Takes the whole fire step (its combination, bloom phase
   * and sprite flight shape the phrase) or a bare PowerKind for a plain firing.
   * `discovery` is the first time this power has ever gone off (DESIGN.md 3.4).
   */
  fired(step: FireStep | PowerKind, discovery = false): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const fire = typeof step === 'string' ? plainStep(step) : step;
    const t = ctx.currentTime;
    if (fire.combo && playsOnce(fire.combo)) {
      if (this.lastOnce && this.lastOnce.combo === fire.combo && t - this.lastOnce.at < ONCE_WINDOW) return;
      this.lastOnce = { combo: fire.combo, at: t };
    }
    this.play(phraseFor(fire, this.player.chord, discovery), t + LEAD);
  }

  /** Gems turn into powers in place before they go off: a soft shimmer. */
  transform(step: Extract<Step, { kind: 'transform' }>): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.play(transformPhrase(step.changes.length, this.player.chord), ctx.currentTime + LEAD);
  }

  land(count: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = Math.min(3, count);
    for (let i = 0; i < n; i++) this.engine.thud(ctx.currentTime + i * 0.02, 0.09);
  }

  reshuffle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.engine.arpeggio(this.player.chordNow(5, 14).slice(0, 5).map((m) => this.shift(m)), ctx.currentTime + 0.05, this.level(0.3), 0.1);
  }

  /** The lantern fills: the level-complete phrase in the current area's voice. */
  levelDone(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.play(levelDonePhrase(this.player.chord, this.voice), ctx.currentTime);
  }

  /** She crosses into a new area: the same phrase in that area's voice, which the lantern and level phrases then keep. */
  areaArrive(area: AreaId): void {
    this.setArea(area);
    const ctx = this.ctx;
    if (!ctx) return;
    this.play(levelDonePhrase(this.player.chord, this.voice, true), ctx.currentTime);
  }

  /** The new lantern lights on the map: a warm resolving chord. */
  lanternLit(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.play(lanternPhrase(this.player.chord, this.voice), ctx.currentTime + LEAD);
  }

  /** She picked a companion: a happy two-note hop. */
  companionPick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.play(companionPhrase(this.player.chord), ctx.currentTime + 0.02);
  }

  /** A tap in the resting scene: one very soft high note. */
  twinkle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.play(twinklePhrase(this.player.chord, this.twinkles++), ctx.currentTime + 0.02);
  }

  /** Schedule a phrase on the audio clock from `t0`, and dip the music if the phrase asks for it. */
  private play(phrase: Phrase, t0: number): void {
    for (const n of phrase.notes) this.engine.note(n.instrument, this.shift(n.midi), t0 + n.at, this.level(n.vel));
    for (const p of phrase.pads) {
      const voice = this.engine.pad(p.midis, t0 + p.at, this.soft ? p.level * 0.8 : p.level, undefined, p.attack);
      voice?.release(t0 + p.at + p.hold, p.release);
    }
    if (phrase.duck > 0) this.player.duck(phrase.duck, t0);
  }
}
