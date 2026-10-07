/**
 * Painted power pieces (art summit, STYLE.md "Powers"). The Orb and the
 * Aurora are whole pieces; the bud, the sprite and the moon pearl are the
 * ornaments that sit on a gem. Each picture is stamped over the code-drawn
 * version on the same anchor, so motion and glow are untouched and the
 * drawing shows until the file loads, or for good if it never does.
 */
import { GEM_TYPES, type GemType } from '../core/grid';
import type { PowerFamily } from '../core/game';
import { artUrl } from './artPath';

/**
 * Whole painted pieces for the coloured powers (parent, 7 October: a special
 * should stop being a gem and become a thing of the board, the way a match
 * becomes a special candy): a shooting star, a flower bud, a wisp, a star, a
 * crescent moon, each painted in all six gem colours so the colour still
 * reads for matching. Named `<family>-<gem type>`.
 */
export type ColouredPowerFamily = Exclude<PowerFamily, 'orb' | 'aurora'>;
export const COLOURED_POWER_FAMILIES: readonly ColouredPowerFamily[] = ['comet', 'bloom', 'sprite', 'starburst', 'moonrise'];
export type PowerPieceName = `${ColouredPowerFamily}-${GemType}`;

export type PowerArtName = 'orb' | 'aurora' | 'bud' | 'sprite' | 'moon' | PowerPieceName;
export type PowerArt = Partial<Record<PowerArtName, HTMLImageElement>>;

/** The painted body fills about 183 of the picture's 256 pixels. */
export const POWER_ART_SCALE = 256 / 183;

const NAMES: PowerArtName[] = [
  'orb',
  'aurora',
  'bud',
  'sprite',
  'moon',
  ...COLOURED_POWER_FAMILIES.flatMap((family) => GEM_TYPES.map((type): PowerPieceName => `${family}-${type}`)),
];

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
