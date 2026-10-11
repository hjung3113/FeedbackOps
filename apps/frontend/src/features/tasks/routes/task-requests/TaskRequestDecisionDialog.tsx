import type { TaskRequestDto } from '@fops/shared';
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
import * as React from 'react';

export type DecisionAction = 'approve' | 'request-more-evidence' | 'reject';

export interface DecisionDialogState {
  requestId: string;
  action: DecisionAction;
  value: string;
  error: string | null;
}

export function TaskRequestDecisionDialog({
  dialog,
  request,
  isSelfApproval,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  dialog: DecisionDialogState | null;
  request: TaskRequestDto;
  isSelfApproval: boolean;
  isSubmitting: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  const liveDialog = dialog?.requestId === request.id ? dialog : null;
  const [previousDialog, setPreviousDialog] = React.useState(liveDialog);
  const [retained, setRetained] = React.useState(liveDialog);
  const [opening, setOpening] = React.useState<{
    key: number;
    opener: HTMLElement | null;
    dismissed: boolean;
  }>({ key: 0, opener: null, dismissed: false });
  if (previousDialog !== liveDialog) {
    setPreviousDialog(liveDialog);
    if (liveDialog) setRetained(liveDialog);
    if (liveDialog && (!previousDialog || previousDialog.action !== liveDialog.action)) {
      setOpening({ key: opening.key + 1, opener: null, dismissed: false });
    }
  }
  const content = liveDialog ?? retained;
  const activeOpening = React.useRef<typeof opening | null>(null);
  const mounted = React.useRef(false);
  React.useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  function dismiss() {
    if (isSubmitting) return;
    opening.dismissed = true;
    onClose();
  }

  const details =
    content?.action === 'approve'
      ? {
          title: 'Task Request 승인',
          description: '실행 후보를 승인하는 이유를 기록하세요.',
          label: isSelfApproval ? '본인 승인 사유' : '승인 사유',
          submitLabel: '승인',
          required: isSelfApproval,
        }
      : content?.action === 'request-more-evidence'
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
  const inputId = `task-request-${content?.action}-reason`;

  return (
    <Dialog open={liveDialog !== null} onOpenChange={(open) => !open && dismiss()}>
      {content && (
        <DialogContent
          key={opening.key}
          onOpenAutoFocus={() => {
            activeOpening.current = opening;
            opening.opener =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            opening.dismissed = false;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // A request-key unmount must not restore an old request's opener.
            if (
              mounted.current &&
              activeOpening.current === opening &&
              opening.dismissed &&
              opening.opener?.isConnected
            ) {
              opening.opener.focus();
            }
            opening.opener = null;
            opening.dismissed = false;
          }}
        >
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
                value={content.value}
                onChange={(event) => onChange(event.target.value)}
                disabled={isSubmitting}
                aria-invalid={content.error !== null}
              />
              {details.required && (
                <span className="text-xs text-text-muted">필수 입력 항목입니다.</span>
              )}
            </div>
            {content.error && (
              <p className="text-sm text-accent-danger" role="alert">
                {content.error}
              </p>
            )}
            <DialogFooter spacing="compact">
              <Button
                type="button"
                variant="secondary"
                disabled={isSubmitting}
                onClick={dismiss}
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
      )}
    </Dialog>
  );
}
