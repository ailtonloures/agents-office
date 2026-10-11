# Layout do painel de terminal

- O painel (`#ao-terminal`) é irmão flex de `#game`; `#game` encolhe com ele e o Phaser acompanha via `ResizeObserver`/`onLayout`.
- Controles de canto (zoom, Hooks, Sessões) devem ser filhos de `#game` com `position:absolute`. `position:fixed` ignora o painel e cobre o terminal.
- O clique no canvas (`mousedown` DOM) devolve o teclado ao jogo (`focusPlayer`); qualquer ação que foque o xterm deve rodar depois dele.
- O painel só existe no app desktop (Electron); no navegador não há `window.__desktopActions`.
- Dock (spec 042): `body[data-dock]` (`bottom|left|right`) alterna `flex-direction` (column/row); o painel usa `order:-1` quando `left`. O painel recebe `height` embaixo e `width` nas laterais a partir de `panelOccupiedSize`; minimizado nas laterais vira uma faixa de `TAB_BAR_HEIGHT` com só o botão de expandir.
- O resizer fica na borda voltada ao escritório: `clientY` embaixo, `clientX` (esquerda) ou `innerWidth - clientX` (direita). Clamp com `clampHeight`/`clampWidth` (mínimos de escritório 160px/256px), reclampados no `window resize`.
- E2E sem Electron: simular `window.agentsOfficeDesktop` (hooks, projects, terminal com `list` devolvendo uma sessão) via `addInitScript` basta para montar o painel (teste 14 de `office.spec.ts`).
