import { describe, expect, it } from 'vitest';
import { type GameState, type Goal, applySwap, at, findValidSwaps, goalsDone, isFixed, newLevel, reshuffleBoard, vined } from '../src/core/game';
import type { Cell } from '../src/core/grid';
import { unlockedAt } from '../src/core/journey';
import { type PlayDifficulty, levelFor, levelShape, staticallyCompletable } from '../src/core/levels';
import { createRng } from '../src/shared/rng';

const DIFFICULTIES: readonly PlayDifficulty[] = ['gentle', 'medium', 'bigger'];

/** Goal cells a swap should aim at: frosted cells, cells beside puffs, bubbles and moonstones, cells under seeds, gems of the gather type. */
function wants(state: GameState): Set<string> {
  const out = new Set<string>();
  const k = (r: number, c: number): string => `${r},${c}`;
  const goals = state.goals ?? [];
  const t = state.terrain;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const p = at(state.board, r, c);
      if (t && (t.frost[r]?.[c] ?? 0) > 0) out.add(k(r, c));
      if (p?.item === 'puff' || p?.item === 'bubble' || p?.item === 'moonstone') for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) out.add(k(r + (dr as number), c + (dc as number)));
      if (p?.item === 'seed') for (let q = r + 1; q < state.rows; q++) out.add(k(q, c));
      for (const g of goals) if (g.kind === 'gather' && p?.type === g.type && !p.item) out.add(k(r, c));
    }
  }
  return out;
}

/**
 * A simple bot (DESIGN.md 4.5): prefers the strongest swap that touches a goal
 * cell, then any strong swap, then any swap; ties go to the lowest row (bigger
 * falls). Reshuffles are the core's own.
 */
/** Goal progress a state has made: layers thawed, bubbles popped, seeds out (and seeds lower down count a little), gems gathered. */
function score(state: GameState): number {
  let n = 0;
  for (const g of state.goals ?? []) n += g.done * 10;
  for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) if (at(state.board, r, c)?.item === 'seed') n += r;
  return n;
}

/**
 * A simple bot (DESIGN.md 4.5): the strongest swaps that touch a goal cell are
 * tried out, and the one that makes the most goal progress is played; with no
 * progress available, the strongest swap nearest the goals.
 */
function botMove(state: GameState): [Cell, Cell] | null {
  const swaps = findValidSwaps(state);
  if (swaps.length === 0) return null;
  const want = wants(state);
  const near = (c: Cell): number => {
    let n = 0;
    for (const [dr, dc] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) if (want.has(`${c.row + (dr as number)},${c.col + (dc as number)}`)) n++;
    return n;
  };
  swaps.sort((x, y) => near(y.a) + near(y.b) + y.strength * 0.5 - (near(x.a) + near(x.b) + x.strength * 0.5));
  const base = score(state);
  let best = swaps[0]!;
  let bestGain = -1;
  for (const sw of swaps.slice(0, 6)) {
    const gain = score(applySwap(state, sw.a, sw.b).state) - base;
    if (gain > bestGain) {
      bestGain = gain;
      best = sw;
    }
  }
  return [best.a, best.b];
}

function play(state: GameState, maxMoves: number): { state: GameState; moves: number } {
  let s = state;
  for (let m = 0; m < maxMoves; m++) {
    if (goalsDone(s.goals)) return { state: s, moves: m };
    const mv = botMove(s);
    if (!mv) throw new Error('no move');
    const r = applySwap(s, mv[0], mv[1]);
    s = r.state;
    for (let row = 0; row < s.rows; row++) for (let col = 0; col < s.cols; col++) {
      const open = s.terrain?.open[row]?.[col] ?? true;
      if (open) expect(at(s.board, row, col), `cell ${row},${col} empty after a move`).not.toBeNull();
      else expect(at(s.board, row, col)).toBeNull();
    }
  }
  return { state: s, moves: maxMoves };
}

describe('level generator', () => {
  it('walks the ten shapes through an area', () => {
    expect(levelShape(1)).toBe('gather');
    expect(levelShape(10)).toBe('big');
    expect(levelShape(11)).toBe('gather');
  });

  it('every level has goals with totals, passes the static check and deals a board with a move', () => {
    for (const d of DIFFICULTIES) {
      for (let level = 1; level <= 70; level++) {
        const spec = levelFor(level, d, 7);
        expect(spec.goals.length).toBeGreaterThan(0);
        for (const g of spec.goals) expect(g.total).toBeGreaterThan(0);
        expect(staticallyCompletable(spec)).toBe(true);
        const state = newLevel(spec, 7, unlockedAt(level));
        expect(findValidSwaps(state).length).toBeGreaterThan(0);
        for (const it of spec.items) expect(at(state.board, it.cell.row, it.cell.col)).toEqual(it.piece);
      }
    }
  });

  it('the same lantern, setting and seed always give the same level', () => {
    expect(levelFor(23, 'medium', 5)).toEqual(levelFor(23, 'medium', 5));
    expect(JSON.stringify(levelFor(23, 'medium', 5))).not.toBe(JSON.stringify(levelFor(23, 'medium', 6)));
  });

  it('the dials rise within an area and reset at the next', () => {
    const count = (level: number): number => {
      const spec = levelFor(level, 'medium', 3);
      return spec.goals.reduce((n, g) => n + g.total, 0) + spec.items.length;
    };
    expect(count(10)).toBeGreaterThan(count(1));
    expect(count(11)).toBeLessThan(count(10));
  });
});

describe('the solver bot completes every level', () => {
  const MAX = 160;
  for (const d of DIFFICULTIES) {
    it(`at ${d}, lanterns 1 to 70, two seeds each`, () => {
      const worst: Array<{ level: number; moves: number }> = [];
      for (let level = 1; level <= 70; level++) {
        for (const seed of [11, 12]) {
          const spec = levelFor(level, d, seed);
          const { state, moves } = play(newLevel(spec, seed, unlockedAt(level)), MAX);
          expect(goalsDone(state.goals), `level ${level} seed ${seed} at ${d}: ${JSON.stringify(state.goals)} after ${moves} moves`).toBe(true);
          worst.push({ level, moves });
        }
      }
      worst.sort((a, b) => b.moves - a.moves);
      // Nothing takes anywhere near the bound: the ramp stays gentle.
      expect(worst[0]!.moves).toBeLessThan(MAX);
    }, 60_000); // 140 full games per difficulty: a few seconds alone, longer when the whole suite shares the CPU
  }
});

describe('items and terrain in play', () => {
  it('fixed pieces never move and vined gems never swap, and a reshuffle keeps them in place', () => {
    const spec = levelFor(8, 'bigger', 4); // moonstone-guarded bubbles
    let s = newLevel(spec, 4, unlockedAt(8));
    const fixedBefore = spec.items.map((it) => ({ ...it.cell, piece: at(s.board, it.cell.row, it.cell.col) }));
    for (let i = 0; i < 20; i++) {
      const mv = botMove(s);
      if (!mv) break;
      s = applySwap(s, mv[0], mv[1]).state;
    }
    for (const f of fixedBefore) {
      const now = at(s.board, f.row, f.col);
      // A bubble or moonstone is either still there or has been cleared (then a gem fell in); it never moved elsewhere.
      if (now && isFixed(now)) expect(now).toEqual(f.piece);
    }
    const vine = levelFor(7, 'bigger', 4);
    const v = newLevel(vine, 4, unlockedAt(7));
    for (const sw of findValidSwaps(v)) {
      expect(vined(v, sw.a)).toBe(false);
      expect(vined(v, sw.b)).toBe(false);
    }
    const shuffled = reshuffleBoard(v, createRng(1));
    expect(shuffled).not.toBeNull();
    for (let r = 0; r < v.rows; r++) for (let c = 0; c < v.cols; c++) if (vined(v, { row: r, col: c })) expect(shuffled![r]![c]).toEqual(at(v.board, r, c));
  });

  it('seeds come out at the bottom and count, and frost thins one layer per clear', () => {
    const spec = levelFor(3, 'medium', 9); // seeds
    let s = newLevel(spec, 9, unlockedAt(3));
    const seeds = (st: GameState): number => st.board.flat().filter((p) => p?.item === 'seed').length;
    const start = seeds(s);
    expect(start).toBeGreaterThan(0);
    const r = play(s, 160);
    s = r.state;
    const goal = s.goals!.find((g): g is Extract<Goal, { kind: 'seeds' }> => g.kind === 'seeds')!;
    expect(goal.done).toBe(goal.total);
    expect(seeds(s)).toBe(0);
    const frostSpec = levelFor(2, 'medium', 9);
    const f = newLevel(frostSpec, 9, unlockedAt(2));
    const layers = (st: GameState): number => st.terrain!.frost.flat().reduce((a, b) => a + b, 0);
    const before = layers(f);
    const mv = botMove(f)!;
    const after = applySwap(f, mv[0], mv[1]);
    const thinned = after.steps.filter((st) => st.kind === 'frost').reduce((n, st) => n + (st.kind === 'frost' ? st.cells.length : 0), 0);
    expect(before - layers(after.state)).toBe(thinned);
    expect(after.state.goals!.find((g) => g.kind === 'uncover')!.done).toBe(thinned);
  });
});
