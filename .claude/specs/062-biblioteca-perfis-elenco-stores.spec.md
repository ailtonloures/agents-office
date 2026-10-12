---
title: Biblioteca global de perfis e elenco por projeto (stores)
number: 062
priority: high
tags: [feature, desktop, persistence, testing]
dependencies: [061-contratos-perfil-elenco.spec.md]
related_prd: ../prds/perfis-sessoes-gerenciadas.prd.md
status: pending
created: 2026-10-11
---

# 062 - Biblioteca global de perfis e elenco por projeto (stores)

## Overview
Stores no processo principal: biblioteca global (um JSON por perfil) e elenco por projeto na config do app, com escrita atômica e recuperação de arquivos corrompidos.

## Related PRD
- **Source**: [Perfis de agente e sessões gerenciadas](../prds/perfis-sessoes-gerenciadas.prd.md)

## Prerequisites
- [ ] `061-contratos-perfil-elenco.spec.md` concluída

## Dependencies
- [061-contratos-perfil-elenco.spec.md]

## Implementation Tasks
### 1. Stores
- [ ] `src/main/profileLibrary.ts`: CRUD, duplicar, apagar (retorna projetos que usam), Tech Lead padrão não apagável
- [ ] `src/main/rosterStore.ts`: elenco por caminho de projeto, adicionar/remover, notas, `autoReopen`
- [ ] Escrita atômica (tmp + rename), como `AppConfigStore`; arquivo corrompido vira backup e recomeça vazio
### 2. IPC
- [ ] Canais e handlers com `trusted()` + zod (`profilesChannels.ts`, `profilesIpc.ts`) e ponte de preload (`profilesBridge.ts`)
### 3. Testes
- [ ] `packages/desktop/test/profileLibrary.test.ts` e `rosterStore.test.ts` com diretório temporário

## Acceptance Criteria
- [ ] Editar um perfil reflete em todos os elencos que o referenciam
- [ ] Apagar perfil em uso avisa os projetos afetados
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
