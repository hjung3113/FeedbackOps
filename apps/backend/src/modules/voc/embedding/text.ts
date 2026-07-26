// Embedding input derivation (#168 step 3, ADR-0034 D6).
//
// A VOC's meaning is split across two columns — `vocs.title` (text) and
// `vocs.description_rich_content` (jsonb, ADR-0011 TipTap). Neither alone is
// the embedding input, so the input is *derived* here, in one pure function,
// and hashed. `voc.voc_embeddings.source_hash` stores that hash so an
// unchanged VOC is never re-sent to a paid provider.
//
// Pure: no database, no config, no I/O. Everything in this file is safe to
// call inside a transaction and directly from unit tests.

import { createHash } from 'node:crypto';

/** Nodes that end a block of prose; their siblings must not run together. */
const BLOCK_SEPARATOR = '\n';

interface RichNode {
  type?: unknown;
  text?: unknown;
  content?: unknown;
}

function isRichNode(value: unknown): value is RichNode {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Flattens an ADR-0011 TipTap document to plain text.
 *
 * Deliberately total: any shape that is not a recognisable document — null,
 * undefined, a string, a number, a truncated node — flattens to `''` rather
 * than throwing. The sanitizer (`lib/rich-content/sanitize.ts`) is the gate
 * that rejects malformed content on write; by the time a document reaches
 * embedding it is already stored, and an ingestion job must never be the thing
 * that discovers a legacy row is unparseable. Losing the description degrades
 * the embedding; throwing would retry-loop the queue forever.
 *
 * Only `text` leaves are collected. Attributes (mention ids, image URLs, link
 * hrefs) are intentionally excluded: they are identifiers, not prose, and
 * feeding them to an embedding model adds noise that shifts similarity without
 * carrying meaning.
 */
export function flattenRichContentToText(doc: unknown): string {
  const parts: string[] = [];

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (!isRichNode(node)) return;

    if (typeof node.text === 'string' && node.text.length > 0) {
      parts.push(node.text);
    }
    if (node.content !== undefined) {
      visit(node.content);
      // A container node closes a block. Emitting the separator here (rather
      // than joining leaves with a space) keeps paragraph boundaries in the
      // derived text, so two VOCs that differ only in line breaks still hash
      // differently — which is correct: they are different documents.
      parts.push(BLOCK_SEPARATOR);
    }
  };

  visit(doc);

  return parts
    .join('')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

export interface VocEmbeddingSource {
  title: string;
  descriptionRichContent: unknown;
}

/**
 * The exact string handed to `EmbeddingProvider.embed`.
 *
 * Empty/missing description: the derived text is the title alone. A VOC always
 * has a title (NOT NULL), so the derived text is never empty and every VOC is
 * embeddable — there is no "skip, nothing to embed" branch to keep consistent
 * between the write path and the backfill.
 *
 * Title and body are separated by a blank line so a title change and a body
 * change of the same words are not the same input.
 */
export function deriveVocEmbeddingText(source: VocEmbeddingSource): string {
  const title = source.title.trim();
  const body = flattenRichContentToText(source.descriptionRichContent);
  return body.length > 0 ? `${title}\n\n${body}` : title;
}

/**
 * Content fingerprint of the derived text. Equality of this hash is the whole
 * re-embed decision: same hash → the stored vector is still correct for this
 * VOC at this embedding version, so skip the provider call entirely.
 *
 * Not a security boundary — sha256 is used for stability and collision
 * resistance, not authentication.
 */
export function hashVocEmbeddingText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Convenience: derive and hash in one step. */
export function deriveVocEmbeddingInput(source: VocEmbeddingSource): {
  text: string;
  sourceHash: string;
} {
  const text = deriveVocEmbeddingText(source);
  return { text, sourceHash: hashVocEmbeddingText(text) };
}
