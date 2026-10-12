import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

export type PixelButtonVariant = 'primary' | 'secondary';

interface CommonProps {
  variant?: PixelButtonVariant;
  className?: string;
  children: ReactNode;
}

export type PixelButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'children'> & { href: string };

export type PixelButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> & { href?: undefined };

export type PixelButtonProps = PixelButtonAsLink | PixelButtonAsButton;

/** Renders an `<a>` when `href` is given, otherwise a `<button>`. */
export function PixelButton(props: PixelButtonProps) {
  const { variant = 'secondary', className, children } = props;
  const classes = ['pixel-button', `pixel-button--${variant}`, className ?? '']
    .filter(Boolean)
    .join(' ');

  if (props.href !== undefined) {
    const { variant: _v, className: _c, children: _ch, ...anchor } = props;
    return (
      <a {...anchor} className={classes}>
        {children}
      </a>
    );
  }

  const { variant: _v, className: _c, children: _ch, href: _h, type, ...button } = props;
  return (
    <button {...button} type={type ?? 'button'} className={classes}>
      {children}
    </button>
  );
}
