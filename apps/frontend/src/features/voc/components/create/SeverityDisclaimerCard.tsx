// SeverityDisclaimerCard — static info card explaining that severity is set
// by ops staff, not by the reporter.

import * as React from 'react';
import { Card, CardContent, cn } from '@fops/ui';
import { Shield } from 'lucide-react';

export interface SeverityDisclaimerCardProps {
  className?: string;
}

export function SeverityDisclaimerCard({ className }: SeverityDisclaimerCardProps): React.ReactElement {
  return (
    <Card className={cn('bg-accent-primary/5 p-3.5', className)}>
      <CardContent className="p-0">
        <span className="sr-only">심각도 안내</span>
        <p className="text-xs leading-relaxed text-text-secondary">
          <Shield className="mr-1 inline h-3 w-3 align-text-bottom text-accent-primary" aria-hidden />
          심각도는 검토 후 운영팀이 결정합니다. 직접 설정할 수 없습니다.
        </p>
      </CardContent>
    </Card>
  );
}
