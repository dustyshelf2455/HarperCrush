/**
 * The game core: pure, deterministic, and testable without a browser.
 *
 * A GameState holds the board. `applySwap` returns a new state plus an
 * ordered list of Steps that describe exactly what happened, in the order
 * the presentation should show it: the swap, powers fired or gems
 * transformed, each clear with the cascade depth, powers created, every
 * fall, and any reshuffle. `firePowerAt` does the same for a power set off
 * by the finishing light, and `placeGift` seats a milestone gift on a fresh
 * board (DESIGN.md 3.4, "How she discovers them").
 *
 * Powers (DESIGN.md 3.4): Comet (four in a line), Prism Orb (five), Bloom
 * (an L or a T), Lantern Sprite (a 2 by 2 square), Starburst (a plus),
 * Moonrise (a 2 by 3 block) and Aurora (six or more in a line). Which shapes
 * count is decided by `GameState.unlocked`, so a shape is a plain match until
 * its milestone lantern on the path.
 *
 * Nothing in here uses Math.random, Date or the DOM: every choice comes from
 * the seeded RNG stream derived for the move, so a move replays identically.
 */
import { type Rng, createRng, deriveSeed } from '../shared/rng';
import type { Cell, GemType } from './grid';
import type { Gift } from './journey';

export type PowerKind =
  /** Four in a line; sweeps its row or its column. The streak shows which. */
  | 'cometRow'
  | 'cometCol'
  /** Five in a line (six or more before Aurora unlocks). No colour; clears the colour it is swapped with. */
  | 'orb'
  /** An L or a T (and a plus before Starburst unlocks). Opens on the 3 by 3 around it, rides the fall, opens once more, bigger. */
  | 'bloom'
  /** A 2 by 2 square, once unlocked. Flies to something useful and pops it and the gems touching it. */
  | 'sprite'
  /** A plus, once unlocked. Light sweeps both diagonals: an X. */
  | 'starburst'
  /** A 2 by 3 block, once unlocked. A moonbeam sweeps down a three-wide band. */
  | 'moonrise'
  /** Six or more in a line, once unlocked. No colour; clears two colours in slow waves. */
  | 'aurora';

/** The powers as they unlock along the path (both comet orientations are one family). */
export type PowerFamily = 'comet' | 'orb' | 'bloom' | 'sprite' | 'starburst' | 'moonrise' | 'aurora';
export const POWER_FAMILIES: readonly PowerFamily[] = ['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise', 'aurora'];

export function familyOf(power: PowerKind): PowerFamily {
  return power === 'cometRow' || power === 'cometCol' ? 'comet' : power;
}

/** Powers with no colour: they go off when swapped with anything. */
export function isColourless(power: PowerKind | null): boolean {
  return power === 'orb' || power === 'aurora';
}

/** What happened when two powers were swapped onto each other (DESIGN.md 3.4, combinations). */
export type Combo =
  | 'cross' // Comet + Comet: row and column at once
  | 'wideCross' // Comet + Bloom: three rows and three columns
  | 'giantBloom' // Bloom + Bloom: a 5 by 5 flower that opens twice
  | 'cometShower' // Orb + Comet: every gem of that colour becomes a comet and they fly in turn
  | 'bloomWave' // Orb + Bloom: every gem of that colour becomes a bloom and they open in a wave
  | 'sunrise' // Orb + Orb: the whole board becomes light
  | 'carry' // Sprite + another power: the sprite carries it to the best spot
  | 'twinFlight' // Sprite + Sprite: both fly to two different useful spots
  | 'eightStar' // Starburst + Comet, Starburst + Starburst: row, column and both diagonals
  | 'starShower' // Orb + Starburst: every gem of that colour becomes a starburst
  | 'wideMoon' // Moonrise + Comet: a five-wide beam plus the comet's row
  | 'moonflower' // Moonrise + Bloom: a five-wide beam that leaves flowers
  | 'moonTide' // Orb + Moonrise: a beam falls from every gem of that colour
  | 'fullMoon' // Moonrise + Moonrise: the whole board sweeps down as one beam
  | 'moonStar' // Moonrise + Starburst: the beam plus both diagonals
  | 'auroraSky' // Aurora + Aurora: the whole board, colour by colour, in waves
  | 'auroraDawn' // Aurora + Orb: the three most common colours
  | 'pair'; // any other pairing: both go off from the swap cell, one after the other

/**
 * Stage 4 pieces that are not gems (DESIGN.md 3.7). A seed falls like a gem
 * and never matches; it leaves the board from the bottom of its column. A
 * cloud puff and a bubble stay put and go when a match clears beside them
 * (or a power's light passes over them). A moonstone stays put and only a
 * power's light clears it.
 */
export type ItemKind = 'seed' | 'puff' | 'moonstone' | 'bubble';
/** Who sleeps in a bubble. */
export type Creature = 'dragon' | 'fairy' | 'hero';
export const CREATURES: readonly Creature[] = ['dragon', 'fairy', 'hero'];

export interface Piece {
  /** null only for the colourless powers (Prism Orb, Aurora) and for items. */
  readonly type: GemType | null;
  readonly power: PowerKind | null;
  /** A non-gem piece (Stage 4); absent for every gem and power. */
  readonly item?: ItemKind;
  /** A bubble's sleeper. */
  readonly creature?: Creature;
}

/** A piece that never moves: a puff, a moonstone or a bubble. */
export function isFixed(p: Piece | null): boolean {
  return !!p && (p.item === 'puff' || p.item === 'moonstone' || p.item === 'bubble');
}

/** A plain gem or a coloured power: something a match can be made of. */
export function isGem(p: Piece | null): boolean {
  return !!p && !p.item;
}

/** board[row][col]; null is an empty cell while a resolution is in progress. */
export type Board = (Piece | null)[][];

export interface GameState {
  readonly rows: number;
  readonly cols: number;
  readonly types: readonly GemType[];
  readonly board: Board;
  /** Seed for this game; each move derives its own stream from it. */
  readonly seed: number;
  /** Number of swaps resolved so far (also the RNG stream index). */
  readonly moves: number;
  /** Probability that a refill is steered toward setting up a four or five. */
  readonly bias: number;
  /**
   * Powers whose shapes count as matches. Comets are always on; before 'orb' a
   * five in a line makes a Comet. Before 'bloom' an L or T clears plainly; before 'sprite' a 2 by 2 is not a match
   * at all; before 'moonrise' a 2 by 3 clears as two lines; before 'starburst'
   * a plus makes a Bloom; before 'aurora' six in a line makes an Orb.
   */
  readonly unlocked: readonly PowerFamily[];
  /** Stage 4 (DESIGN.md 3.7): the board's shape, frost and vines; absent on a plain board. */
  readonly terrain?: Terrain;
  /** Stage 4: the level's picture goals and how far each has come; absent on a plain board (the lantern counts matches). */
  readonly goals?: readonly Goal[];
}

/**
 * The still parts of a Play board (DESIGN.md 3.7), all by [row][col]:
 * `open` false is a missing cell (a shaped board); `frost` is the layers left
 * on the cell (0, 1 or 2); `vine` holds the gem there in place until it is
 * matched; `picture` marks the cells the hidden picture shows through once
 * their frost has gone. Nothing here spreads, grows back or counts down.
 */
export interface Terrain {
  readonly open: readonly (readonly boolean[])[];
  readonly frost: readonly (readonly number[])[];
  readonly vine: readonly (readonly boolean[])[];
  readonly picture: readonly (readonly boolean[])[];
}

/** A level goal (DESIGN.md 3.7), shown as pictures: `done` of `total`. */
export type Goal =
  /** Clear every layer of frost; the hidden picture emerges. */
  | { kind: 'uncover'; total: number; done: number }
  /** Bring the star-seeds down to the bottom of the board. */
  | { kind: 'seeds'; total: number; done: number }
  /** Pop the bubbles so the creatures fly up. */
  | { kind: 'free'; total: number; done: number }
  /** Collect gems of one type. */
  | { kind: 'gather'; type: GemType; total: number; done: number };

export function goalsDone(goals: readonly Goal[] | undefined): boolean {
  return !goals || goals.every((g) => g.done >= g.total);
}

/** Is (row, col) a cell of the board (inside it and not a hole)? */
export function isOpen(state: Pick<GameState, 'rows' | 'cols' | 'terrain'>, row: number, col: number): boolean {
  if (row < 0 || col < 0 || row >= state.rows || col >= state.cols) return false;
  return state.terrain?.open[row]?.[col] ?? true;
}

export interface ClearGroup {
  readonly cells: Cell[];
  readonly type: GemType | null;
}

export type FireStep = {
  kind: 'fire';
  power: PowerKind;
  /** Where the power was when it went off. */
  at: Cell;
  /** Every cell this firing clears (the firing piece included, unless it survives: a bloom's first opening). */
  cells: Cell[];
  /** The colour cleared (orb), or the power's own colour; null for a colourless sweep. */
  color: GemType | null;
  /** Aurora: the colours it clears, in the order the waves pass. */
  colors?: GemType[];
  /** Bloom: 1 is the first opening (the bud survives and rides the fall), 2 the second, bigger one. */
  phase?: 1 | 2;
  /** Sprite: where it flies to. `cells` is what it pops there. */
  target?: Cell;
  /** Sprite: the power it carries; that power's own fire step follows, at `target`. */
  carrying?: PowerKind;
  /** Set when this firing is part of a two-power swap. */
  combo?: Combo;
  /** Fire steps that share a group go off together; otherwise they go off one after another. */
  group?: number;
};

export type Step =
  | { kind: 'swap'; a: Cell; b: Cell; valid: boolean }
  | { kind: 'clear'; cascade: number; groups: ClearGroup[]; cells: Cell[] }
  | { kind: 'create'; cell: Cell; piece: Piece }
  | FireStep
  /** Gems turn into powers in place (Orb + Comet, Orb + Bloom, Orb + Starburst, Orb + Moonrise); their fire steps follow. */
  | { kind: 'transform'; changes: Array<{ cell: Cell; piece: Piece }>; combo: Combo }
  | { kind: 'fall'; moves: Array<{ from: Cell; to: Cell }>; spawns: Array<{ to: Cell; piece: Piece; fromRow: number }> }
  | { kind: 'reshuffle'; board: Board }
  /** Stage 4: frost thinned on these cells by the clear just before (`left` layers remain). */
  | { kind: 'frost'; cells: Array<{ cell: Cell; left: number }> }
  /** Stage 4: vines released by the clear just before. */
  | { kind: 'vine'; cells: Cell[] }
  /** Stage 4: bubbles popped by the clear just before; each creature flies up. */
  | { kind: 'free'; cells: Array<{ cell: Cell; creature: Creature }> }
  /** Stage 4: seeds that reached the bottom and drifted out to sprout. */
  | { kind: 'exit'; cells: Cell[] };

export interface Resolution {
  readonly state: GameState;
  readonly steps: Step[];
  /** Number of pieces cleared by the move, cascades included. */
  readonly cleared: number;
  /** Number of cascade rounds beyond the first clear. */
  readonly cascades: number;
}

// -------------------------------------------------------------------- helpers

const key = (c: Cell): string => `${c.row},${c.col}`;
const same = (a: Cell, b: Cell): boolean => a.row === b.row && a.col === b.col;
const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
const manhattan = (c: Cell, to: { row: number; col: number }): number => Math.abs(c.row - to.row) + Math.abs(c.col - to.col);

export function at(board: Board, row: number, col: number): Piece | null {
  return board[row]?.[col] ?? null;
}

function set(board: Board, cell: Cell, piece: Piece | null): void {
  const row = board[cell.row];
  if (row) row[cell.col] = piece;
}

export function cloneBoard(board: Board): Board {
  const copy = board.map((row) => row.slice());
  const holes = holesOf.get(board);
  if (holes) holesOf.set(copy, holes);
  return copy;
}

export function gem(type: GemType): Piece {
  return { type, power: null };
}

const rowsOf = (board: Board): number => board.length;
const colsOf = (board: Board): number => board[0]?.length ?? 0;
const inBounds = (board: Board, row: number, col: number): boolean => row >= 0 && row < rowsOf(board) && col >= 0 && col < colsOf(board);
const has = (unlocked: readonly PowerFamily[], family: PowerFamily): boolean => unlocked.includes(family);

function allCells(board: Board): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < rowsOf(board); r++) for (let c = 0; c < colsOf(board); c++) out.push({ row: r, col: c });
  return out;
}

/** Cells that hold a piece (holes and cleared cells left out). */
function occupiedCells(board: Board): Cell[] {
  return allCells(board).filter((c) => at(board, c.row, c.col) !== null);
}

/** The board's centre, possibly between cells. */
function centreOf(board: Board): { row: number; col: number } {
  return { row: (rowsOf(board) - 1) / 2, col: (colsOf(board) - 1) / 2 };
}

/** The cell nearest a point; ties go to the earliest in the list, so the choice is stable. */
function nearest(cells: readonly Cell[], to: { row: number; col: number }): Cell | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const c of cells) {
    const d = manhattan(c, to);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

/** The cell nearest the bottom centre of the board; ties go to the lower row (bigger falls), then the leftmost column. */
function nearestBottomCentre(board: Board, cells: readonly Cell[]): Cell | null {
  const target = { row: rowsOf(board) - 1, col: (colsOf(board) - 1) / 2 };
  let best: Cell | null = null;
  for (const c of cells) {
    if (best === null) {
      best = c;
      continue;
    }
    const d = manhattan(c, target) - manhattan(best, target);
    if (d < 0 || (d === 0 && (c.row > best.row || (c.row === best.row && c.col < best.col)))) best = c;
  }
  return best;
}

/** Remove duplicate cells, keeping the first occurrence's order. */
function unique(cells: readonly Cell[]): Cell[] {
  const seen = new Set<string>();
  const out: Cell[] = [];
  for (const c of cells) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

// ----------------------------------------------------------- clear patterns
// The shape each power clears (DESIGN.md 3.4), clipped to the board.

/** A comet's whole row or whole column. */
function cometCells(board: Board, power: 'cometRow' | 'cometCol', c: Cell): Cell[] {
  const out: Cell[] = [];
  if (power === 'cometRow') for (let col = 0; col < colsOf(board); col++) out.push({ row: c.row, col });
  else for (let row = 0; row < rowsOf(board); row++) out.push({ row, col: c.col });
  return out;
}

/** A moonbeam: every row of the columns col-halfWidth .. col+halfWidth (three wide for a Moonrise). */
function bandCells(board: Board, col: number, halfWidth: number): Cell[] {
  const out: Cell[] = [];
  for (let row = 0; row < rowsOf(board); row++) for (let c = col - halfWidth; c <= col + halfWidth; c++) if (inBounds(board, row, c)) out.push({ row, col: c });
  return out;
}

/** The square of cells within `radius` of `c` on both axes (3 by 3 for radius 1, 5 by 5 for radius 2). */
function boxCells(board: Board, c: Cell, radius: number, withCentre: boolean): Cell[] {
  const out: Cell[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (!withCentre && dr === 0 && dc === 0) continue;
      if (inBounds(board, c.row + dr, c.col + dc)) out.push({ row: c.row + dr, col: c.col + dc });
    }
  }
  return out;
}

/** The diamond |dr| + |dc| <= radius (13 cells for radius 2: a bloom's second, bigger opening). */
function diamondCells(board: Board, c: Cell, radius: number): Cell[] {
  const out: Cell[] = [];
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (Math.abs(dr) + Math.abs(dc) > radius) continue;
      if (inBounds(board, c.row + dr, c.col + dc)) out.push({ row: c.row + dr, col: c.col + dc });
    }
  }
  return out;
}

/** Both diagonals through `c`, itself included: the Starburst's X. */
function diagonalCells(board: Board, c: Cell): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < rowsOf(board); r++) {
    for (let col = 0; col < colsOf(board); col++) {
      if (Math.abs(r - c.row) === Math.abs(col - c.col)) out.push({ row: r, col });
    }
  }
  return out;
}

/** The giant bloom's second opening: the 5 by 5 plus the four cells at distance 3 along the axes (29 cells). */
function giantSecondCells(board: Board, c: Cell): Cell[] {
  const out = boxCells(board, c, 2, true);
  for (const [dr, dc] of [[-3, 0], [3, 0], [0, -3], [0, 3]] as const) {
    if (inBounds(board, c.row + dr, c.col + dc)) out.push({ row: c.row + dr, col: c.col + dc });
  }
  return out;
}

/** The up-to-four orthogonal neighbours of a cell. */
function neighbourCells(board: Board, c: Cell): Cell[] {
  const out: Cell[] = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
    if (inBounds(board, c.row + dr, c.col + dc)) out.push({ row: c.row + dr, col: c.col + dc });
  }
  return out;
}

/** Every piece of the given colours (a coloured power counts as its colour, DESIGN.md 3.4). */
function colourCells(board: Board, colours: readonly GemType[]): Cell[] {
  const out: Cell[] = [];
  board.forEach((row, r) =>
    row.forEach((p, c) => {
      if (p?.type && colours.includes(p.type)) out.push({ row: r, col: c });
    }),
  );
  return out;
}

/** Colours present on the board, most common first; ties follow the game's type order so the choice is stable. */
function colourRanking(board: Board, types: readonly GemType[], exclude: readonly GemType[] = []): GemType[] {
  const counts = new Map<GemType, number>();
  for (const row of board) for (const p of row) if (p?.type && !exclude.includes(p.type)) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const order = (t: GemType): number => {
    const i = types.indexOf(t);
    return i < 0 ? types.length : i;
  };
  return [...counts.entries()].sort((x, y) => y[1] - x[1] || order(x[0]) - order(y[0])).map((e) => e[0]);
}

// ------------------------------------------------------------------ creation

/** The default for boards made outside the journey, and for saves from before unlocks existed. */
export const BASE_UNLOCKED: readonly PowerFamily[] = ['comet', 'orb'];

export function newGame(rows: number, cols: number, types: readonly GemType[], seed: number, bias = 0.3, unlocked: readonly PowerFamily[] = BASE_UNLOCKED): GameState {
  const rng = createRng(deriveSeed(seed, 0));
  for (let attempt = 0; attempt < 200; attempt++) {
    const board: Board = Array.from({ length: rows }, () => Array<Piece | null>(cols).fill(null));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        set(board, { row: r, col: c }, gem(pickNoMatch(board, r, c, types, rng, bias, unlocked)));
      }
    }
    const state: GameState = { rows, cols, types, board, seed, moves: 0, bias, unlocked };
    if (!hasAnyMatch(board, unlocked) && findValidSwaps(state).length > 0) return state;
  }
  throw new Error('could not create a board with a valid move');
}

/**
 * Stage 4: what a Play level starts with (DESIGN.md 3.7), made by the level
 * generator in levels.ts: the shape, frost, vines, the picture window, the
 * items in place and the goals. `newLevel` deals the gems around it.
 */
export interface LevelSpec {
  rows: number;
  cols: number;
  types: readonly GemType[];
  bias: number;
  terrain: Terrain;
  items: Array<{ cell: Cell; piece: Piece }>;
  goals: Goal[];
}

/** A fresh board for a level: items and vines where the spec puts them, gems dealt around them with no match and at least one move. */
export function newLevel(spec: LevelSpec, seed: number, unlocked: readonly PowerFamily[] = BASE_UNLOCKED): GameState {
  const rng = createRng(deriveSeed(seed, 0));
  const { rows, cols, types, bias, terrain } = spec;
  for (let attempt = 0; attempt < 200; attempt++) {
    const board: Board = Array.from({ length: rows }, () => Array<Piece | null>(cols).fill(null));
    setHoles(board, terrain.open);
    for (const it of spec.items) set(board, it.cell, it.piece);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (isHole(board, r, c) || at(board, r, c) !== null) continue;
        set(board, { row: r, col: c }, gem(pickNoMatch(board, r, c, types, rng, bias, unlocked)));
      }
    }
    const state: GameState = { rows, cols, types, board, seed, moves: 0, bias, unlocked, terrain, goals: spec.goals.map((g) => ({ ...g })) };
    if (!hasAnyMatch(board, unlocked) && findValidSwaps(state).length > 0) return state;
  }
  throw new Error('could not create a level board with a valid move');
}

/** A type for (row, col) that completes no match, biased toward setting up pairs when asked. */
function pickNoMatch(board: Board, row: number, col: number, types: readonly GemType[], rng: Rng, bias: number, unlocked: readonly PowerFamily[]): GemType {
  const candidates = types.slice();
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = candidates[i] as GemType;
    candidates[i] = candidates[j] as GemType;
    candidates[j] = t;
  }
  if (bias > 0 && rng.chance(bias)) {
    // Prefer a type that makes a pair with a settled neighbour: pairs are what four- and five-matches grow from.
    const neighbours = [at(board, row, col - 1), at(board, row, col + 1), at(board, row + 1, col), at(board, row - 1, col)]
      .map((p) => p?.type ?? null)
      .filter((t): t is GemType => t !== null);
    candidates.sort((a, b) => Number(neighbours.includes(b)) - Number(neighbours.includes(a)));
  }
  const cell = { row, col };
  for (const type of candidates) {
    set(board, cell, gem(type));
    if (!matchAt(board, row, col, unlocked)) return type;
  }
  set(board, cell, null);
  return candidates[0] as GemType;
}

// ------------------------------------------------------------------ matching

function lineThrough(board: Board, row: number, col: number): boolean {
  const type = at(board, row, col)?.type ?? null;
  if (type === null) return false;
  let run = 1;
  for (let c = col - 1; at(board, row, c)?.type === type; c--) run++;
  for (let c = col + 1; at(board, row, c)?.type === type; c++) run++;
  if (run >= 3) return true;
  run = 1;
  for (let r = row - 1; at(board, r, col)?.type === type; r--) run++;
  for (let r = row + 1; at(board, r, col)?.type === type; r++) run++;
  return run >= 3;
}

/** The type of the 2 by 2 whose top-left corner is (row, col), if all four pieces share one. */
function squareTypeAt(board: Board, row: number, col: number): GemType | null {
  const t = at(board, row, col)?.type ?? null;
  if (t === null) return null;
  if (at(board, row, col + 1)?.type !== t) return null;
  if (at(board, row + 1, col)?.type !== t) return null;
  if (at(board, row + 1, col + 1)?.type !== t) return null;
  return t;
}

function squareThrough(board: Board, row: number, col: number): boolean {
  for (const dr of [-1, 0]) for (const dc of [-1, 0]) if (squareTypeAt(board, row + dr, col + dc) !== null) return true;
  return false;
}

/** Does a line, or (once the Sprite is unlocked) a 2 by 2 square, pass through (row, col)? */
function matchAt(board: Board, row: number, col: number, unlocked: readonly PowerFamily[]): boolean {
  return lineThrough(board, row, col) || (has(unlocked, 'sprite') && squareThrough(board, row, col));
}

/** Does the settled board hold any match at all? The invariant every fresh board, refill and reshuffle keeps. */
export function hasAnyMatch(board: Board, unlocked: readonly PowerFamily[]): boolean {
  return findLines(board).length > 0 || (has(unlocked, 'sprite') && findSquares(board).length > 0);
}

export interface Line {
  cells: Cell[];
  type: GemType;
  horizontal: boolean;
}

/** Every maximal horizontal or vertical run of three or more same-typed pieces. */
export function findLines(board: Board): Line[] {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const lines: Line[] = [];
  const typeAt = (r: number, c: number): GemType | null => at(board, r, c)?.type ?? null;
  for (let r = 0; r < rows; r++) {
    let start = 0;
    for (let c = 1; c <= cols; c++) {
      const t = typeAt(r, start);
      if (!(c < cols && t !== null && typeAt(r, c) === t)) {
        if (c - start >= 3 && t !== null) lines.push({ cells: Array.from({ length: c - start }, (_, i) => ({ row: r, col: start + i })), type: t, horizontal: true });
        start = c;
      }
    }
  }
  for (let c = 0; c < cols; c++) {
    let start = 0;
    for (let r = 1; r <= rows; r++) {
      const t = typeAt(start, c);
      if (!(r < rows && t !== null && typeAt(r, c) === t)) {
        if (r - start >= 3 && t !== null) lines.push({ cells: Array.from({ length: r - start }, (_, i) => ({ row: start + i, col: c })), type: t, horizontal: false });
        start = r;
      }
    }
  }
  return lines;
}

export interface Square {
  /** Top-left, top-right, bottom-left, bottom-right. */
  cells: Cell[];
  type: GemType;
}

/** Every 2 by 2 block of same-typed pieces (the Lantern Sprite's shape, DESIGN.md 3.4). */
export function findSquares(board: Board): Square[] {
  const out: Square[] = [];
  for (let r = 0; r + 1 < rowsOf(board); r++) {
    for (let c = 0; c + 1 < colsOf(board); c++) {
      const type = squareTypeAt(board, r, c);
      if (type !== null) out.push({ cells: [{ row: r, col: c }, { row: r, col: c + 1 }, { row: r + 1, col: c }, { row: r + 1, col: c + 1 }], type });
    }
  }
  return out;
}

/**
 * One match on the board: lines of one type that share a cell (an L, a T, a
 * plus), two parallel adjacent lines forming a block (once Moonrise is
 * unlocked), or a square group (once the Sprite is unlocked). The clear and
 * the power it makes are decided per group by `powerFor`.
 */
export interface MatchGroup {
  readonly cells: Cell[];
  readonly type: GemType;
  readonly lines: Line[];
  /** Length of the longest line in the group (0 for a square group). */
  readonly longest: number;
  /** Orientation of the longest line, for the comet it may make. */
  readonly horizontal: boolean;
  /** Two parallel, adjacent lines of the same span: a 2 by n block (only formed once Moonrise is unlocked). */
  readonly block: boolean;
  /** Cells where a horizontal and a vertical line of the group cross. */
  readonly crossings: Cell[];
  /** A crossing interior to both lines: a plus. */
  readonly plus: boolean;
  /** Made only of 2 by 2 squares that touch no line. */
  readonly square: boolean;
}

/** Two parallel lines of the same type and span, side by side: the Moonrise block (DESIGN.md 3.4). */
function parallelAdjacent(a: Line, b: Line): boolean {
  if (a.horizontal !== b.horizontal || a.cells.length !== b.cells.length) return false;
  const a0 = a.cells[0] as Cell;
  const b0 = b.cells[0] as Cell;
  return a.horizontal ? Math.abs(a0.row - b0.row) === 1 && a0.col === b0.col : Math.abs(a0.col - b0.col) === 1 && a0.row === b0.row;
}

/** Every match on the board, grouped (DESIGN.md 3.4 shapes, gated by `unlocked`). */
export function findGroups(board: Board, unlocked: readonly PowerFamily[]): MatchGroup[] {
  const lines = findLines(board);
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => {
    let x = i;
    while ((parent[x] as number) !== x) x = parent[x] as number;
    return x;
  };
  const union = (i: number, j: number): void => {
    parent[find(i)] = find(j);
  };
  const keys = lines.map((l) => new Set(l.cells.map(key)));
  const blockLines = new Set<number>();
  const moonrise = has(unlocked, 'moonrise');
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i] as Line;
      const b = lines[j] as Line;
      if (a.type !== b.type) continue;
      if (b.cells.some((c) => (keys[i] as Set<string>).has(key(c)))) union(i, j);
      else if (moonrise && parallelAdjacent(a, b)) {
        union(i, j);
        blockLines.add(i);
        blockLines.add(j);
      }
    }
  }

  const byRoot = new Map<number, number[]>();
  lines.forEach((_, i) => {
    const r = find(i);
    const list = byRoot.get(r) ?? [];
    list.push(i);
    byRoot.set(r, list);
  });

  const groups: Array<{ cells: Map<string, Cell>; type: GemType; lines: Line[]; block: boolean; square: boolean }> = [];
  for (const members of byRoot.values()) {
    const cells = new Map<string, Cell>();
    const groupLines: Line[] = [];
    let block = false;
    for (const i of members) {
      const line = lines[i] as Line;
      groupLines.push(line);
      line.cells.forEach((c) => cells.set(key(c), c));
      if (blockLines.has(i)) block = true;
    }
    groups.push({ cells, type: (groupLines[0] as Line).type, lines: groupLines, block, square: false });
  }

  if (has(unlocked, 'sprite')) {
    // A square touching a line group is absorbed by it: its cells outside every line join that group (never a
    // cell another group already holds, so a 2 by 3 before Moonrise stays two lines). The rest form Sprite groups.
    const inLine = new Set<string>();
    for (const g of groups) for (const k of g.cells.keys()) inLine.add(k);
    const free: Square[] = [];
    for (const sq of findSquares(board)) {
      const host = groups.find((g) => g.type === sq.type && sq.cells.some((c) => g.cells.has(key(c))));
      if (!host) {
        free.push(sq);
        continue;
      }
      for (const c of sq.cells) {
        if (inLine.has(key(c))) continue;
        inLine.add(key(c));
        host.cells.set(key(c), c);
      }
    }
    const used = new Set<number>();
    free.forEach((sq, i) => {
      if (used.has(i)) return;
      used.add(i);
      const cells = new Map<string, Cell>();
      sq.cells.forEach((c) => cells.set(key(c), c));
      let grew = true;
      while (grew) {
        grew = false;
        free.forEach((other, j) => {
          if (used.has(j) || other.type !== sq.type || !other.cells.some((c) => cells.has(key(c)))) return;
          used.add(j);
          other.cells.forEach((c) => cells.set(key(c), c));
          grew = true;
        });
      }
      groups.push({ cells, type: sq.type, lines: [], block: false, square: true });
    });
  }

  return groups.map((g) => {
    let longest = 0;
    let horizontal = true;
    for (const l of g.lines) {
      if (l.cells.length > longest) {
        longest = l.cells.length;
        horizontal = l.horizontal;
      }
    }
    const crossings: Cell[] = [];
    let plus = false;
    for (const h of g.lines.filter((l) => l.horizontal)) {
      for (const v of g.lines.filter((l) => !l.horizontal)) {
        const shared = h.cells.find((c) => v.cells.some((d) => same(c, d)));
        if (!shared) continue;
        crossings.push(shared);
        const hEnd = same(shared, h.cells[0] as Cell) || same(shared, h.cells[h.cells.length - 1] as Cell);
        const vEnd = same(shared, v.cells[0] as Cell) || same(shared, v.cells[v.cells.length - 1] as Cell);
        if (!hEnd && !vEnd) plus = true;
      }
    }
    return { cells: [...g.cells.values()], type: g.type, lines: g.lines, longest, horizontal, block: g.block, crossings, plus, square: g.square };
  });
}

/**
 * The power a match group makes, or null for a plain clear (DESIGN.md 3.4).
 * Priority: six or more (Aurora, once unlocked) > five (Orb) > a block
 * (Moonrise) > lines meeting: a plus (Starburst), else Bloom, else a four in
 * it still makes a Comet > a single four (Comet) > a square (Sprite).
 * Used by both resolution and hint strength so the two can never disagree.
 */
export function powerFor(group: MatchGroup, unlocked: readonly PowerFamily[]): PowerKind | null {
  if (group.square) return has(unlocked, 'sprite') ? 'sprite' : null;
  const { longest, horizontal } = group;
  if (longest >= 6 && has(unlocked, 'aurora')) return 'aurora';
  if (longest >= 5 && has(unlocked, 'orb')) return 'orb';
  if (group.block && has(unlocked, 'moonrise')) return 'moonrise';
  const comet: PowerKind = horizontal ? 'cometRow' : 'cometCol';
  if (group.crossings.length > 0) {
    if (group.plus && has(unlocked, 'starburst')) return 'starburst';
    if (has(unlocked, 'bloom')) return 'bloom';
  }
  return longest >= 4 ? comet : null;
}

/** The piece a group's power becomes: colourless for an Orb or Aurora, the group's colour otherwise. */
function pieceFor(power: PowerKind, type: GemType): Piece {
  return isColourless(power) ? { type: null, power } : { type, power };
}

/**
 * Where a new power sits: the swapped cell when it is in the group (first
 * round only), else the crossing of an L, T or plus, else the cell nearest
 * the group's centroid.
 */
function anchorFor(group: MatchGroup, swapCells: readonly Cell[]): Cell {
  const swapped = group.cells.find((c) => swapCells.some((s) => same(s, c)));
  if (swapped) return swapped;
  const centroid = {
    row: group.cells.reduce((n, c) => n + c.row, 0) / group.cells.length,
    col: group.cells.reduce((n, c) => n + c.col, 0) / group.cells.length,
  };
  if (group.crossings.length > 0) return nearest(group.crossings, centroid) as Cell;
  return nearest(group.cells, centroid) as Cell;
}

// --------------------------------------------------------------------- swaps

/**
 * Is swapping a and b a legal move? A colourless power swaps with anything,
 * two powers always swap, and otherwise the swap must complete a line (or a
 * square, once the Sprite is unlocked) through one of the two cells.
 */
/** Is the gem at `c` held by a vine? */
export function vined(state: Pick<GameState, 'terrain'>, c: Cell): boolean {
  return state.terrain?.vine[c.row]?.[c.col] ?? false;
}

export function isValidSwap(state: GameState, a: Cell, b: Cell): boolean {
  if (!adjacent(a, b)) return false;
  const pa = at(state.board, a.row, a.col);
  const pb = at(state.board, b.row, b.col);
  if (!pa || !pb) return false;
  // Stage 4: puffs, moonstones and bubbles stay put, and a vine holds its gem in place.
  if (isFixed(pa) || isFixed(pb) || vined(state, a) || vined(state, b)) return false;
  if (isColourless(pa.power) || isColourless(pb.power)) return true;
  if (pa.power && pb.power) return true; // two powers swapped set each other off
  if (pa.type === pb.type) return false;
  const board = cloneBoard(state.board);
  set(board, a, pb);
  set(board, b, pa);
  return matchAt(board, a.row, a.col, state.unlocked) || matchAt(board, b.row, b.col, state.unlocked);
}

export interface SwapOption {
  a: Cell;
  b: Cell;
  /** 7: combines two powers; 6: sets off a power already on the board; 5: makes an Orb or Aurora; 4: makes any other power; 3: a plain match (DESIGN.md 3.3, hints). */
  strength: number;
}

export function findValidSwaps(state: GameState): SwapOption[] {
  const out: SwapOption[] = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const a = { row: r, col: c };
      for (const b of [{ row: r, col: c + 1 }, { row: r + 1, col: c }]) {
        if (b.row >= state.rows || b.col >= state.cols) continue;
        if (!isValidSwap(state, a, b)) continue;
        out.push({ a, b, strength: swapStrength(state, a, b) });
      }
    }
  }
  return out;
}

/** Hint strength (DESIGN.md 3.3: set off a power > make a power > any swap), from the same `powerFor` the resolution uses. */
function swapStrength(state: GameState, a: Cell, b: Cell): number {
  const pa = at(state.board, a.row, a.col);
  const pb = at(state.board, b.row, b.col);
  // Two powers together outrank a power set off alone, so a combination gift's hint always shows the combination.
  if (pa?.power && pb?.power) return 7;
  if (isColourless(pa?.power ?? null) || isColourless(pb?.power ?? null)) return 6;
  const board = cloneBoard(state.board);
  set(board, a, pb);
  set(board, b, pa);
  let best = 0;
  for (const group of findGroups(board, state.unlocked)) {
    if (!group.cells.some((c) => same(c, a) || same(c, b))) continue;
    if (group.cells.some((c) => at(board, c.row, c.col)?.power)) return 6;
    const power = powerFor(group, state.unlocked);
    best = Math.max(best, power === null ? 3 : isColourless(power) ? 5 : 4);
  }
  return best;
}

/** The swap a hint should show: the strongest, with ties broken toward the middle of the board. */
export function bestHint(state: GameState): SwapOption | null {
  const swaps = findValidSwaps(state);
  if (swaps.length === 0) return null;
  const midR = (state.rows - 1) / 2;
  const midC = (state.cols - 1) / 2;
  const dist = (s: SwapOption): number => Math.abs(s.a.row - midR) + Math.abs(s.a.col - midC);
  // Stage 4: among swaps of one strength, the one nearest the level's goals (DESIGN.md 3.7).
  const want = goalCells(state);
  const near = (s: SwapOption): number => {
    let n = 0;
    for (const c of [s.a, s.b]) for (const [dr, dc] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]] as const) if (want.has(key({ row: c.row + dr, col: c.col + dc }))) n++;
    return n;
  };
  swaps.sort((x, y) => y.strength - x.strength || near(y) - near(x) || dist(x) - dist(y));
  return swaps[0] ?? null;
}

/**
 * Stage 4: the cells a goal wants cleared or reached: frosted cells, the
 * neighbours of puffs, bubbles and moonstones, the column under each seed,
 * and gems of a gather goal's type. Empty on a plain board.
 */
export function goalCells(state: GameState): Set<string> {
  const out = new Set<string>();
  if (!state.goals) return out;
  const t = state.terrain;
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const p = at(state.board, r, c);
      if (t && (t.frost[r]?.[c] ?? 0) > 0) out.add(key({ row: r, col: c }));
      if (p?.item === 'puff' || p?.item === 'bubble' || p?.item === 'moonstone') for (const n of neighbourCells(state.board, { row: r, col: c })) out.add(key(n));
      if (p?.item === 'seed') for (let q = r + 1; q < state.rows; q++) out.add(key({ row: q, col: c }));
      for (const g of state.goals) if (g.kind === 'gather' && g.done < g.total && p?.type === g.type && !p.item) out.add(key({ row: r, col: c }));
    }
  }
  return out;
}

// ---------------------------------------------------------------- resolution

/** Everything a resolution in progress needs; one per `applySwap` or `firePowerAt`. */
interface Ctx {
  readonly state: GameState;
  readonly board: Board;
  readonly rng: Rng;
  readonly steps: Step[];
  /** Cells that clear at the end of this round, in the order they were added. */
  readonly round: Map<string, Cell>;
  /** Power cells that have already gone off this round. */
  readonly fired: Set<string>;
  /**
   * Buds that have opened once and will open again, bigger, after the fall (a
   * giant bud opens bigger still), keyed by the cell they sit in. The fall
   * step's moves carry a bud to its new cell, so no piece identity is needed.
   */
  readonly pending: Map<string, { cell: Cell; kind: 'bloom' | 'giant' }>;
  nextGroup: number;
  /** Stage 4: the terrain as it changes through the move (frost thins, vines go). */
  readonly frost: number[][] | null;
  readonly vine: boolean[][] | null;
  readonly goals: Goal[] | null;
}

function makeCtx(state: GameState): Ctx {
  return {
    state,
    board: cloneBoard(state.board),
    rng: createRng(deriveSeed(state.seed, state.moves + 1)),
    steps: [],
    round: new Map(),
    fired: new Set(),
    pending: new Map(),
    nextGroup: 1,
    frost: state.terrain ? state.terrain.frost.map((r) => r.slice()) : null,
    vine: state.terrain ? state.terrain.vine.map((r) => r.slice()) : null,
    goals: state.goals ? state.goals.map((g) => ({ ...g })) : null,
  };
}

/** Advance a goal of one kind by n (nothing if the level has no such goal). */
function progress(ctx: Ctx, kind: Goal['kind'], n: number, type: GemType | null = null): void {
  if (!ctx.goals || n <= 0) return;
  for (const g of ctx.goals) {
    if (g.kind !== kind) continue;
    if (g.kind === 'gather' && g.type !== type) continue;
    g.done = Math.min(g.total, g.done + n);
  }
}

type Extra = Partial<Pick<FireStep, 'combo' | 'group'>>;

/** Record a firing and put its cells into the round. Marking the firing piece as fired is the caller's job. */
function emit(ctx: Ctx, step: FireStep): void {
  // Light passes over holes and empty cells, and a seed is never cleared: it is the thing to bring down.
  step.cells = step.cells.filter((c) => {
    const p = at(ctx.board, c.row, c.col);
    return p !== null && p.item !== 'seed';
  });
  ctx.steps.push(step);
  for (const c of step.cells) ctx.round.set(key(c), c);
}

/**
 * The cells a coloured power clears from `c`, for a power fired in place, in a
 * pair or carried by a sprite. A bloom here opens once, as its 13-cell
 * diamond; an aurora takes `otherColour` (the power it was paired with) plus
 * the most common other colour.
 */
function patternOf(ctx: Ctx, piece: Piece, c: Cell, otherColour: GemType | null = null): Pick<FireStep, 'cells' | 'color' | 'colors'> {
  const { board, state } = ctx;
  switch (piece.power) {
    case 'cometRow':
    case 'cometCol':
      return { cells: cometCells(board, piece.power, c), color: piece.type };
    case 'bloom':
      return { cells: diamondCells(board, c, 2), color: piece.type };
    case 'starburst':
      return { cells: diagonalCells(board, c), color: piece.type };
    case 'moonrise':
      return { cells: bandCells(board, c.col, 1), color: piece.type };
    case 'orb': {
      const colour = otherColour ?? colourRanking(board, state.types)[0] ?? null;
      return { cells: unique([c, ...(colour ? colourCells(board, [colour]) : [])]), color: colour };
    }
    case 'aurora': {
      const colors = otherColour ? [otherColour, ...colourRanking(board, state.types, [otherColour]).slice(0, 1)] : colourRanking(board, state.types).slice(0, 2);
      return { cells: unique([c, ...colourCells(board, colors)]), color: colors[0] ?? null, colors };
    }
    default:
      return { cells: [c], color: piece.type };
  }
}

/** Set off the power at `cell` as a match or another power's light would (DESIGN.md 3.4, "Setting a power off"). */
function fireAt(ctx: Ctx, cell: Cell, extra: Extra = {}): void {
  const p = at(ctx.board, cell.row, cell.col);
  if (!p?.power) return;
  ctx.fired.add(key(cell));
  switch (p.power) {
    case 'bloom':
      fireBloom(ctx, cell, p, extra);
      return;
    case 'sprite':
      fireSprite(ctx, cell, p, extra);
      return;
    default:
      emit(ctx, { kind: 'fire', power: p.power, at: cell, ...patternOf(ctx, p, cell), ...extra });
  }
}

/** The Orb: every piece of one colour, plus itself. */
function fireOrb(ctx: Ctx, cell: Cell, colour: GemType | null, extra: Extra = {}): void {
  ctx.fired.add(key(cell));
  emit(ctx, { kind: 'fire', power: 'orb', at: cell, cells: unique([cell, ...(colour ? colourCells(ctx.board, [colour]) : [])]), color: colour, ...extra });
}

/** The Aurora: every piece of the given colours, in that order of waves, plus itself. */
function fireAurora(ctx: Ctx, cell: Cell, colors: GemType[], extra: Extra = {}): void {
  ctx.fired.add(key(cell));
  emit(ctx, { kind: 'fire', power: 'aurora', at: cell, cells: unique([cell, ...colourCells(ctx.board, colors)]), color: colors[0] ?? null, colors, ...extra });
}

/**
 * The Bloom (DESIGN.md 3.4): the first opening clears the 3 by 3 around the
 * bud but not the bud itself, which rides the fall and opens again, bigger
 * (the 13-cell diamond) at the start of the next round. A bud caught again by
 * light before then opens big right there. A giant bud (Bloom + Bloom) opens
 * the 5 by 5 first and 29 cells second.
 */
function fireBloom(ctx: Ctx, cell: Cell, piece: Piece, extra: Extra = {}): void {
  const pending = ctx.pending.get(key(cell));
  if (pending) {
    ctx.pending.delete(key(cell));
    const cells = pending.kind === 'giant' ? giantSecondCells(ctx.board, cell) : diamondCells(ctx.board, cell, 2);
    emit(ctx, { kind: 'fire', power: 'bloom', at: cell, cells, color: piece.type, phase: 2, ...(pending.kind === 'giant' ? { combo: 'giantBloom' as const } : {}), ...extra });
    return;
  }
  emit(ctx, { kind: 'fire', power: 'bloom', at: cell, cells: boxCells(ctx.board, cell, 1, false), color: piece.type, phase: 1, ...extra });
  ctx.round.delete(key(cell)); // the bud survives this round
  ctx.pending.set(key(cell), { cell, kind: 'bloom' });
}

/**
 * The Lantern Sprite (DESIGN.md 3.4) flies to something useful. Until Stage 4
 * brings goal pieces, useful means the gem whose popping starts the biggest
 * cascade; it pops that gem and its four neighbours.
 */
function fireSprite(ctx: Ctx, cell: Cell, piece: Piece, extra: Extra = {}): void {
  ctx.round.set(key(cell), cell);
  const target = usefulItem(ctx) ?? chooseTarget(ctx, (c) => [c, ...neighbourCells(ctx.board, c)]);
  const cells = target ? unique([cell, target, ...neighbourCells(ctx.board, target)]) : [cell];
  emit(ctx, { kind: 'fire', power: 'sprite', at: cell, cells, color: piece.type, ...(target ? { target } : {}), ...extra });
}

/**
 * Stage 4: the most useful goal piece for a sprite to pop (DESIGN.md 3.7): a
 * moonstone first (only light clears them), then a bubble, then a cloud puff,
 * then a cell still under two layers of frost; nearest the bottom centre among
 * equals. Null on a board with none of them.
 */
function usefulItem(ctx: Ctx): Cell | null {
  const { board, state } = ctx;
  const free = (c: Cell): boolean => !ctx.round.has(key(c));
  for (const item of ['moonstone', 'bubble', 'puff'] as const) {
    const cells = occupiedCells(board).filter((c) => at(board, c.row, c.col)?.item === item && free(c));
    if (cells.length > 0) return nearestBottomCentre(board, cells);
  }
  if (state.terrain) {
    const frost = state.terrain.frost;
    const thick = occupiedCells(board).filter((c) => (frost[c.row]?.[c.col] ?? 0) >= 2 && free(c) && isGem(at(board, c.row, c.col)));
    if (thick.length > 0) return nearestBottomCentre(board, thick);
  }
  return null;
}

/**
 * How many cells end up in lines after `removed` is cleared and the pieces
 * above fall, with no refill: the measure of "something useful" for a sprite.
 */
export function cascadeScore(board: Board, removed: readonly Cell[]): number {
  const b = cloneBoard(board);
  for (const c of removed) set(b, c, null);
  settle(b);
  const cells = new Set<string>();
  for (const line of findLines(b)) for (const c of line.cells) cells.add(key(c));
  return cells.size;
}

/**
 * The sprite's target: among gems not already in the round and holding no
 * power, the one whose removal pattern (with everything already in the round)
 * scores the most line cells; ties go to the lower row (bigger falls), then
 * the column nearest the centre. If nothing scores, the gem of the most
 * common colour nearest the bottom centre. No randomness.
 */
function chooseTarget(ctx: Ctx, removalFor: (c: Cell) => Cell[]): Cell | null {
  const { board } = ctx;
  const candidates = allCells(board).filter((c) => {
    const p = at(board, c.row, c.col);
    return p !== null && p.power === null && isGem(p) && !ctx.round.has(key(c));
  });
  if (candidates.length === 0) return null;
  const base = [...ctx.round.values()];
  const midC = (colsOf(board) - 1) / 2;
  let best: Cell | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    const score = cascadeScore(board, [...base, ...removalFor(c)]);
    const better = best === null || score > bestScore || (score === bestScore && (c.row > best.row || (c.row === best.row && Math.abs(c.col - midC) < Math.abs(best.col - midC))));
    if (better) {
      best = c;
      bestScore = score;
    }
  }
  if (bestScore > 0) return best;
  const colour = colourRanking(board, ctx.state.types)[0];
  const ofColour = candidates.filter((c) => at(board, c.row, c.col)?.type === colour);
  return nearestBottomCentre(board, ofColour.length > 0 ? ofColour : candidates);
}

/** A gem of the board's most common colour, nearest the bottom centre, for a sprite carrying an orb or aurora. */
function commonGemTarget(ctx: Ctx): { target: Cell; colour: GemType } | null {
  const { board } = ctx;
  const colour = colourRanking(board, ctx.state.types)[0];
  if (!colour) return null;
  const candidates = allCells(board).filter((c) => {
    const p = at(board, c.row, c.col);
    return p !== null && p.power === null && isGem(p) && p.type === colour && !ctx.round.has(key(c));
  });
  const target = nearestBottomCentre(board, candidates);
  return target ? { target, colour } : null;
}

/**
 * Two powers swapped onto each other (DESIGN.md 3.4, "Combining two
 * powers"). `x` is the cell the moved piece landed on; both power cells
 * clear. Every fire step carries the combo; steps that share a group go off
 * together, the rest one after another. No pairing is ever a dud.
 */
function resolveComboSwap(ctx: Ctx, a: Cell, x: Cell): void {
  const { board, state, rng } = ctx;
  const px = at(board, x.row, x.col) as Piece;
  const pa = at(board, a.row, a.col) as Piece;
  const fx = familyOf(px.power as PowerKind);
  const fa = familyOf(pa.power as PowerKind);
  for (const c of [a, x]) {
    ctx.round.set(key(c), c);
    ctx.fired.add(key(c));
  }
  const is = (f: PowerFamily, g: PowerFamily): boolean => (fx === f && fa === g) || (fx === g && fa === f);
  const one = (f: PowerFamily): Piece => (fx === f ? px : pa);
  const cellOf = (p: Piece): Cell => (p === px ? x : a);
  const otherOf = (p: Piece): Piece => (p === px ? pa : px);
  const group = ctx.nextGroup++;
  const fire = (step: Omit<FireStep, 'kind'>): void => emit(ctx, { kind: 'fire', ...step });
  const every = allCells(board);

  if (is('sprite', 'sprite')) {
    // Twin flight: both fly, to two different useful spots (the second sees the first's cells in the round).
    for (const p of [px, pa]) {
      const from = cellOf(p);
      const target = chooseTarget(ctx, (c) => [c, ...neighbourCells(board, c)]);
      const cells = target ? [from, target, ...neighbourCells(board, target)] : [from];
      fire({ power: 'sprite', at: from, cells, color: p.type, ...(target ? { target } : {}), combo: 'twinFlight', group });
    }
    return;
  }

  if (fx === 'sprite' || fa === 'sprite') {
    // Carry: the sprite takes the other power to the best spot and sets it off there.
    const sprite = one('sprite');
    const other = otherOf(sprite);
    const from = cellOf(sprite);
    const kind = other.power as PowerKind;
    if (isColourless(kind)) {
      const found = commonGemTarget(ctx);
      if (!found) {
        fire({ power: kind, at: x, ...patternOf(ctx, other, x), combo: 'carry' });
        return;
      }
      fire({ power: 'sprite', at: from, target: found.target, cells: [], color: sprite.type, carrying: kind, combo: 'carry' });
      if (kind === 'orb') fire({ power: 'orb', at: found.target, cells: unique([found.target, ...colourCells(board, [found.colour])]), color: found.colour, combo: 'carry' });
      else {
        const colors = [found.colour, ...colourRanking(board, state.types, [found.colour]).slice(0, 1)];
        fire({ power: 'aurora', at: found.target, cells: unique([found.target, ...colourCells(board, colors)]), color: found.colour, colors, combo: 'carry' });
      }
      return;
    }
    const target = chooseTarget(ctx, (c) => patternOf(ctx, other, c).cells);
    if (!target) {
      fire({ power: kind, at: x, ...patternOf(ctx, other, x), combo: 'carry' });
      return;
    }
    fire({ power: 'sprite', at: from, target, cells: [], color: sprite.type, carrying: kind, combo: 'carry' });
    fire({ power: kind, at: target, ...patternOf(ctx, other, target), combo: 'carry' });
    return;
  }

  if (is('orb', 'orb')) {
    fire({ power: 'orb', at: x, cells: every, color: null, combo: 'sunrise' });
    return;
  }

  if (is('orb', 'aurora')) {
    const colors = colourRanking(board, state.types).slice(0, 3);
    fire({ power: 'aurora', at: x, cells: unique([a, x, ...colourCells(board, colors)]), color: colors[0] ?? null, colors, combo: 'auroraDawn' });
    return;
  }

  if (fx === 'orb' || fa === 'orb') {
    // Showers: every plain gem of the other power's colour becomes that power, and they all go off.
    const other = otherOf(one('orb'));
    const family = familyOf(other.power as PowerKind);
    const combo: Combo = family === 'comet' ? 'cometShower' : family === 'bloom' ? 'bloomWave' : family === 'starburst' ? 'starShower' : 'moonTide';
    const colour = other.type as GemType;
    const changes: Array<{ cell: Cell; piece: Piece }> = [];
    for (const c of every) {
      const p = at(board, c.row, c.col);
      if (!p || p.power !== null || p.type !== colour) continue;
      // Comet orientation is the move's random stream, roughly half and half.
      const power: PowerKind = family === 'comet' ? (rng.chance(0.5) ? 'cometRow' : 'cometCol') : (other.power as PowerKind);
      const piece: Piece = { type: colour, power };
      set(board, c, piece);
      changes.push({ cell: c, piece });
    }
    ctx.steps.push({ kind: 'transform', changes, combo });
    const order = [cellOf(other), ...changes.map((ch) => ch.cell)].sort((p, q) => manhattan(p, x) - manhattan(q, x) || p.row - q.row || p.col - q.col);
    for (const c of order) {
      const p = at(board, c.row, c.col) as Piece;
      ctx.fired.add(key(c));
      // Comets fly in turn (no group); blooms, starbursts and moonrises go off together as one wave.
      const cells = family === 'bloom' ? boxCells(board, c, 1, true) : patternOf(ctx, p, c).cells;
      fire({ power: p.power as PowerKind, at: c, cells, color: colour, combo, ...(family === 'comet' ? {} : { group }) });
    }
    return;
  }

  if (is('aurora', 'aurora')) {
    const colors = colourRanking(board, state.types);
    fire({ power: 'aurora', at: x, cells: every, color: colors[0] ?? null, colors, combo: 'auroraSky' });
    return;
  }

  if (is('comet', 'comet')) {
    fire({ power: 'cometRow', at: x, cells: cometCells(board, 'cometRow', x), color: px.type, combo: 'cross', group });
    fire({ power: 'cometCol', at: x, cells: cometCells(board, 'cometCol', x), color: pa.type, combo: 'cross', group });
    return;
  }

  if (is('comet', 'bloom')) {
    const colour = one('comet').type;
    for (let r = x.row - 1; r <= x.row + 1; r++) {
      if (inBounds(board, r, x.col)) fire({ power: 'cometRow', at: { row: r, col: x.col }, cells: cometCells(board, 'cometRow', { row: r, col: x.col }), color: colour, combo: 'wideCross', group });
    }
    for (let c = x.col - 1; c <= x.col + 1; c++) {
      if (inBounds(board, x.row, c)) fire({ power: 'cometCol', at: { row: x.row, col: c }, cells: cometCells(board, 'cometCol', { row: x.row, col: c }), color: colour, combo: 'wideCross', group });
    }
    return;
  }

  if (is('bloom', 'bloom')) {
    // Giant bloom: the bud now at x opens the 5 by 5 around it, survives, and opens bigger after the fall.
    fire({ power: 'bloom', at: x, cells: boxCells(board, x, 2, false), color: px.type, phase: 1, combo: 'giantBloom' });
    ctx.round.delete(key(x));
    ctx.pending.set(key(x), { cell: x, kind: 'giant' });
    return;
  }

  if (is('starburst', 'comet') || is('starburst', 'starburst')) {
    const star = one('starburst');
    const other = otherOf(star);
    const twin = is('starburst', 'starburst');
    fire({ power: 'cometRow', at: x, cells: cometCells(board, 'cometRow', x), color: other.type, combo: 'eightStar', group });
    fire({ power: 'cometCol', at: x, cells: cometCells(board, 'cometCol', x), color: other.type, combo: 'eightStar', group });
    fire({ power: 'starburst', at: x, cells: unique([...diagonalCells(board, x), ...(twin ? boxCells(board, x, 1, true) : [])]), color: star.type, combo: 'eightStar', group });
    return;
  }

  if (is('moonrise', 'comet')) {
    fire({ power: 'moonrise', at: x, cells: bandCells(board, x.col, 2), color: one('moonrise').type, combo: 'wideMoon', group });
    fire({ power: 'cometRow', at: x, cells: cometCells(board, 'cometRow', x), color: one('comet').type, combo: 'wideMoon', group });
    return;
  }

  if (is('moonrise', 'bloom')) {
    fire({ power: 'moonrise', at: x, cells: unique([...bandCells(board, x.col, 2), ...boxCells(board, x, 2, true)]), color: one('moonrise').type, combo: 'moonflower' });
    return;
  }

  if (is('moonrise', 'moonrise')) {
    fire({ power: 'moonrise', at: x, cells: every, color: px.type, combo: 'fullMoon' });
    return;
  }

  if (is('moonrise', 'starburst')) {
    fire({ power: 'moonrise', at: x, cells: bandCells(board, x.col, 1), color: one('moonrise').type, combo: 'moonStar', group });
    fire({ power: 'starburst', at: x, cells: diagonalCells(board, x), color: one('starburst').type, combo: 'moonStar', group });
    return;
  }

  // Any other pairing: both go off from x, one after the other, each with its own pattern.
  for (const p of [px, pa]) {
    fire({ power: p.power as PowerKind, at: x, ...patternOf(ctx, p, x, otherOf(p).type), combo: 'pair' });
  }
}

/**
 * Resolve rounds until the board is quiet: pending buds open, matches are
 * found and the powers they make are decided, powers caught in the round go
 * off (chaining until stable), the round clears, new powers are placed, and
 * the pieces fall. `swapCells` anchor first-round creations.
 */
function runRounds(ctx: Ctx, swapCells: readonly Cell[]): { cleared: number; cascades: number } {
  const { board, state, round, fired, pending, steps } = ctx;
  let cleared = 0;
  let cascade = 0;
  let roundStart = 0;
  for (;;) {
    // Buds that opened last round open again where they landed (a bud that opened before this round began waits for the fall).
    if (cascade > 0) for (const [k, bud] of [...pending.entries()]) {
      const piece = at(board, bud.cell.row, bud.cell.col);
      if (piece?.power === 'bloom') {
        fired.add(k);
        fireBloom(ctx, bud.cell, piece);
      } else pending.delete(k);
    }

    const groups = findGroups(board, state.unlocked);
    const creations: Array<{ cells: Cell[]; anchor: Cell; piece: Piece }> = [];
    for (const g of groups) {
      for (const c of g.cells) round.set(key(c), c);
      const power = powerFor(g, state.unlocked);
      if (power) creations.push({ cells: g.cells, anchor: anchorFor(g, cascade === 0 ? swapCells : []), piece: pieceFor(power, g.type) });
      // Stage 4: a match beside a cloud puff or a bubble clears it too (DESIGN.md 3.7).
      for (const c of g.cells) {
        for (const n of neighbourCells(board, c)) {
          const p = at(board, n.row, n.col);
          if (p && (p.item === 'puff' || p.item === 'bubble')) round.set(key(n), n);
        }
      }
    }

    // Chain: any power whose cell is in the round and has not gone off yet goes off, until stable.
    // A power at a creation anchor fires too; the new power is placed after the clear.
    let chained = true;
    while (chained) {
      chained = false;
      for (const c of [...round.values()]) {
        if (!round.has(key(c))) continue; // a bud removed itself after this snapshot
        const p = at(board, c.row, c.col);
        if (!p?.power) continue;
        if (fired.has(key(c)) && !pending.has(key(c))) continue; // a pending bud caught again opens big right here
        chained = true;
        fireAt(ctx, c);
      }
    }

    if (round.size === 0) break;

    // A fire step lists only what the round really clears (a surviving bud drops out).
    for (let i = roundStart; i < steps.length; i++) {
      const st = steps[i];
      if (st?.kind === 'fire') st.cells = st.cells.filter((c) => round.has(key(c)));
    }

    const cells = [...round.values()];
    // One clear group per match (the app counts them toward the lantern); a surviving bud drops out of its group's cells.
    const clearGroups: ClearGroup[] = groups.map((g) => ({ cells: g.cells.filter((c) => round.has(key(c))), type: g.type }));
    removeCells(ctx, cells, clearGroups, cascade);
    cleared += cells.length;
    for (const cr of creations) {
      let cell: Cell | null = cr.anchor;
      if (at(board, cell.row, cell.col) !== null) {
        // A bud survived at the anchor: the new power takes the nearest cleared cell of its group.
        cell = nearest(cr.cells.filter((c) => at(board, c.row, c.col) === null), cr.anchor);
      }
      if (!cell) continue;
      set(board, cell, cr.piece);
      steps.push({ kind: 'create', cell, piece: cr.piece });
    }
    round.clear();
    fired.clear();

    const dropped = dropAndExit(ctx);
    // Surviving buds ride the fall: follow each to the cell it landed in.
    if (pending.size > 0) {
      const landed = new Map(dropped.moves.map((m) => [key(m.from), m.to]));
      const buds = [...pending.values()];
      pending.clear();
      for (const bud of buds) {
        const cell = landed.get(key(bud.cell)) ?? bud.cell;
        pending.set(key(cell), { cell, kind: bud.kind });
      }
    }
    cascade++;
    roundStart = steps.length;
  }
  return { cleared, cascades: Math.max(0, cascade - 1) };
}

/**
 * Take `cells` off the board as one clear step, with what the clear does to
 * the still parts of the board and to the goals (Stage 4): a bubble among
 * them frees its sleeper, frost under them thins by a layer, vines on them
 * go, and gems of a gathered colour count.
 */
function removeCells(ctx: Ctx, cells: Cell[], groups: ClearGroup[], cascade: number): void {
  const { board, steps } = ctx;
  steps.push({ kind: 'clear', cascade, groups: groups.length > 0 ? groups : [{ cells, type: null }], cells });
  const freed: Array<{ cell: Cell; creature: Creature }> = [];
  const thinned: Array<{ cell: Cell; left: number }> = [];
  const released: Cell[] = [];
  for (const c of cells) {
    const p = at(board, c.row, c.col);
    if (p?.item === 'bubble') freed.push({ cell: c, creature: p.creature ?? 'fairy' });
    if (p && isGem(p) && p.type) progress(ctx, 'gather', 1, p.type);
    if (ctx.frost && (ctx.frost[c.row]?.[c.col] ?? 0) > 0) {
      const left = (ctx.frost[c.row] as number[])[c.col] = ((ctx.frost[c.row] as number[])[c.col] as number) - 1;
      thinned.push({ cell: c, left });
    }
    if (ctx.vine?.[c.row]?.[c.col]) {
      (ctx.vine[c.row] as boolean[])[c.col] = false;
      released.push(c);
    }
  }
  for (const c of cells) set(board, c, null);
  if (freed.length > 0) {
    steps.push({ kind: 'free', cells: freed });
    progress(ctx, 'free', freed.length);
  }
  if (thinned.length > 0) {
    steps.push({ kind: 'frost', cells: thinned });
    progress(ctx, 'uncover', thinned.length);
  }
  if (released.length > 0) steps.push({ kind: 'vine', cells: released });
}

/** Fill the empties with a fall; then a seed that reached the bottom of its column drifts out, and the column fills behind it (Stage 4). */
function dropAndExit(ctx: Ctx): FallStep {
  const { board, state, steps } = ctx;
  const dropped = fall(board, state.types, ctx.rng, state.bias, state.unlocked, ctx.vine);
  steps.push(dropped);
  const exits = seedExits(board);
  if (exits.length > 0) {
    for (const c of exits) set(board, c, null);
    steps.push({ kind: 'exit', cells: exits });
    progress(ctx, 'seeds', exits.length);
    steps.push(fall(board, state.types, ctx.rng, state.bias, state.unlocked, ctx.vine));
  }
  return dropped;
}

/** Close a resolution: advance the move count and reshuffle if the board has no move left (DESIGN.md 3.3, dead ends). */
function finish(ctx: Ctx, result: { cleared: number; cascades: number }): Resolution {
  let next: GameState = { ...ctx.state, board: ctx.board, moves: ctx.state.moves + 1 };
  if (ctx.state.terrain && ctx.frost && ctx.vine) next = { ...next, terrain: { ...ctx.state.terrain, frost: ctx.frost, vine: ctx.vine } };
  if (ctx.goals) next = { ...next, goals: ctx.goals };
  if (findValidSwaps(next).length === 0) {
    const shuffled = reshuffleBoard(next, ctx.rng);
    if (shuffled) {
      next = { ...next, board: shuffled };
      ctx.steps.push({ kind: 'reshuffle', board: cloneBoard(shuffled) });
    }
  }
  return { state: next, steps: ctx.steps, cleared: result.cleared, cascades: result.cascades };
}

/** Resolve a swap. An invalid swap returns the same state with a single invalid swap step. */
export function applySwap(state: GameState, a: Cell, b: Cell): Resolution {
  if (!isValidSwap(state, a, b)) {
    return { state, steps: [{ kind: 'swap', a, b, valid: false }], cleared: 0, cascades: 0 };
  }
  const ctx = makeCtx(state);
  const { board } = ctx;
  ctx.steps.push({ kind: 'swap', a, b, valid: true });
  const pa = at(board, a.row, a.col) as Piece;
  const pb = at(board, b.row, b.col) as Piece;
  set(board, a, pb);
  set(board, b, pa); // the moved piece lands on b

  if (pa.power && pb.power) resolveComboSwap(ctx, a, b);
  else if (isColourless(pa.power) || isColourless(pb.power)) {
    // A colourless power swapped with a gem clears that gem's colour (the Aurora adds the most common other colour).
    const here = isColourless(pa.power) ? b : a;
    const gemPiece = isColourless(pa.power) ? pb : pa;
    const colourless = isColourless(pa.power) ? pa : pb;
    const colour = gemPiece.type;
    if (colourless.power === 'orb') fireOrb(ctx, here, colour);
    else fireAurora(ctx, here, colour ? [colour, ...colourRanking(board, state.types, [colour]).slice(0, 1)] : colourRanking(board, state.types).slice(0, 2));
  }

  return finish(ctx, runRounds(ctx, [a, b]));
}

/**
 * Set off the power at `cell` as if the finishing light touched it (no swap),
 * then resolve falls and cascades exactly like a move. Used when the lantern
 * fills before a gift has been set off (DESIGN.md 3.4). A cell without a
 * power returns the state unchanged with no steps.
 */
export function firePowerAt(state: GameState, cell: Cell): Resolution {
  if (!at(state.board, cell.row, cell.col)?.power) return { state, steps: [], cleared: 0, cascades: 0 };
  const ctx = makeCtx(state);
  fireAt(ctx, cell);
  return finish(ctx, runRounds(ctx, []));
}

/**
 * The moon's help in the sleepy stretch of a Play level (DESIGN.md 3.8): one
 * small step toward the goal, given after each of her moves so the level
 * resolves within the window. In turn: a layer of frost melts off the
 * thickest cell, a bubble pops free, whatever sits under the lowest star-seed
 * is taken so the seed drops a row, or one gem of a gathered colour is taken.
 * Null when there is nothing left to help with (or no goals at all).
 */
export function moonHelp(state: GameState): Resolution | null {
  if (!state.goals || goalsDone(state.goals)) return null;
  const ctx = makeCtx(state);
  const { board } = ctx;
  const loose = (c: Cell): boolean => {
    const p = at(board, c.row, c.col);
    return p !== null && isGem(p) && !ctx.vine?.[c.row]?.[c.col];
  };
  const left = (kind: Goal['kind']): boolean => ctx.goals!.some((g) => g.kind === kind && g.done < g.total);

  if (left('uncover') && ctx.frost) {
    let best: Cell | null = null;
    let depth = 0;
    ctx.frost.forEach((row, r) => row.forEach((n, c) => { if (n > depth) { depth = n; best = { row: r, col: c }; } }));
    if (best) {
      const b: Cell = best;
      (ctx.frost[b.row] as number[])[b.col] = depth - 1;
      ctx.steps.push({ kind: 'frost', cells: [{ cell: b, left: depth - 1 }] });
      progress(ctx, 'uncover', 1);
      return finish(ctx, runRounds(ctx, []));
    }
  }
  if (left('free')) {
    const bubbles = allCells(board).filter((c) => at(board, c.row, c.col)?.item === 'bubble');
    const b = bubbles[bubbles.length - 1];
    if (b) {
      removeCells(ctx, [b], [{ cells: [b], type: null }], 0);
      dropAndExit(ctx);
      return finish(ctx, runRounds(ctx, []));
    }
  }
  if (left('seeds')) {
    const seeds = allCells(board).filter((c) => at(board, c.row, c.col)?.item === 'seed').reverse();
    for (const sd of seeds) {
      const under = { row: sd.row + 1, col: sd.col };
      const p = under.row < rowsOf(board) ? at(board, under.row, under.col) : null;
      // Whatever sits under the seed goes, a cloud puff or a moonstone included (the moon's light clears those as a power's would).
      if (p && p.item !== 'seed') {
        removeCells(ctx, [under], [{ cells: [under], type: isGem(p) ? p.type : null }], 0);
        dropAndExit(ctx);
        return finish(ctx, runRounds(ctx, []));
      }
    }
  }
  for (const g of ctx.goals!) {
    if (g.kind !== 'gather' || g.done >= g.total) continue;
    const gems = allCells(board).filter((c) => loose(c) && at(board, c.row, c.col)?.type === g.type);
    const c = gems[gems.length - 1];
    if (!c) continue;
    removeCells(ctx, [c], [{ cells: [c], type: g.type }], 0);
    dropAndExit(ctx);
    return finish(ctx, runRounds(ctx, []));
  }
  return null;
}

/**
 * "Finish now, gently" in a Play level (DESIGN.md 3.8): the goal resolves
 * first, so the level's own reward is never skipped. The frost melts off the
 * picture layer by layer, the vines let go, every bubble floats free, the
 * seeds drift down and sprout, the gathered colour counts as found; then the
 * board fills behind them. A level without goals returns unchanged.
 */
export function resolveLevel(state: GameState): Resolution {
  if (!state.goals || goalsDone(state.goals)) return { state, steps: [], cleared: 0, cascades: 0 };
  const ctx = makeCtx(state);
  const { board } = ctx;
  if (ctx.frost) {
    for (;;) {
      const thinned: Array<{ cell: Cell; left: number }> = [];
      ctx.frost.forEach((row, r) => row.forEach((n, c) => {
        if (n > 0) {
          row[c] = n - 1;
          thinned.push({ cell: { row: r, col: c }, left: n - 1 });
        }
      }));
      if (thinned.length === 0) break;
      ctx.steps.push({ kind: 'frost', cells: thinned });
      progress(ctx, 'uncover', thinned.length);
    }
  }
  if (ctx.vine) {
    const released: Cell[] = [];
    ctx.vine.forEach((row, r) => row.forEach((v, c) => {
      if (v) {
        row[c] = false;
        released.push({ row: r, col: c });
      }
    }));
    if (released.length > 0) ctx.steps.push({ kind: 'vine', cells: released });
  }
  const bubbles = allCells(board).filter((c) => at(board, c.row, c.col)?.item === 'bubble');
  if (bubbles.length > 0) removeCells(ctx, bubbles, [{ cells: bubbles, type: null }], 0);
  const seeds = allCells(board).filter((c) => at(board, c.row, c.col)?.item === 'seed');
  if (seeds.length > 0) {
    for (const c of seeds) set(board, c, null);
    ctx.steps.push({ kind: 'exit', cells: seeds });
    progress(ctx, 'seeds', seeds.length);
  }
  // The gathered colour: the gems still wanted are taken off the board, so the icons see them counted.
  const gathered: Cell[] = [];
  for (const g of ctx.goals!) {
    if (g.kind !== 'gather' || g.done >= g.total) continue;
    const want = g.total - g.done;
    const gems = allCells(board).filter((c) => { const p = at(board, c.row, c.col); return p !== null && isGem(p) && p.type === g.type; });
    gathered.push(...gems.slice(-want));
  }
  if (gathered.length > 0) removeCells(ctx, gathered, [{ cells: gathered, type: null }], 0);
  if (bubbles.length > 0 || seeds.length > 0 || gathered.length > 0) dropAndExit(ctx);
  for (const g of ctx.goals!) g.done = g.total;
  return finish(ctx, runRounds(ctx, []));
}

// --------------------------------------------------------------------- falls

/**
 * Holes on a shaped board are kept as a module-level side table keyed by the
 * board object, so the pure helpers that only see a Board (settle, the
 * patterns) can still tell a hole from an empty cell. A board without an
 * entry has no holes.
 */
const holesOf = new WeakMap<Board, ReadonlySet<string>>();

/** Mark the holes of a board (and of boards cloned from it later by `cloneBoard`). */
function setHoles(board: Board, open: Terrain['open'] | undefined): void {
  if (!open) return;
  const holes = new Set<string>();
  open.forEach((row, r) => row.forEach((v, c) => { if (!v) holes.add(key({ row: r, col: c })); }));
  if (holes.size > 0) holesOf.set(board, holes);
}

function isHole(board: Board, row: number, col: number): boolean {
  return holesOf.get(board)?.has(key({ row, col })) ?? false;
}

/** Gravity only, in place: every piece drops to the lowest empty cell below it. A hole, a fixed piece or a vined gem is a floor. */
function settle(board: Board, vine: readonly (readonly boolean[])[] | null = null): Array<{ from: Cell; to: Cell }> {
  const moves: Array<{ from: Cell; to: Cell }> = [];
  for (let c = 0; c < colsOf(board); c++) {
    let write = rowsOf(board) - 1;
    for (let r = rowsOf(board) - 1; r >= 0; r--) {
      const p = at(board, r, c);
      if (isHole(board, r, c) || isFixed(p) || (p && vine?.[r]?.[c])) {
        write = r - 1;
        continue;
      }
      if (!p) continue;
      if (write !== r) {
        set(board, { row: write, col: c }, p);
        set(board, { row: r, col: c }, null);
        moves.push({ from: { row: r, col: c }, to: { row: write, col: c } });
      }
      write--;
    }
  }
  return moves;
}

/** Seeds sitting at the bottom of their column (nothing but holes beneath them): they leave the board. */
function seedExits(board: Board): Cell[] {
  const out: Cell[] = [];
  for (let c = 0; c < colsOf(board); c++) {
    for (let r = 0; r < rowsOf(board); r++) {
      if (at(board, r, c)?.item !== 'seed') continue;
      let floor = true;
      for (let q = r + 1; q < rowsOf(board); q++) if (!isHole(board, q, c)) floor = false;
      if (floor) out.push({ row: r, col: c });
    }
  }
  return out;
}

type FallStep = Extract<Step, { kind: 'fall' }>;

/** Gravity and refill, in place. Survivors settle first; refills see the whole final layout. */
function fall(board: Board, types: readonly GemType[], rng: Rng, bias: number, unlocked: readonly PowerFamily[], vine: readonly (readonly boolean[])[] | null = null): FallStep {
  const moves = settle(board, vine);
  const spawns: Array<{ to: Cell; piece: Piece; fromRow: number }> = [];
  for (let c = 0; c < colsOf(board); c++) {
    // Each run of cells between floors (holes, fixed pieces, vined gems) fills from its own top: a gem under a cloud drops out of the cloud.
    let r = 0;
    while (r < rowsOf(board)) {
      if (isHole(board, r, c) || isFixed(at(board, r, c)) || (at(board, r, c) && vine?.[r]?.[c])) {
        r++;
        continue;
      }
      const top = r;
      let n = 0;
      while (r < rowsOf(board) && at(board, r, c) === null && !isHole(board, r, c)) {
        n++;
        r++;
      }
      for (let q = top + n - 1; q >= top; q--) {
        const piece = gem(pickRefill(board, q, c, types, rng, bias, unlocked));
        set(board, { row: q, col: c }, piece);
        spawns.push({ to: { row: q, col: c }, piece, fromRow: q - n });
      }
      // Skip the settled pieces of this run.
      while (r < rowsOf(board) && at(board, r, c) !== null && !isFixed(at(board, r, c)) && !vine?.[r]?.[c] && !isHole(board, r, c)) r++;
    }
  }
  return { kind: 'fall', moves, spawns };
}

/**
 * A refill type. Plain refills are random, so cascades happen naturally.
 * With probability `bias` the type is steered toward making a pair with a
 * neighbour without completing a match, which sets up fours and fives for
 * her next move (DESIGN.md 3.4, "Making powers happen often").
 */
function pickRefill(board: Board, row: number, col: number, types: readonly GemType[], rng: Rng, bias: number, unlocked: readonly PowerFamily[]): GemType {
  if (bias > 0 && rng.chance(bias)) {
    const neighbours = [at(board, row, col - 1), at(board, row, col + 1), at(board, row + 1, col)]
      .map((p) => p?.type ?? null)
      .filter((t): t is GemType => t !== null);
    const options = neighbours.filter((t) => {
      set(board, { row, col }, gem(t));
      const ok = !matchAt(board, row, col, unlocked);
      set(board, { row, col }, null);
      return ok;
    });
    if (options.length > 0) return rng.pick(options);
  }
  return rng.pick(types);
}

// ------------------------------------------------------------------ reshuffle

/**
 * Rearrange the pieces (powers included) so the board has no match and at
 * least one valid swap (DESIGN.md 3.3, dead ends). The bag is shuffled and
 * dealt cell by cell, each cell taking the first piece that completes no
 * match there, so even a four-type board nearly always settles first time.
 */
export function reshuffleBoard(state: GameState, rng: Rng): Board | null {
  // Stage 4: items, vined gems and holes stay where they are; only the loose gems and powers are dealt again.
  const loose = (c: Cell): boolean => {
    const p = at(state.board, c.row, c.col);
    return p !== null && !p.item && !vined(state, c);
  };
  const slots = allCells(state.board).filter(loose);
  const pieces: Piece[] = slots.map((c) => at(state.board, c.row, c.col) as Piece);
  for (let attempt = 0; attempt < 200; attempt++) {
    const bag = pieces.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = bag[i] as Piece;
      bag[i] = bag[j] as Piece;
      bag[j] = t;
    }
    const board = cloneBoard(state.board);
    for (const cell of slots) set(board, cell, null);
    let dealt = true;
    for (const cell of slots) {
      let found = -1;
      for (let i = 0; i < bag.length && found < 0; i++) {
        set(board, cell, bag[i] as Piece);
        if (!matchAt(board, cell.row, cell.col, state.unlocked)) found = i;
      }
      if (found < 0) {
        dealt = false;
        break;
      }
      set(board, cell, bag[found] as Piece);
      bag.splice(found, 1);
    }
    if (!dealt) continue;
    const candidate = { ...state, board };
    if (!hasAnyMatch(board, state.unlocked) && findValidSwaps(candidate).length > 0) return board;
  }
  return null;
}

/** Make sure a loaded or fresh state has a move; reshuffle if not. */
export function ensurePlayable(state: GameState): { state: GameState; reshuffled: boolean } {
  if (findValidSwaps(state).length > 0) return { state, reshuffled: false };
  const board = reshuffleBoard(state, createRng(deriveSeed(state.seed, state.moves + 1000)));
  if (!board) return { state, reshuffled: false };
  return { state: { ...state, board }, reshuffled: true };
}

export function isFull(board: Board): boolean {
  return board.every((row) => row.every((p) => p !== null));
}

// --------------------------------------------------------------------- gifts

/** Every power on the board, optionally of one family. */
export function findPowers(board: Board, family?: PowerFamily): Array<{ cell: Cell; piece: Piece }> {
  const out: Array<{ cell: Cell; piece: Piece }> = [];
  board.forEach((row, r) =>
    row.forEach((p, c) => {
      if (p?.power && (!family || familyOf(p.power) === family)) out.push({ cell: { row: r, col: c }, piece: p });
    }),
  );
  return out;
}

/** A family's piece for a gem of `type`: colourless for Orb and Aurora, a comet with a random orientation, else the family itself. */
function giftPiece(family: PowerFamily, type: GemType, rng: Rng): Piece {
  if (family === 'orb' || family === 'aurora') return { type: null, power: family };
  if (family === 'comet') return { type, power: rng.chance(0.5) ? 'cometRow' : 'cometCol' };
  return { type, power: family };
}

/**
 * Seat a milestone gift on a fresh board (DESIGN.md 3.4, "How she discovers
 * them") so that one swap sets it off, without changing any gem's type, so
 * the no-match invariants still hold. A colourless power replaces the gem
 * nearest the centre (any swap fires it). A coloured power is given to a gem
 * that a plain swap would put into a line, as near the centre as possible,
 * so that swap then has hint strength 6. A combo gift turns two adjacent
 * central gems into the two powers; swapping them is always valid. Returns
 * the cells that hold the gift.
 */
export function placeGift(state: GameState, gift: Gift, rng: Rng): { state: GameState; cells: Cell[] } {
  const centre = centreOf(state.board);
  // Stage 4: a gift sits on a loose gem, never on an item or a vined gem.
  const occupied = allCells(state.board).filter((c) => isGem(at(state.board, c.row, c.col)) && !vined(state, c));
  const byCentre = (cells: readonly Cell[]): Cell[] => cells.slice().sort((p, q) => manhattan(p, centre) - manhattan(q, centre) || p.row - q.row || p.col - q.col);

  if (gift.kind === 'combo') {
    for (const c1 of byCentre(occupied)) {
      const c2 = nearest(neighbourCells(state.board, c1).filter((c) => isGem(at(state.board, c.row, c.col)) && !vined(state, c)), centre);
      if (!c2) continue;
      const board = cloneBoard(state.board);
      set(board, c1, giftPiece(gift.a, (at(board, c1.row, c1.col) as Piece).type as GemType, rng));
      set(board, c2, giftPiece(gift.b, (at(board, c2.row, c2.col) as Piece).type as GemType, rng));
      const next = { ...state, board };
      if (!hasAnyMatch(board, state.unlocked) && findValidSwaps(next).some((s) => s.strength >= 6)) return { state: next, cells: [c1, c2] };
    }
    return { state, cells: [] };
  }

  if (gift.family === 'orb' || gift.family === 'aurora') {
    const cell = byCentre(occupied)[0];
    if (!cell) return { state, cells: [] };
    const board = cloneBoard(state.board);
    set(board, cell, { type: null, power: gift.family });
    return { state: { ...state, board }, cells: [cell] };
  }

  // A coloured power: find the lines plain swaps complete, and give a gem in one of them the power at its pre-swap position.
  const candidates: Array<{ pre: Cell }> = [];
  const seen = new Set<string>();
  for (const swap of findValidSwaps(state)) {
    const pa = at(state.board, swap.a.row, swap.a.col) as Piece;
    const pb = at(state.board, swap.b.row, swap.b.col) as Piece;
    if (pa.power || pb.power) continue;
    const board = cloneBoard(state.board);
    set(board, swap.a, pb);
    set(board, swap.b, pa);
    for (const g of findGroups(board, state.unlocked)) {
      if (!g.cells.some((c) => same(c, swap.a) || same(c, swap.b))) continue;
      for (const c of g.cells) {
        // The piece at c after the swap came from the other swap cell if c is one of them.
        const pre = same(c, swap.a) ? swap.b : same(c, swap.b) ? swap.a : c;
        if (seen.has(key(pre))) continue;
        seen.add(key(pre));
        candidates.push({ pre });
      }
    }
  }
  for (const pre of byCentre(candidates.map((c) => c.pre))) {
    const piece = at(state.board, pre.row, pre.col) as Piece;
    if (!piece.type || piece.item || vined(state, pre)) continue;
    const board = cloneBoard(state.board);
    set(board, pre, giftPiece(gift.family, piece.type, rng));
    const next = { ...state, board };
    if (!hasAnyMatch(board, state.unlocked) && findValidSwaps(next).some((s) => s.strength >= 6)) return { state: next, cells: [pre] };
  }
  return { state, cells: [] };
}

// ---------------------------------------------------------------------- save

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState | null {
  try {
    const s = JSON.parse(json) as GameState;
    if (!s || !Array.isArray(s.board) || typeof s.rows !== 'number' || typeof s.cols !== 'number') return null;
    setHoles(s.board, s.terrain?.open);
    // Saves from before unlocks existed carry the two starting powers.
    if (!Array.isArray(s.unlocked)) return { ...s, unlocked: BASE_UNLOCKED };
    return s;
  } catch {
    return null;
  }
}
