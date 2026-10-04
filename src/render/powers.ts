/**
 * How each power looks while it sits on the board (DESIGN.md 3.4, "Setting a
 * power off"): a coloured power keeps its gem visible inside the glow, so she
 * can still match it by shape, and wears a small ornament that says which
 * power it is. The colourless powers (Prism Orb, Aurora) are whole pieces of
 * their own. Everything here breathes over seconds and never flickers
 * (DESIGN.md 4.4).
 *
 * Pure drawing: no state, no time source of its own. `t` is seconds.
 */
import { rgba } from './color';
import { glowDisc, highlight } from './styles/common';

/** A slow pulse in [0, 1] with the given period in seconds; the floor for every halo here. */
export function slowPulse(t: number, period: number, phase = 0): number {
  return 0.5 + 0.5 * Math.sin(((t + phase) / period) * Math.PI * 2);
}

/**
 * The Lantern Sprite: a tiny glowing creature perched on its gem (or flying,
 * when `x`, `y` follow a path). A small bright body, two translucent wings of
 * one- to two-pixel lines, a slow flutter, and a breathing glow.
 * `s` is the body radius; a perched sprite uses about 0.16 of the cell.
 */
export function drawSpriteCreature(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, t: number, glow = 1): void {
  ctx.save();
  ctx.translate(x, y);
  const breathe = 0.7 + 0.3 * slowPulse(t, 2.6);
  glowDisc(ctx, 0, 0, s * 4.2, '#ffe9a8', 0.22 * breathe * glow);
  // Wings: a slow flutter of about 1.6 beats a second, never a buzz.
  const flutter = Math.sin(t * 10) * 0.18;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.rotate(side * (0.75 + flutter));
    ctx.beginPath();
    ctx.ellipse(0, -s * 1.6, s * 0.75, s * 1.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(200,232,255,0.3)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = Math.max(1, s * 0.16);
    ctx.stroke();
    // One vein, a single thin line.
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.4);
    ctx.lineTo(0, -s * 2.8);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }
  // The body: a warm little lantern.
  glowDisc(ctx, 0, 0, s * 2, '#ffe28a', 0.8 * breathe * glow);
  const body = ctx.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s);
  body.addColorStop(0, '#fff8dc');
  body.addColorStop(0.6, '#ffd76a');
  body.addColorStop(1, '#e8a438');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, s, 0, Math.PI * 2);
  ctx.fill();
  highlight(ctx, -s * 0.3, -s * 0.35, s * 0.4, s * 0.25, -0.6, 0.8);
  ctx.restore();
}

/**
 * The Starburst's ornament over its gem: four thin rays of light at the
 * diagonals and a bright core, turning very slowly (one turn in about 40 s).
 */
export function drawStarburstRays(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, alpha = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.rotate(Math.PI / 4 + t * 0.16);
  const pulse = 0.75 + 0.25 * slowPulse(t, 3.2);
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    ctx.rotate(Math.PI / 2);
    const g = ctx.createLinearGradient(0, 0, r * 1.75, 0);
    g.addColorStop(0, rgba('#fff6dc', 0.9 * alpha * pulse));
    g.addColorStop(0.55, rgba('#fff0c0', 0.5 * alpha * pulse));
    g.addColorStop(1, rgba('#fff0c0', 0));
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1.2, r * 0.07);
    ctx.beginPath();
    ctx.moveTo(r * 0.25, 0);
    ctx.lineTo(r * 1.75, 0);
    ctx.stroke();
  }
  glowDisc(ctx, 0, 0, r * 0.6, '#fff6dc', 0.3 * alpha * pulse);
  glowDisc(ctx, 0, 0, r * 0.22, '#ffffff', 0.6 * alpha);
  ctx.restore();
}

/**
 * The Moonrise's pearl: a small soft white moon with a crescent highlight,
 * sitting over the top of its gem, in a cool white halo that breathes.
 */
export function drawMoonPearl(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number, alpha = 1): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = alpha;
  const breathe = 0.6 + 0.4 * slowPulse(t, 3.4, 1.1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowDisc(ctx, 0, 0, r * 3.2, '#dfe9ff', 0.3 * breathe);
  ctx.restore();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#eef2ff');
  g.addColorStop(1, '#b9c4e8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // The crescent: a brighter rim on the upper left, left by a soft shadow disc offset to the lower right.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(120,136,190,0.35)';
  ctx.beginPath();
  ctx.arc(r * 0.38, r * 0.38, r * 0.95, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.96, Math.PI * 0.85, Math.PI * 1.75);
  ctx.stroke();
  ctx.restore();
}

const AURORA_COLORS = ['#5cf0c0', '#9a7cff', '#6cf09a'] as const;

/**
 * The Aurora: a colourless piece like the orb, but a soft dark disc with slow
 * ribbons of teal, violet and green drifting inside, in a cool halo that
 * breathes. Ribbons move at a few pixels a second, never faster.
 */
export function drawAuroraPiece(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  const breathe = 0.5 + 0.5 * slowPulse(t, 3.8, 0.7);
  glowDisc(ctx, 0, 0, r * 1.9, '#9ad8ff', 0.16 + 0.12 * breathe);
  const base = ctx.createRadialGradient(-0.3 * r, -0.3 * r, r * 0.1, 0, 0, r);
  base.addColorStop(0, '#2a3d78');
  base.addColorStop(1, '#0c1030');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  AURORA_COLORS.forEach((c, i) => {
    // Three gentle sine ribbons, each drifting at its own slow pace.
    const yy = -r * 0.45 + i * r * 0.42 + Math.sin(t * 0.35 + i * 2.1) * r * 0.1;
    const phase = t * (0.5 + i * 0.13) + i * 1.7;
    for (const [wk, ak] of [
      [0.42, 0.22],
      [0.2, 0.5],
    ] as const) {
      ctx.strokeStyle = rgba(c, ak);
      ctx.lineWidth = r * wk;
      ctx.beginPath();
      for (let k = 0; k <= 8; k++) {
        const px = -r + (k / 8) * 2 * r;
        const py = yy + Math.sin((k / 8) * Math.PI * 2 + phase) * r * 0.16;
        if (k === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  });
  ctx.restore();
  ctx.strokeStyle = 'rgba(214,236,255,0.7)';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  highlight(ctx, -0.35 * r, -0.4 * r, r * 0.3, r * 0.16, -0.6, 0.7);
  ctx.restore();
}

/**
 * A comet's head and tail: a bright head with a soft tapering tail behind it,
 * pointing along `angle` (radians; 0 flies to the right). The Starburst
 * reuses it rotated 45 degrees for its four diagonal heads (DESIGN.md 3.4).
 */
export function drawCometHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, tailLen: number, cell: number, fade: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  for (const [height, alpha] of [
    [cell * 0.5, 0.22],
    [cell * 0.22, 0.5],
  ] as Array<[number, number]>) {
    const g = ctx.createLinearGradient(-tailLen, 0, 0, 0);
    g.addColorStop(0, 'rgba(255,240,200,0)');
    g.addColorStop(0.6, `rgba(255,236,190,${alpha * 0.45 * fade})`);
    g.addColorStop(1, `rgba(255,250,235,${alpha * fade})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-tailLen, 0);
    ctx.quadraticCurveTo(-tailLen * 0.5, -height / 2, 0, -height / 2);
    ctx.arc(0, 0, height / 2, -Math.PI / 2, Math.PI / 2);
    ctx.quadraticCurveTo(-tailLen * 0.5, height / 2, -tailLen, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  glowDisc(ctx, x, y, cell * 0.5, '#ffffff', 0.5 * fade);
  glowDisc(ctx, x, y, cell * 0.95, '#ffd27a', 0.35 * fade);
}
