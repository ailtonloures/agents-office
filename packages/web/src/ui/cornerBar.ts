/**
 * Shared bottom-left bar that holds the Hooks, Sessões and Elenco buttons. A flex `gap` keeps the
 * spacing equal whatever each label's width is. It is `position: absolute` inside `#game` (never
 * `fixed`, which would ignore the `#ao-terminal` flex sibling and cover the terminal).
 */
const CSS = `
.ao-corner-bar{position:absolute;left:8px;bottom:8px;z-index:20;display:flex;gap:8px;
  align-items:center}
`;

const CLASS_NAME = 'ao-corner-bar';

/** Returns the corner bar of `gameParent`, creating it (and its style) on first use. */
export function getCornerBar(gameParent: HTMLElement): HTMLElement {
  const existing = gameParent.querySelector<HTMLElement>(`:scope > .${CLASS_NAME}`);
  if (existing) return existing;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
  const bar = document.createElement('div');
  bar.className = CLASS_NAME;
  gameParent.append(bar);
  return bar;
}
