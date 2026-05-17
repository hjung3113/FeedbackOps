import { describe, expect, it } from 'vitest';
import { sanitizeTipTap } from '../sanitize.js';

const surface = 'voc-description' as const;

function doc(...children: unknown[]) {
  return { type: 'doc', content: children };
}
function p(text: string, marks?: unknown[]) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
  };
}

describe('sanitizeTipTap (voc-description)', () => {
  it('accepts a minimal paragraph doc', () => {
    const res = sanitizeTipTap({ surface, doc: doc(p('hi')) });
    expect(res.ok).toBe(true);
  });

  it('accepts bold + italic + underline + code + link marks', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [
        { type: 'bold' }, { type: 'italic' }, { type: 'underline' },
        { type: 'code' }, { type: 'link', attrs: { href: 'https://ok.example' } },
      ])),
    });
    expect(res.ok).toBe(true);
  });

  it('rejects image node with external_image_forbidden', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc({ type: 'image', attrs: { src: 'https://x.example/a.png' } }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.external_image_forbidden');
  });

  it('rejects mention node with disallowed_node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc({ type: 'mention', attrs: { id: 'u-1' } }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects javascript: link href', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects data: link href', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'data:text/html,abc' } }])),
    });
    expect(res.ok).toBe(false);
  });

  it('rejects oversized text (>50KB total)', () => {
    const big = 'a'.repeat(50 * 1024 + 1);
    const res = sanitizeTipTap({ surface, doc: doc(p(big)) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects disallowed mark (strike not in voc-description allowlist)', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'strike' }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects doc with non-doc root', () => {
    const res = sanitizeTipTap({ surface, doc: { type: 'paragraph' } as never });
    expect(res.ok).toBe(false);
  });
});
