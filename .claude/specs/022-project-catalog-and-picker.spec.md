---
title: ProjectCatalog e ProjectPicker
number: 022
priority: high
tags: [feature, desktop, web, projects]
dependencies: [020-session-manager-pty-ipc.spec.md, 021-terminal-panel-xterm.spec.md]
related_prd: ../prds/desktop-terminal-sessions.prd.md
status: pending
created: 2026-10-10
---

# 022 - ProjectCatalog e ProjectPicker

## Overview
Lista os projetos para iniciar sessões: mescla os projetos do modelo e do histórico em `~/.claude/projects`, favoritos e recentes persistidos, e "Novo projeto…" com o seletor de pastas do sistema. O `ProjectPicker` permite escolher retomar sessão (`--resume`/`--continue`) e o modo de permissão ao iniciar.

## Related PRD
- **Source**: [Sessões em terminal embutido e VS Code](../prds/desktop-terminal-sessions.prd.md)
- **Section Reference**: User Stories 1-6; Implementation Decisions → ProjectCatalog, ProjectPicker

## Prerequisites
- [ ] Specs 020 e 021 concluídos

## Dependencies
- `020-session-manager-pty-ipc.spec.md`: start de sessão
- `021-terminal-panel-xterm.spec.md`: abas

## Implementation Tasks
### 1. ProjectCatalog (`packages/desktop/src/main/projectCatalog.ts`, puro + persistência)
- [ ] Fontes: `OfficeModel.projects[].cwd` (via daemon), histórico em disco (ler `cwd` das linhas do transcript mais recente de cada slug; fallback decodificar o slug), favoritos e recentes da configuração
- [ ] Ordenação: favoritos, recentes por último uso, depois restantes; remover pastas que não existem mais
- [ ] Persistência em arquivo JSON do app (diretório de dados do usuário), com escrita atômica
- [ ] "Novo projeto…" via `dialog.showOpenDialog({properties:['openDirectory']})` no processo principal
### 2. ProjectPicker (`packages/web/src/ui/projectPicker.ts`)
- [ ] Lista com busca, favoritar, recentes; botão Iniciar sessão
- [ ] Opções ao iniciar: nova sessão / continuar a última / retomar uma escolhida; modo de permissão via `--permission-mode` (valores documentados: `default`, `acceptEdits`, `plan`, `dontAsk`, `auto`, `bypassPermissions`; spike 013: só `default` gera cartões de permissão, `auto` não dispara o hook; rotular isso no picker)
- [ ] Acesso por tela fora do jogo e pelo ponto de interação na sala (spec 023)
### 3. Testing
- [ ] Unidade do catálogo: mesclagem, ordenação, remoção de inexistentes, decodificação de slug, persistência atômica (diretório temporário)
- [ ] Lógica pura do picker (filtro, opções → argumentos do `claude`) testada com Vitest

## Acceptance Criteria
### Must Have
- [ ] Projetos conhecidos e do histórico aparecem sem duplicata
- [ ] Favoritos e recentes persistem entre execuções
- [ ] Opções viram os argumentos corretos do `claude`

### Should Have
- [ ] Busca incremental

## Testing Requirements
```bash
pnpm --filter @agents-office/desktop test projectCatalog
pnpm --filter @agents-office/web test projectPicker
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `projectCatalog.ts` e `projectPicker.ts` e o arquivo de configuração do app.
