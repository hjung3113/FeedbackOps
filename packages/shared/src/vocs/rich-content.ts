export function isTipTapDocStructurallyEmpty(doc: unknown): boolean {
  if (doc == null || typeof doc !== 'object') return true;
  const content = (doc as { content?: unknown[] }).content;
  if (!Array.isArray(content) || content.length === 0) return true;
  return content.every((node) => {
    if (node == null || typeof node !== 'object') return true;
    const n = node as { type?: string; content?: unknown[] };
    if (n.type !== 'paragraph') return false;
    return !Array.isArray(n.content) || n.content.length === 0;
  });
}

/**
 * Node types that carry no meaning on their own — they are the document, its
 * blocks, and its list scaffolding. Everything else (attachmentRef, mention,
 * image, and any type this list has not heard of) is content even when it has
 * no text.
 *
 * Listing the *structural* types rather than the contentful ones is deliberate.
 * The surface allowlists in `rich-content/allowlist.ts` decide which node types
 * are permitted, and they report a precise `rich_content.disallowed_node`. If
 * this predicate treated unknown types as nothing, a document made only of a
 * disallowed node would be reported as "blank" instead, and the caller would
 * lose that error — which is exactly what happened to the mention-node contract
 * test before this list was inverted.
 */
const STRUCTURAL_NODE_TYPES = new Set([
  'doc',
  'paragraph',
  'text',
  'hardBreak',
  'heading',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
]);

export function isTipTapDocBlank(doc: unknown): boolean {
  let text = '';
  let hasContentNode = false;

  function visit(node: unknown): void {
    if (node == null || typeof node !== 'object' || Array.isArray(node)) return;
    const value = node as { type?: unknown; text?: unknown; content?: unknown };
    if (value.type === 'text' && typeof value.text === 'string') text += value.text;
    else if (typeof value.type === 'string' && !STRUCTURAL_NODE_TYPES.has(value.type)) {
      hasContentNode = true;
    }
    if (Array.isArray(value.content)) value.content.forEach(visit);
  }

  visit(doc);
  return !hasContentNode && text.trim().length === 0;
}
