/**
 * The game view: draws a GameState and plays the Steps the core returns as
 * smooth, weighted animation. It never decides game rules; it only shows
 * what the core says happened, then snaps to the core's final board.
 */
import { type Board, type GameState, type Piece, type PowerKind, type Step, at } from '../core/game';
import type { Cell, GemType } from '../core/grid';
import { createRng } from '../shared/rng';
import { lighten, rgba } from '../render/color';
import { type CompanionId, drawCompanion, drawLantern } from '../render/creatures';
import { drawOrb } from '../render/board';
import { GemSprites } from '../render/sprites';
import { breath, clamp01, easeInOutSine, easeOutCubic, glowDisc, softRing } from '../render/styles/common';
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

interface FireAnim {
  step: Extract<Step, { kind: 'fire' }>;
  t: number;
  duration: number;
  started: Set<string>;
}

export interface ViewEvents {
  onSwap?(valid: boolean): void;
  onClear?(groups: Array<{ cells: Cell[]; type: GemType | null }>, cascade: number): void;
  onCreate?(piece: Piece): void;
  onFire?(power: PowerKind): void;
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

const SWAP_MS = 160;
const INVALID_HOLD_MS = 60;
const CLEAR_MS = 340;
const CLEAR_BLOOM_MS = 120;
const APPEAR_MS = 260;
const COMET_MS = 900;
const ORB_MS = 1300;
const SETTLE_MS = 150;
const GRAVITY = 30;
const MAX_FALL = 15;
const MAX_PARTICLES = 110;
const IDLE_FPS = 12;

const key = (c: Cell): string => `${c.row},${c.col}`;

export class GameView {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private readonly sprites: GemSprites;
  private ambient: Ambient | null = null;
  private pieces = new Map<string, VPiece>();
  private floating: VPiece[] = [];
  private nextId = 1;
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private fires: FireAnim[] = [];
  private queue: Step[] = [];
  private current: { step: Step; t: number; phase: number } | null = null;
  private finalBoard: Board | null = null;
  private onDone: (() => void) | null = null;
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
  private readonly rng = createRng(777);
  private readonly motionScale: number;

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
    this.state = state;
    this.rebuild(state.board);
    this.fadeIn = 1;
    this.wake();
  }

  /** Play a resolution's steps, then snap to its final board and call done. */
  play(steps: Step[], finalState: GameState, done: () => void): void {
    this.state = finalState;
    this.finalBoard = finalState.board;
    this.queue.push(...steps);
    this.onDone = done;
    this.selected = null;
    this.hint = null;
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
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const width = Math.max(280, Math.floor(rect?.width ?? window.innerWidth));
    const height = Math.max(400, Math.floor(rect?.height ?? window.innerHeight));
    const pad = 16;
    const hud = 84;
    const cell = Math.min((width - pad * 2) / this.state.cols, (height - hud - 40) / this.state.rows);
    const boardW = cell * this.state.cols;
    const boardH = cell * this.state.rows;
    const boardX = (width - boardW) / 2;
    const boardY = hud + Math.max(12, (height - hud - boardH) / 2 - 10);
    // The lantern and companion sit just above the board, so they read as part of it.
    const hudY = Math.max(hud / 2, boardY - 54);
    this.layout = { width, height, cell, boardX, boardY, hudY };
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
    this.ambient = this.style.createAmbient(width, height, 5);
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
    board.forEach((row, r) =>
      row.forEach((p, c) => {
        if (p) this.pieces.set(key({ row: r, col: c }), this.make(p, r, c, r));
      }),
    );
  }

  private make(piece: Piece, row: number, col: number, y: number): VPiece {
    return { id: this.nextId++, piece, row, col, x: col, y, vy: 0, falling: y !== row, delay: 0, settle: null, clearing: null, sparkled: false, appear: null, lift: 0 };
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

  private readonly frame = (now: number): void => {
    const dt = Math.min(50, now - this.lastNow);
    this.lastNow = now;
    this.time += dt;
    const moving = this.update(dt);
    this.draw();
    if (!this.running) return;
    if (moving) {
      this.raf = requestAnimationFrame(this.frame);
    } else {
      // Idle: a slow tick keeps the fireflies and the breathing glow alive cheaply.
      this.active = false;
      this.idleTimer = setTimeout(() => {
        if (!this.running || this.active) return;
        const t = performance.now();
        this.time += t - this.lastNow;
        this.lastNow = t;
        this.draw();
        this.frame(performance.now());
      }, 1000 / IDLE_FPS);
    }
  };

  /** Returns true while anything needs full frame rate. */
  private update(dt: number): boolean {
    const seconds = dt / 1000;
    let moving = false;
    this.ripples = this.ripples.filter((r) => (r.t += dt) < 480);
    if (this.ripples.length > 0) moving = true;
    if (this.updateParticles(seconds)) moving = true;
    if (this.updateClearing(dt)) moving = true;
    if (this.updateAppear(dt)) moving = true;
    if (this.updateFires(dt)) moving = true;
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
    if (this.step(dt)) moving = true;
    return moving;
  }

  private step(dt: number): boolean {
    if (!this.current) {
      const next = this.queue.shift();
      if (!next) {
        if (this.finalBoard) {
          this.rebuild(this.finalBoard);
          this.finalBoard = null;
          const done = this.onDone;
          this.onDone = null;
          done?.();
          this.events.onIdle?.();
        }
        return false;
      }
      this.current = { step: next, t: 0, phase: 0 };
      this.begin(next);
    }
    const cur = this.current;
    cur.t += dt;
    if (this.advance(cur, dt)) this.current = null;
    return true;
  }

  private begin(step: Step): void {
    switch (step.kind) {
      case 'swap': {
        this.events.onSwap?.(step.valid);
        return;
      }
      case 'fire': {
        this.events.onFire?.(step.power);
        const duration = (step.power === 'orb' ? ORB_MS : COMET_MS) * this.motionScale;
        this.fires.push({ step, t: 0, duration, started: new Set() });
        // The firing piece itself dissolves at once.
        const origin = this.pieces.get(key(step.at));
        if (origin && origin.clearing === null) origin.clearing = 0;
        return;
      }
      case 'clear': {
        this.events.onClear?.(step.groups, step.cascade);
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
        return;
      }
      case 'fall': {
        const moved = new Map<string, VPiece>();
        for (const m of step.moves) {
          const p = this.pieces.get(key(m.from));
          if (!p) continue;
          this.pieces.delete(key(m.from));
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
        // Finished when the sweep has passed and nothing is still dissolving.
        return this.fires.length === 0 && !this.anyClearing();
      case 'clear':
        return !this.anyClearing();
      case 'create':
        return cur.t >= APPEAR_MS * this.motionScale * 0.6;
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
        const { x, y } = this.centre(p.x, p.y);
        const color = p.piece.type ? this.style.gemColor(p.piece.type).light : '#ffffff';
        this.spawnSparkles(x, y, color, p.piece.power ? 9 : 5);
      }
      if (p.clearing >= CLEAR_MS * this.motionScale) this.pieces.delete(k);
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

  private updateFires(dt: number): boolean {
    if (this.fires.length === 0) return false;
    for (const f of this.fires) {
      f.t += dt;
      const p = clamp01(f.t / f.duration);
      const { step } = f;
      if (step.power === 'orb') {
        const reach = easeInOutSine(p) * this.maxDistance(step.at, step.cells);
        for (const c of step.cells) {
          const k = key(c);
          if (f.started.has(k)) continue;
          if (Math.hypot(c.col - step.at.col, c.row - step.at.row) <= reach) {
            f.started.add(k);
            const vp = this.pieces.get(k);
            if (vp && vp.clearing === null) vp.clearing = 0;
          }
        }
      } else {
        const reach = easeInOutSine(p) * (Math.max(this.state.cols, this.state.rows) + 0.5);
        for (const c of step.cells) {
          const k = key(c);
          if (f.started.has(k)) continue;
          const d = step.power === 'cometRow' ? Math.abs(c.col - step.at.col) : Math.abs(c.row - step.at.row);
          if (d <= reach) {
            f.started.add(k);
            const vp = this.pieces.get(k);
            if (vp && vp.clearing === null) vp.clearing = 0;
          }
        }
        if (p < 0.85 && this.rng.chance(0.5)) {
          const { x, y } = this.centre(step.at.col, step.at.row);
          const side = this.rng.chance(0.5) ? -1 : 1;
          const cell = this.layout.cell;
          if (step.power === 'cometRow') this.spawnSparkles(this.clampX(x + side * reach * cell), y + (this.rng.next() - 0.5) * cell * 0.4, '#fff2c8', 1, 0.5);
          else this.spawnSparkles(x + (this.rng.next() - 0.5) * cell * 0.4, this.clampY(y + side * reach * cell), '#fff2c8', 1, 0.5);
        }
      }
    }
    this.fires = this.fires.filter((f) => f.t < f.duration);
    return true;
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
    for (let i = 0; i < n; i++) {
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
    if (this.ambient) this.style.drawBackground(ctx, w, h, t, this.ambient);
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
    const list = [...this.pieces.values()].sort((a, b) => Number(a.clearing !== null) - Number(b.clearing !== null));
    for (const p of list) {
      let { x, y } = this.centre(p.x, p.y);
      let alpha = 1 - this.fadeIn;
      let scale = 1;
      let brighten = 0;
      let scaleX = 1;
      let scaleY = 1;
      if (p.lift < 0) alpha *= 1 + p.lift; // reshuffle fade
      if (p.lift > 0) {
        scale = 1 + 0.08 * p.lift;
        brighten = 0.12 * p.lift;
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
      if (p.piece.power === 'orb') {
        ctx.save();
        ctx.globalAlpha = alpha;
        drawOrb(ctx, x, yy, radius * 0.95 * scale, t);
        ctx.restore();
      } else if (p.piece.type) {
        this.sprites.draw(ctx, p.piece.type, x, yy, radius, { alpha, scaleX: scale * scaleX, scaleY: scale * scaleY, brighten });
        if (p.piece.power) this.drawStreak(x, yy, radius * scale, p.piece.power === 'cometRow', alpha, t);
      }
    }
    ctx.restore();

    this.drawFires(t);
    this.drawParticles();
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

  private drawFires(t: number): void {
    const { ctx } = this;
    const cell = this.layout.cell;
    for (const f of this.fires) {
      const p = clamp01(f.t / f.duration);
      const { step } = f;
      const { x, y } = this.centre(step.at.col, step.at.row);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      if (step.power === 'orb') {
        const radius = easeInOutSine(p) * this.maxDistance(step.at, step.cells) * cell;
        const light = step.color ? this.style.gemColor(step.color).light : '#ffffff';
        if (p < 0.3) glowDisc(ctx, x, y, cell * (0.6 + p * 2.5), '#ffffff', 0.5 * (1 - p / 0.3));
        softRing(ctx, x, y, radius, cell * 0.45, light, 0.7 * (1 - p * 0.6));
        softRing(ctx, x, y, radius * 0.8, cell * 0.3, '#ffffff', 0.25 * (1 - p));
      } else {
        const reach = easeInOutSine(p) * (Math.max(this.state.cols, this.state.rows) + 0.5) * cell;
        const fade = 1 - p * 0.45;
        for (const dir of [-1, 1]) {
          const hx = step.power === 'cometRow' ? this.clampX(x + dir * reach) : x;
          const hy = step.power === 'cometRow' ? y : this.clampY(y + dir * reach);
          const tailLen = Math.min(reach, cell * 2.8);
          ctx.save();
          ctx.translate(hx, hy);
          if (step.power === 'cometCol') ctx.rotate(Math.PI / 2);
          ctx.scale(dir, 1);
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
          glowDisc(ctx, hx, hy, cell * 0.5, '#ffffff', 0.5 * fade);
          glowDisc(ctx, hx, hy, cell * 0.95, '#ffd27a', 0.35 * fade);
        }
      }
      ctx.restore();
    }
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

  private drawVignette(t: number): void {
    const { ctx } = this;
    const { width: w, height: h } = this.layout;
    const a = 0.05 + 0.07 * breath(t);
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
    drawLantern(ctx, cx - 30, hudY + 4, 44, this.lanternFill + 0.02 * Math.sin(t * 0.55), this.style.palette, t);
    const bob = Math.sin(t * 1.3) * 1.5;
    drawCompanion(ctx, this.companion, cx + 36, hudY + 2 + bob, 40, t);
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
