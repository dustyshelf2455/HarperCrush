import { describe, expect, it } from 'vitest';
import { Composer, type MusicEvent } from '../src/audio/composer';
import { SKETCHES } from '../src/audio/sketches';
import { createRng } from '../src/shared/rng';
import { isInScale } from '../src/shared/scale';

function run(spec: (typeof SKETCHES)[number], beats: number, seed: number, windDownAt: number | null = null): MusicEvent[] {
  const composer = new Composer(spec, createRng(seed));
  const events: MusicEvent[] = [];
  for (let upTo = 2; upTo <= beats; upTo += 2) {
    if (windDownAt !== null && upTo >= windDownAt && !composer.isWindDown) composer.setWindDown(true);
    events.push(...composer.next(upTo));
  }
  return events;
}

describe('composer', () => {
  for (const spec of SKETCHES) {
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
