---
title: Migrar terminal, navegador, quadro e demais textos para i18n
number: 104
priority: medium
tags: [refactor, web, ui, i18n, testing]
dependencies: [099-infra-i18n-locale.spec.md]
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 104 - Migrar terminal, navegador, quadro e demais textos para i18n

## Overview
Conclui a migração: terminal e abas, navegador embutido e cartões de aprovação, quadro Excalidraw, esqueletos Mermaid, identidade e textos soltos de personagens/jogador.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 13, 14, 23

## Prerequisites
- [ ] Spec 099 concluída
- [ ] Ler `ui/terminalPanel.ts`, `ui/terminalTabs.ts`, `ui/browserPane.ts`, `ui/browserApprovalCard.ts`, `ui/browserPickLogic.ts`, `ui/spawnApprovalCard.ts`, `ui/boardOverlay.ts`, `ui/mermaidSkeletons.ts`, `ui/identity.ts`, `ui/nameTag.ts`, `player/player.ts`, `characters/characterController.ts`

## Dependencies
- `099-infra-i18n-locale.spec.md` - `t()`

## Implementation Tasks
### 1. Terminal e navegador
- [ ] Chaves `terminal.*` e `browser.*` (inclui cartões de aprovação; aprovações continuam falhando fechadas, só o texto muda)
### 2. Quadro e diagramas
- [ ] `boardOverlay.ts` (`board.*`) e `mermaidSkeletons.ts` (rótulos dos esqueletos; o código Mermaid em si não é traduzido)
### 3. Demais
- [ ] `identity.ts`, `nameTag.ts`, `player.ts`, `characterController.ts` e quaisquer outros literais encontrados por busca (`rg "[áéíóúãõçâêô]" packages/web/src`)
- [ ] Textos do `shared`/`desktop` exibidos na UI web: mapear por id; o que só existe no processo principal (notificações, bandeja) fica fora (ver PRD)
### 4. Dicionários e testes
- [ ] Chaves nos três dicionários; ajustar testes (`browserPickLogic`, etc.) fixando o idioma

## Acceptance Criteria
### Must Have
- [ ] Busca por caracteres acentuados em `packages/web/src` só retorna comentários, dicionários pt-BR/es ou dados do usuário
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas causadas por esta spec
### Should Have
- [ ] Percurso manual por terminal, navegador e quadro nos três idiomas

## Testing Requirements
```bash
pnpm vitest run packages/web
pnpm typecheck && pnpm lint
```

## Rollback Plan
Reverter os arquivos migrados e as chaves adicionadas.
