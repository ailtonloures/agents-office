---
title: Overlay Excalidraw em tela cheia (carregamento sob demanda)
number: 077
priority: high
tags: [feature, web, excalidraw, ui]
dependencies: [075-quadro-store-ferramentas.spec.md, 076-prop-quadro-interativo.spec.md]
related_prd: ../prds/quadro-excalidraw.prd.md
status: pending
created: 2026-10-11
---

# 077 - Overlay Excalidraw em tela cheia (carregamento sob demanda)

## Overview
Ilha React com `@excalidraw/excalidraw` montada sob demanda em overlay tela cheia, funcionando offline, abrir/fechar (botão e Esc).

## Related PRD
- **Source**: [Quadro branco interativo com Excalidraw](../prds/quadro-excalidraw.prd.md)

## Prerequisites
- [ ] `075-quadro-store-ferramentas.spec.md` concluída
- [ ] `076-prop-quadro-interativo.spec.md` concluída

## Dependencies
- [075-quadro-store-ferramentas.spec.md]
- [076-prop-quadro-interativo.spec.md]

## Implementation Tasks
### 1. Overlay
- [ ] Dependências React/Excalidraw com versões fixas, importação dinâmica (fora do bundle principal/splash)
- [ ] `ui/boardOverlay.ts`: monta/desmonta a ilha, Esc e botão fechar
- [ ] Fontes e assets empacotados (offline)
- [ ] Carregar/salvar cena via ponte do preload com debounce; exportar/importar `.excalidraw`
### 2. Testes
- [ ] Teste do bundle (Excalidraw fora do chunk principal); E2E abrir/desenhar/fechar/reabrir

## Acceptance Criteria
- [ ] Splash não regride
- [ ] Desenho persiste entre aberturas
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
