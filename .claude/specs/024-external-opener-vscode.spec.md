---
title: ExternalOpener — abrir o projeto no VS Code
number: 024
priority: medium
tags: [feature, desktop, web, integration]
dependencies: [022-project-catalog-and-picker.spec.md, 023-tab-session-binding-and-game-actions.spec.md]
related_prd: ../prds/desktop-terminal-sessions.prd.md
status: pending
created: 2026-10-10
---

# 024 - ExternalOpener — abrir o projeto no VS Code

## Overview
Adiciona o botão "Abrir no VS Code" no diálogo da sala/Tech Lead, na lista de projetos e na aba do terminal, executando `code <pasta>` (com fallback para os caminhos padrão de Linux e macOS) e avisando de forma clara quando o VS Code não for encontrado.

## Related PRD
- **Source**: [Sessões em terminal embutido e VS Code](../prds/desktop-terminal-sessions.prd.md)
- **Section Reference**: User Stories 19-21; Implementation Decisions → ExternalOpener

## Prerequisites
- [ ] Specs 022 e 023 concluídos

## Dependencies
- `022-project-catalog-and-picker.spec.md`: lista de projetos
- `023-tab-session-binding-and-game-actions.spec.md`: diálogo do jogo

## Implementation Tasks
### 1. ExternalOpener (`packages/desktop/src/main/externalOpener.ts`)
- [ ] `openInVSCode(dir)`: valida o diretório; tenta `code` do PATH de login; fallbacks: Linux (`/usr/bin/code`, `/snap/bin/code`, `/var/lib/flatpak/...` quando possível), macOS (`/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code` e `open -a "Visual Studio Code" <dir>`)
- [ ] Executar com `execFile` (sem shell, argumentos como array, sem interpolação); nunca concatenar o caminho em string de comando
- [ ] Erro tipado `VSCodeNotFound` com mensagem orientando a instalar ou definir o caminho nas configurações; caminho manual salvo
- [ ] Lógica de descoberta isolada e testável (ambiente/FS injetáveis)
### 2. IPC e UI
- [ ] Canal `external.openInVSCode(dir)` na ponte tipada (validar o diretório no processo principal)
- [ ] Botão no diálogo do jogo (sala e Tech Lead), no `ProjectPicker` e na barra da aba do terminal; toast de erro quando ausente
### 3. Testing
- [ ] Unidade da descoberta (PATH presente, ausente, fallback macOS/Linux)
- [ ] Integração com `code` falso que grava os argumentos: recebe exatamente a pasta, inclusive com espaços e caracteres especiais
- [ ] E2E: clicar no botão registra a chamada do `code` falso

## Acceptance Criteria
### Must Have
- [ ] Pasta com espaços e caracteres especiais é aberta corretamente
- [ ] Ausência do VS Code gera aviso claro, sem exceção

### Should Have
- [ ] Configuração de caminho manual do editor

## Testing Requirements
```bash
pnpm --filter @agents-office/desktop test externalOpener
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `externalOpener.ts`, o canal IPC e os botões.
