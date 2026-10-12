# Specs — Agents Office

PRD: [agents-office.prd.md](../prds/agents-office.prd.md)

| # | Title | Priority | Status | Tags | Dependencies |
|---|-------|----------|--------|------|--------------|
| 001 | Monorepo scaffold e contratos compartilhados | high | done | feature, infra, shared, testing | — |
| 002 | Normalizer — JSONL e hooks → OfficeEvent | high | done | feature, daemon, parser, testing | 001 |
| 003 | OfficeModelReducer e LivenessClock | high | done | feature, daemon, state, testing | 001, 002 |
| 004 | TranscriptWatcher | high | done | feature, daemon, filesystem, testing | 002 |
| 005 | Daemon — StreamServer, HookReceiver, start | high | done | feature, daemon, api, websocket, testing | 003, 004 |
| 006 | CLI de hooks — hook, install/uninstall/status | medium | done | feature, daemon, cli, hooks, testing | 005 |
| 007 | Web foundation — Phaser, OfficeClient, SkinLoader | high | done | feature, web, phaser, websocket | 005 |
| 008 | RoomLayoutGenerator | high | done | feature, web, world, procedural | 007 |
| 009 | CharacterFactory | medium | done | feature, web, sprites, characters | 007 |
| 010 | CharacterController e ciclo de vida | high | done | feature, web, characters, state-machine | 008, 009 |
| 011 | PlayerAvatar, DialogBox e HUD | high | done | feature, web, interaction, ui | 010 |
| 012 | Hall da Fama, empacotamento e E2E | medium | done | feature, web, release, e2e, testing | 006, 011 |
| 013 | Spike de validação — PermissionRequest, timeout de hook e pty | high | done | spike, hooks, research, desktop | — |
| 014 | PermissionBroker, rota /hook/permission e protocolo | high | done | feature, daemon, api, websocket, testing | 013, 005 |
| 015 | Hook PermissionRequest no CLI e no SettingsMerger | high | done | feature, daemon, cli, hooks, testing | 014, 006 |
| 016 | PermissionCard na web e integração com o HUD | high | done | feature, web, ui, interaction, testing | 014, 011 |
| 017 | Pacote desktop — janela, daemon filho, bandeja e instância única | high | done | feature, desktop, electron, infra | 016, 012 |
| 018 | Instalar, ver status e remover hooks pela interface | medium | done | feature, desktop, web, hooks | 017, 015 |
| 019 | Empacotamento Linux/macOS e E2E do app desktop | medium | done | feature, desktop, release, e2e, testing | 017, 018 |
| 020 | SessionManager — ptys do Claude Code e ponte IPC | high | done | feature, desktop, pty, ipc, testing | 013, 017 |
| 021 | TerminalPanel — painel acoplado com abas (xterm.js) | high | done | feature, web, desktop, terminal, ui | 020, 016 |
| 022 | ProjectCatalog e ProjectPicker | high | done | feature, desktop, web, projects | 020, 021 |
| 023 | Vínculo aba ↔ sessão e ações no diálogo do jogo | high | done | feature, desktop, web, interaction | 022, 021 |
| 024 | ExternalOpener — abrir o projeto no VS Code | medium | done | feature, desktop, web, integration | 022, 023 |
| 025 | Ciclo de vida das sessões — bandeja, Sair e E2E do fluxo completo | medium | done | feature, desktop, e2e, testing | 020, 021, 024, 019 |
| 026 | Estilo de botão compartilhado com efeito de clique | high | done | feature, web, ui, css | — |
| 027 | Layout da modal "Hooks do Claude Code" | medium | done | feature, web, ui, css, hooks | 026 |
| 028 | Layout da modal "Iniciar sessão" sem rolagem horizontal | high | done | feature, web, ui, css, projects | 026 |
| 029 | Hook PermissionRequest não bloqueante e daemon rastreador | high | done | feature, daemon, shared, hooks, testing | 014, 015 |
| 030 | Remover o PermissionCard da web mantendo balão e contador | high | done | feature, web, ui, testing | 029 |
| 031 | Fechar a notificação do sistema ao resolver no terminal | high | done | feature, desktop, notifications, docs, testing | 029 |
| 032 | Contador de sessões e agentes conta apenas atores vivos | high | done | feature, web, daemon, shared, testing | — |
| 033 | Zoom do escritório — lógica, câmera e Ctrl + roda | medium | done | feature, web, camera, testing | — |
| 034 | Zoom do escritório — botões + / − e E2E | medium | done | feature, web, ui, testing | 033 |
| 035 | Substituir sub-agente ocioso ao recriar agente equivalente | high | done | feature, shared, daemon, web, testing | — |
| 036 | Finalizar sub-agentes ociosos por inatividade (liveness) | medium | done | feature, daemon, testing | 035 |
| 037 | HUD estático durante o zoom do escritório | high | done | bugfix, web, camera, ui, testing | 033, 034 |
| 038 | Fim da sala "Unknown" e das sessões fantasma | high | done | bugfix, shared, daemon, web, testing | 032, 036 |
| 039 | Botões Hooks e Sessões dentro da área do escritório | high | done | bugfix, web, ui, layout | 037 |
| 040 | Modelo do painel de terminal com dock e minimizar | medium | done | feature, web, terminal, testing | 039 |
| 041 | Clique no Tech Lead abre o terminal, clique fora minimiza | high | done | feature, web, desktop, terminal, testing | 040 |
| 042 | Dock do terminal à esquerda, à direita ou embaixo | medium | done | feature, web, ui, layout, terminal, testing | 040, 041 |
| 043 | Liberar mesas quando o agente sai | high | done | bugfix, web, layout, testing | 032, 035, 036, 038 |
| 044 | Resize idempotente, coalescido e com render síncrono | high | done | bugfix, web, performance, testing | 033, 037, 040 |
| 045 | Painel emite layout só quando muda e foco sem re-render | high | done | bugfix, web, terminal, testing | 040, 041, 044 |
| 046 | Limpar texturas de vinheta antigas | medium | done | bugfix, web, performance, testing | 044 |
| 047 | Terminal sem corte no rodapé | high | done | bugfix, web, terminal, layout, testing | — |
| 048 | Scrollbars finos globais | medium | done | feature, web, ui, testing | — |
| 049 | Barra de abas sem scrollbar nativa | high | done | bugfix, web, terminal, ui, testing | 048 |
| 050 | Porta atravessável em duas camadas e timing de abertura | high | done | enhancement, web, world, art, doors, testing | 008 |
| 051 | Parede com profundidade | high | done | enhancement, web, art, walls, lighting | 050 |
| 052 | Helpers de volume e contraste dos materiais | medium | done | refactor, web, art, skin-generator | — |
| 053 | Redesenho dos móveis com volume | high | done | enhancement, web, art, props, lighting | 051, 052 |
| 054 | Splash único "Carregando..." | medium | done | bugfix, desktop, ui, splash | — |
| 055 | Config de publicação e workflow de release | high | done | enhancement, desktop, ci, release | — |
| 056 | Serviço de update no processo principal e IPC | high | done | feature, desktop, updater, ipc | 055 |
| 057 | Ponte tipada do updater (shared + preload) | medium | done | feature, desktop, shared, preload | 056 |
| 058 | Banner de atualização na web | high | done | feature, web, ui, updater | 057 |
| 059 | Reinício limpo integrado ao QuitCoordinator | high | done | feature, desktop, updater, quit | 056 |
| 060 | Script de release e documentação | low | done | docs, release, tooling | 055 |
| 061 | Contratos compartilhados de perfil, elenco e aparência | high | done | feature, shared, contracts, testing | — |
| 062 | Biblioteca global de perfis e elenco por projeto (stores) | high | done | feature, desktop, persistence, testing | 061 |
| 063 | Agent Bus (servidor MCP local) e injeção de instruções nas sessões | high | done | feature, desktop, mcp, session, testing | 062 |
| 064 | Sessões gerenciadas: iniciar perfil, vínculo ao avatar e reabertura automática | high | done | feature, desktop, web, session, characters | 063 |
| 065 | Painel Elenco e editor de perfil com pré-visualização | medium | done | feature, web, ui | 064 |
| 066 | E2E e documentação de perfis e sessões gerenciadas | low | done | docs, testing, e2e | 065 |
| 067 | Grafo de conexões entre agentes e painel "pode falar com" | high | done | feature, desktop, web, ui, testing | 065 |
| 068 | Ferramentas de mensagem, fila e entrega ao PTY ocioso | high | done | feature, desktop, mcp, messaging, testing | 063, 067 |
| 069 | Disjuntor de saltos, limite de taxa e silenciar agente | high | done | feature, desktop, safety, testing | 068 |
| 070 | Histórico de mensagens e eventos de comunicação para o renderer | medium | done | feature, desktop, web, ipc, testing | 068 |
| 071 | Animação: remetente visita a mesa do destinatário | high | done | feature, web, characters, animation, testing | 070 |
| 072 | Papel Orquestrador e ferramentas spawn_agent / dismiss_agent | high | done | feature, desktop, mcp, orchestrator, testing | 068, 064 |
| 073 | Cartão de aprovação de criação e "permitir sem perguntar" | high | done | feature, desktop, web, ui, safety | 072 |
| 074 | Persistência dos agentes criados, auditoria e "Salvar como perfil" | medium | done | feature, desktop, web, persistence | 073, 064 |
| 075 | Store da cena do quadro e ferramentas board_* | high | done | feature, desktop, mcp, board, testing | 063 |
| 076 | Prop do quadro branco interativo (hover, cursor, rótulo, clique) | medium | done | feature, web, interaction, props | — |
| 077 | Overlay Excalidraw em tela cheia (carregamento sob demanda) | high | done | feature, web, excalidraw, ui | 075, 076 |
| 078 | Sincronização em tempo real agentes↔overlay e merge por versão | medium | done | feature, desktop, web, sync, testing | 077 |
| 079 | Mermaid e bibliotecas de formas (.excalidrawlib) | low | done | feature, desktop, web, excalidraw | 077 |
| 080 | BrowserHost: WebContentsView por workspace e aba no dock | high | done | feature, desktop, web, browser | 063 |
| 081 | Ferramentas browser_* via CDP e fila de ações | high | done | feature, desktop, mcp, browser, testing | 080 |
| 082 | Snapshot de acessibilidade, screenshot e console | high | done | feature, desktop, mcp, browser | 081 |
| 083 | Confirmações, pausar agentes e rotulagem de conteúdo | high | done | feature, desktop, web, safety | 081 |
| 084 | Seletor de elemento e injeção de contexto no agente | medium | done | feature, desktop, web, browser, context | 082 |
| 085 | Reação do avatar, E2E e documentação do navegador | low | done | docs, testing, e2e, web | 084, 083 |
| 086 | Release workflow publica o instalador do macOS | high | done | infra, ci, release, macos | — |
| 087 | README comercial com instalação oficial | high | done | docs, readme, release | 086 |
| 088 | DEVELOPMENT.md com o básico de desenvolvimento | medium | done | docs, development | — |
| 089 | DESIGN.md com design, layout e jogo | medium | done | docs, design, game, web | — |
| 090 | ARCHITECTURE.md com arquitetura e fluxo de comunicação | medium | done | docs, architecture, daemon, desktop | — |
| 091 | CLAUDE.md com regras de arquitetura do projeto | medium | done | docs, claude, conventions | 088, 089, 090 |
| 092 | Quadro Excalidraw dentro da sala do projeto | medium | done | feature, web, world, layout, testing | — |
| 093 | Affordance de interatividade do quadro | medium | done | feature, web, ui, phaser, testing | 092 |
| 094 | Reabertura explícita do roster e migração do legado | high | done | bugfix, desktop, shared, roster, testing | — |
| 095 | Encerrar a sessão quando o terminal gerenciado morre | high | done | bugfix, desktop, daemon, sessions, testing | — |
| 096 | Hooks tardios não criam sessão e expiração robusta | medium | done | bugfix, daemon, normalizer, liveness, testing | — |
| 097 | Personagem preso em "leaving" (condicional) | low | skipped | bugfix, web, phaser, characters, testing | 094, 095, 096 |
| 098 | Nome do perfil do elenco no balão de diálogo | medium | done | bugfix, web, ui, dialog, cast, testing | — |
| 099 | Infraestrutura de i18n (locale, dicionários e helper t) | high | done | feature, web, i18n, testing | — |
| 100 | Botão de idioma na barra inferior | high | done | feature, web, ui, i18n, testing | 099 |
| 101 | Migrar HUD, dicas, ajuda e zoom para i18n | high | done | refactor, web, ui, i18n, testing | 099 |
| 102 | Migrar Hooks, Sessões e diálogos para i18n | medium | done | refactor, web, ui, i18n, testing | 099 |
| 103 | Migrar painel Elenco para i18n | medium | done | refactor, web, ui, i18n, cast, testing | 099 |
| 104 | Migrar terminal, navegador, quadro e demais textos para i18n | medium | done | refactor, web, ui, i18n, testing | 099 |
| 105 | i18n - testes e2e, regra no CLAUDE.md e documentação | medium | done | docs, testing, e2e, i18n | 100, 101, 102, 103, 104 |

Fases do PRD: 001–002 = Fase 0 (spike) · 003–011 = Fase 1 (MVP) · 006, 012 = parte da Fase 2. Replay, minimapa e Tauri (Fase 3) ficam fora deste lote.

PRDs do app desktop: [desktop-app-permissions.prd.md](../prds/desktop-app-permissions.prd.md) (013–019) · [desktop-terminal-sessions.prd.md](../prds/desktop-terminal-sessions.prd.md) (020–025, depende do primeiro). O spec 013 é um spike de validação: seus resultados podem exigir ajustes nos specs 014–025. Windows, assinatura/notarização e auto-update ficam fora deste lote.

PRD de polimento das modais: [modal-ui-polish.prd.md](../prds/modal-ui-polish.prd.md) (026–028; 027 e 028 dependem de 026 e são independentes entre si).

PRD de zoom do escritório: [zoom-escritorio.prd.md](../prds/zoom-escritorio.prd.md) (033–034; 034 depende de 033).

PRD do avatar de sub-agente órfão: [avatar-subagente-orfao.prd.md](../prds/avatar-subagente-orfao.prd.md) (035–036; 036 depende de 035).

PRD do HUD estático no zoom: [hud-estatico-zoom.prd.md](../prds/hud-estatico-zoom.prd.md) (037; depende de 033 e 034).

PRD da sala Unknown e sessões fantasma: [sala-unknown-sessoes-fantasma.prd.md](../prds/sala-unknown-sessoes-fantasma.prd.md) (038; depende de 032 e 036).

PRD do terminal por clique, dock e botões: [terminal-por-clique-dock-botoes.prd.md](../prds/terminal-por-clique-dock-botoes.prd.md) (039–042; 040 depende de 039, 041 de 040, 042 de 040 e 041).

PRD das mesas liberadas: [mesas-liberadas-agente-sai.prd.md](../prds/mesas-liberadas-agente-sai.prd.md) (043; depende de 032, 035, 036 e 038).

PRD sem flash ao redimensionar: [sem-flash-ao-redimensionar.prd.md](../prds/sem-flash-ao-redimensionar.prd.md) (044–046; 045 depende de 044, 046 de 044).

PRD do terminal sem corte e scrollbars: [terminal-sem-corte-scrollbars.prd.md](../prds/terminal-sem-corte-scrollbars.prd.md) (047–049; 049 depende de 048).

PRD do cenário com volume: [cenario-volume-portas-moveis.prd.md](../prds/cenario-volume-portas-moveis.prd.md) (050–053; 051 depende de 050, 053 de 051 e 052; 052 é independente).

PRD do splash único: [splash-unico-carregando.prd.md](../prds/splash-unico-carregando.prd.md) (054; independente).

PRD de auto-update e releases: [auto-update-releases.prd.md](../prds/auto-update-releases.prd.md) (055–060; 056 depende de 055, 057 de 056, 058 de 057, 059 de 056, 060 de 055).

PRD de perfis e sessões gerenciadas: [perfis-sessoes-gerenciadas.prd.md](../prds/perfis-sessoes-gerenciadas.prd.md) (061–066; 062 depende de 061, 063 de 062, 064 de 063, 065 de 064, 066 de 065).

PRD de comunicação entre agentes: [comunicacao-entre-agentes.prd.md](../prds/comunicacao-entre-agentes.prd.md) (067–071; 067 depende de 065, 068 de 063 e 067, 069 de 068, 070 de 068, 071 de 070).

PRD do orquestrador: [orquestrador-de-agentes.prd.md](../prds/orquestrador-de-agentes.prd.md) (072–074; 072 depende de 068 e 064, 073 de 072, 074 de 073 e 064).

PRD do quadro Excalidraw: [quadro-excalidraw.prd.md](../prds/quadro-excalidraw.prd.md) (075–079; 075 depende de 063, 076 é independente, 077 de 075 e 076, 078 e 079 de 077).

PRD do navegador embutido: [navegador-embutido.prd.md](../prds/navegador-embutido.prd.md) (080–085; 080 depende de 063, 081 de 080, 082 e 083 de 081, 084 de 082, 085 de 083 e 084).

PRD da documentação do projeto: [documentacao-do-projeto.prd.md](../prds/documentacao-do-projeto.prd.md) (086–091; 087 depende de 086, 091 de 088, 089 e 090; 088, 089 e 090 são independentes).

PRD do quadro na sala e affordance: [quadro-na-sala-e-affordance.prd.md](../prds/quadro-na-sala-e-affordance.prd.md) (092–093; 093 depende de 092).

PRD do Tech Lead fantasma: [tech-lead-fantasma-sessoes-ociosas.prd.md](../prds/tech-lead-fantasma-sessoes-ociosas.prd.md) (094–097; 094, 095 e 096 são independentes; 097 é condicional e depende de 094, 095 e 096).

PRD do nome do elenco no balão de diálogo: [balao-dialogo-nome-do-elenco.prd.md](../prds/balao-dialogo-nome-do-elenco.prd.md) (098; independente).

PRD do seletor de idioma: [locale-seletor-de-idioma.prd.md](../prds/locale-seletor-de-idioma.prd.md) (099–105; 100 a 104 dependem de 099, 105 de 100 a 104; 101 a 104 são independentes entre si).
