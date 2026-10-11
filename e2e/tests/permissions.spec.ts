import { expect, type Page, test } from '@playwright/test';
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
const CWD = '/anon/projects/demo-app';

function hookPayload(event: string, extra: Record<string, unknown> = {}) {
  const { info } = loadFixture(FIXTURE);
  return {
    hook_event_name: event,
    session_id: info.sessionId,
    transcript_path: `${daemon.projectsDir}/${info.projectSlug}/${info.sessionId}.jsonl`,
    cwd: CWD,
    permission_mode: 'default',
    tool_name: 'Bash',
    tool_input: { command: 'pnpm test', description: 'Run the tests' },
    ...extra,
  };
}

/** Starts the long-poll of the PermissionRequest hook; the promise settles with the daemon's answer. */
function askPermission(extra: Record<string, unknown> = {}) {
  return fetch(`${daemon.url}/hook/permission`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(hookPayload('PermissionRequest', extra)),
  });
}

async function body(response: Response) {
  return response.status === 200 ? ((await response.json()) as unknown) : undefined;
}

const queueLength = (page: Page) =>
  page.evaluate(() => window.__office?.permissions.queue.length ?? 0);
const cardOpen = (page: Page) => page.evaluate(() => window.__office?.permissions.cardOpen);

/** An office with the Tech Lead in it, ready for permission requests. */
async function startOffice(page: Page): Promise<void> {
  await openOffice(page, daemon.url);
  createFeeder(daemon.projectsDir, FIXTURE).next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
}

test('permission 1. approving with Y answers the hook with allow and clears the card', async ({
  page,
}) => {
  await startOffice(page);
  expect(await cardOpen(page)).toBe(false);
  const answer = askPermission();

  await expect.poll(() => cardOpen(page)).toBe(true);
  await expect.poll(() => hudText(page)).toContain('! 1');
  const request = await page.evaluate(() => window.__office?.permissions.queue[0]);
  expect(request).toMatchObject({
    tool: 'Bash',
    inputSummary: expect.stringContaining('pnpm test'),
  });
  await page.waitForTimeout(600);
  await shot(page, 'perm-1-card');

  await page.keyboard.press('y');
  const response = await answer;
  expect(response.status).toBe(200);
  expect(await body(response)).toEqual({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } },
  });
  await expect.poll(() => cardOpen(page)).toBe(false);
  await expect.poll(() => hudText(page)).toContain('! 0');
});

test('permission 2. denying with N asks for a reason and sends it to Claude', async ({ page }) => {
  await startOffice(page);
  const answer = askPermission();
  await expect.poll(() => cardOpen(page)).toBe(true);

  await page.keyboard.press('n');
  await expect.poll(() => page.evaluate(() => window.__office?.permissions.typing)).toBe(true);
  await page.keyboard.type('use pnpm instead', { delay: 25 });
  await page.waitForTimeout(300);
  await shot(page, 'perm-2-reason');
  await page.keyboard.press('Enter');

  const response = await answer;
  expect(await body(response)).toEqual({
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: { behavior: 'deny', message: 'use pnpm instead' },
    },
  });
  await expect.poll(() => cardOpen(page)).toBe(false);
});

test('permission 3. leaving it to the terminal (T) dismisses the card with an empty answer', async ({
  page,
}) => {
  await startOffice(page);
  const answer = askPermission();
  await expect.poll(() => cardOpen(page)).toBe(true);
  await page.keyboard.press('t');
  const response = await answer;
  expect(response.status).toBe(204);
  await expect.poll(() => cardOpen(page)).toBe(false);
  await expect.poll(() => hudText(page)).toContain('! 0');
});

test('permission 4. a queue shows the oldest first and the HUD matches it', async ({ page }) => {
  await startOffice(page);
  const first = askPermission({ tool_input: { command: 'first command' } });
  await expect.poll(() => queueLength(page)).toBe(1);
  const second = askPermission({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.txt' } });
  await expect.poll(() => queueLength(page)).toBe(2);
  await expect.poll(() => hudText(page)).toContain('! 2');
  const ids = await page.evaluate(() => window.__office?.permissions.queue.map((r) => r.id) ?? []);
  await shot(page, 'perm-4-queue');

  // The debug action decides by id, like a click on the card would.
  expect(
    await page.evaluate(
      (id) => window.__office?.actions?.decidePermission(id, { behavior: 'allow' }),
      ids[0] as string,
    ),
  ).toBe(true);
  expect((await first).status).toBe(200);
  await expect.poll(() => hudText(page)).toContain('! 1');
  expect(await cardOpen(page)).toBe(true);
  expect(await page.evaluate(() => window.__office?.permissions.queue[0]?.tool)).toBe('Write');

  await page.keyboard.press('n');
  await page.keyboard.press('Enter'); // no reason: a plain deny
  const response = await second;
  expect(await body(response)).toEqual({
    hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny' } },
  });
  await expect.poll(() => queueLength(page)).toBe(0);
});

test('permission 5. an answer given in the terminal closes the card on its own', async ({
  page,
}) => {
  await startOffice(page);
  const answer = askPermission();
  await expect.poll(() => cardOpen(page)).toBe(true);

  // The user answered the terminal prompt: the tool ran and Claude Code reports PostToolUse.
  const post = await fetch(`${daemon.url}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      hookPayload('PostToolUse', { tool_use_id: 'toolu_x', tool_response: { stdout: 'ok' } }),
    ),
  });
  expect(post.status).toBe(204);
  expect((await answer).status).toBe(204);
  await expect.poll(() => cardOpen(page)).toBe(false);
  await expect.poll(() => hudText(page)).toContain('! 0');
});

test('permission 6. a second window opened later gets the pending request (snapshot)', async ({
  page,
  context,
}) => {
  await startOffice(page);
  const answer = askPermission();
  await expect.poll(() => cardOpen(page)).toBe(true);

  const other = await context.newPage();
  await openOffice(other, daemon.url);
  await expect.poll(() => cardOpen(other)).toBe(true);
  expect(await queueLength(other)).toBe(1);
  await other.keyboard.press('y');
  expect((await answer).status).toBe(200);
  // Both windows drop the card: the answering one at once, the other through permission.resolved.
  await expect.poll(() => cardOpen(page)).toBe(false);
  await expect.poll(() => cardOpen(other)).toBe(false);
});
