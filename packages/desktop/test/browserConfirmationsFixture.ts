import type { BrowserApprovalRequest } from '@agents-office/shared';
import { BrowserApprovals } from '../src/main/browserApprovals';
import { createBrowserGuard } from '../src/main/browserGuard';

/** Approvals wired to arrays, so tests see what the window and the notifications receive. */
export class BrowserApprovalsFixture {
  pushed: BrowserApprovalRequest[] = [];
  resolved: string[] = [];
  notices: string[] = [];
  failPush = false;
  private n = 0;
  readonly approvals: BrowserApprovals;

  constructor(timeoutMs?: number) {
    this.approvals = new BrowserApprovals({
      pushRequest: (r) => {
        if (this.failPush) throw new Error('window gone');
        this.pushed.push(r);
      },
      pushResolved: (id) => this.resolved.push(id),
      notify: (r) => this.notices.push(r.id),
      dismissNotice: () => {},
      newId: () => `b${++this.n}`,
      timeoutMs,
    });
  }

  guard() {
    return createBrowserGuard(this.approvals);
  }
}
