import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type MenuItemModel, Shell } from '../src/main/shell';
import {
  type AutoUpdaterLike,
  CHECK_INTERVAL_MS,
  createUpdateService,
  FIRST_CHECK_DELAY_MS,
  type UpdateState,
} from '../src/main/updater';
import { UPDATER_CHANNELS } from '../src/main/updaterChannels';
import { createUpdateStatusPusher, registerUpdaterIpc } from '../src/main/updaterIpc';

type Listener = (arg?: never) => void;

class FakeUpdater implements AutoUpdaterLike {
  autoDownload = false;
  autoInstallOnAppQuit = false;
  listeners = new Map<string, Listener[]>();
  check = vi.fn<() => Promise<unknown>>(async () => undefined);
  quitAndInstall = vi.fn();
  on(event: string, listener: unknown): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener as Listener]);
    return this;
  }
  checkForUpdates(): Promise<unknown> {
    return this.check();
  }
  fire(event: string, arg?: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(arg as never);
  }
}

function setup(options: { isPackaged?: boolean; isAppImage?: boolean } = {}) {
  const autoUpdater = new FakeUpdater();
  const emitted: UpdateState[] = [];
  const service = createUpdateService({
    autoUpdater,
    isPackaged: options.isPackaged ?? true,
    isAppImage: options.isAppImage ?? true,
    emit: (state) => emitted.push(state),
    now: () => 1000,
  });
  return { autoUpdater, emitted, service };
}

describe('createUpdateService', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    { isPackaged: false, isAppImage: true },
    { isPackaged: true, isAppImage: false },
  ])('is a no-op when %o', async (options) => {
    const { autoUpdater, emitted, service } = setup(options);
    service.start();
    vi.advanceTimersByTime(CHECK_INTERVAL_MS * 2);
    expect(service.enabled).toBe(false);
    expect(await service.checkNow()).toEqual({ state: 'idle' });
    expect(service.install()).toBe(false);
    expect(autoUpdater.check).not.toHaveBeenCalled();
    expect(autoUpdater.listeners.size).toBe(0);
    expect(emitted).toEqual([]);
  });

  it('configures download and install on quit, checks after 15 s and every 4 h', () => {
    const { autoUpdater, service } = setup();
    expect(autoUpdater.autoDownload).toBe(true);
    expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
    service.start();
    vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS - 1);
    expect(autoUpdater.check).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(autoUpdater.check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    expect(autoUpdater.check).toHaveBeenCalledTimes(2);
    service.stop();
    vi.advanceTimersByTime(CHECK_INTERVAL_MS);
    expect(autoUpdater.check).toHaveBeenCalledTimes(2);
  });

  it('walks checking -> available -> downloading -> ready and installs', async () => {
    const { autoUpdater, emitted, service } = setup();
    autoUpdater.fire('checking-for-update');
    autoUpdater.fire('update-available', { version: '1.2.0' });
    autoUpdater.fire('download-progress', { percent: 41.6 });
    autoUpdater.fire('download-progress', { percent: 100 });
    expect(service.install()).toBe(false);
    autoUpdater.fire('update-downloaded', { version: '1.2.0' });
    expect(emitted).toEqual([
      { state: 'checking' },
      { state: 'available', version: '1.2.0' },
      { state: 'downloading', version: '1.2.0', percent: 42 },
      { state: 'downloading', version: '1.2.0', percent: 100 },
      { state: 'ready', version: '1.2.0' },
    ]);
    expect(service.getState()).toEqual({ state: 'ready', version: '1.2.0' });
    // A ready update is not asked about again.
    await service.checkNow();
    expect(autoUpdater.check).not.toHaveBeenCalled();
    expect(service.install()).toBe(true);
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('goes back to idle when already up to date and records the check time', async () => {
    const { autoUpdater, emitted, service } = setup();
    autoUpdater.check.mockImplementation(async () => {
      autoUpdater.fire('checking-for-update');
      autoUpdater.fire('update-not-available');
    });
    expect(service.lastCheckedAt()).toBeNull();
    expect(await service.checkNow()).toEqual({ state: 'idle' });
    expect(emitted).toEqual([{ state: 'checking' }, { state: 'idle' }]);
    expect(service.lastCheckedAt()).toBe(1000);
  });

  it('survives network failures (event and rejection) and retries on demand', async () => {
    const { autoUpdater, emitted, service } = setup();
    autoUpdater.check.mockImplementationOnce(async () => {
      autoUpdater.fire('checking-for-update');
      const error = new Error('net::ERR_INTERNET_DISCONNECTED');
      autoUpdater.fire('error', error);
      throw error;
    });
    expect(await service.checkNow()).toEqual({
      state: 'error',
      message: 'net::ERR_INTERNET_DISCONNECTED',
    });
    // 'error' event + rejection report once.
    expect(emitted.filter((s) => s.state === 'error')).toHaveLength(1);
    autoUpdater.check.mockRejectedValueOnce(new Error('boom'));
    expect(await service.checkNow()).toEqual({ state: 'error', message: 'boom' });
    autoUpdater.check.mockImplementationOnce(async () => {
      autoUpdater.fire('checking-for-update');
      autoUpdater.fire('update-not-available');
    });
    expect(await service.checkNow()).toEqual({ state: 'idle' });
  });

  it('does not stack checks while one is running or a download is in progress', async () => {
    const { autoUpdater, service } = setup();
    autoUpdater.fire('checking-for-update');
    await service.checkNow();
    autoUpdater.fire('download-progress', { percent: 10 });
    await service.checkNow();
    expect(autoUpdater.check).not.toHaveBeenCalled();
  });

  it('a late error does not knock a ready update out', () => {
    const { autoUpdater, service } = setup();
    autoUpdater.fire('update-downloaded', { version: '2.0.0' });
    autoUpdater.fire('error', new Error('late'));
    expect(service.getState()).toEqual({ state: 'ready', version: '2.0.0' });
  });
});

describe('registerUpdaterIpc', () => {
  type Handler = (event: { trusted: boolean }, ...args: unknown[]) => unknown;
  const handlers = new Map<string, Handler>();
  const service = {
    getState: vi.fn((): UpdateState => ({ state: 'idle' })),
    checkNow: vi.fn(async (): Promise<UpdateState> => ({ state: 'checking' })),
  };
  const install = vi.fn(() => true);

  beforeEach(() => {
    handlers.clear();
    install.mockClear();
    registerUpdaterIpc<{ trusted: boolean }>({
      ipcMain: { handle: (channel, listener) => handlers.set(channel, listener as Handler) },
      service,
      install,
      trusted: (event) => {
        if (!event.trusted) throw new Error('Untrusted sender.');
      },
    });
  });

  it('serves state, check and install to the trusted window', async () => {
    const call = (channel: string, ...args: unknown[]) =>
      handlers.get(channel)?.({ trusted: true }, ...args);
    expect(call(UPDATER_CHANNELS.getState)).toEqual({ state: 'idle' });
    expect(await call(UPDATER_CHANNELS.checkNow)).toEqual({ state: 'checking' });
    expect(call(UPDATER_CHANNELS.install)).toBe(true);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it('rejects untrusted senders and unexpected payloads', () => {
    for (const channel of [
      UPDATER_CHANNELS.getState,
      UPDATER_CHANNELS.checkNow,
      UPDATER_CHANNELS.install,
    ]) {
      expect(() => handlers.get(channel)?.({ trusted: false })).toThrow('Untrusted sender.');
      expect(() => handlers.get(channel)?.({ trusted: true }, 'x')).toThrow(
        'Invalid updater request.',
      );
    }
    expect(install).not.toHaveBeenCalled();
  });
});

describe('createUpdateStatusPusher', () => {
  it('sends the state to a live window only', () => {
    const send = vi.fn();
    const state: UpdateState = { state: 'ready', version: '1.0.1' };
    createUpdateStatusPusher(() => ({ send, isDestroyed: () => false }))(state);
    expect(send).toHaveBeenCalledWith(UPDATER_CHANNELS.status, state);
    createUpdateStatusPusher(() => ({ send, isDestroyed: () => true }))(state);
    createUpdateStatusPusher(() => undefined)(state);
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('Shell update items', () => {
  function shellWith(withUpdater: boolean) {
    const menus: MenuItemModel[][] = [];
    const checkUpdates = vi.fn();
    const installUpdate = vi.fn();
    const shell = new Shell({
      window: {
        show() {},
        hide() {},
        focus() {},
        isVisible: () => true,
        isFocused: () => true,
        isMinimized: () => false,
        restore() {},
        on() {},
      },
      tray: { setToolTip() {}, setMenu: (items) => menus.push(items), setPending() {} },
      notify() {},
      dismiss() {},
      quit() {},
      ...(withUpdater ? { checkUpdates, installUpdate } : {}),
    });
    const labels = () =>
      (menus.at(-1) ?? []).flatMap((entry) => ('label' in entry ? [entry.label] : []));
    const click = (label: string) =>
      (menus.at(-1) ?? []).forEach((entry) => {
        if ('label' in entry && entry.label === label) entry.click?.();
      });
    return { shell, labels, click, checkUpdates, installUpdate };
  }

  it('offers "Verificar atualizações" and, once ready, "Reiniciar para atualizar"', () => {
    const { shell, labels, click, checkUpdates, installUpdate } = shellWith(true);
    expect(labels()).toContain('Verificar atualizações');
    expect(labels()).not.toContain('Reiniciar para atualizar');
    click('Verificar atualizações');
    expect(checkUpdates).toHaveBeenCalledTimes(1);
    shell.setUpdate({ state: 'ready', version: '1.0.1' });
    expect(labels()).toContain('Reiniciar para atualizar');
    click('Reiniciar para atualizar');
    expect(installUpdate).toHaveBeenCalledTimes(1);
    shell.setUpdate({ state: 'idle' });
    expect(labels()).not.toContain('Reiniciar para atualizar');
  });

  it('shows no update items without an updater', () => {
    expect(shellWith(false).labels()).not.toContain('Verificar atualizações');
  });
});
