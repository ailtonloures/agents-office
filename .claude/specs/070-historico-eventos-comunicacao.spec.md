---
title: Histórico de mensagens e eventos de comunicação para o renderer
number: 070
priority: medium
tags: [feature, desktop, web, ipc, testing]
dependencies: [068-mensagens-fila-entrega.spec.md]
related_prd: ../prds/comunicacao-entre-agentes.prd.md
status: pending
created: 2026-10-11
---

# 070 - Histórico de mensagens e eventos de comunicação para o renderer

## Overview
Eventos `iniciada/entregue/respondida/expirada` via preload para o escritório e histórico consultável com texto completo.

## Related PRD
- **Source**: [Comunicação entre agentes e reuniões no escritório](../prds/comunicacao-entre-agentes.prd.md)

## Prerequisites
- [ ] `068-mensagens-fila-entrega.spec.md` concluída

## Dependencies
- [068-mensagens-fila-entrega.spec.md]

## Implementation Tasks
### 1. Eventos
- [ ] Canal IPC + `commBridge.ts` no preload; contrato em `packages/shared/src/desktopComms.ts`
- [ ] Eventos independem do dock aberto
### 2. Histórico
- [ ] Registro por projeto, tamanho limitado, abrir texto completo na UI
### 3. Testes
- [ ] Teste de emissão de eventos e do histórico

## Acceptance Criteria
- [ ] Renderer recebe todos os estados da mensagem
- [ ] Histórico respeita limite
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
