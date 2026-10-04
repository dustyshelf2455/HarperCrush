/**
 * The animated board for the mockup page: a real Calm-mode board at real
 * size, with three powers (Comet, Prism Orb, Bloom) that clear gems, make
 * them fall with weight, and refill. Rendering is the same approach the game
 * will use: baked sprites, additive light, capped particles, one canvas.
 */
import { type Cell, type GemType, type Grid, findLineMatches, findValidSwaps, generateGrid, hasLineAt, makeGrid, typeCounts } from '../core/grid';
import { type Rng, createRng } from '../shared/rng';
import { lighten, rgba } from './color';
import { type CompanionId, drawCompanion, drawLantern } from './creatures';
import { shapePath } from './shapes';
import { GemSprites } from './sprites';
import { breath, clamp01, easeInOutSine, easeOutCubic, glowDisc, highlight, softRing } from './styles/common';
import type { Ambient, GemStyle } from './styles/types';

export type PowerKind = 'comet' | 'orb' | 'bloom';
export const POWER_ORDER: readonly PowerKind[] = ['comet', 'orb', 'bloom'];
export const POWER_NAMES: Record<PowerKind, string> = { comet: 'Comet', orb: 'Prism Orb', bloom: 'Bloom' };

export interface BoardMockOptions {
  cols: number;
  rows: number;
  types: readonly GemType[];
  seed: number;
  companion: CompanionId;
  autoPlay?: boolean;
  onPower?: (kind: PowerKind, viaTap: boolean) => void;
  /** A cascade step: lines formed by falling gems being cleared. step starts at 1. */
  onCascade?: (step: number) => void;
}

interface Gem {
  id: number;
  type: GemType;
  col: number;
  row: number;
  /** Current vertical position in cell units (row is the target). */
  y: number;
  vy: number;
  falling: boolean;
  delay: number;
  settle: number | null;
  clearing: number | null;
  sparkled: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Ripple {
  x: number;
  y: number;
  t: number;
}

interface CometFx {
  kind: 'comet';
  row: number;
  col: number;
  t: number;
  cleared: boolean[];
}

interface OrbFx {
  kind: 'orb';
  row: number;
  col: number;
  color: GemType;
  t: number;
  maxDist: number;
  cleared: Set<number>;
}

interface BloomFx {
  kind: 'bloom';
  row: number;
  col: number;
  t: number;
  second: boolean;
  /** The bud gem: it survives its first opening, falls, and opens again. */
  budId: number | null;
  cleared: Set<number>;
}

interface CascadeFx {
  kind: 'cascade';
  t: number;
  step: number;
}

type Effect = CometFx | OrbFx | BloomFx | CascadeFx;

const HUD_HEIGHT = 74;
const PAD = 16;
const CLEAR_MS = 340;
const CLEAR_BLOOM_MS = 120;
const COMET_ARM_MS = 380;
const COMET_FLY_MS = 980;
const ORB_SHOW_MS = 520;
const ORB_RIPPLE_MS = 950;
const BUD_MS = 420;
const RING_MS = 480;
const GRAVITY = 30;
const MAX_FALL = 15;
const SETTLE_MS = 150;
const HINT_AFTER_MS = 4000;
const AUTO_AFTER_MS = 7500;
const MAX_PARTICLES = 90;
const MAX_CASCADE_STEPS = 8;

export class BoardMock {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private sprites: GemSprites;
  private ambient: Ambient | null = null;
  private rng: Rng;
  private gems: Gem[] = [];
  private nextId = 1;
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private effect: Effect | null = null;
  private phase: 'idle' | 'power' | 'falling' = 'idle';
  private pendingSecondBloom: number | null = null;
  private cascadeStep = 0;
  private powerIndex = 0;
  private hint: { a: Cell; b: Cell } | null = null;
  private idleMs = 0;
  private time = 0;
  private lastNow = 0;
  private raf = 0;
  private running = false;
  private w = 360;
  private h = 500;
  private cell = 54;
  private lanternFill = 0.56;
  private companion: CompanionId;
  private autoPlay: boolean;
  private readonly onClick = (e: MouseEvent): void => this.handleClick(e);

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private style: GemStyle,
    private readonly opts: BoardMockOptions,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.rng = createRng(opts.seed);
    this.sprites = new GemSprites(style, this.dpr);
    this.companion = opts.companion;
    this.autoPlay = opts.autoPlay ?? true;
    this.reset(opts.seed);
    this.resize();
    canvas.addEventListener('click', this.onClick);
  }

  get currentPhase(): string {
    return this.phase;
  }

  setStyle(style: GemStyle): void {
    this.style = style;
    this.moon = null;
    this.sprites.setStyle(style);
    this.ambient = style.createAmbient(this.w, this.h, this.opts.seed);
    this.draw();
  }

  setCompanion(id: CompanionId): void {
    this.companion = id;
  }

  setAutoPlay(on: boolean): void {
    this.autoPlay = on;
  }

  /** Fresh board with no match and at least one move. */
  reset(seed: number): void {
    this.rng = createRng(seed);
    const grid = generateGrid(this.opts.rows, this.opts.cols, this.opts.types, this.rng);
    this.gems = [];
    grid.forEach((row, r) =>
      row.forEach((type, c) => {
        if (type) this.gems.push(this.makeGem(type, r, c, r));
      }),
    );
    this.effect = null;
    this.phase = 'idle';
    this.pendingSecondBloom = null;
    this.hint = null;
    this.idleMs = 0;
    this.particles = [];
  }

  resize(): void {
    const parentWidth = this.canvas.parentElement?.clientWidth ?? 390;
    this.w = Math.max(280, Math.min(430, Math.floor(parentWidth)));
    this.cell = (this.w - PAD * 2) / this.opts.cols;
    this.h = Math.round(HUD_HEIGHT + this.opts.rows * this.cell + PAD + 2);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ambient = this.style.createAmbient(this.w, this.h, this.opts.seed);
    this.draw();
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

  /** Set off a power. Returns false if the board is busy. */
  fire(kind?: PowerKind, at?: Cell, viaTap = false): PowerKind | null {
    if (this.phase !== 'idle') return null;
    const k = kind ?? (POWER_ORDER[this.powerIndex % POWER_ORDER.length] as PowerKind);
    this.powerIndex++;
    const { rows, cols } = this.opts;
    const cell = at ?? { row: 1 + this.rng.int(Math.max(1, rows - 2)), col: 1 + this.rng.int(Math.max(1, cols - 2)) };
    const row = Math.max(0, Math.min(rows - 1, cell.row));
    const col = Math.max(0, Math.min(cols - 1, cell.col));
    switch (k) {
      case 'comet':
        this.effect = { kind: 'comet', row, col, t: 0, cleared: Array<boolean>(cols).fill(false) };
        break;
      case 'orb': {
        const counts = typeCounts(this.grid()).filter((c) => c.type !== this.gemAt(row, col)?.type);
        const color = counts[0]?.type ?? this.gemAt(row, col)?.type ?? (this.opts.types[0] as GemType);
        let maxDist = 0;
        for (const g of this.gems) if (g.type === color) maxDist = Math.max(maxDist, Math.hypot(g.col - col, g.row - row));
        this.effect = { kind: 'orb', row, col, color, t: 0, maxDist: maxDist + 0.6, cleared: new Set() };
        break;
      }
      case 'bloom':
        this.effect = { kind: 'bloom', row, col, t: 0, second: false, budId: this.gemAt(row, col)?.id ?? null, cleared: new Set() };
        break;
    }
    this.phase = 'power';
    this.cascadeStep = 0;
    this.hint = null;
    this.idleMs = 0;
    this.opts.onPower?.(k, viaTap);
    return k;
  }

  private makeGem(type: GemType, row: number, col: number, y: number): Gem {
    return { id: this.nextId++, type, col, row, y, vy: 0, falling: y !== row, delay: 0, settle: null, clearing: null, sparkled: false };
  }

  private gemAt(row: number, col: number): Gem | undefined {
    return this.gems.find((g) => g.row === row && g.col === col && g.clearing === null);
  }

  private grid(): Grid {
    const grid = makeGrid(this.opts.rows, this.opts.cols);
    for (const g of this.gems) {
      if (g.clearing !== null) continue;
      const row = grid[g.row];
      if (row) row[g.col] = g.type;
    }
    return grid;
  }

  private handleClick(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.w;
    const y = ((e.clientY - rect.top) / rect.height) * this.h;
    this.ripples.push({ x, y, t: 0 });
    const col = Math.floor((x - PAD) / this.cell);
    const row = Math.floor((y - HUD_HEIGHT) / this.cell);
    if (row < 0 || col < 0 || row >= this.opts.rows || col >= this.opts.cols) return;
    this.fire(undefined, { row, col }, true);
  }

  private readonly frame = (now: number): void => {
    const dt = Math.min(50, now - this.lastNow);
    this.lastNow = now;
    this.time += dt;
    this.update(dt);
    this.draw();
    if (this.running) this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    const seconds = dt / 1000;
    this.ripples = this.ripples.filter((r) => (r.t += dt) < 480);
    this.updateParticles(seconds);
    this.updateClearing(dt);
    if (this.phase === 'power' && this.effect) this.updateEffect(this.effect, dt);
    if (this.phase === 'falling') this.updateFalling(seconds, dt);
    if (this.phase === 'idle') {
      this.idleMs += dt;
      if (this.idleMs > HINT_AFTER_MS && !this.hint) {
        const swaps = findValidSwaps(this.grid());
        if (swaps.length > 0) this.hint = swaps[Math.floor(swaps.length / 2)] ?? null;
      }
      if (this.autoPlay && this.idleMs > AUTO_AFTER_MS) this.fire(undefined, undefined, false);
    }
    // Clears pour light into the lantern; it eases back toward its resting level so a looping mockup never pins.
    this.lanternFill += (0.55 - this.lanternFill) * Math.min(1, dt / 6000);
  }

  private updateClearing(dt: number): void {
    for (const g of this.gems) {
      if (g.clearing === null) continue;
      g.clearing += dt;
      if (!g.sparkled && g.clearing >= CLEAR_BLOOM_MS) {
        g.sparkled = true;
        const { x, y } = this.gemCentre(g);
        this.spawnSparkles(x, y, this.style.gemColor(g.type).light, 5);
      }
    }
    this.gems = this.gems.filter((g) => g.clearing === null || g.clearing < CLEAR_MS);
  }

  private clearGem(g: Gem | undefined): void {
    if (g && g.clearing === null) {
      g.clearing = 0;
      this.lanternFill = Math.min(0.78, this.lanternFill + 0.012);
    }
  }

  /** Comet head distance from its origin, in cells. Shared by clearing, trail and drawing so they cannot drift apart. */
  private cometReach(p: number): number {
    return easeInOutSine(p) * (this.opts.cols + 0.5);
  }

  private updateEffect(fx: Effect, dt: number): void {
    fx.t += dt;
    const anyClearing = (): boolean => this.gems.some((g) => g.clearing !== null);
    switch (fx.kind) {
      case 'cascade':
        if (!anyClearing()) this.finishEffect();
        return;
      case 'comet': {
        if (fx.t < COMET_ARM_MS) return;
        const p = clamp01((fx.t - COMET_ARM_MS) / COMET_FLY_MS);
        const reach = this.cometReach(p);
        for (let c = 0; c < this.opts.cols; c++) {
          if (!fx.cleared[c] && Math.abs(c - fx.col) <= reach) {
            fx.cleared[c] = true;
            this.clearGem(this.gemAt(fx.row, c));
          }
        }
        if (p < 0.85 && this.rng.chance(0.5)) {
          const { x, y } = this.cellCentre(fx.row, fx.col);
          const side = this.rng.chance(0.5) ? -1 : 1;
          const hx = Math.max(PAD, Math.min(this.w - PAD, x + side * reach * this.cell));
          this.spawnSparkles(hx, y + (this.rng.next() - 0.5) * this.cell * 0.4, '#fff2c8', 1, 0.5);
        }
        if (p >= 1 && !anyClearing()) this.finishEffect();
        return;
      }
      case 'orb': {
        if (fx.t < ORB_SHOW_MS) return;
        const p = clamp01((fx.t - ORB_SHOW_MS) / ORB_RIPPLE_MS);
        const radius = easeInOutSine(p) * fx.maxDist;
        const centre = this.gemAt(fx.row, fx.col);
        if (centre && centre.clearing === null) this.clearGem(centre);
        for (const g of this.gems) {
          if (g.type !== fx.color || g.clearing !== null || fx.cleared.has(g.id)) continue;
          if (Math.hypot(g.col - fx.col, g.row - fx.row) <= radius) {
            fx.cleared.add(g.id);
            this.clearGem(g);
          }
        }
        if (p >= 1 && !anyClearing()) this.finishEffect();
        return;
      }
      case 'bloom': {
        if (fx.t < BUD_MS) return;
        const p = clamp01((fx.t - BUD_MS) / RING_MS);
        const radius = easeOutCubic(p) * (fx.second ? 2.3 : 1.8);
        for (const g of this.gems) {
          if (g.clearing !== null || fx.cleared.has(g.id)) continue;
          if (!fx.second && g.id === fx.budId) continue; // the bud survives its first opening
          if (Math.abs(g.col - fx.col) <= 1 && Math.abs(g.row - fx.row) <= 1) {
            const d = Math.hypot(g.col - fx.col, g.row - fx.row);
            if (d <= radius) {
              fx.cleared.add(g.id);
              this.clearGem(g);
            }
          }
        }
        if (p >= 1 && !anyClearing()) this.finishEffect();
        return;
      }
    }
  }

  private finishEffect(): void {
    const fx = this.effect;
    this.effect = null;
    if (fx?.kind === 'bloom' && !fx.second) this.pendingSecondBloom = fx.budId;
    this.collapse();
  }

  private collapse(): void {
    const { rows, cols } = this.opts;
    const target = makeGrid(rows, cols);
    const missingPer: number[] = [];
    // Pass 1: settle every survivor, so refills can see the whole final layout.
    for (let c = 0; c < cols; c++) {
      const survivors = this.gems.filter((g) => g.col === c && g.clearing === null).sort((a, b) => a.row - b.row);
      const missing = rows - survivors.length;
      missingPer[c] = missing;
      survivors.forEach((g, i) => {
        g.row = missing + i;
        if (g.y !== g.row) {
          g.falling = true;
          g.vy = 0;
          g.delay = 0;
        }
        const tr = target[g.row];
        if (tr) tr[g.col] = g.type;
      });
    }
    // Pass 2: refills, each avoiding a line in the final layout when any type can.
    const newGems: Gem[] = [];
    for (let c = 0; c < cols; c++) {
      const missing = missingPer[c] ?? 0;
      for (let k = 0; k < missing; k++) {
        const type = this.pickRefill(target, k, c);
        const tr = target[k];
        if (tr) tr[c] = type;
        const gem = this.makeGem(type, k, c, -(missing - k) - 0.4);
        gem.delay = c * 28;
        newGems.push(gem);
      }
    }
    this.gems.push(...newGems);
    this.phase = 'falling';
  }

  /** A refill type that does not complete a line in the final layout, when possible. */
  private pickRefill(target: Grid, row: number, col: number): GemType {
    const candidates = this.opts.types.slice();
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      const tmp = candidates[i] as GemType;
      candidates[i] = candidates[j] as GemType;
      candidates[j] = tmp;
    }
    const tr = target[row];
    for (const type of candidates) {
      if (tr) tr[col] = type;
      if (!hasLineAt(target, row, col)) return type;
    }
    return candidates[0] as GemType;
  }

  private updateFalling(seconds: number, dt: number): void {
    let anyMoving = false;
    for (const g of this.gems) {
      if (g.settle !== null) {
        g.settle += dt;
        if (g.settle >= SETTLE_MS) g.settle = null;
        else anyMoving = true;
      }
      if (!g.falling) continue;
      if (g.delay > 0) {
        g.delay -= dt;
        anyMoving = true;
        continue;
      }
      g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * seconds);
      g.y += g.vy * seconds;
      if (g.y >= g.row) {
        g.y = g.row;
        g.falling = false;
        g.vy = 0;
        g.settle = 0;
      }
      anyMoving = true;
    }
    if (!anyMoving) {
      const bud = this.pendingSecondBloom !== null ? this.gems.find((g) => g.id === this.pendingSecondBloom) : undefined;
      this.pendingSecondBloom = null;
      if (bud) {
        this.effect = { kind: 'bloom', row: bud.row, col: bud.col, t: 0, second: true, budId: bud.id, cleared: new Set() };
        this.phase = 'power';
        return;
      }
      // Lines formed by the fall clear as a cascade, each step a note higher.
      const matches = findLineMatches(this.grid());
      if (matches.length > 0 && this.cascadeStep < MAX_CASCADE_STEPS) {
        this.cascadeStep++;
        for (const match of matches) for (const cell of match) this.clearGem(this.gemAt(cell.row, cell.col));
        this.effect = { kind: 'cascade', t: 0, step: this.cascadeStep };
        this.phase = 'power';
        this.opts.onCascade?.(this.cascadeStep);
        return;
      }
      this.phase = 'idle';
      this.idleMs = 0;
      this.cascadeStep = 0;
    }
  }

  private updateParticles(seconds: number): void {
    const damp = Math.exp(-0.9 * seconds); // 0.985 per frame at 60 Hz, frame-rate independent
    for (const p of this.particles) {
      p.life += seconds * 1000;
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.vx *= damp;
      p.vy = p.vy * damp - this.cell * 0.25 * seconds;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
  }

  private spawnSparkles(x: number, y: number, color: string, n: number, speed = 1): void {
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(0.25, 0.9) * this.cell * speed;
      this.particles.push({
        x: x + this.rng.range(-0.15, 0.15) * this.cell,
        y: y + this.rng.range(-0.15, 0.15) * this.cell,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - this.cell * 0.3,
        life: 0,
        maxLife: this.rng.range(520, 900),
        color,
        size: this.rng.range(0.05, 0.11) * this.cell,
      });
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  private cellCentre(row: number, col: number): { x: number; y: number } {
    return { x: PAD + (col + 0.5) * this.cell, y: HUD_HEIGHT + (row + 0.5) * this.cell };
  }

  private gemCentre(g: Gem): { x: number; y: number } {
    return { x: PAD + (g.col + 0.5) * this.cell, y: HUD_HEIGHT + (g.y + 0.5) * this.cell };
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.time / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.ambient) this.style.drawBackground(ctx, w, h, t, this.ambient);
    this.drawVignette(t);
    this.drawHud(t);

    const { rows, cols } = this.opts;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) this.style.drawCell(ctx, PAD + c * this.cell, HUD_HEIGHT + r * this.cell, this.cell);

    if (this.hint) this.drawHint(t);

    // Board clip so falling gems appear from above the top row.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, HUD_HEIGHT - 2, w, rows * this.cell + 4 + PAD);
    ctx.clip();
    const radius = this.cell * 0.41;
    const hidden = this.hiddenCell();
    const budId = this.effect?.kind === 'bloom' ? this.effect.budId : this.pendingSecondBloom;
    const ordered = this.gems.slice().sort((a, b) => Number(a.clearing !== null) - Number(b.clearing !== null));
    for (const g of ordered) {
      if (hidden && g.row === hidden.row && g.col === hidden.col && g.clearing === null && !g.falling) continue;
      if (budId !== null && g.id === budId) continue;
      const { x, y } = this.gemCentre(g);
      let alpha = 1;
      let scale = 1;
      let brighten = 0;
      let scaleX = 1;
      let scaleY = 1;
      if (g.clearing !== null) {
        if (g.clearing < CLEAR_BLOOM_MS) {
          const p = g.clearing / CLEAR_BLOOM_MS;
          scale = 1 + 0.14 * easeOutCubic(p);
          brighten = 0.6 * p;
        } else {
          const p = clamp01((g.clearing - CLEAR_BLOOM_MS) / (CLEAR_MS - CLEAR_BLOOM_MS));
          scale = 1.14 - 1.0 * easeInOutSine(p);
          alpha = 1 - p;
          brighten = 0.6 * (1 - p);
        }
      } else if (g.settle !== null) {
        const p = g.settle / SETTLE_MS;
        const s = Math.sin(Math.PI * p);
        scaleY = 1 - 0.09 * s;
        scaleX = 1 + 0.06 * s;
      }
      this.sprites.draw(ctx, g.type, x, y + (scaleY < 1 ? radius * (1 - scaleY) : 0), radius, { alpha, scaleX: scale * scaleX, scaleY: scale * scaleY, brighten });
    }
    // The bud rides the fall between its two openings.
    if (budId !== null && this.phase === 'falling') {
      const bud = this.gems.find((g) => g.id === budId);
      if (bud) {
        const { x, y } = this.gemCentre(bud);
        drawBud(ctx, x, y, this.cell * 0.4, t, 0.3);
      }
    }
    ctx.restore();

    if (this.effect) this.drawEffect(this.effect, t);
    this.drawParticles();
    this.drawRipples();
  }

  private hiddenCell(): Cell | null {
    const fx = this.effect;
    if (!fx || fx.kind !== 'orb') return null;
    return { row: fx.row, col: fx.col };
  }

  private drawVignette(t: number): void {
    const { ctx, w, h } = this;
    const a = 0.05 + 0.07 * breath(t);
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, rgba(this.style.palette.lanternGlow, 0));
    g.addColorStop(1, rgba(this.style.palette.lanternGlow, a));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawHud(t: number): void {
    const { ctx, w } = this;
    const cx = w / 2;
    drawLantern(ctx, cx - 30, HUD_HEIGHT / 2 + 4, 44, this.lanternFill + 0.02 * Math.sin(t * 0.55), this.style.palette, t);
    const bob = Math.sin(t * 1.3) * 1.5;
    drawCompanion(ctx, this.companion, cx + 36, HUD_HEIGHT / 2 + 2 + bob, 40, t);
    // Moon (the grown-up gate), dim, top-left. Baked once so the cut-out never erases the canvas beneath.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(this.moonSprite(), PAD + 2, 10, 24, 24);
    ctx.restore();
  }

  private moon: HTMLCanvasElement | null = null;

  private moonSprite(): HTMLCanvasElement {
    if (this.moon) return this.moon;
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = size * this.dpr;
    canvas.height = size * this.dpr;
    const c = canvas.getContext('2d');
    if (c) {
      c.scale(this.dpr, this.dpr);
      c.fillStyle = this.style.palette.text;
      c.beginPath();
      c.arc(12, 12, 9, 0, Math.PI * 2);
      c.fill();
      c.globalCompositeOperation = 'destination-out';
      c.beginPath();
      c.arc(17, 9, 8, 0, Math.PI * 2);
      c.fill();
    }
    this.moon = canvas;
    return canvas;
  }

  private drawHint(t: number): void {
    if (!this.hint) return;
    const { ctx } = this;
    const a = 0.16 + 0.22 * breath(t * 1.0);
    for (const c of [this.hint.a, this.hint.b]) {
      const { x, y } = this.cellCentre(c.row, c.col);
      glowDisc(ctx, x, y, this.cell * 0.78, this.style.palette.hint, a);
    }
  }

  private drawEffect(fx: Effect, t: number): void {
    const { ctx } = this;
    switch (fx.kind) {
      case 'cascade':
        return;
      case 'comet':
        this.drawComet(fx, t);
        return;
      case 'orb': {
        const { x, y } = this.cellCentre(fx.row, fx.col);
        if (fx.t < ORB_SHOW_MS) {
          const p = easeOutCubic(clamp01(fx.t / ORB_SHOW_MS));
          drawOrb(ctx, x, y, this.cell * 0.46 * (0.35 + 0.65 * p), t);
        } else {
          const p = clamp01((fx.t - ORB_SHOW_MS) / ORB_RIPPLE_MS);
          const radius = easeInOutSine(p) * fx.maxDist * this.cell;
          const light = this.style.gemColor(fx.color).light;
          if (p < 0.4) {
            ctx.save();
            ctx.globalAlpha = 1 - p / 0.4;
            drawOrb(ctx, x, y, this.cell * 0.46 * (1 + p * 1.2), t);
            ctx.restore();
          }
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          softRing(ctx, x, y, radius, this.cell * 0.45, light, 0.7 * (1 - p * 0.6));
          softRing(ctx, x, y, radius * 0.8, this.cell * 0.3, '#ffffff', 0.25 * (1 - p));
          if (p < 0.35) glowDisc(ctx, x, y, this.cell * (0.6 + p * 2), '#ffffff', 0.5 * (1 - p / 0.35));
          ctx.restore();
        }
        return;
      }
      case 'bloom': {
        const { x, y } = this.cellCentre(fx.row, fx.col);
        if (fx.t < BUD_MS) {
          const p = clamp01(fx.t / BUD_MS);
          drawBud(ctx, x, y, this.cell * 0.4 * (1 + 0.08 * Math.sin(p * Math.PI * 2)), t, p);
        } else {
          const p = clamp01((fx.t - BUD_MS) / RING_MS);
          if (!fx.second) {
            // First opening: the bud stays, glowing, and will ride the fall.
            drawBud(ctx, x, y, this.cell * 0.4 * (1 + 0.1 * (1 - p)), t, 1);
          } else if (p < 0.45) {
            ctx.save();
            ctx.globalAlpha = 1 - p / 0.45;
            drawBud(ctx, x, y, this.cell * 0.4 * (1 + p * 1.5), t, 1);
            ctx.restore();
          }
          const radius = easeOutCubic(p) * (fx.second ? 2.3 : 1.8) * this.cell;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          softRing(ctx, x, y, radius, this.cell * 0.4, '#ffd9ec', 0.75 * (1 - p * 0.7));
          glowDisc(ctx, x, y, radius * 0.9, '#ff9fcf', 0.3 * (1 - p));
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + t * 0.4;
            const px = x + Math.cos(a) * radius * 0.7;
            const py = y + Math.sin(a) * radius * 0.7;
            highlight(ctx, px, py, this.cell * 0.32, this.cell * 0.16, a, 0.42 * (1 - p));
          }
          ctx.restore();
        }
        return;
      }
    }
  }

  private drawComet(fx: CometFx, t: number): void {
    const { ctx, cell } = this;
    const { x: ox, y } = this.cellCentre(fx.row, fx.col);
    if (fx.t < COMET_ARM_MS) {
      const p = clamp01(fx.t / COMET_ARM_MS);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const a = 0.35 + 0.45 * Math.sin(p * Math.PI);
      const g = ctx.createLinearGradient(ox - cell * 0.9, y, ox + cell * 0.9, y);
      g.addColorStop(0, 'rgba(255,245,215,0)');
      g.addColorStop(0.5, `rgba(255,245,215,${a})`);
      g.addColorStop(1, 'rgba(255,245,215,0)');
      ctx.fillStyle = g;
      ctx.fillRect(ox - cell * 0.9, y - cell * 0.07, cell * 1.8, cell * 0.14);
      glowDisc(ctx, ox, y, cell * 0.55, '#fff2c8', a * 0.8);
      ctx.restore();
      return;
    }
    const p = clamp01((fx.t - COMET_ARM_MS) / COMET_FLY_MS);
    const reach = this.cometReach(p) * cell;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const dir of [-1, 1]) {
      const hx = ox + dir * reach;
      const tailLen = Math.min(reach, cell * 2.8);
      const fade = 1 - p * 0.45;
      // Tail: a soft, tapering streak (wide faint layer plus a narrow bright core).
      for (const [height, alpha] of [
        [cell * 0.5, 0.22],
        [cell * 0.22, 0.5],
      ] as Array<[number, number]>) {
        const g = ctx.createLinearGradient(hx - dir * tailLen, y, hx, y);
        g.addColorStop(0, 'rgba(255,240,200,0)');
        g.addColorStop(0.6, `rgba(255,236,190,${alpha * 0.45 * fade})`);
        g.addColorStop(1, `rgba(255,250,235,${alpha * fade})`);
        ctx.fillStyle = g;
        ctx.save();
        ctx.translate(hx, y);
        ctx.scale(dir, 1);
        ctx.beginPath();
        ctx.moveTo(-tailLen, 0);
        ctx.quadraticCurveTo(-tailLen * 0.5, -height / 2, 0, -height / 2);
        ctx.arc(0, 0, height / 2, -Math.PI / 2, Math.PI / 2);
        ctx.quadraticCurveTo(-tailLen * 0.5, height / 2, -tailLen, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      glowDisc(ctx, hx, y, cell * 0.5, '#ffffff', 0.5 * fade);
      glowDisc(ctx, hx, y, cell * 0.95, '#ffd27a', 0.35 * fade);
    }
    ctx.restore();
    void t;
  }

  private drawParticles(): void {
    const { ctx } = this;
    if (this.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const a = 1 - p.life / p.maxLife;
      glowDisc(ctx, p.x, p.y, p.size * 3.2, p.color, a * 0.4);
      ctx.fillStyle = rgba(lighten(p.color, 0.5), a);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * a), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawRipples(): void {
    const { ctx } = this;
    for (const r of this.ripples) {
      const p = clamp01(r.t / 480);
      softRing(ctx, r.x, r.y, 6 + p * this.cell * 0.9, this.cell * 0.18, this.style.palette.hint, 0.35 * (1 - p));
    }
  }
}

/** The Prism Orb: a slowly swirling sphere of every gem colour. */
export function drawOrb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, t: number): void {
  ctx.save();
  ctx.translate(x, y);
  glowDisc(ctx, 0, 0, r * 1.9, '#ffffff', 0.28);
  const base = ctx.createRadialGradient(-0.3 * r, -0.3 * r, r * 0.1, 0, 0, r);
  base.addColorStop(0, '#6a4aa0');
  base.addColorStop(1, '#1a1030');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  const colors = ['#ffc84a', '#ff6fa8', '#4aa8ff', '#45e49a', '#b57dff'];
  colors.forEach((c, i) => {
    const a = t * 0.9 + (i * Math.PI * 2) / colors.length;
    const ox = Math.cos(a) * r * 0.45;
    const oy = Math.sin(a * 1.3) * r * 0.45;
    const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, r * 0.8);
    g.addColorStop(0, rgba(c, 0.9));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
  });
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  highlight(ctx, -0.35 * r, -0.4 * r, r * 0.32, r * 0.18, -0.6, 0.85);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const a = t * 2 + (i * Math.PI * 2) / 3;
    glowDisc(ctx, Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3, r * 0.22, '#ffffff', 0.7);
  }
  ctx.restore();
}

/** The Bloom's closed bud, before it opens. */
const BUD_REF = 32;

export function drawBud(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, t: number, p: number): void {
  ctx.save();
  ctx.translate(x, y + radius * 0.1);
  glowDisc(ctx, 0, 0, radius * 1.7, '#ff9fcf', 0.3 + 0.35 * p);
  // Draw at one reference radius and scale, so the animated size never grows the path cache.
  ctx.scale(radius / BUD_REF, radius / BUD_REF);
  const r = BUD_REF;
  const path = shapePath('drop', r);
  const g = ctx.createRadialGradient(-0.2 * r, -0.1 * r, 0, 0, 0.2 * r, r * 1.1);
  g.addColorStop(0, '#ffd0e4');
  g.addColorStop(0.5, '#ff8fb8');
  g.addColorStop(1, '#d94d85');
  ctx.fillStyle = g;
  ctx.fill(path);
  ctx.strokeStyle = 'rgba(255,230,240,0.6)';
  ctx.lineWidth = r * 0.08;
  ctx.stroke(path);
  ctx.save();
  ctx.clip(path);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = r * 0.05;
  for (const dx of [-0.28, 0, 0.28]) {
    ctx.beginPath();
    ctx.moveTo(dx * r, r * 0.9);
    ctx.quadraticCurveTo(dx * r * 1.6, 0, 0, -r * 0.9);
    ctx.stroke();
  }
  ctx.restore();
  // Sepals
  ctx.fillStyle = '#4fc98a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(0, r * 0.95);
    ctx.quadraticCurveTo(side * r * 0.75, r * 0.9, side * r * 0.55, r * 0.35);
    ctx.quadraticCurveTo(side * r * 0.3, r * 0.75, 0, r * 0.95);
    ctx.fill();
  }
  ctx.restore();
  void t;
}
