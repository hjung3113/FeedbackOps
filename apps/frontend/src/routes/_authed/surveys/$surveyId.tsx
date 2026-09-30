import { SurveyBuilder } from '@/features/surveys/components/builder/SurveyBuilder';
import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import { SurveyList } from '@/features/surveys/components/list/SurveyList';
import { useSurvey, useSurveys } from '@/features/surveys/hooks/useSurveys';
import { useSurveyManageGate } from '@/features/surveys/routes/SurveyPermissionGate';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { useManagedSystemNamesResult } from '@/lib/cross-system/useManagedSystemNames';
import { useWorkspaceActors } from '@/lib/cross-system/useWorkspaceActors';
import { EmptyState, ListShell, PermissionBlockedPanel } from '@fops/ui';
import { Outlet, createFileRoute, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { useMemo } from 'react';
import { z } from 'zod';

const searchSchema = z.object({ builder: z.boolean().optional() }).strict();
export const Route = createFileRoute('/_authed/surveys/$surveyId')({
  validateSearch: (raw) => searchSchema.parse(raw),
  component: SurveyDetailRoute,
});

export function SurveyDetailRoute() {
  const { surveyId } = Route.useParams();
  const matchRoute = useMatchRoute();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const isResultsRoute = matchRoute({
    to: '/surveys/$surveyId/results',
    params: { surveyId },
    fuzzy: false,
  });
  const isFollowUpRoute = matchRoute({
    to: '/surveys/$surveyId/follow-up',
    params: { surveyId },
    fuzzy: false,
  });
  const isOutcomeReviewRoute = isResultsRoute || isFollowUpRoute;
  const query = useSurvey(surveyId);
  const gate = useSurveyManageGate(query.data?.primary_managed_system_id);
  const list = useSurveys();
  const managedSystemNames = useManagedSystemNamesResult({ enabled: !isOutcomeReviewRoute });
  const managedSystemNamesById = managedSystemNames.isSuccess
    ? managedSystemNames.namesById
    : undefined;
  const actorsQuery = useWorkspaceActors({ enabled: !isOutcomeReviewRoute });
  const actorNamesById = useMemo(
    () =>
      actorsQuery.isSuccess
        ? new Map((actorsQuery.actors ?? []).map((actor) => [actor.id, actor.display_name]))
        : undefined,
    [actorsQuery.actors, actorsQuery.isSuccess],
  );

  if (isOutcomeReviewRoute) return <Outlet />;
  if (query.isLoading) return <div className="p-6 text-sm text-text-muted">불러오는 중…</div>;
  if (query.isError || !query.data)
    return (
      <EmptyState title="설문을 찾을 수 없습니다." body="삭제되었거나 접근 권한이 없습니다." />
    );
  if (search.builder) {
    if (!gate.canManage)
      return (
        <div className="p-6">
          <PermissionBlockedPanel
            state="blocked_not_requestable"
            category="Survey Builder"
            reason={PERMISSION_BLOCKED_REASONS.surveyBuilder}
          />
        </div>
      );
    return (
      <SurveyBuilder
        survey={query.data}
        canManage
        managedSystemNamesById={managedSystemNamesById}
        {...(gate.gateState ? { gateState: gate.gateState } : {})}
        onBack={() => void navigate({ to: '/surveys/$surveyId', params: { surveyId } })}
      />
    );
  }
  return (
    <ListShell
      list={
        <SurveyList
          surveys={list.data ?? []}
          isLoading={list.isLoading}
          error={list.error}
          onRetry={() => void list.refetch()}
          selectedId={surveyId}
          managedSystemNamesById={managedSystemNamesById}
          actorNamesById={actorNamesById}
          onSelect={(id) =>
            void navigate({
              to: '/surveys/$surveyId',
              params: { surveyId: id },
            })
          }
        />
      }
      detailPanel={
        <SurveyDetail
          survey={query.data}
          canManage={gate.canManage}
          onClose={() => void navigate({ to: '/surveys' })}
          managedSystemNamesById={managedSystemNamesById}
          actorNamesById={actorNamesById}
        />
      }
    />
  );
}
