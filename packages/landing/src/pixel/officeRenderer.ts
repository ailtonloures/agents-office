// Canvas renderer of the hero office. All the expensive work (loading, tinting, composing the
// room) happens once in `createOfficeRenderer`; `draw` only blits pre-composed offscreen canvases
// and a few fillRects, and reuses preallocated buffers (no per-frame allocation of its own).
import type { Role } from '../components/roles';
import { ROLES } from '../components/roles';
import {
  DESKS,
  GRID_COLS,
  GRID_ROWS,
  RING_COLORS,
  type SceneAgent,
  sceneAt,
  TECH_LEAD_DESK,
  TILE_SIZE,
} from './officeLogic';
import {
  agentPosition,
  characterFrame,
  LOOKS,
  layerFiles,
  type PixelPoint,
  SCENE_HEIGHT,
  SCENE_WIDTH,
  type ScreenMode,
  screenModeFor,
  secondaryMode,
  wrapPick,
} from './sceneView';
import {
  applyPaletteSwap,
  frameRects,
  outlineFrames,
  type SkinColors,
  swapTableFor,
} from './spriteTint';

interface PropFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly ax: number;
  readonly ay: number;
  readonly screens?: readonly { x: number; y: number; w: number; h: number }[];
}

export interface SkinManifest {
  readonly tileSize: number;
  readonly tileset: {
    readonly image: string;
    readonly columns: number;
    readonly tiles: Readonly<Record<string, number>>;
  };
  readonly characters: {
    readonly frame: { readonly width: number; readonly height: number };
    readonly columns: number;
    readonly walk: Readonly<Record<'up' | 'down' | 'left' | 'right', readonly number[]>>;
    readonly poses: Readonly<Record<string, number>>;
    readonly head: { readonly top: number; readonly seatedTop: number };
    readonly baseColors: SkinColors;
    readonly palettes: {
      readonly skin: readonly string[];
      readonly hair: readonly string[];
      readonly shirt: readonly string[];
      readonly pants: readonly string[];
    };
    readonly hair: readonly string[];
  };
  readonly props: { readonly image: string; readonly frames: Readonly<Record<string, PropFrame>> };
}

export interface OfficeRenderer {
  /** Draws the scene at `nowMs` into `ctx` (already scaled so one unit is one scene pixel). */
  draw(ctx: CanvasRenderingContext2D, nowMs: number): void;
}

// ---- Loading -------------------------------------------------------------

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${url}`));
    img.src = url;
  });
}

function makeCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas is not available');
  ctx.imageSmoothingEnabled = false;
  return [canvas, ctx];
}

// ---- Room layout ---------------------------------------------------------

interface PropSpec {
  readonly id: string;
  /** Footprint tile (the prop is anchored on the bottom-left of it). */
  readonly x: number;
  readonly y: number;
  /** Added to the depth key (a chair sits in front of whoever sits in it). */
  readonly bias?: number;
  /** Seat tile of the worker whose monitors this prop shows. */
  readonly seat?: { readonly x: number; readonly y: number };
  /** Drawn under everything that stands on the floor. */
  readonly flat?: boolean;
}

const WORKSTATIONS: Readonly<Record<Exclude<Role, 'tech-lead'>, string>> = {
  analyst: 'workstation',
  architect: 'workstation-b',
  developer: 'workstation-c',
  qa: 'workstation',
  support: 'workstation-b',
};

function buildProps(): PropSpec[] {
  const props: PropSpec[] = [
    { id: 'door-0', x: 1, y: 11, flat: true },
    { id: 'lead-desk', x: TECH_LEAD_DESK.x - 1, y: TECH_LEAD_DESK.y - 1, seat: TECH_LEAD_DESK },
    { id: 'chair-exec', x: TECH_LEAD_DESK.x, y: TECH_LEAD_DESK.y, bias: 2 },
    { id: 'bookshelf', x: 1, y: 3 },
    { id: 'plant-tall', x: 6, y: 2 },
    { id: 'server-rack', x: 14, y: 2 },
    { id: 'floor-lamp', x: 13, y: 9 },
    { id: 'sofa', x: 14, y: 9 },
    { id: 'coffee-table', x: 14, y: 10 },
    { id: 'plant-fig', x: 19, y: 10 },
    { id: 'plant', x: 3, y: 10 },
    { id: 'cooler', x: 19, y: 6 },
  ];
  for (const role of ROLES) {
    if (role === 'tech-lead') continue;
    const desk = DESKS[role];
    props.push({ id: WORKSTATIONS[role], x: desk.x, y: desk.y - 1, seat: desk });
    props.push({ id: 'chair', x: desk.x, y: desk.y, bias: 2 });
  }
  return props;
}

const WALL_DECOR: Readonly<Record<number, string>> = {
  4: 'whiteboard',
  5: 'window',
  6: 'window',
  13: 'clock',
  16: 'window',
};

function paintRoom(
  ctx: CanvasRenderingContext2D,
  tiles: HTMLImageElement,
  skin: SkinManifest,
): void {
  const { columns, tiles: index } = skin.tileset;
  const size = skin.tileSize;
  const put = (name: string, col: number, row: number) => {
    const n = index[name];
    if (n === undefined) return;
    ctx.drawImage(
      tiles,
      (n % columns) * size,
      Math.floor(n / columns) * size,
      size,
      size,
      col * size,
      row * size,
      size,
      size,
    );
  };
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (row === 0) {
        put(WALL_DECOR[col] === 'window' ? 'window-top' : 'wall-top', col, row);
      } else if (row === 1) {
        put('wall-mid', col, row);
        const decor = WALL_DECOR[col];
        if (decor) put(decor, col, row);
      } else if (row === GRID_ROWS - 1) {
        put('wall-bottom', col, row);
      } else if (row === 8) {
        put('hall', col, row);
      } else {
        put((col + row) % 2 === 0 ? 'wood' : 'wood-b', col, row);
      }
    }
  }
}

// ---- Characters ----------------------------------------------------------

async function buildCharacterSheet(
  role: Role,
  skin: SkinManifest,
  baseUrl: string,
): Promise<HTMLCanvasElement> {
  const { characters } = skin;
  const { width: fw, height: fh } = characters.frame;
  const look = LOOKS[role];
  const files = layerFiles(role, look.hairStyle, characters.hair.length);
  const layers = await Promise.all(files.map((f) => loadImage(`${baseUrl}characters/${f}.png`)));
  const [canvas, ctx] = makeCanvas(layers[0]?.width ?? 0, layers[0]?.height ?? 0);
  for (const layer of layers) ctx.drawImage(layer, 0, 0);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { palettes } = characters;
  applyPaletteSwap(
    image.data,
    swapTableFor(characters.baseColors, {
      skin: wrapPick(palettes.skin, look.skin),
      hair: wrapPick(palettes.hair, look.hair),
      shirt: wrapPick(palettes.shirt, look.shirt),
      pants: wrapPick(palettes.pants, look.pants),
    }),
  );
  const count = Math.floor(canvas.width / fw) * Math.floor(canvas.height / fh);
  outlineFrames(image.data, canvas.width, frameRects(count, characters.columns, fw, fh));
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// ---- Monitors ------------------------------------------------------------

const SCREEN_FPS = 6;
const C = {
  bg: '#14233b',
  bar: '#22385c',
  cyan: '#57d3c2',
  blue: '#5aa2ff',
  violet: '#a98bff',
  yellow: '#f2c94c',
  coral: '#ff8a6b',
  green: '#6fd38a',
  paper: '#e9edf5',
  ink: '#8d97ad',
  term: '#0b1018',
  termText: '#9fb0c8',
  claude: '#d97757',
  amber: '#f2b84b',
  off: '#0f1626',
  offGlare: '#1f2c45',
} as const;
const CODE_COLORS = [C.cyan, C.blue, C.violet, C.yellow, C.coral, C.green] as const;

/** Pseudo-random in [0, 1) from two integers (no state, no allocation). */
function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function drawScreen(
  ctx: CanvasRenderingContext2D,
  mode: ScreenMode,
  x: number,
  y: number,
  w: number,
  h: number,
  frame: number,
): void {
  const inset = 1;
  switch (mode) {
    case 'off': {
      ctx.fillStyle = C.off;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = C.offGlare;
      ctx.fillRect(x + 1, y + 1, 3, 1);
      return;
    }
    case 'code': {
      ctx.fillStyle = C.bg;
      ctx.fillRect(x, y, w, h);
      const scroll = Math.floor(frame / 2);
      for (let row = 0; row < Math.floor((h - 2) / 2); row++) {
        const seed = row + scroll;
        const len = 2 + Math.floor(hash2(seed, 1) * (w - 6));
        const indent = Math.floor(hash2(seed, 2) * 3) * 2;
        ctx.fillStyle = CODE_COLORS[Math.floor(hash2(seed, 3) * CODE_COLORS.length)] ?? C.cyan;
        ctx.fillRect(x + inset + 1 + indent, y + inset + row * 2, Math.min(len, w - 4 - indent), 1);
      }
      return;
    }
    case 'terminal': {
      ctx.fillStyle = C.term;
      ctx.fillRect(x, y, w, h);
      const scroll = Math.floor(frame / 3);
      ctx.fillStyle = C.termText;
      for (let row = 0; row < Math.floor((h - 3) / 2); row++) {
        const len = 3 + Math.floor(hash2(row + scroll, 4) * (w - 8));
        ctx.fillRect(x + 2, y + 1 + row * 2, len, 1);
      }
      if (Math.floor(frame / 3) % 2 === 0) {
        ctx.fillStyle = C.green;
        ctx.fillRect(x + 2, y + h - 3, 2, 1);
      }
      return;
    }
    case 'read': {
      ctx.fillStyle = C.paper;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = C.ink;
      for (let row = 0; row < Math.floor((h - 2) / 2); row++) {
        ctx.fillRect(x + 2, y + 1 + row * 2, w - 4 - (row % 3) * 2, 1);
      }
      return;
    }
    case 'think': {
      ctx.fillStyle = C.bg;
      ctx.fillRect(x, y, w, h);
      const cx = x + Math.floor(w / 2) - 3;
      const cy = y + Math.floor(h / 2);
      const lit = Math.floor(frame / 2) % 3;
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i === lit ? C.claude : C.bar;
        ctx.fillRect(cx + i * 3, cy, 2, 2);
      }
      return;
    }
    case 'wait': {
      ctx.fillStyle = C.bg;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = Math.floor(frame / 3) % 2 === 0 ? C.amber : C.bar;
      ctx.fillRect(x + Math.floor(w / 2) - 1, y + Math.floor(h / 2) - 1, 3, 3);
      return;
    }
    case 'dashboard': {
      ctx.fillStyle = C.bg;
      ctx.fillRect(x, y, w, h);
      const bars = Math.max(1, Math.floor((w - 2) / 2));
      for (let i = 0; i < bars; i++) {
        const bh = 1 + Math.floor(hash2(i, Math.floor(frame / 4)) * (h - 3));
        ctx.fillStyle = i % 2 === 0 ? C.cyan : C.violet;
        ctx.fillRect(x + 1 + i * 2, y + h - 1 - bh, 1, bh);
      }
      return;
    }
  }
}

// ---- Renderer ------------------------------------------------------------

interface StaticItem {
  readonly frame: PropFrame;
  /** Top-left of the sprite in scene pixels. */
  readonly dx: number;
  readonly dy: number;
  readonly key: number;
  readonly seat: { readonly x: number; readonly y: number } | undefined;
}

function drawProp(ctx: CanvasRenderingContext2D, image: HTMLImageElement, item: StaticItem): void {
  const f = item.frame;
  ctx.drawImage(image, f.x, f.y, f.w, f.h, item.dx, item.dy, f.w, f.h);
}

const MAX_AGENTS = 8;
/** Space above the head for the status marker. */
const RING_GAP = 4;

export async function createOfficeRenderer(baseUrl: string): Promise<OfficeRenderer> {
  const skin = (await (await fetch(`${baseUrl}skin.json`)).json()) as SkinManifest;
  const [tilesImg, propsImg] = await Promise.all([
    loadImage(`${baseUrl}${skin.tileset.image}`),
    loadImage(`${baseUrl}${skin.props.image}`),
  ]);
  const sheets = await Promise.all(ROLES.map((role) => buildCharacterSheet(role, skin, baseUrl)));
  const sheetOf = new Map<Role, HTMLCanvasElement>();
  ROLES.forEach((role, i) => {
    const sheet = sheets[i];
    if (sheet) sheetOf.set(role, sheet);
  });

  const [background, bgCtx] = makeCanvas(SCENE_WIDTH, SCENE_HEIGHT);
  paintRoom(bgCtx, tilesImg, skin);

  const flat: StaticItem[] = [];
  const upright: StaticItem[] = [];
  for (const spec of buildProps()) {
    const frame = skin.props.frames[spec.id];
    if (!frame) continue;
    const item: StaticItem = {
      frame,
      dx: spec.x * TILE_SIZE - frame.ax,
      dy: (spec.y + 1) * TILE_SIZE - frame.ay,
      key: (spec.y + 1) * TILE_SIZE + (spec.bias ?? 0),
      seat: spec.seat,
    };
    (spec.flat ? flat : upright).push(item);
  }
  upright.sort((a, b) => a.key - b.key);
  // Doors and other flat props go straight into the background.
  for (const item of flat) drawProp(bgCtx, propsImg, item);

  const { frame: charFrame, columns, head } = skin.characters;
  const position: PixelPoint = { x: 0, y: 0 };
  const order = new Int8Array(MAX_AGENTS);
  const keys = new Float64Array(MAX_AGENTS);

  function seatMode(agents: readonly SceneAgent[], item: StaticItem): ScreenMode {
    const seat = item.seat;
    if (!seat) return 'off';
    for (const a of agents) {
      if (a.pose === 'seated' && a.tile.x === seat.x && a.tile.y === seat.y) {
        return screenModeFor(a.activity);
      }
    }
    return 'off';
  }

  function drawItem(
    ctx: CanvasRenderingContext2D,
    item: StaticItem,
    agents: readonly SceneAgent[],
    screenFrame: number,
  ): void {
    drawProp(ctx, propsImg, item);
    const screens = item.frame.screens;
    if (!screens || !item.seat) return;
    const primary = seatMode(agents, item);
    for (let i = 0; i < screens.length; i++) {
      const s = screens[i];
      if (!s) continue;
      // Screen rectangles are relative to the bottom-left of the prop's footprint tile.
      const sx = item.dx + item.frame.ax + s.x;
      const sy = item.dy + item.frame.ay + s.y;
      drawScreen(ctx, i === 0 ? primary : secondaryMode(primary), sx, sy, s.w, s.h, screenFrame);
    }
  }

  function drawAgent(
    ctx: CanvasRenderingContext2D,
    agent: SceneAgent,
    cycleMs: number,
    nowMs: number,
  ) {
    const sheet = sheetOf.get(agent.role);
    if (!sheet) return;
    agentPosition(agent, cycleMs, position);
    const frame = characterFrame(agent, nowMs, skin.characters);
    const top = position.y + TILE_SIZE - charFrame.height;
    ctx.drawImage(
      sheet,
      (frame % columns) * charFrame.width,
      Math.floor(frame / columns) * charFrame.height,
      charFrame.width,
      charFrame.height,
      position.x,
      top,
      charFrame.width,
      charFrame.height,
    );
    // Status marker above the head: the ring color of the scene logic.
    const headTop = top + (agent.pose === 'seated' ? head.seatedTop : head.top);
    const mx = position.x + Math.floor(charFrame.width / 2) - 2;
    const my = headTop - RING_GAP - 3;
    ctx.fillStyle = '#1b1d2a';
    ctx.fillRect(mx - 1, my - 1, 5, 5);
    ctx.fillStyle = RING_COLORS[agent.ring];
    ctx.fillRect(mx, my, 3, 3);
  }

  return {
    draw(ctx, nowMs) {
      const snapshot = sceneAt(nowMs);
      const agents = snapshot.agents;
      const screenFrame = Math.floor((nowMs / 1000) * SCREEN_FPS);
      ctx.drawImage(background, 0, 0);

      // Sort the agents by the bottom edge of their tile (insertion sort on preallocated arrays).
      const count = Math.min(agents.length, MAX_AGENTS);
      for (let i = 0; i < count; i++) {
        const a = agents[i];
        if (!a) continue;
        agentPosition(a, snapshot.cycleMs, position);
        const key = position.y + TILE_SIZE;
        let j = i;
        while (j > 0 && (keys[j - 1] ?? 0) > key) {
          keys[j] = keys[j - 1] ?? 0;
          order[j] = order[j - 1] ?? 0;
          j--;
        }
        keys[j] = key;
        order[j] = i;
      }

      let next = 0;
      for (let k = 0; k < count; k++) {
        const key = keys[k] ?? 0;
        while (next < upright.length && (upright[next]?.key ?? Infinity) <= key) {
          const item = upright[next];
          if (item) drawItem(ctx, item, agents, screenFrame);
          next++;
        }
        const agent = agents[order[k] ?? 0];
        if (agent) drawAgent(ctx, agent, snapshot.cycleMs, nowMs);
      }
      for (; next < upright.length; next++) {
        const item = upright[next];
        if (item) drawItem(ctx, item, agents, screenFrame);
      }
    },
  };
}
