import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFixture } from '../../packages/daemon/test/helpers/fixtures';

export interface Feeder {
  /** Total number of steps (one transcript line or `.meta.json`). */
  readonly total: number;
  readonly remaining: number;
  /** Writes the next `count` steps (default 1), as Claude Code would append them. */
  next(count?: number): void;
  /** Writes steps until `predicate(line)` matches one (that line included). */
  until(predicate: (record: Record<string, unknown>) => boolean): void;
  /** Writes everything that is left, `delayMs` apart. */
  rest(delayMs?: number): Promise<void>;
}

/**
 * Replays a daemon test fixture (`packages/daemon/test/fixtures/<name>`) into a projects dir
 * incrementally. The same loader as the daemon tests orders the lines by their original
 * timestamps; every line is then re-stamped with the current time so the liveness rules (idle /
 * expiry) see a live session.
 */
export function createFeeder(projectsDir: string, fixtureName: string): Feeder {
  const { info, inputs } = loadFixture(fixtureName);
  const slugDir = join(projectsDir, info.projectSlug);
  const subagentsDir = join(slugDir, info.sessionId, 'subagents');
  mkdirSync(subagentsDir, { recursive: true });
  let index = 0;

  const write = (): Record<string, unknown> | undefined => {
    const input = inputs[index];
    index += 1;
    if (!input) return undefined;
    if (input.kind === 'agent-meta') {
      writeFileSync(
        join(subagentsDir, `agent-${input.agentId}.meta.json`),
        JSON.stringify(input.meta),
      );
      return undefined;
    }
    if (input.kind !== 'session-line' && input.kind !== 'agent-line') return undefined;
    const record = JSON.parse(input.line) as Record<string, unknown>;
    if (typeof record.timestamp === 'string') record.timestamp = new Date().toISOString();
    const file =
      input.kind === 'session-line'
        ? join(slugDir, `${info.sessionId}.jsonl`)
        : join(subagentsDir, `agent-${input.agentId}.jsonl`);
    appendFileSync(file, `${JSON.stringify(record)}\n`);
    return record;
  };

  return {
    total: inputs.length,
    get remaining() {
      return inputs.length - index;
    },
    next(count = 1) {
      for (let i = 0; i < count && index < inputs.length; i += 1) write();
    },
    until(predicate) {
      while (index < inputs.length) {
        const record = write();
        if (record && predicate(record)) return;
      }
    },
    async rest(delayMs = 120) {
      while (index < inputs.length) {
        write();
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    },
  };
}

export { loadFixture };
