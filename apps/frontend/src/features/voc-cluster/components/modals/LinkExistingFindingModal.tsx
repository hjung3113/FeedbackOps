// Link an existing Finding to a VOC Cluster. Mounted only when the detail panel
// is canMutate (the `open` prop only toggles the dialog's own visibility) —
// useFindingsList has no `enabled` flag, so mounting this for every role and
// loading state would run the picker query for users who can never open it.

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
} from '@fops/ui';
import type * as React from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { useFindingsList } from '@/features/findings/hooks/useFindingsList';
import { useLinkExistingFindingToVocCluster } from '@/features/voc-cluster/hooks/useLinkExistingFindingToVocCluster';
import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';

export function LinkExistingFindingModal({
  open,
  clusterId,
  onClose,
}: {
  open: boolean;
  clusterId: string;
  onClose: () => void;
}): React.ReactElement {
  const [findingId, setFindingId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const findings = useFindingsList();
  const { key, markConsumed } = useIdempotencyKey();
  const mutation = useLinkExistingFindingToVocCluster({ idempotencyKey: key });
  function closeAndReset() {
    setFindingId('');
    setError(null);
    mutation.reset();
    onClose();
  }
  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    mutation.mutate(
      { clusterId, findingId },
      {
        onSuccess: () => {
          markConsumed();
          toast.success('Finding이 클러스터에 연결되었습니다.');
          closeAndReset();
        },
        onError: (err: ApiError) => {
          const message = errorMapper(err.envelope).message;
          setError(message);
          toast.error(message);
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
      <DialogContent data-testid="link-existing-finding-modal">
        <DialogHeader>
          <DialogTitle>기존 Finding 연결</DialogTitle>
        </DialogHeader>
        <form
          id="link-existing-finding-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <Label htmlFor="cluster-finding-picker">Finding</Label>
          {findings.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : findings.isError ? (
            <p className="text-sm text-accent-danger">연결 가능한 Finding을 불러오지 못했습니다.</p>
          ) : (
            <select
              id="cluster-finding-picker"
              required
              value={findingId}
              onChange={(event) => setFindingId(event.target.value)}
              data-testid="link-existing-finding-picker"
              className="h-9 w-full rounded-md border border-border-default bg-surface-field px-3 py-1 text-sm text-text-primary"
            >
              <option value="">연결할 Finding을 선택하세요.</option>
              {(findings.data?.items ?? []).map((finding) => (
                <option key={finding.id} value={finding.id}>
                  {finding.display_id} · {finding.title}
                </option>
              ))}
            </select>
          )}
          {error && (
            <p data-testid="link-existing-finding-error" className="text-sm text-accent-danger">
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
          >
            취소
          </Button>
          <Button
            type="submit"
            form="link-existing-finding-form"
            disabled={mutation.isPending || !findingId}
            data-testid="link-existing-finding-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
