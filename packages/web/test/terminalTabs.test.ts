import { describe, expect, it } from 'vitest';
import {
  activeTab,
  addTab,
  applyActivity,
  clampHeight,
  clipboardAction,
  createPanelModel,
  exitMessage,
  isToggleShortcut,
  keyboardOwner,
  MIN_OFFICE_HEIGHT,
  MIN_PANEL_HEIGHT,
  markExited,
  needsCloseConfirm,
  panelOccupiedHeight,
  projectName,
  removeTab,
  setActive,
  setFocus,
  setHeight,
  TAB_BAR_HEIGHT,
  type TerminalTab,
  tabTitle,
  terminalBridgeOf,
  toggleCollapsed,
} from '../src/ui/terminalTabs';

const tab = (id: string, cwd = `/work/${id}`): TerminalTab => ({ id, cwd, state: 'running' });

describe('titles', () => {
  it('uses the last folder and the state', () => {
    expect(projectName('/home/a/proj/')).toBe('proj');
    expect(projectName('C:\\Users\\a\\proj')).toBe('proj');
    expect(projectName('/')).toBe('/');
    expect(tabTitle(tab('1', '/x/api'))).toBe('api · ativa');
    expect(tabTitle({ ...tab('1', '/x/api'), state: 'exited' })).toBe('api · encerrada');
  });

  it('shows the office state of the bound session while running', () => {
    expect(tabTitle({ ...tab('1', '/x/api'), activity: 'pensando' })).toBe(
      'api · ativa · pensando',
    );
    expect(tabTitle({ ...tab('1', '/x/api'), state: 'exited', activity: 'pensando' })).toBe(
      'api · encerrada',
    );
  });

  it('applyActivity sets, changes and clears the activity per tab, keeping identity when equal', () => {
    const model = addTab(addTab(createPanelModel(), tab('a')), tab('b'));
    const withA = applyActivity(model, { a: 'trabalhando' });
    expect(withA.tabs.find((t) => t.id === 'a')?.activity).toBe('trabalhando');
    expect(withA.tabs.find((t) => t.id === 'b')?.activity).toBeUndefined();
    expect(applyActivity(withA, { a: 'trabalhando' })).toBe(withA);
    const cleared = applyActivity(withA, {});
    expect(cleared.tabs.find((t) => t.id === 'a')).not.toHaveProperty('activity');
  });

  it('describes the exit', () => {
    expect(exitMessage({ ...tab('1'), state: 'exited', exitCode: 2 })).toBe(
      'Processo terminou (código 2)',
    );
    expect(exitMessage(tab('1'))).toBe('Processo terminou');
  });
});

describe('tabs', () => {
  it('adds, activates and ignores duplicates', () => {
    let m = addTab(createPanelModel(), tab('a'));
    m = addTab(m, tab('b'));
    expect(m.activeId).toBe('b');
    expect(addTab(m, tab('a'), false)).toBe(m);
    expect(addTab(m, tab('a')).activeId).toBe('a');
    expect(addTab(m, tab('c'), false).activeId).toBe('b');
    expect(m.tabs).toHaveLength(2);
  });

  it('first tab becomes active even when not asked to activate', () => {
    expect(addTab(createPanelModel(), tab('a'), false).activeId).toBe('a');
  });

  it('removing the active tab selects the neighbour, then nothing', () => {
    let m = addTab(addTab(addTab(createPanelModel(), tab('a')), tab('b')), tab('c'));
    m = setActive(m, 'b');
    m = removeTab(m, 'b');
    expect(m.activeId).toBe('c');
    m = removeTab(m, 'c');
    expect(m.activeId).toBe('a');
    m = removeTab(m, 'a');
    expect(m.activeId).toBeUndefined();
    expect(removeTab(m, 'zzz')).toBe(m);
  });

  it('removing another tab keeps the active one; setActive ignores unknown ids', () => {
    const m = addTab(addTab(createPanelModel(), tab('a')), tab('b'));
    expect(removeTab(m, 'a').activeId).toBe('b');
    expect(setActive(m, 'nope')).toBe(m);
  });

  it('marks exits and asks to confirm only for live sessions', () => {
    const m = markExited(addTab(createPanelModel(), tab('a')), 'a', 130);
    const t = activeTab(m);
    expect(t).toMatchObject({ state: 'exited', exitCode: 130 });
    expect(needsCloseConfirm(tab('a'))).toBe(true);
    expect(needsCloseConfirm(t as TerminalTab)).toBe(false);
  });
});

describe('focus and collapse', () => {
  it('the terminal only owns the keyboard when visible and focused', () => {
    let m = createPanelModel();
    expect(setFocus(m, 'terminal').focus).toBe('player'); // no tabs
    m = addTab(m, tab('a'));
    expect(keyboardOwner(m)).toBe('player');
    m = setFocus(m, 'terminal');
    expect(keyboardOwner(m)).toBe('terminal');
    m = toggleCollapsed(m);
    expect(m.collapsed).toBe(true);
    expect(keyboardOwner(m)).toBe('player');
    expect(setFocus(m, 'terminal').focus).toBe('player');
    expect(toggleCollapsed(m).collapsed).toBe(false);
  });

  it('closing the last tab gives the keyboard back', () => {
    const m = setFocus(addTab(createPanelModel(), tab('a')), 'terminal');
    expect(removeTab(m, 'a').focus).toBe('player');
  });
});

describe('size', () => {
  it('clamps between the minimum and what the office needs', () => {
    expect(clampHeight(10, 900)).toBe(MIN_PANEL_HEIGHT);
    expect(clampHeight(2000, 900)).toBe(900 - MIN_OFFICE_HEIGHT);
    expect(clampHeight(300.4, 900)).toBe(300);
    expect(clampHeight(500, 200)).toBe(MIN_PANEL_HEIGHT);
  });

  it('occupied height follows tabs and collapse', () => {
    let m = setHeight(createPanelModel(), 350, 900);
    expect(panelOccupiedHeight(m)).toBe(0);
    m = addTab(m, tab('a'));
    expect(panelOccupiedHeight(m)).toBe(350);
    expect(panelOccupiedHeight(toggleCollapsed(m))).toBe(TAB_BAR_HEIGHT);
  });
});

describe('keys', () => {
  it('Ctrl+` toggles, other combinations do not', () => {
    expect(isToggleShortcut({ key: '`', ctrlKey: true })).toBe(true);
    expect(isToggleShortcut({ key: 'Dead', code: 'Backquote', ctrlKey: true })).toBe(true);
    expect(isToggleShortcut({ key: '`', ctrlKey: false })).toBe(false);
    expect(isToggleShortcut({ key: '`', ctrlKey: true, shiftKey: true })).toBe(false);
  });

  const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

  it('copy / paste mapping', () => {
    expect(clipboardAction(key('C', { ctrlKey: true, shiftKey: true }), false)).toBe('copy');
    expect(clipboardAction(key('V', { ctrlKey: true, shiftKey: true }), false)).toBe('paste');
    expect(clipboardAction(key('c', { ctrlKey: true }), true)).toBe('copy');
    expect(clipboardAction(key('c', { ctrlKey: true }), false)).toBeUndefined(); // interrupt
    expect(clipboardAction(key('v', { ctrlKey: true }), false)).toBeUndefined();
    expect(clipboardAction(key('c', { metaKey: true }), true)).toBe('copy');
    expect(clipboardAction(key('v', { metaKey: true }), false)).toBe('paste');
    expect(clipboardAction(key('a'), true)).toBeUndefined();
  });
});

describe('terminalBridgeOf', () => {
  it('is undefined outside the desktop shell', () => {
    expect(terminalBridgeOf({})).toBeUndefined();
    expect(terminalBridgeOf({ agentsOfficeDesktop: { desktop: true } })).toBeUndefined();
  });

  it('returns the bridge inside the shell', () => {
    const terminal = { start: () => Promise.resolve() };
    expect(terminalBridgeOf({ agentsOfficeDesktop: { desktop: true, terminal } })).toBe(terminal);
  });
});
