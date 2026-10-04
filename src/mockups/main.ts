/** Wires the mockup page: style switcher, board, gem line-up, map, and music sketches. */
import './mockups.css';
import { AudioEngine } from '../audio/engine';
import { MusicPlayer } from '../audio/player';
import { SKETCHES } from '../audio/sketches';
import { GEM_TYPES, type GemType } from '../core/grid';
import { BoardMock, type PowerKind } from '../render/board';
import { COMPANION_NAMES, type CompanionId } from '../render/creatures';
import { MapMock } from '../render/map';
import { GemSprites } from '../render/sprites';
import { STYLES, styleById, type GemStyle } from '../render/styles';

const CALM_TYPES: readonly GemType[] = ['star', 'heart', 'drop', 'leaf', 'diamond'];
const BOARD_SEED = 20261004;

function $<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
}

const engine = new AudioEngine();
const player = new MusicPlayer(engine);

const initialId = new URLSearchParams(location.search).get('look') ?? 'night';
let style: GemStyle = styleById(initialId);
let companion: CompanionId = 'firefly';

const boardCanvas = $<HTMLCanvasElement>('#board');
const lineupCanvas = $<HTMLCanvasElement>('#lineup');
const mapCanvas = $<HTMLCanvasElement>('#map');
const dpr = Math.min(3, window.devicePixelRatio || 1);
const lineupSprites = new GemSprites(style, dpr);

function chime(kind: PowerKind): void {
  const ctx = engine.context;
  if (!ctx || !engine.isRunning) return;
  const t = ctx.currentTime;
  const tones = player.chordNow(7, 17);
  switch (kind) {
    case 'comet':
      engine.arpeggio(tones.slice(0, 6), t + 0.38, 0.5, 0.07);
      break;
    case 'orb': {
      engine.arpeggio(tones.slice(0, 9), t + 0.52, 0.5, 0.06);
      const swell = engine.pad(player.chordNow(3, 8).slice(0, 3), t + 0.5, 0.1);
      swell?.release(t + 2.6, 2.5);
      break;
    }
    case 'bloom':
      engine.arpeggio(tones.slice(0, 5), t + 0.42, 0.45, 0.09, 'marimba');
      break;
  }
}

const board = new BoardMock(boardCanvas, style, {
  cols: 6,
  rows: 7,
  types: CALM_TYPES,
  seed: BOARD_SEED,
  companion,
  onPower: (kind, viaTap) => {
    if (viaTap) void engine.unlock().then(() => chime(kind));
    else if (player.current) chime(kind);
  },
});

const map = new MapMock(mapCanvas, style, {
  companion,
  seed: 11,
  onPickCompanion: (id) => {
    companion = id;
    board.setCompanion(id);
    $('#companionName').textContent = COMPANION_NAMES[id];
  },
});

function drawLineup(): void {
  const ctx = lineupCanvas.getContext('2d');
  if (!ctx) return;
  const parentWidth = lineupCanvas.parentElement?.clientWidth ?? 390;
  const w = Math.max(280, Math.min(430, Math.floor(parentWidth)));
  const cell = (w - 32) / 6;
  const h = Math.round(cell + 24);
  lineupCanvas.style.width = `${w}px`;
  lineupCanvas.style.height = `${h}px`;
  lineupCanvas.width = Math.round(w * dpr);
  lineupCanvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  style.drawBackground(ctx, w, h, 0, style.createAmbient(w, h, 3));
  GEM_TYPES.forEach((type, i) => {
    const x = 16 + i * cell;
    style.drawCell(ctx, x, 12, cell);
    lineupSprites.draw(ctx, type, x + cell / 2, 12 + cell / 2, cell * 0.41);
  });
}

function applyStyle(next: GemStyle): void {
  style = next;
  board.setStyle(next);
  map.setStyle(next);
  lineupSprites.setStyle(next);
  drawLineup();
  $('#styleName').textContent = next.name;
  $('#styleTag').textContent = next.tagline;
  $('#styleDesc').textContent = next.description;
  document.documentElement.style.setProperty('--accent', next.palette.lantern);
  document.documentElement.style.setProperty('--bg', next.palette.bgBottom);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next.palette.bgBottom);
  document.querySelectorAll<HTMLButtonElement>('#styleSeg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === next.id)));
  const url = new URL(location.href);
  url.searchParams.set('look', next.id);
  history.replaceState(null, '', url);
}

const seg = $('#styleSeg');
for (const s of STYLES) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = s.name;
  b.dataset.style = s.id;
  b.addEventListener('click', () => applyStyle(s));
  seg.appendChild(b);
}

document.querySelectorAll<HTMLButtonElement>('#powers button').forEach((b) => {
  b.addEventListener('click', () => {
    const kind = b.dataset.power as PowerKind;
    board.fire(kind, undefined, true);
  });
});

// Music cards
const cards = $('#musicCards');
const listenButtons = new Map<string, HTMLButtonElement>();
const windSwitches = new Map<string, HTMLInputElement>();
SKETCHES.forEach((sketch, i) => {
  const card = document.createElement('div');
  card.className = 'card';
  const h = document.createElement('h3');
  h.textContent = sketch.name;
  const p = document.createElement('p');
  p.textContent = sketch.blurb;
  const row = document.createElement('div');
  row.className = 'row';
  const listen = document.createElement('button');
  listen.type = 'button';
  listen.className = 'listen';
  listen.textContent = 'Listen';
  listen.setAttribute('aria-pressed', 'false');
  const label = document.createElement('label');
  label.className = 'switch';
  const input = document.createElement('input');
  input.type = 'checkbox';
  label.appendChild(input);
  label.appendChild(document.createTextNode('Wind-down'));
  row.appendChild(listen);
  row.appendChild(label);
  card.appendChild(h);
  card.appendChild(p);
  card.appendChild(row);
  cards.appendChild(card);
  listenButtons.set(sketch.id, listen);
  windSwitches.set(sketch.id, input);
  listen.addEventListener('click', () => {
    if (player.current?.id === sketch.id) {
      player.stop(1.2);
    } else {
      void player.start(sketch, 1000 + i, input.checked);
    }
  });
  input.addEventListener('change', () => {
    if (player.current?.id === sketch.id) player.setWindDown(input.checked);
  });
});

player.onChange(() => {
  for (const [id, b] of listenButtons) {
    const active = player.current?.id === id;
    b.setAttribute('aria-pressed', String(active));
    b.textContent = active ? 'Stop' : 'Listen';
  }
});

// Lifecycle
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    player.stop(0.4);
    engine.suspend();
    board.stop();
    map.stop();
  } else {
    engine.resume();
    board.start();
    map.start();
  }
});
document.addEventListener('pointerdown', () => engine.resume(), { passive: true });

const observer = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (e.target === boardCanvas) e.isIntersecting ? board.start() : board.stop();
      if (e.target === mapCanvas) e.isIntersecting ? map.start() : map.stop();
    }
  },
  { threshold: 0.05 },
);
observer.observe(boardCanvas);
observer.observe(mapCanvas);

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    board.resize();
    map.resize();
    drawLineup();
  }, 120);
});

$('#companionName').textContent = COMPANION_NAMES[companion];
$('#buildDate').textContent = __BUILD_DATE__;
applyStyle(style);
board.start();
map.start();
