---
title: Zoom do escritório — botões + / − e E2E
number: 034
priority: medium
tags: [feature, web, ui, testing]
dependencies: [033]
related_prd: ../prds/zoom-escritorio.prd.md
status: done
created: 2026-10-11
---

# 034 - Zoom do escritório: botões + / − e E2E

## Overview
Adiciona os botões DOM "+" e "−" no canto inferior direito, ligados ao evento de zoom da cena (spec 033), e cobre o fluxo com E2E.

## Related PRD
- **Source**: [Zoom do escritório](../prds/zoom-escritorio.prd.md)
- **Section Reference**: User Stories 3–5, 8, 9, 14, 17, 20–22, 26; Testing Decisions

## Prerequisites
- [ ] Spec 033 concluído

## Dependencies
- 033

## Implementation Tasks
### 1. Botões (`packages/web/src/ui/zoomControls.ts`)
- [ ] Dois `<button>` com `data-testid="zoom-in"` e `"zoom-out"`, textos "+" e "−", `aria-label` em português, posicionados `absolute` no canto inferior direito de `#game`
- [ ] Adicionar `.ao-zoom-btn` à lista `BUTTONS` em `ui/buttonStyles.ts` (estilo compartilhado)
- [ ] Clique emite o evento `zoom-step` do jogo; `pointerdown`/`mousedown` com `stopPropagation` para não alcançar o canvas
- [ ] Desabilitar "+" em `ZOOM_MAX` e "−" em `ZOOM_MIN` (reagir ao nível atual); ocultar/inativar na visão geral
### 2. Montagem (`packages/web/src/main.ts`)
- [ ] Montar os controles junto dos demais painéis; reposicionamento automático ao redimensionar (CSS ancorado)
### 3. E2E (`e2e/tests/office.spec.ts`)
- [ ] Clicar `zoom-in`/`zoom-out` e conferir `window.__office.zoom`; limites desabilitam os botões
- [ ] Ctrl + roda no canvas (`keyboard.down('Control')` + `mouse.wheel`) altera o zoom; roda sem Ctrl não
- [ ] Zoom persiste após `page.reload()`; `M` entra/sai da visão geral e restaura o nível
- [ ] Clique nos botões não move o avatar

## Acceptance Criteria
- [ ] Botões visíveis, consistentes com os demais e acessíveis por `data-testid`
- [ ] Mesmo comportamento no navegador e no app desktop
- [ ] E2E e testes unitários passando; lint e typecheck limpos

## Verification
`pnpm build && pnpm --filter @agents-office/e2e test`, `pnpm -r test`, `pnpm biome check`. Manual no Electron: Ctrl + roda não dá zoom nativo; botões respondem.
