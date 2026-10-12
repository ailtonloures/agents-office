---
title: Splash único "Carregando..."
number: 054
priority: medium
tags: [bugfix, desktop, ui, splash]
dependencies: []
related_prd: ../prds/splash-unico-carregando.prd.md
status: done
created: 2026-10-11
---

# 054 - Splash único "Carregando..."

## Overview
O desktop mostra a página "Iniciando o daemon..." antes do splash web com "Carregando...". Remover a primeira para manter só o splash com "Carregando...".

## Related PRD
- **Source**: [Splash único](../prds/splash-unico-carregando.prd.md)
- **Section Reference**: User Stories 1–8

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Desktop (`packages/desktop/src/main/main.ts`)
- [ ] Remover o `loadURL(errorPageUrl('Agents Office', 'Iniciando o daemon...'))` após criar a janela (~linha 413)
- [ ] `createWindow`: `backgroundColor` de `#1b1d2a` para `#0d1020` (fundo do splash em `packages/web/index.html`)
- [ ] Manter `errorPageUrl` para `showError` (porta ocupada / daemon falhou)
### 2. Testes
- [ ] Atualizar/adicionar teste de ciclo de vida: nada é carregado antes de `running`/`external`; erros ainda carregam a página de erro
- [ ] Verificação e2e (`/qa`): arranque mostra só logo + "Carregando...", sem flash de outra cor

## Acceptance Criteria
### Must Have
- [ ] Apenas um splash (com "Carregando...") é exibido na abertura
- [ ] A mensagem "Iniciando o daemon..." não aparece mais
- [ ] Páginas de erro continuam funcionando
- [ ] `pnpm typecheck`, `pnpm lint` e testes verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit; volta ao splash duplo.
