/**
 * The map between levels (DESIGN.md 3.5, rebuilt as the islands in the night
 * sky of DESIGN.md 2l and STYLE.md "The map"): one painted floating island per
 * area, hanging one above the next in a code-drawn night sky, and between
 * them a trail of glowing stars, one per level, climbing from each island to
 * the underside of the next. The code draws the sky, lights the stars she has
 * reached, hovers her companion over her star, flies it along the trail to the
 * next star, and draws all the light. Nothing moves on by itself: the map
 * stays until she taps her lit star (or her companion on it), and after a
 * moment the star breathes as the invitation. The other two
 * creatures travel with her (the parent, 7 October): they trail along the path
 * behind her hop and wait beside her at every star, and a tap on one swaps
 * it in as her companion, on the map and on the board alike. In rest
 * (DESIGN.md 3.8) all three curl up and sleep on her star and the scene stays
 * until the app hides it.
 *
 * The map can be scrolled with a finger (the parent, 7 October: scrolling
 * along the path should be a calm delight in itself): the sky follows the
 * finger, a fling carries on gently with a cap on its speed, the ends of the
 * known world give softly, and after a long pause the view drifts home to her
 * lantern. Behind her lantern it reaches back to the first island; ahead it
 * runs on through every area of her pass (the parent, 9 October: she can
 * look around the whole map and play the first level of each area ahead,
 * just for exploring). Those explore stars glimmer softly, half-lit, so she
 * can tell they can be tapped; the rest of the trail ahead stays dim.
 *
 * A full-screen canvas overlay, display:none while not in use so it costs
 * nothing. It draws at full rate only while something moves and at a slow
 * idle tick otherwise (DESIGN.md 4.4). No text, ever.
 */
import './mapScene.css';
import { LANTERNS_PER_AREA, type AreaId, exploreLanterns, passEnd } from '../core/journey';
import { areaTheme, blendThemeColors, type AreaTheme } from '../render/areas';
import { COMPANIONS, type CompanionId, type CompanionOpts, drawCompanion, drawPaintedCompanion } from '../render/creatures';
import { type IslandArt, type MapArt, loadIslandArt } from '../render/mapArt';
import { ISLAND_SIZE, WORLD_W, areaStartLantern, areaUnderView, islandRect, lanternWorld, pathBetween, pathPolyline, passStageTop, stageAt, stageBlend } from '../render/mapWorld';
import type { Pt } from '../render/shapes';
import { Stars, clamp01, easeInOutSine, easeOutCubic, glowDisc } from '../render/styles/common';
import { rgba } from '../render/color';
import { createRng } from '../shared/rng';
import type { Ambient, GemStyle } from '../render/styles/types';

export interface MapShowOptions {
  /** The lantern she just lit (where the companion starts) and the one she hops to. */
  from: number;
  to: number;
  companion: CompanionId;
  /** The resting scene: she falls asleep on the new lantern and the scene never ends on its own. */
  rest: boolean;
  /** When the rest began (Date.now()), so the night deepens at two and ten minutes however the app was relaunched (DESIGN.md 3.8). */
  restSince?: number;
  /** The moment the new lantern lights (the app plays a warm chord). */
  onLight?(): void;
  /** She tapped one of the friends travelling with her; it is now her companion. */
  onPick?(id: CompanionId): void;
  /** A tap in the resting scene made a star twinkle (the app plays a very soft chime). */
  onTwinkle?(): void;
  /** The scene is finished (never called in rest). */
  onDone(): void;
  /** She tapped a lit lantern behind her, or an explore lantern ahead: play that level (the journey does not move). */
  onReplay?(level: number): void;
  /** The view has scrolled into another area (the theme changes voice; called once per crossing, and once at show). */
  onArea?(area: AreaId): void;
  /** Review mode (development only, see review.ts): every lantern is lit and tappable, the map can be dragged. */
  review?: { onOpen(level: number): void };
  /**
   * False at launch (DESIGN.md 2f): she is already at `to`, so there is no hop and no bloom; the map
   * simply waits with her lantern lit, breathing the invitation to tap it, lit lanterns behind her replayable.
   */
  arrive?: boolean;
}

// Timings from DESIGN.md 3.5 and the Stage 3 brief.
const ENTER_MS = 500;
const HOP_MS = 900;
const BLOOM_MS = 700;
const LAND_MS = 280;
/** After the lantern lights, it starts to breathe as the invitation to tap it. */
const INVITE_AFTER_MS = 2500;
/** Breathing pace of the invitation (DESIGN.md 3.8: about eight breaths a minute). */
const INVITE_PERIOD_MS = 7500;
/** Generous target around her lit star and the companion over it, in CSS px. */
const LANTERN_HIT = 72;
const WAVE_AFTER_HOP_MS = 2200;
const SLEEP_AFTER_MS = 1500;
const SLEEP_MS = 2200;
const TWINKLE_MS = 1400;
/** The resting scene's night (DESIGN.md 3.8): the screen dims further after two minutes and settles to a near-black night after ten. */
const REST_DIM_AT_MS = 2 * 60_000;
const REST_DEEP_AT_MS = 10 * 60_000;
const REST_DIM = 0.3;
const REST_DEEP = 0.6;
const HIDE_MS = 450;
/** Review mode (review.ts): the farthest lantern the map shows, two passes through the seven areas. */
const REVIEW_TOP = 140;
/** Taps during the fade-in are the tail of a board tap, not a wish to move on. */
const TAP_GUARD_MS = 400;

// Touch rules shared with the board (src/game/input.ts, DESIGN.md 3.3).
const TAP_MAX_MS = 700;
const TAP_MAX_PX = 12;
const PARK_AFTER_MS = 500;
const PARK_STILL_PX = 6;
/** Generous target around a travelling friend, in CSS px (a five-year-old's whole fingertip). */
const FRIEND_HIT = 60;
/** The friends set off a little after her, one behind the other. */
const FRIEND_LAG_MS = 240;
/** A friend's hop is a little lower than hers. */
const FRIEND_HOP = 0.7;

const IDLE_FPS = 12;
const EMPTY_SET: ReadonlySet<number> = new Set();

// Composition: her star a little below the middle of the screen (DESIGN.md 3.5).
const BASELINE = 0.56;
// Sizes on screen (CSS px): a level star's radius, the companion and the friends flying with her
// (STYLE.md: in the sky the companions read at about a fifth of the width).
const STAR_R = 13;
const COMPANION_S = 84;
const FRIEND_S = 66;
const HOP_HEIGHT = 70;
/** The companion hovers this far above her star, so the star shows under her feet. */
const HOVER = 10;
/** Sky parallax: the far stars move this share of the islands' speed. */
const SKY_PARALLAX = 0.3;

// Scrolling feel (the parent, 7 October): the pages follow the finger; a fling keeps going gently and is
// capped so a quick flick never races; the view drifts home after a pause.
/** Fastest the view may travel on its own, in screen heights per second. */
const MAX_FLING_SCREENS_PER_S = 1.6;
/** Fling friction: the share of speed left after each second. */
const FLING_DECAY_PER_S = 0.12;
/** Below this speed (CSS px/s) a fling has stopped. */
const FLING_STOP = 12;
/**
 * How long after the finger lifts (and the fling ends) before the view drifts home. Long, so the map
 * never slides away from under her while she is looking around (the parent, 9 October); it only comes
 * back once the phone has clearly been left alone.
 */
const HOME_AFTER_MS = 15_000;
/** The drift home's pace: the time, in ms, for most of the way; slow enough to read as a stroll, not a snap. */
const HOME_DRIFT_MS = 1100;
/** The explore stars' glimmer: how lit they sit (0 dark, 1 her own) and how much they breathe. */
const EXPLORE_LIT = 0.36;
const EXPLORE_BREATH = 0.14;
const EXPLORE_PERIOD_MS = 6200;
/** Beyond the ends of the known world the pages give only this much of the finger's movement. */
const EDGE_GIVE = 0.35;
/** How much of the unlit path shows above her lantern, in screen heights. */
const LOOK_AHEAD = 0.55;

type Phase = 'idle' | 'enter' | 'hop' | 'linger' | 'done';

interface Tracked {
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  moved: boolean;
  /** For the fling: the last movement and when it happened. */
  lastDy: number;
  lastT: number;
  vy: number;
}

interface Friend {
  id: CompanionId;
  /** Where it stands relative to the star she is at, in world pixels (behind her along the trail, to one side). */
  offset: Pt;
}

interface Swap {
  incoming: CompanionId;
  outgoing: CompanionId;
  /** The spot they trade, in world pixels, and its place in the line for the one stepping back. */
  at: Pt;
  offset: Pt;
  t: number;
}

interface Twinkle {
  x: number;
  y: number;
  t: number;
  seed: number;
}

/** Create the overlay canvas and append it to the stage (or the body when there is no stage). */
export function createMapCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'mapScene';
  canvas.setAttribute('aria-hidden', 'true');
  (document.getElementById('stage') ?? document.body).appendChild(canvas);
  return canvas;
}

export class MapScene {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private w = 402;
  private h = 874;
  private shown = false;
  private running = false;
  /** Reduce Motion (DESIGN.md 4.4): the hop, the bloom and the landing run shorter. */
  private motion = 1;
  private active = false;
  private raf = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private lastNow = 0;
  private time = 0;

  private opts: MapShowOptions | null = null;
  private phase: Phase = 'idle';
  private phaseT = 0;
  private companion: CompanionId = 'firefly';
  private litTo = false;
  private bloomT = -1;
  private landT = -1;
  private friends: Friend[] = [];
  /** Milliseconds since her hop began; the friends' own hops trail it and run on into the linger. */
  private travelT = -1;
  private swap: Swap | null = null;
  private twinkles: Twinkle[] = [];
  private sleepiness = 0;

  private readonly ambients = new Map<AreaId, Ambient>();
  private restStars: Stars | null = null;
  private readonly pointers = new Map<number, Tracked>();
  private primary: number | null = null;

  /** Painted pieces (art round two and the summit); anything missing is drawn in code. */
  private art: MapArt | null = null;
  private readonly islands: IslandArt;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: GemStyle,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.islands = loadIslandArt(() => this.wake());
    canvas.classList.add('mapScene');
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.cancel);
    // touch-action: none (CSS) stops scroll and zoom. No preventDefault on touchstart (iOS click rules).
    const block = (e: Event): void => e.preventDefault();
    canvas.addEventListener('gesturestart', block);
    canvas.addEventListener('contextmenu', block);
    canvas.addEventListener('dblclick', block);
    this.resize();
  }

  get visible(): boolean {
    return this.shown;
  }

  show(opts: MapShowOptions): void {
    if (this.hideTimer !== null) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.opts = opts;
    this.companion = opts.companion;
    this.phase = 'enter';
    this.phaseT = 0;
    this.litTo = false;
    this.bloomT = -1;
    this.landT = -1;
    this.swap = null;
    this.travelT = -1;
    this.twinkles = [];
    this.sleepiness = 0;
    this.camera = this.floored(lanternWorld(opts.from).y);
    this.panTarget = null;
    this.fling = 0;
    this.sinceTouch = 0;
    if (opts.review || (opts.arrive === false && !opts.rest)) {
      // Review mode (review.ts), or the launch: no hop and no bloom, the map is simply there with her lantern lit.
      this.phase = 'linger';
      this.litTo = true;
    }
    this.friends = this.layoutFriends();
    this.areaReported = null;
    this.reportArea();
    this.pointers.clear();
    this.primary = null;
    this.shown = true;
    this.canvas.style.display = 'block';
    this.resize();
    // A layout read between display and the class change lets the opacity transition run.
    void this.canvas.offsetWidth;
    this.canvas.classList.add('is-shown');
    // start() may already have been called while hidden (visibility), so wake explicitly.
    this.running = true;
    this.lastNow = performance.now();
    this.wake();
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.canvas.classList.remove('is-shown');
    this.stop();
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.canvas.style.display = 'none';
      this.phase = 'idle';
      this.opts = null;
    }, HIDE_MS);
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(280, Math.floor(rect.width || window.innerWidth));
    this.h = Math.max(400, Math.floor(rect.height || window.innerHeight));
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ambients.clear();
    this.restStars = null;
    this.skyField = null;
    if (this.shown) this.draw();
  }

  /** Resume drawing (the app calls this when the page becomes visible again). */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.wake();
  }

  /** Stop all drawing, for example while the page is hidden. The sequence pauses with it. */
  stop(): void {
    this.running = false;
    this.active = false;
    cancelAnimationFrame(this.raf);
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  setReducedMotion(on: boolean): void {
    this.motion = on ? 0.6 : 1;
  }

  setArt(art: MapArt): void {
    this.art = art;
    this.wake();
  }

  // ---------------------------------------------------------------- layout

  /** The world y (picture px) shown at the screen's baseline. */
  private camera = 0;
  /** Review mode: where a glide between areas is heading (a lantern number), or null. */
  private panTarget: number | null = null;
  /** The fling's speed in world px per second (positive: the view travels up the journey). */
  private fling = 0;
  /** Milliseconds since the last finger lifted; the view drifts home after a pause. */
  private sinceTouch = 0;
  /** The area last reported through onArea, so a crossing is reported once. */
  private areaReported: AreaId | null = null;
  /** The explore lanterns for her current lantern (exploreSet). */
  private explore: Set<number> = new Set();
  private exploreFor = -1;

  /** World pixels to screen pixels: the world fills the width. */
  private get scale(): number {
    return this.w / WORLD_W;
  }

  private toScreen(p: Pt): Pt {
    return { x: p.x * this.scale, y: this.h * BASELINE - (p.y - this.camera) * this.scale };
  }

  private toWorldY(sy: number): number {
    return this.camera + (this.h * BASELINE - sy) / this.scale;
  }

  /**
   * Where the view may travel: from a little below the first island to the top of the last island of
   * her pass through the seven areas, so she can look around the whole map (all of it to REVIEW_TOP in
   * review mode). In rest only a little above her star.
   */
  private cameraRange(): { lo: number; hi: number } {
    const opts = this.opts;
    // Scrolled all the way back, a breath of sky shows under the first island.
    const lo = (this.h * (1 - BASELINE)) / this.scale - ISLAND_SIZE * 0.12;
    let hi: number;
    if (opts?.review) {
      hi = lanternWorld(REVIEW_TOP).y;
    } else if (opts && !opts.rest) {
      // Scrolled all the way on, the last island of her pass sits whole near the top of the screen.
      const here = Math.max(opts.from, opts.to);
      hi = Math.max(lanternWorld(here).y + (this.h * LOOK_AHEAD) / this.scale, passStageTop(passEnd(here)) + ISLAND_SIZE * 0.08 - (this.h * BASELINE) / this.scale);
    } else {
      hi = lanternWorld(opts ? Math.max(opts.from, opts.to) : 1).y + (this.h * LOOK_AHEAD) / this.scale;
    }
    return { lo, hi: Math.max(lo, hi) };
  }

  /** The explore lanterns (the first of each area ahead of her), or none in review mode and rest. */
  private exploreSet(): ReadonlySet<number> {
    const opts = this.opts;
    if (!opts || opts.review || opts.rest) return EMPTY_SET;
    const here = Math.max(opts.from, opts.to);
    if (this.exploreFor !== here) {
      this.exploreFor = here;
      this.explore = new Set(exploreLanterns(here));
    }
    return this.explore;
  }

  /** A camera height no lower than the first island's floor, so the first stars are never framed over empty sky. */
  private floored(y: number): number {
    return Math.max(this.cameraRange().lo, y);
  }

  /** Where the view rests on its own: her lantern (the one she hops to once it is lit). */
  private get home(): number {
    const opts = this.opts;
    if (!opts) return 0;
    return this.floored(lanternWorld(this.litTo ? opts.to : opts.from).y);
  }

  /** The screen point of star n. */
  private starOf(n: number): Pt {
    return this.toScreen(lanternWorld(n));
  }

  /** The screen point a companion hovers at for star n: just above the star, so it shows under her feet. */
  private perchOf(n: number): Pt {
    const s = this.starOf(n);
    return { x: s.x, y: s.y - HOVER };
  }

  /**
   * The two friends travelling with her stand a little behind her on the
   * path, one to each side. Deterministic, so the group always looks the same.
   */
  private layoutFriends(): Friend[] {
    const others = COMPANIONS.filter((c) => c !== this.companion);
    const side = (FRIEND_S * 1.4) / this.scale;
    const back = (FRIEND_S * 1.05) / this.scale;
    const slots: Pt[] = [
      { x: -side, y: -back },
      { x: side, y: -back * 1.7 },
    ];
    return others.map((id, i) => ({ id, offset: slots[i] as Pt }));
  }

  /** A friend's world point: its offset from where she is, kept on the page. */
  private friendWorld(f: Friend, anchor: Pt): Pt {
    const margin = (FRIEND_S * 0.8) / this.scale;
    return { x: Math.min(WORLD_W - margin, Math.max(margin, anchor.x + f.offset.x)), y: anchor.y + f.offset.y };
  }

  /** Where the group stands when nobody is hopping: her star. */
  private groupAnchor(): Pt {
    const opts = this.opts;
    if (!opts) return { x: 0, y: 0 };
    return lanternWorld(this.litTo ? opts.to : opts.from);
  }

  /**
   * A friend following her hop, trailing it by its place in the line: its world point, how far
   * through its own hop it is (0..1, 1 when landed) and how long ago it landed.
   */
  private friendTravel(i: number): { at: Pt; k: number; sinceLand: number } {
    const opts = this.opts;
    const f = this.friends[i] as Friend;
    const lag = FRIEND_LAG_MS * (i + 1);
    if (!opts || this.travelT < 0 || opts.from === opts.to) return { at: this.friendWorld(f, this.groupAnchor()), k: 1, sinceLand: -1 };
    const k = clamp01((this.travelT - lag) / (HOP_MS * this.motion));
    const anchor = k <= 0 ? lanternWorld(opts.from) : k >= 1 ? lanternWorld(opts.to) : pathBetween(opts.from, opts.to, easeInOutSine(k));
    return { at: this.friendWorld(f, anchor), k, sinceLand: this.travelT - lag - (HOP_MS * this.motion) };
  }

  // ------------------------------------------------------------------ input

  private isResting(p: Tracked, now: number): boolean {
    return !p.moved && Math.hypot(p.x - p.x0, p.y - p.y0) <= PARK_STILL_PX && now - p.t0 >= PARK_AFTER_MS;
  }

  private readonly down = (e: PointerEvent): void => {
    if (!this.shown) return;
    const now = performance.now();
    this.pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, moved: false, lastDy: 0, lastT: now, vy: 0 });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not all browsers allow capture here */
    }
    const current = this.primary !== null ? this.pointers.get(this.primary) : undefined;
    if (!current || this.isResting(current, now)) this.primary = e.pointerId;
    // A finger on the map stops any fling and holds the view where it is.
    this.fling = 0;
    this.panTarget = null;
  };

  private readonly move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_MAX_PX) p.moved = true;
    const dt = Math.max(1, now - p.lastT);
    p.vy = p.vy * 0.5 + (dy / dt) * 0.5 * 1000;
    p.lastDy = dy;
    p.lastT = now;
    if (p.moved && this.primary === e.pointerId && this.scrollable()) {
      // The pages follow the finger; past the ends of the known world they give only a little.
      const { lo, hi } = this.cameraRange();
      const want = this.camera + dy / this.scale;
      const give = want < lo || want > hi ? EDGE_GIVE : 1;
      this.camera += (dy / this.scale) * give;
      this.wake();
    }
  };

  private readonly up = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    const current = this.primary !== null ? this.pointers.get(this.primary) : undefined;
    // A tap counts from the driving finger, or from any finger while the driving one is a resting palm.
    const drives = this.primary === e.pointerId || !current || this.isResting(current, now);
    if (drives && !p.moved && now - p.t0 <= TAP_MAX_MS) {
      const rect = this.canvas.getBoundingClientRect();
      this.tap(p.x - rect.left, p.y - rect.top);
    } else if (drives && p.moved && this.scrollable()) {
      // A fling carries the view on, gently: capped, and only if the finger was still moving.
      const stale = now - p.lastT > 80;
      const cap = (MAX_FLING_SCREENS_PER_S * this.h) / this.scale;
      this.fling = stale ? 0 : Math.max(-cap, Math.min(cap, p.vy / this.scale));
      this.sinceTouch = 0;
      this.wake();
    }
    this.release(e.pointerId);
  };

  private readonly cancel = (e: PointerEvent): void => this.release(e.pointerId);

  private release(id: number): void {
    this.pointers.delete(id);
    if (this.primary === id) {
      this.primary = null;
      for (const [k] of this.pointers) this.primary = k;
    }
    if (this.pointers.size === 0) this.sinceTouch = 0;
  }

  /** Scrolling is free once she has arrived (not during the hop) and never in the resting scene. */
  private scrollable(): boolean {
    const opts = this.opts;
    return !!opts && !opts.rest && (!!opts.review || (this.phase === 'linger' && !this.swap));
  }

  private tap(x: number, y: number): void {
    const opts = this.opts;
    if (!opts || !this.shown || this.phase === 'idle' || this.phase === 'done') return;
    if (this.phase === 'enter' && this.phaseT < TAP_GUARD_MS) return;
    if (opts.review) {
      const friend = this.friendAt(x, y);
      if (friend) {
        if (!this.swap) this.pick(friend);
        return;
      }
      const n = this.earlierLanternAt(x, y, REVIEW_TOP + 1);
      if (n !== null) {
        opts.review.onOpen(n);
        return;
      }
      this.twinkles.push({ x, y, t: 0, seed: this.twinkles.length });
      opts.onTwinkle?.();
      this.wake();
      return;
    }
    if (opts.rest) {
      if (!this.litTo) return;
      this.twinkles.push({ x, y, t: 0, seed: this.twinkles.length });
      opts.onTwinkle?.();
      this.wake();
      return;
    }
    const friend = this.friendAt(x, y);
    if (friend) {
      if (this.phase === 'linger' && !this.swap && this.travelDone()) this.pick(friend);
      return;
    }
    // The lit lantern (or her companion on it) starts the next level. Anywhere else twinkles,
    // so a tap never feels dead, and the map stays.
    if (this.litTo && this.phase === 'linger' && this.lanternAt(x, y)) {
      this.finish();
      return;
    }
    // A lit lantern behind her, or an explore lantern ahead, plays that level without moving her on.
    const open = this.litTo && this.phase === 'linger' && opts.onReplay ? this.openLanternAt(x, y) : null;
    if (open !== null && opts.onReplay) {
      this.phase = 'done';
      opts.onReplay(open);
      return;
    }
    this.twinkles.push({ x, y, t: 0, seed: this.twinkles.length });
    opts.onTwinkle?.();
    this.wake();
  }

  /** Whether a tap lands on her star, or the companion hovering over it. */
  private lanternAt(x: number, y: number): boolean {
    const opts = this.opts;
    if (!opts) return false;
    const perch = this.perchOf(opts.to);
    const targets = [this.starOf(opts.to), perch, { x: perch.x, y: perch.y - COMPANION_S * 0.5 }];
    return targets.some((p) => Math.hypot(p.x - x, p.y - y) <= LANTERN_HIT);
  }

  /** A lit star behind her under the tap, nearest first, or null. */
  private earlierLanternAt(x: number, y: number, below?: number): number | null {
    const top = below ?? this.opts?.to ?? 1;
    return this.lanternUnderTap(x, y, (n) => n < top);
  }

  /** A lantern she may play from here under the tap: a lit one behind her or an explore lantern ahead. */
  private openLanternAt(x: number, y: number): number | null {
    const to = this.opts?.to ?? 1;
    const explore = this.exploreSet();
    return this.lanternUnderTap(x, y, (n) => n < to || explore.has(n));
  }

  /** The nearest star on screen under the tap among those `allowed`, or null. */
  private lanternUnderTap(x: number, y: number, allowed: (n: number) => boolean): number | null {
    const opts = this.opts;
    if (!opts) return null;
    const { nLo, nHi } = this.lanternRange();
    let best: number | null = null;
    let bestD = LANTERN_HIT;
    for (let n = nLo; n <= nHi; n++) {
      if (!allowed(n)) continue;
      const star = this.starOf(n);
      if (star.y < -40 || star.y > this.h + 40) continue;
      const d = Math.hypot(star.x - x, star.y - y);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** The stars that could be on screen, plus one each side. */
  private lanternRange(): { nLo: number; nHi: number } {
    const bottom = this.toWorldY(this.h + STAR_R * 6);
    const top = this.toWorldY(-STAR_R * 6);
    let nLo = 1;
    while (lanternWorld(nLo + 1).y < bottom) nLo++;
    let nHi = nLo;
    while (lanternWorld(nHi).y < top && nHi < nLo + 60) nHi++;
    return { nLo: Math.max(1, nLo - 1), nHi: nHi + 1 };
  }

  /** Review mode: glide the camera to the first lantern of the next (1) or previous (-1) area. */
  panArea(dir: 1 | -1): void {
    if (!this.opts?.review) return;
    const here = this.nearestLantern();
    const start = areaStartLantern(here);
    const target = dir > 0 ? start + LANTERNS_PER_AREA : here > start ? start : start - LANTERNS_PER_AREA;
    this.panTarget = Math.min(REVIEW_TOP, Math.max(1, target));
    this.fling = 0;
    this.wake();
  }

  /** The lantern nearest the view's baseline. */
  private nearestLantern(): number {
    let n = 1;
    while (lanternWorld(n + 1).y < this.camera && n < REVIEW_TOP) n++;
    return Math.abs(lanternWorld(n + 1).y - this.camera) < Math.abs(lanternWorld(n).y - this.camera) ? n + 1 : n;
  }

  /** Called by the app for a continue it owes elsewhere (the debug hook); same as a tap on the lantern. */
  continueNow(): void {
    if (!this.litTo) this.light();
    this.finish();
  }

  /** The friends have all landed (a tap on one mid-hop would send it off again). */
  private travelDone(): boolean {
    return this.travelT < 0 || this.travelT >= (HOP_MS * this.motion) + FRIEND_LAG_MS * this.friends.length + (LAND_MS * this.motion);
  }

  private friendAt(x: number, y: number): Friend | null {
    let best: Friend | null = null;
    let bestD = Infinity;
    for (const [i, f] of this.friends.entries()) {
      const p = this.toScreen(this.friendTravel(i).at);
      const d = Math.hypot(p.x - x, p.y - FRIEND_S * 0.45 - y);
      if (d <= FRIEND_HIT && d < bestD) {
        best = f;
        bestD = d;
      }
    }
    return best;
  }

  private pick(friend: Friend): void {
    const opts = this.opts;
    if (!opts) return;
    this.swap = { incoming: friend.id, outgoing: this.companion, at: this.friendWorld(friend, this.groupAnchor()), offset: friend.offset, t: 0 };
    this.friends = this.friends.filter((f) => f !== friend);
    this.companion = friend.id;
    opts.onPick?.(friend.id);
    this.wake();
  }

  private light(): void {
    if (this.litTo) return;
    this.litTo = true;
    this.bloomT = 0;
    this.landT = 0;
    if (this.opts) this.camera = this.floored(lanternWorld(this.opts.to).y);
    this.phase = 'linger';
    this.phaseT = 0;
    this.opts?.onLight?.();
  }

  private finish(): void {
    if (this.phase === 'done' || !this.opts || this.opts.rest) return;
    this.phase = 'done';
    this.opts.onDone();
  }

  // ------------------------------------------------------------ frame loop

  private wake(): void {
    if (!this.running || !this.shown || this.active) return;
    this.active = true;
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    // A frame's timestamp can precede the wake that asked for it; never step backwards.
    const dt = Math.max(0, Math.min(50, now - this.lastNow));
    this.lastNow = now;
    this.time += dt;
    const moving = this.update(dt);
    this.reportArea();
    this.draw();
    if (!this.running || !this.shown) return;
    if (moving) {
      this.active = true;
      this.raf = requestAnimationFrame(this.frame);
    } else {
      // Only ambient life: a slow tick is plenty (DESIGN.md 4.4); the deep night of a long rest ticks once a second (battery).
      this.active = false;
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (!this.running || this.active) return;
        this.frame(performance.now());
      }, this.restAge() >= REST_DEEP_AT_MS ? 1000 : 1000 / IDLE_FPS);
    }
  };

  /** Advance the sequence; returns true while anything needs full frame rate. */
  private update(dt: number): boolean {
    const opts = this.opts;
    if (!opts) return false;
    let moving = false;
    this.phaseT += dt;
    switch (this.phase) {
      case 'enter':
        moving = true;
        if (this.phaseT >= ENTER_MS) {
          this.phase = 'hop';
          this.phaseT = 0;
          this.travelT = 0;
        }
        break;
      case 'hop': {
        moving = true;
        const k = clamp01(this.phaseT / (HOP_MS * this.motion));
        this.camera = this.floored(lanternWorld(opts.from).y + (lanternWorld(opts.to).y - lanternWorld(opts.from).y) * easeInOutSine(k));
        if (k >= 1) this.light();
        break;
      }
      case 'linger':
        if (opts.rest) {
          if (this.phaseT > SLEEP_AFTER_MS && this.sleepiness < 1) {
            this.sleepiness = clamp01((this.phaseT - SLEEP_AFTER_MS) / SLEEP_MS);
            moving = true;
          }
        } else if (!opts.review && this.phaseT >= INVITE_AFTER_MS) {
          // The map waits for her tap; the lantern breathes as the invitation, which needs frames.
          moving = true;
        }
        if (this.updateScroll(dt)) moving = true;
        break;
      case 'idle':
      case 'done':
        break;
    }
    if (this.travelT >= 0 && !this.travelDone()) {
      // The friends are still hopping after her.
      this.travelT += dt;
      moving = true;
    }
    if (this.bloomT >= 0) {
      this.bloomT += dt;
      if (this.bloomT < (BLOOM_MS * this.motion)) moving = true;
      else this.bloomT = (BLOOM_MS * this.motion);
    }
    if (this.landT >= 0) {
      this.landT += dt;
      if (this.landT < (LAND_MS * this.motion)) moving = true;
      else this.landT = -1;
    }
    if (this.swap) {
      this.swap.t += dt;
      moving = true;
      if (this.swap.t >= (HOP_MS * this.motion) + (LAND_MS * this.motion)) {
        this.friends.push({ id: this.swap.outgoing, offset: this.swap.offset });
        this.swap = null;
      }
    }
    if (this.twinkles.length > 0) {
      moving = true;
      for (const tw of this.twinkles) tw.t += dt;
      this.twinkles = this.twinkles.filter((tw) => tw.t < TWINKLE_MS);
    }
    return moving;
  }

  /** Tell the app when the view has crossed into another area (the music follows). */
  private reportArea(): void {
    const opts = this.opts;
    if (!opts?.onArea) return;
    const area = areaUnderView(this.camera);
    if (area === this.areaReported) return;
    this.areaReported = area;
    opts.onArea(area);
  }

  /** The view's own motion: a fling, the soft ends of the world, the review glide, the drift home. */
  private updateScroll(dt: number): boolean {
    const opts = this.opts;
    if (!opts) return false;
    const touching = this.pointers.size > 0 && [...this.pointers.values()].some((p) => p.moved);
    const { lo, hi } = this.cameraRange();
    let moving = false;
    if (this.panTarget !== null) {
      const goal = lanternWorld(this.panTarget).y;
      const gap = goal - this.camera;
      if (Math.abs(gap) < 0.5) {
        this.camera = goal;
        this.panTarget = null;
      } else {
        this.camera += gap * Math.min(1, dt / 220);
        moving = true;
      }
      return moving;
    }
    if (touching) return false;
    this.sinceTouch += dt;
    if (this.fling !== 0) {
      this.camera += (this.fling * dt) / 1000;
      this.fling *= Math.pow(FLING_DECAY_PER_S, dt / 1000);
      if (Math.abs(this.fling) < FLING_STOP / this.scale) this.fling = 0;
      moving = true;
    }
    // Past the ends, the view springs back.
    if (this.camera < lo || this.camera > hi) {
      const goal = this.camera < lo ? lo : hi;
      this.camera += (goal - this.camera) * Math.min(1, dt / 160);
      if (Math.abs(goal - this.camera) < 0.5) this.camera = goal;
      this.fling = 0;
      moving = true;
    } else if (!opts.review && this.fling === 0 && this.sinceTouch >= HOME_AFTER_MS && Math.abs(this.camera - this.home) > 0.5) {
      // Left alone for a good while, the view strolls gently back to her lantern.
      this.camera += (this.home - this.camera) * Math.min(1, dt / HOME_DRIFT_MS);
      if (Math.abs(this.home - this.camera) < 0.5) this.camera = this.home;
      moving = true;
    }
    return moving;
  }

  // ----------------------------------------------------------------- drawing

  private ambientFor(id: AreaId): Ambient {
    let a = this.ambients.get(id);
    if (!a) {
      a = areaTheme(id).createAmbient(this.w, this.h, 5);
      this.ambients.set(id, a);
    }
    return a;
  }

  /** The area under the view's baseline and how far its sky has crossed into the next, over the stage's top third. */
  private areasNow(): { a: AreaTheme; b: AreaTheme; f: number } {
    const blend = stageBlend(this.camera);
    return { a: areaTheme(blend.a), b: areaTheme(blend.b), f: blend.f };
  }

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.time / 1000;
    const opts = this.opts;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { a, b, f } = this.areasNow();
    const colors = blendThemeColors(a, b, f);

    this.drawSky(colors, t);

    // Ambient life of the area, crossfading at an area border.
    if (f < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - f;
      this.ambientFor(a.id).draw(ctx, w, h, t);
      ctx.restore();
    }
    if (f > 0) {
      ctx.save();
      ctx.globalAlpha = f;
      this.ambientFor(b.id).draw(ctx, w, h, t);
      ctx.restore();
    }
    if (opts?.rest && this.sleepiness > 0) {
      if (!this.restStars) this.restStars = new Stars(w, h, 21, Math.max(30, Math.round((w * h) / 7000)), '#e6ecff', 0.7);
      ctx.save();
      ctx.globalAlpha = this.sleepiness * 0.8;
      this.restStars.draw(ctx, w, h, t);
      ctx.restore();
    }
    this.drawVignette();

    this.drawIslands(colors, t);
    if (!opts) return;
    this.drawWorld(t, opts, colors);
    if (opts.rest) this.drawRestNight(w, h, t);
    this.drawTwinkles();
    // The resting scene stays up until a grown-up opens the gate (DESIGN.md 3.8), so the dim moon shows where to hold.
    if (opts.rest) this.drawMoon();
  }

  /** How long the resting scene has been up, in ms (0 outside rest). */
  private restAge(): number {
    const opts = this.opts;
    if (!opts?.rest) return 0;
    return Math.max(0, Date.now() - (opts.restSince ?? Date.now()));
  }

  /**
   * The night of a long rest (DESIGN.md 3.8): after two minutes the screen dims further; after ten it
   * settles to a near-black night with a few slow stars, and the loop ticks once a second.
   */
  private drawRestNight(w: number, h: number, t: number): void {
    const age = this.restAge();
    const dim = REST_DIM * easeInOutSine(clamp01((age - REST_DIM_AT_MS) / 20_000));
    const deep = easeInOutSine(clamp01((age - REST_DEEP_AT_MS) / 40_000));
    const a = dim + REST_DEEP * deep;
    if (a <= 0) return;
    const { ctx } = this;
    ctx.fillStyle = `rgba(2, 3, 10, ${a})`;
    ctx.fillRect(0, 0, w, h);
    if (deep > 0 && this.restStars) {
      // A few slow stars keep the night company, drawn over the dark at a quarter of their light.
      ctx.save();
      ctx.globalAlpha = 0.25 * deep;
      this.restStars.draw(ctx, w, h, t * 0.5);
      ctx.restore();
    }
  }

  /** The far stars of the sky, laid out once per size and scrolled with a slow parallax. */
  private skyField: Array<{ x: number; y: number; r: number; a: number; phase: number }> | null = null;

  /**
   * The night sky behind everything: the area's own night colours (blending into the next area's as
   * the view climbs), a field of far stars drifting slowly against the islands, and the two soft glows
   * the board's sky has. Code-drawn, so no two paintings ever have to meet.
   */
  private drawSky(colors: ReturnType<typeof blendThemeColors>, t: number): void {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, colors.bgTop);
    g.addColorStop(1, colors.bgBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    glowDisc(ctx, w * 0.5, h * 0.96, w * 0.9, colors.glowLow, 0.22);
    glowDisc(ctx, w * 0.5, h * 0.02, w * 0.8, colors.glowHigh, 0.18);
    if (!this.skyField) {
      const rng = createRng(11);
      const n = Math.max(60, Math.round((w * h) / 2600));
      this.skyField = Array.from({ length: n }, () => ({ x: rng.range(0, w), y: rng.range(0, h * 2), r: rng.range(0.6, 1.9), a: rng.range(0.35, 0.95), phase: rng.range(0, Math.PI * 2) }));
    }
    // The field is two screens tall and wraps, moving at a share of the islands' speed.
    const tile = h * 2;
    const shift = ((this.camera * this.scale * SKY_PARALLAX) % tile + tile) % tile;
    ctx.save();
    for (const st of this.skyField) {
      let y = st.y + shift;
      if (y >= tile) y -= tile;
      if (y > h + 4) continue;
      const tw = 0.75 + 0.25 * Math.sin(t * 0.7 + st.phase);
      ctx.fillStyle = rgba('#f4f0ff', st.a * tw);
      ctx.beginPath();
      ctx.arc(st.x, y, st.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * The islands under the view, far to near: each area's painted island on its stage, floating very
   * slightly, with a breath of the area's light behind it. An island without its picture shows a soft
   * code-drawn isle in the area's colours, so the journey is never blank.
   */
  private drawIslands(colors: ReturnType<typeof blendThemeColors>, t: number): void {
    const { ctx, w, h } = this;
    const aLo = Math.max(0, stageAt(this.toWorldY(h)).a - 1);
    const aHi = stageAt(Math.max(0, this.toWorldY(0))).a;
    for (let a = aHi; a >= aLo; a--) {
      const r = islandRect(a);
      const size = r.size * this.scale;
      const left = r.x * this.scale;
      const bottomY = this.toScreen({ x: 0, y: r.y }).y;
      const topY = bottomY - size;
      if (topY > h || bottomY < 0) continue;
      // A very slow float, a few px, different for each island.
      const float = Math.sin(t * 0.45 + a * 1.9) * 3;
      const area = stageAt(r.y + 1).area;
      const img = this.islands.get(area);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, left + size / 2, topY + size * 0.5 + float, size * 0.42, colors.glowLow, 0.1);
      ctx.restore();
      if (img) ctx.drawImage(img, left, topY + float, size, size);
      else this.drawFallbackIsland(area, left, topY + float, size, w);
    }
  }

  /** An island without its picture: a soft isle in the area's ground colours with a few of its lights. */
  private drawFallbackIsland(area: AreaId, left: number, top: number, size: number, w: number): void {
    const { ctx } = this;
    const theme = areaTheme(area);
    const cx = left + size / 2;
    const topY = top + size * 0.3;
    const rx = size * 0.38;
    const ry = size * 0.13;
    ctx.save();
    // The underside: a rough tapering clump.
    ctx.fillStyle = theme.groundFar;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.96, topY + ry * 0.3);
    ctx.quadraticCurveTo(cx - rx * 0.3, topY + ry * 3.2, cx + rx * 0.08, topY + size * 0.42);
    ctx.quadraticCurveTo(cx + rx * 0.5, topY + ry * 2.6, cx + rx * 0.96, topY + ry * 0.3);
    ctx.closePath();
    ctx.fill();
    // The top: the area's ground.
    ctx.fillStyle = theme.ground;
    ctx.beginPath();
    ctx.ellipse(cx, topY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    glowDisc(ctx, cx, topY, rx * 0.6, theme.accent, 0.18);
    for (let i = 0; i < 5; i++) glowDisc(ctx, cx + Math.cos(i * 1.3) * rx * 0.6, topY + Math.sin(i * 2.1) * ry * 0.6, 7, theme.accent, 0.35);
    ctx.restore();
    void w;
  }

  /** The companion: painted when a picture exists for it, else drawn in code. */
  private drawAnyCompanion(ctx: CanvasRenderingContext2D, id: CompanionId, x: number, y: number, s: number, t: number, opts: CompanionOpts = {}): void {
    const picture = this.art?.companions[id];
    if (picture) drawPaintedCompanion(ctx, picture.awake, x, y, s, t, opts, picture.asleep);
    else drawCompanion(ctx, id, x, y, s, t, opts);
  }

  /**
   * A level star hanging in the sky: lit (warm gold, glowing softly, breathing) behind her and under
   * her, dim ahead; explore stars glimmer in between. All code-drawn light in the area's colour, so
   * nothing is ever greyed out or locked.
   */
  private drawStar(n: number, lit: number, t: number, colors: ReturnType<typeof blendThemeColors>): void {
    const { ctx } = this;
    const p = this.starOf(n);
    if (p.y < -STAR_R * 6 || p.y > this.h + STAR_R * 6) return;
    const k = clamp01(lit);
    const r = STAR_R * (0.8 + 0.2 * k);
    ctx.save();
    if (k > 0.05) {
      ctx.globalCompositeOperation = 'lighter';
      const breath = 0.925 + 0.075 * Math.sin(t * 0.9);
      glowDisc(ctx, p.x, p.y, r * 3.6, colors.pathLit, 0.34 * k * breath);
      glowDisc(ctx, p.x, p.y, r * 1.8, '#ffd98a', 0.3 * k);
    }
    ctx.globalCompositeOperation = 'source-over';
    this.starPath(p.x, p.y, r);
    ctx.fillStyle = k > 0.5 ? rgba('#ffe6a8', 0.55 + 0.45 * k) : rgba('#aebfe6', 0.3 + 0.5 * k);
    ctx.fill();
    this.starPath(p.x, p.y, r * 0.5);
    ctx.fillStyle = k > 0.5 ? rgba('#fff8e4', k) : rgba('#d6e0f8', 0.35 + 0.4 * k);
    ctx.fill();
    ctx.restore();
  }

  /** A five-point star path centred at (x, y) with outer radius r. */
  private starPath(x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 === 0 ? r : r * 0.46;
      const px = x + Math.cos(ang) * rr;
      const py = y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  /** The same dim moon the board draws at (12,14), baked so the cut-out never erases the scene beneath. */
  private moon: HTMLCanvasElement | null = null;

  private drawMoon(): void {
    if (!this.moon) {
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
    }
    this.ctx.save();
    this.ctx.globalAlpha = 0.3;
    this.ctx.drawImage(this.moon, 12, 14, 24, 24);
    this.ctx.restore();
  }

  /** A soft darkening toward the top and bottom edges, so the eye rests on the middle of the page. */
  private drawVignette(): void {
    const { ctx, w, h } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(4,6,22,0.34)');
    g.addColorStop(0.18, 'rgba(4,6,22,0)');
    g.addColorStop(0.86, 'rgba(4,6,22,0)');
    g.addColorStop(1, 'rgba(4,6,22,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawWorld(t: number, opts: MapShowOptions, colors: ReturnType<typeof blendThemeColors>): void {
    const { ctx } = this;
    const walkedTo = opts.review ? REVIEW_TOP : this.litTo ? opts.to : opts.from;
    const { nLo, nHi } = this.lanternRange();

    // The trail between stars: glimmers of light along the flight, warm and bright behind her, faint ahead.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let n = nLo; n < nHi; n++) {
      const line = pathPolyline(n, n + 1, 7).map((p) => this.toScreen(p));
      if ((line[0] as Pt).y < -60 && (line[line.length - 1] as Pt).y < -60) continue;
      if ((line[0] as Pt).y > this.h + 60 && (line[line.length - 1] as Pt).y > this.h + 60) continue;
      const behind = n < walkedTo;
      for (let i = 1; i < line.length - 1; i++) {
        const p = line[i] as Pt;
        const tw = 0.7 + 0.3 * Math.sin(t * 1.1 + n * 0.9 + i * 1.4);
        if (behind) {
          glowDisc(ctx, p.x, p.y, 7, colors.pathLit, 0.22 * tw);
          ctx.fillStyle = rgba('#fff1cf', 0.75 * tw);
        } else {
          ctx.fillStyle = rgba('#c9d6f5', 0.22 + 0.1 * tw);
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, behind ? 2 : 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();

    // The stars, far to near: lit behind her, dim ahead, never greyed out; the explore stars ahead (the
    // first of each area) glimmer half-lit with a slow breath, the invitation to look in.
    const explore = this.exploreSet();
    let bloomAt: Pt | null = null;
    for (let n = nHi; n >= nLo; n--) {
      let lit = opts.review || n < opts.to ? 1 : 0.1;
      if (lit < 1 && n !== opts.to && explore.has(n)) {
        const breath = 0.5 - 0.5 * Math.cos(((t * 1000) / EXPLORE_PERIOD_MS + n * 0.37) * Math.PI * 2);
        lit = EXPLORE_LIT + EXPLORE_BREATH * breath;
      }
      if (!opts.review && n === opts.to && this.litTo) {
        // The new light rises over the bloom, with a brief soft overshoot that settles.
        const k = clamp01(this.bloomT / (BLOOM_MS * this.motion));
        lit = 0.1 + 0.9 * easeOutCubic(k) + 0.25 * Math.sin(k * Math.PI);
        if (k < 1) bloomAt = this.starOf(n);
      }
      this.drawStar(n, lit, t + n * 0.7, colors);
    }
    if (!opts.rest && !opts.review && this.litTo && this.phase === 'linger' && this.phaseT >= INVITE_AFTER_MS) {
      // The invitation: a slow breath of light around her star until she taps it.
      const at = this.starOf(opts.to);
      const rise = clamp01((this.phaseT - INVITE_AFTER_MS) / 1200);
      const breathK = 0.5 - 0.5 * Math.cos(((this.phaseT - INVITE_AFTER_MS) / INVITE_PERIOD_MS) * Math.PI * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, at.x, at.y, 34 + 26 * breathK, '#fff2cf', rise * (0.1 + 0.22 * breathK));
      glowDisc(ctx, at.x, at.y, 18 + 10 * breathK, colors.pathLit, rise * (0.08 + 0.18 * breathK));
      ctx.restore();
    }
    if (bloomAt) {
      const k = clamp01(this.bloomT / (BLOOM_MS * this.motion));
      const e = easeOutCubic(k);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, bloomAt.x, bloomAt.y, 30 + e * 110, '#fff2cf', 0.45 * (1 - e));
      glowDisc(ctx, bloomAt.x, bloomAt.y, 20 + e * 50, colors.pathLit, 0.5 * (1 - k));
      ctx.restore();
    }

    // Her friends travelling with her: trailing her hop along the path, then standing a little behind
    // her, turned her way, waving once they have landed; asleep beside her in rest.
    const perchTo = this.perchOf(opts.to);
    const asleep = opts.rest && this.sleepiness > 0 ? easeInOutSine(this.sleepiness) : 0;
    for (const [i, fr] of this.friends.entries()) {
      const tr = this.friendTravel(i);
      const p = this.toScreen(tr.at);
      if (p.y < -FRIEND_S * 2 || p.y > this.h + FRIEND_S) continue;
      const dir = Math.sign(perchTo.x - p.x) || 1;
      const pose: CompanionOpts = { glow: 0.9, facing: dir >= 0 ? 1 : -1 };
      let y = p.y - HOVER;
      if (tr.k < 1) {
        // In the air behind her, a little lower than her own hop.
        const air = Math.sin(tr.k * Math.PI);
        y -= air * HOP_HEIGHT * FRIEND_HOP;
        Object.assign(pose, this.hopPose(tr.k, -1, dir));
      } else {
        const land = tr.sinceLand >= 0 && tr.sinceLand < (LAND_MS * this.motion) ? Math.sin(clamp01(tr.sinceLand / (LAND_MS * this.motion)) * Math.PI) : 0;
        pose.squash = 1 - 0.14 * land;
        // A wave of greeting after everyone has landed, fading out over a moment.
        const settled = tr.sinceLand - (LAND_MS * this.motion);
        if (settled >= 0 && settled < WAVE_AFTER_HOP_MS) pose.wave = 1 - easeInOutSine(clamp01((settled - WAVE_AFTER_HOP_MS + 700) / 700));
        if (asleep > 0) {
          pose.blink = asleep;
          pose.sleep = this.sleepiness >= 1;
          pose.squash = 1 - 0.08 * asleep;
          pose.motion = 1 - 0.7 * asleep;
          pose.glow = 0.9 - 0.2 * asleep;
          pose.wave = 0;
        }
        y += pose.sleep ? 0 : Math.sin(t * 1.2 + i * 2.1) * 2 * (1 - asleep);
      }
      glowDisc(ctx, p.x, p.y, FRIEND_S * 0.6, colors.pathLit, 0.1);
      this.drawAnyCompanion(ctx, fr.id, p.x, y, FRIEND_S, t + i * 1.3, pose);
    }

    // The companion: entering, hopping, landed, or asleep.
    if (this.swap) {
      const k = clamp01(this.swap.t / (HOP_MS * this.motion));
      const slotP = this.toScreen(this.swap.at);
      const sinceLand = this.swap.t - (HOP_MS * this.motion);
      const inP = this.arc(slotP, perchTo, k);
      const outP = this.arc(perchTo, slotP, k);
      this.drawAnyCompanion(ctx, this.swap.outgoing, outP.x, outP.y, FRIEND_S, t, { ...this.hopPose(k, sinceLand, Math.sign(slotP.x - perchTo.x)), glow: 0.9 });
      this.drawAnyCompanion(ctx, this.swap.incoming, inP.x, inP.y, COMPANION_S, t, { ...this.hopPose(k, sinceLand, Math.sign(perchTo.x - slotP.x)), glow: 1.1 });
    } else if (this.phase === 'hop') {
      // Flying along the trail between the two stars.
      const k = clamp01(this.phaseT / (HOP_MS * this.motion));
      const ground = this.toScreen(pathBetween(opts.from, opts.to, easeInOutSine(k)));
      const y = ground.y - HOVER - Math.sin(k * Math.PI) * HOP_HEIGHT;
      const dir = Math.sign(lanternWorld(opts.to).x - lanternWorld(opts.from).x) || 1;
      this.drawAnyCompanion(ctx, this.companion, ground.x, y, COMPANION_S, t, { ...this.hopPose(k, -1, dir), glow: 1.15 });
    } else {
      const perch = this.litTo ? perchTo : this.perchOf(opts.from);
      const pose: CompanionOpts = { glow: 1.1 };
      if (this.landT >= 0) pose.squash = 1 - 0.14 * Math.sin(clamp01(this.landT / (LAND_MS * this.motion)) * Math.PI);
      if (opts.rest && this.sleepiness > 0) {
        // Drifting off: eyes close, the body settles, the idle motion stills, the glow slows.
        const s = easeInOutSine(this.sleepiness);
        pose.blink = s;
        pose.sleep = this.sleepiness >= 1;
        pose.squash = 1 - 0.08 * s;
        pose.motion = 1 - 0.7 * s;
        pose.glow = 1.1 - 0.2 * s;
      }
      const bob = pose.sleep ? 0 : Math.sin(t * 1.4) * 1.5;
      glowDisc(ctx, perch.x, perch.y, COMPANION_S * 0.7, colors.pathLit, 0.12);
      this.drawAnyCompanion(ctx, this.companion, perch.x, perch.y + bob, COMPANION_S, t, pose);
    }
  }

  /** An eased hop from `a` to `b` with a rising arc. */
  private arc(a: Pt, b: Pt, k: number): Pt {
    const e = easeInOutSine(k);
    return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e - Math.sin(k * Math.PI) * HOP_HEIGHT * 0.8 };
  }

  /** Stretch going up, lean into the direction, squash on landing (DESIGN.md 3.5). */
  private hopPose(k: number, sinceLand: number, dir: number): CompanionOpts {
    if (k < 1) {
      const air = Math.sin(k * Math.PI);
      return { squash: 1 + 0.16 * air, tilt: dir * 0.16 * air, facing: dir >= 0 ? 1 : -1, motion: 0.4 };
    }
    const land = sinceLand >= 0 && sinceLand < (LAND_MS * this.motion) ? Math.sin(clamp01(sinceLand / (LAND_MS * this.motion)) * Math.PI) : 0;
    return { squash: 1 - 0.14 * land, facing: dir >= 0 ? 1 : -1 };
  }

  /** A four-point twinkle where she tapped: grows quickly, fades slowly (DESIGN.md 3.8). */
  private drawTwinkles(): void {
    const { ctx } = this;
    if (this.twinkles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const tw of this.twinkles) {
      const k = clamp01(tw.t / TWINKLE_MS);
      const grow = easeOutCubic(Math.min(1, k * 3));
      const fadeOut = 1 - easeInOutSine(k);
      const r = (14 + 10 * grow) * (0.8 + 0.2 * Math.sin(tw.seed));
      glowDisc(ctx, tw.x, tw.y, r * 1.8, '#ffe9b8', 0.5 * fadeOut);
      ctx.strokeStyle = `rgba(255,240,205,${0.85 * fadeOut})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tw.x - r * grow, tw.y);
      ctx.lineTo(tw.x + r * grow, tw.y);
      ctx.moveTo(tw.x, tw.y - r * grow);
      ctx.lineTo(tw.x, tw.y + r * grow);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,248,230,${fadeOut})`;
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
