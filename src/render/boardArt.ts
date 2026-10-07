/**
 * The painted backdrop behind the board, one per area (STYLE.md "The board"):
 * a portrait painting, dark through the middle where the gems sit. Loaded the
 * first time an area is asked for; until then, and if the file is missing,
 * the code-drawn sky shows, as for every other picture.
 */
import type { AreaId } from '../core/journey';
import { artUrl } from './artPath';

export interface BoardArt {
  /** The area's picture if it has loaded; asking for it starts the load. */
  get(area: AreaId): HTMLImageElement | null;
}

export function loadBoardArt(onLoad: () => void): BoardArt {
  const pictures = new Map<AreaId, HTMLImageElement | null>();
  return {
    get(area) {
      if (typeof Image === 'undefined') return null;
      const hit = pictures.get(area);
      if (hit !== undefined) return hit;
      pictures.set(area, null);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) {
          pictures.set(area, img);
          onLoad();
        }
      };
      img.src = artUrl(`board/${area}.jpg`);
      return null;
    },
  };
}
