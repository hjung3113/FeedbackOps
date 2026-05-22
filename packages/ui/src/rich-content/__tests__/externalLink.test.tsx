// PLAN-22 C10 (closes #42) — RichContentRenderer external-link rel/target.
//
// External anchors (cross-origin http/https) MUST carry
//   rel="noopener noreferrer" target="_blank"
// so reporter-visible content cannot tabnap or leak the opener handle.
// Internal anchors (relative paths, hash fragments, same-origin absolute)
// stay unchanged — no rel, no target — so in-app navigation still flows
// through TanStack Router naturally.
//
// The sanitizer (PLAN-22 C9) is authoritative for href safety: javascript:,
// data:, and other hostile schemes are coerced to '' before they reach the
// renderer. This file does *not* re-test that — it only asserts the renderer
// decorates external anchors and leaves internal ones alone.

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RichContentRenderer } from '../RichContentRenderer';
import type { TipTapDoc } from '../RichEditor';

const docWithLink = (href: string): TipTapDoc =>
  ({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'link',
            marks: [{ type: 'link', attrs: { href } }],
          },
        ],
      },
    ],
  }) as unknown as TipTapDoc;

function renderDoc(href: string): HTMLAnchorElement {
  const { container } = render(
    <RichContentRenderer doc={docWithLink(href)} mode="internal" />,
  );
  const a = container.querySelector('a');
  if (!a) throw new Error(`no anchor rendered for href=${href}`);
  return a as HTMLAnchorElement;
}

describe('RichContentRenderer — external link decoration (PLAN-22 C10, #42)', () => {
  // jsdom default origin is http://localhost:3000 unless overridden.
  // External = any http(s) URL whose origin differs from window.location.origin.

  it('external https → rel="noopener noreferrer" and target="_blank"', () => {
    const a = renderDoc('https://example.com/path');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('external http → rel + target set', () => {
    const a = renderDoc('http://example.com/');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(a.getAttribute('target')).toBe('_blank');
  });

  it('root-relative "/foo" → no rel, no target', () => {
    const a = renderDoc('/foo');
    expect(a.getAttribute('rel')).toBeNull();
    expect(a.getAttribute('target')).toBeNull();
  });

  it('hash "#anchor" → no rel, no target', () => {
    const a = renderDoc('#anchor');
    expect(a.getAttribute('rel')).toBeNull();
    expect(a.getAttribute('target')).toBeNull();
  });

  it('same-origin absolute → no rel, no target', () => {
    // jsdom default origin is http://localhost:3000 (see vitest config).
    const sameOrigin = `${window.location.origin}/inbox`;
    const a = renderDoc(sameOrigin);
    expect(a.getAttribute('rel')).toBeNull();
    expect(a.getAttribute('target')).toBeNull();
  });

  it('javascript: href → sanitizer (C9) coerces to "" and renderer adds no target', () => {
    // Belt-and-suspenders: sanitizeClient blanks the hostile href, so by the
    // time renderHTML runs href is '' which is not external. No target leak.
    const a = renderDoc('javascript:alert(1)');
    expect(a.getAttribute('href') ?? '').not.toMatch(/javascript:/i);
    expect(a.getAttribute('target')).toBeNull();
  });
});
