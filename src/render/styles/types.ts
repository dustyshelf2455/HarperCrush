import type { GemType } from '../../core/grid';

export type StyleId = 'night' | 'glass' | 'aurora';

export interface GemColor {
  base: string;
  light: string;
  dark: string;
  glow: string;
}

export interface Palette {
  bgTop: string;
  bgBottom: string;
  cellFill: string;
  cellStroke: string;
  cellRadius: number;
  lantern: string;
  lanternGlow: string;
  path: string;
  pathLit: string;
  ground: string;
  groundFar: string;
  hint: string;
  text: string;
}

/** Slow background life: fireflies, stars, aurora, candle warmth. */
export interface Ambient {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
}

export interface GemStyle {
  readonly id: StyleId;
  readonly name: string;
  readonly tagline: string;
  readonly description: string;
  readonly palette: Palette;
  /** Extra sprite padding around a gem for its glow, as a fraction of radius. */
  readonly haloPad: number;
  gemColor(type: GemType): GemColor;
  /** Draw a gem centred at the origin with the given radius in pixels. */
  drawGem(ctx: CanvasRenderingContext2D, type: GemType, radius: number): void;
  /** Draw the full background (gradient and ambient life) for a canvas of w by h. */
  drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, ambient: Ambient): void;
  createAmbient(w: number, h: number, seed: number): Ambient;
  /** One board cell behind a gem. */
  drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void;
}
