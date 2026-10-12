// Contract of the browser-approval bridge (`window.agentsOfficeDesktop.browserApproval`): the cards
// the user answers before the embedded browser downloads a file, grants a site permission or runs
// an agent's `browser_eval` (spec 083). Anything that is not an explicit "allow" denies.
import { z } from 'zod';

export type BrowserApprovalKind = 'download' | 'permission' | 'eval';

/** A browser action waiting for the user's decision. */
export interface BrowserApprovalRequest {
  id: string;
  /** Workspace whose browser asks. */
  cwd: string;
  kind: BrowserApprovalKind;
  /** One-line question ("Permitir o download?"). */
  title: string;
  /** What is being asked (file name and URL, permission name, JavaScript expression). */
  detail: string;
  /** Site that asks (downloads and permissions). */
  origin?: string;
  /** File name of a download (lets the window build the question in its own language). */
  filename?: string;
  /** Agent that asked (`browser_eval`). */
  agentName?: string;
  /** ISO timestamp of the request. */
  createdAt: string;
}

export const BrowserApprovalResponseSchema = z.object({
  id: z.string().min(1).max(200),
  allow: z.boolean(),
});
export type BrowserApprovalResponse = z.infer<typeof BrowserApprovalResponseSchema>;

export interface BrowserApprovalBridge {
  /** Requests still waiting (the window may have been reloaded). */
  pending(): Promise<BrowserApprovalRequest[]>;
  /** Answers a request; false when it is not pending anymore. */
  respond(response: BrowserApprovalResponse): Promise<boolean>;
  onRequest(listener: (request: BrowserApprovalRequest) => void): () => void;
  /** A request left the queue (answered elsewhere, timed out, paused). */
  onResolved(listener: (id: string) => void): () => void;
}
