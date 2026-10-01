// Wraps a region of UI in a backend permission check. On `approved` renders
// `children`; on every other state renders `<PermissionBlockedPanel>` (or the
// caller's custom `fallback`). Per AGENTS.md:69 this is a *display hint* —
// the backend remains authoritative; this component never re-derives a
// decision client-side.

import type { ReactNode } from 'react';

import type { FrontendPermissionState } from '@/lib/api';
import { usePermissionCheck } from '@/lib/cross-system/usePermissionCheck';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { PermissionBlockedPanel } from '@fops/ui';
import { RequestAccessButton } from './request-access-button.js';

export interface PermissionGateProps {
  capability: string;
  managedSystemId?: string;
  children: ReactNode;
  /** Optional override for non-approved states. */
  fallback?: ReactNode;
  /** Optional override for the loading state. */
  loading?: ReactNode;
}

export function PermissionGate(props: PermissionGateProps) {
  const query = usePermissionCheck({
    capability: props.capability,
    ...(props.managedSystemId !== undefined ? { managedSystemId: props.managedSystemId } : {}),
  });
  const state = query.data?.state;
  const actors = useWorkspaceActors({
    enabled: query.isError || state === 'blocked_non_requestable',
    retry: false,
    staleTime: 0,
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
    return renderBlockedState('blocked_non_requestable', props, actors.actors);
  }

  if (query.data.state === 'approved') return <>{props.children}</>;

  if (props.fallback !== undefined) return <>{props.fallback}</>;

  return renderBlockedState(query.data.state, props, actors.actors);
}

type NonApprovedState = Exclude<FrontendPermissionState, 'approved'>;

const STATE_COPY: Record<
  NonApprovedState,
  {
    panelState: 'request_access' | 'summary_visible' | 'denied' | 'blocked_not_requestable';
    title: string;
    description: string;
  }
> = {
  request_access: {
    panelState: 'request_access',
    title: '권한 요청',
    description: '이 화면을 보려면 권한이 필요합니다.',
  },
  pending_request: {
    panelState: 'denied',
    title: '권한 요청 검토 중',
    description: '관리자가 권한 요청을 검토하고 있습니다.',
  },
  blocked_non_requestable: {
    panelState: 'blocked_not_requestable',
    title: '접근할 수 없습니다.',
    description: '현재 계정에서는 이 작업을 사용할 수 없습니다.',
  },
  hidden_existence: {
    panelState: 'denied',
    title: '찾을 수 없습니다.',
    description: '요청한 항목을 사용할 수 없습니다.',
  },
  rejected: {
    panelState: 'denied',
    title: '권한 요청이 거절되었습니다.',
    description: '이 권한 요청은 이전에 거절되었습니다.',
  },
  expired: {
    panelState: 'denied',
    title: '권한이 만료되었습니다.',
    description: '이전에 받은 권한이 만료되었습니다.',
  },
  revoked: {
    panelState: 'denied',
    title: '권한이 취소되었습니다.',
    description: '이전에 받은 권한이 취소되었습니다.',
  },
  summary_visible: {
    panelState: 'summary_visible',
    title: '제한된 요약',
    description: '승인된 요약만 확인할 수 있습니다.',
  },
};

function renderBlockedState(
  state: NonApprovedState,
  props: PermissionGateProps,
  workspaceActors: ReturnType<typeof useWorkspaceActors>['actors'],
) {
  const copy = STATE_COPY[state];
  const adminNames = workspaceActors
    ?.filter((actor) => actor.role_level === 'admin')
    .map((actor) => actor.display_name);
  const contactReason =
    state === 'blocked_non_requestable'
      ? `담당 관리자에게 문의하세요.${adminNames && adminNames.length > 0 ? ` ${adminNames.join(', ')}` : ''}`
      : undefined;
  if (state === 'request_access') {
    return (
      <RequestAccessButton
        capability={props.capability}
        returnRouteIntent={`${window.location.pathname}${window.location.search}`}
        {...(props.managedSystemId !== undefined ? { managedSystemId: props.managedSystemId } : {})}
        renderTrigger={(open) => (
          <PermissionBlockedPanel
            state={copy.panelState}
            category={copy.title}
            description={copy.description}
            requestAccessLabel="권한 요청"
            onRequestAccess={open}
          />
        )}
      />
    );
  }

  return (
    <PermissionBlockedPanel
      state={copy.panelState}
      category={copy.title}
      description={copy.description}
      {...(contactReason !== undefined ? { reason: contactReason } : {})}
      {...(copy.panelState === 'summary_visible' ? { summary: null } : {})}
    />
  );
}
