/**
 * The map between levels (DESIGN.md 3.5): a winding vertical path of lanterns
 * through the current area. Her companion sits on the lantern she just lit,
 * hops to the next one, that lantern lights with a small bloom, and the map
 * stays until she taps the lit lantern (or her companion on it); the lantern
 * breathes gently after a moment as the invitation. Nothing moves on by
 * itself (a Stage 3 play-test decision: the four-second linger went by too
 * fast to see). On offered visits the other two creatures wait by the path
 * and a tap on one makes it her companion. In rest
 * (DESIGN.md 3.8) the companion curls up and sleeps on the new lantern and the
 * scene stays until the app hides it.
 *
 * A full-screen canvas overlay, display:none while not in use so it costs
 * nothing. It draws at full rate only while something moves and at a slow
 * idle tick otherwise (DESIGN.md 4.4). No text, ever.
 */
import './mapScene.css';
import { areaForLevel, type AreaId } from '../core/journey';
import { areaTheme, blendThemeColors, paintSky, type AreaTheme } from '../render/areas';
import { COMPANIONS, type CompanionId, type CompanionOpts, drawCompanion, drawPaintedCompanion } from '../render/creatures';
import { drawLanternPost, drawPathRibbon, drawSteppingLights, lanternPoint, type LanternPos, pathPoint, postLayout, smoothPolyline } from '../render/map';
import type { Pt } from '../render/shapes';
import { Stars, clamp01, easeInOutSine, easeOutCubic, glowDisc } from '../render/styles/common';
import { mix, rgba } from '../render/color';
import { BACKDROP_HORIZON, LANTERN_LAMP_FROM_BOTTOM, type MapArt } from '../render/mapArt';
import { createRng, deriveSeed } from '../shared/rng';
import type { Ambient, GemStyle } from '../render/styles/types';

export interface MapShowOptions {
  /** The lantern she just lit (where the companion starts) and the one she hops to. */
  from: number;
  to: number;
  companion: CompanionId;
  /** The other creatures wait by the path and can be picked (first visit, first lantern of an area). */
  offerCompanions: boolean;
  /** The resting scene: she falls asleep on the new lantern and the scene never ends on its own. */
  rest: boolean;
  /** The moment the new lantern lights (the app plays a warm chord). */
  onLight?(): void;
  /** She tapped a waiting creature; it is now her companion. */
  onPick?(id: CompanionId): void;
  /** A tap in the resting scene made a star twinkle (the app plays a very soft chime). */
  onTwinkle?(): void;
  /** The scene is finished (never called in rest). */
  onDone(): void;
  /** She tapped a lit lantern behind her: play that level again (the journey does not move). */
  onReplay?(level: number): void;
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
/** Taps during the fade-in are the tail of a board tap, not a wish to move on. */
const TAP_GUARD_MS = 400;

// Touch rules shared with the board (src/game/input.ts, DESIGN.md 3.3).
const TAP_MAX_MS = 700;
const TAP_MAX_PX = 12;
const PARK_AFTER_MS = 500;
const PARK_STILL_PX = 6;
/** Generous target around a waiting creature, in CSS px (about 44 pt). */
const FRIEND_HIT = 44;

const IDLE_FPS = 12;

// Composition: about five lanterns on screen, hers a little below centre (DESIGN.md 3.5).
const FRAME_LANTERNS = 5.6;
const BASELINE = 0.58;
const HORIZON = 0.17;
const PATH_HALF = 0.3;
// Sizes after the Stage 3 play-test art pass: a wider road, bigger lanterns and creatures.
const LANTERN_S = 40;
const COMPANION_S = 58;
const FRIEND_S = 50;
const HOP_HEIGHT = 78;
const PATH_WIDTH = 48;
const SPLINE_PER = 12;
/** Flora beside the path: items per lantern stretch, placed by a seeded rng so the same stretch always looks the same. */
const FLORA_PER_LANTERN = 7;
const FLORA_SEED = 0x666c6f72;

type FloraKind = 'tuft' | 'flower' | 'stone' | 'mushroom';

interface Flora {
  kind: FloraKind;
  /** In lantern units (x across the path's width, y along the path). */
  x: number;
  y: number;
  size: number;
  phase: number;
}

type Phase = 'idle' | 'enter' | 'hop' | 'linger' | 'done';

interface Tracked {
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  moved: boolean;
}

interface Friend {
  id: CompanionId;
  /** Where it waits, in lantern units. */
  slot: LanternPos;
}

interface Swap {
  incoming: CompanionId;
  outgoing: CompanionId;
  slot: LanternPos;
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
  private swap: Swap | null = null;
  private twinkles: Twinkle[] = [];
  private sleepiness = 0;

  private readonly ambients = new Map<AreaId, Ambient>();
  private restStars: Stars | null = null;
  private skyStars: Stars | null = null;
  private readonly flora = new Map<number, Flora[]>();
  private readonly pointers = new Map<number, Tracked>();
  private primary: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly style: GemStyle,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('no 2d context');
    this.ctx = ctx;
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
    this.twinkles = [];
    this.sleepiness = 0;
    this.camera = lanternPoint(opts.from).y;
    this.friends = opts.offerCompanions && !opts.rest ? this.layoutFriends(opts.to, opts.companion) : [];
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

  // ---------------------------------------------------------------- layout

  private camera = 1;

  private get spacing(): number {
    return this.h / FRAME_LANTERNS;
  }

  private get horizonY(): number {
    return this.h * HORIZON;
  }

  /**
   * Lantern units to screen. The path's sideways reach narrows toward the
   * horizon (a hint of perspective), so the way ahead gathers into the distance.
   */
  private toScreen(p: LanternPos): Pt {
    const y = this.h * BASELINE - (p.y - this.camera) * this.spacing;
    return { x: this.w / 2 + p.x * this.w * PATH_HALF * this.reachAt(y), y };
  }

  /** How wide the world is at a screen height: full at her lantern and below, gathering in toward the horizon. */
  private reachAt(y: number): number {
    return 0.55 + 0.45 * clamp01((y - this.horizonY) / (this.h * (BASELINE - HORIZON)));
  }

  /** Things fade as they near the horizon. */
  private fog(p: Pt): number {
    return clamp01((p.y - this.horizonY) / (this.h * 0.14));
  }

  /** A hint of distance: full size at her lantern and below, a little smaller toward the horizon. */
  private sizeAt(y: number): number {
    return 0.78 + 0.22 * clamp01((y - this.horizonY) / (this.h * (BASELINE - HORIZON)));
  }

  private lanternSizeAt(p: Pt): number {
    return LANTERN_S * this.sizeAt(p.y);
  }

  /** The screen point a companion sits at on lantern n. */
  private perchOf(n: number): Pt {
    const p = this.toScreen(lanternPoint(n));
    return postLayout(p.x, p.y, this.lanternSizeAt(p)).perch;
  }

  /**
   * The two waiting spots for her friends: by the path either side of lantern
   * `to`, a little in front of it, moved further down when the lantern itself
   * stands close to that side. Deterministic, so a visit always looks the same.
   */
  private layoutFriends(to: number, current: CompanionId): Friend[] {
    const lantern = lanternPoint(to);
    const others = COMPANIONS.filter((c) => c !== current);
    const slots: LanternPos[] = [-0.95, 0.95].map((x) => ({ x, y: lantern.y - (Math.abs(lantern.x - x) < 0.55 ? 0.72 : 0.3) }));
    // The nearer slot (lower on screen) goes to the first friend so the pair reads left to right.
    return others.map((id, i) => ({ id, slot: slots[i] as LanternPos }));
  }

  private slotScreen(slot: LanternPos): Pt {
    const p = this.toScreen(slot);
    return { x: p.x, y: p.y - FRIEND_S * 0.4 };
  }

  // ------------------------------------------------------------------ input

  private isResting(p: Tracked, now: number): boolean {
    return !p.moved && Math.hypot(p.x - p.x0, p.y - p.y0) <= PARK_STILL_PX && now - p.t0 >= PARK_AFTER_MS;
  }

  private readonly down = (e: PointerEvent): void => {
    if (!this.shown) return;
    const now = performance.now();
    this.pointers.set(e.pointerId, { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, moved: false });
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* not all browsers allow capture here */
    }
    const current = this.primary !== null ? this.pointers.get(this.primary) : undefined;
    if (!current || this.isResting(current, now)) this.primary = e.pointerId;
  };

  private readonly move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.x0, p.y - p.y0) > TAP_MAX_PX) p.moved = true;
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
  }

  private tap(x: number, y: number): void {
    const opts = this.opts;
    if (!opts || !this.shown || this.phase === 'idle' || this.phase === 'done') return;
    if (this.phase === 'enter' && this.phaseT < TAP_GUARD_MS) return;
    if (opts.rest) {
      if (!this.litTo) return;
      this.twinkles.push({ x, y, t: 0, seed: this.twinkles.length });
      opts.onTwinkle?.();
      this.wake();
      return;
    }
    const friend = this.friendAt(x, y);
    if (friend) {
      if (this.phase === 'linger' && !this.swap) this.pick(friend);
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

  /** Whether a tap lands on the new lantern: its post, its light, or the companion perched on it. */
  private lanternAt(x: number, y: number): boolean {
    const opts = this.opts;
    if (!opts) return false;
    const base = this.toScreen(lanternPoint(opts.to));
    const layout = postLayout(base.x, base.y, this.lanternSizeAt(base));
    const targets = [base, layout.lantern, layout.perch];
    return targets.some((p) => Math.hypot(p.x - x, p.y - y) <= LANTERN_HIT);
  }

  /** A lit lantern behind her under the tap (its post or light), nearest first, or null. */
  private earlierLanternAt(x: number, y: number): number | null {
    const opts = this.opts;
    if (!opts) return null;
    const { nLo } = this.lanternRange();
    let best: number | null = null;
    let bestD = LANTERN_HIT;
    for (let n = nLo; n < opts.to; n++) {
      const base = this.toScreen(lanternPoint(n));
      if (this.fog(base) <= 0.01 || base.y > this.h + 40) continue;
      const light = postLayout(base.x, base.y, this.lanternSizeAt(base)).lantern;
      const d = Math.min(Math.hypot(base.x - x, base.y - y), Math.hypot(light.x - x, light.y - y));
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  /** The lanterns in view, plus one each side so the curve has its neighbours. */
  private lanternRange(): { nLo: number; nHi: number } {
    const { h } = this;
    const span = this.spacing;
    const nLo = Math.max(1, Math.floor(this.camera - (h - h * BASELINE) / span) - 1);
    const nHi = Math.ceil(this.camera + (h * BASELINE - this.horizonY) / span) + 1;
    return { nLo, nHi };
  }

  /** Called by the app for a continue it owes elsewhere (the debug hook); same as a tap on the lantern. */
  continueNow(): void {
    if (!this.litTo) this.light();
    this.finish();
  }

  private friendAt(x: number, y: number): Friend | null {
    let best: Friend | null = null;
    let bestD = Infinity;
    for (const f of this.friends) {
      const p = this.slotScreen(f.slot);
      const d = Math.hypot(p.x - x, p.y - y);
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
    this.swap = { incoming: friend.id, outgoing: this.companion, slot: friend.slot, t: 0 };
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
    if (this.opts) this.camera = lanternPoint(this.opts.to).y;
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
        }
        break;
      case 'hop': {
        moving = true;
        const k = clamp01(this.phaseT / HOP_MS);
        this.camera = lanternPoint(opts.from).y + (lanternPoint(opts.to).y - lanternPoint(opts.from).y) * easeInOutSine(k);
        if (k >= 1) this.light();
        break;
      }
      case 'linger':
        if (opts.rest) {
          if (this.phaseT > SLEEP_AFTER_MS && this.sleepiness < 1) {
            this.sleepiness = clamp01((this.phaseT - SLEEP_AFTER_MS) / SLEEP_MS);
            moving = true;
          }
        } else if (this.phaseT >= INVITE_AFTER_MS) {
          // The map waits for her tap; the lantern breathes as the invitation, which needs frames.
          moving = true;
        }
        break;
      case 'idle':
      case 'done':
        break;
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
        this.friends.push({ id: this.swap.outgoing, slot: this.swap.slot });
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

  // ----------------------------------------------------------------- drawing

  private ambientFor(id: AreaId): Ambient {
    let a = this.ambients.get(id);
    if (!a) {
      a = areaTheme(id).createAmbient(this.w, this.h, 5);
      this.ambients.set(id, a);
    }
    return a;
  }

  /** The area the camera is in, and how far it has crossed into the next one. */
  private areasNow(): { a: AreaTheme; b: AreaTheme; f: number } {
    const opts = this.opts;
    const from = opts ? opts.from : 1;
    const to = opts ? opts.to : 1;
    const span = lanternPoint(to).y - lanternPoint(from).y;
    const k = span !== 0 ? clamp01((this.camera - lanternPoint(from).y) / span) : 1;
    const a = areaTheme(areaForLevel(from));
    const b = areaTheme(areaForLevel(to));
    return { a, b, f: a.id === b.id ? 0 : k };
  }

  private draw(): void {
    const { ctx, w, h } = this;
    const t = this.time / 1000;
    const opts = this.opts;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { a, b, f } = this.areasNow();
    const colors = blendThemeColors(a, b, f);
    paintSky(ctx, w, h, colors);
    const painted = this.backdropAlpha(a, b, f);
    this.drawBackdrop(painted);

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
      if (!this.restStars) this.restStars = new Stars(w, h * 0.6, 21, Math.max(30, Math.round((w * h) / 7000)), '#e6ecff', 0.8);
      ctx.save();
      ctx.globalAlpha = this.sleepiness;
      this.restStars.draw(ctx, w, h, t);
      ctx.restore();
    }

    // A field of slow stars over every area's sky (the art pass): small, faint, twinkling over seconds.
    if (!this.skyStars) this.skyStars = new Stars(w, h * 0.55, 31, Math.max(40, Math.round((w * h) / 5200)), '#eef2ff', 0.55);
    this.skyStars.draw(ctx, w, h, t);

    // Horizon glow behind the scenery.
    const hy = this.horizonY;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(w / 2, hy + 6);
    ctx.scale(1, 0.22);
    glowDisc(ctx, 0, 0, w * 0.75, colors.accent, 0.16);
    glowDisc(ctx, 0, 0, w * 0.5, colors.glowLow, 0.4);
    ctx.restore();

    // Scenery and ground: the incoming area fully, the outgoing one fading over it.
    // Where the painted backdrop shows, the code-drawn ground gives way to it.
    if (painted < 1) {
      ctx.save();
      ctx.globalAlpha = 1 - painted;
      if (f > 0) b.drawScenery(ctx, w, h, t, hy);
      if (f < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - f;
        a.drawScenery(ctx, w, h, t, hy);
        ctx.restore();
      }
      this.drawHills(colors);
      ctx.restore();
    }
    this.drawVignette();

    if (!opts) return;
    this.drawWorld(t, opts, colors);
    this.drawTwinkles();
    // The resting scene stays up until a grown-up opens the gate (DESIGN.md 3.8), so the dim moon shows where to hold.
    if (opts.rest) this.drawMoon();
  }

  private moon: HTMLCanvasElement | null = null;
  /** Painted pieces (art round two); anything missing is drawn in code. */
  private art: MapArt | null = null;

  private roadPattern: CanvasPattern | null = null;

  setArt(art: MapArt): void {
    this.art = art;
    this.roadPattern = null;
    this.wake();
  }

  /** The painted road surface as a repeating pattern, scaled for the screen. */
  private roadTexture(): CanvasPattern | null {
    if (this.roadPattern) return this.roadPattern;
    const img = this.art?.road;
    if (!img) return null;
    const pattern = this.ctx.createPattern(img, 'repeat');
    if (!pattern) return null;
    const scale = 64 / img.naturalWidth;
    pattern.setTransform(new DOMMatrix().scale(scale, scale));
    this.roadPattern = pattern;
    return pattern;
  }

  /** The companion: painted when a picture exists for it, else drawn in code. */
  private drawAnyCompanion(ctx: CanvasRenderingContext2D, id: CompanionId, x: number, y: number, s: number, t: number, opts: CompanionOpts = {}): void {
    const picture = this.art?.companions[id];
    if (picture) drawPaintedCompanion(ctx, picture.awake, x, y, s, t, opts, picture.asleep);
    else drawCompanion(ctx, id, x, y, s, t, opts);
  }

  /** How much of the painted meadow backdrop shows right now: 1 in the meadow, fading at its borders. */
  private backdropAlpha(a: AreaTheme, b: AreaTheme, f: number): number {
    if (!this.art?.backdrop) return 0;
    if (a.id === 'meadow') return 1 - f;
    if (b.id === 'meadow') return f;
    return 0;
  }

  /** The painted backdrop, scaled so its horizon sits on the map's horizon and its ground reaches the bottom edge. */
  private drawBackdrop(alpha: number): void {
    const img = this.art?.backdrop;
    if (!img || alpha <= 0) return;
    const { ctx, w, h } = this;
    const hy = this.horizonY;
    const scale = Math.max((h - hy) / (img.naturalHeight * (1 - BACKDROP_HORIZON)), w / img.naturalWidth);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const x = (w - dw) / 2 - this.camera * 6;
    const y = hy - BACKDROP_HORIZON * dh;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x, y, dw, dh);
    ctx.restore();
  }

  /** A painted lantern post standing at (x, groundY), unlit under lit so the light rises as a crossfade. */
  private drawPaintedLantern(x: number, groundY: number, s: number, lit: number, alpha: number, t: number): boolean {
    const litImg = this.art?.lanternLit;
    const unlitImg = this.art?.lanternUnlit;
    if (!litImg || !unlitImg) return false;
    const { ctx } = this;
    const dh = (s * 1.32) / LANTERN_LAMP_FROM_BOTTOM;
    const dw = dh * (litImg.naturalWidth / litImg.naturalHeight);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (lit > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(x, groundY + s * 0.05);
      ctx.scale(1, 0.38);
      glowDisc(ctx, 0, 0, s * 1.9, this.style.palette.lanternGlow, 0.3 * lit * (0.925 + 0.075 * Math.sin(t * 0.9)));
      ctx.restore();
    }
    if (lit < 0.98) ctx.drawImage(unlitImg, x - dw / 2, groundY - dh, dw, dh);
    if (lit > 0.02) {
      ctx.globalAlpha = alpha * clamp01(lit);
      ctx.drawImage(litImg, x - dw / 2, groundY - dh, dw, dh);
      // The lamp's own light: a warm halo the picture does not carry, breathing slowly.
      const lamp = postLayout(x, groundY, s).lantern;
      ctx.globalCompositeOperation = 'lighter';
      glowDisc(ctx, lamp.x, lamp.y, s * 1.5, this.style.palette.lanternGlow, (0.42 + 0.06 * Math.sin(t * 0.9)) * clamp01(lit));
      glowDisc(ctx, lamp.x, lamp.y, s * 0.7, '#fff2cf', 0.28 * clamp01(lit));
    }
    ctx.restore();
    return true;
  }

  /** The same dim moon the board draws at (12,14), baked so the cut-out never erases the scene beneath. */
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

  /**
   * Rolling ground between the horizon and her feet (the art pass): three soft hill bands in the
   * area's ground colours, each a little lighter and bluer with distance, with a faint crest of the
   * area's light, drifting slowly against the camera so the land feels deep.
   */
  private drawHills(colors: ReturnType<typeof blendThemeColors>): void {
    const { ctx, w, h } = this;
    const hy = this.horizonY;
    const drift = this.camera * 18;
    const bands: Array<[number, number, number, number, number]> = [
      // base (fraction of the way from horizon to the bottom), amplitude, frequency, phase, distance 0..1
      [0.08, 26, 0.0075, 0.4, 1],
      [0.27, 36, 0.0058, 2.3, 0.6],
      [0.5, 44, 0.0046, 4.1, 0.25],
    ];
    for (const [base, amp, k, phase, far] of bands) {
      const y0 = hy + (h - hy) * base;
      const color = mix(colors.ground, mix(colors.groundFar, colors.bgBottom, 0.5), far * 0.75);
      const crest = rgba(colors.accent, 0.05 + 0.05 * (1 - far));
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, this.ridge(x + drift * (1 - far), y0, amp, k, phase));
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = crest;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x <= w + 8; x += 8) {
        const y = this.ridge(x + drift * (1 - far), y0, amp, k, phase) + 1;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  private ridge(x: number, base: number, amp: number, k: number, phase: number): number {
    return base + Math.sin(x * k + phase) * amp + Math.sin(x * k * 2.3 + phase * 1.7) * amp * 0.35;
  }

  /** The flora beside lantern stretch n, made once from a seed so the same stretch always looks the same. */
  private floraFor(n: number): Flora[] {
    let list = this.flora.get(n);
    if (list) return list;
    const rng = createRng(deriveSeed(FLORA_SEED, n));
    list = [];
    for (let i = 0; i < FLORA_PER_LANTERN; i++) {
      const f = rng.range(0.05, 0.95);
      const along = pathPoint(n, f);
      const side = rng.next() < 0.5 ? -1 : 1;
      const r = rng.next();
      const kind: FloraKind = r < 0.4 ? 'tuft' : r < 0.65 ? 'flower' : r < 0.85 ? 'mushroom' : 'stone';
      list.push({ kind, x: along.x + side * rng.range(0.22, 0.7), y: along.y, size: rng.range(0.8, 1.3), phase: rng.range(0, Math.PI * 2) });
    }
    list.sort((a, b) => a.y - b.y);
    this.flora.set(n, list);
    return list;
  }

  /** Glowing tufts, flowers, mushrooms and stones beside the path, in the area's light (the art pass). */
  private drawFlora(ctx: CanvasRenderingContext2D, items: readonly Flora[], t: number, colors: ReturnType<typeof blendThemeColors>): void {
    for (const it of items) {
      const p = this.toScreen({ x: Math.max(-1.05, Math.min(1.05, it.x)), y: it.y });
      const alpha = this.fog(p);
      if (alpha <= 0.02 || p.y > this.h + 40) continue;
      const s = 11 * it.size * this.sizeAt(p.y);
      const glow = 0.6 + 0.4 * Math.sin(t * 0.7 + it.phase);
      ctx.save();
      ctx.globalAlpha = alpha;
      const picture = this.art?.props[it.kind];
      if (picture) {
        // A painted plant or stone, its foot on the ground, breathing a little of the area's light.
        const dh = s * 1.9;
        const dw = dh * (picture.naturalWidth / picture.naturalHeight);
        ctx.drawImage(picture, p.x - dw / 2, p.y - dh * 0.9, dw, dh);
        if (it.kind !== 'stone') {
          ctx.globalCompositeOperation = 'lighter';
          glowDisc(ctx, p.x, p.y - s * 0.8, s * 1.5, colors.accent, 0.12 * glow);
        }
        ctx.restore();
        continue;
      }
      switch (it.kind) {
        case 'tuft': {
          ctx.strokeStyle = rgba(mix(colors.ground, colors.accent, 0.45), 0.9);
          ctx.lineWidth = Math.max(1, s * 0.12);
          ctx.lineCap = 'round';
          for (let b = -2; b <= 2; b++) {
            const lean = b * 0.35 + Math.sin(t * 0.8 + it.phase + b) * 0.08;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.quadraticCurveTo(p.x + lean * s * 0.6, p.y - s * 0.9, p.x + lean * s * 1.3, p.y - s * (1.4 + 0.2 * Math.abs(b)));
            ctx.stroke();
          }
          glowDisc(ctx, p.x, p.y - s * 0.6, s * 1.4, colors.accent, 0.1 * glow);
          break;
        }
        case 'flower': {
          const cy = p.y - s * 0.9;
          ctx.strokeStyle = rgba(mix(colors.ground, colors.accent, 0.35), 0.9);
          ctx.lineWidth = Math.max(1, s * 0.1);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.quadraticCurveTo(p.x + s * 0.15, p.y - s * 0.5, p.x, cy);
          ctx.stroke();
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glowDisc(ctx, p.x, cy, s * 1.6, colors.accent, 0.28 * glow);
          ctx.restore();
          for (let k = 0; k < 5; k++) {
            const a = (k / 5) * Math.PI * 2 + it.phase;
            ctx.fillStyle = rgba(mix(colors.accent, '#ffffff', 0.35), 0.95);
            ctx.beginPath();
            ctx.ellipse(p.x + Math.cos(a) * s * 0.32, cy + Math.sin(a) * s * 0.32, s * 0.22, s * 0.14, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#fff6d6';
          ctx.beginPath();
          ctx.arc(p.x, cy, s * 0.16, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case 'mushroom': {
          const capY = p.y - s * 0.75;
          ctx.fillStyle = rgba(mix(colors.groundFar, '#ffffff', 0.35), 0.95);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - s * 0.35, s * 0.18, s * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glowDisc(ctx, p.x, capY, s * 1.5, colors.accent, 0.22 * glow);
          ctx.restore();
          ctx.fillStyle = mix(colors.accent, colors.path, 0.3);
          ctx.beginPath();
          ctx.ellipse(p.x, capY, s * 0.62, s * 0.42, 0, Math.PI, Math.PI * 2);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.55);
          for (const [dx, dy, r] of [[-0.25, -0.12, 0.09], [0.18, -0.2, 0.07], [0.32, 0, 0.05]] as const) {
            ctx.beginPath();
            ctx.arc(p.x + dx * s, capY + dy * s, r * s, 0, Math.PI * 2);
            ctx.fill();
          }
          break;
        }
        case 'stone': {
          ctx.fillStyle = mix(colors.groundFar, colors.path, 0.4);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - s * 0.2, s * 0.6, s * 0.38, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = rgba('#ffffff', 0.12);
          ctx.beginPath();
          ctx.ellipse(p.x - s * 0.15, p.y - s * 0.32, s * 0.3, s * 0.14, -0.4, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
      }
      ctx.restore();
    }
  }

  private drawVignette(): void {
    const { ctx, w, h } = this;
    // Depth on the ground: deeper shadow toward her feet, nothing added at the horizon.
    const hy = this.horizonY;
    const d = ctx.createLinearGradient(0, hy, 0, h);
    d.addColorStop(0, 'rgba(0,0,0,0)');
    d.addColorStop(0.3, 'rgba(0,0,0,0)');
    d.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = d;
    ctx.fillRect(0, hy, w, h - hy);
    const g = ctx.createRadialGradient(w / 2, h * 0.5, h * 0.35, w / 2, h * 0.5, h * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  private drawWorld(t: number, opts: MapShowOptions, colors: ReturnType<typeof blendThemeColors>): void {
    const { ctx, h } = this;
    const pal = { ...this.style.palette, path: colors.path, pathLit: colors.pathLit };
    const walkedTo = this.litTo ? opts.to : opts.from;

    const { nLo, nHi } = this.lanternRange();
    const pts: Pt[] = [];
    for (let n = nLo; n <= nHi; n++) pts.push(this.toScreen(lanternPoint(n)));
    const smooth = smoothPolyline(pts, SPLINE_PER);
    const fade = (p: Pt): number => this.fog(p);
    const hy = this.horizonY;
    // The path stays on the ground: nothing of it is drawn above the horizon.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, hy + 6, this.w, h);
    ctx.clip();
    // Over the painted meadow the road is a little translucent, so the grass shows through its edges.
    ctx.globalAlpha = 1 - 0.22 * this.backdropAlpha(this.areasNow().a, this.areasNow().b, this.areasNow().f);
    drawPathRibbon(ctx, smooth, { path: colors.path, pathLit: colors.pathLit, texture: this.backdropAlpha(this.areasNow().a, this.areasNow().b, this.areasNow().f) > 0 ? this.roadTexture() : null }, (i) => PATH_WIDTH * (0.35 + 0.65 * this.sizeAt((smooth[i] as Pt).y)), (walkedTo - nLo) * SPLINE_PER, { clearY: hy + 8, solidY: hy + h * 0.17 });
    ctx.globalAlpha = 1;
    for (let n = nLo; n < walkedTo && n < nHi; n++) {
      const i = n - nLo;
      const seg = smooth.slice(i * SPLINE_PER, (i + 1) * SPLINE_PER + 1);
      const mid = seg[Math.floor(seg.length / 2)];
      if (mid) drawSteppingLights(ctx, seg, colors.pathLit, t, n, fade(mid));
    }
    ctx.restore();

    // Flora beside the path, far to near so nearer plants overlap farther ones.
    for (let n = nHi; n >= nLo; n--) this.drawFlora(ctx, this.floraFor(n), t, colors);

    // Lanterns: lit behind her, a faint cool glow ahead, never greyed out.
    let bloomAt: Pt | null = null;
    for (let n = nLo; n <= nHi; n++) {
      const p = this.toScreen(lanternPoint(n));
      const alpha = this.fog(p);
      if (alpha <= 0.01 || p.y > h + 80) continue;
      let lit = n < opts.to ? 1 : 0.1;
      if (n === opts.to && this.litTo) {
        // The new light rises over the bloom, with a brief soft overshoot that settles.
        const k = clamp01(this.bloomT / BLOOM_MS);
        lit = 0.1 + 0.9 * easeOutCubic(k) + 0.25 * Math.sin(k * Math.PI);
        if (k < 1) bloomAt = postLayout(p.x, p.y, this.lanternSizeAt(p)).lantern;
      }
      if (!this.drawPaintedLantern(p.x, p.y, this.lanternSizeAt(p), lit, alpha, t + n * 0.7)) drawLanternPost(ctx, p.x, p.y, this.lanternSizeAt(p), lit, pal, t + n * 0.7, colors.accent, alpha);
    }
    if (!opts.rest && this.litTo && this.phase === 'linger' && this.phaseT >= INVITE_AFTER_MS) {
      // The invitation: a slow breath of light around the new lantern until she taps it.
      const p = this.toScreen(lanternPoint(opts.to));
      const at = postLayout(p.x, p.y, this.lanternSizeAt(p)).lantern;
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

    // Friends waiting by the path, turned toward her, waving as she passes.
    const perchTo = this.perchOf(opts.to);
    const waveNow = this.phase === 'hop' ? 1 : this.phase === 'linger' && this.phaseT < WAVE_AFTER_HOP_MS ? 1 - easeInOutSine(clamp01((this.phaseT - WAVE_AFTER_HOP_MS + 700) / 700)) : 0;
    for (const [i, fr] of this.friends.entries()) {
      const p = this.slotScreen(fr.slot);
      const bob = Math.sin(t * 1.2 + i * 2.1) * 2;
      glowDisc(ctx, p.x, p.y + FRIEND_S * 0.4, FRIEND_S * 0.6, colors.pathLit, 0.1);
      this.drawAnyCompanion(ctx, fr.id, p.x, p.y + bob, FRIEND_S * this.sizeAt(p.y), t + i * 1.3, { glow: 0.85, facing: p.x < perchTo.x ? 1 : -1, wave: waveNow });
    }

    // The companion: entering, hopping, landed, or asleep.
    const companionSize = COMPANION_S * this.sizeAt(perchTo.y);
    if (this.swap) {
      const k = clamp01(this.swap.t / HOP_MS);
      const slotP = this.slotScreen(this.swap.slot);
      const sinceLand = this.swap.t - HOP_MS;
      const inP = this.arc(slotP, perchTo, k);
      const outP = this.arc(perchTo, slotP, k);
      this.drawAnyCompanion(ctx, this.swap.outgoing, outP.x, outP.y, FRIEND_S, t, { ...this.hopPose(k, sinceLand, Math.sign(slotP.x - perchTo.x)), glow: 0.9 });
      this.drawAnyCompanion(ctx, this.swap.incoming, inP.x, inP.y, companionSize, t, { ...this.hopPose(k, sinceLand, Math.sign(perchTo.x - slotP.x)), glow: 1.1 });
    } else if (this.phase === 'hop') {
      const k = clamp01(this.phaseT / HOP_MS);
      const e = easeInOutSine(k);
      const u = opts.from + (opts.to - opts.from) * e;
      const n = Math.min(opts.to - 1, Math.floor(u));
      const ground = this.toScreen(pathPoint(n, u - n));
      const perch = postLayout(ground.x, ground.y, this.lanternSizeAt(ground)).perch;
      const y = perch.y - Math.sin(k * Math.PI) * HOP_HEIGHT;
      const dir = Math.sign(lanternPoint(opts.to).x - lanternPoint(opts.from).x) || 1;
      this.drawAnyCompanion(ctx, this.companion, perch.x, y, COMPANION_S * this.sizeAt(perch.y), t, { ...this.hopPose(k, -1, dir), glow: 1.15 });
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
      glowDisc(ctx, perch.x, perch.y, companionSize * 0.7, colors.pathLit, 0.12);
      this.drawAnyCompanion(ctx, this.companion, perch.x, perch.y + bob, companionSize, t, pose);
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
      glowDisc(ctx, tw.x, tw.y, r * 1.8, '#fff3d6', 0.5 * fadeOut);
      ctx.strokeStyle = `rgba(255,250,235,${0.85 * fadeOut})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(tw.x - r * grow, tw.y);
      ctx.lineTo(tw.x + r * grow, tw.y);
      ctx.moveTo(tw.x, tw.y - r * grow);
      ctx.lineTo(tw.x, tw.y + r * grow);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${fadeOut})`;
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
