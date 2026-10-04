/**
 * The music sketches. The first three are the feels offered on the Stage 1
 * mockup page; the parent chose the music-box lullaby (DESIGN.md 2b). The
 * area sketches below it are that same lullaby in each area's voice with a
 * small variation (DESIGN.md 2c, 3.11), so the tune she knows travels with
 * her and still sounds like somewhere new. All in G major pentatonic; motifs
 * are written as scale degrees relative to a base.
 */
import type { AreaId } from '../core/journey';
import { CHORDS } from '../shared/scale';
import type { MelodyInstrument, Motif, SketchSpec } from './composer';

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

// ------------------------------------------------------------ area voices

/** A motif moved by a number of scale degrees. Transposing within the pentatonic keeps it in scale. */
function transposed(motif: Motif, degrees: number): Motif {
  return motif.map((n) => ({ d: n.d + degrees, b: n.b }));
}

/** The lullaby's motifs by index, so a variation can swap one out by name. */
const M = LULLABY.melody.motifs;

/**
 * The lullaby in another voice. Everything not named in `patch` is the
 * lullaby's own, so each area stays recognisably the same tune: at least four
 * of its six motifs are untouched (tests/composer.test.ts holds this). Motifs
 * never rise above degree 7 (+1 for an ornament is degree 8 above the base:
 * B6, the top of the comfortable register), so the melody stays below MIDI 96.
 */
function variation(
  area: AreaId,
  name: string,
  blurb: string,
  instrument: MelodyInstrument,
  patch: Partial<Omit<SketchSpec, 'id' | 'name' | 'blurb' | 'melody' | 'windDown'>> & {
    melody?: Partial<Omit<SketchSpec['melody'], 'instrument'>>;
    windDown?: Partial<SketchSpec['windDown']>;
  },
): SketchSpec {
  const { melody, windDown, ...rest } = patch;
  return {
    ...LULLABY,
    ...rest,
    id: `lullaby-${area}`,
    name,
    blurb,
    melody: { ...LULLABY.melody, ...melody, instrument },
    windDown: { ...LULLABY.windDown, ...windDown },
  };
}

/**
 * One sketch per area (DESIGN.md 2c, "Area voices"): celesta in Twinkle
 * Meadow (exactly the chosen lullaby), glass in Crystal Cave, water in
 * Mermaid Lagoon, horn in Cloud Castle, harp in Star Garden, shimmer on
 * Aurora Peak, kalimba in Dragon Hollow. Each variation is small: a motif
 * transposed, a different chord order, a different shimmer density.
 */
export const AREA_SKETCHES: Record<AreaId, SketchSpec> = {
  meadow: LULLABY,

  // Crystal Cave: struck crystal, denser twinkles like drips on stone, the
  // falling sixth motif answered an octave down, chords turning the other way.
  cave: variation('cave', 'Music-box lullaby (Crystal Cave)', 'The lullaby on struck crystal, with more twinkles.', 'glass', {
    chords: [CHORDS.G, CHORDS.Em, CHORDS.Dsus, CHORDS.Asus],
    melody: { motifs: [M[0]!, M[1]!, M[2]!, M[3]!, M[4]!, transposed(M[5]!, -5)], ornament: 0.2 },
    shimmer: { every: [4, 9], level: 0.17, degrees: [12, 17] },
    windDown: { shimmer: { every: [8, 14], level: 0.13, degrees: [12, 17] } },
  }),

  // Mermaid Lagoon: a marimba under water. A touch slower and more spacious,
  // almost no grace notes (the attack is too soft for them), more low echoes.
  lagoon: variation('lagoon', 'Music-box lullaby (Mermaid Lagoon)', 'The lullaby softened under water, slower and deeper.', 'water', {
    bpm: 54,
    chords: [CHORDS.G, CHORDS.Asus, CHORDS.Em, CHORDS.Dsus],
    melody: { motifs: [M[0]!, M[1]!, M[2]!, M[3]!, transposed(M[4]!, -2), M[5]!], rest: [2, 4], ornament: 0.04, echo: 0.32, hold: 0.4 },
    padLevel: 0.22,
    bass: { beats: [0], level: 0.26 },
    shimmer: { every: [8, 14], level: 0.14, degrees: [12, 17] },
    windDown: { bpm: 46 },
  }),

  // Cloud Castle: a gentle horn. No grace notes, longer last notes, a slightly
  // slower tempo, the falling sixth motif settling two degrees lower.
  castle: variation('castle', 'Music-box lullaby (Cloud Castle)', 'The lullaby on a gentle horn, slow and warm.', 'horn', {
    bpm: 56,
    chords: [CHORDS.G, CHORDS.Dsus, CHORDS.Em, CHORDS.Asus],
    melody: { motifs: [M[0]!, M[1]!, M[2]!, M[3]!, M[4]!, transposed(M[5]!, -2)], rest: [2, 4], ornament: 0, hold: 0.45, velocity: [0.45, 0.68] },
    padLevel: 0.22,
    bass: { beats: [0], level: 0.32 },
    shimmer: { every: [8, 14], level: 0.16, degrees: [12, 17] },
    windDown: { bpm: 46 },
  }),

  // Star Garden: a plucked harp. More grace notes and echoes, denser twinkles
  // like stars coming out, the third motif lifted a fourth, chords starting on Em.
  garden: variation('garden', 'Music-box lullaby (Star Garden)', 'The lullaby plucked on a harp under the stars.', 'harp', {
    chords: [CHORDS.Em, CHORDS.G, CHORDS.Asus, CHORDS.Dsus],
    melody: { motifs: [M[0]!, M[1]!, transposed(M[2]!, 3), M[3]!, M[4]!, M[5]!], ornament: 0.28, echo: 0.3 },
    shimmer: { every: [5, 10], level: 0.19, degrees: [12, 17] },
  }),

  // Aurora Peak: a shimmering bell. A little slower and more spacious, a
  // fuller pad, frequent twinkles, the first motif lifted so the tune glows higher.
  peak: variation('peak', 'Music-box lullaby (Aurora Peak)', 'The lullaby on a shimmering bell under the northern lights.', 'shimmer', {
    bpm: 54,
    chords: [CHORDS.G, CHORDS.Em, CHORDS.Dsus, CHORDS.Asus],
    melody: { motifs: [transposed(M[0]!, 2), M[1]!, M[2]!, M[3]!, M[4]!, M[5]!], rest: [2, 4.5], ornament: 0.1, echo: 0.25, velocity: [0.45, 0.7] },
    padLevel: 0.24,
    bass: { beats: [0], level: 0.26 },
    shimmer: { every: [4, 8], level: 0.2, degrees: [12, 17] },
    windDown: { bpm: 46, padLevel: 0.28 },
  }),

  // Dragon Hollow: a warm kalimba. A gentle two-pulse bass like a sleeping
  // dragon's breath, the fourth motif settling lower, chords starting on Em.
  hollow: variation('hollow', 'Music-box lullaby (Dragon Hollow)', 'The lullaby on a warm kalimba by the dragon’s glow.', 'kalimba', {
    bpm: 60,
    chords: [CHORDS.Em, CHORDS.Asus, CHORDS.G, CHORDS.Dsus],
    melody: { motifs: [M[0]!, M[1]!, M[2]!, transposed(M[3]!, -2), M[4]!, M[5]!], ornament: 0.12, echo: 0.2 },
    bass: { beats: [0, 2.5], level: 0.3 },
    shimmer: { every: [7, 13], level: 0.15, degrees: [12, 17] },
  }),
};

/** The lullaby in the given area's voice (DESIGN.md 3.11: "the music changes as she travels"). */
export function sketchForArea(area: AreaId): SketchSpec {
  return AREA_SKETCHES[area];
}
