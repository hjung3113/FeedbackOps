// unparsed-endpoints.test.ts — #398 enforcement for the parsed API seam.
//
// Plain fs + regex scan over non-test frontend sources (same approach as
// features/integration/__tests__/no-cross-feature-imports.test.ts): comments
// are stripped with a string-aware scanner, then legacy `apiClient` calls are
// counted per file and compared against lib/api/api-unparsed-allowlist.txt.
//
// The allowlist pins the EXACT per-file call count:
//   (a) more calls than allowlisted → fail (grow requires an audit);
//   (b) calls in an unlisted file → fail (new endpoints must use apiRequest);
//   (c) fewer calls than allowlisted → fail (migrations must shrink the list,
//       so it cannot rot);
//   (d) an allowlisted file whose count fell to ZERO must be dropped (a stale
//       allowance would let a later unparsed call in that file slip in);
//   (e) lib/api/client.ts is scanned too and pinned — it defines the function
//       and must not gain new uses.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // src/lib/api/__tests__
const API_DIR = path.resolve(HERE, '..'); // src/lib/api
const SRC = path.resolve(API_DIR, '..', '..'); // src/
const ALLOWLIST_PATH = path.join(API_DIR, 'api-unparsed-allowlist.txt');

// Every identifier occurrence of the legacy `apiClient`, not just call syntax:
// `import { apiClient as x }`, `const f = apiClient`, `api.apiClient(...)` and
// wrappers all contain the token, so aliasing cannot hide a new unparsed
// endpoint. Comments are stripped first; `apiRequest` does not match.
const UNPARSED_CALL = /\bapiClient\b/g;

/**
 * Removes // and block comments with a scanner that understands string and
 * template literals (copied from
 * features/integration/__tests__/no-cross-feature-imports.test.ts). Strings
 * are preserved verbatim, so call-lookalikes inside strings still count —
 * the scanner is comment-aware, not string-blind.
 */
function stripComments(src: string): string {
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

function countUnparsedCalls(source: string): number {
  const stripped = stripComments(source);
  return [...stripped.matchAll(UNPARSED_CALL)].length;
}

function collectSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

function parseAllowlist(text: string): Map<string, number> {
  const entries = new Map<string, number>();
  for (const [index, line] of text.split('\n').entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^(.+?)\s+(\d+)$/.exec(trimmed);
    if (!match) throw new Error(`malformed allowlist line ${index + 1}: ${line}`);
    entries.set(match[1] as string, Number(match[2]));
  }
  return entries;
}

function toSrcRelative(file: string): string {
  return path.relative(SRC, file).split(path.sep).join('/');
}

describe('unparsed apiClient endpoints allowlist', () => {
  it('keeps every unparsed call inside the audited, exact-count allowlist', () => {
    const actual = new Map<string, number>();
    for (const file of collectSourceFiles(SRC)) {
      const rel = toSrcRelative(file);
      const count = countUnparsedCalls(fs.readFileSync(file, 'utf8'));
      if (count > 0) actual.set(rel, count);
    }

    const allowed = parseAllowlist(fs.readFileSync(ALLOWLIST_PATH, 'utf8'));
    const failures: string[] = [];

    for (const [file, count] of actual) {
      const pinned = allowed.get(file);
      if (pinned === undefined) {
        failures.push(
          `${file}: ${count} unparsed apiClient call(s) but the file is not in api-unparsed-allowlist.txt — migrate to apiRequest with a shared schema, or add an audited allowlist entry.`,
        );
      } else if (count > pinned) {
        failures.push(
          `${file}: ${count} unparsed apiClient call(s) > allowlisted ${pinned} — audit the new call(s) and update the entry (shrink, never grow, overall).`,
        );
      } else if (count < pinned) {
        failures.push(
          `${file}: only ${count} unparsed apiClient call(s) left but the allowlist pins ` +
            `${pinned} — shrink the entry to match.`,
        );
      }
    }
    for (const [file, pinned] of allowed) {
      if ((actual.get(file) ?? 0) === 0) {
        failures.push(
          `${file}: allowlisted with ${pinned} but no unparsed apiClient use remains — drop the entry (migrated to zero).`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});

describe('scanner self-test (the guard must not be vacuous)', () => {
  it('counts calls, imports, aliases and references of the legacy apiClient', () => {
    const source = [
      "import { apiClient } from '@/lib/api';",
      "const a = apiClient<FindingDto>('GET', '/x');",
      "const b = apiClient('GET', '/y');",
      'const c = apiClient<ListFindingsResponse>(',
      "  'GET',",
      "  '/findings',",
      ');',
    ].join('\n');
    expect(countUnparsedCalls(source)).toBe(4);
    // Aliasing / re-binding / member access cannot hide a use: the token is in the source.
    expect(countUnparsedCalls("import { apiClient as x } from '@/lib/api';\nx('GET', '/z');")).toBe(
      1,
    );
    expect(countUnparsedCalls('const f = apiClient;')).toBe(1);
    expect(countUnparsedCalls("api.apiClient('GET', '/w');")).toBe(1);
    // The parsed API and lookalike identifiers do not match.
    expect(countUnparsedCalls("apiRequest('GET', '/x', schema); const ApiClientOptions = 1;")).toBe(
      0,
    );
  });

  it('ignores calls inside // and block comments', () => {
    const source = [
      "// apiClient('GET', '/commented');",
      "/* apiClient('GET', '/also-commented'); */",
      'const real = apiClient();',
    ].join('\n');
    expect(countUnparsedCalls(source)).toBe(1);
  });

  it('counts string-literal lookalikes (documented limitation: strings are preserved)', () => {
    const source = [
      "const tip = 'call apiClient(<T>(...) instead';",
      'const template = `see apiClient( docs`;',
    ].join('\n');
    expect(countUnparsedCalls(source)).toBe(2);
  });
});
