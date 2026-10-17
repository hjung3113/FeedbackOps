// SeverityDisclaimerCard — one muted line explaining that ops staff sets
// severity after review.

import { VOC_SEVERITY_DISCLAIMER } from '@/lib/copy/voc';
import { cn } from '@fops/ui';
import type * as React from 'react';

export interface SeverityDisclaimerCardProps {
  className?: string;
}

export function SeverityDisclaimerCard({
  className,
}: SeverityDisclaimerCardProps): React.ReactElement {
  return (
    <p className={cn('text-xs leading-relaxed text-text-muted', className)}>
      {VOC_SEVERITY_DISCLAIMER}
    </p>
  );
}
