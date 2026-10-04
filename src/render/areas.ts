/**
 * The seven areas along the path (DESIGN.md 3.1): each one's sky, glows,
 * ground and path colours, its slow ambient life, and the silhouettes the map
 * paints on the horizon. Everything here is Deep Night Garden warmth
 * (DESIGN.md 3.10, 2b) with the hue shifted per area, and everything moves
 * slowly: pulse periods of seconds, low contrast, never a flicker.
 *
 * The Meadow is the Night Garden look exactly, so level 1 is the Stage 2
 * build the parent approved.
 */
import { AREA_NAMES, type AreaId } from '../core/journey';
import { createRng } from '../shared/rng';
import { mix, rgba } from './color';
import { nightGarden } from './styles/nightGarden';
import { Layers, Motes, Stars, breath, glowDisc } from './styles/common';
import type { Ambient } from './styles/types';

export interface AreaTheme {
  readonly id: AreaId;
  readonly name: string;
  /** Sky gradient, top to bottom; used by the board background and the map. */
  readonly bgTop: string;
  readonly bgBottom: string;
  /** The two soft glows nightGarden.drawBackground paints at the bottom and the top. */
  readonly glowLow: string;
  readonly glowHigh: string;
  readonly ground: string;
  readonly groundFar: string;
  readonly path: string;
  readonly pathLit: string;
  /** The area's own light: fireflies, crystal, bioluminescence, aurora, ember. */
  readonly accent: string;
  /** The area's slow background life, sized for a canvas of w by h. */
  createAmbient(w: number, h: number, seed: number): Ambient;
  /** Map-only silhouettes along the horizon: grass, crystals, waterline, clouds, hills, snow, dark wood. */
  drawScenery(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, horizonY: number): void;
}

/** Paint a theme's sky the way nightGarden.drawBackground does (gradient plus the two glows). */
export function paintSky(ctx: CanvasRenderingContext2D, w: number, h: number, theme: Pick<AreaTheme, 'bgTop' | 'bgBottom' | 'glowLow' | 'glowHigh'>): void {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, theme.bgTop);
  g.addColorStop(1, theme.bgBottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // The same two glows, radii and alphas as nightGarden.drawBackground.
  glowDisc(ctx, w * 0.5, h * 0.92, w * 0.9, theme.glowLow, 0.38);
  glowDisc(ctx, w * 0.5, h * 0.04, w * 0.8, theme.glowHigh, 0.28);
}

type ThemeColors = Pick<AreaTheme, 'bgTop' | 'bgBottom' | 'glowLow' | 'glowHigh' | 'ground' | 'groundFar' | 'path' | 'pathLit' | 'accent'>;

/** Colours part-way between two themes, for the walk across an area border (DESIGN.md 3.5). */
export function blendThemeColors(a: ThemeColors, b: ThemeColors, f: number): ThemeColors {
  const k = f < 0 ? 0 : f > 1 ? 1 : f;
  if (k <= 0) return a;
  if (k >= 1) return b;
  return {
    bgTop: mix(a.bgTop, b.bgTop, k),
    bgBottom: mix(a.bgBottom, b.bgBottom, k),
    glowLow: mix(a.glowLow, b.glowLow, k),
    glowHigh: mix(a.glowHigh, b.glowHigh, k),
    ground: mix(a.ground, b.ground, k),
    groundFar: mix(a.groundFar, b.groundFar, k),
    path: mix(a.path, b.path, k),
    pathLit: mix(a.pathLit, b.pathLit, k),
    accent: mix(a.accent, b.accent, k),
  };
}

// ------------------------------------------------------------- ambient life

/** A smooth hill or ridge line: a sum of slow sines, so it needs no stored geometry. */
function ridge(x: number, base: number, amp: number, k: number, phase: number): number {
  return base + Math.sin(x * k + phase) * amp + Math.sin(x * k * 2.3 + phase * 1.7) * amp * 0.35;
}

function fillRidge(ctx: CanvasRenderingContext2D, w: number, h: number, color: string, base: number, amp: number, k: number, phase: number): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, ridge(x, base, amp, k, phase));
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
}

/** Crystal Cave: a slow shimmer on a few crystal facets and drip ripples spreading on the floor. */
class CrystalShimmer implements Ambient {
  private readonly glints: Array<{ x: number; y: number; r: number; phase: number; period: number }>;
  private readonly drips: Array<{ x: number; y: number; phase: number; period: number }>;

  constructor(w: number, h: number, seed: number, private readonly color: string) {
    const rng = createRng(seed);
    this.glints = Array.from({ length: Math.max(6, Math.round((w * h) / 26000)) }, () => ({
      x: rng.range(0, w),
      y: rng.range(0, h * 0.9),
      r: rng.range(5, 11),
      phase: rng.range(0, Math.PI * 2),
      period: rng.range(5, 9),
    }));
    this.drips = Array.from({ length: 3 }, () => ({ x: rng.range(w * 0.15, w * 0.85), y: rng.range(h * 0.75, h * 0.96), phase: rng.range(0, 1), period: rng.range(6, 10) }));
  }

  draw(ctx: CanvasRenderingContext2D, _w: number, _h: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const g of this.glints) {
      // A four-point glint that swells and fades over several seconds.
      const a = Math.max(0, Math.sin((t / g.period) * Math.PI * 2 + g.phase));
      if (a < 0.02) continue;
      glowDisc(ctx, g.x, g.y, g.r * 2.4, this.color, a * 0.22);
      ctx.strokeStyle = rgba('#ffffff', a * 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(g.x - g.r * a, g.y);
      ctx.lineTo(g.x + g.r * a, g.y);
      ctx.moveTo(g.x, g.y - g.r * a);
      ctx.lineTo(g.x, g.y + g.r * a);
      ctx.stroke();
    }
    for (const d of this.drips) {
      const p = ((t / d.period + d.phase) % 1 + 1) % 1;
      if (p > 0.55) continue;
      const k = p / 0.55;
      // A ripple ring widening and thinning out, seen flat on the cave floor.
      ctx.strokeStyle = rgba(this.color, (1 - k) * 0.35);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 4 + k * 30, (4 + k * 30) * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (k < 0.35) glowDisc(ctx, d.x, d.y, 10, this.color, (1 - k / 0.35) * 0.3);
    }
    ctx.restore();
  }
}

/** Mermaid Lagoon: bubbles rising, and now and then a glowing fish passing far behind. */
class LagoonLife implements Ambient {
  private readonly bubbles: Array<{ x: number; r: number; phase: number; speed: number; wobble: number }>;

  constructor(
    w: number,
    private readonly h: number,
    seed: number,
    private readonly color: string,
  ) {
    const rng = createRng(seed);
    this.bubbles = Array.from({ length: Math.max(7, Math.round((w * h) / 24000)) }, () => ({
      x: rng.range(0, w),
      r: rng.range(1.6, 4),
      phase: rng.range(0, 1),
      // 20 to 34 seconds to rise the full height.
      speed: 1 / rng.range(20, 34),
      wobble: rng.range(0, Math.PI * 2),
    }));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bubbles) {
      const p = ((t * b.speed + b.phase) % 1 + 1) % 1;
      const x = b.x + Math.sin(t * 0.6 + b.wobble) * 7;
      const y = h * (1.04 - p * 1.08);
      const fade = Math.min(1, p * 6) * Math.min(1, (1 - p) * 6);
      ctx.strokeStyle = rgba(this.color, 0.42 * fade);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgba('#ffffff', 0.5 * fade);
      ctx.beginPath();
      ctx.arc(x - b.r * 0.35, y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    // The passing fish: one slow crossing every 26 seconds, alternating direction.
    const period = 26;
    const cycle = Math.floor(t / period);
    const p = (t % period) / period;
    if (p < 0.5) {
      const k = p / 0.5;
      const dir = cycle % 2 === 0 ? 1 : -1;
      const x = dir > 0 ? -40 + k * (w + 80) : w + 40 - k * (w + 80);
      const y = this.h * (0.3 + 0.1 * ((cycle * 0.37) % 1)) + Math.sin(k * Math.PI * 3) * 14;
      const fade = Math.sin(k * Math.PI);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(dir, 1);
      glowDisc(ctx, 0, 0, 26, this.color, 0.22 * fade);
      ctx.fillStyle = rgba(this.color, 0.5 * fade);
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      const flick = Math.sin(t * 3) * 3;
      ctx.beginPath();
      ctx.moveTo(-9, 0);
      ctx.lineTo(-17, -6 + flick);
      ctx.lineTo(-17, 6 + flick);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
}

/** Cloud Castle: soft clouds drifting by, and castle windows lit far away. */
class CloudDrift implements Ambient {
  private readonly clouds: Array<{ x: number; y: number; r: number; speed: number }>;
  private readonly lights: Stars;

  constructor(w: number, h: number, seed: number, private readonly color: string, lightColor: string) {
    const rng = createRng(seed);
    this.clouds = Array.from({ length: 6 }, () => ({ x: rng.range(0, w), y: rng.range(h * 0.08, h * 0.9), r: rng.range(w * 0.18, w * 0.34), speed: rng.range(3, 7) }));
    this.lights = new Stars(w, h * 0.5, seed + 3, 9, lightColor, 0.55);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    this.lights.draw(ctx, w, h, t);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const c of this.clouds) {
      const x = ((c.x + t * c.speed) % (w + c.r * 2.4) + (w + c.r * 2.4)) % (w + c.r * 2.4) - c.r * 1.2;
      // A cloud is three overlapping soft discs, squashed flat.
      ctx.save();
      ctx.translate(x, c.y);
      ctx.scale(1, 0.42);
      glowDisc(ctx, 0, 0, c.r, this.color, 0.07);
      glowDisc(ctx, -c.r * 0.45, c.r * 0.15, c.r * 0.7, this.color, 0.06);
      glowDisc(ctx, c.r * 0.45, c.r * 0.1, c.r * 0.75, this.color, 0.06);
      ctx.restore();
    }
    ctx.restore();
  }
}

/** Star Garden: a sky of stars where small groups slowly join into shapes, then let go. */
class Constellations implements Ambient {
  private readonly stars: Array<{ x: number; y: number; r: number; phase: number; period: number }>;
  private readonly groups: Array<{ members: number[]; offset: number }>;

  constructor(w: number, h: number, seed: number, private readonly color: string) {
    const rng = createRng(seed);
    this.stars = Array.from({ length: Math.max(40, Math.round((w * h) / 5200)) }, () => ({
      x: rng.range(0, w),
      y: rng.range(0, h),
      r: rng.range(0.6, 1.9),
      phase: rng.range(0, Math.PI * 2),
      period: rng.range(4, 8),
    }));
    // Five constellations: each a chain of four or five nearby stars.
    this.groups = [];
    const used = new Set<number>();
    for (let g = 0; g < 5; g++) {
      const start = rng.int(this.stars.length);
      if (used.has(start)) continue;
      const members = [start];
      used.add(start);
      let cur = this.stars[start] as { x: number; y: number };
      for (let k = 0; k < 4; k++) {
        let best = -1;
        let bestD = Infinity;
        this.stars.forEach((s, i) => {
          if (used.has(i)) return;
          const d = Math.hypot(s.x - cur.x, s.y - cur.y);
          if (d > 30 && d < 110 && d < bestD) {
            bestD = d;
            best = i;
          }
        });
        if (best < 0) break;
        members.push(best);
        used.add(best);
        cur = this.stars[best] as { x: number; y: number };
      }
      if (members.length >= 3) this.groups.push({ members, offset: rng.range(0, 40) });
    }
  }

  draw(ctx: CanvasRenderingContext2D, _w: number, _h: number, t: number): void {
    ctx.save();
    for (const s of this.stars) {
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin((t / s.period) * Math.PI * 2 + s.phase));
      ctx.fillStyle = rgba(this.color, 0.75 * tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.4) glowDisc(ctx, s.x, s.y, s.r * 4, this.color, tw * 0.2);
    }
    // Each group's lines fade in over 6 s, hold, and fade out, on a 40 s cycle.
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (const g of this.groups) {
      const p = ((t + g.offset) % 40) / 40;
      const a = p < 0.15 ? p / 0.15 : p < 0.5 ? 1 : p < 0.65 ? 1 - (p - 0.5) / 0.15 : 0;
      if (a <= 0) continue;
      ctx.strokeStyle = rgba(this.color, 0.32 * a);
      ctx.beginPath();
      g.members.forEach((i, k) => {
        const s = this.stars[i];
        if (!s) return;
        if (k === 0) ctx.moveTo(s.x, s.y);
        else ctx.lineTo(s.x, s.y);
      });
      ctx.stroke();
      for (const i of g.members) {
        const s = this.stars[i];
        if (s) glowDisc(ctx, s.x, s.y, 7, this.color, 0.3 * a);
      }
    }
    ctx.restore();
  }
}

/** Aurora Peak: ribbons of northern light that breathe at the breathing rhythm (DESIGN.md 3.8). */
class AuroraRibbons implements Ambient {
  private readonly stars: Stars;
  private readonly ribbons: Array<{ y: number; amp: number; k: number; phase: number; color: string; width: number }>;

  constructor(w: number, h: number, seed: number, colors: readonly string[]) {
    const rng = createRng(seed);
    this.stars = new Stars(w, h, seed + 1, Math.max(20, Math.round((w * h) / 9000)), '#dce8ff', 0.7);
    this.ribbons = colors.map((color, i) => ({
      y: h * (0.14 + i * 0.1) + rng.range(-h * 0.03, h * 0.03),
      amp: h * rng.range(0.03, 0.06),
      k: rng.range(0.006, 0.011),
      phase: rng.range(0, Math.PI * 2),
      color,
      width: rng.range(34, 56),
    }));
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    this.stars.draw(ctx, w, h, t);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    this.ribbons.forEach((r, i) => {
      const a = 0.05 + 0.07 * breath(t + i * 2.3);
      // Soft edges from three strokes of decreasing width and rising alpha, no blur needed.
      for (const [wk, ak] of [
        [1.9, 0.35],
        [1.3, 0.6],
        [0.7, 1],
      ] as const) {
        ctx.strokeStyle = rgba(r.color, a * ak);
        ctx.lineWidth = r.width * wk;
        ctx.beginPath();
        for (let x = -20; x <= w + 20; x += 12) {
          const y = r.y + Math.sin(x * r.k + r.phase + t * 0.08) * r.amp + Math.sin(x * r.k * 2.7 - t * 0.05) * r.amp * 0.3;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
    ctx.restore();
  }
}

/** Dragon Hollow: embers drifting up and the sleepy breathing glow of a tiny dragon, low in the dark. */
class EmberGlow implements Ambient {
  private readonly embers: Motes;

  constructor(w: number, h: number, seed: number, private readonly color: string) {
    this.embers = new Motes(w, h, seed, Math.max(6, Math.round((w * h) / 22000)), color, [0.7, 1.4], 0.7, 0.45);
  }

  draw(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowDisc(ctx, w * 0.5, h * 0.98, w * 0.55, this.color, 0.1 + 0.09 * breath(t));
    ctx.restore();
    this.embers.draw(ctx, w, h, t);
  }
}

// ---------------------------------------------------------------- scenery

function meadowScenery(ctx: CanvasRenderingContext2D, w: number, h: number, _t: number, hy: number): void {
  fillRidge(ctx, w, h, '#0b1b36', hy - 6, 10, 0.012, 1.2);
  fillRidge(ctx, w, h, '#0d2a2b', hy + 12, 8, 0.018, 3.1);
  // Grass tufts along the near ridge: thin curved blades.
  ctx.strokeStyle = 'rgba(40,110,96,0.7)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  for (let x = 6; x < w; x += 9) {
    const base = ridge(x, hy + 12, 8, 0.018, 3.1) + 1;
    const lean = Math.sin(x * 0.37) * 3;
    const tall = 6 + ((x * 7) % 5);
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + lean * 0.5, base - tall * 0.6, x + lean, base - tall);
    ctx.stroke();
  }
}

function caveScenery(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hy: number): void {
  // A far cave wall, then clusters of chunky crystals with a lit facet and a glowing tip.
  fillRidge(ctx, w, h, '#1b1540', hy - 4, 9, 0.011, 0.4);
  // A few rounded stalactites hang from the top of the view.
  ctx.fillStyle = '#120d2e';
  for (let i = 0; i < 6; i++) {
    const x = w * ((i + 0.5) / 6) + Math.sin(i * 2.3) * 14;
    const tall = 22 + ((i * 17) % 26);
    const half = 9 + ((i * 7) % 7);
    ctx.beginPath();
    ctx.moveTo(x - half * 1.4, -2);
    ctx.quadraticCurveTo(x - half * 0.3, tall * 0.6, x, tall);
    ctx.quadraticCurveTo(x + half * 0.3, tall * 0.6, x + half * 1.4, -2);
    ctx.closePath();
    ctx.fill();
  }
  const clusters = [0.08, 0.26, 0.47, 0.66, 0.9];
  clusters.forEach((fx, c) => {
    const cx = w * fx;
    for (let j = 0; j < 3; j++) {
      const i = c * 3 + j;
      const x = cx + (j - 1) * (9 + ((i * 5) % 6));
      const tall = (j === 1 ? 44 : 28) + ((i * 13) % 16);
      const half = 7 + ((i * 5) % 6);
      const lean = Math.sin(i * 1.9) * 6;
      const base = ridge(x, hy - 4, 9, 0.011, 0.4) + 6;
      const glow = 0.5 + 0.5 * Math.sin(t / (5 + (i % 3)) + i);
      ctx.fillStyle = '#4a388c';
      ctx.beginPath();
      ctx.moveTo(x - half, base);
      ctx.lineTo(x - half * 0.7, base - tall * 0.7);
      ctx.lineTo(x + lean, base - tall);
      ctx.lineTo(x + half * 0.8, base - tall * 0.6);
      ctx.lineTo(x + half, base);
      ctx.closePath();
      ctx.fill();
      // The lit facet.
      ctx.fillStyle = rgba('#c08cff', 0.18 + 0.12 * glow);
      ctx.beginPath();
      ctx.moveTo(x - half * 0.1, base);
      ctx.lineTo(x + lean, base - tall);
      ctx.lineTo(x + half * 0.8, base - tall * 0.6);
      ctx.lineTo(x + half * 0.55, base);
      ctx.closePath();
      ctx.fill();
      glowDisc(ctx, x + lean * 0.9, base - tall * 0.85, 11, '#c08cff', 0.14 + 0.12 * glow);
    }
  });
  fillRidge(ctx, w, h, '#140f33', hy + 16, 5, 0.02, 2.2);
}

function lagoonScenery(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hy: number): void {
  // A far shore, then still water with a slow sheen and a glimmer along the waterline, then the near bank.
  fillRidge(ctx, w, h, '#072a38', hy - 8, 6, 0.01, 2.0);
  ctx.fillStyle = '#0a2f3f';
  ctx.fillRect(0, hy, w, h - hy);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 4; i++) {
    const x = ((t * 5 + i * (w / 4)) % (w + 160)) - 80;
    ctx.save();
    ctx.translate(x, hy + 12 + i * 6);
    ctx.scale(1, 0.1);
    glowDisc(ctx, 0, 0, 90, '#6fe7ff', 0.14);
    ctx.restore();
  }
  // Bioluminescent sparks that wake and sleep along the waterline, each on its own slow period.
  for (let i = 0; i < 14; i++) {
    const x = w * ((i + 0.5) / 14) + Math.sin(i * 3.3) * 9;
    const a = Math.max(0, Math.sin(t / (4 + (i % 4)) + i * 1.7));
    glowDisc(ctx, x, hy + 4 + (i % 3) * 3, 6, '#9ff3ff', 0.35 * a);
  }
  ctx.restore();
  // Rounded rocks breaking the surface, with a wet highlight.
  for (const [fx, r] of [
    [0.2, 22],
    [0.72, 15],
    [0.86, 9],
  ] as const) {
    ctx.fillStyle = '#06252f';
    ctx.beginPath();
    ctx.ellipse(w * fx, hy + 10, r, r * 0.6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(111,231,255,0.12)';
    ctx.beginPath();
    ctx.ellipse(w * fx - r * 0.3, hy + 10 - r * 0.3, r * 0.3, r * 0.12, -0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  fillRidge(ctx, w, h, '#06252f', hy + 24, 4, 0.02, 1.4);
  // Reeds on the near bank, swaying very slowly.
  ctx.strokeStyle = 'rgba(40,120,120,0.7)';
  ctx.lineWidth = 1.3;
  ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = w * ((i + 0.3) / 16) + Math.sin(i * 2.9) * 6;
    const base = ridge(x, hy + 24, 4, 0.02, 1.4) + 2;
    const tall = 12 + ((i * 7) % 10);
    const sway = Math.sin(t * 0.35 + i) * 1.5;
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + sway, base - tall * 0.5, x + sway * 2, base - tall);
    ctx.stroke();
  }
}

function castleScenery(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hy: number): void {
  // A cloud bank, then the castle on it, then nearer cloud.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.translate(w * ((i + 0.5) / 6) + Math.sin(i) * 8, hy + 6);
    ctx.scale(1, 0.4);
    glowDisc(ctx, 0, 0, 44, '#b89ad8', 0.16);
    ctx.restore();
  }
  ctx.restore();
  const cx = w * 0.56;
  const base = hy + 4;
  ctx.fillStyle = '#2c2050';
  for (const [dx, tw, tall] of [
    [-44, 14, 34],
    [-18, 12, 52],
    [16, 12, 46],
    [42, 14, 30],
  ] as const) {
    ctx.fillRect(cx + dx - tw / 2, base - tall, tw, tall);
    ctx.beginPath();
    ctx.moveTo(cx + dx - tw * 0.75, base - tall);
    ctx.lineTo(cx + dx, base - tall - tw * 1.2);
    ctx.lineTo(cx + dx + tw * 0.75, base - tall);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillRect(cx - 48, base - 24, 96, 24);
  // Windows: tiny warm lights that drift in brightness over several seconds.
  for (const [dx, dy, ph] of [
    [-44, -20, 0],
    [-18, -38, 2],
    [-18, -22, 4],
    [16, -32, 1],
    [42, -18, 3],
    [0, -12, 5],
  ] as const) {
    const a = 0.55 + 0.35 * Math.sin(t / 4 + ph);
    ctx.fillStyle = rgba('#ffd9a8', a);
    ctx.fillRect(cx + dx - 1.2, base + dy, 2.4, 3.4);
    glowDisc(ctx, cx + dx, base + dy + 1.5, 6, '#ffd9a8', a * 0.35);
  }
  fillRidge(ctx, w, h, '#22183a', hy + 18, 6, 0.016, 0.9);
}

function gardenScenery(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hy: number): void {
  fillRidge(ctx, w, h, '#0d1838', hy - 4, 9, 0.013, 2.6);
  // Rounded hedges with tall star-flowers whose heads glow softly.
  fillRidge(ctx, w, h, '#0b1a2a', hy + 14, 7, 0.02, 0.3);
  for (let i = 0; i < 7; i++) {
    const x = w * ((i + 0.5) / 7) + Math.sin(i * 3.1) * 12;
    const base = ridge(x, hy + 14, 7, 0.02, 0.3) + 2;
    const tall = 18 + ((i * 11) % 14);
    const sway = Math.sin(t * 0.4 + i) * 1.5;
    ctx.strokeStyle = 'rgba(60,110,120,0.8)';
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, base);
    ctx.quadraticCurveTo(x + sway, base - tall * 0.5, x + sway * 2, base - tall);
    ctx.stroke();
    const a = 0.5 + 0.3 * Math.sin(t / 5 + i * 1.3);
    glowDisc(ctx, x + sway * 2, base - tall, 7, '#cfe3ff', a * 0.4);
    ctx.fillStyle = rgba('#e8f1ff', a);
    ctx.beginPath();
    ctx.arc(x + sway * 2, base - tall, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function peakScenery(ctx: CanvasRenderingContext2D, w: number, h: number, _t: number, hy: number): void {
  // Far peaks with soft shoulders and snow caps, then nearer snow slopes glowing faintly.
  const peaks: Array<[number, number, number]> = [
    [0.06, 56, 60],
    [0.28, 84, 72],
    [0.5, 66, 62],
    [0.74, 92, 76],
    [0.96, 60, 58],
  ];
  for (const [fx, tall, half] of peaks) {
    const x = w * fx;
    const base = hy + 10;
    ctx.fillStyle = '#223a5a';
    ctx.beginPath();
    ctx.moveTo(x - half, base);
    ctx.quadraticCurveTo(x - half * 0.45, base - tall * 0.55, x, base - tall);
    ctx.quadraticCurveTo(x + half * 0.45, base - tall * 0.55, x + half, base);
    ctx.closePath();
    ctx.fill();
    // The snow cap follows the shoulders a little way down.
    ctx.fillStyle = 'rgba(214,228,255,0.85)';
    ctx.beginPath();
    ctx.moveTo(x, base - tall);
    ctx.quadraticCurveTo(x + half * 0.2, base - tall * 0.8, x + half * 0.3, base - tall * 0.66);
    ctx.quadraticCurveTo(x + half * 0.12, base - tall * 0.7, x + half * 0.04, base - tall * 0.6);
    ctx.quadraticCurveTo(x - half * 0.1, base - tall * 0.72, x - half * 0.3, base - tall * 0.66);
    ctx.quadraticCurveTo(x - half * 0.2, base - tall * 0.8, x, base - tall);
    ctx.closePath();
    ctx.fill();
  }
  fillRidge(ctx, w, h, '#1a2a44', hy + 16, 7, 0.015, 1.1);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let x = 0; x <= w; x += 60) glowDisc(ctx, x + 30, ridge(x + 30, hy + 16, 7, 0.015, 1.1) + 6, 30, '#9fb8e8', 0.06);
  ctx.restore();
}

function hollowScenery(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, hy: number): void {
  // A dark wood: a leafy canopy of overlapping rounded crowns (darker than the sky, so the
  // ember light shows between the trees), tapering trunks, and a tiny dragon asleep among them.
  ctx.fillStyle = '#100a0f';
  for (let i = 0; i < 9; i++) {
    const x = w * (i / 8) + Math.sin(i * 1.7) * 10;
    const r = 34 + ((i * 11) % 18);
    ctx.beginPath();
    ctx.arc(x, hy - 56 - ((i * 7) % 14), r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(0, -2, w, hy - 78);
  fillRidge(ctx, w, h, '#160c10', hy + 18, 6, 0.017, 2.4);
  ctx.fillStyle = '#0c0608';
  for (let i = 0; i < 7; i++) {
    const x = w * ((i + 0.5) / 7) + Math.sin(i * 2.1) * 14;
    const tw = 7 + ((i * 7) % 6);
    const base = ridge(x, hy + 18, 6, 0.017, 2.4) + 4;
    ctx.beginPath();
    ctx.moveTo(x - tw * 1.5, base);
    ctx.quadraticCurveTo(x - tw * 0.7, base - 24, x - tw * 0.6, hy - 70);
    ctx.lineTo(x + tw * 0.6, hy - 70);
    ctx.quadraticCurveTo(x + tw * 0.7, base - 24, x + tw * 1.5, base);
    ctx.closePath();
    ctx.fill();
  }
  // The sleepy dragon: a small curled silhouette by a trunk, its snout glowing with each slow breath.
  const dx = w * 0.62;
  const dy = hy + 14;
  const br = breath(t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowDisc(ctx, dx + 22, dy - 2, 26, '#ff8a4a', 0.1 + 0.12 * br);
  ctx.restore();
  ctx.fillStyle = '#1c0d12';
  ctx.beginPath();
  ctx.ellipse(dx, dy, 22, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dx + 18, dy - 6, 9, 0, Math.PI * 2);
  ctx.fill();
  // Two soft ear bumps and a curled tail.
  ctx.beginPath();
  ctx.arc(dx + 14, dy - 14, 3, 0, Math.PI * 2);
  ctx.arc(dx + 22, dy - 14, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1c0d12';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(dx - 18, dy + 2);
  ctx.quadraticCurveTo(dx - 36, dy - 4, dx - 30, dy - 14);
  ctx.stroke();
  // A closed eye and the warm breath at the snout.
  ctx.strokeStyle = 'rgba(255,170,120,0.55)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(dx + 20, dy - 7, 2.5, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = rgba('#ffb070', 0.45 + 0.4 * br);
  ctx.beginPath();
  ctx.arc(dx + 26, dy - 3, 1.6, 0, Math.PI * 2);
  ctx.fill();
}

// ----------------------------------------------------------------- themes

const THEMES: Record<AreaId, AreaTheme> = {
  meadow: {
    id: 'meadow',
    name: AREA_NAMES.meadow,
    // Exactly the Night Garden palette and glows (nightGarden.ts), so level 1 is unchanged.
    bgTop: nightGarden.palette.bgTop,
    bgBottom: nightGarden.palette.bgBottom,
    glowLow: '#0e3a48',
    glowHigh: '#2c2c72',
    ground: nightGarden.palette.ground,
    groundFar: nightGarden.palette.groundFar,
    path: nightGarden.palette.path,
    pathLit: nightGarden.palette.pathLit,
    accent: '#ffd27a',
    createAmbient: (w, h, seed) => nightGarden.createAmbient(w, h, seed),
    drawScenery: meadowScenery,
  },
  cave: {
    id: 'cave',
    name: AREA_NAMES.cave,
    bgTop: '#1b1550',
    bgBottom: '#070518',
    glowLow: '#2e1a5c',
    glowHigh: '#3a2a80',
    ground: '#140f33',
    groundFar: '#1b1540',
    path: '#4a3d84',
    pathLit: '#ffd27a',
    accent: '#c08cff',
    createAmbient: (w, h, seed) => new Layers([new CrystalShimmer(w, h, seed, '#c08cff'), new Motes(w, h, seed + 1, Math.max(4, Math.round((w * h) / 40000)), '#d9b8ff', [0.7, 1.3], 0.5, 0.3)]),
    drawScenery: caveScenery,
  },
  lagoon: {
    id: 'lagoon',
    name: AREA_NAMES.lagoon,
    bgTop: '#0c2c4a',
    bgBottom: '#03101c',
    glowLow: '#0b4a52',
    glowHigh: '#124468',
    ground: '#06252f',
    groundFar: '#0a2f3f',
    path: '#2a5f72',
    pathLit: '#ffd27a',
    accent: '#6fe7ff',
    createAmbient: (w, h, seed) => new LagoonLife(w, h, seed, '#6fe7ff'),
    drawScenery: lagoonScenery,
  },
  castle: {
    id: 'castle',
    name: AREA_NAMES.castle,
    bgTop: '#3a2a60',
    bgBottom: '#120a22',
    glowLow: '#5c2a4c',
    glowHigh: '#4a3a7e',
    ground: '#22183a',
    groundFar: '#2c2050',
    path: '#5a4a84',
    pathLit: '#ffd27a',
    accent: '#ffb3c9',
    createAmbient: (w, h, seed) => new CloudDrift(w, h, seed, '#c9a8e0', '#ffd9a8'),
    drawScenery: castleScenery,
  },
  garden: {
    id: 'garden',
    name: AREA_NAMES.garden,
    bgTop: '#0c1246',
    bgBottom: '#040616',
    glowLow: '#1a2a5e',
    glowHigh: '#2a2a76',
    ground: '#0b1a2a',
    groundFar: '#0d1838',
    path: '#324a7e',
    pathLit: '#ffd27a',
    accent: '#cfe3ff',
    createAmbient: (w, h, seed) => new Constellations(w, h, seed, '#dbe8ff'),
    drawScenery: gardenScenery,
  },
  peak: {
    id: 'peak',
    name: AREA_NAMES.peak,
    bgTop: '#0b1c3e',
    bgBottom: '#050a1a',
    glowLow: '#1a4c4c',
    glowHigh: '#1c2c60',
    ground: '#1a2a44',
    groundFar: '#223a5a',
    path: '#4a6a90',
    pathLit: '#ffd27a',
    accent: '#7fffd0',
    createAmbient: (w, h, seed) => new AuroraRibbons(w, h, seed, ['#5cf0c0', '#7ab8ff', '#c48cff']),
    drawScenery: peakScenery,
  },
  hollow: {
    id: 'hollow',
    name: AREA_NAMES.hollow,
    bgTop: '#1e1022',
    bgBottom: '#070408',
    glowLow: '#4c1e0e',
    glowHigh: '#2c1a2e',
    ground: '#160c10',
    groundFar: '#1e1218',
    path: '#4c3036',
    pathLit: '#ffd27a',
    accent: '#ff9a5c',
    createAmbient: (w, h, seed) => new EmberGlow(w, h, seed, '#ff8a4a'),
    drawScenery: hollowScenery,
  },
};

export function areaTheme(id: AreaId): AreaTheme {
  return THEMES[id];
}
