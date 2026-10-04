/**
 * Direction 1: Deep Night Garden. Translucent jewels lit from within, soft
 * bloom halos, warm gold lanterns, fireflies drifting over a midnight garden.
 */
import type { GemType } from '../../core/grid';
import { darken, lighten, rgba } from '../color';
import { gemShape, shapePath } from '../shapes';
import { Layers, Motes, glowDisc, highlight, roundRect } from './common';
import type { Ambient, GemColor, GemStyle, Palette } from './types';

const BASE: Record<GemType, string> = {
  star: '#ffc84a',
  heart: '#ff6fa8',
  drop: '#4aa8ff',
  leaf: '#45e49a',
  diamond: '#b57dff',
  sunstone: '#ff8d5c',
};

const palette: Palette = {
  bgTop: '#111846',
  bgBottom: '#050815',
  cellFill: 'rgba(255,255,255,0.045)',
  cellStroke: 'rgba(255,255,255,0.07)',
  cellRadius: 0.22,
  lantern: '#ffd27a',
  lanternGlow: '#ffb347',
  path: '#36457a',
  pathLit: '#ffd27a',
  ground: '#0d2a2b',
  groundFar: '#0b1b36',
  hint: '#ffe9a8',
  text: '#e9ecff',
};

function color(type: GemType): GemColor {
  const base = BASE[type];
  return { base, light: lighten(base, 0.55), dark: darken(base, 0.45), glow: lighten(base, 0.12) };
}

export const nightGarden: GemStyle = {
  id: 'night',
  name: 'Deep Night Garden',
  tagline: 'Warm jewels lit from within, in a firefly night.',
  description:
    'A deep indigo-to-midnight sky with a soft vignette and drifting fireflies. Gems are translucent and lit from inside, with a soft bloom halo, a gentle highlight and a rim of light, in rich jewel tones. Lanterns glow warm gold. Cells are barely-there glass. The warmest and most comfortable of the three in a dark car.',
  palette,
  haloPad: 0.6,
  gemColor: color,

  drawGem(ctx, type, r) {
    const c = color(type);
    const path = shapePath(type, r);
    glowDisc(ctx, 0, 0, r * 1.55, c.glow, 0.55);

    const body = ctx.createRadialGradient(-0.32 * r, -0.38 * r, r * 0.05, 0, 0, r * 1.15);
    body.addColorStop(0, c.light);
    body.addColorStop(0.42, c.base);
    body.addColorStop(1, c.dark);
    ctx.fillStyle = body;
    ctx.fill(path);

    ctx.save();
    ctx.clip(path);
    glowDisc(ctx, 0, r * 0.28, r * 0.95, c.light, 0.42);
    if (type === 'leaf') {
      const a = -0.38;
      const tx = Math.sin(a) * 0.82 * r * gemShape('leaf').scale;
      const ty = -Math.cos(a) * 0.82 * r * gemShape('leaf').scale;
      ctx.strokeStyle = rgba(c.light, 0.45);
      ctx.lineWidth = r * 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(-tx, -ty);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = r * 0.075;
    ctx.strokeStyle = rgba(c.light, 0.62);
    ctx.stroke(path);

    highlight(ctx, -0.33 * r, -0.4 * r, r * 0.3, r * 0.17, -0.65, 0.8);
    highlight(ctx, 0.28 * r, 0.32 * r, r * 0.14, r * 0.08, 0.8, 0.3);
  },

  createAmbient(w, h, seed): Ambient {
    const count = Math.max(8, Math.round((w * h) / 13000));
    return new Layers([new Motes(w, h, seed, count, '#ffd27a', [1.1, 2.1], 0.8, 0.55)]);
  },

  drawBackground(ctx, w, h, t, ambient) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette.bgTop);
    g.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    glowDisc(ctx, w * 0.5, h * 0.9, w * 0.95, '#0e3a48', 0.55);
    glowDisc(ctx, w * 0.5, h * 0.05, w * 0.85, '#2c2c72', 0.4);
    ambient.draw(ctx, w, h, t);
  },

  drawCell(ctx, x, y, s) {
    roundRect(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * palette.cellRadius);
    ctx.fillStyle = palette.cellFill;
    ctx.fill();
    ctx.strokeStyle = palette.cellStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  },
};
