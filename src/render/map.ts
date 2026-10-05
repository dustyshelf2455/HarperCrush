/**
 * The lantern path (DESIGN.md 3.5): where every lantern stands, as a pure
 * function of its number so the same path is drawn on every visit; the
 * drawing pieces shared by the map scene and the Stage 1 mockup (the winding
 * ribbon, stepping lights, lantern posts); and the mockup glimpse itself.
 */
import { createRng, deriveSeed } from '../shared/rng';
import { lighten, rgba } from './color';
import { COMPANIONS, type CompanionId, drawCompanion, drawLantern } from './creatures';
import type { Pt } from './shapes';
import { breath, glowDisc } from './styles/common';
import type { Ambient, GemStyle, Palette } from './styles/types';

// ------------------------------------------------------------ pure geometry

/** Where lantern `n` stands: x in [-1, 1] across the path's width, y in lantern units rising with n. */
export interface LanternPos {
  x: number;
  y: number;
}

const PATH_SEED = 0x6c616e74;

/** The horizontal reach of the path, as a fraction of its half width, before the jitter. */
const WIND = 0.72;
const WIND_JITTER = 0.16;
const RISE_JITTER = 0.07;

/**
 * Lantern `n` (1-based). The path winds left and right about every three
 * lanterns with a little seeded jitter, so it reads as a path and not a wave,
 * and no lantern ever lands outside [-0.92, 0.92].
 */
export function lanternPoint(n: number): LanternPos {
  const rng = createRng(deriveSeed(PATH_SEED, n));
  const raw = WIND * Math.sin(n * 1.95 + 0.6) + rng.range(-WIND_JITTER, WIND_JITTER);
  const x = Math.max(-0.92, Math.min(0.92, raw));
  const y = n + rng.range(-RISE_JITTER, RISE_JITTER);
  return { x, y };
}

/** A point on the Catmull-Rom curve through p0..p3, between p1 (f = 0) and p2 (f = 1). */
export function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, f: number): Pt {
  const f2 = f * f;
  const f3 = f2 * f;
  const x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * f + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * f2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * f3);
  const y = 0.5 * (2 * p1.y + (-p0.y + p2.y) * f + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * f2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * f3);
  return { x, y };
}

/** The path between lantern `n` and `n + 1`, at fraction `f` of the way, in lantern units. */
export function pathPoint(n: number, f: number): LanternPos {
  const k = Math.max(0, Math.min(1, f));
  return catmullRom(lanternPoint(Math.max(1, n - 1)), lanternPoint(n), lanternPoint(n + 1), lanternPoint(n + 2), k);
}

/** A smooth polyline through the given points (Catmull-Rom, `per` segments between neighbours). */
export function smoothPolyline(points: readonly Pt[], per: number): Pt[] {
  const out: Pt[] = [];
  if (points.length === 0) return out;
  if (points.length === 1) return [points[0] as Pt];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)] as Pt;
    const p1 = points[i] as Pt;
    const p2 = points[i + 1] as Pt;
    const p3 = points[Math.min(points.length - 1, i + 2)] as Pt;
    for (let k = 0; k < per; k++) out.push(catmullRom(p0, p1, p2, p3, k / per));
  }
  out.push(points[points.length - 1] as Pt);
  return out;
}

// ------------------------------------------------------------ drawing pieces

export interface PathColors {
  path: string;
  pathLit: string;
}

/**
 * The outline of a ribbon along `pts` whose half width at each point is
 * `halfAt(i)`: the left offsets forward, then the right offsets back.
 */
export function ribbonOutline(pts: readonly Pt[], halfAt: (i: number) => number): Pt[] {
  const n = pts.length;
  if (n < 2) return [];
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)] as Pt;
    const b = pts[Math.min(n - 1, i + 1)] as Pt;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const hw = halfAt(i);
    const p = pts[i] as Pt;
    left.push({ x: p.x + nx * hw, y: p.y + ny * hw });
    right.push({ x: p.x - nx * hw, y: p.y - ny * hw });
  }
  return left.concat(right.reverse());
}

function fillOutline(ctx: CanvasRenderingContext2D, outline: readonly Pt[], style: string | CanvasGradient): void {
  if (outline.length < 3) return;
  ctx.beginPath();
  outline.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

/** How the far end of the ribbon melts into the horizon: fully clear at `clearY`, solid from `solidY` down. */
export interface RibbonFade {
  clearY: number;
  solidY: number;
}

/**
 * The path as a soft ribbon: a dark edge, the ribbon itself, a lighter crown
 * and a warm centre line along the part she has walked. `widthAt(i)` is the
 * full width at `pts[i]`, so the ribbon can narrow toward the horizon.
 * `litUntil` is the index in `pts` up to which she has walked. Each pass is
 * one filled outline, so nothing overlaps and no beads show through the alpha;
 * with `fade`, each fill is a vertical gradient that thins out toward the horizon.
 */
export function drawPathRibbon(ctx: CanvasRenderingContext2D, pts: readonly Pt[], colors: PathColors, widthAt: (i: number) => number, litUntil: number, fade?: RibbonFade): void {
  if (pts.length < 2) return;
  ctx.save();
  const paint = (color: string, alpha: number): string | CanvasGradient => {
    if (!fade) return rgba(color, alpha);
    const g = ctx.createLinearGradient(0, fade.clearY, 0, fade.solidY);
    g.addColorStop(0, rgba(color, 0));
    g.addColorStop(1, rgba(color, alpha));
    return g;
  };
  const passes: Array<[number, string, number]> = [
    [0.7, '#000000', 0.14],
    [0.5, colors.path, 0.62],
    [0.3, lighten(colors.path, 0.18), 0.2],
    [0.14, colors.pathLit, 0.07],
  ];
  for (const [k, color, alpha] of passes) fillOutline(ctx, ribbonOutline(pts, (i) => widthAt(i) * k), paint(color, alpha));
  const walked = Math.min(pts.length, Math.max(0, litUntil) + 1);
  if (walked >= 2) fillOutline(ctx, ribbonOutline(pts.slice(0, walked), (i) => widthAt(i) * 0.13), paint(colors.pathLit, 0.16));
  ctx.restore();
}

/** Three small stepping lights between two lanterns she has passed, each on a slow pulse. */
export function drawSteppingLights(ctx: CanvasRenderingContext2D, segment: readonly Pt[], color: string, t: number, phase: number, alpha = 1): void {
  if (segment.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let k = 1; k <= 3; k++) {
    const i = Math.round(((segment.length - 1) * k) / 4);
    const p = segment[i];
    if (!p) continue;
    const a = (0.32 + 0.14 * Math.sin(t * 0.9 + phase + k * 1.7)) * alpha;
    glowDisc(ctx, p.x, p.y, 13, color, a);
    ctx.fillStyle = rgba('#fff4d6', a * 0.9);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Where a post lantern's parts land, for perching a companion and aiming the light. */
export interface PostLayout {
  /** Centre of the glass. */
  lantern: Pt;
  /** Where a companion sits: on the lantern's cap. */
  perch: Pt;
}

export function postLayout(x: number, groundY: number, s: number): PostLayout {
  const lanternY = groundY - s * 1.32;
  return { lantern: { x, y: lanternY }, perch: { x, y: lanternY - s * 0.37 - s * 0.46 } };
}

/**
 * A lantern on a slim post, standing on the path at (x, groundY), its light
 * spilling onto the ground around it. `lit` is 0..1; an unlit lantern keeps a
 * faint cool tint so it reads as waiting, never as locked (DESIGN.md 3.5).
 */
export function drawLanternPost(ctx: CanvasRenderingContext2D, x: number, groundY: number, s: number, lit: number, palette: Palette, t: number, coolTint: string, alpha = 1): PostLayout {
  const layout = postLayout(x, groundY, s);
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (lit > 0.05) {
    // Light pooling on the ground: a flattened glow at the foot of the post.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, groundY + s * 0.05);
    ctx.scale(1, 0.38);
    glowDisc(ctx, 0, 0, s * 1.9, palette.lanternGlow, 0.3 * lit * (0.85 + 0.15 * breath(t)));
    ctx.restore();
  }
  // Post: a slim rounded stem with a small foot.
  ctx.strokeStyle = '#3b3350';
  ctx.lineCap = 'round';
  ctx.lineWidth = s * 0.11;
  ctx.beginPath();
  ctx.moveTo(x, groundY);
  ctx.lineTo(x, layout.lantern.y + s * 0.35);
  ctx.stroke();
  ctx.fillStyle = '#352e48';
  ctx.beginPath();
  ctx.ellipse(x, groundY, s * 0.22, s * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  drawLantern(ctx, layout.lantern.x, layout.lantern.y, s, lit, palette, t, { ring: false, coolTint });
  ctx.restore();
  return layout;
}

// ------------------------------------------------------------------ mockup

export interface MapMockOptions {
  companion: CompanionId;
  seed: number;
  onPickCompanion?: (id: CompanionId) => void;
}

const LANTERNS = 6;
const CURRENT = 2;

/**
 * The Stage 1 glimpse: a short run of the path across a small canvas, her
 * companion on the current lantern, and the two other creatures waiting by
 * the path. Tapping a waiting creature makes it the companion, as the game does.
 */
export class MapMock {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private ambient: Ambient | null = null;
  private w = 360;
  private h = 260;
  private points: Pt[] = [];
  private waiting: Array<{ id: CompanionId; x: number; y: number }> = [];
  private companion: CompanionId;
  private time = 0;
  private lastNow = 0;
  private raf = 0;
  private running = false;
  private sparkle: { x: number; y: number; t: number } | null = null;
  private readonly onClick = (e: MouseEvent): void => this.handleClick(e);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private style: GemStyle,
    private readonly opts: MapMockOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.companion = opts.companion;
    this.resize();
    canvas.addEventListener('click', this.onClick);
  }

  setStyle(style: GemStyle): void {
    this.style = style;
    this.ambient = style.createAmbient(this.w, this.h, this.opts.seed + 7);
    this.draw();
  }

  setCompanion(id: CompanionId): void {
    this.companion = id;
    this.layoutWaiting();
  }

  resize(): void {
    const parentWidth = this.canvas.parentElement?.clientWidth ?? 390;
    this.w = Math.max(280, Math.min(430, Math.floor(parentWidth)));
    this.h = Math.round(this.w * 0.74);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ambient = this.style.createAmbient(this.w, this.h, this.opts.seed + 7);
    // The real path turned on its side: lantern n's sideways wander becomes height.
    this.points = [];
    for (let i = 0; i < LANTERNS; i++) {
      const p = lanternPoint(i + 1);
      const f = i / (LANTERNS - 1);
      this.points.push({ x: this.w * (0.1 + 0.8 * f), y: this.h * (0.72 - 0.13 * p.x) });
    }
    this.layoutWaiting();
    this.draw();
  }

  private layoutWaiting(): void {
    const cur = this.points[CURRENT];
    if (!cur) return;
    const others = COMPANIONS.filter((c) => c !== this.companion);
    this.waiting = others.map((id, i) => ({ id, x: cur.x + (i === 0 ? -1 : 1) * this.w * 0.2, y: cur.y + this.h * 0.06 + (i === 0 ? 0 : this.h * 0.08) }));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.canvas.removeEventListener('click', this.onClick);
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.w;
    const y = ((e.clientY - rect.top) / rect.height) * this.h;
    let best: { id: CompanionId; d: number } | null = null;
    for (const c of this.waiting) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < 34 && (!best || d < best.d)) best = { id: c.id, d };
    }
    if (!best) return;
    this.companion = best.id;
    this.layoutWaiting();
    const cur = this.points[CURRENT];
    if (cur) this.sparkle = { x: cur.x, y: postLayout(cur.x, cur.y, 26).perch.y, t: 0 };
    this.opts.onPickCompanion?.(best.id);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(50, now - this.lastNow);
    this.lastNow = now;
    this.time += dt;
    if (this.sparkle) {
      this.sparkle.t += dt;
      if (this.sparkle.t > 700) this.sparkle = null;
    }
    this.draw();
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.time / 1000;
    const pal = this.style.palette;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ambient) this.style.drawBackground(ctx, w, h, t, this.ambient);

    // Ground: two soft hill layers.
    ctx.fillStyle = rgba(pal.groundFar, 0.9);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.5 + Math.sin(x / 70 + 1) * h * 0.05 + Math.sin(x / 31) * h * 0.02);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.ground;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.66 + Math.sin(x / 55 + 3) * h * 0.04);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    const pts = this.points;
    if (pts.length < 2) return;
    const per = 10;
    const smooth = smoothPolyline(pts, per);
    drawPathRibbon(ctx, smooth, { path: pal.path, pathLit: pal.pathLit }, () => 14, CURRENT * per);
    for (let i = 0; i < CURRENT; i++) drawSteppingLights(ctx, smooth.slice(i * per, (i + 1) * per + 1), pal.pathLit, t, i);

    const lanternSize = 26;
    let perch: Pt | null = null;
    pts.forEach((p, i) => {
      const layout = drawLanternPost(ctx, p.x, p.y, lanternSize, i <= CURRENT ? 1 : 0.1, pal, t + i, pal.path);
      if (i === CURRENT) perch = layout.perch;
    });

    if (perch) {
      const { x, y } = perch as Pt;
      glowDisc(ctx, x, y, 30, pal.lantern, 0.12 + 0.08 * breath(t));
      drawCompanion(ctx, this.companion, x, y, 38, t, { glow: 1.1 });
    }
    const perchX = perch ? (perch as Pt).x : w / 2;
    this.waiting.forEach((c, i) => {
      // Friends turn to look at her.
      drawCompanion(ctx, c.id, c.x, c.y, 32, t + i, { glow: 0.8, facing: c.x < perchX ? 1 : -1 });
    });
    if (this.sparkle) {
      const p = this.sparkle.t / 700;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, this.sparkle.x, this.sparkle.y, 20 + p * 40, '#ffffff', 0.5 * (1 - p));
      ctx.restore();
    }
  }
}
