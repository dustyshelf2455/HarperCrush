/**
 * The Stage 3 power rules (DESIGN.md 3.4): which shape makes which power and
 * when, what every power clears, every two-power combination, the gifts and
 * the finishing light, and the invariants over thousands of random moves.
 */
import { describe, expect, it } from 'vitest';
import {
  type Board,
  type FireStep,
  type GameState,
  type Piece,
  type PowerFamily,
  type PowerKind,
  type Step,
  BASE_UNLOCKED,
  POWER_FAMILIES,
  applySwap,
  at,
  bestHint,
  cascadeScore,
  deserialize,
  findGroups,
  findLines,
  findPowers,
  findSquares,
  findValidSwaps,
  firePowerAt,
  gem,
  hasAnyMatch,
  isFull,
  isValidSwap,
  newGame,
  placeGift,
  powerFor,
  reshuffleBoard,
  serialize,
} from '../src/core/game';
import type { Cell, GemType } from '../src/core/grid';
import { ALL_COMBOS, type Gift, MILESTONES, unlockedAt } from '../src/core/journey';
import { createRng } from '../src/shared/rng';

// ------------------------------------------------------------------- helpers

const FOUR: readonly GemType[] = ['star', 'heart', 'drop', 'leaf'];
const FIVE: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];
const SIX: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond', 'sunstone'];
const ALL: readonly PowerFamily[] = POWER_FAMILIES;
const SPRITE_ONLY: readonly PowerFamily[] = ['comet', 'orb', 'sprite'];

const cell = (row: number, col: number): Cell => ({ row, col });
const key = (c: Cell): string => `${c.row},${c.col}`;
const sorted = (cells: readonly Cell[]): string[] => cells.map(key).sort();
const expectCells = (actual: readonly Cell[], expected: readonly Cell[]): void => expect(sorted(actual)).toEqual(sorted(expected));

/**
 * The background every constructed board sits on: type (2r + c) mod 4, so no
 * two neighbours share a type. It has no line, no square, no pair, and no
 * gravity shift can ever form a line of background gems (a shift changes a
 * type by an even amount, a horizontal line would need an odd one).
 * Shapes are painted on it in diamond, which the background never uses.
 */
function background(rows: number, cols: number): Board {
  return Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => gem(FOUR[(2 * r + c) % 4] as GemType)));
}

/** '.' background; A a plain diamond; S H D L plain gems; - | B P X M diamond powers; O orb; W aurora. */
const LEGEND: Record<string, () => Piece> = {
  A: () => gem('diamond'),
  S: () => gem('star'),
  H: () => gem('heart'),
  D: () => gem('drop'),
  L: () => gem('leaf'),
  '-': () => ({ type: 'diamond', power: 'cometRow' }),
  '|': () => ({ type: 'diamond', power: 'cometCol' }),
  B: () => ({ type: 'diamond', power: 'bloom' }),
  P: () => ({ type: 'diamond', power: 'sprite' }),
  X: () => ({ type: 'diamond', power: 'starburst' }),
  M: () => ({ type: 'diamond', power: 'moonrise' }),
  O: () => ({ type: null, power: 'orb' }),
  W: () => ({ type: null, power: 'aurora' }),
};

function build(rows: string[]): Board {
  const board = background(rows.length, rows[0]?.length ?? 0);
  rows.forEach((text, r) =>
    [...text].forEach((ch, c) => {
      if (ch === '.') return;
      const make = LEGEND[ch];
      if (!make) throw new Error(`unknown legend ${ch}`);
      (board[r] as (Piece | null)[])[c] = make();
    }),
  );
  return board;
}

function state(board: Board, unlocked: readonly PowerFamily[] = ALL, types: readonly GemType[] = FIVE, seed = 1): GameState {
  return { rows: board.length, cols: board[0]?.length ?? 0, types, board, seed, moves: 0, bias: 0, unlocked };
}

const fires = (steps: readonly Step[]): FireStep[] => steps.filter((s): s is FireStep => s.kind === 'fire');
const firstOf = <K extends Step['kind']>(steps: readonly Step[], kind: K): Extract<Step, { kind: K }> | undefined =>
  steps.find((s): s is Extract<Step, { kind: K }> => s.kind === kind);
const indexOf = (steps: readonly Step[], kind: Step['kind']): number => steps.findIndex((s) => s.kind === kind);

/** The round-0 clear: what the first clear step removes. */
const firstClear = (steps: readonly Step[]): Cell[] => firstOf(steps, 'clear')?.cells ?? [];

// Independent oracles for the clear patterns (DESIGN.md 3.4), clipped to the board.
const rowsOf = (b: Board): number => b.length;
const colsOf = (b: Board): number => b[0]?.length ?? 0;
const inside = (b: Board, r: number, c: number): boolean => r >= 0 && r < rowsOf(b) && c >= 0 && c < colsOf(b);
const allCells = (b: Board): Cell[] => Array.from({ length: rowsOf(b) * colsOf(b) }, (_, i) => cell(Math.floor(i / colsOf(b)), i % colsOf(b)));
const rowCells = (b: Board, r: number): Cell[] => allCells(b).filter((c) => c.row === r);
const colCells = (b: Board, c0: number): Cell[] => allCells(b).filter((c) => c.col === c0);
const bandCells = (b: Board, c0: number, half: number): Cell[] => allCells(b).filter((c) => Math.abs(c.col - c0) <= half);
const boxCells = (b: Board, o: Cell, radius: number, withCentre = true): Cell[] =>
  allCells(b).filter((c) => Math.abs(c.row - o.row) <= radius && Math.abs(c.col - o.col) <= radius && (withCentre || !(c.row === o.row && c.col === o.col)));
const diamondCells = (b: Board, o: Cell, radius: number): Cell[] => allCells(b).filter((c) => Math.abs(c.row - o.row) + Math.abs(c.col - o.col) <= radius);
const diagCells = (b: Board, o: Cell): Cell[] => allCells(b).filter((c) => Math.abs(c.row - o.row) === Math.abs(c.col - o.col));
const neighbours = (b: Board, o: Cell): Cell[] => allCells(b).filter((c) => Math.abs(c.row - o.row) + Math.abs(c.col - o.col) === 1);
const ofColours = (b: Board, colours: readonly (GemType | null)[]): Cell[] => allCells(b).filter((c) => colours.includes(at(b, c.row, c.col)?.type ?? null));
const giantSecond = (b: Board, o: Cell): Cell[] => [
  ...boxCells(b, o, 2),
  ...[cell(o.row - 3, o.col), cell(o.row + 3, o.col), cell(o.row, o.col - 3), cell(o.row, o.col + 3)].filter((c) => inside(b, c.row, c.col)),
];
const union = (...lists: Cell[][]): Cell[] => {
  const seen = new Map<string, Cell>();
  lists.flat().forEach((c) => seen.set(key(c), c));
  return [...seen.values()];
};

/** Colours on the board, most common first, ties in type order (the core's rule). */
function ranking(b: Board, types: readonly GemType[], exclude: readonly GemType[] = []): GemType[] {
  const counts = new Map<GemType, number>();
  for (const row of b) for (const p of row) if (p?.type && !exclude.includes(p.type)) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || types.indexOf(x[0]) - types.indexOf(y[0])).map((e) => e[0]);
}

/** Replays a step list onto a board; the final board must match the core's. Handles transforms and a bud that survives its first opening. */
function replay(board: Board, steps: readonly Step[]): Board {
  const b = board.map((r) => r.slice());
  const put = (c: Cell, p: Piece | null): void => {
    const row = b[c.row];
    if (row) row[c.col] = p;
  };
  const get = (c: Cell): Piece | null => b[c.row]?.[c.col] ?? null;
  for (const st of steps) {
    switch (st.kind) {
      case 'swap': {
        if (!st.valid) break;
        const pa = get(st.a);
        put(st.a, get(st.b));
        put(st.b, pa);
        break;
      }
      case 'fire':
        // A fire step only announces; the clear step removes. A bloom's first opening leaves the bud in place.
        for (const c of st.cells) expect(get(c)).not.toBeNull();
        break;
      case 'transform':
        st.changes.forEach((ch) => put(ch.cell, ch.piece));
        break;
      case 'clear':
        st.cells.forEach((c) => put(c, null));
        break;
      case 'create':
        expect(get(st.cell)).toBeNull();
        put(st.cell, st.piece);
        break;
      case 'fall':
        for (const m of st.moves) {
          expect(m.to.row).toBeGreaterThan(m.from.row);
          expect(m.to.col).toBe(m.from.col);
          expect(get(m.from)).not.toBeNull();
          expect(get(m.to)).toBeNull();
          put(m.to, get(m.from));
          put(m.from, null);
        }
        for (const s of st.spawns) {
          expect(s.fromRow).toBeLessThan(0);
          expect(get(s.to)).toBeNull();
          put(s.to, s.piece);
        }
        break;
      case 'reshuffle':
        return st.board.map((r) => r.slice());
    }
  }
  return b;
}

/** The invariants every settled board keeps (DESIGN.md 3.3, 3.4, 4.5). */
function expectSettled(s: GameState): void {
  expect(isFull(s.board)).toBe(true);
  expect(findLines(s.board)).toHaveLength(0);
  if (s.unlocked.includes('sprite')) expect(findSquares(s.board)).toHaveLength(0);
  expect(findValidSwaps(s).length).toBeGreaterThan(0);
}

/** Step order the presentation relies on: swap, (fire | transform)*, clear, create*, fall, next round ... */
function expectStepOrder(steps: readonly Step[], withSwap: boolean): void {
  let i = 0;
  if (withSwap) {
    expect(steps[0]?.kind).toBe('swap');
    i = 1;
  }
  while (i < steps.length) {
    const k = steps[i]?.kind;
    if (k === 'reshuffle') {
      expect(i).toBe(steps.length - 1);
      break;
    }
    while (steps[i]?.kind === 'fire' || steps[i]?.kind === 'transform') i++;
    expect(steps[i]?.kind).toBe('clear');
    i++;
    while (steps[i]?.kind === 'create') i++;
    expect(steps[i]?.kind).toBe('fall');
    i++;
  }
}

// ------------------------------------------------------------ shape detection

describe('shapes and the power each makes', () => {
  const groupsOf = (rows: string[], unlocked: readonly PowerFamily[]): Array<{ power: PowerKind | null; size: number }> =>
    findGroups(build(rows), unlocked).map((g) => ({ power: powerFor(g, unlocked), size: g.cells.length }));

  it('a background board has no line, no square and no group', () => {
    const b = background(9, 6);
    expect(findLines(b)).toHaveLength(0);
    expect(findSquares(b)).toHaveLength(0);
    expect(findGroups(b, ALL)).toHaveLength(0);
    expect(hasAnyMatch(b, ALL)).toBe(false);
  });

  it('three is plain, four a comet along the line, five an orb', () => {
    expect(groupsOf(['AAA...', '......', '......'], BASE_UNLOCKED)).toEqual([{ power: null, size: 3 }]);
    expect(groupsOf(['AAAA..', '......', '......'], BASE_UNLOCKED)).toEqual([{ power: 'cometRow', size: 4 }]);
    expect(groupsOf(['A.....', 'A.....', 'A.....', 'A.....'], BASE_UNLOCKED)).toEqual([{ power: 'cometCol', size: 4 }]);
    expect(groupsOf(['AAAAA.', '......', '......'], BASE_UNLOCKED)).toEqual([{ power: 'orb', size: 5 }]);
  });

  it('six in a line makes an orb until Aurora unlocks, then an aurora', () => {
    expect(groupsOf(['AAAAAA', '......', '......'], BASE_UNLOCKED)).toEqual([{ power: 'orb', size: 6 }]);
    expect(groupsOf(['AAAAAA', '......', '......'], ALL)).toEqual([{ power: 'aurora', size: 6 }]);
    expect(groupsOf(['AAAAAAA', '.......', '.......'], ALL)).toEqual([{ power: 'aurora', size: 7 }]);
  });

  it('an L and a T are one group: plain before Bloom unlocks, a Bloom after', () => {
    const L = ['AAA...', 'A.....', 'A.....'];
    const T = ['AAA...', '.A....', '.A....'];
    expect(groupsOf(L, BASE_UNLOCKED)).toEqual([{ power: null, size: 5 }]);
    expect(groupsOf(T, BASE_UNLOCKED)).toEqual([{ power: null, size: 5 }]);
    expect(groupsOf(L, [...BASE_UNLOCKED, 'bloom'])).toEqual([{ power: 'bloom', size: 5 }]);
    expect(groupsOf(T, [...BASE_UNLOCKED, 'bloom'])).toEqual([{ power: 'bloom', size: 5 }]);
    // A T is not a plus: the shared cell is an end of the vertical line.
    expect(groupsOf(T, ALL)).toEqual([{ power: 'bloom', size: 5 }]);
  });

  it('an L with a four in it makes a comet while Bloom is locked, a bloom once unlocked', () => {
    const L4 = ['AAAA..', 'A.....', 'A.....'];
    expect(groupsOf(L4, BASE_UNLOCKED)).toEqual([{ power: 'cometRow', size: 6 }]);
    expect(groupsOf(L4, [...BASE_UNLOCKED, 'bloom'])).toEqual([{ power: 'bloom', size: 6 }]);
  });

  it('a plus makes a bloom until Starburst unlocks, then a starburst; nothing before Bloom', () => {
    const plus = ['.A....', 'AAA...', '.A....'];
    expect(groupsOf(plus, BASE_UNLOCKED)).toEqual([{ power: null, size: 5 }]);
    expect(groupsOf(plus, [...BASE_UNLOCKED, 'bloom'])).toEqual([{ power: 'bloom', size: 5 }]);
    expect(groupsOf(plus, ALL)).toEqual([{ power: 'starburst', size: 5 }]);
    // A five through the plus still makes an orb: longer lines win.
    expect(groupsOf(['..A...', 'AAAAA.', '..A...'], ALL)).toEqual([{ power: 'orb', size: 7 }]);
  });

  it('a 2 by 2 is not a match until the Sprite unlocks, then one sprite group', () => {
    const square = ['AA....', 'AA....', '......'];
    expect(groupsOf(square, BASE_UNLOCKED)).toEqual([]);
    expect(hasAnyMatch(build(square), BASE_UNLOCKED)).toBe(false);
    expect(groupsOf(square, SPRITE_ONLY)).toEqual([{ power: 'sprite', size: 4 }]);
    expect(hasAnyMatch(build(square), SPRITE_ONLY)).toBe(true);
    expect(findSquares(build(square))).toHaveLength(1);
  });

  it('a square touching a line of its type is absorbed into that group; one of another type stays its own sprite', () => {
    // Row 0 line of three with a square hanging below its last two cells.
    const hang = ['AAA...', '.AA...', '......'];
    expect(groupsOf(hang, ALL)).toEqual([{ power: null, size: 5 }]);
    expect(groupsOf(hang, BASE_UNLOCKED)).toEqual([{ power: null, size: 3 }]);
    const apart = ['AAA...', '......', '....SS', '....SS'];
    const groups = findGroups(build(apart), ALL);
    expect(groups.map((g) => [g.type, powerFor(g, ALL)])).toEqual(expect.arrayContaining([['diamond', null], ['star', 'sprite']]));
    expect(groups).toHaveLength(2);
  });

  it('a 2 by 3 clears as two lines of three until Moonrise unlocks, then one Moonrise group', () => {
    const block = ['AAA...', 'AAA...', '......'];
    const tall = ['AA....', 'AA....', 'AA....'];
    expect(groupsOf(block, BASE_UNLOCKED)).toEqual([{ power: null, size: 3 }, { power: null, size: 3 }]);
    expect(groupsOf(tall, BASE_UNLOCKED)).toEqual([{ power: null, size: 3 }, { power: null, size: 3 }]);
    expect(groupsOf(block, ALL)).toEqual([{ power: 'moonrise', size: 6 }]);
    expect(groupsOf(tall, ALL)).toEqual([{ power: 'moonrise', size: 6 }]);
    // With the Sprite but not Moonrise, the block's squares overlap its lines and are absorbed: still two plain lines.
    expect(groupsOf(block, SPRITE_ONLY)).toEqual([{ power: null, size: 3 }, { power: null, size: 3 }]);
  });

  it('a 2 by 4 makes a Moonrise (the block beats the comet) and a 2 by 5 an orb', () => {
    expect(groupsOf(['AAAA..', 'AAAA..', '......'], ALL)).toEqual([{ power: 'moonrise', size: 8 }]);
    expect(groupsOf(['AAAA..', 'AAAA..', '......'], BASE_UNLOCKED)).toEqual([{ power: 'cometRow', size: 4 }, { power: 'cometRow', size: 4 }]);
    expect(groupsOf(['AAAAA.', 'AAAAA.', '......'], ALL)).toEqual([{ power: 'orb', size: 10 }]);
  });

  it('two parallel lines with different spans are not a block', () => {
    expect(groupsOf(['AAA...', '.AAA..', '......'], ALL)).toEqual([{ power: null, size: 3 }, { power: null, size: 3 }]);
  });

  it('lines of different types never merge', () => {
    const rows = ['AAA...', 'SSS...', '......'];
    const groups = findGroups(build(rows), ALL);
    expect(groups.map((g) => g.cells.length)).toEqual([3, 3]);
  });
});

// --------------------------------------------------------- creation and anchor

describe('power creation', () => {
  it('a four made by a swap puts the comet on the swapped cell and no fire happens before the fall', () => {
    const board = build(['AA.A..', '..A...', '......', '......', '......', '......']);
    const r = applySwap(state(board, BASE_UNLOCKED), cell(0, 2), cell(1, 2));
    expect(firstOf(r.steps, 'create')).toEqual({ kind: 'create', cell: cell(0, 2), piece: { type: 'diamond', power: 'cometRow' } });
    expect(fires(r.steps.slice(0, indexOf(r.steps, 'fall')))).toHaveLength(0);
    expectStepOrder(r.steps, true);
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });

  it('an L made by a swap creates a bloom that is placed after the clear and does not fire', () => {
    const board = build(['A.....', '.AA...', 'A.....', 'A.....', '......', '......', '......', '......', '......']);
    const s = state(board, [...BASE_UNLOCKED, 'bloom']);
    expect(isValidSwap(s, cell(0, 0), cell(1, 0))).toBe(true);
    const r = applySwap(s, cell(0, 0), cell(1, 0));
    const create = firstOf(r.steps, 'create');
    expect(create).toEqual({ kind: 'create', cell: cell(1, 0), piece: { type: 'diamond', power: 'bloom' } });
    expect(indexOf(r.steps, 'create')).toBeGreaterThan(indexOf(r.steps, 'clear'));
    expect(fires(r.steps.slice(0, indexOf(r.steps, 'fall')))).toHaveLength(0);
    expect(replay(board, r.steps)).toEqual(r.state.board);
    // Same L with Bloom locked: a plain clear, nothing created.
    const plain = applySwap(state(build(['A.....', '.AA...', 'A.....', 'A.....', '......', '......', '......', '......', '......']), BASE_UNLOCKED), cell(0, 0), cell(1, 0));
    expect(firstOf(plain.steps, 'create')).toBeUndefined();
    expect(firstClear(plain.steps)).toHaveLength(5);
  });

  it('a square made by a swap is only a move once the Sprite is unlocked, and then makes a sprite', () => {
    const rows = ['A.....', '.A....', 'AA....', '......', '......', '......'];
    expect(isValidSwap(state(build(rows), BASE_UNLOCKED), cell(0, 0), cell(1, 0))).toBe(false);
    expect(isValidSwap(state(build(rows), SPRITE_ONLY), cell(0, 0), cell(1, 0))).toBe(true);
    const r = applySwap(state(build(rows), SPRITE_ONLY), cell(0, 0), cell(1, 0));
    expect(firstOf(r.steps, 'create')).toEqual({ kind: 'create', cell: cell(1, 0), piece: { type: 'diamond', power: 'sprite' } });
    expectCells(firstClear(r.steps), [cell(1, 0), cell(1, 1), cell(2, 0), cell(2, 1)]);
  });

  it('a 2 by 3 found on the board makes a Moonrise once unlocked, two plain lines before', () => {
    // A single swap can never complete a 2 by 3 on a line-free board (one of its lines would already be there), so blocks come from cascades;
    // here the finishing light on a comet in row 8 finds one already formed.
    const rows = ['......', '.AAA..', '.AAA..', '......', '......', '......', '......', '......', '-.....'];
    const after = firePowerAt(state(build(rows), ALL), cell(8, 0));
    expect(firstOf(after.steps, 'create')).toEqual({ kind: 'create', cell: cell(1, 2), piece: { type: 'diamond', power: 'moonrise' } });
    expect(firstOf(after.steps, 'clear')?.groups).toHaveLength(1);
    const before = firePowerAt(state(build(rows), BASE_UNLOCKED), cell(8, 0));
    expect(firstOf(before.steps, 'create')).toBeUndefined();
    expect(firstOf(before.steps, 'clear')?.groups).toHaveLength(2);
    expect(firstClear(before.steps)).toHaveLength(6 + 6);
  });

  it('a shape not made by the swap anchors its power at the crossing (T, plus) or the cell nearest its centroid', () => {
    // The finishing light sets off a comet in row 8; the T and the plus already on the board are found in the same round.
    const board = build(['......', '.AAA..', '..A...', '..A...', '......', '....A.', '...AAA', '....A.', '-.....']);
    const r = firePowerAt(state(board, ALL), cell(8, 0));
    const creates = r.steps.filter((s) => s.kind === 'create').slice(0, 2);
    expect(creates).toEqual(
      expect.arrayContaining([
        { kind: 'create', cell: cell(1, 2), piece: { type: 'diamond', power: 'bloom' } },
        { kind: 'create', cell: cell(6, 4), piece: { type: 'diamond', power: 'starburst' } },
      ]),
    );
    // A single five with no swap anchors at its middle.
    const five = firePowerAt(state(build(['......', '.AAAAA', '......', '......', '......', '......', '......', '......', '-.....']), ALL), cell(8, 0));
    expect(firstOf(five.steps, 'create')).toEqual({ kind: 'create', cell: cell(1, 3), piece: { type: null, power: 'orb' } });
  });

  it('a power already sitting at the anchor fires before the new one is placed', () => {
    const board = build(['AA.A..', '..|...', '......', '......', '......', '......']);
    const r = applySwap(state(board, ALL), cell(0, 2), cell(1, 2));
    const fire = fires(r.steps)[0];
    expect(fire?.power).toBe('cometCol');
    expectCells(fire?.cells ?? [], colCells(board, 2));
    expect(indexOf(r.steps, 'fire')).toBeLessThan(indexOf(r.steps, 'create'));
    expect(firstOf(r.steps, 'create')).toEqual({ kind: 'create', cell: cell(0, 2), piece: { type: 'diamond', power: 'cometRow' } });
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });
});

// ------------------------------------------------------------ swaps and hints

describe('valid swaps and hint strength', () => {
  const strengthOf = (s: GameState, a: Cell, b: Cell): number | undefined =>
    findValidSwaps(s).find((o) => (o.a.row === a.row && o.a.col === a.col && o.b.row === b.row && o.b.col === b.col) || (o.a.row === b.row && o.a.col === b.col && o.b.row === a.row && o.b.col === a.col))?.strength;

  it('colourless powers swap with anything and two powers always swap; same types never do', () => {
    const s = state(build(['O.....', '.W....', '..B...', '..-...', '......', '......']), ALL);
    expect(isValidSwap(s, cell(0, 0), cell(0, 1))).toBe(true);
    expect(isValidSwap(s, cell(1, 1), cell(1, 2))).toBe(true);
    expect(isValidSwap(s, cell(2, 2), cell(3, 2))).toBe(true);
    expect(isValidSwap(s, cell(2, 2), cell(2, 3))).toBe(false);
    const sameType = state(build(['AB....', '......', '......']), ALL);
    expect(isValidSwap(sameType, cell(0, 0), cell(0, 1))).toBe(false);
  });

  it('ranks swaps: combine two powers (7) > set off an existing power (6) > make an orb or aurora (5) > any other power (4) > plain (3)', () => {
    expect(strengthOf(state(build(['AA.A..', '..A...', '......', '......'])), cell(0, 2), cell(1, 2))).toBe(4);
    expect(strengthOf(state(build(['AA.AA.', '..A...', '......', '......'])), cell(0, 2), cell(1, 2))).toBe(5);
    expect(strengthOf(state(build(['AA.AAA', '..A...', '......', '......']), ALL), cell(0, 2), cell(1, 2))).toBe(5);
    expect(strengthOf(state(build(['AA.A..', '..B...', '......', '......'])), cell(0, 2), cell(1, 2))).toBe(6);
    expect(strengthOf(state(build(['A-.A..', '..A...', '......', '......'])), cell(0, 2), cell(1, 2))).toBe(6);
    expect(strengthOf(state(build(['AA....', '..A...', '......', '......'])), cell(0, 2), cell(1, 2))).toBe(3);
    expect(strengthOf(state(build(['O.....', '......', '......', '......'])), cell(0, 0), cell(0, 1))).toBe(6);
    expect(strengthOf(state(build(['-|....', '......', '......', '......'])), cell(0, 0), cell(0, 1))).toBe(7);
    // A square-making swap: a power (4) once the Sprite is unlocked, not a move before.
    const square = ['A.....', '.A....', 'AA....', '......'];
    expect(strengthOf(state(build(square), SPRITE_ONLY), cell(0, 0), cell(1, 0))).toBe(4);
    expect(strengthOf(state(build(square), BASE_UNLOCKED), cell(0, 0), cell(1, 0))).toBeUndefined();
    // A T: 4 once Bloom is unlocked, 3 before.
    const tee = ['..A...', '.A.A..', '..A...', '..A...', '......'];
    expect(strengthOf(state(build(tee), ALL), cell(0, 2), cell(1, 2))).toBe(4);
    expect(strengthOf(state(build(tee), BASE_UNLOCKED), cell(0, 2), cell(1, 2))).toBe(3);
  });

  it('the hint is the strongest swap and the hint never disagrees with what the swap then makes', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame(9, 6, FOUR, seed, 0.3, ALL);
      const hint = bestHint(g);
      expect(hint).not.toBeNull();
      if (!hint) continue;
      const top = Math.max(...findValidSwaps(g).map((s) => s.strength));
      expect(hint.strength).toBe(top);
      const r = applySwap(g, hint.a, hint.b);
      const created = r.steps.slice(0, indexOf(r.steps, 'fall')).filter((s) => s.kind === 'create');
      if (hint.strength === 5) expect(created.some((s) => s.kind === 'create' && (s.piece.power === 'orb' || s.piece.power === 'aurora'))).toBe(true);
      if (hint.strength === 4) expect(created.length).toBeGreaterThan(0);
      if (hint.strength === 3) expect(created).toHaveLength(0);
    }
  });
});

// ------------------------------------------------------------- clear patterns

describe('what each power clears', () => {
  // Each power, made of diamond, sits in row 4; a swap completes A B A A through it.
  const inLine = (ch: string): Board => build(['......', '......', '......', '......', `A${ch}.A..`, '..A...', '......', '......', '......']);
  const matchFire = (ch: string, unlocked: readonly PowerFamily[] = ALL): { board: Board; fire: FireStep | undefined; r: ReturnType<typeof applySwap> } => {
    const board = inLine(ch);
    const r = applySwap(state(board, unlocked), cell(4, 2), cell(5, 2));
    return { board, fire: fires(r.steps)[0], r };
  };

  it('a comet caught in a match sweeps its whole row or column', () => {
    const row = matchFire('-');
    expect(row.fire?.power).toBe('cometRow');
    expectCells(row.fire?.cells ?? [], rowCells(row.board, 4));
    expect(row.fire?.color).toBe('diamond');
    const col = matchFire('|');
    expectCells(col.fire?.cells ?? [], colCells(col.board, 1));
    expect(replay(col.board, col.r.steps)).toEqual(col.r.state.board);
  });

  it('a starburst caught in a match sweeps both diagonals, itself included', () => {
    const { board, fire, r } = matchFire('X');
    expect(fire?.power).toBe('starburst');
    expectCells(fire?.cells ?? [], diagCells(board, cell(4, 1)));
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });

  it('a moonrise caught in a match clears its three-wide band, every row', () => {
    const { board, fire, r } = matchFire('M');
    expect(fire?.power).toBe('moonrise');
    expectCells(fire?.cells ?? [], bandCells(board, 1, 1));
    expect(replay(board, r.steps)).toEqual(r.state.board);
    // At the edge the band is clipped to the board.
    const edge = build(['......', '......', '......', '......', 'M.AA..', '.A....', '......', '......', '......']);
    const e = applySwap(state(edge, ALL), cell(4, 1), cell(5, 1));
    expectCells(fires(e.steps)[0]?.cells ?? [], bandCells(edge, 0, 1));
  });

  it('a bloom caught in a match opens on the 3 by 3 around it, survives, rides the fall and opens again as a 13-cell diamond', () => {
    const { board, r } = matchFire('B');
    const [first, ...rest] = fires(r.steps);
    expect(first?.power).toBe('bloom');
    expect(first?.phase).toBe(1);
    expect(first?.at).toEqual(cell(4, 1));
    expectCells(first?.cells ?? [], boxCells(board, cell(4, 1), 1, false));
    // The bud is not cleared in the first round, even though it was in the line.
    const clear = firstOf(r.steps, 'clear');
    expect(clear?.cells.some((c) => c.row === 4 && c.col === 1)).toBe(false);
    expect(clear?.groups[0]?.cells.some((c) => c.row === 4 && c.col === 1)).toBe(false);
    // The comet made by the four is placed on the swapped cell after the clear.
    expect(firstOf(r.steps, 'create')).toEqual({ kind: 'create', cell: cell(4, 2), piece: { type: 'diamond', power: 'cometRow' } });
    // After the fall, the bud opens again where it landed.
    const fall = firstOf(r.steps, 'fall');
    const landed = fall?.moves.find((m) => m.from.row === 4 && m.from.col === 1)?.to ?? cell(4, 1);
    const second = rest.find((f) => f.power === 'bloom' && f.phase === 2);
    expect(second?.at).toEqual(landed);
    expectCells(second?.cells ?? [], diamondCells(board, landed, 2));
    expect(r.steps.indexOf(second as Step)).toBeGreaterThan(r.steps.indexOf(fall as Step));
    const secondClear = r.steps.filter((s) => s.kind === 'clear')[1];
    expect(secondClear?.kind === 'clear' && secondClear.cells.some((c) => c.row === landed.row && c.col === landed.col)).toBe(true);
    expect(replay(board, r.steps)).toEqual(r.state.board);
    expectSettled(r.state);
  });

  it('a pending bud caught by another power’s light in the same round opens big right there', () => {
    // Row 4: A B . - with A below the gap: the four fires the bloom (phase 1), then the comet sweeps the row and the bud opens again.
    const board = build(['......', '......', '......', '......', 'AB.-..', '..A...', '......', '......', '......']);
    const r = applySwap(state(board, ALL), cell(4, 2), cell(5, 2));
    const before = fires(r.steps.slice(0, indexOf(r.steps, 'clear')));
    expect(before.map((f) => [f.power, f.phase ?? 0])).toEqual([['bloom', 1], ['cometRow', 0], ['bloom', 2]]);
    expect(before[2]?.at).toEqual(cell(4, 1));
    expectCells(before[2]?.cells ?? [], diamondCells(board, cell(4, 1), 2));
    expect(firstClear(r.steps).some((c) => c.row === 4 && c.col === 1)).toBe(true);
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });

  it('a sprite flies to the gem whose popping starts the biggest cascade, lower rows first', () => {
    // Diamonds at (2,2), (4,1), (4,3): popping (7,2) and its neighbours drops them into a line on row 5.
    const board = build(['..P...', '......', '..A...', '......', '.A.A..', '......', '......', '......', '......']);
    expect(cascadeScore(board, [cell(0, 2), cell(7, 2), ...neighbours(board, cell(7, 2))])).toBe(3);
    expect(cascadeScore(board, [cell(8, 2), ...neighbours(board, cell(8, 2))])).toBe(0);
    const r = firePowerAt(state(board, ALL), cell(0, 2));
    const fire = fires(r.steps)[0];
    expect(fire?.power).toBe('sprite');
    expect(fire?.at).toEqual(cell(0, 2));
    expect(fire?.target).toEqual(cell(7, 2));
    expectCells(fire?.cells ?? [], [cell(0, 2), cell(7, 2), ...neighbours(board, cell(7, 2))]);
    expect(r.cascades).toBeGreaterThanOrEqual(1);
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });

  it('a sprite with nothing to cascade pops the most common colour nearest the bottom centre, and never a power', () => {
    const board = build(['..P...', '......', '......', '......', '......', '......', '......', '......', '......']);
    (board[8] as (Piece | null)[])[4] = { type: 'star', power: 'cometRow' };
    const r = firePowerAt(state(board, ALL), cell(0, 2));
    const fire = fires(r.steps)[0];
    // Stars tie hearts for most common; the type order breaks the tie. (8,4) holds a power, so the next star wins.
    expect(fire?.target).toEqual(cell(7, 2));
    expect(at(board, 7, 2)?.type).toBe('star');
    expectCells(fire?.cells ?? [], [cell(0, 2), cell(7, 2), ...neighbours(board, cell(7, 2))]);
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });

  it('a sprite made by a match flies before the clear, and its target is outside the match', () => {
    const board = build(['A.....', '.A....', 'PA....', '......', '......', '......', '......', '......', '......']);
    const r = applySwap(state(board, ALL), cell(0, 0), cell(1, 0));
    const fire = fires(r.steps)[0];
    expect(fire?.power).toBe('sprite');
    const square = [cell(1, 0), cell(1, 1), cell(2, 0), cell(2, 1)];
    expect(square.some((c) => c.row === fire?.target?.row && c.col === fire?.target?.col)).toBe(false);
    expect(firstOf(r.steps, 'create')).toEqual({ kind: 'create', cell: cell(1, 0), piece: { type: 'diamond', power: 'sprite' } });
    expect(replay(board, r.steps)).toEqual(r.state.board);
  });

  it('an orb swapped with a gem clears that colour (coloured powers count as their colour) and fired by light clears the most common one', () => {
    const board = build(['O.....', '....B.', '......', '.-....', '......', '......']);
    const swapped = applySwap(state(board, ALL), cell(0, 0), cell(0, 1));
    const orb = fires(swapped.steps)[0];
    expect(orb?.power).toBe('orb');
    expect(orb?.color).toBe('heart');
    expectCells(orb?.cells ?? [], [cell(0, 0), ...ofColours(board, ['heart'])]);
    // A diamond orb-swap takes the diamond powers with it and they go off.
    const diamonds = build(['OA....', '....B.', '......', '.-....', '......', '......']);
    const d = applySwap(state(diamonds, ALL), cell(0, 0), cell(0, 1));
    expect(fires(d.steps).map((f) => f.power)).toEqual(expect.arrayContaining(['orb', 'bloom', 'cometRow']));
    expect(replay(diamonds, d.steps)).toEqual(d.state.board);
    // By light: the comet in row 3 reaches the orb in row 3.
    const lit = build(['......', '......', '......', '-..O..', '......', '......']);
    const l = firePowerAt(state(lit, ALL), cell(3, 0));
    const chained = fires(l.steps).find((f) => f.power === 'orb');
    expect(chained?.color).toBe(ranking(lit, FIVE)[0]);
    expectCells(chained?.cells ?? [], [cell(3, 3), ...ofColours(lit, [chained?.color ?? null])]);
  });

  it('an aurora swapped with a gem clears that colour and the most common other; by light, the two most common', () => {
    const board = build(['W.....', '......', '......', '......', '......', '......', '......', '......', '......']);
    const r = applySwap(state(board, ALL), cell(0, 0), cell(0, 1));
    const fire = fires(r.steps)[0];
    expect(fire?.power).toBe('aurora');
    expect(fire?.colors).toEqual(['heart', ranking(board, FIVE, ['heart'])[0]]);
    expect(fire?.color).toBe('heart');
    expectCells(fire?.cells ?? [], [cell(0, 0), ...ofColours(board, fire?.colors ?? [])]);
    expect(replay(board, r.steps)).toEqual(r.state.board);
    const lit = build(['......', '......', '......', '-..W..', '......', '......', '......', '......', '......']);
    const l = firePowerAt(state(lit, ALL), cell(3, 0));
    const chained = fires(l.steps).find((f) => f.power === 'aurora');
    expect(chained?.colors).toEqual(ranking(lit, FIVE).slice(0, 2));
    expectCells(chained?.cells ?? [], [cell(3, 3), ...ofColours(lit, chained?.colors ?? [])]);
  });

  it('a comet’s light sets off every power it touches, and those chain on', () => {
    const board = build(['......', '......', '......', '......', '-.B.X.', '...M..', '......', '......', 'P.....']);
    const r = firePowerAt(state(board, ALL), cell(4, 0));
    const fired = fires(r.steps.slice(0, indexOf(r.steps, 'clear')));
    // The moonrise band (columns 2 to 4) reaches the opened bud at (4,2), so it opens big in the same round.
    expect(fired.map((f) => [f.power, f.phase ?? 0])).toEqual([['cometRow', 0], ['bloom', 1], ['starburst', 0], ['moonrise', 0], ['sprite', 0], ['bloom', 2]]);
    expect(fired[5]?.at).toEqual(cell(4, 2));
    expectCells(fired[1]?.cells ?? [], boxCells(board, cell(4, 2), 1, false));
    expectCells(fired[2]?.cells ?? [], diagCells(board, cell(4, 4)));
    expectCells(fired[3]?.cells ?? [], bandCells(board, 3, 1));
    expect(fired[4]?.at).toEqual(cell(8, 0));
    expectStepOrder(r.steps, false);
    expect(replay(board, r.steps)).toEqual(r.state.board);
    expectSettled(r.state);
  });
});

// --------------------------------------------------------------- combinations

describe('two powers swapped onto each other', () => {
  /** Two powers side by side in the middle of a 9 by 6 board; the piece at a moves onto X = b. */
  const A = cell(4, 2);
  const X = cell(4, 3);
  const pair = (left: string, right: string, extraRows?: string[]): Board => {
    const rows = extraRows ?? ['......', '......', '......', '......', '......', '......', '......', '......', '......'];
    const row4 = rows[4] as string;
    rows[4] = row4.slice(0, 2) + left + right + row4.slice(4);
    return build(rows);
  };
  const run = (board: Board, unlocked: readonly PowerFamily[] = ALL): { r: ReturnType<typeof applySwap>; fs: FireStep[] } => {
    const s = state(board, unlocked);
    expect(isValidSwap(s, A, X)).toBe(true);
    const r = applySwap(s, A, X);
    const fs = fires(r.steps.slice(0, indexOf(r.steps, 'clear')));
    expect(replay(board, r.steps)).toEqual(r.state.board);
    expectSettled(r.state);
    return { r, fs };
  };
  const sameGroup = (fs: FireStep[]): void => {
    expect(fs.length).toBeGreaterThan(1);
    expect(new Set(fs.map((f) => f.group)).size).toBe(1);
    expect(fs[0]?.group).toBeDefined();
  };

  it('comet + comet is a cross at the landing cell', () => {
    const board = pair('-', '|');
    const { fs, r } = run(board);
    expect(fs.map((f) => [f.power, f.combo])).toEqual([['cometRow', 'cross'], ['cometCol', 'cross']]);
    sameGroup(fs);
    expectCells(fs[0]?.cells ?? [], rowCells(board, 4));
    expectCells(fs[1]?.cells ?? [], colCells(board, 3));
    expectCells(firstClear(r.steps), union(rowCells(board, 4), colCells(board, 3)));
  });

  it('comet + bloom is a wide cross: three rows and three columns', () => {
    const board = pair('B', '-');
    const { fs, r } = run(board);
    expect(fs.every((f) => f.combo === 'wideCross')).toBe(true);
    sameGroup(fs);
    expect(fs.filter((f) => f.power === 'cometRow').map((f) => f.at)).toEqual([cell(3, 3), cell(4, 3), cell(5, 3)]);
    expect(fs.filter((f) => f.power === 'cometCol').map((f) => f.at)).toEqual([cell(4, 2), cell(4, 3), cell(4, 4)]);
    expectCells(firstClear(r.steps), union(rowCells(board, 3), rowCells(board, 4), rowCells(board, 5), colCells(board, 2), colCells(board, 3), colCells(board, 4)));
  });

  it('bloom + bloom is a giant bloom: a 5 by 5 that opens twice', () => {
    const board = pair('B', 'B');
    const { fs, r } = run(board);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ power: 'bloom', at: X, phase: 1, combo: 'giantBloom' });
    expectCells(fs[0]?.cells ?? [], boxCells(board, X, 2, false));
    expectCells(firstClear(r.steps), boxCells(board, X, 2, false));
    const fall = firstOf(r.steps, 'fall');
    const landed = fall?.moves.find((m) => m.from.row === X.row && m.from.col === X.col)?.to ?? X;
    expect(landed).toEqual(cell(6, 3));
    const second = fires(r.steps).find((f) => f.phase === 2);
    expect(second).toMatchObject({ power: 'bloom', at: landed, combo: 'giantBloom' });
    expectCells(second?.cells ?? [], giantSecond(board, landed));
    expect(giantSecond(background(11, 11), cell(5, 5))).toHaveLength(29);
  });

  it('orb + comet is a comet shower: every gem of that colour becomes a comet and they fly in turn', () => {
    const board = pair('O', '-', ['A.....', '......', '....A.', '......', '......', 'A.....', '......', '...A..', '......']);
    const diamonds = ofColours(board, ['diamond']).filter((c) => !(c.row === 4 && c.col === 3));
    const { r, fs } = run(board);
    const transform = firstOf(r.steps, 'transform');
    expect(transform?.combo).toBe('cometShower');
    expectCells(transform?.changes.map((ch) => ch.cell) ?? [], diamonds);
    expect(transform?.changes.every((ch) => ch.piece.type === 'diamond' && (ch.piece.power === 'cometRow' || ch.piece.power === 'cometCol'))).toBe(true);
    expect(r.steps.indexOf(transform as Step)).toBeLessThan(r.steps.indexOf(fs[0] as Step));
    expect(fs).toHaveLength(diamonds.length + 1);
    expect(fs.every((f) => f.combo === 'cometShower' && f.group === undefined && f.color === 'diamond')).toBe(true);
    // Nearest the landing cell first: the original comet, now at a, flies first.
    expect(fs[0]?.at).toEqual(A);
    const dist = (c: Cell): number => Math.abs(c.row - X.row) + Math.abs(c.col - X.col);
    for (let i = 1; i < fs.length; i++) expect(dist((fs[i] as FireStep).at)).toBeGreaterThanOrEqual(dist((fs[i - 1] as FireStep).at));
    for (const f of fs) expectCells(f.cells, f.power === 'cometRow' ? rowCells(board, f.at.row) : colCells(board, f.at.col));
    const cleared = firstClear(r.steps);
    expect(cleared.some((c) => c.row === X.row && c.col === X.col)).toBe(true);
    expect(cleared.some((c) => c.row === A.row && c.col === A.col)).toBe(true);
  });

  it('orb + bloom is a bloom wave: every gem of that colour opens once, together', () => {
    const board = pair('B', 'O', ['A.....', '......', '....A.', '......', '......', 'A.....', '......', '...A..', '......']);
    const { r, fs } = run(board);
    expect(firstOf(r.steps, 'transform')?.combo).toBe('bloomWave');
    expect(firstOf(r.steps, 'transform')?.changes.every((ch) => ch.piece.power === 'bloom')).toBe(true);
    expect(fs).toHaveLength(5);
    expect(fs.every((f) => f.power === 'bloom' && f.combo === 'bloomWave' && f.phase === undefined)).toBe(true);
    sameGroup(fs);
    for (const f of fs) expectCells(f.cells, boxCells(board, f.at, 1));
    expect(fires(r.steps).some((f) => f.phase !== undefined)).toBe(false);
  });

  it('orb + starburst and orb + moonrise are showers of that power, all going off together', () => {
    const stars = pair('O', 'X', ['A.....', '......', '....A.', '......', '......', '......', '......', '...A..', '......']);
    const s = run(stars);
    expect(firstOf(s.r.steps, 'transform')?.combo).toBe('starShower');
    expect(s.fs).toHaveLength(4);
    expect(s.fs.every((f) => f.power === 'starburst' && f.combo === 'starShower')).toBe(true);
    sameGroup(s.fs);
    for (const f of s.fs) expectCells(f.cells, diagCells(stars, f.at));
    const moons = pair('M', 'O', ['A.....', '......', '......', '......', '......', '......', '......', '...A..', '......']);
    const m = run(moons);
    expect(firstOf(m.r.steps, 'transform')?.combo).toBe('moonTide');
    expect(m.fs).toHaveLength(3);
    expect(m.fs.every((f) => f.power === 'moonrise' && f.combo === 'moonTide')).toBe(true);
    sameGroup(m.fs);
    for (const f of m.fs) expectCells(f.cells, bandCells(moons, f.at.col, 1));
  });

  it('orb + orb is the sunrise: every cell, in one step', () => {
    const board = pair('O', 'O');
    const { fs, r } = run(board);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ power: 'orb', at: X, color: null, combo: 'sunrise' });
    expectCells(fs[0]?.cells ?? [], allCells(board));
    expect(r.cleared).toBeGreaterThanOrEqual(54);
  });

  it('orb + aurora is the aurora dawn: the three most common colours', () => {
    const board = pair('W', 'O');
    const { fs } = run(board);
    expect(fs).toHaveLength(1);
    const colors = ranking(board, FIVE).slice(0, 3);
    expect(fs[0]).toMatchObject({ power: 'aurora', at: X, combo: 'auroraDawn', colors, color: colors[0] });
    expectCells(fs[0]?.cells ?? [], union([A, X], ofColours(board, colors)));
  });

  it('sprite + comet, bloom, starburst or moonrise: the sprite carries the power to the best spot and sets it off there', () => {
    const cases: Array<[string, PowerKind]> = [['-', 'cometRow'], ['|', 'cometCol'], ['B', 'bloom'], ['X', 'starburst'], ['M', 'moonrise']];
    for (const [ch, power] of cases) {
      const board = pair('P', ch);
      const { fs, r } = run(board);
      expect(fs).toHaveLength(2);
      const [flight, carried] = fs;
      expect(flight).toMatchObject({ power: 'sprite', at: X, cells: [], carrying: power, combo: 'carry' });
      const target = flight?.target as Cell;
      expect(target).toBeDefined();
      expect(at(board, target.row, target.col)?.power).toBeNull();
      expect(carried).toMatchObject({ power, at: target, combo: 'carry' });
      const expected =
        power === 'cometRow' ? rowCells(board, target.row)
        : power === 'cometCol' ? colCells(board, target.col)
        : power === 'bloom' ? diamondCells(board, target, 2)
        : power === 'starburst' ? diagCells(board, target)
        : bandCells(board, target.col, 1);
      expectCells(carried?.cells ?? [], expected);
      expect(carried?.phase).toBeUndefined();
      const cleared = firstClear(r.steps);
      expect(cleared.some((c) => c.row === A.row && c.col === A.col)).toBe(true);
      expect(cleared.some((c) => c.row === X.row && c.col === X.col)).toBe(true);
    }
  });

  it('a carried comet goes where it starts the biggest cascade', () => {
    // Diamonds at (5,2), (7,2) and (8,2): sweeping row 6 drops the top one onto the other two; no other row does anything.
    const board = pair('P', '-', ['......', '......', '......', '......', '......', '..A...', '......', '..A...', '..A...']);
    const rowScore = (row: number): number => cascadeScore(board, [A, X, ...rowCells(board, row)]);
    expect(rowScore(6)).toBeGreaterThanOrEqual(3);
    for (let row = 0; row < 9; row++) if (row !== 6) expect(rowScore(row)).toBeLessThan(rowScore(6));
    const { fs, r } = run(board);
    expect(fs[0]?.target).toEqual(cell(6, 2));
    expect(fs[1]).toMatchObject({ power: 'cometRow', at: cell(6, 2), combo: 'carry' });
    expect(r.cascades).toBeGreaterThanOrEqual(1);
  });

  it('sprite + orb carries the orb to the most common colour; sprite + aurora adds the next most common', () => {
    const board = pair('O', 'P');
    const { fs } = run(board);
    const colour = ranking(board, FIVE)[0] as GemType;
    expect(fs).toHaveLength(2);
    expect(fs[0]).toMatchObject({ power: 'sprite', at: A, cells: [], carrying: 'orb', combo: 'carry' });
    const target = fs[0]?.target as Cell;
    expect(at(board, target.row, target.col)?.type).toBe(colour);
    expect(fs[1]).toMatchObject({ power: 'orb', at: target, color: colour, combo: 'carry' });
    expectCells(fs[1]?.cells ?? [], union([target], ofColours(board, [colour])));
    const sky = pair('P', 'W');
    const w = run(sky);
    const colors = ranking(sky, FIVE).slice(0, 2);
    expect(w.fs[0]).toMatchObject({ power: 'sprite', at: X, carrying: 'aurora', combo: 'carry' });
    expect(w.fs[1]).toMatchObject({ power: 'aurora', colors, color: colors[0], combo: 'carry' });
    expectCells(w.fs[1]?.cells ?? [], union([w.fs[0]?.target as Cell], ofColours(sky, colors)));
  });

  it('sprite + sprite is a twin flight to two different useful spots', () => {
    const board = pair('P', 'P');
    const { fs } = run(board);
    expect(fs).toHaveLength(2);
    expect(fs.every((f) => f.power === 'sprite' && f.combo === 'twinFlight' && f.target)).toBe(true);
    sameGroup(fs);
    expect(fs.map((f) => key(f.at)).sort()).toEqual([key(A), key(X)].sort());
    const [first, second] = fs as [FireStep, FireStep];
    expect(key(first.target as Cell)).not.toBe(key(second.target as Cell));
    const firstCells = new Set(first.cells.map(key));
    expect(second.cells.filter((c) => !(c.row === second.at.row && c.col === second.at.col)).some((c) => firstCells.has(key(c)))).toBe(false);
  });

  it('starburst + comet is an eight-pointed star; two starbursts add the 3 by 3', () => {
    const board = pair('X', '-');
    const { fs, r } = run(board);
    expect(fs.map((f) => [f.power, f.combo])).toEqual([['cometRow', 'eightStar'], ['cometCol', 'eightStar'], ['starburst', 'eightStar']]);
    sameGroup(fs);
    expect(fs.every((f) => f.at.row === X.row && f.at.col === X.col)).toBe(true);
    expectCells(firstClear(r.steps), union(rowCells(board, 4), colCells(board, 3), diagCells(board, X)));
    const twin = run(pair('X', 'X'));
    expectCells(twin.fs[2]?.cells ?? [], union(diagCells(board, X), boxCells(board, X, 1)));
  });

  it('moonrise + comet is a wide moon: five columns and the comet’s row', () => {
    const board = pair('-', 'M');
    const { fs, r } = run(board);
    expect(fs.map((f) => [f.power, f.combo])).toEqual([['moonrise', 'wideMoon'], ['cometRow', 'wideMoon']]);
    sameGroup(fs);
    expectCells(fs[0]?.cells ?? [], bandCells(board, X.col, 2));
    expectCells(fs[1]?.cells ?? [], rowCells(board, X.row));
    expectCells(firstClear(r.steps), union(bandCells(board, X.col, 2), rowCells(board, X.row)));
  });

  it('moonrise + bloom is a moonflower: the five-wide band and the 5 by 5', () => {
    const board = pair('M', 'B');
    const { fs } = run(board);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ power: 'moonrise', at: X, combo: 'moonflower' });
    expectCells(fs[0]?.cells ?? [], union(bandCells(board, X.col, 2), boxCells(board, X, 2)));
  });

  it('moonrise + moonrise is the full moon: every cell', () => {
    const board = pair('M', 'M');
    const { fs } = run(board);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ power: 'moonrise', at: X, combo: 'fullMoon' });
    expectCells(fs[0]?.cells ?? [], allCells(board));
  });

  it('moonrise + starburst is the moon star: the band and both diagonals together', () => {
    const board = pair('X', 'M');
    const { fs } = run(board);
    expect(fs.map((f) => [f.power, f.combo])).toEqual([['moonrise', 'moonStar'], ['starburst', 'moonStar']]);
    sameGroup(fs);
    expectCells(fs[0]?.cells ?? [], bandCells(board, X.col, 1));
    expectCells(fs[1]?.cells ?? [], diagCells(board, X));
  });

  it('aurora + aurora is the aurora sky: every cell, every colour, most common first', () => {
    const board = pair('W', 'W');
    const { fs } = run(board);
    expect(fs).toHaveLength(1);
    expect(fs[0]).toMatchObject({ power: 'aurora', at: X, combo: 'auroraSky', colors: ranking(board, FIVE) });
    expectCells(fs[0]?.cells ?? [], allCells(board));
  });

  it('any other pairing sets both off from the landing cell, one after the other, each with its own pattern', () => {
    const skyComet = pair('W', '-');
    const swapped = skyComet.map((r) => r.slice());
    (swapped[A.row] as (Piece | null)[])[A.col] = at(skyComet, X.row, X.col);
    (swapped[X.row] as (Piece | null)[])[X.col] = at(skyComet, A.row, A.col);
    const a = run(skyComet);
    // The moved piece (now at X) goes off first, then the one it landed beside.
    expect(a.fs.map((f) => [f.power, f.combo, f.group])).toEqual([['aurora', 'pair', undefined], ['cometRow', 'pair', undefined]]);
    expect(a.fs.every((f) => f.at.row === X.row && f.at.col === X.col)).toBe(true);
    expectCells(a.fs[1]?.cells ?? [], rowCells(skyComet, X.row));
    expect(a.fs[0]?.colors).toEqual(['diamond', ranking(skyComet, FIVE, ['diamond'])[0]]);
    expectCells(a.fs[0]?.cells ?? [], union([X], ofColours(swapped, a.fs[0]?.colors ?? [])));

    const starBloom = pair('B', 'X');
    const b = run(starBloom);
    expect(b.fs.map((f) => [f.power, f.combo])).toEqual([['bloom', 'pair'], ['starburst', 'pair']]);
    expectCells(b.fs[0]?.cells ?? [], diamondCells(starBloom, X, 2));
    expect(b.fs[0]?.phase).toBeUndefined();
    expectCells(b.fs[1]?.cells ?? [], diagCells(starBloom, X));

    const moonSky = pair('M', 'W');
    const c = run(moonSky);
    expect(c.fs.map((f) => [f.power, f.combo])).toEqual([['moonrise', 'pair'], ['aurora', 'pair']]);
    expectCells(c.fs[0]?.cells ?? [], bandCells(moonSky, X.col, 1));
  });

  it('every one of the 28 family pairs is a valid swap that clears far more than the two pieces, both ways round', () => {
    const kindOf: Record<PowerFamily, PowerKind> = { comet: 'cometRow', orb: 'orb', bloom: 'bloom', sprite: 'sprite', starburst: 'starburst', moonrise: 'moonrise', aurora: 'aurora' };
    const pieceOf = (f: PowerFamily, type: GemType): Piece => (f === 'orb' || f === 'aurora' ? { type: null, power: f } : { type, power: kindOf[f] });
    expect(ALL_COMBOS).toHaveLength(28);
    for (const [fa, fb] of ALL_COMBOS) {
      for (const [left, right] of [[fa, fb], [fb, fa]] as Array<[PowerFamily, PowerFamily]>) {
        const board = background(9, 6);
        (board[4] as (Piece | null)[])[2] = pieceOf(left, 'diamond');
        (board[4] as (Piece | null)[])[3] = pieceOf(right, 'diamond');
        const s = state(board, ALL);
        expect(isValidSwap(s, A, X)).toBe(true);
        expect(findValidSwaps(s).some((o) => o.strength === 7)).toBe(true);
        const r = applySwap(s, A, X);
        const fs = fires(r.steps.slice(0, indexOf(r.steps, 'clear')));
        expect(fs.length).toBeGreaterThan(0);
        expect(fs.every((f) => f.combo !== undefined)).toBe(true);
        expect(firstClear(r.steps).length).toBeGreaterThan(2);
        expectStepOrder(r.steps, true);
        expect(replay(board, r.steps)).toEqual(r.state.board);
        expectSettled(r.state);
      }
    }
  });
});

// ------------------------------------------------------------------ invariants

describe('invariants over random play', () => {
  const unlockSets: Array<[string, readonly PowerFamily[], readonly GemType[]]> = [
    ['base', BASE_UNLOCKED, FOUR],
    ['all', ALL, FOUR],
    ['sprite only', SPRITE_ONLY, FIVE],
  ];

  for (const [name, unlocked, types] of unlockSets) {
    it(`${name}: thousands of random valid moves keep every invariant, replay through their steps and survive JSON`, { timeout: 60000 }, () => {
      const seen = new Map<PowerKind, number>();
      let combos = 0;
      for (const seed of [21, 22]) {
        let g = newGame(9, 6, types, seed, 0.3, unlocked);
        expectSettled(g);
        const rng = createRng(seed * 13);
        for (let i = 0; i < 700; i++) {
          const swaps = findValidSwaps(g);
          expect(swaps.length).toBeGreaterThan(0);
          // Prefer firing powers so the rules see plenty of use.
          const strong = swaps.filter((s) => s.strength >= 6);
          const pick = strong.length > 0 && rng.chance(0.7) ? rng.pick(strong) : rng.pick(swaps);
          const r = applySwap(g, pick.a, pick.b);
          expect(r.steps[0]).toMatchObject({ kind: 'swap', valid: true });
          expectStepOrder(r.steps, true);
          expect(replay(g.board, r.steps)).toEqual(r.state.board);
          expectSettled(r.state);
          for (const st of r.steps) {
            if (st.kind === 'create') seen.set(st.piece.power as PowerKind, (seen.get(st.piece.power as PowerKind) ?? 0) + 1);
            if (st.kind === 'fire') {
              if (st.combo) combos++;
              expect(st.cells.every((c) => c.row >= 0 && c.row < 9 && c.col >= 0 && c.col < 6)).toBe(true);
            }
          }
          const copy = deserialize(serialize(g));
          expect(copy).toEqual(g);
          expect(applySwap(copy as GameState, pick.a, pick.b).steps).toEqual(r.steps);
          g = r.state;
        }
      }
      expect((seen.get('cometRow') ?? 0) + (seen.get('cometCol') ?? 0)).toBeGreaterThan(0);
      if (unlocked.includes('bloom')) expect(seen.get('bloom') ?? 0).toBeGreaterThan(0);
      if (unlocked.includes('sprite')) expect(seen.get('sprite') ?? 0).toBeGreaterThan(0);
      if (unlocked === ALL) expect(combos).toBeGreaterThan(0);
    });
  }

  it('fresh boards for both board sizes, every type count and every unlock set have no match and a move', { timeout: 60000 }, () => {
    const sets: Array<readonly PowerFamily[]> = [BASE_UNLOCKED, ...MILESTONES.filter((m) => m.gift.kind === 'power').map((m) => unlockedAt(m.level))];
    const boards: Array<[number, number, readonly GemType[]]> = [[9, 6, FOUR], [9, 6, FIVE], [8, 7, FIVE], [8, 7, SIX]];
    for (const [rows, cols, types] of boards) {
      for (const unlocked of sets) {
        for (let seed = 1; seed <= 120; seed++) {
          const g = newGame(rows, cols, types, seed, 0.3, unlocked);
          expect(isFull(g.board)).toBe(true);
          expect(hasAnyMatch(g.board, unlocked)).toBe(false);
          expect(findLines(g.board)).toHaveLength(0);
          if (unlocked.includes('sprite')) expect(findSquares(g.board)).toHaveLength(0);
          expect(findValidSwaps(g).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('reshuffle keeps every piece, powers included, and respects lines and squares', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGame(9, 6, FOUR, seed, 0.3, ALL);
      const board = g.board.map((r) => r.slice());
      (board[1] as (Piece | null)[])[1] = { type: at(board, 1, 1)?.type ?? 'star', power: 'bloom' };
      (board[5] as (Piece | null)[])[4] = { type: null, power: 'orb' };
      (board[7] as (Piece | null)[])[2] = { type: at(board, 7, 2)?.type ?? 'star', power: 'sprite' };
      const s = { ...g, board };
      const shuffled = reshuffleBoard(s, createRng(seed));
      expect(shuffled).not.toBeNull();
      if (!shuffled) continue;
      const bag = (b: Board): string[] => b.flat().map((p) => JSON.stringify(p)).sort();
      expect(bag(shuffled)).toEqual(bag(board));
      expect(hasAnyMatch(shuffled, ALL)).toBe(false);
      expect(findValidSwaps({ ...s, board: shuffled }).length).toBeGreaterThan(0);
      expect(findPowers(shuffled).length).toBe(3);
    }
  });

  it('a dead end swirls into a new arrangement that has a move', () => {
    // Rows alternating between two colour pairs have no line, no square and no move.
    const rows = ['SHSHSH', 'DLDLDL', 'SHSHSH', 'DLDLDL', 'SHSHSH', 'DLDLDL', 'SHSHSH', 'DLDLDL', 'SHSHSH'];
    const board = rows.map((r) => [...r].map((ch) => (LEGEND[ch] as () => Piece)()));
    const s = state(board, ALL);
    expect(findLines(board)).toHaveLength(0);
    expect(findValidSwaps(s)).toHaveLength(0);
    for (let seed = 1; seed <= 20; seed++) {
      const shuffled = reshuffleBoard(s, createRng(seed));
      expect(shuffled).not.toBeNull();
      expect(hasAnyMatch(shuffled as Board, ALL)).toBe(false);
      expect(findValidSwaps({ ...s, board: shuffled as Board }).length).toBeGreaterThan(0);
    }
    // Four types on the Calm board: the reshuffle must still find an arrangement every time.
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGame(9, 6, FOUR, seed, 0.3, ALL);
      expect(reshuffleBoard(g, createRng(seed))).not.toBeNull();
    }
  });
});

// ------------------------------------------------------------------------ gifts

describe('gifts and the finishing light', () => {
  const powerGifts: Gift[] = POWER_FAMILIES.map((family) => ({ kind: 'power', family }));
  const comboGifts: Gift[] = [
    { kind: 'combo', a: 'comet', b: 'bloom' },
    { kind: 'combo', a: 'orb', b: 'comet' },
    { kind: 'combo', a: 'bloom', b: 'bloom' },
    { kind: 'combo', a: 'orb', b: 'orb' },
    { kind: 'combo', a: 'moonrise', b: 'comet' },
    { kind: 'combo', a: 'sprite', b: 'aurora' },
  ];
  const familyOfGift = (p: Piece): PowerFamily | null => (p.power === null ? null : p.power === 'cometRow' || p.power === 'cometCol' ? 'comet' : p.power);

  for (const gift of [...powerGifts, ...comboGifts]) {
    const label = gift.kind === 'power' ? gift.family : `${gift.a} + ${gift.b}`;
    it(`places ${label} so one swap sets it off, without touching any gem type`, { timeout: 30000 }, () => {
      for (let seed = 1; seed <= 40; seed++) {
        // Both boards: Calm's 9 by 6 and Play's 8 by 7, whose even row count once hid a bad hint on a vertical pair.
        const fresh = seed % 3 === 0 ? newGame(8, 7, FIVE, seed, 0.12, ALL) : newGame(9, 6, seed % 2 ? FOUR : FIVE, seed, 0.3, ALL);
        const { state: gifted, cells } = placeGift(fresh, gift, createRng(seed));
        expect(cells.length).toBe(gift.kind === 'power' ? 1 : 2);
        const giftKeys = new Set(cells.map(key));
        for (const c of allCells(fresh.board)) {
          const before = at(fresh.board, c.row, c.col) as Piece;
          const after = at(gifted.board, c.row, c.col) as Piece;
          if (!giftKeys.has(key(c))) expect(after).toEqual(before);
          else if (after.type !== null) expect(after.type).toBe(before.type);
          else expect(after.power === 'orb' || after.power === 'aurora').toBe(true);
        }
        expect(hasAnyMatch(gifted.board, ALL)).toBe(false);
        const families = cells.map((c) => familyOfGift(at(gifted.board, c.row, c.col) as Piece));
        if (gift.kind === 'power') {
          expect(families).toEqual([gift.family]);
          expect(findPowers(gifted.board, gift.family).map((p) => key(p.cell))).toEqual([key(cells[0] as Cell)]);
        } else {
          expect(families.sort()).toEqual([gift.a, gift.b].sort());
          expect(Math.abs((cells[0] as Cell).row - (cells[1] as Cell).row) + Math.abs((cells[0] as Cell).col - (cells[1] as Cell).col)).toBe(1);
          expect(isValidSwap(gifted, cells[0] as Cell, cells[1] as Cell)).toBe(true);
        }
        expect(findPowers(gifted.board)).toHaveLength(cells.length);
        const hint = bestHint(gifted);
        expect(hint?.strength).toBe(gift.kind === 'power' ? 6 : 7);
        // Taking the hint fires the gift (every power on the board goes off) and leaves a playable board.
        const r = applySwap(gifted, (hint as { a: Cell }).a, (hint as { b: Cell }).b);
        const fired = fires(r.steps.slice(0, indexOf(r.steps, 'clear')));
        expect(fired.length).toBeGreaterThan(0);
        if (gift.kind === 'power') expect(fired.some((f) => (f.power === 'cometRow' || f.power === 'cometCol' ? 'comet' : f.power) === gift.family)).toBe(true);
        else expect(fired.every((f) => f.combo !== undefined)).toBe(true);
        expect(replay(gifted.board, r.steps)).toEqual(r.state.board);
        expectSettled(r.state);
      }
    });
  }

  it('the finishing light sets a gift off with no swap step and resolves to a settled board', () => {
    for (const gift of powerGifts) {
      for (let seed = 1; seed <= 12; seed++) {
        const fresh = newGame(9, 6, FIVE, seed, 0.3, ALL);
        const { state: gifted, cells } = placeGift(fresh, gift, createRng(seed));
        const r = firePowerAt(gifted, cells[0] as Cell);
        expect(r.steps[0]?.kind).toBe('fire');
        expect((r.steps[0] as FireStep).at).toEqual(cells[0]);
        expect(r.steps.some((s) => s.kind === 'swap')).toBe(false);
        expectStepOrder(r.steps, false);
        expect(r.cleared).toBeGreaterThan(0);
        expect(replay(gifted.board, r.steps)).toEqual(r.state.board);
        expectSettled(r.state);
      }
    }
    // A cell without a power: nothing happens.
    const g = newGame(9, 6, FIVE, 3, 0.3, ALL);
    expect(firePowerAt(g, cell(0, 0))).toEqual({ state: g, steps: [], cleared: 0, cascades: 0 });
  });

  it('a colourless gift sits nearest the centre; a combo gift sits in the middle of the board', () => {
    const fresh = newGame(9, 6, FIVE, 7, 0.3, ALL);
    const orb = placeGift(fresh, { kind: 'power', family: 'orb' }, createRng(1));
    expect(orb.cells[0]).toEqual(cell(4, 2));
    const pairGift = placeGift(fresh, { kind: 'combo', a: 'comet', b: 'bloom' }, createRng(1));
    for (const c of pairGift.cells) {
      expect(Math.abs(c.row - 4)).toBeLessThanOrEqual(1);
      expect(Math.abs(c.col - 2.5)).toBeLessThanOrEqual(1.5);
    }
  });

  it('saves from before unlocks existed load with the two starting powers', () => {
    const g = newGame(9, 6, FIVE, 1);
    const { unlocked, ...old } = g;
    void unlocked;
    expect(deserialize(JSON.stringify(old))?.unlocked).toEqual(BASE_UNLOCKED);
    expect(deserialize('nonsense')).toBeNull();
  });
});
