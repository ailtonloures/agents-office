---
title: Nome do perfil do elenco no balão de diálogo
number: 098
priority: medium
tags: [bugfix, web, ui, dialog, cast, testing]
dependencies: []
related_prd: ../prds/balao-dialogo-nome-do-elenco.prd.md
status: done
created: 2026-10-12
---

# 098 - Nome do perfil do elenco no balão de diálogo

## Overview
O cabeçalho do diálogo de uma sessão é sempre "Tech Lead - <profissão>", mesmo para personagens do elenco. O diálogo é montado só a partir do `OfficeModel`; o nome do perfil vive na `ManagedLook`, que a etiqueta do avatar já usa.

## Related PRD
- **Source**: [Nome do perfil do elenco no balão de diálogo](../prds/balao-dialogo-nome-do-elenco.prd.md)
- **Section Reference**: User Stories 1-9

## Prerequisites
- [ ] Ler `packages/web/src/ui/dialogContent.ts` (`DialogContext`, `sessionPages`, `pagesFor`)
- [ ] Ler `OfficeScene.openDialog` e `managedLooksFor`, e `ManagedLook` em `ui/managedBinding.ts`

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. Lógica do diálogo (`dialogContent.ts`)
- [ ] Adicionar `managedName?: string` e `managedProfession?: Profession` a `DialogContext`
- [ ] Em `sessionPages`, cabeçalho = `` `${context.managedName ?? 'Tech Lead'} - ${PROFESSION_LABEL[context.managedProfession ?? session.profession]}` `` mantendo o `truncate(..., DIALOG_COLS)`
- [ ] `sessionActions` não muda
### 2. Cena (`OfficeScene.ts`)
- [ ] Em `openDialog`, obter `this.managedLooksFor(model).get(id)` e montar o contexto com `desktop`, `managedName: look?.name` e `managedProfession: look?.profession`; reaproveitar o mesmo contexto em `pagesFor` e `sessionActions`
- [ ] `dialogBox.ts` não muda
### 3. Testes (`packages/web/test/dialogContent.test.ts`)
- [ ] Manter a asserção "Tech Lead" para sessão sem perfil
- [ ] Caso com `managedName: 'Designer'`: cabeçalho começa com "Designer" e não contém "Tech Lead"
- [ ] Caso com nome longo: linha truncada a `DIALOG_COLS`
- [ ] Demais páginas inalteradas
### 4. Docs
- [ ] Atualizar o learning existente sobre perfis/elenco com a causa (diálogo não recebia a `ManagedLook`)

## Acceptance Criteria
### Must Have
- [ ] Avatar do perfil "Designer" abre balão com cabeçalho "Designer - <profissão>"
- [ ] Sessão não gerenciada continua "Tech Lead - <profissão>"
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` sem falhas
### Should Have
- [ ] Verificação manual no app desktop: criar perfil, iniciar sessão, clicar no avatar
