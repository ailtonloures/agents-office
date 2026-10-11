import { describe, expect, it, vi } from 'vitest';
import { resolveDaemonEntry } from '../src/main/daemonEntry';
import { errorPageUrl } from '../src/main/errorPage';
import { classifyNavigation } from '../src/main/navigation';
import {
  PermissionTracker,
  PermissionWatcher,
  type SocketLike,
} from '../src/main/permissionWatcher';
import {
  daemonStatusLabel,
  type MenuItemModel,
  Shell,
  type TrayLike,
  type WindowLike,
} from '../src/main/shell';
import { renderTrayIcon } from '../src/main/trayIcon';

class FakeWindow implements WindowLike {
  visible = true;
  focused = true;
  minimized = false;
  calls: string[] = [];
  private closeListener: ((event: { preventDefault(): void }) => void) | undefined;
  show() {
    this.visible = true;
    this.calls.push('show');
  }
  hide() {
    this.visible = false;
    this.calls.push('hide');
  }
  focus() {
    this.focused = true;
    this.calls.push('focus');
  }
  isVisible() {
    return this.visible;
  }
  isFocused() {
    return this.visible && this.focused;
  }
  isMinimized() {
    return this.minimized;
  }
  restore() {
    this.minimized = false;
    this.calls.push('restore');
  }
  on(_event: 'close', listener: (event: { preventDefault(): void }) => void) {
    this.closeListener = listener;
  }
  /** Returns whether the close went through (not prevented). */
  userClose(): boolean {
    let prevented = false;
    this.closeListener?.({ preventDefault: () => (prevented = true) });
    return !prevented;
  }
}

function setup() {
  const window = new FakeWindow();
  const menus: MenuItemModel[][] = [];
  const tray: TrayLike & { tooltip: string; pending: number } = {
    tooltip: '',
    pending: 0,
    setToolTip(text) {
      this.tooltip = text;
    },
    setMenu(items) {
      menus.push(items);
    },
    setPending(pending) {
      this.pending = pending;
    },
  };
  const quit = vi.fn();
  const notify = vi.fn();
  const shell = new Shell({ window, tray, notify, quit });
  const menu = () => menus.at(-1) as MenuItemModel[];
  const item = (label: string) =>
    menu().find((entry) => 'label' in entry && entry.label.startsWith(label)) as Extract<
      MenuItemModel,
      { label: string }
    >;
  return { window, tray, shell, quit, notify, menu, item };
}

describe('Shell (window / tray state)', () => {
  it('closing the window hides it and keeps the app', () => {
    const { window, quit } = setup();
    expect(window.userClose()).toBe(false);
    expect(window.visible).toBe(false);
    expect(quit).not.toHaveBeenCalled();
  });

  it('"Sair" lets the window close for real and quits the app', () => {
    const { window, shell, quit, item } = setup();
    item('Sair').click?.();
    expect(quit).toHaveBeenCalledTimes(1);
    expect(shell.isQuitting).toBe(true);
    expect(window.userClose()).toBe(true);
  });

  it('markQuitting (app quitting by another path) also stops hiding', () => {
    const { window, shell } = setup();
    shell.markQuitting();
    expect(window.userClose()).toBe(true);
  });

  it('"Mostrar" and a second instance bring the window back (restoring a minimized one)', () => {
    const { window, shell, item } = setup();
    window.userClose();
    window.minimized = true;
    item('Mostrar').click?.();
    expect(window.calls.slice(-3)).toEqual(['restore', 'show', 'focus']);
    window.userClose();
    shell.onSecondInstance();
    expect(window.visible).toBe(true);
  });

  it('the tray menu shows the daemon status and the pending count', () => {
    const { shell, menu, item, tray } = setup();
    expect(menu().map((entry) => ('label' in entry ? entry.label : '---'))).toEqual([
      'Mostrar',
      'Daemon: parado',
      '---',
      'Sair',
    ]);
    shell.setDaemon({ state: 'running', port: 4777 });
    expect(item('Daemon').label).toBe('Daemon: ativo na porta 4777');
    expect(item('Daemon').enabled).toBe(false);
    shell.setPending(2);
    expect(item('2 pedido').enabled).toBe(false);
    expect(tray.pending).toBe(2);
    expect(tray.tooltip).toContain('2 pedido');
    shell.setPending(0);
    expect(tray.tooltip).toBe('Agents Office');
  });

  it('notifies a permission request only when the window is hidden or unfocused', () => {
    const { window, shell, notify } = setup();
    const notice = { id: 'p1', title: 'Pedido', body: 'Bash: ls' };
    shell.onPermissionNotice(notice);
    expect(notify).not.toHaveBeenCalled();

    window.focused = false;
    shell.onPermissionNotice(notice);
    expect(notify).toHaveBeenCalledTimes(1);

    window.focused = true;
    window.userClose();
    shell.onPermissionNotice(notice);
    expect(notify).toHaveBeenCalledTimes(2);

    // Clicking the notification brings the window forward.
    notify.mock.calls[1]?.[1]();
    expect(window.visible).toBe(true);
  });

  it('labels every daemon state', () => {
    expect(daemonStatusLabel({ state: 'external', port: 1, version: '1' })).toContain('externo');
    expect(daemonStatusLabel({ state: 'port-busy', port: 1 })).toContain('ocupada');
    expect(daemonStatusLabel({ state: 'restarting', port: 1, attempt: 2, delayMs: 1 })).toContain(
      '2',
    );
    expect(daemonStatusLabel({ state: 'failed', port: 1, reason: 'x' })).toContain('falhou');
    expect(daemonStatusLabel({ state: 'starting', port: 1 })).toContain('iniciando');
  });
});

const REQUEST = {
  id: 'perm-1',
  sessionId: 's1',
  actorId: 's1',
  tool: 'Bash',
  inputSummary: 'pnpm test',
  ts: '2026-10-10T10:00:00.000Z',
};

describe('PermissionTracker', () => {
  it('counts pending requests and yields a notice for a new one only', () => {
    const tracker = new PermissionTracker();
    const first = tracker.apply({ kind: 'permission.requested', request: REQUEST });
    expect(first.pending).toBe(1);
    expect(first.notice).toEqual({
      id: 'perm-1',
      title: 'Pedido de permissão do Claude Code',
      body: 'Bash: pnpm test',
    });
    expect(
      tracker.apply({ kind: 'permission.requested', request: REQUEST }).notice,
    ).toBeUndefined();
    expect(tracker.apply({ kind: 'permission.resolved', id: 'perm-1', by: 'ui' }).pending).toBe(0);
  });

  it('a snapshot replaces the set without notifying; junk is ignored', () => {
    const tracker = new PermissionTracker();
    const update = tracker.apply({ kind: 'permission.snapshot', pending: [REQUEST] });
    expect(update).toEqual({ pending: 1 });
    expect(tracker.apply({ nope: true })).toEqual({ pending: 1 });
    expect(tracker.apply('text')).toEqual({ pending: 1 });
    expect(tracker.apply({ kind: 'permission.snapshot', pending: [] })).toEqual({ pending: 0 });
  });

  it('uses just the tool name when there is no summary', () => {
    const tracker = new PermissionTracker();
    const update = tracker.apply({
      kind: 'permission.requested',
      request: { ...REQUEST, inputSummary: '  ' },
    });
    expect(update.notice?.body).toBe('Bash');
  });
});

class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  onerror: SocketLike['onerror'] = null;
  closed = false;
  close() {
    this.closed = true;
  }
}

describe('PermissionWatcher', () => {
  it('connects as a UI client, forwards updates and reconnects after a drop', () => {
    const sockets: FakeSocket[] = [];
    const urls: string[] = [];
    const updates: number[] = [];
    const timers: Array<() => void> = [];
    const watcher = new PermissionWatcher({
      url: 'ws://127.0.0.1:4777/stream?role=ui',
      createSocket: (url) => {
        urls.push(url);
        const socket = new FakeSocket();
        sockets.push(socket);
        return socket;
      },
      onUpdate: (update) => updates.push(update.pending),
      setTimer: (fn) => timers.push(fn),
    });
    watcher.start();
    expect(urls).toEqual(['ws://127.0.0.1:4777/stream?role=ui']);

    sockets[0]?.onmessage?.({
      data: JSON.stringify({ kind: 'permission.requested', request: REQUEST }),
    });
    sockets[0]?.onmessage?.({ data: 'not json' });
    expect(updates).toEqual([1]);

    sockets[0]?.onclose?.({});
    expect(updates).toEqual([1, 0]);
    timers.shift()?.();
    expect(sockets).toHaveLength(2);

    watcher.stop();
    expect(sockets[1]?.closed).toBe(true);
    sockets[1]?.onclose?.({});
    expect(timers).toHaveLength(0);
  });
});

describe('navigation, error page, tray icon, daemon entry', () => {
  const origin = 'http://127.0.0.1:4777';

  it('allows the app, opens web links externally and denies the rest', () => {
    expect(classifyNavigation('http://127.0.0.1:4777/x?y=1', origin)).toBe('allow');
    expect(classifyNavigation('https://example.com/', origin)).toBe('open-external');
    expect(classifyNavigation('http://127.0.0.1:9999/', origin)).toBe('open-external');
    expect(classifyNavigation('file:///etc/passwd', origin)).toBe('deny');
    expect(classifyNavigation('javascript:alert(1)', origin)).toBe('deny');
    expect(classifyNavigation('not a url', origin)).toBe('deny');
  });

  it('escapes the error page text', () => {
    const url = decodeURIComponent(errorPageUrl('<b>x</b>', 'a & "b"'));
    expect(url).not.toContain('<b>');
    expect(url).toContain('&#60;b&#62;');
    expect(url.startsWith('data:text/html')).toBe(true);
  });

  it('draws a different tray icon when requests are pending', () => {
    const idle = renderTrayIcon(0);
    const busy = renderTrayIcon(1);
    expect(idle.bitmap.length).toBe(32 * 32 * 4);
    expect(idle.bitmap.equals(busy.bitmap)).toBe(false);
    // The gold dot sits in the top-right quadrant only.
    const at = (icon: ReturnType<typeof renderTrayIcon>, x: number, y: number) => [
      ...icon.bitmap.subarray((y * 32 + x) * 4, (y * 32 + x) * 4 + 4),
    ];
    expect(at(busy, 24, 8)).toEqual([0x3d, 0xc8, 0xff, 255]);
    expect(at(idle, 24, 8)).not.toEqual(at(busy, 24, 8));
    expect(at(idle, 4, 28)).toEqual(at(busy, 4, 28));
  });

  it('resolves the daemon entry', () => {
    const base = { packaged: false, resourcesPath: '/res', repoRoot: '/repo', env: {} };
    expect(resolveDaemonEntry({ ...base, exists: () => true })).toBe(
      '/repo/packages/cli/bin/agents-office.mjs',
    );
    expect(resolveDaemonEntry({ ...base, exists: () => false })).toBe(
      '/repo/packages/daemon/bin/agents-office.mjs',
    );
    expect(resolveDaemonEntry({ ...base, packaged: true, exists: () => true })).toBe(
      '/res/daemon/bin/agents-office.mjs',
    );
    expect(
      resolveDaemonEntry({
        ...base,
        exists: () => true,
        env: { AGENTS_OFFICE_DAEMON_ENTRY: '/x.mjs' },
      }),
    ).toBe('/x.mjs');
  });
});
