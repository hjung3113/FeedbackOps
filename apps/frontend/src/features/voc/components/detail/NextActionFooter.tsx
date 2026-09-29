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
  overflowActions?: Array<{
    label: string;
    onClick: () => void;
    testId?: string;
    afterMenuClose?: boolean;
  }>;
}

export function NextActionFooter({
  voc,
  overflowActions,
}: NextActionFooterProps): React.ReactElement {
  const actions = voc.next_actions.filter(isNextAction);
  const primaryAction = actions.find((a) => a.available && a.primary !== false);
  const restCount = actions.filter((a) => a !== primaryAction).length;
  const pendingAfterCloseRef = React.useRef<(() => void) | null>(null);

  return (
    <div className="sticky bottom-0 bg-surface-canvas border-t border-border-subtle px-4 py-3 flex items-center gap-3">
      {actions.length === 0 ? (
        <span className="text-sm text-text-muted">다음 액션 없음</span>
      ) : (
        <>
          {primaryAction !== undefined && (
            <Button variant="default" size="sm" disabled>
              {primaryAction.label}
            </Button>
          )}
          {restCount > 0 && <span className="text-xs text-text-muted">+{restCount} more</span>}
        </>
      )}
      {overflowActions !== undefined && overflowActions.length > 0 && (
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
            {overflowActions.map((action) => (
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
