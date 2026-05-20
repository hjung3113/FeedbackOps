// EditDescriptionModal — reporter pre-triage description edit flow.
// Dialog (size lg) + Title input + RichEditor + disabled AttachmentDropzone + footer.
// Consumes useVocEditDescriptionMutation (C6.1).
//
// Prototype mirror: screen-voc-create.jsx:54-84 (Title input + RichEditor wiring
// in a Dialog container instead of a page form). Same FieldLabel density, RichEditor
// surface, dropzone disabled state, and footer button gap as the create form.
//
// C6.2 of slice3 #21.
// REV-1 #8: stale_write now invalidates ['voc', id] so the modal re-opens with fresh
//           data and a new If-Match baseline. Toast "VOC가 변경되었습니다…" is shown.

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

  // REV-2 #8: do NOT auto-reset the form when voc.updated_at changes.
  // A stale_write refetch lands while the user may still be typing — auto-reset
  // would clobber their edits. Instead, only reset when voc.id changes (the
  // modal is being reused for a different VOC entirely) and otherwise leave
  // the user's in-progress edits intact. The stale_write toast carries a
  // "다시 불러오기" action that explicitly resets the form to the refreshed
  // VOC defaults (handleReloadFromVoc, below).
  // Keep the latest voc in a ref so the toast action button (created inside
  // mutation.onError, which runs outside the React render lifecycle) always
  // resets to the most recently refetched defaults.
  const vocRef = React.useRef(voc);
  vocRef.current = voc;

  // biome-ignore lint/correctness/useExhaustiveDependencies: only reset when the modal hosts a different VOC; form.reset is stable
  React.useEffect(() => {
    form.reset({
      title: voc.title,
      description_rich_content: voc.description_rich_content as TipTapDoc,
      attachments: [],
    });
    // Intentionally only voc.id — updated_at change must NOT auto-reset.
  }, [voc.id]);

  // REV-3 Cluster W: the 다시 불러오기 action must AWAIT a refetch before
  // resetting the form. The prior implementation reset from `vocRef.current`,
  // which lagged the refetch — clicks landing between the stale_write toast
  // and the refetch arrival reset to the OLD voc values, defeating the
  // purpose of the action.
  const handleReloadFromVoc = React.useCallback(async () => {
    try {
      await queryClient.refetchQueries({ queryKey: ['voc', voc.id] });
    } catch {
      // If refetch itself failed (offline, etc.), fall back to whatever
      // vocRef currently holds — still better than a stuck modal.
    }
    const cached = queryClient.getQueryData<EditDescriptionModalVoc>(['voc', voc.id]);
    const fresh = cached ?? vocRef.current;
    form.reset({
      title: fresh.title,
      description_rich_content: fresh.description_rich_content as TipTapDoc,
      attachments: [],
    });
  }, [form, queryClient, voc.id]);

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
          // REV-1 #8 + REV-2 #8: stale_write — invalidate ['voc', id] so the
          // detail query refetches with the new updated_at (If-Match baseline).
          // The modal does NOT auto-reset; the toast carries a "다시 불러오기"
          // action so user edits made between the 409 and the refetch aren't
          // clobbered. The user clicks the action when they're ready to
          // restart from the refreshed defaults.
          if (code === 'conflict.stale_write') {
            void queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
            toast.warning('VOC가 변경되었습니다. 편집 중인 내용을 잃지 않으려면 [다시 불러오기]를 눌러 새로 시작하세요.', {
              duration: 10000,
              action: {
                label: '다시 불러오기',
                onClick: handleReloadFromVoc,
              },
            });
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
