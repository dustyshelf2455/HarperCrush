/**
 * The sound engine: one AudioContext, a warm reverb, a limiter, and a small
 * set of instruments synthesised from oscillators. No audio files anywhere.
 *
 * Browser rules this respects:
 * - The context is created and resumed inside a user gesture (unlock()).
 * - The very first sound fades in over 1.5 s so nothing is ever sudden.
 * - suspend()/resume() exist so a hidden page never keeps sounding.
 */
import { midiToHz } from '../shared/scale';
import type { MelodyInstrument } from './composer';

const MASTER_LEVEL = 0.55;
const SILENT = 0.0001;

interface Partial {
  ratio: number;
  gain: number;
  decay: number;
  attack?: number;
  type?: OscillatorType;
  detune?: number;
}

const INSTRUMENTS: Record<MelodyInstrument, { partials: Partial[]; wet: number }> = {
  // Music box / celesta: a pure fundamental with a little sparkle on top.
  celesta: {
    partials: [
      { ratio: 1, gain: 1.0, decay: 1.9 },
      { ratio: 1, gain: 0.35, decay: 1.4, detune: 5 },
      { ratio: 3, gain: 0.1, decay: 0.55 },
      { ratio: 6, gain: 0.035, decay: 0.25 },
    ],
    wet: 0.4,
  },
  // Marimba: short, woody, with the characteristic fourth harmonic.
  marimba: {
    partials: [
      { ratio: 1, gain: 1.0, decay: 0.5 },
      { ratio: 1, gain: 0.3, decay: 0.3, type: 'triangle' },
      { ratio: 4, gain: 0.3, decay: 0.09 },
    ],
    wet: 0.3,
  },
  // Soft bell for ambient sketches: long and glassy, harmonic so it never clashes.
  bell: {
    partials: [
      { ratio: 1, gain: 1.0, decay: 3.2 },
      { ratio: 2, gain: 0.22, decay: 2.2 },
      { ratio: 3, gain: 0.08, decay: 1.4 },
      { ratio: 5, gain: 0.03, decay: 0.7 },
    ],
    wet: 0.65,
  },
};

const BASS: Partial[] = [
  { ratio: 1, gain: 1.0, decay: 1.1, attack: 0.01 },
  { ratio: 1, gain: 0.35, decay: 0.6, type: 'triangle', attack: 0.01 },
  { ratio: 2, gain: 0.08, decay: 0.4, attack: 0.01 },
];

const PING: Partial[] = [
  { ratio: 1, gain: 1.0, decay: 1.4 },
  { ratio: 2, gain: 0.18, decay: 0.7 },
];

/** A fader pair for one music sketch: dry into the bus, wet into the reverb, so a whole sketch fades together. */
export interface Channel {
  readonly dry: GainNode;
  readonly wet: GainNode;
}

function envelope(param: AudioParam, t: number, peak: number, attack: number, decay: number): void {
  param.setValueAtTime(SILENT, t);
  param.exponentialRampToValueAtTime(Math.max(peak, SILENT * 2), t + attack);
  param.exponentialRampToValueAtTime(SILENT, t + attack + decay);
}

/** Pad attack and release length in seconds; equal so a crossfade sums to a steady level. */
const PAD_ATTACK = 2.6;

/** A sustained chord voice with a slow filter sweep; released on the next chord. */
export class PadVoice {
  private readonly oscillators: OscillatorNode[] = [];
  private readonly gain: GainNode;
  private readonly nodes: AudioNode[] = [];
  private readonly level: number;
  private released = false;

  constructor(ctx: AudioContext, midis: readonly number[], t: number, level: number, dest: AudioNode, reverbIn: AudioNode) {
    this.level = Math.max(level, SILENT * 2);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 640;
    filter.Q.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.055;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 170;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start(t);

    const perOsc = 0.4 / Math.max(1, midis.length);
    for (const midi of midis) {
      const f = midiToHz(midi);
      const voices: Array<[OscillatorType, number, number, number]> = [
        ['triangle', 1, -6, perOsc],
        ['triangle', 1, 6, perOsc],
        ['sine', 2, 0, perOsc * 0.25],
      ];
      for (const [type, ratio, detune, g] of voices) {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = f * ratio;
        osc.detune.value = detune;
        const og = ctx.createGain();
        og.gain.value = g;
        osc.connect(og);
        og.connect(filter);
        osc.start(t);
        this.oscillators.push(osc);
        this.nodes.push(og);
      }
    }

    this.gain = ctx.createGain();
    // Silence before the first event, so an early release can never jump to the default gain of 1.
    // Linear ramps, not exponential: two pads crossfading linearly keep a steady bed through a chord
    // change, where exponential ramps would leave a near-silent gap in the middle.
    this.gain.gain.value = 0;
    this.gain.gain.setValueAtTime(0, t);
    this.gain.gain.linearRampToValueAtTime(this.level, t + PAD_ATTACK);
    filter.connect(this.gain);
    this.gain.connect(dest);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    this.gain.connect(wet);
    wet.connect(reverbIn);
    this.oscillators.push(lfo);
    this.nodes.push(filter, lfoGain, this.gain, wet);
  }

  release(t: number, seconds = PAD_ATTACK): void {
    if (this.released) return;
    this.released = true;
    const g = this.gain.gain;
    if (typeof g.cancelAndHoldAtTime === 'function') {
      // Freeze the attack wherever it is and fade from there; never a jump.
      g.cancelAndHoldAtTime(t);
    } else {
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.min(this.level, Math.max(g.value, 0)), t);
    }
    g.linearRampToValueAtTime(0, t + seconds);
    const end = t + seconds + 0.1;
    this.oscillators.forEach((o) => o.stop(end));
    const last = this.oscillators[0];
    if (last) last.onended = () => this.nodes.forEach((n) => n.disconnect());
  }
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private reverbIn: GainNode | null = null;
  private master: GainNode | null = null;
  private unlocked = false;

  get context(): AudioContext | null {
    return this.ctx;
  }

  get now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  get isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  /** Create or resume the context. The first call must come from a user gesture. */
  async unlock(): Promise<AudioContext | null> {
    if (typeof AudioContext === 'undefined') return null;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.build(this.ctx);
    }
    const ctx = this.ctx;
    if (ctx.state !== 'running') {
      try {
        await ctx.resume();
      } catch {
        /* still needs a gesture; the next touch will try again */
      }
    }
    if (!this.unlocked && ctx.state === 'running' && this.master) {
      this.unlocked = true;
      const t = ctx.currentTime;
      this.master.gain.setValueAtTime(SILENT, t);
      this.master.gain.exponentialRampToValueAtTime(MASTER_LEVEL, t + 1.5);
    }
    return ctx;
  }

  /** The page is hidden: nothing may keep sounding from a pocket or a bag. */
  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend();
  }

  /** The page is back, or the user touched it after an interruption. */
  resume(): void {
    if (this.ctx && this.unlocked && this.ctx.state !== 'running') void this.ctx.resume();
  }

  /** A fader pair into the bus and the reverb. Each music sketch gets one so it can be faded as a whole. */
  createChannel(): Channel | null {
    if (!this.ctx || !this.bus || !this.reverbIn) return null;
    const dry = this.ctx.createGain();
    const wet = this.ctx.createGain();
    dry.gain.value = 1;
    wet.gain.value = 1;
    dry.connect(this.bus);
    wet.connect(this.reverbIn);
    return { dry, wet };
  }

  note(instrument: MelodyInstrument, midi: number, t: number, vel: number, dest?: Channel | null): void {
    const def = INSTRUMENTS[instrument];
    this.tone(midi, t, vel, def.partials, def.wet, dest);
  }

  bass(midi: number, t: number, vel: number, dest?: Channel | null): void {
    this.tone(midi, t, vel, BASS, 0.12, dest);
  }

  ping(midi: number, t: number, vel: number, dest?: Channel | null): void {
    this.tone(midi, t, vel, PING, 0.75, dest);
  }

  pad(midis: readonly number[], t: number, level: number, dest?: Channel | null): PadVoice | null {
    if (!this.ctx || !this.bus || !this.reverbIn) return null;
    return new PadVoice(this.ctx, midis, t, level, dest?.dry ?? this.bus, dest?.wet ?? this.reverbIn);
  }

  /** A short rising run of chord tones, used when a power goes off. */
  arpeggio(midis: readonly number[], t: number, vel: number, spacing = 0.07, instrument: MelodyInstrument = 'celesta'): void {
    midis.forEach((midi, i) => this.note(instrument, midi, t + i * spacing, vel * (0.75 + 0.25 * (i / Math.max(1, midis.length - 1)))));
  }

  private tone(midi: number, t: number, vel: number, partials: Partial[], wet: number, dest?: Channel | null): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus || !this.reverbIn || vel <= 0) return;
    const out = dest?.dry ?? this.bus;
    const wetOut = dest?.wet ?? this.reverbIn;
    const f = midiToHz(midi);
    const noteGain = ctx.createGain();
    noteGain.gain.value = 1;
    noteGain.connect(out);
    let wetGain: GainNode | null = null;
    if (wet > 0) {
      wetGain = ctx.createGain();
      wetGain.gain.value = wet;
      noteGain.connect(wetGain);
      wetGain.connect(wetOut);
    }
    let longestEnd = 0;
    let longest: OscillatorNode | null = null;
    const cleanup: AudioNode[] = [noteGain];
    for (const p of partials) {
      const attack = p.attack ?? 0.004;
      const osc = ctx.createOscillator();
      osc.type = p.type ?? 'sine';
      osc.frequency.value = f * p.ratio;
      if (p.detune) osc.detune.value = p.detune;
      const g = ctx.createGain();
      envelope(g.gain, t, vel * p.gain, attack, p.decay);
      osc.connect(g);
      g.connect(noteGain);
      osc.start(t);
      const end = t + attack + p.decay + 0.05;
      osc.stop(end);
      cleanup.push(g);
      if (end > longestEnd) {
        longestEnd = end;
        longest = osc;
      }
    }
    if (longest) {
      longest.onended = () => {
        cleanup.forEach((n) => n.disconnect());
        wetGain?.disconnect();
      };
    }
  }

  private build(ctx: AudioContext): void {
    const master = ctx.createGain();
    master.gain.value = SILENT;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 10;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    const bus = ctx.createGain();
    bus.gain.value = 1;
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 2.6, 3.2);
    const reverbIn = ctx.createGain();
    reverbIn.gain.value = 1;
    reverbIn.connect(convolver);
    convolver.connect(limiter);
    bus.connect(limiter);
    limiter.connect(master);
    master.connect(ctx.destination);
    this.master = master;
    this.bus = bus;
    this.reverbIn = reverbIn;
  }
}

/** A warm, dark impulse response: decaying noise, low-passed. */
function makeImpulse(ctx: BaseAudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const buffer = ctx.createBuffer(2, length, rate);
  let seed = 12345;
  const rand = (): number => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const env = Math.pow(1 - i / length, decay);
      const n = rand() * 2 - 1;
      lp += 0.16 * (n - lp);
      data[i] = lp * env * 2.4;
    }
  }
  return buffer;
}
