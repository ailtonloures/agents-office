---
title: CLAUDE.md com regras de arquitetura do projeto
number: 091
priority: medium
tags: [docs, claude, conventions]
dependencies: [088-development-md.spec.md, 089-design-md.spec.md, 090-architecture-md.spec.md]
related_prd: ../prds/documentacao-do-projeto.prd.md
status: pending
created: 2026-10-12
---

# 091 - CLAUDE.md com regras de arquitetura do projeto

## Overview
CLAUDE.md na raiz, em inglês, com regras normativas e concisas que seguem o padrão de arquitetura do projeto, apontando para os três documentos para o detalhe.

## Related PRD
- **Source**: [Documentação dedicada](../prds/documentacao-do-projeto.prd.md)
- **Section Reference**: User Stories 25-29

## Prerequisites
- [ ] Specs 088, 089 e 090 concluídas
- [ ] Ler `biome.json`, `tsconfig.base.json` e `.claude/learnings/`

## Dependencies
- `088-development-md.spec.md`, `089-design-md.spec.md`, `090-architecture-md.spec.md` - o CLAUDE.md aponta para eles

## Implementation Tasks
### 1. CLAUDE.md
- [ ] Mapa do projeto e links para README, DEVELOPMENT, DESIGN e ARCHITECTURE
- [ ] Arquitetura: lógica pura separada de Phaser/DOM (`xxxLogic.ts`, `now` injetado); dependências do desktop por interfaces `...Like`/`...Deps`; trio IPC `<x>Channels` / `<x>Ipc` / `preload/<x>Bridge`, sem expor `ipcRenderer`
- [ ] Contratos em `packages/shared` (zod `looseObject`, `safeParse` nas fronteiras, sem build); `reduce` compartilhado; hook CLI sem imports relativos
- [ ] Segurança: bind em 127.0.0.1, escrita atômica com backup de arquivo corrompido, aprovações falham fechadas, sem caracteres de controle em texto injetado no terminal
- [ ] Jogo e UI: nunca usar `GAME_WIDTH/HEIGHT` em layout; UI nova via `UiOverlay.add`; controles de canto filhos de `#game` com `position:absolute`; editar o gerador da skin e listar arquivos novos em `LICENSES.md`; trabalhadores não saem da mesa
- [ ] Estilo: Biome (2 espaços, aspas simples, ponto e vírgula, 100 colunas), TS estrito, `import type`, imports relativos sem extensão, versões fixas, ESM (bundles do Electron em CJS)
- [ ] Testes: vitest em `test/` de cada pacote, Playwright e2e (build de web e cli antes, xvfb no desktop), comando de aceite `pnpm typecheck && pnpm lint && pnpm vitest run`
- [ ] Fluxo: PRDs, specs e learnings em `.claude/` (pt-BR; learnings só em `.claude/learnings/`), spike antes de assumir comportamento do Claude Code, commits gitmoji em texto com mensagem em inglês e número da spec
- [ ] Idioma: código, comentários e docs em inglês; UI em pt-BR
- [ ] Não incluir regras específicas de ambiente (trailers de co-autoria)
### 2. Verificação
- [ ] Cada regra tem origem no código ou em um learning; nada inventado

## Acceptance Criteria
### Must Have
- [ ] Um agente novo segue o padrão do projeto lendo só o CLAUDE.md
- [ ] Documento curto (cabe em uma leitura), sem duplicar os outros três
### Should Have
- [ ] Cada regra com o motivo em uma frase

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
```

## Rollback Plan
Reverter o commit desta spec.
