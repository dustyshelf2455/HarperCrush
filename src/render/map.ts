/**
 * A glimpse of the map: a winding path of lanterns, her companion on the
 * current one, and the two other creatures waiting by the path. Tapping a
 * waiting creature makes it the companion, exactly as the game will.
 */
import { createRng } from '../shared/rng';
import { rgba } from './color';
import { COMPANIONS, type CompanionId, drawCompanion, drawLantern } from './creatures';
import { breath, glowDisc } from './styles/common';
import type { Ambient, GemStyle } from './styles/types';

export interface MapMockOptions {
  companion: CompanionId;
  seed: number;
  onPickCompanion?: (id: CompanionId) => void;
}

interface Pt {
  x: number;
  y: number;
}

const LANTERNS = 7;
const CURRENT = 3;

export class MapMock {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private ambient: Ambient | null = null;
  private w = 360;
  private h = 260;
  private points: Pt[] = [];
  private waiting: Array<{ id: CompanionId; x: number; y: number }> = [];
  private companion: CompanionId;
  private time = 0;
  private lastNow = 0;
  private raf = 0;
  private running = false;
  private sparkle: { x: number; y: number; t: number } | null = null;
  private readonly onClick = (e: MouseEvent): void => this.handleClick(e);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private style: GemStyle,
    private readonly opts: MapMockOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.companion = opts.companion;
    this.resize();
    canvas.addEventListener('click', this.onClick);
  }

  setStyle(style: GemStyle): void {
    this.style = style;
    this.ambient = style.createAmbient(this.w, this.h, this.opts.seed + 7);
    this.draw();
  }

  setCompanion(id: CompanionId): void {
    this.companion = id;
    this.layoutWaiting();
  }

  resize(): void {
    const parentWidth = this.canvas.parentElement?.clientWidth ?? 390;
    this.w = Math.max(280, Math.min(430, Math.floor(parentWidth)));
    this.h = Math.round(this.w * 0.74);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ambient = this.style.createAmbient(this.w, this.h, this.opts.seed + 7);
    const rng = createRng(this.opts.seed);
    this.points = [];
    for (let i = 0; i < LANTERNS; i++) {
      const f = i / (LANTERNS - 1);
      const x = this.w * (0.13 + 0.74 * f) + Math.sin(i * 2.3 + rng.range(-0.2, 0.2)) * this.w * 0.06;
      const y = this.h * (0.82 - 0.6 * f) + Math.cos(i * 1.9) * this.h * 0.07;
      this.points.push({ x, y });
    }
    this.layoutWaiting();
    this.draw();
  }

  private layoutWaiting(): void {
    const cur = this.points[CURRENT];
    if (!cur) return;
    const others = COMPANIONS.filter((c) => c !== this.companion);
    const margin = 30;
    const obstacles: Pt[] = [];
    this.points.forEach((p, i) => {
      obstacles.push({ x: p.x, y: p.y - 20 });
      const next = this.points[i + 1];
      if (next) obstacles.push({ x: (p.x + next.x) / 2, y: (p.y + next.y) / 2 - 10 });
    });
    obstacles.push({ x: cur.x, y: cur.y - 50 });
    const chosen: Pt[] = [];
    for (let k = 0; k < others.length; k++) {
      let best: { p: Pt; score: number } | null = null;
      for (const radius of [58, 76, 96, 118, 140]) {
        for (let a = 0; a < 36; a++) {
          const angle = (a / 36) * Math.PI * 2;
          const p = { x: cur.x + Math.cos(angle) * radius, y: cur.y - 20 + Math.sin(angle) * radius };
          if (p.x < margin || p.x > this.w - margin || p.y < margin || p.y > this.h - margin) continue;
          let clearance = Infinity;
          for (const o of obstacles) clearance = Math.min(clearance, Math.hypot(o.x - p.x, o.y - p.y));
          for (const c of chosen) clearance = Math.min(clearance, Math.hypot(c.x - p.x, c.y - p.y));
          if (clearance < 44) continue;
          // Prefer standing in front of the path (lower on the hill), and a little clearance.
          const score = Math.min(clearance, 70) + (p.y > cur.y - 10 ? 30 : 0);
          if (!best || score > best.score) best = { p, score };
        }
        if (best) break;
      }
      chosen.push(best ? best.p : { x: cur.x + 70 * (k + 1), y: cur.y + 40 });
    }
    this.waiting = others.map((id, i) => ({ id, x: (chosen[i] as Pt).x, y: (chosen[i] as Pt).y }));
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  destroy(): void {
    this.stop();
    this.canvas.removeEventListener('click', this.onClick);
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.w;
    const y = ((e.clientY - rect.top) / rect.height) * this.h;
    let best: { id: CompanionId; d: number; x: number; y: number } | null = null;
    for (const c of this.waiting) {
      const d = Math.hypot(c.x - x, c.y - y);
      if (d < 34 && (!best || d < best.d)) best = { id: c.id, d, x: c.x, y: c.y };
    }
    if (!best) return;
    this.companion = best.id;
    this.layoutWaiting();
    const cur = this.points[CURRENT];
    if (cur) this.sparkle = { x: cur.x, y: cur.y - 24, t: 0 };
    this.opts.onPickCompanion?.(best.id);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(50, now - this.lastNow);
    this.lastNow = now;
    this.time += dt;
    if (this.sparkle) {
      this.sparkle.t += dt;
      if (this.sparkle.t > 700) this.sparkle = null;
    }
    this.draw();
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.time / 1000;
    const pal = this.style.palette;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ambient) this.style.drawBackground(ctx, w, h, t, this.ambient);

    // Ground: two soft hill layers.
    ctx.fillStyle = rgba(pal.groundFar, 0.9);
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.62 + Math.sin(x / 70 + 1) * h * 0.05 + Math.sin(x / 31) * h * 0.02);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = pal.ground;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.8 + Math.sin(x / 55 + 3) * h * 0.04);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // Path
    const pts = this.points;
    if (pts.length < 2) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(pal.path, 0.75);
    ctx.lineWidth = 11;
    this.tracePath(pts);
    ctx.stroke();
    ctx.strokeStyle = rgba(pal.pathLit, 0.12);
    ctx.lineWidth = 4;
    this.tracePath(pts);
    ctx.stroke();
    // Little lights along the walked part of the path.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < CURRENT; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (!a || !b) continue;
      for (let k = 1; k < 4; k++) {
        const f = k / 4;
        const x = a.x + (b.x - a.x) * f;
        const y = a.y + (b.y - a.y) * f + Math.sin(f * Math.PI) * -10;
        glowDisc(ctx, x, y, 7, pal.pathLit, 0.35 + 0.15 * Math.sin(t * 1.3 + i + k));
      }
    }
    ctx.restore();

    // Lanterns
    pts.forEach((p, i) => {
      const lit = i < CURRENT ? 1 : i === CURRENT ? 1 : 0.12;
      drawLantern(ctx, p.x, p.y - 20, 30, lit, pal, t + i);
    });

    // Companion on the current lantern.
    const cur = pts[CURRENT];
    if (cur) {
      const bob = Math.sin(t * 1.4) * 2;
      glowDisc(ctx, cur.x, cur.y - 48, 34, pal.lantern, 0.15 + 0.1 * breath(t));
      drawCompanion(ctx, this.companion, cur.x, cur.y - 50 + bob, 36, t, { glow: 1.1 });
    }
    // Waiting friends
    this.waiting.forEach((c, i) => {
      const bob = Math.sin(t * 1.1 + i * 2) * 2.5;
      drawCompanion(ctx, c.id, c.x, c.y + bob, 30, t + i, { glow: 0.8 });
    });
    if (this.sparkle) {
      const p = this.sparkle.t / 700;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, this.sparkle.x, this.sparkle.y, 20 + p * 40, '#ffffff', 0.5 * (1 - p));
      ctx.restore();
    }
  }

  private tracePath(pts: Pt[]): void {
    const { ctx } = this;
    ctx.beginPath();
    const first = pts[0] as Pt;
    ctx.moveTo(first.x, first.y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)] as Pt;
      const p1 = pts[i] as Pt;
      const p2 = pts[i + 1] as Pt;
      const p3 = pts[Math.min(pts.length - 1, i + 2)] as Pt;
      const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
      const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
      ctx.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, p2.x, p2.y);
    }
  }
}
