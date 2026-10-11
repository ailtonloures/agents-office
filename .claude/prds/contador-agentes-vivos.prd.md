---
title: Contador de sessões e agentes do HUD reflete apenas o que está vivo
status: draft
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [agents-office.prd.md]
---

# PRD: Contador de agentes e sessões realista

## Problem Statement
O contador no topo da página ("n sessões · n agentes · ! n") sobe quando uma sessão abre ou um agente nasce, mas não desce quando um agente deixa de existir. O número de agentes só cai quando a sessão inteira termina, então ele passa a mostrar mais agentes do que os que realmente estão trabalhando. O indicador de "esperando" sofre do mesmo problema com agentes já finalizados.

## Solution
O contador passa a contar somente atores vivos: agentes finalizados ou encerrados deixam de ser contados assim que terminam. A mesma definição vale para o endpoint de saúde do daemon, para que HUD e `/health` nunca divirjam. O modelo compartilhado e o Hall da Fama continuam como estão.

## User Stories
1. Como usuário, quero que o contador de agentes diminua quando um subagente termina, para que o número reflita quem está trabalhando agora.
2. Como usuário, quero que o contador de agentes suba quando um subagente nasce, para acompanhar a equipe em tempo real.
3. Como usuário, quero que o contador de sessões diminua quando uma sessão termina, para saber quantas estão abertas.
4. Como usuário, quero que o contador de sessões suba ao abrir uma nova sessão, para confirmar que ela foi detectada.
5. Como usuário, quero que um agente finalizado não apareça no indicador "esperando", para não ser alertado por quem já terminou.
6. Como usuário, quero que um agente com permissão pendente continue contado como esperando uma única vez, para não ver o alerta duplicado.
7. Como usuário, quero que agentes finalizados continuem no Hall da Fama, para ver o histórico de quem concluiu o trabalho.
8. Como usuário, quero que o personagem de um agente finalizado ainda faça sua animação de saída, para a cena não cortar de forma abrupta.
9. Como usuário, quero que o contador do HUD e o `/health` do daemon mostrem os mesmos números, para depurar sem confusão.
10. Como usuário, quero que agentes encerrados junto com a sessão saiam do contador de uma vez, para não haver resíduo após o fim da sessão.
11. Como usuário, quero que o contador nunca fique negativo nem oscile ao chegar eventos tardios de um agente já finalizado, para o número ser estável.
12. Como usuário, quero que o plural/singular ("1 agente", "2 agentes") continue correto com a nova contagem, para o texto ficar natural.
13. Como usuário, quero que o contador reaja sem recarregar a página, para ver as mudanças ao vivo.
14. Como mantenedor, quero uma única definição de "ator vivo" compartilhada entre web e daemon, para não duplicar regra.
15. Como mantenedor, quero que o reducer de `agent.finished` permaneça inalterado, para não afetar personagens e diálogos.
16. Como mantenedor, quero testes que cubram agentes finalizados e encerrados no contador, para evitar regressão.

## Implementation Decisions
- Definição única de "vivo": um ator cujo status não é `finished` nem `ended`. Fica em um helper no pacote compartilhado, usado pela web e pelo daemon.
- O cálculo dos contadores do HUD passa a filtrar atores vivos para agentes, sessões e para o indicador de "esperando".
- O endpoint de saúde do daemon passa a usar a mesma definição para sessões e agentes.
- O reducer e o modelo não mudam: `agent.finished` continua marcando o agente como finalizado e copiando-o para o Hall da Fama; a remoção real continua ocorrendo no fim da sessão.
- Contrato do `/health` mantém os mesmos campos; só muda a semântica de `agents` e `sessions` para "vivos".

## Testing Decisions
- Bom teste: observa o comportamento externo (números exibidos/retornados) a partir de um modelo, sem acessar detalhes internos.
- Seams: função de contagem do HUD (unitário, web); rota `/health` do daemon (integração); helper compartilhado de "vivo" (unitário, shared). O reducer não ganha teste novo, só segue coberto pelos existentes.
- Prior art: testes Vitest existentes de `hudLogic` na web e do servidor do daemon.

## Out of Scope
- Remover agentes finalizados do modelo ou alterar o reducer.
- Reduzir o tempo de expiração de sessões sem hook de fim (15 min).
- Mudanças visuais no HUD.

## Further Notes
Sessões cujo processo morre sem o hook de fim ainda levam até 15 minutos para sair do contador (liveness). Se isso incomodar, tratar em PRD separado.
