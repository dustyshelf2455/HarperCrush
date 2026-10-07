/**
 * When the launch picture (DESIGN.md 2f) goes, as pure arithmetic so it can
 * be tested without a browser. Times are milliseconds since the splash
 * opened. The splash waits for her: it stays, stars twinkling and glimmers
 * drifting, until she taps the fairy door with her name on it (the parent,
 * 7 October); then the door's light swells and the picture fades into the
 * map. A touch in the very first moment (a hand still on the screen from the
 * launch) is not an opening.
 */

/** A door tap before this counts from this moment, so the picture is always seen. */
export const SPLASH_TAP_AFTER_MS = 900;
/** The door's light swells for this long before the fade begins. */
export const SPLASH_OPEN_MS = 650;
/** The fade into the game. */
export const SPLASH_FADE_MS = 1200;

export interface SplashTimes {
  /** When she tapped the door, or null while the splash waits. */
  openedAt: number | null;
}

/** When the door counts as opened (its light starts to swell), or null while the splash waits. */
export function splashOpenStart(times: SplashTimes): number | null {
  return times.openedAt === null ? null : Math.max(times.openedAt, SPLASH_TAP_AFTER_MS);
}

/** When the fade begins, or null while the splash waits. */
export function splashFadeStart(times: SplashTimes): number | null {
  const open = splashOpenStart(times);
  return open === null ? null : open + SPLASH_OPEN_MS;
}

/** The door's opening light at `now`, 0 closed to 1 fully open. */
export function splashOpening(now: number, times: SplashTimes): number {
  const open = splashOpenStart(times);
  if (open === null || now <= open) return 0;
  const f = Math.min(1, (now - open) / SPLASH_OPEN_MS);
  return 1 - (1 - f) * (1 - f);
}

/** The splash's opacity at `now`: 1 while it waits, easing to 0 across the fade. */
export function splashAlpha(now: number, times: SplashTimes): number {
  const start = splashFadeStart(times);
  if (start === null || now <= start) return 1;
  const f = Math.min(1, (now - start) / SPLASH_FADE_MS);
  // Ease in and out, so the picture lets go gently and the map arrives softly.
  return 1 - (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
}

/** True once the fade has fully run. */
export function splashDone(now: number, times: SplashTimes): boolean {
  const start = splashFadeStart(times);
  return start !== null && now >= start + SPLASH_FADE_MS;
}

export interface PicturePlacement {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Height (in screen pixels) of the soft top edge where the picture gives way to the code-drawn sky, 0 for none. */
  feather: number;
}

/**
 * Where the painted picture sits on a screen of w by h. The picture is 1024
 * by 1536 and its title spans most of its width, so on a tall phone it is
 * not cropped to cover the screen (that would cut the title's ends) but
 * drawn a little wider than the screen, standing on the bottom edge, and the
 * code-drawn sky carries on above it through a feathered edge. On a squarer
 * screen it simply covers.
 */
export function placePicture(w: number, h: number, imgW: number, imgH: number): PicturePlacement {
  const cover = Math.max(w / imgW, h / imgH);
  const fitWidth = w / imgW;
  const maxCrop = 1.12;
  if (cover <= fitWidth * maxCrop) {
    const width = imgW * cover;
    const height = imgH * cover;
    return { x: (w - width) / 2, y: (h - height) / 2, width, height, feather: 0 };
  }
  const scale = fitWidth * maxCrop;
  const width = imgW * scale;
  const height = imgH * scale;
  return { x: (w - width) / 2, y: h - height, width, height, feather: Math.min(height * 0.22, 160) };
}

export interface DoorPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the fairy door stands: bottom centre, on the painting's meadow, above
 * the home indicator, sized to the screen (the door picture is about 480 by
 * 453). The tap area is the door with a generous margin (`doorHit`).
 */
export function placeDoor(w: number, h: number, imgW = 480, imgH = 453): DoorPlacement {
  const width = Math.min(w * 0.4, h * 0.2);
  const height = width * (imgH / imgW);
  return { x: (w - width) / 2, y: h * 0.935 - height, width, height };
}

export function doorHit(door: DoorPlacement, x: number, y: number): boolean {
  const m = 28;
  return x >= door.x - m && x <= door.x + door.width + m && y >= door.y - m && y <= door.y + door.height + m;
}
