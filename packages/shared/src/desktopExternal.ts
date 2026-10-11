// Contract of the external-apps bridge that the desktop shell exposes to the web app
// (`window.agentsOfficeDesktop.external`): opening a project folder in VS Code.

export type OpenInVSCodeErrorCode =
  | 'vscode-not-found'
  | 'invalid-dir'
  | 'invalid-request'
  | 'spawn-failed';

export type OpenInVSCodeResult =
  | { ok: true }
  | { ok: false; code: OpenInVSCodeErrorCode; message: string };

export type EditorConfigResult =
  | { ok: true; vscodePath: string | null }
  | { ok: false; message: string };

export interface ExternalBridge {
  /** Runs `code <dir>` in the main process (the directory is validated there). Never rejects. */
  openInVSCode(dir: string): Promise<OpenInVSCodeResult>;
  /** The manual VS Code executable saved by the user, or null for automatic discovery. */
  getEditorPath(): Promise<string | null>;
  /** Saves (or clears with null) the manual path of the `code` executable. */
  setEditorPath(path: string | null): Promise<EditorConfigResult>;
}
