import type { Messages } from './en';

export const ptBR: Messages = {
  'meta.title': 'Agents Office - seus agentes do Claude Code em um escritório pixel art',
  'meta.description':
    'O Agents Office espelha a atividade do Claude Code como um escritório pixel art ao vivo. Veja os agentes trabalhando, use terminais, orquestre um Elenco e desenhe no Quadro. Código aberto, tudo local.',

  'lang.label': 'Idioma',
  'lang.menuLabel': 'Escolha o idioma',
  'lang.footerMenuLabel': 'Escolher o idioma (rodapé)',

  'a11y.skipToContent': 'Pular para o conteúdo',
  'a11y.mainNav': 'Navegação principal',
  'a11y.heroScene':
    'Escritório pixel art animado: um Tech Lead na mesa enquanto subagentes entram, trabalham e saem.',

  'nav.how': 'Como funciona',
  'nav.features': 'Recursos',
  'nav.architecture': 'Arquitetura',
  'nav.security': 'Segurança',
  'nav.install': 'Instalar',
  'nav.menu': 'Menu',
  'nav.menuOpen': 'Abrir menu',
  'nav.menuClose': 'Fechar menu',
  'nav.home': 'Agents Office, voltar ao topo',
  'nav.github': 'GitHub',

  'hero.eyebrow': 'Código aberto - MIT',
  'hero.title': 'Seus agentes do Claude Code, trabalhando em um escritório pixel art',
  'hero.lead':
    'O Agents Office espelha o que o Claude Code está fazendo como um escritório vivo: cada projeto é uma sala, cada sessão um Tech Lead, cada subagente um funcionário na sua mesa.',
  'hero.ctaDownload': 'Baixar',
  'hero.ctaStar': 'Dar estrela no GitHub',
  'hero.note': 'Roda localmente. Sem conta, sem telemetria.',
  'hero.commandLabel': 'Opcional: instale os hooks do Claude Code para eventos instantâneos',
  'hero.platforms': 'App desktop para Linux e macOS. Windows ainda não é suportado.',
  'hero.docs': 'Ler a documentação',
  'hero.statusIdle': 'Ocioso',
  'hero.statusWorking': 'Trabalhando',
  'hero.statusWaiting': 'Esperando você',

  'how.eyebrow': 'Como funciona',
  'how.title': 'Uma metáfora que você entende de relance',
  'how.lead':
    'O Agents Office lê suas sessões do Claude Code de forma passiva e as transforma em um escritório. Nada para configurar antes de começar a acompanhar.',
  'how.project.title': 'Projeto vira sala',
  'how.project.body':
    'Cada pasta de projeto ganha a sua própria sala. Abra vários projetos e circule entre eles pelo mapa.',
  'how.session.title': 'Sessão vira Tech Lead',
  'how.session.body':
    'Cada sessão do Claude Code é um Tech Lead sentado em uma estação de trabalho, com o monitor mostrando o que ele está fazendo.',
  'how.subagent.title': 'Subagente vira funcionário',
  'how.subagent.body':
    'Quando uma sessão delega trabalho, um subagente entra, ocupa uma mesa, trabalha e sai quando termina.',
  'how.status.title': 'Status ao vivo num relance',
  'how.status.body':
    'Um anel colorido e o monitor mostram quem está trabalhando, quem está ocioso e quem está esperando por você, para nenhuma sessão ficar parada.',
  'how.inspect.title': 'Chegue perto e inspecione',
  'how.inspect.body':
    'Caminhe até qualquer agente para ver a tarefa atual, a ferramenta em uso e o consumo de tokens em um painel de detalhes.',
  'how.hooks.title': 'Os hooks são opcionais',
  'how.hooks.body':
    'Os transcripts bastam para espelhar a atividade. Instale os hooks para receber eventos mais rápidos e alertas de atenção.',

  'features.eyebrow': 'Recursos',
  'features.title': 'Tudo para conduzir muitos agentes',
  'features.lead': 'De acompanhar uma única sessão a orquestrar um time inteiro, em uma só janela.',
  'features.badge.desktop': 'Desktop',
  'features.badge.beta': 'Beta',
  'features.observability.title': 'Observabilidade ao vivo',
  'features.observability.body':
    'Veja cada sessão e cada subagente em tempo real, com anéis de status, monitores e alertas quando um agente está esperando por você.',
  'features.terminals.title': 'Terminais integrados',
  'features.terminals.body':
    'Abas e dock dentro do app. O app gerencia as Sessões do Claude Code por você, então você para de abrir terminais manualmente.',
  'features.cast.title': 'Elenco de agentes',
  'features.cast.body':
    'Personalize perfis de agentes: nome, aparência, instruções, permissões e modelo. O Elenco do projeto sobe Sessões já configuradas, o mesmo time em cada projeto.',
  'features.bus.title': 'Agent Bus',
  'features.bus.body':
    'Os agentes conversam entre si por um barramento MCP e orquestram o trabalho em equipe. Criar um novo agente sempre exige a sua aprovação.',
  'features.board.title': 'Quadro',
  'features.board.body':
    'Um Quadro Excalidraw onde os agentes desenham planos e diagramas, para você ver a arquitetura enquanto ela é desenhada.',
  'features.browser.title': 'Navegador embutido',
  'features.browser.body':
    'Um navegador dentro do app que os agentes podem usar, com aprovações de segurança antes de agir. Em andamento, por isso marcado como beta.',

  'features.points': 'Destaques',
  'features.observability.p1': 'Anel de status: trabalhando, ocioso, esperando você',
  'features.observability.p2': 'Painel de detalhes com tarefa, ferramenta e tokens',
  'features.terminals.p1': 'Abas e um dock dentro da janela',
  'features.terminals.p2': 'Sessões do Claude Code gerenciadas',
  'features.cast.p1': 'Nome, visual, instruções, permissões, modelo',
  'features.cast.p2': 'O mesmo time em todos os projetos',
  'features.bus.p1': 'Barramento MCP para mensagens entre agentes',
  'features.bus.p2': 'Criar um agente exige sua aprovação',
  'features.board.p1': 'Quadro Excalidraw para planos e diagramas',
  'features.board.p2': 'Os agentes desenham enquanto você acompanha',
  'features.browser.p1': 'Navegador dentro do app para os agentes',
  'features.browser.p2': 'Aprovações de segurança antes de agir',

  'arch.eyebrow': 'Arquitetura',
  'arch.title': 'Simples por dentro, tudo na sua máquina',
  'arch.lead':
    'Um pequeno pipeline transforma a atividade do Claude Code em eventos e os envia ao escritório.',
  'arch.diagramLabel': 'Pipeline do Claude Code até o cliente',
  'arch.step.claude': 'Claude Code',
  'arch.step.sources': 'Transcripts e hooks',
  'arch.step.daemon': 'Daemon',
  'arch.step.socket': 'WebSocket',
  'arch.step.client': 'Cliente',
  'arch.stack.title': 'Stack',
  'arch.stack.body':
    'Monorepo pnpm em TypeScript estrito, Phaser para o jogo, Electron para o shell desktop e zod em todo contrato entre pacotes.',
  'arch.reduce.title': 'Um reducer, dois lados',
  'arch.reduce.body':
    'O daemon e o cliente aplicam o mesmo reducer puro aos mesmos eventos, então seus modelos nunca divergem.',

  'arch.step.claude.desc': 'Executa sessões e subagentes',
  'arch.step.sources.desc': 'Leitura passiva, hooks opcionais',
  'arch.step.daemon.desc': 'Normaliza os eventos em um só modelo',
  'arch.step.socket.desc': 'Envia os eventos ao vivo',
  'arch.step.client.desc': 'Navegador ou janela desktop',
  'arch.desktop.title': 'Extensões do desktop',
  'arch.desktop.body':
    'O app desktop soma terminais reais, o Agent Bus entre agentes e atualizações automáticas ao mesmo pipeline.',
  'arch.desktop.pty': 'Terminais node-pty',
  'arch.desktop.bus': 'Agent Bus',
  'arch.desktop.updater': 'Atualizador',

  'security.eyebrow': 'Segurança e privacidade',
  'security.title': 'Local primeiro, fechado por padrão',
  'security.lead': 'Seu código e suas sessões ficam no seu computador.',
  'security.local.title': 'Apenas local',
  'security.local.body':
    'O daemon e o Agent Bus escutam apenas em 127.0.0.1. A janela carrega somente a origem do daemon.',
  'security.telemetry.title': 'Sem telemetria',
  'security.telemetry.body':
    'Nada é enviado a nenhum servidor. A única chamada externa é a verificação de atualização no GitHub Releases, no AppImage do Linux.',
  'security.failClosed.title': 'Aprovações falham fechadas',
  'security.failClosed.body':
    'Em caso de timeout, encerramento ou qualquer ambiguidade, a resposta é negar. Um agente nunca age sem um sim explícito.',
  'security.passive.title': 'Hooks nunca decidem',
  'security.passive.body':
    'Os hooks são opcionais. O comando do hook nunca bloqueia o Claude Code e nunca responde a um pedido de permissão; isso fica no seu terminal.',
  'security.safeInput.title': 'Entrada segura no terminal',
  'security.safeInput.body':
    'Caracteres de controle são removidos do texto digitado nos terminais, e mensagens de outros agentes são marcadas como dados, não como instruções.',
  'security.isolation.title': 'Janela isolada',
  'security.isolation.body':
    'A janela desktop roda com isolamento de contexto e sandbox ativos e integração com Node desligada. Ela recebe só uma ponte tipada.',
  'security.note':
    'O daemon local não tem autenticação. Ele confia em processos locais, mas só expõe o modelo de atividade e aceita payloads de hooks.',
  'security.source': 'Ler as notas de segurança',

  'install.eyebrow': 'Instalação',
  'install.title': 'Rodando em minutos',
  'install.lead': 'Baixe o app desktop ou instale os hooks com um único comando.',
  'install.tabsLabel': 'Opções de instalação',
  'install.linux.title': 'Linux',
  'install.linux.body':
    'Baixe o AppImage na página de versões, torne-o executável e rode. O AppImage se atualiza sozinho.',
  'install.linux.chmod': 'chmod +x agents-office-*-linux-x64.AppImage',
  'install.linux.run': './agents-office-*-linux-x64.AppImage',
  'install.linux.chmodLabel': 'Tornar o AppImage executável',
  'install.linux.runLabel': 'Executar o AppImage',
  'install.linux.deb':
    'Prefere um pacote .deb? Ele instala o mesmo app, mas as atualizações são manuais: baixe o novo pacote na página de versões.',
  'install.macos.title': 'macOS',
  'install.macos.body':
    'Baixe o .dmg (arm64 para Apple Silicon, x64 para Intel), abra-o e arraste o Agents Office para Aplicativos. As atualizações são manuais.',
  'install.macos.note':
    'O app ainda não é assinado, então o macOS bloqueia a primeira abertura. Clique com o botão direito no app e escolha Abrir, ou remova a marca de quarentena:',
  'install.macos.command': 'xattr -dr com.apple.quarantine "/Applications/Agents Office.app"',
  'install.macos.commandLabel': 'Remover a marca de quarentena do macOS',
  'install.cli.title': 'CLI',
  'install.cli.body':
    'Instale os hooks do Claude Code para atualizações instantâneas e alertas de "esperando por você". Um backup das suas configurações do Claude é mantido, e "hooks uninstall" os remove.',
  'install.cli.note':
    'Sem hooks o escritório continua funcionando lendo seus transcripts. Os hooks funcionam com o app desktop e com o daemon avulso.',
  'install.windows.title': 'Windows',
  'install.windows.body': 'Ainda não disponível. Hoje há suporte para Linux e macOS.',
  'install.unavailable': 'Ainda não disponível',
  'install.download': 'Baixar a última versão',
  'install.hooks.title': 'Instale os hooks',
  'install.hooks.body': 'Opcional, mas traz eventos mais rápidos e alertas de atenção.',
  'install.hooks.command': 'npx agents-office hooks install',
  'install.hooks.commandLabel': 'Instalar os hooks do Claude Code',
  'install.copy': 'Copiar',
  'install.copied': 'Copiado',
  'install.copyFailed': 'Falha ao copiar',
  'install.copyLabel': 'Copiar o comando',

  'oss.eyebrow': 'Código aberto',
  'oss.title': 'Feito às claras',
  'oss.lead':
    'O Agents Office usa a licença MIT. Leia o código, reporte problemas, envie um pull request ou apenas dê uma estrela.',
  'oss.license': 'Licença MIT',
  'oss.licenseBody':
    'Livre para usar, copiar, modificar e distribuir. Os assets pixel art são CC0.',
  'oss.repo': 'Repositório',
  'oss.docs': 'Documentação',
  'oss.docs.readme': 'README',
  'oss.docs.architecture': 'ARCHITECTURE',
  'oss.docs.design': 'DESIGN',
  'oss.docs.development': 'DEVELOPMENT',
  'oss.docsBody': 'Comece pelo README e depois veja como o projeto é construído e como rodá-lo.',
  'oss.star': 'Dar estrela no GitHub',
  'oss.contribute': 'Contribuir',
  'oss.contributeBody':
    'Configure o projeto com o DEVELOPMENT, escolha uma issue e abra um pull request. Rode typecheck, lint e testes antes.',
  'oss.issues': 'Abrir uma issue',

  'footer.tagline': 'Seus agentes do Claude Code, em um escritório pixel art.',
  'footer.license': 'Publicado sob a licença MIT.',
  'footer.assets': 'Os assets pixel art são CC0.',
  'footer.github': 'GitHub',
  'footer.releases': 'Versões',
  'footer.backToTop': 'Voltar ao topo',
  'footer.copyright': '(c) {year} Agents Office',
  'footer.navLabel': 'Links do rodapé',
};
