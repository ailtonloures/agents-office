export interface ClipboardDeps {
  clipboard?: { writeText: (text: string) => Promise<void> };
  /** Last resort for insecure contexts and old browsers; returns whether the copy worked. */
  legacyCopy?: (text: string) => boolean;
}

function legacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false;
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

function defaultDeps(): ClipboardDeps {
  return {
    clipboard: typeof navigator === 'undefined' ? undefined : navigator.clipboard,
    legacyCopy,
  };
}

/** Copies text to the clipboard. Never throws: resolves `false` when every strategy fails. */
export async function copyText(
  text: string,
  deps: ClipboardDeps = defaultDeps(),
): Promise<boolean> {
  if (deps.clipboard) {
    try {
      await deps.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }
  try {
    return deps.legacyCopy?.(text) ?? false;
  } catch {
    return false;
  }
}
