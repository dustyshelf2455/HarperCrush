/**
 * The map between levels (DESIGN.md 3.5, rebuilt as the scrolling storybook of
 * DESIGN.md 2e and STYLE.md "The map"): tall painted pages, three to an area,
 * stacked bottom to top forever, with the path painted into the landscape.
 * The code places a beacon beside the path for every lantern, lights the ones
 * she has lit, stands her companion on the path, hops it along the painting
 * to the next beacon, and draws all the light. Nothing moves on by itself:
 * the map stays until she taps the lit beacon (or her companion on it), and
 * after a moment the beacon breathes as the invitation. The other two
 * creatures travel with her (the parent, 7 October): they trail along the path
 * behind her hop and wait beside her at every beacon, and a tap on one swaps
 * it in as her companion, on the map and on the board alike. In rest
 * (DESIGN.md 3.8) all three curl up and sleep by the new beacon and the scene
 * stays until the app hides it.
 *
 * The map can be scrolled with a finger (the parent, 7 October: scrolling
 * along the path should be a calm delight in itself): the pages follow the
 * finger, a fling carries on gently with a cap on its speed, the ends of the
 * known world give softly, and after a pause the view drifts home to her
 * lantern. Behind her lantern it reaches back to the first page; ahead it
 * shows a little of the unlit path, so the journey still goes on forever.
 *
 * A full-screen canvas overlay, display:none while not in use so it costs
 * nothing. It draws at full rate only while something moves and at a slow
 * idle tick otherwise (DESIGN.md 4.4). No text, ever.
 */
import './mapScene.css';
import { LANTERNS_PER_AREA, type AreaId } from '../core/journey';
import { areaTheme, blendThemeColors, type AreaTheme } from '../render/areas';
import { COMPANIONS, type CompanionId, type CompanionOpts, drawCompanion, drawPaintedCompanion } from '../render/creatures';
import { drawLanternPost, drawPathRibbon, postLayout } from '../render/map';
import { BEACON_LAMP, type MapArt, type SectionArt, loadSectionArt } from '../render/mapArt';
import { SEAM_OVERLAP, SECTION_H, SECTION_PITCH, SECTION_W, areaStartLantern, areaUnderView, lanternWorld, pathBetween, pathPolyline, sectionAt, sectionRef } from '../render/mapWorld';
import type { Pt } from '../render/shapes';
import { Stars, clamp01, easeInOutSine, easeOutCubic, glowDisc } from '../render/styles/common';
import { rgba } from '../render/color';
import type { Ambient, GemStyle } from '../render/styles/types';

export interface MapShowOptions {
  /** The lantern she just lit (where the companion starts) and the one she hops to. */
  from: number;
  to: number;
  companion: CompanionId;
  /** The resting scene: she falls asleep on the new lantern and the scene never ends on its own. */
  rest: boolean;
  /** The moment the new lantern lights (the app plays a warm chord). */
  onLight?(): void;
  /** She tapped one of the friends travelling with her; it is now her companion. */
  onPick?(id: CompanionId): void;
  /** A tap in the resting scene made a star twinkle (the app plays a very soft chime). */
  onTwinkle?(): void;
  /** The scene is finished (never called in rest). */
  onDone(): void;
  /** She tapped a lit lantern behind her: play that level again (the journey does not move). */
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
/** Generous target around the lit lantern and the companion on it, in CSS px. */
const LANTERN_HIT = 72;
const WAVE_AFTER_HOP_MS = 2200;
const SLEEP_AFTER_MS = 1500;
const SLEEP_MS = 2200;
const TWINKLE_MS = 1400;
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

// Composition: her lantern a little below the middle of the screen (DESIGN.md 3.5).
const BASELINE = 0.56;
// Sizes on screen (CSS px): the beacon's height, the companion and the waiting friends (STYLE.md: the fairy half again as big).
const BEACON_H = 86;
const COMPANION_S = 58;
const FRIEND_S = 52;
const HOP_HEIGHT = 70;
/** How far the beacon stands from the path's centre line, in CSS px. */
const BEACON_OFFSET = 34;

// Scrolling feel (the parent, 7 October): the pages follow the finger; a fling keeps going gently and is
// capped so a quick flick never races; the view drifts home after a pause.
/** Fastest the view may travel on its own, in screen heights per second. */
const MAX_FLING_SCREENS_PER_S = 1.6;
/** Fling friction: the share of speed left after each second. */
const FLING_DECAY_PER_S = 0.12;
/** Below this speed (CSS px/s) a fling has stopped. */
const FLING_STOP = 12;
/** How long after the finger lifts (and the fling ends) before the view drifts home. */
const HOME_AFTER_MS = 2400;
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
  /** Where it stands relative to the beacon she is at, in world pixels (behind her on the path, to one side). */
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
  private readonly sections: SectionArt;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: GemStyle,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
    this.sections = loadSectionArt(() => this.wake());
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

  /** World pixels to screen pixels: the page fills the width. */
  private get scale(): number {
    return this.w / SECTION_W;
  }

  private toScreen(p: Pt): Pt {
    return { x: p.x * this.scale, y: this.h * BASELINE - (p.y - this.camera) * this.scale };
  }

  private toWorldY(sy: number): number {
    return this.camera + (this.h * BASELINE - sy) / this.scale;
  }

  /** Where the view may travel: from the first page to a little above her lantern (all of it in review mode). */
  private cameraRange(): { lo: number; hi: number } {
    const opts = this.opts;
    // Scrolled all the way back, the first page's bottom edge meets the bottom of the screen.
    const lo = (this.h * (1 - BASELINE)) / this.scale;
    const top = opts?.review ? REVIEW_TOP : opts ? Math.max(opts.from, opts.to) : 1;
    const hi = lanternWorld(top).y + (opts?.review ? 0 : (this.h * LOOK_AHEAD) / this.scale);
    return { lo, hi: Math.max(lo, hi) };
  }

  /** A camera height no lower than the first page's floor, so the night below the world never shows at the first beacons. */
  private floored(y: number): number {
    return Math.max(this.cameraRange().lo, y);
  }

  /** Where the view rests on its own: her lantern (the one she hops to once it is lit). */
  private get home(): number {
    const opts = this.opts;
    if (!opts) return 0;
    return this.floored(lanternWorld(this.litTo ? opts.to : opts.from).y);
  }

  /** The beacon's foot beside the path for lantern n, in world px. */
  private beaconFoot(n: number): Pt {
    const l = lanternWorld(n);
    // Perpendicular to the path, on the recorded side, with the offset measured on screen.
    const off = BEACON_OFFSET / this.scale;
    return { x: l.x + l.dir.y * off * l.side, y: l.y - l.dir.x * off * l.side * 0.6 };
  }

  /** The screen point of the beacon's lamp for lantern n. */
  private lampOf(n: number): Pt {
    const foot = this.toScreen(this.beaconFoot(n));
    const area = sectionRef(sectionAt(lanternWorld(n).y).k).area;
    const beacon = this.art?.beacons[area];
    if (beacon) return { x: foot.x, y: foot.y - BEACON_H * BEACON_LAMP[area] };
    return postLayout(foot.x, foot.y, BEACON_H / 1.9).lantern;
  }

  /** The screen point a companion stands at for lantern n: on the path, at the lantern's point. */
  private perchOf(n: number): Pt {
    return this.toScreen(lanternWorld(n));
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
    return { x: Math.min(SECTION_W - margin, Math.max(margin, anchor.x + f.offset.x)), y: anchor.y + f.offset.y };
  }

  /** Where the group stands when nobody is hopping: her beacon's point on the path. */
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
    const k = clamp01((this.travelT - lag) / HOP_MS);
    const anchor = k <= 0 ? lanternWorld(opts.from) : k >= 1 ? lanternWorld(opts.to) : pathBetween(opts.from, opts.to, easeInOutSine(k));
    return { at: this.friendWorld(f, anchor), k, sinceLand: this.travelT - lag - HOP_MS };
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
    const earlier = this.litTo && this.phase === 'linger' && opts.onReplay ? this.earlierLanternAt(x, y) : null;
    if (earlier !== null && opts.onReplay) {
      this.phase = 'done';
      opts.onReplay(earlier);
      return;
    }
    this.twinkles.push({ x, y, t: 0, seed: this.twinkles.length });
    opts.onTwinkle?.();
    this.wake();
  }

  /** Whether a tap lands on the new lantern: its beacon, its lamp, or the companion perched by it. */
  private lanternAt(x: number, y: number): boolean {
    const opts = this.opts;
    if (!opts) return false;
    const foot = this.toScreen(this.beaconFoot(opts.to));
    const perch = this.perchOf(opts.to);
    const targets = [foot, this.lampOf(opts.to), perch, { x: perch.x, y: perch.y - COMPANION_S * 0.5 }];
    return targets.some((p) => Math.hypot(p.x - x, p.y - y) <= LANTERN_HIT);
  }

  /** A lit lantern behind her under the tap (its beacon or lamp), nearest first, or null. */
  private earlierLanternAt(x: number, y: number, below?: number): number | null {
    const opts = this.opts;
    if (!opts) return null;
    const top = below ?? opts.to;
    const { nLo, nHi } = this.lanternRange();
    let best: number | null = null;
    let bestD = LANTERN_HIT;
    for (let n = nLo; n < Math.min(top, nHi + 1); n++) {
      const foot = this.toScreen(this.beaconFoot(n));
      if (foot.y < -40 || foot.y > this.h + 40) continue;
      const lamp = this.lampOf(n);
      const d = Math.min(Math.hypot(foot.x - x, foot.y - y), Math.hypot(lamp.x - x, lamp.y - y));
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** The lanterns whose beacons could be on screen, plus one each side. */
  private lanternRange(): { nLo: number; nHi: number } {
    const bottom = this.toWorldY(this.h + BEACON_H * 2);
    const top = this.toWorldY(-BEACON_H * 2);
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
    return this.travelT < 0 || this.travelT >= HOP_MS + FRIEND_LAG_MS * this.friends.length + LAND_MS;
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
      // Only ambient life: a slow tick is plenty (DESIGN.md 4.4).
      this.active = false;
      this.idleTimer = setTimeout(() => {
        this.idleTimer = null;
        if (!this.running || this.active) return;
        this.frame(performance.now());
      }, 1000 / IDLE_FPS);
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
        const k = clamp01(this.phaseT / HOP_MS);
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
      if (this.bloomT < BLOOM_MS) moving = true;
      else this.bloomT = BLOOM_MS;
    }
    if (this.landT >= 0) {
      this.landT += dt;
      if (this.landT < LAND_MS) moving = true;
      else this.landT = -1;
    }
    if (this.swap) {
      this.swap.t += dt;
      moving = true;
      if (this.swap.t >= HOP_MS + LAND_MS) {
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
      // Left alone, the view drifts gently back to her lantern.
      this.camera += (this.home - this.camera) * Math.min(1, dt / 420);
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

  /** The area under the view's baseline and how far it has crossed into the next, over the last page's top third. */
  private areasNow(): { a: AreaTheme; b: AreaTheme; f: number } {
    const ref = sectionAt(this.camera);
    const a = areaTheme(ref.area);
    const next = sectionRef(ref.k + 1);
    if (ref.i < 2 || next.area === ref.area) return { a, b: a, f: 0 };
    const within = (this.camera - ref.k * SECTION_PITCH) / SECTION_PITCH;
    return { a, b: areaTheme(next.area), f: clamp01((within - 0.66) / 0.34) };
  }

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.time / 1000;
    const opts = this.opts;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { a, b, f } = this.areasNow();
    const colors = blendThemeColors(a, b, f);

    this.drawPages(colors);

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

    if (!opts) return;
    this.drawWorld(t, opts, colors);
    this.drawTwinkles();
    // The resting scene stays up until a grown-up opens the gate (DESIGN.md 3.8), so the dim moon shows where to hold.
    if (opts.rest) this.drawMoon();
  }

  /**
   * The painted pages under the view, bottom to top, each drawn a touch over the one below so the
   * seam can be softened with a breath of the area's own night colour. A page without its picture
   * shows the area's ground with a ribbon along the recorded path, so the journey is never blank.
   */
  private drawPages(colors: ReturnType<typeof blendThemeColors>): void {
    const { ctx, w, h } = this;
    const scale = this.scale;
    const pageH = SECTION_H * scale;
    const kLo = Math.max(0, sectionAt(this.toWorldY(h)).k);
    const kHi = sectionAt(Math.max(0, this.toWorldY(0))).k;
    // Below the first page (the view can give a little past the start): the first area's night.
    ctx.fillStyle = colors.bgBottom;
    ctx.fillRect(0, 0, w, h);
    const seamH = SEAM_OVERLAP * scale;
    for (let k = kLo; k <= kHi; k++) {
      const bottomY = this.toScreen({ x: 0, y: k * SECTION_PITCH }).y;
      const topY = bottomY - pageH;
      if (topY > h || bottomY < 0) continue;
      const img = this.sections.get(k);
      if (!img) {
        this.drawFallbackPage(k, topY, pageH);
        continue;
      }
      if (k === kLo || bottomY - seamH > h) {
        ctx.drawImage(img, 0, topY, w, pageH);
        continue;
      }
      // Over the page below, this page's bottom strip is feathered in across the overlap, so the
      // two paintings melt into each other instead of meeting at a line.
      const srcSeam = (SEAM_OVERLAP / SECTION_H) * img.naturalHeight;
      ctx.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight - srcSeam, 0, topY, w, pageH - seamH);
      const strip = this.seamStrip(w, seamH);
      const sc = strip.getContext('2d');
      if (sc) {
        sc.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        sc.globalCompositeOperation = 'source-over';
        sc.clearRect(0, 0, w, seamH);
        sc.drawImage(img, 0, img.naturalHeight - srcSeam, img.naturalWidth, srcSeam, 0, 0, w, seamH);
        sc.globalCompositeOperation = 'destination-in';
        const g = sc.createLinearGradient(0, 0, 0, seamH);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        sc.fillStyle = g;
        sc.fillRect(0, 0, w, seamH);
        ctx.drawImage(strip, 0, bottomY - seamH, w, seamH);
      }
    }
  }

  private seam: HTMLCanvasElement | null = null;

  /** A small offscreen canvas for feathering one page over the next, reused every frame. */
  private seamStrip(w: number, seamH: number): HTMLCanvasElement {
    const cw = Math.round(w * this.dpr);
    const ch = Math.round(seamH * this.dpr);
    if (!this.seam || this.seam.width !== cw || this.seam.height !== ch) {
      this.seam = document.createElement('canvas');
      this.seam.width = cw;
      this.seam.height = ch;
    }
    return this.seam;
  }

  /** A page without its picture: the area's ground and a ribbon along the recorded path. */
  private drawFallbackPage(k: number, topY: number, pageH: number): void {
    const { ctx, w } = this;
    const ref = sectionRef(k);
    const theme = areaTheme(ref.area);
    const g = ctx.createLinearGradient(0, topY, 0, topY + pageH);
    g.addColorStop(0, theme.groundFar);
    g.addColorStop(1, theme.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, topY, w, pageH);
    const first = k * LANTERNS_PER_AREA;
    // The painted path's centre line through this page, from the world's recorded points.
    const pts: Pt[] = [];
    const bottom = k * SECTION_PITCH;
    for (let i = 0; i <= 24; i++) {
      const y = bottom + (SECTION_H * i) / 24;
      pts.push(this.toScreen(this.pathAtWorldY(y)));
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, topY, w, pageH);
    ctx.clip();
    drawPathRibbon(ctx, pts, { path: theme.path, pathLit: theme.pathLit }, () => 22, this.opts && first < this.opts.to ? pts.length : 0);
    ctx.restore();
  }

  /** The path's point at a world height (for the fallback page): found along the lanterns' path. */
  private pathAtWorldY(y: number): Pt {
    let n = 1;
    while (lanternWorld(n + 1).y < y && n < REVIEW_TOP * 2) n++;
    const a = lanternWorld(n);
    const b = lanternWorld(n + 1);
    const f = b.y > a.y ? clamp01((y - a.y) / (b.y - a.y)) : 0;
    return pathBetween(n, n + 1, f);
  }

  /** The companion: painted when a picture exists for it, else drawn in code. */
  private drawAnyCompanion(ctx: CanvasRenderingContext2D, id: CompanionId, x: number, y: number, s: number, t: number, opts: CompanionOpts = {}): void {
    const picture = this.art?.companions[id];
    if (picture) drawPaintedCompanion(ctx, picture.awake, x, y, s, t, opts, picture.asleep);
    else drawCompanion(ctx, id, x, y, s, t, opts);
  }

  /**
   * A beacon standing at its foot: the area's painted design when it exists, else the code-drawn post. Unlit under lit so the light rises as a crossfade; the
   * lamp's own halo and its pool on the ground are code-drawn light.
   */
  private drawBeacon(n: number, lit: number, t: number): void {
    const { ctx } = this;
    const foot = this.toScreen(this.beaconFoot(n));
    if (foot.y < -BEACON_H * 2 || foot.y > this.h + BEACON_H) return;
    const area = sectionRef(sectionAt(lanternWorld(n).y).k).area;
    const beacon = this.art?.beacons[area];
    const lamp = this.lampOf(n);
    ctx.save();
    if (lit > 0.05) {
      // The pool of light on the ground around the foot.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(foot.x, foot.y - 2);
      ctx.scale(1, 0.38);
      glowDisc(ctx, 0, 0, BEACON_H * 0.95, this.style.palette.lanternGlow, 0.28 * lit * (0.925 + 0.075 * Math.sin(t * 0.9)));
      ctx.restore();
    }
    if (beacon) {
      const dh = BEACON_H;
      const dw = dh * (beacon.lit.naturalWidth / beacon.lit.naturalHeight);
      if (lit < 0.98) ctx.drawImage(beacon.unlit, foot.x - dw / 2, foot.y - dh, dw, dh);
      if (lit > 0.02) {
        ctx.globalAlpha = clamp01(lit);
        ctx.drawImage(beacon.lit, foot.x - dw / 2, foot.y - dh, dw, dh);
      }
    } else {
      drawLanternPost(ctx, foot.x, foot.y, BEACON_H / 1.9, lit, { ...this.style.palette }, t, '#9fb8ff', 1);
    }
    if (lit > 0.02) {
      // The lamp's own light: a warm halo the picture does not carry, breathing slowly.
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, lamp.x, lamp.y, BEACON_H * 0.62, this.style.palette.lanternGlow, (0.4 + 0.06 * Math.sin(t * 0.9)) * clamp01(lit));
      glowDisc(ctx, lamp.x, lamp.y, BEACON_H * 0.28, '#fff2cf', 0.26 * clamp01(lit));
    }
    ctx.restore();
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

    // The lit path between beacons she has passed: a soft glow along the painting, breathing very slowly.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let n = nLo; n < Math.min(walkedTo, nHi); n++) {
      const line = pathPolyline(n, n + 1, 8).map((p) => this.toScreen(p));
      if ((line[0] as Pt).y < -60 && (line[line.length - 1] as Pt).y < -60) continue;
      if ((line[0] as Pt).y > this.h + 60 && (line[line.length - 1] as Pt).y > this.h + 60) continue;
      ctx.strokeStyle = rgba(colors.pathLit, 0.1 + 0.04 * Math.sin(t * 0.6 + n));
      ctx.lineWidth = 14;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    }
    ctx.restore();

    // Beacons, far to near so nearer ones overlap farther ones: lit behind her, dim ahead, never greyed out.
    let bloomAt: Pt | null = null;
    for (let n = nHi; n >= nLo; n--) {
      let lit = opts.review || n < opts.to ? 1 : 0.1;
      if (!opts.review && n === opts.to && this.litTo) {
        // The new light rises over the bloom, with a brief soft overshoot that settles.
        const k = clamp01(this.bloomT / BLOOM_MS);
        lit = 0.1 + 0.9 * easeOutCubic(k) + 0.25 * Math.sin(k * Math.PI);
        if (k < 1) bloomAt = this.lampOf(n);
      }
      this.drawBeacon(n, lit, t + n * 0.7);
    }
    if (!opts.rest && !opts.review && this.litTo && this.phase === 'linger' && this.phaseT >= INVITE_AFTER_MS) {
      // The invitation: a slow breath of light around the new lantern until she taps it.
      const at = this.lampOf(opts.to);
      const rise = clamp01((this.phaseT - INVITE_AFTER_MS) / 1200);
      const breathK = 0.5 - 0.5 * Math.cos(((this.phaseT - INVITE_AFTER_MS) / INVITE_PERIOD_MS) * Math.PI * 2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, at.x, at.y, 34 + 26 * breathK, '#fff2cf', rise * (0.1 + 0.22 * breathK));
      glowDisc(ctx, at.x, at.y, 18 + 10 * breathK, colors.pathLit, rise * (0.08 + 0.18 * breathK));
      ctx.restore();
    }
    if (bloomAt) {
      const k = clamp01(this.bloomT / BLOOM_MS);
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
      let y = p.y;
      if (tr.k < 1) {
        // In the air behind her, a little lower than her own hop.
        const air = Math.sin(tr.k * Math.PI);
        y -= air * HOP_HEIGHT * FRIEND_HOP;
        Object.assign(pose, this.hopPose(tr.k, -1, dir));
      } else {
        const land = tr.sinceLand >= 0 && tr.sinceLand < LAND_MS ? Math.sin(clamp01(tr.sinceLand / LAND_MS) * Math.PI) : 0;
        pose.squash = 1 - 0.14 * land;
        // A wave of greeting after everyone has landed, fading out over a moment.
        const settled = tr.sinceLand - LAND_MS;
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
      const k = clamp01(this.swap.t / HOP_MS);
      const slotP = this.toScreen(this.swap.at);
      const sinceLand = this.swap.t - HOP_MS;
      const inP = this.arc(slotP, perchTo, k);
      const outP = this.arc(perchTo, slotP, k);
      this.drawAnyCompanion(ctx, this.swap.outgoing, outP.x, outP.y, FRIEND_S, t, { ...this.hopPose(k, sinceLand, Math.sign(slotP.x - perchTo.x)), glow: 0.9 });
      this.drawAnyCompanion(ctx, this.swap.incoming, inP.x, inP.y, COMPANION_S, t, { ...this.hopPose(k, sinceLand, Math.sign(perchTo.x - slotP.x)), glow: 1.1 });
    } else if (this.phase === 'hop') {
      // Along the painted path, in the air between the two beacons.
      const k = clamp01(this.phaseT / HOP_MS);
      const ground = this.toScreen(pathBetween(opts.from, opts.to, easeInOutSine(k)));
      const y = ground.y - Math.sin(k * Math.PI) * HOP_HEIGHT;
      const dir = Math.sign(lanternWorld(opts.to).x - lanternWorld(opts.from).x) || 1;
      this.drawAnyCompanion(ctx, this.companion, ground.x, y, COMPANION_S, t, { ...this.hopPose(k, -1, dir), glow: 1.15 });
    } else {
      const perch = this.litTo ? perchTo : this.perchOf(opts.from);
      const pose: CompanionOpts = { glow: 1.1 };
      if (this.landT >= 0) pose.squash = 1 - 0.14 * Math.sin(clamp01(this.landT / LAND_MS) * Math.PI);
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
    const land = sinceLand >= 0 && sinceLand < LAND_MS ? Math.sin(clamp01(sinceLand / LAND_MS) * Math.PI) : 0;
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
