import { describe, expect, it } from 'vitest';
import { createEmptyModel, OfficeModelSchema, ProfessionSchema } from '../src';

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
