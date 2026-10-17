import { describe, expect, it } from 'vitest';
import { AREA_IDS, LANTERNS_PER_AREA } from '../src/core/journey';
import { AREA_PITCH, ISLAND_SIZE, WORLD_W, areaStartLantern, areaUnderView, islandClearing, islandRect, lanternWorld, pathBetween, pathPolyline, stageAt, stageBlend, stageRef, trailPoint } from '../src/render/mapWorld';

describe('islands in the night sky', () => {
  it('stages cycle through the seven areas forever, one island each', () => {
    expect(stageRef(0)).toEqual({ a: 0, area: 'meadow', base: 0 });
    expect(stageRef(1).area).toBe('cave');
    expect(stageRef(7).area).toBe('meadow');
    expect(stageRef(7).base).toBe(7 * AREA_PITCH);
    expect(stageAt(AREA_PITCH * 4 + 10).a).toBe(4);
    expect(islandRect(2)).toEqual({ x: (WORLD_W - ISLAND_SIZE) / 2, y: 2 * AREA_PITCH, size: ISLAND_SIZE });
  });

  it('the trail rises from the clearing to just under the next island, inside the middle of the width', () => {
    for (let a = 0; a < 14; a++) {
      const start = trailPoint(a, 0);
      const end = trailPoint(a, 1);
      expect(start).toEqual(islandClearing(a));
      expect(end.y).toBeLessThan(stageRef(a + 1).base);
      expect(end.y).toBeGreaterThan(stageRef(a + 1).base - 200);
      let last = start.y;
      for (let i = 1; i <= 40; i++) {
        const p = trailPoint(a, i / 40);
        expect(p.y).toBeGreaterThan(last);
        expect(p.x).toBeGreaterThan(WORLD_W * 0.15);
        expect(p.x).toBeLessThan(WORLD_W * 0.85);
        last = p.y;
      }
    }
  });

  it('every star hangs higher than the one before, and the first star of an area is over its island', () => {
    for (let n = 1; n < 140; n++) {
      expect(lanternWorld(n + 1).y).toBeGreaterThan(lanternWorld(n).y);
      expect(Math.hypot(lanternWorld(n).dir.x, lanternWorld(n).dir.y)).toBeCloseTo(1);
    }
    for (let a = 0; a < 7; a++) {
      const first = lanternWorld(a * LANTERNS_PER_AREA + 1);
      const r = islandRect(a);
      expect(first.y).toBeGreaterThan(r.y);
      expect(first.y).toBeLessThan(r.y + r.size);
    }
  });

  it('the flight between stars starts and ends on them, within an area and across a border', () => {
    for (const [n, m] of [
      [3, 4],
      [10, 11],
      [70, 71],
    ]) {
      const a = lanternWorld(n!);
      const b = lanternWorld(m!);
      const p0 = pathBetween(n!, m!, 0);
      const p1 = pathBetween(n!, m!, 1);
      expect(p0.x).toBeCloseTo(a.x, 3);
      expect(p0.y).toBeCloseTo(a.y, 3);
      expect(p1.x).toBeCloseTo(b.x, 3);
      expect(p1.y).toBeCloseTo(b.y, 3);
      const line = pathPolyline(n!, m!, 8);
      expect(line).toHaveLength(9);
      for (let i = 1; i < line.length; i++) expect(line[i]!.y).toBeGreaterThanOrEqual(line[i - 1]!.y);
    }
  });

  it('the area under the view follows the stages, crossing a little before the next island', () => {
    expect(areaUnderView(0)).toBe('meadow');
    expect(areaUnderView(AREA_PITCH * 0.5)).toBe('meadow');
    expect(areaUnderView(AREA_PITCH * 0.9)).toBe('meadow');
    expect(areaUnderView(AREA_PITCH * 0.97)).toBe('cave');
    expect(areaUnderView(AREA_PITCH * 1.2)).toBe('cave');
    expect(areaUnderView(AREA_PITCH * 6.99)).toBe('meadow');
    expect(stageBlend(AREA_PITCH * 0.5)).toEqual({ a: 'meadow', b: 'cave', f: 0 });
    expect(stageBlend(AREA_PITCH * 0.99).f).toBeGreaterThan(0.9);
    expect(AREA_IDS).toContain(stageBlend(AREA_PITCH * 13.5).a);
  });

  it('finds the first star of an area', () => {
    expect(areaStartLantern(1)).toBe(1);
    expect(areaStartLantern(10)).toBe(1);
    expect(areaStartLantern(11)).toBe(11);
    expect(areaStartLantern(75)).toBe(71);
  });
});
