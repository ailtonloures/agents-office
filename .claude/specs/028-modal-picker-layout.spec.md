---
title: Layout da modal "Iniciar sessão" sem rolagem horizontal
number: 028
priority: high
tags: [feature, web, ui, css, projects]
dependencies: [026-botao-compartilhado.spec.md]
related_prd: ../prds/modal-ui-polish.prd.md
status: pending
created: 2026-10-11
---

# 028 - Layout da modal "Iniciar sessão" sem rolagem horizontal

## Overview
Elimina o scroll horizontal e organiza o conteúdo da modal em grids. Causas prováveis: `cwd` sem quebra, `select` de sessão que não encolhe dentro do label flex, linha de ações sem `flex-wrap`.

## Related PRD
- **Source**: [Polimento visual das modais](../prds/modal-ui-polish.prd.md)
- **Section Reference**: User Stories 11–18, 21, 23; Implementation Decisions → modal Iniciar sessão

## Prerequisites
- [ ] Spec 026 concluído

## Dependencies
- `026-botao-compartilhado.spec.md`: botões e efeito de clique

## Implementation Tasks
### 1. Caixa e conteúdo (`packages/web/src/ui/projectPickerPanel.ts`)
- [ ] `.ao-picker-box`: `overflow-x:hidden; overflow-y:auto; box-sizing:border-box; padding:20px 24px; gap:12px`; filhos diretos com `min-width:0; max-width:100%`
- [ ] Elemento `picker-selected` (cwd): classe `ao-picker-cwd` com `overflow-wrap:anywhere; color:#8a8fa8`
### 2. Opções e permissão
- [ ] `.ao-picker-opts`: `display:grid; gap:8px`; `label` como cartão (`padding:8px 10px; background:#0d1020; border:2px solid transparent`) e `label:has(input:checked){border-color:#f0c040}`
- [ ] `select` dentro do label: `flex:1; min-width:0; max-width:100%; text-overflow:ellipsis`
- [ ] Linha "Modo de permissão": `display:grid; grid-template-columns:auto minmax(0,1fr); gap:8px; align-items:center`, `select{width:100%}` (classe no label existente, sem mudar `data-testid`)
- [ ] `.ao-picker-note/warn/err`: `line-height:1.5; overflow-wrap:anywhere`
### 3. Lista e ações
- [ ] `.ao-picker-row`: `padding:8px 10px; gap:12px`
- [ ] `.ao-picker-actions`: `flex-wrap:wrap; gap:10px; margin-top:4px`
### 4. Testing
- [ ] Testes Vitest existentes passam sem alteração
- [ ] E2E (Playwright MCP): projeto com `cwd` muito longo e sessão com resumo longo; `scrollWidth === clientWidth` em `.ao-picker-box` em 1280px e 480px; ações quebram de linha em 480px

## Acceptance Criteria
- [ ] Nenhuma rolagem horizontal em qualquer largura testada
- [ ] Opção marcada destacada; modo de permissão alinhado ao rótulo
- [ ] `data-testid` e textos inalterados

## Verification
`pnpm --filter @agents-office/web test`, typecheck, `pnpm biome check`, captura de tela com Playwright MCP.
