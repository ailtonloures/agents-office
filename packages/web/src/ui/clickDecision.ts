// What a click on the office does (spec 041). Pure: the scene gathers the facts, this decides.

export type ClickDecision = 'open-terminal' | 'open-dialog' | 'collapse' | 'none';

export interface ClickInput {
  /** What was clicked: a Tech Lead (a session), any other character, or nothing. */
  target: 'tech-lead' | 'other' | 'empty';
  /** The clicked Tech Lead's session; `terminalId` binds it to a tab of the app. */
  session?: { terminalId?: string };
  /** Running inside the desktop app (terminal panel available). */
  desktop: boolean;
  /** The terminal tab of the session still exists. */
  tabExists: boolean;
  /** A dialog or the help screen is open: the click only closes it. */
  overlayOpen: boolean;
}

export function decideClick(input: ClickInput): ClickDecision {
  if (input.overlayOpen) return 'none';
  if (input.target === 'tech-lead') {
    const internal = input.session?.terminalId !== undefined && input.tabExists;
    return input.desktop && internal ? 'open-terminal' : 'open-dialog';
  }
  if (input.desktop) return 'collapse';
  // No terminal to minimize in a plain browser: a subagent keeps opening its dialog.
  return input.target === 'other' ? 'open-dialog' : 'none';
}
