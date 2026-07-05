// SourceContextSegmented — segmented tab control for VOC source context.
// Spec §3.4: no proxy sub-fields in this slice.

import * as React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@fops/ui';
import { SOURCE_CONTEXTS } from '@fops/shared';
import type { SourceContext } from '@fops/shared';
import {
  Megaphone,
  Search,
  User,
  Users,
} from 'lucide-react';

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

const ICONS: Record<SourceContext, React.ComponentType<{ size?: number; className?: string }>> = {
  direct_use: User,
  proxy_report: Megaphone,
  operational_discovery: Search,
  stakeholder_request: Users,
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
      <TabsList
        data-testid="source-context-list"
        className="inline-flex h-auto w-auto justify-start gap-0.5 rounded-md bg-surface-canvas p-0.5 text-text-muted shadow-subtle"
      >
        {SOURCE_CONTEXTS.map((ctx) => {
          const Icon = ICONS[ctx];
          return (
            <TabsTrigger
              key={ctx}
              value={ctx}
              disabled={disabled}
              className="flex-none gap-1.5 rounded-sm px-3 py-1.5 text-xs font-medium data-[state=active]:bg-surface-card-elevated data-[state=active]:text-text-primary data-[state=active]:shadow-subtle"
            >
              <Icon
                size={12}
                className="shrink-0"
                data-testid={`source-context-icon-${ctx}`}
                aria-hidden="true"
              />
              {LABELS[ctx]}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
