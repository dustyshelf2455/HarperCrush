/**
 * Painted gem art (art round two, DESIGN.md 2d). Each gem type may have a
 * picture under public/art/gems; when it is loaded the sprite cache stamps
 * the picture instead of drawing the gem in code. Until it loads, and if it
 * never does, the code-drawn gem is shown, so the game never waits on a file.
 */
import { GEM_TYPES, type GemType } from '../core/grid';
import { artUrl } from './artPath';

export type GemArt = Partial<Record<GemType, HTMLImageElement>>;

/**
 * How wide the picture is drawn relative to the gem's radius. The painted
 * body fills about 183 of the picture's 256 pixels; the rest is its glow.
 * 3.1 radii makes the body a tenth bigger than the code-drawn gem (art summit, DESIGN.md 2e).
 */
export const GEM_ART_SCALE = 3.1;

/** Loads every gem picture that exists and calls back once with all that loaded. */
export function loadGemArt(onReady: (art: GemArt) => void): void {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const art: GemArt = {};
  let pending = GEM_TYPES.length;
  const done = (): void => {
    pending -= 1;
    if (pending === 0 && Object.keys(art).length > 0) onReady(art);
  };
  for (const type of GEM_TYPES) {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) art[type] = img;
      done();
    };
    img.onerror = done;
    img.src = artUrl(`gems/${type}.png`);
  }
}
