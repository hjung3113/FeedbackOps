// Pre-bundles the Drizzle schema (src/db/schema/index.ts) to a single CJS file
// at .drizzle-schema/schema.cjs so drizzle-kit can load it. drizzle-kit 0.30.1
// compiles TS in place via esbuild-register (CJS require) and cannot resolve the
// `.js` specifiers NodeNext requires for cross-file `.ts` imports, so
// `drizzle-kit generate` against the raw sources fails with
// "Cannot find module './core.js'" (issue #422). esbuild bundles the import
// graph itself, resolving `.js` -> `.ts` during bundling, and keeps bare
// imports (drizzle-orm) external.
//
// esbuild is not a direct dependency of @fops/backend, but drizzle-kit depends
// on it; resolve it through drizzle-kit's location so the versions stay pinned
// together. Output lives in a gitignored directory and is regenerated on every
// db:generate run, so it can never go stale for generate.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(backendDir, '.drizzle-schema', 'schema.cjs');

const require = createRequire(import.meta.url);
const drizzleKitPath = require.resolve('drizzle-kit');
const esbuild = createRequire(drizzleKitPath)('esbuild');

try {
  esbuild.buildSync({
    entryPoints: [join(backendDir, 'src', 'db', 'schema', 'index.ts')],
    outfile,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node22',
    // Keep drizzle-orm external: the bundle is required by drizzle-kit's CJS
    // loader, and bare imports resolve from the bundle's location through
    // apps/backend/node_modules — the same copy the runtime uses.
    packages: 'external',
    outExtension: { '.js': '.cjs' },
    logLevel: 'silent',
  });
} catch (error) {
  console.error(`bundle-schema: failed to bundle src/db/schema/index.ts: ${error.message}`);
  process.exit(1);
}
console.error(`bundle-schema: bundled schema -> ${outfile}`);
