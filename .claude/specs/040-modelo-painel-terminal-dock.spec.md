---
title: Modelo do painel de terminal com dock e minimizar
number: 040
priority: medium
tags: [feature, web, terminal, testing]
dependencies: [039]
related_prd: ../prds/terminal-por-clique-dock-botoes.prd.md
status: pending
created: 2026-10-11
---

# 040 - Modelo do painel de terminal com dock e minimizar

## Overview
Estende o modelo puro do painel (`PanelModel`) com a posição (embaixo, esquerda, direita), a largura e o cálculo do espaço ocupado por posição, mais uma operação explícita de minimizar. Não há mudança visual nesta spec além de expor `collapse()` no painel.

## Related PRD
- **Source**: [Terminal por clique, dock e botões](../prds/terminal-por-clique-dock-botoes.prd.md)
- **Section Reference**: User Stories 13, 15–16, 19–21, 29; Implementation Decisions (modelo do painel)

## Prerequisites
- [ ] Spec 039 concluída

## Dependencies
- 039 — botões já presos a `#game`

## Implementation Tasks
### 1. Modelo (`packages/web/src/ui/terminalTabs.ts`)
- [ ] Adicionar `dock: 'bottom' | 'left' | 'right'` e `width` a `PanelModel` (padrão `bottom`, largura padrão ~480)
- [ ] `setDock(model, dock)`, `clampWidth` (mínimo 240; o escritório mantém no mínimo 256px) e `collapse(model)` idempotente
- [ ] `panelOccupiedSize(model)` retorna `{axis, size}`: altura embaixo, largura nas laterais; colapsado = faixa fina (`TAB_BAR_HEIGHT`); sem abas = 0. Manter `panelOccupiedHeight` como wrapper enquanto houver chamadores
- [ ] Persistência (`agents-office.terminalPanel`): ler valores antigos sem `dock`/`width` assumindo `bottom` e a largura padrão; descartar valores inválidos
### 2. Painel (`packages/web/src/ui/terminalPanel.ts`)
- [ ] Expor `collapse()` no objeto retornado (usa o modelo, chama `render()` e devolve o teclado ao jogo)
- [ ] Sem mudar o visual: ainda renderiza só embaixo
### 3. Testes unitários
- [ ] Dock, clamp de largura/altura, tamanho ocupado por posição, colapso idempotente
- [ ] Migração de armazenamento antigo e valores inválidos
- [ ] Teste ao lado de `terminalTabs.test.ts`

## Acceptance Criteria
### Must Have
- [ ] Comportamento visual atual preservado
- [ ] Modelo puro e testado; valores antigos persistidos continuam válidos
- [ ] `pnpm typecheck`, `pnpm lint` e testes unitários verdes
### Should Have
- [ ] Sem referências duplicadas a constantes de tamanho mínimo

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit; o armazenamento local com campos extras é ignorado pela versão antiga.
