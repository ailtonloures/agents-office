import type { BrowserResult, BrowserState } from '@agents-office/shared';
import { z } from 'zod';
import { BROWSER_CHANNELS } from './browserChannels';
import { BrowserAddressError, type BrowserHost } from './browserHost';
import type { IpcMainLike } from './ipc';

const cwdSchema = z.string().min(1).max(4096);
const addressSchema = z.string().min(1).max(8192);
const boundsSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().min(0).max(20000),
    height: z.number().finite().min(0).max(20000),
  })
  .strict();

export interface BrowserIpcDeps<E> {
  ipcMain: IpcMainLike<E>;
  host: Pick<
    BrowserHost,
    | 'show'
    | 'setBounds'
    | 'hide'
    | 'navigate'
    | 'back'
    | 'forward'
    | 'reload'
    | 'clearData'
    | 'state'
  >;
  /** Throws unless the event comes from the office window served by our own daemon. */
  trusted(event: E): void;
  /** "Pausar agentes" switch (spec 083). */
  pause?: { set(cwd: string, paused: boolean): void };
  /** Element picker (spec 084). */
  picker?: { start(cwd: string): Promise<void>; cancel(cwd: string): Promise<void> };
  /** The state of a workspace browser, after the switch changed. */
  stateOf?(cwd: string): BrowserState;
}

/** Registers the embedded browser channels: sender checked, payloads parsed with zod. */
export function registerBrowserIpc<E>(deps: BrowserIpcDeps<E>): void {
  const { ipcMain, host } = deps;
  const run = async (action: () => unknown): Promise<BrowserResult> => {
    try {
      return { ok: true, state: (await action()) as never };
    } catch (error) {
      if (error instanceof z.ZodError) return { ok: false, message: 'Invalid request.' };
      if (error instanceof BrowserAddressError) return { ok: false, message: error.message };
      return { ok: false, message: 'The browser could not do that.' };
    }
  };
  ipcMain.handle(BROWSER_CHANNELS.show, (event, cwd, bounds) => {
    deps.trusted(event);
    return run(() => host.show(cwdSchema.parse(cwd), boundsSchema.parse(bounds)));
  });
  ipcMain.handle(BROWSER_CHANNELS.setBounds, (event, bounds) => {
    deps.trusted(event);
    const parsed = boundsSchema.safeParse(bounds);
    if (parsed.success) host.setBounds(parsed.data);
  });
  ipcMain.handle(BROWSER_CHANNELS.hide, (event) => {
    deps.trusted(event);
    host.hide();
  });
  ipcMain.handle(BROWSER_CHANNELS.navigate, (event, cwd, address) => {
    deps.trusted(event);
    return run(() => host.navigate(cwdSchema.parse(cwd), addressSchema.parse(address)));
  });
  ipcMain.handle(BROWSER_CHANNELS.back, (event, cwd) => {
    deps.trusted(event);
    return run(() => host.back(cwdSchema.parse(cwd)));
  });
  ipcMain.handle(BROWSER_CHANNELS.forward, (event, cwd) => {
    deps.trusted(event);
    return run(() => host.forward(cwdSchema.parse(cwd)));
  });
  ipcMain.handle(BROWSER_CHANNELS.reload, (event, cwd) => {
    deps.trusted(event);
    return run(() => host.reload(cwdSchema.parse(cwd)));
  });
  ipcMain.handle(BROWSER_CHANNELS.setPaused, (event, cwd, paused) => {
    deps.trusted(event);
    return run(() => {
      const key = cwdSchema.parse(cwd);
      const flag = z.boolean().parse(paused);
      if (!deps.pause || !deps.stateOf) throw new Error('unavailable');
      deps.pause.set(key, flag);
      return deps.stateOf(key);
    });
  });
  ipcMain.handle(BROWSER_CHANNELS.startPick, (event, cwd) => {
    deps.trusted(event);
    return run(async () => {
      const key = cwdSchema.parse(cwd);
      if (!deps.picker) throw new Error('unavailable');
      await deps.picker.start(key);
      return host.state(key);
    });
  });
  ipcMain.handle(BROWSER_CHANNELS.cancelPick, (event, cwd) => {
    deps.trusted(event);
    return run(async () => {
      const key = cwdSchema.parse(cwd);
      await deps.picker?.cancel(key);
      return host.state(key);
    });
  });
  ipcMain.handle(BROWSER_CHANNELS.clearData, (event, cwd) => {
    deps.trusted(event);
    return run(() => host.clearData(cwdSchema.parse(cwd)));
  });
}
