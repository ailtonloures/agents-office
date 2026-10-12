import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { rosterEntryId } from '@agents-office/shared';
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
import { autoUpdater } from 'electron-updater';
import { spawn as spawnPty } from 'node-pty';
import { BoardTools, boardTools } from './agentBus/boardTools';
import { BrowserTools, browserTools } from './agentBus/browserTools';
import { CircuitBreaker } from './agentBus/circuitBreaker';
import { CommsLog } from './agentBus/commsLog';
import { OfficeIdleSource } from './agentBus/idleSource';
import { MessageQueue } from './agentBus/messageQueue';
import { Messaging, messagingTools } from './agentBus/messaging';
import { AgentBus } from './agentBus/server';
import { fileAuditStorage, SpawnAgents, spawnTools } from './agentBus/spawnAgent';
import { SpawnApprovals } from './agentBus/spawnApproval';
import { AppConfigStore } from './appConfig';
import { BinaryResolver, realIsExecutable, realRunShell } from './binaries';
import { registerBoardIpc } from './boardIpc';
import { LibraryStore } from './boardLibraries';
import { createMermaidRelay } from './boardMermaid';
import { BoardStore } from './boardStore';
import { BROWSER_APPROVAL_CHANNELS } from './browserApprovalChannels';
import { registerBrowserApprovalIpc } from './browserApprovalIpc';
import { BrowserApprovals } from './browserApprovals';
import { BROWSER_CHANNELS } from './browserChannels';
import { BrowserDriver } from './browserDriver';
import { createBrowserGuard } from './browserGuard';
import { BrowserHost } from './browserHost';
import { registerBrowserIpc } from './browserIpc';
import { BrowserPause } from './browserPause';
import { BrowserPicker } from './browserPicker';
import { createPickScreenshotSaver } from './browserPickFiles';
import { BrowserQueue } from './browserQueue';
import { createElectronBrowserViews } from './browserViews';
import { registerCommsIpc } from './commsIpc';
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
import { registerManagedIpc } from './managedIpc';
import { ManagedSessions } from './managedSessions';
import { classifyNavigation } from './navigation';
import { NotificationCenter } from './notificationCenter';
import { PermissionWatcher } from './permissionWatcher';
import { probeHealth, resolvePort } from './probe';
import { ProfileLibrary } from './profileLibrary';
import { registerProfilesIpc } from './profilesIpc';
import { ProjectCatalog } from './projectCatalog';
import { registerProjectsIpc } from './projectsIpc';
import { buildQuitPrompt, QuitCoordinator } from './quitFlow';
import { RosterStore } from './rosterStore';
import { SessionManager } from './sessionManager';
import { attachRegistry, SessionRegistry } from './sessionRegistry';
import { Shell, type TrayLike } from './shell';
import { SPAWN_APPROVAL_CHANNELS } from './spawnApprovalChannels';
import { registerSpawnApprovalIpc } from './spawnApprovalIpc';
import { renderTrayIcon } from './trayIcon';
import { createUpdateService, type UpdateService, type UpdateState } from './updater';
import { createUpdateStatusPusher, registerUpdaterIpc } from './updaterIpc';

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
function buildAppMenu(
  onQuit: () => void,
  update: { ready: boolean; check: () => void; install: () => void },
): Menu {
  const quitItem: Electron.MenuItemConstructorOptions = {
    id: 'quit',
    label: 'Sair',
    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
    click: onQuit,
  };
  const updateItems: Electron.MenuItemConstructorOptions[] = [
    ...(update.ready ? [{ label: 'Reiniciar para atualizar', click: update.install }] : []),
    { label: 'Verificar atualizações', click: update.check },
    { type: 'separator' },
  ];
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
            ...updateItems,
            quitItem,
          ],
        }
      : { label: 'Arquivo', submenu: [...updateItems, quitItem] },
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
  let updater: UpdateService | undefined;
  let updateState: UpdateState = { state: 'idle' };
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
  const rosterStore = new RosterStore(join(app.getPath('userData'), 'rosters.json'));
  const agentBus = new AgentBus({ roster: rosterStore });
  const sessions = new SessionManager({
    agentBus: {
      issue: (session) => (agentBus.listening ? agentBus.registerSession(session) : null),
      revoke: (sessionId) => agentBus.revokeSession(sessionId),
    },
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
    // Only real keystrokes count: focus reports and terminal replies start with ESC.
    onUserInput: (id, data) => {
      if (data.startsWith('\u001b')) return;
      const cwd = sessions.list().find((s) => s.id === id)?.cwd;
      if (cwd) messaging.userActivity(cwd);
    },
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

  const profileLibrary = new ProfileLibrary({
    dir: join(app.getPath('userData'), 'profiles'),
    usage: (id) => rosterStore.projectsUsing(id),
  });
  registerProfilesIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    library: profileLibrary,
    roster: rosterStore,
    audit: {
      history: (cwd) => spawnAgents.history(cwd),
      removedByUser: (cwd, entry) => spawnAgents.recordRemovedByUser(cwd, entry),
    },
    comms: {
      status: (cwd) => breaker.status(cwd),
      mute: (cwd, entryId, muted) => messaging.setMuted(cwd, entryId, muted),
      resume: (cwd) => messaging.resume(cwd),
      stop: (cwd) => messaging.stopConversations(cwd),
    },
    trusted,
  });

  const managedSessions = new ManagedSessions({
    host: sessions,
    library: profileLibrary,
    roster: rosterStore,
    maxSessions: () => config.get().maxSessions,
    liveCount: () => sessions.list().length,
    sessionEnd: {
      sessionIdOfTerminal: (terminalId) => idleSource.liveSessionIdOfTerminal(terminalId),
      post: async (event) => {
        await fetch(`${origin}/hook`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(event),
          signal: AbortSignal.timeout(1000),
        });
      },
    },
  });
  // Agent-to-agent messages (spec 068): in-memory queues, delivered to the pty of an idle agent.
  const idleSource = new OfficeIdleSource({ url: `${origin.replace(/^http/, 'ws')}/stream` });
  const breaker = new CircuitBreaker({
    onPause: (cwd, hops) => {
      const name = basename(cwd);
      notify(
        'Agents Office: conversa entre agentes pausada',
        `${hops} mensagens seguidas em "${name}" sem intervenção. Abra o app para continuar ou encerrar.`,
        () => shellState?.showWindow(),
      );
      void askPausedChoice(cwd, name, hops);
    },
  });
  const askPausedChoice = async (cwd: string, name: string, hops: number): Promise<void> => {
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      title: 'Agents Office',
      message: `Os agentes de "${name}" trocaram ${hops} mensagens seguidas sem intervenção.`,
      detail: 'As entregas estão pausadas. Continuar a conversa ou encerrá-la?',
      buttons: ['Continuar', 'Encerrar'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    };
    const parent = window?.isVisible() ? window : undefined;
    const result = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    // The user may have typed in the meantime, which already resumed the project.
    if (!breaker.isPaused(cwd)) return;
    if (result.response === 0) messaging.resume(cwd);
    else messaging.stopConversations(cwd);
  };
  const messageQueue = new MessageQueue();
  const commsLog = new CommsLog();
  commsLog.attach(messageQueue);
  const messaging = new Messaging({
    breaker,
    queue: messageQueue,
    idle: idleSource,
    write: (terminalId, data) => sessions.write(terminalId, data),
    directory: {
      entries: (cwd) =>
        rosterStore.get(cwd).entries.flatMap((entry) => {
          const entryId = rosterEntryId(entry);
          const name =
            entry.kind === 'inline' ? entry.name : profileLibrary.get(entry.profileId)?.name;
          return name ? [{ entryId, name }] : [];
        }),
      terminalOf: (cwd, entryId) =>
        managedSessions.list().sessions.find((s) => s.cwd === cwd && s.entryId === entryId)
          ?.terminalId ?? null,
      canTalk: (cwd, a, b) => rosterStore.canTalk(cwd, a, b),
    },
  });
  for (const tool of messagingTools(messaging)) agentBus.registerTool(tool);
  // Orchestrators create and dismiss agents (spec 072); each creation waits for the approval card
  // (spec 073) unless the user granted "allow without asking" to that orchestrator in the project.
  const spawnApprovals = new SpawnApprovals({
    path: join(app.getPath('userData'), 'spawn-approvals.json'),
    pushRequest: (request) => {
      const contents = window?.webContents;
      if (contents && !contents.isDestroyed())
        contents.send(SPAWN_APPROVAL_CHANNELS.request, request);
    },
    pushResolved: (id) => {
      const contents = window?.webContents;
      if (contents && !contents.isDestroyed()) contents.send(SPAWN_APPROVAL_CHANNELS.resolved, id);
    },
    notify: (request) =>
      notifications.notifyPermission(
        request.id,
        'Criar agente?',
        `${request.orchestratorName} quer criar "${request.name}".`,
        () => shellState?.showWindow(),
      ),
    dismissNotice: (id) => notifications.dismiss(id),
  });
  registerSpawnApprovalIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    approvals: spawnApprovals,
    trusted,
  });
  const spawnAgents = new SpawnAgents({
    roster: rosterStore,
    names: (cwd) =>
      rosterStore.get(cwd).entries.flatMap((entry) => {
        const name =
          entry.kind === 'inline' ? entry.name : profileLibrary.get(entry.profileId)?.name;
        return name ? [{ entryId: rosterEntryId(entry), name }] : [];
      }),
    sessions: {
      start: (cwd, entryId, task) => managedSessions.start(cwd, entryId, task),
      stop: (cwd, entryId) => managedSessions.stop(cwd, entryId),
    },
    approve: spawnApprovals.approve,
    auditStorage: fileAuditStorage(join(app.getPath('userData'), 'spawn-audit.json')),
  });
  for (const tool of spawnTools(spawnAgents)) agentBus.registerTool(tool);
  // Shared whiteboard (spec 075): one scene per project, drawn by agents through board_* tools.
  const boardStore = new BoardStore({ dir: join(app.getPath('userData'), 'boards') });
  // Shape libraries (.excalidrawlib, spec 079) live in the app's data folder.
  const libraryStore = new LibraryStore({ dir: join(app.getPath('userData'), 'board-libraries') });
  // Mermaid needs a DOM: the window converts it (spec 079); fails with `unavailable` without one.
  const mermaidRelay = createMermaidRelay({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    trusted,
    target: () => window?.webContents,
  });
  const agentDisplayName = (session: { cwd: string; entryId: string | null }): string => {
    const entry = rosterStore
      .get(session.cwd)
      .entries.find((candidate) => rosterEntryId(candidate) === session.entryId);
    if (!entry) return 'Agente';
    return (
      (entry.kind === 'inline' ? entry.name : profileLibrary.get(entry.profileId)?.name) ?? 'Agente'
    );
  };
  const boardAgentTools = new BoardTools({
    store: boardStore,
    libraries: libraryStore,
    mermaid: (definition) => mermaidRelay.convert(definition),
    authorName: (session) => agentDisplayName(session),
    approveClearAll: async ({ authorName }) => {
      const options = {
        type: 'question' as const,
        buttons: ['Limpar tudo', 'Cancelar'],
        defaultId: 1,
        cancelId: 1,
        title: 'Limpar o quadro',
        message: `${authorName} quer limpar o quadro inteiro.`,
        detail: 'Isso apaga também o que você e outros agentes desenharam.',
      };
      const parent = window && !window.isDestroyed() ? window : null;
      const result = parent
        ? await dialog.showMessageBox(parent, options)
        : await dialog.showMessageBox(options);
      return result.response === 0;
    },
  });
  for (const tool of boardTools(boardAgentTools)) agentBus.registerTool(tool);
  // Whiteboard overlay (spec 077): scene load/save from the window, agent drawings pushed to it.
  registerBoardIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    store: boardStore,
    libraries: libraryStore,
    trusted,
    target: () => window?.webContents,
  });
  // Embedded browser (spec 080): one view per workspace, shown as a dock tab of the window.
  // Agent actions on a browser are serialized per workspace; the window shows who is using it.
  const browserQueue = new BrowserQueue({ onChange: (cwd) => browserHost.notify(cwd) });
  // Confirmation cards (spec 083): downloads, site permissions and browser_eval wait for "Permitir".
  const browserApprovals = new BrowserApprovals({
    pushRequest: (request) => {
      const contents = window?.webContents;
      if (contents && !contents.isDestroyed())
        contents.send(BROWSER_APPROVAL_CHANNELS.request, request);
    },
    pushResolved: (id) => {
      const contents = window?.webContents;
      if (contents && !contents.isDestroyed())
        contents.send(BROWSER_APPROVAL_CHANNELS.resolved, id);
    },
    notify: (request) =>
      notifications.notifyPermission(request.id, 'Navegador', request.title, () =>
        shellState?.showWindow(),
      ),
    dismissNotice: (id) => notifications.dismiss(id),
  });
  // "Pausar agentes": the tools answer "paused by the user" and open cards are denied.
  const browserPause = new BrowserPause((cwd, paused) => {
    if (paused) browserApprovals.denyWorkspace(cwd);
    browserHost.notify(cwd);
  });
  registerBrowserApprovalIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    approvals: browserApprovals,
    trusted,
  });
  const browserHost: BrowserHost = new BrowserHost({
    createView: createElectronBrowserViews(() => window, createBrowserGuard(browserApprovals)),
    decorate: (state) => {
      const active = browserQueue.current(state.cwd);
      const queued = browserQueue.pending(state.cwd);
      const base = browserPause.isPaused(state.cwd) ? { ...state, paused: true } : state;
      return active
        ? { ...base, agent: active.actor.name, ...(queued > 0 ? { queued } : {}) }
        : base;
    },
    onState: (state) => {
      const target = window?.webContents;
      if (target && !target.isDestroyed()) target.send(BROWSER_CHANNELS.state, state);
    },
  });
  // Browser tools of the Agent Bus (spec 081): CDP driver behind the queue.
  const browserAgentTools = new BrowserTools({
    driver: new BrowserDriver({ host: browserHost }),
    queue: browserQueue,
    authorName: (session) => agentDisplayName(session),
    isPaused: (cwd) => browserPause.isPaused(cwd),
    confirmEval: (session, agentName, expression) =>
      browserApprovals.ask({
        cwd: session.cwd,
        kind: 'eval',
        title: `${agentName} quer executar JavaScript na página`,
        detail: expression.slice(0, 2000),
        agentName,
      }),
  });
  for (const tool of browserTools(browserAgentTools)) agentBus.registerTool(tool);
  // Element picker (spec 084): the user points at an element; the window reviews it before sending.
  const browserPicker = new BrowserPicker({
    host: browserHost,
    push: (event) => {
      const target = window?.webContents;
      if (target && !target.isDestroyed()) target.send(BROWSER_CHANNELS.pick, event);
    },
    saveScreenshot: createPickScreenshotSaver(join(app.getPath('userData'), 'browser-picks')),
  });
  registerBrowserIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    host: browserHost,
    picker: browserPicker,
    trusted,
    pause: browserPause,
    stateOf: (cwd) => browserHost.state(cwd),
  });
  messaging.start();
  idleSource.start();
  const messagingTimer = setInterval(() => messaging.flush(), 5000);
  messagingTimer.unref();

  registerCommsIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    log: commsLog,
    trusted,
    target: () => window?.webContents,
  });

  registerManagedIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    managed: managedSessions,
    trusted,
    target: () => window?.webContents,
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

  const notifications = new NotificationCenter({
    isSupported: () => Notification.isSupported(),
    create: (options) => new Notification(options),
    // Electron's close() is a no-op on some Linux notification servers: offer the native button.
    canClose: () => process.platform !== 'linux',
  });
  const notify = (title: string, body: string, onClick?: () => void): void =>
    notifications.notify(title, body, onClick);

  const pushUpdate = createUpdateStatusPusher(() => window?.webContents);
  // "Restart to update" goes through the same exit path as "Sair" (confirm if sessions are alive,
  // end ptys, stop the daemon) and only the last step differs: quitAndInstall instead of quit.
  const installUpdate = (): boolean => {
    if (updateState.state !== 'ready' || quitDone) return false;
    void quit.request('interactive', { installOnQuit: true });
    return true;
  };
  const checkUpdates = (): void => void updater?.checkNow();
  const applyAppMenu = (): void => {
    Menu.setApplicationMenu(
      buildAppMenu(() => (shellState ? shellState.requestQuit() : quitInteractively()), {
        ready: updateState.state === 'ready',
        check: checkUpdates,
        install: () => void installUpdate(),
      }),
    );
  };
  registerUpdaterIpc({
    ipcMain: { handle: (channel, listener) => ipcMain.handle(channel, listener) },
    // Before whenReady `updater` is not built yet: the window cannot exist either.
    service: {
      getState: () => updater?.getState() ?? { state: 'idle' },
      checkNow: async () => (await updater?.checkNow()) ?? { state: 'idle' },
    },
    install: installUpdate,
    trusted,
  });

  const trayAdapter: TrayLike = {
    setToolTip: (text) => tray?.setToolTip(text),
    setMenu: (items) => tray?.setContextMenu(Menu.buildFromTemplate(items)),
    setPending: (pending) => tray?.setImage(trayImage(pending)),
  };

  // Packaged builds get the icon from electron-builder; from the sources (dev) the window would
  // show Electron's default one, so point it at the committed resources/icon.png.
  const devIcon = join(__dirname, '..', 'resources', 'icon.png');
  const windowIcon = !app.isPackaged && existsSync(devIcon) ? devIcon : undefined;

  const createWindow = (): BrowserWindow => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 640,
      minHeight: 480,
      title: 'Agents Office',
      icon: windowIcon,
      backgroundColor: '#0d1020',
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
    // A reload of the page loses the dock tab that positions the browser view: hide it until the
    // renderer shows it again.
    win.webContents.on('did-start-navigation', (details) => {
      if (details.isMainFrame && !details.isSameDocument) browserHost.hide();
    });
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
        if (update.resolvedIds) shellState?.onPermissionResolved(update.resolvedIds);
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
            `Já há um agents-office na porta ${status.port} (v${status.version}). Os pedidos de permissão continuam sendo respondidos no terminal; os avisos dependem dele.`,
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
      clearInterval(messagingTimer);
      spawnApprovals.denyAll('The app is closing.');
      browserApprovals.denyAll();
      browserHost.dispose();
      idleSource.stop();
      messaging.stop();
      commsLog.detach();
      managedSessions.beginShutdown();
      await sessions.killAll();
      await agentBus.stop();
      await controller.stop();
    },
    finish: ({ install }) => {
      quitDone = true;
      tray?.destroy();
      // quitDone releases the before-quit guard, so quitAndInstall's own quit cannot loop.
      if (install && updater?.install()) return;
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
    // The roster reopens from scratch (no --resume) once the Agent Bus can issue credentials.
    void agentBus
      .start()
      .catch((error) => console.error('Agent Bus failed to start:', error))
      .then(() => managedSessions.reopenAll())
      .catch((error) => console.error('Reopening the roster failed:', error));
    // 'shutdown' (Linux/macOS) is missing from Electron's typings.
    (powerMonitor as unknown as NodeJS.EventEmitter).on('shutdown', (event: Electron.Event) => {
      event.preventDefault();
      void quit.request('forced');
    });
    window = createWindow();
    tray = new Tray(trayImage(0));
    shellState = new Shell({
      window,
      tray: trayAdapter,
      notify: (notice, onClick) =>
        notifications.notifyPermission(notice.id, notice.title, notice.body, onClick),
      dismiss: (id) => notifications.dismiss(id),
      quit: quitInteractively,
      checkUpdates,
      installUpdate: () => void installUpdate(),
    });
    applyAppMenu();
    updater = createUpdateService({
      autoUpdater,
      isPackaged: app.isPackaged,
      isAppImage: Boolean(process.env.APPIMAGE),
      now: Date.now,
      emit: (state) => {
        const previous = updateState.state;
        updateState = state;
        pushUpdate(state);
        shellState?.setUpdate(state);
        if (state.state === 'ready' || previous === 'ready') applyAppMenu();
        if (state.state === 'ready' && previous !== 'ready') {
          notify(
            'Atualização pronta',
            `A versão ${state.version} foi baixada. Reinicie o Agents Office para atualizar.`,
            () => shellState?.showWindow(),
          );
        }
      },
    });
    updater.start();
    controller.onStatus(onDaemonStatus);
    void controller.start();
  });
}

main();
