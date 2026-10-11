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
      hud: { text: string };
      dialog: { open: boolean; targetId: string | undefined; pages: string[][] };
      permissions: {
        queue: { id: string; tool: string; actorId: string; inputSummary: string }[];
        cardOpen: boolean;
        typing: boolean;
        cardRect?: { x: number; y: number; width: number; height: number };
      };
      actions?: {
        approachCharacter(id: string): boolean;
        approachBoard(): boolean;
        approachDoor(roomId: string): boolean;
        decidePermission(
          id: string,
          decision: { behavior: 'allow' | 'deny' | 'defer'; message?: string },
        ): boolean;
      };
    };
    /** Terminal panel of the desktop shell (see packages/web/src/ui/terminalPanel.ts). */
    __terminalPanel?: {
      tabs: { id: string; title: string; state: string }[];
      activeId: string | undefined;
      collapsed: boolean;
      height: number;
      occupied: number;
      focus: 'player' | 'terminal';
      keyboard: 'player' | 'terminal';
      cols: number;
      rows: number;
      text(): string;
      paste(text: string): void;
    };
  }
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
