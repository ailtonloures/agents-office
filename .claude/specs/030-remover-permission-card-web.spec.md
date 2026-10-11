---
title: Remover o PermissionCard da web mantendo balão e contador
number: 030
priority: high
tags: [feature, web, ui, testing]
dependencies: [029-hook-nao-bloqueante-e-daemon-rastreador.spec.md]
related_prd: ../prds/permission-notify-only.prd.md
status: pending
created: 2026-10-11
---

# 030 - Remover o PermissionCard da web

## Overview
Elimina o cartão Aprovar/Negar/Terminal e seus atalhos. Mantém a fila de pendências, o balão `!` do personagem e a contagem no HUD.

## Related PRD
- **Source**: [Pedidos de permissão apenas notificam](../prds/permission-notify-only.prd.md)
- **Section Reference**: User Stories 4, 5, 11, 12, 13; Implementation Decisions → Web

## Prerequisites
- [ ] Spec 029 concluído (protocolo sem decisão)

## Dependencies
- `029-hook-nao-bloqueante-e-daemon-rastreador.spec.md`: tipos compartilhados sem decisão

## Implementation Tasks
### 1. Remoção do cartão
- [ ] Apagar `packages/web/src/ui/permissionCard.ts`
- [ ] `scenes/OfficeScene.ts`: remover import, campo, construção, teclas Y/N/T, ponteiro, `card.set/update`, esconder no overview e `decidePermission` de debug; manter `setAsking(pendingActorIds)` e contagem do HUD
- [ ] `net/officeClient.ts`: remover `decide()`
- [ ] `main.ts` da web: remover a checagem de clique no retângulo do cartão
- [ ] `debug/debugState.ts`: remover estado do cartão
- [ ] Remover Y/N/T de qualquer painel de ajuda
### 2. Lógica
- [ ] `ui/permissionLogic.ts`: manter `applySnapshot`, `applyRequested`, `applyResolved`, `queueView`, `pendingActorIds`; remover `cardContent`, `CardChoice`, `shortcutFor`, `decisionFor`, `editReason`
### 3. Testing
- [ ] Atualizar `permissionLogic.test.ts` e `officeClient.test.ts`
- [ ] Reescrever `e2e/tests/permissions.spec.ts` e `e2e/support/office.ts`: pedido mostra balão/contador, nenhum cartão; resolução remove o balão
- [ ] Typecheck e testes do pacote web verdes
