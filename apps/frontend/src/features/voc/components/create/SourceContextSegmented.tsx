// SourceContextSegmented — segmented radio control for VOC source context.
// Spec §3.4: no proxy sub-fields in this slice.

import { SOURCE_CONTEXTS } from '@fops/shared';
import type { SourceContext } from '@fops/shared';
import { RadioGroup, RadioGroupItem } from '@fops/ui';
import { Megaphone, Search, User, Users } from 'lucide-react';
import type * as React from 'react';

export interface SourceContextSegmentedProps {
  value: SourceContext;
  onChange: (next: SourceContext) => void;
  labelId: string;
  disabled?: boolean;
  testId?: string;
}

const LABELS: Record<SourceContext, string> = {
  direct_use: '직접 사용',
  proxy_report: '타인 대신 보고',
  operational_discovery: '운영 중 발견',
  stakeholder_request: '이해관계자 요청',
};

const ICONS: Record<SourceContext, React.ComponentType<{ size?: number; className?: string }>> = {
  direct_use: User,
  proxy_report: Megaphone,
  operational_discovery: Search,
  stakeholder_request: Users,
};

export function SourceContextSegmented({
  value,
  onChange,
  labelId,
  disabled,
  testId,
}: SourceContextSegmentedProps): React.ReactElement {
  return (
    <div data-testid={testId}>
      <RadioGroup
        value={value}
        onValueChange={(next) => {
          // SOURCE_CONTEXTS is readonly tuple — validate before casting
          if ((SOURCE_CONTEXTS as ReadonlyArray<string>).includes(next)) {
            onChange(next as SourceContext);
          }
        }}
        appearance="segmented"
        orientation="horizontal"
        aria-labelledby={labelId}
        data-testid="source-context-list"
      >
        {SOURCE_CONTEXTS.map((ctx) => {
          const Icon = ICONS[ctx];
          return (
            <RadioGroupItem key={ctx} value={ctx} disabled={disabled} appearance="segmented">
              <Icon
                size={12}
                className="shrink-0"
                data-testid={`source-context-icon-${ctx}`}
                aria-hidden="true"
              />
              {LABELS[ctx]}
            </RadioGroupItem>
          );
        })}
      </RadioGroup>
    </div>
  );
}
