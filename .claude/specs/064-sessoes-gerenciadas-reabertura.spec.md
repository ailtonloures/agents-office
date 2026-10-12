---
title: Sessões gerenciadas: iniciar perfil, vínculo ao avatar e reabertura automática
number: 064
priority: high
tags: [feature, desktop, web, session, characters]
dependencies: [063-agent-bus-mcp-injecao.spec.md]
related_prd: ../prds/perfis-sessoes-gerenciadas.prd.md
status: pending
created: 2026-10-11
---

# 064 - Sessões gerenciadas: iniciar perfil, vínculo ao avatar e reabertura automática

## Overview
Iniciar/encerrar a sessão de cada perfil do elenco, vincular a sessão ao avatar (nome e aparência do perfil) e reabrir o elenco do zero ao iniciar o app.

## Related PRD
- **Source**: [Perfis de agente e sessões gerenciadas](../prds/perfis-sessoes-gerenciadas.prd.md)

## Prerequisites
- [ ] `063-agent-bus-mcp-injecao.spec.md` concluída

## Dependencies
- [063-agent-bus-mcp-injecao.spec.md]

## Implementation Tasks
### 1. Desktop
- [ ] `src/main/managedSessions.ts`: iniciar/encerrar por perfil, mapa terminal↔perfil, erros por sessão
- [ ] Reabertura automática na inicialização respeitando `maxSessions`; relatório das que falharam; opção `autoReopen` por projeto
- [ ] Sessões externas continuam fora deste serviço (somente leitura)
### 2. Web / modelo
- [ ] `appearance.ts`/`characterFactory.ts`: aceitar aparência explícita (base, cabelo, paleta) mantendo o hash como padrão
- [ ] Vincular sessão↔perfil via id de terminal já existente; avatar usa nome/aparência do perfil; distinção visual gerenciado × externo
- [ ] Perfil sem sessão ativa não aparece como trabalhando
### 3. Testes
- [ ] `managedSessions.test.ts` (ordem, limite, falhas), testes de aparência explícita e vínculo

## Acceptance Criteria
- [ ] Reabertura sempre sem `--resume`
- [ ] Avatar reflete nome e aparência do perfil
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
