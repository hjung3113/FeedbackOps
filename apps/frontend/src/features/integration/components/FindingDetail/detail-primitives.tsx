// detail-primitives — tiny presentation helpers shared across FindingDetail files.

import { OutlineBadge } from '@fops/ui';
import type * as React from 'react';

export function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

export function FitBadge({
  children,
  className,
  ...rest
}: React.ComponentProps<typeof OutlineBadge>): React.ReactElement {
  return (
    <OutlineBadge className={`w-fit self-start ${className ?? ''}`} {...rest}>
      {children}
    </OutlineBadge>
  );
}

// ── Section divider ──────────────────────────────────────────────────────────

export function SectionDivider(): React.ReactElement {
  return <hr className="border-border-subtle" />;
}
