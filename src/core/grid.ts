/**
 * Pure board logic shared by the game and the mockups: board generation
 * with no starting match and at least one valid move, match detection for
 * plain lines, and a reshuffle that keeps the same pieces.
 *
 * Nothing in here touches the DOM, audio or timers.
 */
import type { Rng } from '../shared/rng';

export type GemType = 'star' | 'heart' | 'drop' | 'leaf' | 'diamond' | 'sunstone';
export const GEM_TYPES: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond', 'sunstone'];

/** grid[row][col]; null is an empty cell (not part of the board shape). */
export type Grid = (GemType | null)[][];

export interface Cell {
  row: number;
  col: number;
}

export interface Swap {
  a: Cell;
  b: Cell;
}

export function makeGrid(rows: number, cols: number): Grid {
  return Array.from({ length: rows }, () => Array<GemType | null>(cols).fill(null));
}

export function cloneGrid(grid: Grid): Grid {
  return grid.map((row) => row.slice());
}

export function cellAt(grid: Grid, row: number, col: number): GemType | null {
  return grid[row]?.[col] ?? null;
}

/**
 * Fill every cell with a random type, never completing a line of three.
 * Retries with fresh randomness until the board also has a valid move.
 */
export function generateGrid(rows: number, cols: number, types: readonly GemType[], rng: Rng): Grid {
  if (types.length < 3) throw new Error('need at least three gem types');
  for (let attempt = 0; attempt < 200; attempt++) {
    const grid = makeGrid(rows, cols);
    fillAvoidingLines(grid, types, rng);
    if (findLineMatches(grid).length === 0 && findValidSwaps(grid).length > 0) return grid;
  }
  throw new Error('could not generate a board with a valid move');
}

function fillAvoidingLines(grid: Grid, types: readonly GemType[], rng: Rng): void {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const banned = new Set<GemType>();
      const left1 = cellAt(grid, r, c - 1);
      const left2 = cellAt(grid, r, c - 2);
      if (left1 !== null && left1 === left2) banned.add(left1);
      const up1 = cellAt(grid, r - 1, c);
      const up2 = cellAt(grid, r - 2, c);
      if (up1 !== null && up1 === up2) banned.add(up1);
      const allowed = types.filter((t) => !banned.has(t));
      const row = grid[r];
      if (row) row[c] = rng.pick(allowed.length > 0 ? allowed : types);
    }
  }
}

/** Every maximal horizontal or vertical run of three or more identical gems. */
export function findLineMatches(grid: Grid): Cell[][] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const matches: Cell[][] = [];
  for (let r = 0; r < rows; r++) {
    let start = 0;
    for (let c = 1; c <= cols; c++) {
      const same = c < cols && cellAt(grid, r, c) !== null && cellAt(grid, r, c) === cellAt(grid, r, start);
      if (!same) {
        if (c - start >= 3) matches.push(range(start, c).map((col) => ({ row: r, col })));
        start = c;
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      const same = r < rows && cellAt(grid, r, c) !== null && cellAt(grid, r, c) === cellAt(grid, start, c);
      if (!same) {
        if (r - start >= 3) matches.push(range(start, r).map((row) => ({ row, col: c })));
        start = r;
      }
    }
  }
  return matches;
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from }, (_, i) => from + i);
}

/** Does a line of three or more pass through (row, col)? */
export function hasLineAt(grid: Grid, row: number, col: number): boolean {
  const type = cellAt(grid, row, col);
  if (type === null) return false;
  let run = 1;
  for (let c = col - 1; cellAt(grid, row, c) === type; c--) run++;
  for (let c = col + 1; cellAt(grid, row, c) === type; c++) run++;
  if (run >= 3) return true;
  run = 1;
  for (let r = row - 1; cellAt(grid, r, col) === type; r--) run++;
  for (let r = row + 1; cellAt(grid, r, col) === type; r++) run++;
  return run >= 3;
}

/** Swap two cells in place. */
export function swapCells(grid: Grid, a: Cell, b: Cell): void {
  const rowA = grid[a.row];
  const rowB = grid[b.row];
  if (!rowA || !rowB) return;
  const tmp = rowA[a.col] ?? null;
  rowA[a.col] = rowB[b.col] ?? null;
  rowB[b.col] = tmp;
}

/** Would swapping a and b complete a line through either cell? */
export function swapMakesLine(grid: Grid, a: Cell, b: Cell): boolean {
  if (cellAt(grid, a.row, a.col) === null || cellAt(grid, b.row, b.col) === null) return false;
  if (cellAt(grid, a.row, a.col) === cellAt(grid, b.row, b.col)) return false;
  swapCells(grid, a, b);
  const ok = hasLineAt(grid, a.row, a.col) || hasLineAt(grid, b.row, b.col);
  swapCells(grid, a, b);
  return ok;
}

/** Every adjacent swap that completes a line of three or more. */
export function findValidSwaps(grid: Grid): Swap[] {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const swaps: Swap[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = { row: r, col: c };
      if (c + 1 < cols) {
        const b = { row: r, col: c + 1 };
        if (swapMakesLine(grid, a, b)) swaps.push({ a, b });
      }
      if (r + 1 < rows) {
        const b = { row: r + 1, col: c };
        if (swapMakesLine(grid, a, b)) swaps.push({ a, b });
      }
    }
  }
  return swaps;
}

/**
 * Rearrange the existing pieces (same multiset) into a board with no line
 * and at least one valid move. Returns null if the pieces cannot be
 * arranged that way after many attempts, which only happens on tiny or
 * nearly uniform boards.
 */
export function reshuffle(grid: Grid, rng: Rng): Grid | null {
  const cells: Cell[] = [];
  const pieces: GemType[] = [];
  grid.forEach((row, r) =>
    row.forEach((t, c) => {
      if (t !== null) {
        cells.push({ row: r, col: c });
        pieces.push(t);
      }
    }),
  );
  for (let attempt = 0; attempt < 500; attempt++) {
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const pi = pieces[i] as GemType;
      pieces[i] = pieces[j] as GemType;
      pieces[j] = pi;
    }
    const next = cloneGrid(grid);
    cells.forEach((cell, i) => {
      const row = next[cell.row];
      if (row) row[cell.col] = pieces[i] ?? null;
    });
    if (findLineMatches(next).length === 0 && findValidSwaps(next).length > 0) return next;
  }
  return null;
}

/** Counts of each type on the board, most common first. */
export function typeCounts(grid: Grid): Array<{ type: GemType; count: number }> {
  const counts = new Map<GemType, number>();
  for (const row of grid) for (const t of row) if (t !== null) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
}
