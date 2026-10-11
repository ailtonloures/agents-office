/**
 * Thin scrollbars in the office palette, applied to every scrollable element (`*`): the terminal
 * viewport (`.xterm-viewport`), the settings modal, `.ao-hooks-diff`, `.ao-picker-list`, the tab bar.
 * Only colors and thickness change, so panel layouts are untouched.
 */
export const SCROLLBAR_CSS = `
*{scrollbar-width:thin;scrollbar-color:#2a2d44 transparent}
*::-webkit-scrollbar{width:8px;height:8px;background:transparent}
*::-webkit-scrollbar-track{background:transparent}
*::-webkit-scrollbar-thumb{background:#2a2d44;border-radius:4px}
*::-webkit-scrollbar-thumb:hover{background:#3a3f5c}
*::-webkit-scrollbar-thumb:active{background:#f0c040}
*::-webkit-scrollbar-corner{background:transparent}
`;

const STYLE_ID = 'ao-scrollbars';

/** Injects the scrollbar CSS once; later calls are no-ops. */
export function installScrollbars(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = Object.assign(document.createElement('style'), {
    id: STYLE_ID,
    textContent: SCROLLBAR_CSS,
  });
  document.head.append(style);
}
