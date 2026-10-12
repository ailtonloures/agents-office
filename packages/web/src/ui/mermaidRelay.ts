import type { BoardBridge } from '@agents-office/shared';

/** Converts Mermaid source into whiteboard skeletons; injectable for tests. */
export type MermaidConverter = (definition: string) => Promise<unknown[]>;

const loadConverter: MermaidConverter = async (definition) => {
  const module = await import('./mermaidConvert');
  return module.convertMermaid(definition);
};

/**
 * Answers the shell's Mermaid requests (agents' `board_add_mermaid`): converting needs a DOM, so
 * it happens here, and the skeletons go back to the shell. Works with the board closed; failures
 * come back as a message, never as an unhandled error.
 */
export function installMermaidRelay(
  bridge: BoardBridge,
  convert: MermaidConverter = loadConverter,
): () => void {
  return bridge.onMermaidRequest(async ({ definition }) => {
    try {
      return { ok: true, elements: await convert(definition) };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  });
}
