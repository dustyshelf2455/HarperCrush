/**
 * Painted map art (art round two, DESIGN.md 2d): a backdrop for the meadow,
 * a lit and an unlit lantern post, and the small plants and stones beside
 * the path, under public/art/map. Each piece is optional: until it loads,
 * and if it never does, the map draws that piece in code as before.
 */

export type MapPropKind = 'tuft' | 'flower' | 'mushroom' | 'stone';

export interface MapArt {
  /** The meadow's painted sky, hills and ground; no path, lanterns or creatures. */
  backdrop?: HTMLImageElement;
  lanternLit?: HTMLImageElement;
  lanternUnlit?: HTMLImageElement;
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
  const art: MapArt = { props: {} };
  const files: Array<[string, (img: HTMLImageElement) => void]> = [
    ['meadow-backdrop.jpg', (img) => (art.backdrop = img)],
    ['lantern-lit.png', (img) => (art.lanternLit = img)],
    ['lantern-unlit.png', (img) => (art.lanternUnlit = img)],
    ...PROP_KINDS.map((k): [string, (img: HTMLImageElement) => void] => [`prop-${k}.png`, (img) => (art.props[k] = img)]),
  ];
  let pending = files.length;
  let loaded = 0;
  const done = (): void => {
    pending -= 1;
    if (pending === 0 && loaded > 0) onReady(art);
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
    img.src = new URL(`art/map/${name}`, document.baseURI).href;
  }
}
