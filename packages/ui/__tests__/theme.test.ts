import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { describe, expect, it } from 'vitest';

// Issue #672 intent, carried over from tailwind-preset.test.ts (ADR-0058):
// the CSS-first theme (packages/ui/src/styles/theme.css) must wire the Pack 17
// typography tokens (packages/ui/src/styles/tokens.css) into Tailwind so
// `font-sans`/`font-mono` and the size utilities resolve to tokens instead of
// Tailwind defaults.
const THEME_CSS_PATH = path.resolve(__dirname, '../src/styles/theme.css');

/** Collect the custom-property declarations of every `@theme` block. */
function parseThemeDecls(cssPath: string): Map<string, string> {
  const source = fs.readFileSync(cssPath, 'utf-8');
  const root = postcss.parse(source);
  const decls = new Map<string, string>();

  root.walkAtRules('theme', (atRule) => {
    atRule.walkDecls(/^--/, (decl) => {
      decls.set(decl.prop, decl.value.trim());
    });
  });

  return decls;
}

describe('tailwind theme typography mapping', () => {
  const theme = parseThemeDecls(THEME_CSS_PATH);

  it('maps font families to the Pack 17 font tokens', () => {
    expect(theme.get('--font-sans')).toBe('var(--font-sans)');
    expect(theme.get('--font-mono')).toBe('var(--font-mono)');
  });

  // Tailwind names covered by the token scale. Sizes the documented Type
  // Scale pairs with a leading (body 1.4, heading 1.2) carry it; the rest
  // are size-only like the prototype's .text-* helpers (`initial` removes
  // Tailwind v4's default line-height companions so they inherit the body
  // leading).
  const sizes: Record<
    'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl',
    { size: string; lineHeight: string }
  > = {
    xs: { size: 'var(--text-xs)', lineHeight: 'initial' },
    sm: { size: 'var(--text-sm)', lineHeight: 'initial' },
    base: { size: 'var(--text-body)', lineHeight: 'var(--leading-normal)' },
    lg: { size: 'var(--text-lg)', lineHeight: 'initial' },
    xl: { size: 'var(--text-xl)', lineHeight: 'initial' },
    '2xl': { size: 'var(--text-heading)', lineHeight: 'var(--leading-tight)' },
  };

  it.each(Object.entries(sizes))('maps text-%s to the body-scale token', (name, expected) => {
    expect(theme.get(`--text-${name}`)).toBe(expected.size);
    expect(theme.get(`--text-${name}--line-height`)).toBe(expected.lineHeight);
  });
});
