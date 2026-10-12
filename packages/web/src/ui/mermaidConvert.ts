import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import { type Skeleton, toBoardSkeletons } from './mermaidSkeletons';

// Lazy module (spec 079): `mermaid-to-excalidraw` pulls in mermaid, which is large and needs a
// DOM. It is only imported (dynamic import from mermaidRelay.ts) when an agent asks for a diagram.

export async function convertMermaid(definition: string): Promise<Skeleton[]> {
  const { elements } = await parseMermaidToExcalidraw(definition);
  return toBoardSkeletons(elements as unknown as readonly unknown[]);
}
