import { describe, expect, it } from 'vitest';
import { AREA_IDS, LANTERNS_PER_AREA } from '../src/core/journey';
import { SECTION_PATHS } from '../src/render/mapSections';
import { SECTION_H, SECTION_PITCH, SECTION_W, areaStartLantern, lanternWorld, pathBetween, pathPolyline, sectionAt, sectionPath, sectionRef } from '../src/render/mapWorld';

describe('map sections', () => {
  it('every page has three paths that enter at the bottom centre and leave at the top centre', () => {
    for (const id of AREA_IDS) {
      const pages = SECTION_PATHS[id];
      expect(pages).toHaveLength(3);
      for (const pts of pages) {
        expect(pts.length).toBeGreaterThanOrEqual(4);
        const first = pts[0]!;
        const last = pts[pts.length - 1]!;
        expect(first.y).toBe(1);
        expect(last.y).toBe(0);
        expect(Math.abs(first.x - 0.5)).toBeLessThan(0.2);
        expect(Math.abs(last.x - 0.5)).toBeLessThan(0.2);
        // The path climbs: y (from the top) never increases along the list.
        for (let i = 1; i < pts.length; i++) expect(pts[i]!.y).toBeLessThanOrEqual(pts[i - 1]!.y);
        for (const q of pts) {
          expect(q.x).toBeGreaterThanOrEqual(0.08);
          expect(q.x).toBeLessThanOrEqual(0.92);
        }
      }
    }
  });

  it('pages cycle through the seven areas forever', () => {
    expect(sectionRef(0)).toEqual({ k: 0, area: 'meadow', i: 0 });
    expect(sectionRef(2)).toEqual({ k: 2, area: 'meadow', i: 2 });
    expect(sectionRef(3).area).toBe('cave');
    expect(sectionRef(21).area).toBe('meadow');
    expect(sectionRef(21).i).toBe(0);
    expect(sectionAt(SECTION_PITCH * 4 + 10).k).toBe(4);
  });

  it('a page path in world pixels spans the page from its bottom edge to its top edge', () => {
    const pts = sectionPath(5);
    expect(pts[0]!.y).toBeCloseTo(5 * SECTION_PITCH);
    expect(pts[pts.length - 1]!.y).toBeCloseTo(5 * SECTION_PITCH + SECTION_H);
    for (const q of pts) {
      expect(q.x).toBeGreaterThan(0);
      expect(q.x).toBeLessThan(SECTION_W);
    }
  });
});

describe('lanterns on the painted path', () => {
  it('climb forever, ten to an area, each inside its area pages', () => {
    let prev = -1;
    for (let n = 1; n <= 150; n++) {
      const l = lanternWorld(n);
      expect(l.y).toBeGreaterThan(prev);
      prev = l.y;
      const area = Math.floor((n - 1) / LANTERNS_PER_AREA);
      expect(l.y).toBeGreaterThanOrEqual(area * 3 * SECTION_PITCH);
      expect(l.y).toBeLessThanOrEqual((area * 3 + 3) * SECTION_PITCH + SECTION_H);
      expect(l.x).toBeGreaterThan(0);
      expect(l.x).toBeLessThan(SECTION_W);
      expect(Math.abs(l.side)).toBe(1);
      expect(Math.hypot(l.dir.x, l.dir.y)).toBeCloseTo(1);
    }
  });

  it('are spread evenly enough that none crowds its neighbour', () => {
    const gaps: number[] = [];
    for (let n = 1; n < 70; n++) gaps.push(lanternWorld(n + 1).y - lanternWorld(n).y);
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    for (const g of gaps) expect(g).toBeGreaterThan(mean * 0.3);
  });

  it('the same lantern always lands on the same point', () => {
    expect(lanternWorld(7)).toEqual(lanternWorld(7));
    expect(lanternWorld(71).x).toBeCloseTo(lanternWorld(1).x);
    expect(lanternWorld(71).y - 21 * SECTION_PITCH).toBeCloseTo(lanternWorld(1).y);
  });

  it('the path between lanterns starts and ends on them and climbs, across an area border too', () => {
    for (const [n, m] of [[1, 2], [9, 10], [10, 11], [30, 31], [69, 70]] as const) {
      const a = lanternWorld(n);
      const b = lanternWorld(m);
      expect(pathBetween(n, m, 0)).toEqual({ x: a.x, y: a.y });
      const end = pathBetween(n, m, 1);
      expect(end.x).toBeCloseTo(b.x);
      expect(end.y).toBeCloseTo(b.y);
      const line = pathPolyline(n, m, 20);
      for (let i = 1; i < line.length; i++) expect(line[i]!.y).toBeGreaterThanOrEqual(line[i - 1]!.y - 1e-6);
    }
  });

  it('knows the first lantern of an area', () => {
    expect(areaStartLantern(1)).toBe(1);
    expect(areaStartLantern(10)).toBe(1);
    expect(areaStartLantern(11)).toBe(11);
    expect(areaStartLantern(75)).toBe(71);
  });
});
