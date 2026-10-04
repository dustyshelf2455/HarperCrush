/**
 * The seven area themes (DESIGN.md 3.1) and the pure geometry of the lantern
 * path (DESIGN.md 3.5): the same path on every visit, every lantern on it.
 */
import { describe, expect, it } from 'vitest';
import { AREA_IDS, AREA_NAMES, areaForLevel } from '../src/core/journey';
import { areaTheme, blendThemeColors } from '../src/render/areas';
import { catmullRom, lanternPoint, pathPoint, ribbonOutline, smoothPolyline } from '../src/render/map';
import { nightGarden } from '../src/render/styles/nightGarden';

const HEX = /^#[0-9a-f]{6}$/i;

describe('area themes', () => {
  it('has a theme for every area, named as the journey names it', () => {
    for (const id of AREA_IDS) {
      const theme = areaTheme(id);
      expect(theme.id).toBe(id);
      expect(theme.name).toBe(AREA_NAMES[id]);
      for (const c of [theme.bgTop, theme.bgBottom, theme.glowLow, theme.glowHigh, theme.ground, theme.groundFar, theme.path, theme.pathLit, theme.accent]) {
        expect(c).toMatch(HEX);
      }
    }
  });

  it('keeps the Meadow exactly the Night Garden look the parent approved (DESIGN.md 2b)', () => {
    const meadow = areaTheme('meadow');
    expect(meadow.bgTop).toBe('#111846');
    expect(meadow.bgBottom).toBe('#050815');
    expect(meadow.glowLow).toBe('#0e3a48');
    expect(meadow.glowHigh).toBe('#2c2c72');
    expect(meadow.bgTop).toBe(nightGarden.palette.bgTop);
    expect(meadow.bgBottom).toBe(nightGarden.palette.bgBottom);
    expect(meadow.path).toBe(nightGarden.palette.path);
  });

  it('gives every area its own sky, so crossing an area reads as somewhere new', () => {
    const skies = new Set(AREA_IDS.map((id) => `${areaTheme(id).bgTop}/${areaTheme(id).bgBottom}`));
    expect(skies.size).toBe(AREA_IDS.length);
  });

  it('creates ambient life for every area without a browser', () => {
    for (const id of AREA_IDS) {
      const ambient = areaTheme(id).createAmbient(402, 874, 5);
      expect(typeof ambient.draw).toBe('function');
    }
  });

  it('maps lanterns to their area theme in order', () => {
    expect(areaTheme(areaForLevel(1)).id).toBe('meadow');
    expect(areaTheme(areaForLevel(10)).id).toBe('meadow');
    expect(areaTheme(areaForLevel(11)).id).toBe('cave');
    expect(areaTheme(areaForLevel(61)).id).toBe('hollow');
    expect(areaTheme(areaForLevel(71)).id).toBe('meadow');
  });

  it('blends two themes with clamped endpoints', () => {
    const a = areaTheme('meadow');
    const b = areaTheme('cave');
    expect(blendThemeColors(a, b, -1)).toBe(a);
    expect(blendThemeColors(a, b, 0)).toBe(a);
    expect(blendThemeColors(a, b, 1)).toBe(b);
    expect(blendThemeColors(a, b, 2)).toBe(b);
    const mid = blendThemeColors(a, b, 0.5);
    expect(mid.bgTop).toMatch(HEX);
    expect(mid.bgTop).not.toBe(a.bgTop);
    expect(mid.bgTop).not.toBe(b.bgTop);
  });
});

describe('lantern path geometry', () => {
  it('is a pure function of the lantern number', () => {
    for (let n = 1; n <= 200; n++) {
      const p = lanternPoint(n);
      const q = lanternPoint(n);
      expect(q).toEqual(p);
    }
  });

  it('keeps every lantern inside the path width and climbing in order', () => {
    let prevY = -Infinity;
    for (let n = 1; n <= 500; n++) {
      const p = lanternPoint(n);
      expect(p.x).toBeGreaterThanOrEqual(-0.92);
      expect(p.x).toBeLessThanOrEqual(0.92);
      expect(p.y).toBeGreaterThan(prevY);
      expect(Math.abs(p.y - n)).toBeLessThanOrEqual(0.07);
      prevY = p.y;
    }
  });

  it('winds to both sides, so the path reads as a path and not a line', () => {
    const xs = Array.from({ length: 30 }, (_, i) => lanternPoint(i + 1).x);
    expect(Math.max(...xs)).toBeGreaterThan(0.4);
    expect(Math.min(...xs)).toBeLessThan(-0.4);
  });

  it('runs the walk between lanterns from one to the next', () => {
    for (let n = 1; n <= 40; n++) {
      const a = lanternPoint(n);
      const b = lanternPoint(n + 1);
      const start = pathPoint(n, 0);
      const end = pathPoint(n, 1);
      expect(start.x).toBeCloseTo(a.x, 9);
      expect(start.y).toBeCloseTo(a.y, 9);
      expect(end.x).toBeCloseTo(b.x, 9);
      expect(end.y).toBeCloseTo(b.y, 9);
      // Progress along the way is monotonic in height, so a hop never doubles back.
      let last = a.y;
      for (let k = 1; k <= 10; k++) {
        const y = pathPoint(n, k / 10).y;
        expect(y).toBeGreaterThanOrEqual(last - 1e-9);
        last = y;
      }
    }
  });

  it('interpolates Catmull-Rom through its middle points', () => {
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 1, y: 2 };
    const p2 = { x: 3, y: 1 };
    const p3 = { x: 4, y: 4 };
    expect(catmullRom(p0, p1, p2, p3, 0)).toEqual(p1);
    expect(catmullRom(p0, p1, p2, p3, 1)).toEqual(p2);
  });

  it('smooths a polyline into per segments per span and keeps the endpoints', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 0 },
    ];
    const smooth = smoothPolyline(pts, 8);
    expect(smooth.length).toBe(2 * 8 + 1);
    expect(smooth[0]).toEqual(pts[0]);
    expect(smooth[smooth.length - 1]).toEqual(pts[2]);
    expect(smoothPolyline([], 8)).toEqual([]);
    expect(smoothPolyline([pts[0] as { x: number; y: number }], 8)).toEqual([pts[0]]);
  });

  it('outlines a ribbon with both edges the asked width apart', () => {
    const pts = Array.from({ length: 5 }, (_, i) => ({ x: 0, y: i * 10 }));
    const outline = ribbonOutline(pts, () => 6);
    expect(outline.length).toBe(10);
    // A vertical centre line: the left edge sits 6 to one side, the right edge 6 to the other.
    expect(Math.abs((outline[0] as { x: number }).x)).toBeCloseTo(6, 9);
    expect(Math.abs((outline[9] as { x: number }).x)).toBeCloseTo(6, 9);
    expect(Math.sign((outline[0] as { x: number }).x)).toBe(-Math.sign((outline[9] as { x: number }).x));
    expect(ribbonOutline([{ x: 0, y: 0 }], () => 6)).toEqual([]);
  });
});
