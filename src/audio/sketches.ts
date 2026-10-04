/**
 * The three musical feels offered on the mockup page. All in G major
 * pentatonic; motifs are written as scale degrees relative to a base.
 */
import { CHORDS } from '../shared/scale';
import type { SketchSpec } from './composer';

export const LULLABY: SketchSpec = {
  id: 'lullaby',
  name: 'Music-box lullaby',
  blurb: 'A gentle music-box melody over soft pads, slow and dreamy. My recommendation for the default.',
  bpm: 58,
  melody: {
    instrument: 'celesta',
    base: 10,
    motifs: [
      [{ d: 0, b: 1 }, { d: 2, b: 1 }, { d: 1, b: 0.5 }, { d: 0, b: 0.5 }, { d: -1, b: 2 }],
      [{ d: 2, b: 1.5 }, { d: 3, b: 0.5 }, { d: 2, b: 1 }, { d: 0, b: 1 }],
      [{ d: -1, b: 1 }, { d: 0, b: 1 }, { d: 2, b: 1 }, { d: 1, b: 1 }],
      [{ d: 3, b: 1 }, { d: 2, b: 1 }, { d: 0, b: 1 }, { d: -2, b: 1 }, { d: 0, b: 2 }],
      [{ d: 0, b: 0.5 }, { d: 1, b: 0.5 }, { d: 2, b: 1 }, { d: 1, b: 1 }, { d: 0, b: 1 }],
      [{ d: 4, b: 1 }, { d: 3, b: 1 }, { d: 2, b: 2 }],
    ],
    rest: [1.5, 3.5],
    ornament: 0.15,
    echo: 0.22,
    hold: 0.3,
    velocity: [0.5, 0.75],
  },
  chords: [CHORDS.G, CHORDS.Em, CHORDS.Asus, CHORDS.Dsus],
  beatsPerChord: 8,
  padLevel: 0.2,
  padDegrees: [-2, 4],
  bass: { beats: [0], level: 0.3 },
  shimmer: { every: [6, 12], level: 0.18, degrees: [12, 17] },
  windDown: {
    bpm: 48,
    melody: { base: 5, rest: [3, 6], ornament: 0, echo: 0.1, velocity: [0.4, 0.6] },
    padLevel: 0.26,
    bass: null,
    shimmer: { every: [10, 18], level: 0.14, degrees: [12, 17] },
  },
};

export const PLAYFUL: SketchSpec = {
  id: 'playful',
  name: 'Playful and light',
  blurb: 'Brighter and a little bouncier, closer to the mood of the game she knows. Still soft, never fast.',
  bpm: 84,
  melody: {
    instrument: 'marimba',
    base: 10,
    motifs: [
      [{ d: 0, b: 0.5 }, { d: 2, b: 0.5 }, { d: 3, b: 0.5 }, { d: 2, b: 0.5 }, { d: 0, b: 1 }],
      [{ d: 3, b: 0.5 }, { d: 4, b: 0.5 }, { d: 3, b: 1 }, { d: 2, b: 0.5 }, { d: 0, b: 0.5 }, { d: 1, b: 1 }],
      [{ d: 0, b: 0.5 }, { d: 0, b: 0.5 }, { d: 2, b: 0.5 }, { d: 1, b: 0.5 }, { d: -1, b: 1 }, { d: 0, b: 1 }],
      [{ d: 2, b: 0.5 }, { d: 3, b: 0.5 }, { d: 5, b: 1 }, { d: 3, b: 0.5 }, { d: 2, b: 0.5 }, { d: 0, b: 1 }],
      [{ d: 1, b: 0.5 }, { d: 2, b: 0.5 }, { d: 1, b: 0.5 }, { d: 0, b: 0.5 }, { d: -1, b: 1.5 }],
      [{ d: 5, b: 0.5 }, { d: 4, b: 0.5 }, { d: 2, b: 0.5 }, { d: 3, b: 0.5 }, { d: 0, b: 1 }],
    ],
    rest: [1, 2.5],
    ornament: 0.25,
    echo: 0.12,
    hold: 0.15,
    velocity: [0.45, 0.7],
  },
  chords: [CHORDS.G, CHORDS.Dsus, CHORDS.Em, CHORDS.Asus],
  beatsPerChord: 4,
  padLevel: 0.13,
  padDegrees: [-2, 4],
  bass: { beats: [0, 2.5], level: 0.28 },
  shimmer: { every: [8, 16], level: 0.15, degrees: [12, 17] },
  windDown: {
    bpm: 64,
    melody: { instrument: 'celesta', base: 5, rest: [2.5, 5], ornament: 0.05, echo: 0.2, velocity: [0.4, 0.6] },
    padLevel: 0.24,
    bass: null,
    shimmer: { every: [10, 18], level: 0.12, degrees: [12, 17] },
  },
};

export const DREAMY: SketchSpec = {
  id: 'dreamy',
  name: 'Dreamy ambient',
  blurb: 'Mostly pads and shimmer with only an occasional melody. More a soundscape than a tune; least likely to wear thin.',
  bpm: 50,
  melody: {
    instrument: 'bell',
    base: 10,
    motifs: [
      [{ d: 0, b: 2 }, { d: 2, b: 2 }],
      [{ d: 3, b: 1.5 }, { d: 2, b: 2.5 }],
      [{ d: 4, b: 2 }, { d: 2, b: 1 }, { d: 0, b: 3 }],
      [{ d: -1, b: 2 }, { d: 0, b: 2 }],
      [{ d: 2, b: 1 }, { d: 3, b: 1 }, { d: 5, b: 3 }],
    ],
    rest: [5, 10],
    ornament: 0,
    echo: 0.3,
    hold: 0.4,
    velocity: [0.32, 0.5],
  },
  chords: [CHORDS.G, CHORDS.Em, CHORDS.Dsus, CHORDS.Asus],
  beatsPerChord: 16,
  padLevel: 0.28,
  padDegrees: [-5, 7],
  bass: null,
  shimmer: { every: [3, 7], level: 0.22, degrees: [10, 17] },
  windDown: {
    bpm: 44,
    melody: { base: 5, rest: [8, 14], velocity: [0.28, 0.4] },
    padLevel: 0.32,
    shimmer: { every: [6, 12], level: 0.16, degrees: [10, 17] },
  },
};

export const SKETCHES: readonly SketchSpec[] = [LULLABY, PLAYFUL, DREAMY];
