import { describe, expect, it } from 'vitest';
import { createEmptyModel, isLive, OfficeModelSchema, ProfessionSchema } from '../src';

describe('isLive', () => {
  it('is true for working, waiting and idle actors', () => {
    for (const status of ['working', 'waiting', 'idle']) expect(isLive({ status })).toBe(true);
  });

  it('is false for finished and ended actors', () => {
    for (const status of ['finished', 'ended']) expect(isLive({ status })).toBe(false);
  });
});

describe('model', () => {
  it('creates an empty model that satisfies the schema', () => {
    const model = createEmptyModel();
    expect(model.hallOfFame).toEqual([]);
    expect(OfficeModelSchema.safeParse(model).success).toBe(true);
  });

  it('knows the tech-lead and developer professions', () => {
    expect(ProfessionSchema.options).toEqual([
      'tech-lead',
      'analyst',
      'architect',
      'developer',
      'qa',
      'support',
    ]);
  });
});
