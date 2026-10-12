/** Stable anchor ids, shared by the sections and the navigation. */
export const SECTION_IDS = {
  top: 'top',
  how: 'how-it-works',
  features: 'features',
  architecture: 'architecture',
  security: 'security',
  install: 'install',
  oss: 'open-source',
} as const;

export type SectionKey = keyof typeof SECTION_IDS;
