/**
 * Direction 1: Deep Night Garden. Translucent jewels lit from within, soft
 * bloom halos, warm gold lanterns, fireflies drifting over a midnight garden.
 */
import type { GemType } from '../../core/grid';
import { darken, lighten, rgba } from '../color';
import { gemShape, shapePath, shapePoints } from '../shapes';
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
    'A deep indigo-to-midnight sky with a soft vignette and drifting fireflies. Gems are translucent and lit from inside, with a restrained halo, a crisp rim of light and a clean highlight, in rich jewel tones. Lanterns glow warm gold. Cells are barely-there glass. The warmest and most comfortable of the three in a dark car.',
  palette,
  haloPad: 0.45,
  gemColor: color,

  /**
   * A gem (the Stage 3 play-test art pass: "artisanal, as if made by hand"): a deeper body with a
   * bright heart off centre, cut facets that catch the light (a smaller inner shape and fine lines
   * to the corners), a crisp rim, a bottom bounce of its own colour, and a four-point glint.
   */
  drawGem(ctx, type, r) {
    const c = color(type);
    const path = shapePath(type, r);
    glowDisc(ctx, 0, 0, r * 1.3, c.glow, 0.3);

    const body = ctx.createRadialGradient(-0.3 * r, -0.36 * r, r * 0.04, 0.05 * r, 0.1 * r, r * 1.2);
    body.addColorStop(0, lighten(c.light, 0.25));
    body.addColorStop(0.3, c.light);
    body.addColorStop(0.62, c.base);
    body.addColorStop(1, darken(c.dark, 0.2));
    ctx.fillStyle = body;
    ctx.fill(path);

    ctx.save();
    ctx.clip(path);
    glowDisc(ctx, 0, r * 0.28, r * 0.9, c.light, 0.36);
    // Facets: the table (a smaller inner shape) and fine lines from its corners to the outer corners.
    const inner = shapePath(type, r * 0.6);
    ctx.save();
    ctx.translate(-0.04 * r, -0.08 * r);
    ctx.strokeStyle = rgba(c.light, 0.5);
    ctx.lineWidth = Math.max(0.8, r * 0.035);
    ctx.stroke(inner);
    const table = ctx.createRadialGradient(-0.15 * r, -0.2 * r, 0, 0, 0, r * 0.62);
    table.addColorStop(0, rgba('#ffffff', 0.22));
    table.addColorStop(1, rgba(c.light, 0));
    ctx.fillStyle = table;
    ctx.fill(inner);
    ctx.restore();
    const outer = shapePoints(type, r);
    const innerPts = shapePoints(type, r * 0.6);
    ctx.strokeStyle = rgba(c.light, 0.3);
    ctx.lineWidth = Math.max(0.6, r * 0.025);
    ctx.beginPath();
    for (let i = 0; i < outer.length; i += Math.max(1, Math.floor(outer.length / 8))) {
      const o = outer[i] as { x: number; y: number };
      const n = innerPts[i] as { x: number; y: number };
      ctx.moveTo(o.x, o.y);
      ctx.lineTo(n.x - 0.04 * r, n.y - 0.08 * r);
    }
    ctx.stroke();
    // A bounce of light along the lower edge, as if the gem sits on something lit.
    const bounce = ctx.createLinearGradient(0, r * 0.2, 0, r * 0.95);
    bounce.addColorStop(0, rgba(c.light, 0));
    bounce.addColorStop(1, rgba(lighten(c.light, 0.3), 0.45));
    ctx.fillStyle = bounce;
    ctx.fill(path);
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

    ctx.lineWidth = r * 0.07;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(c.light, 0.9);
    ctx.stroke(path);
    ctx.lineWidth = r * 0.03;
    ctx.strokeStyle = rgba('#ffffff', 0.35);
    ctx.stroke(path);

    highlight(ctx, -0.33 * r, -0.4 * r, r * 0.26, r * 0.14, -0.65, 0.9);
    highlight(ctx, 0.28 * r, 0.32 * r, r * 0.12, r * 0.07, 0.8, 0.35);
    // The glint: a small four-point star at the brightest spot.
    ctx.save();
    ctx.strokeStyle = rgba('#ffffff', 0.85);
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(0.8, r * 0.04);
    const gx = -0.42 * r;
    const gy = -0.46 * r;
    const gl = r * 0.16;
    ctx.beginPath();
    ctx.moveTo(gx - gl, gy);
    ctx.lineTo(gx + gl, gy);
    ctx.moveTo(gx, gy - gl);
    ctx.lineTo(gx, gy + gl);
    ctx.stroke();
    ctx.restore();
  },

  createAmbient(w, h, seed): Ambient {
    const count = Math.max(8, Math.round((w * h) / 13000));
    return new Layers([new Motes(w, h, seed, count, '#ffd27a', [0.9, 1.7], 0.75, 0.5)]);
  },

  drawBackground(ctx, w, h, t, ambient) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette.bgTop);
    g.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    glowDisc(ctx, w * 0.5, h * 0.92, w * 0.9, '#0e3a48', 0.38);
    glowDisc(ctx, w * 0.5, h * 0.04, w * 0.8, '#2c2c72', 0.28);
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
