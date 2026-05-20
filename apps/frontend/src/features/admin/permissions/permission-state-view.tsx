// Renders one of the discrete frontend permission states. Slice 1 actively
// produces only `approved`, `blocked_non_requestable`, `request_access`,
// `pending_request`; the other states are rendered as labeled cards too so
// S1.2+ producers don't require a UI follow-up.
//
// Visual layer is intentionally functional: text label + icon, semantic
// tokens, no new colors. The polish pass is gated on the pending design-
// system HTML reference (see issue #4 deferment note). ADR-0016 WCAG 2.2 AA
// constraints — focus rings, ≥40×40 touch targets, label-plus-icon — are
// satisfied via the existing `@fops/ui` Button.

import {
  AlertOctagon,
  CheckCircle2,
  Clock,
  EyeOff,
  Lock,
  ShieldAlert,
  ShieldX,
  TimerOff,
} from 'lucide-react';
import type { ReactNode } from 'react';

import type { FrontendPermissionState, PermissionDecision } from '../../../lib/api.js';
import { RequestAccessButton } from './request-access-button.js';

export interface PermissionStateViewProps {
  state: FrontendPermissionState;
  decision?: PermissionDecision;
  capability: string;
  managedSystemId?: string;
  /** Custom approved-state body. When omitted the view does not render the children itself — `<PermissionGate>` controls that branch. */
  children?: ReactNode;
}

interface StateChrome {
  label: string;
  description: string;
  Icon: typeof CheckCircle2;
  /** Tone tokens — semantic, not raw colors. */
  iconClassName: string;
}

const STATE_CHROME: Record<FrontendPermissionState, StateChrome> = {
  approved: {
    label: 'Access granted',
    description: 'You have permission to view this surface.',
    Icon: CheckCircle2,
    iconClassName: 'text-accent-primary',
  },
  request_access: {
    label: 'Request access',
    description: 'You need permission to view this surface.',
    Icon: Lock,
    iconClassName: 'text-text-muted',
  },
  pending_request: {
    label: 'Request pending',
    description: 'An administrator is reviewing your access request.',
    Icon: Clock,
    iconClassName: 'text-text-muted',
  },
  blocked_non_requestable: {
    label: 'Access blocked',
    description: 'This action is not available to your account.',
    Icon: ShieldX,
    iconClassName: 'text-accent-danger',
  },
  hidden_existence: {
    label: 'Not found',
    description: 'The requested resource is not available.',
    Icon: EyeOff,
    iconClassName: 'text-text-muted',
  },
  rejected: {
    label: 'Request rejected',
    description: 'A prior request for this access was rejected.',
    Icon: ShieldAlert,
    iconClassName: 'text-accent-danger',
  },
  expired: {
    label: 'Access expired',
    description: 'A previously granted permission has expired.',
    Icon: TimerOff,
    iconClassName: 'text-text-muted',
  },
  revoked: {
    label: 'Access revoked',
    description: 'A previously granted permission was revoked.',
    Icon: AlertOctagon,
    iconClassName: 'text-accent-danger',
  },
  summary_visible: {
    label: 'Limited summary',
    description: 'Only an approved summary of this content is available.',
    Icon: EyeOff,
    iconClassName: 'text-text-muted',
  },
};

export function PermissionStateView(props: PermissionStateViewProps) {
  const chrome = STATE_CHROME[props.state];
  const { Icon } = chrome;
  const showRequestButton = props.state === 'request_access';
  return (
    <section
      aria-live="polite"
      data-permission-state={props.state}
      className="rounded-md border border-default bg-surface-raised p-6 space-y-3"
    >
      <header className="flex items-center gap-3">
        <Icon className={`h-5 w-5 ${chrome.iconClassName}`} aria-hidden="true" />
        <h2 className="text-base font-semibold text-text-primary">{chrome.label}</h2>
      </header>
      <p className="text-sm text-text-muted">{chrome.description}</p>
      {showRequestButton && (
        <RequestAccessButton
          capability={props.capability}
          {...(props.managedSystemId !== undefined
            ? { managedSystemId: props.managedSystemId }
            : {})}
        />
      )}
    </section>
  );
}
