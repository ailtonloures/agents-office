---
title: Perfis de agente e sessões gerenciadas
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-11
related: [desktop-terminal-sessions.prd.md, agents-office.prd.md]
depends_on: [desktop-terminal-sessions.prd.md]
---

# PRD: Perfis de agente e sessões gerenciadas

> Primeiro de cinco PRDs inspirados no Maestri: [comunicacao-entre-agentes](comunicacao-entre-agentes.prd.md), [orquestrador-de-agentes](orquestrador-de-agentes.prd.md), [quadro-excalidraw](quadro-excalidraw.prd.md) e [navegador-embutido](navegador-embutido.prd.md) dependem deste.

## Problem Statement

Hoje todo avatar de nível "sessão" é um Tech Lead genérico: o escritório só reflete o que o Claude Code grava em transcript. O usuário não consegue criar agentes com papel, nome, aparência e instruções próprias, nem reaproveitar esses agentes em outros projetos. Ao fechar e reabrir o app, nada do "time" do projeto é lembrado: é preciso abrir cada terminal e repetir as instruções à mão.

## Solution

O usuário cria **perfis de agente** numa biblioteca global (nome, aparência do avatar, instruções, modo de permissão, modelo opcional). Cada projeto tem um **elenco**: a lista de perfis ativos naquele projeto. Cada perfil do elenco roda numa **sessão `claude` gerenciada** pelo app, com terminal próprio, com as instruções já injetadas, e aparece no escritório com o nome e a aparência do perfil. Ao reabrir o app, as sessões gerenciadas do elenco reabrem sozinhas, do zero. O Tech Lead passa a ser o perfil padrão embutido. Sessões abertas fora do app continuam somente leitura, como hoje.

## User Stories

1. Como desenvolvedor, quero criar um perfil de agente com nome, aparência e instruções, para ter colegas especializados (Designer, Revisor, Pesquisador…).
2. Como desenvolvedor, quero escolher a roupa/acessório base, o cabelo e as cores (cabelo, pele, roupa) do avatar do perfil, para reconhecê-lo no escritório.
3. Como desenvolvedor, quero um botão "sortear aparência", para criar perfis rápido.
4. Como desenvolvedor, quero ver o avatar do perfil ao vivo no formulário, para saber como ele ficará.
5. Como desenvolvedor, quero escrever as instruções do perfil em texto livre (Markdown), para dizer como ele deve se comportar.
6. Como desenvolvedor, quero definir o modo de permissão padrão do perfil, para que um Revisor rode em `plan` e um Desenvolvedor em `default`.
7. Como desenvolvedor, quero opcionalmente definir o modelo do perfil, para usar um modelo mais barato em tarefas simples.
8. Como desenvolvedor, quero que os perfis fiquem numa biblioteca global, para reaproveitá-los em outros projetos e sessões.
9. Como desenvolvedor, quero editar um perfil e ver a mudança valer em todos os projetos, para manter um só lugar de verdade.
10. Como desenvolvedor, quero duplicar um perfil, para criar variações sem recomeçar.
11. Como desenvolvedor, quero apagar um perfil da biblioteca, com aviso dos projetos que o usam, para não quebrar elencos sem querer.
12. Como desenvolvedor, quero que o Tech Lead exista como perfil padrão editável e não apagável, para ajustar suas instruções sem perder o comportamento de hoje.
13. Como desenvolvedor, quero montar o elenco de cada projeto escolhendo perfis da biblioteca, para que cada projeto tenha só os agentes de que precisa.
14. Como desenvolvedor, quero adicionar e remover perfis do elenco a qualquer momento, para ajustar o time durante o trabalho.
15. Como desenvolvedor, quero que cada perfil do elenco tenha um terminal próprio numa aba do dock, para acompanhar cada agente separadamente.
16. Como desenvolvedor, quero que as instruções do perfil já estejam injetadas quando o terminal abre, para não digitá-las.
17. Como desenvolvedor, quero que o título da aba mostre o nome do perfil, para distinguir os terminais.
18. Como desenvolvedor, quero ver no escritório o avatar do perfil com o nome e a aparência escolhidos, para que o escritório reflita o meu time.
19. Como desenvolvedor, quero que o avatar de um perfil sem sessão ativa apareça como "ausente" ou escondido, para não confundir com um agente trabalhando.
20. Como desenvolvedor, quero iniciar e encerrar a sessão de cada perfil individualmente, para controlar custo.
21. Como desenvolvedor, quero que, ao reabrir o app, as sessões gerenciadas do elenco reabram sozinhas, para não recriar o time a cada manhã.
22. Como desenvolvedor, quero que a reabertura seja sempre do zero (sem `--resume`), para ter um contexto limpo e previsível.
23. Como desenvolvedor, quero que o agente receba na reabertura suas notas anteriores, para retomar o fio do trabalho mesmo sem memória da conversa.
24. Como agente, quero uma ferramenta `save_notes` para gravar o que preciso lembrar na próxima abertura, para manter continuidade.
25. Como desenvolvedor, quero ver e editar as notas de cada agente, para corrigir o que ele "lembra".
26. Como desenvolvedor, quero que a reabertura automática respeite o limite de sessões simultâneas do app e avise quando algo não abrir, para não ser surpreendido.
27. Como desenvolvedor, quero poder desligar a reabertura automática por projeto, para controlar quando o time acorda.
28. Como desenvolvedor, quero que sessões abertas fora do app continuem aparecendo como hoje e sejam somente leitura, para que o app não mexa no que não gerencia.
29. Como desenvolvedor, quero distinguir visualmente agentes gerenciados de externos, para saber em quais posso interferir.
30. Como desenvolvedor, quero que as instruções do perfil sejam somadas ao `CLAUDE.md` do projeto (e não o substituam), para manter as regras do repositório.
31. Como desenvolvedor, quero que um erro ao abrir uma sessão gerenciada (claude ausente, pasta inválida) apareça com mensagem clara na aba, para saber o que corrigir.
32. Como desenvolvedor, quero que perfis e elenco sobrevivam a atualizações do app, para não perder configuração.

## Implementation Decisions

- **Perfil gerenciado = sessão `claude` própria.** Cada perfil do elenco lança o seu `claude` num PTY; o avatar do perfil é o "dono" da sessão, como o Tech Lead hoje. O Tech Lead vira o perfil padrão embutido (editável, não apagável).
- **Persistência em duas camadas.** Biblioteca global em arquivos JSON na pasta de dados do app (um arquivo por perfil, escrita atômica como o `AppConfigStore`). O elenco de cada projeto fica na configuração do app, indexado pelo caminho do projeto, e guarda só referências a perfis, o estado de reabertura automática e as notas por agente. Sem arquivos dentro do repositório do usuário.
- **Campos do perfil:** id estável, nome, descrição curta, aparência (base visual entre as profissões existentes, índice de cabelo, cores de cabelo/pele/roupa), instruções (Markdown), modo de permissão padrão, modelo opcional, papel (`padrao` | `orquestrador`; o papel orquestrador é usado pelo PRD de orquestrador). Contratos validados com zod no pacote compartilhado, como os demais contratos desktop.
- **Agent Bus no processo principal do Electron.** O PTY e, depois, o navegador vivem no processo principal; o daemon é passivo (transcripts e hooks). Por isso o servidor MCP local que expõe as ferramentas dos agentes ("Agent Bus") roda no processo principal, escuta só em loopback, com um token por sessão. O daemon não participa do roteamento.
- **Injeção na abertura.** O `SessionManager` ganha parâmetros para anexar as instruções ao prompt de sistema (`--append-system-prompt`), apontar o MCP do Agent Bus (`--mcp-config`) e definir modelo. Além disso, ele grava o id do perfil e do projeto no ambiente da sessão. As instruções são somadas ao `CLAUDE.md`, nunca o substituem.
- **Contexto injetado:** instruções do perfil, nome, notas anteriores do agente e, quando existirem (PRDs seguintes), as conexões e o orquestrador. Texto de outros agentes e de páginas chega sempre rotulado como dado.
- **Reabertura automática do zero.** Ao iniciar, para cada projeto com reabertura ligada, o app lança as sessões do elenco sem `--resume`. A reabertura respeita o limite de sessões simultâneas (hoje 12) e reporta as que falharam.
- **Ferramenta `save_notes`.** Exposta pelo Agent Bus; grava as notas do agente (texto limitado em tamanho) no elenco do projeto. As notas são injetadas na próxima abertura.
- **Vínculo avatar ↔ sessão.** O reducer/cena associa a sessão ao perfil pelo id passado no ambiente e pelo id do terminal já existente (`AGENTS_OFFICE_TERMINAL_ID`), de modo que o avatar usa nome e aparência do perfil. Sessões sem vínculo continuam sendo tratadas como externas (somente leitura).
- **Aparência.** O gerador de personagens passa a aceitar aparência explícita (base, cabelo, paleta) em vez de derivá-la só do hash do nome; o hash segue como padrão quando nada é escolhido. Nenhum sprite novo.
- **UI.** Painel "Elenco" por projeto (lista de perfis ativos, iniciar/encerrar, reabertura automática) e editor de perfil com pré-visualização ao vivo, na mesma linguagem visual dos modais existentes. O editor e o painel de biblioteca seguem o estilo de `projectPicker`/`settingsPanel`.
- **Plataformas:** Linux e macOS, como o resto do desktop.

## Testing Decisions

- Um bom teste verifica comportamento externo (o que é gravado, quais argumentos o `claude` recebe, o que o avatar mostra), não detalhes internos.
- Módulos testados: schemas do perfil/elenco (válidos, inválidos, limites); biblioteca e elenco (CRUD, escrita atômica, arquivo corrompido, migração); montagem de argumentos/ambiente do `SessionManager` com `spawn` falso; Agent Bus (autenticação por token, `save_notes`); reabertura automática (ordem, limite, falhas); mapeamento perfil → aparência no gerador de personagens.
- Arte prévia: `sessionManager` com PTY falso, `appConfig`, `projectCatalog` e testes de `characterFactory`/`appearance` do pacote web; E2E de desktop existente (`packages/desktop/e2e`) para o fluxo de criar perfil e reabrir o app.

## Out of Scope

- Comunicação entre agentes, orquestração, quadro e navegador (PRDs próprios).
- Perfis versionados dentro do repositório do projeto.
- Sprites enviados pelo usuário.
- Retomar a conversa anterior (`--resume`) na reabertura automática.
- Windows.
- Gerenciar ou injetar contexto em sessões abertas fora do app.

## Further Notes

- Inspiração: Maestri (perfis/agents no canvas). A diferença aqui é que o "canvas" é o escritório pixel-art.
- Este PRD entrega também a infraestrutura do Agent Bus, usada por todos os outros PRDs.
