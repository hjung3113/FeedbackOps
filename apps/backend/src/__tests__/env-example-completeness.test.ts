/**
 * Slice 3 #22 — .env.example completeness check.
 *
 * Every key in the backend `envSchema` (apps/backend/src/config.ts) MUST appear
 * in the repo-root `.env.example`. Keys with `.optional()` and/or `.default(...)`
 * are documented in `.env.example` so a fresh clone knows the full surface.
 * Keys without a default AND without `.optional()` are REQUIRED — failure to
 * list them in `.env.example` is a drift bug.
 *
 * Catches the class of bug where a new env key ships in `config.ts` but
 * `.env.example` is left stale, breaking `pnpm dev` for anyone who copies
 * the file. The latest occurrence was missing `PORT` / `WORKSPACE_ID` /
 * `AUTH_PROVIDER` (PR #99bdb5e).
 *
 * Pure file-read assertion. No DB, no env mutation. Always runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Re-import the schema in a way that doesn't require running loadConfig().
// envSchema is module-private; we re-derive the key set by parsing the same
// source file. (Alternative: export envSchema. We deliberately avoid that
// to keep config.ts API surface unchanged.)
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const CONFIG_TS = path.join(REPO_ROOT, 'apps/backend/src/config.ts');
const ENV_EXAMPLE = path.join(REPO_ROOT, '.env.example');

interface SchemaKey {
  name: string;
  required: boolean; // true = no .optional() AND no .default(...)
}

function parseEnvSchemaKeys(source: string): SchemaKey[] {
  // Locate the envSchema z.object({ ... }) block. Use the first
  // `z.object({` that follows `const envSchema`.
  const start = source.search(/const\s+envSchema\s*=\s*z\.object\(\{/);
  expect(start, 'could not locate envSchema in config.ts').toBeGreaterThanOrEqual(0);
  // Walk braces from the first '{' after `z.object(`.
  const objOpenRel = source.slice(start).search(/\{/);
  const objStart = start + objOpenRel;
  let depth = 0;
  let objEnd = -1;
  for (let i = objStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        objEnd = i;
        break;
      }
    }
  }
  expect(objEnd, 'could not find end of envSchema object literal').toBeGreaterThan(objStart);
  const body = source.slice(objStart + 1, objEnd);

  // For each top-level KEY: z.<...>, capture the KEY and the rest of its
  // chained call so we can scan for `.optional(` and `.default(`.
  // Top-level entries: a line starting with WORD: at depth 1.
  const keys: SchemaKey[] = [];
  // Split entries by scanning for `KEY:` at depth 0 within `body`.
  let i = 0;
  while (i < body.length) {
    // Skip whitespace + comment lines.
    while (i < body.length && /\s/.test(body[i] ?? '')) i += 1;
    if (i < body.length && body[i] === '/' && body[i + 1] === '/') {
      // line comment: skip to end of line
      while (i < body.length && body[i] !== '\n') i += 1;
      continue;
    }
    // Match KEY:
    const rest = body.slice(i);
    const m = rest.match(/^([A-Z_][A-Z0-9_]*)\s*:/);
    if (!m) {
      // Advance one char to keep scanning; this catches stray punctuation.
      i += 1;
      continue;
    }
    const name = m[1] ?? '';
    // Find end of this entry: scan to next top-level `,` at our current depth.
    let j = i + m[0].length;
    let d = 0;
    let inStr: '"' | "'" | null = null;
    while (j < body.length) {
      const ch = body[j] ?? '';
      if (inStr) {
        if (ch === '\\') {
          j += 2;
          continue;
        }
        if (ch === inStr) inStr = null;
        j += 1;
        continue;
      }
      if (ch === '"' || ch === "'") {
        inStr = ch;
        j += 1;
        continue;
      }
      if (ch === '(' || ch === '{' || ch === '[') d += 1;
      else if (ch === ')' || ch === '}' || ch === ']') d -= 1;
      else if (ch === ',' && d === 0) break;
      j += 1;
    }
    const entry = body.slice(i + m[0].length, j);
    const hasOptional = /\.optional\s*\(/.test(entry);
    const hasDefault = /\.default\s*\(/.test(entry);
    keys.push({ name, required: !hasOptional && !hasDefault });
    i = j + 1;
  }
  return keys;
}

function parseEnvExampleKeys(source: string): Set<string> {
  const keys = new Set<string>();
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    keys.add(line.slice(0, eq).trim());
  }
  return keys;
}

describe('.env.example completeness (Slice 3 #22)', () => {
  it('every envSchema key is documented in .env.example', () => {
    const schemaKeys = parseEnvSchemaKeys(fs.readFileSync(CONFIG_TS, 'utf8'));
    expect(schemaKeys.length, 'should discover at least one schema key').toBeGreaterThan(0);

    const exampleKeys = parseEnvExampleKeys(fs.readFileSync(ENV_EXAMPLE, 'utf8'));

    const missingRequired: string[] = [];
    const missingOptional: string[] = [];
    for (const k of schemaKeys) {
      if (exampleKeys.has(k.name)) continue;
      if (k.required) missingRequired.push(k.name);
      else missingOptional.push(k.name);
    }

    // Required keys MUST be in .env.example. Optional/defaulted keys SHOULD
    // be there too — they're the documentation surface. Both fail.
    const all = [...missingRequired, ...missingOptional];
    expect(
      all,
      `add the following key(s) to .env.example (required first, then optional/defaulted): ` +
        `required=[${missingRequired.join(', ')}] optional=[${missingOptional.join(', ')}]`,
    ).toEqual([]);
  });
});
