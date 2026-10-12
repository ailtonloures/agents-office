import type { ReactNode } from 'react';

export interface SectionHeadingProps {
  id?: string;
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  /** Heading level, so each section can fit the page outline. */
  level?: 1 | 2 | 3;
  align?: 'start' | 'center';
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  lead,
  level = 2,
  align = 'start',
}: SectionHeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3';
  return (
    <header className={`section-heading${align === 'center' ? ' section-heading--center' : ''}`}>
      {eyebrow ? <span className="section-heading__eyebrow">{eyebrow}</span> : null}
      <Tag id={id} className="section-heading__title">
        {title}
      </Tag>
      {lead ? <p className="section-heading__lead">{lead}</p> : null}
    </header>
  );
}
