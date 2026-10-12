import { describe, expect, it } from 'vitest';
import { nextTabIndex } from '../src/lib/tabsLogic';

describe('nextTabIndex', () => {
  it('moves with the arrows and wraps around', () => {
    expect(nextTabIndex(0, 4, 'ArrowRight')).toBe(1);
    expect(nextTabIndex(3, 4, 'ArrowRight')).toBe(0);
    expect(nextTabIndex(1, 4, 'ArrowLeft')).toBe(0);
    expect(nextTabIndex(0, 4, 'ArrowLeft')).toBe(3);
  });

  it('jumps to the ends with Home and End', () => {
    expect(nextTabIndex(2, 4, 'Home')).toBe(0);
    expect(nextTabIndex(1, 4, 'End')).toBe(3);
  });

  it('ignores other keys and empty lists', () => {
    expect(nextTabIndex(1, 4, 'a')).toBeNull();
    expect(nextTabIndex(1, 4, 'ArrowDown')).toBeNull();
    expect(nextTabIndex(0, 0, 'ArrowRight')).toBeNull();
  });

  it('uses up and down in a vertical list and clamps a stale index', () => {
    expect(nextTabIndex(0, 3, 'ArrowDown', 'vertical')).toBe(1);
    expect(nextTabIndex(0, 3, 'ArrowUp', 'vertical')).toBe(2);
    expect(nextTabIndex(0, 3, 'ArrowRight', 'vertical')).toBeNull();
    expect(nextTabIndex(9, 3, 'ArrowRight')).toBe(0);
  });
});
