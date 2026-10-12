---
title: ARCHITECTURE.md com arquitetura e fluxo de comunicação
number: 090
priority: medium
tags: [docs, architecture, daemon, desktop]
dependencies: []
related_prd: ../prds/documentacao-do-projeto.prd.md
status: pending
created: 2026-10-12
---

# 090 - ARCHITECTURE.md com arquitetura e fluxo de comunicação

## Overview
Documento na raiz, em inglês, sobre a arquitetura geral do software e os fluxos de comunicação ponta a ponta, com diagramas.

## Related PRD
- **Source**: [Documentação dedicada](../prds/documentacao-do-projeto.prd.md)
- **Section Reference**: User Stories 19-24

## Prerequisites
- [ ] Ler `packages/shared/src`, `packages/daemon/src`, `packages/desktop/src` e os learnings `permission-hook-and-pty`, `auto-update-release`, `perfis-agent-bus`, `quadro-excalidraw-overlay`

## Dependencies
- Nenhuma

## Implementation Tasks
### 1. ARCHITECTURE.md
- [ ] Pacotes e grafo de dependências (shared, daemon, web, desktop, cli, e2e)
- [ ] Processos: daemon (rotas, watcher, normalizer, reduce, tick, liveness), CLI de hook, Electron main, preload e renderer
- [ ] Contratos em `packages/shared`: eventos, modelo, reducer, protocolo, contratos `desktop*`
- [ ] Fluxos com diagramas mermaid: transcript → daemon → WebSocket → web; hooks; permissões notify-only (spike 013); sessões de terminal; sessões gerenciadas, perfis e elenco
- [ ] Fluxos: Agent Bus (MCP) e suas ferramentas; fila de mensagens e disjuntor; aprovação de spawn do orquestrador; quadro Excalidraw
- [ ] Release, auto-update e CI
- [ ] Segurança: 127.0.0.1, bearer tokens, `contextBridge`, sem telemetria, falha fechada
### 2. Verificação
- [ ] Rotas, canais e constantes citados batem com o código; sem números de linha

## Acceptance Criteria
### Must Have
- [ ] Um desenvolvedor localiza onde uma mudança entra e como os dados fluem
- [ ] Os diagramas renderizam no GitHub
### Should Have
- [ ] Referência cruzada com `DESIGN.md` e `DEVELOPMENT.md`

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
