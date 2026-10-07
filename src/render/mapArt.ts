/**
 * Painted map art (art round two, DESIGN.md 2d): a backdrop for the meadow,
 * a lit and an unlit lantern post, and the small plants and stones beside
 * the path, under public/art/map. Each piece is optional: until it loads,
 * and if it never does, the map draws that piece in code as before.
 */

import { artUrl } from './artPath';

import type { CompanionId } from './creatures';

export type MapPropKind = 'tuft' | 'flower' | 'mushroom' | 'stone';

/** A painted companion: awake (facing right) and curled up asleep (STYLE.md "The cast"). */
export interface CompanionArt {
  awake: HTMLImageElement;
  asleep?: HTMLImageElement;
}

/** The picture files for each companion id (the ids stay for saved games; the pictures are what she sees). */
export const COMPANION_FILES: Record<CompanionId, string> = { firefly: 'fairy', fish: 'dragon', hero: 'hero' };

export interface MapArt {
  /** The meadow's painted sky, hills and ground; no path, lanterns or creatures. */
  backdrop?: HTMLImageElement;
  lanternLit?: HTMLImageElement;
  lanternUnlit?: HTMLImageElement;
  /** A seamless road surface, repeated inside the path ribbon. */
  road?: HTMLImageElement;
  /** The painted companions, by id; a missing one draws in code. */
  companions: Partial<Record<CompanionId, CompanionArt>>;
  props: Partial<Record<MapPropKind, HTMLImageElement>>;
}

/** Where the painted horizon sits in the backdrop, as a fraction of its height from the top. */
export const BACKDROP_HORIZON = 0.37;
/** The lamp's centre in the lantern pictures, as a fraction of the picture's height from the bottom. */
export const LANTERN_LAMP_FROM_BOTTOM = 0.7;

const PROP_KINDS: readonly MapPropKind[] = ['tuft', 'flower', 'mushroom', 'stone'];

/** Loads every map picture that exists and calls back once with all that loaded. */
export function loadMapArt(onReady: (art: MapArt) => void): void {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return;
  const art: MapArt = { props: {}, companions: {} };
  const files: Array<[string, (img: HTMLImageElement) => void]> = [
    ['meadow-backdrop.jpg', (img) => (art.backdrop = img)],
    ['lantern-lit.png', (img) => (art.lanternLit = img)],
    ['lantern-unlit.png', (img) => (art.lanternUnlit = img)],
    ['road.jpg', (img) => (art.road = img)],
    ...(Object.entries(COMPANION_FILES) as Array<[CompanionId, string]>).flatMap(([id, file]): Array<[string, (img: HTMLImageElement) => void]> => [
      [`../companions/${file}.png`, (img) => (art.companions[id] = { ...art.companions[id], awake: img })],
      [`../companions/${file}-asleep.png`, (img) => { if (art.companions[id]) art.companions[id]!.asleep = img; else art.companions[id] = { awake: img, asleep: img }; }],
    ]),
    ...PROP_KINDS.map((k): [string, (img: HTMLImageElement) => void] => [`prop-${k}.png`, (img) => (art.props[k] = img)]),
  ];
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
    img.src = artUrl(`map/${name}`);
  }
}
