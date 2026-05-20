// PublicUpdateComposer — public-update tab body for <ComposerSection>.
//
// C5.2 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.2
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468
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

import { useVocPublicUpdateMutation } from '@/features/voc/hooks/useVocPublicUpdateMutation';
import type { MeResponse } from '@/lib/auth/useMe';
import { REPORTER_STATUS_LABELS } from '@/lib/copy/reporter-status-labels';
import type { ReporterFacingStatusEnum, VocDetailEnvelope } from '@fops/shared';
import { RichEditor, type TipTapDoc } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ComposerFooter } from './ComposerFooter';
import { ReporterStatusChangeBlock } from './ReporterStatusChangeBlock';
import { PublicUpdateToolbar } from './rich-toolbars/PublicUpdateToolbar';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PublicUpdateComposerProps {
  voc: VocDetailEnvelope;
  me: MeResponse | null | undefined;
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

// ── Component ─────────────────────────────────────────────────────────────────

export function PublicUpdateComposer({ voc, me }: PublicUpdateComposerProps): React.ReactElement {
  const queryClient = useQueryClient();

  // Local draft state for this composer instance.
  const [draftDoc, setDraftDoc] = React.useState<TipTapDoc | null>(null);
  const [nextStatus, setNextStatus] = React.useState<ReporterFacingStatusEnum>(
    voc.reporter_facing_status,
  );

  // Reset state when VOC changes.
  const prevVocIdRef = React.useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    setDraftDoc(null);
    setNextStatus(voc.reporter_facing_status);
  }

  // Gate check: Publish is disabled when reporter_status_gate.blocking_for includes nextStatus.
  const isGateBlocked = voc.reporter_status_gate?.blocking_for.includes(nextStatus) ?? false;

  const isEmpty = isDocEmpty(draftDoc);

  const mutation = useVocPublicUpdateMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
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
      },
    });
  }

  // Owner for the ReporterStatusChangeBlock preview card.
  // Priority: owner_user_id actor → fall back to me actor.
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

  return (
    <div data-testid="public-update-composer">
      {/* RichEditor with PublicUpdateToolbar — prototype: minHeight 84px */}
      <RichEditor
        surface="public-update"
        {...(draftDoc != null ? { value: draftDoc } : {})}
        onChange={(doc) => setDraftDoc(doc)}
        placeholder="공개 업데이트 내용을 입력하세요..."
        minHeight={84}
        toolbar={(editor) => <PublicUpdateToolbar editor={editor} />}
      />

      {/* ReporterStatusChangeBlock — always shown in the public-update composer */}
      <ReporterStatusChangeBlock
        voc={voc}
        nextStatus={nextStatus}
        onChangeStatus={setNextStatus}
        draftDoc={draftDoc}
        owner={owner}
      />

      {/* ComposerFooter — shared across all three composer surfaces */}
      <ComposerFooter
        submitLabel="Publish update"
        onPreview={() => {
          // Preview modal wired in C5.5.
        }}
        onSubmit={handleSubmit}
        isEmpty={isEmpty}
        isSubmitting={mutation.isPending}
        isSubmitDisabled={isGateBlocked}
        statusHint={statusHint}
      />
    </div>
  );
}
