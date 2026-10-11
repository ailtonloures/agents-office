import { describe, expect, it, vi } from 'vitest';
import { externalBridgeOf, openFailureMessage, openInVSCode } from '../src/ui/externalOpen';
import { pickerBridgesOf } from '../src/ui/projectPicker';

describe('externalBridgeOf', () => {
  it('exists only inside the desktop shell with the bridge', () => {
    expect(externalBridgeOf({})).toBeUndefined();
    expect(externalBridgeOf({ agentsOfficeDesktop: { desktop: true } })).toBeUndefined();
    const external = { openInVSCode: async () => ({ ok: true }) };
    expect(externalBridgeOf({ agentsOfficeDesktop: { desktop: true, external } })).toBe(external);
  });

  it('the picker gets the bridge only when the shell has it', () => {
    const base = { desktop: true, terminal: { start() {} }, projects: { list() {} } };
    expect(pickerBridgesOf({ agentsOfficeDesktop: base })?.external).toBeUndefined();
    const external = { openInVSCode() {} };
    expect(pickerBridgesOf({ agentsOfficeDesktop: { ...base, external } })?.external).toBe(
      external,
    );
  });
});

describe('openInVSCode', () => {
  it('reports success without a message', async () => {
    const bridge = { openInVSCode: vi.fn(async () => ({ ok: true as const })) };
    expect(await openInVSCode(bridge as never, '/p')).toEqual({ ok: true });
    expect(bridge.openInVSCode).toHaveBeenCalledWith('/p');
  });

  it('turns a not-found result into the guidance message', async () => {
    const message = 'VS Code (the "code" command) was not found. Install VS Code.';
    const bridge = {
      openInVSCode: async () => ({
        ok: false as const,
        code: 'vscode-not-found' as const,
        message,
      }),
    };
    expect(await openInVSCode(bridge as never, '/p')).toEqual({ ok: false, message });
  });

  it('never throws, even when the bridge rejects', async () => {
    const bridge = {
      openInVSCode: async () => {
        throw new Error('ipc gone');
      },
    };
    const outcome = await openInVSCode(bridge as never, '/p');
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toMatch(/ipc gone/);
  });

  it('words invalid folders for the user', () => {
    expect(openFailureMessage({ ok: false, code: 'invalid-dir', message: 'Gone.' })).toBe(
      'Não foi possível abrir no VS Code: Gone.',
    );
  });
});
