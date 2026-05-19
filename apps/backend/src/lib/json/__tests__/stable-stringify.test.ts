import { describe, expect, it } from 'vitest';
import { stableStringify } from '../stable-stringify.js';

describe('stableStringify', () => {
  it('produces same output regardless of key insertion order (flat object)', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
    expect(a).toBe('{"a":2,"b":1}');
  });

  it('sorts nested object keys recursively', () => {
    const a = stableStringify({ x: { b: 1, a: 2 } });
    const b = stableStringify({ x: { a: 2, b: 1 } });
    expect(a).toBe(b);
    expect(a).toBe('{"x":{"a":2,"b":1}}');
  });

  it('preserves array order — [1,2] !== [2,1]', () => {
    const a = stableStringify([1, 2]);
    const b = stableStringify([2, 1]);
    expect(a).not.toBe(b);
    expect(a).toBe('[1,2]');
    expect(b).toBe('[2,1]');
  });

  it('handles null', () => {
    expect(stableStringify(null)).toBe('null');
  });

  it('handles strings', () => {
    expect(stableStringify('hello')).toBe('"hello"');
  });

  it('handles numbers', () => {
    expect(stableStringify(42)).toBe('42');
  });

  it('handles booleans', () => {
    expect(stableStringify(true)).toBe('true');
    expect(stableStringify(false)).toBe('false');
  });

  it('handles empty object', () => {
    expect(stableStringify({})).toBe('{}');
  });

  it('handles empty array', () => {
    expect(stableStringify([])).toBe('[]');
  });

  it('handles array of objects with shuffled keys', () => {
    const a = stableStringify([{ b: 1, a: 2 }, { d: 3, c: 4 }]);
    const b = stableStringify([{ a: 2, b: 1 }, { c: 4, d: 3 }]);
    expect(a).toBe(b);
  });

  it('TipTap-like doc with shuffled attrs sorts deterministically', () => {
    const doc1 = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { id: 'abc', class: 'prose' },
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    };
    const doc2 = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          attrs: { class: 'prose', id: 'abc' },
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    };
    expect(stableStringify(doc1)).toBe(stableStringify(doc2));
  });
});
