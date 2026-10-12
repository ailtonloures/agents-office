# Auto-update and release pipeline (spec 055)

- `electron-updater` is a runtime dependency of `packages/desktop` and external in `scripts/build.mjs` (electron-builder packs it from node_modules into the asar).
- `electron-builder.yml` `publish` (github, ailtonloures/agents-office, releaseType release) makes every build emit `release/latest-linux.yml` and embed `resources/app-update.yml`. Local `pnpm --filter @agents-office/desktop dist` does not upload anything (default publish policy is onTagOrDraft; only `--publish always` uploads).
- `.github/workflows/release.yml` (tag `v*`): checks tag == `packages/desktop` version, creates the release with `gh release create --generate-notes`, then `electron-builder --linux AppImage --publish always` attaches AppImage + latest-linux.yml to it.
- The `deb` target prints "adding autoupdate files for: deb"; the updater itself must stay disabled there (only AppImage, `APPIMAGE` env set).

# Update service and IPC (spec 056)

- `src/main/updater.ts` (`createUpdateService`) has no Electron import; deps `{ autoUpdater, isPackaged, isAppImage, emit, now }`. Enabled only when packaged AND `process.env.APPIMAGE` is set; otherwise it never touches the autoUpdater (no listeners, no timers) and `checkNow()` resolves `{state:'idle'}`.
- `UpdateState`: idle | checking | available{version} | downloading{version,percent} | ready{version} | error{message}. "Already up to date" is `idle` after a check; `checkNow()` resolves to the settled state so a UI can tell.
- electron-updater emits `error` AND rejects `checkForUpdates()`: the service dedupes (same message reported once) and ignores errors once `ready`. A `ready` update is never re-checked.
- Channels in `updaterChannels.ts` (`agents-office:updater:get-state|check-now|install`, push `agents-office:updater:status`). Handlers reject any extra argument (zod empty tuple) on top of `trusted()`.
- `registerUpdaterIpc` takes `install()` separately from the service so spec 059 can route it through the QuitCoordinator; main.ts currently wires it straight to `updater.install()` (`quitAndInstall(false, true)`).
- Shell tray items are optional deps (`checkUpdates`, `installUpdate`) + `setUpdate(state)`; the app menu is rebuilt (`applyAppMenu`) when the state enters/leaves `ready`.

## Updater bridge (spec 057)
- `UpdateState`/`UpdaterBridge` live in `packages/shared/src/desktopUpdater.ts` (duplicated from `main/updater.ts`; preload/shared cannot import main types except channel constants). `AgentsOfficeDesktop.updater` is optional: web must feature-detect.
- The preload `subscribe` helper was hoisted in `preload/index.ts` and shared by terminal and updater bridges; `onStatus` returns an unsubscribe that removes the exact ipcRenderer handler.

## Update banner (spec 058)
- `packages/web/src/ui/updateLogic.ts` (pure: `updaterBridgeOf`, `bannerModel`) + `updateBanner.ts` (`mountUpdateBanner` returns a cleanup). Mounted in `main.ts` only when `window.agentsOfficeDesktop.updater` exists. It sits top-center of `#game` (the Hooks notice is bottom-center).
- "Depois" dismisses per version (`dismissedVersion`); a newer version brings the banner back. Only available/downloading/ready show; idle/checking/error stay hidden.
- Banner subscribes with `onStatus` before `getState()`, and a late `getState()` snapshot is ignored if a push already moved the state off idle.
- Keyboard: banner stops keydown/keyup propagation (no modal, so no document-level capture like the settings panel).
- E2E runs against `packages/cli/dist/web`, a copy of the web build: run `pnpm --filter @agents-office/web build` and `pnpm --filter ./packages/cli build` before `playwright test --project=web`, or new UI will not appear.

## Clean restart (spec 059)
- "Reiniciar para atualizar" (IPC, tray, app menu) all call main.ts `installUpdate`, which now does `quit.request('interactive', { installOnQuit: true })` instead of `updater.install()`. Same dialog/end-of-sessions path as "Sair"; the last step `finish({ install })` sets `quitDone = true` first and then calls `updater.install()` (`quitAndInstall(false, true)`), falling back to `app.quit()` if it returns false. `quitDone` is what stops quitAndInstall's own quit from re-entering the `before-quit` guard.
- `QuitCoordinator` resets `forced`/`installOnQuit` after each run, so a cancelled install request does not leak into the next plain "Sair". Concurrent requests still share one run (install flag is sticky within it).
- `installUpdate` returns true as soon as the request is accepted (state `ready`), not when the app has exited; the dialog may still be cancelled.

## Release script (spec 060)
- `pnpm release <patch|minor|major> [--dry-run]` runs `scripts/release.mjs`: bumps only `packages/desktop/package.json`, commits `:bookmark: release vX.Y.Z`, creates an annotated tag, and never pushes (maintainer runs `git push origin HEAD vX.Y.Z`). Refuses a dirty tree or an existing tag; `--dry-run` skips the dirty check and writes nothing, which is what the tests use (`packages/desktop/test/releaseScript.test.ts`).
- Limits: only the Linux AppImage self-updates (needs `APPIMAGE` env); `.deb` and macOS builds are manual installs. The manual 0.1.0 -> 0.1.1 end-to-end check could not be run here (needs a real published release).

## macOS release job (spec 086)
- `release.yml` has a second job `macos` (`macos-latest`, `needs: release`) so it only runs after the Linux job created the release. It repeats the tag/version check, install, `pnpm --workspace-root build` and `stage-daemon.mjs`, then `electron-builder --mac dmg --publish always` with `CSC_IDENTITY_AUTO_DISCOVERY=false` (no signing). The `.dmg` (`agents-office-<version>-mac-<arch>.dmg`, from the shared `artifactName`) is attached to the same release as the AppImage. The Linux job is unchanged.
- Auto-update remains AppImage-only: macOS (and `.deb`) are manual installs. The mac build also emits `latest-mac.yml`, but the updater service stays disabled there (needs `APPIMAGE`).
- This job is only truly validated on the first real tag push (cannot be run locally); watch that run, especially native `node-pty` packaging on the mac runner.
