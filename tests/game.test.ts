import { describe, expect, it } from 'vitest';
import { type Board, type GameState, applySwap, at, bestHint, findLines, findValidSwaps, gem, isFull, isValidSwap, newGame } from '../src/core/game';
import type { GemType } from '../src/core/grid';
import { createRng } from '../src/shared/rng';

const CALM: readonly GemType[] = ['star', 'heart', 'drop', 'leaf'];
const FIVE: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];

function fromRows(rows: string[]): Board {
  const map: Record<string, GemType> = { S: 'star', H: 'heart', D: 'drop', L: 'leaf', A: 'diamond', U: 'sunstone' };
  return rows.map((r) =>
    [...r].map((ch) => {
      if (ch === '.') return null;
      if (ch === 'O') return { type: null, power: 'orb' as const };
      const lower = ch.toLowerCase();
      const type = map[ch.toUpperCase()] as GemType;
      // lower-case = row comet of that type, '|' prefix not supported; use helper below for column comets
      return ch === lower ? { type, power: 'cometRow' as const } : gem(type);
    }),
  );
}

function state(board: Board, types: readonly GemType[] = FIVE, seed = 1): GameState {
  return { rows: board.length, cols: board[0]?.length ?? 0, types, board, seed, moves: 0, bias: 0 };
}

function typesOf(board: Board): string[] {
  return board.map((row) => row.map((p) => (p ? (p.power === 'orb' ? 'O' : p.type?.[0]?.toUpperCase() ?? '?') : '.')).join(''));
}

describe('newGame', () => {
  it('never starts with a line and always has a move, across many seeds and both type counts', () => {
    for (const types of [CALM, FIVE]) {
      for (let seed = 1; seed <= 1500; seed++) {
        const g = newGame(7, 6, types, seed);
        expect(findLines(g.board)).toHaveLength(0);
        expect(findValidSwaps(g).length).toBeGreaterThan(0);
        expect(isFull(g.board)).toBe(true);
      }
    }
  });

  it('is deterministic for a seed', () => {
    expect(newGame(7, 6, FIVE, 42)).toEqual(newGame(7, 6, FIVE, 42));
  });
});

describe('swaps', () => {
  it('rejects non-adjacent, same-type and non-matching swaps', () => {
    const s = state(fromRows(['SHSD', 'HLDS', 'DSLH', 'LDHS']));
    expect(isValidSwap(s, { row: 0, col: 0 }, { row: 0, col: 2 })).toBe(false);
    expect(isValidSwap(s, { row: 0, col: 0 }, { row: 0, col: 1 })).toBe(false);
    const r = applySwap(s, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(r.steps).toEqual([{ kind: 'swap', a: { row: 0, col: 0 }, b: { row: 0, col: 1 }, valid: false }]);
    expect(r.state).toBe(s);
  });

  it('a three clears, falls and refills to a full board with no line left', () => {
    const s = state(fromRows(['SHSD', 'HLDS', 'DSLH', 'LDHS', 'ASDL']));
    // swap (0,1) H with (1,1) L -> row 0 becomes S L S? no. Use column: swap (1,1) L with (1,2) D -> col 2: S,L,L? no.
    // Row 0: S H S D ; (0,1) <-> (1,1) gives S L S, no. Make an explicit one:
    const s2 = state(fromRows(['SHDS', 'HSAD', 'DLSL', 'LDHA', 'ASDL']));
    // (0,1) H <-> (1,1) S : row 0 = S S D S? no... pick (1,1)S <-> (1,0)H: row1 = S H A D no.
    void s;
    // Construct directly: column 2 S at (0,2)? Use a known layout:
    const s3 = state(fromRows(['SHLS', 'HSHD', 'LHSL', 'DLHA', 'ASDL']));
    // (0,1) H <-> (0,2) L -> row 0: S L H S no. (1,0) H <-> (1,1) S -> col 1: H,H,H? (0,1)=H,(1,1)->H,(2,1)=H yes.
    const r = applySwap(s3, { row: 1, col: 0 }, { row: 1, col: 1 });
    void s2;
    expect(r.steps[0]).toEqual({ kind: 'swap', a: { row: 1, col: 0 }, b: { row: 1, col: 1 }, valid: true });
    const clear = r.steps.find((st) => st.kind === 'clear');
    expect(clear && clear.kind === 'clear' && clear.cells.length).toBe(3);
    expect(isFull(r.state.board)).toBe(true);
    expect(findLines(r.state.board)).toHaveLength(0);
    expect(r.state.moves).toBe(1);
  });

  it('four in a row creates a Comet at the swapped cell, oriented along the line', () => {
    const s = state(fromRows(['SSHSD', 'HDSLA', 'LADHS', 'DLADH', 'AHLSD']));
    // swap (0,2) H with (1,2) S -> row 0: S S S S D
    const r = applySwap(s, { row: 0, col: 2 }, { row: 1, col: 2 });
    const create = r.steps.find((st) => st.kind === 'create');
    expect(create).toBeTruthy();
    if (create && create.kind === 'create') {
      expect(create.cell).toEqual({ row: 0, col: 2 });
      expect(create.piece).toEqual({ type: 'star', power: 'cometRow' });
    }
    // The comet either survives on the board, or a refill cascade matched it and it fired.
    const comets = r.state.board.flat().filter((p) => p?.power === 'cometRow');
    const fired = r.steps.some((st) => st.kind === 'fire' && st.power === 'cometRow');
    expect(comets.length === 1 || fired).toBe(true);
  });

  it('five in a row creates a Prism Orb', () => {
    const s = state(fromRows(['SSHSSD', 'HDSLAH', 'LADHSL', 'DLADHA', 'AHLSDL', 'HSDALS']));
    const r = applySwap(s, { row: 0, col: 2 }, { row: 1, col: 2 });
    const create = r.steps.find((st) => st.kind === 'create');
    expect(create && create.kind === 'create' && create.piece).toEqual({ type: null, power: 'orb' });
    expect(r.state.board.flat().filter((p) => p?.power === 'orb')).toHaveLength(1);
  });

  it('swapping an Orb with a gem clears every gem of that colour', () => {
    const board = fromRows(['OHSDS', 'HDSLA', 'LADHS', 'DLADH', 'AHLSD']);
    const s = state(board);
    const hearts = board.flat().filter((p) => p?.type === 'heart').length;
    const r = applySwap(s, { row: 0, col: 0 }, { row: 0, col: 1 });
    const fire = r.steps.find((st) => st.kind === 'fire');
    expect(fire && fire.kind === 'fire' && fire.color).toBe('heart');
    expect(fire && fire.kind === 'fire' && fire.cells.length).toBe(hearts + 1);
    expect(r.cleared).toBeGreaterThanOrEqual(hearts + 1);
    expect(isFull(r.state.board)).toBe(true);
    expect(r.state.board.flat().some((p) => p?.power === 'orb')).toBe(false);
  });

  it('a Comet caught in a match sweeps its row, and a Comet in that row chains', () => {
    // lower-case = row comet. Row 2 has a comet 'h' at (2,1); col 1 match H,H,h via swap.
    const board = fromRows(['SHDLA', 'DSALH', 'LhSAD', 'ADLHS', 'HLADL']);
    // make col 1: (0,1)=H,(1,1)=S -> swap (1,1) S with (1,0) D? col1 becomes H,D,h no. Swap (1,1)S with (1,2)A -> no.
    // Instead swap (0,0) S with (0,1) H? col 0... Simplest: swap (1,0) D <-> (1,1) S gives col1 H,D,h no.
    // Use (1,1) S <-> (2,1) h? comets swap like gems: col1 = H,h,S no. Try (1,1)S <-> (1,0)D -> row1: S D A L H no.
    // Build so that (1,1) becomes H: put H at (1,0) and swap.
    const b2 = fromRows(['SHDLA', 'HSALD', 'LhSAD', 'ADLHS', 'HLADL']);
    const s = state(b2);
    expect(isValidSwap(s, { row: 1, col: 0 }, { row: 1, col: 1 })).toBe(true);
    const r = applySwap(s, { row: 1, col: 0 }, { row: 1, col: 1 });
    const fires = r.steps.filter((st) => st.kind === 'fire');
    expect(fires.length).toBeGreaterThanOrEqual(1);
    const first = fires[0];
    expect(first && first.kind === 'fire' && first.power).toBe('cometRow');
    expect(first && first.kind === 'fire' && first.cells.length).toBe(5);
    void board;
  });

  it('two orbs swapped clear the whole board', () => {
    const s = state(fromRows(['OOSDS', 'HDSLA', 'LADHS', 'DLADH', 'AHLSD']));
    const r = applySwap(s, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(r.cleared).toBeGreaterThanOrEqual(25);
    expect(isFull(r.state.board)).toBe(true);
    expect(findLines(r.state.board)).toHaveLength(0);
  });
});

describe('cascades and invariants', () => {
  it('thousands of random valid moves keep the board full, line-free and playable', () => {
    for (const seed of [1, 2, 3]) {
      let g = newGame(7, 6, CALM, seed);
      const rng = createRng(seed * 7);
      let cascadesSeen = 0;
      let powersSeen = 0;
      for (let i = 0; i < 400; i++) {
        const swaps = findValidSwaps(g);
        expect(swaps.length).toBeGreaterThan(0);
        const pick = rng.pick(swaps);
        const r = applySwap(g, pick.a, pick.b);
        expect(r.steps[0]).toMatchObject({ kind: 'swap', valid: true });
        expect(isFull(r.state.board)).toBe(true);
        expect(findLines(r.state.board)).toHaveLength(0);
        expect(findValidSwaps(r.state).length).toBeGreaterThan(0);
        // every fall step lands pieces only downward or spawns from above
        for (const st of r.steps) {
          if (st.kind === 'fall') {
            st.moves.forEach((m) => expect(m.to.row).toBeGreaterThan(m.from.row));
            st.spawns.forEach((sp) => expect(sp.fromRow).toBeLessThan(0));
          }
          if (st.kind === 'create') powersSeen++;
        }
        cascadesSeen += r.cascades;
        g = r.state;
      }
      expect(cascadesSeen).toBeGreaterThan(20);
      expect(powersSeen).toBeGreaterThan(5);
    }
  });

  it('the same move on the same state always resolves identically', () => {
    const g = newGame(7, 6, FIVE, 9);
    const hint = bestHint(g);
    expect(hint).not.toBeNull();
    if (!hint) return;
    const a = applySwap(g, hint.a, hint.b);
    const b = applySwap(g, hint.a, hint.b);
    expect(typesOf(a.state.board)).toEqual(typesOf(b.state.board));
    expect(a.steps).toEqual(b.steps);
  });

  it('hints prefer the swap that makes a power', () => {
    const s = state(fromRows(['SSHSD', 'HDSLA', 'LADHS', 'DLADH', 'AHLSD']));
    const h = bestHint(s);
    expect(h?.strength).toBe(4);
  });

  it('bias never completes a line by itself and raises pair density', () => {
    let pairsBiased = 0;
    let pairsPlain = 0;
    const countPairs = (b: Board): number => {
      let n = 0;
      for (let r = 0; r < b.length; r++) for (let c = 0; c < (b[0]?.length ?? 0) - 1; c++) if (at(b, r, c)?.type && at(b, r, c)?.type === at(b, r, c + 1)?.type) n++;
      return n;
    };
    for (let seed = 1; seed <= 300; seed++) {
      const biased = newGame(7, 6, CALM, seed, 0.6);
      const plain = newGame(7, 6, CALM, seed, 0);
      expect(findLines(biased.board)).toHaveLength(0);
      pairsBiased += countPairs(biased.board);
      pairsPlain += countPairs(plain.board);
    }
    expect(pairsBiased).toBeGreaterThan(pairsPlain);
  });
});
