/**
 * Painted map art (STYLE.md "The map", DESIGN.md 2l): one floating island
 * per area and the companions, under public/art/<theme>/map and companions.
 * Each piece is optional: until it loads, and if it never does, the map draws
 * that piece in code.
 */

import type { AreaId } from '../core/journey';
import { artUrl } from './artPath';

import type { CompanionId } from './creatures';

/** A painted companion: awake (facing right) and curled up asleep (STYLE.md "The cast"). */
export interface CompanionArt {
  awake: HTMLImageElement;
  asleep?: HTMLImageElement;
}

/** The picture files for each companion id (the ids stay for saved games; the pictures are what she sees). */
export const COMPANION_FILES: Record<CompanionId, string> = { firefly: 'fairy', fish: 'dragon', hero: 'hero' };

export interface MapArt {
  /** The painted companions, by id; a missing one draws in code. */
  companions: Partial<Record<CompanionId, CompanionArt>>;
}

/**
 * The painted islands (STYLE.md "The map"), loaded as the view nears them.
 * An island that is missing or still loading draws as a code-drawn fallback
 * (a soft dark isle in the area's colours), so the map never waits on a file.
 */
export interface IslandArt {
  /** The area's island picture if it has loaded; asking for it starts the load. */
  get(area: AreaId): HTMLImageElement | null;
}

export function loadIslandArt(onLoad: () => void): IslandArt {
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
      img.src = artUrl(`map/island-${area}.webp`);
      return null;
    },
  };
}

/** Every island file name in the default theme, for listings. */
export function islandFileNames(areas: readonly AreaId[]): string[] {
  return areas.map((a) => `island-${a}.webp`);
}

/** Loads every companion picture that exists and calls back once with all that loaded. */
export function loadMapArt(onReady: (art: MapArt) => void): void {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const art: MapArt = { companions: {} };
  const files: Array<[string, (img: HTMLImageElement) => void]> = (Object.entries(COMPANION_FILES) as Array<[CompanionId, string]>).flatMap(
    ([id, file]): Array<[string, (img: HTMLImageElement) => void]> => [
      [`${file}.png`, (img) => (art.companions[id] = { ...art.companions[id], awake: img })],
      [`${file}-asleep.png`, (img) => { if (art.companions[id]) art.companions[id]!.asleep = img; else art.companions[id] = { awake: img, asleep: img }; }],
    ],
  );
  let pending = files.length;
  let loaded = 0;
  const done = (): void => {
    pending -= 1;
    if (pending === 0 && loaded > 0) {
      for (const c of Object.values(art.companions)) if (c && c.awake === c.asleep) c.asleep = undefined;
      onReady(art);
    }
  };
  for (const [name, keep] of files) {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0) {
        keep(img);
        loaded += 1;
      }
      done();
    };
    img.onerror = done;
    img.src = artUrl(`companions/${name}`);
  }
}
