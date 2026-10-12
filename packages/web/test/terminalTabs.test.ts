import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../src/i18n/i18n';
import {
  activeTab,
  addTab,
  applyActivity,
  clampHeight,
  clampWidth,
  clipboardAction,
  collapse,
  createPanelModel,
  exitMessage,
  isToggleShortcut,
  keyboardOwner,
  layoutKey,
  MIN_OFFICE_HEIGHT,
  MIN_OFFICE_WIDTH,
  MIN_PANEL_HEIGHT,
  MIN_PANEL_WIDTH,
  markExited,
  needsCloseConfirm,
  panelOccupiedHeight,
  panelOccupiedSize,
  parseStoredPanel,
  projectName,
  removeTab,
  setActive,
  setDock,
  setFocus,
  setHeight,
  setWidth,
  TAB_BAR_HEIGHT,
  type TerminalTab,
  tabTitle,
  terminalBridgeOf,
  toggleCollapsed,
  wheelScrollTabs,
} from '../src/ui/terminalTabs';

const tab = (id: string, cwd = `/work/${id}`): TerminalTab => ({ id, cwd, state: 'running' });

beforeEach(() => setLocale('pt-BR'));
afterEach(() => setLocale('en'));

describe('titles', () => {
  it('uses the last folder', () => {
    expect(projectName('/home/a/proj/')).toBe('proj');
    expect(projectName('C:\\Users\\a\\proj')).toBe('proj');
    expect(projectName('/')).toBe('/');
    expect(tabTitle(tab('1', '/x/api'))).toBe('api');
    expect(tabTitle({ ...tab('1', '/x/api'), state: 'exited' })).toBe('api');
  });

  it('adds the profile name while running', () => {
    expect(tabTitle({ ...tab('1', '/x/api'), activity: 'Designer' })).toBe('api · Designer');
    expect(tabTitle({ ...tab('1', '/x/api'), state: 'exited', activity: 'Designer' })).toBe('api');
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
    setLocale('en');
    expect(exitMessage({ ...tab('1'), state: 'exited', exitCode: 2 })).toBe(
      'Process ended (code 2)',
    );
    setLocale('es');
    expect(exitMessage(tab('1'))).toBe('El proceso terminó');
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
    expect(clampHeight(500, 200)).toBe(200 - MIN_OFFICE_HEIGHT);
    expect(clampHeight(500, 100)).toBe(0);
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

describe('dock and width', () => {
  const withTabs = (m = createPanelModel()) => addTab(m, tab('1'));

  it('defaults to the bottom with the default width', () => {
    const m = createPanelModel();
    expect(m.dock).toBe('bottom');
    expect(m.width).toBe(480);
  });

  it('changes the dock and keeps the model when unchanged', () => {
    const m = createPanelModel();
    expect(setDock(m, 'left').dock).toBe('left');
    expect(setDock(m, 'bottom')).toBe(m);
  });

  it('clamps the width between the panel minimum and the office minimum', () => {
    expect(clampWidth(10, 1200)).toBe(MIN_PANEL_WIDTH);
    expect(clampWidth(5000, 1200)).toBe(1200 - MIN_OFFICE_WIDTH);
    expect(clampWidth(300.4, 1200)).toBe(300);
    expect(clampWidth(500, 300)).toBe(300 - MIN_OFFICE_WIDTH);
    expect(clampWidth(500, 100)).toBe(0);
    expect(setWidth(createPanelModel(), 9999, 1000).width).toBe(1000 - MIN_OFFICE_WIDTH);
  });

  it('reports the occupied size by dock', () => {
    const m = withTabs();
    expect(panelOccupiedSize(createPanelModel())).toEqual({ axis: 'height', size: 0 });
    expect(panelOccupiedSize(m)).toEqual({ axis: 'height', size: m.height });
    const left = setDock(m, 'left');
    expect(panelOccupiedSize(left)).toEqual({ axis: 'width', size: m.width });
    expect(panelOccupiedSize(setDock(m, 'right'))).toEqual({ axis: 'width', size: m.width });
    expect(panelOccupiedSize(collapse(left))).toEqual({ axis: 'width', size: TAB_BAR_HEIGHT });
    expect(panelOccupiedSize(collapse(m))).toEqual({ axis: 'height', size: TAB_BAR_HEIGHT });
    expect(panelOccupiedSize(setDock(createPanelModel(), 'right'))).toEqual({
      axis: 'width',
      size: 0,
    });
  });

  it('collapses idempotently and returns the keyboard to the player', () => {
    const focused = setFocus(withTabs(), 'terminal');
    const once = collapse(focused);
    expect(once.collapsed).toBe(true);
    expect(once.focus).toBe('player');
    expect(collapse(once)).toBe(once);
  });
});

describe('stored panel', () => {
  it('migrates old values without dock and width', () => {
    expect(parseStoredPanel({ height: 300, collapsed: true })).toEqual({
      height: 300,
      dock: 'bottom',
      collapsed: true,
    });
  });

  it('keeps valid dock and width', () => {
    expect(parseStoredPanel({ height: 200, width: 500, dock: 'right', collapsed: false })).toEqual({
      height: 200,
      width: 500,
      dock: 'right',
      collapsed: false,
    });
  });

  it('discards invalid values', () => {
    expect(parseStoredPanel({ height: -3, width: 'x', dock: 'top', collapsed: 'yes' })).toEqual({
      dock: 'bottom',
      collapsed: false,
    });
    expect(parseStoredPanel(null)).toEqual({ dock: 'bottom', collapsed: false });
    expect(parseStoredPanel('junk')).toEqual({ dock: 'bottom', collapsed: false });
    expect(parseStoredPanel({ height: Number.NaN })).toEqual({ dock: 'bottom', collapsed: false });
  });
});

describe('layoutKey', () => {
  const withTabs = () => addTab(createPanelModel(), tab('1'));
  it('ignores activity, focus and active tab, but not dock, size or minimized', () => {
    const m = withTabs();
    const key = layoutKey(m);
    expect(layoutKey(applyActivity(m, { 1: 'working' }))).toBe(key);
    expect(layoutKey(setFocus(m, 'terminal'))).toBe(key);
    expect(layoutKey(setDock(m, 'left'))).not.toBe(key);
    expect(layoutKey(setDock(m, 'left'))).not.toBe(layoutKey(setDock(m, 'right')));
    expect(layoutKey(setHeight(m, m.height + 40, 1000))).not.toBe(key);
    expect(layoutKey(collapse(m))).not.toBe(key);
    expect(layoutKey(collapse(setDock(m, 'left')))).not.toBe(layoutKey(setDock(m, 'left')));
  });
});

describe('wheelScrollTabs', () => {
  it('maps deltaY to scrollLeft when the bar overflows', () => {
    const bar = { scrollLeft: 10, scrollWidth: 500, clientWidth: 200 };
    expect(wheelScrollTabs(bar, 40)).toBe(true);
    expect(bar.scrollLeft).toBe(50);
  });

  it('leaves the event alone without overflow or delta', () => {
    const bar = { scrollLeft: 0, scrollWidth: 200, clientWidth: 200 };
    expect(wheelScrollTabs(bar, 40)).toBe(false);
    expect(bar.scrollLeft).toBe(0);
    expect(wheelScrollTabs({ scrollLeft: 0, scrollWidth: 500, clientWidth: 200 }, 0)).toBe(false);
  });
});

describe('browser tab', () => {
  const terminal = { id: 't1', cwd: '/w/proj', state: 'running' as const };

  it('opens one browser tab per workspace and activates it', async () => {
    const t = await import('../src/ui/terminalTabs');
    let model = t.addTab(t.createPanelModel(), terminal);
    model = t.openBrowserTab(model, '/w/proj');
    model = t.openBrowserTab(model, '/w/proj');
    expect(model.tabs.map((x) => x.id)).toEqual(['t1', t.browserTabId('/w/proj')]);
    expect(model.activeId).toBe(t.browserTabId('/w/proj'));
    expect(t.tabTitle(model.tabs[1] as never)).toBe('Navegador · proj');
    setLocale('en');
    expect(t.tabTitle(model.tabs[1] as never)).toBe('Browser · proj');
  });

  it('targets the active (else last) tab workspace', async () => {
    const t = await import('../src/ui/terminalTabs');
    expect(t.browserTargetCwd(t.createPanelModel())).toBeUndefined();
    const model = t.addTab(t.createPanelModel(), terminal);
    expect(t.browserTargetCwd(model)).toBe('/w/proj');
  });

  it('closing it needs no confirmation and the office sees no terminal while it is shown', async () => {
    const t = await import('../src/ui/terminalTabs');
    const model = t.openBrowserTab(t.addTab(t.createPanelModel(), terminal), '/w/proj');
    expect(t.needsCloseConfirm(model.tabs[1] as never)).toBe(false);
    expect(t.needsCloseConfirm(terminal)).toBe(true);
    expect(t.shownTerminalId(model)).toBeUndefined();
    expect(t.shownTerminalId(t.setActive(model, 't1'))).toBe('t1');
    expect(t.shownTerminalId(t.toggleCollapsed(t.setActive(model, 't1')))).toBeUndefined();
    const after = t.removeTab(model, t.browserTabId('/w/proj'));
    expect(after.tabs.map((x) => x.id)).toEqual(['t1']);
  });

  it('browserBridgeOf needs the desktop shell and a browser bridge', async () => {
    const t = await import('../src/ui/terminalTabs');
    expect(t.browserBridgeOf({})).toBeUndefined();
    expect(t.browserBridgeOf({ agentsOfficeDesktop: { desktop: true } })).toBeUndefined();
    const browser = { show: () => {} };
    expect(t.browserBridgeOf({ agentsOfficeDesktop: { desktop: true, browser } })).toBe(browser);
  });
});
