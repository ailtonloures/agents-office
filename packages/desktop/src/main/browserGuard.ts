import type { BrowserApprovals } from './browserApprovals';

/** What the native browser view asks the user before downloading or granting a permission. */
export interface BrowserGuard {
  permission(cwd: string, permission: string, requestingUrl: string): Promise<boolean>;
  download(cwd: string, info: { filename: string; url: string }): Promise<boolean>;
}

/** Permissions a page can never get, not even by asking the user. */
const NEVER = new Set(['openExternal', 'deprecated-sync-clickevent', 'unknown']);

const LABEL: Record<string, string> = {
  media: 'usar a câmera e/ou o microfone',
  geolocation: 'saber a sua localização',
  notifications: 'mostrar notificações',
  midi: 'usar dispositivos MIDI',
  midiSysex: 'usar dispositivos MIDI (sysex)',
  'clipboard-read': 'ler a área de transferência',
  'clipboard-sanitized-write': 'escrever na área de transferência',
  fullscreen: 'usar tela cheia',
  pointerLock: 'travar o ponteiro do mouse',
  'display-capture': 'capturar a tela',
  mediaKeySystem: 'reproduzir conteúdo protegido (DRM)',
  idleDetection: 'detectar quando você está ausente',
  hid: 'acessar dispositivos HID',
  serial: 'acessar portas seriais',
  usb: 'acessar dispositivos USB',
  'storage-access': 'acessar os dados de outros sites',
  'top-level-storage-access': 'acessar os dados de outros sites',
  'window-management': 'gerenciar as janelas',
};

export function permissionLabel(permission: string): string {
  return LABEL[permission] ?? `usar o recurso "${permission}"`;
}

export function originOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.origin : '';
  } catch {
    return '';
  }
}

/**
 * Builds the guard from the approval cards. Downloads and permissions stay blocked until the user
 * clicks "Permitir".
 */
export function createBrowserGuard(approvals: Pick<BrowserApprovals, 'ask'>): BrowserGuard {
  return {
    async permission(cwd, permission, requestingUrl) {
      if (NEVER.has(permission)) return false;
      const origin = originOf(requestingUrl);
      if (!origin) return false;
      return approvals
        .ask({
          cwd,
          kind: 'permission',
          title: `${origin} quer ${permissionLabel(permission)}`,
          detail: permission,
          origin,
        })
        .catch(() => false);
    },
    async download(cwd, info) {
      const origin = originOf(info.url);
      return approvals
        .ask({
          cwd,
          kind: 'download',
          title: `Baixar "${info.filename}"?`,
          filename: info.filename,
          detail: info.url.slice(0, 500),
          ...(origin ? { origin } : {}),
        })
        .catch(() => false);
    },
  };
}
