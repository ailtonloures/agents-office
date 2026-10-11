# Unknown room and phantom sessions (spec 038)

## What went wrong
The reducer used to invent a session plus a project with id `unknown` (empty cwd) whenever an
event addressed a session the model did not have. That placeholder became the "Unknown" room, the
"NOVA SALA unknown" toast, and inflated the HUD and `/health` counts (the "4 sessions" with only 2
real ones).

## Rules
- The reducer never invents sessions or projects. Only `session.started` (which carries a cwd)
  creates them. `agent.spawned`, `session.bound` and every actor event for a missing session leave
  the model unchanged (same object returned).
- Only exception, kept on purpose: an orphan *actor* event with exactly one existing session
  becomes a placeholder agent of that session (`foldStrayAgent` folds it back if the session id
  itself starts later). With 0 or 2+ sessions there is no safe owner, so the event is dropped.
- Counting goes through `liveActors` in `packages/shared/src/model.ts` (HUD `hudCounts` and the
  daemon `/health`). It skips sessions whose project is missing or has an empty cwd, and agents
  of such sessions. New counters must use it, never `Object.values(model.sessions).filter(isLive)`.

## Normalizer dedup marks
`emittedKeys` makes lifecycle events fire once (`session.started:<id>`, `session.ended:<id>`,
`session.bound:<id>:<terminal>`). A mark that outlives its session blocks the resume, so the
session would never get its room back (and, before this fix, the reducer's placeholder masked it).
- `normalizer.sessionEnded(id, ts, source)` forgets those marks and records the end in
  `endedSessions`. The normalizer calls it itself on a `SessionEnd` hook; the daemon calls it for
  non-hook `session.ended` events (clock expiry from `liveness.ts`), because the normalizer never
  sees them.
- A late event must not revive an ended session: after a hook end only a `SessionStart` hook or a
  transcript line newer than the end restarts it (late `Stop` hooks carry a cwd too). After a
  clock expiry any hook with a cwd, or a newer transcript line, is a genuine resume.
- Hooks without a cwd never start a session and the session id never becomes a project id.

## Gotchas
- Order matters: events that precede `session.started` are now dropped, not buffered. The
  normalizer only emits actor events after it started the session, so this holds in practice.
- E2E for the one-session exception would show a phantom agent in the HUD; the orphan E2E uses an
  empty office and then two sessions so the drop path is what is exercised.
