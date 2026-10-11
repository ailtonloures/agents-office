// Actions the game can trigger in the desktop shell's DOM UI (terminal panel, project picker).
// `window.__desktopActions` exists only inside the Electron app, so the game shows these actions
// only there (spec 023).

export interface DesktopActions {
  /** Opens the project picker, already on the project of `cwd` when given. */
  openProjectPicker(cwd?: string): void;
  /** Focuses the terminal tab `terminalId`; false when the tab does not exist (anymore). */
  openTerminal(terminalId: string): boolean;
  /** Minimizes the terminal panel and gives the keyboard back to the game. */
  collapseTerminal(): void;
  /** Opens the folder in VS Code; a failure is shown as a toast (never throws). */
  openInVSCode(cwd: string): Promise<void>;
}

declare global {
  interface Window {
    __desktopActions?: DesktopActions;
  }
}
