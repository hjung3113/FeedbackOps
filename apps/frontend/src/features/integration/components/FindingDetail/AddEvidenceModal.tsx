import { type ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
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

// ── Add Evidence modal ────────────────────────────────────────────────────────

interface AddEvidenceModalProps {
  findingId: string;
  open: boolean;
  onClose: () => void;
}

const SOURCE_TYPE_OPTIONS: {
  value: EvidenceHighlightSourceType;
  label: string;
}[] = [
  { value: 'voc', label: 'VOC' },
  { value: 'survey_response', label: 'Survey Response' },
  { value: 'note', label: 'Note (manual)' },
];

const SENTIMENT_OPTIONS: {
  value: EvidenceHighlightSentiment;
  label: string;
}[] = [
  { value: 'negative', label: '부정 (Negative)' },
  { value: 'neutral', label: '중립 (Neutral)' },
  { value: 'positive', label: '긍정 (Positive)' },
];

const IMPORTANCE_OPTIONS: {
  value: EvidenceHighlightImportance;
  label: string;
}[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export function AddEvidenceModal({
  findingId,
  open,
  onClose,
}: AddEvidenceModalProps): React.ReactElement {
  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  const form = useForm<AddEvidenceHighlightRequest>({
    resolver: zodResolver(addEvidenceHighlightRequestSchema),
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
          <DialogTitle>Evidence 추가</DialogTitle>
        </DialogHeader>

        <form
          id="add-evidence-form"
          onSubmit={form.handleSubmit(handleSubmit)}
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
              onValueChange={(val) =>
                form.setValue('source_type', val as EvidenceHighlightSourceType, {
                  shouldValidate: true,
                })
              }
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
              {form.formState.errors.source_id?.message && (
                <p className="text-xs text-text-danger" role="alert">
                  {form.formState.errors.source_id.message}
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="ghost" onClick={closeAndReset} disabled={isSubmitting}>
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
