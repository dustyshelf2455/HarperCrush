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
const ROWS = 9;
const COLS = 6;
const FOUR: readonly GemType[] = ['star', 'heart', 'drop', 'leaf'];
const FIVE: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];
/** Matches (clear groups, cascades included) that light the lantern in Calm mode. */
const GOAL_MATCHES = 12;
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
  haptics: boolean;
  silent: 'ignore' | 'follow';
  debug: boolean;
  seed: number | null;
  reset: boolean;
}

export function optionsFromUrl(): AppOptions {
  const q = new URLSearchParams(location.search);
  return {
    types: q.get('types') === '4' ? 4 : 5,
    music: q.get('music') !== '0',
    chimes: q.get('chimes') !== '0',
    haptics: q.get('haptics') !== '0',
    silent: q.get('silent') === 'follow' ? 'follow' : 'ignore',
    debug: q.get('debug') === '1' || location.hash === '#debug',
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
  private matches = 0;
  private hapticArmed = false;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly opts: AppOptions,
  ) {
    this.musicWanted = opts.music;
    this.engine.setSilentMode(opts.silent);
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
    this.matches = Math.round(this.progress * GOAL_MATCHES);
    this.view.setGoal(this.matches, GOAL_MATCHES);
    // Touch goes through the haptic overlay (a label over the canvas) when available, else the canvas.
    const surface = (document.getElementById('touch') as HTMLElement | null) ?? canvas;
    this.input = new PointerInput(surface, {
      cellAt: (x, y) => this.view.cellAt(x, y),
      cellSize: () => this.view.currentLayout.cell,
      onTouch: (x, y) => this.touched(x, y),
      onTap: (cell, x, y) => this.tapped(cell, x, y),
      onSwipe: (from, to) => this.trySwap(from, to),
    });
    this.setupHaptics(surface);
    // A second chance at the audio unlock on the release of the touch, which every browser counts as a gesture.
    surface.addEventListener('pointerup', () => this.unlockAudio(), { passive: true });
    if (opts.debug) this.setupDebug();
    window.addEventListener('resize', () => this.view.resize());
    document.addEventListener('visibilitychange', () => (document.hidden ? this.sleep() : this.wakeUp()));
    this.view.start();
    this.armHint();
    void this.requestWakeLock();
    // Save at once so even an untouched fresh board resumes exactly.
    this.save();
    // A save written at the moment the row completed: finish that level now.
    if (this.progress >= 1) this.nextLevel();
  }

  private fresh(): GameState {
    const types = this.opts.types === 4 ? FOUR : FIVE;
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
      if (state.types.length !== (this.opts.types === 4 ? 4 : 5)) return null;
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
    // A tap that will complete a valid tap-tap swap may tick (see setupHaptics).
    const cell = this.view.cellAt(x, y);
    this.hapticArmed = this.opts.haptics && !!cell && !!this.selected && Math.abs(this.selected.row - cell.row) + Math.abs(this.selected.col - cell.col) === 1 && isValidSwap(this.state, this.selected, cell);
    this.unlockAudio();
  }

  /** Idempotent: creates the context on the first touch, resumes it after interruptions, starts the music once it runs. */
  private unlockAudio(): void {
    void this.engine.unlock().then(() => {
      if (this.engine.isRunning && this.musicWanted && !this.player.current) void this.player.start(LULLABY, 4242, false, null);
    });
  }

  private tapped(cell: Cell | null, x: number, y: number): void {
    if (!cell) {
      this.select(null);
      const hit = this.view.hudHit(x, y);
      if (hit) {
        this.view.poke(hit);
        const ctx = this.engine.context;
        if (ctx && this.engine.isRunning && this.opts.chimes) this.engine.arpeggio(this.player.chordNow(10, 16).slice(0, 3), ctx.currentTime + 0.02, 0.35, 0.08);
      }
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
      if (this.progress < 1) this.pending = { a, b }; // never carry a swap across the level's end
      return;
    }
    const valid = isValidSwap(this.state, a, b);
    const result = applySwap(this.state, a, b);
    if (valid) {
      this.state = result.state;
      const groups = result.steps.filter((st) => st.kind === 'clear').reduce((n, st) => n + (st.kind === 'clear' ? st.groups.length : 0), 0);
      this.matches = Math.min(GOAL_MATCHES, this.matches + groups);
      this.progress = this.matches / GOAL_MATCHES;
      this.save();
    }
    this.view.play(result.steps, result.state, () => this.settled(), (step) => {
      // Light the next star as each clear lands, not all at once at the end.
      if (step.kind === 'clear') this.view.setGoal(Math.min(GOAL_MATCHES, this.view.goalDone + step.groups.length), GOAL_MATCHES);
    });
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
    this.pending = null;
    this.select(null);
    this.level += 1;
    this.progress = 0;
    this.matches = 0;
    this.state = this.fresh();
    this.save();
    this.view.setState(this.state);
    this.view.setGoal(0, GOAL_MATCHES);
    this.armHint();
  }

  /**
   * Haptics experiment. iOS has no vibration API for web pages, but it plays a
   * system tick when an iOS-style switch is toggled by a real tap. The touch
   * surface is a label for a hidden switch; a tap that is not meant to tick
   * has its click cancelled so the switch is left alone.
   */
  private setupHaptics(surface: HTMLElement): void {
    if (surface.tagName !== 'LABEL') return;
    surface.addEventListener('click', (e) => {
      if (!this.hapticArmed) e.preventDefault();
      this.hapticArmed = false;
    });
  }

  private setupDebug(): void {
    const el = document.createElement('div');
    el.id = 'debug';
    el.style.cssText = 'position:fixed;right:8px;top:env(safe-area-inset-top,0px);z-index:9;font:11px/1.3 -apple-system,monospace;color:#9fe;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre';
    document.body.appendChild(el);
    setInterval(() => {
      const s = this.engine.status;
      const nav = navigator as Navigator & { standalone?: boolean };
      el.textContent = [
        `build ${__BUILD_DATE__}`,
        `audio ${s.state} unlocked ${s.unlocked} session ${s.session} keepalive ${s.keepAlive}`,
        `music ${this.player.current?.id ?? 'off'} sr ${s.sampleRate}`,
        `level ${this.level} matches ${this.matches}/${GOAL_MATCHES} moves ${this.state.moves}`,
        `standalone ${String(nav.standalone ?? 'n/a')} sw ${navigator.serviceWorker?.controller ? 'yes' : 'no'} update ${document.documentElement.dataset.update ?? '-'}`,
        this.engine.lastError ? `err ${this.engine.lastError}` : '',
      ].join('\n');
    }, 500);
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
    void this.engine.resume().then(() => {
      if (this.musicWanted && this.engine.isRunning && !this.player.current) void this.player.start(LULLABY, 4242 + this.level, false, null);
    });
    this.view.start();
    this.armHint();
    void this.requestWakeLock();
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
