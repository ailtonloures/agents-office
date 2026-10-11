---
title: Fechar a notificação do sistema quando o pedido é resolvido no terminal
number: 031
priority: high
tags: [feature, desktop, notifications, docs, testing]
dependencies: [029-hook-nao-bloqueante-e-daemon-rastreador.spec.md]
related_prd: ../prds/permission-notify-only.prd.md
status: pending
created: 2026-10-11
---

# 031 - Fechar a notificação ao resolver no terminal

## Overview
O desktop passa a saber quais pedidos foram resolvidos e fecha a notificação correspondente. Se o sistema não permitir fechar programaticamente, a notificação ganha botão nativo "Fechar". Também atualiza textos e documentação.

## Related PRD
- **Source**: [Pedidos de permissão apenas notificam](../prds/permission-notify-only.prd.md)
- **Section Reference**: User Stories 3, 8–10, 14–16, 19–21, 23; Implementation Decisions → Desktop, Texto

## Prerequisites
- [ ] Spec 029 concluído (`permission.resolved` emitido pelo daemon)

## Dependencies
- `029-hook-nao-bloqueante-e-daemon-rastreador.spec.md`: eventos de resolução

## Implementation Tasks
### 1. Rastreador (`packages/desktop/src/main/permissionWatcher.ts`)
- [ ] `PermissionUpdate` ganha `resolvedIds`: preenchido em `permission.resolved`, em snapshot que omite ids antes pendentes e na queda de conexão
### 2. Notificações (`main.ts`, `shell.ts`)
- [ ] `notify` devolve o handle; manter mapa id → notificação; `dismiss(id)` chama `close()` e remove
- [ ] `shell.ts`: `onPermissionNotice` repassa o `id`; novo `onPermissionResolved(ids)` chama `dismiss`; manter regra de não notificar com janela visível e focada e o clique que mostra a janela
- [ ] Fallback: se `close()` não for suportado, usar botão nativo de fechar e timeout padrão
- [ ] Corpo da notificação indica resposta no terminal; reescrever o aviso de daemon externo (sem "aprovação pela interface")
### 3. Testing
- [ ] `lifecycle.test.ts` com Notification falsa: pedido cria; resolução fecha; dois pedidos independentes; reconexão não deixa órfãs; fallback
- [ ] Atualizar `e2e/desktop/desktop.spec.ts` e `packages/desktop/e2e/app.e2e.ts`
### 4. Documentação
- [ ] README (seção "Approving permissions" e menções), `desktop-app-permissions.prd.md` (nota de substituição), specs 014–016 (nota), `INDEX.md` (029–031)
- [ ] Learning `.claude/learnings/permission-notify-only.md` sobre fechamento reativo e limites do `close()` no Linux
