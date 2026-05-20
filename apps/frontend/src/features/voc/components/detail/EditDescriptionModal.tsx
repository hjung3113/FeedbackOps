// EditDescriptionModal — reporter pre-triage description edit flow.
// Dialog (size lg) + Title input + RichEditor + disabled AttachmentDropzone + footer.
// Consumes useVocEditDescriptionMutation (C6.1).
//
// Prototype mirror: screen-voc-create.jsx:54-84 (Title input + RichEditor wiring
// in a Dialog container instead of a page form). Same FieldLabel density, RichEditor
// surface, dropzone disabled state, and footer button gap as the create form.
//
// C6.2 of slice3 #21.

import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  type EditDescriptionRequest,
  type ErrorEnvelope,
  editDescriptionRequestSchema,
} from '@fops/shared';
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DirtyConfirmation,
  FieldLabel,
  Input,
  RichEditor,
  type TipTapDoc,
} from '@fops/ui';

import type { ApiError } from '@/lib/api';
import { errorMapper } from '@/lib/api';
import { useVocEditDescriptionMutation } from '../../hooks/useVocEditDescriptionMutation';
import { AttachmentDropzone } from '../create/AttachmentDropzone';
import { VocDescriptionToolbar } from '../create/VocDescriptionToolbar';

// ── Props ──────────────────────────────────────────────────────────────────

/** Minimum VOC fields the modal needs at open time. */
export interface EditDescriptionModalVoc {
  id: string;
  title: string;
  updated_at: string;
  description_rich_content?: unknown;
}

export interface EditDescriptionModalProps {
  voc: EditDescriptionModalVoc;
  open: boolean;
  onClose: () => void;
}

// ── Form schema (edit subset) ───────────────────────────────────────────────
// We use the shared editDescriptionRequestSchema so field-level validation
// rules are consistent between client and server.

type EditFormValues = EditDescriptionRequest & {
  // Ensure description_rich_content is typed as TipTapDoc in the form
  description_rich_content?: TipTapDoc;
};

// ── Component ──────────────────────────────────────────────────────────────

export function EditDescriptionModal({
  voc,
  open,
  onClose,
}: EditDescriptionModalProps): React.ReactElement {
  const queryClient = useQueryClient();
  const mutation = useVocEditDescriptionMutation();

  // Track if the user attempted to close while dirty
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editDescriptionRequestSchema),
    defaultValues: {
      title: voc.title,
      description_rich_content: voc.description_rich_content as TipTapDoc,
      attachments: [],
    },
    mode: 'onBlur',
  });

  // Destructure isDirty at render level so react-hook-form subscribes this
  // component to dirty-state changes. Accessing it only inside handleCancel
  // (a callback) would leave the closure stale — RHF requires render-path
  // access to trigger re-renders when isDirty flips.
  const { isDirty } = form.formState;

  // Re-populate defaults whenever the voc changes (e.g. after stale_write refresh).
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally keyed on id+updated_at; voc.title/description change is correlated and form.reset is stable
  React.useEffect(() => {
    form.reset({
      title: voc.title,
      description_rich_content: voc.description_rich_content as TipTapDoc,
      attachments: [],
    });
  }, [voc.id, voc.updated_at]);

  // Propagate server validation.failed errors into form field errors.
  // biome-ignore lint/correctness/useExhaustiveDependencies: form is stable (useForm), mutation.error is the reactive dep
  React.useEffect(() => {
    if (!mutation.error) return;
    const err = mutation.error as ApiError;
    if (err.code === 'validation.failed') {
      const fields = err.detail?.fields;
      if (Array.isArray(fields)) {
        for (const f of fields) {
          if (f && typeof f === 'object') {
            const field = f as { path: Array<string | number>; code: string; message?: string };
            const pathKey = Array.isArray(field.path) ? field.path.join('.') : String(field.path);
            const msg =
              field.message ??
              errorMapper({ code: 'validation.failed', message: '' } as ErrorEnvelope).message;
            form.setError(pathKey as keyof EditFormValues, { message: msg });
          }
        }
      }
    }
  }, [mutation.error]);

  // ── handlers ───────────────────────────────────────────────────────────────

  function handleCancel(): void {
    if (isDirty) {
      setConfirmOpen(true);
    } else {
      closeAndReset();
    }
  }

  function closeAndReset(): void {
    form.reset();
    mutation.reset();
    setConfirmOpen(false);
    onClose();
  }

  function handleSubmit(values: EditFormValues): void {
    mutation.mutate(
      {
        vocId: voc.id,
        ifMatch: voc.updated_at,
        body: {
          title: values.title,
          description_rich_content: values.description_rich_content,
          attachments: values.attachments ?? [],
        },
      },
      {
        onSuccess: () => {
          form.reset();
          mutation.reset();
          void queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
          toast.success('설명이 수정되었습니다.');
          onClose();
        },
        onError: (err: ApiError) => {
          const code = err.code;
          // Close-modal codes: triage_already_committed, parent_archived, record_archived
          if (
            code === 'conflict.triage_already_committed' ||
            code === 'conflict.parent_archived' ||
            code === 'conflict.record_archived'
          ) {
            const mapped = errorMapper(err.envelope);
            if (mapped.tone === 'warning') toast.warning(mapped.message);
            else toast.error(mapped.message);
            closeAndReset();
            return;
          }
          // stale_write: keep modal open; caller re-reads voc.updated_at on next query refresh
          if (code === 'conflict.stale_write') {
            toast.warning(errorMapper(err.envelope).message);
            return;
          }
          // validation.failed: handled via useEffect → form.setError
          // rich_content.*: surface top-level error message
          if (code?.startsWith('rich_content.')) {
            toast.error(errorMapper(err.envelope).message);
            return;
          }
          // fallback
          toast.error(errorMapper(err.envelope).message);
        },
      },
    );
  }

  const isSubmitting = mutation.isPending;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleCancel();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>설명 수정</DialogTitle>
          </DialogHeader>

          <form
            id="edit-description-form"
            onSubmit={form.handleSubmit(handleSubmit)}
            noValidate
            className="flex flex-col gap-4"
          >
            {/* Title ─────────────────────────────────────────────────────── */}
            {/* Prototype screen-voc-create.jsx:54-62: FieldLabel required + input height-36 */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel required htmlFor="edit-title">
                제목
              </FieldLabel>
              <Input
                id="edit-title"
                placeholder="간단히 어떤 문제 / 요청인가요?"
                {...form.register('title')}
                aria-invalid={Boolean(form.formState.errors.title)}
              />
              {form.formState.errors.title?.message && (
                <p className="text-xs text-text-danger" role="alert">
                  {form.formState.errors.title.message}
                </p>
              )}
            </div>

            {/* Body ──────────────────────────────────────────────────────── */}
            {/* Prototype screen-voc-create.jsx:67-84: FieldLabel required + RichEditor surface voc-description */}
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                required
                htmlFor="edit-description"
                tip="언제·어디서·어떤 상황에서 발생했는지, 재현 방법과 기대 동작을 적어주세요."
              >
                상세 설명
              </FieldLabel>
              <Controller
                control={form.control}
                name="description_rich_content"
                render={({ field }) => (
                  <RichEditor
                    surface="voc-description"
                    value={field.value as TipTapDoc}
                    onChange={(doc) => field.onChange(doc)}
                    placeholder="재현 방법과 기대 동작도 함께 적어주세요."
                    minHeight={160}
                    toolbar={VocDescriptionToolbar}
                  />
                )}
              />
              {typeof form.formState.errors.description_rich_content?.message === 'string' && (
                <p className="text-xs text-text-danger" role="alert">
                  {form.formState.errors.description_rich_content.message}
                </p>
              )}
            </div>

            {/* Attachments (disabled — upload deferred to #22) ───────────── */}
            <AttachmentDropzone disabled testId="edit-attachment-dropzone" />
          </form>

          {/* Footer ───────────────────────────────────────────────────────── */}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" onClick={handleCancel} disabled={isSubmitting}>
              취소
            </Button>
            <Button type="submit" form="edit-description-form" disabled={isSubmitting}>
              수정 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dirty-state confirmation when the user attempts to close ────────── */}
      <DirtyConfirmation
        open={confirmOpen}
        onConfirm={closeAndReset}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
