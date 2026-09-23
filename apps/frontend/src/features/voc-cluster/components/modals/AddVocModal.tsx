// Add an existing VOC to a VOC Cluster. Mounted only when the detail panel is
// canMutate — useCandidatePeers fetches on clusterId alone, so an always-mounted
// modal would query candidates behind every role and loading state.

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  OutlineBadge,
  Skeleton,
} from '@fops/ui';
import type * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useAddClusterMember } from '@/features/voc-cluster/hooks/useAddClusterMember';
import { useCandidatePeers } from '@/features/voc-cluster/hooks/useCandidatePeers';
import { type ApiError, errorMapper } from '@/lib/api';

import { shortId } from '../../lib/presentation';
import type { VocClusterMemberPresentation } from '../types';

export function AddVocModal({
  open,
  clusterId,
  members,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  members: VocClusterMemberPresentation[];
  onClose: () => void;
}): React.ReactElement {
  const [vocId, setVocId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useAddClusterMember();
  const candidatePeers = useCandidatePeers(clusterId);
  const candidates = [
    ...members.map((member) => ({
      voc_id: member.voc_id,
      display_id: member.display_id ?? shortId(member.voc_id),
      title: member.title ?? 'VOC',
      severity: member.severity,
      reporter_facing_status: member.reporter_facing_status,
      included: true,
    })),
    ...(candidatePeers.data?.candidates ?? [])
      .filter((candidate) => !members.some((member) => member.voc_id === candidate.voc_id))
      .map((candidate) => ({ ...candidate, included: false })),
  ];

  function closeAndReset() {
    setVocId('');
    setError(null);
    mutation.reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutation.mutate(
      { clusterId, vocId },
      {
        onSuccess: () => {
          toast.success('VOC가 클러스터에 추가되었습니다.');
          closeAndReset();
        },
        onError: (err: ApiError) => {
          const msg = errorMapper(err.envelope).message;
          setError(msg);
          toast.error(msg);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent data-testid="add-voc-modal">
        <DialogHeader>
          <DialogTitle>VOC 추가</DialogTitle>
        </DialogHeader>
        <form
          id="add-voc-form"
          data-testid="add-voc-form"
          className="flex flex-col gap-4"
          onSubmit={handleSubmit}
        >
          <div className="flex flex-col gap-1.5">
            <Label className="text-text-secondary">
              추가할 VOC <span aria-hidden>*</span>
            </Label>
            {candidatePeers.isLoading ? (
              <Skeleton className="h-9 w-full" data-testid="candidate-peers-loading" />
            ) : candidatePeers.isError ? (
              <p className="text-sm text-accent-danger" data-testid="candidate-peers-error">
                추가 가능한 VOC를 불러오지 못했습니다.
              </p>
            ) : (
              <div className="flex flex-col gap-1" data-testid="add-voc-candidates">
                {candidates.map((candidate) => (
                  <Button
                    key={candidate.voc_id}
                    type="button"
                    variant={vocId === candidate.voc_id ? 'secondary' : 'outline'}
                    size="sm"
                    disabled={candidate.included}
                    onClick={() => setVocId(candidate.voc_id)}
                    data-testid={`add-voc-candidate-${candidate.voc_id}`}
                    className="justify-start"
                  >
                    {candidate.display_id} · {candidate.title} · {candidate.severity ?? '미지정'} ·{' '}
                    {candidate.reporter_facing_status}
                    {candidate.included && (
                      <OutlineBadge data-testid={`add-voc-included-${candidate.voc_id}`}>
                        이미 포함됨
                      </OutlineBadge>
                    )}
                  </Button>
                ))}
              </div>
            )}
          </div>
          {error && (
            <p data-testid="add-voc-error" className="text-sm text-accent-danger">
              {error}
            </p>
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={closeAndReset}
            disabled={mutation.isPending}
            data-testid="add-voc-cancel"
          >
            취소
          </Button>
          <Button
            type="submit"
            form="add-voc-form"
            disabled={mutation.isPending || !vocId}
            data-testid="add-voc-submit"
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
