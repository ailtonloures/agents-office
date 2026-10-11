import type { Profession } from '@agents-office/shared';
import type { Skin } from './schema';

export const SKIN_KEYS = {
  tileset: 'skin.tileset',
  body: 'skin.body',
  hair: (index: number) => `skin.hair.${index}`,
  outfit: (profession: Profession) => `skin.outfit.${profession}`,
  accessory: (profession: Profession) => `skin.accessory.${profession}`,
  props: 'skin.props',
  font: 'skin.font',
  fontSmall: 'skin.font.small',
  fontLabel: 'skin.font.label',
} as const;

export type SkinAsset =
  | { type: 'spritesheet'; key: string; url: string; frameWidth: number; frameHeight: number }
  | { type: 'image'; key: string; url: string }
  | { type: 'bitmapFont'; key: string; url: string; dataUrl: string };

/** Everything the Phaser loader must fetch for a skin, with absolute URLs. */
export function planSkinAssets(skin: Skin, baseUrl: string): SkinAsset[] {
  const at = (path: string) => `${baseUrl}${path}`;
  const { frame } = skin.characters;
  const sheet = (key: string, path: string): SkinAsset => ({
    type: 'spritesheet',
    key,
    url: at(path),
    frameWidth: frame.width,
    frameHeight: frame.height,
  });
  const assets: SkinAsset[] = [
    {
      type: 'spritesheet',
      key: SKIN_KEYS.tileset,
      url: at(skin.tileset.image),
      frameWidth: skin.tileSize,
      frameHeight: skin.tileSize,
    },
    sheet(SKIN_KEYS.body, skin.characters.body),
    ...skin.characters.hair.map((path, i) => sheet(SKIN_KEYS.hair(i), path)),
  ];
  for (const [profession, path] of Object.entries(skin.characters.outfit)) {
    assets.push(sheet(SKIN_KEYS.outfit(profession as Profession), path));
  }
  for (const [profession, path] of Object.entries(skin.characters.accessory)) {
    if (path) assets.push(sheet(SKIN_KEYS.accessory(profession as Profession), path));
  }
  if (skin.props) assets.push({ type: 'image', key: SKIN_KEYS.props, url: at(skin.props.image) });
  assets.push({
    type: 'bitmapFont',
    key: SKIN_KEYS.font,
    url: at(skin.font.image),
    dataUrl: at(skin.font.data),
  });
  if (skin.fontSmall) {
    assets.push({
      type: 'bitmapFont',
      key: SKIN_KEYS.fontSmall,
      url: at(skin.fontSmall.image),
      dataUrl: at(skin.fontSmall.data),
    });
  }
  if (skin.fontLabel) {
    assets.push({
      type: 'bitmapFont',
      key: SKIN_KEYS.fontLabel,
      url: at(skin.fontLabel.image),
      dataUrl: at(skin.fontLabel.data),
    });
  }
  return assets;
}

/** Minimal slice of Phaser's texture manager used to name the frames of the props atlas. */
interface PropTextures {
  exists(key: string): boolean;
  get(key: string): {
    has(name: string): boolean;
    add(name: string, source: number, x: number, y: number, w: number, h: number): unknown;
  };
}

/** Adds one named frame per prop to the loaded props atlas (no-op without a props atlas). */
export function registerPropFrames(textures: PropTextures, skin: Skin): void {
  if (!skin.props || !textures.exists(SKIN_KEYS.props)) return;
  const texture = textures.get(SKIN_KEYS.props);
  for (const [id, f] of Object.entries(skin.props.frames)) {
    if (!texture.has(id)) texture.add(id, 0, f.x, f.y, f.w, f.h);
  }
}
