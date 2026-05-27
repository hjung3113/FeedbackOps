// InternalCommentComposer — internal-comment tab body for <ComposerSection>.
//
// C5.4 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.4
// Prototype ref: docs/design-prototype/screen-voc.jsx:415-468 (internal variant)
//
// Verbatim prototype JSX (internal variant, Pack 17 translation):
//
//   <RichEditor surface="internal-comment" key={composerTab} minHeight={84} />
//
//   <div className="composer-footer">
//     <div className="composer-status-row">
//       <span className="text-xs muted">팀원 6명에게 보임</span>
//     </div>
//     <div className="hstack">
//       <button className="btn btn-subtle btn-sm" disabled={composerTab === 'internal'}>
//         <Icon name="expand" size={11} />Preview
//       </button>
//       <Button variant="primary" size="sm">Add note</Button>
//     </div>
//   </div>
//
// Key spec notes:
//   - Preview button is DOM-disabled (NOT hidden) per D-5.4.
//   - Mentions submitted as deduplicated actor_id array via extractMentions(doc).
//   - @Mention via MentionPickerButton (Combobox click only — NOT inline @-autocomplete, spec §3.5).
//   - On 200: invalidate ['voc', voc.id], clear draft, toast 내부 코멘트가 추가되었습니다.

import { useVocInternalCommentMutation } from '@/features/voc/hooks/useVocInternalCommentMutation';
import { extractMentions } from '@/features/voc/lib/extractMentions';
import type { MeResponse } from '@/lib/auth/useMe';
import type { VocDetailEnvelope } from '@fops/shared';
import type { TipTapDoc, TipTapEditor } from '@fops/ui';
import { RichEditor } from '@fops/ui';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { uploadAttachment } from '@/lib/api/attachments';
import { ComposerAttachmentDropzone } from './ComposerAttachmentDropzone';
import { ComposerFooter } from './ComposerFooter';
import { MentionPickerButton } from './MentionPickerButton';
import { InternalCommentToolbar } from './rich-toolbars/InternalCommentToolbar';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface InternalCommentComposerProps {
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

// ── Component ─────────────────────────────────────────────────────────────────

export function InternalCommentComposer({
  voc,
  // me unused directly here but kept in props for signature consistency with
  // PublicUpdateComposer / ReporterReplyComposer
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  me: _me,
  draftDoc: controlledDraftDoc,
  onDraftChange,
}: InternalCommentComposerProps): React.ReactElement {
  const queryClient = useQueryClient();

  // Hold a ref to the editor instance to allow MentionPickerButton insertions.
  const editorRef = React.useRef<TipTapEditor | null>(null);

  // REV-1 #7: controlled draft support.
  const isControlled = controlledDraftDoc !== undefined;
  const [localDraftDoc, setLocalDraftDoc] = React.useState<TipTapDoc | null>(null);
  const draftDoc = isControlled ? (controlledDraftDoc ?? null) : localDraftDoc;

  function setDraftDoc(doc: TipTapDoc | null) {
    if (isControlled) {
      onDraftChange?.(doc);
    } else {
      setLocalDraftDoc(doc);
    }
  }

  // Reset state when VOC changes (draft reset handled by parent for controlled).
  const prevVocIdRef = React.useRef(voc.id);
  if (prevVocIdRef.current !== voc.id) {
    prevVocIdRef.current = voc.id;
    if (!isControlled) {
      setLocalDraftDoc(null);
    }
  }

  // PLAN-22 C7a: composer-level attachment dropzone state.
  const [attachmentIds, setAttachmentIds] = React.useState<string[]>([]);
  const [attachmentsUploading, setAttachmentsUploading] = React.useState(false);

  const isEmpty = isDocEmpty(draftDoc);

  const mutation = useVocInternalCommentMutation({
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['voc', voc.id] });
      setDraftDoc(null); // calls onDraftChange?.(null) when controlled
      toast.success('내부 코멘트가 추가되었습니다.');
    },
  });

  function handleSubmit() {
    if (!draftDoc) return;
    const mentions = extractMentions(draftDoc);
    mutation.mutate({
      vocId: voc.id,
      ifMatch: voc.updated_at,
      body: {
        body_rich_content: draftDoc,
        mentions,
        // PLAN-22 C7a (D1): widened body field — schema reconciled in C7b.
        attachment_ids: attachmentIds,
      },
    });
  }

  // Handler for MentionPickerButton: inserts a mention node into the editor.
  function handleInsertMention(actor: { id: string; display_name: string }) {
    editorRef.current
      ?.chain()
      .focus()
      .insertContent({
        type: 'mention',
        attrs: { actor_id: actor.id },
      })
      .run();
  }

  // Status hint: prototype "팀원 6명에게 보임" (visible to N team members).
  const statusHint = <span className="text-xs text-text-muted">팀원에게만 보임</span>;

  return (
    <div data-testid="internal-comment-composer">
      {/* RichEditor with InternalCommentToolbar — prototype: minHeight 84px */}
      <RichEditor
        surface="internal-comment"
        // REV-3 Cluster Z: explicit value (null = clear).
        value={draftDoc}
        onChange={(doc) => setDraftDoc(doc)}
        placeholder="내부 코멘트를 입력하세요..."
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
        toolbar={(editor, api) => {
          // Keep editor ref in sync for mention insertion.
          editorRef.current = editor;
          return (
            <InternalCommentToolbar
              editor={editor}
              onInsertMention={() => {
                // MentionPickerButton is rendered outside the toolbar in the composer
                // body; this callback is not used by the toolbar directly here.
                // The toolbar's @Mention button will be handled via a shared state flag
                // below.
              }}
              onAttach={(file) => api.attach(file)}
              onAttachError={(e) =>
                toast.error(e instanceof Error ? e.message : '첨부 업로드에 실패했습니다')
              }
            />
          );
        }}
      />

      {/* MentionPickerButton — positioned below editor, Combobox-backed (spec §3.5) */}
      <div className="px-3 py-1.5 border-b border-border-subtle">
        <MentionPickerButton onSelect={handleInsertMention} disabled={mutation.isPending} />
      </div>

      {/* PLAN-22 C7a: composer-level attachment dropzone (compact). */}
      <ComposerAttachmentDropzone
        testId="internal-comment-attachment-dropzone"
        onChange={setAttachmentIds}
        onUploadingChange={setAttachmentsUploading}
      />

      {/* ComposerFooter — Preview disabled per D-5.4 */}
      <ComposerFooter
        submitLabel="Add note"
        onPreview={() => {
          // Preview is DOM-disabled on internal composer per D-5.4; this is never called.
        }}
        onSubmit={handleSubmit}
        isEmpty={isEmpty}
        isSubmitting={mutation.isPending}
        isSubmitDisabled={attachmentsUploading}
        isPreviewDisabled={true}
        statusHint={statusHint}
      />
    </div>
  );
}
