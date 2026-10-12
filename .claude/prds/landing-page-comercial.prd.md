---
title: Landing page comercial do Agents Office
status: ready-for-agent
labels: [ready-for-agent]
created: 2026-10-12
related: [documentacao-do-projeto.prd.md, locale-seletor-de-idioma.prd.md]
---

# PRD: Landing page comercial do Agents Office

## Problem Statement
O Agents Office é um projeto open source (MIT) que espelha a atividade do Claude Code como um escritório pixel art, mas não tem vitrine pública. Quem chega pelo repositório vê só texto e uma captura de tela, sem entender rápido o que o produto faz, por que é diferente e como instalar. Desenvolvedores que usam Claude Code com vários agentes não têm um lugar que mostre o produto vivo, seus recursos (terminais, perfis de agentes, comunicação entre agentes, quadro) e a garantia de que tudo roda localmente.

## Solution
Uma landing page profissional e elegante, publicada na Vercel, com a mesma estética da app: fundo navy, dourado, painéis e botões pixel art em relevo. O topo da página mostra um escritório pixel art animado com sprites da própria skin: o Tech Lead na mesa e subagentes entrando, sentando, trabalhando e saindo. Em seguida a página explica como funciona, apresenta os recursos (observabilidade ao vivo, terminais integrados, perfis de agentes personalizáveis, agentes que se comunicam, quadro Excalidraw, navegador embutido), resume a arquitetura, destaca segurança e privacidade, e termina com instalação e chamada para o código aberto. A página existe em inglês (padrão), português do Brasil e espanhol, com os CTAs de baixar e dar estrela no GitHub.

## User Stories
1. Como desenvolvedor que usa Claude Code, quero entender em poucos segundos o que o Agents Office faz, para decidir se vale testar.
2. Como visitante, quero ver um escritório pixel art animado logo no topo, para perceber o produto funcionando sem instalar nada.
3. Como visitante, quero um botão de baixar bem visível, para instalar o app desktop rápido.
4. Como visitante, quero um botão de dar estrela no GitHub, para apoiar o projeto e acompanhar novidades.
5. Como visitante, quero copiar o comando de instalação dos hooks com um clique, para configurar sem digitar.
6. Como visitante, quero ver como o produto funciona (projeto vira sala, sessão vira Tech Lead, subagente vira funcionário), para entender a metáfora.
7. Como desenvolvedor, quero saber que o app lê as sessões passivamente e que os hooks são opcionais, para avaliar o impacto no meu ambiente.
8. Como desenvolvedor, quero ver os status em tempo real (anel colorido e monitor), para saber como acompanho vários agentes.
9. Como desenvolvedor, quero saber que posso caminhar até um agente e ver tarefa, ferramenta e tokens, para entender o nível de detalhe.
10. Como desenvolvedor, quero saber dos alertas de agente esperando por mim, para não deixar sessões paradas.
11. Como desenvolvedor, quero ver o recurso de terminais integrados com abas e dock, para entender que posso trabalhar sem sair do app.
12. Como desenvolvedor, quero saber que o app gerencia sessões do Claude Code por mim, para não abrir terminais manualmente.
13. Como desenvolvedor, quero ver os perfis de agentes personalizáveis (nome, aparência, instruções, permissões, modelo), para montar meu elenco.
14. Como desenvolvedor, quero saber que o elenco do projeto sobe sessões já com o perfil configurado, para repetir o mesmo time em cada projeto.
15. Como desenvolvedor, quero entender que agentes conversam entre si pelo Agent Bus, para orquestrar trabalho em equipe.
16. Como desenvolvedor, quero saber que criar um novo agente exige minha aprovação, para confiar na orquestração.
17. Como desenvolvedor, quero ver o quadro Excalidraw onde agentes desenham e diagramam, para visualizar planos e arquiteturas.
18. Como desenvolvedor, quero saber do navegador embutido e das aprovações de segurança, para avaliar o uso com agentes.
19. Como visitante, quero que o navegador embutido apareça marcado como beta, para não criar expectativa errada.
20. Como visitante, quero ver quais recursos são só do app desktop, para escolher entre desktop e navegador.
21. Como desenvolvedor, quero um resumo curto da arquitetura (Claude Code, transcripts e hooks, daemon, WebSocket, cliente), para entender como funciona por dentro.
22. Como desenvolvedor, quero ver a stack (monorepo pnpm, TypeScript, Phaser, Electron, zod), para avaliar a qualidade técnica.
23. Como desenvolvedor preocupado com privacidade, quero saber que tudo roda local em 127.0.0.1 e sem telemetria, para confiar no produto.
24. Como desenvolvedor, quero saber que aprovações falham fechadas, para entender o modelo de segurança.
25. Como usuário Linux, quero instruções de AppImage e .deb, para instalar na minha distribuição.
26. Como usuário macOS, quero instruções do dmg e da nota sobre o Gatekeeper, para abrir o app sem tropeçar.
27. Como usuário Windows, quero ver claramente que ainda não há versão, para não perder tempo.
28. Como colaborador em potencial, quero ver licença MIT, repositório e documentação, para contribuir.
29. Como visitante brasileiro, quero ler a página em português, para entender sem esforço.
30. Como visitante hispanofalante, quero ler a página em espanhol, para entender sem esforço.
31. Como visitante, quero que o idioma seja detectado pelo navegador e que eu possa trocá-lo, para ler no meu idioma.
32. Como visitante, quero que a escolha de idioma seja lembrada, para não repetir a escolha.
33. Como visitante no celular, quero a página legível e sem rolagem horizontal, para navegar de qualquer aparelho.
34. Como visitante com sensibilidade a movimento, quero que as animações respeitem a preferência do sistema, para não me incomodar.
35. Como usuário de teclado e de leitor de tela, quero marcos semânticos, link de pular conteúdo e foco visível, para navegar sem mouse.
36. Como visitante, quero que a página carregue rápido, para não desistir antes de ver o escritório.
37. Como pessoa que compartilha o link, quero uma prévia com título, descrição e imagem nas redes, para atrair mais gente.
38. Como motor de busca, quero metadados e dados estruturados do software, para indexar a página corretamente.
39. Como mantenedor, quero que a landing viva no monorepo sem interferir no app, no CLI publicado nem no teste de licenças das skins, para manter o repositório saudável.
40. Como mantenedor, quero publicar a página na Vercel a partir do monorepo com comandos documentados, para repetir o deploy sem surpresa.
41. Como mantenedor, quero que os textos fiquem em dicionários tipados com teste de paridade, para não esquecer traduções.
42. Como mantenedor, quero que a lógica da cena animada seja pura e testável, para validá-la sem navegador.
43. Como mantenedor, quero que os sprites copiados tenham licença CC0 declarada, para respeitar a regra de assets do projeto.
44. Como mantenedor, quero que o link de download aponte para a última release, para não atualizar a página a cada versão.

## Implementation Decisions
- Novo pacote privado de workspace para a landing, na mesma toolchain do cliente web: Vite, React 19, TypeScript estrito, dependências com versões exatas, scripts de desenvolvimento, build, preview, typecheck e teste com os mesmos nomes dos demais pacotes. Entra automaticamente nos fluxos de CI. Não é dependência do pacote CLI publicado.
- Página única, estática, só dark, herdando os tokens da app: fundo navy com gradiente radial, painéis escuros, ouro como acento, texto creme, foco azul claro e brilho violeta. Cada recurso usa a cor do papel correspondente (Tech Lead, Analyst, Architect, Developer, QA, Support) como acento.
- Botões e painéis replicam o visual em relevo dos botões da app: borda dourada de 2px, sem arredondamento, sombra sólida e deslocamento ao pressionar.
- Tipografia: fonte pixel de licença livre hospedada localmente só em títulos curtos; monoespaçada do sistema para trechos de código; fonte do sistema para parágrafos longos, por legibilidade.
- Hero animado em canvas 2D com sprites fatiados do tileset, props e personagens da skin padrão, copiados para a pasta pública da própria landing, sem tocar nos assets do cliente web. Zoom inteiro, renderização pixelada, pausa fora da viewport e quadro estático quando o usuário prefere menos movimento.
- A lógica da cena (agendamento de entradas e saídas, estados, posições, anéis de status) fica em módulo puro, separado do canvas e do DOM, com o relógio injetado, seguindo a regra de arquitetura do repositório.
- Internacionalização própria da landing, no mesmo modelo do cliente web: inglês como fonte de verdade das chaves, português e espanhol tipados contra ela, função de tradução com interpolação e fallback, idioma inicial pelo navegador, escolha persistida com tolerância a armazenamento indisponível, atributo de idioma do documento atualizado.
- Seções: navegação, hero com CTAs, como funciona, recursos (observabilidade, terminais, elenco, Agent Bus, quadro, navegador embutido), arquitetura resumida com diagrama, segurança e privacidade, instalação, código aberto e rodapé.
- Conteúdo factual vem de README, ARCHITECTURE e DESIGN. Navegador embutido aparece como beta. Recursos exclusivos do desktop levam selo "Desktop". Windows aparece como indisponível.
- CTAs: baixar aponta para a página da última release do repositório e estrela aponta para o repositório. A URL canônica do site é uma constante configurável, porque o domínio ainda não está definido.
- SEO e compartilhamento: título, descrição, Open Graph, Twitter Card, dados estruturados de software, robots e sitemap estáticos, imagem de prévia.
- Acessibilidade: marcos semânticos, link para pular ao conteúdo, foco visível, contraste AA, texto alternativo, animações respeitando a preferência de movimento reduzido.
- Deploy na Vercel a partir do monorepo: arquivo de configuração no pacote com comandos de instalação e build do workspace, diretório de saída, cache imutável para assets com hash e cabeçalhos básicos de segurança. Ao final da implementação, publicar um deploy de preview (não produção) e entregar a URL ao usuário. Promoção para produção e domínio próprio só por pedido explícito.
- Documentação: atualizar o mapa de pacotes do CLAUDE.md, o DEVELOPMENT.md (como rodar e como publicar) e o ARCHITECTURE.md; registrar aprendizados em pt-BR em `.claude/learnings`.

## Testing Decisions
- Bom teste verifica comportamento externo: o que a cena produz para um relógio dado e o que a página mostra em cada idioma, sem depender de detalhes internos do canvas.
- Seam 1 (vitest): módulo puro da cena, com relógio injetado, cobrindo ordem de entrada, permanência, saída e ciclo de estados dos agentes.
- Seam 2 (vitest): paridade de chaves de tradução entre inglês, português e espanhol, mais interpolação, fallback e armazenamento indisponível.
- Seam 3 (Playwright, sobre o build de preview): troca entre os três idiomas, cópia do comando npx, ausência de rolagem horizontal em 390px de largura e renderização do hero.
- Arte anterior: testes de lógica pura e de i18n do cliente web (zoom, locale, paridade de dicionários) e a suíte Playwright da pasta e2e.
- Verificação manual no preview: 1440, 768 e 390px, movimento reduzido, navegação por teclado e Lighthouse com meta de 95 ou mais em desempenho, acessibilidade e SEO.
- Antes de entregar: `pnpm typecheck && pnpm lint && pnpm vitest run`, e o build completo com o teste de licenças do CLI continuando verde.

## Out of Scope
- Domínio próprio, DNS e promoção para produção (apenas deploy de preview).
- Blog, documentação hospedada, changelog, páginas legais e analytics ou rastreamento de qualquer tipo.
- Formulário de contato, newsletter, preços ou fluxo comercial pago.
- Vídeos de demonstração e versão clara do tema.
- Build para Windows e qualquer mudança no app, no daemon ou no CLI.
- Workflow de deploy no repositório (a Vercel faz o build).

## Further Notes
- Ainda não existem tags de release. Confirmar que a página de releases tem um download antes de divulgar o link.
- O navegador embutido consta como em andamento na documentação, por isso o selo beta.
- Os sprites vêm do gerador de skin do cliente web, que é CC0. A landing mantém um arquivo de licenças próprio e não altera o de `packages/web/public/skins/default`.
- O texto da landing em português deve usar as mesmas palavras da interface (Elenco, Quadro, Sessões) para consistência.
