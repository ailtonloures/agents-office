import { type Profession, ProfessionSchema } from '@agents-office/shared';
import { z } from 'zod';

/** Named tiles every skin must provide. */
export const CORE_TILE_IDS = [
  'floor',
  'wall',
  'door',
  'desk',
  'chair',
  'computer',
  'server-rack',
  'phone',
  'window',
  'plant',
  'sign',
  'board',
] as const;
/** Decor tiles a skin may omit: each falls back to a core tile (see {@link TILE_FALLBACK}). */
export const EXTRA_TILE_IDS = [
  'floor-b',
  'hall',
  'tile',
  'wall-cap',
  'whiteboard',
  'poster',
  'clock',
  'plant-tall',
  'bookshelf',
  'sofa-l',
  'sofa-r',
  'coffee',
  'cooler',
  'printer',
  'table',
  'counter',
  'lamp',
  'wood',
  'wood-b',
  'wall-side-l',
  'wall-side-r',
  'wall-bottom',
  'wall-corner-tl',
  'wall-corner-tr',
  'wall-top',
  'wall-mid',
  'window-top',
] as const;
export const TILE_IDS = [...CORE_TILE_IDS, ...EXTRA_TILE_IDS] as const;
export type CoreTileId = (typeof CORE_TILE_IDS)[number];
export type ExtraTileId = (typeof EXTRA_TILE_IDS)[number];
export type TileId = CoreTileId | ExtraTileId;

/** Fallback of each decor tile: a core tile, or another decor tile that falls back in turn. */
export const TILE_FALLBACK: Record<ExtraTileId, TileId> = {
  'floor-b': 'floor',
  hall: 'floor',
  tile: 'floor',
  'wall-cap': 'wall',
  whiteboard: 'wall',
  poster: 'wall',
  clock: 'wall',
  'plant-tall': 'plant',
  bookshelf: 'desk',
  'sofa-l': 'desk',
  'sofa-r': 'desk',
  coffee: 'desk',
  cooler: 'plant',
  printer: 'desk',
  table: 'desk',
  counter: 'desk',
  lamp: 'plant',
  wood: 'floor',
  'wood-b': 'floor',
  'wall-side-l': 'wall-cap',
  'wall-side-r': 'wall-cap',
  'wall-bottom': 'wall-cap',
  'wall-corner-tl': 'wall',
  'wall-corner-tr': 'wall',
  'wall-top': 'wall',
  'wall-mid': 'wall',
  'window-top': 'wall-top',
};

export const POSE_IDS = ['sit-type', 'read', 'phone', 'sleep'] as const;
/** Second typing frame (optional): the typing pose alternates between the two. */
export const TYPING_ALT_POSE = 'sit-type-b';
/**
 * Optional extra pose frames (skin v3): a third typing frame, a page turn, breathing while asleep
 * and a celebration (arms up). Missing ones fall back to the base pose (see the factory).
 */
export const EXTRA_POSE_IDS = [
  TYPING_ALT_POSE,
  'sit-type-c',
  'read-b',
  'sleep-b',
  'celebrate',
  'celebrate-b',
] as const;
export type PoseId = (typeof POSE_IDS)[number];
export type ExtraPoseId = (typeof EXTRA_POSE_IDS)[number];

export const DIRECTIONS = ['down', 'left', 'right', 'up'] as const;
export type Direction = (typeof DIRECTIONS)[number];

/** A path relative to the folder of `skin.json` (no scheme, no absolute path, no `..`). */
const RelativePathSchema = z
  .string()
  .min(1)
  .refine(
    (path) =>
      !/^[a-z][a-z0-9+.-]*:/i.test(path) &&
      !path.startsWith('/') &&
      !path.startsWith('\\') &&
      !path.split(/[\\/]/).includes('..'),
    'must be a relative path inside the skin folder',
  );

const FrameIndexSchema = z.number().int().nonnegative();
const PositiveInt = z.number().int().positive();

const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb color');

/**
 * Key colors the layer art is drawn in. CharacterFactory replaces them with the colors chosen
 * from `palettes` for each character (palette swap). Skins that draw final colors can omit this:
 * the defaults then simply match nothing in the art.
 */
export const BaseColorsSchema = z.object({
  skin: HexColorSchema,
  skinShade: HexColorSchema,
  hair: HexColorSchema,
  shirt: HexColorSchema,
  pants: HexColorSchema,
  hairShade: HexColorSchema.default('#a8005a'),
  hairLight: HexColorSchema.default('#ff80bf'),
  shirtShade: HexColorSchema.default('#00a0a0'),
  pantsShade: HexColorSchema.default('#489000'),
  skinLight: HexColorSchema.default('#ff80ff'),
  shirtLight: HexColorSchema.default('#80ffff'),
  pantsLight: HexColorSchema.default('#c0ff80'),
});
export type BaseColors = z.infer<typeof BaseColorsSchema>;

/** Limited (GBC-like) palettes a character's colors are picked from. */
export const PalettesSchema = z.object({
  skin: z.array(HexColorSchema).min(1),
  hair: z.array(HexColorSchema).min(1),
  shirt: z.array(HexColorSchema).min(1),
  pants: z.array(HexColorSchema).min(1),
});
export type Palettes = z.infer<typeof PalettesSchema>;

export const DEFAULT_BASE_COLORS: BaseColors = {
  skin: '#ff00ff',
  skinShade: '#b800b8',
  hair: '#ff0080',
  shirt: '#00ffff',
  pants: '#80ff00',
  hairShade: '#a8005a',
  hairLight: '#ff80bf',
  shirtShade: '#00a0a0',
  pantsShade: '#489000',
  skinLight: '#ff80ff',
  shirtLight: '#80ffff',
  pantsLight: '#c0ff80',
};
export const DEFAULT_PALETTES: Palettes = {
  skin: ['#f6d5b3', '#f0c8a0', '#e0ac7c', '#c68a5c', '#a06a42', '#7a4a2e'],
  hair: ['#1f1a17', '#3a2a1a', '#6b4423', '#a8672c', '#c9a227', '#b5412f', '#8a8d99'],
  shirt: ['#2f3f6b', '#2f8f8a', '#7a4fa3', '#3d9a4a', '#d9822b', '#3f7fd0', '#b5413b', '#4a4f5e'],
  pants: ['#2a2f3d', '#3b4a6b', '#4a4f5e', '#5a4a3a'],
};

/**
 * A prop (furniture bigger than a tile) in the props atlas: its rectangle and the anchor, the
 * pixel of the frame that sits on the bottom-left corner of the prop's footprint.
 */
export const PropFrameSchema = z.object({
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  w: PositiveInt,
  h: PositiveInt,
  ax: z.number().int(),
  ay: z.number().int(),
  /**
   * Optional glass rectangles of the monitors, relative to the anchor (so `y` is negative): the
   * game draws the animated screen content there. The first one shows the seated activity.
   */
  screens: z
    .array(
      z.object({
        x: z.number().int(),
        y: z.number().int(),
        w: PositiveInt,
        h: PositiveInt,
      }),
    )
    .optional(),
});
export type PropFrame = z.infer<typeof PropFrameSchema>;

const perProfession = <T extends z.ZodType>(value: T) =>
  z.object(
    Object.fromEntries(ProfessionSchema.options.map((p) => [p, value])) as Record<Profession, T>,
  );

export const SkinSchema = z.object({
  name: z.string().min(1),
  version: PositiveInt.default(1),
  tileSize: z.literal(16),
  tileset: z.object({
    image: RelativePathSchema,
    columns: PositiveInt,
    /** Tile id -> frame index in the tileset image (row-major). */
    tiles: z.object({
      ...(Object.fromEntries(CORE_TILE_IDS.map((id) => [id, FrameIndexSchema])) as Record<
        CoreTileId,
        typeof FrameIndexSchema
      >),
      ...(Object.fromEntries(
        EXTRA_TILE_IDS.map((id) => [id, FrameIndexSchema.optional()]),
      ) as Record<ExtraTileId, z.ZodOptional<typeof FrameIndexSchema>>),
    }),
  }),
  characters: z.object({
    frame: z.object({ width: PositiveInt, height: PositiveInt }),
    columns: PositiveInt,
    /** 4 directions x 3 walk frames (frame indexes in the layer sheets). */
    walk: z.object(
      Object.fromEntries(
        DIRECTIONS.map((d) => [d, z.tuple([FrameIndexSchema, FrameIndexSchema, FrameIndexSchema])]),
      ) as Record<
        Direction,
        z.ZodTuple<[typeof FrameIndexSchema, typeof FrameIndexSchema, typeof FrameIndexSchema]>
      >,
    ),
    /** Optional idle frames per direction (breathe, blink...), played between the stand frame. */
    idle: z
      .object(
        Object.fromEntries(DIRECTIONS.map((d) => [d, z.array(FrameIndexSchema).min(1)])) as Record<
          Direction,
          z.ZodArray<typeof FrameIndexSchema>
        >,
      )
      .optional(),
    poses: z.object({
      ...(Object.fromEntries(POSE_IDS.map((id) => [id, FrameIndexSchema])) as Record<
        PoseId,
        typeof FrameIndexSchema
      >),
      ...(Object.fromEntries(
        EXTRA_POSE_IDS.map((id) => [id, FrameIndexSchema.optional()]),
      ) as Record<ExtraPoseId, z.ZodOptional<typeof FrameIndexSchema>>),
    }),
    /**
     * Where the head starts, in rows from the top of a frame, standing and seated (balloons are
     * drawn just above it). Defaults fit the 16x24 v1/v2 art.
     */
    head: z
      .object({ top: z.number().int().nonnegative(), seatedTop: z.number().int().nonnegative() })
      .default({ top: 1, seatedTop: 1 }),
    baseColors: BaseColorsSchema.default(DEFAULT_BASE_COLORS),
    palettes: PalettesSchema.default(DEFAULT_PALETTES),
    body: RelativePathSchema,
    hair: z.array(RelativePathSchema).min(1),
    outfit: perProfession(RelativePathSchema),
    accessory: perProfession(RelativePathSchema).partial().default({}),
  }),
  /**
   * Optional props atlas (skin v4). Props the skin has replace the matching furniture tiles and are
   * depth-sorted with the characters; without it the furniture tiles are drawn as before.
   */
  props: z
    .object({ image: RelativePathSchema, frames: z.record(z.string(), PropFrameSchema) })
    .optional(),
  font: z.object({ image: RelativePathSchema, data: RelativePathSchema }),
  /** Compact font for name tags; the main font is used when absent. */
  fontSmall: z.object({ image: RelativePathSchema, data: RelativePathSchema }).optional(),
  /** Mixed-case label font for the names on the tags; `fontSmall`/`font` are used when absent. */
  fontLabel: z.object({ image: RelativePathSchema, data: RelativePathSchema }).optional(),
});

export type Skin = z.infer<typeof SkinSchema>;

export type ParseSkinResult = { ok: true; skin: Skin } | { ok: false; error: string };

/** Validates the parsed JSON of a `skin.json`. Never throws. */
export function parseSkin(input: unknown): ParseSkinResult {
  const parsed = SkinSchema.safeParse(input);
  if (parsed.success) return { ok: true, skin: parsed.data };
  const issue = parsed.error.issues[0];
  const where = issue?.path.length ? ` at ${issue.path.join('.')}` : '';
  return { ok: false, error: `${issue?.message ?? 'invalid skin.json'}${where}` };
}

/** Frame index of a tile, following the fallbacks when the skin omits a decor tile. */
export function tileFrame(skin: Skin, id: TileId): number {
  const tiles = skin.tileset.tiles as Record<string, number | undefined>;
  let current: TileId | undefined = id;
  while (current !== undefined) {
    const own = tiles[current];
    if (own !== undefined) return own;
    current = TILE_FALLBACK[current as ExtraTileId];
  }
  return tiles[id] as number;
}
