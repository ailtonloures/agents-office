---
title: Layout da modal "Hooks do Claude Code"
number: 027
priority: medium
tags: [feature, web, ui, css, hooks]
dependencies: [026-botao-compartilhado.spec.md]
related_prd: ../prds/modal-ui-polish.prd.md
status: pending
created: 2026-10-11
---

# 027 - Layout da modal "Hooks do Claude Code"

## Overview
Reorganiza a modal de Hooks: lista de eventos em grade de cartões com espaço entre marcador e nome, mais respiro interno e ações espaçadas. Só CSS; o texto dos itens (`[x] Evento`) não muda.

## Related PRD
- **Source**: [Polimento visual das modais](../prds/modal-ui-polish.prd.md)
- **Section Reference**: User Stories 1–6, 21, 23; Implementation Decisions → modal de Hooks

## Prerequisites
- [ ] Spec 026 concluído

## Dependencies
- `026-botao-compartilhado.spec.md`: botões e espaçamento de ações

## Implementation Tasks
### 1. CSS (`packages/web/src/ui/settingsPanel.ts`)
- [ ] `.ao-hooks-box`: `padding:20px 24px`; `h2` com `margin:0 0 12px`
- [ ] `ul`: trocar `columns:2` por `display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px 16px; padding:0; margin:12px 0`
- [ ] `li`: `padding:6px 10px; background:#0d1020; border-left:3px solid #4a4f70; word-spacing:.25em` (sem alterar o `textContent`)
- [ ] `@media (max-width:520px)`: grade em 1 coluna
- [ ] Blocos de resumo/caminho com `margin:6px 0`; caminho em `#8a8fa8` com `overflow-wrap:anywhere`
- [ ] Contêiner de ações: `display:flex; gap:10px; flex-wrap:wrap; margin-top:12px` (atribuir classe, p.ex. `ao-hooks-actions`, nos contêineres de botões de `showStatus` e `confirmChange`)
- [ ] `.ao-hooks-diff` mantém `overflow:auto`
### 2. Testing
- [ ] Testes Vitest existentes passam sem alteração
- [ ] E2E: em 1280px e 480px, `scrollWidth === clientWidth` em `.ao-hooks-box` fora do diff; 2 colunas no desktop e 1 em 480px

## Acceptance Criteria
- [ ] Marcador e nome separados, itens alinhados em grade, ações com espaço
- [ ] Sem rolagem horizontal da modal em 480px
- [ ] `data-testid` e textos inalterados

## Verification
`pnpm --filter @agents-office/web test`, typecheck, `pnpm biome check`, captura de tela com Playwright MCP.
