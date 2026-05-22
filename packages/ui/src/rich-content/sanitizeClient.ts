// PLAN-22 C9 — client render-time defence-in-depth sanitizer.
//
// The backend sanitizer (apps/backend/src/lib/rich-content/sanitize.ts) is
// authoritative per ADR-0011 and rejects hostile payloads at the API boundary.
// This module runs in the renderer as a belt-and-suspenders layer that guards
// against:
//   (a) hostile JSON cached client-side (TanStack Query) that bypasses a fresh
//       server validation pass,
//   (b) stored XSS that slipped through an older server version,
//   (c) future regressions in the server pipeline.
//
// Differs from the server sanitizer in two important ways:
//   1. NEVER throws and never returns an error union. Disallowed nodes/marks/
//      attrs are silently dropped. Hostile hrefs are coerced to ''. The
//      renderer should always have *something* to render, never an exception.
//   2. Walks plain JSON only — no DOM access, no @tiptap deps required at
//      import time. Pure function; safe under SSR.
//
// Decision (PLAN-22 §C9): hand-rolled walker rather than isomorphic-dompurify
// because (a) we already own the JSON-shape allowlist, (b) DOMPurify operates
// on serialized HTML so we would re-render + re-parse, (c) the test surface is
// the JSON we already validate on the server.

// ADR-0016: @fops/ui MUST NOT import @fops/shared. The allowlist values are
// duplicated locally and kept in lockstep via drift tests on both sides
// (backend↔shared and ui↔inline-fixture).
import {
  UI_ALLOWLISTS,
  type AttrSchema,
  type UISurface,
} from './allowlist-local';

import type { TipTapDoc } from './RichEditor';

// ── Public types ─────────────────────────────────────────────────────────────

export type ClientSanitizeSurface = UISurface;

// ── Constants ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Keys that JS engines treat specially; if these appeared in attrs at all, we
// refuse to copy them so we cannot accidentally write a polluted object.
const FORBIDDEN_ATTR_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// ── Internal types ───────────────────────────────────────────────────────────

interface RawNode {
  type?: unknown;
  attrs?: unknown;
  marks?: unknown;
  text?: unknown;
  content?: unknown;
}

interface CleanMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface CleanNode {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: CleanMark[];
  content?: CleanNode[];
}

// ── Guards ───────────────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── Attr validation (silent: returns the cleaned object) ─────────────────────

function cleanAttrs(
  attrSchemas: Readonly<Record<string, AttrSchema>> | undefined,
  rawAttrs: unknown,
): Record<string, unknown> {
  if (!isPlainObject(rawAttrs)) return {};
  if (!attrSchemas) return {};

  const out: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(attrSchemas)) {
    if (FORBIDDEN_ATTR_KEYS.has(key)) continue;
    // own-property only — defends against `__proto__` shenanigans.
    if (!Object.prototype.hasOwnProperty.call(rawAttrs, key)) continue;

    const value = rawAttrs[key];
    const coerced = coerceAttrValue(schema, value, key);
    if (coerced === DROP) continue;
    out[key] = coerced;
  }
  return out;
}

const DROP = Symbol('drop');

function coerceAttrValue(schema: AttrSchema, value: unknown, key: string): unknown {
  if (schema.kind === 'uuid') {
    if (typeof value === 'string' && UUID_RE.test(value)) return value;
    return DROP;
  }
  if (schema.kind === 'url') {
    // Defence-in-depth href coercion. The server already rejected hostile
    // schemes; here we coerce-to-empty so the renderer never emits an
    // executable URL even if cached JSON slipped past validation.
    if (typeof value !== 'string') return key === 'href' ? '' : DROP;
    if (value.length > schema.maxLen) return key === 'href' ? '' : DROP;
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      // Relative URLs and fragments are not full URLs but are safe to render.
      // The link extension in our renderer accepts them. Allow through if
      // they are clearly not script schemes.
      const lower = value.trim().toLowerCase();
      if (lower.startsWith('javascript:') || lower.startsWith('vbscript:') || lower.startsWith('data:')) {
        return key === 'href' ? '' : DROP;
      }
      return value;
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return key === 'href' ? '' : DROP;
    }
    if (!schema.schemes.has(parsed.protocol)) {
      return key === 'href' ? '' : DROP;
    }
    return value;
  }
  if (schema.kind === 'string') {
    if (schema.nullable && value === null) return null;
    if (typeof value !== 'string') return DROP;
    if (value.length > schema.maxLen) return DROP;
    return value;
  }
  return DROP;
}

// ── Mark walker ──────────────────────────────────────────────────────────────

function cleanMark(
  raw: unknown,
  allowedMarks: ReadonlySet<string>,
  markAttrSchemas: Readonly<Record<string, Readonly<Record<string, AttrSchema>>>>,
): CleanMark | null {
  if (!isPlainObject(raw)) return null;
  if (typeof raw.type !== 'string') return null;
  const markType = raw.type;
  if (!allowedMarks.has(markType)) return null;

  const schemas = markAttrSchemas[markType];
  const attrs = cleanAttrs(schemas, raw.attrs);

  const out: CleanMark = { type: markType };
  if (Object.keys(attrs).length > 0) out.attrs = attrs;
  return out;
}

// ── Node walker ──────────────────────────────────────────────────────────────

interface WalkCtx {
  surface: ClientSanitizeSurface;
  nodeCount: number;
  markCount: number;
  textBytes: number;
}

const EMPTY_DOC: TipTapDoc = { type: 'doc', content: [] } as unknown as TipTapDoc;

function cleanNode(raw: unknown, depth: number, ctx: WalkCtx): CleanNode | null {
  const allow = UI_ALLOWLISTS[ctx.surface];

  if (depth > allow.maxDepth) return null;
  if (!isPlainObject(raw)) return null;

  const node = raw as RawNode;
  if (typeof node.type !== 'string') return null;

  // image is always dropped — there is no allowed image node on any surface.
  if (node.type === 'image') return null;
  if (!allow.nodes.has(node.type)) return null;

  ctx.nodeCount++;
  if (ctx.nodeCount > allow.maxNodes) return null;

  // text byte cap (defence-in-depth; truncate by dropping further text).
  let text: string | undefined;
  if (typeof node.text === 'string') {
    const bytes = new TextEncoder().encode(node.text).length;
    if (ctx.textBytes + bytes > allow.maxTextBytes) return null;
    ctx.textBytes += bytes;
    text = node.text;
  }

  const attrs = cleanAttrs(allow.nodeAttrs[node.type], node.attrs);

  const marks: CleanMark[] = [];
  if (Array.isArray(node.marks)) {
    for (const rawMark of node.marks) {
      if (ctx.markCount >= allow.maxMarks) break;
      const m = cleanMark(rawMark, allow.marks, allow.markAttrs);
      if (m) {
        marks.push(m);
        ctx.markCount++;
      }
    }
  }

  const content: CleanNode[] = [];
  if (Array.isArray(node.content)) {
    for (const child of node.content) {
      const c = cleanNode(child, depth + 1, ctx);
      if (c) content.push(c);
    }
  }

  // Required-attr enforcement: drop the node if a required attr did not
  // survive cleaning. Mirrors server behaviour and avoids rendering a node
  // missing its key (e.g. attachmentRef without `id`).
  const nodeAttrSchemas = allow.nodeAttrs[node.type];
  if (nodeAttrSchemas) {
    for (const [key, schema] of Object.entries(nodeAttrSchemas)) {
      if (schema.required && !(key in attrs)) return null;
    }
  }

  const out: CleanNode = { type: node.type };
  if (Object.keys(attrs).length > 0) out.attrs = attrs;
  if (text !== undefined) out.text = text;
  if (marks.length > 0) out.marks = marks;
  if (content.length > 0) out.content = content;
  return out;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Walks a TipTap JSON document and returns a cleaned copy honoring the
 * `surface` allowlist. Never throws. Hostile hrefs coerce to ''.
 * Unrecognised input shapes coerce to an empty `doc`.
 */
export function sanitizeClient(doc: TipTapDoc, surface: ClientSanitizeSurface): TipTapDoc {
  if (!UI_ALLOWLISTS[surface]) return EMPTY_DOC;
  if (!isPlainObject(doc as unknown)) return EMPTY_DOC;

  const ctx: WalkCtx = { surface, nodeCount: 0, markCount: 0, textBytes: 0 };
  const cleaned = cleanNode(doc, 0, ctx);
  if (!cleaned || cleaned.type !== 'doc') return EMPTY_DOC;
  return cleaned as unknown as TipTapDoc;
}
