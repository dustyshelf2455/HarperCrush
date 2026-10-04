/**
 * The journey along the lantern path (DESIGN.md 3.1, 3.4, 3.5, 3.6): which
 * area a lantern is in, which powers have unlocked by then, which gift a
 * milestone lantern starts with, and the board each mode plays on.
 *
 * Pure data and small functions, shared by the core, the app and the tests.
 */
import type { PowerFamily } from './game';
import type { GemType } from './grid';

export type Mode = 'calm' | 'play';

export const LANTERNS_PER_AREA = 10;
export const AREA_COUNT = 7;

export type AreaId = 'meadow' | 'cave' | 'lagoon' | 'castle' | 'garden' | 'peak' | 'hollow';
export const AREA_IDS: readonly AreaId[] = ['meadow', 'cave', 'lagoon', 'castle', 'garden', 'peak', 'hollow'];
export const AREA_NAMES: Record<AreaId, string> = {
  meadow: 'Twinkle Meadow',
  cave: 'Crystal Cave',
  lagoon: 'Mermaid Lagoon',
  castle: 'Cloud Castle',
  garden: 'Star Garden',
  peak: 'Aurora Peak',
  hollow: 'Dragon Hollow',
};

/** 0-based area index for a lantern number (1-based). Areas cycle forever. */
export function areaIndexForLevel(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / LANTERNS_PER_AREA) % AREA_COUNT;
}

export function areaForLevel(level: number): AreaId {
  return AREA_IDS[areaIndexForLevel(level)] as AreaId;
}

/** 0 for the first pass through the seven areas, 1 for the second, and so on. */
export function cycleForLevel(level: number): number {
  return Math.floor((Math.max(1, level) - 1) / (LANTERNS_PER_AREA * AREA_COUNT));
}

/** 1..LANTERNS_PER_AREA: where this lantern sits within its area. */
export function lanternInArea(level: number): number {
  return ((Math.max(1, level) - 1) % LANTERNS_PER_AREA) + 1;
}

export function isFirstLanternOfArea(level: number): boolean {
  return lanternInArea(level) === 1;
}

// ------------------------------------------------------------------- gifts

export type Gift = { kind: 'power'; family: PowerFamily } | { kind: 'combo'; a: PowerFamily; b: PowerFamily };

const power = (family: PowerFamily): Gift => ({ kind: 'power', family });
const combo = (a: PowerFamily, b: PowerFamily): Gift => ({ kind: 'combo', a, b });

/** The first pass along the path (DESIGN.md 3.4, "Proposed unlock order"). */
export const MILESTONES: ReadonlyArray<{ level: number; gift: Gift }> = [
  { level: 1, gift: power('comet') },
  { level: 5, gift: power('orb') },
  { level: 8, gift: power('bloom') },
  { level: 11, gift: combo('comet', 'bloom') },
  { level: 15, gift: power('sprite') },
  { level: 21, gift: combo('orb', 'comet') },
  { level: 25, gift: power('starburst') },
  { level: 31, gift: power('moonrise') },
  { level: 35, gift: combo('bloom', 'bloom') },
  { level: 41, gift: combo('orb', 'bloom') },
  { level: 51, gift: power('aurora') },
  { level: 55, gift: combo('orb', 'orb') },
  { level: 61, gift: combo('moonrise', 'comet') },
];

/** Every power whose milestone is at or before this lantern. The Comet is there from lantern 1; the Orb arrives at lantern 5 (DESIGN.md 3.4). */
export function unlockedAt(level: number): PowerFamily[] {
  const out: PowerFamily[] = ['comet'];
  for (const m of MILESTONES) {
    if (m.level <= level && m.gift.kind === 'power' && !out.includes(m.gift.family)) out.push(m.gift.family);
  }
  return out;
}

/** The lantern at which a power unlocks, for the discoveries book and tests. */
export function unlockLevelOf(family: PowerFamily): number {
  return MILESTONES.find((m) => m.gift.kind === 'power' && m.gift.family === family)?.level ?? 1;
}

const FAMILY_ORDER: readonly PowerFamily[] = ['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise', 'aurora'];

/** A stable name for a pairing, the same whichever way round it is swapped. */
export function comboId(a: PowerFamily, b: PowerFamily): string {
  const [x, y] = FAMILY_ORDER.indexOf(a) <= FAMILY_ORDER.indexOf(b) ? [a, b] : [b, a];
  return `${x}+${y}`;
}

/** Every pairing of two powers, same pairs included, in a fixed order. */
export const ALL_COMBOS: ReadonlyArray<[PowerFamily, PowerFamily]> = (() => {
  const out: Array<[PowerFamily, PowerFamily]> = [];
  FAMILY_ORDER.forEach((a, i) => FAMILY_ORDER.slice(i).forEach((b) => out.push([a, b])));
  return out;
})();

/**
 * The gift a lantern starts with, or null. On the first pass it is the
 * milestone table. From the second pass on, the first lantern of each area
 * gifts the combination she has fired least (ties broken in a fixed order),
 * so the journey never runs out of first times.
 */
export function giftAt(level: number, comboCounts: Readonly<Record<string, number>> = {}): Gift | null {
  const milestone = MILESTONES.find((m) => m.level === level);
  if (milestone) return milestone.gift;
  if (cycleForLevel(level) === 0 || !isFirstLanternOfArea(level)) return null;
  const unlocked = unlockedAt(level);
  let best: [PowerFamily, PowerFamily] | null = null;
  let bestCount = Infinity;
  for (const pair of ALL_COMBOS) {
    if (!unlocked.includes(pair[0]) || !unlocked.includes(pair[1])) continue;
    const n = comboCounts[comboId(pair[0], pair[1])] ?? 0;
    if (n < bestCount) {
      best = pair;
      bestCount = n;
    }
  }
  return best ? combo(best[0], best[1]) : null;
}

// ------------------------------------------------------------------ boards

const FOUR: readonly GemType[] = ['star', 'heart', 'drop', 'leaf'];
const FIVE: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];
const SIX: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond', 'sunstone'];

/** Gem types on the board (DESIGN.md 3.2): Calm uses four in the first area, five after; Play five, six from Cloud Castle. */
export function typesForLevel(level: number, mode: Mode): readonly GemType[] {
  const area = areaIndexForLevel(level);
  if (mode === 'calm') return area === 0 && cycleForLevel(level) === 0 ? FOUR : FIVE;
  return area >= 3 || cycleForLevel(level) > 0 ? SIX : FIVE;
}

export interface BoardSpec {
  rows: number;
  cols: number;
  /** Probability that a refill is steered toward setting up a four or five. */
  bias: number;
  /** Matches that light the lantern. */
  goal: number;
  /** Default pause before a hint, before the parent's hint-delay setting scales it. */
  hintMs: number;
}

/**
 * The board for a mode. Calm is the decided 6 by 9 (STATUS.md). Play is
 * provisional until Stage 4 brings its goals and obstacles: a wider board,
 * a thinner bias, slower hints and a longer lantern.
 */
export function boardFor(mode: Mode): BoardSpec {
  if (mode === 'calm') return { rows: 9, cols: 6, bias: 0.3, goal: 12, hintMs: 4000 };
  return { rows: 8, cols: 7, bias: 0.12, goal: 16, hintMs: 10000 };
}
