// ReporterReplyComposer — reporter-reply tab body for <ComposerSection>.
//
// C5.3 (slice3 #21) — initial implementation
// C5.5 (slice3 #21) — PreviewModal wire-up + error matrix (gate_blocked amber Callout,
//                     idempotency_key_reuse locks submit + preview)
//
// Spec: PLAN-21-SUBCHUNKS.md C5.3 / C5.5
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (reply variant)
//               docs/design-prototype/screen-voc.jsx:486-504 (PreviewModal mount)
//
// Verbatim prototype JSX (lines 415-468, Pack 17 translation, reply variant):
//
//   <RichEditor
//     surface="reporter-reply"
//     key={composerTab}
//     minHeight={84}
//     onChange={setReplyDraft}
//   />
//   <div className="composer-footer">
//     <div className="composer-status-row">
//       <span className="text-xs muted">공개 타임라인에 기록됨</span>
//     </div>
//     <div className="hstack">
//       <button className="btn btn-subtle btn-sm" onClick={() => setPreviewOpen(true)}>
//         <Icon name="expand" size={11} />Preview
//       </button>
//       <Button variant="primary" size="sm">Send reply</Button>
//     </div>
//   </div>
//
// No ReporterStatusChangeBlock on this surface (reply is body-only, no status change).
//
// Submit endpoint: POST /vocs/:id/reporter-replies
// On success: invalidate ['voc', voc.id], clear draft, toast 리포터에게 답장이 전송되었습니다.
//
// Error matrix (D-5.6: Callout copy sourced from backend detail.reason, not errorMapper):
//   reporter_facing_status.gate_blocked → amber Callout inline
//   conflict.idempotency_key_reuse      → lock Submit + Preview until VOC switch

import { useVocReporterReplyMutation } from '@/features/voc/hooks/useVocReporterReplyMutation';
import type { ApiError } from '@/lib/api';
import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { Callout, PreviewModal, RichEditor } from '@fops/ui';
import type { TipTapDoc } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ComposerFooter } from './ComposerFooter';
import { ComposerReplyPreview } from './ComposerReplyPreview';
import { uploadAttachment } from '@/lib/api/attachments';
import { ReporterReplyToolbar } from './rich-toolbars/ReporterReplyToolbar';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ReporterReplyComposerProps {
  voc: VocDetailEnvelope;
  me: MeResponse | null | undefined;
  /** REV-1 #7: controlled draft doc from parent ComposerSection. */
  draftDoc?: TipTapDoc | null;
  /** REV-1 #7: called when the editor content changes. */
  onDraftChange?: (doc: TipTapDoc | null) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isDocEmpty(doc: TipTapDoc | null): boolean {
  if (doc == null) return true;
  const content = doc.content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((node) => {
    if (node == null || typeof node !== 'object') return true;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type !== 'paragraph') return false;
    return !Array.isArray(n.content) || n.content.length === 0;
  });
}

// Maps ApiError code to Callout tone for the inline error surface.
function getComposerErrorTone(code: string): 'amber' | null {
  if (code === 'reporter_facing_status.gate_blocked') return 'amber';
  // invalid_transition is primarily a public-update error; treat as amber fallback on reply surface.
  if (code === 'reporter_facing_status.invalid_transition') return 'amber';
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReporterReplyComposer({ voc, me, draftDoc: controlledDraftDoc, onDraftChange }: ReporterReplyComposerProps): ReactElement {
  const queryClient = useQueryClient();

  // REV-1 #7: controlled draft support.
  const isControlled = controlledDraftDoc !== undefined;
  const [localDraftDoc, setLocalDraftDoc] = useState<TipTapDoc | null>(null);
  const draftDoc = isControlled ? (controlledDraftDoc ?? null) : localDraftDoc;

  function setDraftDoc(doc: TipTapDoc | null) {
    if (isControlled) {
      onDraftChange?.(doc);
    } else {
      setLocalDraftDoc(doc);
    }
  }

  const [previewOpen, setPreviewOpen] = useState(false);

  // Reset state when VOC changes (preview; draft reset handled by parent for controlled).
  const prevVocIdRef = useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    if (!isControlled) {
      setLocalDraftDoc(null);
    }
    setPreviewOpen(false);
  }

  const isEmpty = isDocEmpty(draftDoc);

  const mutation = useVocReporterReplyMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
      setDraftDoc(null); // calls onDraftChange?.(null) when controlled
      toast.success('리포터에게 답장이 전송되었습니다.');
    },
  });

  function handleSubmit() {
    if (!draftDoc) return;
    mutation.mutate({
      vocId: voc.id,
      ifMatch: voc.updated_at,
      body: {
        body_rich_content: draftDoc,
        attachments: [],
      },
    });
  }

  // Status hint — prototype: "공개 타임라인에 기록됨" for reply surface
  const statusHint = <span className="text-xs text-text-muted">공개 타임라인에 기록됨</span>;

  // ── Error matrix ─────────────────────────────────────────────────────────────
  const mutationError = mutation.error as ApiError | null;
  const isIdempotencyLocked =
    mutationError != null && mutationError.code === 'conflict.idempotency_key_reuse';

  const inlineCalloutTone = mutationError != null ? getComposerErrorTone(mutationError.code) : null;
  const inlineCalloutReason =
    inlineCalloutTone != null
      ? ((mutationError?.detail?.reason as string | undefined) ?? mutationError?.message)
      : null;

  // Owner for preview card — priority: actor from me, then fallback.
  const owner = {
    id: me?.actor.id ?? '',
    display_name: me?.actor.display_name ?? '—',
  };
  // Reporter identity — use VOC reporter context (display_name not on envelope; use fallback).
  const reporter = {
    id: voc.reporter_id,
    display_name: 'Reporter',
  };

  return (
    <div data-testid="reporter-reply-composer">
      {/* RichEditor with ReporterReplyToolbar — prototype: minHeight 84px */}
      <RichEditor
        surface="reporter-reply"
        // REV-3 Cluster Z: explicit value (null = clear).
        value={draftDoc}
        onChange={(doc) => setDraftDoc(doc)}
        placeholder="리포터에게 보낼 답장 내용을 입력하세요..."
        minHeight={84}
        onAttach={async (file) => {
          const r = await uploadAttachment(file);
          return {
            attachment_id: r.id,
            name: r.name,
            size_bytes: r.size_bytes,
            mime_type: r.mime_type,
          };
        }}
        toolbar={(editor, api) => (
          <ReporterReplyToolbar
            editor={editor}
            onAttach={(file) => api.attach(file)}
            onAttachError={(e) =>
              toast.error(e instanceof Error ? e.message : '첨부 업로드에 실패했습니다')
            }
          />
        )}
      />

      {/* Inline error Callout — reporter_facing_status.gate_blocked (amber)
          D-5.6: copy from backend detail.reason, not errorMapper message */}
      {inlineCalloutTone != null && inlineCalloutReason != null && (
        <div
          className="mt-2 px-1"
          data-testid="composer-error-callout"
          data-tone={inlineCalloutTone}
        >
          <Callout tone={inlineCalloutTone} icon={<AlertCircle size={12} />}>
            {inlineCalloutReason}
          </Callout>
        </div>
      )}

      {/* ComposerFooter — shared across all three composer surfaces */}
      <ComposerFooter
        submitLabel="Send reply"
        onPreview={() => setPreviewOpen(true)}
        onSubmit={handleSubmit}
        isEmpty={isEmpty}
        isSubmitting={mutation.isPending}
        isSubmitDisabled={isIdempotencyLocked}
        isPreviewDisabled={isIdempotencyLocked}
        statusHint={statusHint}
      />

      {/* PreviewModal — Reporter reply preview */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Reporter reply preview"
      >
        <ComposerReplyPreview voc={voc} owner={owner} reporter={reporter} draftDoc={draftDoc} />
      </PreviewModal>
    </div>
  );
}
