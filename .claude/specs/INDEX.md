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

Fases do PRD: 001–002 = Fase 0 (spike) · 003–011 = Fase 1 (MVP) · 006, 012 = parte da Fase 2. Replay, minimapa e Tauri (Fase 3) ficam fora deste lote.

PRDs do app desktop: [desktop-app-permissions.prd.md](../prds/desktop-app-permissions.prd.md) (013–019) · [desktop-terminal-sessions.prd.md](../prds/desktop-terminal-sessions.prd.md) (020–025, depende do primeiro). O spec 013 é um spike de validação: seus resultados podem exigir ajustes nos specs 014–025. Windows, assinatura/notarização e auto-update ficam fora deste lote.
