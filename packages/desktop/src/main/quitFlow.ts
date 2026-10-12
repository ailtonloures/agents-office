import { basename } from 'node:path';

export interface QuitSession {
  id: string;
  cwd: string;
  startedAt: string;
}

export interface QuitPrompt {
  message: string;
  detail: string;
  buttons: [string, string];
  cancelId: 0;
  defaultId: 0;
}

/** "45 s", "12 min", "2 h 05 min". */
export function formatActiveTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Text of the native dialog that lists the sessions with an active process. */
export function buildQuitPrompt(sessions: QuitSession[], now: number): QuitPrompt {
  const count = sessions.length;
  const lines = sessions.map((s) => {
    const started = Date.parse(s.startedAt);
    const active = Number.isNaN(started) ? '' : ` - ativa há ${formatActiveTime(now - started)}`;
    return `${basename(s.cwd) || s.cwd}${active}`;
  });
  return {
    message:
      count === 1
        ? 'Há 1 sessão do Claude Code em andamento.'
        : `Há ${count} sessões do Claude Code em andamento.`,
    detail: `${lines.join('\n')}\n\nSair encerra ${count === 1 ? 'esse processo' : 'esses processos'}. Depois dá para retomar com --resume.`,
    buttons: ['Cancelar', 'Encerrar tudo'],
    cancelId: 0,
    defaultId: 0,
  };
}

export type QuitMode = 'interactive' | 'forced';

export interface QuitDeps {
  /** Sessions whose process is alive. */
  list(): QuitSession[];
  /** Shows the confirmation; true = "Encerrar tudo". */
  confirm(sessions: QuitSession[]): Promise<boolean>;
  /** Ends the ptys, then the daemon. `keepRecoverable`: the sessions stay offered for resuming. */
  shutdown(options: { keepRecoverable: boolean }): Promise<void>;
  /**
   * Really exits (`app.quit()` with the guard released). `install`: an update restart was asked,
   * so the exit is `quitAndInstall` instead (sessions and daemon are already down by then).
   */
  finish(options: { install: boolean }): void;
  /** The user declined. */
  cancelled(): void;
}

/**
 * Decides how the app quits. Interactive (tray "Sair", Cmd+Q): ask first when sessions are alive.
 * Forced (SIGTERM, system shutdown): same clean path, never a dialog. Re-entrant: several requests
 * while one is running share its outcome.
 */
export class QuitCoordinator {
  private running: Promise<'quit' | 'cancelled'> | undefined;
  private forced = false;
  private installOnQuit = false;

  constructor(private readonly deps: QuitDeps) {}

  /** `installOnQuit`: finish with the update installer (restart to update) instead of a plain quit. */
  request(
    mode: QuitMode,
    options: { installOnQuit?: boolean } = {},
  ): Promise<'quit' | 'cancelled'> {
    if (mode === 'forced') this.forced = true;
    if (options.installOnQuit) this.installOnQuit = true;
    this.running ??= this.run().finally(() => {
      this.running = undefined;
      this.forced = false;
      this.installOnQuit = false;
    });
    return this.running;
  }

  private async run(): Promise<'quit' | 'cancelled'> {
    const active = this.deps.list();
    if (active.length > 0 && !this.forced) {
      const confirmed = await this.deps.confirm(active);
      if (!confirmed && !this.forced) {
        this.deps.cancelled();
        return 'cancelled';
      }
    }
    await this.deps.shutdown({ keepRecoverable: this.forced });
    this.deps.finish({ install: this.installOnQuit });
    return 'quit';
  }
}
