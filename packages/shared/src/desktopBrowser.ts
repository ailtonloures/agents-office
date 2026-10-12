// Contract of the embedded-browser bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.browser`). One browser (a native view) per workspace; the window
// only reports where the dock tab body is and the shell places the view there.

/** Rectangle in CSS pixels, relative to the window's content area. */
export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserState {
  /** Workspace the browser belongs to. */
  cwd: string;
  url: string;
  title: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  /** Name of the agent currently driving the browser (spec 081); absent when idle. */
  agent?: string;
  /** Agent actions waiting behind the current one. */
  queued?: number;
  /** The user paused the agents: browser tools answer "paused by the user" (spec 083). */
  paused?: boolean;
}

/** What the user picked on the page with "Selecionar elemento" (spec 084). Page data: untrusted. */
export interface BrowserPick {
  cwd: string;
  url: string;
  title: string;
  /** CSS selector that locates the element (best effort). */
  selector: string;
  /** Lower-case tag name. */
  tag: string;
  /** Visible text, cut at a fixed size. */
  text: string;
  /** Outer HTML (scripts and password values removed), cut at a fixed size. */
  html: string;
  textTruncated: boolean;
  htmlTruncated: boolean;
  /** PNG of the element saved by the shell (temporary file), when the capture worked. */
  screenshotPath?: string;
}

export type BrowserPickEvent =
  | { status: 'picked'; cwd: string; pick: BrowserPick }
  | { status: 'cancelled'; cwd: string }
  | { status: 'error'; cwd: string; message: string };

export type BrowserResult = { ok: true; state: BrowserState } | { ok: false; message: string };

export interface BrowserBridge {
  /** Creates the workspace browser if needed, shows it at `bounds` and hides the others. */
  show(cwd: string, bounds: BrowserBounds): Promise<BrowserResult>;
  /** Moves the visible browser (the tab body changed size or position). */
  setBounds(bounds: BrowserBounds): Promise<void>;
  /** Hides the visible browser without destroying it (tab closed, panel collapsed). */
  hide(): Promise<void>;
  /** Goes to an address typed by the user (URL, host or search terms). */
  navigate(cwd: string, address: string): Promise<BrowserResult>;
  back(cwd: string): Promise<BrowserResult>;
  forward(cwd: string): Promise<BrowserResult>;
  reload(cwd: string): Promise<BrowserResult>;
  /** Deletes cookies, storage and cache of the workspace browser and reloads it blank. */
  clearData(cwd: string): Promise<BrowserResult>;
  /** Pauses / resumes the agents' browser tools of the workspace (per workspace, not saved). */
  setPaused(cwd: string, paused: boolean): Promise<BrowserResult>;
  /** Starts the element picker on the workspace page (highlight under the mouse, click to pick). */
  startPick(cwd: string): Promise<BrowserResult>;
  /** Stops the element picker without picking. */
  cancelPick(cwd: string): Promise<BrowserResult>;
  /** Picker outcomes (an element was picked, the picker ended or failed); returns the unsubscribe. */
  onPick(listener: (event: BrowserPickEvent) => void): () => void;
  /** Navigation state changes of any workspace browser; returns the unsubscribe. */
  onState(listener: (state: BrowserState) => void): () => void;
}
