/**
 * The app shell: owns her journey (lantern, area, mode), the board, the view,
 * the map between levels, input, sound, saving, the grown-up gate and the
 * parent panel. Stage 3: powers and their gifts, the map, companions, areas,
 * modes, the launch rule, and the Finish buttons in their provisional form.
 */
import { AudioEngine } from '../audio/engine';
import { MusicPlayer } from '../audio/player';
import { sketchForArea } from '../audio/sketches';
import {
  type FireStep,
  type GameState,
  type PowerFamily,
  type Step,
  applySwap,
  at,
  bestHint,
  deserialize,
  ensurePlayable,
  familyOf,
  findPowers,
  firePowerAt,
  isValidSwap,
  newGame,
  placeGift,
  serialize,
} from '../core/game';
import type { Cell } from '../core/grid';
import {
  AREA_NAMES,
  type Gift,
  type Mode,
  areaForLevel,
  boardFor,
  comboId,
  giftAt,
  isFirstLanternOfArea,
  typesForLevel,
  unlockedAt,
} from '../core/journey';
import { createRng, deriveSeed } from '../shared/rng';
import { areaTheme } from '../render/areas';
import type { CompanionId } from '../render/creatures';
import { nightGarden } from '../render/styles/nightGarden';
import { Gate } from './gate';
import { PointerInput } from './input';
import { MapScene, createMapCanvas } from './mapScene';
import { Panel, type PanelContext } from './panel';
import { type Settings, SettingsStore, hintDelayMs } from './settings';
import { GameSounds } from './sounds';
import { GameView } from './view';

const SAVE_KEY = 'glimmerfall.save.v2';
const LEGACY_SAVE_KEY = 'glimmerfall.save.v1';
/** DESIGN.md 3.6, launch rule: a relaunch within this long resumes the exact board and mode. */
const RESUME_WITHIN_MS = 10 * 60 * 1000;
/** DESIGN.md 3.8, rest-until default: a relaunch within this long after an ending shows the sleeping scene. Stage 5 makes it a setting. */
const REST_UNTIL_MS = 30 * 60 * 1000;
/** The hint points at a gift's swap from the first pause (DESIGN.md 3.4). */
const GIFT_HINT_MS = 2500;
/** The first firing of a power runs at this speed (DESIGN.md 3.4). */
const DISCOVERY_TIME_SCALE = 0.7;

type Phase = 'playing' | 'map' | 'resting';

interface ParkedBoard {
  level: number;
  state: string;
  matches: number;
  gift: Gift | null;
}

interface Save {
  v: 2;
  mode: Mode;
  pendingMode: Mode | null;
  level: number;
  state: string;
  matches: number;
  companion: CompanionId;
  companionOffered: boolean;
  seen: PowerFamily[];
  comboCounts: Record<string, number>;
  gift: Gift | null;
  parkedPlay: ParkedBoard | null;
  phase: Phase;
  finishing: boolean;
  restingSince: number | null;
  savedAt: number;
}

interface LegacySave {
  v: 1;
  state: string;
  level: number;
  progress: number;
  companion: CompanionId;
  savedAt: number;
}

export interface AppOptions {
  debug: boolean;
  seed: number | null;
  reset: boolean;
  /** Testing: start at this lantern on a fresh board. */
  level: number | null;
}

export function optionsFromUrl(): AppOptions {
  const q = new URLSearchParams(location.search);
  const level = Number(q.get('level'));
  return {
    debug: q.get('debug') === '1',
    seed: q.get('seed') ? Number(q.get('seed')) : null,
    reset: q.get('reset') === '1',
    level: Number.isFinite(level) && level >= 1 ? Math.floor(level) : null,
  };
}

export class App {
  // Journey
  private mode: Mode = 'calm';
  private pendingMode: Mode | null = null;
  private level = 1;
  private state: GameState;
  private matches = 0;
  private companion: CompanionId = 'firefly';
  private companionOffered = false;
  private seen = new Set<PowerFamily>();
  private comboCounts: Record<string, number> = {};
  private gift: Gift | null = null;
  private parkedPlay: ParkedBoard | null = null;
  private phase: Phase = 'playing';
  private finishing = false;
  private finishNowWanted = false;
  private restingSince: number | null = null;

  // Parts
  private readonly settings = new SettingsStore();
  private readonly view: GameView;
  private readonly map: MapScene;
  private readonly engine = new AudioEngine();
  private readonly player = new MusicPlayer(this.engine);
  private readonly sounds: GameSounds;
  private readonly input: PointerInput;
  private readonly gate: Gate;
  private readonly panel: Panel;

  // Interaction state
  private selected: Cell | null = null;
  private pending: { a: Cell; b: Cell } | null = null;
  private hintTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;
  private hapticArmed = false;
  private discovering = false;
  private musicArea: string | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly opts: AppOptions,
  ) {
    const settings = this.settings.get();
    this.engine.setSilentMode(settings.playOnSilent ? 'ignore' : 'follow');
    const stage = canvas.parentElement ?? document.body;

    const loaded = opts.reset ? null : this.load();
    if (opts.level !== null) {
      this.level = opts.level;
      this.mode = 'calm';
      this.phase = 'playing';
      this.finishing = false;
      this.restingSince = null;
    }
    this.state = loaded ?? this.freshState(this.level, this.mode);
    if (!loaded) this.placeLevelGift();

    this.view = new GameView(
      canvas,
      nightGarden,
      this.state,
      this.companion,
      {
        onSwap: (valid) => this.sounds.swap(valid),
        onClear: (groups, cascade) => this.sounds.clear(groups, cascade),
        onCreate: (piece) => this.sounds.created(piece),
        onFire: (step) => this.fired(step),
        onTransform: (step) => this.sounds.transform(step),
        onLand: (n) => this.sounds.land(n),
        onReshuffle: () => this.sounds.reshuffle(),
      },
      this.reducedMotion(settings),
    );
    this.view.setBreathing(settings.breathingGlow);
    this.view.setGoal(this.matches, boardFor(this.mode).goal);
    this.sounds = new GameSounds(this.engine, this.player);
    this.sounds.enabled = settings.chimes;
    this.player.setLevel(settings.musicLevel);
    this.applyArea();

    // The map canvas sits above the board and its touch surface; it is hidden when not in use.
    this.map = new MapScene(createMapCanvas(), nightGarden);

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

    // The grown-up gate and the parent panel (DESIGN.md 3.9).
    this.panel = new Panel(stage, this.settings, {
      setMode: (mode) => this.setMode(mode),
      finishAfterLevel: () => this.finishAfterLevel(true),
      cancelFinish: () => this.finishAfterLevel(false),
      finishNow: () => this.finishNow(),
      newSession: () => this.newSession(),
      setLantern: (n) => this.goToLantern(n),
      resetProgress: () => this.resetProgress(),
    });
    this.gate = new Gate(stage, { onOpen: () => this.openPanel() });
    this.panel.onClose(() => {
      this.gate.setEnabled(true);
      this.armHint();
    });
    this.settings.onChange((s) => this.applySettings(s));

    if (opts.debug) this.setupDebug();
    window.addEventListener('resize', () => {
      this.view.resize();
      this.map.resize();
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.sleep() : this.wakeUp()));

    this.view.start();
    void this.requestWakeLock();
    if (this.phase === 'resting') {
      this.showRest();
    } else {
      this.phase = 'playing';
      this.armHint();
      // A save written at the moment the lantern filled: finish that level now.
      if (this.matches >= boardFor(this.mode).goal) this.levelComplete();
    }
    this.save();
  }

  // ------------------------------------------------------------- the board

  private freshState(level: number, mode: Mode): GameState {
    const spec = boardFor(mode);
    const seed = this.opts.seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    return newGame(spec.rows, spec.cols, typesForLevel(level, mode), seed, spec.bias, unlockedAt(level));
  }

  /** A fresh board for the current lantern, with that lantern's gift if it has one. */
  private startBoard(): void {
    this.state = this.freshState(this.level, this.mode);
    this.matches = 0;
    this.placeLevelGift();
    this.view.setState(this.state);
    this.view.setGoal(0, boardFor(this.mode).goal);
    this.applyArea();
  }

  private placeLevelGift(): void {
    const gift = giftAt(this.level, this.comboCounts);
    this.gift = gift;
    if (gift) this.state = placeGift(this.state, gift, createRng(deriveSeed(this.state.seed, 99))).state;
  }

  private giftFamilies(): PowerFamily[] {
    if (!this.gift) return [];
    return this.gift.kind === 'power' ? [this.gift.family] : [this.gift.a, this.gift.b];
  }

  /** Where the unfired gift powers sit now (they move with the falls). */
  private giftCells(): Cell[] {
    const families = this.giftFamilies();
    return families.flatMap((f) => findPowers(this.state.board, f).map((p) => p.cell));
  }

  /** The area's look and music follow the lantern. */
  private applyArea(): void {
    const area = areaForLevel(this.level);
    this.view.setArea(areaTheme(area));
    this.view.setGift(this.giftFamilies());
    this.view.setCompanion(this.companion);
    this.sounds.setArea(area);
    if (this.musicArea !== null && this.musicArea !== area) this.startMusic();
  }

  private startMusic(): void {
    const area = areaForLevel(this.level);
    this.musicArea = area;
    if (!this.settings.get().music || !this.engine.isRunning) return;
    void this.player.start(sketchForArea(area), 4242 + this.level, false, null);
    this.player.setLevel(this.settings.get().musicLevel);
  }

  // ------------------------------------------------------------------ input

  private touched(x: number, y: number): void {
    if (this.phase !== 'playing') {
      this.unlockAudio();
      return;
    }
    this.view.ripple(x, y);
    this.clearHint();
    // A tap that will complete a valid tap-tap swap may tick (see setupHaptics).
    const cell = this.view.cellAt(x, y);
    this.hapticArmed =
      this.settings.get().haptics &&
      !!cell &&
      !!this.selected &&
      Math.abs(this.selected.row - cell.row) + Math.abs(this.selected.col - cell.col) === 1 &&
      isValidSwap(this.state, this.selected, cell);
    this.unlockAudio();
  }

  /** Idempotent: creates the context on the first touch, resumes it after interruptions, starts the music once it runs. */
  private unlockAudio(): void {
    void this.engine.unlock().then(() => {
      if (this.engine.isRunning && this.settings.get().music && !this.player.current) this.startMusic();
    });
  }

  private tapped(cell: Cell | null, x: number, y: number): void {
    if (this.phase !== 'playing') return;
    if (!cell) {
      this.select(null);
      const hit = this.view.hudHit(x, y);
      if (hit) {
        this.view.poke(hit);
        const ctx = this.engine.context;
        if (ctx && this.engine.isRunning && this.settings.get().chimes) this.engine.arpeggio(this.player.chordNow(10, 16).slice(0, 3), ctx.currentTime + 0.02, 0.35, 0.08);
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
    if (this.phase !== 'playing') return;
    if (b.row < 0 || b.col < 0 || b.row >= this.state.rows || b.col >= this.state.cols) return;
    this.select(null);
    const goal = boardFor(this.mode).goal;
    if (this.view.busy) {
      if (this.matches < goal && !this.finishNowWanted) this.pending = { a, b }; // never carry a swap across the level's end
      return;
    }
    const valid = isValidSwap(this.state, a, b);
    if (!valid) {
      this.view.play(applySwap(this.state, a, b).steps, this.state, () => this.settled());
      return;
    }
    const pa = at(this.state.board, a.row, a.col);
    const pb = at(this.state.board, b.row, b.col);
    if (pa?.power && pb?.power) {
      const id = comboId(familyOf(pa.power), familyOf(pb.power));
      this.comboCounts[id] = (this.comboCounts[id] ?? 0) + 1;
    }
    const result = applySwap(this.state, a, b);
    this.state = result.state;
    const groups = result.steps.reduce((n, st) => n + (st.kind === 'clear' ? st.groups.length : 0), 0);
    this.matches = Math.min(goal, this.matches + groups);
    this.playSteps(result.steps);
  }

  /** Show a resolution, noting discoveries and the gift going off, then save. */
  private playSteps(steps: Step[]): void {
    const goal = boardFor(this.mode).goal;
    const fires = steps.filter((st): st is FireStep => st.kind === 'fire');
    this.discovering = fires.some((f) => !this.seen.has(familyOf(f.power)));
    for (const f of fires) this.seen.add(familyOf(f.power));
    // The gift is spent once a power of its family has gone off (a combo gift: once she swapped the pair), or none of it is left on the board.
    if (this.gift) {
      const families = this.giftFamilies();
      const spent = this.gift.kind === 'power' ? fires.some((f) => families.includes(familyOf(f.power))) : fires.some((f) => f.combo !== undefined);
      if (spent || families.every((f) => findPowers(this.state.board, f).length === 0)) this.gift = null;
    }
    this.save();
    this.view.play(
      steps,
      this.state,
      () => this.settled(),
      (step) => {
        // Light the next star as each clear lands, not all at once at the end.
        if (step.kind === 'clear') this.view.setGoal(Math.min(goal, this.view.goalDone + step.groups.length), goal);
      },
      { timeScale: this.discovering ? DISCOVERY_TIME_SCALE : 1 },
    );
  }

  private fired(step: FireStep): void {
    this.sounds.fired(step, this.discovering);
  }

  private settled(): void {
    this.discovering = false;
    this.view.setGift(this.giftFamilies());
    if (this.matches >= boardFor(this.mode).goal || this.finishNowWanted) {
      this.pending = null;
      this.levelComplete();
      return;
    }
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      this.trySwap(pending.a, pending.b);
      return;
    }
    this.save();
    this.armHint();
  }

  /**
   * The lantern is full (or a grown-up asked to finish now). An unfired gift
   * goes off first, with the discovery treatment, so every discovery is seen
   * (DESIGN.md 3.4); then the gems drift up into the lantern and the map plays.
   */
  private levelComplete(): void {
    this.clearHint();
    this.select(null);
    if (this.gift) {
      const cell = this.giftCells()[0];
      if (cell) {
        const result = firePowerAt(this.state, cell);
        this.state = result.state;
        this.playSteps(result.steps);
        return;
      }
      this.gift = null;
    }
    this.finishNowWanted = false;
    this.matches = boardFor(this.mode).goal;
    this.view.setGoal(this.matches, this.matches);
    this.sounds.levelDone();
    this.view.celebrate(() => this.toMap());
  }

  // -------------------------------------------------------------------- map

  /** Between levels: the lantern is lit, so the save already stands on the next one. */
  private toMap(): void {
    const from = this.level;
    const rest = this.finishing;
    this.level += 1;
    this.phase = rest ? 'resting' : 'map';
    if (rest) this.restingSince = Date.now();
    this.pending = null;
    this.matches = 0;
    this.gift = null;
    this.state = this.freshState(this.level, this.mode);
    if (this.pendingMode) {
      this.mode = this.pendingMode;
      this.pendingMode = null;
      this.state = this.freshState(this.level, this.mode);
    }
    this.placeLevelGift();
    this.save();
    this.view.stop();
    const offer = (!this.companionOffered && this.level === 2) || isFirstLanternOfArea(this.level);
    if (offer) this.companionOffered = true;
    this.map.show({
      from,
      to: this.level,
      companion: this.companion,
      offerCompanions: offer,
      rest,
      onLight: () => (isFirstLanternOfArea(this.level) ? this.sounds.areaArrive(areaForLevel(this.level)) : this.sounds.lanternLit()),
      onPick: (id) => this.pickCompanion(id),
      onTwinkle: () => this.sounds.twinkle(),
      onDone: () => this.leaveMap(),
    });
    if (rest) this.player.setWindDown(true);
  }

  /** The board must belong to the mode she is in: a switch made on the map or in rest takes effect here. */
  private ensureBoardForMode(): void {
    if (this.pendingMode) {
      this.mode = this.pendingMode;
      this.pendingMode = null;
    }
    const spec = boardFor(this.mode);
    if (this.state.rows !== spec.rows || this.state.cols !== spec.cols) {
      this.state = this.freshState(this.level, this.mode);
      this.matches = 0;
      this.placeLevelGift();
    }
  }

  private leaveMap(): void {
    this.ensureBoardForMode();
    this.map.hide();
    this.phase = 'playing';
    this.view.setState(this.state);
    this.view.setGoal(0, boardFor(this.mode).goal);
    this.applyArea();
    this.view.start();
    this.save();
    this.armHint();
  }

  /** The resting scene on a relaunch while she is still "asleep". */
  private showRest(): void {
    this.view.stop();
    this.map.show({
      from: this.level,
      to: this.level,
      companion: this.companion,
      offerCompanions: false,
      rest: true,
      onTwinkle: () => this.sounds.twinkle(),
      onDone: () => undefined,
    });
  }

  private pickCompanion(id: CompanionId): void {
    this.companion = id;
    this.view.setCompanion(id);
    this.sounds.companionPick();
    this.save();
  }

  // ------------------------------------------------------- the parent panel

  private panelContext(): PanelContext {
    const s = this.engine.status;
    return {
      mode: this.mode,
      pendingMode: this.pendingMode,
      level: this.level,
      areaName: AREA_NAMES[areaForLevel(this.level)],
      resting: this.phase === 'resting',
      finishing: this.finishing,
      buildDate: __BUILD_DATE__,
      offlineReady: !!navigator.serviceWorker?.controller,
      audio: `${s.state}${this.player.current ? ', music' : ''}`,
    };
  }

  private openPanel(): void {
    this.clearHint();
    this.gate.setEnabled(false);
    this.panel.open(this.panelContext());
  }

  /**
   * DESIGN.md 3.6: Play to Calm is the emergency direction and is immediate,
   * keeping the half-done Play board; Calm to Play waits for the lantern,
   * unless a parked Play board for this very lantern is waiting to come back.
   */
  private setMode(mode: Mode): void {
    if (mode === this.mode) {
      this.pendingMode = null;
    } else if (mode === 'calm') {
      if (this.phase === 'playing') {
        this.parkedPlay = { level: this.level, state: serialize(this.state), matches: this.matches, gift: this.gift };
        this.mode = 'calm';
        this.pendingMode = null;
        this.pending = null;
        this.startBoard();
        this.armHint();
      } else {
        this.mode = 'calm';
        this.pendingMode = null;
      }
    } else if (this.parkedPlay && this.parkedPlay.level === this.level && this.phase === 'playing') {
      const parked = this.parkedPlay;
      this.parkedPlay = null;
      const state = deserialize(parked.state);
      this.mode = 'play';
      this.pendingMode = null;
      this.pending = null;
      if (state) {
        this.state = ensurePlayable(state).state;
        this.matches = parked.matches;
        this.gift = parked.gift;
        this.view.setState(this.state);
        this.view.setGoal(this.matches, boardFor(this.mode).goal);
        this.applyArea();
      } else {
        this.startBoard();
      }
      this.armHint();
    } else {
      this.pendingMode = 'play';
    }
    this.save();
    this.panel.update(this.panelContext());
  }

  private finishAfterLevel(on: boolean): void {
    this.finishing = on;
    this.save();
    this.panel.update(this.panelContext());
  }

  /** "Finish now, gently": the current board resolves into the lantern as soon as the pieces are still. */
  private finishNow(): void {
    if (this.phase !== 'playing') return;
    this.finishing = true;
    this.finishNowWanted = true;
    this.pending = null;
    this.panel.close();
    if (!this.view.busy) this.levelComplete();
  }

  private newSession(): void {
    this.finishing = false;
    this.finishNowWanted = false;
    this.restingSince = null;
    this.player.setWindDown(false);
    this.panel.close();
    if (this.phase === 'resting') this.leaveMap();
  }

  /** Map position: the recovery tool if the phone ever loses the save (DESIGN.md 3.9). */
  private goToLantern(n: number): void {
    this.level = Math.max(1, Math.floor(n));
    this.parkedPlay = null;
    this.pendingMode = null;
    this.pending = null;
    if (this.phase !== 'playing') {
      this.map.hide();
      this.phase = 'playing';
      this.view.start();
    }
    this.finishing = false;
    this.restingSince = null;
    this.startBoard();
    this.save();
    this.panel.update(this.panelContext());
    this.armHint();
  }

  private resetProgress(): void {
    try {
      localStorage.removeItem(SAVE_KEY);
      localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      /* nothing to remove */
    }
    this.companion = 'firefly';
    this.companionOffered = false;
    this.seen.clear();
    this.comboCounts = {};
    this.mode = 'calm';
    this.goToLantern(1);
  }

  private reducedMotion(s: Settings): boolean {
    if (s.reducedMotion === 'on') return true;
    if (s.reducedMotion === 'off') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private applySettings(s: Settings): void {
    this.engine.setSilentMode(s.playOnSilent ? 'ignore' : 'follow');
    this.sounds.enabled = s.chimes;
    if (s.music) {
      if (!this.player.current) this.startMusic();
      else this.player.setLevel(s.musicLevel);
    } else if (this.player.current) {
      this.player.stop(1.2);
    }
    this.view.setReducedMotion(this.reducedMotion(s));
    this.view.setBreathing(s.breathingGlow);
    this.armHint();
  }

  // ------------------------------------------------------------------- save

  private load(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const save = raw ? (JSON.parse(raw) as Save) : this.migrateLegacy();
      if (!save || save.v !== 2) return null;
      const now = Date.now();
      const gap = now - save.savedAt;
      this.level = Math.max(1, save.level);
      this.companion = save.companion ?? 'firefly';
      this.companionOffered = !!save.companionOffered;
      this.seen = new Set(save.seen ?? []);
      this.comboCounts = save.comboCounts ?? {};
      this.parkedPlay = save.parkedPlay ?? null;
      this.mode = save.mode ?? 'calm';
      this.pendingMode = save.pendingMode ?? null;
      this.finishing = !!save.finishing;

      // Resting comes first (DESIGN.md 3.8): the sleeping scene stays until the rest-until time has passed.
      if (save.phase === 'resting' && save.restingSince !== null && now - save.restingSince < REST_UNTIL_MS) {
        this.phase = 'resting';
        this.restingSince = save.restingSince;
        this.gift = save.gift ?? null;
        const state = deserialize(save.state);
        return state ? ensurePlayable(state).state : null;
      }
      this.finishing = false;
      this.phase = 'playing';
      if (this.opts.seed !== null) return null;

      // Launch rule (DESIGN.md 3.6): a longer gap starts in Calm (or the remembered mode) on a fresh board.
      if (gap > RESUME_WITHIN_MS) {
        const wanted: Mode = this.settings.get().launch === 'remember' ? save.mode : 'calm';
        if (save.mode === 'play' && wanted === 'calm' && save.phase === 'playing') {
          this.parkedPlay = { level: save.level, state: save.state, matches: save.matches, gift: save.gift ?? null };
        }
        this.mode = wanted;
        this.pendingMode = null;
        return null;
      }
      const state = deserialize(save.state);
      const spec = boardFor(this.mode);
      if (!state || state.rows !== spec.rows || state.cols !== spec.cols) return null;
      this.matches = save.matches ?? 0;
      this.gift = save.gift ?? null;
      return ensurePlayable(state).state;
    } catch {
      return null;
    }
  }

  /** A Stage 2 save: keep her lantern and companion; the board is replaced by a fresh one for its lantern. */
  private migrateLegacy(): Save | null {
    try {
      const raw = localStorage.getItem(LEGACY_SAVE_KEY);
      if (!raw) return null;
      const old = JSON.parse(raw) as LegacySave;
      if (old.v !== 1) return null;
      return {
        v: 2,
        mode: 'calm',
        pendingMode: null,
        level: old.level,
        state: '',
        matches: 0,
        companion: old.companion ?? 'firefly',
        companionOffered: false,
        seen: ['comet', 'orb'],
        comboCounts: {},
        gift: null,
        parkedPlay: null,
        phase: 'playing',
        finishing: false,
        restingSince: null,
        savedAt: 0,
      };
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      const save: Save = {
        v: 2,
        mode: this.mode,
        pendingMode: this.pendingMode,
        level: this.level,
        state: serialize(this.state),
        matches: this.matches,
        companion: this.companion,
        companionOffered: this.companionOffered,
        seen: [...this.seen],
        comboCounts: this.comboCounts,
        gift: this.gift,
        parkedPlay: this.parkedPlay,
        phase: this.phase,
        finishing: this.finishing,
        restingSince: this.restingSince,
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      /* storage can be unavailable in private mode; the game still plays */
    }
  }

  // ---------------------------------------------------------------- haptics

  /**
   * Haptics experiment (DESIGN.md 3.12). iOS has no vibration API for web pages, but it plays a
   * system tick when an iOS-style switch is toggled by a real tap. The touch surface is a label
   * for a hidden switch; a tap that is not meant to tick has its click cancelled.
   */
  private setupHaptics(surface: HTMLElement): void {
    if (surface.tagName !== 'LABEL') return;
    surface.addEventListener('click', (e) => {
      if (!this.hapticArmed) e.preventDefault();
      this.hapticArmed = false;
    });
  }

  private setupDebug(): void {
    // A hook for the Playwright verification scripts (debug mode only): drive swaps and jumps deterministically.
    const w = window as Window & { glimmerfall?: unknown };
    w.glimmerfall = {
      hint: () => bestHint(this.state),
      layout: () => this.view.currentLayout,
      swap: (a: Cell, b: Cell) => this.trySwap(a, b),
      busy: () => this.view.busy,
      phase: () => this.phase,
      level: () => this.level,
      state: () => this.state,
      finishNow: () => this.finishNow(),
      finishAfterLevel: () => this.finishAfterLevel(true),
      openPanel: () => this.openPanel(),
      goTo: (n: number) => this.goToLantern(n),
      continueMap: () => (this.phase === 'map' ? this.leaveMap() : undefined),
    };
    const el = document.createElement('div');
    el.id = 'debug';
    el.style.cssText = 'position:fixed;right:8px;top:env(safe-area-inset-top,0px);z-index:9;font:11px/1.3 -apple-system,monospace;color:#9fe;background:rgba(0,0,0,.55);padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre';
    document.body.appendChild(el);
    setInterval(() => {
      const s = this.engine.status;
      const nav = navigator as Navigator & { standalone?: boolean };
      const gift = this.gift ? (this.gift.kind === 'power' ? this.gift.family : `${this.gift.a}+${this.gift.b}`) : 'none';
      el.textContent = [
        `build ${__BUILD_DATE__}`,
        `audio ${s.state} unlocked ${s.unlocked} session ${s.session} keepalive ${s.keepAlive}`,
        `music ${this.player.current?.id ?? 'off'} sr ${s.sampleRate}`,
        `lantern ${this.level} ${areaForLevel(this.level)} ${this.mode}${this.pendingMode ? ' -> ' + this.pendingMode : ''} ${this.phase}`,
        `matches ${this.matches}/${boardFor(this.mode).goal} moves ${this.state.moves} gift ${gift}`,
        `unlocked ${this.state.unlocked.join(',')} seen ${[...this.seen].join(',')}`,
        `standalone ${String(nav.standalone ?? 'n/a')} sw ${navigator.serviceWorker?.controller ? 'yes' : 'no'}`,
        this.engine.lastError ? `err ${this.engine.lastError}` : '',
      ].join('\n');
    }, 500);
  }

  // ------------------------------------------------------------------ hints

  private armHint(): void {
    this.clearHint();
    if (this.phase !== 'playing') return;
    const base = this.gift ? GIFT_HINT_MS : boardFor(this.mode).hintMs;
    const delay = hintDelayMs(this.settings.get().hintDelay, base);
    if (delay === null) return;
    this.hintTimer = setTimeout(() => {
      if (this.view.busy || document.hidden || this.panel.isOpen) return;
      const hint = bestHint(this.state);
      if (hint) this.view.setHint({ a: hint.a, b: hint.b });
    }, delay);
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
    this.map.stop();
    this.clearHint();
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  private wakeUp(): void {
    void this.engine.resume().then(() => {
      if (this.settings.get().music && this.engine.isRunning && !this.player.current) this.startMusic();
    });
    if (this.phase === 'playing') this.view.start();
    else this.map.start();
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
    this.gate.destroy();
    this.panel.destroy();
    this.view.stop();
    this.map.stop();
  }
}
