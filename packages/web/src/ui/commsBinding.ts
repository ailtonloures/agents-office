import type { CommsBridge } from '@agents-office/shared';

/** The communication-events bridge of the desktop shell, or undefined outside it. */
export function commsBridgeOf(win: object): CommsBridge | undefined {
  const comms = (win as { agentsOfficeDesktop?: { comms?: CommsBridge } }).agentsOfficeDesktop
    ?.comms;
  return comms && typeof comms.onEvent === 'function' ? comms : undefined;
}
