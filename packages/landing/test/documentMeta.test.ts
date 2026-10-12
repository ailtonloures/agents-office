import { describe, expect, it } from 'vitest';
import { applyDocumentMeta } from '../src/i18n/documentMeta';
import { en } from '../src/i18n/messages/en';
import { es } from '../src/i18n/messages/es';
import { ptBR } from '../src/i18n/messages/pt-BR';

function fakeDocument(selectors: string[]) {
  const nodes = new Map(selectors.map((s) => [s, { content: '' }]));
  return {
    title: '',
    nodes,
    head: {
      querySelector: (selector: string) => {
        const node = nodes.get(selector);
        return node
          ? {
              setAttribute: (_: string, value: string) => {
                node.content = value;
              },
            }
          : null;
      },
    },
  };
}

describe('applyDocumentMeta', () => {
  it('sets the title and every mirrored description tag', () => {
    const doc = fakeDocument([
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:title"]',
    ]);
    applyDocumentMeta({ title: 'T', description: 'D' }, doc as unknown as Document);
    expect(doc.title).toBe('T');
    expect(doc.nodes.get('meta[name="description"]')?.content).toBe('D');
    expect(doc.nodes.get('meta[property="og:title"]')?.content).toBe('T');
    expect(doc.nodes.get('meta[name="twitter:title"]')?.content).toBe('T');
  });

  it('ignores missing tags', () => {
    const doc = fakeDocument([]);
    expect(() =>
      applyDocumentMeta({ title: 'T', description: 'D' }, doc as unknown as Document),
    ).not.toThrow();
  });

  it('has a distinct title and description per locale', () => {
    const titles = new Set([en['meta.title'], ptBR['meta.title'], es['meta.title']]);
    expect(titles.size).toBe(3);
  });
});
