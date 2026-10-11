---
title: Hook PermissionRequest no CLI e no SettingsMerger
number: 015
priority: high
tags: [feature, daemon, cli, hooks, testing]
dependencies: [014-permission-broker-and-protocol.spec.md, 006-hooks-cli-settings-merger.spec.md]
related_prd: ../prds/desktop-app-permissions.prd.md
status: pending
created: 2026-10-10
---

# 015 - Hook PermissionRequest no CLI e no SettingsMerger

## Overview
Faz o comando `hook` tratar o evento `PermissionRequest` (POST long-poll sem timeout curto, imprimindo a decisão no stdout) e inclui esse evento, com `timeout` alto, no `hooks install|uninstall|status`. Os demais eventos mantêm o caminho rápido de 300 ms.

## Related PRD
- **Source**: [Agents Office Desktop e aprovação de permissões](../prds/desktop-app-permissions.prd.md)
- **Section Reference**: User Stories 9, 17-19; Implementation Decisions → cli (hook), SettingsMerger

## Prerequisites
- [ ] Spec 014 concluído
- [ ] Spec 013: concluído. Resultados: formato de saída confirmado; `timeout` = **86400** (testado aceito até 99999999999 s; zero/negativo/string invalidam o hook); sair sem decisão = exit 0 + stdout vazio, **nunca exit 2**

## Dependencies
- `014-permission-broker-and-protocol.spec.md`: rota /hook/permission
- `006-hooks-cli-settings-merger.spec.md`: hook e SettingsMerger

## Implementation Tasks
### 1. Comando hook (`packages/daemon/src/cli/hook.ts`)
- [ ] Detectar `hook_event_name === 'PermissionRequest'` no payload lido do stdin
- [ ] Para esse evento: POST em `/hook/permission` **sem timeout curto**, aguardando a resposta; imprimir o corpo (JSON de decisão) no stdout e sair com 0
- [ ] Daemon fora, sem UI (204), conexão que cai ou erro: sem saída e exit 0 (o prompt do terminal já está na tela, pois roda em paralelo ao hook; o spike 013 provou que matar ou estourar o hook não trava a sessão)
- [ ] Incluir no POST o `terminalId` lido de `process.env.AGENTS_OFFICE_TERMINAL_ID` quando existir (confirmado visível ao hook), no `/hook/permission` e no `/hook`
- [ ] Repassar ao daemon `agent_id`/`agent_type` do payload; sair (exit 0 sem saída) quando o daemon responder 204 por resolução externa (pedido respondido no terminal), senão o processo fica vivo até o fim da sessão
- [ ] Manter o módulo sem imports pesados; o caminho rápido dos outros eventos permanece (<150 ms)
- [ ] Respeitar o sinal de término do processo (SIGTERM do Claude Code) fechando a conexão para o broker limpar a pendência
### 2. SettingsMerger (`packages/daemon/src/cli/settings-merger.ts`)
- [ ] Adicionar `PermissionRequest` à lista de eventos com `timeout` alto `86400` (24 h, em segundos; valor validado no spec 013) e sem `matcher` restritivo (`*` se exigido)
- [ ] O marcador de remoção continua identificando só entradas nossas; uninstall deixa o arquivo byte a byte idêntico ao original
- [ ] `status` mostra o novo evento; `--dry-run` mostra o diff incluindo o timeout
- [ ] Migração: `hooks install` em um settings que já tem os 9 eventos antigos adiciona só o novo, sem duplicar
### 3. Testing (Seam 3)
- [ ] `test/hooks-cli.test.ts`: install/uninstall com o novo evento, idempotência, migração de instalação antiga, byte a byte
- [ ] `hook` de permissão contra um daemon real (`createDaemon` porta 0) com cliente WS de UI decidindo: stdout traz o JSON esperado; allow e deny com mensagem
- [ ] `hook` com daemon fora: exit 0, stdout vazio, <500 ms

## Acceptance Criteria
### Must Have
- [ ] Testes da Seam 3 estendidos passam
- [ ] Settings real do usuário não é tocado pelos testes
- [ ] Uninstall restaura o original byte a byte

### Should Have
- [ ] Documentar no README o novo evento e o comportamento de fallback

## Testing Requirements
```bash
pnpm --filter @agents-office/daemon test hooks-cli permission
pnpm typecheck && pnpm lint
```

## Rollback Plan
`agents-office hooks uninstall` remove a entrada; reverter as mudanças em `hook.ts` e `settings-merger.ts`.
