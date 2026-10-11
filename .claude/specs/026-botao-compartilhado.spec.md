---
title: Estilo de botão compartilhado com efeito de clique
number: 026
priority: high
tags: [feature, web, ui, css]
dependencies: []
related_prd: ../prds/modal-ui-polish.prd.md
status: pending
created: 2026-10-11
---

# 026 - Estilo de botão compartilhado com efeito de clique

## Overview
Hoje cada painel repete o CSS de botão, sem `:hover`, `:active`, `:focus-visible` nem transição. Este spec cria um módulo único com o estilo e o efeito "afundar ao pressionar" e o aplica às duas modais e aos botões flutuantes.

## Related PRD
- **Source**: [Polimento visual das modais](../prds/modal-ui-polish.prd.md)
- **Section Reference**: User Stories 6–10, 19, 20, 22; Implementation Decisions → botão

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Módulo de estilo (`packages/web/src/ui/buttonStyles.ts`)
- [ ] Exportar `BUTTON_CSS` (string) para os seletores `.ao-hooks-box button, .ao-hooks-banner button, .ao-hooks-btn, .ao-picker-box button, .ao-picker-btn`, excluindo `.ao-picker-row .star`
- [ ] Base: `box-shadow:0 3px 0 #000a; transform:translateY(0); transition:transform .06s, box-shadow .06s, background .12s`
- [ ] `:hover:not(:disabled)`: fundo `#34385a`
- [ ] `:active:not(:disabled)`: `transform:translateY(3px); box-shadow:0 0 0 #000a`
- [ ] `:focus-visible`: `outline:2px solid #9ad1ff; outline-offset:2px`
- [ ] `:disabled`: `opacity:.45; cursor:default; box-shadow:none`
- [ ] Manter fonte (`12px monospace`), cores e borda atuais
### 2. Aplicação
- [ ] Importar e concatenar `BUTTON_CSS` ao `CSS` de `settingsPanel.ts` e `projectPickerPanel.ts`
- [ ] Remover as regras de botão duplicadas nos dois arquivos (inclusive `:disabled` do picker)
- [ ] Remover `margin-right:6px` dos botões de Hooks (o espaçamento passa a vir do contêiner, spec 027)
### 3. Testing
- [ ] Testes Vitest existentes dos dois painéis passam sem alteração
- [ ] E2E (Playwright MCP): com `mouse.down` num botão, a posição Y aumenta 3px; ao soltar, volta; botão desabilitado não se move

## Acceptance Criteria
- [ ] Todos os botões das duas modais e os botões flutuantes afundam ao clicar e voltam ao soltar
- [ ] Hover, foco por teclado e desabilitado são visíveis; a estrela da lista não tem o efeito
- [ ] Nenhum `data-testid` ou texto mudou

## Verification
`pnpm --filter @agents-office/web test`, typecheck, `pnpm biome check`, e2e acima.
