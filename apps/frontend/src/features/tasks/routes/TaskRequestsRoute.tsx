import { useFindingDetail } from '@/features/integration/hooks/useFindingDetail';
import {
  approveTaskRequest,
  convertTaskRequest,
  fetchMe,
  fetchPermissionCheck,
  fetchTaskRequests,
  linkExistingTask,
  listTasks,
  rejectTaskRequest,
  requestMoreEvidenceForTaskRequest,
  resolveActors,
} from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { ApiError } from '@/lib/api/types';
import {
  type TaskDto,
  type TaskPriority,
  type TaskRequestDto,
  type TaskRequestStatus,
  convertTaskRequestRequestSchema,
} from '@fops/shared';
import {
  Button,
  DetailPanelHeader,
  DetailPanelHeaderActions,
  DetailPanelSectionNav,
  FieldRow,
  ListShell,
  ListToolbar,
  type ListToolbarTab,
  ManagedSystemPill,
  ObjectRow,
  type ObjectRowSeverity,
  OutlineBadge,
  type PanelSection,
  PanelSectionTitle,
  PanelTitleBlock,
  PermissionBlockedPanel,
  UserChip,
} from '@fops/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileSearch, Link2, XCircle } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';

type TaskRequestTab = TaskRequestStatus | 'all';

const TAB_ORDER: Array<{ value: TaskRequestTab; label: string }> = [
  { value: 'pending_review', label: 'Pending' },
  { value: 'needs_more_evidence', label: 'Needs evidence' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

const STATUS_LABELS: Record<TaskRequestStatus, string> = {
  pending_review: 'Pending',
  needs_more_evidence: 'Needs evidence',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted',
};

const STATUS_CLASS: Record<TaskRequestStatus, string> = {
  pending_review: 'border-accent-warn/30 bg-accent-warn/10 text-accent-warn',
  needs_more_evidence: 'border-accent-info/30 bg-accent-info/10 text-accent-info',
  approved: 'border-accent-success/30 bg-accent-success/10 text-accent-success',
  rejected: 'border-accent-danger/30 bg-accent-danger/10 text-accent-danger',
  converted: 'border-border-subtle bg-surface-raised text-text-muted',
};

const STATUS_SEVERITY: Record<TaskRequestStatus, ObjectRowSeverity> = {
  pending_review: 'high',
  needs_more_evidence: 'medium',
  approved: 'low',
  rejected: 'critical',
  converted: 'low',
};

const REVIEW_DECISION_STATUSES = ['pending_review', 'needs_more_evidence'] as const;
const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];
const TASK_TITLE_TRUNCATION_MARKER = '…';
// The module-level null check narrows the statement that follows it, but not the
// function bodies below — they could run after any later reassignment as far as
// TS is concerned. Re-binding to a `number` const carries the narrowing into them.
const canonicalTitleMaxLength = convertTaskRequestRequestSchema.shape.title.maxLength;

if (canonicalTitleMaxLength === null) {
  throw new Error('Task conversion title requires a canonical maximum length.');
}

const TASK_TITLE_MAX_LENGTH: number = canonicalTitleMaxLength;

function defaultConvertTitle(requestedOutcome: string): string {
  if (requestedOutcome.length <= TASK_TITLE_MAX_LENGTH) return requestedOutcome;
  return `${requestedOutcome.slice(
    0,
    TASK_TITLE_MAX_LENGTH - TASK_TITLE_TRUNCATION_MARKER.length,
  )}${TASK_TITLE_TRUNCATION_MARKER}`;
}

export function canApproveTaskRequest(status: TaskRequestStatus): boolean {
  return REVIEW_DECISION_STATUSES.some((allowed) => allowed === status);
}

export function canRejectTaskRequest(status: TaskRequestStatus): boolean {
  return REVIEW_DECISION_STATUSES.some((allowed) => allowed === status);
}

export function canRequestEvidenceForTaskRequest(status: TaskRequestStatus): boolean {
  return status === 'pending_review';
}

export function canConvertTaskRequest(status: TaskRequestStatus): boolean {
  return status === 'approved';
}

export function canLinkExistingTaskRequest(status: TaskRequestStatus): boolean {
  return status === 'approved';
}

function formatDate(raw: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(raw));
}

function TaskRequestBadge({ status }: { status: TaskRequestStatus }) {
  return (
    <span className={`rounded-sm border px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function dot() {
  return <span className="h-1 w-1 rounded-full bg-text-muted/60" aria-hidden="true" />;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}

interface NameMaps {
  actorsById: Record<string, { id: string; display_name: string; email?: string }>;
  managedSystemsById: Record<string, { name: string }>;
}

// `exactOptionalPropertyTypes` is on: an optional property must spell `| undefined`
// explicitly for a value that may actually be undefined to be assignable.
type TaskRequestListItem = TaskRequestDto & {
  source?: (NonNullable<TaskRequestDto['source']> & { display_id?: string | null }) | undefined;
};

interface TaskRequestRowProps {
  item: TaskRequestListItem;
  selected: boolean;
  names: NameMaps;
  onSelect: (id: string) => void;
}

function sourceDisplayId(item: TaskRequestListItem): string {
  return item.source?.display_id?.trim() ? item.source.display_id : shortId(item.source_id);
}

function TaskRequestRow({ item, selected, names, onSelect }: TaskRequestRowProps) {
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;
  const ms = names.managedSystemsById[item.primary_managed_system_id];

  return (
    <ObjectRow
      id={item.display_id}
      title={item.requested_outcome}
      severity={STATUS_SEVERITY[item.status]}
      selected={selected}
      density="default"
      onClick={() => onSelect(item.id)}
      badges={<TaskRequestBadge status={item.status} />}
      meta={
        <>
          {item.source_type === 'finding' && (
            <span className="font-mono text-accent-info">↔ {sourceDisplayId(item)}</span>
          )}
          {dot()}
          <span>Evidence 1</span>
          {dot()}
          <span>{ms?.name ?? shortId(item.primary_managed_system_id)}</span>
          {dot()}
          <span>{formatDate(item.created_at)}</span>
        </>
      }
      trailing={
        <>
          <span className="text-xs text-text-muted">by {requester?.display_name ?? 'Unknown'}</span>
          {reviewer ? (
            <span className="rounded border border-border-subtle px-2 py-1 text-xs text-text-muted">
              {reviewer.display_name}
            </span>
          ) : (
            <span className="rounded border border-accent-danger/30 px-2 py-1 text-xs text-accent-danger">
              No reviewer
            </span>
          )}
        </>
      }
    />
  );
}

interface TaskRequestPanelProps {
  item: TaskRequestDto;
  names: NameMaps;
  currentActorId: string | null;
  currentRole: string | null;
  onClose: () => void;
}

function TaskRequestPanel({
  item,
  names,
  currentActorId,
  currentRole,
  onClose,
}: TaskRequestPanelProps) {
  const queryClient = useQueryClient();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const requester = names.actorsById[item.requester_actor_id];
  const reviewer = item.reviewer_actor_id ? names.actorsById[item.reviewer_actor_id] : undefined;
  const isSelfApproval = currentActorId === item.requester_actor_id;
  const [convertOpen, setConvertOpen] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [convertTitle, setConvertTitle] = React.useState(() =>
    defaultConvertTitle(item.requested_outcome),
  );
  const [convertTitleError, setConvertTitleError] = React.useState<string | null>(null);
  const convertTitleInputRef = React.useRef<HTMLInputElement>(null);
  const [convertPriority, setConvertPriority] = React.useState<TaskPriority>('medium');
  const [convertAssigneeId, setConvertAssigneeId] = React.useState('');
  const [convertDueDate, setConvertDueDate] = React.useState('');
  const [convertMilestoneId, setConvertMilestoneId] = React.useState('');
  const [convertAnalyticsAreaId, setConvertAnalyticsAreaId] = React.useState('');

  React.useEffect(() => {
    setConvertTitle(defaultConvertTitle(item.requested_outcome));
    setConvertTitleError(null);
    setConvertPriority('medium');
    setConvertAssigneeId('');
    setConvertDueDate('');
    setConvertMilestoneId('');
    setConvertAnalyticsAreaId('');
    setConvertOpen(false);
    setLinkOpen(false);
  }, [item]);

  const selfApprovalCheck = useQuery({
    queryKey: ['permission-check', 'task_request.self_approve', item.primary_managed_system_id],
    queryFn: ({ signal }) =>
      fetchPermissionCheck('task_request.self_approve', {
        managedSystemId: item.primary_managed_system_id,
        signal,
      }),
    enabled: isSelfApproval && currentRole !== 'admin',
    staleTime: 60 * 1000,
  });
  const manageCheck = useQuery({
    queryKey: ['permission-check', 'finding.manage', item.primary_managed_system_id],
    queryFn: ({ signal }) =>
      fetchPermissionCheck('finding.manage', {
        managedSystemId: item.primary_managed_system_id,
        signal,
      }),
    enabled: currentRole !== 'admin',
    staleTime: 60 * 1000,
  });
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'backlog-picker'] as const,
    queryFn: ({ signal }) => listTasks({ signal }),
    enabled: linkOpen,
    staleTime: 30 * 1000,
  });
  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', item.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: item.primary_managed_system_id,
        includeArchived: false,
        signal,
      }),
    enabled: convertOpen,
    staleTime: 10 * 60 * 1000,
  });
  const sourceFindingQuery = useFindingDetail(
    item.source_type === 'finding' ? item.source_id : null,
  );
  const canSelfApprove = currentRole === 'admin' || selfApprovalCheck.data?.state === 'approved';
  const canManage = currentRole === 'admin' || manageCheck.data?.state === 'approved';
  const canApprove = canApproveTaskRequest(item.status);
  const canReject = canRejectTaskRequest(item.status);
  const canRequestEvidence = canRequestEvidenceForTaskRequest(item.status);
  const canConvert = canConvertTaskRequest(item.status) && canManage;
  const canLinkExisting = canLinkExistingTaskRequest(item.status) && canManage;

  const decisionMutation = useMutation<
    TaskRequestDto,
    ApiError,
    { action: string; reason?: string; note?: string }
  >({
    mutationFn: async (vars) => {
      const key = crypto.randomUUID();
      if (vars.action === 'approve') {
        return approveTaskRequest(item.id, vars.reason ? { reason: vars.reason } : {}, key);
      }
      if (vars.action === 'reject') {
        return rejectTaskRequest(item.id, { reason: vars.reason ?? '' }, key);
      }
      return requestMoreEvidenceForTaskRequest(item.id, { note: vars.note ?? '' }, key);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      toast('Task Request updated.');
    },
    onError: (err) => {
      toast.error(err.envelope.message);
    },
  });

  const convertMutation = useMutation<TaskDto, Error, void>({
    mutationFn: async () => {
      const title = convertTitle.trim();
      return convertTaskRequest(
        item.id,
        {
          title,
          priority: convertPriority,
          assignee_actor_id: convertAssigneeId.trim() || null,
          due_date: convertDueDate.trim() || null,
          milestone_id: null,
          analytics_area_id: convertAnalyticsAreaId.trim() || null,
        },
        crypto.randomUUID(),
      );
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast(`Converted to Task ${task.display_id}.`);
      setConvertOpen(false);
    },
    onError: (err) => {
      toast.error(err.message);
    },
  });

  const linkMutation = useMutation<TaskDto, ApiError, string>({
    mutationFn: async (taskId) => {
      return linkExistingTask(item.id, { task_id: taskId }, crypto.randomUUID());
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast(`Linked Task ${task.display_id}.`);
      setLinkOpen(false);
    },
    onError: (err) => {
      toast.error(err.envelope.message);
    },
  });

  function approve(): void {
    const reason = window.prompt(isSelfApproval ? 'Self-approval reason' : 'Approval reason');
    if (reason === null) return;
    if (isSelfApproval && reason.trim().length === 0) {
      toast.error('Self-approval requires a reason.');
      return;
    }
    if (isSelfApproval && !canSelfApprove) {
      toast.error('Self-approval requires scoped capability.');
      return;
    }
    const trimmed = reason.trim();
    decisionMutation.mutate(
      trimmed.length > 0 ? { action: 'approve', reason: trimmed } : { action: 'approve' },
    );
  }

  function requestEvidence(): void {
    const note = window.prompt('Evidence note');
    if (note === null) return;
    if (note.trim().length === 0) {
      toast.error('Note is required.');
      return;
    }
    decisionMutation.mutate({ action: 'request-more-evidence', note: note.trim() });
  }

  function reject(): void {
    const reason = window.prompt('Reject reason');
    if (reason === null) return;
    if (reason.trim().length === 0) {
      toast.error('Reason is required.');
      return;
    }
    decisionMutation.mutate({ action: 'reject', reason: reason.trim() });
  }

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
              loading={decisionMutation.isPending}
              disabled={!canApprove}
              onClick={approve}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!canLinkExisting}
                onClick={() => {
                  setLinkOpen((open) => !open);
                  setConvertOpen(false);
                }}
              >
                <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                Link existing
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={decisionMutation.isPending}
                disabled={!canRequestEvidence}
                onClick={requestEvidence}
              >
                <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
                Need evidence
              </Button>
            </div>
            {linkOpen && (
              <div className="max-h-52 overflow-y-auto rounded border border-border-subtle bg-surface-card">
                {tasksQuery.isLoading && (
                  <div className="p-3 text-xs text-text-muted">Loading Tasks...</div>
                )}
                {tasksQuery.data?.items
                  .filter(
                    (task) => task.primary_managed_system_id === item.primary_managed_system_id,
                  )
                  .map((task) => (
                    <ObjectRow
                      key={task.id}
                      id={task.display_id}
                      title={task.title}
                      density="compact"
                      severity="low"
                      onClick={() => {
                        if (!linkMutation.isPending) linkMutation.mutate(task.id);
                      }}
                      badges={<OutlineBadge>{task.status}</OutlineBadge>}
                      meta={
                        <>
                          <span>{task.priority}</span>
                          {dot()}
                          <span>
                            {task.assignee_actor_id
                              ? (names.actorsById[task.assignee_actor_id]?.display_name ??
                                'Assigned')
                              : 'Unassigned'}
                          </span>
                        </>
                      }
                    />
                  ))}
                {tasksQuery.data?.items.filter(
                  (task) => task.primary_managed_system_id === item.primary_managed_system_id,
                ).length === 0 && (
                  <div className="p-3 text-xs text-text-muted">No in-scope Tasks.</div>
                )}
              </div>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canConvert}
              onClick={() => {
                setConvertOpen((open) => !open);
                setLinkOpen(false);
              }}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Convert to Task
            </Button>
            {convertOpen && (
              <form
                className="flex flex-col gap-2 rounded border border-border-subtle bg-surface-card p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const titleResult =
                    convertTaskRequestRequestSchema.shape.title.safeParse(convertTitle);
                  if (!titleResult.success) {
                    setConvertTitleError(
                      titleResult.error.issues[0]?.message ?? 'Title is invalid.',
                    );
                    convertTitleInputRef.current?.focus();
                    return;
                  }
                  setConvertTitleError(null);
                  convertMutation.mutate();
                }}
              >
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Title
                  <input
                    ref={convertTitleInputRef}
                    className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                    value={convertTitle}
                    aria-invalid={convertTitleError !== null}
                    aria-describedby={
                      convertTitleError
                        ? 'task-request-convert-title-count task-request-convert-title-error'
                        : 'task-request-convert-title-count'
                    }
                    data-testid="task-request-convert-title-input"
                    onChange={(event) => {
                      setConvertTitle(event.target.value);
                      setConvertTitleError(null);
                    }}
                  />
                  <span
                    id="task-request-convert-title-count"
                    data-testid="task-request-convert-title-count"
                  >
                    {convertTitle.length}/{TASK_TITLE_MAX_LENGTH}
                  </span>
                  {convertTitleError && (
                    <span
                      id="task-request-convert-title-error"
                      role="alert"
                      className="text-xs text-accent-danger"
                      data-testid="task-request-convert-title-error"
                    >
                      {convertTitleError}
                    </span>
                  )}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex flex-col gap-1 text-xs text-text-muted">
                    Priority
                    <select
                      className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                      value={convertPriority}
                      onChange={(event) => setConvertPriority(event.target.value as TaskPriority)}
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
                      value={convertDueDate}
                      onChange={(event) => setConvertDueDate(event.target.value)}
                    />
                  </label>
                </div>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Assignee
                  <select
                    className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-primary"
                    value={convertAssigneeId}
                    onChange={(event) => setConvertAssigneeId(event.target.value)}
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
                    value={convertAnalyticsAreaId}
                    onChange={(event) => setConvertAnalyticsAreaId(event.target.value)}
                  >
                    <option value="">None</option>
                    {analyticsAreasQuery.data?.items.map((area) => (
                      <option key={area.id} value={area.id}>
                        {area.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-text-muted">
                  Milestone
                  <input type="hidden" value={convertMilestoneId} readOnly />
                  <span className="rounded border border-border-subtle bg-surface-detail px-2 py-1.5 text-sm text-text-muted">
                    Later slice
                  </span>
                </label>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  loading={convertMutation.isPending}
                  disabled={!canConvert}
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
              loading={decisionMutation.isPending}
              disabled={!canReject}
              onClick={reject}
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
    </aside>
  );
}

export function TaskRequestsRoute({ selectedParam }: { selectedParam?: string | undefined }) {
  const [activeTab, setActiveTab] = React.useState<TaskRequestTab>('pending_review');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const taskRequestsQuery = useQuery({
    queryKey: ['task-requests'] as const,
    queryFn: ({ signal }) => fetchTaskRequests({ signal }),
  });
  const meQuery = useQuery({
    queryKey: ['me'] as const,
    queryFn: ({ signal }) => fetchMe(signal),
    staleTime: 60 * 1000,
  });
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });

  const items = taskRequestsQuery.data?.items ?? [];
  const actorIds = React.useMemo(
    () => [
      ...new Set(
        items.flatMap((item) =>
          [item.requester_actor_id, item.reviewer_actor_id].filter(
            (id): id is string => id !== null,
          ),
        ),
      ),
    ],
    [items],
  );
  const actorsQuery = useQuery({
    queryKey: ['actors-resolve', actorIds, []] as const,
    queryFn: ({ signal }) => resolveActors({ actorIds }, signal),
    enabled: actorIds.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  const names = React.useMemo<NameMaps>(() => {
    const actorsById: NameMaps['actorsById'] = {};
    for (const actor of actorsQuery.data?.actors ?? []) {
      actorsById[actor.id] = actor;
    }
    const managedSystemsById: NameMaps['managedSystemsById'] = {};
    for (const ms of managedSystemsQuery.data?.items ?? []) {
      managedSystemsById[ms.id] = { name: ms.name };
    }
    return { actorsById, managedSystemsById };
  }, [actorsQuery.data?.actors, managedSystemsQuery.data?.items]);

  const tabs = React.useMemo<ListToolbarTab[]>(
    () =>
      TAB_ORDER.map((tab) => ({
        value: tab.value,
        label: tab.label,
        badgeCount:
          tab.value === 'all'
            ? items.length
            : items.filter((item) => item.status === tab.value).length,
        urgent: tab.value === 'pending_review',
      })),
    [items],
  );

  const shown = React.useMemo(() => {
    return activeTab === 'all' ? items : items.filter((item) => item.status === activeTab);
  }, [activeTab, items]);

  React.useEffect(() => {
    if (selectedId === null && shown[0]) setSelectedId(shown[0].id);
  }, [selectedId, shown]);

  React.useEffect(() => {
    if (selectedParam !== undefined) setSelectedId(selectedParam);
  }, [selectedParam]);

  const selected = selectedId
    ? (items.find((item) => item.id === selectedId) ?? shown[0] ?? null)
    : null;

  if (taskRequestsQuery.isLoading) {
    return <div className="p-4 text-sm text-text-muted">Loading Task Requests…</div>;
  }

  if (isPermissionDenied(taskRequestsQuery.error)) {
    return (
      <PermissionBlockedPanel
        state="denied"
        category="Task Request queue"
        reason={taskRequestsQuery.error.message}
        className="m-4"
      />
    );
  }
  if (taskRequestsQuery.error) {
    return <div className="p-4 text-sm text-accent-danger">Task Request queue unavailable.</div>;
  }

  return (
    <ListShell
      list={
        <>
          <ListToolbar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(next) => setActiveTab(next as TaskRequestTab)}
          />
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shown.map((item) => (
              <TaskRequestRow
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                names={names}
                onSelect={setSelectedId}
              />
            ))}
            {shown.length === 0 && (
              <div className="px-5 py-8 text-sm text-text-muted">No Task Requests.</div>
            )}
          </div>
        </>
      }
      detailPanel={
        selected ? (
          <TaskRequestPanel
            item={selected}
            names={names}
            currentActorId={meQuery.data?.actor.id ?? null}
            currentRole={meQuery.data?.actor.role_level ?? null}
            onClose={() => setSelectedId(null)}
          />
        ) : null
      }
    />
  );
}

function isPermissionDenied(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === 'permission.denied' || error.code === 'permission.scope_required')
  );
}
