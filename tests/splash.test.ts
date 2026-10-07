import { describe, expect, it } from 'vitest';
import {
  SPLASH_FADE_MS,
  SPLASH_MAX_MS,
  SPLASH_MIN_MS,
  SPLASH_TAP_AFTER_MS,
  placePicture,
  splashAlpha,
  splashDone,
  splashFadeStart,
} from '../src/game/splashTiming';

describe('splash timing', () => {
  it('holds for the minimum even when the pictures are ready at once', () => {
    expect(splashFadeStart({ readyAt: 50, tappedAt: null })).toBe(SPLASH_MIN_MS);
    expect(splashAlpha(SPLASH_MIN_MS - 1, { readyAt: 50, tappedAt: null })).toBe(1);
  });

  it('waits for the pictures, but never past the maximum', () => {
    expect(splashFadeStart({ readyAt: 3000, tappedAt: null })).toBe(3000);
    expect(splashFadeStart({ readyAt: null, tappedAt: null })).toBe(SPLASH_MAX_MS);
    expect(splashFadeStart({ readyAt: 9000, tappedAt: null })).toBe(SPLASH_MAX_MS);
  });

  it('lets a tap bring the fade forward, but not a touch in the first moment', () => {
    expect(splashFadeStart({ readyAt: null, tappedAt: 1500 })).toBe(1500);
    expect(splashFadeStart({ readyAt: null, tappedAt: 100 })).toBe(SPLASH_TAP_AFTER_MS);
  });

  it('fades smoothly from 1 to 0 and is then done', () => {
    const times = { readyAt: 100, tappedAt: null };
    const start = splashFadeStart(times);
    expect(splashAlpha(start, times)).toBe(1);
    const mid = splashAlpha(start + SPLASH_FADE_MS / 2, times);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(splashAlpha(start + SPLASH_FADE_MS, times)).toBe(0);
    expect(splashDone(start + SPLASH_FADE_MS - 1, times)).toBe(false);
    expect(splashDone(start + SPLASH_FADE_MS, times)).toBe(true);
  });
});

describe('splash picture placement', () => {
  it('stands on the bottom edge of a tall phone, a little wider than the screen, with a feathered top', () => {
    const p = placePicture(402, 874, 1024, 1536);
    expect(p.width).toBeCloseTo(402 * 1.12, 5);
    expect(p.x).toBeCloseTo((402 - p.width) / 2, 5);
    expect(p.y + p.height).toBeCloseTo(874, 5);
    expect(p.y).toBeGreaterThan(100);
    expect(p.feather).toBeGreaterThan(0);
  });

  it('simply covers a squarer screen', () => {
    const p = placePicture(768, 1024, 1024, 1536);
    expect(p.feather).toBe(0);
    expect(p.width).toBeCloseTo(768, 5);
    expect(p.height).toBeCloseTo(1152, 5);
    expect(p.y).toBeCloseTo(-64, 5);
  });
});
