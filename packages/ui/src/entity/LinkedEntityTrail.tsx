import * as React from 'react';
import { cn } from '../utils/cn.js';
import { EntityIconBadge } from '../badges/EntityIconBadge.js';
import type { EntityIconType } from '../badges/EntityIconBadge.js';

export type EntityNodeRef =
  | {
      type: 'voc';
      id: string;
      display_id?: string;
      title?: string;
      meta?: string;
      onNavigate?: () => void;
    }
  | {
      type: 'finding';
      id: string;
      display_id?: string;
      title?: string;
      meta?: string;
      onNavigate?: () => void;
    }
  | {
      type: 'task';
      id: string;
      display_id?: string;
      title?: string;
      meta?: string;
      onNavigate?: () => void;
    }
  | {
      type: 'survey';
      id: string;
      display_id?: string;
      title?: string;
      meta?: string;
      onNavigate?: () => void;
    }
  | {
      type: 'cluster';
      id: string;
      display_id?: string;
      title?: string;
      meta?: string;
      onNavigate?: () => void;
    };

export interface LinkedEntityTrailProps {
  nodes: EntityNodeRef[];
  className?: string;
}

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

  return (
    <div className={cn('flex items-center flex-wrap gap-1.5', className)}>
      {nodes.map((node, idx) => {
        // 'cluster' has no EntityIconBadge type — fall back to a generic badge
        const iconType: EntityIconType =
          node.type === 'cluster' ? 'finding' : node.type;
        const label = node.title ?? node.display_id ?? node.id;
        const body = (
          <>
            <EntityIconBadge
              type={iconType}
              size={22}
              aria-label={node.display_id ?? node.id}
            />
            {(node.title ?? node.meta) && (
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="max-w-[12rem] truncate text-xs font-medium text-text-primary">
                  {label}
                </span>
                {node.meta && (
                  <span className="max-w-[12rem] truncate text-[11px] text-text-muted">
                    {node.meta}
                  </span>
                )}
              </span>
            )}
          </>
        );

        return (
          <React.Fragment key={node.id}>
            {node.onNavigate ? (
              <button
                type="button"
                onClick={node.onNavigate}
                className="inline-flex min-w-0 items-center gap-1 rounded-sm px-1 py-0.5 text-left hover:bg-surface-row-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-selected"
              >
                {body}
              </button>
            ) : (
              <span className="inline-flex min-w-0 items-center gap-1">{body}</span>
            )}
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
