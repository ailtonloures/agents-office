import { session as electronSession, WebContentsView } from 'electron';
import type { BrowserGuard } from './browserGuard';
import type { BrowserViewFactory, BrowserViewHandle, CdpTransport } from './browserHost';

/** The window that hosts the native views (its `contentView` receives them). */
export interface BrowserViewWindow {
  isDestroyed(): boolean;
  contentView: {
    addChildView(view: WebContentsView): void;
    removeChildView(view: WebContentsView): void;
  };
}

function isWebUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Electron implementation of the browser view: a sandboxed `WebContentsView` on its own persistent
 * partition, without preload or Node, with every site permission and download denied until the
 * user-facing prompts exist.
 */
export function createElectronBrowserViews(
  getWindow: () => BrowserViewWindow | undefined,
  siteGuard?: BrowserGuard,
) {
  const factory: BrowserViewFactory = (partition, cwd) => {
    const ses = electronSession.fromPartition(partition);
    // Permissions and downloads need the user's "Permitir" (spec 083); without a site guard, a refusal.
    ses.setPermissionRequestHandler((_contents, permission, callback, details) => {
      if (!siteGuard) return callback(false);
      let answered = false;
      const answer = (allowed: boolean): void => {
        if (answered) return;
        answered = true;
        callback(allowed);
      };
      siteGuard
        .permission(cwd, permission, details.requestingUrl)
        .then(answer, () => answer(false));
    });
    ses.setPermissionCheckHandler(() => false);
    ses.on('will-download', (event, item) => {
      if (!siteGuard) return event.preventDefault();
      // Held until the user decides; the save dialog still lets them pick where it goes.
      item.pause();
      siteGuard
        .download(cwd, { filename: item.getFilename(), url: item.getURL() })
        .catch(() => false)
        .then((allowed) => {
          if (allowed) item.resume();
          else item.cancel();
        });
    });
    const view = new WebContentsView({
      webPreferences: {
        session: ses,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        spellcheck: false,
      },
    });
    const contents = view.webContents;
    // New windows never open: web links load in the same view, anything else is dropped.
    contents.setWindowOpenHandler(({ url }) => {
      if (isWebUrl(url)) void contents.loadURL(url).catch(() => {});
      return { action: 'deny' };
    });
    // Page navigation stays on http(s); other schemes (file:, custom protocols) are blocked, and
    // "open externally" is never triggered by a page.
    const guard = (event: { preventDefault(): void }, url: string): void => {
      if (isWebUrl(url) || url === 'about:blank') return;
      event.preventDefault();
    };
    contents.on('will-navigate', guard);
    contents.on('will-redirect', guard);
    let mounted = false;
    let destroyed = false;
    const listeners = new Set<() => void>();
    const emit = (): void => {
      for (const listener of listeners) listener();
    };
    for (const name of [
      'did-start-loading',
      'did-stop-loading',
      'did-navigate',
      'did-navigate-in-page',
      'page-title-updated',
      'did-fail-load',
    ] as const) {
      contents.on(name as 'did-stop-loading', emit);
    }
    view.setVisible(false);
    const unmount = (): void => {
      const win = getWindow();
      if (mounted && win && !win.isDestroyed()) win.contentView.removeChildView(view);
      mounted = false;
    };
    // CDP over `webContents.debugger`, attached on first use.
    const cdpListeners = new Set<(method: string, params: Record<string, unknown>) => void>();
    contents.debugger.on('message', (_event, method, params) => {
      for (const listener of cdpListeners)
        listener(method, (params ?? {}) as Record<string, unknown>);
    });
    const cdp: CdpTransport = {
      async send(method, params) {
        if (destroyed || contents.isDestroyed()) throw new Error('The browser view is closed.');
        if (!contents.debugger.isAttached()) {
          contents.debugger.attach('1.3');
          // Console and exception events feed browser_console from the moment of attachment.
          await contents.debugger.sendCommand('Runtime.enable').catch(() => undefined);
          await contents.debugger.sendCommand('Log.enable').catch(() => undefined);
        }
        return contents.debugger.sendCommand(method, params);
      },
      onEvent(listener) {
        cdpListeners.add(listener);
        return () => cdpListeners.delete(listener);
      },
    };
    const handle: BrowserViewHandle = {
      partition,
      cdp,
      loadURL: (url) => contents.loadURL(url),
      goBack: () => contents.navigationHistory.goBack(),
      goForward: () => contents.navigationHistory.goForward(),
      reload: () => contents.reload(),
      stop: () => contents.stop(),
      snapshot: () => ({
        url: contents.getURL(),
        title: contents.getTitle(),
        loading: contents.isLoading(),
        canGoBack: contents.navigationHistory.canGoBack(),
        canGoForward: contents.navigationHistory.canGoForward(),
      }),
      onChange(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      setVisible(visible, bounds) {
        if (destroyed) return;
        if (!visible) {
          view.setVisible(false);
          unmount();
          return;
        }
        const win = getWindow();
        if (!win || win.isDestroyed()) return;
        if (bounds) handle.setBounds(bounds);
        if (!mounted) {
          win.contentView.addChildView(view);
          mounted = true;
        }
        view.setVisible(true);
      },
      setBounds(bounds) {
        if (destroyed) return;
        view.setBounds({
          x: Math.round(bounds.x),
          y: Math.round(bounds.y),
          width: Math.max(0, Math.round(bounds.width)),
          height: Math.max(0, Math.round(bounds.height)),
        });
      },
      async clearData() {
        await ses.clearStorageData();
        await ses.clearCache();
        await ses.clearAuthCache();
        await ses.clearHostResolverCache();
      },
      destroy() {
        if (destroyed) return;
        unmount();
        destroyed = true;
        listeners.clear();
        if (!contents.isDestroyed()) {
          if (contents.debugger.isAttached()) contents.debugger.detach();
          contents.close();
        }
      },
    };
    return handle;
  };
  return factory;
}
