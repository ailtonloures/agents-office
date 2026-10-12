import type { ElementType, ReactNode } from 'react';
import type { Role } from './roles';

export interface PixelPanelProps {
  as?: ElementType;
  /** Accent color of the border, taken from a role. Defaults to gold. */
  role?: Role;
  /** Alias of `role` that avoids the ARIA `role` lint rule on literal values. */
  accent?: Role;
  className?: string;
  children: ReactNode;
}

/** Pixel art panel: cut corners, top highlight line, offset shadow. */
export function PixelPanel({
  as: Tag = 'div',
  role,
  accent,
  className,
  children,
}: PixelPanelProps) {
  const color = accent ?? role;
  const classes = ['pixel-panel', color ? `pixel-panel--${color}` : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className="pixel-panel-wrap">
      <Tag className={classes}>{children}</Tag>
    </div>
  );
}
