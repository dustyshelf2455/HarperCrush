/**
 * Stage 4 level generator (DESIGN.md 3.7). A Play level is a LevelSpec: the
 * board's shape, frost and vines, the items in place and the picture goals.
 * The dials (shape, frost layers, vines, puffs, moonstone, bubbles, seeds,
 * the gather count) rise slowly with the lantern number inside an area, reset
 * to gentle at the start of each area, climb a little more on each pass
 * through the seven areas, and scale with the parent's Play difficulty
 * setting. Every level is checked statically here (every goal cell can be
 * part of a line of three) and dynamically by the solver bot in the tests.
 *
 * Pure and deterministic: the same lantern, setting and seed give the same
 * level, so a saved game and a replay rebuild it exactly.
 */
import { type Rng, createRng, deriveSeed } from '../shared/rng';
import { type Creature, type Goal, type LevelSpec, type Piece, type Terrain } from './game';
import type { Cell, GemType } from './grid';
import { areaIndexForLevel, cycleForLevel, lanternInArea, typesForLevel } from './journey';

export type PlayDifficulty = 'gentle' | 'medium' | 'bigger';

export const PLAY_ROWS = 8;
export const PLAY_COLS = 7;

/** How far a level's dials are turned, 0 (first lantern of the first area) to about 1.4 (big levels on later passes). */
export function levelHeat(level: number, difficulty: PlayDifficulty): number {
  const j = lanternInArea(level); // 1..10
  const area = areaIndexForLevel(level);
  const cycle = cycleForLevel(level);
  const inArea = (j - 1) / 9; // 0 .. 1
  const base = inArea * 0.8 + area * 0.03 + Math.min(0.3, cycle * 0.15);
  const scale = difficulty === 'gentle' ? 0.75 : difficulty === 'bigger' ? 1.25 : 1;
  return base * scale;
}

/** The kind of level a lantern gets: the ten lanterns of an area walk through the goals, ending big. */
export type LevelShape = 'gather' | 'uncover' | 'seeds' | 'free' | 'uncover-corners' | 'puffs' | 'vines' | 'moonstone' | 'shaped' | 'big';

export function levelShape(level: number): LevelShape {
  const order: LevelShape[] = ['gather', 'uncover', 'seeds', 'free', 'uncover-corners', 'puffs', 'vines', 'moonstone', 'shaped', 'big'];
  return order[lanternInArea(level) - 1] as LevelShape;
}

const grid = <T>(rows: number, cols: number, v: T): T[][] => Array.from({ length: rows }, () => Array<T>(cols).fill(v));

interface Draft {
  rows: number;
  cols: number;
  open: boolean[][];
  frost: number[][];
  vine: boolean[][];
  picture: boolean[][];
  items: Array<{ cell: Cell; piece: Piece }>;
  goals: Goal[];
}

function draft(rows: number, cols: number): Draft {
  return { rows, cols, open: grid(rows, cols, true), frost: grid(rows, cols, 0), vine: grid(rows, cols, false), picture: grid(rows, cols, false), items: [], goals: [] };
}

const taken = (d: Draft, c: Cell): boolean => !d.open[c.row]?.[c.col] || d.items.some((it) => it.cell.row === c.row && it.cell.col === c.col) || !!d.vine[c.row]?.[c.col];

/** Rounded corners: the four corner cells go (and the next ones along on bigger shapes). */
function shapeCorners(d: Draft, depth: number): void {
  const cut = (r: number, c: number): void => {
    if (d.open[r]) (d.open[r] as boolean[])[c] = false;
  };
  for (const [r, c] of [[0, 0], [0, d.cols - 1], [d.rows - 1, 0], [d.rows - 1, d.cols - 1]] as const) {
    cut(r, c);
    if (depth >= 2) {
      cut(r, c === 0 ? 1 : c - 1);
      cut(r === 0 ? 1 : r - 1, c);
    }
  }
}

/** A frost window: a block of cells, `layers` deep, holding the hidden picture; corners and edges when asked. */
function addFrost(d: Draft, rng: Rng, w: number, h: number, layers: number, at: 'bottom' | 'corners' | 'middle'): number {
  let total = 0;
  const place = (r0: number, c0: number, ww: number, hh: number): void => {
    for (let r = r0; r < r0 + hh; r++) {
      for (let c = c0; c < c0 + ww; c++) {
        if (!d.open[r]?.[c]) continue;
        const l = Math.max(1, Math.min(2, layers));
        (d.frost[r] as number[])[c] = l;
        (d.picture[r] as boolean[])[c] = true;
        total += l;
      }
    }
  };
  if (at === 'corners') {
    place(d.rows - h, 0, w, h);
    place(d.rows - h, d.cols - w, w, h);
    return total;
  }
  const c0 = Math.floor((d.cols - w) / 2);
  const r0 = at === 'bottom' ? d.rows - h : Math.floor((d.rows - h) / 2) + 1;
  place(r0, c0, w, h);
  // Any double layer only in the middle of the window, so the edges thaw first and the picture is glimpsed early.
  if (layers >= 2) {
    for (let r = r0; r < r0 + h; r++) {
      for (let c = c0; c < c0 + w; c++) {
        const edge = r === r0 || r === r0 + h - 1 || c === c0 || c === c0 + w - 1;
        if (edge && d.frost[r]?.[c] === 2 && rng.chance(0.6)) {
          (d.frost[r] as number[])[c] = 1;
          total -= 1;
        }
      }
    }
  }
  return total;
}

function addItem(d: Draft, cell: Cell, piece: Piece): boolean {
  if (taken(d, cell)) return false;
  d.items.push({ cell, piece });
  return true;
}

/** Spread n items over the rows `rows`, never two side by side, never in a column that already has one. */
function scatter(d: Draft, rng: Rng, n: number, rows: readonly number[], piece: (i: number) => Piece): number {
  let placed = 0;
  const usedCols = new Set<number>();
  for (let tries = 0; tries < 200 && placed < n; tries++) {
    const row = rng.pick(rows);
    const col = rng.int(d.cols);
    if (usedCols.has(col)) continue;
    const cell = { row, col };
    if (taken(d, cell)) continue;
    if (!addItem(d, cell, piece(placed))) continue;
    usedCols.add(col);
    placed++;
  }
  return placed;
}

function seedsAtTop(d: Draft, rng: Rng, n: number): number {
  return scatter(d, rng, n, [0], () => ({ type: null, power: null, item: 'seed' }));
}

function bubbles(d: Draft, rng: Rng, n: number, rows: readonly number[]): number {
  const who: Creature[] = ['dragon', 'fairy'];
  return scatter(d, rng, n, rows, (i) => ({ type: null, power: null, item: 'bubble', creature: who[(i + rng.int(2)) % 2] as Creature }));
}

/** Moonstone beside each bubble (below it when it can, else beside), so the light has to reach it. */
function guardBubbles(d: Draft, rng: Rng, n: number): number {
  let placed = 0;
  for (const it of d.items.slice()) {
    if (placed >= n || it.piece.item !== 'bubble') continue;
    const options = [{ row: it.cell.row + 1, col: it.cell.col }, { row: it.cell.row, col: it.cell.col - 1 }, { row: it.cell.row, col: it.cell.col + 1 }].filter((c) => c.row < d.rows && c.col >= 0 && c.col < d.cols && !taken(d, c));
    if (options.length === 0) continue;
    if (addItem(d, rng.pick(options), { type: null, power: null, item: 'moonstone' })) placed++;
  }
  return placed;
}

function puffs(d: Draft, rng: Rng, n: number): number {
  const rows = [];
  for (let r = 2; r < d.rows - 1; r++) rows.push(r);
  return scatter(d, rng, n, rows, () => ({ type: null, power: null, item: 'puff' }));
}

function vines(d: Draft, rng: Rng, n: number): number {
  let placed = 0;
  for (let tries = 0; tries < 200 && placed < n; tries++) {
    const cell = { row: 1 + rng.int(d.rows - 2), col: rng.int(d.cols) };
    if (taken(d, cell)) continue;
    // Never two vines touching: a held gem needs free neighbours to be matched.
    const near = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => d.vine[cell.row + (dr as number)]?.[cell.col + (dc as number)]);
    if (near) continue;
    (d.vine[cell.row] as boolean[])[cell.col] = true;
    placed++;
  }
  return placed;
}

/** Can (row, col) be part of a horizontal or vertical run of three movable cells? The static completability check (DESIGN.md 4.5). */
function reachable(d: Draft, row: number, col: number): boolean {
  const movable = (r: number, c: number): boolean => !!d.open[r]?.[c] && !d.items.some((it) => it.cell.row === r && it.cell.col === c && it.piece.item !== 'seed');
  for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
    for (let start = -2; start <= 0; start++) {
      let ok = true;
      for (let i = 0; i < 3; i++) if (!movable(row + dr * (start + i), col + dc * (start + i))) ok = false;
      if (ok) return true;
    }
  }
  return false;
}

/** Every goal cell is reachable: frost cells themselves, and a cell beside every puff, bubble and moonstone. */
export function staticallyCompletable(spec: Pick<LevelSpec, 'terrain' | 'items' | 'rows' | 'cols'>): boolean {
  const d: Draft = { rows: spec.rows, cols: spec.cols, open: spec.terrain.open.map((r) => r.slice()), frost: spec.terrain.frost.map((r) => r.slice()), vine: spec.terrain.vine.map((r) => r.slice()), picture: [], items: spec.items.slice(), goals: [] };
  for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) if ((d.frost[r]?.[c] ?? 0) > 0 && !reachable(d, r, c)) return false;
  for (const it of d.items) {
    if (it.piece.item === 'seed') continue;
    const beside = [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => reachable(d, it.cell.row + (dr as number), it.cell.col + (dc as number)));
    if (!beside) return false;
  }
  return true;
}

function build(level: number, difficulty: PlayDifficulty, rng: Rng): Draft {
  const heat = levelHeat(level, difficulty);
  const shape = levelShape(level);
  const d = draft(PLAY_ROWS, PLAY_COLS);
  const n = (base: number, per: number): number => Math.max(1, Math.round(base + per * heat));
  const layers = heat > 0.55 ? 2 : 1;
  const gatherType = (): GemType => rng.pick(typesForLevel(level, 'play'));
  switch (shape) {
    case 'gather': {
      const total = Math.min(8, n(5, 3));
      d.goals.push({ kind: 'gather', type: gatherType(), total, done: 0 });
      break;
    }
    case 'uncover': {
      const total = addFrost(d, rng, n(3, 2), n(2, 2), 1, 'bottom');
      d.goals.push({ kind: 'uncover', total, done: 0 });
      break;
    }
    case 'seeds': {
      const total = seedsAtTop(d, rng, n(1, 2));
      d.goals.push({ kind: 'seeds', total, done: 0 });
      break;
    }
    case 'free': {
      const total = bubbles(d, rng, n(1, 2), [2, 3, 4]);
      d.goals.push({ kind: 'free', total, done: 0 });
      break;
    }
    case 'uncover-corners': {
      const total = addFrost(d, rng, n(2, 1), n(2, 1), layers, 'corners');
      d.goals.push({ kind: 'uncover', total, done: 0 });
      break;
    }
    case 'puffs': {
      puffs(d, rng, n(2, 3));
      const total = seedsAtTop(d, rng, n(1, 2));
      d.goals.push({ kind: 'seeds', total, done: 0 });
      break;
    }
    case 'vines': {
      vines(d, rng, n(2, 4));
      const total = addFrost(d, rng, n(3, 2), n(2, 1), layers, 'middle');
      d.goals.push({ kind: 'uncover', total, done: 0 });
      break;
    }
    case 'moonstone': {
      const total = bubbles(d, rng, n(1, 2), [3, 4, 5]);
      guardBubbles(d, rng, n(1, 2));
      d.goals.push({ kind: 'free', total, done: 0 });
      break;
    }
    case 'shaped': {
      shapeCorners(d, heat > 0.6 ? 2 : 1);
      const total = seedsAtTop(d, rng, n(2, 1));
      d.goals.push({ kind: 'seeds', total, done: 0 });
      d.goals.push({ kind: 'gather', type: gatherType(), total: Math.min(8, n(4, 3)), done: 0 });
      break;
    }
    case 'big': {
      shapeCorners(d, 1);
      const frost = addFrost(d, rng, n(3, 2), n(2, 1), 2, 'bottom');
      d.goals.push({ kind: 'uncover', total: frost, done: 0 });
      const freed = bubbles(d, rng, n(1, 1), [2, 3]);
      guardBubbles(d, rng, n(1, 1));
      if (freed > 0) d.goals.push({ kind: 'free', total: freed, done: 0 });
      const seeds = seedsAtTop(d, rng, n(1, 1));
      if (seeds > 0) d.goals.push({ kind: 'seeds', total: seeds, done: 0 });
      break;
    }
  }
  return d;
}

/** The level for a lantern at a difficulty setting. Deterministic in `seed`; retries with the next seed until the static check passes. */
export function levelFor(level: number, difficulty: PlayDifficulty, seed: number): LevelSpec {
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = createRng(deriveSeed(seed, 500 + attempt));
    const d = build(level, difficulty, rng);
    const terrain: Terrain = { open: d.open, frost: d.frost, vine: d.vine, picture: d.picture };
    const spec: LevelSpec = { rows: d.rows, cols: d.cols, types: typesForLevel(level, 'play'), bias: 0.15 + 0.1 * Math.min(1, levelHeat(level, difficulty)), terrain, items: d.items, goals: d.goals };
    if (spec.goals.length > 0 && spec.goals.every((g) => g.total > 0) && staticallyCompletable(spec)) return spec;
  }
  // The gentlest fallback: a plain gather level, always completable.
  const d = draft(PLAY_ROWS, PLAY_COLS);
  d.goals.push({ kind: 'gather', type: typesForLevel(level, 'play')[0] as GemType, total: 6, done: 0 });
  return { rows: d.rows, cols: d.cols, types: typesForLevel(level, 'play'), bias: 0.2, terrain: { open: d.open, frost: d.frost, vine: d.vine, picture: d.picture }, items: d.items, goals: d.goals };
}
