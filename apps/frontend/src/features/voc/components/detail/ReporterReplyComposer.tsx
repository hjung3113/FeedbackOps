// ReporterReplyComposer — reporter-reply tab body for <ComposerSection>.
//
// C5.3 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.3
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (reply variant)
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
// Preview modal wired in C5.5.

import { useVocReporterReplyMutation } from '@/features/voc/hooks/useVocReporterReplyMutation';
import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import { RichEditor, type TipTapDoc } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { ComposerFooter } from './ComposerFooter';
import { ReporterReplyToolbar } from './rich-toolbars/ReporterReplyToolbar';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface ReporterReplyComposerProps {
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

export function ReporterReplyComposer({ voc }: ReporterReplyComposerProps): React.ReactElement {
  const queryClient = useQueryClient();

  // Local draft state for this composer instance.
  const [draftDoc, setDraftDoc] = React.useState<TipTapDoc | null>(null);

  // Reset state when VOC changes.
  const prevVocIdRef = React.useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    setDraftDoc(null);
  }

  const isEmpty = isDocEmpty(draftDoc);

  const mutation = useVocReporterReplyMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
      setDraftDoc(null);
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
  const statusHint = (
    <span className="text-xs text-text-muted">공개 타임라인에 기록됨</span>
  );

  return (
    <div data-testid="reporter-reply-composer">
      {/* RichEditor with ReporterReplyToolbar — prototype: minHeight 84px */}
      <RichEditor
        surface="reporter-reply"
        {...(draftDoc != null ? { value: draftDoc } : {})}
        onChange={(doc) => setDraftDoc(doc)}
        placeholder="리포터에게 보낼 답장 내용을 입력하세요..."
        minHeight={84}
        toolbar={(editor) => <ReporterReplyToolbar editor={editor} />}
      />

      {/* ComposerFooter — shared across all three composer surfaces */}
      <ComposerFooter
        submitLabel="Send reply"
        onPreview={() => {
          // Preview modal wired in C5.5.
        }}
        onSubmit={handleSubmit}
        isEmpty={isEmpty}
        isSubmitting={mutation.isPending}
        statusHint={statusHint}
      />
    </div>
  );
}
