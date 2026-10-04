/**
 * Direction 2: Stained-Glass Lantern. Faceted translucent glass with dark
 * leading, lit from behind, inside a warm lantern.
 */
import type { GemType } from '../../core/grid';
import { darken, lighten, rgba, withLightness } from '../color';
import { shapePath, shapePoints } from '../shapes';
import { Layers, Motes, fillPolygon, glowDisc, highlight, roundRect, wedges } from './common';
import type { Ambient, GemColor, GemStyle, Palette } from './types';

const BASE: Record<GemType, string> = {
  star: '#ffbe2e',
  heart: '#ff4f8f',
  drop: '#2f8cff',
  leaf: '#2fd37f',
  diamond: '#a35cff',
  sunstone: '#ff7a3a',
};

const LEAD = '#1b0c07';

const palette: Palette = {
  bgTop: '#3a1a0c',
  bgBottom: '#0b0403',
  cellFill: 'rgba(255,196,120,0.05)',
  cellStroke: 'rgba(27,12,7,0.95)',
  cellRadius: 0.08,
  lantern: '#ffd58a',
  lanternGlow: '#ff9c3a',
  path: '#5a3a22',
  pathLit: '#ffcf7a',
  ground: '#2b140b',
  groundFar: '#1a0c07',
  hint: '#ffe2b0',
  text: '#fff1dd',
};

function color(type: GemType): GemColor {
  const base = BASE[type];
  return { base, light: lighten(base, 0.45), dark: darken(base, 0.5), glow: base };
}

const SHADES = [0.16, -0.06, 0.08, -0.14, 0.12, 0.0, -0.09];

export const stainedGlass: GemStyle = {
  id: 'glass',
  name: 'Stained-Glass Lantern',
  tagline: 'Faceted glass with dark leading, lit from behind.',
  description:
    'Gems as pieces of faceted, translucent stained glass with fine dark leading and light shining through from behind, on a background like the inside of a warm lantern. Bolder and more graphic, very shape-forward, with strong contrast. Reads beautifully at a glance; the risk is that it feels slightly less soft than the garden.',
  palette,
  haloPad: 0.65,
  gemColor: color,

  drawGem(ctx, type, r) {
    const c = color(type);
    const path = shapePath(type, r);
    const pts = shapePoints(type, r);
    glowDisc(ctx, 0, 0, r * 1.6, c.glow, 0.62);

    const centre = { x: -0.12 * r, y: -0.1 * r };
    const ws = wedges(pts, centre, 7);
    ws.forEach((w, i) => fillPolygon(ctx, w, withLightness(c.base, SHADES[i % SHADES.length] ?? 0)));

    ctx.save();
    ctx.clip(path);
    const through = ctx.createRadialGradient(-0.25 * r, -0.3 * r, 0, 0, 0, r * 1.1);
    through.addColorStop(0, 'rgba(255,255,255,0.4)');
    through.addColorStop(0.5, 'rgba(255,255,255,0.06)');
    through.addColorStop(1, 'rgba(0,0,0,0.2)');
    ctx.fillStyle = through;
    ctx.fill(path);
    ctx.strokeStyle = 'rgba(27,12,7,0.6)';
    ctx.lineWidth = r * 0.045;
    ctx.lineCap = 'round';
    for (const w of ws) {
      const p = w[1];
      if (!p) continue;
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    // Glass thickness: a lighter band just inside the edge.
    ctx.lineWidth = r * 0.24;
    ctx.strokeStyle = rgba(c.light, 0.22);
    ctx.stroke(path);
    ctx.restore();

    ctx.lineWidth = r * 0.13;
    ctx.strokeStyle = LEAD;
    ctx.lineJoin = 'round';
    ctx.stroke(path);

    highlight(ctx, -0.3 * r, -0.36 * r, r * 0.22, r * 0.12, -0.5, 0.55);
  },

  createAmbient(w, h, seed): Ambient {
    const count = Math.max(6, Math.round((w * h) / 22000));
    return new Layers([new Motes(w, h, seed, count, '#ffcf8a', [0.7, 1.5], 0.5, 0.45)]);
  },

  drawBackground(ctx, w, h, t, ambient) {
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.85);
    g.addColorStop(0, '#4a2410');
    g.addColorStop(0.55, '#21100a');
    g.addColorStop(1, '#0a0403');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // Candle warmth: two slow sines, a few percent at most, never a flicker.
    const warmth = 0.5 + 0.25 * Math.sin(t * 0.9) + 0.25 * Math.sin(t * 1.7 + 1);
    glowDisc(ctx, w * 0.5, h * 0.4, w * 0.75, '#ff9a3a', 0.09 + 0.03 * warmth);
    ambient.draw(ctx, w, h, t);
  },

  drawCell(ctx, x, y, s) {
    roundRect(ctx, x, y, s, s, s * palette.cellRadius);
    ctx.fillStyle = palette.cellFill;
    ctx.fill();
    ctx.strokeStyle = palette.cellStroke;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  },
};
