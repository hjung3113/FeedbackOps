// PLAN-22 C9 — client render-time sanitizer.
// The server is authoritative (ADR-0011), but a defence-in-depth FE pass
// guards against:
//   (a) hostile JSON cached in TanStack Query that the user later sees,
//   (b) stored XSS that bypassed an older server version,
//   (c) regressions in the BE pipeline.
// Behaviour: silently drop disallowed nodes/marks/attrs; coerce hostile
// hrefs to ''; never throw.

import { describe, expect, it } from 'vitest';

import { sanitizeClient, type ClientSanitizeSurface } from '../sanitizeClient';
import type { TipTapDoc } from '../RichEditor';

const wrap = (...content: unknown[]): TipTapDoc =>
  ({ type: 'doc', content } as unknown as TipTapDoc);

const text = (t: string, marks?: unknown[]) =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t };

const para = (...content: unknown[]) => ({ type: 'paragraph', content });

describe('sanitizeClient', () => {
  const surfaces: ClientSanitizeSurface[] = ['internal-comment', 'voc-description', 'reporter-reply', 'public-update'];

  it('strips a script node', () => {
    const doc = wrap(para({ type: 'script', text: 'alert(1)' } as unknown), para(text('safe')));
    const out = sanitizeClient(doc, 'internal-comment');
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('script');
    expect(flat).toContain('safe');
  });

  it('rewrites javascript: href to empty string', () => {
    const doc = wrap(para(text('click', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])));
    const out = sanitizeClient(doc, 'internal-comment');
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('javascript:');
    expect(flat).toContain('"href":""');
  });

  it('rewrites vbscript: href to empty string', () => {
    const doc = wrap(para(text('x', [{ type: 'link', attrs: { href: 'vbscript:evil()' } }])));
    const flat = JSON.stringify(sanitizeClient(doc, 'internal-comment'));
    expect(flat).not.toContain('vbscript:');
  });

  it('strips data: href (not allowed on link surfaces)', () => {
    const doc = wrap(para(text('x', [{ type: 'link', attrs: { href: 'data:text/html,<script>1</script>' } }])));
    const flat = JSON.stringify(sanitizeClient(doc, 'internal-comment'));
    expect(flat).not.toContain('data:');
  });

  it('strips on* attr keys from any node attrs (defence in depth)', () => {
    const doc = wrap(
      para({ type: 'image', attrs: { src: 'x', onerror: 'alert(1)', onclick: 'x' } } as unknown),
    );
    const out = sanitizeClient(doc, 'internal-comment');
    const flat = JSON.stringify(out);
    expect(flat).not.toContain('onerror');
    expect(flat).not.toContain('onclick');
  });

  it('preserves valid headings, paragraphs, marks, and attachmentRef nodes', () => {
    const doc = wrap(
      para(text('hello', [{ type: 'bold' }])),
      { type: 'attachmentRef', attrs: { id: '11111111-1111-1111-1111-111111111111' } },
    );
    const out = sanitizeClient(doc, 'voc-description') as unknown as { content: unknown[] };
    expect(out.content).toHaveLength(2);
    expect(JSON.stringify(out)).toContain('attachmentRef');
    expect(JSON.stringify(out)).toContain('"type":"bold"');
  });

  it('drops disallowed mark (link on public-update)', () => {
    const doc = wrap(para(text('x', [{ type: 'link', attrs: { href: 'https://ok.example' } }])));
    const out = sanitizeClient(doc, 'public-update');
    expect(JSON.stringify(out)).not.toContain('link');
    expect(JSON.stringify(out)).toContain('"text":"x"');
  });

  it('drops unknown attr keys but keeps allowed ones', () => {
    const doc = wrap(
      para(text('x', [{ type: 'link', attrs: { href: 'https://ok.example', evil: 'yes' } }])),
    );
    const out = sanitizeClient(doc, 'internal-comment');
    const flat = JSON.stringify(out);
    expect(flat).toContain('https://ok.example');
    expect(flat).not.toContain('evil');
  });

  it('ignores prototype-pollution-shaped keys like __proto__ and constructor', () => {
    const hostile = wrap({
      type: 'paragraph',
      attrs: { __proto__: { polluted: true }, constructor: { x: 1 } },
      content: [text('hi')],
    } as unknown);
    const out = sanitizeClient(hostile, 'internal-comment');
    // Walker survived without polluting Object.prototype.
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    expect(JSON.stringify(out)).toContain('hi');
  });

  it('handles deep nesting without throwing (within cap)', () => {
    // Build 20 levels of nested bulletList > listItem > paragraph > text.
    let node: unknown = text('deep');
    for (let i = 0; i < 20; i++) {
      node = { type: 'listItem', content: [{ type: 'paragraph', content: [node] }] };
      node = { type: 'bulletList', content: [node] };
    }
    const doc = wrap(node);
    expect(() => sanitizeClient(doc, 'internal-comment')).not.toThrow();
  });

  it('coerces non-object input to empty doc rather than throwing', () => {
    const out = sanitizeClient(null as unknown as TipTapDoc, 'internal-comment');
    expect(out).toEqual({ type: 'doc', content: [] });
    const out2 = sanitizeClient({ type: 'paragraph' } as unknown as TipTapDoc, 'internal-comment');
    expect(out2.type).toBe('doc');
  });

  it.each(surfaces)('%s — empty doc round-trips to empty doc', (surface) => {
    const out = sanitizeClient({ type: 'doc', content: [] } as unknown as TipTapDoc, surface);
    expect(out.type).toBe('doc');
  });
});
