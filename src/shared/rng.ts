/**
 * Small, fast, seedable random number generator (mulberry32).
 * Every piece of game logic takes one of these instead of Math.random so
 * boards, levels and music are reproducible in tests.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [0, n). */
  int(n: number): number;
  /** Uniform float in [a, b). */
  range(a: number, b: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** A uniformly chosen element. Throws on an empty list. */
  pick<T>(items: readonly T[]): T;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  if (s === 0) s = 0x9e3779b9;
  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (a, b) => a + (b - a) * next(),
    chance: (p) => next() < p,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('pick() from an empty list');
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}

/** Derive a new seed from a seed and a small integer, for independent streams. */
export function deriveSeed(seed: number, salt: number): number {
  let h = (seed ^ 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (salt + 0x9e3779b9), 0xc2b2ae35) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}
