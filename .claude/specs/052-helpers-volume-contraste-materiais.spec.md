---
title: Helpers de volume e contraste dos materiais no gerador de props
number: 052
priority: medium
tags: [refactor, web, art, skin-generator]
dependencies: []
related_prd: ../prds/cenario-volume-portas-moveis.prd.md
status: done
created: 2026-10-11
---

# 052 - Helpers de volume e contraste dos materiais

## Overview
Esta spec cria os blocos de construção que o redesenho dos móveis (053) usa:
- tampo com espessura (`slab`);
- caixa com topo, frente e lado de sombra (`box`);
- pés com sombra (`legs`);
- um parâmetro de contraste opcional em `ramp()`, que não altera os personagens.

Ela também cria um script de preview, para iterar a arte rapidamente.

## Related PRD
- **Source**: [Cenário com volume](../prds/cenario-volume-portas-moveis.prd.md)
- **Section Reference**: User Stories 26, 32, 33; Implementation Decisions (Móveis — helpers e contraste)

## Prerequisites
- [ ] Nenhum (pode rodar em paralelo a 050/051)

## Dependencies
- —

## Implementation Tasks
### 1. Contraste de rampa (`packages/web/scripts/skin/tone.mjs`)
- [ ] `ramp(base, { contrast = 1 } = {})`: com `contrast > 1`, afasta `hi`/`light` e `shade`/`deep` do `base`. O padrão (1) produz exatamente as cores atuais.
- [ ] Os personagens (`characters.mjs`) continuam chamando `ramp(base)` sem opção. Verificar com um diff byte a byte dos PNGs de `characters/` antes e depois.

### 2. Helpers (`packages/web/scripts/skin/props.mjs`, seção helpers)
- [ ] `slab(c, x, y, w, depth, thick, R)`:
  - plano de topo com gradiente de trás (`R.light`) para frente (`R.hi`);
  - aresta frontal de 1 px `R.hi`;
  - espessura `thick` px em `R.mid` → `R.shade`;
  - linha de sombra de 1 px sob o tampo.
- [ ] `box(c, x, y, w, topDepth, frontH, R)`:
  - plano de topo;
  - face frontal com gradiente vertical (`R.base` → `R.mid`);
  - aresta de luz de 1 px à esquerda (`R.hi`) e borda de sombra de 1 px à direita (`R.deep`);
  - AO de 1 px na base.
- [ ] `legs(c, xs, y, h, R)`: pés de 1–2 px com lado de sombra e um ponto de AO no piso.
- [ ] JSDoc curto em cada helper, no estilo do arquivo.

### 3. Preview (`packages/web/scripts/skin/preview-props.mjs`, não usado pelo build)
- [ ] Gera `preview-props.png` fora de `public/` (em `os.tmpdir()` ou num caminho passado por argumento):
  - atlas composto sobre o piso `floor` e o `wood`;
  - um personagem (`makeSheet(layers.body)` + outfit) ao lado de cada móvel, para escala;
  - ampliado 3×.
- [ ] Documentar o comando na learning.

## Acceptance Criteria
### Must Have
- [ ] `ramp(base)` sem opções devolve as mesmas cores de antes; os PNGs dos personagens não mudam
- [ ] Helpers exportados internamente e prontos para a 053; a skin gerada continua idêntica (os helpers ainda não são usados)
- [ ] O script de preview gera a imagem
- [ ] `pnpm lint` e `pnpm test` passam

## Testing Requirements
```bash
pnpm --filter @agents-office/web generate-skin
git diff --stat packages/web/public/skins/default/   # sem mudanças nesta spec
node packages/web/scripts/skin/preview-props.mjs /tmp/preview-props.png
pnpm lint && pnpm test
```

## Rollback Plan
- Remover os helpers e o script de preview. Nada mais depende deles até a 053.
