---
title: Agent Bus (servidor MCP local) e injeção de instruções nas sessões
number: 063
priority: high
tags: [feature, desktop, mcp, session, testing]
dependencies: [062-biblioteca-perfis-elenco-stores.spec.md]
related_prd: ../prds/perfis-sessoes-gerenciadas.prd.md
status: pending
created: 2026-10-11
---

# 063 - Agent Bus (servidor MCP local) e injeção de instruções nas sessões

## Overview
Servidor MCP em loopback no processo principal, autenticado por token de sessão, e extensão do SessionManager para injetar instruções, MCP e modelo ao lançar o claude.

## Related PRD
- **Source**: [Perfis de agente e sessões gerenciadas](../prds/perfis-sessoes-gerenciadas.prd.md)

## Prerequisites
- [ ] `062-biblioteca-perfis-elenco-stores.spec.md` concluída

## Dependencies
- [062-biblioteca-perfis-elenco-stores.spec.md]

## Implementation Tasks
### 1. Agent Bus
- [ ] `src/main/agentBus/server.ts`: HTTP MCP em 127.0.0.1, porta efêmera, token por sessão, rejeita sem token
- [ ] Registro de ferramentas por papel/sessão (base para PRDs seguintes)
- [ ] Ferramenta `save_notes` gravando no elenco do projeto (limite de tamanho)
### 2. SessionManager
- [ ] Novos parâmetros de start: instruções (`--append-system-prompt`), `--mcp-config` com URL+token, `--model`
- [ ] Env da sessão com id do perfil e do projeto; instruções somadas ao CLAUDE.md, nunca substituindo
- [ ] Montagem do prompt injetado (identidade, instruções, notas anteriores) em módulo puro
### 3. Testes
- [ ] `agentBus.test.ts` (token, save_notes), `sessionManager.test.ts` (argumentos/env) com spawn falso

## Acceptance Criteria
- [ ] Sessão sem token válido não chama ferramentas
- [ ] Argumentos do claude contêm instruções, MCP e modelo quando informados
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
