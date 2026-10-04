import { describe, expect, it } from 'vitest';
import { GEM_TYPES, type GemType, type Grid, findLineMatches, findValidSwaps, generateGrid, reshuffle, swapMakesLine, typeCounts } from '../src/core/grid';
import { createRng } from '../src/shared/rng';

const CALM: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];
const FOUR: readonly GemType[] = ['star', 'heart', 'drop', 'leaf'];

describe('generateGrid', () => {
  it('never starts with a match and always has a valid move (5 types, 6x7)', () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const grid = generateGrid(7, 6, CALM, createRng(seed));
      expect(findLineMatches(grid)).toHaveLength(0);
      expect(findValidSwaps(grid).length).toBeGreaterThan(0);
    }
  });

  it('never starts with a match and always has a valid move (4 types, 6x7)', () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const grid = generateGrid(7, 6, FOUR, createRng(seed));
      expect(findLineMatches(grid)).toHaveLength(0);
      expect(findValidSwaps(grid).length).toBeGreaterThan(0);
    }
  });

  it('works for Play-mode sizes with six types', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const grid = generateGrid(8, 7, GEM_TYPES, createRng(seed));
      expect(findLineMatches(grid)).toHaveLength(0);
      expect(findValidSwaps(grid).length).toBeGreaterThan(0);
    }
  });

  it('is deterministic for a seed', () => {
    expect(generateGrid(7, 6, CALM, createRng(5))).toEqual(generateGrid(7, 6, CALM, createRng(5)));
  });
});

describe('findLineMatches', () => {
  it('finds horizontal and vertical runs and ignores empties', () => {
    const grid: Grid = [
      ['star', 'star', 'star', 'heart'],
      ['drop', 'leaf', 'heart', 'heart'],
      ['drop', null, 'star', 'heart'],
      ['drop', 'leaf', 'leaf', 'heart'],
    ];
    const matches = findLineMatches(grid);
    const keys = matches.map((m) => m.map((c) => `${c.row},${c.col}`).join(' '));
    expect(keys).toContain('0,0 0,1 0,2');
    expect(keys).toContain('1,0 2,0 3,0');
    expect(keys).toContain('0,3 1,3 2,3 3,3');
    expect(matches).toHaveLength(3);
  });

  it('reports a run of four as one match', () => {
    const grid: Grid = [['star', 'star', 'star', 'star', 'heart']];
    expect(findLineMatches(grid)).toEqual([[{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }]]);
  });
});

describe('swaps', () => {
  it('detects a swap that completes a line and rejects one that does not', () => {
    const grid: Grid = [
      ['star', 'heart', 'star', 'star'],
      ['leaf', 'star', 'drop', 'leaf'],
    ];
    expect(swapMakesLine(grid, { row: 0, col: 1 }, { row: 1, col: 1 })).toBe(true);
    expect(swapMakesLine(grid, { row: 1, col: 2 }, { row: 1, col: 3 })).toBe(false);
    // swapMakesLine must leave the grid unchanged
    expect(grid[0]).toEqual(['star', 'heart', 'star', 'star']);
  });

  it('swapping two identical gems is never a move', () => {
    const grid: Grid = [['star', 'star', 'heart', 'star']];
    expect(swapMakesLine(grid, { row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
  });
});

describe('reshuffle', () => {
  it('keeps the same pieces and yields a board with no match and a valid move', () => {
    const rng = createRng(3);
    for (let i = 0; i < 300; i++) {
      const grid = generateGrid(7, 6, CALM, rng);
      const byType = (g: Grid): Array<{ type: GemType; count: number }> => typeCounts(g).sort((a, b) => a.type.localeCompare(b.type));
      const before = byType(grid);
      const next = reshuffle(grid, rng);
      expect(next).not.toBeNull();
      if (!next) continue;
      expect(byType(next)).toEqual(before);
      expect(findLineMatches(next)).toHaveLength(0);
      expect(findValidSwaps(next).length).toBeGreaterThan(0);
    }
  });

  it('rescues a dead board', () => {
    // Three types in diagonal stripes: no line, and no swap completes one.
    const types: GemType[] = ['star', 'heart', 'drop'];
    const dead: Grid = Array.from({ length: 6 }, (_, r) => Array.from({ length: 6 }, (_, c) => types[(r + c) % 3] as GemType));
    expect(findLineMatches(dead)).toHaveLength(0);
    expect(findValidSwaps(dead)).toHaveLength(0);
    const next = reshuffle(dead, createRng(9));
    expect(next).not.toBeNull();
    if (next) {
      expect(findLineMatches(next)).toHaveLength(0);
      expect(findValidSwaps(next).length).toBeGreaterThan(0);
    }
  });
});
