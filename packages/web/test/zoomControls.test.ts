import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, t } from '../src/i18n/i18n';
import { zoomControlsState } from '../src/ui/zoomControls';
import { ZOOM_MAX, ZOOM_MIN } from '../src/zoom';

describe('zoomControlsState', () => {
  it('enables both buttons between the limits', () => {
    expect(zoomControlsState(1, false)).toEqual({
      inDisabled: false,
      outDisabled: false,
      hidden: false,
    });
  });
  it('disables "+" at the maximum and "-" at the minimum', () => {
    expect(zoomControlsState(ZOOM_MAX, false).inDisabled).toBe(true);
    expect(zoomControlsState(ZOOM_MIN, false).outDisabled).toBe(true);
  });
  it('hides the buttons in the overview', () => {
    expect(zoomControlsState(1, true).hidden).toBe(true);
  });
});

describe('zoom control labels', () => {
  afterEach(() => setLocale('en'));
  it('has the label in every language', () => {
    setLocale('pt-BR');
    expect([t('zoom.in'), t('zoom.out')]).toEqual(['Aproximar', 'Afastar']);
    setLocale('en');
    expect([t('zoom.in'), t('zoom.out')]).toEqual(['Zoom in', 'Zoom out']);
    setLocale('es');
    expect([t('zoom.in'), t('zoom.out')]).toEqual(['Acercar', 'Alejar']);
  });
});
