import { describe, expect, it } from 'vitest';
import { sanitizeTipTap } from '../sanitize.js';
import type { RichContentFieldsCode } from '../sanitize.js';

const surface = 'voc-description' as const;

function doc(...children: unknown[]) {
  return { type: 'doc' as const, content: children };
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

// ── Attr allowlist ─────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-4000-8000-000000000001';
const VALID_UUID_2 = '11111111-1111-4111-8111-111111111111';

function attachmentDoc(attrs: Record<string, unknown>) {
  return { type: 'doc' as const, content: [{ type: 'attachmentRef', attrs }] };
}
function mentionDoc(attrs: Record<string, unknown>) {
  return {
    type: 'doc' as const,
    content: [{ type: 'mention', attrs }],
  };
}
function codeBlockDoc(attrs?: Record<string, unknown>) {
  return {
    type: 'doc' as const,
    content: [{ type: 'codeBlock', ...(attrs !== undefined ? { attrs } : {}) }],
  };
}
function linkDoc(attrs: Record<string, unknown>) {
  return {
    type: 'doc' as const,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'x', marks: [{ type: 'link', attrs }] }],
      },
    ],
  };
}

describe('attr allowlist — positive cases', () => {
  it('attachmentRef with valid uuid id (voc-description)', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: attachmentDoc({ id: VALID_UUID }) });
    expect(res.ok).toBe(true);
  });

  it('mention with valid actor_id (internal-comment)', () => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: mentionDoc({ actor_id: VALID_UUID }) });
    expect(res.ok).toBe(true);
  });

  it('codeBlock with language null (internal-comment)', () => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: codeBlockDoc({ language: null }) });
    expect(res.ok).toBe(true);
  });

  it('codeBlock with language string (internal-comment)', () => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: codeBlockDoc({ language: 'ts' }) });
    expect(res.ok).toBe(true);
  });

  it('codeBlock with empty attrs {} (internal-comment)', () => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: codeBlockDoc({}) });
    expect(res.ok).toBe(true);
  });

  it('codeBlock with no attrs (internal-comment)', () => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: codeBlockDoc() });
    expect(res.ok).toBe(true);
  });

  it('link mark with https href (voc-description)', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({ href: 'https://example.com' }) });
    expect(res.ok).toBe(true);
  });

  it('link mark with http href (reporter-reply)', () => {
    const res = sanitizeTipTap({ surface: 'reporter-reply', doc: linkDoc({ href: 'http://example.com' }) });
    expect(res.ok).toBe(true);
  });

  it('paragraph with absent attrs → output has no attrs field', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: { type: 'doc', content: [{ type: 'paragraph' }] } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const para = (res.doc as { content: Array<{ attrs?: unknown }> }).content?.[0];
      expect(para).not.toHaveProperty('attrs');
    }
  });

  it('paragraph with empty attrs {} → output has no attrs field (canonical)', () => {
    const res = sanitizeTipTap({
      surface: 'voc-description',
      doc: { type: 'doc', content: [{ type: 'paragraph', attrs: {} }] } as never,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const para = (res.doc as { content: Array<{ attrs?: unknown }> }).content?.[0];
      expect(para).not.toHaveProperty('attrs');
    }
  });

  it('attachmentRef with valid uuid (reporter-reply)', () => {
    const res = sanitizeTipTap({ surface: 'reporter-reply', doc: attachmentDoc({ id: VALID_UUID }) });
    expect(res.ok).toBe(true);
  });

  it('attachmentRef with valid uuid (internal-comment)', () => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: attachmentDoc({ id: VALID_UUID_2 }) });
    expect(res.ok).toBe(true);
  });
});

describe('attr allowlist — canonical output', () => {
  it('unknown top-level field on paragraph is dropped', () => {
    const res = sanitizeTipTap({
      surface: 'voc-description',
      doc: { type: 'doc', content: [{ type: 'paragraph', foo: 'bar' }] } as never,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const para = (res.doc as { content: Array<Record<string, unknown>> }).content?.[0];
      expect(para).not.toHaveProperty('foo');
    }
  });

  it('doc is rebuilt; does not return original object reference', () => {
    const input = { type: 'doc' as const, content: [{ type: 'paragraph', extraField: 'x' }] };
    const res = sanitizeTipTap({ surface: 'voc-description', doc: input as never });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.doc).not.toBe(input);
    }
  });
});

describe('attr allowlist — negative: disallowed keys', () => {
  it.each<[string, string, Parameters<typeof sanitizeTipTap>[0], RichContentFieldsCode | undefined, string]>([
    [
      'attachmentRef with extra onclick key',
      'voc-description',
      { surface: 'voc-description', doc: attachmentDoc({ id: VALID_UUID, onclick: 'x' }) },
      'disallowed_attr_key',
      'attrs.onclick',
    ],
    [
      'paragraph with align key (no nodeAttrs entry)',
      'voc-description',
      {
        surface: 'voc-description',
        doc: { type: 'doc', content: [{ type: 'paragraph', attrs: { align: 'left' } }] } as never,
      },
      undefined,
      'attrs',
    ],
    [
      'link mark with extra target key',
      'voc-description',
      { surface: 'voc-description', doc: linkDoc({ href: 'https://example.com', target: '_blank' }) },
      'disallowed_attr_key',
      'marks[0].attrs.target',
    ],
    [
      'mention with extra label key (internal-comment)',
      'internal-comment',
      {
        surface: 'internal-comment',
        doc: mentionDoc({ actor_id: VALID_UUID, label: '<x>' }),
      },
      'disallowed_attr_key',
      'attrs.label',
    ],
  ])('%s → 422 disallowed_attr_key, path ends %s', (_label, _surf, args, expectedFieldsCode, pathSuffix) => {
    const res = sanitizeTipTap(args);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe(expectedFieldsCode);
      expect(res.error.path).toBeDefined();
      expect(res.error.path).toContain(pathSuffix);
    }
  });
});

describe('attr allowlist — negative: invalid values', () => {
  it.each<[string, Record<string, unknown>]>([
    ['non-uuid string', { id: 'not-a-uuid' }],
    ['null id', { id: null }],
    ['number id', { id: 123 }],
    ['boolean id', { id: true }],
    ['very long string (uuid regex fails)', { id: 'a'.repeat(50_000) }],
  ])('attachmentRef.id = %s → 422 invalid_attr_value', (_label, attrs) => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: attachmentDoc(attrs) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
      expect(res.error.path).toContain('attrs.id');
    }
  });

  it.each<[string, Record<string, unknown>]>([
    ['non-uuid string', { actor_id: 'not-a-uuid' }],
    ['null actor_id', { actor_id: null }],
    ['number actor_id', { actor_id: 123 }],
    ['boolean actor_id', { actor_id: true }],
  ])('mention.actor_id = %s → 422 invalid_attr_value (internal-comment)', (_label, attrs) => {
    const res = sanitizeTipTap({ surface: 'internal-comment', doc: mentionDoc(attrs) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
      expect(res.error.path).toContain('attrs.actor_id');
    }
  });

  it('link.href = javascript:alert(1) → 422 (invalid scheme)', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({ href: 'javascript:alert(1)' }) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
    }
  });

  it('link.href too long (>2048) → 422 invalid_attr_value', () => {
    const res = sanitizeTipTap({
      surface: 'voc-description',
      doc: linkDoc({ href: 'http://' + 'a'.repeat(3000) }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
    }
  });

  it('link.href = "not a url" → 422 invalid_attr_value', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({ href: 'not a url' }) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
    }
  });

  // ── Cycle-1 M1: URL credential / scheme-spoof guard ─────────────────────
  it.each([
    ['user-only', 'https://user@evil.example/path'],
    ['user+pass', 'https://user:pass@evil.example/path'],
    ['empty-user-but-password', 'https://:pass@evil.example/path'],
  ])('link.href with credentials (%s) → 422 invalid_attr_value', (_label, href) => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({ href }) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
    }
  });

  it('link.href with percent-encoded scheme attempt → 422 (URL parse normalizes scheme; %6A%61… stays in path)', () => {
    // 'java%73cript:alert(1)' — `new URL()` rejects this as no valid scheme,
    // so the URL-parse branch fails before scheme allowlist check.
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({ href: 'java%73cript:alert(1)' }) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
    }
  });

  it('link.href with IPv6 literal (https://[::1]/) → accepted (URL parses, scheme ok, no creds)', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({ href: 'https://[::1]/x' }) });
    expect(res.ok).toBe(true);
  });

  it('link.href with IDN host (xn-- punycode) → accepted', () => {
    const res = sanitizeTipTap({
      surface: 'voc-description',
      doc: linkDoc({ href: 'https://xn--80akhbyknj4f.example/path' }),
    });
    expect(res.ok).toBe(true);
  });

  it('codeBlock.language = 33-char string → 422 invalid_attr_value (internal-comment)', () => {
    const res = sanitizeTipTap({
      surface: 'internal-comment',
      doc: codeBlockDoc({ language: 'a'.repeat(33) }),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
      expect(res.error.path).toContain('attrs.language');
    }
  });
});

describe('attr allowlist — negative: attrs shape', () => {
  it.each([
    ['null', null],
    ['array', []],
    ['string', 'string'],
  ])('attachmentRef.attrs = %s → 422', (_label, badAttrs) => {
    const res = sanitizeTipTap({
      surface: 'voc-description',
      doc: { type: 'doc', content: [{ type: 'attachmentRef', attrs: badAttrs }] } as never,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.path).toContain('attrs');
    }
  });
});

describe('attr allowlist — missing required keys', () => {
  it('attachmentRef missing id → 422 invalid_attr_value', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: attachmentDoc({}) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
      expect(res.error.path).toContain('attrs.id');
    }
  });

  it('link mark missing href → 422 invalid_attr_value', () => {
    const res = sanitizeTipTap({ surface: 'voc-description', doc: linkDoc({}) });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe('rich_content.disallowed_node');
      expect(res.error.fields_code).toBe('invalid_attr_value');
      expect(res.error.path).toContain('attrs.href');
    }
  });
});
