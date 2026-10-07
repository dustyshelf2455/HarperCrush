/**
 * The parent panel (DESIGN.md 3.9 "What is on the panel", 3.6, 3.8, 3.11,
 * 3.12): a full-height sheet over the game for a grown-up, reached through the
 * gate. Text is fine here and nowhere else. The Calm switch and the Finish
 * buttons, the two things a parent reaches for in a car (3.6, 2d), are pinned at
 * the bottom in thumb reach; the home-indicator inset below them is left
 * empty so a thumb reaching for a button cannot swipe the app away (3.9).
 * Everything else scrolls above. The sheet closes itself after 30 s with no
 * interaction and never disturbs the board underneath.
 *
 * Setting controls write through the SettingsStore at once and reflect it;
 * the app owns everything else (mode, finish, lantern, reset) through
 * PanelActions and keeps the panel current with update().
 */
import type { Settings, SettingsStore } from './settings';
import { reviewAvailable } from './review'; // review mode (development only)
import './panel.css';

export interface PanelContext {
  /** Calm is on: the gentle board over her one game (DESIGN.md 2d). */
  calm: boolean;
  /** A Calm change waiting for the next lantern (3.6): true for on, false for off, null for none. */
  calmPending: boolean | null;
  level: number;
  /** A lit lantern being played again, or null. */
  replay: number | null;
  areaName: string;
  /** The resting scene is showing (3.8): "New session" replaces the Finish buttons. */
  resting: boolean;
  /** "Finish after this level" has been pressed. */
  finishing: boolean;
  /** The timer's sleepy stretch is on. */
  windingDown: boolean;
  /** Time left in the session, or null with no timer. */
  sessionLeftMs: number | null;
  buildDate: string;
  offlineReady: boolean;
  /** A short word on the audio engine's state, for the About line. */
  audio: string;
  /** Review mode is on (development only, review.ts). */
  review: boolean;
}

export interface PanelActions {
  setCalm(on: boolean): void;
  finishAfterLevel(): void;
  cancelFinish(): void;
  finishNow(): void;
  newSession(): void;
  setLantern(level: number): void;
  resetProgress(): void;
  /** Review mode (development only, review.ts). */
  setReview(on: boolean): void;
}

/** The panel closes itself after 30 seconds of inactivity (DESIGN.md 3.9). */
const AUTO_CLOSE_MS = 30_000;
/** A confirm tile (Finish now, Reset) waits this long for its second tap, then disappears. */
const CONFIRM_MS = 5_000;
const FADE_MS = 240;
/** Holding a lantern stepper repeats after a pause, so a big jump does not need fifty taps. */
const REPEAT_AFTER_MS = 420;
const REPEAT_EVERY_MS = 70;

type Confirm = 'finish' | 'reset';

interface Segmented<T extends string> {
  el: HTMLElement;
  set(value: T): void;
}

export class Panel {
  private readonly root: HTMLDivElement;
  private readonly scroll: HTMLDivElement;
  private readonly confirmSlot: HTMLDivElement;
  private readonly statusMain: HTMLDivElement;
  private readonly statusSub: HTMLDivElement;
  private readonly calmTile: HTMLButtonElement;
  private readonly calmNote: HTMLDivElement;
  private readonly finishBlock: HTMLDivElement;
  private readonly lanternNumber: HTMLDivElement;
  private readonly goButton: HTMLButtonElement;
  private reviewButton: HTMLButtonElement | null = null;
  private readonly about: HTMLDivElement;
  private readonly segs: Array<(s: Settings) => void> = [];
  private readonly closeListeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  private ctx: PanelContext | null = null;
  private open_ = false;
  private lanternDraft = 1;
  private confirm: Confirm | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private repeatTimer: ReturnType<typeof setTimeout> | null = null;
  private repeated = false;

  constructor(
    host: HTMLElement,
    private readonly settings: SettingsStore,
    private readonly actions: PanelActions,
  ) {
    this.root = div('gf-sheet');
    this.root.hidden = true;
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-label', 'Grown-up settings');

    // Head: title, Close, the status line and the slot where confirm tiles appear (away from the buttons that ask for them).
    const head = div('gf-head');
    const row = div('gf-head-row');
    const title = div('gf-title', 'Grown-ups');
    const close = button('gf-close', 'Close', () => this.close());
    row.append(title, close);
    this.statusMain = div('gf-status-main');
    this.statusSub = div('gf-status-sub');
    const status = div('gf-status');
    status.append(this.statusMain, this.statusSub);
    this.confirmSlot = div('gf-confirm-slot');
    head.append(row, status, this.confirmSlot);

    // Middle: everything that scrolls.
    this.scroll = div('gf-scroll');
    this.scroll.append(
      this.sectionSession(),
      this.sectionNight(),
      this.sectionSound(),
      this.sectionFeel(),
      this.sectionDifficulty(),
      ...(reviewAvailable() ? [this.sectionReview()] : []),
      this.sectionMap(),
      this.sectionReset(),
      this.sectionAbout(),
    );
    this.about = this.scroll.querySelector('.gf-about') as HTMLDivElement;
    this.lanternNumber = this.scroll.querySelector('.gf-lantern-number') as HTMLDivElement;
    this.goButton = this.scroll.querySelector('.gf-go') as HTMLButtonElement;

    // Foot, pinned in thumb reach (3.6, 3.9): the Calm switch, then the Finish buttons.
    const foot = div('gf-foot');
    const modes = div('gf-mode-tiles');
    this.calmTile = button('gf-mode-tile gf-calm-tile', 'Calm', () => this.actions.setCalm(!(this.ctx?.calmPending ?? this.ctx?.calm ?? false)));
    modes.append(this.calmTile);
    this.calmNote = div('gf-mode-note');
    this.finishBlock = div('gf-finish');
    foot.append(modes, this.calmNote, this.finishBlock);

    this.root.append(head, this.scroll, foot);
    host.appendChild(this.root);

    // Any touch or scroll counts as interaction for the 30 s auto-close.
    this.root.addEventListener('pointerdown', this.touched, { passive: true });
    this.scroll.addEventListener('scroll', this.touched, { passive: true });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());

    this.unsubscribe = settings.onChange((s) => this.reflectSettings(s));
    this.reflectSettings(settings.get());
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(ctx: PanelContext): void {
    this.ctx = ctx;
    this.lanternDraft = ctx.level;
    this.clearConfirm();
    this.refresh();
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    if (!this.open_) {
      this.open_ = true;
      this.root.hidden = false;
      this.scroll.scrollTop = 0;
      this.root.getBoundingClientRect(); // commit display before the fade starts
      this.root.classList.add('is-open');
    }
    this.armIdle();
  }

  /** The app's state changed (after an action, or on its own): show it. */
  update(ctx: PanelContext): void {
    const levelChanged = this.ctx?.level !== ctx.level;
    this.ctx = ctx;
    if (levelChanged) this.lanternDraft = ctx.level;
    if (this.open_) this.refresh();
  }

  close(): void {
    if (!this.open_) return;
    this.open_ = false;
    this.clearIdle();
    this.clearConfirm();
    this.stopRepeat();
    this.root.classList.remove('is-open');
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.root.hidden = true;
    }, FADE_MS + 40);
    this.closeListeners.forEach((cb) => cb());
  }

  /** Called whenever the panel closes, by any route. Returns an unsubscribe function. */
  onClose(cb: () => void): () => void {
    this.closeListeners.add(cb);
    return () => this.closeListeners.delete(cb);
  }

  destroy(): void {
    this.clearIdle();
    this.clearConfirm();
    this.stopRepeat();
    if (this.hideTimer !== null) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.unsubscribe();
    this.closeListeners.clear();
    this.open_ = false;
    this.root.remove();
  }

  // ---------------------------------------------------------------- sections

  private sectionSound(): HTMLElement {
    const s = section('Sound');
    s.append(
      this.row('Music', this.segmented([['true', 'On'], ['false', 'Off']], (v) => this.settings.set({ music: v === 'true' }), (st) => String(st.music))),
      this.row('Music level', this.segmented([['soft', 'Soft'], ['normal', 'Normal']], (v) => this.settings.set({ musicLevel: v as Settings['musicLevel'] }), (st) => st.musicLevel)),
      this.row('Chimes', this.segmented([['true', 'On'], ['false', 'Off']], (v) => this.settings.set({ chimes: v === 'true' }), (st) => String(st.chimes))),
      // DESIGN.md 3.11: the playback audio session ignores Silent mode; on by default since the Stage 2 play-tests (STATUS.md).
      this.row('Play even when iPhone is on Silent', this.segmented([['true', 'On'], ['false', 'Off']], (v) => this.settings.set({ playOnSilent: v === 'true' }), (st) => String(st.playOnSilent))),
    );
    return s;
  }

  private sectionFeel(): HTMLElement {
    const s = section('Feel');
    s.append(
      // DESIGN.md 3.9: normal keeps each mode's own delay, quick halves it, slow doubles it.
      this.row('Hint delay', this.segmented([['quick', 'Quick'], ['normal', 'Normal'], ['slow', 'Slow'], ['off', 'Off']], (v) => this.settings.set({ hintDelay: v as Settings['hintDelay'] }), (st) => st.hintDelay), true),
      // DESIGN.md 4.4: the iPhone's Reduce Motion is respected automatically, with a parent override.
      this.row('Reduce motion', this.segmented([['follow', 'Follow iPhone'], ['on', 'On'], ['off', 'Off']], (v) => this.settings.set({ reducedMotion: v as Settings['reducedMotion'] }), (st) => st.reducedMotion), true),
      // DESIGN.md 3.8: the breathing glow is a parent toggle.
      this.row('Breathing glow', this.segmented([['true', 'On'], ['false', 'Off']], (v) => this.settings.set({ breathingGlow: v === 'true' }), (st) => String(st.breathingGlow))),
    );
    return s;
  }

  private sectionSession(): HTMLElement {
    const s = section('Session');
    // DESIGN.md 3.8 and 2d: a timed session gets sleepy over its last four minutes, then the level ends at the map.
    s.append(
      this.row('', this.segmented([['0', 'Off'], ['5', '5'], ['10', '10'], ['15', '15'], ['20', '20'], ['30', '30']], (v) => this.settings.set({ sessionMinutes: Number(v) as Settings['sessionMinutes'] }), (st) => String(st.sessionMinutes)), true),
      div('gf-note', 'Minutes of play. The clock starts when you set it. The last four minutes get sleepy, then her level ends at the map and her companion falls asleep. "Keep playing" at the bottom waves it off.'),
      // DESIGN.md 3.8: the softening is a parent choice; off, the time simply runs out into the gentle ending.
      this.row('Sleepy wind-down', this.segmented([['true', 'On'], ['false', 'Off']], (v) => this.settings.set({ windDown: v === 'true' }), (st) => String(st.windDown))),
      // DESIGN.md 3.8, rest-until: how long the sleeping scene keeps on a relaunch.
      this.row('Rest for', this.segmented([['15', '15 min'], ['30', '30 min'], ['60', '1 hour'], ['0', 'Unlock']], (v) => this.settings.set({ restUntilMinutes: Number(v) as Settings['restUntilMinutes'] }), (st) => String(st.restUntilMinutes)), true),
      div('gf-note', 'After an ending, opening the app again shows her sleeping companion for this long. "Unlock" keeps it until you open this panel and tap New session.'),
    );
    return s;
  }

  /** DESIGN.md 3.9: a slider that dims the whole game below the iPhone's lowest brightness, for dark cars and cabins. */
  private sectionNight(): HTMLElement {
    const s = section('Night dimmer');
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'gf-slider';
    slider.min = '0';
    slider.max = '75';
    slider.step = '5';
    slider.setAttribute('aria-label', 'Night dimmer');
    slider.addEventListener('input', () => this.settings.set({ nightDim: Number(slider.value) / 100 }));
    this.segs.push((st) => { slider.value = String(Math.round(st.nightDim * 100)); });
    const r = div('gf-row is-wide');
    r.append(slider);
    s.append(r, div('gf-note', 'Darker than the iPhone allows. It dims this panel too, so the moon is still where it was.'));
    return s;
  }

  private sectionDifficulty(): HTMLElement {
    const s = section('Play difficulty');
    s.append(
      this.row('', this.segmented([['gentle', 'Gentle'], ['medium', 'Medium'], ['bigger', 'Bigger']], (v) => this.settings.set({ playDifficulty: v as Settings['playDifficulty'] }), (st) => st.playDifficulty), true),
      div('gf-note', 'How much the Play levels ask of her. Takes effect from her next level.'),
    );
    return s;
  }

  private sectionMap(): HTMLElement {
    const s = section('Map position');
    const stepper = div('gf-stepper');
    const minus = this.stepButton('−', -1);
    minus.setAttribute('aria-label', 'Lantern before');
    const plus = this.stepButton('+', 1);
    plus.setAttribute('aria-label', 'Lantern after');
    const number = div('gf-lantern-number', '1');
    const numberWrap = div('gf-lantern-wrap');
    numberWrap.append(div('gf-lantern-label', 'Lantern'), number);
    stepper.append(minus, numberWrap, plus);
    const go = button('gf-button gf-go', 'Go to lantern 1', () => {
      if (this.ctx && this.lanternDraft !== this.ctx.level) this.actions.setLantern(this.lanternDraft);
    });
    s.append(stepper, go, div('gf-note', 'If the phone ever loses her save, this puts her back where she was on the path.'));
    return s;
  }

  /** Development only (review.ts): look around the whole map and open any lantern. */
  private sectionReview(): HTMLElement {
    const s = section('Review mode (development)');
    this.reviewButton = button('gf-button', 'Turn on review mode', () => this.actions.setReview(!(this.ctx?.review ?? false)));
    s.append(this.reviewButton, div('gf-note', 'Opens the whole map: drag to look around, tap any lantern to play it. Nothing is saved while it is on, so her real progress stays put. Turning it off returns to her saved game.'));
    return s;
  }

  private sectionReset(): HTMLElement {
    const s = section('Reset progress');
    s.append(button('gf-button gf-quiet', 'Reset progress', () => this.askConfirm('reset')), div('gf-note', 'Starts her journey again from the first lantern. Asks once more at the top.'));
    return s;
  }

  private sectionAbout(): HTMLElement {
    const s = section('About');
    s.append(div('gf-about'));
    return s;
  }

  // ----------------------------------------------------------------- refresh

  private refresh(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.statusMain.textContent = `Lantern ${ctx.level} · ${ctx.areaName}`;
    const parts: string[] = [];
    if (ctx.resting) parts.push('Resting');
    else if (ctx.replay !== null) parts.push(`Playing lantern ${ctx.replay} again`);
    parts.push(ctx.calm ? 'Calm on' : 'Calm off');
    if (ctx.calmPending !== null && ctx.calmPending !== ctx.calm) parts.push(`Calm ${ctx.calmPending ? 'on' : 'off'} from the next lantern`);
    if (ctx.sessionLeftMs !== null) parts.push(ctx.windingDown ? 'Getting sleepy' : `${Math.max(1, Math.ceil(ctx.sessionLeftMs / 60_000))} min left`);
    this.statusSub.textContent = parts.join(' · ');

    const lit = ctx.calmPending ?? ctx.calm;
    this.calmTile.textContent = lit ? 'Calm is on' : 'Calm is off';
    this.calmTile.setAttribute('aria-pressed', String(lit));
    this.calmTile.classList.toggle('is-pending', ctx.calmPending !== null && ctx.calmPending !== ctx.calm);
    this.calmNote.textContent = lit
      ? 'Her same game, made gentle: a cosier board, more powers, quicker hints. Turning it off waits for the next lantern.'
      : 'For hard moments: a cosier board, more powers, quicker hints, straight away. Her progress still counts.';

    this.renderFinish(ctx);
    this.lanternNumber.textContent = String(this.lanternDraft);
    this.goButton.textContent = `Go to lantern ${this.lanternDraft}`;
    this.goButton.disabled = this.lanternDraft === ctx.level;
    if (this.reviewButton) this.reviewButton.textContent = ctx.review ? 'Turn off review mode' : 'Turn on review mode';
    this.about.textContent = `Glimmerfall · build ${ctx.buildDate} · ready offline: ${ctx.offlineReady ? 'yes' : 'no'} · sound: ${ctx.audio}`;
  }

  /** The Finish block (3.8, provisional in Stage 3): one tap to finish after this level, two for finish now, New session when resting. */
  private renderFinish(ctx: PanelContext): void {
    this.finishBlock.textContent = '';
    if (ctx.resting) {
      this.finishBlock.append(button('gf-button gf-primary', 'New session', () => {
        this.actions.newSession();
        this.close();
      }));
      return;
    }
    if (ctx.finishing) {
      const state = div('gf-finishing');
      const label = div('gf-finishing-label', 'Finishing after this level');
      const keep = button('gf-link', 'Keep playing', () => this.actions.cancelFinish());
      state.append(label, keep);
      this.finishBlock.append(state);
    } else {
      this.finishBlock.append(button('gf-button gf-primary', 'Finish after this level', () => this.actions.finishAfterLevel()));
    }
    const now = button('gf-button', 'Finish now, gently', () => this.askConfirm('finish'));
    now.classList.toggle('is-asking', this.confirm === 'finish');
    this.finishBlock.append(now);
  }

  private reflectSettings(s: Settings): void {
    this.segs.forEach((apply) => apply(s));
  }

  // ----------------------------------------------------------------- actions

  private stepLantern(delta: number): void {
    this.lanternDraft = Math.max(1, this.lanternDraft + delta);
    if (this.ctx) this.refresh();
  }

  /** A stepper: a tap steps once; a press-and-hold repeats after a pause, so a jump of fifty is a few seconds, not fifty taps. */
  private stepButton(label: string, delta: number): HTMLButtonElement {
    const btn = button('gf-step', label, () => {
      // The click that follows a held press must not add one more step.
      if (this.repeated) {
        this.repeated = false;
        return;
      }
      this.stepLantern(delta);
    });
    btn.addEventListener('pointerdown', () => {
      this.stopRepeat();
      this.repeated = false;
      this.repeatTimer = setTimeout(() => {
        const tickRepeat = (): void => {
          this.repeated = true;
          this.stepLantern(delta);
          this.repeatTimer = setTimeout(tickRepeat, REPEAT_EVERY_MS);
        };
        tickRepeat();
      }, REPEAT_AFTER_MS);
    });
    const stop = (): void => this.stopRepeat();
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    return btn;
  }

  private stopRepeat(): void {
    if (this.repeatTimer !== null) clearTimeout(this.repeatTimer);
    this.repeatTimer = null;
  }

  /**
   * The second step of a two-tap action appears in a different place on the
   * panel (near the top), so a stray mash on one spot cannot end her session
   * or wipe her journey (3.9). It disappears after a few seconds.
   */
  private askConfirm(kind: Confirm): void {
    this.clearConfirm();
    this.confirm = kind;
    const tile = div('gf-confirm');
    const text = div('gf-confirm-text', kind === 'finish' ? 'Finish now? Her gems will drift into the lantern and the level ends.' : 'Reset her progress? The path starts again at lantern 1.');
    const yes = button('gf-button gf-confirm-yes', kind === 'finish' ? 'Yes, finish now' : 'Yes, reset progress', () => {
      this.clearConfirm();
      if (kind === 'finish') {
        this.actions.finishNow();
        this.close();
      } else {
        this.actions.resetProgress();
      }
    });
    tile.append(text, yes);
    this.confirmSlot.append(tile);
    this.confirmSlot.getBoundingClientRect();
    tile.classList.add('is-shown');
    this.confirmTimer = setTimeout(() => this.clearConfirm(), CONFIRM_MS);
    if (this.ctx) this.renderFinish(this.ctx);
    // Make sure the parent sees where the confirm went.
    this.scroll.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private clearConfirm(): void {
    if (this.confirmTimer !== null) clearTimeout(this.confirmTimer);
    this.confirmTimer = null;
    const had = this.confirm !== null;
    this.confirm = null;
    this.confirmSlot.textContent = '';
    if (had && this.ctx) this.renderFinish(this.ctx);
  }

  // -------------------------------------------------------------- idle timer

  private readonly touched = (): void => {
    if (this.open_) this.armIdle();
  };

  private armIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => this.close(), AUTO_CLOSE_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  // ----------------------------------------------------------------- widgets

  /** A label and a control on one row; a wide control (three or more choices) takes its own line. */
  private row(label: string, control: Segmented<string>, wide = false): HTMLElement {
    const r = div(wide ? 'gf-row is-wide' : 'gf-row');
    if (label) r.append(div('gf-row-label', label));
    r.append(control.el);
    return r;
  }

  /** A segmented control. Writes through at once; reflects the store (aria-pressed) whenever it changes. */
  private segmented(options: Array<[string, string]>, onPick: (value: string) => void, read: (s: Settings) => string): Segmented<string> {
    const el = div('gf-seg');
    el.setAttribute('role', 'group');
    const buttons = options.map(([value, label]) => {
      const b = button('gf-seg-item', label, () => onPick(value));
      b.dataset.value = value;
      el.appendChild(b);
      return b;
    });
    const set = (value: string): void => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === value)));
    this.segs.push((s) => set(read(s)));
    return { el, set };
  }
}

// ------------------------------------------------------------------ helpers

function div(className: string, text?: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function button(className: string, label: string, onTap: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onTap);
  return b;
}

function section(title: string): HTMLElement {
  const s = document.createElement('section');
  s.className = 'gf-section';
  const h = document.createElement('h2');
  h.className = 'gf-section-title';
  h.textContent = title;
  s.appendChild(h);
  return s;
}
