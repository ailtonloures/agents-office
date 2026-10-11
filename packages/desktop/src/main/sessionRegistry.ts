import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LostTerminalSession, TerminalSessionInfo } from '@agents-office/shared';
import { TERMINAL_PERMISSION_MODES } from '@agents-office/shared';

interface Stored {
  active: LostTerminalSession[];
  lost: LostTerminalSession[];
}

function parseEntry(raw: unknown): LostTerminalSession | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.id !== 'string' || typeof e.cwd !== 'string' || typeof e.startedAt !== 'string') {
    return null;
  }
  const mode = TERMINAL_PERMISSION_MODES.find((m) => m === e.permissionMode);
  return {
    id: e.id,
    cwd: e.cwd,
    startedAt: e.startedAt,
    ...(mode ? { permissionMode: mode } : {}),
    ...(typeof e.claudeSessionId === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(e.claudeSessionId)
      ? { claudeSessionId: e.claudeSessionId }
      : {}),
  };
}

/**
 * Light record of the sessions the app started (`<userData>/sessions.json`). A session is there
 * while its process runs and leaves when it ends; whatever a previous run left behind (crash,
 * `kill -9`, system shutdown) is "lost" on the next start and is offered for resuming.
 */
export class SessionRegistry {
  private active = new Map<string, LostTerminalSession>();
  private lost: LostTerminalSession[];
  private keepOnExit = false;

  constructor(private readonly path: string) {
    let stored: Partial<Stored> = {};
    try {
      stored = JSON.parse(readFileSync(path, 'utf8')) as Partial<Stored>;
    } catch {
      // First run or unreadable: nothing to recover.
    }
    const parse = (list: unknown): LostTerminalSession[] =>
      Array.isArray(list)
        ? list.map(parseEntry).filter((e): e is LostTerminalSession => e !== null)
        : [];
    const seen = new Set<string>();
    // Entries still "active" in the file belong to a process that no longer exists.
    this.lost = [...parse(stored.lost), ...parse(stored.active)].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
    this.persist();
  }

  lostSessions(): LostTerminalSession[] {
    return this.lost.map((e) => ({ ...e }));
  }

  dismissLost(id: string): void {
    const before = this.lost.length;
    this.lost = this.lost.filter((e) => e.id !== id);
    if (this.lost.length !== before) this.persist();
  }

  add(info: Pick<TerminalSessionInfo, 'id' | 'cwd' | 'startedAt' | 'permissionMode'>): void {
    this.active.set(info.id, {
      id: info.id,
      cwd: info.cwd,
      startedAt: info.startedAt,
      ...(info.permissionMode ? { permissionMode: info.permissionMode } : {}),
    });
    this.persist();
  }

  bind(id: string, claudeSessionId: string): void {
    const entry = this.active.get(id);
    if (!entry || entry.claudeSessionId === claudeSessionId) return;
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(claudeSessionId)) return;
    entry.claudeSessionId = claudeSessionId;
    this.persist();
  }

  /** The process ended on its own or by the user's choice: nothing to recover. */
  remove(id: string): void {
    if (this.keepOnExit) return;
    if (this.active.delete(id)) this.persist();
  }

  /** The app is shutting down with the system: the sessions it ends stay recoverable. */
  keepOnExitFromNow(): void {
    this.keepOnExit = true;
  }

  private persist(): void {
    const data: Stored = { active: [...this.active.values()], lost: this.lost };
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp`;
      writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
      renameSync(tmp, this.path);
    } catch {
      // Recovery is best effort; failing to write must never break a session.
    }
  }
}

interface ManagerLike {
  onStart(listener: (info: TerminalSessionInfo) => void): unknown;
  onExit(listener: (event: { id: string }) => void): unknown;
}

/** Keeps the registry in step with a session manager. */
export function attachRegistry(manager: ManagerLike, registry: SessionRegistry): void {
  manager.onStart((info) => registry.add(info));
  manager.onExit(({ id }) => registry.remove(id));
}
