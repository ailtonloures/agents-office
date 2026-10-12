import { describe, expect, it } from 'vitest';
import { type ClickInput, decideClick } from '../src/ui/clickDecision';

const base: ClickInput = {
  target: 'tech-lead',
  session: { terminalId: 't1' },
  desktop: true,
  tabExists: true,
  overlayOpen: false,
};

describe('decideClick', () => {
  it.each([
    ['internal Tech Lead', {}, 'open-terminal'],
    ['external Tech Lead', { session: {} }, 'open-dialog'],
    ['Tech Lead without session data', { session: undefined }, 'open-dialog'],
    ['closed tab', { tabExists: false }, 'open-dialog'],
    ['Tech Lead in a plain browser', { desktop: false }, 'open-dialog'],
    ['subagent', { target: 'other' }, 'collapse'],
    ['empty space', { target: 'empty', session: undefined }, 'collapse'],
    ['empty space in a browser', { target: 'empty', desktop: false }, 'none'],
    ['subagent in a browser', { target: 'other', desktop: false }, 'open-dialog'],
    ['whiteboard in the app', { target: 'board', session: undefined }, 'open-board'],
    ['whiteboard in a browser', { target: 'board', session: undefined, desktop: false }, 'none'],
    ['overlay over a whiteboard', { target: 'board', overlayOpen: true }, 'none'],
    ['overlay over a Tech Lead', { overlayOpen: true }, 'none'],
    ['overlay over empty space', { overlayOpen: true, target: 'empty' }, 'none'],
  ] as [string, Partial<ClickInput>, string][])('%s -> %s', (_name, patch, expected) => {
    expect(decideClick({ ...base, ...patch })).toBe(expected);
  });
});
