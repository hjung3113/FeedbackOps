import { useFindingDetail } from '@/features/findings/hooks/useFindingDetail';
import {
  FINDING_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_REQUEST_STATUS_LABELS,
} from '@/lib/copy/enum-labels';
import { shortId } from '@/lib/identity';
import type { TaskDto, TaskPriority, TaskRequestDto } from '@fops/shared';
import {
  Button,
  DatePicker,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  FieldRow,
  InternalTaskBadge,
  ManagedSystemPill,
  ObjectRow,
  OutlineBadge,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  UserChip,
} from '@fops/ui';
import { Link } from '@tanstack/react-router';
import { Check, FileSearch, Link2, XCircle } from 'lucide-react';
import * as React from 'react';

import { TaskRequestDecisionDialog } from './TaskRequestDecisionDialog';
import { type NameMaps, TaskRequestBadge, dot } from './TaskRequestRow';
import { formatDate } from './predicates';
import { TASK_PRIORITIES, useTaskRequestConversion } from './useTaskRequestConversion';
import { useTaskRequestConvertedTaskLink } from './useTaskRequestConvertedTaskLink';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import { useTaskRequestLink } from './useTaskRequestLink';

const NO_SELECTION = '__none__';

interface TaskRequestPanelProps {
  item: TaskRequestDto;
  names: NameMaps;
  currentActorId: string | null;
  currentRole: string | null;
  onClose: () => void;
}

export function TaskRequestPanel({
  item,
  names,
  currentActorId,
  currentRole,
  onClose,
}: TaskRequestPanelProps) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;

  const decision = useTaskRequestDecision({ item, currentActorId, currentRole });
  const conversion = useTaskRequestConversion({ item, currentRole });
  const link = useTaskRequestLink({ item, currentRole });
  const resultingTask: TaskDto | null =
    conversion.result?.source_task_request_id === item.id
      ? conversion.result
      : link.resultTaskRequestId === item.id
        ? link.result
        : null;
  const convertedTaskLink = useTaskRequestConvertedTaskLink(item.id, item.status === 'converted');
  // The mutation result is only the immediate value; once the canonical read has
  // answered (null included), a later refetch error must not bring it back.
  const taskForOutcome =
    convertedTaskLink.data !== undefined ? convertedTaskLink.data : resultingTask;
  const showDecisionSummary = item.status === 'converted' || item.status === 'rejected';
  const sourceFindingQuery = useFindingDetail(
    item.source_type === 'finding' ? item.source_id : null,
  );

  const sections: PanelSection[] = [
    { id: 'overview', label: 'Overview' },
    showDecisionSummary
      ? { id: 'outcome', label: '결정 요약' }
      : { id: 'decision', label: 'Decision' },
    item.source_type === 'finding' ? { id: 'source', label: 'Source' } : null,
    { id: 'properties', label: 'Properties' },
    { id: 'audit', label: 'Audit' },
  ].filter((section): section is PanelSection => section !== null);

  // Task Request has no impact field; omit the prototype's status-derived row (#585).
  return (
    <aside className="flex h-full flex-col bg-surface-detail">
      <DetailPanelHeader
        kind="task"
        id={item.display_id}
        onClose={onClose}
        extras={
          <DetailPanelHeaderActions
            entityKind="task"
            entityId={item.id}
            copyUrl={`/tasks?view=requests&param=${item.id}`}
          />
        }
      />
      <DetailPanelSectionNav sections={sections} scrollRef={scrollRef} />
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-anchor="overview">
          <PanelTitleBlock
            title={item.requested_outcome}
            badges={
              <>
                <TaskRequestBadge status={item.status} />
                <span className="text-xs text-text-muted">
                  · Requested by{' '}
                  <strong className="text-text-secondary">
                    {requester?.display_name ?? '알 수 없는 사용자'}
                  </strong>
                </span>
                <span className="text-xs text-text-muted">· {formatDate(item.created_at)}</span>
              </>
            }
          />
        </div>

        {showDecisionSummary ? (
          <section data-anchor="outcome" className="border-t border-border-subtle px-4 py-4">
            <PanelSectionTitle>결정 요약</PanelSectionTitle>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <TaskRequestBadge status={item.status} />
                <span className="text-xs text-text-muted">
                  검토자{' '}
                  <strong className="text-text-secondary">
                    {reviewer?.display_name ?? '알 수 없는 사용자'}
                  </strong>
                  {item.decided_at && <> · {formatDate(item.decided_at)}</>}
                </span>
              </div>
              {item.decision_reason && (
                <div className="rounded border border-border-subtle bg-surface-card px-3 py-2">
                  <span className="text-xs text-text-muted">사유</span>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-text-primary">
                    {item.decision_reason}
                  </p>
                </div>
              )}
              {item.status === 'converted' && taskForOutcome && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-text-muted">연결된 Task</span>
                  <Link
                    to="/tasks"
                    search={{ view: 'backlog', param: taskForOutcome.id }}
                    className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
                  >
                    <span>{taskForOutcome.title}</span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
                      {taskForOutcome.display_id}
                    </span>
                  </Link>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section data-anchor="decision" className="border-t border-border-subtle px-4 py-4">
            <PanelSectionTitle>검토 결정</PanelSectionTitle>
            <div className="flex flex-col gap-2">
              {resultingTask && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-text-muted">연결된 Task</span>
                  <Link
                    to="/tasks"
                    search={{ view: 'backlog', param: resultingTask.id }}
                    className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
                  >
                    <span>{resultingTask.title}</span>
                    <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
                      {resultingTask.display_id}
                    </span>
                  </Link>
                </div>
              )}
              {!resultingTask && (decision.canApprove || conversion.canConvert) && (
                <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                  <legend className="sr-only">주요 결정</legend>
                  {decision.canApprove && (
                    <Button
                      type="button"
                      variant="primary"
                      className="w-full"
                      loading={decision.isPending}
                      onClick={decision.approve}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      승인
                    </Button>
                  )}
                  {conversion.canConvert && (
                    <Button
                      type="button"
                      variant={conversion.open ? 'secondary' : 'primary'}
                      size={conversion.open ? 'sm' : 'md'}
                      className="w-full"
                      onClick={() => {
                        conversion.setOpen((open) => !open);
                        link.setOpen(false);
                      }}
                    >
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      Task로 전환
                    </Button>
                  )}
                </fieldset>
              )}
              {!resultingTask &&
                (link.canLinkExisting || decision.canRequestEvidence || decision.canReject) && (
                  <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
                    <legend className="sr-only">보조 결정</legend>
                    {(link.canLinkExisting || decision.canRequestEvidence) && (
                      <div
                        className={
                          link.canLinkExisting && decision.canRequestEvidence
                            ? 'grid grid-cols-2 gap-2'
                            : 'flex flex-col gap-2'
                        }
                      >
                        {link.canLinkExisting && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              link.setOpen((open) => !open);
                              conversion.setOpen(false);
                            }}
                          >
                            <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                            기존 Task 연결
                          </Button>
                        )}
                        {decision.canRequestEvidence && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="w-full"
                            loading={decision.isPending}
                            onClick={decision.requestEvidence}
                          >
                            <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                            근거 추가 요청
                          </Button>
                        )}
                      </div>
                    )}
                    {decision.canReject && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full border-accent-danger text-accent-danger hover:bg-accent-danger/10"
                        loading={decision.isPending}
                        onClick={decision.reject}
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        반려
                      </Button>
                    )}
                  </fieldset>
                )}
              {!resultingTask && link.open && (
                <div className="max-h-52 overflow-y-auto rounded border border-border-subtle bg-surface-card">
                  {link.isTasksLoading && (
                    <div className="p-3 text-xs text-text-muted">Task 불러오는 중...</div>
                  )}
                  {link.inScopeTasks?.map((task) => (
                    <ObjectRow
                      key={task.id}
                      id={task.display_id}
                      title={task.title}
                      density="compact"
                      severity="low"
                      onClick={() => link.link(task.id)}
                      badges={<InternalTaskBadge status={task.status} />}
                      meta={
                        <>
                          <span>{TASK_PRIORITY_LABELS[task.priority]}</span>
                          {dot()}
                          <span>
                            {task.assignee_actor_id
                              ? (names.actorsById[task.assignee_actor_id]?.display_name ??
                                '담당자 지정됨')
                              : '미배정'}
                          </span>
                        </>
                      }
                    />
                  ))}
                  {link.inScopeTasks?.length === 0 && (
                    <div className="p-3 text-xs text-text-muted">범위 내 Task가 없습니다.</div>
                  )}
                </div>
              )}
              {!resultingTask && conversion.open && (
                <form
                  className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3"
                  onSubmit={conversion.submit}
                >
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    제목
                    <input
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
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1 text-xs text-text-muted">
                      <label htmlFor="task-request-convert-priority">우선순위</label>
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
                    <div className="flex flex-col gap-1 text-xs text-text-muted">
                      <label htmlFor="task-request-convert-due-date">마감일</label>
                      <DatePicker
                        id="task-request-convert-due-date"
                        aria-label="마감일"
                        className="bg-surface-detail"
                        value={conversion.dueDate}
                        onChange={(value) => conversion.setDueDate(value ?? '')}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-text-muted">
                    <label htmlFor="task-request-convert-assignee">담당자</label>
                    <Select
                      value={conversion.assigneeId || NO_SELECTION}
                      onValueChange={(value) =>
                        conversion.setAssigneeId(value === NO_SELECTION ? '' : value)
                      }
                    >
                      <SelectTrigger id="task-request-convert-assignee" aria-label="담당자">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SELECTION}>미배정</SelectItem>
                        {Object.values(names.actorsById).map((actor) => (
                          <SelectItem key={actor.id} value={actor.id}>
                            {actor.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-text-muted">
                    <label htmlFor="task-request-convert-analytics-area">Analytics Area</label>
                    <Select
                      value={conversion.analyticsAreaId || NO_SELECTION}
                      onValueChange={(value) =>
                        conversion.setAnalyticsAreaId(value === NO_SELECTION ? '' : value)
                      }
                    >
                      <SelectTrigger
                        id="task-request-convert-analytics-area"
                        aria-label="Analytics Area"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SELECTION}>없음</SelectItem>
                        {conversion.analyticsAreas?.map((area) => (
                          <SelectItem key={area.id} value={area.id}>
                            {area.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1 text-xs text-text-muted">
                    <label htmlFor="task-request-convert-milestone">Milestone</label>
                    <Select
                      value={conversion.milestoneId || NO_SELECTION}
                      onValueChange={(value) =>
                        conversion.setMilestoneId(value === NO_SELECTION ? '' : value)
                      }
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
                        {/* R2 + R4 (midreview/Astra) — while a held selection is
                          unavailable (its list read failed terminally, or a
                          successful refreshed list omitted it), the select must
                          not silently display None: the held id keeps a
                          disabled, identity-free slot so the shown value
                          matches the internal state and choosing None is a
                          real, reachable change. The retained identity is never
                          rendered. */}
                        {(conversion.milestonePickerError !== null ||
                          conversion.milestoneSelectionUnavailable) &&
                          conversion.milestoneId !== '' && (
                            <SelectItem value={conversion.milestoneId} disabled>
                              확인할 수 없음
                            </SelectItem>
                          )}
                      </SelectContent>
                    </Select>
                    {/* R2 (Astra P2-3) — a settled picker read error is shown in
                      place of the retained options: the server's denial reason
                      for a permission failure, the same 'Milestone list
                      unavailable.' copy the Milestone list route uses for a
                      generic outage. */}
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
                    disabled={!conversion.canConvert}
                    data-testid="task-request-convert-submit"
                  >
                    Task로 전환
                  </Button>
                </form>
              )}
            </div>
          </section>
        )}

        {item.source_type === 'finding' && (
          <section data-anchor="source" className="border-t border-border-subtle px-4 py-4">
            <PanelSectionTitle>출처 Finding</PanelSectionTitle>
            <div className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">출처</span>
                <OutlineBadge>Finding</OutlineBadge>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-text-primary">
                  {sourceFindingQuery.data?.title ?? '출처 Finding'}
                </div>
                <div className="flex items-center gap-2">
                  {sourceFindingQuery.data && (
                    <OutlineBadge>
                      {FINDING_STATUS_LABELS[sourceFindingQuery.data.status]}
                    </OutlineBadge>
                  )}
                  <span className="shrink-0 whitespace-nowrap font-mono text-xs text-text-muted">
                    {sourceFindingQuery.data?.display_id ?? 'Finding'}
                  </span>
                  {!sourceFindingQuery.data?.display_id && (
                    <span className="font-mono text-xs text-text-muted">
                      {shortId(item.source_id)}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm leading-6 text-text-muted">{item.evidence_summary}</p>
            </div>
          </section>
        )}

        <section data-anchor="properties" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>속성</PanelSectionTitle>
          <FieldRow label="Managed System">
            <span className="flex flex-col gap-1">
              <ManagedSystemPill
                name={
                  names.managedSystemsById[item.primary_managed_system_id]?.name ?? 'Managed System'
                }
              />
              {!names.managedSystemsById[item.primary_managed_system_id] && (
                <span className="font-mono text-xs text-text-muted">
                  {shortId(item.primary_managed_system_id)}
                </span>
              )}
            </span>
          </FieldRow>
          <FieldRow label="검토자">
            {reviewer ? (
              <UserChip
                user={{ display_name: reviewer.display_name }}
                {...(reviewer.email !== undefined ? { sub: reviewer.email } : {})}
              />
            ) : (
              <span className="text-xs text-text-muted">검토자 없음</span>
            )}
          </FieldRow>
          <FieldRow label="본인 승인">
            <span className="rounded border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
              requires scoped capability
            </span>
          </FieldRow>
        </section>

        <section data-anchor="audit" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Audit</PanelSectionTitle>
          <div className="flex flex-col gap-2 border-l border-border-subtle pl-3">
            <div className="text-xs text-text-muted">
              <strong className="text-text-secondary">
                {requester?.display_name ?? '알 수 없는 사용자'}
              </strong>
              {' · 요청 작성 · '}
              {formatDate(item.created_at)}
            </div>
            {item.decided_at && (
              <div className="text-xs text-text-muted">
                <strong className="text-text-secondary">
                  {reviewer?.display_name ?? 'Reviewer'}
                </strong>
                {' · '}
                {TASK_REQUEST_STATUS_LABELS[item.status]}
                {' · '}
                {formatDate(item.decided_at)}
              </div>
            )}
          </div>
        </section>
      </div>
      <TaskRequestDecisionDialog
        dialog={decision.dialog}
        isSelfApproval={decision.isSelfApproval}
        isSubmitting={decision.isSubmitting}
        onChange={decision.changeValue}
        onClose={decision.close}
        onSubmit={decision.submitDecision}
      />
    </aside>
  );
}
