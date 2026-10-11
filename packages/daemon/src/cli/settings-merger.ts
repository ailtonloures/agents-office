import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

export const HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'SubagentStart',
  'SubagentStop',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'UserPromptSubmit',
  'PermissionRequest',
] as const;
export type HookEventName = (typeof HOOK_EVENTS)[number];

/** Events whose hook groups accept a `matcher`. */
const MATCHER_EVENTS: ReadonlySet<string> = new Set([
  'PreToolUse',
  'PostToolUse',
  'PermissionRequest',
]);

/**
 * Hook `timeout` (seconds) per event. PermissionRequest waits for a human, so it gets 24 h (accepted
 * by Claude Code per spike 013; never 0, negative or a string). Other events use the default.
 */
const EVENT_TIMEOUT_SECONDS: Readonly<Partial<Record<string, number>>> = {
  PermissionRequest: 86400,
};

/** Matches `.../agents-office.mjs hook` (optionally quoted / followed by flags). */
const MARKER = /agents-office(?:\.mjs)?["']?\s+hook(?:\s|$)/;

export const BACKUP_SUFFIX = '.agents-office.bak';

type Json = Record<string, unknown>;

export function defaultSettingsPath(): string {
  return join(homedir(), '.claude', 'settings.json');
}

function quote(arg: string): string {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `"${arg.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** `node /abs/bin/agents-office.mjs hook [--port n]`: no dependency on the PATH of Claude Code. */
export function buildHookCommand(nodePath: string, binPath: string, port?: number): string {
  const parts = [quote(nodePath), quote(binPath), 'hook'];
  if (port !== undefined) parts.push('--port', String(port));
  return parts.join(' ');
}

export function isOurCommand(command: unknown): boolean {
  return typeof command === 'string' && MARKER.test(command);
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function groupHooks(group: unknown): Json[] {
  if (!isRecord(group) || !Array.isArray(group.hooks)) return [];
  return group.hooks.filter(isRecord);
}

function hasOurs(group: unknown): boolean {
  return groupHooks(group).some((hook) => isOurCommand(hook.command));
}

interface Parsed {
  settings: Json;
  indent: string | number;
  trailingNewline: boolean;
}

function parseSettings(text: string | undefined, label: string): Parsed {
  if (text === undefined) return { settings: {}, indent: 2, trailingNewline: true };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON (${(error as Error).message}); not touching it.`);
  }
  if (!isRecord(value)) throw new Error(`${label} must contain a JSON object; not touching it.`);
  const indentMatch = /^[{[]\r?\n([ \t]+)\S/.exec(text);
  const indent = indentMatch?.[1]?.includes('\t') ? '\t' : (indentMatch?.[1]?.length ?? 2);
  return { settings: value, indent, trailingNewline: text.endsWith('\n') };
}

function serialize({ settings, indent, trailingNewline }: Parsed): string {
  return JSON.stringify(settings, null, indent) + (trailingNewline ? '\n' : '');
}

function hooksOf(settings: Json, label: string): Json | undefined {
  if (settings.hooks === undefined) return undefined;
  if (!isRecord(settings.hooks)) throw new Error(`${label}: "hooks" must be an object.`);
  return settings.hooks;
}

export interface MergeResult {
  /** New file content, or `null` when the file should be deleted. */
  text: string | null;
  changed: boolean;
}

/** Adds our hook group to every event. Idempotent: existing entries are kept (command refreshed). */
export function applyInstall(
  text: string | undefined,
  command: string,
  label = 'settings',
): MergeResult {
  const parsed = parseSettings(text, label);
  const { settings } = parsed;
  const hooks = hooksOf(settings, label) ?? {};
  for (const event of HOOK_EVENTS) {
    const existing = hooks[event];
    if (existing !== undefined && !Array.isArray(existing)) {
      throw new Error(`${label}: hooks.${event} must be an array.`);
    }
    const groups: unknown[] = existing ?? [];
    let found = false;
    for (const group of groups) {
      for (const hook of groupHooks(group)) {
        if (!isOurCommand(hook.command)) continue;
        found = true;
        hook.command = command;
        const timeout = EVENT_TIMEOUT_SECONDS[event];
        if (timeout !== undefined) hook.timeout = timeout;
      }
    }
    if (!found) {
      groups.push({
        ...(MATCHER_EVENTS.has(event) ? { matcher: '*' } : {}),
        hooks: [
          {
            type: 'command',
            command,
            ...(EVENT_TIMEOUT_SECONDS[event] !== undefined
              ? { timeout: EVENT_TIMEOUT_SECONDS[event] }
              : {}),
          },
        ],
      });
    }
    hooks[event] = groups;
  }
  settings.hooks = hooks;
  const next = serialize(parsed);
  return { text: next, changed: next !== text };
}

/**
 * Removes only our entries. Groups/arrays/keys left empty by that removal are dropped; if
 * nothing is left at all the file itself is to be deleted (we created it).
 */
export function applyUninstall(text: string, label = 'settings'): MergeResult {
  const parsed = parseSettings(text, label);
  const { settings } = parsed;
  const hooks = hooksOf(settings, label);
  let removed = false;
  if (hooks) {
    for (const event of Object.keys(hooks)) {
      const groups = hooks[event];
      if (!Array.isArray(groups)) continue;
      const kept: unknown[] = [];
      let touched = false;
      for (const group of groups) {
        if (!hasOurs(group)) {
          kept.push(group);
          continue;
        }
        touched = true;
        const g = group as Json;
        const others = (g.hooks as unknown[]).filter(
          (hook) => !isRecord(hook) || !isOurCommand(hook.command),
        );
        if (others.length > 0) kept.push({ ...g, hooks: others });
      }
      if (!touched) continue;
      removed = true;
      if (kept.length > 0) hooks[event] = kept;
      else delete hooks[event];
    }
    if (removed && Object.keys(hooks).length === 0) delete settings.hooks;
  }
  if (!removed) return { text, changed: false };
  if (Object.keys(settings).length === 0) return { text: null, changed: true };
  return { text: serialize(parsed), changed: true };
}

export type InstalledMap = Record<HookEventName, boolean>;

export function readInstalled(text: string | undefined, label = 'settings'): InstalledMap {
  const { settings } = parseSettings(text, label);
  const hooks = hooksOf(settings, label);
  const result = {} as InstalledMap;
  for (const event of HOOK_EVENTS) {
    const groups = hooks?.[event];
    result[event] = Array.isArray(groups) && groups.some(hasOurs);
  }
  return result;
}

/** Minimal line diff (LCS) in unified-ish form: `+`/`-` for changes, two spaces for context. */
export function renderDiff(before: string | null, after: string | null): string {
  const a = before === null ? [] : before.split('\n');
  const b = after === null ? [] : after.split('\n');
  const width = b.length + 1;
  const table = new Int32Array((a.length + 1) * width);
  const at = (x: number, y: number): number => table[x * width + y] ?? 0;
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push(`  ${a[i]}`);
      i++;
      j++;
    } else if (at(i + 1, j) >= at(i, j + 1)) {
      out.push(`- ${a[i++]}`);
    } else {
      out.push(`+ ${b[j++]}`);
    }
  }
  while (i < a.length) out.push(`- ${a[i++]}`);
  while (j < b.length) out.push(`+ ${b[j++]}`);
  return out.join('\n');
}

function readIfExists(path: string): string | undefined {
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

export interface InstallOutcome {
  path: string;
  changed: boolean;
  dryRun: boolean;
  diff: string;
  backupPath?: string;
}

export function installHooks(options: {
  settingsPath: string;
  command: string;
  dryRun?: boolean;
}): InstallOutcome {
  const path = resolve(options.settingsPath);
  const before = readIfExists(path);
  const result = applyInstall(before, options.command, path);
  const diff = renderDiff(before ?? null, result.text);
  if (options.dryRun || !result.changed || result.text === null) {
    return { path, changed: result.changed, dryRun: options.dryRun === true, diff };
  }
  mkdirSync(dirname(path), { recursive: true });
  const outcome: InstallOutcome = { path, changed: true, dryRun: false, diff };
  const backupPath = path + BACKUP_SUFFIX;
  if (before !== undefined && !existsSync(backupPath)) {
    writeFileSync(backupPath, before);
    outcome.backupPath = backupPath;
  }
  writeFileSync(path, result.text);
  return outcome;
}

export function uninstallHooks(options: { settingsPath: string; dryRun?: boolean }): {
  path: string;
  changed: boolean;
  deleted: boolean;
  diff: string;
} {
  const path = resolve(options.settingsPath);
  const before = readIfExists(path);
  if (before === undefined) return { path, changed: false, deleted: false, diff: '' };
  const result = applyUninstall(before, path);
  const diff = renderDiff(before, result.text);
  if (options.dryRun !== true && result.changed) {
    if (result.text === null) rmSync(path);
    else writeFileSync(path, result.text);
  }
  return { path, changed: result.changed, deleted: result.text === null, diff };
}

export function statusHooks(settingsPath: string): { path: string; installed: InstalledMap } {
  const path = resolve(settingsPath);
  return { path, installed: readInstalled(readIfExists(path), path) };
}
