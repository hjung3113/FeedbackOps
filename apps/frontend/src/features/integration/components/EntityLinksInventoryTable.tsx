import { ListStateMessage } from '@/components/ListStateMessage';
import { isPermissionDenied } from '@/lib/api/types';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { formatShortDateTime } from '@/lib/format/datetime';
import { shortId } from '@/lib/identity';
import type { EntityLinkDto } from '@fops/shared';
import { Button, Checkbox, ManagedSystemPill, PermissionBlockedPanel, cn } from '@fops/ui';
import { EntityRelationRow, entityLinkEndpointPrimaryLabels } from './EntityRelationRow';
import { LinkStatusBadge } from './LinkStatusBadge';

export interface ManagedSystemPresentation {
  name: string;
  mark?: string;
  archived?: boolean;
}

export interface ActorPresentation {
  display_name: string;
}

export interface EntityLinksInventoryTableProps {
  items: EntityLinkDto[];
  loading?: boolean;
  error?: Error | null;
  managedSystemsById?: Record<string, ManagedSystemPresentation>;
  actorsById?: Record<string, ActorPresentation>;
  onRetry?: () => void;
  unfilteredItemsCount?: number;
  filterDescription?: string | undefined;
  onResetFilters?: (() => void) | undefined;
  hasMore?: boolean;
  loadingMore?: boolean;
  loadMoreError?: Error | null;
  onLoadMore?: (() => void) | undefined;
}

function formatTimestamp(raw: string | null): string {
  if (raw === null) return '-';
  return formatShortDateTime(raw);
}

export function EntityLinksInventoryTable({
  items,
  loading,
  error,
  managedSystemsById = {},
  actorsById = {},
  onRetry,
  unfilteredItemsCount = 0,
  filterDescription,
  onResetFilters,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
}: EntityLinksInventoryTableProps) {
  if (loading === true) {
    return <div className="p-6 text-sm text-text-muted">Entity links를 불러오는 중…</div>;
  }

  if (error != null) {
    if (isPermissionDenied(error)) {
      return (
        <PermissionBlockedPanel
          state="denied"
          category="Entity links"
          reason={PERMISSION_BLOCKED_REASONS.entityLinks}
          className="m-4"
          {...(onRetry !== undefined
            ? {
                summary: (
                  <button type="button" onClick={onRetry}>
                    다시 시도
                  </button>
                ),
              }
            : {})}
        />
      );
    }

    return (
      <div className="p-4">
        <ListStateMessage
          variant="error"
          title="Entity Link 목록을 불러오지 못했습니다"
          body="잠시 후 다시 시도하세요."
          {...(onRetry !== undefined ? { action: { label: '다시 시도', onClick: onRetry } } : {})}
        />
      </div>
    );
  }

  const loadMoreControl = hasMore === true && onLoadMore !== undefined && (
    <div className="flex justify-center border-t border-border-subtle py-2">
      <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore === true}>
        {loadingMore === true ? '불러오는 중…' : loadMoreError != null ? '다시 시도' : '더 보기'}
      </Button>
    </div>
  );

  if (items.length === 0) {
    if (hasMore === true) return <div>{loadMoreControl}</div>;
    if (filterDescription !== undefined && unfilteredItemsCount > 0) {
      return (
        <div className="p-4">
          <ListStateMessage
            variant="filtered"
            title="현재 조건에 맞는 Entity Link가 없습니다"
            body={filterDescription}
            {...(onResetFilters !== undefined
              ? { action: { label: '필터 초기화', onClick: onResetFilters } }
              : {})}
          />
        </div>
      );
    }

    return (
      <div className="p-4">
        <ListStateMessage
          variant="empty"
          title="Entity Link가 없습니다."
          body="시스템 간 연결이 생성되면 이 목록에 표시됩니다."
        />
      </div>
    );
  }

  return (
    <>
      <div aria-label="Entity link inventory" role="list" className="min-w-full">
        {items.map((link) => {
          const managedSystem = managedSystemsById[link.managed_system_id];
          const actor = actorsById[link.created_by];
          const [sourceLabel, targetLabel] = entityLinkEndpointPrimaryLabels(link);
          return (
            <div
              key={link.id}
              role="listitem"
              className={cn(
                'grid min-h-row-default items-center gap-3 border-b border-border-subtle px-5 py-2.5 text-sm hover:bg-surface-row-hover',
                link.visibility_state === 'hidden' && 'bg-surface-blocked/60',
              )}
              style={{ gridTemplateColumns: 'auto minmax(0, 1fr)' }}
            >
              <div
                className="flex items-center"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Checkbox aria-label={`${sourceLabel} → ${targetLabel} 선택`} />
              </div>
              <div className="flex min-w-0 flex-col justify-center gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {/* #589: endpoint identities lead this row; the link id stays secondary metadata. */}
                  <EntityRelationRow link={link} compact />
                  <LinkStatusBadge status={link.status} />
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span className="font-mono text-xs text-text-muted">Link {shortId(link.id)}</span>
                  <RowDot />
                  {managedSystem !== undefined ? (
                    <ManagedSystemPill
                      name={managedSystem.name}
                      {...(managedSystem.mark !== undefined ? { mark: managedSystem.mark } : {})}
                      {...(managedSystem.archived !== undefined
                        ? { archived: managedSystem.archived }
                        : {})}
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <span>Managed System</span>
                      <span className="font-mono text-xs text-text-muted">
                        {shortId(link.managed_system_id)}
                      </span>
                    </span>
                  )}
                  <RowDot />
                  <span>
                    by <span>{actor?.display_name ?? '알 수 없는 사용자'}</span>
                    {!actor && (
                      <span className="ml-1 font-mono text-text-muted">
                        {shortId(link.created_by)}
                      </span>
                    )}
                  </span>
                  <RowDot />
                  <span>updated {formatTimestamp(link.updated_at)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {loadMoreControl}
    </>
  );
}

function RowDot() {
  return (
    <span
      className="inline-block h-0.5 w-0.5 shrink-0 rounded-full bg-text-muted/60"
      aria-hidden="true"
    />
  );
}
