# PRD — Mesas liberadas quando o agente sai

## Problem Statement

Quando agentes e sub-agentes entram no escritório, uma mesa nasce para cada um. Mas quando eles terminam e vão embora, as mesas continuam lá. O escritório fica cheio de mesas vazias, o HUD mostra poucos agentes vivos e o usuário vê um número de mesas que não bate com a realidade. Quanto mais sub-agentes passam pelo projeto, maior fica a sala.

## Solution

A quantidade de mesas de uma sala passa a refletir apenas os agentes que ainda estão no escritório: os vivos e os que ainda estão na tela entregando o trabalho ou saindo. Assim que o personagem de um agente que terminou deixa a cena, a mesa dele some e a sala encolhe. Quem estava sentado numa mesa que desapareceu é realocado em outra mesa livre.

## User Stories

1. Como usuário, quero que a mesa de um sub-agente suma depois que ele termina e sai, para que o escritório não acumule mesas vazias.
2. Como usuário, quero que a mesa só suma depois que o personagem saiu, para que a animação de entrega e saída não quebre.
3. Como usuário, quero que o número de mesas acompanhe o número de agentes vivos mostrado no HUD, para confiar no que vejo.
4. Como usuário, quero que a sala encolha quando vários sub-agentes terminam, para que o espaço seja reaproveitado.
5. Como usuário, quero que a sala volte a crescer quando novos agentes chegam, para que cada agente tenha sua mesa.
6. Como usuário, quero que um agente ainda trabalhando nunca fique sem mesa quando outra desaparece, para que ele continue sentado em algum lugar.
7. Como usuário, quero que agentes que expiram por inatividade também liberem suas mesas, para que sessões esquecidas não ocupem espaço.
8. Como usuário, quero que uma sessão encerrada continue mantendo sua sala até todos saírem, como hoje, para não quebrar a animação de saída.
9. Como usuário, quero que o Tech Lead de cada sessão continue com sua mesa, para que a sala nunca fique sem o responsável.
10. Como usuário, quero que o layout das outras salas não se mexa quando uma sala encolhe além do necessário, para o escritório não parecer instável.
11. Como desenvolvedor, quero testes de contagem de mesas, retenção e realocação, para evitar a volta do bug.
12. Como desenvolvedor, quero um registro do aprendizado sobre status `finished` e layout, para não repetir a causa.

## Implementation Decisions

- Causa: agentes que terminam permanecem no modelo com status finalizado até o fim da sessão; o layout só ignora agentes "encerrados", status que nenhum agente recebe. A contagem de mesas nunca diminui.
- A correção fica na camada web. O modelo continua mantendo agentes finalizados, porque a animação de entrega e saída depende de ver esse status.
- A contagem de mesas por sessão considera agentes vivos mais agentes finalizados cujo personagem ainda está na cena.
- O controlador de personagens expõe o conjunto de agentes ainda em uso, ao lado do conjunto de sessões em uso que já existe.
- O construtor de entrada de layout recebe esse conjunto adicional. Sessões fantasma continuam reutilizando a última contagem conhecida.
- O layout é recalculado também quando um personagem termina de sair, não só quando o modelo muda.
- Mesas são identificadas por índice; ao encolher, some a de maior índice. Quem estava nela é realocado pela reconciliação de mesas já existente.
- Nenhuma mudança de contrato de eventos, API ou modelo compartilhado.

## Testing Decisions

- Um bom teste verifica comportamento externo (contagem de mesas, mesa atribuída), não detalhes internos.
- Construtor de entrada de layout: agente finalizado não conta; finalizado retido conta; sessão fantasma mantém a contagem; a contagem cai quando o retido é liberado.
- Reconciliação de mesas: layout que encolhe libera mesas inexistentes e realoca o agente ativo.
- E2E: simular o fim de sub-agentes, esperar o personagem sair e conferir que a quantidade de mesas diminui.
- Arte prévia: testes existentes de layout e de atribuição de mesas em web, e `office.spec.ts` para E2E.

## Out of Scope

- Remover agentes finalizados do modelo compartilhado.
- Mudar tempos de expiração de agentes ou sessões.
- Mudar a aparência das mesas ou da sala.
- Trocar identificação de mesas por índice por identificação por agente.

## Further Notes

- Este PRD complementa o fim de sessões fantasma (spec 038): lá o HUD passou a contar só atores vivos, o que deixou mais evidente que as mesas não acompanhavam.
- Um agente ativo pode andar até uma nova mesa quando a dele some; é aceito.
