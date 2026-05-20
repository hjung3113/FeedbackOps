// SeverityDisclaimerCard — static info card explaining that severity is set
// by ops staff, not by the reporter.

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle, cn } from '@fops/ui';

export interface SeverityDisclaimerCardProps {
  className?: string;
}

export function SeverityDisclaimerCard({ className }: SeverityDisclaimerCardProps): React.ReactElement {
  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">심각도 안내</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">
          심각도는 검토 후 운영팀이 결정합니다. 직접 설정할 수 없습니다.
        </p>
      </CardContent>
    </Card>
  );
}
