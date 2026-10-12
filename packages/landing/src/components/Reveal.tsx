import { type ElementType, type ReactNode, useEffect, useRef, useState } from 'react';
import { revealMode } from '../lib/reveal';

export interface RevealProps {
  as?: ElementType;
  className?: string;
  /** Stagger in milliseconds. */
  delay?: number;
  /** Above the fold: already visible on first render, so it never delays the first paint. */
  eager?: boolean;
  children: ReactNode;
}

/** Fades and lifts its children in once they scroll into view. Static for reduced motion. */
export function Reveal({
  as: Tag = 'div',
  className,
  delay = 0,
  eager = false,
  children,
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(eager);

  useEffect(() => {
    const node = ref.current;
    if (!node || eager) return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (revealMode(typeof IntersectionObserver !== 'undefined', reduced) === 'immediate') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager]);

  return (
    <Tag
      ref={ref}
      className={[
        'reveal',
        visible ? 'reveal--visible' : '',
        eager ? 'reveal--eager' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
