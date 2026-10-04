/**
 * Direction 3: Aurora Crystal. Crisp faceted crystals with cool iridescence
 * under a night sky with slow aurora ribbons and twinkling stars.
 */
import type { GemType } from '../../core/grid';
import { darken, lighten, rgba, shiftHue, withLightness } from '../color';
import { shapePath, shapePoints } from '../shapes';
import { Layers, Stars, fillPolygon, glowDisc, roundRect, wedges } from './common';
import type { Ambient, GemColor, GemStyle, Palette } from './types';

const BASE: Record<GemType, string> = {
  star: '#ffd35c',
  heart: '#ff79b8',
  drop: '#5cb8ff',
  leaf: '#5af0c0',
  diamond: '#b48bff',
  sunstone: '#ff9a6a',
};

const palette: Palette = {
  bgTop: '#071331',
  bgBottom: '#030612',
  cellFill: 'rgba(170,215,255,0.06)',
  cellStroke: 'rgba(170,215,255,0.11)',
  cellRadius: 0.18,
  lantern: '#e4f6ff',
  lanternGlow: '#7fd8ff',
  path: '#2b4a6a',
  pathLit: '#bfefff',
  ground: '#0b2238',
  groundFar: '#08192c',
  hint: '#d8f6ff',
  text: '#e6f4ff',
};

function color(type: GemType): GemColor {
  const base = BASE[type];
  return { base, light: lighten(base, 0.6), dark: darken(base, 0.4), glow: lighten(base, 0.2) };
}

const HUES = [-16, 10, -6, 22, -12, 8, 0, -24];
const LUMS = [0.12, -0.08, 0.05, 0.16, -0.12, 0.02, 0.09, -0.07];

class Ribbons implements Ambient {
  private readonly ribbons = [
    { color: '#3de6c8', base: 0.22, amp: 0.05, k: 0.012, speed: 0.11, phase: 0, thick: 0.1 },
    { color: '#9b6bff', base: 0.33, amp: 0.045, k: 0.009, speed: -0.08, phase: 2.1, thick: 0.09 },
    { color: '#5cff9d', base: 0.14, amp: 0.035, k: 0.015, speed: 0.07, phase: 4.2, thick: 0.07 },
  ];

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.ribbons) {
      const top: Array<[number, number]> = [];
      const bottom: Array<[number, number]> = [];
      for (let x = -20; x <= w + 20; x += 14) {
        const y = h * (r.base + r.amp * Math.sin(x * r.k + t * r.speed + r.phase));
        const thick = h * r.thick * (1 + 0.3 * Math.sin(x * r.k * 0.6 - t * r.speed * 1.3 + r.phase));
        top.push([x, y]);
        bottom.push([x, y + thick]);
      }
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, rgba(r.color, 0));
      grad.addColorStop(0.25, rgba(r.color, 0.16));
      grad.addColorStop(0.6, rgba(r.color, 0.2));
      grad.addColorStop(1, rgba(r.color, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      top.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      for (let i = bottom.length - 1; i >= 0; i--) {
        const p = bottom[i] as [number, number];
        ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      ctx.fill();
      // Brighter core line inside the band.
      ctx.strokeStyle = rgba(r.color, 0.12);
      ctx.lineWidth = h * r.thick * 0.35;
      ctx.beginPath();
      top.forEach(([x, y], i) => {
        const yy = y + h * r.thick * 0.45;
        if (i === 0) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      });
      ctx.stroke();
    }
    ctx.restore();
  }
}

export const auroraCrystal: GemStyle = {
  id: 'aurora',
  name: 'Aurora Crystal',
  tagline: 'Crisp iridescent crystals under the northern lights.',
  description:
    'Crisp, faceted crystals with cool iridescence, gold kept for the star, on a night sky with slow aurora ribbons and twinkling stars. Cooler and more "ice magic". Striking in the dark; the risk is that it is less warm and cosy than the other two.',
  palette,
  haloPad: 0.55,
  gemColor: color,

  drawGem(ctx, type, r) {
    const c = color(type);
    const path = shapePath(type, r);
    const pts = shapePoints(type, r);
    glowDisc(ctx, 0, 0, r * 1.5, c.glow, 0.4);

    ctx.fillStyle = c.base;
    ctx.fill(path);

    ctx.save();
    ctx.clip(path);
    const centre = { x: 0.08 * r, y: 0.06 * r };
    const ws = wedges(pts, centre, 8);
    ws.forEach((w, i) => fillPolygon(ctx, w, withLightness(shiftHue(c.base, HUES[i % HUES.length] ?? 0), LUMS[i % LUMS.length] ?? 0)));
    const sheen = ctx.createLinearGradient(-r, -r, r, r);
    sheen.addColorStop(0, 'rgba(255,255,255,0.34)');
    sheen.addColorStop(0.45, 'rgba(255,255,255,0.02)');
    sheen.addColorStop(0.75, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(255,255,255,0.16)');
    ctx.fillStyle = sheen;
    ctx.fill(path);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = r * 0.03;
    for (const w of ws) {
      const p = w[1];
      if (!p) continue;
      ctx.beginPath();
      ctx.moveTo(centre.x, centre.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.lineWidth = r * 0.055;
    ctx.strokeStyle = rgba(c.light, 0.95);
    ctx.lineJoin = 'round';
    ctx.stroke(path);

    // A sharp specular streak and a dot.
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.09;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.moveTo(-0.5 * r, -0.2 * r);
    ctx.lineTo(-0.2 * r, -0.52 * r);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0.3 * r, 0.3 * r, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
  },

  createAmbient(w, h, seed): Ambient {
    const count = Math.max(30, Math.round((w * h) / 2600));
    return new Layers([new Stars(w, h, seed, count, '#dff4ff', 0.85), new Ribbons()]);
  },

  drawBackground(ctx, w, h, t, ambient) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, palette.bgTop);
    g.addColorStop(1, palette.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    glowDisc(ctx, w * 0.5, h * 0.95, w * 0.9, '#0a2a44', 0.5);
    ambient.draw(ctx, w, h, t);
  },

  drawCell(ctx, x, y, s) {
    roundRect(ctx, x + 2, y + 2, s - 4, s - 4, s * palette.cellRadius);
    ctx.fillStyle = palette.cellFill;
    ctx.fill();
    ctx.strokeStyle = palette.cellStroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  },
};
