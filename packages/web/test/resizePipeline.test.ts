import { describe, expect, it } from 'vitest';
import { applyResizePipeline, type ResizePipelineDeps } from '../src/resizePipeline';
import type { Viewport } from '../src/scale';

const viewport = (overrides: Partial<Viewport> = {}): Viewport => ({
  zoom: 2,
  renderScale: 2,
  width: 400,
  height: 240,
  ...overrides,
});

function fakeDeps() {
  const calls: string[] = [];
  const deps: ResizePipelineDeps = {
    setZoom: (next) => calls.push(`zoom:${next.zoom}`),
    resize: (width, height) => calls.push(`resize:${width}x${height}`),
    applyStyle: (next) => calls.push(`style:${next.width}x${next.height}`),
    refresh: () => calls.push('refresh'),
  };
  return { calls, deps };
}

describe('applyResizePipeline', () => {
  it('on a viewport change runs zoom, size, style and then the re-measure', () => {
    const { calls, deps } = fakeDeps();
    applyResizePipeline(deps, viewport(), viewport({ zoom: 3, renderScale: 3, width: 300 }));
    expect(calls).toEqual(['zoom:3', 'resize:900x720', 'style:300x240', 'refresh']);
  });

  it('on a viewport change measures the canvas only after its CSS size was written', () => {
    const { calls, deps } = fakeDeps();
    applyResizePipeline(deps, viewport(), viewport({ height: 300 }));
    expect(calls.indexOf('refresh')).toBeGreaterThan(calls.findIndex((c) => c.startsWith('style')));
  });

  it('returns the new viewport as the applied one', () => {
    const { deps } = fakeDeps();
    const next = viewport({ width: 500 });
    expect(applyResizePipeline(deps, viewport(), next)).toBe(next);
  });

  it('applies the first viewport when none was applied yet', () => {
    const { calls, deps } = fakeDeps();
    applyResizePipeline(deps, undefined, viewport());
    expect(calls).toEqual(['zoom:2', 'resize:800x480', 'style:400x240', 'refresh']);
  });

  it('with the same viewport writes the style first and re-measures after it', () => {
    const { calls, deps } = fakeDeps();
    applyResizePipeline(deps, viewport(), viewport());
    expect(calls).toEqual(['style:400x240', 'refresh']);
  });

  it('with the same viewport never resizes (that would clear the canvas)', () => {
    const { calls, deps } = fakeDeps();
    const last = viewport();
    const applied = applyResizePipeline(deps, last, { ...last });
    expect(calls.some((c) => c.startsWith('resize'))).toBe(false);
    expect(calls.some((c) => c.startsWith('zoom'))).toBe(false);
    expect(applied).toBe(last);
  });
});
