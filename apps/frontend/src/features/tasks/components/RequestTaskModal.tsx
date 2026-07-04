import { type CreateTaskRequestRequest, createTaskRequestRequestSchema } from '@fops/shared';
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

export interface RequestTaskModalProps {
  open: boolean;
  evidenceSummaryDefault: string;
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (values: CreateTaskRequestRequest) => void;
}

export function RequestTaskModal({
  open,
  evidenceSummaryDefault,
  isSubmitting,
  onClose,
  onSubmit,
}: RequestTaskModalProps): React.ReactElement {
  const form = useForm<CreateTaskRequestRequest>({
    resolver: zodResolver(createTaskRequestRequestSchema),
    defaultValues: {
      evidence_summary: evidenceSummaryDefault,
      requested_outcome: '',
    },
    mode: 'onBlur',
  });

  React.useEffect(() => {
    if (open) {
      form.reset({
        evidence_summary: evidenceSummaryDefault,
        requested_outcome: '',
      });
    }
  }, [evidenceSummaryDefault, form, open]);

  function closeAndReset(): void {
    form.reset({
      evidence_summary: evidenceSummaryDefault,
      requested_outcome: '',
    });
    onClose();
  }

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
          onSubmit={form.handleSubmit(onSubmit)}
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
