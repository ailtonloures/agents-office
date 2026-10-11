---
title: Avatar de sub-agente órfão sai quando o agente é recriado
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [agents-office.prd.md, contador-agentes-vivos.prd.md]
---

# PRD: Avatar de sub-agente órfão

## Problem Statement
Quando o trabalho de um sub-agente "morre" no meio (processo interrompido, sessão retomada) e o sub-agente é recriado na sessão, o avatar do agente que morreu continua parado no escritório, dormindo na mesa, e o avatar do novo agente surge por cima. O usuário vê dois personagens para um único agente real, e os contadores do HUD e do `/health` também contam o morto como vivo. Isso só se resolve quando a sessão inteira expira (15 minutos de silêncio).

## Solution
O sub-agente que morreu deixa de existir para o escritório: seu avatar entrega o relatório, caminha até a saída e some, e o novo agente entra pela porta e ocupa seu lugar. Isso acontece de duas formas: imediatamente, quando um agente equivalente é recriado; e, como rede de segurança, quando um agente fica inativo por tempo demais sem ser recriado.

## User Stories
1. Como usuário, quero que o avatar de um sub-agente que morreu saia do escritório, para não ver personagens fantasmas.
2. Como usuário, quero que o sub-agente recriado entre pela porta, para perceber que um novo agente começou.
3. Como usuário, quero que o avatar antigo e o novo não fiquem sobrepostos, para distinguir cada agente.
4. Como usuário, quero que o avatar antigo saia com a mesma animação de um agente que terminou normalmente, para a cena ser consistente.
5. Como usuário, quero que o agente antigo seja substituído assim que o novo aparecer, sem esperar minutos.
6. Como usuário, quero que dois sub-agentes iguais trabalhando em paralelo não se substituam, para não perder agentes legítimos.
7. Como usuário, quero que um sub-agente ocioso por muito tempo e nunca recriado também saia, para o escritório não acumular dorminhocos.
8. Como usuário, quero que um sub-agente que apenas está pensando ou usando uma ferramenta nunca seja removido por engano, para não perder trabalho em andamento.
9. Como usuário, quero que o contador de agentes do HUD diminua quando o agente órfão sai, para refletir a realidade.
10. Como usuário, quero que `/health` e HUD concordem sobre quantos agentes estão vivos, para confiar nos números.
11. Como usuário, quero que o agente removido apareça no Hall da Fama como os demais finalizados, para manter o histórico.
12. Como usuário, quero que a mesa do agente antigo fique livre para o novo, para não haver dois personagens na mesma mesa.
13. Como usuário, quero que eventos tardios do agente antigo sejam ignorados, para ele não "ressuscitar".
14. Como usuário, quero que a sessão-mãe e seu avatar não sejam afetados, para só o sub-agente sair.
15. Como usuário, quero que sub-agentes de outras sessões nunca sejam substituídos, para sessões independentes não interferirem.
16. Como mantenedor, quero o limite de inatividade configurável, para ajustar sem mexer na lógica.
17. Como mantenedor, quero a regra de substituição testada na camada do modelo, para evoluir sem regressões.
18. Como mantenedor, quero um teste E2E que mostre o antigo saindo e o novo ficando, para travar o comportamento visível.

## Implementation Decisions
- A correção fica no modelo, não na cena: o avatar já sai quando o agente fica `finished`; falta finalizar o agente que morreu.
- Substituição na recriação: ao surgir um agente com identificador novo, o predecessor da mesma sessão considerado equivalente (mesmo tipo, mesma descrição e mesmo agente pai) e em estado ocioso é marcado como finalizado, pelo mesmo caminho do término normal (inclui Hall da Fama).
- Somente predecessores ociosos são substituídos; agentes trabalhando, pensando ou esperando nunca são tocados.
- Rede de segurança por inatividade: o relógio de liveness passa a finalizar agentes que permanecem ociosos além de um novo limite configurável (padrão 5 minutos), emitindo o evento de término com origem de relógio.
- O comportamento da cena (entrega, saída, fade, liberação de mesa) não muda; deve ser verificado que a mesa do agente finalizado é liberada.
- Premissa a validar: o sub-agente recriado chega com identificador novo. Se vier com o mesmo, o problema é outro e a decisão de substituição deve ser revista.
- Sessões e atores principais continuam seguindo a regra existente de expiração de sessão.

## Testing Decisions
- Bom teste: verifica comportamento observável (status dos agentes, eventos emitidos, personagens presentes), não detalhes internos.
- Seam 1 (unitário, reducer): spawn equivalente finaliza o predecessor ocioso; não finaliza um que está trabalhando; não cruza sessões; gêmeo em paralelo preservado. Prior art: testes do reducer.
- Seam 2 (unitário, liveness): agente ocioso além do limite gera término; abaixo do limite não; agentes trabalhando não. Prior art: teste do tick de liveness.
- Seam 3 (E2E Playwright, mais alto): gerar sub-agente, deixá-lo ocioso, recriar; o antigo some, o novo permanece e o HUD mostra um agente vivo. Prior art: testes E2E do escritório.

## Out of Scope
- Detectar morte de processo por sinal explícito (PID, pipe) em vez de inferir por inatividade.
- Mudanças na animação de saída ou na máquina de estados dos personagens.
- Alterar a expiração de sessões (15 min).
- Vincular agentes à chamada da tool Agent para identidade estável.

## Further Notes
A causa raiz é que nada finaliza um agente que morre sem `SubagentStop` nem resultado da tool: ele só vira ocioso e fica no modelo até o fim da sessão. A heurística de equivalência (tipo, descrição, pai) pode ser substituída por uma identidade estável se o Claude Code passar a expô-la.
