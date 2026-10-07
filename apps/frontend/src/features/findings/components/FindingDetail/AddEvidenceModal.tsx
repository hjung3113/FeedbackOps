import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import {
  EVIDENCE_IMPORTANCE_LABELS,
  EVIDENCE_SENTIMENT_LABELS,
  EVIDENCE_SOURCE_TYPE_LABELS,
} from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { VOC_SOURCE_PICKER_COPY } from '@/lib/copy/voc';
import { koreanZodErrorMap, zodIssueMessage } from '@/lib/forms/zodIssueMessage';
import {
  type AddEvidenceHighlightRequest,
  type EvidenceHighlightImportance,
  type EvidenceHighlightSentiment,
  type EvidenceHighlightSourceType,
  addEvidenceHighlightRequestSchema,
} from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
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
import { zodResolver } from '@hookform/resolvers/zod';
import type * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useAddEvidenceHighlightMutation } from '../../hooks/useEvidenceMutations';
import { VocSourcePicker } from './VocSourcePicker';

// ── Add Evidence modal ────────────────────────────────────────────────────────

interface AddEvidenceModalProps {
  findingId: string;
  managedSystemId: string;
  open: boolean;
  onClose: () => void;
}

const SOURCE_TYPE_OPTIONS: {
  value: EvidenceHighlightSourceType;
  label: string;
}[] = (['voc', 'survey_response', 'note'] as const).map((value) => ({
  value,
  label: EVIDENCE_SOURCE_TYPE_LABELS[value],
}));

const SENTIMENT_OPTIONS: {
  value: EvidenceHighlightSentiment;
  label: string;
}[] = [
  { value: 'negative', label: EVIDENCE_SENTIMENT_LABELS.negative },
  { value: 'neutral', label: EVIDENCE_SENTIMENT_LABELS.neutral },
  { value: 'positive', label: EVIDENCE_SENTIMENT_LABELS.positive },
];

const IMPORTANCE_OPTIONS: {
  value: EvidenceHighlightImportance;
  label: string;
}[] = [
  { value: 'low', label: EVIDENCE_IMPORTANCE_LABELS.low },
  { value: 'medium', label: EVIDENCE_IMPORTANCE_LABELS.medium },
  { value: 'high', label: EVIDENCE_IMPORTANCE_LABELS.high },
];

export function AddEvidenceModal({
  findingId,
  managedSystemId,
  open,
  onClose,
}: AddEvidenceModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<AddEvidenceHighlightRequest>({
    resolver: zodResolver(addEvidenceHighlightRequestSchema, { errorMap: koreanZodErrorMap }),
    defaultValues: {
      source_type: 'note',
      source_id: null,
      quote_or_summary: '',
      sentiment: null,
      importance: null,
    },
    mode: 'onBlur',
  });

  const watchedSourceType = form.watch('source_type');
  const sourceIdError = form.formState.errors.source_id;
  const sourceIdErrorMessage =
    sourceIdError?.type === 'custom'
      ? zodIssueMessage({ code: 'custom', path: ['source_id'] })
      : sourceIdError?.message;

  const mutation = useAddEvidenceHighlightMutation({
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

  function handleSubmit(values: AddEvidenceHighlightRequest): void {
    mutation.mutate(values, {
      onSuccess: () => {
        markConsumed();
        closeAndReset();
        toast.success('Evidence가 추가되었습니다.');
      },
    });
  }

  function handleInvalidSubmit(): void {
    const sourceId = form.getValues('source_id');
    if (form.getValues('source_type') === 'voc' && (sourceId == null || sourceId === '')) {
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
      <DialogContent className="max-w-lg" data-testid="add-evidence-modal">
        <DialogHeader>
          <DialogTitle>{GLOSSARY.addEvidence}</DialogTitle>
        </DialogHeader>

        <form
          id="add-evidence-form"
          onSubmit={form.handleSubmit(handleSubmit, handleInvalidSubmit)}
          noValidate
          className="flex flex-col gap-4"
        >
          {/* Source type */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="evidence-source-type">
              소스 유형
            </FieldLabel>
            <Select
              defaultValue="note"
              onValueChange={(val) => {
                form.setValue('source_type', val as EvidenceHighlightSourceType, {
                  shouldValidate: true,
                });
                form.setValue('source_id', null);
                form.clearErrors('source_id');
              }}
            >
              <SelectTrigger id="evidence-source-type" data-testid="evidence-source-type-select">
                <SelectValue placeholder="소스 유형 선택" />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Source ID — required unless source_type === 'note' */}
          {watchedSourceType !== 'note' && (
            <div className="flex flex-col gap-1.5">
              {watchedSourceType === 'voc' ? (
                <>
                  <FieldLabel required htmlFor="evidence-source-voc">
                    {VOC_SOURCE_PICKER_COPY.label}
                  </FieldLabel>
                  <VocSourcePicker
                    id="evidence-source-voc"
                    managedSystemId={managedSystemId}
                    value={form.watch('source_id') || null}
                    onChange={(vocId) =>
                      form.setValue('source_id', vocId, {
                        shouldValidate: true,
                      })
                    }
                    invalid={Boolean(form.formState.errors.source_id)}
                    {...(form.formState.errors.source_id
                      ? { describedBy: 'evidence-source-voc-error' }
                      : {})}
                  />
                </>
              ) : (
                <>
                  <FieldLabel required htmlFor="evidence-source-id">
                    소스 ID (UUID)
                  </FieldLabel>
                  <Input
                    id="evidence-source-id"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    {...form.register('source_id')}
                    aria-invalid={Boolean(form.formState.errors.source_id)}
                    data-testid="evidence-source-id-input"
                  />
                </>
              )}
              {sourceIdErrorMessage && (
                <p
                  id={watchedSourceType === 'voc' ? 'evidence-source-voc-error' : undefined}
                  className="text-xs text-text-danger"
                  role="alert"
                >
                  {sourceIdErrorMessage}
                </p>
              )}
            </div>
          )}

          {/* Quote or summary */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="evidence-quote">
              인용 / 요약
            </FieldLabel>
            <Textarea
              id="evidence-quote"
              placeholder="핵심 인용문 또는 요약을 입력하세요."
              rows={4}
              {...form.register('quote_or_summary')}
              aria-invalid={Boolean(form.formState.errors.quote_or_summary)}
              data-testid="evidence-quote-input"
            />
            {form.formState.errors.quote_or_summary?.message && (
              <p className="text-xs text-text-danger" role="alert">
                {form.formState.errors.quote_or_summary.message}
              </p>
            )}
          </div>

          {/* Sentiment (optional) */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="evidence-sentiment">감정 (선택)</FieldLabel>
            <Select
              onValueChange={(val) =>
                form.setValue('sentiment', val as EvidenceHighlightSentiment, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="evidence-sentiment" data-testid="evidence-sentiment-select">
                <SelectValue placeholder="선택 안 함" />
              </SelectTrigger>
              <SelectContent>
                {SENTIMENT_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Importance (optional) */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="evidence-importance">중요도 (선택)</FieldLabel>
            <Select
              onValueChange={(val) =>
                form.setValue('importance', val as EvidenceHighlightImportance, {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger id="evidence-importance" data-testid="evidence-importance-select">
                <SelectValue placeholder="선택 안 함" />
              </SelectTrigger>
              <SelectContent>
                {IMPORTANCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </form>

        <DialogFooter spacing="compact">
          <Button type="button" variant="secondary" onClick={closeAndReset} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            type="submit"
            form="add-evidence-form"
            disabled={isSubmitting}
            data-testid="add-evidence-submit"
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
