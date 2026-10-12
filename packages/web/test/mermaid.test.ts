import { describe, expect, it, vi } from 'vitest';
import { libraryItemsOf, libraryLabel } from '../src/ui/boardLogic';
import { installMermaidRelay } from '../src/ui/mermaidRelay';
import { MERMAID_MAX_ELEMENTS, toBoardSkeletons } from '../src/ui/mermaidSkeletons';

describe('toBoardSkeletons', () => {
  it('keeps supported fields, maps start/end to from/to and drops images', () => {
    const out = toBoardSkeletons([
      {
        type: 'rectangle',
        id: 'A',
        x: 1,
        y: 2,
        width: 3,
        height: -4,
        label: { text: 'A', fontSize: 20 },
        strokeColor: '#fff',
        backgroundColor: 'url(x)',
        extra: 1,
      },
      { type: 'rectangle', id: 'B', x: 0, y: 0 },
      {
        type: 'arrow',
        x: 5,
        y: 6,
        start: { id: 'A' },
        end: { id: 'B' },
        points: [
          [0, 0],
          [1, 1],
        ],
        endArrowhead: 'weird',
      },
      { type: 'image', id: 'img' },
    ]);
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({
      type: 'rectangle',
      id: 'A',
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      label: { text: 'A', fontSize: 20 },
      strokeColor: '#fff',
    });
    expect(out[2]).toMatchObject({
      type: 'arrow',
      from: 'A',
      to: 'B',
      points: [
        [0, 0],
        [1, 1],
      ],
    });
    expect(out[2]).not.toHaveProperty('endArrowhead');
  });

  it('ignores bindings to unknown ids and gives loose arrows points', () => {
    const [arrow] = toBoardSkeletons([
      { type: 'arrow', start: { id: 'zz' }, width: 30, height: 5 },
    ]);
    expect(arrow).not.toHaveProperty('from');
    expect(arrow?.points).toEqual([
      [0, 0],
      [30, 5],
    ]);
  });

  it('rejects diagrams with nothing drawable or too many elements', () => {
    expect(() => toBoardSkeletons([{ type: 'image' }])).toThrow(/cannot be drawn/);
    const many = Array.from({ length: MERMAID_MAX_ELEMENTS + 1 }, () => ({ type: 'rectangle' }));
    expect(() => toBoardSkeletons(many)).toThrow(/limit/);
  });
});

describe('installMermaidRelay', () => {
  const make = () => {
    let handler: ((r: { id: string; definition: string }) => Promise<unknown>) | undefined;
    const off = vi.fn();
    const bridge = {
      onMermaidRequest: (h: typeof handler) => {
        handler = h;
        return off;
      },
    };
    return { bridge, call: (d: string) => handler?.({ id: '1', definition: d }), off };
  };

  it('answers with the converted skeletons', async () => {
    const { bridge, call, off } = make();
    const convert = vi.fn().mockResolvedValue([{ type: 'rectangle' }]);
    expect(installMermaidRelay(bridge as never, convert)).toBe(off);
    await expect(call('graph TD; A-->B')).resolves.toEqual({
      ok: true,
      elements: [{ type: 'rectangle' }],
    });
    expect(convert).toHaveBeenCalledWith('graph TD; A-->B');
  });

  it('answers with a message when the conversion throws', async () => {
    const { bridge, call } = make();
    installMermaidRelay(bridge as never, async () => {
      throw new Error('Parse error');
    });
    await expect(call('x')).resolves.toEqual({ ok: false, message: 'Parse error' });
  });
});

describe('library helpers', () => {
  const lib = {
    id: 'infra',
    name: 'Infra',
    items: [
      { id: 'a', name: 'DB', elements: [1] },
      { id: 'b', elements: [2] },
    ],
  };
  it('turns libraries into Excalidraw library items', () => {
    expect(libraryItemsOf([lib])).toEqual([
      { id: 'infra:a', status: 'published', created: 0, name: 'DB', elements: [1] },
      { id: 'infra:b', status: 'published', created: 0, elements: [2] },
    ]);
  });
  it('labels a library', () => {
    expect(libraryLabel(lib)).toBe('Infra (2 formas)');
    expect(libraryLabel({ ...lib, items: lib.items.slice(0, 1) })).toBe('Infra (1 forma)');
  });
});
