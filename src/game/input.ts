/**
 * Touch input for small, imprecise hands. One finger drives a gesture at a
 * time: normally the first one down. A finger that lands and stays put (a
 * resting palm or thumb) is "parked": it neither drives nor blocks, and the
 * next finger that moves takes over. Both swipe-to-swap and tap-tap work.
 */
import type { Cell } from '../core/grid';

export interface InputHandler {
  cellAt(clientX: number, clientY: number): Cell | null;
  cellSize(): number;
  onTouch(clientX: number, clientY: number): void;
  onTap(cell: Cell | null, clientX: number, clientY: number): void;
  onSwipe(from: Cell, to: Cell): void;
}

interface Tracked {
  id: number;
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  lastMove: number;
  gestured: boolean;
  parked: boolean;
}

const PARK_AFTER_MS = 500;
const PARK_STILL_PX = 6;
const TAP_MAX_MS = 700;

export class PointerInput {
  private readonly pointers = new Map<number, Tracked>();
  private primary: number | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly handler: InputHandler,
  ) {
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.move);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    // touch-action: none (CSS) stops scroll and zoom. Do not preventDefault touchstart or
    // touchend: on iOS that cancels the click, and the click is what ticks the haptic switch.
    const block = (e: Event): void => e.preventDefault();
    el.addEventListener('gesturestart', block);
    el.addEventListener('contextmenu', block);
    el.addEventListener('dblclick', block);
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
  }

  private readonly down = (e: PointerEvent): void => {
    const now = performance.now();
    this.pointers.set(e.pointerId, { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: now, lastMove: now, gestured: false, parked: false });
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* not all browsers allow capture here */
    }
    this.handler.onTouch(e.clientX, e.clientY);
    const current = this.primary !== null ? this.pointers.get(this.primary) : undefined;
    if (!current || current.parked) this.primary = e.pointerId;
  };

  private readonly move = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    const dx = e.clientX - p.x0;
    const dy = e.clientY - p.y0;
    const moved = Math.hypot(dx, dy);
    p.x = e.clientX;
    p.y = e.clientY;
    if (moved > PARK_STILL_PX) p.lastMove = now;

    const current = this.primary !== null ? this.pointers.get(this.primary) : undefined;
    if (current && current.id !== p.id && moved > 8) {
      // Another finger is moving. If the primary has sat still long enough, it is a resting hand: hand over.
      const still = Math.hypot(current.x - current.x0, current.y - current.y0) <= PARK_STILL_PX;
      if (!current.gestured && still && now - current.t0 >= PARK_AFTER_MS) {
        current.parked = true;
        this.primary = p.id;
      }
    }
    if (this.primary !== p.id || p.gestured || p.parked) return;

    if (moved >= this.handler.cellSize() * 0.25) {
      p.gestured = true;
      const from = this.handler.cellAt(p.x0, p.y0);
      if (!from) return;
      const horizontal = Math.abs(dx) >= Math.abs(dy);
      const to = horizontal ? { row: from.row, col: from.col + (dx > 0 ? 1 : -1) } : { row: from.row + (dy > 0 ? 1 : -1), col: from.col };
      this.handler.onSwipe(from, to);
    }
  };

  private readonly up = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const now = performance.now();
    if (this.primary === p.id && !p.gestured && !p.parked && now - p.t0 <= TAP_MAX_MS) {
      this.handler.onTap(this.handler.cellAt(p.x, p.y), p.x, p.y);
    }
    this.release(e.pointerId);
  };

  private readonly cancel = (e: PointerEvent): void => {
    this.release(e.pointerId);
  };

  private release(id: number): void {
    this.pointers.delete(id);
    if (this.primary === id) {
      this.primary = null;
      // Promote the most recent live, unparked finger so a second finger can continue at once.
      for (const q of this.pointers.values()) if (!q.parked) this.primary = q.id;
    }
  }
}
