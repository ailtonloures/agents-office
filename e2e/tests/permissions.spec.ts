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

/** The PermissionRequest hook is notify-only: the daemon registers the request and answers at once. */
function askPermission(extra: Record<string, unknown> = {}) {
  return fetch(`${daemon.url}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(hookPayload('PermissionRequest', extra)),
  });
}

/** What the terminal reports once the user answered there: the tool ran. */
function answerInTerminal(extra: Record<string, unknown> = {}) {
  return fetch(`${daemon.url}/hook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(
      hookPayload('PostToolUse', {
        tool_use_id: 'toolu_x',
        tool_response: { stdout: 'ok' },
        ...extra,
      }),
    ),
  });
}

const queueLength = (page: Page) =>
  page.evaluate(() => window.__office?.permissions.queue.length ?? 0);

/** The card is gone for good: the debug state no longer has any trace of it. */
const hasCardState = (page: Page) =>
  page.evaluate(() => {
    const permissions = window.__office?.permissions as Record<string, unknown> | undefined;
    return permissions ? 'cardOpen' in permissions || 'cardRect' in permissions : false;
  });

/** An office with the Tech Lead in it, ready for permission requests. */
async function startOffice(page: Page): Promise<void> {
  await openOffice(page, daemon.url);
  createFeeder(daemon.projectsDir, FIXTURE).next(4);
  await expect
    .poll(async () => (await characters(page)).filter((c) => c.role === 'lead').length)
    .toBe(1);
}

test('permission 1. a request shows the balloon counter and no card, and the hook returns at once', async ({
  page,
}) => {
  await startOffice(page);
  expect(await queueLength(page)).toBe(0);
  const response = await askPermission();
  expect(response.status).toBe(204);
  expect(await response.text()).toBe('');

  await expect.poll(() => queueLength(page)).toBe(1);
  await expect.poll(() => hudText(page)).toContain('! 1');
  const request = await page.evaluate(() => window.__office?.permissions.queue[0]);
  expect(request).toMatchObject({
    tool: 'Bash',
    inputSummary: expect.stringContaining('pnpm test'),
  });
  expect(await hasCardState(page)).toBe(false);
  await page.waitForTimeout(600);
  await shot(page, 'perm-1-request');

  // The old Y/N/T shortcuts do nothing: the request stays until the terminal answers.
  for (const key of ['y', 'n', 't']) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  expect(await queueLength(page)).toBe(1);
  await expect.poll(() => hudText(page)).toContain('! 1');
});

test('permission 2. an answer given in the terminal removes the request', async ({ page }) => {
  await startOffice(page);
  expect((await askPermission()).status).toBe(204);
  await expect.poll(() => queueLength(page)).toBe(1);

  expect((await answerInTerminal()).status).toBe(204);
  await expect.poll(() => queueLength(page)).toBe(0);
  await expect.poll(() => hudText(page)).toContain('! 0');
  await shot(page, 'perm-2-resolved');
});

test('permission 3. a queue counts every pending request, oldest first', async ({ page }) => {
  await startOffice(page);
  await askPermission({ tool_input: { command: 'first command' } });
  await expect.poll(() => queueLength(page)).toBe(1);
  await askPermission({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.txt' } });
  await expect.poll(() => queueLength(page)).toBe(2);
  await expect.poll(() => hudText(page)).toContain('! 2');
  const tools = await page.evaluate(
    () => window.__office?.permissions.queue.map((r) => r.tool) ?? [],
  );
  expect(tools).toEqual(['Bash', 'Write']);
  await shot(page, 'perm-3-queue');

  // Each tool result answers one request (the one with the same tool and input).
  await answerInTerminal({ tool_input: { command: 'first command' } });
  await expect.poll(() => queueLength(page)).toBe(1);
  await expect.poll(() => hudText(page)).toContain('! 1');
  await answerInTerminal({ tool_name: 'Write', tool_input: { file_path: '/tmp/x.txt' } });
  await expect.poll(() => queueLength(page)).toBe(0);
});

test('permission 4. a second window opened later gets the pending request (snapshot)', async ({
  page,
  context,
}) => {
  await startOffice(page);
  await askPermission();
  await expect.poll(() => queueLength(page)).toBe(1);

  const other = await context.newPage();
  await openOffice(other, daemon.url);
  await expect.poll(() => queueLength(other)).toBe(1);
  await expect.poll(() => hudText(other)).toContain('! 1');

  await answerInTerminal();
  await expect.poll(() => queueLength(page)).toBe(0);
  await expect.poll(() => queueLength(other)).toBe(0);
});
