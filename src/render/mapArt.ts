/**
 * Painted map art (STYLE.md "The map", DESIGN.md 2e): the storybook pages,
 * one beacon design per area (lit and unlit), and the companions, under
 * public/art/<theme>/map and companions. Each piece is optional: until it
 * loads, and if it never does, the map draws that piece in code.
 */

import type { AreaId } from '../core/journey';
import { artUrl } from './artPath';

import type { CompanionId } from './creatures';
import { SECTIONS_PER_AREA, sectionRef } from './mapWorld';

/** A painted companion: awake (facing right) and curled up asleep (STYLE.md "The cast"). */
export interface CompanionArt {
  awake: HTMLImageElement;
  asleep?: HTMLImageElement;
}

/** The picture files for each companion id (the ids stay for saved games; the pictures are what she sees). */
export const COMPANION_FILES: Record<CompanionId, string> = { firefly: 'fairy', fish: 'dragon', hero: 'hero' };

/** An area's beacon (the lamp post that marks a level, STYLE.md "The map"): lit and unlit cut-outs. */
export interface BeaconArt {
  lit: HTMLImageElement;
  unlit: HTMLImageElement;
}

export interface MapArt {
  /** The painted companions, by id; a missing one draws in code. */
  companions: Partial<Record<CompanionId, CompanionArt>>;
  /** The beacons, one design per area; a missing one draws as the code-drawn lantern post. */
  beacons: Partial<Record<AreaId, BeaconArt>>;
}

/**
 * Where the lamp's centre sits in each beacon picture, as a fraction of the
 * picture's height from the bottom (measured from the cut-outs), so the
 * code-drawn light and the companion's perch land on the painted lamp.
 */
export const BEACON_LAMP: Record<AreaId, number> = { meadow: 0.82, cave: 0.81, lagoon: 0.81, castle: 0.73, garden: 0.83, peak: 0.89, hollow: 0.86 };

/**
 * The painted map pages (STYLE.md "The map"), loaded as the camera nears
 * them. A page that is missing or still loading draws as a code-drawn fallback
 * (the area's ground and a ribbon along the recorded path), so the map never
 * waits on a file.
 */
export interface SectionArt {
  /** The page's picture if it has loaded; asking for it starts the load. */
  get(k: number): HTMLImageElement | null;
}

export function loadSectionArt(onLoad: () => void): SectionArt {
  // Keyed by area and page within it: the same picture serves every pass through the areas.
  const pictures = new Map<string, HTMLImageElement | null>();
  return {
    get(k) {
      if (typeof Image === 'undefined') return null;
      const ref = sectionRef(k);
      const key = `${ref.area}-${ref.i}`;
      const hit = pictures.get(key);
      if (hit !== undefined) return hit;
      pictures.set(key, null);
      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0) {
          pictures.set(key, img);
          onLoad();
        }
      };
      img.src = artUrl(`map/section-${ref.area}-${ref.i + 1}.jpg`);
      return null;
    },
  };
}

/** Every page file name in the default theme, for listings. */
export function sectionFileNames(areas: readonly AreaId[]): string[] {
  const out: string[] = [];
  for (const a of areas) for (let i = 1; i <= SECTIONS_PER_AREA; i++) out.push(`section-${a}-${i}.jpg`);
  return out;
}

/** Loads every map picture that exists and calls back once with all that loaded. */
export function loadMapArt(onReady: (art: MapArt) => void): void {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const art: MapArt = { companions: {}, beacons: {} };
  const areas: readonly AreaId[] = ['meadow', 'cave', 'lagoon', 'castle', 'garden', 'peak', 'hollow'];
  const files: Array<[string, (img: HTMLImageElement) => void]> = [
    ...areas.flatMap((a): Array<[string, (img: HTMLImageElement) => void]> => [
      [`beacon-${a}-lit.png`, (img) => (art.beacons[a] = { ...(art.beacons[a] ?? { unlit: img }), lit: img })],
      [`beacon-${a}-unlit.png`, (img) => (art.beacons[a] = { ...(art.beacons[a] ?? { lit: img }), unlit: img })],
    ]),
    ...(Object.entries(COMPANION_FILES) as Array<[CompanionId, string]>).flatMap(([id, file]): Array<[string, (img: HTMLImageElement) => void]> => [
      [`../companions/${file}.png`, (img) => (art.companions[id] = { ...art.companions[id], awake: img })],
      [`../companions/${file}-asleep.png`, (img) => { if (art.companions[id]) art.companions[id]!.asleep = img; else art.companions[id] = { awake: img, asleep: img }; }],
    ]),
  ];
  let pending = files.length;
  let loaded = 0;
  const done = (): void => {
    pending -= 1;
    if (pending === 0 && loaded > 0) {
      for (const c of Object.values(art.companions)) if (c && c.awake === c.asleep) c.asleep = undefined;
      // A beacon needs both pictures; with one missing the code-drawn post stands in.
      for (const a of areas) if (art.beacons[a] && art.beacons[a]!.lit === art.beacons[a]!.unlit) delete art.beacons[a];
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
    img.src = artUrl(`map/${name}`);
  }
}
