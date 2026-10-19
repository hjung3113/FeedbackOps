import type { PickerOption } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { AnalyticsAreaDto, ManagedSystemDto } from '../../../lib/api';
import { groupAreasByMs } from '../lib/groupAreasByMs.js';
import { restoreFocus, useRestoreFocusAfterRefetch } from '../lib/restoreFocus.js';
import { AnalyticsAreaSlideOver } from './AnalyticsAreaDetail.js';
import { EditDialog, RegisterDialog } from './AnalyticsAreaDialogs.js';
import { AnalyticsAreasCatalog } from './AnalyticsAreasList.js';
import type { AnalyticsAreasSearch } from './search.js';
import {
  invalidateAnalyticsAreas,
  useAnalyticsAreaTeams,
  useAnalyticsAreasList,
  useManagedSystemsList,
} from './useAnalyticsAreasQueries.js';

export function AnalyticsAreasBody({
  includeArchived,
  managedSystemId,
  selectedId,
  onClearFilters,
  registerCtx,
  setRegisterCtx,
  guardrailTitle,
  guardrailBody,
}: {
  includeArchived: boolean;
  managedSystemId: string | undefined;
  selectedId: string | undefined;
  onClearFilters: () => void;
  registerCtx: { open: boolean; msId: string | null };
  setRegisterCtx: (v: { open: boolean; msId: string | null }) => void;
  guardrailTitle: string;
  guardrailBody: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: '/admin/analytics-areas' });
  const [editTarget, setEditTarget] = useState<AnalyticsAreaDto | null>(null);
  // Row control that opened the detail drawer and, from it, the edit dialog.
  const rowTrigger = useRef<HTMLElement | null>(null);

  const msQuery = useManagedSystemsList(includeArchived);
  const aaQuery = useAnalyticsAreasList(managedSystemId, includeArchived);

  const systems = useMemo(() => msQuery.data?.items ?? [], [msQuery.data]);
  const renderedSystems = useMemo(
    () => (managedSystemId ? systems.filter((system) => system.id === managedSystemId) : systems),
    [managedSystemId, systems],
  );
  const armFocusFallback = useRestoreFocusAfterRefetch(aaQuery.isFetching || msQuery.isFetching);
  const areas = useMemo(() => aaQuery.data?.items ?? [], [aaQuery.data]);
  // The open detail is derived from the URL `selected` + the loaded list.
  const detail = useMemo(
    () => (selectedId === undefined ? null : (areas.find((a) => a.id === selectedId) ?? null)),
    [areas, selectedId],
  );

  function selectArea(id: string, trigger: HTMLElement): void {
    rowTrigger.current = trigger;
    void navigate({
      to: '/admin/analytics-areas',
      search: (prev: AnalyticsAreasSearch) => ({ ...prev, selected: id }),
    });
  }

  function closeDetail(): void {
    void navigate({
      to: '/admin/analytics-areas',
      search: ({ selected: _selected, ...rest }: AnalyticsAreasSearch) => rest,
    });
  }

  // Stale/invalid `selected` (archived, deleted, or filtered away): once the
  // list has loaded, replace-drop it so Back is not trapped in the invalid URL.
  // While loading the selection is kept.
  useEffect(() => {
    if (aaQuery.data === undefined) return;
    if (selectedId !== undefined && !areas.some((a) => a.id === selectedId)) {
      void navigate({
        to: '/admin/analytics-areas',
        replace: true,
        search: ({ selected: _selected, ...rest }: AnalyticsAreasSearch) => rest,
      });
    }
  }, [aaQuery.data, areas, navigate, selectedId]);

  const areasByMs = useMemo(() => groupAreasByMs(areas, includeArchived), [areas, includeArchived]);
  const renderedAreaCount = useMemo(
    () =>
      renderedSystems.reduce((count, system) => count + (areasByMs.get(system.id)?.length ?? 0), 0),
    [areasByMs, renderedSystems],
  );
  const msById = useMemo(
    () => new Map<string, ManagedSystemDto>(systems.map((m) => [m.id, m])),
    [systems],
  );

  const teamIds = useMemo(
    () => [...new Set(areas.map((a) => a.owner_team_id).filter((v): v is string => !!v))],
    [areas],
  );
  const resolveQuery = useAnalyticsAreaTeams(teamIds);

  const msOptions: PickerOption[] = systems
    .filter((m) => includeArchived || m.archived_at === null)
    .map((m) => ({ id: m.id, label: m.name, slug: m.slug }));

  async function invalidate() {
    await invalidateAnalyticsAreas(qc);
  }

  return (
    <>
      <AnalyticsAreasCatalog
        guardrailTitle={guardrailTitle}
        guardrailBody={guardrailBody}
        pending={aaQuery.isPending || msQuery.isPending}
        areasIsError={aaQuery.isError}
        areasError={aaQuery.error}
        systems={systems}
        renderedSystems={renderedSystems}
        areasByMs={areasByMs}
        resolved={resolveQuery.data}
        renderedAreaCount={renderedAreaCount}
        onRowClick={(a, trigger) => selectArea(a.id, trigger)}
        onAddArea={(msId) => setRegisterCtx({ open: true, msId })}
        onClearFilters={onClearFilters}
      />

      <RegisterDialog
        ctx={registerCtx}
        msOptions={msOptions}
        onOpenChange={(open) => setRegisterCtx({ open, msId: open ? registerCtx.msId : null })}
        onSaved={async () => {
          setRegisterCtx({ open: false, msId: null });
          await invalidate();
        }}
      />

      <AnalyticsAreaSlideOver
        area={detail}
        ms={detail ? (msById.get(detail.managed_system_id) ?? null) : null}
        resolved={resolveQuery.data}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        onEdit={(area) => {
          closeDetail();
          setEditTarget(area);
        }}
      />

      <EditDialog
        target={editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus(rowTrigger.current);
        }}
        onSaved={async () => {
          setEditTarget(null);
          await invalidate();
          // An archived row can drop out of the list once it refetches.
          armFocusFallback(rowTrigger.current);
        }}
      />
    </>
  );
}
