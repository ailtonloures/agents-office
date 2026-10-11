import Phaser from 'phaser';
import {
  type LoadedSkin,
  loadSkinManifest,
  planSkinAssets,
  registerPropFrames,
  SKIN_KEYS,
} from '../skin';

export const REGISTRY_SKIN = 'skin';
export const REGISTRY_SKIN_WARNING = 'skinWarning';
/** Scene started once the skin is loaded (default: the office). */
export const REGISTRY_START_SCENE = 'startScene';
/** Game event emitted by the first real scene once it has been created (hides the splash). */
export const EVENT_SCENE_READY = 'sceneReady';

/** Resolves the skin (external `/skin/skin.json` or the bundled default) and loads its assets. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    void this.boot();
  }

  private async boot(): Promise<void> {
    let loaded = await loadSkinManifest();
    if (loaded.warning) this.registry.set(REGISTRY_SKIN_WARNING, loaded.warning);

    const failed = await this.loadAssets(loaded);
    if (failed.length > 0 && loaded.source === 'external') {
      this.registry.set(
        REGISTRY_SKIN_WARNING,
        `External skin failed to load (${failed[0]}); using the default skin.`,
      );
      this.unloadAssets();
      loaded = await loadSkinManifest({ externalUrl: '' });
      await this.loadAssets(loaded);
    }
    registerPropFrames(this.textures, loaded.skin);
    this.registry.set(REGISTRY_SKIN, loaded);
    this.scene.start(
      (this.registry.get(REGISTRY_START_SCENE) as string | undefined) ?? 'OfficeScene',
    );
  }

  /** Queues the skin assets and resolves with the files that failed. */
  private loadAssets({ skin, baseUrl }: LoadedSkin): Promise<string[]> {
    return new Promise((resolve) => {
      const failed: string[] = [];
      for (const asset of planSkinAssets(skin, baseUrl)) {
        if (asset.type === 'spritesheet') {
          this.load.spritesheet(asset.key, asset.url, {
            frameWidth: asset.frameWidth,
            frameHeight: asset.frameHeight,
          });
        } else if (asset.type === 'image') {
          this.load.image(asset.key, asset.url);
        } else {
          this.load.bitmapFont(asset.key, asset.url, asset.dataUrl);
        }
      }
      this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
        failed.push(file.url as string);
      });
      this.load.once(Phaser.Loader.Events.COMPLETE, () => {
        this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR);
        resolve(failed);
      });
      this.load.start();
    });
  }

  private unloadAssets(): void {
    for (const key of this.textures.getTextureKeys()) {
      if (key.startsWith('skin.')) this.textures.remove(key);
    }
    this.cache.bitmapFont.remove(SKIN_KEYS.font);
    this.cache.bitmapFont.remove(SKIN_KEYS.fontSmall);
  }
}
