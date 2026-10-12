const keyOf = (cwd: string): string => cwd.replace(/[\\/]+$/, '') || cwd;

/** "Pausar agentes" switch of each workspace browser. In memory: a restart resumes (fail open on
 * a user convenience, but nothing is queued across restarts anyway). */
export class BrowserPause {
  private readonly paused = new Set<string>();

  constructor(private readonly onChange?: (cwd: string, paused: boolean) => void) {}

  isPaused(cwd: string): boolean {
    return this.paused.has(keyOf(cwd));
  }

  set(cwd: string, paused: boolean): void {
    const key = keyOf(cwd);
    if (this.paused.has(key) === paused) return;
    if (paused) this.paused.add(key);
    else this.paused.delete(key);
    this.onChange?.(cwd, paused);
  }
}

export const BROWSER_PAUSED_CODE = 'paused';
export const BROWSER_PAUSED_MESSAGE =
  'Pausado pelo usuário (paused by the user): the user stopped the agents from using this browser. Do not retry until the user says to continue.';
