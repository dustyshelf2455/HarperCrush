/** Drawing helpers shared by the three visual styles. */
import { createRng } from '../../shared/rng';
import { rgba } from '../color';
import type { Pt } from '../shapes';
import type { Ambient } from './types';

const GLOW_SIZE = 256;
const glowCache = new Map<string, HTMLCanvasElement>();

/**
 * A soft radial glow. The gradient is baked once per colour into a sprite and
 * stamped with globalAlpha, which is pixel-equivalent to the gradient (every
 * stop scales linearly with alpha) and avoids a gradient allocation per call.
 */
export function glowDisc(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number): void {
  if (r <= 0 || alpha <= 0) return;
  let sprite = glowCache.get(color);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = GLOW_SIZE;
    sprite.height = GLOW_SIZE;
    const c = sprite.getContext('2d');
    if (!c) return;
    const half = GLOW_SIZE / 2;
    const g = c.createRadialGradient(half, half, 0, half, half, half);
    g.addColorStop(0, rgba(color, 1));
    g.addColorStop(0.5, rgba(color, 0.35));
    g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
    glowCache.set(color, sprite);
  }
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = previous * Math.min(1, alpha);
  ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = previous;
}

export function softRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, width: number, color: string, alpha: number): void {
  if (r <= 0 || alpha <= 0) return;
  const inner = Math.max(0, r - width);
  const outer = r + width;
  const g = ctx.createRadialGradient(x, y, inner, x, y, outer);
  g.addColorStop(0, rgba(color, 0));
  g.addColorStop(0.5, rgba(color, alpha));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - outer, y - outer, outer * 2, outer * 2);
}

export function highlight(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rotation: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, `rgba(255,255,255,${alpha})`);
  g.addColorStop(0.6, `rgba(255,255,255,${alpha * 0.4})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Split a perimeter into `groups` wedges from a centre point. */
export function wedges(points: readonly Pt[], centre: Pt, groups: number): Pt[][] {
  const n = points.length;
  const out: Pt[][] = [];
  for (let g = 0; g < groups; g++) {
    const from = Math.floor((g * n) / groups);
    const to = Math.floor(((g + 1) * n) / groups);
    const wedge: Pt[] = [centre];
    for (let i = from; i <= to; i++) wedge.push(points[i % n] as Pt);
    out.push(wedge);
  }
  return out;
}

export function fillPolygon(ctx: CanvasRenderingContext2D, poly: readonly Pt[], style: string): void {
  if (poly.length < 3) return;
  ctx.beginPath();
  poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.fillStyle = style;
  ctx.fill();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Breathing curve in [0, 1]: a 7.5 s cycle, in for 3.3 s and out for 4.2 s,
 * smooth at both ends. Used for the vignette and resting glows.
 */
export function breath(t: number): number {
  const period = 7.5;
  const inhale = 3.3;
  const phase = ((t % period) + period) % period;
  const x = phase < inhale ? phase / inhale : 1 - (phase - inhale) / (period - inhale);
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

export function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

export function easeInOutSine(x: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

interface Mote {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  drift: number;
}

/** Drifting glowing dots: fireflies, dust in candlelight, slow sparks. */
export class Motes implements Ambient {
  private readonly motes: Mote[];

  constructor(
    w: number,
    h: number,
    seed: number,
    count: number,
    private readonly color: string,
    radius: [number, number],
    private readonly alpha: number,
    private readonly speed = 1,
  ) {
    const rng = createRng(seed);
    this.motes = Array.from({ length: count }, () => ({
      x: rng.range(0, w),
      y: rng.range(0, h),
      r: rng.range(radius[0], radius[1]),
      phase: rng.range(0, Math.PI * 2),
      speed: rng.range(0.6, 1.4),
      drift: rng.range(-1, 1),
    }));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const tt = t * this.speed * m.speed;
      const x = ((m.x + Math.sin(tt * 0.21 + m.phase) * 26 + m.drift * tt * 4) % (w + 40) + (w + 40)) % (w + 40) - 20;
      const y = ((m.y + Math.cos(tt * 0.17 + m.phase * 1.3) * 18 - tt * 3) % (h + 40) + (h + 40)) % (h + 40) - 20;
      // Slow pulse (period 2.8 to 4.4 s), never a flicker.
      const pulse = 0.55 + 0.45 * Math.sin(tt * 1.7 + m.phase);
      glowDisc(ctx, x, y, m.r * 3.2, this.color, this.alpha * pulse * 0.6);
      ctx.fillStyle = rgba(this.color, this.alpha * (0.5 + 0.5 * pulse));
      ctx.beginPath();
      ctx.arc(x, y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  period: number;
}

/** Fixed twinkling stars with slow, gentle pulses. */
export class Stars implements Ambient {
  private readonly stars: Star[];

  constructor(w: number, h: number, seed: number, count: number, private readonly color: string, private readonly alpha: number) {
    const rng = createRng(seed);
    this.stars = Array.from({ length: count }, () => ({
      x: rng.range(0, w),
      y: rng.range(0, h),
      r: rng.range(0.6, 1.7),
      phase: rng.range(0, Math.PI * 2),
      period: rng.range(3, 7),
    }));
  }

  draw(ctx: CanvasRenderingContext2D, _w: number, _h: number, t: number): void {
    ctx.save();
    for (const s of this.stars) {
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((t / s.period) * Math.PI * 2 + s.phase));
      ctx.fillStyle = rgba(this.color, this.alpha * tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.3) glowDisc(ctx, s.x, s.y, s.r * 4, this.color, this.alpha * tw * 0.25);
    }
    ctx.restore();
  }
}

/** Several ambient layers drawn in order. */
export class Layers implements Ambient {
  constructor(private readonly layers: Ambient[]) {}
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    for (const l of this.layers) l.draw(ctx, w, h, t);
  }
}
