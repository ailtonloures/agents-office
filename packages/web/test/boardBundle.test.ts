import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Static (not `import()`) module specifiers of a source file. */
function staticImports(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/gm)) {
    if (match[1]) found.push(match[1]);
  }
  for (const match of text.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) {
    if (match[1]) found.push(match[1]);
  }
  return found;
}

function resolveLocal(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  return [`${base}.ts`, join(base, 'index.ts')].find((candidate) => existsSync(candidate));
}

/** Every file statically reachable from the entry, plus the bare packages they import. */
function staticGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (!file || files.has(file)) continue;
    files.add(file);
    for (const specifier of staticImports(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) {
        const local = resolveLocal(file, specifier);
        if (local) queue.push(local);
      } else packages.add(specifier);
    }
  }
  return { files, packages };
}

describe('whiteboard bundle split (spec 077)', () => {
  const graph = staticGraph(join(SRC, 'main.ts'));

  it('keeps React and Excalidraw out of the main bundle', () => {
    const heavy = [...graph.packages].filter(
      (name) => name.startsWith('react') || name.startsWith('@excalidraw'),
    );
    expect(heavy).toEqual([]);
  });

  it('only reaches the island through a dynamic import', () => {
    const islandFiles = [...graph.files].filter((file) => file.endsWith('boardIsland.ts'));
    expect(islandFiles).toEqual([]);
    const overlay = readFileSync(join(SRC, 'ui/boardOverlay.ts'), 'utf8');
    expect(overlay).toMatch(/import\('\.\/boardIsland'\)/);
  });

  it('the island is the one module that imports the editor', () => {
    expect(staticImports(readFileSync(join(SRC, 'ui/boardIsland.ts'), 'utf8'))).toContain(
      'react-dom/client',
    );
  });
});
