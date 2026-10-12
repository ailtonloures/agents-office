import type { UpdateState } from '@agents-office/shared';
import { describe, expect, it, vi } from 'vitest';
import { UPDATER_CHANNELS } from '../src/main/updaterChannels';
import { createUpdaterBridge } from '../src/preload/updaterBridge';

function setup() {
  const invoke = vi.fn(async (_channel: string, ..._args: unknown[]): Promise<unknown> => true);
  const unsubscribe = vi.fn();
  const subscribe = vi.fn((_channel: string, _listener: (payload: unknown) => void) => unsubscribe);
  return { invoke, subscribe, unsubscribe, bridge: createUpdaterBridge(invoke, subscribe) };
}

describe('createUpdaterBridge', () => {
  it('maps getState/checkNow/install to their channels', async () => {
    const { bridge, invoke } = setup();
    const ready: UpdateState = { state: 'ready', version: '1.2.3' };
    invoke.mockResolvedValueOnce(ready);
    expect(await bridge.getState()).toEqual(ready);
    expect(invoke).toHaveBeenLastCalledWith(UPDATER_CHANNELS.getState);

    invoke.mockResolvedValueOnce({ state: 'idle' });
    expect(await bridge.checkNow()).toEqual({ state: 'idle' });
    expect(invoke).toHaveBeenLastCalledWith(UPDATER_CHANNELS.checkNow);

    invoke.mockResolvedValueOnce(true);
    expect(await bridge.install()).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith(UPDATER_CHANNELS.install);
  });

  it('onStatus forwards pushed states and returns the unsubscribe', () => {
    const { bridge, subscribe, unsubscribe } = setup();
    const listener = vi.fn();
    const off = bridge.onStatus(listener);
    expect(subscribe.mock.calls[0]?.[0]).toBe(UPDATER_CHANNELS.status);
    subscribe.mock.calls[0]?.[1]({ state: 'downloading', version: '2.0.0', percent: 40 });
    expect(listener).toHaveBeenCalledWith({ state: 'downloading', version: '2.0.0', percent: 40 });
    off();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
