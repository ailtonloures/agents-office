import { describe, expect, it } from 'vitest';
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
