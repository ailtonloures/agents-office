---
title: Agents Office: escritório pixel art sincronizado com agentes do Claude Code
status: ready-for-agent
labels: [ready-for-agent]
created: 2026-10-10
---

# PRD: Agents Office

## Problem Statement

Quem usa o Claude Code de forma intensa costuma ter várias sessões abertas em projetos diferentes, e cada sessão cria subagentes (Explore, Plan, general-purpose, agentes customizados) que rodam em paralelo ou em background. Hoje não há uma forma visual e imediata de responder perguntas como: quantos agentes estão trabalhando agora? Em qual projeto? O que cada um está fazendo? Quem está travado esperando minha permissão? Quem terminou? A informação existe espalhada em terminais e arquivos de transcript, mas acompanhá-la exige atenção constante e não é nada divertido.

## Solution

O Agents Office é um escritório interativo em pixel art no estilo Pokémon de Game Boy Color/GBA, aberto no navegador com um único comando (`npx agents-office`). Cada projeto onde o Claude Code está ativo vira uma sala do prédio. Cada sessão vira um **Tech Lead** sentado à sua mesa. Cada subagente criado vira um **funcionário** com profissão de TI (Analista, Arquiteto, Dev, QA, Suporte), que entra pela porta, ocupa uma baia, anima conforme a ferramenta em uso (digitando, lendo papéis, no rack de servidores, ao telefone), leva o relatório ao Tech Lead ao terminar e sai do escritório. O usuário controla um avatar próprio com as setas, conversa com qualquer funcionário (botão A) e lê numa caixa de diálogo a tarefa, a ferramenta atual, os últimos passos e o consumo de tokens. Tudo funciona de forma passiva, lendo os transcripts do Claude Code. Hooks opcionais deixam a sincronização instantânea e mostram quando um agente está aguardando o usuário.

## User Stories

### Inicialização e instalação
1. Como desenvolvedor, quero rodar `npx agents-office` e ver o escritório abrir no navegador, para começar sem nenhuma configuração.
2. Como desenvolvedor, quero que o escritório funcione sem instalar hooks, para experimentar sem mexer nas minhas configurações do Claude Code.
3. Como desenvolvedor, quero rodar `agents-office hooks install` para ativar a sincronização em tempo real, para ver eventos instantaneamente.
4. Como desenvolvedor, quero que a instalação de hooks preserve meus hooks e configurações existentes, para não quebrar meu setup.
5. Como desenvolvedor, quero que a instalação de hooks crie um backup do settings.json, para poder restaurar se algo der errado.
6. Como desenvolvedor, quero rodar `agents-office hooks uninstall` e voltar ao settings.json exatamente como era, para remover a ferramenta sem resíduos.
7. Como desenvolvedor, quero rodar `agents-office hooks status`, para saber se os hooks estão instalados e se o daemon está recebendo eventos.
8. Como desenvolvedor, quero que o hook nunca bloqueie nem falhe minha sessão do Claude Code, mesmo com o daemon desligado, para que a visualização jamais atrapalhe o trabalho.
9. Como desenvolvedor, quero escolher a porta e o diretório de projetos por flag ou variável de ambiente, para evitar conflitos e suportar setups diferentes.
10. Como desenvolvedor, quero que o servidor escute apenas em localhost, para que o conteúdo dos meus transcripts não fique exposto na rede.

### Mundo e salas
11. Como desenvolvedor, quero que cada projeto com atividade recente apareça como uma sala nomeada, para saber onde cada agente está trabalhando.
12. Como desenvolvedor, quero que salas surjam quando um projeto ganha atividade e sumam quando ficam inativas, para que o prédio reflita só o que importa agora.
13. Como desenvolvedor, quero que salas cresçam quando há mais funcionários do que baias, para nunca ter agentes sem lugar.
14. Como desenvolvedor, quero ver uma placa com o nome do projeto na porta de cada sala, para me orientar.
15. Como desenvolvedor, quero que, ao abrir, o escritório carregue só as sessões com atividade nos últimos ~15 minutos (configurável), para não lotar o prédio com histórico antigo.
16. Como desenvolvedor, quero uma visão em resolução baixa (320x180) escalada em múltiplos inteiros, para manter os pixels nítidos em qualquer tela.

### Personagens e ciclo de vida
17. Como desenvolvedor, quero que cada sessão do Claude Code apareça como um Tech Lead sentado na mesa principal da sala, para identificar a sessão-mãe.
18. Como desenvolvedor, quero que cada subagente criado apareça como um novo funcionário entrando pela porta, para perceber visualmente que um agente foi escalado.
19. Como desenvolvedor, quero que o funcionário caminhe até uma baia livre perto do seu Tech Lead, para entender a hierarquia.
20. Como desenvolvedor, quero que subagentes aninhados (spawnDepth > 1) fiquem perto do agente que os criou, para ver a cadeia de delegação.
21. Como desenvolvedor, quero que a profissão do personagem venha do tipo de agente (Explore = Analista, Plan = Arquiteto, general-purpose = Dev, revisores e juízes = QA, guia = Suporte), para reconhecer o papel de relance.
22. Como desenvolvedor, quero que agentes customizados ganhem profissão por palavras-chave do nome, com Dev como padrão, para que todo agente tenha uma aparência coerente.
23. Como desenvolvedor, quero sobrescrever o mapeamento de profissões num arquivo de configuração, para adaptar aos meus agentes.
24. Como desenvolvedor, quero que cada personagem tenha uma aparência única e estável (cores de cabelo, pele e roupa derivadas do id), para distinguir dois agentes da mesma profissão.
25. Como desenvolvedor, quero que, ao terminar, o funcionário caminhe até o Tech Lead para entregar o relatório e depois saia pela porta, para ver claramente que a tarefa foi concluída.
26. Como desenvolvedor, quero que a baia fique livre depois que o funcionário sair, para reaproveitar o espaço.
27. Como desenvolvedor, quero que um Tech Lead ocioso há algum tempo durma ("Zzz"), para saber que a sessão está parada.
28. Como desenvolvedor, quero que o Tech Lead saia do escritório quando a sessão terminar ou expirar por inatividade, para que o prédio reflita só sessões vivas.

### Animações de atividade
29. Como desenvolvedor, quero ver um balão "…" quando o agente está pensando, para saber que ele está gerando resposta.
30. Como desenvolvedor, quero ver o personagem digitando quando ele usa Edit/Write, para saber que está alterando código.
31. Como desenvolvedor, quero ver o personagem lendo papéis quando ele usa Read/Grep/Glob, para saber que está investigando.
32. Como desenvolvedor, quero ver o personagem no rack de servidores quando ele usa Bash, para saber que está executando comandos.
33. Como desenvolvedor, quero ver o personagem ao telefone ou na janela quando ele usa WebFetch/WebSearch, para saber que está pesquisando na web.
34. Como desenvolvedor, quero que o Tech Lead vá até a porta "chamar" alguém quando usa a ferramenta Agent, para conectar a criação ao novo funcionário que entra.
35. Como desenvolvedor, quero ver um "!" amarelo sobre o personagem quando ele aguarda minha permissão ou resposta, para agir rápido.
36. Como desenvolvedor, quero ver uma gota vermelha quando uma ferramenta falha, para notar problemas.
37. Como desenvolvedor, quero que as animações reflitam a atividade em até ~1s com hooks e em até ~2s sem hooks, para sentir a sincronia.

### Interação
38. Como desenvolvedor, quero controlar um avatar com as setas/WASD, para explorar o escritório como num jogo Pokémon.
39. Como desenvolvedor, quero que meu avatar colida com móveis e paredes, para preservar a sensação de mundo.
40. Como desenvolvedor, quero apertar A/Enter de frente para um personagem e abrir uma caixa de diálogo estilo Pokémon, para inspecionar o agente.
41. Como desenvolvedor, quero que o diálogo mostre profissão, tipo de agente, descrição da tarefa, ferramenta atual, últimos 5 passos, tempo ativo e tokens, para entender o trabalho sem abrir o terminal.
42. Como desenvolvedor, quero que o diálogo do Tech Lead mostre projeto, sessão, último prompt resumido e lista de subordinados, para entender a sessão inteira.
43. Como desenvolvedor, quero avançar e fechar o diálogo com A/B, para manter a experiência de jogo.
44. Como desenvolvedor, quero clicar num personagem com o mouse como alternativa, para inspecionar rápido.
45. Como desenvolvedor, quero um HUD com o total de sessões, agentes ativos e agentes aguardando, para ter a visão geral.
46. Como desenvolvedor, quero que a câmera siga meu avatar e que eu possa pular para a sala com atividade mais recente, para não me perder no prédio.
47. Como desenvolvedor, quero que o escritório reconecte sozinho ao daemon caso a conexão caia, para deixá-lo aberto num segundo monitor.

### Histórico e skins
48. Como desenvolvedor, quero um mural "Hall da Fama" com os últimos funcionários que concluíram tarefas, para rever o que aconteceu.
49. Como desenvolvedor, quero carregar um skin pack (tiles e camadas de personagens) de uma pasta local, para usar assets que comprei e que não podem ser redistribuídos.
50. Como mantenedor open source, quero que o repositório traga apenas um skin padrão CC0, para distribuir sem problemas de licença.
51. Como desenvolvedor, quero (numa fase futura) reproduzir uma sessão antiga em 1x/4x/16x, para revisar como uma tarefa foi executada.

## Implementation Decisions

### Módulos
- **shared**: define os tipos canônicos `OfficeEvent` e `OfficeModel` com schemas de validação. É o contrato entre daemon e web.
- **daemon** (Node + TypeScript), com os módulos:
  - **TranscriptWatcher**: observa o diretório de projetos do Claude Code, faz tail incremental por offset de cada JSONL de sessão e de subagente e lê os `.meta.json` dos subagentes.
  - **HookReceiver**: endpoint HTTP local que recebe os payloads dos hooks.
  - **Normalizer**: módulo profundo e puro que converte linhas JSONL e payloads de hook em `OfficeEvent`, com deduplicação por `tool_use_id` e `uuid`.
  - **OfficeModelReducer**: aplica eventos ao modelo (Projects → Sessions → Agents) de forma pura e determinística, o que habilita o replay futuro.
  - **LivenessClock**: emite eventos derivados de tempo (idle, expired) a partir do relógio e da última atividade.
  - **StreamServer**: WebSocket que manda snapshot ao conectar e depois deltas.
  - **CLI**: comandos `start`, `hook` (lê o stdin e faz POST com timeout curto, sempre exit 0) e `hooks install|uninstall|status`.
  - **SettingsMerger**: merge e unmerge idempotente e reversível dos hooks no settings.json do usuário.
- **web** (Vite + Phaser 3), com os módulos:
  - **OfficeClient**: conexão WS com reconexão; mantém o espelho do modelo.
  - **RoomLayoutGenerator**: gera salas a partir de chunks de tiles (porta, mesa do lead, blocos de baias) conforme o número de agentes; determinístico para o mesmo input.
  - **CharacterFactory**: monta sprites em camadas (corpo, cabelo, roupa, acessório de profissão) com cores do hash do agentId.
  - **CharacterController**: máquina de estados visual de cada personagem, com pathfinding em grid.
  - **PlayerAvatar**, **DialogBox** e **HUD**.
  - **SkinLoader**: carrega `skin.json` + spritesheets do skin padrão ou de uma pasta externa.
  - **DebugState**: expõe um resumo do estado da cena (personagens, estado, sala) para testes E2E.

### Fontes de dados e correlação
- Sessões em `<projectsDir>/<cwd-slug>/<sessionId>.jsonl`; subagentes em `<sessionId>/subagents/agent-<agentId>.jsonl` (linhas com `isSidechain: true`) e `agent-<agentId>.meta.json` com `agentType`, `description`, `toolUseId` e `spawnDepth`.
- O subagente se liga ao pai pelo `toolUseId` do meta, que corresponde ao `tool_use` da ferramenta Agent no transcript pai. Sem hooks, ele termina quando aparece o `tool_result` desse `toolUseId` no pai.
- Hooks usados: SessionStart, SessionEnd, SubagentStart, SubagentStop, PreToolUse, PostToolUse, Notification, Stop e UserPromptSubmit. O payload traz `session_id` e `transcript_path` para correlacionar com os JSONL.
- O hook pode chegar antes da linha JSONL. O Normalizer aceita o primeiro e enriquece com o segundo, sem duplicar.
- O nome da sala vem do `cwd` presente nas linhas do transcript (fallback: o slug do diretório).

### Contrato de eventos (forma)
```ts
type OfficeEvent =
  | { type: 'session.started'; sessionId; projectId; cwd; ts }
  | { type: 'agent.spawned'; agentId; sessionId; parentAgentId?; agentType; description; spawnDepth; ts }
  | { type: 'tool.started'; actorId; toolUseId; tool; summary; ts }
  | { type: 'tool.finished'; actorId; toolUseId; ok: boolean; ts }
  | { type: 'actor.thinking' | 'actor.waiting' | 'actor.idle'; actorId; ts }
  | { type: 'agent.finished'; agentId; ts }
  | { type: 'session.ended'; sessionId; reason: 'hook' | 'expired'; ts }
  | { type: 'usage'; actorId; inputTokens; outputTokens; ts };
```
O ator é a sessão (Tech Lead) ou o agente. Todo evento carrega `ts` vindo da fonte, nunca do relógio de recebimento, exceto os eventos de liveness.

### Estados visuais
`spawning → thinking ↔ working(tool) → waiting | error → idle → delivering → leaving`. O mapeamento ferramenta → animação fica numa tabela configurável, com animação genérica de "trabalhando" para ferramentas desconhecidas (MCP etc.).

### Outras decisões
- Limiares padrão: idle após 2 min sem atividade, expiração da sessão após 15 min, janela de carga inicial de 15 min. Todos configuráveis.
- Privacidade: bind em 127.0.0.1, sem telemetria, UI somente leitura. O diálogo mostra resumos truncados, nunca o conteúdo completo de arquivos.
- Estilo GBC/GBA: tiles 16x16, resolução interna 320x180, escala inteira, fonte bitmap.
- Distribuição: pacote npm com o binário `agents-office`; a web é servida pelo próprio daemon como estáticos.
- Monorepo com pnpm workspaces.

## Testing Decisions

- Um bom teste exercita o comportamento externo pela seam mais alta possível, com entradas realistas (linhas JSONL e payloads de hook reais anonimizados), e afirma sobre saídas observáveis (eventos, snapshot, settings.json, estado da cena), nunca sobre detalhes internos.
- **Seam 1 (principal), daemon caixa-preta**: subir o daemon apontando para um diretório temporário; escrever JSONL sintéticos incrementalmente e fazer POST no endpoint de hook; afirmar sobre a sequência de `OfficeEvent` e o snapshot recebidos via WS. Cenários: sessão com 3 subagentes paralelos, subagente aninhado (spawnDepth 2), erro de ferramenta, hook + JSONL do mesmo evento (sem duplicata), daemon sem hooks inferindo o fim pelo `tool_result`, expiração por inatividade (relógio injetável).
- **Seam 2, Normalizer + Reducer puros**: fixtures de linhas reais → eventos esperados; sequência de eventos → modelo esperado (determinismo).
- **Seam 3, CLI de hooks**: com `HOME` temporário, rodar install → status → uninstall e afirmar que o settings.json final é idêntico ao original, que hooks preexistentes ficam preservados e que install duas vezes é idempotente; o comando `hook` com daemon desligado sai com 0 em menos de 500 ms.
- **Seam 4, web E2E (Playwright)**: daemon alimentado por fixtures → página aberta → `window.__office` reporta N personagens nos estados esperados; o diálogo abre com A e mostra a descrição da tarefa; screenshots anexados.
- Prior art: nenhum (projeto greenfield). Usar Vitest para as seams 1 a 3 e Playwright para a seam 4.

## Out of Scope

- Controlar agentes pela UI (aprovar ou negar permissões, enviar mensagens, interromper).
- Teammates remotos, cloud sessions e agentes do canvas Maestri.
- Replay com timeline (fase futura; a arquitetura já o habilita via reducer determinístico).
- App desktop (Tauri/Electron).
- Paleta DMG ou troca de paleta por shader.
- Assets pagos dentro do repositório.
- Multiusuário ou acesso remoto ao escritório.

## Further Notes

- Fases: (0) spike do parser com transcripts reais; (1) MVP ao vivo com watcher, salas, personagens, avatar e diálogo; (2) hooks + waiting, pathfinding, Zzz, entrega de relatório, Hall da Fama, skins externas, sons; (3) replay, minimapa, estatísticas e Tauri.
- O formato dos transcripts do Claude Code não é uma API pública estável. O parser deve ser tolerante (ignorar campos desconhecidos, nunca derrubar o daemon) e ter fixtures versionadas para detectar mudanças.
- Sugestão de skins pagas compatíveis: LimeZu Modern Office/Interiors (uso local apenas).
