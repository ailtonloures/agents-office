import { describe, expect, it, vi } from 'vitest';
import { copyText } from '../src/lib/clipboard';
import { revealMode } from '../src/lib/reveal';

describe('copyText', () => {
  it('uses the async clipboard when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await copyText('cmd', { clipboard: { writeText } })).toBe(true);
    expect(writeText).toHaveBeenCalledWith('cmd');
  });

  it('falls back to the legacy copy when the clipboard rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    const legacyCopy = vi.fn().mockReturnValue(true);
    expect(await copyText('cmd', { clipboard: { writeText }, legacyCopy })).toBe(true);
    expect(legacyCopy).toHaveBeenCalledWith('cmd');
  });

  it('resolves false instead of throwing when everything fails', async () => {
    const legacyCopy = vi.fn(() => {
      throw new Error('nope');
    });
    expect(await copyText('cmd', { legacyCopy })).toBe(false);
    expect(await copyText('cmd', {})).toBe(false);
  });
});

describe('revealMode', () => {
  it('observes only with an observer and no reduced-motion preference', () => {
    expect(revealMode(true, false)).toBe('observe');
    expect(revealMode(true, true)).toBe('immediate');
    expect(revealMode(false, false)).toBe('immediate');
  });
});
