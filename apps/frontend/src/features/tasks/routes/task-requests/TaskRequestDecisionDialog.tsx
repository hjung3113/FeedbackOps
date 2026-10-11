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
  const lifetime = React.useRef({
    request,
    ignoredDialog: null as DecisionDialogState | null,
    lastDialog: null as DecisionDialogState | null,
    opener: null as HTMLElement | null,
    dismissed: false,
    wasOpen: false,
  });
  if (lifetime.current.request !== request) {
    // The decision hook closes on item changes in an effect. Ignore that old
    // payload immediately so a new request cannot inherit its closing content.
    lifetime.current = {
      request,
      ignoredDialog: dialog,
      lastDialog: null,
      opener: null,
      dismissed: false,
      wasOpen: false,
    };
  }
  const liveDialog = dialog === lifetime.current.ignoredDialog ? null : dialog;
  if (liveDialog) {
    if (!lifetime.current.wasOpen || lifetime.current.lastDialog?.action !== liveDialog.action) {
      lifetime.current = {
        ...lifetime.current,
        opener: document.activeElement instanceof HTMLElement ? document.activeElement : null,
        dismissed: false,
      };
    }
    lifetime.current.lastDialog = liveDialog;
  }
  lifetime.current.wasOpen = liveDialog !== null;
  const closingLifetime = lifetime.current;
  const content = liveDialog ?? closingLifetime.lastDialog;

  function dismiss() {
    if (isSubmitting) return;
    lifetime.current.dismissed = true;
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
          onOpenAutoFocus={() => {
            lifetime.current.opener =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            lifetime.current.dismissed = false;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            // An old FocusScope cleanup must not clear or focus a newer action.
            if (lifetime.current !== closingLifetime) return;
            const { dismissed, opener } = closingLifetime;
            if (dismissed && opener?.isConnected) opener.focus();
            closingLifetime.lastDialog = null;
            closingLifetime.opener = null;
            closingLifetime.dismissed = false;
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
