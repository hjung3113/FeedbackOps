import { mergeAttributes, type JSONContent } from '@tiptap/core';
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

// PLAN-22 C10 (closes #42) — only cross-origin http(s) URLs are "external".
// Relative paths ('/foo'), hash fragments ('#anchor'), same-origin absolute
// URLs, and the empty href produced by the C9 sanitizer for hostile schemes
// all stay internal: no target, no rel injection.
//
// SSR / non-browser render contexts have no `window`; we conservatively treat
// any http(s)://-prefixed href as external in that case. The sanitizer is the
// authoritative gate for hostile schemes (javascript:, data:, etc.) — they
// arrive here as '' and short-circuit to internal.
function isExternalHref(href: unknown): boolean {
  if (typeof href !== 'string' || href === '') return false;
  if (!/^https?:\/\//i.test(href)) return false;
  if (typeof window === 'undefined' || !window.location?.origin) return true;
  try {
    return new URL(href).origin !== window.location.origin;
  } catch {
    return false;
  }
}

// Disable Link's default target/rel injection (which fires on *every* link)
// and substitute a renderHTML that only decorates external anchors.
const ExternalAwareLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const isExternal = isExternalHref(HTMLAttributes.href);
    const extra = isExternal
      ? { rel: 'noopener noreferrer', target: '_blank' }
      : { rel: null, target: null };
    return ['a', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, extra), 0];
  },
}).configure({
  openOnClick: false,
  // Wipe the upstream defaults so internal links inherit neither target nor rel.
  HTMLAttributes: { target: null, rel: null, class: null },
});

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
      ExternalAwareLink,
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
