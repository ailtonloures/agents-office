import type { DaemonStatus } from './daemonProcess';
import type { PermissionNotice } from './permissionWatcher';
import type { UpdateState } from './updater';

export interface WindowLike {
  show(): void;
  hide(): void;
  focus(): void;
  isVisible(): boolean;
  isFocused(): boolean;
  isMinimized(): boolean;
  restore(): void;
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): unknown;
}

export type MenuItemModel =
  | { label: string; enabled?: boolean; click?: () => void }
  | { type: 'separator' };

export interface TrayLike {
  setToolTip(text: string): void;
  setMenu(items: MenuItemModel[]): void;
  setPending(pending: number): void;
}

export interface ShellDeps {
  window: WindowLike;
  tray: TrayLike;
  /** Shows the system notification of request `notice.id`; `onClick` brings the window forward. */
  notify(notice: PermissionNotice, onClick: () => void): void;
  /** Closes the system notification of request `id` (no-op when none is shown). */
  dismiss(id: string): void;
  /** Asks the app to quit (`app.quit()`). */
  quit(): void;
  /** Tray "Verificar atualizações"; the item is left out when absent. */
  checkUpdates?(): void;
  /** Tray "Reiniciar para atualizar" (shown only once an update is ready). */
  installUpdate?(): void;
}

export function daemonStatusLabel(status: DaemonStatus): string {
  switch (status.state) {
    case 'idle':
    case 'stopped':
      return 'Daemon: parado';
    case 'starting':
      return 'Daemon: iniciando...';
    case 'running':
      return `Daemon: ativo na porta ${status.port}`;
    case 'external':
      return `Daemon: externo na porta ${status.port}`;
    case 'port-busy':
      return `Daemon: porta ${status.port} ocupada`;
    case 'restarting':
      return `Daemon: reiniciando (tentativa ${status.attempt})...`;
    case 'failed':
      return 'Daemon: falhou';
  }
}

/** Window / tray state machine of the app (no Electron: everything arrives through `ShellDeps`). */
export class Shell {
  private quitting = false;
  private pending = 0;
  private daemon: DaemonStatus = { state: 'idle' };
  private update: UpdateState = { state: 'idle' };

  constructor(private readonly deps: ShellDeps) {
    deps.window.on('close', (event) => {
      // Closing the window only hides it (tray); the daemon keeps serving the hooks.
      if (this.quitting) return;
      event.preventDefault();
      deps.window.hide();
      this.refresh();
    });
    this.refresh();
  }

  get isQuitting(): boolean {
    return this.quitting;
  }

  showWindow(): void {
    const { window } = this.deps;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    this.refresh();
  }

  /** A second launch of the app was attempted: bring the existing window forward. */
  onSecondInstance(): void {
    this.showWindow();
  }

  /** "Sair": lets the window close for real and asks the app to quit. */
  requestQuit(): void {
    this.quitting = true;
    this.deps.quit();
  }

  /** The app is quitting by another path (before-quit, Cmd+Q): never hide the window again. */
  markQuitting(): void {
    this.quitting = true;
  }

  /** The user declined the exit confirmation: closing the window hides it again. */
  cancelQuit(): void {
    this.quitting = false;
  }

  setDaemon(status: DaemonStatus): void {
    this.daemon = status;
    this.refresh();
  }

  setUpdate(state: UpdateState): void {
    this.update = state;
    this.refresh();
  }

  setPending(pending: number): void {
    this.pending = pending;
    this.refresh();
  }

  /** Notifies only when the user is not looking at the window. */
  onPermissionNotice(notice: PermissionNotice): void {
    const { window } = this.deps;
    if (window.isVisible() && window.isFocused()) return;
    this.deps.notify(notice, () => this.showWindow());
  }

  /** Requests resolved (in the terminal, by a snapshot or a lost connection): take their notices down. */
  onPermissionResolved(ids: readonly string[]): void {
    for (const id of ids) this.deps.dismiss(id);
  }

  private updateItems(): MenuItemModel[] {
    const { checkUpdates, installUpdate } = this.deps;
    const items: MenuItemModel[] = [];
    if (this.update.state === 'ready' && installUpdate) {
      items.push({ label: 'Reiniciar para atualizar', click: () => installUpdate() });
    }
    if (checkUpdates) {
      items.push({
        label: 'Verificar atualizações',
        enabled: this.update.state !== 'checking' && this.update.state !== 'downloading',
        click: () => checkUpdates(),
      });
    }
    if (items.length > 0) items.push({ type: 'separator' });
    return items;
  }

  private refresh(): void {
    const { tray } = this.deps;
    tray.setPending(this.pending);
    tray.setToolTip(
      this.pending > 0 ? `Agents Office - ${this.pending} pedido(s) de permissão` : 'Agents Office',
    );
    tray.setMenu([
      { label: 'Mostrar', click: () => this.showWindow() },
      { label: daemonStatusLabel(this.daemon), enabled: false },
      ...(this.pending > 0
        ? [{ label: `${this.pending} pedido(s) pendente(s)`, enabled: false }]
        : []),
      { type: 'separator' as const },
      ...this.updateItems(),
      { label: 'Sair', click: () => this.requestQuit() },
    ]);
  }
}
