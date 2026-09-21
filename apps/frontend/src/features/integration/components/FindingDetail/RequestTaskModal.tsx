import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import {
  type CreateTaskRequestFromFindingRequest,
  type FindingDto,
  createTaskRequestFromFindingRequestSchema,
} from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Textarea,
} from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useRequestTaskFromFinding } from '../../hooks/useRequestTaskFromFinding';

// ── Request Task modal ───────────────────────────────────────────────────────

interface RequestTaskModalProps {
  finding: FindingDto;
  open: boolean;
  onClose: () => void;
}

export function RequestTaskModal({ finding, open, onClose }: RequestTaskModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<CreateTaskRequestFromFindingRequest>({
    resolver: zodResolver(createTaskRequestFromFindingRequestSchema),
    defaultValues: {
      evidence_summary: finding.summary,
      requested_outcome: '',
    },
    mode: 'onBlur',
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: finding.id resets the form when switching findings with equal summaries.
  React.useEffect(() => {
    if (open) {
      form.reset({
        evidence_summary: finding.summary,
        requested_outcome: '',
      });
    }
  }, [finding.id, finding.summary, form, open]);

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
