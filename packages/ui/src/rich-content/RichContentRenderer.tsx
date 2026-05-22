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
import { sanitizeClient, type ClientSanitizeSurface } from './sanitizeClient';

export type RichContentMode = 'reporter_visible' | 'internal';

export interface RichContentRendererProps {
  doc: TipTapDoc;
  mode: RichContentMode;
  /**
   * Allowlist surface for the render-time defence-in-depth sanitizer (PLAN-22
   * C9). Defaults to the safest reader for each `mode` when omitted, so
   * existing call sites do not need to change. Callers SHOULD pass an explicit
   * `surface` when they know it (e.g. `reporter-reply` rendering uses
   * `reporter-reply`; internal-comment threads use `internal-comment`).
   */
  surface?: ClientSanitizeSurface;
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

export function RichContentRenderer({ doc, mode, surface, className }: RichContentRendererProps) {
  const html = React.useMemo(() => {
    // PLAN-22 C9: defence-in-depth client sanitize before TipTap render.
    // Mode is the public/internal split (drives mention stripping); `surface`
    // selects the allowlist. Default surface mirrors the safest reader for
    // each mode so legacy call sites stay safe without code changes.
    const effectiveSurface: ClientSanitizeSurface =
      surface ?? (mode === 'reporter_visible' ? 'public-update' : 'internal-comment');
    const sanitized = sanitizeClient(doc, effectiveSurface);
    // stripMentions is moved inside useMemo so generateHTML is only re-invoked
    // when doc or mode actually change — not on every parent render.
    const safe = mode === 'reporter_visible' ? stripMentions(sanitized) : sanitized;
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
  }, [doc, mode, surface]);

  return (
    <div
      className={cn('prose prose-sm max-w-none', className)}
      data-mode={mode}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: BE sanitizer is authoritative per ADR-0011
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
