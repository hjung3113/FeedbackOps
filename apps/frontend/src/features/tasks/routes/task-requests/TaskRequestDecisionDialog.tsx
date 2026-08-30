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
          title: 'Approve Task Request',
          description: 'Record the rationale for accepting this execution candidate.',
          label: isSelfApproval ? 'Self-approval reason' : 'Approval reason',
          submitLabel: 'Approve Task Request',
          required: isSelfApproval,
        }
      : dialog.action === 'request-more-evidence'
        ? {
            title: 'Request more evidence',
            description: 'Record the evidence needed before this request can be reviewed.',
            label: 'Evidence note',
            submitLabel: 'Request evidence',
            required: true,
          }
        : {
            title: 'Reject Task Request',
            description: 'Record why this execution candidate cannot be accepted.',
            label: 'Reject reason',
            submitLabel: 'Reject Task Request',
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
            {details.required && <span className="text-xs text-text-muted">Required.</span>}
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
              Cancel
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
