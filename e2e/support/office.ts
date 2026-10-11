import type { Page } from '@playwright/test';

declare global {
  interface Window {
    /** Debug surface exposed by the web app (see packages/web/src/debug/debugState.ts). */
    __office?: {
      connected: boolean;
      characters: OfficeCharacter[];
      model: {
        sessions: Record<string, unknown>;
        agents: Record<string, { description: string; status: string }>;
        hallOfFame: unknown[];
      };
      player: { x: number; y: number; facing: string; moving: boolean };
      /** Office camera zoom chosen by the user. */
      zoom: number;
      /** Real canvas resizes since boot (spec 044). */
      resizes: number;
      /** True while the overview (M) is active. */
      overview: boolean;
      hud: { text: string };
      rooms: { id: string; w: number; h: number }[];
      /** Automatic door of each room (by room id). */
      doors: Record<string, 'open' | 'closed' | 'moving'>;
      /** Screen-fixed UI in game pixels and the cameras that draw it (spec 037). */
      ui: {
        screen: { width: number; height: number };
        cameraZoom: number;
        mainCameraDrawsUi: boolean;
        hud: Rect;
        hints: Rect;
        dialog: Rect;
      };
      dialog: { open: boolean; targetId: string | undefined; pages: string[][] };
      permissions: {
        queue: { id: string; tool: string; actorId: string; inputSummary: string }[];
      };
      actions?: {
        approachCharacter(id: string): boolean;
        approachBoard(): boolean;
        clientPointOf(id: string): { x: number; y: number } | undefined;
        approachDoor(roomId: string): boolean;
      };
    };
    /** Terminal panel of the desktop shell (see packages/web/src/ui/terminalPanel.ts). */
    __terminalPanel?: {
      tabs: { id: string; title: string; state: string }[];
      activeId: string | undefined;
      collapsed: boolean;
      height: number;
      width: number;
      dock: 'bottom' | 'left' | 'right';
      occupied: number;
      occupiedSize: number;
      focus: 'player' | 'terminal';
      keyboard: 'player' | 'terminal';
      cols: number;
      rows: number;
      text(): string;
      paste(text: string): void;
    };
  }
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OfficeCharacter {
  id: string;
  role: 'lead' | 'agent' | 'avatar';
  status?: string;
  profession?: string;
  phase?: string;
  roomId?: string;
}

/** Waits for the office to be connected (WebSocket up, scene running). */
export async function openOffice(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.waitForFunction(() => window.__office?.connected === true);
}

export const characters = (page: Page): Promise<OfficeCharacter[]> =>
  page.evaluate(() => (window.__office?.characters ?? []) as OfficeCharacter[]);

export const hudText = (page: Page): Promise<string> =>
  page.evaluate(() => window.__office?.hud.text ?? '');

/** Screenshot of the page into `test-results/screens/<name>.png` (the canvas is the whole page). */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/screens/${name}.png` });
}

/**
 * Color of the screen pixel under the centre of game pixel (`gx`, `gy`), read from a real
 * screenshot, so it checks what is drawn (not what the scene believes it drew).
 */
export async function gamePixel(
  page: Page,
  gx: number,
  gy: number,
): Promise<[number, number, number]> {
  const png = (await page.screenshot()).toString('base64');
  return page.evaluate(
    async ({ data, x, y }) => {
      const canvas = document.querySelector('canvas');
      const screen = window.__office?.ui.screen;
      if (!canvas || !screen) throw new Error('no canvas');
      const box = canvas.getBoundingClientRect();
      const image = new Image();
      image.src = `data:image/png;base64,${data}`;
      await image.decode();
      const copy = document.createElement('canvas');
      copy.width = image.width;
      copy.height = image.height;
      const ctx = copy.getContext('2d');
      if (!ctx) throw new Error('no 2d context');
      ctx.drawImage(image, 0, 0);
      const px = box.left + ((x + 0.5) * box.width) / screen.width;
      const py = box.top + ((y + 0.5) * box.height) / screen.height;
      const [r = 0, g = 0, b = 0] = ctx.getImageData(Math.floor(px), Math.floor(py), 1, 1).data;
      return [r, g, b] as [number, number, number];
    },
    { data: png, x: gx, y: gy },
  );
}
