import Phaser from 'phaser';

type Filterable = Phaser.GameObjects.GameObject & { cameraFilter: number };

/**
 * Screen-fixed UI drawn by its own camera. `setScrollFactor(0)` only stops an object from
 * scrolling; it is still scaled by the camera zoom. So the UI lives in `layer`, which the main
 * (zoomed) camera skips and `camera` (zoom 1, no scroll) draws, while `camera` skips the world.
 */
export class UiOverlay {
  readonly layer: Phaser.GameObjects.Layer;
  readonly camera: Phaser.Cameras.Scene2D.Camera;
  private readonly pending = new Set<Phaser.GameObjects.GameObject>();

  constructor(private readonly scene: Phaser.Scene) {
    const { width, height } = scene.scale;
    this.layer = scene.add.layer();
    this.camera = scene.cameras.add(0, 0, width, height, false, 'ui');
    // The layer's own filter hides all of its children from the main camera, now and later.
    this.layer.cameraFilter |= scene.cameras.main.id;
    for (const object of scene.children.list) this.pending.add(object);
    scene.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.flush, this);
  }

  /** Moves `objects` into the UI layer (they keep their depth). */
  add(...objects: Phaser.GameObjects.GameObject[]): void {
    this.layer.add(objects);
  }

  /** Whether `camera` would draw `object` (a layer child's check includes the layer's filter). */
  isDrawnBy(camera: Phaser.Cameras.Scene2D.Camera, object: Phaser.GameObjects.GameObject) {
    return object.willRender(camera);
  }

  resize(width: number, height: number): void {
    this.camera.setSize(width, height);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, this.onAdded, this);
    this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.flush, this);
    this.pending.clear();
    this.scene.cameras.remove(this.camera);
  }

  /** New objects are judged at render time: a UI part is created first and added to its container or the layer right after. */
  private onAdded(object: Phaser.GameObjects.GameObject): void {
    this.pending.add(object);
  }

  private flush(): void {
    const world = this.scene.sys.displayList;
    for (const object of this.pending) {
      // Only top-level display-list objects: children of a container or of the layer follow it.
      if ((object as unknown) === this.layer || object.displayList !== world) continue;
      (object as Filterable).cameraFilter |= this.camera.id;
    }
    this.pending.clear();
  }
}
