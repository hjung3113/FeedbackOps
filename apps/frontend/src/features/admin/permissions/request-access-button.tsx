// Slice 1 stub. Renders + is focusable per the issue #4 acceptance list
// ("button rendered, click is a noop with TODO referencing S1.4"). The
// matching POST + react-query mutation lands in #5 / S1.4.
//
// Prop interface is intentionally final so S1.4 only fills in the mutation:
//   - capability  (required) — what the requester is asking for
//   - managedSystemId? — optional MS scope (Slice 2 will surface this)
//   - onRequestSubmitted? — invoked on 200 OK; lets the parent invalidate
//     the permission-check query so the gate re-renders as pending_request.

import { Button } from '@fops/ui';

export interface RequestAccessButtonProps {
  capability: string;
  managedSystemId?: string;
  onRequestSubmitted?: () => void;
}

export function RequestAccessButton(_props: RequestAccessButtonProps) {
  return (
    <Button
      variant="primary"
      size="md"
      onClick={() => {
        // TODO(#5 / Slice 1.4): wire up POST /me/permissions/requests with a
        // useMutation + onSuccess that invalidates the permission-check
        // query key from use-permission-check.ts and calls onRequestSubmitted.
      }}
    >
      Request access
    </Button>
  );
}
