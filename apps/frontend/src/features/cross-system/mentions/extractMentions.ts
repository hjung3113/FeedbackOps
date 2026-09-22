// extractMentions.ts — extract and deduplicate actor_id values from TipTap doc mention nodes.
//
// C5.4 (slice3 #21)
// Spec: PLAN-21-SUBCHUNKS.md C5.4 — "No regex on rendered HTML (D-5.3)"
//
// Walks the TipTap JSON node tree, collects actor_id from `mention` nodes, and
// deduplicates. Works on raw JSONContent — no HTML serialisation or regex.

import type { TipTapDoc } from '@fops/ui';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Walk the TipTap document tree and collect unique actor_id values from all
 * `mention` nodes.  Duplicate ids are deduplicated; order is stable (first
 * occurrence wins).
 *
 * D-5.3: uses JSON tree walking, never regex on rendered HTML.
 */
export function extractMentions(doc: TipTapDoc): string[] {
  const seen = new Set<string>();
  walkNode(doc, seen);
  return Array.from(seen);
}

// ── Internal ──────────────────────────────────────────────────────────────────

// Use a local structural type to avoid importing @tiptap/core directly in the FE app.
type AnyNode = {
  type?: string;
  attrs?: Record<string, unknown> | undefined;
  content?: AnyNode[] | undefined;
};

function walkNode(node: AnyNode, seen: Set<string>): void {
  if (node.type === 'mention') {
    const actorId = node.attrs?.actor_id;
    if (typeof actorId === 'string' && actorId.length > 0) {
      seen.add(actorId);
    }
  }

  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      walkNode(child, seen);
    }
  }
}
