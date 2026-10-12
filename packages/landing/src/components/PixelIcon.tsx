import type { Role } from './roles';

/** '#' paints the role accent, 'o' paints cream, anything else stays empty. */
const BITMAPS = {
  room: [
    '..........',
    '.########.',
    '.#......#.',
    '.#.####.#.',
    '.#......#.',
    '.#......#.',
    '.#.##...#.',
    '.#.##...#.',
    '.########.',
    '..........',
  ],
  lead: [
    '...oooo...',
    '..oooooo..',
    '..oooooo..',
    '...oooo...',
    '..######..',
    '.########.',
    '.##o##o##.',
    '.########.',
    '..##..##..',
    '..##..##..',
  ],
  employee: [
    '...####...',
    '..######..',
    '..######..',
    '...####...',
    '..######..',
    '.#.####.#.',
    '.########.',
    'oooooooooo',
    'o........o',
    'o........o',
  ],
  status: [
    '...####...',
    '..#....#..',
    '.#..oo..#.',
    '#..oooo..#',
    '#.oooooo.#',
    '#.oooooo.#',
    '#..oooo..#',
    '.#..oo..#.',
    '..#....#..',
    '...####...',
  ],
  inspect: [
    '..####....',
    '.#....#...',
    '#......#..',
    '#......#..',
    '#......#..',
    '.#....#...',
    '..####o...',
    '.....ooo..',
    '......ooo.',
    '.......oo.',
  ],
  hook: [
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '....##....',
    '#...##...#',
    '##..##..##',
    '.########.',
    '..######..',
  ],
  monitor: [
    '##########',
    '#oooooooo#',
    '#o#oo#ooo#',
    '#o#oo#ooo#',
    '#oo##oo#o#',
    '#oooooooo#',
    '##########',
    '....##....',
    '..######..',
    '..........',
  ],
  terminal: [
    '##########',
    '#........#',
    '#.o......#',
    '#..o.....#',
    '#.o......#',
    '#........#',
    '#...oooo.#',
    '#........#',
    '##########',
    '..........',
  ],
  cast: [
    '..........',
    '.###..###.',
    '.###..###.',
    '..#....#..',
    '####..####',
    '####..####',
    '####..####',
    '..........',
    'oooooooooo',
    '..........',
  ],
  bus: [
    '##......##',
    '##......##',
    '..#....#..',
    '...#..#...',
    '....oo....',
    '....oo....',
    '...#..#...',
    '..#....#..',
    '##......##',
    '##......##',
  ],
  board: [
    '##########',
    '#........#',
    '#.o......#',
    '#.o.####.#',
    '#.o.#..#.#',
    '#.o.####.#',
    '#......o.#',
    '#.oooooo.#',
    '##########',
    '...#..#...',
  ],
  browser: [
    '##########',
    '#oooooooo#',
    '##########',
    '#........#',
    '#.####...#',
    '#.####.o.#',
    '#.......o#',
    '#..oooo..#',
    '#........#',
    '##########',
  ],
} as const;

export type PixelIconName = keyof typeof BITMAPS;

export interface PixelIconProps {
  name: PixelIconName;
  accent?: Role;
  className?: string;
}

/** Decorative 10x10 pixel glyph painted with the role accent. */
export function PixelIcon({ name, accent, className }: PixelIconProps) {
  const rows = BITMAPS[name];
  const cells: { x: number; y: number; accent: boolean }[] = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '#' || ch === 'o') cells.push({ x, y, accent: ch === '#' });
    });
  });
  return (
    <svg
      className={['pixel-icon', accent ? `pixel-icon--${accent}` : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      viewBox="0 0 10 10"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {cells.map((cell) => (
        <rect
          key={`${cell.x}-${cell.y}`}
          x={cell.x}
          y={cell.y}
          width="1"
          height="1"
          fill={cell.accent ? 'var(--accent)' : 'var(--color-cream)'}
        />
      ))}
    </svg>
  );
}
