import { expect, test } from '@playwright/test';
import { type RunningDaemon, startDaemon } from '../support/daemon';
import { createFeeder, loadFixture, writeSubagent } from '../support/feeder';
import { characters, gamePixel, hudText, openOffice, shot } from '../support/office';

let daemon: RunningDaemon;

test.beforeEach(async () => {
  daemon = await startDaemon();
});

test.afterEach(async () => {
  await daemon.dispose();
});

const FIXTURE = 'parallel-subagents';

test('1. parallel subagents: 1 tech lead + 3 agents working, then they leave', async ({ page }) => {
  await openOffice(page, daemon.url);
  expect(await characters(page)).toHaveLength(0);
  await shot(page, '1-0-empty');

  const feeder = createFeeder(daemon.projectsDir, FIXTURE);

  // The session appears first: only the tech lead.
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  await shot(page, '1-1-tech-lead');

  // Feed incrementally. The fixture alternates thinking/working per step, so track which agents
  // were seen working while all three are in the office at once.
  const workedIds = new Set<string>();
  let peak = 0;
  const deadline = Date.now() + 60_000;
  while (feeder.remaining > 0 && Date.now() < deadline) {
    feeder.next(1);
    await page.waitForTimeout(80);
    const agents = (await characters(page)).filter((c) => c.role === 'agent');
    for (const agent of agents) if (agent.status === 'working') workedIds.add(agent.id);
    peak = Math.max(peak, agents.filter((c) => c.status !== 'finished').length);
    if (peak === 3 && workedIds.size === 3) break;
  }
  expect(peak).toBe(3);
  expect(workedIds.size).toBe(3);
  const live = await characters(page);
  expect(live.filter((c) => c.role === 'lead')).toHaveLength(1);
  expect(live.filter((c) => c.role === 'agent')).toHaveLength(3);
  await page.waitForTimeout(1500);
  await shot(page, '1-2-three-agents-working');

  // Let the agents finish: they deliver their report and leave the office.
  const roomArea = () =>
    page.evaluate(() => (window.__office?.rooms ?? []).reduce((sum, r) => sum + r.w * r.h, 0));
  const withAgents = await roomArea();
  await feeder.rest(100);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'agent').length, {
      timeout: 45_000,
    })
    .toBe(0);
  // Their cubicles go away with them: the room shrinks.
  await expect.poll(roomArea).toBeLessThan(withAgents);
  const finished = await page.evaluate(() =>
    Object.values(window.__office?.model.agents ?? {}).map((a) => a.status),
  );
  expect(finished).toEqual(['finished', 'finished', 'finished']);
  expect((await characters(page)).filter((c) => c.role === 'lead')).toHaveLength(1);
  await shot(page, '1-3-agents-gone');
});

test('2. talking to an agent shows its task description', async ({ page }) => {
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  const descriptions = ['Map the auth module', 'Map the billing module', 'Map the search module'];

  // Feed until the three agents are in the office, then stop: they stay put at their desks.
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
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0);
  await shot(page, '2-0-agent-at-desk');

  // Teleport next to the agent (debug helper), face it and press Enter. The agent may wander to a
  // point of interest between the two, so retry until the dialog opens on it.
  await expect
    .poll(
      async () => {
        const id = (await characters(page)).find((c) => c.role === 'agent')?.id;
        if (!id) return false;
        await page.evaluate((agentId) => window.__office?.actions?.approachCharacter(agentId), id);
        await page.keyboard.press('Enter');
        return page.evaluate(() => window.__office?.dialog.open === true);
      },
      { timeout: 30_000, intervals: [200] },
    )
    .toBe(true);

  const dialog = await page.evaluate(() => window.__office?.dialog);
  const model = await page.evaluate(() => window.__office?.model.agents ?? {});
  const description = (model[dialog?.targetId ?? ''] as { description: string } | undefined)
    ?.description;
  expect(descriptions).toContain(description);
  // Text is rendered upper-case-agnostic by the bitmap font, but the pages hold the raw text.
  expect(dialog?.pages.flat().join(' ')).toContain(description);
  await page.waitForTimeout(1200); // let the typewriter finish
  await shot(page, '2-1-dialog');

  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => window.__office?.dialog.open)).toBe(false);
});

test('3. a Notification hook makes the character wait and the HUD shows ! 1', async ({ page }) => {
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  const { info } = loadFixture(FIXTURE);

  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  await expect.poll(() => hudText(page)).toContain('! 0');
  await shot(page, '3-0-before-notification');

  const response = await fetch(`${daemon.url}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hook_event_name: 'Notification',
      session_id: info.sessionId,
      transcript_path: `${daemon.projectsDir}/${info.projectSlug}/${info.sessionId}.jsonl`,
      cwd: '/anon/projects/demo-app',
      message: 'Claude needs your permission to use Bash',
      notification_type: 'permission_prompt',
    }),
  });
  expect(response.status).toBe(204);

  await expect
    .poll(async () => (await characters(page)).find((c) => c.role === 'lead')?.status)
    .toBe('waiting');
  await expect.poll(() => hudText(page)).toContain('! 1');
  await page.waitForTimeout(800);
  await shot(page, '3-1-waiting');
});

test('4. restarting the daemon: the page reconnects and rebuilds the state', async ({ page }) => {
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  await shot(page, '4-0-before-restart');

  await daemon.stop();
  await expect.poll(() => page.evaluate(() => window.__office?.connected)).toBe(false);
  await shot(page, '4-1-disconnected');

  await daemon.restart();
  await expect
    .poll(() => page.evaluate(() => window.__office?.connected), { timeout: 30_000 })
    .toBe(true);
  // The new process re-reads the transcripts on disk: the tech lead is back.
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length, {
      timeout: 30_000,
    })
    .toBe(1);
  const sessions = await page.evaluate(() => Object.keys(window.__office?.model.sessions ?? {}));
  expect(sessions).toHaveLength(1);
  await shot(page, '4-2-reconnected');
});

test('5. the Hall of Fame board lists the finished agents', async ({ page }) => {
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  await feeder.rest(40);
  await expect
    .poll(() => page.evaluate(() => window.__office?.model.hallOfFame.length ?? 0), {
      timeout: 30_000,
    })
    .toBe(3);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'agent').length, {
      timeout: 45_000,
    })
    .toBe(0);

  await expect
    .poll(async () => {
      await page.evaluate(() => window.__office?.actions?.approachBoard());
      await page.keyboard.press('Enter');
      return page.evaluate(() => window.__office?.dialog.targetId);
    })
    .toBe('hall-of-fame');
  const text = (await page.evaluate(() => window.__office?.dialog.pages ?? [])).flat().join('\n');
  expect(text).toContain('Hall of Fame');
  expect(text).toContain('Map the');
  expect(text).toContain('Project: demo-app');
  await page.waitForTimeout(1200);
  await shot(page, '5-hall-of-fame');
});

const zoomOf = (page: import('@playwright/test').Page): Promise<number> =>
  page.evaluate(() => window.__office?.zoom ?? 0);

async function ctrlWheel(page: import('@playwright/test').Page, deltaY: number, ctrl = true) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  if (ctrl) await page.keyboard.down('Control');
  await page.mouse.wheel(0, deltaY);
  if (ctrl) await page.keyboard.up('Control');
}

test('6. zoom buttons change the zoom, stop at the limits and do not move the avatar', async ({
  page,
}) => {
  // Headless software rendering draws the device-resolution canvas slowly: every zoom click costs frames.
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.removeItem('agents-office.zoom'));
  await openOffice(page, daemon.url);
  const zoomIn = page.getByTestId('zoom-in');
  const zoomOut = page.getByTestId('zoom-out');
  await expect(zoomIn).toBeVisible();
  expect(await zoomOf(page)).toBe(1);
  const before = await page.evaluate(() => window.__office?.player);

  await zoomIn.click();
  // 1280x720 renders 3 canvas pixels per game pixel: zoom levels are whole thirds (crisp texels).
  expect(await zoomOf(page)).toBeCloseTo(4 / 3);
  await zoomOut.click();
  await zoomOut.click();
  expect(await zoomOf(page)).toBeCloseTo(2 / 3);
  expect(await page.evaluate(() => window.__office?.player)).toEqual(before);

  for (let i = 0; i < 10; i++) if (await zoomIn.isEnabled()) await zoomIn.click();
  expect(await zoomOf(page)).toBe(3);
  await expect(zoomIn).toBeDisabled();
  await expect(zoomOut).toBeEnabled();
  for (let i = 0; i < 20; i++) if (await zoomOut.isEnabled()) await zoomOut.click();
  expect(await zoomOf(page)).toBe(0.25);
  await expect(zoomOut).toBeDisabled();
  await expect(zoomIn).toBeEnabled();
});

test('7. Ctrl + wheel over the canvas zooms; the wheel alone does not', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('agents-office.zoom'));
  await openOffice(page, daemon.url);
  await ctrlWheel(page, -100, false);
  await page.waitForTimeout(200);
  expect(await zoomOf(page)).toBe(1);
  await ctrlWheel(page, -100);
  await expect.poll(() => zoomOf(page)).toBeCloseTo(4 / 3);
  await ctrlWheel(page, 100);
  await expect.poll(() => zoomOf(page)).toBe(1);
});

test('8. zoom persists after reload; the overview hides the buttons and restores the zoom', async ({
  page,
}) => {
  await openOffice(page, daemon.url);
  await page.evaluate(() => localStorage.removeItem('agents-office.zoom'));
  await page.reload();
  await page.waitForFunction(() => window.__office?.connected === true);
  await page.getByTestId('zoom-in').click();
  await page.getByTestId('zoom-in').click();
  expect(await zoomOf(page)).toBeCloseTo(5 / 3);

  await page.reload();
  await page.waitForFunction(() => window.__office?.connected === true);
  await expect.poll(() => zoomOf(page)).toBeCloseTo(5 / 3);

  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.__office?.overview)).toBe(true);
  await expect(page.getByTestId('zoom-in')).toBeHidden();
  expect(await zoomOf(page)).toBeCloseTo(5 / 3);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.__office?.overview)).toBe(false);
  await expect(page.getByTestId('zoom-in')).toBeVisible();
  expect(await zoomOf(page)).toBeCloseTo(5 / 3);
});

test('9. recreating an idle subagent replaces it: the old one leaves, the new one stays', async ({
  page,
}) => {
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);

  // The first sub-agent has been silent for 3 minutes: the liveness clock turns it idle.
  const twin = { agentType: 'Explore', description: 'Map the billing module' };
  writeSubagent(daemon.projectsDir, FIXTURE, {
    ...twin,
    agentId: 'e2eold000000000001',
    timestamp: new Date(Date.now() - 3 * 60_000).toISOString(),
  });
  const statusOf = (id: string) =>
    page.evaluate((agentId) => window.__office?.model.agents[agentId]?.status, id);
  await expect.poll(() => statusOf('e2eold000000000001'), { timeout: 30_000 }).toBe('idle');
  await expect.poll(() => hudText(page)).toContain('1 agent ');
  await shot(page, '9-0-idle-agent');

  // The same sub-agent is recreated with a new id.
  writeSubagent(daemon.projectsDir, FIXTURE, {
    ...twin,
    agentId: 'e2enew000000000002',
    timestamp: new Date().toISOString(),
  });
  await expect.poll(() => statusOf('e2eold000000000001')).toBe('finished');
  await expect
    .poll(
      async () =>
        (await characters(page))
          .filter((c) => c.role === 'agent')
          .map((c) => c.id)
          .sort(),
      { timeout: 45_000 },
    )
    .toEqual(['e2enew000000000002']);
  await expect.poll(() => hudText(page)).toContain('1 agent ');
  const health = (await (await fetch(`${daemon.url}/health`)).json()) as { agents: number };
  expect(health.agents).toBe(1);
  await shot(page, '9-1-old-left-new-stays');
});

test('10. the HUD, the shortcuts and the dialog keep size and position at any zoom', async ({
  page,
}) => {
  // Headless software rendering draws the device-resolution canvas slowly: every zoom click costs frames.
  test.setTimeout(240_000);
  await page.addInitScript(() => localStorage.removeItem('agents-office.zoom'));
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  await expect
    .poll(
      async () => {
        const id = (await characters(page)).find((c) => c.role === 'lead')?.id;
        if (!id) return false;
        await page.evaluate((leadId) => window.__office?.actions?.approachCharacter(leadId), id);
        await page.keyboard.press('Enter');
        return page.evaluate(() => window.__office?.dialog.open === true);
      },
      { timeout: 30_000, intervals: [200] },
    )
    .toBe(true);

  const setZoom = async (target: number) => {
    const button = page.getByTestId(target > (await zoomOf(page)) ? 'zoom-in' : 'zoom-out');
    for (let i = 0; i < 20 && Math.abs((await zoomOf(page)) - target) > 1e-6; i++)
      await button.click();
    expect(await zoomOf(page)).toBeCloseTo(target);
  };
  const ui = () => page.evaluate(() => window.__office?.ui);
  // The dot is at game pixel (14, 13) of the status pill; the paper strip is inside the dialog.
  const near = (c: number[], want: number[]) =>
    c.every((v, i) => Math.abs(v - (want[i] ?? 0)) < 40);

  await setZoom(1);
  const base = await ui();
  expect(base?.cameraZoom).toBe(1);
  expect(base?.mainCameraDrawsUi).toBe(false);
  expect(base?.hud.width).toBeGreaterThan(0);
  expect(base?.hints.width).toBeGreaterThan(0);
  expect(base?.dialog.width).toBeGreaterThan(0);

  for (const zoom of [0.25, 1, 3]) {
    await setZoom(zoom);
    await page.waitForTimeout(300);
    expect(await ui()).toEqual(base);
    expect(await page.evaluate(() => window.__office?.dialog.open)).toBe(true);
    const dot = await gamePixel(page, 14, 13);
    expect(near(dot, [0x58, 0xd3, 0x6b]), `HUD dot at zoom ${zoom}: ${dot}`).toBe(true);
    const d = base?.dialog;
    const paper = await gamePixel(page, (d?.x ?? 0) + 150, (d?.y ?? 0) + 3);
    expect(near(paper, [0xf7, 0xf6, 0xf2]), `dialog paper at zoom ${zoom}: ${paper}`).toBe(true);
    await shot(page, `10-zoom-${zoom}`);
  }
});

test('11. orphan events open no "Unknown" room and the HUD counts only real sessions', async ({
  page,
}) => {
  await openOffice(page, daemon.url);
  const hook = async (body: Record<string, unknown>) => {
    const response = await fetch(`${daemon.url}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(204);
  };
  const sessionIds = () =>
    page.evaluate(() => Object.keys(window.__office?.model.sessions ?? {}).sort());

  // Events of sessions that never told where they run: nothing appears.
  await hook({ hook_event_name: 'Stop', session_id: 'orphan-1' });
  await hook({ hook_event_name: 'SessionStart', session_id: 'orphan-2' });
  await hook({ hook_event_name: 'Notification', session_id: 'orphan-3', message: 'hi' });
  await page.waitForTimeout(800);
  expect(await sessionIds()).toEqual([]);
  expect(await characters(page)).toHaveLength(0);
  await expect.poll(() => hudText(page)).toContain('0 sessions');

  // Two real sessions get their rooms; the orphans still count for nothing.
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  await hook({ hook_event_name: 'SessionStart', session_id: 'real-2', cwd: '/work/second-app' });
  await expect.poll(async () => (await sessionIds()).length).toBe(2);
  await hook({ hook_event_name: 'Stop', session_id: 'orphan-1' });
  await hook({ hook_event_name: 'PostToolUse', session_id: 'orphan-4', tool_use_id: 'tu-x' });
  await page.waitForTimeout(800);
  expect(await sessionIds()).not.toContain('orphan-1');
  expect((await sessionIds()).some((id) => id.startsWith('orphan'))).toBe(false);
  await expect.poll(() => hudText(page)).toContain('2 sessions · 0 agents');
  const health = (await (await fetch(`${daemon.url}/health`)).json()) as {
    sessions: number;
    agents: number;
  };
  expect(health).toMatchObject({ sessions: 2, agents: 0 });
  await shot(page, '11-no-unknown-room');
});

test('12. Hooks button and notice live inside #game and follow its rectangle', async ({ page }) => {
  await page.addInitScript(() => {
    const status = {
      path: '/tmp/settings.json',
      total: 1,
      installedCount: 0,
      events: [{ event: 'Stop', installed: false }],
    };
    (window as unknown as Record<string, unknown>).agentsOfficeDesktop = {
      desktop: true,
      hooks: { status: async () => status },
    };
  });
  await openOffice(page, daemon.url);
  const button = page.getByTestId('hooks-open');
  const banner = page.getByTestId('hooks-banner');
  await expect(button).toBeVisible();
  await expect(banner).toBeVisible();
  for (const locator of [button, banner]) {
    expect(await locator.evaluate((node) => !!node.closest('#game'))).toBe(true);
  }
  // The button sits in the shared corner bar (`position: absolute` inside #game, never `fixed`).
  expect(
    await button.evaluate(
      (node) => getComputedStyle(node.closest('.ao-corner-bar') as Element).position,
    ),
  ).toBe('absolute');
  expect(await banner.evaluate((node) => getComputedStyle(node).position)).toBe('absolute');
  const game = await page.locator('#game').boundingBox();
  if (!game) throw new Error('#game has no box');
  for (const locator of [button, banner]) {
    const box = await locator.boundingBox();
    if (!box) throw new Error('no box');
    expect(box.x).toBeGreaterThanOrEqual(game.x);
    expect(box.y).toBeGreaterThanOrEqual(game.y);
    expect(box.x + box.width).toBeLessThanOrEqual(game.x + game.width);
    expect(box.y + box.height).toBeLessThanOrEqual(game.y + game.height);
  }
});

test('13. clicking a Tech Lead opens its terminal, empty space minimizes, external ones open the dialog', async ({
  page,
}) => {
  // Simulated desktop bridge: records what the scene asks the shell to do.
  await page.addInitScript(() => {
    const calls: string[] = [];
    const open = new Set(['term-1']);
    (window as unknown as Record<string, unknown>).__calls = calls;
    (window as unknown as Record<string, unknown>).__desktopActions = {
      openProjectPicker: () => {},
      openTerminal: (id: string) => {
        calls.push(`open:${id}`);
        return open.has(id);
      },
      collapseTerminal: () => calls.push('collapse'),
      openInVSCode: async () => {},
    };
  });
  await openOffice(page, daemon.url);
  const hook = async (body: Record<string, unknown>) => {
    const response = await fetch(`${daemon.url}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(204);
  };
  await hook({
    hook_event_name: 'SessionStart',
    session_id: 'internal-1',
    cwd: '/work/inside',
    terminalId: 'term-1',
  });
  await hook({ hook_event_name: 'SessionStart', session_id: 'external-1', cwd: '/work/outside' });
  await hook({
    hook_event_name: 'SessionStart',
    session_id: 'closed-1',
    cwd: '/work/closed',
    terminalId: 'term-gone',
  });
  await expect.poll(async () => (await characters(page)).length).toBe(3);
  await expect
    .poll(async () => (await characters(page)).every((c) => c.phase === 'at-desk'), {
      timeout: 30_000,
    })
    .toBe(true);

  const calls = () => page.evaluate(() => (window as unknown as { __calls: string[] }).__calls);
  const clickOn = async (id: string) => {
    // Bring the camera next to the character, then click on the point it really has on screen.
    await page.evaluate((cid) => window.__office?.actions?.approachCharacter(cid), id);
    const viewport = page.viewportSize();
    let point: { x: number; y: number } | undefined;
    await expect
      .poll(
        async () => {
          point = await page.evaluate((cid) => window.__office?.actions?.clientPointOf(cid), id);
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
  };
  const dialogOpen = () => page.evaluate(() => window.__office?.dialog.open === true);

  await clickOn('internal-1');
  await expect.poll(calls).toEqual(['open:term-1']);
  expect(await dialogOpen()).toBe(false);

  // A click on the empty floor minimizes.
  await page.mouse.click(3, 3);
  await expect.poll(calls).toEqual(['open:term-1', 'collapse']);

  // An external Tech Lead only opens its dialog (no terminal call).
  await clickOn('external-1');
  await expect.poll(dialogOpen).toBe(true);
  expect(await calls()).toEqual(['open:term-1', 'collapse']);

  // With the dialog open a click only dismisses it: no minimize.
  await page.keyboard.press('Escape');
  await expect.poll(dialogOpen).toBe(false);
  await clickOn('external-1');
  await expect.poll(dialogOpen).toBe(true);
  await page.mouse.click(3, 3);
  expect(await calls()).toEqual(['open:term-1', 'collapse']);
  await page.keyboard.press('Escape');

  // A closed tab falls back to the dialog.
  await clickOn('closed-1');
  await expect.poll(dialogOpen).toBe(true);
  expect(await calls()).toEqual(['open:term-1', 'collapse', 'open:term-gone']);
});

test('14. terminal dock: left, right and bottom resize #game, keep controls inside it and persist', async ({
  page,
}) => {
  // Every dock switch and drag resizes the canvas, which headless software rendering draws slowly.
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    const noop = async () => {};
    const status = {
      path: '/tmp/settings.json',
      total: 1,
      installedCount: 0,
      events: [{ event: 'Stop', installed: false }],
    };
    (window as unknown as Record<string, unknown>).agentsOfficeDesktop = {
      desktop: true,
      hooks: { status: async () => status },
      projects: { list: async () => [], sessions: async () => [], markUsed: noop },
      terminal: {
        start: async () => ({ ok: false, code: 'spawn-failed', message: 'fake' }),
        write: noop,
        resize: noop,
        kill: noop,
        list: async () => [
          {
            id: 'fake-1',
            cwd: '/work/dock',
            pid: 1,
            startedAt: new Date().toISOString(),
            cols: 80,
            rows: 24,
          },
        ],
        buffer: async () => 'hello dock\r\n',
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
  await page.setViewportSize({ width: 1200, height: 800 });
  await openOffice(page, daemon.url);
  await expect(page.getByTestId('terminal-panel')).toBeVisible();

  const rect = async (selector: string) => {
    const box = await page.locator(selector).boundingBox();
    if (!box) throw new Error(`no box for ${selector}`);
    return box;
  };
  const inside = (
    inner: { x: number; y: number; width: number; height: number },
    outer: typeof inner,
  ) =>
    inner.x >= outer.x - 0.5 &&
    inner.y >= outer.y - 0.5 &&
    inner.x + inner.width <= outer.x + outer.width + 0.5 &&
    inner.y + inner.height <= outer.y + outer.height + 0.5;
  const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  const checkControls = async () => {
    const panel = await rect('#ao-terminal');
    const game = await rect('#game');
    expect(overlaps(panel, game)).toBe(false);
    for (const id of ['hooks-open', 'picker-open', 'zoom-in']) {
      const locator = page.getByTestId(id);
      await expect(locator).toBeVisible();
      expect(await locator.evaluate((node) => !!node.closest('#game'))).toBe(true);
      const box = await rect(`[data-testid="${id}"]`);
      expect(inside(box, game)).toBe(true);
      expect(overlaps(box, panel)).toBe(false);
    }
  };

  const bottomGame = await rect('#game');
  expect(bottomGame.width).toBe(1200);
  await checkControls();

  await page.getByTestId('terminal-dock-left').click();
  await expect.poll(async () => (await rect('#game')).width).toBeLessThan(1200);
  let game = await rect('#game');
  let panel = await rect('#ao-terminal');
  expect(game.height).toBe(800);
  expect(panel.x).toBe(0);
  expect(game.x).toBeCloseTo(panel.width, 0);
  await checkControls();

  // Dragging the right edge resizes the panel.
  const before = panel.width;
  // The 6px resizer lives inside the panel edge; a press outside it hits the canvas (minimizes).
  await page.mouse.move(panel.x + panel.width - 3, 400);
  await page.mouse.down();
  await page.mouse.move(panel.x + panel.width - 3 + 100, 400, { steps: 4 });
  await page.mouse.up();
  await expect.poll(async () => (await rect('#ao-terminal')).width).toBeCloseTo(before + 100, -1);
  await checkControls();

  await page.getByTestId('terminal-dock-right').click();
  await expect.poll(async () => (await rect('#ao-terminal')).x).toBeGreaterThan(300);
  game = await rect('#game');
  panel = await rect('#ao-terminal');
  expect(game.x).toBe(0);
  expect(panel.x + panel.width).toBeCloseTo(1200, 0);
  await checkControls();

  // The shortcut keeps working on the sides: minimizes to a thin strip, expands back.
  const expanded = panel.width;
  await page.getByTestId('terminal-toggle').click();
  await expect.poll(async () => (await rect('#ao-terminal')).width).toBeLessThan(40);
  await checkControls();
  await page.getByTestId('terminal-toggle').click();
  await expect.poll(async () => (await rect('#ao-terminal')).width).toBeCloseTo(expanded, 0);

  // Reopening the app keeps dock and size.
  await page.reload();
  await page.waitForFunction(() => window.__office?.connected === true);
  await expect(page.getByTestId('terminal-panel')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__terminalPanel?.dock)).toBe('right');
  expect((await rect('#ao-terminal')).width).toBeCloseTo(expanded, 0);

  await page.getByTestId('terminal-dock-bottom').click();
  await expect.poll(async () => (await rect('#game')).width).toBe(1200);
  expect((await rect('#game')).height).toBeLessThan(800);
  await checkControls();
});

test('15. resizing the window resizes the canvas at most once per change and ignores equal sizes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openOffice(page, daemon.url);
  const resizes = () => page.evaluate(() => window.__office?.resizes ?? 0);
  const screenWidth = () => page.evaluate(() => window.__office?.ui.screen.width ?? 0);
  const before = await resizes();

  // A real change: the game size follows the window, with exactly one canvas resize.
  await page.setViewportSize({ width: 1600, height: 900 });
  await expect.poll(resizes).toBe(before + 1);
  const wide = await screenWidth();

  // Same size again (and a burst of resize events with no change): the canvas is not touched.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) window.dispatchEvent(new Event('resize'));
  });
  await page.waitForTimeout(200);
  expect(await resizes()).toBe(before + 1);
  expect(await screenWidth()).toBe(wide);

  // Another change, with events fired in the same frame: still one resize.
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect.poll(resizes).toBe(before + 2);
  await page.waitForTimeout(200);
  expect(await resizes()).toBe(before + 2);
  expect(await screenWidth()).not.toBe(wide);
});

type DesktopActions = {
  __desktopActions?: { collapseTerminal(): void; openTerminal(id: string): boolean };
};

test('16. minimizing and opening the terminal resize the canvas at most once and focus the xterm', async ({
  page,
}) => {
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
            cwd: '/work/focus',
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
  await page.setViewportSize({ width: 1200, height: 800 });
  await openOffice(page, daemon.url);
  await expect(page.getByTestId('terminal-panel')).toBeVisible();
  const resizes = () => page.evaluate(() => window.__office?.resizes ?? 0);
  await page.waitForTimeout(300);

  // Minimize (what a click on empty floor does): exactly one canvas resize.
  let before = await resizes();
  await page.evaluate(() =>
    (window as unknown as DesktopActions).__desktopActions?.collapseTerminal(),
  );
  await expect.poll(() => page.evaluate(() => window.__terminalPanel?.collapsed)).toBe(true);
  await expect.poll(resizes).toBe(before + 1);
  await page.waitForTimeout(300);
  expect(await resizes()).toBe(before + 1);

  // Open (what a click on a Tech Lead does): one resize and the keyboard goes to the terminal.
  before = await resizes();
  await page.evaluate(() =>
    (window as unknown as DesktopActions).__desktopActions?.openTerminal('fake-1'),
  );
  await expect.poll(() => page.evaluate(() => window.__terminalPanel?.collapsed)).toBe(false);
  await expect.poll(resizes).toBe(before + 1);
  await page.waitForTimeout(300);
  expect(await resizes()).toBe(before + 1);
  await expect.poll(() => page.evaluate(() => window.__terminalPanel?.keyboard)).toBe('terminal');
  expect(
    await page.evaluate(() => document.activeElement?.classList.contains('xterm-helper-textarea')),
  ).toBe(true);
});

test('17. the room door opens for the player walking through it and closes once they walk away', async ({
  page,
}) => {
  await openOffice(page, daemon.url);
  const feeder = createFeeder(daemon.projectsDir, FIXTURE);
  feeder.next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
  const roomId = await page.evaluate(() => window.__office?.rooms[0]?.id ?? '');
  expect(roomId).not.toBe('');
  const door = () => page.evaluate((id) => window.__office?.doors[id], roomId);
  const player = () =>
    page.evaluate(() => window.__office?.player ?? { x: 0, y: 0, facing: '', moving: false });
  // The Tech Lead walked in through the door: wait until it shut behind them.
  await expect.poll(door, { timeout: 20_000 }).toBe('closed');

  // Every rendered frame: the player's row and the door, to check the door is open while the
  // player is inside its opening (the 3 wall rows down to the room's first row).
  await page.evaluate(() => {
    const w = window as unknown as { __doorSamples: { y: number; door?: string }[] };
    w.__doorSamples = [];
    const sample = () => {
      const office = window.__office;
      const id = office?.rooms[0]?.id ?? '';
      w.__doorSamples.push({ y: office?.player.y ?? 0, door: office?.doors[id] });
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

  expect(await page.evaluate((id) => window.__office?.actions?.approachDoor(id), roomId)).toBe(
    true,
  );
  await expect.poll(async () => (await player()).moving).toBe(false);
  const outside = await player();
  // Walk in: from the corridor through the 3 wall rows into the room's first row.
  await holdUntil(page, 'ArrowDown', 'y', outside.y + 4);
  expect(await door()).toBe('open');
  await shot(page, '17-1-inside-the-room');
  // Samples taken while the player was inside the opening (strictly before the boundary tile).
  const crossingSamples = async () =>
    (
      await page.evaluate(
        () =>
          (window as unknown as { __doorSamples: { y: number; door?: string }[] }).__doorSamples,
      )
    ).filter((s) => s.y >= outside.y + 1 && s.y <= outside.y + 4);
  const crossing = await crossingSamples();
  expect(crossing.length).toBeGreaterThan(0);
  expect(crossing.filter((s) => s.door !== 'open')).toEqual([]);

  // Walk back out to the corridor and away from the door: it closes. The door is checked on every
  // frame: after the key is released the player may already be walking out of its reach, so its
  // state at one instant afterwards is a race.
  await holdUntil(page, 'ArrowUp', 'y', outside.y);
  expect((await crossingSamples()).filter((s) => s.door !== 'open')).toEqual([]);
  await expect.poll(async () => (await player()).moving).toBe(false);
  await holdUntil(page, 'ArrowLeft', 'x', outside.x - 3);
  await expect.poll(door, { timeout: 5_000 }).toBe('closed');
});

/**
 * Holds the arrow `key` until the player's `axis` reaches `target` (walking that way), checked on
 * every rendered frame (expect.poll is too coarse: the player walks a tile every 200 ms).
 */
async function holdUntil(
  page: import('@playwright/test').Page,
  key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft',
  axis: 'x' | 'y',
  target: number,
): Promise<void> {
  const forward = key === 'ArrowDown';
  await page.keyboard.down(key);
  try {
    await page.waitForFunction(
      ({ axis, target, forward }) => {
        const value = window.__office?.player[axis];
        if (value === undefined) return false;
        return forward ? value >= target : value <= target;
      },
      { axis, target, forward },
      { polling: 'raf', timeout: 30_000 },
    );
  } finally {
    await page.keyboard.up(key);
  }
}

test('update banner: hidden without bridge, follows available/ready, Depois dismisses', async ({
  page,
}) => {
  await openOffice(page, daemon.url);
  await expect(page.getByTestId('update-banner')).toHaveCount(0);

  const withBridge = await page.context().newPage();
  await withBridge.addInitScript(() => {
    type Listener = (state: unknown) => void;
    const listeners: Listener[] = [];
    const w = window as unknown as Record<string, unknown>;
    w.__installs = 0;
    w.__pushUpdate = (state: unknown) => {
      for (const l of listeners) l(state);
    };
    w.agentsOfficeDesktop = {
      desktop: true,
      updater: {
        getState: async () => ({ state: 'idle' }),
        checkNow: async () => ({ state: 'idle' }),
        install: async () => {
          (w.__installs as number)++;
          return true;
        },
        onStatus: (l: Listener) => {
          listeners.push(l);
          return () => listeners.splice(listeners.indexOf(l), 1);
        },
      },
    };
  });
  await openOffice(withBridge, daemon.url);
  const banner = withBridge.getByTestId('update-banner');
  const push = (state: unknown) =>
    withBridge.evaluate(
      (s) => (window as unknown as { __pushUpdate(s: unknown): void }).__pushUpdate(s),
      state,
    );
  await expect(banner).toBeHidden();
  await push({ state: 'available', version: '9.9.9' });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText('New version 9.9.9 available - downloading…');
  expect(await banner.evaluate((n) => !!n.closest('#game'))).toBe(true);
  await push({ state: 'ready', version: '9.9.9' });
  await withBridge.getByTestId('update-install').click();
  expect(
    await withBridge.evaluate(() => (window as unknown as { __installs: number }).__installs),
  ).toBe(1);
  await withBridge.getByTestId('update-later').click();
  await expect(banner).toBeHidden();
  await push({ state: 'ready', version: '10.0.0' });
  await expect(banner).toBeVisible();
});

test('message visit: the sender walks to the recipient desk and only goes back with the reply', async ({
  page,
}) => {
  // Simulated shell: two managed Tech Leads of the same project and a comms event feeder.
  await page.addInitScript(() => {
    const sessions = [
      ['term-a', 'entry-a', 'Ana'],
      ['term-b', 'entry-b', 'Beto'],
    ].map(([terminalId, entryId, name]) => ({
      terminalId,
      cwd: '/work/team',
      entryId,
      name,
      appearance: null,
      profession: 'developer',
      startedAt: '2026-01-01T00:00:00Z',
    }));
    type Listener = (event: unknown) => void;
    const listeners: Listener[] = [];
    (window as unknown as Record<string, unknown>).__emitComm = (event: unknown) => {
      for (const l of [...listeners]) l(event);
    };
    const noop = async () => {};
    (window as unknown as Record<string, unknown>).agentsOfficeDesktop = {
      desktop: true,
      // The managed sessions are only bound once the terminal panel exists (it needs this bridge).
      terminal: {
        start: async () => ({ ok: false, code: 'spawn-failed', message: 'fake' }),
        write: noop,
        resize: noop,
        kill: noop,
        list: async () => [],
        buffer: async () => '',
        getConfig: async () => ({}),
        setConfig: async () => ({ ok: true }),
        lostSessions: async () => [],
        dismissLost: noop,
        noteSession: noop,
        onData: () => () => {},
        onExit: () => () => {},
      },
      managed: {
        list: async () => ({ sessions, failures: [] }),
        onChange: () => () => {},
        onReopen: () => () => {},
        reopenReport: async () => null,
      },
      comms: {
        history: async () => [],
        onEvent: (l: Listener) => {
          listeners.push(l);
          return () => listeners.splice(listeners.indexOf(l), 1);
        },
      },
    };
  });
  await openOffice(page, daemon.url);
  for (const [id, terminalId] of [
    ['lead-a', 'term-a'],
    ['lead-b', 'term-b'],
  ]) {
    const response = await fetch(`${daemon.url}/hook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        hook_event_name: 'SessionStart',
        session_id: id,
        cwd: '/work/team',
        terminalId,
      }),
    });
    expect(response.status).toBe(204);
  }
  await expect
    .poll(
      async () => {
        const all = await characters(page);
        return all.length === 2 && all.every((c) => c.phase === 'at-desk');
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  const message = (extra: Record<string, unknown> = {}) => ({
    id: 'm1',
    cwd: '/work/team',
    fromEntryId: 'entry-a',
    fromName: 'Ana',
    toEntryId: 'entry-b',
    toName: 'Beto',
    text: 'Pode revisar o PR 42?',
    status: 'na-fila',
    createdAt: '2026-01-01T00:00:00Z',
    ...extra,
  });
  const emit = (type: string, extra: Record<string, unknown> = {}) =>
    page.evaluate(
      (event) => (window as unknown as { __emitComm(e: unknown): void }).__emitComm(event),
      { type, message: message(extra), at: '2026-01-01T00:00:01Z' },
    );
  const phaseOf = async (id: string) => (await characters(page)).find((c) => c.id === id)?.phase;
  const lead = async (id: string) => (await characters(page)).find((c) => c.id === id);

  await emit('iniciada');
  await expect.poll(() => phaseOf('lead-a'), { timeout: 30_000 }).toBe('visiting');
  expect(await phaseOf('lead-b')).toBe('at-desk');
  // Next to the recipient, not on top of it.
  const a = await lead('lead-a');
  const b = await lead('lead-b');
  await expect
    .poll(
      async () => {
        const [pa, pb] = [await lead('lead-a'), await lead('lead-b')];
        return Math.abs((pa?.x ?? 0) - (pb?.x ?? 0)) + Math.abs((pa?.y ?? 0) - (pb?.y ?? 0));
      },
      // Headless software rendering walks slowly (see test 2).
      { timeout: 45_000 },
    )
    .toBeLessThanOrEqual(2);
  expect(a && b && (a.x !== b.x || a.y !== b.y)).toBe(true);

  // Delivery alone does not send the sender back.
  await emit('entregue', { status: 'entregue' });
  await page.waitForTimeout(1500);
  expect(await phaseOf('lead-a')).toBe('visiting');

  await emit('respondida', { status: 'respondida' });
  await expect.poll(() => phaseOf('lead-a'), { timeout: 30_000 }).toBe('at-desk');
});

test('language button: opens in English, switches to PT and persists after reload', async ({
  page,
}) => {
  await openOffice(page, daemon.url);
  const button = page.getByTestId('locale-open');
  await expect(button).toBeVisible();
  await expect(button).toHaveText('EN');
  expect(await button.evaluate((node) => !!node.closest('#game'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');

  await button.click();
  await expect(page.getByTestId('locale-option-en')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('locale-menu')).toBeHidden();

  await button.click();
  await Promise.all([page.waitForEvent('load'), page.getByTestId('locale-option-pt-BR').click()]);
  await expect(page.getByTestId('locale-open')).toHaveText('PT');
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('pt-BR');
});

test('language switch: EN by default, PT and ES apply to the Hooks panel and persist after reload', async ({
  page,
}) => {
  // Each language change reloads the page and redraws the canvas, slow in headless software rendering.
  test.setTimeout(240_000);
  // The Hooks panel needs the desktop bridge; a stub is enough to render it in the browser.
  await page.addInitScript(() => {
    const status = {
      path: '/tmp/settings.json',
      total: 1,
      installedCount: 0,
      events: [{ event: 'Stop', installed: false }],
    };
    (window as unknown as Record<string, unknown>).agentsOfficeDesktop = {
      desktop: true,
      hooks: { status: async () => status },
    };
  });

  // Phrases that only exist in one language (taken from the dictionaries, same keys everywhere).
  const phrases = {
    en: ['Claude Code hooks', 'Install hooks', 'Remove hooks', 'No hooks installed'],
    'pt-BR': ['Hooks do Claude Code', 'Instalar hooks', 'Remover hooks', 'Nenhum hook instalado'],
    es: ['Hooks de Claude Code', 'Instalar hooks', 'Quitar hooks', 'Ningún hook instalado'],
  } as const;
  type Code = keyof typeof phrases;
  const shortLabel: Record<Code, string> = { en: 'EN', 'pt-BR': 'PT', es: 'ES' };

  const expectHooksIn = async (code: Code) => {
    await expect(page.getByTestId('locale-open')).toHaveText(shortLabel[code]);
    expect(await page.evaluate(() => document.documentElement.lang)).toBe(code);
    // English is the default: nothing stored yet, or an explicit "en" after choosing it.
    const stored = await page.evaluate(() => localStorage.getItem('agents-office.locale'));
    expect(code === 'en' ? [null, 'en'] : [code]).toContain(stored);
    await page.getByTestId('hooks-open').click();
    const panel = page.getByTestId('hooks-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('hooks-install')).toBeVisible();
    const text = await panel.innerText();
    for (const phrase of phrases[code]) expect(text).toContain(phrase);
    // Nothing from the other languages (only phrases that differ from this language's own).
    for (const other of Object.keys(phrases) as Code[]) {
      if (other === code) continue;
      for (const phrase of phrases[other]) {
        if (!phrases[code].includes(phrase as never)) expect(text).not.toContain(phrase);
      }
    }
    await page.getByTestId('hooks-close').click();
    await expect(panel).toBeHidden();
  };

  const choose = async (code: Code) => {
    await page.getByTestId('locale-open').click();
    await Promise.all([
      page.waitForEvent('load'),
      page.getByTestId(`locale-option-${code}`).click(),
    ]);
    await page.waitForFunction(() => window.__office?.connected === true);
  };

  await openOffice(page, daemon.url);
  await expectHooksIn('en');

  await choose('pt-BR');
  await expectHooksIn('pt-BR');
  await page.reload();
  await page.waitForFunction(() => window.__office?.connected === true);
  await expectHooksIn('pt-BR');

  await choose('es');
  await expectHooksIn('es');
  await page.reload();
  await page.waitForFunction(() => window.__office?.connected === true);
  await expectHooksIn('es');

  await choose('en');
  await expectHooksIn('en');
});
