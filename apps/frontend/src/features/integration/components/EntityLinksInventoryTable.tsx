import type { EntityLinkDto } from '@fops/shared';
import { Checkbox, ManagedSystemPill, PermissionBlockedPanel, cn } from '@fops/ui';
import { EntityRelationRow } from './EntityRelationRow';
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
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

function formatTimestamp(raw: string | null): string {
  if (raw === null) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function EntityLinksInventoryTable({
  items,
  loading,
  error,
  managedSystemsById = {},
  actorsById = {},
  onRetry,
}: EntityLinksInventoryTableProps) {
  if (loading === true) {
    return <div className="p-6 text-sm text-text-muted">Loading entity_links…</div>;
  }

  if (error != null) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Entity links"
        reason={error.message}
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

  if (items.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-text-muted">
        해당 상태의 entity_link 가 없습니다.
      </div>
    );
  }

  return (
    <div
      aria-label="Entity link inventory"
      role="list"
      className="min-w-full"
    >
      {items.map((link) => {
        const managedSystem = managedSystemsById[link.managed_system_id];
        const actor = actorsById[link.created_by];
        return (
          <div
            key={link.id}
            role="listitem"
            className={cn(
              'grid min-h-row-default items-center gap-3 border-b border-border-subtle px-5 py-2.5 text-sm hover:bg-surface-row-hover',
              link.visibility_state === 'hidden' && 'bg-surface-blocked/60',
            )}
            style={{ gridTemplateColumns: 'var(--entity-link-object-row-grid)' }}
          >
            <div
              className="flex items-center"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              <Checkbox aria-label={`${shortId(link.id)} 선택`} />
            </div>
            <span
              className="font-mono text-xs text-text-muted"
              style={{ minWidth: 'var(--entity-link-object-id-min-width)' }}
            >
              {shortId(link.id)}
            </span>
            <div className="flex min-w-0 flex-col justify-center gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <EntityRelationRow link={link} compact />
                <LinkStatusBadge status={link.status} />
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-text-muted">
                {managedSystem !== undefined ? (
                  <ManagedSystemPill
                    name={managedSystem.name}
                    {...(managedSystem.mark !== undefined ? { mark: managedSystem.mark } : {})}
                    {...(managedSystem.archived !== undefined
                      ? { archived: managedSystem.archived }
                      : {})}
                  />
                ) : (
                  <span className="font-mono text-xs text-text-muted">
                    {shortId(link.managed_system_id)}
                  </span>
                )}
                <RowDot />
                <span>by {actor?.display_name ?? shortId(link.created_by)}</span>
                <RowDot />
                <span>updated {formatTimestamp(link.updated_at)}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2" aria-hidden="true" />
          </div>
        );
      })}
    </div>
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
