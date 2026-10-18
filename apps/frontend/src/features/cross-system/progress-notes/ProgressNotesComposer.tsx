// ProgressNotesComposer — rich-text composer for the progress-note timeline (#377).
//
// Mirrors the VOC internal-comment composer minus attachments: RichEditor on
// the `internal-comment` surface, @Mention via the shared MentionPickerButton
// (Combobox click only, spec §3.5), no attachment affordance — the backend
// rejects attachmentRef nodes on progress-note comments and #377 scopes
// attachments out.
//
// Local minimal toolbar (bold/italic/code/bullet list/link, no attach):
// the voc-only InternalCommentToolbar is deliberately not reused per the
// #377 FE brief.

import { errorMapper } from '@/lib/api/errorMapper';
import type { ApiError } from '@/lib/api/types';
import { isTipTapDocBlank } from '@fops/shared';
import { Button, RichEditor, type TipTapDoc, type TipTapEditor } from '@fops/ui';
import { Bold, Code, Italic, Link, List } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { ComposerToolbarButton } from '../composer-editor/ComposerToolbarButton';
import { promptForLink } from '../composer-editor/promptForLink';
import { useComposerEditorFocus } from '../composer-editor/useComposerEditorFocus';
import { MentionPickerButton } from '../mentions/MentionPickerButton';
import { insertMention } from '../mentions/insertMention';
import { type ProgressNotesResource, useCreateProgressNote } from './useProgressNotes';

const COMPOSER_COPY = {
  finding: {
    submit: '메모 추가',
    placeholder: '진행 메모를 입력하세요...',
  },
  task: {
    submit: '메모 추가',
    placeholder: '진행 메모를 입력하세요...',
  },
} as const;

// ── Minimal formatting toolbar (no attach) ────────────────────────────────────

export function NotesToolbar({ editor }: { editor: TipTapEditor | null }) {
  const editorDisabled = editor === null;

  return (
    <div
      className="flex items-center gap-0.5 border-b border-border-subtle px-2 py-1"
      data-testid="progress-notes-toolbar"
    >
      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBold().run()}
        isActive={editor?.isActive('bold') ?? false}
        disabled={editorDisabled}
        title="굵게"
      >
        <Bold size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleItalic().run()}
        isActive={editor?.isActive('italic') ?? false}
        disabled={editorDisabled}
        title="기울임"
      >
        <Italic size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleCode().run()}
        isActive={editor?.isActive('code') ?? false}
        disabled={editorDisabled}
        title="코드"
      >
        <Code size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
        isActive={editor?.isActive('bulletList') ?? false}
        disabled={editorDisabled}
        title="글머리 기호"
      >
        <List size={14} />
      </ComposerToolbarButton>

      <ComposerToolbarButton
        onClick={() => promptForLink(editor)}
        isActive={editor?.isActive('link') ?? false}
        disabled={editorDisabled}
        title="링크"
      >
        <Link size={14} />
      </ComposerToolbarButton>
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────

export function ProgressNotesComposer({
  resource,
}: {
  resource: ProgressNotesResource;
}): React.ReactElement {
  // Copy follows the surface language: Finding panel is Korean, Task panel is
  // English (DESIGN-BRIEF-FE.md copy table).
  const copy = COMPOSER_COPY[resource.kind];
  const [draftDoc, setDraftDoc] = React.useState<TipTapDoc | null>(null);
  const editorRef = React.useRef<TipTapEditor | null>(null);
  const { editorHandle, focusEditor } = useComposerEditorFocus();

  const mutation = useCreateProgressNote(resource, {
    onSuccess: () => {
      setDraftDoc(null); // controlled value null clears the editor (REV-3)
      focusEditor();
    },
    onError: (error: ApiError) => toast.error(errorMapper(error.envelope).message),
  });

  const isEmpty = draftDoc === null || isTipTapDocBlank(draftDoc);

  function handleSubmit() {
    if (draftDoc === null || isTipTapDocBlank(draftDoc)) return;
    mutation.mutate(draftDoc);
  }

  // Insert a mention node; the submit path extracts actor ids via extractMentions.
  function handleInsertMention(actor: { id: string; display_name: string }) {
    insertMention(editorRef.current, actor);
  }

  return (
    <div className="mt-3" data-testid="progress-notes-composer">
      <RichEditor
        surface="internal-comment"
        value={draftDoc}
        onChange={(doc) => setDraftDoc(doc)}
        placeholder={copy.placeholder}
        minHeight={84}
        toolbar={(editor) => {
          // Keep the editor ref in sync for mention insertion.
          editorRef.current = editor;
          return (
            <>
              {editorHandle(editor)}
              <NotesToolbar editor={editor} />
            </>
          );
        }}
      />

      {/* MentionPickerButton — below the editor, same placement as the VOC composer */}
      <div className="border-b border-border-subtle px-3 py-1.5">
        <MentionPickerButton onSelect={handleInsertMention} disabled={mutation.isPending} />
      </div>

      <div className="flex justify-end pt-2">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={isEmpty || mutation.isPending}
        >
          {copy.submit}
        </Button>
      </div>
    </div>
  );
}
