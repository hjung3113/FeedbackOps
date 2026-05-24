// VocDescriptionToolbar — RichEditor toolbar render-prop for the voc-description surface.
// Renders the buttons declared in VOC_DESCRIPTION_TOOLBAR (rich-toolbar-voc-description.ts).
// PLAN-22 C8: Attach is now active. Surface owners pass `onAttach` to opt in;
// the button is hidden when `onAttach` is omitted (kept compatible with
// other call sites that have not yet wired the uploader).

import * as React from 'react';
import {
  AttachButton,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  cn,
  type RichEditorToolbarApi,
  type TipTapEditor as Editor,
} from '@fops/ui';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Code as CodeIcon,
  List as ListIcon,
  Link2 as LinkIcon,
} from 'lucide-react';
import {
  VOC_DESCRIPTION_TOOLBAR,
  type VocDescriptionToolbarAction,
} from './rich-toolbar-voc-description';

interface ToolbarButtonSpec {
  icon: React.ComponentType<{ size?: number }>;
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
    onClick: (e) => {
      const previous = e.getAttributes('link')['href'] as string | undefined;
      const url = window.prompt('링크 URL', previous ?? '');
      if (url === null) return;
      if (url === '') {
        e.chain().focus().unsetLink().run();
        return;
      }
      e.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    },
  },
};

/**
 * Render-prop factory. Pass it directly: `toolbar={vocDescriptionToolbar(opts)}`.
 * `onAttachError` lets the host surface a toast on upload failure; `attach`
 * itself is wired through `RichEditor.onAttach`.
 */
export function vocDescriptionToolbar(opts?: {
  onAttachError?: (err: unknown) => void;
}): (editor: Editor | null, api: RichEditorToolbarApi) => React.ReactElement | null {
  return (editor, api) => {
    if (!editor) return null;
    return (
      <TooltipProvider>
        <div
          className="flex items-center gap-1 border-b border-border-subtle px-2 py-1"
          data-testid="voc-description-toolbar"
        >
          {VOC_DESCRIPTION_TOOLBAR.map((item) => {
            if (item.id === 'attach') {
              return (
                <AttachButton
                  key={item.id}
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
            const tooltip = item.tooltip ?? spec.label;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={spec.label}
                    aria-pressed={active}
                    disabled={disabled}
                    onClick={handleClick}
                    data-testid={`voc-toolbar-${item.id}`}
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition-colors',
                      'hover:bg-surface-card hover:text-text-primary',
                      'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted',
                      active && 'bg-surface-card text-accent-primary',
                    )}
                  >
                    <Icon size={13} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  };
}

/**
 * Backward-compatible default export — bare render-prop (no attach error
 * handling). New call sites prefer `vocDescriptionToolbar({ onAttachError })`.
 *
 * Accepts an optional `api` so legacy callers passing only `editor` continue
 * to compile; when `api` is missing, the Attach button no-ops gracefully
 * (matches surfaces that haven't wired `onAttach` on the RichEditor yet).
 */
export function VocDescriptionToolbar(
  editor: Editor | null,
  api?: RichEditorToolbarApi,
): React.ReactElement | null {
  const safeApi: RichEditorToolbarApi = api ?? {
    attach: async () => {
      throw new Error('RichEditor: onAttach is not configured for this surface');
    },
  };
  return vocDescriptionToolbar()(editor, safeApi);
}
