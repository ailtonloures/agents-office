---
title: Landing - documentação e deploy de preview na Vercel
number: 115
priority: medium
tags: [docs, landing, vercel, release]
dependencies: [113-landing-seo-acessibilidade-e-desempenho.spec.md, 114-landing-testes-e2e.spec.md]
related_prd: ../prds/landing-page-comercial.prd.md
status: pending
created: 2026-10-12
---

# 115 - Landing - documentação e deploy de preview na Vercel

## Overview
Documenta o novo pacote, registra os aprendizados e publica um deploy de preview na Vercel para o usuário revisar. Produção e domínio ficam fora de escopo.

## Related PRD
- **Source**: [Landing page comercial](../prds/landing-page-comercial.prd.md)
- **Section Reference**: User Stories 39, 40, 43; Implementation Decisions (deploy, documentação)

## Prerequisites
- [ ] Specs 106 a 114 concluídas e `pnpm typecheck && pnpm lint && pnpm vitest run` verdes
- [ ] Vercel CLI disponível (`vercel --version`); se não houver sessão (`vercel whoami`), pedir ao usuário `! vercel login`

## Dependencies
- `113-...` e `114-...`

## Implementation Tasks
### 1. Documentação
- [ ] `CLAUDE.md`: linha de `packages/landing` na tabela do mapa do projeto
- [ ] `DEVELOPMENT.md`: como rodar, buildar e publicar a landing (Root Directory `packages/landing`, comandos do `vercel.json`)
- [ ] `ARCHITECTURE.md`: o pacote, que não é dependência do CLI e que não toca as skins do web
- [ ] `.claude/learnings/landing-page.md` (pt-BR): decisões, sprites copiados, armadilhas do monorepo na Vercel
### 2. Deploy de preview
- [ ] `vercel link` e `vercel deploy` (preview, não `--prod`) a partir da raiz do monorepo
- [ ] Abrir a URL com Playwright MCP e confirmar que renderiza igual ao local (hero animado, 3 idiomas)
- [ ] Entregar a URL ao usuário e avisar que é preview; produção/domínio só por pedido explícito
### 3. Commit
- [ ] `:sparkles:` + mensagem em inglês com o número da spec, apenas se o usuário pedir commit

## Acceptance Criteria
### Must Have
- [ ] Docs atualizados e learning criado
- [ ] URL de preview acessível e funcional
- [ ] Nenhum segredo ou token versionado (`.vercel/` ignorado no `.gitignore`)
### Should Have
- [ ] Lighthouse executado também na URL publicada

## Testing Requirements
```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
vercel deploy
```

## Rollback Plan
Remover o deployment de preview na Vercel (`vercel remove`) e reverter os docs.
