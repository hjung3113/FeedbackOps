// PublicUpdateComposer — public-update tab body for <ComposerSection>.
//
// C5.2 (slice3 #21) — initial implementation
// C5.5 (slice3 #21) — PreviewModal wire-up + error matrix (invalid_transition, gate_blocked,
//                     idempotency_key_reuse)
//
// Spec: PLAN-21-SUBCHUNKS.md C5.2 / C5.5
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (composer body + footer)
//               docs/design-prototype/screen-voc.jsx:486-504 (PreviewModal mount)
//
// Verbatim prototype JSX (lines 415-468, Pack 17 translation):
//
//   <RichEditor
//     surface="public-update"
//     key={composerTab}
//     minHeight={84}
//     onChange={setPublicDraft}
//   />
//   {composerTab === 'public' && (
//     <ReporterStatusChangeBlock
//       voc={voc}
//       nextStatus={nextReporterStatus}
//       onChangeStatus={setNextReporterStatus}
//       draftHtml={publicDraft}
//       owner={owner || reporter}
//     />
//   )}
//   <div className="composer-footer">
//     <div className="composer-status-row">
//       {nextReporterStatus === voc.reporterStatus ? (
//         <span className="text-xs muted">Reporter-facing status는 그대로 유지됩니다.</span>
//       ) : (
//         <span className="text-xs hstack" style={{ gap: 4, color: 'var(--color-neon-lime)' }}>
//           <Icon name="megaphone" size={10} />
//           <strong>{window.ReporterStatusLabels[voc.reporterStatus].label}</strong>
//           <span style={{ color: 'var(--text-muted)' }}>→</span>
//           <strong>{window.ReporterStatusLabels[nextReporterStatus].label}</strong>
//           <span style={{ color: 'var(--text-muted)' }}>로 함께 게시</span>
//         </span>
//       )}
//     </div>
//     <div className="hstack">
//       <button className="btn btn-subtle btn-sm" onClick={() => setPreviewOpen(true)}>
//         <Icon name="expand" size={11} />Preview
//       </button>
//       <Button variant="primary" size="sm"
//         disabled={window.reporterStatusGate(nextReporterStatus, voc, task)}>
//         Publish update
//       </Button>
//     </div>
//   </div>
//
// Two submission paths:
//   body-only:   nextStatus === voc.reporter_facing_status  →  status field sent unchanged
//   body+status: nextStatus !== voc.reporter_facing_status  →  new status sent
//
// On success: invalidate ['voc', voc.id], clear draft, toast 공개 업데이트가 게시되었습니다.
//
// Error matrix (D-5.6: Callout copy sourced from backend detail.reason, not errorMapper):
//   reporter_facing_status.invalid_transition → red Callout inline
//   reporter_facing_status.gate_blocked       → amber Callout inline
//   conflict.idempotency_key_reuse            → lock Submit + Preview until VOC switch

import { useVocPublicUpdateMutation } from '@/features/voc/hooks/useVocPublicUpdateMutation';
import type { ApiError } from '@/lib/api';
import type { MeResponse } from '@/lib/auth/useMe';
import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import type { ReporterFacingStatusEnum, VocDetailEnvelope } from '@fops/shared';
import { Callout, PreviewModal, RichEditor } from '@fops/ui';
import type { TipTapDoc } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Megaphone } from 'lucide-react';
import { type ReactElement, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ComposerAttachmentDropzone } from './ComposerAttachmentDropzone';
import { ComposerFooter } from './ComposerFooter';
import { ComposerPublicPreview } from './ComposerPublicPreview';
import { ReporterStatusChangeBlock } from './ReporterStatusChangeBlock';
import { uploadAttachment } from '@/lib/api/attachments';
import { PublicUpdateToolbar } from './rich-toolbars/PublicUpdateToolbar';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PublicUpdateComposerProps {
  voc: VocDetailEnvelope;
  me: MeResponse | null | undefined;
  /**
   * REV-1 #7: controlled draft doc from parent ComposerSection (persists across tab switches).
   * When provided, this value drives the editor; onChange updates the parent instead of
   * local state.
   */
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
function getComposerErrorTone(code: string): 'red' | 'amber' | null {
  if (code === 'reporter_facing_status.invalid_transition') return 'red';
  if (code === 'reporter_facing_status.gate_blocked') return 'amber';
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PublicUpdateComposer({ voc, me, draftDoc: controlledDraftDoc, onDraftChange }: PublicUpdateComposerProps): ReactElement {
  const queryClient = useQueryClient();

  // REV-1 #7: if parent provides controlled draft, use it; otherwise keep local state
  // for backward-compat when the composer is used standalone.
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

  const [nextStatus, setNextStatus] = useState<ReporterFacingStatusEnum>(
    voc.reporter_facing_status,
  );
  const [previewOpen, setPreviewOpen] = useState(false);

  // PLAN-22 C7a: composer-level attachment dropzone state.
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [attachmentsUploading, setAttachmentsUploading] = useState(false);

  // Reset state when VOC changes (status + preview; draft reset handled by parent for controlled).
  const prevVocIdRef = useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    if (!isControlled) {
      setLocalDraftDoc(null);
    }
    setNextStatus(voc.reporter_facing_status);
    setPreviewOpen(false);
  }

  // Gate check: Publish is disabled when reporter_status_gate.blocking_for includes nextStatus.
  const isGateBlocked = voc.reporter_status_gate?.blocking_for.includes(nextStatus) ?? false;

  const isEmpty = isDocEmpty(draftDoc);

  const mutation = useVocPublicUpdateMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
      // clear draft (calls onDraftChange?.(null) when controlled)
      setDraftDoc(null);
      setNextStatus(voc.reporter_facing_status);
      toast.success('공개 업데이트가 게시되었습니다.');
    },
  });

  function handleSubmit() {
    if (!draftDoc) return;
    mutation.mutate({
      vocId: voc.id,
      ifMatch: voc.updated_at,
      body: {
        body_rich_content: draftDoc,
        next_reporter_facing_status: nextStatus,
        attachments: [],
        // PLAN-22 C7a (D1): widened body field — schema reconciled in C7b.
        attachment_ids: attachmentIds,
      },
    });
  }

  // Owner for the ReporterStatusChangeBlock preview card + ComposerPublicPreview.
  const owner: { id: string; display_name: string; email?: string } = {
    id: me?.actor.id ?? '',
    display_name: me?.actor.display_name ?? '—',
    ...(me?.actor.email ? { email: me.actor.email } : {}),
  };

  // Status hint: shows change preview or "status unchanged" copy.
  const currentStatus = voc.reporter_facing_status;
  const isStatusChanging = nextStatus !== currentStatus;

  const statusHint = isStatusChanging ? (
    <span className="inline-flex items-center gap-1 text-xs text-accent-primary">
      <Megaphone size={10} aria-hidden="true" />
      <strong>{REPORTER_STATUS_LABELS[currentStatus]}</strong>
      <span className="text-text-muted">→</span>
      <strong>{REPORTER_STATUS_LABELS[nextStatus]}</strong>
      <span className="text-text-muted">로 함께 게시</span>
    </span>
  ) : (
    <span className="text-xs text-text-muted">Reporter-facing status는 그대로 유지됩니다.</span>
  );

  // ── Error matrix ─────────────────────────────────────────────────────────────
  // Inline Callout copy comes from backend detail.reason per D-5.6 in PLAN-21.
  // conflict.idempotency_key_reuse → lock both Submit + Preview until VOC switch.

  const mutationError = mutation.error as ApiError | null;
  const isIdempotencyLocked =
    mutationError != null && mutationError.code === 'conflict.idempotency_key_reuse';

  const inlineCalloutTone = mutationError != null ? getComposerErrorTone(mutationError.code) : null;
  const inlineCalloutReason =
    inlineCalloutTone != null
      ? ((mutationError?.detail?.reason as string | undefined) ?? mutationError?.message)
      : null;

  return (
    <div data-testid="public-update-composer">
      {/* RichEditor with PublicUpdateToolbar — prototype: minHeight 84px */}
      <RichEditor
        surface="public-update"
        // REV-3 Cluster Z: pass an explicit value (TipTapDoc | null) so the
        // editor honors an explicit clear after submit-success / VOC switch.
        // Omitting the prop left stale content visible.
        value={draftDoc}
        onChange={(doc) => setDraftDoc(doc)}
        placeholder="공개 업데이트 내용을 입력하세요..."
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
          <PublicUpdateToolbar
            editor={editor}
            onAttach={(file) => api.attach(file)}
            onAttachError={(e) =>
              toast.error(e instanceof Error ? e.message : '첨부 업로드에 실패했습니다')
            }
          />
        )}
      />

      {/* PLAN-22 C7a: composer-level attachment dropzone (compact). */}
      <ComposerAttachmentDropzone
        testId="public-update-attachment-dropzone"
        onChange={setAttachmentIds}
        onUploadingChange={setAttachmentsUploading}
      />

      {/* ReporterStatusChangeBlock — always shown in the public-update composer */}
      <ReporterStatusChangeBlock
        voc={voc}
        nextStatus={nextStatus}
        onChangeStatus={setNextStatus}
        draftDoc={draftDoc}
        owner={owner}
      />

      {/* Inline error Callout — reporter_facing_status.invalid_transition (red)
                               or reporter_facing_status.gate_blocked (amber)
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
        submitLabel="Publish update"
        onPreview={() => setPreviewOpen(true)}
        onSubmit={handleSubmit}
        isEmpty={isEmpty}
        isSubmitting={mutation.isPending}
        isSubmitDisabled={isGateBlocked || isIdempotencyLocked || attachmentsUploading}
        isPreviewDisabled={isIdempotencyLocked}
        statusHint={statusHint}
      />

      {/* PreviewModal — Public update preview */}
      <PreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Public update — Reporter preview"
      >
        <ComposerPublicPreview
          voc={voc}
          owner={owner}
          nextStatus={nextStatus}
          draftDoc={draftDoc}
        />
      </PreviewModal>
    </div>
  );
}
