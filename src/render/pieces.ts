/**
 * Code-drawn Stage 4 pieces (DESIGN.md 3.7): the fallback bodies the painted
 * pictures are stamped over (STYLE.md: pictures are the body, code is the
 * light), and the light itself. Everything is soft and still: frost is a pale
 * rounded square, the puff a cluster of lavender blobs, the moonstone a milky
 * block with a blue heart, the bubble a thin iridescent ring, the seed a
 * golden drop with a sprout, the flower a glowing rosette.
 */
import { glowDisc, highlight, softRing } from './styles/common';
import { rgba } from './color';

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A layer of frost over a cell centred at (x, y); `layers` 1 is thin and translucent, 2 thick. */
export function drawFrost(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, layers: number, alpha = 1): void {
  const s = size * 0.94;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundedRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.18);
  const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
  g.addColorStop(0, rgba('#eaf6ff', layers >= 2 ? 0.96 : 0.62));
  g.addColorStop(1, rgba('#b9dcf7', layers >= 2 ? 0.92 : 0.5));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.5);
  ctx.lineWidth = 1;
  ctx.stroke();
  // A few crystal strokes.
  ctx.strokeStyle = rgba('#ffffff', layers >= 2 ? 0.7 : 0.45);
  ctx.lineWidth = Math.max(1, s * 0.03);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos(a) * s * 0.3, y + Math.sin(a) * s * 0.3);
    ctx.lineTo(x - Math.cos(a) * s * 0.3, y - Math.sin(a) * s * 0.3);
    ctx.stroke();
  }
  ctx.restore();
}

/** A sleepy cloud puff. */
export function drawPuff(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  const bob = Math.sin(t * 0.8 + x * 0.01) * r * 0.03;
  const blobs = [[0, 0.1, 0.62], [-0.45, 0.2, 0.42], [0.45, 0.2, 0.42], [-0.2, -0.25, 0.42], [0.22, -0.28, 0.4]];
  for (const [dx, dy, br] of blobs) {
    const g = ctx.createRadialGradient(x + (dx as number) * r - r * 0.1, y + (dy as number) * r + bob - r * 0.1, 0, x + (dx as number) * r, y + (dy as number) * r + bob, (br as number) * r);
    g.addColorStop(0, '#f6f1ff');
    g.addColorStop(1, '#c9bbe8');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + (dx as number) * r, y + (dy as number) * r + bob, (br as number) * r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Closed eyes.
  ctx.strokeStyle = '#6a5a8a';
  ctx.lineWidth = Math.max(1, r * 0.06);
  for (const dx of [-0.2, 0.2]) {
    ctx.beginPath();
    ctx.arc(x + dx * r, y + bob + r * 0.05, r * 0.09, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  }
  ctx.restore();
}

/** A moonstone block with a faint blue light inside. */
export function drawMoonstone(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  const s = r * 1.7;
  roundedRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.2);
  const g = ctx.createLinearGradient(x - s / 2, y - s / 2, x + s / 2, y + s / 2);
  g.addColorStop(0, '#f4f7ff');
  g.addColorStop(1, '#c3cfe8');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.6);
  ctx.lineWidth = 1;
  ctx.stroke();
  glowDisc(ctx, x, y + r * 0.05, r * 0.6, '#8fc3ff', 0.35 + 0.1 * Math.sin(t * 0.9));
  highlight(ctx, x - r * 0.35, y - r * 0.4, r * 0.3, r * 0.14, -0.6, 0.7);
  ctx.restore();
}

/** A bubble with a small sleeper glowing inside it. */
export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, colour: string): void {
  ctx.save();
  const br = r * 0.95 + Math.sin(t * 1.1 + y * 0.02) * r * 0.015;
  const g = ctx.createRadialGradient(x - br * 0.3, y - br * 0.3, br * 0.1, x, y, br);
  g.addColorStop(0, rgba('#ffffff', 0.18));
  g.addColorStop(0.75, rgba('#cfe6ff', 0.1));
  g.addColorStop(1, rgba('#ffd6f3', 0.35));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, br, 0, Math.PI * 2);
  ctx.fill();
  glowDisc(ctx, x, y + br * 0.1, br * 0.45, colour, 0.55);
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y + br * 0.1, br * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.7);
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.beginPath();
  ctx.arc(x, y, br, 0, Math.PI * 2);
  ctx.stroke();
  highlight(ctx, x - br * 0.4, y - br * 0.45, br * 0.3, br * 0.14, -0.7, 0.8);
  ctx.restore();
}

/** A star-seed: a golden drop with a tiny sprout, glowing. */
export function drawSeed(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  glowDisc(ctx, x, y, r * 1.2, '#ffd27a', 0.35 + 0.1 * Math.sin(t * 1.3));
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.2, r * 0.1, x, y + r * 0.1, r * 0.8);
  g.addColorStop(0, '#fff1b0');
  g.addColorStop(1, '#e09a2a');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.12, r * 0.62, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6fbf4a';
  ctx.lineWidth = Math.max(1.5, r * 0.09);
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.5);
  ctx.quadraticCurveTo(x + r * 0.1, y - r * 0.85, x + r * 0.35, y - r * 0.95);
  ctx.stroke();
  ctx.fillStyle = '#8ad46a';
  ctx.beginPath();
  ctx.ellipse(x + r * 0.42, y - r * 0.98, r * 0.18, r * 0.1, -0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The flower a seed sprouts into: a glowing gold and pink rosette on two leaves. */
export function drawFlower(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#5faf4a';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(x + s * r * 0.5, y + r * 0.55, r * 0.45, r * 0.2, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  glowDisc(ctx, x, y, r * 1.3, '#ffb87a', 0.35 + 0.1 * Math.sin(t * 1.1));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + t * 0.05;
    const g = ctx.createRadialGradient(x, y, r * 0.1, x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, r * 0.5);
    g.addColorStop(0, '#ffe08a');
    g.addColorStop(1, '#ff8fb0');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.42, r * 0.24, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff3b8';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A vine ring holding a gem (drawn over it). */
export function drawVine(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#4f9a3c';
  ctx.lineWidth = Math.max(2, r * 0.13);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = r * (1.02 + 0.05 * Math.sin(a * 3 + t * 0.2));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.fillStyle = '#7fd05f';
  for (const a of [0.6, 2.7, 4.6]) {
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05, r * 0.26, r * 0.13, a + 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  softRing(ctx, x, y, r * 1.02, r * 0.1, '#9fe08a', 0.18);
  ctx.restore();
}
