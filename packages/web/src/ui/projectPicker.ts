import type {
  AgentsOfficeDesktop,
  CatalogProject,
  ExternalBridge,
  OfficeModel,
  ProjectsBridge,
  TerminalBridge,
  TerminalPermissionMode,
  TerminalStartOptions,
  TerminalStartResult,
} from '@agents-office/shared';
// Pure logic of the project picker (filter, launch options -> `claude` arguments, labels). No DOM:
// `projectPickerPanel.ts` renders it. Tested with Vitest.

export type LaunchChoice =
  | { kind: 'new' }
  | { kind: 'continue' }
  | { kind: 'resume'; sessionId: string };

export const LAUNCH_LABELS: Record<LaunchChoice['kind'], string> = {
  new: 'Nova sessão',
  continue: 'Continuar a última',
  resume: 'Retomar uma sessão',
};

export type CardSupport = 'yes' | 'partial' | 'no';

export interface PermissionModeInfo {
  mode: TerminalPermissionMode;
  label: string;
  /** Whether permission requests show up as cards in the office (spike 013). */
  cards: CardSupport;
  note: string;
}

/** Documented `--permission-mode` values. Only `default` and `auto` were verified (spike 013). */
export const PERMISSION_MODES: readonly PermissionModeInfo[] = [
  {
    mode: 'default',
    label: 'default (manual)',
    cards: 'yes',
    note: 'Os pedidos de permissão aparecem como cartões no escritório.',
  },
  {
    mode: 'acceptEdits',
    label: 'acceptEdits',
    cards: 'partial',
    note: 'Edições de arquivos são aprovadas sozinhas, sem cartão; os demais pedidos geram cartão (não verificado).',
  },
  {
    mode: 'plan',
    label: 'plan',
    cards: 'partial',
    note: 'Modo de planejamento, só leitura; pedidos que exigirem aprovação geram cartão (não verificado).',
  },
  {
    mode: 'dontAsk',
    label: 'dontAsk',
    cards: 'no',
    note: 'Não pergunta: o que não estiver permitido é negado, então não há cartões (não verificado).',
  },
  {
    mode: 'auto',
    label: 'auto',
    cards: 'no',
    note: 'Não gera cartões: o modo auto não dispara o hook de permissão (spike 013).',
  },
  {
    mode: 'bypassPermissions',
    label: 'bypassPermissions',
    cards: 'no',
    note: 'Sem confirmações e sem cartões. Use só em pastas de confiança (não verificado).',
  },
];

export const DEFAULT_PERMISSION_MODE: TerminalPermissionMode = 'default';

export const TRUST_FOLDER_NOTE =
  'Em uma pasta nova o Claude pergunta no terminal se você confia nela; responda lá (a opção marcada é "No, exit").';

export function permissionModeInfo(mode: TerminalPermissionMode): PermissionModeInfo {
  return (
    PERMISSION_MODES.find((info) => info.mode === mode) ??
    (PERMISSION_MODES[0] as PermissionModeInfo)
  );
}

/** Incremental search: every word must appear in the name or in the path (case-insensitive). */
export function filterProjects(
  projects: readonly CatalogProject[],
  query: string,
): CatalogProject[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...projects];
  return projects.filter((project) => {
    const haystack = `${project.name}\n${project.cwd}`.toLowerCase();
    return words.every((word) => haystack.includes(word));
  });
}

export function canStart(choice: LaunchChoice): boolean {
  return choice.kind !== 'resume' || choice.sessionId !== '';
}

/** What the picker asks the terminal bridge to start. */
export function buildStartOptions(
  cwd: string,
  choice: LaunchChoice,
  mode: TerminalPermissionMode,
): TerminalStartOptions {
  const options: TerminalStartOptions = { cwd, permissionMode: mode };
  if (choice.kind === 'continue') options.continueLast = true;
  if (choice.kind === 'resume') options.resume = choice.sessionId;
  return options;
}

/** The `claude` command line arguments those options become (mirrors the session manager). */
export function claudeArgs(options: TerminalStartOptions): string[] {
  const args: string[] = [];
  if (options.permissionMode) args.push('--permission-mode', options.permissionMode);
  if (options.resume) args.push('--resume', options.resume);
  else if (options.continueLast) args.push('--continue');
  return args;
}

export function startErrorMessage(result: Extract<TerminalStartResult, { ok: false }>): string {
  switch (result.code) {
    case 'claude-not-found':
      return `${result.message} Instale o Claude Code ou defina o caminho (claudePath) no config.json do app.`;
    case 'session-limit':
      return `${result.message}`;
    default:
      return result.message;
  }
}

/** "agora", "há 5 min", "há 3 h", "há 2 d" or the date. */
export function formatWhen(iso: string | null, now: Date): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return new Date(then).toISOString().slice(0, 10);
}

/** Folders that the office already shows (rooms), to feed the catalog. */
export function officeCwds(model: Pick<OfficeModel, 'projects'>): string[] {
  return Object.values(model.projects)
    .map((project) => project.cwd)
    .filter((cwd) => cwd !== '');
}

export interface PickerBridges {
  terminal: TerminalBridge;
  projects: ProjectsBridge;
  /** Opens the project in VS Code; absent in an older shell (the button is hidden). */
  external?: ExternalBridge;
}

/** Both bridges, or undefined outside the desktop shell. */
export function pickerBridgesOf(win: object): PickerBridges | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  if (desktop?.desktop !== true) return undefined;
  const { terminal, projects, external } = desktop;
  if (!terminal || typeof terminal.start !== 'function') return undefined;
  if (!projects || typeof projects.list !== 'function') return undefined;
  return {
    terminal,
    projects,
    ...(external && typeof external.openInVSCode === 'function' ? { external } : {}),
  };
}
