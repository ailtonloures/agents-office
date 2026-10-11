export interface NotificationHandle {
  on(event: 'click', listener: () => void): unknown;
  show(): void;
  /** Absent or no-op on some platforms/servers (notably some Linux notification daemons). */
  close?(): void;
}

export interface NotificationOptions {
  title: string;
  body: string;
  /** Native close button label; only requested when programmatic closing is unavailable. */
  closeButtonText?: string;
}

export interface NotificationCenterDeps {
  isSupported(): boolean;
  create(options: NotificationOptions): NotificationHandle;
  /** Whether `close()` can be trusted to remove a shown notification on this platform. */
  canClose(): boolean;
}

export const CLOSE_BUTTON_TEXT = 'Fechar';

/**
 * Tracks the shown permission notifications by request id, so a request resolved in the terminal
 * can take its notification down. When closing programmatically is not supported, the
 * notification carries a native close button instead and falls back to the system timeout.
 */
export class NotificationCenter {
  private readonly shown = new Map<string, NotificationHandle>();

  constructor(private readonly deps: NotificationCenterDeps) {}

  get size(): number {
    return this.shown.size;
  }

  /** Shows a notification for request `id`; a repeated id replaces (closes) the previous one. */
  notifyPermission(id: string, title: string, body: string, onClick: () => void): void {
    if (!this.deps.isSupported()) return;
    this.dismiss(id);
    const options: NotificationOptions = this.deps.canClose()
      ? { title, body }
      : { title, body, closeButtonText: CLOSE_BUTTON_TEXT };
    const handle = this.deps.create(options);
    handle.on('click', onClick);
    this.shown.set(id, handle);
    handle.show();
  }

  /** Shows a one-off notification that is never dismissed programmatically. */
  notify(title: string, body: string, onClick?: () => void): void {
    if (!this.deps.isSupported()) return;
    const handle = this.deps.create({ title, body });
    if (onClick) handle.on('click', onClick);
    handle.show();
  }

  dismiss(id: string): void {
    const handle = this.shown.get(id);
    if (!handle) return;
    this.shown.delete(id);
    try {
      handle.close?.();
    } catch {
      // Closing is best effort: the native button / timeout still dismisses it.
    }
  }
}
