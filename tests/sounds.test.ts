/**
 * The pure side of the game's sound: every power and combination phrase, the
 * other phrases (lantern, companion, twinkle, level, transform), the area
 * voices' loudness, and the duck shape. Nothing here needs a browser.
 */
import { describe, expect, it } from 'vitest';
import { MELODY_INSTRUMENTS } from '../src/audio/composer';
import { INSTRUMENTS, duckTimes } from '../src/audio/engine';
import type { Combo, FireStep, PowerKind } from '../src/core/game';
import {
  COMBOS,
  type Phrase,
  companionPhrase,
  lanternPhrase,
  levelDonePhrase,
  phraseEnd,
  phraseFor,
  playsOnce,
  transformPhrase,
  twinklePhrase,
} from '../src/game/sounds';
import { CHORDS, type Chord, isInScale } from '../src/shared/scale';

const POWERS: readonly PowerKind[] = ['cometRow', 'cometCol', 'orb', 'bloom', 'sprite', 'starburst', 'moonrise', 'aurora'];
const ALL_CHORDS: readonly Chord[] = Object.values(CHORDS);

/** The power each combination is most naturally reported on, so the phrase is built for a step the core would really emit. */
const COMBO_POWER: Record<Combo, PowerKind> = {
  cross: 'cometRow',
  wideCross: 'cometCol',
  giantBloom: 'bloom',
  cometShower: 'cometRow',
  bloomWave: 'bloom',
  sunrise: 'orb',
  carry: 'sprite',
  twinFlight: 'sprite',
  eightStar: 'starburst',
  starShower: 'starburst',
  wideMoon: 'moonrise',
  moonflower: 'moonrise',
  moonTide: 'moonrise',
  fullMoon: 'moonrise',
  moonStar: 'moonrise',
  auroraSky: 'aurora',
  auroraDawn: 'aurora',
  pair: 'bloom',
};

function step(power: PowerKind, extra: Partial<FireStep> = {}): FireStep {
  return { kind: 'fire', power, at: { row: 2, col: 3 }, cells: [], color: 'star', ...extra };
}

/** Every step shape the sound cares about: each power plain, the bloom's second opening, a carrying sprite, each combination. */
function allSteps(): Array<{ name: string; step: FireStep }> {
  const out: Array<{ name: string; step: FireStep }> = POWERS.map((power) => ({ name: power, step: step(power) }));
  out.push({ name: 'bloom phase 2', step: step('bloom', { phase: 2 }) });
  out.push({ name: 'sprite carrying', step: step('sprite', { carrying: 'bloom', target: { row: 0, col: 0 }, combo: 'carry' }) });
  for (const combo of COMBOS) out.push({ name: `combo ${combo}`, step: step(COMBO_POWER[combo], { combo }) });
  return out;
}

function expectWellFormed(p: Phrase): void {
  for (const n of p.notes) {
    expect(isInScale(n.midi)).toBe(true);
    expect(n.midi).toBeGreaterThanOrEqual(36);
    expect(n.midi).toBeLessThanOrEqual(96);
    expect(n.vel).toBeGreaterThan(0);
    expect(n.vel).toBeLessThanOrEqual(0.8);
    expect(n.at).toBeGreaterThanOrEqual(0);
    expect(MELODY_INSTRUMENTS).toContain(n.instrument);
  }
  for (const pad of p.pads) {
    expect(pad.midis.length).toBeGreaterThan(0);
    for (const m of pad.midis) {
      expect(isInScale(m)).toBe(true);
      expect(m).toBeGreaterThanOrEqual(36);
      expect(m).toBeLessThanOrEqual(96);
    }
    expect(pad.level).toBeGreaterThan(0);
    expect(pad.level).toBeLessThanOrEqual(0.2);
    expect(pad.attack).toBeGreaterThan(0);
    expect(pad.hold).toBeGreaterThan(0);
    expect(pad.release).toBeGreaterThan(0);
  }
  expect(p.duck).toBeGreaterThanOrEqual(0);
  expect(p.duck).toBeLessThanOrEqual(8);
  for (let i = 1; i < p.notes.length; i++) expect(p.notes[i]!.at).toBeGreaterThanOrEqual(p.notes[i - 1]!.at);
}

/**
 * A loudness proxy for comparing phrases: the most note velocity starting
 * inside any 0.35 s window (notes ring for about that long at full level)
 * plus twice the pad levels. It is a comparison, not a measurement.
 */
function peak(p: Phrase): number {
  let best = 0;
  for (const n of p.notes) {
    let sum = 0;
    for (const m of p.notes) if (m.at >= n.at && m.at < n.at + 0.35) sum += m.vel;
    best = Math.max(best, sum);
  }
  return best + 2 * p.pads.reduce((s, pad) => s + pad.level, 0);
}

describe('power phrases', () => {
  it('gives every power and every combination a phrase, in every chord', () => {
    for (const chord of ALL_CHORDS) {
      for (const { step: s } of allSteps()) {
        const p = phraseFor(s, chord);
        expect(p.notes.length).toBeGreaterThan(0);
        expectWellFormed(p);
      }
    }
  });

  it('keeps every note in the pentatonic scale, between MIDI 36 and 96, at velocities in (0, 0.8]', () => {
    for (const chord of ALL_CHORDS) {
      for (const { step: s } of allSteps()) {
        expectWellFormed(phraseFor(s, chord, false));
        expectWellFormed(phraseFor(s, chord, true));
      }
    }
  });

  it('makes discovery phrases longer and richer than plain ones, with a pad underneath and a duck', () => {
    for (const chord of ALL_CHORDS) {
      for (const { name, step: s } of allSteps()) {
        const plain = phraseFor(s, chord, false);
        const rich = phraseFor(s, chord, true);
        expect(rich.notes.length + rich.pads.length, name).toBeGreaterThan(plain.notes.length + plain.pads.length);
        expect(phraseEnd(rich), name).toBeGreaterThanOrEqual(phraseEnd(plain));
        expect(rich.pads.length, name).toBeGreaterThan(0);
        expect(rich.duck, name).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('keeps the comet and orb phrases as the Stage 2 ones', () => {
    const comet = phraseFor(step('cometRow'), CHORDS.G);
    expect(comet.notes.length).toBe(6);
    expect(comet.notes.every((n) => n.instrument === 'celesta')).toBe(true);
    expect(comet.notes.map((n) => n.midi)).toEqual([74, 79, 83, 86, 91, 95]);
    expect(comet.pads).toEqual([]);
    const orb = phraseFor(step('orb'), CHORDS.G);
    expect(orb.notes.length).toBe(7); // two octaves, degrees 7..17
    expect(orb.notes[0]!.midi + 24).toBe(orb.notes[orb.notes.length - 1]!.midi);
    expect(orb.pads.length).toBe(1);
  });

  it('shapes each new power the way the design describes it', () => {
    const bloom1 = phraseFor(step('bloom', { phase: 1 }), CHORDS.G);
    const bloom2 = phraseFor(step('bloom', { phase: 2 }), CHORDS.G);
    expect(bloom1.notes.length).toBe(5);
    expect(bloom1.notes.every((n) => n.instrument === 'marimba')).toBe(true);
    expect(bloom1.pads.length).toBe(1);
    // Opening outward: each petal is further from the first (middle) note than the one before it.
    const centre = bloom1.notes[0]!.midi;
    const dist = bloom1.notes.map((n) => Math.abs(n.midi - centre));
    for (let i = 2; i < dist.length; i += 2) expect(dist[i]!).toBeGreaterThan(dist[i - 2]!);
    expect(bloom2.notes.length).toBeGreaterThan(bloom1.notes.length);
    expect(bloom2.pads[0]!.level).toBeGreaterThan(bloom1.pads[0]!.level);

    const sprite = phraseFor(step('sprite'), CHORDS.G);
    const trill = sprite.notes.filter((n) => n.at < 0.5);
    const pop = sprite.notes.filter((n) => n.at >= 0.5);
    expect(trill.length).toBeGreaterThanOrEqual(3);
    expect(trill.length).toBeLessThanOrEqual(4);
    for (let i = 1; i < trill.length; i++) expect(trill[i]!.midi).toBeGreaterThan(trill[i - 1]!.midi);
    expect(pop.length).toBe(1);
    expect(pop[0]!.at).toBeCloseTo(0.7, 5);
    expect(pop[0]!.vel).toBeLessThan(0.4);

    const star = phraseFor(step('starburst'), CHORDS.G);
    const first = star.notes[0]!;
    const above = star.notes.filter((n) => n.midi > first.midi).length;
    const below = star.notes.filter((n) => n.midi < first.midi).length;
    expect(above).toBeGreaterThan(0);
    expect(below).toBeGreaterThan(0);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);

    const moon = phraseFor(step('moonrise'), CHORDS.G);
    expect(moon.notes.length).toBe(2);
    expect(moon.notes[1]!.midi).toBeLessThan(moon.notes[0]!.midi); // descending
    expect(moon.notes.every((n) => n.midi <= 67)).toBe(true); // low
    expect(moon.pads.length).toBe(1);
    expect(moon.pads[0]!.hold).toBeCloseTo(1.2, 5);

    const aurora = phraseFor(step('aurora'), CHORDS.G);
    expect(aurora.pads.length).toBe(2);
    expect(aurora.pads[1]!.at - aurora.pads[0]!.at).toBeCloseTo(1.6, 5);
    expect(aurora.pads[0]!.midis).not.toEqual(aurora.pads[1]!.midis);
    expect(aurora.notes.every((n) => n.vel <= 0.25 && n.midi >= 86)).toBe(true); // sparse high twinkles
  });

  it('plays once-only combinations once and lets paired or carried powers each have their phrase', () => {
    for (const combo of ['cross', 'wideCross', 'cometShower', 'bloomWave', 'starShower', 'moonTide', 'sunrise', 'eightStar', 'fullMoon', 'auroraSky', 'auroraDawn'] as Combo[]) {
      expect(playsOnce(combo), combo).toBe(true);
    }
    for (const combo of ['pair', 'carry', 'twinFlight', 'giantBloom'] as Combo[]) expect(playsOnce(combo), combo).toBe(false);
    expect(COMBOS.length).toBe(18);
  });

  it('hands over from the sprite trill to the carried power without a pop', () => {
    const carrying = phraseFor(step('sprite', { carrying: 'bloom', combo: 'carry' }), CHORDS.G);
    expect(carrying.notes.every((n) => n.at < 0.5)).toBe(true);
    const carried = phraseFor(step('bloom', { combo: 'carry' }), CHORDS.G);
    expect(carried.notes).toEqual(phraseFor(step('bloom'), CHORDS.G).notes);
  });

  it('makes the combinations fuller than the plain powers they come from', () => {
    for (const chord of ALL_CHORDS) {
      expect(phraseFor(step('cometRow', { combo: 'cross' }), chord).notes.length).toBeGreaterThan(phraseFor(step('cometRow'), chord).notes.length);
      expect(phraseFor(step('bloom', { combo: 'giantBloom' }), chord).notes.length).toBeGreaterThan(phraseFor(step('bloom'), chord).notes.length);
      expect(phraseFor(step('moonrise', { combo: 'fullMoon' }), chord).notes.length).toBeGreaterThan(phraseFor(step('moonrise'), chord).notes.length);
      expect(phraseFor(step('aurora', { combo: 'auroraSky' }), chord).pads.length).toBe(3);
      const eight = phraseFor(step('starburst', { combo: 'eightStar' }), chord);
      expect(eight.notes.length).toBeGreaterThan(phraseFor(step('starburst'), chord).notes.length);
    }
  });

  it('keeps the sunrise majestic, not loud: slower and no louder than two orb runs, over about 2.5 s', () => {
    for (const chord of ALL_CHORDS) {
      const orb = phraseFor(step('orb'), chord);
      const sunrise = phraseFor(step('orb', { combo: 'sunrise' }), chord);
      expect(peak(sunrise)).toBeLessThanOrEqual(2 * peak(orb));
      expect(sunrise.pads[0]!.attack).toBeGreaterThanOrEqual(2.4);
      expect(phraseEnd(sunrise)).toBeGreaterThanOrEqual(2.5);
      expect(sunrise.duck).toBeGreaterThan(0);
    }
  });

  it('keeps every phrase, discovery forms included, no louder than today’s orb + orb', () => {
    for (const chord of ALL_CHORDS) {
      const ceiling = 2 * peak(phraseFor(step('orb'), chord));
      for (const { name, step: s } of allSteps()) {
        expect(peak(phraseFor(s, chord, false)), name).toBeLessThanOrEqual(ceiling);
        expect(peak(phraseFor(s, chord, true)), `${name} (discovery)`).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('dips the music for the big combinations and for discoveries, never for a plain power', () => {
    for (const power of POWERS) expect(phraseFor(step(power), CHORDS.G).duck).toBe(0);
    for (const combo of COMBOS) {
      const d = phraseFor(step(COMBO_POWER[combo], { combo }), CHORDS.G).duck;
      if (playsOnce(combo) || combo === 'giantBloom') expect(d, combo).toBeGreaterThan(0);
      else expect(d, combo).toBe(0);
    }
  });
});

describe('other phrases', () => {
  it('are well formed in every chord', () => {
    for (const chord of ALL_CHORDS) {
      for (const p of [
        transformPhrase(1, chord),
        transformPhrase(12, chord),
        lanternPhrase(chord, 'celesta'),
        lanternPhrase(chord, 'horn'),
        companionPhrase(chord),
        twinklePhrase(chord, 0),
        twinklePhrase(chord, 7),
        levelDonePhrase(chord, 'celesta'),
        levelDonePhrase(chord, 'glass', true),
      ]) {
        expect(p.notes.length).toBeGreaterThan(0);
        expectWellFormed(p);
        expect(p.duck).toBe(0);
      }
    }
  });

  it('shapes them as described: a shimmer, a resolving chord, a two-note hop, one soft twinkle, the level phrase', () => {
    const shimmer = transformPhrase(9, CHORDS.Em);
    expect(shimmer.notes.length).toBe(6);
    expect(shimmer.notes.every((n) => n.instrument === 'glass' && n.vel <= 0.25)).toBe(true);
    expect(transformPhrase(1, CHORDS.Em).notes.length).toBe(2);

    const lantern = lanternPhrase(CHORDS.Asus, 'harp');
    expect(lantern.pads.length).toBe(1);
    expect(lantern.notes.every((n) => n.instrument === 'harp')).toBe(true);
    // The last strum is the home chord, G B D, and the top note a high G.
    const resolved = lantern.notes.filter((n) => n.at >= 0.45 && n.at < 0.9).map((n) => n.midi % 12);
    expect(new Set(resolved)).toEqual(new Set([7, 11, 2]));
    expect(lantern.notes[lantern.notes.length - 1]!.midi % 12).toBe(7);

    const hop = companionPhrase(CHORDS.G);
    expect(hop.notes.length).toBe(2);
    expect(hop.notes[1]!.midi).toBeGreaterThan(hop.notes[0]!.midi);

    const twinkle = twinklePhrase(CHORDS.G, 3);
    expect(twinkle.notes.length).toBe(1);
    expect(twinkle.notes[0]!.vel).toBeLessThanOrEqual(0.2);
    expect(twinkle.notes[0]!.midi).toBeGreaterThanOrEqual(86);
    const cycle = new Set([0, 1, 2, 3].map((i) => twinklePhrase(CHORDS.G, i).notes[0]!.midi));
    expect(cycle.size).toBeGreaterThan(1);

    const done = levelDonePhrase(CHORDS.G, 'celesta');
    expect(done.notes.length).toBe(5);
    // The Stage 2 phrase unchanged: the fourth chord tone above G4 falling to the first, then back to the third.
    expect(done.notes.map((n) => n.midi)).toEqual([79, 74, 71, 67, 74]);
    const arrive = levelDonePhrase(CHORDS.G, 'water', true);
    expect(arrive.notes.every((n) => n.instrument === 'water')).toBe(true);
    expect(arrive.pads[0]!.level).toBeGreaterThan(done.pads[0]!.level);
  });
});

describe('instruments', () => {
  it('defines every melody voice with harmonic partials and a peak level comparable to the celesta', () => {
    const celesta = INSTRUMENTS.celesta.partials.reduce((s, p) => s + p.gain, 0);
    for (const name of MELODY_INSTRUMENTS) {
      const def = INSTRUMENTS[name];
      expect(def.partials.length).toBeGreaterThan(0);
      const sum = def.partials.reduce((s, p) => s + p.gain, 0);
      expect(sum, name).toBeGreaterThanOrEqual(celesta * 0.85);
      expect(sum, name).toBeLessThanOrEqual(celesta * 1.1);
      for (const p of def.partials) {
        // Whole-number ratios (or an octave below) keep every voice harmonic, so no voice can clash with another.
        expect(Number.isInteger(p.ratio) || p.ratio === 0.5, name).toBe(true);
        expect(p.ratio).toBeGreaterThan(0);
        expect(p.gain).toBeGreaterThan(0);
        expect(p.decay).toBeGreaterThan(0);
        if (p.detune !== undefined) expect(Math.abs(p.detune)).toBeLessThanOrEqual(8);
      }
      expect(def.wet).toBeGreaterThanOrEqual(0);
      expect(def.wet).toBeLessThanOrEqual(0.8);
    }
  });

  it('gives the slow voices a real attack and the plucked ones a quick one', () => {
    for (const name of ['water', 'horn'] as const) expect(Math.min(...INSTRUMENTS[name].partials.map((p) => p.attack ?? 0.004))).toBeGreaterThanOrEqual(0.05);
    for (const name of ['harp', 'celesta', 'kalimba'] as const) expect(Math.max(...INSTRUMENTS[name].partials.map((p) => p.attack ?? 0.004))).toBeLessThanOrEqual(0.01);
  });
});

describe('duck', () => {
  it('dips quickly but never as a step, holds, and eases back by the end', () => {
    for (const seconds of [0.1, 1, 2.4, 5, 20]) {
      const { dip, rise, end } = duckTimes(seconds);
      expect(dip).toBeGreaterThan(0.05);
      expect(dip).toBeLessThanOrEqual(0.18);
      expect(rise).toBeGreaterThan(dip);
      expect(end).toBeGreaterThan(rise);
      expect(end).toBeGreaterThanOrEqual(0.6);
      expect(end).toBeLessThanOrEqual(8);
    }
    expect(duckTimes(2).end).toBe(2);
  });
});
