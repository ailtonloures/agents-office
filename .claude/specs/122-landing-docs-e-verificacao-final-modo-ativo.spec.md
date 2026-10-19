---
title: Landing - README e verificação final do modo ativo
number: 122
priority: medium
tags: [docs, landing, qa, testing]
dependencies: [120-landing-instalacao-so-linux-e-seo.spec.md, 121-landing-copy-modo-passivo-e-ativo.spec.md]
related_prd: ../prds/landing-modo-ativo-e-instalacao-linux.prd.md
status: pending
created: 2026-10-18
---

# 122 - Landing - README e verificação final do modo ativo

## Overview
Fecha o PRD: corrige o nome do arquivo no README, sinaliza o trecho obsoleto de macOS na documentação e verifica a landing construída nos três idiomas.

## Related PRD
- **Source**: [Landing - modo ativo e passivo, instalação só Linux](../prds/landing-modo-ativo-e-instalacao-linux.prd.md)
- **Section Reference**: User Stories 24; Testing Decisions; Out of Scope

## Prerequisites
- [ ] Specs 120 e 121 concluídas
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes

## Dependencies
- `120-...` e `121-...`

## Implementation Tasks
### 1. Documentação
- [ ] `README.md` (~linhas 38-40): trocar `linux-x64` por `linux-x86_64` (AppImage) e mencionar o `.deb` `linux-amd64`
- [ ] Learning em `.claude/learnings/` sobre a landing (atualizar o existente, se houver): nomes reais dos artefatos de release e regra "a landing só promete o que a release publica"
- [ ] `ARCHITECTURE.md` (~linhas 493-497 e 514) cita job de macOS que não existe no workflow: não alterar aqui, apenas relatar na entrega
- [ ] `.claude/specs/INDEX.md`: marcar 120 a 122 como `done` ao concluir

### 2. Verificação final
- [ ] `pnpm build` e `pnpm --filter @agents-office/landing build`; conferir `dist/index.html` (meta, JSON-LD só Linux, canonical)
- [ ] E2E da landing: `pnpm exec playwright test --project=landing` (porta 4399)
- [ ] Inspeção com Playwright MCP em en, pt-BR e es: hero, dois modos, features, aba Install sem macOS, botão copiar dos comandos

### 3. Commit
- [ ] Somente se o usuário pedir: `:memo:`/`:sparkles:` + mensagem em inglês com o número da spec

## Acceptance Criteria
### Must Have
- [ ] Documentação coerente com a release real
- [ ] `pnpm typecheck && pnpm lint && pnpm vitest run` verdes e e2e da landing passando
- [ ] Nenhuma menção a macOS como suportado na landing buildada
### Should Have
- [ ] Prints da verificação guardados fora do repositório e citados na entrega

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run
pnpm build
```

## Rollback Plan
`git revert` dos docs; o código das specs 120 e 121 tem rollback próprio.
