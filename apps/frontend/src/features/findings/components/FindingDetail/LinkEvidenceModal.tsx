import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import { VOC_SOURCE_PICKER_COPY } from '@/lib/copy/voc';
import { koreanZodErrorMap } from '@/lib/forms/zodIssueMessage';
import { type LinkEvidenceRequest, linkEvidenceRequestSchema } from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FieldLabel,
} from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useLinkEvidenceMutation } from '../../hooks/useEvidenceMutations';
import { VocSourcePicker } from './VocSourcePicker';

// ── Link Existing Evidence modal ──────────────────────────────────────────────

interface LinkEvidenceModalProps {
  findingId: string;
  managedSystemId: string;
  open: boolean;
  onClose: () => void;
}

export function LinkEvidenceModal({
  findingId,
  managedSystemId,
  open,
  onClose,
}: LinkEvidenceModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<LinkEvidenceRequest>({
    resolver: zodResolver(linkEvidenceRequestSchema, { errorMap: koreanZodErrorMap }),
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

  function handleInvalidSubmit(): void {
    if (form.getValues('source_id') === '') {
      form.setError('source_id', {
        type: 'required',
        message: VOC_SOURCE_PICKER_COPY.required,
      });
    }
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
          onSubmit={form.handleSubmit(handleSubmit, handleInvalidSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* VOC source */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="link-source-voc">
              {VOC_SOURCE_PICKER_COPY.label}
            </FieldLabel>
            <VocSourcePicker
              id="link-source-voc"
              managedSystemId={managedSystemId}
              value={form.watch('source_id') || null}
              onChange={(vocId) =>
                form.setValue('source_id', vocId, {
                  shouldValidate: true,
                })
              }
              invalid={Boolean(form.formState.errors.source_id)}
              {...(form.formState.errors.source_id ? { describedBy: 'link-source-voc-error' } : {})}
            />
            {form.formState.errors.source_id?.message && (
              <p id="link-source-voc-error" className="text-xs text-text-danger" role="alert">
                {form.formState.errors.source_id.message}
              </p>
            )}
          </div>

          <p className="text-xs text-text-muted">현재 VOC 소스만 연결할 수 있습니다.</p>
        </form>

        <DialogFooter spacing="compact">
          <Button type="button" variant="secondary" onClick={closeAndReset} disabled={isSubmitting}>
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
