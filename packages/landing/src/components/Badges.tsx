import { ROLE_LABELS, type Role } from './roles';

export interface RoleBadgeProps {
  role: Role;
  /** Overrides the default English label (pass the translated one). */
  label?: string;
}

export function RoleBadge({ role, label }: RoleBadgeProps) {
  return <span className={`badge badge--${role}`}>{label ?? ROLE_LABELS[role]}</span>;
}

export interface LabelBadgeProps {
  label?: string;
}

export function DesktopBadge({ label = 'Desktop' }: LabelBadgeProps) {
  return <span className="badge badge--desktop">{label}</span>;
}

export function BetaBadge({ label = 'Beta' }: LabelBadgeProps) {
  return <span className="badge badge--beta">{label}</span>;
}
