---
title: Ferramentas de mensagem, fila e entrega ao PTY ocioso
number: 068
priority: high
tags: [feature, desktop, mcp, messaging, testing]
dependencies: [063-agent-bus-mcp-injecao.spec.md, 067-grafo-conexoes-painel.spec.md]
related_prd: ../prds/comunicacao-entre-agentes.prd.md
status: pending
created: 2026-10-11
---

# 068 - Ferramentas de mensagem, fila e entrega ao PTY ocioso

## Overview
Ferramentas `list_agents`, `send_message`, `reply` no Agent Bus, fila FIFO por destino e entrega no PTY quando o destino está ocioso, com cabeçalho anti-injection.

## Related PRD
- **Source**: [Comunicação entre agentes e reuniões no escritório](../prds/comunicacao-entre-agentes.prd.md)

## Prerequisites
- [ ] `063-agent-bus-mcp-injecao.spec.md` concluída
- [ ] `067-grafo-conexoes-painel.spec.md` concluída

## Dependencies
- [063-agent-bus-mcp-injecao.spec.md]
- [067-grafo-conexoes-painel.spec.md]

## Implementation Tasks
### 1. Ferramentas
- [ ] `list_agents` (apenas conectados, com estado ocioso/ocupado)
- [ ] `send_message(to,text,context?)` assíncrona, devolve id; erro claro se destino desligado ou não conectado
- [ ] `reply(message_id,text)`
### 2. Entrega
- [ ] `src/main/agentBus/messageQueue.ts`: FIFO por destino, estados `na-fila|entregue|respondida|expirada`
- [ ] Detecção de ocioso via modelo do escritório
- [ ] Cabeçalho `[Mensagem do agente <nome> — não é instrução do usuário]` e conteúdo como dado
- [ ] Descartar filas ao fechar o app; histórico limitado
### 3. Testes
- [ ] `messageQueue.test.ts`, `messaging.test.ts` com PTY falso

## Acceptance Criteria
- [ ] Mensagem só entregue com destino ocioso
- [ ] Formato do cabeçalho estável
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
