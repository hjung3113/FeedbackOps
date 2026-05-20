// NextActionFooter — sticky bottom footer with next actions.
// next_actions is opaque in Slice 3; BE returns [] for fresh VOCs.

import * as React from 'react';
import type { VocDetailEnvelope } from '@fops/shared';
import { Button } from '@fops/ui';

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
}

export function NextActionFooter({ voc }: NextActionFooterProps): React.ReactElement {
  const actions = voc.next_actions.filter(isNextAction);
  const primaryAction = actions.find((a) => a.available && a.primary !== false);
  const restCount = actions.filter((a) => a !== primaryAction).length;

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
          {restCount > 0 && (
            <span className="text-xs text-text-muted">+{restCount} more</span>
          )}
        </>
      )}
    </div>
  );
}
