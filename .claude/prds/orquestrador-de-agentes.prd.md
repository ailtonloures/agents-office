---
title: Orquestrador que cria agentes na hora
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [perfis-sessoes-gerenciadas.prd.md, comunicacao-entre-agentes.prd.md]
depends_on: [perfis-sessoes-gerenciadas.prd.md, comunicacao-entre-agentes.prd.md]
---

# PRD: Orquestrador que cria agentes na hora

## Problem Statement

Montar um time exige que o usuário crie cada perfil e conecte cada par à mão. Para tarefas que pedem agentes sob medida ("um agente só para migrar esse módulo"), o usuário precisaria parar, abrir o editor de perfis, escrever instruções e ligar tudo, antes de começar.

## Solution

Um perfil com papel **Orquestrador** pode, durante a conversa, **criar novos agentes com instruções personalizadas na hora**, por uma ferramenta MCP (`spawn_agent`). O novo agente nasce já conectado ao orquestrador que o criou, ganha terminal, avatar e mesa, e **fica salvo no projeto**: ao reabrir o app, ele reaparece, junto com o resto do elenco. Para manter custo e risco sob controle, cada orquestrador pode ter no máximo **2 agentes criados** ativos, e a criação pede a sua aprovação.

## User Stories

1. Como desenvolvedor, quero marcar um perfil como Orquestrador, para que ele possa criar agentes.
2. Como desenvolvedor, quero que só perfis Orquestrador tenham as ferramentas de criação, para que agentes comuns não proliferem outros.
3. Como orquestrador, quero uma ferramenta `spawn_agent(name, profession, instructions, task?)`, para criar um agente sob medida.
4. Como orquestrador, quero escolher a aparência-base (profissão visual) do novo agente, para que ele pareça com o papel.
5. Como orquestrador, quero que o novo agente receba as instruções que escrevi no prompt dele, para que ele já nasça especializado.
6. Como orquestrador, quero passar uma tarefa inicial opcional, para que o agente saiba por onde começar.
7. Como orquestrador, quero que o novo agente já esteja conectado a mim, para trocarmos mensagens sem configuração.
8. Como desenvolvedor, quero que o novo agente se conecte só ao orquestrador que o criou, para não abrir canais que eu não autorizei.
9. Como desenvolvedor, quero poder conectá-lo manualmente a outros agentes depois, para ampliar a colaboração.
10. Como desenvolvedor, quero ver um cartão de aprovação com nome, aparência e instruções antes da primeira criação, para revisar o que será criado.
11. Como desenvolvedor, quero poder aprovar, negar ou editar as instruções no cartão, para ajustar o agente.
12. Como desenvolvedor, quero marcar "permitir sem perguntar" para as próximas criações daquele orquestrador, para não ser interrompido sempre.
13. Como desenvolvedor, quero que a permissão "sem perguntar" valha só para aquele orquestrador e projeto, para não ser ampla demais.
14. Como desenvolvedor, quero que cada orquestrador tenha no máximo 2 agentes criados ativos, para limitar custo e bagunça.
15. Como orquestrador, quero receber um erro claro ao tentar passar do limite, para dispensar um agente antes.
16. Como orquestrador, quero uma ferramenta `dismiss_agent(name)` para encerrar um agente que criei, para liberar vaga.
17. Como orquestrador, quero que `dismiss_agent` só funcione nos agentes que eu criei, para não encerrar os de outros.
18. Como desenvolvedor, quero que os agentes criados fiquem salvos no elenco do projeto, para reaparecerem quando eu reabrir o app.
19. Como desenvolvedor, quero que, ao reabrir, os agentes criados voltem do zero com as instruções originais e as notas salvas, para retomar sem refazer.
20. Como desenvolvedor, quero que a tarefa original apareça no cabeçalho da aba, mas não seja reenviada, para evitar trabalho repetido.
21. Como desenvolvedor, quero um botão "Salvar como perfil" no terminal do agente criado, para promovê-lo à biblioteca global.
22. Como desenvolvedor, quero remover manualmente um agente criado do elenco, para limpar o projeto.
23. Como desenvolvedor, quero distinguir no painel Elenco os agentes criados por um orquestrador, mostrando quem os criou, para entender a hierarquia.
24. Como desenvolvedor, quero ver o novo avatar entrar no escritório e ocupar uma mesa, para acompanhar a criação.
25. Como desenvolvedor, quero que a criação respeite o limite de sessões simultâneas do app, com mensagem clara se estourar, para não travar o app.
26. Como desenvolvedor, quero que o orquestrador não consiga criar outro orquestrador, para evitar recursão.
27. Como desenvolvedor, quero que as instruções vindas do orquestrador entrem rotuladas como criadas por outro agente, para sempre saber a origem.
28. Como desenvolvedor, quero um registro do que cada orquestrador criou e encerrou, para auditoria.

## Implementation Decisions

- **Papel Orquestrador** é um campo do perfil (definido no PRD de perfis). As ferramentas `spawn_agent` e `dismiss_agent` só são expostas pelo Agent Bus a sessões cujo perfil tem esse papel; as demais não as veem.
- **`spawn_agent`:** parâmetros nome, profissão visual (entre as existentes), instruções, tarefa opcional. Valida tamanho e nome único no projeto. Cria o agente como entrada do **elenco do projeto**, com `criadoPor` apontando para o orquestrador. Não entra na biblioteca global.
- **Limite:** no máximo 2 agentes criados ativos por orquestrador (configurável por constante; revisável depois). Estourar devolve erro estruturado à ferramenta.
- **Aprovação:** a primeira criação de cada orquestrador pede aprovação por um cartão (nome, aparência, instruções, editáveis). A opção "permitir sem perguntar" é persistida por orquestrador e projeto. Reutiliza o padrão de cartão/notificação do app, sem bloquear o terminal do usuário.
- **Conexão automática:** ao criar, grava o par orquestrador↔agente no grafo de conexões. Nada além disso.
- **Persistência:** o agente criado e suas notas fazem parte do elenco do projeto e reabrem do zero na inicialização, com as instruções originais e as notas. A tarefa original fica registrada e visível, sem reenvio.
- **`dismiss_agent`:** encerra a sessão e remove o agente do elenco; só vale para agentes criados pelo próprio orquestrador. Também há remoção manual pela UI.
- **"Salvar como perfil":** copia o agente criado para a biblioteca global como perfil comum (papel padrão).
- **Sem recursão:** agentes criados nunca recebem o papel Orquestrador.
- **Auditoria:** registro de criações/encerramentos por orquestrador, visível no painel Elenco.

## Testing Decisions

- Um bom teste verifica o resultado observável: o elenco depois da chamada, o erro devolvido, o que é persistido, o que aparece na UI; não a ordem interna das chamadas.
- Módulos testados: exposição condicional das ferramentas por papel; `spawn_agent` (validação, nome duplicado, limite, aprovação negada/aprovada/"sem perguntar"); `dismiss_agent` (dono × outro); persistência e reabertura dos agentes criados; promoção a perfil global; conexão automática.
- Arte prévia: testes do Agent Bus e do elenco do PRD de perfis, e dos cartões de notificação (`notificationCenter`).

## Out of Scope

- Orquestradores criando orquestradores.
- Limites diferentes por orquestrador na interface (constante na v1).
- Criação de agentes por sessões externas.
- Reenvio automático da tarefa original.

## Further Notes

- Inspiração: skill `maestri-manager` (montar time, delegar trabalho em paralelo).
