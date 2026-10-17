import { surveyStatusLabel } from '@/features/surveys/components/SurveyStatusBadge';
import { CreateSurveyDialog } from '@/features/surveys/components/create/CreateSurveyDialog';
import { SurveyList } from '@/features/surveys/components/list/SurveyList';
import { useSurveys } from '@/features/surveys/hooks/useSurveys';
import {
  useSurveyManageAnySystemGate,
  useSurveyManageGate,
} from '@/features/surveys/routes/SurveyPermissionGate';
import { SURVEY_REPORT_FILTER_COPY as FILTER_COPY } from '@/lib/copy/surveys';
import { useAnalyticsAreaFilterLabel } from '@/lib/useAnalyticsAreaFilterLabel';
import type { ListSurveysQuery } from '@fops/shared';
import { ListShell } from '@fops/ui';
import * as React from 'react';

const FILTER_KEYS = ['filter.analytics_area', 'status', 'follow_up'] as const;
export type SurveyListFilterKey = (typeof FILTER_KEYS)[number];

export interface SurveyListContext {
  managedSystem?: string;
  analyticsArea?: string;
  status?: 'open';
  followUp?: 'needed';
}

export function surveyListContextFromSearch(search: {
  managedSystem?: string | undefined;
  'filter.analytics_area'?: string | undefined;
  status?: 'open' | undefined;
  follow_up?: 'needed' | undefined;
}): SurveyListContext {
  return {
    ...(search.managedSystem === undefined ? {} : { managedSystem: search.managedSystem }),
    ...(search['filter.analytics_area'] === undefined
      ? {}
      : { analyticsArea: search['filter.analytics_area'] }),
    ...(search.status === undefined ? {} : { status: search.status }),
    ...(search.follow_up === undefined ? {} : { followUp: search.follow_up }),
  };
}

export function surveyListQueryArgs(context: SurveyListContext): {
  managedSystemId: string | undefined;
  filters: Omit<ListSurveysQuery, 'managed_system_id'>;
} {
  return {
    managedSystemId:
      context.managedSystem !== undefined && context.managedSystem !== 'all'
        ? context.managedSystem
        : undefined,
    filters: {
      ...(context.analyticsArea === undefined ? {} : { analytics_area_id: context.analyticsArea }),
      ...(context.status === undefined ? {} : { status: context.status }),
      ...(context.followUp === undefined ? {} : { follow_up: context.followUp }),
    },
  };
}

export function surveyListContextSearch(context: SurveyListContext): {
  managedSystem?: string;
  'filter.analytics_area'?: string;
  status?: 'open';
  follow_up?: 'needed';
} {
  return {
    ...(context.managedSystem === undefined ? {} : { managedSystem: context.managedSystem }),
    ...(context.analyticsArea === undefined
      ? {}
      : { 'filter.analytics_area': context.analyticsArea }),
    ...(context.status === undefined ? {} : { status: context.status }),
    ...(context.followUp === undefined ? {} : { follow_up: context.followUp }),
  };
}

export function SurveyListScreen({
  context,
  selectedId,
  onSelect,
  onClose,
  onRemoveFilters,
  onCreated,
  managedSystemNamesById,
  actorNamesById,
  renderDetail,
}: {
  context: SurveyListContext;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onRemoveFilters: (keys: readonly SurveyListFilterKey[]) => void;
  onCreated: (surveyId: string) => void;
  managedSystemNamesById: ReadonlyMap<string, string> | undefined;
  actorNamesById: ReadonlyMap<string, string> | undefined;
  renderDetail: (close: () => void) => React.ReactNode;
}) {
  const { managedSystemId, filters } = surveyListQueryArgs(context);
  const query = useSurveys(managedSystemId, filters);
  const areaLabel = useAnalyticsAreaFilterLabel(context.analyticsArea, managedSystemId);
  const scopeGate = useSurveyManageAnySystemGate();
  const gate = useSurveyManageGate();
  const [createOpen, setCreateOpen] = React.useState(false);
  const labels = {
    'filter.analytics_area': areaLabel,
    status: FILTER_COPY.status(surveyStatusLabel('open')),
    follow_up: FILTER_COPY.followUp,
  };
  const activeKeys = FILTER_KEYS.filter((key) => {
    if (key === 'filter.analytics_area') return context.analyticsArea !== undefined;
    if (key === 'status') return context.status !== undefined;
    return context.followUp !== undefined;
  });
  const detailPanel = renderDetail(onClose);
  const activeFilters = activeKeys.map((key) => ({
    key,
    label: labels[key],
    onRemove: () => onRemoveFilters([key]),
  }));

  return (
    <>
      <ListShell
        toolbar={{ title: 'Surveys' }}
        list={
          <SurveyList
            surveys={query.data ?? []}
            urlFilters={activeFilters}
            onClearUrlFilters={() => onRemoveFilters(FILTER_KEYS)}
            // #706 — isPending keeps the skeleton up through the whole
            // no-data window (incl. the retry delay), so tabs never render
            // unknown counts as 0.
            isLoading={query.isPending}
            error={query.error}
            selectedId={selectedId}
            onSelect={onSelect}
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
        {...(detailPanel != null ? { detailPanel } : {})}
      />
      {createOpen && (
        <CreateSurveyDialog
          canManage={scopeGate.canManage}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={onCreated}
        />
      )}
    </>
  );
}
