/**
 * The game core: pure, deterministic, and testable without a browser.
 *
 * A GameState holds the board. `applySwap` returns a new state plus an
 * ordered list of Steps that describe exactly what happened, in the order
 * the presentation should show it: the swap, each clear with the cascade
 * depth, powers created and fired, every fall, and any reshuffle.
 *
 * Powers (DESIGN.md 3.4): Comet (four in a line), Prism Orb (five), Bloom
 * (an L or a T), Lantern Sprite (a 2 by 2 square), Starburst (a plus),
 * Moonrise (a 2 by 3 block) and Aurora (six or more in a line). Which shapes
 * count is decided by `GameState.unlocked`, so a shape is a plain match until
 * its milestone lantern on the path.
 */
import { type Rng, createRng, deriveSeed } from '../shared/rng';
import type { Cell, GemType } from './grid';

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

export interface Piece {
  /** null only for the colourless powers (Prism Orb, Aurora). */
  readonly type: GemType | null;
  readonly power: PowerKind | null;
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
   * Powers whose shapes count as matches. Comets and orbs are always on. Before
   * 'bloom' an L or T clears plainly; before 'sprite' a 2 by 2 is not a match
   * at all; before 'moonrise' a 2 by 3 clears as two lines; before 'starburst'
   * a plus makes a Bloom; before 'aurora' six in a line makes an Orb.
   */
  readonly unlocked: readonly PowerFamily[];
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
  | { kind: 'reshuffle'; board: Board };

export interface Resolution {
  readonly state: GameState;
  readonly steps: Step[];
  /** Number of pieces cleared by the move, cascades included. */
  readonly cleared: number;
  /** Number of cascade rounds beyond the first clear. */
  readonly cascades: number;
}

const key = (c: Cell): string => `${c.row},${c.col}`;
const same = (a: Cell, b: Cell): boolean => a.row === b.row && a.col === b.col;
const adjacent = (a: Cell, b: Cell): boolean => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;

export function at(board: Board, row: number, col: number): Piece | null {
  return board[row]?.[col] ?? null;
}

function set(board: Board, cell: Cell, piece: Piece | null): void {
  const row = board[cell.row];
  if (row) row[cell.col] = piece;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.slice());
}

export function gem(type: GemType): Piece {
  return { type, power: null };
}

// ----------------------------------------------------------------- creation

/** The two powers every path starts with. */
export const BASE_UNLOCKED: readonly PowerFamily[] = ['comet', 'orb'];

export function newGame(rows: number, cols: number, types: readonly GemType[], seed: number, bias = 0.3, unlocked: readonly PowerFamily[] = BASE_UNLOCKED): GameState {
  const rng = createRng(deriveSeed(seed, 0));
  for (let attempt = 0; attempt < 200; attempt++) {
    const board: Board = Array.from({ length: rows }, () => Array<Piece | null>(cols).fill(null));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        set(board, { row: r, col: c }, gem(pickNoLine(board, r, c, types, rng, bias)));
      }
    }
    const state: GameState = { rows, cols, types, board, seed, moves: 0, bias, unlocked };
    if (findLines(board).length === 0 && findValidSwaps(state).length > 0) return state;
  }
  throw new Error('could not create a board with a valid move');
}

/** A type for (row, col) that completes no line, biased toward setting up pairs when asked. */
function pickNoLine(board: Board, row: number, col: number, types: readonly GemType[], rng: Rng, bias: number): GemType {
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
    if (!lineThrough(board, row, col)) return type;
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

/** Is swapping a and b a legal move? Orbs swap with anything; otherwise the swap must complete a line. */
export function isValidSwap(state: GameState, a: Cell, b: Cell): boolean {
  if (!adjacent(a, b)) return false;
  const pa = at(state.board, a.row, a.col);
  const pb = at(state.board, b.row, b.col);
  if (!pa || !pb) return false;
  if (pa.power === 'orb' || pb.power === 'orb') return true;
  if (pa.power && pb.power) return true; // two powers swapped set each other off
  if (pa.type === pb.type) return false;
  const board = cloneBoard(state.board);
  set(board, a, pb);
  set(board, b, pa);
  return lineThrough(board, a.row, a.col) || lineThrough(board, b.row, b.col);
}

export interface SwapOption {
  a: Cell;
  b: Cell;
  /** Longest line the swap completes (5 for an orb swap), used to rank hints. */
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

/** 6: sets off a power already on the board; 5: makes an orb; 4: makes a comet; 3: a plain three. */
function swapStrength(state: GameState, a: Cell, b: Cell): number {
  const pa = at(state.board, a.row, a.col);
  const pb = at(state.board, b.row, b.col);
  if (pa?.power === 'orb' || pb?.power === 'orb') return 6;
  if (pa?.power && pb?.power) return 6;
  const board = cloneBoard(state.board);
  set(board, a, pb);
  set(board, b, pa);
  let best = 0;
  for (const line of findLines(board)) {
    if (!line.cells.some((c) => same(c, a) || same(c, b))) continue;
    if (line.cells.some((c) => at(board, c.row, c.col)?.power)) return 6;
    best = Math.max(best, line.cells.length);
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
  swaps.sort((x, y) => y.strength - x.strength || dist(x) - dist(y));
  return swaps[0] ?? null;
}

// ---------------------------------------------------------------- resolution

/** Resolve a swap. An invalid swap returns the same state with a single invalid swap step. */
export function applySwap(state: GameState, a: Cell, b: Cell): Resolution {
  if (!isValidSwap(state, a, b)) {
    return { state, steps: [{ kind: 'swap', a, b, valid: false }], cleared: 0, cascades: 0 };
  }
  const rng = createRng(deriveSeed(state.seed, state.moves + 1));
  const board = cloneBoard(state.board);
  const steps: Step[] = [{ kind: 'swap', a, b, valid: true }];
  const pa = at(board, a.row, a.col) as Piece;
  const pb = at(board, b.row, b.col) as Piece;
  set(board, a, pb);
  set(board, b, pa);

  let cleared = 0;
  let cascade = 0;
  // Pieces to clear in this round, with a reason, and powers to fire.
  const round = new Map<string, Cell>();
  const fired = new Set<string>();

  // Power swaps resolve before line matching.
  const orbA = pb.power === 'orb' ? a : pa.power === 'orb' ? null : null;
  const orbB = pa.power === 'orb' ? b : null;
  const orbCell = orbA ?? orbB; // where the orb now sits
  if (orbCell) {
    const other = same(orbCell, a) ? b : a;
    const otherPiece = at(board, other.row, other.col) as Piece;
    if (otherPiece.power === 'orb') {
      // Orb + Orb: the whole board becomes light.
      const cells: Cell[] = [];
      for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) cells.push({ row: r, col: c });
      steps.push({ kind: 'fire', power: 'orb', at: orbCell, cells, color: null });
      cells.forEach((c) => round.set(key(c), c));
      fired.add(key(orbCell));
      fired.add(key(other));
    } else {
      fireOrb(board, orbCell, otherPiece.type, round, fired, steps);
    }
  } else {
    // Swapping two comets sets both off.
    if (pa.power && pb.power) {
      fireComet(board, b, round, fired, steps);
      fireComet(board, a, round, fired, steps);
    }
  }

  for (;;) {
    const lines = findLines(board);
    const creations: Array<{ cell: Cell; piece: Piece }> = [];
    const groups: ClearGroup[] = [];
    if (lines.length > 0) {
      // Group overlapping lines (an L or T) into one clear group.
      const used = new Set<number>();
      lines.forEach((line, i) => {
        if (used.has(i)) return;
        used.add(i);
        const cells = new Map<string, Cell>();
        line.cells.forEach((c) => cells.set(key(c), c));
        let longest = line.cells.length;
        let horizontal = line.horizontal;
        let grew = true;
        while (grew) {
          grew = false;
          lines.forEach((other, j) => {
            if (used.has(j) || other.type !== line.type) return;
            if (other.cells.some((c) => cells.has(key(c)))) {
              used.add(j);
              other.cells.forEach((c) => cells.set(key(c), c));
              if (other.cells.length > longest) {
                longest = other.cells.length;
                horizontal = other.horizontal;
              }
              grew = true;
            }
          });
        }
        const list = [...cells.values()];
        groups.push({ cells: list, type: line.type });
        // Power creation: five or more makes an Orb, four a Comet, at the swapped cell when it is in the group.
        if (longest >= 4 && cascade === 0 ? true : longest >= 4) {
          const anchor = list.find((c) => (cascade === 0 && (same(c, a) || same(c, b)))) ?? list[Math.floor(list.length / 2)] ?? list[0];
          if (anchor) {
            const power: PowerKind = longest >= 5 ? 'orb' : horizontal ? 'cometRow' : 'cometCol';
            creations.push({ cell: anchor, piece: power === 'orb' ? { type: null, power: 'orb' } : { type: line.type, power } });
          }
        }
      });
      for (const g of groups) for (const c of g.cells) round.set(key(c), c);
    }

    // Powers caught in the round go off: comets sweep, orbs clear the most common colour.
    // This runs whether the round came from lines or from a power swap, and a power at a
    // creation anchor fires too; the new power is placed after the clear.
    let chained = true;
    while (chained) {
      chained = false;
      for (const c of [...round.values()]) {
        const p = at(board, c.row, c.col);
        if (!p || !p.power || fired.has(key(c))) continue;
        chained = true;
        if (p.power === 'orb') fireOrb(board, c, mostCommonType(board, state.types), round, fired, steps);
        else fireComet(board, c, round, fired, steps);
      }
    }

    if (round.size === 0) break;

    const cells = [...round.values()];
    steps.push({ kind: 'clear', cascade, groups: groups.length > 0 ? groups : [{ cells, type: null }], cells });
    cleared += cells.length;
    for (const c of cells) set(board, c, null);
    for (const cr of creations) {
      set(board, cr.cell, cr.piece);
      steps.push({ kind: 'create', cell: cr.cell, piece: cr.piece });
    }
    round.clear();
    fired.clear();

    steps.push(fall(board, state.types, rng, state.bias));
    cascade++;
  }

  let next: GameState = { ...state, board, moves: state.moves + 1 };
  if (findValidSwaps(next).length === 0) {
    const shuffled = reshuffleBoard(next, rng);
    if (shuffled) {
      next = { ...next, board: shuffled };
      steps.push({ kind: 'reshuffle', board: cloneBoard(shuffled) });
    }
  }
  return { state: next, steps, cleared, cascades: Math.max(0, cascade - 1) };
}

function mostCommonType(board: Board, types: readonly GemType[]): GemType {
  const counts = new Map<GemType, number>();
  for (const row of board) for (const p of row) if (p?.type) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  let best: GemType = types[0] as GemType;
  let bestN = -1;
  for (const [t, n] of counts) if (n > bestN) {
    best = t;
    bestN = n;
  }
  return best;
}

function fireOrb(board: Board, orbCell: Cell, color: GemType | null, round: Map<string, Cell>, fired: Set<string>, steps: Step[]): void {
  fired.add(key(orbCell));
  const cells: Cell[] = [orbCell];
  if (color) {
    board.forEach((row, r) =>
      row.forEach((p, c) => {
        if (p?.type === color) cells.push({ row: r, col: c });
      }),
    );
  }
  steps.push({ kind: 'fire', power: 'orb', at: orbCell, cells, color });
  cells.forEach((c) => round.set(key(c), c));
}

function fireComet(board: Board, cell: Cell, round: Map<string, Cell>, fired: Set<string>, steps: Step[]): void {
  const p = at(board, cell.row, cell.col);
  if (!p || !p.power || p.power === 'orb' || fired.has(key(cell))) return;
  fired.add(key(cell));
  const cells: Cell[] = [];
  if (p.power === 'cometRow') for (let c = 0; c < (board[0]?.length ?? 0); c++) cells.push({ row: cell.row, col: c });
  else for (let r = 0; r < board.length; r++) cells.push({ row: r, col: cell.col });
  steps.push({ kind: 'fire', power: p.power, at: cell, cells, color: p.type });
  cells.forEach((c) => round.set(key(c), c));
  // Chain: other powers along the sweep go off too.
  for (const c of cells) {
    const q = at(board, c.row, c.col);
    if (q?.power && !fired.has(key(c))) {
      if (q.power === 'orb') fireOrb(board, c, mostCommonType(board, uniqueTypes(board)), round, fired, steps);
      else fireComet(board, c, round, fired, steps);
    }
  }
}

function uniqueTypes(board: Board): GemType[] {
  const s = new Set<GemType>();
  for (const row of board) for (const p of row) if (p?.type) s.add(p.type);
  return [...s];
}

/** Gravity and refill, in place. Survivors settle first; refills see the whole final layout. */
function fall(board: Board, types: readonly GemType[], rng: Rng, bias: number): Step {
  const rows = board.length;
  const cols = board[0]?.length ?? 0;
  const moves: Array<{ from: Cell; to: Cell }> = [];
  const spawns: Array<{ to: Cell; piece: Piece; fromRow: number }> = [];
  const missing: number[] = [];
  for (let c = 0; c < cols; c++) {
    let write = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      const p = at(board, r, c);
      if (!p) continue;
      if (write !== r) {
        set(board, { row: write, col: c }, p);
        set(board, { row: r, col: c }, null);
        moves.push({ from: { row: r, col: c }, to: { row: write, col: c } });
      }
      write--;
    }
    missing[c] = write + 1;
  }
  for (let c = 0; c < cols; c++) {
    const n = missing[c] ?? 0;
    for (let r = n - 1; r >= 0; r--) {
      const type = pickRefill(board, r, c, types, rng, bias);
      const piece = gem(type);
      set(board, { row: r, col: c }, piece);
      spawns.push({ to: { row: r, col: c }, piece, fromRow: r - n });
    }
  }
  return { kind: 'fall', moves, spawns };
}

/**
 * A refill type. Plain refills are random, so cascades happen naturally.
 * With probability `bias` the type is steered toward making a pair with a
 * neighbour without completing a line, which sets up fours and fives for
 * her next move.
 */
function pickRefill(board: Board, row: number, col: number, types: readonly GemType[], rng: Rng, bias: number): GemType {
  if (bias > 0 && rng.chance(bias)) {
    const neighbours = [at(board, row, col - 1), at(board, row, col + 1), at(board, row + 1, col)]
      .map((p) => p?.type ?? null)
      .filter((t): t is GemType => t !== null);
    const options = neighbours.filter((t) => {
      set(board, { row, col }, gem(t));
      const ok = !lineThrough(board, row, col);
      set(board, { row, col }, null);
      return ok;
    });
    if (options.length > 0) return rng.pick(options);
  }
  return rng.pick(types);
}

/** Rearrange the pieces (powers included) so the board has no line and at least one valid swap. */
export function reshuffleBoard(state: GameState, rng: Rng): Board | null {
  const pieces: Piece[] = [];
  for (const row of state.board) for (const p of row) if (p) pieces.push(p);
  for (let attempt = 0; attempt < 500; attempt++) {
    for (let i = pieces.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = pieces[i] as Piece;
      pieces[i] = pieces[j] as Piece;
      pieces[j] = t;
    }
    const board: Board = Array.from({ length: state.rows }, () => Array<Piece | null>(state.cols).fill(null));
    let i = 0;
    for (let r = 0; r < state.rows; r++) for (let c = 0; c < state.cols; c++) set(board, { row: r, col: c }, pieces[i++] ?? null);
    const candidate = { ...state, board };
    if (findLines(board).length === 0 && findValidSwaps(candidate).length > 0) return board;
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

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function deserialize(json: string): GameState | null {
  try {
    const s = JSON.parse(json) as GameState;
    if (!s || !Array.isArray(s.board) || typeof s.rows !== 'number' || typeof s.cols !== 'number') return null;
    // Saves from before unlocks existed carry the two starting powers.
    if (!Array.isArray(s.unlocked)) return { ...s, unlocked: BASE_UNLOCKED };
    return s;
  } catch {
    return null;
  }
}
