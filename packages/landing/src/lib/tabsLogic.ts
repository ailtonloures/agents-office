/** Keyboard navigation of a WAI-ARIA tablist with automatic activation. Pure, so it is testable. */

export type TabsDirection = 'horizontal' | 'vertical';

/**
 * Returns the index of the tab that a key should focus, or `null` when the key is not a tabs key.
 * Arrow keys wrap around; Home and End jump to the ends.
 */
export function nextTabIndex(
  current: number,
  count: number,
  key: string,
  direction: TabsDirection = 'horizontal',
): number | null {
  if (count <= 0) return null;
  const prev = direction === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
  const next = direction === 'horizontal' ? 'ArrowRight' : 'ArrowDown';
  const safe = Math.min(Math.max(current, 0), count - 1);
  switch (key) {
    case next:
      return (safe + 1) % count;
    case prev:
      return (safe - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
