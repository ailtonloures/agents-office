# Desk count and finished agents

- The shared model keeps finished subagents with status `finished` until the session ends (the delivery/leave animation needs that status). Only `ended` is dropped, and no agent ever gets `ended`.
- Counting `status !== 'ended'` for the layout therefore never shrinks the room. Use `isLive(agent)` (not `finished`/`ended`) plus agents whose character is still in the scene (`CharacterController.agentsInUse()`), passed to `LayoutInputBuilder.build(model, retainedSessions, retainedAgents)`.
- The scene recomputes the layout when a character is removed (`onGone` marks the scene dirty), so the room shrinks right after the exit animation, not only on model changes.
- Desks are identified by index: shrinking removes the highest-index desk. `DeskAssignments.reconcile` releases vanished desks and the next goal resolution reseats the still-active agent (it may walk to a new desk).
- Ghost sessions (ended, still retained) reuse their last known agent count.
- The e2e check compares total room area (`window.__office.rooms`) before and after agents leave.
