import type Phaser from 'phaser';
import {
  readStoredZoom,
  ZOOM_CHANGED_EVENT,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP_EVENT,
  type ZoomChange,
  type ZoomDirection,
} from '../zoom';
import { BUTTON_CSS } from './buttonStyles';

export interface ZoomControlsState {
  inDisabled: boolean;
  outDisabled: boolean;
  /** The overview ignores the user zoom, so the buttons go away. */
  hidden: boolean;
}

/** Which buttons are usable at this zoom level. */
export function zoomControlsState(zoom: number, overview: boolean): ZoomControlsState {
  return { inDisabled: zoom >= ZOOM_MAX, outDisabled: zoom <= ZOOM_MIN, hidden: overview };
}

const CSS = `
.ao-zoom-controls{position:absolute;right:12px;bottom:12px;z-index:5;display:flex;
  flex-direction:column;gap:8px}
.ao-zoom-controls[hidden]{display:none}
.ao-zoom-btn{width:36px;height:36px;padding:0;font-size:20px;line-height:1}
${BUTTON_CSS}`;

/** The "+" / "-" buttons at the bottom-right of the game area; they only emit zoom-step events. */
export function mountZoomControls(game: Phaser.Game, parent: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const box = document.createElement('div');
  box.className = 'ao-zoom-controls';
  const make = (testId: string, text: string, label: string, direction: ZoomDirection) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ao-zoom-btn';
    button.dataset.testid = testId;
    button.textContent = text;
    button.setAttribute('aria-label', label);
    button.title = label;
    // Keep the click away from the canvas (the avatar walks to clicked tiles).
    for (const type of ['pointerdown', 'mousedown', 'click'])
      button.addEventListener(type, (event) => event.stopPropagation());
    button.addEventListener('click', () => game.events.emit(ZOOM_STEP_EVENT, direction));
    return button;
  };
  const zoomIn = make('zoom-in', '+', 'Aproximar', 1);
  const zoomOut = make('zoom-out', '−', 'Afastar', -1);
  box.append(zoomIn, zoomOut);
  parent.append(box);

  const render = ({ zoom, overview }: ZoomChange) => {
    const state = zoomControlsState(zoom, overview);
    zoomIn.disabled = state.inDisabled;
    zoomOut.disabled = state.outDisabled;
    box.hidden = state.hidden;
  };
  render({ zoom: readStoredZoom(), overview: false });
  game.events.on(ZOOM_CHANGED_EVENT, render);
}
