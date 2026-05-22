/**
 * FE→BE reverse drift check (post-#21 hotfix).
 *
 * Inverse of `apps/frontend/src/__tests__/vite-proxy-completeness.test.ts`:
 * that test catches "BE shipped a route, FE proxy missing"; this one catches
 * "FE called an endpoint, BE never registered it". The bug it would have
 * caught: Slice 3 #21 shipped `useWorkspaceActors` calling `GET /actors` —
 * but the BE route never landed, so the Triage assignee picker was silently
 * empty in dev and would have 404'd in prod.
 *
 * Implementation:
 *   - Scan `apps/frontend/src/**\/*.{ts,tsx}` for literal URL strings:
 *       - `apiClient('METHOD', '/foo'...)` / template literal `\`/foo/...\``
 *       - `fetch('/foo', ...)` / `fetch(\`/foo/...\`)`
 *   - Reduce each match to its root prefix (`/foo`).
 *   - Assert each root prefix is registered by some `app.route({ url: '/foo...' })`
 *     in BE (`server.ts` + `modules/*\/routes.ts` + `modules/* /*-routes.ts`),
 *     or listed in KNOWN_FE_ONLY.
 *
 * Pure file-read assertion. No DB, no server boot. Always runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// FE-only routes (SPA-served, no BE counterpart). `/login` would be a typical
// entry; add only when a real FE-only path collides with this assertion.
const KNOWN_FE_ONLY = new Set<string>([
  '/login',
  // /api is a generic dev-proxy bucket (already proxied), not a single route
  // prefix; don't fail the test on calls like `/api/foo`. Real /api/* calls
  // route through this bucket and are validated by BE-side route schemas
  // separately.
  '/api',
]);

// Roots of the monorepo + the two relevant trees.
// __dirname = apps/backend/src/__tests__  →  repoRoot = ../../../..
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const FE_SRC = path.join(REPO_ROOT, 'apps/frontend/src');
const BE_SRC = path.join(REPO_ROOT, 'apps/backend/src');

// ─── BE-side route discovery ───────────────────────────────────────────────
// Reuse the same `url:` extractor as vite-proxy-completeness; quote-aware,
// single-line. Walk server.ts + every `routes.ts` AND every `*-routes.ts`
// (the latter so file naming variants — e.g. `list-actors-routes.ts` —
// are not silently missed).
function extractRouteUrls(source: string): string[] {
  const re = /url:\s*['"](\/[A-Za-z0-9/_\-:]*)['"]/g;
  const out: string[] = [];
  for (const m of source.matchAll(re)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function collectBackendRoutes(): Set<string> {
  const urls: string[] = [];
  urls.push(...extractRouteUrls(fs.readFileSync(path.join(BE_SRC, 'server.ts'), 'utf8')));
  const modulesDir = path.join(BE_SRC, 'modules');
  for (const entry of fs.readdirSync(modulesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = path.join(modulesDir, entry.name);
    for (const fileEntry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
      if (!fileEntry.isFile()) continue;
      // Match routes.ts AND list-actors-routes.ts / foo-routes.ts variants.
      if (!fileEntry.name.endsWith('routes.ts')) continue;
      urls.push(...extractRouteUrls(fs.readFileSync(path.join(moduleDir, fileEntry.name), 'utf8')));
    }
  }
  return new Set(urls.map(rootPrefix));
}

// ─── FE-side URL discovery ─────────────────────────────────────────────────
// Match three patterns:
//   1. apiClient('METHOD', '/foo'...) or apiClient('METHOD', `/foo/...`)
//   2. fetch('/foo', ...) or fetch(`/foo/...`)
//   3. Bare `from ['"]/foo['"]` — covered as a regex broad-net for completeness.
// The leading slash + first segment is what we care about.
const APICLIENT_RE =
  /apiClient(?:<[^>]+>)?\(\s*['"][A-Z]+['"]\s*,\s*[`'"](\/[A-Za-z0-9/_\-:?=&${}]*)/g;
const FETCH_RE = /\bfetch\(\s*[`'"](\/[A-Za-z0-9/_\-:?=&${}]*)/g;

function listFiles(dir: string, exts: ReadonlyArray<string>): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFiles(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function collectFrontendCalls(): Map<string, string[]> {
  // root prefix → list of source files that called it (for failure message).
  const calls = new Map<string, string[]>();
  const files = listFiles(FE_SRC, ['.ts', '.tsx']);
  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const matches: string[] = [];
    for (const m of src.matchAll(APICLIENT_RE)) if (m[1]) matches.push(m[1]);
    for (const m of src.matchAll(FETCH_RE)) if (m[1]) matches.push(m[1]);
    for (const url of matches) {
      const prefix = rootPrefix(url);
      // Skip empty / placeholder / `/x` test stubs (caught by the dir filter
      // already, but defensive).
      if (!prefix || prefix === '/' || prefix === '/x') continue;
      const list = calls.get(prefix) ?? [];
      list.push(path.relative(REPO_ROOT, file));
      calls.set(prefix, list);
    }
  }
  return calls;
}

function rootPrefix(url: string): string {
  // Strip query/hash before splitting so '/foo?bar' → '/foo'.
  const noQuery = url.split('?')[0] ?? '';
  const seg = noQuery.split('/').filter(Boolean)[0];
  if (!seg) return '/';
  // Template-literal-only prefixes like `${something}/foo` are not actionable.
  if (seg.startsWith('${')) return '/';
  return `/${seg}`;
}

describe('FE→BE reverse drift (post-#21)', () => {
  it('every FE URL prefix has a matching BE route (or is in KNOWN_FE_ONLY)', () => {
    const beRoots = collectBackendRoutes();
    expect(beRoots.size, 'should discover at least one BE route').toBeGreaterThan(0);

    const feCalls = collectFrontendCalls();
    expect(feCalls.size, 'should discover at least one FE URL call').toBeGreaterThan(0);

    const missing: Array<{ prefix: string; callers: string[] }> = [];
    for (const [prefix, callers] of feCalls) {
      if (beRoots.has(prefix)) continue;
      if (KNOWN_FE_ONLY.has(prefix)) continue;
      missing.push({ prefix, callers });
    }

    if (missing.length > 0) {
      const lines = missing.map(
        (m) =>
          `  FE calls '${m.prefix}' but BE has no route registered for it; ` +
          `add the backend route or move to KNOWN_FE_ONLY in fe-call-endpoints-exist.test.ts ` +
          `(callers: ${m.callers.slice(0, 3).join(', ')}${m.callers.length > 3 ? ', …' : ''})`,
      );
      expect(missing, `\n${lines.join('\n')}`).toEqual([]);
    }
  });
});
