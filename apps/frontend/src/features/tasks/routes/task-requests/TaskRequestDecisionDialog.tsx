import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Textarea,
} from '@fops/ui';
import type * as React from 'react';

export type DecisionAction = 'approve' | 'request-more-evidence' | 'reject';

export interface DecisionDialogState {
  action: DecisionAction;
  value: string;
  error: string | null;
}

export function TaskRequestDecisionDialog({
  dialog,
  isSelfApproval,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  dialog: DecisionDialogState | null;
  isSelfApproval: boolean;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  if (!dialog) return null;

  const details =
    dialog.action === 'approve'
      ? {
          title: 'Task Request 승인',
          description: '실행 후보를 승인하는 이유를 기록하세요.',
          label: isSelfApproval ? '본인 승인 사유' : '승인 사유',
          submitLabel: '승인',
          required: isSelfApproval,
        }
      : dialog.action === 'request-more-evidence'
        ? {
            title: '근거 추가 요청',
            description: '요청을 검토하기 전에 필요한 근거를 기록하세요.',
            label: '근거 메모',
            submitLabel: '요청',
            required: true,
          }
        : {
            title: 'Task Request 반려',
            description: '실행 후보를 반려하는 이유를 기록하세요.',
            label: '반려 사유',
            submitLabel: '반려',
            required: true,
          };
  const inputId = `task-request-${dialog.action}-reason`;

  return (
    <Dialog open onOpenChange={(open) => !open && !isSubmitting && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{details.title}</DialogTitle>
          <DialogDescription>{details.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId}>{details.label}</Label>
            <Textarea
              id={inputId}
              rows={3}
              value={dialog.value}
              onChange={(event) => onChange(event.target.value)}
              disabled={isSubmitting}
              aria-invalid={dialog.error !== null}
            />
            {details.required && (
              <span className="text-xs text-text-muted">필수 입력 항목입니다.</span>
            )}
          </div>
          {dialog.error && (
            <p className="text-sm text-accent-danger" role="alert">
              {dialog.error}
            </p>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={onClose}
              data-testid="task-request-decision-cancel"
            >
              취소
            </Button>
            <Button type="submit" loading={isSubmitting} disabled={isSubmitting}>
              {details.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
