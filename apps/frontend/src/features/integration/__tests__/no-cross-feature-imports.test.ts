// no-cross-feature-imports.test.ts — #399 step B frontend boundary guard.
//
// Plain fs + regex over feature sources (same approach as
// apps/backend/src/__tests__/module-seams.test.ts): comments are removed with
// a string-aware scanner first, then static import/export specifiers are
// anchored at line start. Alias (`@/…`) and relative (`../…`) specifiers are resolved
// importer-relative to src-relative paths; package specifiers are ignored.
//
// Rules:
//   (a) features/integration must not import features/voc|admin|tasks.
//   (b) features/voc and features/tasks must not import
//       features/integration/components/.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // src/features/integration/__tests__
const SRC = path.resolve(HERE, '..', '..', '..'); // src/
const FEATURES = path.join(SRC, 'features');

const STATIC_SPECIFIER = /^[ \t]*(?:import|export)\b[^;'"`]*?(?:\bfrom\s*)?['"]([^'"\n]+)['"]/gm;
const DYNAMIC_SPECIFIER = /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;

/**
 * Removes // and block comments with a scanner that understands string and
 * template literals, so a comment marker inside a string neither hides real
 * code nor is mistaken for a comment, and quotes inside a comment (e.g.
 * `import /* legacy "VOC" *\/ {x} from '…'`) cannot be picked up as a specifier.
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

function importSpecifiers(source: string): string[] {
  const code = stripComments(source);
  return [
    ...[...code.matchAll(STATIC_SPECIFIER)].map((m) => m[1] as string),
    ...[...code.matchAll(DYNAMIC_SPECIFIER)].map((m) => m[1] as string),
  ];
}

/** src-relative posix path (extension-stripped) for alias/relative specifiers; null for packages. */
function resolveTarget(fromAbs: string, specifier: string): string | null {
  const base = specifier.startsWith('@/')
    ? path.join(SRC, specifier.slice(2))
    : specifier.startsWith('.')
      ? path.resolve(path.dirname(fromAbs), specifier)
      : null;
  if (base === null) return null;
  return path
    .relative(SRC, base)
    .split(path.sep)
    .join('/')
    .replace(/\.[tj]sx?$/, '');
}

function under(target: string, prefix: string): boolean {
  return target === prefix || target.startsWith(`${prefix}/`);
}

const NON_INTEGRATION_FEATURES = ['voc', 'admin', 'tasks'] as const;

/** Specifiers in `source` (imported from `fromAbs`) that cross into voc/admin/tasks. */
function crossFeatureSpecs(source: string, fromAbs: string): string[] {
  return importSpecifiers(source).filter((spec) => {
    const target = resolveTarget(fromAbs, spec);
    return (
      target !== null &&
      NON_INTEGRATION_FEATURES.some((feature) => under(target, `features/${feature}`))
    );
  });
}

interface IntegrationImport {
  feature: 'voc' | 'tasks';
  rel: string;
  spec: string;
  target: string;
}

/** Integration-internal targets imported from voc/tasks sources. */
function integrationTargetsFromSource(
  source: string,
  fromAbs: string,
  feature: 'voc' | 'tasks',
): Omit<IntegrationImport, 'rel'>[] {
  return importSpecifiers(source)
    .map((spec) => ({ spec, target: resolveTarget(fromAbs, spec) }))
    .filter((entry): entry is { spec: string; target: string } =>
      entry.target !== null ? under(entry.target, 'features/integration') : false,
    )
    .map((entry) => ({ feature, spec: entry.spec, target: entry.target }));
}

function isTestPath(relFromFeatures: string): boolean {
  return (
    relFromFeatures.split(path.sep).includes('__tests__') ||
    /\.test\.[tj]sx?$/.test(relFromFeatures) ||
    /\.spec\.[tj]sx?$/.test(relFromFeatures)
  );
}

function listSources(feature: string): { abs: string; rel: string; source: string }[] {
  const out: { abs: string; rel: string; source: string }[] = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(full);
        continue;
      }
      if (!/\.[tj]sx?$/.test(entry.name)) continue;
      const rel = path.relative(FEATURES, full);
      if (isTestPath(rel)) continue;
      out.push({
        abs: full,
        rel: rel.split(path.sep).join('/'),
        source: fs.readFileSync(full, 'utf8'),
      });
    }
  };
  visit(path.join(FEATURES, feature));
  return out;
}

function crossFeatureImportsFromIntegration(): { rel: string; spec: string }[] {
  const flagged: { rel: string; spec: string }[] = [];
  for (const { abs, rel, source } of listSources('integration')) {
    for (const spec of crossFeatureSpecs(source, abs)) flagged.push({ rel, spec });
  }
  return flagged;
}

function integrationImportsFromVocAndTasks(): IntegrationImport[] {
  const found: IntegrationImport[] = [];
  for (const feature of NON_INTEGRATION_FEATURES) {
    if (feature === 'admin') continue; // rule (b) covers voc/tasks only
    for (const { abs, rel, source } of listSources(feature)) {
      for (const hit of integrationTargetsFromSource(source, abs, feature)) {
        found.push({ rel, ...hit });
      }
    }
  }
  return found;
}

describe('no cross-feature imports (#399)', () => {
  it('scanner self-test: flags cross-feature fixtures, passes neutral imports', () => {
    const integrationFile = path.join(FEATURES, 'integration/components/FindingDetail/X.tsx');

    // (a) alias form
    expect(
      crossFeatureSpecs(
        `import { useVocDetail } from '@/features/voc/hooks/useVocDetail';`,
        integrationFile,
      ),
    ).toEqual(['@/features/voc/hooks/useVocDetail']);
    // (a) relative form resolves importer-relative to the same target
    expect(crossFeatureSpecs(`import { x } from '../../../voc/hooks/y';`, integrationFile)).toEqual(
      ['../../../voc/hooks/y'],
    );
    // export-from counts too; lib/cross-system and intra-feature do not
    expect(
      crossFeatureSpecs(`export { x } from '@/features/tasks/list/Y';`, integrationFile),
    ).toHaveLength(1);
    expect(crossFeatureSpecs(`import { apiClient } from '@/lib/api';`, integrationFile)).toEqual(
      [],
    );
    expect(
      crossFeatureSpecs(`import { FitBadge } from './detail-primitives';`, integrationFile),
    ).toEqual([]);
    // multi-line import + dynamic import are covered (fixture strings exercising
    // the scanner's specifier forms — not real module loads)
    expect(
      crossFeatureSpecs(
        `import {\n  a,\n  b as c,\n} from '@/features/admin/x/y';`,
        integrationFile,
      ),
    ).toHaveLength(1);
    expect(
      crossFeatureSpecs(`const m = await import('@/features/voc/z');`, integrationFile),
    ).toHaveLength(1);

    // Comment handling: a quoted word inside an inline block comment must not
    // be mistaken for the specifier, import-looking text inside comments must
    // not match, and a comment marker inside a string must not erase real code.
    expect(
      crossFeatureSpecs(
        `import /* legacy "VOC" */ { x } from '@/features/voc/x';`,
        integrationFile,
      ),
    ).toEqual(['@/features/voc/x']);
    expect(
      crossFeatureSpecs(
        `/*\nimport { x } from '@/features/voc/x';\n*/\n// import { y } from '@/features/admin/y';`,
        integrationFile,
      ),
    ).toEqual([]);
    expect(
      crossFeatureSpecs(
        `const start = '/*';\nimport { x } from '@/features/voc/x';\nconst end = '*/';`,
        integrationFile,
      ),
    ).toEqual(['@/features/voc/x']);

    const vocFile = path.join(FEATURES, 'voc/components/detail/Y.tsx');
    expect(
      integrationTargetsFromSource(
        `import { CreateFindingModal } from '@/features/integration/components/FindingDetail/CreateFindingModal';`,
        vocFile,
        'voc',
      ),
    ).toEqual([
      {
        feature: 'voc',
        spec: '@/features/integration/components/FindingDetail/CreateFindingModal',
        target: 'features/integration/components/FindingDetail/CreateFindingModal',
      },
    ]);
    // the documented exception targets hooks/, never components/
    expect(
      integrationTargetsFromSource(
        `import { useFindingDetail } from '@/features/integration/hooks/useFindingDetail';`,
        path.join(FEATURES, 'tasks/routes/task-requests/Z.tsx'),
        'tasks',
      ),
    ).toEqual([
      {
        feature: 'tasks',
        spec: '@/features/integration/hooks/useFindingDetail',
        target: 'features/integration/hooks/useFindingDetail',
      },
    ]);
  });

  it('features/integration imports no voc/admin/tasks internals', () => {
    expect(crossFeatureImportsFromIntegration()).toEqual([]);
  });

  it('features/voc imports no integration internals', () => {
    const fromVoc = integrationImportsFromVocAndTasks().filter((e) => e.feature === 'voc');
    expect(fromVoc).toEqual([]);
  });

  it('features/tasks imports no integration internals', () => {
    const fromTasks = integrationImportsFromVocAndTasks().filter((e) => e.feature === 'tasks');
    expect(fromTasks).toEqual([]);
  });

  it('no voc/tasks file imports integration components', () => {
    const components = integrationImportsFromVocAndTasks().filter((e) =>
      under(e.target, 'features/integration/components'),
    );
    expect(components).toEqual([]);
  });
});
