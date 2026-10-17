/**
 * The map's world (DESIGN.md 2l, STYLE.md "The map"): islands in the night
 * sky. Each area is one painted floating island; the ten levels of the area
 * are a trail of glowing stars that climbs from the island's clearing up to
 * the underside of the next island, and the companions fly from star to star.
 * The sky, the stars and all the light are code-drawn, so nothing has to line
 * up between pictures. Everything here is pure geometry, testable without a
 * browser:
 *
 * - World coordinates are picture pixels. x runs 0..WORLD_W across the
 *   screen; y runs upward from the bottom of the first island's picture.
 * - Stage a (0-based, forever: the areas cycle) is AREA_PITCH tall. Its
 *   island picture, a WORLD_W square, stands on the stage's base; its stars
 *   climb the rest of the stage.
 * - Star n (1-based, forever) sits at an even share of its area's trail, with
 *   half a share of margin at each end, so the first star is on the island
 *   and the last just under the island above.
 */
import { AREA_COUNT, AREA_IDS, LANTERNS_PER_AREA, type AreaId } from '../core/journey';
import type { Pt } from './shapes';

export const WORLD_W = 1024;
/** The island picture is a square this many world px wide, drawn across the whole width. */
export const ISLAND_SIZE = 1024;
/** One island and the climb above it. */
export const AREA_PITCH = 2300;
/** How far the trail sways to either side of the middle, in world px. */
const SWAY = 185;
/** The last star stops this far below the base of the next stage (the next island's underside tip). */
const TRAIL_END_GAP = 40;

/**
 * Where each island's clearing is in its picture (x from the left, y from the
 * TOP, 0..1): the spot the trail rises from and the companions gather on.
 * Measured from the finished paintings.
 */
export const ISLAND_CLEARING: Record<AreaId, Pt> = {
  meadow: { x: 0.42, y: 0.4 },
  cave: { x: 0.5, y: 0.44 },
  lagoon: { x: 0.5, y: 0.44 },
  castle: { x: 0.5, y: 0.46 },
  garden: { x: 0.5, y: 0.44 },
  peak: { x: 0.5, y: 0.44 },
  hollow: { x: 0.5, y: 0.44 },
};

/** A stage's place in the journey. */
export interface StageRef {
  /** Global stage index from 0, forever. */
  a: number;
  area: AreaId;
  /** World y of the stage's base (the bottom of its island picture). */
  base: number;
}

export function stageRef(a: number): StageRef {
  const aa = Math.max(0, Math.floor(a));
  return { a: aa, area: AREA_IDS[aa % AREA_COUNT] as AreaId, base: aa * AREA_PITCH };
}

/** The stage under world y. */
export function stageAt(y: number): StageRef {
  return stageRef(Math.floor(Math.max(0, y) / AREA_PITCH));
}

/** The island picture's world rectangle for stage a: left, bottom, size. */
export function islandRect(a: number): { x: number; y: number; size: number } {
  return { x: (WORLD_W - ISLAND_SIZE) / 2, y: stageRef(a).base, size: ISLAND_SIZE };
}

/** The island's clearing in world px: where the trail begins and the companions rest. */
export function islandClearing(a: number): Pt {
  const ref = stageRef(a);
  const c = ISLAND_CLEARING[ref.area];
  const r = islandRect(a);
  return { x: r.x + c.x * r.size, y: r.y + (1 - c.y) * r.size };
}

/**
 * The area the view is "in" at world y, for the music and the sky's colour:
 * the stage's area until the view is past its last star, just under the next
 * island, so every star keeps its own area's voice.
 */
export function areaUnderView(y: number): AreaId {
  const ref = stageAt(y);
  const within = (Math.max(0, y) - ref.base) / AREA_PITCH;
  return within >= 0.965 ? stageRef(ref.a + 1).area : ref.area;
}

/** The sky's colour at world y: the stage's area blending into the next over the stage's top third. */
export function stageBlend(y: number): { a: AreaId; b: AreaId; f: number } {
  const ref = stageAt(y);
  const within = (Math.max(0, y) - ref.base) / AREA_PITCH;
  const f = Math.max(0, Math.min(1, (within - 0.66) / 0.34));
  return { a: ref.area, b: stageRef(ref.a + 1).area, f };
}

/**
 * The trail of stage a at t (0 at the clearing, 1 just under the next
 * island): a gentle S that is different for every stage, pinned at both
 * ends, never leaving the middle three fifths of the width.
 */
export function trailPoint(a: number, t: number): Pt {
  const k = Math.max(0, Math.min(1, t));
  const start = islandClearing(a);
  const endY = stageRef(a).base + AREA_PITCH - TRAIL_END_GAP;
  const phase = a * 2.39996; // the golden angle: no two neighbouring climbs sway alike
  const sway = Math.sin(Math.PI * 2 * k + phase) * Math.sin(Math.PI * k);
  const x = start.x + (WORLD_W / 2 - start.x) * k + SWAY * sway;
  return { x, y: start.y + (endY - start.y) * k };
}

/** Which stage (0-based) star n belongs to, and its 1-based place there. */
function placeOf(n: number): { a: number; j: number } {
  const m = Math.max(1, Math.floor(n));
  return { a: Math.floor((m - 1) / LANTERNS_PER_AREA), j: ((m - 1) % LANTERNS_PER_AREA) + 1 };
}

/** The trail parameter of star n: an even share, with half a share of margin at each end. */
function trailT(j: number): number {
  return (j - 0.5) / LANTERNS_PER_AREA;
}

export interface LanternWorld extends Pt {
  /** Unit direction of the trail there (which way the journey goes). */
  dir: Pt;
}

const stars = new Map<number, LanternWorld>();

/** Where star n hangs in the sky, in world px. */
export function lanternWorld(n: number): LanternWorld {
  const m = Math.max(1, Math.floor(n));
  const hit = stars.get(m);
  if (hit) return hit;
  const { a, j } = placeOf(m);
  const t = trailT(j);
  const p = trailPoint(a, t);
  const q = trailPoint(a, t + 0.01);
  const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
  const l = { x: p.x, y: p.y, dir: { x: (q.x - p.x) / len, y: (q.y - p.y) / len } };
  stars.set(m, l);
  return l;
}

/**
 * A point of the flight between stars n and m (f from 0 at n to 1 at m):
 * along the trail within an area; across an area border a soft bow from the
 * last star over the island to the first star of the next.
 */
export function pathBetween(n: number, m: number, f: number): Pt {
  const k = Math.max(0, Math.min(1, f));
  const from = placeOf(n);
  const to = placeOf(m);
  if (from.a === to.a) return trailPoint(from.a, trailT(from.j) + (trailT(to.j) - trailT(from.j)) * k);
  const p = lanternWorld(n);
  const q = lanternWorld(m);
  const bow = Math.sin(Math.PI * k) * (q.x >= WORLD_W / 2 ? -1 : 1) * SWAY * 0.6;
  return { x: p.x + (q.x - p.x) * k + bow, y: p.y + (q.y - p.y) * k };
}

/** The flight from star n to star m as a polyline in world px, for drawing the trail of light. */
export function pathPolyline(n: number, m: number, per = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= per; i++) out.push(pathBetween(n, m, i / per));
  return out;
}

/** The first star of the area containing star n. */
export function areaStartLantern(n: number): number {
  return placeOf(n).a * LANTERNS_PER_AREA + 1;
}

/** The top of the island picture on the stage that holds star n (the far end of a pass, for the view's range). */
export function passStageTop(n: number): number {
  return stageRef(placeOf(n).a).base + ISLAND_SIZE;
}
