import type { BrowserApprovalRequest } from '@agents-office/shared';
import { type MessageKey, t } from '../i18n/i18n';

export function dequeue(
  queue: readonly BrowserApprovalRequest[],
  id: string,
): BrowserApprovalRequest[] {
  return queue.filter((r) => r.id !== id);
}

/** Permissions that have a dedicated phrase ("wants to {action}"). */
const KNOWN_PERMISSIONS = new Set([
  'media',
  'geolocation',
  'notifications',
  'midi',
  'midiSysex',
  'clipboard-read',
  'clipboard-sanitized-write',
  'fullscreen',
  'pointerLock',
  'display-capture',
  'mediaKeySystem',
  'idleDetection',
  'hid',
  'serial',
  'usb',
  'storage-access',
  'top-level-storage-access',
  'window-management',
]);

/** What a site asks to do, in the active language ("use the camera and/or microphone"). */
export function permissionAction(permission: string): string {
  return KNOWN_PERMISSIONS.has(permission)
    ? t(`browser.permission.${permission}` as MessageKey)
    : t('browser.permission.other', { name: permission });
}

/**
 * One-line question of a card, built here (not by the main process) so it follows the language.
 * Falls back to the title sent by the shell when the data to build it is missing.
 */
export function approvalTitle(request: BrowserApprovalRequest): string {
  if (request.kind === 'download' && request.filename) {
    return t('browser.approval.download', { name: request.filename });
  }
  if (request.kind === 'permission' && request.origin) {
    return t('browser.approval.permission', {
      origin: request.origin,
      action: permissionAction(request.detail),
    });
  }
  if (request.kind === 'eval' && request.agentName) {
    return t('browser.approval.eval', { agent: request.agentName });
  }
  return request.title;
}

/** Title with the queue counter ("(+2 in queue)") when more cards wait behind this one. */
export function approvalHeading(request: BrowserApprovalRequest, queueLength: number): string {
  const title = approvalTitle(request);
  return queueLength > 1 ? `${title} ${t('approval.queued', { n: queueLength - 1 })}` : title;
}

export function approvalHintKey(kind: BrowserApprovalRequest['kind']): MessageKey {
  return `browser.approval.hint.${kind}`;
}
