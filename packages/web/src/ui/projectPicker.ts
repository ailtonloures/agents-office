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
import { t } from '../i18n/i18n';
// Pure logic of the project picker (filter, launch options -> `claude` arguments, labels). No DOM:
// `projectPickerPanel.ts` renders it. Tested with Vitest.

export type LaunchChoice =
  | { kind: 'new' }
  | { kind: 'continue' }
  | { kind: 'resume'; sessionId: string };

/** Label of a launch option in the active language. */
export function launchLabel(kind: LaunchChoice['kind']): string {
  switch (kind) {
    case 'new':
      return t('picker.launch.new');
    case 'continue':
      return t('picker.launch.continue');
    case 'resume':
      return t('picker.launch.resume');
  }
}

export type CardSupport = 'yes' | 'partial' | 'no';

export interface PermissionModeInfo {
  mode: TerminalPermissionMode;
  label: string;
  /** Whether permission requests show up as cards in the office (spike 013). */
  cards: CardSupport;
  note: string;
}

/** Documented `--permission-mode` values. Only `default` and `auto` were verified (spike 013). */
const MODE_CARDS: readonly { mode: TerminalPermissionMode; cards: CardSupport }[] = [
  { mode: 'default', cards: 'yes' },
  { mode: 'acceptEdits', cards: 'partial' },
  { mode: 'plan', cards: 'partial' },
  { mode: 'dontAsk', cards: 'no' },
  { mode: 'auto', cards: 'no' },
  { mode: 'bypassPermissions', cards: 'no' },
];

/** The permission modes with their notes in the active language (mode names are not translated). */
export function permissionModes(): readonly PermissionModeInfo[] {
  return MODE_CARDS.map(({ mode, cards }) => ({
    mode,
    label: mode === 'default' ? 'default (manual)' : mode,
    cards,
    note: t(`picker.mode.${mode}.note`),
  }));
}

/** Short tag of the card support, shown next to the mode name in the select. */
export function cardsTag(cards: CardSupport): string {
  switch (cards) {
    case 'yes':
      return t('picker.cards.yes');
    case 'partial':
      return t('picker.cards.partial');
    case 'no':
      return t('picker.cards.no');
  }
}

export const DEFAULT_PERMISSION_MODE: TerminalPermissionMode = 'default';

export function trustFolderNote(): string {
  return t('picker.trustNote');
}

export function permissionModeInfo(mode: TerminalPermissionMode): PermissionModeInfo {
  return (
    permissionModes().find((info) => info.mode === mode) ??
    (permissionModes()[0] as PermissionModeInfo)
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
      return t('picker.claudeNotFound', { message: result.message });
    case 'session-limit':
      return result.message;
    default:
      return result.message;
  }
}

/** "now", "5 min ago", "3 h ago", "2 d ago" or the date, in the active language. */
export function formatWhen(iso: string | null, now: Date): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.floor((now.getTime() - then) / 60_000);
  if (minutes < 1) return t('picker.when.now');
  if (minutes < 60) return t('picker.when.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('picker.when.hours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return t('picker.when.days', { n: days });
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
