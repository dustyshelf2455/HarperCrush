/**
 * The app shell: owns the game state, the view, input, sound, saving and
 * the lantern goal. Calm mode only in Stage 2.
 */
import { AudioEngine } from '../audio/engine';
import { MusicPlayer } from '../audio/player';
import { LULLABY } from '../audio/sketches';
import { type GameState, applySwap, bestHint, deserialize, ensurePlayable, isValidSwap, newGame, serialize } from '../core/game';
import type { Cell, GemType } from '../core/grid';
import type { CompanionId } from '../render/creatures';
import { nightGarden } from '../render/styles/nightGarden';
import { PointerInput } from './input';
import { GameSounds } from './sounds';
import { GameView } from './view';

const SAVE_KEY = 'glimmerfall.save.v1';
const ROWS = 7;
const COLS = 6;
const FOUR: readonly GemType[] = ['star', 'heart', 'drop', 'leaf'];
const FIVE: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];
/** Light poured into the lantern per cleared piece; about ninety pieces light it. */
const LIGHT_PER_PIECE = 0.011;
const HINT_AFTER_MS = 4000;

interface Save {
  v: 1;
  state: string;
  level: number;
  progress: number;
  companion: CompanionId;
  savedAt: number;
}

export interface AppOptions {
  types: 4 | 5;
  music: boolean;
  chimes: boolean;
  seed: number | null;
  reset: boolean;
}

export function optionsFromUrl(): AppOptions {
  const q = new URLSearchParams(location.search);
  return {
    types: q.get('types') === '5' ? 5 : 4,
    music: q.get('music') !== '0',
    chimes: q.get('chimes') !== '0',
    seed: q.get('seed') ? Number(q.get('seed')) : null,
    reset: q.get('reset') === '1',
  };
}

export class App {
  private state: GameState;
  private level = 1;
  private progress = 0;
  private companion: CompanionId = 'firefly';
  private readonly view: GameView;
  private readonly engine = new AudioEngine();
  private readonly player = new MusicPlayer(this.engine);
  private readonly sounds: GameSounds;
  private readonly input: PointerInput;
  private selected: Cell | null = null;
  private pending: { a: Cell; b: Cell } | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private musicWanted: boolean;
  private unlocked = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly opts: AppOptions,
  ) {
    this.musicWanted = opts.music;
    const loaded = opts.reset ? null : this.load();
    this.state = loaded ?? this.fresh();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.view = new GameView(
      canvas,
      nightGarden,
      this.state,
      this.companion,
      {
        onSwap: (valid) => this.sounds.swap(valid),
        onClear: (groups, cascade) => this.sounds.clear(groups, cascade),
        onCreate: (piece) => this.sounds.created(piece),
        onFire: (power) => this.sounds.fired(power),
        onLand: (n) => this.sounds.land(n),
        onReshuffle: () => this.sounds.reshuffle(),
      },
      reduced,
    );
    this.sounds = new GameSounds(this.engine, this.player);
    this.sounds.enabled = opts.chimes;
    this.view.setLantern(this.progress);
    this.input = new PointerInput(canvas, {
      cellAt: (x, y) => this.view.cellAt(x, y),
      cellSize: () => this.view.currentLayout.cell,
      onTouch: (x, y) => this.touched(x, y),
      onTap: (cell) => this.tapped(cell),
      onSwipe: (from, to) => this.trySwap(from, to),
    });
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.sleep() : this.wakeUp()));
    this.view.start();
    this.armHint();
    void this.requestWakeLock();
    // Save at once so even an untouched fresh board resumes exactly.
    this.save();
  }

  private fresh(): GameState {
    const types = this.opts.types === 5 ? FIVE : FOUR;
    const seed = this.opts.seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    return newGame(ROWS, COLS, types, seed, 0.3);
  }

  private load(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const save = JSON.parse(raw) as Save;
      if (save.v !== 1) return null;
      const state = deserialize(save.state);
      if (!state || state.rows !== ROWS || state.cols !== COLS) return null;
      if (this.opts.seed !== null) return null;
      if (state.types.length !== (this.opts.types === 5 ? 5 : 4)) return null;
      this.level = save.level;
      this.progress = save.progress;
      this.companion = save.companion;
      const { state: playable } = ensurePlayable(state);
      return playable;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      const save: Save = { v: 1, state: serialize(this.state), level: this.level, progress: this.progress, companion: this.companion, savedAt: Date.now() };
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    } catch {
      /* storage can be unavailable in private mode; the game still plays */
    }
  }

  // ------------------------------------------------------------------ input

  private touched(x: number, y: number): void {
    this.view.ripple(x, y);
    this.clearHint();
    if (!this.unlocked) {
      this.unlocked = true;
      void this.engine.unlock().then(() => {
        if (this.musicWanted && !this.player.current) void this.player.start(LULLABY, 4242, false, null);
      });
    } else {
      this.engine.resume();
    }
  }

  private tapped(cell: Cell | null): void {
    if (!cell) {
      this.select(null);
      return;
    }
    if (this.selected && Math.abs(this.selected.row - cell.row) + Math.abs(this.selected.col - cell.col) === 1) {
      const from = this.selected;
      this.select(null);
      this.trySwap(from, cell);
      return;
    }
    this.select(this.selected && this.selected.row === cell.row && this.selected.col === cell.col ? null : cell);
  }

  private select(cell: Cell | null): void {
    this.selected = cell;
    this.view.setSelected(cell);
    this.armHint();
  }

  private trySwap(a: Cell, b: Cell): void {
    if (b.row < 0 || b.col < 0 || b.row >= ROWS || b.col >= COLS) return;
    this.select(null);
    if (this.view.busy) {
      this.pending = { a, b };
      return;
    }
    const valid = isValidSwap(this.state, a, b);
    const result = applySwap(this.state, a, b);
    if (valid) {
      this.state = result.state;
      this.progress = Math.min(1, this.progress + result.cleared * LIGHT_PER_PIECE);
      this.save();
      this.view.setLantern(this.progress);
    }
    this.view.play(result.steps, result.state, () => this.settled());
  }

  private settled(): void {
    if (this.progress >= 1) {
      this.pending = null;
      this.sounds.levelDone();
      this.view.celebrate(() => this.nextLevel());
      return;
    }
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      this.trySwap(pending.a, pending.b);
      return;
    }
    this.armHint();
  }

  private nextLevel(): void {
    this.level += 1;
    this.progress = 0;
    this.state = this.fresh();
    this.save();
    this.view.setState(this.state);
    this.view.setLantern(0);
    this.armHint();
  }

  private armHint(): void {
    this.clearHint();
    this.hintTimer = setTimeout(() => {
      if (this.view.busy || document.hidden) return;
      const hint = bestHint(this.state);
      if (hint) this.view.setHint({ a: hint.a, b: hint.b });
    }, HINT_AFTER_MS);
  }

  private clearHint(): void {
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = null;
    this.view.setHint(null);
  }

  // -------------------------------------------------------------- lifecycle

  private sleep(): void {
    this.player.stop(0.05);
    this.engine.suspend();
    this.view.stop();
    this.clearHint();
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  private wakeUp(): void {
    this.engine.resume();
    if (this.unlocked && this.musicWanted && this.engine.isRunning) void this.player.start(LULLABY, 4242 + this.level, false, null);
    this.view.start();
    this.armHint();
    void this.requestWakeLock();
    // Save at once so even an untouched fresh board resumes exactly.
    this.save();
  }

  private async requestWakeLock(): Promise<void> {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      if (!nav.wakeLock || document.hidden) return;
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch {
      /* not available or not allowed yet; Guided Access covers it */
    }
  }

  destroy(): void {
    this.input.destroy();
    this.view.stop();
  }
}
