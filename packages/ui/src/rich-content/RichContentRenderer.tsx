import type { JSONContent } from '@tiptap/core';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import * as React from 'react';
import { cn } from '../utils/cn';
import type { TipTapDoc } from './RichEditor';
import { AttachmentRef } from './extensions/attachmentRef';
import { Mention } from './extensions/mention';

export type RichContentMode = 'reporter_visible' | 'internal';

export interface RichContentRendererProps {
  doc: TipTapDoc;
  mode: RichContentMode;
  className?: string;
}

function stripMentions(doc: TipTapDoc): TipTapDoc {
  function walk(node: JSONContent): JSONContent | null {
    if (node.type === 'mention') return null;
    if (Array.isArray(node.content)) {
      const filtered = node.content.map(walk).filter((x): x is JSONContent => x !== null);
      return { ...node, content: filtered };
    }
    return node;
  }
  return walk(doc) as TipTapDoc;
}

export function RichContentRenderer({ doc, mode, className }: RichContentRendererProps) {
  const html = React.useMemo(() => {
    // stripMentions is moved inside useMemo so generateHTML is only re-invoked
    // when doc or mode actually change — not on every parent render.
    const safe = mode === 'reporter_visible' ? stripMentions(doc) : doc;
    return generateHTML(safe as JSONContent, [
      StarterKit.configure({
        // Disable built-ins that we configure separately below to avoid duplicate extension warnings.
        link: false,
        underline: false,
      }),
      Link.configure({ openOnClick: false }),
      Underline,
      AttachmentRef,
      Mention,
    ]);
  }, [doc, mode]);

  return (
    <div
      className={cn('prose prose-sm max-w-none', className)}
      data-mode={mode}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: BE sanitizer is authoritative per ADR-0011
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
