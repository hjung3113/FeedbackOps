// Authoritative server-side TipTap sanitizer (ADR-0011). The function is
// pure — no DB, no I/O — so it composes inside any tx. Result is a
// discriminated union so callers can map to ADR-0012 codes without throwing
// on validation paths.
//
// Rev 2 (issue #23): rebuilds a canonical doc (only {type, attrs?, marks?,
// text?, content?}) so unknown top-level fields cannot leak to the renderer.
// Also validates per-attr value schemas (uuid, url, bounded string).

import type { TipTapDoc } from '@fops/shared';

import { SURFACE_ALLOWLISTS, type AttrSchema, type Surface } from './surface-allowlists.js';

// ── Re-exported types (ADR-0012 closed enum — do not add codes here; see F-ADR-0012-ATTR-CODE) ──

export type RichContentErrorCode =
  | 'rich_content.disallowed_node'
  | 'rich_content.external_image_forbidden';

// fields_code differentiates sub-failure modes within a single ADR-0012 code.
// Service callers map this to fields[].code (disallowed_attr_key / invalid_attr_value).
// Undefined means the general disallowed_node case.
export type RichContentFieldsCode =
  | 'disallowed_node'
  | 'disallowed_attr_key'
  | 'invalid_attr_value';

export interface RichContentError {
  code: RichContentErrorCode;
  reason: string;
  path?: string;
  fields_code?: RichContentFieldsCode;
}

export type SanitizeResult =
  | { ok: true; doc: TipTapDoc }
  | { ok: false; error: RichContentError };

// ── Internal types ────────────────────────────────────────────────────────────

interface RawNode {
  type: string;
  content?: unknown[];
  marks?: unknown[];
  text?: unknown;
  attrs?: unknown;
  [key: string]: unknown;
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

type VisitResult = { node: CleanNode } | { error: RichContentError };

// ── UUID regex ────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Attr schema validators ────────────────────────────────────────────────────

function validateAttrValue(
  schema: AttrSchema,
  value: unknown,
): string | null /* null = ok, string = error reason */ {
  if (schema.kind === 'uuid') {
    if (typeof value !== 'string' || !UUID_RE.test(value)) {
      return `must be a valid UUID string`;
    }
    return null;
  }
  if (schema.kind === 'url') {
    if (typeof value !== 'string') {
      return `must be a string`;
    }
    if (value.length > schema.maxLen) {
      return `exceeds max length ${schema.maxLen}`;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return `not a valid URL`;
    }
    if (!schema.schemes.has(parsed.protocol)) {
      return `URL scheme ${parsed.protocol} not allowed`;
    }
    // Phishing guard (cycle-1 M1): reject embedded credentials. `https://a@evil`
    // renders as evil but reads as a — the deception vector even when XSS is closed.
    if (parsed.username !== '' || parsed.password !== '') {
      return `URL must not contain credentials`;
    }
    return null;
  }
  if (schema.kind === 'string') {
    if (schema.nullable && value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      return schema.nullable ? `must be a string or null` : `must be a string`;
    }
    if (value.length > schema.maxLen) {
      return `exceeds max length ${schema.maxLen}`;
    }
    return null;
  }
  return `unknown schema kind`;
}

// ── Plain-object guard ────────────────────────────────────────────────────────

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// ── Attrs validation ──────────────────────────────────────────────────────────

function validateAttrs(
  attrSchemas: Readonly<Record<string, AttrSchema>> | undefined,
  rawAttrs: unknown,
  basePath: string,
): { error: RichContentError } | { cleanAttrs: Record<string, unknown> } {
  // If rawAttrs is present but not a plain object → shape error.
  if (rawAttrs !== undefined && !isPlainObject(rawAttrs)) {
    return {
      error: {
        code: 'rich_content.disallowed_node',
        reason: 'attrs must be a plain object',
        path: `${basePath}.attrs`,
        // no fields_code — shape failure maps to default disallowed_node
      },
    };
  }

  const attrsObj: Record<string, unknown> = (rawAttrs as Record<string, unknown> | undefined) ?? {};

  // No schema entry → attrs must be absent or empty.
  if (!attrSchemas) {
    const keys = Object.keys(attrsObj);
    if (keys.length > 0) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `no attrs are allowed on this node/mark; found key '${keys[0]}'`,
          path: `${basePath}.attrs`,
          // no fields_code — node has no attr schema at all; treat as disallowed_node
        },
      };
    }
    return { cleanAttrs: {} };
  }

  // Schema entry exists — check required keys, unknown keys, value shape.
  // Check required first so missing-required surfaces before unknown-key.
  for (const [key, schema] of Object.entries(attrSchemas)) {
    if (schema.required && !(key in attrsObj)) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `required attr '${key}' is missing`,
          path: `${basePath}.attrs.${key}`,
          fields_code: 'invalid_attr_value',
        },
      };
    }
  }

  // Reject unknown keys.
  for (const key of Object.keys(attrsObj)) {
    if (!(key in attrSchemas)) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `attr key '${key}' is not allowed`,
          path: `${basePath}.attrs.${key}`,
          fields_code: 'disallowed_attr_key',
        },
      };
    }
  }

  // Validate present values.
  const cleanAttrs: Record<string, unknown> = {};
  for (const [key, schema] of Object.entries(attrSchemas)) {
    if (!(key in attrsObj)) {
      // Optional key absent — omit from clean output.
      continue;
    }
    const value = attrsObj[key];
    const reason = validateAttrValue(schema, value);
    if (reason !== null) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `attr '${key}' ${reason}`,
          path: `${basePath}.attrs.${key}`,
          fields_code: 'invalid_attr_value',
        },
      };
    }
    cleanAttrs[key] = value;
  }

  return { cleanAttrs };
}

// ── Main sanitizer ────────────────────────────────────────────────────────────

export function sanitizeTipTap(args: {
  surface: Surface;
  doc: TipTapDoc;
}): SanitizeResult {
  const allow = SURFACE_ALLOWLISTS[args.surface];
  const root = args.doc as unknown as RawNode;

  if (!root || root.type !== 'doc') {
    return err('rich_content.disallowed_node', 'root must be a doc node', '$');
  }

  let totalText = 0;
  let nodeCount = 0;
  let markCount = 0;

  const visitMark = (raw: unknown, path: string): { mark: CleanMark } | { error: RichContentError } => {
    markCount++;
    if (markCount > allow.maxMarks) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `max mark count exceeded (cap: ${allow.maxMarks})`,
          path,
        },
      };
    }
    if (!isPlainObject(raw) || typeof raw.type !== 'string') {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: 'mark must be a plain object with a type string',
          path,
        },
      };
    }
    const markType = raw.type;
    if (!allow.marks.has(markType)) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `mark ${markType} not allowed`,
          path,
        },
      };
    }
    const markAttrSchemas = allow.markAttrs[markType];
    const attrsResult = validateAttrs(markAttrSchemas, raw.attrs, path);
    if ('error' in attrsResult) return attrsResult;

    const cleanMark: CleanMark = { type: markType };
    if (Object.keys(attrsResult.cleanAttrs).length > 0) {
      cleanMark.attrs = attrsResult.cleanAttrs;
    }
    return { mark: cleanMark };
  };

  const visit = (raw: unknown, path: string, depth: number): VisitResult => {
    nodeCount++;
    if (nodeCount > allow.maxNodes) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `max node count exceeded (cap: ${allow.maxNodes})`,
          path,
        },
      };
    }
    if (depth > allow.maxDepth) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `max depth exceeded (cap: ${allow.maxDepth})`,
          path,
        },
      };
    }
    if (!isPlainObject(raw) || typeof raw.type !== 'string') {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: 'node must be a plain object with a type string',
          path,
        },
      };
    }

    const node = raw as RawNode;

    // 1. Image check (specific code).
    if (node.type === 'image') {
      return {
        error: {
          code: 'rich_content.external_image_forbidden',
          reason: 'image node not permitted',
          path,
        },
      };
    }

    // 2. Node type allowlist.
    if (!allow.nodes.has(node.type)) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `node ${node.type} not allowed`,
          path,
        },
      };
    }

    // 3. Atomic TipTap nodes must remain true leaves.
    if (allow.leafNodes.has(node.type) && Array.isArray(node.content) && node.content.length > 0) {
      return {
        error: {
          code: 'rich_content.disallowed_node',
          reason: `leaf node ${node.type} must not have content`,
          path: `${path}.content`,
        },
      };
    }

    // 4. Text byte cap.
    if (typeof node.text === 'string') {
      totalText += Buffer.byteLength(node.text, 'utf8');
      if (totalText > allow.maxTextBytes) {
        return {
          error: {
            code: 'rich_content.disallowed_node',
            reason: `text content exceeds max bytes (cap: ${allow.maxTextBytes})`,
            path,
          },
        };
      }
    }

    // 5. Attrs validation.
    const nodeAttrSchemas = allow.nodeAttrs[node.type];
    const attrsResult = validateAttrs(nodeAttrSchemas, node.attrs, path);
    if ('error' in attrsResult) return attrsResult;

    // 6. Marks validation (rebuild canonical mark list).
    const cleanMarks: CleanMark[] = [];
    if (Array.isArray(node.marks)) {
      for (let i = 0; i < node.marks.length; i++) {
        const markResult = visitMark(node.marks[i], `${path}.marks[${i}]`);
        if ('error' in markResult) return markResult;
        cleanMarks.push(markResult.mark);
      }
    }

    // 7. Recurse content.
    const cleanContent: CleanNode[] = [];
    if (Array.isArray(node.content)) {
      for (let i = 0; i < node.content.length; i++) {
        const childResult = visit(node.content[i], `${path}.content[${i}]`, depth + 1);
        if ('error' in childResult) return childResult;
        cleanContent.push(childResult.node);
      }
    }

    // 8. Build canonical clean node (omit empty attrs, empty marks, empty content).
    const cleanNode: CleanNode = { type: node.type };
    if (Object.keys(attrsResult.cleanAttrs).length > 0) {
      cleanNode.attrs = attrsResult.cleanAttrs;
    }
    if (typeof node.text === 'string') {
      cleanNode.text = node.text;
    }
    if (cleanMarks.length > 0) {
      cleanNode.marks = cleanMarks;
    }
    if (cleanContent.length > 0) {
      cleanNode.content = cleanContent;
    }

    return { node: cleanNode };
  };

  const rootResult = visit(root, '$', 0);
  if ('error' in rootResult) return { ok: false, error: rootResult.error };
  return { ok: true, doc: rootResult.node as unknown as TipTapDoc };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function err(code: RichContentErrorCode, reason: string, path: string): SanitizeResult {
  return { ok: false, error: { code, reason, path } };
}
