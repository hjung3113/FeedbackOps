// NextActionFooter — sticky bottom footer with next actions.
// next_actions is opaque in Slice 3; BE returns [] for fresh VOCs.

import type { VocDetailEnvelope } from '@fops/shared';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@fops/ui';
import { Ellipsis } from 'lucide-react';
import * as React from 'react';

// Runtime shape we narrow to.
interface NextAction {
  id: string;
  label: string;
  available: boolean;
  primary?: boolean;
}

function isNextAction(v: unknown): v is NextAction {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r['id'] === 'string' &&
    typeof r['label'] === 'string' &&
    typeof r['available'] === 'boolean'
  );
}

export interface NextActionFooterProps {
  voc: VocDetailEnvelope;
  primaryAction?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    testId?: string;
  };
  overflowActions?: Array<{
    label: string;
    onClick: () => void;
    testId?: string;
    afterMenuClose?: boolean;
  }>;
}

export function NextActionFooter({
  voc,
  primaryAction,
  secondaryAction,
  overflowActions,
}: NextActionFooterProps): React.ReactElement | null {
  const actions = voc.next_actions.filter(isNextAction);
  const backendPrimaryAction = actions.find((a) => a.available && a.primary !== false);
  const restCount = actions.filter((a) => a !== backendPrimaryAction).length;
  const pendingAfterCloseRef = React.useRef<(() => void) | null>(null);
  const hasOverflowActions = overflowActions !== undefined && overflowActions.length > 0;

  if (
    primaryAction === undefined &&
    secondaryAction === undefined &&
    backendPrimaryAction === undefined &&
    restCount === 0 &&
    !hasOverflowActions
  ) {
    return null;
  }

  return (
    <div className="sticky bottom-0 bg-surface-canvas border-t border-border-subtle px-4 py-3 flex items-center gap-3">
      {backendPrimaryAction !== undefined && (
        <span className="text-sm text-text-muted">{backendPrimaryAction.label}</span>
      )}
      {primaryAction !== undefined && (
        <Button
          variant="default"
          size="sm"
          onClick={primaryAction.onClick}
          {...(primaryAction.testId !== undefined ? { 'data-testid': primaryAction.testId } : {})}
        >
          {primaryAction.label}
        </Button>
      )}
      {secondaryAction !== undefined && (
        <Button
          variant="secondary"
          size="sm"
          onClick={secondaryAction.onClick}
          {...(secondaryAction.testId !== undefined ? { 'data-testid': secondaryAction.testId } : {})}
        >
          {secondaryAction.label}
        </Button>
      )}
      {restCount > 0 && <span className="text-xs text-text-muted">+{restCount} more</span>}
      {hasOverflowActions && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="ml-auto" aria-label="추가 작업">
              <Ellipsis className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            onCloseAutoFocus={(event) => {
              const pending = pendingAfterCloseRef.current;
              if (pending) {
                pendingAfterCloseRef.current = null;
                event.preventDefault();
                pending();
              }
            }}
          >
            {overflowActions?.map((action) => (
              <DropdownMenuItem
                key={action.label}
                onSelect={() => {
                  if (action.afterMenuClose) {
                    pendingAfterCloseRef.current = action.onClick;
                  } else {
                    action.onClick();
                  }
                }}
                data-testid={action.testId}
              >
                {action.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
