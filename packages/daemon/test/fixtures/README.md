# Normalizer fixtures

Versioned samples of Claude Code transcripts and hook payloads. They pin the format the
normalizer understands: if Claude Code changes its transcripts, re-capture a session and diff.
The transcript format is **not a stable public API**; the notes below are what was observed in
Claude Code 2.1.x transcripts (October 2026).

## Layout

Each fixture mirrors `~/.claude/projects/<cwd-slug>/`:

```
<fixture>/
  fixture.json                                  { "projectSlug", "sessionId" }
  <sessionId>.jsonl                             parent (lead) transcript
  <sessionId>/subagents/agent-<agentId>.jsonl   subagent transcript
  <sessionId>/subagents/agent-<agentId>.meta.json
hooks/<HookEventName>.json                      one hook payload per event
```

| Fixture              | Scenario                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `parallel-subagents` | The lead calls `Agent` 3 times in one message (sync). Each agent ends when its `tool_result` lands in the parent.              |
| `nested-subagent`    | The lead launches a background agent (`run_in_background`), which spawns a nested sync agent (`spawnDepth: 2`). The background agent ends with a `<task-notification>`. |
| `tool-error`         | A `Bash` call fails (`is_error: true`), then an `Edit` succeeds.                                                               |

`test/helpers/fixtures.ts` replays a fixture as the watcher would: all lines merged by
`timestamp`, each meta right after the parent line holding its `Agent` `tool_use`.

The three transcript fixtures are synthetic but built field-for-field on anonymized real
sessions; all text is placeholder, the home directory is `/anon`. Real sessions can be captured
with the script below.

## Capturing a real session

```bash
node packages/daemon/scripts/capture-fixture.ts \
  ~/.claude/projects/<cwd-slug>/<sessionId> <fixture-name> [outDir]
```

The script keeps the structure, ids, `type`, `tool_use`/`tool_result` blocks, `timestamp`, `cwd`,
`isSidechain`, `is_error` and `usage`; it replaces every other string (prompts, thinking, tool
inputs and outputs, descriptions, branch names) with `[redacted]`, keeps only the routing tags of
`<task-notification>`s, drops `signature`s and rewrites the home directory to `/anon`. Always
review the output and grep it for home paths before committing (a test also enforces it).

## Observed transcript format

One JSON object per line. Common fields on conversation records:

| Field                     | Notes                                                                                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `type`                    | `user`, `assistant`, `attachment`, `system`, `queue-operation`, plus bookkeeping types (see below).                    |
| `uuid` / `parentUuid`     | Record id and the previous record of the thread (`null` for the first). Used to dedup re-read lines.                   |
| `timestamp`               | ISO 8601 with `Z`. Source of every event `ts`. Bookkeeping records have none.                                          |
| `sessionId`, `cwd`        | Session id and working directory. `cwd` names the room; the dir slug is the `projectId`.                               |
| `isSidechain`             | `true` on every line of a subagent transcript.                                                                         |
| `agentId`                 | Present on subagent lines; equals the `<agentId>` of the file name.                                                    |
| `message`                 | Anthropic API message: `id`, `role`, `content`, `stop_reason`, `usage`.                                                |
| `toolUseResult`           | On `user` lines carrying a `tool_result`: tool-specific structured result (see below).                                 |
| `sourceToolAssistantUUID` | On `tool_result` lines: `uuid` of the assistant line holding the `tool_use`.                                           |

### `message.content[].type`

- `assistant` lines: **one content block per line**. A message with thinking + 3 tool calls is
  written as 4 lines sharing `message.id`. Blocks: `thinking` (`thinking`, `signature`), `text`,
  `tool_use` (`id`, `name`, `input`).
- `user` lines: a prompt has `content` as a plain string (or `text` blocks); a tool result has a
  `tool_result` block (`tool_use_id`, `content`, `is_error: true` on failure). Harness-injected
  user lines carry `isMeta: true` or start with tags such as `<command-name>`.

### `message.usage`

`input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`,
`service_tier`, ... The same usage is **repeated on every line of a message**, with
`output_tokens` growing up to the last block. The normalizer reports usage per `message.id` as
increments, with input = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.

### Subagents

- `agent-<agentId>.meta.json`: `{ agentType, description, toolUseId, spawnDepth, parentAgentId?,
  requestShape?, requestNonInteractive? }`. No timestamp: the spawn `ts` is taken from the
  `tool_use` line whose `id` equals `toolUseId`. Nested agents carry `parentAgentId` and
  `spawnDepth: 2`; without it, the parent is the agent whose transcript holds that `tool_use`.
- The `Agent` tool (`Task` in older versions) `tool_result` in the caller's transcript has
  `toolUseResult = { status, agentId, agentType?, content, totalTokens, usage, ... }`.
  - `status: "completed"` (sync agent): the agent is finished.
  - `status: "async_launched"`, `isAsync: true` (background agent): only the launch; the end
    arrives later in the **session** transcript as a `queue-operation` (`operation:
    "enqueue"`/`"remove"`) and an `attachment` (`type: "queued_command"`) whose text holds
    `<task-notification><task-id>agentId</task-id><tool-use-id>…</tool-use-id><status>completed</status>…`.
    Background shell tasks use the same notification with a `Bash` tool use id.

### Bookkeeping records (ignored)

`system` (e.g. `subtype: "turn_duration"`), `file-history-snapshot`, `file-history-delta`,
`mode`, `permission-mode`, `last-prompt`, `atis-latch`, `bridge-session`, `ai-title`,
`agent-name`, `cost-state`. Records of any other unknown type are counted in `stats.skipped`.

## Hook payloads

`hooks/*.json` follow the Claude Code hook stdin format: every payload has `hook_event_name`,
`session_id`, `transcript_path` and `cwd`. Event-specific fields: `tool_name`, `tool_input`,
`tool_use_id` and `tool_response` (Pre/PostToolUse), `agent_id`/`agent_type` (SubagentStart/Stop,
and on any hook fired inside a subagent), `message`/`notification_type` (Notification), `prompt`
(UserPromptSubmit), `source` (SessionStart), `reason` (SessionEnd). Hooks have no timestamp: the
daemon passes its receive time.
