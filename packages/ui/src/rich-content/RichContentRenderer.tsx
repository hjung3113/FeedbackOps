import * as React from 'react';
import { generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import type { JSONContent } from '@tiptap/core';
import { AttachmentRef } from './extensions/attachmentRef';
import { Mention } from './extensions/mention';
import { cn } from '../utils/cn';
import type { TipTapDoc } from './RichEditor';

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
      const filtered = node.content
        .map(walk)
        .filter((x): x is JSONContent => x !== null);
      return { ...node, content: filtered };
    }
    return node;
  }
  return walk(doc) as TipTapDoc;
}

export function RichContentRenderer({ doc, mode, className }: RichContentRendererProps) {
  const safe = mode === 'reporter_visible' ? stripMentions(doc) : doc;
  const html = React.useMemo(() => {
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
  }, [safe]);

  return (
    <div
      className={cn('prose prose-sm max-w-none', className)}
      data-mode={mode}
      // Backend (#13, #16, #23, #24 sanitizer) is authoritative; renderer trusts.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
