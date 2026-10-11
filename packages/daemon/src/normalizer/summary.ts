/** Maximum length of a tool summary shown in the dialog box (e.g. `Bash npm run build`). */
export const SUMMARY_MAX_LENGTH = 60;

/** Maximum length of the prompt summary carried by `actor.thinking`. */
export const PROMPT_SUMMARY_MAX_LENGTH = 80;

const ELLIPSIS = '…';

/** Collapses whitespace and cuts the text at `max` chars, ending with an ellipsis when cut. */
export function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}${ELLIPSIS}`;
}

/** Cuts a path keeping its tail (the file name is the informative part). */
export function truncatePath(path: string, max: number): string {
  if (path.length <= max) return path;
  return `${ELLIPSIS}${path.slice(path.length - (max - 1))}`;
}

/** Makes `path` relative to `cwd` when it lives under it. Pure string logic, no `node:path`. */
export function relativizePath(path: string, cwd: string | undefined): string {
  if (!cwd) return path;
  const base = cwd.endsWith('/') || cwd.endsWith('\\') ? cwd : `${cwd}/`;
  if (path.startsWith(base)) return path.slice(base.length) || path;
  const winBase = base.replace(/\//g, '\\');
  if (path.startsWith(winBase)) return path.slice(winBase.length) || path;
  return path;
}

function str(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

const PATH_KEYS = ['file_path', 'notebook_path', 'path'] as const;
const TEXT_KEYS = [
  'command',
  'description',
  'query',
  'pattern',
  'url',
  'skill',
  'prompt',
  'subject',
] as const;

/**
 * Short, privacy-friendly summary of a tool call: the file path for file tools, the command
 * truncated at 60 chars for Bash, the query for searches, the task description for Agent.
 * Never includes file contents.
 */
export function summarizeToolInput(tool: string, input: unknown, cwd?: string): string {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return '';
  const fields = input as Record<string, unknown>;

  switch (tool) {
    case 'Read':
    case 'Write':
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit': {
      const path = str(fields, 'file_path') ?? str(fields, 'notebook_path');
      return path ? truncatePath(relativizePath(path, cwd), SUMMARY_MAX_LENGTH) : '';
    }
    case 'Bash':
    case 'PowerShell': {
      const command = str(fields, 'command');
      return command ? truncate(command, SUMMARY_MAX_LENGTH) : '';
    }
    case 'Grep':
    case 'Glob': {
      const pattern = str(fields, 'pattern') ?? '';
      const path = str(fields, 'path');
      const where = path ? ` in ${relativizePath(path, cwd)}` : '';
      return truncate(`${pattern}${where}`, SUMMARY_MAX_LENGTH);
    }
    case 'WebSearch':
      return truncate(str(fields, 'query') ?? '', SUMMARY_MAX_LENGTH);
    case 'WebFetch':
      return truncate(str(fields, 'url') ?? '', SUMMARY_MAX_LENGTH);
    case 'Agent':
    case 'Task':
      return truncate(
        str(fields, 'description') ?? str(fields, 'subagent_type') ?? '',
        SUMMARY_MAX_LENGTH,
      );
    default:
      break;
  }

  for (const key of PATH_KEYS) {
    const path = str(fields, key);
    if (path) return truncatePath(relativizePath(path, cwd), SUMMARY_MAX_LENGTH);
  }
  for (const key of TEXT_KEYS) {
    const text = str(fields, key);
    if (text) return truncate(text, SUMMARY_MAX_LENGTH);
  }
  return '';
}
