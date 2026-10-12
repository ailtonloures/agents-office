import type { BrowserPick } from '@agents-office/shared';
import { t } from '../i18n/i18n';
import type { TerminalTab } from './terminalTabs';
import { isBrowserTab, projectName } from './terminalTabs';

// Pure part of "Select element" (spec 084): the text handed to an agent, the list of agents
// that may receive it and the bytes written to their terminal.

/** Header and footer of the picked-element context, in the active language. */
export const pickContextHeader = (): string => t('browser.context.header');
export const pickContextFooter = (): string => t('browser.context.footer');

/** Control characters (terminal escapes included) never reach the terminal; \n and \t stay. */
export function sanitizeForTerminal(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: that is exactly what is removed
  return text.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, '');
}

/** The editable context of a picked element, with fixed labels. */
export function formatPickContext(pick: BrowserPick): string {
  const lines = [
    pickContextHeader(),
    t('browser.context.untrusted'),
    t('browser.context.page', {
      title: pick.title || t('browser.context.untitled'),
      url: pick.url,
    }),
    t('browser.context.selector', { value: pick.selector }),
    t('browser.context.element', { tag: pick.tag }),
  ];
  if (pick.screenshotPath) {
    lines.push(t('browser.context.screenshot', { path: pick.screenshotPath }));
  }
  lines.push(
    pick.textTruncated ? t('browser.context.text.truncated') : t('browser.context.text'),
    pick.text === '' ? t('browser.context.empty') : pick.text,
    pick.htmlTruncated ? t('browser.context.html.truncated') : t('browser.context.html'),
    pick.html === '' ? t('browser.context.empty') : pick.html,
    pickContextFooter(),
  );
  return sanitizeForTerminal(lines.join('\n'));
}

const PASTE_START = '\u001b[200~';
const PASTE_END = '\u001b[201~';

/**
 * Bytes written to the terminal: a bracketed paste (line breaks do not submit anything) of the
 * sanitized text, with no Enter. The user submits it in the terminal.
 */
export function ptyPayload(text: string): string {
  return `${PASTE_START}${sanitizeForTerminal(text)}\n${PASTE_END}`;
}

export interface PickTarget {
  id: string;
  label: string;
}

/** Running terminals of the user's dock (the agents connected to the user), same workspace first. */
export function pickTargets(tabs: readonly TerminalTab[], cwd: string): PickTarget[] {
  const candidates = tabs.filter((tab) => !isBrowserTab(tab) && tab.state === 'running');
  const sorted = [
    ...candidates.filter((tab) => tab.cwd === cwd),
    ...candidates.filter((tab) => tab.cwd !== cwd),
  ];
  return sorted.map((tab) => ({
    id: tab.id,
    label: `${projectName(tab.cwd)}${tab.activity ? ` · ${tab.activity}` : ''}`,
  }));
}

/** Writes the reviewed context to the chosen terminal. Rejects when there is nothing to send. */
export async function sendPickContext(
  write: (id: string, data: string) => Promise<void>,
  targetId: string,
  text: string,
): Promise<void> {
  if (text.trim() === '') throw new Error('empty');
  await write(targetId, ptyPayload(text));
}
