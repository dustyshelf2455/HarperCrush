/**
 * When the launch picture (DESIGN.md 2f) shows and when it goes, as pure
 * arithmetic so it can be tested without a browser. Times are milliseconds
 * since the splash opened. The splash never asks for a tap: it stays while
 * the game's pictures load, always long enough to be seen as a picture rather
 * than a flicker, never so long that it feels like a wait, and fades on its
 * own. A tap after the first moment lets it go a little sooner.
 */

/** Seen for at least this long, even when everything is already cached. */
export const SPLASH_MIN_MS = 2400;
/** Gone by this time whether or not the pictures have arrived. */
export const SPLASH_MAX_MS = 4800;
/** The fade into the game. */
export const SPLASH_FADE_MS = 1200;
/** A tap before this is ignored (a hand still on the screen from the launch). */
export const SPLASH_TAP_AFTER_MS = 900;

export interface SplashTimes {
  /** When the game's own pictures were ready, or null while they load. */
  readyAt: number | null;
  /** When she tapped the splash, or null. */
  tappedAt: number | null;
}

/** When the fade begins. */
export function splashFadeStart(times: SplashTimes): number {
  let start = SPLASH_MAX_MS;
  if (times.readyAt !== null) start = Math.min(start, Math.max(times.readyAt, SPLASH_MIN_MS));
  if (times.tappedAt !== null) start = Math.min(start, Math.max(times.tappedAt, SPLASH_TAP_AFTER_MS));
  return start;
}

/** The splash's opacity at `now`: 1 while it holds, easing to 0 across the fade. */
export function splashAlpha(now: number, times: SplashTimes): number {
  const start = splashFadeStart(times);
  if (now <= start) return 1;
  const f = Math.min(1, (now - start) / SPLASH_FADE_MS);
  // Ease in and out, so the picture lets go gently and the board arrives softly.
  return 1 - (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
}

/** True once the fade has fully run. */
export function splashDone(now: number, times: SplashTimes): boolean {
  return now >= splashFadeStart(times) + SPLASH_FADE_MS;
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
