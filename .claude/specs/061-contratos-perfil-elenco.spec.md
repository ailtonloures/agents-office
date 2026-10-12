---
title: Contratos compartilhados de perfil, elenco e aparência
number: 061
priority: high
tags: [feature, shared, contracts, testing]
dependencies: []
related_prd: ../prds/perfis-sessoes-gerenciadas.prd.md
status: pending
created: 2026-10-11
---

# 061 - Contratos compartilhados de perfil, elenco e aparência

## Overview
Schemas zod e tipos do perfil de agente, aparência, elenco por projeto e notas, no pacote compartilhado, com constantes de limites.

## Related PRD
- **Source**: [Perfis de agente e sessões gerenciadas](../prds/perfis-sessoes-gerenciadas.prd.md)

## Prerequisites
- [ ] Nenhum

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Contratos
- [ ] `packages/shared/src/desktopProfiles.ts`: `AgentProfileSchema` (id, nome, descrição, aparência, instruções, modo de permissão, modelo opcional, papel `padrao|orquestrador`), `AppearanceSchema` (base visual, cabelo, cores)
- [ ] `ProjectRosterSchema`: entradas com `profileId` ou agente criado inline, `criadoPor`, conexões, notas, `autoReopen`
- [ ] Constantes: tamanho máximo de instruções e notas, nome único, perfil padrão `tech-lead` embutido
- [ ] Exportar em `index.ts`
### 2. Testes
- [ ] `packages/shared/test/desktopProfiles.test.ts`: válidos, inválidos, limites, defaults

## Acceptance Criteria
- [ ] Schemas rejeitam entradas fora dos limites
- [ ] Tech Lead padrão definido e imutável quanto a id/papel
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
