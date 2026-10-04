import { describe, expect, it } from 'vitest';
import { GATE_WORDS, GateCooldown, QUIET_LONG_MS, QUIET_MS, STREAK_WINDOW_MS, pickGateWords } from '../src/game/gate';
import { createRng } from '../src/shared/rng';

describe('pickGateWords', () => {
  it('shows all eight words once each', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const { tiles } = pickGateWords(createRng(seed));
      expect(tiles).toHaveLength(GATE_WORDS.length);
      expect(new Set(tiles).size).toBe(GATE_WORDS.length);
      for (const w of tiles) expect(GATE_WORDS).toContain(w);
    }
  });

  it('picks two different targets that are both on the tiles', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const { tiles, targets } = pickGateWords(createRng(seed));
      expect(targets[0]).not.toBe(targets[1]);
      expect(tiles).toContain(targets[0]);
      expect(tiles).toContain(targets[1]);
    }
  });

  it('is deterministic for a seed and shuffles between seeds', () => {
    expect(pickGateWords(createRng(42))).toEqual(pickGateWords(createRng(42)));
    const orders = new Set(Array.from({ length: 30 }, (_, i) => pickGateWords(createRng(i + 1)).tiles.join(' ')));
    expect(orders.size).toBeGreaterThan(20);
  });

  it('spreads the targets over all the words (a guess is one in 56)', () => {
    const firsts = new Map<string, number>();
    const pairs = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) {
      const { targets } = pickGateWords(createRng(seed));
      firsts.set(targets[0], (firsts.get(targets[0]) ?? 0) + 1);
      pairs.add(targets.join('>'));
    }
    expect(firsts.size).toBe(GATE_WORDS.length);
    for (const n of firsts.values()) expect(n).toBeGreaterThan(3000 / 8 / 2);
    expect(pairs.size).toBe(8 * 7);
  });
});

describe('GateCooldown', () => {
  it('is not quiet to begin with', () => {
    const c = new GateCooldown();
    expect(c.isQuiet(0)).toBe(false);
    expect(c.isQuiet(1e9)).toBe(false);
  });

  it('stays quiet for 20 s after one wrong tap', () => {
    const c = new GateCooldown();
    c.wrongTap(1000);
    expect(c.isQuiet(1000)).toBe(true);
    expect(c.isQuiet(1000 + QUIET_MS - 1)).toBe(true);
    expect(c.isQuiet(1000 + QUIET_MS)).toBe(false);
  });

  it('stays quiet for a minute after two wrong taps in a row', () => {
    const c = new GateCooldown();
    c.wrongTap(0);
    c.wrongTap(QUIET_MS + 5000);
    const second = QUIET_MS + 5000;
    expect(c.attempts).toBe(2);
    expect(c.isQuiet(second + QUIET_MS)).toBe(true);
    expect(c.isQuiet(second + QUIET_LONG_MS - 1)).toBe(true);
    expect(c.isQuiet(second + QUIET_LONG_MS)).toBe(false);
  });

  it('keeps the long quiet for a third and later wrong tap', () => {
    const c = new GateCooldown();
    c.wrongTap(0);
    c.wrongTap(30_000);
    c.wrongTap(100_000);
    expect(c.isQuiet(100_000 + QUIET_LONG_MS - 1)).toBe(true);
    expect(c.isQuiet(100_000 + QUIET_LONG_MS)).toBe(false);
  });

  it('a successful open ends the run and the quiet', () => {
    const c = new GateCooldown();
    c.wrongTap(0);
    c.opened();
    expect(c.isQuiet(1)).toBe(false);
    expect(c.attempts).toBe(0);
    c.wrongTap(10);
    expect(c.isQuiet(10 + QUIET_MS - 1)).toBe(true);
    expect(c.isQuiet(10 + QUIET_MS)).toBe(false);
  });

  it('wrong taps far apart are not in a row', () => {
    const c = new GateCooldown();
    c.wrongTap(0);
    const later = STREAK_WINDOW_MS + 1;
    c.wrongTap(later);
    expect(c.attempts).toBe(1);
    expect(c.isQuiet(later + QUIET_MS - 1)).toBe(true);
    expect(c.isQuiet(later + QUIET_MS)).toBe(false);
  });

  it('takes its durations from the constructor', () => {
    const c = new GateCooldown(100, 500, 1000);
    c.wrongTap(0);
    expect(c.isQuiet(99)).toBe(true);
    expect(c.isQuiet(100)).toBe(false);
    c.wrongTap(200);
    expect(c.isQuiet(699)).toBe(true);
    expect(c.isQuiet(700)).toBe(false);
  });
});
