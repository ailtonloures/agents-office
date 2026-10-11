// Generates the default skin (pixel art + bitmap fonts) into public/skins/default.
// Everything is drawn procedurally from the data in scripts/skin: original work, released as CC0.
// Run: pnpm --filter @agents-office/web generate-skin
import { png, write } from './skin/canvas.mjs';
import {
  BASE_COLORS,
  COLUMNS,
  FH,
  FW,
  HAIRS,
  IDLE,
  layers,
  makeSheet,
  PALETTES,
  POSES,
  PROFESSIONS,
  WALK,
} from './skin/characters.mjs';
import { makeFont, makeLabelFont, makeTinyFont } from './skin/font.mjs';
import { makePropsAtlas } from './skin/props.mjs';
import { makeTileset, TILE, TILE_COLUMNS, TILE_IDS } from './skin/tiles.mjs';

png('tileset.png', makeTileset());
const props = makePropsAtlas();
png('props.png', props.canvas);
png('characters/body.png', makeSheet(layers.body));
for (const [i, style] of HAIRS.entries()) {
  png(`characters/hair-${i}.png`, makeSheet(layers.hair(style)));
}
for (const [profession, look] of Object.entries(PROFESSIONS)) {
  png(`characters/outfit-${profession}.png`, makeSheet(layers.outfit(profession)));
  png(`characters/accessory-${profession}.png`, makeSheet(layers.accessory(look.accessory)));
}
const font = makeFont();
png('font/pixel.png', font.canvas);
write('font/pixel.fnt', Buffer.from(font.xml));
const tiny = makeTinyFont();
png('font/tiny.png', tiny.canvas);
write('font/tiny.fnt', Buffer.from(tiny.xml));
const label = makeLabelFont();
png('font/label.png', label.canvas);
write('font/label.fnt', Buffer.from(label.xml));

const manifest = {
  name: 'Agents Office Default',
  version: 4,
  tileSize: TILE,
  tileset: {
    image: 'tileset.png',
    columns: TILE_COLUMNS,
    tiles: Object.fromEntries(TILE_IDS.map((id, i) => [id, i])),
  },
  characters: {
    frame: { width: FW, height: FH },
    columns: COLUMNS,
    walk: WALK,
    idle: IDLE,
    poses: POSES,
    head: { top: 3, seatedTop: 10 },
    baseColors: BASE_COLORS,
    palettes: PALETTES,
    body: 'characters/body.png',
    hair: HAIRS.map((_, i) => `characters/hair-${i}.png`),
    outfit: Object.fromEntries(
      Object.keys(PROFESSIONS).map((p) => [p, `characters/outfit-${p}.png`]),
    ),
    accessory: Object.fromEntries(
      Object.keys(PROFESSIONS).map((p) => [p, `characters/accessory-${p}.png`]),
    ),
  },
  props: { image: 'props.png', frames: props.frames },
  font: { image: 'font/pixel.png', data: 'font/pixel.fnt' },
  fontSmall: { image: 'font/tiny.png', data: 'font/tiny.fnt' },
  fontLabel: { image: 'font/label.png', data: 'font/label.fnt' },
};
write('skin.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
console.log('default skin written');
