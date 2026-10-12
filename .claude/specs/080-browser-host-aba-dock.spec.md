---
title: BrowserHost: WebContentsView por workspace e aba no dock
number: 080
priority: high
tags: [feature, desktop, web, browser]
dependencies: [063-agent-bus-mcp-injecao.spec.md]
related_prd: ../prds/navegador-embutido.prd.md
status: pending
created: 2026-10-11
---

# 080 - BrowserHost: WebContentsView por workspace e aba no dock

## Overview
Navegador embutido por workspace com partition persistente isolada, como aba do dock, com barra de endereço e navegação manual.

## Related PRD
- **Source**: [Navegador embutido controlado por agentes](../prds/navegador-embutido.prd.md)

## Prerequisites
- [ ] `063-agent-bus-mcp-injecao.spec.md` concluída

## Dependencies
- [063-agent-bus-mcp-injecao.spec.md]

## Implementation Tasks
### 1. Host
- [ ] `src/main/browserHost.ts`: um `WebContentsView` por projeto, partition `persist:` por projeto
- [ ] Aba "Navegador" no modelo de painel do dock; voltar/avançar/recarregar/endereço
- [ ] Limpar dados do projeto; fechar a aba não encerra sessões
### 2. Testes
- [ ] `browserHost.test.ts` com fábrica de views falsa (isolamento por projeto)

## Acceptance Criteria
- [ ] Cookies não vazam entre projetos nem para o app
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
