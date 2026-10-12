---
title: Mermaid e bibliotecas de formas (.excalidrawlib)
number: 079
priority: low
tags: [feature, desktop, web, excalidraw]
dependencies: [077-overlay-excalidraw-lazy.spec.md]
related_prd: ../prds/quadro-excalidraw.prd.md
status: pending
created: 2026-10-11
---

# 079 - Mermaid e bibliotecas de formas (.excalidrawlib)

## Overview
Carregar bibliotecas `.excalidrawlib` de uma pasta do app e disponibilizá-las ao overlay e aos agentes.

## Related PRD
- **Source**: [Quadro branco interativo com Excalidraw](../prds/quadro-excalidraw.prd.md)

## Prerequisites
- [ ] `077-overlay-excalidraw-lazy.spec.md` concluída

## Dependencies
- [077-overlay-excalidraw-lazy.spec.md]

## Implementation Tasks
### 1. Bibliotecas
- [ ] Pasta de bibliotecas no dado do app; listar/importar/remover
- [ ] Disponibilizar formas ao overlay e `board_list_library`/uso por nome nas ferramentas
### 2. Testes
- [ ] Importação válida/inválida de `.excalidrawlib`

## Acceptance Criteria
- [ ] Biblioteca inválida não derruba o quadro
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
