import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import { bannerModel, updaterBridgeOf } from '../src/ui/updateLogic';

describe('updaterBridgeOf', () => {
  const updater = {
    getState: async () => ({ state: 'idle' }),
    onStatus: () => () => {},
    install: async () => true,
  };
  it('is undefined without the bridge', () => {
    expect(updaterBridgeOf({})).toBeUndefined();
    expect(updaterBridgeOf({ agentsOfficeDesktop: { desktop: true } })).toBeUndefined();
  });
  it('returns the bridge when present', () => {
    expect(updaterBridgeOf({ agentsOfficeDesktop: { desktop: true, updater } })).toBe(updater);
  });
});

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

describe('bannerModel', () => {
  it('hides for idle, checking and error', () => {
    for (const state of [
      { state: 'idle' },
      { state: 'checking' },
      { state: 'error', message: 'x' },
    ] as const) {
      expect(bannerModel(state, null).visible).toBe(false);
    }
  });
  it('shows the version while available', () => {
    expect(bannerModel({ state: 'available', version: '1.2.0' }, null)).toMatchObject({
      visible: true,
      text: 'Nova versão 1.2.0 disponível — baixando…',
      showInstall: false,
      showLater: true,
    });
  });
  it('shows clamped progress while downloading', () => {
    const model = bannerModel({ state: 'downloading', version: '1.2.0', percent: 41.6 }, null);
    expect(model.percent).toBe(42);
    expect(model.text).toContain('42%');
    expect(bannerModel({ state: 'downloading', version: '1', percent: 140 }, null).percent).toBe(
      100,
    );
  });
  it('offers restart when ready', () => {
    expect(bannerModel({ state: 'ready', version: '1.2.0' }, null)).toMatchObject({
      visible: true,
      showInstall: true,
      showLater: true,
    });
  });
  it('Depois hides that version only', () => {
    expect(bannerModel({ state: 'ready', version: '1.2.0' }, '1.2.0').visible).toBe(false);
    expect(bannerModel({ state: 'ready', version: '1.3.0' }, '1.2.0').visible).toBe(true);
  });
});

describe('bannerModel in other languages', () => {
  it('uses English and Spanish', () => {
    setLocale('en');
    expect(bannerModel({ state: 'ready', version: '1.2.0' }, null).text).toBe(
      'New version 1.2.0 ready to install.',
    );
    setLocale('es');
    expect(bannerModel({ state: 'ready', version: '1.2.0' }, null).text).toBe(
      'Nueva versión 1.2.0 lista para instalar.',
    );
  });
});
