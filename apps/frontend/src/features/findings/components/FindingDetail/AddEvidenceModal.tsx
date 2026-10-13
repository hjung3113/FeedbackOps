import { ApiError, errorMapper, useIdempotencyKey } from '@/lib/api';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import {
  EVIDENCE_IMPORTANCE_LABELS,
  EVIDENCE_SENTIMENT_LABELS,
  EVIDENCE_SOURCE_TYPE_LABELS,
} from '@/lib/copy/enum-labels';
import { GLOSSARY } from '@/lib/copy/glossary';
import { SURVEY_EVIDENCE_PICKER_COPY as SURVEY_COPY } from '@/lib/copy/survey-evidence-picker';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@fops/ui';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import type * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  useAddEvidenceHighlightMutation,
  useAttachSurveyEvidenceMutation,
} from '../../hooks/useEvidenceMutations';
import { surveyEvidenceCandidatesKey } from '../../hooks/useSurveyEvidence';
import { SurveyEvidencePicker } from './SurveyEvidencePicker';
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
  const queryClient = useQueryClient();
  const surveyMutation = useAttachSurveyEvidenceMutation(findingId);
  const [surveyPending, setSurveyPending] = useState(false);
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [approvedExcerptId, setApprovedExcerptId] = useState<string | null>(null);
  const [surveyError, setSurveyError] = useState<string | null>(null);
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  const submitting = useRef(false);
  const session = useRef(0);
  const submitButton = useRef<HTMLButtonElement>(null);
  const surveyErrorAlert = useRef<HTMLParagraphElement>(null);

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
    session.current += 1;
    form.reset();
    setSurveyId(null);
    setApprovedExcerptId(null);
    setSurveyError(null);
    attempt.current = null;
    surveyMutation.reset();
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

  // FullFindingDetail keeps this modal mounted while closed.
  useEffect(() => {
    if (!open) {
      session.current += 1;
      form.reset();
      setSurveyId(null);
      setApprovedExcerptId(null);
      setSurveyError(null);
      attempt.current = null;
    }
    return () => {
      session.current += 1;
    };
  }, [open, form]);

  function changeSelection(id: string | null): void {
    if (id !== approvedExcerptId) {
      setApprovedExcerptId(id);
      attempt.current = null;
    }
  }

  async function submitSurvey(): Promise<void> {
    if (approvedExcerptId === null || submitting.current) return;
    const body = {
      approved_excerpt_id: approvedExcerptId,
      sentiment: form.getValues('sentiment') ?? null,
      importance: form.getValues('importance') ?? null,
    };
    const signature = JSON.stringify([findingId, body]);
    if (attempt.current?.signature !== signature) {
      attempt.current = { signature, key: mintIdempotencyKey() };
    }
    submitting.current = true;
    setSurveyPending(true);
    const currentSession = session.current;
    setSurveyError(null);
    try {
      await surveyMutation.mutateAsync({ body, idempotencyKey: attempt.current.key });
      if (session.current === currentSession) {
        closeAndReset();
        toast.success(SURVEY_COPY.success);
      }
    } catch (error) {
      if (session.current !== currentSession) return;
      if (error instanceof ApiError && [404, 422].includes(error.status)) {
        changeSelection(null);
        setSurveyError(SURVEY_COPY.revoked);
        await queryClient.resetQueries({ queryKey: surveyEvidenceCandidatesKey(surveyId) });
      } else {
        setSurveyError(SURVEY_COPY.attachError);
      }
    } finally {
      submitting.current = false;
      setSurveyPending(false);
    }
  }

  const isSubmitting = mutation.isPending || surveyPending;
  useEffect(() => {
    if (!open || isSubmitting) return;
    if (surveyError) surveyErrorAlert.current?.focus();
    else if (mutation.isError) submitButton.current?.focus();
  }, [open, isSubmitting, surveyError, mutation.isError]);

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
          onSubmit={(event) => {
            if (watchedSourceType === 'survey_response') {
              event.preventDefault();
              void submitSurvey();
            } else {
              void form.handleSubmit(handleSubmit, handleInvalidSubmit)(event);
            }
          }}
          noValidate
          className="flex min-w-0 flex-col gap-4"
        >
          {/* Source type */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel required htmlFor="evidence-source-type">
              소스 유형
            </FieldLabel>
            <Select
              value={watchedSourceType}
              disabled={isSubmitting}
              onValueChange={(val) => {
                form.setValue('source_type', val as EvidenceHighlightSourceType, {
                  shouldValidate: true,
                });
                form.setValue('source_id', null);
                setSurveyId(null);
                changeSelection(null);
                setSurveyError(null);
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

          {watchedSourceType === 'voc' && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel required htmlFor="evidence-source-voc">
                {VOC_SOURCE_PICKER_COPY.label}
              </FieldLabel>
              <VocSourcePicker
                id="evidence-source-voc"
                managedSystemId={managedSystemId}
                value={form.watch('source_id') || null}
                onChange={(vocId) => form.setValue('source_id', vocId, { shouldValidate: true })}
                invalid={Boolean(sourceIdError)}
                {...(sourceIdError ? { describedBy: 'evidence-source-voc-error' } : {})}
              />
              {sourceIdErrorMessage && (
                <p id="evidence-source-voc-error" className="text-xs text-text-danger" role="alert">
                  {sourceIdErrorMessage}
                </p>
              )}
            </div>
          )}
          {watchedSourceType === 'survey_response' && (
            <>
              <SurveyEvidencePicker
                managedSystemId={managedSystemId}
                surveyId={surveyId}
                value={approvedExcerptId}
                disabled={isSubmitting}
                onSurveyChange={(id) => {
                  if (id !== surveyId) {
                    setSurveyId(id);
                    changeSelection(null);
                    setSurveyError(null);
                  }
                }}
                onChange={changeSelection}
              />
              {surveyError && (
                <p
                  ref={surveyErrorAlert}
                  role="alert"
                  tabIndex={-1}
                  className="text-xs text-text-danger"
                >
                  {surveyError}
                </p>
              )}
            </>
          )}

          {/* Survey excerpts are read-only and copied by the server. */}
          {watchedSourceType !== 'survey_response' && (
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
          )}

          {/* Sentiment (optional) */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="evidence-sentiment">감정 (선택)</FieldLabel>
            <Select
              disabled={isSubmitting}
              value={form.watch('sentiment') ?? ''}
              onValueChange={(val) => {
                if (form.getValues('sentiment') !== val) attempt.current = null;
                form.setValue('sentiment', val as EvidenceHighlightSentiment, {
                  shouldValidate: true,
                });
              }}
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
              disabled={isSubmitting}
              value={form.watch('importance') ?? ''}
              onValueChange={(val) => {
                if (form.getValues('importance') !== val) attempt.current = null;
                form.setValue('importance', val as EvidenceHighlightImportance, {
                  shouldValidate: true,
                });
              }}
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
            ref={submitButton}
            type="submit"
            form="add-evidence-form"
            disabled={
              isSubmitting ||
              (watchedSourceType === 'survey_response' && approvedExcerptId === null)
            }
            data-testid="add-evidence-submit"
          >
            추가
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
