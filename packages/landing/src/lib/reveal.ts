export type RevealMode = 'immediate' | 'observe';

/** Entry animation needs an IntersectionObserver and no reduced-motion preference. */
export function revealMode(hasObserver: boolean, prefersReducedMotion: boolean): RevealMode {
  return hasObserver && !prefersReducedMotion ? 'observe' : 'immediate';
}
