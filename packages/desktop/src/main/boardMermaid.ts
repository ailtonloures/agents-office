import { randomUUID } from 'node:crypto';
import type { BoardMermaidResponse } from '@agents-office/shared';
import type { ElementSkeleton, MermaidResult } from './agentBus/boardTools';
import { BOARD_CHANNELS } from './boardChannels';
import type { EventTarget, IpcMainLike } from './ipc';

export const MERMAID_TIMEOUT_MS = 15_000;

/** The converter cannot run right now (no window, no answer in time): not the diagram's fault. */
export class MermaidUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MermaidUnavailableError';
  }
}

export interface MermaidRelayDeps<E> {
  ipcMain: IpcMainLike<E>;
  trusted(event: E): void;
  target(): EventTarget | undefined;
  timeoutMs?: number;
  newId?: () => string;
}

/**
 * Mermaid -> skeletons through the window: `@excalidraw/mermaid-to-excalidraw` needs a DOM, which
 * the main process does not have. The request goes to the window, which answers on a channel.
 * Fails with `MermaidUnavailableError` when there is no window or it does not answer in time.
 */
export function createMermaidRelay<E>(deps: MermaidRelayDeps<E>): {
  convert(definition: string): Promise<MermaidResult>;
} {
  const pending = new Map<string, (response: BoardMermaidResponse) => void>();
  deps.ipcMain.handle(BOARD_CHANNELS.mermaidResponse, (event, id, response) => {
    deps.trusted(event);
    if (typeof id !== 'string') return;
    const resolve = pending.get(id);
    if (!resolve) return;
    const r = response as { ok?: unknown; elements?: unknown; message?: unknown } | null;
    if (r && r.ok === true && Array.isArray(r.elements)) {
      resolve({ ok: true, elements: r.elements });
    } else {
      resolve({
        ok: false,
        message: typeof r?.message === 'string' ? r.message.slice(0, 500) : 'Conversion failed.',
      });
    }
  });
  return {
    convert(definition) {
      const target = deps.target();
      if (!target || target.isDestroyed()) {
        return Promise.reject(
          new MermaidUnavailableError('The office window is not open to convert the diagram.'),
        );
      }
      const id = (deps.newId ?? randomUUID)();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new MermaidUnavailableError('The window did not convert the diagram in time.'));
        }, deps.timeoutMs ?? MERMAID_TIMEOUT_MS);
        timer.unref?.();
        pending.set(id, (response) => {
          clearTimeout(timer);
          pending.delete(id);
          if (response.ok) resolve({ elements: response.elements as ElementSkeleton[] });
          else reject(new Error(response.message));
        });
        try {
          target.send(BOARD_CHANNELS.mermaidRequest, { id, definition });
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(
            new MermaidUnavailableError(error instanceof Error ? error.message : 'send failed'),
          );
        }
      });
    },
  };
}
