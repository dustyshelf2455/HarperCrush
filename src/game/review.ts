/**
 * Review mode: a development-only way for the parent to look around the whole
 * map and open any lantern without earning it. It is not part of the game for
 * Harper and is meant to be removed (or locked away) before her install:
 *
 *  - delete this file and the lines in app.ts, panel.ts and mapScene.ts that
 *    mention "review" (each is marked), or
 *  - make `reviewAvailable()` return false.
 *
 * While it is on, nothing is saved, so her real progress stays exactly as it
 * was. Turning it off reloads the app, which reopens the saved game.
 */

const KEY = 'glimmerfall.review';

/** The one switch for locking the feature away: false hides it from the panel and ignores a stored flag. */
export function reviewAvailable(): boolean {
  return true;
}

export function reviewOn(): boolean {
  if (!reviewAvailable()) return false;
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setReviewFlag(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: review lasts until the page reloads */
  }
}

export interface ReviewActions {
  /** From a level: leave it and go back to the map. */
  toMap(): void;
  /** On the map: glide to the next (1) or previous (-1) area. */
  area(dir: 1 | -1): void;
  /** Leave review mode and return to the saved game. */
  exit(): void;
}

const CSS = `
.gf-review{position:absolute;z-index:6;top:calc(env(safe-area-inset-top,0px) + 8px);right:8px;display:flex;gap:6px;
  font:600 13px/1 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;pointer-events:none}
.gf-review[hidden]{display:none}
.gf-review button{pointer-events:auto;touch-action:manipulation;border:1px solid rgba(255,226,160,.5);border-radius:999px;
  padding:9px 12px;color:#fff4d6;background:rgba(10,14,36,.62);-webkit-tap-highlight-color:transparent}
.gf-review .gf-review-tag{pointer-events:none;align-self:center;color:#ffd27a;letter-spacing:.06em;text-transform:uppercase;font-size:11px}
`;

/** The small bar of review buttons at the top right, over the game and the map. */
export class ReviewBar {
  private readonly root = document.createElement('div');
  private readonly mapButton: HTMLButtonElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;

  constructor(stage: HTMLElement, actions: ReviewActions) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root.className = 'gf-review';
    this.root.hidden = true;
    const tag = document.createElement('span');
    tag.className = 'gf-review-tag';
    tag.textContent = 'Review';
    const make = (label: string, tap: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', tap);
      return b;
    };
    this.mapButton = make('Map', actions.toMap);
    this.prev = make('‹ Area', () => actions.area(-1));
    this.next = make('Area ›', () => actions.area(1));
    this.root.append(tag, this.mapButton, this.prev, this.next, make('Exit', actions.exit));
    stage.appendChild(this.root);
  }

  /** 'map': area buttons; 'level': the Map button; null: hidden. */
  show(where: 'map' | 'level' | null): void {
    this.root.hidden = where === null;
    this.mapButton.hidden = where !== 'level';
    this.prev.hidden = where !== 'map';
    this.next.hidden = where !== 'map';
  }
}
