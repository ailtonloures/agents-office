# Layout do painel de terminal

- O painel (`#ao-terminal`) é irmão flex de `#game`; `#game` encolhe com ele e o Phaser acompanha via `ResizeObserver`/`onLayout`.
- Controles de canto (zoom, Hooks, Sessões) devem ser filhos de `#game` com `position:absolute`. `position:fixed` ignora o painel e cobre o terminal.
- O clique no canvas (`mousedown` DOM) devolve o teclado ao jogo (`focusPlayer`); qualquer ação que foque o xterm deve rodar depois dele.
- O painel só existe no app desktop (Electron); no navegador não há `window.__desktopActions`.
