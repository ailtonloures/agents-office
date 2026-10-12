---
title: Animação: remetente visita a mesa do destinatário
number: 071
priority: high
tags: [feature, web, characters, animation, testing]
dependencies: [070-historico-eventos-comunicacao.spec.md]
related_prd: ../prds/comunicacao-entre-agentes.prd.md
status: pending
created: 2026-10-11
---

# 071 - Animação: remetente visita a mesa do destinatário

## Overview
Estado de visita na máquina de personagens: andar até o ponto de conversa do destino, balões e voltar à mesa quando a resposta chega (timeout de segurança 60 s).

## Related PRD
- **Source**: [Comunicação entre agentes e reuniões no escritório](../prds/comunicacao-entre-agentes.prd.md)

## Prerequisites
- [ ] `070-historico-eventos-comunicacao.spec.md` concluída

## Dependencies
- [070-historico-eventos-comunicacao.spec.md]

## Implementation Tasks
### 1. Cena
- [ ] `characterMachine.ts`: estado `visiting` (ir, conversar, voltar)
- [ ] Pontos de conversa por mesa + fila de espera em pé (`deskAssignment.ts`/`pathfinding.ts`)
- [ ] Balões curtos com resumo da mensagem (`balloons.ts`)
- [ ] Volta ao responder ou em 60 s; broadcast visita um por vez; vale para todos os perfis
### 2. Testes
- [ ] Testes da máquina e dos pontos de conversa; E2E com feeder de eventos

## Acceptance Criteria
- [ ] Remetente só volta com a resposta ou timeout
- [ ] Sem sobreposição de avatares na mesma mesa
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
