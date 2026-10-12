---
title: Snapshot de acessibilidade, screenshot e console
number: 082
priority: high
tags: [feature, desktop, mcp, browser]
dependencies: [081-browser-ferramentas-cdp-fila.spec.md]
related_prd: ../prds/navegador-embutido.prd.md
status: pending
created: 2026-10-11
---

# 082 - Snapshot de acessibilidade, screenshot e console

## Overview
Leitura da página: árvore de acessibilidade com referências, captura de tela e console.

## Related PRD
- **Source**: [Navegador embutido controlado por agentes](../prds/navegador-embutido.prd.md)

## Prerequisites
- [ ] `081-browser-ferramentas-cdp-fila.spec.md` concluída

## Dependencies
- [081-browser-ferramentas-cdp-fila.spec.md]

## Implementation Tasks
### 1. Leitura
- [ ] `browser_snapshot` com refs estáveis dentro do snapshot
- [ ] `browser_screenshot` e `browser_console`
- [ ] Texto da página rotulado como dado não confiável
### 2. Testes
- [ ] Montagem do snapshot a partir de árvore falsa

## Acceptance Criteria
- [ ] Refs do snapshot resolvem para o elemento certo no click/type
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
