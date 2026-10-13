import { TASK_PRIORITY_LABELS } from '@/lib/copy/enum-labels';
import { RESPONSIBILITY_COPY } from '@/lib/copy/tasks';
import type { WorkspaceActor } from '@/lib/cross-system/useWorkspaceActors';
import { shortId } from '@/lib/identity';
import type { TaskPriority } from '@fops/shared';
import {
  Button,
  DatePicker,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fops/ui';

import { useResponsibilityIdentityNames } from '../../components/ResponsibilityEditor';

import type { NameMaps } from './TaskRequestRow';
import { TASK_PRIORITIES, type UseTaskRequestConversionResult } from './useTaskRequestConversion';

const NO_SELECTION = '__none__';
const UNRESOLVED_ANALYTICS_AREA = '__analytics_area_unresolved__';
const ANALYTICS_AREA_HINT_ID = 'task-request-convert-analytics-area-hint';

function CandidateTeamOptions({ ids, names }: { ids: readonly string[]; names: NameMaps }) {
  const identity = useResponsibilityIdentityNames(null, ids);
  return ids.map((id) => (
    <SelectItem key={id} value={id}>
      {identity.teamName(id) ?? names.teamsById?.[id]?.name ?? `팀 ${shortId(id)}`}
    </SelectItem>
  ));
}

export function TaskRequestConversionForm({
  conversion,
  teamCandidates,
  names,
  eligibleActors,
}: {
  conversion: UseTaskRequestConversionResult;
  /** Team ids already known in context (Managed System defaults, queue teams). */
  teamCandidates: readonly string[];
  names: NameMaps;
  eligibleActors: readonly WorkspaceActor[];
}) {
  const candidateTeamIds = [
    ...new Set([...teamCandidates, ...(conversion.teamId ? [conversion.teamId] : [])]),
  ];
  const analyticsAreaValue =
    conversion.analyticsAreaSelection.kind === 'active'
      ? conversion.analyticsAreaSelection.id
      : conversion.analyticsAreaSelection.kind === 'none'
        ? NO_SELECTION
        : UNRESOLVED_ANALYTICS_AREA;
  const analyticsAreaHint =
    conversion.analyticsAreaUnresolvedReason === 'source-unavailable'
      ? '원본 Finding의 Analytics Area가 보관되어 있습니다. 다른 Analytics Area를 선택하거나 없음을 선택하세요.'
      : conversion.analyticsAreaUnresolvedReason === 'selection-unavailable'
        ? '선택한 Analytics Area를 더 이상 사용할 수 없습니다. 다른 Analytics Area를 선택하거나 없음을 선택하세요.'
        : null;

  return (
    <form
      className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3"
      onSubmit={conversion.submit}
    >
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="task-request-convert-title-input">제목</FieldLabel>
        <input
          id="task-request-convert-title-input"
          ref={conversion.titleInputRef}
          className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
          value={conversion.title}
          aria-invalid={conversion.titleError !== null}
          aria-describedby={
            conversion.titleError
              ? 'task-request-convert-title-count task-request-convert-title-error'
              : 'task-request-convert-title-count'
          }
          data-testid="task-request-convert-title-input"
          onChange={(event) => conversion.setTitle(event.target.value)}
        />
        <span
          id="task-request-convert-title-count"
          className="text-xs text-text-muted"
          data-testid="task-request-convert-title-count"
        >
          {conversion.title.length}/{conversion.titleMaxLength}
        </span>
        {conversion.titleError && (
          <span
            id="task-request-convert-title-error"
            role="alert"
            className="text-xs text-accent-danger"
            data-testid="task-request-convert-title-error"
          >
            {conversion.titleError}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="task-request-convert-priority">우선순위</FieldLabel>
          <Select
            value={conversion.priority}
            onValueChange={(value) => conversion.setPriority(value as TaskPriority)}
          >
            <SelectTrigger id="task-request-convert-priority" aria-label="우선순위">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {TASK_PRIORITY_LABELS[priority]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="task-request-convert-due-date">마감일</FieldLabel>
          <DatePicker
            id="task-request-convert-due-date"
            aria-label="마감일"
            appearance="detail"
            value={conversion.dueDate}
            onChange={(value) => conversion.setDueDate(value ?? '')}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="task-request-convert-assignee">담당자</FieldLabel>
        <Select
          value={conversion.responsibilityMode}
          onValueChange={(value) =>
            conversion.setResponsibilityMode(value as typeof conversion.responsibilityMode)
          }
        >
          <SelectTrigger id="task-request-convert-assignee" aria-label="담당자">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(RESPONSIBILITY_COPY.modes).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {conversion.responsibilityMode === 'actor' && (
          <Select
            value={conversion.assigneeId || NO_SELECTION}
            onValueChange={(value) => conversion.setAssigneeId(value === NO_SELECTION ? '' : value)}
          >
            <SelectTrigger aria-label={RESPONSIBILITY_COPY.actor}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>{RESPONSIBILITY_COPY.selectActor}</SelectItem>
              {eligibleActors.map((actor) => (
                <SelectItem key={actor.id} value={actor.id}>
                  {actor.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {conversion.responsibilityMode === 'team' && (
          <Select
            value={conversion.teamId || NO_SELECTION}
            onValueChange={(value) => conversion.setTeamId(value === NO_SELECTION ? '' : value)}
          >
            <SelectTrigger aria-label={RESPONSIBILITY_COPY.selectTeam}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_SELECTION}>{RESPONSIBILITY_COPY.selectTeam}</SelectItem>
              {candidateTeamIds.length > 0 && (
                <CandidateTeamOptions ids={candidateTeamIds} names={names} />
              )}
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="task-request-convert-analytics-area">Analytics Area</FieldLabel>
        <Select
          value={analyticsAreaValue}
          onValueChange={(value) =>
            conversion.setAnalyticsAreaId(value === NO_SELECTION ? '' : value)
          }
        >
          <SelectTrigger
            id="task-request-convert-analytics-area"
            aria-label="Analytics Area"
            {...(analyticsAreaHint === null ? {} : { 'aria-describedby': ANALYTICS_AREA_HINT_ID })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SELECTION}>없음</SelectItem>
            {conversion.analyticsAreaSelection.kind === 'unresolved' && (
              <SelectItem value={UNRESOLVED_ANALYTICS_AREA} disabled>
                Analytics Area 선택 필요
              </SelectItem>
            )}
            {conversion.analyticsAreas?.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {analyticsAreaHint !== null && (
          <p id={ANALYTICS_AREA_HINT_ID} className="text-xs text-text-muted" aria-live="polite">
            {analyticsAreaHint}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor="task-request-convert-milestone">Milestone</FieldLabel>
        <Select
          value={conversion.milestoneId || NO_SELECTION}
          onValueChange={(value) => conversion.setMilestoneId(value === NO_SELECTION ? '' : value)}
        >
          <SelectTrigger
            id="task-request-convert-milestone"
            aria-label="Milestone"
            value={conversion.milestoneId}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_SELECTION}>없음</SelectItem>
            {conversion.milestones?.map((milestone) => (
              <SelectItem key={milestone.id} value={milestone.id}>
                {milestone.title}
              </SelectItem>
            ))}
            {/* R2 + R4 (midreview/Astra) — keep the unavailable value identity-free and allow None. */}
            {(conversion.milestonePickerError !== null ||
              conversion.milestoneSelectionUnavailable) &&
              conversion.milestoneId !== '' && (
                <SelectItem value={conversion.milestoneId} disabled>
                  확인할 수 없음
                </SelectItem>
              )}
          </SelectContent>
        </Select>
        {/* A settled picker error wins over retained options, while the held value remains hidden. */}
        {conversion.milestonePickerError !== null && (
          <span
            className={
              conversion.milestonePickerError.denied
                ? 'text-xs text-accent-danger'
                : 'text-xs text-text-muted'
            }
          >
            {conversion.milestonePickerError.denied
              ? conversion.milestonePickerError.message
              : 'Milestone 목록을 불러올 수 없습니다.'}
          </span>
        )}
      </div>
      <Button
        type="submit"
        variant="primary"
        size="sm"
        loading={conversion.isPending}
        disabled={!conversion.canSubmit}
        data-testid="task-request-convert-submit"
      >
        Task로 전환
      </Button>
    </form>
  );
}
