---
title: Seletor de elemento e injeção de contexto no agente
number: 084
priority: medium
tags: [feature, desktop, web, browser, context]
dependencies: [082-browser-snapshot-screenshot-console.spec.md]
related_prd: ../prds/navegador-embutido.prd.md
status: pending
created: 2026-10-11
---

# 084 - Seletor de elemento e injeção de contexto no agente

## Overview
Modo "Selecionar elemento" que coleta seletor, texto, HTML (truncado) e captura, com prévia editável, e injeta no terminal do agente escolhido.

## Related PRD
- **Source**: [Navegador embutido controlado por agentes](../prds/navegador-embutido.prd.md)

## Prerequisites
- [ ] `082-browser-snapshot-screenshot-console.spec.md` concluída

## Dependencies
- [082-browser-snapshot-screenshot-console.spec.md]

## Implementation Tasks
### 1. Captura
- [ ] Destacador injetado na página; coleta e truncamento
- [ ] Prévia editável e escolha do agente destino (somente conectados ao usuário/gerenciados)
- [ ] Escrita no PTY com formatação e rótulo padronizados
### 2. Testes
- [ ] Coleta/formatação do contexto; envio ao PTY falso

## Acceptance Criteria
- [ ] Usuário revisa antes do envio
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
