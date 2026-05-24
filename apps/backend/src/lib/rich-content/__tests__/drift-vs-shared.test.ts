// PLAN-22 C9 — drift assertion between backend SURFACE_ALLOWLISTS and the
// shared @fops/shared SHARED_ALLOWLISTS. If this test fails, someone changed
// one side without the other; align them before merging.

import { describe, expect, it } from 'vitest';
import { SHARED_ALLOWLISTS, SHARED_SURFACES } from '@fops/shared';

import { SURFACE_ALLOWLISTS, SURFACES } from '../surface-allowlists.js';

describe('backend ↔ shared allowlist drift', () => {
  it('SURFACES tuple matches SHARED_SURFACES (set equality)', () => {
    expect(new Set(SURFACES)).toEqual(new Set(SHARED_SURFACES));
  });

  it.each(['voc-description', 'reporter-reply', 'public-update', 'internal-comment'] as const)(
    '%s — node names, leaf node names, mark names, and attr key shape match shared',
    (surface) => {
      const be = SURFACE_ALLOWLISTS[surface];
      const sh = SHARED_ALLOWLISTS[surface];

      expect([...be.nodes].sort()).toEqual([...sh.nodes].sort());
      expect([...be.leafNodes].sort()).toEqual([...sh.leafNodes].sort());
      expect([...be.marks].sort()).toEqual([...sh.marks].sort());
      expect(Object.keys(be.nodeAttrs).sort()).toEqual(Object.keys(sh.nodeAttrs).sort());
      expect(Object.keys(be.markAttrs).sort()).toEqual(Object.keys(sh.markAttrs).sort());

      // Per-node attr key sets and AttrSchema.kind must match (deep enough to
      // catch a typo'd attr name on one side).
      for (const nodeType of Object.keys(sh.nodeAttrs)) {
        const sNode = sh.nodeAttrs[nodeType]!;
        const bNode = be.nodeAttrs[nodeType]!;
        expect(Object.keys(bNode).sort()).toEqual(Object.keys(sNode).sort());
        for (const k of Object.keys(sNode)) {
          expect(bNode[k]!.kind).toBe(sNode[k]!.kind);
        }
      }
      for (const markType of Object.keys(sh.markAttrs)) {
        const sMark = sh.markAttrs[markType]!;
        const bMark = be.markAttrs[markType]!;
        expect(Object.keys(bMark).sort()).toEqual(Object.keys(sMark).sort());
        for (const k of Object.keys(sMark)) {
          expect(bMark[k]!.kind).toBe(sMark[k]!.kind);
        }
      }

      expect(be.maxTextBytes).toBe(sh.maxTextBytes);
      expect(be.maxDepth).toBe(sh.maxDepth);
      expect(be.maxNodes).toBe(sh.maxNodes);
      expect(be.maxMarks).toBe(sh.maxMarks);
    },
  );
});
