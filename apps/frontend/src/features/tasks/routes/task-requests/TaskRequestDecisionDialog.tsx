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
import { Loader2 } from 'lucide-react';
import * as React from 'react';

export type DecisionAction = 'approve' | 'request-more-evidence' | 'reject';

export interface DecisionDialogState {
  requestId: string;
  action: DecisionAction;
  value: string;
  error: string | null;
  reasonInvalid?: boolean;
}

export function TaskRequestDecisionDialog({
  completedResult = null,
  getCompletedFocusTarget,
  onCompletedClose,
  recovery,
  dialog,
  request,
  isSelfApproval,
  isSubmitting,
  onChange,
  onClose,
  onSubmit,
}: {
  completedResult?: TaskRequestDto | null;
  onCompletedClose?: () => void;
  recovery?: React.ReactNode;
  getCompletedFocusTarget?: (result: TaskRequestDto) => HTMLElement | null;
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
  // One record per opening, identified by object identity. Handlers below mutate
  // `opener`/`dismissed` in place on purpose: a late close callback compares
  // `activeOpening.current === opening` and must see its own record. Do not turn
  // these mutations into immutable `setOpening` updates — that would detach late
  // close callbacks from their opening (#997, #1012).
  const [opening, setOpening] = React.useState<{
    key: number;
    opener: HTMLElement | null;
    dismissed: boolean;
    resultAtOpen: TaskRequestDto | null;
    successTarget: HTMLElement | null;
  }>({ key: 0, opener: null, dismissed: false, resultAtOpen: null, successTarget: null });
  if (previousDialog !== liveDialog) {
    setPreviousDialog(liveDialog);
    if (liveDialog) setRetained(liveDialog);
    if (liveDialog && (!previousDialog || previousDialog.action !== liveDialog.action)) {
      setOpening({
        key: opening.key + 1,
        opener: null,
        dismissed: false,
        resultAtOpen: null,
        successTarget: null,
      });
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

  const [handedOff, setHandedOff] = React.useState<typeof opening | null>(null);
  const successfulClose =
    liveDialog === null &&
    completedResult !== null &&
    completedResult.id === request.id &&
    completedResult !== opening.resultAtOpen &&
    ((content?.action === 'approve' && completedResult.status === 'approved') ||
      (content?.action === 'request-more-evidence' &&
        completedResult.status === 'needs_more_evidence') ||
      (content?.action === 'reject' && completedResult.status === 'rejected'));
  // Keep focused content connected until the same-request target is available.
  // Child FocusScope effects first release the closed dialog's focus trap.
  React.useEffect(() => {
    if (
      !successfulClose ||
      handedOff === opening ||
      activeOpening.current !== opening ||
      !completedResult
    )
      return;
    let frame: number | undefined;
    let attempts = 0;
    const transfer = () => {
      const target = getCompletedFocusTarget?.(completedResult);
      // Queue/recovery changes supply a new resolver and restart this effect.
      // Missing targets wait for those inputs instead of polling every frame.
      if (!target?.isConnected) return;
      attempts += 1;
      if (!target.closest('[hidden], [inert]')) {
        target.focus();
        if (document.activeElement === target) {
          opening.successTarget = target;
          setHandedOff(opening);
          return;
        }
      }
      // Allow fullscreen teardown to reveal the target, but retain the dialog
      // if visibility or actual focus cannot be established within ten attempts.
      if (attempts < 10) frame = requestAnimationFrame(transfer);
    };
    transfer();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [successfulClose, handedOff, opening, completedResult, getCompletedFocusTarget]);

  function dismiss() {
    if (isSubmitting || successfulClose) return;
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
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);

  return (
    <Dialog open={liveDialog !== null} onOpenChange={(open) => !open && dismiss()}>
      {content && (
        <DialogContent
          key={opening.key}
          {...(successfulClose && handedOff !== opening ? { forceMount: true } : {})}
          onOpenAutoFocus={() => {
            activeOpening.current = opening;
            opening.opener =
              document.activeElement instanceof HTMLElement ? document.activeElement : null;
            opening.dismissed = false;
            opening.resultAtOpen = completedResult;
            opening.successTarget = null;
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
            // Reconcile only this opening's handoff; a newer focus owner wins.
            if (
              mounted.current &&
              activeOpening.current === opening &&
              opening.successTarget?.isConnected &&
              document.activeElement === opening.successTarget
            ) {
              opening.successTarget.focus();
            }
            if (mounted.current && activeOpening.current === opening && opening.successTarget)
              onCompletedClose?.();
            opening.opener = null;
            opening.dismissed = false;
          }}
        >
          <DialogHeader>
            <DialogTitle>{details.title}</DialogTitle>
            <DialogDescription>{details.description}</DialogDescription>
          </DialogHeader>
          {successfulClose && recovery}
          <form
            onSubmit={(event) => {
              if (isSubmitting || successfulClose) event.preventDefault();
              else {
                onSubmit(event);
                // Invalid empty submit keeps the dialog open; send focus to the field.
                if (details.required && content.value.trim() === '') reasonRef.current?.focus();
              }
            }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={inputId}>{details.label}</Label>
              <Textarea
                id={inputId}
                ref={reasonRef}
                rows={3}
                value={content.value}
                onChange={(event) => onChange(event.target.value)}
                disabled={isSubmitting || successfulClose}
                aria-invalid={content.error !== null && content.reasonInvalid !== false}
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
                disabled={isSubmitting || successfulClose}
                onClick={dismiss}
                data-testid="task-request-decision-cancel"
              >
                취소
              </Button>
              <Button
                type="submit"
                aria-busy={isSubmitting}
                aria-disabled={isSubmitting || successfulClose}
              >
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {details.submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </Dialog>
  );
}
