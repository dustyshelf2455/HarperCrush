import { describe, expect, it } from 'vitest';
import type { MusicEvent } from '../src/audio/composer';
import { INSTRUMENTS } from '../src/audio/engine';
import { crossWeights } from '../src/audio/player';
import { BEATS_PER_BAR, LOOP_BARS, LOOP_BEATS, THEME_BARS, THEME_CHORDS, THEME_MELODY, THEME_VOICES, ThemeComposer, normaliseWeights, themeChordAt } from '../src/audio/theme';
import { AREA_IDS, type AreaId } from '../src/core/journey';
import { SECTIONS_PER_AREA, SECTION_PITCH, areaUnderView, lanternWorld } from '../src/render/mapWorld';
import { createRng } from '../src/shared/rng';
import { isInScale } from '../src/shared/scale';

function run(composer: ThemeComposer, beats: number, step = 2): MusicEvent[] {
  const events: MusicEvent[] = [];
  for (let upTo = step; upTo <= beats; upTo += step) events.push(...composer.next(upTo));
  return events;
}

describe('the theme as written', () => {
  it('is thirty-two bars of four beats, each bar filling its four beats exactly', () => {
    expect(LOOP_BARS).toBe(32);
    expect(LOOP_BEATS).toBe(128);
    for (const bar of THEME_BARS) {
      const beats = bar.reduce((sum, n) => sum + ('r' in n ? n.r : n.b), 0);
      expect(beats).toBe(BEATS_PER_BAR);
    }
    expect(THEME_CHORDS.length).toBe(LOOP_BARS);
  });

  it('stays in the pentatonic scale and inside the comfortable register', () => {
    for (const n of THEME_MELODY) {
      expect(isInScale(n.midi)).toBe(true);
      expect(n.midi).toBeGreaterThanOrEqual(74); // D5
      expect(n.midi).toBeLessThanOrEqual(91); // G6
    }
  });

  it('ends on the home note, held, so the loop steps straight back into the rising opening', () => {
    const last = THEME_MELODY[THEME_MELODY.length - 1] as { beat: number; midi: number };
    expect(last.midi).toBe(79); // G5
    expect(LOOP_BEATS - last.beat).toBe(4);
    expect(themeChordAt(LOOP_BEATS - 1).name).toBe('G');
    expect(themeChordAt(0).name).toBe('G');
    expect(themeChordAt(LOOP_BEATS + 3).name).toBe(themeChordAt(3).name);
  });

  it('gives every area a voice the engine can play, all the tune at the same loudness', () => {
    const levels = new Set<number>();
    for (const id of AREA_IDS) {
      const v = THEME_VOICES[id];
      expect(v.area).toBe(id);
      expect(INSTRUMENTS[v.melody]).toBeDefined();
      expect(INSTRUMENTS[v.figureInstrument]).toBeDefined();
      expect(v.figure.length).toBeGreaterThan(0);
      levels.add(Math.round(v.melodyLevel * 100));
    }
    const sorted = [...levels].sort((a, b) => a - b);
    expect((sorted[sorted.length - 1] as number) - (sorted[0] as number)).toBeLessThanOrEqual(4);
    const melodies = new Set(AREA_IDS.map((id) => THEME_VOICES[id].melody));
    expect(melodies.size).toBe(AREA_IDS.length);
  });
});

describe('the theme composer', () => {
  for (const id of AREA_IDS) {
    it(`plays ${id} in one voice, in scale, in order, with the whole tune`, () => {
      const composer = new ThemeComposer(createRng(3), { [id]: 1 });
      const events = run(composer, LOOP_BEATS * 2);
      let last = -1;
      for (const ev of events) {
        if (ev.kind === 'chord') ev.midis.forEach((m) => expect(isInScale(m)).toBe(true));
        else {
          expect(isInScale(ev.midi)).toBe(true);
          expect(ev.vel).toBeGreaterThan(0);
          expect(ev.vel).toBeLessThanOrEqual(1);
        }
        expect(ev.beat).toBeGreaterThanOrEqual(last - 0.05);
        last = Math.max(last, ev.beat);
      }
      const melody = events.filter((e) => e.kind === 'note' && e.instrument === THEME_VOICES[id].melody && e.vel > THEME_VOICES[id].figureLevel * 1.2);
      // Two loops of the tune, less the first bar's intro the melody waits out.
      const introNotes = THEME_MELODY.filter((n) => n.beat < BEATS_PER_BAR).length;
      expect(melody.length).toBe(THEME_MELODY.length * 2 - introNotes);
      const chords = events.filter((e) => e.kind === 'chord');
      expect(chords.length).toBe((LOOP_BEATS * 2) / BEATS_PER_BAR);
      chords.forEach((c, i) => expect(c.beat).toBe(i * BEATS_PER_BAR));
    });
  }

  it('is the same every time for the same seed', () => {
    const a = run(new ThemeComposer(createRng(9), { cave: 1 }), 64);
    const b = run(new ThemeComposer(createRng(9), { cave: 1 }), 64);
    expect(a).toEqual(b);
  });

  it('plays the tune in both voices while crossing, their shares summing to a steady level', () => {
    const composer = new ThemeComposer(createRng(1), { meadow: 1 }, 0);
    composer.setWeights({ meadow: 0.5, cave: 0.5 });
    const events = composer.next(8);
    const celesta = events.filter((e) => e.kind === 'note' && e.instrument === 'celesta' && e.vel > 0.3);
    const glass = events.filter((e) => e.kind === 'note' && e.instrument === 'glass' && e.vel > 0.3);
    expect(celesta.length).toBeGreaterThan(0);
    expect(celesta.length).toBe(glass.length);
    // Equal power: each voice at 1/sqrt(2) of its own level (less a little breath of up to 6% in the loudness).
    const notes = THEME_MELODY.filter((n) => n.beat < 8);
    celesta.forEach((ev, i) => {
      const c = ev as { vel: number };
      const g = glass[i] as { vel: number };
      const n = notes[i] as { vel: number };
      const shareC = c.vel / (THEME_VOICES.meadow.melodyLevel * n.vel);
      const shareG = g.vel / (THEME_VOICES.cave.melodyLevel * n.vel);
      expect(shareC).toBeCloseTo(shareG, 6);
      expect(shareC).toBeGreaterThan(Math.SQRT1_2 * 0.93);
      expect(shareC).toBeLessThanOrEqual(Math.SQRT1_2 + 1e-9);
    });
  });

  it('mixes the pad, pulse and twinkle density by weight', () => {
    const mixed = new ThemeComposer(createRng(2), { lagoon: 0.5, peak: 0.5 });
    const chord = mixed.next(1).find((e) => e.kind === 'chord') as { level: number };
    expect(chord.level).toBeCloseTo((THEME_VOICES.lagoon.padLevel + THEME_VOICES.peak.padLevel) / 2, 5);
    const hollow = run(new ThemeComposer(createRng(2), { hollow: 1 }), 16);
    expect(hollow.filter((e) => e.kind === 'bass').length).toBe(8);
    const dense = run(new ThemeComposer(createRng(4), { cave: 1 }), 200).filter((e) => e.kind === 'ping').length;
    const sparse = run(new ThemeComposer(createRng(4), { lagoon: 1 }), 200).filter((e) => e.kind === 'ping').length;
    expect(dense).toBeGreaterThan(sparse * 1.5);
  });

  it('normalises weights and falls back to the meadow', () => {
    expect(normaliseWeights({ cave: 2, peak: 2 })).toMatchObject({ cave: 0.5, peak: 0.5, meadow: 0 });
    expect(normaliseWeights({})).toMatchObject({ meadow: 1 });
    expect(normaliseWeights({ cave: 0.001 })).toMatchObject({ meadow: 1 });
  });
});

describe('crossing between voices', () => {
  const sum = (w: Partial<Record<AreaId, number>>): number => Object.values(w).reduce((a, b) => a + (b ?? 0), 0);

  it('moves the weight to the target over the steps and always sums to one', () => {
    let w: Partial<Record<AreaId, number>> = { meadow: 1 };
    const seen: number[] = [];
    for (let i = 0; i < 12; i++) {
      w = crossWeights(w, 'cave', 0.1);
      expect(sum(w)).toBeCloseTo(1, 6);
      seen.push(w.cave ?? 0);
    }
    expect(seen[0]).toBeCloseTo(0.1, 6);
    expect(seen[4]).toBeCloseTo(0.5, 6);
    expect(w).toEqual({ cave: 1 });
    expect(crossWeights({ cave: 1 }, 'cave', 0.1)).toEqual({ cave: 1 });
  });

  it('retargets mid-way without a jump, the leaving voices fading together', () => {
    let w: Partial<Record<AreaId, number>> = { meadow: 1 };
    for (let i = 0; i < 5; i++) w = crossWeights(w, 'cave', 0.1);
    w = crossWeights(w, 'lagoon', 0.1);
    expect(sum(w)).toBeCloseTo(1, 6);
    expect(w.lagoon).toBeCloseTo(0.1, 6);
    expect(w.meadow).toBeCloseTo(0.45, 6);
    expect(w.cave).toBeCloseTo(0.45, 6);
  });
});

describe('the area under the map view', () => {
  it('is the page area until the top of an area\'s last page, where it becomes the next', () => {
    expect(areaUnderView(0)).toBe('meadow');
    expect(areaUnderView(lanternWorld(1).y)).toBe('meadow');
    const lastPage = (SECTIONS_PER_AREA - 1) * SECTION_PITCH;
    expect(areaUnderView(lastPage + SECTION_PITCH * 0.5)).toBe('meadow');
    expect(areaUnderView(lastPage + SECTION_PITCH * 0.85)).toBe('meadow');
    expect(areaUnderView(lastPage + SECTION_PITCH * 0.95)).toBe('cave');
    expect(areaUnderView(SECTIONS_PER_AREA * SECTION_PITCH + 10)).toBe('cave');
  });

  it('places every lantern in its own area', () => {
    for (let n = 1; n <= 70; n++) {
      const expected = AREA_IDS[Math.floor((n - 1) / 10)] as AreaId;
      expect(areaUnderView(lanternWorld(n).y)).toBe(expected);
    }
  });
});
