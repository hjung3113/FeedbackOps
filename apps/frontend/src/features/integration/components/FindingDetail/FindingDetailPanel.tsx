// FindingDetailPanel — state machine for the Finding detail page.
// States: loading skeleton → not-found → permission-blocked → full detail.
// Mirrors VocDetailPanel structure per domain-module-boundaries §Frontend Boundary Rules.

import { usePermissionCheck } from '@/features/admin/permissions/use-permission-check';
import { useVocDetail } from '@/features/voc/hooks/useVocDetail';
import { useWorkspaceActors } from '@/features/voc/hooks/useWorkspaceActors';
import {
  type ApiError,
  errorMapper,
  getTask,
  linkTaskToFinding,
  listTasks,
  useIdempotencyKey,
} from '@/lib/api';
import { fetchAnalyticsAreas } from '@/lib/api/analytics-areas';
import { fetchManagedSystems } from '@/lib/api/managed-systems';
import { useMe } from '@/lib/auth/useMe';
import {
  type AddEvidenceHighlightRequest,
  type CreateTaskRequestFromFindingRequest,
  type EvidenceHighlightDto,
  type EvidenceHighlightImportance,
  type EvidenceHighlightSentiment,
  type EvidenceHighlightSourceType,
  type FindingDto,
  type LinkEvidenceRequest,
  addEvidenceHighlightRequestSchema,
  createTaskRequestFromFindingRequestSchema,
  linkEvidenceRequestSchema,
} from '@fops/shared';
import {
  Button,
  DetailPanelSectionNav,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FieldLabel,
  FieldRow,
  Input,
  ManagedSystemPill,
  OutlineBadge,
  PanelSectionTitle,
  PermissionBlockedPanel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SeverityBadge,
  type SeverityEnum,
  Skeleton,
  Textarea,
  UserChip,
} from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useEvidenceHighlights } from '../../hooks/useEvidenceHighlights';
import {
  useAddEvidenceHighlightMutation,
  useLinkEvidenceMutation,
} from '../../hooks/useEvidenceMutations';
import { useFindingDetail } from '../../hooks/useFindingDetail';
import { useFindingStatusMutation } from '../../hooks/useFindingStatusMutation';
import { useRequestTaskFromFinding } from '../../hooks/useRequestTaskFromFinding';

// ── Props ────────────────────────────────────────────────────────────────────

export interface FindingDetailPanelProps {
  findingId: string;
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function FindingDetailSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-4 p-6" aria-label="Finding 상세 불러오는 중">
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-1/3" />
    </div>
  );
}

// ── Not found ────────────────────────────────────────────────────────────────

function FindingNotFound(): React.ReactElement {
  const navigate = useNavigate();
  return (
    <EmptyState
      title="Finding을 찾을 수 없습니다."
      body="해당 Finding은 삭제되었거나 접근 권한이 없습니다."
      action={
        <Button variant="outline" size="sm" onClick={() => void navigate({ to: '/vocs' })}>
          VOC 목록으로
        </Button>
      }
      className="px-6"
    />
  );
}

// ── Source type label map ────────────────────────────────────────────────────

const SOURCE_TYPE_LABEL: Record<string, string> = {
  voc: 'VOC',
  voc_cluster: 'VOC Cluster',
  survey: 'Survey',
  manual: 'Manual',
};

const EVIDENCE_SOURCE_TYPE_LABEL: Record<EvidenceHighlightSourceType, string> = {
  voc: 'VOC',
  survey_response: 'Survey',
  note: 'Note',
};

const FINDING_STATUS_LABEL: Record<FindingDto['status'], string> = {
  draft: '초안',
  active: '진행 중',
  not_actionable: '조치 불필요',
  converted: 'Task 전환됨',
  archived: '보관됨',
};

const CONFIDENCE_LABEL: Record<NonNullable<FindingDto['confidence']>, string> = {
  low: '낮음',
  medium: '중간',
  high: '높음',
};

const DETAIL_SECTIONS = [
  { id: 'summary', label: '요약' },
  { id: 'metadata', label: '소스/심각도/신뢰도' },
  { id: 'evidence', label: 'Evidence' },
  { id: 'managed-system', label: 'Managed System' },
  { id: 'analytics-area', label: 'Analytics Area' },
  { id: 'links', label: '연결' },
];

function shortId(id: string): string {
  return `${id.slice(0, 8)}…`;
}

function FitBadge({
  children,
  className,
  ...rest
}: React.ComponentProps<typeof OutlineBadge>): React.ReactElement {
  return (
    <OutlineBadge className={`w-fit self-start ${className ?? ''}`} {...rest}>
      {children}
    </OutlineBadge>
  );
}

// ── Section divider ──────────────────────────────────────────────────────────

function SectionDivider(): React.ReactElement {
  return <hr className="border-border-subtle" />;
}

interface LinkTaskModalProps {
  finding: FindingDto;
  open: boolean;
  onClose: () => void;
}

function LinkTaskModal({ finding, open, onClose }: LinkTaskModalProps): React.ReactElement {
  const queryClient = useQueryClient();
  const [selectedTaskId, setSelectedTaskId] = React.useState('');
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();
  const tasksQuery = useQuery({
    queryKey: ['tasks', 'finding-link-picker'] as const,
    queryFn: ({ signal }) => listTasks({ signal }),
    enabled: open,
    staleTime: 30_000,
  });
  const candidates = React.useMemo(
    () =>
      (tasksQuery.data?.items ?? []).filter(
        (task) => task.primary_managed_system_id === finding.primary_managed_system_id,
      ),
    [finding.primary_managed_system_id, tasksQuery.data?.items],
  );
  const mutation = useMutation({
    mutationFn: (taskId: string) =>
      linkTaskToFinding(finding.id, { task_id: taskId }, idempotencyKey),
    onSuccess: () => {
      markConsumed();
      toast.success('Task가 Finding에 연결되었습니다.');
      void queryClient.invalidateQueries({ queryKey: ['finding', finding.id] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      onClose();
    },
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  React.useEffect(() => {
    if (!open) setSelectedTaskId('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Task 연결</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <FieldLabel htmlFor="link-task-select">Task</FieldLabel>
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger id="link-task-select">
              <SelectValue
                placeholder={tasksQuery.isLoading ? 'Task 불러오는 중...' : '기존 Task 선택'}
              />
            </SelectTrigger>
            <SelectContent>
              {candidates.map((task) => (
                <SelectItem key={task.id} value={task.id}>
                  {task.title} · {task.display_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {tasksQuery.isError && (
            <p className="text-sm text-feedback-error">Task 목록을 불러오지 못했습니다.</p>
          )}
          {!tasksQuery.isLoading && candidates.length === 0 && (
            <p className="text-sm text-text-muted">
              연결 가능한 같은 Managed System Task가 없습니다.
            </p>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={mutation.isPending}>
            취소
          </Button>
          <Button
            type="button"
            onClick={() => selectedTaskId && mutation.mutate(selectedTaskId)}
            disabled={!selectedTaskId || mutation.isPending}
            data-testid="link-task-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Sentiment / importance badge helpers ─────────────────────────────────────

const SENTIMENT_LABEL: Record<EvidenceHighlightSentiment, string> = {
  negative: '부정',
  neutral: '중립',
  positive: '긍정',
};

const IMPORTANCE_LABEL: Record<EvidenceHighlightImportance, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

// ── Single Evidence Highlight row ────────────────────────────────────────────

interface EvidenceHighlightRowProps {
  highlight: EvidenceHighlightDto;
}

function EvidenceHighlightRow({ highlight }: EvidenceHighlightRowProps): React.ReactElement {
  // quote_or_summary is OMITTED from the DTO when the source is unreadable (withheld rule).
  const isWithheld = highlight.quote_or_summary === undefined;

  return (
    <div
      className="rounded-md border border-border-subtle bg-surface-card p-4 flex flex-col gap-2"
      data-testid="evidence-highlight-row"
      data-evidence-id={highlight.id}
    >
      {/* Source reference */}
      <div className="flex items-center gap-2 flex-wrap">
        <FitBadge data-testid="evidence-source-type">
          {EVIDENCE_SOURCE_TYPE_LABEL[highlight.source_type]}
        </FitBadge>
        {highlight.source_type !== 'survey_response' && highlight.source_id !== null && (
          <span className="text-xs text-text-muted font-mono" data-testid="evidence-source-id">
            {highlight.source_id.slice(0, 8)}
          </span>
        )}
        {highlight.sentiment !== null && (
          <FitBadge data-testid="evidence-sentiment">
            {SENTIMENT_LABEL[highlight.sentiment]}
          </FitBadge>
        )}
        {highlight.importance !== null && (
          <FitBadge data-testid="evidence-importance">
            {IMPORTANCE_LABEL[highlight.importance]}
          </FitBadge>
        )}
      </div>

      {/* Quote or withheld state */}
      {isWithheld ? (
        <p className="text-sm text-text-muted italic" data-testid="evidence-withheld">
          [원문 접근 권한 없음 — 내용이 숨겨졌습니다.]
        </p>
      ) : (
        <p className="text-sm text-text-primary whitespace-pre-wrap" data-testid="evidence-quote">
          {highlight.quote_or_summary}
        </p>
      )}
    </div>
  );
}

// ── Evidence Highlights section (loading / empty / list) ─────────────────────

interface EvidenceHighlightsSectionProps {
  findingId: string;
  evidenceCount: number;
}

function EvidenceHighlightsSection({
  findingId,
}: EvidenceHighlightsSectionProps): React.ReactElement {
  const { data: highlights, isLoading, isError } = useEvidenceHighlights(findingId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-label="Evidence 불러오는 중">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (isError) {
    return <p className="text-sm text-feedback-error">Evidence 목록을 불러오지 못했습니다.</p>;
  }

  const items = highlights ?? [];

  if (items.length === 0) {
    return (
      <div data-testid="evidence-empty-state">
        <EmptyState
          size="sm"
          title="증거 하이라이트가 없습니다."
          body="Evidence 추가 버튼으로 증거를 추가하세요."
          className="rounded-md border border-dashed border-border-subtle bg-surface-card px-6"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="evidence-highlight-list">
      {items.map((h) => (
        <EvidenceHighlightRow key={h.id} highlight={h} />
      ))}
    </div>
  );
}

// ── Add Evidence modal ────────────────────────────────────────────────────────

interface AddEvidenceModalProps {
  findingId: string;
  open: boolean;
  onClose: () => void;
}

const SOURCE_TYPE_OPTIONS: {
  value: EvidenceHighlightSourceType;
  label: string;
}[] = [
  { value: 'voc', label: 'VOC' },
  { value: 'survey_response', label: 'Survey Response' },
  { value: 'note', label: 'Note (manual)' },
];

const SENTIMENT_OPTIONS: {
  value: EvidenceHighlightSentiment;
  label: string;
}[] = [
  { value: 'negative', label: '부정 (Negative)' },
  { value: 'neutral', label: '중립 (Neutral)' },
  { value: 'positive', label: '긍정 (Positive)' },
];

const IMPORTANCE_OPTIONS: {
  value: EvidenceHighlightImportance;
  label: string;
}[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

function AddEvidenceModal({ findingId, open, onClose }: AddEvidenceModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<AddEvidenceHighlightRequest>({
    resolver: zodResolver(addEvidenceHighlightRequestSchema),
    defaultValues: {
      source_type: 'note',
      source_id: null,
      quote_or_summary: '',
      sentiment: null,
      importance: null,
    },
    mode: 'onBlur',
  });

  const watchedSourceType = form.watch('source_type');

  const mutation = useAddEvidenceHighlightMutation({
    findingId,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function closeAndReset(): void {
    form.reset();
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: AddEvidenceHighlightRequest): void {
    mutation.mutate(values, {
      onSuccess: () => {
        markConsumed();
        closeAndReset();
        toast.success('Evidence가 추가되었습니다.');
      },
    });
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="add-evidence-modal">
        <DialogHeader>
          <DialogTitle>Evidence 추가</DialogTitle>
        </DialogHeader>

        <form
          id="add-evidence-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Source type */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="evidence-source-type">
              소스 유형
            </FieldLabel>
            <Select
              defaultValue="note"
              onValueChange={(val) =>
                form.setValue('source_type', val as EvidenceHighlightSourceType, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="evidence-source-type" data-testid="evidence-source-type-select">
                <SelectValue placeholder="소스 유형 선택" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source ID — required unless source_type === 'note' */}
          {watchedSourceType !== 'note' && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel required htmlFor="evidence-source-id">
                소스 ID (UUID)
              </FieldLabel>
              <Input
                id="evidence-source-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                {...form.register('source_id')}
                aria-invalid={Boolean(form.formState.errors.source_id)}
                data-testid="evidence-source-id-input"
              />
              {form.formState.errors.source_id?.message && (
                <p className="text-xs text-text-danger" role="alert">
                  {form.formState.errors.source_id.message}
                </p>
              )}
            </div>
          )}

          {/* Quote or summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="evidence-quote">
              인용 / 요약
            </FieldLabel>
            <Textarea
              id="evidence-quote"
              placeholder="핵심 인용문 또는 요약을 입력하세요."
              rows={4}
              {...form.register('quote_or_summary')}
              aria-invalid={Boolean(form.formState.errors.quote_or_summary)}
              data-testid="evidence-quote-input"
            />
            {form.formState.errors.quote_or_summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.quote_or_summary.message}
              </p>
            )}
          </div>

          {/* Sentiment (optional) */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="evidence-sentiment">감정 (선택)</FieldLabel>
            <Select
              onValueChange={(val) =>
                form.setValue('sentiment', val as EvidenceHighlightSentiment, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="evidence-sentiment" data-testid="evidence-sentiment-select">
                <SelectValue placeholder="선택 안 함" />
              </SelectTrigger>
              <SelectContent>
                {SENTIMENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Importance (optional) */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="evidence-importance">중요도 (선택)</FieldLabel>
            <Select
              onValueChange={(val) =>
                form.setValue('importance', val as EvidenceHighlightImportance, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="evidence-importance" data-testid="evidence-importance-select">
                <SelectValue placeholder="선택 안 함" />
              </SelectTrigger>
              <SelectContent>
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            type="submit"
            form="add-evidence-form"
            disabled={isSubmitting}
            data-testid="add-evidence-submit"
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Link Existing Evidence modal ──────────────────────────────────────────────

interface LinkEvidenceModalProps {
  findingId: string;
  open: boolean;
  onClose: () => void;
}

function LinkEvidenceModal({
  findingId,
  open,
  onClose,
}: LinkEvidenceModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<LinkEvidenceRequest>({
    resolver: zodResolver(linkEvidenceRequestSchema),
    defaultValues: {
      source_type: 'voc',
      source_id: '',
    },
    mode: 'onBlur',
  });

  const mutation = useLinkEvidenceMutation({
    findingId,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function closeAndReset(): void {
    form.reset();
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: LinkEvidenceRequest): void {
    mutation.mutate(values, {
      onSuccess: () => {
        markConsumed();
        closeAndReset();
        toast.success('Evidence가 연결되었습니다.');
      },
    });
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="link-evidence-modal">
        <DialogHeader>
          <DialogTitle>기존 Evidence 연결</DialogTitle>
        </DialogHeader>

        <form
          id="link-evidence-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Source ID */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="link-source-id">
              VOC ID (UUID)
            </FieldLabel>
            <Input
              id="link-source-id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              {...form.register('source_id')}
              aria-invalid={Boolean(form.formState.errors.source_id)}
              data-testid="link-evidence-source-id-input"
            />
            {form.formState.errors.source_id?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.source_id.message}
              </p>
            )}
          </div>

          <p className="text-xs text-text-muted">
            현재 VOC 소스만 연결할 수 있습니다. (source_type: voc)
          </p>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            type="submit"
            form="link-evidence-form"
            disabled={isSubmitting}
            data-testid="link-evidence-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Request Task modal ───────────────────────────────────────────────────────

interface RequestTaskModalProps {
  finding: FindingDto;
  open: boolean;
  onClose: () => void;
}

function RequestTaskModal({ finding, open, onClose }: RequestTaskModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<CreateTaskRequestFromFindingRequest>({
    resolver: zodResolver(createTaskRequestFromFindingRequestSchema),
    defaultValues: {
      evidence_summary: finding.summary,
      requested_outcome: '',
    },
    mode: 'onBlur',
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        evidence_summary: finding.summary,
        requested_outcome: '',
      });
    }
  }, [finding.summary, form, open]);

  const mutation = useRequestTaskFromFinding({
    findingId: finding.id,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function closeAndReset(): void {
    form.reset({
      evidence_summary: finding.summary,
      requested_outcome: '',
    });
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: CreateTaskRequestFromFindingRequest): void {
    mutation.mutate(values, {
      onSuccess: () => {
        markConsumed();
        closeAndReset();
        toast.success('Task Request가 생성되었습니다.');
      },
    });
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="request-task-modal">
        <DialogHeader>
          <DialogTitle>Task 요청</DialogTitle>
        </DialogHeader>

        <form
          id="request-task-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="task-request-evidence-summary">
              Evidence Summary
            </FieldLabel>
            <Textarea
              id="task-request-evidence-summary"
              rows={5}
              placeholder="Task 검토자가 볼 근거 요약을 입력하세요."
              {...form.register('evidence_summary')}
              aria-invalid={Boolean(form.formState.errors.evidence_summary)}
              data-testid="request-task-evidence-summary-input"
            />
            {form.formState.errors.evidence_summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.evidence_summary.message}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="task-request-requested-outcome">
              Requested Outcome
            </FieldLabel>
            <Textarea
              id="task-request-requested-outcome"
              rows={4}
              placeholder="기대하는 실행 결과를 입력하세요."
              {...form.register('requested_outcome')}
              aria-invalid={Boolean(form.formState.errors.requested_outcome)}
              data-testid="request-task-requested-outcome-input"
            />
            {form.formState.errors.requested_outcome?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.requested_outcome.message}
              </p>
            )}
          </div>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            type="submit"
            form="request-task-form"
            disabled={isSubmitting}
            data-testid="request-task-submit"
          >
            요청
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Full detail view ─────────────────────────────────────────────────────────

interface FullFindingDetailProps {
  finding: FindingDto;
}

function FullFindingDetail({ finding }: FullFindingDetailProps): React.ReactElement {
  const [addEvidenceOpen, setAddEvidenceOpen] = React.useState(false);
  const [linkEvidenceOpen, setLinkEvidenceOpen] = React.useState(false);
  const [requestTaskOpen, setRequestTaskOpen] = React.useState(false);
  const [linkTaskOpen, setLinkTaskOpen] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { actors } = useWorkspaceActors();
  const actorsById = React.useMemo(
    () => new Map((actors ?? []).map((actor) => [actor.id, actor.display_name])),
    [actors],
  );
  const managedSystemsQuery = useQuery({
    queryKey: ['managed-systems', 'all'] as const,
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: true, signal }),
    staleTime: 10 * 60 * 1000,
  });
  const managedSystemsById = React.useMemo(
    () => new Map((managedSystemsQuery.data?.items ?? []).map((ms) => [ms.id, ms.name])),
    [managedSystemsQuery.data?.items],
  );
  const analyticsAreasQuery = useQuery({
    queryKey: ['analytics-areas', finding.primary_managed_system_id] as const,
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({
        managedSystemId: finding.primary_managed_system_id,
        includeArchived: true,
        signal,
      }),
    staleTime: 10 * 60 * 1000,
  });
  const analyticsAreasById = React.useMemo(
    () => new Map((analyticsAreasQuery.data?.items ?? []).map((area) => [area.id, area.name])),
    [analyticsAreasQuery.data?.items],
  );
  const linkedVocQuery = useVocDetail(finding.source_type === 'voc' ? finding.source_id : null);
  const linkedTaskQuery = useQuery({
    queryKey: ['task', finding.linked_task_id] as const,
    queryFn: ({ signal }) => getTask(finding.linked_task_id as string, signal),
    enabled: finding.linked_task_id !== null,
    staleTime: 30 * 1000,
  });
  const linkedVocTitle =
    linkedVocQuery.data && 'title' in linkedVocQuery.data ? linkedVocQuery.data.title : null;
  const linkedVocDisplayId =
    linkedVocQuery.data && 'display_id' in linkedVocQuery.data
      ? linkedVocQuery.data.display_id
      : null;
  const { key: statusIdempotencyKey, markConsumed: markStatusKeyConsumed } = useIdempotencyKey();
  const { data: me } = useMe();
  const managePermissionQuery = usePermissionCheck({
    capability: 'finding.manage',
    managedSystemId: finding.primary_managed_system_id,
  });

  // finding.manage gates both CTAs (display hint only — backend is authoritative).
  const canManage =
    me?.actor.role_level === 'admin' || managePermissionQuery.data?.state === 'approved';
  const statusMutation = useFindingStatusMutation({
    findingId: finding.id,
    idempotencyKey: statusIdempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function handleMarkNotActionable(): void {
    statusMutation.mutate(
      { status: 'not_actionable' },
      {
        onSuccess: () => {
          markStatusKeyConsumed();
          toast.success('Finding이 조치 불필요로 표시되었습니다.');
        },
      },
    );
  }

  const markNotActionableDisabled =
    !canManage ||
    statusMutation.isPending ||
    finding.status === 'not_actionable' ||
    finding.status === 'converted' ||
    finding.status === 'archived';

  return (
    <>
      <div className="flex h-full flex-col" data-testid="finding-detail-panel">
        {/* Header */}
        <div className="shrink-0 border-b border-border-subtle px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-1">
            <FitBadge>Finding</FitBadge>
            <span className="text-xs text-text-muted">{finding.display_id}</span>
          </div>
          <h1 className="text-xl font-semibold text-text-primary">{finding.title}</h1>
        </div>

        <DetailPanelSectionNav sections={DETAIL_SECTIONS} scrollRef={scrollRef} />

        <div
          ref={scrollRef}
          className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-6"
        >
          {/* Summary */}
          <div data-anchor="summary" className="flex flex-col gap-1">
            <PanelSectionTitle>요약</PanelSectionTitle>
            <p className="text-sm text-text-primary whitespace-pre-wrap">{finding.summary}</p>
          </div>

          <SectionDivider />

          {/* Metadata grid — Source Type / Severity / Confidence / Status */}
          <div data-anchor="metadata" className="flex flex-col gap-2">
            <PanelSectionTitle>소스 / 심각도 / 신뢰도</PanelSectionTitle>
            <FieldRow label="소스 유형" className="px-0">
              <FitBadge>{SOURCE_TYPE_LABEL[finding.source_type] ?? finding.source_type}</FitBadge>
            </FieldRow>
            <FieldRow label="심각도" className="px-0">
              <SeverityBadge severity={finding.severity as SeverityEnum} />
            </FieldRow>
            <FieldRow label="신뢰도" className="px-0">
              {finding.confidence !== null ? (
                CONFIDENCE_LABEL[finding.confidence]
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="상태" className="px-0">
              <FitBadge>{FINDING_STATUS_LABEL[finding.status]}</FitBadge>
            </FieldRow>
            <FieldRow label="생성자" className="px-0">
              <UserChip
                user={{ display_name: actorsById.get(finding.created_by) ?? 'Finding creator' }}
                size="sm"
              />
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Evidence Highlights — per design/05 layout: after Summary/Source/Severity/Confidence */}
          <div data-anchor="evidence" className="flex flex-col gap-3">
            <PanelSectionTitle>Evidence Highlights ({finding.evidence_count})</PanelSectionTitle>
            <EvidenceHighlightsSection
              findingId={finding.id}
              evidenceCount={finding.evidence_count}
            />
          </div>

          <SectionDivider />

          {/* Primary Managed System */}
          <div data-anchor="managed-system" className="flex flex-col gap-2">
            <PanelSectionTitle>Primary Managed System</PanelSectionTitle>
            <FieldRow label="Managed System" className="px-0">
              <ManagedSystemPill
                name={managedSystemsById.get(finding.primary_managed_system_id) ?? 'Managed System'}
              />
            </FieldRow>
          </div>

          {/* Affected Analytics Area */}
          <div data-anchor="analytics-area" className="flex flex-col gap-2">
            <PanelSectionTitle>Affected Analytics Area</PanelSectionTitle>
            <FieldRow label="Analytics Area" className="px-0">
              {finding.analytics_area_id !== null ? (
                <FitBadge>
                  {analyticsAreasById.get(finding.analytics_area_id) ?? 'Analytics Area'}
                </FitBadge>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
          </div>

          <SectionDivider />

          {/* Linked VOC — why this Finding exists */}
          <div data-anchor="links" className="flex flex-col gap-2">
            <PanelSectionTitle>Linked VOC / Task</PanelSectionTitle>
            <FieldRow label="Linked VOC" className="px-0">
              {finding.source_type === 'voc' && finding.source_id !== null ? (
                <Link
                  to="/vocs"
                  search={{ view: 'inbox', selected: finding.source_id }}
                  className="inline-flex items-center gap-1.5 text-sm text-accent-primary underline underline-offset-2 hover:text-accent-primary/80"
                >
                  <span>{linkedVocTitle ?? 'Linked VOC'}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {linkedVocDisplayId ?? shortId(finding.source_id)}
                  </span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
            <FieldRow label="Linked Task" className="px-0">
              {finding.linked_task_id !== null ? (
                <Link
                  to="/tasks"
                  search={{ view: 'backlog', param: finding.linked_task_id }}
                  className="inline-flex items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-2.5 py-1.5 text-sm text-accent-primary hover:bg-surface-row-hover"
                >
                  <span>{linkedTaskQuery.data?.title ?? 'Linked task'}</span>
                  <span className="font-mono text-xs text-text-muted">
                    {linkedTaskQuery.data?.display_id ?? shortId(finding.linked_task_id)}
                  </span>
                  <span className="text-xs text-text-muted">jump</span>
                </Link>
              ) : (
                <span className="text-text-muted">—</span>
              )}
            </FieldRow>
          </div>
        </div>

        {/* CTA Footer */}
        <div className="sticky bottom-0 shrink-0 bg-surface-canvas border-t border-border-subtle px-6 py-3 flex flex-wrap items-center gap-2">
          {/* Add Evidence — gated to finding.manage; backend authoritative */}
          <Button
            variant="default"
            size="sm"
            onClick={() => setAddEvidenceOpen(true)}
            disabled={!canManage}
            data-testid="add-evidence-btn"
          >
            Evidence 추가
          </Button>

          {/* Link Existing Evidence — gated to finding.manage; backend authoritative */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setLinkEvidenceOpen(true)}
            disabled={!canManage}
            data-testid="link-evidence-btn"
          >
            기존 Evidence 연결
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setRequestTaskOpen(true)}
            disabled={!canManage}
            data-testid="request-task-btn"
          >
            Task 요청
          </Button>
          {finding.linked_task_id === null && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLinkTaskOpen(true)}
              disabled={!canManage}
              data-testid="link-task-btn"
            >
              Task 연결
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkNotActionable}
            disabled={markNotActionableDisabled}
            data-testid="mark-not-actionable-btn"
          >
            조치 불필요 표시
          </Button>
        </div>
      </div>

      {/* Modals */}
      <AddEvidenceModal
        findingId={finding.id}
        open={addEvidenceOpen}
        onClose={() => setAddEvidenceOpen(false)}
      />
      <LinkEvidenceModal
        findingId={finding.id}
        open={linkEvidenceOpen}
        onClose={() => setLinkEvidenceOpen(false)}
      />
      <RequestTaskModal
        finding={finding}
        open={requestTaskOpen}
        onClose={() => setRequestTaskOpen(false)}
      />
      <LinkTaskModal finding={finding} open={linkTaskOpen} onClose={() => setLinkTaskOpen(false)} />
    </>
  );
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function FindingDetailPanel({ findingId }: FindingDetailPanelProps): React.ReactElement {
  const { data, isLoading, isError, error } = useFindingDetail(findingId);

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="h-12 border-b border-border-subtle flex items-center px-6">
          <Skeleton className="h-4 w-32" />
        </div>
        <FindingDetailSkeleton />
      </div>
    );
  }

  // 2. Error
  if (isError) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'not_found.record') {
      return <FindingNotFound />;
    }
    // permission.denied → finding.read blocked
    if (code === 'permission.denied') {
      return (
        <div className="flex flex-col h-full">
          <div className="h-12 border-b border-border-subtle flex items-center px-6">
            <span className="text-sm font-medium text-text-primary">Finding 상세</span>
          </div>
          <div className="flex-1 flex items-center justify-center p-6">
            <PermissionBlockedPanel
              state="denied"
              category="Finding 상세"
              reason="finding.read 권한이 없습니다. 해당 Managed System의 Developer 이상 권한이 필요합니다."
            />
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <p className="text-sm text-feedback-error">데이터를 불러오지 못했습니다.</p>
      </div>
    );
  }

  if (!data) {
    return <FindingNotFound />;
  }

  // 3. Full detail
  return <FullFindingDetail finding={data} />;
}
