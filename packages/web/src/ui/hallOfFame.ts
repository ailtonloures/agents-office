import type { HallOfFameEntry, OfficeModel } from '@agents-office/shared';
import { t } from '../i18n/i18n';
import {
  DIALOG_COLS,
  type DialogPage,
  formatDuration,
  professionLabel,
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
  return project?.name ?? t('hall.unknownProject');
}

/**
 * Dialog pages of the Hall of Fame mural: a title page, then one page per finished agent, the
 * most recent first (at most {@link HALL_OF_FAME_LIMIT}).
 */
export function hallOfFamePages(model: OfficeModel): DialogPage[] {
  const entries = model.hallOfFame.slice(-HALL_OF_FAME_LIMIT).reverse();
  if (entries.length === 0) {
    return [[t('hall.title'), t('hall.empty')]];
  }
  const total = entries.length;
  const pages: DialogPage[] = [
    [
      t('hall.title'),
      total === 1 ? t('hall.summary.one') : t('hall.summary.other', { n: total }),
      t('hall.hint'),
    ],
  ];
  entries.forEach((entry, index) => {
    const duration = entry.finishedTs
      ? formatDuration(Date.parse(entry.finishedTs) - Date.parse(entry.startedTs))
      : '?';
    const when = entry.finishedTs ? formatClock(entry.finishedTs) : '--:--';
    const head = truncate(
      `${index + 1}/${total} ${professionLabel(entry.profession)} - ${duration} - ${when}`,
      DIALOG_COLS,
    );
    const description = entry.description ? entry.description : t('dialog.noDescription');
    pages.push([
      head,
      ...wrapLines(description, DIALOG_COLS, 1),
      truncate(t('dialog.project', { name: projectNameOf(entry, model) }), DIALOG_COLS),
    ]);
  });
  return pages;
}
