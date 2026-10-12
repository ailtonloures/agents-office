---
title: Botão de idioma na barra inferior
number: 100
priority: high
tags: [feature, web, ui, i18n, testing]
dependencies: [099-infra-i18n-locale.spec.md]
related_prd: ../prds/locale-seletor-de-idioma.prd.md
status: done
created: 2026-10-12
---

# 100 - Botão de idioma na barra inferior

## Overview
Adiciona o botão de idioma como quarto item da barra de controles do canto inferior esquerdo (ao lado de Hooks, Sessões e Elenco), com menu EN/PT/ES. Escolher grava o idioma e recarrega a página. Funciona no desktop e no navegador puro.

## Related PRD
- **Source**: [Seletor de idioma](../prds/locale-seletor-de-idioma.prd.md)
- **Section Reference**: User Stories 1, 3-6, 8, 19-22

## Prerequisites
- [ ] Spec 099 concluída
- [ ] Ler `packages/web/src/ui/cornerBar.ts`, `ui/buttonStyles.ts`, `ui/zoomControls.ts` e `ui/castPanel.ts` (montagem do botão)
- [ ] Ler `main.ts` (ordem das montagens)

## Dependencies
- `099-infra-i18n-locale.spec.md` - `LOCALES`, `writeStoredLocale`, `getLocale`

## Implementation Tasks
### 1. Lógica (`ui/localeMenuLogic.ts`, pura)
- [ ] Itens do menu a partir de `LOCALES` com marca do atual; função que decide se a escolha exige gravar e recarregar (mesmo idioma → só fecha)
### 2. UI (`ui/localeButton.ts`)
- [ ] `mountLocaleButton(gameParent)` usa `getCornerBar(gameParent)`; botão com o código curto do idioma atual (`data-testid="locale-open"`, classe `ao-locale-btn`, `title`/`aria-label` traduzidos)
- [ ] Menu com as 3 opções (`data-testid="locale-option-<code>"`, `role="menu"`/`menuitemradio`, atual marcada), fecha com Esc e clique fora
- [ ] Escolha: `writeStoredLocale(code)` e `location.reload()`
- [ ] Teclado: ao focar o menu, liberar o teclado do Phaser (regra do dono explícito do teclado) e devolver ao fechar
- [ ] Posição: `position: absolute` dentro de `#game` via corner bar, nunca `fixed`; menu abre para cima
### 3. Estilo e montagem
- [ ] Adicionar `.ao-locale-btn` (e itens do menu) a `BUTTONS` em `ui/buttonStyles.ts`
- [ ] `main.ts`: montar por último, fora dos `if` das pontes desktop
- [ ] Chaves de `locale.*` (rótulo, título) nos três dicionários
### 4. Testes
- [ ] `web/test/localeMenuLogic.test.ts`: itens, marca do atual, escolha igual ao atual não recarrega
- [ ] E2E (`e2e/tests/office.spec.ts`): botão visível ao lado dos demais, abre inglês, troca para PT e persiste após reload

## Acceptance Criteria
### Must Have
- [ ] Botão aparece na barra no navegador puro e no desktop, após Elenco
- [ ] Escolha persiste e a página recarrega com `lang` correto
- [ ] Não cobre o terminal (`#ao-terminal`) nem outros controles
- [ ] Testids existentes continuam estáveis
### Should Have
- [ ] Operável só pelo teclado, sem que o jogo capture teclas

## Testing Requirements
```bash
pnpm vitest run packages/web/test/localeMenuLogic.test.ts
pnpm build && pnpm exec playwright test e2e/tests/office.spec.ts
pnpm typecheck && pnpm lint
```

## Rollback Plan
Remover `localeButton.ts`, `localeMenuLogic.ts`, a montagem em `main.ts` e a entrada em `buttonStyles.ts`.
