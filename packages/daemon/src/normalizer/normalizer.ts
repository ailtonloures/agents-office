import {
  type HookPayload,
  IsoTimestampSchema,
  isKnownHookEvent,
  type OfficeEvent,
  parseHookPayload,
  parseOfficeEvent,
} from '@agents-office/shared';
import {
  contentBlocks,
  getNumber,
  getObject,
  getString,
  IGNORED_RECORD_TYPES,
  isObject,
  type JsonObject,
  parentDirName,
  parseJsonLine,
  parseTaskNotifications,
  slugifyCwd,
  userText,
} from './records';
import { PROMPT_SUMMARY_MAX_LENGTH, summarizeToolInput, truncate } from './summary';
import type {
  AgentMetaInput,
  HookInput,
  Normalizer,
  NormalizerInput,
  NormalizerStats,
} from './types';

type Source = 'jsonl' | 'hook';

/** Tool names that spawn a subagent (`Task` is the pre-2.x name of `Agent`). */
const AGENT_TOOLS: ReadonlySet<string> = new Set(['Agent', 'Task']);

/** Default agent type of Claude Code when the Agent tool is called without `subagent_type`. */
const DEFAULT_AGENT_TYPE = 'general-purpose';

/** Task-notification statuses that do not mean the task is over. */
const RUNNING_TASK_STATUSES: ReadonlySet<string> = new Set(['running', 'pending', 'started']);

interface Actor {
  id: string;
  isAgent: boolean;
}

interface ToolUseInfo {
  actorId: string;
  /** True when the tool_use was issued by a subagent (so a spawned agent is nested). */
  byAgent: boolean;
  tool: string;
  ts: string;
}

interface PendingFinish {
  ts: string;
  source: Source;
}

function validTs(value: unknown): string | undefined {
  return IsoTimestampSchema.safeParse(value).success ? (value as string) : undefined;
}

function nonNegativeInt(value: number | undefined): number {
  return value !== undefined && value > 0 ? Math.round(value) : 0;
}

/** True for text a human typed, as opposed to harness-injected tags such as `<command-name>`. */
function isHumanPrompt(text: string): boolean {
  const trimmed = text.trimStart();
  return trimmed !== '' && !trimmed.startsWith('<') && !trimmed.startsWith('[Request interrupted');
}

/** Whether a PostToolUse `tool_response` reports success. Tolerant: unknown shapes are ok. */
function hookToolOk(response: unknown): boolean {
  if (!isObject(response)) return true;
  if (response.is_error === true || response.success === false) return false;
  return !(typeof response.error === 'string' && response.error !== '');
}

/**
 * Creates a pure normalizer: Claude Code transcript lines, subagent `.meta.json` files and hook
 * payloads in, canonical `OfficeEvent`s out. Its state only serves correlation (tool_use owner,
 * agent <-> toolUseId) and deduplication between sources; it does no I/O and never reads the clock.
 *
 * Dedup: lifecycle events are keyed by `(type, toolUseId | agentId | sessionId)` and emitted once,
 * whichever source (hook or JSONL) arrives first; JSONL lines are also deduplicated by `uuid`.
 * When the second source brings agent fields the first lacked, an `agent.updated` is emitted.
 */
export function createNormalizer(): Normalizer {
  const stats: NormalizerStats = { skipped: 0, ignored: 0, duplicates: 0 };

  const emittedKeys = new Set<string>();
  const seenUuids = new Set<string>();
  const sessionCwd = new Map<string, string>();
  /**
   * Sessions that left the model, with when. A late event of such a session must not bring it
   * back; only a resume does: a `SessionStart` hook, a transcript line newer than the end, or (for
   * an expiry, where silence is the only signal) any hook that tells where the session runs.
   */
  const endedSessions = new Map<string, { ts: number; byHook: boolean }>();
  const toolUses = new Map<string, ToolUseInfo>();
  const agentByToolUse = new Map<string, string>();
  /** Spawned agents; `fromMeta` tells whether the meta (richest source) was already applied. */
  const agents = new Map<string, { fromMeta: boolean; spawnDepth: number }>();
  const agentFirstTs = new Map<string, string>();
  /** Metas whose spawn time is not known yet, by agentId. */
  const pendingMetas = new Map<string, AgentMetaInput>();
  /** Agent completions seen before the agent was spawned, by the Agent tool_use id. */
  const pendingFinishes = new Map<string, PendingFinish>();
  /** Usage already reported per API message id (a message spans one line per content block). */
  const usageByMessage = new Map<string, { input: number; output: number }>();

  let out: OfficeEvent[] = [];

  function emit(event: OfficeEvent, dedupKey?: string): boolean {
    if (dedupKey !== undefined && emittedKeys.has(dedupKey)) return false;
    const parsed = parseOfficeEvent(event);
    if (!parsed.success) {
      stats.skipped += 1;
      return false;
    }
    if (dedupKey !== undefined) emittedKeys.add(dedupKey);
    out.push(parsed.data);
    return true;
  }

  // -------------------------------------------------------------------------
  // Shared correlation helpers
  // -------------------------------------------------------------------------

  function startSession(
    sessionId: string,
    projectId: string,
    cwd: string,
    ts: string,
    source: Source,
  ) {
    const ended = endedSessions.get(sessionId);
    if (ended !== undefined) {
      if (source === 'jsonl' && Date.parse(ts) <= ended.ts) return;
      endedSessions.delete(sessionId);
    }
    emit(
      { type: 'session.started', sessionId, projectId, cwd, ts, source },
      `session.started:${sessionId}`,
    );
  }

  function sessionEnded(sessionId: string, ts: string, source: OfficeEvent['source']) {
    emittedKeys.delete(`session.started:${sessionId}`);
    emittedKeys.delete(`session.ended:${sessionId}`);
    for (const key of emittedKeys) {
      if (key.startsWith(`session.bound:${sessionId}:`)) emittedKeys.delete(key);
    }
    const parsed = Date.parse(ts);
    if (!Number.isNaN(parsed))
      endedSessions.set(sessionId, { ts: parsed, byHook: source === 'hook' });
  }

  function recordToolUse(toolUseId: string, info: ToolUseInfo) {
    if (!toolUses.has(toolUseId)) toolUses.set(toolUseId, info);
    for (const meta of pendingMetas.values()) {
      if (isObject(meta.meta) && getString(meta.meta, 'toolUseId') === toolUseId) {
        spawnFromMeta(meta, info.ts);
      }
    }
  }

  function finishAgent(agentId: string, ts: string, source: Source) {
    emit({ type: 'agent.finished', agentId, ts, source }, `agent.finished:${agentId}`);
  }

  function finishAgentByToolUse(toolUseId: string, ts: string, source: Source) {
    const agentId = agentByToolUse.get(toolUseId);
    if (agentId !== undefined && agents.has(agentId)) {
      finishAgent(agentId, ts, source);
    } else if (!pendingFinishes.has(toolUseId)) {
      pendingFinishes.set(toolUseId, { ts, source });
    }
  }

  function flushPendingFinish(toolUseId: string, agentId: string) {
    const pending = pendingFinishes.get(toolUseId);
    if (pending === undefined) return;
    pendingFinishes.delete(toolUseId);
    finishAgent(agentId, pending.ts, pending.source);
  }

  /**
   * The result of an Agent tool call ends the subagent, unless it only reports an async launch
   * (`run_in_background`): then the end comes later as a `<task-notification>`.
   */
  function handleAgentToolResult(
    toolUseId: string,
    result: JsonObject | undefined,
    ts: string,
    source: Source,
  ) {
    const hintedAgentId = result ? getString(result, 'agentId') : undefined;
    const isAgentTool =
      agentByToolUse.has(toolUseId) ||
      hintedAgentId !== undefined ||
      AGENT_TOOLS.has(toolUses.get(toolUseId)?.tool ?? '');
    if (!isAgentTool) return;
    if (hintedAgentId !== undefined && !agentByToolUse.has(toolUseId)) {
      agentByToolUse.set(toolUseId, hintedAgentId);
    }
    if (result && getString(result, 'status') === 'async_launched') return;
    finishAgentByToolUse(toolUseId, ts, source);
  }

  function handleTaskNotifications(text: string, ts: string): boolean {
    const notifications = parseTaskNotifications(text);
    for (const notification of notifications) {
      const { toolUseId, taskId, status } = notification;
      if (toolUseId === undefined || status === undefined || RUNNING_TASK_STATUSES.has(status)) {
        continue;
      }
      const info = toolUses.get(toolUseId);
      // Background shell tasks also notify; only Agent tool uses end a subagent.
      if (info !== undefined && !AGENT_TOOLS.has(info.tool)) continue;
      if (taskId !== undefined && info !== undefined && !agentByToolUse.has(toolUseId)) {
        agentByToolUse.set(toolUseId, taskId);
      }
      finishAgentByToolUse(toolUseId, ts, 'jsonl');
    }
    return notifications.length > 0;
  }

  // -------------------------------------------------------------------------
  // JSONL transcripts
  // -------------------------------------------------------------------------

  function handleAssistant(record: JsonObject, ts: string, sessionId: string, actor: Actor) {
    let toolUseCount = 0;
    let thought = false;
    for (const block of contentBlocks(record)) {
      if (block.type === 'tool_use') {
        const toolUseId = getString(block, 'id');
        const tool = getString(block, 'name');
        if (toolUseId === undefined || tool === undefined) continue;
        toolUseCount += 1;
        recordToolUse(toolUseId, { actorId: actor.id, byAgent: actor.isAgent, tool, ts });
        emit(
          {
            type: 'tool.started',
            actorId: actor.id,
            toolUseId,
            tool,
            summary: summarizeToolInput(tool, block.input, sessionCwd.get(sessionId)),
            ts,
            source: 'jsonl',
          },
          `tool.started:${toolUseId}`,
        );
      } else if (
        block.type === 'text' ||
        block.type === 'thinking' ||
        block.type === 'redacted_thinking'
      ) {
        thought = true;
      }
    }
    if (toolUseCount === 0 && thought) {
      emit({ type: 'actor.thinking', actorId: actor.id, ts, source: 'jsonl' });
    }
    handleUsage(record, ts, actor);
  }

  /**
   * Claude Code writes one line per content block and repeats the message's `usage` on each,
   * with `output_tokens` growing until the last block. Only the increase is reported, so that
   * summing `usage` events gives the true total. Input tokens include cache reads and writes.
   */
  function handleUsage(record: JsonObject, ts: string, actor: Actor) {
    const message = getObject(record, 'message');
    const usage = message ? getObject(message, 'usage') : undefined;
    if (message === undefined || usage === undefined) return;
    const input =
      nonNegativeInt(getNumber(usage, 'input_tokens')) +
      nonNegativeInt(getNumber(usage, 'cache_creation_input_tokens')) +
      nonNegativeInt(getNumber(usage, 'cache_read_input_tokens'));
    const output = nonNegativeInt(getNumber(usage, 'output_tokens'));
    const messageId = getString(message, 'id');
    const previous = messageId !== undefined ? usageByMessage.get(messageId) : undefined;
    const inputTokens = Math.max(0, input - (previous?.input ?? 0));
    const outputTokens = Math.max(0, output - (previous?.output ?? 0));
    if (messageId !== undefined) {
      usageByMessage.set(messageId, {
        input: Math.max(input, previous?.input ?? 0),
        output: Math.max(output, previous?.output ?? 0),
      });
    }
    if (inputTokens > 0 || outputTokens > 0) {
      emit({ type: 'usage', actorId: actor.id, inputTokens, outputTokens, ts, source: 'jsonl' });
    }
  }

  function handleUser(record: JsonObject, ts: string, actor: Actor) {
    const results = contentBlocks(record).filter((block) => block.type === 'tool_result');
    // `toolUseResult` describes the line's single tool_result (Claude Code writes one per line).
    const toolUseResult =
      results.length === 1
        ? getObject(record, 'toolUseResult')
        : (undefined as JsonObject | undefined);
    for (const result of results) {
      const toolUseId = getString(result, 'tool_use_id');
      if (toolUseId === undefined) continue;
      emit(
        {
          type: 'tool.finished',
          actorId: toolUses.get(toolUseId)?.actorId ?? actor.id,
          toolUseId,
          ok: result.is_error !== true,
          ts,
          source: 'jsonl',
        },
        `tool.finished:${toolUseId}`,
      );
      handleAgentToolResult(toolUseId, toolUseResult, ts, 'jsonl');
    }
    if (results.length > 0 || actor.isAgent || record.isMeta === true) return;
    const text = userText(record);
    if (text !== undefined && isHumanPrompt(text)) {
      emit({
        type: 'actor.thinking',
        actorId: actor.id,
        lastPromptSummary: truncate(text, PROMPT_SUMMARY_MAX_LENGTH),
        ts,
        source: 'jsonl',
      });
    }
  }

  function ingestTranscriptLine(
    line: unknown,
    sessionId: string,
    actor: Actor,
    projectSlug: string | undefined,
  ) {
    const record = typeof line === 'string' ? parseJsonLine(line) : undefined;
    if (record === undefined) {
      stats.skipped += 1;
      return;
    }
    const uuid = getString(record, 'uuid');
    if (uuid !== undefined) {
      if (seenUuids.has(uuid)) {
        stats.duplicates += 1;
        return;
      }
      seenUuids.add(uuid);
    }

    const type = getString(record, 'type');
    const ts = validTs(record.timestamp);
    const cwd = getString(record, 'cwd');
    if (cwd !== undefined && !sessionCwd.has(sessionId)) sessionCwd.set(sessionId, cwd);

    // First line of an unknown session that tells where it runs => session.started.
    if (projectSlug !== undefined && ts !== undefined && cwd !== undefined) {
      startSession(sessionId, projectSlug, cwd, ts, 'jsonl');
    }
    if (actor.isAgent && ts !== undefined && !agentFirstTs.has(actor.id)) {
      agentFirstTs.set(actor.id, ts);
      const pending = pendingMetas.get(actor.id);
      if (pending !== undefined) spawnFromMeta(pending, ts);
    }

    switch (type) {
      case 'assistant':
        if (ts === undefined) stats.skipped += 1;
        else handleAssistant(record, ts, sessionId, actor);
        return;
      case 'user':
        if (ts === undefined) stats.skipped += 1;
        else handleUser(record, ts, actor);
        return;
      case 'queue-operation': {
        const content = getString(record, 'content');
        const handled =
          ts !== undefined && content !== undefined && handleTaskNotifications(content, ts);
        if (!handled) stats.ignored += 1;
        return;
      }
      case 'attachment': {
        const prompt = getString(getObject(record, 'attachment') ?? {}, 'prompt');
        const handled =
          ts !== undefined && prompt !== undefined && handleTaskNotifications(prompt, ts);
        if (!handled) stats.ignored += 1;
        return;
      }
      default:
        if (type !== undefined && IGNORED_RECORD_TYPES.has(type)) stats.ignored += 1;
        else stats.skipped += 1;
    }
  }

  // -------------------------------------------------------------------------
  // Subagent meta
  // -------------------------------------------------------------------------

  function spawnFromMeta(input: AgentMetaInput, ts: string) {
    pendingMetas.delete(input.agentId);
    if (!isObject(input.meta)) return;
    const meta = input.meta;
    const { agentId, sessionId } = input;
    const toolUseId = getString(meta, 'toolUseId');
    const owner = toolUseId !== undefined ? toolUses.get(toolUseId) : undefined;
    const parentAgentId =
      getString(meta, 'parentAgentId') ?? (owner?.byAgent ? owner.actorId : undefined);
    const depth = getNumber(meta, 'spawnDepth');
    const spawnDepth =
      depth !== undefined && Number.isInteger(depth) && depth >= 1
        ? depth
        : parentAgentId !== undefined
          ? (agents.get(parentAgentId)?.spawnDepth ?? 1) + 1
          : 1;
    const fields = {
      agentId,
      ...(parentAgentId !== undefined ? { parentAgentId } : {}),
      agentType: getString(meta, 'agentType') ?? DEFAULT_AGENT_TYPE,
      description: getString(meta, 'description') ?? '',
      spawnDepth,
      ts,
      source: 'jsonl' as const,
    };

    const existing = agents.get(agentId);
    agents.set(agentId, { fromMeta: true, spawnDepth });
    if (existing !== undefined) {
      // Spawned first by the SubagentStart hook, which lacks description, depth and parent.
      emit({ type: 'agent.updated', ...fields }, `agent.updated:${agentId}`);
    } else {
      emit({ type: 'agent.spawned', sessionId, ...fields }, `agent.spawned:${agentId}`);
    }
    if (toolUseId !== undefined) flushPendingFinish(toolUseId, agentId);
  }

  function ingestMeta(input: AgentMetaInput) {
    if (!isObject(input.meta) || !input.agentId || !input.sessionId) {
      stats.skipped += 1;
      return;
    }
    if (agents.get(input.agentId)?.fromMeta) {
      stats.duplicates += 1;
      return;
    }
    const toolUseId = getString(input.meta, 'toolUseId');
    if (toolUseId !== undefined) agentByToolUse.set(toolUseId, input.agentId);
    // A meta has no timestamp: the spawn time is the parent's tool_use, else the first line of
    // the agent transcript, else what the caller observed. Otherwise wait for one of them.
    const ts =
      (toolUseId !== undefined ? toolUses.get(toolUseId)?.ts : undefined) ??
      agentFirstTs.get(input.agentId) ??
      validTs(input.observedAt);
    if (ts === undefined) pendingMetas.set(input.agentId, input);
    else spawnFromMeta(input, ts);
  }

  // -------------------------------------------------------------------------
  // Hooks
  // -------------------------------------------------------------------------

  function startSessionFromHook(payload: HookPayload, ts: string) {
    const sessionId = payload.session_id;
    if (emittedKeys.has(`session.started:${sessionId}`)) return;
    // Any hook of an unknown session starts it, as long as it tells where the session runs.
    // Without a cwd there is no project to name, so nothing starts.
    if (!payload.cwd) return;
    const ended = endedSessions.get(sessionId);
    // A hook-ended session only comes back with SessionStart (a late Stop must not revive it).
    if (ended?.byHook && payload.hook_event_name !== 'SessionStart') return;
    const projectId =
      (payload.transcript_path ? parentDirName(payload.transcript_path) : undefined) ??
      slugifyCwd(payload.cwd);
    startSession(sessionId, projectId, payload.cwd, ts, 'hook');
  }

  /**
   * The `hook` command adds the terminal tab id when the session runs inside the desktop app. The
   * binding is its own event because the hook can arrive before or after the transcript lines
   * that start the session; it waits for the session to be known.
   */
  function bindTerminal(payload: HookPayload, ts: string) {
    const { session_id: sessionId, terminalId } = payload;
    if (terminalId === undefined || !emittedKeys.has(`session.started:${sessionId}`)) return;
    emit(
      { type: 'session.bound', sessionId, terminalId, ts, source: 'hook' },
      `session.bound:${sessionId}:${terminalId}`,
    );
  }

  function spawnFromHook(payload: HookPayload, agentId: string, ts: string) {
    if (agents.has(agentId)) return;
    const pendingMeta = pendingMetas.get(agentId);
    if (pendingMeta !== undefined) {
      spawnFromMeta(pendingMeta, ts);
      return;
    }
    agents.set(agentId, { fromMeta: false, spawnDepth: 1 });
    emit(
      {
        type: 'agent.spawned',
        agentId,
        sessionId: payload.session_id,
        agentType: payload.agent_type ?? DEFAULT_AGENT_TYPE,
        description: '',
        spawnDepth: 1,
        ts,
        source: 'hook',
      },
      `agent.spawned:${agentId}`,
    );
    for (const [toolUseId, mappedAgentId] of agentByToolUse) {
      if (mappedAgentId === agentId) flushPendingFinish(toolUseId, agentId);
    }
  }

  function ingestHook(input: HookInput) {
    const ts = validTs(input.receivedAt);
    const parsed = parseHookPayload(input.payload);
    if (ts === undefined || !parsed.success) {
      stats.skipped += 1;
      return;
    }
    const payload = parsed.data;
    const event = payload.hook_event_name;
    if (!isKnownHookEvent(event)) {
      stats.ignored += 1;
      return;
    }
    const sessionId = payload.session_id;
    if (payload.cwd && !sessionCwd.has(sessionId)) sessionCwd.set(sessionId, payload.cwd);
    if (event !== 'SessionEnd') {
      startSessionFromHook(payload, ts);
      if (endedSessions.has(sessionId)) {
        stats.ignored += 1;
        return;
      }
      bindTerminal(payload, ts);
    }
    // Hooks fired inside a subagent carry its agent_id.
    const actorId = payload.agent_id ?? sessionId;

    switch (event) {
      case 'SessionStart':
        return;
      case 'SessionEnd':
        emit(
          { type: 'session.ended', sessionId, reason: 'hook', ts, source: 'hook' },
          `session.ended:${sessionId}`,
        );
        sessionEnded(sessionId, ts, 'hook');
        return;
      case 'SubagentStart':
        if (payload.agent_id === undefined) stats.skipped += 1;
        else spawnFromHook(payload, payload.agent_id, ts);
        return;
      case 'SubagentStop':
        if (payload.agent_id === undefined) stats.skipped += 1;
        else finishAgent(payload.agent_id, ts, 'hook');
        return;
      case 'PreToolUse': {
        const { tool_use_id: toolUseId, tool_name: tool } = payload;
        if (!toolUseId || !tool) {
          stats.skipped += 1;
          return;
        }
        recordToolUse(toolUseId, { actorId, byAgent: payload.agent_id !== undefined, tool, ts });
        emit(
          {
            type: 'tool.started',
            actorId,
            toolUseId,
            tool,
            summary: summarizeToolInput(tool, payload.tool_input, sessionCwd.get(sessionId)),
            ts,
            source: 'hook',
          },
          `tool.started:${toolUseId}`,
        );
        return;
      }
      case 'PostToolUse': {
        const toolUseId = payload.tool_use_id;
        if (!toolUseId) {
          stats.skipped += 1;
          return;
        }
        emit(
          {
            type: 'tool.finished',
            actorId: toolUses.get(toolUseId)?.actorId ?? actorId,
            toolUseId,
            ok: hookToolOk(payload.tool_response),
            ts,
            source: 'hook',
          },
          `tool.finished:${toolUseId}`,
        );
        if (AGENT_TOOLS.has(payload.tool_name ?? '') || agentByToolUse.has(toolUseId)) {
          const response = isObject(payload.tool_response) ? payload.tool_response : undefined;
          handleAgentToolResult(toolUseId, response, ts, 'hook');
        }
        return;
      }
      case 'Notification':
        emit({ type: 'actor.waiting', actorId, ts, source: 'hook' });
        return;
      case 'Stop':
        emit({ type: 'actor.idle', actorId: sessionId, ts, source: 'hook' });
        return;
      case 'UserPromptSubmit':
        emit({
          type: 'actor.thinking',
          actorId: sessionId,
          ...(payload.prompt
            ? { lastPromptSummary: truncate(payload.prompt, PROMPT_SUMMARY_MAX_LENGTH) }
            : {}),
          ts,
          source: 'hook',
        });
        return;
    }
  }

  // -------------------------------------------------------------------------

  function dispatch(input: NormalizerInput) {
    switch (input.kind) {
      case 'session-line':
        ingestTranscriptLine(
          input.line,
          input.sessionId,
          { id: input.sessionId, isAgent: false },
          input.projectSlug,
        );
        return;
      case 'agent-line':
        ingestTranscriptLine(
          input.line,
          input.sessionId,
          { id: input.agentId, isAgent: true },
          undefined,
        );
        return;
      case 'agent-meta':
        ingestMeta(input);
        return;
      case 'hook':
        ingestHook(input);
        return;
      default:
        stats.skipped += 1;
    }
  }

  return {
    stats,
    sessionEnded,
    ingest(input: NormalizerInput): OfficeEvent[] {
      out = [];
      try {
        if (!isObject(input)) stats.skipped += 1;
        else dispatch(input);
      } catch {
        // Defensive: the normalizer must never take the daemon down.
        stats.skipped += 1;
      }
      const events = out;
      out = [];
      return events;
    },
  };
}
