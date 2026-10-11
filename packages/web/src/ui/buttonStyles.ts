/** Shared button look and "press down" effect for the Hooks and project picker panels. */
const BUTTONS = [
  '.ao-hooks-box button',
  '.ao-hooks-banner button',
  '.ao-hooks-btn',
  '.ao-picker-box button:not(.star)',
  '.ao-picker-btn',
  '.ao-zoom-btn',
];

const each = (suffix: string): string =>
  BUTTONS.map((selector) => `${selector}${suffix}`).join(',');

export const BUTTON_CSS = `
${each('')}{font:12px monospace;background:#2a2d44;color:#f0e6b8;border:2px solid #f0c040;
  cursor:pointer;box-shadow:0 3px 0 #000a;transform:translateY(0);
  transition:transform .06s,box-shadow .06s,background .12s}
${each(':hover:not(:disabled)')}{background:#34385a}
${each(':active:not(:disabled)')}{transform:translateY(3px);box-shadow:0 0 0 #000a}
${each(':focus-visible')}{outline:2px solid #9ad1ff;outline-offset:2px}
${each(':disabled')}{opacity:.45;cursor:default;box-shadow:none}
`;
