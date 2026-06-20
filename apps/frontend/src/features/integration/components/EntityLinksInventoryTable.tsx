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
    <table
      aria-label="Entity link inventory"
      className="table-fixed"
      style={{ minWidth: 'var(--entity-link-inventory-min-width)' }}
    >
      <colgroup>
        <col className="w-10" />
        <col style={{ width: 'var(--entity-link-inventory-narrow-col-width)' }} />
        <col />
        <col style={{ width: 'var(--entity-link-inventory-narrow-col-width)' }} />
        <col className="w-48" />
        <col className="w-40" />
        <col className="w-32" />
        <col className="w-32" />
      </colgroup>
      <thead>
        <tr
          className="h-10 border-b border-border-subtle bg-surface-canvas text-left font-semibold uppercase tracking-wide text-text-muted"
          style={{ fontSize: 'var(--text-tiny)' }}
        >
          <th className="px-4" scope="col">
            <span className="sr-only">Select</span>
          </th>
          <th className="px-2" scope="col">
            ID
          </th>
          <th className="px-2" scope="col">
            Relation
          </th>
          <th className="px-2" scope="col">
            Status
          </th>
          <th className="px-2" scope="col">
            Managed System
          </th>
          <th className="px-2" scope="col">
            Created by
          </th>
          <th className="px-2" scope="col">
            Created
          </th>
          <th className="px-2" scope="col">
            Updated
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map((link) => {
          const managedSystem = managedSystemsById[link.managed_system_id];
          const actor = actorsById[link.created_by];
          return (
            <tr
              key={link.id}
              style={{ height: 'var(--entity-link-inventory-row-height)' }}
              className={cn(
                'border-b border-border-subtle text-sm hover:bg-surface-row-hover',
                link.visibility_state === 'hidden' && 'bg-surface-blocked/60',
              )}
            >
              <td className="px-4">
                <Checkbox aria-label={`${shortId(link.id)} 선택`} />
              </td>
              <td className="px-2 font-mono text-xs text-text-muted">{shortId(link.id)}</td>
              <td className="px-2">
                <EntityRelationRow link={link} />
              </td>
              <td className="px-2">
                <LinkStatusBadge status={link.status} />
              </td>
              <td className="px-2">
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
              </td>
              <td className="truncate px-2 text-xs text-text-secondary">
                {actor?.display_name ?? shortId(link.created_by)}
              </td>
              <td className="px-2 text-xs text-text-muted">{formatTimestamp(link.created_at)}</td>
              <td className="px-2 text-xs text-text-muted">{formatTimestamp(link.updated_at)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
