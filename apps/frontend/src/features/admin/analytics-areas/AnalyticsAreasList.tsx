import {
  Button,
  Callout,
  Checkbox,
  Label,
  OutlineBadge,
  PanelSectionTitle,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';
import { Filter, Layers, Plus, Shield } from 'lucide-react';

import type { AnalyticsAreaDto, ManagedSystemDto, ResolveActorsResponse } from '../../../lib/api';
import { envelopeMessage } from '../lib/envelopeMessage.js';
import { scopeMark } from '../lib/scopeMark.js';
import { teamName } from './teamName.js';
import { useManagedSystemsList } from './useAnalyticsAreasQueries.js';

export function AnalyticsAreasFilter({
  includeArchived,
  managedSystemId,
  onIncludeArchivedChange,
  onManagedSystemIdChange,
}: {
  includeArchived: boolean;
  managedSystemId: string | undefined;
  onIncludeArchivedChange: (value: boolean) => void;
  onManagedSystemIdChange: (value: string | undefined) => void;
}) {
  const systemsQuery = useManagedSystemsList(includeArchived);
  const systems = systemsQuery.data?.items ?? [];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="subtle" size="sm" data-testid="aa-filter-button">
          <Filter className="h-4 w-4" />
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="aa-filter-managed-system">Managed System</Label>
          <Select
            value={managedSystemId ?? 'all'}
            onValueChange={(value) => onManagedSystemIdChange(value === 'all' ? undefined : value)}
          >
            <SelectTrigger id="aa-filter-managed-system" data-testid="aa-filter-managed-system">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체</SelectItem>
              {systems.map((system) => (
                <SelectItem key={system.id} value={system.id}>
                  {system.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <label
          className="flex items-center gap-2 text-sm text-text-primary"
          htmlFor="aa-filter-include-archived"
        >
          <Checkbox
            id="aa-filter-include-archived"
            checked={includeArchived}
            onCheckedChange={(checked) => onIncludeArchivedChange(checked === true)}
            data-testid="aa-filter-include-archived"
          />
          Archived 포함
        </label>
      </PopoverContent>
    </Popover>
  );
}

export function AnalyticsAreasCatalog({
  guardrailTitle,
  guardrailBody,
  pending,
  areasIsError,
  areasError,
  systems,
  renderedSystems,
  areasByMs,
  resolved,
  renderedAreaCount,
  onRowClick,
  onAddArea,
  onClearFilters,
}: {
  guardrailTitle: string;
  guardrailBody: string;
  pending: boolean;
  areasIsError: boolean;
  areasError: unknown;
  systems: ManagedSystemDto[];
  renderedSystems: ManagedSystemDto[];
  areasByMs: Map<string, AnalyticsAreaDto[]>;
  resolved: ResolveActorsResponse | undefined;
  renderedAreaCount: number;
  onRowClick: (area: AnalyticsAreaDto) => void;
  onAddArea: (msId: string) => void;
  onClearFilters: () => void;
}) {
  return (
    <section className="space-y-6" data-testid="analytics-areas-catalog">
      <div data-testid="aa-guardrail-callout">
        <Callout tone="blue" icon={<Shield className="h-4 w-4" />} title={guardrailTitle}>
          {guardrailBody}
        </Callout>
      </div>

      <div>
        <div className="mb-3.5 flex items-center justify-between">
          <PanelSectionTitle className="mb-0">Catalog</PanelSectionTitle>
          <span className="text-xs text-text-muted">
            {renderedAreaCount} {renderedAreaCount === 1 ? 'area' : 'areas'} ·{' '}
            {renderedSystems.length} {renderedSystems.length === 1 ? 'system' : 'systems'}
          </span>
        </div>

        {pending ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : areasIsError ? (
          <p className="text-sm text-accent-danger" data-testid="aa-list-error">
            Error: {envelopeMessage(areasError)}
          </p>
        ) : systems.length === 0 ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted"
            data-testid="aa-empty-state"
          >
            등록된 Managed System 이 없습니다.
          </div>
        ) : renderedSystems.length === 0 ? (
          <div
            className="rounded-md border border-border-subtle bg-surface-card p-8 text-center text-sm text-text-muted"
            data-testid="aa-filter-empty-state"
          >
            <p>필터에 해당하는 Managed System이 없습니다.</p>
            <Button
              variant="subtle"
              size="sm"
              className="mt-3"
              onClick={onClearFilters}
              data-testid="aa-clear-filters"
            >
              필터 해제
            </Button>
          </div>
        ) : (
          <div data-testid="aa-grouped-list" className="space-y-4">
            {renderedSystems.map((m) => (
              <GroupCard
                key={m.id}
                ms={m}
                areas={areasByMs.get(m.id) ?? []}
                resolved={resolved}
                onRowClick={onRowClick}
                onAddArea={() => onAddArea(m.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function GroupCard({
  ms,
  areas,
  resolved,
  onRowClick,
  onAddArea,
}: {
  ms: ManagedSystemDto;
  areas: AnalyticsAreaDto[];
  resolved: ResolveActorsResponse | undefined;
  onRowClick: (a: AnalyticsAreaDto) => void;
  onAddArea: () => void;
}) {
  const mark = scopeMark(ms.slug, ms.name);
  return (
    <div
      data-testid={`aa-group-${ms.id}`}
      className="overflow-hidden rounded-md border border-border-subtle bg-surface-card"
    >
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4 py-2.5">
        <div
          className="flex items-center justify-center rounded-md text-[10px] font-semibold text-white"
          style={{ width: 22, height: 22, background: mark.color }}
          aria-hidden="true"
        >
          {mark.label}
        </div>
        <span className="text-sm font-semibold text-text-primary">{ms.name}</span>
        {ms.archived_at !== null ? <OutlineBadge>Archived</OutlineBadge> : null}
        <span className="text-xs text-text-muted">
          · {areas.length} {areas.length === 1 ? 'area' : 'areas'}
        </span>
        <div className="flex-1" />
        <Button
          variant="subtle"
          size="sm"
          onClick={onAddArea}
          data-testid={`aa-add-area-${ms.slug}`}
        >
          <Plus className="h-3 w-3" />
          Add area
        </Button>
      </div>

      {areas.length === 0 ? (
        <div className="px-4 py-4 text-center text-xs text-text-muted">
          등록된 Analytics Area 가 없습니다.
        </div>
      ) : (
        areas.map((a, i) => {
          const lead = teamName(a, resolved);
          return (
            // biome-ignore lint/a11y/useKeyWithClickEvents: row is a real <div> with a nested <button> affordance; click anywhere opens the detail.
            <div
              key={a.id}
              role="button"
              tabIndex={0}
              data-testid={`aa-row-${a.slug}`}
              onClick={() => onRowClick(a)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onRowClick(a);
              }}
              className={`grid w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-surface-canvas${
                i < areas.length - 1 ? ' border-b border-border-subtle' : ''
              }`}
              style={{ gridTemplateColumns: '1fr 1.2fr 0.8fr 100px' }}
            >
              <span className="flex min-w-0 items-center gap-2">
                <Layers className="h-3 w-3 shrink-0 text-text-muted" />
                <span className="truncate font-medium text-text-primary">{a.name}</span>
                {a.archived_at !== null ? <OutlineBadge>Archived</OutlineBadge> : null}
              </span>
              <span className="truncate font-mono text-xs text-text-muted">
                analytics-area/{a.slug}
              </span>
              <span className="truncate text-xs text-text-muted">
                Lead: <span className="text-text-secondary">{lead ?? '—'}</span>
              </span>
              <div className="text-right">
                <Button
                  variant="subtle"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRowClick(a);
                  }}
                  data-testid={`aa-detail-${a.slug}`}
                >
                  Detail
                </Button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
