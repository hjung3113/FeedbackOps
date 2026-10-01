import {
  usePublicUpdateReviewCandidates,
  useResolvePublicUpdateReviewCandidate,
} from '@/features/voc/hooks/usePublicUpdateReviewCandidates';
import { mapUnknownError } from '@/lib/api/errorMapper';
import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import { formatDate } from '@/lib/format/datetime';
import type { ReporterFacingStatusEnum, VocDetailEnvelope } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

const STATUSES: ReporterFacingStatusEnum[] = [
  'received',
  'reviewing',
  'assigned',
  'progress',
  'prep',
  'resolved',
  'reopened',
  'closed',
];

const NO_STATUS = '__none__';

export function PublicUpdateReviewModal({
  voc,
  open,
  onOpenChange,
}: {
  voc: VocDetailEnvelope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const candidates = usePublicUpdateReviewCandidates(voc.id, open);
  const resolve = useResolvePublicUpdateReviewCandidate(voc.id);
  const [candidateId, setCandidateId] = useState('');
  const [status, setStatus] = useState<ReporterFacingStatusEnum | ''>('');
  const [message, setMessage] = useState('');
  const [dismissalReason, setDismissalReason] = useState('');
  const reviewCandidates = candidates.data?.items ?? [];

  const resetForm = () => {
    setCandidateId('');
    setStatus('');
    setMessage('');
    setDismissalReason('');
  };

  useEffect(() => {
    setCandidateId('');
    setStatus('');
    setMessage('');
    setDismissalReason('');
    if (open) {
      setCandidateId(candidates.data?.items[0]?.id ?? '');
    }
  }, [open, candidates.data?.items]);

  const close = () => {
    if (!resolve.isPending) {
      resetForm();
      onOpenChange(false);
    }
  };
  const apply = () => {
    if (!candidateId || !status || !message.trim()) return;
    resolve.mutate(
      {
        action: 'apply',
        candidate_id: candidateId,
        public_update: {
          skip_public_update: false,
          body_rich_content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: message.trim() }] }],
          },
          next_reporter_facing_status: status,
        },
      },
      {
        onSuccess: () => {
          toast.success('공개 업데이트 검토를 적용했습니다.');
          resetForm();
          onOpenChange(false);
        },
        onError: (error) => toast.error(mapUnknownError(error).message),
      },
    );
  };
  const dismiss = () => {
    if (!candidateId || !dismissalReason.trim()) return;
    resolve.mutate(
      { action: 'dismiss', candidate_id: candidateId, dismissal_reason: dismissalReason.trim() },
      {
        onSuccess: () => {
          toast.success('검토 후보를 해제했습니다.');
          resetForm();
          onOpenChange(false);
        },
        onError: (error) => toast.error(mapUnknownError(error).message),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) resetForm();
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent data-testid="public-update-review-modal">
        <DialogHeader>
          <DialogTitle>공개 업데이트 리뷰</DialogTitle>
          <DialogDescription>
            Task 상태를 자동 반영하지 않습니다. Reporter-facing status를 직접 선택하세요.
          </DialogDescription>
        </DialogHeader>
        {candidates.isLoading ? (
          <p className="text-sm text-text-muted">후보를 불러오는 중…</p>
        ) : candidates.isError ? (
          <div className="grid gap-2" role="alert">
            <p className="text-sm text-text-danger">후보 목록을 불러오지 못했습니다.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                void candidates.refetch();
              }}
            >
              다시 시도
            </Button>
          </div>
        ) : reviewCandidates.length === 0 ? (
          <p className="text-sm text-text-muted">검토할 후보가 없습니다.</p>
        ) : (
          <div className="grid gap-3">
            <div className="text-sm">
              <label htmlFor="public-update-candidate">후보</label>
              <Select value={candidateId} onValueChange={setCandidateId}>
                <SelectTrigger
                  id="public-update-candidate"
                  aria-label="후보"
                  className="mt-1 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reviewCandidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      Released Task 후보 · {formatDate(candidate.created_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 text-sm">
              <FieldLabel htmlFor="public-update-review-message">공개 업데이트</FieldLabel>
              <Textarea
                id="public-update-review-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="text-sm">
              <label htmlFor="public-update-reporter-status">Reporter-facing status</label>
              <Select
                value={status || NO_STATUS}
                onValueChange={(value) =>
                  setStatus(value === NO_STATUS ? '' : (value as ReporterFacingStatusEnum))
                }
              >
                <SelectTrigger
                  id="public-update-reporter-status"
                  aria-label="Reporter-facing status"
                  className="mt-1 w-full"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_STATUS}>상태 선택</SelectItem>
                  {STATUSES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {REPORTER_STATUS_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 text-sm">
              <FieldLabel htmlFor="public-update-review-dismissal-reason">
                Dismiss reason
              </FieldLabel>
              <Input
                id="public-update-review-dismissal-reason"
                value={dismissalReason}
                onChange={(e) => setDismissalReason(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={dismiss}
            disabled={!dismissalReason.trim() || resolve.isPending}
          >
            Dismiss
          </Button>
          <Button
            onClick={apply}
            disabled={!candidateId || !status || !message.trim() || resolve.isPending}
          >
            Apply public update
          </Button>
          <Button variant="secondary" onClick={close} disabled={resolve.isPending}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
