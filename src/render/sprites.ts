/**
 * Gems are drawn once per (style, type, size) into an offscreen canvas and
 * then stamped with drawImage, so the hot path never runs gradients.
 */
import type { GemType } from '../core/grid';
import type { GemStyle } from './styles/types';

export interface DrawOpts {
  alpha?: number;
  scaleX?: number;
  scaleY?: number;
  /** 0..1: how much extra light to add (used while a gem clears). */
  brighten?: number;
}

export class GemSprites {
  private cache = new Map<string, { canvas: HTMLCanvasElement; size: number }>();

  constructor(
    private style: GemStyle,
    private readonly dpr: number,
  ) {}

  setStyle(style: GemStyle): void {
    this.style = style;
    this.cache.clear();
  }

  private sprite(type: GemType, radius: number): { canvas: HTMLCanvasElement; size: number } {
    const r = Math.round(radius * 2) / 2;
    const key = `${type}:${r}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const size = Math.ceil(2 * r * (1 + this.style.haloPad));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(size * this.dpr);
    canvas.height = Math.ceil(size * this.dpr);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(this.dpr, this.dpr);
      ctx.translate(size / 2, size / 2);
      this.style.drawGem(ctx, type, r);
    }
    const entry = { canvas, size };
    this.cache.set(key, entry);
    return entry;
  }

  draw(ctx: CanvasRenderingContext2D, type: GemType, x: number, y: number, radius: number, opts: DrawOpts = {}): void {
    const { canvas, size } = this.sprite(type, radius);
    const alpha = opts.alpha ?? 1;
    if (alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(opts.scaleX ?? 1, opts.scaleY ?? 1);
    ctx.globalAlpha = alpha;
    ctx.drawImage(canvas, -size / 2, -size / 2, size, size);
    const brighten = opts.brighten ?? 0;
    if (brighten > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * brighten;
      ctx.drawImage(canvas, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
  }
}
