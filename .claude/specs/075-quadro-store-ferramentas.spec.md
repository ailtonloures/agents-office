---
title: Store da cena do quadro e ferramentas board_*
number: 075
priority: high
tags: [feature, desktop, mcp, board, testing]
dependencies: [063-agent-bus-mcp-injecao.spec.md]
related_prd: ../prds/quadro-excalidraw.prd.md
status: pending
created: 2026-10-11
---

# 075 - Store da cena do quadro e ferramentas board_*

## Overview
Cena Excalidraw por workspace no processo principal e ferramentas `board_read`, `board_add_elements`, `board_add_mermaid`, `board_clear`.

## Related PRD
- **Source**: [Quadro branco interativo com Excalidraw](../prds/quadro-excalidraw.prd.md)

## Prerequisites
- [ ] `063-agent-bus-mcp-injecao.spec.md` concluída

## Dependencies
- [063-agent-bus-mcp-injecao.spec.md]

## Implementation Tasks
### 1. Store
- [ ] `src/main/boardStore.ts`: arquivo `.excalidraw` por projeto, escrita atômica, cópia da última versão válida, limites de elementos/bytes
### 2. Ferramentas
- [ ] Conversão skeleton → elementos; posicionamento em área livre; autoria como metadado
- [ ] `board_add_mermaid` via `@excalidraw/mermaid-to-excalidraw`
- [ ] `board_clear`: só o que o agente desenhou; tudo exige aprovação
- [ ] Conteúdo lido por agente rotulado como dado
### 3. Testes
- [ ] `boardStore.test.ts`, `boardTools.test.ts`

## Acceptance Criteria
- [ ] Cena corrompida recupera a última versão válida
- [ ] Limite de tamanho respeitado
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
