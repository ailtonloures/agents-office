# Overlay Excalidraw (spec 077)

- React 19.2.0 / react-dom 19.2.0 / `@excalidraw/excalidraw` 0.18.1 are web deps, but only `ui/boardIsland.ts` imports them; `ui/boardOverlay.ts` loads it with `import('./boardIsland')`. `test/boardBundle.test.ts` walks the static import graph of `main.ts` to guard this. The island uses `createElement` (no JSX/tsconfig change).
- Fonts are offline: `excalidrawAssets()` in `packages/web/vite.config.ts` serves (dev) and emits (build) `node_modules/@excalidraw/excalidraw/dist/prod/fonts` under `/excalidraw-assets/fonts/`; the island sets `window.EXCALIDRAW_ASSET_PATH` before use. The 13 MB `Xiaolai` CJK fallback is skipped.
- The package does not export `package.json`; resolve the entry (`dist/prod/index.js`) and use its folder.
- Sync: the island only reports elements whose `version` differs from `known` (so selection/scroll never save); remote (agent) updates are merged by id/version and put in `known` so they do not echo back. IPC: `agents-office:board:load|save` (invoke) and `agents-office:board:changed` (push, only for non-`user` sources).
- Esc closes in a capture listener unless typing or an Excalidraw dialog is open.

## Sync agentes x overlay (spec 078)
- 077 already pushed non-user store changes (`board:changed`) and merged by version without echo. 078 adds:
  - `boardIpc.rejectedElements`: after a user save, stored elements that beat the sent ones (newer version / lower nonce) are pushed back so the window converges.
  - Authorship: agents sign elements with `customData.author`; the overlay bar shows "Desenhado por: ..." (`boardAuthors`/`authorsLabel` in boardLogic, `data-testid=board-authors`).
  - Avatar: `PoiType 'whiteboard'` (corridor tile under each board); `ruleForTool` sends `board_add_elements|add_mermaid|clear` (also `mcp__*__` prefixed) to target `whiteboard` regardless of the tool table.
- Tests: `packages/desktop/test/boardMerge.test.ts` (user x agent concurrency).

## Mermaid and shape libraries (spec 079)
- Mermaid: `mermaid-to-excalidraw` needs a DOM, so main asks the window. `boardMermaid.ts` `createMermaidRelay` sends `board:mermaid:request {id, definition}` to the window (15s timeout, `MermaidUnavailableError` when no window/timeout -> tool returns `unavailable`) and gets the answer on `board:mermaid:response`. Web side: `ui/mermaidRelay.ts` (installed in main.ts whenever the board bridge exists, board open or not) lazily imports `ui/mermaidConvert.ts` (heavy, dynamic) and `ui/mermaidSkeletons.ts` (pure mapper: start/end -> from/to, drops images, 200-element cap). Dep added to web: `@excalidraw/mermaid-to-excalidraw` 2.2.2 (already transitive of excalidraw 0.18.1). Non-flowchart diagrams may come back as images only: reported as "cannot be drawn as editable shapes".
- Bound arrows with explicit `points` keep them (curved Mermaid edges) and are still bound; only point-less from/to arrows are straightened.
- Libraries: `boardLibraries.ts` `LibraryStore` keeps normalized v2 `.excalidrawlib` files in `userData/board-libraries/<slug>.excalidrawlib` (2MB, 500 items, 500 elements/item, 50 libs). Invalid files are refused on import and skipped on list, never thrown. IPC `board:libraries:{list,import,remove}`; overlay "Bibliotecas" panel (import/remove) feeds `libraryItems`/`updateLibrary` of the island. Agents: `board_list_library` and `board_add_library_item` (library id/name + item name/index, optional x/y); items are re-id'd, authored, links stripped.
- Not verified here: real Mermaid conversion and library UI in Electron (no display); unit tests cover relay, mapper, store, tools.
