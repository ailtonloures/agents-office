---
title: Sincronização em tempo real agentes↔overlay e merge por versão
number: 078
priority: medium
tags: [feature, desktop, web, sync, testing]
dependencies: [077-overlay-excalidraw-lazy.spec.md]
related_prd: ../prds/quadro-excalidraw.prd.md
status: pending
created: 2026-10-11
---

# 078 - Sincronização em tempo real agentes↔overlay e merge por versão

## Overview
Mudanças de agentes aparecem no overlay aberto e edições do usuário convivem com elas via merge por id e `version`/`versionNonce`.

## Related PRD
- **Source**: [Quadro branco interativo com Excalidraw](../prds/quadro-excalidraw.prd.md)

## Prerequisites
- [ ] `077-overlay-excalidraw-lazy.spec.md` concluída

## Dependencies
- [077-overlay-excalidraw-lazy.spec.md]

## Implementation Tasks
### 1. Sync
- [ ] Evento de cena atualizada do processo principal para o overlay
- [ ] Merge por elemento no processo principal; autoria visível
- [ ] Avatar do agente que desenha vai até o quadro (ponto de interesse)
### 2. Testes
- [ ] `boardMerge.test.ts`: concorrência usuário × agente

## Acceptance Criteria
- [ ] Nenhum desenho é perdido em edição concorrente
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
