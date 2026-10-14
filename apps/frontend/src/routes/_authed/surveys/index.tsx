import { CreateSurveyDialog } from '@/features/surveys/components/create/CreateSurveyDialog';
import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import { SurveyList } from '@/features/surveys/components/list/SurveyList';
import { useSurvey, useSurveys } from '@/features/surveys/hooks/useSurveys';
import {
  useSurveyManageAnySystemGate,
  useSurveyManageGate,
} from '@/features/surveys/routes/SurveyPermissionGate';
export { CreateSurveyDialog } from '@/features/surveys/components/create/CreateSurveyDialog';
import { surveyStatusLabel } from '@/features/surveys/components/SurveyStatusBadge';
import { SURVEY_REPORT_FILTER_COPY as FILTER_COPY } from '@/lib/copy/surveys';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { formatRecordDocumentTitle, useDocumentTitle } from '@/lib/router/document-title';
import { parseRouteSearch } from '@/lib/router/search';
import { useAnalyticsAreaFilterLabel } from '@/lib/useAnalyticsAreaFilterLabel';
import { ListShell } from '@fops/ui';
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router';
import * as React from 'react';
import { z } from 'zod';

// Selection + Managed System scope are URL state (docs/frontend/routes-and-layout.md
// §URL State Rules): /surveys?managedSystem=:managedSystemId|all&selected=:surveyId.
// Defaults (scope union / nothing selected) are omitted from the URL. `all` and an
// absent managedSystem both query WITHOUT managed_system_id (the backend applies the
// caller's effective scope union); a uuid is passed through as the backend's
// `managed_system_id` query param. The route has no Managed System selector UI —
// the URL param is supported for deep links only.
export const surveysSearchSchema = z
  .object({
    managedSystem: z.union([z.string().uuid(), z.literal('all')]).optional(),
    selected: z.string().uuid().optional(),
    'filter.analytics_area': z.union([z.string().uuid(), z.literal('unset')]).optional(),
    status: z.literal('open').optional(),
    follow_up: z.literal('needed').optional(),
  })
  .strict();

type SurveysSearch = z.infer<typeof surveysSearchSchema>;

export function validateSurveysSearch(raw: unknown) {
  return parseRouteSearch(surveysSearchSchema, raw);
}

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the page exported for
// tests while letting the route component split into its own chunk.
const SurveysIndexRouteSplit = SurveysIndexRoute;

export const Route = createFileRoute('/_authed/surveys/')({
  validateSearch: validateSurveysSearch,
  component: SurveysIndexRouteSplit,
});

export function SurveysIndexRoute() {
  const search = useSearch({ strict: false }) as SurveysSearch;
  const navigate = useNavigate({ from: '/surveys/' });
  const managedSystemId = search.managedSystem === 'all' ? undefined : search.managedSystem;
  const query = useSurveys(managedSystemId, {
    ...(search['filter.analytics_area'] === undefined
      ? {}
      : { analytics_area_id: search['filter.analytics_area'] }),
    ...(search.status === undefined ? {} : { status: search.status }),
    ...(search.follow_up === undefined ? {} : { follow_up: search.follow_up }),
  });
  const areaLabel = useAnalyticsAreaFilterLabel(search['filter.analytics_area'], managedSystemId);
  const filterKeys = ['filter.analytics_area', 'status', 'follow_up'] as const;
  const removeFilters = (keys: readonly (typeof filterKeys)[number][]) => {
    void navigate({
      to: '/surveys',
      search: (previous) => {
        const next = { ...previous };
        for (const key of keys) delete next[key];
        return next;
      },
    });
  };
  const labels = {
    'filter.analytics_area': areaLabel,
    status: FILTER_COPY.status(surveyStatusLabel('open')),
    follow_up: FILTER_COPY.followUp,
  };
  const activeFilters = filterKeys.flatMap((key) =>
    search[key] === undefined
      ? []
      : [{ key, label: labels[key], onRemove: () => removeFilters([key]) }],
  );
  // Creation entry follows the survey.manage capability scope (ADR-0033): the
  // workspace-wide check stays only for the empty-state request-access
  // recovery; a scoped Developer with one granted system may create (#1075).
  const scopeGate = useSurveyManageAnySystemGate();
  const gate = useSurveyManageGate();
  const managedSystemNames = useManagedSystemNamesResult();
  const managedSystemNamesById = managedSystemNames.isSuccess
    ? managedSystemNames.namesById
    : undefined;
  const { actors, isSuccess: actorsResolved } = useWorkspaceActors();
  const actorNamesById = React.useMemo(
    () =>
      actorsResolved
        ? new Map((actors ?? []).map((actor) => [actor.id, actor.display_name]))
        : undefined,
    [actors, actorsResolved],
  );
  const [createOpen, setCreateOpen] = React.useState(false);
  const selectedId = search.selected ?? null;
  const selected = useSurvey(selectedId ?? '');
  const selectedGate = useSurveyManageGate(selected.data?.primary_managed_system_id);
  const surveys = query.data ?? [];
  useDocumentTitle(
    selected.isSuccess && !selected.isFetching && selected.data?.id === selectedId
      ? formatRecordDocumentTitle({
          displayId: selected.data.display_id,
          title: selected.data.title,
        })
      : null,
  );

  const handleSelect = React.useCallback(
    (id: string): void => {
      void navigate({ to: '/surveys', search: (prev) => ({ ...prev, selected: id }) });
    },
    [navigate],
  );

  function handleClose(): void {
    void navigate({
      to: '/surveys',
      search: ({ selected: _selected, ...rest }) => rest,
    });
  }

  // Stale/invalid `selected` (deleted, or not in the caller's scope): once the
  // list has loaded, replace-drop it so Back is not trapped in the invalid URL.
  // While loading — or when the list failed — the deep-linked selection is kept.
  React.useEffect(() => {
    if (!query.isSuccess) return;
    if (selectedId !== null && !surveys.some((survey) => survey.id === selectedId)) {
      void navigate({
        to: '/surveys',
        replace: true,
        search: ({ selected: _selected, ...rest }) => rest,
      });
    }
  }, [navigate, query.isSuccess, selectedId, surveys]);

  return (
    <>
      <ListShell
        toolbar={{ title: 'Surveys' }}
        list={
          <SurveyList
            surveys={query.data ?? []}
            urlFilters={activeFilters}
            onClearUrlFilters={() => removeFilters(filterKeys)}
            // #706 — isPending keeps the skeleton up through the whole
            // no-data window (incl. the retry delay), so tabs never render
            // unknown counts as 0.
            isLoading={query.isPending}
            error={query.error}
            selectedId={selectedId}
            onSelect={handleSelect}
            canCreate={scopeGate.canManage}
            {...(gate.permissionState !== undefined
              ? { permissionState: gate.permissionState }
              : {})}
            managedSystemNamesById={managedSystemNamesById}
            actorNamesById={actorNamesById}
            onCreate={() => setCreateOpen(true)}
            onRetry={() => void query.refetch()}
          />
        }
        detailPanel={
          selected.data ? (
            <SurveyDetail
              survey={selected.data}
              canManage={selectedGate.canManage}
              onClose={handleClose}
              managedSystemNamesById={managedSystemNamesById}
              actorNamesById={actorNamesById}
            />
          ) : undefined
        }
      />
      {createOpen && (
        <CreateSurveyDialog
          canManage={scopeGate.canManage}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(surveyId) =>
            void navigate({
              to: '/surveys/$surveyId',
              params: { surveyId },
              search: { builder: true },
            })
          }
        />
      )}
    </>
  );
}
