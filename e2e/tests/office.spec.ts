import { expect, test } from '@playwright/test';
import { type RunningDaemon, startDaemon } from '../support/daemon';
import { createFeeder, loadFixture } from '../support/feeder';
import { characters, hudText, openOffice, shot } from '../support/office';

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
