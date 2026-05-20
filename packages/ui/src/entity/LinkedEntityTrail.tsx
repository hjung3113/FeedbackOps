import * as React from 'react';
import { cn } from '../utils/cn.js';
import { EntityIconBadge } from '../badges/EntityIconBadge.js';
import type { EntityIconType } from '../badges/EntityIconBadge.js';

export type EntityNodeRef =
  | { type: 'voc'; id: string; display_id?: string }
  | { type: 'finding'; id: string; display_id?: string }
  | { type: 'task'; id: string; display_id?: string }
  | { type: 'survey'; id: string; display_id?: string }
  | { type: 'cluster'; id: string; display_id?: string };

export interface LinkedEntityTrailProps {
  nodes: EntityNodeRef[];
  className?: string;
}

/**
 * Placeholder component. Slice 4 wires real node resolution.
 * This PR lands the documented props shape + renders the empty state
 * with a dashed placeholder circle.
 */
export function LinkedEntityTrail({ nodes, className }: LinkedEntityTrailProps) {
  if (nodes.length === 0) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <span
          className="inline-flex items-center justify-center border border-dashed border-border-subtle rounded-full flex-shrink-0"
          style={{ width: 22, height: 22 }}
          aria-hidden="true"
        />
        <span className="text-xs text-text-muted">연결된 엔티티 없음</span>
      </div>
    );
  }

  // Slice 4 will resolve real node metadata; for now render EntityIconBadge per node
  return (
    <div className={cn('flex items-center flex-wrap gap-1', className)}>
      {nodes.map((node, idx) => {
        // 'cluster' has no EntityIconBadge type — fall back to a generic badge
        const iconType: EntityIconType =
          node.type === 'cluster' ? 'finding' : node.type;

        return (
          <React.Fragment key={node.id}>
            <EntityIconBadge
              type={iconType}
              size={22}
              aria-label={node.display_id ?? node.id}
            />
            {idx < nodes.length - 1 && (
              <span className="text-xs text-text-muted select-none" aria-hidden="true">
                →
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
