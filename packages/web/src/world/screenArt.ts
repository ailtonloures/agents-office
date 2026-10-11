import type { Activity } from '../characters/characterMachine';

/**
 * Pure pixel art of the monitors (no Phaser): what a screen shows for each activity, frame by
 * frame. `drawScreen` emits filled rectangles in screen-local pixels, so it can be tested and
 * drawn by any backend (a Phaser Graphics in the game).
 */

export const SCREEN_MODES = [
  'off',
  'code',
  'terminal',
  'read',
  'web',
  'summon',
  'think',
  'wait',
  'error',
  'sleep',
  'dashboard',
] as const;
export type ScreenMode = (typeof SCREEN_MODES)[number];

/** Frames per second of the screen animations. */
export const SCREEN_FPS = 6;

export const SCREEN_COLORS = {
  bg: 0x14233b,
  bar: 0x22385c,
  gutter: 0x1b2d4a,
  glare: 0x2c4468,
  cyan: 0x57d3c2,
  blue: 0x5aa2ff,
  violet: 0xa98bff,
  yellow: 0xf2c94c,
  coral: 0xff8a6b,
  green: 0x6fd38a,
  white: 0xeef1f8,
  paper: 0xe9edf5,
  ink: 0x8d97ad,
  inkDark: 0x4a5368,
  term: 0x0b1018,
  termText: 0x9fb0c8,
  /** The orange of Claude's spinner. */
  claude: 0xd97757,
  amber: 0xf2b84b,
  red: 0xe0584f,
  redDark: 0x3a1418,
  off: 0x0f1626,
  offGlare: 0x1f2c45,
} as const;

/** Glow color cast on the desk by each mode (`undefined`: no glow). */
export const SCREEN_GLOW: Record<ScreenMode, number | undefined> = {
  off: undefined,
  code: 0x78c8ff,
  terminal: 0x6fd38a,
  read: 0xdfe8ff,
  web: 0xdfe8ff,
  summon: 0xf2c94c,
  think: 0xd97757,
  wait: 0xf2b84b,
  error: 0xe0584f,
  sleep: 0x3a4a78,
  dashboard: 0x78c8ff,
};

/** The monitor content of a seated character's activity. */
export function screenModeFor(activity: Activity): ScreenMode {
  switch (activity) {
    case 'typing':
      return 'code';
    case 'reading':
      return 'read';
    case 'terminal':
      return 'terminal';
    case 'web':
      return 'web';
    case 'summoning':
      return 'summon';
    case 'thinking':
      return 'think';
    case 'waiting':
      return 'wait';
    case 'error':
      return 'error';
    case 'sleeping':
      return 'sleep';
  }
}

export type PutRect = (x: number, y: number, w: number, h: number, color: number) => void;

/** Small integer hash: the same (a, b, c) always gives the same pseudo-random number. */
export function screenNoise(a: number, b: number, c = 0): number {
  let h =
    (Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791)) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995) >>> 0;
  return (h ^ (h >>> 15)) >>> 0;
}

const TOKEN_COLORS = [
  SCREEN_COLORS.cyan,
  SCREEN_COLORS.violet,
  SCREEN_COLORS.yellow,
  SCREEN_COLORS.blue,
  SCREEN_COLORS.green,
  SCREEN_COLORS.coral,
] as const;

/** One line of fake source code: up to three coloured tokens after an indent. */
function codeLine(
  put: PutRect,
  x: number,
  y: number,
  w: number,
  seed: number,
  line: number,
  reveal = Number.POSITIVE_INFINITY,
): number {
  const n = screenNoise(seed, line, 3);
  if (n % 7 === 0) return 0; // blank line
  let cx = x + ((n >>> 4) % 3);
  let drawn = 0;
  const tokens = 1 + ((n >>> 8) % 3);
  for (let t = 0; t < tokens && cx < x + w; t += 1) {
    const len = 1 + (screenNoise(seed, line, t + 11) % 4);
    const room = Math.min(len, x + w - cx, reveal - drawn);
    if (room <= 0) break;
    put(cx, y, room, 1, TOKEN_COLORS[(n >>> (t * 3)) % TOKEN_COLORS.length] as number);
    drawn += room;
    cx += len + 1;
  }
  return cx;
}

/** Title bar with the three window dots. */
function titleBar(put: PutRect, w: number, color: number = SCREEN_COLORS.bar): void {
  put(0, 0, w, 1, color);
  if (w >= 6) {
    put(1, 0, 1, 1, SCREEN_COLORS.coral);
    put(2, 0, 1, 1, SCREEN_COLORS.yellow);
    put(3, 0, 1, 1, SCREEN_COLORS.green);
  }
}

/**
 * Draws one frame of `mode` on a `w`x`h` screen, as rectangles inside (0, 0, w, h). `seed` makes
 * neighbouring screens differ; `frame` advances at {@link SCREEN_FPS}.
 */
export function drawScreen(
  emit: PutRect,
  mode: ScreenMode,
  w: number,
  h: number,
  frame: number,
  seed: number,
): void {
  // Everything is clipped to the glass: no animation ever spills on the bezel, even on tiny screens.
  const put: PutRect = (x, y, rw, rh, color) => {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(w, x + rw);
    const y1 = Math.min(h, y + rh);
    if (x1 > x0 && y1 > y0) emit(x0, y0, x1 - x0, y1 - y0, color);
  };
  const C = SCREEN_COLORS;
  switch (mode) {
    case 'off': {
      put(0, 0, w, h, C.off);
      put(0, 0, 1, Math.min(3, h), C.offGlare);
      put(1, 0, Math.min(2, w - 1), 1, C.offGlare);
      return;
    }
    case 'code': {
      // An editor: a gutter, lines scrolling up while the last one is typed in.
      put(0, 0, w, h, C.bg);
      titleBar(put, w);
      const rows = h - 1;
      const perLine = 5;
      const typed = Math.floor(frame / perLine);
      const progress = (frame % perLine) + 1;
      put(0, 1, 2, rows, C.gutter);
      for (let r = 0; r < rows; r += 1) {
        const line = typed + r - (rows - 1);
        if (line < 0) continue;
        const last = r === rows - 1;
        const end = codeLine(put, 3, 1 + r, w - 3, seed, line, last ? progress * 2 : undefined);
        if (last && frame % 4 < 2) put(Math.min(w - 1, end), 1 + r, 1, 1, C.white);
      }
      return;
    }
    case 'terminal': {
      put(0, 0, w, h, C.term);
      titleBar(put, w, 0x1a2230);
      const rows = h - 1;
      const scroll = Math.floor(frame / 2);
      for (let r = 0; r < rows; r += 1) {
        const line = scroll + r;
        const n = screenNoise(seed, line, 21);
        const prompt = n % 4 === 0;
        if (prompt) {
          put(0, 1 + r, 1, 1, C.green);
          put(2, 1 + r, Math.min(w - 2, 2 + (n % 5)), 1, C.white);
        } else {
          const len = Math.min(w - 1, 2 + ((n >>> 3) % (w - 2)));
          put(1, 1 + r, len, 1, n % 9 === 0 ? C.yellow : C.termText);
        }
      }
      if (frame % 4 < 2) put(Math.min(w - 2, 3), h - 1, 2, 1, C.green);
      return;
    }
    case 'read': {
      // A document page scrolling slowly, a highlighter moving down the lines.
      put(0, 0, w, h, C.paper);
      put(0, 0, w, 1, 0xc9d0dc);
      const scroll = Math.floor(frame / 6);
      const mark = Math.floor(frame / 3) % Math.max(1, h - 2);
      for (let r = 1; r < h; r += 1) {
        const line = scroll + r;
        const n = screenNoise(seed, line, 31);
        if (n % 5 === 0) continue; // paragraph break
        const len = n % 4 === 1 ? Math.max(2, w - 5) : w - 2;
        if (r === 1 + mark) put(1, r, len, 1, C.amber);
        else put(1, r, len, 1, n % 11 === 0 ? C.inkDark : C.ink);
      }
      return;
    }
    case 'web': {
      // A browser: the address bar, a hero picture, text and cards scrolling.
      put(0, 0, w, h, C.white);
      put(0, 0, w, 2, 0xd5dbe6);
      put(1, 0, Math.max(1, w - 2), 1, 0xffffff);
      put(1, 0, 1, 1, C.green);
      const scroll = Math.floor(frame / 4) % 8;
      const hue = [C.blue, C.violet, C.cyan, C.coral][seed % 4] as number;
      for (let r = 2; r < h; r += 1) {
        const row = (r - 2 + scroll) % 8;
        if (row < 3) put(1, r, w - 2, 1, row === 0 ? hue : (hue & 0xfefefe) >> 1 || hue);
        else if (row === 4 || row === 6) put(1, r, w - 4, 1, C.ink);
        else if (row === 5) put(1, r, w - 6, 1, C.ink);
      }
      return;
    }
    case 'summon': {
      // Launching agents: a hub with spokes lighting up one after the other.
      put(0, 0, w, h, C.bg);
      titleBar(put, w);
      const cx = Math.floor(w / 2);
      const cy = 1 + Math.floor((h - 1) / 2);
      const nodes = [
        [1, 2],
        [w - 3, 2],
        [1, h - 2],
        [w - 3, h - 2],
      ] as const;
      const lit = Math.floor(frame / 3) % (nodes.length + 1);
      nodes.forEach(([nx, ny], i) => {
        const on = i < lit;
        const color = on ? C.yellow : C.glare;
        // Spoke: horizontal then vertical.
        const x0 = Math.min(nx + 1, cx);
        put(x0, ny, Math.abs(cx - nx - 1) || 1, 1, on ? 0x8a7430 : C.gutter);
        put(cx, Math.min(ny, cy), 1, Math.abs(cy - ny) || 1, on ? 0x8a7430 : C.gutter);
        put(nx, ny, 2, 1, color);
      });
      put(cx - 1, cy - 1, 3, 3, C.yellow);
      put(cx, cy, 1, 1, C.white);
      return;
    }
    case 'think': {
      // Claude's spinner: an orange asterisk that turns, over a dimmed editor.
      put(0, 0, w, h, C.bg);
      titleBar(put, w);
      for (let r = 1; r < h; r += 1) {
        const n = screenNoise(seed, r, 41);
        if (n % 3 !== 0) put(3, r, Math.min(w - 4, 2 + (n % 6)), 1, C.gutter);
      }
      const cx = Math.floor(w / 2);
      const cy = 1 + Math.floor((h - 1) / 2);
      const phase = frame % 4;
      put(cx, cy, 1, 1, C.claude);
      const arms: readonly (readonly [number, number])[] =
        phase % 2 === 0
          ? [
              [0, -2],
              [0, 2],
              [-2, 0],
              [2, 0],
            ]
          : [
              [-1, -1],
              [1, 1],
              [-1, 1],
              [1, -1],
            ];
      for (const [dx, dy] of arms) {
        put(cx + dx, cy + dy, 1, 1, C.claude);
        if (phase % 2 === 0) put(cx + dx / 2, cy + dy / 2, 1, 1, C.claude);
      }
      if (phase === 1 || phase === 3) {
        for (const [dx, dy] of [
          [0, -2],
          [0, 2],
          [-2, 0],
          [2, 0],
        ] as const) {
          put(cx + dx, cy + dy, 1, 1, 0x8f4c37);
        }
      }
      return;
    }
    case 'wait': {
      // A dialog asking for the user: amber frame, blinking "!".
      put(0, 0, w, h, C.bg);
      const on = frame % 6 < 4;
      const bx = 1;
      const by = 1;
      const bw = w - 2;
      const bh = h - 2;
      put(bx, by, bw, bh, on ? C.amber : 0x8a6a2c);
      put(bx + 1, by + 1, bw - 2, bh - 2, 0x2a2416);
      const cx = Math.floor(w / 2);
      put(cx, by + 2, 1, Math.max(1, bh - 6), on ? C.amber : 0x8a6a2c);
      put(cx, by + bh - 3, 1, 1, on ? C.amber : 0x8a6a2c);
      return;
    }
    case 'error': {
      put(0, 0, w, h, C.redDark);
      put(0, 0, w, 1, C.red);
      const on = frame % 4 < 2;
      const cx = Math.floor(w / 2);
      const cy = 1 + Math.floor((h - 1) / 2);
      const color = on ? C.red : 0xa03a35;
      for (let k = -2; k <= 2; k += 1) {
        put(cx + k, cy + k, 1, 1, color);
        put(cx + k, cy - k, 1, 1, color);
      }
      for (let r = cy + 3; r < h; r += 1) put(1, r, Math.max(1, w - 3 - (r % 3)), 1, 0x7a2a2a);
      return;
    }
    case 'sleep': {
      // Screensaver: a dim dot drifting and bouncing on a dark screen.
      put(0, 0, w, h, C.off);
      const spanX = Math.max(1, w - 2);
      const spanY = Math.max(1, h - 2);
      const t = Math.floor(frame / 2) + (seed % 17);
      const bounce = (v: number, span: number) => {
        const m = v % (span * 2);
        return m < span ? m : span * 2 - m;
      };
      const x = bounce(t, spanX);
      const y = bounce(t + 3, spanY);
      put(x, y, 2, 2, 0x34477a);
      put(x, y, 1, 1, 0x5a74b8);
      return;
    }
    case 'dashboard': {
      // The Tech Lead's second monitor: team charts breathing slowly.
      put(0, 0, w, h, C.bg);
      titleBar(put, w);
      const base = h - 1;
      for (let k = 0; k * 2 < w - 1; k += 1) {
        const n = screenNoise(seed, k, 51);
        const wave = Math.round(Math.sin((frame + k * 3) / 5) * 1.5);
        const bh = Math.max(1, Math.min(h - 3, 2 + (n % (h - 3)) + wave));
        put(1 + k * 2, base - bh + 1, 1, bh, k % 3 === 0 ? C.cyan : C.blue);
      }
      put(1, 2, Math.min(5, w - 2), 1, C.yellow);
      return;
    }
  }
}
