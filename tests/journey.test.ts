/**
 * The journey data (DESIGN.md 3.4 unlock order, 3.5 areas, 3.2 boards):
 * which powers have unlocked by a lantern, which gift a lantern starts with,
 * and the board each mode plays on.
 */
import { describe, expect, it } from 'vitest';
import type { PowerFamily } from '../src/core/game';
import {
  ALL_COMBOS,
  AREA_COUNT,
  AREA_IDS,
  AREA_NAMES,
  LANTERNS_PER_AREA,
  MILESTONES,
  areaForLevel,
  areaIndexForLevel,
  boardFor,
  comboId,
  cycleForLevel,
  giftAt,
  isFirstLanternOfArea,
  lanternInArea,
  typesForLevel,
  unlockLevelOf,
  unlockedAt,
} from '../src/core/journey';

describe('areas along the path', () => {
  it('has seven named areas of ten lanterns that cycle forever', () => {
    expect(AREA_COUNT).toBe(7);
    expect(LANTERNS_PER_AREA).toBe(10);
    expect(AREA_IDS).toHaveLength(7);
    for (const id of AREA_IDS) expect(AREA_NAMES[id].length).toBeGreaterThan(0);
    expect(areaIndexForLevel(1)).toBe(0);
    expect(areaIndexForLevel(10)).toBe(0);
    expect(areaIndexForLevel(11)).toBe(1);
    expect(areaIndexForLevel(70)).toBe(6);
    expect(areaIndexForLevel(71)).toBe(0);
    expect(areaIndexForLevel(141)).toBe(0);
    expect(areaIndexForLevel(0)).toBe(0);
    expect(areaForLevel(51)).toBe('peak');
    expect(areaForLevel(61)).toBe('hollow');
    expect(areaForLevel(11)).toBe('cave');
    expect(areaForLevel(21)).toBe('lagoon');
    expect(areaForLevel(31)).toBe('castle');
    expect(areaForLevel(41)).toBe('garden');
    for (let level = 1; level <= 300; level++) expect(areaIndexForLevel(level)).toBe(areaIndexForLevel(level + 70));
  });

  it('knows the cycle and the lantern within an area', () => {
    expect(cycleForLevel(1)).toBe(0);
    expect(cycleForLevel(70)).toBe(0);
    expect(cycleForLevel(71)).toBe(1);
    expect(cycleForLevel(141)).toBe(2);
    expect(lanternInArea(1)).toBe(1);
    expect(lanternInArea(10)).toBe(10);
    expect(lanternInArea(11)).toBe(1);
    expect(lanternInArea(75)).toBe(5);
    expect(isFirstLanternOfArea(1)).toBe(true);
    expect(isFirstLanternOfArea(11)).toBe(true);
    expect(isFirstLanternOfArea(12)).toBe(false);
    expect(isFirstLanternOfArea(71)).toBe(true);
  });
});

describe('unlocks', () => {
  it('follows the milestone table: the comet from the start, the orb at lantern 5, then each power at its lantern', () => {
    expect(unlockedAt(1)).toEqual(['comet']);
    expect(unlockedAt(4)).toEqual(['comet']);
    expect(unlockedAt(5)).toEqual(['comet', 'orb']);
    expect(unlockedAt(7)).toEqual(['comet', 'orb']);
    expect(unlockedAt(8)).toEqual(['comet', 'orb', 'bloom']);
    expect(unlockedAt(14)).toEqual(['comet', 'orb', 'bloom']);
    expect(unlockedAt(15)).toEqual(['comet', 'orb', 'bloom', 'sprite']);
    expect(unlockedAt(24)).toEqual(['comet', 'orb', 'bloom', 'sprite']);
    expect(unlockedAt(25)).toEqual(['comet', 'orb', 'bloom', 'sprite', 'starburst']);
    expect(unlockedAt(30)).toEqual(['comet', 'orb', 'bloom', 'sprite', 'starburst']);
    expect(unlockedAt(31)).toEqual(['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise']);
    expect(unlockedAt(50)).toEqual(['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise']);
    expect(unlockedAt(51)).toEqual(['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise', 'aurora']);
    expect(unlockedAt(1000)).toEqual(['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise', 'aurora']);
  });

  it('unlocks never go away and each family has one unlock lantern', () => {
    for (let level = 1; level < 200; level++) {
      const now = unlockedAt(level);
      const next = unlockedAt(level + 1);
      for (const f of now) expect(next).toContain(f);
    }
    expect(unlockLevelOf('comet')).toBe(1);
    expect(unlockLevelOf('orb')).toBe(5);
    expect(unlockLevelOf('bloom')).toBe(8);
    expect(unlockLevelOf('sprite')).toBe(15);
    expect(unlockLevelOf('starburst')).toBe(25);
    expect(unlockLevelOf('moonrise')).toBe(31);
    expect(unlockLevelOf('aurora')).toBe(51);
    for (const m of MILESTONES) {
      if (m.gift.kind === 'power') expect(unlockedAt(m.level)).toContain(m.gift.family);
      if (m.gift.kind === 'combo') {
        // A combination gift only arrives once both powers have unlocked.
        expect(unlockedAt(m.level)).toContain(m.gift.a);
        expect(unlockedAt(m.level)).toContain(m.gift.b);
      }
    }
  });
});

describe('gifts', () => {
  it('gives the milestone gift at each milestone and nothing on other first-pass lanterns', () => {
    expect(giftAt(1)).toEqual({ kind: 'power', family: 'comet' });
    expect(giftAt(5)).toEqual({ kind: 'power', family: 'orb' });
    expect(giftAt(8)).toEqual({ kind: 'power', family: 'bloom' });
    expect(giftAt(11)).toEqual({ kind: 'combo', a: 'comet', b: 'bloom' });
    expect(giftAt(15)).toEqual({ kind: 'power', family: 'sprite' });
    expect(giftAt(21)).toEqual({ kind: 'combo', a: 'orb', b: 'comet' });
    expect(giftAt(25)).toEqual({ kind: 'power', family: 'starburst' });
    expect(giftAt(31)).toEqual({ kind: 'power', family: 'moonrise' });
    expect(giftAt(35)).toEqual({ kind: 'combo', a: 'bloom', b: 'bloom' });
    expect(giftAt(41)).toEqual({ kind: 'combo', a: 'orb', b: 'bloom' });
    expect(giftAt(51)).toEqual({ kind: 'power', family: 'aurora' });
    expect(giftAt(55)).toEqual({ kind: 'combo', a: 'orb', b: 'orb' });
    expect(giftAt(61)).toEqual({ kind: 'combo', a: 'moonrise', b: 'comet' });
    for (const m of MILESTONES) expect(giftAt(m.level)).toEqual(m.gift);
    const milestoneLevels = new Set(MILESTONES.map((m) => m.level));
    for (let level = 1; level <= 70; level++) if (!milestoneLevels.has(level)) expect(giftAt(level)).toBeNull();
  });

  it('from the second cycle on, the first lantern of each area gifts the least-fired combination', () => {
    // Nothing fired yet: the first pairing in the fixed order.
    expect(giftAt(71)).toEqual({ kind: 'combo', a: 'comet', b: 'comet' });
    // Fired counts steer it to the pairing she has seen least.
    const counts: Record<string, number> = {};
    for (const [a, b] of ALL_COMBOS) counts[comboId(a, b)] = 3;
    counts[comboId('sprite', 'moonrise')] = 0;
    expect(giftAt(71, counts)).toEqual({ kind: 'combo', a: 'sprite', b: 'moonrise' });
    counts[comboId('moonrise', 'sprite')] = 3;
    counts[comboId('aurora', 'aurora')] = 1;
    expect(giftAt(81, counts)).toEqual({ kind: 'combo', a: 'aurora', b: 'aurora' });
    // Ties break in the fixed order.
    const tied: Record<string, number> = {};
    for (const [a, b] of ALL_COMBOS) tied[comboId(a, b)] = 2;
    tied[comboId('orb', 'bloom')] = 1;
    tied[comboId('bloom', 'sprite')] = 1;
    expect(giftAt(141, tied)).toEqual({ kind: 'combo', a: 'orb', b: 'bloom' });
    // Other lanterns of later cycles have no gift.
    for (let level = 72; level <= 80; level++) expect(giftAt(level)).toBeNull();
    expect(giftAt(150)).toBeNull();
    for (let cycle = 1; cycle <= 3; cycle++) {
      for (let area = 0; area < AREA_COUNT; area++) {
        const level = cycle * AREA_COUNT * LANTERNS_PER_AREA + area * LANTERNS_PER_AREA + 1;
        expect(giftAt(level)?.kind).toBe('combo');
      }
    }
  });

  it('names a pairing the same whichever way round and lists all 28 pairings once', () => {
    expect(comboId('comet', 'orb')).toBe(comboId('orb', 'comet'));
    expect(comboId('aurora', 'comet')).toBe('comet+aurora');
    expect(comboId('bloom', 'bloom')).toBe('bloom+bloom');
    expect(ALL_COMBOS).toHaveLength(28);
    expect(new Set(ALL_COMBOS.map(([a, b]) => comboId(a, b))).size).toBe(28);
    const families: PowerFamily[] = ['comet', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise', 'aurora'];
    for (const a of families) for (const b of families) expect(ALL_COMBOS.some(([x, y]) => comboId(x, y) === comboId(a, b))).toBe(true);
  });
});

describe('boards', () => {
  it('uses four types in the first Calm area, five after; five in Play, six from Cloud Castle', () => {
    expect(typesForLevel(1, 'calm')).toEqual(['star', 'heart', 'drop', 'leaf']);
    expect(typesForLevel(10, 'calm')).toEqual(['star', 'heart', 'drop', 'leaf']);
    expect(typesForLevel(11, 'calm')).toEqual(['star', 'heart', 'drop', 'leaf', 'diamond']);
    expect(typesForLevel(71, 'calm')).toEqual(['star', 'heart', 'drop', 'leaf', 'diamond']);
    expect(typesForLevel(1, 'play')).toEqual(['star', 'heart', 'drop', 'leaf', 'diamond']);
    expect(typesForLevel(30, 'play')).toEqual(['star', 'heart', 'drop', 'leaf', 'diamond']);
    expect(typesForLevel(31, 'play')).toEqual(['star', 'heart', 'drop', 'leaf', 'diamond', 'sunstone']);
    expect(typesForLevel(71, 'play')).toEqual(['star', 'heart', 'drop', 'leaf', 'diamond', 'sunstone']);
  });

  it('plays Calm on the decided 6 by 9 board and Play on a 7 by 8', () => {
    expect(boardFor('calm')).toEqual({ rows: 9, cols: 6, bias: 0.3, goal: 12, hintMs: 4000 });
    expect(boardFor('play')).toMatchObject({ rows: 8, cols: 7 });
    expect(boardFor('play').bias).toBeLessThan(boardFor('calm').bias);
    expect(boardFor('play').hintMs).toBeGreaterThan(boardFor('calm').hintMs);
  });
});
