/**
 * The app shell: owns her journey (lantern, area, mode), the board, the view,
 * the map between levels, input, sound, saving, the grown-up gate and the
 * parent panel. Stage 3: powers and their gifts, the map, companions, areas,
 * modes, the Finish buttons in their provisional form; after the Stage 3
 * play-test (DESIGN.md 2d): one game that opens as it was left, Calm as a
 * switch over it, the session timer with its sleepy wind-down, and replaying
 * a lit lantern from the map.
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
  goalsDone,
  moonHelp,
  resolveLevel,
  isOpen,
  newLevel,
} from '../core/game';
import type { Cell } from '../core/grid';
import {
  AREA_NAMES,
  type AreaId,
  type Gift,
  type Mode,
  areaForLevel,
  boardFor,
  canPlayFromMap,
  comboId,
  giftAt,
  isFirstLanternOfArea,
  typesForLevel,
  unlockedAt,
} from '../core/journey';
import { createRng, deriveSeed } from '../shared/rng';
import { areaTheme } from '../render/areas';
import { loadGemArt } from '../render/gemArt';
import { loadPowerArt } from '../render/powerArt';
import { loadMapArt } from '../render/mapArt';
import type { CompanionId } from '../render/creatures';
import { nightGarden } from '../render/styles/nightGarden';
import { Gate } from './gate';
import { PointerInput } from './input';
import { MapScene, createMapCanvas } from './mapScene';
import { levelFor } from '../core/levels';
import { Panel, type PanelContext } from './panel';
import { ReviewBar, reviewOn, setReviewFlag } from './review';
import { type Settings, SettingsStore, hintDelayMs } from './settings';
import { GameSounds } from './sounds';
import { Splash } from './splash';
import { GameView } from './view';

const SAVE_KEY = 'glimmerfall.save.v3';
const SAVE_KEY_V2 = 'glimmerfall.save.v2';
const LEGACY_SAVE_KEY = 'glimmerfall.save.v1';
/** A session's clock carries across a relaunch within this long (she closed and reopened the app); after longer it starts afresh. */
const SESSION_CARRY_MS = 30 * 60 * 1000;
/** The resting scene (DESIGN.md 3.8): the lullaby plays this long, then fades to silence over LULLABY_FADE_S. */
const LULLABY_MS = 12_000;
const LULLABY_FADE_S = 30;
/** After this long in rest the twinkle chimes stop; after REST_DEEP_MS the screen wake lock is released so the phone can lock itself. */
const REST_QUIET_MS = 2 * 60 * 1000;
const REST_DEEP_MS = 10 * 60 * 1000;
/** The sleepy stretch at the end of a timed session (DESIGN.md 2d: the parent's four minutes). */
const WIND_DOWN_MS = 4 * 60 * 1000;
const SESSION_TICK_MS = 1000;
/** The theme's twinkles and tiny timing are seeded once, so the song opens the same way every time. */
const THEME_SEED = 7777;
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
  v: 3;
  mode: Mode;
  pendingMode: Mode | null;
  level: number;
  state: string;
  matches: number;
  companion: CompanionId;
  /** Stage 3 wrote this (the companion offer); the friends now travel with her, so it is ignored. */
  companionOffered?: boolean;
  seen: PowerFamily[];
  comboCounts: Record<string, number>;
  gift: Gift | null;
  parkedPlay: ParkedBoard | null;
  phase: Phase;
  finishing: boolean;
  restingSince: number | null;
  /** A lit lantern being played again from the map (DESIGN.md 2d), or an explore lantern ahead (2k); her own lantern is `level`. */
  replay: number | null;
  /** Foreground play time this session, for the timer. */
  sessionElapsedMs: number;
  savedAt: number;
}

/** The Stage 3 save. Read once and carried into v3: the game then opens in Play on a fresh board (DESIGN.md 2d). */
interface SaveV2 {
  v: 2;
  mode: Mode;
  level: number;
  companion: CompanionId;
  companionOffered: boolean;
  seen: PowerFamily[];
  comboCounts: Record<string, number>;
  phase: Phase;
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
  /** `?splash=0` skips the launch picture (screenshots and tests). */
  splash: boolean;
}

export function optionsFromUrl(): AppOptions {
  const q = new URLSearchParams(location.search);
  const level = Number(q.get('level'));
  return {
    debug: q.get('debug') === '1' || location.hash === '#debug',
    seed: q.get('seed') ? Number(q.get('seed')) : null,
    reset: q.get('reset') === '1',
    level: Number.isFinite(level) && level >= 1 ? Math.floor(level) : null,
    splash: q.get('splash') !== '0',
  };
}

export class App {
  // Journey
  private mode: Mode = 'play';
  private pendingMode: Mode | null = null;
  private level = 1;
  /** The lantern being played again, or null when she is playing her own (DESIGN.md 2d). */
  private replay: number | null = null;
  private sessionElapsedMs = 0;
  /** The timer's sleepy stretch has begun. */
  private windingDown = false;
  /** The timer has done its work (or was waved off) for this session; it runs again from New session. */
  private sessionSpent = false;
  private sessionTimer: ReturnType<typeof setInterval> | null = null;
  private appliedSessionMinutes = 0;
  private state: GameState;
  private matches = 0;
  private companion: CompanionId = 'firefly';
  private seen = new Set<PowerFamily>();
  private comboCounts: Record<string, number> = {};
  private gift: Gift | null = null;
  private parkedPlay: ParkedBoard | null = null;
  private phase: Phase = 'playing';
  private finishing = false;
  private finishNowWanted = false;
  // Review mode (development only, review.ts): nothing is saved while it is on.
  private review = reviewOn();
  /** The lantern being looked at in review mode, or null on the review map. */
  private reviewLevel: number | null = null;
  /** Where the review map's camera opens: the lantern last looked at. */
  private reviewAt: number | null = null;
  private readonly reviewBar: ReviewBar;
  private restingSince: number | null = null;
  /** The resting scene's own clock: the lullaby's fade and the wake lock's release (DESIGN.md 3.8). */
  private restTimers: Array<ReturnType<typeof setTimeout>> = [];
  /** The night dimmer (DESIGN.md 3.9): a black sheet over everything whose opacity is the setting. */
  private readonly dimmer: HTMLDivElement;

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
  private discovering = false;
  /** The area the map's view is in (the theme plays in its voice); null until the map reports one. */
  private mapArea: AreaId | null = null;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly opts: AppOptions,
  ) {
    const settings = this.settings.get();
    this.engine.setSilentMode(settings.playOnSilent ? 'ignore' : 'follow');
    const stage = canvas.parentElement ?? document.body;
    this.dimmer = document.createElement('div');
    this.dimmer.id = 'gf-dim';
    this.dimmer.style.opacity = String(settings.nightDim);
    document.body.appendChild(this.dimmer);

    const loaded = opts.reset || opts.level !== null ? null : this.load();
    if (opts.level !== null) {
      this.level = opts.level;
      this.mode = 'play';
      this.phase = 'playing';
      this.finishing = false;
      this.restingSince = null;
    }
    this.state = loaded ?? this.freshState(this.level, this.mode);
    if (!loaded) this.placeLevelGift();
    // The launch picture goes up before the board is built, so it is the first frame she sees. Her tap
    // on the fairy door is the first touch of the launch, so sound unlocks there (DESIGN.md 2f).
    if (opts.splash) {
      new Splash(this.reducedMotion(settings), this.companion, {
        onEnter: () => this.doorOpened(),
        onTwinkle: () => {
          this.unlockAudio();
          this.sounds.twinkle();
        },
      });
    }

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
        onFree: (creature) => this.sounds.freed(creature),
        onSprout: () => this.sounds.sprout(),
      },
      this.reducedMotion(settings),
    );
    this.view.setBreathing(settings.breathingGlow);
    loadGemArt((art) => this.view.setGemArt(art));
    loadPowerArt((art) => this.view.setPowerArt(art));
    this.view.setGoal(this.matches, boardFor(this.mode).goal);
    this.sounds = new GameSounds(this.engine, this.player);
    this.sounds.enabled = settings.chimes;
    this.player.setLevel(settings.musicLevel);
    this.applyArea();

    // The map canvas sits above the board and its touch surface; it is hidden when not in use.
    this.map = new MapScene(createMapCanvas(), nightGarden);
    this.map.setReducedMotion(this.reducedMotion(settings));
    loadMapArt((art) => {
      this.map.setArt(art);
      this.view.setCompanionArt(art.companions);
    });

    const surface = canvas;
    this.input = new PointerInput(surface, {
      cellAt: (x, y) => this.view.cellAt(x, y),
      cellSize: () => this.view.currentLayout.cell,
      onTouch: (x, y) => this.touched(x, y),
      onTap: (cell, x, y) => this.tapped(cell, x, y),
      onSwipe: (from, to) => this.trySwap(from, to),
    });
    // A second chance at the audio unlock on the release of the touch, which every browser counts as a gesture.
    surface.addEventListener('pointerup', () => this.unlockAudio(), { passive: true });
    // Any first touch anywhere (the launch picture, the map) may start the sound: the theme begins the moment
    // she opens the game and flows into the map (an iPhone allows no sound before the first touch).
    document.addEventListener('pointerdown', () => this.unlockAudio(), { passive: true, capture: true });

    // The grown-up gate and the parent panel (DESIGN.md 3.9).
    this.panel = new Panel(stage, this.settings, {
      setCalm: (on) => this.setMode(on ? 'calm' : 'play'),
      finishAfterLevel: () => this.finishAfterLevel(true),
      cancelFinish: () => this.finishAfterLevel(false),
      finishNow: () => this.finishNow(),
      newSession: () => this.newSession(),
      setLantern: (n) => this.goToLantern(n),
      resetProgress: () => this.resetProgress(),
      setReview: (on) => this.setReview(on),
    });
    this.reviewBar = new ReviewBar(stage, {
      toMap: () => this.openReviewMap(),
      area: (dir) => this.map.panArea(dir),
      exit: () => this.setReview(false),
    });
    this.gate = new Gate(stage, { onOpen: () => this.openPanel(), onHoldProgress: (p) => this.view.setMoonHold(p) });
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
    } else if (this.levelDone()) {
      // A save written at the moment the lantern filled: finish that level now.
      this.phase = 'playing';
      this.levelComplete();
    } else if (!this.review) {
      // The game opens on the map at her lantern (the parent, 7 October; DESIGN.md 2f); a tap on it
      // brings back the board exactly as it was left.
      this.openLaunchMap();
    }
    this.sessionTimer = setInterval(() => this.sessionTick(), SESSION_TICK_MS);
    this.save();
    if (this.review) this.openReviewMap();
  }

  /** The lantern whose level is on the board: a replay's, or her own. */
  private get boardLevel(): number {
    return this.reviewLevel ?? this.replay ?? this.level;
  }

  // ------------------------------------------------------------- the board

  private freshState(level: number, mode: Mode): GameState {
    const spec = boardFor(mode);
    const seed = this.opts.seed ?? (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
    // Play (Stage 4, DESIGN.md 3.7): a generated level with picture goals and still obstacles; Calm: the plain board the lantern counts.
    if (mode === 'play') return newLevel(levelFor(level, this.settings.get().playDifficulty, seed), seed, unlockedAt(level));
    return newGame(spec.rows, spec.cols, typesForLevel(level, mode), seed, spec.bias, unlockedAt(level));
  }

  /** The level is won: every picture goal is done (Play), or the lantern has its matches (Calm and plain boards). */
  private levelDone(): boolean {
    return this.state.goals ? goalsDone(this.state.goals) : this.matches >= boardFor(this.mode).goal;
  }

  /** A fresh board for the current lantern, with that lantern's gift if it has one. */
  private startBoard(): void {
    this.state = this.freshState(this.boardLevel, this.mode);
    this.matches = 0;
    this.placeLevelGift();
    this.view.setState(this.state);
    // Between levels the board is fresh (no matches yet); at launch it is the one she left, part way through.
    this.view.setGoal(this.matches, boardFor(this.mode).goal);
    this.applyArea();
  }

  private placeLevelGift(): void {
    const gift = giftAt(this.boardLevel, this.comboCounts);
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
    const area = areaForLevel(this.boardLevel);
    this.view.setArea(areaTheme(area));
    this.view.setGift(this.giftFamilies());
    this.view.setCompanion(this.companion);
    this.sounds.setArea(area);
    this.syncMusic();
  }

  /**
   * Start or move the music to what the moment calls for, and nothing if it already plays: the Glimmerfall
   * theme on the map (and so under the launch picture, which opens on the map), in the voice of the area the
   * view is in, crossing to the next area's voice as she scrolls; the area's lullaby under a level and in rest.
   */
  private syncMusic(): void {
    if (!this.settings.get().music || !this.engine.isRunning) return;
    // The lullaby has already begun its fade in a rest: the night stays silent until New session.
    if (this.phase === 'resting' && this.restAge() >= LULLABY_MS) return;
    if (this.phase === 'map') {
      const area = this.mapArea ?? areaForLevel(this.level);
      if (this.player.isTheme) this.player.setThemeArea(area);
      else void this.player.startTheme(area, THEME_SEED);
    } else {
      const spec = sketchForArea(areaForLevel(this.boardLevel));
      if (this.player.current !== spec) void this.player.start(spec, 4242 + this.boardLevel, this.musicSoft(), null);
    }
    this.player.setLevel(this.settings.get().musicLevel);
  }

  /** The map's view has crossed into another area: the theme follows. */
  private mapAreaChanged(area: AreaId): void {
    this.mapArea = area;
    this.syncMusic();
  }

  // ------------------------------------------------------------------ input

  private touched(x: number, y: number): void {
    if (this.phase !== 'playing') {
      this.unlockAudio();
      return;
    }
    this.view.ripple(x, y);
    this.clearHint();
    this.unlockAudio();
  }

  /** Idempotent: creates the context on the first touch, resumes it after interruptions, starts the music once it runs. */
  private unlockAudio(): void {
    void this.engine.unlock().then(() => this.syncMusic());
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
    if (!isOpen(this.state, b.row, b.col) || !isOpen(this.state, a.row, a.col)) return;
    this.select(null);
    const goal = boardFor(this.mode).goal;
    if (this.view.busy) {
      if (!this.levelDone() && !this.finishNowWanted) this.pending = { a, b }; // never carry a swap across the level's end
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
    let { state, steps } = result;
    const groups = steps.reduce((n, st) => n + (st.kind === 'clear' ? st.groups.length : 0), 0);
    // In the sleepy stretch the lantern fills twice as fast, so the level ends within the window (DESIGN.md 3.8).
    this.matches = Math.min(goal, this.matches + groups * (this.softening() ? 2 : 1));
    // In a Play level the moon helps instead: each move also melts a layer, pops a bubble or drops a seed (DESIGN.md 3.8).
    if (this.softening() && state.goals && !goalsDone(state.goals)) {
      const help = moonHelp(state);
      if (help) {
        state = help.state;
        steps = [...steps, ...help.steps];
      }
    }
    this.state = state;
    this.playSteps(steps);
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
        if (step.kind === 'clear' && !this.state.goals) this.view.setGoal(Math.min(goal, this.view.goalDone + step.groups.length), goal);
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
    if (this.levelDone() || this.finishNowWanted) {
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
      const cells = this.giftCells();
      const [first, second] = cells;
      if (first) {
        // A combination gift still sitting as a pair is swapped by the light, so the combination itself is what she sees.
        const pair = second && Math.abs(first.row - second.row) + Math.abs(first.col - second.col) === 1;
        const result = pair ? applySwap(this.state, first, second) : firePowerAt(this.state, first);
        this.state = result.state;
        this.playSteps(result.steps);
        return;
      }
      this.gift = null;
    }
    // "Finish now, gently" in a Play level: the goal resolves first, so the level's own reward is never skipped (DESIGN.md 3.8).
    if (this.state.goals && !goalsDone(this.state.goals)) {
      const r = resolveLevel(this.state);
      if (r.steps.length > 0) {
        this.state = r.state;
        this.playSteps(r.steps);
        return;
      }
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
    if (this.reviewLevel !== null) {
      this.openReviewMap(); // review mode: a won level goes back to the review map
      return;
    }
    const rest = this.finishing;
    // A replay does not move her on: the map comes back to her own lantern, which simply glows again.
    const from = this.level;
    if (this.replay === null) this.level += 1;
    this.replay = null;
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
    this.map.show({
      from,
      to: this.level,
      companion: this.companion,
      rest,
      restSince: this.restingSince ?? undefined,
      onLight: () => (isFirstLanternOfArea(this.level) ? this.sounds.areaArrive(areaForLevel(this.level)) : this.sounds.lanternLit()),
      onPick: (id) => this.pickCompanion(id),
      onTwinkle: () => this.twinkle(),
      onArea: rest ? undefined : (a) => this.mapAreaChanged(a),
      onDone: () => this.leaveMap(),
      onReplay: (n) => this.startReplay(n),
    });
    this.applySoftening();
    if (rest) this.scheduleRest();
    else this.syncMusic();
  }

  // ------------------------------------------------------------------ rest

  /** How long the resting scene has been up, in ms (0 outside rest). */
  private restAge(): number {
    return this.phase === 'resting' && this.restingSince !== null ? Math.max(0, Date.now() - this.restingSince) : 0;
  }

  /**
   * The resting scene's timing (DESIGN.md 3.8): the lullaby fades to silence over about half a
   * minute, the twinkle chimes stop after two minutes, and after ten the screen wake lock is
   * released so the phone can lock itself and the scene does almost no work. Timed from when the
   * rest began, so a relaunch carries on where the night was.
   */
  private scheduleRest(): void {
    this.clearRestTimers();
    const age = this.restAge();
    const fadeAt = LULLABY_MS - age;
    if (fadeAt > -LULLABY_FADE_S * 1000) this.restTimers.push(setTimeout(() => this.player.fadeOut(Math.min(LULLABY_FADE_S, LULLABY_FADE_S + fadeAt / 1000)), Math.max(0, fadeAt)));
    else this.player.stop(2);
    this.restTimers.push(setTimeout(() => {
      void this.wakeLock?.release().catch(() => undefined);
      this.wakeLock = null;
    }, Math.max(0, REST_DEEP_MS - age)));
  }

  private clearRestTimers(): void {
    for (const t of this.restTimers) clearTimeout(t);
    this.restTimers = [];
  }

  /** A tap on the resting scene: a star twinkles, and for the first two minutes a very soft chime. */
  private twinkle(): void {
    if (this.phase === 'resting' && this.restAge() >= REST_QUIET_MS) return;
    this.sounds.twinkle();
  }

  /** The softening is on while she plays in the sleepy stretch, or after "Finish after this level", if the parent keeps wind-down on. */
  private softening(): boolean {
    return this.phase === 'playing' && this.settings.get().windDown && (this.windingDown || this.finishing);
  }

  /** The music's sleepy form: through the softening and the whole rest. */
  private musicSoft(): boolean {
    return this.softening() || this.phase === 'resting';
  }

  /** Point the board, the chimes and the music at the softening as it stands now (DESIGN.md 3.8). */
  private applySoftening(): void {
    const soft = this.softening();
    this.view.setWindDown(soft);
    this.sounds.setSoft(soft);
    this.player.setWindDown(this.musicSoft());
  }

  /**
   * A lit lantern tapped on the map: play that level again; her own lantern stays where it is (DESIGN.md 2d).
   * Also an explore lantern ahead of her (the first of an area she has not reached, DESIGN.md 2k): the same
   * replay, so winning it celebrates but never moves her on.
   */
  private startReplay(n: number): void {
    if (this.phase !== 'map' || !canPlayFromMap(n, this.level)) return;
    if (this.pendingMode) {
      this.mode = this.pendingMode;
      this.pendingMode = null;
    }
    this.replay = n;
    this.pending = null;
    this.map.hide();
    this.phase = 'playing';
    this.startBoard();
    this.view.start();
    this.save();
    this.armHint();
  }

  /** The board must belong to the mode she is in: a switch made on the map or in rest takes effect here. */
  private ensureBoardForMode(): void {
    if (this.pendingMode) {
      this.mode = this.pendingMode;
      this.pendingMode = null;
    }
    const spec = boardFor(this.mode);
    if (this.state.rows !== spec.rows || this.state.cols !== spec.cols) {
      this.state = this.freshState(this.boardLevel, this.mode);
      this.matches = 0;
      this.placeLevelGift();
    }
  }

  private leaveMap(): void {
    this.ensureBoardForMode();
    this.map.hide();
    this.phase = 'playing';
    this.view.setState(this.state);
    // Between levels the board is fresh (no matches yet); at launch it is the one she left, part way through.
    this.view.setGoal(this.matches, boardFor(this.mode).goal);
    this.applyArea();
    this.view.start();
    this.save();
    this.armHint();
  }

  /**
   * She opened the fairy door on the launch picture: the moment the game begins. The first touch of
   * the launch, so this is where sound may start (a warm chord now; the theme music hooks in here).
   */
  private doorOpened(): void {
    this.unlockAudio();
    this.sounds.lanternLit();
  }

  /** At launch: the map waits at her lantern, already lit, until she taps it; the board she left comes back as it was. */
  private openLaunchMap(): void {
    this.phase = 'map';
    this.pending = null;
    this.view.stop();
    this.map.show({
      from: this.level,
      to: this.level,
      companion: this.companion,
      rest: false,
      arrive: false,
      onPick: (id) => this.pickCompanion(id),
      onTwinkle: () => this.sounds.twinkle(),
      onArea: (a) => this.mapAreaChanged(a),
      onDone: () => this.leaveMap(),
      onReplay: (n) => this.startReplay(n),
    });
    this.syncMusic();
  }

  /** The resting scene on a relaunch while she is still "asleep". */
  private showRest(): void {
    this.view.stop();
    this.map.show({
      from: this.level,
      to: this.level,
      companion: this.companion,
      rest: true,
      restSince: this.restingSince ?? undefined,
      onTwinkle: () => this.twinkle(),
      onDone: () => undefined,
    });
    this.applySoftening();
    this.scheduleRest();
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
      calm: this.mode === 'calm',
      calmPending: this.pendingMode === 'calm' ? true : this.pendingMode === 'play' ? false : null,
      level: this.level,
      replay: this.replay,
      areaName: AREA_NAMES[areaForLevel(this.level)],
      resting: this.phase === 'resting',
      finishing: this.finishing,
      windingDown: this.windingDown,
      sessionLeftMs: this.sessionLeftMs(),
      buildDate: __BUILD_DATE__,
      offlineReady: !!navigator.serviceWorker?.controller,
      audio: `${s.state}${this.player.currentId ? ', music' : ''}`,
      review: this.review,
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
        this.parkedPlay = { level: this.boardLevel, state: serialize(this.state), matches: this.matches, gift: this.gift };
        this.mode = 'calm';
        this.pendingMode = null;
        this.pending = null;
        this.startBoard();
        this.armHint();
      } else {
        this.mode = 'calm';
        this.pendingMode = null;
      }
    } else if (this.parkedPlay && this.parkedPlay.level === this.boardLevel && this.phase === 'playing') {
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
    // "Keep playing" during the timer's sleepy stretch waves the timer off until the next session.
    if (!on && this.windingDown) this.endWindDown(true);
    // The softening begins at once, so it coincides with her finishing (DESIGN.md 3.8).
    this.applySoftening();
    this.save();
    this.panel.update(this.panelContext());
  }

  // ------------------------------------------------------------ the timer

  private sessionTotalMs(): number {
    return this.settings.get().sessionMinutes * 60 * 1000;
  }

  /** Time left in a timed session, or null when there is no timer (or it has done its work). */
  private sessionLeftMs(): number | null {
    const total = this.sessionTotalMs();
    if (total <= 0 || this.sessionSpent) return null;
    return Math.max(0, total - this.sessionElapsedMs);
  }

  /**
   * The session timer (DESIGN.md 3.8, 2d). Time counts only while she is actually playing in the
   * foreground. The sleepy stretch (the last four minutes, or half of a short session) softens the
   * game and makes the current level the last; when the time is up the level ends gently. A relaunch
   * within half an hour carries the clock on; New session starts it again.
   */
  private sessionTick(): void {
    const total = this.sessionTotalMs();
    if (this.review || total <= 0 || this.sessionSpent || this.phase !== 'playing' || document.hidden || this.panel.isOpen) return;
    this.sessionElapsedMs += SESSION_TICK_MS;
    const windDownAt = total - Math.min(WIND_DOWN_MS, total / 2);
    if (!this.windingDown && this.settings.get().windDown && this.sessionElapsedMs >= windDownAt) this.beginWindDown();
    if (this.sessionElapsedMs >= total) {
      this.sessionSpent = true;
      this.finishNow();
    }
    if (this.sessionElapsedMs % 10_000 === 0) this.save();
  }

  private beginWindDown(): void {
    this.windingDown = true;
    this.finishing = true;
    this.applySoftening();
    this.save();
    this.panel.update(this.panelContext());
  }

  /** The softening lifts (she is resting, or a grown-up waved it off). */
  private endWindDown(spent: boolean): void {
    this.windingDown = false;
    if (spent) this.sessionSpent = true;
    this.applySoftening();
  }

  /** The session length changed on the panel: the clock starts again from now. */
  private restartSession(): void {
    this.sessionElapsedMs = 0;
    this.sessionSpent = false;
    if (this.windingDown) {
      this.finishing = false;
      this.endWindDown(false);
    }
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
    this.sessionElapsedMs = 0;
    this.sessionSpent = false;
    this.windingDown = false;
    this.clearRestTimers();
    this.panel.close();
    if (this.phase === 'resting') this.leaveMap();
    this.applySoftening();
    this.syncMusic();
  }

  // ------------------------------------------------------ review mode
  // Development only (review.ts). Her saved game is written once on the way in and never
  // again while review is on; turning it off reloads, which reopens exactly that save.

  private setReview(on: boolean): void {
    if (on === this.review) return;
    if (on) {
      this.save();
      this.review = true;
      setReviewFlag(true);
      this.panel.close();
      this.openReviewMap();
    } else {
      setReviewFlag(false);
      location.reload();
    }
  }

  /** The whole map, every lantern lit and tappable, drag to look around. `at` keeps the camera where she was. */
  private openReviewMap(): void {
    const at = this.reviewAt ?? this.level;
    this.reviewLevel = null;
    this.clearHint();
    this.select(null);
    this.pending = null;
    this.view.stop();
    this.phase = 'map';
    this.reviewBar.show('map');
    this.map.show({
      from: at,
      to: at,
      companion: this.companion,
      rest: false,
      onPick: (id) => this.pickCompanion(id),
      onTwinkle: () => this.sounds.twinkle(),
      onArea: (a) => this.mapAreaChanged(a),
      onDone: () => undefined,
      review: { onOpen: (n) => this.openReviewLevel(n) },
    });
    this.syncMusic();
  }

  private openReviewLevel(n: number): void {
    this.reviewAt = n;
    this.reviewLevel = n;
    this.pending = null;
    this.map.hide();
    this.phase = 'playing';
    this.startBoard();
    this.view.start();
    this.reviewBar.show('level');
    this.armHint();
  }

  /** Map position: the recovery tool if the phone ever loses the save (DESIGN.md 3.9). */
  private goToLantern(n: number): void {
    this.level = Math.max(1, Math.floor(n));
    this.replay = null;
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
      localStorage.removeItem(SAVE_KEY_V2);
      localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      /* nothing to remove */
    }
    this.companion = 'firefly';
    this.seen.clear();
    this.comboCounts = {};
    this.mode = 'play';
    this.goToLantern(1);
  }

  private reducedMotion(s: Settings): boolean {
    if (s.reducedMotion === 'on') return true;
    if (s.reducedMotion === 'off') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private applySettings(s: Settings): void {
    if (s.sessionMinutes !== this.appliedSessionMinutes) {
      this.appliedSessionMinutes = s.sessionMinutes;
      this.restartSession();
    }
    this.engine.setSilentMode(s.playOnSilent ? 'ignore' : 'follow');
    this.sounds.enabled = s.chimes;
    if (s.music) this.syncMusic();
    else if (this.player.currentId) this.player.stop(1.2);
    this.view.setReducedMotion(this.reducedMotion(s));
    this.map.setReducedMotion(this.reducedMotion(s));
    this.view.setBreathing(s.breathingGlow);
    this.dimmer.style.opacity = String(Math.max(0, Math.min(0.75, s.nightDim)));
    this.applySoftening();
    this.armHint();
  }

  /** The rest-until setting in ms, or null for "until a grown-up unlocks" (DESIGN.md 3.8). */
  private restUntilMs(): number | null {
    const minutes = this.settings.get().restUntilMinutes;
    return minutes > 0 ? minutes * 60 * 1000 : null;
  }

  // ------------------------------------------------------------------- save

  private load(): GameState | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      const save = raw ? (JSON.parse(raw) as Save) : this.migrateV2() ?? this.migrateLegacy();
      if (!save || save.v !== 3) return null;
      const now = Date.now();
      const gap = now - save.savedAt;
      this.level = Number.isFinite(save.level) ? Math.max(1, Math.floor(save.level)) : 1;
      this.companion = save.companion ?? 'firefly';
      this.seen = new Set(save.seen ?? []);
      this.comboCounts = save.comboCounts ?? {};
      this.parkedPlay = save.parkedPlay ?? null;
      this.mode = save.mode ?? 'play';
      this.pendingMode = save.pendingMode ?? null;
      this.finishing = !!save.finishing;
      this.replay = Number.isFinite(save.replay) && save.replay !== null && canPlayFromMap(Math.floor(save.replay), this.level) ? Math.floor(save.replay) : null;
      // The session clock carries across a short break (she closed and reopened the app), not a long one.
      this.sessionElapsedMs = gap <= SESSION_CARRY_MS && Number.isFinite(save.sessionElapsedMs) ? Math.max(0, save.sessionElapsedMs) : 0;
      this.appliedSessionMinutes = this.settings.get().sessionMinutes;

      // Resting comes first (DESIGN.md 3.8): the sleeping scene stays until the rest-until time has passed.
      const restUntil = this.restUntilMs();
      if (save.phase === 'resting' && save.restingSince !== null && (restUntil === null || now - save.restingSince < restUntil)) {
        this.phase = 'resting';
        this.restingSince = save.restingSince;
        this.gift = save.gift ?? null;
        const state = deserialize(save.state);
        return state ? ensurePlayable(state).state : null;
      }
      this.finishing = false;
      this.phase = 'playing';
      if (this.opts.seed !== null) return null;

      // The game opens as it was left (DESIGN.md 2d): the same board, mode and place on the path, however long the gap.
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

  /** A Stage 3 save: keep her journey, companion and discoveries; the game now opens in Play on a fresh board (DESIGN.md 2d). */
  private migrateV2(): Save | null {
    try {
      const raw = localStorage.getItem(SAVE_KEY_V2);
      if (!raw) return null;
      const old = JSON.parse(raw) as SaveV2;
      if (old.v !== 2) return null;
      return {
        v: 3,
        mode: 'play',
        pendingMode: null,
        level: old.level,
        state: '',
        matches: 0,
        companion: old.companion ?? 'firefly',
        seen: old.seen ?? [],
        comboCounts: old.comboCounts ?? {},
        gift: null,
        parkedPlay: null,
        phase: old.phase === 'resting' ? 'resting' : 'playing',
        finishing: false,
        restingSince: old.restingSince ?? null,
        replay: null,
        sessionElapsedMs: 0,
        savedAt: old.savedAt ?? 0,
      };
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
        v: 3,
        mode: 'play',
        pendingMode: null,
        level: old.level,
        state: '',
        matches: 0,
        companion: old.companion ?? 'firefly',
        seen: ['comet', 'orb'],
        comboCounts: {},
        gift: null,
        parkedPlay: null,
        phase: 'playing',
        finishing: false,
        restingSince: null,
        replay: null,
        sessionElapsedMs: 0,
        savedAt: 0,
      };
    } catch {
      return null;
    }
  }

  private save(): void {
    if (this.review) return; // review mode never touches her saved game
    try {
      const save: Save = {
        v: 3,
        mode: this.mode,
        pendingMode: this.pendingMode,
        level: this.level,
        state: serialize(this.state),
        matches: this.matches,
        companion: this.companion,
        seen: [...this.seen],
        comboCounts: this.comboCounts,
        gift: this.gift,
        parkedPlay: this.parkedPlay,
        phase: this.phase,
        finishing: this.finishing,
        restingSince: this.restingSince,
        replay: this.replay,
        sessionElapsedMs: this.sessionElapsedMs,
        savedAt: Date.now(),
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      localStorage.removeItem(SAVE_KEY_V2);
      localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch {
      /* storage can be unavailable in private mode; the game still plays */
    }
  }

  private setupDebug(): void {
    const stageHeight = (): number => document.getElementById('stage')?.getBoundingClientRect().height ?? 0;
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
      completeLevel: () => {
        this.matches = boardFor(this.mode).goal;
        if (this.state.goals) this.state = { ...this.state, goals: this.state.goals.map((g) => ({ ...g, done: g.total })) };
        if (!this.view.busy) this.levelComplete();
      },
      pendingMode: () => this.pendingMode,
      mode: () => this.mode,
      replay: () => this.replay,
      sessionLeft: () => this.sessionLeftMs(),
      windingDown: () => this.windingDown,
      /** Testing: pretend this much foreground play has passed. */
      elapse: (ms: number) => {
        this.sessionElapsedMs += ms - SESSION_TICK_MS;
        this.sessionTick();
      },
      goTo: (n: number) => this.goToLantern(n),
      continueMap: () => (this.phase === 'map' ? this.map.continueNow() : undefined),
      /** Testing: show the resting scene as if it began this long ago. */
      restFor: (ms: number) => {
        this.phase = 'resting';
        this.restingSince = Date.now() - ms;
        this.finishing = true;
        this.showRest();
      },
      restAge: () => this.restAge(),
      softening: () => this.softening(),
      music: () => this.player.currentId,
      musicMix: () => this.player.themeMix,
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
        `music ${this.player.currentId ?? 'off'} sr ${s.sampleRate}`,
        `lantern ${this.level}${this.replay !== null ? ' replaying ' + this.replay : ''} ${areaForLevel(this.boardLevel)} ${this.mode}${this.pendingMode ? ' -> ' + this.pendingMode : ''} ${this.phase}${this.windingDown ? ' winding down' : ''}`,
        `session ${this.sessionLeftMs() === null ? 'off' : Math.ceil((this.sessionLeftMs() ?? 0) / 1000) + 's left'}`,
        `matches ${this.matches}/${boardFor(this.mode).goal} moves ${this.state.moves} gift ${gift}`,
        `unlocked ${this.state.unlocked.join(',')} seen ${[...this.seen].join(',')}`,
        `standalone ${String(nav.standalone ?? 'n/a')} sw ${navigator.serviceWorker?.controller ? 'yes' : 'no'} update ${document.documentElement.dataset.update ?? '-'}`,
        `screen ${screen.width}x${screen.height} inner ${innerWidth}x${innerHeight} visual ${Math.round(window.visualViewport?.height ?? 0)} stage ${Math.round(stageHeight())} sab ${getComputedStyle(document.documentElement).getPropertyValue('--sab').trim()}`,
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
    void this.engine.resume().then(() => this.syncMusic());
    if (this.phase === 'playing') this.view.start();
    else this.map.start();
    if (this.phase === 'resting') this.scheduleRest();
    this.armHint();
    void this.requestWakeLock();
  }

  private async requestWakeLock(): Promise<void> {
    try {
      const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
      if (!nav.wakeLock || document.hidden) return;
      // Deep in a rest the phone may lock itself (DESIGN.md 3.8, battery).
      if (this.phase === 'resting' && this.restAge() >= REST_DEEP_MS) return;
      this.wakeLock = await nav.wakeLock.request('screen');
    } catch {
      /* not available or not allowed yet; Guided Access covers it */
    }
  }

  destroy(): void {
    if (this.sessionTimer !== null) clearInterval(this.sessionTimer);
    this.input.destroy();
    this.gate.destroy();
    this.panel.destroy();
    this.view.stop();
    this.map.stop();
  }
}
