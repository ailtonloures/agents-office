---
title: Landing - copy dos modos passivo e ativo
number: 121
priority: high
tags: [enhancement, landing, i18n, content]
dependencies: [120-landing-instalacao-so-linux-e-seo.spec.md]
related_prd: ../prds/landing-modo-ativo-e-instalacao-linux.prd.md
status: pending
created: 2026-10-18
---

# 121 - Landing - copy dos modos passivo e ativo

## Overview
Reescreve meta, hero, "como funciona", features, arquitetura e segurança para apresentar os dois modos: passivo (só visualiza) e ativo (perfis de agentes, comunicação entre agentes, board Excalidraw, terminal, ver os agentes trabalhando).

## Related PRD
- **Source**: [Landing - modo ativo e passivo, instalação só Linux](../prds/landing-modo-ativo-e-instalacao-linux.prd.md)
- **Section Reference**: User Stories 1 a 13, 19, 20, 23, 25; Implementation Decisions

## Prerequisites
- [ ] Spec 120 concluída (evita conflito nos arquivos de mensagens)

## Dependencies
- `120-landing-instalacao-so-linux-e-seo.spec.md` - mesmos arquivos de i18n

## Implementation Tasks
### 1. Testes primeiro (Red)
- [ ] `packages/landing/test/i18n.test.ts`: as novas chaves (ex.: cartões dos modos passivo e ativo) existem em `en`, `pt-BR` e `es`; o texto de `meta.description` em `en` menciona orquestrar/agentes (e não só "watch")
- [ ] `packages/landing/test/documentMeta.test.ts`: títulos continuam distintos entre os idiomas
- [ ] `e2e/tests/landing.spec.ts`: atualizar os títulos esperados por idioma (linhas ~7-11) para os novos `meta.title`
- [ ] Rodar e ver falhar

### 2. Conteúdo (Green)
- [ ] `en.ts` (fonte) depois `pt-BR.ts` e `es.ts`:
  - `meta.title` e `meta.description`: observar e orquestrar agentes Claude Code
  - `hero.lead`: os dois modos em uma frase
  - `how.lead` e cards: lead com Passivo vs Ativo; manter projeto=sala, sessão=Tech Lead, subagente=funcionário; card de hooks fala só do modo passivo
  - `features.lead` e ordem dos cartões: perfis e elenco, Agent Bus, Board (Excalidraw), terminais integrados, observabilidade ao vivo; navegador embutido segue com selo Beta
  - `arch.step.sources.desc` ("lido passivamente") e a frase do app desktop (terminais, Agent Bus, board)
  - `security.*`: hooks opcionais e só notificam (modo passivo); aprovações negam por padrão e criar agente exige aprovação
- [ ] `packages/landing/src/sections/{HowItWorks,Features}.tsx`: apenas se for preciso adicionar o bloco dos dois modos ou reordenar cartões; reutilizar `PixelPanel`/`SectionHeading`
- [ ] `packages/landing/index.html:6`: título hardcoded igual ao novo `en['meta.title']`

### 3. Refatorar
- [ ] `pnpm format`; revisar leitura nos três idiomas (sem texto fixo fora de `t()`)

## Acceptance Criteria
### Must Have
- [ ] Testes novos falharam antes e passam agora
- [ ] Nenhuma frase afirma que o produto é apenas passivo
- [ ] Texto cobre perfis, comunicação entre agentes, board, terminal e acompanhar agentes
- [ ] Chaves em `en`, `pt-BR` e `es` (typecheck e paridade verdes)
### Should Have
- [ ] Browser embutido continua com selo Beta
- [ ] Inspeção visual no dev server nos três idiomas

## Testing Requirements
```bash
pnpm vitest run packages/landing/test
pnpm typecheck && pnpm lint
pnpm --filter @agents-office/landing build
```

## Rollback Plan
`git revert` do commit; apenas texto e estrutura de apresentação.
