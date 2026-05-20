// VocDescriptionToolbar — RichEditor toolbar render-prop for the voc-description surface.
// Renders the buttons declared in VOC_DESCRIPTION_TOOLBAR (rich-toolbar-voc-description.ts).
// The Attach button is rendered but disabled per spec §5.7 (storage lands in a later slice).

import * as React from 'react';
import type { TipTapEditor as Editor } from '@fops/ui';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Code as CodeIcon,
  List as ListIcon,
  Link2 as LinkIcon,
  Paperclip as AttachIcon,
} from 'lucide-react';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@fops/ui';
import { cn } from '@fops/ui';
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

const BUTTONS: Record<VocDescriptionToolbarAction, ToolbarButtonSpec> = {
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
  attach: {
    icon: AttachIcon,
    label: '첨부',
  },
};

export function VocDescriptionToolbar(editor: Editor | null): React.ReactElement | null {
  if (!editor) return null;
  return (
    <TooltipProvider>
      <div
        className="flex items-center gap-1 border-b border-border-subtle px-2 py-1.5"
        data-testid="voc-description-toolbar"
      >
        {VOC_DESCRIPTION_TOOLBAR.map((item) => {
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
                    'inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted transition-colors',
                    'hover:bg-surface-card hover:text-text-primary',
                    'disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted',
                    active && 'bg-surface-card text-accent-primary',
                  )}
                >
                  <Icon size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{tooltip}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
