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
  await feeder.rest(100);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'agent').length, {
      timeout: 45_000,
    })
    .toBe(0);
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
  expect(text).toContain('Hall da Fama');
  expect(text).toContain('Map the');
  expect(text).toContain('Projeto: demo-app');
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
  await page.addInitScript(() => localStorage.removeItem('agents-office.zoom'));
  await openOffice(page, daemon.url);
  const zoomIn = page.getByTestId('zoom-in');
  const zoomOut = page.getByTestId('zoom-out');
  await expect(zoomIn).toBeVisible();
  expect(await zoomOf(page)).toBe(1);
  const before = await page.evaluate(() => window.__office?.player);

  await zoomIn.click();
  expect(await zoomOf(page)).toBe(1.25);
  await zoomOut.click();
  await zoomOut.click();
  expect(await zoomOf(page)).toBe(0.75);
  expect(await page.evaluate(() => window.__office?.player)).toEqual(before);

  for (let i = 0; i < 10; i++) if (await zoomIn.isEnabled()) await zoomIn.click();
  expect(await zoomOf(page)).toBe(3);
  await expect(zoomIn).toBeDisabled();
  await expect(zoomOut).toBeEnabled();
  for (let i = 0; i < 20; i++) if (await zoomOut.isEnabled()) await zoomOut.click();
  expect(await zoomOf(page)).toBe(0.5);
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
  await expect.poll(() => zoomOf(page)).toBe(1.25);
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
  expect(await zoomOf(page)).toBe(1.5);

  await page.reload();
  await page.waitForFunction(() => window.__office?.connected === true);
  await expect.poll(() => zoomOf(page)).toBe(1.5);

  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.__office?.overview)).toBe(true);
  await expect(page.getByTestId('zoom-in')).toBeHidden();
  expect(await zoomOf(page)).toBe(1.5);
  await page.keyboard.press('m');
  await expect.poll(() => page.evaluate(() => window.__office?.overview)).toBe(false);
  await expect(page.getByTestId('zoom-in')).toBeVisible();
  expect(await zoomOf(page)).toBe(1.5);
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
  await expect.poll(() => hudText(page)).toContain('1 agente ');
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
  await expect.poll(() => hudText(page)).toContain('1 agente ');
  const health = (await (await fetch(`${daemon.url}/health`)).json()) as { agents: number };
  expect(health.agents).toBe(1);
  await shot(page, '9-1-old-left-new-stays');
});

test('10. the HUD, the shortcuts and the dialog keep size and position at any zoom', async ({
  page,
}) => {
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
    for (let i = 0; i < 20 && (await zoomOf(page)) !== target; i++) await button.click();
    expect(await zoomOf(page)).toBe(target);
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

  for (const zoom of [0.5, 1, 3]) {
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
  await expect.poll(() => hudText(page)).toContain('0 sessões');

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
  await expect.poll(() => hudText(page)).toContain('2 sessões · 0 agentes');
  const health = (await (await fetch(`${daemon.url}/health`)).json()) as {
    sessions: number;
    agents: number;
  };
  expect(health).toMatchObject({ sessions: 2, agents: 0 });
  await shot(page, '11-no-unknown-room');
});
