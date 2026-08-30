import { useFindingDetail } from '@/features/integration/hooks/useFindingDetail';
import type { TaskPriority, TaskRequestDto } from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  FieldRow,
  ManagedSystemPill,
  ObjectRow,
  OutlineBadge,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  UserChip,
} from '@fops/ui';
import { Check, FileSearch, Link2, XCircle } from 'lucide-react';
import * as React from 'react';

import { TaskRequestDecisionDialog } from './TaskRequestDecisionDialog';
import {
  type NameMaps,
  STATUS_LABELS,
  STATUS_SEVERITY,
  TaskRequestBadge,
  dot,
  shortId,
} from './TaskRequestRow';
import { formatDate } from './predicates';
import { TASK_PRIORITIES, useTaskRequestConversion } from './useTaskRequestConversion';
import { useTaskRequestDecision } from './useTaskRequestDecision';
import { useTaskRequestLink } from './useTaskRequestLink';

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
  const sourceFindingQuery = useFindingDetail(
    item.source_type === 'finding' ? item.source_id : null,
  );

  const sections: PanelSection[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'decision', label: 'Decision' },
    item.source_type === 'finding' ? { id: 'source', label: 'Source' } : null,
    { id: 'properties', label: 'Properties' },
    { id: 'audit', label: 'Audit' },
  ].filter((section): section is PanelSection => section !== null);

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
                    {requester?.display_name ?? 'Unknown'}
                  </strong>
                </span>
                <span className="text-xs text-text-muted">· {formatDate(item.created_at)}</span>
              </>
            }
          />
        </div>

        <section data-anchor="decision" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Review decision</PanelSectionTitle>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="primary"
              className="w-full"
              loading={decision.isPending}
              disabled={!decision.canApprove}
              onClick={decision.approve}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!link.canLinkExisting}
                onClick={() => {
                  link.setOpen((open) => !open);
                  conversion.setOpen(false);
                }}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Link existing
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={decision.isPending}
                disabled={!decision.canRequestEvidence}
                onClick={decision.requestEvidence}
              >
                <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                Need evidence
              </Button>
            </div>
            {link.open && (
              <div className="max-h-52 overflow-y-auto rounded border border-border-subtle bg-surface-card">
                {link.isTasksLoading && (
                  <div className="p-3 text-xs text-text-muted">Loading Tasks...</div>
                )}
                {link.inScopeTasks?.map((task) => (
                  <ObjectRow
                    key={task.id}
                    id={task.display_id}
                    title={task.title}
                    density="compact"
                    severity="low"
                    onClick={() => link.link(task.id)}
                    badges={<OutlineBadge>{task.status}</OutlineBadge>}
                    meta={
                      <>
                        <span>{task.priority}</span>
                        {dot()}
                        <span>
                          {task.assignee_actor_id
                            ? (names.actorsById[task.assignee_actor_id]?.display_name ?? 'Assigned')
                            : 'Unassigned'}
                        </span>
                      </>
                    }
                  />
                ))}
                {link.inScopeTasks?.length === 0 && (
                  <div className="p-3 text-xs text-text-muted">No in-scope Tasks.</div>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!conversion.canConvert}
              onClick={() => {
                conversion.setOpen((open) => !open);
                link.setOpen(false);
              }}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Convert to Task
            </Button>
            {conversion.open && (
              <form
                className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3"
                onSubmit={conversion.submit}
              >
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Title
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
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    Priority
                    <select
                      className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                      value={conversion.priority}
                      onChange={(event) =>
                        conversion.setPriority(event.target.value as TaskPriority)
                      }
                    >
                      {TASK_PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    Due date
                    <input
                      type="date"
                      className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                      value={conversion.dueDate}
                      onChange={(event) => conversion.setDueDate(event.target.value)}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Assignee
                  <select
                    className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                    value={conversion.assigneeId}
                    onChange={(event) => conversion.setAssigneeId(event.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {Object.values(names.actorsById).map((actor) => (
                      <option key={actor.id} value={actor.id}>
                        {actor.display_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Analytics Area
                  <select
                    className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                    value={conversion.analyticsAreaId}
                    onChange={(event) => conversion.setAnalyticsAreaId(event.target.value)}
                  >
                    <option value="">None</option>
                    {conversion.analyticsAreas?.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Milestone
                  <input type="hidden" value={conversion.milestoneId} readOnly />
                  <span className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-muted">
                    Later slice
                  </span>
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={conversion.isPending}
                  disabled={!conversion.canConvert}
                  data-testid="task-request-convert-submit"
                >
                  Convert to Task
                </Button>
              </form>
            )}
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="w-full"
              loading={decision.isPending}
              disabled={!decision.canReject}
              onClick={decision.reject}
            >
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </Button>
          </div>
        </section>

        {item.source_type === 'finding' && (
          <section data-anchor="source" className="border-t border-border-subtle px-4 py-4">
            <PanelSectionTitle>Source finding</PanelSectionTitle>
            <div className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-muted">FROM</span>
                <OutlineBadge>Finding</OutlineBadge>
              </div>
              <div className="flex flex-col gap-1">
                <div className="text-sm font-medium text-text-primary">
                  {sourceFindingQuery.data?.title ?? 'Source finding'}
                </div>
                <div className="flex items-center gap-2">
                  <OutlineBadge>{sourceFindingQuery.data?.status ?? 'finding'}</OutlineBadge>
                  <span className="font-mono text-xs text-text-muted">
                    {sourceFindingQuery.data?.display_id ?? shortId(item.source_id)}
                  </span>
                </div>
              </div>
              <p className="text-sm leading-6 text-text-muted">{item.evidence_summary}</p>
            </div>
          </section>
        )}

        <section data-anchor="properties" className="border-t border-border-subtle px-4 py-4">
          <PanelSectionTitle>Properties</PanelSectionTitle>
          <FieldRow label="Managed System">
            <ManagedSystemPill
              name={
                names.managedSystemsById[item.primary_managed_system_id]?.name ??
                shortId(item.primary_managed_system_id)
              }
            />
          </FieldRow>
          <FieldRow label="Impact">
            <OutlineBadge>{STATUS_SEVERITY[item.status]}</OutlineBadge>
          </FieldRow>
          <FieldRow label="Reviewer">
            {reviewer ? (
              <UserChip
                user={{ display_name: reviewer.display_name }}
                {...(reviewer.email !== undefined ? { sub: reviewer.email } : {})}
              />
            ) : (
              <span className="text-xs text-text-muted">No reviewer</span>
            )}
          </FieldRow>
          <FieldRow label="Self-approval">
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
                {requester?.display_name ?? 'Unknown'}
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
                {STATUS_LABELS[item.status]}
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
