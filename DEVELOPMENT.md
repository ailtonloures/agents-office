# Development

The basics to run and check Agents Office locally. For the product overview see the
[README](./README.md); for the visual language see [DESIGN.md](./DESIGN.md) and for how the
pieces fit together see [ARCHITECTURE.md](./ARCHITECTURE.md).

## Prerequisites

- Node >= 20
- pnpm >= 9
- A C++ toolchain and Python, only needed when `node-pty` has no prebuilt binary for your platform

## Install, build and run

```bash
pnpm install
pnpm build
pnpm dev
```

`pnpm dev` starts everything in parallel: the daemon (port 4777), the web app with Vite (open the
URL it prints) and the Electron desktop app.

To run a single piece:

```bash
pnpm --filter @agents-office/daemon dev     # the daemon only, on port 4777
pnpm --filter @agents-office/web dev        # Vite with hot reload
pnpm --filter @agents-office/desktop dev    # the Electron window
```

To run the built app the way end users get it, on `http://127.0.0.1:4777`:

```bash
pnpm build
pnpm --filter @agents-office/daemon exec agents-office start
```

## Checks

```bash
pnpm lint
pnpm typecheck
pnpm test
```

`pnpm format` applies the Biome formatting.

UI text lives in `packages/web/src/i18n/messages/`. Add a key to `en.ts` first, then to `pt-BR.ts` and
`es.ts` (the typecheck fails if one is missing). Unit tests that assert text call `setLocale(...)` and
restore it afterwards; Playwright specs run in English (the default) and pick another language by
clicking the language button or by writing `agents-office.locale` into `localStorage`.

## Landing page

`packages/landing` is the static marketing site (Vite 7 + React 19). It does not need the daemon and
is not bundled into the npm package.

```bash
pnpm --filter @agents-office/landing dev       # Vite with hot reload
pnpm --filter @agents-office/landing build     # static site in packages/landing/dist
pnpm --filter @agents-office/landing preview   # serve the build
pnpm --filter @agents-office/landing test      # unit tests (also run by pnpm vitest run)
```

End-to-end tests run against the built site served by `vite preview` on port 4399, so build first:

```bash
pnpm build && pnpm --filter @agents-office/e2e exec playwright test --project=landing
```

`VITE_SITE_URL` sets the public origin used for the canonical link, Open Graph tags, JSON-LD,
`robots.txt` and `sitemap.xml` (emitted into `dist` by `build/seoPlugin.ts`). It defaults to
`https://agents-office.vercel.app`; set it to the real domain at build time, no source change needed.

`public/og.png` and `public/apple-touch-icon.png` are generated, not drawn by hand. After changing the
logo, font or office still, run `node packages/landing/scripts/generate-social-images.mjs` (it borrows
Playwright and Chromium from the `e2e` package). Sprites in `public/sprites` are copies of the web skin
(CC0, see its `LICENSES.md`); update them by copying again, never by editing them.

### Deploying to Vercel

The project must be created with **Root Directory** `packages/landing` and the environment variable
`VITE_SITE_URL`. `packages/landing/vercel.json` does the rest: the install step runs
`cd ../.. && pnpm install --frozen-lockfile` and the build step runs
`cd ../.. && pnpm --filter @agents-office/landing build`, because the lockfile and workspace live at
the repository root. Output is `dist`. Only `/assets/*` gets a long immutable cache (those files are
content-hashed); `/fonts` and `/sprites` keep default caching because their names are not hashed.
`.vercel/` is git-ignored. Deploy with the Vercel dashboard or `vercel deploy` (preview) from the
repository root; use `--prod` only on purpose.

The Download links point to the latest GitHub release and resolve only once a release exists.

## Optional Claude Code hooks

The hooks make updates instant and show when an agent is waiting for you. Installing them keeps a
backup of `~/.claude/settings.json`:

```bash
pnpm --filter @agents-office/daemon exec agents-office hooks install
pnpm --filter @agents-office/daemon exec agents-office hooks uninstall
```

## Releasing (maintainers)

Releases are published by GitHub Actions (`.github/workflows/release.yml`) when a `v*` tag is
pushed. The tag must equal the version in `packages/desktop/package.json`, otherwise the workflow
fails. The workflow creates the GitHub release and attaches the AppImage plus `latest-linux.yml`,
which installed apps use to update themselves.

From a clean `main`:

```bash
pnpm release patch            # or minor / major; add --dry-run to only preview the new version
git push origin HEAD vX.Y.Z   # the command prints the exact tag to push
```

`pnpm release` bumps `packages/desktop/package.json`, commits it and creates the `vX.Y.Z` tag. It
never pushes.

If the workflow fails, delete the tag remotely and locally, fix the problem and release again:

```bash
git push --delete origin vX.Y.Z
git tag -d vX.Y.Z
```

### Testing the updater manually

Auto-update only works for the Linux AppImage (the `APPIMAGE` variable is set by the AppImage
runtime). The `.deb` and macOS builds do not self-update.

1. Install the AppImage of a published `0.1.0`.
2. Publish `0.1.1` with `pnpm release patch` and push the commit and tag.
3. Start the old app: the update banner should appear, and "Reiniciar para atualizar" should
   install `0.1.1` and relaunch.
