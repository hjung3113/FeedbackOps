import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import { type LinkEvidenceRequest, linkEvidenceRequestSchema } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
  Input,
} from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useLinkEvidenceMutation } from '../../hooks/useEvidenceMutations';

// ── Link Existing Evidence modal ──────────────────────────────────────────────

interface LinkEvidenceModalProps {
  findingId: string;
  open: boolean;
  onClose: () => void;
}

export function LinkEvidenceModal({
  findingId,
  open,
  onClose,
}: LinkEvidenceModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<LinkEvidenceRequest>({
    resolver: zodResolver(linkEvidenceRequestSchema),
    defaultValues: {
      source_type: 'voc',
      source_id: '',
    },
    mode: 'onBlur',
  });

  const mutation = useLinkEvidenceMutation({
    findingId,
    idempotencyKey,
    onError: (err: ApiError) => {
      toast.error(errorMapper(err.envelope).message);
    },
  });

  function closeAndReset(): void {
    form.reset();
    mutation.reset();
    onClose();
  }

  function handleSubmit(values: LinkEvidenceRequest): void {
    mutation.mutate(values, {
      onSuccess: () => {
        markConsumed();
        closeAndReset();
        toast.success('Evidence가 연결되었습니다.');
      },
    });
  }

  const isSubmitting = mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) closeAndReset();
      }}
    >
      <DialogContent className="max-w-lg" data-testid="link-evidence-modal">
        <DialogHeader>
          <DialogTitle>기존 Evidence 연결</DialogTitle>
        </DialogHeader>

        <form
          id="link-evidence-form"
          onSubmit={form.handleSubmit(handleSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Source ID */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="link-source-id">
              VOC ID (UUID)
            </FieldLabel>
            <Input
              id="link-source-id"
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              {...form.register('source_id')}
              aria-invalid={Boolean(form.formState.errors.source_id)}
              data-testid="link-evidence-source-id-input"
            />
            {form.formState.errors.source_id?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.source_id.message}
              </p>
            )}
          </div>

          <p className="text-xs text-text-muted">
            현재 VOC 소스만 연결할 수 있습니다. (source_type: voc)
          </p>
        </form>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            type="submit"
            form="link-evidence-form"
            disabled={isSubmitting}
            data-testid="link-evidence-submit"
          >
            연결
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
