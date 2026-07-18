import {
  usePublicUpdateReviewCandidates,
  useResolvePublicUpdateReviewCandidate,
} from '@/features/voc/hooks/usePublicUpdateReviewCandidates';
import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import type { ReporterFacingStatusEnum, VocDetailEnvelope } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
        onError: (error) => toast.error(error.envelope.message),
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
        onError: (error) => toast.error(error.envelope.message),
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
        ) : (
          <div className="grid gap-3">
            <label className="text-sm">
              후보
              <select
                className="mt-1 w-full"
                value={candidateId}
                onChange={(e) => setCandidateId(e.target.value)}
              >
                {(candidates.data?.items ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    Released Task 후보 · {new Date(candidate.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              공개 업데이트
              <textarea
                className="mt-1 w-full"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </label>
            <label className="text-sm">
              Reporter-facing status
              <select
                className="mt-1 w-full"
                value={status}
                onChange={(e) => setStatus(e.target.value as ReporterFacingStatusEnum)}
              >
                <option value="">상태 선택</option>
                {STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {REPORTER_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Dismiss reason
              <input
                className="mt-1 w-full"
                value={dismissalReason}
                onChange={(e) => setDismissalReason(e.target.value)}
              />
            </label>
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
          <Button variant="ghost" onClick={close} disabled={resolve.isPending}>
            취소
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
