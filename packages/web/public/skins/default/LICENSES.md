# Default skin licenses

All assets in this directory (`tileset.png`, `props.png`, `characters/*.png`, `font/pixel.png`,
`font/pixel.fnt`, `font/tiny.png`, `font/tiny.fnt`, `font/label.png`, `font/label.fnt`,
`skin.json`) are original placeholder art generated procedurally by
`packages/web/scripts/generate-default-skin.mjs` (and `scripts/skin/*`) for the Agents Office project.

| Asset | Source | License |
| --- | --- | --- |
| Tileset (`tileset.png`) | Drawn by the generator script | CC0 1.0 (public domain dedication) |
| Props atlas (`props.png`) | Drawn by the generator script | CC0 1.0 |
| Character layers (`characters/*.png`) | Drawn by the generator script | CC0 1.0 |
| Bitmap font (`font/pixel.png`, `font/pixel.fnt`) | 5x7 glyph data hand-authored in the generator script (uppercase-only; lowercase maps to uppercase) | CC0 1.0 |
| Small bitmap font (`font/tiny.*`) | 3x5 glyph data hand-authored in the generator script | CC0 1.0 |
| Label bitmap font (`font/label.png`, `font/label.fnt`) | Mixed-case glyph data hand-authored in the generator script | CC0 1.0 |
| `skin.json` | Written by the generator script | CC0 1.0 |

No third-party assets are included. To replace the art, edit the generator or point the daemon
to your own skin with `agents-office start --skin <dir>` (the directory must contain a
`skin.json` in the same format). Third-party packs bought for local use must not be committed.

CC0 1.0 Universal: https://creativecommons.org/publicdomain/zero/1.0/
