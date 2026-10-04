/**
 * The game view: draws a GameState and plays the Steps the core returns as
 * smooth, weighted animation. It never decides game rules; it only shows
 * what the core says happened, then snaps to the core's final board.
 *
 * Every power and every combination has its animation here (DESIGN.md 3.4):
 * all of them flow as waves of light, blooms, sweeps and ripples, never
 * blasts. Cells dissolve as the light reaches them. Brightness ramps are
 * gentle and every resting glow breathes over seconds (DESIGN.md 4.4).
 */
import { type Board, type FireStep, type GameState, type Piece, type PowerFamily, type Step, at, familyOf } from '../core/game';
import type { Cell, GemType } from '../core/grid';
import { createRng } from '../shared/rng';
import { type AreaTheme, paintSky } from '../render/areas';
import { lighten, rgba } from '../render/color';
import { type CompanionId, drawCompanion, drawLantern } from '../render/creatures';
import { drawBud, drawOrb } from '../render/board';
import { drawAuroraPiece, drawCometHead, drawMoonPearl, drawSpriteCreature, drawStarburstRays, slowPulse } from '../render/powers';
import { shapePath } from '../render/shapes';
import { GemSprites } from '../render/sprites';
import { breath, clamp01, easeInOutSine, easeOutCubic, glowDisc, highlight, softRing } from '../render/styles/common';
import type { Ambient, GemStyle } from '../render/styles/types';

interface VPiece {
  id: number;
  piece: Piece;
  row: number;
  col: number;
  x: number;
  y: number;
  vy: number;
  falling: boolean;
  delay: number;
  settle: number | null;
  clearing: number | null;
  sparkled: boolean;
  appear: number | null;
  lift: number;
  /** Draw only the gem, not its power ornament: the sprite has flown, the bud is opening from the effect instead. */
  hideOrnament: boolean;
  /** A bud that has opened once and rides the fall with a stronger glow (DESIGN.md 3.4, Bloom). */
  opened: boolean;
  /** Extra light added by an effect touching this piece (a transform, a bud's lead-in); decays on its own. */
  shine: number;
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
  /** Converging particles fly toward a point instead of drifting. */
  target?: { x: number; y: number };
}

interface Ring {
  x: number;
  y: number;
  t: number;
  duration: number;
  radius: number;
  color: string;
  alpha: number;
}

/** A decorative bloom opening (the moonflower's), with no cells of its own. */
interface Flower {
  x: number;
  y: number;
  t: number;
  duration: number;
  /** Final ring radius in cells. */
  radius: number;
}

export type HudTarget = 'lantern' | 'companion';

interface Ripple {
  x: number;
  y: number;
  t: number;
}

type TransformStep = Extract<Step, { kind: 'transform' }>;

/** How a fire step is shown; most powers map to themselves, the Orb + Orb combination is its own sunrise. */
type Fx = 'comet' | 'orb' | 'sunrise' | 'bloom' | 'sprite' | 'starburst' | 'moonrise' | 'aurora';

interface Pt {
  x: number;
  y: number;
}

interface FireAnim {
  step: FireStep;
  fx: Fx;
  /** Milliseconds since the animation began (after its stagger delay). */
  t: number;
  /** Milliseconds still to wait before it begins: the wave stagger inside a group. */
  delay: number;
  duration: number;
  begun: boolean;
  /** Cells already dissolving. */
  started: Set<string>;
  /** Light per effect when several go off together, so stacked heads, rings and beams never add up to a blast. */
  dim: number;
  /** The first effect of its group (or one on its own): the one that shows the shared pieces, such as the moon. */
  leader: boolean;
  /** Bloom: lead-in before the ring opens, ring time, final ring radius in cells, whether the bud survives. */
  bloom?: { lead: number; ring: number; radius: number; stays: boolean };
  /** Sprite: the curved flight path and whether it has popped at the target. */
  flight?: { from: Pt; ctrl: Pt; to: Pt; popped: boolean; carriedColor: GemType | null };
  /** Moonrise: the band of columns the beam covers, and whether the moonflower has opened. */
  band?: { c0: number; c1: number; flowered: boolean };
  /** Aurora: the colours in wave order and the time between waves. */
  waves?: { colors: GemType[]; stagger: number; sweep: number };
}

interface TransformAnim {
  step: TransformStep;
  t: number;
  duration: number;
  swapped: boolean;
}

export interface ViewEvents {
  onSwap?(valid: boolean): void;
  onClear?(groups: Array<{ cells: Cell[]; type: GemType | null }>, cascade: number): void;
  onCreate?(piece: Piece): void;
  /** Called exactly once per fire step, the moment its animation begins (after any wave stagger). */
  onFire?(step: FireStep): void;
  /** Gems turning into powers (a shower or a wave combination) as the change begins. */
  onTransform?(step: TransformStep): void;
  onLand?(count: number): void;
  onReshuffle?(): void;
  onIdle?(): void;
}

export interface Layout {
  width: number;
  height: number;
  cell: number;
  boardX: number;
  boardY: number;
  hudY: number;
}

export interface PlayOptions {
  /** Speed of this resolution: 0.7 is the discovery slow-motion (DESIGN.md 3.4), 1 is normal. Ignored under Reduce Motion. */
  timeScale?: number;
}

// Feel numbers (DESIGN.md 3.3): swap 160 ms; a match brightens for 120 ms then dissolves over 220 ms.
const SWAP_MS = 160;
const INVALID_HOLD_MS = 60;
const CLEAR_MS = 340;
const CLEAR_BLOOM_MS = 120;
const APPEAR_MS = 260;
const SETTLE_MS = 150;
const GRAVITY = 30;
const MAX_FALL = 15;
const MAX_PARTICLES = 160;
const IDLE_FPS = 12;

// Effect timings (DESIGN.md 3.4), in ms before motion scaling.
const COMET_MS = 900;
/** A comet or starburst in a shower of more than three: eight comets take about four seconds, not seven. */
const SHOWER_MS = 480;
const ORB_MS = 1300;
const SUNRISE_MS = 2500;
const STARBURST_MS = 900;
const TRANSFORM_MS = 350;
const SPRITE_LIFT_MS = 140;
const SPRITE_FLIGHT_MS = 700;
const SPRITE_POP_MS = 300;
const MOON_RISE_MS = 350;
const MOON_BEAM_MS = 1100;
const MOON_FADE_MS = 250;
const AURORA_SWEEP_MS = 1200;
/** Stagger per cell of distance from the group's origin, so a grouped effect reads as a wave. */
const WAVE_STAGGER_MS = 60;
const MAX_STAGGER_MS = 600;

const key = (c: Cell): string => `${c.row},${c.col}`;

export class GameView {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private readonly sprites: GemSprites;
  private ambient: Ambient | null = null;
  private theme: AreaTheme | null = null;
  private pieces = new Map<string, VPiece>();
  private floating: VPiece[] = [];
  private nextId = 1;
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private rings: Ring[] = [];
  private flowers: Flower[] = [];
  private fires: FireAnim[] = [];
  private transform: TransformAnim | null = null;
  /** Cells whose piece is not drawn: a power being carried by a sprite. */
  private hidden = new Set<string>();
  private gift = new Set<PowerFamily>();
  private onStep: ((step: Step) => void) | null = null;
  private goal = { done: 0, total: 8 };
  private goalPulse: number[] = [];
  private pulse = 0;
  private pokes: { target: HudTarget; t: number }[] = [];
  private queue: Step[] = [];
  private current: { step: Step; t: number; phase: number } | null = null;
  private finalBoard: Board | null = null;
  private onDone: (() => void) | null = null;
  private lastSwap: { a: Cell; b: Cell } | null = null;
  private shortShower = false;
  private layout: Layout = { width: 390, height: 844, cell: 60, boardX: 15, boardY: 120, hudY: 40 };
  private time = 0;
  private lastNow = 0;
  private raf = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private active = false;
  private selected: Cell | null = null;
  private hint: { a: Cell; b: Cell } | null = null;
  private lanternFill = 0;
  private lanternTarget = 0;
  private celebrating: { t: number; done: () => void } | null = null;
  private fadeIn = 0;
  private breathing = true;
  private readonly rng = createRng(777);
  /** Reduce Motion: shorter transitions and fewer particles (DESIGN.md 4.4). */
  private motionScale: number;
  /** Speed of the resolution being played: game time runs at this rate while steps play. */
  private timeScale = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: GemStyle,
    private state: GameState,
    private companion: CompanionId,
    private readonly events: ViewEvents,
    reducedMotion: boolean,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.sprites = new GemSprites(style, this.dpr);
    this.motionScale = reducedMotion ? 0.6 : 1;
    this.rebuild(state.board);
    this.resize();
  }

  get busy(): boolean {
    return this.current !== null || this.queue.length > 0 || this.celebrating !== null;
  }

  get currentLayout(): Layout {
    return this.layout;
  }

  setCompanion(id: CompanionId): void {
    this.companion = id;
  }

  setSelected(cell: Cell | null): void {
    this.selected = cell;
    this.wake();
  }

  setHint(hint: { a: Cell; b: Cell } | null): void {
    this.hint = hint;
    this.wake();
  }

  setLantern(fill: number): void {
    this.lanternTarget = clamp01(fill);
    this.wake();
  }

  /**
   * The area's look (DESIGN.md 3.1, 3.5): its sky gradient, soft glows and
   * slow ambient life replace the style's background. Cells and gems stay the
   * style's. The Meadow theme is the Night Garden background exactly.
   */
  setArea(theme: AreaTheme): void {
    this.theme = theme;
    this.ambient = theme.createAmbient(this.layout.width, this.layout.height, 5);
    this.wake();
  }

  /** Powers whose pieces wear the gift halo (DESIGN.md 3.4, "glowing with a soft halo") until the list is cleared. */
  setGift(families: PowerFamily[]): void {
    this.gift = new Set(families);
    this.wake();
  }

  /** Reduce Motion (DESIGN.md 4.4): shorter, fade-based transitions, fewer particles, no slow-motion. */
  setReducedMotion(on: boolean): void {
    this.motionScale = on ? 0.6 : 1;
    if (on) this.timeScale = 1;
  }

  /** The vignette breathes at a calm pace (DESIGN.md 3.8); off, it is a static faint vignette. */
  setBreathing(on: boolean): void {
    this.breathing = on;
    this.wake();
  }

  get goalDone(): number {
    return this.goal.done;
  }

  /** The Calm goal: `total` stars, `done` of them lit. The lantern fills with them. */
  setGoal(done: number, total: number): void {
    const prev = this.goal.done;
    this.goal = { done: Math.min(done, total), total };
    for (let i = prev; i < this.goal.done; i++) this.goalPulse[i] = 0;
    this.setLantern(total > 0 ? this.goal.done / total : 0);
  }

  /** What HUD element, if any, is under a point. */
  hudHit(clientX: number, clientY: number): HudTarget | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.layout.width;
    const y = ((clientY - rect.top) / rect.height) * this.layout.height;
    const cx = this.layout.width / 2;
    if (Math.hypot(x - (cx - 34), y - this.layout.hudY) < 34) return 'lantern';
    if (Math.hypot(x - (cx + 40), y - this.layout.hudY) < 34) return 'companion';
    return null;
  }

  /** A little response when she touches the lantern or the companion. */
  poke(target: HudTarget): void {
    this.pokes.push({ target, t: 0 });
    const cx = this.layout.width / 2;
    const x = target === 'lantern' ? cx - 34 : cx + 40;
    this.spawnSparkles(x, this.layout.hudY, '#ffe9a8', 7, 0.6);
    this.wake();
  }

  cellAt(clientX: number, clientY: number): Cell | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.layout.width;
    const y = ((clientY - rect.top) / rect.height) * this.layout.height;
    const col = Math.floor((x - this.layout.boardX) / this.layout.cell);
    const row = Math.floor((y - this.layout.boardY) / this.layout.cell);
    if (row < 0 || col < 0 || row >= this.state.rows || col >= this.state.cols) return null;
    return { row, col };
  }

  ripple(clientX: number, clientY: number): void {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * this.layout.width;
    const y = ((clientY - rect.top) / rect.height) * this.layout.height;
    this.ripples.push({ x, y, t: 0 });
    this.wake();
  }

  /** Replace the board outright (new level, resume) with a soft fade-in. */
  setState(state: GameState): void {
    const resized = state.rows !== this.state.rows || state.cols !== this.state.cols;
    this.state = state;
    this.cancelResolution();
    this.rebuild(state.board);
    // A board of another size (Play mode's 7 by 8) needs its own cell size and position.
    if (resized) this.resize();
    this.fadeIn = 1;
    this.wake();
  }

  /**
   * Drop whatever resolution is still playing: a mode switch or a map jump
   * replaces the board outright, and the old steps must not keep clearing and
   * spawning pieces on it or snap it back to the old level's final board.
   */
  private cancelResolution(): void {
    this.queue = [];
    this.current = null;
    this.fires = [];
    this.transform = null;
    this.flowers = [];
    this.floating = [];
    this.hidden.clear();
    this.finalBoard = null;
    this.onDone = null;
    this.onStep = null;
    this.lastSwap = null;
    this.shortShower = false;
    this.celebrating = null;
    this.timeScale = 1;
  }

  /**
   * Play a resolution's steps, then snap to its final board and call done.
   * `opts.timeScale` below 1 slows game time for the whole resolution, falls
   * included, so a discovery plays in slow motion rather than stuttering.
   */
  play(steps: Step[], finalState: GameState, done: () => void, onStep: ((step: Step) => void) | null = null, opts: PlayOptions = {}): void {
    this.state = finalState;
    this.finalBoard = finalState.board;
    this.queue.push(...steps);
    this.onDone = done;
    this.onStep = onStep;
    this.selected = null;
    this.hint = null;
    if (this.motionScale >= 1) this.timeScale = Math.min(1, Math.max(0.4, opts.timeScale ?? 1));
    // A shower of more than three comets or starbursts flies faster so it stays a wave, not a wait.
    let shower = 0;
    for (const s of steps) if (s.kind === 'fire' && (s.combo === 'cometShower' || s.combo === 'starShower')) shower++;
    this.shortShower = shower > 3;
    this.wake();
  }

  /** Level complete: the pieces drift up into the lantern as light. */
  celebrate(done: () => void): void {
    this.celebrating = { t: 0, done };
    this.hint = null;
    this.selected = null;
    this.wake();
  }

  resize(): void {
    // The canvas is 100% of the stage's content box, which excludes the safe-area padding.
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect.width || window.innerWidth));
    const height = Math.max(400, Math.floor(rect.height || window.innerHeight));
    const pad = 8;
    const hud = 108; // lantern and companion row plus the goal stars
    const cell = Math.min((width - pad * 2) / this.state.cols, (height - hud - 24) / this.state.rows);
    const boardW = cell * this.state.cols;
    const boardH = cell * this.state.rows;
    const boardX = (width - boardW) / 2;
    const spare = height - hud - boardH;
    // Board a little below centre so it sits under her thumbs; the HUD rides just above it.
    const boardY = hud + Math.max(6, spare * 0.6 - 8);
    const hudY = boardY - 70;
    this.layout = { width, height, cell, boardX, boardY, hudY };
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.ambient = this.theme ? this.theme.createAmbient(width, height, 5) : this.style.createAmbient(width, height, 5);
    this.draw();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.wake();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.active = false;
  }

  // -------------------------------------------------------------- internals

  private rebuild(board: Board): void {
    this.pieces.clear();
    this.floating = [];
    this.hidden.clear();
    board.forEach((row, r) =>
      row.forEach((p, c) => {
        if (p) this.pieces.set(key({ row: r, col: c }), this.make(p, r, c, r));
      }),
    );
  }

  private make(piece: Piece, row: number, col: number, y: number): VPiece {
    return {
      id: this.nextId++,
      piece,
      row,
      col,
      x: col,
      y,
      vy: 0,
      falling: y !== row,
      delay: 0,
      settle: null,
      clearing: null,
      sparkled: false,
      appear: null,
      lift: 0,
      hideOrnament: false,
      opened: false,
      shine: 0,
    };
  }

  /** Something is moving: run at full frame rate. */
  private wake(): void {
    if (!this.running) return;
    if (this.active) return;
    this.active = true;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private clearFlourish(step: Extract<Step, { kind: 'clear' }>): void {
    const cell = this.layout.cell;
    for (const g of step.groups) {
      if (g.cells.length === 0) continue;
      let sx = 0;
      let sy = 0;
      for (const c of g.cells) {
        sx += c.col;
        sy += c.row;
      }
      const centre = this.centre(sx / g.cells.length, sy / g.cells.length);
      const color = g.type ? this.style.gemColor(g.type).light : '#fff2c8';
      const big = g.cells.length >= 4 || step.cascade > 0;
      this.rings.push({ x: centre.x, y: centre.y, t: 0, duration: big ? 620 : 480, radius: cell * (g.cells.length >= 4 ? 1.9 : 1.4) * (1 + step.cascade * 0.12), color, alpha: big ? 0.55 : 0.4 });
      if (big) this.rings.push({ x: centre.x, y: centre.y, t: 0, duration: 760, radius: cell * 2.6, color: '#ffffff', alpha: 0.18 });
    }
    // Each cascade step brightens the whole scene a touch more: a soft swell, never a flash.
    this.pulse = Math.min(0.14, 0.05 + step.cascade * 0.03);
  }

  private readonly frame = (now: number): void => {
    // Full rate caps a hitch at 50 ms; the idle tick (12 fps) needs its whole interval, or the breathing and halos would run slow.
    const dt = Math.min(this.active ? 50 : 1000 / IDLE_FPS + 40, now - this.lastNow);
    this.lastNow = now;
    this.time += dt;
    const moving = this.update(dt);
    this.draw();
    if (!this.running) return;
    if (moving) {
      this.active = true;
      this.raf = requestAnimationFrame(this.frame);
    } else {
      // Idle: a slow tick keeps the fireflies and the breathing glow alive cheaply.
      this.active = false;
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (!this.running || this.active) return;
        this.frame(performance.now());
      }, 1000 / IDLE_FPS);
    }
  };

  /** Returns true while anything needs full frame rate. */
  private update(dt: number): boolean {
    // Game time runs at timeScale while a resolution plays: every duration, fall and sparkle slows together.
    const gdt = dt * this.timeScale;
    const seconds = gdt / 1000;
    let moving = false;
    this.ripples = this.ripples.filter((r) => (r.t += dt) < 480);
    if (this.ripples.length > 0) moving = true;
    this.rings = this.rings.filter((r) => (r.t += gdt) < r.duration);
    if (this.rings.length > 0) moving = true;
    this.flowers = this.flowers.filter((f) => (f.t += gdt) < f.duration);
    if (this.flowers.length > 0) moving = true;
    if (this.pulse > 0.001) {
      this.pulse *= Math.exp(-gdt / 260);
      moving = true;
    } else this.pulse = 0;
    for (let i = 0; i < this.goalPulse.length; i++) {
      const v = this.goalPulse[i];
      if (v !== undefined && v < 900) {
        this.goalPulse[i] = v + dt;
        moving = true;
      }
    }
    this.pokes = this.pokes.filter((p) => (p.t += dt) < 700);
    if (this.pokes.length > 0) moving = true;
    if (this.updateParticles(seconds)) moving = true;
    if (this.updateClearing(gdt)) moving = true;
    if (this.updateAppear(gdt)) moving = true;
    if (this.updateFires(gdt)) moving = true;
    if (this.updateTransform(gdt)) moving = true;
    if (this.fadeIn > 0) {
      this.fadeIn = Math.max(0, this.fadeIn - dt / 450);
      moving = true;
    }
    const d = this.lanternTarget - this.lanternFill;
    if (Math.abs(d) > 0.002) {
      this.lanternFill += d * Math.min(1, dt / 500);
      moving = true;
    } else this.lanternFill = this.lanternTarget;
    for (const p of this.pieces.values()) {
      const target = this.selected && this.selected.row === p.row && this.selected.col === p.col ? 1 : 0;
      if (Math.abs(p.lift - target) > 0.01) {
        p.lift += (target - p.lift) * Math.min(1, dt / 90);
        moving = true;
      } else p.lift = target;
      if (p.shine > 0.005) {
        p.shine *= Math.exp(-gdt / 140);
        moving = true;
      } else p.shine = 0;
    }
    if (this.celebrating) {
      this.celebrating.t += dt;
      moving = true;
      if (this.celebrating.t > 1900) {
        const done = this.celebrating.done;
        this.celebrating = null;
        this.pieces.clear();
        done();
      }
    }
    if (this.step(gdt)) moving = true;
    if (this.celebrating || this.queue.length > 0 || this.current) moving = true;
    return moving;
  }

  private step(dt: number): boolean {
    if (!this.current) {
      const next = this.queue.shift();
      if (!next) {
        if (this.finalBoard) {
          this.rebuild(this.finalBoard);
          this.finalBoard = null;
          this.timeScale = 1;
          const done = this.onDone;
          this.onDone = null;
          done?.();
          this.events.onIdle?.();
        }
        return false;
      }
      this.current = { step: next, t: 0, phase: 0 };
      if (next.kind === 'fire' && next.group !== undefined) {
        // Fire steps that share a group begin together, each staggered by its distance from the first (a wave).
        const members: FireStep[] = [next];
        while (this.queue[0]?.kind === 'fire' && (this.queue[0] as FireStep).group === next.group) members.push(this.queue.shift() as FireStep);
        // The group shares its light: each effect dims by the square root of the count (DESIGN.md 3.4, never a blast).
        const dim = 1 / Math.sqrt(Math.min(9, members.length));
        for (const m of members) this.queueFire(m, next.at, dim);
      } else this.begin(next);
    }
    const cur = this.current;
    cur.t += dt;
    if (this.advance(cur, dt)) this.current = null;
    return true;
  }

  private begin(step: Step): void {
    switch (step.kind) {
      case 'swap': {
        this.lastSwap = { a: step.a, b: step.b };
        this.events.onSwap?.(step.valid);
        return;
      }
      case 'fire': {
        this.queueFire(step, null);
        return;
      }
      case 'transform': {
        this.events.onTransform?.(step);
        this.transform = { step, t: 0, duration: TRANSFORM_MS * this.motionScale, swapped: false };
        return;
      }
      case 'clear': {
        this.events.onClear?.(step.groups, step.cascade);
        this.onStep?.(step);
        this.clearFlourish(step);
        for (const c of step.cells) {
          const p = this.pieces.get(key(c));
          if (p && p.clearing === null) p.clearing = 0;
        }
        return;
      }
      case 'create': {
        this.events.onCreate?.(step.piece);
        const vp = this.make(step.piece, step.cell.row, step.cell.col, step.cell.row);
        vp.appear = 0;
        this.pieces.set(key(step.cell), vp);
        // Light gathers in from around the cell and settles into the new power.
        const to = this.centre(step.cell.col, step.cell.row);
        const color = step.piece.type ? this.style.gemColor(step.piece.type).light : '#ffffff';
        const cell = this.layout.cell;
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 + this.rng.range(-0.2, 0.2);
          const d = cell * this.rng.range(1.2, 2.2);
          this.particles.push({ x: to.x + Math.cos(a) * d, y: to.y + Math.sin(a) * d, vx: 0, vy: 0, life: 0, maxLife: 420, color, size: cell * 0.08, target: to });
        }
        this.rings.push({ x: to.x, y: to.y, t: 0, duration: 700, radius: cell * 1.6, color: '#ffffff', alpha: 0.35 });
        return;
      }
      case 'fall': {
        const moved = new Map<string, VPiece>();
        for (const m of step.moves) {
          const p = this.pieces.get(key(m.from));
          if (!p) continue;
          this.pieces.delete(key(m.from));
          if (this.hidden.delete(key(m.from))) this.hidden.add(key(m.to));
          p.row = m.to.row;
          p.col = m.to.col;
          p.falling = true;
          p.vy = 0;
          moved.set(key(m.to), p);
        }
        for (const [k, p] of moved) this.pieces.set(k, p);
        for (const s of step.spawns) {
          const p = this.make(s.piece, s.to.row, s.to.col, s.fromRow - 0.4);
          p.delay = s.to.col * 24 + 20;
          this.pieces.set(key(s.to), p);
        }
        return;
      }
      case 'reshuffle':
        this.events.onReshuffle?.();
        return;
    }
  }

  // ----------------------------------------------------------- fire effects

  /** How a fire step is shown. */
  private fxOf(step: FireStep): Fx {
    switch (step.power) {
      case 'cometRow':
      case 'cometCol':
        return 'comet';
      case 'orb':
        return step.combo === 'sunrise' ? 'sunrise' : 'orb';
      default:
        return step.power;
    }
  }

  /**
   * Put a fire step's animation on the list. `origin` is the group's first
   * cell for the wave stagger (about 60 ms per cell of distance); a step on
   * its own begins at once. The animation itself starts in `startFire`.
   */
  private queueFire(step: FireStep, origin: Cell | null, dim = 1): void {
    const fx = this.fxOf(step);
    const ms = this.motionScale;
    const anim: FireAnim = { step, fx, t: 0, delay: 0, duration: 0, begun: false, started: new Set(), dim, leader: true };
    if (origin) {
      const d = Math.abs(step.at.row - origin.row) + Math.abs(step.at.col - origin.col);
      anim.delay = Math.min(MAX_STAGGER_MS, d * WAVE_STAGGER_MS) * ms;
      anim.leader = d === 0 && !this.fires.some((f) => f.leader && f.step.group === step.group);
    }
    const shower = this.shortShower && (step.combo === 'cometShower' || step.combo === 'starShower');
    switch (fx) {
      case 'comet':
        anim.duration = (shower ? SHOWER_MS : COMET_MS) * ms;
        break;
      case 'starburst':
        anim.duration = (shower ? SHOWER_MS : STARBURST_MS) * ms;
        break;
      case 'orb':
        anim.duration = ORB_MS * ms;
        break;
      case 'sunrise':
        anim.duration = SUNRISE_MS * ms;
        break;
      case 'bloom': {
        // First opening: 3 by 3 (ring to 1.8 cells) or the giant 5 by 5 (ring to 3). Second, or a single opening: the
        // 13-cell flower (ring to 2.6) or the giant's 29 cells (ring to 3.8). DESIGN.md 3.4, 2c.
        const giant = step.combo === 'giantBloom';
        const first = step.phase === 1;
        // A bloom without a phase (a wave, a carry, a pair) opens once, as far as its own cells reach.
        const single = Math.max(1.8, Math.min(2.6, this.maxDistance(step.at, step.cells) - 0.1));
        const bloom = first
          ? { lead: 140, ring: giant ? 560 : 480, radius: giant ? 3 : 1.8, stays: true }
          : { lead: 100, ring: giant ? 640 : 560, radius: giant ? 3.8 : step.phase === 2 ? 2.6 : single, stays: false };
        anim.bloom = { lead: bloom.lead * ms, ring: bloom.ring * ms, radius: bloom.radius, stays: bloom.stays };
        anim.duration = anim.bloom.lead + anim.bloom.ring;
        break;
      }
      case 'sprite': {
        if (!step.target) {
          anim.duration = SPRITE_POP_MS * ms;
          break;
        }
        const from = this.centre(step.at.col, step.at.row);
        const to = this.centre(step.target.col, step.target.row);
        // A quadratic curve bulging sideways by about 1.5 cells, upward when it can.
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        let px = -dy / len;
        let py = dx / len;
        if (py > 0) {
          px = -px;
          py = -py;
        }
        const bulge = this.layout.cell * 1.5;
        const ctrl = { x: (from.x + to.x) / 2 + px * bulge, y: (from.y + to.y) / 2 + py * bulge };
        // The carried power's colour comes from its own fire step, which follows this one.
        const nextStep = this.queue[0];
        const carriedColor = step.carrying && nextStep?.kind === 'fire' ? nextStep.color : null;
        anim.flight = { from, ctrl, to, popped: false, carriedColor };
        anim.duration = (SPRITE_LIFT_MS + SPRITE_FLIGHT_MS + SPRITE_POP_MS) * ms;
        break;
      }
      case 'moonrise': {
        let c0 = step.at.col;
        let c1 = step.at.col;
        for (const c of step.cells) {
          c0 = Math.min(c0, c.col);
          c1 = Math.max(c1, c.col);
        }
        if (step.combo === 'fullMoon') {
          c0 = 0;
          c1 = this.state.cols - 1;
        }
        anim.band = { c0, c1, flowered: step.combo !== 'moonflower' };
        anim.duration = (MOON_RISE_MS + MOON_BEAM_MS + MOON_FADE_MS) * ms;
        break;
      }
      case 'aurora': {
        const colors = step.colors && step.colors.length > 0 ? step.colors : step.color ? [step.color] : [];
        const total = (step.combo === 'auroraSky' ? 3600 : colors.length >= 3 ? 3000 : 2200) * ms;
        const sweep = AURORA_SWEEP_MS * ms;
        const stagger = colors.length > 1 ? Math.min(900 * ms, (total - sweep) / (colors.length - 1)) : 0;
        anim.waves = { colors, stagger, sweep };
        anim.duration = total;
        break;
      }
    }
    this.fires.push(anim);
  }

  /** The moment a fire animation begins: the app hears it, and the firing piece dissolves at once (unless it survives or flies). */
  private startFire(f: FireAnim): void {
    const { step } = f;
    this.events.onFire?.(step);
    const origin = this.pieces.get(key(step.at));
    const cell = this.layout.cell;
    switch (f.fx) {
      case 'bloom':
        if (origin) {
          if (f.bloom?.stays) origin.opened = true;
          else {
            origin.hideOrnament = true;
            if (origin.clearing === null) origin.clearing = 0;
          }
        }
        return;
      case 'sprite': {
        // The sprite lifts off with a small flash; its own gem dissolves as it leaves.
        const { x, y } = this.centre(step.at.col, step.at.row);
        if (origin) {
          origin.hideOrnament = true;
          if (origin.clearing === null) origin.clearing = 0;
        }
        this.rings.push({ x, y, t: 0, duration: 380, radius: cell * 0.9, color: '#fff2c8', alpha: 0.45 });
        this.spawnSparkles(x, y, '#ffe9a8', 6, 0.6);
        if (step.carrying && this.lastSwap) {
          // The carried power leaves its cell with the sprite and is drawn travelling with it.
          const other = key(this.lastSwap.a) === key(step.at) ? this.lastSwap.b : this.lastSwap.a;
          this.hidden.add(key(other));
        }
        return;
      }
      default:
        if (origin && origin.clearing === null) origin.clearing = 0;
    }
  }

  /** Start dissolving a cell as the light reaches it. */
  private reach(f: FireAnim, c: Cell): void {
    const k = key(c);
    if (f.started.has(k)) return;
    f.started.add(k);
    const vp = this.pieces.get(k);
    if (vp && vp.clearing === null) vp.clearing = 0;
  }

  private updateFires(dt: number): boolean {
    if (this.fires.length === 0) return false;
    const { rows, cols } = this.state;
    const span = Math.max(cols, rows) + 0.5;
    for (const f of this.fires) {
      if (!f.begun) {
        f.delay -= dt;
        if (f.delay > 0) continue;
        f.begun = true;
        f.t = -f.delay;
        this.startFire(f);
      } else f.t += dt;
      const p = clamp01(f.t / f.duration);
      const { step } = f;
      switch (f.fx) {
        case 'orb': {
          const reach = easeInOutSine(p) * this.maxDistance(step.at, step.cells);
          for (const c of step.cells) if (Math.hypot(c.col - step.at.col, c.row - step.at.row) <= reach) this.reach(f, c);
          break;
        }
        case 'comet': {
          const reach = easeInOutSine(p) * span;
          for (const c of step.cells) {
            const d = step.power === 'cometRow' ? Math.abs(c.col - step.at.col) : Math.abs(c.row - step.at.row);
            if (d <= reach) this.reach(f, c);
          }
          if (p < 0.85 && this.rng.chance(0.5)) {
            const { x, y } = this.centre(step.at.col, step.at.row);
            const side = this.rng.chance(0.5) ? -1 : 1;
            const cell = this.layout.cell;
            if (step.power === 'cometRow') this.spawnSparkles(this.clampX(x + side * reach * cell), y + (this.rng.next() - 0.5) * cell * 0.4, '#fff2c8', 1, 0.5);
            else this.spawnSparkles(x + (this.rng.next() - 0.5) * cell * 0.4, this.clampY(y + side * reach * cell), '#fff2c8', 1, 0.5);
          }
          break;
        }
        case 'starburst': {
          const reach = easeInOutSine(p) * span;
          for (const c of step.cells) if (Math.max(Math.abs(c.col - step.at.col), Math.abs(c.row - step.at.row)) <= reach) this.reach(f, c);
          if (p < 0.85 && this.rng.chance(0.5)) {
            const { x, y } = this.centre(step.at.col, step.at.row);
            const cell = this.layout.cell;
            const dx = this.rng.chance(0.5) ? -1 : 1;
            const dy = this.rng.chance(0.5) ? -1 : 1;
            const hx = x + dx * reach * cell;
            const hy = y + dy * reach * cell;
            if (hx >= this.layout.boardX && hx <= this.layout.boardX + cols * cell && hy >= this.layout.boardY && hy <= this.layout.boardY + rows * cell) this.spawnSparkles(hx, hy, '#fff2c8', 1, 0.5);
          }
          break;
        }
        case 'bloom': {
          const b = f.bloom as NonNullable<FireAnim['bloom']>;
          if (f.t < b.lead) {
            const origin = this.pieces.get(key(step.at));
            if (origin) origin.shine = Math.max(origin.shine, 0.5 * Math.sin((f.t / b.lead) * Math.PI));
            break;
          }
          const q = clamp01((f.t - b.lead) / b.ring);
          const radius = easeOutCubic(q) * b.radius;
          for (const c of step.cells) if (Math.hypot(c.col - step.at.col, c.row - step.at.row) <= radius + 0.05) this.reach(f, c);
          break;
        }
        case 'sprite': {
          const fl = f.flight;
          if (!fl) {
            // No target: a small flash and the gem dissolves (the core lists only the sprite's own cell).
            for (const c of step.cells) this.reach(f, c);
            break;
          }
          const ms = this.motionScale;
          const liftEnd = SPRITE_LIFT_MS * ms;
          const flightEnd = liftEnd + SPRITE_FLIGHT_MS * ms;
          if (f.t >= liftEnd && f.t < flightEnd && this.rng.chance(0.7)) {
            const pos = this.flightPos(fl, easeInOutSine(clamp01((f.t - liftEnd) / (flightEnd - liftEnd))));
            this.spawnSparkles(pos.x, pos.y + this.layout.cell * 0.05, '#ffe9a8', 1, 0.25);
          }
          if (f.t >= flightEnd && !fl.popped) {
            // The pop: a short bright ring and sparkles, and the target cells dissolve.
            fl.popped = true;
            const cell = this.layout.cell;
            this.rings.push({ x: fl.to.x, y: fl.to.y, t: 0, duration: 420, radius: cell * 1.4, color: '#fff2c8', alpha: 0.6 });
            this.rings.push({ x: fl.to.x, y: fl.to.y, t: 0, duration: 560, radius: cell * 2, color: '#ffffff', alpha: 0.2 });
            this.spawnSparkles(fl.to.x, fl.to.y, '#ffe9a8', 12, 0.9);
            for (const c of step.cells) this.reach(f, c);
          }
          break;
        }
        case 'moonrise': {
          const band = f.band as NonNullable<FireAnim['band']>;
          const beamRow = this.beamRow(f);
          for (const c of step.cells) if (c.row <= beamRow) this.reach(f, c);
          if (!band.flowered && step.at.row <= beamRow) {
            // Moonflower: a bloom opens where the beam meets the swap cell.
            band.flowered = true;
            const { x, y } = this.centre(step.at.col, step.at.row);
            this.flowers.push({ x, y, t: 0, duration: 640 * this.motionScale, radius: 3 });
          }
          break;
        }
        case 'aurora': {
          const w = f.waves as NonNullable<FireAnim['waves']>;
          for (const c of step.cells) {
            const vp = this.pieces.get(key(c));
            const i = Math.max(0, w.colors.indexOf((vp?.piece.type ?? step.color) as GemType));
            if (c.row <= this.waveRow(f, i)) this.reach(f, c);
          }
          break;
        }
        case 'sunrise': {
          // A warm band rises from below the bottom row to above the top; the whole scene warms a little, never more than the cascade swell.
          const bandRow = this.sunriseRow(p);
          for (const c of step.cells) if (c.row >= bandRow) this.reach(f, c);
          this.pulse = Math.max(this.pulse, 0.14 * Math.sin(p * Math.PI));
          break;
        }
      }
    }
    this.fires = this.fires.filter((f) => !f.begun || f.t < f.duration);
    return true;
  }

  /** A point on a sprite's flight curve at u in [0, 1]. */
  private flightPos(fl: NonNullable<FireAnim['flight']>, u: number): Pt {
    const a = (1 - u) * (1 - u);
    const b = 2 * (1 - u) * u;
    const c = u * u;
    return { x: a * fl.from.x + b * fl.ctrl.x + c * fl.to.x, y: a * fl.from.y + b * fl.ctrl.y + c * fl.to.y };
  }

  /** The row the moonbeam has reached (in cells; below -1 before it starts). */
  private beamRow(f: FireAnim): number {
    const ms = this.motionScale;
    const q = clamp01((f.t - MOON_RISE_MS * ms) / (MOON_BEAM_MS * ms));
    return -1.3 + easeInOutSine(q) * (this.state.rows + 1.6);
  }

  /** The row an aurora colour wave has reached. */
  private waveRow(f: FireAnim, i: number): number {
    const w = f.waves as NonNullable<FireAnim['waves']>;
    const q = clamp01((f.t - i * w.stagger) / w.sweep);
    return q <= 0 ? -2 : -0.6 + easeInOutSine(q) * (this.state.rows + 0.8);
  }

  /** The row the sunrise band has reached, falling from below the board to above it. */
  private sunriseRow(p: number): number {
    return this.state.rows + 0.4 - easeInOutSine(p) * (this.state.rows + 1.6);
  }

  private updateTransform(dt: number): boolean {
    const tr = this.transform;
    if (!tr) return false;
    tr.t += dt;
    const p = clamp01(tr.t / tr.duration);
    const shine = 0.7 * Math.sin(p * Math.PI);
    for (const ch of tr.step.changes) {
      const vp = this.pieces.get(key(ch.cell));
      if (vp) vp.shine = Math.max(vp.shine, shine);
    }
    if (!tr.swapped && p >= 0.55) {
      // The gem becomes the power at the brightest moment, with a few sparkles.
      tr.swapped = true;
      const color = tr.step.changes[0]?.piece.type;
      const light = color ? this.style.gemColor(color).light : '#ffffff';
      for (const ch of tr.step.changes) {
        const vp = this.pieces.get(key(ch.cell));
        if (vp) vp.piece = ch.piece;
        const { x, y } = this.centre(ch.cell.col, ch.cell.row);
        this.spawnSparkles(x, y, light, 3, 0.5);
      }
    }
    if (p >= 1) this.transform = null;
    return true;
  }

  /** Advance the current step; return true when it is finished. */
  private advance(cur: { step: Step; t: number; phase: number }, dt: number): boolean {
    const step = cur.step;
    switch (step.kind) {
      case 'swap': {
        const pa = this.pieces.get(key(step.a));
        const pb = this.pieces.get(key(step.b));
        const dur = SWAP_MS * this.motionScale;
        if (step.valid) {
          const p = clamp01(cur.t / dur);
          const e = easeInOutSine(p);
          if (pa && pb) {
            pa.x = step.a.col + (step.b.col - step.a.col) * e;
            pa.y = step.a.row + (step.b.row - step.a.row) * e;
            pb.x = step.b.col + (step.a.col - step.b.col) * e;
            pb.y = step.b.row + (step.a.row - step.b.row) * e;
          }
          if (p >= 1) {
            if (pa && pb) {
              this.pieces.set(key(step.b), pa);
              this.pieces.set(key(step.a), pb);
              pa.row = step.b.row;
              pa.col = step.b.col;
              pb.row = step.a.row;
              pb.col = step.a.col;
            }
            return true;
          }
          return false;
        }
        // Invalid: out, a short rest, and gently back.
        const total = dur * 2 + INVALID_HOLD_MS;
        const t = cur.t;
        let e: number;
        if (t < dur) e = easeInOutSine(t / dur) * 0.55;
        else if (t < dur + INVALID_HOLD_MS) e = 0.55;
        else e = 0.55 * (1 - easeInOutSine(clamp01((t - dur - INVALID_HOLD_MS) / dur)));
        if (pa && pb) {
          pa.x = step.a.col + (step.b.col - step.a.col) * e;
          pa.y = step.a.row + (step.b.row - step.a.row) * e;
          pb.x = step.b.col + (step.a.col - step.b.col) * e;
          pb.y = step.b.row + (step.a.row - step.b.row) * e;
        }
        if (t >= total) {
          if (pa) {
            pa.x = pa.col;
            pa.y = pa.row;
          }
          if (pb) {
            pb.x = pb.col;
            pb.y = pb.row;
          }
          return true;
        }
        return false;
      }
      case 'fire':
        // Finished when every sweep (the whole group) has passed and nothing is still dissolving.
        return this.fires.length === 0 && !this.anyClearing();
      case 'clear':
        return !this.anyClearing();
      case 'create':
        return cur.t >= APPEAR_MS * this.motionScale * 0.6;
      case 'transform':
        return this.transform === null;
      case 'fall':
        return !this.updateFalling(dt / 1000, dt);
      case 'reshuffle': {
        const half = 320 * this.motionScale;
        if (cur.phase === 0) {
          const p = clamp01(cur.t / half);
          for (const vp of this.pieces.values()) vp.lift = -p; // negative lift = fading out
          if (p >= 1) {
            this.rebuild(step.board);
            for (const vp of this.pieces.values()) vp.lift = -1;
            cur.phase = 1;
            cur.t = 0;
          }
          return false;
        }
        const p = clamp01(cur.t / half);
        for (const vp of this.pieces.values()) vp.lift = -(1 - p);
        if (p >= 1) {
          for (const vp of this.pieces.values()) vp.lift = 0;
          return true;
        }
        return false;
      }
    }
  }

  private anyClearing(): boolean {
    for (const p of this.pieces.values()) if (p.clearing !== null) return true;
    return this.floating.length > 0;
  }

  private updateClearing(dt: number): boolean {
    let any = false;
    for (const [k, p] of this.pieces) {
      if (p.clearing === null) continue;
      any = true;
      p.clearing += dt;
      if (!p.sparkled && p.clearing >= CLEAR_BLOOM_MS) {
        p.sparkled = true;
        if (!this.hidden.has(k)) {
          const { x, y } = this.centre(p.x, p.y);
          const color = p.piece.type ? this.style.gemColor(p.piece.type).light : '#ffffff';
          this.spawnSparkles(x, y, color, p.piece.power ? 9 : 5);
        }
      }
      if (p.clearing >= CLEAR_MS * this.motionScale) {
        this.pieces.delete(k);
        this.hidden.delete(k); // a carried power's old cell is free again once its piece has gone
      }
    }
    return any;
  }

  private updateAppear(dt: number): boolean {
    let any = false;
    for (const p of this.pieces.values()) {
      if (p.appear === null) continue;
      any = true;
      p.appear += dt;
      if (p.appear >= APPEAR_MS * this.motionScale) p.appear = null;
    }
    return any;
  }

  private maxDistance(from: Cell, cells: Cell[]): number {
    let m = 0;
    for (const c of cells) m = Math.max(m, Math.hypot(c.col - from.col, c.row - from.row));
    return m + 0.6;
  }

  private updateFalling(seconds: number, dt: number): boolean {
    let anyMoving = false;
    let landed = 0;
    for (const p of this.pieces.values()) {
      if (p.settle !== null) {
        p.settle += dt;
        if (p.settle >= SETTLE_MS) p.settle = null;
        else anyMoving = true;
      }
      if (!p.falling) continue;
      if (p.delay > 0) {
        p.delay -= dt;
        anyMoving = true;
        continue;
      }
      p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * seconds * this.motionScale);
      p.y += p.vy * seconds;
      if (p.y >= p.row) {
        p.y = p.row;
        p.falling = false;
        p.vy = 0;
        p.settle = 0;
        landed++;
      }
      anyMoving = true;
    }
    if (landed > 0) this.events.onLand?.(landed);
    return anyMoving;
  }

  private updateParticles(seconds: number): boolean {
    if (this.particles.length === 0) return false;
    const damp = Math.exp(-0.9 * seconds);
    for (const p of this.particles) {
      p.life += seconds * 1000;
      if (p.target) {
        const q = easeInOutSine(clamp01(p.life / p.maxLife));
        const k = Math.min(1, seconds * 6 + q * 0.2);
        p.x += (p.target.x - p.x) * k;
        p.y += (p.target.y - p.y) * k;
        continue;
      }
      p.x += p.vx * seconds;
      p.y += p.vy * seconds;
      p.vx *= damp;
      p.vy = p.vy * damp - this.layout.cell * 0.25 * seconds;
    }
    this.particles = this.particles.filter((p) => p.life < p.maxLife);
    return true;
  }

  private spawnSparkles(x: number, y: number, color: string, n: number, speed = 1): void {
    const cell = this.layout.cell;
    const count = this.motionScale < 1 ? Math.ceil(n / 2) : n; // fewer particles under Reduce Motion (DESIGN.md 4.4)
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const v = this.rng.range(0.25, 0.9) * cell * speed;
      this.particles.push({
        x: x + this.rng.range(-0.15, 0.15) * cell,
        y: y + this.rng.range(-0.15, 0.15) * cell,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - cell * 0.3,
        life: 0,
        maxLife: this.rng.range(520, 900),
        color,
        size: this.rng.range(0.05, 0.11) * cell,
      });
    }
    if (this.particles.length > MAX_PARTICLES) this.particles.splice(0, this.particles.length - MAX_PARTICLES);
  }

  private centre(x: number, y: number): { x: number; y: number } {
    return { x: this.layout.boardX + (x + 0.5) * this.layout.cell, y: this.layout.boardY + (y + 0.5) * this.layout.cell };
  }

  private clampX(x: number): number {
    return Math.max(this.layout.boardX, Math.min(this.layout.boardX + this.state.cols * this.layout.cell, x));
  }

  private clampY(y: number): number {
    return Math.max(this.layout.boardY, Math.min(this.layout.boardY + this.state.rows * this.layout.cell, y));
  }

  // ---------------------------------------------------------------- drawing

  private draw(): void {
    const { ctx } = this;
    const { width: w, height: h, cell, boardX, boardY } = this.layout;
    const t = this.time / 1000;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawBackground(t);
    this.drawVignette(t);
    this.drawHud(t);

    for (let r = 0; r < this.state.rows; r++) for (let c = 0; c < this.state.cols; c++) this.style.drawCell(ctx, boardX + c * cell, boardY + r * cell, cell);

    if (this.hint) {
      const a = 0.14 + 0.22 * breath(t);
      for (const c of [this.hint.a, this.hint.b]) {
        const { x, y } = this.centre(c.col, c.row);
        glowDisc(ctx, x, y, cell * 0.8, this.style.palette.hint, a);
      }
    }
    if (this.selected) {
      const { x, y } = this.centre(this.selected.col, this.selected.row);
      glowDisc(ctx, x, y, cell * 0.75, this.style.palette.hint, 0.22);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, boardY - 2, w, this.state.rows * cell + 4 + 20);
    ctx.clip();
    const radius = cell * 0.41;
    const celebrate = this.celebrating ? clamp01(this.celebrating.t / 1500) : 0;
    const lanternPos = { x: w / 2 - 30, y: this.layout.hudY + 4 };
    // The gift halo breathes slowly (period 2.8 s, alpha 0.25 to 0.45), DESIGN.md 3.4.
    const giftAlpha = 0.25 + 0.2 * slowPulse(t, 2.8);
    const list = [...this.pieces.values()].sort((a, b) => Number(a.clearing !== null) - Number(b.clearing !== null));
    for (const p of list) {
      if (this.hidden.has(key({ row: p.row, col: p.col }))) continue;
      let { x, y } = this.centre(p.x, p.y);
      let alpha = 1 - this.fadeIn;
      let scale = 1;
      let brighten = p.shine;
      let scaleX = 1;
      let scaleY = 1;
      if (p.lift < 0) alpha *= 1 + p.lift; // reshuffle fade
      if (p.lift > 0) {
        scale = 1 + 0.08 * p.lift;
        brighten += 0.12 * p.lift;
      }
      if (p.appear !== null) {
        const q = clamp01(p.appear / (APPEAR_MS * this.motionScale));
        scale *= 0.3 + 0.9 * easeOutCubic(q) - 0.2 * Math.sin(q * Math.PI);
        brighten = 0.5 * (1 - q);
      }
      if (p.clearing !== null) {
        const ms = p.clearing / this.motionScale;
        if (ms < CLEAR_BLOOM_MS) {
          const q = ms / CLEAR_BLOOM_MS;
          scale *= 1 + 0.14 * easeOutCubic(q);
          brighten = 0.6 * q;
        } else {
          const q = clamp01((ms - CLEAR_BLOOM_MS) / (CLEAR_MS - CLEAR_BLOOM_MS));
          scale *= 1.14 - 1.0 * easeInOutSine(q);
          alpha *= 1 - q;
          brighten = 0.6 * (1 - q);
        }
      } else if (p.settle !== null) {
        const q = p.settle / SETTLE_MS;
        const s = Math.sin(Math.PI * q);
        scaleY = 1 - 0.09 * s;
        scaleX = 1 + 0.06 * s;
      }
      if (celebrate > 0) {
        // Drift up toward the lantern as motes of light, staggered by row.
        const delay = (this.state.rows - 1 - p.row) * 0.06 + p.col * 0.02;
        const q = clamp01((celebrate - delay) / 0.7);
        const e = easeInOutSine(q);
        x = x + (lanternPos.x - x) * e;
        y = y + (lanternPos.y - y) * e;
        scale *= 1 - 0.75 * e;
        alpha *= 1 - e * 0.95;
        brighten = Math.max(brighten, 0.5 * e);
      }
      if (alpha <= 0.01) continue;
      const yy = y + (scaleY < 1 ? radius * (1 - scaleY) : 0) - p.lift * cell * 0.04;
      if (p.piece.power && p.clearing === null && this.gift.has(familyOf(p.piece.power))) glowDisc(ctx, x, yy, cell * 0.95, this.style.palette.hint, giftAlpha * alpha);
      this.drawPieceArt(p.piece, x, yy, radius, { alpha, scale, scaleX, scaleY, brighten: Math.min(1, brighten), ornament: !p.hideOrnament, opened: p.opened }, t);
    }
    ctx.restore();

    this.drawTransform();
    this.drawFires(t);
    this.drawFlowers(t);
    this.drawRings();
    this.drawParticles();
    if (this.pulse > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rgba('#ffe9c8', this.pulse);
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    for (const r of this.ripples) {
      const q = clamp01(r.t / 480);
      softRing(ctx, r.x, r.y, 6 + q * cell * 0.9, cell * 0.18, this.style.palette.hint, 0.35 * (1 - q));
    }
    if (celebrate > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, lanternPos.x, lanternPos.y, 60 + 90 * Math.sin(celebrate * Math.PI), '#fff2c8', 0.45 * Math.sin(celebrate * Math.PI));
      ctx.restore();
    }
  }

  /** The area's sky, glows and ambient life; without an area, the style's own background (the same look for the Meadow). */
  private drawBackground(t: number): void {
    const { ctx } = this;
    const { width: w, height: h } = this.layout;
    if (!this.ambient) return;
    if (this.theme) {
      paintSky(ctx, w, h, this.theme);
      this.ambient.draw(ctx, w, h, t);
    } else this.style.drawBackground(ctx, w, h, t, this.ambient);
  }

  /**
   * A piece: the gem (from the baked sprites) and, for a power, its ornament
   * (DESIGN.md 3.4): the comet's streak, the bloom's bud over a smaller gem,
   * the sprite perched on its gem, the starburst's rays, the moonrise's
   * pearl. The Orb and the Aurora are colourless pieces of their own.
   */
  private drawPieceArt(
    piece: Piece,
    x: number,
    y: number,
    radius: number,
    o: { alpha: number; scale: number; scaleX: number; scaleY: number; brighten: number; ornament: boolean; opened: boolean },
    t: number,
  ): void {
    const { ctx } = this;
    const power = piece.power;
    if (power === 'orb' || power === 'aurora') {
      ctx.save();
      ctx.globalAlpha = o.alpha;
      if (power === 'orb') drawOrb(ctx, x, y, radius * 0.95 * o.scale, t);
      else drawAuroraPiece(ctx, x, y, radius * 0.95 * o.scale, t);
      if (o.brighten > 0) glowDisc(ctx, x, y, radius * 1.3 * o.scale, '#ffffff', o.brighten * 0.6);
      ctx.restore();
      return;
    }
    if (!piece.type) return;
    const gemScale = power === 'bloom' && o.ornament ? 0.76 : 1;
    this.sprites.draw(ctx, piece.type, x, y, radius, { alpha: o.alpha, scaleX: o.scale * o.scaleX * gemScale, scaleY: o.scale * o.scaleY * gemScale, brighten: o.brighten });
    if (!power || !o.ornament) return;
    ctx.save();
    ctx.globalAlpha = o.alpha;
    const r = radius * o.scale;
    switch (power) {
      case 'cometRow':
      case 'cometCol':
        this.drawStreak(x, y, r, power === 'cometRow', 1, t);
        break;
      case 'bloom':
        // The closed bud over the gem; it glows softly, and fully once it has opened and rides the fall.
        drawBud(ctx, x, y - r * 0.08, r * 0.52, t, o.opened ? 1 : 0.1 + 0.3 * slowPulse(t, 3));
        break;
      case 'sprite':
        drawSpriteCreature(ctx, x + r * 0.5, y - r * 0.8, r * 0.17, t);
        break;
      case 'starburst':
        drawStarburstRays(ctx, x, y, r, t);
        break;
      case 'moonrise':
        drawMoonPearl(ctx, x + r * 0.42, y - r * 0.62, r * 0.3, t);
        break;
    }
    ctx.restore();
  }

  private drawStreak(x: number, y: number, r: number, horizontal: boolean, alpha: number, t: number): void {
    const { ctx } = this;
    const pulse = 0.55 + 0.25 * Math.sin(t * 2.2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha * pulse;
    ctx.translate(x, y);
    if (!horizontal) ctx.rotate(Math.PI / 2);
    const g = ctx.createLinearGradient(-r * 1.6, 0, r * 1.6, 0);
    g.addColorStop(0, 'rgba(255,246,220,0)');
    g.addColorStop(0.5, 'rgba(255,250,235,0.9)');
    g.addColorStop(1, 'rgba(255,246,220,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-r * 1.6, -r * 0.09, r * 3.2, r * 0.18);
    glowDisc(ctx, 0, 0, r * 0.55, '#fff6dc', 0.55);
    ctx.restore();
  }

  /** Gems becoming powers: each brightens as a ring closes in on it (DESIGN.md 3.4, showers and waves). */
  private drawTransform(): void {
    const tr = this.transform;
    if (!tr) return;
    const { ctx } = this;
    const cell = this.layout.cell;
    const p = clamp01(tr.t / tr.duration);
    const color = tr.step.changes[0]?.piece.type;
    const light = color ? this.style.gemColor(color).light : '#ffffff';
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const radius = cell * (1.4 - 1.05 * easeInOutSine(p));
    const alpha = 0.5 * Math.sin(p * Math.PI);
    for (const ch of tr.step.changes) {
      const { x, y } = this.centre(ch.cell.col, ch.cell.row);
      softRing(ctx, x, y, radius, cell * 0.2, light, alpha);
    }
    ctx.restore();
  }

  /** A bloom's ring of warm pink light with six petal highlights, at progress p of its opening. */
  private drawFlowerRing(x: number, y: number, p: number, radiusCells: number, t: number, alpha = 1): void {
    const { ctx } = this;
    const cell = this.layout.cell;
    const radius = easeOutCubic(p) * radiusCells * cell;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // In a wave of blooms the filled glow and petals dim by the square of the share, the ring by the share itself.
    softRing(ctx, x, y, radius, cell * 0.4, '#ffd9ec', 0.75 * (1 - p * 0.7) * alpha);
    glowDisc(ctx, x, y, radius * 0.9, '#ff9fcf', 0.3 * (1 - p) * alpha * alpha);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 0.4;
      const px = x + Math.cos(a) * radius * 0.7;
      const py = y + Math.sin(a) * radius * 0.7;
      highlight(ctx, px, py, cell * 0.32, cell * 0.16, a, 0.42 * (1 - p) * alpha * alpha);
    }
    ctx.restore();
  }

  private drawFlowers(t: number): void {
    for (const f of this.flowers) this.drawFlowerRing(f.x, f.y, clamp01(f.t / f.duration), f.radius, t);
  }

  private drawFires(t: number): void {
    const { ctx } = this;
    const cell = this.layout.cell;
    const { rows, cols } = this.state;
    const { boardX, boardY, width: w } = this.layout;
    const span = Math.max(cols, rows) + 0.5;
    for (const f of this.fires) {
      if (!f.begun) continue;
      if (f.fx === 'aurora') this.drawAuroraSky(f, t);
      const p = clamp01(f.t / f.duration);
      const { step } = f;
      const { x, y } = this.centre(step.at.col, step.at.row);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (f.fx === 'moonrise' || f.fx === 'aurora' || f.fx === 'sunrise') {
        // Beams and waves live on the board: a little past its edge, never a bar across the sky or the ground.
        ctx.beginPath();
        ctx.rect(boardX - cell * 0.35, boardY - cell * 0.7, cols * cell + cell * 0.7, rows * cell + cell * 1.3);
        ctx.clip();
      }
      switch (f.fx) {
        case 'orb': {
          const radius = easeInOutSine(p) * this.maxDistance(step.at, step.cells) * cell;
          const light = step.color ? this.style.gemColor(step.color).light : '#ffffff';
          if (p < 0.3) glowDisc(ctx, x, y, cell * (0.6 + p * 2.5), '#ffffff', 0.5 * (1 - p / 0.3));
          softRing(ctx, x, y, radius, cell * 0.45, light, 0.7 * (1 - p * 0.6));
          softRing(ctx, x, y, radius * 0.8, cell * 0.3, '#ffffff', 0.25 * (1 - p));
          break;
        }
        case 'comet': {
          const reach = easeInOutSine(p) * span * cell;
          // Heads ease in over the first 160 ms, so a comet starts as a swell of light, not a flash.
          // Heads ease in and emerge from the brightening gem: faint while they still overlap at the origin.
          const fade = (1 - p * 0.45) * clamp01(f.t / (160 * this.motionScale)) * f.dim * (0.15 + 0.85 * clamp01(reach / (cell * 0.9)));
          const tailLen = Math.min(reach, cell * 2.8);
          for (const dir of [-1, 1]) {
            const horizontal = step.power === 'cometRow';
            const hx = horizontal ? this.clampX(x + dir * reach) : x;
            const hy = horizontal ? y : this.clampY(y + dir * reach);
            const angle = horizontal ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            drawCometHead(ctx, hx, hy, angle, tailLen, cell, fade);
          }
          break;
        }
        case 'starburst': {
          // Four comet heads leave along the diagonals; each fades as it passes the edge of the board.
          const reach = easeInOutSine(p) * span;
          const fade = (1 - p * 0.45) * clamp01(f.t / (160 * this.motionScale)) * f.dim * (0.15 + 0.85 * clamp01(reach / 0.9));
          const tailLen = Math.min(reach * cell * Math.SQRT2, cell * 2.8);
          glowDisc(ctx, x, y, cell * (0.8 + p * 1.2), '#fff6dc', 0.2 * (1 - p) * f.dim);
          for (const dx of [-1, 1]) {
            for (const dy of [-1, 1]) {
              const col = step.at.col + dx * reach;
              const row = step.at.row + dy * reach;
              const over = Math.max(0, col - (cols - 0.5), -0.5 - col, row - (rows - 0.5), -0.5 - row);
              const visible = clamp01(1 - over / 1.2);
              if (visible <= 0) continue;
              const h = this.centre(col, row);
              drawCometHead(ctx, h.x, h.y, Math.atan2(dy, dx), tailLen, cell, fade * visible);
            }
          }
          break;
        }
        case 'bloom': {
          const b = f.bloom as NonNullable<FireAnim['bloom']>;
          if (f.t < b.lead) {
            const q = f.t / b.lead;
            glowDisc(ctx, x, y, cell * (0.7 + q * 0.5), '#ff9fcf', 0.35 * q);
            if (!b.stays) {
              ctx.globalCompositeOperation = 'source-over';
              drawBud(ctx, x, y, cell * 0.21 * (1 + 0.1 * Math.sin(q * Math.PI)), t, 0.5 + 0.5 * q);
            }
            break;
          }
          const q = clamp01((f.t - b.lead) / b.ring);
          if (!b.stays && q < 0.45) {
            // The bud opens outward and fades as the flower takes over.
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1 - q / 0.45;
            drawBud(ctx, x, y, cell * 0.21 * (1 + q * 1.5), t, 1);
            ctx.restore();
          }
          this.drawFlowerRing(x, y, q, b.radius, t, f.dim);
          break;
        }
        case 'sprite': {
          const fl = f.flight;
          if (!fl) {
            glowDisc(ctx, x, y, cell * 0.9, '#ffe9a8', 0.4 * (1 - p));
            break;
          }
          const ms = this.motionScale;
          const liftEnd = SPRITE_LIFT_MS * ms;
          const flightEnd = liftEnd + SPRITE_FLIGHT_MS * ms;
          if (f.t < liftEnd) {
            const q = f.t / liftEnd;
            glowDisc(ctx, x, y, cell * 0.9, '#ffe9a8', 0.4 * q);
            ctx.globalCompositeOperation = 'source-over';
            drawSpriteCreature(ctx, x + cell * 0.2 * (1 - q), y - cell * (0.33 + 0.3 * q), cell * 0.07 * (1 + 0.6 * q), t, 1 + q);
          } else if (f.t < flightEnd) {
            const u = easeInOutSine((f.t - liftEnd) / (flightEnd - liftEnd));
            const pos = this.flightPos(fl, u);
            ctx.globalCompositeOperation = 'source-over';
            if (step.carrying) this.drawCarried(step.carrying, fl.carriedColor, pos.x, pos.y + cell * 0.42, cell * 0.28, t);
            drawSpriteCreature(ctx, pos.x, pos.y, cell * 0.11, t, 1.6);
          } else {
            const q = clamp01((f.t - flightEnd) / (SPRITE_POP_MS * ms));
            glowDisc(ctx, fl.to.x, fl.to.y, cell * (0.8 + q * 0.8), '#ffe9a8', 0.5 * (1 - q));
            if (q < 0.5) {
              ctx.globalCompositeOperation = 'source-over';
              ctx.globalAlpha = 1 - q / 0.5;
              drawSpriteCreature(ctx, fl.to.x, fl.to.y, cell * 0.11 * (1 + q), t, 1.6);
            }
          }
          break;
        }
        case 'moonrise': {
          const band = f.band as NonNullable<FireAnim['band']>;
          const ms = this.motionScale;
          const x0 = boardX + band.c0 * cell;
          const x1 = boardX + (band.c1 + 1) * cell;
          const cx = (x0 + x1) / 2;
          const fade = (1 - clamp01((f.t - (MOON_RISE_MS + MOON_BEAM_MS) * ms) / (MOON_FADE_MS * ms))) * f.dim;
          // The small moon brightens above the top row (one moon for a tide of beams).
          const rise = easeInOutSine(clamp01(f.t / (MOON_RISE_MS * ms)));
          const moonY = boardY - cell * 0.36;
          if (f.leader) {
            glowDisc(ctx, cx, moonY, cell * 0.9, '#dfe9ff', 0.35 * rise * fade);
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            drawMoonPearl(ctx, cx, moonY, cell * 0.17, t, rise * fade);
            ctx.restore();
          }
          const beamRow = this.beamRow(f);
          if (beamRow > -1.3) {
            const beamY = boardY + (beamRow + 0.5) * cell;
            // The beam thins out as it passes the bottom row rather than resting below the board.
            const edge = clamp01((rows + 0.4 - beamRow) / 0.9);
            const top = boardY - cell * 0.4;
            // A faint vertical glow fills the band behind the beam.
            if (beamY > top) {
              const g = ctx.createLinearGradient(0, top, 0, beamY);
              g.addColorStop(0, 'rgba(223,233,255,0)');
              g.addColorStop(1, `rgba(223,233,255,${0.1 * fade})`);
              ctx.fillStyle = g;
              ctx.fillRect(x0, top, x1 - x0, beamY - top);
            }
            // The beam: a soft horizontal band of cool white light, as wide as the band.
            const bh = cell * 1.1;
            const g2 = ctx.createLinearGradient(0, beamY - bh / 2, 0, beamY + bh / 2);
            g2.addColorStop(0, 'rgba(230,238,255,0)');
            g2.addColorStop(0.5, `rgba(240,246,255,${0.5 * fade * edge})`);
            g2.addColorStop(1, 'rgba(230,238,255,0)');
            ctx.fillStyle = g2;
            ctx.fillRect(x0 - cell * 0.25, beamY - bh / 2, x1 - x0 + cell * 0.5, bh);
          }
          break;
        }
        case 'aurora': {
          const wv = f.waves as NonNullable<FireAnim['waves']>;
          wv.colors.forEach((c, i) => {
            const row = this.waveRow(f, i);
            if (row <= -1 || row >= rows + 0.6) return;
            const wy = boardY + (row + 0.5) * cell;
            const light = this.style.gemColor(c).light;
            const edge = Math.min(clamp01((row + 1) / 0.8), clamp01((rows + 0.4 - row) / 0.9));
            const bh = cell * 1.2;
            const g = ctx.createLinearGradient(0, wy - bh / 2, 0, wy + bh / 2);
            g.addColorStop(0, rgba(light, 0));
            g.addColorStop(0.5, rgba(light, 0.32 * edge));
            g.addColorStop(1, rgba(light, 0));
            ctx.fillStyle = g;
            ctx.fillRect(boardX - cell * 0.2, wy - bh / 2, cols * cell + cell * 0.4, bh);
          });
          break;
        }
        case 'sunrise': {
          // A warm band rising through the board, light pooling beneath it: majestic, never loud.
          const row = this.sunriseRow(p);
          const by = boardY + (row + 0.5) * cell;
          const bottom = boardY + rows * cell + cell;
          const env = Math.sin(p * Math.PI) * clamp01((row + 1.2) / 0.9);
          if (by < bottom) {
            const g = ctx.createLinearGradient(0, by, 0, bottom);
            g.addColorStop(0, `rgba(255,214,160,${0.14 * env})`);
            g.addColorStop(1, 'rgba(255,214,160,0)');
            ctx.fillStyle = g;
            ctx.fillRect(0, by, w, bottom - by);
          }
          const bh = cell * 1.8;
          const g2 = ctx.createLinearGradient(0, by - bh / 2, 0, by + bh / 2);
          g2.addColorStop(0, 'rgba(255,226,180,0)');
          // The gems in the band already brighten as they dissolve, so the band itself stays soft: a glow, not a bar of white.
          g2.addColorStop(0.5, `rgba(255,232,190,${0.32 * env})`);
          g2.addColorStop(1, 'rgba(255,226,180,0)');
          ctx.fillStyle = g2;
          ctx.fillRect(0, by - bh / 2, w, bh);
          glowDisc(ctx, w / 2, by, w * 0.6, '#ffd9a0', 0.14 * env);
          break;
        }
      }
      ctx.restore();
    }
  }

  /** A power travelling with a sprite: drawn a little below it (DESIGN.md 3.4, Lantern Sprite + another power). */
  private drawCarried(power: FireStep['power'], color: GemType | null, x: number, y: number, r: number, t: number): void {
    const { ctx } = this;
    if (power === 'orb') {
      drawOrb(ctx, x, y, r, t);
      return;
    }
    if (power === 'aurora') {
      drawAuroraPiece(ctx, x, y, r, t);
      return;
    }
    if (!color) return;
    this.drawPieceArt({ type: color, power }, x, y, r, { alpha: 1, scale: 1, scaleX: 1, scaleY: 1, brighten: 0.15, ornament: true, opened: false }, t);
  }

  /**
   * The aurora's sky (DESIGN.md 3.4): two or three large, blurry ribbons of
   * teal, violet and green drifting very slowly over the scene above the
   * board, alpha under 0.35, easing in over half a second and out over 0.6.
   */
  private drawAuroraSky(f: FireAnim, t: number): void {
    const { ctx } = this;
    const { width: w, boardY } = this.layout;
    const ms = this.motionScale;
    const env = Math.min(clamp01(f.t / (500 * ms)), clamp01((f.duration - f.t) / (600 * ms)));
    if (env <= 0) return;
    const ribbons = [
      { color: '#5cf0c0', y: boardY * 0.28, amp: boardY * 0.07, k: 0.011, phase: 0.4, width: boardY * 0.3 },
      { color: '#a98cff', y: boardY * 0.5, amp: boardY * 0.08, k: 0.009, phase: 2.1, width: boardY * 0.34 },
      { color: '#6cf09a', y: boardY * 0.7, amp: boardY * 0.06, k: 0.013, phase: 4.0, width: boardY * 0.26 },
    ];
    const count = f.step.combo === 'auroraSky' || (f.waves?.colors.length ?? 0) >= 3 ? 3 : 2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (let i = 0; i < count; i++) {
      const r = ribbons[i] as (typeof ribbons)[number];
      const a = (0.1 + 0.03 * slowPulse(t, 3.1, i)) * env;
      // Soft edges from three strokes of decreasing width and rising alpha, no blur needed.
      for (const [wk, ak] of [
        [1.9, 0.35],
        [1.3, 0.6],
        [0.7, 1],
      ] as const) {
        ctx.strokeStyle = rgba(r.color, a * ak);
        ctx.lineWidth = r.width * wk;
        ctx.beginPath();
        for (let x = -30; x <= w + 30; x += 14) {
          const yy = r.y + Math.sin(x * r.k + r.phase + t * 0.25) * r.amp + Math.sin(x * r.k * 2.3 - t * 0.17) * r.amp * 0.35;
          if (x === -30) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawRings(): void {
    const { ctx } = this;
    if (this.rings.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const q = clamp01(r.t / r.duration);
      const radius = easeOutCubic(q) * r.radius;
      softRing(ctx, r.x, r.y, radius, this.layout.cell * 0.28, r.color, r.alpha * (1 - q));
    }
    ctx.restore();
  }

  private drawGoal(t: number): void {
    const { ctx } = this;
    const { width: w, hudY } = this.layout;
    const n = this.goal.total;
    if (n <= 0) return;
    const gap = Math.min(30, (w - 48) / n);
    const x0 = w / 2 - ((n - 1) * gap) / 2;
    const y = hudY + 42;
    for (let i = 0; i < n; i++) {
      const lit = i < this.goal.done;
      const pulse = this.goalPulse[i];
      const pop = pulse !== undefined && pulse < 900 ? Math.sin(clamp01(pulse / 900) * Math.PI) : 0;
      const x = x0 + i * gap;
      ctx.save();
      ctx.translate(x, y - pop * 4);
      if (lit) {
        glowDisc(ctx, 0, 0, 16 + pop * 10, '#ffd27a', 0.5 + 0.35 * pop + 0.08 * breath(t + i));
        ctx.fillStyle = '#ffe49a';
        ctx.fill(shapePath('star', 7 + pop * 3));
        highlight(ctx, -2, -2.5, 2.6, 1.6, -0.6, 0.8);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill(shapePath('star', 6.5));
        ctx.strokeStyle = 'rgba(255,233,168,0.35)';
        ctx.lineWidth = 1;
        ctx.stroke(shapePath('star', 6.5));
      }
      ctx.restore();
    }
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

  private drawVignette(t: number): void {
    const { ctx } = this;
    const { width: w, height: h } = this.layout;
    // Breathing at the 7.5 s pace (DESIGN.md 3.8); a still, faint vignette when breathing is off.
    const a = this.breathing ? 0.05 + 0.07 * breath(t) : 0.085;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.78);
    g.addColorStop(0, rgba(this.style.palette.lanternGlow, 0));
    g.addColorStop(1, rgba(this.style.palette.lanternGlow, a));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawHud(t: number): void {
    const { ctx } = this;
    const { width: w, hudY } = this.layout;
    const cx = w / 2;
    const pokeL = this.pokes.find((p) => p.target === 'lantern');
    const pokeC = this.pokes.find((p) => p.target === 'companion');
    const lanternSize = 48 * (1 + (pokeL ? 0.12 * Math.sin(clamp01(pokeL.t / 700) * Math.PI) : 0));
    drawLantern(ctx, cx - 34, hudY, lanternSize, Math.min(1, this.lanternFill + 0.02 * Math.sin(t * 0.55) + (pokeL ? 0.25 * Math.sin(clamp01(pokeL.t / 700) * Math.PI) : 0)), this.style.palette, t);
    const bob = Math.sin(t * 1.3) * 1.5;
    const hop = pokeC ? -14 * Math.sin(clamp01(pokeC.t / 700) * Math.PI) : 0;
    drawCompanion(ctx, this.companion, cx + 40, hudY - 2 + bob + hop, 44, t, { glow: pokeC ? 1.5 : 1 });
    this.drawGoal(t);
    // Moon (the grown-up gate, Stage 3), dim, top-left; baked so the cut-out never touches the canvas beneath.
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.drawImage(this.moonSprite(), 12, 14, 24, 24);
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

  /** The piece at a cell, for input decisions. */
  pieceAt(cell: Cell): Piece | null {
    return at(this.state.board, cell.row, cell.col);
  }
}
