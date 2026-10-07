/**
 * Painted power pieces (art summit, STYLE.md "Powers"). The Orb and the
 * Aurora are whole pieces; the bud, the sprite and the moon pearl are the
 * ornaments that sit on a gem. Each picture is stamped over the code-drawn
 * version on the same anchor, so motion and glow are untouched and the
 * drawing shows until the file loads, or for good if it never does.
 */
import { artUrl } from './artPath';

export type PowerArtName = 'orb' | 'aurora' | 'bud' | 'sprite' | 'moon';
export type PowerArt = Partial<Record<PowerArtName, HTMLImageElement>>;

/** The painted body fills about 183 of the picture's 256 pixels. */
export const POWER_ART_SCALE = 256 / 183;

const NAMES: PowerArtName[] = ['orb', 'aurora', 'bud', 'sprite', 'moon'];

/** Loads every power picture that exists; calls back once per picture as it arrives. */
export function loadPowerArt(onLoad: (art: PowerArt) => void): void {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const art: PowerArt = {};
  for (const name of NAMES) {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        art[name] = img;
        onLoad(art);
      }
    };
    img.src = artUrl(`powers/${name}.png`);
  }
}
