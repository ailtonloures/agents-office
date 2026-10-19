/**
 * English dictionary: the source of truth for the landing message keys.
 *
 * Convention: flat keys in dot notation, grouped by section (`meta.*`, `lang.*`, `a11y.*`, `nav.*`,
 * `hero.*`, `how.*`, `features.*`, `arch.*`, `security.*`, `install.*`, `oss.*`, `footer.*`).
 * Values may hold `{name}` placeholders filled by `t(key, { name })`. `pt-BR.ts` and `es.ts` are
 * typed as `Messages`, so a missing or extra key breaks the typecheck.
 */
export const en = {
  'meta.title': 'Agents Office - watch and orchestrate your Claude Code agents',
  'meta.description':
    'Agents Office turns Claude Code into a live pixel art office. Watch your sessions passively, or go active and orchestrate a team: create agent profiles, let agents talk to each other, draw on a board and run terminals. Open source, local only.',

  'lang.label': 'Language',
  'lang.menuLabel': 'Choose the language',
  'lang.footerMenuLabel': 'Choose the language (footer)',

  'a11y.skipToContent': 'Skip to content',
  'a11y.mainNav': 'Main navigation',
  'a11y.heroScene':
    'Animated pixel art office: a Tech Lead at the desk while subagents come in, work and leave.',

  'nav.how': 'How it works',
  'nav.features': 'Features',
  'nav.architecture': 'Architecture',
  'nav.security': 'Security',
  'nav.install': 'Install',
  'nav.menu': 'Menu',
  'nav.menuOpen': 'Open menu',
  'nav.menuClose': 'Close menu',
  'nav.home': 'Agents Office, back to top',
  'nav.github': 'GitHub',

  'hero.eyebrow': 'Open source - MIT',
  'hero.title': 'Your Claude Code agents, working in a pixel art office',
  'hero.lead':
    'Watch what Claude Code is doing as a living office, or go further: create agent profiles, let them talk to each other and orchestrate the team. Every project is a room, every session a Tech Lead, every subagent an employee at a desk.',
  'hero.ctaDownload': 'Download',
  'hero.ctaStar': 'Star on GitHub',
  'hero.note': 'Runs locally. No account, no telemetry.',
  'hero.platforms':
    'Desktop app for Linux (AppImage and .deb). macOS and Windows are not available yet.',
  'hero.docs': 'Read the docs',
  'hero.statusIdle': 'Idle',
  'hero.statusWorking': 'Working',
  'hero.statusWaiting': 'Waiting for you',

  'how.eyebrow': 'How it works',
  'how.title': 'A metaphor you understand at a glance',
  'how.lead':
    'Two ways to use it. Passive mode only watches: keep using Claude Code as usual and the office mirrors it. Active mode lets you create and orchestrate agents. Start passive, nothing to configure.',
  'how.modes.passive.title': 'Passive mode: just watch',
  'how.modes.passive.body':
    'Keep using Claude Code as you always do. The office reads your transcripts and shows what is happening, with nothing to configure and optional hooks.',
  'how.modes.active.title': 'Active mode: create and orchestrate',
  'how.modes.active.body':
    'Create agent profiles and build a cast, let agents talk to each other through the Agent Bus, draw plans on an Excalidraw board, open terminals in the app and watch the agents work.',
  'how.project.title': 'Project becomes a room',
  'how.project.body':
    'Each project folder gets its own room. Open several projects and move between them from the map.',
  'how.session.title': 'Session becomes a Tech Lead',
  'how.session.body':
    'Each Claude Code session is a Tech Lead sitting at a workstation, with the monitor showing what it is doing.',
  'how.subagent.title': 'Subagent becomes an employee',
  'how.subagent.body':
    'When a session delegates work, a subagent walks in, takes a desk, works and leaves when it is done.',
  'how.status.title': 'Live status at a glance',
  'how.status.body':
    'A colored ring and the monitor show who is working, who is idle and who is waiting for you, so no session is left stuck.',
  'how.inspect.title': 'Walk up and inspect',
  'how.inspect.body':
    'Walk to any agent to see its current task, the tool in use and token usage in a detail panel.',
  'how.hooks.title': 'Hooks are optional (passive mode)',
  'how.hooks.body':
    'In passive mode, transcripts are enough to mirror activity. Install the hooks to get faster events and attention alerts. They only notify.',

  'features.eyebrow': 'Features',
  'features.title': 'Everything you need to run many agents',
  'features.lead':
    'From watching a single session to creating agent profiles, letting them talk, drawing plans on a board and following the team work, in one window.',
  'features.badge.desktop': 'Desktop',
  'features.badge.beta': 'Beta',
  'features.observability.title': 'Live observability',
  'features.observability.body':
    'See every session and subagent in real time, with status rings, monitors and alerts when an agent is waiting for you.',
  'features.terminals.title': 'Integrated terminals',
  'features.terminals.body':
    'Tabs and a dock inside the app. The app manages Claude Code sessions for you, so you stop opening terminals by hand.',
  'features.cast.title': 'Cast of agents',
  'features.cast.body':
    'Customize agent profiles: name, look, instructions, permissions and model. The project cast starts sessions already configured, the same team in every project.',
  'features.bus.title': 'Agent Bus',
  'features.bus.body':
    'Agents talk to each other through an MCP bus and orchestrate work as a team. Creating a new agent always needs your approval.',
  'features.board.title': 'Board',
  'features.board.body':
    'An Excalidraw board where agents draw plans and diagrams, so you can see architecture as it is being designed.',
  'features.browser.title': 'Embedded browser',
  'features.browser.body':
    'A browser inside the app that agents can use, with security approvals before they act. In progress, so it is marked as beta.',

  'features.points': 'Highlights',
  'features.observability.p1': 'Status ring: working, idle, waiting for you',
  'features.observability.p2': 'Detail panel with task, tool and tokens',
  'features.terminals.p1': 'Tabs and a dock inside the window',
  'features.terminals.p2': 'Managed Claude Code sessions',
  'features.cast.p1': 'Name, look, instructions, permissions, model',
  'features.cast.p2': 'The same team in every project',
  'features.bus.p1': 'MCP bus for agent-to-agent messages',
  'features.bus.p2': 'Spawning an agent needs your approval',
  'features.board.p1': 'Excalidraw board for plans and diagrams',
  'features.board.p2': 'Agents draw while you watch',
  'features.browser.p1': 'Browser inside the app for agents',
  'features.browser.p2': 'Security approvals before they act',

  'arch.eyebrow': 'Architecture',
  'arch.title': 'Simple inside, all on your machine',
  'arch.lead':
    'A small pipeline turns Claude Code activity into events and pushes them to the office.',
  'arch.diagramLabel': 'Pipeline from Claude Code to the client',
  'arch.step.claude': 'Claude Code',
  'arch.step.sources': 'Transcripts and hooks',
  'arch.step.daemon': 'Daemon',
  'arch.step.socket': 'WebSocket',
  'arch.step.client': 'Client',
  'arch.stack.title': 'Stack',
  'arch.stack.body':
    'pnpm monorepo in strict TypeScript, Phaser for the game, Electron for the desktop shell and zod for every contract between packages.',
  'arch.reduce.title': 'One reducer, two sides',
  'arch.reduce.body':
    'The daemon and the client apply the same pure reducer to the same events, so their models never drift apart.',

  'arch.step.claude.desc': 'Runs sessions and subagents',
  'arch.step.sources.desc': 'Read passively, hooks optional',
  'arch.step.daemon.desc': 'Normalizes events into one model',
  'arch.step.socket.desc': 'Pushes events live',
  'arch.step.client.desc': 'Browser or desktop window',
  'arch.desktop.title': 'Desktop extensions',
  'arch.desktop.body':
    'The desktop app adds the active mode on top of the same pipeline: real terminals, the Agent Bus between agents, the Excalidraw board and automatic updates.',
  'arch.desktop.pty': 'node-pty terminals',
  'arch.desktop.bus': 'Agent Bus',
  'arch.desktop.updater': 'Updater',

  'security.eyebrow': 'Security and privacy',
  'security.title': 'Local first, closed by default',
  'security.lead': 'Your code and your sessions stay on your computer.',
  'security.local.title': 'Local only',
  'security.local.body':
    'The daemon and the Agent Bus bind to 127.0.0.1 only. The window loads only the daemon origin.',
  'security.telemetry.title': 'No telemetry',
  'security.telemetry.body':
    'Nothing is sent to any server. The only outbound call is the update check against GitHub Releases, in the Linux AppImage.',
  'security.failClosed.title': 'Approvals fail closed',
  'security.failClosed.body':
    'On timeout, quit or any ambiguity, the answer is deny. An agent never acts without an explicit yes, and creating a new agent always needs your approval.',
  'security.passive.title': 'Hooks only notify',
  'security.passive.body':
    'Hooks are optional and belong to passive mode. The hook command only notifies: it never blocks Claude Code and never answers a permission prompt; that stays in your terminal.',
  'security.safeInput.title': 'Safe terminal input',
  'security.safeInput.body':
    'Control characters are stripped from text typed into terminals, and messages from other agents are labelled as data, not instructions.',
  'security.isolation.title': 'Isolated window',
  'security.isolation.body':
    'The desktop window runs with context isolation and sandbox on and Node integration off. It only gets one typed bridge.',
  'security.note':
    'The local daemon has no authentication. It trusts local processes, but it only exposes the activity model and accepts hook payloads.',
  'security.source': 'Read the security notes',

  'install.eyebrow': 'Install',
  'install.title': 'Up and running in minutes',
  'install.lead': 'Download the desktop app, or run the optional hooks with a single command.',
  'install.tabsLabel': 'Install options',
  'install.linux.title': 'Linux',
  'install.linux.body':
    'Download the AppImage from the releases page, make it executable and run it. The AppImage updates itself.',
  'install.linux.chmod': 'chmod +x agents-office-*-linux-x86_64.AppImage',
  'install.linux.run': './agents-office-*-linux-x86_64.AppImage',
  'install.linux.chmodLabel': 'Make the AppImage executable',
  'install.linux.runLabel': 'Run the AppImage',
  'install.linux.deb':
    'Prefer a .deb package? Install it with your package manager. Updates are manual: download the new package from the releases page.',
  'install.linux.debCommand': 'sudo apt install ./agents-office-*-linux-amd64.deb',
  'install.linux.debLabel': 'Install the .deb package',
  'install.unavailable.title': 'macOS and Windows',
  'install.unavailable.body':
    'Not available yet. Only Linux (AppImage and .deb) is supported today; there are no macOS or Windows builds.',
  'install.unavailable': 'Not available yet',
  'install.download': 'Download the latest release',
  'install.copy': 'Copy',
  'install.copied': 'Copied',
  'install.copyFailed': 'Copy failed',
  'install.copyLabel': 'Copy the command',

  'oss.eyebrow': 'Open source',
  'oss.title': 'Built in the open',
  'oss.lead':
    'Agents Office is MIT licensed. Read the code, report issues, send a pull request or just give it a star.',
  'oss.license': 'MIT license',
  'oss.licenseBody': 'Free to use, copy, modify and distribute. Pixel art assets are CC0.',
  'oss.repo': 'Repository',
  'oss.docs': 'Documentation',
  'oss.docs.readme': 'README',
  'oss.docs.architecture': 'ARCHITECTURE',
  'oss.docs.design': 'DESIGN',
  'oss.docs.development': 'DEVELOPMENT',
  'oss.docsBody': 'Start with the README, then read how it is built and how to run it.',
  'oss.star': 'Star on GitHub',
  'oss.contribute': 'Contribute',
  'oss.contributeBody':
    'Set up the project with DEVELOPMENT, pick an issue, and open a pull request. Run typecheck, lint and tests first.',
  'oss.issues': 'Open an issue',

  'footer.tagline': 'Your Claude Code agents, in a pixel art office.',
  'footer.license': 'Released under the MIT license.',
  'footer.assets': 'Pixel art assets are CC0.',
  'footer.github': 'GitHub',
  'footer.releases': 'Releases',
  'footer.backToTop': 'Back to top',
  'footer.copyright': '(c) {year} Agents Office',
  'footer.navLabel': 'Footer links',
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
