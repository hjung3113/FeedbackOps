import { fetchAnalyticsAreas, fetchManagedSystems } from '@/lib/api';
import { errorMapper } from '@/lib/api';
import { useIdempotencyKey } from '@/lib/api';
import type { ApiError, ApiErrorEnvelope } from '@/lib/api';
import { createVocRequestSchema, emptyTipTapDoc } from '@fops/shared';
import type { CreateVocRequest } from '@fops/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { useVocCreateMutation } from '../../hooks/useVocCreateMutation';

export function useVocCreateController({
  initialManagedSystemId,
  onDirtyChange,
}: {
  initialManagedSystemId?: string;
  onDirtyChange?: (isDirty: boolean) => void;
}) {
  const navigate = useNavigate();

  const form = useForm<CreateVocRequest>({
    resolver: zodResolver(createVocRequestSchema),
    defaultValues: {
      primary_managed_system_id: initialManagedSystemId ?? '',
      title: '',
      description_rich_content: emptyTipTapDoc(),
      analytics_area_id: undefined,
      source_context: 'direct_use',
      // PLAN-22 C7b: wire shape renamed `attachments` → `attachment_ids`.
      // C7a will wire the dropzone state through here.
      attachment_ids: [],
    },
    mode: 'onBlur',
  });

  // Notify parent of dirty state changes so CreateRoute can drive useBlocker.
  const isDirty = form.formState.isDirty;
  React.useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const { key: idempotencyKey, markConsumed } = useIdempotencyKey();

  // C6: track server-side attachment ids + whether any row is mid-upload.
  // We do NOT use react-hook-form state for these because the AttachmentDropzone
  // is the source of truth (it owns per-row state machine + Idempotency-Keys).
  const [attachmentIds, setAttachmentIds] = React.useState<string[]>([]);
  const [attachmentsUploading, setAttachmentsUploading] = React.useState(false);
  // PLAN-22 §Bug-3 (2026-05-22): error rows block submit AND surface a visible
  // inline alert above the action bar. Without this users hit "submit looks
  // disabled with no explanation" when they drop an oversize/unsupported file.
  const [attachmentErrorCount, setAttachmentErrorCount] = React.useState(0);
  const hasAttachmentErrors = attachmentErrorCount > 0;

  const mutation = useVocCreateMutation({
    idempotencyKey,
    onSuccess: (data) => {
      toast.success(`${data.display_id}을 접수했습니다.`);
      markConsumed();
      form.reset(form.getValues()); // clear dirty so DirtyConfirmation won't fire
      // Synchronously notify the route (which holds the blocker ref) that the
      // form is no longer dirty BEFORE triggering the navigate. The
      // useEffect-driven sync below would not have propagated by the time
      // useBlocker.shouldBlockFn runs against this navigation intent.
      onDirtyChange?.(false);
      void navigate({ to: '/vocs', search: { view: 'my', selected: data.id } });
    },
    onError: (err: ApiError) => {
      // 1. validation.failed with detail.fields → form.setError per field
      // BE shape (apps/backend/src/lib/errors.ts:60): detail.fields = Array<{ path: string[], code: string }>
      if (err.code === 'validation.failed') {
        const fields = err.detail?.['fields'];
        if (Array.isArray(fields)) {
          let mapped = false;
          for (const f of fields) {
            if (
              f &&
              typeof f === 'object' &&
              Array.isArray((f as Record<string, unknown>)['path'])
            ) {
              const field = f as { path: Array<string | number>; code: string; message?: string };
              const fieldPath = field.path.join('.');
              const msg =
                field.message ??
                errorMapper({ code: 'validation.failed', message: '' } as ApiErrorEnvelope).message;
              form.setError(fieldPath as keyof CreateVocRequest, { message: msg });
              mapped = true;
            }
          }
          if (mapped) return;
        }
      }
      // 2. everything else → top toast via errorMapper
      const m = errorMapper(err.envelope);
      if (m.tone === 'warning') toast.warning(m.message);
      else if (m.tone === 'info') toast.info(m.message);
      else toast.error(m.message);
    },
  });

  // ── Managed Systems query ─────────────────────────────────────────────────
  const msQuery = useQuery({
    queryKey: ['managed-systems', { includeArchived: false }],
    queryFn: ({ signal }) => fetchManagedSystems({ includeArchived: false, signal }),
  });

  const selectedMs = form.watch('primary_managed_system_id');

  // ── Analytics Areas query (disabled until MS selected) ───────────────────
  const aaQuery = useQuery({
    queryKey: ['analytics-areas', { managedSystemId: selectedMs, includeArchived: false }],
    queryFn: ({ signal }) =>
      fetchAnalyticsAreas({ managedSystemId: selectedMs, includeArchived: false, signal }),
    enabled: Boolean(selectedMs),
  });

  // Clear analytics_area_id when MS changes to prevent stale selection
  const prevMsRef = React.useRef(selectedMs);
  React.useEffect(() => {
    if (prevMsRef.current !== selectedMs) {
      prevMsRef.current = selectedMs;
      form.setValue('analytics_area_id', undefined);
    }
  }, [selectedMs, form]);

  const msOptions = (msQuery.data?.items ?? []).map((ms) => ({
    id: ms.id,
    label: ms.name,
    archived: ms.archived_at !== null,
  }));

  const aaOptions = (aaQuery.data?.items ?? []).map((aa) => ({
    id: aa.id,
    label: aa.name,
    archived: aa.archived_at !== null,
  }));

  const isSubmitting = mutation.isPending;

  function handleSubmit(body: CreateVocRequest): void {
    // C6: include attachment_ids[] for successfully-uploaded rows. The
    // shared CreateVocRequest schema still carries the legacy `attachments`
    // shape (AttachmentRef[]) which C7 will reconcile to id-only; until then
    // we attach the id-list as an extra field passed through to the wire.
    const withAttachments = { ...body, attachment_ids: attachmentIds } as CreateVocRequest & {
      attachment_ids: string[];
    };
    mutation.mutate(withAttachments);
  }

  function handleAttachmentError(err: unknown): void {
    const msg = err instanceof Error ? err.message : '첨부 업로드에 실패했습니다';
    toast.error(msg);
  }

  return {
    form,
    msQuery,
    selectedMs,
    aaQuery,
    msOptions,
    aaOptions,
    isSubmitting,
    attachmentsUploading,
    hasAttachmentErrors,
    setAttachmentIds,
    setAttachmentsUploading,
    setAttachmentErrorCount,
    handleSubmit,
    handleAttachmentError,
  };
}
