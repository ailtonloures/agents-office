import { describe, expect, it, vi } from 'vitest';
import {
  buildQuitPrompt,
  formatActiveTime,
  QuitCoordinator,
  type QuitDeps,
  type QuitSession,
} from '../src/main/quitFlow';

const NOW = Date.parse('2026-10-10T12:00:00Z');
const session = (id: string, cwd: string, startedAt: string): QuitSession => ({
  id,
  cwd,
  startedAt,
});

describe('formatActiveTime', () => {
  it('formats seconds, minutes and hours', () => {
    expect(formatActiveTime(45_000)).toBe('45 s');
    expect(formatActiveTime(12 * 60_000)).toBe('12 min');
    expect(formatActiveTime((2 * 60 + 5) * 60_000)).toBe('2 h 05 min');
    expect(formatActiveTime(-5)).toBe('0 s');
  });
});

describe('buildQuitPrompt', () => {
  it('lists each session with project name and active time', () => {
    const prompt = buildQuitPrompt(
      [
        session('a', '/w/alpha', '2026-10-10T11:48:00Z'),
        session('b', '/w/beta/', '2026-10-10T09:55:00Z'),
      ],
      NOW,
    );
    expect(prompt.message).toBe('Há 2 sessões do Claude Code em andamento.');
    expect(prompt.detail).toContain('alpha - ativa há 12 min');
    expect(prompt.detail).toContain('beta - ativa há 2 h 05 min');
    expect(prompt.buttons).toEqual(['Cancelar', 'Encerrar tudo']);
    expect(prompt.cancelId).toBe(0);
  });

  it('uses the singular and survives a bad date', () => {
    const prompt = buildQuitPrompt([session('a', '/w/alpha', 'nope')], NOW);
    expect(prompt.message).toBe('Há 1 sessão do Claude Code em andamento.');
    expect(prompt.detail).toContain('alpha\n');
  });
});

function setup(active: QuitSession[], confirmed = true) {
  const calls: string[] = [];
  const deps: QuitDeps = {
    list: () => active,
    confirm: vi.fn(async () => {
      calls.push('confirm');
      return confirmed;
    }),
    shutdown: vi.fn(async ({ keepRecoverable }) => {
      calls.push(`shutdown:${keepRecoverable}`);
    }),
    finish: vi.fn((o: { install: boolean }) => calls.push(o.install ? 'finish:install' : 'finish')),
    cancelled: vi.fn(() => calls.push('cancelled')),
  };
  return { quit: new QuitCoordinator(deps), deps, calls };
}

describe('QuitCoordinator', () => {
  it('quits right away without active sessions', async () => {
    const { quit, deps, calls } = setup([]);
    expect(await quit.request('interactive')).toBe('quit');
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(calls).toEqual(['shutdown:false', 'finish']);
  });

  it('asks first and shuts down only when confirmed', async () => {
    const { quit, calls } = setup([session('a', '/w', '2026-01-01T00:00:00Z')]);
    expect(await quit.request('interactive')).toBe('quit');
    expect(calls).toEqual(['confirm', 'shutdown:false', 'finish']);
  });

  it('does nothing but report when the user cancels, and can be asked again', async () => {
    const { quit, deps, calls } = setup([session('a', '/w', '2026-01-01T00:00:00Z')], false);
    expect(await quit.request('interactive')).toBe('cancelled');
    expect(calls).toEqual(['confirm', 'cancelled']);
    expect(deps.shutdown).not.toHaveBeenCalled();
    expect(await quit.request('interactive')).toBe('cancelled');
    expect(deps.confirm).toHaveBeenCalledTimes(2);
  });

  it('forced quits (signals, system shutdown) never ask and keep sessions recoverable', async () => {
    const { quit, deps, calls } = setup([session('a', '/w', '2026-01-01T00:00:00Z')], false);
    expect(await quit.request('forced')).toBe('quit');
    expect(deps.confirm).not.toHaveBeenCalled();
    expect(calls).toEqual(['shutdown:true', 'finish']);
  });

  it('shares one run between concurrent requests', async () => {
    const { quit, deps } = setup([session('a', '/w', '2026-01-01T00:00:00Z')]);
    const [a, b] = await Promise.all([quit.request('interactive'), quit.request('interactive')]);
    expect([a, b]).toEqual(['quit', 'quit']);
    expect(deps.confirm).toHaveBeenCalledTimes(1);
    expect(deps.shutdown).toHaveBeenCalledTimes(1);
  });

  it('a forced request during the dialog wins over a later cancel', async () => {
    let answer: (v: boolean) => void = () => {};
    const calls: string[] = [];
    const quit = new QuitCoordinator({
      list: () => [session('a', '/w', '2026-01-01T00:00:00Z')],
      confirm: () => new Promise<boolean>((resolve) => (answer = resolve)),
      shutdown: async ({ keepRecoverable }) => void calls.push(`shutdown:${keepRecoverable}`),
      finish: () => calls.push('finish'),
      cancelled: () => calls.push('cancelled'),
    });
    const first = quit.request('interactive');
    const forced = quit.request('forced');
    answer(false);
    expect(await Promise.all([first, forced])).toEqual(['quit', 'quit']);
    expect(calls).toEqual(['shutdown:true', 'finish']);
  });

  it('finishes with the installer after the end of the sessions when an update restart was asked', async () => {
    const { quit, deps, calls } = setup([]);
    expect(await quit.request('interactive', { installOnQuit: true })).toBe('quit');
    expect(calls).toEqual(['shutdown:false', 'finish:install']);
    expect(deps.finish).toHaveBeenCalledWith({ install: true });
  });

  it('asks before installing when sessions are alive', async () => {
    const { quit, calls } = setup([session('a', '/w', '2026-01-01T00:00:00Z')]);
    await quit.request('interactive', { installOnQuit: true });
    expect(calls).toEqual(['confirm', 'shutdown:false', 'finish:install']);
  });

  it('cancelling keeps the app open and forgets the install request', async () => {
    const { quit, deps, calls } = setup([session('a', '/w', '2026-01-01T00:00:00Z')], false);
    expect(await quit.request('interactive', { installOnQuit: true })).toBe('cancelled');
    expect(calls).toEqual(['confirm', 'cancelled']);
    expect(deps.finish).not.toHaveBeenCalled();
    vi.mocked(deps.confirm).mockResolvedValueOnce(true);
    await quit.request('interactive');
    expect(deps.finish).toHaveBeenLastCalledWith({ install: false });
  });

  it('a plain quit never installs', async () => {
    const { quit, deps } = setup([]);
    await quit.request('interactive');
    expect(deps.finish).toHaveBeenCalledWith({ install: false });
  });

  it('does not re-enter: repeated requests share one run and one finish', async () => {
    const { quit, deps } = setup([session('a', '/w', '2026-01-01T00:00:00Z')]);
    await Promise.all([
      quit.request('interactive', { installOnQuit: true }),
      quit.request('interactive', { installOnQuit: true }),
      quit.request('forced'),
    ]);
    expect(deps.shutdown).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledTimes(1);
    expect(deps.finish).toHaveBeenCalledWith({ install: true });
  });
});
