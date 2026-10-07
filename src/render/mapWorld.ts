/**
 * The map's world (STYLE.md "The map", DESIGN.md 2e): a scrolling storybook of
 * painted pages, three per area, stacked bottom to top forever (the areas
 * cycle). Everything here is pure geometry over the path points recorded in
 * mapSections.ts, so it is testable without a browser:
 *
 * - World coordinates are picture pixels. x runs 0..SECTION_W across a page;
 *   y runs upward from the bottom of the first page, each page adding
 *   SECTION_PITCH (a little less than its height, because pages overlap a
 *   touch at every seam so the join can be softened).
 * - Lantern n (1-based, forever) sits on its area's painted path at an even
 *   share of the path's length, so the ten lanterns of an area are spread
 *   along its three pages with a margin at both ends.
 * - The path between lanterns is the painted path itself, by arc length, so
 *   the companion hops along the painting.
 */
import { AREA_COUNT, AREA_IDS, LANTERNS_PER_AREA, type AreaId } from '../core/journey';
import { SECTION_PATHS } from './mapSections';
import type { Pt } from './shapes';

export const SECTION_W = 1024;
export const SECTION_H = 1536;
export const SECTIONS_PER_AREA = 3;
/** Pages overlap by this many picture pixels at each seam. */
export const SEAM_OVERLAP = 120;
export const SECTION_PITCH = SECTION_H - SEAM_OVERLAP;

/** A page's place in the journey. */
export interface SectionRef {
  /** Global page index from 0, forever. */
  k: number;
  area: AreaId;
  /** 0..2 within the area. */
  i: number;
}

export function sectionRef(k: number): SectionRef {
  const kk = Math.max(0, Math.floor(k));
  return { k: kk, area: AREA_IDS[Math.floor(kk / SECTIONS_PER_AREA) % AREA_COUNT] as AreaId, i: kk % SECTIONS_PER_AREA };
}

/** World y of page k's bottom edge. */
export function sectionBottom(k: number): number {
  return k * SECTION_PITCH;
}

/** The page under world y (the lower page where two overlap). */
export function sectionAt(y: number): SectionRef {
  return sectionRef(Math.floor(Math.max(0, y) / SECTION_PITCH));
}

/** The painted path of page k in world pixels, bottom to top. */
export function sectionPath(k: number): Pt[] {
  const ref = sectionRef(k);
  const pts = SECTION_PATHS[ref.area][ref.i] as readonly Pt[];
  const bottom = sectionBottom(k);
  return pts.map((q) => ({ x: q.x * SECTION_W, y: bottom + (1 - q.y) * SECTION_H }));
}

interface Polyline {
  pts: Pt[];
  /** Cumulative arc length at each point. */
  s: number[];
  length: number;
}

const areaLines = new Map<number, Polyline>();

/** The whole painted path of the a-th area visit (0-based, forever): its three pages joined. */
function areaLine(a: number): Polyline {
  const hit = areaLines.get(a);
  if (hit) return hit;
  const pts: Pt[] = [];
  for (let i = 0; i < SECTIONS_PER_AREA; i++) {
    const page = sectionPath(a * SECTIONS_PER_AREA + i);
    for (const q of page) {
      const last = pts[pts.length - 1];
      // Pages meet at the seam; keep one point there, at the mean of the two edges.
      if (last && Math.abs(last.y - q.y) < SEAM_OVERLAP * 1.5 && Math.abs(last.x - q.x) < SECTION_W * 0.12) {
        last.x = (last.x + q.x) / 2;
        last.y = (last.y + q.y) / 2;
        continue;
      }
      pts.push({ x: q.x, y: q.y });
    }
  }
  // The area's path ends in the middle of the seam with the next area, where that area's path begins.
  (pts[0] as Pt).y += SEAM_OVERLAP / 2;
  (pts[pts.length - 1] as Pt).y -= SEAM_OVERLAP / 2;
  const s: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    const a0 = pts[i - 1] as Pt;
    const b0 = pts[i] as Pt;
    s.push((s[i - 1] as number) + Math.hypot(b0.x - a0.x, b0.y - a0.y));
  }
  const line = { pts, s, length: s[s.length - 1] as number };
  areaLines.set(a, line);
  return line;
}

function alongLine(line: Polyline, dist: number): { p: Pt; dir: Pt } {
  const d = Math.max(0, Math.min(line.length, dist));
  let i = 1;
  while (i < line.s.length - 1 && (line.s[i] as number) < d) i++;
  const a = line.pts[i - 1] as Pt;
  const b = line.pts[i] as Pt;
  const seg = (line.s[i] as number) - (line.s[i - 1] as number);
  const f = seg > 0 ? (d - (line.s[i - 1] as number)) / seg : 0;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { p: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, dir: { x: (b.x - a.x) / len, y: (b.y - a.y) / len } };
}

/** Which area visit (0-based) lantern n belongs to, and its 1-based place there. */
function placeOf(n: number): { a: number; j: number } {
  const m = Math.max(1, Math.floor(n));
  return { a: Math.floor((m - 1) / LANTERNS_PER_AREA), j: ((m - 1) % LANTERNS_PER_AREA) + 1 };
}

/** Arc position of lantern n along its area's path: an even share, with half a share of margin at each end. */
function lanternDist(n: number): { a: number; dist: number } {
  const { a, j } = placeOf(n);
  return { a, dist: (areaLine(a).length * (j - 0.5)) / LANTERNS_PER_AREA };
}

export interface LanternWorld extends Pt {
  /** Unit direction of the path there (which way the journey goes). */
  dir: Pt;
  /** The side of the path its beacon stands on: -1 left, 1 right (toward the middle of the page, else alternating). */
  side: -1 | 1;
}

const lanterns = new Map<number, LanternWorld>();

/** Where lantern n stands on the painted path, in world pixels. */
export function lanternWorld(n: number): LanternWorld {
  const m = Math.max(1, Math.floor(n));
  const hit = lanterns.get(m);
  if (hit) return hit;
  const { a, dist } = lanternDist(m);
  const { p, dir } = alongLine(areaLine(a), dist);
  const off = p.x - SECTION_W / 2;
  const side: -1 | 1 = Math.abs(off) > SECTION_W * 0.14 ? (off < 0 ? 1 : -1) : m % 2 === 0 ? 1 : -1;
  const l = { x: p.x, y: p.y, dir, side };
  lanterns.set(m, l);
  return l;
}

/**
 * A point along the painted path between lanterns n and m (f from 0 at n to
 * 1 at m), following the painting even across an area border.
 */
export function pathBetween(n: number, m: number, f: number): Pt {
  const k = Math.max(0, Math.min(1, f));
  const from = lanternDist(n);
  const to = lanternDist(m);
  if (from.a === to.a) return alongLine(areaLine(from.a), from.dist + (to.dist - from.dist) * k).p;
  // Across visits: the rest of the first area's path, then the next area's path from its start.
  const first = areaLine(from.a);
  const tail = first.length - from.dist;
  const total = tail + to.dist;
  const d = total * k;
  return d <= tail ? alongLine(first, from.dist + d).p : alongLine(areaLine(to.a), d - tail).p;
}

/** The painted path from lantern n to lantern m as a polyline in world pixels, for drawing a fallback ribbon. */
export function pathPolyline(n: number, m: number, per = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= per; i++) out.push(pathBetween(n, m, i / per));
  return out;
}

/** The first lantern of the area containing lantern n. */
export function areaStartLantern(n: number): number {
  return placeOf(n).a * LANTERNS_PER_AREA + 1;
}
