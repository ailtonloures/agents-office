export const ROLES = ['tech-lead', 'analyst', 'architect', 'developer', 'qa', 'support'] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  'tech-lead': 'Tech Lead',
  analyst: 'Analyst',
  architect: 'Architect',
  developer: 'Developer',
  qa: 'QA',
  support: 'Support',
};
