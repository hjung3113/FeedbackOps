// Source guard for #393 — attachments routes must not own the mutation frame.
//
// modules/attachments/routes.ts used to inline `db.transaction` + the
// advisory-lock idempotency frame in the POST /attachments handler. All of
// that now lives in the application command
// (attachmentsService.uploadAttachmentCommand), which uses the shared
// core/idempotency helper. Intentionally a source-text check — the constraint
// IS textual. Comments are removed with a small scanner that understands
// string and template literals, so a `//` inside a string neither hides code
// nor is mistaken for a comment. (Scanner copied from
// modules/voc/__tests__/routes-no-frame.test.ts; not imported — the guard
// must stay self-contained per module.)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
    } else if (ch === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') {
          out += src[i] as string;
          i += 1;
        }
        out += src[i] ?? '';
        i += 1;
      }
      out += quote;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

const TRANSACTION_CALL = /\.transaction\s*(?:<[^>()]*>)?\s*\(/g;

export function findFrameOwnership(source: string): string[] {
  const code = stripComments(source);
  const hits: string[] = [];
  if (code.includes('pg_advisory_xact_lock')) hits.push('pg_advisory_xact_lock');
  if (/\bidempotencyService\b/.test(code)) hits.push('idempotencyService');
  for (const m of code.matchAll(TRANSACTION_CALL)) hits.push(m[0]);
  return hits;
}

const routesSource = readFileSync(fileURLToPath(new URL('../routes.ts', import.meta.url)), 'utf8');

describe('attachments routes.ts frame-ownership guard (#393)', () => {
  it('scanner self-test: flags real frames, ignores comments, catches spacing/generic variants', () => {
    expect(findFrameOwnership('await db.transaction(async (tx) => {})')).toHaveLength(1);
    expect(findFrameOwnership('await db.transaction (async (tx) => {})')).toHaveLength(1);
    expect(findFrameOwnership('await db.transaction<Result>(async (tx) => {})')).toHaveLength(1);
    expect(findFrameOwnership('sql`SELECT pg_advisory_xact_lock(1, 2)`')).toEqual([
      'pg_advisory_xact_lock',
    ]);
    expect(findFrameOwnership('idempotencyService.lookup(tx)')).toEqual(['idempotencyService']);
    // Comments (line, trailing, block) never count...
    expect(findFrameOwnership('// db.transaction(x)\nconst a = 1; // idempotencyService')).toEqual(
      [],
    );
    expect(findFrameOwnership('/* pg_advisory_xact_lock */ const b = 2;')).toEqual([]);
    // ...and a comment marker inside a string does not hide the code after it.
    expect(
      findFrameOwnership("const u = 'http://x'; await db.transaction(async (tx) => {});"),
    ).toHaveLength(1);
  });

  it('routes.ts owns no transaction, advisory lock, or idempotency frame', () => {
    expect(findFrameOwnership(routesSource)).toEqual([]);
  });
});
