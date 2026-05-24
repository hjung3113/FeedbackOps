// PLAN-22 C9 RED — shared allowlist constants.
// The shared layer is the single source of truth for per-surface node/mark/attr
// allowlists. The backend imports and adapts it; the FE sanitizer mirrors it
// locally because ADR-0016 forbids @fops/ui -> @fops/shared imports.

import { describe, expect, it } from 'vitest';

import {
  SHARED_ALLOWLISTS,
  SHARED_RICH_CONTENT_EXTENSION_CAPABILITIES,
  SHARED_SURFACES,
  getExtensionsForSurface,
  type SharedAllowlists,
  type SharedSurface,
} from '../allowlist.js';

describe('shared rich-content allowlist', () => {
  it('SHARED_SURFACES tuple has 4 entries', () => {
    expect(SHARED_SURFACES).toHaveLength(4);
    expect(SHARED_SURFACES).toContain('voc-description');
    expect(SHARED_SURFACES).toContain('reporter-reply');
    expect(SHARED_SURFACES).toContain('public-update');
    expect(SHARED_SURFACES).toContain('internal-comment');
  });

  it('each surface defines nodes, leafNodes, marks, nodeAttrs, markAttrs maps', () => {
    for (const surface of SHARED_SURFACES) {
      const a = SHARED_ALLOWLISTS[surface];
      expect(a).toBeDefined();
      expect(a.nodes instanceof Set).toBe(true);
      expect(a.leafNodes instanceof Set).toBe(true);
      expect(a.marks instanceof Set).toBe(true);
      expect(typeof a.nodeAttrs).toBe('object');
      expect(typeof a.markAttrs).toBe('object');
      expect(a.allowedLinkSchemes instanceof Set).toBe(true);
      expect(typeof a.maxTextBytes).toBe('number');
      expect(typeof a.maxDepth).toBe('number');
      expect(typeof a.maxNodes).toBe('number');
      expect(typeof a.maxMarks).toBe('number');
    }
  });

  it('AttrSchema variants cover uuid, url, string', () => {
    // attachmentRef.id is uuid; link.href is url; codeBlock.language is string-nullable.
    const ic = SHARED_ALLOWLISTS['internal-comment'];
    expect(ic.nodeAttrs.attachmentRef?.id?.kind).toBe('uuid');
    expect(ic.markAttrs.link?.href?.kind).toBe('url');
    expect(ic.nodeAttrs.codeBlock?.language?.kind).toBe('string');
  });

  it('public-update has no link mark and no attachmentRef node', () => {
    const pu = SHARED_ALLOWLISTS['public-update'];
    expect(pu.marks.has('link')).toBe(false);
    expect(pu.nodes.has('attachmentRef')).toBe(false);
    expect(pu.leafNodes.has('attachmentRef')).toBe(false);
    expect(pu.allowedLinkSchemes.size).toBe(0);
  });

  it('surface extension capabilities match the surface contract', () => {
    expect(SHARED_RICH_CONTENT_EXTENSION_CAPABILITIES).toEqual([
      'bold',
      'italic',
      'underline',
      'code',
      'list',
      'link',
      'mention',
      'attachmentRef',
    ]);
    expect(getExtensionsForSurface('voc-description')).toEqual([
      'bold',
      'italic',
      'underline',
      'code',
      'list',
      'link',
      'attachmentRef',
    ]);
    expect(getExtensionsForSurface('reporter-reply')).toEqual([
      'bold',
      'italic',
      'link',
      'attachmentRef',
    ]);
    expect(getExtensionsForSurface('public-update')).toEqual(['bold', 'italic', 'list']);
    expect(getExtensionsForSurface('internal-comment')).toEqual([
      'bold',
      'italic',
      'code',
      'list',
      'link',
      'mention',
      'attachmentRef',
    ]);
  });

  it('attachmentRef and mention are leaf nodes wherever they are allowed', () => {
    for (const surface of SHARED_SURFACES) {
      const a = SHARED_ALLOWLISTS[surface];
      if (a.nodes.has('attachmentRef')) {
        expect(a.leafNodes.has('attachmentRef')).toBe(true);
      }
      if (a.nodes.has('mention')) {
        expect(a.leafNodes.has('mention')).toBe(true);
      }
    }
  });

  it('SharedAllowlists type accepts the exported map', () => {
    const x: SharedAllowlists = SHARED_ALLOWLISTS;
    const s: SharedSurface = 'voc-description';
    expect(x[s]).toBeDefined();
  });
});
