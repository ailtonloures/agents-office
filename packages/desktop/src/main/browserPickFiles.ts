import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const PICK_FILE_MAX_AGE_MS = 60 * 60_000;

/**
 * Saves picked-element captures as PNG files in `dir` (private to the user) so the agent can open
 * them by path. Captures older than an hour are deleted on every save.
 */
export function createPickScreenshotSaver(
  dir: string,
  now: () => number = Date.now,
): (base64: string) => Promise<string | undefined> {
  return async (base64) => {
    try {
      await mkdir(dir, { recursive: true, mode: 0o700 });
      for (const name of await readdir(dir)) {
        if (!name.endsWith('.png')) continue;
        const file = join(dir, name);
        const info = await stat(file).catch(() => undefined);
        if (info && now() - info.mtimeMs > PICK_FILE_MAX_AGE_MS) await rm(file, { force: true });
      }
      const file = join(dir, `pick-${randomUUID()}.png`);
      await writeFile(file, Buffer.from(base64, 'base64'), { mode: 0o600 });
      return file;
    } catch {
      return undefined;
    }
  };
}
