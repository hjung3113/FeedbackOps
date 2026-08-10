import { Link } from '@tanstack/react-router';
import { Card, CardContent } from '@fops/ui';
import type * as React from 'react';

import { formatVocCreatedAt } from '@/features/voc/components/list/VocRow';
import { useVocPreSubmitPeers } from '../../hooks/useVocPreSubmitPeers';

export interface SimilarVocPanelProps {
  managedSystemId: string | null | undefined;
}

export function SimilarVocPanel({ managedSystemId }: SimilarVocPanelProps): React.ReactElement | null {
  const { data, isError } = useVocPreSubmitPeers(managedSystemId);

  if (!managedSystemId || isError || !data) return null;

  return (
    <Card className="p-3.5" data-testid="similar-voc-panel">
      <CardContent className="p-0">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-normal text-text-muted">유사 VOC</span>
          <span className="text-xs text-text-muted">{data.items.length}건</span>
        </div>
        <div className="flex flex-col gap-1">
          {data.items.map((item) => (
            <Link
              key={item.id}
              to="/vocs"
              search={{ view: 'inbox', selected: item.id }}
              className="flex w-full flex-col gap-0.5 rounded px-2.5 py-2 text-left transition-colors hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-selected"
            >
              <span className="truncate text-xs font-medium text-text-primary">{item.title}</span>
              <span className="font-mono text-[11px] text-text-muted">
                {item.display_id} · {formatVocCreatedAt(item.created_at)}
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
