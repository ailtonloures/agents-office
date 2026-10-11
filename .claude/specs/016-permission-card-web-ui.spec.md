---
title: PermissionCard na web e integração com o HUD
number: 016
priority: high
tags: [feature, web, ui, interaction, testing]
dependencies: [014-permission-broker-and-protocol.spec.md, 011-player-avatar-dialog-hud.spec.md]
related_prd: ../prds/desktop-app-permissions.prd.md
status: pending
created: 2026-10-10
---

# 016 - PermissionCard na web e integração com o HUD

## Overview
Mostra os pedidos pendentes na web: balão `!` no personagem solicitante, cartão sobre o escritório com ferramenta/resumo/projeto e os botões Aprovar, Negar (motivo opcional) e Deixar para o terminal, fila de vários pedidos e contagem no HUD. O `OfficeClient` passa a se identificar como UI e a enviar `permission.decide`.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: User Stories 10-16, 20; Implementation Decisions → web (PermissionCard)

## Prerequisites
- [ ] Spec 014 concluído
- [ ] Spec 011 concluído

## Dependencies
- `014-permission-broker-and-protocol.spec.md`: protocolo e snapshot de pendências
- `011-player-avatar-dialog-hud.spec.md`: HUD e DialogBox

## Implementation Tasks
### 1. OfficeClient (`packages/web/src/net/officeClient.ts`)
- [ ] Conectar com papel de UI (`?role=ui` ou o handshake do spec 014)
- [ ] Manter a lista de pendências (snapshot + `permission.requested`/`resolved`); emitir evento tipado `permissions`
- [ ] `decide(id, decision)` envia `permission.decide`
### 2. Lógica pura (`src/ui/permissionLogic.ts`)
- [ ] Ordenação da fila (mais antigo primeiro), resumo curto do input por ferramenta (reutilizar `summarizeToolInput`), texto de rótulos em português
- [ ] Mapeamento pedido → personagem solicitante (Tech Lead ou subagente) para o balão
### 3. PermissionCard (`src/ui/permissionCard.ts`)
- [ ] Cartão estilo GBC sobre o escritório, não bloqueia o movimento do player; mostra pedido atual e "+N na fila"
- [ ] Botões Aprovar / Negar / Deixar para o terminal (spike 013: o prompt do terminal já está visível em paralelo; "Deixar para o terminal" apenas dispensa o cartão, e Aprovar/Negar fecham o prompt do terminal sozinhos). Mostrar a dica "o terminal também está perguntando"; atalhos de teclado (ex.: Y, N, T) e campo curto de motivo para Negar
- [ ] Se o pedido for respondido no terminal (`permission.resolved` com `by:'terminal'`), o cartão some sozinho e a fila avança sem erro
- [ ] Mouse e teclado; ao decidir, avança para o próximo pedido
- [ ] Balão `!` no personagem solicitante enquanto pendente
### 4. HUD e debug
- [ ] HUD: o contador `! n` inclui pedidos pendentes; piscar enquanto houver
- [ ] `window.__office.permissions` com a fila e `actions.decidePermission(id, decision)` para E2E
### 5. Testing
- [ ] `test/permissionLogic.test.ts` e `test/officeClient.test.ts` estendido (fila, resolução, decide)
- [ ] E2E (Playwright, estende o pacote `e2e`): POST /hook/permission → cartão e `! 1`; Aprovar/Negar/Deixar resolvem e removem o cartão; hook recebe a resposta correta

## Acceptance Criteria
### Must Have
- [ ] Cada decisão chega ao hook correto
- [ ] HUD bate com a fila
- [ ] Testes puros e E2E passam

### Should Have
- [ ] Notificação visual forte quando o painel de terminal estiver aberto

## Testing Requirements
```bash
pnpm --filter @agents-office/web test permission
pnpm --filter @agents-office/e2e exec playwright test
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `permissionCard.ts`, `permissionLogic.ts` e o tratamento no OfficeClient; a cena volta a só exibir o balão de waiting.
