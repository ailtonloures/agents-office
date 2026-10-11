---
title: PermissionBroker, rota /hook/permission e protocolo
number: 014
priority: high
tags: [feature, daemon, api, websocket, testing]
dependencies: [013-validation-spike-permission-hook-pty.spec.md, 005-daemon-server-stream-and-hook-receiver.spec.md]
related_prd: ../prds/desktop-app-permissions.prd.md
status: pending
created: 2026-10-10
---

# 014 - PermissionBroker, rota /hook/permission e protocolo

## Overview
Adiciona ao daemon o mecanismo de pedidos de permissão: tipos e mensagens de protocolo no `shared`, o `PermissionBroker` (fila de pendências com conexões HTTP de hook seguradas) e a rota long-poll `POST /hook/permission`. A decisão só é aceita vinda de clientes de UI pelo WebSocket. Implementa a **Seam 1** para permissões.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: User Stories 10-15, 17-21, 23; Implementation Decisions → PermissionBroker, HookReceiver, StreamServer, shared

## Prerequisites
- [ ] Spec 013 concluído (formato do payload e da resposta conhecido; ver `.claude/learnings/permission-hook-and-pty.md`)
- [ ] Premissa corrigida pelo spike: o prompt do terminal **aparece em paralelo** ao hook (não fica suprimido); o broker precisa detectar pedidos respondidos no terminal
- [ ] Spec 005 concluído

## Dependencies
- `013-validation-spike-permission-hook-pty.spec.md`: premissas validadas
- `005-daemon-server-stream-and-hook-receiver.spec.md`: servidor e StreamServer

## Implementation Tasks
### 1. Contratos (`packages/shared/src/permissions.ts`)
- [ ] `PermissionRequest` {id, sessionId, actorId, tool, inputSummary, projectId?, ts} e `PermissionDecision` = `allow` | `deny{message?}` | `defer`; `actorId = agent_id ?? session_id` (o payload real traz `agent_id` e `agent_type` só quando um subagente pede; sem `tool_use_id`). Guardar também `agentType?`, `toolName` e o `tool_input` bruto só em memória (para correlação, nunca em log)
- [ ] `permission.resolved` carrega `by`: `'ui' | 'released' | 'terminal' | 'hook-gone'` (a UI usa `terminal` para fechar o cartão sem mensagem de erro). Fixtures reais: `.claude/learnings/spike-scripts/fixtures/permission-request.*.json`
- [ ] Mensagens WS: `permission.requested`, `permission.resolved` (servidor → UI) e `permission.decide` (UI → servidor); incluir o snapshot dos pendentes na mensagem `snapshot` ou em `permission.snapshot`
- [ ] Schemas zod tolerantes (looseObject) e exportação no index; atualizar testes do shared
### 2. PermissionBroker (`packages/daemon/src/server/permissionBroker.ts`)
- [ ] `request(payload): Promise<PermissionDecision | 'release'>` guarda a pendência e emite `permission.requested`
- [ ] `decide(id, decision)` resolve a pendência e emite `permission.resolved`
- [ ] `releaseAll()` e liberação individual quando a conexão do hook cai (`close` da request)
- [ ] Se não há UI conectada, `request` libera na hora (`release`); se a última UI desconecta com pendências, libera todas
- [ ] `resolveExternally(match)`: resolve pendências respondidas **no terminal** (spike 013: o hook continua vivo depois disso). O daemon chama a partir do `/hook` comum: `PostToolUse`/`PostToolUseFailure`/`PermissionDenied` da mesma sessão+ator com mesmo `tool_name` e `tool_input` do pedido, e, como fallback, `Stop`/`UserPromptSubmit`/`SessionEnd` da sessão (e `SubagentStop` do ator). Emite `permission.resolved{by:'terminal'}` e responde 204 ao long-poll para o processo `hook` terminar
- [ ] Relógio e geração de ids injetáveis; sem `Date.now()` interno
### 3. Rota e StreamServer (`daemon.ts`)
- [ ] `POST /hook/permission`: valida o payload (tolerante), pede ao broker, responde o JSON `hookSpecificOutput` conforme a decisão (allow/deny+message) ou 204 vazio para `release`/`defer`
- [ ] Sem timeout de servidor curto para essa rota (desligar `requestTimeout`/`connectionTimeout` só nela)
- [ ] `/stream`: distinguir clientes de UI (handshake ou query `?role=ui`) e aceitar `permission.decide` somente deles; ignorar de outros
- [ ] `POST /hook` comum nunca resolve pedido (teste explícito)
- [ ] `/health` inclui `pendingPermissions`
### 4. Testing (Seam 1)
- [ ] `test/permission.e2e.test.ts`: UI conectada → POST /hook/permission → `permission.requested` recebido → `permission.decide allow` → resposta HTTP correta; idem deny com mensagem
- [ ] Pedido respondido no terminal (PostToolUse correlacionado, sem tool_use_id no pedido) → cartão removido e HTTP 204; subagente identificado por `agent_id`
- [ ] Dois pedidos simultâneos resolvidos fora de ordem; UI desconecta com pendência → hook recebe 204; nenhuma UI → 204 imediato; hook aborta → pendência removida; decisão enviada por cliente sem papel de UI é ignorada

## Acceptance Criteria
### Must Have
- [ ] Testes da Seam 1 de permissões passam
- [ ] Nenhuma pendência fica presa em nenhum cenário de desconexão
- [ ] Decisões só vindas de cliente de UI

### Should Have
- [ ] `/health` mostra `pendingPermissions`
- [ ] Logs concisos de pedido/decisão (sem conteúdo completo de input)

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test permission
pnpm --filter @agents-office/shared test
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `permissionBroker.ts`, `shared/src/permissions.ts` e a rota; reverter o campo em `/health`.
