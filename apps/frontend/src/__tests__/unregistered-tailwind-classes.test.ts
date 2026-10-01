import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPOSITORY_ROOT = path.resolve(__dirname, '../../../..');
const SOURCE_DIRECTORIES = [
  path.join(REPOSITORY_ROOT, 'apps/frontend/src'),
  path.join(REPOSITORY_ROOT, 'packages/ui/src'),
];
const UNREGISTERED_CLASSES = [
  'bg-surface-selected',
  'text-feedback-error',
  'text-feedback-warning',
  'ring-ring',
] as const;
const UNREGISTERED_CLASS_PATTERN = new RegExp(`\\b(?:${UNREGISTERED_CLASSES.join('|')})\\b`, 'g');
const TEST_DIRECTORIES = new Set(['test', 'tests', '__tests__']);
const CODE_FILE_PATTERN = /\.(?:[cm]?[jt]sx?)$/;
const TEST_FILE_PATTERN = /(?:^|[.-])(?:test|spec)(?:[.-]|$)/i;

function sourceFiles(directory: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!TEST_DIRECTORIES.has(entry.name)) sourceFiles(fullPath, files);
    } else if (
      entry.isFile() &&
      CODE_FILE_PATTERN.test(entry.name) &&
      !TEST_FILE_PATTERN.test(entry.name)
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('unregistered Tailwind class guard', () => {
  it('keeps the four unregistered classes out of frontend and shared UI source', () => {
    const occurrences: string[] = [];

    for (const directory of SOURCE_DIRECTORIES) {
      for (const filePath of sourceFiles(directory)) {
        const source = fs.readFileSync(filePath, 'utf-8');
        UNREGISTERED_CLASS_PATTERN.lastIndex = 0;

        for (const match of source.matchAll(UNREGISTERED_CLASS_PATTERN)) {
          occurrences.push(`${path.relative(REPOSITORY_ROOT, filePath)}: ${match[0]}`);
        }
      }
    }

    expect(occurrences, occurrences.join('\n')).toEqual([]);
  });
});
