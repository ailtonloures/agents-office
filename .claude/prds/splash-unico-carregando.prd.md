# PRD — Splash único ("Carregando...")

## Problem Statement
Ao abrir o app desktop, o usuário vê duas telas de splash em sequência: primeiro uma página simples "Agents Office — Iniciando o daemon..." (fundo diferente, sem logo) e, logo depois, o splash do escritório com logo, nome e "Carregando...". A troca é um flash visual que parece um defeito.

## Solution
Manter apenas o splash com a mensagem "Carregando...". Enquanto o daemon sobe, a janela fica vazia na mesma cor de fundo do splash; assim que o escritório carrega, o splash com logo e "Carregando..." aparece e some quando a primeira cena está pronta. Nenhuma tela intermediária.

## User Stories
1. Como usuário, quero ver apenas um splash ao abrir o app, para que a inicialização pareça contínua.
2. Como usuário, quero que o splash mostre logo, nome e "Carregando...", para saber que o app está iniciando.
3. Como usuário, não quero ver a mensagem "Iniciando o daemon...", para não ser exposto a detalhes internos.
4. Como usuário, quero que a janela não pisque com outra cor antes do splash, para uma abertura suave.
5. Como usuário, quero que o splash desapareça quando o escritório estiver pronto, para começar a usar o app.
6. Como usuário, quero continuar vendo páginas de erro claras (porta ocupada, daemon que não iniciou), para entender falhas.
7. Como usuário do modo navegador (web), quero que o splash continue igual, para não haver regressão.
8. Como mantenedor, quero um único splash a manter, para reduzir duplicação.

## Implementation Decisions
- O processo principal do desktop deixa de carregar a página provisória "Iniciando o daemon..." na criação da janela; a janela só carrega conteúdo quando o daemon estiver `running`/`external` (splash web) ou em erro (página de erro).
- A cor de fundo da janela nativa passa a ser a mesma do splash web (`#0d1020`), para que o intervalo sem conteúdo seja imperceptível.
- O splash web (HTML estático + ocultação por evento de cena pronta) não muda.
- A página de erro continua existindo apenas para falhas reais.

## Testing Decisions
- Bom teste: verifica comportamento externo (o que a janela carrega e em que ordem), não detalhes internos.
- Seam proposto (mais alto possível): o ciclo de vida do processo principal (testes de `lifecycle`/status do daemon já existentes) — afirmar que nenhuma URL é carregada antes do status `running`/`external`, e que erros ainda carregam a página de erro. Complementado por verificação e2e visual (`/qa`) do arranque. **Confirmar seam com o usuário.**
- Arte prévia: testes existentes em `packages/desktop/test` (ex.: `lifecycle.test.ts`).

## Out of Scope
- Redesenho visual do splash web.
- Mudanças no tempo de inicialização do daemon.
- Mudanças nas páginas de erro.

## Further Notes
Causa identificada: `main.ts` do desktop carrega `errorPageUrl('Agents Office','Iniciando o daemon...')` logo após criar a janela; depois `onDaemonStatus` carrega o app, cujo `index.html` tem o splash com "Carregando...".
