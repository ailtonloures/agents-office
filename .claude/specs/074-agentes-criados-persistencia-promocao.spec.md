---
title: Persistência dos agentes criados, auditoria e "Salvar como perfil"
number: 074
priority: medium
tags: [feature, desktop, web, persistence]
dependencies: [073-cartao-aprovacao-spawn.spec.md, 064-sessoes-gerenciadas-reabertura.spec.md]
related_prd: ../prds/orquestrador-de-agentes.prd.md
status: pending
created: 2026-10-11
---

# 074 - Persistência dos agentes criados, auditoria e "Salvar como perfil"

## Overview
Agentes criados reabrem com o projeto (instruções originais + notas, sem reenviar tarefa), com auditoria e promoção à biblioteca global.

## Related PRD
- **Source**: [Orquestrador que cria agentes na hora](../prds/orquestrador-de-agentes.prd.md)

## Prerequisites
- [ ] `073-cartao-aprovacao-spawn.spec.md` concluída
- [ ] `064-sessoes-gerenciadas-reabertura.spec.md` concluída

## Dependencies
- [073-cartao-aprovacao-spawn.spec.md]
- [064-sessoes-gerenciadas-reabertura.spec.md]

## Implementation Tasks
### 1. Persistência
- [ ] Reabertura dos agentes criados junto com o elenco; tarefa original só no cabeçalho da aba
- [ ] Botão "Salvar como perfil" (copia para a biblioteca global como papel padrão); remoção manual
- [ ] Painel Elenco mostra quem criou cada agente e o registro de criações/encerramentos
### 2. Testes
- [ ] Reabertura, promoção, auditoria

## Acceptance Criteria
- [ ] Tarefa original nunca é reenviada
- [ ] Perfil promovido aparece na biblioteca
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
