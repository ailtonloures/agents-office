---
title: Confirmações, pausar agentes e rotulagem de conteúdo
number: 083
priority: high
tags: [feature, desktop, web, safety]
dependencies: [081-browser-ferramentas-cdp-fila.spec.md]
related_prd: ../prds/navegador-embutido.prd.md
status: pending
created: 2026-10-11
---

# 083 - Confirmações, pausar agentes e rotulagem de conteúdo

## Overview
Cartões de confirmação para downloads, permissões de site e `browser_eval`, e interruptor "Pausar agentes".

## Related PRD
- **Source**: [Navegador embutido controlado por agentes](../prds/navegador-embutido.prd.md)

## Prerequisites
- [ ] `081-browser-ferramentas-cdp-fila.spec.md` concluída

## Dependencies
- [081-browser-ferramentas-cdp-fila.spec.md]

## Implementation Tasks
### 1. Segurança
- [ ] Cartões Permitir/Negar no padrão dos demais
- [ ] Download e permissões do site bloqueados por padrão até decisão
- [ ] Interruptor por workspace: ferramentas devolvem "pausado pelo usuário"
### 2. Testes
- [ ] Fluxos negar/permitir/pausar

## Acceptance Criteria
- [ ] Nada de download ou permissão sem decisão do usuário
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
