---
title: Documentação dedicada do projeto e CLAUDE.md
status: ready-for-agent
labels: [ready-for-agent, needs-spec]
created: 2026-10-12
related: [auto-update-releases.prd.md]
---

# PRD: Documentação dedicada do projeto e CLAUDE.md

## Problem Statement
Todo o conhecimento do projeto está concentrado no README.md, que mistura apresentação do produto, execução local, perfis, processo de release e checagens. Quem quer instalar o app não encontra um caminho claro, e quem quer contribuir não encontra arquitetura nem design. A instalação não aponta para as releases do GitHub, o macOS não é mencionado e a release publicada pelo CI só contém o Linux. Também não existe um CLAUDE.md, então agentes não conhecem as regras de arquitetura do projeto e repetem erros já registrados nos learnings.

## Solution
O README passa a ser a página comercial do produto: o que é, como instalar oficialmente no Linux e no macOS seguindo a release do GitHub, e links para a documentação. Três documentos na raiz cobrem o resto: DEVELOPMENT.md (o básico para rodar o projeto), DESIGN.md (design, layout e jogo) e ARCHITECTURE.md (arquitetura e fluxo de comunicação). Um CLAUDE.md na raiz resume as regras de arquitetura e convenções. O workflow de release passa a anexar também o instalador do macOS, para que a instrução de instalação seja verdadeira. Todo o texto é em inglês.

## User Stories
1. Como visitante do repositório, quero entender o produto no README, para decidir se vale instalar.
2. Como usuário Linux, quero baixar o AppImage da última release, para instalar sem compilar nada.
3. Como usuário Linux, quero saber que o app se atualiza sozinho, para não me preocupar com versões.
4. Como usuário macOS, quero baixar o .dmg da última release, para instalar sem compilar nada.
5. Como usuário macOS, quero saber por que o app não é assinado e como abri-lo, para superar o aviso do Gatekeeper.
6. Como usuário macOS, quero saber que as atualizações são manuais, para não esperar um banner.
7. Como usuário, quero um link direto para a página de releases, para achar a versão mais recente.
8. Como usuário, quero saber como instalar os hooks opcionais do Claude Code, para ter atualizações instantâneas.
9. Como leitor do README, quero links claros para os documentos de desenvolvimento, design e arquitetura, para aprofundar sem ler tudo.
10. Como contribuidor, quero saber os pré-requisitos (Node, pnpm, toolchain do node-pty), para preparar a máquina.
11. Como contribuidor, quero instalar, buildar e executar tudo com `pnpm dev`, para começar rápido.
12. Como contribuidor, quero saber como rodar lint, typecheck e testes, para validar minha mudança.
13. Como mantenedor, quero o processo de release documentado (versão, tag, push, recuperação de falha), para publicar sem depender de memória.
14. Como mantenedor, quero que a release publique Linux e macOS pelo mesmo fluxo, para não montar o macOS à mão.
15. Como designer, quero entender o layout procedural das salas, para propor mudanças que respeitem o gerador.
16. Como artista, quero saber como a skin é gerada e licenciada, para editar o gerador em vez dos PNGs.
17. Como desenvolvedor de jogo, quero entender personagens, estados, mesas e visitas, para mexer no comportamento com segurança.
18. Como desenvolvedor de UI, quero conhecer as convenções de painéis, botões, zoom e camada de UI, para não quebrar o layout.
19. Como desenvolvedor, quero ver os pacotes e suas dependências, para saber onde cada mudança entra.
20. Como desenvolvedor, quero entender o fluxo transcript → daemon → WebSocket → web, para depurar eventos.
21. Como desenvolvedor, quero entender hooks, permissões e terminais, para não reintroduzir premissas já refutadas.
22. Como desenvolvedor, quero entender Agent Bus, mensagens, disjuntor e aprovações de spawn, para estender a comunicação entre agentes.
23. Como desenvolvedor, quero ver o fluxo de release e auto-update, para entender as limitações por plataforma.
24. Como revisor de segurança, quero ver as garantias de segurança em um só lugar, para auditar o projeto.
25. Como agente de IA, quero um CLAUDE.md com as regras de arquitetura, para seguir o padrão do projeto sem reaprender.
26. Como agente de IA, quero as regras de UI e de jogo, para não usar dimensões fixas nem editar PNGs gerados.
27. Como agente de IA, quero as convenções de estilo, testes e commits, para entregar código consistente.
28. Como agente de IA, quero o fluxo de PRDs, specs e learnings, para registrar o trabalho no lugar certo.
29. Como mantenedor, quero que todo caminho, script e link citado exista, para que a documentação não envelheça de imediato.

## Implementation Decisions
- Cinco entregas independentes na raiz do repositório: README, DEVELOPMENT, DESIGN, ARCHITECTURE e CLAUDE.md, mais uma alteração no workflow de release.
- Todo o texto novo é em inglês. A UI do app continua em pt-BR. Specs, PRDs e learnings continuam em pt-BR.
- O workflow de release ganha um job de macOS que roda depois do job de Linux, para que a release já exista. O job repete a verificação de versão contra a tag, instala, builda, prepara o daemon e empacota o .dmg sem assinatura. A publicação usa o mesmo mecanismo do Linux.
- O auto-update continua exclusivo do AppImage Linux. Os metadados de update do macOS podem ser publicados, mas o código não os usa. A documentação deve dizer isso.
- O README mantém cabeçalho, ideia do produto, resumo de perfis/elenco e licença. Perde os comandos de desenvolvimento, o processo de release e o roteiro manual de teste do updater, que migram para DEVELOPMENT.md.
- O DEVELOPMENT.md fica no básico: pré-requisitos, `pnpm install`, `pnpm build`, `pnpm dev` (sobe daemon, web e desktop), checagens e o processo de release do mantenedor.
- O DESIGN.md descreve viewport e zoom inteiro, layout procedural, props, portas, iluminação, personagens, máquina de estados, destaque do Tech Lead, profundidade, skin, convenções de UI e controles. O navegador embutido aparece como planejado.
- O ARCHITECTURE.md descreve pacotes, processos, contratos compartilhados e os fluxos ponta a ponta com diagramas, além das garantias de segurança.
- O CLAUDE.md é conciso e normativo: mapa do projeto, regras de arquitetura, regras de jogo e UI, estilo, testes, fluxo `.claude/` e idioma. Não inclui regras específicas de ambiente, como trailers de co-autoria.
- Nenhum documento cita número de linha. Caminhos de arquivo só aparecem onde ajudam a navegação.

## Testing Decisions
- Documentação não tem comportamento em tempo de execução, então um bom teste verifica fatos observáveis: todo caminho, script `pnpm` e link citado existe, e os comandos documentados funcionam.
- Verificação por documento: conferir scripts contra os `package.json`, conferir links relativos e rodar `pnpm install && pnpm build` e `pnpm dev` como descrito em DEVELOPMENT.md.
- `pnpm lint` roda, embora o Biome ignore Markdown.
- O workflow é validado por parse de YAML (ou actionlint, se disponível). O job de macOS só é testado de verdade no primeiro push de tag, e isso deve ficar explícito.
- Precedente: a spec 060 já definiu verificação manual ponta a ponta para o processo de release.

## Out of Scope
- Assinatura e notarização do app no macOS.
- Auto-update no macOS e no .deb.
- Publicar o .deb na release.
- Traduzir a UI ou os materiais em `.claude/`.
- Documentar o navegador embutido além de marcá-lo como planejado.
- Gerar documentação de API a partir do código.
- Publicar a primeira release (tag).

## Further Notes
- Ainda não existe nenhuma tag, então os links de download dependem da primeira release.
- O README do pacote da CLI é uma cópia gerada do README da raiz no `prepack` e não deve ser editado.
- Os learnings existentes (`auto-update-release`, `permission-hook-and-pty`, `office-visuals` e outros) são a fonte das armadilhas que o CLAUDE.md e o DESIGN.md devem registrar.
