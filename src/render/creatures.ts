/**
 * The map companions (firefly, glow fish, little hero), the lanterns on the
 * path, and the goal lantern. All drawn from primitives: rounded, cute,
 * glowing, and deliberately unlike any character she knows.
 */
import { rgba } from './color';
import { shapePath } from './shapes';
import { breath, glowDisc, highlight, roundRect } from './styles/common';
import type { Palette } from './styles/types';

export type CompanionId = 'firefly' | 'fish' | 'hero';
export const COMPANIONS: readonly CompanionId[] = ['firefly', 'fish', 'hero'];
export const COMPANION_NAMES: Record<CompanionId, string> = {
  firefly: 'Firefly',
  fish: 'Glow fish',
  hero: 'Little hero',
};

export interface CompanionOpts {
  /** Sleeping pose: eyes closed, slower glow. */
  sleep?: boolean;
  /** Extra glow strength multiplier. */
  glow?: number;
}

export function drawCompanion(ctx: CanvasRenderingContext2D, id: CompanionId, x: number, y: number, s: number, t: number, opts: CompanionOpts = {}): void {
  const pulse = 0.75 + 0.25 * breath(t);
  const glow = (opts.glow ?? 1) * pulse;
  switch (id) {
    case 'firefly':
      drawFirefly(ctx, x, y, s, t, glow, opts.sleep ?? false);
      break;
    case 'fish':
      drawFish(ctx, x, y, s, t, glow, opts.sleep ?? false);
      break;
    case 'hero':
      drawHero(ctx, x, y, s, t, glow, opts.sleep ?? false);
      break;
  }
}

function eyes(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, r: number, sleep: boolean, color = '#1b1230'): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = r * 0.9;
  for (const side of [-1, 1]) {
    if (sleep) {
      ctx.beginPath();
      ctx.moveTo(x + side * dx - r, y);
      ctx.quadraticCurveTo(x + side * dx, y + r * 0.9, x + side * dx + r, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x + side * dx, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x + side * dx - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
    }
  }
}

function drawFirefly(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, glow: number, sleep: boolean): void {
  ctx.save();
  glowDisc(ctx, x, y + s * 0.15, s * 0.95, '#ffd27a', 0.5 * glow);
  // Wings
  const flap = sleep ? 0 : Math.sin(t * 13) * 0.18;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(x + side * s * 0.2, y - s * 0.22);
    ctx.rotate(side * (0.55 + flap));
    ctx.scale(1, 0.5);
    ctx.fillStyle = 'rgba(205,232,255,0.5)';
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Body
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.55, 1);
  ctx.fillStyle = '#244a5a';
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Glowing abdomen
  glowDisc(ctx, x, y + s * 0.2, s * 0.42, '#ffd27a', 0.9 * glow);
  ctx.fillStyle = '#ffe49a';
  ctx.beginPath();
  ctx.arc(x, y + s * 0.19, s * 0.16, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.fillStyle = '#2f5d6e';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.3, s * 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2f5d6e';
  ctx.lineWidth = s * 0.03;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * s * 0.06, y - s * 0.42);
    ctx.quadraticCurveTo(x + side * s * 0.16, y - s * 0.56, x + side * s * 0.2, y - s * 0.5);
    ctx.stroke();
  }
  eyes(ctx, x, y - s * 0.31, s * 0.06, s * 0.035, sleep, '#f4fbff');
  ctx.restore();
}

function drawFish(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, glow: number, sleep: boolean): void {
  ctx.save();
  glowDisc(ctx, x, y, s * 0.9, '#6fe7ff', 0.45 * glow);
  // Tail
  const flick = sleep ? 0 : Math.sin(t * 4.5) * 0.25;
  ctx.save();
  ctx.translate(x - s * 0.36, y);
  ctx.rotate(flick);
  ctx.fillStyle = '#5cd7f0';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-s * 0.3, -s * 0.24);
  ctx.quadraticCurveTo(-s * 0.22, 0, -s * 0.3, s * 0.24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Body
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, 0.58);
  const g = ctx.createRadialGradient(-s * 0.1, -s * 0.25, 0, 0, 0, s * 0.45);
  g.addColorStop(0, '#a9f3ff');
  g.addColorStop(0.55, '#5fd3ee');
  g.addColorStop(1, '#2a93b8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Dorsal fin and belly light
  ctx.fillStyle = '#7fe2f7';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y - s * 0.22);
  ctx.quadraticCurveTo(x + s * 0.02, y - s * 0.42, x + s * 0.14, y - s * 0.22);
  ctx.closePath();
  ctx.fill();
  glowDisc(ctx, x + s * 0.02, y + s * 0.08, s * 0.3, '#dffbff', 0.5 * glow);
  // Eye
  eyes(ctx, x + s * 0.2, y - s * 0.04, 0, s * 0.045, sleep);
  // Bubbles
  if (!sleep) {
    for (let i = 0; i < 2; i++) {
      const p = ((t * 0.35 + i * 0.5) % 1 + 1) % 1;
      const bx = x + s * 0.42 + Math.sin(p * 6 + i) * s * 0.05;
      const by = y - s * 0.1 - p * s * 0.7;
      ctx.strokeStyle = `rgba(220,250,255,${(1 - p) * 0.7})`;
      ctx.lineWidth = s * 0.025;
      ctx.beginPath();
      ctx.arc(bx, by, s * (0.03 + 0.03 * i), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, glow: number, sleep: boolean): void {
  ctx.save();
  glowDisc(ctx, x, y, s * 0.95, '#b48bff', 0.45 * glow);
  // Cape
  const wave = sleep ? 0 : Math.sin(t * 2.3) * s * 0.06;
  const cape = ctx.createLinearGradient(x, y - s * 0.2, x, y + s * 0.5);
  cape.addColorStop(0, '#7b4dff');
  cape.addColorStop(1, '#ff6fb0');
  ctx.fillStyle = cape;
  ctx.beginPath();
  ctx.moveTo(x - s * 0.2, y - s * 0.14);
  ctx.lineTo(x + s * 0.2, y - s * 0.14);
  ctx.quadraticCurveTo(x + s * 0.42 + wave, y + s * 0.2, x + s * 0.34 - wave, y + s * 0.48);
  ctx.quadraticCurveTo(x, y + s * 0.4, x - s * 0.34 + wave, y + s * 0.48);
  ctx.quadraticCurveTo(x - s * 0.42 - wave, y + s * 0.2, x - s * 0.2, y - s * 0.14);
  ctx.closePath();
  ctx.fill();
  // Body
  const body = ctx.createLinearGradient(x, y - s * 0.15, x, y + s * 0.35);
  body.addColorStop(0, '#7f8dff');
  body.addColorStop(1, '#4654d8');
  ctx.fillStyle = body;
  roundRect(ctx, x - s * 0.19, y - s * 0.15, s * 0.38, s * 0.5, s * 0.15);
  ctx.fill();
  // Boots
  ctx.fillStyle = '#3a3f8f';
  roundRect(ctx, x - s * 0.17, y + s * 0.3, s * 0.14, s * 0.1, s * 0.04);
  ctx.fill();
  roundRect(ctx, x + s * 0.03, y + s * 0.3, s * 0.14, s * 0.1, s * 0.04);
  ctx.fill();
  // Star emblem
  ctx.save();
  ctx.translate(x, y + s * 0.07);
  ctx.fillStyle = '#ffd86b';
  ctx.fill(shapePath('star', s * 0.08));
  ctx.restore();
  glowDisc(ctx, x, y + s * 0.07, s * 0.16, '#ffd86b', 0.6 * glow);
  // Head
  ctx.fillStyle = '#ffe7d6';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.32, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  // Hair cap
  ctx.fillStyle = '#6b4a8f';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.34, s * 0.2, Math.PI * 1.05, Math.PI * 1.95);
  ctx.quadraticCurveTo(x, y - s * 0.4, x - s * 0.2, y - s * 0.34);
  ctx.fill();
  eyes(ctx, x, y - s * 0.3, s * 0.07, s * 0.03, sleep);
  // Smile
  ctx.strokeStyle = '#8a5a6a';
  ctx.lineWidth = s * 0.025;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.26, s * 0.06, Math.PI * 0.2, Math.PI * 0.8);
  ctx.stroke();
  highlight(ctx, x - s * 0.07, y - s * 0.38, s * 0.07, s * 0.04, -0.5, 0.5);
  ctx.restore();
}

/**
 * A hanging lantern. `lit` is 0..1: how much light fills the glass, which is
 * also the Calm-mode goal indicator. Centre of the glass at (x, y).
 */
export function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, lit: number, palette: Palette, t: number): void {
  const w = s * 0.62;
  const h = s * 0.74;
  const top = y - h / 2;
  ctx.save();
  if (lit > 0.02) glowDisc(ctx, x, y, s * 1.3, palette.lanternGlow, lit * (0.42 + 0.1 * breath(t)));
  // Hanging ring and cap
  ctx.strokeStyle = '#4a4160';
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(x, top - s * 0.17, s * 0.07, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#3a3350';
  ctx.beginPath();
  ctx.moveTo(x - w * 0.34, top - s * 0.02);
  ctx.lineTo(x + w * 0.34, top - s * 0.02);
  ctx.lineTo(x + w * 0.56, top + s * 0.1);
  ctx.lineTo(x - w * 0.56, top + s * 0.1);
  ctx.closePath();
  ctx.fill();
  // Glass
  roundRect(ctx, x - w / 2, top + s * 0.08, w, h - s * 0.08, s * 0.1);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (lit > 0) {
    const fillH = (h - s * 0.08) * Math.min(1, lit);
    const fy = top + h - fillH;
    const g = ctx.createLinearGradient(0, fy, 0, top + h);
    g.addColorStop(0, rgba(palette.lantern, 0.55));
    g.addColorStop(1, rgba(palette.lanternGlow, 0.95));
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, fy, w, fillH);
    glowDisc(ctx, x, fy + fillH * 0.55, w * 0.7, '#fff6dc', 0.7 * lit);
  }
  ctx.restore();
  // Frame
  roundRect(ctx, x - w / 2, top + s * 0.08, w, h - s * 0.08, s * 0.1);
  ctx.strokeStyle = '#4a4160';
  ctx.lineWidth = s * 0.045;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, top + s * 0.08);
  ctx.lineTo(x, top + h);
  ctx.strokeStyle = 'rgba(74,65,96,0.6)';
  ctx.lineWidth = s * 0.03;
  ctx.stroke();
  // Base
  ctx.fillStyle = '#3a3350';
  roundRect(ctx, x - w * 0.4, top + h - s * 0.02, w * 0.8, s * 0.07, s * 0.02);
  ctx.fill();
  ctx.restore();
}
