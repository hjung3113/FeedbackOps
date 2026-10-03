import fs from 'node:fs';
/**
 * Token-class coverage: asserts no .tsx file under apps/frontend/src/ references
 * a semantic-prefix Tailwind class whose theme key is not resolvable in the
 * CSS-first theme (ADR-0058; previously tailwindcss/resolveConfig against the
 * JS preset).
 *
 * Uses node:fs walk (no fast-glob dep) to scan all .tsx files.
 * Parses `--color-*` keys out of packages/ui/src/styles/theme.css (postcss).
 */
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// ---- Theme ----
const THEME_CSS_PATH = path.resolve(__dirname, '../../../../packages/ui/src/styles/theme.css');

function parseThemeColorKeys(cssPath: string): Set<string> {
  const source = fs.readFileSync(cssPath, 'utf-8');
  const root = postcss.parse(source);
  const keys = new Set<string>();

  root.walkAtRules('theme', (atRule) => {
    atRule.walkDecls(/^--color-/, (decl) => {
      keys.add(decl.prop.replace(/^--color-/, ''));
    });
  });

  return keys;
}

// ---- Walk helpers ----
function walkTsx(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsx(full, results);
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

// ---- Token-class extraction ----
const SEMANTIC_PREFIXES = [
  'surface-',
  'text-primary',
  'text-secondary',
  'text-muted',
  'text-disabled',
  'text-danger',
  'text-warning',
  'text-success',
  'text-info',
  'text-on-accent',
  'text-inverse',
  'border-default',
  'border-subtle',
  'border-strong',
  'border-selected',
  'focus-ring',
  'accent-primary',
  'accent-info',
  'accent-warn',
  'accent-danger',
  'accent-success',
  'status-reporter-',
  'status-internal-',
  'severity-low',
  'severity-medium',
  'severity-high',
  'severity-critical',
  'confidence-low',
  'confidence-medium',
  'confidence-high',
];

// Regex to extract Tailwind-style utility class tokens
// Matches: (text|border|bg|ring|fill|stroke|from|to|via|placeholder|caret|accent|outline|divide|shadow)-(token-name)
const CLASS_REGEX =
  /\b(text|border|bg|ring|fill|stroke|from|to|via|placeholder|caret|accent|outline|divide|shadow)-([a-z][a-z0-9-]*)\b/g;

function extractSemanticClasses(source: string): Set<string> {
  const found = new Set<string>();
  CLASS_REGEX.lastIndex = 0;
  for (let m = CLASS_REGEX.exec(source); m !== null; m = CLASS_REGEX.exec(source)) {
    const full = `${m[1]}-${m[2]}`; // e.g. "bg-surface-canvas"
    const suffix = m[2] ?? ''; // e.g. "surface-canvas"
    const isOurs = SEMANTIC_PREFIXES.some((p) => suffix === p || suffix.startsWith(p));
    if (isOurs) {
      found.add(full);
    }
  }
  return found;
}

describe('token-class-coverage: all semantic Tailwind classes resolve in the theme', () => {
  const SRC_DIR = path.resolve(__dirname, '..');

  it('no unresolved semantic token classes in .tsx files', () => {
    const themeColors = parseThemeColorKeys(THEME_CSS_PATH);

    const tsxFiles = walkTsx(SRC_DIR);

    const unresolved: Array<{ file: string; className: string; colorKey: string }> = [];

    for (const filePath of tsxFiles) {
      const source = fs.readFileSync(filePath, 'utf-8');
      const classes = extractSemanticClasses(source);

      for (const cls of classes) {
        // Extract the color key: e.g. "bg-surface-canvas" → "surface-canvas"
        const colorKey = cls.replace(
          /^(text|border|bg|ring|fill|stroke|from|to|via|placeholder|caret|accent|outline|divide|shadow)-/,
          '',
        );

        // Check if the color key exists in the CSS-first theme
        if (!themeColors.has(colorKey)) {
          unresolved.push({
            file: path.relative(SRC_DIR, filePath),
            className: cls,
            colorKey,
          });
        }
      }
    }

    const message =
      unresolved.length > 0
        ? `Unresolved token classes:\n${unresolved
            .map((u) => `  ${u.className} (key: "${u.colorKey}") in ${u.file}`)
            .join('\n')}`
        : '';

    expect(unresolved, message).toHaveLength(0);
  });
});
