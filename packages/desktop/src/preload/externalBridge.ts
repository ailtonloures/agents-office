import type { EditorConfigResult, ExternalBridge, OpenInVSCodeResult } from '@agents-office/shared';
import { EXTERNAL_CHANNELS } from '../main/externalChannels';
import type { Invoke } from './bridge';

/** Typed, minimal surface over IPC for opening a folder in an external editor. */
export function createExternalBridge(invoke: Invoke): ExternalBridge {
  return {
    openInVSCode: (dir) =>
      invoke(EXTERNAL_CHANNELS.openInVSCode, dir) as Promise<OpenInVSCodeResult>,
    getEditorPath: () => invoke(EXTERNAL_CHANNELS.getEditorPath) as Promise<string | null>,
    setEditorPath: (path) =>
      invoke(EXTERNAL_CHANNELS.setEditorPath, path) as Promise<EditorConfigResult>,
  };
}
