import * as React from 'react';
import { Ban, Eye, Lock, XCircle } from 'lucide-react';
import { cn } from '../utils/cn.js';
import { Button } from '../components/Button.js';
import { NestedTextBlock } from '../panel/NestedTextBlock.js';

export type PermissionState =
  | 'request_access'
  | 'summary_visible'
  | 'denied'
  | 'blocked_not_requestable';

export interface PermissionBlockedPanelProps {
  state: PermissionState;
  /** Category label, e.g. 'VOC 상세' or 'Linked Finding' */
  category: string;
  /** Domain-safe reason for the blocked state. */
  reason?: string;
  /** Optional state-specific copy when a permission boundary owns the wording. */
  description?: string;
  /** Optional request CTA label for callers that preserve an established flow. */
  requestAccessLabel?: string;
  /** Canonical `required_scope` strings from permissionDecisionSchema. */
  requiredScope?: readonly string[];
  /** Summary content; omit for the default placeholder or pass null to omit its container. */
  summary?: React.ReactNode;
  /** Decision identifier returned by BE for audit trail. */
  decisionId?: string;
  /** Relative timestamp string ('5분 전' etc.). Caller pre-formats. */
  evaluatedRelative?: string;
  /**
   * Called when the user clicks the request-access CTA (state === 'request_access').
   */
  onRequestAccess?: () => void;
  className?: string;
}

const STATE_ICON: Record<PermissionState, React.ElementType> = {
  request_access:         Lock,
  summary_visible:        Eye,
  denied:                 XCircle,
  blocked_not_requestable: Ban,
};

export function PermissionBlockedPanel({
  state,
  category,
  reason,
  description,
  requestAccessLabel,
  requiredScope,
  summary,
  decisionId,
  evaluatedRelative,
  onRequestAccess,
  className,
}: PermissionBlockedPanelProps) {
  const Icon = STATE_ICON[state];

  return (
    <div
      data-state={state}
      className={cn(
        'rounded-md border border-border-subtle bg-surface-card p-4 flex flex-col gap-3',
        className,
      )}
    >
      {/* Common header */}
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-text-muted shrink-0" aria-hidden="true" />
        <h4 className="font-medium text-sm text-text-primary">{category}</h4>
      </div>

      {/* State-specific body */}
      {state === 'request_access' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            {description ?? '이 항목에 접근하려면 권한 요청이 필요합니다.'}
          </p>
          {reason !== undefined ? <p className="text-sm text-text-secondary">{reason}</p> : null}
          {requiredScope !== undefined && requiredScope.length > 0 && (
            <p className="text-xs text-text-muted">{requiredScope.join(' · ')}</p>
          )}
          {onRequestAccess !== undefined && (
            <Button variant="default" size="sm" onClick={onRequestAccess}>
              {requestAccessLabel ?? '권한 요청하기'}
            </Button>
          )}
        </div>
      )}

      {state === 'summary_visible' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">{description ?? '요약 정보만 표시됩니다.'}</p>
          {summary !== null ? (
            <NestedTextBlock>
              {summary !== undefined ? (
                summary
              ) : (
                <p className="text-text-muted text-sm">요약 정보가 없습니다.</p>
              )}
            </NestedTextBlock>
          ) : null}
        </div>
      )}

      {state === 'denied' && (
        <p className="text-sm text-text-secondary">
          {description ?? reason ?? '이 항목에 접근할 수 없습니다.'}
        </p>
      )}

      {state === 'blocked_not_requestable' && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            {description ?? reason ?? '권한 요청이 허용되지 않습니다.'}
          </p>
          {description !== undefined && reason !== undefined ? (
            <p className="text-sm text-text-secondary">{reason}</p>
          ) : null}
        </div>
      )}

      {/* Audit footer — only when decisionId is provided */}
      {decisionId !== undefined && (
        <p className="text-xs text-text-muted">
          결정 <code>{decisionId}</code>
          {evaluatedRelative !== undefined ? ` · ${evaluatedRelative}에 평가됨` : ''}
        </p>
      )}
    </div>
  );
}
