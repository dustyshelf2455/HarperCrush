/**
 * The painted Stage 4 pieces (STYLE.md "Stage 4 pieces", batch C): frost in
 * one and two layers, the cloud puff, the moonstone, the star-seed and its
 * flower, the bubbles with their sleepers, two vine rings, and the hidden
 * picture of each area. Loaded the first time each is asked for; until then,
 * and if a file is missing, the code-drawn piece in render/pieces.ts shows.
 */
import type { AreaId } from '../core/journey';
import { artUrl } from './artPath';

export type PieceArtName = 'frost1' | 'frost2' | 'puff' | 'moonstone' | 'seed' | 'flower' | 'bubble-dragon' | 'bubble-fairy' | 'vine-a' | 'vine-b';

export interface PieceArt {
  /** A piece's picture if it has loaded; asking for it starts the load. */
  get(name: PieceArtName): HTMLImageElement | null;
  /** The area's hidden picture, the same way. */
  hidden(area: AreaId): HTMLImageElement | null;
}

/** Every piece picture file in a theme, for listings. */
export const PIECE_ART_FILES: readonly string[] = ['frost1', 'frost2', 'puff', 'moonstone', 'seed', 'flower', 'bubble-dragon', 'bubble-fairy', 'vine-a', 'vine-b'].map((n) => `${n}.png`);

export function loadPieceArt(onLoad: () => void): PieceArt {
  const pictures = new Map<string, HTMLImageElement | null>();
  const fetch = (file: string): HTMLImageElement | null => {
    if (typeof Image === 'undefined') return null;
    const hit = pictures.get(file);
    if (hit !== undefined) return hit;
    pictures.set(file, null);
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        pictures.set(file, img);
        onLoad();
      }
    };
    img.src = artUrl(`pieces/${file}`);
    return null;
  };
  return {
    get: (name) => fetch(`${name}.png`),
    hidden: (area) => fetch(`hidden-${area}.jpg`),
  };
}
