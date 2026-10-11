import type { AgentsOfficeDesktop, HooksBridge, HooksStatus } from '@agents-office/shared';

export const HOOKS_PROMPT_KEY = 'agents-office.hooksPrompt.dismissed';

/** The hooks bridge exposed by the desktop shell; undefined in a plain browser (screen hidden). */
export function hooksBridgeOf(win: object): HooksBridge | undefined {
  const desktop = (win as { agentsOfficeDesktop?: unknown }).agentsOfficeDesktop as
    | Partial<AgentsOfficeDesktop>
    | undefined;
  if (desktop?.desktop !== true) return undefined;
  const hooks = desktop.hooks;
  return hooks && typeof hooks.status === 'function' ? hooks : undefined;
}

/** First-run notice: nothing installed yet and the user did not dismiss it before. */
export function shouldPromptInstall(status: HooksStatus, dismissed: boolean): boolean {
  return status.installedCount === 0 && !dismissed;
}

export type DiffKind = 'add' | 'del' | 'ctx';

export function classifyDiffLine(line: string): { kind: DiffKind; text: string } {
  if (line.startsWith('+ ')) return { kind: 'add', text: line };
  if (line.startsWith('- ')) return { kind: 'del', text: line };
  return { kind: 'ctx', text: line };
}

export type HooksSummary = 'none' | 'partial' | 'all';

export function summaryOf(status: HooksStatus): HooksSummary {
  if (status.installedCount === 0) return 'none';
  return status.installedCount === status.total ? 'all' : 'partial';
}

export function summaryLabel(status: HooksStatus): string {
  const summary = summaryOf(status);
  if (summary === 'none') return 'Nenhum hook instalado';
  if (summary === 'all') return `Todos os ${status.total} hooks instalados`;
  return `${status.installedCount} de ${status.total} hooks instalados`;
}

export function hooksSeenLabel(status: HooksStatus, now: Date): string {
  if (!status.daemonReachable) return 'Daemon inacessível';
  if (status.hooksSeenAt === null) return 'Nenhum hook recebido ainda';
  const at = new Date(status.hooksSeenAt);
  if (Number.isNaN(at.getTime())) return 'Nenhum hook recebido ainda';
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 60) return `Último hook recebido há ${seconds} s`;
  if (seconds < 3600) return `Último hook recebido há ${Math.round(seconds / 60)} min`;
  return `Último hook recebido em ${at.toLocaleString('pt-BR')}`;
}

/** The button offers the action that still makes sense: install what is missing, or remove all. */
export function primaryAction(status: HooksStatus): 'install' | 'uninstall' {
  return summaryOf(status) === 'all' ? 'uninstall' : 'install';
}
