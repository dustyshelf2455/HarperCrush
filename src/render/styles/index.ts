import { auroraCrystal } from './auroraCrystal';
import { nightGarden } from './nightGarden';
import { stainedGlass } from './stainedGlass';
import type { GemStyle, StyleId } from './types';

export const STYLES: readonly GemStyle[] = [nightGarden, stainedGlass, auroraCrystal];

export function styleById(id: string): GemStyle {
  return STYLES.find((s) => s.id === (id as StyleId)) ?? nightGarden;
}

export type { GemStyle, StyleId } from './types';
