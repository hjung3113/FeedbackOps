import { ListStateMessage } from '@/components/ListStateMessage';
import { RequestAccessButton } from '@/features/admin/permissions/request-access-button';
import type { FrontendPermissionState } from '@/lib/api';
import { SURVEY_STATUS_LABELS, SURVEY_TYPE_LABELS } from '@/lib/copy/enum-labels';
import { Button, Input, ListToolbar, type ListToolbarTab, Skeleton, UserAvatar } from '@fops/ui';
import { Grid2X2, List, Plus } from 'lucide-react';
import * as React from 'react';
import type { Survey, SurveyStatus } from '../../types';
import { SurveyManagedSystemPill } from '../SurveyManagedSystemPill';
import { SurveyStatusBadge, surveyStatusLabel } from '../SurveyStatusBadge';
const tabs: Array<{ label: string; value: SurveyStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: SURVEY_STATUS_LABELS.open, value: 'open' },
  { label: SURVEY_STATUS_LABELS.draft, value: 'draft' },
  { label: SURVEY_STATUS_LABELS.closed, value: 'closed' },
];
const SURVEY_LIST_PANEL_ID = 'survey-list-panel';

export interface SurveyListProps {
  surveys: Survey[];
  isLoading: boolean;
  error: Error | null;
  selectedId?: string | null;
  onSelect: (id: string) => void;
  canCreate?: boolean;
  permissionState?: FrontendPermissionState;
  onCreate?: () => void;
  onRetry?: () => void;
  managedSystemNamesById?: ReadonlyMap<string, string> | undefined;
  actorNamesById?: ReadonlyMap<string, string> | undefined;
}

export function SurveyList({
  surveys,
  isLoading,
  error,
  selectedId,
  onSelect,
  canCreate = false,
  permissionState,
  onCreate,
  onRetry,
  managedSystemNamesById,
  actorNamesById,
}: SurveyListProps) {
  const [status, setStatus] = React.useState<SurveyStatus | 'all'>('all');
  const [search, setSearch] = React.useState('');
  const [viewMode, setViewMode] = React.useState<'list' | 'card'>('list');
  const visible = surveys.filter(
    (survey) =>
      (status === 'all' || survey.status === status) &&
      `${survey.display_id} ${survey.title}`.toLowerCase().includes(search.toLowerCase()),
  );
  if (isLoading)
    return (
      <div className="space-y-2 p-4" data-testid="survey-list-skeleton">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  if (error)
    return (
      <div data-testid="survey-list-error">
        <ListStateMessage
          variant="error"
          title="설문 목록을 불러오지 못했습니다"
          body="잠시 후 다시 시도하세요."
          {...(onRetry !== undefined ? { action: { label: '다시 시도', onClick: onRetry } } : {})}
        />
      </div>
    );
  const activeConditions = [
    ...(status !== 'all' ? [`상태: ${surveyStatusLabel(status)}`] : []),
    ...(search.length > 0 ? [`검색어: ${search}`] : []),
  ];
  const isFilteredEmpty = surveys.length > 0 && visible.length === 0 && activeConditions.length > 0;
  const toolbarTabs: ListToolbarTab[] = tabs.map((tab) => ({
    value: tab.value,
    label: tab.label,
    id: `survey-tab-${tab.value}`,
    controlsId: SURVEY_LIST_PANEL_ID,
    badgeCount:
      tab.value === 'all'
        ? surveys.length
        : surveys.filter((survey) => survey.status === tab.value).length,
  }));
  return (
    <div data-testid="survey-list">
      <ListToolbar
        tabs={toolbarTabs}
        activeTab={status}
        onTabChange={(next) => setStatus(next as SurveyStatus | 'all')}
        tabsAriaLabel="Survey status"
        action={
          <div className="flex items-center gap-2">
            <Input
              aria-label="Survey 검색"
              className="max-w-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Survey 검색…"
            />
            <div className="flex rounded border border-border-subtle p-0.5">
              <button
                type="button"
                aria-label="목록 보기"
                aria-pressed={viewMode === 'list'}
                onClick={() => setViewMode('list')}
                className={`rounded p-1 ${viewMode === 'list' ? 'bg-surface-card' : ''}`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="카드 보기"
                aria-pressed={viewMode === 'card'}
                onClick={() => setViewMode('card')}
                className={`rounded p-1 ${viewMode === 'card' ? 'bg-surface-card' : ''}`}
              >
                <Grid2X2 className="h-3.5 w-3.5" />
              </button>
            </div>
            {canCreate && onCreate && (
              <Button
                variant="primary"
                size="sm"
                onClick={onCreate}
                data-testid="survey-create-button"
              >
                <Plus className="h-4 w-4" />
                설문 생성
              </Button>
            )}
          </div>
        }
      />
      <div id={SURVEY_LIST_PANEL_ID} role="tabpanel" aria-labelledby={`survey-tab-${status}`}>
        {visible.length === 0 ? (
          isFilteredEmpty ? (
            <ListStateMessage
              variant="filtered"
              title="현재 조건에 맞는 설문이 없습니다"
              body={activeConditions.join(' · ')}
              action={{
                label: '필터 초기화',
                onClick: () => {
                  setStatus('all');
                  setSearch('');
                },
              }}
            />
          ) : (
            <ListStateMessage
              variant="empty"
              title="생성된 설문이 없습니다."
              body={
                canCreate
                  ? '설문을 만들어 응답을 수집하세요.'
                  : '설문을 만들려면 survey.manage 권한이 필요합니다.'
              }
              actionContent={
                canCreate ? (
                  onCreate && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onCreate}
                      data-testid="survey-empty-create-button"
                    >
                      <Plus className="h-4 w-4" />
                      설문 생성
                    </Button>
                  )
                ) : permissionState === 'request_access' ? (
                  <RequestAccessButton capability="survey.manage" returnRouteIntent="/surveys" />
                ) : (
                  <p data-testid="survey-empty-contact-admin">담당 관리자에게 문의하세요.</p>
                )
              }
            />
          )
        ) : (
          <div
            className={
              viewMode === 'list'
                ? 'divide-y divide-border-subtle'
                : 'grid grid-cols-1 gap-3 p-4 md:grid-cols-2'
            }
            data-testid={viewMode === 'list' ? 'survey-list-rows' : 'survey-list-cards'}
          >
            {visible.map((survey) => {
              const operatorLookupPending =
                survey.operator_actor_id !== null && actorNamesById === undefined;
              const operatorName = survey.operator_actor_id
                ? actorNamesById === undefined
                  ? '—'
                  : (actorNamesById.get(survey.operator_actor_id) ?? '알 수 없는 사용자')
                : null;
              return (
                <button
                  key={survey.id}
                  type="button"
                  onClick={() => onSelect(survey.id)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-card ${viewMode === 'card' ? 'rounded border border-border-subtle' : ''} ${selectedId === survey.id ? 'bg-surface-detail' : ''}`}
                  data-testid={`survey-row-${survey.id}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text-primary">
                      {survey.title}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-text-muted">
                      <span>{survey.display_id}</span>
                      <span aria-hidden="true">·</span>
                      <SurveyStatusBadge status={survey.status} />
                      <span aria-hidden="true">·</span>
                      <span>{SURVEY_TYPE_LABELS[survey.type]}</span>
                      <span aria-hidden="true">·</span>
                      <SurveyManagedSystemPill
                        name={managedSystemNamesById?.get(survey.primary_managed_system_id)}
                        resolved={managedSystemNamesById !== undefined}
                      />
                    </span>
                  </span>
                  <span
                    className={`flex max-w-40 shrink-0 items-center gap-2 truncate text-xs ${operatorLookupPending ? 'text-text-muted' : 'text-text-secondary'}`}
                  >
                    {operatorName === null ? (
                      <span>담당자 미지정</span>
                    ) : operatorLookupPending ? (
                      <span>—</span>
                    ) : (
                      <>
                        <UserAvatar user={{ display_name: operatorName }} size="sm" />
                        <span className="truncate">{operatorName}</span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
