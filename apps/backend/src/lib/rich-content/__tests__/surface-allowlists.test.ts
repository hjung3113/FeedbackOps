import { describe, expect, it } from 'vitest';
import { sanitizeTipTap } from '../sanitize.js';
import { SURFACE_ALLOWLISTS, SURFACES } from '../surface-allowlists.js';

function doc(...children: unknown[]) {
  return { type: 'doc' as const, content: children };
}
function p(text: string, marks?: unknown[]) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
  };
}
function node(type: string, attrs?: Record<string, unknown>) {
  return { type, ...(attrs ? { attrs } : {}) };
}

// ── public-update ─────────────────────────────────────────────────────────────

describe('sanitizeTipTap (public-update)', () => {
  const surface = 'public-update' as const;

  it('accepts paragraph with bold + italic', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('hello', [{ type: 'bold' }, { type: 'italic' }])),
    });
    expect(res.ok).toBe(true);
  });

  it('accepts list nodes', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc({
        type: 'bulletList',
        content: [{ type: 'listItem', content: [p('item')] }],
      }),
    });
    expect(res.ok).toBe(true);
  });

  it('rejects link mark (no link schemes on this surface)', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('click', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects attachmentRef node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('attachmentRef', { id: '00000000-0000-4000-8000-000000000001' })),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects mention node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('mention', { actor_id: '00000000-0000-4000-8000-000000000001' })),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects image node with external_image_forbidden', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('image', { src: 'https://example.com/img.png' })),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.external_image_forbidden');
  });

  it('rejects code mark (not in public-update allowlist)', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('code', [{ type: 'code' }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });
});

// ── reporter-reply ────────────────────────────────────────────────────────────

describe('sanitizeTipTap (reporter-reply)', () => {
  const surface = 'reporter-reply' as const;

  it('accepts paragraph with bold + italic + code + link marks', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('hello', [
        { type: 'bold' },
        { type: 'italic' },
        { type: 'code' },
        { type: 'link', attrs: { href: 'https://example.com' } },
      ])),
    });
    expect(res.ok).toBe(true);
  });

  it('accepts attachmentRef node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('attachmentRef', { id: '00000000-0000-4000-8000-000000000001' })),
    });
    expect(res.ok).toBe(true);
  });

  it('accepts http link (not just https)', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'http://example.com' } }])),
    });
    expect(res.ok).toBe(true);
  });

  it('rejects javascript: link', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects mention node (not on reporter-reply surface)', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('mention', { actor_id: '00000000-0000-4000-8000-000000000001' })),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects image node with external_image_forbidden', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('image', { src: 'https://example.com/img.png' })),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.external_image_forbidden');
  });
});

// ── internal-comment ──────────────────────────────────────────────────────────

describe('sanitizeTipTap (internal-comment)', () => {
  const surface = 'internal-comment' as const;

  it('accepts mention node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('mention', { actor_id: '00000000-0000-4000-8000-000000000001' })),
    });
    expect(res.ok).toBe(true);
  });

  it('accepts codeBlock node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc({ type: 'codeBlock', content: [{ type: 'text', text: 'console.log("hi")' }] }),
    });
    expect(res.ok).toBe(true);
  });

  it('accepts link mark with https', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('link', [{ type: 'link', attrs: { href: 'https://example.com' } }])),
    });
    expect(res.ok).toBe(true);
  });

  it('accepts attachmentRef node', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('attachmentRef', { id: '00000000-0000-4000-8000-000000000001' })),
    });
    expect(res.ok).toBe(true);
  });

  it('rejects javascript: link', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(p('x', [{ type: 'link', attrs: { href: 'javascript:void(0)' } }])),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });

  it('rejects image node with external_image_forbidden', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('image', { src: 'https://example.com/img.png' })),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.external_image_forbidden');
  });

  it('rejects unknown node type', () => {
    const res = sanitizeTipTap({
      surface,
      doc: doc(node('video')),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('rich_content.disallowed_node');
  });
});

// ── Static drift assertions ────────────────────────────────────────────────────

describe('surface allowlist drift assertions', () => {
  it.each(SURFACES)('%s: every nodeAttrs key must be in nodes set', (surface) => {
    const allowlist = SURFACE_ALLOWLISTS[surface];
    const nodeAttrKeys = Object.keys(allowlist.nodeAttrs);
    for (const key of nodeAttrKeys) {
      expect(allowlist.nodes.has(key),
        `surface '${surface}': nodeAttrs key '${key}' not in nodes set`,
      ).toBe(true);
    }
  });

  it.each(SURFACES)('%s: every markAttrs key must be in marks set', (surface) => {
    const allowlist = SURFACE_ALLOWLISTS[surface];
    const markAttrKeys = Object.keys(allowlist.markAttrs);
    for (const key of markAttrKeys) {
      expect(allowlist.marks.has(key),
        `surface '${surface}': markAttrs key '${key}' not in marks set`,
      ).toBe(true);
    }
  });
});
