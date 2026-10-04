/**
 * Everything the game plays sits on one scale: G major pentatonic
 * (G A B D E). Any two notes from it sound well together, so cascades,
 * chimes and music can overlap freely without dissonance.
 */
export const PENTATONIC_STEPS: readonly number[] = [0, 2, 4, 7, 9];
export const DEGREES_PER_OCTAVE = 5;
/** Degree 0 is G3. */
export const ROOT_MIDI = 55;

/** Scale degree to MIDI note. Degree 5 is an octave above degree 0; -1 is E3. */
export function degreeToMidi(degree: number, root: number = ROOT_MIDI): number {
  const octave = Math.floor(degree / DEGREES_PER_OCTAVE);
  const step = degree - octave * DEGREES_PER_OCTAVE;
  return root + octave * 12 + (PENTATONIC_STEPS[step] ?? 0);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function isInScale(midi: number, root: number = ROOT_MIDI): boolean {
  const pitchClass = (((midi - root) % 12) + 12) % 12;
  return PENTATONIC_STEPS.includes(pitchClass);
}

/**
 * A chord as a set of scale degrees (pitch classes 0..4 within the scale).
 * The first degree is the root.
 */
export interface Chord {
  readonly name: string;
  readonly degrees: readonly number[];
}

export const CHORDS = {
  /** G B D */
  G: { name: 'G', degrees: [0, 2, 3] },
  /** E G B */
  Em: { name: 'Em', degrees: [4, 0, 2] },
  /** A D E */
  Asus: { name: 'Asus', degrees: [1, 3, 4] },
  /** D G A */
  Dsus: { name: 'Dsus', degrees: [3, 0, 1] },
} as const satisfies Record<string, Chord>;

function pitchClassOf(degree: number): number {
  return ((degree % DEGREES_PER_OCTAVE) + DEGREES_PER_OCTAVE) % DEGREES_PER_OCTAVE;
}

/** All chord tones, as MIDI notes, whose scale degree lies in [lo, hi]. */
export function chordTones(chord: Chord, lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let d = lo; d <= hi; d++) {
    if (chord.degrees.includes(pitchClassOf(d))) out.push(degreeToMidi(d));
  }
  return out;
}

/** The chord's root as a MIDI note inside [loMidi, hiMidi] (an octave-wide window). */
export function chordRootIn(chord: Chord, loMidi: number, hiMidi: number): number {
  const rootDegree = chord.degrees[0] ?? 0;
  for (let octave = -4; octave <= 4; octave++) {
    const midi = degreeToMidi(rootDegree + octave * DEGREES_PER_OCTAVE);
    if (midi >= loMidi && midi <= hiMidi) return midi;
  }
  return degreeToMidi(rootDegree);
}
