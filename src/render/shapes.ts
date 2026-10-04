/**
 * Gem geometry. Every gem type has a distinct silhouette so Harper can tell
 * pieces apart by shape as well as colour. Shapes are unit polygons
 * (max extent about 1) with a corner-rounding radius; styles draw them at
 * any size via shapePath().
 */
import type { GemType } from '../core/grid';

export interface Pt {
  x: number;
  y: number;
}

export interface GemShape {
  readonly points: readonly Pt[];
  /** Corner rounding radius in unit space (0 for already-smooth outlines). */
  readonly corner: number;
  /** Visual scale so all gems read as about the same size. */
  readonly scale: number;
}

const TAU = Math.PI * 2;

function star(): GemShape {
  const points: Pt[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 1 : 0.5;
    points.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return { points, corner: 0.14, scale: 1.1 };
}

function heart(): GemShape {
  const raw: Pt[] = [];
  const n = 56;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * TAU;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    raw.push({ x: x / 17, y: -y / 17 });
  }
  // Centre the heart vertically and fill the unit box.
  const ys = raw.map((p) => p.y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const points = raw.map((p) => ({ x: p.x * 1.06, y: (p.y - mid) * 1.06 }));
  return { points, corner: 0, scale: 1.0 };
}

function drop(): GemShape {
  const cy = 0.3;
  const r = 0.68;
  const tip = { x: 0, y: -1 };
  const d = tip.y - cy;
  const half = Math.acos(r / Math.abs(d));
  const from = -Math.PI / 2 + half;
  const to = -Math.PI / 2 - half + TAU;
  const points: Pt[] = [tip];
  const steps = 34;
  for (let i = 0; i <= steps; i++) {
    const a = from + ((to - from) * i) / steps;
    points.push({ x: r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return { points, corner: 0.1, scale: 1.0 };
}

function leaf(): GemShape {
  // A lens made of two circular arcs, tilted a little like a real leaf.
  const c = 0.533;
  const R = 1.133;
  const theta = Math.asin(1 / R);
  const points: Pt[] = [];
  const steps = 18;
  for (let i = 0; i <= steps; i++) {
    const a = -theta + (2 * theta * i) / steps;
    points.push({ x: -c + R * Math.cos(a), y: R * Math.sin(a) });
  }
  // The second arc shares both tip points with the first; skip them so the outline stays simple.
  for (let i = 1; i < steps; i++) {
    const a = Math.PI - theta + (2 * theta * i) / steps;
    points.push({ x: c + R * Math.cos(a), y: R * Math.sin(a) });
  }
  const tilt = -0.38;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const rotated = points.map((p) => ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos }));
  return { points: rotated, corner: 0.06, scale: 0.98 };
}

function diamond(): GemShape {
  return {
    points: [
      { x: 0, y: -1 },
      { x: 0.76, y: 0 },
      { x: 0, y: 1 },
      { x: -0.76, y: 0 },
    ],
    corner: 0.1,
    scale: 1.0,
  };
}

function sunstone(): GemShape {
  const points: Pt[] = [];
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    points.push({ x: 0.93 * Math.cos(a), y: 0.93 * Math.sin(a) });
  }
  return { points, corner: 0.17, scale: 0.98 };
}

const SHAPES: Record<GemType, GemShape> = {
  star: star(),
  heart: heart(),
  drop: drop(),
  leaf: leaf(),
  diamond: diamond(),
  sunstone: sunstone(),
};

export function gemShape(type: GemType): GemShape {
  return SHAPES[type];
}

/** A closed path for a polygon with rounded corners, scaled by `scale`. */
export function polygonPath(points: readonly Pt[], corner: number, scale: number): Path2D {
  const path = new Path2D();
  const n = points.length;
  if (n === 0) return path;
  if (corner <= 0) {
    points.forEach((p, i) => (i === 0 ? path.moveTo(p.x * scale, p.y * scale) : path.lineTo(p.x * scale, p.y * scale)));
    path.closePath();
    return path;
  }
  const first = points[0] as Pt;
  const last = points[n - 1] as Pt;
  path.moveTo(((last.x + first.x) / 2) * scale, ((last.y + first.y) / 2) * scale);
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n] as Pt;
    const cur = points[i] as Pt;
    const next = points[(i + 1) % n] as Pt;
    const ax = prev.x - cur.x;
    const ay = prev.y - cur.y;
    const bx = next.x - cur.x;
    const by = next.y - cur.y;
    const la = Math.hypot(ax, ay) || 1e-9;
    const lb = Math.hypot(bx, by) || 1e-9;
    // Interior angle at this vertex.
    const cos = Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb)));
    const theta = Math.acos(cos);
    const turn = Math.PI - theta;
    if (turn < 0.25) {
      // Nearly straight: no rounding needed, and arcTo would only add bumps.
      path.lineTo(cur.x * scale, cur.y * scale);
      continue;
    }
    // The arc's tangent points sit r / tan(theta/2) from the vertex; keep them on the edges.
    const tangentPerRadius = 1 / Math.tan(theta / 2);
    const maxR = (Math.min(la, lb) * 0.5) / tangentPerRadius;
    const r = Math.min(corner, maxR);
    if (r < 1e-4) {
      path.lineTo(cur.x * scale, cur.y * scale);
      continue;
    }
    path.arcTo(cur.x * scale, cur.y * scale, next.x * scale, next.y * scale, r * scale);
  }
  path.closePath();
  return path;
}

const pathCache = new Map<string, Path2D>();

/** The gem outline centred at the origin, at the given radius in pixels. */
export function shapePath(type: GemType, radius: number): Path2D {
  const key = `${type}:${radius.toFixed(2)}`;
  let path = pathCache.get(key);
  if (!path) {
    const shape = SHAPES[type];
    path = polygonPath(shape.points, shape.corner, radius * shape.scale);
    pathCache.set(key, path);
  }
  return path;
}

/** Perimeter points at the given radius, for facet drawing. */
export function shapePoints(type: GemType, radius: number): Pt[] {
  const shape = SHAPES[type];
  const s = radius * shape.scale;
  return shape.points.map((p) => ({ x: p.x * s, y: p.y * s }));
}
