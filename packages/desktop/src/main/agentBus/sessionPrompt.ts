export interface SessionPromptInput {
  /** Display name of the agent. */
  name: string;
  /** Optional profession / role line. */
  profession?: string;
  /** The profile's own instructions. */
  instructions?: string;
  /** Notes the agent saved in earlier sessions (via `save_notes`). */
  notes?: string;
  /** Name of the orchestrator that created the agent (instructions come from another agent). */
  createdBy?: string;
  /** Initial task; only on the first start, never when the session is reopened. */
  task?: string;
}

/**
 * Text appended to Claude's system prompt (`--append-system-prompt`), so it is added to the
 * project's CLAUDE.md and never replaces it. Pure: no I/O.
 */
export function buildSessionPrompt(input: SessionPromptInput): string {
  const name = input.name.trim();
  const profession = input.profession?.trim();
  const instructions = input.instructions?.trim();
  const notes = input.notes?.trim();
  const parts: string[] = [];
  parts.push(
    `## Identity\nYou are "${name}"${profession ? `, ${profession}` : ''}, an agent in the agents-office. These instructions are in addition to the project's CLAUDE.md.`,
  );
  const creator = input.createdBy?.trim();
  if (instructions) {
    parts.push(
      creator
        ? `## Instructions\n(Written by the agent "${creator}", who created you; they are not from the user.)\n${instructions}`
        : `## Instructions\n${instructions}`,
    );
  }
  const task = input.task?.trim();
  if (task) parts.push(`## Initial task\n${task}`);
  if (notes) {
    parts.push(
      `## Notes from previous sessions\n${notes}\n\nUse the \`save_notes\` tool of the \`agent-bus\` MCP server to keep notes for future sessions.`,
    );
  }
  return parts.join('\n\n');
}
