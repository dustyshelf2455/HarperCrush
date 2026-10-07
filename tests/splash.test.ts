import { describe, expect, it } from 'vitest';
import {
  SPLASH_FADE_MS,
  SPLASH_OPEN_MS,
  SPLASH_TAP_AFTER_MS,
  doorHit,
  placeDoor,
  placePicture,
  splashAlpha,
  splashDone,
  splashFadeStart,
  splashOpening,
} from '../src/game/splashTiming';

describe('splash timing', () => {
  it('waits for the door however long it takes', () => {
    const waiting = { openedAt: null };
    expect(splashFadeStart(waiting)).toBeNull();
    expect(splashAlpha(60_000, waiting)).toBe(1);
    expect(splashDone(60_000, waiting)).toBe(false);
    expect(splashOpening(60_000, waiting)).toBe(0);
  });

  it('counts a tap in the first moment from the first moment, so the picture is always seen', () => {
    expect(splashFadeStart({ openedAt: 100 })).toBe(SPLASH_TAP_AFTER_MS + SPLASH_OPEN_MS);
    expect(splashFadeStart({ openedAt: 3000 })).toBe(3000 + SPLASH_OPEN_MS);
  });

  it('swells the door light, then fades smoothly from 1 to 0 and is done', () => {
    const times = { openedAt: 3000 };
    expect(splashOpening(3000, times)).toBe(0);
    expect(splashOpening(3000 + SPLASH_OPEN_MS, times)).toBe(1);
    const start = splashFadeStart(times)!;
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

describe('the fairy door', () => {
  it('stands at the bottom centre, above the home indicator, and is tapped with a margin', () => {
    const d = placeDoor(402, 874);
    expect(d.x + d.width / 2).toBeCloseTo(201, 5);
    expect(d.y + d.height).toBeLessThan(874 - 34);
    expect(d.y + d.height).toBeGreaterThan(874 * 0.9);
    expect(doorHit(d, 201, d.y + d.height / 2)).toBe(true);
    expect(doorHit(d, d.x - 10, d.y)).toBe(true);
    expect(doorHit(d, 201, 100)).toBe(false);
  });
});
