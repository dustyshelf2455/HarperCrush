/**
 * The grown-up gate (DESIGN.md 3.9 and 2c): two deliberate steps, the second
 * needing reading. Step 1 is a 1.5 s hold on the dim moon the view draws in
 * the top-left corner; a thin ring draws itself around the moon, almost
 * invisible until the last half second. Step 2 is a small panel of eight
 * word tiles with an instruction such as "Tap STAR, then MOON". Every
 * failure is quiet: the ring or the panel fades, no sound, and after a wrong
 * tap the gate ignores the moon for a while (GateCooldown).
 *
 * The DOM is built here and appended to the host (#stage). It sits above the
 * board's touch surface and the map scene, and never lets a touch through.
 * The pure parts (word choice, cooldown) are exported for the tests.
 */
import type { Rng } from '../shared/rng';
import { createRng } from '../shared/rng';
import './gate.css';

export const GATE_WORDS: readonly string[] = ['MOON', 'STAR', 'LEAF', 'FISH', 'SNOW', 'GEM', 'TREE', 'BOAT'];

/** The hold on the moon (DESIGN.md 3.9: "Hold it for 1.5 seconds"). */
export const HOLD_MS = 1500;
/** The ring stays very faint until the last half second (3.9), so a casual hold shows almost nothing. */
const FAINT_UNTIL = (HOLD_MS - 500) / HOLD_MS;
/** A finger that drifts this far is a swipe, not a hold. */
const MOVE_CANCEL_PX = 8;
/** A fingertip reports well under this; a palm or a flat finger reports more (3.9: "large contact area"). */
const BIG_CONTACT_PX = 28;
/** The tiles arm only once the panel has been fully visible for half a second (3.9). */
const ARM_DELAY_MS = 500;
const PANEL_FADE_MS = 250;
/** A clean tap: down and up inside one tile, no other finger, and quick. A held finger is not a tap. */
const TAP_MAX_MS = 500;
/** The word panel fades out on its own if nothing is tapped. */
const PANEL_IDLE_MS = 10_000;
/** After a wrong tap the gate ignores the moon (3.9: 20 s; two in a row, a minute). */
export const QUIET_MS = 20_000;
export const QUIET_LONG_MS = 60_000;
/** Wrong taps this far apart are not "in a row" (a decision where 3.9 left room). */
export const STREAK_WINDOW_MS = 5 * 60_000;

/** The ring is centred on the moon the view draws at canvas (12,14), 24 px: centre (24,26). */
const HIT_SIZE = 56;
const MOON_CX = 24;
const MOON_CY = 26;
const RING_R = 16;
const RING_C = 2 * Math.PI * RING_R;

// --------------------------------------------------------------- pure parts

export interface GateWords {
  /** The eight words in the order the tiles show them. */
  tiles: string[];
  /** The two words to tap, in order; always different. */
  targets: [string, string];
}

/** Eight shuffled tiles and two distinct targets, from the given rng (3.9: "shuffled every time"). */
export function pickGateWords(rng: Rng): GateWords {
  const tiles = [...GATE_WORDS];
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const a = tiles[i] as string;
    tiles[i] = tiles[j] as string;
    tiles[j] = a;
  }
  const first = rng.int(tiles.length);
  const second = (first + 1 + rng.int(tiles.length - 1)) % tiles.length;
  return { tiles, targets: [tiles[first] as string, tiles[second] as string] };
}

/**
 * How long the gate ignores the moon after wrong taps (3.9). One wrong tap:
 * 20 s. Two in a row: a minute. A successful open, or a long gap, ends the run.
 * Takes the clock as a parameter so it is testable.
 */
export class GateCooldown {
  private quietUntil = -Infinity;
  private streak = 0;
  private lastWrong = -Infinity;

  constructor(
    private readonly quietMs: number = QUIET_MS,
    private readonly longMs: number = QUIET_LONG_MS,
    private readonly streakWindowMs: number = STREAK_WINDOW_MS,
  ) {}

  wrongTap(now: number): void {
    if (now - this.lastWrong > this.streakWindowMs) this.streak = 0;
    this.streak += 1;
    this.lastWrong = now;
    this.quietUntil = now + (this.streak >= 2 ? this.longMs : this.quietMs);
  }

  isQuiet(now: number): boolean {
    return now < this.quietUntil;
  }

  /** A successful open ends the run of wrong attempts. */
  opened(): void {
    this.streak = 0;
    this.quietUntil = -Infinity;
  }

  /** Wrong attempts in the current run, for tests. */
  get attempts(): number {
    return this.streak;
  }
}

// ------------------------------------------------------------------- the gate

export interface GateOptions {
  /** Both steps done: the app opens the parent panel. */
  onOpen(): void;
  /** Hold progress 0..1 while the moon is held, then 0 when it ends; the view may brighten the moon with it. */
  onHoldProgress?(p: number): void;
  /** The clock and the word order, injectable for the dev page; the defaults are the real ones. */
  now?: () => number;
  rng?: Rng;
}

interface Hold {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  raf: number;
}

interface Tap {
  id: number;
  tile: HTMLButtonElement;
  t0: number;
  /** Another finger landed during the tap, so it is not clean. */
  dirty: boolean;
}

interface WordStep {
  targets: [string, string];
  next: 0 | 1;
  armed: boolean;
  tap: Tap | null;
  armTimer: ReturnType<typeof setTimeout>;
  idleTimer: ReturnType<typeof setTimeout>;
}

export class Gate {
  private readonly hit: HTMLDivElement;
  private readonly ringSvg: SVGSVGElement;
  private readonly ring: SVGCircleElement;
  private readonly scrim: HTMLDivElement;
  private readonly instruction: HTMLDivElement;
  private readonly tiles: HTMLButtonElement[] = [];
  /** Every pointer currently down anywhere on the page, so a second finger or a resting hand is known. */
  private readonly active = new Set<number>();
  private readonly cooldown = new GateCooldown();
  private readonly now: () => number;
  private readonly rng: Rng;
  private hold: Hold | null = null;
  private words: WordStep | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private enabled = true;
  private destroyed = false;

  constructor(
    host: HTMLElement,
    private readonly opts: GateOptions,
  ) {
    this.now = opts.now ?? (() => performance.now());
    this.rng = opts.rng ?? createRng((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);

    // Step 1: the invisible hit area over the moon, with the ring inside it.
    this.hit = document.createElement('div');
    this.hit.className = 'gf-moon-hit';
    this.hit.setAttribute('aria-hidden', 'true');
    const ns = 'http://www.w3.org/2000/svg';
    this.ringSvg = document.createElementNS(ns, 'svg');
    this.ringSvg.setAttribute('class', 'gf-moon-ring');
    this.ringSvg.setAttribute('viewBox', `0 0 ${HIT_SIZE} ${HIT_SIZE}`);
    this.ring = document.createElementNS(ns, 'circle');
    this.ring.setAttribute('cx', String(MOON_CX));
    this.ring.setAttribute('cy', String(MOON_CY));
    this.ring.setAttribute('r', String(RING_R));
    this.ring.setAttribute('transform', `rotate(-90 ${MOON_CX} ${MOON_CY})`);
    this.ring.setAttribute('stroke-dasharray', `0 ${RING_C}`);
    this.ringSvg.appendChild(this.ring);
    this.hit.appendChild(this.ringSvg);

    // Step 2: a scrim over the whole stage (so stray taps land on nothing) holding the word panel.
    this.scrim = document.createElement('div');
    this.scrim.className = 'gf-gate-scrim';
    this.scrim.hidden = true;
    const panel = document.createElement('div');
    panel.className = 'gf-gate-words';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Grown-ups only');
    this.instruction = document.createElement('div');
    this.instruction.className = 'gf-gate-instruction';
    panel.appendChild(this.instruction);
    const grid = document.createElement('div');
    grid.className = 'gf-gate-grid';
    for (let i = 0; i < GATE_WORDS.length; i++) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'gf-gate-tile';
      tile.addEventListener('pointerdown', this.tileDown);
      tile.addEventListener('pointerup', this.tileUp);
      tile.addEventListener('pointercancel', this.tileCancel);
      tile.addEventListener('contextmenu', block);
      this.tiles.push(tile);
      grid.appendChild(tile);
    }
    panel.appendChild(grid);
    this.scrim.appendChild(panel);

    host.appendChild(this.hit);
    host.appendChild(this.scrim);

    this.hit.addEventListener('pointerdown', this.moonDown);
    this.hit.addEventListener('pointermove', this.moonMove);
    this.hit.addEventListener('pointerup', this.moonUp);
    this.hit.addEventListener('pointercancel', this.moonUp);
    this.hit.addEventListener('contextmenu', block);
    this.scrim.addEventListener('contextmenu', block);
    // Capture phase, so the finger count is right before any target handler runs.
    window.addEventListener('pointerdown', this.anyDown, true);
    window.addEventListener('pointerup', this.anyUp, true);
    window.addEventListener('pointercancel', this.anyUp, true);
    window.addEventListener('blur', this.lostFingers);
    document.addEventListener('visibilitychange', this.lostFingers);
  }

  /** While off (the parent panel is open, for instance) the moon does nothing and the hit area is gone. */
  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.cancelHold();
      this.hideWords();
    }
    this.hit.hidden = !on;
  }

  destroy(): void {
    this.destroyed = true;
    this.cancelHold();
    this.hideWords(true);
    if (this.ringTimer !== null) clearTimeout(this.ringTimer);
    window.removeEventListener('pointerdown', this.anyDown, true);
    window.removeEventListener('pointerup', this.anyUp, true);
    window.removeEventListener('pointercancel', this.anyUp, true);
    window.removeEventListener('blur', this.lostFingers);
    document.removeEventListener('visibilitychange', this.lostFingers);
    this.hit.remove();
    this.scrim.remove();
  }

  // ---------------------------------------------------------- finger count

  private readonly anyDown = (e: PointerEvent): void => {
    this.active.add(e.pointerId);
    // A second finger landing anywhere cancels the hold and dirties a tap in progress (3.9).
    if (this.hold && e.pointerId !== this.hold.id) this.cancelHold();
    const tap = this.words?.tap;
    if (tap && e.pointerId !== tap.id) tap.dirty = true;
  };

  private readonly anyUp = (e: PointerEvent): void => {
    this.active.delete(e.pointerId);
  };

  /** Fingers are lost when the page hides or loses focus; start the count afresh. */
  private readonly lostFingers = (): void => {
    this.active.clear();
    this.cancelHold();
    if (document.hidden) this.hideWords();
  };

  // ------------------------------------------------------- step 1: the moon

  private readonly moonDown = (e: PointerEvent): void => {
    if (!this.enabled || this.words || this.hold) return;
    if (this.cooldown.isQuiet(this.now())) return;
    // A touch that begins while another finger is already down is a resting hand, not a hold (3.9).
    if (this.active.size > 1) return;
    // A large contact area is a palm or a flat finger (3.9). Browsers that do not report it give 1.
    if (e.width > BIG_CONTACT_PX || e.height > BIG_CONTACT_PX) return;
    try {
      this.hit.setPointerCapture(e.pointerId);
    } catch {
      /* some browsers refuse capture here; the window listeners still see the release */
    }
    this.ringSvg.classList.add('is-holding');
    this.ringSvg.classList.remove('is-fading');
    this.drawRing(0);
    this.hold = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: this.now(), raf: 0 };
    this.hold.raf = requestAnimationFrame(this.tick);
  };

  private readonly moonMove = (e: PointerEvent): void => {
    if (!this.hold || e.pointerId !== this.hold.id) return;
    if (Math.hypot(e.clientX - this.hold.x0, e.clientY - this.hold.y0) > MOVE_CANCEL_PX) this.cancelHold();
  };

  private readonly moonUp = (e: PointerEvent): void => {
    if (this.hold && e.pointerId === this.hold.id) this.cancelHold();
  };

  private readonly tick = (): void => {
    if (!this.hold) return;
    const p = Math.min(1, (this.now() - this.hold.t0) / HOLD_MS);
    this.drawRing(p);
    this.opts.onHoldProgress?.(p);
    if (p >= 1) {
      this.completeHold();
      return;
    }
    this.hold.raf = requestAnimationFrame(this.tick);
  };

  /** The ring: a thin arc that grows with the hold, faint for the first second and clear in the last half (3.9). */
  private drawRing(p: number): void {
    this.ring.setAttribute('stroke-dasharray', `${(p * RING_C).toFixed(2)} ${RING_C.toFixed(2)}`);
    const alpha = p <= FAINT_UNTIL ? 0.1 + 0.08 * (p / FAINT_UNTIL) : 0.18 + 0.72 * ((p - FAINT_UNTIL) / (1 - FAINT_UNTIL));
    this.ringSvg.style.opacity = alpha.toFixed(3);
  }

  /** Letting go early, drifting, or a second finger: the ring fades with no sound. */
  private cancelHold(): void {
    if (!this.hold) return;
    cancelAnimationFrame(this.hold.raf);
    this.hold = null;
    this.fadeRing();
    this.opts.onHoldProgress?.(0);
  }

  private fadeRing(): void {
    this.ringSvg.classList.remove('is-holding');
    this.ringSvg.classList.add('is-fading');
    this.ringSvg.style.opacity = '0';
  }

  private completeHold(): void {
    this.hold = null;
    this.ringSvg.style.opacity = '1';
    if (this.ringTimer !== null) clearTimeout(this.ringTimer);
    // A short, soft bloom of the completed ring, then it fades as the words arrive.
    this.ringTimer = setTimeout(() => {
      this.ringTimer = null;
      this.fadeRing();
      this.opts.onHoldProgress?.(0);
    }, 220);
    this.showWords();
  }

  // ------------------------------------------------------ step 2: the words

  private showWords(): void {
    if (this.words || this.destroyed) return;
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    const picked = pickGateWords(this.rng);
    this.tiles.forEach((tile, i) => {
      tile.textContent = picked.tiles[i] ?? '';
      tile.classList.remove('is-lit');
    });
    this.setInstruction(picked.targets);
    this.scrim.hidden = false;
    this.scrim.getBoundingClientRect(); // commit display before the fade starts
    this.scrim.classList.add('is-open');
    this.words = {
      targets: picked.targets,
      next: 0,
      armed: false,
      tap: null,
      armTimer: setTimeout(() => {
        if (this.words) this.words.armed = true;
      }, PANEL_FADE_MS + ARM_DELAY_MS),
      idleTimer: setTimeout(() => this.hideWords(), PANEL_IDLE_MS),
    };
  }

  /** "Tap STAR, then MOON", the two words set in the accent colour. Built from nodes, never markup. */
  private setInstruction([first, second]: [string, string]): void {
    this.instruction.textContent = '';
    const word = (w: string): HTMLSpanElement => {
      const s = document.createElement('span');
      s.className = 'gf-gate-target';
      s.textContent = w;
      return s;
    };
    this.instruction.append('Tap ', word(first), ', then ', word(second));
  }

  private hideWords(immediate = false): void {
    if (this.words) {
      clearTimeout(this.words.armTimer);
      clearTimeout(this.words.idleTimer);
      this.words = null;
    }
    if (this.scrim.hidden) return;
    this.scrim.classList.remove('is-open');
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    if (immediate) {
      this.hideTimer = null;
      this.scrim.hidden = true;
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.scrim.hidden = true;
    }, PANEL_FADE_MS + 50);
  }

  private readonly tileDown = (e: PointerEvent): void => {
    const step = this.words;
    if (!step || !step.armed || step.tap) return;
    // Only a lone finger can start a clean tap (3.9: "no other finger down").
    if (this.active.size !== 1) return;
    step.tap = { id: e.pointerId, tile: e.currentTarget as HTMLButtonElement, t0: this.now(), dirty: false };
  };

  private readonly tileCancel = (e: PointerEvent): void => {
    const step = this.words;
    if (step?.tap && step.tap.id === e.pointerId) step.tap = null;
  };

  private readonly tileUp = (e: PointerEvent): void => {
    const step = this.words;
    if (!step?.tap || step.tap.id !== e.pointerId) return;
    const tap = step.tap;
    step.tap = null;
    const r = tap.tile.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    const clean = !tap.dirty && inside && this.now() - tap.t0 <= TAP_MAX_MS && this.active.size <= 1;
    if (!clean) return; // not a tap at all: a held or dragged finger, or a mash. Nothing happens.
    const word = tap.tile.textContent ?? '';
    if (word !== step.targets[step.next]) {
      // A wrong word: the panel fades out, no sound, and the gate stays quiet for a while (3.9).
      this.cooldown.wrongTap(this.now());
      this.hideWords();
      return;
    }
    tap.tile.classList.add('is-lit');
    if (step.next === 0) {
      step.next = 1;
      clearTimeout(step.idleTimer);
      step.idleTimer = setTimeout(() => this.hideWords(), PANEL_IDLE_MS);
      return;
    }
    this.cooldown.opened();
    this.hideWords();
    this.opts.onOpen();
  };
}

function block(e: Event): void {
  e.preventDefault();
}
