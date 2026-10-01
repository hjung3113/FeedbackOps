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

import type { FrontendPermissionState, PermissionDecision } from '../../../lib/api';
import { useWorkspaceActors } from '../../../lib/cross-system/useWorkspaceActors';
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
    label: '접근이 허용되었습니다.',
    description: '이 화면을 볼 수 있는 권한이 있습니다.',
    Icon: CheckCircle2,
    iconClassName: 'text-accent-primary',
  },
  request_access: {
    label: '권한 요청',
    description: '이 화면을 보려면 권한이 필요합니다.',
    Icon: Lock,
    iconClassName: 'text-text-muted',
  },
  pending_request: {
    label: '권한 요청 검토 중',
    description: '관리자가 권한 요청을 검토하고 있습니다.',
    Icon: Clock,
    iconClassName: 'text-text-muted',
  },
  blocked_non_requestable: {
    label: '접근할 수 없습니다.',
    description: '현재 계정에서는 이 작업을 사용할 수 없습니다.',
    Icon: ShieldX,
    iconClassName: 'text-accent-danger',
  },
  hidden_existence: {
    label: '찾을 수 없습니다.',
    description: '요청한 항목을 사용할 수 없습니다.',
    Icon: EyeOff,
    iconClassName: 'text-text-muted',
  },
  rejected: {
    label: '권한 요청이 거절되었습니다.',
    description: '이 권한 요청은 이전에 거절되었습니다.',
    Icon: ShieldAlert,
    iconClassName: 'text-accent-danger',
  },
  expired: {
    label: '권한이 만료되었습니다.',
    description: '이전에 받은 권한이 만료되었습니다.',
    Icon: TimerOff,
    iconClassName: 'text-text-muted',
  },
  revoked: {
    label: '권한이 취소되었습니다.',
    description: '이전에 받은 권한이 취소되었습니다.',
    Icon: AlertOctagon,
    iconClassName: 'text-accent-danger',
  },
  summary_visible: {
    label: '제한된 요약',
    description: '승인된 요약만 확인할 수 있습니다.',
    Icon: EyeOff,
    iconClassName: 'text-text-muted',
  },
};

export function PermissionStateView(props: PermissionStateViewProps) {
  const chrome = STATE_CHROME[props.state];
  const { Icon } = chrome;
  const showRequestButton = props.state === 'request_access';
  const showContactAdmin = props.state === 'blocked_non_requestable';
  const actors = useWorkspaceActors({
    enabled: showContactAdmin,
    retry: false,
    staleTime: 0,
  });
  const adminNames = actors.actors
    ?.filter((actor) => actor.role_level === 'admin')
    .map((actor) => actor.display_name);
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
          returnRouteIntent={`${window.location.pathname}${window.location.search}`}
          {...(props.managedSystemId !== undefined
            ? { managedSystemId: props.managedSystemId }
            : {})}
        />
      )}
      {showContactAdmin && (
        <p
          className="max-h-20 overflow-y-auto text-sm text-text-secondary"
          data-testid="permission-contact-admin"
        >
          담당 관리자에게 문의하세요.
          {adminNames && adminNames.length > 0 ? ` ${adminNames.join(', ')}` : ''}
        </p>
      )}
    </section>
  );
}
