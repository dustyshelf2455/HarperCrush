import { describe, expect, it } from 'vitest';
import { createRng, deriveSeed } from '../src/shared/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs between seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    const same = Array.from({ length: 20 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(3);
  });

  it('stays within ranges', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      const n = r.int(6);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(6);
      const f = r.range(2, 5);
      expect(f).toBeGreaterThanOrEqual(2);
      expect(f).toBeLessThan(5);
    }
  });

  it('derives distinct seeds', () => {
    const seeds = new Set(Array.from({ length: 50 }, (_, i) => deriveSeed(99, i)));
    expect(seeds.size).toBe(50);
  });
});
