import type { ElementType, ReactNode } from 'react';

export interface ContainerProps {
  as?: ElementType;
  narrow?: boolean;
  className?: string;
  children: ReactNode;
}

/** Responsive page container: 16px gutter on phones, no horizontal overflow. */
export function Container({
  as: Tag = 'div',
  narrow = false,
  className,
  children,
}: ContainerProps) {
  const classes = ['container', narrow ? 'container--narrow' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return <Tag className={classes}>{children}</Tag>;
}
