import {
  type CreateTaskRequestRequest,
  type TaskRequestSourceType,
  createTaskRequestRequestSchema,
} from '@fops/shared';
import { Button, FieldLabel, OutlineBadge, Textarea } from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Check, ClipboardList, X } from 'lucide-react';
import * as React from 'react';
import { useForm } from 'react-hook-form';

import { fetchTaskRequests } from '@/lib/api';
import { koreanZodErrorMap } from '@/lib/forms/zodIssueMessage';

export interface TaskRequestDraftCardProps {
  sourceKind: 'VOC' | 'VOC Cluster' | 'Finding';
  sourceDisplayId: string;
  evidenceSummaryDefault: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: CreateTaskRequestRequest) => void;
  source?: { type: TaskRequestSourceType; id: string } | undefined;
}

export function TaskRequestDraftCard({
  sourceKind,
  sourceDisplayId,
  evidenceSummaryDefault,
  isSubmitting,
  onClose,
  onSubmit,
  source,
}: TaskRequestDraftCardProps): React.ReactElement {
  const form = useForm<CreateTaskRequestRequest>({
    resolver: zodResolver(createTaskRequestRequestSchema, { errorMap: koreanZodErrorMap }),
    defaultValues: {
      evidence_summary: evidenceSummaryDefault,
      requested_outcome: '',
    },
    mode: 'onBlur',
  });

  const baseId = React.useId();
  const summaryId = `${baseId}-evidence-summary`;
  const outcomeId = `${baseId}-requested-outcome`;

  React.useEffect(() => {
    const opener = document.activeElement;
    form.setFocus('evidence_summary');
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) {
        opener.focus();
      }
    };
  }, [form.setFocus]);

  const pendingRequests = useQuery({
    queryKey: ['task-requests', 'pending-source', source?.type, source?.id] as const,
    queryFn: ({ signal }) => fetchTaskRequests({ status: 'pending_review', signal }),
    enabled: source !== undefined,
  });
  const pendingRequest = pendingRequests.data?.items?.find(
    (request) => request.source_type === source?.type && request.source_id === source?.id,
  );

  function resetDraft(): void {
    form.reset({
      evidence_summary: evidenceSummaryDefault,
      requested_outcome: '',
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Escape' && !isSubmitting) {
      event.preventDefault();
      onClose();
    }
  }

  return (
    <section
      aria-label="Task Request 초안"
      className="mt-3 flex flex-col gap-3 rounded-md border border-[color-mix(in_oklch,rgb(var(--border-selected))_52%,rgb(var(--border-subtle)))] bg-[linear-gradient(180deg,color-mix(in_oklch,rgb(var(--border-selected))_8%,rgb(var(--surface-card))),rgb(var(--surface-card)))] p-3"
      data-testid="request-task-draft"
      onKeyDown={handleKeyDown}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <OutlineBadge>
            <ClipboardList aria-hidden className="h-3.5 w-3.5" />
            Task Request 초안
          </OutlineBadge>
          <h3 className="text-sm font-semibold text-text-primary">Task Request 초안 작성</h3>
          <p className="text-xs text-text-muted">
            출처 <span className="font-mono">{sourceDisplayId}</span> · {sourceKind}
          </p>
        </div>
        <Button
          aria-label="초안 닫기"
          className="shrink-0 px-2"
          disabled={isSubmitting}
          onClick={onClose}
          size="sm"
          title="초안 닫기"
          type="button"
          variant="ghost"
        >
          <X aria-hidden className="h-4 w-4" />
        </Button>
      </header>

      {pendingRequest && (
        <p
          className="rounded-md border border-border-subtle bg-surface-card px-3 py-2 text-sm text-text-primary"
          data-testid="request-task-pending-notice"
        >
          이 소스에 검토 대기 중인 Task Request가 있습니다.{' '}
          <a
            className="text-accent-primary underline underline-offset-2"
            href={`/tasks?view=requests&param=${pendingRequest.id}`}
          >
            {pendingRequest.display_id}
          </a>
        </p>
      )}

      <form className="flex flex-col gap-3" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-1.5">
          <FieldLabel required htmlFor={summaryId}>
            근거 요약
          </FieldLabel>
          <Textarea
            id={summaryId}
            rows={4}
            placeholder="Task 검토자가 볼 근거 요약을 입력하세요."
            {...form.register('evidence_summary')}
            aria-describedby={
              form.formState.errors.evidence_summary
                ? `${summaryId}-help ${summaryId}-error`
                : `${summaryId}-help`
            }
            aria-invalid={Boolean(form.formState.errors.evidence_summary)}
            data-testid="request-task-evidence-summary-input"
          />
          <p className="text-xs text-text-muted" id={`${summaryId}-help`}>
            왜 필요한가를 설명하는 근거를 작성하세요.
          </p>
          {form.formState.errors.evidence_summary?.message && (
            <p className="text-xs text-text-danger" id={`${summaryId}-error`} role="alert">
              {form.formState.errors.evidence_summary.message}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel required htmlFor={outcomeId}>
            요청 결과
          </FieldLabel>
          <Textarea
            id={outcomeId}
            rows={3}
            placeholder="기대하는 실행 결과를 입력하세요."
            {...form.register('requested_outcome')}
            aria-describedby={
              form.formState.errors.requested_outcome
                ? `${outcomeId}-help ${outcomeId}-error`
                : `${outcomeId}-help`
            }
            aria-invalid={Boolean(form.formState.errors.requested_outcome)}
            data-testid="request-task-requested-outcome-input"
          />
          <p className="text-xs text-text-muted" id={`${outcomeId}-help`}>
            승인되면 무엇이 달성돼야 하는지 작성하세요.
          </p>
          {form.formState.errors.requested_outcome?.message && (
            <p className="text-xs text-text-danger" id={`${outcomeId}-error`} role="alert">
              {form.formState.errors.requested_outcome.message}
            </p>
          )}
        </div>

        {/* docs/design/06-task-project-system.md owns request fields; its contract overrides the prototype selectors. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={isSubmitting}
            data-testid="request-task-submit"
            size="sm"
            type="submit"
            variant="primary"
          >
            <Check aria-hidden className="h-3.5 w-3.5" />
            요청 등록
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href="/tasks?view=requests">
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
              Task Requests에서 검토
            </a>
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={resetDraft}
            size="sm"
            type="button"
            variant="subtle"
          >
            초기화
          </Button>
        </div>
        <p className="text-xs text-text-muted">제출 후 Task Requests에서 리뷰됩니다.</p>
      </form>
    </section>
  );
}
