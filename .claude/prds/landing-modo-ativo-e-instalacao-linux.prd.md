---
title: Landing - modo ativo e passivo, instalação só Linux
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-18
related: [landing-page-comercial.prd.md]
---

# PRD: Landing - modo ativo e passivo, instalação só Linux

## Problem Statement
A landing apresenta o Agents Office como um visualizador **passivo**: "lê suas sessões do Claude Code passivamente", "veja os agentes trabalhando". O produto hoje é mais completo: além de só observar, o usuário **cria perfis de agentes**, os agentes **se comunicam entre si**, há um **board Excalidraw**, é possível **abrir o terminal** dentro do app e **ver os agentes funcionando**. Quem lê a página não percebe essa parte ativa.

A página também promete **Linux e macOS**, com um `.dmg` e um comando `xattr`. A release só publica **AppImage e .deb para Linux**. Os comandos de exemplo usam `linux-x64.AppImage`, mas o arquivo real se chama `linux-x86_64.AppImage` (e o `.deb` usa `amd64`), então o comando copiado não encontra o arquivo.

## Solution
A landing passa a explicar **dois modos de uso**:
- **Passivo**: o usuário continua usando o Claude Code como sempre e o escritório apenas mostra o que acontece (transcripts, hooks opcionais).
- **Ativo**: o usuário cria perfis de agentes, monta um elenco que conversa pelo Agent Bus, desenha no board Excalidraw, abre terminais no próprio app e acompanha os agentes trabalhando.

A seção de instalação passa a mostrar apenas **Linux** (AppImage e .deb) com os nomes de arquivo corretos, e diz com clareza que macOS e Windows ainda não estão disponíveis. Os metadados de SEO acompanham. Tudo nos três idiomas (en, pt-BR, es).

## User Stories
1. Como visitante, quero entender logo no topo que o produto serve para observar e também para orquestrar agentes, para saber se ele serve ao meu caso.
2. Como visitante, quero ver a diferença entre o modo passivo e o modo ativo, para escolher como começar.
3. Como visitante curioso, quero saber que posso usar só o modo passivo sem configurar nada, para testar com baixo risco.
4. Como desenvolvedor, quero saber que posso criar perfis de agentes (nome, aparência, instruções, modelo, permissões), para montar um time reutilizável.
5. Como desenvolvedor, quero saber que os agentes se comunicam entre si, para delegar trabalho a um time.
6. Como desenvolvedor, quero saber que criar um novo agente sempre exige minha aprovação, para confiar na orquestração.
7. Como desenvolvedor, quero saber que há um board Excalidraw onde eu e os agentes desenhamos planos, para alinhar o trabalho visualmente.
8. Como desenvolvedor, quero saber que posso abrir o terminal dentro do app, para não alternar de janela.
9. Como desenvolvedor, quero ver que os agentes aparecem trabalhando no escritório, para acompanhar o que cada um faz.
10. Como visitante, quero que a seção "como funciona" mantenha o mapeamento projeto=sala, sessão=Tech Lead, subagente=funcionário, para entender a metáfora.
11. Como visitante, quero que a arquitetura explique o que é do modo passivo e o que o app desktop acrescenta, para saber o que roda onde.
12. Como visitante preocupado com segurança, quero que o texto de hooks deixe claro que são opcionais e só notificam, para não temer interferência no Claude Code.
13. Como visitante preocupado com segurança, quero continuar vendo que as aprovações negam por padrão, para confiar no modo ativo.
14. Como usuário Linux, quero ver a instalação por AppImage e por .deb, para escolher o formato da minha distribuição.
15. Como usuário Linux, quero comandos com o nome real do arquivo (`linux-x86_64.AppImage` e `linux-amd64.deb`), para copiar e executar sem ajustar.
16. Como usuário Linux, quero saber que o AppImage se atualiza sozinho e o .deb não, para decidir.
17. Como usuário de macOS ou Windows, quero uma mensagem clara de que ainda não há versão, para não perder tempo procurando.
18. Como visitante, quero que a aba CLI explique que `hooks install` é opcional e do modo passivo, para não achar que é obrigatório.
19. Como visitante de língua portuguesa ou espanhola, quero o mesmo conteúdo traduzido, para ler no meu idioma.
20. Como visitante que compartilha o link, quero título e descrição de prévia que mencionem observar e orquestrar agentes, para atrair o público certo.
21. Como mecanismo de busca, quero o `operatingSystem` do JSON-LD refletindo só Linux, para não indexar uma promessa falsa.
22. Como mantenedor, quero testes que falhem se a página voltar a citar macOS como suportado, para a promessa não divergir da release.
23. Como mantenedor, quero que o teste de paridade de i18n continue verde, para não faltar chave em nenhum idioma.
24. Como mantenedor, quero o README com o nome de arquivo correto do AppImage, para a documentação bater com a landing.
25. Como mantenedor, quero que a seção do navegador embutido continue com a marca Beta, para não prometer o que está em andamento.

## Implementation Decisions
- **Dois modos, um vocabulário**: usar "passivo" (só visualiza) e "ativo" (cria, orquestra, interage) em todos os textos e idiomas, de forma consistente.
- **Meta e hero**: título, descrição e lead cobrem observar e orquestrar. A linha de plataformas diz Linux (AppImage e .deb); Windows e macOS ainda não.
- **Como funciona**: o lead apresenta os dois modos; os cards de mapeamento permanecem; o card "Hooks são opcionais" passa a falar do modo passivo.
- **Features**: o lead e a ordem destacam o ativo (perfis e elenco, Agent Bus, board, terminais) antes da observabilidade; navegador embutido segue com selo Beta.
- **Arquitetura e segurança**: ajustar os textos de "lido passivamente" e de hooks para o contexto do modo passivo, e mencionar terminais, Agent Bus e board como a camada do app desktop. Manter a regra de aprovação que nega por padrão.
- **Instalação**: remover a aba macOS (texto e comando de quarentena). Linux traz AppImage e .deb com os nomes reais e a instrução de instalar o pacote com o gerenciador de pacotes. A aba CLI fica rotulada como opcional do modo passivo. A mensagem de indisponibilidade cobre macOS e Windows.
- **SEO**: `operatingSystem` passa a Linux e a descrição estruturada deixa de citar macOS; título e descrição de prévia acompanham a nova mensagem.
- **Sem novas imagens**: não há capturas do modo ativo; esta entrega muda só texto e estrutura. Imagens ficam para uma etapa futura.
- **Fora do pacote da landing**: corrigir o nome do arquivo no README; o trecho obsoleto de macOS na documentação de arquitetura é apenas sinalizado.

## Testing Decisions
- Um bom teste verifica o comportamento externo: o que a página e os metadados declaram, não a estrutura interna dos componentes.
- Testes de unidade (vitest) do pacote da landing: o JSON-LD declara só Linux; paridade das chaves de i18n nos três idiomas; nenhum texto de instalação cita macOS como suportado nem o nome de arquivo antigo; os comandos de instalação usam os nomes reais.
- E2E (Playwright, projeto da landing) atualizado para os novos títulos por idioma e para a aba de instalação sem macOS.
- Arte anterior: testes existentes de SEO, i18n, configuração e o e2e da landing.
- Copy puramente textual não tem teste direto de conteúdo além das invariantes acima; isso será dito na entrega.

## Out of Scope
- Capturas de tela, vídeos ou animações do modo ativo.
- Suporte real a macOS ou Windows, ou mudanças no pipeline de release.
- Correção da documentação de arquitetura sobre macOS (apenas sinalizar).
- Novas seções, redesenho visual ou novos idiomas.

## Further Notes
- Os arquivos reais da release seguem `agents-office-<versão>-linux-x86_64.AppImage` e `agents-office-<versão>-linux-amd64.deb`.
- A landing é independente do app; o pacote não importa código dos outros pacotes.
