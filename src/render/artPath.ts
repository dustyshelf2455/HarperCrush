/**
 * Where the painted pictures live (STYLE.md "Files, sizes, themes"). Every
 * theme is a folder under public/art with the same file names, so a reskin
 * is a second folder and nothing else. The theme is read once at launch.
 */
const THEME_KEY = 'glimmerfall.theme';

function themeName(): string {
  try {
    const t = typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_KEY);
    return t && /^[a-z0-9-]+$/.test(t) ? t : 'default';
  } catch {
    return 'default';
  }
}

export const ART_THEME = themeName();

/** The absolute URL of a picture inside the current theme, e.g. artUrl('gems/star.png'). */
export function artUrl(relative: string): string {
  return new URL(`art/${ART_THEME}/${relative}`, document.baseURI).href;
}
