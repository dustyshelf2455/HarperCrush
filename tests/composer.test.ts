import { describe, expect, it } from 'vitest';
import { Composer, type MusicEvent, type SketchSpec } from '../src/audio/composer';
import { AREA_SKETCHES, LULLABY, SKETCHES, sketchForArea } from '../src/audio/sketches';
import { AREA_IDS } from '../src/core/journey';
import { createRng } from '../src/shared/rng';
import { isInScale } from '../src/shared/scale';

/** The three mockup sketches plus every area's lullaby (the Meadow is LULLABY itself, already in SKETCHES). */
const ALL_SKETCHES: readonly SketchSpec[] = [...SKETCHES, ...AREA_IDS.map(sketchForArea).filter((s) => s !== LULLABY)];

function run(spec: SketchSpec, beats: number, seed: number, windDownAt: number | null = null): MusicEvent[] {
  const composer = new Composer(spec, createRng(seed));
  const events: MusicEvent[] = [];
  for (let upTo = 2; upTo <= beats; upTo += 2) {
    if (windDownAt !== null && upTo >= windDownAt && !composer.isWindDown) composer.setWindDown(true);
    events.push(...composer.next(upTo));
  }
  return events;
}

describe('composer', () => {
  for (const spec of ALL_SKETCHES) {
    describe(spec.id, () => {
      it('only ever plays notes from the pentatonic scale', () => {
        for (const seed of [1, 2, 3]) {
          const events = run(spec, 400, seed, 200);
          for (const ev of events) {
            if (ev.kind === 'chord') ev.midis.forEach((m) => expect(isInScale(m)).toBe(true));
            else expect(isInScale(ev.midi)).toBe(true);
          }
        }
      });

      it('returns each event once, in beat order within a call, and keeps producing', () => {
        const composer = new Composer(spec, createRng(5));
        let last = -Infinity;
        let count = 0;
        for (let upTo = 1; upTo <= 300; upTo += 1) {
          const batch = composer.next(upTo);
          for (let i = 1; i < batch.length; i++) expect((batch[i] as MusicEvent).beat).toBeGreaterThanOrEqual((batch[i - 1] as MusicEvent).beat);
          for (const ev of batch) {
            expect(ev.beat).toBeLessThan(upTo + 0.001);
            expect(ev.beat).toBeGreaterThan(last - 0.5); // ornaments may sit slightly before the previous main note
            last = Math.max(last, ev.beat);
          }
          count += batch.length;
        }
        expect(count).toBeGreaterThan(100);
      });

      it('keeps velocities sane and chords periodic', () => {
        const events = run(spec, 200, 8);
        const chords = events.filter((e) => e.kind === 'chord');
        expect(chords.length).toBe(Math.ceil(200 / spec.beatsPerChord));
        chords.forEach((c, i) => expect(c.beat).toBe(i * spec.beatsPerChord));
        for (const ev of events) {
          if (ev.kind === 'chord') expect(ev.level).toBeGreaterThan(0);
          else {
            expect(ev.vel).toBeGreaterThan(0);
            expect(ev.vel).toBeLessThanOrEqual(1);
          }
        }
      });

      it('slows down and thins out in wind-down', () => {
        const composer = new Composer(spec, createRng(1));
        expect(composer.bpm).toBe(spec.bpm);
        composer.setWindDown(true);
        expect(composer.bpm).toBe(spec.windDown.bpm);
        expect(spec.windDown.bpm).toBeLessThan(spec.bpm);
        const normal = run(spec, 400, 4).filter((e) => e.kind === 'note').length;
        const wind = run(spec, 400, 4, 0).filter((e) => e.kind === 'note').length;
        expect(wind).toBeLessThan(normal);
      });

      it('notes stay in a comfortable register', () => {
        for (const ev of run(spec, 300, 2)) {
          if (ev.kind === 'chord') continue;
          expect(ev.midi).toBeGreaterThanOrEqual(36);
          expect(ev.midi).toBeLessThanOrEqual(96);
        }
      });
    });
  }
});

describe('area sketches', () => {
  it('gives every area a sketch with its own id, and keeps the Meadow exactly the chosen lullaby (DESIGN.md 2b)', () => {
    expect(sketchForArea('meadow')).toBe(LULLABY);
    expect(AREA_SKETCHES.meadow).toBe(LULLABY);
    const ids = new Set(AREA_IDS.map((a) => sketchForArea(a).id));
    expect(ids.size).toBe(AREA_IDS.length);
    for (const area of AREA_IDS) {
      const spec = sketchForArea(area);
      expect(spec.id.startsWith('lullaby')).toBe(true);
      expect(spec.id).toBe(area === 'meadow' ? 'lullaby' : `lullaby-${area}`);
    }
  });

  it('plays each area in its own voice (DESIGN.md 2c, "Area voices")', () => {
    expect(sketchForArea('meadow').melody.instrument).toBe('celesta');
    expect(sketchForArea('cave').melody.instrument).toBe('glass');
    expect(sketchForArea('lagoon').melody.instrument).toBe('water');
    expect(sketchForArea('castle').melody.instrument).toBe('horn');
    expect(sketchForArea('garden').melody.instrument).toBe('harp');
    expect(sketchForArea('peak').melody.instrument).toBe('shimmer');
    expect(sketchForArea('hollow').melody.instrument).toBe('kalimba');
  });

  it('stays recognisably the lullaby: the same base and chords, at least four of its six motifs untouched, a near tempo', () => {
    const lullabyMotifs = LULLABY.melody.motifs.map((m) => JSON.stringify(m));
    for (const area of AREA_IDS) {
      const spec = sketchForArea(area);
      expect(spec.melody.base).toBe(LULLABY.melody.base);
      expect(spec.melody.motifs.length).toBe(LULLABY.melody.motifs.length);
      const kept = spec.melody.motifs.filter((m) => lullabyMotifs.includes(JSON.stringify(m))).length;
      expect(kept, area).toBeGreaterThanOrEqual(4);
      expect([...spec.chords].map((c) => c.name).sort()).toEqual([...LULLABY.chords].map((c) => c.name).sort());
      expect(spec.beatsPerChord).toBe(LULLABY.beatsPerChord);
      expect(Math.abs(spec.bpm - LULLABY.bpm)).toBeLessThanOrEqual(6);
      expect(spec.windDown.bpm).toBeLessThan(spec.bpm);
      expect(spec.shimmer).not.toBeNull();
    }
  });

  it('keeps every area about as loud as the Meadow', () => {
    for (const area of AREA_IDS) {
      const spec = sketchForArea(area);
      expect(spec.melody.velocity[1]).toBeLessThanOrEqual(LULLABY.melody.velocity[1]);
      expect(spec.padLevel).toBeLessThanOrEqual(LULLABY.padLevel + 0.05);
      expect(spec.shimmer?.level ?? 0).toBeLessThanOrEqual(LULLABY.shimmer!.level + 0.03);
      expect(spec.bass?.level ?? 0).toBeLessThanOrEqual(LULLABY.bass!.level + 0.03);
    }
  });
});
