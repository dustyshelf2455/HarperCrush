/**
 * The map companions (firefly, glow fish, little caped hero) and the lantern.
 * All drawn from primitives, round and soft and lit from within, with a face
 * that reads at 40 px: big eyes with highlights and a tiny smile. Each has an
 * idle motion (bob, wing flutter, tail flick, cape wave), blinks now and
 * then, and has a hop pose (stretch going up, squash on landing) and a sleep
 * pose (eyes closed, slower glow) for the map and the resting scene
 * (DESIGN.md 3.5, 3.8, 2b). Deliberately unlike any character she knows.
 */
import { rgba } from './color';
import { shapePath } from './shapes';
import { breath, glowDisc, highlight, roundRect } from './styles/common';
import type { Palette } from './styles/types';

export type CompanionId = 'firefly' | 'fish' | 'hero';
export const COMPANIONS: readonly CompanionId[] = ['firefly', 'fish', 'hero'];
export const COMPANION_NAMES: Record<CompanionId, string> = {
  firefly: 'Firefly',
  fish: 'Glow fish',
  hero: 'Little hero',
};

export interface CompanionOpts {
  /** Sleeping pose: eyes closed, curled a little, glow at the breathing rhythm. */
  sleep?: boolean;
  /** Extra glow strength multiplier. */
  glow?: number;
  /**
   * How far the eyes are closed, 0 open to 1 shut. Left out, the creature
   * blinks on its own every few seconds. Sleep closes them regardless.
   */
  blink?: number;
  /** Vertical stretch about the feet: above 1 stretches (going up), below 1 squashes (landing). */
  squash?: number;
  /** Lean, in radians; a hop leans into its direction. */
  tilt?: number;
  /** 1 faces right (the default), -1 faces left. */
  facing?: 1 | -1;
  /** 0..1: a friend waving as she passes (arm, fin or wing raised). */
  wave?: number;
  /** Scales the idle motion (bob, flutter, flick, cape wave); 0 is perfectly still. */
  motion?: number;
}

/** The pulse of a creature's glow: a gentle 4 s swell awake, the breathing curve asleep (DESIGN.md 3.8). */
function glowPulse(t: number, sleep: boolean): number {
  return sleep ? 0.6 + 0.3 * breath(t) : 0.86 + 0.14 * Math.sin(t * 1.5);
}

/** An automatic blink: a 160 ms close every 4.3 s, offset per creature so friends never blink together. */
function autoBlink(t: number, offset: number): number {
  const phase = ((t + offset) % 4.3 + 4.3) % 4.3;
  return phase < 0.16 ? Math.sin((phase / 0.16) * Math.PI) : 0;
}

const BLINK_OFFSET: Record<CompanionId, number> = { firefly: 0, fish: 1.7, hero: 2.9 };

/**
 * A painted companion (art round two): the picture stands on the same feet
 * point as the code-drawn creature and takes the same squash, tilt, facing
 * and sleep cues, so hops and landings feel the same. Its glow is drawn in
 * code so it can breathe.
 */
export function drawPaintedCompanion(ctx: CanvasRenderingContext2D, picture: HTMLImageElement, x: number, y: number, s: number, t: number, opts: CompanionOpts = {}): void {
  const sleep = opts.sleep ?? false;
  const glow = (opts.glow ?? 1) * glowPulse(t, sleep);
  const squash = sleep ? Math.min(opts.squash ?? 0.92, 0.92) : (opts.squash ?? 1);
  const feet = s * 0.46;
  const dh = s * 1.55;
  const dw = dh * (picture.naturalWidth / picture.naturalHeight);
  ctx.save();
  ctx.translate(x, y + feet);
  ctx.rotate((opts.tilt ?? 0) + (sleep ? 0.12 : 0));
  ctx.scale((opts.facing ?? 1) / Math.sqrt(squash), squash);
  ctx.translate(0, -feet);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glowDisc(ctx, 0, s * 0.25, s * 1.1, '#ffd27a', 0.22 * glow);
  ctx.restore();
  ctx.drawImage(picture, -dw / 2, feet - dh, dw, dh);
  ctx.restore();
}

export function drawCompanion(ctx: CanvasRenderingContext2D, id: CompanionId, x: number, y: number, s: number, t: number, opts: CompanionOpts = {}): void {
  const sleep = opts.sleep ?? false;
  const motion = opts.motion ?? 1;
  const glow = (opts.glow ?? 1) * glowPulse(t, sleep);
  const blink = sleep ? 1 : Math.max(opts.blink ?? 0, opts.blink === undefined ? autoBlink(t, BLINK_OFFSET[id]) : 0);
  const squash = sleep ? Math.min(opts.squash ?? 0.92, 0.92) : (opts.squash ?? 1);
  const pose: Pose = { sleep, glow, blink, motion: sleep ? motion * 0.3 : motion, wave: sleep ? 0 : (opts.wave ?? 0) };

  ctx.save();
  // Stretch and squash about the feet, so a landing presses into the lantern rather than sinking through it.
  const feet = s * 0.46;
  ctx.translate(x, y + feet);
  ctx.rotate(opts.tilt ?? 0);
  ctx.scale((opts.facing ?? 1) / Math.sqrt(squash), squash);
  ctx.translate(0, -feet);
  switch (id) {
    case 'firefly':
      drawFirefly(ctx, s, t, pose);
      break;
    case 'fish':
      drawFish(ctx, s, t, pose);
      break;
    case 'hero':
      drawHero(ctx, s, t, pose);
      break;
  }
  ctx.restore();
}

interface Pose {
  sleep: boolean;
  glow: number;
  blink: number;
  motion: number;
  wave: number;
}

interface FaceStyle {
  /** Eye white; left out for a dark eye straight on the face. */
  white?: string;
  pupil: string;
  mouth: string;
  cheek?: string;
}

/**
 * Two big eyes with highlights, a small smile and soft cheeks. `blink` scales
 * the eyes shut; asleep, the eyes are soft downward arcs (content, not shut tight).
 */
function face(ctx: CanvasRenderingContext2D, x: number, y: number, dx: number, r: number, pose: Pose, style: FaceStyle, smileW = r * 1.1, smileY = r * 1.9): void {
  ctx.save();
  ctx.lineCap = 'round';
  if (style.cheek) {
    glowDisc(ctx, x - dx - r * 0.3, y + r * 1.4, r * 1.3, style.cheek, 0.35);
    glowDisc(ctx, x + dx + r * 0.3, y + r * 1.4, r * 1.3, style.cheek, 0.35);
  }
  const open = pose.sleep ? 0 : 1 - pose.blink;
  for (const side of [-1, 1]) {
    const ex = x + side * dx;
    if (open < 0.12) {
      // Closed: a gentle arc, the lid line resting low.
      ctx.strokeStyle = style.pupil;
      ctx.lineWidth = r * 0.42;
      ctx.beginPath();
      ctx.moveTo(ex - r * 0.95, y + r * 0.1);
      ctx.quadraticCurveTo(ex, y + r * 0.95, ex + r * 0.95, y + r * 0.1);
      ctx.stroke();
      continue;
    }
    ctx.save();
    ctx.translate(ex, y);
    ctx.scale(1, open);
    if (style.white) {
      ctx.fillStyle = style.white;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.05, r * 1.15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = style.pupil;
    ctx.beginPath();
    ctx.ellipse(side * r * 0.08, r * 0.1, r * 0.78, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    // Two highlights: a big one up and to the left, a pinprick down and right.
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.26, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(r * 0.3, r * 0.3, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = style.mouth;
  ctx.lineWidth = r * 0.3;
  ctx.beginPath();
  ctx.moveTo(x - smileW / 2, y + smileY - smileW * 0.12);
  ctx.quadraticCurveTo(x, y + smileY + smileW * 0.45, x + smileW / 2, y + smileY - smileW * 0.12);
  ctx.stroke();
  ctx.restore();
}

// --------------------------------------------------------------- firefly

function drawFirefly(ctx: CanvasRenderingContext2D, s: number, t: number, pose: Pose): void {
  const { sleep, glow, motion } = pose;
  const bob = Math.sin(t * 1.6) * s * 0.02 * motion;
  ctx.save();
  ctx.translate(0, bob);
  glowDisc(ctx, 0, s * 0.2, s * 1.05, '#ffd27a', 0.42 * glow);

  // Wings (the art pass): two lobes each, like a fairy's, translucent with a cool-to-warm sheen,
  // fine veins and a glint, fluttering softly; folded when asleep.
  const flutter = sleep ? 0 : Math.sin(t * 7.5) * 0.12 * motion;
  const spread = sleep ? 0.35 : 0.95 + pose.wave * 0.25;
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s * 0.1, -s * 0.06);
    ctx.rotate(side * (spread + flutter));
    const sheen = ctx.createLinearGradient(0, -s * 0.55, 0, s * 0.1);
    sheen.addColorStop(0, 'rgba(214,236,255,0.5)');
    sheen.addColorStop(0.6, 'rgba(190,226,255,0.36)');
    sheen.addColorStop(1, 'rgba(255,214,170,0.3)');
    for (const [cx, cy, rx, ry, rot] of [[0, -s * 0.24, s * 0.17, s * 0.34, 0], [side * s * 0.1, s * 0.02, s * 0.11, s * 0.19, side * 0.5]] as const) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
      ctx.fillStyle = sheen;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = s * 0.025;
      ctx.stroke();
    }
    // Veins: three fine lines fanning from the wing root.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(0.6, s * 0.012);
    for (const k of [-0.35, 0, 0.35]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(k * s * 0.1, -s * 0.3, k * s * 0.14, -s * 0.54);
      ctx.stroke();
    }
    // A glint near the tip.
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(-s * 0.05, -s * 0.42, s * 0.025, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // The glowing belly: a round lantern of a body, with three tiny sparks of light drifting around it.
  glowDisc(ctx, 0, s * 0.2, s * 0.5, '#ffe28a', 0.85 * glow);
  if (!sleep) {
    for (let k = 0; k < 3; k++) {
      const a = t * 0.7 + (k * Math.PI * 2) / 3;
      const sx = Math.cos(a) * s * 0.42;
      const sy = s * 0.2 + Math.sin(a) * s * 0.24;
      const twinkle = 0.5 + 0.5 * Math.sin(t * 2.1 + k * 1.3);
      glowDisc(ctx, sx, sy, s * 0.06, '#fff3c4', 0.6 * twinkle * glow);
      ctx.fillStyle = `rgba(255,250,230,${(0.9 * twinkle).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, s * 0.016, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const belly = ctx.createRadialGradient(-s * 0.06, s * 0.1, s * 0.02, 0, s * 0.2, s * 0.3);
  belly.addColorStop(0, '#fff6cf');
  belly.addColorStop(0.55, '#ffd76a');
  belly.addColorStop(1, '#e8a438');
  ctx.fillStyle = belly;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.2, s * 0.25, s * 0.27, 0, 0, Math.PI * 2);
  ctx.fill();
  // Two soft bands on the belly.
  ctx.strokeStyle = 'rgba(214,140,50,0.35)';
  ctx.lineWidth = s * 0.02;
  for (const yy of [0.2, 0.3]) {
    ctx.beginPath();
    ctx.ellipse(0, s * yy, s * 0.24 * (1 - (yy - 0.2) * 1.4), s * 0.05, 0, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }
  // Tiny feet tucked under.
  ctx.fillStyle = '#2b5a70';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * s * 0.11, s * 0.45, s * 0.06, s * 0.035, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Head: big and round, deep teal, with a lighter face.
  const headY = -s * 0.2;
  const head = ctx.createRadialGradient(-s * 0.08, headY - s * 0.1, s * 0.02, 0, headY, s * 0.3);
  head.addColorStop(0, '#4b8ea8');
  head.addColorStop(0.7, '#2b5f78');
  head.addColorStop(1, '#1d4458');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(0, headY, s * 0.27, 0, Math.PI * 2);
  ctx.fill();
  // A warm rim of light along the underside of the head, thrown up by the belly.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, headY, s * 0.27, 0, Math.PI * 2);
  ctx.clip();
  const rim = ctx.createRadialGradient(0, headY + s * 0.3, s * 0.05, 0, headY + s * 0.3, s * 0.42);
  rim.addColorStop(0, 'rgba(255,220,140,0.45)');
  rim.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = rim;
  ctx.fillRect(-s * 0.3, headY - s * 0.3, s * 0.6, s * 0.6);
  ctx.restore();
  // Antennae with glowing tips, drooping a little when asleep.
  const droop = sleep ? s * 0.08 : 0;
  ctx.strokeStyle = '#2b5f78';
  ctx.lineWidth = s * 0.03;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const sway = Math.sin(t * 1.1 + side) * s * 0.015 * motion;
    const tipX = side * s * 0.24 + sway;
    const tipY = headY - s * 0.46 + droop;
    ctx.beginPath();
    ctx.moveTo(side * s * 0.09, headY - s * 0.24);
    ctx.quadraticCurveTo(side * s * 0.14, headY - s * 0.46 + droop * 0.5, tipX, tipY);
    ctx.stroke();
    glowDisc(ctx, tipX, tipY, s * 0.1, '#ffe9a8', 0.6 * glow);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(tipX, tipY, s * 0.03, 0, Math.PI * 2);
    ctx.fill();
  }
  face(ctx, 0, headY - s * 0.02, s * 0.1, s * 0.07, pose, { white: '#f6fbff', pupil: '#1c1a34', mouth: '#143244', cheek: '#ff9fb4' }, s * 0.1, s * 0.15);
  highlight(ctx, -s * 0.1, headY - s * 0.17, s * 0.09, s * 0.05, -0.6, 0.45);
  ctx.restore();
}

// ------------------------------------------------------------------ fish

function drawFish(ctx: CanvasRenderingContext2D, s: number, t: number, pose: Pose): void {
  const { sleep, glow, motion } = pose;
  const bob = Math.sin(t * 1.3) * s * 0.025 * motion;
  ctx.save();
  ctx.translate(0, bob + s * 0.08);
  glowDisc(ctx, 0, 0, s * 0.95, '#6fe7ff', 0.4 * glow);

  // Tail: a translucent fan that flicks slowly.
  const flick = Math.sin(t * 2.2) * 0.22 * motion;
  ctx.save();
  ctx.translate(-s * 0.36, 0);
  ctx.rotate(flick);
  ctx.fillStyle = 'rgba(140,230,250,0.75)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-s * 0.16, -s * 0.26, -s * 0.3, -s * 0.24);
  ctx.quadraticCurveTo(-s * 0.2, 0, -s * 0.3, s * 0.24);
  ctx.quadraticCurveTo(-s * 0.16, s * 0.26, 0, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = s * 0.02;
  ctx.stroke();
  ctx.restore();

  // Dorsal fin and a small belly fin that waves (and lifts to wave hello).
  ctx.fillStyle = 'rgba(140,230,250,0.85)';
  ctx.beginPath();
  ctx.moveTo(-s * 0.16, -s * 0.24);
  ctx.quadraticCurveTo(-s * 0.02, -s * 0.46, s * 0.12, -s * 0.26);
  ctx.closePath();
  ctx.fill();

  // Body: a plump egg, teal above, glowing pale belly below.
  const body = ctx.createRadialGradient(s * 0.02, s * 0.12, s * 0.02, 0, 0, s * 0.46);
  body.addColorStop(0, '#d8fbff');
  body.addColorStop(0.45, '#6fd8f2');
  body.addColorStop(1, '#2a8fb5');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.42, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.42, s * 0.32, 0, 0, Math.PI * 2);
  ctx.clip();
  glowDisc(ctx, s * 0.04, s * 0.16, s * 0.34, '#eafdff', 0.55 * glow);
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,245,255,0.6)';
  ctx.lineWidth = s * 0.02;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.42, s * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Side fin, waving.
  const fin = Math.sin(t * 2.6 + 1) * 0.2 * motion - pose.wave * 0.9;
  ctx.save();
  ctx.translate(s * 0.02, s * 0.12);
  ctx.rotate(0.5 + fin);
  ctx.fillStyle = 'rgba(160,235,250,0.8)';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.07, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bioluminescent spots along the back, each on its own slow pulse.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + 0.5 * Math.sin(t * 0.9 + i * 2.1);
    const px = -s * 0.22 + i * s * 0.14;
    const py = -s * 0.14 + Math.abs(i - 1) * s * 0.03;
    glowDisc(ctx, px, py, s * 0.08, '#bff6ff', (0.3 + 0.4 * a) * glow);
    ctx.fillStyle = `rgba(230,252,255,${0.5 + 0.4 * a})`;
    ctx.beginPath();
    ctx.arc(px, py, s * 0.022, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // Face: one big eye (side view), a smile at the nose, a soft cheek.
  face(ctx, s * 0.2, -s * 0.05, 0, s * 0.085, pose, { white: '#f6fdff', pupil: '#1c1a34', mouth: '#1a6a86', cheek: '#ff9fb4' }, s * 0.1, s * 0.19);
  highlight(ctx, -s * 0.12, -s * 0.18, s * 0.14, s * 0.06, -0.3, 0.4);

  if (!sleep) {
    // A bubble or two drifting up from the mouth.
    for (let i = 0; i < 2; i++) {
      const p = ((t * 0.3 + i * 0.5) % 1 + 1) % 1;
      const bx = s * 0.42 + Math.sin(p * 6 + i) * s * 0.04;
      const by = -s * 0.1 - p * s * 0.6;
      ctx.strokeStyle = `rgba(220,250,255,${(1 - p) * 0.6})`;
      ctx.lineWidth = s * 0.02;
      ctx.beginPath();
      ctx.arc(bx, by, s * (0.025 + 0.03 * i), 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ------------------------------------------------------------------ hero

function drawHero(ctx: CanvasRenderingContext2D, s: number, t: number, pose: Pose): void {
  const { glow, motion } = pose;
  const bob = Math.sin(t * 1.4) * s * 0.015 * motion;
  ctx.save();
  ctx.translate(0, bob);
  glowDisc(ctx, 0, 0, s * 0.95, '#b48bff', 0.4 * glow);

  // Cape: a soft curtain behind, waving slowly from the hem; drawn with the hood colours.
  const wave = Math.sin(t * 1.8) * s * 0.05 * motion;
  const cape = ctx.createLinearGradient(0, -s * 0.25, 0, s * 0.5);
  cape.addColorStop(0, '#7b55ff');
  cape.addColorStop(1, '#ff7cb8');
  ctx.fillStyle = cape;
  ctx.beginPath();
  ctx.moveTo(-s * 0.19, -s * 0.2);
  ctx.lineTo(s * 0.19, -s * 0.2);
  ctx.quadraticCurveTo(s * 0.4 + wave, s * 0.15, s * 0.34 - wave, s * 0.46);
  ctx.quadraticCurveTo(s * 0.12, s * 0.38 + wave * 0.5, 0, s * 0.44);
  ctx.quadraticCurveTo(-s * 0.12, s * 0.38 - wave * 0.5, -s * 0.34 + wave, s * 0.46);
  ctx.quadraticCurveTo(-s * 0.4 - wave, s * 0.15, -s * 0.19, -s * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,245,0.3)';
  ctx.lineWidth = s * 0.015;
  ctx.stroke();

  // Body: a round little tunic.
  const body = ctx.createLinearGradient(0, -s * 0.15, 0, s * 0.4);
  body.addColorStop(0, '#8e9bff');
  body.addColorStop(1, '#4a58dd');
  ctx.fillStyle = body;
  roundRect(ctx, -s * 0.2, -s * 0.14, s * 0.4, s * 0.5, s * 0.17);
  ctx.fill();
  // Belt.
  ctx.fillStyle = '#ffd86b';
  roundRect(ctx, -s * 0.19, s * 0.2, s * 0.38, s * 0.05, s * 0.02);
  ctx.fill();
  // Arms: little rounded stubs; the right one lifts to wave.
  ctx.fillStyle = '#6672ea';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * s * 0.2, -s * 0.03);
    const lift = side > 0 ? pose.wave * (2.2 + Math.sin(t * 4) * 0.25 * motion) : 0;
    ctx.rotate(side * 0.25 - lift);
    roundRect(ctx, -s * 0.05, -s * 0.03, s * 0.1, s * 0.22, s * 0.05);
    ctx.fill();
    // Mitten
    ctx.fillStyle = '#ffe3cf';
    ctx.beginPath();
    ctx.arc(0, s * 0.2, s * 0.055, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6672ea';
    ctx.restore();
  }
  // Boots.
  ctx.fillStyle = '#3c3f9a';
  for (const side of [-1, 1]) {
    roundRect(ctx, side * s * 0.11 - s * 0.075, s * 0.32, s * 0.15, s * 0.12, s * 0.06);
    ctx.fill();
  }
  // Star emblem, glowing.
  glowDisc(ctx, 0, s * 0.05, s * 0.18, '#ffd86b', 0.55 * glow);
  ctx.save();
  ctx.translate(0, s * 0.05);
  ctx.fillStyle = '#ffe28a';
  ctx.fill(shapePath('star', s * 0.085));
  ctx.restore();

  // Head: big and round, peach, with a hood in the cape colours and a soft tuft of hair.
  const headY = -s * 0.36;
  ctx.fillStyle = '#ffe3cf';
  ctx.beginPath();
  ctx.arc(0, headY, s * 0.24, 0, Math.PI * 2);
  ctx.fill();
  const hood = ctx.createLinearGradient(-s * 0.25, headY - s * 0.25, s * 0.25, headY);
  hood.addColorStop(0, '#6a44f0');
  hood.addColorStop(1, '#9a6cff');
  ctx.fillStyle = hood;
  ctx.beginPath();
  ctx.arc(0, headY, s * 0.265, Math.PI * 1.0, Math.PI * 2.0);
  ctx.quadraticCurveTo(s * 0.2, headY + s * 0.02, 0, headY - s * 0.06);
  ctx.quadraticCurveTo(-s * 0.2, headY + s * 0.02, -s * 0.265, headY);
  ctx.closePath();
  ctx.fill();
  // A little curl of hair peeking out.
  ctx.strokeStyle = '#ffc58a';
  ctx.lineWidth = s * 0.03;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.06, headY - s * 0.1);
  ctx.quadraticCurveTo(-s * 0.02, headY - s * 0.2, s * 0.06, headY - s * 0.14);
  ctx.stroke();
  face(ctx, 0, headY + s * 0.02, s * 0.09, s * 0.065, pose, { pupil: '#2a1e3c', mouth: '#b86a7a', cheek: '#ff9fb4' }, s * 0.1, s * 0.15);
  highlight(ctx, -s * 0.09, headY - s * 0.02, s * 0.07, s * 0.035, -0.5, 0.35);
  ctx.restore();
}

// --------------------------------------------------------------- lantern

export interface LanternOpts {
  /** Draw the hanging ring above the cap (the HUD lantern hangs; a post lantern sits). */
  ring?: boolean;
  /** Tint of the glass when unlit, so a lantern ahead reads as waiting, never greyed out. */
  coolTint?: string;
}

/**
 * A lantern with a rounded glass. `lit` is 0..1: how much light fills the
 * glass, which is also the Calm-mode goal indicator. Centre of the glass at (x, y).
 */
export function drawLantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, lit: number, palette: Palette, t: number, opts: LanternOpts = {}): void {
  const w = s * 0.6;
  const h = s * 0.74;
  const top = y - h / 2;
  const glassTop = top + s * 0.08;
  const glassH = h - s * 0.08;
  const metal = '#4a4160';
  const metalDark = '#352e48';
  ctx.save();
  if (lit > 0.02) glowDisc(ctx, x, y, s * 1.35, palette.lanternGlow, lit * (0.4 + 0.1 * breath(t)));
  if (opts.ring ?? true) {
    ctx.strokeStyle = metal;
    ctx.lineWidth = s * 0.045;
    ctx.beginPath();
    ctx.arc(x, top - s * 0.15, s * 0.065, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Cap: a small dome with a rim.
  ctx.fillStyle = metalDark;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.56, top + s * 0.1);
  ctx.quadraticCurveTo(x - w * 0.5, top - s * 0.04, x, top - s * 0.08);
  ctx.quadraticCurveTo(x + w * 0.5, top - s * 0.04, x + w * 0.56, top + s * 0.1);
  ctx.closePath();
  ctx.fill();
  // Glass.
  roundRect(ctx, x - w / 2, glassTop, w, glassH, s * 0.13);
  ctx.fillStyle = opts.coolTint ? rgba(opts.coolTint, 0.1) : 'rgba(255,255,255,0.07)';
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (lit > 0) {
    const fillH = glassH * Math.min(1, lit);
    const fy = glassTop + glassH - fillH;
    const g = ctx.createLinearGradient(0, fy, 0, glassTop + glassH);
    g.addColorStop(0, rgba(palette.lantern, 0.5));
    g.addColorStop(1, rgba(palette.lanternGlow, 0.95));
    ctx.fillStyle = g;
    ctx.fillRect(x - w / 2, fy, w, fillH);
    // The flame's core: a bright, soft heart near the bottom of the light.
    glowDisc(ctx, x, fy + fillH * 0.6, w * 0.65, '#fff6dc', 0.75 * lit);
    ctx.fillStyle = rgba('#fffaf0', 0.8 * lit);
    ctx.beginPath();
    ctx.ellipse(x, fy + fillH * 0.68, w * 0.12, w * 0.17, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Glass sheen.
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(x - w * 0.42, glassTop + s * 0.04, w * 0.14, glassH - s * 0.08);
  ctx.restore();
  // Frame and centre bar.
  roundRect(ctx, x - w / 2, glassTop, w, glassH, s * 0.13);
  ctx.strokeStyle = metal;
  ctx.lineWidth = s * 0.04;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, glassTop);
  ctx.lineTo(x, glassTop + glassH);
  ctx.strokeStyle = rgba(metal, 0.55);
  ctx.lineWidth = s * 0.025;
  ctx.stroke();
  // Base.
  ctx.fillStyle = metalDark;
  roundRect(ctx, x - w * 0.42, glassTop + glassH - s * 0.02, w * 0.84, s * 0.07, s * 0.03);
  ctx.fill();
  ctx.restore();
}
