import type { Messages } from './en';

export const es: Messages = {
  'meta.title': 'Agents Office - tus agentes de Claude Code en una oficina pixel art',
  'meta.description':
    'Agents Office refleja la actividad de Claude Code como una oficina pixel art en vivo. Mira a los agentes trabajar, usa terminales, orquesta un elenco y dibuja en la pizarra. Código abierto, todo local.',

  'lang.label': 'Idioma',
  'lang.menuLabel': 'Elige el idioma',
  'lang.footerMenuLabel': 'Elegir el idioma (pie de página)',

  'a11y.skipToContent': 'Saltar al contenido',
  'a11y.mainNav': 'Navegación principal',
  'a11y.heroScene':
    'Oficina pixel art animada: un Tech Lead en su escritorio mientras los subagentes entran, trabajan y se van.',

  'nav.how': 'Cómo funciona',
  'nav.features': 'Funciones',
  'nav.architecture': 'Arquitectura',
  'nav.security': 'Seguridad',
  'nav.install': 'Instalar',
  'nav.menu': 'Menú',
  'nav.menuOpen': 'Abrir menú',
  'nav.menuClose': 'Cerrar menú',
  'nav.home': 'Agents Office, volver arriba',
  'nav.github': 'GitHub',

  'hero.eyebrow': 'Código abierto - MIT',
  'hero.title': 'Tus agentes de Claude Code, trabajando en una oficina pixel art',
  'hero.lead':
    'Agents Office refleja lo que Claude Code está haciendo como una oficina viva: cada proyecto es una sala, cada sesión un Tech Lead, cada subagente un empleado en su escritorio.',
  'hero.ctaDownload': 'Descargar',
  'hero.ctaStar': 'Dar estrella en GitHub',
  'hero.note': 'Funciona en local. Sin cuenta, sin telemetría.',
  'hero.commandLabel': 'Opcional: instala los hooks de Claude Code para eventos instantáneos',
  'hero.platforms': 'App de escritorio para Linux y macOS. Windows aún no es compatible.',
  'hero.docs': 'Leer la documentación',
  'hero.statusIdle': 'Inactivo',
  'hero.statusWorking': 'Trabajando',
  'hero.statusWaiting': 'Esperándote',

  'how.eyebrow': 'Cómo funciona',
  'how.title': 'Una metáfora que entiendes de un vistazo',
  'how.lead':
    'Agents Office lee tus sesiones de Claude Code de forma pasiva y las convierte en una oficina. No hay nada que configurar para empezar a observar.',
  'how.project.title': 'El proyecto se vuelve sala',
  'how.project.body':
    'Cada carpeta de proyecto tiene su propia sala. Abre varios proyectos y muévete entre ellos desde el mapa.',
  'how.session.title': 'La sesión se vuelve Tech Lead',
  'how.session.body':
    'Cada sesión de Claude Code es un Tech Lead sentado en su puesto de trabajo, con el monitor mostrando lo que hace.',
  'how.subagent.title': 'El subagente se vuelve empleado',
  'how.subagent.body':
    'Cuando una sesión delega trabajo, un subagente entra, ocupa un escritorio, trabaja y se va al terminar.',
  'how.status.title': 'Estado en vivo de un vistazo',
  'how.status.body':
    'Un anillo de color y el monitor muestran quién trabaja, quién está inactivo y quién te espera, para que ninguna sesión quede detenida.',
  'how.inspect.title': 'Acércate e inspecciona',
  'how.inspect.body':
    'Camina hasta cualquier agente para ver su tarea actual, la herramienta en uso y el consumo de tokens en un panel de detalles.',
  'how.hooks.title': 'Los hooks son opcionales',
  'how.hooks.body':
    'Los transcripts bastan para reflejar la actividad. Instala los hooks para recibir eventos más rápidos y alertas de atención.',

  'features.eyebrow': 'Funciones',
  'features.title': 'Todo para dirigir muchos agentes',
  'features.lead':
    'Desde observar una sola sesión hasta orquestar un equipo entero, en una ventana.',
  'features.badge.desktop': 'Desktop',
  'features.badge.beta': 'Beta',
  'features.observability.title': 'Observabilidad en vivo',
  'features.observability.body':
    'Mira cada sesión y cada subagente en tiempo real, con anillos de estado, monitores y alertas cuando un agente te espera.',
  'features.terminals.title': 'Terminales integradas',
  'features.terminals.body':
    'Pestañas y dock dentro de la app. La app gestiona las sesiones de Claude Code por ti, así dejas de abrir terminales a mano.',
  'features.cast.title': 'Elenco de agentes',
  'features.cast.body':
    'Personaliza perfiles de agentes: nombre, aspecto, instrucciones, permisos y modelo. El elenco del proyecto inicia sesiones ya configuradas, el mismo equipo en cada proyecto.',
  'features.bus.title': 'Agent Bus',
  'features.bus.body':
    'Los agentes conversan entre sí mediante un bus MCP y orquestan el trabajo en equipo. Crear un nuevo agente siempre requiere tu aprobación.',
  'features.board.title': 'Pizarra',
  'features.board.body':
    'Una pizarra Excalidraw donde los agentes dibujan planes y diagramas, para que veas la arquitectura mientras se diseña.',
  'features.browser.title': 'Navegador integrado',
  'features.browser.body':
    'Un navegador dentro de la app que los agentes pueden usar, con aprobaciones de seguridad antes de actuar. En desarrollo, por eso está marcado como beta.',

  'features.points': 'Destacados',
  'features.observability.p1': 'Anillo de estado: trabajando, inactivo, esperándote',
  'features.observability.p2': 'Panel de detalle con tarea, herramienta y tokens',
  'features.terminals.p1': 'Pestañas y un dock dentro de la ventana',
  'features.terminals.p2': 'Sesiones de Claude Code gestionadas',
  'features.cast.p1': 'Nombre, aspecto, instrucciones, permisos, modelo',
  'features.cast.p2': 'El mismo equipo en todos los proyectos',
  'features.bus.p1': 'Bus MCP para mensajes entre agentes',
  'features.bus.p2': 'Crear un agente requiere tu aprobación',
  'features.board.p1': 'Pizarra Excalidraw para planes y diagramas',
  'features.board.p2': 'Los agentes dibujan mientras observas',
  'features.browser.p1': 'Navegador dentro de la app para los agentes',
  'features.browser.p2': 'Aprobaciones de seguridad antes de actuar',

  'arch.eyebrow': 'Arquitectura',
  'arch.title': 'Simple por dentro, todo en tu máquina',
  'arch.lead':
    'Un pequeño pipeline convierte la actividad de Claude Code en eventos y los envía a la oficina.',
  'arch.diagramLabel': 'Pipeline desde Claude Code hasta el cliente',
  'arch.step.claude': 'Claude Code',
  'arch.step.sources': 'Transcripts y hooks',
  'arch.step.daemon': 'Daemon',
  'arch.step.socket': 'WebSocket',
  'arch.step.client': 'Cliente',
  'arch.stack.title': 'Stack',
  'arch.stack.body':
    'Monorepo pnpm en TypeScript estricto, Phaser para el juego, Electron para el shell de escritorio y zod en cada contrato entre paquetes.',
  'arch.reduce.title': 'Un reducer, dos lados',
  'arch.reduce.body':
    'El daemon y el cliente aplican el mismo reducer puro a los mismos eventos, así que sus modelos nunca se desalinean.',

  'arch.step.claude.desc': 'Ejecuta sesiones y subagentes',
  'arch.step.sources.desc': 'Lectura pasiva, hooks opcionales',
  'arch.step.daemon.desc': 'Normaliza los eventos en un solo modelo',
  'arch.step.socket.desc': 'Envía los eventos en vivo',
  'arch.step.client.desc': 'Navegador o ventana de escritorio',
  'arch.desktop.title': 'Extensiones de escritorio',
  'arch.desktop.body':
    'La app de escritorio suma terminales reales, el Agent Bus entre agentes y actualizaciones automáticas sobre el mismo pipeline.',
  'arch.desktop.pty': 'Terminales node-pty',
  'arch.desktop.bus': 'Agent Bus',
  'arch.desktop.updater': 'Actualizador',

  'security.eyebrow': 'Seguridad y privacidad',
  'security.title': 'Local primero, cerrado por defecto',
  'security.lead': 'Tu código y tus sesiones se quedan en tu computadora.',
  'security.local.title': 'Solo local',
  'security.local.body':
    'El daemon y el Agent Bus escuchan solo en 127.0.0.1. La ventana carga únicamente el origen del daemon.',
  'security.telemetry.title': 'Sin telemetría',
  'security.telemetry.body':
    'No se envía nada a ningún servidor. La única llamada externa es la comprobación de actualizaciones en GitHub Releases, en el AppImage de Linux.',
  'security.failClosed.title': 'Las aprobaciones fallan cerradas',
  'security.failClosed.body':
    'Ante un timeout, un cierre o cualquier ambigüedad, la respuesta es denegar. Un agente nunca actúa sin un sí explícito.',
  'security.passive.title': 'Los hooks nunca deciden',
  'security.passive.body':
    'Los hooks son opcionales. El comando del hook nunca bloquea a Claude Code y nunca responde a una solicitud de permiso; eso se queda en tu terminal.',
  'security.safeInput.title': 'Entrada segura en el terminal',
  'security.safeInput.body':
    'Se eliminan los caracteres de control del texto escrito en los terminales, y los mensajes de otros agentes se marcan como datos, no como instrucciones.',
  'security.isolation.title': 'Ventana aislada',
  'security.isolation.body':
    'La ventana de escritorio corre con aislamiento de contexto y sandbox activos y la integración de Node desactivada. Solo recibe un puente tipado.',
  'security.note':
    'El daemon local no tiene autenticación. Confía en los procesos locales, pero solo expone el modelo de actividad y acepta payloads de hooks.',
  'security.source': 'Leer las notas de seguridad',

  'install.eyebrow': 'Instalación',
  'install.title': 'Funcionando en minutos',
  'install.lead': 'Descarga la app de escritorio o instala los hooks con un solo comando.',
  'install.tabsLabel': 'Opciones de instalación',
  'install.linux.title': 'Linux',
  'install.linux.body':
    'Descarga el AppImage desde la página de versiones, hazlo ejecutable y ejecútalo. El AppImage se actualiza solo.',
  'install.linux.chmod': 'chmod +x agents-office-*-linux-x64.AppImage',
  'install.linux.run': './agents-office-*-linux-x64.AppImage',
  'install.linux.chmodLabel': 'Hacer ejecutable el AppImage',
  'install.linux.runLabel': 'Ejecutar el AppImage',
  'install.linux.deb':
    '¿Prefieres un paquete .deb? Instala la misma app, pero las actualizaciones son manuales: descarga el nuevo paquete desde la página de versiones.',
  'install.macos.title': 'macOS',
  'install.macos.body':
    'Descarga el .dmg (arm64 para Apple Silicon, x64 para Intel), ábrelo y arrastra Agents Office a Aplicaciones. Las actualizaciones son manuales.',
  'install.macos.note':
    'La app aún no está firmada, así que macOS bloquea el primer inicio. Haz clic derecho en la app y elige Abrir, o quita la marca de cuarentena:',
  'install.macos.command': 'xattr -dr com.apple.quarantine "/Applications/Agents Office.app"',
  'install.macos.commandLabel': 'Quitar la marca de cuarentena de macOS',
  'install.cli.title': 'CLI',
  'install.cli.body':
    'Instala los hooks de Claude Code para actualizaciones instantáneas y alertas de "te están esperando". Se guarda una copia de tu configuración de Claude, y "hooks uninstall" los quita.',
  'install.cli.note':
    'Sin hooks la oficina sigue funcionando leyendo tus transcripts. Los hooks funcionan con la app de escritorio y con el daemon independiente.',
  'install.windows.title': 'Windows',
  'install.windows.body': 'Aún no disponible. Hoy hay soporte para Linux y macOS.',
  'install.unavailable': 'Aún no disponible',
  'install.download': 'Descargar la última versión',
  'install.hooks.title': 'Instala los hooks',
  'install.hooks.body': 'Opcional, pero da eventos más rápidos y alertas de atención.',
  'install.hooks.command': 'npx agents-office hooks install',
  'install.hooks.commandLabel': 'Instalar los hooks de Claude Code',
  'install.copy': 'Copiar',
  'install.copied': 'Copiado',
  'install.copyFailed': 'Error al copiar',
  'install.copyLabel': 'Copiar el comando',

  'oss.eyebrow': 'Código abierto',
  'oss.title': 'Hecho a la vista de todos',
  'oss.lead':
    'Agents Office usa la licencia MIT. Lee el código, reporta problemas, envía un pull request o simplemente dale una estrella.',
  'oss.license': 'Licencia MIT',
  'oss.licenseBody':
    'Libre para usar, copiar, modificar y distribuir. Los assets pixel art son CC0.',
  'oss.repo': 'Repositorio',
  'oss.docs': 'Documentación',
  'oss.docs.readme': 'README',
  'oss.docs.architecture': 'ARCHITECTURE',
  'oss.docs.design': 'DESIGN',
  'oss.docs.development': 'DEVELOPMENT',
  'oss.docsBody': 'Empieza por el README y luego mira cómo está construido y cómo ejecutarlo.',
  'oss.star': 'Dar una estrella en GitHub',
  'oss.contribute': 'Contribuir',
  'oss.contributeBody':
    'Configura el proyecto con DEVELOPMENT, elige una issue y abre un pull request. Ejecuta typecheck, lint y pruebas antes.',
  'oss.issues': 'Abrir una issue',

  'footer.tagline': 'Tus agentes de Claude Code, en una oficina pixel art.',
  'footer.license': 'Publicado bajo la licencia MIT.',
  'footer.assets': 'Los assets pixel art son CC0.',
  'footer.github': 'GitHub',
  'footer.releases': 'Versiones',
  'footer.backToTop': 'Volver arriba',
  'footer.copyright': '(c) {year} Agents Office',
  'footer.navLabel': 'Enlaces del pie de página',
};
