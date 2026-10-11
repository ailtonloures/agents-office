import Phaser from 'phaser';
import { installDebugState } from './debug/debugState';
import { startDemo } from './net/demo';
import { OfficeClient } from './net/officeClient';
import { computeViewport } from './scale';
import { BootScene, REGISTRY_START_SCENE } from './scenes/BootScene';
import { CharactersDebugScene, DEBUG_CHARACTERS_SCENE } from './scenes/CharactersDebugScene';
import { OfficeScene, REGISTRY_CLIENT } from './scenes/OfficeScene';
import { externalBridgeOf, openInVSCodeWithToast } from './ui/externalOpen';
import { mountLostSessions } from './ui/lostSessions';
import { officeCwds, pickerBridgesOf } from './ui/projectPicker';
import { mountProjectPicker } from './ui/projectPickerPanel';
import { activityByTerminal, claudeSessionByTerminal } from './ui/sessionBinding';
import { hooksBridgeOf } from './ui/settingsLogic';
import { mountSettingsPanel } from './ui/settingsPanel';
import { mountTerminalPanel } from './ui/terminalPanel';
import { terminalBridgeOf } from './ui/terminalTabs';
import { mountZoomControls } from './ui/zoomControls';

const query = new URLSearchParams(window.location.search);
const debugCharacters = query.get('debug') === 'characters';
const demo = query.has('demo');
const client = new OfficeClient();
installDebugState();

const gameParent = document.getElementById('game') as HTMLElement;
/** The office area: the window minus the terminal panel (the zoom stays a whole number). */
const areaSize = () => ({
  width: gameParent.clientWidth || window.innerWidth,
  height: gameParent.clientHeight || window.innerHeight,
});
const initial = computeViewport(areaSize().width, areaSize().height, window.devicePixelRatio);
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: initial.width,
  height: initial.height,
  backgroundColor: '#000000',
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  scale: {
    // FIT scales by a fractional factor: the game is resized to fill the window at an integer zoom.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    zoom: initial.zoom,
  },
  scene: [BootScene, OfficeScene, CharactersDebugScene],
});
// BootScene awaits network requests before OfficeScene starts, so the client is set in time.
game.registry.set(REGISTRY_CLIENT, client);
if (debugCharacters) game.registry.set(REGISTRY_START_SCENE, DEBUG_CHARACTERS_SCENE);

/** Scenes listen to the scale manager's `resize` event to lay out their screen-fixed objects. */
function resize(): void {
  const area = areaSize();
  const { zoom, width, height } = computeViewport(area.width, area.height, window.devicePixelRatio);
  game.scale.setZoom(zoom);
  game.scale.resize(width, height);
}
window.addEventListener('resize', resize);

// Ctrl + wheel over the game zooms the office, not the page (the terminal panel is outside the canvas).
game.canvas.addEventListener(
  'wheel',
  (event) => {
    if (event.ctrlKey) event.preventDefault();
  },
  { passive: false },
);

mountZoomControls(game, gameParent);

if (demo) startDemo(client);
else if (!debugCharacters) client.start();

// The Hooks screen only exists inside the desktop shell (it needs the IPC bridge).
const hooksBridge = hooksBridgeOf(window);
if (hooksBridge) mountSettingsPanel(hooksBridge);

// The terminal panel only exists inside the desktop shell (it needs the pty bridge).
const terminalBridge = terminalBridgeOf(window);
const externalBridge = externalBridgeOf(window);
if (terminalBridge) {
  const panel = mountTerminalPanel(terminalBridge, {
    gameParent,
    onLayout: resize,
    onOpenInVSCode: externalBridge
      ? (cwd) => void openInVSCodeWithToast(externalBridge, cwd)
      : undefined,
    // While the terminal has the keyboard Phaser must not read keys (WASD, Z, Tab...).
    onKeyboardOwner: (owner) => {
      const keyboard = game.input.keyboard;
      if (!keyboard) return;
      keyboard.enabled = owner === 'player';
      if (owner !== 'player') {
        for (const scene of game.scene.getScenes(true)) scene.input.keyboard?.resetKeys();
      }
    },
  });
  const canvasPointer = () => {
    panel.focusPlayer();
  };
  game.canvas.addEventListener('mousedown', canvasPointer);

  // What the game can do in the shell (the room door, the Tech Lead dialog), and the tab titles
  // that follow the state of the session bound to each tab.
  window.__desktopActions = {
    openProjectPicker: (cwd) => window.__projectPicker?.open(cwd),
    openTerminal: (terminalId) => panel.focusSession(terminalId),
    openInVSCode: async (cwd) => {
      if (externalBridge) await openInVSCodeWithToast(externalBridge, cwd);
    },
  };
  const syncTabActivity = () => panel.setActivity(activityByTerminal(client.getModel()));
  client.on('model', syncTabActivity);
  syncTabActivity();

  // Tell the shell which Claude session runs in each tab (for `--resume` after a crash), and offer
  // to resume the tabs a previous run lost.
  const noted = new Map<string, string>();
  const noteSessions = () => {
    for (const [tab, sessionId] of Object.entries(claudeSessionByTerminal(client.getModel()))) {
      if (noted.get(tab) === sessionId) continue;
      noted.set(tab, sessionId);
      void terminalBridge.noteSession(tab, sessionId).catch(() => noted.delete(tab));
    }
  };
  client.on('model', noteSessions);
  noteSessions();
  mountLostSessions(terminalBridge);

  // The project picker (needs the pty and catalog bridges) lives outside the game canvas.
  const pickerBridges = pickerBridgesOf(window);
  if (pickerBridges) {
    window.__projectPicker = mountProjectPicker(pickerBridges, {
      knownCwds: () => officeCwds(client.getModel()),
      onKeyboardCapture: (captured) => {
        const keyboard = game.input.keyboard;
        if (!keyboard) return;
        keyboard.enabled = !captured && !panel.terminalFocused;
        if (captured)
          for (const scene of game.scene.getScenes(true)) scene.input.keyboard?.resetKeys();
      },
    });
  }
  new ResizeObserver(() => resize()).observe(gameParent);
}
