// SourceContextSegmented — segmented tab control for VOC source context.
// Spec §3.4: no proxy sub-fields in this slice.

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@fops/ui';
import { SOURCE_CONTEXTS } from '@fops/shared';
import type { SourceContext } from '@fops/shared';

export interface SourceContextSegmentedProps {
  value: SourceContext;
  onChange: (next: SourceContext) => void;
  disabled?: boolean;
  testId?: string;
}

const LABELS: Record<SourceContext, string> = {
  direct_use: '직접 사용',
  proxy_report: '타인 대신 보고',
  operational_discovery: '운영 중 발견',
  stakeholder_request: '이해관계자 요청',
};

export function SourceContextSegmented({
  value,
  onChange,
  disabled,
  testId,
}: SourceContextSegmentedProps): React.ReactElement {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        // SOURCE_CONTEXTS is readonly tuple — validate before casting
        if ((SOURCE_CONTEXTS as ReadonlyArray<string>).includes(next)) {
          onChange(next as SourceContext);
        }
      }}
      data-testid={testId}
    >
      <TabsList className="w-full">
        {SOURCE_CONTEXTS.map((ctx) => (
          <TabsTrigger
            key={ctx}
            value={ctx}
            disabled={disabled}
            className="flex-1"
          >
            {LABELS[ctx]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
