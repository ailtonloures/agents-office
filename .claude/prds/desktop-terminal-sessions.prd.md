---
title: Agents Office Desktop: sessões do Claude em terminal embutido e abrir no VS Code
status: draft
labels: [needs-spec]
created: 2026-10-10
related: [agents-office.prd.md, desktop-app-permissions.prd.md]
depends_on: [desktop-app-permissions.prd.md]
---

# PRD: Sessões do Claude em terminal embutido e abrir no VS Code

## Problem Statement

Mesmo com o app desktop, para começar uma sessão do Claude Code o usuário ainda precisa abrir um terminal externo, navegar até o projeto e rodar `claude`. O escritório mostra as sessões, mas não é o lugar de onde elas nascem. Também não há um atalho para abrir o projeto de uma sala no editor.

## Solution

O app passa a **iniciar sessões do Claude Code por dentro**, em um terminal embutido (`node-pty` + `xterm.js`) com o diretório de trabalho no projeto escolhido. As sessões iniciadas pelo app aparecem no escritório sozinhas, porque o Claude Code já grava transcripts e dispara hooks. O usuário escolhe o projeto em uma lista de projetos conhecidos (ou em um seletor de pastas), inicia a sessão e a acompanha numa aba do painel inferior acoplado, sem perder a visão do escritório. Um botão **Abrir no VS Code** abre a pasta do projeto no editor. Os pedidos de permissão dessas sessões usam o mesmo fluxo de aprovação do PRD anterior.

## User Stories

### Escolher o projeto e iniciar
1. Como desenvolvedor, quero ver uma lista de projetos conhecidos (os que já apareceram no escritório e os do histórico do Claude Code), para iniciar uma sessão num deles com um clique.
2. Como desenvolvedor, quero um botão "Novo projeto…" que abre o seletor de pastas do sistema, para iniciar uma sessão numa pasta que o Claude nunca abriu.
3. Como desenvolvedor, quero marcar projetos como favoritos e ver os recentes primeiro, para achar rápido o que uso.
4. Como desenvolvedor, quero iniciar a sessão pela sala do projeto no escritório (ponto de interação) ou por uma tela de projetos fora do jogo.
5. Como desenvolvedor, quero opcionalmente retomar uma sessão existente do projeto (`--resume`/`--continue`) ao iniciar, para continuar um trabalho.
6. Como desenvolvedor, quero escolher o modo de permissão ao iniciar (padrão do Claude Code, ou outro disponível), para ajustar o risco da sessão.
7. Como desenvolvedor, quero ser avisado de forma clara se o comando `claude` não for encontrado, com orientação para instalar ou apontar o caminho.

### Terminal embutido
8. Como desenvolvedor, quero um painel inferior acoplado e redimensionável com uma aba por sessão iniciada pelo app, para alternar entre sessões.
9. Como desenvolvedor, quero recolher o painel com um atalho para ver o escritório inteiro.
10. Como desenvolvedor, quero um terminal completo (cores, cursor, redimensionamento, colar, copiar, rolagem), para usar o Claude Code como no terminal normal.
11. Como desenvolvedor, quero que o título da aba mostre o projeto e o estado da sessão.
12. Como desenvolvedor, quero apertar A no Tech Lead de uma sessão do app e escolher "Abrir terminal", para trazer a aba daquela sessão ao foco.
13. Como desenvolvedor, quero ver, no escritório, a sessão que iniciei aparecer como Tech Lead sem configuração extra.

### Ciclo de vida
14. Como desenvolvedor, quero que fechar a janela mantenha as sessões rodando (app na bandeja), para não perder trabalho.
15. Como desenvolvedor, quero que, ao reabrir a janela, as abas reconectem e mostrem o histórico recente do terminal (cerca de 5.000 linhas).
16. Como desenvolvedor, quero que "Sair" liste as sessões ativas e peça confirmação antes de encerrá-las, e que encerre de forma limpa (SIGHUP e depois SIGKILL após alguns segundos).
17. Como desenvolvedor, quero poder fechar uma aba de terminal individualmente, com confirmação se o `claude` ainda estiver ativo.
18. Como desenvolvedor, quero que, se o app travar, o transcript do Claude Code permaneça no disco, para eu retomar a sessão com `--resume`.

### Abrir no VS Code
19. Como desenvolvedor, quero um botão "Abrir no VS Code" no diálogo da sala/Tech Lead (via A no jogo), para abrir o projeto no editor.
20. Como desenvolvedor, quero o mesmo botão na lista de projetos fora do jogo e na aba do terminal da sessão.
21. Como desenvolvedor, quero que o app ache o VS Code mesmo sem `code` no PATH (locais padrão de Linux e macOS) e me avise claramente se não achar.

## Implementation Decisions

### Decisões já tomadas
- **Plataformas**: Linux e macOS somente. Windows (ConPTY) fica fora.
- **Terminal**: `node-pty` no processo principal do Electron (ou num `utilityProcess` dedicado) + `xterm.js` no renderer, ligados por IPC.
- **Projetos**: lista de conhecidos (do `OfficeModel` e do histórico em `~/.claude/projects`) + seletor de pastas; favoritos/recentes guardados na configuração do app.
- **UI**: painel inferior acoplado com abas; o pedido de permissão é um cartão sobre o escritório (do PRD anterior), sem tirar o foco do terminal.
- **Ciclo de vida**: os ptys sobrevivem ao fechar a janela (bandeja); "Sair" confirma e encerra; crash do app não preserva ptys (a retomada é por `--resume`). Sem processo separado de ptys na v1.
- **Abrir no VS Code**: `code <pasta>` com fallback para os caminhos padrão de cada sistema; aviso se ausente.
- **Aprovação de permissões** nas sessões do app usa o fluxo do PRD `desktop-app-permissions` sem diferença, com a espera indeterminada.

### Módulos
- **desktop / SessionManager** (novo, módulo profundo): cria, lista, redimensiona e encerra ptys; guarda o buffer circular por sessão; expõe `start({cwd, resume?, permissionMode?})`, `write`, `resize`, `kill`, `onData`, `onExit`. Resolve o caminho do `claude` e do `code`.
- **desktop / ProjectCatalog** (novo): mescla projetos do modelo e do histórico em disco, favoritos e recentes; persiste em arquivo de configuração do app.
- **desktop / ExternalOpener**: abre a pasta no VS Code e trata a ausência.
- **web**: **TerminalPanel** (abas com `xterm.js`, redimensionamento, recolher), **ProjectPicker** (lista, favoritos, "Novo projeto…") e novas ações no diálogo do jogo ("Iniciar sessão", "Abrir terminal", "Abrir no VS Code"). A web chama o desktop por uma ponte IPC mínima exposta no preload; fora do Electron essas ações ficam ocultas.
- **shared**: tipo `AppSession` (id, cwd, estado) e o vínculo opcional entre uma sessão do app e o `sessionId` do Claude Code, feito pelo `cwd` e pelo horário de início ao surgir o `session.started`.

### Premissas a validar antes dos specs
- Que o `claude` iniciado no pty dispara os hooks instalados normalmente (mesmo `settings.json`) e que a sessão aparece no escritório pelo transcript.
- Como vincular de forma confiável a aba do app à sessão do Claude Code (por `cwd` + tempo; ou passando uma variável de ambiente única ao pty e lendo-a no payload do hook, se disponível).
- Compilação do `node-pty` no empacotamento do Electron para Linux e macOS (`electron-rebuild`).
- Como achar o `claude` quando o app é aberto pela bandeja (PATH do ambiente gráfico costuma ser menor que o do shell; usar o shell de login para resolver).

## Testing Decisions

- **Unidade (puros)**: ProjectCatalog (mesclagem, favoritos, recentes), resolução de caminhos do `claude` e do `code`, buffer circular de terminal, vínculo aba ↔ sessão.
- **SessionManager com pty real**: iniciar um comando simples (um shell/`echo`) num diretório temporário, verificar saída, resize, kill limpo (SIGHUP depois SIGKILL) e reconexão com o buffer.
- **Seam 4 (E2E Playwright para Electron)**: iniciar uma sessão de um projeto temporário usando um binário `claude` falso (script que imprime texto e dorme), conferir a aba, o buffer ao reabrir a janela, o diálogo "Sair" com confirmação e o botão "Abrir no VS Code" com um `code` falso que registra os argumentos.
- Verificação manual em Linux e macOS com o Claude Code real: iniciar uma sessão, ver o Tech Lead no escritório, aprovar um pedido pelo cartão, fechar e reabrir a janela.
- Prior art: `daemon.e2e.test.ts` e o pacote `e2e` do projeto.

## Out of Scope

- Windows.
- Terminal que sobrevive a crash do app (processo de ptys separado).
- Múltiplos painéis/splits de terminal, temas e configurações avançadas do terminal.
- Controlar sessões que **não** foram iniciadas pelo app (digitar nelas ou enviar mensagens).
- Conversar com um subagente específico (só o Tech Lead aceita entrada).
- Integração mais profunda com o VS Code (extensão, abrir arquivo/linha específicos).
- Escolher outros editores além do VS Code.

## Further Notes

- Depende do app desktop e do fluxo de aprovação: implementar depois do PRD `desktop-app-permissions`.
- O terminal embutido executa comandos reais no computador do usuário; o app não deve injetar entrada sozinho, e só o usuário digita no terminal.
- Ordem sugerida de specs: (1) SessionManager + IPC + pty; (2) TerminalPanel; (3) ProjectCatalog + ProjectPicker; (4) vínculo aba ↔ sessão e ações no diálogo do jogo; (5) ExternalOpener e botão do VS Code; (6) ciclo de vida (bandeja, "Sair", buffer) e E2E.
