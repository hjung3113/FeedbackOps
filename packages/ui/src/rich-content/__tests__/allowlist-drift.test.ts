// PLAN-22 C9 fix — UI-side drift assertion for `allowlist-local.ts`.
//
// ADR-0016 forbids @fops/ui from importing @fops/shared, so this test cannot
// import the shared allowlist directly. Instead it carries an inline fixture
// describing the **shape** of the canonical shared allowlist; if the UI-local
// copy drifts (extra/missing surfaces, nodes, marks, attr keys, attr kinds,
// or DoS caps), this test fails.
//
// The companion `apps/backend/src/lib/rich-content/__tests__/drift-vs-shared
// .test.ts` enforces backend↔shared parity. Together the two tests pin all
// three copies (backend, shared, UI) in lockstep.
//
// If you change the canonical shared allowlist, update:
//   1. packages/shared/src/rich-content/allowlist.ts (canonical)
//   2. apps/backend/src/lib/rich-content/surface-allowlists.ts
//   3. packages/ui/src/rich-content/allowlist-local.ts
//   4. The EXPECTED fixture in this file.

import { describe, expect, it } from 'vitest';

import { UI_ALLOWLISTS, UI_SURFACES, type UISurface } from '../allowlist-local';

// ── Inline fixture mirroring canonical shared allowlist ──────────────────────

type AttrKind = 'uuid' | 'url' | 'string';

interface ExpectedSurface {
  nodes: string[];
  marks: string[];
  nodeAttrs: Record<string, Record<string, AttrKind>>;
  markAttrs: Record<string, Record<string, AttrKind>>;
  maxTextBytes: number;
  maxDepth: number;
  maxNodes: number;
  maxMarks: number;
}

const EXPECTED_SURFACES: readonly UISurface[] = [
  'voc-description',
  'reporter-reply',
  'public-update',
  'internal-comment',
];

const EXPECTED: Record<UISurface, ExpectedSurface> = {
  'voc-description': {
    nodes: ['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem', 'attachmentRef'],
    marks: ['bold', 'italic', 'underline', 'code', 'link'],
    nodeAttrs: { attachmentRef: { id: 'uuid' } },
    markAttrs: { link: { href: 'url' } },
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },
  'public-update': {
    nodes: ['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem'],
    marks: ['bold', 'italic'],
    nodeAttrs: {},
    markAttrs: {},
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },
  'reporter-reply': {
    nodes: ['doc', 'paragraph', 'text', 'bulletList', 'orderedList', 'listItem', 'attachmentRef'],
    marks: ['bold', 'italic', 'code', 'link'],
    nodeAttrs: { attachmentRef: { id: 'uuid' } },
    markAttrs: { link: { href: 'url' } },
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },
  'internal-comment': {
    nodes: [
      'doc', 'paragraph', 'text', 'codeBlock',
      'bulletList', 'orderedList', 'listItem',
      'mention', 'attachmentRef',
    ],
    marks: ['bold', 'italic', 'code', 'link'],
    nodeAttrs: {
      attachmentRef: { id: 'uuid' },
      mention: { actor_id: 'uuid' },
      codeBlock: { language: 'string' },
    },
    markAttrs: { link: { href: 'url' } },
    maxTextBytes: 50 * 1024,
    maxDepth: 32,
    maxNodes: 5000,
    maxMarks: 1000,
  },
};

describe('UI allowlist-local ↔ shared canonical fixture drift', () => {
  it('UI_SURFACES tuple matches expected surfaces (set equality)', () => {
    expect(new Set(UI_SURFACES)).toEqual(new Set(EXPECTED_SURFACES));
  });

  it.each(EXPECTED_SURFACES)(
    '%s — node names, mark names, attr key shape, and DoS caps match expected',
    (surface) => {
      const ui = UI_ALLOWLISTS[surface];
      const ex = EXPECTED[surface];

      expect([...ui.nodes].sort()).toEqual([...ex.nodes].sort());
      expect([...ui.marks].sort()).toEqual([...ex.marks].sort());

      expect(Object.keys(ui.nodeAttrs).sort()).toEqual(Object.keys(ex.nodeAttrs).sort());
      expect(Object.keys(ui.markAttrs).sort()).toEqual(Object.keys(ex.markAttrs).sort());

      for (const nodeType of Object.keys(ex.nodeAttrs)) {
        const eNode = ex.nodeAttrs[nodeType]!;
        const uNode = ui.nodeAttrs[nodeType]!;
        expect(Object.keys(uNode).sort()).toEqual(Object.keys(eNode).sort());
        for (const k of Object.keys(eNode)) {
          expect(uNode[k]!.kind).toBe(eNode[k]);
        }
      }
      for (const markType of Object.keys(ex.markAttrs)) {
        const eMark = ex.markAttrs[markType]!;
        const uMark = ui.markAttrs[markType]!;
        expect(Object.keys(uMark).sort()).toEqual(Object.keys(eMark).sort());
        for (const k of Object.keys(eMark)) {
          expect(uMark[k]!.kind).toBe(eMark[k]);
        }
      }

      expect(ui.maxTextBytes).toBe(ex.maxTextBytes);
      expect(ui.maxDepth).toBe(ex.maxDepth);
      expect(ui.maxNodes).toBe(ex.maxNodes);
      expect(ui.maxMarks).toBe(ex.maxMarks);
    },
  );
});
