// Wraps a region of UI in a backend permission check. On `approved` renders
// `children`; on every other state renders `<PermissionStateView>` (or the
// caller's custom `fallback`). Per AGENTS.md:69 this is a *display hint* —
// the backend remains authoritative; this component never re-derives a
// decision client-side.

import type { ReactNode } from 'react';

import { PermissionStateView } from './permission-state-view.js';
import { usePermissionCheck } from './use-permission-check.js';

export interface PermissionGateProps {
  capability: string;
  managedSystemId?: string;
  children: ReactNode;
  /** Optional override for non-approved states. When omitted, renders the default `<PermissionStateView>`. */
  fallback?: ReactNode;
  /** Optional override for the loading state. */
  loading?: ReactNode;
}

export function PermissionGate(props: PermissionGateProps) {
  const query = usePermissionCheck({
    capability: props.capability,
    ...(props.managedSystemId !== undefined ? { managedSystemId: props.managedSystemId } : {}),
  });

  if (query.isPending) {
    return (
      <output aria-live="polite" className="text-text-muted text-sm">
        {props.loading ?? 'Checking access…'}
      </output>
    );
  }

  if (query.isError || !query.data) {
    // Treat fetch failure as blocked to avoid flashing protected content.
    // The error envelope itself is rendered by the route-level boundary; the
    // gate stays narrow.
    return (
      <PermissionStateView
        state="blocked_non_requestable"
        capability={props.capability}
        {...(props.managedSystemId !== undefined ? { managedSystemId: props.managedSystemId } : {})}
      />
    );
  }

  if (query.data.state === 'approved') return <>{props.children}</>;

  if (props.fallback !== undefined) return <>{props.fallback}</>;

  return (
    <PermissionStateView
      state={query.data.state}
      decision={query.data.decision}
      capability={props.capability}
      {...(props.managedSystemId !== undefined ? { managedSystemId: props.managedSystemId } : {})}
    />
  );
}
