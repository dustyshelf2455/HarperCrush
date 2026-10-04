import { describe, expect, it } from 'vitest';
import { CHORDS, chordRootIn, chordTones, degreeToMidi, isInScale, midiToHz } from '../src/shared/scale';

describe('scale', () => {
  it('maps degrees to G major pentatonic', () => {
    // G3 A3 B3 D4 E4 G4
    expect([0, 1, 2, 3, 4, 5].map((d) => degreeToMidi(d))).toEqual([55, 57, 59, 62, 64, 67]);
    expect(degreeToMidi(-1)).toBe(52); // E3
    expect(degreeToMidi(-5)).toBe(43); // G2
  });

  it('every degree in a wide range is in scale', () => {
    for (let d = -20; d <= 30; d++) expect(isInScale(degreeToMidi(d))).toBe(true);
    expect(isInScale(56)).toBe(false); // G#
    expect(isInScale(60)).toBe(false); // C
  });

  it('chord tones are scale tones that belong to the chord', () => {
    const g = chordTones(CHORDS.G, 0, 9);
    expect(g).toEqual([55, 59, 62, 67, 71, 74]);
    for (const chord of Object.values(CHORDS)) {
      for (const m of chordTones(chord, -10, 20)) expect(isInScale(m)).toBe(true);
    }
  });

  it('finds a chord root within a window', () => {
    expect(chordRootIn(CHORDS.G, 40, 51)).toBe(43);
    expect(chordRootIn(CHORDS.Em, 40, 51)).toBe(40);
    expect(chordRootIn(CHORDS.Dsus, 40, 51)).toBe(50);
  });

  it('tunes A4 to 440', () => {
    expect(midiToHz(69)).toBeCloseTo(440);
  });
});
