import type { ApiError } from '@/lib/api';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@fops/ui';

function messageFor(error: ApiError | null, target: 'open' | 'close') {
  // #561: a network TypeError or non-JSON body is not an ApiError and has no envelope.
  const fields = error?.envelope?.detail?.fields;
  if (!Array.isArray(fields)) return '상태 변경에 실패했습니다. 다시 시도하세요.';
  const hasField = (path: string, code: string) =>
    fields.some(
      (field) =>
        typeof field === 'object' &&
        field !== null &&
        'code' in field &&
        'path' in field &&
        (field as { code?: unknown }).code === code &&
        Array.isArray((field as { path?: unknown }).path) &&
        (field as { path: unknown[] }).path[0] === path,
    );
  if (target === 'open' && hasField('questions', 'required'))
    return 'Survey 시작 전에 질문을 하나 이상 추가해야 합니다.';
  if (hasField('status', 'invalid_transition'))
    return target === 'open'
      ? '이 설문은 더 이상 시작할 수 없는 상태입니다.'
      : '이 설문은 더 이상 종료할 수 없는 상태입니다.';
  return '상태 변경에 실패했습니다. 다시 시도하세요.';
}

export function SurveyStatusConfirmationDialog({
  open,
  target,
  isPending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  target: 'open' | 'close';
  isPending: boolean;
  error: ApiError | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const launch = target === 'open';
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !isPending && onClose()}>
      <DialogContent data-testid={`survey-${target}-confirmation`}>
        <DialogHeader>
          <DialogTitle>{launch ? 'Survey 시작' : 'Survey 종료'}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-text-muted">
          {launch
            ? 'Survey 시작 시 응답 수집이 시작됩니다.'
            : 'Survey 종료 후에는 응답을 받을 수 없으며 다시 열 수 없습니다.'}
        </p>
        {error && (
          <p className="text-sm text-text-danger" role="alert">
            {messageFor(error, target)}
          </p>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isPending}
            data-testid="survey-status-cancel"
          >
            취소
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            data-testid="survey-status-confirm"
          >
            {launch ? 'Survey 시작' : 'Survey 종료'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
