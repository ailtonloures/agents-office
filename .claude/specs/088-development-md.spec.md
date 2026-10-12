---
title: DEVELOPMENT.md com o básico de desenvolvimento
number: 088
priority: medium
tags: [docs, development]
dependencies: []
related_prd: ../prds/documentacao-do-projeto.prd.md
status: pending
created: 2026-10-12
---

# 088 - DEVELOPMENT.md com o básico de desenvolvimento

## Overview
Documento na raiz, em inglês, focado no básico: instalar dependências, buildar e executar tudo com `pnpm dev`. Também recebe o processo de release que sai do README.

## Related PRD
- **Source**: [Documentação dedicada](../prds/documentacao-do-projeto.prd.md)
- **Section Reference**: User Stories 10-13

## Prerequisites
- [ ] Ler os `package.json` da raiz e de `packages/*`
- [ ] Ler `scripts/release.mjs`

## Dependencies
- Nenhuma (087 remove do README o conteúdo que este documento recebe)

## Implementation Tasks
### 1. DEVELOPMENT.md
- [ ] Pré-requisitos: Node >= 20, pnpm >= 9, toolchain C++/python para o `node-pty` quando não houver prebuild
- [ ] `pnpm install`, `pnpm build`, `pnpm dev` (daemon na porta 4777, web com Vite e desktop)
- [ ] Checagens: `pnpm lint`, `pnpm typecheck`, `pnpm test`
- [ ] Hooks opcionais em desenvolvimento (`hooks install` e `uninstall`)
- [ ] Processo de release do mantenedor: `pnpm release patch|minor|major`, push da tag, recuperação de falha (apagar tag remota e local)
- [ ] Roteiro manual de teste do updater (0.1.0 → 0.1.1), vindo do README
- [ ] Links para `DESIGN.md` e `ARCHITECTURE.md`
### 2. Verificação
- [ ] Rodar `pnpm install && pnpm build` e subir `pnpm dev` por alguns segundos

## Acceptance Criteria
### Must Have
- [ ] Um novo contribuidor roda o projeto seguindo só o documento
- [ ] Todo script citado existe nos `package.json`
### Should Have
- [ ] Curto, sem detalhes de arquitetura

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
