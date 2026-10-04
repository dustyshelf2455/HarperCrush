/** Maps what happens on the board to warm pentatonic sound. */
import type { AudioEngine } from '../audio/engine';
import type { MusicPlayer } from '../audio/player';
import type { Piece, PowerKind } from '../core/game';
import type { Cell, GemType } from '../core/grid';

export class GameSounds {
  enabled = true;

  constructor(
    private readonly engine: AudioEngine,
    private readonly player: MusicPlayer,
  ) {}

  private get ctx(): AudioContext | null {
    return this.enabled && this.engine.isRunning ? this.engine.context : null;
  }

  swap(valid: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (valid) this.engine.tick(ctx.currentTime, 0.14);
    else this.engine.note('marimba', 55, ctx.currentTime + 0.12, 0.22);
  }

  /** One soft note per cleared group, climbing with the cascade and the group index. */
  clear(groups: Array<{ cells: Cell[]; type: GemType | null }>, cascade: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tones = this.player.chordNow(6, 18);
    groups.forEach((g, i) => {
      const idx = Math.min(tones.length - 1, cascade * 2 + i);
      const midi = tones[idx] ?? tones[tones.length - 1] ?? 67;
      const vel = Math.min(0.75, 0.42 + g.cells.length * 0.05 + cascade * 0.04);
      this.engine.note('celesta', midi, ctx.currentTime + 0.1 + i * 0.05, vel);
    });
  }

  created(piece: Piece): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const tones = this.player.chordNow(10, 18);
    this.engine.arpeggio(tones.slice(0, piece.power === 'orb' ? 5 : 3), ctx.currentTime + 0.05, 0.4, 0.06);
  }

  fired(power: PowerKind): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    if (power === 'orb') {
      this.engine.arpeggio(this.player.chordNow(7, 19).slice(0, 9), t + 0.1, 0.5, 0.07);
      const swell = this.engine.pad(this.player.chordNow(3, 8).slice(0, 3), t + 0.05, 0.1);
      swell?.release(t + 2.4, 2.2);
    } else {
      this.engine.arpeggio(this.player.chordNow(8, 17).slice(0, 6), t + 0.1, 0.45, 0.09);
    }
  }

  land(count: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const n = Math.min(3, count);
    for (let i = 0; i < n; i++) this.engine.thud(ctx.currentTime + i * 0.02, 0.09);
  }

  reshuffle(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.engine.arpeggio(this.player.chordNow(5, 14).slice(0, 5), ctx.currentTime + 0.05, 0.3, 0.1);
  }

  levelDone(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const tones = this.player.chordNow(5, 15);
    const phrase = [tones[3], tones[2], tones[1], tones[0], tones[2]].filter((m): m is number => m !== undefined);
    phrase.forEach((m, i) => this.engine.note('celesta', m, t + 0.2 + i * 0.22, 0.5));
    const swell = this.engine.pad(this.player.chordNow(3, 8).slice(0, 3), t + 0.1, 0.12);
    swell?.release(t + 2.8, 2.5);
  }
}
