// PLAN-22 C7b gate test — `attachment.unsupported_pending_storage_slice` is
// retired from the catalog. This guard fails fast if the string string-literal
// resurfaces anywhere in production source (apps/*/src + packages/*/src),
// catching regressions before they ship.
//
// Test-file mentions are allowed — they exist to lock in the retirement.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const RETIRED_CODE = 'attachment.unsupported_pending_storage_slice';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..');
const SCAN_ROOTS = [
  join(REPO_ROOT, 'apps', 'backend', 'src'),
  join(REPO_ROOT, 'apps', 'frontend', 'src'),
  join(REPO_ROOT, 'packages', 'shared', 'src'),
  join(REPO_ROOT, 'packages', 'ui', 'src'),
];

const IS_TEST = /__tests__\/|\.test\.[mc]?[jt]sx?$|\.spec\.[mc]?[jt]sx?$/;
const SCAN_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs'];

function* walk(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (SCAN_EXTS.some((e) => name.endsWith(e))) {
      yield full;
    }
  }
}

describe('PLAN-22 C7b retired error-code gate', () => {
  it(`'${RETIRED_CODE}' has zero references in production source`, () => {
    const hits: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of walk(root)) {
        if (IS_TEST.test(file)) continue;
        let content: string;
        try {
          content = readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        if (content.includes(RETIRED_CODE)) {
          // Allow doc-comment retirement notice that documents the retirement
          // (search for the canonical 'retired' wording).
          const lines = content.split('\n').filter((l) => l.includes(RETIRED_CODE));
          for (const line of lines) {
            // Doc-comment retirement notices are allowed (the comment exists
            // to document the retirement). Production raises/uses are not.
            const isCommentNotice =
              /^\s*(\/\/|\*|\/\*)/.test(line) &&
              (line.includes('retired') ||
                line.includes('legacy') ||
                line.includes('PLAN-22 C7b'));
            if (!isCommentNotice) {
              hits.push(`${relative(REPO_ROOT, file)}: ${line.trim()}`);
            }
          }
        }
      }
    }
    expect(hits, `unexpected production references:\n${hits.join('\n')}`).toEqual([]);
  });
});
