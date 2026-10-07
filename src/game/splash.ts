/**
 * The launch picture (DESIGN.md 2f, STYLE.md "The launch picture"): the
 * first thing she sees when the icon is tapped. A painted night sky with
 * the name, the fairy and glimmering jewels drifting down, stamped over a
 * code-drawn version of the same scene (sky, stars, the code fairy, the
 * name in plain letters) that shows for the first instant and stays if the
 * picture never loads. The light is code: slow falling glimmers in the gem
 * colours, twinkling stars, and the fade into the game. No tap is needed;
 * the timing is in splashTiming.ts.
 */
import './splash.css';
import { artUrl } from '../render/artPath';
import { rgba } from '../render/color';
import { drawCompanion } from '../render/creatures';
import { glowDisc } from '../render/styles/common';
import { createRng } from '../shared/rng';
import {
  type DoorPlacement,
  type SplashTimes,
  doorHit,
  placeDoor,
  placePicture,
  splashAlpha,
  splashDone,
  splashFadeStart,
  splashOpening,
} from './splashTiming';

/** The painting's own sky at its top edge, so the code-drawn sky above it is the same night. */
const SKY_TOP = '#0b1230';
const SKY_AT_PICTURE = '#192546';
const SKY_BOTTOM = '#0d2a2b';
const MEADOW_GLOW = '#2f7a4a';
const TITLE = '#ffd27a';
const TITLE_GLOW = '#ffb347';
const DOOR_WOOD = '#b8782e';
const DOOR_WOOD_DARK = '#7a4a16';
const DOOR_STONE = '#6d7a72';
const DOOR_LIGHT = '#ffd27a';
/** After this long without a tap, the door's window breathes brighter as the invitation. */
const INVITE_AFTER_MS = 4000;
/** The six gem glows, for the falling glimmers. */
const GLIMMER_COLORS = ['#ffd27a', '#ff8fb3', '#6fa8ff', '#5fe3a1', '#c58cff', '#ff9a6b'];

interface Star { x: number; y: number; r: number; phase: number; speed: number }
interface Glimmer { x: number; y: number; r: number; vy: number; phase: number; color: string }
interface Twinkle { x: number; y: number; t: number }

export interface SplashHooks {
  /** She tapped the fairy door: the first touch of the launch (sound may start here). */
  onEnter?(): void;
  /** A tap elsewhere on the picture made a star twinkle. */
  onTwinkle?(): void;
}

/** How long the picture takes to come up over the code-drawn scene once it has loaded. */
const PICTURE_IN_MS = 450;

export class Splash {
  private readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dpr = Math.min(3, window.devicePixelRatio || 1);
  private w = 402;
  private h = 874;
  private stars: Star[] = [];
  private glimmers: Glimmer[] = [];
  private picture: HTMLImageElement | null = null;
  private pictureAt: number | null = null;
  private door: HTMLImageElement | null = null;
  private doorAt: number | null = null;
  private twinkles: Twinkle[] = [];
  private mask: HTMLCanvasElement | null = null;
  private readonly openedAt = performance.now();
  private readonly times: SplashTimes = { openedAt: null };
  private raf = 0;
  private gone = false;
  private fading = false;

  constructor(
    private readonly reducedMotion: boolean,
    private readonly companion: 'firefly' | 'fish' | 'hero' = 'firefly',
    private readonly hooks: SplashHooks = {},
  ) {
    this.canvas.className = 'splash';
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context for the splash');
    this.ctx = ctx;
    document.body.appendChild(this.canvas);
    this.canvas.addEventListener('pointerdown', (e) => this.tapped(e.clientX, e.clientY), { passive: true });
    window.addEventListener('resize', this.resize);
    this.resize();
    this.loadPicture();
    this.raf = requestAnimationFrame(this.frame);
  }

  /** A tap: on the door it opens the game; anywhere else a star twinkles, so no tap feels dead. */
  private tapped(x: number, y: number): void {
    if (this.gone || this.fading) return;
    const t = performance.now() - this.openedAt;
    if (this.times.openedAt !== null) return;
    if (doorHit(placeDoor(this.w, this.h), x, y)) {
      this.times.openedAt = t;
      this.hooks.onEnter?.();
      return;
    }
    this.twinkles.push({ x, y, t: 0 });
    this.hooks.onTwinkle?.();
  }

  private loadPicture(): void {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth === 0 || this.gone) return;
      this.picture = img;
      this.pictureAt = performance.now() - this.openedAt;
    };
    img.src = artUrl('splash.jpg');
    const door = new Image();
    door.onload = () => {
      if (door.naturalWidth === 0 || this.gone) return;
      this.door = door;
      this.doorAt = performance.now() - this.openedAt;
    };
    door.src = artUrl('splash-door.png');
  }

  private readonly resize = (): void => {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.mask = null;
    const rng = createRng(0x5e1a5);
    this.stars = Array.from({ length: 70 }, () => ({
      x: rng.next() * this.w,
      y: rng.next() * this.h * 0.75,
      r: 0.6 + rng.next() * 1.3,
      phase: rng.next() * Math.PI * 2,
      speed: 0.5 + rng.next() * 0.9,
    }));
    this.glimmers = Array.from({ length: 16 }, (_, i) => ({
      x: rng.next() * this.w,
      y: rng.next() * this.h,
      r: 1.6 + rng.next() * 1.8,
      vy: 10 + rng.next() * 14,
      phase: rng.next() * Math.PI * 2,
      color: GLIMMER_COLORS[i % GLIMMER_COLORS.length]!,
    }));
  };

  private readonly frame = (now: number): void => {
    if (this.gone) return;
    const t = now - this.openedAt;
    const alpha = splashAlpha(t, this.times);
    const fadeStart = splashFadeStart(this.times);
    if (!this.fading && fadeStart !== null && t > fadeStart) {
      this.fading = true;
      this.canvas.classList.add('is-fading');
    }
    this.draw(t / 1000, alpha);
    if (splashDone(t, this.times)) {
      this.remove();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private remove(): void {
    this.gone = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }

  private draw(t: number, alpha: number): void {
    const { ctx, w, h } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = alpha;

    // The code-drawn scene: sky, stars, meadow glow, the fairy and the name.
    const place = this.picture ? placePicture(w, h, this.picture.naturalWidth, this.picture.naturalHeight) : null;
    const skyJoin = place && place.feather > 0 ? place.y + place.feather * 0.5 : h * 0.3;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, SKY_TOP);
    sky.addColorStop(Math.max(0.01, Math.min(0.99, skyJoin / h)), SKY_AT_PICTURE);
    sky.addColorStop(1, SKY_BOTTOM);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const motion = this.reducedMotion ? 0.35 : 1;
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.speed * motion + s.phase);
      ctx.fillStyle = rgba('#e9ecff', 0.35 + 0.5 * tw);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    const pictureIn = this.pictureAt === null ? 0 : Math.min(1, (t * 1000 - this.pictureAt) / PICTURE_IN_MS);
    if (pictureIn < 1) {
      ctx.save();
      ctx.globalAlpha = alpha * (1 - pictureIn);
      glowDisc(ctx, w * 0.5, h * 0.98, w * 0.9, MEADOW_GLOW, 0.5);
      // Where the painting puts them, so the crossfade into the picture barely moves.
      const cy = h * 0.56;
      glowDisc(ctx, w * 0.5, cy, 150, '#5fe3a1', 0.22);
      glowDisc(ctx, w * 0.5, cy, 90, '#ff8fb3', 0.18);
      drawCompanion(ctx, this.companion, w * 0.5, cy + 46, 92, t, { glow: 1.4, motion: motion * 0.6 });
      this.drawTitle(h * 0.38);
      ctx.restore();
    }

    // The painting, the body of the scene; on a tall phone its top feathers into the code sky.
    if (this.picture && place && pictureIn > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * pictureIn;
      if (place.feather > 0) {
        const mask = this.featherMask(place);
        ctx.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, w, h);
      } else {
        ctx.drawImage(this.picture, place.x, place.y, place.width, place.height);
      }
      ctx.restore();
    }

    // The fairy door on the meadow, and the light of its opening.
    this.drawDoor(t, alpha);

    // Twinkles where she tapped the picture.
    for (const tw of this.twinkles) {
      tw.t += 1 / 60;
      const k = Math.min(1, tw.t / 0.9);
      const a = Math.sin(k * Math.PI) * alpha;
      glowDisc(ctx, tw.x, tw.y, 26 + 30 * k, DOOR_LIGHT, 0.35 * a);
      ctx.fillStyle = rgba('#fff4d6', 0.9 * a);
      ctx.beginPath();
      ctx.arc(tw.x, tw.y, 2.2 * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    this.twinkles = this.twinkles.filter((tw) => tw.t < 0.9);

    // The light: glimmers drifting down through the whole scene.
    for (const g of this.glimmers) {
      if (!this.reducedMotion) {
        g.y += (g.vy / 60);
        if (g.y > h + 10) { g.y = -10; g.x = Math.random() * w; }
      }
      const tw = 0.5 + 0.5 * Math.sin(t * 1.7 * motion + g.phase);
      glowDisc(ctx, g.x, g.y, g.r * 7, g.color, 0.22 * tw * alpha);
      ctx.fillStyle = rgba(g.color, (0.55 + 0.45 * tw) * alpha);
      ctx.beginPath();
      ctx.arc(g.x, g.y, g.r * (0.7 + 0.3 * tw), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /**
   * The fairy door: the painted cut-out stamped over a code-drawn door (an
   * arch of wood in a stone frame, a lit window, the sign with her name),
   * which shows for the first instant and stays if the picture never loads.
   * The window's light and the opening's bloom are code.
   */
  private drawDoor(t: number, alpha: number): void {
    const { ctx, w, h } = this;
    const d = placeDoor(w, h, this.door?.naturalWidth, this.door?.naturalHeight);
    const ms = t * 1000;
    const opening = splashOpening(ms, this.times);
    const motion = this.reducedMotion ? 0.35 : 1;
    const inviteK = this.times.openedAt === null ? Math.min(1, Math.max(0, (ms - INVITE_AFTER_MS) / 1500)) : 0;
    const breathK = 0.5 - 0.5 * Math.cos((ms / 7500) * Math.PI * 2 * motion);
    // The light behind the door: a steady warmth, breathing as the invitation, a bloom as it opens.
    const cx = d.x + d.width / 2;
    const cy = d.y + d.height * 0.62;
    const glow = 0.16 + 0.22 * inviteK * breathK + 0.9 * opening;
    glowDisc(ctx, cx, cy, d.width * (0.75 + 1.6 * opening), DOOR_LIGHT, glow * alpha);
    const doorIn = this.doorAt === null ? 0 : Math.min(1, (ms - this.doorAt) / PICTURE_IN_MS);
    if (doorIn < 1) {
      ctx.save();
      ctx.globalAlpha = alpha * (1 - doorIn);
      this.drawCodeDoor(d);
      ctx.restore();
    }
    if (this.door && doorIn > 0) {
      ctx.save();
      ctx.globalAlpha = alpha * doorIn;
      ctx.drawImage(this.door, d.x, d.y, d.width, d.height);
      ctx.restore();
    }
    // The window's light over the picture (code is the light): a warm point at the round window.
    const wx = cx;
    const wy = d.y + d.height * 0.44;
    glowDisc(ctx, wx, wy, d.width * (0.18 + 0.1 * inviteK * breathK), DOOR_LIGHT, (0.35 + 0.35 * inviteK * breathK + 0.6 * opening) * alpha);
    if (opening > 0) {
      // The opening: the doorway floods with light and a ring runs out over the meadow.
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = rgba('#fff4d6', 0.75 * opening);
      this.archPath(d.x + d.width * 0.3, d.y + d.height * 0.26, d.width * 0.4, d.height * 0.66);
      ctx.fill();
      ctx.strokeStyle = rgba(DOOR_LIGHT, 0.55 * (1 - opening));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, d.y + d.height * 0.92, d.width * (0.5 + 1.8 * opening), d.width * (0.14 + 0.5 * opening), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private archPath(x: number, y: number, w: number, h: number): void {
    const { ctx } = this;
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x, y + r);
    ctx.arc(x + r, y + r, r, Math.PI, 0);
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
  }

  private drawCodeDoor(d: DoorPlacement): void {
    const { ctx } = this;
    const cx = d.x + d.width / 2;
    // Stone frame.
    ctx.fillStyle = DOOR_STONE;
    this.archPath(d.x + d.width * 0.14, d.y + d.height * 0.16, d.width * 0.72, d.height * 0.8);
    ctx.fill();
    // Wooden door.
    const dx = d.x + d.width * 0.26;
    const dy = d.y + d.height * 0.28;
    const dw = d.width * 0.48;
    const dh = d.height * 0.68;
    ctx.fillStyle = DOOR_WOOD;
    this.archPath(dx, dy, dw, dh);
    ctx.fill();
    ctx.strokeStyle = rgba(DOOR_WOOD_DARK, 0.6);
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) {
      const px = dx + (dw * i) / 4;
      ctx.beginPath();
      ctx.moveTo(px, dy + dh * 0.2);
      ctx.lineTo(px, dy + dh);
      ctx.stroke();
    }
    // Round window and knob.
    ctx.fillStyle = DOOR_LIGHT;
    ctx.beginPath();
    ctx.arc(cx, d.y + d.height * 0.44, dw * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e9c46a';
    ctx.beginPath();
    ctx.arc(dx + dw * 0.82, dy + dh * 0.6, dw * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // The sign.
    const sw = d.width * 0.5;
    const sh = d.height * 0.13;
    const sx = cx - sw / 2;
    const sy = d.y + d.height * 0.05;
    ctx.fillStyle = DOOR_WOOD_DARK;
    ctx.fillRect(sx, sy, sw, sh);
    ctx.fillStyle = TITLE;
    ctx.font = `700 ${Math.round(sh * 0.62)}px Georgia, "Palatino Linotype", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Harper', cx, sy + sh / 2);
  }

  /** The name in plain letters, for the instant before the painting (and if it never comes). */
  private drawTitle(y: number): void {
    const { ctx, w } = this;
    const size = Math.min(58, w * 0.14);
    ctx.save();
    ctx.font = `italic 700 ${size}px Georgia, "Palatino Linotype", "Book Antiqua", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = rgba(TITLE_GLOW, 0.9);
    ctx.shadowBlur = size * 0.6;
    ctx.fillStyle = TITLE;
    ctx.fillText('Glimmerfall', w / 2, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba('#fff4d6', 0.85);
    ctx.fillText('Glimmerfall', w / 2, y);
    ctx.restore();
  }

  /** The picture drawn at screen size with its top edge faded out, baked once per size. */
  private featherMask(place: { x: number; y: number; width: number; height: number; feather: number }): HTMLCanvasElement {
    if (this.mask && this.mask.width === this.canvas.width && this.mask.height === this.canvas.height) return this.mask;
    const m = document.createElement('canvas');
    m.width = this.canvas.width;
    m.height = this.canvas.height;
    const c = m.getContext('2d');
    if (c && this.picture) {
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.drawImage(this.picture, place.x, place.y, place.width, place.height);
      c.globalCompositeOperation = 'destination-in';
      const g = c.createLinearGradient(0, place.y, 0, place.y + place.feather);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,1)');
      c.fillStyle = g;
      c.fillRect(0, 0, this.w, this.h);
    }
    this.mask = m;
    return m;
  }
}
