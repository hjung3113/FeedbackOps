// Authoritative server-side TipTap sanitizer (ADR-0011). The function is
// pure — no DB, no I/O — so it composes inside any tx. Result is a
// discriminated union so callers can map to ADR-0012 codes without throwing
// on validation paths.

import type { TipTapDoc } from '@fops/shared';

import { SURFACE_ALLOWLISTS, type Surface } from './surface-allowlists.js';

export type RichContentErrorCode =
  | 'rich_content.disallowed_node'
  | 'rich_content.external_image_forbidden';

export interface RichContentError {
  code: RichContentErrorCode;
  reason: string;
  path?: string;
}

export type SanitizeResult =
  | { ok: true; doc: TipTapDoc }
  | { ok: false; error: RichContentError };

interface Node {
  type: string;
  content?: Node[];
  marks?: Mark[];
  text?: string;
  attrs?: Record<string, unknown>;
}
interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

export function sanitizeTipTap(args: {
  surface: Surface;
  doc: TipTapDoc;
}): SanitizeResult {
  const allow = SURFACE_ALLOWLISTS[args.surface];
  const root = args.doc as unknown as Node;

  if (!root || root.type !== 'doc') {
    return err('rich_content.disallowed_node', 'root must be a doc node', '$');
  }

  let totalText = 0;
  const visit = (node: Node, path: string): RichContentError | null => {
    if (node.type === 'image') {
      return { code: 'rich_content.external_image_forbidden', reason: 'image node not permitted', path };
    }
    if (!allow.nodes.has(node.type)) {
      return { code: 'rich_content.disallowed_node', reason: `node ${node.type} not allowed`, path };
    }
    if (typeof node.text === 'string') {
      totalText += Buffer.byteLength(node.text, 'utf8');
      if (totalText > allow.maxTextBytes) {
        return { code: 'rich_content.disallowed_node', reason: 'text content exceeds 50KB cap', path };
      }
    }
    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (!allow.marks.has(mark.type)) {
          return { code: 'rich_content.disallowed_node', reason: `mark ${mark.type} not allowed`, path };
        }
        if (mark.type === 'link') {
          const href = typeof mark.attrs?.href === 'string' ? mark.attrs.href : '';
          const schemeMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
          const scheme = schemeMatch?.[1] ? `${schemeMatch[1].toLowerCase()}:` : '';
          if (!scheme || !allow.allowedLinkSchemes.has(scheme)) {
            return {
              code: 'rich_content.disallowed_node',
              reason: `link scheme ${scheme || '<missing>'} not allowed`,
              path,
            };
          }
        }
      }
    }
    if (Array.isArray(node.content)) {
      for (let i = 0; i < node.content.length; i++) {
        const child = visit(node.content[i] as Node, `${path}.content[${i}]`);
        if (child) return child;
      }
    }
    return null;
  };

  const error = visit(root, '$');
  if (error) return { ok: false, error };
  return { ok: true, doc: args.doc };
}

function err(code: RichContentErrorCode, reason: string, path: string): SanitizeResult {
  return { ok: false, error: { code, reason, path } };
}
