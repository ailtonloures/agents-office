import type Phaser from 'phaser';

/** Registry key holding the render scale: canvas pixels per game pixel (a whole number). */
export const REGISTRY_RENDER_SCALE = 'renderScale';

/** The render scale the canvas is drawn at (1 until `main.ts` publishes it). */
export function renderScaleOf(scene: Phaser.Scene): number {
  const value = scene.registry.get(REGISTRY_RENDER_SCALE) as number | undefined;
  return value && value > 0 ? value : 1;
}

/**
 * The logical game size (the canvas divided by the render scale). Screen-fixed UI is laid out in
 * these units; the `ui` camera zooms them up to canvas pixels.
 */
export function logicalSizeOf(scene: Phaser.Scene): { width: number; height: number } {
  const scale = renderScaleOf(scene);
  return { width: scene.scale.width / scale, height: scene.scale.height / scale };
}
