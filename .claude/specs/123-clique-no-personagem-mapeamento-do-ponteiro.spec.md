---
title: Clique no personagem - mapeamento do ponteiro após resize
number: 123
priority: high
tags: [bugfix, web, phaser, input, testing]
dependencies: [116-cenario-pipeline-de-resize-sem-esticar.spec.md]
related_prd: ../prds/clique-no-personagem-so-funciona-uma-vez.prd.md
status: done
created: 2026-10-18
---

# 123 - Clique no personagem - mapeamento do ponteiro após resize

## Overview
O clique em um personagem (Tech Lead abre/alterna o terminal; agente passivo abre a caixa de texto) só funciona uma vez. A hipótese é que o pipeline de resize escreve o estilo CSS do canvas depois de o Phaser medir `canvasBounds`/`displayScale`, deixando o mapeamento do ponteiro um passo atrás. Esta spec confirma a causa com um spike, escreve o teste que falha e corrige a ordem do pipeline.

## Related PRD
- **Source**: [Clique no personagem só funciona uma vez](../prds/clique-no-personagem-so-funciona-uma-vez.prd.md)
- **Section Reference**: User Stories 1 a 22; Implementation Decisions (hipótese, correção, módulo de ordem do resize); Testing Decisions

## Prerequisites
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes antes de começar (ou falhas existentes anotadas)
- [ ] App rodando para o spike (skill `run`) e Playwright MCP disponível

## Dependencies
- `116-cenario-pipeline-de-resize-sem-esticar.spec.md` - introduziu `applyCanvasStyle` e a atribuição direta de `scale.zoom` em `applyResize` (mudanças ainda não commitadas)

## Implementation Tasks
### 0. Spike de reprodução (antes de qualquer código)
- [ ] Reproduzir: clicar no Tech Lead (abre terminal), clicar de novo; clicar em agente passivo repetidamente, também em navegador comum sem desktop
- [ ] Após abrir o terminal, comparar `game.scale.canvasBounds`, `game.scale.displayScale` e `game.canvas.getBoundingClientRect()`; registrar se divergem
- [ ] Se o caso do agente passivo em navegador comum não envolver resize, investigar outra causa (estado do diálogo em `OfficeScene.onPointer`, `decideClick`) antes de seguir
- [ ] Registrar a causa confirmada em `.claude/learnings/canvas-resize-flash.md` (atualizar o existente, pt-BR)

### 1. Testes primeiro (Red)
- [ ] `packages/web/test/resizePipeline.test.ts` (novo): com dependências fake `{ setZoom, resize, applyStyle, refresh }` (nomes finais a definir), a ordem no ramo "viewport mudou" é zoom, tamanho, estilo, `refresh`
- [ ] Mesmo arquivo: no ramo "viewport igual", `refresh` roda depois de `applyStyle` e `resize` não é chamado
- [ ] Mesmo arquivo: `viewportChanged` falso nunca limpa o canvas (sem `resize`)
- [ ] Rodar `pnpm vitest run packages/web/test/resizePipeline.test.ts` e ver falhar pelo motivo certo
- [ ] E2E `e2e/tests/` (novo, seguir o estilo de `landing.spec.ts`/cenário): clicar no Tech Lead, abrir e fechar o terminal e clicar de novo (3 vezes); clicar no agente passivo 3 vezes; repetir após redimensionar a janela e trocar a doca. Ver falhar antes da correção

### 2. Módulo do pipeline (Green)
- [ ] Criar `packages/web/src/resizePipeline.ts` (puro, sem Phaser/DOM, sem relógio) com `applyResizePipeline(deps, applied, next)` devolvendo o novo `applied`
- [ ] Usar `viewportChanged` de `packages/web/src/scale.ts`
- [ ] Ordem: zoom, `resize`, `applyStyle`, `refresh`; ramo sem mudança: `refresh`, `applyStyle`, `refresh` só se necessário (garantir que `refresh` ocorra após o estilo)

### 3. Ligar em `main.ts`
- [ ] `packages/web/src/main.ts` `applyResize`: delegar ao módulo, injetando `game.scale.zoom =`, `game.scale.resize`, `applyCanvasStyle` e `game.scale.refresh`
- [ ] Manter `game.registry.set(REGISTRY_RENDER_SCALE, ...)`, `debug.resizes` e `game.step()` síncrono após o resize
- [ ] Manter a emissão única de `resize` para as cenas e o coalescimento por quadro (`resize()`)

### 4. Refactor
- [ ] Remover código morto, manter Biome limpo (`pnpm format`)
- [ ] Atualizar o learning `canvas-resize-flash.md`: o estilo do canvas deve ser escrito antes da remedição (`refresh`) para o ponteiro mapear certo

## Acceptance Criteria
### Must Have
- [ ] Clicar no Tech Lead alterna o terminal em todos os cliques, inclusive depois de abrir/fechar/recolher/mudar de doca
- [ ] Clicar em agente passivo abre a caixa de texto em todos os cliques, em navegador comum e no desktop
- [ ] O cenário continua sem esticar nem piscar (spec 116 preservada)
- [ ] Testes novos vistos falhando antes e passando depois; nenhum teste enfraquecido
- [ ] Causa confirmada registrada no learning
### Should Have
- [ ] Mesmo resultado em dpr 1, 1.5 e 2 e em 1280x720, 1920x1080 e 3440x1440
- [ ] Zoom manual (Ctrl+scroll e botões) mantém o clique correto

## Testing Requirements
```bash
pnpm vitest run packages/web/test/resizePipeline.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build   # e2e precisa de web e cli buildados
```
Verificação manual com Playwright MCP: clicar repetidamente em cada tipo de personagem após cada mudança de layout. A parte que depende do mapeamento real do ponteiro do Phaser é coberta só pelo e2e e pela verificação manual, não pelo unitário.

## Rollback Plan
Reverter o commit desta spec (`git revert`); `main.ts` volta à ordem anterior e `resizePipeline.ts` é removido. Se a causa confirmada for outra, descartar a spec e abrir uma nova a partir do learning.
