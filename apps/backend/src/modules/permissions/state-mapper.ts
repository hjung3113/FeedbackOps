// Frontend-state mapper. Translates a backend Decision plus the actor's
// currently-open permission request (if any) into the discrete UI state
// names that `<PermissionStateView>` renders.
//
// Mapping table is locked by the grill session Q6 and reproduced verbatim in
// the issue #4 spec. Slice 1 actively produces only:
//   approved, blocked_non_requestable, request_access, pending_request
// The remaining branches (hidden_existence, rejected, expired, revoked,
// summary_visible) are dead in Slice 1 but pinned by unit tests so S1.2/S1.4
// don't accidentally drift the contract.

import type { Decision } from './check-service.js';

export type FrontendState =
  | 'approved'
  | 'blocked_non_requestable'
  | 'request_access'
  | 'pending_request'
  | 'hidden_existence'
  | 'rejected'
  | 'expired'
  | 'revoked'
  | 'summary_visible';

export type OpenRequestStatus = 'pending' | 'needs_more_info' | 'rejected';

export interface OpenRequestSummary {
  status: OpenRequestStatus;
}

export function toFrontendState(
  decision: Decision,
  openRequest: OpenRequestSummary | null,
): FrontendState {
  if (decision.allow) return 'approved';

  switch (decision.reason) {
    case 'workspace_mismatch':
      return 'hidden_existence';
    case 'explicit_deny':
      return 'blocked_non_requestable';
    case 'grant_expired':
      return 'expired';
    case 'grant_revoked':
      return 'revoked';
    case 'sensitive_reason_missing':
      // Slice 1 has no sensitive caps, so this branch is unreachable from
      // checkCapability today. Pin the mapping so S1.4 inherits it.
      return 'blocked_non_requestable';
    case 'no_grant': {
      const hasRequestable = (decision.requestable?.length ?? 0) > 0;
      if (!hasRequestable) return 'blocked_non_requestable';
      if (!openRequest) return 'request_access';
      if (openRequest.status === 'pending') return 'pending_request';
      if (openRequest.status === 'needs_more_info') return 'pending_request';
      if (openRequest.status === 'rejected') return 'rejected';
      return 'request_access';
    }
  }
}
