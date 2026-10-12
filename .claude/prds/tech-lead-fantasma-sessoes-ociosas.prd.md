---
title: Fim do Tech Lead fantasma e das sessões ociosas presas
status: ready-for-agent
labels: [ready-for-agent]
created: 2026-10-12
related: [perfis-sessoes-gerenciadas.prd.md]
---

# PRD: Fim do Tech Lead fantasma e das sessões ociosas presas

## Problem Statement
Ao abrir o app, aparece no escritório um Tech Lead ocioso junto com o projeto. Ele não corresponde a nenhuma sessão real do Claude Code: o usuário nunca o abriu, não há terminal por trás e ele nunca sai da sala. Fechar e reabrir o app não resolve, o fantasma volta toda vez. Isso polui o escritório, engana quem lê o estado do trabalho e faz o usuário duvidar do que é real.

Causas prováveis, lidas do código e ainda não reproduzidas:
- No lançamento, o app reabre uma sessão real para cada entrada guardada do roster, inclusive as que o usuário já encerrou. A sessão reaberta fica ociosa, sai do modelo em 15 minutos, mas o terminal continua vivo e qualquer atividade posterior a traz de volta como um Tech Lead anônimo.
- Entradas do roster gravadas antes da introdução do indicador de reabertura são tratadas como "reabrir", então os fantasmas já persistidos reabrem mais uma vez e são regravados como reabríveis.
- Quando o terminal de uma sessão gerenciada morre sem avisar, nada encerra a sessão; ela só some após o tempo de expiração.
- Avisos tardios (notificações, paradas) de sessões desconhecidas podem criar uma sessão nova.

## Solution
O usuário só vê no escritório o que existe de fato. Sessões que ele encerrou não reabrem sozinhas, inclusive as já gravadas por versões antigas. Quando um terminal gerenciado morre sem aviso, a sessão correspondente é encerrada na hora e o personagem sai. Um aviso tardio de uma sessão que o app não conhece não cria personagem. Uma sessão com horário corrompido não fica imortal.

## User Stories
1. Como usuário, quero abrir o app e ver apenas as sessões que realmente existem, para confiar no estado do escritório.
2. Como usuário, quero que um Tech Lead que eu encerrei não volte quando eu reabrir o app, para não precisar fechá-lo de novo todo dia.
3. Como usuário que atualiza o app, quero que sessões gravadas por versões antigas não reabram sozinhas, para o fantasma atual sumir depois da atualização.
4. Como usuário, quero que as sessões que eu mantinha abertas ao fechar o app voltem no próximo lançamento, para retomar meu trabalho.
5. Como usuário, quero que uma sessão fechada por mim, por exemplo ao fechar o terminal, deixe de reabrir no lançamento seguinte, para o app respeitar minha decisão.
6. Como usuário, quero que fechar o app não conte como "fechei a sessão", para a reabertura automática continuar funcionando.
7. Como usuário, quero que o personagem saia da sala logo depois que o terminal da sessão morre, para o escritório não mostrar alguém que não existe.
8. Como usuário, quero que um processo do Claude que travou ou foi morto não deixe um boneco ocioso por 15 minutos, para ver a situação real.
9. Como usuário, quero que um aviso atrasado de uma sessão já encerrada não crie um Tech Lead novo, para não ver um fantasma reaparecer sem motivo.
10. Como usuário, quero que uma sessão que começou normalmente continue funcionando como antes, para a correção não quebrar o uso comum.
11. Como usuário, quero que um agente ocioso mas vivo continue no escritório, para não perder o acompanhamento de uma sessão que só está esperando.
12. Como usuário, quero que um dado de horário corrompido não deixe uma sessão para sempre no escritório, para o escritório se limpar sozinho.
13. Como usuário, quero que um arquivo de roster corrompido não derrube o app, para continuar usando-o mesmo com dados ruins.
14. Como usuário, quero continuar vendo as linhas do elenco como "ausente" quando não há sessão, para saber que posso abri-las.
15. Como usuário com vários projetos, quero que a correção valha para todos, para nenhum projeto ter fantasma.
16. Como usuário, quero que perfis que eu abri manualmente continuem aparecendo com o nome do perfil, para distinguir de um Tech Lead sem origem.
17. Como mantenedor, quero que a reabertura no lançamento dependa de um indicador explícito gravado só quando a sessão é aberta, para não reabrir por padrão.
18. Como mantenedor, quero testes cobrindo a migração do roster antigo, para um fantasma persistido não voltar numa regressão.
19. Como mantenedor, quero que a regra de expiração seja testável com o relógio injetado, para não depender de timers reais.
20. Como mantenedor, quero um learning registrando a causa e a decisão, para o próximo agente não refazer a investigação.
21. Como mantenedor, quero que um personagem que não consegue sair de uma sala sem porta seja removido, para nenhum boneco ficar preso na cena (condicional, só com evidência).

## Implementation Decisions
- O Tech Lead não é uma entidade própria: é a aparência de qualquer sessão do modelo que o desktop não iniciou. A correção atua sobre o ciclo de vida das sessões, não sobre o personagem.
- Reabertura no lançamento passa a depender de um indicador explícito por entrada do roster. O padrão do schema é "não reabrir"; apenas abrir uma sessão pelo app grava "reabrir", e fechar o terminal pelo usuário grava "não reabrir". O encerramento do próprio app não altera o indicador. Esta decisão difere do rascunho em andamento, que usa "reabrir" como padrão, e substitui-o para cobrir o roster legado.
- Decisão de produto assumida: entradas legadas deixam de reabrir uma vez. É melhor perder uma reabertura, que custa um clique, do que reabrir um fantasma.
- Quando o terminal de uma sessão gerenciada sai sem pedido do usuário nem do encerramento do app, o desktop envia ao daemon um fim de sessão sintético pelo caminho de ingestão de hooks existente, usando o terminal ligado à sessão. Não há evento novo no contrato compartilhado.
- O daemon não cria sessão nova a partir de hooks que não sejam de início de sessão ou de prompt do usuário quando a sessão é desconhecida. Sessões já conhecidas e ainda vivas continuam a ser atualizadas normalmente.
- A regra de expiração por inatividade passa a tratar horário inválido como expirado, sem poder bloquear a expiração.
- Persistir o estado de reabertura segue as regras do projeto: escrita atômica e arquivo corrompido movido para backup, sem perda silenciosa de dados.
- Os módulos puros continuam sem relógio próprio: o tempo é injetado.
- Item condicional: forçar a saída de um personagem em saída impossível (sala sem porta) por timeout. Só entra se uma reprodução mostrar que é a causa; a investigação por leitura de código não a confirmou.

## Testing Decisions
- Um bom teste verifica comportamento externo: o que o usuário veria ou o que ficou gravado, não detalhes internos.
- Seams: (a) sessões gerenciadas e roster, com dependências injetadas; (b) normalizador, reducer e tick do daemon, com `now` injetado; (c) máquina de estados e layout do personagem na web, só para o item condicional. Não há seam novo.
- Cobertura mínima:
  - roster legado sem o indicador não reabre;
  - entrada encerrada pelo usuário não reabre;
  - encerramento do app preserva a reabertura das abertas;
  - saída inesperada do terminal encerra a sessão;
  - hook tardio de sessão desconhecida não cria sessão;
  - horário corrompido não impede a expiração.
- Precedentes: testes existentes de sessões gerenciadas, de roster, de liveness do daemon, de hooks do normalizador e de layout/caráter na web.

## Out of Scope
- Redesenhar o elenco, os perfis ou o Agent Bus.
- Mudar o tempo de expiração das sessões (2 min ocioso, 5 min finalizado, 15 min expirado).
- Impedir a expiração de sessões vivas e ociosas; fica como discussão futura.
- Apagar automaticamente entradas do roster.
- Qualquer mudança visual do personagem.

## Further Notes
- Não reproduzimos o bug; as causas vêm da leitura do código. A verificação manual com o `rosters.json` atual do usuário, que contém o fantasma, é parte da entrega. Se o fantasma persistir após as correções, capturar o estado das sessões do daemon para identificar qual evento de início o criou antes de agir no item condicional.
- Já existe um learning sobre sessão encerrada reabrindo a cada lançamento, que deve ser atualizado em vez de criar outro.
