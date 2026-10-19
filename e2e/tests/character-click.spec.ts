import { expect, type Page, test } from '@playwright/test';
import { type RunningDaemon, startDaemon } from '../support/daemon';
import { createFeeder } from '../support/feeder';
import { characters, openOffice } from '../support/office';

let daemon: RunningDaemon;

test.beforeEach(async ({ page }) => {
  page.on('console', () => {});
  daemon = await startDaemon();
});

test.afterEach(async () => {
  await daemon.dispose();
});

interface TerminalHandle {
  __terminalPanel?: { collapsed: boolean; dock: string; activeId: string | undefined };
  __desktopActions?: { collapseTerminal(): void };
}

/** Desktop bridge with one fake terminal, so the real terminal panel mounts in the browser. */
async function installFakeDesktop(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const noop = async () => {};
    (window as unknown as Record<string, unknown>).agentsOfficeDesktop = {
      desktop: true,
      hooks: {
        status: async () => ({
          path: '/tmp/settings.json',
          total: 1,
          installedCount: 0,
          events: [{ event: 'Stop', installed: false }],
        }),
      },
      projects: { list: async () => [], sessions: async () => [], markUsed: noop },
      terminal: {
        start: async () => ({ ok: false, code: 'spawn-failed', message: 'fake' }),
        write: noop,
        resize: noop,
        kill: noop,
        list: async () => [
          {
            id: 'fake-1',
            cwd: '/work/lead',
            pid: 1,
            startedAt: new Date().toISOString(),
            cols: 80,
            rows: 24,
          },
        ],
        buffer: async () => 'hello\r\n',
        getConfig: async () => ({}),
        setConfig: async () => ({ ok: true }),
        lostSessions: async () => [],
        dismissLost: noop,
        noteSession: noop,
        onData: () => () => {},
        onExit: () => () => {},
      },
    };
  });
}

/** Clicks the screen point where the scene says the character is (camera brought next to it). */
async function clickCharacter(page: Page, id: string): Promise<void> {
  await page.evaluate((cid) => window.__office?.actions?.approachCharacter(cid), id);
  let point: { x: number; y: number } | undefined;
  await expect
    .poll(
      async () => {
        point = await page.evaluate((cid) => window.__office?.actions?.clientPointOf(cid), id);
        const viewport = page.viewportSize();
        return (
          !!point &&
          !!viewport &&
          point.x > 0 &&
          point.y > 0 &&
          point.x < viewport.width &&
          point.y < viewport.height
        );
      },
      { intervals: [200] },
    )
    .toBe(true);
  if (!point) throw new Error(`no point for ${id}`);
  await page.mouse.click(point.x, point.y);
}

const collapsed = (page: Page) => page.evaluate(() => window.__terminalPanel?.collapsed);
const activeId = (page: Page) => page.evaluate(() => window.__terminalPanel?.activeId);

async function hook(body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${daemon.url}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(204);
}

test('18. the Tech Lead opens the terminal on every click, also after the layout changed', async ({
  page,
}) => {
  await installFakeDesktop(page);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openOffice(page, daemon.url);
  await expect(page.getByTestId('terminal-panel')).toBeVisible();
  await hook({
    hook_event_name: 'SessionStart',
    session_id: 'lead-1',
    cwd: '/work/lead',
    terminalId: 'fake-1',
  });
  await expect.poll(async () => (await characters(page)).length).toBe(1);
  await expect
    .poll(async () => (await characters(page)).every((c) => c.phase === 'at-desk'), {
      timeout: 30_000,
    })
    .toBe(true);

  const collapse = () =>
    page.evaluate(() => (window as unknown as TerminalHandle).__desktopActions?.collapseTerminal());
  for (let round = 0; round < 3; round += 1) {
    // Minimized terminal: the click on the Tech Lead must open it again.
    await collapse();
    await expect.poll(() => collapsed(page)).toBe(true);
    await page.waitForTimeout(300);
    await clickCharacter(page, 'lead-1');
    await expect.poll(() => collapsed(page), { message: `open, round ${round}` }).toBe(false);
    expect(await activeId(page)).toBe('fake-1');
  }

  // Resize the window and try again.
  await collapse();
  await expect.poll(() => collapsed(page)).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await clickCharacter(page, 'lead-1');
  await expect.poll(() => collapsed(page), { message: 'open after window resize' }).toBe(false);

  // A click on the empty floor minimizes it and the Tech Lead still opens it afterwards.
  await page.mouse.click(3, 3);
  await expect.poll(() => collapsed(page)).toBe(true);
  await page.waitForTimeout(300);
  await clickCharacter(page, 'lead-1');
  await expect.poll(() => collapsed(page), { message: 'open after floor click' }).toBe(false);
});

test('19. a passive agent opens its dialog on every click in a plain browser', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, 'parallel-subagents');
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  const deadline = Date.now() + 60_000;
  while (feeder.remaining > 0 && Date.now() < deadline) {
    feeder.next(1);
    await page.waitForTimeout(80);
    const agents = (await characters(page)).filter((c) => c.role === 'agent');
    if (agents.length === 3 && agents.every((c) => c.status !== 'finished')) break;
  }
  await expect
    .poll(
      async () =>
        (await characters(page)).filter((c) => c.role === 'agent' && c.phase === 'at-desk').length,
      { timeout: 150_000 },
    )
    .toBeGreaterThan(0);
  const dialogOpen = () => page.evaluate(() => window.__office?.dialog.open === true);

  for (let round = 0; round < 3; round += 1) {
    const agent = (await characters(page)).find((c) => c.role === 'agent' && c.phase === 'at-desk');
    if (!agent) throw new Error('no agent at its desk');
    await clickCharacter(page, agent.id);
    await expect.poll(dialogOpen, { message: `dialog, round ${round}` }).toBe(true);
    await page.keyboard.press('Escape');
    await expect.poll(dialogOpen).toBe(false);
  }

  // After a window resize the click still lands on the agent.
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.waitForTimeout(300);
  const agent = (await characters(page)).find((c) => c.role === 'agent' && c.phase === 'at-desk');
  if (!agent) throw new Error('no agent at its desk');
  await clickCharacter(page, agent.id);
  await expect.poll(dialogOpen, { message: 'dialog after window resize' }).toBe(true);
});
