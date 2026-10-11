// Tolerant readers for Claude Code transcript records. The transcript format is not a stable
// public API, so nothing here validates a full shape: each helper extracts one field when it has
// the expected type and returns `undefined` otherwise.

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getString(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function getNumber(record: JsonObject, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function getObject(record: JsonObject, key: string): JsonObject | undefined {
  const value = record[key];
  return isObject(value) ? value : undefined;
}

/** Parses one JSONL line into an object. Returns `undefined` for invalid JSON or non-objects. */
export function parseJsonLine(line: string): JsonObject | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return isObject(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Content blocks of `message.content` (objects only); a string content yields no blocks. */
export function contentBlocks(record: JsonObject): JsonObject[] {
  const message = getObject(record, 'message');
  const content = message?.content;
  return Array.isArray(content) ? content.filter(isObject) : [];
}

/** Plain text of a user message: the string content or the concatenated `text` blocks. */
export function userText(record: JsonObject): string | undefined {
  const message = getObject(record, 'message');
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content
    .filter(isObject)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Transcript record types that are well formed but carry nothing the office shows. Observed in
 * Claude Code 2.x transcripts; anything not listed here and not handled is counted as skipped.
 */
export const IGNORED_RECORD_TYPES: ReadonlySet<string> = new Set([
  'system',
  'summary',
  'file-history-snapshot',
  'file-history-delta',
  'mode',
  'permission-mode',
  'last-prompt',
  'atis-latch',
  'bridge-session',
  'custom-title',
  'ai-title',
  'agent-name',
  'cost-state',
  'tag',
]);

export interface TaskNotification {
  taskId?: string;
  toolUseId?: string;
  status?: string;
}

const TASK_NOTIFICATION = /<task-notification>([\s\S]*?)<\/task-notification>/g;

function tag(body: string, name: string): string | undefined {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(body);
  const value = match?.[1]?.trim();
  return value ? value : undefined;
}

/**
 * Extracts the `<task-notification>` blocks Claude Code queues into the parent session when a
 * background task (e.g. an async subagent) changes state.
 */
export function parseTaskNotifications(text: string): TaskNotification[] {
  const notifications: TaskNotification[] = [];
  for (const match of text.matchAll(TASK_NOTIFICATION)) {
    const body = match[1] ?? '';
    notifications.push({
      taskId: tag(body, 'task-id'),
      toolUseId: tag(body, 'tool-use-id'),
      status: tag(body, 'status'),
    });
  }
  return notifications;
}

/** Last path segment of a `/` or `\` separated path. */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  return parts[parts.length - 1] ?? '';
}

/** Name of the directory containing `path` (e.g. the project slug of a transcript path). */
export function parentDirName(path: string): string | undefined {
  const parts = path.split(/[\\/]/).filter((part) => part !== '');
  return parts.length >= 2 ? parts[parts.length - 2] : undefined;
}

/** Claude Code's project directory slug for a cwd: every non-alphanumeric char becomes `-`. */
export function slugifyCwd(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-');
}
