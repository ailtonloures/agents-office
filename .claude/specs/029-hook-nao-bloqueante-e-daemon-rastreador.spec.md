---
title: Hook PermissionRequest não bloqueante e daemon como rastreador de pendências
number: 029
priority: high
tags: [feature, daemon, shared, hooks, testing]
dependencies: [014-permission-broker-and-protocol.spec.md, 015-hook-permission-request-and-settings-merger.spec.md]
related_prd: ../prds/permission-notify-only.prd.md
status: pending
created: 2026-10-11
---

# 029 - Hook PermissionRequest não bloqueante e daemon como rastreador

## Overview
O hook `PermissionRequest` deixa de esperar decisão: envia o evento e sai sem saída, e o prompt aparece no terminal na hora. O daemon passa a apenas registrar o pedido, emitir `permission.requested` e `permission.resolved` (resolução externa pelo terminal). Remove todo o caminho de decisão.

## Related PRD
- **Source**: [Pedidos de permissão apenas notificam](../prds/permission-notify-only.prd.md)
- **Section Reference**: User Stories 6, 7, 10, 17, 18, 22; Implementation Decisions → Hook CLI, Registro, Daemon, Protocolo

## Prerequisites
- [ ] Specs 014 e 015 concluídos (estado atual do broker e do hook)

## Dependencies
- `014-permission-broker-and-protocol.spec.md`: broker e protocolo atuais
- `015-hook-permission-request-and-settings-merger.spec.md`: hook e merger atuais

## Implementation Tasks
### 1. Hook CLI (`packages/daemon/src/cli/hook.ts`)
- [ ] Remover o ramo de permissão (long-poll, aborter, tratamento de sinais, stdout); `PermissionRequest` usa o envio rápido (~300 ms) sem saída
- [ ] Garantir que o hook nunca bloqueia nem falha quando o daemon está fora
### 2. Settings merger (`packages/daemon/src/cli/settings-merger.ts`)
- [ ] Remover o timeout especial de 86400 s; manter `PermissionRequest` em eventos e matchers
- [ ] Migração: entradas antigas com `timeout: 86400` são reescritas sem timeout ao instalar; idempotência preservada
### 3. Daemon (`packages/daemon/src/server/daemon.ts`, `permissionBroker.ts`)
- [ ] Remover a rota `/hook/permission` bloqueante (hooks antigos não podem travar: responder 204 imediato ou rota inexistente tratada sem travar)
- [ ] No `/hook`, ao receber `PermissionRequest`, registrar pendência e emitir `permission.requested` aos clientes `role=ui`
- [ ] Broker vira rastreador: manter snapshot e resolução externa (PostToolUse, PostToolUseFailure, PermissionDenied, Stop, UserPromptSubmit, SessionEnd, SubagentStop); remover decisão, liberação em massa e dependência de UI conectada
- [ ] Stream `role=ui`: enviar snapshot ao conectar; ignorar mensagens de decisão
### 4. Protocolo compartilhado (`packages/shared/src/permissions.ts`, `protocol.ts`, `index.ts`)
- [ ] Remover schemas/tipos de decisão, mensagem de decisão do cliente, parser de mensagens do cliente e saída do hook
- [ ] Manter pedido, snapshot e resolvido; ajustar `HOOK_EVENT_NAMES`/`parseHookPayload` se necessário
### 5. Testing
- [ ] Reescrever `permission.e2e.test.ts` (requested, resolved por evento do terminal, snapshot, resposta rápida, decisão ignorada)
- [ ] Atualizar `hooks-cli.test.ts` (sem timeout, migração, hook não bloqueia) e `shared/test/permissions.test.ts`
- [ ] `pnpm` typecheck e testes dos pacotes daemon e shared verdes
