/**
 * Slice 3 #22 — Vite proxy completeness check.
 *
 * Every root prefix served by the backend MUST be either:
 *   (a) registered in `apps/frontend/vite.config.ts` under `server.proxy`, OR
 *   (b) listed in `KNOWN_FE_ONLY` as a deliberately FE-only route that
 *       collides with a BE prefix by name (none today).
 *
 * Catches the class of drift bug where a new BE route ships without a
 * matching dev-proxy entry, breaking `pnpm dev` smoke without breaking
 * any unit test. The latest occurrence was `/attachments` (PR #75 hotfix).
 *
 * Implementation:
 *   - Parse `apps/backend/src/server.ts` for both fastify registration forms:
 *     `app.route({ url: '/x' })` and `app.get('/x', …)`.
 *   - Parse every `apps/backend/src/modules/<name>/*routes.ts` for the same.
 *   - Reduce to unique root prefixes (`/foo/bar` → `/foo`).
 *   - Assert each is a proxy key in `vite.config.ts` (or in KNOWN_FE_ONLY).
 *
 * Pure file-read assertion. No DB, no server boot. Always runs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// FE routes that intentionally collide with BE prefix names AND are served
// by the SPA on document loads (proxy entries already bypass HTML in that
// case). Start empty; add only when a real collision surfaces.
const KNOWN_FE_ONLY = new Set<string>([]);

// Root of the monorepo, derived from this file's location.
// __dirname = apps/frontend/src/__tests__  →  repoRoot = ../../../..
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const SERVER_TS = path.join(REPO_ROOT, 'apps/backend/src/server.ts');
const VITE_CONFIG = path.join(REPO_ROOT, 'apps/frontend/vite.config.ts');
const MODULES_DIR = path.join(REPO_ROOT, 'apps/backend/src/modules');

// Fastify accepts two registration forms and this repo uses both: the object
// form `app.route({ url: '/x' })` and the method shorthand `app.get('/x', …)`
// (the latter only in `modules/surveys/routes.ts` today). A form this check
// cannot see is a backend prefix it never demands a proxy entry for — and
// unlike the twin check in `apps/backend/src/__tests__/fe-call-endpoints-exist.test.ts`,
// which goes red, a miss here is silently green (#206). Keep both forms.
const ROUTE_URL_PATTERNS: readonly RegExp[] = [
  /url:\s*['"`](\/[A-Za-z0-9/_\-:]*)['"`]/g,
  /\b(?:app|fastify)\.(?:get|post|put|patch|delete|head|options|all)\(\s*['"`](\/[A-Za-z0-9/_\-:]*)['"`]/g,
];

function extractRouteUrls(source: string): string[] {
  const out: string[] = [];
  for (const re of ROUTE_URL_PATTERNS) {
    for (const m of source.matchAll(re)) {
      if (m[1]) out.push(m[1]);
    }
  }
  return out;
}

function collectBackendRoutes(): string[] {
  const urls: string[] = [];
  urls.push(...extractRouteUrls(fs.readFileSync(SERVER_TS, 'utf8')));
  // Walk apps/backend/src/modules/*/routes.ts AND *-routes.ts naming variants
  // (e.g. `auth/list-actors-routes.ts`), matching the twin check's discovery.
  for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = path.join(MODULES_DIR, entry.name);
    for (const fileEntry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('routes.ts')) continue;
      urls.push(...extractRouteUrls(fs.readFileSync(path.join(moduleDir, fileEntry.name), 'utf8')));
    }
  }
  return urls;
}

function rootPrefix(url: string): string {
  // '/vocs/:id/conversation' → '/vocs'   '/me' → '/me'   '/me/permissions/check' → '/me'
  const seg = url.split('/').filter(Boolean)[0];
  return seg ? `/${seg}` : '/';
}

function parseProxyKeys(viteConfig: string): Set<string> {
  // Find the `proxy: { ... }` block (single occurrence) and pull every
  // top-level string-quoted key. Robust against per-entry object/string
  // values because we only consume keys.
  const blockMatch = viteConfig.match(/proxy:\s*{([\s\S]*?)},\s*}/);
  expect(blockMatch, 'could not find server.proxy block in vite.config.ts').toBeTruthy();
  const block = blockMatch?.[1] ?? '';
  const keys = new Set<string>();
  // Keys at the start of a line (after whitespace), quoted.
  for (const m of block.matchAll(/^\s*['"](\/[A-Za-z0-9/_\-:]*)['"]\s*:/gm)) {
    if (m[1]) keys.add(m[1]);
  }
  return keys;
}

describe('Vite dev proxy completeness (Slice 3 #22)', () => {
  // A registration form this check cannot parse is a prefix it never demands a
  // proxy entry for, and the omission looks like a pass (#206).
  it('discovers both fastify registration forms', () => {
    const urls = extractRouteUrls(
      [
        "app.route({ method: 'GET', url: '/object-form' });",
        "app.get('/shorthand', { preHandler: pre }, handler);",
        'app.post(`/shorthand/:id/nested`, handler);',
        "cache.get('not-a-route');",
        "map.get('/looks-like-a-path-but-is-not-fastify');",
      ].join('\n'),
    );
    expect(new Set(urls)).toEqual(new Set(['/object-form', '/shorthand', '/shorthand/:id/nested']));
  });

  it('discovers the shorthand-registered routes in the real backend source', () => {
    // `modules/surveys/routes.ts` is the repo's only shorthand user today.
    expect(new Set(collectBackendRoutes().map(rootPrefix)).has('/surveys')).toBe(true);
  });

  it('every BE root prefix has a matching vite proxy entry (or is in KNOWN_FE_ONLY)', () => {
    const backendUrls = collectBackendRoutes();
    expect(backendUrls.length, 'should discover at least one BE route').toBeGreaterThan(0);

    const backendPrefixes = new Set(backendUrls.map(rootPrefix));
    const proxyKeys = parseProxyKeys(fs.readFileSync(VITE_CONFIG, 'utf8'));

    const missing: string[] = [];
    for (const prefix of backendPrefixes) {
      if (proxyKeys.has(prefix)) continue;
      if (KNOWN_FE_ONLY.has(prefix)) continue;
      missing.push(prefix);
    }

    expect(
      missing,
      `add the following prefix(es) to apps/frontend/vite.config.ts server.proxy ` +
        `or KNOWN_FE_ONLY: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});
