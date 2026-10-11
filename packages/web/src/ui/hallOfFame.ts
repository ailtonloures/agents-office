import type { HallOfFameEntry, OfficeModel } from '@agents-office/shared';
import {
  DIALOG_COLS,
  type DialogPage,
  formatDuration,
  PROFESSION_LABEL,
  truncate,
  wrapLines,
} from './dialogContent';

/** Entries shown on the mural (the model keeps at most this many). */
export const HALL_OF_FAME_LIMIT = 20;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Local wall-clock time of an ISO timestamp as `HH:MM`. */
export function formatClock(ts: string): string {
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return '--:--';
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Project of a finished agent: captured at finish time, else looked up while its session lives. */
export function projectNameOf(entry: HallOfFameEntry, model: OfficeModel): string {
  if (entry.projectName) return entry.projectName;
  const session = model.sessions[entry.sessionId];
  const project = session ? model.projects[session.projectId] : undefined;
  return project?.name ?? 'desconhecido';
}

/**
 * Dialog pages of the Hall of Fame mural: a title page, then one page per finished agent, the
 * most recent first (at most {@link HALL_OF_FAME_LIMIT}).
 */
export function hallOfFamePages(model: OfficeModel): DialogPage[] {
  const entries = model.hallOfFame.slice(-HALL_OF_FAME_LIMIT).reverse();
  if (entries.length === 0) {
    return [['Hall da Fama', 'Ninguem concluiu uma tarefa ainda.']];
  }
  const total = entries.length;
  const pages: DialogPage[] = [
    [
      'Hall da Fama',
      `Ultimos ${total} agente${total === 1 ? '' : 's'} concluido${total === 1 ? '' : 's'}.`,
      'A para folhear, X para sair',
    ],
  ];
  entries.forEach((entry, index) => {
    const duration = entry.finishedTs
      ? formatDuration(Date.parse(entry.finishedTs) - Date.parse(entry.startedTs))
      : '?';
    const when = entry.finishedTs ? formatClock(entry.finishedTs) : '--:--';
    const head = truncate(
      `${index + 1}/${total} ${PROFESSION_LABEL[entry.profession]} - ${duration} - ${when}`,
      DIALOG_COLS,
    );
    const description = entry.description ? entry.description : 'Sem descricao';
    pages.push([
      head,
      ...wrapLines(description, DIALOG_COLS, 1),
      truncate(`Projeto: ${projectNameOf(entry, model)}`, DIALOG_COLS),
    ]);
  });
  return pages;
}
