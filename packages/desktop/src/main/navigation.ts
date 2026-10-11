export type NavigationAction = 'allow' | 'open-external' | 'deny';

/** Decides what to do with a navigation / `window.open` target of the office window. */
export function classifyNavigation(target: string, appOrigin: string): NavigationAction {
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return 'deny';
  }
  if (url.origin === appOrigin) return 'allow';
  if (url.protocol === 'http:' || url.protocol === 'https:') return 'open-external';
  return 'deny';
}
