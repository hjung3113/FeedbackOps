// VocDescriptionToolbar — RichEditor toolbar render-prop for the voc-description surface.
// Renders the buttons declared in VOC_DESCRIPTION_TOOLBAR (rich-toolbar-voc-description.ts).
// The attach button is always rendered; omitting `RichEditor.onAttach` does not hide it (the
// editor rejects the pick and the error is swallowed when `onAttachError` is absent). A surface
// that cannot take inline attachments opts out with `vocDescriptionToolbar({ hideAttach: true })`.

import { ComposerToolbarButton } from '@/features/cross-system/composer-editor/ComposerToolbarButton';
import { promptForLink } from '@/features/cross-system/composer-editor/promptForLink';
import { AttachButton, type TipTapEditor as Editor, type RichEditorToolbarApi } from '@fops/ui';
import {
  Bold as BoldIcon,
  Code as CodeIcon,
  Italic as ItalicIcon,
  Link2 as LinkIcon,
  List as ListIcon,
  Underline as UnderlineIcon,
} from 'lucide-react';
import * as React from 'react';
import {
  VOC_DESCRIPTION_TOOLBAR,
  type VocDescriptionToolbarAction,
} from './rich-toolbar-voc-description';

interface ToolbarButtonSpec {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  label: string;
  isActive?: (editor: Editor) => boolean;
  onClick?: (editor: Editor) => void;
}

const BUTTONS: Record<Exclude<VocDescriptionToolbarAction, 'attach'>, ToolbarButtonSpec> = {
  bold: {
    icon: BoldIcon,
    label: '굵게',
    isActive: (e) => e.isActive('bold'),
    onClick: (e) => e.chain().focus().toggleBold().run(),
  },
  italic: {
    icon: ItalicIcon,
    label: '기울임',
    isActive: (e) => e.isActive('italic'),
    onClick: (e) => e.chain().focus().toggleItalic().run(),
  },
  underline: {
    icon: UnderlineIcon,
    label: '밑줄',
    isActive: (e) => e.isActive('underline'),
    onClick: (e) => e.chain().focus().toggleUnderline().run(),
  },
  code: {
    icon: CodeIcon,
    label: '코드',
    isActive: (e) => e.isActive('code'),
    onClick: (e) => e.chain().focus().toggleCode().run(),
  },
  bulletList: {
    icon: ListIcon,
    label: '목록',
    isActive: (e) => e.isActive('bulletList'),
    onClick: (e) => e.chain().focus().toggleBulletList().run(),
  },
  link: {
    icon: LinkIcon,
    label: '링크',
    isActive: (e) => e.isActive('link'),
    onClick: (e) => promptForLink(e),
  },
};

/**
 * Render-prop factory. Pass it directly: `toolbar={vocDescriptionToolbar(opts)}`.
 * `onAttachError` lets the host surface a toast on upload failure; `attach`
 * itself is wired through `RichEditor.onAttach`. `hideAttach` drops the attach button and its
 * separator for surfaces that send attachments only through a dropzone (VOC edit-description:
 * the save path keeps `attachment_ids[]` only and the sanitizer rejects the editor's
 * `attachmentRef` metadata attrs).
 */
export function vocDescriptionToolbar(opts?: {
  onAttachError?: (err: unknown) => void;
  hideAttach?: boolean;
}): (editor: Editor | null, api: RichEditorToolbarApi) => React.ReactElement | null {
  return (editor, api) => {
    if (!editor) return null;
    return (
      <div
        className="flex items-center gap-1 border-b border-border-subtle px-2 py-1"
        data-testid="voc-description-toolbar"
      >
        {VOC_DESCRIPTION_TOOLBAR.map((item) => {
          if (item.id === 'attach') {
            if (opts?.hideAttach === true) return null;
            return (
              <React.Fragment key={item.id}>
                <span
                  className="mx-1 h-4 w-px bg-border-subtle"
                  aria-hidden="true"
                  data-testid="voc-toolbar-separator"
                />
                <AttachButton
                  data-testid="voc-toolbar-attach"
                  label={item.tooltip ?? '첨부 파일 추가'}
                  disabled={item.disabled === true}
                  onPick={async (file) => {
                    try {
                      await api.attach(file);
                    } catch (e) {
                      opts?.onAttachError?.(e);
                    }
                  }}
                />
              </React.Fragment>
            );
          }
          const spec = BUTTONS[item.id];
          const Icon = spec.icon;
          const disabled = item.disabled === true || !spec.onClick;
          const active = !disabled && spec.isActive?.(editor) === true;
          const handleClick = (): void => {
            if (disabled) return;
            spec.onClick?.(editor);
          };
          return (
            <ComposerToolbarButton
              key={item.id}
              onClick={handleClick}
              isActive={active}
              disabled={disabled}
              title={item.tooltip ?? spec.label}
              data-testid={`voc-toolbar-${item.id}`}
            >
              <Icon size={14} strokeWidth={2} />
            </ComposerToolbarButton>
          );
        })}
        <span className="ml-auto text-xs font-semibold uppercase tracking-wide text-text-muted">
          VOC 본문
        </span>
      </div>
    );
  };
}
