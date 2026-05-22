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
 *   - Parse `apps/backend/src/server.ts` for top-level `app.route({ url: '/x' })`.
 *   - Parse every `apps/backend/src/modules/<name>/routes.ts` for the same.
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

function extractRouteUrls(source: string): string[] {
  // Match `url: '/...'` or `url: "/..."` inside `app.route({ ... })` /
  // `fastify.route({ ... })`. Quote-aware, single-line.
  const re = /url:\s*['"](\/[A-Za-z0-9/_\-:]*)['"]/g;
  const out: string[] = [];
  for (const m of source.matchAll(re)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function collectBackendRoutes(): string[] {
  const urls: string[] = [];
  urls.push(...extractRouteUrls(fs.readFileSync(SERVER_TS, 'utf8')));
  // Walk apps/backend/src/modules/*/routes.ts
  for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(MODULES_DIR, entry.name, 'routes.ts');
    if (fs.existsSync(candidate)) {
      urls.push(...extractRouteUrls(fs.readFileSync(candidate, 'utf8')));
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
