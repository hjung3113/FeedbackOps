import { readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const forbiddenPatterns = [
  /\btoLocaleString\s*\(/g,
  /\btoLocaleDateString\s*\(/g,
  /\btoLocaleTimeString\s*\(/g,
  /\bnew\s+Intl\.DateTimeFormat\s*\(/g,
  /\bnew\s+Intl\.RelativeTimeFormat\s*\(/g,
];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) return [];

    const relativePath = relative(sourceRoot, path).replaceAll('\\', '/');
    const isTestFile = /\.(?:test|spec)\.tsx?$/.test(entry.name);
    if (
      isTestFile ||
      relativePath.startsWith('test/') ||
      relativePath.includes('/__tests__/') ||
      relativePath.startsWith('lib/format/')
    ) {
      return [];
    }
    return [path];
  });
}

describe('date and number format module guard', () => {
  it('keeps locale formatter calls inside src/lib/format', () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      return forbiddenPatterns.flatMap((pattern) => {
        pattern.lastIndex = 0;
        return [...source.matchAll(pattern)].map(
          (match) => `${relative(sourceRoot, path)}: ${match[0]}`,
        );
      });
    });

    expect(violations).toEqual([]);
  });
});
