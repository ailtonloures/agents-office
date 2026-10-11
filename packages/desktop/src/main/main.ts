import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  shell as electronShell,
  ipcMain,
  Menu,
  Notification,
  nativeImage,
  powerMonitor,
  Tray,
  utilityProcess,
} from 'electron';
import { spawn as spawnPty } from 'node-pty';
import { AppConfigStore } from './appConfig';
import { BinaryResolver, realIsExecutable, realRunShell } from './binaries';
import { resolveDaemonEntry } from './daemonEntry';
import { type ChildLike, DaemonController, type DaemonStatus } from './daemonProcess';
import { errorPageUrl } from './errorPage';
import { registerExternalIpc } from './externalIpc';
import { EditorPathStore, realIsDirectory, realRun } from './externalOpener';
import { HOOKS_CHANNELS } from './hooksChannels';
import {
  buildDesktopHookCommand,
  createHooksService,
  defaultSettingsPath,
  isTrustedSender,
} from './hooksService';
import { registerTerminalIpc } from './ipc';
import { classifyNavigation } from './navigation';
import { PermissionWatcher } from './permissionWatcher';
import { probeHealth, resolvePort } from './probe';
import { ProjectCatalog } from './projectCatalog';
import { registerProjectsIpc } from './projectsIpc';
import { buildQuitPrompt, QuitCoordinator } from './quitFlow';
import { SessionManager } from './sessionManager';
import { attachRegistry, SessionRegistry } from './sessionRegistry';
import { Shell, type TrayLike } from './shell';
import { renderTrayIcon } from './trayIcon';

// Lets tests (and portable setups) isolate the single-instance lock and the profile.
if (process.env.AGENTS_OFFICE_USER_DATA) {
  app.setPath('userData', process.env.AGENTS_OFFICE_USER_DATA);
}

function trayImage(pending: number): Electron.NativeImage {
  const icon = renderTrayIcon(pending);
  return nativeImage.createFromBitmap(icon.bitmap, { width: icon.width, height: icon.height });
}

/**
 * Minimal application menu. Its "Sair" entry (Cmd+Q on macOS, Ctrl+Q elsewhere) is the keyboard
 * route to the same interactive quit as the tray; `edit` keeps copy/paste working in the UI.
 */
function buildAppMenu(onQuit: () => void): Menu {
  const quitItem: Electron.MenuItemConstructorOptions = {
    id: 'quit',
    label: 'Sair',
    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
    click: onQuit,
  };
  return Menu.buildFromTemplate([
    process.platform === 'darwin'
      ? {
          label: app.name,
          submenu: [
            { role: 'about' },
            { type: 'separator' },
            { role: 'hide' },
            { role: 'hideOthers' },
            { role: 'unhide' },
            { type: 'separator' },
            quitItem,
          ],
        }
      : { label: 'Arquivo', submenu: [quitItem] },
    { role: 'editMenu' },
  ]);
}

function main(): void {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  const port = resolvePort(process.env);
  const origin = `http://127.0.0.1:${port}`;
  let window: BrowserWindow | undefined;
  let shellState: Shell | undefined;
  let watcher: PermissionWatcher | undefined;
  let tray: Tray | undefined;
  let showingApp = false;
  let quitDone = false;
  let interactiveQuit = false;
  const quitInteractively = (): void => {
    interactiveQuit = true;
    app.quit();
  };

  const entry = resolveDaemonEntry({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    repoRoot: join(app.getAppPath(), '..', '..'),
    exists: existsSync,
    env: process.env,
  });

  const controller = new DaemonController({
    port,
    fork: (args) =>
      utilityProcess.fork(entry, args, {
        stdio: 'pipe',
        serviceName: 'agents-office-daemon',
        env: { ...process.env, AGENTS_OFFICE_PORT: String(port) },
      }) as unknown as ChildLike,
    probe: (p) => probeHealth(p, (url, init) => fetch(url, init)),
    log: (line) => console.log(`[daemon] ${line}`),
  });

  const hooks = createHooksService({
    settingsPath: defaultSettingsPath(),
    command: buildDesktopHookCommand({
      platform: process.platform,
      execPath: process.execPath,
      entry,
      port,
    }),
    health: async () => {
      try {
        const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
        return response.ok ? ((await response.json()) as { hooksSeenAt?: string }) : null;
      } catch {
        return null;
      }
    },
  });
  const trusted = (event: Electron.IpcMainInvokeEvent): void => {
    const fromWindow = window !== undefined && event.sender === window.webContents;
    if (!fromWindow || !isTrustedSender(event.senderFrame?.url, origin)) {
      throw new Error('Untrusted sender.');
    }
  };
  ipcMain.handle(HOOKS_CHANNELS.status, (event) => {
    trusted(event);
    return hooks.status();
  });
  ipcMain.handle(HOOKS_CHANNELS.preview, (event, action: unknown) => {
    trusted(event);
    if (action !== 'install' && action !== 'uninstall') throw new Error('Invalid hooks action.');
    return hooks.preview(action);
  });
  ipcMain.handle(HOOKS_CHANNELS.install, (event) => {
    trusted(event);
    return hooks.install();
  });
  ipcMain.handle(HOOKS_CHANNELS.uninstall, (event) => {
    trusted(event);
    return hooks.uninstall();
  });

  const config = new AppConfigStore(join(app.getPath('userData'), 'config.json'));
  const resolver = new BinaryResolver({
    env: process.env,
    platform: process.platform,
    homedir: homedir(),
    isExecutable: realIsExecutable,
    runShell: realRunShell,
  });
  const sessions = new SessionManager({
    spawn: (file, args, options) => spawnPty(file, args, { name: 'xterm-256color', ...options }),
    resolveClaude: () => resolver.resolveClaude(config.get().claudePath),
    maxSessions: () => config.get().maxSessions,
    // The pty child is a session leader: its group holds everything it spawned.
    killGroup: (pid, signal) => {
      if (process.platform !== 'win32' && pid > 1) process.kill(-pid, signal);
    },
  });
  // Light record of the app's sessions: what a dead app leaves behind is offered for resuming.
  const registry = new SessionRegistry(join(app.getPath('userData'), 'sessions.json'));
  attachRegistry(sessions, registry);
  registerTerminalIpc({
    registry,
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    manager: sessions,
    config,
    resolver,
    isExecutable: realIsExecutable,
    trusted,
    target: () => window?.webContents,
  });

  const catalog = new ProjectCatalog({
    storePath: join(app.getPath('userData'), 'projects.json'),
    projectsDir: process.env.AGENTS_OFFICE_PROJECTS_DIR ?? join(homedir(), '.claude', 'projects'),
  });
  registerProjectsIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    catalog,
    trusted,
    pickFolder: async () => {
      const options: Electron.OpenDialogOptions = {
        title: 'Escolher a pasta do projeto',
        properties: ['openDirectory', 'createDirectory'],
      };
      const result = window
        ? await dialog.showOpenDialog(window, options)
        : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  });

  registerExternalIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    opener: {
      env: process.env,
      platform: process.platform,
      homedir: homedir(),
      isExecutable: realIsExecutable,
      isDirectory: realIsDirectory,
      loginPath: () => resolver.resolveLoginPath(),
      run: realRun,
    },
    store: new EditorPathStore(join(app.getPath('userData'), 'editor.json')),
    trusted,
  });

  const notify = (title: string, body: string, onClick?: () => void): void => {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title, body });
    if (onClick) notification.on('click', onClick);
    notification.show();
  };

  const trayAdapter: TrayLike = {
    setToolTip: (text) => tray?.setToolTip(text),
    setMenu: (items) => tray?.setContextMenu(Menu.buildFromTemplate(items)),
    setPending: (pending) => tray?.setImage(trayImage(pending)),
  };

  const createWindow = (): BrowserWindow => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      title: 'Agents Office',
      backgroundColor: '#1b1d2a',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    const guard = (event: { preventDefault(): void }, url: string): void => {
      const action = classifyNavigation(url, origin);
      if (action === 'allow') return;
      event.preventDefault();
      if (action === 'open-external') void electronShell.openExternal(url);
    };
    win.webContents.on('will-navigate', guard);
    win.webContents.on('will-redirect', guard);
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (classifyNavigation(url, origin) === 'open-external') void electronShell.openExternal(url);
      return { action: 'deny' };
    });
    return win;
  };

  const showError = (title: string, message: string): void => {
    showingApp = false;
    void window?.loadURL(errorPageUrl(title, message));
  };

  const startWatcher = (): PermissionWatcher => {
    const w = new PermissionWatcher({
      url: `ws://127.0.0.1:${port}/stream?role=ui`,
      createSocket: (url) => new WebSocket(url) as never,
      onUpdate: (update) => {
        shellState?.setPending(update.pending);
        if (update.notice) shellState?.onPermissionNotice(update.notice);
      },
    });
    w.start();
    return w;
  };

  const onDaemonStatus = (status: DaemonStatus, previous: DaemonStatus): void => {
    shellState?.setDaemon(status);
    switch (status.state) {
      case 'running':
      case 'external':
        if (!showingApp) {
          showingApp = true;
          void window?.loadURL(`${origin}/`);
        }
        watcher ??= startWatcher();
        if (status.state === 'external' && previous.state !== 'external') {
          notify(
            'Conectado a um daemon existente',
            `Já há um agents-office na porta ${status.port} (v${status.version}). A aprovação de permissões pela interface depende dele.`,
          );
        }
        break;
      case 'port-busy':
        showError(
          `Porta ${status.port} ocupada`,
          `Outro programa usa a porta ${status.port}, então o Agents Office não consegue iniciar o daemon. Feche o outro programa ou defina AGENTS_OFFICE_PORT e abra o app de novo.`,
        );
        break;
      case 'restarting':
        notify('Daemon reiniciando', 'O daemon do Agents Office caiu e será reiniciado.');
        break;
      case 'failed':
        showError('O daemon não iniciou', status.reason);
        notify('O daemon do Agents Office falhou', status.reason);
        break;
      default:
        break;
    }
  };

  app.on('second-instance', () => shellState?.onSecondInstance());
  // The tray keeps the app alive when every window is closed.
  app.on('window-all-closed', () => {});
  app.on('activate', () => shellState?.showWindow());

  const quit = new QuitCoordinator({
    list: () => sessions.list(),
    confirm: async (active) => {
      const prompt = buildQuitPrompt(active, Date.now());
      const options: Electron.MessageBoxOptions = {
        type: 'warning',
        title: 'Agents Office',
        message: prompt.message,
        detail: prompt.detail,
        buttons: prompt.buttons,
        cancelId: prompt.cancelId,
        defaultId: prompt.defaultId,
        noLink: true,
      };
      const parent = window?.isVisible() ? window : undefined;
      const result = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options);
      return result.response === 1;
    },
    shutdown: async ({ keepRecoverable }) => {
      shellState?.markQuitting();
      if (keepRecoverable) registry.keepOnExitFromNow();
      watcher?.stop();
      await sessions.killAll();
      await controller.stop();
    },
    finish: () => {
      quitDone = true;
      tray?.destroy();
      app.quit();
    },
    cancelled: () => shellState?.cancelQuit(),
  });

  app.on('before-quit', (event) => {
    if (quitDone) return;
    // Ask (when sessions are alive), end the ptys, stop the child daemon, then quit for real.
    // Only the tray "Sair" (and Cmd+Q) are interactive: Chromium turns SIGTERM and the session
    // manager's logout into a plain `app.quit()` too (Node's `process.on('SIGTERM')` never runs in
    // Electron), so any quit nobody asked for through the UI takes the clean path without a dialog.
    event.preventDefault();
    const mode = interactiveQuit ? 'interactive' : 'forced';
    interactiveQuit = false;
    void quit.request(mode);
  });
  // Termination by signal or by the system (logout, shutdown): the same clean path, no dialog.
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
    process.on(signal, () => void quit.request('forced'));
  }

  void app.whenReady().then(() => {
    // 'shutdown' (Linux/macOS) is missing from Electron's typings.
    (powerMonitor as unknown as NodeJS.EventEmitter).on('shutdown', (event: Electron.Event) => {
      event.preventDefault();
      void quit.request('forced');
    });
    window = createWindow();
    Menu.setApplicationMenu(
      buildAppMenu(() => (shellState ? shellState.requestQuit() : quitInteractively())),
    );
    tray = new Tray(trayImage(0));
    shellState = new Shell({
      window,
      tray: trayAdapter,
      notify: (notice, onClick) => notify(notice.title, notice.body, onClick),
      quit: quitInteractively,
    });
    void window.loadURL(errorPageUrl('Agents Office', 'Iniciando o daemon...'));
    controller.onStatus(onDaemonStatus);
    void controller.start();
  });
}

main();
