---
title: Disjuntor de saltos, limite de taxa e silenciar agente
number: 069
priority: high
tags: [feature, desktop, safety, testing]
dependencies: [068-mensagens-fila-entrega.spec.md]
related_prd: ../prds/comunicacao-entre-agentes.prd.md
status: pending
created: 2026-10-11
---

# 069 - Disjuntor de saltos, limite de taxa e silenciar agente

## Overview
Proteção contra conversas infinitas: contador de saltos, pausa com notificação, limite de taxa e silenciar.

## Related PRD
- **Source**: [Comunicação entre agentes e reuniões no escritório](../prds/comunicacao-entre-agentes.prd.md)

## Prerequisites
- [ ] `068-mensagens-fila-entrega.spec.md` concluída

## Dependencies
- [068-mensagens-fila-entrega.spec.md]

## Implementation Tasks
### 1. Proteções
- [ ] `hops` por mensagem encadeada; pausa a 8 sem intervenção; zera ao usuário digitar em qualquer terminal do projeto
- [ ] Notificação "continuar / encerrar" com o padrão de `notificationCenter`
- [ ] Limite de taxa por remetente; silenciar bloqueia envio e recebimento
- [ ] UI: botão silenciar no painel Elenco
### 2. Testes
- [ ] `circuitBreaker.test.ts`: contagem, reset por digitação, pausa, retomada

## Acceptance Criteria
- [ ] Entregas pausadas ao atingir o limite
- [ ] Silenciado não envia nem recebe
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
